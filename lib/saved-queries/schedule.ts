/**
 * 保存的查询的刷新计划
 *
 * 只提供「每天 / 每周某天」的整点预设（服务器时区，部署时用 TZ 环境变量指定），
 * 不支持任意 cron 表达式。执行时间按查询 ID 在整点后的一小时内错开，
 * 避免同一整点的查询同时压到业务库；实际执行还取决于外部调度的频率（见 manual/operations.md 第 9 节）。
 */

import type { SavedQuerySchedule } from '@prisma/client';

export interface ScheduleSettings {
  schedule: SavedQuerySchedule;
  /** 0-23 */
  runAtHour: number;
  /** 1-7（周一至周日），仅 weekly */
  runOnWeekday: number;
}

/** 同一整点内的错开分钟数 */
export function spreadMinute(savedQueryId: number): number {
  return (savedQueryId * 7) % 60;
}

/**
 * 计算 from 之后（不含）的下一次执行时间；schedule 为 none 时返回 null
 */
export function computeNextRun(settings: ScheduleSettings, savedQueryId: number, from: Date = new Date()): Date | null {
  if (settings.schedule === 'none') return null;

  const next = new Date(from);
  next.setHours(settings.runAtHour, spreadMinute(savedQueryId), 0, 0);

  if (settings.schedule === 'daily') {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  // weekly：JS 的 getDay() 周日为 0，转换为 1-7
  const today = next.getDay() === 0 ? 7 : next.getDay();
  let days = (settings.runOnWeekday - today + 7) % 7;
  if (days === 0 && next <= from) days = 7;
  next.setDate(next.getDate() + days);
  return next;
}

const WEEKDAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function describeSchedule(settings: ScheduleSettings): string {
  const hour = `${String(settings.runAtHour).padStart(2, '0')}:00`;
  if (settings.schedule === 'daily') return `每天 ${hour}`;
  if (settings.schedule === 'weekly') return `每${WEEKDAYS[settings.runOnWeekday]} ${hour}`;
  return '不自动刷新';
}
