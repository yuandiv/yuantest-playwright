# YuanTest Playwright 使用指南

YuanTest Playwright 是一个强大的 Playwright 测试编排器、执行器和报告器，提供 Web Dashboard 可视化界面和 CLI 命令行工具，帮助团队更高效地管理和分析 E2E 测试。

---

## 目录

1. [Web UI 使用](#web-ui-使用)
2. [命令行执行](#命令行执行)
3. [外部工具执行](#外部工具执行)
4. [最佳实践](#最佳实践)

---

## Web UI 使用

### 启动 Dashboard

```bash
# 默认端口 5274
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定报告和数据目录
yuantest ui --port 5274 --output ./test-reports --data ./test-data
```

启动后访问 **http://localhost:5274** 查看可视化界面。

### Dashboard 功能介绍

#### 1. 概览页面

Dashboard 首页展示关键指标：

- **测试运行统计**：总运行次数、通过率趋势
- **Flaky 测试统计**：不稳定测试数量和占比
- **执行时间趋势**：平均执行时间变化
- **最近运行记录**：快速查看最近的测试结果

#### 2. Test Runs（测试运行记录）

查看所有历史测试运行：

- **运行列表**：显示每次运行的详细信息
- **筛选和搜索**：按状态、时间筛选测试运行
- **运行详情**：点击查看完整的测试结果
- **报告下载**：下载 HTML 或 JSON 格式的报告

#### 3. Flaky Tests（不稳定测试管理）

智能管理不稳定测试：

- **自动检测**：基于历史数据自动识别 Flaky 测试
- **失败率统计**：显示每个测试的失败率
- **一键隔离**：隔离不稳定的测试，避免影响 CI/CD
- **释放测试**：将隔离的测试重新加入测试套件

#### 4. Failure Analysis（失败分析）

深度分析失败原因：

- **自动分类**：智能识别超时、断言失败、元素未找到等
- **失败统计**：显示各类失败的数量和占比
- **修复建议**：提供针对性的失败修复建议
- **历史趋势**：追踪失败原因的变化趋势

#### 5. 实时进度

测试执行时实时监控：

- **进度条**：显示测试执行进度
- **实时日志**：查看测试输出日志
- **测试状态**：实时更新通过、失败、跳过的测试数量
- **当前测试**：显示正在执行的测试

### Web UI 执行测试

#### 通过界面执行测试

1. **选择测试目录**
   - 在 Dashboard 左侧点击"设置"
   - 输入测试目录路径
   - 系统会自动扫描测试文件

2. **选择测试文件**
   - 在测试列表中勾选要执行的测试
   - 支持按文件、按描述块、按单个测试选择
   - 支持搜索和筛选

3. **配置执行参数**
   - **浏览器**：选择 Chromium、Firefox、WebKit
   - **重试次数**：设置失败重试次数
   - **超时时间**：设置测试超时时间
   - **并行度**：设置 Worker 数量

4. **执行测试**
   - 点击"运行测试"按钮
   - 实时查看测试进度
   - 查看控制台输出

5. **查看测试报告**
   - 测试完成后自动跳转到报告页面
   - 查看详细的测试结果
   - 查看失败测试的错误信息和堆栈
   - 查看 Trace、截图、视频等附件

### Web UI 高级功能

#### Flaky 测试隔离

1. 在 Flaky Tests 页面查看不稳定测试列表
2. 点击测试旁边的"隔离"按钮
3. 被隔离的测试不会在后续运行中执行
4. 可以在"已隔离测试"中查看和管理

#### 失败分析

1. 在 Test Runs 页面点击某次运行
2. 切换到"失败分析"标签
3. 查看失败原因分类和统计
4. 查看每个失败测试的详细信息和建议

#### Trace 查看

1. 在测试详情页面点击"Trace"按钮
2. 自动打开 Playwright Trace Viewer
3. 查看测试执行的完整时间线
4. 查看每个步骤的截图和 DOM 快照

#### 产物管理

- **截图**：自动收集失败测试的截图
- **视频**：自动收集失败测试的视频
- **Trace**：自动收集测试执行轨迹
- **统一存储**：所有产物统一存储在 `test-sandbox/artifacts/` 目录

---

## 命令行执行

### 基本命令

```bash
# 运行所有测试
yuantest run --test-dir ./ --output ./test-reports

# 运行特定测试文件
yuantest run tests/login.spec.ts --output ./test-reports

# 运行匹配的测试
yuantest run --grep "登录测试" --output ./test-reports

# 指定浏览器
yuantest run --browsers chromium,firefox --output ./test-reports

# 设置并行度和重试
yuantest run --shards 4 --workers 2 --retries 2 --output ./test-reports
```

### 查看报告

```bash
# 启动 Dashboard 查看报告
yuantest ui --output ./test-reports

# 浏览器访问
# http://localhost:5274
```

### 命令参数说明

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--project` | `-p` | 项目名称 | test-project |
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出目录 | ./test-output |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表 | chromium |
| `--timeout` | | 超时时间(ms) | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--grep` | | 运行匹配的测试 | |

---

## 外部工具执行

### VSCode 任务配置

#### 创建 VSCode 任务

在项目根目录创建 `.vscode/tasks.json` 文件：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "YuanTest: 运行所有测试",
      "type": "shell",
      "command": "yuantest",
      "args": [
        "run",
        "--test-dir",
        "${workspaceFolder}/tests",
        "--output",
        "${workspaceFolder}/test-reports"
      ],
      "group": {
        "kind": "test",
        "isDefault": true
      },
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new",
        "showReuseMessage": true,
        "clear": true
      },
      "problemMatcher": []
    },
    {
      "label": "YuanTest: 运行当前文件测试",
      "type": "shell",
      "command": "yuantest",
      "args": [
        "run",
        "--test-dir",
        "${workspaceFolder}/tests",
        "--output",
        "${workspaceFolder}/test-reports",
        "${file}"
      ],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared",
        "showReuseMessage": false,
        "clear": true
      },
      "problemMatcher": []
    },
    {
      "label": "YuanTest: 启动 Dashboard",
      "type": "shell",
      "command": "yuantest",
      "args": [
        "ui",
        "--port",
        "5274",
        "--output",
        "${workspaceFolder}/test-reports",
        "--data",
        "${workspaceFolder}/test-data"
      ],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new",
        "showReuseMessage": false,
        "clear": true
      },
      "problemMatcher": [],
      "isBackground": true
    }
  ]
}
```

#### 使用 VSCode 任务

1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Tasks: Run Task`
3. 选择任务：
   - **YuanTest: 运行所有测试** - 运行整个测试套件
   - **YuanTest: 运行当前文件测试** - 运行当前打开的测试文件
   - **YuanTest: 启动 Dashboard** - 启动 Web UI

#### 配置快捷键（可选）

在 `.vscode/keybindings.json` 中添加：

```json
[
  {
    "key": "ctrl+shift+t",
    "command": "workbench.action.tasks.runTask",
    "args": "YuanTest: 运行当前文件测试"
  },
  {
    "key": "ctrl+shift+a",
    "command": "workbench.action.tasks.runTask",
    "args": "YuanTest: 运行所有测试"
  },
  {
    "key": "ctrl+shift+d",
    "command": "workbench.action.tasks.runTask",
    "args": "YuanTest: 启动 Dashboard"
  }
]
```

### CI/CD 集成

#### GitHub Actions

创建 `.github/workflows/test.yml`：

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Install YuanTest
        run: npm install -g yuantest-playwright
      
      - name: Run tests
        run: |
          yuantest run \
            --test-dir ./ \
            --output ./test-reports \
            --shards 4
        continue-on-error: true
      
      - name: Upload test reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: test-reports/
          retention-days: 30
```

---

## 最佳实践

### 推荐工作流程

#### 开发阶段

1. **使用 Web UI 快速调试**
   - 启动 Dashboard：`yuantest ui`
   - 在界面中选择要执行的测试
   - 实时查看测试进度和结果
   - 快速定位失败原因

2. **使用 --grep 参数运行特定测试**
   ```bash
   yuantest run --grep "登录功能" --output ./test-reports
   ```

3. **查看详细报告**
   - 在 Dashboard 中查看测试详情
   - 查看 Trace 文件分析失败原因
   - 查看截图和视频

#### CI/CD 阶段

1. **使用命令行执行完整测试套件**
   ```bash
   yuantest run --test-dir ./ --output ./test-reports --shards 4
   ```

2. **上传报告作为 artifact**
   - GitHub Actions: `actions/upload-artifact`
   - GitLab CI: `artifacts`

3. **可选：部署 Dashboard 服务器**
   - 在服务器上运行 `yuantest ui`
   - 团队成员可以随时查看历史报告

### 常见问题

#### Q1: Dashboard 无法显示测试结果

**解决方案**：确保测试执行和 Dashboard 使用相同的输出目录

```bash
# 测试执行
yuantest run --output ./test-reports

# 启动 Dashboard
yuantest ui --output ./test-reports
```

#### Q2: 如何只运行特定的测试文件？

**解决方案**：

```bash
# 方法一：直接指定文件路径
yuantest run tests/login.spec.ts --output ./test-reports

# 方法二：使用 --grep 参数
yuantest run --grep "登录测试" --output ./test-reports

# 方法三：在 VSCode 任务中使用 ${file} 变量
# 已在 tasks.json 中配置 "YuanTest: 运行当前文件测试"
```

#### Q3: VSCode 任务执行失败，提示找不到 yuantest 命令

**解决方案**：

确保已全局安装 yuantest-playwright：

```bash
npm install -g yuantest-playwright
```

或在项目中安装并修改 tasks.json：

```bash
npm install --save-dev yuantest-playwright
```

```json
{
  "command": "npx",
  "args": ["yuantest", "run", ...]
}
```

#### Q4: 如何查看 Flaky 测试？

**解决方案**：

1. 启动 Dashboard：`yuantest ui`
2. 切换到"Flaky Tests"页面
3. 查看不稳定测试列表和失败率
4. 可以一键隔离不稳定的测试

---

## 总结

YuanTest Playwright 提供了强大的 Web UI 和灵活的执行方式：

- **Web UI**：最推荐的使用方式，提供可视化界面、实时监控、智能分析等强大功能
- **命令行**：适合 CI/CD 环境和自动化脚本
- **外部工具**：支持 VSCode 任务配置，方便开发调试

**所有执行方式的测试结果都可在 Web UI 中查看和分析**，让测试管理更加高效便捷。

---

## 相关资源

- [GitHub 仓库](https://github.com/yuandiv/yuantest-playwright)
- [API 文档](https://yuandiv.github.io/yuantest-playwright/)
- [Playwright 官方文档](https://playwright.dev/)
- [更新日志](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
