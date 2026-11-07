import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProcessKind, passesProcessFilter } from '../src/index';
import type { HostProcessTopologyNode } from '../src/index';

function group(executable: string, label = executable): HostProcessTopologyNode {
  return {
    id: `process-group:${label}`,
    objectKind: 'ProcessGroup',
    objectId: `obj-${label}`,
    layer: 'resource',
    label,
    properties: { executable, processCount: 1 },
  };
}

test('进程归属：macOS 系统服务与系统目录算系统进程', () => {
  assert.equal(classifyProcessKind(group('com.apple.WebKit.WebContent')), 'system');
  assert.equal(classifyProcessKind(group('/usr/libexec/MTLCompilerService')), 'system');
  assert.equal(classifyProcessKind(group('/System/Library/Frameworks/Metal.framework/MTLCompilerService')), 'system');
  assert.equal(classifyProcessKind(group('launchd')), 'system');
  assert.equal(classifyProcessKind(group('/sbin/dhclient')), 'system');
});

test('进程归属：Linux 内核线程与系统服务算系统进程', () => {
  assert.equal(classifyProcessKind(group('kworker/0:1')), 'system');
  assert.equal(classifyProcessKind(group('[kworker/0:1]')), 'system');
  assert.equal(classifyProcessKind(group('systemd-journald')), 'system');
  assert.equal(classifyProcessKind(group('/usr/lib/systemd/systemd-logind')), 'system');
});

test('进程归属：用户程序不算系统进程', () => {
  assert.equal(classifyProcessKind(group('/opt/homebrew/bin/node')), 'user');
  assert.equal(classifyProcessKind(group('/Applications/Visual Studio Code.app/Contents/MacOS/Electron')), 'user');
  assert.equal(classifyProcessKind(group('/Users/me/.local/bin/wparse')), 'user');
  assert.equal(classifyProcessKind(group('chrome_crashpad_handler')), 'user');
});

test('进程过滤：只影响进程节点，主机/网段等保持可见', () => {
  const host: HostProcessTopologyNode = {
    id: 'h1',
    objectKind: 'HostInventory',
    objectId: 'o-h1',
    layer: 'resource',
    label: 'mac',
    properties: {},
  };
  assert.equal(passesProcessFilter(host, 'user'), true);
  assert.equal(passesProcessFilter(host, 'system'), true);
  assert.equal(passesProcessFilter(group('com.apple.WebKit.WebContent'), 'user'), false);
  assert.equal(passesProcessFilter(group('com.apple.WebKit.WebContent'), 'system'), true);
  assert.equal(passesProcessFilter(group('/opt/homebrew/bin/node'), 'system'), false);
  assert.equal(passesProcessFilter(group('/opt/homebrew/bin/node'), 'all'), true);
});
