export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  }) as T;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T {
  let timeout: NodeJS.Timeout | null = null;

  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

export class BatchUpdater<T> {
  private items: T[] = [];
  private timeout: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly flushDelay: number;
  private readonly onFlush: (items: T[]) => void;
  private immediateTypes: Set<string> | null = null;
  private getType: ((item: T) => string) | null = null;

  constructor(
    onFlush: (items: T[]) => void,
    options?: { batchSize?: number; flushDelay?: number; immediateTypes?: string[]; getType?: (item: T) => string }
  ) {
    this.onFlush = onFlush;
    this.batchSize = options?.batchSize ?? 10;
    this.flushDelay = options?.flushDelay ?? 100;
    if (options?.immediateTypes && options?.getType) {
      this.immediateTypes = new Set(options.immediateTypes);
      this.getType = options.getType;
    }
  }

  /** 添加条目到批量队列，若条目类型属于即时类型则立即刷新 */
  add(item: T): void {
    this.items.push(item);

    if (this.immediateTypes && this.getType) {
      const type = this.getType(item);
      if (this.immediateTypes.has(type)) {
        this.flush();
        return;
      }
    }

    if (this.items.length >= this.batchSize) {
      this.flush();
      return;
    }

    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), this.flushDelay);
    }
  }

  flush(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.items.length > 0) {
      const items = [...this.items];
      this.items = [];
      this.onFlush(items);
    }
  }

  clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.items = [];
  }
}

export class MessageRateLimiter {
  private messageCounts: Map<string, number[]> = new Map();
  private readonly maxMessages: number;
  private readonly timeWindow: number;

  constructor(maxMessages: number = 10, timeWindow: number = 1000) {
    this.maxMessages = maxMessages;
    this.timeWindow = timeWindow;
  }

  shouldProcess(messageType: string): boolean {
    const now = Date.now();
    const timestamps = this.messageCounts.get(messageType) || [];

    const recentTimestamps = timestamps.filter(t => now - t < this.timeWindow);

    if (recentTimestamps.length >= this.maxMessages) {
      return false;
    }

    recentTimestamps.push(now);
    this.messageCounts.set(messageType, recentTimestamps);
    return true;
  }

  clear(): void {
    this.messageCounts.clear();
  }
}
