# 快速开始

本指南将帮助你在 5 分钟内上手 YuanTest Playwright。

## 前置要求

- Node.js >= 16.0.0
- npm >= 7.0.0
- Playwright >= 1.40.0

## 安装

```bash
# 全局安装
npm install -g yuantest-playwright

# 安装 Playwright 浏览器（如果尚未安装）
npx playwright install
```

## 基本使用

### 1. 运行测试

```bash
# 基本用法
yuantest run --test-dir ./

# 指定项目名称和输出目录
yuantest run --project my-app --test-dir ./e2e --output ./reports

# 并行执行（4 个分片）
yuantest run --test-dir ./ --shards 4

# 指定多个浏览器
yuantest run --test-dir ./ --browsers chromium,firefox

# 设置超时和重试
yuantest run --test-dir ./ --timeout 60000 --retries 2
```

### 2. 启动 Web Dashboard

```bash
# 默认端口 5274
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定报告和数据目录
yuantest ui --port 5274 --output ./reports --data ./test-data
```

然后在浏览器中打开 **http://localhost:5274** 查看可视化界面。

### 3. 管理 Flaky 测试

```bash
# 查看 Flaky 统计
yuantest flaky

# 列出所有 Flaky 测试
yuantest flaky --list

# 隔离特定测试
yuantest flaky --quarantine <test-id>

# 释放测试
yuantest flaky --release <test-id>
```

## 下一步

- [Web UI 使用](usage/web-ui.md) - 了解 Dashboard 的详细功能
- [命令行使用](usage/cli.md) - 掌握 CLI 命令
- [CI/CD 集成](usage/cicd.md) - 集成到持续集成流程
- [API 参考](api/index.md) - 编程接口文档

## 常见问题

### Q: Dashboard 无法显示测试结果？

确保测试执行和 Dashboard 使用相同的输出目录：

```bash
# 测试执行
yuantest run --output ./test-reports

# 启动 Dashboard
yuantest ui --output ./test-reports
```

### Q: 如何只运行特定的测试文件？

```bash
# 方法一：直接指定文件路径
yuantest run tests/login.spec.ts --output ./test-reports

# 方法二：使用 --grep 参数
yuantest run --grep "登录测试" --output ./test-reports
```

### Q: 如何查看帮助？

```bash
yuantest --help
yuantest run --help
yuantest ui --help
```
