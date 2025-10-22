/**
 * AI Prompt 模板
 *
 * 功能：
 * - 提供标准化的 Prompt 模板
 * - 支持变量替换
 * - 优化 AI 输出质量
 */

import type { DatabaseInfo, TableInfo, ColumnInfo } from '@/lib/metadata/types';

/**
 * 数据库语义化 Prompt
 */
export function generateDatabaseSemanticPrompt(
  database: DatabaseInfo,
  tableNames: string[]
): string {
  return `请为以下数据库生成简洁的中文业务描述：

数据库名: ${database.name}
包含的表: ${tableNames.join(', ')}

请用一句话（不超过50字）描述这个数据库的主要用途和业务场景。
直接返回描述内容，不要包含任何前缀或解释。`;
}

/**
 * 表语义化 Prompt
 */
export function generateTableSemanticPrompt(
  table: TableInfo,
  columns: ColumnInfo[]
): string {
  const columnsList = columns
    .map((col) => {
      const parts = [col.columnName, col.dataType];
      if (col.columnComment) {
        parts.push(`(${col.columnComment})`);
      }
      return `  - ${parts.join(' ')}`;
    })
    .join('\n');

  const tableComment = table.tableComment ? `\n表注释: ${table.tableComment}` : '';

  return `请为以下数据表生成简洁的中文业务描述：

表名: ${table.tableName}${tableComment}
所属数据库: ${table.databaseName}
字段列表:
${columnsList}

请用一句话（不超过50字）描述这个表的主要用途和存储的数据类型。
直接返回描述内容，不要包含任何前缀或解释。`;
}

/**
 * 字段语义化 Prompt（单个字段）
 */
export function generateColumnSemanticPrompt(column: ColumnInfo): string {
  const columnComment = column.columnComment
    ? `\n字段注释: ${column.columnComment}`
    : '';

  const isPrimaryKey = column.columnKey === 'PRI' ? '\n是否主键: 是' : '';

  return `请为以下数据库字段生成简洁的中文业务描述：

表名: ${column.tableName}
字段名: ${column.columnName}
数据类型: ${column.columnType}${columnComment}${isPrimaryKey}
是否可空: ${column.isNullable ? '是' : '否'}

请用一句话（不超过30字）描述该字段的业务含义和用途。
直接返回描述内容，不要包含任何前缀或解释。`;
}

/**
 * 批量字段语义化 Prompt
 * 一次处理多个字段，提高效率
 */
export function generateBatchColumnSemanticPrompt(
  tableName: string,
  databaseName: string,
  columns: ColumnInfo[]
): string {
  const columnsList = columns
    .map((col, index) => {
      const parts = [
        `${index + 1}. ${col.columnName}`,
        col.columnType,
        col.columnComment ? `注释:${col.columnComment}` : '',
      ];
      return parts.filter(Boolean).join(' - ');
    })
    .join('\n');

  return `请为以下数据表的字段生成简洁的中文业务描述：

数据库: ${databaseName}
表名: ${tableName}

字段列表:
${columnsList}

要求：
1. 为每个字段生成一句话描述（不超过30字）
2. 按照字段序号返回，格式: "序号: 描述"
3. 直接返回结果，不要额外解释

示例格式:
1: 用户唯一标识符
2: 用户登录邮箱
3: 用户昵称`;
}

/**
 * 数据库字段关系推断 Prompt
 * （这个会在关系推断模块使用，这里提前准备）
 */
export function generateRelationshipInferencePrompt(
  sourceTable: string,
  sourceColumn: string,
  sourceType: string,
  sourceDescription: string,
  targetTable: string,
  targetColumn: string,
  targetType: string,
  targetDescription: string
): string {
  return `请分析以下两个数据库字段之间是否存在关联关系：

源表: ${sourceTable}
源字段: ${sourceColumn} (${sourceType})
源字段描述: ${sourceDescription}

目标表: ${targetTable}
目标字段: ${targetColumn} (${targetType})
目标字段描述: ${targetDescription}

请判断:
1. 是否存在关联关系？(是/否)
2. 置信度分数 (0.00-1.00)
3. 关系类型 (one-to-one/one-to-many/many-to-many)
4. 推断理由（不超过50字）

请严格按照以下 JSON 格式返回，不要包含任何其他内容:
{
  "hasRelationship": true,
  "confidence": 0.85,
  "type": "one-to-many",
  "reasoning": "推断理由"
}`;
}

/**
 * 优化后的字段语义化 Prompt（考虑上下文）
 */
export function generateContextualColumnSemanticPrompt(
  column: ColumnInfo,
  relatedColumns: ColumnInfo[]
): string {
  const relatedList = relatedColumns
    .filter((col) => col.columnName !== column.columnName)
    .slice(0, 5) // 只显示前5个相关字段
    .map((col) => `  - ${col.columnName} (${col.dataType})`)
    .join('\n');

  const columnComment = column.columnComment
    ? `\n字段注释: ${column.columnComment}`
    : '';

  return `请为以下数据库字段生成简洁的中文业务描述：

表名: ${column.tableName}
字段名: ${column.columnName}
数据类型: ${column.columnType}${columnComment}

同表其他字段（上下文参考）:
${relatedList || '  （无其他字段）'}

请根据字段名称、数据类型和上下文，用一句话（不超过30字）描述该字段的业务含义。
直接返回描述内容，不要包含任何前缀或解释。`;
}

/**
 * 表优先级分类 Prompt
 * 帮助 AI 判断表的重要性
 */
export function generateTablePriorityPrompt(
  table: TableInfo,
  columns: ColumnInfo[]
): string {
  const columnsList = columns
    .map((col) => `  - ${col.columnName}`)
    .join('\n');

  return `请判断以下数据表的业务优先级：

表名: ${table.tableName}
表注释: ${table.tableComment || '无'}
表类型: ${table.tableType}
字段数: ${columns.length}
主要字段:
${columnsList}

请根据以下标准判断优先级:
- CRITICAL (1): 核心业务表（如用户、订单、支付）
- HIGH (2): 重要业务表（如产品、分类、评论）
- NORMAL (3): 标准业务表（如配置、日志）
- LOW (4): 临时表、备份表、测试表

请严格按照以下 JSON 格式返回:
{
  "priority": 3,
  "reasoning": "判断理由"
}`;
}

/**
 * 智能字段分组 Prompt
 * 将相关字段分组，批量处理
 */
export function generateFieldGroupingPrompt(columns: ColumnInfo[]): string {
  const columnsList = columns
    .map((col, index) => `${index + 1}. ${col.columnName} (${col.dataType})`)
    .join('\n');

  return `请将以下字段按照业务含义分组：

字段列表:
${columnsList}

请识别以下分组模式：
- 时间字段组（created_at, updated_at等）
- 审计字段组（created_by, updated_by等）
- 状态字段组（status, state等）
- 用户信息组（name, email, phone等）
- 其他业务字段

请按照以下 JSON 格式返回分组结果:
{
  "groups": [
    {
      "name": "时间字段",
      "columns": [1, 2],
      "description": "记录创建和更新时间"
    }
  ]
}`;
}

/**
 * 数据类型推荐 Prompt
 * 检查数据类型是否合理
 */
export function generateDataTypeRecommendationPrompt(
  column: ColumnInfo
): string {
  return `请检查以下字段的数据类型是否合理：

字段名: ${column.columnName}
当前数据类型: ${column.columnType}
字段注释: ${column.columnComment || '无'}

请判断：
1. 数据类型是否合理？
2. 如果不合理，推荐什么类型？
3. 推荐理由

请按照以下 JSON 格式返回:
{
  "isReasonable": true,
  "recommendedType": "VARCHAR(100)",
  "reasoning": "推荐理由"
}`;
}
