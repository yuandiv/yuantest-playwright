import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';
import {
  registerPattern,
  unregisterPattern,
  getCustomPatterns,
  getAllPatterns,
} from '../../diagnosis/knowledge-base';

export function createErrorPatternsRouter(deps: RouterDeps): Router {
  const router = Router();

  router.get(
    '/error-patterns',
    asyncHandler(async (_req: Request, res: Response) => {
      const all = getAllPatterns().map((p) => ({
        ...p,
        regex: p.regex.map((r) => r.source),
        isCustom: !p.id.match(/^(timeout|selector|assertion|network|frame|auth)-/),
      }));
      res.json(all);
    })
  );

  router.get(
    '/error-patterns/custom',
    asyncHandler(async (_req: Request, res: Response) => {
      const custom = getCustomPatterns().map((p) => ({
        ...p,
        regex: p.regex.map((r) => r.source),
      }));
      res.json(custom);
    })
  );

  router.post(
    '/error-patterns',
    asyncHandler(async (req: Request, res: Response) => {
      const {
        id,
        category,
        name,
        description,
        regex,
        rootCauseTemplate,
        suggestionsTemplate,
        docLinks,
      } = req.body;
      if (!id || !category || !name || !regex || !rootCauseTemplate || !suggestionsTemplate) {
        res.status(400).json({
          error:
            'Missing required fields: id, category, name, regex, rootCauseTemplate, suggestionsTemplate',
        });
        return;
      }
      registerPattern({
        id,
        category,
        name,
        description: description || '',
        regex: regex.map((r: string) => new RegExp(r, 'i')),
        rootCauseTemplate,
        suggestionsTemplate,
        docLinks: docLinks || [],
      });
      await deps.saveCustomErrorPatterns();
      res.json({ success: true, id });
    })
  );

  router.delete(
    '/error-patterns/:patternId',
    asyncHandler(async (req: Request, res: Response) => {
      const removed = unregisterPattern(req.params.patternId);
      if (!removed) {
        res.status(404).json({ error: 'Pattern not found' });
        return;
      }
      await deps.saveCustomErrorPatterns();
      res.json({ success: true });
    })
  );

  return router;
}
