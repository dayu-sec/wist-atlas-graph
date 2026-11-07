import type { HostProcessTopologyGraph } from '../types/domain';
import type { StatusTone } from './status';

export type NodeTelemetry = {
  inMbps?: number;
  outMbps?: number;
  latencyMs?: number;
  status?: StatusTone;
  statusLabel?: string;
  /** 近 15 分钟，24 个点；示例数据 */
  history?: number[];
  /** 进程状态分布；所有分组加起来等于 1,120 之类的总数 */
  state?: { running: number; sleeping: number; other: number };
  stateHistory?: number[];
};

export type HostTelemetry = {
  inMbps: number;
  outMbps: number;
  history: number[];
};

export type TelemetryMap = {
  demo: boolean;
  nodes: Record<string, NodeTelemetry>;
  host?: HostTelemetry;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wave(base: number, amplitude: number, seed: number, length = 24): number[] {
  return Array.from({ length }, (_, index) => {
    const waveA = Math.sin((index + seed) * 0.72) * amplitude;
    const waveB = Math.cos((index + seed) * 0.27) * amplitude * 0.45;
    return Math.max(0, Number((base + waveA + waveB).toFixed(1)));
  });
}

function ratio(hash: number, min: number, max: number): number {
  const unit = (hash % 1000) / 1000;
  return min + unit * (max - min);
}

/**
 * 演示用遥测。
 *
 * 当前 read model 没有流量/状态/趋势字段；这里生成**确定性**的示例值，
 * 只在显式打开「示例数据」时使用，页面上会一直带「示例」标识。
 * 真正的 telemetry 接入后，用同一份类型替换 buildDemoTelemetry 即可。
 */
export function buildTelemetry(graph: HostProcessTopologyGraph | null, demo: boolean): TelemetryMap {
  if (!demo || !graph) {
    return { demo: false, nodes: {} };
  }

  const nodes: Record<string, NodeTelemetry> = {};
  let totalIn = 0;
  let totalOut = 0;

  for (const node of graph.nodes) {
    const hash = hashString(node.id);

    if (node.objectKind === 'NetworkSegment') {
      const cidr = String(node.properties.cidr ?? node.label);
      const tunnel = /198\.18\./.test(cidr);
      const inMbps = tunnel ? 0.4 : Number(ratio(hash, 1.6, 12.4).toFixed(1));
      const outMbps = tunnel ? 0.1 : Number((inMbps * ratio(hash >> 3, 0.22, 0.36)).toFixed(1));
      totalIn += inMbps;
      totalOut += outMbps;
      nodes[node.id] = {
        inMbps,
        outMbps,
        latencyMs: tunnel ? 48 : Math.round(ratio(hash >> 5, 4, 22)),
        status: tunnel ? 'warn' : 'ok',
        statusLabel: tunnel ? '延迟 48ms' : '已关联',
        history: wave(inMbps, inMbps * 0.22, hash % 7),
      };
      continue;
    }

    if (node.objectKind === 'ProcessSummary') {
      const total = Number(node.properties.totalProcesses ?? 0) || 1120;
      const running = Math.round(total * 0.58);
      const sleeping = Math.round(total * 0.31);
      nodes[node.id] = {
        status: 'ok',
        statusLabel: '正常',
        state: { running, sleeping, other: Math.max(0, total - running - sleeping) },
        stateHistory: wave(total, total * 0.03, hash % 11),
      };
      continue;
    }

    if (node.objectKind === 'HostInventory') {
      nodes[node.id] = { status: 'ok', statusLabel: '在线' };
      continue;
    }

    if (node.objectKind === 'ProcessGroup') {
      nodes[node.id] = { status: 'ok', statusLabel: '已采集' };
      continue;
    }

    if (
      node.objectKind === 'ServiceEntity' ||
      node.objectKind === 'ServiceInstance' ||
      node.objectKind === 'ContainerRuntime'
    ) {
      nodes[node.id] = { status: 'ok', statusLabel: '已采集' };
    }
  }

  const hostIn = Number((totalIn || 24.6).toFixed(1));
  const hostOut = Number((totalOut || 6.8).toFixed(1));
  const hostHistory = wave(hostIn, hostIn * 0.14, 3);
  const hostNode = graph.nodes.find((node) => node.objectKind === 'HostInventory');
  if (hostNode) {
    nodes[hostNode.id] = {
      ...nodes[hostNode.id],
      inMbps: hostIn,
      outMbps: hostOut,
      history: hostHistory,
    };
  }

  return {
    demo: true,
    nodes,
    host: {
      inMbps: hostIn,
      outMbps: hostOut,
      history: hostHistory,
    },
  };
}

export function formatMbps(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value < 10 ? value.toFixed(1) : value.toFixed(0);
}

export function formatLatency(value?: number): string {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}ms`;
}
