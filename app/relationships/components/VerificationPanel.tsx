'use client';

import { useState } from 'react';

interface GraphEdge {
  sourceTableId: number;
  targetTableId: number;
  sourceColumn: string;
  targetColumn: string;
  confidence: number;
  type: 'explicit' | 'inferred' | 'verified';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface VerificationPanelProps {
  selectedEdge?: GraphEdge | null;
  onVerified?: () => void;
}

export default function VerificationPanel({
  selectedEdge,
  onVerified,
}: VerificationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 如果没有选择推断关系或已验证关系,不显示验证面板
  if (!selectedEdge || (selectedEdge.type !== 'inferred' && selectedEdge.type !== 'verified')) {
    return null;
  }

  // 已验证的关系显示验证状态
  if (selectedEdge.type === 'verified') {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-success">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            已验证关系
          </h2>
          <p className="text-sm text-base-content/60">
            此关系已被验证为正确的推断关系
          </p>
        </div>
      </div>
    );
  }

  // 验证关系
  const handleVerify = async () => {
    try {
      setLoading(true);
      setError(null);

      // 从边的源表和目标表 ID 构造关系查询
      // 注意：这里需要后端 API 支持通过 sourceTableId 和 targetTableId 查询
      // 暂时使用一个占位方案，实际需要后端返回 relationshipId
      const relationshipId = 0; // TODO: 需要后端返回真实的 relationshipId

      const response = await fetch('/api/relationships/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relationshipId,
          verified: true,
          verifiedBy: 'user',
          action: 'verify',
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('关系验证成功!');
        if (onVerified) {
          onVerified();
        }
      } else {
        throw new Error(result.message || '验证失败');
      }
    } catch (err) {
      console.error('Error verifying relationship:', err);
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setLoading(false);
    }
  };

  // 拒绝关系
  const handleReject = async () => {
    if (!confirm('确定要拒绝此推断关系吗?此操作将删除该关系。')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 从边的源表和目标表 ID 构造关系查询
      const relationshipId = 0; // TODO: 需要后端返回真实的 relationshipId

      const response = await fetch('/api/relationships/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relationshipId,
          verified: false,
          action: 'reject',
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('关系已拒绝并删除');
        if (onVerified) {
          onVerified();
        }
      } else {
        throw new Error(result.message || '拒绝失败');
      }
    } catch (err) {
      console.error('Error rejecting relationship:', err);
      setError(err instanceof Error ? err.message : '拒绝失败');
    } finally {
      setLoading(false);
    }
  };

  // 转换为显式关系
  const handleConvertToExplicit = async () => {
    if (
      !confirm(
        '确定要将此推断关系转换为显式关系吗?这将在数据库中创建一个外键约束。'
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 从边的源表和目标表 ID 构造关系查询
      const relationshipId = 0; // TODO: 需要后端返回真实的 relationshipId

      const response = await fetch('/api/relationships/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relationshipId,
          verified: true,
          verifiedBy: 'user',
          action: 'convert',
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('关系已转换为显式关系!');
        if (onVerified) {
          onVerified();
        }
      } else {
        throw new Error(result.message || '转换失败');
      }
    } catch (err) {
      console.error('Error converting relationship:', err);
      setError(err instanceof Error ? err.message : '转换失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">验证推断关系</h2>

        {error && (
          <div className="alert alert-error mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <p className="text-sm text-base-content/60">
            此关系是由 AI 推断得出的,置信度为{' '}
            <span className="font-bold text-primary">
              {(selectedEdge.confidence * 100).toFixed(0)}%
            </span>
            。请确认此关系是否正确。
          </p>

          <div className="divider"></div>

          {/* 操作按钮 */}
          <div className="space-y-2">
            {/* 验证按钮 */}
            <button
              className={`btn btn-success btn-block ${loading ? 'loading' : ''}`}
              onClick={handleVerify}
              disabled={loading}
            >
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              验证关系 (标记为正确)
            </button>

            {/* 转换为显式关系按钮 */}
            <button
              className={`btn btn-warning btn-block ${loading ? 'loading' : ''}`}
              onClick={handleConvertToExplicit}
              disabled={loading}
            >
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
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
              转换为显式关系 (创建外键)
            </button>

            {/* 拒绝按钮 */}
            <button
              className={`btn btn-error btn-outline btn-block ${loading ? 'loading' : ''}`}
              onClick={handleReject}
              disabled={loading}
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              拒绝关系 (删除)
            </button>
          </div>

          {/* 说明 */}
          <div className="alert alert-info">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-xs">
              <p>
                <strong>验证关系:</strong> 将关系标记为已验证,保留为推断关系
              </p>
              <p>
                <strong>转换为显式关系:</strong> 在元数据中创建显式外键约束
              </p>
              <p>
                <strong>拒绝关系:</strong> 删除此推断关系
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
