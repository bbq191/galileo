import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/database';
import { CollectorFactory } from '@/lib/metadata/collectors';
import prisma from '@/lib/prisma/client';
import crypto from 'crypto';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function calculateStructureHash(columns: any[]): string {
  const structureString = columns
    .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
    .map((col) => `${col.columnName}:${col.columnType}:${col.isNullable}:${col.isPrimaryKey}`)
    .join('|');
  return crypto.createHash('sha256').update(structureString).digest('hex');
}

export async function POST(request: NextRequest, context: RouteContext) {
  const startTime = Date.now();
  let syncStats = {
    databasesAdded: 0,
    databasesUpdated: 0,
    tablesAdded: 0,
    tablesUpdated: 0,
    columnsAdded: 0,
    columnsUpdated: 0,
  };

  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    console.log(`[Sync] Starting sync for data source ${dataSourceId}...`);

    const dataSource = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
    });

    if (!dataSource) {
      return NextResponse.json(
        { status: 'error', message: 'Data source not found' },
        { status: 404 }
      );
    }

    if (!connectionManager.hasConnection(id)) {
      return NextResponse.json(
        { status: 'error', message: 'Connection not available. Please test connection first.' },
        { status: 400 }
      );
    }

    const pool = await connectionManager.getConnection(id);

    const collector = CollectorFactory.createCollector(
      pool,
      dataSource.type as 'mysql' | 'mariadb' | 'postgresql'
    );

    console.log(`[Sync] Collector created successfully, type: ${dataSource.type}`);

    const databases = await collector.collectDatabases(id);
    console.log(`[Sync] Found ${databases.length} databases`);

    let targetDatabases = databases;
    if (dataSource.targetDatabases && Array.isArray(dataSource.targetDatabases)) {
      const targetNames = dataSource.targetDatabases as string[];
      if (targetNames.length > 0) {
        targetDatabases = databases.filter((db) => targetNames.includes(db.name));
        console.log(`[Sync] Filtered to ${targetDatabases.length} databases based on config`);
      }
    }

    const systemDatabases = ['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin'];
    targetDatabases = targetDatabases.filter((db) => !systemDatabases.includes(db.name.toLowerCase()));
    console.log(`[Sync] Remaining ${targetDatabases.length} databases after excluding system databases`);

    for (const dbInfo of targetDatabases) {
      console.log(`[Sync] Syncing database: ${dbInfo.name}`);

      try {
        const database = await prisma.databaseMeta.upsert({
          where: {
            sourceId_databaseName: {
              sourceId: dataSourceId,
              databaseName: dbInfo.name,
            },
          },
          update: { lastSyncedAt: new Date() },
          create: {
            sourceId: dataSourceId,
            databaseName: dbInfo.name,
            lastSyncedAt: new Date(),
          },
        });

        if (database.lastSyncedAt && new Date().getTime() - database.lastSyncedAt.getTime() < 60000) {
          syncStats.databasesUpdated++;
        } else {
          syncStats.databasesAdded++;
        }

        const tables = await collector.collectTables(id, dbInfo.name);
        console.log(`[Sync] Database ${dbInfo.name} has ${tables.length} tables`);

        const existingTables = await prisma.tableMeta.findMany({
          where: { databaseId: database.id },
          select: { id: true, tableName: true },
        });
        const existingTableNames = new Set(existingTables.map((t) => t.tableName));

        for (const tableInfo of tables) {
          try {
            const columns = await collector.collectColumns(id, dbInfo.name, tableInfo.tableName);
            const structureHash = calculateStructureHash(columns);

            const table = await prisma.tableMeta.upsert({
              where: {
                databaseId_tableName: {
                  databaseId: database.id,
                  tableName: tableInfo.tableName,
                },
              },
              update: {
                tableComment: tableInfo.tableComment || null,
                rowCount: BigInt(tableInfo.rowCount || 0),
                structureHash,
                updatedTime: tableInfo.updateTime || null,
                lastSyncedAt: new Date(),
              },
              create: {
                databaseId: database.id,
                tableName: tableInfo.tableName,
                tableComment: tableInfo.tableComment || null,
                rowCount: BigInt(tableInfo.rowCount || 0),
                structureHash,
                createdTime: tableInfo.createTime || null,
                updatedTime: tableInfo.updateTime || null,
                lastSyncedAt: new Date(),
              },
            });

            if (existingTableNames.has(tableInfo.tableName)) {
              syncStats.tablesUpdated++;
            } else {
              syncStats.tablesAdded++;
            }

            const existingColumns = await prisma.columnMeta.findMany({
              where: { tableId: table.id },
              select: { id: true, columnName: true },
            });
            const existingColumnNames = new Set(existingColumns.map((c) => c.columnName));

            for (const columnInfo of columns) {
              const isPrimaryKey = columnInfo.columnKey === 'PRI';
              const isUnique = columnInfo.columnKey === 'UNI';
              const isNullable = Boolean(columnInfo.isNullable);

              await prisma.columnMeta.upsert({
                where: {
                  tableId_columnName: {
                    tableId: table.id,
                    columnName: columnInfo.columnName,
                  },
                },
                update: {
                  dataType: columnInfo.dataType,
                  columnType: columnInfo.columnType,
                  columnComment: columnInfo.columnComment || null,
                  isNullable,
                  isPrimaryKey,
                  isUnique,
                  defaultValue: columnInfo.defaultValue || null,
                  ordinalPosition: columnInfo.ordinalPosition,
                },
                create: {
                  tableId: table.id,
                  columnName: columnInfo.columnName,
                  dataType: columnInfo.dataType,
                  columnType: columnInfo.columnType,
                  columnComment: columnInfo.columnComment || null,
                  isNullable,
                  isPrimaryKey,
                  isUnique,
                  defaultValue: columnInfo.defaultValue || null,
                  ordinalPosition: columnInfo.ordinalPosition,
                },
              });

              if (existingColumnNames.has(columnInfo.columnName)) {
                syncStats.columnsUpdated++;
              } else {
                syncStats.columnsAdded++;
              }
            }

            console.log(`[Sync] Table ${tableInfo.tableName} synced (${columns.length} columns)`);
          } catch (tableError) {
            console.error(`[Sync] Table ${tableInfo.tableName} sync failed:`, tableError);
          }
        }

        console.log(`[Sync] Database ${dbInfo.name} sync completed`);
      } catch (dbError) {
        console.error(`[Sync] Database ${dbInfo.name} sync failed:`, dbError);
      }
    }

    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: {
        lastSyncAt: new Date(),
        status: 'active',
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[Sync] Data source ${dataSourceId} sync completed in ${duration}ms`);
    console.log(`[Sync] Stats:`, syncStats);

    return NextResponse.json({
      status: 'success',
      message: 'Metadata synchronized successfully',
      data: {
        ...syncStats,
        databasesTotal: targetDatabases.length,
        duration,
      },
    });
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to synchronize metadata',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
