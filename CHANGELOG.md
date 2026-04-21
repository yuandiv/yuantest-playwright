# 更新日志

本文件记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [1.0.5] - 2026-04-21

### 修复

#### 功能修复

- **执行逻辑** - 不再使用正则表达式匹配测试标题，改为收集测试用例的文件位置信息，遍历 describe 块收集所有测试的位置

---

## [1.0.4] - 2026-04-21

### 修复

#### 测试修复

- **E2E 测试** - 修复 CLI E2E 测试兼容性问题
  - 更新测试用例以适配新的 API 响应格式
  - 改进测试超时处理

#### 配置修复

- **ConfigLoader** - 修复配置加载中的路径解析问题
  - 改进配置文件的搜索逻辑
  - 增强错误处理机制

- **PlaywrightConfigMerger** - 修复配置合并的边界情况
  - 处理缺失配置项的默认值
  - 优化配置验证逻辑

#### 单元测试

- **Trace 测试** - 修复 Trace 管理器的单元测试
  - 添加缺失的模拟数据
  - 修复断言逻辑

---

## [1.0.3] - 2026-04-21

### 新增

#### 文档生成

- **TypeDoc 配置** - 添加 TypeDoc 文档生成支持
  - 配置 `typedoc.json` 支持中文文档生成
  - 添加 `docs` 和 `docs:watch` 脚本命令
  - 支持自定义导航链接和侧边栏链接
  - 配置代码可见性过滤器

#### 配置增强

- **PlaywrightConfigMerger** - 增强配置合并功能
  - 支持 `PLAYWRIGHT_*` 环境变量覆盖
  - 改进项目路径验证逻辑
  - 添加配置验证结果缓存
  - 优化默认配置与项目配置的合并策略

### 变更

#### 配置加载器

- **ConfigLoader** - 改进配置加载机制
  - 优化配置文件的搜索优先级
  - 改进配置解析错误处理
  - 支持更多配置格式变体

#### 测试发现

- **Discovery** - 优化测试发现模块
  - 改进测试文件扫描性能
  - 优化测试目录解析逻辑
  - 增强对复杂项目结构的支持

#### UI 服务器

- **DashboardServer** - 改进服务器配置处理
  - 优化测试目录切换逻辑
  - 改进配置验证反馈
  - 增强错误信息本地化

#### Dashboard UI

- **App.tsx** - 优化主应用组件
  - 改进状态管理逻辑
  - 优化组件渲染性能
  - 简化代码结构

- **ExecutorDialog** - 改进执行器对话框
  - 优化用户交互体验
  - 改进错误提示

- **HealthDashboard** - 改进健康状态面板
  - 优化数据展示逻辑
  - 改进组件性能

#### 国际化

- **i18n 模块** - 改进国际化支持
  - 优化语言切换逻辑
  - 更新翻译内容

#### API 服务

- **API** - 改进前端 API 服务
  - 优化请求处理逻辑
  - 改进错误处理

### 文档

- **README** - 更新中英文文档
  - 添加更详细的功能说明
  - 改进使用示例
  - 更新路线图

---

## [1.0.2] - 2026-04-16

### 新增

#### 测试产物管理

- **ArtifactManager** - 完整的测试产物管理模块
  - `discoverArtifacts()` - 扫描目录发现所有测试产物
  - `getArtifact()` - 根据 ID 或路径获取单个产物
  - `getArtifactContent()` - 读取产物文件内容
  - `deleteArtifact()` - 删除指定的产物文件
  - `cleanArtifacts()` - 清理过期产物（默认 7 天）
  - `getArtifactsByType()` - 按类型筛选产物（截图/视频/追踪）
  - `getArtifactsByTest()` - 按测试 ID 筛选产物
  - `getArtifactStats()` - 获取产物统计信息
  - 自动文件类型检测（图片、视频、追踪文件）
  - 可通过 `maxFileSize` 配置文件大小过滤

### 变更

#### 存储改进

- **FilesystemStorage.mkdir()** - 修复目录创建的竞态条件
  - 创建目录前添加存在性检查
  - 正确处理并发创建时的 `EEXIST` 错误
  - 使用 `{ recursive: true }` 选项安全创建嵌套目录

#### 测试改进

- **测试优化** - 添加模拟以防止实际 Playwright 测试执行
  - 在集成测试和单元测试中模拟 `runPlaywrightTests()`
  - 提高测试速度并专注于逻辑验证

### 修复

- **.gitignore 规则** - 修正产物文件夹忽略模式
  - 添加前导 `/` 仅忽略根目录文件夹：`/artifacts/`、`/traces/`、`/visual-testing/`、`/html-report/`
  - 防止意外忽略同名的子目录

---

## [1.0.1] - 2026-04-15

### 新增

#### 配置管理

- **PlaywrightConfigMerger** - 新的配置验证和合并系统
  - 自动发现 `playwright.config.ts/js/mts/mjs` 文件
  - 配置文件验证（存在性和可解析性）
  - 用户配置与框架默认值的智能合并
  - 自动注入必需的报告器（html/json）

#### 国际化 (i18n)

- **i18n 模块** - 完整的国际化支持
  - 支持中文 (`zh`) 和英文 (`en`)
  - 通过 `setLang()` 进行全局语言切换
  - 翻译函数 `t(key, lang?)` 支持动态语言
  - 新增翻译键：`configNotFound`、`configParseFailed`、`testDirNotFound`、`executorAlreadyRunning`

### 变更

#### API 增强

- **API 响应结构** - 增强带有详细错误信息的 API 响应
  - `startRun()` 和 `rerunTest()` 现在返回 `StartRunResult` 对象而非 `boolean`
  - 新接口：`{ success: boolean; error?: string }`
  - 提供详细错误信息以便更好地调试

#### 配置变更

- **默认端口** - 默认 UI 端口从 3000 改为 5274
  - 避免与常见开发服务器冲突（如 React Dev Server）
  - 更新所有文档和示例

#### 前端改进

- **仪表板 UI** - 增强用户体验
  - 移除"刷新测试用例"按钮（切换目录时自动刷新）
  - 使用 `formatStartError()` 函数改进错误处理
  - 更好的测试目录切换逻辑并提供验证反馈

#### 后端增强

- **UI 服务器** - 改进请求处理
  - 添加语言中间件以自动检测语言
  - 使用 `PlaywrightConfigMerger.validateProjectPath()` 重构测试目录验证
  - 增强 test discovery API，添加 `configValidation` 字段

- **测试发现** - 更好的配置处理
  - 使用配置文件目录作为工作目录
  - 错误时返回验证结果而非空列表

- **执行器** - 动态配置管理
  - 动态配置合并而非硬编码路径
  - 基于配置位置正确解析工作目录

### 修复

- **类型安全** - 在 CLI 中添加 `Artifact` 类型导入
- **错误追踪** - 在配置加载器的错误对象中添加 `cause` 属性
- **测试断言** - 更新测试消息以匹配新的 CLI 输出

### 依赖

- **FontAwesome** - 从 CDN 迁移到本地包
  - 用 `@fortawesome/fontawesome-free: ^7.2.0` 替换 CDN 链接
  - 提高稳定性并减少外部依赖

### 破坏性变更

- **默认端口**：端口从 3000 改为 5274 - 需更新脚本和配置
- **API 响应**：`startRun()` 和 `rerunTest()` 现在返回 `{ success, error? }` 而非 `boolean`
- **测试目录验证**：使用新的 `validateProjectPath()` 方法替代旧的验证逻辑

---

## [1.0.0] - 2026-04-11

### 新增

#### 核心功能

- **Orchestrator** - 智能测试编排，支持自动测试发现和智能分片
  - 支持跨多个分片的分布式测试执行
  - 基于测试历史时长的负载均衡
  - `ShardOptimizer` 用于智能测试分配

- **Executor** - 通过 Playwright CLI 的测试执行引擎
  - 支持并行测试执行
  - 失败测试的自动重试机制
  - 多浏览器测试（chromium、firefox、webkit）
  - 通过事件实时进度追踪
  - `ParallelExecutor` 用于并发测试运行

- **Reporter** - 全面的测试报告系统
  - 使用 EJS 模板生成 HTML 报告
  - JSON 报告输出
  - 失败分析，包含分类和修复建议
  - 测试产物管理（截图、视频、追踪）

- **不稳定测试管理** - 自动检测和隔离不稳定测试
  - 基于可配置阈值的不稳定测试检测
  - 隔离问题测试的隔离机制
  - 历史不稳定测试追踪
  - 用于隔离/释放操作的 REST API

- **Web 仪表板** - 测试管理的可视化界面
  - 通过 WebSocket 实时显示测试进度
  - 历史测试运行可视化
  - 不稳定测试管理 UI
  - 失败分析仪表板
  - 包含 15+ 端点的 REST API

- **CLI 工具** - 完整的命令行界面
  - `yuantest run` - 使用各种选项执行测试
  - `yuantest orchestrate` - 预览测试分配计划
  - `yuantest report` - 查看测试报告
  - `yuantest flaky` - 管理不稳定测试
  - `yuantest analyze` - 分析测试失败
  - `yuantest ui` - 启动 Web 仪表板

#### 附加功能

- **追踪管理** - Playwright 追踪文件管理和组织
- **注解支持** - 解析并遵守测试注解（skip、only、fail、slow、fixme、todo）
- **标签管理** - 用于筛选和组织的测试标签系统
- **视觉测试** - 集成 pixelmatch 的截图对比
- **产物管理** - 测试产物的有序存储
- **存储提供者** - 可插拔的存储系统（内存和文件系统实现）
- **缓存系统** - LRU 和 TTL 缓存实现
- **配置加载器** - 从 `yuantest.config.ts` 加载和合并配置
- **验证** - 基于 Zod 的配置验证
- **中间件** - 用于错误处理和验证的 Express 中间件工具

### 技术细节

- 使用 TypeScript 5.9+ 构建
- 目标 ES2020
- CommonJS 模块输出
- 包含完整类型声明
- 支持 Node.js >= 16.0.0

### 依赖

- `@playwright/test` ^1.40.0
- `express` ^4.18.2
- `ws` ^8.14.2
- `ejs` ^5.0.1
- `commander` ^11.1.0
- `zod` ^3.25.76
- `pixelmatch` ^7.1.0
- `chalk` ^4.1.2
- `ora` ^5.4.1
- `dayjs` ^1.11.10

### 文档

- 包含使用示例的详细 README
- API 编程指南
- CLI 命令参考
- REST API 文档

### 测试

- 核心模块的单元测试
- orchestrator-executor 流程的集成测试
- CLI 功能的 E2E 测试
- 带覆盖率阈值的 Jest 配置

---

## 未来路线图

### 计划功能

- [ ] 自定义报告器和执行器的插件系统
- [ ] 云存储提供者（S3、GCS、Azure Blob）
- [ ] 跨多台机器的分布式测试执行
- [ ] AI 驱动的失败分析和修复建议
- [ ] Slack/Teams 通知集成
- [ ] GitHub Actions 集成
- [ ] 性能基准测试和回归检测
- [ ] 测试用例管理集成

---

[1.0.5]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.5
[1.0.4]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.4
[1.0.3]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.3
[1.0.2]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.2
[1.0.1]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.1
[1.0.0]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.0
