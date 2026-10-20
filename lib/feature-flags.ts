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
  /** 将业务规则（术语、过滤条件、聚合规则、查询模板）注入 SQL 生成 Prompt，仅作用于 SQLGenerator */
  businessRules: 'ENABLE_BUSINESS_RULES',
  /** 使用管理员采纳的已验证查询：相同问题直接执行，相似问题作为示例注入 Prompt（仅作用于 SQLGenerator） */
  verifiedQueries: 'ENABLE_VERIFIED_QUERIES',
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

/**
 * SQL 校验模式（SQL_VALIDATOR_MODE）
 *
 * - off：不执行 SQLValidator（仅保留 SQLGenerator 内置的基础校验）
 * - shadow（默认）：执行校验并记录日志，不拦截查询，用于评估误拦截率
 * - enforce：校验不通过时拒绝执行
 */
export type SqlValidatorMode = 'off' | 'shadow' | 'enforce';

export function getSqlValidatorMode(): SqlValidatorMode {
  const mode = process.env.SQL_VALIDATOR_MODE;
  return mode === 'off' || mode === 'enforce' ? mode : 'shadow';
}
