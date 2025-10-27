/**
 * 测试以表为中心的跨库关系显示
 */

import prisma from '@/lib/prisma/client';
import { relationshipGraphBuilder } from '@/lib/metadata/graph/relationship-graph-builder';

async function testTableCenter() {
  console.log('\n========================================');
  console.log('测试以表为中心的跨库关系显示');
  console.log('========================================\n');

  try {
    // 获取 openser.conf 表
    const confTable = await prisma.tableMeta.findFirst({
      where: {
        tableName: 'conf',
        database: {
          databaseName: 'openser',
        },
      },
      include: {
        database: true,
      },
    });

    if (!confTable) {
      console.log('找不到 openser.conf 表');
      return;
    }

    console.log(`测试表: ${confTable.database.databaseName}.${confTable.tableName}`);
    console.log(`表 ID: ${confTable.id}\n`);

    // 先检查有多少关系指向这个表
    const incomingRels = await prisma.inferredRelationship.count({
      where: {
        targetTableId: confTable.id,
      },
    });

    console.log(`指向该表的推断关系: ${incomingRels} 条\n`);

    // 构建以该表为中心的图谱
    console.log('开始构建图谱（以 openser.conf 为中心，深度2）...\n');

    const graph = await relationshipGraphBuilder.buildGraph(
      confTable.id, // tableId
      null,         // databaseId
      2,            // depth
      true,         // includeInferred
      0.7           // minConfidence
    );

    console.log('========================================');
    console.log('图谱构建完成');
    console.log('========================================\n');

    console.log(`节点总数: ${graph.nodes.length}`);
    console.log(`边总数: ${graph.edges.length}`);
    console.log(`显式关系: ${graph.metadata.explicitEdgeCount}`);
    console.log(`推断关系: ${graph.metadata.inferredEdgeCount}\n`);

    // 统计数据库分布
    const nodesByDatabase = new Map<string, string[]>();
    graph.nodes.forEach((node) => {
      if (!nodesByDatabase.has(node.databaseName)) {
        nodesByDatabase.set(node.databaseName, []);
      }
      nodesByDatabase.get(node.databaseName)!.push(node.label);
    });

    console.log('节点按数据库分布:');
    nodesByDatabase.forEach((tables, dbName) => {
      console.log(`  ${dbName}: ${tables.length} 个表`);
      if (tables.length <= 5) {
        console.log(`    表: ${tables.join(', ')}`);
      } else {
        console.log(`    表: ${tables.slice(0, 3).join(', ')}, ... (还有${tables.length - 3}个)`);
      }
    });

    // 检查跨库边
    const crossDbEdges = graph.edges.filter((edge) => {
      const sourceNode = graph.nodes.find((n) => n.tableId === edge.source);
      const targetNode = graph.nodes.find((n) => n.tableId === edge.target);
      return sourceNode && targetNode && sourceNode.databaseName !== targetNode.databaseName;
    });

    console.log(`\n跨库关系边: ${crossDbEdges.length} 条`);

    if (crossDbEdges.length > 0) {
      console.log('\n跨库关系详情（前10条）:');
      crossDbEdges.slice(0, 10).forEach((edge, index) => {
        const sourceNode = graph.nodes.find((n) => n.tableId === edge.source);
        const targetNode = graph.nodes.find((n) => n.tableId === edge.target);
        console.log(`${index + 1}. ${sourceNode?.databaseName}.${sourceNode?.label}`);
        console.log(`   → ${targetNode?.databaseName}.${targetNode?.label}`);
        console.log(`   字段: ${edge.sourceColumn} → ${edge.targetColumn}`);
        console.log(`   置信度: ${edge.confidence?.toFixed(2) || '1.00'}\n`);
      });
    } else {
      console.log('\n⚠️  没有发现跨库关系！');
    }

    console.log('========================================\n');
  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTableCenter();
