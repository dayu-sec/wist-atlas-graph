import type { HostProcessTopologyNode } from '../types/domain';

/**
 * 网段的「归属」分类：本机内部 vs 可共享。
 *
 * 单机视图左侧那条车道里，真正有用的通常只有几个可路由网段；回环、链路本地、
 * 容器/虚拟网桥（docker0、vmnet、bridge100、utun…）是**这台机器自己的事**，
 * 在多主机总览里也不该出现（装配阶段已按「被两台以上主机共享」筛过一遍）。
 *
 * 判据优先看 CIDR，其次看接口名；认不出的算「共享」—— 宁可多显示，不把真网段藏起来。
 */
export type NetworkScope = 'host' | 'shared';

/** 接口名里能看出「这是本机内部」的前缀。 */
const VIRTUAL_IFACE_PREFIXES = [
  'lo',
  'docker',
  'br-',
  'veth',
  'vmnet',
  'virbr',
  'bridge',
  'tun',
  'tap',
  'utun',
  'wg',
  'tailscale',
  'cni',
  'flannel',
  'cali',
  'lxc',
  'vboxnet',
];

function isHostScopedAddress(cidr: string): boolean {
  const value = cidr.trim().toLowerCase();
  if (!value) return false;
  // IPv4 回环
  if (value.startsWith('127.')) return true;
  // IPv6 回环（::1/128 或展开写法）
  if (value === '::1' || value.startsWith('::1/') || value.startsWith('0:0:0:0:0:0:0:1')) return true;
  // 链路本地：169.254/16、fe80::/10
  if (value.startsWith('169.254.')) return true;
  if (value.startsWith('fe80')) return true;
  // 组播
  if (value.startsWith('224.') || value.startsWith('239.') || value.startsWith('ff0')) return true;
  return false;
}

function isVirtualIface(iface: string): boolean {
  const name = iface.trim().toLowerCase();
  if (!name) return false;
  return VIRTUAL_IFACE_PREFIXES.some((prefix) => name === prefix || name.startsWith(prefix));
}

/** 网段归属。非网段节点一律返回 `shared`（不参与过滤）。 */
export function classifyNetworkScope(
  node: HostProcessTopologyNode,
  ifaceName?: string | null,
): NetworkScope {
  if (node.objectKind !== 'NetworkSegment') return 'shared';

  const cidr = String(node.properties.cidr ?? node.properties.address ?? node.label ?? '');
  if (isHostScopedAddress(cidr)) return 'host';

  // 接口名在边上（host_network_assoc.ifaceName），由调用方传进来。
  const iface =
    ifaceName ??
    (typeof node.properties.ifaceName === 'string' ? node.properties.ifaceName : undefined);
  if (iface && isVirtualIface(iface)) return 'host';

  return 'shared';
}

/** 画布过滤：`all` 全看；`shared` / `host` 只留对应归属。 */
export function passesNetworkFilter(
  node: HostProcessTopologyNode,
  filter: NetworkScope | 'all',
  ifaceName?: string | null,
): boolean {
  if (filter === 'all') return true;
  if (node.objectKind !== 'NetworkSegment') return true;
  return classifyNetworkScope(node, ifaceName) === filter;
}
