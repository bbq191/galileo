# 元数据采集器使用文档

## 概述

元数据采集器负责从外部数据库（MySQL/MariaDB/PostgreSQL）中采集完整的元数据信息，包括：

- ✅ 数据库列表
- ✅ 表结构（表名、注释、行数等）
- ✅ 字段信息（名称、类型、注释、约束等）
- ✅ 索引信息（类型、唯一性、包含列等）
- ✅ 外键关系（约束名、引用表、规则等）
- ✅ 视图定义（视图 SQL、是否可更新等）

## 架构设计

```
lib/metadata/
  ├── types.ts                        # 类型定义
  ├── collectors/
  │   ├── base-collector.ts           # 抽象基类
  │   ├── mysql-schema-collector.ts   # MySQL/MariaDB 采集器
  │   ├── collector-factory.ts        # 采集器工厂
  │   ├── index.ts                    # 导出
  │   └── __tests__/
  │       └── mysql-collector.test.ts # 测试
  ├── index.ts                        # 模块导出
  └── README.md                       # 本文档
```

## 快速开始

### 1. 基础使用

```typescript
import { connectionManager } from '@/lib/database';
import { CollectorFactory } from '@/lib/metadata/collectors';

// 获取连接池
const pool = await connectionManager.getConnection('1');

// 创建采集器（自动根据数据库类型）
const collector = CollectorFactory.createCollector(pool, 'mysql');

// 采集数据库列表
const databases = await collector.collectDatabases('1');

// 采集表
const tables = await collector.collectTables('1', 'app_db');

// 采集字段
const columns = await collector.collectColumns('1', 'app_db', 'users');

// 采集索引
const indexes = await collector.collectIndexes('1', 'app_db', 'users');

// 采集外键
const foreignKeys = await collector.collectForeignKeys('1', 'app_db');

// 采集视图
const views = await collector.collectViews('1', 'app_db');
```

### 2. 完整采集

```typescript
import { MySQLSchemaCollector } from '@/lib/metadata/collectors';

const collector = new MySQLSchemaCollector(pool);

// 采集整个数据库的所有元数据
const result = await collector.collectAll('1', 'app_db');

console.log(result);
// {
//   tables: TableInfo[],
//   foreignKeys: ForeignKeyInfo[],
//   views: ViewInfo[],
//   stats: {
//     databaseCount: 1,
//     tableCount: 15,
//     columnCount: 120,
//     indexCount: 25,
//     foreignKeyCount: 10,
//     viewCount: 3,
//     duration: 450,  // ms
//   }
// }
```

### 3. 使用 API 端点

```bash
# 采集元数据
curl -X POST http://localhost:3000/api/metadata/collect \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": 1,
    "databases": ["app_db", "analytics_db"]
  }'
```

响应示例：
```json
{
  "status": "success",
  "message": "Successfully collected metadata from 2 databases",
  "data": [
    {
      "database": "app_db",
      "tables": [...],
      "foreignKeys": [...],
      "views": [...],
      "stats": {
        "tableCount": 15,
        "columnCount": 120,
        "indexCount": 25,
        "duration": 450
      }
    }
  ]
}
```

## 数据类型

### DatabaseInfo

```typescript
interface DatabaseInfo {
  name: string;              // 数据库名
  charset?: string;          // 字符集
  collation?: string;        // 排序规则
  tableCount?: number;       // 表数量
  createdAt?: Date;          // 创建时间
}
```

### TableInfo

```typescript
interface TableInfo {
  tableName: string;         // 表名
  databaseName: string;      // 数据库名
  tableComment?: string;     // 表注释
  tableType: 'BASE TABLE' | 'VIEW';
  engine?: string;           // 存储引擎 (InnoDB, MyISAM)
  rowCount?: number;         // 行数（估算）
  dataLength?: number;       // 数据大小（字节）
  indexLength?: number;      // 索引大小（字节）
  autoIncrement?: number;    // 自增值
  createTime?: Date;         // 创建时间
  updateTime?: Date;         // 更新时间
  tableCollation?: string;   // 排序规则
}
```

### ColumnInfo

```typescript
interface ColumnInfo {
  columnName: string;        // 字段名
  tableName: string;         // 表名
  databaseName: string;      // 数据库名
  dataType: string;          // 数据类型 (int, varchar)
  columnType: string;        // 完整类型 (varchar(255))
  columnComment?: string;    // 字段注释
  isNullable: boolean;       // 是否可为空
  columnKey?: 'PRI' | 'UNI' | 'MUL' | '';  // 键类型
  defaultValue?: string;     // 默认值
  extra?: string;            // 额外信息 (auto_increment)
  ordinalPosition: number;   // 位置
  characterSet?: string;     // 字符集
  collation?: string;        // 排序规则
  characterMaximumLength?: number;  // 字符最大长度
  numericPrecision?: number; // 数值精度
  numericScale?: number;     // 数值小数位
}
```

### IndexInfo

```typescript
interface IndexInfo {
  indexName: string;         // 索引名
  tableName: string;         // 表名
  databaseName: string;      // 数据库名
  isUnique: boolean;         // 是否唯一
  indexType: 'BTREE' | 'FULLTEXT' | 'HASH';
  columns: {                 // 包含的列
    columnName: string;
    seqInIndex: number;      // 列在索引中的顺序
    collation?: 'A' | 'D';   // A=升序, D=降序
  }[];
  indexComment?: string;     // 索引注释
}
```

### ForeignKeyInfo

```typescript
interface ForeignKeyInfo {
  constraintName: string;    // 约束名
  tableName: string;         // 源表名
  columnName: string;        // 源字段名
  databaseName: string;      // 数据库名
  referencedTableName: string;      // 引用表名
  referencedColumnName: string;     // 引用字段名
  referencedDatabaseName?: string;  // 引用数据库名
  deleteRule?: string;       // 删除规则 (CASCADE, SET NULL)
  updateRule?: string;       // 更新规则
}
```

### ViewInfo

```typescript
interface ViewInfo {
  viewName: string;          // 视图名
  databaseName: string;      // 数据库名
  viewDefinition: string;    // 视图定义 SQL
  checkOption?: string;      // 检查选项
  isUpdatable: boolean;      // 是否可更新
  definer?: string;          // 定义者
  securityType?: string;     // 安全类型
}
```

## 采集器方法

### collectDatabases()

采集数据库列表（排除系统数据库）

```typescript
const databases = await collector.collectDatabases(connectionId);
// 返回: DatabaseInfo[]
// 排除: information_schema, performance_schema, mysql, sys
```

### collectTables()

采集指定数据库的所有表

```typescript
const tables = await collector.collectTables(connectionId, 'app_db');
// 返回: TableInfo[]
// 包含表和视图
```

### collectColumns()

采集指定表的所有字段

```typescript
const columns = await collector.collectColumns(
  connectionId,
  'app_db',
  'users'
);
// 返回: ColumnInfo[]
// 按字段位置排序
```

### collectIndexes()

采集指定表的所有索引

```typescript
const indexes = await collector.collectIndexes(
  connectionId,
  'app_db',
  'users'
);
// 返回: IndexInfo[]
// 自动聚合多列索引
```

### collectForeignKeys()

采集指定数据库的所有外键

```typescript
const foreignKeys = await collector.collectForeignKeys(
  connectionId,
  'app_db'
);
// 返回: ForeignKeyInfo[]
// 包含删除/更新规则
```

### collectViews()

采集指定数据库的所有视图

```typescript
const views = await collector.collectViews(connectionId, 'app_db');
// 返回: ViewInfo[]
```

### getTableDDL()

获取表的 CREATE TABLE 语句

```typescript
const ddl = await collector.getTableDDL('app_db', 'users');
// 返回: string (完整的 DDL 语句)
// 用于生成结构哈希
```

### collectAll()

批量采集整个数据库

```typescript
const result = await collector.collectAll(connectionId, 'app_db');
// 返回: {
//   tables: TableInfo[],
//   foreignKeys: ForeignKeyInfo[],
//   views: ViewInfo[],
//   stats: CollectionStats
// }
```

## 采集器工厂

### 创建采集器

```typescript
import { CollectorFactory } from '@/lib/metadata/collectors';

// 自动创建对应类型的采集器
const collector = CollectorFactory.createCollector(pool, 'mysql');
// 或
const collector = CollectorFactory.createCollector(pool, 'mariadb');
```

### 检查支持的类型

```typescript
// 获取支持的类型
const types = CollectorFactory.getSupportedTypes();
// => ['mysql', 'mariadb']

// 检查是否支持
const supported = CollectorFactory.isSupported('mysql');
// => true
```

## 性能优化

### 1. 批量采集

批量采集比单独采集更高效：

```typescript
// ✅ 推荐：批量采集
const result = await collector.collectAll(connectionId, database);

// ❌ 不推荐：多次单独采集
const tables = await collector.collectTables(connectionId, database);
for (const table of tables) {
  const columns = await collector.collectColumns(...);
  const indexes = await collector.collectIndexes(...);
}
```

### 2. 并发采集

对于多个数据库，可以并发采集：

```typescript
const databases = ['db1', 'db2', 'db3'];

// 并发采集
const results = await Promise.all(
  databases.map((db) => collector.collectAll(connectionId, db))
);
```

### 3. 增量采集

仅采集变更的表：

```typescript
// 获取表的 DDL 哈希
const currentDDL = await collector.getTableDDL('app_db', 'users');
const currentHash = sha256(currentDDL);

// 对比存储的哈希
if (currentHash !== storedHash) {
  // 只采集这张表
  const columns = await collector.collectColumns(...);
  const indexes = await collector.collectIndexes(...);
}
```

## 错误处理

```typescript
try {
  const databases = await collector.collectDatabases(connectionId);
} catch (error) {
  if (error.message.includes('Access denied')) {
    console.error('数据库权限不足');
  } else if (error.message.includes('Connection')) {
    console.error('数据库连接失败');
  } else {
    console.error('采集失败:', error);
  }
}
```

## 采集统计

```typescript
const result = await collector.collectAll(connectionId, 'app_db');

console.log('采集统计:');
console.log(`- 表: ${result.stats.tableCount}`);
console.log(`- 字段: ${result.stats.columnCount}`);
console.log(`- 索引: ${result.stats.indexCount}`);
console.log(`- 外键: ${result.stats.foreignKeyCount}`);
console.log(`- 视图: ${result.stats.viewCount}`);
console.log(`- 耗时: ${result.stats.duration}ms`);
```

## 测试

运行测试脚本：

```bash
# 运行采集器测试（需要本地 MySQL/MariaDB）
npm run test:collector

# 或直接执行
tsx lib/metadata/collectors/__tests__/mysql-collector.test.ts
```

测试将验证：
1. 数据库列表采集
2. 表采集
3. 字段采集
4. 索引采集
5. 外键采集
6. 视图采集
7. 完整批量采集

## 扩展支持其他数据库

### 实现新的采集器

```typescript
// 1. 继承 BaseCollector
import { BaseCollector } from './base-collector';

export class PostgreSQLCollector extends BaseCollector {
  async collectDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    // 实现 PostgreSQL 特定逻辑
    const sql = `
      SELECT datname as name
      FROM pg_database
      WHERE datistemplate = false
    `;
    return await this.query<DatabaseInfo>(sql);
  }

  // 实现其他方法...
}

// 2. 在工厂中注册
// collector-factory.ts
case 'postgresql':
  return new PostgreSQLCollector(pool);
```

## 最佳实践

### 1. 使用连接池

```typescript
// ✅ 推荐
const pool = await connectionManager.getConnection('1');
const collector = new MySQLSchemaCollector(pool);

// ❌ 不推荐
const connection = mysql.createConnection({ ... });
```

### 2. 处理大数据库

```typescript
// 对于大数据库，分批处理表
const tables = await collector.collectTables(connectionId, database);
const batchSize = 10;

for (let i = 0; i < tables.length; i += batchSize) {
  const batch = tables.slice(i, i + batchSize);
  await Promise.all(
    batch.map((table) =>
      collector.collectColumns(connectionId, database, table.tableName)
    )
  );
}
```

### 3. 缓存采集结果

```typescript
// 使用 Redis 缓存采集结果
const cacheKey = `metadata:${database}:${table}:columns`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const columns = await collector.collectColumns(...);
await redis.set(cacheKey, JSON.stringify(columns), 'EX', 3600);
```

## 故障排除

### 问题：权限不足

**错误信息**: `Access denied for user`

**解决方案**:
```sql
-- 授予 SELECT 权限
GRANT SELECT ON information_schema.* TO 'user'@'%';
GRANT SELECT ON performance_schema.* TO 'user'@'%';
```

### 问题：采集速度慢

**可能原因**:
- 数据库表太多
- 网络延迟高

**解决方案**:
- 使用批量采集 `collectAll()`
- 启用并发采集
- 使用本地数据库连接

### 问题：内存占用高

**可能原因**:
- 一次性加载太多数据

**解决方案**:
- 分批处理
- 及时释放大对象
- 使用流式处理（待实现）

## 相关文档

- [数据库连接管理文档](../../database/README.md)
- [Prisma 使用文档](../../../prisma/README.md)
- [项目设置指南](../../../docs/setup-guide.md)

---

**最后更新**: 2025-10-21
**版本**: 1.0.0
