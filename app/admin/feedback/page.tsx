'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api-fetch';

interface FeedbackItem {
  id: number;
  runId: string;
  userId: string;
  rating: 'up' | 'down' | 'corrected';
  reason: 'wrong_table' | 'wrong_filter' | 'wrong_metric' | 'other' | null;
  comment: string | null;
  question: string;
  generatedSql: string;
  correctedSql: string | null;
  dataSourceIds: number[];
  status: 'pending' | 'accepted' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  verifiedQueryId: number | null;
  createdAt: string;
}

interface VerifiedItem {
  id: number;
  question: string;
  sql: string;
  dataSourceIds: number[];
  tables: string[];
  hitCount: number;
  lastHitAt: string | null;
  isActive: boolean;
  invalidReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

const RATING_LABELS: Record<FeedbackItem['rating'], { label: string; badge: string }> = {
  up: { label: '👍 正确', badge: 'badge-success' },
  down: { label: '👎 不对', badge: 'badge-error' },
  corrected: { label: '✏️ 已纠正', badge: 'badge-warning' },
};

const REASON_LABELS: Record<NonNullable<FeedbackItem['reason']>, string> = {
  wrong_table: '表选错了',
  wrong_filter: '条件不对',
  wrong_metric: '口径 / 计算方式不对',
  other: '其他',
};

const STATUS_LABELS: Record<FeedbackItem['status'], string> = {
  pending: '待审核',
  accepted: '已采纳',
  rejected: '已驳回',
};

const PAGE_SIZE = 20;

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;
  return (
    <div className="join justify-center w-full">
      <button className="join-item btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <button className="join-item btn btn-sm btn-disabled">
        {page} / {totalPages}
      </button>
      <button className="join-item btn btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页
      </button>
    </div>
  );
}

/**
 * 审核单条反馈：采纳时可修改问题与 SQL
 */
function FeedbackCard({ item, onReviewed }: { item: FeedbackItem; onReviewed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(item.question);
  const [sql, setSql] = useState(item.correctedSql ?? item.generatedSql);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (action: 'accept' | 'reject') => {
    setSubmitting(true);
    setError(null);
    const res = await apiFetch(`/api/admin/feedback/${item.id}`, {
      method: 'POST',
      json: action === 'accept' ? { action, question, sql } : { action },
    });
    setSubmitting(false);
    if (res.ok) {
      onReviewed();
    } else {
      setError(res.error.message);
    }
  };

  const rating = RATING_LABELS[item.rating];

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body p-4 md:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`badge ${rating.badge}`}>{rating.label}</span>
          {item.reason && <span className="badge badge-outline">{REASON_LABELS[item.reason]}</span>}
          <span className="badge badge-ghost">{STATUS_LABELS[item.status]}</span>
          <span className="opacity-60">
            用户 {item.userId} · {formatTime(item.createdAt)}
          </span>
        </div>

        <div className="font-medium break-words">{item.question || '（无问题文本）'}</div>
        {item.comment && <div className="text-sm opacity-80 break-words">说明：{item.comment}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <div className="text-xs opacity-60 mb-1">AI 生成的 SQL</div>
            <pre className="bg-base-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{item.generatedSql}</pre>
          </div>
          {item.correctedSql && (
            <div>
              <div className="text-xs opacity-60 mb-1">用户修改后的 SQL（已执行成功）</div>
              <pre className="bg-base-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{item.correctedSql}</pre>
            </div>
          )}
        </div>

        {item.status === 'pending' && editing && (
          <div className="space-y-2">
            <label className="form-control">
              <span className="label-text text-xs">问题（相同问题会直接执行下方 SQL）</span>
              <input className="input input-bordered input-sm" value={question} onChange={(e) => setQuestion(e.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs">已验证的 SQL</span>
              <textarea
                className="textarea textarea-bordered font-mono text-xs h-40"
                value={sql}
                onChange={(e) => setSql(e.target.value)}
              />
            </label>
          </div>
        )}

        {error && <div className="text-sm text-error">{error}</div>}

        {item.status === 'pending' ? (
          <div className="flex flex-wrap gap-2 justify-end">
            <button className="btn btn-sm btn-ghost" disabled={submitting} onClick={() => review('reject')}>
              驳回
            </button>
            {editing ? (
              <button className="btn btn-sm btn-primary" disabled={submitting} onClick={() => review('accept')}>
                确认采纳
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
                采纳为已验证查询
              </button>
            )}
          </div>
        ) : (
          <div className="text-xs opacity-60">
            {item.reviewedBy} 于 {formatTime(item.reviewedAt)} 审核
            {item.verifiedQueryId && <> · 已验证查询 #{item.verifiedQueryId}</>}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackTab() {
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected' | 'all'>('pending');
  const [rating, setRating] = useState<'' | FeedbackItem['rating']>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status, page: String(page), limit: String(PAGE_SIZE) });
    if (rating) params.set('rating', rating);
    const res = await apiFetch<FeedbackItem[]>(`/api/admin/feedback?${params}`);
    if (res.ok) {
      setItems(res.data);
      setTotal(Number(res.meta.total ?? 0));
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  }, [status, rating, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          className="select select-bordered select-sm w-full sm:w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="pending">待审核</option>
          <option value="accepted">已采纳</option>
          <option value="rejected">已驳回</option>
          <option value="all">全部</option>
        </select>
        <select
          className="select select-bordered select-sm w-full sm:w-auto"
          value={rating}
          onChange={(e) => {
            setRating(e.target.value as typeof rating);
            setPage(1);
          }}
        >
          <option value="">全部类型</option>
          <option value="corrected">已纠正（用户改过 SQL）</option>
          <option value="down">👎 不对</option>
          <option value="up">👍 正确</option>
        </select>
        <span className="text-sm opacity-60 self-center">共 {total} 条</span>
      </div>

      {error && <div className="alert alert-error text-sm">{error}</div>}
      {loading && <div className="text-center py-8"><span className="loading loading-spinner" /></div>}
      {!loading && !error && items.length === 0 && <div className="text-center py-8 opacity-60">暂无反馈</div>}

      {!loading && items.map((item) => <FeedbackCard key={item.id} item={item} onReviewed={load} />)}

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}

function VerifiedTab() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<VerifiedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<VerifiedItem[]>(`/api/admin/verified-queries?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      setItems(res.data);
      setTotal(Number(res.meta.total ?? 0));
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (item: VerifiedItem) => {
    setError(null);
    const res = await apiFetch(`/api/admin/verified-queries/${item.id}`, {
      method: 'PATCH',
      json: { isActive: !item.isActive },
    });
    if (res.ok) {
      load();
    } else {
      setError(res.error.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm opacity-70">
        设置 ENABLE_VERIFIED_QUERIES=true 后生效：完全相同的问题直接执行已验证的 SQL，相似问题作为示例参考。
        涉及的表结构变化后会自动停用，确认 SQL 仍正确后可重新启用。
      </div>

      {error && <div className="alert alert-error text-sm">{error}</div>}
      {loading && <div className="text-center py-8"><span className="loading loading-spinner" /></div>}
      {!loading && !error && items.length === 0 && <div className="text-center py-8 opacity-60">暂无已验证查询</div>}

      {!loading &&
        items.map((item) => (
          <div key={item.id} className={`card bg-base-100 shadow ${item.isActive ? '' : 'opacity-70'}`}>
            <div className="card-body p-4 md:p-6 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`badge ${item.isActive ? 'badge-success' : 'badge-ghost'}`}>
                  {item.isActive ? '启用' : '停用'}
                </span>
                <span className="opacity-60">
                  #{item.id} · 命中 {item.hitCount} 次 · {item.createdBy ?? '-'} 于 {formatTime(item.createdAt)} 采纳
                </span>
              </div>
              <div className="font-medium break-words">{item.question}</div>
              <pre className="bg-base-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{item.sql}</pre>
              <div className="text-xs opacity-60 break-words">涉及表：{item.tables.join('、') || '-'}</div>
              {item.invalidReason && <div className="text-xs text-warning break-words">停用原因：{item.invalidReason}</div>}
              <div className="flex justify-end">
                <button className="btn btn-sm btn-outline" onClick={() => toggle(item)}>
                  {item.isActive ? '停用' : '重新启用'}
                </button>
              </div>
            </div>
          </div>
        ))}

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}

/**
 * 查询反馈审核与已验证查询管理
 */
export default function FeedbackAdminPage() {
  const [tab, setTab] = useState<'feedback' | 'verified'>('feedback');

  return (
    <div className="space-y-4">
      <div role="tablist" className="tabs tabs-boxed w-fit">
        <button role="tab" className={`tab ${tab === 'feedback' ? 'tab-active' : ''}`} onClick={() => setTab('feedback')}>
          用户反馈
        </button>
        <button role="tab" className={`tab ${tab === 'verified' ? 'tab-active' : ''}`} onClick={() => setTab('verified')}>
          已验证查询
        </button>
      </div>
      {tab === 'feedback' ? <FeedbackTab /> : <VerifiedTab />}
    </div>
  );
}
