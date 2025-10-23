-- ============================================================================
-- MariaDB 10.4+ 专用：修复认证插件兼容性问题
-- ============================================================================

-- 注意：MariaDB 10.4+ 中 mysql.user 是视图，不能直接更新
-- 需要使用 SET PASSWORD 或 ALTER USER 命令

-- ============================================================================
-- 方法 1：使用 SET PASSWORD（最简单，推荐）
-- ============================================================================

-- 步骤 1：设置密码（这会自动使用 mysql_native_password）
SET PASSWORD FOR 'root'@'%' = PASSWORD('password');

-- 如果上面的命令报错，尝试这个：
-- SET PASSWORD FOR 'root'@'localhost' = PASSWORD('password');

-- 步骤 2：刷新权限
FLUSH PRIVILEGES;

-- ============================================================================
-- 方法 2：创建新的专用用户（最推荐）
-- ============================================================================

-- 删除旧用户（如果存在）
DROP USER IF EXISTS 'galileo_readonly'@'%';

-- 创建新用户
CREATE USER 'galileo_readonly'@'%' IDENTIFIED BY 'Galileo@2025!Secure';

-- 授予权限
GRANT SELECT ON *.* TO 'galileo_readonly'@'%';
GRANT SELECT ON information_schema.* TO 'galileo_readonly'@'%';
GRANT SELECT ON mysql.* TO 'galileo_readonly'@'%';

-- 刷新权限
FLUSH PRIVILEGES;

-- ============================================================================
-- 方法 3：直接更新底层表 mysql.global_priv（高级用户）
-- ============================================================================

-- 警告：此方法直接修改系统表，请谨慎使用

-- 查看当前用户配置
SELECT User, Host, JSON_VALUE(Priv, '$.plugin') AS plugin
FROM mysql.global_priv
WHERE User = 'root';

-- 更新用户配置（使用 mysql_native_password）
UPDATE mysql.global_priv
SET Priv = JSON_SET(
    Priv,
    '$.plugin', 'mysql_native_password',
    '$.authentication_string', PASSWORD('password')
)
WHERE User = 'root' AND Host = '%';

FLUSH PRIVILEGES;

-- ============================================================================
-- 验证修改结果
-- ============================================================================

-- 查看所有用户的认证插件
SELECT User, Host,
       JSON_VALUE(Priv, '$.plugin') AS plugin
FROM mysql.global_priv
WHERE User IN ('root', 'galileo_readonly');

-- 或使用传统视图查看
SELECT User, Host, plugin FROM mysql.user WHERE User IN ('root', 'galileo_readonly');

-- ============================================================================
-- 推荐配置（最佳实践）
-- ============================================================================

/*
建议创建专门的应用用户，而不是使用 root：

1. root@localhost - 使用 unix_socket 认证（安全）
2. root@% - 不推荐开启
3. galileo_readonly@% - 专用只读用户（推荐用于 Galileo）
*/

-- 创建 Galileo 专用用户（完整示例）
DROP USER IF EXISTS 'galileo_readonly'@'%';

CREATE USER 'galileo_readonly'@'%' IDENTIFIED BY 'Galileo@2025!Secure';

-- 仅授予必要权限
GRANT SELECT ON *.* TO 'galileo_readonly'@'%';
GRANT SELECT ON information_schema.* TO 'galileo_readonly'@'%';
GRANT SELECT ON mysql.* TO 'galileo_readonly'@'%';

-- 限制连接数（可选）
ALTER USER 'galileo_readonly'@'%'
  WITH MAX_USER_CONNECTIONS 10
       MAX_QUERIES_PER_HOUR 10000;

FLUSH PRIVILEGES;

-- 验证新用户
SHOW GRANTS FOR 'galileo_readonly'@'%';

-- ============================================================================
-- 测试连接
-- ============================================================================

-- 退出并测试新用户
-- \q
-- mysql -u galileo_readonly -p -h localhost

-- 输入密码: Galileo@2025!Secure

-- 测试查询：
-- SELECT 1;
-- SHOW DATABASES;
