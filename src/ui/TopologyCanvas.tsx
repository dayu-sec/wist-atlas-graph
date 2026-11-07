import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import coseBilkent from 'cytoscape-cose-bilkent';
import type { HostProcessTopologyGraph, LayerKind, NodeKind } from '../index';
import type { Theme } from '../index';
import { graphToCyElements } from './graph-to-cy';
import { buildSearchIndex } from '../index';
import {
  computeFocusLayout,
  computeOverviewLayout,
  computeRuntimeLayout,
  computeServiceLayout,
  type LaneAnnotation,
} from '../index';
import { nodeDims } from '../index';
import { passesNetworkFilter, passesProcessFilter, resolveNodeStatus, type NodeStatus } from '../index';
import type { TelemetryMap } from '../index';
import NodeCard, { type GraphNodeHint, type HostStats } from './NodeCard';
import { FitIcon, MinusIcon, PlusIcon } from './icons';

cytoscape.use(dagre);
cytoscape.use(coseBilkent);

type Props = {
  graph: HostProcessTopologyGraph | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onExpandNode: (nodeId: string) => void;
  searchQuery: string;
  layerVisibility: Record<LayerKind, boolean>;
  /** 进程归属过滤：系统进程太多时先藏起来。 */
  processFilter?: 'all' | 'user' | 'system';
  /** 网段归属过滤：本机内部（lo / 链路本地 / 虚拟网桥）可以单独看。 */
  networkFilter?: 'all' | 'shared' | 'host';
  scannedAt?: string | null;
  hostArch?: string | null;
  loading: boolean;
  theme: Theme;
  telemetry: TelemetryMap;
  focusNodeId: string | null;
  onFocusNode: (nodeId: string) => void;
  /** 总览里每台主机的规模（来自主机列表），单主机视图可以不给。 */
  hostMetrics?: Record<string, { segments: number; processes: number }>;
  /** 总览里双击主机 → 进入这台主机的拓扑。 */
  onOpenHost?: (hostObjectId: string) => void;
  /** 宿主请求把某个节点放到画布中心（nonce 变化即触发）。 */
  centerTarget?: { nodeId: string | null; nonce: number; inset: number } | null;
  /** 选中节点后浮在卡片上方的快捷操作（由宿主提供动作，画布只负责摆位置）。 */
  onRequestCenter?: (nodeId: string) => void;
  onOpenNetwork?: (segmentObjectId: string) => void;
  onOpenService?: (serviceObjectId: string) => void;
};

const LAYOUT_OPTIONS: Record<'dagre' | 'cose-bilkent', cytoscape.LayoutOptions> = {
  // 卡片比几何节点宽得多，rank/node 间距必须跟着放大，否则标签会互相压。
  dagre: {
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: 48,
    rankSep: 128,
    edgeSep: 20,
    padding: 48,
    animate: false,
  } as cytoscape.LayoutOptions,
  'cose-bilkent': {
    name: 'cose-bilkent',
    idealEdgeLength: 190,
    nodeRepulsion: 14000,
    gravity: 0.2,
    animate: false,
  } as cytoscape.LayoutOptions,
};

/** 图变深之后的两个落点：分层 / 力导向。 */
type ConcreteLayout = 'dagre' | 'cose-bilkent';

const EDGE_THEME = {
  light: {
    base: '#c3ccd9',
    network: '#cbd5e1',
    responsibility: '#e4d7fb',
    neighbor: '#7c3aed',
    hot: '#94a3b8',
    dimOpacity: 0.16,
  },
  dark: {
    base: '#26374f',
    network: '#334a6a',
    responsibility: '#3d3168',
    neighbor: '#a78bfa',
    hot: '#cbd5e1',
    dimOpacity: 0.12,
  },
} as const;

function buildCyStyle(theme: Theme) {
  const edge = EDGE_THEME[theme];
  return [
    {
      selector: 'node',
      style: {
        // 节点的可见外形交给 HTML 卡片；cytoscape 只负责布局、连线和命中区。
        width: (element: cytoscape.NodeSingular) =>
          nodeDims(element.data('objectKind') as NodeKind).width,
        height: (element: cytoscape.NodeSingular) =>
          nodeDims(element.data('objectKind') as NodeKind).height,
        shape: 'round-rectangle',
        'background-opacity': 0,
        'border-width': 0,
        label: '',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.4,
        'line-color': edge.base,
        'curve-style': 'bezier',
        'control-point-step-size': 36,
        'line-cap': 'round',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge[edgeKind = "host_network_assoc"]',
      style: { 'line-color': edge.network },
    },
    {
      selector: 'edge[edgeKind = "responsibility_assignment"]',
      style: { 'line-color': edge.responsibility, 'line-style': 'dashed' },
    },
    {
      selector: 'edge.neighbor',
      style: { width: 2, 'line-color': edge.neighbor },
    },
    {
      selector: 'edge.hot',
      style: { width: 2, 'line-color': edge.hot },
    },
    {
      selector: 'edge.dimmed',
      style: { opacity: edge.dimOpacity },
    },
    {
      selector: 'edge.muted',
      style: { opacity: 0.08 },
    },
  ] as cytoscape.StylesheetStyle[];
}

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.4;
const FIT_ZOOM_CAP = 1.08;

export default function TopologyCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
  onExpandNode,
  searchQuery,
  layerVisibility,
  processFilter = 'all',
  networkFilter = 'all',
  scannedAt,
  hostArch,
  loading,
  theme,
  telemetry,
  focusNodeId,
  onFocusNode,
  hostMetrics,
  onOpenHost,
  centerTarget,
  onRequestCenter,
  onOpenNetwork,
  onOpenService,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const annotationRefs = useRef(new Map<string, HTMLDivElement>());
  const rafRef = useRef(0);
  const onSelectRef = useRef(onSelectNode);
  const [annotations, setAnnotations] = useState<LaneAnnotation[]>([]);
  const [zoom, setZoom] = useState(1);
  // 选中后等一下再浮出快捷操作：刚点开详情抽屉时不和抽屉抢视线。
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelectNode;
  }, [onSelectNode]);

  /**
   * 先按图层过滤，再布局 —— 隐藏的节点如果还参与布局，画布上会留下看不见的空洞。
   */
  // 接口名在 `host_network_assoc` 的边上：网段分类要用它判断「本机内部」。
  const ifaceByNodeId = useMemo(() => buildNetworkHints(graph), [graph]);

  const visibleGraph = useMemo(() => {
    if (!graph) return null;
    const nodes = graph.nodes.filter(
      (node) =>
        layerVisibility[node.layer] &&
        passesProcessFilter(node, processFilter) &&
        passesNetworkFilter(node, networkFilter, ifaceByNodeId.get(node.id)?.ifaceName),
    );
    const ids = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    return { nodes, edges, metadata: graph.metadata } satisfies HostProcessTopologyGraph;
  }, [graph, layerVisibility, processFilter, networkFilter, ifaceByNodeId]);

  /**
   * App 每次渲染（包括选中节点）都会重建 graph 对象。如果 effect 直接依赖它，
   * 点一下节点就会重排 + 重新 fit，画布像被「刷新」了一样跳一下。这里用结构签名去抖。
   */
  const graphSignature = useMemo(
    () =>
      visibleGraph
        ? `${visibleGraph.nodes.map((node) => node.id).join('|')}#${visibleGraph.edges
            .map((edge) => edge.id)
            .join('|')}`
        : '',
    [visibleGraph],
  );

  const hints = useMemo(() => buildNetworkHints(visibleGraph), [visibleGraph]);
  // 多主机 = 总览：这里的主机卡代表「进入一台机器」，双击直接下钻。
  const overview = useMemo(
    () => (visibleGraph?.nodes.filter((node) => node.objectKind === 'HostInventory').length ?? 0) > 1,
    [visibleGraph],
  );
  const searchIndex = useMemo(() => buildSearchIndex(visibleGraph), [visibleGraph]);

  // 这些回调随 annotations / graph 身份变化，但 cytoscape 只应该初始化一次。
  const scheduleSyncRef = useRef<() => void>(() => {});
  const fitViewRef = useRef<() => void>(() => {});
  const fitFocusRef = useRef<(nodeId: string) => void>(() => {});
  const focusNodeIdRef = useRef<string | null>(focusNodeId);
  const annotationsRef = useRef<LaneAnnotation[]>([]);

  const hostStats = useMemo<HostStats | undefined>(() => {
    if (!visibleGraph) return undefined;
    // 这些数字是「当前这张图的汇总」，不是「某一台主机的指标」。图上多于一台主机时
    // （网段视图 / 总览）它们描不进某一张卡，不如不传 —— 卡片会回退到节点自带的属性。
    const hostCount = visibleGraph.nodes.filter(
      (node) => node.objectKind === 'HostInventory',
    ).length;
    if (hostCount !== 1) return undefined;
    const summary = visibleGraph.nodes.find((node) => node.objectKind === 'ProcessSummary');
    return {
      segments: visibleGraph.nodes.filter((node) => node.objectKind === 'NetworkSegment').length,
      processes: Number(
        visibleGraph.metadata?.processCount ?? summary?.properties.totalProcesses ?? 0,
      ),
      groups: Number(summary?.properties.totalPrograms ?? 0),
      arch: hostArch ?? null,
      scannedAt: scannedAt ?? null,
    };
  }, [visibleGraph, scannedAt, hostArch]);

  const statusByNodeId = useMemo(() => {
    const statuses = new Map<string, NodeStatus>();
    for (const node of visibleGraph?.nodes ?? []) {
      statuses.set(node.id, resolveNodeStatus(node, { scannedAt, telemetry }));
    }
    return statuses;
  }, [visibleGraph, scannedAt, telemetry]);

  const focusNeighborIds = useMemo(() => {
    if (!focusNodeId || !visibleGraph) return null;
    const ids = new Set<string>([focusNodeId]);
    for (const edge of visibleGraph.edges) {
      if (edge.source === focusNodeId) ids.add(edge.target);
      if (edge.target === focusNodeId) ids.add(edge.source);
    }
    return ids;
  }, [focusNodeId, visibleGraph]);

  const expanded = useMemo(
    () => Boolean(visibleGraph?.nodes.some((node) => node.objectKind === 'ProcessGroup')),
    [visibleGraph],
  );

  const syncViewport = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const factor = cy.zoom();
    const pan = cy.pan();

    for (const [id, element] of cardRefs.current) {
      const node = cy.getElementById(id);
      if (node.length === 0) continue;
      const point = node.renderedPosition();
      const dims = nodeDims(node.data('objectKind') as NodeKind);
      element.style.transform = `translate3d(${point.x - (dims.width * factor) / 2}px, ${
        point.y - (dims.height * factor) / 2
      }px, 0) scale(${factor})`;
    }

    for (const annotation of annotations) {
      const element = annotationRefs.current.get(annotation.id);
      if (!element) continue;
      element.style.transform = `translate3d(${annotation.x * factor + pan.x}px, ${
        annotation.y * factor + pan.y
      }px, 0) scale(${factor})`;
    }

    setZoom((current) => (Math.abs(current - factor) < 0.005 ? current : factor));
  }, [annotations]);

  const scheduleSync = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      syncViewport();
    });
  }, [syncViewport]);

  const fitView = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const elements = cy.elements();
    if (elements.length === 0) return;
    cy.resize();
    cy.fit(elements, 76);
    if (cy.zoom() > FIT_ZOOM_CAP) {
      cy.zoom({
        level: FIT_ZOOM_CAP,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
    }
    cy.center(elements);

    // 画布左上角浮着工具条（相对画布 16–56px）。把栏标题压到 64px 以下，
    // 窗口再矮也不会出现「标题钻到搜索框底下」。
    const pan = cy.pan();
    const laneTop = annotationsRef.current.reduce(
      (min, annotation) => Math.min(min, annotation.y),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(laneTop)) {
      const screenTop = laneTop * cy.zoom() + pan.y;
      const inset = 64;
      if (screenTop < inset) {
        cy.pan({ x: pan.x, y: pan.y + (inset - screenTop) });
      }
    }
    // fit 直接改了 zoom；立刻同步百分比，别等下一帧 rAF 才更新。
    setZoom(cy.zoom());
    scheduleSync();
  }, [scheduleSync]);

  const fitFocus = useCallback(
    (nodeId: string) => {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(nodeId);
      if (node.length === 0) return;
      const elements = node.closedNeighborhood();
      if (elements.length === 0) return;
      const box = elements.boundingBox() as { x1: number; y1: number; w: number; h: number };
      // 右侧 inspector 是覆盖层：镜头要往左让出 336px，不然焦点卡片会被抽屉压住。
      const inset = selectedNodeId ? 336 : 0;
      const pad = 72;
      const availableWidth = Math.max(240, cy.width() - inset - pad * 2);
      const availableHeight = Math.max(240, cy.height() - pad * 2);
      const zoom = Math.min(
        availableWidth / Math.max(box.w, 1),
        availableHeight / Math.max(box.h, 1),
        1.2,
      );
      cy.zoom(zoom);
      cy.pan({
        x: (cy.width() - inset) / 2 - (box.x1 + box.w / 2) * zoom,
        y: cy.height() / 2 - (box.y1 + box.h / 2) * zoom,
      });
      scheduleSync();
    },
    [scheduleSync, selectedNodeId],
  );

  // 把最新回调同步进 ref：cytoscape / ResizeObserver 的回调只注册一次，
  // 不能闭包到首帧的版本。用 layout effect，保证在 ResizeObserver 的 rAF 之前更新。
  useLayoutEffect(() => {
    annotationsRef.current = annotations;
    scheduleSyncRef.current = scheduleSync;
    fitViewRef.current = fitView;
    fitFocusRef.current = fitFocus;
    focusNodeIdRef.current = focusNodeId;
  }, [annotations, scheduleSync, fitView, fitFocus, focusNodeId]);

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cardMap = cardRefs.current;
    const annotationMap = annotationRefs.current;
    const cy = cytoscape({
      container: containerRef.current,
      selectionType: 'single',
      boxSelectionEnabled: false,
      wheelSensitivity: 0.2,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      style: buildCyStyle(theme),
    });

    const handleViewport = () => scheduleSyncRef.current();
    cy.on('render pan zoom resize layoutstop', handleViewport);
    cy.on('tap', (event: cytoscape.EventObject) => {
      if (event.target === cy) onSelectRef.current(null);
    });

    const observer = new ResizeObserver(() => {
      // 首次布局时容器可能还没拿到最终高度（cytoscape 初始化那一刻 height=0），
      // fit 只能横向居中，整张图会被顶到画布上沿。尺寸变化后必须重新 fit。
      cy.resize();
      window.requestAnimationFrame(() => {
        const focusId = focusNodeIdRef.current;
        if (focusId) fitFocusRef.current(focusId);
        else fitViewRef.current();
        scheduleSyncRef.current();
      });
    });
    observer.observe(containerRef.current);

    cyRef.current = cy;
    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      cardMap.clear();
      annotationMap.clear();
      cy.destroy();
      cyRef.current = null;
    };
    // 初始化只跑一次；主题变化由下面的 cy.style 单独处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题切换只换 cytoscape 的连线颜色，不重建实例、不重排。
  useEffect(() => {
    cyRef.current?.style(buildCyStyle(theme));
  }, [theme]);

  // 结构变化 → 重建元素 + 布局。只依赖签名，不依赖 graph 的对象身份。
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !visibleGraph) return;
    const current = visibleGraph;

    cy.elements().remove();
    cy.add(graphToCyElements(current));

    const focus =
      // 多主机先走总览网格：主机 + 共享网段，按视口宽高比铺开。
      computeOverviewLayout(current) ??
      computeFocusLayout(current) ??
      computeServiceLayout(current) ??
      computeRuntimeLayout(current);
    // 先写进 ref 再 fit：fit 时 React 还没提交 setAnnotations，拿 state 会慢一帧。
    annotationsRef.current = focus?.annotations ?? [];
    setAnnotations(focus?.annotations ?? []);

    if (focus) {
      cy.batch(() => {
        cy.nodes().forEach((node) => {
          const point = focus.positions[node.id()];
          if (point) node.position(point);
        });
      });
      fitViewRef.current();
      return;
    }

    const effective: ConcreteLayout = chooseEffectiveLayout(current);
    const instance = cy.layout(LAYOUT_OPTIONS[effective]);
    instance.one('layoutstop', () => fitViewRef.current());
    instance.run();
    // 只按结构签名重排：graph 的对象身份每次 App 渲染都会变，不能进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphSignature]);


  // 「居中」：把某张卡片放到可视区中心。详情抽屉是覆盖层，要按它的宽度让位。
  useEffect(() => {
    const cy = cyRef.current;
    const targetId = centerTarget?.nodeId;
    if (!cy || !targetId) return;
    const node = cy.getElementById(targetId);
    if (node.length === 0) return;

    const inset = centerTarget?.inset ?? 0;
    // 视图已经很远时先拉回可读档位，否则「居中」之后还是看不清。
    const level = Math.min(1.4, Math.max(cy.zoom(), 0.9));
    cy.zoom({ level, renderedPosition: { x: (cy.width() - inset) / 2, y: cy.height() / 2 } });
    const point = node.renderedPosition();
    const pan = cy.pan();
    cy.pan({
      x: pan.x + (cy.width() - inset) / 2 - point.x,
      y: pan.y + cy.height() / 2 - point.y,
    });
    scheduleSyncRef.current();
    // 只按 nonce 触发：点同一个按钮要能重复居中。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerTarget?.nonce]);

  // 聚焦：把镜头收到「焦点节点 + 一跳邻居」，否则 inspector 一开，
  // 整张服务图会被压到 67%，聚焦节点反而看不清。
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!focusNodeId) {
      fitViewRef.current();
      return;
    }
    fitFocusRef.current(focusNodeId);
  }, [focusNodeId, graphSignature]);

  // 布局变化后卡片可能已经挂载完成，补一次同步（fit 的 render 事件不一定覆盖首帧）。
  useEffect(() => {
    scheduleSync();
  }, [graphSignature, annotations, scheduleSync]);

  const selectedNode = visibleGraph?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  // 选中 2 秒后，在卡片上方浮出这节点最可能的下一步操作（详情抽屉里那些按钮太靠下）。
  useEffect(() => {
    setActionsVisible(false);
    if (!selectedNodeId) return;
    const timer = window.setTimeout(() => setActionsVisible(true), 2000);
    return () => window.clearTimeout(timer);
  }, [selectedNodeId, graphSignature]);

  const quickActions = useMemo(() => {
    if (!selectedNode) return [];
    const actions: { id: string; label: string; run: () => void }[] = [];
    if (selectedNode.objectKind === 'HostInventory' && onOpenHost) {
      actions.push({
        id: 'open-host',
        label: '进入这台主机',
        run: () => onOpenHost(selectedNode.objectId),
      });
    }
    if (selectedNode.objectKind === 'NetworkSegment' && onOpenNetwork) {
      actions.push({
        id: 'open-network',
        label: '网段里的主机',
        run: () => onOpenNetwork(selectedNode.objectId),
      });
    }
    if (selectedNode.objectKind === 'ServiceEntity' && onOpenService) {
      actions.push({
        id: 'open-service',
        label: '监听详情',
        run: () => onOpenService(selectedNode.objectId),
      });
    }
    if (onRequestCenter) {
      actions.push({
        id: 'center',
        label: '居中',
        run: () => onRequestCenter(selectedNode.id),
      });
    }
    return actions;
  }, [selectedNode, onOpenHost, onOpenNetwork, onOpenService, onRequestCenter]);

  // 搜索：命中集合驱动卡片与连线同时变淡，避免「卡片亮了、线还在」。
  const matchedIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!searchIndex.size || !query) return null;
    const result = new Set<string>();
    for (const [id, text] of searchIndex) {
      if (text.includes(query)) result.add(id);
    }
    // 一条都不命中时不要把所有节点压成幽灵：保持全亮，让「无匹配」只是工具条上的提示。
    return result.size > 0 ? result : null;
  }, [searchIndex, searchQuery]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().removeClass('dimmed');
    if (!matchedIds) return;
    const matched = matchedIds;
    cy.edges().forEach((edge) => {
      if (!matched.has(edge.source().id()) || !matched.has(edge.target().id())) {
        edge.addClass('dimmed');
      }
    });
    // matchedIds 由 searchQuery + 图结构派生；只在两者变化时重刷连线即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, graphSignature]);

  /**
   * 选中 / 聚焦共用一套边状态：
   * - 无聚焦：选中节点的相邻边加色，其余保持原样；
   * - 有聚焦：只亮聚焦节点的一跳边，其余边压到 muted。
   */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().removeClass('neighbor').removeClass('muted');

    if (focusNodeId) {
      cy.edges().forEach((edge) => {
        const connected = edge.source().id() === focusNodeId || edge.target().id() === focusNodeId;
        edge.toggleClass('neighbor', connected);
        edge.toggleClass('muted', !connected);
      });
      return;
    }

    if (!selectedNodeId) return;
    const node = cy.getElementById(selectedNodeId);
    if (node.length > 0) node.connectedEdges().addClass('neighbor');
  }, [focusNodeId, selectedNodeId, graphSignature]);

  /**
   * hover 只动 cytoscape 的连线类，不 setState —— 每划过一张卡片就重渲染整层卡片不划算。
   */
  const handleHover = (nodeId: string | null) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().removeClass('hot');
    if (!nodeId) return;
    const node = cy.getElementById(nodeId);
    if (node.length > 0) node.connectedEdges().addClass('hot');
  };

  const zoomBy = (direction: 1 | -1) => {
    const cy = cyRef.current;
    if (!cy) return;
    const level = clamp(cy.zoom() * (direction > 0 ? 1.25 : 0.8), MIN_ZOOM, MAX_ZOOM);
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    scheduleSync();
  };

  const resetZoom = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: 1, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    scheduleSync();
  };

  const empty = !loading && (!visibleGraph || visibleGraph.nodes.length === 0);

  return (
    <div className="atlas-canvas relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      {/* HTML 卡片层：不拦截空白处的指针事件，拖拽/滚轮仍然交给 cytoscape。 */}
      <div className="pointer-events-none absolute inset-0 select-none">
        {visibleGraph?.nodes.map((node) => {
          const dims = nodeDims(node.objectKind);
          return (
            <div
              key={node.id}
              ref={(element) => {
                if (element) cardRefs.current.set(node.id, element);
                else cardRefs.current.delete(node.id);
              }}
              className="pointer-events-auto absolute left-0 top-0 origin-top-left will-change-transform"
              style={{ width: dims.width, height: dims.height }}
              title={
                overview && node.objectKind === 'HostInventory'
                  ? `${node.label} · 双击进入这台主机的拓扑`
                  : undefined
              }
              onDoubleClick={
                overview && node.objectKind === 'HostInventory' && onOpenHost
                  ? () => onOpenHost(node.objectId)
                  : undefined
              }
            >
              {selectedNodeId === node.id && actionsVisible && quickActions.length > 0 ? (
                <div
                  className="absolute bottom-full left-1/2 mb-2.5 flex items-center gap-0.5 rounded-[9px] border border-line bg-surface/95 px-1 py-0.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur"
                  style={{
                    transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.2)})`,
                    transformOrigin: 'center bottom',
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        action.run();
                      }}
                      className={`flex h-6 items-center whitespace-nowrap rounded-[6px] px-2 text-[10.5px] font-medium transition-colors ${
                        action.id === 'open-host' ||
                        action.id === 'open-network' ||
                        action.id === 'open-service'
                          ? 'text-brand hover:bg-brand-soft hover:text-brand-strong'
                          : 'text-ink-soft hover:bg-elevated hover:text-ink'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectNode(null);
                    }}
                    aria-label="关闭快捷操作"
                    className="grid size-6 place-items-center rounded-[6px] text-ink-faint transition-colors hover:bg-elevated hover:text-ink-soft"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <NodeCard
                node={node}
                hint={hints.get(node.id)}
                hostStats={
                  node.objectKind === 'HostInventory'
                    ? (hostStats ??
                        (hostMetrics?.[node.objectId]
                          ? {
                              segments: hostMetrics[node.objectId].segments,
                              processes: hostMetrics[node.objectId].processes,
                              arch: null,
                              scannedAt: null,
                            }
                          : undefined))
                    : undefined
                }
                selected={selectedNodeId === node.id}
                focused={focusNodeId === node.id}
                dimmed={
                  (matchedIds ? !matchedIds.has(node.id) : false) ||
                  (focusNeighborIds ? !focusNeighborIds.has(node.id) : false)
                }
                expanded={expanded}
                status={statusByNodeId.get(node.id) ?? { tone: 'unknown', label: '未采集' }}
                telemetry={telemetry.nodes[node.id]}
                onSelect={onSelectNode}
                onExpand={onExpandNode}
                onFocus={onFocusNode}
                onHover={handleHover}
              />
            </div>
          );
        })}

        {annotations.map((annotation) => (
          <div
            key={annotation.id}
            ref={(element) => {
              if (element) annotationRefs.current.set(annotation.id, element);
              else annotationRefs.current.delete(annotation.id);
            }}
            data-annotation-id={annotation.id}
            className="absolute left-0 top-0 origin-top-left whitespace-nowrap"
            style={{ width: annotation.width }}
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                {annotation.text}
              </span>
              <span className="tnum text-[10px] font-normal text-ink-faint">{annotation.count}</span>
            </div>
          </div>
        ))}
      </div>

      <ZoomControls
        zoom={zoom}
        shifted={Boolean(selectedNodeId)}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onReset={resetZoom}
        onFit={fitView}
      />

      {loading && !graph && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          <p className="text-[12px] text-ink-mute">正在读取拓扑…</p>
        </div>
      )}

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface/70 text-ink-faint">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="18" r="2" />
              <circle cx="19" cy="18" r="2" />
              <path d="M12 7.2v4M10.4 12.8 6.4 16.2M13.6 12.8l4 3.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-[13px] font-medium text-ink-soft">没有可展示的拓扑</p>
            <p className="mt-1 text-[11px] text-ink-faint">先导入一份发现快照，或按对象 ID 查询。</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoomControls({
  zoom,
  shifted,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
}: {
  zoom: number;
  shifted: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
}) {
  return (
    <div
      className={`absolute bottom-4 z-20 flex items-center gap-0.5 rounded-[10px] border border-line bg-surface/95 p-0.5 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_4px_12px_-4px_rgba(16,24,40,0.12)] backdrop-blur transition-[right] duration-200 ${
        shifted ? 'right-[352px]' : 'right-4'
      }`}
    >
      <ZoomButton label="缩小" onClick={onZoomOut}>
        <MinusIcon className="size-3.5" />
      </ZoomButton>
      <button
        type="button"
        onClick={onReset}
        title="缩放到 100%"
        className="tnum h-7 w-11 rounded-[7px] text-[10.5px] font-medium text-ink-soft transition-colors hover:bg-subtle"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ZoomButton label="放大" onClick={onZoomIn}>
        <PlusIcon className="size-3.5" />
      </ZoomButton>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
      <ZoomButton label="适配画布" onClick={onFit}>
        <FitIcon className="size-3.5" />
      </ZoomButton>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-[7px] text-ink-soft transition-colors hover:bg-subtle"
    >
      {children}
    </button>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 自动布局：聚焦剖面只在「一台主机 + 一圈叶子」时成立；
 * 展开分组后图变深，交给 dagre；分组数过多、又没有具体进程时，力导向更好读。
 */
function chooseEffectiveLayout(graph: HostProcessTopologyGraph): ConcreteLayout {
  const count = (kind: NodeKind) => graph.nodes.filter((node) => node.objectKind === kind).length;
  const groups = count('ProcessGroup');
  const runtimes = count('ProcessRuntime');
  if (groups >= 16 && runtimes === 0) return 'cose-bilkent';
  return 'dagre';
}

/** 网段节点本身没有接口名，信息在 `host_network_assoc` 边上 —— 卡片需要它。 */
function buildNetworkHints(graph: HostProcessTopologyGraph | null) {
  const hints = new Map<string, GraphNodeHint>();
  if (!graph) return hints;
  for (const edge of graph.edges) {
    if (edge.edgeKind !== 'host_network_assoc') continue;
    const ifaceName = edge.properties?.ifaceName;
    const ipAddr = edge.properties?.ipAddr;
    if (typeof ifaceName !== 'string' && typeof ipAddr !== 'string') continue;
    hints.set(edge.target, {
      ifaceName: typeof ifaceName === 'string' ? ifaceName : undefined,
      ipAddr: typeof ipAddr === 'string' ? ipAddr : undefined,
    });
  }
  return hints;
}
