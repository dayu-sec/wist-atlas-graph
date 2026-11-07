import { useState } from 'react';
import type { TopologyViewState } from '../view/useTopologyView';
import type { Theme } from '../types/theme';
import GraphRoot from './GraphRoot';
import TopologyCanvas from './TopologyCanvas';
import CanvasToolbar from './CanvasToolbar';
import FocusBar from './FocusBar';
import NodeDetailPanel from './NodeDetailPanel';

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

  const requestCenter = (nodeId: string | null) => {
    setCenterTarget({
      nodeId,
      nonce: Date.now(),
      // 详情抽屉是覆盖层：居中要按它让位，否则卡片会被压在抽屉底下。
      inset: view.selectedNodeId || view.focusNodeId ? 336 : 0,
    });
  };

  return (
    <GraphRoot theme={theme} className={className}>
      <div className="relative min-w-0 flex-1">
        <TopologyCanvas
          graph={view.displayGraph}
          selectedNodeId={view.selectedNodeId}
          onSelectNode={view.selectNode}
          onExpandNode={view.expandNode}
          searchQuery={view.searchQuery}
          layerVisibility={view.layerVisibility}
          processFilter={view.processFilter}
          networkFilter={view.networkFilter}
          scannedAt={view.scannedAt}
          hostArch={view.hostTopology?.host.arch ?? null}
          loading={view.loading}
          theme={theme}
          telemetry={view.telemetry}
          focusNodeId={view.focusNodeId}
          onFocusNode={view.focusNode}
          hostMetrics={view.hostMetrics}
          onOpenHost={view.setHostId}
          centerTarget={centerTarget}
        />

        <div className="pointer-events-none absolute left-4 top-4 z-20">
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
        </div>

        {view.focusedNode && (
          <div className="pointer-events-none absolute left-4 top-[62px] z-20">
            <FocusBar
              label={view.focusLabel}
              onExit={view.clearFocus}
              onCenter={() => requestCenter(view.focusNodeId ?? view.selectedNodeId)}
            />
          </div>
        )}

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
        node={view.selectedNode}
        graph={view.displayGraph}
        hostTopology={view.hostTopology}
        processViewMode={view.processViewMode}
        loadedProcessGroups={view.loadedProcessGroups}
        onClose={() => view.selectNode(null)}
        onCenter={() => requestCenter(view.selectedNodeId)}
        onOpenNetwork={view.openNetwork}
        onOpenService={view.openService}
        onFocusHost={(hostObjectId) => view.setHostId(hostObjectId)}
        onExpand={view.expandNode}
        status={view.selectedStatus}
        telemetry={view.selectedTelemetry}
        demo={view.telemetry.demo}
        focused={Boolean(view.selectedNode && view.focusNodeId === view.selectedNode.id)}
        onFocus={() => view.selectedNode && view.focusNode(view.selectedNode.id)}
        onExitFocus={view.clearFocus}
      />
    </GraphRoot>
  );
}
