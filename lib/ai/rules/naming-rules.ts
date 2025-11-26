/**
 * 命名规则引擎
 *
 * 功能：
 * - 基于命名模式自动生成语义描述
 * - 覆盖70%的标准字段（免费，快速）
 * - 支持自定义规则和数据字典
 */

import { injectable, inject } from 'tsyringe';
import type { ColumnInfo } from '@/lib/metadata/types';
import { PrismaClient } from '@prisma/client';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 命名规则定义
 */
export interface NamingRule {
  /** 规则名称 */
  name: string;

  /** 匹配模式（正则表达式） */
  pattern: RegExp;

  /** 语义模板（支持变量替换） */
  semanticTemplate: string;

  /** 目标表名（用于外键推断） */
  targetTable?: string;

  /** 目标字段名 */
  targetColumn?: string;

  /** 置信度 (0.0-1.0) */
  confidence: number;

  /** 规则优先级（数字越小优先级越高） */
  priority?: number;
}

/**
 * 内置命名规则
 * 按优先级排序，从高到低
 */
export const BUILTIN_RULES: NamingRule[] = [
  // ========================================
  // 1. 外键模式（高优先级）
  // ========================================
  {
    name: 'foreign_key_pattern',
    pattern: /^(\w+)_id$/,
    semanticTemplate: '{table}的外键标识符',
    confidence: 0.90,
    priority: 1,
  },

  // ========================================
  // 2. 时间戳模式
  // ========================================
  {
    name: 'created_at',
    pattern: /^created_at$/i,
    semanticTemplate: '创建时间',
    confidence: 0.95,
    priority: 2,
  },
  {
    name: 'updated_at',
    pattern: /^updated_at$/i,
    semanticTemplate: '更新时间',
    confidence: 0.95,
    priority: 2,
  },
  {
    name: 'deleted_at',
    pattern: /^deleted_at$/i,
    semanticTemplate: '软删除时间',
    confidence: 0.95,
    priority: 2,
  },
  {
    name: 'published_at',
    pattern: /^published_at$/i,
    semanticTemplate: '发布时间',
    confidence: 0.90,
    priority: 2,
  },
  {
    name: 'expired_at',
    pattern: /^expired_at$/i,
    semanticTemplate: '过期时间',
    confidence: 0.90,
    priority: 2,
  },

  // ========================================
  // 3. 审计字段
  // ========================================
  {
    name: 'created_by',
    pattern: /^created_by$/i,
    semanticTemplate: '创建人ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.85,
    priority: 3,
  },
  {
    name: 'updated_by',
    pattern: /^updated_by$/i,
    semanticTemplate: '更新人ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.85,
    priority: 3,
  },
  {
    name: 'deleted_by',
    pattern: /^deleted_by$/i,
    semanticTemplate: '删除人ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.85,
    priority: 3,
  },

  // ========================================
  // 4. 布尔标识
  // ========================================
  {
    name: 'is_prefix',
    pattern: /^is_(\w+)$/,
    semanticTemplate: '是否{name}',
    confidence: 0.80,
    priority: 4,
  },
  {
    name: 'has_prefix',
    pattern: /^has_(\w+)$/,
    semanticTemplate: '是否拥有{name}',
    confidence: 0.80,
    priority: 4,
  },
  {
    name: 'enable_prefix',
    pattern: /^enable_(\w+)$/,
    semanticTemplate: '是否启用{name}',
    confidence: 0.80,
    priority: 4,
  },

  // ========================================
  // 5. 状态字段
  // ========================================
  {
    name: 'status',
    pattern: /^status$/i,
    semanticTemplate: '状态标识',
    confidence: 0.75,
    priority: 5,
  },
  {
    name: 'state',
    pattern: /^state$/i,
    semanticTemplate: '状态',
    confidence: 0.75,
    priority: 5,
  },
  {
    name: 'type',
    pattern: /^type$/i,
    semanticTemplate: '类型标识',
    confidence: 0.75,
    priority: 5,
  },
  {
    name: 'kind',
    pattern: /^kind$/i,
    semanticTemplate: '种类',
    confidence: 0.75,
    priority: 5,
  },

  // ========================================
  // 6. 计数/金额/价格
  // ========================================
  {
    name: 'count_suffix',
    pattern: /^(\w+)_count$/,
    semanticTemplate: '{name}的数量',
    confidence: 0.80,
    priority: 6,
  },
  {
    name: 'amount_suffix',
    pattern: /^(\w+)_amount$/,
    semanticTemplate: '{name}的金额',
    confidence: 0.80,
    priority: 6,
  },
  {
    name: 'price_suffix',
    pattern: /^(\w+)_price$/,
    semanticTemplate: '{name}的价格',
    confidence: 0.80,
    priority: 6,
  },
  {
    name: 'total_prefix',
    pattern: /^total_(\w+)$/,
    semanticTemplate: '总{name}',
    confidence: 0.75,
    priority: 6,
  },

  // ========================================
  // 7. 名称/标题/描述
  // ========================================
  {
    name: 'name',
    pattern: /^name$/i,
    semanticTemplate: '名称',
    confidence: 0.85,
    priority: 7,
  },
  {
    name: 'title',
    pattern: /^title$/i,
    semanticTemplate: '标题',
    confidence: 0.85,
    priority: 7,
  },
  {
    name: 'description',
    pattern: /^(desc|description)$/i,
    semanticTemplate: '描述信息',
    confidence: 0.85,
    priority: 7,
  },
  {
    name: 'content',
    pattern: /^content$/i,
    semanticTemplate: '内容',
    confidence: 0.80,
    priority: 7,
  },
  {
    name: 'remark',
    pattern: /^(remark|note|comment)$/i,
    semanticTemplate: '备注',
    confidence: 0.80,
    priority: 7,
  },

  // ========================================
  // 8. 编号/代码
  // ========================================
  {
    name: 'code',
    pattern: /^code$/i,
    semanticTemplate: '编码',
    confidence: 0.80,
    priority: 8,
  },
  {
    name: 'number',
    pattern: /^(no|num|number)$/i,
    semanticTemplate: '编号',
    confidence: 0.75,
    priority: 8,
  },
  {
    name: 'serial',
    pattern: /^serial(_number)?$/i,
    semanticTemplate: '序列号',
    confidence: 0.80,
    priority: 8,
  },

  // ========================================
  // 9. 联系方式
  // ========================================
  {
    name: 'email',
    pattern: /^(email|mail)$/i,
    semanticTemplate: '电子邮箱',
    confidence: 0.90,
    priority: 9,
  },
  {
    name: 'phone',
    pattern: /^(phone|mobile|tel)$/i,
    semanticTemplate: '电话号码',
    confidence: 0.90,
    priority: 9,
  },
  {
    name: 'address',
    pattern: /^address$/i,
    semanticTemplate: '地址',
    confidence: 0.85,
    priority: 9,
  },

  // ========================================
  // 10. 排序/优先级
  // ========================================
  {
    name: 'sort',
    pattern: /^(sort|order)$/i,
    semanticTemplate: '排序',
    confidence: 0.80,
    priority: 10,
  },
  {
    name: 'priority',
    pattern: /^priority$/i,
    semanticTemplate: '优先级',
    confidence: 0.85,
    priority: 10,
  },
  {
    name: 'weight',
    pattern: /^weight$/i,
    semanticTemplate: '权重',
    confidence: 0.80,
    priority: 10,
  },
];

/**
 * 规则引擎标注结果
 */
export interface RuleAnnotationResult {
  /** 语义描述 */
  semantic: string;

  /** 来源（固定为 'rule'） */
  source: 'rule';

  /** 置信度 */
  confidence: number;

  /** 匹配的规则名称 */
  ruleName: string;

  /** 目标表（如果是外键） */
  targetTable?: string;

  /** 目标字段 */
  targetColumn?: string;
}

/**
 * 基于规则的标注器
 */
@injectable()
export class RuleBasedAnnotator {
  private rules: NamingRule[];

  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient
  ) {
    // 使用内置规则，按优先级排序
    this.rules = [...BUILTIN_RULES].sort(
      (a, b) => (a.priority || 999) - (b.priority || 999)
    );
  }

  /**
   * 标注单个字段
   */
  async annotate(column: ColumnInfo): Promise<RuleAnnotationResult | null> {
    // 1. 先查询数据字典
    const dictEntry = await this.queryDataDictionary(column.columnName);
    if (dictEntry) {
      return {
        semantic: dictEntry.semanticMeaning,
        source: 'rule',
        confidence: Number(dictEntry.confidence) || 0.85,
        ruleName: 'data_dictionary',
        targetTable: dictEntry.targetTable || undefined,
        targetColumn: dictEntry.targetColumn || undefined,
      };
    }

    // 2. 应用内置规则
    for (const rule of this.rules) {
      const match = rule.pattern.exec(column.columnName);
      if (match) {
        const semantic = this.applyTemplate(rule.semanticTemplate, column, match);

        return {
          semantic,
          source: 'rule',
          confidence: rule.confidence,
          ruleName: rule.name,
          targetTable: rule.targetTable,
          targetColumn: rule.targetColumn,
        };
      }
    }

    // 3. 无法匹配，返回 null（需要 AI 处理）
    return null;
  }

  /**
   * 批量标注字段
   */
  async annotateMany(columns: ColumnInfo[]): Promise<Map<string, RuleAnnotationResult | null>> {
    const results = new Map<string, RuleAnnotationResult | null>();

    for (const column of columns) {
      const key = `${column.databaseName}.${column.tableName}.${column.columnName}`;
      const result = await this.annotate(column);
      results.set(key, result);
    }

    return results;
  }

  /**
   * 查询数据字典
   */
  private async queryDataDictionary(columnName: string) {
    try {
      // 精确匹配
      let entry = await this.prisma.dataDictionary.findFirst({
        where: {
          fieldPattern: columnName,
          isEnabled: true,
        },
      });

      if (entry) return entry;

      // 模糊匹配（LIKE）
      const entries = await this.prisma.dataDictionary.findMany({
        where: {
          isEnabled: true,
        },
      });

      for (const e of entries) {
        // 支持 SQL LIKE 模式（% 和 _）
        const pattern = e.fieldPattern
          .replace(/%/g, '.*')
          .replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');

        if (regex.test(columnName)) {
          return e;
        }
      }

      return null;
    } catch (error) {
      console.warn('数据字典查询失败:', error);
      return null;
    }
  }

  /**
   * 应用模板变量替换
   */
  private applyTemplate(
    template: string,
    column: ColumnInfo,
    match: RegExpExecArray
  ): string {
    let result = template;

    // 替换 {table} - 从外键模式提取表名
    if (match[1]) {
      result = result.replace('{table}', match[1]);
    }

    // 替换 {name} - 从匹配组提取名称并转换
    if (match[1]) {
      const name = this.formatName(match[1]);
      result = result.replace('{name}', name);
    }

    // 替换 {column_name}
    result = result.replace('{column_name}', column.columnName);

    // 替换 {data_type}
    result = result.replace('{data_type}', column.dataType);

    return result;
  }

  /**
   * 格式化名称（下划线转中文）
   */
  private formatName(name: string): string {
    // 简单的映射表
    const translations: Record<string, string> = {
      user: '用户',
      product: '产品',
      order: '订单',
      category: '分类',
      tag: '标签',
      comment: '评论',
      post: '文章',
      article: '文章',
      image: '图片',
      file: '文件',
      video: '视频',
      active: '激活',
      enabled: '启用',
      disabled: '禁用',
      verified: '已验证',
      approved: '已批准',
    };

    return translations[name.toLowerCase()] || name;
  }

  /**
   * 获取覆盖率统计
   */
  async getCoverageStats(columns: ColumnInfo[]): Promise<{
    total: number;
    covered: number;
    coverageRate: number;
    needsAI: number;
  }> {
    const results = await this.annotateMany(columns);
    const covered = Array.from(results.values()).filter((r) => r !== null).length;

    return {
      total: columns.length,
      covered,
      coverageRate: columns.length > 0 ? covered / columns.length : 0,
      needsAI: columns.length - covered,
    };
  }
}

/**
 * 导出默认实例（向后兼容）
 */
let _ruleBasedAnnotator: RuleBasedAnnotator | null = null;

export function getRuleBasedAnnotator(): RuleBasedAnnotator {
  if (!_ruleBasedAnnotator) {
    const { getService } = require('@/lib/di/setup') as { getService: <T>(token: symbol) => T };
    try {
      _ruleBasedAnnotator = getService<RuleBasedAnnotator>(DI_TOKENS.RuleBasedAnnotator);
    } catch {
      // 回退方案：创建不使用 DI 的实例
      const prisma = require('@/lib/prisma/client').default;
      _ruleBasedAnnotator = new RuleBasedAnnotator(prisma);
    }
  }
  return _ruleBasedAnnotator;
}

export const ruleBasedAnnotator = new Proxy({} as RuleBasedAnnotator, {
  get(_target, prop) {
    return getRuleBasedAnnotator()[prop as keyof RuleBasedAnnotator];
  }
});
