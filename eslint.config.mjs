import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // eslint-plugin-react-hooks 7 随 React Compiler 新增的规则，现有页面普遍使用
    // 「effect 中请求数据并 setState」「effect 调用其后声明的函数」的写法，运行时没有问题。
    // 逐个改写需要重构页面的数据加载方式，暂以警告提示，新代码应避免这两种写法。
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  // 覆盖 eslint-config-next 的默认忽略列表
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
