import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TopologyViewState } from '../view/useTopologyView';
import type { Theme } from '../types/theme';
import GraphRoot from './GraphRoot';
import TopologyCanvas from './TopologyCanvas';
import CanvasToolbar from './CanvasToolbar';
import FocusBar from './FocusBar';
import NodeDetailPanel from './NodeDetailPanel';
import NetworkBar from './NetworkBar';
import BackBar from './BackBar';

type Props = {
  view: TopologyViewState;
  theme: Theme;
  className?: string;
};

/**
 * 画布 + 工具条 + 聚焦条 + 详情抽屉。
 *
 * 这是「一张拓扑图」的完整视觉，不含产品外壳（顶栏 / 左栏 / 状态栏）。
 * 宿主把它放进自己的布局里即可；它自带 `GraphRoot`，所以外层不需要再包一层。
 */
export default function TopologyCanvasView({ view, theme, className = '' }: Props) {
  // 「居中」是一次性指令：nonce 变化即触发，点同一个按钮也能重复居中。
  const [centerTarget, setCenterTarget] = useState<{
    nodeId: string | null;
    nonce: number;
    inset: number;
  } | null>(null);

  // 详情卡贴着节点弹，所以要量画布与卡片的位置；挪窗口 / 换节点时重新量。
  const stageRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState<{ id: string; style: CSSProperties } | null>(null);

  useEffect(() => {
    const node = view.cardNode;
    const stage = stageRef.current;
    if (!node || !stage) {
      setCardBox(null);
      return;
    }
    const place = () => {
      const box = stage.getBoundingClientRect();
      const card = stage.querySelector<HTMLElement>(
        `[data-node-id="${node.id.replace(/"/g, '\\"')}"]`,
      );
      const rect = card?.getBoundingClientRect();
      const PAD = 12;
      const GAP = 12;
      const CARD_W = 340;
      // 默认在节点右侧；右边放不下就翻到左侧，再不行就贴右边缘。
      let left = rect ? rect.right - box.left + GAP : box.width - CARD_W - PAD;
      if (left + CARD_W > box.width - PAD) {
        left = rect ? rect.left - box.left - CARD_W - GAP : box.width - CARD_W - PAD;
      }
      const top = Math.max(PAD, Math.min(rect ? rect.top - box.top : PAD, box.height - 240));
      setCardBox({
        id: node.id,
        style: {
          left: Math.max(PAD, Math.min(left, box.width - CARD_W - PAD)),
          top,
          maxHeight: Math.max(240, box.height - top - PAD),
        },
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [view.cardNode]);

  const requestCenter = (nodeId: string | null) => {
    setCenterTarget({
      nodeId,
      nonce: Date.now(),
      // 详情现在是悬浮卡，不占列，居中不需要让位。
      inset: 0,
    });
  };

  // 有下钻路径就出面包屑：每一段都能点回去。
  const drilled = view.path.length > 0;

  return (
    <GraphRoot theme={theme} className={className}>
      <div className="relative min-w-0 flex-1" ref={stageRef}>
        <TopologyCanvas
          graph={view.displayGraph}
          selectedNodeId={view.selectedNodeId}
          onSelectNode={view.selectNode}
          onExpandNode={view.expandNode}
          searchQuery={view.searchQuery}
          layerVisibility={view.layerVisibility}
          processFilter={view.processFilter}
          networkFilter={view.networkFilter}
          networkFocusId={view.networkFocus?.id ?? null}
          scannedAt={view.scannedAt}
          hostArch={view.hostTopology?.host.arch ?? null}
          loading={view.loading}
          theme={theme}
          telemetry={view.telemetry}
          focusNodeId={view.focusNodeId}
          onFocusNode={view.focusNode}
          onLongPress={view.openCard}
          cardOpen={Boolean(view.cardNode)}
          hostMetrics={view.hostMetrics}
          onOpenHost={view.drillIntoHost}
          centerTarget={centerTarget}
          onRequestCenter={(nodeId) => requestCenter(nodeId)}
          onOpenNetwork={view.openNetwork}
          onOpenService={view.openService}
        />

        {/* 顶栏与状态条钉在同一列：它们是一组「当前视图的控制」，不该各自飘在图上。 */}
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col items-start gap-2">
          <CanvasToolbar
            searchQuery={view.searchQuery}
            onSearchChange={view.setSearch}
            layerVisibility={view.layerVisibility}
            layers={view.layers}
            onToggleLayer={view.toggleLayer}
            matchCount={view.matchCount}
            showProcessFilter={view.kinds.includes('ProcessGroup') || view.kinds.includes('ProcessRuntime')}
            processFilter={view.processFilter}
            onProcessFilterChange={(filter) => {
              view.setProcessFilter(filter);
              // 被过滤掉的节点不该继续占着详情抽屉。
              view.selectNode(null);
            }}
            showNetworkFilter={view.kinds.includes('NetworkSegment')}
            networkFilter={view.networkFilter}
            onNetworkFilterChange={(filter) => {
              view.setNetworkFilter(filter);
              view.selectNode(null);
            }}
          />

          {drilled ? <BackBar path={view.path} onGoTo={view.goTo} /> : null}
          {view.focusedNode && (
            <FocusBar
              label={view.focusLabel}
              onExit={view.clearFocus}
              onCenter={() => requestCenter(view.focusNodeId ?? view.selectedNodeId)}
            />
          )}
          {view.networkFocus && (
            <NetworkBar
              label={view.networkFocus.label}
              hostCount={view.networkFocus.hostCount}
              onClear={view.clearNetworkFocus}
            />
          )}
        </div>

        {view.error && (
          <div className="absolute bottom-4 left-4 z-30 flex max-w-md items-start gap-2 rounded-[10px] border border-danger-line bg-danger-soft px-3 py-2 text-[11px] text-danger-strong shadow-[0_8px_24px_-12px_rgba(16,24,40,0.25)]">
            <span className="mt-px shrink-0 font-semibold">出错</span>
            <span className="min-w-0 break-all">{view.error}</span>
            <button
              type="button"
              onClick={view.clearError}
              className="ml-auto shrink-0 rounded px-1 text-danger hover:text-danger-strong"
              aria-label="关闭错误提示"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <NodeDetailPanel
        variant="card"
        style={cardBox?.style}
        node={cardBox?.id === view.cardNode?.id ? view.cardNode : null}
        graph={view.displayGraph}
        hostTopology={view.hostTopology}
        processViewMode={view.processViewMode}
        loadedProcessGroups={view.loadedProcessGroups}
        onClose={view.closeCard}
        onCenter={() => requestCenter(view.cardNode?.id ?? null)}
        onOpenNetwork={view.openNetwork}
        onOpenService={view.openService}
        onFocusHost={(hostObjectId) => view.setHostId(hostObjectId)}
        onExpand={view.expandNode}
        status={view.selectedStatus}
        telemetry={view.selectedTelemetry}
        demo={view.telemetry.demo}
        focused={Boolean(view.cardNode && view.focusNodeId === view.cardNode.id)}
        onFocus={() => view.cardNode && view.focusNode(view.cardNode.id)}
        onExitFocus={view.clearFocus}
      />
    </GraphRoot>
  );
}
