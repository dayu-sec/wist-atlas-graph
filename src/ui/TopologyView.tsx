import type { AtlasClient } from '../api/client';
import type { Theme } from '../types/theme';
import { useTopologyView } from '../view/useTopologyView';
import TopologyCanvasView from './TopologyCanvasView';

type Props = {
  client: AtlasClient;
  hostId?: string;
  theme: Theme;
  demo?: boolean;
  fixture?: string;
  className?: string;
};

/**
 * 一行接入：自己取数、自己管选中/聚焦/搜索，渲染出来就是一张可交互的拓扑。
 * 需要顶栏、左栏或自己的主机选择器时，改用 `useTopologyView()` + `TopologyCanvasView`。
 */
export default function TopologyView({
  client,
  hostId = '',
  theme,
  demo = false,
  fixture,
  className,
}: Props) {
  const view = useTopologyView({ client, initialHostId: hostId, demo, fixture });
  return <TopologyCanvasView view={view} theme={theme} className={className} />;
}
