# ServiceContainer API Reference

ServiceContainer is a lightweight dependency injection container that manages service registration, resolution, lifecycle, and hierarchical scoping. It supports singleton and transient lifecycles, circular dependency detection, child containers, and mutable reference updates.

---

## Constructor

```typescript
new ServiceContainer(parent?: ServiceContainer)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `parent` | `ServiceContainer` | `null` | Optional parent container for hierarchical resolution |

### Example

```typescript
import { ServiceContainer } from 'yuantest-playwright';

const container = new ServiceContainer();

const child = container.createChild();
```

---

## Instance Methods

### `register<T>(token: symbol, factory: Factory<T>, lifecycle?: Lifecycle): this`

Register a service factory with the container. Throws an error if the token is already registered. The factory function receives the container instance as its argument, enabling dependency resolution within the factory.

```typescript
import { TOKENS } from 'yuantest-playwright';

container.register(TOKENS.StorageProvider, (c) => new FilesystemStorage(), 'singleton');

container.register(TOKENS.LRUCache, (c) => new LRUCache({ maxSize: 100 }), 'singleton');

container.register(TOKENS.AgentService, (c) => new AgentService(), 'transient');
```

### `resolve<T>(token: symbol): T`

Resolve a service instance by its token. Singleton services are cached after first resolution. Transient services are created on every call. Throws an error if the service is not registered or if a circular dependency is detected. If the token is not found in the current container, resolution falls back to the parent container.

```typescript
const storage = container.resolve<StorageProvider>(TOKENS.StorageProvider);

const cache = container.resolve<LRUCache>(TOKENS.LRUCache);
```

### `has(token: symbol): boolean`

Check whether a service is registered for the given token. Searches the current container and its parent chain.

```typescript
if (container.has(TOKENS.LLMService)) {
  const llm = container.resolve<LLMService>(TOKENS.LLMService);
}
```

### `override<T>(token: symbol, instance: T): this`

Override a previously resolved or registered service with a specific instance. Useful for testing or runtime replacement of services. The instance is stored directly in the singleton cache.

```typescript
const mockStorage = new MemoryStorage();

container.override(TOKENS.StorageProvider, mockStorage);
```

### `updateRef<T>(token: symbol, value: T): this`

Update the `current` value of a `MutableRef` resolved by the given token. This is a convenience method for updating mutable reference values stored in the container.

```typescript
container.updateRef(TOKENS.OutputDir, '/new/output/path');

container.updateRef(TOKENS.DataDir, '/new/data/path');
```

### `reset(): void`

Clear all resolved singleton instances and reset the resolution tracking. Registrations are preserved, so services can be resolved again from their factories.

```typescript
container.reset();
```

### `createChild(): ServiceContainer`

Create a child container that inherits registrations from this container. The child container can resolve services from its parent but maintains its own instance cache.

```typescript
const child = container.createChild();

child.register(TOKENS.Port, () => 8080);
```

---

## MutableRef

`MutableRef` is a simple wrapper that holds a mutable value. It is used in the container to store configuration values that may change at runtime.

### Constructor

```typescript
new MutableRef<T>(current: T)
```

### Parameters

| Parameter | Type | Description |
|------|------|------|
| `current` | `T` | The initial value held by the reference |

### Static Methods

#### `MutableRef.of<T>(value: T): MutableRef<T>`

Create a new `MutableRef` instance wrapping the given value.

```typescript
import { MutableRef } from 'yuantest-playwright';

const ref = MutableRef.of('./test-reports');

console.log(ref.current);

ref.current = './other-reports';
```

### Instance Properties

| Property | Type | Description |
|------|------|------|
| `current` | `T` | The current value held by the reference (read-write) |

---

## TOKENS

`TOKENS` is a constant object that provides unique `Symbol` keys for all core services. Use these tokens when registering or resolving services from the container.

### Available Tokens

| Token | Symbol | Description |
|------|--------|------|
| `TOKENS.StorageProvider` | `Symbol.for('StorageProvider')` | Storage provider instance |
| `TOKENS.LRUCache` | `Symbol.for('LRUCache')` | LRU cache instance |
| `TOKENS.TestDiscovery` | `Symbol.for('TestDiscovery')` | Test discovery service |
| `TOKENS.PlaywrightConfigMerger` | `Symbol.for('PlaywrightConfigMerger')` | Playwright config merger |
| `TOKENS.LLMConfig` | `Symbol.for('LLMConfig')` | LLM configuration |
| `TOKENS.LLMService` | `Symbol.for('LLMService')` | LLM service instance |
| `TOKENS.ToolRegistry` | `Symbol.for('ToolRegistry')` | Tool registry |
| `TOKENS.AgentService` | `Symbol.for('AgentService')` | Agent service |
| `TOKENS.ChatService` | `Symbol.for('ChatService')` | Chat service |
| `TOKENS.MCPConfigService` | `Symbol.for('MCPConfigService')` | MCP configuration service |
| `TOKENS.DiagnosisService` | `Symbol.for('DiagnosisService')` | Diagnosis service |
| `TOKENS.FlakyTestManager` | `Symbol.for('FlakyTestManager')` | Flaky test manager |
| `TOKENS.Reporter` | `Symbol.for('Reporter')` | Reporter instance |
| `TOKENS.RealtimeReporter` | `Symbol.for('RealtimeReporter')` | Realtime reporter |
| `TOKENS.TraceManager` | `Symbol.for('TraceManager')` | Trace manager |
| `TOKENS.ArtifactManager` | `Symbol.for('ArtifactManager')` | Artifact manager |
| `TOKENS.AnnotationManager` | `Symbol.for('AnnotationManager')` | Annotation manager |
| `TOKENS.TagManager` | `Symbol.for('TagManager')` | Tag manager |
| `TOKENS.VisualTestingManager` | `Symbol.for('VisualTestingManager')` | Visual testing manager |
| `TOKENS.Port` | `Symbol.for('Port')` | Server port number |
| `TOKENS.OutputDir` | `Symbol.for('OutputDir')` | Output directory (MutableRef) |
| `TOKENS.DataDir` | `Symbol.for('DataDir')` | Data directory (MutableRef) |
| `TOKENS.TestDir` | `Symbol.for('TestDir')` | Test directory (MutableRef) |

```typescript
import { TOKENS } from 'yuantest-playwright';

container.register(TOKENS.StorageProvider, (c) => getStorage(), 'singleton');
```

---

## registerCoreServices

`registerCoreServices` is a helper function that registers all built-in services into a container with the correct dependencies.

### Signature

```typescript
registerCoreServices(container: ServiceContainer, options: ContainerOptions): void
```

### Parameters

| Parameter | Type | Description |
|------|------|------|
| `container` | `ServiceContainer` | The container to register services into |
| `options` | `ContainerOptions` | Configuration options for core services |

### ContainerOptions

| Property | Type | Description |
|------|------|------|
| `port` | `number` | Server listening port |
| `outputDir` | `string` | Test report output directory |
| `dataDir` | `string` | Persistent data storage directory |

### Example

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

## Type Definitions

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
