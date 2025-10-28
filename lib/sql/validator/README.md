# SQL 验证器模块

SQL 验证器是 Galileo 系统中负责验证生成的 SQL 查询的核心模块，确保 SQL 的安全性、正确性和性能。

## 功能特性

### 1. 语法验证
- 使用 `node-sql-parser` 进行 SQL 语法解析
- 检测语法错误并提供错误位置信息
- 支持 MySQL/MariaDB 语法

### 2. 安全检查
- **SQL 注入防护**：检测 UNION SELECT、OR 1=1 等注入模式
- **危险操作拦截**：禁止 DROP、DELETE、UPDATE、INSERT 等写操作
- **系统表保护**：检测对 information_schema、mysql、sys 等系统数据库的访问
- **多语句检测**：防止多语句执行攻击
- **敏感函数检测**：拦截 LOAD_FILE、INTO OUTFILE、SLEEP 等敏感函数

### 3. 权限检查
- 验证用户是否有权限访问指定数据库和表
- 仅允许 SELECT 查询
- 支持细粒度的表级权限控制

### 4. 语义验证
- 验证表是否存在于元数据中
- 验证字段是否存在于对应的表中
- 检查跨库查询的表引用是否正确

### 5. 性能分析
- **SELECT * 检测**：建议明确指定需要的列
- **缺少 LIMIT 警告**：大数据量查询建议添加 LIMIT
- **跨库 JOIN 检测**：标识性能可能受影响的跨库查询
- **索引使用分析**：检查 WHERE 条件是否使用索引
- **函数优化建议**：检测在列上使用函数导致索引失效的情况
- **查询成本估算**：预估扫描行数和执行时间

## 模块结构

```
lib/sql/validator/
├── sql-validator.ts          # 主验证器
├── security-checker.ts        # 安全检查器
├── performance-analyzer.ts    # 性能分析器
├── permission-checker.ts      # 权限检查器
├── types.ts                   # 类型定义
├── index.ts                   # 模块导出
└── __tests__/
    └── sql-validator.test.ts  # 单元测试
```

## 使用方法

### 基本使用

```typescript
import { SQLValidator } from '@/lib/sql/validator';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

// 创建验证器实例
const validator = new SQLValidator();

// 准备元数据上下文
const context: MetadataContext = {
  tables: [...],
  relationships: [...],
  columns: [...],
  estimatedComplexity: 'medium'
};

// 验证 SQL
const sql = 'SELECT * FROM orders WHERE order_date >= NOW() - INTERVAL 30 DAY';
const result = await validator.validate(sql, context);

if (result.isValid) {
  console.log('SQL 验证通过');
  console.log('警告:', result.warnings);
  console.log('优化建议:', result.optimizationSuggestions);
  console.log('预估成本:', result.estimatedCost);
} else {
  console.error('SQL 验证失败');
  console.error('错误:', result.errors);
  console.error('安全问题:', result.securityIssues);
}
```

### 带权限检查

```typescript
import { DefaultUserPermissions } from '@/lib/sql/validator';

// 创建用户权限
const permissions = new DefaultUserPermissions(
  'user123',                    // 用户 ID
  ['sales_db', 'product_db'],  // 允许访问的数据库
  undefined,                    // 允许访问的表（undefined 表示所有表）
  ['SELECT']                    // 允许的操作
);

// 验证 SQL（带权限检查）
const result = await validator.validate(sql, context, permissions);
```

## 验证结果

### ValidationResult 接口

```typescript
interface ValidationResult {
  isValid: boolean;                           // 是否通过验证
  errors: ValidationError[];                  // 错误列表
  warnings: ValidationWarning[];              // 警告列表
  securityIssues: SecurityIssue[];           // 安全问题列表
  optimizationSuggestions: OptimizationSuggestion[];  // 优化建议列表
  estimatedCost: EstimatedCost;              // 预估成本
}
```

### 错误类型

- `syntax`: 语法错误
- `semantic`: 语义错误（表或字段不存在）
- `security`: 安全问题
- `permission`: 权限不足

### 安全问题严重级别

- `critical`: 严重问题，必须拒绝执行
- `high`: 高风险，强烈建议拒绝
- `medium`: 中等风险，建议审查
- `low`: 低风险，仅记录

## 测试

运行单元测试：

```bash
npm run test:sql-validator
```

测试覆盖场景：
- ✓ 简单 SELECT 查询
- ✓ 语法错误检测
- ✓ 危险操作检测（DROP、DELETE 等）
- ✓ SQL 注入检测
- ✓ 表不存在检测
- ✓ 字段不存在检测
- ✓ 跨库 JOIN 检测
- ✓ SELECT * 优化建议
- ✓ 权限检查
- ✓ 权限不足检测
- ✓ 复杂查询性能分析
- ✓ 多语句执行检测

## 扩展

### 自定义权限检查器

```typescript
import { UserPermissions } from '@/lib/sql/validator';

class CustomPermissions implements UserPermissions {
  constructor(
    public userId: string,
    private roles: string[]
  ) {}

  canAccessTable(database: string, table: string): boolean {
    // 自定义权限逻辑
    if (this.roles.includes('admin')) {
      return true;
    }
    // 其他角色的权限判断...
    return false;
  }
}
```

### 添加自定义安全检查

可以扩展 `SecurityChecker` 类来添加自定义的安全检查规则。

## SecurityChecker 详细说明

`SecurityChecker` 是安全检查的核心模块，提供全面的 SQL 安全检测功能。

### 配置选项

```typescript
interface SecurityCheckConfig {
  strictMode?: boolean;                    // 启用严格模式
  allowSystemTables?: boolean;             // 允许系统表查询
  customDangerousKeywords?: string[];      // 自定义危险关键字
  customSensitiveFunctions?: string[];     // 自定义敏感函数
}
```

### 基本使用

```typescript
import { SecurityChecker } from '@/lib/sql/validator/security-checker';

// 默认配置
const checker = new SecurityChecker();

// 自定义配置
const strictChecker = new SecurityChecker({
  strictMode: true,
  allowSystemTables: false
});

// 检查 SQL
const issues = await checker.check(sql);

// 判断是否有致命问题
if (checker.hasCriticalIssues(issues)) {
  throw new Error('SQL 包含致命安全问题');
}

// 获取严重程度统计
const stats = checker.getIssueSeverityStats(issues);
```

### 检测功能详解

#### 1. 危险操作检测
默认阻止以下操作：
- DROP, DELETE, TRUNCATE (删除数据)
- ALTER, CREATE, RENAME (修改结构)
- INSERT, UPDATE, REPLACE (修改数据)
- GRANT, REVOKE (权限操作)

#### 2. SQL 注入检测模式
- UNION SELECT 联合查询注入
- OR/AND 恒真条件 (1=1, 'x'='x')
- 单行注释 (--, #)
- 多行注释 (/* */)
- 多语句注入 (;)
- 存储过程调用 (EXEC, CALL)

#### 3. 系统表检测
- information_schema
- mysql
- sys
- performance_schema

#### 4. 敏感函数检测
- LOAD_FILE - 文件读取
- INTO OUTFILE/DUMPFILE - 文件写入
- LOAD DATA - 数据加载
- SLEEP/BENCHMARK - 时间延迟攻击
- GET_LOCK/RELEASE_LOCK - 锁操作

#### 5. 编码绕过检测（严格模式）
- 十六进制编码 (0x...)
- CHAR 函数编码
- CONCAT 函数滥用

### 测试覆盖

运行 SecurityChecker 测试：
```bash
npm run test:security-checker
```

测试涵盖：
- ✓ 27 个测试用例
- ✓ 所有危险操作类型
- ✓ 常见 SQL 注入模式
- ✓ 多语句执行检测
- ✓ 系统表访问检测
- ✓ 敏感函数检测
- ✓ 严格模式功能
- ✓ 边界情况和误报检测

### 实际应用示例

```typescript
// 1. 集成到验证流程
const validator = new SQLValidator();
const result = await validator.validate(sql, context);

if (result.securityIssues.length > 0) {
  // 记录安全问题
  console.error('安全问题:', result.securityIssues);

  // 检查严重程度
  const hasCritical = result.securityIssues.some(
    issue => issue.severity === 'critical'
  );

  if (hasCritical) {
    throw new Error('SQL 包含严重安全问题，禁止执行');
  }
}

// 2. 记录到审计日志
await auditLogger.log({
  sql,
  securityIssues: result.securityIssues,
  timestamp: new Date()
});
```

### 安全最佳实践

1. **始终先检查后执行** - 在执行任何 SQL 之前都应该进行安全检查
2. **记录所有安全问题** - 将检测到的问题记录到审计日志
3. **Critical 级别必须阻止** - 任何 critical 级别的问题都不应该执行
4. **定期审查日志** - 定期检查安全日志以发现攻击模式
5. **配合其他安全措施** - 安全检查应与参数化查询、权限控制等配合使用

## 性能指标

- 语法验证：< 10ms
- 安全检查：< 5ms
- 语义验证：< 20ms（取决于元数据规模）
- 性能分析：< 30ms
- 总计：通常 < 100ms

## 注意事项

1. **元数据依赖**：验证器依赖完整的元数据上下文，确保元数据已正确加载
2. **权限配置**：生产环境必须配置严格的权限检查
3. **安全第一**：任何严重安全问题都会导致验证失败
4. **性能建议**：优化建议仅供参考，不影响 SQL 执行

## 与其他模块的集成

SQL 验证器通常在以下流程中使用：

```
SQL 生成器 → SQL 验证器 → 查询执行器
              ↓
         审计日志记录
```

1. SQL 生成器生成 SQL 后立即调用验证器
2. 验证通过后才能进入查询执行器
3. 所有验证结果都应记录到审计日志

## 未来改进

- [ ] 支持更多数据库方言（PostgreSQL、Oracle 等）
- [ ] 机器学习驱动的性能预测
- [ ] 自动 SQL 重写优化
- [ ] 更精细的索引使用分析
- [ ] 查询计划分析集成

## 贡献

如需添加新的验证规则或优化建议，请：
1. 在对应的检查器类中添加逻辑
2. 更新类型定义
3. 添加单元测试
4. 更新本文档
