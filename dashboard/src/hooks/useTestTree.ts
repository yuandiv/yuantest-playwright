import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import * as api from '../services/api';
import type { TestCase, TestFile, TestDescribe, RunDetail, RunReport } from '../types';

const STATUS_UPDATE_INTERVAL = 200;
const LOCAL_STORAGE_SAVE_DELAY = 2000;

interface TestStatusUpdate {
  status: TestCase['status'];
  lastDuration: number | null;
  lastError: string | null;
}

export function useTestTree(reports: RunReport[]) {
  const [testFiles, setTestFiles] = useState<TestFile[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [fileOrder, setFileOrder] = useState<string[]>([]);
  const [isLoadingTests, setIsLoadingTests] = useState(false);
  const [configWorkers, setConfigWorkers] = useState<number | undefined>(undefined);

  const originalTestFilesRef = useRef<TestFile[]>([]);
  const testCasesRef = useRef<TestCase[]>([]);
  const hasRestoredFromReportsRef = useRef(false);
  const lastLoadTestsTimeRef = useRef<number>(0);
  const localStorageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const testStatusMapRef = useRef<Map<string, TestStatusUpdate>>(new Map());
  const statusUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const LOAD_TESTS_CACHE_TTL = 30000;

  const [, startTransition] = useTransition();

  // Keep testCasesRef in sync
  useEffect(() => {
    testCasesRef.current = testCases;
  }, [testCases]);

  const flushPendingStatusUpdates = useCallback(() => {
    if (testStatusMapRef.current.size === 0) return;

    const updates = new Map(testStatusMapRef.current);

    startTransition(() => {
      setTestCases(prev => {
        let changed = false;
        const next = prev.map(tc => {
          const update = updates.get(tc.id);
          if (update) {
            changed = true;
            return { ...tc, ...update };
          }
          return tc;
        });
        return changed ? next : prev;
      });
    });

    testStatusMapRef.current.clear();

    if (!localStorageTimerRef.current) {
      localStorageTimerRef.current = setTimeout(() => {
        localStorageTimerRef.current = null;
        try {
          localStorage.setItem('testCasesStatus', JSON.stringify(testCasesRef.current));
        } catch {}
      }, LOCAL_STORAGE_SAVE_DELAY);
    }
  }, []);

  const scheduleStatusUpdate = useCallback((testId: string, update: TestStatusUpdate) => {
    testStatusMapRef.current.set(testId, update);

    if (!statusUpdateTimerRef.current) {
      statusUpdateTimerRef.current = setTimeout(() => {
        statusUpdateTimerRef.current = null;
        flushPendingStatusUpdates();
      }, STATUS_UPDATE_INTERVAL);
    }
  }, [flushPendingStatusUpdates]);

  const restoreTestCasesFromLocalStorage = useCallback((cases: TestCase[]): TestCase[] => {
    try {
      const saved = localStorage.getItem('testCasesStatus');
      if (!saved) return cases;

      const savedStatus: TestCase[] = JSON.parse(saved);
      if (!Array.isArray(savedStatus)) return cases;

      const statusMap = new Map<string, TestCase>();
      for (const tc of savedStatus) {
        if (tc.id && tc.status) {
          statusMap.set(tc.id, tc);
        }
      }

      return cases.map(tc => {
        const saved = statusMap.get(tc.id);
        if (saved && saved.status) {
          return {
            ...tc,
            status: saved.status,
            lastDuration: saved.lastDuration ?? tc.lastDuration,
            lastError: saved.lastError ?? tc.lastError,
          };
        }
        return tc;
      });
    } catch (e) {
      console.warn('Failed to restore test cases status from localStorage:', e);
      return cases;
    }
  }, []);

  const restoreTestCasesFromReports = useCallback((cases: TestCase[], reportsList: RunReport[]): TestCase[] => {
    const completedReport = reportsList.find(r => r.status === 'completed' || !r.status);
    if (!completedReport || !completedReport.details || completedReport.details.length === 0) {
      return cases;
    }

    const detailMap = new Map<string, RunDetail>();
    for (const detail of completedReport.details) {
      if (detail.id) {
        detailMap.set(detail.id, detail);
      }
    }

    return cases.map(tc => {
      const detail = detailMap.get(tc.id);
      if (detail) {
        return {
          ...tc,
          status: detail.status,
          lastDuration: detail.duration ? parseFloat(detail.duration) * 1000 : null,
          lastError: detail.error,
        };
      }
      return tc;
    });
  }, []);

  const loadTests = useCallback(async (forceRefresh: boolean = false, testDirOverride?: string): Promise<{
    count: number;
    error?: string;
    rawOutput?: string;
  }> => {
    const dirToUse = testDirOverride ?? (testCasesRef.current.length > 0 ? '' : './');
    // We need testDir from usePreferences, but to avoid circular deps,
    // loadTests will accept testDirOverride and fall back to a provided testDir.
    // The caller (App.tsx) will pass the testDir.
    // For now, we use the testDirOverride parameter.
    // If not provided, we'll use a default. The actual testDir comes from usePreferences.
    const result = await api.getTestsStructured(dirToUse, undefined, forceRefresh);

    const convertTest = (t: api.DiscoveredTest): TestCase => ({
      id: t.id,
      name: t.title,
      fullTitle: t.fullTitle,
      file: t.file,
      line: t.line,
      column: t.column,
      lastDuration: null,
      lastError: null,
    });

    const convertDescribe = (d: api.DiscoveredDescribe): TestDescribe => ({
      title: d.title,
      file: d.file,
      line: d.line,
      column: d.column,
      tests: d.tests.map(convertTest),
      describes: d.describes.map(convertDescribe),
    });

    function extractAllTests(files: TestFile[]): TestCase[] {
      const allTests: TestCase[] = [];
      for (const file of files) {
        function collectFromDescribe(describe: TestDescribe) {
          for (const t of describe.tests) {
            allTests.push(t);
          }
          for (const child of describe.describes) {
            collectFromDescribe(child);
          }
        }
        for (const t of file.tests) {
          allTests.push(t);
        }
        for (const d of file.describes) {
          collectFromDescribe(d);
        }
      }
      return allTests;
    }

    if (result && result.error) {
      setTestFiles([]);
      setTestCases([]);
      setSelectedIds(new Set());
      setFileOrder([]);
      return { count: 0, error: result.error, rawOutput: result.rawOutput };
    }

    if (result && result.files && result.files.length > 0) {
      const files: TestFile[] = result.files.map(f => ({
        file: f.file,
        title: f.title,
        describes: f.describes.map(convertDescribe),
        tests: f.tests.map(convertTest),
      }));

      originalTestFilesRef.current = files;
      setTestFiles(files);
      setFileOrder(files.map(f => f.file));
      setConfigWorkers(result.configValidation?.workers);

      const cases = extractAllTests(files);
      const restoredCases = restoreTestCasesFromLocalStorage(cases);
      setTestCases(restoredCases);
      setSelectedIds(new Set(cases.map(c => c.id)));
      return { count: cases.length };
    } else if (result && result.tests && result.tests.length > 0) {
      const fileMap = new Map<string, TestFile>();

      for (const t of result.tests) {
        const filePath = t.file;
        if (!fileMap.has(filePath)) {
          fileMap.set(filePath, {
            file: filePath,
            title: filePath.split('/').pop() || filePath,
            describes: [],
            tests: [],
          });
        }

        const file = fileMap.get(filePath)!;
        const fullTitle = t.fullTitle || t.title;
        const parts = fullTitle.split(' > ');

        if (parts.length === 1) {
          file.tests.push(convertTest(t));
        } else {
          let currentDescribes = file.describes;
          for (let i = 0; i < parts.length - 1; i++) {
            const describeTitle = parts[i];
            let describe = currentDescribes.find(d => d.title === describeTitle);
            if (!describe) {
              describe = {
                title: describeTitle,
                file: t.file,
                line: i === 0 ? t.line : 0,
                column: 0,
                tests: [],
                describes: [],
              };
              currentDescribes.push(describe);
            }
            currentDescribes = describe.describes;
          }

          const lastDescribe = currentDescribes[currentDescribes.length - 1];
          if (lastDescribe) {
            lastDescribe.tests.push(convertTest(t));
          }
        }
      }

      const files = Array.from(fileMap.values());
      originalTestFilesRef.current = files;
      setTestFiles(files);
      setFileOrder(files.map(f => f.file));
      setConfigWorkers(result.configValidation?.workers);

      const cases = extractAllTests(files);
      const restoredCases = restoreTestCasesFromLocalStorage(cases);
      setTestCases(restoredCases);
      setSelectedIds(new Set(cases.map(c => c.id)));
      return { count: cases.length };
    } else if (result && result.configValidation && !result.configValidation.valid) {
      setTestFiles([]);
      setTestCases([]);
      setSelectedIds(new Set());
      setFileOrder([]);
      return { count: 0 };
    } else {
      const annotations = await api.getAnnotations(dirToUse) as Array<Record<string, any>> | null;
      if (annotations && annotations.length > 0) {
        const seen = new Set<string>();
        const cases: TestCase[] = [];
        for (const ann of annotations) {
          const testId = ann.testId as string;
          const testName = ann.testName as string;
          const file = ann.file as string;
          if (!seen.has(testId)) {
            seen.add(testId);
            cases.push({
              id: testId,
              name: testName,
              fullTitle: testName,
              file: file,
              line: 0,
              column: 0,
              lastDuration: null,
              lastError: null,
            });
          }
        }
        if (cases.length > 0) {
          const restoredCases = restoreTestCasesFromLocalStorage(cases);
          setTestCases(restoredCases);
          setSelectedIds(new Set(cases.map(c => c.id)));
          return { count: cases.length };
        }
      }
    }
    return { count: 0 };
  }, [restoreTestCasesFromLocalStorage]);

  const syncTestFilesWithTestCases = useCallback((files: TestFile[], cases: TestCase[]): TestFile[] => {
    const caseMap = new Map<string, TestCase>();
    for (const tc of cases) {
      caseMap.set(tc.id, tc);
    }

    const syncTestCase = (tc: TestCase): TestCase => {
      const updated = caseMap.get(tc.id);
      if (updated) {
        return {
          ...tc,
          status: updated.status,
          lastDuration: updated.lastDuration,
          lastError: updated.lastError,
        };
      }
      return tc;
    };

    const syncDescribe = (d: TestDescribe): TestDescribe => ({
      ...d,
      tests: d.tests.map(syncTestCase),
      describes: d.describes.map(syncDescribe),
    });

    return files.map(f => ({
      ...f,
      tests: f.tests.map(syncTestCase),
      describes: f.describes.map(syncDescribe),
    }));
  }, []);

  const collectAllPaths = useCallback(() => {
    const paths = new Set<string>();

    for (const file of testFiles) {
      paths.add(file.file);

      const collectDescribePaths = (describe: TestDescribe) => {
        const path = `${describe.file}::${describe.title}::${describe.line}`;
        paths.add(path);
        for (const child of describe.describes) {
          collectDescribePaths(child);
        }
      };

      for (const describe of file.describes) {
        collectDescribePaths(describe);
      }
    }

    return paths;
  }, [testFiles]);

  // Restore from reports effect
  useEffect(() => {
    if (hasRestoredFromReportsRef.current) return;
    if (testCases.length === 0 || reports.length === 0) return;

    const hasAnyStatus = testCases.some(tc => tc.status && tc.status !== 'idle');
    if (hasAnyStatus) {
      hasRestoredFromReportsRef.current = true;
      return;
    }

    const restoredCases = restoreTestCasesFromReports(testCases, reports);
    const hasChanges = restoredCases.some((tc, i) => tc.status !== testCases[i]?.status);

    if (hasChanges) {
      setTestCases(restoredCases);
    }
    hasRestoredFromReportsRef.current = true;
  }, [testCases, reports, restoreTestCasesFromReports]);

  return {
    testFiles,
    setTestFiles,
    testCases,
    setTestCases,
    selectedIds,
    setSelectedIds,
    expandedPaths,
    setExpandedPaths,
    fileOrder,
    setFileOrder,
    isLoadingTests,
    setIsLoadingTests,
    configWorkers,
    setConfigWorkers,
    testCasesRef,
    lastLoadTestsTimeRef,
    LOAD_TESTS_CACHE_TTL,
    scheduleStatusUpdate,
    flushPendingStatusUpdates,
    restoreTestCasesFromLocalStorage,
    restoreTestCasesFromReports,
    loadTests,
    syncTestFilesWithTestCases,
    collectAllPaths,
    startTransition,
  };
}
