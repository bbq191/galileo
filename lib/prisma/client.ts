/**
 * Prisma Client 单例
 *
 * 与 DI 容器中的 PrismaClient 是同一个实例（见 lib/di/factories/prisma.factory.ts）。
 * 这里直接使用工厂而不是导入 lib/di/setup：后者在导入时会初始化全部服务（Redis、向量索引等），
 * 种子数据、建用户等命令行脚本只需要数据库，初始化 Redis 会导致脚本结束后进程无法退出。
 */

import { createPrismaClient } from '@/lib/di/factories/prisma.factory';

const prisma = createPrismaClient();

export default prisma;
