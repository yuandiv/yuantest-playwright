export function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return value;
}
