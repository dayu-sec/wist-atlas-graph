import type { HostProcessTopologyNode } from '../index';
import {
  formatAddressFamily,
  kindLabel,
  numericProperty,
  parseTopPrograms,
  shortCidr,
} from '../index';
import { ArrowRightIcon, KindGlyph, TerminalGlyph } from './icons';
import { basename, formatCount, formatRelative } from '../index';
import { formatMbps, type NodeTelemetry } from '../index';
import type { NodeStatus } from '../index';
import Sparkline from './Sparkline';
import StatusDot from './StatusDot';

export type GraphNodeHint = {
  ifaceName?: string;
  ipAddr?: string;
};

export type HostStats = {
  segments: number;
  processes: number;
  groups?: number;
  arch?: string | null;
  scannedAt?: string | null;
};

type Props = {
  node: HostProcessTopologyNode;
  hint?: GraphNodeHint;
  hostStats?: HostStats;
  selected: boolean;
  focused: boolean;
  dimmed: boolean;
  expanded: boolean;
  status: NodeStatus;
  telemetry?: NodeTelemetry;
  onSelect: (nodeId: string) => void;
  onExpand?: (nodeId: string) => void;
  onFocus: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
};

/**
 * 图上的节点不再是一个「几何形状 + 漂浮标签」，而是一张真正的信息卡：
 * 图标、主标题、副标题、角标各就各位。边只画在卡片之间，标签不再需要白底纸片。
 */
export default function NodeCard({
  node,
  hint,
  hostStats,
  selected,
  focused,
  dimmed,
  expanded,
  status,
  telemetry,
  onSelect,
  onExpand,
  onFocus,
  onHover,
}: Props) {
  const className = [
    'node-card flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface text-left',
    selected ? 'node-card-selected' : '',
    dimmed ? 'node-card-dimmed' : '',
  ].join(' ');

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-label={`${kindLabel(node.objectKind)} ${node.label}`}
      data-node-id={node.id}
      data-selected={selected || undefined}
      data-focused={focused || undefined}
      data-dimmed={dimmed || undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onFocus(node.id);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect(node.id);
      }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
    >
      <CardBody
        node={node}
        hint={hint}
        hostStats={hostStats}
        expanded={expanded}
        status={status}
        telemetry={telemetry}
        focused={focused}
        onExpand={onExpand ? () => onExpand(node.id) : undefined}
      />
    </div>
  );
}

function CardBody({
  node,
  hint,
  hostStats,
  expanded,
  status,
  telemetry,
  focused,
  onExpand,
}: Pick<Props, 'node' | 'hint' | 'hostStats' | 'expanded' | 'status' | 'telemetry' | 'focused'> & {
  onExpand?: () => void;
}) {
  switch (node.objectKind) {
    case 'HostInventory':
      return <HostCard node={node} stats={hostStats} status={status} telemetry={telemetry} />;
    case 'NetworkSegment':
      return <NetworkCard node={node} hint={hint} status={status} telemetry={telemetry} />;
    case 'ProcessSummary':
      return (
        <RuntimeCard
          node={node}
          expanded={expanded}
          focused={focused}
          status={status}
          telemetry={telemetry}
          onExpand={onExpand}
        />
      );
    case 'ProcessGroup':
      return <ProcessGroupCard node={node} status={status} />;
    case 'ServiceEntity':
      return <ServiceCard node={node} status={status} />;
    case 'ContainerRuntime':
      return <ContainerCard node={node} status={status} />;
    case 'Subject':
      return <SubjectCard node={node} status={status} />;
    default:
      return <RuntimeProcessCard node={node} status={status} />;
  }
}

/**
 * 「这台机上有 agentd」的角标。
 *
 * 判据在后端：主机有运行时报文（启动时间 / 负载 / 内存只有 agent 能采）。云 API 只给
 * 静态资产属性，所以「有运行时」= 端侧在报。
 *
 * 三种读法对应三种颜色：
 * - `healthy` → 绿：正在报；
 * - `degraded` / `protect` → 黄：在报，但自己想要人看一眼；
 * - `unavailable` → 红：装过但报不上来（这也解释了为什么这台机没有进程树）。
 *
 * 悬停给最近观测时刻：`agentd` 标记只说「装过」，说不说「还在报」得靠时间。
 */
function AgentdBadge({ node }: { node: HostProcessTopologyNode }) {
  const health = typeof node.properties.agentdHealth === 'string' ? node.properties.agentdHealth : '';
  const observedAt =
    typeof node.properties.agentdObservedAt === 'string' ? node.properties.agentdObservedAt : '';
  const tone =
    health === 'unavailable'
      ? { fill: 'var(--color-danger-soft)', stroke: 'var(--color-danger-strong)' }
      : health === 'degraded' || health === 'protect'
        ? { fill: 'var(--color-warn-soft)', stroke: 'var(--color-warn-strong)' }
        : { fill: 'var(--color-ok-soft)', stroke: 'var(--color-ok-strong)' };
  const title = [
    '边缘采集：这台机上有 agentd 在报',
    health ? `状态 ${health}` : null,
    observedAt ? `最近观测 ${formatRelative(observedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-medium leading-none"
      style={{ backgroundColor: tone.fill, color: tone.stroke }}
      title={title}
    >
      <TerminalGlyph className="size-2.5" />
      agentd
    </span>
  );
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9.5px] font-medium uppercase leading-none tracking-[0.08em] text-ink-faint">
      {children}
    </span>
  );
}

/** 主机是这张图的锚点：身份、系统、规模三行，别的一概不塞。 */
function HostCard({
  node,
  stats,
  status,
  telemetry,
}: {
  node: HostProcessTopologyNode;
  stats?: HostStats;
  status: NodeStatus;
  telemetry?: NodeTelemetry;
}) {
  const os = [node.properties.osName, node.properties.osVersion].filter(Boolean).join(' ');
  const arch =
    stats?.arch ?? (typeof node.properties.arch === 'string' ? node.properties.arch : '');
  // 网段视图里没有「当前主机」的聚合可借，规模数据挂在节点上；两者取有值的那个。
  const segments = stats?.segments ?? optionalNumber(node.properties, 'segmentCount');
  const processes = stats?.processes ?? optionalNumber(node.properties, 'processCount');

  return (
    <div className="flex h-full flex-col px-4 pb-3.5 pt-4">
      <div className="flex items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[12px]"
          style={{ backgroundColor: 'var(--node-host-fill)', color: 'var(--node-host-stroke)' }}
          aria-hidden
        >
          <KindGlyph kind="HostInventory" className="size-[22px]" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold leading-5 tracking-[-0.01em] text-ink" title={node.label}>
              {node.label}
            </h3>
            <span className="shrink-0 rounded-[5px] bg-subtle px-1.5 py-0.5 text-[9.5px] font-medium leading-none text-ink-soft">
              本机
            </span>
            {node.properties.agentd === true ? (
              <AgentdBadge node={node} />
            ) : null}
          </div>
          <p className="mt-1 truncate text-[11px] leading-4 text-ink-mute">
            {os || '系统信息未采集'}
            {arch ? <span className="font-mono text-[10.5px] text-ink-faint"> · {arch}</span> : null}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] leading-3 text-ink-mute">
            <StatusDot tone={status.tone} label={status.label} />
            <span>{status.label}</span>
            {stats?.scannedAt ? (
              <span className="text-ink-faint">· 盘点于 {formatRelative(stats.scannedAt)}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-auto">
        <div className="atlas-grid grid-cols-3 gap-2 border-t border-line-soft pt-2.5">
          <HostStat value={segments} label="网段" />
          <HostStat value={processes} label="进程" />
          <HostStat value={stats?.groups} label="分组" />
        </div>
        {telemetry ? (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[8.5px] uppercase tracking-[0.06em] text-ink-faint">吞吐</span>
            <span className="tnum text-[11px] font-semibold leading-4 text-ink">
              {formatMbps(telemetry.inMbps)}
              <span className="ml-0.5 text-[8px] font-normal text-ink-faint">MB/s</span>
            </span>
            <span className="ml-auto w-[88px] shrink-0">
              <Sparkline values={telemetry.history ?? []} height={18} />
            </span>
          </div>
        ) : (
          <div className="mt-1.5 text-[8.5px] leading-3 text-ink-faint">遥测未接入</div>
        )}
      </div>
    </div>
  );
}

/** 节点属性里的可选数字：没有这个键就返回 undefined（而不是 0）——
 * 「没测」和「测出来是 0」在资产界面上是两件事。 */
function optionalNumber(properties: Record<string, unknown>, key: string): number | undefined {
  const raw = properties[key];
  if (raw === undefined || raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function HostStat({ value, label }: { value?: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="tnum truncate text-[14px] font-semibold leading-5 text-ink">
        {formatCount(value)}
      </div>
      <div className="mt-0.5 text-[9.5px] uppercase leading-none tracking-[0.08em] text-ink-faint">
        {label}
      </div>
    </div>
  );
}

/**
 * 网段卡片的高价值信息不是「它是一个网段」，而是「哪个接口、哪个地址段」。
 * 接口名在边上（host_network_assoc.properties.ifaceName），所以由画布作为 hint 传进来。
 */
function NetworkCard({
  node,
  hint,
  status,
  telemetry,
}: {
  node: HostProcessTopologyNode;
  hint?: GraphNodeHint;
  status: NodeStatus;
  telemetry?: NodeTelemetry;
}) {
  const cidr = String(node.properties.cidr ?? node.label);
  const family = formatAddressFamily(node.properties.addressFamily);
  const iface = hint?.ifaceName;

  return (
    <div className="flex h-full items-center gap-2.5 px-3.5">
      <span
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ backgroundColor: 'var(--node-network-fill)', color: 'var(--node-network-stroke)' }}
        aria-hidden
      >
        <KindGlyph kind="NetworkSegment" className="size-[16px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-[12px] font-semibold leading-4 ${iface ? 'text-ink' : 'text-ink-mute'}`}
            title={iface ?? cidr}
          >
            {iface ?? '网络接口'}
          </span>
          <StatusDot tone={status.tone} label={status.label} />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="truncate font-mono text-[10.5px] leading-4 text-ink-soft" title={cidr}>
            {shortCidr(cidr)}
          </span>
          {!telemetry && family ? (
            <span className="shrink-0 text-[8.5px] text-ink-faint">{family}</span>
          ) : null}
        </div>
      </div>
      {telemetry ? (
        <div className="shrink-0 text-right leading-none">
          <div
            className={`tnum whitespace-nowrap text-[11px] font-semibold ${
              telemetry.status === 'warn' ? 'text-warn-strong' : 'text-ink'
            }`}
          >
            {formatMbps(telemetry.inMbps)}
            <span className="ml-0.5 text-[8px] font-normal text-ink-faint">MB/s ↓</span>
          </div>
          <div className="tnum mt-1.5 text-[9px] text-ink-mute">{formatMbps(telemetry.outMbps)} ↑</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 运行时卡片把「1,120 个进程 / 705 个程序」和「谁在跑」放进同一张卡。
 * 它同时是展开分组的总开关，所以底部明确写出动作，而不是让人猜节点能不能点。
 */
function RuntimeCard({
  node,
  expanded,
  focused,
  status,
  telemetry,
  onExpand,
}: {
  node: HostProcessTopologyNode;
  expanded: boolean;
  focused: boolean;
  status: NodeStatus;
  telemetry?: NodeTelemetry;
  onExpand?: () => void;
}) {
  const totalProcesses = numericProperty(node.properties, 'totalProcesses');
  const totalPrograms = numericProperty(node.properties, 'totalPrograms');
  const topPrograms = parseTopPrograms(node.properties.topPrograms).slice(0, 3);

  return (
    <div className="flex h-full flex-col px-4 pb-3.5 pt-4">
      <div className="flex items-center gap-2">
        <span
          className="flex size-[26px] shrink-0 items-center justify-center rounded-[8px]"
          style={{ backgroundColor: 'var(--node-summary-fill)', color: 'var(--node-summary-stroke)' }}
          aria-hidden
        >
          <KindGlyph kind="ProcessSummary" className="size-[15px]" />
        </span>
        <span className="text-[12px] font-semibold leading-4 text-ink">运行时</span>
        <StatusDot tone={status.tone} label={status.label} />
        <span
          className={`ml-auto rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-medium leading-none ${
            focused
              ? 'border border-brand-line bg-brand-soft text-brand-strong'
              : 'bg-subtle text-ink-soft'
          }`}
        >
          {focused ? '聚焦中' : expanded ? '已展开' : '可展开'}
        </span>
      </div>

      <div className="mt-3.5 flex items-end gap-4">
        <div>
          <div className="tnum text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">
            {formatCount(totalProcesses)}
          </div>
          <MicroLabel>进程</MicroLabel>
        </div>
        <div className="mb-1 h-7 w-px bg-line" aria-hidden />
        <div>
          <div className="tnum text-[15px] font-semibold leading-8 text-ink-soft">
            {formatCount(totalPrograms)}
          </div>
          <MicroLabel>程序</MicroLabel>
        </div>
      </div>

      {telemetry?.state ? (
        (() => {
          const total = telemetry.state.running + telemetry.state.sleeping + telemetry.state.other || 1;
          const pct = (value: number) => `${Math.max(0, (value / total) * 100)}%`;
          return (
            <>
              <div className="mt-2.5 flex h-[5px] overflow-hidden rounded-full bg-subtle">
                <i className="bg-ok" style={{ width: pct(telemetry.state.running) }} />
                <i className="bg-info" style={{ width: pct(telemetry.state.sleeping) }} />
                <i className="bg-warn" style={{ width: pct(telemetry.state.other) }} />
              </div>
              <div className="mt-1 flex gap-2 text-[8.5px] leading-3 text-ink-faint">
                <span className="flex items-center gap-1">
                  <i className="size-1 rounded-full bg-ok" /> 运行 {telemetry.state.running}
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-1 rounded-full bg-info" /> 休眠 {telemetry.state.sleeping}
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-1 rounded-full bg-warn" /> 其他 {telemetry.state.other}
                </span>
              </div>
            </>
          );
        })()
      ) : null}

      <div className="mt-2.5 border-t border-line-soft pt-2.5">
        <MicroLabel>高频程序</MicroLabel>
        <ul className="mt-1.5 space-y-1">
          {topPrograms.map((program) => (
            <li key={program.name} className="flex items-baseline gap-2 text-[10.5px] leading-4">
              <span className="min-w-0 flex-1 truncate text-ink-soft" title={program.name}>
                {program.name}
              </span>
              <span className="tnum shrink-0 text-ink-faint">{program.count}</span>
            </li>
          ))}
          {topPrograms.length === 0 && (
            <li className="text-[10.5px] leading-4 text-ink-faint">暂无程序摘要</li>
          )}
        </ul>
      </div>

      <button
        type="button"
        data-expand-action="process-summary"
        onClick={(event) => {
          event.stopPropagation();
          onExpand?.();
        }}
        className="mt-auto flex w-full items-center justify-between rounded-[6px] border-t border-line-soft pt-2 text-[10px] font-medium text-brand transition-colors hover:text-brand-strong"
      >
        <span>{expanded ? '收起进程分组' : '展开进程分组'}</span>
        <ArrowRightIcon className="size-3.5" />
      </button>
    </div>
  );
}

function ProcessGroupCard({ node, status }: { node: HostProcessTopologyNode; status: NodeStatus }) {
  const isOverflow = Boolean(node.properties.collapsed) && node.properties.hiddenGroups != null;
  if (isOverflow) {
    const hiddenGroups = numericProperty(node.properties, 'hiddenGroups');
    const loading = Boolean(node.properties.fullGroupsLoading);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line-strong bg-elevated/90 px-3 text-center">
        <span className="tnum text-[11px] font-medium leading-4 text-ink-soft">
          {loading ? '正在加载…' : `+ ${formatCount(hiddenGroups)} 个分组`}
        </span>
        <span className="text-[9.5px] leading-3 text-ink-faint">点击继续加载</span>
      </div>
    );
  }

  const executable = String(node.properties.executable ?? '');
  const displayName = executable ? basename(executable) : node.label;
  const processCount = numericProperty(node.properties, 'processCount');
  const memory = numericProperty(node.properties, 'totalMemoryRssMiB');

  return (
    <div className="flex h-full items-center gap-2.5 px-3">
      <span
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[8px]"
        style={{ backgroundColor: 'var(--node-group-fill)', color: 'var(--node-group-stroke)' }}
        aria-hidden
      >
        <KindGlyph kind="ProcessGroup" className="size-[14px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11.5px] font-medium leading-4 text-ink" title={executable || displayName}>
            {displayName}
          </span>
          <StatusDot tone={status.tone} label={status.label} />
        </div>
        <div className="tnum mt-0.5 truncate text-[9.5px] leading-3 text-ink-mute">
          {formatCount(processCount)} 个进程
          {memory > 0 ? ` · ${memory.toFixed(0)} MiB` : ''}
        </div>
      </div>
    </div>
  );
}

function RuntimeProcessCard({ node, status }: { node: HostProcessTopologyNode; status: NodeStatus }) {
  const pid = node.properties.pid;

  return (
    <div className="flex h-full items-center gap-2 px-3">
      <StatusDot tone={status.tone} label={status.label} className="size-1.5" />
      <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-ink-soft" title={node.label}>
        {node.label}
      </span>
      {pid != null && <span className="tnum shrink-0 text-[9px] text-ink-faint">{String(pid)}</span>}
    </div>
  );
}

function ServiceCard({ node, status }: { node: HostProcessTopologyNode; status: NodeStatus }) {
  const instanceCount = numericProperty(node.properties, 'instanceCount');
  const name = String(node.properties.name ?? node.properties.serviceName ?? node.label);
  const endpoints = endpointLabels(node.properties);

  // 溢出节点：图只放 TopN，剩下的一起用这一张卡表示。
  if (node.properties.collapsed === true) {
    const hidden = numericProperty(node.properties, 'hiddenServices');
    const total = numericProperty(node.properties, 'totalServices');
    return (
      <div className="flex h-full items-center gap-2.5 px-3.5">
        <span
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-dashed"
          style={{ borderColor: 'var(--node-service-stroke)', color: 'var(--node-service-stroke)' }}
          aria-hidden
        >
          <KindGlyph kind="ServiceEntity" className="size-[16px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold leading-4 text-ink">
            {name}
          </div>
          <div className="mt-1 truncate text-[9.5px] leading-3 text-ink-mute">
            {hidden > 0 ? `共 ${total} 个服务 · 点开查看` : `共 ${total} 个服务 · 点收起`}
          </div>
        </div>
      </div>
    );
  }

  // 副标题优先给「在哪儿听」。卡片宽度只有 232px，多个端点挤不下：
  // 只展示对外暴露的那个（没有就取第一个），剩下的折成 `+N`，完整列表放 tooltip。
  const primaryEndpoint =
    endpoints.find((endpoint) => endpoint.external) ?? endpoints[0] ?? null;
  const subtitle = primaryEndpoint
    ? endpoints.length > 1
      ? `${primaryEndpoint.label} +${endpoints.length - 1}`
      : primaryEndpoint.label
    : instanceCount > 0
      ? `${instanceCount} 个实例`
      : '服务';
  const subtitleTitle = endpoints.map((endpoint) => endpoint.label).join(' · ') || subtitle;

  return (
    <div className="flex h-full items-center gap-2.5 px-3.5">
      <span
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ backgroundColor: 'var(--node-service-fill)', color: 'var(--node-service-stroke)' }}
        aria-hidden
      >
        <KindGlyph kind="ServiceEntity" className="size-[16px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-semibold leading-4 text-ink" title={name}>
            {name}
          </span>
          <StatusDot tone={status.tone} label={status.label} />
        </div>
        <div
          className="mt-1 truncate font-mono text-[9.5px] leading-3 text-ink-mute"
          title={subtitleTitle}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/** `endpoints` 是后端按 `{protocol, address, port}` 给的全集。 */
type EndpointLabel = { label: string; external: boolean };

function endpointLabels(properties: Record<string, unknown>): EndpointLabel[] {
  const raw = properties.endpoints;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) =>
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null,
    )
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const address = String(item.address ?? '');
      return {
        label: `${String(item.protocol ?? 'tcp')}/${String(item.port ?? '')} ${address}`.trim(),
        // 通配地址才是「对外」；127.0.0.1 / ::1 只有本机能访问。
        external: address === '0.0.0.0' || address === '::',
      };
    })
    .filter((item) => Boolean(item.label));
}

/** 容器卡：名字 + 运行时/镜像。与主机卡片同一密度，不塞 k8s 细节。 */
function ContainerCard({ node, status }: { node: HostProcessTopologyNode; status: NodeStatus }) {
  const name = String(node.properties.containerName ?? node.label);
  const runtime = String(node.properties.runtimeType ?? '');
  const image = typeof node.properties.imageRef === 'string' ? node.properties.imageRef : '';
  const podName = typeof node.properties.podName === 'string' ? node.properties.podName : '';
  const subtitle = image || podName || runtime;

  return (
    <div className="flex h-full items-center gap-2.5 px-3.5">
      <span
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ backgroundColor: 'var(--node-container-fill)', color: 'var(--node-container-stroke)' }}
        aria-hidden
      >
        <KindGlyph kind="ContainerRuntime" className="size-[16px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-semibold leading-4 text-ink" title={name}>
            {name}
          </span>
          <StatusDot tone={status.tone} label={status.label} />
        </div>
        <div
          className="mt-1 truncate font-mono text-[9.5px] leading-3 text-ink-mute"
          title={[subtitle, runtime].filter(Boolean).join(' · ')}
        >
          {subtitle || '容器'}
        </div>
      </div>
    </div>
  );
}

function SubjectCard({ node, status }: { node: HostProcessTopologyNode; status: NodeStatus }) {
  const role = String(node.properties.role ?? node.properties.title ?? '');

  return (
    <div className="flex h-full items-center gap-2.5 px-3">
      <span
        className="flex size-[28px] shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--node-subject-fill)', color: 'var(--node-subject-stroke)' }}
        aria-hidden
      >
        <KindGlyph kind="Subject" className="size-[15px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11.5px] font-medium leading-4 text-ink">{node.label}</span>
          <StatusDot tone={status.tone} label={status.label} />
        </div>
        <div className="mt-0.5 text-[9.5px] leading-3 text-ink-mute">{role || '责任人'}</div>
      </div>
    </div>
  );
}
