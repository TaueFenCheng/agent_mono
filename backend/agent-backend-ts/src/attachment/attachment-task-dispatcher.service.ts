import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AttachmentTaskDispatcherService {
  private readonly logger = new Logger(AttachmentTaskDispatcherService.name);
  private readonly ragServiceUrl: string;
  private readonly autoIndexAttachments: boolean;
  private readonly requestTimeoutMs: number;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    this.ragServiceUrl = (this.configService.get<string>("rag.serviceUrl") ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
    this.autoIndexAttachments = this.configService.get<boolean>("rag.autoIndexAttachments") ?? true;
    this.requestTimeoutMs = Math.max(1000, this.configService.get<number>("rag.requestTimeoutMs") ?? 10000);
  }

  async onAttachmentProcessed(attachmentId: string): Promise<void> {
    if (!this.autoIndexAttachments) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.ragServiceUrl}/v1/rag/index/attachments`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          attachmentIds: [attachmentId]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.logger.warn(
          `rag attachment auto-index failed attachmentId=${attachmentId} status=${response.status} body=${body.slice(0, 500)}`
        );
        return;
      }

      this.logger.log(`rag attachment auto-index dispatched attachmentId=${attachmentId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`rag attachment auto-index request failed attachmentId=${attachmentId} error=${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
