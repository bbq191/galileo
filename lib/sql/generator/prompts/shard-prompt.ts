/**
 * 分表组 Prompt（见 lib/metadata/shard/shard-expander.ts）
 *
 * 分表组的成员表与代表表结构相同：Prompt 中只描述代表表，并在其后列出全部分表与合并方式。
 */

import type { TableContext } from '@/lib/metadata/retrieval/types';

/** 分表组成员不单独描述表结构 */
export function isShardMember(table: Pick<TableContext, 'shardOf'>): boolean {
  return !!table.shardOf;
}

export function renderShardGroupNote(table: TableContext): string {
  if (!table.shardGroup) return '';

  const names = table.shardGroup.tableNames.map((name) => `\`${table.databaseName}\`.\`${name}\``);
  return `
**🧩 分表组 ${table.shardGroup.groupName}**（${table.shardGroup.baseTablePattern}，共 ${names.length} 张结构相同的分表，以上字段说明适用于全部分表）：
${names.join('、')}

- 查询或统计全量数据时，必须对上述所有分表 UNION ALL 后再查询，例如：
  SELECT ... FROM (SELECT ... FROM ${names[0]} UNION ALL SELECT ... FROM ${names[1] ?? names[0]} ...) AS t
- COUNT、SUM 等聚合放在 UNION ALL 外层；问题明确只涉及某一张分表时只查询该表
`;
}
