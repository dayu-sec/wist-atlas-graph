# 更新日志

本文件记录 `@dayu-sec/wist-atlas-graph` 的所有重要变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

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
