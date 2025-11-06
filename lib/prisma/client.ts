/**
 * Prisma Client Singleton
 * 通过依赖注入容器管理
 *
 * 此文件保留用于向后兼容，但现在使用 DI 容器
 */

import { getPrismaClient } from '@/lib/di/setup';

/**
 * 导出 PrismaClient 实例（向后兼容）
 * 现在通过 DI 容器管理
 */
const prisma = getPrismaClient();

export default prisma;
