import { Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import type {
  AgentRunResponse,
  InvokeMcpToolResponse,
  MemoryFactResponse,
  McpPluginListResponse,
  McpToolListResponse,
  RunRecordResponse,
  SkillListResponse,
  SkillResponse,
  ThreadDetailResponse,
  ThreadListResponse,
  ThreadMemoryResponse
} from "@intelligent-agent/core-types";
import { User, type JwtUser } from "../common/decorators/user.decorator.js";
import {
  AgentRunDto,
  CreateMemoryFactDto,
  InvokeMcpToolDto,
  JobIdParamDto,
  ListMcpToolsQueryDto,
  ListSkillsQueryDto,
  ListThreadsQueryDto,
  RunIdParamDto,
  SkillNameParamDto,
  ThreadFactParamDto,
  ThreadIdParamDto,
  ToolNameParamDto
} from "./agent.dto.js";
import { AgentService } from "./agent.service.js";

@Controller("v1")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /** 同步执行 Agent，等待完成后返回结果 */
  @Post("agents/runs")
  run(@Body() payload: AgentRunDto, @User() user: JwtUser): Promise<AgentRunResponse> {
    return this.agentService.run(payload, user?.sub);
  }

  /** 异步提交 Agent 任务到消息队列，立即返回 jobId，结果通过轮询获取 */
  @Post("agents/runs/jobs")
  submitRunJob(@Body() payload: AgentRunDto, @User() user: JwtUser): Promise<{ jobId: string; status: string }> {
    return this.agentService.submitRun(payload, user?.sub);
  }

  /** 查询异步任务的状态和结果 */
  @Get("agents/runs/jobs/:jobId")
  getJobStatus(
    @Param() params: JobIdParamDto
  ): Promise<{
    jobId: string;
    status: string;
    progress?: number;
    result?: Record<string, unknown> | null;
    failedReason?: string | null;
    createdAt?: string | null;
    finishedAt?: string | null;
  }> {
    return this.agentService.getJobStatus(params.jobId);
  }

  /** SSE 流式执行 Agent，实时推送 run_start / tool_start / tool_end / run_end 等事件 */
  @Post("agents/runs/stream")
  async runStream(@Body() payload: AgentRunDto, @Res() res: any, @User() user: JwtUser): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const writeEvent = async (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.agentService.runStream(payload, writeEvent, user?.sub);
    } catch (error) {
      await writeEvent({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString()
      });
    } finally {
      res.end();
    }
  }

  /** 获取单次运行的详细记录 */
  @Get("runs/:runId")
  getRun(@Param() params: RunIdParamDto): Promise<RunRecordResponse> {
    return this.agentService.getRun(params.runId);
  }

  /** 列出当前用户的对话线程 */
  @Get("threads")
  listThreads(@Query() query: ListThreadsQueryDto, @User() user: JwtUser): Promise<ThreadListResponse> {
    return this.agentService.listThreads(query.limit ?? 20, user?.sub);
  }

  /** 获取指定线程的对话详情 */
  @Get("threads/:threadId")
  getThread(@Param() params: ThreadIdParamDto, @User() user: JwtUser): Promise<ThreadDetailResponse> {
    return this.agentService.getThread(params.threadId, user?.sub);
  }

  /** 获取指定线程的所有对话检查点（历史状态快照） */
  @Get("threads/:threadId/checkpoints")
  getThreadCheckpoints(@Param() params: ThreadIdParamDto, @User() user: JwtUser): Promise<ThreadDetailResponse> {
    return this.agentService.getThread(params.threadId, user?.sub);
  }

  /** 列出指定线程的记忆事实列表 */
  @Get("threads/:threadId/memory")
  listMemory(@Param() params: ThreadIdParamDto, @User() user: JwtUser): Promise<ThreadMemoryResponse> {
    return this.agentService.listMemory(params.threadId, user?.sub);
  }

  /** 手动创建一条记忆事实 */
  @Post("threads/:threadId/memory/facts")
  createMemory(
    @Param() params: ThreadIdParamDto,
    @Body() payload: CreateMemoryFactDto,
    @User() user: JwtUser
  ): Promise<MemoryFactResponse> {
    return this.agentService.createMemory(params.threadId, payload, user?.sub);
  }

  /** 删除指定记忆事实 */
  @Delete("threads/:threadId/memory/facts/:factId")
  deleteMemory(@Param() params: ThreadFactParamDto, @User() user: JwtUser): Promise<{ deleted: boolean }> {
    return this.agentService.deleteMemory(params.threadId, params.factId, user?.sub);
  }

  /** 列出所有可用技能 */
  @Get("skills")
  listSkills(@Query() query: ListSkillsQueryDto): Promise<SkillListResponse> {
    return this.agentService.listSkills(query.enabledOnly ?? false);
  }

  /** 获取指定技能的详细内容 */
  @Get("skills/:skillName")
  getSkill(@Param() params: SkillNameParamDto): Promise<SkillResponse> {
    return this.agentService.getSkill(params.skillName);
  }

  /** 列出当前已加载的 MCP 插件 */
  @Get("mcp/plugins")
  listMcpPlugins(): Promise<McpPluginListResponse> {
    return this.agentService.listMcpPlugins();
  }

  /** 列出 MCP 工具定义 */
  @Get("mcp/tools")
  listMcpTools(@Query() query: ListMcpToolsQueryDto): Promise<McpToolListResponse> {
    return this.agentService.listMcpTools({ threadId: query.threadId, runId: query.runId });
  }

  /** 直接调用指定 MCP 工具 */
  @Post("mcp/tools/:toolName/invoke")
  invokeMcpTool(
    @Param() params: ToolNameParamDto,
    @Body() payload: InvokeMcpToolDto
  ): Promise<InvokeMcpToolResponse> {
    return this.agentService.invokeMcpTool(params.toolName, payload);
  }
}
