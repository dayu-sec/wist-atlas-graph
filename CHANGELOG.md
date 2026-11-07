# 更新日志

本文件记录 `@dayu-sec/wist-atlas-graph` 的所有重要变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

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
