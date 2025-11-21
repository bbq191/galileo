'use client';

import QueryHistory from '@/components/query/QueryHistory';

/**
 * 查询历史页面
 * 显示用户的所有查询历史记录
 */
export default function QueryHistoryPage() {
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">查询历史</h1>
        <p className="text-sm opacity-60 mt-1">
          查看和管理您的所有查询记录
        </p>
      </div>

      {/* 查询历史组件 */}
      <QueryHistory limit={20} showPagination={true} />

      {/* 提示信息 */}
      <div className="alert alert-info">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="stroke-current shrink-0 w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h3 className="font-bold">关于查询历史</h3>
          <div className="text-sm">
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>系统会自动保存所有查询记录，包括成功和失败的查询</li>
              <li>查询历史默认保留 90 天，过期记录将被自动清理</li>
              <li>点击任意历史记录可以查看完整的查询详情和性能指标</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
