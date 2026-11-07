# wist-atlas-graph

wist-atlas 的**图谱内核**。`wist-atlas-web`（独立部署）与 `wist-field-web`（数据场里的资产拓扑页）
共用这一份，避免「版式算法两处各写一遍、改一处要改两处」。

## 它是什么

- **领域类型**：`HostProcessTopologyGraph` / `HostProcessTopologyNode` / 各 DTO。
- **版式算法**（纯函数）：聚焦剖面（主机 + 一圈对象）、运行时网格（主机 → 运行时 → 分组）、
  服务焦点图（服务 → 实例 → 监听进程）。给固定图喂进去，出来的坐标可断言。
- **画布装配**：`buildDisplayGraph` —— TopN、溢出节点、单进程折叠、容器/服务实例从属。
  后端给的是完整事实（一台机器几百个进程），画布给的是有限视口，这层决定「先看什么」。
- **口径**：节点状态（`resolveNodeStatus`）、健康计数、搜索索引、遥测（示例数据）。
- **只读 API 客户端**：`createAtlasClient({ baseUrl, headers, fetchImpl })`，前缀与令牌由宿主注入。

## 它不是什么

不含 React、不含 DOM 组件、不含页面外壳、不含路由与登录门。顶栏、面包屑、左栏资产卡、
服务清单、状态栏仍在各自的 app 里 —— 那些绑的是「这个产品是谁」，不是「这张图怎么画」。

## 消费

```json
"dependencies": {
  "@dayu-sec/wist-atlas-graph": "github:dayu-sec/wist-atlas-graph#v0.1.0"
}
```

本地联调（还没推 tag 时）：

```bash
# wist-atlas-graph
npm install && npm run build && npm run build --watch   # 或每次改完手动 build

# 消费方
npm install ../wist-atlas-graph
```

`dist/` 不进仓，也不发 registry：`prepare` 在 git 安装时构建。本地 `file:` 安装不会跑
`prepare`，所以包这边改完必须手动 `npm run build`。

```ts
import { createAtlasClient, buildDisplayGraph, computeRuntimeLayout } from '@dayu-sec/wist-atlas-graph';

const client = createAtlasClient({ baseUrl: '/api/atlas', headers: () => bearer() });
```

## 开发

```bash
npm install
npm run build        # tsc → dist（含 .d.ts）
npm run check-types  # 连测试一起类型检查
npm test             # node --test（经 tsx 直接跑 .ts）
```

单测只覆盖纯逻辑：版式坐标、显示图装配、客户端契约。组件与视觉不在这一层测。
