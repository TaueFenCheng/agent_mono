import { type NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/attachment-bff";

export async function GET(req: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  return proxyBackendJson(req, `/v1/attachments/${encodeURIComponent(attachmentId)}`);
}
