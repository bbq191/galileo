/**
 * 数据加密/解密工具
 *
 * 功能：
 * - 密码加密和解密
 * - 使用 AES-256-GCM 算法
 * - 支持密钥轮换
 */

import crypto from 'crypto';

/**
 * 加密配置
 */
export interface EncryptionConfig {
  /** 加密算法 */
  algorithm?: string;
  /** 加密密钥（32字节，用于 AES-256） */
  key?: string;
  /** 编码格式 */
  encoding?: BufferEncoding;
}

/**
 * 加密结果
 */
export interface EncryptedData {
  /** 加密后的数据 */
  encrypted: string;
  /** 初始化向量 (IV) */
  iv: string;
  /** 认证标签 (Auth Tag) */
  authTag: string;
}

/**
 * 加密管理器类
 */
export class EncryptionManager {
  private algorithm: string;
  private key: Buffer;
  private encoding: BufferEncoding;

  constructor(config: EncryptionConfig = {}) {
    this.algorithm = config.algorithm || 'aes-256-gcm';
    this.encoding = config.encoding || 'hex';

    // 获取密钥（优先使用配置，其次环境变量，最后生成默认密钥）
    const keyString = config.key || process.env.ENCRYPTION_KEY || this.generateDefaultKey();

    // 确保密钥长度正确（AES-256 需要 32 字节）
    this.key = this.normalizeKey(keyString);
  }

  /**
   * 加密数据
   */
  encrypt(plaintext: string): EncryptedData {
    try {
      // 生成随机 IV（初始化向量）
      const iv = crypto.randomBytes(16);

      // 创建加密器
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // 加密数据
      let encrypted = cipher.update(plaintext, 'utf8', this.encoding);
      encrypted += cipher.final(this.encoding);

      // 获取认证标签（GCM 模式）
      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString(this.encoding),
        authTag: authTag.toString(this.encoding),
      };
    } catch (error) {
      throw new Error(`加密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解密数据
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      // 解析 IV 和 authTag
      const iv = Buffer.from(encryptedData.iv, this.encoding);
      const authTag = Buffer.from(encryptedData.authTag, this.encoding);

      // 创建解密器
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      // 解密数据
      let decrypted = decipher.update(encryptedData.encrypted, this.encoding, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`解密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 加密字符串（简化接口）
   *
   * 返回格式: <encrypted>:<iv>:<authTag>
   */
  encryptString(plaintext: string): string {
    const encrypted = this.encrypt(plaintext);
    return `${encrypted.encrypted}:${encrypted.iv}:${encrypted.authTag}`;
  }

  /**
   * 解密字符串（简化接口）
   */
  decryptString(encryptedString: string): string {
    const parts = encryptedString.split(':');

    if (parts.length !== 3) {
      throw new Error('加密字符串格式无效');
    }

    const encryptedData: EncryptedData = {
      encrypted: parts[0],
      iv: parts[1],
      authTag: parts[2],
    };

    return this.decrypt(encryptedData);
  }

  /**
   * 规范化密钥（确保32字节）
   */
  private normalizeKey(keyString: string): Buffer {
    // 使用 SHA-256 哈希确保密钥长度为 32 字节
    return crypto.createHash('sha256').update(keyString).digest();
  }

  /**
   * 生成默认密钥
   *
   * 注意：生产环境应该使用环境变量配置密钥！
   */
  private generateDefaultKey(): string {
    console.warn(
      '⚠️ 警告: 正在使用默认加密密钥！生产环境请设置环境变量 ENCRYPTION_KEY'
    );
    return 'galileo-default-encryption-key-please-change-in-production';
  }

  /**
   * 验证加密密钥是否有效
   */
  static validateKey(key: string): boolean {
    return key.length >= 16; // 最少 16 字符
  }

  /**
   * 生成随机密钥
   */
  static generateKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

/**
 * 默认加密管理器实例
 */
let defaultEncryptionManager: EncryptionManager | null = null;

/**
 * 获取默认加密管理器
 */
export function getEncryptionManager(): EncryptionManager {
  if (!defaultEncryptionManager) {
    defaultEncryptionManager = new EncryptionManager();
  }
  return defaultEncryptionManager;
}

/**
 * 便捷加密函数
 */
export function encryptPassword(password: string): string {
  return getEncryptionManager().encryptString(password);
}

/**
 * 便捷解密函数
 */
export function decryptPassword(encryptedPassword: string): string {
  try {
    return getEncryptionManager().decryptString(encryptedPassword);
  } catch (error) {
    // 如果解密失败，可能是旧数据未加密，直接返回原值
    console.warn('密码解密失败，返回原始值:', error);
    return encryptedPassword;
  }
}
