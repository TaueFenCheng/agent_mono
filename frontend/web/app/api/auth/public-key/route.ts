import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "../../backend";

export async function GET() {
  const baseUrl = getBackendBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/v1/auth/public-key`);
    const result = await response.json();

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: "获取公钥失败", data: null },
      { status: 500 }
    );
  }
}
