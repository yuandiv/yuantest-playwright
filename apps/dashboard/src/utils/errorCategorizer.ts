export function categorizeErrorLocal(error: string): string {
  const lower = error.toLowerCase();
  if (/timeout|timed?\s*out|exceeded.*time/.test(lower)) return 'timeout';
  if (/selector|element.*not.*found|waiting.*locator|no.*element/.test(lower)) return 'selector';
  if (/network|fetch|econnrefused|dns|net::|request.*fail|err_connection|cors/.test(lower)) return 'network';
  if (/assert|expect.*received|expected.*but/.test(lower)) return 'assertion';
  if (/frame|iframe|context.*destroyed|page.*closed/.test(lower)) return 'frame';
  if (/auth|unauthorized|forbidden|401|403|login|token/.test(lower)) return 'auth';
  return 'unknown';
}
