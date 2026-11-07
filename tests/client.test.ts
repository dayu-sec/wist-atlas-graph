import assert from 'node:assert/strict';
import test from 'node:test';
import { createAtlasClient } from '../src/index';

test('客户端：baseUrl 与 headers 由宿主注入，不读页面全局', async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const client = createAtlasClient({
    baseUrl: '/api/atlas/',
    headers: () => ({ Authorization: 'Bearer test-token' }),
    fetchImpl: async (input, init) => {
      seen.push({
        url: String(input),
        headers: (init?.headers as Record<string, string>) ?? {},
      });
      return new Response(JSON.stringify({ status: 'ok', data: { hosts: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await client.fetchHosts();

  assert.equal(result.status, 'ok');
  assert.equal(seen.length, 1);
  assert.equal(new URL(seen[0].url).pathname, '/api/atlas/hosts');
  assert.equal(seen[0].headers.Authorization, 'Bearer test-token');
});

test('客户端：非 2xx 折成 api 错误信封，不抛异常', async () => {
  const client = createAtlasClient({
    baseUrl: '/api',
    fetchImpl: async () =>
      new Response('nope', { status: 403, statusText: 'Forbidden' }),
  });

  const result = await client.fetchHostProcessTopology('host-1');

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.equal(result.code, '403');
    assert.equal(result.message, 'Forbidden');
  }
});

test('客户端：路径参数按契约拼接', async () => {
  const urls: string[] = [];
  const client = createAtlasClient({
    baseUrl: '/api',
    fetchImpl: async (input) => {
      urls.push(new URL(String(input)).pathname + new URL(String(input)).search);
      return new Response(JSON.stringify({ status: 'ok', data: {} }), { status: 200 });
    },
  });

  await client.fetchHostProcessOverview('uuid-1', 12);
  await client.fetchHostProcessGroupsPage('uuid-1', 20, 40);

  assert.deepEqual(urls, [
    '/api/topology/host/uuid-1/process-overview?top_n=12',
    '/api/topology/host/uuid-1/process-groups?limit=20&offset=40',
  ]);
});
