import { useState, useCallback } from 'react';
import * as api from '../services/api';
import type { HealthMetric } from '../types';

export function useHealthMetrics() {
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [showHealthDashboard, setShowHealthDashboard] = useState(false);

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

  return {
    healthMetrics,
    setHealthMetrics,
    showHealthDashboard,
    setShowHealthDashboard,
    loadHealthMetrics,
  };
}
