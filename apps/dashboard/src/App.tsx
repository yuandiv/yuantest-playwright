import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { t, Lang } from './i18n';
import { useWebSocket } from './hooks/useWebSocket';
import * as api from './services/api';
import { TestCase, RunReport, RunDetail } from './types';
import { Header } from './components/Header';
import { LLMStatusProvider } from './contexts/LLMStatusContext';
import { KPICards } from './components/KPICards';
import { ExecutorDialog } from './components/ExecutorDialog';
import { SidebarCards } from './components/SidebarCards';
import { FlakyTestsDialog } from './components/FlakyTestsDialog';
import { ReporterPanel } from './components/ReporterPanel';
import { Modal } from './components/Modal';
import { HealthDashboard } from './components/HealthDashboard';
import { TestHistoryDialog } from './components/TestHistoryDialog';
import { ChatPanel } from './components/ChatPanel';
import { usePreferences } from './hooks/usePreferences';
import { useTestTree } from './hooks/useTestTree';
import { useExecution } from './hooks/useExecution';
import { useReports } from './hooks/useReports';
import { useFlakyQuarantine } from './hooks/useFlakyQuarantine';
import { useHealthMetrics } from './hooks/useHealthMetrics';

function App() {
  // Local UI state
  const [modalContent, setModalContent] = useState<React.ReactNode | null>(null);
  const [isExecutorDialogOpen, setIsExecutorDialogOpen] = useState(false);
  const [showTestHistory, setShowTestHistory] = useState<TestCase | null>(null);
  const [isFlakyDialogOpen, setIsFlakyDialogOpen] = useState(false);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);

  // Custom hooks
  const preferences = usePreferences();
  const { lang, versionInput, testDir, criteriaParams, switchLang, setVersionInput, setTestDir } = preferences;

  const reportsHook = useReports();
  const {
    reports, setReports, activeReportId, setActiveReportId,
    loadRunsFromServer, isExecutingFromReports, setIsExecutingFromReports,
  } = reportsHook;

  const testTree = useTestTree(reports);
  const {
    testFiles, testCases, setTestCases, selectedIds, setSelectedIds,
    expandedPaths, setExpandedPaths, fileOrder, setFileOrder,
    isLoadingTests, setIsLoadingTests, configWorkers,
    testCasesRef, lastLoadTestsTimeRef, LOAD_TESTS_CACHE_TTL,
    scheduleStatusUpdate, loadTests, collectAllPaths, startTransition,
  } = testTree;

  const execution = useExecution();
  const {
    isExecuting, setIsExecuting, currentTest, setCurrentTest,
    logs, setLogs, wsConnected, setWsConnected,
    messageRateLimiter, logBatchUpdater, addLog, clearLogs,
    formatStartError, restoreExecutionState,
  } = execution;

  const lastRunningTestIdRef = useRef<string | null>(null);

  const flakyQuarantine = useFlakyQuarantine();
  const {
    flakyTests, quarantinedTests, setFlakyTests, setQuarantinedTests,
    refreshFlakyData, handleReleaseTest, handleValidateReleaseTest,
    handleClearFlakyHistory,
  } = flakyQuarantine;

  const healthHook = useHealthMetrics();
  const {
    healthMetrics, showHealthDashboard, setShowHealthDashboard,
    loadHealthMetrics,
  } = healthHook;

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  // handleDeleteReport / handleDeleteAllReports need refreshFlakyData
  const handleDeleteReport = useCallback((reportId: number) => {
    setReports(prev => prev.filter(r => r.id !== reportId));
    refreshFlakyData();
  }, [refreshFlakyData, setReports]);

  const handleDeleteAllReports = useCallback(() => {
    setReports([]);
    refreshFlakyData();
  }, [refreshFlakyData, setReports]);

  // Cross-hook coordinator: handleWsMessage
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
          const existingDetail = existingIndex >= 0 ? newDetails[existingIndex] : null;
          const newDetail: RunDetail = {
            id: testResult.id,
            name: testResult.title,
            status: testResult.status === 'passed' ? 'passed' : 'failed',
            duration: ((testResult.duration || 0) / 1000).toFixed(2),
            error: testResult.error || null,
            file: testResult.file,
            line: testResult.line,
            retries: testResult.retries || 0,
            manualReruns: testResult.manualReruns ?? existingDetail?.manualReruns ?? 0,
            runHistory: testResult.runHistory || undefined,
          };
          if (existingIndex >= 0) {
            newDetails[existingIndex] = newDetail;
          } else {
            newDetails.push(newDetail);
          }
        }

        const startTime = new Date(report.timestamp).getTime();
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

        const terminalStatuses = ['completed', 'failed', 'cancelled'];
        const isTerminal = report.status ? terminalStatuses.includes(report.status) : false;
        const effectiveStatus = (isTerminal && status === 'running') ? report.status : (status || report.status);

        return {
          ...report,
          totalTests: totalTests ?? report.totalTests,
          passed: passed ?? report.passed,
          failed: failed ?? report.failed,
          skipped: skipped ?? report.skipped,
          duration: elapsedSeconds,
          status: effectiveStatus,
          details: newDetails,
        };
      }));

      if (status === 'completed' && testResult?.manualReruns) {
        setTimeout(() => {
          loadRunsFromServer();
          loadHealthMetrics();
        }, 500);
      }
    } else if (msg.type === 'run_started') {
      setIsExecuting(true);
      setCurrentTest(null);
      logBatchUpdater.current?.add({ msg: `📡 ${t('running', lang)}...`, type: 'info' });

      const selectedArr = Array.from(selectedIds);
      startTransition(() => {
        // 执行开始：清空所有用例历史状态（含未选中项），避免 localStorage/旧报告恢复的成功状态
        // 在本次执行中残留为"先计成功"的中间态
        setTestCases(prev => prev.map(tc =>
          selectedIds.has(tc.id)
            ? { ...tc, status: 'pending' as const, lastDuration: null, lastError: null }
            : { ...tc, status: 'idle' as const, lastDuration: null, lastError: null }
        ));
      });
    } else if (msg.type === 'run_progress') {
      const progress = msg.payload;
      if (progress?.currentTest) {
        setCurrentTest(progress.currentTest);
      }
      if (progress?.currentTestId) {
        // Mark the new test as 'running'
        scheduleStatusUpdate(progress.currentTestId, { status: 'running', lastDuration: null, lastError: null });
        lastRunningTestIdRef.current = progress.currentTestId;
      }
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
      setCurrentTest(null);
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
          tc.status === 'running' ? { ...tc, status: 'pending' as const } : tc
        ));
      });

      setTimeout(() => {
        loadRunsFromServer();
        loadHealthMetrics();
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
          const existingDetail = existingIndex >= 0 ? newDetails[existingIndex] : null;
          const newDetail: RunDetail = {
            id: r.id,
            name: r.title,
            status: r.status === 'passed' ? 'passed' : 'failed',
            duration: ((r.duration || 0) / 1000).toFixed(2),
            error: r.error || null,
            file: r.file,
            line: r.line,
            retries: r.retries || 0,
            manualReruns: r.manualReruns ?? existingDetail?.manualReruns ?? 0,
            runHistory: r.runHistory || undefined,
          };
          if (existingIndex >= 0) {
            newDetails[existingIndex] = newDetail;
          } else {
            newDetails.push(newDetail);
          }
        }

        const startTime = new Date(report.timestamp).getTime();
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

        return {
          ...report,
          totalTests: currentProgress?.totalTests ?? report.totalTests,
          passed: currentProgress?.passed ?? report.passed,
          failed: currentProgress?.failed ?? report.failed,
          skipped: currentProgress?.skipped ?? report.skipped,
          duration: elapsedSeconds,
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
      if (isExecuting) {
        api.getRunStatus().then(status => {
          if (!status || !status.isRunning) {
            setIsExecuting(false);
            setCurrentTest(null);
            startTransition(() => {
              setTestCases(prev => prev.map(tc =>
                tc.status === 'running' ? { ...tc, status: 'pending' as const } : tc
              ));
            });
          }
        });
      }
    }
  }, [lang, selectedIds, loadRunsFromServer, loadHealthMetrics, scheduleStatusUpdate, isExecuting, setWsConnected, setReports, setActiveReportId, setIsExecuting, setCurrentTest, setTestCases, logBatchUpdater, messageRateLimiter, startTransition]);

  // handleWsReconnect
  const handleWsReconnect = useCallback(() => {
    api.getRunStatus().then(status => {
      if (status && status.isRunning) {
        const result = restoreExecutionState(status, testCasesRef);
        if (result) {
          setIsExecuting(true);
          if (result.currentRunId) {
            setActiveReportId(Number(result.currentRunId));
          }
          if (result.executingIds.size > 0) {
            setSelectedIds(result.executingIds);
          }
          setTestCases(prev => prev.map(tc => {
            if (result.completedMap.has(tc.id)) {
              const res = result.completedMap.get(tc.id)!;
              const newStatus = res.status === 'passed' ? 'passed' as const :
                               res.status === 'failed' ? 'failed' as const :
                               res.status === 'timedout' ? 'failed' as const :
                               res.status === 'skipped' ? 'idle' as const : tc.status;
              return {
                ...tc,
                status: newStatus,
                lastDuration: res.duration ?? tc.lastDuration,
                lastError: res.error ?? tc.lastError,
              };
            }
            if (result.executingIds.has(tc.id)) {
              return { ...tc, status: 'pending' as const };
            }
            return { ...tc, status: 'idle' as const };
          }));
        }
      } else {
        setIsExecuting(false);
      }
    });

    loadRunsFromServer();
    loadHealthMetrics();

    api.getFlakyTests().then(data => data && setFlakyTests(data));
    api.getQuarantinedTests().then(data => data && setQuarantinedTests(data));
  }, [loadRunsFromServer, loadHealthMetrics, restoreExecutionState, testCasesRef, setIsExecuting, setActiveReportId, setSelectedIds, setTestCases, setFlakyTests, setQuarantinedTests]);

  const { isConnected } = useWebSocket(wsUrl, handleWsMessage, { onReconnect: handleWsReconnect });

  useEffect(() => {
    setWsConnected(isConnected());
  }, [isConnected, setWsConnected]);

  // Sync isExecutingFromReports to isExecuting
  useEffect(() => {
    if (isExecutingFromReports) {
      setIsExecuting(true);
      setIsExecutingFromReports(false);
    }
  }, [isExecutingFromReports, setIsExecuting, setIsExecutingFromReports]);

  // Initial data load
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTestsTimeRef.current;

    const loadPromise = timeSinceLastLoad < LOAD_TESTS_CACHE_TTL && testCases.length > 0
      ? Promise.resolve()
      : loadTests(false, testDir).then(() => { lastLoadTestsTimeRef.current = Date.now(); });

    api.getFlakyTests().then(data => data && setFlakyTests(data));
    api.getQuarantinedTests().then(data => data && setQuarantinedTests(data));
    loadRunsFromServer();
    loadHealthMetrics();

    loadPromise.then(() => {
      api.getRunStatus().then(status => {
        if (status && status.isRunning) {
          const result = restoreExecutionState(status, testCasesRef);
          if (result) {
            setIsExecuting(true);
            if (result.currentRunId) {
              setActiveReportId(Number(result.currentRunId));
            }
            if (result.executingIds.size > 0) {
              setSelectedIds(result.executingIds);
            }
            setTestCases(prev => prev.map(tc => {
              if (result.completedMap.has(tc.id)) {
                const res = result.completedMap.get(tc.id)!;
                const newStatus = res.status === 'passed' ? 'passed' as const :
                                 res.status === 'failed' ? 'failed' as const :
                                 res.status === 'timedout' ? 'failed' as const :
                                 res.status === 'skipped' ? 'idle' as const : tc.status;
                return {
                  ...tc,
                  status: newStatus,
                  lastDuration: res.duration ?? tc.lastDuration,
                  lastError: res.error ?? tc.lastError,
                };
              }
              if (result.executingIds.has(tc.id)) {
                return { ...tc, status: 'pending' as const };
              }
              return { ...tc, status: 'idle' as const };
            }));
          }
        }
      });
    });
  }, [loadTests, loadRunsFromServer, loadHealthMetrics, testCases.length, restoreExecutionState, testDir, testCasesRef, setIsExecuting, setActiveReportId, setSelectedIds, setTestCases, setFlakyTests, setQuarantinedTests, LOAD_TESTS_CACHE_TTL, lastLoadTestsTimeRef]);

  // handleTestDirChange
  const handleTestDirChange = useCallback(async (newTestDir: string) => {
    setIsLoadingTests(true);
    testTree.setTestFiles([]);
    setTestCases([]);
    setSelectedIds(new Set());
    setFileOrder([]);
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

        loadRunsFromServer();
        loadHealthMetrics();
      } else {
        addLog(`❌ ${t('testCasesLoadFailed', lang)}: ${result.error || 'Unknown error'}`, 'error');
      }
    } finally {
      setIsLoadingTests(false);
    }
  }, [lang, addLog, loadTests, loadRunsFromServer, loadHealthMetrics, setIsLoadingTests, setTestCases, setSelectedIds, setFileOrder, setTestDir, testTree]);

  // handleRun
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
      const errorMsg = result.error ? formatStartError(result.error, lang) : t('failedToStart', lang);
      addLog(`❌ ${t('failedToStart', lang)}: ${errorMsg}`, 'error');
    }
  };

  // handleRunSelected
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

    if (fileOrder.length > 0) {
      const fileOrderMap = new Map(fileOrder.map((f, i) => [f, i]));
      testLocations.sort((a, b) => {
        const fileA = a.split(':').slice(0, -1).join(':');
        const fileB = b.split(':').slice(0, -1).join(':');
        const orderA = fileOrderMap.get(fileA) ?? Infinity;
        const orderB = fileOrderMap.get(fileB) ?? Infinity;
        return orderA - orderB;
      });
    }

    const result = await api.startRun({
      version: versionInput,
      testLocations,
    });
    if (result.success) {
      addLog(`✅ ${t('executionStarted', lang)}`, 'success');
    } else {
      const errorMsg = result.error ? formatStartError(result.error, lang) : t('failedToStart', lang);
      addLog(`❌ ${t('failedToStart', lang)}: ${errorMsg}`, 'error');
    }
  };

  // handleStop
  const handleStop = async () => {
    if (!isExecuting) {
      addLog(`ℹ️ ${t('noTask', lang)}`, 'info');
      return;
    }
    addLog(`🛑 ${t('aborting', lang)}`, 'error');
    logBatchUpdater.current?.flush();
    await api.stopRun();
  };

  // Computed values
  const total = testCases.length;
  const passed = useMemo(() => testCases.filter(tc => tc.status === 'passed').length, [testCases]);
  const failed = useMemo(() => testCases.filter(tc => tc.status === 'failed').length, [testCases]);
  const pending = useMemo(() => testCases.filter(tc => tc.status === 'pending').length, [testCases]);

  return (
    <LLMStatusProvider>
    <div className="max-w-[1680px] mx-auto">
      <Header
        lang={lang}
        hasTestCases={testCases.length > 0}
        isExecuting={isExecuting}
        currentTest={currentTest}
        onSwitchLang={switchLang}
        onOpenExecutor={() => setIsExecutorDialogOpen(true)}
        showHealthDashboard={showHealthDashboard}
        onToggleHealthDashboard={() => setShowHealthDashboard(!showHealthDashboard)}
        onOpenChatPanel={() => setIsChatPanelOpen(true)}
      />

      {showHealthDashboard ? (
        <HealthDashboard
          lang={lang}
          data={healthMetrics}
          reports={reports}
          onRefresh={loadHealthMetrics}
          criteriaParams={criteriaParams}
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
              onValidateReleaseTest={handleValidateReleaseTest}
              onRefresh={loadRunsFromServer}
              onModal={setModalContent}
              onClearFlakyHistory={handleClearFlakyHistory}
              onOpenFlakyDialog={() => setIsFlakyDialogOpen(true)}
              onCriteriaSaved={() => { window.dispatchEvent(new CustomEvent('criteria-config-changed')); }}
              criteriaParams={criteriaParams}
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
        currentTest={currentTest}
        isLoadingTests={isLoadingTests}
        logs={logs}
        versionInput={versionInput}
        testDir={testDir}
        onSelectedIdsChange={setSelectedIds}
        onExpandedPathsChange={setExpandedPaths}
        onRun={handleRun}
        onStop={handleStop}
        onClearLogs={() => clearLogs(lang)}
        onVersionChange={setVersionInput}
        onTestDirChange={handleTestDirChange}
        onSelectAll={() => setSelectedIds(new Set(testCases.map(tc => tc.id)))}
        onClearAll={() => setSelectedIds(new Set())}
        onExpandAll={() => setExpandedPaths(collectAllPaths())}
        onCollapseAll={() => setExpandedPaths(new Set())}
        onModal={setModalContent}
        fileOrder={fileOrder}
        onFileOrderChange={setFileOrder}
        onViewTestHistory={(test) => setShowTestHistory(test)}
        configWorkers={configWorkers}
      />
      <TestHistoryDialog
        lang={lang}
        test={showTestHistory}
        onClose={() => setShowTestHistory(null)}
      />
      <FlakyTestsDialog
        isOpen={isFlakyDialogOpen}
        onClose={() => setIsFlakyDialogOpen(false)}
        lang={lang}
        reports={reports}
        flakyTests={flakyTests}
        quarantinedTests={quarantinedTests}
        onReleaseTest={handleReleaseTest}
        onValidateReleaseTest={handleValidateReleaseTest}
        onRefresh={loadRunsFromServer}
        onClearFlakyHistory={handleClearFlakyHistory}
      />
      <Modal content={modalContent} onClose={() => setModalContent(null)} />
      {isChatPanelOpen && (
        <ChatPanel
          lang={lang}
          onClose={() => setIsChatPanelOpen(false)}
        />
      )}
    </div>
    </LLMStatusProvider>
  );
}

export default App;
