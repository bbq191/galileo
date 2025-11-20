/**
 * OpenAPI 规范 API 端点
 *
 * 提供 OpenAPI 3.1 规范的 JSON 格式
 * 用于 Swagger UI 和其他 API 文档工具
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

/**
 * 获取 OpenAPI 规范
 */
export async function GET() {
  try {
    // 读取 OpenAPI YAML 文件
    const openapiPath = join(process.cwd(), 'docs', 'openapi.yaml');
    const yamlContent = readFileSync(openapiPath, 'utf-8');

    // 解析 YAML 为 JSON
    const spec = parse(yamlContent);

    // 返回 JSON 格式的规范
    return NextResponse.json(spec, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[OpenAPI] Failed to load spec:', error);

    return NextResponse.json(
      {
        error: '无法加载 OpenAPI 规范',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
