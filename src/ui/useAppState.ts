import { useReducer } from 'react';
import type { AppState, AppAction } from '../index';

const initialLayerVisibility = {
  resource: true,
  governance: true,
} as const;

const initialState: AppState = {
  graph: null,
  hostTopology: null,
  loading: false,
  error: null,
  selectedNodeId: null,
  focusNodeId: null,
  layerVisibility: { ...initialLayerVisibility },
  searchQuery: '',
  processFilter: 'all',
  networkFilter: 'all',
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'FETCH_GRAPH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_GRAPH_SUCCESS':
      // 换了图：选中的节点不一定还在。在就留着（刷新同一张图不该丢掉高亮），
      // 不在就清掉 —— 否则会一直指着一个已不存在的 id（弹卡、快捷键都跟着错）。
      return {
        ...state,
        loading: false,
        graph: action.graph,
        focusNodeId: null,
        selectedNodeId:
          state.selectedNodeId && action.graph.nodes.some((node) => node.id === state.selectedNodeId)
            ? state.selectedNodeId
            : null,
      };
    case 'FETCH_HOST_TOPOLOGY_SUCCESS':
      return { ...state, hostTopology: action.hostTopology };
    case 'CLEAR_HOST_TOPOLOGY_UNLESS':
      // 同一台主机就保留：资产卡的请求与图的请求是并行的，谁先回来不确定。
      // 无条件清空会让「小图 + 快接口」时已经加载好的资产卡被后到的图请求抹掉。
      if (action.hostObjectId && state.hostTopology?.host.id === action.hostObjectId) {
        return state;
      }
      return { ...state, hostTopology: null };
    case 'FETCH_GRAPH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.nodeId };
    case 'FOCUS_NODE':
      return { ...state, focusNodeId: action.nodeId, selectedNodeId: action.nodeId };
    case 'CLEAR_FOCUS':
      return { ...state, focusNodeId: null };
    case 'TOGGLE_LAYER':
      return {
        ...state,
        layerVisibility: {
          ...state.layerVisibility,
          [action.layer]: !state.layerVisibility[action.layer],
        },
      };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };
    case 'SET_PROCESS_FILTER':
      return { ...state, processFilter: action.filter };
    case 'SET_NETWORK_FILTER':
      return { ...state, networkFilter: action.filter };
    default:
      return state;
  }
}

export function useAppState(initial: Partial<AppState> = {}) {
  return useReducer(reducer, { ...initialState, ...initial });
}
