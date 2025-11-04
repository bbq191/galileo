/**
 * 业务规则引擎
 * 增强 AI 对业务逻辑的理解
 */

import { PrismaClient } from '@prisma/client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 业务术语匹配结果
 */
export interface BusinessTermMatch {
  term: string;
  targetType: string;
  targetTable?: string;
  targetColumn?: string;
  targetValue?: any;
  confidence: number;
  priority: number;
}

/**
 * 分表模式识别结果
 */
export interface ShardingPatternMatch {
  patternName: string;
  baseTableName: string;
  tableList: string[];
  mergeStrategy: string;
  shardKeyColumn?: string;
  semanticDescription?: string;
}

/**
 * 查询模板匹配结果
 */
export interface QueryTemplateMatch {
  name: string;
  naturalLanguage: string;
  expectedSQL: string;
  category: string;
  similarity: number;
  businessContext?: string;
}

/**
 * 业务规则引擎
 */
export class BusinessRulesEngine {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * 匹配业务术语
   * 从自然语言查询中识别业务术语并映射到数据库实体
   */
  async matchBusinessTerms(naturalLanguageQuery: string): Promise<BusinessTermMatch[]> {
    console.log('[BusinessRulesEngine] 匹配业务术语:', naturalLanguageQuery);

    // TODO: 需要在主schema中添加这些表后才能使用
    // 暂时返回空数组
    const matches: BusinessTermMatch[] = [];

    try {
      // 查询所有启用的业务术语
      // const terms = await this.prisma.businessTermMapping.findMany({
      //   where: { isEnabled: true },
      //   orderBy: [
      //     { priority: 'asc' },
      //     { confidence: 'desc' }
      //   ]
      // });

      // 模拟数据（实际应该从数据库读取）
      const mockTerms = [
        {
          term: '寿险',
          category: 'domain',
          targetType: 'condition',
          targetTable: 'tb_live_all_room',
          targetValue: {
            type: 'subquery',
            condition: "orgId IN (SELECT dept_id FROM openser.live_temporary_dept WHERE top_name = '中国人民人寿保险股份有限公司')"
          },
          priority: 1,
          confidence: 0.95
        },
        {
          term: '观看时长',
          category: 'metric',
          targetType: 'column',
          targetTable: 'tb_live_watch_detail',
          targetColumn: 'watch_time',
          priority: 2,
          confidence: 0.90
        }
      ];

      // 检查查询中是否包含这些术语
      for (const term of mockTerms) {
        if (naturalLanguageQuery.includes(term.term)) {
          matches.push({
            term: term.term,
            targetType: term.targetType,
            targetTable: term.targetTable,
            targetColumn: term.targetColumn,
            targetValue: term.targetValue,
            confidence: term.confidence,
            priority: term.priority
          });

          console.log(`[BusinessRulesEngine] 匹配到业务术语: ${term.term}`);

          // 更新使用统计（实际实现时）
          // await this.prisma.businessTermMapping.update({
          //   where: { id: term.id },
          //   data: {
          //     usageCount: { increment: 1 },
          //     lastUsedAt: new Date()
          //   }
          // });
        }
      }
    } catch (error) {
      console.error('[BusinessRulesEngine] 业务术语匹配失败:', error);
    }

    return matches;
  }

  /**
   * 识别分表模式
   * 检测查询是否涉及分表，并返回分表信息
   */
  async detectShardingPatterns(
    intent: QueryIntent,
    context: MetadataContext
  ): Promise<ShardingPatternMatch[]> {
    console.log('[BusinessRulesEngine] 检测分表模式...');

    const matches: ShardingPatternMatch[] = [];

    try {
      // 模拟数据（实际应该从数据库读取）
      const mockPatterns = [
        {
          patternName: 'live_watch_detail_sharding',
          baseTableName: 'tb_live_watch_detail',
          suffixPattern: '_{shard:hex:2}',
          shardCount: 256,
          tableList: this.generateHexShardList('tb_live_watch_detail', 256),
          mergeStrategy: 'UNION_ALL',
          shardKeyColumn: 'live_id',
          semanticDescription: '观看时长明细数据按照live_id进行哈希分表，共256个分表'
        },
        {
          patternName: 'live_stat_total_sharding',
          baseTableName: 'tb_live_stat_total',
          suffixPattern: '_{shard:hex:1}',
          shardCount: 16,
          tableList: this.generateHexShardList('tb_live_stat_total', 16),
          mergeStrategy: 'UNION_ALL',
          shardKeyColumn: 'live_id',
          semanticDescription: '直播统计总表按照live_id进行哈希分表，共16个分表'
        }
      ];

      // 检查意图中的表是否匹配分表模式
      for (const pattern of mockPatterns) {
        // 检查是否有表名匹配基表名
        const hasMatch = intent.entities.tables.some(tableName =>
          tableName === pattern.baseTableName ||
          tableName.startsWith(pattern.baseTableName + '_')
        );

        // 或者检查上下文中的表
        const hasContextMatch = context.tables.some(table =>
          table.tableName === pattern.baseTableName ||
          table.tableName.startsWith(pattern.baseTableName + '_')
        );

        if (hasMatch || hasContextMatch) {
          matches.push({
            patternName: pattern.patternName,
            baseTableName: pattern.baseTableName,
            tableList: pattern.tableList,
            mergeStrategy: pattern.mergeStrategy,
            shardKeyColumn: pattern.shardKeyColumn,
            semanticDescription: pattern.semanticDescription
          });

          console.log(`[BusinessRulesEngine] 检测到分表模式: ${pattern.patternName}`);
        }
      }
    } catch (error) {
      console.error('[BusinessRulesEngine] 分表模式检测失败:', error);
    }

    return matches;
  }

  /**
   * 匹配相似查询模板
   * 使用 Few-shot 学习提供查询示例
   */
  async matchQueryTemplates(
    naturalLanguageQuery: string,
    intent: QueryIntent,
    topK: number = 3
  ): Promise<QueryTemplateMatch[]> {
    console.log('[BusinessRulesEngine] 匹配查询模板...');

    const matches: QueryTemplateMatch[] = [];

    try {
      // 模拟数据（实际应该从数据库读取并计算相似度）
      const mockTemplates = [
        {
          name: 'life_insurance_watch_time_top10',
          naturalLanguage: '寿险观看时长top10',
          expectedSQL: `
SELECT
  live.userName AS 用户,
  live.title AS 会议名称,
  watchtime.watch_time AS 观看时长,
  stat.viewerNum AS 观看人数
FROM
  (SELECT live_id, title, userName
   FROM \`db_live\`.\`tb_live_all_room\`
   WHERE opentime >= UNIX_TIMESTAMP('2025-05-01 00:00:00')
     AND opentime < UNIX_TIMESTAMP('2025-06-01 00:00:00')
     AND live_status = 0
     AND uid NOT IN ('1463694780738129920', '1608799111031640064', ...)
     AND orgId IN (SELECT dept_id FROM \`openser\`.\`live_temporary_dept\`
                   WHERE top_name = '中国人民人寿保险股份有限公司')
  ) live
LEFT JOIN
  (SELECT live_id, viewerNum FROM \`db_stat\`.\`tb_live_stat_total_0\`
   UNION SELECT live_id, viewerNum FROM \`db_stat\`.\`tb_live_stat_total_1\`
   -- ... 省略其他分表 ...
   UNION SELECT live_id, viewerNum FROM \`db_stat\`.\`tb_live_stat_total_f\`
  ) stat ON live.live_id = stat.live_id
LEFT JOIN
  (SELECT live_id, SUM(watch_time) as watch_time
   FROM \`db_stat\`.\`tb_live_watch_detail_00\` GROUP BY live_id
   UNION ALL
   SELECT live_id, SUM(watch_time) as watch_time
   FROM \`db_stat\`.\`tb_live_watch_detail_01\` GROUP BY live_id
   -- ... 省略其他256个分表 ...
  ) watchtime ON live.live_id = watchtime.live_id
ORDER BY watch_time DESC
LIMIT 10
`.trim(),
          category: 'top_n',
          tags: ['分表', 'TOP10', '跨库', 'UNION_ALL', '寿险'],
          businessContext: '统计寿险业务的观看时长排名，涉及多个分表的聚合和跨表JOIN',
          similarity: 0
        }
      ];

      // 计算相似度（简单的关键词匹配，实际应使用向量相似度）
      for (const template of mockTemplates) {
        const similarity = this.calculateSimilarity(
          naturalLanguageQuery,
          template.naturalLanguage
        );

        if (similarity > 0.5) { // 相似度阈值
          matches.push({
            name: template.name,
            naturalLanguage: template.naturalLanguage,
            expectedSQL: template.expectedSQL,
            category: template.category,
            similarity,
            businessContext: template.businessContext
          });

          console.log(`[BusinessRulesEngine] 匹配到查询模板: ${template.name} (相似度: ${similarity.toFixed(2)})`);
        }
      }

      // 按相似度排序
      matches.sort((a, b) => b.similarity - a.similarity);

      // 返回 Top K
      return matches.slice(0, topK);

    } catch (error) {
      console.error('[BusinessRulesEngine] 查询模板匹配失败:', error);
      return [];
    }
  }

  /**
   * 获取适用的常用过滤规则
   */
  async getApplicableFilters(
    tables: string[]
  ): Promise<Array<{ name: string; condition: string; autoApply: boolean }>> {
    console.log('[BusinessRulesEngine] 获取常用过滤规则...');

    const filters: Array<{ name: string; condition: string; autoApply: boolean }> = [];

    try {
      // 模拟数据
      const mockFilters = [
        {
          name: 'exclude_system_users',
          applicableTables: ['tb_live_all_room'],
          filterCondition: "uid NOT IN ('1463694780738129920', '1608799111031640064', '1375288699939278848', '1529446145732988928', '1584151697880076288')",
          autoApply: true
        },
        {
          name: 'default_time_range',
          applicableTables: ['tb_live_all_room'],
          filterCondition: "opentime >= UNIX_TIMESTAMP(CONCAT('{month_start}', ' 00:00:00')) AND opentime < UNIX_TIMESTAMP(CONCAT('{month_end}', ' 00:00:00'))",
          autoApply: false
        }
      ];

      for (const filter of mockFilters) {
        // 检查是否有表匹配
        const applicable = filter.applicableTables.some(tableName =>
          tables.includes(tableName)
        );

        if (applicable) {
          filters.push({
            name: filter.name,
            condition: filter.filterCondition,
            autoApply: filter.autoApply
          });

          console.log(`[BusinessRulesEngine] 找到适用的过滤规则: ${filter.name}`);
        }
      }
    } catch (error) {
      console.error('[BusinessRulesEngine] 获取过滤规则失败:', error);
    }

    return filters;
  }

  /**
   * 获取聚合计算规则
   */
  async getAggregationRule(metricName: string): Promise<any> {
    console.log('[BusinessRulesEngine] 获取聚合规则:', metricName);

    try {
      // 模拟数据
      const mockRules: Record<string, any> = {
        '观看时长': {
          sourceTable: 'tb_live_watch_detail',
          sourceColumn: 'watch_time',
          aggregateFunc: 'SUM',
          unit: '秒',
          groupByColumns: ['live_id']
        },
        '观看人数': {
          sourceTable: 'tb_live_stat_total',
          sourceColumn: 'viewerNum',
          aggregateFunc: 'MAX',
          unit: '人'
        }
      };

      return mockRules[metricName] || null;
    } catch (error) {
      console.error('[BusinessRulesEngine] 获取聚合规则失败:', error);
      return null;
    }
  }

  /**
   * 生成十六进制分表列表
   */
  private generateHexShardList(baseTableName: string, count: number): string[] {
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      const suffix = i.toString(16).padStart(2, '0');
      list.push(`${baseTableName}_${suffix}`);
    }
    return list;
  }

  /**
   * 计算相似度（简单实现）
   * 实际应使用向量嵌入 + 余弦相似度
   */
  private calculateSimilarity(query1: string, query2: string): number {
    // 简单的 Jaccard 相似度
    const words1 = new Set(query1.split(/\s+/));
    const words2 = new Set(query2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
