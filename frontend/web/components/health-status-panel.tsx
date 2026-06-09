"use client";

import { AsyncResource } from "@/components/async-resource";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@intelligent-agent/ui";

export interface HealthStatusResponse {
  status: "ok";
  postgres: "up" | "down";
  redis: "up" | "down";
  checkpointer?: "memory" | "postgres";
  at: string;
}

interface HealthStatusEnvelope {
  code: number;
  message: string;
  data: HealthStatusResponse | null;
}

function formatHealthTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

async function loadHealthStatus(): Promise<HealthStatusResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`health failed: ${response.status}`);
  }

  const result = (await response.json()) as HealthStatusEnvelope;
  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "health failed");
  }

  return result.data;
}

export function HealthStatusPanel() {
  return (
    <section aria-label="服务状态">
      <AsyncResource loader={loadHealthStatus}>
        {({ data, reload, loading }) => (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>服务状态</CardTitle>
                  <CardDescription>展示当前后端健康检查结果</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <dt className="text-xs text-foreground/60">status</dt>
                  <dd className="mt-1 font-medium">{data?.status}</dd>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <dt className="text-xs text-foreground/60">postgres</dt>
                  <dd className="mt-1 font-medium">{data?.postgres}</dd>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <dt className="text-xs text-foreground/60">redis</dt>
                  <dd className="mt-1 font-medium">{data?.redis}</dd>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <dt className="text-xs text-foreground/60">checkpointer</dt>
                  <dd className="mt-1 font-medium">{data?.checkpointer ?? "unknown"}</dd>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3 sm:col-span-2 xl:col-span-1">
                  <dt className="text-xs text-foreground/60">at</dt>
                  <dd className="mt-1 break-all font-medium" title={data?.at}>
                    {data?.at ? formatHealthTimestamp(data.at) : ""}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}
      </AsyncResource>
    </section>
  );
}
