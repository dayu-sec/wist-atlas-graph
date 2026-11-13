import type { HostProcessTopologyGraph } from '../types/domain';

/**
 * 选中一个共享网段时，画布上该保留哪些节点（该网段 + 与它直连的主机）。
 *
 * 只在**总览图**里生效：总览的网段节点（`overview-network:<cidr>`）表达的是
 * 「这些主机共用的网段」，点它就是「这个网里有哪些机器」。
 * 聚焦到单台主机时，网段是那台机自己的接口，收窄会把进程树一起藏掉 —— 返回 null。
 *
 * 返回 `null` = 不做收窄（调用方按原图渲染）。
 */
export function networkScopeIds(
  graph: HostProcessTopologyGraph,
  networkId: string | null,
): Set<string> | null {
  if (!networkId) return null;
  const segment = graph.nodes.find((node) => node.id === networkId);
  if (!segment || segment.objectKind !== 'NetworkSegment') return null;

  const overview = graph.nodes.every(
    (node) => node.objectKind === 'HostInventory' || node.objectKind === 'NetworkSegment',
  );
  if (!overview) return null;

  const keep = new Set<string>([networkId]);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const other =
      edge.source === networkId ? edge.target : edge.target === networkId ? edge.source : null;
    // 只收主机：网段之间也可能有边，把它们带进来只会多出一张孤立卡。
    if (other && byId.get(other)?.objectKind === 'HostInventory') keep.add(other);
  }
  return keep;
}

/**
 * 该网段直连的主机数。只数主机 —— 边上的另一端也可能是别的资源节点。
 */
export function networkScopeHostCount(
  graph: HostProcessTopologyGraph,
  networkId: string | null,
): number {
  const keep = networkScopeIds(graph, networkId);
  if (!keep) return 0;
  return graph.nodes.filter(
    (node) => node.objectKind === 'HostInventory' && keep.has(node.id),
  ).length;
}
