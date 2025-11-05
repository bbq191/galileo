/**
 * 关系推断 API
 * POST /api/metadata/relationships/infer
 */

import { NextRequest, NextResponse } from 'next/server';
import connectionManager from '@/lib/database/connection-manager';
import { CollectorFactory } from '@/lib/metadata/collectors';
import { RelationshipInferencer } from '@/lib/metadata/inference';
import type { ColumnInfo } from '@/lib/metadata/types';
import { metadataRepository } from '@/lib/metadata/storage';
import { cachedMetadataRepository } from '@/lib/metadata/storage/cached-metadata-repository';
import type { InferredRelationship } from '@/lib/metadata/inference/types';
import type { CreateInferredRelationshipInput } from '@/lib/metadata/storage/types';
import { Prisma } from '@/app/generated/prisma';
import { safeServerErrorResponse } from '@/lib/api/response';
import { ErrorCategory } from '@/lib/security/error-sanitizer';

/**
 * 推断关系请求体
 */
interface InferRelationshipsRequest {
  /** 数据源 ID */
  dataSourceId: string;

  /** 数据库列表（如果为空则推断所有数据库） */
  databases?: string[];

  /** 是否跨数据库推断 */
  crossDatabase?: boolean;

  /** 最小置信度阈值 */
  minConfidence?: number;

  /** 最大检查字段对数 */
  maxPairsToCheck?: number;

  /** 是否保存到数据库（默认 true） */
  saveToDatabase?: boolean;
}

/**
 * 将推断关系转换为数据库输入格式
 */
async function convertInferredRelationshipsToDatabaseInputs(
  dataSourceId: string,
  relationships: InferredRelationship[]
): Promise<CreateInferredRelationshipInput[]> {
  const inputs: CreateInferredRelationshipInput[] = [];

  // 创建缓存以减少数据库查询
  const tableCache = new Map<string, number>(); // key: "databaseName.tableName", value: tableId
  const columnCache = new Map<string, number>(); // key: "tableId.columnName", value: columnId

  for (const rel of relationships) {
    try {
      // 验证必需字段
      if (!rel.sourceDatabaseName || !rel.targetDatabaseName) {
        console.error(`推断关系缺少数据库名称:`, {
          sourceDatabaseName: rel.sourceDatabaseName,
          sourceTable: rel.sourceTable,
          sourceColumn: rel.sourceColumn,
          targetDatabaseName: rel.targetDatabaseName,
          targetTable: rel.targetTable,
          targetColumn: rel.targetColumn,
        });
        continue;
      }

      // 获取源表ID
      const sourceTableKey = `${rel.sourceDatabaseName}.${rel.sourceTable}`;
      let sourceTableId = tableCache.get(sourceTableKey);

      if (!sourceTableId) {
        const dbMeta = await metadataRepository.getDatabaseByName(
          parseInt(dataSourceId),
          rel.sourceDatabaseName
        );
        if (!dbMeta) {
          console.error(`未找到数据库: ${rel.sourceDatabaseName}`);
          continue;
        }

        const tableMeta = await metadataRepository.getTableByName(dbMeta.id, rel.sourceTable);
        if (!tableMeta) {
          console.error(`未找到表: ${rel.sourceDatabaseName}.${rel.sourceTable}`);
          continue;
        }

        sourceTableId = tableMeta.id;
        tableCache.set(sourceTableKey, sourceTableId);
      }

      // 获取目标表ID
      const targetTableKey = `${rel.targetDatabaseName}.${rel.targetTable}`;
      let targetTableId = tableCache.get(targetTableKey);

      if (!targetTableId) {
        const dbMeta = await metadataRepository.getDatabaseByName(
          parseInt(dataSourceId),
          rel.targetDatabaseName
        );
        if (!dbMeta) {
          console.error(`未找到数据库: ${rel.targetDatabaseName}`);
          continue;
        }

        const tableMeta = await metadataRepository.getTableByName(dbMeta.id, rel.targetTable);
        if (!tableMeta) {
          console.error(`未找到表: ${rel.targetDatabaseName}.${rel.targetTable}`);
          continue;
        }

        targetTableId = tableMeta.id;
        tableCache.set(targetTableKey, targetTableId);
      }

      // 获取源字段ID
      const sourceColumnKey = `${sourceTableId}.${rel.sourceColumn}`;
      let sourceColumnId = columnCache.get(sourceColumnKey);

      if (!sourceColumnId) {
        const columnMeta = await metadataRepository.getColumnByName(sourceTableId, rel.sourceColumn);
        if (!columnMeta) {
          console.error(`未找到字段: ${rel.sourceTable}.${rel.sourceColumn}`);
          continue;
        }

        sourceColumnId = columnMeta.id;
        columnCache.set(sourceColumnKey, sourceColumnId);
      }

      // 获取目标字段ID
      const targetColumnKey = `${targetTableId}.${rel.targetColumn}`;
      let targetColumnId = columnCache.get(targetColumnKey);

      if (!targetColumnId) {
        const columnMeta = await metadataRepository.getColumnByName(targetTableId, rel.targetColumn);
        if (!columnMeta) {
          console.error(`未找到字段: ${rel.targetTable}.${rel.targetColumn}`);
          continue;
        }

        targetColumnId = columnMeta.id;
        columnCache.set(targetColumnKey, targetColumnId);
      }

      // 转换关系类型
      const relationshipType = rel.relationshipType.toUpperCase().replace(/-/g, '_') as 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';

      // 创建输入对象
      inputs.push({
        sourceTableId,
        sourceColumnId,
        targetTableId,
        targetColumnId,
        confidenceScore: new Prisma.Decimal(rel.confidenceScore),
        relationshipType,
        inferenceMethod: rel.inferenceMethod,
        reasoning: rel.reasoning,
        isVerified: false,
      });
    } catch (error) {
      console.error(`转换推断关系失败:`, error);
    }
  }

  return inputs;
}

/**
 * POST /api/metadata/relationships/infer
 * 推断数据库关系
 */
export async function POST(request: NextRequest) {
  try {
    const body: InferRelationshipsRequest = await request.json();

    const { dataSourceId, databases, crossDatabase = false, minConfidence, maxPairsToCheck, saveToDatabase = true } = body;

    if (!dataSourceId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'dataSourceId is required',
        },
        { status: 400 }
      );
    }

    // 获取连接
    const pool = await connectionManager.getConnection(dataSourceId);
    const collector = CollectorFactory.createCollector(pool, 'mysql');

    // 创建推断器
    const inferencer = new RelationshipInferencer({
      crossDatabase,
      minConfidence,
      maxPairsToCheck,
    });

    // 获取要推断的数据库列表
    let databasesToInfer: string[] = [];

    if (databases && databases.length > 0) {
      databasesToInfer = databases;
    } else {
      // 获取所有数据库
      const allDatabases = await collector.collectDatabases(dataSourceId);
      databasesToInfer = allDatabases.map((db) => db.name);
    }

    console.log(`开始推断关系，数据库数量: ${databasesToInfer.length}`);

    // 如果是单数据库推断
    if (!crossDatabase && databasesToInfer.length === 1) {
      const database = databasesToInfer[0];

      // 采集所有字段
      const tables = await collector.collectTables(dataSourceId, database);
      const allColumns: ColumnInfo[] = [];

      for (const table of tables) {
        const columns = await collector.collectColumns(dataSourceId, database, table.tableName);
        allColumns.push(...columns);
      }

      // 推断关系
      const result = await inferencer.inferRelationships(database, allColumns);

      // 保存到数据库
      let saveResult;
      if (saveToDatabase && result.relationships.length > 0) {
        console.log(`\n========================================`);
        console.log(`开始保存推断关系到数据库`);
        console.log(`========================================`);

        const inputs = await convertInferredRelationshipsToDatabaseInputs(
          dataSourceId,
          result.relationships
        );

        saveResult = await metadataRepository.batchSaveInferredRelationships(inputs);

        console.log(`保存结果: 成功 ${saveResult.successCount}, 失败 ${saveResult.failureCount}`);
        console.log(`========================================\n`);
      }

      return NextResponse.json({
        status: 'success',
        message: `Successfully inferred relationships for database: ${database}`,
        data: {
          database,
          ...result,
          saveResult,
        },
      });
    }

    // 跨数据库推断
    if (crossDatabase) {
      const databaseColumns = new Map<string, ColumnInfo[]>();

      for (const database of databasesToInfer) {
        const tables = await collector.collectTables(dataSourceId, database);
        const allColumns: ColumnInfo[] = [];

        for (const table of tables) {
          const columns = await collector.collectColumns(dataSourceId, database, table.tableName);
          allColumns.push(...columns);
        }

        databaseColumns.set(database, allColumns);
      }

      // 推断跨数据库关系
      const result = await inferencer.inferCrossDatabaseRelationships(databaseColumns);

      // 保存到数据库
      let saveResult;
      if (saveToDatabase && result.relationships.length > 0) {
        console.log(`\n========================================`);
        console.log(`开始保存推断关系到数据库`);
        console.log(`========================================`);

        const inputs = await convertInferredRelationshipsToDatabaseInputs(
          dataSourceId,
          result.relationships
        );

        saveResult = await metadataRepository.batchSaveInferredRelationships(inputs);

        console.log(`保存结果: 成功 ${saveResult.successCount}, 失败 ${saveResult.failureCount}`);
        console.log(`========================================\n`);
      }

      return NextResponse.json({
        status: 'success',
        message: `Successfully inferred cross-database relationships for ${databasesToInfer.length} databases`,
        data: {
          databases: databasesToInfer,
          ...result,
          saveResult,
        },
      });
    }

    // 多数据库单独推断
    const results = [];
    const allRelationships: InferredRelationship[] = [];

    for (const database of databasesToInfer) {
      const tables = await collector.collectTables(dataSourceId, database);
      const allColumns: ColumnInfo[] = [];

      for (const table of tables) {
        const columns = await collector.collectColumns(dataSourceId, database, table.tableName);
        allColumns.push(...columns);
      }

      const result = await inferencer.inferRelationships(database, allColumns);
      results.push({
        database,
        ...result,
      });

      // 收集所有关系
      allRelationships.push(...result.relationships);
    }

    // 保存到数据库
    let saveResult;
    if (saveToDatabase && allRelationships.length > 0) {
      console.log(`\n========================================`);
      console.log(`开始保存推断关系到数据库`);
      console.log(`========================================`);

      const inputs = await convertInferredRelationshipsToDatabaseInputs(
        dataSourceId,
        allRelationships
      );

      saveResult = await metadataRepository.batchSaveInferredRelationships(inputs);

      console.log(`保存结果: 成功 ${saveResult.successCount}, 失败 ${saveResult.failureCount}`);
      console.log(`========================================\n`);
    }

    return NextResponse.json({
      status: 'success',
      message: `Successfully inferred relationships for ${databasesToInfer.length} databases`,
      data: {
        results,
        saveResult,
      },
    });
  } catch (error) {
    // 使用安全的错误响应（已脱敏，不泄露堆栈信息）
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to infer relationships'),
      {
        context: 'relationships-infer',
        metadata: {
          dataSourceId: body.dataSourceId,
          operation: 'infer_relationships',
        },
      }
    );
  }
}
