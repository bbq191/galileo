/**
 * 初始化端到端测试数据
 *
 * 创建测试数据库和表，包括：
 * - 单表场景
 * - 多表关联场景
 * - 跨库场景
 */

import { PrismaClient } from '@prisma/client';
import { ConnectionManager } from '@/lib/database/connection-manager';
import mysql from 'mysql2/promise';

const prisma = new PrismaClient();
const connectionManager = new ConnectionManager(prisma);

/**
 * 初始化测试数据
 */
export async function initTestData() {
  console.log('开始初始化测试数据...\n');

  try {
    // 1. 获取第一个可用的数据源
    const dataSources = await prisma.dataSource.findMany({
      where: { status: 'connected' },
      take: 1,
    });

    if (dataSources.length === 0) {
      throw new Error('没有找到可用的数据源，请先配置数据源');
    }

    const dataSource = dataSources[0];
    console.log(`使用数据源: ${dataSource.name} (ID: ${dataSource.id})\n`);

    const connection = await connectionManager.getConnection(dataSource.id);

    // 2. 创建测试数据库
    await createTestDatabases(connection);

    // 3. 创建单表场景的测试数据
    await createSingleTableTestData(connection);

    // 4. 创建多表场景的测试数据
    await createMultiTableTestData(connection);

    // 5. 创建跨库场景的测试数据
    await createCrossDatabaseTestData(connection);

    // 6. 同步元数据到 Galileo
    await syncMetadata(dataSource.id);

    console.log('\n✓ 测试数据初始化完成！');
  } catch (error: any) {
    console.error('初始化测试数据失败:', error);
    throw error;
  }
}

/**
 * 创建测试数据库
 */
async function createTestDatabases(connection: mysql.Connection) {
  console.log('1. 创建测试数据库...');

  const databases = ['test_e2e_db1', 'test_e2e_db2', 'test_e2e_sales', 'test_e2e_products'];

  for (const dbName of databases) {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`  ✓ 创建数据库: ${dbName}`);
  }

  console.log('');
}

/**
 * 创建单表场景测试数据
 */
async function createSingleTableTestData(connection: mysql.Connection) {
  console.log('2. 创建单表场景测试数据...');

  // 用户表
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`test_e2e_db1\`.\`users\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`username\` VARCHAR(50) NOT NULL COMMENT '用户名',
      \`email\` VARCHAR(100) NOT NULL COMMENT '邮箱',
      \`age\` INT COMMENT '年龄',
      \`gender\` ENUM('male', 'female', 'other') COMMENT '性别',
      \`city\` VARCHAR(50) COMMENT '城市',
      \`registration_date\` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
      \`status\` ENUM('active', 'inactive', 'suspended') DEFAULT 'active' COMMENT '状态',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_city\` (\`city\`),
      INDEX \`idx_status\` (\`status\`),
      INDEX \`idx_registration_date\` (\`registration_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户信息表'
  `);

  // 插入测试用户数据
  await connection.query(`
    INSERT IGNORE INTO \`test_e2e_db1\`.\`users\`
    (\`id\`, \`username\`, \`email\`, \`age\`, \`gender\`, \`city\`, \`registration_date\`, \`status\`)
    VALUES
    (1, 'alice', 'alice@example.com', 28, 'female', '北京', '2024-01-15 10:00:00', 'active'),
    (2, 'bob', 'bob@example.com', 35, 'male', '上海', '2024-02-20 14:30:00', 'active'),
    (3, 'charlie', 'charlie@example.com', 42, 'male', '深圳', '2024-03-10 09:15:00', 'active'),
    (4, 'diana', 'diana@example.com', 31, 'female', '北京', '2024-04-05 16:45:00', 'inactive'),
    (5, 'eve', 'eve@example.com', 26, 'female', '上海', '2024-05-12 11:20:00', 'active'),
    (6, 'frank', 'frank@example.com', 39, 'male', '广州', '2024-06-18 13:00:00', 'active'),
    (7, 'grace', 'grace@example.com', 29, 'female', '深圳', '2024-07-22 08:30:00', 'suspended'),
    (8, 'henry', 'henry@example.com', 33, 'male', '杭州', '2024-08-30 15:10:00', 'active'),
    (9, 'iris', 'iris@example.com', 27, 'female', '北京', '2024-09-14 10:40:00', 'active'),
    (10, 'jack', 'jack@example.com', 45, 'male', '成都', '2024-10-25 12:50:00', 'active')
  `);

  console.log('  ✓ 创建用户表并插入10条测试数据');
  console.log('');
}

/**
 * 创建多表场景测试数据（单库多表）
 */
async function createMultiTableTestData(connection: mysql.Connection) {
  console.log('3. 创建多表场景测试数据...');

  // 订单表
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`test_e2e_db1\`.\`orders\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`order_no\` VARCHAR(50) NOT NULL COMMENT '订单号',
      \`user_id\` INT NOT NULL COMMENT '用户ID',
      \`total_amount\` DECIMAL(10, 2) NOT NULL COMMENT '订单总金额',
      \`order_date\` DATETIME NOT NULL COMMENT '下单时间',
      \`status\` ENUM('pending', 'paid', 'shipped', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '订单状态',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_user_id\` (\`user_id\`),
      INDEX \`idx_order_date\` (\`order_date\`),
      INDEX \`idx_status\` (\`status\`),
      FOREIGN KEY (\`user_id\`) REFERENCES \`test_e2e_db1\`.\`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表'
  `);

  // 插入测试订单数据
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  await connection.query(`
    INSERT IGNORE INTO \`test_e2e_db1\`.\`orders\`
    (\`id\`, \`order_no\`, \`user_id\`, \`total_amount\`, \`order_date\`, \`status\`)
    VALUES
    (1, 'ORD001', 1, 299.00, ?, 'completed'),
    (2, 'ORD002', 1, 1588.00, ?, 'completed'),
    (3, 'ORD003', 2, 89.90, ?, 'completed'),
    (4, 'ORD004', 3, 3999.00, ?, 'shipped'),
    (5, 'ORD005', 2, 156.50, ?, 'completed'),
    (6, 'ORD006', 4, 678.00, ?, 'cancelled'),
    (7, 'ORD007', 5, 2340.00, ?, 'completed'),
    (8, 'ORD008', 3, 445.00, ?, 'completed'),
    (9, 'ORD009', 6, 890.00, ?, 'paid'),
    (10, 'ORD010', 1, 234.00, ?, 'pending'),
    (11, 'ORD011', 8, 1245.00, ?, 'completed'),
    (12, 'ORD012', 9, 567.00, ?, 'completed'),
    (13, 'ORD013', 2, 789.00, ?, 'shipped'),
    (14, 'ORD014', 5, 3456.00, ?, 'completed'),
    (15, 'ORD015', 10, 123.00, ?, 'completed')
  `, [
    last30Days, last30Days, last30Days, last30Days, last30Days,
    last30Days, last30Days, last30Days, last30Days, now,
    last30Days, last30Days, last30Days, last30Days, last30Days
  ]);

  console.log('  ✓ 创建订单表并插入15条测试数据');
  console.log('');
}

/**
 * 创建跨库场景测试数据
 */
async function createCrossDatabaseTestData(connection: mysql.Connection) {
  console.log('4. 创建跨库场景测试数据...');

  // 销售数据库 - 订单明细表
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`test_e2e_sales\`.\`order_items\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`order_id\` INT NOT NULL COMMENT '订单ID',
      \`product_id\` INT NOT NULL COMMENT '产品ID',
      \`quantity\` INT NOT NULL COMMENT '数量',
      \`unit_price\` DECIMAL(10, 2) NOT NULL COMMENT '单价',
      \`subtotal\` DECIMAL(10, 2) NOT NULL COMMENT '小计',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_order_id\` (\`order_id\`),
      INDEX \`idx_product_id\` (\`product_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单明细表'
  `);

  // 产品数据库 - 产品表
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`test_e2e_products\`.\`products\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`product_name\` VARCHAR(100) NOT NULL COMMENT '产品名称',
      \`category\` VARCHAR(50) NOT NULL COMMENT '分类',
      \`price\` DECIMAL(10, 2) NOT NULL COMMENT '价格',
      \`stock\` INT NOT NULL DEFAULT 0 COMMENT '库存',
      \`brand\` VARCHAR(50) COMMENT '品牌',
      \`description\` TEXT COMMENT '描述',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_category\` (\`category\`),
      INDEX \`idx_brand\` (\`brand\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品信息表'
  `);

  // 插入产品数据
  await connection.query(`
    INSERT IGNORE INTO \`test_e2e_products\`.\`products\`
    (\`id\`, \`product_name\`, \`category\`, \`price\`, \`stock\`, \`brand\`, \`description\`)
    VALUES
    (1, 'iPhone 15 Pro', '手机', 7999.00, 100, 'Apple', '最新款iPhone'),
    (2, '小米电视 65寸', '电视', 2999.00, 50, '小米', '65寸4K智能电视'),
    (3, '戴森吸尘器 V15', '家电', 4999.00, 30, 'Dyson', '无线吸尘器'),
    (4, 'MacBook Pro 14', '笔记本', 14999.00, 20, 'Apple', '专业笔记本电脑'),
    (5, 'AirPods Pro 2', '耳机', 1899.00, 200, 'Apple', '主动降噪耳机'),
    (6, '索尼相机 A7M4', '相机', 15999.00, 15, 'Sony', '全画幅微单相机'),
    (7, '小米手环 8', '智能穿戴', 299.00, 500, '小米', '智能手环'),
    (8, 'iPad Air', '平板', 4799.00, 80, 'Apple', '10.9英寸平板电脑'),
    (9, '华为 MatePad', '平板', 2299.00, 60, '华为', '平板电脑'),
    (10, '罗技键盘 MX Keys', '配件', 799.00, 150, '罗技', '无线键盘')
  `);

  // 插入订单明细数据
  await connection.query(`
    INSERT IGNORE INTO \`test_e2e_sales\`.\`order_items\`
    (\`order_id\`, \`product_id\`, \`quantity\`, \`unit_price\`, \`subtotal\`)
    VALUES
    (1, 7, 1, 299.00, 299.00),
    (2, 1, 1, 7999.00, 7999.00),
    (3, 7, 1, 299.00, 299.00),
    (4, 6, 1, 15999.00, 15999.00),
    (5, 5, 2, 1899.00, 3798.00),
    (7, 2, 1, 2999.00, 2999.00),
    (8, 10, 2, 799.00, 1598.00),
    (11, 4, 1, 14999.00, 14999.00),
    (12, 8, 1, 4799.00, 4799.00),
    (14, 3, 1, 4999.00, 4999.00),
    (15, 7, 1, 299.00, 299.00)
  `);

  // 产品分类表（用于测试三表关联）
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`test_e2e_products\`.\`categories\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`category_name\` VARCHAR(50) NOT NULL COMMENT '分类名称',
      \`parent_id\` INT COMMENT '父分类ID',
      \`description\` TEXT COMMENT '描述',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品分类表'
  `);

  await connection.query(`
    INSERT IGNORE INTO \`test_e2e_products\`.\`categories\`
    (\`id\`, \`category_name\`, \`parent_id\`, \`description\`)
    VALUES
    (1, '电子产品', NULL, '所有电子产品'),
    (2, '手机', 1, '智能手机'),
    (3, '电脑', 1, '电脑及配件'),
    (4, '家电', NULL, '家用电器'),
    (5, '智能穿戴', 1, '智能手表、手环等')
  `);

  console.log('  ✓ 创建跨库测试表:');
  console.log('    - test_e2e_sales.order_items (订单明细)');
  console.log('    - test_e2e_products.products (产品)');
  console.log('    - test_e2e_products.categories (分类)');
  console.log('');
}

/**
 * 同步元数据到 Galileo
 */
async function syncMetadata(dataSourceId: number) {
  console.log('5. 同步元数据到 Galileo...');

  // 这里应该触发元数据同步
  // 由于是端到端测试，我们需要确保元数据已经同步
  console.log('  ⚠ 请手动运行元数据同步，或确保自动同步已启用');
  console.log(`  命令: npm run db:migrate:ai 或在界面上触发同步`);
  console.log('');
}

/**
 * 清理测试数据
 */
export async function cleanupTestData() {
  console.log('清理测试数据...\n');

  try {
    const dataSources = await prisma.dataSource.findMany({
      where: { status: 'connected' },
      take: 1,
    });

    if (dataSources.length === 0) {
      console.log('没有找到可用的数据源');
      return;
    }

    const connection = await connectionManager.getConnection(dataSources[0].id);

    const databases = ['test_e2e_db1', 'test_e2e_db2', 'test_e2e_sales', 'test_e2e_products'];

    for (const dbName of databases) {
      await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      console.log(`  ✓ 删除数据库: ${dbName}`);
    }

    // 清理 Galileo 中的元数据
    await prisma.tableMeta.deleteMany({
      where: {
        database: {
          databaseName: {
            in: databases,
          },
        },
      },
    });

    await prisma.databaseMeta.deleteMany({
      where: {
        databaseName: {
          in: databases,
        },
      },
    });

    console.log('\n✓ 测试数据清理完成！');
  } catch (error: any) {
    console.error('清理测试数据失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'cleanup') {
    cleanupTestData()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    initTestData()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}
