import { connection } from "next/server";
import { pollBilibiliQr } from "@/lib/server/adapters/bilibili";
import { saveAppSettings } from "@/lib/server/db";
import { getKeychainStatus } from "@/lib/server/keychain";

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const qrcodeKey = searchParams.get("qrcodeKey")?.trim();
  if (!qrcodeKey) {
    return Response.json({ error: "缺少 qrcodeKey 参数" }, { status: 400 });
  }

  try {
    const result = await pollBilibiliQr(qrcodeKey);
    if (result.status === "confirmed") {
      saveAppSettings({ biliLoggedIn: true });
    }
    return Response.json({
      ...result,
      keyStatus: getKeychainStatus(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "检查 B站扫码状态失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
