export interface TtsSyncInput {
  videoSegIndex: number;
  ttsSegIndex: number;
  pausedByTts: boolean;
  lagThreshold?: number;
}

export interface TtsSyncDecision {
  action: "pause_video" | "resume_video" | "hold";
  lag: number;
}

/* Pause video when English video leads Chinese TTS by >= 2 sentences; resume once Chinese catches up. */
export function evaluateTtsSync(input: TtsSyncInput): TtsSyncDecision {
  const threshold = input.lagThreshold ?? 2;
  const lag = input.videoSegIndex - input.ttsSegIndex;

  if (!input.pausedByTts && lag >= threshold) {
    return { action: "pause_video", lag };
  }
  if (input.pausedByTts && lag <= 0) {
    return { action: "resume_video", lag };
  }
  return { action: "hold", lag };
}

export function canResumePausedTtsAudio(
  audio: { paused: boolean; ended: boolean; currentTime: number; duration: number } | null
): boolean {
  if (!audio) return false;
  if (audio.ended || !audio.paused) return false;
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.currentTime > 0 && audio.currentTime < audio.duration - 0.05;
  }
  return audio.currentTime > 0;
}

export function computeOverlayFontPx(
  pct: number,
  kind: "zh" | "orig"
): number {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 0) return 0;
  if (kind === "zh") {
    return Math.round(16 + (clamped / 100) * 54);
  }
  return Math.round(14 + (clamped / 100) * 36);
}

export function computeListFontPx(pct: number, kind: "zh" | "orig"): number {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 0) return 0;
  if (kind === "zh") {
    return Math.round(11 + (clamped / 100) * 6);
  }
  return Math.round(11 + (clamped / 100) * 5);
}
