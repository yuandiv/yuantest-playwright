# Git 提交信息规范

本项目采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

## 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

## 类型 (type)

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | feat: add AI diagnosis module |
| `fix` | Bug 修复 | fix: resolve WebSocket connection issue |
| `docs` | 文档更新 | docs: update API reference |
| `style` | 代码格式（不影响功能） | style: format code with prettier |
| `refactor` | 重构 | refactor: simplify executor logic |
| `perf` | 性能优化 | perf: optimize test discovery |
| `test` | 测试相关 | test: add unit tests for flaky manager |
| `build` | 构建相关 | build: update webpack config |
| `ci` | CI/CD 相关 | ci: add GitHub Actions workflow |
| `chore` | 其他（不显示在 CHANGELOG） | chore: update dependencies |

## 范围 (scope)

可选，表示影响的模块：

- `orchestrator` - 测试编排
- `executor` - 测试执行
- `reporter` - 报告生成
- `flaky` - Flaky 管理
- `dashboard` - Web Dashboard
- `cli` - 命令行工具
- `docs` - 文档

## 示例

### 新功能

```
feat(dashboard): add real-time test progress display

- Add WebSocket connection for real-time updates
- Display test progress bar
- Show current running test
```

### Bug 修复

```
fix(executor): resolve timeout handling issue

The executor was not properly handling test timeouts,
causing tests to hang indefinitely. This fix adds proper
timeout tracking and cleanup.
```

### 破坏性变更

```
feat(api)!: change API response format

BREAKING CHANGE: The API response format has changed from
boolean to object with success and error fields.
```

## 自动生成 CHANGELOG

使用以下命令发布新版本：

```bash
# 补丁版本 (1.0.0 -> 1.0.1)
npm run release

# 小版本 (1.0.0 -> 1.1.0)
npm run release:minor

# 大版本 (1.0.0 -> 2.0.0)
npm run release:major
```

这会自动：
1. 更新 `package.json` 版本号
2. 生成/更新 `CHANGELOG.md`
3. 创建 Git commit
4. 创建 Git tag
