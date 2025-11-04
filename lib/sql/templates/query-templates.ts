/**
 * 查询模板库
 * 为常见查询提供模板，加速查询生成，提高 SQL 质量
 */

export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  category: 'aggregate' | 'time_range' | 'join' | 'comparison' | 'ranking';
  pattern: RegExp; // 匹配的自然语言模式
  sqlTemplate: string; // SQL 模板（使用占位符）
  parameters: TemplateParameter[];
  exampleQueries: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface TemplateParameter {
  name: string;
  type: 'table' | 'column' | 'aggregation' | 'timeRange' | 'limit' | 'condition';
  description: string;
  required: boolean;
  defaultValue?: any;
}

export interface TemplateMatch {
  template: QueryTemplate;
  confidence: number;
  extractedParameters: Map<string, any>;
}

/**
 * 查询模板定义
 */
export const QUERY_TEMPLATES: QueryTemplate[] = [
  // 1. 时间范围聚合查询模板
  {
    id: 'time_range_aggregate',
    name: '时间范围聚合查询',
    description: '统计指定时间范围内的聚合数据',
    category: 'time_range',
    pattern: /(?:查询|统计).*(?:最近|近|过去).*(?:天|周|月|年)/i,
    sqlTemplate: `
SELECT {{groupBy}}, {{aggregation}}({{column}}) as total
FROM {{database}}.{{table}}
WHERE {{timeColumn}} >= DATE_SUB(NOW(), INTERVAL {{interval}})
GROUP BY {{groupBy}}
ORDER BY total DESC
LIMIT {{limit}}
    `.trim(),
    parameters: [
      { name: 'database', type: 'table', description: '数据库名', required: true },
      { name: 'table', type: 'table', description: '表名', required: true },
      { name: 'groupBy', type: 'column', description: '分组字段', required: true },
      { name: 'aggregation', type: 'aggregation', description: '聚合函数（SUM/COUNT/AVG等）', required: true },
      { name: 'column', type: 'column', description: '聚合的字段', required: true },
      { name: 'timeColumn', type: 'column', description: '时间字段', required: true },
      { name: 'interval', type: 'timeRange', description: '时间间隔（如 1 MONTH, 7 DAY）', required: true },
      { name: 'limit', type: 'limit', description: '返回条数', required: false, defaultValue: 10 }
    ],
    exampleQueries: [
      '查询最近一个月销售额TOP10的产品',
      '统计近7天每个分类的订单数量',
      '查询过去30天各部门的访问量'
    ],
    complexity: 'medium'
  },

  // 2. 简单统计查询模板
  {
    id: 'simple_count',
    name: '简单统计查询',
    description: '统计表的记录数',
    category: 'aggregate',
    pattern: /(?:统计|查询|有多少).*(?:数据|记录|条数)/i,
    sqlTemplate: `SELECT COUNT(*) as total FROM {{database}}.{{table}}`,
    parameters: [
      { name: 'database', type: 'table', description: '数据库名', required: true },
      { name: 'table', type: 'table', description: '表名', required: true }
    ],
    exampleQueries: [
      '统计用户表的数据',
      '查询订单表有多少条记录',
      '有多少个产品'
    ],
    complexity: 'low'
  },

  // 3. TOP N 排名查询模板
  {
    id: 'top_n_ranking',
    name: 'TOP N 排名查询',
    description: '查询排名前N的记录',
    category: 'ranking',
    pattern: /(?:TOP|前|排名前)\s*\d+|(?:最.*的.*\d+)/i,
    sqlTemplate: `
SELECT {{columns}}
FROM {{database}}.{{table}}
ORDER BY {{orderColumn}} {{direction}}
LIMIT {{limit}}
    `.trim(),
    parameters: [
      { name: 'database', type: 'table', description: '数据库名', required: true },
      { name: 'table', type: 'table', description: '表名', required: true },
      { name: 'columns', type: 'column', description: '查询字段（逗号分隔）', required: true },
      { name: 'orderColumn', type: 'column', description: '排序字段', required: true },
      { name: 'direction', type: 'condition', description: '排序方向（ASC/DESC）', required: true },
      { name: 'limit', type: 'limit', description: '返回条数', required: true }
    ],
    exampleQueries: [
      '查询销售额最高的10个产品',
      '前5名用户',
      'TOP 20 热门文章'
    ],
    complexity: 'low'
  },

  // 4. 跨表 JOIN 查询模板
  {
    id: 'cross_table_join',
    name: '跨表关联查询',
    description: '关联查询多个表的数据',
    category: 'join',
    pattern: /(?:关联|JOIN|连接).*(?:查询|统计)/i,
    sqlTemplate: `
SELECT {{selectColumns}}
FROM {{database1}}.{{table1}} t1
INNER JOIN {{database2}}.{{table2}} t2
  ON t1.{{joinColumn1}} = t2.{{joinColumn2}}
WHERE {{condition}}
    `.trim(),
    parameters: [
      { name: 'database1', type: 'table', description: '第一个数据库名', required: true },
      { name: 'table1', type: 'table', description: '第一个表名', required: true },
      { name: 'database2', type: 'table', description: '第二个数据库名', required: true },
      { name: 'table2', type: 'table', description: '第二个表名', required: true },
      { name: 'selectColumns', type: 'column', description: '查询字段', required: true },
      { name: 'joinColumn1', type: 'column', description: '第一个表的关联字段', required: true },
      { name: 'joinColumn2', type: 'column', description: '第二个表的关联字段', required: true },
      { name: 'condition', type: 'condition', description: 'WHERE 条件', required: false, defaultValue: '1=1' }
    ],
    exampleQueries: [
      '查询订单和产品的关联信息',
      '统计用户的订单数量',
      '关联查询员工和部门'
    ],
    complexity: 'medium'
  },

  // 5. 分组聚合查询模板
  {
    id: 'group_aggregate',
    name: '分组聚合查询',
    description: '按某个维度分组并进行聚合统计',
    category: 'aggregate',
    pattern: /(?:每个|各个|按.*分组).*(?:统计|计算|求和)/i,
    sqlTemplate: `
SELECT {{groupBy}}, {{aggregation}}({{column}}) as result
FROM {{database}}.{{table}}
GROUP BY {{groupBy}}
ORDER BY result DESC
    `.trim(),
    parameters: [
      { name: 'database', type: 'table', description: '数据库名', required: true },
      { name: 'table', type: 'table', description: '表名', required: true },
      { name: 'groupBy', type: 'column', description: '分组字段', required: true },
      { name: 'aggregation', type: 'aggregation', description: '聚合函数', required: true },
      { name: 'column', type: 'column', description: '聚合的字段', required: true }
    ],
    exampleQueries: [
      '每个分类的产品数量',
      '各个部门的平均薪资',
      '按地区统计销售额'
    ],
    complexity: 'medium'
  },

  // 6. 时间段对比查询模板
  {
    id: 'time_comparison',
    name: '时间段对比查询',
    description: '对比不同时间段的数据',
    category: 'comparison',
    pattern: /(?:对比|比较).*(?:同比|环比|上.*|去.*)/i,
    sqlTemplate: `
SELECT
  DATE_FORMAT({{timeColumn}}, '{{dateFormat}}') as period,
  {{aggregation}}({{column}}) as value
FROM {{database}}.{{table}}
WHERE {{timeColumn}} >= DATE_SUB(NOW(), INTERVAL {{interval}})
GROUP BY period
ORDER BY period
    `.trim(),
    parameters: [
      { name: 'database', type: 'table', description: '数据库名', required: true },
      { name: 'table', type: 'table', description: '表名', required: true },
      { name: 'timeColumn', type: 'column', description: '时间字段', required: true },
      { name: 'dateFormat', type: 'condition', description: '日期格式（%Y-%m-%d等）', required: true },
      { name: 'aggregation', type: 'aggregation', description: '聚合函数', required: true },
      { name: 'column', type: 'column', description: '聚合的字段', required: true },
      { name: 'interval', type: 'timeRange', description: '时间范围', required: true }
    ],
    exampleQueries: [
      '对比本月和上月的销售额',
      '比较去年同期的订单量',
      '环比增长趋势'
    ],
    complexity: 'high'
  },

  // 7. 条件过滤查询模板
  {
    id: 'conditional_filter',
    name: '条件过滤查询',
    description: '根据特定条件查询数据',
    category: 'aggregate',
    pattern: /(?:查询|筛选|找出).*(?:大于|小于|等于|包含|在.*之间)/i,
    sqlTemplate: `
SELECT {{columns}}
FROM {{database}}.{{table}}
WHERE {{condition}}
LIMIT {{limit}}
    `.trim(),
    parameters: [
      { name: 'database', type: 'table', description: '数据库名', required: true },
      { name: 'table', type: 'table', description: '表名', required: true },
      { name: 'columns', type: 'column', description: '查询字段', required: true },
      { name: 'condition', type: 'condition', description: '过滤条件', required: true },
      { name: 'limit', type: 'limit', description: '返回条数', required: false, defaultValue: 100 }
    ],
    exampleQueries: [
      '查询价格大于1000的产品',
      '筛选活跃用户',
      '找出库存不足的商品'
    ],
    complexity: 'low'
  }
];

/**
 * 查询模板匹配器
 */
export class QueryTemplateMatcher {
  /**
   * 匹配自然语言查询到模板
   */
  match(naturalLanguageQuery: string): TemplateMatch[] {
    const matches: TemplateMatch[] = [];

    for (const template of QUERY_TEMPLATES) {
      const match = template.pattern.exec(naturalLanguageQuery);
      if (match) {
        // 计算置信度（基于正则匹配的质量）
        const confidence = this.calculateConfidence(naturalLanguageQuery, template);

        matches.push({
          template,
          confidence,
          extractedParameters: new Map()
        });
      }
    }

    // 按置信度排序
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 计算匹配置信度
   */
  private calculateConfidence(query: string, template: QueryTemplate): number {
    let confidence = 0.5; // 基础置信度

    // 示例查询匹配度
    for (const example of template.exampleQueries) {
      const similarity = this.calculateSimilarity(query, example);
      if (similarity > 0.6) {
        confidence += similarity * 0.3;
      }
    }

    // 关键词匹配
    const keywords = this.extractKeywords(query);
    const templateKeywords = this.extractKeywords(template.description);
    const keywordMatch = keywords.filter(k => templateKeywords.includes(k)).length;
    confidence += (keywordMatch / Math.max(keywords.length, 1)) * 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // 简单的子串匹配
    if (s1.includes(s2) || s2.includes(s1)) {
      return 0.8;
    }

    // 计算共同字符数
    const chars1 = new Set(s1);
    const chars2 = new Set(s2);
    const intersection = new Set([...chars1].filter(c => chars2.has(c)));

    return intersection.size / Math.max(chars1.size, chars2.size);
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const stopWords = ['的', '和', '与', '或', '是', '在', '有', '为', '了', '以', '及'];
    const words = text.toLowerCase().split(/[\s,，、。！？;；]+/);
    return words.filter(w => w.length > 1 && !stopWords.includes(w));
  }

  /**
   * 填充模板参数（基于元数据和意图）
   */
  fillTemplate(
    template: QueryTemplate,
    intent: any,
    context: any
  ): string | null {
    let sql = template.sqlTemplate;

    try {
      // 填充表相关参数
      if (context.tables && context.tables.length > 0) {
        const table = context.tables[0];
        sql = sql.replace(/\{\{database\}\}/g, `\`${table.databaseName}\``);
        sql = sql.replace(/\{\{table\}\}/g, `\`${table.tableName}\``);
      }

      // 填充聚合函数
      if (intent.aggregations?.function) {
        sql = sql.replace(/\{\{aggregation\}\}/g, intent.aggregations.function);
      }

      // 填充 LIMIT
      if (intent.conditions?.limit) {
        sql = sql.replace(/\{\{limit\}\}/g, String(intent.conditions.limit));
      } else {
        sql = sql.replace(/\{\{limit\}\}/g, '10');
      }

      // 如果还有未填充的占位符，返回 null（表示无法自动填充）
      if (sql.includes('{{')) {
        console.log('模板包含未填充的占位符，需要 AI 辅助填充');
        return null;
      }

      return sql;

    } catch (error) {
      console.error('填充模板失败:', error);
      return null;
    }
  }
}
