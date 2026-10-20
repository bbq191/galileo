/**
 * 表结构哈希
 *
 * 用于增量同步：哈希未变化的表跳过字段采集与写入。
 */

import crypto from 'crypto';

/**
 * 去掉 DDL 中与结构无关、会随数据写入变化的部分
 *
 * MySQL 的 SHOW CREATE TABLE 包含 `AUTO_INCREMENT=当前值`，每次插入数据都会变化，
 * 不去掉的话所有在写入的表每次同步都会被判定为结构变更。
 */
export function normalizeDDL(ddl: string): string {
  return ddl.replace(/\s+AUTO_INCREMENT=\d+/gi, '').trim();
}

/**
 * 计算结构哈希；DDL 为空（获取失败）时返回 null，调用方应按「结构未知」处理并全量同步
 */
export function computeStructureHash(ddl: string | null | undefined): string | null {
  if (!ddl || !ddl.trim()) return null;
  return crypto.createHash('sha256').update(normalizeDDL(ddl)).digest('hex');
}
