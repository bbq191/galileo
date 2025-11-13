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
import { MetadataContext } from '@/lib/metadata/retrieval/types';
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
          prompt += `\n\n## 重要：上一次生成失败\n\n`;
          prompt += `上一次生成的SQL有以下问题：\n`;
          prompt += previousErrors.map((err, index) => `${index + 1}. ${err}`).join('\n');
          prompt += `\n\n上一次失败的SQL：\n\`\`\`sql\n${previousFailedSQL}\n\`\`\`\n\n`;
          prompt += `请修正这些问题，生成新的SQL。特别注意：\n`;
          prompt += `- **必须使用 MySQL 语法，不要使用 SQL Server 的 TOP 语法**\n`;
          prompt += `- **限制结果数量使用 LIMIT，不要使用 TOP**\n`;
          prompt += `- **反引号格式**：必须是 \\\`database\\\`.\\\`table\\\`，不能是 \\\`database.table\\\`\n`;
          prompt += `- **严格使用元数据中的表名，不要修改表名的任何部分**\n`;
          prompt += `- **例如：如果元数据中的表名是 tb_chatroom_relation，就使用 tb_chatroom_relation，不要改成 db_chatroom_relation 或 chatroom_relation**\n`;
          prompt += `- **错误示例**：FROM \\\`db_live.tb_chatroom_relation\\\` (整体用反引号包裹 - 错误)\n`;
          prompt += `- **正确示例**：FROM \\\`db_live\\\`.\\\`tb_chatroom_relation\\\` (分别用反引号包裹 - 正确)\n`;
          prompt += `- 只使用元数据中明确列出的表和字段\n`;
          prompt += `- 不要臆想或使用未提供的表名\n`;
          prompt += `- 确保表名和字段名与元数据完全一致（包括前缀、大小写等）\n`;
          prompt += `- 生成的 JSON 中 SQL 字段必须是单行字符串，不要包含换行符\n`;
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

**重要提示**：
- 数据库名和表名分别用反引号包裹，格式为：\\\`数据库名\\\`.\\\`表名\\\`
- 不要写成：\\\`数据库名.表名\\\` (错误)
- 表名必须是 ${t.tableName}，不能改成其他名字（如 db_${t.tableName.replace('tb_', '')}）
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

1. 使用上述表和字段
2. 处理跨表关联（如果需要）
3. 应用查询条件和过滤
4. **重要**：必须使用完整限定的表名，格式为 \`数据库名.表名\`（例如：使用 \`db_live.tb_chatroom_relation\` 而不是 \`tb_chatroom_relation\`）
5. 确保 SQL 语法正确且高效
6. **对于简单的统计查询（如"统计表的数据"），直接使用 SELECT COUNT(*) FROM table，不需要添加 WHERE 子句**
7. 只在有明确过滤条件时才使用 WHERE 子句
8. 不要为了使用参数化而添加无意义的条件

返回 JSON 格式：
{
  "sql": "生成的 SQL 语句",
  "explanation": "SQL 解释说明",
  "confidence": 0.95,
  "usedTables": ["table1", "table2"],
  "usedColumns": ["col1", "col2"],
  "warnings": ["跨库 JOIN 可能影响性能"]
}
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
      description += `，涉及表: ${intent.entities.tables.join(', ')}`;
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
      parts.push(`时间范围: ${conditions.timeRange.relative || '自定义'}`);
    }

    if (conditions.filters && conditions.filters.length > 0) {
      parts.push(`过滤条件: ${conditions.filters.length} 个`);
      conditions.filters.forEach((filter: any, index: number) => {
        parts.push(`  - 条件 ${index + 1}: ${filter.column} ${filter.operator} ${filter.value}`);
      });
    }

    if (conditions.orderBy) {
      parts.push(`排序: ${conditions.orderBy.column} ${conditions.orderBy.direction}`);
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

      // 检查是否有无效的占位符使用
      // 占位符 ? 应该只出现在有效的条件中，例如 column = ? 或 column > ?
      // 检查是否有孤立的 ? 或者 WHERE ? 这样的无效语法
      if (/WHERE\s+\?/i.test(sql) || /\?\s+LIMIT/i.test(sql) || /\?\s*$/i.test(sql)) {
        throw new Error('SQL 中包含无效的占位符使用，占位符必须在有效的条件表达式中使用（如 column = ?）');
      }

      // 简单检查是否包含危险的关键字
      const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'CREATE'];
      for (const keyword of dangerousKeywords) {
        // 使用单词边界来避免误匹配（如 UPDATED_AT 字段名）
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(sql)) {
          throw new Error(`不允许的 SQL 操作: ${keyword}`);
        }
      }

      if (hasDbPrefix) {
        // 如果包含数据库前缀，使用简单的正则验证就足够了
        console.log('SQL validation passed (using simple validation for database-prefixed SQL)');
        return;
      }

      // 如果没有数据库前缀，尝试使用 parser 进行严格验证
      try {
        const ast = this.parser.astify(sql, { database: 'MySQL' });

        // 如果是数组，取第一个
        const query = Array.isArray(ast) ? ast[0] : ast;

        // 确保只是 SELECT 查询
        if (query.type !== 'select') {
          throw new Error(`不允许的 SQL 类型: ${query.type}`);
        }

        console.log('SQL validation passed (using AST validation)');
      } catch (parseError) {
        // 解析失败不是致命错误，因为可能是 parser 不支持某些语法
        console.warn('SQL AST parsing failed, but basic validation passed:', (parseError as Error).message);
      }

    } catch (error) {
      // 如果是我们主动抛出的错误，继续抛出
      if ((error as Error).message.includes('不允许的 SQL')) {
        throw error;
      }

      // 其他错误：记录但不阻止
      console.warn('SQL structure validation encountered an error:', (error as Error).message);
      throw new Error(`SQL 结构验证失败: ${(error as Error).message}`);
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

    // 修正错误的反引号格式：`database.table` -> `database`.`table`
    // 例如：`db_live.tb_chatroom_relation` -> `db_live`.`tb_chatroom_relation`
    context.tables.forEach(table => {
      const wrongFormat = new RegExp(`\`${table.databaseName}\\.${table.tableName}\``, 'g');
      const correctFormat = `\`${table.databaseName}\`.\`${table.tableName}\``;
      fixedSQL = fixedSQL.replace(wrongFormat, correctFormat);
    });

    // 不再进行表名前缀猜测和替换（如 db_ -> tb_），因为：
    // 1. 表名可能本身就是 db_ 开头的
    // 2. 这种替换会导致误修正
    // 3. 应该让元数据验证来捕获真正的表名错误

    if (fixedSQL !== sql) {
      console.log('[SQLGenerator] 自动修正了 SQL 格式错误');
      console.log('[SQLGenerator] 原始 SQL:', sql);
      console.log('[SQLGenerator] 修正后 SQL:', fixedSQL);
    }

    return fixedSQL;
  }

  /**
   * 延迟函数（用于重试）
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
