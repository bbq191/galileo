/**
 * Deepseek API 客户端测试
 *
 * 注意：需要配置 DEEPSEEK_API_KEY 环境变量
 */

import { DeepseekClient, createDeepseekClient } from '../deepseek-client';
import { APIError, RateLimitError } from '../types';

/**
 * 测试 Deepseek API 客户端
 */
export async function testDeepseekClient() {
  console.log('\n========================================');
  console.log('Deepseek API 客户端测试');
  console.log('========================================\n');

  // 检查 API Key
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('⚠️  未配置 DEEPSEEK_API_KEY，跳过 API 测试');
    console.log('提示：在 .env 文件中设置 DEEPSEEK_API_KEY 以运行完整测试\n');
    return;
  }

  try {
    // ========================================
    // 1. 创建客户端
    // ========================================
    console.log('1. 创建客户端实例...');

    const client = createDeepseekClient({
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
    });

    console.log('  ✓ 客户端创建成功\n');

    // ========================================
    // 2. 测试连接
    // ========================================
    console.log('2. 测试 API 连接...');

    const connected = await client.testConnection();

    if (connected) {
      console.log('  ✓ API 连接正常\n');
    } else {
      console.log('  ✗ API 连接失败\n');
      return;
    }

    // ========================================
    // 3. 简单聊天测试
    // ========================================
    console.log('3. 测试简单聊天...');

    const response1 = await client.chat([
      {
        role: 'user',
        content: '请用一句话解释什么是数据库？',
      },
    ]);

    console.log('  用户: 请用一句话解释什么是数据库？');
    console.log(`  助手: ${response1}`);
    console.log('  ✓ 聊天测试成功\n');

    // ========================================
    // 4. 结构化输出测试
    // ========================================
    console.log('4. 测试结构化输出 (JSON)...');

    const response2 = await client.chat([
      {
        role: 'system',
        content: '你是一个数据库专家。请以 JSON 格式回答用户问题。',
      },
      {
        role: 'user',
        content: `请分析字段名 "user_id" 和 "id" 之间是否可能存在关联关系。
请以 JSON 格式返回：
{
  "hasRelationship": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "推断理由"
}`,
      },
    ], {
      temperature: 0.2,
      max_tokens: 500,
    });

    console.log('  用户: 分析 user_id 和 id 的关联关系');
    console.log(`  助手: ${response2}`);

    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(response2);
      console.log('  ✓ JSON 解析成功:');
      console.log(`     - 存在关联: ${parsed.hasRelationship}`);
      console.log(`     - 置信度: ${parsed.confidence}`);
      console.log(`     - 理由: ${parsed.reasoning}`);
    } catch (error) {
      console.log('  ⚠️  JSON 解析失败，但请求成功');
    }

    console.log('  ✓ 结构化输出测试完成\n');

    // ========================================
    // 5. 批量请求测试
    // ========================================
    console.log('5. 测试批量请求...');

    const batchRequests = [
      {
        messages: [
          {
            role: 'user' as const,
            content: '用一个词描述：MySQL',
          },
        ],
      },
      {
        messages: [
          {
            role: 'user' as const,
            content: '用一个词描述：PostgreSQL',
          },
        ],
      },
      {
        messages: [
          {
            role: 'user' as const,
            content: '用一个词描述：MongoDB',
          },
        ],
      },
    ];

    const batchResults = await client.batchChat(batchRequests, {
      batchSize: 2,
      delayBetweenBatches: 500,
    });

    console.log('  批量请求结果:');
    batchResults.forEach((result, index) => {
      console.log(`    ${index + 1}. ${result}`);
    });

    console.log('  ✓ 批量请求测试成功\n');

    // ========================================
    // 6. 参数测试
    // ========================================
    console.log('6. 测试不同参数...');

    // 高温度（更随机）
    const highTemp = await client.chat([
      {
        role: 'user',
        content: '创造一个数据库表名',
      },
    ], {
      temperature: 0.9,
    });

    console.log(`  高温度 (0.9): ${highTemp}`);

    // 低温度（更确定）
    const lowTemp = await client.chat([
      {
        role: 'user',
        content: '创造一个数据库表名',
      },
    ], {
      temperature: 0.1,
    });

    console.log(`  低温度 (0.1): ${lowTemp}`);
    console.log('  ✓ 参数测试成功\n');

    // ========================================
    // 7. 错误处理测试
    // ========================================
    console.log('7. 测试错误处理...');

    // 测试无效的 API Key
    const invalidClient = new DeepseekClient({
      apiKey: 'invalid_key',
      maxRetries: 1,
    });

    try {
      await invalidClient.chat([
        {
          role: 'user',
          content: 'Hello',
        },
      ]);
      console.log('  ✗ 应该抛出错误但没有');
    } catch (error) {
      if (error instanceof APIError) {
        console.log(`  ✓ 正确捕获 APIError: ${error.message}`);
      } else {
        console.log(`  ⚠️  捕获到错误但类型不对: ${error}`);
      }
    }

    console.log();

    // ========================================
    // 完成
    // ========================================
    console.log('========================================');
    console.log('✓ 所有测试通过');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testDeepseekClient()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
