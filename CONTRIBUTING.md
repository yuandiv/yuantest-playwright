# 贡献指南

感谢您有兴趣为 @yuantest/playwright 做出贡献！本文档将帮助您了解如何参与项目开发。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [开发流程](#开发流程)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)

## 行为准则

本项目采用贡献者公约作为行为准则。参与此项目即表示您同意遵守其条款。请阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 了解详情。

## 如何贡献

### 报告 Bug

如果您发现了 bug，请通过 [GitHub Issues](https://github.com/yuandiv/yuantest-playwright/issues) 提交报告。提交前请：

1. 搜索现有 issues，确认该问题尚未被报告
2. 使用 issue 模板填写详细信息
3. 提供可复现的步骤、预期结果和实际结果

### 提出新功能

欢迎提出新功能建议！请：

1. 通过 Issues 描述您的想法
2. 说明该功能的使用场景和价值
3. 等待维护者反馈后再开始实现

### 提交代码

我们非常欢迎代码贡献！请遵循以下流程。

## 开发环境设置

### 前置要求

- Node.js >= 16.0.0
- npm >= 7.0.0
- Git

### 安装步骤

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/<your-username>/yuantest-playwright.git

# 2. 进入项目目录
cd yuantest-playwright

# 3. 安装依赖
npm install

# 4. 编译项目
npm run build
```

### 验证安装

```bash
# 运行测试
npm test

# 运行 lint 检查
npm run lint

# 运行类型检查
npm run typecheck
```

## 项目结构

```
yuantest-playwright/
├── bin/                    # CLI 入口文件
├── dashboard/              # Web Dashboard 前端 (React + Vite)
├── src/                    # 核心源代码
│   ├── orchestrator/       # 测试编排器
│   ├── executor/           # 测试执行器
│   ├── reporter/           # 报告生成器
│   ├── flaky/              # Flaky 测试管理
│   ├── realtime/           # WebSocket 实时报告
│   ├── trace/              # Trace 管理
│   ├── annotations/        # 注解扫描器
│   ├── tags/               # 标签管理器
│   ├── visual/             # 视觉测试
│   ├── storage/            # 存储提供者
│   ├── config/             # 配置管理
│   ├── cli/                # CLI 命令行
│   └── ui/                 # Dashboard 服务器
├── tests/                  # 测试文件
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   └── e2e/                # 端到端测试
└── package.json
```

## 开发流程

### 1. 创建分支

```bash
# 从 main 创建新分支
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

分支命名规范：
- `feature/` - 新功能
- `fix/` - Bug 修复
- `docs/` - 文档更新
- `refactor/` - 代码重构
- `test/` - 测试相关

### 2. 进行开发

确保遵循 [代码规范](#代码规范)。

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- path/to/test.test.ts

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行集成测试
npm run test:integration

# 运行 E2E 测试
npm run test:e2e
```

### 4. 代码检查

```bash
# 运行 ESLint
npm run lint

# 自动修复 lint 问题
npm run lint:fix

# 运行类型检查
npm run typecheck

# 检查代码格式
npm run format:check

# 自动格式化代码
npm run format
```

### 5. 提交代码

遵循 [提交规范](#提交规范)。

## 代码规范

### TypeScript

- 使用 TypeScript 编写所有代码
- 为所有公共 API 添加类型定义
- 避免使用 `any`，必要时使用 `unknown`
- 为函数添加 JSDoc 注释（中文）

```typescript
/**
 * 执行测试运行
 * @param options - 执行选项
 * @returns 测试运行结果
 */
async execute(options?: ExecuteOptions): Promise<RunResult> {
  // ...
}
```

### 代码风格

- 使用 ESLint 和 Prettier 保持代码风格一致
- 使用 2 空格缩进
- 使用单引号
- 语句末尾不加分号（由 Prettier 自动处理）

### 文件命名

- 使用 kebab-case 命名文件
- 测试文件使用 `.test.ts` 后缀
- 类型定义放在 `types/index.ts`

### 测试规范

- 为新功能添加单元测试
- 测试覆盖率应达到 80% 以上
- 使用 describe/it 组织测试结构
- 测试描述使用中文

```typescript
describe('Orchestrator', () => {
  describe('orchestrate()', () => {
    it('应该正确分发测试到各个分片', () => {
      // ...
    });
  });
});
```

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 代码重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具相关 |
| `ci` | CI/CD 相关 |

### 示例

```bash
# 新功能
feat(executor): 添加测试超时配置选项

# Bug 修复
fix(orchestrator): 修复分片分配不均衡的问题

# 文档
docs: 更新 README 安装说明

# 重构
refactor(reporter): 优化报告生成性能
```

## Pull Request 流程

### 1. 推送分支

```bash
git push origin feature/your-feature-name
```

### 2. 创建 Pull Request

1. 在 GitHub 上创建 Pull Request
2. 填写 PR 模板中的所有必填项
3. 关联相关的 Issue（如有）

### 3. PR 检查清单

在提交 PR 前，请确保：

- [ ] 代码通过所有测试 (`npm test`)
- [ ] 代码通过 lint 检查 (`npm run lint`)
- [ ] 代码通过类型检查 (`npm run typecheck`)
- [ ] 代码格式正确 (`npm run format:check`)
- [ ] 新功能有对应的测试
- [ ] 新功能有对应的文档更新
- [ ] 提交信息符合规范

### 4. 代码审查

- 维护者会审查您的代码
- 请及时回应审查意见
- 根据反馈进行必要的修改

### 5. 合并

- PR 通过审查后会被合并到 main 分支
- 合并后会自动生成 CHANGELOG 条目

## 获取帮助

如果您有任何问题，可以：

- 在 [GitHub Discussions](https://github.com/yuandiv/yuantest-playwright/discussions) 提问
- 在 Issue 中留言
- 查阅项目文档

再次感谢您的贡献！
