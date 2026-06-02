import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceContainer } from '../../src/container/service-container';
import { MutableRef } from '../../src/container/mutable-ref';
import { TOKENS } from '../../src/container/tokens';

describe('ServiceContainer', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  describe('register + resolve', () => {
    it('should register and resolve a simple service', () => {
      container.register(TOKENS.Port, () => 5274);
      expect(container.resolve(TOKENS.Port)).toBe(5274);
    });

    it('should resolve services with dependencies', () => {
      container.register(TOKENS.DataDir, () => MutableRef.of('./test-data'));
      container.register(TOKENS.StorageProvider, (c) => ({
        baseDir: c.resolve<MutableRef<string>>(TOKENS.DataDir).current,
      }));

      const storage = container.resolve<{ baseDir: string }>(TOKENS.StorageProvider);
      expect(storage.baseDir).toBe('./test-data');
    });

    it('should throw when resolving unregistered service', () => {
      expect(() => container.resolve(Symbol.for('NonExistent'))).toThrow(
        'Service not registered'
      );
    });

    it('should throw when registering same token twice', () => {
      container.register(TOKENS.Port, () => 5274);
      expect(() => container.register(TOKENS.Port, () => 8080)).toThrow(
        'Service already registered'
      );
    });
  });

  describe('singleton lifecycle', () => {
    it('should return same instance for singleton', () => {
      container.register(TOKENS.LRUCache, () => ({ id: Math.random() }), 'singleton');
      const a = container.resolve(TOKENS.LRUCache);
      const b = container.resolve(TOKENS.LRUCache);
      expect(a).toBe(b);
    });
  });

  describe('transient lifecycle', () => {
    it('should return new instance for transient', () => {
      container.register(TOKENS.LRUCache, () => ({ id: Math.random() }), 'transient');
      const a = container.resolve(TOKENS.LRUCache);
      const b = container.resolve(TOKENS.LRUCache);
      expect(a).not.toBe(b);
    });
  });

  describe('override', () => {
    it('should override a registered service instance', () => {
      container.register(TOKENS.Port, () => 5274);
      expect(container.resolve(TOKENS.Port)).toBe(5274);

      container.override(TOKENS.Port, 8080);
      expect(container.resolve(TOKENS.Port)).toBe(8080);
    });

    it('should override singleton with mock for testing', () => {
      container.register(TOKENS.StorageProvider, () => ({ type: 'real' }), 'singleton');
      container.override(TOKENS.StorageProvider, { type: 'mock' });
      expect(container.resolve(TOKENS.StorageProvider)).toEqual({ type: 'mock' });
    });
  });

  describe('has', () => {
    it('should return true for registered service', () => {
      container.register(TOKENS.Port, () => 5274);
      expect(container.has(TOKENS.Port)).toBe(true);
    });

    it('should return false for unregistered service', () => {
      expect(container.has(Symbol.for('NonExistent'))).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear all cached instances', () => {
      let callCount = 0;
      container.register(TOKENS.Port, () => { callCount++; return 5274; }, 'singleton');
      container.resolve(TOKENS.Port);
      expect(callCount).toBe(1);

      container.reset();
      container.resolve(TOKENS.Port);
      expect(callCount).toBe(2);
    });
  });

  describe('createChild', () => {
    it('should resolve from parent when not in child', () => {
      container.register(TOKENS.Port, () => 5274);
      const child = container.createChild();
      expect(child.resolve(TOKENS.Port)).toBe(5274);
    });

    it('should allow child to register own services', () => {
      container.register(TOKENS.Port, () => 5274);
      const child = container.createChild();
      child.register(TOKENS.DataDir, () => MutableRef.of('./child-data'));
      expect(child.resolve<MutableRef<string>>(TOKENS.DataDir).current).toBe('./child-data');
      expect(child.resolve(TOKENS.Port)).toBe(5274);
    });

    it('should check parent for has()', () => {
      container.register(TOKENS.Port, () => 5274);
      const child = container.createChild();
      expect(child.has(TOKENS.Port)).toBe(true);
    });
  });

  describe('circular dependency detection', () => {
    it('should throw on circular dependencies', () => {
      const A = Symbol.for('ServiceA');
      const B = Symbol.for('ServiceB');

      container.register(A, (c) => c.resolve(B));
      container.register(B, (c) => c.resolve(A));

      expect(() => container.resolve(A)).toThrow('Circular dependency detected');
    });
  });

  describe('updateRef', () => {
    it('should update MutableRef value', () => {
      container.register(TOKENS.DataDir, () => MutableRef.of('./original'));
      container.updateRef(TOKENS.DataDir, './updated');
      expect(container.resolve<MutableRef<string>>(TOKENS.DataDir).current).toBe('./updated');
    });
  });
});

describe('MutableRef', () => {
  it('should hold and update a value', () => {
    const ref = MutableRef.of('hello');
    expect(ref.current).toBe('hello');
    ref.current = 'world';
    expect(ref.current).toBe('world');
  });

  it('should create independent instances', () => {
    const a = MutableRef.of(1);
    const b = MutableRef.of(2);
    a.current = 10;
    expect(b.current).toBe(2);
  });
});
