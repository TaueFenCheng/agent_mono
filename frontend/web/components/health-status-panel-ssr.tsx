import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tang-agent/ui";
import { serverFetch } from "@/lib/server-fetch";

export interface HealthStatusResponse {
  status: "ok";
  postgres: "up" | "down";
  redis: "up" | "down";
  checkpointer?: "memory" | "postgres";
  at: string;
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

/**
 * SSR 版本的健康状态面板
 * - 数据在服务端获取，首屏 HTML 已包含完整内容
 * - 无需客户端 JS 即可展示数据
 * - 适合 SEO 或首屏性能要求高的场景
 */
export async function HealthStatusPanelSSR() {
  const result = await serverFetch<HealthStatusResponse>("/health");
  const data = result.data;

  return (
    <section aria-label="服务状态（SSR）">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>服务状态（SSR）</CardTitle>
              <CardDescription>服务端渲染，首屏即包含完整数据</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-md border border-border/50 bg-background/40 p-3">
                <dt className="text-xs text-foreground/60">status</dt>
                <dd className="mt-1 font-medium">{data.status}</dd>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-3">
                <dt className="text-xs text-foreground/60">postgres</dt>
                <dd className="mt-1 font-medium">{data.postgres}</dd>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-3">
                <dt className="text-xs text-foreground/60">redis</dt>
                <dd className="mt-1 font-medium">{data.redis}</dd>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-3">
                <dt className="text-xs text-foreground/60">checkpointer</dt>
                <dd className="mt-1 font-medium">{data.checkpointer ?? "unknown"}</dd>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-3 sm:col-span-2 xl:col-span-1">
                <dt className="text-xs text-foreground/60">at</dt>
                <dd className="mt-1 break-all font-medium" title={data.at}>
                  {formatHealthTimestamp(data.at)}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              获取健康状态失败：{result.message}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
