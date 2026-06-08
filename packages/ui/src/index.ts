export const brandName = "tangAgent";

export { AgentWorkspace } from "./components/agent-workspace";
export type { AgentWorkspaceProps, AgentWorkspaceSendInput, ModelOption } from "./components/agent-workspace";

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
