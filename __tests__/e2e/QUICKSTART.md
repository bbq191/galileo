# 端到端测试快速运行指南

## 🚀 5 分钟快速开始

### 步骤 1: 启动开发服务器

```bash
npm run dev
```

保持服务器运行在 http://localhost:3000

### 步骤 2: 确保数据源已配置

1. 打开浏览器访问 http://localhost:3000
2. 在系统中添加一个 MySQL/MariaDB 数据源
3. 测试连接，确保状态为 "connected"

### 步骤 3: 初始化测试数据

```bash
npm run test:e2e:setup
```

这将创建 4 个测试数据库和多个测试表，并插入测试数据。

### 步骤 4: 同步元数据

```bash
# 方式 1: 命令行同步
npm run db:migrate:ai

# 方式 2: 在界面上手动触发同步
# 访问元数据管理页面，点击"同步"按钮
```

### 步骤 5: 运行测试

```bash
# 运行所有 50 个测试
npm run test:e2e

# 或运行特定类别
npm run test:e2e:single    # 单表查询（10个）
npm run test:e2e:multi     # 多表JOIN（10个）
npm run test:e2e:cross     # 跨库查询（10个）
npm run test:e2e:agg       # 聚合统计（10个）
npm run test:e2e:complex   # 复杂查询（10个）
```

### 步骤 6: 查看结果

测试完成后会在控制台输出：
- 总测试数
- 通过/失败数
- 成功率
- 性能指标
- 详细的每个测试结果

## 📊 预期结果

成功的测试运行应该看到：

```
================================================================================
端到端测试结果
================================================================================

总测试数: 50
通过: 42 ✓
失败: 8 ✗
成功率: 84.00%
平均总耗时: 1250ms
平均执行耗时: 180ms

按类别统计:
  single-table: 9/10 (90.00%)
  multi-table: 8/10 (80.00%)
  cross-database: 7/10 (70.00%)
  aggregation: 10/10 (100.00%)
  complex: 8/10 (80.00%)
```

## 🎯 性能目标

根据第二阶段文档，测试应达到以下目标：

- **SQL 正确率**: > 85%
- **简单查询响应时间**: < 500ms
- **中等查询响应时间**: < 2000ms
- **复杂查询响应时间**: < 5000ms

## 🐛 常见问题

### 问题 1: 服务器连接失败

```
❌ 错误: 无法连接到服务器 http://localhost:3000
```

**解决**: 确保 `npm run dev` 正在运行

### 问题 2: 未找到数据源

```
没有找到可用的数据源
```

**解决**: 在系统界面中添加并测试数据源连接

### 问题 3: 未找到测试表

```
未找到相关的数据表
```

**解决**:
1. 运行 `npm run test:e2e:setup` 初始化测试数据
2. 运行 `npm run db:migrate:ai` 同步元数据

### 问题 4: SQL 生成失败

**解决**:
- 检查 AI 模型配置（Deepseek API）
- 检查元数据的语义描述是否完整
- 检查表关系是否正确建立

## 🧹 清理测试数据

测试完成后，可以清理测试数据：

```bash
npm run test:e2e:cleanup
```

这将删除所有测试数据库和相关元数据。

## 📝 生成测试报告

```bash
npm run test:e2e:report
```

报告将保存在 `reports/e2e/` 目录：
- **HTML 报告**: 可视化界面，用浏览器打开
- **Markdown 报告**: 文本格式，便于版本控制
- **JSON 报告**: 结构化数据，便于分析

## 🔧 高级选项

### 并行执行（更快）

```bash
npm run test:e2e -- --parallel --concurrency=10
```

### 指定服务器地址

```bash
npm run test:e2e -- --base-url=http://localhost:4000
```

### 组合选项

```bash
npm run test:e2e -- --category=cross-database --parallel --report
```

## 📚 更多信息

- 详细文档: [README.md](./README.md)
- 开发计划: [docs/planning/phase2-sql-generate.md](../../docs/planning/phase2-sql-generate.md)
- 测试用例: [test-cases/index.ts](./test-cases/index.ts)

## ✅ 完整流程示例

```bash
# 1. 启动服务器
npm run dev

# 2. 新开终端，初始化测试数据
npm run test:e2e:setup

# 3. 同步元数据
npm run db:migrate:ai

# 4. 运行测试
npm run test:e2e

# 5. 生成报告（可选）
npm run test:e2e:report

# 6. 清理（可选）
npm run test:e2e:cleanup
```

## 🎉 成功标准

测试成功运行的标志：
- ✅ 所有 50 个测试用例都被执行
- ✅ 成功率达到 85% 以上
- ✅ 平均响应时间在合理范围内
- ✅ 没有系统崩溃或严重错误
- ✅ 生成了详细的测试报告

---

祝测试顺利！🚀
