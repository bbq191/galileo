# 端到端 (E2E) 测试

本目录包含 Galileo 系统的端到端测试，测试从自然语言输入到 SQL 执行的完整流程。

## 📋 测试覆盖

### 测试场景

- **单表查询** (10个测试): 简单查询、过滤、排序、聚合
- **多表JOIN** (10个测试): 两表关联、统计、分组
- **跨库查询** (10个测试): 跨数据库的复杂查询
- **聚合统计** (10个测试): SUM、COUNT、AVG、GROUP BY
- **复杂查询** (10个测试): 多条件、子查询、多表关联

**总计**: 50个标准查询场景

### 测试验证

每个测试用例验证：
- ✅ 意图识别正确性
- ✅ SQL 语法正确性
- ✅ SQL 可执行性
- ✅ 结果格式正确性
- ✅ 性能指标（响应时间）

## 🚀 快速开始

### 1. 准备环境

确保 Next.js 开发服务器正在运行：

```bash
npm run dev
```

### 2. 初始化测试数据

```bash
# 创建测试数据库和表
npm run test:e2e:setup

# 清理测试数据
npm run test:e2e:cleanup
```

测试数据包括：
- `test_e2e_db1`: 用户表、订单表
- `test_e2e_sales`: 订单明细表
- `test_e2e_products`: 产品表、分类表

### 3. 同步元数据

初始化测试数据后，需要同步元数据到 Galileo：

```bash
# 方式1: 运行元数据同步
npm run db:migrate:ai

# 方式2: 在界面上触发同步
# 访问 http://localhost:3000/metadata 并点击"同步元数据"
```

### 4. 运行测试

```bash
# 运行所有测试
npm run test:e2e

# 运行特定类别的测试
npm run test:e2e -- --category=single-table
npm run test:e2e -- --category=multi-table
npm run test:e2e -- --category=cross-database
npm run test:e2e -- --category=aggregation
npm run test:e2e -- --category=complex

# 并行执行（更快）
npm run test:e2e -- --parallel

# 生成测试报告
npm run test:e2e -- --report
```

### 5. 查看报告

测试报告保存在 `__tests__/reports/e2e/` 目录下：

- **HTML 报告**: 可视化报告，在浏览器中打开查看
- **Markdown 报告**: 文本报告，适合 Git 提交
- **JSON 报告**: 结构化数据，用于进一步分析

## 📊 测试报告示例

### 控制台输出

```
================================================================================
端到端测试结果
================================================================================

总测试数: 50
通过: 42 ✓
失败: 8 ✗
成功率: 84.00%
平均总耗时: 1523ms
平均执行耗时: 234ms

按类别统计:
  single-table: 9/10 (90.00%)
  multi-table: 8/10 (80.00%)
  cross-database: 7/10 (70.00%)
  aggregation: 10/10 (100.00%)
  complex: 8/10 (80.00%)
```

### HTML 报告

HTML 报告包含：
- 📊 可视化统计图表
- ✅ 通过的测试详情
- ❌ 失败的测试详情
- 🕐 性能指标
- 📝 生成的 SQL

## 🔧 配置选项

### 命令行参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--category=<类别>` | 只运行指定类别的测试 | `--category=single-table` |
| `--parallel` | 并行执行测试 | `--parallel` |
| `--concurrency=<数量>` | 最大并发数（默认5） | `--concurrency=10` |
| `--report` | 生成测试报告 | `--report` |
| `--base-url=<URL>` | 指定服务器地址 | `--base-url=http://localhost:4000` |

### 环境变量

```bash
# 设置服务器地址
export BASE_URL=http://localhost:3000

# 运行测试
npm run test:e2e
```

## 📁 目录结构

```
__tests__/e2e/
├── README.md                    # 本文件
├── run-e2e-tests.ts            # 主测试运行器
├── setup/
│   └── init-test-data.ts       # 测试数据初始化
├── test-cases/
│   └── index.ts                # 测试用例定义
├── utils/
│   └── test-helpers.ts         # 测试辅助工具
└── reports/                    # 测试报告输出目录
```

## 🎯 测试用例示例

### 单表查询

```typescript
{
  id: 'single-001',
  category: 'single-table',
  description: '查询所有用户',
  naturalLanguageQuery: '查询所有用户信息',
  expectedSQLPatterns: [/SELECT.*FROM.*users/i],
  shouldPass: true,
  minRows: 1,
}
```

### 跨库查询

```typescript
{
  id: 'cross-001',
  category: 'cross-database',
  description: '跨库查询订单和产品',
  naturalLanguageQuery: '查询所有订单及对应的产品信息',
  expectedSQLPatterns: [
    /test_e2e_sales.*order_items/i,
    /test_e2e_products.*products/i,
    /JOIN/i
  ],
  shouldPass: true,
  minRows: 1,
}
```

## 🐛 故障排查

### 测试失败常见原因

1. **服务器未运行**
   ```bash
   npm run dev
   ```

2. **测试数据未初始化**
   ```bash
   npm run test:e2e:setup
   ```

3. **元数据未同步**
   ```bash
   npm run db:migrate:ai
   ```

4. **端口被占用**
   ```bash
   # 修改端口或停止占用进程
   npm run dev -- -p 4000
   ```

### 查看日志

测试运行时会输出详细日志：
- 每个测试的执行状态
- 生成的 SQL 语句
- 错误信息和堆栈

## 📈 性能基准

根据文档要求的性能指标：

### 意图识别性能

| 查询复杂度 | P95 响应时间 | 准确率目标 |
|-----------|-------------|-----------|
| 简单查询   | < 200ms     | > 95%     |
| 中等查询   | < 500ms     | > 90%     |
| 复杂查询   | < 1000ms    | > 85%     |

### SQL 生成性能

| 查询复杂度  | P95 响应时间 | SQL 正确率 |
|-----------|-------------|-----------|
| 单表查询   | < 300ms     | > 95%     |
| 2-3表JOIN | < 800ms     | > 90%     |
| 4+表/跨库  | < 2000ms    | > 85%     |

## 🔄 持续集成

### GitHub Actions 示例

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run db:push
      - run: npm run test:e2e:setup
      - run: npm run dev &
      - run: sleep 10
      - run: npm run test:e2e -- --report
      - uses: actions/upload-artifact@v2
        with:
          name: test-reports
          path: __tests__/reports/
```

## 📝 添加新测试

### 1. 定义测试用例

在 `test-cases/index.ts` 中添加：

```typescript
{
  id: 'custom-001',
  category: 'custom',
  description: '自定义测试描述',
  naturalLanguageQuery: '用户的自然语言查询',
  expectedSQLPatterns: [/期望的SQL模式/i],
  expectedColumns: ['期望的列名'],
  shouldPass: true,
  minRows: 1,
  maxRows: 10,
}
```

### 2. 运行测试

```bash
npm run test:e2e -- --category=custom
```

## 🤝 贡献指南

1. 编写清晰的测试用例描述
2. 使用实际的查询场景
3. 验证SQL模式而非完整SQL
4. 设置合理的行数范围
5. 添加注释说明测试目的

## 📚 相关文档

- [SQL 生成阶段开发计划](../../docs/planning/phase2-sql-generate.md)
- [测试策略](../../docs/planning/phase2-sql-generate.md#测试策略)
- [性能指标](../../docs/planning/phase2-sql-generate.md#性能指标-sla)

## 📞 支持

如有问题，请查看：
- 测试日志输出
- 生成的测试报告
- 项目文档

或提交 Issue 到项目仓库。
