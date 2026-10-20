'use client';

export interface ScheduleValue {
  schedule: 'none' | 'daily' | 'weekly';
  runAtHour: number;
  runOnWeekday: number;
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/**
 * 刷新计划：不自动 / 每天 / 每周某天的整点
 */
export default function ScheduleFields({ value, onChange }: { value: ScheduleValue; onChange: (value: ScheduleValue) => void }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select
        className="select select-bordered select-sm w-full sm:w-auto"
        value={value.schedule}
        onChange={(e) => onChange({ ...value, schedule: e.target.value as ScheduleValue['schedule'] })}
        aria-label="刷新频率"
      >
        <option value="none">不自动刷新</option>
        <option value="daily">每天</option>
        <option value="weekly">每周</option>
      </select>
      {value.schedule === 'weekly' && (
        <select
          className="select select-bordered select-sm w-full sm:w-auto"
          value={value.runOnWeekday}
          onChange={(e) => onChange({ ...value, runOnWeekday: Number(e.target.value) })}
          aria-label="星期"
        >
          {WEEKDAYS.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
      )}
      {value.schedule !== 'none' && (
        <select
          className="select select-bordered select-sm w-full sm:w-auto"
          value={value.runAtHour}
          onChange={(e) => onChange({ ...value, runAtHour: Number(e.target.value) })}
          aria-label="时间"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
