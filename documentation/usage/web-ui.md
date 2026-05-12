# Web UI 使用

YuanTest Playwright 提供了强大的 Web Dashboard，让测试管理更加直观高效。

## 启动 Dashboard

```bash
# 默认端口 5274
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 指定报告和数据目录
yuantest ui --port 5274 --output ./test-reports --data ./test-data
```

启动后访问 **http://localhost:5274** 查看可视化界面。

## Dashboard 功能介绍

### 1. 概览页面

Dashboard 首页展示关键指标：

- **测试运行统计**：总运行次数、通过率趋势
- **Flaky 测试统计**：不稳定测试数量和占比
- **执行时间趋势**：平均执行时间变化
- **最近运行记录**：快速查看最近的测试结果

### 2. Test Runs（测试运行记录）

查看所有历史测试运行：

- **运行列表**：显示每次运行的详细信息
- **筛选和搜索**：按状态、时间筛选测试运行
- **运行详情**：点击查看完整的测试结果
- **报告下载**：下载 HTML 或 JSON 格式的报告

### 3. Flaky Tests（不稳定用例管理）

智能管理不稳定用例：

- **自动检测**：基于历史数据自动识别 Flaky 测试
- **失败率统计**：显示每个测试的失败率
- **一键隔离**：隔离不稳定的测试，避免影响 CI/CD
- **释放测试**：将隔离的测试重新加入测试套件

### 4. Failure Analysis（失败分析）

深度分析失败原因：

- **自动分类**：智能识别超时、断言失败、元素未找到等
- **失败统计**：显示各类失败的数量和占比
- **修复建议**：提供针对性的失败修复建议
- **历史趋势**：追踪失败原因的变化趋势

### 5. 实时进度

测试执行时实时监控：

- **进度条**：显示测试执行进度
- **实时日志**：查看测试输出日志
- **测试状态**：实时更新通过、失败、跳过的测试数量
- **当前测试**：显示正在执行的测试

## Web UI 执行测试

### 通过界面执行测试

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

## Web UI 高级功能

### Flaky 测试隔离

1. 在 Flaky Tests 页面查看不稳定用例列表
2. 点击测试旁边的"隔离"按钮
3. 被隔离的测试不会在后续运行中执行
4. 可以在"已隔离用例"中查看和管理

### 失败分析

1. 在 Test Runs 页面点击某次运行
2. 切换到"失败分析"标签
3. 查看失败原因分类和统计
4. 查看每个失败测试的详细信息和建议

### Trace 查看

1. 在测试详情页面点击"Trace"按钮
2. 自动打开 Playwright Trace Viewer
3. 查看测试执行的完整时间线
4. 查看每个步骤的截图和 DOM 快照

### 产物管理

- **截图**：自动收集失败测试的截图
- **视频**：自动收集失败测试的视频
- **Trace**：自动收集测试执行轨迹
- **统一存储**：所有产物统一存储在 `test-results/` 目录

## REST API

Dashboard 提供 RESTful API，方便与其他系统集成：

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/stats` | 整体统计 |
| GET | `/api/v1/runs` | 运行列表 |
| GET | `/api/v1/runs/:id` | 运行详情 |
| GET | `/api/v1/flaky` | Flaky 测试列表 |
| GET | `/api/v1/flaky/quarantined` | 已隔离测试 |
| POST | `/api/v1/flaky/:id/quarantine` | 隔离测试 |
| POST | `/api/v1/flaky/:id/release` | 释放测试 |
| GET | `/api/v1/flaky/stats` | Flaky 统计 |
| GET | `/api/v1/analysis/:runId` | 失败分析 |
| GET | `/api/v1/progress` | 实时进度 |
| GET | `/api/v1/tests` | 测试发现 |
| GET | `/api/v1/tests/stats` | 测试统计 |
| POST | `/api/v1/runs` | 启动测试运行 |
| POST | `/api/v1/runs/stop` | 停止运行 |
| POST | `/api/v1/runs/:runId/tests/:testId/rerun` | 重跑单个测试 |
| POST | `/api/v1/runs/:runId/batch-rerun` | 批量重跑 |
| GET | `/api/v1/tests/:testId/history` | 测试历史 |
| POST | `/api/v1/diagnosis` | AI 诊断 |
| POST | `/api/v1/diagnosis/stream` | AI 诊断(流式) |
| GET | `/api/v1/diagnosis/persisted` | 持久化诊断 |
| POST | `/api/v1/diagnosis/cluster` | 聚类诊断 |
| GET | `/api/v1/error-patterns` | 错误模式列表 |
| POST | `/api/v1/error-patterns` | 添加错误模式 |
| DELETE | `/api/v1/error-patterns/:id` | 删除错误模式 |
| GET | `/api/v1/llm/config` | LLM 配置 |
| PUT | `/api/v1/llm/config` | 更新 LLM 配置 |
| GET | `/api/v1/llm/status` | LLM 状态 |
| POST | `/api/v1/llm/test-connection` | 测试 LLM 连接 |
| GET | `/api/v1/flaky/trends` | Flaky 趋势 |
| GET | `/api/v1/flaky/health` | Flaky 健康度 |
| GET | `/api/v1/flaky/prediction/:testId` | 失败预测 |
| GET | `/api/v1/flaky/duration-anomalies` | 执行时间异常 |
| GET | `/api/v1/causal-graph` | 因果图 |
| GET | `/api/v1/impact-analysis/:testId` | 影响分析 |
| GET | `/api/v1/health/metrics` | 健康指标 |
| GET | `/api/v1/preferences` | 用户偏好 |
| POST | `/api/v1/preferences` | 保存偏好 |
