import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';

export function createAgentsRouter(deps: RouterDeps): Router {
  const router = Router();

  router.get(
    '/agents/config',
    asyncHandler(async (req: Request, res: Response) => {
      const config = deps.agentService.getConfig();
      res.json(config);
    })
  );

  router.get(
    '/agents/project-context',
    asyncHandler(async (req: Request, res: Response) => {
      const projectRoot = deps.agentService.getProjectRoot();
      const projectContext = deps.agentService.getProjectContext();
      res.json({ projectRoot, projectContext });
    })
  );

  router.put(
    '/agents/config',
    asyncHandler(async (req: Request, res: Response) => {
      deps.agentService.updateConfig(req.body);
      const config = deps.agentService.getConfig();
      res.json(config);
    })
  );

  router.post(
    '/agents/init',
    asyncHandler(async (req: Request, res: Response) => {
      const { loopTarget } = req.body;
      const result = await deps.agentService.initAgents(loopTarget || 'vscode');
      res.json(result);
    })
  );

  router.post(
    '/agents/plan',
    asyncHandler(async (req: Request, res: Response) => {
      const { description, seedTest, prdPath, outputDir } = req.body;
      if (!description) {
        res.status(400).json({ error: 'description is required' });
        return;
      }
      const llmConfig = deps.diagnosisService.getMaskedConfig();
      deps.agentService.setLLMConfig(llmConfig);
      const result = await deps.agentService.plan(description, { seedTest, prdPath, outputDir });
      res.json(result);
    })
  );

  router.post(
    '/agents/generate',
    asyncHandler(async (req: Request, res: Response) => {
      const { planPath, outputDir, seedTest } = req.body;
      if (!planPath) {
        res.status(400).json({ error: 'planPath is required' });
        return;
      }
      const llmConfig = deps.diagnosisService.getMaskedConfig();
      deps.agentService.setLLMConfig(llmConfig);
      const result = await deps.agentService.generate(planPath, { outputDir, seedTest });
      res.json(result);
    })
  );

  router.post(
    '/agents/heal',
    asyncHandler(async (req: Request, res: Response) => {
      const { testFilePath, runId, testId, error, stackTrace, apply } = req.body;
      if (!testFilePath) {
        res.status(400).json({ error: 'testFilePath is required' });
        return;
      }
      const llmConfig = deps.diagnosisService.getMaskedConfig();
      deps.agentService.setLLMConfig(llmConfig);
      if (apply) {
        deps.agentService.updateConfig({ autoHeal: true });
      }
      const result = await deps.agentService.heal(testFilePath, {
        runId,
        testId,
        error,
        stackTrace,
      });
      res.json(result);
    })
  );

  router.post(
    '/agents/apply-patch',
    asyncHandler(async (req: Request, res: Response) => {
      const { patch } = req.body;
      if (!patch || !patch.filePath || !patch.originalCode || !patch.patchedCode) {
        res
          .status(400)
          .json({ error: 'patch with filePath, originalCode, patchedCode is required' });
        return;
      }
      const success = await deps.agentService.applyPatch(patch);
      res.json({ success });
    })
  );

  router.get(
    '/agents/plans',
    asyncHandler(async (req: Request, res: Response) => {
      const plans = await deps.agentService.listPlans();
      res.json(plans);
    })
  );

  router.get(
    '/agents/heal-history',
    asyncHandler(async (req: Request, res: Response) => {
      const history = await deps.agentService.getHealHistory();
      res.json(history);
    })
  );

  return router;
}
