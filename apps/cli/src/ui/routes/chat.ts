import { Router, Request, Response } from 'express';
import type { UnifiedAIService, SSEEvent } from '@yuantest/ai';
import { asyncHandler } from '@yuantest/core';
import { MCPConfigService, BUILTIN_MCP_PRESETS } from '@yuantest/ai';

export function createChatRouter(
  aiService: UnifiedAIService,
  mcpConfigService: MCPConfigService
): Router {
  const router = Router();

  router.get(
    '/chat/conversations',
    asyncHandler(async (_req: Request, res: Response) => {
      const conversations = aiService.listConversations();
      res.json(conversations);
    })
  );

  router.post(
    '/chat/conversations',
    asyncHandler(async (req: Request, res: Response) => {
      const { title } = req.body || {};
      const conversation = aiService.createConversation(title);
      res.json(conversation);
    })
  );

  router.get(
    '/chat/conversations/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const conversation = aiService.getConversation(req.params.id);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      res.json(conversation);
    })
  );

  router.delete(
    '/chat/conversations/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const success = aiService.deleteConversation(req.params.id);
      res.json({ success });
    })
  );

  router.post(
    '/chat/conversations/:id/messages',
    asyncHandler(async (req: Request, res: Response) => {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      const conversationId = req.params.id;

      const conversation = aiService.getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const sendSSE = (event: SSEEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      await aiService.sendMessage(conversationId, message, sendSSE);

      res.end();
    })
  );

  router.get(
    '/chat/mcp-status',
    asyncHandler(async (_req: Request, res: Response) => {
      const status = aiService.getMCPStatus();
      res.json(status);
    })
  );

  router.post(
    '/chat/mcp-reconnect',
    asyncHandler(async (_req: Request, res: Response) => {
      await aiService.reconnectMCP();
      const status = aiService.getMCPStatus();
      res.json({ success: true, status });
    })
  );

  router.get(
    '/chat/tools',
    asyncHandler(async (_req: Request, res: Response) => {
      const tools = aiService.getAllTools();
      res.json(tools);
    })
  );

  router.get(
    '/chat/mcp-configs',
    asyncHandler(async (_req: Request, res: Response) => {
      const configs = mcpConfigService.getConfigs();
      res.json(configs);
    })
  );

  router.put(
    '/chat/mcp-configs/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const config = mcpConfigService.updateConfig(id, req.body);
      if (!config) {
        res.status(404).json({ error: 'MCP config not found' });
        return;
      }
      if (req.body.enabled !== undefined) {
        await aiService.toggleMCPConnection(id, req.body.enabled);
      }
      const status = aiService.getMCPStatus();
      res.json({ config, status });
    })
  );

  router.delete(
    '/chat/mcp-configs/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const success = mcpConfigService.deleteConfig(id);
      res.json({ success });
    })
  );

  router.post(
    '/chat/mcp-configs/batch',
    asyncHandler(async (req: Request, res: Response) => {
      const { mcpServers } = req.body || {};
      if (!mcpServers || typeof mcpServers !== 'object') {
        res.status(400).json({ error: 'mcpServers object is required' });
        return;
      }
      mcpConfigService.saveConfigsFromJson(mcpServers);
      res.json({ success: true });
    })
  );

  router.get(
    '/chat/mcp-presets',
    asyncHandler(async (_req: Request, res: Response) => {
      const presets = BUILTIN_MCP_PRESETS;
      const existingConfigs = mcpConfigService.getConfigs();
      const existingNames = new Set(existingConfigs.map((c) => c.name));
      const presetsWithStatus = presets.map((p) => ({
        ...p,
        added: existingNames.has(p.name),
      }));
      res.json(presetsWithStatus);
    })
  );

  router.post(
    '/chat/mcp-presets/add',
    asyncHandler(async (req: Request, res: Response) => {
      const { name } = req.body || {};
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const presets = BUILTIN_MCP_PRESETS;
      const preset = presets.find((p) => p.name === name);
      if (!preset) {
        res.status(404).json({ error: `Preset "${name}" not found` });
        return;
      }
      const existingConfigs = mcpConfigService.getConfigs();
      if (existingConfigs.some((c) => c.name === name)) {
        res.json({ success: true, message: 'Preset already added' });
        return;
      }
      mcpConfigService.saveConfigsFromJson({
        [preset.name]: {
          command: preset.command,
          args: preset.args,
          env: preset.env,
          description: preset.description,
        },
      });
      res.json({ success: true });
    })
  );

  return router;
}
