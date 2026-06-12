import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';

export function createAgentsRouter(deps: RouterDeps): Router {
  const router = Router();

  router.get(
    '/agents/config',
    asyncHandler(async (req: Request, res: Response) => {
      const config = deps.aiService.getConfig();
      res.json(config);
    })
  );

  router.get(
    '/agents/project-context',
    asyncHandler(async (req: Request, res: Response) => {
      const projectRoot = deps.aiService.getProjectRoot();
      const projectContext = deps.aiService.getProjectContext();
      res.json({ projectRoot, projectContext });
    })
  );

  router.put(
    '/agents/config',
    asyncHandler(async (req: Request, res: Response) => {
      deps.aiService.updateConfig(req.body);
      const config = deps.aiService.getConfig();
      res.json(config);
    })
  );

  return router;
}
