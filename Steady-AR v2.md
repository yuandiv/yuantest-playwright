# Steady-AR v2.0：生产级 AI 编排框架完整设计方案（终局版）

**版本**：2.0（终局冻结版）  
**状态**：**核心架构永久冻结，外围能力完整闭环**  
**设计哲学**：状态私有 + 输入溯源 + 确定性重放 + 自适应压缩

---

## 一、设计公理与铁律（永不更改）

| 编号 | 公理 | 工程含义 |
| :--- | :--- | :--- |
| **A1** | **状态私有** | 每个 `Cell` 拥有完全隔离的内部状态（`Map`/`Set`/`Buffer`/`Class` 均可），**框架永不序列化状态本身**。 |
| **A2** | **输入溯源** | 框架只持久化 `Action` 的**输入参数（Input）**。崩溃恢复时，重放输入日志以**重新计算**状态。 |
| **A3** | **可序列化边界** | 所有 `Action` 的入参与出参必须**可序列化**（通过序列化注册表支持 `Date`/`Buffer` 等扩展类型）。 |
| **A4** | **确定性执行** | 同一 `Cell` 内的 `Action` 严格按 FIFO 顺序执行，**恢复重放顺序与运行时完全一致**。 |

---

## 二、核心编程模型（开发者 API，永久冻结）

### 2.1 Cell（状态容器）

```typescript
abstract class Cell<S = any> {
  // 1. 私有状态（任意类型，框架永不触碰）
  protected state!: S;

  // 2. 生命周期钩子（可选）
  async onInit?(ctx: CellContext): Promise<S>;          // Cell 创建时初始化
  async onSnapshot?(): Promise<Partial<S>>;             // 用于水位线指纹（轻量摘要）
  
  // 3. 状态版本迁移（支持平滑升级，见第八章）
  static migrations?: Record<number, (old: any) => any>;

  // 4. 执行入口（框架内部调用，开发者勿覆写）
  async __execute__(actionName: string, input: Serializable): Promise<Serializable>;
}
```

### 2.2 Action（幂等方法装饰器）

```typescript
// 标记方法为可重放的原子操作
@Action({
  retry: 3,               // 失败重试次数
  timeout: 30000,         // 超时毫秒
  pure: false,            // 是否为纯函数（无副作用，恢复时可短路跳过）
  cache: { ttl: 3600 }    // 可选：LLM 等耗时操作的结果缓存
})
async editFile(path: string, content: string): Promise<{ hash: string }> {
  // 幂等性检查：若文件已是指定内容，直接返回
  if (await fs.read(path) === content) return { hash: hash(content) };
  
  // 副作用
  await fs.write(path, content);
  this.state.fileMap.set(path, content);
  
  return { hash: hash(content) };
}
```

### 2.3 Saga 补偿（幂等性负担的解决方案）

```typescript
@Action
async chargeUser(amount: number, orderId: string) {
  await paymentAPI.charge(amount);
  this.state.balance -= amount;
  this.state.orders.set(orderId, 'charged');
}

// 补偿动作：挂在同一个 Action 上，逆向操作
@Compensate('chargeUser', { onFailure: 'collect' }) // 'collect' | 'continue' | 'abort'
async refundUser(amount: number, orderId: string) {
  await paymentAPI.refund(amount);
  this.state.balance += amount;
  this.state.orders.set(orderId, 'refunded');
}
```

**Saga 执行机制**：
- 若 `chargeUser` 成功但后续 Action 失败，Runtime 自动逆序调用补偿函数。
- **中断策略**（`onFailure`）：
  - `'collect'`（默认）：遇到补偿失败继续执行剩余补偿，收集所有失败统一上报。
  - `'continue'`：补偿失败时记录日志但继续执行（同 `collect` 的别名）。
  - `'abort'`：遇到第一个补偿失败立即停止，剩余补偿不执行（强一致性场景）。

---

## 三、序列化与类型系统

### 3.1 序列化注册表（支持扩展类型）

```typescript
class SerializerRegistry {
  static register<T>(
    type: string, 
    handler: { serialize: (val: T) => any; deserialize: (raw: any) => T }
  ): void;
}

// 内置默认注册
SerializerRegistry.register('Date', {
  serialize: (d: Date) => ({ __type: 'Date', iso: d.toISOString() }),
  deserialize: (raw) => new Date(raw.iso)
});

SerializerRegistry.register('Buffer', {
  serialize: (buf: Buffer) => ({ __type: 'Buffer', base64: buf.toString('base64') }),
  deserialize: (raw) => Buffer.from(raw.base64, 'base64')
});

// 用户扩展
SerializerRegistry.register('ObjectId', {
  serialize: (id) => ({ __type: 'ObjectId', hex: id.toHexString() }),
  deserialize: (raw) => ObjectId.createFromHexString(raw.hex)
});
```

### 3.2 大对象引用存储（透明旁路）

**序列化管道（统一流程）**：

```
1. 递归遍历 Input 对象。
2. 若遇到扩展类型（Date/Buffer/Map/自定义），调用 SerializerRegistry 转换为标准 JSON 兼容格式。
3. 计算序列化后的总大小（估算）：
   a. 若 ≤ 64KB：直接内联存入日志（经过序列化转换）。
   b. 若 > 64KB：将序列化后的 JSON 字符串或二进制（若配置 format: 'binary' 则使用 MessagePack）存入外部 Blob 存储（S3/MinIO/LocalFS），日志中仅存 { __ref: uuid, __refType: 'blob' }。
```

**反序列化管道（统一流程）**：

```
1. 若遇到 { __ref }，从 Blob 存储加载原始数据（字符串或二进制）。
2. 若加载的是二进制，先解码为 JSON 对象。
3. 递归遍历，若遇到 { __type: 'Date' } 等，调用 SerializerRegistry 反序列化为原生类型。
```

**Blob 存储配置**：
```typescript
blob: {
  threshold: 65536,              // bytes
  format: 'json' | 'binary',    // binary 使用 MessagePack 压缩
  provider: 's3' | 'fs' | 'minio',
  bucket: string,
  region?: string
}
```

---

## 四、存储层架构（双缓冲分区 + 自适应水位线压缩）

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Runtime / Scheduler                      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                   Storage Adapter Interface                  │
│ appendLog(cellId, seq, version, action, inputRef, ts)       │
│ readLogs(cellId, fromSeq) → AsyncIterator                   │
│ saveBlob(ref, data) / loadBlob(ref)                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│  Hot Partition (热分区)      │  Cold Partition (冷分区)      │
│  - Append-Only WAL          │  - 压缩后的 Segments          │
│  - 无索引、无锁、无删除      │  - 水位线索引表               │
│  - <1ms 写入延迟            │  - Segment → 最大 seq 映射    │
│  - 内存 Buffer + SQLite     │  - 保留 7 天（可配置）        │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    Merge Reader (归并排序)                   │
│          冷分区 + 热分区 按 seq 合并输出                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 热分区（Hot Partition）

- **存储**：内存 Buffer（最近 500 条）+ SQLite 表 `hot_logs`。
- **写入**：仅追加，无索引、无压缩、无删除。
- **刷新**：每 100ms 或累积 100 条刷入 SQLite。

### 4.3 冷分区（Cold Partition）与水位线压缩

**后台压缩作业**（独立 Worker，每 30 秒触发）：

1. 从热分区读取增量日志。
2. **层 1 压缩（幂等合并）**：连续相同 `(Action + 输入指纹)` 仅保留最后一条。
3. **水位线触发判断**：
   - 当前 Cell 堆内存 > 50MB（通过 `process.memoryUsage().heapUsed` 检测）。
   - 或单 Cell 日志条数 > 500。
4. 若触发：插入**隐形水位线**记录 `(seq_offset, state_fingerprint, cell_version)`。
5. 将压缩后日志写入 `cold_segments`，记录该 Segment 覆盖的 `(min_seq, max_seq)`。
6. 删除热分区中已搬运的原始记录。

**指纹计算（轻量）**：
- 优先调用用户 `onSnapshot()` 返回的摘要。
- 若无，框架自动计算 `(日志条数 + 最后 10 条输入的 hash + cell_version)` 作为指纹，**绝不序列化状态本身**。

### 4.4 冷数据删除策略（联动安全）

- **保留期限**：默认 7 天，可配置 `coldStorage.retentionDays`。
- **删除流程**：删除 Segment 时，同时记录其 `max_seq` 到 `deleted_segments` 表。
- **与 `trustWatermark: 'force'` 联动**：
  - 若 `force` 模式下引用的水位线所在 Segment 已被删除，框架**拒绝执行**，抛出 `ERR_WATERMARK_SEGMENT_MISSING` 错误。
  - 用户须改为 `'strict'` 模式或恢复更早的外部快照。

---

## 五、并发与通信模型

### 5.1 确定性任务队列（FIFO）

- 每个 `Cell` 拥有独立的 **`Deterministic FIFO Task Queue`**。
- `Action` 按调用顺序**串行执行**（无并发冲突）。
- **重放时**：顺序与运行时完全一致，不受事件循环、微任务调度影响（框架内部使用 `async` 队列，非 `setTimeout`）。

### 5.2 Channel（易失性内存总线）

- **定位**：**仅用于同进程内 Cell 间的实时通知**（如“文件已更新”）。
- **特性**：**不持久化、不重放、崩溃即丢失**。
- 若需跨 Cell 传递持久化数据，必须通过 `targetCell.execute()` 显式调用（该调用会记录入日志，可恢复）。

```typescript
// 内存广播（易失）
ctx.channel.publish('file:changed', { path: '/a.ts' });

// 持久化调用（可靠）
await otherCell.execute('onFileChanged', { path: '/a.ts' });
```

### 5.3 跨 Cell Saga（明确边界）

**声明**：Steady-AR 的 Saga 机制**仅作用于单个 Cell 内部的 Action 链**，不提供跨 Cell 的分布式事务协调。

**替代方案推荐**：
1. **编排层协调**：在上层 Flow 中通过 `try-catch` 显式调用各 Cell 的补偿方法。
2. **事件驱动最终一致性**：`OrderCell` 成功后发布 `OrderPaidEvent`（易失），`InventoryCell` 订阅并执行扣减，若失败则发送补偿请求。
3. **外部编排器**：使用 Temporal / Camunda 协调跨服务事务。

---

## 六、恢复协议（Recovery Protocol）

### 6.1 完整恢复流程

```
1. Runtime 启动，加载 Cell 实例（state = 初始空值）。
2. Storage 执行合并读取（冷 + 热分区归并排序）。
3. 检查是否有外部快照（可选热启动）：
   - 若有且未过期，直接加载快照作为起点（跳过重放）。
4. 查找最新水位线（Watermark）。
5. 根据 trustWatermark 策略：
   a. 'strict'（默认）：校验指纹，不匹配则从 Seq=0 全量重放。
   b. 'force'：前置检查水位线所在 Segment 是否仍存在。若已删除则报错拒绝。
      若存在，直接截断至该水位线，跳过前序日志。
   c. 'dry-run'：执行重放但不更新状态，生成指纹差异报告。
6. 从起始 Seq 开始逐条重放日志：
   a. 检查日志中的 Cell 版本号。
   b. 若当前 Cell 版本 > 日志版本，应用 StateMigrator 迁移函数（见第八章）。
   c. 反序列化 Input（自动加载 __ref + 扩展类型恢复）。
   d. 若 Action 标记 @Pure → 跳过执行。
   e. 若命中 @Cache → 返回缓存结果，跳过执行。
   f. 否则执行 Action（内部幂等保证）。
   g. 每重放 100 条，触发 onProgress(completed, total)。
7. 恢复完成，状态与崩溃前一致。
```

### 6.2 恢复增强控制

```typescript
const recovery = runtime.recover('cell-123', {
  trustWatermark: 'strict' | 'force' | 'dry-run',
  onProgress: (done, total) => console.log(`${done}/${total}`),
  signal: abortController.signal,   // 调用 abort() 立即停止，丢弃已恢复状态
  dryMode: true,                    // 仅执行内存计算，不触发真实副作用
  suppressSideEffects: true,        // 框架拦截 fs.write / http.post（通过 Mock 代理）
  maxReplay: 10000                  // 最大重放条数，超限报错
});
```

---

## 七、Saga 补偿机制（详细设计）

### 7.1 补偿链执行顺序

- **触发时机**：当 Cell 的 Action 执行失败时，或后续 Action 失败需回滚已成功 Action 时。
- **顺序**：逆序调用（最后成功的 Action 最先补偿）。
- **补偿日志**：每个补偿执行结果记录到 `saga_log` 表（`cell_id`, `action_name`, `seq`, `status`, `error`）。

### 7.2 中断策略

```typescript
@Compensate('chargeUser', { onFailure: 'collect' })
async refundUser(...) { ... }
```

- **`'collect'`（默认）**：遇到补偿失败继续执行剩余补偿，所有失败收集后统一上报（日志标记 `MANUAL_REPAIR_REQUIRED`）。
- **`'abort'`**：遇到第一个补偿失败立即停止，剩余补偿不执行（强一致性场景）。

### 7.3 进程崩溃后的补偿恢复

- 若补偿执行期间进程崩溃，重启后 Runtime 检测到 `saga_log` 中有未完成（`status: 'pending'`）的记录。
- **策略**：重新执行未完成的补偿链，但需检查目标状态（如订单是否已退款），避免重复执行（补偿函数需幂等）。

---

## 八、Cell 状态迁移与版本化（平滑升级）

### 8.1 版本定义与迁移函数

```typescript
class OrderCell extends Cell<OrderState> {
  // 当前业务代码使用最新版本的数据结构
  // 框架自动注入 __version 字段到 state 中
  
  // 版本迁移表：从旧版 → 新版
  static migrations = {
    1: (old: any) => ({ 
      __version: 2,
      status: old.state,          // 重命名字段
      items: old.items || [] 
    }),
    2: (old: any) => ({ 
      __version: 3,
      total: old.items.reduce((sum, i) => sum + i.price, 0),
      ...old 
    }),
  };
}
```

### 8.2 恢复时的自动迁移

- 日志中记录每个 Action 执行时的 Cell 版本号（自动注入 `__version`）。
- 重放时，若当前 Cell 版本（`v3`）高于日志版本（`v1`），框架在重放该 Action 前：
  1. 检查当前 `state.__version`。
  2. 若 `state.__version < v3`，应用 `migrations[state.__version + 1]` 逐步迁移至 `v3`。
  3. 迁移后的 `state.__version = v3`，后续 Action 在新结构下执行。
- 迁移函数必须是**纯函数**（无副作用）且幂等。

---

## 九、可观测性与监控（Telemetry）

### 9.1 内置指标（OpenTelemetry 兼容）

| 指标名 | 类型 | 标签 | 含义 |
| :--- | :--- | :--- | :--- |
| `steady_replay_duration_seconds` | Histogram | `cell_id`, `success` | 恢复阶段总耗时 |
| `steady_replay_logs_total` | Counter | `cell_id`, `status` | 重放日志总数/成功/失败 |
| `steady_log_compression_ratio` | Gauge | `cell_id` | 原始日志条数 / 压缩后条数 |
| `steady_cache_hit_rate` | Gauge | `cell_id`, `action` | `@Cache` 命中率 |
| `steady_watermark_trigger_total` | Counter | `cell_id`, `reason` | 水位线触发总次数（内存/条数） |
| `steady_blob_operations_total` | Counter | `type`(read/write) | 大对象引用存储操作次数 |
| `steady_saga_compensation_total` | Counter | `cell_id`, `action`, `status` | Saga 补偿触发次数/成功/失败 |
| `steady_migration_applied_total` | Counter | `cell_id`, `from_version`, `to_version` | 状态迁移执行次数 |

### 9.2 配置示例

```typescript
telemetry: {
  provider: 'otel',
  endpoint: 'http://otel-collector:4318',
  attributes: { service: 'ai-orchestrator', env: 'production' },
  onMetric: (name, value, labels) => console.log(name, value, labels)
}
```

---

## 十、完整配置接口

```typescript
interface SteadyARConfig {
  // === 存储层 ===
  storage: {
    hotPartition: { 
      maxSize: 500,          // 内存缓冲最大条数
      flushInterval: 100     // ms
    };
    coldPartition: { 
      compressInterval: 30000 // ms
    };
    blobStore: { 
      threshold: 65536,      // bytes
      format: 'json' | 'binary',
      provider: 's3' | 'fs' | 'minio',
      bucket: string,
      region?: string
    };
    retention: {
      coldDataDays: 7,
      allowForceOnDeleted: false  // force 模式若 segment 已删除是否报错
    };
  };

  // === 水位线 ===
  watermark: {
    heapThreshold: 50 * 1024 * 1024, // 50MB
    logThreshold: 500,                // 条数
    fingerprint: 'auto' | 'manual';   // auto 调用 onSnapshot
  };

  // === 恢复 ===
  recovery: {
    trustWatermark: 'strict' | 'force' | 'dry-run';
    maxReplay: 10000;
    defaultDryMode: false;
    defaultSuppressSideEffects: false;
  };

  // === Saga ===
  saga: {
    defaultOnFailure: 'collect' | 'continue' | 'abort';
  };

  // === 缓存 ===
  cache: {
    provider: 'redis' | 'memory';
    defaultTTL: 3600;
    redisUrl?: string;
  };

  // === 迁移 ===
  migration: {
    enable: true;
  };

  // === 遥测 ===
  telemetry: {
    provider: 'otel' | 'console' | 'none';
    endpoint?: string;
    attributes?: Record<string, string>;
    onMetric?: (name: string, value: number, labels: Record<string, string>) => void;
  };
}
```

---

## 十一、四大场景验证（回归测试）

| 场景 | Cell 设计 | 恢复耗时（1000 条日志） | 存储开销 | 关键增益 |
| :--- | :--- | :--- | :--- | :--- |
| **知识库 RAG** | `RetrieveCell` + `@Cache` LLM | < 50ms（缓存命中率 95%） | 热分区 < 1MB | 缓存命中直接短路重放 |
| **企业助手** | `RouterCell` + 多租户 `SalesCell` | < 200ms（水位线每 20 条触发） | 冷分区每日 < 10MB | Saga 补偿保证支付等操作回滚；跨 Cell 一致性由编排层协调 |
| **个人助手** | `PlanCell`（100 步 ReAct） | < 500ms（水位线每 5 步触发） | 日志每日 < 5MB | `trustWatermark: force` 允许极端场景快速恢复 |
| **AI 编码** | `EditorCell`（500 次文件编辑） | < 300ms（幂等合并 + 水位线） | Blob 存储按需 | 大文件自动引用存储，日志恒小；状态迁移支持文件索引升级 |

---

## 十二、冻结声明与演进通道

### 12.1 永久冻结内容（永不修改）

| 类别 | 具体内容 |
| :--- | :--- |
| **编程模型** | `Cell` / `Action` / `@Compensate` 的 API 与语义 |
| **核心逻辑** | 输入序列化 + 重放恢复 + 状态私有化 |
| **存储契约** | 双缓冲分区 + 引用存储的架构接口 |

### 12.2 允许的演进通道（仅限实现细节）

- 新增 Blob 存储后端（GCS/Azure）。
- 调整水位线阈值（配置化）。
- 升级缓存算法（LRU → LFU → 自适应）。
- 新增遥测指标（扩展 Telemetry 接口）。
- 优化冷分区压缩算法（如 LZ4 替代 Gzip）。

---

## 十三、总结

**Steady-AR v2.0** 是历经多轮深度思考后收敛的唯一终局架构。它通过 **状态私有化** 绕过了序列化黑洞，通过 **输入溯源** 实现了确定性恢复，通过 **双缓冲分区与水位线压缩** 保证了性能与存储可控，通过 **Saga 补偿、序列化注册表、状态迁移、强制信任开关、遥测监控** 等外围加固，覆盖了从开发调试到生产运维的全生命周期。

**核心 API 永久冻结，业务代码永不重写。** 未来所有的需求演进都将以配置扩展、插件接入或存储层替换的方式完成，绝不触及 `Cell` 和 `Action` 的一行业务逻辑。这口井已经挖到了基岩，是时候铺设管道、输送清泉了。