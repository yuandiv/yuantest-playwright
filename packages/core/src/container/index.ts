/**
 * container — 容器内核（不含组合根 registrations / router-deps-builder，它们归 apps 层）
 */
export { ServiceContainer } from './service-container';
export type { Factory, Lifecycle } from './service-container';
export { MutableRef } from './mutable-ref';
export { TOKENS } from './tokens';
export type { ServiceToken } from './tokens';
