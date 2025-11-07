/**
 * 测试数据库设置和清理工具
 */

import { getDatabase } from '@/lib/di/services/database.service';
import { getConnectionManager } from '@/lib/di/services/connection.service';
import type { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;

/**
 * 获取测试用 Prisma 客户端
 */
export function getTestPrisma(): PrismaClient {
  if (!prismaClient) {
    const dbService = getDatabase();
    prismaClient = dbService.prisma;
  }
  return prismaClient;
}

/**
 * 初始化测试数据库
 * 创建必要的测试数据
 */
export async function setupTestDatabase() {
  const prisma = getTestPrisma();

  console.log('🔧 Initializing test database...');

  // 清理旧的测试数据
  await cleanupTestDatabase();

  console.log('✅ Test database initialized');
}

/**
 * 清理测试数据库
 * 删除所有测试数据
 */
export async function cleanupTestDatabase() {
  const prisma = getTestPrisma();

  console.log('🧹 Cleaning up test database...');

  try {
    // 删除测试数据源相关的所有数据
    const testDataSources = await prisma.dataSource.findMany({
      where: {
        OR: [
          { name: { startsWith: 'test-' } },
          { name: { contains: 'test' } },
        ],
      },
    });

    for (const ds of testDataSources) {
      // 删除关系数据
      await prisma.tableRelationship.deleteMany({
        where: {
          OR: [
            {
              sourceTable: {
                database: {
                  sourceId: ds.id,
                },
              },
            },
            {
              targetTable: {
                database: {
                  sourceId: ds.id,
                },
              },
            },
          ],
        },
      });

      // 删除列元数据
      await prisma.columnMeta.deleteMany({
        where: {
          table: {
            database: {
              sourceId: ds.id,
            },
          },
        },
      });

      // 删除表元数据
      await prisma.tableMeta.deleteMany({
        where: {
          database: {
            sourceId: ds.id,
          },
        },
      });

      // 删除数据库元数据
      await prisma.databaseMeta.deleteMany({
        where: {
          sourceId: ds.id,
        },
      });

      // 关闭连接
      const connectionManager = getConnectionManager();
      const connectionId = ds.id.toString();
      if (await connectionManager.hasConnection(connectionId)) {
        await connectionManager.removeConnection(connectionId);
      }

      // 删除数据源
      await prisma.dataSource.delete({
        where: { id: ds.id },
      });
    }

    // 删除测试审计日志
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { startsWith: 'test-' } },
          { userId: { contains: 'test' } },
          { naturalLanguageQuery: { contains: 'test' } },
        ],
      },
    });

    console.log('✅ Test database cleaned up');
  } catch (error) {
    console.error('❌ Failed to clean up test database:', error);
    throw error;
  }
}

/**
 * 创建测试用的真实数据源
 * 使用真实的数据库连接
 */
export async function createRealTestDataSource() {
  const prisma = getTestPrisma();
  const connectionManager = getConnectionManager();

  const timestamp = Date.now();
  const dataSourceName = `test-real-${timestamp}`;

  // 检查环境变量
  const host = process.env.TEST_DB_HOST || 'localhost';
  const port = parseInt(process.env.TEST_DB_PORT || '3306');
  const username = process.env.TEST_DB_USER || 'root';
  const password = process.env.TEST_DB_PASSWORD || '';
  const databases = (process.env.TEST_DB_DATABASES || 'test_db').split(',');

  console.log(`📦 Creating real test data source: ${dataSourceName}`);
  console.log(`   Host: ${host}:${port}`);
  console.log(`   User: ${username}`);
  console.log(`   Databases: ${databases.join(', ')}`);

  try {
    // 创建数据源记录
    const dataSource = await prisma.dataSource.create({
      data: {
        name: dataSourceName,
        type: 'mysql',
        host,
        port,
        username,
        passwordEncrypted: password,
        targetDatabases: databases as any,
        status: 'inactive',
        description: 'Real test data source for integration testing',
      },
    });

    // 创建连接
    await connectionManager.createConnection({
      id: dataSource.id.toString(),
      name: dataSourceName,
      type: 'mysql',
      host,
      port,
      username,
      password,
      databases,
    });

    // 测试连接
    const healthCheck = await connectionManager.testConnection(dataSource.id.toString());
    if (!healthCheck.healthy) {
      throw new Error(`Connection test failed: ${healthCheck.error}`);
    }

    // 更新状态
    await prisma.dataSource.update({
      where: { id: dataSource.id },
      data: { status: 'active' },
    });

    console.log(`✅ Real test data source created: ID ${dataSource.id}`);

    return dataSource;
  } catch (error) {
    console.error('❌ Failed to create real test data source:', error);
    throw error;
  }
}

/**
 * 创建测试用的元数据
 */
export async function createTestMetadata(dataSourceId: number) {
  const prisma = getTestPrisma();

  console.log(`📊 Creating test metadata for data source ${dataSourceId}...`);

  // 创建数据库元数据
  const database = await prisma.databaseMeta.create({
    data: {
      sourceId: dataSourceId,
      databaseName: 'test_db',
      lastSyncedAt: new Date(),
    },
  });

  // 创建表元数据
  const usersTable = await prisma.tableMeta.create({
    data: {
      databaseId: database.id,
      tableName: 'users',
      rowCount: 1000,
      structureHash: 'hash_users',
      lastSyncedAt: new Date(),
    },
  });

  const ordersTable = await prisma.tableMeta.create({
    data: {
      databaseId: database.id,
      tableName: 'orders',
      rowCount: 5000,
      structureHash: 'hash_orders',
      lastSyncedAt: new Date(),
    },
  });

  // 创建列元数据
  await prisma.columnMeta.createMany({
    data: [
      // users 表的列
      {
        tableId: usersTable.id,
        columnName: 'id',
        dataType: 'int',
        isPrimaryKey: true,
        isNullable: false,
        ordinalPosition: 1,
      },
      {
        tableId: usersTable.id,
        columnName: 'name',
        dataType: 'varchar(100)',
        isPrimaryKey: false,
        isNullable: false,
        ordinalPosition: 2,
      },
      {
        tableId: usersTable.id,
        columnName: 'email',
        dataType: 'varchar(100)',
        isPrimaryKey: false,
        isNullable: false,
        ordinalPosition: 3,
      },
      // orders 表的列
      {
        tableId: ordersTable.id,
        columnName: 'id',
        dataType: 'int',
        isPrimaryKey: true,
        isNullable: false,
        ordinalPosition: 1,
      },
      {
        tableId: ordersTable.id,
        columnName: 'user_id',
        dataType: 'int',
        isPrimaryKey: false,
        isNullable: false,
        ordinalPosition: 2,
      },
      {
        tableId: ordersTable.id,
        columnName: 'amount',
        dataType: 'decimal(10,2)',
        isPrimaryKey: false,
        isNullable: false,
        ordinalPosition: 3,
      },
    ],
  });

  console.log('✅ Test metadata created');

  return { database, tables: [usersTable, ordersTable] };
}

/**
 * 创建测试用的关系
 */
export async function createTestRelationships(sourceTableId: number, targetTableId: number) {
  const prisma = getTestPrisma();

  console.log('🔗 Creating test relationships...');

  const relationship = await prisma.tableRelationship.create({
    data: {
      sourceTableId,
      sourceColumnName: 'user_id',
      targetTableId,
      targetColumnName: 'id',
      relationshipType: 'foreign_key',
      confidence: 0.95,
      inferredBy: 'test',
      inferredAt: new Date(),
    },
  });

  console.log('✅ Test relationships created');

  return relationship;
}

/**
 * 验证测试数据库连接
 */
export async function verifyTestDatabaseConnection(): Promise<boolean> {
  try {
    const prisma = getTestPrisma();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Test database connection verified');
    return true;
  } catch (error) {
    console.error('❌ Test database connection failed:', error);
    return false;
  }
}

/**
 * 关闭测试数据库连接
 */
export async function closeTestDatabase() {
  if (prismaClient) {
    console.log('🔌 Closing test database connection...');
    await prismaClient.$disconnect();
    prismaClient = null;
    console.log('✅ Test database connection closed');
  }
}
