import type { LayerKind, NodeKind } from '../types/domain';
import { LAYER_NODE_KINDS } from '../types/domain';

export type NodeStyle = {
  /** 图标块底色 */
  fill: string;
  /** 图标与描边色 */
  stroke: string;
  /** 文字/角标色 */
  accent: string;
  /** 中文名 */
  label: string;
};

/**
 * 颜色只承担「分类」，不承担「装饰」。
 *
 * 上一版的节点是满色块（薄荷绿 / 婴儿蓝 / 琥珀），十来个节点就把画布变成糖果盘；
 * 现在大面积留白交给卡片本身，颜色只出现在 28px 的图标块和一根细角标上。
 */
export const NODE_STYLES: Record<NodeKind, NodeStyle> = {
  HostInventory: { fill: 'var(--node-host-fill)', stroke: 'var(--node-host-stroke)', accent: 'var(--node-host-accent)', label: '主机' },
  NetworkSegment: { fill: 'var(--node-network-fill)', stroke: 'var(--node-network-stroke)', accent: 'var(--node-network-accent)', label: '网段' },
  ProcessSummary: { fill: 'var(--node-summary-fill)', stroke: 'var(--node-summary-stroke)', accent: 'var(--node-summary-accent)', label: '进程汇总' },
  ProcessGroup: { fill: 'var(--node-group-fill)', stroke: 'var(--node-group-stroke)', accent: 'var(--node-group-accent)', label: '进程分组' },
  ProcessRuntime: { fill: 'var(--node-process-fill)', stroke: 'var(--node-process-stroke)', accent: 'var(--node-process-accent)', label: '进程' },
  ServiceEntity: { fill: 'var(--node-service-fill)', stroke: 'var(--node-service-stroke)', accent: 'var(--node-service-accent)', label: '服务' },
  ServiceInstance: { fill: 'var(--node-instance-fill)', stroke: 'var(--node-instance-stroke)', accent: 'var(--node-instance-accent)', label: '服务实例' },
  ContainerRuntime: { fill: 'var(--node-container-fill)', stroke: 'var(--node-container-stroke)', accent: 'var(--node-container-accent)', label: '容器' },
  Subject: { fill: 'var(--node-subject-fill)', stroke: 'var(--node-subject-stroke)', accent: 'var(--node-subject-accent)', label: '责任人' },
};

export const LAYER_COLORS: Record<LayerKind, { bg: string; border: string; label: string; short: string }> = {
  resource: { bg: 'var(--color-ok-soft)', border: 'var(--color-ok)', label: '资源目录', short: '资源' },
  governance: { bg: 'var(--color-brand-soft)', border: 'var(--color-brand)', label: '责任治理', short: '治理' },
};

export function nodeKindToLayer(kind: NodeKind): LayerKind {
  for (const [layer, kinds] of Object.entries(LAYER_NODE_KINDS)) {
    if ((kinds as readonly NodeKind[]).includes(kind)) return layer as LayerKind;
  }
  return 'resource';
}

export function getNodeStyle(kind: NodeKind): NodeStyle {
  return NODE_STYLES[kind] ?? NODE_STYLES.ProcessRuntime;
}

/** 兼容旧调用：详情面板标题用 layer 色。 */
export function getLayerStyle(kind: NodeKind) {
  const style = getNodeStyle(kind);
  return { bg: style.fill, border: style.stroke, label: style.label };
}
