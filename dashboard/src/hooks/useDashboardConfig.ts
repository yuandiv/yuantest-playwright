import { useState, useEffect, useCallback } from 'react';
import { DashboardConfig } from '../types';
import { DEFAULT_CONFIG, STORAGE_KEY } from '../constants/dashboard';

/**
 * 仪表盘配置管理 Hook
 * 负责从 localStorage 加载和保存配置
 * @returns 配置对象和更新配置的方法
 */
export function useDashboardConfig() {
  const [config, setConfigState] = useState<DashboardConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load saved dashboard config:', error);
    }
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save dashboard config:', error);
    }
  }, [config]);

  const setConfig = useCallback((updater: (prev: DashboardConfig) => DashboardConfig) => {
    setConfigState(updater);
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(DEFAULT_CONFIG);
  }, []);

  const setDateRange = useCallback((start: string, end: string) => {
    setConfigState(prev => ({
      ...prev,
      dateRange: { start, end },
    }));
  }, []);

  const setActiveTab = useCallback((tab: DashboardConfig['activeTab']) => {
    setConfigState(prev => ({
      ...prev,
      activeTab: tab,
    }));
  }, []);

  return {
    config,
    setConfig,
    resetConfig,
    setDateRange,
    setActiveTab,
  };
}
