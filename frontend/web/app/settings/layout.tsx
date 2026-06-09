"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Cpu } from "lucide-react";
import { cn } from "@intelligent-agent/ui";

const navItems = [
  {
    href: "/settings/models",
    label: "模型配置",
    icon: Cpu
  }
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center gap-4 border-b border-border/60 px-4 py-3">
        <Link
          href="/agent"
          className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <div className="text-sm font-medium">设置</div>
      </header>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-4 md:grid-cols-[200px_1fr]">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-foreground/10 text-foreground font-medium"
                    : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div>{children}</div>
      </div>
    </main>
  );
}
