/**
 * 内置工具：read_screenshot — 读取测试失败截图
 */
import * as fs from 'fs';
import * as path from 'path';
import { defineTool } from '../types';
import { encodeScreenshot } from '../../../diagnosis/context-enricher';

export function createReadScreenshotTool(dataDir: string) {
  return defineTool(
    'read_screenshot',
    'Read the failure screenshot for a test (returns base64 encoded image)',
    {
      testId: { type: 'string', description: 'Test ID to get screenshot for' },
    },
    ['testId'],
    async (args) => {
      const testId = args.testId as string;
      const screenshotsDir = path.join(dataDir, 'screenshots');

      try {
        if (!fs.existsSync(screenshotsDir)) {
          return `Screenshots directory not found: ${screenshotsDir}`;
        }

        const entries = fs.readdirSync(screenshotsDir);
        const matchedFiles = entries.filter(
          (name) => name.includes(testId) && (name.endsWith('.png') || name.endsWith('.jpg'))
        );

        if (matchedFiles.length === 0) {
          return `No screenshot found for test: ${testId}`;
        }

        const screenshotPath = path.join(screenshotsDir, matchedFiles[0]);
        const base64 = await encodeScreenshot([screenshotPath]);
        return base64
          ? `[Screenshot available as base64, length: ${base64.length}]`
          : `Failed to encode screenshot: ${screenshotPath}`;
      } catch (error) {
        return `Failed to read screenshot: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
