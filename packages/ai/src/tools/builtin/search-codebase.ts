/**
 * 内置工具：search_codebase — 在代码库中搜索模式（支持正则 + 异步 I/O）
 */
import * as fs from 'fs';
import * as path from 'path';
import { defineTool } from '../types';
import { isPathAllowed, BLOCKED_DIRS } from '../../agents/tool-registry';

export function createSearchCodebaseTool(projectRoot: string) {
  return defineTool(
    'search_codebase',
    'Search for a pattern in the codebase files using regex or plain text',
    {
      pattern: { type: 'string', description: 'Search pattern (regex or plain text)' },
      filePattern: {
        type: 'string',
        description: 'File glob pattern to filter, e.g. "*.ts" or "*.spec.ts" (optional)',
      },
      useRegex: {
        type: 'boolean',
        description: 'Set to true if pattern is a regex (optional, default false)',
      },
    },
    ['pattern'],
    async (args) => {
      const pattern = String(args.pattern);
      const useRegex = args.useRegex === true;
      const filePattern = args.filePattern as string | undefined;
      const results: string[] = [];
      const MAX_RESULTS = 20;
      const MAX_FILE_SIZE = 1024 * 512; // 512KB — skip large binary files

      // 将简单 glob 转换为正则（仅处理 *.ext 模式）
      const fileRegex = filePattern
        ? new RegExp('^' + filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i')
        : null;

      // 编译搜索正则（useRegex=true 时，pattern 本身就是正则字符串）
      let searchRegex: RegExp | null = null;
      try {
        searchRegex = useRegex ? new RegExp(pattern, 'i') : null;
      } catch {
        return `无效的正则表达式: ${pattern}`;
      }

      const searchDir = async (dir: string, depth: number = 0): Promise<void> => {
        if (depth > 8 || results.length >= MAX_RESULTS) {
          return;
        }
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= MAX_RESULTS) {
              break;
            }
            if (entry.name.startsWith('.') || BLOCKED_DIRS.includes(entry.name)) {
              continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await searchDir(fullPath, depth + 1);
            } else if (entry.isFile()) {
              if (fileRegex && !fileRegex.test(entry.name)) {
                continue;
              }
              if (!isPathAllowed(fullPath, projectRoot)) {
                continue;
              }
              try {
                const stat = await fs.promises.stat(fullPath);
                if (stat.size > MAX_FILE_SIZE) {
                  continue;
                } // skip large files
                const content = await fs.promises.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (results.length >= MAX_RESULTS) {
                    break;
                  }
                  const matched = searchRegex
                    ? searchRegex.test(lines[i])
                    : lines[i].toLowerCase().includes(pattern.toLowerCase());
                  if (matched) {
                    results.push(`${fullPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                  }
                }
              } catch {
                // Skip unreadable or binary files
              }
            }
          }
        } catch {
          // Skip inaccessible directories
        }
      };

      await searchDir(projectRoot);
      return results.length > 0 ? results.join('\n') : `No matches found for pattern: ${pattern}`;
    }
  );
}
