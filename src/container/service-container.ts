import { MutableRef } from './mutable-ref';

export type Lifecycle = 'singleton' | 'transient';

export type Factory<T> = (container: ServiceContainer) => T;

interface Registration {
  factory: Factory<unknown>;
  lifecycle: Lifecycle;
}

export class ServiceContainer {
  private registrations = new Map<symbol, Registration>();
  private instances = new Map<symbol, unknown>();
  private resolving = new Set<symbol>();
  private parent: ServiceContainer | null;

  constructor(parent?: ServiceContainer) {
    this.parent = parent ?? null;
  }

  register<T>(token: symbol, factory: Factory<T>, lifecycle: Lifecycle = 'singleton'): this {
    if (this.registrations.has(token)) {
      throw new Error(`Service already registered: ${String(token)}`);
    }
    this.registrations.set(token, { factory, lifecycle });
    return this;
  }

  resolve<T>(token: symbol): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected while resolving: ${String(token)}`);
    }

    const registration = this.registrations.get(token);
    if (!registration) {
      if (this.parent) {
        return this.parent.resolve<T>(token);
      }
      throw new Error(`Service not registered: ${String(token)}`);
    }

    if (registration.lifecycle === 'singleton') {
      this.resolving.add(token);
      try {
        const instance = registration.factory(this) as T;
        this.instances.set(token, instance);
        return instance;
      } finally {
        this.resolving.delete(token);
      }
    }

    return registration.factory(this) as T;
  }

  has(token: symbol): boolean {
    if (this.registrations.has(token)) {
      return true;
    }
    if (this.parent) {
      return this.parent.has(token);
    }
    return false;
  }

  override<T>(token: symbol, instance: T): this {
    this.instances.set(token, instance);
    return this;
  }

  updateRef<T>(token: symbol, value: T): this {
    const ref = this.resolve<MutableRef<T>>(token);
    ref.current = value;
    return this;
  }

  reset(): void {
    this.instances.clear();
    this.resolving.clear();
  }

  createChild(): ServiceContainer {
    return new ServiceContainer(this);
  }
}
