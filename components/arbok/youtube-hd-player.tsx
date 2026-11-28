"use client";

import { useEffect, useImperativeHandle, useRef } from "react";

export interface YtPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackQuality: () => string;
  getAvailableQualityLevels?: () => string[];
  setPlaybackQuality?: (suggestedQuality: string) => void;
  setPlaybackQualityRange?: (min: string, max?: string) => void;
  unloadModule?: (moduleName: string) => void;
  getOptions?: (moduleName?: string) => string[];
  setOption?: (moduleName: string, option: string, value: unknown) => void;
  destroy: () => void;
}

export function disableYouTubeCaptions(player: YtPlayerInstance): void {
  try {
    player.setOption?.("captions", "track", {});
    player.setOption?.("cc", "track", {});
    player.unloadModule?.("captions");
    player.unloadModule?.("cc");
  } catch {
    /* Captions module may not be attached yet. */
  }
}

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onApiChange?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onPlaybackQualityChange?: (event: { data: string }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YtPlayerInstance;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
  };
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubeHdPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (sec: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume01: number) => void;
  setQuality: (quality: string) => void;
}

export function extractYouTubeVideoId(
  externalId?: string,
  pageUrl?: string
): string | null {
  if (externalId && /^[0-9A-Za-z_-]{11}$/.test(externalId)) {
    return externalId;
  }
  if (!pageUrl) return null;
  const match = pageUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([0-9A-Za-z_-]{11})/
  );
  return match ? match[1] : null;
}

export function mapUiQualityToYouTubeCode(quality: string): string {
  switch (quality) {
    case "4K":
      return "hd2160";
    case "2K":
      return "hd1440";
    case "1080P":
      return "hd1080";
    case "720P":
      return "hd720";
    case "480P":
      return "large";
    default:
      return "hd1080";
  }
}

export function mapYouTubeCodeToUiQuality(code: string): string {
  switch (code) {
    case "highres":
    case "hd2160":
      return "4K";
    case "hd1440":
      return "2K";
    case "hd1080":
      return "1080P";
    case "hd720":
      return "720P";
    case "large":
      return "480P";
    case "medium":
      return "360P";
    case "small":
      return "240P";
    default:
      return code.toUpperCase();
  }
}

let ytApiPromise: Promise<YtNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YtNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SSR"));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YtNamespace>((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error("YouTube IFrame API 加载超时"));
    }, 10000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      prevReady?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        ytApiPromise = null;
        reject(new Error("YouTube IFrame API 未就绪"));
      }
    };

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        ytApiPromise = null;
        reject(new Error("YouTube IFrame 脚本加载失败"));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

interface YouTubeHdPlayerProps {
  ref?: React.Ref<YouTubeHdPlayerHandle>;
  videoId: string;
  initialTimeSec: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  preferredQuality: string;
  onTimeUpdate: (sec: number) => void;
  onDurationReady: (durationSec: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onBufferingChange: (buffering: boolean) => void;
  onActualQualityChange: (qualityLabel: string, maxAvailableLabel?: string) => void;
  onEnded: () => void;
  onEmbedUnavailable: () => void;
}

export function YouTubeHdPlayer({
  ref,
  videoId,
  initialTimeSec,
  isPlaying,
  playbackRate,
  volume,
  preferredQuality,
  onTimeUpdate,
  onDurationReady,
  onPlayingChange,
  onBufferingChange,
  onActualQualityChange,
  onEnded,
  onEmbedUnavailable,
}: YouTubeHdPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayerInstance | null>(null);
  const readyRef = useRef(false);

  const latestPropsRef = useRef({
    initialTimeSec,
    isPlaying,
    playbackRate,
    volume,
    preferredQuality,
    onTimeUpdate,
    onDurationReady,
    onPlayingChange,
    onBufferingChange,
    onActualQualityChange,
    onEnded,
    onEmbedUnavailable,
  });

  useEffect(() => {
    latestPropsRef.current = {
      initialTimeSec,
      isPlaying,
      playbackRate,
      volume,
      preferredQuality,
      onTimeUpdate,
      onDurationReady,
      onPlayingChange,
      onBufferingChange,
      onActualQualityChange,
      onEnded,
      onEmbedUnavailable,
    };
  });

  function applyQuality(player: YtPlayerInstance, uiQuality: string) {
    const ytCode = mapUiQualityToYouTubeCode(uiQuality);
    try {
      player.setPlaybackQualityRange?.(ytCode, ytCode);
      player.setPlaybackQuality?.(ytCode);
    } catch {
      /* YouTube may cap quality to the source upload's maximum resolution. */
    }
  }

  function reportQuality(player: YtPlayerInstance) {
    try {
      const active = player.getPlaybackQuality?.();
      const levels = player.getAvailableQualityLevels?.() ?? [];
      const maxCode = levels.find((l) => l !== "auto");
      const maxLabel = maxCode ? mapYouTubeCodeToUiQuality(maxCode) : undefined;
      if (active && active !== "unknown") {
        latestPropsRef.current.onActualQualityChange(
          mapYouTubeCodeToUiQuality(active),
          maxLabel
        );
      } else if (maxLabel) {
        latestPropsRef.current.onActualQualityChange(maxLabel, maxLabel);
      }
    } catch {
      /* ignore */
    }
  }

  useImperativeHandle(ref, () => ({
    play() {
      if (readyRef.current) playerRef.current?.playVideo();
    },
    pause() {
      if (readyRef.current) playerRef.current?.pauseVideo();
    },
    seekTo(sec: number) {
      if (readyRef.current) playerRef.current?.seekTo(sec, true);
    },
    setPlaybackRate(rate: number) {
      if (readyRef.current) playerRef.current?.setPlaybackRate(rate);
    },
    setVolume(volume01: number) {
      if (readyRef.current) {
        playerRef.current?.setVolume(Math.round(volume01 * 100));
      }
    },
    setQuality(quality: string) {
      if (readyRef.current && playerRef.current) {
        applyQuality(playerRef.current, quality);
        window.setTimeout(() => {
          if (playerRef.current) reportQuality(playerRef.current);
        }, 800);
      }
    },
  }));

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    let cancelled = false;
    let pollTimer: number | null = null;
    readyRef.current = false;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        const mountNode = document.createElement("div");
        mountNode.style.width = "100%";
        mountNode.style.height = "100%";
        hostRef.current.appendChild(mountNode);

        const initial = latestPropsRef.current;
        let pendingInitialSeek: { target: number; deadline: number } | null =
          initial.initialTimeSec > 1
            ? {
                target: initial.initialTimeSec,
                deadline: Date.now() + 6000,
              }
            : null;

        const player = new YT.Player(mountNode, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: initial.isPlaying ? 1 : 0,
            start: Math.floor(Math.max(0, initial.initialTimeSec)),
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            fs: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              readyRef.current = true;
              const cur = latestPropsRef.current;
              disableYouTubeCaptions(player);
              player.setVolume(Math.round(cur.volume * 100));
              player.setPlaybackRate(cur.playbackRate);
              applyQuality(player, cur.preferredQuality);
              const dur = player.getDuration();
              if (Number.isFinite(dur) && dur > 1) {
                cur.onDurationReady(Math.round(dur));
              }
              if (cur.initialTimeSec > 1) {
                pendingInitialSeek = {
                  target: cur.initialTimeSec,
                  deadline: Date.now() + 6000,
                };
                player.seekTo(cur.initialTimeSec, true);
              }
              if (cur.isPlaying) {
                player.playVideo();
              }
              reportQuality(player);
            },
            onApiChange: () => {
              if (cancelled) return;
              disableYouTubeCaptions(player);
            },
            onStateChange: (ev) => {
              if (cancelled) return;
              const cur = latestPropsRef.current;
              if (ev.data === YT.PlayerState.PLAYING) {
                disableYouTubeCaptions(player);
                if (pendingInitialSeek) {
                  const nowSec = player.getCurrentTime?.() ?? 0;
                  if (nowSec < pendingInitialSeek.target - 3) {
                    player.seekTo(pendingInitialSeek.target, true);
                  } else if (Math.abs(nowSec - pendingInitialSeek.target) <= 3) {
                    pendingInitialSeek = null;
                  }
                }
                cur.onBufferingChange(false);
                cur.onPlayingChange(true);
                reportQuality(player);
              } else if (ev.data === YT.PlayerState.PAUSED) {
                cur.onBufferingChange(false);
                cur.onPlayingChange(false);
              } else if (ev.data === YT.PlayerState.BUFFERING) {
                disableYouTubeCaptions(player);
                cur.onBufferingChange(true);
              } else if (ev.data === YT.PlayerState.ENDED) {
                pendingInitialSeek = null;
                cur.onBufferingChange(false);
                cur.onEnded();
              }
            },
            onPlaybackQualityChange: (ev) => {
              if (cancelled) return;
              const levels = player.getAvailableQualityLevels?.() ?? [];
              const maxCode = levels.find((l) => l !== "auto");
              latestPropsRef.current.onActualQualityChange(
                mapYouTubeCodeToUiQuality(ev.data),
                maxCode ? mapYouTubeCodeToUiQuality(maxCode) : undefined
              );
            },
            onError: () => {
              if (cancelled) return;
              latestPropsRef.current.onEmbedUnavailable();
            },
          },
        });

        playerRef.current = player;

        let captionCheckTick = 0;
        pollTimer = window.setInterval(() => {
          if (!readyRef.current || !playerRef.current) return;
          try {
            const t = playerRef.current.getCurrentTime();
            if (Number.isFinite(t) && t >= 0) {
              if (pendingInitialSeek) {
                if (Math.abs(t - pendingInitialSeek.target) <= 3) {
                  pendingInitialSeek = null;
                  latestPropsRef.current.onTimeUpdate(t);
                } else if (Date.now() >= pendingInitialSeek.deadline) {
                  pendingInitialSeek = null;
                  latestPropsRef.current.onTimeUpdate(t);
                }
              } else {
                latestPropsRef.current.onTimeUpdate(t);
              }
            }
            captionCheckTick += 1;
            if (captionCheckTick % 4 === 0) {
              const modules = playerRef.current.getOptions?.() ?? [];
              if (modules.includes("captions") || modules.includes("cc")) {
                disableYouTubeCaptions(playerRef.current);
              }
            }
          } catch {
            /* ignore */
          }
        }, 250);
      })
      .catch(() => {
        if (!cancelled) {
          latestPropsRef.current.onEmbedUnavailable();
        }
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId]);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full bg-black" />;
}
