import { proxyFetch } from "@/lib/server/proxy";

function chunkTextForGoogleTranslate(text: string, maxLen = 1400): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (!current) {
      if (para.length <= maxLen) {
        current = para;
      } else {
        for (let i = 0; i < para.length; i += maxLen) {
          chunks.push(para.slice(i, i + maxLen));
        }
      }
    } else if (current.length + 2 + para.length <= maxLen) {
      current = `${current}\n\n${para}`;
    } else {
      chunks.push(current);
      current = para.length <= maxLen ? para : "";
      if (para.length > maxLen) {
        for (let i = 0; i < para.length; i += maxLen) {
          chunks.push(para.slice(i, i + maxLen));
        }
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function googleTranslateChunk(
  chunk: string,
  targetLang: string
): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    targetLang
  )}&dt=t&q=${encodeURIComponent(chunk)}`;
  const res = await proxyFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`谷歌翻译接口返回 ${res.status}`);
  }
  const data = (await res.json()) as [Array<[string, ...unknown[]]>];
  const sentences = Array.isArray(data?.[0]) ? data[0] : [];
  return sentences.map((s) => (typeof s?.[0] === "string" ? s[0] : "")).join("");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      targetLang?: string;
    };
    const text = body.text?.trim() ?? "";
    if (!text) {
      return Response.json({ error: "缺少待翻译文本" }, { status: 400 });
    }
    const targetLang = body.targetLang?.trim() || "zh-CN";
    const chunks = chunkTextForGoogleTranslate(text);
    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      translatedChunks.push(await googleTranslateChunk(chunk, targetLang));
    }

    return Response.json({
      translatedText: translatedChunks.join("\n\n").trim(),
      engine: "google",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "谷歌翻译请求失败，请检查代理设置";
    return Response.json({ error: message }, { status: 502 });
  }
}
