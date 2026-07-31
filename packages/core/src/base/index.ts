import { EventEmitter } from 'events';
import { logger } from '../logger';

/**
 * Interface for components that require asynchronous initialization.
 * Provides a standard way to ensure resources are ready before use.
 */
export interface Initializable {
  /**
   * Initialize the component asynchronously.
   * Should be idempotent - calling multiple times should have no additional effect.
   */
  initialize(): Promise<void>;

  /**
   * Check if the component has been initialized.
   */
  isInitialized(): boolean;

  /**
   * Wait for the component to be ready.
   * If not initialized, will call initialize() automatically.
   */
  ready(): Promise<void>;
}

/**
 * Abstract base class for managers that require asynchronous initialization.
 * Extends EventEmitter to allow managers to emit events.
 *
 * @example
 * ```typescript
 * class MyManager extends BaseManager {
 *   protected async doInitialize(): Promise<void> {
 *     // Load resources, connect to database, etc.
 *   }
 * }
 *
 * const manager = new MyManager();
 * await manager.initialize();
 * // or
 * await manager.ready(); // Auto-initializes if needed
 * ```
 */
export abstract class BaseManager extends EventEmitter implements Initializable {
  protected _initialized = false;
  protected initPromise: Promise<void> | null = null;
  protected log = logger.child(this.constructor.name);

  /**
   * Initialize the manager. This method is idempotent.
   * If already initialized, returns immediately.
   * If initialization is in progress, waits for it to complete.
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this._initialized = true;
    this.log.debug(`${this.constructor.name} initialized`);
  }

  /**
   * Check if the manager has been initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Wait for the manager to be ready.
   * Automatically calls initialize() if not already initialized.
   */
  async ready(): Promise<void> {
    if (this._initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    await this.initialize();
  }

  /**
   * Subclasses must implement this method to perform actual initialization.
   * This method is called exactly once, when initialize() is first called.
   */
  protected abstract doInitialize(): Promise<void>;
}

/**
 * Extended base manager with automatic save scheduling functionality.
 * Useful for managers that need to persist data periodically.
 *
 * @example
 * ```typescript
 * class MyDataManager extends ManagedManager {
 *   private data: Map<string, any> = new Map();
 *
 *   protected async doInitialize(): Promise<void> {
 *     await this.loadData();
 *   }
 *
 *   updateData(key: string, value: any): void {
 *     this.data.set(key, value);
 *     this.scheduleSave(() => this.saveData());
 *   }
 *
 *   private async saveData(): Promise<void> {
 *     await storage.writeJSON('data.json', Object.fromEntries(this.data));
 *   }
 * }
 * ```
 */
export abstract class ManagedManager extends BaseManager {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  protected dirty: boolean = false;
  protected saveDelayMs: number = 1000;

  /**
   * Schedule a save operation to be executed after a delay.
   * Multiple calls will be debounced - only one save will occur.
   *
   * @param saveFn - The async function to call for saving
   */
  protected scheduleSave(saveFn: () => Promise<void>): void {
    this.dirty = true;
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        saveFn().catch((err) => {
          this.log.warn(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    }, this.saveDelayMs);
    this.saveTimer.unref();
  }

  /**
   * Immediately flush any pending save operations.
   * Clears any scheduled save and executes it immediately.
   *
   * @param saveFn - The async function to call for saving
   */
  async flush(saveFn: () => Promise<void>): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      await saveFn();
    }
  }

  /**
   * Set the delay for automatic save operations.
   *
   * @param ms - Delay in milliseconds
   */
  protected setSaveDelay(ms: number): void {
    this.saveDelayMs = ms;
  }
}
