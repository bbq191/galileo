/**
 * 从 SQL 中提取 FROM / JOIN 引用的表（用于为用户编辑的 SQL 加载元数据上下文）
 *
 * 支持 `db`.`table`、db.table、`table`、table 四种写法；子查询（FROM (...)）跳过。
 * 逗号分隔的多表写法（FROM a, b）只识别第一张表，生成与编辑时请使用 JOIN。
 */

export interface TableReference {
  database?: string;
  table: string;
}

const TABLE_REFERENCE = /\b(?:FROM|JOIN)\s+(?:`([^`]+)`|(\w+))(?:\s*\.\s*(?:`([^`]+)`|(\w+)))?/gi;

export function extractTableReferences(sql: string): TableReference[] {
  const references = new Map<string, TableReference>();

  for (const match of sql.matchAll(TABLE_REFERENCE)) {
    const first = match[1] ?? match[2];
    const second = match[3] ?? match[4];
    const reference = second ? { database: first, table: second } : { table: first };
    references.set(`${reference.database ?? ''}.${reference.table}`, reference);
  }

  return Array.from(references.values());
}
