/**
 * 前端统一请求封装
 *
 * 职责：
 * - 抹平后端两种响应信封：`{ status: 'success' | 'error' }` 与 `{ success: boolean }`
 * - 将 401 / 403 / 429 / 网络异常等统一转换为 ApiError，避免页面静默失败
 * - 作为后续鉴权接入（凭证注入、401 跳转）的唯一切入点
 *
 * 使用示例：
 * ```typescript
 * const res = await apiFetch<DataSource[]>('/api/datasources');
 * if (res.ok) {
 *   setDataSources(res.data);
 * } else {
 *   setError(res.error.message);
 * }
 * ```
 */

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  /** 429 时建议的重试等待秒数 */
  readonly retryAfter?: number;

  constructor(init: {
    kind: ApiErrorKind;
    status: number;
    message: string;
    code?: string;
    details?: unknown;
    retryAfter?: number;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.retryAfter = init.retryAfter;
  }
}

/** 信封中除 success/status/data/error/message 之外的字段（如 metadata、pagination、total） */
export type ApiMeta = Record<string, unknown>;

export type ApiResult<T> =
  | { ok: true; status: number; data: T; meta: ApiMeta }
  | { ok: false; status: number; error: ApiError; body: unknown };

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** JSON 请求体，自动序列化并设置 Content-Type */
  json?: unknown;
  /** 原始请求体（与 json 二选一） */
  body?: BodyInit | null;
  /**
   * 信封解析模式：
   * - auto（默认）：识别 success / status 字段
   * - none：不解析信封，整个响应体作为 data（如 /api/health）
   */
  envelope?: 'auto' | 'none';
  /** 视为成功的额外 HTTP 状态码（如 /api/health 降级时返回 503 但响应体仍有效） */
  acceptStatuses?: number[];
}

const ENVELOPE_KEYS = new Set(['success', 'status', 'data', 'error', 'message']);

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  validation: '请求参数有误',
  unauthorized: '登录已失效，请重新登录',
  forbidden: '没有权限执行此操作',
  not_found: '请求的资源不存在',
  rate_limited: '请求过于频繁，请稍后再试',
  server: '服务器错误，请稍后重试',
  network: '网络异常，请检查网络连接',
  parse: '响应格式错误',
};

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'server';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 根据信封判断业务是否成功；无信封时返回 undefined，由 HTTP 状态码决定
 */
function envelopeSuccess(body: Record<string, unknown>): boolean | undefined {
  if (typeof body.success === 'boolean') return body.success;
  if (body.status === 'success') return true;
  if (body.status === 'error') return false;
  return undefined;
}

function extractMeta(body: Record<string, unknown>): ApiMeta {
  const meta: ApiMeta = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ENVELOPE_KEYS.has(key)) meta[key] = value;
  }
  return meta;
}

/**
 * 从各种错误响应形态中提取错误信息：
 * - { error: '...' }
 * - { error: { message, code, details } }（safeErrorResponse）
 * - { message: '...', error: '详细错误' }（数据源同步等）
 * - { error: '...', details: {...} }（validateOrRespond）
 */
function buildError(status: number, body: unknown, headers: Headers): ApiError {
  const kind = kindFromStatus(status);
  const record = isRecord(body) ? body : {};
  const errorObj = isRecord(record.error) ? record.error : undefined;
  const errorStr = typeof record.error === 'string' ? record.error : undefined;
  const messageStr = typeof record.message === 'string' ? record.message : undefined;

  const message =
    (typeof errorObj?.message === 'string' ? errorObj.message : undefined) ??
    messageStr ??
    errorStr ??
    DEFAULT_MESSAGES[kind];

  const details =
    errorObj?.details ??
    record.details ??
    (errorStr && errorStr !== message ? errorStr : undefined);

  const code =
    (typeof errorObj?.code === 'string' ? errorObj.code : undefined) ??
    (typeof record.errorId === 'string' ? record.errorId : undefined);

  let retryAfter: number | undefined;
  if (kind === 'rate_limited') {
    const header = Number(headers.get('Retry-After'));
    retryAfter = Number.isFinite(header) && header > 0
      ? header
      : typeof record.retryAfter === 'number' ? record.retryAfter : undefined;
  }

  return new ApiError({ kind, status, message, code, details, retryAfter });
}

export async function apiFetch<T = unknown>(
  input: string,
  options: ApiFetchOptions = {}
): Promise<ApiResult<T>> {
  const { json, envelope = 'auto', acceptStatuses = [], headers, ...init } = options;

  const requestHeaders = new Headers(headers);
  if (json !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    init.body = JSON.stringify(json);
  }

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers: requestHeaders });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: undefined,
      error: new ApiError({
        kind: 'network',
        status: 0,
        message: DEFAULT_MESSAGES.network,
        details: err instanceof Error ? err.message : err,
      }),
    };
  }

  const status = response.status;
  let body: unknown;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    return {
      ok: false,
      status,
      body: undefined,
      error: new ApiError({
        kind: response.ok ? 'parse' : kindFromStatus(status),
        status,
        message: response.ok ? DEFAULT_MESSAGES.parse : DEFAULT_MESSAGES[kindFromStatus(status)],
      }),
    };
  }

  const httpOk = response.ok || acceptStatuses.includes(status);

  if (envelope === 'none' || !isRecord(body)) {
    return httpOk
      ? { ok: true, status, data: body as T, meta: {} }
      : { ok: false, status, body, error: buildError(status, body, response.headers) };
  }

  const success = envelopeSuccess(body) ?? httpOk;
  if (!success || !httpOk) {
    return { ok: false, status, body, error: buildError(status, body, response.headers) };
  }

  // 有 data 字段时取 data，否则（如 /api/query/preview）整个响应体去掉信封字段后作为 data
  const data = ('data' in body ? body.data : extractMeta(body)) as T;
  return { ok: true, status, data, meta: extractMeta(body) };
}
