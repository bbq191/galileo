'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api-fetch';

type Reason = 'wrong_table' | 'wrong_filter' | 'wrong_metric' | 'other';

const REASONS: Array<{ value: Reason; label: string }> = [
  { value: 'wrong_table', label: '表选错了' },
  { value: 'wrong_filter', label: '条件不对' },
  { value: 'wrong_metric', label: '口径 / 计算方式不对' },
  { value: 'other', label: '其他' },
];

interface ResultFeedbackProps {
  /** /api/query/execute 返回的 runId */
  runId: string;
  /** 查询失败或没有返回数据时，主动询问结果是否符合预期 */
  prompt?: boolean;
}

/**
 * 结果反馈：点赞 / 点踩（附原因），提交后进入管理员审核队列
 *
 * 编辑 SQL 后执行成功会自动记为纠正，无需在这里提交。
 */
export default function ResultFeedback({ runId, prompt }: ResultFeedbackProps) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [reason, setReason] = useState<Reason>('wrong_filter');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'editing' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  // 新的查询结果重置反馈状态
  useEffect(() => {
    setRating(null);
    setComment('');
    setState('idle');
    setError(null);
  }, [runId]);

  const submit = async (value: 'up' | 'down') => {
    setState('sending');
    setError(null);
    const res = await apiFetch('/api/query/feedback', {
      method: 'POST',
      json: {
        runId,
        rating: value,
        ...(value === 'down' && { reason, comment: comment.trim() || undefined }),
      },
    });
    if (res.ok) {
      setRating(value);
      setState('sent');
    } else {
      setError(res.error.message);
      setState(value === 'down' ? 'editing' : 'idle');
    }
  };

  if (state === 'sent') {
    return (
      <div className="text-sm opacity-70">
        {rating === 'up' ? '感谢反馈。' : '已提交，管理员审核后会用于改进同类问题。'}
        你也可以直接编辑上方 SQL 并执行，修正后的 SQL 会一并提交审核。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="opacity-70">{prompt ? '结果不符合预期？' : '结果对吗？'}</span>
        <button
          className="btn btn-xs btn-ghost"
          disabled={state === 'sending'}
          onClick={() => submit('up')}
          aria-label="结果正确"
        >
          👍 正确
        </button>
        <button
          className={`btn btn-xs ${state === 'editing' ? 'btn-active' : 'btn-ghost'}`}
          disabled={state === 'sending'}
          onClick={() => setState(state === 'editing' ? 'idle' : 'editing')}
          aria-label="结果不对"
        >
          👎 不对
        </button>
      </div>

      {state === 'editing' && (
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="select select-bordered select-sm w-full sm:w-auto"
            value={reason}
            onChange={(e) => setReason(e.target.value as Reason)}
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            className="input input-bordered input-sm w-full sm:flex-1"
            placeholder="补充说明（可选），例如：应该只统计已支付订单"
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn btn-sm btn-primary" onClick={() => submit('down')}>
            提交
          </button>
        </div>
      )}

      {error && <div className="text-sm text-error">{error}</div>}
    </div>
  );
}
