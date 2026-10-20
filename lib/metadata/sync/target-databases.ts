/**
 * 解析数据源配置的目标数据库列表（DataSource.targetDatabases，JSON 字符串数组）
 *
 * @returns 数据库名列表；未配置、为空或格式错误时返回 undefined，表示同步全部数据库
 */
export function parseTargetDatabases(targetDatabases: string | null | undefined): string[] | undefined {
  if (!targetDatabases) return undefined;
  try {
    const parsed = JSON.parse(targetDatabases);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}
