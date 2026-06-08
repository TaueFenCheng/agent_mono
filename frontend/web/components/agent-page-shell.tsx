"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@tang-agent/ui";
import { AgentWorkspaceWrapper } from "@/components/agent-workspace-wrapper";
import { clearAuthSession, getStoredAccessToken, getStoredUser, type StoredUser } from "@/components/auth-storage";

export function AgentPageShell() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setAccessToken(token);
    setUser(getStoredUser());
    setIsReady(true);
  }, [router]);

  const handleLogout = () => {
    clearAuthSession();
    router.replace("/login");
  };

  if (!isReady || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-foreground/65">
        正在进入...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-sm font-medium">tangAgent</div>
          <div className="text-xs text-foreground/55">{user?.name ?? user?.sub ?? "Web Console"}</div>
        </div>
        <Button className="gap-2" size="sm" variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          退出
        </Button>
      </header>
      <div className="p-4">
        <AgentWorkspaceWrapper accessToken={accessToken} onUnauthorized={handleLogout} />
      </div>
    </main>
  );
}
