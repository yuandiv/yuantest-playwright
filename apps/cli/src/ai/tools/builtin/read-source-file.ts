/**
 * 内置工具：read_source_file — 读取源代码文件
 */
import { defineTool } from '../types';
import { isPathAllowed } from '../../agents/tool-registry';
import { readSourceCode } from '@yuantest/diagnosis';

export function createReadSourceFileTool(projectRoot: string) {
  return defineTool(
    'read_source_file',
    'Read source code from a file path, optionally specifying line range',
    {
      path: { type: 'string', description: 'File path to read' },
      startLine: { type: 'number', description: 'Start line number (optional)' },
      endLine: { type: 'number', description: 'End line number (optional)' },
    },
    ['path'],
    async (args) => {
      const filePath = args.path as string;
      if (!isPathAllowed(filePath, projectRoot)) {
        return `Access denied: path outside project directory or sensitive file: ${filePath}`;
      }
      const startLine = args.startLine as number | undefined;
      const result = await readSourceCode(filePath, startLine);
      return result ?? `File not found or unable to read: ${filePath}`;
    }
  );
}
