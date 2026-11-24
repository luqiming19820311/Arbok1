import { listEpisodes } from "@/lib/server/db";
import { importLocalMediaBuffer } from "@/lib/server/local-import";
import { inspectStorageUsage } from "@/lib/server/storage";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "请选择要导入的本地音视频文件" }, { status: 400 });
    }
    const titleRaw = formData.get("title");
    const langRaw = formData.get("language");
    const title = typeof titleRaw === "string" ? titleRaw : undefined;
    const language =
      langRaw === "en" || langRaw === "zh" ? langRaw : undefined;

    const arrayBuffer = await file.arrayBuffer();
    const episode = importLocalMediaBuffer({
      filename: file.name,
      buffer: Buffer.from(arrayBuffer),
      title,
      language,
    });

    return Response.json({
      episode,
      episodes: listEpisodes(),
      storage: inspectStorageUsage(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "本地文件导入失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
