/**
 * Smart timestamp formatter for chat lists.
 *  - Today:     HH:mm
 *  - Yesterday: 昨天
 *  - This week: 周X
 *  - Older:     yyyy-MM-dd
 */
export function smartTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return '昨天';
  }

  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function previewText(content: { kind: string; text?: string; code?: string }): string {
  switch (content.kind) {
    case 'text': return content.text ?? '';
    case 'image': return '[图片]';
    case 'file': return '[文件]';
    case 'system': return `[系统消息: ${content.code ?? ''}]`;
    case 'recall': return '[已撤回]';
    default: return '';
  }
}
