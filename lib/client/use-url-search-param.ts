/**
 * 读取当前页面 URL 的查询参数
 *
 * 替代「effect 中读取 window.location.search 再 setState」的写法。服务端渲染与水合时返回 null，
 * 水合完成后返回实际值，不会产生水合不一致；不需要像 useSearchParams 那样包裹 Suspense。
 * 只反映页面加载时的 URL（本项目中这些参数用于从其他页面跳转时预选内容，页面内不会修改 URL）。
 */

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

export function useUrlSearchParam(name: string): string | null {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ''
  );
  return new URLSearchParams(search).get(name);
}
