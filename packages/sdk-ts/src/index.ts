import type {
  AgentRunRequest,
  AgentRunResponse,
  HealthResponse,
  InvokeMcpToolRequest,
  InvokeMcpToolResponse,
  McpPluginListResponse,
  McpToolListResponse
} from "@tang-agent/core-types";

export interface TangAgentClientOptions {
  baseUrl: string;
  apiKey?: string;
}

export class TangAgentClient {
  constructor(private readonly options: TangAgentClientOptions) {}

  private headers() {
    return {
      "content-type": "application/json",
      ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {})
    };
  }

  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.options.baseUrl}/health`);
    if (!response.ok) throw new Error(`health failed: ${response.status}`);
    return (await response.json()) as HealthResponse;
  }

  async runAgent(payload: AgentRunRequest): Promise<AgentRunResponse> {
    const response = await fetch(`${this.options.baseUrl}/v1/agents/runs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`runAgent failed: ${response.status}`);
    }

    return (await response.json()) as AgentRunResponse;
  }

  async listMcpPlugins(): Promise<McpPluginListResponse> {
    const response = await fetch(`${this.options.baseUrl}/v1/mcp/plugins`, {
      method: "GET",
      headers: this.headers()
    });
    if (!response.ok) throw new Error(`listMcpPlugins failed: ${response.status}`);
    return (await response.json()) as McpPluginListResponse;
  }

  async listMcpTools(params: { threadId?: string; runId?: string } = {}): Promise<McpToolListResponse> {
    const query = new URLSearchParams();
    if (params.threadId) query.set("threadId", params.threadId);
    if (params.runId) query.set("runId", params.runId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(`${this.options.baseUrl}/v1/mcp/tools${suffix}`, {
      method: "GET",
      headers: this.headers()
    });
    if (!response.ok) throw new Error(`listMcpTools failed: ${response.status}`);
    return (await response.json()) as McpToolListResponse;
  }

  async invokeMcpTool(toolName: string, payload: InvokeMcpToolRequest): Promise<InvokeMcpToolResponse> {
    const response = await fetch(`${this.options.baseUrl}/v1/mcp/tools/${encodeURIComponent(toolName)}/invoke`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`invokeMcpTool failed: ${response.status}`);
    return (await response.json()) as InvokeMcpToolResponse;
  }
}
