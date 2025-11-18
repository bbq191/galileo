/**
 * 为所有 API routes 添加显式运行时配置
 *
 * 运行: npx tsx scripts/add-runtime-config.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_DIR = path.join(__dirname, '..', 'app', 'api');
const RUNTIME_CONFIG = `/**
 * 显式声明 Node.js Runtime
 *
 * API Routes 运行在 Node.js Runtime 中，支持：
 * - Prisma ORM
 * - ioredis
 * - mysql2
 * - 其他 Node.js 专有 API
 */
export const runtime = 'nodejs';
`;

/**
 * 递归查找所有 route.ts 文件
 */
function findRouteFiles(dir: string): string[] {
  const files: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 检查文件是否已有 runtime 配置
 */
function hasRuntimeConfig(content: string): boolean {
  return content.includes('export const runtime');
}

/**
 * 在文件开头的注释后添加 runtime 配置
 */
function addRuntimeConfig(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');

  if (hasRuntimeConfig(content)) {
    console.log(`[跳过] ${filePath} - 已有 runtime 配置`);
    return false;
  }

  // 查找文件开头的注释块结束位置
  const lines = content.split('\n');
  let insertIndex = 0;

  // 跳过开头的注释块
  if (lines[0].startsWith('/**')) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('*/')) {
        insertIndex = i + 1;
        break;
      }
    }
  }

  // 跳过空行
  while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
    insertIndex++;
  }

  // 在 import 语句之前插入 runtime 配置
  const beforeImports = lines.slice(0, insertIndex);
  const afterImports = lines.slice(insertIndex);

  const newContent = [
    ...beforeImports,
    '',
    RUNTIME_CONFIG,
    ...afterImports,
  ].join('\n');

  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`[已更新] ${filePath}`);
  return true;
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始为 API routes 添加显式运行时配置...\n');

  const routeFiles = findRouteFiles(API_DIR);
  console.log(`找到 ${routeFiles.length} 个 API route 文件\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const filePath of routeFiles) {
    const relativePath = path.relative(process.cwd(), filePath);
    if (addRuntimeConfig(filePath)) {
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n✅ 完成！`);
  console.log(`   更新: ${updatedCount} 个文件`);
  console.log(`   跳过: ${skippedCount} 个文件`);
}

main();
