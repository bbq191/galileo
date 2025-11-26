/**
 * Webpack 文件系统访问拦截插件
 * 用于阻止 webpack 访问 Windows 系统保护目录
 * @author xusy
 */

const fs = require('fs');
const path = require('path');

// Windows 系统保护目录列表
const PROTECTED_DIRS = [
  'Cookies',
  'Application Data',
  'Local Settings',
  'AppData',
  'NetHood',
  'PrintHood',
  'Recent',
  'SendTo',
  'Templates',
  'Start Menu',
  'My Documents',
  'NTUSER.DAT',
  'ntuser.dat.LOG',
];

/**
 * 检查路径是否是系统保护目录
 */
function isProtectedPath(filePath) {
  if (!filePath) return false;

  const normalizedPath = filePath.replace(/\\/g, '/');

  // 检查是否包含保护目录名称
  const hasProtectedDir = PROTECTED_DIRS.some(dir => normalizedPath.includes(dir));

  // 检查是否在 Windows 系统目录下
  const isSystemPath = normalizedPath.includes('C:/Windows') ||
    normalizedPath.includes('C:/Program Files');

  return hasProtectedDir || isSystemPath;
}

class WebpackFsBlockerPlugin {
  constructor(options = {}) {
    this.options = options;
    this.applied = false;
  }

  apply(compiler) {
    // 只应用一次
    if (this.applied) return;
    this.applied = true;

    // 在编译器初始化时拦截文件系统操作
    const inputFileSystem = compiler.inputFileSystem;

    if (inputFileSystem && inputFileSystem.readdir) {
      const originalReaddir = inputFileSystem.readdir.bind(inputFileSystem);

      inputFileSystem.readdir = function (path, callback) {
        if (isProtectedPath(path)) {
          console.warn(`[WebpackFsBlockerPlugin] 跳过系统保护目录: ${path}`);
          return callback(null, []);
        }

        return originalReaddir(path, (err, files) => {
          if (err && err.code === 'EPERM' && isProtectedPath(err.path || path)) {
            console.warn(`[WebpackFsBlockerPlugin] 忽略权限错误: ${err.path || path}`);
            return callback(null, []);
          }
          return callback(err, files);
        });
      };
    }

    // 拦截 stat 操作
    if (inputFileSystem && inputFileSystem.stat) {
      const originalStat = inputFileSystem.stat.bind(inputFileSystem);

      inputFileSystem.stat = function (path, callback) {
        if (isProtectedPath(path)) {
          // 返回一个假的 stat 对象，表示这是一个目录，但为空
          const fakeStat = {
            isFile: () => false,
            isDirectory: () => true,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isSymbolicLink: () => false,
            isFIFO: () => false,
            isSocket: () => false,
          };
          return callback(null, fakeStat);
        }

        return originalStat(path, (err, stats) => {
          if (err && err.code === 'EPERM' && isProtectedPath(err.path || path)) {
            console.warn(`[WebpackFsBlockerPlugin] 忽略 stat 权限错误: ${err.path || path}`);
            const fakeStat = {
              isFile: () => false,
              isDirectory: () => true,
              isBlockDevice: () => false,
              isCharacterDevice: () => false,
              isSymbolicLink: () => false,
              isFIFO: () => false,
              isSocket: () => false,
            };
            return callback(null, fakeStat);
          }
          return callback(err, stats);
        });
      };
    }

    console.log('[WebpackFsBlockerPlugin] 文件系统访问拦截已启用');
  }
}

module.exports = WebpackFsBlockerPlugin;
