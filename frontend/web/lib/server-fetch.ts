const BASE_URL = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

/**
 * 服务端专用 fetch 封装
 * - 直接请求后端服务（不经过 BFF API Route）
 * - 自动解析标准响应格式
 * - 包含错误处理与超时
 */
export async function serverFetch<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...options.headers
      },
      // 禁用 Next.js 缓存，确保每次请求都到后端
      cache: "no-store"
    });

    if (!res.ok) {
      return {
        code: res.status,
        message: `upstream returned ${res.status}`,
        data: null
      };
    }

    return (await res.json()) as ApiResponse<T>;
  } catch (error) {
    return {
      code: 502,
      message: error instanceof Error ? error.message : "upstream request failed",
      data: null
    };
  } finally {
    clearTimeout(timer);
  }
}
