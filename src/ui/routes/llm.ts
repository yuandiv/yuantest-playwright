import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { loadLLMConfig, saveLLMConfig } from '../../config/loader';
import { LLMService } from '../../ai/agents/llm-service';
import type { UnifiedAIService } from '../../ai/ai-service';
import type { LLMConfig } from '../../types';

export function createLLMConfigRouter(aiService: UnifiedAIService): Router {
  const router = Router();

  // ── /llm/status 缓存 ────────────────────────────────
  const STATUS_CACHE_TTL = 30_000; // 30 秒
  let statusCache: {
    result: { configured: boolean; connected: boolean; status: 'green' | 'yellow' | 'red' };
    timestamp: number;
  } | null = null;

  function clearStatusCache(): void {
    statusCache = null;
  }

  /**
   * GET /llm/config — 获取当前 LLM 配置
   */
  router.get(
    '/config',
    asyncHandler(async (_req: Request, res: Response) => {
      const raw = loadLLMConfig();
      if (!raw) {
        res.json(null);
        return;
      }
      res.json(raw);
    })
  );

  /**
   * PUT /llm/config — 保存 LLM 配置并热更新 AI 服务
   */
  router.put(
    '/config',
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as Partial<LLMConfig>;

      // 合并当前配置与前端提交的更新
      const current = loadLLMConfig() || ({} as Partial<LLMConfig>);

      const merged: LLMConfig = {
        enabled: false,
        apiKey: '',
        baseUrl: '',
        model: '',
        remark: '',
        maxTokens: 4096,
        temperature: 0.3,
        ...current,
        ...body,
      };

      saveLLMConfig(merged);
      aiService.updateLLMConfig(merged);
      clearStatusCache(); // 配置变更后清除缓存，下次 status 请求重新探测

      res.json(merged);
    })
  );

  /**
   * GET /llm/status — 返回 LLM 连接状态（带 30s 缓存）
   *
   * 由 UnifiedAIService.getLLMConnectionStatus() 统一执行探测，
   * 不再新建临时 LLMService，保证与运行时状态一致。
   */
  router.get(
    '/status',
    asyncHandler(async (_req: Request, res: Response) => {
      // 缓存命中直接返回
      if (statusCache && Date.now() - statusCache.timestamp < STATUS_CACHE_TTL) {
        res.json(statusCache.result);
        return;
      }

      const result = await aiService.getLLMConnectionStatus();
      statusCache = { result, timestamp: Date.now() };
      res.json(result);
    })
  );

  /**
   * POST /llm/test-connection — 用指定配置测试 LLM 连接
   * 专供前端「测试连接」按钮使用，不会持久化配置。
   */
  router.post(
    '/test-connection',
    asyncHandler(async (req: Request, res: Response) => {
      const config = req.body as Partial<LLMConfig>;
      if (!config.baseUrl || !config.model) {
        res.json({ success: false, error: '缺少 baseUrl 或 model 参数' });
        return;
      }

      const fullConfig: LLMConfig = {
        enabled: true,
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        remark: config.remark || '',
        maxTokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.3,
      };

      try {
        const tempService = new LLMService(fullConfig);
        const result = await tempService.validateConnection();
        res.json(result);
      } catch (error) {
        res.json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  return router;
}
