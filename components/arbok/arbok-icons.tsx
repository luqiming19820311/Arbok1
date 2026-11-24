"use client";

import { useId } from "react";

export function ArbokLogo({ size = 18 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="6" fill={`url(#arbokBrandGrad-${uid})`} />
      <path
        d="M6.5 15.5C8 11.5 9.8 8.5 12 8.5C14.2 8.5 13.5 15.5 15.8 15.5C17 15.5 17.8 13.8 18.5 12"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id={`arbokBrandGrad-${uid}`} x1="0" y1="0" x2="24" y2="24">
          <stop stopColor="#0062CC" />
          <stop offset="1" stopColor="#5856D6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function EqualizerBars({ playing }: { playing: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-[18px] items-end gap-[3px] ${playing ? "arbok-eq-playing" : ""}`}
    >
      <span className="arbok-eq-bar h-[5px] w-[3px] rounded-xs bg-white/90" />
      <span className="arbok-eq-bar h-[5px] w-[3px] rounded-xs bg-white/90" />
      <span className="arbok-eq-bar h-[5px] w-[3px] rounded-xs bg-white/90" />
      <span className="arbok-eq-bar h-[5px] w-[3px] rounded-xs bg-white/90" />
      <span className="arbok-eq-bar h-[5px] w-[3px] rounded-xs bg-white/90" />
    </div>
  );
}
