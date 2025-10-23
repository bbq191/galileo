# Galileo 脚本工具

本目录包含项目的各种自动化脚本和工具。

## 📜 可用脚本

### verify-api-endpoints.ts

**用途**: 验证所有 API 端点是否可以正常访问

**运行方式**:
```bash
npx ts-node scripts/verify-api-endpoints.ts
```

**前置条件**:
- 开发服务器必须正在运行 (`npm run dev`)

**功能**:
- 测试所有 API 端点
- 验证响应状态码
- 显示详细的测试结果

---

## 🚧 计划添加的脚本

### setup.ts（待添加）

**用途**: 项目初始化脚本

**功能**:
- 检查系统依赖
- 安装 npm 包
- 设置环境变量
- 初始化数据库
- 运行数据库迁移

**运行方式**:
```bash
npx ts-node scripts/setup.ts
```

---

### seed-test-data.ts（待添加）

**用途**: 生成测试数据

**功能**:
- 创建测试数据源
- 生成模拟元数据
- 创建测试关系
- 支持自定义数据规模

**运行方式**:
```bash
npx ts-node scripts/seed-test-data.ts --scale=medium
```

**参数**:
- `--scale`: 数据规模 (`small` | `medium` | `large`)
- `--clean`: 清除现有测试数据

---

### check-dependencies.ts（待添加）

**用途**: 检查项目依赖

**功能**:
- 检查过时的依赖包
- 检查安全漏洞
- 显示依赖树
- 推荐更新

**运行方式**:
```bash
npx ts-node scripts/check-dependencies.ts
```

---

### generate-api-docs.ts（待添加）

**用途**: 自动生成 API 文档

**功能**:
- 从代码注释生成文档
- 更新 Postman 集合
- 生成 OpenAPI/Swagger 规范
- 验证文档完整性

**运行方式**:
```bash
npx ts-node scripts/generate-api-docs.ts
```

---

### backup-database.ts（待添加）

**用途**: 备份数据库

**功能**:
- 备份 Prisma 数据库
- 导出元数据
- 压缩备份文件
- 上传到云存储（可选）

**运行方式**:
```bash
npx ts-node scripts/backup-database.ts
```

---

### migrate-data.ts（待添加）

**用途**: 数据迁移工具

**功能**:
- 从旧版本迁移数据
- 数据格式转换
- 数据验证
- 回滚支持

**运行方式**:
```bash
npx ts-node scripts/migrate-data.ts --from=v1.0 --to=v2.0
```

---

## 🛠️ 编写新脚本

### 脚本模板

```typescript
/**
 * 脚本名称
 *
 * 脚本描述
 *
 * 使用方法：
 * npx ts-node scripts/your-script.ts [options]
 */

import { createLogger } from '../lib/utils/logger';

const logger = createLogger('ScriptName');

async function main() {
  try {
    logger.info('脚本开始执行');

    // 脚本逻辑

    logger.info('脚本执行完成');
    process.exit(0);
  } catch (error) {
    logger.error('脚本执行失败', error as Error);
    process.exit(1);
  }
}

main();
```

### 最佳实践

1. **错误处理**: 使用 try-catch 捕获错误
2. **日志记录**: 使用统一的 logger
3. **退出代码**: 成功返回 0，失败返回 1
4. **参数解析**: 使用 `process.argv` 或 `commander.js`
5. **文档注释**: 添加清晰的使用说明

### 参数解析示例

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('my-script')
  .description('脚本描述')
  .option('-e, --env <environment>', '环境', 'development')
  .option('-v, --verbose', '详细输出', false)
  .parse(process.argv);

const options = program.opts();

console.log('环境:', options.env);
console.log('详细模式:', options.verbose);
```

---

## 📝 脚本开发指南

### 1. 创建新脚本

```bash
# 创建文件
touch scripts/my-script.ts

# 添加可执行权限（可选）
chmod +x scripts/my-script.ts
```

### 2. 编写脚本内容

参考上面的脚本模板

### 3. 测试脚本

```bash
# 本地测试
npx ts-node scripts/my-script.ts

# 使用参数测试
npx ts-node scripts/my-script.ts --help
```

### 4. 添加到 package.json

```json
{
  "scripts": {
    "script:my-script": "ts-node scripts/my-script.ts"
  }
}
```

### 5. 更新本文档

在本 README 中添加脚本说明

---

## 🔗 相关资源

- [ts-node 文档](https://typestrong.org/ts-node/)
- [Commander.js 文档](https://github.com/tj/commander.js)
- [Node.js 脚本最佳实践](https://nodejs.org/en/docs/guides/scripting)

---

## ❓ 常见问题

### Q: 如何传递参数给脚本？

```bash
npx ts-node scripts/my-script.ts --param=value
```

### Q: 如何在脚本中访问环境变量？

```typescript
const apiKey = process.env.API_KEY;
```

### Q: 如何使脚本可执行？

在脚本顶部添加 shebang：
```typescript
#!/usr/bin/env ts-node

// 脚本内容
```

然后添加可执行权限：
```bash
chmod +x scripts/my-script.ts
./scripts/my-script.ts
```

---

**最后更新**: 2025-01-20
