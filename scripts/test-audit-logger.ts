/**
 * 审计日志模块集成测试脚本
 * 测试审计日志的记录、查询和分析功能
 */

import prisma from '@/lib/prisma/client';
import { AuditLogger, AuditAnalyzer } from '../lib/audit';
import type { AuditLog } from '../lib/audit/types';

async function testAuditLogger() {
  console.log('========================================');
  console.log('审计日志模块集成测试');
  console.log('========================================\n');

  const auditLogger = new AuditLogger(prisma);
  const auditAnalyzer = new AuditAnalyzer(prisma);

  try {
    // ============================================
    // 测试 1: 记录审计日志
    // ============================================
    console.log('测试 1: 记录审计日志...');

    const testLogs: AuditLog[] = [
      {
        sessionId: 'test-session-001',
        userId: 'user-001',
        userName: 'Test User 1',
        naturalLanguageQuery: '查询最近一个月销售额TOP10的产品',
        intent: {
          type: 'aggregate',
          entities: {
            databases: ['sales_db', 'product_db'],
            tables: ['orders', 'products'],
            columns: ['product_name', 'order_amount'],
          },
          conditions: {
            timeRange: {
              relative: '最近一个月',
            },
            orderBy: {
              column: 'order_amount',
              direction: 'DESC',
            },
            limit: 10,
          },
          aggregations: {
            function: 'SUM',
            column: 'order_amount',
            groupBy: ['product_name'],
          },
        },
        generatedSQL: 'SELECT p.product_name, SUM(o.amount) as total FROM sales_db.orders o INNER JOIN product_db.products p ON o.product_id = p.id WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH) GROUP BY p.product_name ORDER BY total DESC LIMIT 10',
        executionResult: {
          success: true,
          rowCount: 10,
        },
        metadata: {
          usedDatabases: ['sales_db', 'product_db'],
          usedTables: ['orders', 'products'],
          usedColumns: ['product_name', 'order_amount', 'product_id'],
        },
        performance: {
          intentRecognitionTime: 120,
          sqlGenerationTime: 450,
          validationTime: 80,
          executionTime: 89,
          totalTime: 739,
        },
        timestamp: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Test Browser',
      },
      {
        sessionId: 'test-session-002',
        userId: 'user-001',
        userName: 'Test User 1',
        naturalLanguageQuery: '统计近7天每个分类的订单数量',
        intent: {
          type: 'aggregate',
          entities: {
            databases: ['sales_db'],
            tables: ['orders'],
            columns: ['category', 'order_id'],
          },
          conditions: {
            timeRange: {
              relative: '近7天',
            },
          },
          aggregations: {
            function: 'COUNT',
            column: 'order_id',
            groupBy: ['category'],
          },
        },
        generatedSQL: 'SELECT category, COUNT(order_id) as count FROM sales_db.orders WHERE order_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY category',
        executionResult: {
          success: true,
          rowCount: 5,
        },
        metadata: {
          usedDatabases: ['sales_db'],
          usedTables: ['orders'],
          usedColumns: ['category', 'order_id', 'order_date'],
        },
        performance: {
          intentRecognitionTime: 100,
          sqlGenerationTime: 350,
          validationTime: 60,
          executionTime: 45,
          totalTime: 555,
        },
        timestamp: new Date(Date.now() - 3600000), // 1小时前
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Test Browser',
      },
      {
        sessionId: 'test-session-003',
        userId: 'user-002',
        userName: 'Test User 2',
        naturalLanguageQuery: '查询用户表的所有数据',
        intent: {
          type: 'select',
          entities: {
            databases: ['user_db'],
            tables: ['users'],
          },
          conditions: {},
        },
        generatedSQL: 'SELECT * FROM user_db.users',
        executionResult: {
          success: false,
          error: '表 user_db.users 不存在',
        },
        metadata: {
          usedDatabases: ['user_db'],
          usedTables: ['users'],
          usedColumns: [],
        },
        performance: {
          intentRecognitionTime: 90,
          sqlGenerationTime: 300,
          validationTime: 70,
          executionTime: 0,
          totalTime: 460,
        },
        timestamp: new Date(Date.now() - 7200000), // 2小时前
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Test Browser',
      },
      {
        sessionId: 'test-session-004',
        userId: 'user-001',
        userName: 'Test User 1',
        naturalLanguageQuery: '查询最近一个月销售额TOP10的产品',
        intent: {
          type: 'aggregate',
          entities: {
            databases: ['sales_db', 'product_db'],
            tables: ['orders', 'products'],
          },
          conditions: {},
        },
        generatedSQL: 'SELECT p.product_name, SUM(o.amount) as total FROM sales_db.orders o INNER JOIN product_db.products p ON o.product_id = p.id WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH) GROUP BY p.product_name ORDER BY total DESC LIMIT 10',
        executionResult: {
          success: true,
          rowCount: 10,
        },
        metadata: {
          usedDatabases: ['sales_db', 'product_db'],
          usedTables: ['orders', 'products'],
          usedColumns: ['product_name', 'order_amount'],
        },
        performance: {
          intentRecognitionTime: 115,
          sqlGenerationTime: 440,
          validationTime: 75,
          executionTime: 92,
          totalTime: 722,
        },
        timestamp: new Date(Date.now() - 10800000), // 3小时前
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Test Browser',
      },
    ];

    for (const log of testLogs) {
      await auditLogger.log(log);
    }

    console.log(`✓ 成功记录 ${testLogs.length} 条审计日志\n`);

    // ============================================
    // 测试 2: 查询审计日志
    // ============================================
    console.log('测试 2: 查询审计日志...');

    const allLogs = await auditLogger.query({
      limit: 10,
      page: 1,
    });

    console.log(`✓ 查询到 ${allLogs.length} 条审计日志`);
    console.log(`  - 最新查询: ${allLogs[0]?.naturalLanguageQuery}\n`);

    // ============================================
    // 测试 3: 带分页的查询
    // ============================================
    console.log('测试 3: 带分页信息的查询...');

    const paginatedLogs = await auditLogger.queryWithPagination({
      limit: 2,
      page: 1,
    });

    console.log(`✓ 查询到 ${paginatedLogs.data.length} 条记录`);
    console.log(`  - 总记录数: ${paginatedLogs.pagination.totalCount}`);
    console.log(`  - 总页数: ${paginatedLogs.pagination.totalPages}`);
    console.log(`  - 当前页: ${paginatedLogs.pagination.page}\n`);

    // ============================================
    // 测试 4: 按用户查询
    // ============================================
    console.log('测试 4: 按用户查询历史...');

    const userHistory = await auditLogger.getUserHistory('user-001', {
      limit: 10,
    });

    console.log(`✓ 用户 user-001 的查询历史: ${userHistory.length} 条\n`);

    // ============================================
    // 测试 5: 查询失败的日志
    // ============================================
    console.log('测试 5: 查询失败的日志...');

    const failedQueries = await auditLogger.getFailedQueries({
      limit: 10,
    });

    console.log(`✓ 查询到 ${failedQueries.length} 条失败日志`);
    if (failedQueries.length > 0) {
      console.log(`  - 失败原因: ${failedQueries[0].executionResult.error}\n`);
    }

    // ============================================
    // 测试 6: 查询慢查询
    // ============================================
    console.log('测试 6: 查询慢查询（>500ms）...');

    const slowQueries = await auditLogger.getSlowQueries(500, {
      limit: 10,
    });

    console.log(`✓ 查询到 ${slowQueries.length} 条慢查询`);
    if (slowQueries.length > 0) {
      console.log(`  - 最慢查询耗时: ${slowQueries[0].performance.totalTime}ms\n`);
    }

    // ============================================
    // 测试 7: 获取统计数据
    // ============================================
    console.log('测试 7: 获取统计数据...');

    const stats = await auditLogger.getStats({});

    console.log(`✓ 统计数据:`);
    console.log(`  - 总查询数: ${stats.totalQueries}`);
    console.log(`  - 成功查询: ${stats.successQueries}`);
    console.log(`  - 失败查询: ${stats.failedQueries}`);
    console.log(`  - 成功率: ${(stats.successRate * 100).toFixed(2)}%`);
    console.log(`  - 平均执行时间: ${stats.avgExecutionTime.toFixed(2)}ms\n`);

    // ============================================
    // 测试 8: 分析查询模式
    // ============================================
    console.log('测试 8: 分析查询模式...');

    const patterns = await auditAnalyzer.analyzeQueryPatterns();

    console.log(`✓ 识别到 ${patterns.length} 种查询模式:`);
    patterns.slice(0, 3).forEach((pattern) => {
      console.log(`  - ${pattern.pattern}: ${pattern.count} 次`);
    });
    console.log();

    // ============================================
    // 测试 9: 分析用户活动
    // ============================================
    console.log('测试 9: 分析用户活动...');

    const userActivity = await auditAnalyzer.analyzeUserActivity();

    console.log(`✓ 活跃用户: ${userActivity.length} 个`);
    userActivity.slice(0, 3).forEach((user) => {
      console.log(`  - ${user.userName || user.userId}: ${user.totalQueries} 次查询`);
    });
    console.log();

    // ============================================
    // 测试 10: 分析数据库使用情况
    // ============================================
    console.log('测试 10: 分析数据库使用情况...');

    const dbUsage = await auditAnalyzer.analyzeDatabaseUsage();

    console.log(`✓ 数据库使用统计:`);
    dbUsage.slice(0, 3).forEach((db) => {
      console.log(`  - ${db.databaseName}: ${db.queryCount} 次查询, 成功率 ${(db.successRate * 100).toFixed(2)}%`);
    });
    console.log();

    // ============================================
    // 测试 11: 分析热门查询
    // ============================================
    console.log('测试 11: 分析热门查询...');

    const popularQueries = await auditAnalyzer.analyzePopularQueries();

    console.log(`✓ 热门查询 TOP ${popularQueries.length}:`);
    popularQueries.slice(0, 3).forEach((query, index) => {
      console.log(`  ${index + 1}. "${query.naturalLanguageQuery}" - ${query.count} 次`);
    });
    console.log();

    // ============================================
    // 测试 12: 分析表使用统计
    // ============================================
    console.log('测试 12: 分析表使用统计...');

    const tableUsage = await auditAnalyzer.analyzeTableUsage();

    console.log(`✓ 表使用统计:`);
    tableUsage.slice(0, 3).forEach((table) => {
      console.log(`  - ${table.databaseName}.${table.tableName}: ${table.queryCount} 次查询`);
    });
    console.log();

    // ============================================
    // 测试 13: 识别异常查询
    // ============================================
    console.log('测试 13: 识别异常查询...');

    const anomalousQueries = await auditAnalyzer.identifyAnomalousQueries(1000, 5);

    console.log(`✓ 识别到 ${anomalousQueries.length} 条异常查询`);
    console.log();

    console.log('========================================');
    console.log('所有测试完成！');
    console.log('========================================\n');

  } catch (error) {
    console.error('测试过程中出现错误:', error);
    throw error;
  } finally {
    await auditLogger.disconnect();
    await auditAnalyzer.disconnect();
  }
}

// 运行测试
testAuditLogger()
  .then(() => {
    console.log('测试成功完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('测试失败:', error);
    process.exit(1);
  });
