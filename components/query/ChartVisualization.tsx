'use client';

import { useState, useMemo } from 'react';

interface ColumnMetadata {
  name: string;
  type: string;
}

interface ChartVisualizationProps {
  data: any[];
  columns: ColumnMetadata[];
}

type ChartType = 'bar' | 'radial' | 'stats';

/**
 * 图表可视化组件
 * 使用 DaisyUI 内置组件展示数据
 */
export default function ChartVisualization({
  data,
  columns,
}: ChartVisualizationProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxis, setXAxis] = useState<string>('');
  const [yAxis, setYAxis] = useState<string>('');

  // 自动检测合适的列
  const { numericColumns, categoricalColumns } = useMemo(() => {
    const numeric: string[] = [];
    const categorical: string[] = [];

    columns.forEach((col) => {
      const type = col.type.toUpperCase(); // 统一转为大写便于比较

      // MySQL 数值类型（包括所有常见类型）
      const isNumeric =
        type.includes('INT') ||        // TINYINT, SMALLINT, INT, BIGINT
        type.includes('FLOAT') ||      // FLOAT
        type.includes('DOUBLE') ||     // DOUBLE
        type.includes('DECIMAL') ||    // DECIMAL, NUMERIC
        type.includes('NUMERIC') ||
        type === 'TINY' ||            // MySQL 类型代码 1
        type === 'SHORT' ||           // MySQL 类型代码 2
        type === 'LONG' ||            // MySQL 类型代码 3
        type === 'LONGLONG' ||        // MySQL 类型代码 8（COUNT(*) 的返回类型）
        type === 'INT24' ||           // MySQL 类型代码 9
        type === 'NEWDECIMAL';        // MySQL 类型代码 246

      if (isNumeric) {
        numeric.push(col.name);
      } else {
        categorical.push(col.name);
      }
    });

    return { numericColumns: numeric, categoricalColumns: categorical };
  }, [columns]);

  // 生效的坐标轴：用户选择的列在当前结果中不存在（如换了一次查询）时，自动使用第一个分类列 / 数值列。
  // 在渲染时推导而不是同步到 state，避免渲染期间 setState
  const selectedXAxis = xAxis && categoricalColumns.includes(xAxis) ? xAxis : categoricalColumns[0] ?? '';
  const selectedYAxis = yAxis && numericColumns.includes(yAxis) ? yAxis : numericColumns[0] ?? '';

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!selectedXAxis || !selectedYAxis || data.length === 0) return [];

    // 聚合数据
    const aggregated = new Map<string, number>();
    data.forEach((row) => {
      const key = String(row[selectedXAxis] || '未知');
      const value = Number(row[selectedYAxis]) || 0;
      aggregated.set(key, (aggregated.get(key) || 0) + value);
    });

    return Array.from(aggregated.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // 限制最多10个数据点
  }, [data, selectedXAxis, selectedYAxis]);

  // 计算统计数据
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;

    const values = chartData.map(d => d.value);
    const total = values.reduce((sum, v) => sum + v, 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = total / values.length;

    return { total, max, min, avg, count: chartData.length };
  }, [chartData]);

  const maxValue = Math.max(...chartData.map((d) => d.value), 1);
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  // 数据为空
  if (data.length === 0) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 md:p-6">
          <div className="text-center py-12">
            <p className="text-base-content/60">暂无数据可视化</p>
          </div>
        </div>
      </div>
    );
  }

  // 特殊情况：只有单一聚合值（没有分组维度）
  if (categoricalColumns.length === 0 && numericColumns.length > 0) {
    const firstRow = data[0];
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 md:p-6">
          <h2 className="card-title text-lg md:text-xl mb-4">统计结果</h2>
          <div className="alert alert-info mb-4">
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
            <span>查询返回单一聚合值，无法生成分组图表。如需可视化，请使用&ldquo;按XX统计&rdquo;或&ldquo;每个XX&rdquo;等分组查询。</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {numericColumns.map((col) => (
              <div key={col} className="stat bg-base-200 rounded-lg">
                <div className="stat-figure text-primary">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    className="inline-block w-8 h-8 stroke-current"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div className="stat-title">{col}</div>
                <div className="stat-value text-primary">
                  {Number(firstRow[col]).toLocaleString()}
                </div>
                <div className="stat-desc">聚合结果</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4 md:p-6">
        <h2 className="card-title text-lg md:text-xl mb-4">数据可视化</h2>

        {/* 控制面板 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* 图表类型选择 */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">展示类型</span>
            </label>
            <div className="join w-full">
              <input
                className="join-item btn btn-sm flex-1"
                type="radio"
                name="chart-type"
                aria-label="柱状图"
                checked={chartType === 'bar'}
                onChange={() => setChartType('bar')}
              />
              <input
                className="join-item btn btn-sm flex-1"
                type="radio"
                name="chart-type"
                aria-label="环形图"
                checked={chartType === 'radial'}
                onChange={() => setChartType('radial')}
              />
              <input
                className="join-item btn btn-sm flex-1"
                type="radio"
                name="chart-type"
                aria-label="统计卡"
                checked={chartType === 'stats'}
                onChange={() => setChartType('stats')}
              />
            </div>
          </div>

          {/* X轴选择 */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">分类轴 (X)</span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedXAxis}
              onChange={(e) => setXAxis(e.target.value)}
            >
              {categoricalColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* Y轴选择 */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">数值轴 (Y)</span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedYAxis}
              onChange={(e) => setYAxis(e.target.value)}
            >
              {numericColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 图表渲染 */}
        {chartData.length === 0 ? (
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
            <span>请选择有效的分类轴和数值轴</span>
          </div>
        ) : (
          <>
            {/* 柱状图（使用 Progress 组件） */}
            {chartType === 'bar' && (
              <div className="space-y-4">
                {chartData.map((item, index) => {
                  const percentage = Math.round((item.value / maxValue) * 100);
                  const colors = ['progress-primary', 'progress-secondary', 'progress-accent', 'progress-info', 'progress-success', 'progress-warning'];
                  const color = colors[index % colors.length];

                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium truncate" title={item.label}>
                          {item.label}
                        </span>
                        <span className="font-bold">
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                      <progress
                        className={`progress ${color} w-full h-6`}
                        value={percentage}
                        max="100"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* 环形图（使用 Radial Progress 组件） */}
            {chartType === 'radial' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {chartData.map((item, index) => {
                  const percentage = Math.round((item.value / total) * 100);
                  const colors = ['text-primary', 'text-secondary', 'text-accent', 'text-info', 'text-success', 'text-warning'];
                  const color = colors[index % colors.length];

                  return (
                    <div key={index} className="flex flex-col items-center gap-2">
                      <div
                        className={`radial-progress ${color}`}
                        style={{ '--value': percentage, '--size': '6rem', '--thickness': '0.5rem' } as any}
                        role="progressbar"
                      >
                        {percentage}%
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-sm truncate max-w-[120px]" title={item.label}>
                          {item.label}
                        </div>
                        <div className="text-xs opacity-70">
                          {item.value.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 统计卡片（使用 Stats 组件） */}
            {chartType === 'stats' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {chartData.map((item, index) => (
                  <div key={index} className="stat bg-base-200 rounded-lg">
                    <div className="stat-figure text-primary">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        className="inline-block w-8 h-8 stroke-current"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <div className="stat-title truncate" title={item.label}>
                      {item.label}
                    </div>
                    <div className="stat-value text-primary">
                      {item.value.toLocaleString()}
                    </div>
                    <div className="stat-desc">
                      占比 {((item.value / total) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 汇总统计（使用 Stats 组件） */}
        {stats && (
          <div className="stats stats-vertical md:stats-horizontal shadow w-full mt-6">
            <div className="stat">
              <div className="stat-figure text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-8 h-8 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"
                  />
                </svg>
              </div>
              <div className="stat-title">数据点</div>
              <div className="stat-value text-primary">{stats.count}</div>
              <div className="stat-desc">总计数量</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-secondary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-8 h-8 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </div>
              <div className="stat-title">总和</div>
              <div className="stat-value text-secondary">
                {stats.total.toLocaleString()}
              </div>
              <div className="stat-desc">所有数值之和</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-accent">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-8 h-8 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <div className="stat-title">最大值</div>
              <div className="stat-value text-accent">
                {stats.max.toLocaleString()}
              </div>
              <div className="stat-desc">↗︎ 峰值数据</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-info">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-8 h-8 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="stat-title">平均值</div>
              <div className="stat-value text-info">
                {stats.avg.toFixed(2)}
              </div>
              <div className="stat-desc">数据均值</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
