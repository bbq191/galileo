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

    // 集成到审计日志系统
    // 将速率限制违规记录为特殊的查询审计日志
    await prisma.queryAuditLog.create({
      data: {
        userId: data.identifier.startsWith('user:') ? data.identifier.slice(5) : 'anonymous',
        userName: data.identifier.startsWith('user:') ? data.identifier.slice(5) : 'Anonymous',
        sessionId: `rate-limit-${Date.now()}`,
        naturalLanguageQuery: `[RATE_LIMIT_VIOLATION] ${data.endpoint}`,
        intent: JSON.stringify({
          type: 'RATE_LIMIT_VIOLATION',
          limiterType: data.limiterType,
          endpoint: data.endpoint,
        }),
        generatedSql: '',
        executionSuccess: false,
        executionError: `Rate limit exceeded for ${data.limiterType}`,
        rowCount: null,
        usedDatabases: JSON.stringify([]),
        usedTables: JSON.stringify([]),
        intentRecognitionTime: 0,
        sqlGenerationTime: 0,
        validationTime: 0,
        executionTime: 0,
        totalTime: 0,
        ipAddress: data.ip,
        userAgent: data.userAgent,
        timestamp: new Date(),
      },
    }).catch(err => {
      // 如果数据库记录失败，不影响速率限制的执行
      console.error('[Rate Limit Logger] 数据库记录失败:', err);
    });

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

    // 集成告警系统
    await triggerAbuseAlert({
      ip: data.ip,
      violationCount: count,
      endpoint: data.endpoint,
      limiterType: data.limiterType,
      userAgent: data.userAgent,
    });
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
  try {
    // 从审计日志中查询速率限制违规记录
    const violations = await prisma.queryAuditLog.findMany({
      where: {
        naturalLanguageQuery: {
          startsWith: '[RATE_LIMIT_VIOLATION]',
        },
      },
      select: {
        ipAddress: true,
        intent: true,
      },
    });

    // 统计总违规数
    const totalViolations = violations.length;

    // 按端点统计
    const byEndpoint: Record<string, number> = {};
    // 按 IP 统计
    const byIp: Record<string, number> = {};

    violations.forEach((v) => {
      // 统计 IP
      if (v.ipAddress) {
        byIp[v.ipAddress] = (byIp[v.ipAddress] || 0) + 1;
      }

      // 统计端点
      try {
        const intent = JSON.parse(v.intent as string);
        if (intent.endpoint) {
          byEndpoint[intent.endpoint] = (byEndpoint[intent.endpoint] || 0) + 1;
        }
      } catch {
        // 忽略 JSON 解析错误
      }
    });

    return {
      totalViolations,
      byEndpoint,
      byIp,
    };
  } catch (error) {
    console.error('[Rate Limit Stats] 查询统计失败:', error);
    return {
      totalViolations: 0,
      byEndpoint: {},
      byIp: {},
    };
  }
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

    // 从审计日志中删除旧的速率限制违规记录
    const result = await prisma.queryAuditLog.deleteMany({
      where: {
        AND: [
          {
            naturalLanguageQuery: {
              startsWith: '[RATE_LIMIT_VIOLATION]',
            },
          },
          {
            timestamp: {
              lt: cutoffDate,
            },
          },
        ],
      },
    });

    console.log(
      `[Rate Limit Cleanup] 已清理 ${result.count} 条超过 ${daysToKeep} 天的速率限制违规记录`
    );
  } catch (error) {
    console.error('[Rate Limit Cleanup] 清理失败:', error);
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
  try {
    // 查询指定时间范围内的速率限制违规记录
    const violations = await prisma.queryAuditLog.findMany({
      where: {
        AND: [
          {
            naturalLanguageQuery: {
              startsWith: '[RATE_LIMIT_VIOLATION]',
            },
          },
          {
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
      select: {
        ipAddress: true,
        intent: true,
        timestamp: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    const totalViolations = violations.length;

    // 统计 Top 10 违规 IP
    const ipCounts: Record<string, number> = {};
    const endpointCounts: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    violations.forEach((v) => {
      // 统计 IP
      if (v.ipAddress) {
        ipCounts[v.ipAddress] = (ipCounts[v.ipAddress] || 0) + 1;
      }

      // 统计端点
      try {
        const intent = JSON.parse(v.intent as string);
        if (intent.endpoint) {
          endpointCounts[intent.endpoint] = (endpointCounts[intent.endpoint] || 0) + 1;
        }
      } catch {
        // 忽略 JSON 解析错误
      }

      // 统计按天的违规数
      const dateKey = v.timestamp.toISOString().split('T')[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
    });

    // 生成 Top Offenders（按违规次数排序，取前 10）
    const topOffenders = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 生成 Top Endpoints（按违规次数排序，取前 10）
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 生成时间线数据
    const timeline = Object.entries(dailyCounts)
      .map(([date, count]) => ({
        date: new Date(date),
        count,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      period: { start: startDate, end: endDate },
      totalViolations,
      topOffenders,
      topEndpoints,
      timeline,
    };
  } catch (error) {
    console.error('[Rate Limit Report] 报告生成失败:', error);
    return {
      period: { start: startDate, end: endDate },
      totalViolations: 0,
      topOffenders: [],
      topEndpoints: [],
      timeline: [],
    };
  }
}

/**
 * 触发滥用告警
 *
 * 当检测到潜在的滥用行为时，触发告警通知
 */
async function triggerAbuseAlert(data: {
  ip: string;
  violationCount: number;
  endpoint: string;
  limiterType: string;
  userAgent: string;
}): Promise<void> {
  try {
    // 记录到控制台（开发和调试）
    console.error(
      `[ABUSE ALERT] 检测到潜在滥用行为`,
      `\n  IP: ${data.ip}`,
      `\n  5分钟内违规次数: ${data.violationCount}`,
      `\n  端点: ${data.endpoint}`,
      `\n  限制器类型: ${data.limiterType}`,
      `\n  User Agent: ${data.userAgent}`
    );

    // 集成告警系统（生产环境）
    if (process.env.NODE_ENV === 'production') {
      // 1. 发送 Slack 通知（如果配置了 Slack Webhook）
      const slackWebhook = process.env.SLACK_WEBHOOK_URL;
      if (slackWebhook) {
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 速率限制滥用告警`,
            attachments: [
              {
                color: 'danger',
                fields: [
                  { title: 'IP 地址', value: data.ip, short: true },
                  { title: '违规次数', value: String(data.violationCount), short: true },
                  { title: '端点', value: data.endpoint, short: false },
                  { title: '限制器类型', value: data.limiterType, short: true },
                ],
              },
            ],
          }),
        }).catch(err => console.error('[Abuse Alert] Slack 通知失败:', err));
      }

      // 2. 发送邮件通知（如果配置了邮件服务）
      const emailRecipient = process.env.SECURITY_EMAIL;
      if (emailRecipient) {
        // 这里可以集成邮件服务（如 SendGrid, Mailgun 等）
        console.log(`[Abuse Alert] 应向 ${emailRecipient} 发送邮件通知`);
      }

      // 3. 记录到数据库（用于持久化分析）
      await prisma.queryAuditLog.create({
        data: {
          userId: 'system',
          userName: 'System Alert',
          sessionId: `abuse-alert-${Date.now()}`,
          naturalLanguageQuery: `[ABUSE_ALERT] IP ${data.ip} exceeded ${data.violationCount} violations in 5 minutes`,
          intent: JSON.stringify({
            type: 'ABUSE_ALERT',
            ip: data.ip,
            violationCount: data.violationCount,
            endpoint: data.endpoint,
            limiterType: data.limiterType,
          }),
          generatedSql: '',
          executionSuccess: false,
          executionError: `Potential abuse detected from ${data.ip}`,
          rowCount: null,
          usedDatabases: JSON.stringify([]),
          usedTables: JSON.stringify([]),
          intentRecognitionTime: 0,
          sqlGenerationTime: 0,
          validationTime: 0,
          executionTime: 0,
          totalTime: 0,
          ipAddress: data.ip,
          userAgent: data.userAgent,
          timestamp: new Date(),
        },
      }).catch(err => {
        console.error('[Abuse Alert] 数据库记录失败:', err);
      });
    }
  } catch (error) {
    console.error('[Abuse Alert] 告警触发失败:', error);
  }
}

// 全局类型声明（用于 TypeScript）
declare global {
  var rateLimitViolations: Map<string, number> | undefined;
}
