/**
 * 数据源路由
 *
 * 元数据检索可能命中多个数据源的表。执行策略：
 * - 单一数据源：直接在该数据源执行
 * - 多个数据源位于同一数据库实例（host + port 相同）：SINGLE_CONNECTION，
 *   用其中一个连接执行跨库 SQL（SQL 已带库名前缀）
 * - 多个数据源位于不同实例：暂不支持（应用层 JOIN 未实现），明确报错，
 *   避免像过去那样静默使用第一个数据源导致「表不存在」或查错库
 *
 * 实例判断只比较 host（忽略大小写）与 port，同一台服务器的不同主机名（如 IP 与域名）会被视为不同实例。
 */

import type { MetadataContext } from '@/lib/metadata/types';
import { ExecutorError, ExecutorErrorType } from './types';

export interface SourceEndpoint {
  sourceId: string;
  host: string;
  port: number;
}

export interface SourcePlan {
  /** 执行查询使用的数据源 */
  sourceId: string;
  /** 查询涉及的全部数据源（已排序去重） */
  sourceIds: string[];
}

/**
 * 收集上下文中的数据源 ID（按首次出现顺序去重）
 */
export function collectSourceIds(context: MetadataContext): string[] {
  if (context.tables.length === 0) {
    throw new ExecutorError(ExecutorErrorType.UNKNOWN_ERROR, '无法确定主数据源：上下文中没有表信息');
  }

  const ids: string[] = [];
  for (const table of context.tables) {
    const sourceId = table.database?.sourceId;
    if (!sourceId) {
      throw new ExecutorError(ExecutorErrorType.UNKNOWN_ERROR, `无法获取表 ${table.tableName} 的数据源 ID`);
    }
    if (!ids.includes(String(sourceId))) {
      ids.push(String(sourceId));
    }
  }
  return ids;
}

function sameInstance(a: SourceEndpoint, b: SourceEndpoint): boolean {
  return a.host.trim().toLowerCase() === b.host.trim().toLowerCase() && a.port === b.port;
}

/**
 * 根据各数据源的连接地址决定执行方式
 *
 * @param endpoints 与 collectSourceIds 返回顺序一致
 */
export function planSources(endpoints: SourceEndpoint[], context: MetadataContext): SourcePlan {
  const sourceIds = endpoints.map((e) => e.sourceId);
  const [primary] = endpoints;

  if (endpoints.every((e) => sameInstance(e, primary))) {
    return { sourceId: primary.sourceId, sourceIds: [...sourceIds].sort() };
  }

  // 列出各数据源涉及的库，便于用户缩小范围
  const describe = (sourceId: string) => {
    const databases = new Set(
      context.tables
        .filter((t) => String(t.database?.sourceId) === sourceId)
        .map((t) => t.databaseName)
    );
    return `数据源 ${sourceId}（${[...databases].join('、')}）`;
  };

  throw new ExecutorError(
    ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED,
    `查询涉及位于不同数据库实例的多个数据源：${sourceIds.map(describe).join('，')}。` +
      '暂不支持跨实例查询，请在查询页指定数据源，或调整问题使其只涉及一个数据源'
  );
}
