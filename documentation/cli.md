# CLI 命令参考

YuanTest Playwright 提供完整的命令行工具。

## 全局命令

### 查看帮助

```bash
yuantest --help
```

### 查看版本

```bash
yuantest --version
```

## run - 运行测试

执行测试并生成报告。

```bash
yuantest run [options]
```

### 参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--project` | `-p` | 项目名称 | test-project |
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出目录 | ./test-output |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表（逗号分隔） | chromium |
| `--base-url` | | 基础 URL | |
| `--timeout` | | 超时时间(ms) | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--grep` | | 运行匹配的测试 | |
| `--update-snapshots` | | 更新快照 | false |

### 示例

```bash
# 基本用法
yuantest run --test-dir ./

# 指定项目名称和输出目录
yuantest run --project my-app --test-dir ./e2e --output ./reports

# 并行执行
yuantest run --test-dir ./ --shards 4 --workers 2

# 多浏览器测试
yuantest run --test-dir ./ --browsers chromium,firefox,webkit

# 运行匹配的测试
yuantest run --test-dir ./ --grep "smoke"

# 设置超时和重试
yuantest run --test-dir ./ --timeout 60000 --retries 2
```

## ui - 启动 Dashboard

启动 Web Dashboard 可视化界面。

```bash
yuantest ui [options]
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port` | 服务端口 | 5274 |
| `--output` | 报告目录 | ./test-output |
| `--data` | 数据目录 | ./test-data |

### 示例

```bash
# 默认端口
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定目录
yuantest ui --port 5274 --output ./reports --data ./test-data
```

## orchestrate - 编排预览

预览测试分片分配计划（不执行测试）。

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
# 查看分片分配计划
yuantest orchestrate --test-dir ./ --shards 4
```

## report - 查看报告

查看测试报告。

```bash
yuantest report [options]
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--limit` | 显示数量 | 10 |
| `--id` | 特定运行 ID | |

### 示例

```bash
# 查看最近 10 条报告
yuantest report --limit 10

# 查看特定报告
yuantest report --id run_20240101_120000_abc123
```

## flaky - Flaky 测试管理

管理不稳定测试。

```bash
yuantest flaky [options]
```

### 参数

| 参数 | 说明 |
|------|------|
| `--list` | 列出所有 Flaky 测试 |
| `--quarantined` | 列出已隔离的测试 |
| `--quarantine <id>` | 隔离特定测试 |
| `--release <id>` | 释放特定测试 |
| `--threshold <n>` | 自定义失败率阈值 |
| `--stats` | 显示统计信息 |

### 示例

```bash
# 查看 Flaky 统计
yuantest flaky

# 列出所有 Flaky 测试
yuantest flaky --list

# 列出已隔离的测试
yuantest flaky --quarantined

# 隔离特定测试
yuantest flaky --quarantine test-id-123

# 释放特定测试
yuantest flaky --release test-id-123

# 自定义阈值（失败率 > 50%）
yuantest flaky --list --threshold 0.5

# 显示统计信息
yuantest flaky --stats
```

## analyze - 失败分析

分析测试失败原因。

```bash
yuantest analyze [options]
```

### 参数

| 参数 | 说明 |
|------|------|
| `--id <runId>` | 运行 ID |

### 示例

```bash
# 分析特定运行的失败原因
yuantest analyze --id run_20240101_120000_abc123
```

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 测试失败 |
| 2 | 配置错误 |
| 3 | 运行时错误 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `YUANTEST_PORT` | 默认 Dashboard 端口 |
| `YUANTEST_OUTPUT` | 默认输出目录 |
| `YUANTEST_DATA` | 默认数据目录 |
