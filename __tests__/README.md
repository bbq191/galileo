# API 集成测试文档

## 概述

本目录包含 Galileo 项目的 API 集成测试套件，用于验证所有重构后的 API 路由的功能正确性。

### 测试覆盖范围

| 测试套件 | 文件 | 覆盖的API路由 | 测试用例数 |
|---------|------|------------|-----------|
| 数据源API | `datasources.test.ts` | 5个路由 | 15+ |
| 元数据API | `metadata.test.ts` | 4个路由 | 12+ |
| 关系API | `relationships.test.ts` | 4个路由 | 13+ |
| 查询审计API | `query-audit.test.ts` | 5个路由 | 15+ |
| **总计** | **4个文件** | **18个路由** | **55+** |

### 覆盖的API路由

#### 数据源管理 (5个)
- ✅ `POST /api/datasources` - 创建数据源
- ✅ `GET /api/datasources/:id` - 获取数据源详情
- ✅ `PUT /api/datasources/:id` - 更新数据源
- ✅ `DELETE /api/datasources/:id` - 删除数据源
- ✅ `POST /api/datasources/:id/sync` - 同步元数据

#### 元数据查询 (4个)
- ✅ `GET /api/metadata/databases` - 获取数据库列表
- ✅ `GET /api/metadata/tables` - 获取表列表
- ✅ `GET /api/metadata/columns` - 获取列列表
- ✅ `GET /api/metadata/search` - 搜索元数据

#### 关系管理 (4个)
- ✅ `POST /api/metadata/relationships/infer` - 推断关系
- ✅ `GET /api/relationships` - 获取关系列表
- ✅ `GET /api/relationships/graph` - 获取关系图谱
- ✅ `POST /api/relationships/verify` - 验证关系

#### 查询和审计 (5个)
- ✅ `POST /api/query/execute` - 执行自然语言查询
- ✅ `POST /api/query/sql` - 执行SQL查询
- ✅ `GET /api/query/history` - 查询历史
- ✅ `GET /api/audit/logs` - 审计日志
- ✅ `GET /api/audit/stats` - 审计统计

## 环境准备

### 1. 安装依赖

```bash
npm install
```

### 2. 配置测试数据库

复制环境配置模板：

```bash
cp .env.test.example .env.test
```

编辑 `.env.test` 文件，填入真实的测试数据库配置：

```env
TEST_DB_HOST=localhost
TEST_DB_PORT=3306
TEST_DB_USER=root
TEST_DB_PASSWORD=your_password
TEST_DB_DATABASES=test_db

DATABASE_URL="mysql://root:your_password@localhost:3306/galileo_metadata"
```

### 3. 准备测试数据库

确保你有一个可用的MySQL数据库用于测试。测试会自动创建和清理数据。

**重要**:
- 测试使用真实的数据库连接，不是mock
- 测试会创建、修改和删除数据，请使用专门的测试数据库
- 不要使用生产数据库！

## 运行测试

### 运行所有API集成测试

```bash
npm run test:api
```

或者

```bash
npm run test:api:all
```

这将串行运行所有4个测试套件并生成测试报告。

### 运行单个测试套件

```bash
# 数据源API测试
npm run test:api:datasources

# 元数据API测试
npm run test:api:metadata

# 关系API测试
npm run test:api:relationships

# 查询和审计API测试
npm run test:api:query-audit
```

### 运行特定测试文件

```bash
jest __tests__/api/datasources.test.ts --runInBand
```

### 生成测试覆盖率报告

```bash
# 所有测试的覆盖率
npm run test:coverage

# 仅API测试的覆盖率
npm run test:coverage:api
```

## 测试特点

### 真实数据测试

- ✅ 使用真实的数据库连接
- ✅ 使用真实的数据源配置
- ✅ 测试真实的元数据同步流程
- ✅ 验证真实的关系推断
- ✅ 执行真实的SQL查询

### 自动清理

每个测试套件都包含自动清理机制：

- `beforeAll`: 初始化测试环境
- `afterEach`: 清理单个测试创建的数据
- `afterAll`: 清理整个测试套件创建的数据

### 测试隔离

- 使用 `--runInBand` 标志串行运行测试，避免数据库冲突
- 每个测试使用唯一的时间戳标识符
- 测试数据使用 `test-` 前缀便于识别和清理

## 测试报告

运行 `npm run test:api:all` 后，测试报告会保存到：

```
__tests__/TEST_REPORT.md
```

报告包含：
- 测试摘要（总数、通过、失败）
- 每个测试套件的详细结果
- 执行时间统计
- 覆盖率统计

## 故障排查

### 测试超时

如果测试超时，可以增加 `jest.config.ts` 中的 `testTimeout` 值：

```typescript
testTimeout: 60000, // 60秒
```

### 数据库连接失败

检查：
1. `.env.test` 配置是否正确
2. 数据库服务是否运行
3. 用户权限是否足够
4. 防火墙是否允许连接

### 测试失败

1. 查看测试输出的错误信息
2. 检查 `__tests__/TEST_REPORT.md` 中的详细错误
3. 手动清理测试数据：

```bash
# 连接到测试数据库
mysql -u root -p

# 删除测试数据
DELETE FROM DataSource WHERE name LIKE 'test-%';
DELETE FROM AuditLog WHERE userId LIKE 'test-%';
```

## 最佳实践

### 编写新测试

1. 遵循现有测试的模式
2. 使用 `test-` 前缀命名测试数据
3. 在 `afterEach` 或 `afterAll` 中清理数据
4. 使用辅助函数（`test-helpers.ts`）验证响应格式
5. 添加详细的测试描述

### 测试命名

```typescript
describe('API名称 - 功能描述', () => {
  it('应该[预期行为]', async () => {
    // 测试代码
  });
});
```

### 断言模式

```typescript
// 验证响应成功
assertSuccess(data);

// 验证响应失败
assertError(data, '错误信息关键字');

// 验证数据格式
assertDataSourceFormat(dataSource);
assertMetadataFormat(metadata);
assertRelationshipFormat(relationship);
assertPaginationFormat(paginatedData);
```

## 性能基准

典型测试执行时间（参考值）：

| 测试套件 | 测试数量 | 平均执行时间 |
|---------|---------|------------|
| 数据源API | 15 | ~45s |
| 元数据API | 12 | ~60s |
| 关系API | 13 | ~90s |
| 查询审计API | 15 | ~120s |
| **总计** | **55** | **~5分钟** |

## 持续集成

### GitHub Actions 配置示例

```yaml
name: API Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test_password
          MYSQL_DATABASE: test_db
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run API tests
        run: npm run test:api
        env:
          TEST_DB_HOST: 127.0.0.1
          TEST_DB_PORT: 3306
          TEST_DB_USER: root
          TEST_DB_PASSWORD: test_password
          TEST_DB_DATABASES: test_db

      - name: Upload test report
        uses: actions/upload-artifact@v2
        with:
          name: test-report
          path: __tests__/TEST_REPORT.md
```

## 贡献指南

添加新测试时：

1. 确定测试分类（数据源、元数据、关系、查询审计）
2. 在对应的测试文件中添加测试用例
3. 使用真实数据进行测试
4. 确保测试自动清理
5. 更新本文档的覆盖范围统计

## 相关文档

- [API路由重构文档](../docs/API_ROUTING_REFACTORING.md)
- [DI实施总结](../docs/DI_IMPLEMENTATION_SUMMARY.md)
- [服务编排层设计](../docs/service-orchestration-layer.md)

## 联系方式

如有问题或建议，请联系：

- 技术负责人：[邮箱]
- 提交Issue：[项目仓库]

---

**最后更新**: 2025-11-07
**维护人**: 开发团队
