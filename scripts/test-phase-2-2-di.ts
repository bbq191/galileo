/**
 * Phase 2.2 DI 服务测试脚本
 * 验证 AI 和元数据服务的 DI 迁移是否成功
 */

import 'reflect-metadata';
import {
  getDeepseekClient,
  getBatchProcessor,
  getSemanticAnnotator,
  getMetadataRepository,
  getMetadataRetriever,
  getMetadataSyncService
} from '@/lib/di/setup';

async function main() {
  console.log('\n========================================');
  console.log('Phase 2.2 DI 服务测试');
  console.log('========================================\n');

  let successCount = 0;
  let failureCount = 0;

  // 测试 DeepseekClient
  try {
    console.log('1. 测试 DeepseekClient...');
    const deepseekClient = getDeepseekClient();
    console.log('   ✅ DeepseekClient 注入成功');
    console.log(`   类型: ${deepseekClient.constructor.name}`);
    successCount++;
  } catch (error) {
    console.error('   ❌ DeepseekClient 注入失败:', error);
    failureCount++;
  }

  // 测试 BatchProcessor
  try {
    console.log('\n2. 测试 BatchProcessor...');
    const batchProcessor = getBatchProcessor();
    console.log('   ✅ BatchProcessor 注入成功');
    console.log(`   类型: ${batchProcessor.constructor.name}`);
    successCount++;
  } catch (error) {
    console.error('   ❌ BatchProcessor 注入失败:', error);
    failureCount++;
  }

  // 测试 SemanticAnnotator
  try {
    console.log('\n3. 测试 SemanticAnnotator...');
    const semanticAnnotator = getSemanticAnnotator();
    console.log('   ✅ SemanticAnnotator 注入成功');
    console.log(`   类型: ${semanticAnnotator.constructor.name}`);
    successCount++;
  } catch (error) {
    console.error('   ❌ SemanticAnnotator 注入失败:', error);
    failureCount++;
  }

  // 测试 MetadataRepository
  try {
    console.log('\n4. 测试 MetadataRepository...');
    const metadataRepository = getMetadataRepository();
    console.log('   ✅ MetadataRepository 注入成功');
    console.log(`   类型: ${metadataRepository.constructor.name}`);
    successCount++;
  } catch (error) {
    console.error('   ❌ MetadataRepository 注入失败:', error);
    failureCount++;
  }

  // 测试 MetadataRetriever
  try {
    console.log('\n5. 测试 MetadataRetriever...');
    const metadataRetriever = getMetadataRetriever();
    console.log('   ✅ MetadataRetriever 注入成功');
    console.log(`   类型: ${metadataRetriever.constructor.name}`);
    successCount++;
  } catch (error) {
    console.error('   ❌ MetadataRetriever 注入失败:', error);
    failureCount++;
  }

  // 测试 MetadataSyncService
  try {
    console.log('\n6. 测试 MetadataSyncService...');
    const metadataSyncService = getMetadataSyncService();
    console.log('   ✅ MetadataSyncService 注入成功');
    console.log(`   类型: ${metadataSyncService.constructor.name}`);
    successCount++;
  } catch (error) {
    console.error('   ❌ MetadataSyncService 注入失败:', error);
    failureCount++;
  }

  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`✅ 成功: ${successCount}/6`);
  console.log(`❌ 失败: ${failureCount}/6`);
  console.log('========================================\n');

  if (failureCount === 0) {
    console.log('🎉 所有 Phase 2.2 服务都已成功迁移到 DI！');
    process.exit(0);
  } else {
    console.error('⚠️ 部分服务迁移失败，请检查错误信息');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
});
