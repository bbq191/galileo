/**
 * API 路由优化脚本 - 消除 Next.js 警告
 *
 * 功能：
 * 1. 将 export { runtime, dynamic } 改为独立声明
 * 2. runtime 独立声明为字符串字面量
 * 3. dynamic 继续使用共享配置
 *
 * @author xusy
 */

import fs from 'fs';
import path from 'path';

interface OptimizeResult {
  file: string;
  status: 'optimized' | 'skipped' | 'error';
  message?: string;
}

const results: OptimizeResult[] = [];

/**
 * 优化单个文件
 */
function optimizeFile(filePath: string): void {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // 检查是否使用了共享配置的 runtime 和 dynamic
    const sharedConfigPattern = /export\s*{\s*runtime\s*,\s*dynamic\s*}\s*from\s*['"]@\/lib\/api\/route-config['"]\s*;?/;

    if (!sharedConfigPattern.test(content)) {
      // 检查是否只导出了 dynamic
      const dynamicOnlyPattern = /export\s*{\s*dynamic\s*}\s*from\s*['"]@\/lib\/api\/route-config['"]\s*;?/;
      if (dynamicOnlyPattern.test(content)) {
        results.push({
          file: filePath,
          status: 'skipped',
          message: '已经是优化后的格式',
        });
        return;
      }

      results.push({
        file: filePath,
        status: 'skipped',
        message: '未使用共享配置',
      });
      return;
    }

    // 替换共享配置为独立声明 + 部分共享
    content = content.replace(
      sharedConfigPattern,
      "export const runtime = 'nodejs';\nexport { dynamic } from '@/lib/api/route-config';"
    );

    // 写入文件
    fs.writeFileSync(filePath, content, 'utf-8');

    results.push({
      file: filePath,
      status: 'optimized',
      message: '成功优化',
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
  console.log('🔧 开始优化 API 路由，消除 Next.js 警告...\n');

  // 需要优化的文件列表
  const filesToOptimize = [
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

  // 优化每个文件
  for (const file of filesToOptimize) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      optimizeFile(fullPath);
    } else {
      results.push({
        file: file,
        status: 'error',
        message: '文件不存在',
      });
    }
  }

  // 生成报告
  console.log('\n📊 优化报告：\n');

  const optimized = results.filter(r => r.status === 'optimized');
  const skipped = results.filter(r => r.status === 'skipped');
  const errors = results.filter(r => r.status === 'error');

  console.log(`✅ 成功优化: ${optimized.length} 个文件`);
  console.log(`⏭️  跳过: ${skipped.length} 个文件`);
  console.log(`❌ 错误: ${errors.length} 个文件`);
  console.log(`📦 总计: ${results.length} 个文件\n`);

  if (optimized.length > 0) {
    console.log('✅ 已优化的文件：');
    optimized.forEach(r => console.log(`   - ${r.file}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('❌ 错误文件：');
    errors.forEach(r => console.log(`   - ${r.file}: ${r.message}`));
    console.log('');
  }

  console.log('✨ 优化完成！\n');
  console.log('下一步：');
  console.log('1. 运行 npx tsc --noEmit 验证 TypeScript');
  console.log('2. 运行 npm run build 验证构建（应该无警告）\n');
}

main();
