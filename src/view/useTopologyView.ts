import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '../ui/useAppState';
import {
  buildDisplayGraph,
  getProcessViewMode,
  getSelectedLoadedProcessGroups,
  PROCESS_GROUP_DISPLAY_LIMIT,
  PROCESS_GROUP_PAGE_SIZE,
  PROCESS_GROUP_PREFIX,
  PROCESS_GROUP_OVERFLOW_PREFIX,
  PROCESS_SUMMARY_PREFIX,
  SERVICE_OVERFLOW_PREFIX,
} from '../display/build-display-graph';
import { buildSearchIndex, countMatches } from '../utils/search';
import { buildTelemetry } from '../utils/telemetry';
import { classifyProcessName } from '../utils/process-kind';
import { countHealth, freshnessStatus, resolveNodeStatus } from '../utils/status';
import { loadFixture as loadLocalFixture } from '../api/client';
import type { AtlasClient } from '../api/client';
import type {
  HostProcessGroupDto,
  HostProcessTopologyGraph,
  HostProcessTopologyNode,
  HostSummaryDto,
  HostTopologyDto,
  LayerKind,
  LoadedProcessGroupsState,
  NodeKind,
} from '../types/domain';

/**
 * 一张拓扑视图的全部状态与动作。
 *
 * 这是原来 `wist-atlas-web/App.tsx` 里的装配逻辑，去掉三类**属于产品外壳**的东西：
 * 顶栏/左栏/状态栏、服务清单抽屉、以及「示例数据」开关的持久化。
 * `wist-atlas-web` 与 `wist-field-web` 用它拿到同一份 view，各自决定外面包什么壳。
 */
export type TopologyViewOptions = {
  client: AtlasClient;
  /** 初始聚焦的主机；空串 = 第一台。 */
  initialHostId?: string;
  /** 示例遥测（流量/健康/趋势）。默认关闭。 */
  demo?: boolean;
  /** 开发态骨架：直接把 `public/fixtures/<name>.json` 当数据源，不访问后端。 */
  fixture?: string;
  /** Esc 先退聚焦、再收详情。宿主自己处理 Esc 时可关掉。 */
  handleEscape?: boolean;
  /**
   * 没给 `initialHostId` 时，主机列表回来后是否自动选中第一台。
   *
   * `true`（默认）是迁移前的老行为：适合「进来就盯一台机」的独立 atlas 页。
   * `false` 留给「总览优先」的宿主（如 field-web）：画布保持资产总览，
   * 顶栏选中项也停在「全部主机（总览）」，不会先拉一次全量总览、
   * 再因为自动选中主机把这张大图重新拉一遍。
   */
  autoSelectFirstHost?: boolean;
};

export type TopologyViewState = {
  // 数据
  graph: HostProcessTopologyGraph | null;
  displayGraph: HostProcessTopologyGraph | null;
  hostTopology: HostTopologyDto | null;
  selectedNode: HostProcessTopologyNode | null;
  primaryHostNode: HostProcessTopologyNode | null;
  hosts: HostSummaryDto[];
  hostId: string;
  loading: boolean;
  error: string | null;
  scannedAt: string | null;

  // 派生口径
  telemetry: ReturnType<typeof buildTelemetry>;
  health: ReturnType<typeof countHealth>;
  hostStatus: ReturnType<typeof resolveNodeStatus>;
  selectedStatus: ReturnType<typeof resolveNodeStatus> | null;
  selectedTelemetry: ReturnType<typeof buildTelemetry>['nodes'][string] | undefined;
  layers: LayerKind[];
  kinds: NodeKind[];
  graphNodes: HostProcessTopologyNode[];
  graphEdgeCount: number;
  selectedNodeId: string | null;
  focusNodeId: string | null;
  focusedNode: HostProcessTopologyNode | null;
  focusLabel: string;
  searchQuery: string;
  matchCount: number | null;
  layerVisibility: Record<LayerKind, boolean>;
  processFilter: 'all' | 'user' | 'system';
  networkFilter: 'all' | 'shared' | 'host';
  processViewMode: ReturnType<typeof getProcessViewMode>;
  loadedProcessGroups: LoadedProcessGroupsState | null;

  // 计数（左栏资产卡 / 状态栏）
  segmentCount: number;
  processCount: number;
  groupCount: number;
  serviceCount: number;
  hostCount: number;
  topGroups: { name: string; count: number }[];
  /** 资产卡的「高频进程」列表按归属过滤后藏掉了几个。 */
  topGroupsHidden: number;
  /** 总览时每台主机卡上的规模：来自主机列表（`GET /hosts`），不用逐台再拉一次资产卡。 */
  hostMetrics: Record<string, { segments: number; processes: number }>;

  // 动作
  refresh: () => void;
  setHostId: (hostId: string) => void;
  selectNode: (nodeId: string | null) => void;
  expandNode: (nodeId: string) => void;
  focusNode: (nodeId: string) => void;
  clearFocus: () => void;
  setSearch: (query: string) => void;
  toggleLayer: (layer: LayerKind) => void;
  setProcessFilter: (filter: 'all' | 'user' | 'system') => void;
  setNetworkFilter: (filter: 'all' | 'shared' | 'host') => void;
  openNetwork: (segmentObjectId: string) => void;
  openService: (serviceObjectId: string) => void;
  clearError: () => void;
};

export function useTopologyView(options: TopologyViewOptions): TopologyViewState {
  const {
    client,
    initialHostId = '',
    demo = false,
    fixture,
    handleEscape = true,
    autoSelectFirstHost = true,
  } = options;
  const [state, dispatch] = useAppState({
    processFilter: readStoredFilter(PROCESS_FILTER_KEY, PROCESS_FILTERS),
    networkFilter: readStoredFilter(NETWORK_FILTER_KEY, NETWORK_FILTERS),
  });

  // 过滤是「我平时就想先看用户进程」这类偏好：记住它，下次进来不用再点。
  useEffect(() => {
    writeStoredFilter(PROCESS_FILTER_KEY, state.processFilter);
  }, [state.processFilter]);

  useEffect(() => {
    writeStoredFilter(NETWORK_FILTER_KEY, state.networkFilter);
  }, [state.networkFilter]);
  const [hostId, setHostId] = useState(initialHostId);
  const [hosts, setHosts] = useState<HostSummaryDto[]>([]);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [overviewGroupsByHost, setOverviewGroupsByHost] = useState<
    Record<string, HostProcessGroupDto[]>
  >({});
  const [truncatedGroupsByHost, setTruncatedGroupsByHost] = useState<Record<string, number>>({});
  const [loadedGroupsByHost, setLoadedGroupsByHost] = useState<
    Record<string, LoadedProcessGroupsState>
  >({});
  const [groupPageLoadingByHost, setGroupPageLoadingByHost] = useState<Record<string, boolean>>({});

  /** 换图时把「展开 / 分页」这类跟具体图绑定的临时状态一起清掉。 */
  const resetExpansion = useCallback(() => {
    setExpandedHosts(new Set());
    setExpandedGroups(new Set());
    setOverviewGroupsByHost({});
    setTruncatedGroupsByHost({});
    setLoadedGroupsByHost({});
    setGroupPageLoadingByHost({});
  }, []);

  // 主机列表：顶栏切换器 / 宿主自己的选择器。
  useEffect(() => {
    if (fixture) return;
    let cancelled = false;
    client.fetchHosts().then((res) => {
      if (cancelled || res.status !== 'ok') return;
      setHosts(res.data.hosts);
      if (!initialHostId && autoSelectFirstHost) {
        setHostId((current) => current || res.data.hosts[0]?.id || '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, fixture, initialHostId, autoSelectFirstHost]);

  const loadData = useCallback(() => {
    dispatch({ type: 'FETCH_GRAPH_START' });
    const done = (res: Awaited<ReturnType<AtlasClient['fetchHostProcessTopology']>>) => {
      if (res.status === 'ok') {
        resetExpansion();
        setExpandedServices(new Set());
        dispatch({ type: 'FETCH_GRAPH_SUCCESS', graph: res.data });
        // 只在新图换了主机时清空资产卡：无条件清空会和资产卡加载抢跑。
        dispatch({
          type: 'CLEAR_HOST_TOPOLOGY_UNLESS',
          hostObjectId:
            res.data.nodes.find((node) => node.objectKind === 'HostInventory')?.objectId ?? '',
        });
      } else {
        dispatch({ type: 'FETCH_GRAPH_ERROR', error: res.message });
      }
    };

    if (fixture) {
      loadLocalFixture(fixture).then(done);
      return;
    }

    const host = hostId.trim() || initialHostId;
    if (!host) {
      client.fetchFirstHostProcessTopology().then(done);
      return;
    }
    client.fetchHostProcessTopology(host).then(done);
  }, [client, dispatch, fixture, hostId, initialHostId, resetExpansion]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 空串 = 回到「全部主机（总览）」：后端把 first 快照当作整张资产图。 */
  const openHost = useCallback(
    (nextHostId: string) => {
      const trimmed = nextHostId.trim();
      setHostId(trimmed);
      dispatch({ type: 'FETCH_GRAPH_START' });
      const done = (res: Awaited<ReturnType<AtlasClient['fetchHostProcessTopology']>>) => {
        if (res.status === 'ok') {
          resetExpansion();
          setExpandedServices(new Set());
          dispatch({ type: 'FETCH_GRAPH_SUCCESS', graph: res.data });
        } else {
          dispatch({ type: 'FETCH_GRAPH_ERROR', error: `[${res.code}] ${res.message}` });
        }
      };
      if (!trimmed) {
        client.fetchFirstHostProcessTopology().then(done);
        return;
      }
      client.fetchHostProcessTopology(trimmed).then(done);
    },
    [client, dispatch, resetExpansion],
  );

  /** 切到「这个网段里有哪些机器」。节点点进来拿节点上的 objectId，走表单时拿输入值。 */
  const openNetwork = useCallback(
    (segmentObjectId: string) => {
      const trimmed = segmentObjectId.trim();
      if (!trimmed) return;
      dispatch({ type: 'FETCH_GRAPH_START' });
      client.fetchNetworkTopology(trimmed).then((res) => {
        if (res.status === 'ok') {
          resetExpansion();
          setExpandedServices(new Set());
          dispatch({ type: 'FETCH_GRAPH_SUCCESS', graph: res.data });
        } else {
          dispatch({ type: 'FETCH_GRAPH_ERROR', error: `[${res.code}] ${res.message}` });
        }
      });
    },
    [client, dispatch, resetExpansion],
  );

  /** 切到「这个服务跑在哪些主机上」。 */
  const openService = useCallback(
    (serviceObjectId: string) => {
      const trimmed = serviceObjectId.trim();
      if (!trimmed) return;
      dispatch({ type: 'FETCH_GRAPH_START' });
      client.fetchServiceTopology(trimmed).then((res) => {
        if (res.status === 'ok') {
          resetExpansion();
          setExpandedServices(new Set());
          dispatch({ type: 'FETCH_GRAPH_SUCCESS', graph: res.data });
        } else {
          dispatch({ type: 'FETCH_GRAPH_ERROR', error: `[${res.code}] ${res.message}` });
        }
      });
    },
    [client, dispatch, resetExpansion],
  );

  // 关键：选中节点/输入搜索词都会让宿主重渲染。displayGraph 每次重建会让画布的
  // 「图结构签名」每次都变，点一下节点就重新布局 —— 所以只依赖真正的结构输入。
  const displayGraph = useMemo(
    () =>
      buildDisplayGraph(
        state.graph,
        expandedHosts,
        expandedGroups,
        expandedServices,
        overviewGroupsByHost,
        truncatedGroupsByHost,
        loadedGroupsByHost,
        groupPageLoadingByHost,
      ),
    [
      state.graph,
      expandedHosts,
      expandedGroups,
      expandedServices,
      overviewGroupsByHost,
      truncatedGroupsByHost,
      loadedGroupsByHost,
      groupPageLoadingByHost,
    ],
  );

  const selectedNode =
    displayGraph?.nodes.find((node) => node.id === state.selectedNodeId) ?? null;
  const hostNodes = useMemo(
    () => displayGraph?.nodes.filter((node) => node.objectKind === 'HostInventory') ?? [],
    [displayGraph],
  );
  // 左栏资产卡要的是「当前这张图的主机」，不是「当前选中的节点」。
  const primaryHostNode = hostNodes[0] ?? null;

  // 资产卡 / 主机详情要的那台主机（`GET /topology/host/{id}`）：
  // - 单主机焦点图：就是这台 —— 资产卡的进程分组、详情面板都靠它；
  // - 资产总览（多主机）：只有用户真的点开某台主机时才取。以前这里无条件取第一台，
  //   首屏会白拿一份完整主机明细（上千进程的机器就是几百 KB~几 MB），而总览根本不展示它。
  const hostDetailNode = useMemo(() => {
    if (hostNodes.length === 1) return hostNodes[0];
    return hostNodes.find((node) => node.id === state.selectedNodeId) ?? null;
  }, [hostNodes, state.selectedNodeId]);

  useEffect(() => {
    if (fixture) return;
    const hostObjectId = hostDetailNode?.objectId;
    if (!hostObjectId) {
      dispatch({ type: 'FETCH_HOST_TOPOLOGY_SUCCESS', hostTopology: null });
      return;
    }
    if (state.hostTopology?.host.id === hostObjectId) return;

    client.fetchHostTopology(hostObjectId).then((res) => {
      if (res.status === 'ok') {
        dispatch({ type: 'FETCH_HOST_TOPOLOGY_SUCCESS', hostTopology: res.data });
      }
    });
  }, [client, dispatch, fixture, hostDetailNode?.objectId, state.hostTopology?.host.id]);

  // 主机卡上的「进程分组」只在真的展开那台机时才需要：按需拉，不要一上来给
  // 图里每台机都发一条 `process-overview`（12 台机就是 12 份完整主机视图）。
  useEffect(() => {
    if (fixture) return;
    if (!state.graph) return;

    const graphHostNodes = state.graph.nodes.filter(
      (node) => node.objectKind === 'HostInventory',
    );
    for (const hostNode of graphHostNodes) {
      if (!expandedHosts.has(hostNode.id)) continue;
      if (overviewGroupsByHost[hostNode.objectId]) continue;
      client
        .fetchHostProcessOverview(hostNode.objectId, PROCESS_GROUP_DISPLAY_LIMIT)
        .then((res) => {
          if (res.status !== 'ok') return;
          setOverviewGroupsByHost((current) => {
            if (current[hostNode.objectId]) return current;
            return { ...current, [hostNode.objectId]: res.data.topGroups };
          });
          setTruncatedGroupsByHost((current) => {
            if (current[hostNode.objectId] != null) return current;
            return { ...current, [hostNode.objectId]: res.data.truncatedGroupCount };
          });
        });
    }
  }, [client, fixture, state.graph, expandedHosts, overviewGroupsByHost]);

  /**
   * 运行时卡片有两种意图：点卡片是「看详情」，点卡片底部的「展开进程分组」才是「铺开」。
   */
  const expandNode = useCallback(
    (nodeId: string) => {
      const hostNodeId = nodeId.startsWith(PROCESS_SUMMARY_PREFIX)
        ? nodeId.slice(PROCESS_SUMMARY_PREFIX.length)
        : nodeId;
      setExpandedHosts((current) => {
        const next = new Set(current);
        if (next.has(hostNodeId)) next.delete(hostNodeId);
        else next.add(hostNodeId);
        return next;
      });
      dispatch({ type: 'SELECT_NODE', nodeId: null });
    },
    [dispatch],
  );

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (nodeId && nodeId.startsWith(PROCESS_SUMMARY_PREFIX)) {
        dispatch({ type: 'SELECT_NODE', nodeId });
        return;
      }
      if (nodeId && nodeId.startsWith(SERVICE_OVERFLOW_PREFIX)) {
        // 服务数据已全量在内存里，展开/收起都是本地行为。
        const hostNodeId = nodeId.slice(SERVICE_OVERFLOW_PREFIX.length);
        setExpandedServices((current) => {
          const next = new Set(current);
          if (next.has(hostNodeId)) next.delete(hostNodeId);
          else next.add(hostNodeId);
          return next;
        });
        dispatch({ type: 'SELECT_NODE', nodeId: null });
        return;
      }
      if (nodeId && nodeId.startsWith(PROCESS_GROUP_OVERFLOW_PREFIX)) {
        const hostNodeId = nodeId.slice(PROCESS_GROUP_OVERFLOW_PREFIX.length);
        const hostNode = state.graph?.nodes.find((node) => node.id === hostNodeId);
        dispatch({ type: 'SELECT_NODE', nodeId });
        if (hostNode && !groupPageLoadingByHost[hostNode.objectId]) {
          const hostObjectId = hostNode.objectId;
          const loadedState = loadedGroupsByHost[hostObjectId];
          const overviewCount = overviewGroupsByHost[hostObjectId]?.length ?? 0;
          if (loadedState && !loadedState.hasMore) return;
          const offset = loadedState?.offset ?? overviewCount;
          setGroupPageLoadingByHost((current) => ({ ...current, [hostObjectId]: true }));
          client
            .fetchHostProcessGroupsPage(hostObjectId, PROCESS_GROUP_PAGE_SIZE, offset)
            .then((res) => {
              setGroupPageLoadingByHost((current) => ({ ...current, [hostObjectId]: false }));
              if (res.status !== 'ok') return;
              setLoadedGroupsByHost((current) => {
                const previous = current[hostObjectId];
                const existing = previous?.groups ?? [];
                const merged = [...existing];
                for (const group of res.data.groups) {
                  if (!merged.some((item) => item.executable === group.executable)) {
                    merged.push(group);
                  }
                }
                return {
                  ...current,
                  [hostObjectId]: {
                    groups: merged,
                    offset: res.data.offset + res.data.groups.length,
                    limit: res.data.limit,
                    hasMore: res.data.hasMore,
                    totalGroups: res.data.totalGroups,
                  },
                };
              });
            });
        }
        return;
      }
      if (nodeId && nodeId.startsWith(PROCESS_GROUP_PREFIX)) {
        setExpandedGroups((current) => {
          const next = new Set(current);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
        dispatch({ type: 'SELECT_NODE', nodeId });
        return;
      }
      dispatch({ type: 'SELECT_NODE', nodeId });
    },
    [client, dispatch, groupPageLoadingByHost, loadedGroupsByHost, overviewGroupsByHost, state.graph],
  );

  const focusNode = useCallback(
    (nodeId: string) => dispatch({ type: 'FOCUS_NODE', nodeId }),
    [dispatch],
  );
  const clearFocus = useCallback(() => dispatch({ type: 'CLEAR_FOCUS' }), [dispatch]);

  useEffect(() => {
    if (!handleEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (state.focusNodeId) dispatch({ type: 'CLEAR_FOCUS' });
      else dispatch({ type: 'SELECT_NODE', nodeId: null });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, handleEscape, state.focusNodeId]);

  const graphNodes = useMemo(() => displayGraph?.nodes ?? [], [displayGraph]);
  const presentLayers = useMemo(() => {
    const layers: LayerKind[] = [];
    for (const node of graphNodes) {
      if (!layers.includes(node.layer)) layers.push(node.layer);
    }
    return layers;
  }, [graphNodes]);
  const presentKinds = useMemo(() => {
    const kinds: NodeKind[] = [];
    for (const node of graphNodes) {
      if (!kinds.includes(node.objectKind)) kinds.push(node.objectKind);
    }
    return kinds;
  }, [graphNodes]);

  const hostMetrics = useMemo(() => {
    const metrics: Record<string, { segments: number; processes: number }> = {};
    for (const host of hosts) {
      metrics[host.id] = { segments: host.segmentCount, processes: host.processCount };
    }
    return metrics;
  }, [hosts]);

  const allTopGroups = state.hostTopology?.processGroups ?? [];
  const topGroups = useMemo(
    () =>
      allTopGroups
        .filter(
          (group) =>
            state.processFilter === 'all' ||
            classifyProcessName(String(group.executable ?? ''), String(group.display_name ?? '')) ===
              state.processFilter,
        )
        .slice(0, 5)
        .map((group) => ({
          name: String(group.display_name ?? group.executable ?? '-'),
          count: Number(group.process_count ?? 0),
        })),
    // allTopGroups 的身份随 hostTopology 变，不需要单独进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.hostTopology, state.processFilter],
  );

  const topGroupsHidden = useMemo(
    () =>
      state.processFilter === 'all'
        ? 0
        : allTopGroups.filter(
            (group) =>
              classifyProcessName(String(group.executable ?? ''), String(group.display_name ?? '')) !==
              state.processFilter,
          ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.hostTopology, state.processFilter],
  );

  const scannedAt = state.hostTopology?.generatedAt ?? displayGraph?.metadata?.queryTime ?? null;
  const telemetry = useMemo(() => buildTelemetry(displayGraph, demo), [displayGraph, demo]);
  const statusOptions = useMemo(() => ({ scannedAt, telemetry }), [scannedAt, telemetry]);
  const health = useMemo(
    () => countHealth(displayGraph, statusOptions),
    [displayGraph, statusOptions],
  );
  const hostStatus = primaryHostNode
    ? resolveNodeStatus(primaryHostNode, statusOptions)
    : freshnessStatus(scannedAt);
  const selectedStatus = selectedNode ? resolveNodeStatus(selectedNode, statusOptions) : null;
  const selectedTelemetry = selectedNode ? telemetry.nodes[selectedNode.id] : undefined;
  const focusedNode = state.focusNodeId
    ? (displayGraph?.nodes.find((node) => node.id === state.focusNodeId) ?? null)
    : null;
  const focusLabel =
    focusedNode?.objectKind === 'ProcessSummary' ? '运行时' : (focusedNode?.label ?? '');

  const segmentCount =
    state.hostTopology?.networkSegments.length ??
    graphNodes.filter((node) => node.objectKind === 'NetworkSegment').length;
  const processCount =
    state.hostTopology?.processes.length ??
    Number(displayGraph?.metadata?.processCount ?? 0);
  const groupCount =
    state.hostTopology?.processGroups.length ??
    graphNodes.filter((node) => node.objectKind === 'ProcessGroup').length;
  const serviceCount =
    state.hostTopology?.services.length ??
    graphNodes.filter((node) => node.objectKind === 'ServiceEntity').length;
  const hostCount = Number(
    displayGraph?.metadata?.hostCount ??
      graphNodes.filter((node) => node.objectKind === 'HostInventory').length,
  );

  const searchIndex = useMemo(() => buildSearchIndex(displayGraph), [displayGraph]);
  const matchCount = state.searchQuery.trim()
    ? countMatches(searchIndex, state.searchQuery)
    : null;

  return {
    graph: state.graph,
    displayGraph,
    hostTopology: state.hostTopology,
    selectedNode,
    primaryHostNode,
    hosts,
    hostId,
    loading: state.loading,
    error: state.error,
    scannedAt,
    telemetry,
    health,
    hostStatus,
    selectedStatus,
    selectedTelemetry,
    layers: presentLayers,
    kinds: presentKinds,
    graphNodes,
    graphEdgeCount: displayGraph?.edges.length ?? 0,
    selectedNodeId: state.selectedNodeId,
    focusNodeId: state.focusNodeId,
    focusedNode,
    focusLabel,
    searchQuery: state.searchQuery,
    matchCount,
    layerVisibility: state.layerVisibility,
    processFilter: state.processFilter,
    networkFilter: state.networkFilter,
    processViewMode: getProcessViewMode(selectedNode, loadedGroupsByHost, groupPageLoadingByHost),
    loadedProcessGroups: getSelectedLoadedProcessGroups(selectedNode, loadedGroupsByHost),
    segmentCount,
    processCount,
    groupCount,
    serviceCount,
    hostCount,
    topGroups,
    topGroupsHidden,
    hostMetrics,
    refresh: loadData,
    setHostId: openHost,
    selectNode: handleSelectNode,
    expandNode,
    focusNode,
    clearFocus,
    setSearch: (query) => dispatch({ type: 'SET_SEARCH', query }),
    toggleLayer: (layer) => dispatch({ type: 'TOGGLE_LAYER', layer }),
    setProcessFilter: (filter) => dispatch({ type: 'SET_PROCESS_FILTER', filter }),
    setNetworkFilter: (filter) => dispatch({ type: 'SET_NETWORK_FILTER', filter }),
    openNetwork,
    openService,
    clearError: () => dispatch({ type: 'FETCH_GRAPH_ERROR', error: '' }),
  };
}

const PROCESS_FILTERS = ['all', 'user', 'system'] as const;
const NETWORK_FILTERS = ['all', 'shared', 'host'] as const;
const PROCESS_FILTER_KEY = 'wist-atlas-process-filter';
const NETWORK_FILTER_KEY = 'wist-atlas-network-filter';

function readStoredFilter<T extends string>(key: string, allowed: readonly T[]): T | 'all' {
  try {
    const value = window.localStorage.getItem(key);
    if (value && (allowed as readonly string[]).includes(value)) return value as T;
  } catch {
    // 隐私模式下读不到就按默认
  }
  return 'all';
}

function writeStoredFilter(key: string, filter: string): void {
  try {
    window.localStorage.setItem(key, filter);
  } catch {
    // 存不下不影响本次会话
  }
}
