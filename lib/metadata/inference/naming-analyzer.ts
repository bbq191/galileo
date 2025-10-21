/**
 * 命名模式分析器
 * 基于字段命名约定推断关系
 */

import type { NamingPattern } from './types';

/**
 * 内置命名模式
 */
export const BUILTIN_NAMING_PATTERNS: NamingPattern[] = [
  // 规则 1: parent_id 自引用（优先级最高）
  {
    pattern: /^parent_id$/i,
    extractTableName: () => null, // 自引用，需要特殊处理
    targetColumnName: 'id',
    confidence: 0.80,
    description: '父级ID - 自引用关系',
  },

  // 规则 2: 常见审计字段
  {
    pattern: /^(created_by|updated_by|deleted_by|approved_by)$/i,
    extractTableName: () => 'users',
    targetColumnName: 'id',
    confidence: 0.75,
    description: '审计字段 → users.id',
  },

  // 规则 3: owner/author 字段
  {
    pattern: /^(owner_id|author_id)$/i,
    extractTableName: () => 'users',
    targetColumnName: 'id',
    confidence: 0.75,
    description: '所有者/作者字段 → users.id',
  },

  // 规则 4: {table}_id 模式
  {
    pattern: /^(\w+)_id$/i,
    extractTableName: (columnName: string) => {
      const match = columnName.match(/^(\w+)_id$/i);
      if (match) {
        const tableName = match[1];
        // 尝试复数化（简单规则）
        if (!tableName.endsWith('s')) {
          return `${tableName}s`;
        }
        return tableName;
      }
      return null;
    },
    targetColumnName: 'id',
    confidence: 0.85,
    description: '外键命名模式: {table}_id → {table}s.id',
  },

  // 规则 5: {table}Id 驼峰命名
  {
    pattern: /^(\w+)Id$/,
    extractTableName: (columnName: string) => {
      const match = columnName.match(/^(\w+)Id$/);
      if (match) {
        const tableName = match[1].toLowerCase();
        if (!tableName.endsWith('s')) {
          return `${tableName}s`;
        }
        return tableName;
      }
      return null;
    },
    targetColumnName: 'id',
    confidence: 0.80,
    description: '外键驼峰命名: {table}Id → {table}s.id',
  },

  // 规则 6: {entity}_code 模式
  {
    pattern: /^(\w+)_code$/i,
    extractTableName: (columnName: string) => {
      const match = columnName.match(/^(\w+)_code$/i);
      if (match) {
        const tableName = match[1];
        if (!tableName.endsWith('s')) {
          return `${tableName}s`;
        }
        return tableName;
      }
      return null;
    },
    targetColumnName: 'code',
    confidence: 0.70,
    description: '代码引用: {entity}_code → {entity}s.code',
  },

  // 规则 7: {entity}_uuid 模式
  {
    pattern: /^(\w+)_uuid$/i,
    extractTableName: (columnName: string) => {
      const match = columnName.match(/^(\w+)_uuid$/i);
      if (match) {
        const tableName = match[1];
        if (!tableName.endsWith('s')) {
          return `${tableName}s`;
        }
        return tableName;
      }
      return null;
    },
    targetColumnName: 'uuid',
    confidence: 0.75,
    description: 'UUID引用: {entity}_uuid → {entity}s.uuid',
  },
];

/**
 * 命名模式分析器
 */
export class NamingAnalyzer {
  private patterns: NamingPattern[];

  constructor(customPatterns: NamingPattern[] = []) {
    // 合并内置模式和自定义模式
    this.patterns = [...BUILTIN_NAMING_PATTERNS, ...customPatterns];
  }

  /**
   * 分析字段名，返回可能的目标表和字段
   */
  analyze(columnName: string): {
    targetTable: string | null;
    targetColumn: string;
    confidence: number;
    pattern: NamingPattern | null;
  } {
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(columnName)) {
        const targetTable = pattern.extractTableName
          ? pattern.extractTableName(columnName)
          : null;

        return {
          targetTable,
          targetColumn: pattern.targetColumnName,
          confidence: pattern.confidence,
          pattern,
        };
      }
    }

    return {
      targetTable: null,
      targetColumn: 'id',
      confidence: 0,
      pattern: null,
    };
  }

  /**
   * 检查字段名是否匹配任何模式
   */
  matches(columnName: string): boolean {
    return this.patterns.some((pattern) => pattern.pattern.test(columnName));
  }

  /**
   * 获取所有模式
   */
  getPatterns(): NamingPattern[] {
    return [...this.patterns];
  }

  /**
   * 添加自定义模式
   */
  addPattern(pattern: NamingPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * 智能表名匹配
   * 尝试匹配不同的表名变体（单数、复数、大小写等）
   */
  findMatchingTable(
    targetTableName: string,
    availableTables: string[]
  ): string | null {
    // 精确匹配
    if (availableTables.includes(targetTableName)) {
      return targetTableName;
    }

    // 转小写匹配
    const lowerTarget = targetTableName.toLowerCase();
    const exactMatch = availableTables.find(
      (t) => t.toLowerCase() === lowerTarget
    );
    if (exactMatch) {
      return exactMatch;
    }

    // 处理复数形式变化
    // 1. categorys -> categories (y结尾加s变成ies)
    if (lowerTarget.endsWith('ys')) {
      const categoryForm = lowerTarget.slice(0, -2) + 'ies';
      const categoryMatch = availableTables.find(
        (t) => t.toLowerCase() === categoryForm
      );
      if (categoryMatch) {
        return categoryMatch;
      }
    }

    // 2. categories -> category (ies结尾去掉es变成y)
    if (lowerTarget.endsWith('ies')) {
      const singular = lowerTarget.slice(0, -3) + 'y';
      const singularMatch = availableTables.find(
        (t) => t.toLowerCase() === singular
      );
      if (singularMatch) {
        return singularMatch;
      }
    }

    // 3. 单数化尝试（移除末尾的 s）
    if (lowerTarget.endsWith('s')) {
      const singular = lowerTarget.slice(0, -1);
      const singularMatch = availableTables.find(
        (t) => t.toLowerCase() === singular
      );
      if (singularMatch) {
        return singularMatch;
      }
    }

    // 4. 复数化尝试（添加 s）
    const plural = `${lowerTarget}s`;
    const pluralMatch = availableTables.find(
      (t) => t.toLowerCase() === plural
    );
    if (pluralMatch) {
      return pluralMatch;
    }

    // 处理不规则复数
    const irregularPlurals: Record<string, string> = {
      person: 'people',
      child: 'children',
      man: 'men',
      woman: 'women',
      foot: 'feet',
      tooth: 'teeth',
      mouse: 'mice',
      goose: 'geese',
    };

    if (irregularPlurals[lowerTarget]) {
      const irregular = irregularPlurals[lowerTarget];
      const irregularMatch = availableTables.find(
        (t) => t.toLowerCase() === irregular
      );
      if (irregularMatch) {
        return irregularMatch;
      }
    }

    // 反向查找不规则复数
    const reverseIrregular = Object.entries(irregularPlurals).find(
      ([_, plural]) => plural === lowerTarget
    );
    if (reverseIrregular) {
      const singularMatch = availableTables.find(
        (t) => t.toLowerCase() === reverseIrregular[0]
      );
      if (singularMatch) {
        return singularMatch;
      }
    }

    return null;
  }
}
