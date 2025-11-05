#!/bin/bash

echo "========================================"
echo "API 输入验证手动测试"
echo "========================================"
echo ""

API_BASE="http://localhost:3000"

echo "【测试 1: 查询执行 API - 有效输入】"
curl -X POST "${API_BASE}/api/query/execute" \
  -H "Content-Type: application/json" \
  -d '{"query":"查询所有用户"}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 2: 查询执行 API - 空查询】"
curl -X POST "${API_BASE}/api/query/execute" \
  -H "Content-Type: application/json" \
  -d '{"query":""}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 3: 查询执行 API - 包含危险字符】"
curl -X POST "${API_BASE}/api/query/execute" \
  -H "Content-Type: application/json" \
  -d '{"query":"<script>alert(\"xss\")</script>"}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 4: 元数据同步 API - 有效输入】"
curl -X POST "${API_BASE}/api/metadata/sync" \
  -H "Content-Type: application/json" \
  -d '{"dataSourceId":1}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 5: 元数据同步 API - 无效数据源 ID】"
curl -X POST "${API_BASE}/api/metadata/sync" \
  -H "Content-Type: application/json" \
  -d '{"dataSourceId":-1}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 6: 数据源创建 API - 有效输入】"
curl -X POST "${API_BASE}/api/datasources" \
  -H "Content-Type: application/json" \
  -d '{"name":"test_db","type":"mysql","host":"localhost","port":3306,"username":"root"}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 7: 数据源创建 API - 缺少必填字段】"
curl -X POST "${API_BASE}/api/datasources" \
  -H "Content-Type: application/json" \
  -d '{"name":"test_db"}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 8: 数据源创建 API - 不支持的数据库类型】"
curl -X POST "${API_BASE}/api/datasources" \
  -H "Content-Type: application/json" \
  -d '{"name":"test_db","type":"oracle","host":"localhost","port":3306,"username":"root"}' \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 9: 审计日志 API - 有效查询参数】"
curl -X GET "${API_BASE}/api/audit/logs?page=1&limit=10" \
  -w "\n状态码: %{http_code}\n\n"

echo "【测试 10: 审计日志 API - 超出限制的分页参数】"
curl -X GET "${API_BASE}/api/audit/logs?limit=200" \
  -w "\n状态码: %{http_code}\n\n"

echo "========================================"
echo "测试完成"
echo "========================================"
