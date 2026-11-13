import { Fragment } from 'react';
import type { TopologyLevel } from '../view/useTopologyView';

type Props = {
  /** 从总览往下钻的路径（不含总览）。最后一段是当前层。 */
  path: TopologyLevel[];
  /** 跳回某一段：`-1` = 总览。 */
  onGoTo: (index: number) => void;
};

function crumbLabel(level: TopologyLevel): string {
  if (level.label) return level.label;
  // 图还没拉回来（标签要等图）时给个能认的兜底，不要显示一长串 objectId。
  return level.kind === 'network' ? '网段' : level.kind === 'service' ? '服务' : '主机';
}

/**
 * 下钻路径：`全部主机（总览） / 主机 A / 网段 10.168.0.0/24`。
 *
 * 每一段都能点回去 —— 主机 → 网段 → 再返回时回到那台主机，而不是一路跳回总览。
 * 画布可以下钻到单台主机、一个网段、一个服务；不把这层关系写在画布上，
 * 用户进了下一层就只能去顶栏翻选择器（很多宿主根本没有），看起来像「回不去」。
 */
export default function BackBar({ path, onGoTo }: Props) {
  return (
    <div className="floating-bar pointer-events-auto flex h-9 items-center gap-1.5 overflow-hidden rounded-[10px] px-1.5 text-[11px]">
      <button
        type="button"
        onClick={() => onGoTo(-1)}
        title="回到全部主机（总览）"
        className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-brand-strong transition-colors hover:bg-elevated"
      >
        全部主机（总览）
      </button>

      {path.map((level, index) => {
        const current = index === path.length - 1;
        return (
          <Fragment key={`${level.kind}:${level.id}`}>
            <span className="shrink-0 text-ink-faint">/</span>
            {current ? (
              <span
                className="max-w-[220px] truncate font-medium text-ink-soft"
                title={crumbLabel(level)}
              >
                {crumbLabel(level)}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onGoTo(index)}
                title={crumbLabel(level)}
                className="max-w-[200px] truncate rounded-md px-1.5 py-0.5 text-ink-soft transition-colors hover:bg-elevated hover:text-ink"
              >
                {crumbLabel(level)}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
