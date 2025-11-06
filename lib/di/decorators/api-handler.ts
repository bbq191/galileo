/**
 * API 路由处理器装饰器
 * 简化 Next.js API 路由中的依赖注入
 */

import 'reflect-metadata';
import { NextApiRequest, NextApiResponse } from 'next';
import { getContainer } from '../container';
import { DI_TOKENS } from '../tokens';

/**
 * API 处理器类型
 */
export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

/**
 * 带依赖注入的 API 处理器工厂
 *
 * @example
 * ```typescript
 * export default withDI(async (req, res, { prisma, cache }) => {
 *   const data = await prisma.user.findMany();
 *   res.json(data);
 * });
 * ```
 */
export function withDI(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    services: {
      prisma: any;
      [key: string]: any;
    }
  ) => Promise<void>
): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // 获取 DI 容器
      const container = getContainer();

      // 从容器中解析服务
      const prisma = container.resolve(DI_TOKENS.PrismaClient);

      // 调用处理器
      await handler(req, res, { prisma });
    } catch (error) {
      console.error('[API Handler] Error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

/**
 * 创建带依赖注入的类方法装饰器
 */
export function InjectServices() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (req: NextApiRequest, res: NextApiResponse) {
      try {
        const container = getContainer();
        const prisma = container.resolve(DI_TOKENS.PrismaClient);
        return await originalMethod.call(this, req, res, { prisma });
      } catch (error) {
        console.error(`[${propertyKey}] Error:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}
