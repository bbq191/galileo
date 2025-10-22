/**
 * AI 相关表迁移脚本
 *
 * 执行任务队列、错误日志和断点续传表的创建
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function runMigrations() {
  console.log('开始执行 AI 相关表迁移...');

  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');

  const migrations = [
    'add_task_queue.sql',
    'add_error_logging.sql',
    'add_process_progress.sql',
  ];

  try {
    for (const migration of migrations) {
      const filePath = path.join(migrationsDir, migration);

      if (!fs.existsSync(filePath)) {
        console.error(`迁移文件不存在: ${filePath}`);
        continue;
      }

      console.log(`执行迁移: ${migration}`);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // 分割多个 SQL 语句（按 CREATE TABLE 分割）
      const statements = sql
        .split(/;\s*(?=CREATE\s+TABLE)/gi)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          // 添加分号（如果没有）
          const fullStatement = statement.endsWith(';') ? statement : statement + ';';
          await prisma.$executeRawUnsafe(fullStatement);
          console.log(`  ✓ 语句执行成功`);
        } catch (error: any) {
          // 如果表已存在，跳过错误
          if (error.message.includes('already exists')) {
            console.log(`  ⚠ 表已存在，跳过`);
          } else {
            throw error;
          }
        }
      }

      console.log(`✓ ${migration} 执行完成`);
    }

    console.log('\n所有迁移执行完成！');
    console.log('\n创建的表:');
    console.log('  - task_queue: 任务队列表');
    console.log('  - error_logs: 错误日志表');
    console.log('  - performance_metrics: 性能指标表');
    console.log('  - process_progress: 进度记录表（断点续传）');
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行迁移
runMigrations()
  .then(() => {
    console.log('\n迁移脚本执行成功！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('迁移脚本执行失败:', error);
    process.exit(1);
  });
