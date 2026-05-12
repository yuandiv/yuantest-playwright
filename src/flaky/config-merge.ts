import { FlakyCriteriaConfig, QuarantineCriteriaConfig } from '../types';
import { DEFAULT_FLAKY_CRITERIA, DEFAULT_QUARANTINE_CRITERIA } from '../constants';

/**
 * 合并用户自定义不稳定用例配置与默认值
 * 仅覆盖类型合法的字段，非法类型值使用默认值
 * @param userConfig - 用户自定义配置（部分字段）
 * @returns 合并后的完整配置
 */
export function mergeFlakyCriteria(userConfig?: Partial<FlakyCriteriaConfig>): FlakyCriteriaConfig {
  if (!userConfig) {
    return { ...DEFAULT_FLAKY_CRITERIA };
  }
  const result = { ...DEFAULT_FLAKY_CRITERIA };
  for (const key of Object.keys(DEFAULT_FLAKY_CRITERIA) as (keyof FlakyCriteriaConfig)[]) {
    const val = userConfig[key];
    if (val !== undefined && typeof val === typeof DEFAULT_FLAKY_CRITERIA[key]) {
      (result as Record<string, unknown>)[key] = val;
    }
  }
  return result;
}

/**
 * 合并用户自定义隔离配置与默认值
 * 仅覆盖类型合法的字段，非法类型值使用默认值
 * @param userConfig - 用户自定义配置（部分字段）
 * @returns 合并后的完整配置
 */
export function mergeQuarantineCriteria(
  userConfig?: Partial<QuarantineCriteriaConfig>
): QuarantineCriteriaConfig {
  if (!userConfig) {
    return { ...DEFAULT_QUARANTINE_CRITERIA };
  }
  const result = { ...DEFAULT_QUARANTINE_CRITERIA };
  for (const key of Object.keys(
    DEFAULT_QUARANTINE_CRITERIA
  ) as (keyof QuarantineCriteriaConfig)[]) {
    const val = userConfig[key];
    if (val !== undefined && typeof val === typeof DEFAULT_QUARANTINE_CRITERIA[key]) {
      (result as Record<string, unknown>)[key] = val;
    }
  }
  return result;
}
