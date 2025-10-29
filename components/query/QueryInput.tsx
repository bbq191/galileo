'use client';

import { useState } from 'react';

interface QueryInputProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  onPreview?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * 查询输入组件
 * 提供自然语言查询输入界面
 */
export default function QueryInput({
  value,
  onChange,
  onExecute,
  onPreview,
  loading = false,
  disabled = false,
}: QueryInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter 执行查询
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!loading && !disabled && value.trim()) {
        onExecute();
      }
    }
  };

  const canSubmit = !loading && !disabled && value.trim().length > 0;

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title text-lg md:text-xl">自然语言查询</h2>
          {loading && (
            <span className="loading loading-spinner loading-sm text-primary"></span>
          )}
        </div>

        {/* 输入区域 */}
        <div className={`form-control ${isFocused ? 'ring-2 ring-primary ring-opacity-50 rounded-lg' : ''}`}>
          <label className="label">
            <span className="label-text">请输入您的查询</span>
            <span className="label-text-alt text-xs opacity-60">
              支持 Ctrl+Enter 快捷执行
            </span>
          </label>
          <textarea
            className="textarea textarea-bordered textarea-lg w-full min-h-[120px] text-base resize-y"
            placeholder="例如：查询最近一个月销售额TOP10的产品"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled || loading}
          />
          <label className="label">
            <span className="label-text-alt text-xs">
              💡 提示：尽量使用清晰、具体的描述，包含时间范围、筛选条件等信息
            </span>
            <span className="label-text-alt text-xs">
              {value.length} 字符
            </span>
          </label>
        </div>

        {/* 查询示例 */}
        <div className="collapse collapse-arrow bg-base-200 rounded-lg">
          <input type="checkbox" />
          <div className="collapse-title text-sm font-medium">
            查看查询示例
          </div>
          <div className="collapse-content">
            <div className="space-y-2">
              <div
                className="p-2 bg-base-100 rounded cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() => onChange('查询最近一个月销售额TOP10的产品')}
              >
                <p className="text-sm">查询最近一个月销售额TOP10的产品</p>
              </div>
              <div
                className="p-2 bg-base-100 rounded cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() => onChange('统计每个分类的订单数量')}
              >
                <p className="text-sm">统计每个分类的订单数量</p>
              </div>
              <div
                className="p-2 bg-base-100 rounded cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() => onChange('查询今年注册的用户总数')}
              >
                <p className="text-sm">查询今年注册的用户总数</p>
              </div>
              <div
                className="p-2 bg-base-100 rounded cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() => onChange('对比本月和上月的销售数据')}
              >
                <p className="text-sm">对比本月和上月的销售数据</p>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="card-actions justify-end mt-4 gap-2">
          {onPreview && (
            <button
              className="btn btn-outline btn-primary"
              onClick={onPreview}
              disabled={!canSubmit}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  预览中...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  预览SQL
                </>
              )}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={onExecute}
            disabled={!canSubmit}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                执行中...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                执行查询
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
