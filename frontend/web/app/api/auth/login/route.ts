import { NextResponse } from "next/server";
import { createBackendAccessToken } from "../../backend";

interface LoginPayload {
  sub?: unknown;
  name?: unknown;
  bootstrapKey?: unknown;
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as LoginPayload;
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const bootstrapKey = typeof payload.bootstrapKey === "string" ? payload.bootstrapKey.trim() : "";

  if (!sub) {
    return NextResponse.json(
      {
        code: 400,
        message: "请输入用户标识",
        data: null
      },
      { status: 400 }
    );
  }

  try {
    const token = await createBackendAccessToken(
      {
        sub,
        name: name || sub,
        roles: ["user"],
        metadata: {
          source: "web"
        }
      },
      { bootstrapKey }
    );

    return NextResponse.json({
      code: 0,
      message: "ok",
      data: {
        ...token,
        user: {
          sub,
          name: name || sub
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 401,
        message: error instanceof Error ? error.message : "登录失败",
        data: null
      },
      { status: 401 }
    );
  }
}
