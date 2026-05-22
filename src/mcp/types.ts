/**
 * MCP Tool interface definition.
 * Extracted from browser.ts to allow removal of browser tools
 * while keeping the shared type for diagnosis, test, and agent tools.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<
      { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
    >;
  }>;
}
