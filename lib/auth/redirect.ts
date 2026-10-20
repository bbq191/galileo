/**
 * 登录前后的重定向目标校验（前后端共用，无服务端依赖）
 */

/**
 * 只允许站内相对路径，防止开放重定向
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/';
  }
  // 避免登录后又跳回认证接口或登录页
  if (next.startsWith('/api/auth') || next.startsWith('/login')) {
    return '/';
  }
  return next;
}
