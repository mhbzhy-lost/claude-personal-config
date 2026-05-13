/**
 * Generate a stable id for an upload item. Uses crypto.randomUUID when available,
 * falls back to a Math-based prefix (good enough for local id uniqueness).
 */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Human-readable file size. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** True if File looks like an image (image/* MIME). */
export function isImage(file: File): boolean {
  return /^image\//i.test(file.type);
}

/**
 * Check a file against accept (mime or extension list).
 * Returns null on pass, or an error string when rejected.
 */
export function validateAccept(file: File, accept?: string): string | null {
  if (!accept) return null;
  const list = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return null;
  const fileMime = (file.type || '').toLowerCase();
  const fileName = file.name.toLowerCase();
  for (const a of list) {
    if (a.startsWith('.')) {
      if (fileName.endsWith(a)) return null;
    } else if (a.endsWith('/*')) {
      const prefix = a.slice(0, -1); // 'image/'
      if (fileMime.startsWith(prefix)) return null;
    } else if (fileMime === a) {
      return null;
    }
  }
  return `不支持的文件类型: ${file.type || file.name}`;
}
