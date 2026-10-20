import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { apiFetch, ApiError, formatApiError } from '@/lib/client/api-fetch';

const fetchMock = jest.fn<typeof fetch>();
global.fetch = fetchMock;

function respond(body: unknown, init: ResponseInit = {}) {
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), init)
  );
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('apiFetch - 成功信封', () => {
  it('解析 { status: "success", data }', async () => {
    respond({ status: 'success', data: [{ id: 1 }], total: 1 });

    const res = await apiFetch<{ id: number }[]>('/api/datasources');

    expect(res).toEqual({ ok: true, status: 200, data: [{ id: 1 }], meta: { total: 1 } });
  });

  it('解析 { success: true, data } 并保留 metadata 等附加字段', async () => {
    respond({ success: true, data: [{ a: 1 }], metadata: { rowCount: 1 }, warnings: [] });

    const res = await apiFetch('/api/query/execute');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual([{ a: 1 }]);
    expect(res.meta).toEqual({ metadata: { rowCount: 1 }, warnings: [] });
  });

  it('无 data 字段时以去掉信封后的响应体作为 data', async () => {
    respond({ success: true, sql: 'SELECT 1', explanation: 'x' });

    const res = await apiFetch('/api/query/preview');

    expect(res.ok && res.data).toEqual({ sql: 'SELECT 1', explanation: 'x' });
  });

  it('envelope: none 时整个响应体作为 data，并接受指定状态码', async () => {
    respond({ status: 'degraded', checks: {} }, { status: 503 });

    const res = await apiFetch('/api/health', { envelope: 'none', acceptStatuses: [503] });

    expect(res).toEqual({
      ok: true,
      status: 503,
      data: { status: 'degraded', checks: {} },
      meta: {},
    });
  });
});

describe('apiFetch - 错误形态', () => {
  it('{ success: false, error: string }', async () => {
    respond({ success: false, error: '未找到相关的数据表' }, { status: 404 });

    const res = await apiFetch('/api/query/execute');

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBeInstanceOf(ApiError);
    expect(res.error.kind).toBe('not_found');
    expect(res.error.message).toBe('未找到相关的数据表');
  });

  it('safeErrorResponse 的 { error: { message, code } }', async () => {
    respond(
      { success: false, error: { code: 'E123', message: '服务异常', category: 'database' } },
      { status: 500 }
    );

    const res = await apiFetch('/api/datasources');

    expect(!res.ok && res.error).toMatchObject({ kind: 'server', code: 'E123', message: '服务异常' });
  });

  it('{ status: "error", message, error } 以 message 为主、error 为详情', async () => {
    respond({ status: 'error', message: '同步失败', error: 'ECONNREFUSED' }, { status: 500 });

    const res = await apiFetch('/api/datasources/1/sync');

    expect(!res.ok && res.error).toMatchObject({ message: '同步失败', details: 'ECONNREFUSED' });
  });

  it('HTTP 200 但 success: false 仍视为失败', async () => {
    respond({ success: false, error: 'SQL 生成失败' });

    const res = await apiFetch('/api/query/preview');

    expect(!res.ok && res.error.message).toBe('SQL 生成失败');
  });

  it('validateOrRespond 的 { error, details }', async () => {
    respond({ error: '输入验证失败', details: { query: '查询内容不能为空' } }, { status: 400 });

    const res = await apiFetch('/api/query/execute');

    expect(!res.ok && res.error).toMatchObject({
      kind: 'validation',
      message: '输入验证失败',
      details: { query: '查询内容不能为空' },
    });
  });

  it('429 读取 Retry-After 头', async () => {
    respond(
      { error: '请求过于频繁，请稍后再试', message: '请在 30 秒后重试。', retryAfter: 30 },
      { status: 429, headers: { 'Retry-After': '42' } }
    );

    const res = await apiFetch('/api/query/execute');

    expect(!res.ok && res.error).toMatchObject({ kind: 'rate_limited', retryAfter: 42 });
  });

  it('403 无响应体时使用默认文案', async () => {
    respond(undefined, { status: 403 });

    const res = await apiFetch('/api/audit/stats');

    expect(!res.ok && res.error).toMatchObject({ kind: 'forbidden', message: '没有权限执行此操作' });
  });

  it('非 JSON 响应体', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));

    const res = await apiFetch('/api/health');

    expect(!res.ok && res.error.kind).toBe('server');
  });

  it('网络异常', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const res = await apiFetch('/api/health');

    expect(!res.ok && res.error).toMatchObject({ kind: 'network', status: 0 });
  });
});

describe('apiFetch - 请求构造', () => {
  it('json 选项自动序列化并设置 Content-Type', async () => {
    respond({ success: true, data: null });

    await apiFetch('/api/query/execute', { method: 'POST', json: { query: 'q' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"query":"q"}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });
});

describe('formatApiError', () => {
  it('字符串详情附加在摘要后', () => {
    const error = new ApiError({ kind: 'server', status: 500, message: '同步失败', details: 'ECONNREFUSED' });
    expect(formatApiError(error)).toBe('同步失败\n\n详细错误: ECONNREFUSED');
  });

  it('对象详情或无详情时只返回摘要', () => {
    expect(formatApiError(new ApiError({ kind: 'validation', status: 400, message: '输入验证失败', details: { a: 1 } }))).toBe('输入验证失败');
    expect(formatApiError(new ApiError({ kind: 'server', status: 500, message: '服务异常' }))).toBe('服务异常');
  });
});

describe('apiFetch - 401 自动续期', () => {
  const urls = () => fetchMock.mock.calls.map(([url]) => url);

  it('续期成功后重试原请求', async () => {
    respond({ success: false, error: '未登录' }, { status: 401 });
    respond({ success: true });
    respond({ success: true, data: [1] });

    const res = await apiFetch('/api/datasources');

    expect(res).toMatchObject({ ok: true, data: [1] });
    expect(urls()).toEqual(['/api/datasources', '/api/auth/refresh', '/api/datasources']);
  });

  it('续期失败时返回 401 错误', async () => {
    respond({ success: false, error: '未登录' }, { status: 401 });
    respond({ success: false }, { status: 401 });

    const res = await apiFetch('/api/datasources');

    expect(!res.ok && res.error.kind).toBe('unauthorized');
    expect(urls()).toEqual(['/api/datasources', '/api/auth/refresh']);
  });

  it('重试后仍为 401 时不再续期，避免死循环', async () => {
    respond({ success: false }, { status: 401 });
    respond({ success: true });
    respond({ success: false }, { status: 401 });

    const res = await apiFetch('/api/datasources');

    expect(res.ok).toBe(false);
    expect(urls()).toHaveLength(3);
  });

  it('并发的 401 共享同一次续期请求', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === '/api/auth/refresh') return new Response(JSON.stringify({ success: true }));
      const retried = fetchMock.mock.calls.filter(([u]) => u === url).length > 1;
      return retried
        ? new Response(JSON.stringify({ success: true, data: url }))
        : new Response(JSON.stringify({ success: false }), { status: 401 });
    });

    const [a, b] = await Promise.all([apiFetch('/api/a'), apiFetch('/api/b')]);

    expect(a.ok && b.ok).toBe(true);
    expect(urls().filter((u) => u === '/api/auth/refresh')).toHaveLength(1);
  });

  it('/api/auth/* 的 401 不触发续期', async () => {
    respond({ success: false, error: '用户名或密码错误' }, { status: 401 });

    const res = await apiFetch('/api/auth/login', { method: 'POST', json: {} });

    expect(!res.ok && res.error.message).toBe('用户名或密码错误');
    expect(urls()).toEqual(['/api/auth/login']);
  });
});
