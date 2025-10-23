/**
 * 验证工具函数
 *
 * 提供常用的数据验证功能
 */

/**
 * 验证是否为有效的数据库连接配置
 */
export function isValidDatabaseConfig(config: any): boolean {
  const requiredFields = ['name', 'type', 'host', 'port', 'username'];

  for (const field of requiredFields) {
    if (!config[field]) {
      return false;
    }
  }

  // 验证端口号
  if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
    return false;
  }

  // 验证数据库类型
  const validTypes = ['mysql', 'mariadb', 'postgresql'];
  if (!validTypes.includes(config.type)) {
    return false;
  }

  return true;
}

/**
 * 验证是否为有效的 Email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证是否为有效的 URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证是否为有效的 IP 地址
 */
export function isValidIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  return ipv6Regex.test(ip);
}

/**
 * 验证是否为有效的端口号
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 验证对象是否包含所需字段
 */
export function hasRequiredFields<T extends object>(
  obj: T,
  fields: (keyof T)[]
): boolean {
  return fields.every(field => field in obj && obj[field] !== undefined);
}

/**
 * 验证字符串长度
 */
export function isValidLength(
  str: string,
  min: number,
  max: number
): boolean {
  const length = str.length;
  return length >= min && length <= max;
}

/**
 * 验证是否为有效的 JSON
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证置信度分数（0-1 之间）
 */
export function isValidConfidence(score: number): boolean {
  return typeof score === 'number' && score >= 0 && score <= 1;
}

/**
 * 验证分页参数
 */
export function isValidPagination(page: number, limit: number): boolean {
  return (
    Number.isInteger(page) &&
    page >= 1 &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 100
  );
}
