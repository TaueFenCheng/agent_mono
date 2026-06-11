import { type NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/attachment-bff";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxyBackendJson(req, `/v1/attachments/jobs/${encodeURIComponent(jobId)}`);
}
