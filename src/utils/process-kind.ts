import type { HostProcessTopologyNode } from '../types/domain';
import { basename } from './format';

/**
 * 进程的「归属」分类：系统级 vs 用户级。
 *
 * 画布上最吵的往往不是业务进程，而是 `com.apple.*`、`launchd`、`kworker` 这类系统进程 ——
 * 一台开发机 26 个分组里能有一半是它们。分类只做**展示过滤**，不改后端事实，
 * 所以规则宁可保守：认不出的算「用户」，避免把业务进程误藏起来。
 */
export type ProcessKind = 'system' | 'user';

/** 明确的系统目录：路径以这些前缀开头的可执行文件属于系统。 */
const SYSTEM_PREFIXES = [
  '/system/',
  '/usr/libexec/',
  '/usr/sbin/',
  '/sbin/',
  '/library/apple/',
  '/system/library/',
  'c:\\windows\\',
  'c:\\program files\\windows',
];

/** 没有路径可看时，按可执行文件名兜底。 */
const SYSTEM_NAMES = new Set([
  'launchd',
  'kernel_task',
  'windowserver',
  'loginwindow',
  'mds',
  'mds_stores',
  'mdworker',
  'cfprefsd',
  'runningboardd',
  'logd',
  'notifyd',
  'powerd',
  'configd',
  'syslogd',
  'opendirectoryd',
  'securityd',
  'distnoted',
  'coreaudiod',
  'bluetoothd',
  'airportd',
  'sharingd',
  'systemstats',
  'trustd',
  'tccd',
  'amfid',
  'fseventsd',
  'thermald',
  'appleeventsd',
  'systemd',
  'systemd-journald',
  'systemd-udevd',
  'systemd-logind',
  'kthreadd',
  'dbus-daemon',
  'rsyslogd',
  'cron',
  'crond',
  'sshd',
]);

/** `kworker/0:1`、`ksoftirqd/0`、`migration/0`、`rcu_sched` 这类内核线程。 */
const KERNEL_THREAD = /^(kworker|ksoftirqd|migration|rcu_|kthreadd|jbd2|kcompactd|kswapd|watchdog)/i;
/** 内核线程常写成 `[kworker/0:1]`。 */
const BRACKETED = /^\[.+\]$/;

function looksLikeSystem(executable: string, label: string): boolean {
  const raw = (executable || label).trim();
  const lowerRaw = raw.toLowerCase();
  // 内核线程在 /proc 里写成 `kworker/0:1` 或 `[kworker/0:1]`：先按整串判断，
  // 否则 basename 会把 `kworker/0:1` 切成 `0:1`。
  if (BRACKETED.test(raw) || KERNEL_THREAD.test(lowerRaw)) return true;
  if (SYSTEM_PREFIXES.some((prefix) => lowerRaw.startsWith(prefix))) return true;

  const name = (executable ? basename(executable) : label).trim();
  const lower = name.toLowerCase();
  if (!lower) return false;
  // macOS 的系统服务几乎都以 com.apple. 开头（MTLCompilerService、WebKit.WebContent…）。
  if (lower.startsWith('com.apple.')) return true;
  if (SYSTEM_NAMES.has(lower)) return true;
  if (KERNEL_THREAD.test(lower)) return true;
  if (BRACKETED.test(name)) return true;
  return false;
}

/** 只有名字（可执行文件 / 显示名）时的归属判断，资产卡的「高频进程」列表也用它。 */
export function classifyProcessName(executable: string, display = ''): ProcessKind {
  return looksLikeSystem(executable, display || executable) ? 'system' : 'user';
}

/** 进程分组 / 进程节点的归属。非进程节点一律返回 `user`（不参与过滤）。 */
export function classifyProcessKind(node: HostProcessTopologyNode): ProcessKind {
  if (node.objectKind !== 'ProcessGroup' && node.objectKind !== 'ProcessRuntime') return 'user';
  const executable = typeof node.properties.executable === 'string' ? node.properties.executable : '';
  const display = typeof node.properties.displayName === 'string' ? node.properties.displayName : '';
  return looksLikeSystem(executable, display || node.label) ? 'system' : 'user';
}

/** 画布过滤：`all` 全看；`user` / `system` 只留对应归属。 */
export function passesProcessFilter(
  node: HostProcessTopologyNode,
  filter: ProcessKind | 'all',
): boolean {
  if (filter === 'all') return true;
  if (node.objectKind !== 'ProcessGroup' && node.objectKind !== 'ProcessRuntime') return true;
  return classifyProcessKind(node) === filter;
}
