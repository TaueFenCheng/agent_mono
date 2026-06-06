import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import type { SubagentRunRecordResponse, SubagentRunResponse } from "@tang-agent/core-types";
import { SubagentService } from "./subagent.service.js";
import { SubagentJobIdParamDto, SubagentRunDto, SubagentRunIdParamDto } from "./subagent.dto.js";

@Controller("v1")
export class SubagentController {
  constructor(private readonly subagentService: SubagentService) {}

  @Post("agents/subruns")
  runSubagents(@Body() payload: SubagentRunDto): Promise<SubagentRunResponse> {
    return this.subagentService.runSubagents(payload);
  }

  @Post("agents/subruns/jobs")
  submitSubrunJob(@Body() payload: SubagentRunDto): Promise<{ jobId: string; status: string }> {
    return this.subagentService.submitSubrun(payload);
  }

  @Get("agents/subruns/jobs/:jobId")
  getSubrunJobStatus(
    @Param() params: SubagentJobIdParamDto
  ): Promise<{
    jobId: string;
    status: string;
    progress?: number;
    result?: Record<string, unknown> | null;
    failedReason?: string | null;
    createdAt?: string | null;
    finishedAt?: string | null;
  }> {
    return this.subagentService.getSubrunJobStatus(params.jobId);
  }

  @Post("agents/subruns/stream")
  async runSubagentsStream(@Body() payload: SubagentRunDto, @Res() res: any): Promise<void> {
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
      await this.subagentService.runSubagentsStream(payload, writeEvent);
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

  @Get("subruns/:runId")
  getSubrun(@Param() params: SubagentRunIdParamDto): Promise<SubagentRunRecordResponse> {
    return this.subagentService.getSubrun(params.runId);
  }
}

