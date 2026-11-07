import type {
  ApiResponse,
  HostListDto,
  HostProcessGroupsPageDto,
  HostProcessOverviewDto,
  HostProcessTopologyGraph,
  HostTopologyDto,
  ServiceListDto,
} from '../types/domain';

/**
 * 只读 API 客户端。
 *
 * 包里不写死「API 挂在哪个前缀」和「令牌从哪来」—— 这两件事属于宿主：
 * - `wist-atlas-web` 独立部署时，前缀跟随页面 base（`/api` 或 `/atlas/api`），
 *   令牌在 `sessionStorage['wist.console.token']`；
 * - `wist-field-web` 组件化接入后，前缀是 BFF 的 `/api/atlas`，令牌来自它自己的鉴权门。
 *
 * 所以默认值保持旧行为（不传 options 时与迁移前完全一致），需要别的口径就显式传。
 */
export type AtlasClientOptions = {
  /** API 前缀，例如 `/api`、`/atlas/api`、`/api/atlas`。默认跟随 `document.baseURI`。 */
  baseUrl?: string;
  /** 每次请求前取一次头（令牌可能中途变化）。 */
  headers?: () => Record<string, string>;
  /** 测试或特殊运行时可以换掉 fetch。 */
  fetchImpl?: typeof fetch;
};

export type AtlasClient = {
  fetchHostTopology: (hostId: string) => Promise<ApiResponse<HostTopologyDto>>;
  fetchFirstHostTopology: () => Promise<ApiResponse<HostTopologyDto>>;
  fetchHosts: () => Promise<ApiResponse<HostListDto>>;
  fetchServices: () => Promise<ApiResponse<ServiceListDto>>;
  fetchNetworkTopology: (networkId: string) => Promise<ApiResponse<HostProcessTopologyGraph>>;
  fetchServiceTopology: (serviceId: string) => Promise<ApiResponse<HostProcessTopologyGraph>>;
  fetchMockHostTopology: () => Promise<ApiResponse<HostProcessTopologyGraph>>;
  fetchHostProcessTopology: (hostId: string) => Promise<ApiResponse<HostProcessTopologyGraph>>;
  fetchFirstHostProcessTopology: () => Promise<ApiResponse<HostProcessTopologyGraph>>;
  fetchHostProcessOverview: (
    hostId: string,
    topN?: number,
  ) => Promise<ApiResponse<HostProcessOverviewDto>>;
  fetchHostProcessGroupsPage: (
    hostId: string,
    limit?: number,
    offset?: number,
  ) => Promise<ApiResponse<HostProcessGroupsPageDto>>;
};

/** 默认前缀：跟随页面 base。挂根时 `/api`，挂 `/atlas/` 下时 `/atlas/api`。 */
function defaultBaseUrl(): string {
  if (typeof document === 'undefined') return '/api';
  try {
    return new URL('api', document.baseURI).pathname.replace(/\/$/, '');
  } catch {
    return '/api';
  }
}

/** 默认令牌口径：嵌在同源宿主里时共用宿主的 sessionStorage 键。 */
function defaultHeaders(): Record<string, string> {
  try {
    const token = window.sessionStorage.getItem('wist.console.token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function createAtlasClient(options: AtlasClientOptions = {}): AtlasClient {
  const baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '');
  const headers = options.headers ?? defaultHeaders;
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  async function get<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    try {
      const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
      const url = new URL(`${baseUrl}${path}`, origin);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }
      const res = await doFetch(url.toString(), { headers: headers() });
      if (!res.ok) {
        return { status: 'error', code: String(res.status), message: res.statusText };
      }
      return res.json() as Promise<ApiResponse<T>>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'error', code: 'fetch_failed', message };
    }
  }

  return {
    fetchHostTopology: (hostId) => get<HostTopologyDto>(`/topology/host/${hostId}`),
    fetchFirstHostTopology: () => get<HostTopologyDto>('/topology/host/first'),
    fetchHosts: () => get<HostListDto>('/hosts'),
    fetchServices: () => get<ServiceListDto>('/services'),
    fetchNetworkTopology: (networkId) =>
      get<HostProcessTopologyGraph>(`/topology/network/${networkId}`),
    fetchServiceTopology: (serviceId) =>
      get<HostProcessTopologyGraph>(`/topology/service/${serviceId}`),
    fetchMockHostTopology: () => get<HostProcessTopologyGraph>('/__mock/topology/host'),
    fetchHostProcessTopology: (hostId) =>
      get<HostProcessTopologyGraph>(`/topology/host/${hostId}/processes`),
    fetchFirstHostProcessTopology: () =>
      get<HostProcessTopologyGraph>('/topology/host/first/processes'),
    fetchHostProcessOverview: (hostId, topN = 12) =>
      get<HostProcessOverviewDto>(`/topology/host/${hostId}/process-overview`, {
        top_n: String(topN),
      }),
    fetchHostProcessGroupsPage: (hostId, limit = 50, offset = 0) =>
      get<HostProcessGroupsPageDto>(`/topology/host/${hostId}/process-groups`, {
        limit: String(limit),
        offset: String(offset),
      }),
  };
}

/** 默认客户端：与迁移前的行为一致（页面 base + 宿主 sessionStorage 令牌）。 */
const defaultClient = createAtlasClient();

export const fetchHostTopology: AtlasClient['fetchHostTopology'] = (hostId) =>
  defaultClient.fetchHostTopology(hostId);
export const fetchFirstHostTopology: AtlasClient['fetchFirstHostTopology'] = () =>
  defaultClient.fetchFirstHostTopology();
export const fetchHosts: AtlasClient['fetchHosts'] = () => defaultClient.fetchHosts();
export const fetchServices: AtlasClient['fetchServices'] = () => defaultClient.fetchServices();
export const fetchNetworkTopology: AtlasClient['fetchNetworkTopology'] = (networkId) =>
  defaultClient.fetchNetworkTopology(networkId);
export const fetchServiceTopology: AtlasClient['fetchServiceTopology'] = (serviceId) =>
  defaultClient.fetchServiceTopology(serviceId);
export const fetchMockHostTopology: AtlasClient['fetchMockHostTopology'] = () =>
  defaultClient.fetchMockHostTopology();
export const fetchHostProcessTopology: AtlasClient['fetchHostProcessTopology'] = (hostId) =>
  defaultClient.fetchHostProcessTopology(hostId);
export const fetchFirstHostProcessTopology: AtlasClient['fetchFirstHostProcessTopology'] = () =>
  defaultClient.fetchFirstHostProcessTopology();
export const fetchHostProcessOverview: AtlasClient['fetchHostProcessOverview'] = (hostId, topN) =>
  defaultClient.fetchHostProcessOverview(hostId, topN);
export const fetchHostProcessGroupsPage: AtlasClient['fetchHostProcessGroupsPage'] = (
  hostId,
  limit,
  offset,
) => defaultClient.fetchHostProcessGroupsPage(hostId, limit, offset);

// Dev-only：静态 fixture 走页面根下的 `/fixtures/*.json`（不经过 BFF）。
export async function loadFixture(
  name: string,
): Promise<ApiResponse<HostProcessTopologyGraph>> {
  try {
    const res = await fetch(`/fixtures/${name}.json`);
    if (!res.ok) {
      return { status: 'error', code: String(res.status), message: res.statusText };
    }
    return res.json() as Promise<ApiResponse<HostProcessTopologyGraph>>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', code: 'fetch_failed', message };
  }
}
