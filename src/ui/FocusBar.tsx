import { CloseIcon, FocusIcon } from './icons';

type Props = {
  label: string;
  onExit: () => void;
};

/**
 * 聚焦模式的状态条。焦点节点 + 一跳邻居保持高亮，其余压暗；
 * 这里明确写出聚焦路径和退出方式，避免用户不知道当前在看什么。
 */
export default function FocusBar({ label, onExit }: Props) {
  return (
    <div className="floating-bar flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[11px] text-brand-strong">
      <FocusIcon className="size-3.5 shrink-0" />
      <span className="font-semibold">聚焦</span>
      <span className="text-ink-faint">·</span>
      <span className="max-w-[280px] truncate font-medium" title={label}>
        {label}
      </span>
      <span className="ml-1 rounded border border-line px-1 py-0.5 text-[9px] text-ink-faint">
        Esc 退出
      </span>
      <button
        type="button"
        onClick={onExit}
        aria-label="退出聚焦"
        className="flex size-5 items-center justify-center rounded text-ink-faint transition-colors hover:bg-elevated hover:text-ink-soft"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}
