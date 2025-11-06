/**
 * 测试 Phase 2.3: SQL 处理服务的 DI 集成
 * 验证所有 SQL 处理服务能否正确通过 DI 容器解析和使用
 */

import 'reflect-metadata';
import { setupDependencyInjection } from '@/lib/di/setup';
import { resolve, DI_TOKENS, isRegistered } from '@/lib/di';
import type { ResultFormatter } from '@/lib/sql/executor/result-formatter';
import type { TimeParser } from '@/lib/nlp/time-parser';
import type { EntityResolver } from '@/lib/nlp/entity-resolver';
import type { CrossDatabaseHandler } from '@/lib/sql/generator/cross-db-handler';
import type { IntentRecognizer } from '@/lib/nlp/intent-recognizer';
import type { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import type { QueryExecutor } from '@/lib/sql/executor/query-executor';

/**
 * 测试服务注册状态
 */
function testServiceRegistration() {
  console.log('\n========== 测试服务注册状态 ==========\n');

  const services = [
    { name: 'ResultFormatter', token: DI_TOKENS.ResultFormatter },
    { name: 'TimeParser', token: DI_TOKENS.TimeParser },
    { name: 'EntityResolver', token: DI_TOKENS.EntityResolver },
    { name: 'CrossDatabaseHandler', token: DI_TOKENS.CrossDatabaseHandler },
    { name: 'IntentRecognizer', token: DI_TOKENS.IntentRecognizer },
    { name: 'SQLGenerator', token: DI_TOKENS.SQLGenerator },
    { name: 'QueryExecutor', token: DI_TOKENS.QueryExecutor },
  ];

  let allRegistered = true;

  for (const service of services) {
    const registered = isRegistered(service.token);
    console.log(`[${registered ? '✅' : '❌'}] ${service.name}: ${registered ? '已注册' : '未注册'}`);
    if (!registered) allRegistered = false;
  }

  return allRegistered;
}

/**
 * 测试服务解析
 */
function testServiceResolution() {
  console.log('\n========== 测试服务解析 ==========\n');

  try {
    // 测试 ResultFormatter
    console.log('[测试] 解析 ResultFormatter...');
    const resultFormatter = resolve<ResultFormatter>(DI_TOKENS.ResultFormatter);
    console.log('[✅] ResultFormatter 解析成功');
    console.log(`    - 类型: ${resultFormatter.constructor.name}`);

    // 测试 TimeParser
    console.log('\n[测试] 解析 TimeParser...');
    const timeParser = resolve<TimeParser>(DI_TOKENS.TimeParser);
    console.log('[✅] TimeParser 解析成功');
    console.log(`    - 类型: ${timeParser.constructor.name}`);

    // 测试 EntityResolver
    console.log('\n[测试] 解析 EntityResolver...');
    const entityResolver = resolve<EntityResolver>(DI_TOKENS.EntityResolver);
    console.log('[✅] EntityResolver 解析成功');
    console.log(`    - 类型: ${entityResolver.constructor.name}`);

    // 测试 CrossDatabaseHandler
    console.log('\n[测试] 解析 CrossDatabaseHandler...');
    const crossDbHandler = resolve<CrossDatabaseHandler>(DI_TOKENS.CrossDatabaseHandler);
    console.log('[✅] CrossDatabaseHandler 解析成功');
    console.log(`    - 类型: ${crossDbHandler.constructor.name}`);

    // 测试 IntentRecognizer
    console.log('\n[测试] 解析 IntentRecognizer...');
    const intentRecognizer = resolve<IntentRecognizer>(DI_TOKENS.IntentRecognizer);
    console.log('[✅] IntentRecognizer 解析成功');
    console.log(`    - 类型: ${intentRecognizer.constructor.name}`);

    // 测试 SQLGenerator
    console.log('\n[测试] 解析 SQLGenerator...');
    const sqlGenerator = resolve<SQLGenerator>(DI_TOKENS.SQLGenerator);
    console.log('[✅] SQLGenerator 解析成功');
    console.log(`    - 类型: ${sqlGenerator.constructor.name}`);

    // 测试 QueryExecutor
    console.log('\n[测试] 解析 QueryExecutor...');
    const queryExecutor = resolve<QueryExecutor>(DI_TOKENS.QueryExecutor);
    console.log('[✅] QueryExecutor 解析成功');
    console.log(`    - 类型: ${queryExecutor.constructor.name}`);

    return true;
  } catch (error) {
    console.error('\n[❌] 服务解析失败:', error);
    return false;
  }
}

/**
 * 测试服务功能
 */
async function testServiceFunctionality() {
  console.log('\n========== 测试服务功能 ==========\n');

  try {
    // 测试 TimeParser 功能
    console.log('[测试] TimeParser.parse() 功能...');
    const timeParser = resolve<TimeParser>(DI_TOKENS.TimeParser);
    const timeResult = timeParser.parse('最近7天');
    console.log('[✅] TimeParser 工作正常');
    console.log(`    - 解析结果: ${JSON.stringify(timeResult, null, 2)}`);

    // 测试 CrossDatabaseHandler 功能
    console.log('\n[测试] CrossDatabaseHandler.analyzeCrossDatabaseQuery() 功能...');
    const crossDbHandler = resolve<CrossDatabaseHandler>(DI_TOKENS.CrossDatabaseHandler);
    const mockIntent = {
      type: 'select' as const,
      entities: {
        tables: ['table1', 'table2'],
      },
      conditions: {},
    };
    const mockContext = {
      tables: [
        { tableName: 'table1', databaseName: 'db1', columns: [] },
        { tableName: 'table2', databaseName: 'db2', columns: [] },
      ],
      relationships: [],
    };
    const analysis = crossDbHandler.analyzeCrossDatabaseQuery(mockIntent as any, mockContext as any);
    console.log('[✅] CrossDatabaseHandler 工作正常');
    console.log(`    - 跨库查询: ${analysis.isCrossDatabase}`);
    console.log(`    - 涉及数据库: ${analysis.databases.join(', ')}`);

    // 测试 ResultFormatter 功能
    console.log('\n[测试] ResultFormatter.formatDataSize() 功能...');
    const resultFormatter = resolve<ResultFormatter>(DI_TOKENS.ResultFormatter);
    const sizeStr = resultFormatter.formatDataSize(1024 * 1024);
    console.log('[✅] ResultFormatter 工作正常');
    console.log(`    - 格式化结果: ${sizeStr}`);

    return true;
  } catch (error) {
    console.error('\n[❌] 服务功能测试失败:', error);
    return false;
  }
}

/**
 * 测试单例模式
 */
function testSingletonPattern() {
  console.log('\n========== 测试单例模式 ==========\n');

  try {
    // 多次解析同一个服务，验证是否返回同一个实例
    const instance1 = resolve<TimeParser>(DI_TOKENS.TimeParser);
    const instance2 = resolve<TimeParser>(DI_TOKENS.TimeParser);
    const isSingleton = instance1 === instance2;

    console.log(`[${isSingleton ? '✅' : '❌'}] TimeParser 单例模式: ${isSingleton ? '是' : '否'}`);

    // 测试其他服务
    const gen1 = resolve<SQLGenerator>(DI_TOKENS.SQLGenerator);
    const gen2 = resolve<SQLGenerator>(DI_TOKENS.SQLGenerator);
    const genSingleton = gen1 === gen2;

    console.log(`[${genSingleton ? '✅' : '❌'}] SQLGenerator 单例模式: ${genSingleton ? '是' : '否'}`);

    return isSingleton && genSingleton;
  } catch (error) {
    console.error('\n[❌] 单例模式测试失败:', error);
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Phase 2.3: SQL 处理服务 DI 集成测试               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // 确保 DI 容器已初始化
  console.log('[初始化] 设置依赖注入容器...\n');
  setupDependencyInjection();

  let allTestsPassed = true;

  // 1. 测试服务注册
  const registrationPassed = testServiceRegistration();
  if (!registrationPassed) {
    console.error('\n❌ 服务注册测试失败');
    allTestsPassed = false;
  }

  // 2. 测试服务解析
  if (registrationPassed) {
    const resolutionPassed = testServiceResolution();
    if (!resolutionPassed) {
      console.error('\n❌ 服务解析测试失败');
      allTestsPassed = false;
    }

    // 3. 测试服务功能
    if (resolutionPassed) {
      const functionalityPassed = await testServiceFunctionality();
      if (!functionalityPassed) {
        console.error('\n❌ 服务功能测试失败');
        allTestsPassed = false;
      }

      // 4. 测试单例模式
      const singletonPassed = testSingletonPattern();
      if (!singletonPassed) {
        console.error('\n❌ 单例模式测试失败');
        allTestsPassed = false;
      }
    }
  }

  // 输出最终结果
  console.log('\n╔════════════════════════════════════════════════════════╗');
  if (allTestsPassed) {
    console.log('║   ✅ 所有测试通过！                                  ║');
    console.log('║   Phase 2.3: SQL 处理服务 DI 集成成功！             ║');
  } else {
    console.log('║   ❌ 测试失败！                                      ║');
    console.log('║   请检查错误日志并修复问题                            ║');
  }
  console.log('╚════════════════════════════════════════════════════════╝\n');

  process.exit(allTestsPassed ? 0 : 1);
}

// 运行测试
main().catch((error) => {
  console.error('\n💥 测试过程中发生致命错误:', error);
  process.exit(1);
});
