/**
 * Jest 转换器：将仅提供 ESM 的依赖（如 jose）转换为 CommonJS
 *
 * 不复用 ts-jest：ts-jest 会在多条 transform 规则间共享配置，
 * 导致这里的 target 被项目 tsconfig 的 es2018 覆盖，降级 class 字段后破坏 jose 中继承 Error 的类。
 */
const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: {
        allowJs: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    });
    return { code: outputText };
  },
};
