# 命令行使用

YuanTest Playwright 提供完整的 CLI 工具，支持测试执行、报告查看、Flaky 管理等功能。

## 查看帮助

```bash
yuantest --help
yuantest run --help
yuantest ui --help
```

## 测试执行

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

### 执行参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--project` | `-p` | 项目名称 | test-project |
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出目录 | ./test-output |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表 | chromium |
| `--base-url` | | 基础 URL | |
| `--timeout` | | 超时时间(ms) | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--grep` | | 运行匹配的测试 | |
| `--update-snapshots` | | 更新快照 | false |

## 编排预览

查看测试分片分配计划（不执行测试）：

```bash
# 查看测试分片分配计划
yuantest orchestrate --test-dir ./ --shards 4
```

## 查看报告

```bash
# 查看最近 10 条报告
yuantest report --limit 10

# 查看特定报告
yuantest report --id run_20240101_120000_abc123
```

## Flaky 测试管理

```bash
# 查看 Flaky 统计
yuantest flaky

# 列出所有 Flaky 测试
yuantest flaky --list

# 列出已隔离的测试
yuantest flaky --quarantined

# 隔离特定测试
yuantest flaky --quarantine <test-id>

# 释放特定测试
yuantest flaky --release <test-id>

# 自定义阈值
yuantest flaky --list --threshold 0.5
```

## 失败分析

```bash
# 分析特定运行的失败原因
yuantest analyze --id run_20240101_120000_abc123
```

## 启动 Dashboard

```bash
# 默认端口 5274
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定目录
yuantest ui --port 5274 --output ./reports --data ./test-data
```

## 常见用法示例

### 开发调试

```bash
# 运行单个测试文件
yuantest run tests/login.spec.ts

# 运行匹配的测试
yuantest run --grep "登录"

# 启动 Dashboard 查看结果
yuantest ui
```

### CI/CD 环境

```bash
# 完整测试套件
yuantest run --test-dir ./e2e --shards 4 --retries 2 --output ./reports

# 隔离 Flaky 测试后运行
yuantest flaky --quarantine-all
yuantest run --test-dir ./e2e
```

### 多浏览器测试

```bash
# 在所有浏览器上运行
yuantest run --test-dir ./e2e --browsers chromium,firefox,webkit

# 仅在特定浏览器上运行
yuantest run --test-dir ./e2e --browsers chromium
```
