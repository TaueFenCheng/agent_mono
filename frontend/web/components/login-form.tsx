"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@intelligent-agent/ui";
import { getStoredAccessToken, storeAuthSession } from "@/components/auth-storage";

interface LoginResponse {
  code: number | string;
  message: string;
  data: {
    accessToken: string;
    tokenType: string;
    expiresIn?: string;
    user: {
      sub: string;
      name: string;
    };
  } | null;
}

export function LoginForm() {
  const router = useRouter();
  const [sub, setSub] = useState("web-console");
  const [name, setName] = useState("Web Console");
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getStoredAccessToken()) {
      router.replace("/agent");
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sub, name, bootstrapKey })
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !result.data?.accessToken) {
        throw new Error(result.message || `HTTP ${response.status}`);
      }

      storeAuthSession(result.data.accessToken, result.data.user);
      router.replace("/agent");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录 intelligentAgent</CardTitle>
        <CardDescription>使用后端鉴权接口进入 Agent 工作台</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="text-foreground/75">用户标识</span>
            <Input
              autoComplete="username"
              required
              value={sub}
              onChange={(event) => setSub(event.target.value)}
              placeholder="web-console"
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-foreground/75">昵称</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Web Console" />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-foreground/75">Bootstrap Key</span>
            <Input
              autoComplete="current-password"
              type="password"
              value={bootstrapKey}
              onChange={(event) => setBootstrapKey(event.target.value)}
              placeholder="未配置时可留空"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <Button className="w-full gap-2" disabled={isSubmitting} type="submit">
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? "登录中..." : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
