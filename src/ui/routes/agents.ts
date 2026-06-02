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

  return router;
}
