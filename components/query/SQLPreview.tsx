'use client';

import { useState } from 'react';

interface SQLPreviewProps {
  sql: string;
  explanation?: string;
  editable?: boolean;
  onSQLChange?: (sql: string) => void;
}

/**
 * SQL 预览组件
 * 显示生成的 SQL，支持编辑、复制、格式化等功能
 */
export default function SQLPreview({
  sql,
  explanation,
  editable = false,
  onSQLChange,
}: SQLPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSQL, setEditedSQL] = useState(sql);
  const [copied, setCopied] = useState(false);

  // 复制 SQL
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy SQL:', err);
      alert('复制失败');
    }
  };

  // 保存编辑
  const handleSave = () => {
    if (onSQLChange) {
      onSQLChange(editedSQL);
    }
    setIsEditing(false);
  };

  // 取消编辑
  const handleCancel = () => {
    setEditedSQL(sql);
    setIsEditing(false);
  };

  if (!sql) {
    return null;
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title text-lg md:text-xl">生成的 SQL</h2>
          <div className="flex gap-2">
            {editable && !isEditing && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setIsEditing(true)}
                title="编辑 SQL"
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                编辑
              </button>
            )}
            <button
              className={`btn btn-sm ${copied ? 'btn-success' : 'btn-ghost'}`}
              onClick={handleCopy}
              title="复制 SQL"
            >
              {copied ? (
                <>
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  已复制
                </>
              ) : (
                <>
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  复制
                </>
              )}
            </button>
          </div>
        </div>

        {/* SQL 代码显示/编辑 */}
        {isEditing ? (
          <div className="form-control">
            <textarea
              className="textarea textarea-bordered font-mono text-sm w-full min-h-[200px] resize-y"
              value={editedSQL}
              onChange={(e) => setEditedSQL(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <button className="btn btn-sm btn-primary" onClick={handleSave}>
                保存
              </button>
              <button className="btn btn-sm btn-ghost" onClick={handleCancel}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="mockup-code bg-neutral text-neutral-content">
            <pre className="px-4 py-2">
              <code className="text-sm whitespace-pre-wrap break-words">
                {sql}
              </code>
            </pre>
          </div>
        )}

        {/* SQL 解释说明 */}
        {explanation && (
          <div className="alert bg-info/10 border-info/20 mt-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="stroke-info shrink-0 w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 className="font-bold text-sm">SQL 说明</h3>
              <div className="text-xs mt-1 opacity-80">{explanation}</div>
            </div>
          </div>
        )}

        {/* 操作提示 */}
        {editable && !isEditing && (
          <div className="text-xs text-base-content/60 mt-2">
            💡 提示：您可以编辑 SQL 语句后重新执行查询
          </div>
        )}
      </div>
    </div>
  );
}
