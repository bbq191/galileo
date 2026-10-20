# Prisma 数据库配置指南

## 前置要求

确保你已经安装了 MariaDB 或 MySQL（推荐 MariaDB 10.5+）。

## 数据库设置步骤

### 1. 创建数据库

登录 MariaDB/MySQL 并创建数据库：

```sql
CREATE DATABASE galileo_metadata CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建数据库用户（可选，推荐用于生产环境）
CREATE USER 'galileo_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON galileo_metadata.* TO 'galileo_user'@'localhost';
FLUSH PRIVILEGES;
```

### 2. 配置环境变量

复制 `.env.example` 文件为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置数据库连接：

```env
DATABASE_URL="mysql://galileo_user:your_secure_password@localhost:3306/galileo_metadata"
```

### 3. 推送数据库 Schema

使用 Prisma 将 schema 推送到数据库：

```bash
npm run db:push
```

或者使用迁移方式（推荐用于生产环境）：

```bash
npm run db:migrate
```

### 4. 初始化种子数据

执行种子脚本，初始化管理员账号、业务域和数据字典：

```bash
npm run db:seed
```

管理员账号默认用户名为 `admin`，可通过 `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD` 指定；
未指定密码时随机生成，**只在 seed 输出中显示一次**。账号已存在时跳过，不会重置密码。
创建其他用户或重置密码见 `manual/security.md` 的「认证与访问控制」。

### 5. 验证数据库

使用 Prisma Studio 可视化查看数据库：

```bash
npm run db:studio
```

这将在浏览器中打开 `http://localhost:5555`。

## 可用的 Prisma 命令

| 命令 | 说明 |
|------|------|
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:push` | 推送 schema 到数据库（开发环境） |
| `npm run db:migrate` | 创建迁移文件并执行 |
| `npm run db:seed` | 执行种子数据脚本 |
| `npm run db:studio` | 打开 Prisma Studio 可视化工具 |
| `npm run db:reset` | 重置数据库（删除所有数据并重新执行迁移和种子） |

## Schema 说明

### 核心表

- **business_domains**: 业务域表（用于跨库关系推断）
- **data_sources**: 数据源配置表
- **databases_meta**: 数据库元数据表
- **tables_meta**: 表元数据表
- **columns_meta**: 字段元数据表

### 关系表

- **explicit_relationships**: 显式关系表（外键）
- **inferred_relationships**: AI 推断关系表

### 辅助表

- **metadata_changes**: 元数据变更历史表
- **metadata_snapshots**: 元数据快照表（版本回溯）
- **schema_snapshots**: DDL 结构快照表（哈希变更检测）
- **data_dictionary**: 数据字典表（预定义字段语义规则）

## 注意事项

1. **字符集**: 所有表使用 `utf8mb4` 字符集，支持 emoji 和特殊字符
2. **全文索引**: `tables_meta.semantic_description` 和 `columns_meta.semantic_description` 使用全文索引
3. **外键约束**: 为了性能优化，`explicit_relationships` 和 `inferred_relationships` 不使用物理外键约束
4. **DDL 哈希**: 使用 SHA256 哈希检测表结构变更，比 `UPDATE_TIME` 更可靠

## 故障排除

### 问题：无法连接到数据库

检查：
1. MariaDB/MySQL 服务是否运行
2. `.env` 中的数据库连接字符串是否正确
3. 用户权限是否足够

### 问题：全文索引创建失败

MariaDB/MySQL 需要 InnoDB 引擎支持全文索引。确保使用 MariaDB 10.0+ 或 MySQL 5.6+。

### 问题：迁移失败

尝试重置数据库：

```bash
npm run db:reset
```

⚠️ 警告：这会删除所有数据！
