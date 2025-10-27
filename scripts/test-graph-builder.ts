/**
 * 测试关系图谱构建器
 */

import prisma from '@/lib/prisma/client';
import { relationshipGraphBuilder } from '@/lib/metadata/graph/relationship-graph-builder';

async function testGraphBuilder() {
  console.log('\n========================================');
  console.log('测试关系图谱构建器');
  console.log('========================================\n');

  try {
    // 获取 openser 数据库 ID
    const openserDb = await prisma.databaseMeta.findFirst({
      where: {
        databaseName: 'openser',
      },
    });

    if (!openserDb) {
      console.log('找不到 openser 数据库');
      return;
    }

    console.log(`openser 数据库 ID: ${openserDb.id}\n`);

    // 构建图谱
    console.log('开始构建图谱...\n');
    const graph = await relationshipGraphBuilder.buildGraph(
      null,
      openserDb.id,
      2,
      true, // includeInferred
      0.7   // minConfidence
    );

    console.log('========================================');
    console.log('图谱构建完成');
    console.log('========================================\n');

    console.log(`节点总数: ${graph.nodes.length}`);
    console.log(`边总数: ${graph.edges.length}`);
    console.log(`显式关系: ${graph.metadata.explicitEdgeCount}`);
    console.log(`推断关系: ${graph.metadata.inferredEdgeCount}\n`);

    // 统计数据库分布
    const nodesByDatabase = new Map<string, number>();
    graph.nodes.forEach((node) => {
      nodesByDatabase.set(
        node.databaseName,
        (nodesByDatabase.get(node.databaseName) || 0) + 1
      );
    });

    console.log('节点按数据库分布:');
    nodesByDatabase.forEach((count, dbName) => {
      console.log(`  ${dbName}: ${count} 个表`);
    });

    // 检查跨库边
    const crossDbEdges = graph.edges.filter((edge) => {
      const sourceNode = graph.nodes.find((n) => n.tableId === edge.source);
      const targetNode = graph.nodes.find((n) => n.tableId === edge.target);
      return sourceNode && targetNode && sourceNode.databaseName !== targetNode.databaseName;
    });

    console.log(`\n跨库关系: ${crossDbEdges.length} 条\n`);

    if (crossDbEdges.length > 0) {
      console.log('跨库关系详情（前5条）:');
      crossDbEdges.slice(0, 5).forEach((edge, index) => {
        const sourceNode = graph.nodes.find((n) => n.tableId === edge.source);
        const targetNode = graph.nodes.find((n) => n.tableId === edge.target);
        console.log(`${index + 1}. ${sourceNode?.databaseName}.${sourceNode?.label} → ${targetNode?.databaseName}.${targetNode?.label}`);
        console.log(`   字段: ${edge.sourceColumn} → ${edge.targetColumn}`);
        console.log(`   类型: ${edge.type}, 置信度: ${edge.confidence || 1.0}\n`);
      });
    }

    console.log('========================================\n');
  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testGraphBuilder();
