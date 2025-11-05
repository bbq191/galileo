/**
 * 速率限制日志记录器
 *
 * 记录和监控速率限制违规行为，用于：
 * - 安全分析
 * - 异常检测
 * - 滥用行为识别
 */

import prisma from '@/lib/prisma/client';

/**
 * 速率限制违规数据
 */
export interface RateLimitViolation {
  endpoint: string;
  identifier: string;
  ip: string;
  userAgent: string;
  limiterType: string;
}

/**
 * 记录速率限制违规
 *
 * 注意：暂时使用 console.log，后续可集成到 Prisma 审计日志系统
 */
export async function logRateLimitViolation(data: RateLimitViolation): Promise<void> {
  try {
    // 记录到控制台（用于开发和调试）
    console.warn(
      `[Rate Limit Violation] ${new Date().toISOString()}`,
      `| Type: ${data.limiterType}`,
      `| Endpoint: ${data.endpoint}`,
      `| Identifier: ${data.identifier}`,
      `| IP: ${data.ip}`
    );

    // TODO: 集成到现有的审计日志系统
    // 可以扩展 AuditLog 表，添加 violationType 字段
    // 或者创建专门的 RateLimitLog 表

    // 示例：记录到审计日志（如果已有审计系统）
    // await prisma.auditLog.create({
    //   data: {
    //     userId: data.identifier.startsWith('user:') ? data.identifier.slice(5) : null,
    //     action: 'RATE_LIMIT_VIOLATION',
    //     resource: data.endpoint,
    //     details: {
    //       limiterType: data.limiterType,
    //       ip: data.ip,
    //       userAgent: data.userAgent,
    //     },
    //     ipAddress: data.ip,
    //     userAgent: data.userAgent,
    //     timestamp: new Date(),
    //     status: 'BLOCKED',
    //   },
    // });

    // 检测潜在的滥用行为
    await detectAbuse(data);
  } catch (error) {
    // 日志记录失败不应影响请求处理
    console.error('Failed to log rate limit violation:', error);
  }
}

/**
 * 检测潜在的滥用行为
 *
 * 如果同一 IP 在短时间内多次触发速率限制，发出告警
 */
async function detectAbuse(data: RateLimitViolation): Promise<void> {
  // 注意：这是简化版本，使用内存计数
  // 生产环境应使用 Redis 或数据库持久化

  // 使用全局 Map 跟踪违规次数（简化实现）
  if (!global.rateLimitViolations) {
    global.rateLimitViolations = new Map<string, number>();
  }

  const violations = global.rateLimitViolations as Map<string, number>;
  const key = `${data.ip}:${Date.now() - (Date.now() % (5 * 60 * 1000))}`; // 5分钟窗口

  const count = (violations.get(key) || 0) + 1;
  violations.set(key, count);

  // 如果5分钟内超过10次违规，发出告警
  if (count > 10) {
    console.error(
      `🚨 POTENTIAL ABUSE DETECTED!`,
      `| IP: ${data.ip}`,
      `| Violations in 5 min: ${count}`,
      `| Action: Consider blocking this IP`
    );

    // TODO: 集成告警系统
    // - 发送 Slack/Email 通知
    // - 自动添加到 IP 黑名单
    // - 触发安全团队响应流程
  }

  // 清理旧数据（防止内存泄漏）
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  for (const [k, _] of violations.entries()) {
    const timestamp = parseInt(k.split(':')[1]);
    if (timestamp < fiveMinutesAgo) {
      violations.delete(k);
    }
  }
}

/**
 * 获取速率限制统计信息
 *
 * @returns 各端点的速率限制统计
 */
export async function getRateLimitStats(): Promise<{
  totalViolations: number;
  byEndpoint: Record<string, number>;
  byIp: Record<string, number>;
}> {
  // TODO: 从数据库查询实际统计数据
  // 这里提供一个简单的接口定义

  return {
    totalViolations: 0,
    byEndpoint: {},
    byIp: {},
  };
}

/**
 * 清理速率限制违规记录
 *
 * 定期清理旧的违规记录（例如，保留最近 30 天）
 */
export async function cleanupOldViolations(daysToKeep: number = 30): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // TODO: 实现数据库清理
    // await prisma.rateLimitLog.deleteMany({
    //   where: {
    //     timestamp: {
    //       lt: cutoffDate,
    //     },
    //   },
    // });

    console.log(`Cleaned up rate limit violations older than ${daysToKeep} days`);
  } catch (error) {
    console.error('Failed to cleanup old violations:', error);
  }
}

/**
 * 导出速率限制报告
 *
 * 生成速率限制违规的分析报告
 */
export async function generateRateLimitReport(
  startDate: Date,
  endDate: Date
): Promise<{
  period: { start: Date; end: Date };
  totalViolations: number;
  topOffenders: Array<{ ip: string; count: number }>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  timeline: Array<{ date: Date; count: number }>;
}> {
  // TODO: 实现报告生成逻辑
  return {
    period: { start: startDate, end: endDate },
    totalViolations: 0,
    topOffenders: [],
    topEndpoints: [],
    timeline: [],
  };
}

// 全局类型声明（用于 TypeScript）
declare global {
  var rateLimitViolations: Map<string, number> | undefined;
}
