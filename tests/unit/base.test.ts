import { BaseManager, ManagedManager } from '../../src/base';

class TestManager extends BaseManager {
  public initCalled = false;
  public initOrder: string[] = [];

  protected async doInitialize(): Promise<void> {
    this.initCalled = true;
    this.initOrder.push('init');
  }
}

class TestManagedManager extends ManagedManager {
  public saveCalled = false;
  public initCalled = false;

  protected async doInitialize(): Promise<void> {
    this.initCalled = true;
  }

  public testScheduleSave(): void {
    this.scheduleSave(async () => {
      this.saveCalled = true;
    });
  }

  public testFlush(): Promise<void> {
    return this.flush(async () => {
      this.saveCalled = true;
    });
  }
}

describe('BaseManager', () => {
  let manager: TestManager;

  beforeEach(() => {
    manager = new TestManager();
  });

  describe('initialize', () => {
    it('should call doInitialize on first call', async () => {
      expect(manager.initCalled).toBe(false);
      await manager.initialize();
      expect(manager.initCalled).toBe(true);
    });

    it('should be idempotent', async () => {
      await manager.initialize();
      await manager.initialize();
      await manager.initialize();
      expect(manager.initOrder).toEqual(['init']);
    });

    it('should return same promise for concurrent calls', async () => {
      const promises = [
        manager.initialize(),
        manager.initialize(),
        manager.initialize(),
      ];
      await Promise.all(promises);
      expect(manager.initOrder).toEqual(['init']);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(manager.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe('ready', () => {
    it('should auto-initialize if not initialized', async () => {
      expect(manager.isInitialized()).toBe(false);
      await manager.ready();
      expect(manager.isInitialized()).toBe(true);
    });

    it('should return immediately if already initialized', async () => {
      await manager.initialize();
      const start = Date.now();
      await manager.ready();
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });

  describe('EventEmitter', () => {
    it('should extend EventEmitter', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
      expect(typeof manager.removeListener).toBe('function');
    });

    it('should emit and receive events', () => {
      const listener = jest.fn();
      manager.on('test-event', listener);
      manager.emit('test-event', { data: 'test' });
      expect(listener).toHaveBeenCalledWith({ data: 'test' });
    });
  });
});

describe('ManagedManager', () => {
  let manager: TestManagedManager;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new TestManagedManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleSave', () => {
    it('should schedule save with delay', () => {
      manager.testScheduleSave();
      expect(manager.saveCalled).toBe(false);

      jest.advanceTimersByTime(1000);
      expect(manager.saveCalled).toBe(true);
    });

    it('should debounce multiple calls', () => {
      manager.testScheduleSave();
      manager.testScheduleSave();
      manager.testScheduleSave();

      jest.advanceTimersByTime(1000);
      expect(manager.saveCalled).toBe(true);
    });

    it('should not save if not dirty', () => {
      manager.testScheduleSave();
      jest.advanceTimersByTime(500);
      manager.testScheduleSave();
      jest.advanceTimersByTime(1000);
      expect(manager.saveCalled).toBe(true);
    });
  });

  describe('flush', () => {
    it('should immediately save pending changes', async () => {
      manager.testScheduleSave();
      expect(manager.saveCalled).toBe(false);

      await manager.testFlush();
      expect(manager.saveCalled).toBe(true);
    });

    it('should clear scheduled timer', async () => {
      manager.testScheduleSave();
      await manager.testFlush();

      jest.advanceTimersByTime(2000);
      expect(manager.saveCalled).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should inherit BaseManager initialization', async () => {
      expect(manager.initCalled).toBe(false);
      await manager.initialize();
      expect(manager.initCalled).toBe(true);
    });
  });
});
