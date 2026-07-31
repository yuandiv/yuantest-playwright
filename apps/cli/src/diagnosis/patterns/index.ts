/**
 * 错误模式集合 — 统一导出所有内置模式
 */
import { ErrorPattern } from '../knowledge-base';
import { TIMEOUT_PATTERNS } from './timeout';
import { SELECTOR_PATTERNS } from './selector';
import { ASSERTION_PATTERNS } from './assertion';
import { NETWORK_PATTERNS } from './network';
import { FRAME_PATTERNS } from './frame';
import { AUTH_PATTERNS } from './auth';
import {
  DATA_VALIDATION_PATTERN,
  STATE_INCONSISTENCY_PATTERN,
  RACE_CONDITION_PATTERN,
  ENV_CONFIG_PATTERN,
  HEADLESS_PATTERN,
  CONCURRENT_PATTERN,
} from './other';

/** 所有内置模式数据的聚合 */
export const BUILTIN_PATTERNS: ErrorPattern[] = [
  ...TIMEOUT_PATTERNS,
  ...SELECTOR_PATTERNS,
  ...ASSERTION_PATTERNS,
  DATA_VALIDATION_PATTERN,
  STATE_INCONSISTENCY_PATTERN,
  RACE_CONDITION_PATTERN,
  ENV_CONFIG_PATTERN,
  CONCURRENT_PATTERN,
  HEADLESS_PATTERN,
  ...NETWORK_PATTERNS,
  ...FRAME_PATTERNS,
  ...AUTH_PATTERNS,
];
