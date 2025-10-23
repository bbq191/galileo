# API 集成测试

## 概述

本目录包含 Galileo 系统第一阶段（准备阶段）的所有 RESTful API 集成测试。

## 测试文件结构

```
__tests__/api/
├── README.md                        # 本文件
├── datasources.api.test.ts         # 数据源管理 API 测试
├── metadata.api.test.ts            # 元数据查询 API 测试
└── relationships.api.test.ts       # 关系查询 API 测试
```

## 运行测试

### 前置条件

1. **启动开发服务器**:
   ```bash
   npm run dev
   ```

2. **配置环境变量**（可选）:
   ```bash
   export API_BASE_URL=http://localhost:3000/api
   ```

### 运行所有 API 测试

```bash
# 运行所有 API 集成测试
npm test -- __tests__/api

# 或者使用 Jest 直接运行
npx jest __tests__/api
```

### 运行特定测试文件

```bash
# 仅测试数据源管理 API
npx jest __tests__/api/datasources.api.test.ts

# 仅测试元数据查询 API
npx jest __tests__/api/metadata.api.test.ts

# 仅测试关系查询 API
npx jest __tests__/api/relationships.api.test.ts
```

### 运行特定测试套件

```bash
# 运行特定 describe 块
npx jest __tests__/api/datasources.api.test.ts -t "创建数据源"

# 运行特定 it 测试
npx jest __tests__/api/metadata.api.test.ts -t "应该返回分页的表列表"
```

### 监视模式

```bash
# 监视模式运行测试
npx jest --watch __tests__/api
```

### 查看测试覆盖率

```bash
# 生成覆盖率报告
npx jest --coverage __tests__/api
```

## 测试覆盖范围

### 1. 数据源管理 API (`datasources.api.test.ts`)

- ✅ POST /api/datasources - 创建数据源
  - 成功创建
  - 缺少必填字段
  - 重复名称冲突

- ✅ GET /api/datasources - 获取数据源列表
  - 返回列表
  - 按状态过滤

- ✅ GET /api/datasources/:id - 获取数据源详情
  - 成功获取
  - 资源不存在

- ✅ PUT /api/datasources/:id - 更新数据源
  - 成功更新

- ✅ POST /api/datasources/:id/test - 测试连接
  - 测试连接
  - 资源不存在

- ✅ POST /api/datasources/:id/sync - 触发同步
  - 成功触发
  - 强制同步参数

- ✅ DELETE /api/datasources/:id - 删除数据源
  - 成功删除
  - 验证级联删除

### 2. 元数据查询 API (`metadata.api.test.ts`)

- ✅ GET /api/metadata/databases - 获取数据库列表
  - 参数验证
  - 成功返回列表

- ✅ GET /api/metadata/tables - 获取表列表
  - 参数验证
  - 分页功能
  - 搜索功能
  - 排序功能

- ✅ GET /api/metadata/columns - 获取字段列表
  - 参数验证
  - 成功返回字段列表

- ✅ GET /api/metadata/search - 搜索元数据
  - 参数验证
  - 搜索所有类型（type=all）
  - 搜索数据库（type=database）
  - 搜索表（type=table）
  - 搜索字段（type=column）
  - 按数据源过滤
  - 按数据库过滤
  - 分页支持

### 3. 关系查询 API (`relationships.api.test.ts`)

- ✅ GET /api/relationships - 获取关系列表
  - 返回所有关系
  - 只返回显式关系（type=explicit）
  - 只返回推断关系（type=inferred）
  - 按表 ID 过滤
  - 按验证状态过滤
  - 按最小置信度过滤
  - 分页支持

- ✅ GET /api/relationships/graph - 获取关系图谱
  - 参数验证
  - 按表 ID 获取图谱
  - 按数据库 ID 获取图谱
  - 排除推断关系
  - 最小置信度过滤
  - 自定义深度
  - 节点和边结构验证

- ✅ POST /api/relationships/verify - 验证推断关系
  - 参数验证
  - 资源不存在
  - 验证关系（action=verify）
  - 拒绝关系（action=reject）
  - 转换为显式关系（action=convert）

## 测试数据准备

测试会自动创建和清理测试数据：

1. **beforeAll**: 创建测试数据源和元数据
2. **测试执行**: 使用创建的测试数据
3. **afterAll**: 清理测试数据（部分测试）

## 常见问题

### Q1: 测试失败提示"Connection refused"

**A**: 确保开发服务器正在运行：
```bash
npm run dev
```

### Q2: 测试提示"testSourceId 未设置"

**A**: 这是正常的跳过提示，说明没有可用的测试数据。可能原因：
- 数据库未初始化
- 没有创建测试数据源
- 数据源同步未完成

### Q3: 如何调试失败的测试？

**A**: 使用 `--verbose` 标志运行测试：
```bash
npx jest --verbose __tests__/api/datasources.api.test.ts
```

或者在测试中添加 `console.log` 输出调试信息。

### Q4: 测试运行很慢

**A**: API 集成测试会实际调用 API，速度较慢。可以：
- 只运行特定测试文件
- 使用 `--maxWorkers=1` 减少并发

## 最佳实践

1. **测试隔离**: 每个测试应该独立运行，不依赖其他测试的结果
2. **数据清理**: 使用 `afterEach` 或 `afterAll` 清理测试数据
3. **错误处理**: 测试应该覆盖成功和失败的场景
4. **断言明确**: 使用具体的断言，避免模糊的测试
5. **测试命名**: 使用描述性的测试名称，清楚说明测试目的

## 持续集成

在 CI/CD 管道中运行 API 测试：

```yaml
# .github/workflows/api-tests.yml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run dev &
      - run: sleep 10  # 等待服务器启动
      - run: npm test -- __tests__/api
```

## 贡献指南

添加新的 API 测试时：

1. 在相应的测试文件中添加新的 `describe` 或 `it` 块
2. 遵循现有的测试结构和命名约定
3. 添加必要的数据准备和清理逻辑
4. 更新本 README 文档

## 参考文档

- [API 文档](../../docs/api-documentation.md)
- [Jest 文档](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
