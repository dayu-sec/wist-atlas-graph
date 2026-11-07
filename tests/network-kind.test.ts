import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyNetworkScope, passesNetworkFilter } from '../src/index';
import type { HostProcessTopologyNode } from '../src/index';

function segment(cidr: string, label = '网络接口'): HostProcessTopologyNode {
  return {
    id: `net-${cidr}`,
    objectKind: 'NetworkSegment',
    objectId: `obj-${cidr}`,
    layer: 'resource',
    label,
    properties: { cidr },
  };
}

test('网段归属：回环 / 链路本地 / 组播算本机内部', () => {
  assert.equal(classifyNetworkScope(segment('127.0.0.1/8')), 'host');
  assert.equal(classifyNetworkScope(segment('::1/128')), 'host');
  assert.equal(classifyNetworkScope(segment('169.254.0.0/16')), 'host');
  assert.equal(classifyNetworkScope(segment('fe80::/64')), 'host');
  assert.equal(classifyNetworkScope(segment('224.0.0.0/4')), 'host');
});

test('网段归属：可路由网段算共享', () => {
  assert.equal(classifyNetworkScope(segment('10.42.0.0/24')), 'shared');
  assert.equal(classifyNetworkScope(segment('192.168.1.0/24')), 'shared');
  assert.equal(classifyNetworkScope(segment('172.16.0.0/16')), 'shared');
  assert.equal(classifyNetworkScope(segment('8.8.8.0/24')), 'shared');
});

test('网段归属：虚拟网桥 / 隧道按接口名判为本机内部', () => {
  assert.equal(classifyNetworkScope(segment('172.17.0.0/16'), 'docker0'), 'host');
  assert.equal(classifyNetworkScope(segment('192.168.64.0/24'), 'bridge100'), 'host');
  assert.equal(classifyNetworkScope(segment('100.64.0.1/32'), 'utun3'), 'host');
  assert.equal(classifyNetworkScope(segment('10.42.0.0/24'), 'en0'), 'shared');
});

test('网段过滤：只影响网段节点，主机保持可见', () => {
  const host: HostProcessTopologyNode = {
    id: 'h1',
    objectKind: 'HostInventory',
    objectId: 'o-h1',
    layer: 'resource',
    label: 'mac',
    properties: {},
  };
  assert.equal(passesNetworkFilter(host, 'host'), true);
  assert.equal(passesNetworkFilter(host, 'shared'), true);
  assert.equal(passesNetworkFilter(segment('127.0.0.1/8'), 'shared'), false);
  assert.equal(passesNetworkFilter(segment('127.0.0.1/8'), 'host'), true);
  assert.equal(passesNetworkFilter(segment('10.42.0.0/24'), 'host'), false);
  assert.equal(passesNetworkFilter(segment('10.42.0.0/24'), 'shared'), true);
});
