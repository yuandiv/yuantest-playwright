# 使用指南

本部分详细介绍 YuanTest Playwright 的各种使用方式。

## 目录

- [Web UI 使用](web-ui.md) - Dashboard 可视化界面的详细使用指南
- [命令行使用](cli.md) - CLI 命令的详细说明
- [CI/CD 集成](cicd.md) - 集成到持续集成/持续部署流程

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

### CI/CD 阶段

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
