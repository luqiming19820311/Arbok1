// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ingestUrl, refreshSubscriptions } from "./adapters";
import {
  encodeBiliWbiQuery,
  fetchBilibiliOfficialSubtitlesDetailed,
  generateBilibiliQr,
  parseBccSubtitles,
  pollBilibiliQr,
} from "./adapters/bilibili";
import {
  parseRssFeed,
  parseXiaoyuzhouUrl,
  searchApplePodcasts,
} from "./adapters/podcast";
import {
  normalizeYouTubeChannelUrl,
  parseJson3Subtitles,
} from "./adapters/youtube";
import {
  closeDbForTests,
  insertEpisode,
  listEpisodes,
  listSubscriptions,
} from "./db";
import { getSecret, resetMemoryKeychain, setSecret } from "./keychain";
import { proxyEpisodeMediaStream } from "./stream";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-phase1-"));
  process.env.ARBOK_DB_PATH = path.join(tmpDir, "test.db");
  process.env.ARBOK_KEYCHAIN_MODE = "memory";
  resetMemoryKeychain();
  closeDbForTests();
});

afterEach(() => {
  closeDbForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Phase 1 — Multi-Platform Ingestion, Deduplication & Media Stream Proxy", () => {
  test("parses RSS feed with enclosure audio, cover artwork, duration, and podcast:transcript VTT", async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title><![CDATA[Calm Engineering Radio]]></title>
    <itunes:image href="https://cdn.example.com/show.jpg" />
    <item>
      <title><![CDATA[EP 12: Local-First Media Players]]></title>
      <guid>ep-12-guid</guid>
      <link>https://example.com/ep12</link>
      <pubDate>Tue, 10 Nov 2026 08:00:00 GMT</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <enclosure url="https://cdn.example.com/ep12.mp3" type="audio/mpeg" length="123456" />
      <podcast:transcript url="https://cdn.example.com/ep12.vtt" type="text/vtt" />
    </item>
  </channel>
</rss>`;

    const vtt = `WEBVTT

00:00:00.000 --> 00:00:08.500
Welcome back to Calm Engineering Radio.

00:00:08.500 --> 00:00:18.000
Today we discuss Range-based local media proxies.`;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith(".vtt")) {
        return new Response(vtt, { status: 200 });
      }
      return new Response(rssXml, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      });
    };

    const { subscription, episodes } = await parseRssFeed(
      "https://example.com/feed.xml",
      { fetchImpl: mockFetch }
    );

    expect(subscription?.name).toBe("Calm Engineering Radio");
    expect(subscription?.coverUrl).toBe("https://cdn.example.com/show.jpg");
    expect(episodes).toHaveLength(1);
    expect(episodes[0].audioUrl).toBe("https://cdn.example.com/ep12.mp3");
    expect(episodes[0].durationSec).toBe(3723);
    expect(episodes[0].hasOfficialSub).toBe(true);
    expect(episodes[0].transcript).toHaveLength(2);
    expect(episodes[0].transcript[0].orig).toContain("Calm Engineering Radio");
  });

  test("parses Xiaoyuzhou __NEXT_DATA__ episode page", async () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          episode: {
            eid: "xyz-998",
            title: "用本地优先思路重构播客工具",
            duration: 2450,
            pubDate: "2026-11-18T10:00:00Z",
            enclosure: { url: "https://media.xyzcdn.net/ep998.m4a" },
            image: { picUrl: "https://image.xyzcdn.net/cover.jpg" },
            podcast: { pid: "pod-1", title: "独立开发电台" },
          },
        },
      },
    })}</script></body></html>`;

    const mockFetch: typeof fetch = async () =>
      new Response(html, { status: 200 });

    const parsed = await parseXiaoyuzhouUrl(
      "https://www.xiaoyuzhoufm.com/episode/xyz-998",
      mockFetch
    );
    expect(parsed.episodes).toHaveLength(1);
    expect(parsed.episodes[0].platform).toBe("xiaoyuzhou");
    expect(parsed.episodes[0].channel).toBe("独立开发电台");
    expect(parsed.episodes[0].audioUrl).toBe("https://media.xyzcdn.net/ep998.m4a");
    expect(parsed.episodes[0].coverUrl).toBe("https://image.xyzcdn.net/cover.jpg");
  });

  test("searches Apple Podcasts and parses Bilibili BCC subtitles", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              collectionId: 1057255460,
              collectionName: "Acquired",
              artistName: "Ben Gilbert and David Rosenthal",
              primaryGenreName: "Business",
              feedUrl: "https://feeds.transistor.fm/acquired",
              artworkUrl600: "https://is1-ssl.mzstatic.com/acquired.jpg",
            },
          ],
        }),
        { status: 200 }
      );

    const results = await searchApplePodcasts("Acquired", mockFetch);
    expect(results).toHaveLength(1);
    expect(results[0].feedUrl).toBe("https://feeds.transistor.fm/acquired");
    expect(results[0].coverUrl).toBe("https://is1-ssl.mzstatic.com/acquired.jpg");

    const bcc = parseBccSubtitles(
      JSON.stringify({
        body: [
          { from: 0.5, to: 4.2, content: "欢迎来到本期评测" },
          { from: 4.2, to: 9.8, content: "今天测试 Mac Studio 的剪辑流程" },
        ],
      })
    );
    expect(bcc).toHaveLength(2);
    expect(bcc[0]).toEqual({
      id: 1,
      start: 0.5,
      end: 4.2,
      orig: "欢迎来到本期评测",
    });
  });

  test("ingests RSS subscription and deduplicates episodes across refresh", async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount += 1;
      const items =
        callCount === 1
          ? `<item><title>Ep 1</title><guid>g1</guid><enclosure url="https://cdn.example.com/1.mp3" type="audio/mpeg"/></item>`
          : `<item><title>Ep 2</title><guid>g2</guid><enclosure url="https://cdn.example.com/2.mp3" type="audio/mpeg"/></item>
             <item><title>Ep 1</title><guid>g1</guid><enclosure url="https://cdn.example.com/1.mp3" type="audio/mpeg"/></item>`;
      return new Response(
        `<rss><channel><title>Dedup Podcast</title>${items}</channel></rss>`,
        { status: 200 }
      );
    };

    const initial = await ingestUrl("https://example.com/dedup.xml", {
      fetchImpl: mockFetch,
    });
    expect(initial.kind).toBe("subscription");
    expect(initial.addedCount).toBe(1);
    expect(listSubscriptions().some((s) => s.name === "Dedup Podcast")).toBe(true);

    const beforeCount = listEpisodes().length;
    const refresh = await refreshSubscriptions(initial.subscription?.id, mockFetch);
    expect(refresh.refreshedSources).toBe(1);
    expect(refresh.newEpisodes).toBe(1);
    expect(listEpisodes().length).toBe(beforeCount + 1);
  });

  test("proxies local files, demo WAV, and Bilibili streams with Range, Cookie, and 403 refresh", async () => {
    const localAudio = path.join(tmpDir, "sample.mp3");
    fs.writeFileSync(localAudio, Buffer.from("0123456789abcdefghij"));

    insertEpisode({
      id: "ep-local-range",
      subId: null,
      platform: "podcast",
      channel: "Local",
      title: "Local Range Test",
      date: "刚刚",
      durationSec: 60,
      positionSec: 0,
      mediaType: "audio",
      language: "en",
      hasOfficialSub: false,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: true,
      gradient: "",
      coverLabel: "LOC",
      pageUrl: "https://example.com/local",
      localFilePath: localAudio,
      transcript: [],
      guide: null,
      chat: [],
    });

    const localRes = await proxyEpisodeMediaStream("ep-local-range", {
      mode: "audio",
      rangeHeader: "bytes=4-9",
    });
    expect(localRes.status).toBe(206);
    expect(localRes.headers.get("content-range")).toBe("bytes 4-9/20");
    expect(await localRes.text()).toBe("456789");

    const demoRes = await proxyEpisodeMediaStream("ep-yt-1", {
      mode: "audio",
      rangeHeader: "bytes=0-11",
    });
    expect(demoRes.status).toBe(422);
    const demoJson = (await demoRes.json()) as { code?: string };
    expect(demoJson.code).toBe("DEMO_PLACEHOLDER");

    setSecret("auth:bilibili", "SESSDATA=test_cookie_val");
    insertEpisode({
      id: "ep-bili-proxy",
      subId: null,
      externalId: "BV1Test123456",
      platform: "bilibili",
      channel: "B站测试",
      title: "B站流代理测试",
      date: "刚刚",
      durationSec: 120,
      positionSec: 0,
      mediaType: "video",
      language: "zh",
      hasOfficialSub: false,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: false,
      gradient: "",
      coverLabel: "BILI",
      pageUrl: "https://www.bilibili.com/video/BV1Test123456",
      videoUrl: "https://upos-expired.bilivideo.com/old.mp4",
      streamExpiresAt: Date.now() + 60_000,
      transcript: [],
      guide: null,
      chat: [],
    });

    let seenCookie = "";
    let seenReferer = "";
    const biliFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (url.includes("upos-expired")) {
        seenCookie = headers.get("cookie") ?? "";
        seenReferer = headers.get("referer") ?? "";
        return new Response("Forbidden", { status: 403 });
      }
      if (url.includes("/x/web-interface/view")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              bvid: "BV1Test123456",
              cid: 1001,
              title: "B站流代理测试",
              pic: "https://i0.hdslb.com/cover.jpg",
              duration: 120,
              pubdate: 1700000000,
              owner: { name: "B站测试" },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes("fnval=1&")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { durl: [{ url: "https://upos-fresh.bilivideo.com/fresh.mp4" }] },
          }),
          { status: 200 }
        );
      }
      if (url.includes("fnval=16")) {
        return new Response(JSON.stringify({ code: 0, data: {} }), {
          status: 200,
        });
      }
      if (url.includes("/x/player/v2")) {
        return new Response(JSON.stringify({ code: 0, data: {} }), {
          status: 200,
        });
      }
      if (url.includes("upos-fresh")) {
        return new Response("FRESH_VIDEO_CHUNK", {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": "bytes 0-16/17",
            "Content-Length": "17",
          },
        });
      }
      return new Response("Not Found", { status: 404 });
    };

    const biliRes = await proxyEpisodeMediaStream("ep-bili-proxy", {
      mode: "video",
      rangeHeader: "bytes=0-16",
      fetchImpl: biliFetch,
    });
    expect(seenReferer).toBe("https://www.bilibili.com/");
    expect(seenCookie).toContain("SESSDATA=test_cookie_val");
    expect(biliRes.status).toBe(206);
    expect(await biliRes.text()).toBe("FRESH_VIDEO_CHUNK");

    // Regression: an audio-only localFilePath (.mp3) must never hijack video mode
    const cachedMp3 = path.join(tmpDir, "asr-source.mp3");
    fs.writeFileSync(cachedMp3, Buffer.from("AUDIO_ONLY_BYTES"));
    insertEpisode({
      id: "ep-bili-audio-cache-regression",
      subId: null,
      externalId: "BV1Test123456",
      platform: "bilibili",
      channel: "B站测试",
      title: "B站视频不应被音频缓存劫持",
      date: "刚刚",
      durationSec: 120,
      positionSec: 0,
      mediaType: "video",
      language: "zh",
      hasOfficialSub: false,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: false,
      gradient: "",
      coverLabel: "BILI",
      pageUrl: "https://www.bilibili.com/video/BV1Test123456",
      videoUrl: "https://upos-fresh.bilivideo.com/fresh.mp4",
      localFilePath: cachedMp3,
      streamExpiresAt: Date.now() + 60_000,
      transcript: [],
      guide: null,
      chat: [],
    });
    const videoModeRes = await proxyEpisodeMediaStream(
      "ep-bili-audio-cache-regression",
      {
        mode: "video",
        rangeHeader: "bytes=0-16",
        fetchImpl: biliFetch,
      }
    );
    expect(videoModeRes.headers.get("content-type")).toBe("video/mp4");
    expect(await videoModeRes.text()).toBe("FRESH_VIDEO_CHUNK");

    const audioModeRes = await proxyEpisodeMediaStream(
      "ep-bili-audio-cache-regression",
      {
        mode: "audio",
        rangeHeader: "bytes=0-15",
        fetchImpl: biliFetch,
      }
    );
    expect(audioModeRes.headers.get("content-type")).toBe("audio/mpeg");
    expect(await audioModeRes.text()).toBe("AUDIO_ONLY_BYTES");
  });

  test("generates Bilibili QR SVG and persists SESSDATA into Keychain on confirmation", async () => {
    const qrFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("qrcode/generate")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              url: "https://passport.bilibili.com/h5-app/passport/login/scan?navhide=1&qrcode_key=abc123",
              qrcode_key: "abc123",
            },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            code: 0,
            url: "https://passport.biligame.com/x/passport-login/web/crossDomain?SESSDATA=live_sess_999&bili_jct=csrf_1",
          },
        }),
        { status: 200 }
      );
    };

    const qr = await generateBilibiliQr(qrFetch);
    expect(qr.qrcodeKey).toBe("abc123");
    expect(qr.qrSvg).toContain("<svg");

    const poll = await pollBilibiliQr("abc123", qrFetch);
    expect(poll.status).toBe("confirmed");
    expect(getSecret("auth:bilibili")).toContain("SESSDATA=live_sess_999");

    // Verify WBI query signing and WBI /x/player/wbi/v2 official AI subtitle fetch
    const wbiQuery = encodeBiliWbiQuery(
      { bvid: "BV1Test123456", cid: 1001 },
      "7cd084941338484aae1ad9425b84077c",
      "4932caff0ff746eab6f01bf08b70ac45",
      1700000000
    );
    expect(wbiQuery).toContain("wts=1700000000");
    expect(wbiQuery).toMatch(/w_rid=[a-f0-9]{32}$/);

    const seenSubUrls: string[] = [];
    const wbiSubFetch: typeof fetch = async (input) => {
      const u = String(input);
      seenSubUrls.push(u);
      if (u.includes("/x/web-interface/nav")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              isLogin: true,
              wbi_img: {
                img_url:
                  "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
                sub_url:
                  "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
              },
            },
          }),
          { status: 200 }
        );
      }
      if (u.includes("/x/player/wbi/v2")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              subtitle: {
                subtitles: [
                  {
                    lan: "ai-zh",
                    subtitle_url: "//aisubtitle.hdslb.com/bfs/ai_subtitle/demo.json",
                  },
                ],
              },
            },
          }),
          { status: 200 }
        );
      }
      if (u.includes("aisubtitle.hdslb.com")) {
        return new Response(
          JSON.stringify({
            body: [{ from: 1.0, to: 5.0, content: "成功通过 WBI 解锁 B站官方 AI 字幕" }],
          }),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    };

    const subResult = await fetchBilibiliOfficialSubtitlesDetailed(
      "BV1Test123456",
      1001,
      wbiSubFetch
    );
    expect(seenSubUrls.some((u) => u.includes("/x/player/wbi/v2") && u.includes("w_rid="))).toBe(true);
    expect(subResult.segments).toHaveLength(1);
    expect(subResult.segments[0].orig).toBe("成功通过 WBI 解锁 B站官方 AI 字幕");
  });

  test("normalizes YouTube channel URLs to /videos and merges full json3 captions without truncation", () => {
    expect(normalizeYouTubeChannelUrl("https://www.youtube.com/@ai99insider")).toBe(
      "https://www.youtube.com/@ai99insider/videos"
    );
    expect(
      normalizeYouTubeChannelUrl("https://www.youtube.com/@ai99insider/videos")
    ).toBe("https://www.youtube.com/@ai99insider/videos");
    expect(
      normalizeYouTubeChannelUrl("https://www.youtube.com/playlist?list=PL123")
    ).toBe("https://www.youtube.com/playlist?list=PL123");

    const json3 = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 2500, segs: [{ utf8: "Hello everyone" }] },
        { tStartMs: 2500, dDurationMs: 2500, segs: [{ utf8: "welcome back to the show." }] },
        { tStartMs: 5000, dDurationMs: 100, segs: [{ utf8: "\n" }] },
        { tStartMs: 3400000, dDurationMs: 4000, segs: [{ utf8: "Thanks for watching all the way to the end." }] },
      ],
    });

    const segments = parseJson3Subtitles(json3);
    expect(segments).toHaveLength(2);
    expect(segments[0].orig).toBe("Hello everyone welcome back to the show.");
    expect(segments[0].start).toBe(0);
    expect(segments[1].orig).toBe("Thanks for watching all the way to the end.");
    expect(segments[1].start).toBe(3400);
    expect(segments[1].end).toBe(3404);
  });

  test("ingests Xiaoyuzhou single episode without FK error, Apple Podcasts URLs, and HTML RSS autodiscovery", async () => {
    const xyzHtml = `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          episode: {
            eid: "6afbb377fe62f8f52c4c4f3a",
            title: "纪录片导演陈晓卿×罗永浩",
            duration: 15554,
            shownotes: "<p>本期对话陈晓卿导演。</p>",
            enclosure: { url: "https://media.xyzcdn.net/test.m4a" },
            podcast: { pid: "68981df29e7bcd326eb91d88", title: "罗永浩的十字路口" },
          },
        },
      },
    })}</script></body></html>`;

    const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>Discovered Show</title>
      <item>
        <title>Episode One</title>
        <guid>ep-disc-1</guid>
        <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" />
      </item>
    </channel></rss>`;

    const webPageHtml = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml" />
    </head><body>Podcast Site</body></html>`;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("xiaoyuzhoufm.com/episode/")) {
        return new Response(xyzHtml, { status: 200 });
      }
      if (url.includes("itunes.apple.com/lookup")) {
        return new Response(
          JSON.stringify({
            results: [{ feedUrl: "https://pod.example.com/feed.xml" }],
          }),
          { status: 200 }
        );
      }
      if (url === "https://pod.example.com/feed.xml") {
        return new Response(sampleRss, { status: 200 });
      }
      if (url === "https://pod.example.com/episodes/1") {
        return new Response(webPageHtml, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const xyzRes = await ingestUrl(
      "https://www.xiaoyuzhoufm.com/episode/6afbb377fe62f8f52c4c4f3a",
      { fetchImpl: mockFetch }
    );
    expect(xyzRes.episode.title).toContain("陈晓卿");
    expect(xyzRes.episode.channel).toBe("罗永浩的十字路口");
    expect(xyzRes.episode.description).toContain("本期对话陈晓卿导演");
    expect(xyzRes.episode.audioUrl).toBe("https://media.xyzcdn.net/test.m4a");

    const appleRes = await ingestUrl(
      "https://podcasts.apple.com/us/podcast/discovered/id1050462261",
      { fetchImpl: mockFetch }
    );
    expect(appleRes.subscription?.name).toBe("Discovered Show");
    expect(appleRes.episode.title).toBe("Episode One");

    const htmlRes = await ingestUrl("https://pod.example.com/episodes/1", {
      fetchImpl: mockFetch,
    });
    expect(htmlRes.subscription?.name).toBe("Discovered Show");

    const directRes = await ingestUrl("https://cdn.example.com/direct-talk.mp3", {
      fetchImpl: mockFetch,
    });
    expect(directRes.episode.audioUrl).toBe("https://cdn.example.com/direct-talk.mp3");
    expect(directRes.episode.title).toBe("direct-talk");
  });
});
