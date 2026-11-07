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
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'FETCH_GRAPH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_GRAPH_SUCCESS':
      return { ...state, loading: false, graph: action.graph, focusNodeId: null };
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
    default:
      return state;
  }
}

export function useAppState() {
  return useReducer(reducer, initialState);
}
