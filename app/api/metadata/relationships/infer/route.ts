/**
 * 关系推断 API
 * POST /api/metadata/relationships/infer
 */

import { NextRequest, NextResponse } from 'next/server';
import connectionManager from '@/lib/database/connection-manager';
import { CollectorFactory } from '@/lib/metadata/collectors';
import { RelationshipInferencer } from '@/lib/metadata/inference';
import type { ColumnInfo } from '@/lib/metadata/types';

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
}

/**
 * POST /api/metadata/relationships/infer
 * 推断数据库关系
 */
export async function POST(request: NextRequest) {
  try {
    const body: InferRelationshipsRequest = await request.json();

    const { dataSourceId, databases, crossDatabase = false, minConfidence, maxPairsToCheck } = body;

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

      return NextResponse.json({
        status: 'success',
        message: `Successfully inferred relationships for database: ${database}`,
        data: {
          database,
          ...result,
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

      return NextResponse.json({
        status: 'success',
        message: `Successfully inferred cross-database relationships for ${databasesToInfer.length} databases`,
        data: {
          databases: databasesToInfer,
          ...result,
        },
      });
    }

    // 多数据库单独推断
    const results = [];

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
    }

    return NextResponse.json({
      status: 'success',
      message: `Successfully inferred relationships for ${databasesToInfer.length} databases`,
      data: results,
    });
  } catch (error) {
    console.error('关系推断失败:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to infer relationships',
        error: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
