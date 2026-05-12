export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameDay = isSameDay(d, now);
  if (sameDay) return '今天';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return '昨天';
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatLastSeen(iso: string | null | undefined, status?: string | null): string {
  if (status === 'online') return '在线';
  if (status === 'away') return '离开';
  if (!iso) return '离线';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚活跃';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前活跃`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前活跃`;
  return `${Math.floor(diff / 86400)} 天前活跃`;
}
