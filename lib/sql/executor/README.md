# SQL 查询执行器

查询执行器模块负责执行验证通过的 SQL 查询，提供超时控制、结果缓存、分页查询等功能。

## 模块结构

```
lib/sql/executor/
├── index.ts                    # 模块导出
├── types.ts                    # 类型定义
├── query-executor.ts           # 查询执行器核心类
├── timeout-handler.ts          # 超时处理器
├── result-formatter.ts         # 结果格式化器
├── __tests__/                  # 单元测试
│   ├── query-executor.test.ts
│   ├── timeout-handler.test.ts
│   └── result-formatter.test.ts
└── README.md                   # 本文档
```

## 核心功能

### 1. 查询执行器 (QueryExecutor)

负责执行 SQL 查询并返回格式化的结果。

**主要特性：**
- ✅ 自动添加 LIMIT 限制（防止大量数据返回）
- ✅ 超时控制（默认 30 秒）
- ✅ 结果缓存（小结果集自动缓存）
- ✅ 分页查询支持
- ✅ 批量查询执行
- ✅ 错误标准化（友好的错误提示）

**基本使用：**

```typescript
import { queryExecutor } from '@/lib/sql/executor';
import type { MetadataContext } from '@/lib/metadata/retrieval/types';

// 准备元数据上下文
const context: MetadataContext = {
  tables: [
    {
      id: 1,
      databaseName: 'test_db',
      tableName: 'users',
      // ... 其他字段
    }
  ],
  // ... 其他元数据
};

// 执行查询
const result = await queryExecutor.execute(
  'SELECT * FROM users WHERE age > 18',
  context,
  {
    timeout: 5000,        // 5秒超时
    maxRows: 100,         // 最多返回100行
    enableCache: true,    // 启用缓存
  }
);

if (result.success) {
  console.log(`查询成功，返回 ${result.rowCount} 行`);
  console.log(`耗时: ${result.executionTime}ms`);
  console.log(`数据:`, result.data);
} else {
  console.error(`查询失败: ${result.error}`);
}
```

**分页查询：**

```typescript
const paginatedResult = await queryExecutor.executePaginated(
  'SELECT * FROM users',
  context,
  { page: 1, pageSize: 20 },  // 第1页，每页20条
  { timeout: 10000 }
);

console.log(`总共 ${paginatedResult.pagination.totalRows} 条`);
console.log(`共 ${paginatedResult.pagination.totalPages} 页`);
console.log(`当前第 ${paginatedResult.pagination.page} 页`);
```

### 2. 超时处理器 (Timeout Handler)

提供灵活的超时控制机制。

**基本超时：**

```typescript
import { withTimeout } from '@/lib/sql/executor';

const result = await withTimeout(
  someAsyncOperation(),
  5000,  // 5秒超时
  '操作超时'
);
```

**超时控制器：**

```typescript
import { TimeoutController } from '@/lib/sql/executor';

const controller = new TimeoutController(10000, () => {
  console.log('查询超时！');
});

controller.start();

// 执行查询...

controller.cancel(); // 取消超时
```

**自适应超时策略：**

```typescript
import { AdaptiveTimeoutStrategy } from '@/lib/sql/executor';

const strategy = new AdaptiveTimeoutStrategy(30000);

// 根据查询复杂度计算超时时间
const timeout = strategy.calculateTimeout('high');  // 90秒

// 根据表数量和行数估算
const estimatedTimeout = strategy.estimateTimeout(5, 100000);
```

### 3. 结果格式化器 (ResultFormatter)

将数据库查询结果转换为标准格式。

**格式化列元数据：**

```typescript
import { resultFormatter } from '@/lib/sql/executor';

const metadata = resultFormatter.formatColumnMetadata(fields);
// 返回标准化的列信息（包括类型、长度、是否可空等）
```

**导出为 CSV：**

```typescript
const csv = resultFormatter.toCSV(data, columns);
console.log(csv);
// 输出：
// id,name,age
// 1,Alice,30
// 2,Bob,25
```

**导出为 JSON：**

```typescript
const json = resultFormatter.toJSON(data, true);  // true = 美化格式
```

**数据大小计算：**

```typescript
const size = resultFormatter.calculateDataSize(data);
const formatted = resultFormatter.formatDataSize(size);
console.log(`数据大小: ${formatted}`);  // 例如: "125.50 KB"
```

## 类型定义

### ExecutionOptions

```typescript
interface ExecutionOptions {
  timeout?: number;        // 超时时间（毫秒），默认 30000
  maxRows?: number;        // 最大返回行数，默认 10000
  enableCache?: boolean;   // 是否启用缓存，默认 true
  cacheKey?: string;       // 自定义缓存键
  parameters?: any[];      // 查询参数（用于参数化查询）
}
```

### ExecutionResult

```typescript
interface ExecutionResult<T = any> {
  success: boolean;           // 执行是否成功
  data?: T[];                 // 查询结果数据
  error?: string;             // 错误信息
  executionTime: number;      // 执行耗时（毫秒）
  rowCount: number;           // 返回行数
  fromCache: boolean;         // 是否来自缓存
  metadata: {
    columns: ColumnMetadata[];  // 列元数据
  };
}
```

### PaginatedResult

```typescript
interface PaginatedResult<T = any> extends ExecutionResult<T> {
  pagination: {
    page: number;           // 当前页码
    pageSize: number;       // 每页大小
    totalRows: number;      // 总行数
    totalPages: number;     // 总页数
  };
}
```

## 错误处理

查询执行器会自动标准化错误信息：

```typescript
const result = await queryExecutor.execute(sql, context);

if (!result.success) {
  // 友好的错误信息
  console.error(result.error);
  // 可能的错误：
  // - "数据库访问权限不足"
  // - "查询的表或字段不存在"
  // - "SQL 语法错误"
  // - "查询超时，请优化查询条件"
  // - "无法连接到数据库"
}
```

## 性能优化

### 1. 自动 LIMIT

查询执行器会自动为未指定 LIMIT 的查询添加限制：

```typescript
// 输入: SELECT * FROM users
// 实际执行: SELECT * FROM users LIMIT 10000
```

### 2. 结果缓存

小结果集（< 1000 行）会自动缓存 5 分钟：

```typescript
const result1 = await queryExecutor.execute(sql, context, {
  enableCache: true
});
// 第一次查询，从数据库获取

const result2 = await queryExecutor.execute(sql, context, {
  enableCache: true
});
// 第二次查询，从缓存获取
console.log(result2.fromCache);  // true
```

### 3. 超时控制

防止慢查询占用过多资源：

```typescript
const result = await queryExecutor.execute(sql, context, {
  timeout: 5000  // 5秒后自动取消
});
```

## 测试

运行测试：

```bash
# 运行所有执行器测试
npm run test:executor

# 或单独运行
npm run test:timeout-handler
npm run test:result-formatter
npm run test:query-executor

# 使用自定义测试脚本
npx tsx scripts/run-executor-tests.ts
```

测试覆盖：
- ✅ 超时处理器（6个测试）
- ✅ 结果格式化器（5个测试）
- ✅ 查询执行器（集成测试需要真实数据库连接）

## 最佳实践

### 1. 始终设置超时

```typescript
// ❌ 不推荐
const result = await queryExecutor.execute(sql, context);

// ✅ 推荐
const result = await queryExecutor.execute(sql, context, {
  timeout: 10000  // 根据查询复杂度设置合理的超时时间
});
```

### 2. 使用分页处理大结果集

```typescript
// ❌ 不推荐：一次性获取所有数据
const result = await queryExecutor.execute(
  'SELECT * FROM large_table',
  context
);

// ✅ 推荐：使用分页
const result = await queryExecutor.executePaginated(
  'SELECT * FROM large_table',
  context,
  { page: 1, pageSize: 100 }
);
```

### 3. 利用缓存提升性能

```typescript
// 对于频繁执行的查询，启用缓存
const result = await queryExecutor.execute(sql, context, {
  enableCache: true,
  cacheKey: 'dashboard:user-stats'  // 使用有意义的缓存键
});
```

### 4. 处理错误

```typescript
const result = await queryExecutor.execute(sql, context);

if (!result.success) {
  // 记录错误日志
  console.error(`查询失败: ${result.error}`);

  // 返回友好的错误给用户
  return {
    error: '查询执行失败，请联系管理员',
    details: result.error
  };
}
```

## 注意事项

1. **安全性**：查询执行器不进行 SQL 注入检查，应在调用前使用 SQL 验证器
2. **连接管理**：依赖 ConnectionManager，确保数据源已正确配置
3. **缓存失效**：元数据变更时需手动清除相关缓存
4. **资源限制**：默认最多返回 10000 行，可通过 maxRows 调整

## 依赖关系

```
QueryExecutor
├── ConnectionManager (数据库连接)
├── MultiLevelCache (结果缓存)
├── TimeoutHandler (超时控制)
└── ResultFormatter (结果格式化)
```

## 后续改进

- [ ] 支持流式查询（处理超大结果集）
- [ ] 查询统计和监控
- [ ] 慢查询日志
- [ ] 查询计划分析
- [ ] 连接池状态监控
