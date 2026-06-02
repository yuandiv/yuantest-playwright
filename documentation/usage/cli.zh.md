# 命令行使用

YuanTest Playwright 提供完整的 CLI 工具，支持测试执行、编排、报告、Flaky 管理、AI 诊断、Trace 管理等功能。

## 查看帮助

```bash
yuantest --help
yuantest run --help
yuantest flaky --help
```

---

## 测试执行

### 基本用法

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

### 执行参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | |
| `--project` | `-p` | 项目名称 | test-project |
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出目录 | ./test-reports |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表（逗号分隔） | chromium |
| `--base-url` | | 测试基础 URL | |
| `--timeout` | | 测试超时时间（毫秒） | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--trace` | | Trace 模式 | on-first-retry |
| `--screenshot` | | 截图模式 | only-on-failure |
| `--video` | | 视频模式 | retain-on-failure |
| `--tags` | | 仅运行包含指定标签的测试 | |
| `--grep` | | 通过正则匹配过滤测试 | |
| `--project-filter` | | 仅运行指定浏览器项目 | |
| `--update-snapshots` | | 更新视觉测试快照 | false |
| `--visual-threshold` | | 视觉差异阈值（0-1） | 0.2 |
| `--annotations` | | 启用注解扫描 | false |
| `--html-report` | | 生成 HTML 报告 | false |
| `--html-report-dir` | | HTML 报告输出目录 | |

### 高级执行示例

```bash
# 启用 Trace 和截图
yuantest run --trace on --screenshot on --video on

# 仅运行带 @smoke 标签的测试
yuantest run --tags smoke

# 视觉测试并更新基线
yuantest run --update-snapshots --visual-threshold 0.1

# 启用注解扫描
yuantest run --annotations

# 多浏览器 + 分片
yuantest run --browsers chromium,firefox,webkit --shards 4 --workers 2
```

---

## 编排预览

查看测试分片分配计划（不执行测试）：

```bash
# 查看测试分片分配计划
yuantest orchestrate --test-dir ./ --shards 4

# 使用智能编排策略
yuantest orchestrate --test-dir ./ --shards 4 --strategy intelligent

# 输出编排结果到文件
yuantest orchestrate --test-dir ./ --shards 4 --output orchestration.json
```

编排策略：

| 策略 | 说明 |
|------|------|
| `distributed` | 均匀分配测试到各分片 |
| `weighted` | 按历史执行时间加权分配 |
| `intelligent` | 综合考虑执行时间、Flaky 状态、依赖关系 |

---

## 查看报告

```bash
# 查看最近报告
yuantest report --output ./test-reports

# 生成 HTML 报告
yuantest report --html-report --html-report-dir ./html-report

# 打开 HTML 报告
yuantest show-report
```

---

## Flaky 测试管理

### 查看和管理 Flaky 测试

```bash
# 查看 Flaky 统计
yuantest flaky

# 列出所有 Flaky 测试（JSON 格式）
yuantest flaky --list --json

# 列出已隔离的测试
yuantest flaky --quarantined

# 隔离特定测试
yuantest flaky --quarantine <test-id>

# 释放特定测试
yuantest flaky --release <test-id>

# 自定义阈值
yuantest flaky --list --threshold 0.5
```

### 健康度指标

```bash
# 查看测试健康度
yuantest health

# JSON 格式输出
yuantest health --json
```

### 失败预测

```bash
# 查看高风险测试
yuantest prediction --high-risk

# 查看指定测试的预测结果
yuantest prediction --test <test-id>

# 查看执行时间异常的测试
yuantest prediction --duration-anomalies

# JSON 格式输出
yuantest prediction --high-risk --json
```

### 关联分析

```bash
# 查看测试关联分析
yuantest correlations

# JSON 格式输出
yuantest correlations --json
```

### 测试历史

```bash
# 查看指定测试的历史记录
yuantest test-history <test-id>

# 分页查看
yuantest test-history <test-id> --page 2 --page-size 20

# JSON 格式输出
yuantest test-history <test-id> --json
```

---

## AI 诊断

### 分析测试结果

```bash
# 分析特定运行的失败原因
yuantest analyze --id run_20240101_120000_abc123

# 使用 AI 诊断
yuantest analyze --id run_20240101_120000_abc123 --ai

# JSON 格式输出
yuantest analyze --id run_20240101_120000_abc123 --ai --json
```

### LLM 配置管理

```bash
# 查看当前 LLM 配置（API Key 脱敏）
yuantest llm-config --show

# 设置 LLM 配置
yuantest llm-config --set '{"apiKey":"sk-xxx","baseUrl":"https://api.openai.com/v1","model":"gpt-4"}'

# 测试 LLM 连接
yuantest llm-config --test

# 查看 LLM 状态
yuantest llm-config --status
```

### 错误模式管理

```bash
# 列出所有错误模式
yuantest error-patterns --list

# 仅列出自定义模式
yuantest error-patterns --custom

# 添加自定义错误模式
yuantest error-patterns --add '{"name":"自定义模式","pattern":"CustomError","category":"unknown"}'

# 删除自定义错误模式
yuantest error-patterns --delete <pattern-id>

# JSON 格式输出
yuantest error-patterns --list --json
```

---

## 测试重跑

```bash
# 重跑指定测试
yuantest rerun <run-id> <test-id>
```

系统会从报告中查找指定测试的文件和行信息，以 `testLocations` 方式重新执行该测试，并更新原报告中的结果。

---

## Trace 管理

```bash
# 列出所有 Trace 文件
yuantest trace --list

# 查看 Trace 详情
yuantest trace --view <trace-file>

# 删除 7 天前的 Trace 文件
yuantest trace --clean

# 查看 Trace 统计信息
yuantest trace --stats
```

---

## 注解和标签

### 注解扫描

```bash
# 扫描测试文件中的注解
yuantest annotations --test-dir <dir>

# JSON 格式输出
yuantest annotations --test-dir <dir> --output annotation-report.json
```

支持的注解类型：`@skip`、`@only`、`@fail`、`@slow`、`@fixme`、`@todo`、`@serial`、`@parallel`

### 标签管理

```bash
# 扫描测试文件中的标签
yuantest tags --test-dir <dir>

# JSON 格式输出
yuantest tags --test-dir <dir> --output tag-report.json
```

---

## 产物管理

```bash
# 列出所有产物
yuantest artifacts --list

# 查看产物统计信息
yuantest artifacts --stats

# 删除 7 天前的产物
yuantest artifacts --clean
```

产物类型：截图（screenshot）、视频（video）、下载（download）、Trace（trace）、附件（attachment）

---

## 视觉测试

```bash
# 比较视觉测试结果
yuantest visual --dir <dir>

# 更新所有基线为当前截图
yuantest visual --dir <dir> --update

# 查看视觉测试统计信息
yuantest visual --dir <dir> --stats

# 生成视觉测试报告
yuantest visual --dir <dir> --report visual-report.json
```

---

## 启动 Dashboard

```bash
# 默认端口 5274
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定目录
yuantest ui --port 5274 --output ./test-reports --data ./test-data

# 不自动打开浏览器
yuantest ui --no-open
```

---

## 最佳实践

### 开发调试

```bash
# 运行单个测试文件
yuantest run tests/login.spec.ts

# 运行匹配的测试
yuantest run --grep "登录"

# 启用 Trace 和截图便于调试
yuantest run --trace on --screenshot on

# 启动 Dashboard 查看结果
yuantest ui
```

### CI/CD 环境

```bash
# 完整测试套件
yuantest run --test-dir ./e2e --shards 4 --retries 2 --output ./test-reports

# 检查 Flaky 测试健康度
yuantest health --json

# 查看高风险测试
yuantest prediction --high-risk --json

# AI 诊断失败测试
yuantest analyze --id $RUN_ID --ai --json
```

### 多浏览器测试

```bash
# 在所有浏览器上运行
yuantest run --test-dir ./e2e --browsers chromium,firefox,webkit

# 仅在特定浏览器上运行
yuantest run --test-dir ./e2e --browsers chromium

# 指定浏览器项目过滤
yuantest run --project-filter chromium
```

### Flaky 测试治理

```bash
# 1. 查看当前 Flaky 状态
yuantest flaky --list --json

# 2. 查看健康度
yuantest health

# 3. 查看关联分析（找出共因失败）
yuantest correlations

# 4. 查看失败预测
yuantest prediction --high-risk

# 5. AI 诊断根因
yuantest analyze --id $RUN_ID --ai
```
