/**
 * 连接管理器测试
 * 使用示例和基础测试用例
 */

import connectionManager from '../connection-manager';
import type { DatabaseConfig } from '../connection-config';
import { encryptPassword, decryptPassword, generateEncryptionKey } from '../encryption';

/**
 * 测试加密功能
 */
export function testEncryption() {
  console.log('\n===== 测试加密功能 =====');

  // 测试密码加密
  const password = 'my_secure_password';
  const encrypted = encryptPassword(password);
  console.log('原始密码:', password);
  console.log('加密后:', encrypted);

  // 测试密码解密
  const decrypted = decryptPassword(encrypted);
  console.log('解密后:', decrypted);
  console.log('加密解密是否匹配:', password === decrypted ? '✓' : '✗');

  // 测试生成随机密钥
  const key = generateEncryptionKey(32);
  console.log('生成的随机密钥:', key);
  console.log('密钥长度:', key.length);
}

/**
 * 测试连接管理器
 */
export async function testConnectionManager() {
  console.log('\n===== 测试连接管理器 =====');

  try {
    // 测试连接配置
    const config: DatabaseConfig = {
      id: 'test-1',
      name: 'Test Database',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '', // 根据实际情况修改
      databases: ['galileo_metadata'],
    };

    console.log('\n1. 创建连接...');
    await connectionManager.createConnection(config);
    console.log('✓ 连接创建成功');

    console.log('\n2. 测试连接健康状态...');
    const health = await connectionManager.testConnection('test-1');
    console.log('健康检查结果:', {
      healthy: health.healthy,
      responseTime: `${health.responseTime}ms`,
      error: health.error || '无',
    });

    if (health.healthy) {
      console.log('✓ 连接健康');

      console.log('\n3. 获取连接并执行查询...');
      const pool = await connectionManager.getConnection('test-1');

      // 测试查询数据库列表
      const [databases] = await pool.query<any[]>('SHOW DATABASES');
      console.log(`✓ 找到 ${databases.length} 个数据库`);

      // 测试查询表信息
      const tableInfo = await pool.queryOne<any>(
        `SELECT COUNT(*) as table_count
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ?`,
        ['galileo_metadata']
      );
      console.log(`✓ galileo_metadata 数据库有 ${tableInfo?.table_count || 0} 张表`);

      console.log('\n4. 获取连接统计...');
      const stats = connectionManager.getConnectionStats('test-1');
      console.log('连接池统计:', stats);
    } else {
      console.error('✗ 连接不健康:', health.error);
    }

    console.log('\n5. 关闭连接...');
    await connectionManager.closeConnection('test-1');
    console.log('✓ 连接已关闭');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

/**
 * 运行所有测试
 */
export async function runTests() {
  console.log('========================================');
  console.log('数据库连接管理器测试');
  console.log('========================================');

  // 测试加密
  testEncryption();

  // 测试连接管理器（需要数据库运行）
  // 取消注释以下行运行连接测试
  // await testConnectionManager();

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================\n');
}

// 如果直接运行此文件
if (require.main === module) {
  runTests()
    .catch(console.error)
    .finally(() => process.exit(0));
}
