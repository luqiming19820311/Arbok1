"use client";

import { Button } from "@ui-sdk/react/button";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ListVideoIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  EMPTY_DATE_FILTER,
  getEpisodePublishedDate,
  isEpisodeRead,
  type ChannelDateFilter,
} from "@/lib/arbok/episode-filters";
import { getPlatformMeta } from "./mock-data";
import type { Episode, Subscription } from "./types";

interface ChannelHeaderPanelProps {
  subscription: Subscription;
  channelEpisodes: Episode[];
  filteredCount: number;
  dateFilter: ChannelDateFilter;
  refreshing?: boolean;
  onDateFilterChange: (next: ChannelDateFilter) => void;
  onRefreshChannel: (subId: string) => void;
  onPlayAll: () => void;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function getPlatformChannelLabel(platform: Subscription["platform"]): string {
  switch (platform) {
    case "youtube":
      return "YouTube 频道";
    case "bilibili":
      return "B站 UP 主";
    case "xiaoyuzhou":
      return "小宇宙播客";
    case "local":
      return "本地媒体";
    default:
      return "播客频道";
  }
}

export function ChannelHeaderPanel({
  subscription,
  channelEpisodes,
  filteredCount,
  dateFilter,
  refreshing = false,
  onDateFilterChange,
  onRefreshChannel,
  onPlayAll,
}: ChannelHeaderPanelProps) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const meta = getPlatformMeta(subscription.platform);
  const coverUrl =
    subscription.coverUrl ??
    channelEpisodes.find((e) => e.coverUrl)?.coverUrl;
  const unreadCount = useMemo(
    () => channelEpisodes.filter((e) => !isEpisodeRead(e)).length,
    [channelEpisodes]
  );

  const dateStats = useMemo(() => {
    const byYear = new Map<number, number>();
    const byYearMonth = new Map<string, number>();
    const byYearMonthDay = new Map<string, number>();

    for (const ep of channelEpisodes) {
      const d = getEpisodePublishedDate(ep);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      byYear.set(y, (byYear.get(y) ?? 0) + 1);
      const ymKey = `${y}-${m}`;
      byYearMonth.set(ymKey, (byYearMonth.get(ymKey) ?? 0) + 1);
      const ymdKey = `${y}-${m}-${day}`;
      byYearMonthDay.set(ymdKey, (byYearMonthDay.get(ymdKey) ?? 0) + 1);
    }

    const years = Array.from(byYear.keys()).sort((a, b) => b - a);
    const defaultYear = years[0] ?? 2026;
    return { byYear, byYearMonth, byYearMonthDay, years, defaultYear };
  }, [channelEpisodes]);

  const activeYear = dateFilter.year ?? dateStats.defaultYear;
  const yearEpisodeCount = dateStats.byYear.get(activeYear) ?? 0;

  const latestActiveMonthForYear = useMemo(() => {
    for (let m = 12; m >= 1; m--) {
      if ((dateStats.byYearMonth.get(`${activeYear}-${m}`) ?? 0) > 0) {
        return m;
      }
    }
    return 1;
  }, [dateStats.byYearMonth, activeYear]);

  const calendarMonth = dateFilter.month ?? latestActiveMonthForYear;
  const showDayGrid = calendarExpanded || dateFilter.month !== null;

  const dayCells = useMemo(() => {
    const daysInMonth = new Date(activeYear, calendarMonth, 0).getDate();
    const firstWeekday = new Date(activeYear, calendarMonth - 1, 1).getDay();
    const leadingBlanks = (firstWeekday + 6) % 7;
    const cells: Array<{ day: number | null; count: number }> = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ day: null, count: 0 });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const count =
        dateStats.byYearMonthDay.get(`${activeYear}-${calendarMonth}-${day}`) ??
        0;
      cells.push({ day, count });
    }
    return cells;
  }, [activeYear, calendarMonth, dateStats.byYearMonthDay]);

  const hasActiveDateFilter =
    dateFilter.year !== null ||
    dateFilter.month !== null ||
    dateFilter.day !== null;

  const bioText = subscription.description?.trim() ?? "";
  const isLongBio = bioText.length > 110 || bioText.includes("\n");

  const activeDateSummary = useMemo(() => {
    if (!hasActiveDateFilter) return null;
    const y = dateFilter.year ?? activeYear;
    if (dateFilter.month !== null && dateFilter.day !== null) {
      return `${y}年${dateFilter.month}月${dateFilter.day}日`;
    }
    if (dateFilter.month !== null) {
      return `${y}年${dateFilter.month}月`;
    }
    return `${y}年`;
  }, [hasActiveDateFilter, dateFilter, activeYear]);

  return (
    <section
      aria-label="频道简介与日期筛选"
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-5 shadow-xs"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div
          className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-base font-bold text-white shadow-sm sm:size-24"
          style={{ background: subscription.gradient }}
          aria-hidden="true"
        >
          {coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            subscription.shortLabel
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ui-muted-foreground)]">
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: meta.fg, background: meta.bg }}
            >
              {getPlatformChannelLabel(subscription.platform)}
            </span>
            <span className="tabular-nums">
              共 {channelEpisodes.length} 期
            </span>
            <span>·</span>
            <span className="tabular-nums">{unreadCount} 期未读</span>
          </div>

          <h2 className="truncate text-xl font-bold tracking-tight text-[var(--ui-foreground)]">
            {subscription.name}
          </h2>

          <div className="text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
            {bioText ? (
              <>
                <p className={bioExpanded ? "whitespace-pre-line" : "line-clamp-2"}>
                  {bioText}
                </p>
                {isLongBio && (
                  <Button
                    aria-label={bioExpanded ? "收起频道简介" : "展开频道简介"}
                    className="mt-1 h-6 border-transparent bg-transparent px-0 text-[11.5px] font-medium text-[var(--arbok-accent-text)] hover:bg-transparent hover:underline"
                    onClick={() => setBioExpanded((v) => !v)}
                  >
                    {bioExpanded ? "收起简介" : "展开完整简介"}
                  </Button>
                )}
              </>
            ) : (
              <p className="italic opacity-75">
                暂无频道简介，点击「检查更新」自动拉取频道资料。
              </p>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button
              aria-label={`检查更新 ${subscription.name}`}
              disabled={refreshing}
              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
              onClick={() => onRefreshChannel(subscription.id)}
            >
              <RefreshCwIcon
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>{refreshing ? "正在检查更新…" : "检查更新"}</span>
            </Button>
            <Button
              aria-label={`播放全部 ${subscription.name}`}
              disabled={filteredCount === 0}
              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
              onClick={onPlayAll}
            >
              <ListVideoIcon className="size-3.5" aria-hidden="true" />
              <span>播放全部</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--ui-border)] pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarIcon
              className="size-3.5 text-[var(--ui-muted-foreground)]"
              aria-hidden="true"
            />
            <Button
              aria-label="上一年"
              className="size-7 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:bg-[var(--ui-muted)] hover:text-[var(--ui-foreground)]"
              onClick={() =>
                onDateFilterChange({
                  year: activeYear - 1,
                  month: null,
                  day: null,
                })
              }
            >
              <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              aria-label={`按年份筛选 ${activeYear} 年`}
              aria-pressed={dateFilter.year === activeYear}
              className={`tabular-nums h-7 rounded-md px-2 text-xs font-semibold ${
                dateFilter.year === activeYear
                  ? "border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)] text-[var(--arbok-accent-text)]"
                  : "border-transparent bg-transparent text-[var(--ui-foreground)] hover:bg-[var(--ui-muted)]"
              }`}
              onClick={() => {
                if (
                  dateFilter.year === activeYear &&
                  dateFilter.month === null &&
                  dateFilter.day === null
                ) {
                  onDateFilterChange(EMPTY_DATE_FILTER);
                } else {
                  onDateFilterChange({
                    year: activeYear,
                    month: null,
                    day: null,
                  });
                }
              }}
            >
              {activeYear}
            </Button>
            <Button
              aria-label="下一年"
              className="size-7 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:bg-[var(--ui-muted)] hover:text-[var(--ui-foreground)]"
              onClick={() =>
                onDateFilterChange({
                  year: activeYear + 1,
                  month: null,
                  day: null,
                })
              }
            >
              <ChevronRightIcon className="size-3.5" aria-hidden="true" />
            </Button>
            <span className="tabular-nums ml-1 text-xs text-[var(--ui-muted-foreground)]">
              {yearEpisodeCount} 期
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeDateSummary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--arbok-accent-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--arbok-accent-text)]">
                <span>已选：{activeDateSummary}</span>
                <Button
                  aria-label="清除日期筛选"
                  className="size-4 border-transparent bg-transparent p-0 text-current hover:bg-transparent"
                  onClick={() => onDateFilterChange(EMPTY_DATE_FILTER)}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
              </span>
            )}
            <Button
              aria-label={showDayGrid ? "收起按天筛选日历" : "展开按天筛选日历"}
              aria-expanded={showDayGrid}
              className="h-7 gap-1 rounded-md border-[var(--ui-border)] bg-transparent px-2.5 text-[11.5px] text-[var(--ui-muted-foreground)] hover:bg-[var(--ui-muted)] hover:text-[var(--ui-foreground)]"
              onClick={() => {
                if (dateFilter.month !== null && showDayGrid) {
                  onDateFilterChange({
                    year: dateFilter.year,
                    month: null,
                    day: null,
                  });
                  setCalendarExpanded(false);
                } else {
                  setCalendarExpanded((v) => !v);
                }
              }}
            >
              <span>按日筛选</span>
              {showDayGrid ? (
                <ChevronUpIcon className="size-3" aria-hidden="true" />
              ) : (
                <ChevronDownIcon className="size-3" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <div
          role="group"
          aria-label="按月份筛选"
          className="grid grid-cols-6 gap-1 sm:grid-cols-12"
        >
          {MONTHS.map((m) => {
            const count = dateStats.byYearMonth.get(`${activeYear}-${m}`) ?? 0;
            const selected =
              dateFilter.year === activeYear && dateFilter.month === m;
            return (
              <Button
                key={m}
                aria-label={`筛选 ${activeYear} 年 ${m} 月（${count} 期）`}
                aria-pressed={selected}
                className={`flex h-auto flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors ${
                  selected
                    ? "border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)] text-[var(--arbok-accent-text)]"
                    : count > 0
                      ? "border-transparent bg-transparent text-[var(--ui-foreground)] hover:bg-[var(--ui-muted)]"
                      : "border-transparent bg-transparent text-[var(--ui-muted-foreground)]/55 hover:bg-[var(--ui-muted)]/60"
                }`}
                onClick={() => {
                  if (selected) {
                    onDateFilterChange({
                      year: activeYear,
                      month: null,
                      day: null,
                    });
                    setCalendarExpanded(false);
                  } else {
                    onDateFilterChange({
                      year: activeYear,
                      month: m,
                      day: null,
                    });
                    setCalendarExpanded(true);
                  }
                }}
              >
                <span className="text-[11.5px] font-medium">{m}月</span>
                <span
                  className={`tabular-nums text-[11px] font-semibold ${
                    count > 0
                      ? selected
                        ? "text-[var(--arbok-accent-text)]"
                        : "text-[var(--ui-foreground)]"
                      : "text-transparent"
                  }`}
                >
                  {count > 0 ? count : "0"}
                </span>
              </Button>
            );
          })}
        </div>

        {showDayGrid && (
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-canvas)]/70 p-3">
            <div className="mb-2 flex items-center justify-between text-[11.5px]">
              <span className="font-semibold text-[var(--ui-foreground)]">
                {activeYear} 年 {calendarMonth} 月 · 按天筛选
              </span>
              <span className="text-[var(--ui-muted-foreground)]">
                绿色高亮日期表示当天有更新，点击筛选当日单集
              </span>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10.5px] font-medium text-[var(--ui-muted-foreground)]">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div
              role="group"
              aria-label="按日期筛选"
              className="grid grid-cols-7 gap-1"
            >
              {dayCells.map((cell, idx) => {
                if (cell.day === null) {
                  return <div key={`blank-${idx}`} className="h-7" />;
                }
                const dayNum = cell.day;
                const isSelectedDay =
                  dateFilter.year === activeYear &&
                  dateFilter.month === calendarMonth &&
                  dateFilter.day === dayNum;
                const hasItems = cell.count > 0;
                return (
                  <Button
                    key={`day-${dayNum}`}
                    aria-label={`筛选 ${activeYear} 年 ${calendarMonth} 月 ${dayNum} 日（${cell.count} 期）`}
                    aria-pressed={isSelectedDay}
                    title={
                      hasItems
                        ? `${activeYear}-${String(calendarMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")} · ${cell.count} 期`
                        : `${activeYear}-${String(calendarMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")} · 无更新`
                    }
                    className={`tabular-nums relative flex h-7 items-center justify-center rounded-md border p-0 text-[11.5px] font-medium transition-colors ${
                      isSelectedDay
                        ? "border-[var(--ui-primary)] bg-[var(--ui-primary)] text-white shadow-xs"
                        : hasItems
                          ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                          : "border-transparent bg-[var(--ui-muted)]/55 text-[var(--ui-muted-foreground)]/70 hover:bg-[var(--ui-muted)]"
                    }`}
                    onClick={() => {
                      if (isSelectedDay) {
                        onDateFilterChange({
                          year: activeYear,
                          month: calendarMonth,
                          day: null,
                        });
                      } else {
                        onDateFilterChange({
                          year: activeYear,
                          month: calendarMonth,
                          day: dayNum,
                        });
                      }
                    }}
                  >
                    <span>{dayNum}</span>
                    {hasItems && !isSelectedDay && (
                      <span
                        className="absolute right-1 bottom-0.5 size-1 rounded-full bg-emerald-500"
                        aria-hidden="true"
                      />
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
