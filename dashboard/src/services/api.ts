const API_BASE = '/api/v1';

let currentLang: string = 'zh';

export function setApiLang(lang: string): void {
  currentLang = lang;
}

export function getApiLang(): string {
  return currentLang;
}

export async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const urlObj = new URL(url, 'http://localhost');
    urlObj.searchParams.set('lang', currentLang);
    const urlWithLang = urlObj.pathname + urlObj.search;
    const res = await fetch(urlWithLang);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
    return null;
  }
}

export interface StartRunResult {
  success: boolean;
  error?: string;
}

export async function startRun(options: {
  testDir?: string;
  baseURL?: string;
  version?: string;
  testIds?: string[];
  grepPattern?: string;
  tagFilter?: string[];
  testLocations?: string[];
  testFiles?: string[];
  describePattern?: string;
}): Promise<StartRunResult> {
  try {
    const res = await fetch(`${API_BASE}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function stopRun(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/runs/stop`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRunStatus(): Promise<{ isRunning: boolean; currentRun: { id: string; version: string } | null } | null> {
  return fetchJSON(`${API_BASE}/runs/status`);
}

export async function getRuns(limit: number = 20): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/runs?limit=${limit}`);
}

export async function deleteRun(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/runs/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.text();
      console.error(`删除报告失败: ${error}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`删除报告异常: ${error}`);
    return false;
  }
}

export async function deleteAllRuns(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/runs`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.text();
      console.error(`删除所有报告失败: ${error}`);
      return { success: false, error };
    }
    const data = await res.json();
    return { success: true, count: data.count };
  } catch (error) {
    console.error(`删除所有报告异常: ${error}`);
    return { success: false, error: String(error) };
  }
}

export async function getFlakyTests(threshold: number = 0.3): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/flaky?threshold=${threshold}`);
}

export async function getQuarantinedTests(): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/flaky/quarantined`);
}

export async function releaseTest(testId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/flaky/${encodeURIComponent(testId)}/release`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAnnotations(testDir: string = './'): Promise<any[] | null> {
  return fetchJSON(`${API_BASE}/annotations?testDir=${encodeURIComponent(testDir)}`);
}

export interface DiscoveredTest {
  id: string;
  title: string;
  fullTitle: string;
  file: string;
  line: number;
  column: number;
  tags: string[];
  annotations: Array<{ type: string; description?: string }>;
}

export interface DiscoveredDescribe {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: DiscoveredTest[];
  describes: DiscoveredDescribe[];
}

export interface DiscoveredFile {
  file: string;
  title: string;
  describes: DiscoveredDescribe[];
  tests: DiscoveredTest[];
}

export interface ConfigValidationResult {
  valid: boolean;
  configPath: string | null;
  configExists: boolean;
  testDir: string | null;
  testDirAbsolute: string | null;
  error?: string;
  warnings: string[];
}

export interface TestDiscoveryResult {
  total: number;
  files: DiscoveredFile[];
  tests: DiscoveredTest[];
  configValidation?: ConfigValidationResult;
  error?: string;
  rawOutput?: string;
}

export async function getTests(testDir: string = './', configPath?: string): Promise<{
  total: number;
  tests: Array<{
    id: string;
    title: string;
    fullTitle: string;
    file: string;
    line?: number;
    column?: number;
    tags: string[];
    annotations: Array<{ type: string; description?: string }>;
  }>;
} | null> {
  let url = `${API_BASE}/tests?testDir=${encodeURIComponent(testDir)}`;
  if (configPath) {
    url += `&configPath=${encodeURIComponent(configPath)}`;
  }
  return fetchJSON(url);
}

export async function getTestsStructured(testDir: string = './', configPath?: string, forceRefresh: boolean = false): Promise<TestDiscoveryResult | null> {
  let url = `${API_BASE}/tests?testDir=${encodeURIComponent(testDir)}&structured=true`;
  if (configPath) {
    url += `&configPath=${encodeURIComponent(configPath)}`;
  }
  if (forceRefresh) {
    url += `&force=true`;
  }
  return fetchJSON(url);
}

export async function refreshTests(testDir: string = './', configPath?: string): Promise<{ success: boolean; message: string; total: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/tests/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testDir, configPath }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getTestStats(testDir: string = './'): Promise<{
  totalTests: number;
  totalFiles: number;
  byTag: Record<string, number>;
  byFile: Record<string, number>;
} | null> {
  return fetchJSON(`${API_BASE}/tests/stats?testDir=${encodeURIComponent(testDir)}`);
}

export async function getConfig(): Promise<{ testDir: string } | null> {
  return fetchJSON(`${API_BASE}/config`);
}

export async function getPreferences(): Promise<Record<string, string> | null> {
  return fetchJSON(`${API_BASE}/preferences`);
}

export async function savePreferences(prefs: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRun(id: string): Promise<any | null> {
  return fetchJSON(`${API_BASE}/runs/${id}/raw`);
}

export async function getReportPaths(): Promise<{
  playwrightReport: string | null;
  artifacts: string | null;
  reportExists: boolean;
} | null> {
  return fetchJSON(`${API_BASE}/reports/paths`);
}

export async function setTestDir(testDir: string): Promise<{ 
  success: boolean; 
  testDir?: string; 
  resolvedPath?: string; 
  configPath?: string | null;
  configExists?: boolean;
  warnings?: string[];
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/testdir?lang=${currentLang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testDir }),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, ...data };
    } else {
      return { success: false, error: data.error || 'Failed to set test directory' };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function validateTestDir(testDir: string): Promise<{
  valid: boolean;
  configPath?: string | null;
  configExists?: boolean;
  testDir?: string | null;
  testDirAbsolute?: string | null;
  error?: string;
  warnings?: string[];
}> {
  try {
    const res = await fetch(`${API_BASE}/testdir/validate?testDir=${encodeURIComponent(testDir)}`);
    const data = await res.json();
    return data;
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getHealthMetrics(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<any[] | null> {
  let url = `${API_BASE}/health/metrics`;
  const params = new URLSearchParams();
  
  if (options?.startDate) params.append('startDate', options.startDate);
  if (options?.endDate) params.append('endDate', options.endDate);
  
  const queryString = params.toString();
  if (queryString) url += `?${queryString}`;
  
  return fetchJSON(url);
}

export async function rerunTest(runId: string, testId: string, testLocation: string): Promise<StartRunResult> {
  try {
    const res = await fetch(`${API_BASE}/runs/${runId}/tests/${testId}/rerun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testLocation
      }),
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
