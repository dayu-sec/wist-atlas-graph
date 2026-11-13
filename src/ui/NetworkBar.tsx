import { CloseIcon, NetworkGlyph } from './icons';

type Props = {
  label: string;
  hostCount: number;
  onClear: () => void;
};

/**
 * 「只看这个网段」的状态条。
 *
 * 选中共享网段后画布只剩「该网段 + 它的主机」；这条把当前筛的是哪个网段、
 * 里面有多少台机器、怎么退出写清楚 —— 否则用户会以为别的主机消失了。
 * 点空白或按 Esc 同样能清除，但筛选后画布往往铺满了，空白处不好点，所以这里必须能点。
 */
export default function NetworkBar({ label, hostCount, onClear }: Props) {
  return (
    <div className="floating-bar pointer-events-auto flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[11px] text-brand-strong">
      <NetworkGlyph className="size-3.5 shrink-0" />
      <span className="font-semibold">只看网段</span>
      <span className="text-ink-faint">·</span>
      <span className="max-w-[220px] truncate font-medium" title={label}>
        {label}
      </span>
      <span className="rounded border border-line px-1 py-0.5 text-[9px] text-ink-faint">
        {hostCount} 台主机
      </span>
      <button
        type="button"
        onClick={onClear}
        title="回到全部主机（点空白 / Esc 同样可以）"
        className="ml-0.5 flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[9px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
      >
        <CloseIcon className="size-3" />
        显示全部
      </button>
    </div>
  );
}
