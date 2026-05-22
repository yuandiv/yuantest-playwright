import { ToolRegistry } from '../../agents/tool-registry';
import type { MCPTool } from '../types';

const dataDir = process.env.YUANTEST_DATA_DIR || './data';
const projectRoot = process.cwd();

const registry = ToolRegistry.createDefaultRegistry(dataDir, projectRoot);
const mcpDefinitions = registry.getMCPToolDefinitions();
const toolNames = registry.getToolNames();

function wrapDiagnosisTool(name: string, inputSchema: Record<string, unknown>): MCPTool {
  return {
    name,
    description: mcpDefinitions.find((d) => d.name === name)?.description ?? `Execute ${name}`,
    inputSchema,
    handler: async (args: Record<string, unknown>) => {
      try {
        const result = await registry.executeTool(name, args);
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error in ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}

export const readSourceFile: MCPTool = wrapDiagnosisTool('read_source_file', {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'File path to read' },
    startLine: { type: 'number', description: 'Start line number (optional)' },
    endLine: { type: 'number', description: 'End line number (optional)' },
  },
  required: ['path'],
});

export const searchCodebase: MCPTool = wrapDiagnosisTool('search_codebase', {
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'Search pattern (regex or string)' },
    filePattern: { type: 'string', description: 'File glob pattern to filter (optional)' },
  },
  required: ['pattern'],
});

export const queryTestHistory: MCPTool = wrapDiagnosisTool('query_test_history', {
  type: 'object',
  properties: {
    testId: { type: 'string', description: 'Test ID to query' },
    limit: { type: 'number', description: 'Maximum number of records to return (default 5)' },
  },
  required: ['testId'],
});

export const readScreenshot: MCPTool = wrapDiagnosisTool('read_screenshot', {
  type: 'object',
  properties: {
    testId: { type: 'string', description: 'Test ID to get screenshot for' },
  },
  required: ['testId'],
});

export const diagnosisTools: MCPTool[] = [
  readSourceFile,
  searchCodebase,
  queryTestHistory,
  readScreenshot,
];
