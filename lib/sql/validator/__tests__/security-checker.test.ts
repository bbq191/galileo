/**
 * SecurityChecker 单元测试
 * 严格按照文档规范测试所有安全检查功能
 */

import { SecurityChecker, SecurityCheckConfig } from '../security-checker';
import { SecurityIssue } from '../types';

// 简单的测试辅助函数
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`断言失败: ${message}`);
  }
}

let passedTests = 0;
let failedTests = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failedTests++;
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runAllTests() {
  console.log('\n=== SecurityChecker 单元测试 ===\n');

  const checker = new SecurityChecker();

  // 1. 基本功能测试
  console.log('\n【基本功能测试】');

  await runTest('应该能够创建 SecurityChecker 实例', async () => {
    assert(checker !== null && checker !== undefined, '实例创建失败');
    assert(checker instanceof SecurityChecker, '实例类型错误');
  });

  await runTest('合法的 SELECT 语句不应该产生任何安全问题', async () => {
    const sql = 'SELECT * FROM users WHERE id = 1';
    const issues = await checker.check(sql);
    assert(issues.length === 0, `应该没有安全问题，实际有 ${issues.length} 个`);
  });

  // 2. 危险操作检测
  console.log('\n【危险操作检测】');

  await runTest('应该检测 DROP 操作', async () => {
    const sql = 'DROP TABLE users';
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到安全问题');
    const dropIssue = issues.find(i => i.message.includes('DROP'));
    assert(dropIssue !== undefined, '应该检测到 DROP 操作');
    assert(dropIssue?.severity === 'critical', 'DROP 操作应该是 critical 级别');
  });

  await runTest('应该检测 DELETE 操作', async () => {
    const sql = 'DELETE FROM users WHERE id = 1';
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到安全问题');
    const deleteIssue = issues.find(i => i.message.includes('DELETE'));
    assert(deleteIssue !== undefined, '应该检测到 DELETE 操作');
  });

  await runTest('应该检测 UPDATE 操作', async () => {
    const sql = 'UPDATE users SET name = "test" WHERE id = 1';
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到安全问题');
    const updateIssue = issues.find(i => i.message.includes('UPDATE'));
    assert(updateIssue !== undefined, '应该检测到 UPDATE 操作');
  });

  await runTest('应该检测 INSERT 操作', async () => {
    const sql = 'INSERT INTO users (name) VALUES ("test")';
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到安全问题');
    const insertIssue = issues.find(i => i.message.includes('INSERT'));
    assert(insertIssue !== undefined, '应该检测到 INSERT 操作');
  });

  // 3. SQL 注入检测
  console.log('\n【SQL 注入检测】');

  await runTest('应该检测 UNION SELECT 注入', async () => {
    const sql = "SELECT * FROM users WHERE id = 1 UNION SELECT * FROM admin";
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到 SQL 注入');
    const injectionIssue = issues.find(i => i.type === 'sql_injection');
    assert(injectionIssue !== undefined, '应该检测到注入特征');
  });

  await runTest('应该检测 OR 1=1 恒真条件', async () => {
    const sql = "SELECT * FROM users WHERE id = 1 OR 1=1";
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到 SQL 注入');
  });

  await runTest('应该检测单行注释 (--)', async () => {
    const sql = "SELECT * FROM users WHERE id = 1 -- AND status = 'active'";
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到注释注入');
  });

  await runTest('应该检测多语句注入', async () => {
    const sql = "SELECT * FROM users; DROP TABLE users;";
    const issues = await checker.check(sql);
    assert(issues.length >= 2, '应该检测到多语句和 DROP 操作');
  });

  // 4. 多语句执行检测
  console.log('\n【多语句执行检测】');

  await runTest('应该检测多个分号分隔的语句', async () => {
    const sql = "SELECT * FROM users; SELECT * FROM admin;";
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到多语句执行');
    const multiStatementIssue = issues.find(i => i.message.includes('多语句'));
    assert(multiStatementIssue !== undefined, '应该有多语句警告');
  });

  await runTest('不应该误报字符串中的分号', async () => {
    const sql = "SELECT * FROM users WHERE email = 'test@example.com; DROP TABLE'";
    const issues = await checker.check(sql);
    const multiStatementIssue = issues.find(i => i.message.includes('多语句'));
    assert(multiStatementIssue === undefined, '不应该误报字符串中的分号');
  });

  await runTest('应该正确处理末尾的单个分号', async () => {
    const sql = "SELECT * FROM users WHERE id = 1;";
    const issues = await checker.check(sql);
    const multiStatementIssue = issues.find(i => i.message.includes('多语句'));
    assert(multiStatementIssue === undefined, '末尾单个分号是合法的');
  });

  // 5. 信息泄露风险检测
  console.log('\n【信息泄露风险检测】');

  await runTest('应该检测 information_schema 访问', async () => {
    const sql = "SELECT * FROM information_schema.tables";
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到信息泄露风险');
    const disclosureIssue = issues.find(i => i.type === 'information_disclosure');
    assert(disclosureIssue !== undefined, '应该有信息泄露警告');
    assert(disclosureIssue?.message.includes('information_schema'), '应该提到 information_schema');
  });

  await runTest('应该检测 mysql 系统库访问', async () => {
    const sql = "SELECT * FROM mysql.user";
    const issues = await checker.check(sql);
    const disclosureIssue = issues.find(i => i.type === 'information_disclosure');
    assert(disclosureIssue !== undefined, '应该检测到 mysql 系统库访问');
  });

  await runTest('当配置允许系统表访问时不应该报告信息泄露', async () => {
    const configuredChecker = new SecurityChecker({ allowSystemTables: true });
    const sql = "SELECT * FROM information_schema.tables";
    const issues = await configuredChecker.check(sql);
    const disclosureIssue = issues.find(i => i.type === 'information_disclosure');
    assert(disclosureIssue === undefined, '允许系统表访问时不应该报告');
  });

  // 6. 敏感函数检测
  console.log('\n【敏感函数检测】');

  await runTest('应该检测 LOAD_FILE 函数', async () => {
    const sql = "SELECT LOAD_FILE('/etc/passwd')";
    const issues = await checker.check(sql);
    assert(issues.length > 0, '应该检测到敏感函数');
    const funcIssue = issues.find(i => i.message.includes('LOAD_FILE'));
    assert(funcIssue !== undefined, '应该检测到 LOAD_FILE');
    assert(funcIssue?.severity === 'critical', 'LOAD_FILE 应该是 critical 级别');
  });

  await runTest('应该检测 INTO OUTFILE 语句', async () => {
    const sql = "SELECT * FROM users INTO OUTFILE '/tmp/users.txt'";
    const issues = await checker.check(sql);
    const funcIssue = issues.find(i => i.message.includes('INTO OUTFILE'));
    assert(funcIssue !== undefined, '应该检测到 INTO OUTFILE');
  });

  await runTest('应该检测 SLEEP 函数（时间延迟攻击）', async () => {
    const sql = "SELECT * FROM users WHERE id = 1 AND SLEEP(5)";
    const issues = await checker.check(sql);
    const funcIssue = issues.find(i => i.message.includes('SLEEP'));
    assert(funcIssue !== undefined, '应该检测到 SLEEP 函数');
  });

  // 7. 严格模式测试
  console.log('\n【严格模式测试】');

  await runTest('严格模式下应该检测十六进制编码', async () => {
    const strictChecker = new SecurityChecker({ strictMode: true });
    const sql = "SELECT * FROM users WHERE name = 0x61646D696E";
    const issues = await strictChecker.check(sql);
    const hexIssue = issues.find(i => i.message.includes('十六进制'));
    assert(hexIssue !== undefined, '严格模式应该检测十六进制编码');
  });

  await runTest('非严格模式下不应该报告十六进制编码', async () => {
    const normalChecker = new SecurityChecker({ strictMode: false });
    const sql = "SELECT * FROM users WHERE name = 0x61646D696E";
    const issues = await normalChecker.check(sql);
    const hexIssue = issues.find(i => i.message.includes('十六进制'));
    assert(hexIssue === undefined, '非严格模式不应该报告十六进制');
  });

  // 8. 辅助方法测试
  console.log('\n【辅助方法测试】');

  await runTest('hasCriticalIssues 应该正确检测致命问题', async () => {
    const sql = 'DROP TABLE users';
    const issues = await checker.check(sql);
    assert(checker.hasCriticalIssues(issues) === true, '应该检测到致命问题');
  });

  await runTest('hasCriticalIssues 对无问题的 SQL 应该返回 false', async () => {
    const sql = 'SELECT * FROM users WHERE id = 1';
    const issues = await checker.check(sql);
    assert(checker.hasCriticalIssues(issues) === false, '安全的 SQL 不应该有致命问题');
  });

  await runTest('getIssueSeverityStats 应该正确统计各级别问题数量', async () => {
    const sql = 'DROP TABLE users';
    const issues = await checker.check(sql);
    const stats = checker.getIssueSeverityStats(issues);
    assert('critical' in stats, '应该有 critical 统计');
    assert(stats.critical > 0, 'critical 数量应该大于 0');
  });

  // 9. 边界情况测试
  console.log('\n【边界情况测试】');

  await runTest('应该处理空 SQL 字符串', async () => {
    const sql = '';
    const issues = await checker.check(sql);
    assert(issues.length === 0, '空字符串不应该产生错误');
  });

  await runTest('应该正确处理大小写混合的关键字', async () => {
    const sql = 'DrOp TaBlE users';
    const issues = await checker.check(sql);
    const dropIssue = issues.find(i => i.message.includes('DROP'));
    assert(dropIssue !== undefined, '应该检测到大小写混合的 DROP');
  });

  await runTest('应该避免误报表名包含危险关键字的情况', async () => {
    const sql = 'SELECT * FROM user_updates WHERE id = 1';
    const issues = await checker.check(sql);
    const updateIssue = issues.find(i =>
      i.type === 'dangerous_operation' && i.message.includes('UPDATE')
    );
    assert(updateIssue === undefined, '不应该误报表名中的关键字');
  });

  // 总结
  console.log('\n' + '='.repeat(50));
  console.log(`测试完成: ${passedTests + failedTests} 个测试`);
  console.log(`✓ 通过: ${passedTests} 个`);
  console.log(`✗ 失败: ${failedTests} 个`);
  console.log('='.repeat(50) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
