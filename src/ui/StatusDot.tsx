import type { NodeStatus, StatusTone } from '../index';
import { STATUS_LABELS } from '../index';

type Props = {
  tone: StatusTone;
  label?: string;
  className?: string;
};

export default function StatusDot({ tone, label, className = '' }: Props) {
  const text = label ?? STATUS_LABELS[tone];
  return <span className={`dot ${tone} ${className}`} title={text} aria-label={text} />;
}

export function StatusPill({ status }: { status: NodeStatus }) {
  const tone =
    status.tone === 'ok'
      ? 'text-ok'
      : status.tone === 'warn'
        ? 'text-warn'
        : status.tone === 'danger'
          ? 'text-danger'
          : 'text-ink-faint';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      <span className={`dot ${status.tone}`} aria-hidden />
      {status.label}
    </span>
  );
}
