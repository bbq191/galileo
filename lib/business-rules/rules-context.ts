/**
 * 业务规则 → SQL 生成 Prompt
 *
 * 根据问题与本次检索到的元数据，挑选可以安全应用的业务规则并渲染为 Prompt 片段：
 * - 业务术语：目标表 / 字段必须在元数据中
 * - 过滤条件：指定表的规则要求该表在元数据中；全局规则（targetTable = '*'）只对
 *   包含条件中全部字段的表生效，条件无法解析时不注入（避免给所有表加上不存在的字段导致查询失败）
 * - 聚合规则：来源表必须在元数据中
 * - 查询模板：作为带占位符的结构参考
 *
 * 分表不由业务规则处理：以同步时自动识别的 TableShardGroup 为准，
 * 在元数据检索阶段展开（lib/metadata/shard/shard-expander.ts）。
 */

import crypto from 'crypto';
import { Parser } from 'node-sql-parser';
import type { MetadataContext } from '@/lib/metadata/types';
import { buildBusinessRulesSection } from '@/lib/sql/generator/prompts/sql-prompts';
import type { AppliedRuleIds, BusinessRulesEngine, FilterRule } from './business-rules-engine';

export interface BusinessRulesContext {
  /** 追加到生成 Prompt 的内容 */
  promptSection: string;
  /** promptSection 的摘要，用于 SQL 缓存 key */
  digest: string;
  /** 实际注入的规则名称（日志与前端展示） */
  applied: {
    terms: string[];
    filters: string[];
    aggregations: string[];
    templates: string[];
  };
  appliedIds: AppliedRuleIds;
}

const parser = new Parser();
const TEMPLATE_LIMIT = 2;

/**
 * 解析过滤条件引用的字段名；无法解析时返回 null
 */
export function extractFilterColumns(condition: string): string[] | null {
  try {
    const columns = parser.columnList(`SELECT 1 FROM t WHERE ${condition}`, { database: 'MySQL' });
    // 格式：select::表名或null::字段名
    return Array.from(new Set(columns.map((c) => c.split('::')[2]).filter((c) => c && c !== '(.*)')));
  } catch {
    return null;
  }
}

function renderAggregation(fn: string, table: string, column: string): string {
  const target = `${table}.${column}`;
  return fn.toUpperCase() === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${target})` : `${fn.toUpperCase()}(${target})`;
}

/**
 * 全局过滤规则展开为具体表；没有表包含全部字段时返回空数组
 */
function resolveGlobalFilter(filter: FilterRule, columnsByTable: Map<string, Set<string>>): string[] {
  const referenced = extractFilterColumns(filter.filterCondition);
  if (!referenced || referenced.length === 0) {
    return [];
  }
  return Array.from(columnsByTable.entries())
    .filter(([, columns]) => referenced.every((c) => columns.has(c.toLowerCase())))
    .map(([table]) => table);
}

export async function buildBusinessRulesContext(
  engine: BusinessRulesEngine,
  query: string,
  context: MetadataContext
): Promise<BusinessRulesContext | null> {
  const columnsByTable = new Map(
    context.tables.map((t) => [t.tableName, new Set(t.columns.map((c) => c.columnName.toLowerCase()))])
  );
  const hasTable = (table?: string) => !!table && columnsByTable.has(table);

  const [terms, filters, aggregations, templates] = await Promise.all([
    engine.matchBusinessTerms(query),
    engine.getApplicableFilters(Array.from(columnsByTable.keys())),
    engine.matchAggregationRules(query),
    engine.matchQueryTemplates(query, {} as never, TEMPLATE_LIMIT),
  ]);

  const usableTerms = terms.filter((t) => {
    if (!t.targetTable) return true; // 如时间类术语，不依赖具体表
    if (!hasTable(t.targetTable)) return false;
    return !t.targetColumn || columnsByTable.get(t.targetTable)!.has(t.targetColumn.toLowerCase());
  });

  const usableFilters = filters
    .map((f) => {
      if (f.targetTable !== '*') return { filter: f, tables: [f.targetTable] };
      return { filter: f, tables: resolveGlobalFilter(f, columnsByTable) };
    })
    .filter(({ tables }) => tables.length > 0);

  const usableAggregations = aggregations.filter((a) => hasTable(a.sourceTable));

  if (usableTerms.length + usableFilters.length + usableAggregations.length + templates.length === 0) {
    return null;
  }

  let promptSection = '';
  if (usableTerms.length + usableFilters.length + usableAggregations.length > 0) {
    promptSection += buildBusinessRulesSection({
      businessTerms: usableTerms.map((t) => ({
        term: t.term,
        description:
          t.semanticDescription ||
          (t.targetTable ? `对应 ${t.targetTable}${t.targetColumn ? '.' + t.targetColumn : ''}` : `${t.category} 类术语`),
        mapping: JSON.stringify(
          t.targetValue && Object.keys(t.targetValue).length > 0 ? t.targetValue : t.targetColumn || t.targetTable
        ),
      })),
      commonFilters: usableFilters.map(({ filter, tables }) => ({
        name: `${filter.name}（适用于 ${tables.join('、')}）`,
        condition: filter.filterCondition,
        autoApply: filter.autoApply,
      })),
      aggregationRules: usableAggregations.map((a) => ({
        metric: a.metricName,
        calculation:
          renderAggregation(a.aggregationFunction, a.sourceTable, a.sourceColumn) +
          (a.unit ? `（单位：${a.unit}）` : ''),
      })),
    });
  }

  if (templates.length > 0) {
    promptSection += `\n## 查询结构参考\n\n以下模板中的 {占位符} 需替换为上方元数据中的实际表和字段，仅参考结构：\n\n`;
    promptSection += templates
      .map((t) => `- **${t.name}**（${t.naturalLanguagePattern}）：\`${t.sqlTemplate}\``)
      .join('\n');
    promptSection += '\n';
  }

  const ids = <T extends { id?: number }>(items: T[]) =>
    items.map((i) => i.id).filter((id): id is number => id !== undefined);

  return {
    promptSection,
    digest: crypto.createHash('md5').update(promptSection).digest('hex'),
    applied: {
      terms: usableTerms.map((t) => t.term),
      filters: usableFilters.map(({ filter }) => filter.name),
      aggregations: usableAggregations.map((a) => a.metricName),
      templates: templates.map((t) => t.name),
    },
    appliedIds: {
      termIds: ids(usableTerms),
      templateIds: ids(templates),
      filterIds: ids(usableFilters.map(({ filter }) => filter)),
      aggregationIds: ids(usableAggregations),
    },
  };
}
