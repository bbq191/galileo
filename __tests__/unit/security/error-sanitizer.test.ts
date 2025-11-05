/**
 * 错误脱敏器单元测试
 */

import { ErrorSanitizer, ErrorCategory, sanitizeError } from '@/lib/security/error-sanitizer';

let testsPassed = 0;
let testsFailed = 0;

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${expected}, Got: ${actual}`);
    testsFailed++;
  } else {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  }
}

function assertNotContain(text: string, substring: string, message: string) {
  if (text.includes(substring)) {
    console.error(`  ✗ ${message}`);
    console.error(`    Text should not contain: "${substring}"`);
    testsFailed++;
  } else {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  }
}

function assertContain(text: string, substring: string, message: string) {
  if (!text.includes(substring)) {
    console.error(`  ✗ ${message}`);
    console.error(`    Text should contain: "${substring}"`);
    testsFailed++;
  } else {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  }
}

function assertTruthy(value: any, message: string) {
  if (!value) {
    console.error(`  ✗ ${message}`);
    testsFailed++;
  } else {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  }
}

export async function testErrorSanitizer() {
  console.log('\n========================================');
  console.log('错误脱敏器测试');
  console.log('========================================\n');

  const sanitizer = new ErrorSanitizer({ isDevelopment: false });

  // 测试组 1: 敏感信息脱敏
  console.log('1. 测试敏感信息脱敏\n');

  // 测试 1.1: 移除 Windows 文件路径
  (() => {
    const error = new Error('Failed to load file from E:\\Projects\\galileo\\lib\\utils\\test.ts');
    const result = sanitizer.sanitize(error);
    assertNotContain(result.message, 'E:\\Projects', '应该移除 Windows 文件路径');
    assertNotContain(result.message, 'test.ts', '应该移除文件名');
  })();

  // 测试 1.2: 移除 Unix 文件路径
  (() => {
    const error = new Error('Module not found at /usr/local/lib/node_modules/test.js');
    const result = sanitizer.sanitize(error);
    assertNotContain(result.message, '/usr/local', '应该移除 Unix 文件路径');
  })();

  // 测试 1.3: 移除数据库连接信息
  (() => {
    const error = new Error('Connection failed: host=localhost, port=3306, user=admin');
    const result = sanitizer.sanitize(error);
    assertNotContain(result.message, 'localhost', '应该移除主机名');
    assertNotContain(result.message, '3306', '应该移除端口号');
    assertNotContain(result.message, 'admin', '应该移除用户名');
  })();

  // 测试 1.4: 移除 API 密钥
  (() => {
    const error = new Error('Auth failed: api_key=sk-1234567890');
    const result = sanitizer.sanitize(error);
    assertNotContain(result.message, 'sk-1234567890', '应该移除 API 密钥');
  })();

  // 测试 1.5: 移除 IP 地址
  (() => {
    const error = new Error('Connection refused at 192.168.1.100:3306');
    const result = sanitizer.sanitize(error);
    assertNotContain(result.message, '192.168.1.100', '应该移除 IP 地址');
  })();

  console.log();

  // 测试组 2: 错误分类匹配
  console.log('2. 测试错误分类匹配\n');

  // 测试 2.1: 数据库访问权限错误
  (() => {
    const error = new Error('Access denied for user \'root\'@\'localhost\'');
    const result = sanitizer.sanitize(error);
    assertEqual(result.category, ErrorCategory.DATABASE, '应该识别为数据库错误');
    assertEqual(result.message, '数据库访问权限不足', '应该返回友好的错误消息');
    assertEqual(result.statusCode, 500, '状态码应该为 500');
  })();

  // 测试 2.2: 连接拒绝错误
  (() => {
    const error = new Error('Connection refused to database server');
    const result = sanitizer.sanitize(error);
    assertEqual(result.category, ErrorCategory.DATABASE, '应该识别为数据库错误');
    assertEqual(result.message, '无法连接到数据库服务', '应该返回友好的错误消息');
    assertEqual(result.statusCode, 503, '状态码应该为 503');
  })();

  // 测试 2.3: 超时错误
  (() => {
    const error = new Error('Query execution timed out after 30 seconds');
    const result = sanitizer.sanitize(error);
    assertEqual(result.category, ErrorCategory.TIMEOUT, '应该识别为超时错误');
    assertContain(result.message, '超时', '应该包含"超时"提示');
    assertEqual(result.statusCode, 504, '状态码应该为 504');
  })();

  // 测试 2.4: 未知列错误
  (() => {
    const error = new Error('Unknown column \'user_id\' in \'field list\'');
    const result = sanitizer.sanitize(error);
    assertEqual(result.category, ErrorCategory.DATABASE, '应该识别为数据库错误');
    assertEqual(result.message, '查询包含无效的数据字段', '应该返回友好的错误消息');
    assertEqual(result.statusCode, 400, '状态码应该为 400');
  })();

  // 测试 2.5: 死锁错误
  (() => {
    const error = new Error('Deadlock found when trying to get lock');
    const result = sanitizer.sanitize(error);
    assertEqual(result.category, ErrorCategory.DATABASE, '应该识别为数据库错误');
    assertEqual(result.message, '数据操作发生冲突，请重试', '应该返回友好的错误消息');
    assertEqual(result.statusCode, 409, '状态码应该为 409');
  })();

  console.log();

  // 测试组 3: 通用错误处理
  console.log('3. 测试通用错误处理\n');

  // 测试 3.1: 未识别的错误
  (() => {
    const error = new Error('Some random internal error');
    const result = sanitizer.sanitize(error);
    assertEqual(result.category, ErrorCategory.INTERNAL, '应该归类为内部错误');
    assertEqual(result.message, '服务器内部错误', '应该返回通用错误消息');
    assertEqual(result.statusCode, 500, '状态码应该为 500');
  })();

  // 测试 3.2: 字符串错误
  (() => {
    const result = sanitizer.sanitize('Something went wrong');
    assertEqual(result.message, '服务器内部错误', '应该处理字符串错误');
    assertEqual(result.category, ErrorCategory.INTERNAL, '应该归类为内部错误');
  })();

  // 测试 3.3: 生成唯一错误 ID
  (() => {
    const error = new Error('Test');
    const result1 = sanitizer.sanitize(error);
    const result2 = sanitizer.sanitize(error);
    assertTruthy(result1.code, '应该生成错误 ID');
    assertTruthy(result2.code, '应该生成错误 ID');
    assertTruthy(result1.code !== result2.code, '错误 ID 应该唯一');
    assertTruthy(result1.code.startsWith('err_'), '错误 ID 应该以 err_ 开头');
  })();

  // 测试 3.4: 时间戳
  (() => {
    const error = new Error('Test');
    const result = sanitizer.sanitize(error);
    assertTruthy(result.timestamp, '应该包含时间戳');
    const timestamp = new Date(result.timestamp).getTime();
    const now = Date.now();
    assertTruthy(timestamp > now - 1000 && timestamp <= now, '时间戳应该接近当前时间');
  })();

  console.log();

  // 测试组 4: 自定义选项
  console.log('4. 测试自定义选项\n');

  // 测试 4.1: 自定义错误分类
  (() => {
    const error = new Error('Test');
    const result = sanitizer.sanitize(error, {
      category: ErrorCategory.VALIDATION,
      statusCode: 422,
    });
    assertEqual(result.category, ErrorCategory.VALIDATION, '应该使用自定义分类');
    assertEqual(result.statusCode, 422, '应该使用自定义状态码');
  })();

  // 测试 4.2: 请求 ID
  (() => {
    const error = new Error('Test');
    const result = sanitizer.sanitize(error, {
      requestId: 'req_12345',
    });
    assertEqual(result.requestId, 'req_12345', '应该包含请求 ID');
  })();

  console.log();

  // 测试组 5: 批量脱敏
  console.log('5. 测试批量脱敏\n');

  (() => {
    const errors = [
      new Error('Error 1'),
      new Error('Error 2'),
      'Error 3',
    ];
    const results = sanitizer.sanitizeBatch(errors);
    assertEqual(results.length, 3, '应该处理所有错误');
    results.forEach((result, index) => {
      assertTruthy(result.code, `错误 ${index + 1} 应该有错误 ID`);
      assertTruthy(result.message, `错误 ${index + 1} 应该有消息`);
    });
  })();

  console.log();

  // 测试组 6: 敏感信息检测
  console.log('6. 测试敏感信息检测\n');

  (() => {
    assertTruthy(
      sanitizer.hasSensitiveInfo('Failed at E:\\Projects\\galileo\\lib\\test.ts'),
      '应该检测到文件路径'
    );

    assertTruthy(
      sanitizer.hasSensitiveInfo('Connection failed: host=localhost'),
      '应该检测到数据库信息'
    );

    assertTruthy(
      sanitizer.hasSensitiveInfo('Auth failed with api_key=sk-123456'),
      '应该检测到 API 密钥'
    );

    assertTruthy(
      !sanitizer.hasSensitiveInfo('Query execution failed'),
      '普通消息不应该被标记为敏感'
    );
  })();

  console.log();

  // 测试组 7: 快捷函数
  console.log('7. 测试快捷函数\n');

  (() => {
    const error = new Error('Test');
    const result = sanitizeError(error);
    assertTruthy(result.code, '快捷函数应该正常工作');
    assertTruthy(result.message, '快捷函数应该返回消息');
  })();

  (() => {
    const error = new Error('Test');
    const result = sanitizeError(error, {
      category: ErrorCategory.VALIDATION,
      statusCode: 422,
      requestId: 'req_123',
    });
    assertEqual(result.category, ErrorCategory.VALIDATION, '应该支持自定义分类');
    assertEqual(result.statusCode, 422, '应该支持自定义状态码');
    assertEqual(result.requestId, 'req_123', '应该支持请求 ID');
  })();

  console.log();

  // 总结
  console.log('========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`✓ 通过: ${testsPassed}`);
  console.log(`✗ 失败: ${testsFailed}`);
  console.log(`总计: ${testsPassed + testsFailed}`);
  console.log('========================================\n');

  if (testsFailed > 0) {
    throw new Error(`${testsFailed} 个测试失败`);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testErrorSanitizer()
    .then(() => {
      console.log('✓ 所有测试通过');
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ 测试失败:', error);
      process.exit(1);
    });
}
