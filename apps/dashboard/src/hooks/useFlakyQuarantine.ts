import { useState, useCallback } from 'react';
import * as api from '../services/api';
import type { FlakyTest, QuarantinedTest } from '../types';

export function useFlakyQuarantine() {
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [quarantinedTests, setQuarantinedTests] = useState<QuarantinedTest[]>([]);

  const refreshFlakyData = useCallback(async () => {
    const [flakyData, quarantinedData] = await Promise.all([
      api.getFlakyTests(),
      api.getQuarantinedTests(),
    ]);
    if (flakyData) setFlakyTests(flakyData);
    if (quarantinedData) setQuarantinedTests(quarantinedData);
  }, []);

  const handleReleaseTest = useCallback(async (testId: string) => {
    await api.releaseTest(testId);
    const data = await api.getQuarantinedTests();
    if (data) setQuarantinedTests(data);
  }, []);

  const handleValidateReleaseTest = useCallback(async (testId: string) => {
    const result = await api.validateAndReleaseTest(testId);
    if (result) {
      const data = await api.getQuarantinedTests();
      if (data) setQuarantinedTests(data);
    }
  }, []);

  const handleClearFlakyHistory = useCallback(async () => {
    const success = await api.clearFlakyHistory();
    if (success) {
      await refreshFlakyData();
    }
  }, [refreshFlakyData]);

  return {
    flakyTests,
    setFlakyTests,
    quarantinedTests,
    setQuarantinedTests,
    refreshFlakyData,
    handleReleaseTest,
    handleValidateReleaseTest,
    handleClearFlakyHistory,
  };
}
