'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api-fetch';
import { useAsyncData } from '@/lib/client/use-async-data';
import ScheduleFields, { type ScheduleValue } from './ScheduleFields';

interface SaveQueryPanelProps {
  /** 要保存的执行记录 */
  runId: string;
  /** 默认标题（原问题） */
  defaultTitle: string;
  /** 自然语言查询的结果：检查是否经常问同一个问题，提示保存 */
  checkRepeat?: boolean;
}

/**
 * 保存查询：保存最终执行的 SQL，可选定时刷新
 */
export default function SaveQueryPanel({ runId, defaultTitle, checkRepeat }: SaveQueryPanelProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle.slice(0, 100));
  const [schedule, setSchedule] = useState<ScheduleValue>({ schedule: 'none', runAtHour: 9, runOnWeekday: 1 });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 是否经常问这个问题（失败时不提示，不影响保存）
  const suggestion = useAsyncData(async (signal) => {
    const res = await apiFetch<{ suggest: boolean; count: number }>(
      `/api/saved-queries/suggestion?runId=${encodeURIComponent(runId)}`,
      { signal }
    );
    return res.ok && res.data.suggest ? res.data.count : 0;
  }, [runId], { enabled: !!checkRepeat });
  const repeatCount = suggestion.data ?? 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await apiFetch<{ id: number }>('/api/saved-queries', {
      method: 'POST',
      json: { runId, title: title.trim() || undefined, ...schedule },
    });
    setSaving(false);
    if (res.ok) {
      setSavedId(res.data.id);
      setOpen(false);
    } else {
      setError(res.error.message);
    }
  };

  if (savedId !== null) {
    return (
      <div className="alert alert-success text-sm">
        <span>
          已保存。之后可在 <Link className="link" href="/saved-queries">我的查询</Link> 中直接执行，不再调用 AI
          {schedule.schedule !== 'none' && '，并按计划自动刷新'}。
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {repeatCount > 0 && !open && (
        <div className="alert alert-info text-sm flex flex-col sm:flex-row">
          <span>最近 14 天你问过 {repeatCount} 次这个问题。保存后可以直接执行，还能每天或每周自动刷新。</span>
          <button className="btn btn-sm" onClick={() => setOpen(true)}>
            保存
          </button>
        </div>
      )}

      {!open && repeatCount === 0 && (
        <button className="btn btn-sm btn-outline" onClick={() => setOpen(true)}>
          保存查询
        </button>
      )}

      {open && (
        <div className="card bg-base-100 shadow">
          <div className="card-body p-4 space-y-2">
            <input
              className="input input-bordered input-sm w-full"
              placeholder="标题"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <ScheduleFields value={schedule} onChange={setSchedule} />
            {schedule.schedule !== 'none' && (
              <div className="text-xs opacity-60">在所选整点后一小时内执行，结果保存在「我的查询」中。</div>
            )}
            {error && <div className="text-sm text-error">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
