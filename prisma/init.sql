-- ============================================
-- Galileo 元数据数据库初始化脚本
-- 用于手动创建数据库（备用方案）
-- ============================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS galileo_metadata
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE galileo_metadata;

-- ============================================
-- 创建用户（可选，推荐生产环境使用）
-- ============================================
-- CREATE USER IF NOT EXISTS 'galileo_user'@'localhost' IDENTIFIED BY 'your_secure_password';
-- GRANT ALL PRIVILEGES ON galileo_metadata.* TO 'galileo_user'@'localhost';
-- FLUSH PRIVILEGES;

-- ============================================
-- 验证数据库配置
-- ============================================
SELECT
  @@character_set_database AS charset,
  @@collation_database AS collation,
  VERSION() AS mysql_version;

-- ============================================
-- 注意事项
-- ============================================
-- 1. 表结构由 Prisma 自动创建，使用以下命令：
--    npm run db:push  (开发环境)
--    npm run db:migrate (生产环境)
--
-- 2. 种子数据初始化：
--    npm run db:seed
--
-- 3. 可视化管理：
--    npm run db:studio
--
-- 4. 推荐的最小 MariaDB 版本：10.5+
--    推荐的最小 MySQL 版本：5.7+
--
-- 5. 确保启用以下功能：
--    - InnoDB 引擎（全文索引支持）
--    - utf8mb4 字符集（emoji 支持）
--    - FOREIGN KEY 约束（虽然不使用，但确保支持）
