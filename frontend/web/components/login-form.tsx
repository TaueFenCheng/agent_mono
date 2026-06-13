"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@intelligent-agent/ui";
import { getStoredAccessToken, storeAuthSession } from "@/components/auth-storage";
import { encryptPassword } from "@/lib/crypto";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      const publicKeyRes = await fetch("/api/auth/public-key");
      const publicKeyData = await publicKeyRes.json();
      const publicKeyPem = publicKeyData?.data?.publicKey;
      if (!publicKeyPem) {
        throw new Error("无法获取加密公钥");
      }

      const encryptedPassword = await encryptPassword(publicKeyPem, password);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, encryptedPassword })
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
      <CardHeader className="text-center">
        <CardTitle>登录 IntelligentAgent</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="text-foreground/75">用户名</span>
            <Input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-foreground/75">密码</span>
            <Input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
            <p className="text-muted-foreground/60 text-xs">测试账号: admin / admin123</p>
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
