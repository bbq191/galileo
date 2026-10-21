/**
 * Redis 可用性判断
 *
 * Redis 未启动或正在重连时，ioredis 会把命令放进离线队列，等重连若干次后才报错，
 * 每条命令被拖慢数百毫秒到数秒。缓存读写与防击穿锁在 Redis 不可用时应直接降级，
 * 先用本函数判断，而不是发出命令再等待失败。
 *
 * 缓存失效同样跳过：Redis 不可用时删除命令也会在重试后失败，调用方记录告警（Redis 恢复后旧缓存保留到过期）。
 */

import type Redis from 'ioredis';

type RedisLike = Pick<Redis, 'status' | 'connect'>;

/**
 * 是否已连接且可立即使用；lazyConnect 且尚未连接的客户端在首次检查时触发后台连接
 */
export function isRedisReady(redis: RedisLike | null | undefined): boolean {
  if (!redis) return false;
  if (redis.status === 'ready') return true;
  if (redis.status === 'wait') {
    redis.connect().catch(() => undefined);
  }
  return false;
}
