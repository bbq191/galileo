/**
 * 数据库连接配置加密工具
 * 使用 AES-256 加密算法
 */

import CryptoJS from 'crypto-js';

/**
 * 加密密钥（从环境变量获取）
 * 生产环境必须设置此环境变量
 */
const getEncryptionKey = (): string => {
  const key = process.env.DATABASE_ENCRYPTION_KEY;
  if (!key) {
    // 开发环境使用默认密钥（生产环境必须更换）
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DATABASE_ENCRYPTION_KEY environment variable is required in production'
      );
    }
    console.warn(
      '⚠️  警告: 未设置 DATABASE_ENCRYPTION_KEY，使用默认密钥（仅供开发）'
    );
    return 'galileo-default-encryption-key-change-in-production';
  }
  return key;
};

/**
 * 加密密码
 *
 * 空密码（如本地开发库的无密码账号）原样保存为空字符串：解密结果为空字符串时
 * 无法区分「密码为空」与「密钥错误」，因此不对空密码加密。
 *
 * @param password 明文密码
 * @returns 加密后的密码
 */
export function encryptPassword(password: string): string {
  if (password === '') {
    return '';
  }
  try {
    const key = getEncryptionKey();
    const encrypted = CryptoJS.AES.encrypt(password, key).toString();
    return encrypted;
  } catch (error) {
    console.error('密码加密失败:', error);
    throw new Error('Failed to encrypt password');
  }
}

/**
 * 解密密码
 * @param encryptedPassword 加密后的密码
 * @returns 明文密码
 */
export function decryptPassword(encryptedPassword: string): string {
  if (encryptedPassword === '') {
    return '';
  }
  try {
    const key = getEncryptionKey();
    const decrypted = CryptoJS.AES.decrypt(encryptedPassword, key);
    const password = decrypted.toString(CryptoJS.enc.Utf8);

    if (!password) {
      throw new Error('Failed to decrypt password - invalid key or data');
    }

    return password;
  } catch (error) {
    console.error('密码解密失败:', error);
    throw new Error('Failed to decrypt password');
  }
}

/**
 * 验证加密密码是否有效
 * @param encryptedPassword 加密后的密码
 * @returns 是否有效
 */
export function validateEncryptedPassword(
  encryptedPassword: string
): boolean {
  try {
    decryptPassword(encryptedPassword);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生成随机加密密钥（用于初始化）
 * @param length 密钥长度（默认 32）
 * @returns 随机密钥
 */
export function generateEncryptionKey(length: number = 32): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let key = '';
  const randomValues = new Uint8Array(length);

  // 使用 crypto.getRandomValues 生成安全随机数
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomValues);
  } else if (typeof global !== 'undefined') {
    // Node.js 环境
    const crypto = require('crypto');
    crypto.randomFillSync(randomValues);
  }

  for (let i = 0; i < length; i++) {
    key += chars[randomValues[i] % chars.length];
  }

  return key;
}
