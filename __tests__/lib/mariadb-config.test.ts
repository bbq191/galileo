/**
 * Prisma 驱动适配器连接配置
 */
import { describe, it, expect } from '@jest/globals';
import { buildMariaDbPoolConfig } from '@/lib/prisma/mariadb-config';

describe('buildMariaDbPoolConfig', () => {
  it('解析 DATABASE_URL，用户名与密码按 URL 编码解码', () => {
    expect(buildMariaDbPoolConfig('mysql://galileo%40app:p%40ss%3Aw0rd@db.internal:3307/galileo_metadata')).toMatchObject({
      host: 'db.internal',
      port: 3307,
      user: 'galileo@app',
      password: 'p@ss:w0rd',
      database: 'galileo_metadata',
      connectTimeout: 10000,
      allowPublicKeyRetrieval: false,
    });
  });

  it('Prisma 6 的 URL 参数转换为驱动配置；未设置时使用 DB_POOL_* 默认值', () => {
    const config = buildMariaDbPoolConfig('mysql://u:p@h/db?connection_limit=5&connect_timeout=3&pool_timeout=20&sslaccept=accept_invalid_certs');
    expect(config).toMatchObject({ port: 3306, connectionLimit: 5, connectTimeout: 3000, acquireTimeout: 20000, ssl: { rejectUnauthorized: false } });

    const defaults = buildMariaDbPoolConfig('mysql://u:p@h/db');
    expect(defaults).toMatchObject({ connectionLimit: 10, acquireTimeout: 60000, idleTimeout: 30 });
    expect(defaults.ssl).toBeUndefined();
    expect(buildMariaDbPoolConfig('mysql://u:p@h/db?sslaccept=strict').ssl).toEqual({ rejectUnauthorized: true });
  });

  it('未设置、格式错误或协议不对时给出明确错误', () => {
    expect(() => buildMariaDbPoolConfig('')).toThrow('未设置 DATABASE_URL');
    expect(() => buildMariaDbPoolConfig('not a url')).toThrow('格式不正确');
    expect(() => buildMariaDbPoolConfig('postgresql://u:p@h/db')).toThrow('协议应为 mysql://');
  });
});

describe('createLazyMariaDbAdapter', () => {
  it('创建时不读取 DATABASE_URL（构建时可以没有数据库配置），连接时才报错', async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { createLazyMariaDbAdapter } = await import('@/lib/prisma/mariadb-config');
      const adapter = createLazyMariaDbAdapter();
      expect(adapter).toMatchObject({ provider: 'mysql', adapterName: '@prisma/adapter-mariadb' });
      await expect(adapter.connect()).rejects.toThrow('未设置 DATABASE_URL');
    } finally {
      process.env.DATABASE_URL = original;
    }
  });
});
