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
  /** 网段归属过滤（只有图里出现网段时才显示）。 */
  showNetworkFilter?: boolean;
  networkFilter?: 'all' | 'shared' | 'host';
  onNetworkFilterChange?: (filter: 'all' | 'shared' | 'host') => void;
};

/**
 * 画布工具条浮在画布左上角，而不是再占一条通栏。
 *
 * 搜索和图层的过滤本来就是画布的操作，跟页面导航不是一层。
 * 进程 / 网段两组过滤各带一个 9.5px 的小标题 —— 两组都有「全部」，不标名字会分不清。
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
  showNetworkFilter = false,
  networkFilter = 'all',
  onNetworkFilterChange,
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
        <FilterGroup
          label="进程"
          value={processFilter}
          onChange={onProcessFilterChange}
          options={[
            { value: 'all', label: '全部', hint: '用户进程与系统进程都显示' },
            { value: 'user', label: '用户', hint: '只看用户进程（藏起 com.apple.* / launchd 这类）' },
            { value: 'system', label: '系统', hint: '只看系统进程' },
          ]}
        />
      ) : null}

      {showNetworkFilter ? (
        <FilterGroup
          label="网络"
          value={networkFilter}
          onChange={onNetworkFilterChange}
          options={[
            { value: 'all', label: '全部', hint: '本机内部与共享网段都显示' },
            {
              value: 'shared',
              label: '共享',
              hint: '只看可路由 / 共享网段（藏起回环、链路本地、虚拟网桥）',
            },
            {
              value: 'host',
              label: '本机',
              hint: '只看本机内部网络（lo / 169.254 / docker0 / utun…）',
            },
          ]}
        />
      ) : null}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange?: (value: T) => void;
  options: readonly { value: T; label: string; hint: string }[];
}) {
  return (
    <>
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <span className="shrink-0 px-1 text-[9.5px] font-medium tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      <div className="flex items-center gap-0.5" role="group" aria-label={label}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange?.(option.value)}
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
  );
}
