/**
 * Prisma 驱动适配器的连接配置
 *
 * Prisma 7 移除了 Rust 查询引擎，PrismaClient 通过 @prisma/adapter-mariadb（基于 mariadb 驱动）连接 MySQL / MariaDB。
 * 连接信息仍来自 DATABASE_URL；Prisma 6 专用的 URL 参数在这里转换为驱动的连接池配置，
 * 未设置时使用 DB_POOL_* 环境变量（lib/constants）。
 *
 * 支持的 URL 参数：
 * - connection_limit：连接数上限（默认 DB_POOL_MAX）
 * - connect_timeout：建立连接的超时，秒（默认 10）
 * - pool_timeout：从连接池获取连接的超时，秒（默认 DB_POOL_ACQUIRE_TIMEOUT）
 * - sslaccept：strict 校验服务端证书，accept_invalid_certs 不校验；未设置时不使用 SSL
 *
 * 其他参数（如 socket、sslcert）不再生效，需要时改为在本文件中显式配置。
 */

import type { PoolConfig } from 'mariadb';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { CONNECTION_POOL } from '@/lib/constants';

function positiveNumber(value: string | null): number | undefined {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function buildMariaDbPoolConfig(databaseUrl: string | undefined = process.env.DATABASE_URL): PoolConfig {
  if (!databaseUrl) {
    throw new Error('未设置 DATABASE_URL，无法连接元数据库');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL 格式不正确，应为 mysql://用户名:密码@主机:端口/库名');
  }
  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') {
    throw new Error(`DATABASE_URL 协议应为 mysql://，当前为 ${url.protocol}//`);
  }

  const params = url.searchParams;
  const sslaccept = params.get('sslaccept');
  const connectTimeout = positiveNumber(params.get('connect_timeout'));
  const poolTimeout = positiveNumber(params.get('pool_timeout'));

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: positiveNumber(params.get('connection_limit')) ?? CONNECTION_POOL.MAX,
    // 驱动默认 1 秒，网络稍慢就会失败
    connectTimeout: (connectTimeout ?? 10) * 1000,
    acquireTimeout: poolTimeout !== undefined ? poolTimeout * 1000 : CONNECTION_POOL.ACQUIRE_TIMEOUT,
    // DB_POOL_IDLE_TIMEOUT 单位为毫秒，驱动的 idleTimeout 单位为秒
    idleTimeout: Math.max(1, Math.round(CONNECTION_POOL.IDLE_TIMEOUT / 1000)),
    ...(sslaccept && { ssl: { rejectUnauthorized: sslaccept === 'strict' } }),
    // MySQL 8 默认的 caching_sha2_password 在未启用 SSL 时需要获取服务端公钥
    allowPublicKeyRetrieval: process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true',
  };
}

/**
 * 延迟创建的驱动适配器：首次连接时才读取 DATABASE_URL 并创建连接池
 *
 * next build 收集路由配置时会导入模块并创建 PrismaClient，构建环境可能没有数据库配置；
 * 与 Prisma 6 一致，配置错误在第一次查询时才报出。
 */
export function createLazyMariaDbAdapter() {
  let factory: PrismaMariaDb | undefined;
  return {
    provider: 'mysql' as const,
    adapterName: '@prisma/adapter-mariadb',
    connect: async () => {
      factory ??= new PrismaMariaDb(buildMariaDbPoolConfig());
      return factory.connect();
    },
  };
}
