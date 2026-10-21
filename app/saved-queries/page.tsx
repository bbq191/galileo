'use client';

import Link from 'next/link';
import { useState } from 'react';
import ResultTable from '@/components/query/ResultTable';
import ScheduleFields, { type ScheduleValue } from '@/components/saved-queries/ScheduleFields';
import { apiFetch } from '@/lib/client/api-fetch';
import { useAsyncData } from '@/lib/client/use-async-data';
import { describeSchedule } from '@/lib/saved-queries/schedule';

interface SavedQueryItem {
  id: number;
  title: string;
  question: string;
  sql: string;
  tables: string[];
  schedule: ScheduleValue['schedule'];
  runAtHour: number;
  runOnWeekday: number;
  nextRunAt: string | null;
  status: 'active' | 'paused' | 'needs_review';
  statusReason: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  unreadRuns: number;
}

interface RunSummary {
  id: string;
  trigger: 'manual' | 'schedule';
  status: 'success' | 'failed' | 'skipped';
  rowCount: number | null;
  durationMs: number | null;
  error: string | null;
  readAt: string | null;
  startedAt: string;
}

interface Column {
  name: string;
  type: string;
}

/** 当前展示的结果：立即执行的完整结果，或某次执行保存的预览 */
interface ShownResult {
  savedQueryId: number;
  title: string;
  source: string;
  data: any[];
  columns: Column[];
  rowCount: number;
  warnings?: string[];
  error?: string;
}

const STATUS_BADGES: Record<SavedQueryItem['status'], { label: string; className: string }> = {
  active: { label: '正常', className: 'badge-success' },
  paused: { label: '已暂停', className: 'badge-ghost' },
  needs_review: { label: '需要确认', className: 'badge-warning' },
};

const RUN_STATUS: Record<RunSummary['status'], string> = { success: '成功', failed: '失败', skipped: '跳过' };

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

function SavedQueryCard({
  item,
  onChanged,
  onShow,
}: {
  item: SavedQueryItem;
  onChanged: () => void;
  onShow: (result: ShownResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    schedule: item.schedule,
    runAtHour: item.runAtHour,
    runOnWeekday: item.runOnWeekday,
  });
  const [showSql, setShowSql] = useState(false);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/saved-queries/${item.id}`, { method: 'PATCH', json: body });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      onChanged();
    } else {
      setError(res.error.message);
    }
  };

  const runNow = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch<any[]>(`/api/saved-queries/${item.id}/run`, { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      const metadata = res.meta.metadata as { columns?: Column[]; rowCount?: number } | undefined;
      onShow({
        savedQueryId: item.id,
        title: item.title,
        source: '刚刚执行',
        data: res.data,
        columns: metadata?.columns ?? [],
        rowCount: metadata?.rowCount ?? res.data.length,
        warnings: res.meta.warnings as string[] | undefined,
      });
      onChanged();
    } else {
      setError(res.error.message);
    }
  };

  const toggleHistory = async () => {
    if (runs) {
      setRuns(null);
      return;
    }
    const res = await apiFetch<{ runs: RunSummary[] }>(`/api/saved-queries/${item.id}`);
    if (res.ok) {
      setRuns(res.data.runs);
      if (item.unreadRuns > 0) onChanged();
    } else {
      setError(res.error.message);
    }
  };

  const showRun = async (run: RunSummary) => {
    if (run.status !== 'success') {
      onShow({ savedQueryId: item.id, title: item.title, source: formatTime(run.startedAt), data: [], columns: [], rowCount: 0, error: run.error ?? '执行失败' });
      return;
    }
    const res = await apiFetch<{ columns: Column[]; resultPreview: any[]; rowCount: number }>(
      `/api/saved-queries/${item.id}/runs/${run.id}`
    );
    if (res.ok) {
      onShow({
        savedQueryId: item.id,
        title: item.title,
        source: `${formatTime(run.startedAt)}（${run.trigger === 'schedule' ? '定时' : '手动'}）`,
        data: res.data.resultPreview,
        columns: res.data.columns,
        rowCount: res.data.rowCount ?? res.data.resultPreview.length,
      });
    } else {
      setError(res.error.message);
    }
  };

  const remove = async () => {
    if (!window.confirm(`删除「${item.title}」？执行记录会一并删除。`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/saved-queries/${item.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) onChanged();
    else setError(res.error.message);
  };

  const badge = STATUS_BADGES[item.status];

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body p-4 md:p-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold break-words">{item.title}</h3>
          <span className={`badge badge-sm ${badge.className}`}>{badge.label}</span>
          {item.unreadRuns > 0 && <span className="badge badge-sm badge-primary">{item.unreadRuns} 条新结果</span>}
        </div>
        {item.question !== item.title && <div className="text-sm opacity-70 break-words">{item.question}</div>}
        <div className="text-xs opacity-60">
          {describeSchedule(item)}
          {item.schedule !== 'none' && item.status === 'active' && item.nextRunAt && <> · 下次 {formatTime(item.nextRunAt)}</>}
          {item.lastRunAt && (
            <> · 上次 {formatTime(item.lastRunAt)} {item.lastRunStatus === 'success' ? '成功' : '失败'}</>
          )}
        </div>
        {item.statusReason && <div className="text-xs text-warning break-words">{item.statusReason}</div>}

        {showSql && (
          <pre className="bg-base-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{item.sql}</pre>
        )}

        {editing && (
          <div className="space-y-2">
            <input className="input input-bordered input-sm w-full" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
            <ScheduleFields value={schedule} onChange={setSchedule} />
            <div className="flex gap-2 justify-end">
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>取消</button>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => patch({ title, ...schedule })}>保存</button>
            </div>
          </div>
        )}

        {runs && (
          <div className="overflow-x-auto">
            {runs.length === 0 ? (
              <div className="text-sm opacity-60">还没有执行记录</div>
            ) : (
              <table className="table table-xs">
                <thead>
                  <tr><th>时间</th><th>方式</th><th>结果</th><th>行数</th><th>耗时</th><th /></tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="whitespace-nowrap">{formatTime(run.startedAt)}</td>
                      <td>{run.trigger === 'schedule' ? '定时' : '手动'}</td>
                      <td className={run.status === 'success' ? '' : 'text-error'} title={run.error ?? undefined}>{RUN_STATUS[run.status]}</td>
                      <td>{run.rowCount ?? '-'}</td>
                      <td>{run.durationMs !== null ? `${run.durationMs}ms` : '-'}</td>
                      <td><button className="btn btn-xs btn-ghost" onClick={() => showRun(run)}>查看</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {error && <div className="text-sm text-error">{error}</div>}

        <div className="flex flex-wrap gap-2 justify-end">
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={runNow}>立即执行</button>
          <button className="btn btn-sm btn-ghost" onClick={toggleHistory}>{runs ? '收起记录' : '执行记录'}</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowSql(!showSql)}>{showSql ? '隐藏 SQL' : 'SQL'}</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(!editing)}>编辑</button>
          {item.status === 'active' && item.schedule !== 'none' && (
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => patch({ status: 'paused' })}>暂停</button>
          )}
          {item.status === 'paused' && (
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => patch({ status: 'active' })}>恢复</button>
          )}
          {item.status === 'needs_review' && (
            <button className="btn btn-sm btn-warning" disabled={busy} onClick={() => patch({ status: 'active' })} title="确认 SQL 在新的表结构下仍然正确">
              确认并恢复
            </button>
          )}
          <button className="btn btn-sm btn-ghost text-error" disabled={busy} onClick={remove}>删除</button>
        </div>
      </div>
    </div>
  );
}

/**
 * 我的查询：保存的查询与定时刷新结果
 */
export default function SavedQueriesPage() {
  const [shown, setShown] = useState<ShownResult | null>(null);

  const list = useAsyncData(async (signal) => {
    const res = await apiFetch<SavedQueryItem[]>('/api/saved-queries', { signal });
    if (!res.ok) throw res.error;
    return res.data;
  }, []);
  const items = list.data ?? [];
  const { error } = list;
  // 操作后刷新列表时保留现有内容，只在首次加载时显示加载状态
  const loading = list.loading && !list.data;

  return (
    <div className="space-y-4">
      <div className="text-sm opacity-70">
        保存的查询直接执行保存时的 SQL，不调用 AI。涉及的表结构变化后，定时刷新会暂停，确认 SQL 仍正确后再恢复。
      </div>

      {error && <div className="alert alert-error text-sm">{error}</div>}
      {loading && <div className="text-center py-8"><span className="loading loading-spinner" /></div>}
      {!loading && !error && items.length === 0 && (
        <div className="card bg-base-100 shadow">
          <div className="card-body text-center py-12 opacity-70">
            还没有保存的查询。在 <Link className="link" href="/query">自然语言查询</Link> 的结果下方点击「保存查询」。
          </div>
        </div>
      )}

      {shown && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold break-words">{shown.title}</h3>
            <span className="text-sm opacity-60">{shown.source} · {shown.rowCount} 行</span>
            <button className="btn btn-xs btn-ghost ml-auto" onClick={() => setShown(null)}>关闭</button>
          </div>
          {shown.warnings?.map((w) => <div key={w} className="alert alert-warning text-sm">{w}</div>)}
          {shown.error ? (
            <div className="alert alert-error text-sm">{shown.error}</div>
          ) : shown.data.length > 0 ? (
            <>
              {shown.data.length < shown.rowCount && (
                <div className="text-xs opacity-60">定时执行只保存前 {shown.data.length} 行预览，点击「立即执行」查看完整结果。</div>
              )}
              <ResultTable data={shown.data} columns={shown.columns} />
            </>
          ) : (
            <div className="text-sm opacity-60">没有返回数据</div>
          )}
        </div>
      )}

      {items.map((item) => (
        <SavedQueryCard key={item.id} item={item} onChanged={list.reload} onShow={setShown} />
      ))}
    </div>
  );
}
