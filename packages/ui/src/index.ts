export const brandName = "intelligentAgent";

export { AgentWorkspace } from "./components/agent-workspace";
export type {
  AgentWorkspaceProps,
  AgentWorkspaceSendInput,
  AgentWorkspaceSendStream,
  ModelOption
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
  getAttachmentLabel
} from "./components/ui/attachments";
export type { AttachmentData } from "./components/ui/attachments";
export { cn } from "./lib/utils";
