/**
 * 语义标注器
 *
 * 功能：
 * - 混合处理：优先使用规则引擎，规则无法覆盖时使用 AI
 * - 数据库、表、字段的语义化标注
 * - 批量处理和进度跟踪
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import type { DatabaseInfo, TableInfo, ColumnInfo } from '@/lib/metadata/types';
import { RuleBasedAnnotator } from './rules/naming-rules';
import { BatchProcessor, type BatchRequest, type BatchProgress } from './batch-processor';
import {
  generateDatabaseSemanticPrompt,
  generateTableSemanticPrompt,
  generateColumnSemanticPrompt,
  generateBatchColumnSemanticPrompt,
} from './prompt-templates';
import { semanticConfig } from './config';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 语义标注来源
 */
export type SemanticSource = 'rule' | 'ai' | 'manual';

/**
 * 标注结果
 */
export interface AnnotationResult {
  /** 语义描述 */
  semantic: string;

  /** 来源 */
  source: SemanticSource;

  /** 置信度 */
  confidence: number;
}

/**
 * 标注统计
 */
export interface AnnotationStats {
  /** 总数 */
  total: number;

  /** 规则引擎处理 */
  ruleProcessed: number;

  /** AI 处理 */
  aiProcessed: number;

  /** 已存在（跳过） */
  skipped: number;

  /** 失败 */
  failed: number;

  /** 规则覆盖率 */
  ruleCoverageRate: number;

  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 语义标注器类
 */
@injectable()
export class SemanticAnnotator {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient,
    @inject(DI_TOKENS.RuleBasedAnnotator) private ruleAnnotator: RuleBasedAnnotator,
    @inject(DI_TOKENS.BatchProcessor) private batchProcessor: BatchProcessor
  ) {}

  /**
   * 标注数据库
   */
  async annotateDatabase(
    databaseId: number,
    force: boolean = false
  ): Promise<AnnotationResult> {
    console.log(`开始标注数据库 ID: ${databaseId}`);

    // 获取数据库元数据
    const database = await this.prisma.databaseMeta.findUnique({
      where: { id: databaseId },
      include: { tables: true },
    });

    if (!database) {
      throw new Error(`数据库不存在: ${databaseId}`);
    }

    // 检查是否已有语义描述
    if (database.semanticDescription && !force) {
      console.log('数据库已有语义描述，跳过');
      return {
        semantic: database.semanticDescription,
        source: 'manual',
        confidence: 1.0,
      };
    }

    // 使用 AI 生成语义描述
    const tableNames = database.tables.map((t) => t.tableName);
    const databaseInfo: DatabaseInfo = {
      name: database.databaseName,
    };

    const prompt = generateDatabaseSemanticPrompt(databaseInfo, tableNames);
    const messages = [
      {
        role: 'system' as const,
        content: '你是一个数据库专家。请为数据库生成简洁的中文业务描述。',
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    const response = await this.batchProcessor['client'].chat(messages, {
      temperature: semanticConfig.temperature,
      max_tokens: semanticConfig.maxTokens,
    });

    // 保存语义描述
    await this.prisma.databaseMeta.update({
      where: { id: databaseId },
      data: { semanticDescription: response.trim() },
    });

    console.log(`数据库语义标注完成: ${response.trim()}`);

    return {
      semantic: response.trim(),
      source: 'ai',
      confidence: 0.8,
    };
  }

  /**
   * 标注表
   */
  async annotateTable(
    tableId: number,
    force: boolean = false
  ): Promise<AnnotationResult> {
    console.log(`开始标注表 ID: ${tableId}`);

    // 获取表元数据
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        columns: {
          orderBy: { ordinalPosition: 'asc' },
          take: 20, // 只取前20个字段作为上下文
        },
        database: true,
      },
    });

    if (!table) {
      throw new Error(`表不存在: ${tableId}`);
    }

    // 检查是否已有语义描述
    if (table.semanticDescription && !force) {
      console.log('表已有语义描述，跳过');
      return {
        semantic: table.semanticDescription,
        source: 'manual',
        confidence: 1.0,
      };
    }

    // 使用 AI 生成语义描述
    const tableInfo: TableInfo = {
      tableName: table.tableName,
      databaseName: table.database.databaseName,
      tableComment: table.tableComment || undefined,
      tableType: 'BASE TABLE',
    };

    const columnInfos: ColumnInfo[] = table.columns.map((col) => ({
      columnName: col.columnName,
      tableName: table.tableName,
      databaseName: table.database.databaseName,
      dataType: col.dataType,
      columnType: col.columnType,
      columnComment: col.columnComment || undefined,
      isNullable: col.isNullable,
      columnKey: (col.isPrimaryKey ? 'PRI' : '') as any,
      ordinalPosition: col.ordinalPosition,
    }));

    const prompt = generateTableSemanticPrompt(tableInfo, columnInfos);
    const messages = [
      {
        role: 'system' as const,
        content: '你是一个数据库专家。请为数据表生成简洁的中文业务描述。',
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    const response = await this.batchProcessor['client'].chat(messages, {
      temperature: semanticConfig.temperature,
      max_tokens: semanticConfig.maxTokens,
    });

    // 保存语义描述
    await this.prisma.tableMeta.update({
      where: { id: tableId },
      data: { semanticDescription: response.trim() },
    });

    console.log(`表语义标注完成: ${response.trim()}`);

    return {
      semantic: response.trim(),
      source: 'ai',
      confidence: 0.8,
    };
  }

  /**
   * 标注字段（混合处理）
   */
  async annotateColumn(
    columnId: number,
    force: boolean = false
  ): Promise<AnnotationResult> {
    // 获取字段元数据
    const column = await this.prisma.columnMeta.findUnique({
      where: { id: columnId },
      include: {
        table: {
          include: { database: true },
        },
      },
    });

    if (!column) {
      throw new Error(`字段不存在: ${columnId}`);
    }

    // 检查是否已有语义描述
    if (column.semanticDescription && !force) {
      return {
        semantic: column.semanticDescription,
        source: (column.semanticSource as SemanticSource) || 'manual',
        confidence: 1.0,
      };
    }

    const columnInfo: ColumnInfo = {
      columnName: column.columnName,
      tableName: column.table.tableName,
      databaseName: column.table.database.databaseName,
      dataType: column.dataType,
      columnType: column.columnType,
      columnComment: column.columnComment || undefined,
      isNullable: column.isNullable,
      columnKey: (column.isPrimaryKey ? 'PRI' : '') as any,
      ordinalPosition: column.ordinalPosition,
    };

    // 1. 尝试规则引擎
    const ruleResult = await this.ruleAnnotator.annotate(columnInfo);

    if (ruleResult) {
      // 规则引擎成功匹配
      await this.prisma.columnMeta.update({
        where: { id: columnId },
        data: {
          semanticDescription: ruleResult.semantic,
          semanticSource: 'rule',
        },
      });

      return {
        semantic: ruleResult.semantic,
        source: 'rule',
        confidence: ruleResult.confidence,
      };
    }

    // 2. 规则引擎无法处理，使用 AI
    const prompt = generateColumnSemanticPrompt(columnInfo);
    const messages = [
      {
        role: 'system' as const,
        content: '你是一个数据库专家。请为数据库字段生成简洁的中文业务描述。',
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    const response = await this.batchProcessor['client'].chat(messages, {
      temperature: semanticConfig.temperature,
      max_tokens: semanticConfig.maxTokens,
    });

    // 保存语义描述
    await this.prisma.columnMeta.update({
      where: { id: columnId },
      data: {
        semanticDescription: response.trim(),
        semanticSource: 'ai',
      },
    });

    return {
      semantic: response.trim(),
      source: 'ai',
      confidence: 0.75,
    };
  }

  /**
   * 批量标注字段（混合处理 + 批量优化）
   */
  async annotateColumns(
    tableId: number,
    options: {
      force?: boolean;
      onProgress?: (progress: BatchProgress) => void;
    } = {}
  ): Promise<AnnotationStats> {
    const startTime = Date.now();
    const { force = false, onProgress } = options;

    console.log(`开始批量标注表 ${tableId} 的字段...`);

    // 获取所有字段
    const columns = await this.prisma.columnMeta.findMany({
      where: { tableId },
      include: {
        table: {
          include: { database: true },
        },
      },
      orderBy: { ordinalPosition: 'asc' },
    });

    if (columns.length === 0) {
      return {
        total: 0,
        ruleProcessed: 0,
        aiProcessed: 0,
        skipped: 0,
        failed: 0,
        ruleCoverageRate: 0,
        duration: 0,
      };
    }

    const stats = {
      total: columns.length,
      ruleProcessed: 0,
      aiProcessed: 0,
      skipped: 0,
      failed: 0,
      ruleCoverageRate: 0,
      duration: 0,
    };

    // 第一步：规则引擎批量处理
    console.log('步骤1: 规则引擎处理...');
    const needsAI: typeof columns = [];

    for (const column of columns) {
      // 跳过已有语义描述的字段
      if (column.semanticDescription && !force) {
        stats.skipped++;
        continue;
      }

      const columnInfo: ColumnInfo = {
        columnName: column.columnName,
        tableName: column.table.tableName,
        databaseName: column.table.database.databaseName,
        dataType: column.dataType,
        columnType: column.columnType,
        columnComment: column.columnComment || undefined,
        isNullable: column.isNullable,
        columnKey: (column.isPrimaryKey ? 'PRI' : '') as any,
        ordinalPosition: column.ordinalPosition,
      };

      const ruleResult = await this.ruleAnnotator.annotate(columnInfo);

      if (ruleResult) {
        // 规则引擎成功
        await this.prisma.columnMeta.update({
          where: { id: column.id },
          data: {
            semanticDescription: ruleResult.semantic,
            semanticSource: 'rule',
          },
        });
        stats.ruleProcessed++;
      } else {
        // 需要 AI 处理
        needsAI.push(column);
      }
    }

    console.log(`规则引擎处理完成: ${stats.ruleProcessed}/${columns.length}`);

    // 第二步：AI 批量处理
    if (needsAI.length > 0) {
      console.log(`步骤2: AI 处理剩余 ${needsAI.length} 个字段...`);

      const batchRequests: BatchRequest<typeof columns[0]>[] = needsAI.map((column) => {
        const columnInfo: ColumnInfo = {
          columnName: column.columnName,
          tableName: column.table.tableName,
          databaseName: column.table.database.databaseName,
          dataType: column.dataType,
          columnType: column.columnType,
          columnComment: column.columnComment || undefined,
          isNullable: column.isNullable,
          columnKey: (column.isPrimaryKey ? 'PRI' : '') as any,
          ordinalPosition: column.ordinalPosition,
        };

        const prompt = generateColumnSemanticPrompt(columnInfo);

        return {
          id: column.id.toString(),
          data: column,
          messages: [
            {
              role: 'system',
              content: '你是一个数据库专家。请为数据库字段生成简洁的中文业务描述。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: semanticConfig.temperature,
          maxTokens: semanticConfig.maxTokens,
        };
      });

      const results = await this.batchProcessor.process(batchRequests, {
        onProgress,
      });

      // 保存 AI 结果
      for (const result of results) {
        if (result.success) {
          await this.prisma.columnMeta.update({
            where: { id: result.data.id },
            data: {
              semanticDescription: result.response.trim(),
              semanticSource: 'ai',
            },
          });
          stats.aiProcessed++;
        } else {
          stats.failed++;
          console.error(`字段 ${result.data.columnName} 标注失败:`, result.error);
        }
      }
    }

    const duration = Date.now() - startTime;

    stats.ruleCoverageRate =
      stats.total > 0 ? stats.ruleProcessed / (stats.total - stats.skipped) : 0;
    stats.duration = duration;

    console.log(`\n批量标注完成:`);
    console.log(`  总数: ${stats.total}`);
    console.log(`  规则引擎: ${stats.ruleProcessed} (${(stats.ruleCoverageRate * 100).toFixed(1)}%)`);
    console.log(`  AI处理: ${stats.aiProcessed}`);
    console.log(`  跳过: ${stats.skipped}`);
    console.log(`  失败: ${stats.failed}`);
    console.log(`  耗时: ${(duration / 1000).toFixed(2)}s\n`);

    return stats;
  }

  /**
   * 标注整个数据库的所有表和字段
   */
  async annotateDatabaseFull(
    databaseId: number,
    options: {
      force?: boolean;
      onProgress?: (progress: { stage: string; progress: BatchProgress }) => void;
    } = {}
  ): Promise<{
    database: AnnotationResult;
    tables: AnnotationStats;
    columns: AnnotationStats;
  }> {
    console.log(`\n========================================`);
    console.log(`开始完整标注数据库 ID: ${databaseId}`);
    console.log(`========================================\n`);

    // 1. 标注数据库
    console.log('阶段 1/3: 标注数据库...');
    const databaseResult = await this.annotateDatabase(databaseId, options.force);

    // 2. 获取所有表
    const tables = await this.prisma.tableMeta.findMany({
      where: { databaseId },
    });

    console.log(`\n阶段 2/3: 标注 ${tables.length} 个表...`);
    let tablesProcessed = 0;
    let tablesAI = 0;

    for (const table of tables) {
      const result = await this.annotateTable(table.id, options.force);
      if (result.source === 'ai') tablesAI++;
      tablesProcessed++;
    }

    const tablesStats: AnnotationStats = {
      total: tables.length,
      ruleProcessed: 0,
      aiProcessed: tablesAI,
      skipped: tables.length - tablesProcessed,
      failed: 0,
      ruleCoverageRate: 0,
      duration: 0,
    };

    // 3. 标注所有字段
    console.log(`\n阶段 3/3: 标注所有字段...`);
    const allColumnsStats: AnnotationStats = {
      total: 0,
      ruleProcessed: 0,
      aiProcessed: 0,
      skipped: 0,
      failed: 0,
      ruleCoverageRate: 0,
      duration: 0,
    };

    for (const table of tables) {
      const stats = await this.annotateColumns(table.id, {
        force: options.force,
        onProgress: options.onProgress
          ? (progress) => options.onProgress!({ stage: `表: ${table.tableName}`, progress })
          : undefined,
      });

      allColumnsStats.total += stats.total;
      allColumnsStats.ruleProcessed += stats.ruleProcessed;
      allColumnsStats.aiProcessed += stats.aiProcessed;
      allColumnsStats.skipped += stats.skipped;
      allColumnsStats.failed += stats.failed;
      allColumnsStats.duration += stats.duration;
    }

    allColumnsStats.ruleCoverageRate =
      allColumnsStats.total > 0
        ? allColumnsStats.ruleProcessed / (allColumnsStats.total - allColumnsStats.skipped)
        : 0;

    console.log(`\n========================================`);
    console.log(`数据库完整标注完成`);
    console.log(`========================================\n`);

    return {
      database: databaseResult,
      tables: tablesStats,
      columns: allColumnsStats,
    };
  }
}

/**
 * 导出默认实例（向后兼容）
 */
let _semanticAnnotator: SemanticAnnotator | null = null;

export function getSemanticAnnotator(): SemanticAnnotator {
  if (!_semanticAnnotator) {
    const { getService } = require('@/lib/di/setup');
    try {
      _semanticAnnotator = getService<SemanticAnnotator>(DI_TOKENS.SemanticAnnotator);
    } catch {
      // 回退方案：创建不使用 DI 的实例
      const prisma = require('@/lib/prisma/client').default;
      const { RuleBasedAnnotator } = require('./rules/naming-rules');
      const { BatchProcessor } = require('./batch-processor');
      const { getDeepseekClient } = require('./deepseek-client');

      const ruleAnnotator = new RuleBasedAnnotator(prisma);
      const deepseekClient = getDeepseekClient();
      const batchProcessor = new BatchProcessor(deepseekClient);
      _semanticAnnotator = new SemanticAnnotator(prisma, ruleAnnotator, batchProcessor);
    }
  }
  return _semanticAnnotator;
}

export const semanticAnnotator = new Proxy({} as SemanticAnnotator, {
  get(_target, prop) {
    return getSemanticAnnotator()[prop as keyof SemanticAnnotator];
  }
});
