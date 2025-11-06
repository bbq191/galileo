/**
 * 优先级处理器
 *
 * 功能：
 * - 根据表的重要性分层处理
 * - 关键表立即处理，普通表进入队列，临时表延后
 * - 优化资源使用
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import { SemanticAnnotator } from './semantic-annotator';
import type { BatchProgress } from './batch-processor';

function getPrismaClient() {
  return prisma;
}

/**
 * 语义化优先级
 */
export enum SemanticPriority {
  /** 关键表 - 用户手动标记的核心表 */
  CRITICAL = 1,

  /** 高优先级 - 有外键关系的表 */
  HIGH = 2,

  /** 普通 - 标准业务表 */
  NORMAL = 3,

  /** 低优先级 - 临时表、日志表、备份表 */
  LOW = 4,
}

/**
 * 优先级判断规则
 */
interface PriorityRule {
  /** 规则名称 */
  name: string;

  /** 匹配函数 */
  match: (tableName: string, tableComment?: string) => boolean;

  /** 优先级 */
  priority: SemanticPriority;
}

/**
 * 内置优先级规则
 */
const PRIORITY_RULES: PriorityRule[] = [
  // ========================================
  // 低优先级模式（临时表、日志表）
  // ========================================
  {
    name: 'temp_table',
    match: (name) => /^(temp|tmp|temporary)_/i.test(name),
    priority: SemanticPriority.LOW,
  },
  {
    name: 'backup_table',
    match: (name) => /_(bak|backup|old|copy)$/i.test(name),
    priority: SemanticPriority.LOW,
  },
  {
    name: 'test_table',
    match: (name) => /^test_/i.test(name),
    priority: SemanticPriority.LOW,
  },
  {
    name: 'log_table',
    match: (name) => /_(log|logs)$/i.test(name),
    priority: SemanticPriority.LOW,
  },
  {
    name: 'archive_table',
    match: (name) => /_(archive|archived)$/i.test(name),
    priority: SemanticPriority.LOW,
  },

  // ========================================
  // 高优先级模式（核心业务表）
  // ========================================
  {
    name: 'user_table',
    match: (name) => /^(user|users|account|accounts)$/i.test(name),
    priority: SemanticPriority.CRITICAL,
  },
  {
    name: 'order_table',
    match: (name) => /^(order|orders|transaction|transactions)$/i.test(name),
    priority: SemanticPriority.CRITICAL,
  },
  {
    name: 'payment_table',
    match: (name) => /^(payment|payments|invoice|invoices)$/i.test(name),
    priority: SemanticPriority.CRITICAL,
  },
  {
    name: 'product_table',
    match: (name) => /^(product|products|goods|item|items)$/i.test(name),
    priority: SemanticPriority.HIGH,
  },
];

/**
 * 处理任务
 */
interface ProcessingTask {
  tableId: number;
  tableName: string;
  priority: SemanticPriority;
  databaseId: number;
}

/**
 * 优先级处理器类
 */
export class PriorityProcessor {
  private annotator: SemanticAnnotator;
  private processing = false;
  private queue: ProcessingTask[] = [];

  constructor() {
    // 使用 getter 函数获取 annotator 实例
    const { getSemanticAnnotator } = require('./semantic-annotator');
    this.annotator = getSemanticAnnotator();
  }

  /**
   * 自动检测并设置表的优先级
   */
  async detectAndSetPriority(tableId: number): Promise<SemanticPriority> {
    const table = await getPrismaClient().tableMeta.findUnique({
      where: { id: tableId },
      include: {
        columns: true,
        sourceRelationships: true,
        targetRelationships: true,
      },
    });

    if (!table) {
      throw new Error(`表不存在: ${tableId}`);
    }

    // 1. 应用规则判断
    for (const rule of PRIORITY_RULES) {
      if (rule.match(table.tableName, table.tableComment || undefined)) {
        await getPrismaClient().tableMeta.update({
          where: { id: tableId },
          data: { semanticPriority: rule.priority },
        });

        console.log(`表 ${table.tableName} 优先级设置为: ${SemanticPriority[rule.priority]} (规则: ${rule.name})`);
        return rule.priority;
      }
    }

    // 2. 检查是否有外键关系
    const hasRelationships =
      table.sourceRelationships.length > 0 || table.targetRelationships.length > 0;

    const priority = hasRelationships ? SemanticPriority.HIGH : SemanticPriority.NORMAL;

    await getPrismaClient().tableMeta.update({
      where: { id: tableId },
      data: { semanticPriority: priority },
    });

    console.log(`表 ${table.tableName} 优先级设置为: ${SemanticPriority[priority]} (${hasRelationships ? '有外键关系' : '默认'})`);

    return priority;
  }

  /**
   * 批量检测数据库中所有表的优先级
   */
  async detectDatabasePriorities(databaseId: number): Promise<{
    critical: number;
    high: number;
    normal: number;
    low: number;
  }> {
    console.log(`开始检测数据库 ${databaseId} 的表优先级...`);

    const tables = await getPrismaClient().tableMeta.findMany({
      where: { databaseId },
    });

    const stats = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    for (const table of tables) {
      const priority = await this.detectAndSetPriority(table.id);

      switch (priority) {
        case SemanticPriority.CRITICAL:
          stats.critical++;
          break;
        case SemanticPriority.HIGH:
          stats.high++;
          break;
        case SemanticPriority.NORMAL:
          stats.normal++;
          break;
        case SemanticPriority.LOW:
          stats.low++;
          break;
      }
    }

    console.log(`优先级检测完成:`);
    console.log(`  关键表: ${stats.critical}`);
    console.log(`  高优先级: ${stats.high}`);
    console.log(`  普通: ${stats.normal}`);
    console.log(`  低优先级: ${stats.low}`);

    return stats;
  }

  /**
   * 按优先级处理数据库
   */
  async processByPriority(
    databaseId: number,
    options: {
      force?: boolean;
      onProgress?: (stage: string, progress: BatchProgress) => void;
    } = {}
  ): Promise<void> {
    if (this.processing) {
      throw new Error('已有处理任务正在运行');
    }

    this.processing = true;

    try {
      console.log(`\n========================================`);
      console.log(`按优先级处理数据库 ${databaseId}`);
      console.log(`========================================\n`);

      // 1. 先检测优先级
      await this.detectDatabasePriorities(databaseId);

      // 2. 按优先级分组获取表
      const criticalTables = await getPrismaClient().tableMeta.findMany({
        where: { databaseId, semanticPriority: SemanticPriority.CRITICAL },
        orderBy: { tableName: 'asc' },
      });

      const highTables = await getPrismaClient().tableMeta.findMany({
        where: { databaseId, semanticPriority: SemanticPriority.HIGH },
        orderBy: { tableName: 'asc' },
      });

      const normalTables = await getPrismaClient().tableMeta.findMany({
        where: { databaseId, semanticPriority: SemanticPriority.NORMAL },
        orderBy: { tableName: 'asc' },
      });

      const lowTables = await getPrismaClient().tableMeta.findMany({
        where: { databaseId, semanticPriority: SemanticPriority.LOW },
        orderBy: { tableName: 'asc' },
      });

      // 3. 立即处理关键表
      if (criticalTables.length > 0) {
        console.log(`\n阶段 1/4: 立即处理 ${criticalTables.length} 个关键表...`);
        await this.processImmediately(criticalTables, options);
      }

      // 4. 处理高优先级表
      if (highTables.length > 0) {
        console.log(`\n阶段 2/4: 处理 ${highTables.length} 个高优先级表...`);
        await this.processImmediately(highTables, options);
      }

      // 5. 处理普通表（进入队列）
      if (normalTables.length > 0) {
        console.log(`\n阶段 3/4: 处理 ${normalTables.length} 个普通表...`);
        await this.enqueueForProcessing(normalTables, options);
      }

      // 6. 处理低优先级表（延后）
      if (lowTables.length > 0) {
        console.log(`\n阶段 4/4: 处理 ${lowTables.length} 个低优先级表（可选）...`);
        console.log(`提示: 低优先级表将在系统空闲时处理，或手动触发`);
        // 实际生产环境中，这里可以不处理，等待空闲时或手动触发
        // await this.enqueueForProcessing(lowTables, options);
      }

      console.log(`\n========================================`);
      console.log(`优先级处理完成`);
      console.log(`========================================\n`);
    } finally {
      this.processing = false;
    }
  }

  /**
   * 立即处理表列表
   */
  private async processImmediately(
    tables: any[],
    options: {
      force?: boolean;
      onProgress?: (stage: string, progress: BatchProgress) => void;
    }
  ): Promise<void> {
    for (const table of tables) {
      console.log(`处理表: ${table.tableName}`);

      // 先标注表本身
      await this.annotator.annotateTable(table.id, options.force);

      // 再标注所有字段
      await this.annotator.annotateColumns(table.id, {
        force: options.force,
        onProgress: options.onProgress
          ? (progress) => options.onProgress!(`表: ${table.tableName}`, progress)
          : undefined,
      });
    }
  }

  /**
   * 加入处理队列（异步处理）
   */
  private async enqueueForProcessing(
    tables: any[],
    options: {
      force?: boolean;
      onProgress?: (stage: string, progress: BatchProgress) => void;
    }
  ): Promise<void> {
    // 在实际生产环境中，这里应该使用消息队列（如 BullMQ）
    // 这里简化为直接处理
    for (const table of tables) {
      console.log(`处理表: ${table.tableName}`);

      await this.annotator.annotateTable(table.id, options.force);
      await this.annotator.annotateColumns(table.id, {
        force: options.force,
        onProgress: options.onProgress
          ? (progress) => options.onProgress!(`表: ${table.tableName}`, progress)
          : undefined,
      });
    }
  }

  /**
   * 获取处理队列状态
   */
  getQueueStatus(): {
    processing: boolean;
    queueLength: number;
    tasks: ProcessingTask[];
  } {
    return {
      processing: this.processing,
      queueLength: this.queue.length,
      tasks: [...this.queue],
    };
  }

  /**
   * 手动处理低优先级表
   */
  async processLowPriorityTables(
    databaseId: number,
    options: {
      force?: boolean;
      onProgress?: (stage: string, progress: BatchProgress) => void;
    } = {}
  ): Promise<void> {
    console.log(`开始处理数据库 ${databaseId} 的低优先级表...`);

    const lowTables = await getPrismaClient().tableMeta.findMany({
      where: { databaseId, semanticPriority: SemanticPriority.LOW },
      orderBy: { tableName: 'asc' },
    });

    if (lowTables.length === 0) {
      console.log('没有低优先级表需要处理');
      return;
    }

    await this.processImmediately(lowTables, options);

    console.log(`低优先级表处理完成: ${lowTables.length} 个表`);
  }
}

/**
 * 导出默认实例
 */
export const priorityProcessor = new PriorityProcessor();
