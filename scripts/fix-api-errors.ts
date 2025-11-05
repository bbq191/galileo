/**
 * 自动修复 API 路由中的错误信息泄露
 *
 * 此脚本会批量修复所有 API 路由文件中的不安全错误处理
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// 需要修复的模式
const PATTERNS_TO_FIX = [
  // 模式 1: 直接返回 error.stack
  {
    search: /error instanceof Error \? error\.stack : String\(error\)/g,
    replace: 'error instanceof Error ? error.message : String(error)',
    description: '移除堆栈跟踪泄露',
  },
  // 模式 2: 直接返回 error.message（在 catch 块中）
  {
    search: /error: error instanceof Error \? error\.message : ['"]Unknown error['"]/g,
    replace: "error: 'Internal server error'",
    description: '替换为通用错误消息',
  },
  // 模式 3: 在开发环境暴露堆栈
  {
    search: /process\.env\.NODE_ENV === ['"]development['"] && \{[\s\S]*?stack: error\.stack/g,
    replace: '/* Stack trace removed for security */',
    description: '移除开发环境堆栈泄露',
  },
];

// 需要修复的文件模式
const FILE_PATTERNS = [
  'app/api/**/*.ts',
  '!app/api/**/route.spec.ts',
  '!app/api/**/test/**',
];

async function main() {
  console.log('🔍 查找需要修复的 API 路由文件...\n');

  const files = await glob(FILE_PATTERNS, {
    cwd: process.cwd(),
    absolute: true,
  });

  console.log(`📁 找到 ${files.length} 个文件\n`);

  let fixedCount = 0;
  const fixedFiles: string[] = [];

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    let modified = false;
    const fixes: string[] = [];

    // 检查是否需要添加导入
    const needsImport = !content.includes('safeErrorResponse') &&
                         !content.includes('safeServerErrorResponse');

    // 应用所有修复模式
    for (const pattern of PATTERNS_TO_FIX) {
      if (pattern.search.test(content)) {
        content = content.replace(pattern.search, pattern.replace);
        fixes.push(pattern.description);
        modified = true;
      }
    }

    // 如果文件被修改且需要导入，添加导入语句
    if (modified && needsImport) {
      const importStatement = `import { safeErrorResponse, safeServerErrorResponse } from '@/lib/api/response';\nimport { ErrorCategory } from '@/lib/security/error-sanitizer';\n`;

      // 在第一个 import 语句后添加
      const importMatch = content.match(/import .+ from .+;/);
      if (importMatch) {
        const lastImportIndex = content.lastIndexOf(importMatch[0]) + importMatch[0].length;
        content = content.slice(0, lastImportIndex) + '\n' + importStatement + content.slice(lastImportIndex);
      }
    }

    // 保存修改
    if (modified) {
      fs.writeFileSync(file, content, 'utf-8');
      fixedCount++;
      fixedFiles.push(path.relative(process.cwd(), file));
      console.log(`✅ ${path.relative(process.cwd(), file)}`);
      fixes.forEach(fix => console.log(`   - ${fix}`));
      console.log();
    }
  }

  console.log(`\n✨ 完成！共修复 ${fixedCount} 个文件\n`);

  if (fixedFiles.length > 0) {
    console.log('已修复的文件:');
    fixedFiles.forEach(file => console.log(`  - ${file}`));
  }

  console.log('\n⚠️  注意: 此脚本进行了基础修复，建议手动审查以下内容:');
  console.log('  1. 检查所有 catch 块是否使用了安全的错误处理');
  console.log('  2. 确保错误响应不包含敏感信息');
  console.log('  3. 验证导入语句是否正确');
  console.log('  4. 运行测试确保功能正常');
}

main().catch(console.error);
