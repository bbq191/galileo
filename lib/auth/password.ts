/**
 * 密码哈希（仅 Node.js）
 *
 * 使用 Node 内置的 scrypt，无需额外依赖。
 * 存储格式：scrypt$N$r$p$<salt base64>$<hash base64>，参数随哈希保存，便于日后调整强度。
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 };

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const { N, r, p } = DEFAULT_PARAMS;
  const hash = await scrypt(password, salt, KEY_LENGTH, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * 用户不存在时也执行一次等价的哈希比对，避免通过响应耗时枚举用户名
 */
let dummyHash: Promise<string> | undefined;
export async function verifyPasswordAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
  return false;
}
