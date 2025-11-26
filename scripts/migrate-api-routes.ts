/**
 * API 路由批量迁移脚本
 *
 * 功能：
 * 1. 查找所有使用 DI 的 API 路由
 * 2. 替换独立的 runtime/dynamic 配置为共享配置
 * 3. 生成迁移报告
 *
 * @author xusy
 */

import fs from 'fs';
import path from 'path';

interface MigrationResult {
  file: string;
  status: 'migrated' | 'already-migrated' | 'skipped' | 'error';
  message?: string;
}

const results: MigrationResult[] = [];

/**
 * 检查文件是否已经使用共享配置
 */
function isAlreadyMigrated(content: string): boolean {
  return content.includes("from '@/lib/api/route-config'");
}

/**
 * 检查文件是否有独立的 runtime/dynamic 配置
 */
function hasIndividualConfig(content: string): boolean {
  return (
    content.includes('export const runtime') ||
    content.includes('export const dynamic')
  );
}

/**
 * 迁移单个文件
 */
function migrateFile(filePath: string): void {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // 检查是否已经迁移
    if (isAlreadyMigrated(content)) {
      results.push({
        file: filePath,
        status: 'already-migrated',
        message: '已使用共享配置',
      });
      return;
    }

    // 检查是否有独立配置
    if (!hasIndividualConfig(content)) {
      // 没有配置，直接添加共享配置
      // 在文件开头的注释后添加
      const lines = content.split('\n');
      let insertIndex = 0;

      // 跳过开头的注释块
      let inCommentBlock = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('/**')) {
          inCommentBlock = true;
        }

        if (inCommentBlock && line.endsWith('*/')) {
          inCommentBlock = false;
          insertIndex = i + 1;
          continue;
        }

        if (!inCommentBlock && line && !line.startsWith('//') && !line.startsWith('/*')) {
          insertIndex = i;
          break;
        }
      }

      // 插入共享配置
      lines.splice(insertIndex, 0, '', "export { runtime, dynamic } from '@/lib/api/route-config';", '');
      content = lines.join('\n');

      fs.writeFileSync(filePath, content, 'utf-8');
      results.push({
        file: filePath,
        status: 'migrated',
        message: '添加了共享配置',
      });
      return;
    }

    // 替换独立配置为共享配置
    let modified = false;

    // 移除 export const runtime 相关行（包括注释）
    const runtimePattern = /\/\*\*[\s\S]*?\*\/\s*export const runtime = ['"]nodejs['"];?\s*/g;
    if (runtimePattern.test(content)) {
      content = content.replace(runtimePattern, '');
      modified = true;
    } else {
      // 尝试简单模式
      const simpleRuntimePattern = /export const runtime = ['"]nodejs['"];?\s*/g;
      if (simpleRuntimePattern.test(content)) {
        content = content.replace(simpleRuntimePattern, '');
        modified = true;
      }
    }

    // 移除 export const dynamic 相关行（包括注释）
    const dynamicPattern = /\/\*\*[\s\S]*?\*\/\s*export const dynamic = ['"]force-dynamic['"];?\s*/g;
    if (dynamicPattern.test(content)) {
      content = content.replace(dynamicPattern, '');
      modified = true;
    } else {
      // 尝试简单模式
      const simpleDynamicPattern = /export const dynamic = ['"]force-dynamic['"];?\s*/g;
      if (simpleDynamicPattern.test(content)) {
        content = content.replace(simpleDynamicPattern, '');
        modified = true;
      }
    }

    if (!modified) {
      results.push({
        file: filePath,
        status: 'skipped',
        message: '未找到需要替换的配置',
      });
      return;
    }

    // 在文件开头添加共享配置导入
    // 找到第一个 import 语句的位置
    const importMatch = content.match(/^import /m);
    if (importMatch && importMatch.index !== undefined) {
      const beforeImport = content.substring(0, importMatch.index);
      const afterImport = content.substring(importMatch.index);
      content = beforeImport + "export { runtime, dynamic } from '@/lib/api/route-config';\n\n" + afterImport;
    } else {
      // 如果没有 import，在文件开头添加
      const lines = content.split('\n');
      let insertIndex = 0;

      // 跳过开头的注释块
      let inCommentBlock = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('/**')) {
          inCommentBlock = true;
        }

        if (inCommentBlock && line.endsWith('*/')) {
          inCommentBlock = false;
          insertIndex = i + 1;
          break;
        }
      }

      lines.splice(insertIndex, 0, '', "export { runtime, dynamic } from '@/lib/api/route-config';", '');
      content = lines.join('\n');
    }

    // 清理多余的空行
    content = content.replace(/\n{3,}/g, '\n\n');

    // 写入文件
    fs.writeFileSync(filePath, content, 'utf-8');

    results.push({
      file: filePath,
      status: 'migrated',
      message: '成功迁移到共享配置',
    });
  } catch (error) {
    results.push({
      file: filePath,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始批量迁移 API 路由...\n');

  // 需要迁移的文件列表
  const filesToMigrate = [
    'app/api/ai/cost/route.ts',
    'app/api/ai/diagnostic/route.ts',
    'app/api/ai/prompt-cache/route.ts',
    'app/api/audit/logs/route.ts',
    'app/api/audit/stats/route.ts',
    'app/api/cache/clear/route.ts',
    'app/api/cache/stats/route.ts',
    'app/api/datasources/[id]/route.ts',
    'app/api/datasources/[id]/sync/route.ts',
    'app/api/datasources/[id]/test/route.ts',
    'app/api/datasources/route.ts',
    'app/api/domains/[id]/keywords/route.ts',
    'app/api/domains/[id]/route.ts',
    'app/api/domains/discover/route.ts',
    'app/api/domains/route.ts',
    'app/api/health/route.ts',
    'app/api/metadata/columns/[id]/route.ts',
    'app/api/metadata/columns/route.ts',
    'app/api/metadata/databases/route.ts',
    'app/api/metadata/domains/[id]/route.ts',
    'app/api/metadata/domains/apply/route.ts',
    'app/api/metadata/domains/batch-infer/route.ts',
    'app/api/metadata/domains/infer/route.ts',
    'app/api/metadata/domains/metrics/route.ts',
    'app/api/metadata/domains/route.ts',
    'app/api/metadata/relationships/infer/route.ts',
    'app/api/metadata/search/route.ts',
    'app/api/metadata/tables/[id]/route.ts',
    'app/api/metadata/tables/route.ts',
    'app/api/performance/route.ts',
    'app/api/query/execute/route.ts',
    'app/api/query/history/[id]/route.ts',
    'app/api/query/history/route.ts',
    'app/api/query/preview/route.ts',
    'app/api/relationships/graph/route.ts',
    'app/api/relationships/verify/route.ts',
    'app/api/statistics/hotspots/route.ts',
    'app/api/statistics/overview/route.ts',
  ];

  // 迁移每个文件
  for (const file of filesToMigrate) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      migrateFile(fullPath);
    } else {
      results.push({
        file: file,
        status: 'error',
        message: '文件不存在',
      });
    }
  }

  // 生成报告
  console.log('\n📊 迁移报告：\n');

  const migrated = results.filter(r => r.status === 'migrated');
  const alreadyMigrated = results.filter(r => r.status === 'already-migrated');
  const skipped = results.filter(r => r.status === 'skipped');
  const errors = results.filter(r => r.status === 'error');

  console.log(`✅ 成功迁移: ${migrated.length} 个文件`);
  console.log(`ℹ️  已迁移: ${alreadyMigrated.length} 个文件`);
  console.log(`⏭️  跳过: ${skipped.length} 个文件`);
  console.log(`❌ 错误: ${errors.length} 个文件`);
  console.log(`📦 总计: ${results.length} 个文件\n`);

  if (migrated.length > 0) {
    console.log('✅ 已迁移的文件：');
    migrated.forEach(r => console.log(`   - ${r.file}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('❌ 错误文件：');
    errors.forEach(r => console.log(`   - ${r.file}: ${r.message}`));
    console.log('');
  }

  console.log('✨ 迁移完成！\n');
  console.log('下一步：');
  console.log('1. 运行 npx tsc --noEmit 验证 TypeScript');
  console.log('2. 运行 npm run lint 验证代码规范');
  console.log('3. 运行 npm run build 验证构建\n');
}

main();
