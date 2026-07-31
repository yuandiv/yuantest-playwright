/**
 * 内置工具：apply_patch — 应用代码补丁修复测试文件
 */
import { defineTool } from '../types';
import { PatchApplier } from '../../agents/patch-applier';
import type { HealerPatch } from '../../../types';

export function createApplyPatchTool(projectRoot: string) {
  return defineTool(
    'apply_patch',
    'Apply a code patch to fix a test file',
    {
      filePath: { type: 'string', description: 'Path to the file to patch' },
      originalCode: { type: 'string', description: 'The original code to replace' },
      patchedCode: { type: 'string', description: 'The replacement code' },
      reason: { type: 'string', description: 'Reason for the patch (optional)' },
    },
    ['filePath', 'originalCode', 'patchedCode'],
    async (args) => {
      const filePath = args.filePath as string;
      const originalCode = args.originalCode as string;
      const patchedCode = args.patchedCode as string;
      const reason = (args.reason as string) || '';

      try {
        const patch: HealerPatch = {
          testId: '',
          testTitle: '',
          filePath,
          originalCode,
          patchedCode,
          unifiedDiff: '',
          confidence: 1.0,
          reason,
        };

        const applier = new PatchApplier();
        const success = applier.applyPatch(patch, projectRoot);

        if (success) {
          return `Patch applied successfully to: ${filePath}${reason ? ` (Reason: ${reason})` : ''}`;
        } else {
          return `Failed to apply patch to: ${filePath}. The original code may not match or the file may be outside the project root.`;
        }
      } catch (error) {
        return `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
