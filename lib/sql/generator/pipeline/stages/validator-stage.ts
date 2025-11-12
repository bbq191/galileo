/**
 * 验证阶段
 *
 * 职责：
 * - 验证 SQL 语法正确性
 * - 验证 SQL 安全性（SQL 注入、危险操作等）
 * - 验证元数据一致性（表和字段是否存在）
 * - 性能分析和建议
 *
 * 这是管道的最后一个阶段，确保生成的 SQL 可以安全执行
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { BasePipelineStage } from '../base-stage';
import { PipelineContext } from '../types';
import { SQLValidator } from '@/lib/sql/validator/sql-validator';
import { DI_TOKENS } from '@/lib/di/tokens';

@injectable()
export class Validator extends BasePipelineStage {
  readonly name = 'Validator';
  readonly description = '验证器 - 确保 SQL 正确性和安全性';
  readonly priority = 6;

  constructor(
    @inject(DI_TOKENS.SQLValidator) private readonly validator: SQLValidator
  ) {
    super();
  }

  /**
   * 执行 SQL 验证
   */
  protected async execute(context: PipelineContext): Promise<PipelineContext> {
    if (!context.result) {
      throw new Error('没有 SQL 结果需要验证');
    }

    const sql = context.result.sql;

    this.log(context, `验证 SQL：${sql.substring(0, 100)}...`, 'info');

    // 执行完整验证
    const validationResult = await this.validator.validate(sql, {
      checkSyntax: true,
      checkSecurity: true,
      checkPermissions: true,
      checkSemantics: true,
      performanceAnalysis: true,
      metadata: context.metadata
    });

    // 检查验证结果
    if (!validationResult.isValid) {
      const errors = validationResult.errors.join('; ');
      this.log(context, `SQL 验证失败：${errors}`, 'error');
      throw new Error(`SQL 验证失败: ${errors}`);
    }

    // 添加验证警告到结果
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      this.log(context, `SQL 验证警告：${validationResult.warnings.join(', ')}`, 'warn');

      context.result.warnings = [
        ...(context.result.warnings || []),
        ...validationResult.warnings
      ];
    }

    // 添加性能建议
    if (validationResult.performanceSuggestions && validationResult.performanceSuggestions.length > 0) {
      context.result.warnings = [
        ...(context.result.warnings || []),
        ...validationResult.performanceSuggestions.map(s => `性能建议: ${s}`)
      ];
    }

    this.log(context, 'SQL 验证通过', 'info');

    return context;
  }

  /**
   * 验证阶段是必须执行的
   */
  shouldExecute(context: PipelineContext): boolean {
    // 只有当有结果时才执行
    return !!context.result;
  }

  /**
   * 验证失败应该抛出错误
   */
  protected shouldThrowError(context: PipelineContext, error: unknown): boolean {
    return true;
  }
}
