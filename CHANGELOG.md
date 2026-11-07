# 更新日志

本文件记录 `@dayu-sec/wist-atlas-graph` 的所有重要变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

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
