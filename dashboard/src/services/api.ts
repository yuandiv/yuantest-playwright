import type { LLMConfig, LLMStatus, AIDiagnosis } from '../types';

const API_BASE = '/api/v1';

let currentLang: string = 'zh';

export function setApiLang(lang: string): void {
  currentLang = lang;
}

export function getApiLang(): string {
  return currentLang;
}

export async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const urlObj = new URL(url, 'http://localhost');
    urlObj.searchParams.set('lang', currentLang);
    const urlWithLang = urlObj.pathname + urlObj.search;
    const res = await fetch(urlWithLang);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
    return null;
  }
}

export interface StartRunResult {
  success: boolean;
  error?: string;
}

export async function startRun(options: {
  testDir?: string;
  baseURL?: string;
  version?: string;
  testIds?: string[];
  grepPattern?: string;
  tagFilter?: string[];
  testLocations?: string[];
  testFiles?: string[];
  describePattern?: string;
}): Promise<StartRunResult> {
  try {
    const res = await fetch(`${API_BASE}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function getLLMConfig(): Promise<LLMConfig | null> {
  return fetchJSON(`${API_BASE}/llm/config`);
}

export async function saveLLMConfig(config: Partial<LLMConfig>): Promise<LLMConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/llm/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to save LLM config:', e);
    return null;
  }
}

export async function getLLMStatus(): Promise<LLMStatus | null> {
  return fetchJSON(`${API_BASE}/llm/status`);
}

/** 请求AI诊断，支持传递截图、日志、浏览器等额外上下文 */
export async function requestDiagnosis(params: {
  testTitle: string;
  error: string;
  stackTrace?: string;
  file?: string;
  line?: number;
  testId?: string;
  lang?: string;
  screenshots?: string[];
  logs?: string[];
  browser?: string;
  runId?: string;
}): Promise<{ enabled: boolean; diagnosis: AIDiagnosis | null; error?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/diagnosis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to request diagnosis:', e);
    return null;
  }
}

export interface StreamDiagnosisCallbacks {
  onStart?: (testTitle: string) => void;
  onChunk?: (content: string) => void;
  onComplete?: (diagnosis: AIDiagnosis) => void;
  onError?: (error: string) => void;
}

/** 流式请求AI诊断，支持传递截图、日志、浏览器等额外上下文 */
export async function requestDiagnosisStream(
  params: {
    testTitle: string;
    error: string;
    stackTrace?: string;
    file?: string;
    line?: number;
    testId?: string;
    lang?: string;
    screenshots?: string[];
    logs?: string[];
    browser?: string;
    runId?: string;
  },
  callbacks: StreamDiagnosisCallbacks
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/diagnosis/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      callbacks.onError?.(`HTTP ${res.status}`);
      return;
    }

    if (!res.body) {
      callbacks.onError?.('Response body is null');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || !trimmedLine.startsWith('data: ')) continue;

        const jsonStr = trimmedLine.slice(6);
        try {
          const data = JSON.parse(jsonStr);

          switch (data.type) {
            case 'start':
              callbacks.onStart?.(data.testTitle);
              break;
            case 'chunk':
              callbacks.onChunk?.(data.content);
              break;
            case 'complete':
              callbacks.onComplete?.(data.diagnosis);
              break;
            case 'error':
              callbacks.onError?.(data.error);
              break;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } catch (e) {
    callbacks.onError?.(e instanceof Error ? e.message : 'Unknown error');
  }
}

export async function testLLMConnection(config: Partial<LLMConfig>): Promise<{ success: boolean; error?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/llm/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function stopRun(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/runs/stop`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRunStatus(): Promise<{ isRunning: boolean; currentRun: { id: string; version: string } | null } | null> {
  return fetchJSON(`${API_BASE}/runs/status`);
}

export async function getRuns(limit: number = 20): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/runs?limit=${limit}`);
}

export async function deleteRun(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/runs/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.text();
      console.error(`删除报告失败: ${error}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`删除报告异常: ${error}`);
    return false;
  }
}

export async function deleteAllRuns(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/runs`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.text();
      console.error(`删除所有报告失败: ${error}`);
      return { success: false, error };
    }
    const data = await res.json();
    return { success: true, count: data.count };
  } catch (error) {
    console.error(`删除所有报告异常: ${error}`);
    return { success: false, error: String(error) };
  }
}

export async function getFlakyTests(threshold: number = 0.3): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/flaky?threshold=${threshold}`);
}

export async function getQuarantinedTests(): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/flaky/quarantined`);
}

export async function releaseTest(testId: string, resetHistory: boolean = true): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/flaky/${encodeURIComponent(testId)}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetHistory }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function validateAndReleaseTest(testId: string): Promise<{ status: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/flaky/${encodeURIComponent(testId)}/validate-release`, {
      method: 'POST',
    });
    if (res.ok) {
      return res.json();
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearFlakyHistory(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/flaky/history`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRootCauseAnalysis(testId: string): Promise<any | null> {
  return fetchJSON(`${API_BASE}/flaky/${encodeURIComponent(testId)}/root-cause`);
}

export async function getCorrelations(): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/flaky/correlations`);
}

export async function getFlakyByClassification(classification?: string): Promise<any | null> {
  const query = classification ? `?classification=${encodeURIComponent(classification)}` : '';
  return fetchJSON(`${API_BASE}/flaky/by-classification${query}`);
}

export async function getAnnotations(testDir: string = './'): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/annotations?testDir=${encodeURIComponent(testDir)}`);
}

export interface DiscoveredTest {
  id: string;
  title: string;
  fullTitle: string;
  file: string;
  line: number;
  column: number;
  tags: string[];
  annotations: Array<{ type: string; description?: string }>;
}

export interface DiscoveredDescribe {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: DiscoveredTest[];
  describes: DiscoveredDescribe[];
}

export interface DiscoveredFile {
  file: string;
  title: string;
  describes: DiscoveredDescribe[];
  tests: DiscoveredTest[];
}

export interface ConfigValidationResult {
  valid: boolean;
  configPath: string | null;
  configExists: boolean;
  testDir: string | null;
  testDirAbsolute: string | null;
  error?: string;
  warnings: string[];
}

export interface TestDiscoveryResult {
  total: number;
  files: DiscoveredFile[];
  tests: DiscoveredTest[];
  configValidation?: ConfigValidationResult;
  error?: string;
  rawOutput?: string;
}

export async function getTests(testDir: string = './', configPath?: string): Promise<{
  total: number;
  tests: Array<{
    id: string;
    title: string;
    fullTitle: string;
    file: string;
    line?: number;
    column?: number;
    tags: string[];
    annotations: Array<{ type: string; description?: string }>;
  }>;
} | null> {
  let url = `${API_BASE}/tests?testDir=${encodeURIComponent(testDir)}`;
  if (configPath) {
    url += `&configPath=${encodeURIComponent(configPath)}`;
  }
  return fetchJSON(url);
}

export async function getTestsStructured(testDir: string = './', configPath?: string, forceRefresh: boolean = false): Promise<TestDiscoveryResult | null> {
  let url = `${API_BASE}/tests?testDir=${encodeURIComponent(testDir)}&structured=true`;
  if (configPath) {
    url += `&configPath=${encodeURIComponent(configPath)}`;
  }
  if (forceRefresh) {
    url += `&force=true`;
  }
  return fetchJSON(url);
}

export async function refreshTests(testDir: string = './', configPath?: string): Promise<{ success: boolean; message: string; total: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/tests/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testDir, configPath }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getTestStats(testDir: string = './'): Promise<{
  totalTests: number;
  totalFiles: number;
  byTag: Record<string, number>;
  byFile: Record<string, number>;
} | null> {
  return fetchJSON(`${API_BASE}/tests/stats?testDir=${encodeURIComponent(testDir)}`);
}

export async function getConfig(): Promise<{ testDir: string } | null> {
  return fetchJSON(`${API_BASE}/config`);
}

export async function getPreferences(): Promise<Record<string, string> | null> {
  return fetchJSON(`${API_BASE}/preferences`);
}

export async function savePreferences(prefs: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRun(id: string): Promise<any | null> {
  return fetchJSON(`${API_BASE}/runs/${id}/raw`);
}

export async function getReportPaths(): Promise<{
  playwrightReport: string | null;
  artifacts: string | null;
  reportExists: boolean;
} | null> {
  return fetchJSON(`${API_BASE}/reports/paths`);
}

export async function setTestDir(testDir: string): Promise<{ 
  success: boolean; 
  testDir?: string; 
  resolvedPath?: string; 
  configPath?: string | null;
  configExists?: boolean;
  warnings?: string[];
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/testdir?lang=${currentLang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testDir }),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, ...data };
    } else {
      return { success: false, error: data.error || 'Failed to set test directory' };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function validateTestDir(testDir: string): Promise<{
  valid: boolean;
  configPath?: string | null;
  configExists?: boolean;
  testDir?: string | null;
  testDirAbsolute?: string | null;
  error?: string;
  warnings?: string[];
}> {
  try {
    const res = await fetch(`${API_BASE}/testdir/validate?testDir=${encodeURIComponent(testDir)}`);
    const data = await res.json();
    return data;
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getHealthMetrics(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<any[] | null> {
  let url = `${API_BASE}/health/metrics`;
  const params = new URLSearchParams();
  
  if (options?.startDate) params.append('startDate', options.startDate);
  if (options?.endDate) params.append('endDate', options.endDate);
  
  const queryString = params.toString();
  if (queryString) url += `?${queryString}`;
  
  return fetchJSON(url);
}

export async function rerunTest(runId: string, testId: string, testLocation: string): Promise<StartRunResult> {
  try {
    const res = await fetch(`${API_BASE}/runs/${runId}/tests/${testId}/rerun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testLocation
      }),
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** 批量聚类诊断，将多个失败测试结果发送到后端进行聚类分析 */
export async function requestClusterDiagnosis(
  testResults: Array<{id: string; title: string; name?: string; error?: string; stackTrace?: string; file?: string; line?: number; screenshots?: string[]; logs?: string[]; browser?: string}>,
  lang: string = 'zh'
): Promise<{enabled: boolean; clusters: Array<{clusterId: string; category: string; testIds: string[]; similarity: number; diagnosis: any}>}> {
  const response = await fetch(`${API_BASE}/diagnosis/cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testResults, lang }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
