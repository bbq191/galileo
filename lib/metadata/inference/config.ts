/**
 * 业务域推断配置
 *
 * 职责：管理业务域推断的环境变量配置
 */

/**
 * 业务域推断配置
 */
export const domainInferenceConfig = {
  /**
   * 是否启用 AI 推理（默认启用）
   * 环境变量：ENABLE_DOMAIN_AI_INFERENCE
   */
  enableAI: process.env.ENABLE_DOMAIN_AI_INFERENCE !== 'false',

  /**
   * 置信度阈值（默认 0.7）
   * 低于此阈值的推断结果需要人工确认
   * 环境变量：DOMAIN_INFERENCE_CONFIDENCE_THRESHOLD
   */
  confidenceThreshold: parseFloat(
    process.env.DOMAIN_INFERENCE_CONFIDENCE_THRESHOLD || '0.7'
  ),

  /**
   * 自动应用推断结果的置信度阈值（默认 0.8）
   * 高于此阈值的推断结果可以自动应用
   * 环境变量：DOMAIN_INFERENCE_AUTO_APPLY_THRESHOLD
   */
  autoApplyThreshold: parseFloat(
    process.env.DOMAIN_INFERENCE_AUTO_APPLY_THRESHOLD || '0.8'
  ),

  /**
   * 批量推断的并发数（默认 5）
   * 环境变量：DOMAIN_INFERENCE_CONCURRENCY
   */
  concurrency: parseInt(
    process.env.DOMAIN_INFERENCE_CONCURRENCY || '5',
    10
  ),

  /**
   * 推断结果缓存时间（秒，默认 3600 = 1小时）
   * 环境变量：DOMAIN_INFERENCE_CACHE_TTL
   */
  cacheTTL: parseInt(
    process.env.DOMAIN_INFERENCE_CACHE_TTL || '3600',
    10
  ),

  /**
   * 是否启用向量相似度策略（默认启用）
   * 环境变量：ENABLE_DOMAIN_VECTOR_STRATEGY
   */
  enableVectorStrategy: process.env.ENABLE_DOMAIN_VECTOR_STRATEGY !== 'false',

  /**
   * 命名规则策略权重（默认 0.4）
   * 环境变量：DOMAIN_INFERENCE_NAMING_WEIGHT
   */
  namingWeight: parseFloat(
    process.env.DOMAIN_INFERENCE_NAMING_WEIGHT || '0.4'
  ),

  /**
   * 向量相似度策略权重（默认 0.3）
   * 环境变量：DOMAIN_INFERENCE_VECTOR_WEIGHT
   */
  vectorWeight: parseFloat(
    process.env.DOMAIN_INFERENCE_VECTOR_WEIGHT || '0.3'
  ),

  /**
   * AI 推理策略权重（默认 0.3）
   * 环境变量：DOMAIN_INFERENCE_AI_WEIGHT
   */
  aiWeight: parseFloat(
    process.env.DOMAIN_INFERENCE_AI_WEIGHT || '0.3'
  ),
};

/**
 * 验证配置有效性
 */
export function validateDomainInferenceConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 验证置信度阈值范围
  if (
    domainInferenceConfig.confidenceThreshold < 0 ||
    domainInferenceConfig.confidenceThreshold > 1
  ) {
    errors.push('confidenceThreshold 必须在 0-1 之间');
  }

  if (
    domainInferenceConfig.autoApplyThreshold < 0 ||
    domainInferenceConfig.autoApplyThreshold > 1
  ) {
    errors.push('autoApplyThreshold 必须在 0-1 之间');
  }

  // 验证并发数
  if (
    domainInferenceConfig.concurrency < 1 ||
    domainInferenceConfig.concurrency > 100
  ) {
    errors.push('concurrency 必须在 1-100 之间');
  }

  // 验证缓存时间
  if (domainInferenceConfig.cacheTTL < 0) {
    errors.push('cacheTTL 必须大于等于 0');
  }

  // 验证权重总和
  const totalWeight =
    domainInferenceConfig.namingWeight +
    domainInferenceConfig.vectorWeight +
    domainInferenceConfig.aiWeight;

  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push(
      `策略权重总和必须为 1.0，当前为 ${totalWeight.toFixed(2)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// 启动时验证配置
const validation = validateDomainInferenceConfig();
if (!validation.valid) {
  console.warn('[DomainInference] 配置验证失败:');
  validation.errors.forEach(error => console.warn(`  - ${error}`));
  console.warn('[DomainInference] 将使用默认配置');
}
