/**
 * SQL 缓存变体（无副作用模块，可被生成器与管道阶段直接引用）
 */
/**
 * SQL 缓存变体
 *
 * 生成的 SQL 带库名前缀，取决于检索到的表（不同数据源可能有同名库表），
 * 也取决于注入提示词的业务规则；只按意图缓存会把为数据源 A 生成的 SQL 返回给数据源 B 的查询。
 */
export function buildSQLCacheVariant(
  context: { tables: Array<{ databaseName: string; tableName: string; database?: { sourceId: number } }> },
  extra: string = ''
): string {
  const tables = context.tables
    .map((t) => `${t.database?.sourceId ?? '?'}:${t.databaseName}.${t.tableName}`)
    .sort()
    .join(',');
  return extra ? `${tables}|${extra}` : tables;
}
