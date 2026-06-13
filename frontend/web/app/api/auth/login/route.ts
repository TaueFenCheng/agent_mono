import { NextResponse } from "next/server";
import { login } from "../../backend";

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as LoginPayload;
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!username || !password) {
    return NextResponse.json(
      {
        code: 400,
        message: "请输入用户名和密码",
        data: null
      },
      { status: 400 }
    );
  }

  try {
    const token = await login(username, password);

    return NextResponse.json({
      code: 0,
      message: "ok",
      data: {
        ...token,
        user: token.user ?? { sub: username, name: username }
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
