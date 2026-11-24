import { proxyFetch, resolveEffectiveProxyUrl } from "@/lib/server/proxy";

export async function POST() {
  const proxyUrl = resolveEffectiveProxyUrl();
  const startedAt = Date.now();
  try {
    const res = await proxyFetch("https://www.youtube.com/generate_204", {
      signal: AbortSignal.timeout(8000),
    });
    const elapsedMs = Date.now() - startedAt;
    if (res.status === 204 || res.ok) {
      return Response.json({
        ok: true,
        proxyUrl,
        latencyMs: elapsedMs,
        message: proxyUrl
          ? `代理连通测试通过（${proxyUrl} · YouTube 延迟 ${elapsedMs}ms）`
          : `直连测试通过（YouTube 延迟 ${elapsedMs}ms）`,
      });
    }
    return Response.json(
      {
        ok: false,
        proxyUrl,
        message: `YouTube 返回状态码 ${res.status}（代理：${proxyUrl ?? "直连"}）`,
      },
      { status: 502 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "连接超时";
    return Response.json(
      {
        ok: false,
        proxyUrl,
        message: `YouTube 连通失败（代理：${proxyUrl ?? "直连"}）：${detail}`,
      },
      { status: 502 }
    );
  }
}
