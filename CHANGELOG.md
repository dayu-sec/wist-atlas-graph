# 更新日志

本文件记录 `@dayu-sec/wist-atlas-graph` 的所有重要变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.0] - 2026-11-13

### Added

- **主机卡上的「agentd」角标**：主机有端侧采集（agentd 上报的运行时）时，卡片标题右侧出现
  一个 `agentd` 角标，颜色跟随 agent 健康：绿=正在报，黄=degraded/protect（它自己在要求和
  人看一眼），红=unavailable（装过但报不上来，这也解释了为什么这台机没有进程树）。
  悬停给出最近观测时刻 ——「装过」和「还在报」是两件事。
- **主机详情抽屉加「采集」段**：端侧是 `agentd · healthy · 最近 3 分钟前`，还是
  `未检测到 agentd（只有云采集）`；同时补了「云实例」（`cloudInstanceId` / `cloudAccount`），
  于是「云上资产 + 装没装 agent」一眼可见。
- `HostTopologyHost` 增加 `cloudInstanceId` / `cloudAccount` 两个可选字段。
- **选中共享网段 = 只看这个网里的主机**：资产总览里点左侧「共享网络」下的一个网段，画布
  收窄到「该网段 + 直连它的主机」，一眼就能回答「这个网段里有哪些机器」。
  - 顶部浮出状态条：`只看网段 · 10.111.0.0/24 · 12 台主机`，✕ / 点空白 / Esc 都能恢复全景；
  - 选主机**不会**清掉网段筛选（否则「点网段 → 点里面的某台机」会把刚筛好的范围又打回全景），
    点空白才清；
  - 只在总览图生效：聚焦单台主机时网段是这台机自己的接口，收窄会把进程树一起藏掉；
  - 收窄后只剩 1 台主机也仍然按总览处理（双击仍是「进入这台主机」）。
- **详情改成悬浮卡（长按 2s 弹出）**：右抽屉是整高覆盖层，不管内容多少都吃掉四分之一画布。
  现在：**按住节点 2 秒**（移动超 8px 算拖拽、不弹）→ 卡片贴着该节点弹出（优先右侧，
  放不下翻到左侧，含高度上限与内部滚动）。卡片带与「选中节点」同一套**紫色光边**
  （`--card-shadow-focused`），一眼能看出它是从那颗节点弹出来的。
  单击仍是选中 + 2 秒后出快捷操作。✕ / Esc / 点空白关闭；选到别的节点自动收起。
  卡片开着时不再浮快捷操作（两个浮层会打架）。
- **总览网格按画布宽高比排列**：以前固定按 16:9 算列数（上限 6），宽屏上只能按高度缩放，
  左右白出一大块。现在 `computeOverviewLayout(graph, aspect)` 收真实画布宽高比（上限 8 列），
  窗口尺寸跨过一档就重排 —— 26 台主机在 2:1 的画布上从 5 列变 6 列，左右留白基本消失。
- **下钻带历史栈**：进入主机 / 网段 / 服务后，画布左上是一条**可点的路径**
  `全部主机（总览） / DEV-INT-Wist-Gateway-01 / 10.168.0.0/24`，点哪一段就回到哪一层
  （`主机 A → 它的网段 → 返回` 会回到主机 A，而不是一路跳回总览）。Esc 也是逐层退。
  实现：`path: TopologyLevel[]` 取代原来的 `hostId + drilldown` 两个并行状态；
  换层的动作（选择器 / 双击主机 / 开网段 / 开服务 / 返回）都只改这个栈，
  拉数据统一由 `loadData` 读栈顶决定（一次换层一个请求，刷新也只刷新当前层）。
- **状态条跟随顶栏排**：聚焦 / 网段 / 面包屑与顶部工具栏钉在同一列（竖排），不再单独
  漂在画布中间盖住节点。

数据由后端挂在主机节点属性上（`agentd` / `agentdHealth` / `agentdObservedAt`），
五个视图（单主机、总览、网段、服务、异步导出）口径一致。

### Fixed

- **修：浮层内的按钮点不动**。`FocusBar` 等浮层挂在 `pointer-events-none` 的容器里，
  自己没拿回事件，导致「居中 / 退出聚焦」实际不可点（只有 Esc 能用）。现在浮层都带
  `pointer-events-auto`，网段状态条也把退出写成了明确按钮「显示全部」。
- **修：双击节点会抢掉「进入下一层」**。`NodeCard` 的双击处理器 `stopPropagation` 后
  调了聚焦，把外层「双击进入主机」盖掉了 —— 于是双击网段得到的是「聚焦」而不是
  「只看这个网段」，还多出一条聚焦状态条。现在双击的语义在画布层统一决定：
  总览里主机 → 进入该主机，共享网段 → 只看这个网段，其余节点才是聚焦。
- **「选中 → 下钻 → 回退」这条链修了四个问题**：
  - **刷新会掉回总览**：在网段 / 服务视图里点刷新，以前走的是 `loadData`（`hostId` 为空）
    → 重拉 first 快照 + 面包屑消失。现在刷新按 `drilldown` 重拉**当前这一层**。
  - **Esc 不进层级**：以前只能清聚焦 / 卡片 / 网段筛选，下钻了就退不回去。现在 Esc 从内到外
    逐层退：聚焦 → 详情卡 → 网段筛选 → 下钻（主机 / 网段 / 服务）→ 取消选中。
  - **换图后选中 id 悬空**：`FETCH_GRAPH_SUCCESS` 不清 `selectedNodeId`，下钻 / 换主机后会一直
    指着一个不存在的节点。现在新图里没这个 id 就清掉，有就保留（刷新同一张图不丢高亮）。
  - **换主机发两次请求**：`openHost` 自己发一次、`loadData` 的 effect 又发一次。现在
    `openHost` 只声明「换到哪一层」（`reloadNonce` +1），拉数据统一走 `loadData` 一条路。
- **打开网段 / 服务下钻时关掉详情卡**：卡片属于上一层，旧卡不该跟着漂到新图上。

实现：新增纯函数 `networkScopeIds` / `networkScopeHostCount`（`utils/network-scope`，带单测），
`useTopologyView` 新增 `networkFocus` / `clearNetworkFocus` / `drilldown` / `backToOverview`，
画布新增 `networkFocusId` 入参。



## [0.6.0] - 2026-11-12

### Added

- **`useTopologyView({ autoSelectFirstHost: false })`**："总览优先" 的宿主（如 `wist-field-web`）
  不再自动选中第一台主机。以前主机列表回来后会把 `hostId` 设成第一台，于是首屏拉了
  两次图（先全量总览、再焦点）且画布与顶栏选择器对不上：选择器显示某台主机、画布却是资产总览。
  默认 `true`（迁移前行为，独立 atlas 页不受影响）。

### Changed

- **进程分组改成"展开主机时"才拉**：`GET /topology/host/{id}/process-overview` 以前一进页面
  就给图里**每台**主机各发一条（12 台机 = 12 份完整主机视图），而总览画布一张分组卡都不画，
  展开某台主机时才真正需要。
- **主机明细改成按需**：`GET /topology/host/{id}` 以前无条件取「图里第一台主机」，
  现在只在**单机焦点图**或**用户点开某台主机**时才取。顺带修了总览页规模数字的口径：
  `processCount` / `segmentCount` / `groupCount` / `serviceCount` 以前会取到那一台主机的数，
  现在回退到 `metadata` 的全局规模（`processCount` 已经是全场进程数）。

## [0.5.1] - 2026-11-07

### Added

- **选中 2 秒后，卡片上方浮出快捷操作**：不用再滚到详情抽屉最底部找按钮。
  - 主机 → 「进入这台主机」；网段 → 「网段里的主机」；服务 → 「监听详情」；所有类型都有「居中」；
  - 主操作（进入/查看）用品牌色区分，浮层随缩放反向缩放，始终是可读字号；
  - 点击「×」或取消选中即消失；刚点开抽屉的 2 秒内不出现，避免和抽屉抢视线。

### Fixed

- 快捷操作浮层与车道标题（如「主机 5」）贴得太近，上移一档留出间距。

## [0.5.0] - 2026-11-07

### Added

- **网段归属分类与过滤**：`classifyNetworkScope` / `passesNetworkFilter`。
  - 「本机内部」：回环（`127/8`、`::1`）、链路本地（`169.254/16`、`fe80::/10`）、组播，
    以及接口名为 `lo / docker / br- / veth / vmnet / virbr / bridge / tun / tap / utun / wg / tailscale / cni / cali` 的虚拟网段；
  - 「共享」：其余可路由网段。认不出的算共享 —— 宁可多显示，不把真网段藏起来。
- 画布工具条新增 **网络** 三档过滤（全部 / 共享 / 本机），与 **进程** 三档并列，各带小标题；
  只有图里出现对应节点类型时才显示。偏好持久化（`wist-atlas-network-filter`）。
- 4 条单测：回环/链路本地/组播、可路由网段、虚拟接口名、过滤边界。

### 说明

- 总览的装配规则不变：多主机时仍然只保留「被两台以上主机共享」的网段，
  所以总览里切到「本机」会是空车道 —— 本机内部网络只在单机视图里存在。

## [0.4.3] - 2026-11-07

### Added

- **过滤偏好持久化**：进程归属过滤写进 `localStorage`（`wist-atlas-process-filter`），
  下次打开仍按上次的选择；读写失败时静默回落到「全部」。
- **资产卡的「高频进程」跟随过滤**：只列当前归属的 Top 5，并在标题旁标出「已隐藏 N 个」；
  全被过滤时给的是「当前过滤下没有进程分组」，而不是「暂无数据」。
- 导出 `classifyProcessName(executable, display)`，供不经过画布节点的场景复用同一套判据。

## [0.4.2] - 2026-11-07

### Added

- **进程归属分类与快速过滤**：`classifyProcessKind` / `passesProcessFilter` ——
  macOS 的 `com.apple.*`、`launchd`、`/System|/usr/libexec|/usr/sbin`、Linux 的 `systemd-*`、
  内核线程（`kworker/0:1` / `[kworker/0:1]`）都归为「系统进程」；认不出的算用户进程。
- 画布工具条新增 **全部 / 用户 / 系统** 三档过滤（只有图里出现进程时才显示）。
  切换时清掉当前选中，避免详情抽屉停在一个已被过滤掉的节点上。
- 4 条单测覆盖 macOS / Linux / 用户程序 / 过滤边界。

## [0.4.1] - 2026-11-07

### Added

- **「居中」快捷按钮**：详情抽屉标题栏（准星图标）与聚焦状态条都加了「居中」——
  一键把当前卡片放回可视区中心（详情抽屉是覆盖层，按 336px 让位）；视图已经缩得很远时
  先拉回 0.9 倍的可读档位再居中。同一个按钮可重复点。

## [0.4.0] - 2026-11-07

### Added

- **多主机总览版式 `computeOverviewLayout`**：主机按 16:9 目标画布铺成网格（列数随数量增长，
  最多 6 列），共享网段单独一条「共享网络」车道。旧版多主机图会掉进 dagre，成为一条竖列 ——
  8 台主机 + 几十个接口节点被压到 20% 缩放。
- **总览装配**：`buildDisplayGraph` 遇到两台以上主机时只保留主机与被**两台以上主机共享**的网段；
  同一 CIDR 的多个节点合并成一张卡。主机内部的运行时 / 分组 / 服务 / 容器，以及只属于单台
  主机的接口，全部收起 —— 聚焦到那台主机时才展开。
- 总览里双击主机卡 = 进入这台主机的拓扑；`setHostId('')` 回到「全部主机（总览）」。
- `hostMetrics`：总览的主机卡用 `GET /hosts` 的 `segmentCount` / `processCount` 填充规模，
  不必逐台再拉资产卡。

### Changed

- `hostCount` 改为按画布上的主机节点数统计（原来多主机图会算成 1），状态栏与顶栏切换器
  在多主机时如实显示「全部主机（总览）」。

## [0.3.1] - 2026-11-07

### Fixed

- **与宿主的类名冲突**：`wist-field-web` 的全局 `.grid` / `.block` / `.shell` 会漏进画布
  （宿主的 `.grid` 带 `grid-template-columns`，把 28px 图标块撑成 340px 网格）。
  包内不再使用这三个通用类名：图标块改 `flex + items-center justify-center`，二维网格改用
  包自己的 `.atlas-grid`，详情面板背景改 `bg-shell`。
- **`GraphRoot` 的布局**：作用域内 utility 是后代选择器，根元素自己用不上。改为在
  `.atlas-graph-root` 上直接定义 `display:flex; flex:1; min-width:0; min-height:0`，
  宿主只需给它高度（否则 `TopologyCanvasView` 在 flex 列里高度为 0）。

### 说明

- `wist-field-web` 已接入：拓扑页删掉 iframe，改为 `useTopologyView` + `TopologyCanvasView`，
  数据走 BFF 的 `/api/atlas/*`；`/atlas/` 反代与开发者提示条一并删除。

## [0.3.0] - 2026-11-07

### Added

- **`useTopologyView({ client, initialHostId, demo, fixture, handleEscape })`**：一张拓扑视图的
  全部状态与动作 —— 取图、资卡、进程分组展开/分页、服务焦点跳转、选中/聚焦/搜索/图层、
  状态与健康口径。逻辑来自 `wist-atlas-web/App.tsx`，但不含顶栏/左栏/状态栏/服务清单。
- **`TopologyCanvasView`**：画布 + 工具条 + 聚焦条 + 详情抽屉 + 错误提示，自带 `GraphRoot`。
  宿主把它放进自己的布局即可拿到完整交互。
- **`TopologyView`**：一行接入（内部自己调 `useTopologyView`），适合不需要外壳的宿主。
- `TopologyViewState` 暴露 `layerVisibility`（画布图层开关需要）、`focusedNode`。

### Changed

- `wist-atlas-web` 的 `App.tsx` 从 777 行降到 ~290 行，只剩页面外壳与外壳状态；
  装配逻辑全部改由 `useTopologyView` 提供。迁移后同一 fixture 像素比对 0 差异。

## [0.2.0] - 2026-11-07

### Added

- **画布层（`./ui`）**：`TopologyCanvas`、`NodeCard`、`NodeDetailPanel`、`CanvasToolbar`、
  `FocusBar`、`StatusDot` / `StatusPill`、`Sparkline`、图标，以及 `useAppState`（选中 / 聚焦 /
  搜索 / 图层）与 `graphToCyElements`。
- **`GraphRoot`**：画布视觉的作用域根。必须包在画布与详情面板外层，并传入 `theme`。
- **自带样式 `./styles.css`**：Tailwind 在包内编译，产物整体收进 `.atlas-graph-root` 作用域
  （选择器 + 设计令牌都加前缀），宿主不需要安装 Tailwind，也不会被 `.hidden` / `--font-mono`
  这类全局名字污染。
- `Theme` 类型（`'light' | 'dark'`），画布不再依赖宿主主题 hook。

### Changed

- 依赖：`react` / `react-dom` / `cytoscape` 为 peer（`^19` / `^19` / `^3.30`），
  `cytoscape-cose-bilkent` / `cytoscape-dagre` 为直接依赖。
- `wist-atlas-web` 删除本地画布组件（约 2700 行），改为从 `./ui` 引入；像素级比对与迁移前一致。

## [0.1.0] - 2026-11-07

### Added

- 从 `wist-atlas-web` 抽出**图谱内核**：领域类型（`types/domain`）、版式算法
  （`focus-layout`：聚焦剖面 / 运行时网格 / 服务焦点图）、图元素构建（`graph-to-cy`）、
  状态与健康口径（`status`、`telemetry`）、搜索索引（`search`）、展示格式化（`format`、`presentation`、`colors`）。
- `buildDisplayGraph`：从 `App.tsx` 抽出的画布装配规则（TopN、溢出节点、单进程折叠、
  容器与服务实例从属），以及 `PROCESS_*` / `SERVICE_*` 前缀常量与 `getProcessViewMode`。
- `createAtlasClient({ baseUrl, headers, fetchImpl })`：API 前缀与令牌改为宿主注入；
  不传参时保持迁移前行为（页面 base + 同源 `sessionStorage` 令牌）。
- 9 条单测：版式网格列数、服务节点使运行时版式退回兜底（记录现状）、聚焦版式左右关系、
  服务 TopN 与溢出节点、单进程折叠、展开前后分组数量、客户端前缀/头/错误信封/路径参数。
