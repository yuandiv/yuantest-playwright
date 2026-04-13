# yuantest-playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://badge.fury.io/js/yuantest-playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![CI](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml)

[English](README.en.md) | 中文

强大的 Playwright 测试编排器、执行器和报告器，提供 CLI 命令行工具和 Web Dashboard 可视化界面，帮助团队更高效地管理和分析 E2E 测试。

## ✨ 核心特性

### 🎯 智能测试编排
- **自动发现测试文件** - 智能扫描测试目录，支持多种文件格式
- **智能分片策略** - 基于历史执行时间优化分片分配，实现负载均衡
- **并行执行优化** - 自动计算最优并行度，最大化测试效率

### 🚀 灵活的测试执行
- **多浏览器支持** - 一键在 Chromium、Firefox、WebKit 上运行测试
- **失败重试机制** - 自动重试失败测试，提高测试稳定性
- **快照更新** - 支持自动更新视觉测试快照
- **无内部API依赖** - 通过 Playwright CLI 执行，升级兼容性强

### 📊 实时报告与可视化
- **WebSocket 实时推送** - 实时查看测试进度和结果
- **Web Dashboard** - 现代化可视化界面，直观展示测试数据
- **HTML 报告** - 自动生成详细的测试报告
- **历史趋势分析** - 追踪测试通过率和执行时间趋势

### 🔍 Flaky 测试管理
- **自动检测** - 基于历史数据自动识别不稳定测试
- **智能隔离** - 一键隔离 Flaky 测试，避免影响 CI/CD
- **统计分析** - 提供详细的 Flaky 测试统计和趋势
- **自定义阈值** - 灵活配置 Flaky 检测标准

### 🛠️ 失败分析与调试
- **自动分类失败原因** - 智能识别超时、断言失败、元素未找到等
- **修复建议** - 提供针对性的失败修复建议
- **Trace 管理** - 自动收集和管理 Playwright Trace 文件
- **产物管理** - 统一管理测试截图、视频等产物

### 🏷️ 高级功能
- **注解支持** - 支持 `@slow`, `@flaky`, `@skip` 等测试注解
- **标签管理** - 灵活的测试标签系统
- **视觉测试** - 集成像素对比的视觉回归测试
- **配置热加载** - 支持配置文件动态加载

## 📦 安装

### 通过 npm 安装（推荐）

```bash
# 全局安装
npm install -g yuantest-playwright

# 或作为项目依赖
npm install --save-dev yuantest-playwright
```

### 从源码安装

```bash
git clone https://github.com/yuandiv/yuantest-playwright.git
cd yuantest-playwright
npm install
npm run build
npm link
```

## 🚀 快速开始

### 1. 运行测试

```bash
# 基本用法
yuantest run --test-dir ./tests

# 指定项目名称和输出目录
yuantest run --project my-app --test-dir ./e2e --output ./reports

# 使用 4 个分片并行执行
yuantest run --test-dir ./tests --shards 4

# 指定多个浏览器
yuantest run --test-dir ./tests --browsers chromium,firefox

# 设置超时和重试
yuantest run --test-dir ./tests --timeout 60000 --retries 2
```

### 2. 启动 Web Dashboard

```bash
# 默认端口 3000
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 自定义报告和数据目录
yuantest ui --port 3000 --output ./reports --data ./test-data
```

然后在浏览器打开 **http://localhost:3000** 查看可视化界面。

## 📖 CLI 命令详解

### 查看帮助

```bash
yuantest --help
yuantest run --help
yuantest ui --help
```

### 运行测试参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--project` | `-p` | 项目名称 | test-project |
| `--test-dir` | `-t` | 测试文件目录 | ./tests |
| `--output` | `-o` | 输出目录 | ./test-output |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表(逗号分隔) | chromium |
| `--base-url` | | 基础 URL | |
| `--timeout` | | 超时时间(ms) | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--grep` | | 运行匹配的测试 | |
| `--update-snapshots` | | 更新快照 | false |

### 编排预览（不执行）

```bash
# 查看测试分片分配方案
yuantest orchestrate --test-dir ./tests --shards 4
```

### 查看报告

```bash
# 查看最近 10 条报告
yuantest report --limit 10

# 查看指定报告
yuentest report --id run_20240101_120000_abc123
```

### Flaky 测试管理

```bash
# 查看 Flaky 统计
yuantest flaky

# 列出所有 Flaky 测试
yuantest flaky --list

# 列出已隔离的测试
yuantest flaky --quarantined

# 隔离指定测试
yuantest flaky --quarantine <test-id>

# 释放指定测试
yuantest flaky --release <test-id>

# 自定义阈值
yuantest flaky --list --threshold 0.5
```

### 失败分析

```bash
# 分析指定 Run 的失败原因
yuantest analyze --id run_20240101_120000_abc123
```

## 🖥️ Web Dashboard

启动后访问 `http://localhost:<port>`，包含以下功能模块：

### 主要页面

- **概览** - 测试运行总数、通过率、Flaky 统计、执行趋势图表
- **Test Runs** - 历史测试运行记录，支持筛选和搜索
- **Flaky Tests** - 不稳定测试列表，支持一键隔离/释放
- **Failure Analysis** - 失败原因分类和修复建议
- **实时进度** - 测试运行时显示实时进度条和日志

### REST API

Dashboard 提供 RESTful API，方便集成到其他系统：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/stats` | 总体统计 |
| GET | `/api/runs` | 运行列表 |
| GET | `/api/runs/:id` | 运行详情 |
| GET | `/api/flaky` | Flaky 测试列表 |
| GET | `/api/flaky/quarantined` | 已隔离测试 |
| POST | `/api/flaky/:id/quarantine` | 隔离测试 |
| POST | `/api/flaky/:id/release` | 释放测试 |
| GET | `/api/flaky/stats` | Flaky 统计 |
| GET | `/api/analysis/:runId` | 失败分析 |
| GET | `/api/progress` | 实时进度 |

## 💻 编程 API 使用

### 基础示例

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
} from 'yuantest-playwright';

async function main() {
  // 1. 编排测试
  const orchestrator = new Orchestrator({
    projectName: 'my-app',
    testDir: './e2e',
    outputDir: './reports',
    shards: 4,
    browsers: ['chromium', 'firefox'],
  });
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();

  // 2. 执行测试
  const executor = new Executor(orchestrator.getConfig());

  // 监听事件
  executor.on('run_started', (data) => {
    console.log(`Run started: ${data.runId}`);
  });

  executor.on('test_result', (result) => {
    console.log(`[${result.status}] ${result.title} (${result.duration}ms)`);
  });

  executor.on('run_progress', (progress) => {
    console.log(`Progress: ${progress.passed}/${progress.totalTests} passed`);
  });

  executor.on('output', (data) => {
    process.stdout.write(data.data);
  });

  executor.on('run_completed', async (result) => {
    // 3. 生成报告
    const reporter = new Reporter('./reports');
    const reportPath = await reporter.generateReport(result);
    console.log(`Report: ${reportPath}`);

    // 4. 分析失败
    const analysis = await reporter.analyzeFailures(result);
    console.log(`Failures: ${analysis.length}`);
  });

  const result = await executor.execute({
    grepPattern: 'smoke',
    projectFilter: 'chromium',
    updateSnapshots: false,
  });
  console.log(`Final: ${result.passed}/${result.totalTests} passed`);

  // 5. 启动 Dashboard
  const server = new DashboardServer(3000, './reports', './test-data');
  await server.start();
}

main();
```

### 高级用法

```typescript
import { FlakyTestManager, AnnotationManager } from 'yuantest-playwright';

// Flaky 测试管理
const flakyManager = new FlakyTestManager('./test-data');
await flakyManager.initialize();

// 获取 Flaky 测试
const flakyTests = await flakyManager.getFlakyTests(0.3);
console.log(`Found ${flakyTests.length} flaky tests`);

// 隔离测试
await flakyManager.quarantineTest('test-id-123');

// 注解管理
const annotationManager = new AnnotationManager('./tests');
const annotations = await annotationManager.scanAnnotations();
console.log(`Found ${annotations.length} annotated tests`);
```

## 📁 项目结构

```
yuantest-playwright/
├── bin/
│   ├── cli.js              # CLI 入口
│   └── start-ui.js         # Dashboard 启动脚本
├── dashboard/              # Web Dashboard 前端源码
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── services/       # API 服务
│   │   └── types/          # TypeScript 类型
│   └── index.html
├── src/
│   ├── index.ts            # 主入口
│   ├── types/              # 类型定义
│   ├── orchestrator/       # 测试编排器
│   ├── executor/           # 测试执行器
│   ├── reporter/           # 报告生成器
│   ├── realtime/           # 实时报告
│   ├── flaky/              # Flaky 管理
│   ├── config/             # 配置管理
│   ├── trace/              # Trace 管理
│   ├── annotations/        # 注解扫描
│   ├── tags/               # 标签管理
│   ├── artifacts/          # 产物管理
│   ├── visual/             # 视觉测试
│   ├── logger/             # 日志模块
│   ├── cli/                # CLI 命令
│   └── ui/                 # Dashboard 服务器
├── tests/                  # 测试文件
├── docs/                   # 文档
└── package.json
```

## 🎯 使用场景

### CI/CD 集成

```yaml
# GitHub Actions 示例
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E tests
        run: |
          npm install -g yuantest-playwright
          yuantest run --test-dir ./e2e --shards 4 --output ./reports
      
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: reports/
```

### 大型测试套件优化

```bash
# 使用智能分片加速大型测试套件
yuantest run --test-dir ./e2e --shards 8 --workers 4

# 隔离 Flaky 测试避免阻塞 CI
yuantest flaky --quarantine-all
yuantest run --test-dir ./e2e
```

### 多浏览器测试

```bash
# 在所有浏览器上运行测试
yuantest run --test-dir ./e2e --browsers chromium,firefox,webkit

# 仅在特定浏览器上运行
yuantest run --test-dir ./e2e --browsers chromium
```

## ⚙️ 配置文件

支持通过配置文件自定义行为：

```typescript
// yuantest.config.ts
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  project: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  shards: 4,
  browsers: ['chromium', 'firefox'],
  timeout: 60000,
  retries: 2,
  flaky: {
    threshold: 0.3,
    autoQuarantine: false,
  },
  dashboard: {
    port: 3000,
    open: true,
  },
});
```

## 📊 性能特性

- **智能分片** - 基于历史执行时间优化分片，提升 30-50% 执行效率
- **并行执行** - 支持多 Worker 并行，充分利用多核 CPU
- **增量测试** - 支持仅运行变更相关的测试
- **缓存优化** - 智能缓存测试发现结果，减少重复计算
- **内存优化** - 流式处理大型测试结果，降低内存占用

## 🔧 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0
- Playwright >= 1.40.0

## 📚 文档

- [API 文档](https://yuandiv.github.io/yuantest-playwright/)
- [更新日志](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

## 📝 License

MIT © [YuanDiv](https://github.com/yuandiv)

## 🙏 致谢

感谢以下开源项目：

- [Playwright](https://playwright.dev/) - 强大的端到端测试框架
- [React](https://react.dev/) - Dashboard 前端框架
- [Express](https://expressjs.com/) - Dashboard 服务器框架
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的开发体验

## 📮 联系方式

- GitHub: [@yuandiv](https://github.com/yuandiv)
- Issues: [GitHub Issues](https://github.com/yuandiv/yuantest-playwright/issues)

---

如果这个项目对你有帮助，请给一个 ⭐️ Star！
