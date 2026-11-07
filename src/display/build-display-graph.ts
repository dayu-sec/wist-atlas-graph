import type {
  HostProcessGroupDto,
  HostProcessTopologyEdge,
  HostProcessTopologyGraph,
  HostProcessTopologyNode,
  LoadedProcessGroupsState,
} from '../types/domain';

/**
 * 画布上「显示哪些节点」的装配规则。
 *
 * 这是 atlas 里最贵的一段纯逻辑：后端给的是完整事实（一台机器几百个进程、
 * 几十个服务），画布给的是有限视口。这里决定 TopN、溢出节点、单进程折叠、
 * 容器与服务实例的从属 —— 全部可脱离 React 单测。
 */

export const PROCESS_SUMMARY_PREFIX = 'process-summary:';
export const PROCESS_GROUP_PREFIX = 'process-group:';
export const PROCESS_GROUP_OVERFLOW_PREFIX = 'process-group-overflow:';
/** 服务也走 TopN + 溢出节点：一台机器 28 个监听服务时，全铺在画布上没人看得清。 */
export const SERVICE_OVERFLOW_PREFIX = 'service-overflow:';
export const SERVICE_DISPLAY_LIMIT = 6;
export const PROCESS_EXPAND_LIMIT = 20;
export const PROCESS_GROUP_DISPLAY_LIMIT = 12;
export const PROCESS_GROUP_PAGE_SIZE = 20;

export function buildDisplayGraph(
  source: HostProcessTopologyGraph | null,
  expandedHosts: Set<string>,
  expandedGroups: Set<string>,
  expandedServices: Set<string>,
  overviewGroupsByHost: Record<string, HostProcessGroupDto[]>,
  truncatedGroupsByHost: Record<string, number>,
  loadedGroupsByHost: Record<string, LoadedProcessGroupsState>,
  groupPageLoadingByHost: Record<string, boolean>,
): HostProcessTopologyGraph | null {
  if (!source) return null;

  // 服务焦点图（服务 → 实例 → 进程 → 主机）没有进程树可顺，
  // 跟着主机视图那套走会把实例和监听进程全过滤掉，只剩「主机 — 服务」一条边。
  const serviceFocus = findServiceFocus(source);
  if (serviceFocus) return buildServiceFocusDisplay(source, serviceFocus.id);

  // 多主机 = 资产总览。主机内部的细节（运行时 / 分组 / 服务 / 容器）一张卡都不放，
  // 只保留「被两台以上主机共享」的网段 —— 主机自己的接口不构成总览信息。
  if (source.nodes.filter((node) => node.objectKind === 'HostInventory').length > 1) {
    return buildOverviewDisplay(source);
  }

  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  const processSummaryEdgesByHost = new Map<string, HostProcessTopologyEdge[]>();
  const processGroupEdgesBySummary = new Map<string, HostProcessTopologyEdge[]>();
  const processEdgesByGroup = new Map<string, HostProcessTopologyEdge[]>();
  const hostServiceEdgesByHost = new Map<string, HostProcessTopologyEdge[]>();
  const serviceInstanceEdgesByInstance = new Map<string, HostProcessTopologyEdge[]>();
  const processServiceEdgesByProcess = new Map<string, HostProcessTopologyEdge[]>();

  for (const edge of source.edges) {
    if (edge.edgeKind === 'host_process_assoc') {
      if (edge.target.startsWith(PROCESS_SUMMARY_PREFIX)) {
        const edges = processSummaryEdgesByHost.get(edge.source) ?? [];
        edges.push(edge);
        processSummaryEdgesByHost.set(edge.source, edges);
        continue;
      }
      if (edge.source.startsWith(PROCESS_SUMMARY_PREFIX) && edge.target.startsWith(PROCESS_GROUP_PREFIX)) {
        const edges = processGroupEdgesBySummary.get(edge.source) ?? [];
        edges.push(edge);
        processGroupEdgesBySummary.set(edge.source, edges);
        continue;
      }
      if (edge.source.startsWith(PROCESS_GROUP_PREFIX)) {
        const edges = processEdgesByGroup.get(edge.source) ?? [];
        edges.push(edge);
        processEdgesByGroup.set(edge.source, edges);
      }
      continue;
    }
    if (edge.edgeKind === 'host_service_assoc') {
      const edges = hostServiceEdgesByHost.get(edge.source) ?? [];
      edges.push(edge);
      hostServiceEdgesByHost.set(edge.source, edges);
      continue;
    }
    if (edge.edgeKind === 'service_instance_assoc') {
      const edges = serviceInstanceEdgesByInstance.get(edge.source) ?? [];
      edges.push(edge);
      serviceInstanceEdgesByInstance.set(edge.source, edges);
      continue;
    }
    if (edge.edgeKind === 'process_service_assoc') {
      const edges = processServiceEdgesByProcess.get(edge.source) ?? [];
      edges.push(edge);
      processServiceEdgesByProcess.set(edge.source, edges);
    }
  }

  const displayNodes: HostProcessTopologyNode[] = [];
  const displayEdges: HostProcessTopologyEdge[] = [];
  const includedNodeIds = new Set<string>();
  const visibleProcessNodeIds = new Set<string>();
  const visibleHostNodeIds = new Set<string>();
  const runtimeBoundServiceNodeIds = new Set<string>();

  const addNode = (node: HostProcessTopologyNode | undefined) => {
    if (!node || includedNodeIds.has(node.id)) return;
    displayNodes.push(node);
    includedNodeIds.add(node.id);
  };

  const addEdge = (edge: HostProcessTopologyEdge) => {
    if (!includedNodeIds.has(edge.source) || !includedNodeIds.has(edge.target)) return;
    if (displayEdges.some((item) => item.id === edge.id)) return;
    displayEdges.push(edge);
  };

  for (const node of source.nodes) {
    if (
      node.objectKind !== 'HostInventory' &&
      node.objectKind !== 'NetworkSegment' &&
      node.objectKind !== 'ContainerRuntime' &&
      node.objectKind !== 'Subject'
    ) {
      continue;
    }
    addNode(node);
    if (node.objectKind === 'HostInventory') {
      visibleHostNodeIds.add(node.id);
    }
  }

  for (const edge of source.edges) {
    if (edge.edgeKind === 'host_process_assoc') continue;
    if (edge.edgeKind === 'host_service_assoc') continue;
    if (edge.edgeKind === 'service_instance_assoc') continue;
    if (edge.edgeKind === 'process_service_assoc') continue;
    if (edge.edgeKind === 'host_container_assoc') continue;
    if (edge.edgeKind === 'container_service_assoc') continue;
    addEdge(edge);
  }

  // 容器层：容器属于主机，实例属于容器。
  // 这里不筛实例/服务 —— 容器卡片点进去看不到「里面在听什么」就没有意义；
  // 容器数量本身是主机级事实（k8s 节点几十个），不像服务那样需要在画布上 TopN。
  for (const edge of source.edges) {
    if (edge.edgeKind !== 'host_container_assoc') continue;
    addNode(nodesById.get(edge.source));
    addNode(nodesById.get(edge.target));
    addEdge(edge);
  }
  for (const edge of source.edges) {
    if (edge.edgeKind !== 'container_service_assoc') continue;
    addNode(nodesById.get(edge.target));
    addEdge(edge);
    for (const instanceEdge of serviceInstanceEdgesByInstance.get(edge.target) ?? []) {
      addNode(nodesById.get(instanceEdge.target));
      addEdge(instanceEdge);
    }
  }

  for (const [hostNodeId, summaryEdges] of processSummaryEdgesByHost.entries()) {
    for (const summaryEdge of summaryEdges) {
      const summaryNode = nodesById.get(summaryEdge.target);
      if (!summaryNode) continue;

      const groupEdges = processGroupEdgesBySummary.get(summaryNode.id) ?? [];
      const singleGroupEdge = groupEdges.length === 1 ? groupEdges[0] : null;
      const singleGroupNode = singleGroupEdge ? nodesById.get(singleGroupEdge.target) : undefined;
      const processEdges = singleGroupNode ? (processEdgesByGroup.get(singleGroupNode.id) ?? []) : [];
      const canCollapseSingleProcess = groupEdges.length === 1 && processEdges.length === 1;

      if (canCollapseSingleProcess) {
        const processEdge = processEdges[0];
        const processNode = nodesById.get(processEdge.target);
        addNode(processNode);
        if (processNode) {
          visibleProcessNodeIds.add(processNode.id);
          addEdge({
            id: `edge:${hostNodeId}:${processNode.id}:collapsed`,
            edgeKind: 'host_process_assoc',
            source: hostNodeId,
            target: processNode.id,
            properties: {
              collapsed: true,
              originalSummaryId: summaryNode.id,
              originalGroupId: singleGroupNode?.id ?? '',
            },
          });
        }
        continue;
      }

      addNode(summaryNode);
      addEdge(summaryEdge);

      const isExpanded = expandedHosts.has(hostNodeId);
      if (!isExpanded) continue;

      const hostObjectId = summaryNode.objectId;
      const visibleGroups = [
        ...(overviewGroupsByHost[hostObjectId] ?? []),
        ...(loadedGroupsByHost[hostObjectId]?.groups ?? []),
      ];
      const rankedGroupEdges = [...groupEdges].sort((left, right) => {
        const leftNode = nodesById.get(left.target);
        const rightNode = nodesById.get(right.target);
        const leftCount = Number(leftNode?.properties.processCount ?? 0);
        const rightCount = Number(rightNode?.properties.processCount ?? 0);
        return rightCount - leftCount;
      });
      const visibleGroupEdges = visibleGroups.length > 0
        ? rankedGroupEdges.filter((edge) => {
            const node = nodesById.get(edge.target);
            const executable = typeof node?.properties.executable === 'string'
              ? node.properties.executable
              : '';
            return visibleGroups.some((group) => group.executable === executable);
          })
        : rankedGroupEdges.slice(0, PROCESS_GROUP_DISPLAY_LIMIT);
      const visibleGroupEdgeIds = new Set(visibleGroupEdges.map((edge) => edge.id));

      for (const groupEdge of visibleGroupEdges) {
        const groupNode = nodesById.get(groupEdge.target);
        if (!groupNode) continue;

        addNode(groupNode);
        addEdge(groupEdge);

        const isGroupExpanded = expandedGroups.has(groupNode.id);
        if (!isGroupExpanded) continue;

        const groupedProcessEdges = processEdgesByGroup.get(groupNode.id) ?? [];
        for (const processEdge of groupedProcessEdges.slice(0, PROCESS_EXPAND_LIMIT)) {
          const processNode = nodesById.get(processEdge.target);
          if (!processNode) continue;
          addNode(processNode);
          addEdge(processEdge);
          visibleProcessNodeIds.add(processNode.id);
        }
      }

      const totalGroups =
        (
          loadedGroupsByHost[hostObjectId]?.totalGroups
          ?? ((overviewGroupsByHost[hostObjectId]?.length ?? 0) + (truncatedGroupsByHost[hostObjectId] ?? 0))
        )
        || rankedGroupEdges.length;
      const hiddenGroupCount = Math.max(0, totalGroups - visibleGroupEdges.length);
      if (hiddenGroupCount > 0) {
        const hiddenProcessCount = rankedGroupEdges
          .filter((edge) => !visibleGroupEdgeIds.has(edge.id))
          .reduce((sum, edge) => {
            const node = nodesById.get(edge.target);
            return sum + Number(node?.properties.processCount ?? 0);
          }, 0);
        const overflowNodeId = `process-group-overflow:${hostNodeId}`;
        addNode({
          id: overflowNodeId,
          objectKind: 'ProcessGroup',
          objectId: summaryNode.objectId,
          layer: 'resource',
          label: groupPageLoadingByHost[hostObjectId]
            ? `loading ${hiddenGroupCount} groups...`
            : `+ ${hiddenGroupCount} groups`,
          properties: {
            collapsed: true,
            hiddenGroups: hiddenGroupCount,
            hiddenProcesses: hiddenProcessCount,
            displayLimit: PROCESS_GROUP_DISPLAY_LIMIT,
            fullGroupsLoading: Boolean(groupPageLoadingByHost[hostObjectId]),
            loadedGroups: loadedGroupsByHost[hostObjectId]?.groups.length ?? 0,
            totalGroups,
            pageSize: loadedGroupsByHost[hostObjectId]?.limit ?? PROCESS_GROUP_PAGE_SIZE,
            hasMore: loadedGroupsByHost[hostObjectId]?.hasMore ?? true,
          },
        });
        addEdge({
          id: `edge:${summaryNode.id}:${overflowNodeId}`,
          edgeKind: 'host_process_assoc',
          source: summaryNode.id,
          target: overflowNodeId,
          properties: {
            collapsed: true,
          },
        });
      }
    }
  }

  for (const processNodeId of visibleProcessNodeIds) {
    const bindingEdges = processServiceEdgesByProcess.get(processNodeId) ?? [];
    for (const bindingEdge of bindingEdges) {
      const instanceNode = nodesById.get(bindingEdge.target);
      addNode(instanceNode);
      addEdge(bindingEdge);

      const instanceToServiceEdges = serviceInstanceEdgesByInstance.get(bindingEdge.target) ?? [];
      for (const instanceEdge of instanceToServiceEdges) {
        const serviceNode = nodesById.get(instanceEdge.target);
        addNode(serviceNode);
        addEdge(instanceEdge);
        runtimeBoundServiceNodeIds.add(instanceEdge.target);
      }
    }
  }

  for (const hostNodeId of visibleHostNodeIds) {
    const hostNode = nodesById.get(hostNodeId);
    const serviceEdges = (hostServiceEdgesByHost.get(hostNodeId) ?? []).filter(
      (edge) => !runtimeBoundServiceNodeIds.has(edge.target),
    );
    if (serviceEdges.length === 0) continue;

    // 画布是概览，不是清单：只放最值得看的几个，剩下的收进溢出节点。
    // 排序按「对外暴露的端点数」优先（0.0.0.0 / ::）—— 监听在回环上的服务再重要，
    // 也不如一个对外开的端口值得占画布。
    const ranked = [...serviceEdges].sort((left, right) => {
      const leftRank = serviceExposureRank(nodesById.get(left.target));
      const rightRank = serviceExposureRank(nodesById.get(right.target));
      if (rightRank.external !== leftRank.external) {
        return rightRank.external - leftRank.external;
      }
      if (rightRank.total !== leftRank.total) {
        return rightRank.total - leftRank.total;
      }
      return (nodesById.get(left.target)?.label ?? '').localeCompare(
        nodesById.get(right.target)?.label ?? '',
        'en',
      );
    });

    const expanded = expandedServices.has(hostNodeId);
    const visible = expanded ? ranked : ranked.slice(0, SERVICE_DISPLAY_LIMIT);
    for (const serviceEdge of visible) {
      addNode(nodesById.get(serviceEdge.target));
      addEdge(serviceEdge);
    }

    const hiddenCount = ranked.length - visible.length;
    const needsOverflow = hiddenCount > 0 || (expanded && ranked.length > SERVICE_DISPLAY_LIMIT);
    if (needsOverflow) {
      const overflowNodeId = `${SERVICE_OVERFLOW_PREFIX}${hostNodeId}`;
      const label = hiddenCount > 0 ? `+ ${hiddenCount} 个服务` : '收起列表';
      addNode({
        id: overflowNodeId,
        objectKind: 'ServiceEntity',
        objectId: hostNode?.objectId ?? '',
        layer: 'resource',
        label,
        properties: {
          collapsed: true,
          name: label,
          hiddenServices: hiddenCount,
          totalServices: ranked.length,
          displayLimit: SERVICE_DISPLAY_LIMIT,
        },
      });
      addEdge({
        id: `edge:${hostNodeId}:${overflowNodeId}`,
        edgeKind: 'host_service_assoc',
        source: hostNodeId,
        target: overflowNodeId,
        properties: { collapsed: true },
      });
    }
  }

  return {
    nodes: displayNodes,
    edges: displayEdges,
    metadata: source.metadata,
  };
}

/**
 * 总览装配：主机 + 共享网段。
 *
 * 后端可能给同一网段每个主机一份节点（同一 CIDR、不同 objectId）；按 CIDR 合并成一张卡，
 * 只挂在真正共享它的主机上。只属于单台主机的接口直接丢弃 —— 那是「主机内部」的信息，
 * 聚焦到那台主机时才需要。
 */
function buildOverviewDisplay(source: HostProcessTopologyGraph): HostProcessTopologyGraph {
  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  const hosts = source.nodes
    .filter((node) => node.objectKind === 'HostInventory')
    .sort((left, right) => left.label.localeCompare(right.label, 'en'));
  const hostIds = new Set(hosts.map((host) => host.id));

  const shared = new Map<string, { node: HostProcessTopologyNode; hosts: Set<string> }>();
  for (const edge of source.edges) {
    if (edge.edgeKind !== 'host_network_assoc') continue;
    let hostId: string | null = null;
    let segmentId: string | null = null;
    if (hostIds.has(edge.source)) {
      hostId = edge.source;
      segmentId = edge.target;
    } else if (hostIds.has(edge.target)) {
      hostId = edge.target;
      segmentId = edge.source;
    }
    if (!hostId || !segmentId) continue;
    const segment = nodesById.get(segmentId);
    if (!segment || segment.objectKind !== 'NetworkSegment') continue;

    const key = String(segment.properties.cidr ?? segment.label);
    const entry = shared.get(key) ?? { node: segment, hosts: new Set<string>() };
    entry.hosts.add(hostId);
    shared.set(key, entry);
  }

  const nodes: HostProcessTopologyNode[] = [...hosts];
  const edges: HostProcessTopologyEdge[] = [];
  const keys = [...shared.keys()].sort((left, right) => left.localeCompare(right, 'en'));

  for (const key of keys) {
    const entry = shared.get(key);
    if (!entry || entry.hosts.size < 2) continue;
    const id = `overview-network:${key}`;
    nodes.push({
      ...entry.node,
      id,
      label: key || entry.node.label,
      properties: { ...entry.node.properties, sharedHostCount: entry.hosts.size },
    });
    for (const hostId of entry.hosts) {
      edges.push({
        id: `overview-edge:${hostId}:${id}`,
        edgeKind: 'host_network_assoc',
        source: hostId,
        target: id,
        properties: { overview: true },
      });
    }
  }

  return { nodes, edges, metadata: source.metadata };
}

/**
 * 服务焦点图的识别：整张图没有进程汇总/分组（那是主机视图），
 * 且恰好一个服务节点带实例。网段焦点图没有服务节点，不会误判。
 */
function findServiceFocus(graph: HostProcessTopologyGraph): HostProcessTopologyNode | null {
  if (
    graph.nodes.some(
      (node) => node.objectKind === 'ProcessSummary' || node.objectKind === 'ProcessGroup',
    )
  ) {
    return null;
  }
  const services = graph.nodes.filter((node) => node.objectKind === 'ServiceEntity');
  if (services.length !== 1) return null;
  const service = services[0];
  const hasInstance = graph.edges.some(
    (edge) => edge.edgeKind === 'service_instance_assoc' && edge.target === service.id,
  );
  return hasInstance ? service : null;
}

/**
 * 服务焦点图的装配：服务 + 它的全部实例 + 监听进程 + 所在主机，一个都不筛。
 *
 * 主机视图要按 TopN 收服务（一台开发机 28 个），这里反过来：用户点进来就是想看全，
 * 实例和进程就是这张图的主题，不能再藏。
 */
function buildServiceFocusDisplay(
  source: HostProcessTopologyGraph,
  serviceNodeId: string,
): HostProcessTopologyGraph {
  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  const nodes: HostProcessTopologyNode[] = [];
  const edges: HostProcessTopologyEdge[] = [];
  const included = new Set<string>();

  const addNode = (node: HostProcessTopologyNode | undefined) => {
    if (!node || included.has(node.id)) return;
    nodes.push(node);
    included.add(node.id);
  };
  const addEdge = (edge: HostProcessTopologyEdge) => {
    if (!included.has(edge.source) || !included.has(edge.target)) return;
    if (edges.some((item) => item.id === edge.id)) return;
    edges.push(edge);
  };

  addNode(nodesById.get(serviceNodeId));
  for (const edge of source.edges) {
    if (edge.edgeKind === 'service_instance_assoc' && edge.target === serviceNodeId) {
      addNode(nodesById.get(edge.source));
      addEdge(edge);
    }
  }
  for (const edge of source.edges) {
    if (edge.edgeKind === 'process_service_assoc') {
      addNode(nodesById.get(edge.source));
      addEdge(edge);
    }
  }
  // 服务焦点图里的容器只经由「容器 → 实例」出现：它回答的是「这个实例跑在哪个容器里」。
  for (const edge of source.edges) {
    if (edge.edgeKind === 'container_service_assoc') {
      addNode(nodesById.get(edge.source));
      addEdge(edge);
    }
  }
  for (const edge of source.edges) {
    if (edge.edgeKind === 'host_service_assoc' && edge.target === serviceNodeId) {
      addNode(nodesById.get(edge.source));
      addEdge(edge);
    }
  }

  return { nodes, edges, metadata: source.metadata };
}

/**
 * 服务的「暴露程度」：对外（`0.0.0.0` / `::`）的端口数优先，其次总数。
 * 只按端点数排会把一堆回环监听顶上来 —— 那恰恰是最不值得先看的。
 */
function serviceExposureRank(node: HostProcessTopologyNode | undefined): {
  external: number;
  total: number;
} {
  const raw = node?.properties.endpoints;
  if (!Array.isArray(raw)) return { external: 0, total: 0 };

  let external = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const address = String((item as Record<string, unknown>).address ?? '');
    if (address === '0.0.0.0' || address === '::') external += 1;
  }
  return { external, total: raw.length };
}

export function getProcessViewMode(
  selectedNode: HostProcessTopologyNode | null,
  loadedGroupsByHost: Record<string, LoadedProcessGroupsState>,
  groupPageLoadingByHost: Record<string, boolean>,
): 'overview' | 'expanded' | 'loading' | null {
  if (!selectedNode || selectedNode.objectKind !== 'ProcessGroup') {
    return null;
  }
  const hostId = selectedNode.objectId;
  if (groupPageLoadingByHost[hostId]) return 'loading';
  if (loadedGroupsByHost[hostId]?.groups.length) return 'expanded';
  return 'overview';
}

export function getSelectedLoadedProcessGroups(
  selectedNode: HostProcessTopologyNode | null,
  loadedGroupsByHost: Record<string, LoadedProcessGroupsState>,
): LoadedProcessGroupsState | null {
  if (!selectedNode || selectedNode.objectKind !== 'ProcessGroup') {
    return null;
  }
  return loadedGroupsByHost[selectedNode.objectId] ?? null;
}
