import type { EventItem } from '../types';

export interface EventGroup {
  /** Display label (e.g. "今天" / "2026-05-13" / "2026-05"). */
  label: string;
  /** Items in this group, already ordered. */
  items: EventItem[];
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function dayLabel(d: Date, now: Date): string {
  const today =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (today) return '今天';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return '昨天';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function groupAndSort(
  items: EventItem[],
  groupBy: 'none' | 'day' | 'month',
  order: 'asc' | 'desc',
  now: Date = new Date(),
): EventGroup[] {
  const sorted = [...items].sort((a, b) => {
    const av = Date.parse(a.timestamp) || 0;
    const bv = Date.parse(b.timestamp) || 0;
    return order === 'asc' ? av - bv : bv - av;
  });

  if (groupBy === 'none') return [{ label: '', items: sorted }];

  const groups = new Map<string, EventItem[]>();
  for (const it of sorted) {
    const d = new Date(it.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const label = groupBy === 'day' ? dayLabel(d, now) : monthLabel(d);
    const arr = groups.get(label);
    if (arr) arr.push(it);
    else groups.set(label, [it]);
  }
  return Array.from(groups.entries()).map(([label, gItems]) => ({ label, items: gItems }));
}

/** "HH:mm" for a within-day timestamp, or full date if older. */
export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
