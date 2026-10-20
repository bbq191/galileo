import { describe, it, expect } from '@jest/globals';
import { hashPassword, verifyPassword, verifyPasswordAgainstDummy } from '@/lib/auth/password';

describe('password', () => {
  it('哈希后可以校验通过，错误密码校验失败', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('相同密码每次哈希结果不同（随机盐）', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });

  it('格式不正确的哈希直接校验失败', async () => {
    await expect(verifyPassword('x', 'plaintext')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
  });

  it('dummy 校验恒为 false', async () => {
    await expect(verifyPasswordAgainstDummy('anything')).resolves.toBe(false);
  });
});
