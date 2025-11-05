/**
 * 数据字典种子数据
 * 预定义标准字段语义规则
 */

import prisma from '@/lib/prisma/client';

const dataDictionarySeeds = [
  // 外键模式
  {
    fieldPattern: '%_id',
    semanticMeaning: '外键标识符',
    confidence: 0.9,
  },
  {
    fieldPattern: 'user_id',
    semanticMeaning: '用户ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.95,
  },
  {
    fieldPattern: 'product_id',
    semanticMeaning: '产品ID',
    targetTable: 'products',
    targetColumn: 'id',
    confidence: 0.95,
  },
  {
    fieldPattern: 'order_id',
    semanticMeaning: '订单ID',
    targetTable: 'orders',
    targetColumn: 'id',
    confidence: 0.95,
  },

  // 时间戳模式
  {
    fieldPattern: 'created_at',
    semanticMeaning: '创建时间',
    confidence: 0.95,
  },
  {
    fieldPattern: 'updated_at',
    semanticMeaning: '更新时间',
    confidence: 0.95,
  },
  {
    fieldPattern: 'deleted_at',
    semanticMeaning: '软删除时间',
    confidence: 0.95,
  },
  {
    fieldPattern: 'created_time',
    semanticMeaning: '创建时间',
    confidence: 0.9,
  },
  {
    fieldPattern: 'updated_time',
    semanticMeaning: '更新时间',
    confidence: 0.9,
  },

  // 审计字段
  {
    fieldPattern: 'created_by',
    semanticMeaning: '创建人ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.85,
  },
  {
    fieldPattern: 'updated_by',
    semanticMeaning: '更新人ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.85,
  },
  {
    fieldPattern: 'deleted_by',
    semanticMeaning: '删除人ID',
    targetTable: 'users',
    targetColumn: 'id',
    confidence: 0.85,
  },

  // 布尔标识
  {
    fieldPattern: 'is_%',
    semanticMeaning: '布尔标识字段',
    confidence: 0.8,
  },
  {
    fieldPattern: 'has_%',
    semanticMeaning: '是否拥有标识',
    confidence: 0.8,
  },
  {
    fieldPattern: 'is_active',
    semanticMeaning: '是否激活',
    confidence: 0.9,
  },
  {
    fieldPattern: 'is_deleted',
    semanticMeaning: '是否删除',
    confidence: 0.9,
  },
  {
    fieldPattern: 'is_enabled',
    semanticMeaning: '是否启用',
    confidence: 0.9,
  },

  // 状态字段
  {
    fieldPattern: 'status',
    semanticMeaning: '状态标识',
    confidence: 0.75,
  },
  {
    fieldPattern: 'type',
    semanticMeaning: '类型标识',
    confidence: 0.75,
  },

  // 计数/金额
  {
    fieldPattern: '%_count',
    semanticMeaning: '数量统计',
    confidence: 0.8,
  },
  {
    fieldPattern: '%_amount',
    semanticMeaning: '金额',
    confidence: 0.8,
  },
  {
    fieldPattern: '%_price',
    semanticMeaning: '价格',
    confidence: 0.8,
  },
  {
    fieldPattern: 'total_amount',
    semanticMeaning: '总金额',
    confidence: 0.9,
  },
  {
    fieldPattern: 'total_price',
    semanticMeaning: '总价格',
    confidence: 0.9,
  },

  // 名称/标题
  {
    fieldPattern: 'name',
    semanticMeaning: '名称',
    confidence: 0.85,
  },
  {
    fieldPattern: 'title',
    semanticMeaning: '标题',
    confidence: 0.85,
  },
  {
    fieldPattern: 'description',
    semanticMeaning: '描述信息',
    confidence: 0.85,
  },

  // ID字段
  {
    fieldPattern: 'id',
    semanticMeaning: '主键ID',
    confidence: 0.95,
  },
  {
    fieldPattern: 'uuid',
    semanticMeaning: 'UUID唯一标识符',
    confidence: 0.95,
  },

  // 联系信息
  {
    fieldPattern: 'email',
    semanticMeaning: '电子邮箱',
    confidence: 0.9,
  },
  {
    fieldPattern: 'phone',
    semanticMeaning: '电话号码',
    confidence: 0.9,
  },
  {
    fieldPattern: 'mobile',
    semanticMeaning: '手机号码',
    confidence: 0.9,
  },
  {
    fieldPattern: 'address',
    semanticMeaning: '地址',
    confidence: 0.9,
  },

  // 排序/位置
  {
    fieldPattern: 'sort',
    semanticMeaning: '排序序号',
    confidence: 0.85,
  },
  {
    fieldPattern: 'order',
    semanticMeaning: '排序序号',
    confidence: 0.75,
  },
  {
    fieldPattern: 'position',
    semanticMeaning: '位置序号',
    confidence: 0.8,
  },

  // 备注
  {
    fieldPattern: 'remark',
    semanticMeaning: '备注',
    confidence: 0.85,
  },
  {
    fieldPattern: 'note',
    semanticMeaning: '备注',
    confidence: 0.85,
  },
  {
    fieldPattern: 'comment',
    semanticMeaning: '备注/评论',
    confidence: 0.8,
  },
];

async function seedDataDictionary() {
  console.log('开始初始化数据字典...');

  for (const item of dataDictionarySeeds) {
    await prisma.dataDictionary.upsert({
      where: { fieldPattern: item.fieldPattern },
      update: {},
      create: item,
    });
  }

  console.log(`✓ 成功创建 ${dataDictionarySeeds.length} 条数据字典规则`);
}

export default seedDataDictionary;

// 如果直接运行此脚本
if (require.main === module) {
  seedDataDictionary()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
