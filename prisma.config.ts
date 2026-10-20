/**
 * Prisma CLI 配置（Prisma 7 起连接 URL 不再写在 schema 中）
 *
 * - Prisma 7 不再自动加载 .env，这里显式加载，供 db push / migrate 等命令使用
 * - 使用 process.env 而不是 env()：prisma generate 不需要连接数据库，未设置 DATABASE_URL 时也能生成
 * - 应用运行时的连接由 lib/di/factories/prisma.factory.ts 中的驱动适配器建立，不读取这里的配置
 * - 种子数据通过 npm 脚本执行（npm run db:seed），不使用 migrations.seed
 */

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
