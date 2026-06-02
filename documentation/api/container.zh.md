# ServiceContainer API 参考

ServiceContainer 是一个轻量级依赖注入容器，管理服务的注册、解析、生命周期和分层作用域。它支持单例和瞬态生命周期、循环依赖检测、子容器以及可变引用更新。

---

## 构造函数

```typescript
new ServiceContainer(parent?: ServiceContainer)
```

### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `parent` | `ServiceContainer` | `null` | 可选的父容器，用于分层解析 |

### 示例

```typescript
import { ServiceContainer } from 'yuantest-playwright';

const container = new ServiceContainer();

const child = container.createChild();
```

---

## 实例方法

### `register<T>(token: symbol, factory: Factory<T>, lifecycle?: Lifecycle): this`

向容器注册服务工厂。如果 token 已注册则抛出错误。工厂函数接收容器实例作为参数，支持在工厂内解析依赖。

```typescript
import { TOKENS } from 'yuantest-playwright';

container.register(TOKENS.StorageProvider, (c) => new FilesystemStorage(), 'singleton');

container.register(TOKENS.LRUCache, (c) => new LRUCache({ maxSize: 100 }), 'singleton');

container.register(TOKENS.AgentService, (c) => new AgentService(), 'transient');
```

### `resolve<T>(token: symbol): T`

根据 token 解析服务实例。单例服务在首次解析后缓存，瞬态服务每次调用都会创建新实例。如果服务未注册或检测到循环依赖则抛出错误。如果当前容器中未找到 token，则向父容器回退解析。

```typescript
const storage = container.resolve<StorageProvider>(TOKENS.StorageProvider);

const cache = container.resolve<LRUCache>(TOKENS.LRUCache);
```

### `has(token: symbol): boolean`

检查给定 token 是否已注册服务。会搜索当前容器及其父容器链。

```typescript
if (container.has(TOKENS.LLMService)) {
  const llm = container.resolve<LLMService>(TOKENS.LLMService);
}
```

### `override<T>(token: symbol, instance: T): this`

使用特定实例覆盖已解析或已注册的服务。适用于测试或运行时替换服务。实例直接存储在单例缓存中。

```typescript
const mockStorage = new MemoryStorage();

container.override(TOKENS.StorageProvider, mockStorage);
```

### `updateRef<T>(token: symbol, value: T): this`

更新由给定 token 解析的 `MutableRef` 的 `current` 值。这是更新容器中可变引用值的便捷方法。

```typescript
container.updateRef(TOKENS.OutputDir, '/new/output/path');

container.updateRef(TOKENS.DataDir, '/new/data/path');
```

### `reset(): void`

清除所有已解析的单例实例并重置解析追踪。注册信息会保留，服务可以从工厂重新解析。

```typescript
container.reset();
```

### `createChild(): ServiceContainer`

创建一个继承当前容器注册的子容器。子容器可以从父容器解析服务，但维护自己的实例缓存。

```typescript
const child = container.createChild();

child.register(TOKENS.Port, () => 8080);
```

---

## MutableRef

`MutableRef` 是一个简单的包装器，持有一个可变值。在容器中用于存储可能在运行时更改的配置值。

### 构造函数

```typescript
new MutableRef<T>(current: T)
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `current` | `T` | 引用持有的初始值 |

### 静态方法

#### `MutableRef.of<T>(value: T): MutableRef<T>`

创建一个包装给定值的新 `MutableRef` 实例。

```typescript
import { MutableRef } from 'yuantest-playwright';

const ref = MutableRef.of('./test-reports');

console.log(ref.current);

ref.current = './other-reports';
```

### 实例属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `current` | `T` | 引用持有的当前值（可读写） |

---

## TOKENS

`TOKENS` 是一个常量对象，提供所有核心服务的唯一 `Symbol` 键。在注册或解析容器服务时使用这些 token。

### 可用 Token

| Token | Symbol | 说明 |
|------|--------|------|
| `TOKENS.StorageProvider` | `Symbol.for('StorageProvider')` | 存储提供者实例 |
| `TOKENS.LRUCache` | `Symbol.for('LRUCache')` | LRU 缓存实例 |
| `TOKENS.TestDiscovery` | `Symbol.for('TestDiscovery')` | 测试发现服务 |
| `TOKENS.PlaywrightConfigMerger` | `Symbol.for('PlaywrightConfigMerger')` | Playwright 配置合并器 |
| `TOKENS.LLMConfig` | `Symbol.for('LLMConfig')` | LLM 配置 |
| `TOKENS.LLMService` | `Symbol.for('LLMService')` | LLM 服务实例 |
| `TOKENS.ToolRegistry` | `Symbol.for('ToolRegistry')` | 工具注册表 |
| `TOKENS.AgentService` | `Symbol.for('AgentService')` | Agent 服务 |
| `TOKENS.ChatService` | `Symbol.for('ChatService')` | 聊天服务 |
| `TOKENS.MCPConfigService` | `Symbol.for('MCPConfigService')` | MCP 配置服务 |
| `TOKENS.DiagnosisService` | `Symbol.for('DiagnosisService')` | 诊断服务 |
| `TOKENS.FlakyTestManager` | `Symbol.for('FlakyTestManager')` | 不稳定测试管理器 |
| `TOKENS.Reporter` | `Symbol.for('Reporter')` | 报告器实例 |
| `TOKENS.RealtimeReporter` | `Symbol.for('RealtimeReporter')` | 实时报告器 |
| `TOKENS.TraceManager` | `Symbol.for('TraceManager')` | 追踪管理器 |
| `TOKENS.ArtifactManager` | `Symbol.for('ArtifactManager')` | 产物管理器 |
| `TOKENS.AnnotationManager` | `Symbol.for('AnnotationManager')` | 注解管理器 |
| `TOKENS.TagManager` | `Symbol.for('TagManager')` | 标签管理器 |
| `TOKENS.VisualTestingManager` | `Symbol.for('VisualTestingManager')` | 视觉测试管理器 |
| `TOKENS.Port` | `Symbol.for('Port')` | 服务器端口号 |
| `TOKENS.OutputDir` | `Symbol.for('OutputDir')` | 输出目录（MutableRef） |
| `TOKENS.DataDir` | `Symbol.for('DataDir')` | 数据目录（MutableRef） |
| `TOKENS.TestDir` | `Symbol.for('TestDir')` | 测试目录（MutableRef） |

```typescript
import { TOKENS } from 'yuantest-playwright';

container.register(TOKENS.StorageProvider, (c) => getStorage(), 'singleton');
```

---

## registerCoreServices

`registerCoreServices` 是一个辅助函数，将所有内置服务及其正确的依赖关系注册到容器中。

### 签名

```typescript
registerCoreServices(container: ServiceContainer, options: ContainerOptions): void
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `container` | `ServiceContainer` | 要注册服务的容器 |
| `options` | `ContainerOptions` | 核心服务的配置选项 |

### ContainerOptions

| 属性 | 类型 | 说明 |
|------|------|------|
| `port` | `number` | 服务器监听端口 |
| `outputDir` | `string` | 测试报告输出目录 |
| `dataDir` | `string` | 持久化数据存储目录 |

### 示例

```typescript
import { ServiceContainer, registerCoreServices } from 'yuantest-playwright';

const container = new ServiceContainer();

registerCoreServices(container, {
  port: 5274,
  outputDir: './test-reports',
  dataDir: './test-data',
});

const storage = container.resolve(TOKENS.StorageProvider);
```

---

## 类型定义

```typescript
type Lifecycle = 'singleton' | 'transient';

type Factory<T> = (container: ServiceContainer) => T;

interface ContainerOptions {
  port: number;
  outputDir: string;
  dataDir: string;
}

class MutableRef<T> {
  current: T;
  static of<T>(value: T): MutableRef<T>;
}

const TOKENS: {
  StorageProvider: symbol;
  LRUCache: symbol;
  TestDiscovery: symbol;
  PlaywrightConfigMerger: symbol;
  LLMConfig: symbol;
  LLMService: symbol;
  ToolRegistry: symbol;
  AgentService: symbol;
  ChatService: symbol;
  MCPConfigService: symbol;
  DiagnosisService: symbol;
  FlakyTestManager: symbol;
  Reporter: symbol;
  RealtimeReporter: symbol;
  TraceManager: symbol;
  ArtifactManager: symbol;
  AnnotationManager: symbol;
  TagManager: symbol;
  VisualTestingManager: symbol;
  Port: symbol;
  OutputDir: symbol;
  DataDir: symbol;
  TestDir: symbol;
};

type ServiceToken = (typeof TOKENS)[keyof typeof TOKENS];
```
