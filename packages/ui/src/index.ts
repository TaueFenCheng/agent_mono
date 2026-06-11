export const brandName = "intelligentAgent";

export { AgentWorkspace } from "./components/agent-workspace";
export type {
  AgentWorkspaceProps,
  AgentWorkspaceSendInput,
  AgentWorkspaceSendStream,
  AttachmentStatusChangeHandler,
  ComposerAttachmentItem,
  ModelOption,
  PrepareAttachmentsHandler
} from "./components/agent-workspace";
export type { AgentRunEvent } from "./types/agent-run-events";

export { Button, buttonVariants } from "./components/ui/button";
export { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
export { Input } from "./components/ui/input";
export { Textarea } from "./components/ui/textarea";
export {
  Attachment,
  AttachmentInfo,
  Attachments,
  AttachmentPreview,
  AttachmentRemove,
  AttachmentStatus,
  getAttachmentLabel
} from "./components/ui/attachments";
export type { AttachmentData } from "./components/ui/attachments";
export type {
  AttachmentJobRecord,
  AttachmentProcessingStatus,
  AttachmentRecord
} from "./types/attachment-record";
export {
  attachmentProcessingStatusLabel,
  mapRecordStatusToProcessing
} from "./types/attachment-record";
export { cn } from "./lib/utils";
