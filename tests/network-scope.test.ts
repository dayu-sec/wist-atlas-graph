import assert from 'node:assert/strict';
import test from 'node:test';
import { networkScopeHostCount, networkScopeIds } from '../src/index';
import type {
  HostProcessTopologyEdge,
  HostProcessTopologyGraph,
  HostProcessTopologyNode,
} from '../src/index';

function hostNode(id: string): HostProcessTopologyNode {
  return {
    id,
    objectKind: 'HostInventory',
    objectId: `obj-${id}`,
    layer: 'resource',
    label: id,
    properties: {},
  };
}

function segmentNode(id: string, cidr: string): HostProcessTopologyNode {
  return {
    id,
    objectKind: 'NetworkSegment',
    objectId: `obj-${id}`,
    layer: 'resource',
    label: cidr,
    properties: { cidr },
  };
}

function edge(source: string, target: string): HostProcessTopologyEdge {
  return { id: `${source}->${target}`, edgeKind: 'host_network_assoc', source, target };
}

function graph(
  nodes: HostProcessTopologyNode[],
  edges: HostProcessTopologyEdge[],
): HostProcessTopologyGraph {
  return { nodes, edges, metadata: { queryTime: '2026-01-01T00:00:00Z' } };
}

const overview = graph(
  [
    hostNode('h1'),
    hostNode('h2'),
    hostNode('h3'),
    segmentNode('net-a', '10.1.0.0/24'),
    segmentNode('net-b', '10.2.0.0/24'),
  ],
  [
    edge('h1', 'net-a'),
    edge('h2', 'net-a'),
    edge('h3', 'net-b'),
    // 网段之间也会连（共用宿主机），收窄时不能被带进来。
    edge('net-a', 'net-b'),
  ],
);

test('选中网段：只留该网段与它的主机', () => {
  const scope = networkScopeIds(overview, 'net-a');
  assert.ok(scope);
  assert.deepEqual([...scope].sort(), ['h1', 'h2', 'net-a']);
  assert.equal(scope.has('h3'), false);
  // 网段之间的边不该把另一个网段带进来（会多出一张孤立卡）。
  assert.equal(scope.has('net-b'), false);
});

test('选中网段：主机数是直连主机，不数网段', () => {
  assert.equal(networkScopeHostCount(overview, 'net-a'), 2);
  assert.equal(networkScopeHostCount(overview, 'net-b'), 1);
});

test('不是总览（聚焦单机）时不收窄', () => {
  const focused = graph(
    [
      hostNode('h1'),
      segmentNode('net-a', '10.1.0.0/24'),
      {
        id: 'summary',
        objectKind: 'ProcessSummary',
        objectId: 'obj-summary',
        layer: 'resource',
        label: '进程',
        properties: {},
      },
    ],
    [edge('h1', 'net-a')],
  );
  assert.equal(networkScopeIds(focused, 'net-a'), null);
});

test('选中的不是网段 / 已经不在图里：不收窄', () => {
  assert.equal(networkScopeIds(overview, 'h1'), null);
  assert.equal(networkScopeIds(overview, 'net-gone'), null);
  assert.equal(networkScopeIds(overview, null), null);
});
