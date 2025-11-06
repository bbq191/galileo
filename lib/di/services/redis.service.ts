/**
 * Redis 客户端服务
 * DI 版本的 Redis 客户端管理
 */

import { injectable } from 'tsyringe';
import type { Redis } from 'ioredis';

/**
 * Redis 服务接口
 */
export interface IRedisService {
  /**
   * 获取 Redis 客户端实例
   */
  getClient(): Redis;

  /**
   * 关闭 Redis 连接
   */
  close(): Promise<void>;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Redis 服务实现
 * 管理 Redis 客户端生命周期
 */
@injectable()
export class RedisService implements IRedisService {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  /**
   * 获取 Redis 客户端实例
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * 关闭 Redis 连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      console.log('[RedisService] Redis 连接已关闭');
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('[RedisService] 健康检查失败:', error);
      return false;
    }
  }
}
