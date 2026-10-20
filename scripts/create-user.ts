/**
 * 创建用户 / 重置密码
 *
 * 用法：
 *   npm run user:create -- <username> [--role admin|user|guest] [--password <密码>] [--name <显示名>]
 *   npm run user:create -- <username> --reset [--password <密码>]
 *
 * 未指定 --password 时随机生成并打印一次。
 * --reset 会重置密码并递增 tokenVersion，使该用户所有已登录会话在 Access Token 过期后失效。
 */

import { randomBytes } from 'crypto';
import prisma from '@/lib/prisma/client';
import { hashPassword } from '@/lib/auth/password';

const ROLES = ['admin', 'user', 'guest'] as const;
type Role = (typeof ROLES)[number];
const MIN_PASSWORD_LENGTH = 12;

function parseArgs(argv: string[]) {
  const [username, ...rest] = argv;
  const options: { role: Role; password?: string; name?: string; reset: boolean } = {
    role: 'user',
    reset: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--reset') {
      options.reset = true;
    } else if (flag === '--role' || flag === '--password' || flag === '--name') {
      const value = rest[++i];
      if (!value) throw new Error(`${flag} 缺少参数值`);
      if (flag === '--role') {
        if (!ROLES.includes(value as Role)) throw new Error(`--role 只能是 ${ROLES.join(' / ')}`);
        options.role = value as Role;
      } else if (flag === '--password') {
        options.password = value;
      } else {
        options.name = value;
      }
    } else {
      throw new Error(`未知参数: ${flag}`);
    }
  }

  if (!username || username.startsWith('--')) {
    throw new Error('请指定用户名，例如：npm run user:create -- alice --role user');
  }
  if (options.password && options.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码长度不能少于 ${MIN_PASSWORD_LENGTH} 个字符`);
  }
  return { username, ...options };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const password = args.password || randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { username: args.username } });

  if (args.reset) {
    if (!existing) throw new Error(`用户 "${args.username}" 不存在`);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    console.log(`✓ 已重置用户 "${args.username}" 的密码`);
  } else {
    if (existing) throw new Error(`用户 "${args.username}" 已存在，如需重置密码请加 --reset`);
    await prisma.user.create({
      data: {
        username: args.username,
        passwordHash,
        role: args.role,
        displayName: args.name ?? null,
      },
    });
    console.log(`✓ 已创建用户 "${args.username}"（角色: ${args.role}）`);
  }

  if (!args.password) {
    console.log(`  初始密码: ${password}（仅显示这一次）`);
  }
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
