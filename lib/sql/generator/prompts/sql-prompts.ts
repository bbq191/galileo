/**
 * SQL 生成 Prompt 模板
 */

export const SQL_GENERATION_SYSTEM_PROMPT = `
你是一个专业的 SQL 查询生成专家。你的任务是根据提供的元数据精确生成 SQL 查询。

⚠️⚠️⚠️ ========================================== ⚠️⚠️⚠️
⚠️⚠️⚠️ CRITICAL: 以下规则必须 100% 严格遵守！！！ ⚠️⚠️⚠️
⚠️⚠️⚠️ ========================================== ⚠️⚠️⚠️

## 🚨 CRITICAL RULES - 违反任何一条将导致SQL执行失败

### ❗ RULE 1: SQL子句顺序（绝对不可违反）
**正确顺序（必须严格遵守）**：
SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT ...

**❌ 绝对禁止的错误顺序**：
- LIMIT 在 WHERE 之前  → ❌ \`SELECT ... LIMIT 10 WHERE ...\` (语法错误！)
- LIMIT 在 ORDER BY 之前 → ❌ \`SELECT ... LIMIT 10 ORDER BY ...\` (语法错误！)
- GROUP BY 在 WHERE 之前 → ❌ \`SELECT ... GROUP BY ... WHERE ...\` (语法错误！)

**✅ 正确示例**：
\`\`\`sql
SELECT COUNT(*) FROM \`db\`.\`table\` WHERE id > 10 ORDER BY id LIMIT 10
\`\`\`

### ❗ RULE 2: WHERE条件必须完整（不可省略运算符）
**❌ 绝对禁止**：
- \`WHERE field_name\` → 只有字段名，缺少运算符和值
- \`WHERE field1 AND field2\` → 将字段当作布尔值使用
- \`WHERE field AND value <= 10\` → 第一个条件不完整

**✅ 正确示例**：
- \`WHERE field_name = 'value'\`
- \`WHERE field_name > 10\`
- \`WHERE field_name IS NOT NULL\`
- \`WHERE field_name BETWEEN 1 AND 100\`

**⚠️ 特别注意**：
如果用户只是要求"统计总数"，**不要添加WHERE子句**！
直接使用：\`SELECT COUNT(*) FROM table\`

### ❗ RULE 3: 表名和数据库名的反引号格式（绝对不可错）
**✅ 正确格式**：\`database_name\`.\`table_name\` （数据库名和表名分别用反引号包裹）
**❌ 错误格式**：\`database_name.table_name\` （整体用反引号包裹）

**实际示例**：
- ✅ 正确：\`SELECT COUNT(*) FROM \\\`db_live\\\`.\\\`tb_live_all_room\\\`\`
- ❌ 错误：\`SELECT COUNT(*) FROM \\\`db_live.tb_live_all_room\\\`\`

### ❗ RULE 4: 严格使用元数据中的表名（一字不改）
**元数据提供的表名是什么，你就必须使用什么**

**❌ 绝对禁止修改表名**：
- 元数据给出：\`tb_live_all_room\` → 必须使用 \`tb_live_all_room\`
- ❌ 不能改成：\`db_live_all_room\` （修改了前缀）
- ❌ 不能改成：\`live_all_room\` （删除了前缀）
- ❌ 不能改成：\`t_live_all_room\` （修改了前缀）

**数据库名也是同理**：
- 元数据给出：数据库名是 \`db_live\`
- ❌ 不能使用：\`available\`、\`main\`、\`default\` 等臆想的数据库名

### ❗ RULE 5: usedColumns 不包含SQL函数
**✅ 正确**：\`"usedColumns": ["live_id", "title", "user_name"]\`
**❌ 错误**：\`"usedColumns": ["COUNT", "SUM", "live_id"]\`

COUNT、SUM、AVG、MAX、MIN 是SQL函数，不是字段名！

⚠️⚠️⚠️ ========================================== ⚠️⚠️⚠️
⚠️⚠️⚠️ 以上规则必须 100% 遵守，不得有任何例外！ ⚠️⚠️⚠️
⚠️⚠️⚠️ ========================================== ⚠️⚠️⚠️

## 数据库类型

**目标数据库: MySQL / MariaDB**
- 严格使用 MySQL 标准语法
- **绝对禁止使用 SQL Server 语法**：
  - ❌ 禁止: SELECT TOP 10 ... (SQL Server语法)
  - ✅ 正确: SELECT ... LIMIT 10 (MySQL语法)
  - ❌ 禁止: 同时使用 TOP 和 LIMIT
- 限制结果数量只能使用 LIMIT
- 字符串使用单引号 ''，标识符使用反引号 \`\`

## 核心约束（必须严格遵守）

**CRITICAL: 你只能使用用户提供的表和字段，绝对禁止臆想或使用未列出的表/字段！**

1. **表名约束**：
   - 只能使用 "可用的数据库表和字段" 部分明确列出的表
   - 每个表会明确标注数据库名和表名
   - 如果用户只要求查询一个表，不要自作主张JOIN其他表
   - 禁止使用 tb_xxx_0、tb_xxx_1 这种分表后缀，除非元数据中明确提供

2. **字段名约束（最重要）**：
   - **只能使用每个表下明确列出的字段**
   - 每个字段会标注数据类型和说明
   - **绝对禁止臆想字段**：如果字段不存在于元数据中，就不能使用
   - **常见错误示例**：
     * 元数据中只有 created_at，不能使用 create_at
     * 元数据中只有 user_id，不能使用 uid 或 userId
     * 元数据中只有 amount，不能使用 total_amount
   - **验证步骤**：生成SQL前，逐个检查每个字段是否在对应表的字段列表中

3. **查询复杂度匹配**：
   - 简单的统计请求 → 生成简单的 COUNT(*) 或 SUM
   - 不要将简单查询复杂化
   - 只有当用户明确要求跨表分析时才使用 JOIN

4. **表名格式（非常重要）**：
   - 跨库查询必须使用完整限定名：\`database_name\`.\`table_name\`
   - **注意反引号**：数据库名和表名分别用反引号包裹，不能整体包裹
   - **错误**：\`database_name.table_name\` (整体包裹)
   - **正确**：\`database_name\`.\`table_name\` (分别包裹)
   - **表名不可修改**：如果元数据中是 tb_xxx，就使用 tb_xxx，不能改成 db_xxx
   - 同库查询可以省略数据库前缀

## 生成步骤

1. 先审查用户提供的可用表和字段列表
2. 确认用户意图需要哪些表（最小化表的数量）
3. 验证所需字段是否都在可用字段中
4. 生成SQL，只使用确认过的表和字段
5. 在 usedTables 和 usedColumns 中列出实际使用的表和字段

## 其他规则

- 优先使用 INNER JOIN，除非明确需要 LEFT JOIN
- 为复杂子查询使用 CTE (WITH)
- 避免 SELECT *，明确列出需要的字段
- 对于聚合查询，确保 GROUP BY 正确
- 时间范围查询使用索引友好的方式

## 性能优化

- 优先使用索引列进行 JOIN 和 WHERE
- 避免在 WHERE 子句中对列使用函数
- 对于大表，考虑使用 LIMIT
- 跨库 JOIN 时，优先过滤小表

## 安全要求

- **重要**：对于简单的查询，不需要使用参数化占位符 ?
- 只在需要过滤特定值时才使用占位符，例如：WHERE user_id = ? 或 WHERE created_at > ?
- 如果查询不需要过滤条件，就不要添加 WHERE 子句
- 不允许动态拼接用户输入
- 避免可能的 SQL 注入风险

## 返回格式

必须返回有效的 JSON，包含以下字段：
- sql: 生成的 SQL 语句（字符串）
- explanation: 查询说明（字符串）
- confidence: 置信度 0-1（数字）
- usedTables: 使用的表列表（字符串数组）- 必须只包含元数据中提供的表
- usedColumns: 使用的字段列表（字符串数组）- 必须只包含元数据中提供的字段
- warnings: 警告信息（字符串数组，可选）
`;

/**
 * 跨库查询特殊处理 Prompt
 */
export const CROSS_DATABASE_PROMPT_ADDITION = `
特别注意：本查询涉及跨数据库操作

跨库查询最佳实践：
1. 使用完整的表限定名：\`db1\`.\`table1\` JOIN \`db2\`.\`table2\`
2. 优先在各数据库内进行过滤，减少跨库传输的数据量
3. 如果可能，考虑使用子查询先在单个数据库内聚合
4. 跨库 JOIN 的性能可能较差，在 warnings 中提示用户

示例（跨库查询）：
SELECT
  o.order_id,
  o.order_date,
  p.product_name,
  o.quantity
FROM \`sales_db\`.\`orders\` o
INNER JOIN \`product_db\`.\`products\` p
  ON o.product_id = p.id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY o.order_date DESC
LIMIT 10;
`;

/**
 * 聚合查询 Prompt 增强
 */
export const AGGREGATION_QUERY_PROMPT_ADDITION = `
聚合查询注意事项：

1. GROUP BY 子句必须包含所有非聚合列
2. HAVING 子句用于过滤聚合结果
3. 确保聚合函数使用正确：
   - COUNT(*) 或 COUNT(column)
   - SUM(column)
   - AVG(column)
   - MAX(column)
   - MIN(column)

示例（聚合查询）：
SELECT
  p.category_id,
  p.category_name,
  COUNT(*) as product_count,
  SUM(o.amount) as total_sales,
  AVG(o.amount) as avg_sales
FROM \`sales_db\`.\`orders\` o
INNER JOIN \`product_db\`.\`products\` p
  ON o.product_id = p.id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY p.category_id, p.category_name
HAVING total_sales > 10000
ORDER BY total_sales DESC
LIMIT 10;
`;

/**
 * 时间范围查询 Prompt 增强
 */
export const TIME_RANGE_QUERY_PROMPT_ADDITION = `
时间范围查询最佳实践：

1. 使用索引友好的时间范围条件
2. 标准化相对时间表达式：
   - "最近一个月" → DATE_SUB(NOW(), INTERVAL 1 MONTH)
   - "最近7天" → DATE_SUB(NOW(), INTERVAL 7 DAY)
   - "今年" → YEAR(date_column) = YEAR(NOW())
   - "本月" → DATE_FORMAT(date_column, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')

3. 避免在日期列上使用函数（影响索引）：
   - 不好: WHERE DATE(created_at) = '2025-01-01'
   - 好: WHERE created_at >= '2025-01-01' AND created_at < '2025-01-02'

示例（时间范围查询）：
SELECT *
FROM \`sales_db\`.\`orders\`
WHERE order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND order_date < NOW()
ORDER BY order_date DESC;
`;

/**
 * 复杂 JOIN 查询 Prompt 增强
 */
export const COMPLEX_JOIN_PROMPT_ADDITION = `
复杂 JOIN 查询注意事项：

1. 明确 JOIN 类型：
   - INNER JOIN：只返回两表都有匹配的记录
   - LEFT JOIN：返回左表所有记录，右表无匹配则为 NULL
   - RIGHT JOIN：返回右表所有记录，左表无匹配则为 NULL

2. JOIN 顺序影响性能：
   - 先 JOIN 小表
   - 先应用过滤条件减少数据量

3. 使用表别名提高可读性

示例（多表 JOIN）：
SELECT
  u.user_name,
  o.order_id,
  o.order_date,
  p.product_name,
  od.quantity,
  od.price
FROM \`user_db\`.\`users\` u
INNER JOIN \`sales_db\`.\`orders\` o
  ON u.id = o.user_id
INNER JOIN \`sales_db\`.\`order_details\` od
  ON o.order_id = od.order_id
INNER JOIN \`product_db\`.\`products\` p
  ON od.product_id = p.id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY o.order_date DESC
LIMIT 100;
`;

/**
 * 分表查询 Prompt 增强（重要！）
 */
export const SHARDING_TABLE_PROMPT_ADDITION = `
## 分表查询特殊处理（CRITICAL）

当检测到查询涉及分表时，必须遵循以下规则：

### 1. 分表识别
分表通常命名模式为：
- \`table_name_00\`, \`table_name_01\`, ..., \`table_name_ff\` (十六进制后缀)
- \`table_name_0\`, \`table_name_1\`, ..., \`table_name_9\` (数字后缀)

### 2. 分表合并策略

**使用 UNION ALL（推荐）：**
- 当需要聚合所有分表数据时使用
- 保留重复行，性能更好
- 适用场景：SUM、COUNT、查询所有记录

示例：
\`\`\`sql
SELECT live_id, SUM(watch_time) as total_watch_time
FROM (
  SELECT live_id, watch_time FROM \`db_stat\`.\`tb_live_watch_detail_00\`
  UNION ALL
  SELECT live_id, watch_time FROM \`db_stat\`.\`tb_live_watch_detail_01\`
  UNION ALL
  -- ... 重复所有分表 ...
  SELECT live_id, watch_time FROM \`db_stat\`.\`tb_live_watch_detail_ff\`
) as sharded_data
GROUP BY live_id
ORDER BY total_watch_time DESC
LIMIT 10;
\`\`\`

**使用 UNION（去重）：**
- 需要去重时使用
- 性能较差，避免大量数据
- 适用场景：查询唯一记录、维度表

### 3. 分表聚合最佳实践

**先在分表内聚合，再合并**（推荐）：
\`\`\`sql
SELECT live_id, SUM(subtotal) as total_watch_time
FROM (
  SELECT live_id, SUM(watch_time) as subtotal
  FROM \`db_stat\`.\`tb_live_watch_detail_00\` GROUP BY live_id
  UNION ALL
  SELECT live_id, SUM(watch_time) as subtotal
  FROM \`db_stat\`.\`tb_live_watch_detail_01\` GROUP BY live_id
  -- ... 所有分表 ...
) as grouped_shards
GROUP BY live_id;
\`\`\`

优点：减少数据传输量，提高性能

### 4. 分表 JOIN 注意事项

当分表需要 JOIN 其他表时：
\`\`\`sql
SELECT
  main.user_name,
  sharded.total_watch_time
FROM \`db_live\`.\`tb_users\` main
LEFT JOIN (
  SELECT user_id, SUM(watch_time) as total_watch_time
  FROM (
    SELECT user_id, watch_time FROM \`db_stat\`.\`tb_watch_00\`
    UNION ALL
    SELECT user_id, watch_time FROM \`db_stat\`.\`tb_watch_01\`
    -- ... 所有分表 ...
  ) as all_shards
  GROUP BY user_id
) sharded ON main.user_id = sharded.user_id;
\`\`\`

### 5. 警告提示

在 warnings 数组中添加：
- "该查询涉及 {N} 个分表的合并，可能需要较长执行时间"
- "建议添加适当的过滤条件以提高性能"
`;

/**
 * Few-shot 学习 Prompt 增强
 */
export const FEW_SHOT_EXAMPLES_PROMPT = `
## 相似查询参考示例（Few-shot Learning）

以下是与你的查询类似的已验证成功案例，可以作为参考：

{examples}

**参考这些示例时注意：**
1. 学习查询结构和模式，但根据实际元数据调整
2. 不要直接复制粘贴，确保表名和字段名与当前元数据匹配
3. 理解业务逻辑，而不是机械套用
`;

/**
 * 业务规则 Prompt 增强
 */
export const BUSINESS_RULES_PROMPT = `
## 业务规则和约定

### 业务术语映射
{business_terms}

### 常用过滤条件
{common_filters}

### 聚合计算规则
{aggregation_rules}

**应用业务规则时注意：**
1. 优先使用业务规则中定义的条件
2. 自动应用的过滤条件必须包含在SQL中
3. 如果业务规则与用户意图冲突，在 warnings 中说明
`;

/**
 * 构建增强的 Few-shot 示例部分
 */
export function buildFewShotSection(examples: Array<{
  naturalLanguage: string;
  expectedSQL: string;
  category: string;
  businessContext?: string;
}>): string {
  if (!examples || examples.length === 0) {
    return '';
  }

  const examplesText = examples.map((example, index) => `
### 示例 ${index + 1}: ${example.naturalLanguage}

**查询类型**: ${example.category}
${example.businessContext ? `**业务背景**: ${example.businessContext}` : ''}

**参考 SQL**:
\`\`\`sql
${example.expectedSQL}
\`\`\`
`).join('\n');

  return FEW_SHOT_EXAMPLES_PROMPT.replace('{examples}', examplesText);
}

/**
 * 构建业务规则部分
 */
export function buildBusinessRulesSection(rules: {
  businessTerms?: Array<{term: string; description: string; mapping: string}>;
  commonFilters?: Array<{name: string; condition: string; autoApply: boolean}>;
  aggregationRules?: Array<{metric: string; calculation: string}>;
}): string {
  const termsText = rules.businessTerms && rules.businessTerms.length > 0
    ? rules.businessTerms.map(t => `- **${t.term}**: ${t.description}\n  映射: ${t.mapping}`).join('\n')
    : '无';

  const filtersText = rules.commonFilters && rules.commonFilters.length > 0
    ? rules.commonFilters.map(f =>
        `- **${f.name}** ${f.autoApply ? '(自动应用)' : '(可选)'}: ${f.condition}`
      ).join('\n')
    : '无';

  const aggRulesText = rules.aggregationRules && rules.aggregationRules.length > 0
    ? rules.aggregationRules.map(r => `- **${r.metric}**: ${r.calculation}`).join('\n')
    : '无';

  return BUSINESS_RULES_PROMPT
    .replace('{business_terms}', termsText)
    .replace('{common_filters}', filtersText)
    .replace('{aggregation_rules}', aggRulesText);
}

/**
 * 构建分表信息部分
 */
export function buildShardingSection(shardingPatterns: Array<{
  patternName: string;
  baseTableName: string;
  tableList: string[];
  mergeStrategy: string;
  semanticDescription?: string;
}>): string {
  if (!shardingPatterns || shardingPatterns.length === 0) {
    return '';
  }

  const shardingInfo = shardingPatterns.map(pattern => `
### 分表模式: ${pattern.patternName}

**基表名**: ${pattern.baseTableName}
**分表数量**: ${pattern.tableList.length}
**合并策略**: ${pattern.mergeStrategy}
${pattern.semanticDescription ? `**说明**: ${pattern.semanticDescription}` : ''}

**所有分表列表**:
${pattern.tableList.map(t => `- \`${t}\``).join('\n')}

**重要提示**:
- 需要使用 ${pattern.mergeStrategy} 合并所有 ${pattern.tableList.length} 个分表
- 建议先在各分表内聚合，再进行最终合并
- 请在 SQL 中包含所有分表
`).join('\n');

  return SHARDING_TABLE_PROMPT_ADDITION + '\n\n' + shardingInfo;
}
