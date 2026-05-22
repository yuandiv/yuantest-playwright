// NOTE: @modelcontextprotocol/sdk is required but not currently listed in package.json dependencies.
// Install it via: npm install @modelcontextprotocol/sdk

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { diagnosisTools } from './tools/diagnosis';
import { testTools } from './tools/test';
import { agentTools } from './tools/agent';
import { atomicTools } from './tools/atomic';
import type { MCPTool } from './types';

// 去重：同名工具只保留最后一个注册的版本（后者覆盖前者）
// 顺序：diagnosis → test → agent → atomic，atomic 最特化，优先级最高
const rawTools: MCPTool[] = [...diagnosisTools, ...testTools, ...agentTools, ...atomicTools];

const seen = new Map<string, MCPTool>();
for (const tool of rawTools) {
  seen.set(tool.name, tool); // 后者覆盖前者
}

const allTools: MCPTool[] = Array.from(seen.values());

export const server = new Server(
  { name: 'yuantest-playwright', version: '1.1.0' },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = allTools.find((t) => t.name === name);

  if (!tool) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
    };
  }

  return tool.handler(args ?? {});
});

export async function startMCPServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
