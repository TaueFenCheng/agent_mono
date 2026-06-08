"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredAccessToken } from "@/components/auth-storage";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getStoredAccessToken() ? "/agent" : "/login");
  }, [router]);

  return <main className="min-h-screen bg-background" />;
}
