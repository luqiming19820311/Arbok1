import { describe, expect, it } from "vitest";
import {
  APP_VERSION,
  checkGitHubUpdate,
  compareSemver,
  DEFAULT_OTA_REPO,
  normalizeGitHubRepoSlug,
  normalizeUpdateChannel,
} from "./updates";

describe("GitHub OTA updates helper", () => {
  it("normalizes GitHub repository URLs, slugs, and channels", () => {
    expect(normalizeGitHubRepoSlug()).toBe(DEFAULT_OTA_REPO);
    expect(normalizeGitHubRepoSlug("luqiming19820311/Arbok1")).toBe(
      "luqiming19820311/Arbok1"
    );
    expect(
      normalizeGitHubRepoSlug("https://github.com/luqiming19820311/Arbok1.git")
    ).toBe("luqiming19820311/Arbok1");
    expect(
      normalizeGitHubRepoSlug("https://github.com/luqiming19820311/my-podcast/")
    ).toBe("luqiming19820311/my-podcast");
    expect(normalizeGitHubRepoSlug("invalid input")).toBe(DEFAULT_OTA_REPO);

    expect(normalizeUpdateChannel()).toBe("stable");
    expect(normalizeUpdateChannel("stable")).toBe("stable");
    expect(normalizeUpdateChannel("beta")).toBe("beta");
    expect(normalizeUpdateChannel("canary")).toBe("stable");
  });

  it("compares SemVer tags accurately including numeric prereleases", () => {
    expect(APP_VERSION).toBe("0.2.1");
    expect(compareSemver("0.1.0", "0.1.0")).toBe(0);
    expect(compareSemver("0.1.0", "v0.1.1")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0", "V0.2.0")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0", "1.0.0")).toBeGreaterThan(0);
    expect(compareSemver("0.2.0", "0.1.9")).toBeLessThan(0);
    expect(compareSemver("0.2.0-beta.1", "0.2.0")).toBeGreaterThan(0);
    expect(compareSemver("0.2.0", "0.2.0-beta.1")).toBeLessThan(0);
    expect(compareSemver("0.3.0-beta.2", "0.3.0-beta.10")).toBeGreaterThan(0);
    expect(compareSemver("0.3.0-beta.10", "0.3.0-beta.2")).toBeLessThan(0);
    expect(compareSemver("0.3.0-beta.10", "0.3.0-rc.1")).toBeGreaterThan(0);
    expect(compareSemver("0.3.0-rc.1", "0.3.0")).toBeGreaterThan(0);
  });

  it("reports update-available on stable channel via /releases/latest", async () => {
    let requestedUrl = "";
    const mockFetch = (async (url: string) => {
      requestedUrl = url;
      return new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          prerelease: false,
          html_url: "https://github.com/luqiming19820311/arbok/releases/tag/v0.2.0",
          body: "新增自动更新与播客管理",
          published_at: "2026-11-24T00:00:00Z",
          assets: [
            {
              name: "Arbok-0.2.0-arm64.dmg",
              browser_download_url:
                "https://github.com/luqiming19820311/arbok/releases/download/v0.2.0/Arbok-0.2.0-arm64.dmg",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await checkGitHubUpdate({
      repo: "luqiming19820311/arbok",
      currentVersion: "0.1.0",
      channel: "stable",
      fetchImpl: mockFetch,
    });

    expect(requestedUrl).toContain("/releases/latest");
    expect(result.status).toBe("update-available");
    expect(result.channel).toBe("stable");
    expect(result.isPrerelease).toBe(false);
    expect(result.latestVersion).toBe("0.2.0");
    expect(result.downloadUrl).toContain("Arbok-0.2.0-arm64.dmg");
    expect(result.message).toContain("V0.2.0");
  });

  it("discovers highest non-draft prerelease on beta channel", async () => {
    let requestedUrl = "";
    const mockFetch = (async (url: string) => {
      requestedUrl = url;
      return new Response(
        JSON.stringify([
          {
            tag_name: "v0.4.0-beta.1",
            draft: true,
            prerelease: true,
            html_url: "https://github.com/luqiming19820311/arbok/releases/tag/v0.4.0-beta.1",
          },
          {
            tag_name: "v0.3.0-beta.2",
            draft: false,
            prerelease: true,
            html_url: "https://github.com/luqiming19820311/arbok/releases/tag/v0.3.0-beta.2",
            assets: [
              {
                name: "Arbok-0.3.0-beta.2-arm64-mac.zip",
                browser_download_url:
                  "https://github.com/luqiming19820311/arbok/releases/download/v0.3.0-beta.2/Arbok-0.3.0-beta.2-arm64-mac.zip",
              },
            ],
          },
          {
            tag_name: "v0.3.0-beta.10",
            draft: false,
            prerelease: true,
            html_url: "https://github.com/luqiming19820311/arbok/releases/tag/v0.3.0-beta.10",
            assets: [
              {
                name: "Arbok-0.3.0-beta.10-arm64-mac.zip",
                browser_download_url:
                  "https://github.com/luqiming19820311/arbok/releases/download/v0.3.0-beta.10/Arbok-0.3.0-beta.10-arm64-mac.zip",
              },
            ],
          },
          {
            tag_name: "v0.2.1",
            draft: false,
            prerelease: false,
            html_url: "https://github.com/luqiming19820311/arbok/releases/tag/v0.2.1",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await checkGitHubUpdate({
      repo: "luqiming19820311/arbok",
      currentVersion: "0.2.1",
      channel: "beta",
      fetchImpl: mockFetch,
    });

    expect(requestedUrl).toContain("/releases?per_page=15");
    expect(result.status).toBe("update-available");
    expect(result.channel).toBe("beta");
    expect(result.isPrerelease).toBe(true);
    expect(result.latestVersion).toBe("0.3.0-beta.10");
    expect(result.downloadUrl).toContain("Arbok-0.3.0-beta.10-arm64-mac.zip");
    expect(result.message).toContain("发现新测试版 V0.3.0-beta.10");
  });

  it("reports up-to-date when current version matches latest tag", async () => {
    const mockFetch = (async () =>
      new Response(
        JSON.stringify({
          tag_name: "v0.1.0",
          html_url: "https://github.com/luqiming19820311/arbok/releases/tag/v0.1.0",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as unknown as typeof fetch;

    const result = await checkGitHubUpdate({
      repo: "luqiming19820311/arbok",
      currentVersion: "0.1.0",
      fetchImpl: mockFetch,
    });

    expect(result.status).toBe("up-to-date");
    expect(result.message).toBe("已经是最新版本");
  });

  it("handles 404 cleanly as no-release before first GitHub Release is published", async () => {
    const mockFetch = (async () =>
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
      })) as unknown as typeof fetch;

    const result = await checkGitHubUpdate({
      repo: "luqiming19820311/arbok",
      currentVersion: "0.1.0",
      fetchImpl: mockFetch,
    });

    expect(result.status).toBe("no-release");
    expect(result.currentVersion).toBe("0.1.0");
    expect(result.message).toContain("V0.1.0");
  });
});
