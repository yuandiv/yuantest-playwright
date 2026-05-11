# 配置文件

YuanTest Playwright 支持通过配置文件自定义行为。

## 配置文件位置

YuanTest 会按以下顺序查找配置文件：

1. `yuantest.config.ts`
2. `yuantest.config.js`
3. `yuantest.config.mts`
4. `yuantest.config.mjs`

## 基本配置

创建 `yuantest.config.ts` 文件：

```typescript
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  project: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  shards: 4,
  browsers: ['chromium', 'firefox'],
  timeout: 60000,
  retries: 2,
});
```

## 完整配置选项

```typescript
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  // 基本配置
  project: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  
  // 执行配置
  shards: 4,
  workers: 2,
  browsers: ['chromium', 'firefox', 'webkit'],
  timeout: 60000,
  retries: 2,
  
  // Flaky 配置
  flaky: {
    threshold: 0.3,
    autoQuarantine: false,
    historyLimit: 100,
  },
  
  // Dashboard 配置
  dashboard: {
    port: 5274,
    open: true,
    cors: true,
  },
  
  // 报告配置
  reporter: {
    html: true,
    json: true,
    outputDir: './reports',
  },
  
  // 存储配置
  storage: {
    type: 'filesystem',
    dataDir: './test-data',
  },
  
  // 日志配置
  logging: {
    level: 'info',
    file: './logs/yuantest.log',
  },
});
```

## 配置选项说明

### 基本配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `project` | string | 'test-project' | 项目名称 |
| `testDir` | string | './' | 测试目录 |
| `outputDir` | string | './test-output' | 输出目录 |

### 执行配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `shards` | number | 1 | 分片数量 |
| `workers` | number | 1 | Worker 数量 |
| `browsers` | string[] | ['chromium'] | 浏览器列表 |
| `timeout` | number | 30000 | 超时时间(ms) |
| `retries` | number | 0 | 重试次数 |

### Flaky 配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `threshold` | number | 0.3 | Flaky 检测阈值 |
| `autoQuarantine` | boolean | false | 自动隔离 Flaky 测试 |
| `historyLimit` | number | 100 | 历史记录限制 |

### Dashboard 配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | number | 5274 | 服务端口 |
| `open` | boolean | false | 自动打开浏览器 |
| `cors` | boolean | true | 启用 CORS |

## 环境变量覆盖

配置选项可以通过环境变量覆盖：

```bash
# 设置端口
YUANTEST_DASHBOARD_PORT=8080 yuantest ui

# 设置输出目录
YUANTEST_OUTPUT_DIR=./reports yuantest run
```

## 与 Playwright 配置合并

YuanTest 会自动检测并合并 `playwright.config.ts` 中的配置：

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
  },
});
```

YuanTest 会读取这些配置并与其默认值合并。

## 配置验证

配置文件会在加载时进行验证，无效配置会抛出错误：

```typescript
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  // 错误：shards 必须是正整数
  shards: -1,
});
```

## TypeScript 支持

配置文件支持完整的 TypeScript 类型提示：

```typescript
import { defineConfig, Config } from 'yuantest-playwright';

const config: Config = {
  project: 'my-app',
  testDir: './e2e',
};

export default defineConfig(config);
```

## 多环境配置

支持根据环境变量加载不同配置：

```typescript
import { defineConfig } from 'yuantest-playwright';

const isCI = process.env.CI === 'true';

export default defineConfig({
  project: 'my-app',
  testDir: './e2e',
  shards: isCI ? 8 : 2,
  retries: isCI ? 2 : 0,
  dashboard: {
    port: isCI ? 5274 : 3000,
  },
});
```
