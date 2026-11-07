import type { LayerKind } from '../index';
import { LAYER_COLORS } from '../index';
import { SearchIcon } from './icons';

type Props = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  layerVisibility: Record<LayerKind, boolean>;
  layers: LayerKind[];
  onToggleLayer: (layer: LayerKind) => void;
  matchCount: number | null;
  /** 进程归属过滤（只有图里出现进程分组/进程时才显示）。 */
  showProcessFilter?: boolean;
  processFilter?: 'all' | 'user' | 'system';
  onProcessFilterChange?: (filter: 'all' | 'user' | 'system') => void;
};

/**
 * 画布工具条浮在画布左上角，而不是再占一条通栏。
 *
 * 上一版把「品牌 / 主机名」和「搜索 / 图层」拆成两条 100px 高的横栏，
 * 画布被压到只剩 860px；而搜索和图层的过滤本来就是画布的操作，跟页面导航不是一层。
 *
 * 这里也不再放「布局」下拉：对一张 10 个节点的图暴露 dagre / 力导向，
 * 只会让人选到一个 51% 缩放、字都看不清的结果。布局由画布按图的形状自己选。
 */
export default function CanvasToolbar({
  searchQuery,
  onSearchChange,
  layerVisibility,
  layers,
  onToggleLayer,
  matchCount,
  showProcessFilter = false,
  processFilter = 'all',
  onProcessFilterChange,
}: Props) {
  return (
    <div className="floating-bar pointer-events-auto flex h-10 items-center gap-0.5 rounded-[11px] px-1">
      <label className="relative flex items-center" aria-label="搜索节点">
        <SearchIcon className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint" />
        <input
          type="search"
          placeholder="搜索节点"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-8 w-[208px] rounded-[8px] bg-transparent pl-8 pr-2 text-[12px] text-ink placeholder:text-ink-faint focus:bg-canvas focus:outline-none"
        />
      </label>

      {searchQuery.trim() !== '' && matchCount != null && (
        <span className="tnum mr-1 shrink-0 text-[10.5px] text-ink-faint">
          {matchCount === 0 ? '无匹配' : `${matchCount} 个匹配`}
        </span>
      )}

      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />

      {layers.map((layer) => {
        const active = layerVisibility[layer];
        const color = LAYER_COLORS[layer];
        return (
          <button
            key={layer}
            type="button"
            onClick={() => onToggleLayer(layer)}
            data-active={active}
            title={color.label}
            className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[11px] transition-colors ${
              active ? 'bg-canvas text-ink-soft' : 'text-ink-faint hover:bg-canvas'
            }`}
          >
            <span
              className="size-2 rounded-[2px]"
              style={{
                backgroundColor: active ? color.border : 'transparent',
                border: `1.5px solid ${active ? color.border : 'var(--color-line-strong)'}`,
              }}
              aria-hidden
            />
            {color.short}
          </button>
        );
      })}

      {showProcessFilter ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
          <div className="flex items-center gap-0.5" role="group" aria-label="进程归属">
            {(
              [
                { value: 'all', label: '全部', hint: '用户进程与系统进程都显示' },
                { value: 'user', label: '用户', hint: '只看用户进程（藏起 com.apple.* / launchd 这类）' },
                { value: 'system', label: '系统', hint: '只看系统进程' },
              ] as const
            ).map((option) => {
              const active = processFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onProcessFilterChange?.(option.value)}
                  data-active={active}
                  title={option.hint}
                  aria-pressed={active}
                  className={`flex h-7 items-center rounded-[7px] px-2 text-[11px] transition-colors ${
                    active ? 'bg-canvas text-ink-soft' : 'text-ink-faint hover:bg-canvas'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

    </div>
  );
}
