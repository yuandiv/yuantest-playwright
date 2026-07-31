import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import { t, Lang } from '../i18n';
import * as api from '../services/api';
import type { RunStatusResponse } from '../services/api';
import type { TestCase } from '../types';
import { BatchUpdater, MessageRateLimiter } from '../utils/performance';

const MAX_LOGS = 100;
const LOG_BATCH_SIZE = 30;
const LOG_BATCH_DELAY = 100;

export function useExecution() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ msg: string; type: string }>>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const messageRateLimiter = useRef(new MessageRateLimiter(20, 1000));
  const logBatchUpdater = useRef<BatchUpdater<{ msg: string; type: string }> | null>(null);

  const [, startTransition] = useTransition();

  // Initialize logBatchUpdater
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

  const addLog = useCallback((msg: string, type: string) => {
    logBatchUpdater.current?.add({ msg, type });
  }, []);

  const clearLogs = useCallback((lang: Lang) => {
    setLogs([]);
    addLog(`✨ ${t('logsCleared', lang)}`, 'info');
  }, [addLog]);

  const formatStartError = useCallback((error: string, lang: Lang): string => {
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
  }, []);

  const restoreExecutionState = useCallback((status: RunStatusResponse, testCasesRef: React.RefObject<TestCase[]>) => {
    if (!status.isRunning || !status.currentRun) return;

    const { currentRun } = status;
    setIsExecuting(true);

    const completedMap = new Map<string, { status: string; duration: number; error?: string }>();
    for (const r of currentRun.testResults) {
      completedMap.set(r.id, { status: r.status, duration: r.duration, error: r.error });
    }

    const testLocations = currentRun.testLocations;
    const testFiles = currentRun.testFiles;

    const currentCases = testCasesRef.current;
    const executingIds = new Set<string>();

    if (testLocations && testLocations.length > 0) {
      const locationSet = new Set(testLocations);
      for (const tc of currentCases) {
        const loc = `${tc.file}:${tc.line}`;
        if (locationSet.has(loc)) {
          executingIds.add(tc.id);
        }
      }
    } else if (testFiles && testFiles.length > 0) {
      const fileSet = new Set(testFiles);
      for (const tc of currentCases) {
        if (fileSet.has(tc.file)) {
          executingIds.add(tc.id);
        }
      }
    } else if (currentRun.testResults.length > 0) {
      const executingFiles = new Set<string>();
      for (const r of currentRun.testResults) {
        if (r.file) executingFiles.add(r.file);
      }
      for (const tc of currentCases) {
        if (executingFiles.has(tc.file)) {
          executingIds.add(tc.id);
        }
      }
    }

    return {
      executingIds,
      completedMap,
      currentRunId: currentRun.id,
    };
  }, []);

  // Execution health check
  useEffect(() => {
    if (!isExecuting) return;

    const EXECUTION_HEALTH_CHECK_INTERVAL = 30000;

    const checkExecutionHealth = () => {
      api.getRunStatus().then(status => {
        if (!status || !status.isRunning) {
          setIsExecuting(false);
          setCurrentTest(null);
        }
      });
    };

    const timer = setInterval(checkExecutionHealth, EXECUTION_HEALTH_CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [isExecuting]);

  return {
    isExecuting,
    setIsExecuting,
    currentTest,
    setCurrentTest,
    logs,
    setLogs,
    wsConnected,
    setWsConnected,
    messageRateLimiter,
    logBatchUpdater,
    addLog,
    clearLogs,
    formatStartError,
    restoreExecutionState,
    startTransition,
  };
}
