/**
 * 关系推断规则引擎
 * 基于多种规则判断字段间的关系
 */

import type { ColumnInfo } from '../types';
import type { InferenceRule } from './types';

/**
 * 内置推断规则
 */
export const BUILTIN_INFERENCE_RULES: InferenceRule[] = [
  // 规则 1: 字段名匹配规则
  {
    name: 'naming_pattern',
    weight: 0.4,
    description: '基于命名模式推断关系',
    minConfidence: 0.75,
    evaluate: (source, target) => {
      // 检查源字段是否符合 {table}_id 或 {table}Id 模式
      const patterns = [
        /^(\w+)_id$/i,
        /^(\w+)Id$/,
      ];

      for (const pattern of patterns) {
        const match = source.columnName.match(pattern);
        if (match) {
          const tableName = match[1].toLowerCase();
          const targetTableLower = target.tableName.toLowerCase();

          // 检查表名是否匹配（考虑单复数）
          if (
            targetTableLower === tableName ||
            targetTableLower === `${tableName}s` ||
            `${targetTableLower}s` === tableName
          ) {
            return {
              match: true,
              confidence: 0.85,
              reasoning: `字段名 '${source.columnName}' 符合外键命名模式，指向表 '${target.tableName}'`,
            };
          }
        }
      }

      return {
        match: false,
        confidence: 0,
        reasoning: '字段名不符合外键命名模式',
      };
    },
  },

  // 规则 2: 数据类型一致性
  {
    name: 'type_consistency',
    weight: 0.3,
    description: '检查数据类型是否一致',
    minConfidence: 0.60,
    evaluate: (source, target) => {
      // 数据类型必须兼容
      const sourceType = source.dataType.toLowerCase();
      const targetType = target.dataType.toLowerCase();

      // 完全相同
      if (sourceType === targetType) {
        // 进一步检查完整类型
        if (source.columnType === target.columnType) {
          return {
            match: true,
            confidence: 0.95,
            reasoning: `数据类型完全一致: ${source.columnType}`,
          };
        }

        return {
          match: true,
          confidence: 0.80,
          reasoning: `基础数据类型一致: ${sourceType}`,
        };
      }

      // 兼容的类型（如 int 和 bigint）
      const compatibleTypes = [
        ['int', 'bigint', 'tinyint', 'smallint', 'mediumint'],
        ['char', 'varchar', 'text'],
        ['decimal', 'float', 'double'],
      ];

      for (const group of compatibleTypes) {
        if (group.includes(sourceType) && group.includes(targetType)) {
          return {
            match: true,
            confidence: 0.70,
            reasoning: `数据类型兼容: ${sourceType} ↔ ${targetType}`,
          };
        }
      }

      return {
        match: false,
        confidence: 0,
        reasoning: `数据类型不兼容: ${sourceType} vs ${targetType}`,
      };
    },
  },

  // 规则 3: 主键检查
  {
    name: 'primary_key_target',
    weight: 0.2,
    description: '目标字段应该是主键',
    minConfidence: 0.70,
    evaluate: (source, target) => {
      if (target.columnKey === 'PRI') {
        return {
          match: true,
          confidence: 0.90,
          reasoning: `目标字段 '${target.columnName}' 是主键`,
        };
      }

      // 如果不是主键但字段名是 id，仍然可能
      if (target.columnName.toLowerCase() === 'id') {
        return {
          match: true,
          confidence: 0.75,
          reasoning: `目标字段名为 'id'，可能是主键`,
        };
      }

      // 唯一索引也可以
      if (target.columnKey === 'UNI') {
        return {
          match: true,
          confidence: 0.80,
          reasoning: `目标字段 '${target.columnName}' 是唯一索引`,
        };
      }

      return {
        match: false,
        confidence: 0.50,
        reasoning: '目标字段不是主键或唯一索引',
      };
    },
  },

  // 规则 4: 源字段不应是主键
  {
    name: 'source_not_primary',
    weight: 0.05,
    description: '源字段通常不是主键',
    minConfidence: 0,
    evaluate: (source, target) => {
      if (source.columnKey !== 'PRI') {
        return {
          match: true,
          confidence: 0.70,
          reasoning: '源字段不是主键，符合外键特征',
        };
      }

      return {
        match: true,
        confidence: 0.30,
        reasoning: '源字段是主键，可能是自引用关系',
      };
    },
  },

  // 规则 5: 字段长度匹配
  {
    name: 'length_match',
    weight: 0.05,
    description: '字段长度应该匹配',
    minConfidence: 0,
    evaluate: (source, target) => {
      // 对于整型，检查精度
      if (
        source.dataType.toLowerCase().includes('int') &&
        target.dataType.toLowerCase().includes('int')
      ) {
        if (source.numericPrecision === target.numericPrecision) {
          return {
            match: true,
            confidence: 0.80,
            reasoning: `数值精度一致: ${source.numericPrecision}`,
          };
        }

        return {
          match: true,
          confidence: 0.60,
          reasoning: '数值精度不同但类型兼容',
        };
      }

      // 对于字符型，检查长度
      if (
        source.characterMaximumLength &&
        target.characterMaximumLength
      ) {
        if (source.characterMaximumLength === target.characterMaximumLength) {
          return {
            match: true,
            confidence: 0.75,
            reasoning: `字符长度一致: ${source.characterMaximumLength}`,
          };
        }

        return {
          match: true,
          confidence: 0.60,
          reasoning: '字符长度不同但可兼容',
        };
      }

      return {
        match: true,
        confidence: 0.50,
        reasoning: '长度信息不完整',
      };
    },
  },
];

/**
 * 规则引擎
 */
export class RulesEngine {
  private rules: InferenceRule[];

  constructor(customRules: InferenceRule[] = []) {
    // 合并内置规则和自定义规则
    this.rules = [...BUILTIN_INFERENCE_RULES, ...customRules];
  }

  /**
   * 评估两个字段之间的关系
   */
  evaluate(
    sourceColumn: ColumnInfo,
    targetColumn: ColumnInfo
  ): {
    isRelated: boolean;
    confidence: number;
    reasoning: string[];
    matchedRules: string[];
  } {
    const reasonings: string[] = [];
    const matchedRules: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const rule of this.rules) {
      const result = rule.evaluate(sourceColumn, targetColumn);

      if (result.match) {
        const weightedScore = result.confidence * rule.weight;
        totalScore += weightedScore;
        totalWeight += rule.weight;

        reasonings.push(`[${rule.name}] ${result.reasoning}`);
        matchedRules.push(rule.name);
      }
    }

    // 计算加权平均置信度
    const confidence = totalWeight > 0 ? totalScore / totalWeight : 0;

    // 判断是否存在关系（置信度阈值 0.60）
    const isRelated = confidence >= 0.60;

    return {
      isRelated,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: reasonings,
      matchedRules,
    };
  }

  /**
   * 获取所有规则
   */
  getRules(): InferenceRule[] {
    return [...this.rules];
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: InferenceRule): void {
    this.rules.push(rule);
  }

  /**
   * 移除规则
   */
  removeRule(ruleName: string): void {
    this.rules = this.rules.filter((r) => r.name !== ruleName);
  }

  /**
   * 获取规则统计
   */
  getRuleStats(): {
    totalRules: number;
    ruleNames: string[];
    totalWeight: number;
  } {
    return {
      totalRules: this.rules.length,
      ruleNames: this.rules.map((r) => r.name),
      totalWeight: this.rules.reduce((sum, r) => sum + r.weight, 0),
    };
  }
}
