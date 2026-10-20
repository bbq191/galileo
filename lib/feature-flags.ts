/**
 * 功能开关（仅服务端）
 *
 * 用于灰度上线主链路改造，所有开关默认关闭，需显式设置为 'true' 才启用。
 * 每次调用时读取环境变量，便于测试中切换。
 *
 * 使用示例：
 * ```typescript
 * if (isFeatureEnabled('sqlPipeline')) {
 *   // 走新逻辑
 * }
 * ```
 */

export const FEATURE_FLAGS = {
  /** 查询主链路使用 SQLGenerationPipeline 替代 SQLGenerator */
  sqlPipeline: 'ENABLE_SQL_PIPELINE',
  /** 按数据源分组执行跨数据源查询 */
  crossSourceExecution: 'ENABLE_CROSS_SOURCE_EXECUTION',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[FEATURE_FLAGS[flag]] === 'true';
}

/**
 * 获取所有开关状态（用于健康检查与诊断）
 */
export function getFeatureFlags(): Record<FeatureFlag, boolean> {
  return Object.fromEntries(
    (Object.keys(FEATURE_FLAGS) as FeatureFlag[]).map((flag) => [flag, isFeatureEnabled(flag)])
  ) as Record<FeatureFlag, boolean>;
}
