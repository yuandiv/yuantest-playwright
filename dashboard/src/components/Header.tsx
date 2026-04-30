import { useState, useEffect } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import * as api from '../services/api';
import { LLMStatus } from '../types';
import { LLMConfigDialog } from './LLMConfigDialog';

interface HeaderProps {
  lang: Lang;
  wsConnected: boolean;
  hasTestCases: boolean;
  isExecuting: boolean;
  onSwitchLang: (lang: Lang) => void;
  onOpenExecutor: () => void;
  showHealthDashboard?: boolean;
  onToggleHealthDashboard?: () => void;
}

export function Header({ lang, wsConnected, hasTestCases, isExecuting, onSwitchLang, onOpenExecutor, showHealthDashboard, onToggleHealthDashboard }: HeaderProps) {
  const [llmStatus, setLlmStatus] = useState<'green' | 'yellow' | 'red'>('yellow');
  const [showLLMConfig, setShowLLMConfig] = useState(false);

  useEffect(() => {
    const fetchStatus = () => {
      api.getLLMStatus().then(status => {
        if (status) setLlmStatus(status.status);
      }).catch(() => {
        setLlmStatus('yellow');
      });
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLLMConfigSaved = () => {
    api.getLLMStatus().then(status => {
      if (status) setLlmStatus(status.status);
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('llm-config-changed'));
  };

  return (
    <div className="flex justify-between items-center mb-5">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-2.5 shadow-lg shadow-indigo-200">
          <i className="fas fa-rocket text-white text-2xl"></i>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-800">
            Yuantest<span className="text-indigo-600">·Playwright</span>
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle', lang)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onToggleHealthDashboard && (
          <button
            onClick={onToggleHealthDashboard}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-full shadow-sm border transition-colors cursor-pointer ${
              showHealthDashboard 
                ? 'bg-green-100 text-green-700 border-green-200' 
                : 'text-gray-500 bg-white border-gray-100 hover:bg-gray-50'
            }`}
          >
            <i className="fas fa-heartbeat"></i>
            <span>{t('healthDashboard', lang) || 'Health Dashboard'}</span>
          </button>
        )}
        <button
          onClick={onOpenExecutor}
          className="flex items-center gap-2 text-xs text-gray-500 bg-white px-3 py-2 rounded-full shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <span 
            className={`w-2 h-2 rounded-full inline-block ${
              isExecuting 
                ? 'bg-yellow-500 animate-pulse' 
                : hasTestCases 
                  ? 'bg-green-500 animate-pulse' 
                  : 'bg-red-500'
            }`}
            title={
              isExecuting 
                ? t('running', lang) 
                : hasTestCases 
                  ? t('executorReady', lang) 
                  : t('noTestCases', lang)
            }
          ></span>
          <span>{t('executor', lang)}</span>
        </button>
        <button
          onClick={() => setShowLLMConfig(true)}
          className="flex items-center gap-2 text-xs text-gray-500 bg-white px-3 py-2 rounded-full shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
          title={llmStatus === 'green' ? (t('llmConnected', lang) || 'LLM Connected') : llmStatus === 'red' ? (t('llmConnectionFailed', lang) || 'LLM Connection Failed') : (t('llmNotConfigured', lang) || 'LLM Not Configured')}
        >
          <span 
            className={`w-2 h-2 rounded-full inline-block ${
              llmStatus === 'green' ? 'bg-green-500 animate-pulse' : llmStatus === 'red' ? 'bg-red-500' : 'bg-yellow-500'
            }`}
          ></span>
          <span>{t('llmConfig', lang) || 'LLM Config'}</span>
        </button>
        {showLLMConfig && (
          <LLMConfigDialog
            lang={lang}
            onClose={() => setShowLLMConfig(false)}
            onSaved={handleLLMConfigSaved}
          />
        )}
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-white px-3 py-2 rounded-full shadow-sm border border-gray-100">
          <span className={`w-2 h-2 rounded-full inline-block ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span>{wsConnected ? t('connected', lang) : t('disconnected', lang)}</span>
        </div>
        <div className="bg-white px-1.5 py-1 rounded-full shadow-sm flex border border-gray-100">
          <button
            className={`text-xs px-3 py-1 rounded-full cursor-pointer font-medium transition-all ${lang === 'zh' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
            onClick={() => onSwitchLang('zh')}
          >中文</button>
          <button
            className={`text-xs px-3 py-1 rounded-full cursor-pointer font-medium transition-all ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
            onClick={() => onSwitchLang('en')}
          >EN</button>
        </div>
      </div>
    </div>
  );
}
