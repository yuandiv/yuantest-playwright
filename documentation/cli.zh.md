# CLI 命令参考

YuanTest Playwright 提供完整的命令行工具，用于测试编排、执行、报告和分析。

## 全局选项

```bash
yuantest --help       # 查看帮助
yuantest --version    # 查看版本（1.0.0）
```

不带任何参数运行 `yuantest` 将显示帮助信息。

---

## 1. run - 执行测试

运行 Playwright 测试，支持编排、重试、多浏览器、Trace、截图、视频等功能。

### 用法

```bash
yuantest run [testFiles...] [options]
```

`testFiles` 为可选的位置参数，指定要运行的测试文件路径。若不指定，则运行配置目录下的所有测试。

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | |
| `--project` | `-p` | 项目名称 | |
| `--test-dir` | `-t` | 测试文件目录 | |
| `--output` | `-o` | 输出目录 | ./test-reports |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表（逗号分隔） | chromium |
| `--base-url` | | 测试基础 URL | |
| `--timeout` | | 测试超时时间（毫秒） | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--trace` | | Trace 模式：off, on, retain-on-failure, on-first-retry | on-first-retry |
| `--screenshot` | | 截图模式：off, on, only-on-failure | only-on-failure |
| `--video` | | 视频模式：off, on, retain-on-failure, on-first-retry | retain-on-failure |
| `--tags` | | 仅运行包含指定标签的测试（逗号分隔） | |
| `--grep` | | 通过正则匹配过滤测试 | |
| `--project-filter` | | 仅运行指定浏览器项目 | |
| `--update-snapshots` | | 更新视觉测试快照 | false |
| `--visual-threshold` | | 视觉差异阈值（0-1） | 0.2 |
| `--annotations` | | 启用注解扫描 | false |
| `--html-report` | | 生成 Playwright HTML 报告 | true |

### 示例

```bash
# 基本用法
yuantest run --test-dir ./

# 指定项目名称和输出目录
yuantest run --project my-app --test-dir ./e2e --output ./reports

# 并行执行（4 分片，2 Worker）
yuantest run --test-dir ./ --shards 4 --workers 2

# 多浏览器测试
yuantest run --test-dir ./ --browsers chromium,firefox,webkit

# 运行匹配的测试
yuantest run --test-dir ./ --grep "smoke"

# 设置超时和重试
yuantest run --test-dir ./ --timeout 60000 --retries 2

# 按标签过滤
yuantest run --test-dir ./ --tags smoke,regression

# 启用 Trace 和视频
yuantest run --test-dir ./ --trace on --video on

# 启用注解扫描
yuantest run --test-dir ./ --annotations

# 更新视觉测试快照
yuantest run --test-dir ./ --update-snapshots --visual-threshold 0.1

# 指定特定测试文件
yuantest run tests/login.spec.ts tests/cart.spec.ts

# 仅运行特定浏览器项目
yuantest run --test-dir ./ --project-filter chromium
```

---

## 2. orchestrate - 编排测试

预览测试分片分配计划，不实际执行测试。

### 用法

```bash
yuantest orchestrate [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--shards` | `-s` | 分片数量 | 1 |

### 示例

```bash
# 查看默认目录的分片分配
yuantest orchestrate

# 查看指定目录的 4 分片分配计划
yuantest orchestrate --test-dir ./e2e --shards 4
```

---

## 3. report - 查看报告

查看测试运行报告。

### 用法

```bash
yuantest report [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--limit` | `-l` | 显示最近报告数量 | 10 |
| `--id` | `-i` | 查看特定运行 ID 的报告 | |
| `--open` | `-o` | 在浏览器中打开报告 | |

### 示例

```bash
# 查看最近 10 条报告
yuantest report --limit 10

# 查看特定运行的详细报告
yuantest report --id run_20240101_120000_abc123

# 在浏览器中打开报告
yuantest report --id run_20240101_120000_abc123 --open
```

---

## 4. flaky - Flaky 测试管理

管理和查看不稳定（Flaky）测试，支持隔离和释放操作。

### 用法

```bash
yuantest flaky [options]
```

不带任何选项时，显示 Flaky 测试统计信息。

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--list` | `-l` | 列出所有 Flaky 测试 | |
| `--quarantined` | `-q` | 列出已隔离的测试 | |
| `--quarantine` | | 隔离指定测试（传入测试 ID） | |
| `--release` | | 释放指定测试（传入测试 ID） | |
| `--threshold` | | Flaky 阈值（0-1），失败率超过此值视为 Flaky | 0.3 |

### 示例

```bash
# 查看 Flaky 测试统计
yuantest flaky

# 列出所有 Flaky 测试
yuantest flaky --list

# 列出所有 Flaky 测试（自定义阈值 50%）
yuantest flaky --list --threshold 0.5

# 列出已隔离的测试
yuantest flaky --quarantined

# 隔离特定测试
yuantest flaky --quarantine test-id-123

# 释放特定测试
yuantest flaky --release test-id-123
```

---

## 5. ui - 启动 Dashboard

启动 Web Dashboard 可视化界面。

### 用法

```bash
yuantest ui [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--port` | `-p` | 服务端口 | 5274 |
| `--output` | `-o` | 报告目录 | |
| `--data` | `-d` | 数据目录 | |

> 若未指定 `--output` 和 `--data`，将从配置文件加载 Dashboard 配置。

### 示例

```bash
# 默认端口启动
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定报告和数据目录
yuantest ui --port 5274 --output ./reports --data ./test-data
```

---

## 6. analyze - 分析测试结果

分析测试失败原因，支持 AI 诊断和聚类分析。

### 用法

```bash
yuantest analyze [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--id` | `-i` | 运行 ID（必填） | |
| `--json` | | 以 JSON 格式输出 | |
| `--ai` | | 启用 AI 诊断每个失败 | |
| `--cluster` | | 对失败进行聚类分析 | |
| `--filter` | | 按类别过滤失败（timeout/selector/network/assertion/frame/auth/unknown） | |

### 示例

```bash
# 分析特定运行的失败原因
yuantest analyze --id run_20240101_120000_abc123

# 启用 AI 诊断
yuantest analyze --id run_20240101_120000_abc123 --ai

# 以 JSON 格式输出
yuantest analyze --id run_20240101_120000_abc123 --json

# 按类别过滤
yuantest analyze --id run_20240101_120000_abc123 --filter timeout

# 聚类分析
yuantest analyze --id run_20240101_120000_abc123 --cluster

# 组合使用：AI 诊断 + 聚类分析 + JSON 输出
yuantest analyze --id run_20240101_120000_abc123 --ai --cluster --json
```

---

## 7. trace - Trace 文件管理

管理和查看 Playwright Trace 文件。

### 用法

```bash
yuantest trace [options]
```

不带任何选项时，列出所有 Trace 文件（最多显示 20 条）。

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--list` | `-l` | 列出所有 Trace 文件 | |
| `--dir` | | Trace 文件目录 | ./traces |
| `--view` | | 在查看器中打开指定 Trace 文件 | |
| `--port` | | Trace 查看器端口 | 9323 |
| `--clean` | | 清理 7 天前的旧 Trace 文件 | false |
| `--stats` | | 显示 Trace 统计信息 | false |

### 示例

```bash
# 列出所有 Trace 文件
yuantest trace

# 指定 Trace 目录
yuantest trace --dir ./my-traces

# 在查看器中打开 Trace 文件
yuantest trace --view ./traces/login-failure.zip

# 指定查看器端口
yuantest trace --view ./traces/login-failure.zip --port 9999

# 清理旧 Trace 文件
yuantest trace --clean

# 查看 Trace 统计信息
yuantest trace --stats
```

---

## 8. annotations - 注解扫描和管理

扫描和管理测试注解（@skip、@fixme、@fail、@slow 等）。

### 用法

```bash
yuantest annotations [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出报告路径 | ./annotation-report.json |

### 示例

```bash
# 扫描当前目录的注解
yuantest annotations

# 指定测试目录
yuantest annotations --test-dir ./e2e

# 指定输出报告路径
yuantest annotations --test-dir ./e2e --output ./reports/annotations.json
```

---

## 9. tags - 标签管理

扫描和管理测试标签。

### 用法

```bash
yuantest tags [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出报告路径 | ./tag-report.json |
| `--run` | | 运行指定标签的测试（逗号分隔） | |

### 示例

```bash
# 扫描当前目录的标签
yuantest tags

# 指定测试目录
yuantest tags --test-dir ./e2e

# 指定输出报告路径
yuantest tags --test-dir ./e2e --output ./reports/tags.json

# 运行指定标签的测试
yuantest tags --test-dir ./e2e --run smoke,regression
```

---

## 10. artifacts - 产物管理

管理测试产物（截图、视频等）。

### 用法

```bash
yuantest artifacts [options]
```

不带任何选项时，列出所有产物。

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--list` | `-l` | 列出所有产物 | |
| `--dir` | | 产物目录 | ./artifacts |
| `--stats` | | 显示产物统计信息 | false |
| `--clean` | | 清理 7 天前的旧产物 | false |
| `--run-id` | | 按运行 ID 过滤产物 | |

### 示例

```bash
# 列出所有产物
yuantest artifacts

# 指定产物目录
yuantest artifacts --dir ./my-artifacts

# 查看产物统计信息
yuantest artifacts --stats

# 按运行 ID 过滤
yuantest artifacts --run-id run_20240101_120000_abc123

# 清理旧产物
yuantest artifacts --clean
```

---

## 11. visual - 视觉测试管理

视觉测试管理，包括截图对比和基线管理。

### 用法

```bash
yuantest visual [options]
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--dir` | 视觉测试目录 | ./visual-testing |
| `--threshold` | 差异阈值（0-1） | 0.2 |
| `--update` | 使用当前截图更新所有基线 | false |
| `--report` | 生成视觉测试报告 | ./visual-report.json |
| `--stats` | 显示视觉测试统计信息 | false |

### 示例

```bash
# 查看视觉测试结果
yuantest visual

# 指定视觉测试目录
yuantest visual --dir ./screenshots

# 自定义差异阈值
yuantest visual --threshold 0.1

# 更新所有基线
yuantest visual --update

# 生成视觉测试报告
yuantest visual --report ./reports/visual.json

# 查看统计信息
yuantest visual --stats
```

---

## 12. show-report - 打开 HTML 报告

在浏览器中打开 Playwright HTML 报告。

### 用法

```bash
yuantest show-report [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--path` | `-p` | HTML 报告路径 | ./test-output/html-report |

### 示例

```bash
# 打开默认路径的 HTML 报告
yuantest show-report

# 指定报告路径
yuantest show-report --path ./reports/html-report
```

---

## 13. test-history - 查看测试历史

查看指定测试的运行历史记录。

### 用法

```bash
yuantest test-history <testId> [options]
```

`testId` 为必填的位置参数，指定要查看历史的测试 ID。

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--page` | 页码 | 1 |
| `--page-size` | 每页条数 | 10 |
| `--json` | 以 JSON 格式输出 | |

### 示例

```bash
# 查看测试历史
yuantest test-history login-test-001

# 查看第 2 页
yuantest test-history login-test-001 --page 2

# 自定义每页条数
yuantest test-history login-test-001 --page 1 --page-size 20

# 以 JSON 格式输出
yuantest test-history login-test-001 --json
```

---

## 14. error-patterns - 错误模式管理

管理错误模式，支持查看、添加和删除自定义错误模式。

### 用法

```bash
yuantest error-patterns [options]
```

不带任何选项时，列出所有错误模式。

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--list` | `-l` | 列出所有错误模式 | |
| `--custom` | | 仅列出自定义错误模式 | |
| `--add` | | 添加自定义错误模式（JSON 字符串） | |
| `--delete` | | 删除指定 ID 的自定义错误模式 | |

### 添加错误模式的 JSON 格式

添加错误模式时，`--add` 参数需要传入 JSON 字符串，包含以下必填字段：

| 字段 | 说明 |
|------|------|
| `id` | 模式唯一标识 |
| `category` | 错误类别 |
| `name` | 模式名称 |
| `regex` | 正则表达式数组 |
| `rootCauseTemplate` | 根因模板 |
| `suggestionsTemplate` | 建议模板 |
| `description` | 描述（可选） |
| `docLinks` | 文档链接（可选） |

### 示例

```bash
# 列出所有错误模式
yuantest error-patterns

# 仅列出自定义错误模式
yuantest error-patterns --custom

# 添加自定义错误模式
yuantest error-patterns --add '{"id":"custom-001","category":"network","name":"DNS解析失败","regex":["dns resolve failed","ENOTFOUND"],"rootCauseTemplate":"DNS解析失败：{hostname}","suggestionsTemplate":["检查DNS配置","验证网络连接"]}'

# 删除自定义错误模式
yuantest error-patterns --delete custom-001
```

---

## 15. llm-config - LLM 配置管理

管理 LLM 诊断配置，支持查看、设置、测试连接和查看状态。

### 用法

```bash
yuantest llm-config [options]
```

不带任何选项时，显示当前 LLM 配置信息（API Key 会被脱敏显示）。

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--show` | 显示当前 LLM 配置 | |
| `--set` | 更新 LLM 配置（JSON 字符串） | |
| `--test` | 测试 LLM 连接 | |
| `--status` | 查看 LLM 状态 | |

### 示例

```bash
# 查看当前 LLM 配置
yuantest llm-config

# 更新 LLM 配置
yuantest llm-config --set '{"enabled":true,"baseUrl":"https://api.openai.com/v1","model":"gpt-4","apiKey":"sk-xxx"}'

# 测试 LLM 连接
yuantest llm-config --test

# 查看 LLM 状态
yuantest llm-config --status
```

---

## 16. health - 健康度指标

查看测试健康度指标，包括通过率、Flaky 测试数等。

### 用法

```bash
yuantest health [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--json` | | 以 JSON 格式输出 | |
| `--limit` | `-l` | 分析最近运行次数 | 10 |

### 示例

```bash
# 查看测试健康度
yuantest health

# 分析最近 20 次运行
yuantest health --limit 20

# 以 JSON 格式输出
yuantest health --json
```

---

## 17. prediction - 失败预测

查看测试失败预测，包括高风险测试和执行时长异常。

### 用法

```bash
yuantest prediction [options]
```

不带任何选项时，列出所有高风险测试。

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--high-risk` | 列出高风险测试 | |
| `--test` | 查看指定测试的预测 | |
| `--duration-anomalies` | 查看执行时长异常 | |
| `--json` | 以 JSON 格式输出 | |

### 示例

```bash
# 列出高风险测试
yuantest prediction

# 列出高风险测试（显式指定）
yuantest prediction --high-risk

# 查看特定测试的预测
yuantest prediction --test login-test-001

# 查看执行时长异常
yuantest prediction --duration-anomalies

# 以 JSON 格式输出
yuantest prediction --json
```

---

## 18. correlations - 关联分析

查看测试关联分析，包括因果图和关联组。

### 用法

```bash
yuantest correlations [options]
```

不带任何选项时，显示测试关联组信息。

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--causal-graph` | 显示因果图摘要 | |
| `--json` | 以 JSON 格式输出 | |

### 示例

```bash
# 查看测试关联组
yuantest correlations

# 查看因果图
yuantest correlations --causal-graph

# 以 JSON 格式输出
yuantest correlations --json

# 因果图 + JSON 输出
yuantest correlations --causal-graph --json
```

---

## 19. rerun - 重跑测试

重新运行之前某次运行中的特定测试。

### 用法

```bash
yuantest rerun <runId> <testId> [options]
```

`runId` 和 `testId` 为必填的位置参数。

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--json` | 以 JSON 格式输出结果 | |

### 示例

```bash
# 重跑特定测试
yuantest rerun run_20240101_120000_abc123 login-test-001

# 以 JSON 格式输出重跑结果
yuantest rerun run_20240101_120000_abc123 login-test-001 --json
```

---

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 测试失败或命令执行出错 |

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `YUANTEST_PORT` | 默认 Dashboard 端口 |
| `YUANTEST_OUTPUT` | 默认输出目录 |
| `YUANTEST_DATA` | 默认数据目录 |
