import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDisplayGraph,
  computeFocusLayout,
  computeRuntimeLayout,
  PROCESS_GROUP_PREFIX,
  PROCESS_SUMMARY_PREFIX,
  SERVICE_OVERFLOW_PREFIX,
} from '../src/index';
import type {
  HostProcessTopologyEdge,
  HostProcessTopologyGraph,
  HostProcessTopologyNode,
} from '../src/index';

let seq = 0;
function node(
  id: string,
  objectKind: HostProcessTopologyNode['objectKind'],
  properties: Record<string, unknown> = {},
): HostProcessTopologyNode {
  seq += 1;
  return {
    id,
    objectKind,
    objectId: `obj-${seq}`,
    layer: objectKind === 'Subject' ? 'governance' : 'resource',
    label: id,
    properties,
  };
}

function edge(
  source: string,
  target: string,
  edgeKind: HostProcessTopologyEdge['edgeKind'],
  properties: Record<string, unknown> = {},
): HostProcessTopologyEdge {
  seq += 1;
  return { id: `e-${seq}`, edgeKind, source, target, properties };
}

function graph(
  nodes: HostProcessTopologyNode[],
  edges: HostProcessTopologyEdge[],
): HostProcessTopologyGraph {
  return { nodes, edges, metadata: { queryTime: '2026-01-01T00:00:00Z' } };
}

function hostStarGraph(groupCount: number, serviceCount = 0): HostProcessTopologyGraph {
  const host = node('h1', 'HostInventory');
  const summary = node(`${PROCESS_SUMMARY_PREFIX}h1`, 'ProcessSummary', {
    totalProcesses: 600,
    totalPrograms: groupCount,
  });
  const nodes = [host, summary];
  const edges = [edge('h1', summary.id, 'host_process_assoc')];
  for (let index = 0; index < groupCount; index += 1) {
    const group = node(`${PROCESS_GROUP_PREFIX}h1:g${index}`, 'ProcessGroup', {
      processCount: groupCount - index,
      executable: `/usr/bin/prog-${index}`,
    });
    nodes.push(group);
    edges.push(edge(summary.id, group.id, 'host_process_assoc'));
  }
  for (let index = 0; index < serviceCount; index += 1) {
    const service = node(`service:${index}`, 'ServiceEntity', {
      endpoints: [{ address: index % 2 === 0 ? '0.0.0.0' : '127.0.0.1', port: 8000 + index }],
    });
    nodes.push(service);
    edges.push(edge('h1', service.id, 'host_service_assoc'));
  }
  return graph(nodes, edges);
}

test('运行时版式：分组按网格铺开，不退化成一条竖列', () => {
  const source = hostStarGraph(14);
  const layout = computeRuntimeLayout(source);
  assert.ok(layout, '14 个分组 + 主机应该命中运行时版式');
  const groupXs = source.nodes
    .filter((item) => item.objectKind === 'ProcessGroup')
    .map((item) => layout.positions[item.id]?.x)
    .filter((value): value is number => typeof value === 'number');
  assert.equal(groupXs.length, 14);
  assert.equal(new Set(groupXs).size, 2, '14 个分组应排成 2 列');
});

test('运行时版式：出现服务节点时当前退回兜底版式（记录现状，后续放开）', () => {
  const source = hostStarGraph(6, 1);
  assert.equal(computeRuntimeLayout(source), null);
});

test('聚焦版式：一台主机 + 网段时成立，网段在主机左侧', () => {
  const host = node('h1', 'HostInventory');
  const segment = node('net1', 'NetworkSegment', { cidr: '10.0.0.0/24' });
  const source = graph(
    [host, segment],
    [edge('h1', 'net1', 'host_network_assoc', { ifaceName: 'en0' })],
  );
  const layout = computeFocusLayout(source);
  assert.ok(layout);
  assert.ok(layout.positions.net1.x < layout.positions.h1.x);
});

test('显示图：服务走 TopN，超出部分收进溢出节点', () => {
  const source = hostStarGraph(2, 8);
  const display = buildDisplayGraph(source, new Set(), new Set(), new Set(), {}, {}, {}, {});
  assert.ok(display);
  const services = display.nodes.filter((item) => item.objectKind === 'ServiceEntity');
  assert.equal(services.filter((item) => !item.id.startsWith(SERVICE_OVERFLOW_PREFIX)).length, 6);
  const overflow = services.find((item) => item.id.startsWith(SERVICE_OVERFLOW_PREFIX));
  assert.ok(overflow);
  assert.equal(overflow.properties.hiddenServices, 2);
  assert.equal(overflow.label, '+ 2 个服务');
});

test('显示图：单个分组里只有一个进程时折叠成「主机 → 进程」', () => {
  const host = node('h1', 'HostInventory');
  const summary = node(`${PROCESS_SUMMARY_PREFIX}h1`, 'ProcessSummary', { totalProcesses: 1 });
  const group = node(`${PROCESS_GROUP_PREFIX}h1:g0`, 'ProcessGroup', { processCount: 1 });
  const process = node('proc-1', 'ProcessRuntime', { state: 'run' });
  const source = graph(
    [host, summary, group, process],
    [
      edge('h1', summary.id, 'host_process_assoc'),
      edge(summary.id, group.id, 'host_process_assoc'),
      edge(group.id, 'proc-1', 'host_process_assoc'),
    ],
  );
  const display = buildDisplayGraph(source, new Set(), new Set(), new Set(), {}, {}, {}, {});
  assert.ok(display);
  assert.deepEqual(
    display.nodes.map((item) => item.objectKind).sort(),
    ['HostInventory', 'ProcessRuntime'],
  );
  assert.equal(display.edges.length, 1);
  assert.equal(display.edges[0].properties?.collapsed, true);
});

test('显示图：展开主机后才铺开进程分组', () => {
  const source = hostStarGraph(3);
  const collapsed = buildDisplayGraph(source, new Set(), new Set(), new Set(), {}, {}, {}, {});
  assert.ok(collapsed);
  assert.equal(collapsed.nodes.filter((item) => item.objectKind === 'ProcessGroup').length, 0);

  const expanded = buildDisplayGraph(
    source,
    new Set(['h1']),
    new Set(),
    new Set(),
    {},
    {},
    {},
    {},
  );
  assert.ok(expanded);
  assert.equal(expanded.nodes.filter((item) => item.objectKind === 'ProcessGroup').length, 3);
});
