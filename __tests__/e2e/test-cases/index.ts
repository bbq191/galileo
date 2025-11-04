/**
 * 端到端测试用例集合
 *
 * 包含50+标准查询场景，覆盖：
 * - 单表查询
 * - 多表JOIN
 * - 跨库查询
 * - 聚合统计
 * - 复杂查询
 */

import { E2ETestCase } from '../utils/test-helpers';

/**
 * 单表查询测试用例
 */
export const singleTableTests: E2ETestCase[] = [
  {
    id: 'single-001',
    category: 'single-table',
    description: '查询所有用户',
    naturalLanguageQuery: '查询所有用户信息',
    expectedSQLPatterns: [/SELECT.*FROM.*users/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'single-002',
    category: 'single-table',
    description: '查询活跃用户',
    naturalLanguageQuery: '查询所有活跃状态的用户',
    expectedSQLPatterns: [/WHERE.*status.*=.*'active'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'single-003',
    category: 'single-table',
    description: '查询北京的用户',
    naturalLanguageQuery: '查询在北京的用户',
    expectedSQLPatterns: [/WHERE.*city.*=.*'北京'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'single-004',
    category: 'single-table',
    description: '查询女性用户',
    naturalLanguageQuery: '查询所有女性用户',
    expectedSQLPatterns: [/WHERE.*gender.*=.*'female'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'single-005',
    category: 'single-table',
    description: '查询年龄大于30的用户',
    naturalLanguageQuery: '查询年龄大于30岁的用户',
    expectedSQLPatterns: [/WHERE.*age\s*>\s*30/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'single-006',
    category: 'single-table',
    description: '查询最近注册的10个用户',
    naturalLanguageQuery: '查询最近注册的10个用户',
    expectedSQLPatterns: [/ORDER BY.*registration_date.*DESC/i, /LIMIT\s+10/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 10,
  },
  {
    id: 'single-007',
    category: 'single-table',
    description: '统计用户总数',
    naturalLanguageQuery: '统计一共有多少个用户',
    expectedSQLPatterns: [/COUNT/i],
    expectedColumns: ['total', 'count'],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
  {
    id: 'single-008',
    category: 'single-table',
    description: '按城市统计用户数',
    naturalLanguageQuery: '按城市统计用户数量',
    expectedSQLPatterns: [/COUNT/i, /GROUP BY.*city/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'single-009',
    category: 'single-table',
    description: '查询用户平均年龄',
    naturalLanguageQuery: '查询用户的平均年龄',
    expectedSQLPatterns: [/AVG.*age/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
  {
    id: 'single-010',
    category: 'single-table',
    description: '查询特定用户',
    naturalLanguageQuery: '查询用户名为alice的用户信息',
    expectedSQLPatterns: [/WHERE.*username.*=.*'alice'/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
];

/**
 * 多表JOIN查询测试用例
 */
export const multiTableTests: E2ETestCase[] = [
  {
    id: 'multi-001',
    category: 'multi-table',
    description: '查询用户的订单',
    naturalLanguageQuery: '查询所有用户的订单信息',
    expectedSQLPatterns: [/JOIN/i, /users/i, /orders/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-002',
    category: 'multi-table',
    description: '查询alice的订单',
    naturalLanguageQuery: '查询alice的所有订单',
    expectedSQLPatterns: [/JOIN/i, /WHERE.*username.*=.*'alice'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-003',
    category: 'multi-table',
    description: '统计每个用户的订单数',
    naturalLanguageQuery: '统计每个用户的订单数量',
    expectedSQLPatterns: [/COUNT/i, /JOIN/i, /GROUP BY/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-004',
    category: 'multi-table',
    description: '统计每个用户的订单总金额',
    naturalLanguageQuery: '统计每个用户的订单总金额',
    expectedSQLPatterns: [/SUM.*total_amount/i, /JOIN/i, /GROUP BY/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-005',
    category: 'multi-table',
    description: '查询有订单的用户',
    naturalLanguageQuery: '查询有订单的用户列表',
    expectedSQLPatterns: [/JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-006',
    category: 'multi-table',
    description: '查询已完成的订单用户',
    naturalLanguageQuery: '查询订单状态为已完成的用户信息',
    expectedSQLPatterns: [/JOIN/i, /WHERE.*status.*=.*'completed'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-007',
    category: 'multi-table',
    description: '查询订单金额大于1000的用户',
    naturalLanguageQuery: '查询订单金额大于1000元的用户',
    expectedSQLPatterns: [/JOIN/i, /WHERE.*total_amount\s*>\s*1000/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-008',
    category: 'multi-table',
    description: '统计北京用户的订单总额',
    naturalLanguageQuery: '统计北京用户的订单总金额',
    expectedSQLPatterns: [/SUM/i, /JOIN/i, /WHERE.*city.*=.*'北京'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-009',
    category: 'multi-table',
    description: '查询最近30天下单的用户',
    naturalLanguageQuery: '查询最近30天有下单的用户',
    expectedSQLPatterns: [/JOIN/i, /WHERE.*order_date/i, /DATE_SUB|INTERVAL/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'multi-010',
    category: 'multi-table',
    description: '查询订单数量TOP5的用户',
    naturalLanguageQuery: '查询订单数量最多的5个用户',
    expectedSQLPatterns: [/COUNT/i, /JOIN/i, /GROUP BY/i, /ORDER BY.*DESC/i, /LIMIT\s+5/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 5,
  },
];

/**
 * 跨库查询测试用例
 */
export const crossDatabaseTests: E2ETestCase[] = [
  {
    id: 'cross-001',
    category: 'cross-database',
    description: '跨库查询订单和产品',
    naturalLanguageQuery: '查询所有订单及对应的产品信息',
    expectedSQLPatterns: [/test_e2e_sales.*order_items/i, /test_e2e_products.*products/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'cross-002',
    category: 'cross-database',
    description: '统计每个产品的销售数量',
    naturalLanguageQuery: '统计每个产品的销售数量',
    expectedSQLPatterns: [/SUM.*quantity/i, /GROUP BY.*product/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'cross-003',
    category: 'cross-database',
    description: '查询销量TOP10的产品',
    naturalLanguageQuery: '查询销售数量最多的10个产品',
    expectedSQLPatterns: [/SUM|COUNT/i, /GROUP BY/i, /ORDER BY.*DESC/i, /LIMIT\s+10/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 10,
  },
  {
    id: 'cross-004',
    category: 'cross-database',
    description: '统计每个产品的销售额',
    naturalLanguageQuery: '统计每个产品的销售总金额',
    expectedSQLPatterns: [/SUM.*subtotal/i, /GROUP BY.*product/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'cross-005',
    category: 'cross-database',
    description: '查询Apple品牌的销售情况',
    naturalLanguageQuery: '查询Apple品牌产品的销售情况',
    expectedSQLPatterns: [/WHERE.*brand.*=.*'Apple'/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'cross-006',
    category: 'cross-database',
    description: '统计手机类产品销售额',
    naturalLanguageQuery: '统计手机分类的产品销售总额',
    expectedSQLPatterns: [/WHERE.*category.*=.*'手机'/i, /SUM/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'cross-007',
    category: 'cross-database',
    description: '查询价格大于5000的产品销售情况',
    naturalLanguageQuery: '查询价格大于5000元的产品销售情况',
    expectedSQLPatterns: [/WHERE.*price\s*>\s*5000/i],
    shouldPass: true,
    minRows: 0,  // 可能没有
  },
  {
    id: 'cross-008',
    category: 'cross-database',
    description: '三表联查：用户-订单-产品',
    naturalLanguageQuery: '查询每个用户购买的产品信息',
    expectedSQLPatterns: [/users/i, /orders|order_items/i, /products/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'cross-009',
    category: 'cross-database',
    description: '查询最近30天的产品销售排行',
    naturalLanguageQuery: '查询最近30天产品销售数量排行TOP10',
    expectedSQLPatterns: [/DATE_SUB|INTERVAL/i, /GROUP BY/i, /ORDER BY.*DESC/i, /LIMIT.*10/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 10,
  },
  {
    id: 'cross-010',
    category: 'cross-database',
    description: '查询北京用户购买的产品',
    naturalLanguageQuery: '查询北京用户购买了哪些产品',
    expectedSQLPatterns: [/WHERE.*city.*=.*'北京'/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
];

/**
 * 聚合统计查询测试用例
 */
export const aggregationTests: E2ETestCase[] = [
  {
    id: 'agg-001',
    category: 'aggregation',
    description: '统计用户总数',
    naturalLanguageQuery: '统计系统中一共有多少用户',
    expectedSQLPatterns: [/COUNT/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
  {
    id: 'agg-002',
    category: 'aggregation',
    description: '统计订单总数',
    naturalLanguageQuery: '统计订单总数',
    expectedSQLPatterns: [/COUNT/i, /orders/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
  {
    id: 'agg-003',
    category: 'aggregation',
    description: '统计订单总金额',
    naturalLanguageQuery: '统计所有订单的总金额',
    expectedSQLPatterns: [/SUM.*total_amount/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
  {
    id: 'agg-004',
    category: 'aggregation',
    description: '统计平均订单金额',
    naturalLanguageQuery: '统计订单的平均金额',
    expectedSQLPatterns: [/AVG.*total_amount/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 1,
  },
  {
    id: 'agg-005',
    category: 'aggregation',
    description: '查询最大订单金额',
    naturalLanguageQuery: '查询金额最大的订单',
    expectedSQLPatterns: [/MAX.*total_amount/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'agg-006',
    category: 'aggregation',
    description: '按状态统计订单数',
    naturalLanguageQuery: '按订单状态统计订单数量',
    expectedSQLPatterns: [/COUNT/i, /GROUP BY.*status/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'agg-007',
    category: 'aggregation',
    description: '按城市统计订单总额',
    naturalLanguageQuery: '按城市统计订单总金额',
    expectedSQLPatterns: [/SUM.*total_amount/i, /GROUP BY.*city/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'agg-008',
    category: 'aggregation',
    description: '统计每个品牌的产品数量',
    naturalLanguageQuery: '统计每个品牌有多少个产品',
    expectedSQLPatterns: [/COUNT/i, /GROUP BY.*brand/i, /products/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'agg-009',
    category: 'aggregation',
    description: '统计每个分类的产品平均价格',
    naturalLanguageQuery: '统计每个产品分类的平均价格',
    expectedSQLPatterns: [/AVG.*price/i, /GROUP BY.*category/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'agg-010',
    category: 'aggregation',
    description: '按月统计订单数量',
    naturalLanguageQuery: '按月份统计订单数量',
    expectedSQLPatterns: [/COUNT/i, /GROUP BY/i, /YEAR|MONTH|DATE_FORMAT/i],
    shouldPass: true,
    minRows: 1,
  },
];

/**
 * 复杂查询测试用例
 */
export const complexTests: E2ETestCase[] = [
  {
    id: 'complex-001',
    category: 'complex',
    description: '查询消费金额TOP5的用户及其订单数',
    naturalLanguageQuery: '查询消费金额最多的5个用户及其订单数量',
    expectedSQLPatterns: [/SUM.*total_amount/i, /COUNT/i, /GROUP BY/i, /ORDER BY.*DESC/i, /LIMIT\s+5/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 5,
  },
  {
    id: 'complex-002',
    category: 'complex',
    description: '查询最近30天销售额TOP10的产品',
    naturalLanguageQuery: '查询最近30天销售额最高的10个产品',
    expectedSQLPatterns: [/DATE_SUB|INTERVAL/i, /SUM/i, /GROUP BY/i, /ORDER BY.*DESC/i, /LIMIT.*10/i],
    shouldPass: true,
    minRows: 1,
    maxRows: 10,
  },
  {
    id: 'complex-003',
    category: 'complex',
    description: '查询平均订单金额大于1000的用户',
    naturalLanguageQuery: '查询平均订单金额大于1000元的用户',
    expectedSQLPatterns: [/AVG.*total_amount/i, /GROUP BY/i, /HAVING/i],
    shouldPass: true,
    minRows: 0,
  },
  {
    id: 'complex-004',
    category: 'complex',
    description: '统计每个城市用户的平均消费',
    naturalLanguageQuery: '统计每个城市用户的平均消费金额',
    expectedSQLPatterns: [/AVG/i, /SUM/i, /GROUP BY.*city/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'complex-005',
    category: 'complex',
    description: '查询购买过Apple产品的用户',
    naturalLanguageQuery: '查询购买过Apple品牌产品的用户列表',
    expectedSQLPatterns: [/WHERE.*brand.*=.*'Apple'/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'complex-006',
    category: 'complex',
    description: '统计每个产品分类的销售额占比',
    naturalLanguageQuery: '统计每个产品分类的销售额和占比',
    expectedSQLPatterns: [/SUM/i, /GROUP BY.*category/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'complex-007',
    category: 'complex',
    description: '查询复购率最高的产品',
    naturalLanguageQuery: '查询被重复购买次数最多的产品',
    expectedSQLPatterns: [/COUNT/i, /GROUP BY.*product/i, /ORDER BY.*DESC/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'complex-008',
    category: 'complex',
    description: '查询活跃用户的平均年龄和订单数',
    naturalLanguageQuery: '查询活跃用户的平均年龄和平均订单数',
    expectedSQLPatterns: [/AVG.*age/i, /COUNT|AVG/i, /WHERE.*status.*=.*'active'/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'complex-009',
    category: 'complex',
    description: '统计最近7天每天的订单数和销售额',
    naturalLanguageQuery: '统计最近7天每天的订单数量和销售总额',
    expectedSQLPatterns: [/COUNT/i, /SUM/i, /GROUP BY/i, /DATE|DAY/i, /DATE_SUB|INTERVAL.*7/i],
    shouldPass: true,
    minRows: 1,
  },
  {
    id: 'complex-010',
    category: 'complex',
    description: '查询订单金额在500-2000之间的用户',
    naturalLanguageQuery: '查询订单金额在500到2000元之间的用户',
    expectedSQLPatterns: [/WHERE.*total_amount.*BETWEEN|AND/i, /JOIN/i],
    shouldPass: true,
    minRows: 1,
  },
];

/**
 * 所有测试用例
 */
export const allTestCases: E2ETestCase[] = [
  ...singleTableTests,
  ...multiTableTests,
  ...crossDatabaseTests,
  ...aggregationTests,
  ...complexTests,
];

/**
 * 按类别获取测试用例
 */
export function getTestCasesByCategory(category: string): E2ETestCase[] {
  return allTestCases.filter(tc => tc.category === category);
}

/**
 * 获取测试用例统计
 */
export function getTestCasesStats() {
  const stats: Record<string, number> = {};

  for (const testCase of allTestCases) {
    stats[testCase.category] = (stats[testCase.category] || 0) + 1;
  }

  return {
    total: allTestCases.length,
    byCategory: stats,
  };
}
