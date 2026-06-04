# 贡献指南

感谢你对 YuanTest Playwright 的关注！欢迎贡献代码、报告问题或提出建议。

## 行为准则

本项目采用贡献者公约作为行为准则。参与此项目即表示你同意遵守其条款。

## 如何贡献

### 报告 Bug

如果你发现了 bug，请创建一个 [Issue](https://github.com/yuandiv/yuantest-playwright/issues)，包含：

1. 清晰的标题和描述
2. 复现步骤
3. 预期行为
4. 实际行为
5. 环境信息（Node.js 版本、操作系统等）

### 提出新功能

如果你有新功能的想法，请创建一个 [Issue](https://github.com/yuandiv/yuantest-playwright/issues)，包含：

1. 功能描述
2. 使用场景
3. 可能的实现方式

### 提交代码

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 开发指南

### 环境设置

```bash
# 克隆仓库
git clone https://github.com/yuandiv/yuantest-playwright.git
cd yuantest-playwright

# 安装依赖
npm install

# 构建
npm run build
```

### 开发命令

```bash
# 运行测试
npm test

# 运行测试（带覆盖率）
npm run test:coverage

# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
npm run typecheck

# 生成文档
npm run docs
```

### 代码风格

- 使用 TypeScript
- 遵循 ESLint 规则
- 使用 Prettier 格式化代码
- 编写有意义的提交信息

### 提交信息规范

使用约定式提交：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式（不影响功能）
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

示例：
```
feat: add AI-powered failure analysis
fix: resolve WebSocket connection issue
docs: update API reference
```

### Pull Request 指南

1. 确保所有测试通过
2. 更新相关文档
3. 添加必要的测试
4. 保持 PR 聚焦单一功能
5. 编写清晰的 PR 描述

## 项目结构

```
yuantest-playwright/
├── bin/              # CLI 入口
├── dashboard/        # Web Dashboard 前端
├── src/              # 源代码
│   ├── orchestrator/ # 测试编排
│   ├── executor/     # 测试执行
│   ├── reporter/     # 报告生成
│   ├── flaky/        # Flaky 管理
│   ├── realtime/     # 实时报告
│   └── ...
├── tests/            # 测试文件
├── documentation/    # 文档源文件
└── docs/             # API 文档输出
```

## 许可证

本项目采用 GPL-3.0 许可证。提交代码即表示你同意将代码以相同许可证授权。
