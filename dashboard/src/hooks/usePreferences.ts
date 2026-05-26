import { useState, useEffect, useRef } from 'react';
import { Lang } from '../i18n';
import * as api from '../services/api';
import { setApiLang } from '../services/api';

export function usePreferences() {
  const [lang, setLang] = useState<Lang>('zh');
  const [versionInput, setVersionInput] = useState('1.0.0');
  const [testDir, setTestDir] = useState<string>('./');
  const [criteriaParams, setCriteriaParams] = useState<{
    flakyCriteria?: Record<string, number | string>;
    quarantineCriteria?: Record<string, number | string>;
  }>({});
  const versionSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load preferences on mount
  useEffect(() => {
    api.getPreferences().then(prefs => {
      if (prefs) {
        if (prefs.lang) {
          setLang(prefs.lang as Lang);
          setApiLang(prefs.lang);
        }
        if (prefs.lastVersion) setVersionInput(prefs.lastVersion);
        if (prefs.testDir) setTestDir(prefs.testDir);
        const flakyCriteria: Record<string, number | string> = {};
        const quarantineCriteria: Record<string, number | string> = {};
        if (prefs.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
          const fc = prefs.flakyCriteria as Record<string, unknown>;
          for (const [k, v] of Object.entries(fc)) {
            if (typeof v === 'number') flakyCriteria[k] = v;
          }
        }
        if (prefs.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
          const qc = prefs.quarantineCriteria as Record<string, unknown>;
          for (const [k, v] of Object.entries(qc)) {
            if (typeof v === 'number') quarantineCriteria[k] = v;
          }
        }
        if (Object.keys(flakyCriteria).length > 0 || Object.keys(quarantineCriteria).length > 0) {
          setCriteriaParams({ flakyCriteria, quarantineCriteria });
        }
      }
    });
  }, []);

  // Listen for criteria-config-changed events
  useEffect(() => {
    const handler = () => {
      api.getPreferences().then(prefs => {
        if (prefs) {
          const flakyCriteria: Record<string, number | string> = {};
          const quarantineCriteria: Record<string, number | string> = {};
          if (prefs.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
            const fc = prefs.flakyCriteria as Record<string, unknown>;
            for (const [k, v] of Object.entries(fc)) {
              if (typeof v === 'number') flakyCriteria[k] = v;
            }
          }
          if (prefs.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
            const qc = prefs.quarantineCriteria as Record<string, unknown>;
            for (const [k, v] of Object.entries(qc)) {
              if (typeof v === 'number') quarantineCriteria[k] = v;
            }
          }
          setCriteriaParams({ flakyCriteria, quarantineCriteria });
        }
      });
    };
    window.addEventListener('criteria-config-changed', handler);
    return () => window.removeEventListener('criteria-config-changed', handler);
  }, []);

  // Debounced version save
  useEffect(() => {
    if (versionInput && versionInput !== '1.0.0') {
      if (versionSaveTimerRef.current) {
        clearTimeout(versionSaveTimerRef.current);
      }

      versionSaveTimerRef.current = setTimeout(() => {
        api.savePreferences({ lastVersion: versionInput });
      }, 1000);
    }

    return () => {
      if (versionSaveTimerRef.current) {
        clearTimeout(versionSaveTimerRef.current);
      }
    };
  }, [versionInput]);

  const switchLang = (l: Lang) => {
    setLang(l);
    setApiLang(l);
    api.savePreferences({ lang: l });
  };

  return {
    lang,
    setLang,
    versionInput,
    setVersionInput,
    testDir,
    setTestDir,
    criteriaParams,
    setCriteriaParams,
    switchLang,
  };
}
