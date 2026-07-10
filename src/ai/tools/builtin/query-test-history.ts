/**
 * 内置工具：query_test_history — 查询测试历史记录
 */
import * as fs from 'fs';
import * as path from 'path';
import { defineTool } from '../types';

export function createQueryTestHistoryTool(dataDir: string) {
  return defineTool(
    'query_test_history',
    'Query historical test run records for a specific test',
    {
      testId: { type: 'string', description: 'Test ID to query' },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (default 5)',
      },
    },
    ['testId'],
    async (args) => {
      const testId = args.testId as string;
      const limit = (args.limit as number) || 5;
      const historyPath = path.join(dataDir, 'history.json');

      try {
        if (!fs.existsSync(historyPath)) {
          return `No history file found at: ${historyPath}`;
        }
        const content = fs.readFileSync(historyPath, 'utf-8');
        const historyData = JSON.parse(content) as Array<{
          testId?: string;
          title?: string;
          status: string;
          error?: string;
          timestamp: number;
        }>;

        const records = historyData
          .filter((record) => record.testId === testId || record.title === testId)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);

        if (records.length === 0) {
          return `No history records found for test: ${testId}`;
        }

        return records
          .map(
            (record, index) =>
              `[${index + 1}] ${new Date(record.timestamp).toISOString()} - Status: ${record.status}${record.error ? `, Error: ${record.error}` : ''}`
          )
          .join('\n');
      } catch (error) {
        return `Failed to read history: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
