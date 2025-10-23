# Galileo - 自然语言转 SQL 系统

> 将自然语言查询转换为 SQL，并以图表形式呈现结果

## 📖 项目概述

**基本需求**: 自然语言转换为 SQL，以图表的形式呈现给用户

**技术栈**: Next.js + DaisyUI + Deepseek AI (Ollama)

## 🏗️ 业务逻辑

### 1. 准备阶段

**逻辑步骤**:
```
获取数据连接 → 获取指定数据库元数据 → 获取数据库及数据表之间关联关系
→ 通过 AI 模型语义化各元数据 → 通过 AI 自推断数据库及数据表之间可能的关联关系
```

**关键难点**: 元数据变更需要及时刷新

**核心约束**: 不允许直接获取数据库连接而操作数据库，只能获取元数据

### 2. SQL 生成阶段

**逻辑步骤**:
```
用户输入自然语言 → AI 精准识别用户意图 → 通过准备阶段允许使用的数据连接
→ 生成对应的 SQL → 优化并执行 SQL → 呈现对应的数据图表
```

**关键难点**: 精准识别用户意图，经常需要跨库跨表甚至跨 10 个库以上链接查询

### 3. 安全审计

**逻辑步骤**:
```
记录用户的查询及生成全过程 → 防范黑客攻击
```

**关键难点**: 历史数据如何存储

## 🚀 快速开始

### 前置要求

1. **Node.js**: 18.0 或更高版本
2. **MariaDB/MySQL**: 用于元数据存储
3. **Ollama**: 用于本地 AI 推理 (可选，推荐用于开发)

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd galileo
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   ```

   编辑 `.env` 文件，配置数据库连接和 AI 服务

4. **设置数据库**
   ```bash
   npm run db:generate    # 生成 Prisma 客户端
   npm run db:push        # 推送数据库 schema
   ```

5. **启动开发服务器**
   ```bash
   npm run dev
   ```

   访问 http://localhost:3000

## 🤖 AI 配置

### 使用本地 Ollama (开发环境推荐)

1. **安装 Ollama**

   访问 https://ollama.ai/ 下载并安装

2. **下载 Deepseek 模型**
   ```bash
   ollama pull deepseek-r1:1.5b
   ```

3. **验证安装**
   ```bash
   ollama list
   curl http://localhost:11434/api/tags
   ```

4. **环境变量已配置** (在 `.env` 中)
   ```bash
   DEEPSEEK_API_KEY="ollama"
   DEEPSEEK_API_URL="http://localhost:11434"
   DEEPSEEK_MODEL="deepseek-r1:1.5b"
   ```

详细配置指南: [docs/ollama-setup.md](./docs/ollama-setup.md)

### 使用官方 API (生产环境推荐)

更新 `.env` 文件:
```bash
DEEPSEEK_API_KEY="your_actual_api_key"
DEEPSEEK_API_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"
```

## 📚 开发指南

### 可用命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run start            # 启动生产服务器

# 代码检查
npm run lint             # 运行 ESLint
npm run lint:fix         # 自动修复代码问题

# 数据库
npm run db:generate      # 生成 Prisma 客户端
npm run db:push          # 推送 schema 到数据库
npm run db:migrate       # 运行数据库迁移
npm run db:seed          # 数据库填充
npm run db:studio        # 打开 Prisma Studio
npm run db:reset         # 重置数据库

# 测试
npm run test:collector   # 测试元数据采集器
npm run test:relationship # 测试关系推断
npm run test:repository  # 测试元数据仓库
npm run test:all         # 运行所有测试
```

### 项目结构

```
galileo/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   │   ├── datasources/   # 数据源管理
│   │   └── metadata/      # 元数据管理
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # 首页
├── lib/                   # 核心业务逻辑
│   ├── ai/               # AI 模块
│   │   ├── config.ts     # AI 配置
│   │   ├── deepseek-client.ts  # Deepseek 客户端
│   │   └── types.ts      # 类型定义
│   ├── database/         # 数据库连接管理
│   └── metadata/         # 元数据处理
│       ├── collectors/   # 元数据采集器
│       ├── inference/    # 关系推断
│       ├── storage/      # 元数据存储
│       └── sync/         # 同步服务
├── prisma/               # Prisma 配置
│   └── schema.prisma     # 数据库 schema
├── docs/                 # 文档
│   └── ollama-setup.md   # Ollama 配置指南
├── .env                  # 环境变量 (不提交)
├── .env.example          # 环境变量示例
└── CLAUDE.md            # Claude Code 项目指南
```

## 🔒 安全性

- **密码加密**: 数据源密码使用 AES-256 加密存储
- **参数化查询**: 防止 SQL 注入
- **审计日志**: 记录所有查询操作
- **访问控制**: 基于角色的权限管理 (计划中)

## 📝 开发规范

详细的开发规范和架构设计请参考: [CLAUDE.md](./CLAUDE.md)

## 🐛 故障排除

### Ollama 连接失败

```bash
# 检查 Ollama 服务状态
curl http://localhost:11434/api/tags

# 重启 Ollama 服务
ollama serve
```

### 数据库连接错误

#### 常规问题
- 检查 `.env` 中的 `DATABASE_URL` 配置
- 确保 MariaDB/MySQL 服务正在运行
- 验证用户名和密码正确

#### 认证插件不兼容 ⚠️

**错误提示**：`Server requests authentication using unknown plugin auth_gssapi_client`

**原因**：MariaDB/MySQL 使用不兼容的认证插件

**快速修复**（5分钟）：
```sql
-- 连接到数据库
mysql -u root -p

-- 修改用户认证方式
ALTER USER 'your_username'@'your_host'
  IDENTIFIED WITH mysql_native_password BY 'your_password';
FLUSH PRIVILEGES;

-- 或创建新用户（推荐）
CREATE USER 'galileo_readonly'@'%'
  IDENTIFIED WITH mysql_native_password BY 'Galileo@2025!Secure';
GRANT SELECT ON *.* TO 'galileo_readonly'@'%';
GRANT SELECT ON information_schema.* TO 'galileo_readonly'@'%';
FLUSH PRIVILEGES;
```

**详细文档**：
- 快速指南：[docs/QUICK-FIX-AUTH.md](./docs/QUICK-FIX-AUTH.md)
- 完整指南：[docs/fix-database-auth-guide.md](./docs/fix-database-auth-guide.md)

### 模块未找到错误

```bash
# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 重新生成 Prisma 客户端
npm run db:generate
```

## 📄 许可证

[待添加]

## 🤝 贡献

欢迎贡献！请先阅读 [CLAUDE.md](./CLAUDE.md) 了解项目架构和开发规范。

---

**开发代号**: Galileo
**当前阶段**: 阶段1 - 元数据采集与存储 ✅
