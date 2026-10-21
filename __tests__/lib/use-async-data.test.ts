/**
 * @jest-environment jsdom
 *
 * useAsyncData：加载状态推导、取消过期请求、重新加载
 */
import { describe, it, expect, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsyncData } from '@/lib/client/use-async-data';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useAsyncData', () => {
  it('首次渲染即为加载中，返回后给出数据', async () => {
    const { result } = renderHook(() => useAsyncData(async () => [1, 2], []));

    expect(result.current).toMatchObject({ loading: true, data: undefined, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2]);
  });

  it('参数变化：重新加载期间保留旧数据；较早的请求晚返回时不覆盖新结果', async () => {
    const requests = new Map<number, ReturnType<typeof deferred<string>>>();
    const load = jest.fn((page: number, signal: AbortSignal) => {
      const d = deferred<string>();
      requests.set(page, d);
      signal.addEventListener('abort', () => d.reject(new Error('aborted')));
      return d.promise;
    });
    const { result, rerender } = renderHook(({ page }) => useAsyncData((s) => load(page, s), [page]), {
      initialProps: { page: 1 },
    });

    await act(async () => requests.get(1)!.resolve('page-1'));
    expect(result.current).toMatchObject({ data: 'page-1', loading: false });

    rerender({ page: 2 });
    expect(result.current).toMatchObject({ data: 'page-1', loading: true });

    rerender({ page: 3 });
    await act(async () => requests.get(3)!.resolve('page-3'));
    await act(async () => requests.get(2)!.resolve('page-2'));

    expect(result.current).toMatchObject({ data: 'page-3', loading: false });
  });

  it('失败时给出错误并保留上一次的数据；reload 以相同参数重新请求', async () => {
    let calls = 0;
    const { result } = renderHook(() =>
      useAsyncData(async () => {
        calls++;
        if (calls === 2) throw new Error('服务不可用');
        return `ok-${calls}`;
      }, [])
    );
    await waitFor(() => expect(result.current.data).toBe('ok-1'));

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error).toBe('服务不可用'));
    expect(result.current.data).toBe('ok-1');

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('ok-3'));
    expect(result.current.error).toBeNull();
  });

  it('enabled=false：不请求，data 为 undefined 且不处于加载中', () => {
    const load = jest.fn(async () => 'x');
    const { result } = renderHook(() => useAsyncData(load, [null], { enabled: false }));

    expect(load).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ data: undefined, loading: false, error: null });
  });

  it('卸载后返回的请求不会更新状态', async () => {
    const d = deferred<string>();
    let aborted = false;
    const { unmount } = renderHook(() =>
      useAsyncData((signal) => {
        signal.addEventListener('abort', () => { aborted = true; });
        return d.promise;
      }, [])
    );
    unmount();
    expect(aborted).toBe(true);
    await act(async () => d.resolve('late'));
  });
});
