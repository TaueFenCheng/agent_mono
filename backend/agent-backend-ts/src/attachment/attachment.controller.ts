import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AttachmentIdParamDto,
  AttachmentJobIdParamDto,
  ListAttachmentsQueryDto,
  SearchAttachmentsQueryDto,
  UploadAttachmentDto
} from "./attachment.dto.js";
import { AttachmentService } from "./attachment.service.js";

@Controller("v1")
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post("attachments")
  @UseInterceptors(FileInterceptor("file"))
  upload(@UploadedFile() file: any, @Body() payload: UploadAttachmentDto) {
    return this.attachmentService.uploadAttachment(file, payload);
  }

  @Get("attachments")
  list(@Query() query: ListAttachmentsQueryDto) {
    return this.attachmentService.listAttachments({
      threadId: query.threadId,
      limit: query.limit
    });
  }

  @Get("attachments/search")
  search(@Query() query: SearchAttachmentsQueryDto) {
    return this.attachmentService.searchAttachments({
      query: query.q,
      threadId: query.threadId,
      limit: query.limit
    });
  }

  @Get("attachments/:attachmentId")
  getById(@Param() params: AttachmentIdParamDto) {
    return this.attachmentService.getAttachment(params.attachmentId);
  }

  @Get("attachments/jobs/:jobId")
  getJobStatus(@Param() params: AttachmentJobIdParamDto) {
    return this.attachmentService.getAttachmentJobStatus(params.jobId);
  }
}
