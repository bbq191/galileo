/**
 * 页面数据加载 Hook
 *
 * 替代「effect 中调用加载函数，加载函数先 setLoading(true) 再请求」的写法：
 * - 状态只在请求返回后更新，effect 中不同步调用 setState（react-hooks/set-state-in-effect）
 * - loading 由「当前参数」与「最近一次返回结果对应的参数」是否一致推导，不单独存状态
 * - 参数变化或组件卸载时取消旧请求，较早发出的请求晚返回时不会覆盖新结果
 *
 * 使用示例：
 * ```typescript
 * const logs = useAsyncData(async (signal) => {
 *   const res = await apiFetch<Log[]>(`/api/audit/logs?page=${page}`, { signal });
 *   if (!res.ok) throw res.error;
 *   return res.data;
 * }, [page]);
 *
 * logs.loading; logs.data ?? []; logs.error; logs.reload();
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncData<T> {
  /** 最近一次成功返回的数据；重新加载期间保留上一次的数据，避免列表闪烁 */
  data: T | undefined;
  /** 当前参数对应的请求失败信息 */
  error: string | null;
  /** 当前参数对应的请求尚未返回 */
  loading: boolean;
  /** 以相同参数重新加载（刷新按钮、增删改之后、定时刷新） */
  reload: () => void;
}

export interface AsyncDataOptions {
  /** 为 false 时不发请求，data 为 undefined（如尚未选择数据源）；默认 true */
  enabled?: boolean;
}

interface Settled<T> {
  key: string;
  data: T | undefined;
  error: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '加载失败';
}

/**
 * @param load 加载函数，失败时抛出异常（消息作为 error 展示）；signal 用于取消请求
 * @param deps 决定何时重新加载的参数，必须是可 JSON 序列化的原始值（数字、字符串、布尔、null 或其数组）
 */
export function useAsyncData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: AsyncDataOptions = {}
): AsyncData<T> {
  const enabled = options.enabled ?? true;
  const [reloadCount, setReloadCount] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const key = JSON.stringify([deps, reloadCount]);

  // 加载函数每次渲染都会重新创建，用 ref 读取最新版本，只由 key 决定何时请求
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ key, data, error: null });
      },
      (error) => {
        if (controller.signal.aborted) return;
        // 失败时保留上一次的数据，只更新错误
        setSettled((prev) => ({ key, data: prev?.data, error: errorMessage(error) }));
      }
    );
    return () => controller.abort();
  }, [key, enabled]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  if (!enabled) {
    return { data: undefined, error: null, loading: false, reload };
  }
  const current = settled?.key === key;
  return {
    data: settled?.data,
    error: current ? settled.error : null,
    loading: !current,
    reload,
  };
}
