#!/usr/bin/env tsx

/**
 * 清除 Redis 缓存
 */

import { getRedisClient, closeRedisClient } from '../lib/cache/redis-client';

async function clearCache() {
  try {
    console.log('连接到 Redis...');

    const redisClient = getRedisClient();

    // FLUSHDB 清除当前数据库的所有键
    await redisClient.flushdb();

    console.log('✓ Redis 缓存已清除');

    // 关闭连接
    await closeRedisClient();
    console.log('✓ 连接已关闭');

    process.exit(0);
  } catch (error) {
    console.error('清除缓存失败:', error);
    process.exit(1);
  }
}

clearCache();
