/**
 * SQL 生成器
 * 基于用户意图和元数据上下文生成 SQL 查询
 * 支持跨数据库查询
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { Parser } from 'node-sql-parser';
import { DeepseekClient } from '@/lib/ai/deepseek-client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext, TableContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerationResult, SQLGenerationOptions } from './types';
import { SQL_GENERATION_SYSTEM_PROMPT } from './prompts/sql-prompts';
import { CrossDatabaseHandler } from './cross-db-handler';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import { DI_TOKENS } from '@/lib/di/tokens';

@injectable()
export class SQLGenerator {
  private parser: Parser;

  constructor(
    @inject(DI_TOKENS.DeepseekClient) private readonly aiClient: DeepseekClient,
    @inject(DI_TOKENS.CrossDatabaseHandler) private readonly crossDbHandler: CrossDatabaseHandler,
    @inject(DI_TOKENS.QueryCacheManager) private readonly queryCacheManager: QueryCacheManager
  ) {
    this.parser = new Parser();
  }

  /**
   * 生成 SQL 查询（带缓存）
   */
  async generate(
    intent: QueryIntent,
    context: MetadataContext,
    options: SQLGenerationOptions = {}
  ): Promise<SQLGenerationResult> {
    const { useCache = true } = options;

    // 1. 尝试从缓存获取 SQL
    if (useCache) {
      const cachedSQL = await this.queryCacheManager.getSQL(intent);
      if (cachedSQL) {
        console.log('SQL 缓存命中，直接返回');
        return cachedSQL;
      }
    }

    const maxRetries = options.maxRetries || 2;
    let lastError: Error | null = null;
    let previousFailedSQL: string | null = null;
    let previousErrors: string[] = [];

    // 2. 分析是否为跨库查询
    const crossDbAnalysis = this.crossDbHandler.analyzeCrossDatabaseQuery(intent, context);

    // 3. 带重试机制的生成
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 构建 SQL 生成 Prompt
        let prompt = this.buildSQLGenerationPrompt(intent, context);

        // 如果是跨库查询，增强 Prompt
        if (crossDbAnalysis.isCrossDatabase) {
          prompt = this.crossDbHandler.enhancePromptForCrossDb(prompt, crossDbAnalysis);
        }

        // 如果是重试，添加错误反馈
        if (attempt > 0 && previousFailedSQL && previousErrors.length > 0) {
          prompt += `\n\n`;
          prompt += `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n`;
          prompt += `🚨 警告：上一次生成的SQL完全失败！！！\n`;
          prompt += `🚨 必须仔细阅读以下错误分析并完全改正！\n`;
          prompt += `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n\n`;

          prompt += `## ❌ 上一次失败的SQL：\n\`\`\`sql\n${previousFailedSQL}\n\`\`\`\n\n`;

          prompt += `## ❌ 检测到的错误：\n`;
          prompt += previousErrors.map((err, index) => `${index + 1}. ${err}`).join('\n');
          prompt += `\n\n`;

          prompt += `## 🔧 你必须立即修正以下问题：\n\n`;

          // 检测具体的错误类型并给出针对性的指导
          const hasOrderError = previousFailedSQL.match(/LIMIT\s+\d+\s+WHERE/i);
          const hasWhereError = previousFailedSQL.match(/WHERE\s+`?\w+`?(?:\s+(?:AND|OR|LIMIT|ORDER|GROUP|$))/i);
          const hasTableNameError = previousErrors.some(e => e.includes('表') && e.includes('不在元数据中'));
          const hasDatabaseError = previousFailedSQL.includes('available') || previousFailedSQL.includes('main');

          if (hasOrderError) {
            prompt += `### ⚠️ 致命错误1：SQL子句顺序错误\n`;
            prompt += `你在上一次生成中犯了 **子句顺序错误**！\n\n`;
            prompt += `**你的错误**：\`${hasOrderError[0]}\`\n`;
            prompt += `**正确写法**：\`WHERE ... LIMIT {number}\`\n\n`;
            prompt += `**MySQL语法规则（绝对不可违反）**：\n`;
            prompt += `\`\`\`\nSELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT ...\n\`\`\`\n\n`;
            prompt += `LIMIT **必须** 在 WHERE/ORDER BY 之后！\n\n`;
          }

          if (hasWhereError) {
            prompt += `### ⚠️ 致命错误2：WHERE条件不完整\n`;
            prompt += `你在上一次生成中使用了 **不完整的WHERE条件**！\n\n`;
            prompt += `**你的错误**：\`WHERE field_name\` 或 \`WHERE field AND other\`\n`;
            prompt += `这不是有效的SQL语法！WHERE后面必须跟完整的条件表达式！\n\n`;
            prompt += `**必须使用以下格式之一**：\n`;
            prompt += `- \`WHERE field = value\`\n`;
            prompt += `- \`WHERE field > value\`\n`;
            prompt += `- \`WHERE field IS NOT NULL\`\n`;
            prompt += `- \`WHERE field BETWEEN value1 AND value2\`\n`;
            prompt += `- \`WHERE field IN (value1, value2)\`\n`;
            prompt += `- \`WHERE field LIKE '%pattern%'\`\n\n`;
            prompt += `**特别注意**：如果用户只是要"统计总数"，根本不需要WHERE子句！\n`;
            prompt += `直接使用：\`SELECT COUNT(*) FROM table\`\n\n`;
          }

          if (hasTableNameError || hasDatabaseError) {
            prompt += `### ⚠️ 致命错误3：表名或数据库名错误\n`;
            prompt += `你在上一次生成中使用了 **元数据中不存在的表名或数据库名**！\n\n`;

            if (hasDatabaseError) {
              prompt += `**你使用的错误数据库名**：\`available\` 或其他臆想的名字\n`;
              prompt += `**你必须使用元数据中明确标注的数据库名**！不要臆造！\n\n`;
            }

            prompt += `**规则**：\n`;
            prompt += `1. 仔细查看元数据中每个表的 "数据库" 和 "表名" 字段\n`;
            prompt += `2. 完全照抄这些名字，一个字都不要改\n`;
            prompt += `3. 使用格式：\\\`数据库名\\\`.\\\`表名\\\` （注意反引号）\n\n`;
            prompt += `**示例**：\n`;
            prompt += `- 元数据给出：数据库=\`db_live\`, 表名=\`tb_live_all_room\`\n`;
            prompt += `- 你必须写：\\\`db_live\\\`.\\\`tb_live_all_room\\\`\n`;
            prompt += `- ❌ 不能写：\\\`available\\\`.\\\`tb_live_all_room\\\`\n`;
            prompt += `- ❌ 不能写：\\\`db_live\\\`.\\\`db_live_all_room\\\`\n\n`;
          }

          prompt += `## ✅ 现在请重新生成SQL，确保：\n`;
          prompt += `1. ✅ 子句顺序：SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT\n`;
          prompt += `2. ✅ WHERE条件完整：\`WHERE field = value\` 不是 \`WHERE field\`\n`;
          prompt += `3. ✅ 表名和数据库名：完全使用元数据中提供的，一字不改\n`;
          prompt += `4. ✅ 反引号格式：\\\`database\\\`.\\\`table\\\` 不是 \\\`database.table\\\`\n`;
          prompt += `5. ✅ 如果只是统计总数，不需要WHERE子句\n\n`;

          prompt += `🚨 这是第 ${attempt + 1} 次尝试，请务必成功！\n\n`;
        }

        // 调用 AI 生成 SQL
        const aiResponse = await this.aiClient.chat([
          { role: 'system', content: SQL_GENERATION_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ], {
          temperature: 0.1, // 降低温度以获得更确定的输出
          max_tokens: 2000
        });

        // 解析 AI 返回的结果
        const result = this.parseAIResponse(aiResponse);

        // 后处理 SQL（标准化格式）
        result.sql = this.formatSQL(result.sql);

        // 自动修正常见的格式错误
        result.sql = this.fixCommonSQLErrors(result.sql, context);

        // 保存SQL以便重试时使用
        previousFailedSQL = result.sql;

        // 基础验证
        this.validateSQLStructure(result.sql);

        // 验证 AI 返回的 usedColumns 是否都在元数据中
        const columnValidation = this.validateUsedColumns(result.usedColumns || [], context);
        if (!columnValidation.isValid) {
          previousErrors = columnValidation.errors;
          throw new Error(`SQL 使用了不存在的字段: ${columnValidation.errors.join('; ')}`);
        }

        // 严格校验：确保SQL只使用元数据中的表和字段
        const metadataValidation = this.validateAgainstMetadata(result.sql, context);
        if (!metadataValidation.isValid) {
          previousErrors = [...previousErrors, ...metadataValidation.errors];
          throw new Error(`SQL 使用了未授权的表或字段: ${metadataValidation.errors.join('; ')}`);
        }

        // 跨库 SQL 特殊验证
        if (crossDbAnalysis.isCrossDatabase) {
          const crossDbValidation = this.crossDbHandler.validateCrossDbSQL(result.sql, crossDbAnalysis);

          if (!crossDbValidation.isValid) {
            throw new Error(`跨库 SQL 验证失败: ${crossDbValidation.errors.join('; ')}`);
          }

          // 合并跨库警告
          result.warnings = [
            ...(result.warnings || []),
            ...crossDbValidation.warnings
          ];
        }

        // 4. 将生成的 SQL 写入缓存
        if (useCache) {
          await this.queryCacheManager.setSQL(intent, result);
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        console.warn(`SQL generation attempt ${attempt + 1} failed:`, error);

        // 记录失败信息供下次重试使用
        if (lastError.message.includes('使用了未授权的表或字段')) {
          // 从错误消息中提取错误详情
          const match = lastError.message.match(/: (.+)$/);
          if (match) {
            previousErrors = match[1].split('; ');
          }
        } else if (lastError.message.includes('验证失败')) {
          previousErrors = [lastError.message];
        } else if (lastError.message.includes('TOP 语法')) {
          // SQL Server 语法错误
          previousErrors = [lastError.message];
        } else if (lastError.message.includes('占位符')) {
          // 占位符使用错误
          previousErrors = [lastError.message];
        } else if (lastError.message.includes('不允许的 SQL')) {
          // 其他 SQL 验证错误
          previousErrors = [lastError.message];
        }

        // 尝试从错误中提取失败的SQL（如果有的话）
        // 注意：这里我们无法直接访问result.sql，因为错误发生在result生成之后
        // 我们可以尝试从错误消息或日志中提取，但这不太可靠
        // 更好的做法是在验证失败时保存SQL

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          throw new Error(`SQL 生成失败（已重试 ${maxRetries} 次）: ${lastError.message}`);
        }

        // 等待一小段时间后重试
        await this.delay(1000 * (attempt + 1));
      }
    }

    // 理论上不会执行到这里，但为了类型安全
    throw lastError || new Error('SQL 生成失败');
  }

  /**
   * 构建 SQL 生成 Prompt
   */
  private buildSQLGenerationPrompt(
    intent: QueryIntent,
    context: MetadataContext
  ): string {
    // 构建表结构描述
    const tableSchemas = context.tables.map(t => {
      const fullTableName = `\`${t.databaseName}\`.\`${t.tableName}\``;
      return `
### 表: ${t.tableName}
**数据库**: ${t.databaseName}
**完整表名（在SQL中必须使用这个）**: ${fullTableName}
**表说明**: ${t.semanticDescription || t.tableComment || '无'}
**字段**:
${t.columns.map(c => `  - ${c.columnName} (${c.dataType})${c.isPrimaryKey ? ' [主键]' : ''}
    说明: ${c.semanticDescription || c.columnComment || '无'}${c.sampleValues && c.sampleValues.length > 0 ? `
    示例值: ${c.sampleValues.slice(0, 3).map(v => v === null ? 'NULL' : String(v)).join(', ')}` : ''}`
    ).join('\n')}

**示例 SQL**:
统计该表的记录数：SELECT COUNT(*) FROM ${fullTableName}
查询前10条：SELECT * FROM ${fullTableName} LIMIT 10

**🚨 表名使用规则（必须严格遵守）**：
1. **完整表名格式**：必须是 ${fullTableName}
2. **严禁修改表名**：表名是 "${t.tableName}"，不能改成 "db_${t.tableName}" 或其他任何变体
3. **反引号格式**：\\\`${t.databaseName}\\\`.\\\`${t.tableName}\\\` ✓  |  \\\`${t.databaseName}.${t.tableName}\\\` ✗
4. **表名前缀**：如果表名是 "tb_xxx"，不能改成 "db_xxx" 或 "t_xxx"
`;
    }).join('\n');

    // 构建关系描述
    const relationships = context.relationships && context.relationships.length > 0
      ? context.relationships.map(r =>
          `- ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.type}${r.confidence ? `, 置信度: ${r.confidence}` : ''})`
        ).join('\n')
      : '无显式关系';

    return `
## 用户查询意图

用户想要: ${this.describeIntent(intent)}

## 可用的数据库表和字段

${tableSchemas}

## 表关系

${relationships}

## 查询条件

${this.describeConditions(intent.conditions)}

## 任务

请生成符合以下要求的 SQL 查询：

1. **严格使用元数据中提供的表名和字段名，一字不差**
2. 处理跨表关联（如果需要）
3. 应用查询条件和过滤
4. 确保 SQL 语法正确且高效
5. **对于简单的统计查询（如"统计表的数据"），直接使用 SELECT COUNT(*) FROM table，不需要添加 WHERE 子句**
6. 只在有明确过滤条件时才使用 WHERE 子句
7. 不要为了使用参数化而添加无意义的条件

## 🚨 关键规则（违反将导致错误）：

### 1. SQL子句顺序（严格遵守）
正确顺序：**SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT ...**

**常见错误**：
- ❌ \`SELECT ... FROM ... LIMIT 10 WHERE ...\` （LIMIT在WHERE之前 - 语法错误）
- ❌ \`SELECT ... FROM ... GROUP BY ... WHERE ...\` （GROUP BY在WHERE之前 - 语法错误）
- ✅ \`SELECT ... FROM ... WHERE ... GROUP BY ... ORDER BY ... LIMIT 10\` （正确）

### 2. WHERE条件必须完整
**错误示例**：
- ❌ \`WHERE last_30_days\` （只有字段名，不是完整条件）
- ❌ \`WHERE field1 AND field2\` （字段作为布尔值使用）
- ❌ \`WHERE field AND COUNT <= 10\` （第一个条件不完整）

**正确示例**：
- ✅ \`WHERE last_30_days = '2024-01-01'\`
- ✅ \`WHERE last_30_days IS NOT NULL\`
- ✅ \`WHERE last_30_days > '2024-01-01' AND count_value <= 10\`

**注意**：如果用户查询是"统计总数"而没有明确的过滤条件，**不要添加WHERE子句**，直接使用 \`SELECT COUNT(*) FROM table\`

### 3. 表名格式
- ✅ 正确：\`数据库名\`.\`表名\`（例如：\`db_live\`.\`tb_live_all_room\`）
- ❌ 错误：\`数据库名.表名\`（例如：\`db_live.tb_live_all_room\`）

### 4. 表名完整性
- ✅ 正确：使用元数据中提供的完整表名（如 \`tb_live_all_room\`）
- ❌ 错误：修改表名（如将 \`tb_live_all_room\` 改成 \`db_live_all_room\`）
- ❌ 错误：修改表名前缀（如将 \`tb_\` 改成 \`db_\` 或 \`t_\`）

### 5. usedColumns 字段
- ✅ 正确：只包含实际的字段名（如 ["live_id", "title"]）
- ❌ 错误：包含SQL函数名（如 ["COUNT", "SUM"]）
- ℹ️ 提示：COUNT(*), SUM(field) 这些是聚合函数，不要放在 usedColumns 中

返回 JSON 格式：
{
  "sql": "生成的 SQL 语句（必须是单行字符串，不包含换行符）",
  "explanation": "SQL 解释说明",
  "confidence": 0.95,
  "usedTables": ["table1", "table2"],
  "usedColumns": ["col1", "col2"],
  "warnings": ["跨库 JOIN 可能影响性能"]
}

## 💡 成功示例参考

假设元数据提供了：
- 数据库：\`db_live\`
- 表名：\`tb_live_all_room\`
- 字段：live_id, title, user_name 等

### 示例1：统计表的总记录数
**用户查询**："请查询直播用户总量" 或 "统计表的数据"

**✅ 正确的SQL**：
\`\`\`json
{
  "sql": "SELECT COUNT(*) FROM \\\`db_live\\\`.\\\`tb_live_all_room\\\`",
  "explanation": "统计tb_live_all_room表的总记录数",
  "confidence": 0.95,
  "usedTables": ["tb_live_all_room"],
  "usedColumns": [],
  "warnings": []
}
\`\`\`

**关键点**：
- ✅ 没有WHERE子句（因为是统计总数）
- ✅ 使用 \\\`db_live\\\`.\\\`tb_live_all_room\\\` 格式
- ✅ usedColumns 为空（COUNT(*)不是字段）
- ✅ 子句顺序正确

### 示例2：带条件的查询
**用户查询**："查询live_id大于100的记录数"

**✅ 正确的SQL**：
\`\`\`json
{
  "sql": "SELECT COUNT(*) FROM \\\`db_live\\\`.\\\`tb_live_all_room\\\` WHERE live_id > 100",
  "explanation": "统计live_id大于100的记录数",
  "confidence": 0.95,
  "usedTables": ["tb_live_all_room"],
  "usedColumns": ["live_id"],
  "warnings": []
}
\`\`\`

**关键点**：
- ✅ WHERE条件完整：\`WHERE live_id > 100\`
- ✅ 子句顺序：FROM → WHERE
- ✅ usedColumns 只包含 live_id（不包含COUNT）

### 示例3：带LIMIT的查询
**用户查询**："查询前10条记录"

**✅ 正确的SQL**：
\`\`\`json
{
  "sql": "SELECT * FROM \\\`db_live\\\`.\\\`tb_live_all_room\\\` ORDER BY live_id DESC LIMIT 10",
  "explanation": "查询前10条记录，按live_id降序排列",
  "confidence": 0.95,
  "usedTables": ["tb_live_all_room"],
  "usedColumns": ["live_id"],
  "warnings": []
}
\`\`\`

**关键点**：
- ✅ 子句顺序：FROM → ORDER BY → LIMIT
- ❌ 不能写成：FROM → LIMIT → ORDER BY

### 示例4：按月统计（时间派生字段）
**用户查询**："查询2025年每月直播数量"

**元数据提供的字段**：starttime（时间字段）, live_id

**✅ 正确的SQL**：
\`\`\`json
{
  "sql": "SELECT DATE_FORMAT(starttime, '%Y-%m') AS month, COUNT(*) AS count FROM \\\`db_live\\\`.\\\`tb_live_all_room\\\` WHERE YEAR(starttime) = 2025 GROUP BY month ORDER BY month ASC",
  "explanation": "按月统计2025年的直播数量，使用DATE_FORMAT提取月份，使用YEAR函数过滤年份",
  "confidence": 0.95,
  "usedTables": ["tb_live_all_room"],
  "usedColumns": ["starttime"],
  "warnings": []
}
\`\`\`

**关键点**：
- ✅ 使用 DATE_FORMAT(时间字段, '%Y-%m') 提取月份
- ✅ 使用 YEAR(时间字段) = 2025 过滤年份
- ✅ GROUP BY month（使用 SELECT 中定义的别名）
- ✅ ORDER BY month 按月份排序
- ✅ usedColumns 只包含 starttime（不包含派生字段 month）

**重要提示**：
- 当用户要求"按月"、"按年"、"按日"统计时，必须使用时间函数从时间字段中提取
- 常用时间函数：
  - \`DATE_FORMAT(字段, '%Y-%m')\` - 提取年月
  - \`DATE_FORMAT(字段, '%Y-%m-%d')\` - 提取年月日
  - \`YEAR(字段)\` - 提取年份
  - \`MONTH(字段)\` - 提取月份
  - \`DAY(字段)\` - 提取日期
- 在 SELECT 中使用 AS 创建别名，然后在 GROUP BY 和 ORDER BY 中引用该别名

### 示例5：带时间范围的聚合查询
**用户查询**："统计2024年1月到3月的用户数"

**✅ 正确的SQL**：
\`\`\`json
{
  "sql": "SELECT COUNT(DISTINCT uid) AS user_count FROM \\\`db_live\\\`.\\\`tb_live_all_room\\\` WHERE starttime >= '2024-01-01' AND starttime < '2024-04-01'",
  "explanation": "统计2024年1月到3月的不重复用户数",
  "confidence": 0.95,
  "usedTables": ["tb_live_all_room"],
  "usedColumns": ["uid", "starttime"],
  "warnings": []
}
\`\`\`

**关键点**：
- ✅ 使用时间范围过滤：\`starttime >= '2024-01-01' AND starttime < '2024-04-01'\`
- ✅ 使用 COUNT(DISTINCT uid) 统计不重复用户
- ✅ usedColumns 包含实际使用的字段

⚠️ 请严格参考以上示例的格式和规则！
`;
  }

  /**
   * 描述用户意图
   */
  private describeIntent(intent: QueryIntent): string {
    let description = '';

    switch (intent.type) {
      case 'select':
        description = '查询明细数据';
        break;
      case 'aggregate':
        description = `统计聚合 (${intent.aggregations?.function || 'COUNT'})`;

        // 添加 GROUP BY 说明
        if (intent.aggregations?.groupBy && intent.aggregations.groupBy.length > 0) {
          const groupByFields = intent.aggregations.groupBy;
          description += `，按 ${groupByFields.join(', ')} 分组`;

          // 检查是否有时间派生字段
          const timeDerivedFields = groupByFields.filter(f =>
            ['month', 'year', 'date', 'day', 'week'].includes(f.toLowerCase())
          );

          if (timeDerivedFields.length > 0) {
            description += `\n  ⚠️ 重要提示：需要按时间维度（${timeDerivedFields.join(', ')}）分组`;
            description += `\n  必须使用时间函数（如 DATE_FORMAT, YEAR, MONTH 等）从时间字段中提取`;
            description += `\n  示例：DATE_FORMAT(时间字段, '%Y-%m') AS month`;
          }
        }
        break;
      case 'statistics':
        description = '数据统计分析';
        break;
      case 'comparison':
        description = '对比分析';
        break;
      default:
        description = '数据查询';
    }

    if (intent.entities.tables && intent.entities.tables.length > 0) {
      description += `\n涉及表: ${intent.entities.tables.join(', ')}`;
    }

    return description;
  }

  /**
   * 描述查询条件
   */
  private describeConditions(conditions: any): string {
    if (!conditions) return '无特殊条件';

    const parts: string[] = [];

    if (conditions.timeRange) {
      const timeRangeDesc = conditions.timeRange.relative || '自定义';
      parts.push(`时间范围: ${timeRangeDesc}`);

      // 如果是年份查询，添加特殊说明
      if (timeRangeDesc && timeRangeDesc.includes('year') || timeRangeDesc.includes('2025')) {
        parts.push(`  ⚠️ 注意：这是年份查询，需要使用 YEAR() 函数过滤时间字段`);
        parts.push(`  示例：WHERE YEAR(时间字段) = 2025`);
      }
    }

    if (conditions.filters && conditions.filters.length > 0) {
      parts.push(`过滤条件: ${conditions.filters.length} 个`);
      conditions.filters.forEach((filter: any, index: number) => {
        parts.push(`  - 条件 ${index + 1}: ${filter.column} ${filter.operator} ${filter.value}`);
      });
    }

    if (conditions.orderBy) {
      const orderByCol = conditions.orderBy.column;
      parts.push(`排序: ${orderByCol} ${conditions.orderBy.direction}`);

      // 如果是时间派生字段，添加说明
      if (['month', 'year', 'date', 'day', 'week'].includes(orderByCol.toLowerCase())) {
        parts.push(`  ⚠️ 注意："${orderByCol}" 是派生字段，需要在 SELECT 中使用时间函数生成`);
      }
    }

    if (conditions.limit) {
      parts.push(`限制: 前 ${conditions.limit} 条`);
    }

    return parts.length > 0 ? parts.join('\n') : '无特殊条件';
  }

  /**
   * 解析 AI 返回的响应
   */
  private parseAIResponse(response: string): SQLGenerationResult {
    try {
      // 移除 markdown 代码块标记
      let cleanResponse = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // 尝试提取 JSON（AI 可能会在 JSON 前后添加其他文本）
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI 响应中未找到有效的 JSON 格式');
      }

      let jsonStr = jsonMatch[0];

      // 处理 JSON 字符串中的换行符：先解析，然后规范化 SQL
      // 这样可以处理 SQL 字段中的换行符
      const parsed = JSON.parse(jsonStr);

      // 验证必需字段
      if (!parsed.sql) {
        throw new Error('AI 响应缺少 sql 字段');
      }

      // 规范化 SQL：移除多余的空白和换行
      let sql = parsed.sql;
      if (typeof sql === 'string') {
        // 将多个空白字符（包括换行）替换为单个空格
        sql = sql.replace(/\s+/g, ' ').trim();
      }

      return {
        sql: sql,
        explanation: parsed.explanation || '',
        confidence: parsed.confidence || 0.8,
        usedTables: parsed.usedTables || [],
        usedColumns: parsed.usedColumns || [],
        estimatedRows: parsed.estimatedRows,
        warnings: parsed.warnings || []
      };

    } catch (error) {
      console.error('Failed to parse AI response:', response);
      throw new Error(`解析 AI 响应失败: ${(error as Error).message}`);
    }
  }

  /**
   * 格式化 SQL
   */
  private formatSQL(sql: string): string {
    try {
      // 移除多余的空白字符
      sql = sql.trim();

      // 检查是否包含数据库前缀（如 db_name.table_name）
      // 如果包含，跳过格式化，因为 node-sql-parser 可能不支持
      if (/\b\w+\s*\.\s*\w+/.test(sql) && sql.includes('`') && sql.match(/`[^`]+`\s*\.\s*`[^`]+`/)) {
        console.log('SQL contains database prefix, skipping formatting');
        return sql;
      }

      // 使用 node-sql-parser 格式化
      const ast = this.parser.astify(sql, { database: 'MySQL' });
      const formatted = this.parser.sqlify(ast, { database: 'MySQL' });

      return formatted;

    } catch (error) {
      console.warn('SQL formatting failed, returning original SQL');
      // 如果格式化失败，返回原始 SQL
      return sql;
    }
  }

  /**
   * 验证 SQL 结构
   */
  private validateSQLStructure(sql: string): void {
    try {
      // 检查是否包含数据库前缀（支持多种格式）
      const hasDbPrefix = /`[^`]+`\s*\.\s*`[^`]+`/.test(sql) || /\w+\s*\.\s*\w+/.test(sql);

      // 先进行基础的安全检查（无论是否有数据库前缀）
      const sqlUpper = sql.trim().toUpperCase();

      // 确保是 SELECT 查询
      if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
        throw new Error('不允许的 SQL 类型：只允许 SELECT 查询或 CTE（WITH）');
      }

      // 检查是否使用了 SQL Server 语法（TOP）
      if (/\bSELECT\s+TOP\s+\d+/i.test(sql)) {
        throw new Error('不允许使用 SQL Server 的 TOP 语法，请使用 MySQL 的 LIMIT 语法');
      }

      // 检查SQL子句顺序是否正确
      this.validateClauseOrder(sql);

      // 检查WHERE条件是否完整
      this.validateWhereClause(sql);

      // 检查是否有无效的占位符使用
      if (/WHERE\s+\?/i.test(sql) || /\?\s+LIMIT/i.test(sql) || /\?\s*$/i.test(sql)) {
        throw new Error('SQL 中包含无效的占位符使用，占位符必须在有效的条件表达式中使用（如 column = ?）');
      }

      // 简单检查是否包含危险的关键字
      const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'CREATE'];
      for (const keyword of dangerousKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(sql)) {
          throw new Error(`不允许的 SQL 操作: ${keyword}`);
        }
      }

      if (hasDbPrefix) {
        console.log('SQL validation passed (using simple validation for database-prefixed SQL)');
        return;
      }

      // 如果没有数据库前缀，尝试使用 parser 进行严格验证
      try {
        const ast = this.parser.astify(sql, { database: 'MySQL' });
        const query = Array.isArray(ast) ? ast[0] : ast;

        if (query.type !== 'select') {
          throw new Error(`不允许的 SQL 类型: ${query.type}`);
        }

        console.log('SQL validation passed (using AST validation)');
      } catch (parseError) {
        console.warn('SQL AST parsing failed, but basic validation passed:', (parseError as Error).message);
      }

    } catch (error) {
      if ((error as Error).message.includes('不允许的 SQL') ||
          (error as Error).message.includes('WHERE条件') ||
          (error as Error).message.includes('子句顺序')) {
        throw error;
      }

      console.warn('SQL structure validation encountered an error:', (error as Error).message);
      throw new Error(`SQL 结构验证失败: ${(error as Error).message}`);
    }
  }

  /**
   * 验证SQL子句顺序
   */
  private validateClauseOrder(sql: string): void {
    // 检测错误的子句顺序
    const invalidOrders = [
      { pattern: /\bLIMIT\s+\d+\s+WHERE\b/i, error: 'LIMIT 不能在 WHERE 之前' },
      { pattern: /\bLIMIT\s+\d+\s+ORDER\s+BY\b/i, error: 'LIMIT 不能在 ORDER BY 之前' },
      { pattern: /\bLIMIT\s+\d+\s+GROUP\s+BY\b/i, error: 'LIMIT 不能在 GROUP BY 之前' },
      { pattern: /\bGROUP\s+BY\b.*?\bWHERE\b/i, error: 'GROUP BY 不能在 WHERE 之前' },
      { pattern: /\bORDER\s+BY\b.*?\bWHERE\b/i, error: 'ORDER BY 不能在 WHERE 之前' },
      { pattern: /\bHAVING\b.*?\bWHERE\b/i, error: 'HAVING 不能在 WHERE 之前' },
    ];

    for (const { pattern, error } of invalidOrders) {
      if (pattern.test(sql)) {
        throw new Error(`SQL子句顺序错误: ${error}。正确顺序应为: SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT`);
      }
    }
  }

  /**
   * 验证WHERE条件是否完整
   */
  private validateWhereClause(sql: string): void {
    // 提取WHERE子句
    const whereMatch = sql.match(/\bWHERE\s+(.+?)(?:\s+(?:GROUP|ORDER|LIMIT|$))/i);
    if (!whereMatch) {
      return; // 没有WHERE子句，跳过验证
    }

    const whereClause = whereMatch[1].trim();

    // 检测不完整的WHERE条件（只有字段名，没有运算符和值）
    // 例如：WHERE field_name 或 WHERE `field_name`
    const incompleteConditions = [
      // 只有字段名（可能带反引号），后面没有运算符
      /^`?\w+`?$/,
      // 只有字段名后跟AND/OR（没有完整条件）
      /^`?\w+`?\s+(?:AND|OR)\b/i,
      // WHERE field AND field2 这种模式（字段作为布尔值使用）
      /^`?\w+`?(?:\s+(?:AND|OR)\s+`?\w+`?)+$/i,
    ];

    for (const pattern of incompleteConditions) {
      if (pattern.test(whereClause)) {
        throw new Error(
          `WHERE条件不完整: "${whereClause}"。` +
          `WHERE条件必须包含完整的表达式，如: WHERE field = value, WHERE field > 10, WHERE field IS NOT NULL 等`
        );
      }
    }

    // 检测常见的错误模式
    const invalidPatterns = [
      {
        pattern: /WHERE\s+`?\w+`?\s+AND\s+`?\w+`?\s*[<>=]/i,
        error: '似乎缺少第一个条件的运算符和值'
      },
      {
        pattern: /WHERE\s+(?:TRUE|FALSE|1|0)\s*$/i,
        error: 'WHERE条件不应该是常量布尔值'
      },
    ];

    for (const { pattern, error } of invalidPatterns) {
      if (pattern.test(`WHERE ${whereClause}`)) {
        throw new Error(`WHERE条件错误: ${error}。当前条件: "${whereClause}"`);
      }
    }
  }

  /**
   * 验证 AI 返回的 usedColumns 是否都在元数据中
   */
  private validateUsedColumns(
    usedColumns: string[],
    context: MetadataContext
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 常见的SQL聚合函数和函数名（不应该被当作字段验证）
    const SQL_FUNCTIONS = new Set([
      'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
      'DISTINCT', 'GROUP_CONCAT',
      'CONCAT', 'UPPER', 'LOWER', 'SUBSTRING', 'TRIM',
      'NOW', 'CURDATE', 'CURTIME', 'DATE', 'TIMESTAMP',
      'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
      'COALESCE', 'IFNULL', 'NULLIF', 'IF', 'CASE'
    ]);

    // 收集所有有效字段
    const allValidColumns = new Set<string>();
    context.tables.forEach(table => {
      table.columns.forEach(col => {
        allValidColumns.add(col.columnName);
      });
    });

    console.log('[SQLGenerator] 验证使用的字段:', usedColumns);
    console.log('[SQLGenerator] 可用字段:', Array.from(allValidColumns));

    // 验证每个使用的字段
    for (const column of usedColumns) {
      if (column === '*') {
        continue; // SELECT * 是允许的
      }

      // 跳过SQL函数
      if (SQL_FUNCTIONS.has(column.toUpperCase())) {
        console.log(`[SQLGenerator] 跳过SQL函数: ${column}`);
        continue;
      }

      // 跳过包含函数调用的表达式（如 COUNT(*)）
      if (/^[A-Z_]+\s*\(/i.test(column)) {
        console.log(`[SQLGenerator] 跳过函数表达式: ${column}`);
        continue;
      }

      if (!allValidColumns.has(column)) {
        errors.push(`字段"${column}"不存在于任何表的元数据中`);
        console.error(`[SQLGenerator] 字段验证失败: ${column} 不存在`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证SQL是否只使用元数据中的表和字段
   */
  private validateAgainstMetadata(
    sql: string,
    context: MetadataContext
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      console.log('[SQLGenerator] 开始验证 SQL 元数据...');
      console.log('[SQLGenerator] SQL:', sql);

      // 构建表名到表元数据的映射
      const tableMap = new Map<string, any>();
      context.tables.forEach(t => {
        tableMap.set(t.tableName, t);
        // 同时支持完整限定名 db.table
        tableMap.set(`${t.databaseName}.${t.tableName}`, t);
      });

      // 提取SQL中的表名（支持数据库前缀）
      const tablePattern = /(?:FROM|JOIN)\s+(?:`([^`]+)`\.)?`([^`]+)`/gi;
      let match;
      const usedTables = new Set<string>();

      while ((match = tablePattern.exec(sql)) !== null) {
        const dbName = match[1]; // 数据库名（可能为空）
        const tableName = match[2]; // 表名

        // 检查表是否在元数据中
        const tableExists = context.tables.some(t => {
          // 如果SQL中指定了数据库名，需要同时匹配数据库名和表名
          if (dbName) {
            return t.databaseName === dbName && t.tableName === tableName;
          }
          // 如果SQL中没有指定数据库名，只匹配表名
          return t.tableName === tableName;
        });

        if (!tableExists) {
          errors.push(`表 ${dbName ? dbName + '.' : ''}${tableName} 不在元数据中`);
        }

        usedTables.add(tableName);
      }

      console.log('[SQLGenerator] 使用的表:', Array.from(usedTables));

      // 提取SQL中的所有字段引用
      // 支持以下格式：
      // 1. `db`.`table`.`column`
      // 2. `table`.`column`
      // 3. `column` (单独的字段名)

      // 匹配所有反引号包裹的标识符序列
      const allIdentifiers: string[][] = [];
      const identifierPattern = /`([^`]+)`(?:\.`([^`]+)`)?(?:\.`([^`]+)`)?/g;
      let idMatch;

      while ((idMatch = identifierPattern.exec(sql)) !== null) {
        const parts = [idMatch[1], idMatch[2], idMatch[3]].filter(p => p !== undefined);
        allIdentifiers.push(parts);
      }

      console.log('[SQLGenerator] 提取的标识符:', allIdentifiers);

      // 验证每个标识符序列
      for (const parts of allIdentifiers) {
        if (parts.length === 3) {
          // db.table.column 格式
          const [dbName, tableName, columnName] = parts;

          // 跳过已知的表名（这可能是 FROM/JOIN 子句）
          if (usedTables.has(tableName)) {
            continue;
          }

          // 验证字段
          const table = context.tables.find(t =>
            t.databaseName === dbName && t.tableName === tableName
          );

          if (table) {
            const columnExists = table.columns.some(c => c.columnName === columnName);
            if (!columnExists && columnName !== '*') {
              errors.push(`字段 ${dbName}.${tableName}.${columnName} 不在表 ${dbName}.${tableName} 的元数据中`);
              console.error(`[SQLGenerator] 字段验证失败: ${dbName}.${tableName}.${columnName}`);
            }
          }
        } else if (parts.length === 2) {
          // table.column 或 db.table 格式
          const [first, second] = parts;

          // 跳过已知的表名（这可能是 db.table 格式）
          if (usedTables.has(second)) {
            continue;
          }

          // 这应该是 table.column 格式
          const table = context.tables.find(t => t.tableName === first);
          if (table) {
            const columnExists = table.columns.some(c => c.columnName === second);
            if (!columnExists && second !== '*') {
              errors.push(`字段 ${first}.${second} 不在表 ${first} 的元数据中`);
              console.error(`[SQLGenerator] 字段验证失败: ${first}.${second}`);
              console.error(`[SQLGenerator] 表 ${first} 的有效字段:`, table.columns.map(c => c.columnName));
            }
          }
        }
        // 对于单个标识符（parts.length === 1），很难确定是表名还是字段名，暂时跳过
      }

      if (errors.length > 0) {
        console.error('[SQLGenerator] 元数据验证失败:', errors);
      } else {
        console.log('[SQLGenerator] 元数据验证通过');
      }

    } catch (error) {
      console.warn('元数据验证时出错:', (error as Error).message);
      // 验证出错不应该阻止SQL生成，只记录警告
      return { isValid: true, errors: [] };
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 修正常见的 SQL 格式错误
   */
  private fixCommonSQLErrors(sql: string, context: MetadataContext): string {
    let fixedSQL = sql;

    // 1. 修正SQL子句顺序错误：LIMIT ... WHERE ... -> WHERE ... LIMIT ...
    fixedSQL = this.fixClauseOrder(fixedSQL);

    // 2. 修正错误的反引号格式：`database.table` -> `database`.`table`
    context.tables.forEach(table => {
      const wrongFormat = new RegExp(`\`${table.databaseName}\\.${table.tableName}\``, 'g');
      const correctFormat = `\`${table.databaseName}\`.\`${table.tableName}\``;
      fixedSQL = fixedSQL.replace(wrongFormat, correctFormat);
    });

    // 3. 检测并修正错误的表名
    const tablePattern = /(?:FROM|JOIN)\s+(?:`([^`]+)`\.)?`([^`]+)`/gi;
    let match;
    const replacements: Array<{ wrong: string; correct: string; }> = [];

    while ((match = tablePattern.exec(sql)) !== null) {
      const dbName = match[1]; // 数据库名（可能为空）
      const tableName = match[2]; // 表名

      // 检查表名是否在元数据中
      const tableExists = context.tables.some(t => {
        if (dbName) {
          return t.databaseName === dbName && t.tableName === tableName;
        }
        return t.tableName === tableName;
      });

      if (!tableExists) {
        // 表名不存在，尝试找到最相似的表名
        const similarTable = this.findSimilarTable(tableName, dbName, context);
        if (similarTable) {
          const wrongRef = dbName
            ? `\`${dbName}\`.\`${tableName}\``
            : `\`${tableName}\``;
          const correctRef = `\`${similarTable.databaseName}\`.\`${similarTable.tableName}\``;

          replacements.push({ wrong: wrongRef, correct: correctRef });
          console.log(`[SQLGenerator] 检测到错误的表名: ${wrongRef}, 建议修正为: ${correctRef}`);
        }
      }
    }

    // 应用所有修正
    for (const { wrong, correct } of replacements) {
      fixedSQL = fixedSQL.replace(new RegExp(this.escapeRegExp(wrong), 'g'), correct);
    }

    if (fixedSQL !== sql) {
      console.log('[SQLGenerator] 自动修正了 SQL 格式错误');
      console.log('[SQLGenerator] 原始 SQL:', sql);
      console.log('[SQLGenerator] 修正后 SQL:', fixedSQL);
    }

    return fixedSQL;
  }

  /**
   * 修正SQL子句顺序错误
   * 正确顺序：SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT ...
   */
  private fixClauseOrder(sql: string): string {
    // 检测 LIMIT ... WHERE ... 这种错误顺序
    const limitBeforeWhere = /\bLIMIT\s+\d+\s+WHERE\b/i;
    if (limitBeforeWhere.test(sql)) {
      console.log('[SQLGenerator] 检测到错误的子句顺序: LIMIT 在 WHERE 之前');

      // 提取各个部分
      const match = sql.match(/^(.*?)\s+LIMIT\s+(\d+)\s+(WHERE\s+.*)$/i);
      if (match) {
        const [, beforeLimit, limitValue, whereClause] = match;
        const corrected = `${beforeLimit} ${whereClause} LIMIT ${limitValue}`;
        console.log('[SQLGenerator] 修正子句顺序:', corrected);
        return corrected;
      }
    }

    // 检测 LIMIT ... ORDER BY ... 这种错误顺序
    const limitBeforeOrderBy = /\bLIMIT\s+\d+\s+ORDER\s+BY\b/i;
    if (limitBeforeOrderBy.test(sql)) {
      console.log('[SQLGenerator] 检测到错误的子句顺序: LIMIT 在 ORDER BY 之前');

      const match = sql.match(/^(.*?)\s+LIMIT\s+(\d+)\s+(ORDER\s+BY\s+.*)$/i);
      if (match) {
        const [, beforeLimit, limitValue, orderByClause] = match;
        const corrected = `${beforeLimit} ${orderByClause} LIMIT ${limitValue}`;
        console.log('[SQLGenerator] 修正子句顺序:', corrected);
        return corrected;
      }
    }

    // 检测 GROUP BY ... WHERE ... 这种错误顺序
    const groupByBeforeWhere = /\bGROUP\s+BY\b.*?\bWHERE\b/i;
    if (groupByBeforeWhere.test(sql)) {
      console.log('[SQLGenerator] 检测到错误的子句顺序: GROUP BY 在 WHERE 之前');

      const match = sql.match(/^(.*?)\s+(GROUP\s+BY\s+[^WHERE]+?)\s+(WHERE\s+.*)$/i);
      if (match) {
        const [, beforeGroupBy, groupByClause, whereClause] = match;
        const corrected = `${beforeGroupBy} ${whereClause} ${groupByClause}`;
        console.log('[SQLGenerator] 修正子句顺序:', corrected);
        return corrected;
      }
    }

    return sql;
  }

  /**
   * 查找相似的表名（用于自动修正）
   */
  private findSimilarTable(
    wrongTableName: string,
    dbName: string | undefined,
    context: MetadataContext
  ): TableContext | null {
    // 优先考虑相同数据库中的表
    const tablesInDb = dbName
      ? context.tables.filter(t => t.databaseName === dbName)
      : context.tables;

    if (tablesInDb.length === 0) {
      return context.tables.length === 1 ? context.tables[0] : null;
    }

    // 策略1：检查是否只是前缀错误（如 db_ vs tb_）
    const prefixPattern = /^(db_|tb_|t_|tbl_)(.+)$/;
    const wrongMatch = wrongTableName.match(prefixPattern);

    if (wrongMatch) {
      const [, wrongPrefix, baseName] = wrongMatch;

      // 尝试所有可能的前缀
      const possiblePrefixes = ['db_', 'tb_', 't_', 'tbl_', ''];
      for (const prefix of possiblePrefixes) {
        if (prefix === wrongPrefix) continue;

        const candidateName = prefix + baseName;
        const found = tablesInDb.find(t => t.tableName === candidateName);
        if (found) {
          console.log(`[SQLGenerator] 表名前缀错误: ${wrongTableName} → ${candidateName}`);
          return found;
        }
      }
    }

    // 策略2：计算编辑距离，找到最相似的表名
    let minDistance = Infinity;
    let bestMatch: TableContext | null = null;

    for (const table of tablesInDb) {
      const distance = this.levenshteinDistance(
        wrongTableName.toLowerCase(),
        table.tableName.toLowerCase()
      );

      // 如果编辑距离小于表名长度的30%，认为是可能的匹配
      const threshold = Math.ceil(table.tableName.length * 0.3);

      if (distance < minDistance && distance <= threshold) {
        minDistance = distance;
        bestMatch = table;
      }
    }

    if (bestMatch) {
      console.log(`[SQLGenerator] 找到相似表名: ${wrongTableName} → ${bestMatch.tableName} (编辑距离: ${minDistance})`);
    }

    return bestMatch;
  }

  /**
   * 计算两个字符串的编辑距离（Levenshtein Distance）
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // 删除
            dp[i][j - 1] + 1,    // 插入
            dp[i - 1][j - 1] + 1 // 替换
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 延迟函数（用于重试）
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
