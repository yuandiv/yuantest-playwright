import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler, validateBody } from '../../middleware';
import { SavePreferencesRequestSchema, SetTestDirRequestSchema } from '../../validation';
import * as path from 'path';
import * as fs from 'fs';
import { loadUserPreferences, saveUserPreferences } from '../../config/loader';

export function createMiscRouter(deps: RouterDeps): Router {
  const router = Router();

  // Progress routes
  router.get(
    '/progress',
    asyncHandler(async (req: Request, res: Response) => {
      const progress = deps.realtimeReporter.getAllProgress();
      res.json(progress);
    })
  );

  router.get(
    '/progress/:runId',
    asyncHandler(async (req: Request, res: Response) => {
      const progress = deps.realtimeReporter.getProgress(req.params.runId);
      if (!progress) {
        res.status(404).json({ error: 'Run not found or not running' });
        return;
      }
      res.json(progress);
    })
  );

  // Traces routes
  router.get(
    '/traces',
    asyncHandler(async (req: Request, res: Response) => {
      const cacheKey = 'traces:all';
      const cached = deps.cache.get(cacheKey) as Awaited<
        ReturnType<typeof deps.traceManager.current.discoverTraces>
      > | null;
      if (cached) {
        res.json(cached);
        return;
      }

      const traces = await deps.traceManager.current.discoverTraces();
      deps.cache.set(cacheKey, traces);
      res.json(traces);
    })
  );

  router.get(
    '/traces/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const cacheKey = 'traces:stats';
      const cached = deps.cache.get(cacheKey) as Awaited<
        ReturnType<typeof deps.traceManager.current.getTraceStats>
      > | null;
      if (cached) {
        res.json(cached);
        return;
      }

      const stats = await deps.traceManager.current.getTraceStats();
      deps.cache.set(cacheKey, stats);
      res.json(stats);
    })
  );

  // Artifacts routes
  router.get(
    '/artifacts',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.query.runId as string;
      const cacheKey = `artifacts:${runId || 'all'}`;
      const cached = deps.cache.get(cacheKey) as Awaited<
        ReturnType<typeof deps.artifactManager.current.discoverArtifacts>
      > | null;
      if (cached) {
        res.json(cached);
        return;
      }

      const artifacts = await deps.artifactManager.current.discoverArtifacts(runId);
      deps.cache.set(cacheKey, artifacts);
      res.json(artifacts);
    })
  );

  router.get(
    '/artifacts/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const content = await deps.artifactManager.current.getArtifactContent(req.params.id);
      if (!content) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      res.send(content);
    })
  );

  router.get(
    '/artifacts/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const cacheKey = 'artifacts:stats';
      const cached = deps.cache.get(cacheKey) as Awaited<
        ReturnType<typeof deps.artifactManager.current.getArtifactStats>
      > | null;
      if (cached) {
        res.json(cached);
        return;
      }

      const stats = await deps.artifactManager.current.getArtifactStats();
      deps.cache.set(cacheKey, stats);
      res.json(stats);
    })
  );

  // Attachments route
  router.get(
    '/attachments/file',
    asyncHandler(async (req: Request, res: Response) => {
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: 'Missing path parameter' });
        return;
      }

      const resolvedPath = path.resolve(filePath);
      const allowedDirs = [
        path.resolve(deps.outputDir.current),
        path.resolve(deps.outputDir.current, '..', 'test-results'),
        path.resolve(deps.outputDir.current, 'test-results'),
      ];

      const isAllowed = allowedDirs.some((dir) => resolvedPath.startsWith(dir));
      if (!isAllowed) {
        res.status(403).json({ error: 'Access denied: path outside allowed directories' });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webm': 'video/webm',
        '.mp4': 'video/mp4',
        '.ogg': 'video/ogg',
        '.zip': 'application/zip',
        '.trace': 'application/octet-stream',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.sendFile(resolvedPath);
    })
  );

  // Annotations routes
  router.get(
    '/annotations',
    asyncHandler(async (req: Request, res: Response) => {
      const testDir = (req.query.testDir as string) || deps.testDir.current;
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }
      const annotations = await deps.annotationManager.scanDirectory(testDir);
      res.json(annotations);
    })
  );

  router.get(
    '/annotations/summary',
    asyncHandler(async (req: Request, res: Response) => {
      const testDir = (req.query.testDir as string) || deps.testDir.current;
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }
      await deps.annotationManager.scanDirectory(testDir);
      const summary = deps.annotationManager.getSummary();
      res.json(summary);
    })
  );

  // Tags routes
  router.get(
    '/tags',
    asyncHandler(async (req: Request, res: Response) => {
      const testDir = (req.query.testDir as string) || deps.testDir.current;
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }
      const tags = await deps.tagManager.scanDirectory(testDir);
      res.json(tags);
    })
  );

  router.get(
    '/tags/summary',
    asyncHandler(async (req: Request, res: Response) => {
      const testDir = (req.query.testDir as string) || deps.testDir.current;
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }
      await deps.tagManager.scanDirectory(testDir);
      const summary = deps.tagManager.getSummary();
      res.json(summary);
    })
  );

  // Visual route
  router.get(
    '/visual/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const summary = deps.visualManager.current.getSummary();
      res.json(summary);
    })
  );

  // Preferences routes
  router.get(
    '/preferences',
    asyncHandler(async (req: Request, res: Response) => {
      const prefs = loadUserPreferences();
      const effective = deps.flakyManager.current.getEffectiveConfig();
      res.json({
        ...(prefs || {}),
        flakyCriteria: {
          ...effective.flakyCriteria,
          ...((prefs?.flakyCriteria as Record<string, unknown>) || {}),
        },
        quarantineCriteria: {
          ...effective.quarantineCriteria,
          ...((prefs?.quarantineCriteria as Record<string, unknown>) || {}),
        },
      });
    })
  );

  router.post(
    '/preferences',
    validateBody(SavePreferencesRequestSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const existing = loadUserPreferences() || {};
      const merged = { ...existing, ...req.body };
      saveUserPreferences(merged);
      if (req.body.flakyCriteria) {
        deps.flakyManager.current.setConfig({ flakyCriteria: req.body.flakyCriteria });
      }
      if (req.body.quarantineCriteria) {
        deps.flakyManager.current.setConfig({
          quarantineCriteria: req.body.quarantineCriteria,
        });
      }
      const effective = deps.flakyManager.current.getEffectiveConfig();
      res.json({
        ...merged,
        flakyCriteria: effective.flakyCriteria,
        quarantineCriteria: effective.quarantineCriteria,
      });
    })
  );

  // TestDir routes
  router.post(
    '/testdir',
    validateBody(SetTestDirRequestSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { testDir } = req.body;

      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }

      const validationResult = await deps.testDiscovery.validateProjectPath(testDir);

      if (!validationResult.valid) {
        deps.invalidateAllCache();
        res.status(400).json({
          error: validationResult.error,
          configExists: validationResult.configExists,
          path: path.resolve(testDir),
        });
        return;
      }

      await deps.updatePathsForTestDir(testDir);

      try {
        const existing = loadUserPreferences() || {};
        const merged = { ...existing, testDir };
        saveUserPreferences(merged);
      } catch {
        // Ignore preference save errors for testdir
      }

      res.json({
        success: true,
        testDir,
        resolvedPath: validationResult.testDirAbsolute,
        configPath: validationResult.configPath,
        configExists: validationResult.configExists,
        warnings: validationResult.warnings,
      });
    })
  );

  router.get(
    '/testdir/validate',
    asyncHandler(async (req: Request, res: Response) => {
      const testDir = req.query.testDir as string;

      if (!testDir) {
        res.status(400).json({ error: 'testDir query parameter is required' });
        return;
      }

      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({
          valid: false,
          error: 'Invalid testDir: path traversal is not allowed',
        });
        return;
      }

      const validationResult = await deps.testDiscovery.validateProjectPath(testDir);

      res.json({
        valid: validationResult.valid,
        configPath: validationResult.configPath,
        configExists: validationResult.configExists,
        testDir: validationResult.testDir,
        testDirAbsolute: validationResult.testDirAbsolute,
        error: validationResult.error,
        warnings: validationResult.warnings,
      });
    })
  );

  // Reports paths
  router.get(
    '/reports/paths',
    asyncHandler(async (req: Request, res: Response) => {
      const playwrightReportPath = path.resolve(deps.outputDir.current, 'html-reports');
      const artifactsPath = path.resolve(deps.outputDir.current, 'test-results');

      res.json({
        playwrightReport: fs.existsSync(playwrightReportPath) ? '/playwright-report' : null,
        artifacts: fs.existsSync(artifactsPath) ? '/test-results' : null,
        reportExists:
          fs.existsSync(playwrightReportPath) && fs.readdirSync(playwrightReportPath).length > 0,
      });
    })
  );

  return router;
}
