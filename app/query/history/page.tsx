'use client';

import Link from 'next/link';
import QueryHistory from '@/components/query/QueryHistory';

/**
 * 查询历史页面
 * 显示用户的所有查询历史记录
 */
export default function QueryHistoryPage() {
  return (
    <div className="min-h-screen bg-base-200">
      {/* 页面头部 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1 min-w-0">
          <Link href="/" className="btn btn-ghost normal-case text-xl">
            Galileo
          </Link>
          <div className="breadcrumbs text-sm ml-2 md:ml-4 hidden sm:block">
            <ul>
              <li>
                <Link href="/">首页</Link>
              </li>
              <li>
                <Link href="/query">查询</Link>
              </li>
              <li>查询历史</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <Link href="/query" className="btn btn-primary btn-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="hidden sm:inline">新建查询</span>
            <span className="sm:hidden">新建</span>
          </Link>
          <Link href="/datasources" className="btn btn-outline btn-sm">
            <span className="hidden sm:inline">数据源</span>
            <span className="sm:hidden">数据源</span>
          </Link>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto p-4 md:p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">查询历史</h1>
          <p className="text-base-content/60">
            查看和管理您的所有查询记录，点击任意记录查看详情
          </p>
        </div>

        {/* 查询历史组件 */}
        <QueryHistory limit={20} showPagination={true} />

        {/* 提示信息 */}
        <div className="mt-6">
          <div className="alert alert-info shadow-lg">
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
                  <li>您可以使用筛选功能快速找到成功或失败的查询</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
