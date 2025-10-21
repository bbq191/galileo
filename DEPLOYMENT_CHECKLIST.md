# Galileo 部署检查清单

## 第 1 周任务完成验证

### ✅ 任务 1: 初始化 Next.js 14 项目
- [x] Next.js 14.2.33 安装成功
- [x] App Router 配置完成
- [x] TypeScript 配置完成
- [x] 项目构建脚本配置完成
- [x] ESLint 配置完成

**验证命令:**
```bash
npx tsc --noEmit  # TypeScript 类型检查通过
```

### ✅ 任务 2: 配置 Tailwind CSS + DaisyUI
- [x] Tailwind CSS 3.4.17 安装
- [x] DaisyUI 5.3.7 安装
- [x] PostCSS 配置完成
- [x] 多主题配置 (light, dark, cupcake)
- [x] 示例页面使用 DaisyUI 组件

**验证命令:**
```bash
npm run dev  # 访问 http://localhost:3000 查看 DaisyUI 组件
```

### ✅ 任务 3: 配置 Prisma + MariaDB
- [x] Prisma 6.17.1 安装
- [x] mysql2 驱动安装
- [x] Prisma Client 生成成功
- [x] 环境变量配置文件创建
- [x] Prisma Client 单例实现

**验证命令:**
```bash
npx prisma validate  # Schema 验证通过
npx prisma generate  # Client 生成成功
```

### ✅ 任务 4: 设计并创建数据库 Schema
- [x] 11 个数据模型定义完成
- [x] 8 个枚举类型定义完成
- [x] 所有索引配置完成
- [x] 全文索引配置完成
- [x] 关系配置完成（无物理外键）
- [x] 种子数据脚本创建（40+ 数据字典规则）

**验证清单:**
- [ ] 创建 MariaDB/MySQL 数据库: `galileo_metadata`
- [ ] 配置 `.env` 文件中的 `DATABASE_URL`
- [ ] 执行 `npm run db:push` 推送 Schema
- [ ] 执行 `npm run db:seed` 初始化种子数据
- [ ] 访问 `http://localhost:3000/api/test` 验证数据库连接

## 文件清单

### 核心配置文件 ✓
- [x] `package.json` - 依赖和脚本配置
- [x] `tsconfig.json` - TypeScript 配置
- [x] `next.config.mjs` - Next.js 配置
- [x] `.eslintrc.json` - ESLint 配置
- [x] `tailwind.config.ts` - Tailwind + DaisyUI 配置
- [x] `postcss.config.mjs` - PostCSS 配置
- [x] `.gitignore` - Git 忽略配置
- [x] `.env` - 环境变量（不提交到 Git）
- [x] `.env.example` - 环境变量示例

### Prisma 文件 ✓
- [x] `prisma/schema.prisma` - 数据库 Schema 定义
- [x] `prisma/seed.ts` - 种子数据主脚本
- [x] `prisma/seeds/data-dictionary.ts` - 数据字典种子
- [x] `prisma/init.sql` - SQL 初始化脚本（备用）
- [x] `prisma/README.md` - Prisma 使用文档

### 应用文件 ✓
- [x] `app/layout.tsx` - 根布局
- [x] `app/page.tsx` - 首页
- [x] `app/globals.css` - 全局样式
- [x] `app/api/test/route.ts` - 数据库测试 API
- [x] `lib/prisma/client.ts` - Prisma Client 单例

### 文档文件 ✓
- [x] `docs/phase1-preparation.md` - 第一阶段开发计划
- [x] `docs/setup-guide.md` - 项目设置指南
- [x] `CLAUDE.md` - Claude Code 指南
- [x] `readme.md` - 项目 README
- [x] `DEPLOYMENT_CHECKLIST.md` - 本文档

## 依赖包版本

### 核心依赖
```json
{
  "@prisma/client": "^6.17.1",
  "mysql2": "^3.15.2",
  "next": "^14.2.15",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```

### 开发依赖
```json
{
  "@types/node": "^22.10.2",
  "@types/react": "^18.3.18",
  "@types/react-dom": "^18.3.5",
  "autoprefixer": "^10.4.20",
  "daisyui": "^5.3.7",
  "eslint": "^8.57.1",
  "eslint-config-next": "^14.2.15",
  "postcss": "^8.4.49",
  "prisma": "^6.17.1",
  "tailwindcss": "^3.4.17",
  "tsx": "^4.20.6",
  "typescript": "^5.7.2"
}
```

## 数据库模型统计

- **业务表**: 5 个 (BusinessDomain, DataSource, DatabaseMeta, TableMeta, ColumnMeta)
- **关系表**: 2 个 (ExplicitRelationship, InferredRelationship)
- **辅助表**: 4 个 (MetadataChange, MetadataSnapshot, SchemaSnapshot, DataDictionary)
- **枚举类型**: 8 个 (Status, RelationshipType, SemanticSource, InferenceMethod, ChangeType, EntityType, SnapshotType)
- **总字段数**: 100+ 个
- **索引数**: 40+ 个
- **全文索引**: 2 个

## Schema 特性

### P0 优化 (已实现)
- ✅ 混合 AI 处理 (rule/ai/manual)
- ✅ DDL 哈希变更检测 (SHA256)
- ✅ 移除外键约束 (仅保留索引)
- ✅ 性能 SLA 定义 (4 个规模级别)

### P1 优化 (已实现)
- ✅ 业务域支持 (business_domains)
- ✅ 元数据版本快照 (metadata_snapshots)
- ✅ 数据字典 (40+ 预定义规则)
- ✅ 多级缓存架构设计

## 快速启动步骤

### 1. 环境准备
```bash
# 安装依赖
npm install

# 验证 Prisma 配置
npx prisma validate
```

### 2. 数据库设置
```sql
-- 创建数据库
CREATE DATABASE galileo_metadata CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
# 配置 .env 文件
DATABASE_URL="mysql://root:@localhost:3306/galileo_metadata"

# 推送 Schema
npm run db:push

# 初始化种子数据
npm run db:seed
```

### 3. 启动开发服务器
```bash
npm run dev
```

### 4. 验证
- 访问首页: http://localhost:3000
- 测试 API: http://localhost:3000/api/test
- Prisma Studio: `npm run db:studio` → http://localhost:5555

## 测试清单

### 功能测试
- [ ] Next.js 开发服务器启动成功
- [ ] DaisyUI 组件正常显示
- [ ] Prisma Client 正常导入
- [ ] 数据库连接成功
- [ ] 测试 API 返回正确数据
- [ ] 种子数据创建成功

### 数据库测试
- [ ] 所有表创建成功
- [ ] 索引创建成功
- [ ] 全文索引可用
- [ ] 级联删除配置正确
- [ ] 数据字典记录存在

### 代码质量测试
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查通过
- [ ] 无 console 警告（除开发日志）

## 已知问题

1. **Windows 构建权限问题**: `npm run build` 可能遇到 EPERM 错误，不影响开发环境运行
   - **解决方案**: 使用 `npx tsc --noEmit` 验证 TypeScript，或在 Linux/macOS 环境构建

2. **Prisma 配置警告**: `package.json#prisma` 在 Prisma 7 将废弃
   - **影响**: 仅警告，不影响功能
   - **解决方案**: 将来迁移到 `prisma.config.ts`

## 下一步任务

根据文档，第 1 周剩余任务：

### 🔄 任务 5: 实现数据库连接管理器
- [ ] 连接管理器类
- [ ] 连接池配置
- [ ] 连接健康检查
- [ ] 连接配置加密存储 (AES-256)
- [ ] 连接白名单机制

**计划文件结构:**
```
lib/database/
  ├── connection-manager.ts    # 连接管理器
  ├── connection-pool.ts       # 连接池封装
  └── connection-config.ts     # 连接配置接口
```

## 验证通过标准

### 必须通过的检查项
1. ✅ Prisma Schema 验证通过
2. ✅ TypeScript 编译无错误
3. ✅ 所有配置文件存在
4. ⏳ 数据库连接测试通过（需先创建数据库）
5. ⏳ 种子数据初始化成功（需先推送 Schema）

### 可选检查项
- [ ] ESLint 零警告
- [ ] 生产构建成功
- [ ] Prisma Studio 可访问

## 时间记录

- **任务 1-2**: 初始化项目 + 配置 UI - 已完成
- **任务 3-4**: 配置 Prisma + Schema 设计 - 已完成
- **任务 5**: 数据库连接管理器 - 待开始

**预计完成时间**: 第 1 周结束前完成所有任务

## 交付物清单

### ✅ 已交付
1. 完整的 Next.js 14 项目脚手架
2. Prisma Schema 文件（11 个模型，8 个枚举）
3. Prisma Client 单例
4. 数据字典种子数据（40+ 规则）
5. API 测试端点
6. 完整的项目文档

### 🔄 待交付
1. 数据库连接管理模块
2. 连接管理 UI（前端界面）
3. 单元测试（测试覆盖率 > 80%）

---

**最后更新**: 2025-10-21
**状态**: 第 1 周任务 80% 完成
**下一里程碑**: 实现数据库连接管理器
