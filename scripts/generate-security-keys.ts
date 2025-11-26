/**
 * 安全密钥生成工具
 * @author xusy
 *
 * 用途：
 * - 生成强随机密钥用于 JWT、数据库加密等
 * - 生成 API 密钥
 * - 生成密码哈希
 *
 * 使用方法：
 * tsx scripts/generate-security-keys.ts
 */

import crypto from 'crypto';

/**
 * 生成随机密钥
 */
function generateRandomKey(bytes: number = 64): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * 生成 Base64 编码的密钥
 */
function generateBase64Key(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64');
}

/**
 * 生成 UUID
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 生成 API 密钥（可读性更好）
 */
function generateAPIKey(): string {
  const prefix = 'gal'; // galileo 缩写
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * 主函数
 */
function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  Galileo 安全密钥生成器');
  console.log('  @author xusy');
  console.log('='.repeat(70));
  console.log('');

  // 1. JWT 密钥
  console.log('📌 JWT 密钥（用于 JWT_SECRET）:');
  console.log('');
  const jwtSecret = generateRandomKey(64);
  console.log(`JWT_SECRET="${jwtSecret}"`);
  console.log('');
  console.log('强度: 128 字符 (512 位)');
  console.log('用途: 用于签名和验证 JWT Token');
  console.log('');
  console.log('-'.repeat(70));
  console.log('');

  // 2. 数据库加密密钥
  console.log('📌 数据库加密密钥（用于 DATABASE_ENCRYPTION_KEY）:');
  console.log('');
  const dbEncryptionKey = generateRandomKey(32);
  console.log(`DATABASE_ENCRYPTION_KEY="${dbEncryptionKey}"`);
  console.log('');
  console.log('强度: 64 字符 (256 位)');
  console.log('用途: 用于加密存储的外部数据源密码');
  console.log('');
  console.log('-'.repeat(70));
  console.log('');

  // 3. API 密钥
  console.log('📌 API 密钥（用于外部系统访问）:');
  console.log('');
  const apiKey1 = generateAPIKey();
  const apiKey2 = generateAPIKey();
  const apiKey3 = generateAPIKey();
  console.log('示例 API 密钥（可生成多个）:');
  console.log('');
  console.log(`API_KEY_1="${apiKey1}"`);
  console.log(`API_KEY_2="${apiKey2}"`);
  console.log(`API_KEY_3="${apiKey3}"`);
  console.log('');
  console.log('格式: gal_<时间戳>_<随机字符串>');
  console.log('用途: 用于外部系统通过 API 访问 Galileo');
  console.log('');
  console.log('-'.repeat(70));
  console.log('');

  // 4. Base64 密钥（备选）
  console.log('📌 Base64 密钥（备选方案）:');
  console.log('');
  const base64Key = generateBase64Key(32);
  console.log(`BASE64_KEY="${base64Key}"`);
  console.log('');
  console.log('用途: 某些系统可能需要 Base64 格式的密钥');
  console.log('');
  console.log('-'.repeat(70));
  console.log('');

  // 5. UUID（用于会话 ID 等）
  console.log('📌 UUID 示例（用于会话 ID、跟踪 ID 等）:');
  console.log('');
  console.log(`UUID_1="${generateUUID()}"`);
  console.log(`UUID_2="${generateUUID()}"`);
  console.log(`UUID_3="${generateUUID()}"`);
  console.log('');
  console.log('='.repeat(70));
  console.log('');

  // 安全提示
  console.log('⚠️  安全提示:');
  console.log('');
  console.log('1. 将生成的密钥复制到 .env 文件中');
  console.log('2. 不要将 .env 文件提交到版本控制系统');
  console.log('3. 生产环境必须使用不同的密钥');
  console.log('4. 定期更换密钥（建议每 3-6 个月）');
  console.log('5. 妥善保管密钥，不要通过不安全的渠道传输');
  console.log('6. 如果密钥泄露，立即更换并撤销所有使用该密钥的 Token');
  console.log('');
  console.log('='.repeat(70));
  console.log('');
}

// 执行主函数
main();
