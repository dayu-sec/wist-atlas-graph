import type { HostProcessTopologyGraph, HostProcessTopologyNode } from '../types/domain';
import type { TelemetryMap } from './telemetry';

export type StatusTone = 'ok' | 'warn' | 'danger' | 'unknown';

export type NodeStatus = {
  tone: StatusTone;
  label: string;
};

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

/** 主机/盘点类对象的状态只表达「数据有多新」，不假装知道在线离线。 */
export function freshnessStatus(scannedAt?: string | null): NodeStatus {
  if (!scannedAt) return { tone: 'unknown', label: '未采集' };
  const time = new Date(scannedAt).getTime();
  if (!Number.isFinite(time)) return { tone: 'unknown', label: '未采集' };
  const age = Date.now() - time;
  if (age < FRESH_MS) return { tone: 'ok', label: '在线' };
  if (age < STALE_MS) return { tone: 'warn', label: '数据陈旧' };
  return { tone: 'warn', label: '数据陈旧' };
}

type Options = {
  scannedAt?: string | null;
  telemetry?: TelemetryMap | null;
};

/**
 * 节点状态优先取遥测；没有遥测时退回「资产事实」：
 * 主机看盘点新鲜度、网段看关联关系、进程看 state。没有数据就是 unknown，不硬编健康。
 */
export function resolveNodeStatus(node: HostProcessTopologyNode, options: Options): NodeStatus {
  const sampled = options.telemetry?.nodes[node.id];
  if (sampled?.status) {
    return { tone: sampled.status, label: sampled.statusLabel ?? '示例状态' };
  }

  switch (node.objectKind) {
    case 'HostInventory':
      return freshnessStatus(options.scannedAt);
    case 'ProcessSummary':
      return freshnessStatus(options.scannedAt);
    case 'NetworkSegment':
      return { tone: 'ok', label: '已关联' };
    case 'ProcessRuntime': {
      const state = String(node.properties.state ?? '');
      return state && state !== '-'
        ? { tone: 'ok', label: '运行中' }
        : { tone: 'unknown', label: '状态未采集' };
    }
    case 'Subject':
      return { tone: 'unknown', label: '未采集' };
    default:
      return { tone: 'ok', label: '已采集' };
  }
}

export type HealthCounts = Record<StatusTone, number>;

export function countHealth(
  graph: HostProcessTopologyGraph | null,
  options: Options,
): HealthCounts {
  const counts: HealthCounts = { ok: 0, warn: 0, danger: 0, unknown: 0 };
  if (!graph) return counts;
  for (const node of graph.nodes) {
    counts[resolveNodeStatus(node, options).tone] += 1;
  }
  return counts;
}

export const STATUS_LABELS: Record<StatusTone, string> = {
  ok: '正常',
  warn: '注意',
  danger: '异常',
  unknown: '未采集',
};

export function statusToneClass(tone: StatusTone): string {
  return tone === 'ok'
    ? 'text-ok'
    : tone === 'warn'
      ? 'text-warn'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-ink-faint';
}
