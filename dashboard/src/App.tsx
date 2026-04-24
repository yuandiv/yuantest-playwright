import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import { t, Lang } from './i18n';
import { useWebSocket } from './hooks/useWebSocket';
import * as api from './services/api';
import { setApiLang } from './services/api';
import { TestCase, RunReport, RunDetail, FlakyTest, QuarantinedTest, ServerRun, TestFile, TestDescribe, HealthMetric } from './types';
import { Header } from './components/Header';
import { KPICards } from './components/KPICards';
import { ExecutorDialog } from './components/ExecutorDialog';
import { SidebarCards } from './components/SidebarCards';
import { ReporterPanel } from './components/ReporterPanel';
import { Modal } from './components/Modal';
import { HealthDashboard } from './components/HealthDashboard';
import { BatchUpdater, MessageRateLimiter } from './utils/performance';

const MAX_LOGS = 100;
const LOG_BATCH_SIZE = 30;
const LOG_BATCH_DELAY = 100;
const STATUS_UPDATE_INTERVAL = 200;
const LOCAL_STORAGE_SAVE_DELAY = 2000;

interface TestStatusUpdate {
  status: TestCase['status'];
  lastDuration: number | null;
  lastError: string | null;
}

function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [wsConnected, setWsConnected] = useState(false);
  const [testFiles, setTestFiles] = useState<TestFile[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<RunReport[]>([]);
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [quarantinedTests, setQuarantinedTests] = useState<QuarantinedTest[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<Array<{ msg: string; type: string }>>([]);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const [versionInput, setVersionInput] = useState('1.0.0');
  const [modalContent, setModalContent] = useState<React.ReactNode | null>(null);
  const [isExecutorDialogOpen, setIsExecutorDialogOpen] = useState(false);
  const [testDir, setTestDir] = useState<string>('./');
  const [isLoadingTests, setIsLoadingTests] = useState(false);
  const originalTestFilesRef = useRef<TestFile[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [showHealthDashboard, setShowHealthDashboard] = useState(false);
  const [, startTransition] = useTransition();
  
  const messageRateLimiter = useRef(new MessageRateLimiter(20, 1000));
  const logBatchUpdater = useRef<BatchUpdater<{ msg: string; type: string }> | null>(null);
  const testStatusMapRef = useRef<Map<string, TestStatusUpdate>>(new Map());
  const statusUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const localStorageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const testCasesRef = useRef<TestCase[]>([]);

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  useEffect(() => {
    logBatchUpdater.current = new BatchUpdater<{ msg: string; type: string }>(
      (batchLogs) => {
        setLogs(prev => {
          const newLogs = [...prev, ...batchLogs];
          return newLogs.slice(-MAX_LOGS);
        });
      },
      { batchSize: LOG_BATCH_SIZE, flushDelay: LOG_BATCH_DELAY, immediateTypes: ['info', 'error', 'success', 'warning'], getType: (item) => item.type }
    );

    return () => {
      logBatchUpdater.current?.flush();
      logBatchUpdater.current?.clear();
    };
  }, []);

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

  useEffect(() => {
    api.getPreferences().then(prefs => {
      if (prefs) {
        if (prefs.lang) {
          setLang(prefs.lang as Lang);
          setApiLang(prefs.lang);
        }
        if (prefs.lastVersion) setVersionInput(prefs.lastVersion);
        if (prefs.testDir) setTestDir(prefs.testDir);
      }
    });
  }, []);

  const loadRunsFromServer = useCallback(async () => {
    try {
      const response = await api.getRuns(20);
      if (!response) return;
      const runs = Array.isArray(response) ? response : (response as any).data || [];
      const newReports: RunReport[] = [];
      for (const run of runs) {
        const extractAllTestsFromPlaywright = (suites: any[]): any[] => {
          const tests: any[] = [];
          for (const suite of suites) {
            if (suite.specs && Array.isArray(suite.specs)) {
              tests.push(...suite.specs);
            }
            if (suite.suites && Array.isArray(suite.suites)) {
              tests.push(...extractAllTestsFromPlaywright(suite.suites));
            }
          }
          return tests;
        };
        
        const extractAllTestsFromRunResult = (suites: any[]): any[] => {
          const tests: any[] = [];
          for (const suite of suites) {
            if (suite.tests && Array.isArray(suite.tests)) {
              tests.push(...suite.tests);
            }
            if (suite.suites && Array.isArray(suite.suites)) {
              tests.push(...extractAllTestsFromRunResult(suite.suites));
            }
          }
          return tests;
        };
        
        let rawReport: any = null;
        try {
          const rawResponse = await fetch(`/api/v1/runs/${run.id}/raw`);
          if (rawResponse.ok) {
            rawReport = await rawResponse.json();
          }
        } catch (e) {
          console.warn('Failed to load raw Playwright report:', e);
        }
        
        const isPlaywrightFormat = rawReport?.suites?.some((s: any) => s.specs);
        const isRunResultFormat = rawReport?.suites?.some((s: any) => s.tests && !s.specs);
        
        let allTests: any[] = [];
        if (isPlaywrightFormat && rawReport?.suites) {
          allTests = extractAllTestsFromPlaywright(rawReport.suites);
        } else if (isRunResultFormat && rawReport?.suites) {
          allTests = extractAllTestsFromRunResult(rawReport.suites);
        } else if (run.suites) {
          allTests = extractAllTestsFromRunResult(run.suites);
        }
        
        const details = allTests.map((test: any) => {
          const testResult = test.tests?.[0]?.results?.[0] || test.results?.[0];
          const isPassed = test.ok === true || test.status === 'passed' || testResult?.status === 'passed';
          
          let attachments: any[] = [];
          
          if (testResult?.attachments && Array.isArray(testResult.attachments)) {
            attachments = testResult.attachments.map((att: any) => ({
              name: att.name,
              path: att.path,
              contentType: att.contentType,
              body: att.body,
            }));
          } else {
            if (test.screenshots && Array.isArray(test.screenshots)) {
              attachments.push(...test.screenshots.map((p: string) => ({
                name: 'screenshot',
                path: p,
                contentType: 'image/png',
              })));
            }
            if (test.videos && Array.isArray(test.videos)) {
              attachments.push(...test.videos.map((p: string) => ({
                name: 'video',
                path: p,
                contentType: 'video/webm',
              })));
            }
            if (test.traces && Array.isArray(test.traces)) {
              attachments.push(...test.traces.map((p: string) => ({
                name: 'trace',
                path: p,
                contentType: 'application/zip',
              })));
            }
          }
          
          let errorMessage = null;
          if (testResult?.error) {
            if (typeof testResult.error === 'string') {
              errorMessage = testResult.error;
            } else if (testResult.error.message) {
              errorMessage = testResult.error.message;
              if (testResult.error.stack) {
                errorMessage += '\n\nStack trace:\n' + testResult.error.stack;
              }
            } else if (testResult.error.value) {
              errorMessage = testResult.error.value;
            }
          } else if (test.error?.message) {
            errorMessage = test.error.message;
          } else if (test.error) {
            errorMessage = typeof test.error === 'string' ? test.error : test.error.message || String(test.error);
          }
          
          return {
            id: test.id || `${test.title}_${run.id}`,
            name: test.title,
            status: isPassed ? 'passed' as const : 'failed' as const,
            duration: ((test.duration || testResult?.duration || 0) / 1000).toFixed(2),
            error: errorMessage,
            attachments,
            file: test.file,
            line: test.line,
            retries: test.retries || testResult?.retry || 0,
            manualReruns: test.manualReruns || 0,
          };
        });
        
        newReports.push({
          id: run.id,
          timestamp: new Date(run.startTime).toISOString(),
          version: run.version || 'unknown',
          totalTests: run.totalTests,
          passed: run.passed,
          failed: run.failed,
          duration: ((run.duration || 0) / 1000).toFixed(2),
          details,
          htmlReportUrl: rawReport?.htmlReportUrl || null,
          skippedQuarantinedTests: run.metadata?.skippedQuarantinedTests || [],
        });
      }
      setReports(prev => {
        const existingIds = new Set(prev.map(r => r.id));
        const merged = [...prev];
        for (const r of newReports) {
          if (!existingIds.has(r.id)) merged.unshift(r);
        }
        return merged.slice(0, 50);
      });
    } catch (error) {
      console.error('Failed to load runs from server:', error);
    }
  }, []);

  const loadHealthMetrics = useCallback(async () => {
    try {
      const metricsData = await api.getHealthMetrics();
      if (metricsData) {
        setHealthMetrics(metricsData);
      }
    } catch (error) {
      console.error('Failed to load health metrics:', error);
    }
  }, []);

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type !== 'log' && !messageRateLimiter.current.shouldProcess(msg.type)) {
      return;
    }

    if (msg.type === 'connected') {
      setWsConnected(true);
    } else if (msg.type === 'report_created') {
      const report = msg.payload;
      const newReport: RunReport = {
        id: report.id,
        timestamp: new Date(report.startTime).toISOString(),
        version: report.version,
        totalTests: report.totalTests,
        passed: report.passed,
        failed: report.failed,
        skipped: report.skipped,
        duration: '0',
        details: [],
        status: 'running',
      };
      setReports(prev => {
        if (prev.some(r => r.id === newReport.id)) return prev;
        return [newReport, ...prev];
      });
      setActiveReportId(newReport.id);
    } else if (msg.type === 'report_updated') {
      const { runId, totalTests, passed, failed, skipped, status, testResult } = msg.payload;
      setReports(prev => prev.map(report => {
        if (report.id !== runId) return report;
        
        const newDetails = [...report.details];
        if (testResult) {
          const existingIndex = newDetails.findIndex(d => d.id === testResult.id);
          const newDetail: RunDetail = {
            id: testResult.id,
            name: testResult.title,
            status: testResult.status === 'passed' ? 'passed' : 'failed',
            duration: ((testResult.duration || 0) / 1000).toFixed(2),
            error: testResult.error || null,
            file: testResult.file,
            line: testResult.line,
            retries: testResult.retries || 0,
          };
          if (existingIndex >= 0) {
            newDetails[existingIndex] = newDetail;
          } else {
            newDetails.push(newDetail);
          }
        }
        
        return {
          ...report,
          totalTests: totalTests ?? report.totalTests,
          passed: passed ?? report.passed,
          failed: failed ?? report.failed,
          skipped: skipped ?? report.skipped,
          status: status || report.status,
          details: newDetails,
        };
      }));
    } else if (msg.type === 'run_started') {
      setIsExecuting(true);
      logBatchUpdater.current?.add({ msg: `📡 ${t('running', lang)}...`, type: 'info' });
      
      const selectedArr = Array.from(selectedIds);
      startTransition(() => {
        setTestCases(prev => prev.map(tc => 
          selectedIds.has(tc.id) ? { ...tc, status: 'pending' as const } : tc
        ));
      });
    } else if (msg.type === 'run_progress') {
      // 由test_result消息处理状态更新
    } else if (msg.type === 'log') {
      const logMsg = msg.payload?.message || '';
      const logType = msg.payload?.logType || 'info';
      if (logMsg.trim()) {
        let displayType = 'info';
        if (logType === 'stderr') {
          displayType = 'error';
        } else if (logType === 'stdout') {
          displayType = 'info';
        } else if (logType === 'info') {
          displayType = 'info';
        }
        logBatchUpdater.current?.add({ msg: logMsg.trim(), type: displayType });
      }
    } else if (msg.type === 'run_completed') {
      setIsExecuting(false);
      const result = msg.payload;
      
      setReports(prev => prev.map(report => {
        if (report.id !== result.id) return report;
        return {
          ...report,
          totalTests: result.totalTests,
          passed: result.passed,
          failed: result.failed,
          skipped: result.skipped,
          duration: ((result.duration || 0) / 1000).toFixed(2),
          status: result.status === 'success' ? 'completed' : 'failed',
        };
      }));
      
      logBatchUpdater.current?.add({ msg: `✅ ${t('idle', lang)}`, type: 'success' });
      logBatchUpdater.current?.flush();
      
      startTransition(() => {
        setTestCases(prev => prev.map(tc => 
          tc.status === 'running' ? { ...tc, status: 'idle' as const } : tc
        ));
      });
      
      setTimeout(() => {
        loadRunsFromServer();
      }, 500);
    } else if (msg.type === 'test_result') {
      const r = msg.payload;
      logBatchUpdater.current?.add({
        msg: `${r.status === 'passed' ? '✅' : '❌'} ${r.fullTitle || r.title} (${((r.duration || 0) / 1000).toFixed(1)}s)`,
        type: r.status === 'passed' ? 'success' : 'error',
      });
      const newStatus = r.status === 'passed' ? 'passed' as const : 
                        r.status === 'failed' ? 'failed' as const : 
                        r.status === 'skipped' ? 'idle' as const : 
                        r.status === 'timedout' ? 'failed' as const : undefined;
      
      if (newStatus && r.id) {
        scheduleStatusUpdate(r.id, {
          status: newStatus,
          lastDuration: r.duration ?? null,
          lastError: r.error ?? null,
        });
      }
    } else if (msg.type === 'test_result_batch') {
      const { results, currentProgress } = msg.payload;
      const runId = msg.runId;
      
      setReports(prev => prev.map(report => {
        if (report.id !== runId) return report;
        
        const newDetails = [...report.details];
        for (const r of results) {
          const existingIndex = newDetails.findIndex(d => d.id === r.id);
          const newDetail: RunDetail = {
            id: r.id,
            name: r.title,
            status: r.status === 'passed' ? 'passed' : 'failed',
            duration: ((r.duration || 0) / 1000).toFixed(2),
            error: r.error || null,
            file: r.file,
            line: r.line,
            retries: r.retries || 0,
          };
          if (existingIndex >= 0) {
            newDetails[existingIndex] = newDetail;
          } else {
            newDetails.push(newDetail);
          }
        }
        
        return {
          ...report,
          totalTests: currentProgress?.totalTests ?? report.totalTests,
          passed: currentProgress?.passed ?? report.passed,
          failed: currentProgress?.failed ?? report.failed,
          skipped: currentProgress?.skipped ?? report.skipped,
          details: newDetails,
        };
      }));
      
      for (const r of results) {
        const newStatus = r.status === 'passed' ? 'passed' as const : 
                          r.status === 'failed' ? 'failed' as const : 
                          r.status === 'skipped' ? 'idle' as const : 
                          r.status === 'timedout' ? 'failed' as const : undefined;
        
        if (newStatus && r.id) {
          scheduleStatusUpdate(r.id, {
            status: newStatus,
            lastDuration: r.duration ?? null,
            lastError: r.error ?? null,
          });
        }
      }
    } else if (msg.type === 'error') {
      logBatchUpdater.current?.add({ msg: `❌ ${msg.payload.error}`, type: 'error' });
    }
  }, [lang, selectedIds, loadRunsFromServer, scheduleStatusUpdate]);

  useEffect(() => {
    testCasesRef.current = testCases;
  }, [testCases]);

  const { isConnected } = useWebSocket(wsUrl, handleWsMessage);

  useEffect(() => {
    setWsConnected(isConnected());
  }, [isConnected]);

  const addLog = useCallback((msg: string, type: string) => {
    logBatchUpdater.current?.add({ msg, type });
  }, []);

  const loadTests = useCallback(async (forceRefresh: boolean = false, testDirOverride?: string): Promise<{
    count: number;
    error?: string;
    rawOutput?: string;
  }> => {
    const dirToUse = testDirOverride ?? testDir;
    console.log('[loadTests] dirToUse:', dirToUse, 'testDir:', testDir, 'testDirOverride:', testDirOverride);
    const result = await api.getTestsStructured(dirToUse, undefined, forceRefresh);
    console.log('[loadTests] result:', result ? { 
      filesLength: result.files?.length, 
      testsLength: result.tests?.length,
      configValidation: result.configValidation,
      error: result.error,
      rawOutput: result.rawOutput ? '(present)' : undefined
    } : null);
    
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
      
      const cases = extractAllTests(files);
      setTestCases(cases);
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
      
      const cases = extractAllTests(files);
      setTestCases(cases);
      setSelectedIds(new Set(cases.map(c => c.id)));
      return { count: cases.length };
    } else if (result && result.configValidation && !result.configValidation.valid) {
      setTestFiles([]);
      setTestCases([]);
      setSelectedIds(new Set());
      return { count: 0 };
    } else {
      const annotations = await api.getAnnotations(dirToUse);
      if (annotations && annotations.length > 0) {
        const seen = new Set<string>();
        const cases: TestCase[] = [];
        for (const ann of annotations) {
          if (!seen.has(ann.testId)) {
            seen.add(ann.testId);
            cases.push({
              id: ann.testId,
              name: ann.testName,
              fullTitle: ann.testName,
              file: ann.file,
              line: 0,
              column: 0,
              lastDuration: null,
              lastError: null,
            });
          }
        }
        if (cases.length > 0) {
          setTestCases(cases);
          setSelectedIds(new Set(cases.map(c => c.id)));
          return { count: cases.length };
        }
      }
    }
    return { count: 0 };
  }, [testDir]);

  useEffect(() => {
    loadTests();
    api.getFlakyTests().then(data => data && setFlakyTests(data));
    api.getQuarantinedTests().then(data => data && setQuarantinedTests(data));
    loadRunsFromServer();
    loadHealthMetrics();
  }, [loadTests, loadRunsFromServer, loadHealthMetrics]);

  const handleTestDirChange = useCallback(async (newTestDir: string) => {
    setIsLoadingTests(true);
    setTestFiles([]);
    setTestCases([]);
    setSelectedIds(new Set());
    localStorage.removeItem('testCasesStatus');
    addLog(`📁 ${t('selectTestDir', lang)}: ${newTestDir}`, 'info');
    try {
      const result = await api.setTestDir(newTestDir);
      if (result.success) {
        addLog(`⏳ ${t('loadingTests', lang)}，${t('pleaseWait', lang)}`, 'info');
        setTestDir(newTestDir);
        
        if (result.warnings && result.warnings.length > 0) {
          for (const warning of result.warnings) {
            addLog(`⚠️ ${warning}`, 'info');
          }
        }
        
        const loadResult = await loadTests(true, newTestDir);
        addLog(`✅ ${t('testCasesLoadSuccess', lang)} ${loadResult.count} ${t('testCasesFound', lang)}`, 'success');
        if (loadResult.error) {
          addLog(`❌ ${loadResult.error}`, 'error');
        }
        if (loadResult.rawOutput) {
          addLog(`📋 JSON: ${loadResult.rawOutput}`, 'info');
        }
      } else {
        addLog(`❌ ${t('testCasesLoadFailed', lang)}: ${result.error || 'Unknown error'}`, 'error');
      }
    } finally {
      setIsLoadingTests(false);
    }
  }, [lang, addLog, loadTests]);

  const formatStartError = useCallback((error: string): string => {
    if (error.includes('already in progress') || error.includes('execution is already')) {
      return t('executorAlreadyRunning', lang);
    }
    if (error.includes('Invalid testDir') || error.includes('path traversal')) {
      return t('invalidTestDir', lang);
    }
    if (error.includes('Network') || error.includes('fetch')) {
      return t('networkError', lang);
    }
    if (error.startsWith('HTTP 5')) {
      return t('serverError', lang);
    }
    return error;
  }, [lang]);

  const handleRun = async (mode: 'test' | 'describe' | 'file', target: string) => {
    if (isExecuting) {
      addLog(`⚠️ ${t('executorBusy', lang)}`, 'error');
      return;
    }
    setLogs([]);
    logBatchUpdater.current?.clear();
    addLog(`🚀 ${t('startExecution', lang)}...`, 'info');
    
    let result: api.StartRunResult;
    
    if (mode === 'test') {
      const locations = target.includes(',') ? target.split(',') : [target];
      result = await api.startRun({
        version: versionInput,
        testLocations: locations,
      });
    } else if (mode === 'describe') {
      result = await api.startRun({
        version: versionInput,
        describePattern: target,
      });
    } else {
      result = await api.startRun({
        version: versionInput,
        testFiles: [target],
      });
    }
    
    if (result.success) {
      addLog(`✅ ${t('executionStarted', lang)}`, 'success');
    } else {
      const errorMsg = result.error ? formatStartError(result.error) : t('failedToStart', lang);
      addLog(`❌ ${t('failedToStart', lang)}: ${errorMsg}`, 'error');
    }
  };

  const handleRunSelected = async () => {
    if (isExecuting) {
      addLog(`⚠️ ${t('executorBusy', lang)}`, 'error');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      addLog(`⚠️ ${t('noSelection', lang)}`, 'error');
      return;
    }
    setLogs([]);
    logBatchUpdater.current?.clear();
    addLog(`🚀 ${t('startExecution', lang)}...`, 'info');
    
    const testLocations = ids.map(id => {
      const tc = testCases.find(c => c.id === id);
      return tc ? `${tc.file}:${tc.line}` : null;
    }).filter((loc): loc is string => loc !== null);
    
    const result = await api.startRun({
      version: versionInput,
      testLocations,
    });
    if (result.success) {
      addLog(`✅ ${t('executionStarted', lang)}`, 'success');
    } else {
      const errorMsg = result.error ? formatStartError(result.error) : t('failedToStart', lang);
      addLog(`❌ ${t('failedToStart', lang)}: ${errorMsg}`, 'error');
    }
  };

  const handleStop = async () => {
    if (!isExecuting) {
      addLog(`ℹ️ ${t('noTask', lang)}`, 'info');
      return;
    }
    addLog(`🛑 ${t('aborting', lang)}`, 'error');
    logBatchUpdater.current?.flush();
    await api.stopRun();
  };

  const handleReleaseTest = async (testId: string) => {
    await api.releaseTest(testId);
    const data = await api.getQuarantinedTests();
    if (data) setQuarantinedTests(data);
  };

  const handleDeleteReport = (reportId: number) => {
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  const handleDeleteAllReports = () => {
    setReports([]);
  };

  const switchLang = (l: Lang) => {
    setLang(l);
    setApiLang(l);
    api.savePreferences({ lang: l });
  };

  const total = testCases.length;
  const passed = useMemo(() => testCases.filter(tc => tc.status === 'passed').length, [testCases]);
  const failed = useMemo(() => testCases.filter(tc => tc.status === 'failed').length, [testCases]);
  const pending = useMemo(() => testCases.filter(tc => tc.status === 'pending').length, [testCases]);

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

  return (
    <div className="max-w-[1680px] mx-auto">
      <Header 
        lang={lang} 
        wsConnected={wsConnected} 
        hasTestCases={testCases.length > 0}
        onSwitchLang={switchLang} 
        onOpenExecutor={() => setIsExecutorDialogOpen(true)}
        showHealthDashboard={showHealthDashboard}
        onToggleHealthDashboard={() => setShowHealthDashboard(!showHealthDashboard)}
      />
      
      {showHealthDashboard ? (
        <HealthDashboard 
          lang={lang} 
          data={healthMetrics}
          onRefresh={loadHealthMetrics}
        />
      ) : (
        <>
          <KPICards lang={lang} total={total} passed={passed} failed={failed} pending={pending} />
          <div className="mb-5">
        <SidebarCards
          lang={lang}
          reports={reports}
          flakyTests={flakyTests}
          quarantinedTests={quarantinedTests}
          onReleaseTest={handleReleaseTest}
          onRefresh={loadRunsFromServer}
          onModal={setModalContent}
        />
      </div>
      <ReporterPanel
        lang={lang}
        reports={reports}
        activeReportId={activeReportId}
        onActiveReportChange={setActiveReportId}
        onRefresh={loadRunsFromServer}
        onDeleteReport={handleDeleteReport}
        onDeleteAllReports={handleDeleteAllReports}
      />
        </>
      )}
      <ExecutorDialog
        isOpen={isExecutorDialogOpen}
        onClose={() => setIsExecutorDialogOpen(false)}
        lang={lang}
        testFiles={testFiles}
        testCases={testCases}
        selectedIds={selectedIds}
        expandedPaths={expandedPaths}
        isExecuting={isExecuting}
        isLoadingTests={isLoadingTests}
        logs={logs}
        versionInput={versionInput}
        testDir={testDir}
        onSelectedIdsChange={setSelectedIds}
        onExpandedPathsChange={setExpandedPaths}
        onRun={handleRun}
        onStop={handleStop}
        onClearLogs={() => { setLogs([]); addLog(`✨ ${t('logsCleared', lang)}`, 'info'); }}
        onVersionChange={setVersionInput}
        onTestDirChange={handleTestDirChange}
        onSelectAll={() => setSelectedIds(new Set(testCases.map(tc => tc.id)))}
        onClearAll={() => setSelectedIds(new Set())}
        onExpandAll={() => setExpandedPaths(collectAllPaths())}
        onCollapseAll={() => setExpandedPaths(new Set())}
        onModal={setModalContent}
      />
      <Modal content={modalContent} onClose={() => setModalContent(null)} />
    </div>
  );
}

export default App;
