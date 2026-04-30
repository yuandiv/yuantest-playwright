import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { LLMConfig, AIDiagnosis, LLMStatus } from '../types';

interface CacheEntry {
  result: AIDiagnosis;
  timestamp: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  model: '',
  remark: '',
  maxTokens: 2048,
  temperature: 0.3,
};

const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

export class DiagnosisService {
  private dataDir: string;
  private config: LLMConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private log = logger.child('DiagnosisService');

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    try {
      this.config = this.loadConfig();
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private loadConfig(): LLMConfig {
    const configPath = path.join(this.dataDir, 'llm-config.json');
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      this.log.warn(
        `Failed to load LLM config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return { ...DEFAULT_CONFIG };
  }

  async saveConfig(config: LLMConfig): Promise<void> {
    this.config = config;
    this.clearCache();
    const configPath = path.join(this.dataDir, 'llm-config.json');
    try {
      await fs.promises.mkdir(this.dataDir, { recursive: true });
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.log.info('LLM config saved');
    } catch (error) {
      this.log.error(
        `Failed to save LLM config: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  getMaskedConfig(): LLMConfig {
    return { ...this.config };
  }

  private buildPrompt(
    testInfo: {
      title: string;
      error?: string;
      stackTrace?: string;
      filePath?: string;
      lineNumber?: number;
    },
    lang: string = 'zh'
  ): { system: string; user: string } {
    const isChinese = lang === 'zh';

    const system = isChinese
      ? '你是一位 Playwright 测试诊断专家。请分析测试失败原因并提供结构化诊断。' +
        '你必须只返回有效的 JSON 格式，不要使用 markdown 格式，不要代码块。' +
        'JSON 必须包含以下字段：' +
        '"summary" (字符串: 简要失败摘要), ' +
        '"rootCause" (字符串: 识别的根本原因), ' +
        '"suggestions" (字符串数组: 可操作的修复建议), ' +
        '"confidence" (0 到 1 之间的数字: 你的置信度)。' +
        '请使用中文回复。'
      : 'You are a Playwright test diagnosis expert. Analyze the test failure and provide a structured diagnosis. ' +
        'You must respond with valid JSON only, no markdown formatting, no code blocks. ' +
        'The JSON must have these fields: ' +
        '"summary" (string: brief failure summary), ' +
        '"rootCause" (string: identified root cause), ' +
        '"suggestions" (string array: actionable fix suggestions), ' +
        '"confidence" (number between 0 and 1: your confidence level). ' +
        'Please respond in English.';

    let user = isChinese ? `测试: ${testInfo.title}\n` : `Test: ${testInfo.title}\n`;
    if (testInfo.error) {
      user += isChinese ? `错误: ${testInfo.error}\n` : `Error: ${testInfo.error}\n`;
    }
    if (testInfo.stackTrace) {
      user += isChinese
        ? `堆栈跟踪:\n${testInfo.stackTrace}\n`
        : `Stack Trace:\n${testInfo.stackTrace}\n`;
    }
    if (testInfo.filePath) {
      user += isChinese ? `文件: ${testInfo.filePath}` : `File: ${testInfo.filePath}`;
      if (testInfo.lineNumber) {
        user += `:${testInfo.lineNumber}`;
      }
      user += '\n';
    }
    user += isChinese ? '\n请以 JSON 格式提供诊断结果。' : '\nProvide your diagnosis as JSON.';

    return { system, user };
  }

  private async callLLM(
    prompt: { system: string; user: string },
    config: LLMConfig
  ): Promise<string> {
    const url = `${config.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async *callLLMStream(
    prompt: { system: string; user: string },
    config: LLMConfig
  ): AsyncGenerator<string, void, unknown> {
    const url = `${config.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
            continue;
          }
          if (!trimmedLine.startsWith('data: ')) {
            continue;
          }

          const jsonStr = trimmedLine.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(responseText: string): AIDiagnosis {
    let text = responseText.trim();

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(text);
      return {
        summary: String(parsed.summary || ''),
        rootCause: String(parsed.rootCause || ''),
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
        confidence:
          typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
        model: this.config.model,
        timestamp: Date.now(),
      };
    } catch {
      this.log.warn('Failed to parse LLM response as JSON, attempting fallback extraction');
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            summary: String(parsed.summary || ''),
            rootCause: String(parsed.rootCause || ''),
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
            confidence:
              typeof parsed.confidence === 'number'
                ? Math.min(1, Math.max(0, parsed.confidence))
                : 0.5,
            model: this.config.model,
            timestamp: Date.now(),
          };
        }
      } catch {
        // fallback below
      }

      return {
        summary: responseText.slice(0, 200),
        rootCause: 'Unable to parse structured diagnosis from LLM response',
        suggestions: [],
        confidence: 0,
        model: this.config.model,
        timestamp: Date.now(),
      };
    }
  }

  private getCacheKey(testInfo: {
    title: string;
    error?: string;
    filePath?: string;
    lineNumber?: number;
  }): string {
    return `${testInfo.title}::${testInfo.error || ''}::${testInfo.filePath || ''}::${testInfo.lineNumber || ''}`;
  }

  private getFromCache(key: string): AIDiagnosis | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCache(key: string, result: AIDiagnosis): void {
    if (this.cache.size >= CACHE_MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  async diagnose(
    testInfo: {
      title: string;
      error?: string;
      stackTrace?: string;
      filePath?: string;
      lineNumber?: number;
    },
    lang: string = 'zh'
  ): Promise<AIDiagnosis> {
    if (!this.config.enabled) {
      return {
        summary: lang === 'zh' ? 'AI 诊断未启用' : 'AI diagnosis is not enabled',
        rootCause: lang === 'zh' ? 'LLM 未在配置中启用' : 'LLM is not enabled in configuration',
        suggestions:
          lang === 'zh'
            ? ['在设置中启用 LLM 以使用 AI 诊断']
            : ['Enable LLM in settings to use AI diagnosis'],
        confidence: 0,
        model: '',
        timestamp: Date.now(),
      };
    }

    const cacheKey = this.getCacheKey(testInfo) + `::${lang}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.log.debug('Returning cached diagnosis result');
      return cached;
    }

    try {
      const prompt = this.buildPrompt(testInfo, lang);
      const responseText = await this.callLLM(prompt, this.config);
      const diagnosis = this.parseResponse(responseText);
      this.setCache(cacheKey, diagnosis);
      this.log.info(`Diagnosis completed for: ${testInfo.title}`);
      return diagnosis;
    } catch (error) {
      this.log.error(`Diagnosis failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        summary: lang === 'zh' ? '诊断失败' : 'Diagnosis failed',
        rootCause: error instanceof Error ? error.message : String(error),
        suggestions:
          lang === 'zh' ? ['检查 LLM 配置和连接'] : ['Check LLM configuration and connectivity'],
        confidence: 0,
        model: this.config.model,
        timestamp: Date.now(),
      };
    }
  }

  async *diagnoseStream(
    testInfo: {
      title: string;
      error?: string;
      stackTrace?: string;
      filePath?: string;
      lineNumber?: number;
    },
    lang: string = 'zh'
  ): AsyncGenerator<string, void, unknown> {
    if (!this.config.enabled) {
      const errorMsg = lang === 'zh' ? 'AI 诊断未启用' : 'AI diagnosis is not enabled';
      yield JSON.stringify({ error: errorMsg, type: 'error' });
      return;
    }

    try {
      const prompt = this.buildPrompt(testInfo, lang);
      let fullResponse = '';

      yield JSON.stringify({ type: 'start', testTitle: testInfo.title }) + '\n';

      for await (const chunk of this.callLLMStream(prompt, this.config)) {
        fullResponse += chunk;
        yield JSON.stringify({ type: 'chunk', content: chunk }) + '\n';
      }

      const diagnosis = this.parseResponse(fullResponse);
      const cacheKey = this.getCacheKey(testInfo) + `::${lang}`;
      this.setCache(cacheKey, diagnosis);

      yield JSON.stringify({ type: 'complete', diagnosis }) + '\n';
      this.log.info(`Stream diagnosis completed for: ${testInfo.title}`);
    } catch (error) {
      this.log.error(
        `Stream diagnosis failed: ${error instanceof Error ? error.message : String(error)}`
      );
      yield JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      }) + '\n';
    }
  }

  async testConnection(config?: LLMConfig): Promise<{ success: boolean; error?: string }> {
    const testConfig = config || this.config;
    try {
      const url = `${testConfig.baseUrl}/v1/models`;
      const headers: Record<string, string> = {};
      if (testConfig.apiKey) {
        headers['Authorization'] = `Bearer ${testConfig.apiKey}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            success: false,
            error: `API returned ${response.status}: ${response.statusText}`,
          };
        }
        return { success: true };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(): Promise<LLMStatus> {
    const configured =
      this.config.enabled && this.config.baseUrl.trim() !== '' && this.config.model.trim() !== '';

    if (!configured) {
      return { configured: false, connected: false, status: 'yellow' };
    }

    const { success } = await this.testConnection();
    if (success) {
      return { configured: true, connected: true, status: 'green' };
    }
    return { configured: true, connected: false, status: 'red' };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
