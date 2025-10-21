# 数据库连接管理器使用文档

## 概述

数据库连接管理器负责管理 Galileo 系统中的所有外部数据源连接，支持：

- ✅ 多数据库连接管理（MySQL/MariaDB/PostgreSQL）
- ✅ 连接池管理（最小 2，最大 10 连接）
- ✅ 连接健康检查（自动每 60 秒检查）
- ✅ 连接配置 AES-256 加密存储
- ✅ 连接权限隔离（仅元数据读取）
- ✅ 优雅关闭处理

## 架构

```
lib/database/
  ├── connection-manager.ts    # 连接管理器（单例）
  ├── connection-pool.ts       # 连接池封装
  ├── connection-config.ts     # 配置接口定义
  ├── encryption.ts            # AES-256 加密工具
  ├── index.ts                 # 模块导出
  └── README.md                # 本文档
```

## 使用指南

### 1. 基础使用

```typescript
import { connectionManager } from '@/lib/database';
import type { DatabaseConfig } from '@/lib/database';

// 创建连接
const config: DatabaseConfig = {
  id: '1',
  name: 'Production DB',
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'readonly_user',
  password: 'secure_password',
  databases: ['app_db', 'analytics_db'],
};

await connectionManager.createConnection(config);
```

### 2. 测试连接

```typescript
// 测试连接健康状态
const health = await connectionManager.testConnection('1');

console.log(health);
// {
//   healthy: true,
//   connectionId: '1',
//   responseTime: 45,
//   checkedAt: 2025-10-21T...
// }
```

### 3. 使用连接执行查询

```typescript
// 获取连接池
const pool = await connectionManager.getConnection('1');

// 执行查询
const [databases] = await pool.query<any[]>('SHOW DATABASES');

// 执行参数化查询
const [tables] = await pool.query<any[]>(
  'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
  ['app_db']
);

// 查询单条记录
const result = await pool.queryOne<any>(
  'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
  ['app_db']
);
```

### 4. 连接统计信息

```typescript
// 获取连接池统计
const stats = connectionManager.getConnectionStats('1');

console.log(stats);
// {
//   active: 2,
//   idle: 3,
//   waiting: 0,
//   total: 5
// }
```

### 5. 关闭连接

```typescript
// 关闭单个连接
await connectionManager.closeConnection('1');

// 关闭所有连接
await connectionManager.closeAll();
```

## 加密工具

### 密码加密/解密

```typescript
import { encryptPassword, decryptPassword } from '@/lib/database';

// 加密密码
const encrypted = encryptPassword('my_password');
// => "U2FsdGVkX1+..."

// 解密密码
const decrypted = decryptPassword(encrypted);
// => "my_password"
```

### 生成加密密钥

```typescript
import { generateEncryptionKey } from '@/lib/database';

// 生成 32 字符的随机密钥
const key = generateEncryptionKey(32);
console.log(key);
// => "Kj9#mP2$xQ7@wE4!..."
```

## 环境变量配置

在 `.env` 文件中配置加密密钥：

```env
# 数据库连接加密密钥（生产环境必须设置）
DATABASE_ENCRYPTION_KEY="your-32-character-secret-key-here"
```

**注意：**
- 生产环境必须设置此环境变量
- 密钥应至少 32 字符，包含大小写字母、数字和特殊字符
- 使用 `generateEncryptionKey()` 生成安全密钥

## API 路由

### 创建数据源

```bash
POST /api/datasources

# 请求体
{
  "name": "Production DB",
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "username": "readonly_user",
  "password": "secure_password",
  "databases": ["app_db"]
}
```

### 获取数据源列表

```bash
GET /api/datasources

# 可选参数
?status=active  # 筛选活跃连接
```

### 获取单个数据源

```bash
GET /api/datasources/:id
```

### 更新数据源

```bash
PUT /api/datasources/:id

# 请求体
{
  "name": "Updated Name",
  "host": "new-host.com",
  "port": 3307
}
```

### 测试连接

```bash
POST /api/datasources/:id/test
```

### 删除数据源

```bash
DELETE /api/datasources/:id
```

## 安全特性

### 1. 密码加密

所有数据库密码使用 AES-256 加密存储：

```typescript
// 自动加密
const config: DatabaseConfig = {
  password: 'plain_password', // 自动加密
  // ...
};

await connectionManager.createConnection(config);
// 存储时: "U2FsdGVkX1+..." (加密)
// 使用时: 自动解密
```

### 2. 权限隔离

推荐为 Galileo 创建只读用户：

```sql
-- 创建只读用户
CREATE USER 'galileo_readonly'@'%' IDENTIFIED BY 'secure_password';

-- 仅授予 INFORMATION_SCHEMA 查询权限
GRANT SELECT ON information_schema.* TO 'galileo_readonly'@'%';
GRANT SELECT ON performance_schema.* TO 'galileo_readonly'@'%';

-- 授予特定数据库的元数据读取权限
GRANT SELECT ON `app_db`.* TO 'galileo_readonly'@'%';

FLUSH PRIVILEGES;
```

### 3. 连接白名单

配置允许连接的主机白名单：

```typescript
// 在连接管理器中添加白名单验证
const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '192.168.1.*',
  'prod-db.company.com',
];
```

## 健康检查

连接管理器自动每 60 秒执行健康检查：

```typescript
// 自动健康检查（后台运行）
// 每 60 秒检查所有连接
// 不健康的连接状态自动更新为 'error'

// 手动执行健康检查
const health = await connectionManager.testConnection('1');

if (!health.healthy) {
  console.error('连接不健康:', health.error);
}
```

## 连接池配置

### 默认配置

```typescript
{
  min: 2,                      // 最小连接数
  max: 10,                     // 最大连接数
  idleTimeoutMillis: 30000,    // 空闲超时 30 秒
  connectionTimeoutMillis: 10000, // 连接超时 10 秒
  queueLimit: 0                // 无限制排队
}
```

### 自定义配置

```typescript
import { DEFAULT_POOL_CONFIG } from '@/lib/database';

const customConfig = {
  ...DEFAULT_POOL_CONFIG,
  max: 20, // 增加最大连接数
  idleTimeoutMillis: 60000, // 增加空闲超时
};

await connectionManager.createConnection(config, customConfig);
```

## 错误处理

```typescript
try {
  const pool = await connectionManager.getConnection('1');
  const [rows] = await pool.query('SELECT * FROM users');
} catch (error) {
  if (error.message.includes('not found')) {
    console.error('连接不存在');
  } else if (error.message.includes('unhealthy')) {
    console.error('连接不健康');
  } else {
    console.error('查询失败:', error);
  }
}
```

## 最佳实践

### 1. 使用连接池而非直接连接

```typescript
// ✅ 推荐：使用连接管理器
const pool = await connectionManager.getConnection('1');
const [rows] = await pool.query('SELECT ...');

// ❌ 不推荐：直接创建连接
const connection = mysql.createConnection({ ... });
```

### 2. 始终使用参数化查询

```typescript
// ✅ 推荐：参数化查询（防止 SQL 注入）
const [rows] = await pool.query(
  'SELECT * FROM users WHERE id = ?',
  [userId]
);

// ❌ 不推荐：字符串拼接
const [rows] = await pool.query(
  `SELECT * FROM users WHERE id = ${userId}`
);
```

### 3. 及时释放连接

```typescript
// 使用连接池会自动管理连接释放
const pool = await connectionManager.getConnection('1');

// 如果手动获取连接，记得释放
const conn = await pool.getConnection();
try {
  await conn.query('SELECT ...');
} finally {
  conn.release(); // 释放回连接池
}
```

### 4. 定期监控连接状态

```typescript
// 获取所有连接健康状态
const healthMap = await connectionManager.getAllHealthStatus();

for (const [id, health] of healthMap) {
  if (!health.healthy) {
    console.warn(`连接 ${id} 不健康:`, health.error);
    // 发送告警通知
  }
}
```

## 性能优化

### 1. 连接池大小

根据实际负载调整连接池大小：

- **小型应用**: min=2, max=5
- **中型应用**: min=2, max=10 （默认）
- **大型应用**: min=5, max=20

### 2. 超时配置

根据网络延迟调整超时时间：

- **本地数据库**: connectionTimeout=5s
- **局域网**: connectionTimeout=10s （默认）
- **远程数据库**: connectionTimeout=30s

### 3. 批量操作

使用批量查询减少网络往返：

```typescript
// ✅ 批量查询
const [results] = await pool.query(`
  SELECT t1.*, t2.*
  FROM table1 t1
  JOIN table2 t2 ON t1.id = t2.foreign_id
`);

// ❌ 多次单独查询
for (const item of items) {
  await pool.query('SELECT ...', [item.id]);
}
```

## 故障排除

### 问题：连接创建失败

**可能原因：**
1. 数据库服务未启动
2. 防火墙阻止连接
3. 凭证错误

**解决方案：**
```bash
# 测试网络连通性
telnet hostname 3306

# 验证凭证
mysql -h hostname -P 3306 -u username -p
```

### 问题：连接池耗尽

**症状：** `Too many connections` 或查询超时

**解决方案：**
```typescript
// 增加最大连接数
const config = {
  ...DEFAULT_POOL_CONFIG,
  max: 20,
};
```

### 问题：加密/解密失败

**可能原因：**
- `DATABASE_ENCRYPTION_KEY` 未设置或更改

**解决方案：**
```bash
# 设置加密密钥
echo "DATABASE_ENCRYPTION_KEY=your-secret-key" >> .env
```

## 监控指标

推荐监控以下指标：

| 指标 | 说明 | 告警阈值 |
|-----|------|---------|
| 活跃连接数 | `stats.active` | > 80% max |
| 等待连接数 | `stats.waiting` | > 0 |
| 响应时间 | `health.responseTime` | > 1000ms |
| 健康状态 | `health.healthy` | false |

```typescript
// 监控示例
const stats = connectionManager.getConnectionStats('1');
const health = await connectionManager.testConnection('1');

if (stats.active > poolConfig.max * 0.8) {
  console.warn('连接池使用率过高');
}

if (health.responseTime > 1000) {
  console.warn('数据库响应慢');
}
```

## 相关文档

- [Prisma 使用文档](../prisma/README.md)
- [项目设置指南](../../docs/setup-guide.md)
- [第一阶段开发计划](../../docs/phase1-preparation.md)

---

**最后更新**: 2025-10-21
**版本**: 1.0.0
