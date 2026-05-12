import { formatDateLabel } from '../utils/time';

export function DateDivider({ iso }: { iso: string }) {
  return (
    <div className="chat-date-divider" role="separator">
      <span>{formatDateLabel(iso)}</span>
    </div>
  );
}
