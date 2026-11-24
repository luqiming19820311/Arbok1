import { connection } from "next/server";
import { generateBilibiliQr } from "@/lib/server/adapters/bilibili";

export async function GET() {
  await connection();
  try {
    const qr = await generateBilibiliQr();
    return Response.json(qr);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "获取 B站登录二维码失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
