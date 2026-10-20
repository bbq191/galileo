/**
 * SQLValidator 针对生成器实际产出的 SQL 形态的回归测试
 * （切换 SQL_VALIDATOR_MODE=enforce 前，确认常见查询不会被误拦截）
 */
import { describe, it, expect, jest } from '@jest/globals';

// 性能分析会查询元数据库中的索引信息，这里返回空结果
jest.mock('@/lib/prisma/client', () => ({
  __esModule: true,
  default: { tableMeta: { findFirst: async () => null }, $queryRaw: async () => [] },
}));

import { SQLValidator } from '@/lib/sql/validator/sql-validator';
import type { UserPermissions } from '@/lib/sql/validator/types';

const context: any = {
  tables: [
    { databaseName: 'db_live', tableName: 'tb_live_all_room', columns: [{ columnName: 'live_id' }, { columnName: 'starttime' }] },
    { databaseName: 'shop', tableName: 'users', columns: [{ columnName: 'id' }, { columnName: 'name' }] },
    { databaseName: 'shop', tableName: 'orders', columns: [{ columnName: 'id' }, { columnName: 'user_id' }, { columnName: 'amount' }] },
  ],
  relationships: [],
  columns: [],
  estimatedComplexity: 'low',
};

const unrestricted: UserPermissions = { unrestricted: true, canAccessTable: () => true };
const validator = new SQLValidator();
const validate = (sql: string, permissions = unrestricted) => validator.validate(sql, context, permissions);

describe('SQLValidator - 应通过', () => {
  it.each([
    ['计数', 'SELECT COUNT(*) FROM `db_live`.`tb_live_all_room`'],
    ['条件', 'SELECT COUNT(*) FROM `db_live`.`tb_live_all_room` WHERE live_id > 100'],
    ['排序分页', 'SELECT * FROM `db_live`.`tb_live_all_room` ORDER BY live_id DESC LIMIT 10'],
    [
      '按月分组',
      "SELECT DATE_FORMAT(starttime, '%Y-%m') AS month, COUNT(*) AS count FROM `db_live`.`tb_live_all_room` WHERE YEAR(starttime) = 2025 GROUP BY month ORDER BY month ASC",
    ],
    [
      '带库名前缀的别名 JOIN（曾被误判为「表 u.name 不存在」）',
      'SELECT u.name, SUM(o.amount) AS total FROM `shop`.`users` u JOIN `shop`.`orders` o ON u.id = o.user_id GROUP BY u.name',
    ],
    ['无前缀的别名 JOIN', 'SELECT u.name, SUM(o.amount) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name'],
    [
      '子查询',
      'SELECT t.name FROM (SELECT u.name FROM `shop`.`users` u) t',
    ],
    [
      '分表 UNION ALL 合并（曾被判为 SQL 注入）',
      'SELECT COUNT(*) AS total FROM (SELECT id FROM `shop`.`orders` UNION ALL SELECT id FROM `shop`.`users`) AS t',
    ],
    [
      '字符串中出现系统库名',
      "SELECT name FROM `shop`.`users` WHERE name = 'mysql'",
    ],
  ])('%s', async (_label, sql) => {
    const result = await validate(sql);
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });
});

describe('SQLValidator - 应拦截', () => {
  it.each([
    ['元数据中不存在的表', 'SELECT * FROM `shop`.`secrets`'],
    ['JOIN 不存在的表', 'SELECT u.name FROM `shop`.`users` u JOIN `shop`.`secrets` s ON u.id = s.user_id'],
    ['非 SELECT 语句', 'DELETE FROM `shop`.`users`'],
    ['堆叠语句', 'SELECT 1 FROM `shop`.`users`; DROP TABLE `shop`.`users`'],
    ['时间盲注函数', 'SELECT SLEEP(10) FROM `shop`.`users`'],
    ['UNION 读取系统表', 'SELECT name FROM `shop`.`users` UNION SELECT table_name FROM information_schema.tables'],
    ['直接读取系统库', 'SELECT * FROM mysql.user'],
    ['UNION 读取元数据外的表', 'SELECT name FROM `shop`.`users` UNION ALL SELECT secret FROM `shop`.`secrets`'],
  ])('%s', async (_label, sql) => {
    expect((await validate(sql)).isValid).toBe(false);
  });
});

describe('PermissionChecker', () => {
  it('受限权限下拒绝无权访问的表', async () => {
    const restricted: UserPermissions = {
      allowedTables: ['shop.users'],
      canAccessTable: (db, table) => `${db}.${table}` === 'shop.users',
    };

    const result = await validate('SELECT amount FROM orders', restricted);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'permission' })]));
  });

  it('受限权限下 SQL 无法解析时拒绝，而不是放行', async () => {
    const restricted: UserPermissions = { allowedTables: ['shop.users'], canAccessTable: () => true };

    // 带库名前缀的 SQL 会绕过 AST 语法校验，但权限检查仍需解析
    const result = await validate('SELECT COUNT(*) FROM `shop`.`users` WHERE name REGEXP BINARY ?? 1', restricted);

    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.message)).toContain('无法解析 SQL，不能确认数据访问权限');
  });
});
