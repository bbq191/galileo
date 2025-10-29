'use client';

import { useState } from 'react';

interface ColumnMetadata {
  name: string;
  type: string;
  length?: number;
}

interface ResultTableProps {
  data: any[];
  columns: ColumnMetadata[];
  loading?: boolean;
}

/**
 * 查询结果表格组件
 * 显示查询结果数据，支持导出功能
 */
export default function ResultTable({
  data,
  columns,
  loading = false,
}: ResultTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // 计算分页
  const totalPages = Math.ceil(data.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentData = data.slice(startIndex, endIndex);

  // 导出为 CSV
  const handleExportCSV = () => {
    try {
      // 生成 CSV 内容
      const headers = columns.map(col => col.name).join(',');
      const rows = data.map(row =>
        columns.map(col => {
          const value = row[col.name];
          // 处理包含逗号、引号或换行符的值
          if (value === null || value === undefined) return '';
          const strValue = String(value);
          if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        }).join(',')
      );
      const csv = [headers, ...rows].join('\n');

      // 添加 BOM 以支持中文
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query_result_${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('导出失败');
    }
  };

  // 导出为 JSON
  const handleExportJSON = () => {
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query_result_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export JSON:', err);
      alert('导出失败');
    }
  };

  // 格式化值显示
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 md:p-6">
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 md:p-6">
          <div className="text-center py-12">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 mx-auto text-base-300 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="text-lg font-bold mb-2">暂无数据</h3>
            <p className="text-sm text-base-content/60">
              查询未返回任何结果
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="card-title text-lg md:text-xl">查询结果</h2>
            <p className="text-sm text-base-content/60 mt-1">
              共 {data.length} 条记录
              {totalPages > 1 && ` (第 ${currentPage}/${totalPages} 页)`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-sm btn-outline"
              onClick={handleExportCSV}
              title="导出为 CSV"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              CSV
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={handleExportJSON}
              title="导出为 JSON"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              JSON
            </button>
          </div>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm md:table-md w-full">
            <thead>
              <tr>
                <th className="bg-base-200">#</th>
                {columns.map((col, index) => (
                  <th key={index} className="bg-base-200">
                    <div className="flex flex-col">
                      <span>{col.name}</span>
                      <span className="text-xs font-normal opacity-60">
                        {col.type}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentData.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover">
                  <td className="font-mono text-xs">
                    {startIndex + rowIndex + 1}
                  </td>
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} className="max-w-xs">
                      <div className="truncate" title={formatValue(row[col.name])}>
                        {formatValue(row[col.name])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
            <div className="join">
              <button
                className="join-item btn btn-sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                «
              </button>
              <button className="join-item btn btn-sm">
                第 {currentPage} / {totalPages} 页
              </button>
              <button
                className="join-item btn btn-sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
