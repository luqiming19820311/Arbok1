"use client";

import { useId } from "react";
import type { LlmProviderId } from "./types";

interface ProviderIconProps {
  provider: LlmProviderId;
  size?: "sm" | "md" | "lg";
}

export function ProviderIcon({ provider, size = "md" }: ProviderIconProps) {
  const uid = useId().replace(/:/g, "");
  const boxClass =
    size === "lg"
      ? "size-9 rounded-xl"
      : size === "sm"
        ? "size-5 rounded-md"
        : "size-7 rounded-lg";
  const svgSize = size === "lg" ? 22 : size === "sm" ? 14 : 18;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center border border-[var(--ui-border)] bg-[var(--ui-background)] shadow-2xs ${boxClass}`}
    >
      {renderProviderSvg(provider, svgSize, uid)}
    </span>
  );
}

function renderProviderSvg(provider: LlmProviderId, s: number, uid: string) {
  switch (provider) {
    case "claude-code":
    case "claude":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <g stroke="#D97757" strokeWidth="2.1" strokeLinecap="round">
            <line x1="12" y1="3" x2="12" y2="21" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
            <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
            <line x1="8.2" y1="3.8" x2="15.8" y2="20.2" strokeWidth="1.5" />
            <line x1="20.2" y1="8.2" x2="3.8" y2="15.8" strokeWidth="1.5" />
          </g>
        </svg>
      );

    case "codex":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2.5L20 7.1V16.9L12 21.5L4 16.9V7.1L12 2.5Z"
            fill="#5B7CFA"
          />
          <path
            d="M8.5 9.5L11.5 12L8.5 14.5M12.5 14.5H15.5"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "antigravity":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id={`agyGrad-${uid}`} x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4285F4" />
              <stop offset="52%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#34A853" />
            </linearGradient>
          </defs>
          <path
            d="M5.5 18.5C7.6 12.2 10 5.5 12 5.5C14 5.5 16.4 12.2 18.5 18.5"
            stroke={`url(#agyGrad-${uid})`}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M8.2 14.2C9.8 12.9 14.2 12.9 15.8 14.2"
            stroke={`url(#agyGrad-${uid})`}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "xiaomi-mimo":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <text
            x="12"
            y="10.5"
            textAnchor="middle"
            fill="currentColor"
            fontSize="5.4"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            Xiaomi
          </text>
          <text
            x="12"
            y="17.5"
            textAnchor="middle"
            fill="currentColor"
            fontSize="6.1"
            fontWeight="800"
            letterSpacing="0.4"
            fontFamily="system-ui, sans-serif"
          >
            MIMO
          </text>
        </svg>
      );

    case "deepseek":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M4.5 13.5C4.5 9.6 7.8 6.8 12.2 6.8C15.6 6.8 18.3 8.5 19.6 11.2C20.5 10.6 21.3 10.8 21.5 11.5C21.7 12.5 20.6 14 19.3 14.4C18.3 16.8 15.6 18.2 12.1 18.2C7.8 18.2 4.5 16.4 4.5 13.5Z"
            fill="#4D6BFE"
          />
          <path
            d="M7.2 8.2C6.4 6.6 5.2 6.1 4.2 6.4C4.9 7.6 5.1 8.8 5.2 9.8"
            stroke="#4D6BFE"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="15.2" cy="11.6" r="1.15" fill="#FFFFFF" />
        </svg>
      );

    case "siliconflow":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="4.5" y="13" width="9" height="4.5" rx="1.2" fill="#7C3AED" />
          <rect x="10.5" y="6.5" width="9" height="4.5" rx="1.2" fill="#6366F1" />
          <rect x="9.5" y="10.5" width="5" height="3.2" rx="0.8" fill="#8B5CF6" />
        </svg>
      );

    case "custom":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="#E4E4E7" />
          <text
            x="12"
            y="15.5"
            textAnchor="middle"
            fill="#3F3F46"
            fontSize="10"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            其
          </text>
        </svg>
      );

    case "tokendance":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="#E4E4E7" />
          <text
            x="12"
            y="15.8"
            textAnchor="middle"
            fill="#27272A"
            fontSize="10.5"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            T
          </text>
        </svg>
      );

    case "openrouter":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12H10.5M10.5 12L15.5 7.5H19M10.5 12L15.5 16.5H19"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="7.5" r="2" fill="currentColor" />
          <circle cx="19" cy="16.5" r="2" fill="currentColor" />
        </svg>
      );

    case "opencode-go":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect
            x="6.5"
            y="4.5"
            width="11"
            height="15"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="2.5"
          />
        </svg>
      );

    case "openai":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="3.2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 3.5C14.8 3.5 16.8 5.4 16.8 7.8C16.8 9.2 16 10.4 14.8 11.1" />
            <path d="M19.3 7.8C20.7 10.2 20 13 17.9 14.2C16.7 14.9 15.2 14.8 14 14.1" />
            <path d="M19.3 16.2C17.9 18.6 15.1 19.4 13 18.2C11.8 17.5 11.1 16.2 11.1 14.8" />
            <path d="M12 20.5C9.2 20.5 7.2 18.6 7.2 16.2C7.2 14.8 8 13.6 9.2 12.9" />
            <path d="M4.7 16.2C3.3 13.8 4 11 6.1 9.8C7.3 9.1 8.8 9.2 10 9.9" />
            <path d="M4.7 7.8C6.1 5.4 8.9 4.6 11 5.8C12.2 6.5 12.9 7.8 12.9 9.2" />
          </g>
        </svg>
      );

    case "gemini":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id={`geminiStar-${uid}`} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4285F4" />
              <stop offset="50%" stopColor="#9B72CB" />
              <stop offset="100%" stopColor="#D96570" />
            </linearGradient>
          </defs>
          <path
            d="M12 2.5C12.8 8.2 15.8 11.2 21.5 12C15.8 12.8 12.8 15.8 12 21.5C11.2 15.8 8.2 12.8 2.5 12C8.2 11.2 11.2 8.2 12 2.5Z"
            fill={`url(#geminiStar-${uid})`}
          />
        </svg>
      );

    case "kimi":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M15.8 4.8C11.4 5.2 8 8.9 8 13.4C8 16.8 9.9 19.7 12.8 21C8.1 20.8 4.5 17 4.5 12.2C4.5 7.4 8.4 3.5 13.2 3.5C14.1 3.5 15 3.7 15.8 4.8Z"
            fill="#1D4ED8"
          />
          <circle cx="16.5" cy="9.5" r="2.2" fill="#3B82F6" />
        </svg>
      );

    case "qwen":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3.5L18.8 7.5V15.5L12 19.5L5.2 15.5V7.5L12 3.5Z"
            stroke="#6366F1"
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11.5" r="2.5" fill="#6366F1" />
          <path d="M14 13.5L18.5 18" stroke="#6366F1" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );

    case "zhipu":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M5.5 6.5H18.5L6.5 17.5H18.5"
            stroke="#2563EB"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      );
  }
}
