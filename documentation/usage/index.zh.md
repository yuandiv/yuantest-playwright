# 使用指南

本部分详细介绍 YuanTest Playwright 的各种使用方式。

## 目录

- [Web UI 使用](web-ui.md) - Dashboard 可视化界面的详细使用指南
- [命令行使用](cli.md) - CLI 命令的详细说明
- [CI/CD 集成](cicd.md) - 集成到持续集成/持续部署流程

## 深度指南

如需了解特定领域的深入内容，请参考深度指南：

- [Flaky 测试管理](../guides/flaky-management.md) - 分类算法、根因分析、关联分析、趋势追踪、隔离策略、健康评分、因果图、参数自定义
- [AI 智能诊断](../guides/ai-diagnosis.md) - 上下文富集、知识库、Agent 推理、置信度校准、流式诊断、LLM 配置

## 推荐工作流程

### 开发阶段

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

4. **AI 诊断失败测试**
   - 在 Dashboard 中点击"AI 诊断"
   - 或使用 CLI：`yuantest analyze --id <run-id> --ai`

### CI/CD 阶段

1. **使用命令行执行完整测试套件**
   ```bash
   yuantest run --test-dir ./ --output ./test-reports --shards 4
   ```

2. **检查 Flaky 测试健康度**
   ```bash
   yuantest health --json
   yuantest prediction --high-risk --json
   ```

3. **上传报告作为 artifact**
   - GitHub Actions: `actions/upload-artifact`
   - GitLab CI: `artifacts`

4. **可选：部署 Dashboard 服务器**
   - 在服务器上运行 `yuantest ui`
   - 团队成员可以随时查看历史报告

### Flaky 测试治理

1. **识别 Flaky 测试**
   ```bash
   yuantest flaky --list --json
   yuantest correlations
   ```

2. **分析根因**
   ```bash
   yuantest analyze --id <run-id> --ai
   ```

3. **隔离和监控**
   - 在 Dashboard 中隔离 Flaky 测试
   - 设置监控阈值和隔离参数
   - 定期查看健康度评分

4. **验证修复**
   ```bash
   yuantest rerun <run-id> <test-id>
   yuantest test-history <test-id>
   ```
