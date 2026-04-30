import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import { LLMConfig, LLMStatus } from '../types';
import * as api from '../services/api';

interface LLMConfigDialogProps {
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
}

export function LLMConfigDialog({ lang, onClose, onSaved }: LLMConfigDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [remark, setRemark] = useState('');
  const [maxTokens, setMaxTokens] = useState(2048);
  const [temperature, setTemperature] = useState(0.3);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  useEffect(() => {
    api.getLLMConfig().then(config => {
      if (config) {
        setEnabled(config.enabled);
        setApiKey(config.apiKey || '');
        setBaseUrl(config.baseUrl || 'http://localhost:11434');
        setModel(config.model || '');
        setRemark(config.remark || '');
        setMaxTokens(config.maxTokens || 2048);
        setTemperature(config.temperature ?? 0.3);
      }
    }).catch(() => {});
    api.getLLMStatus().then(status => {
      setLlmStatus(status);
    }).catch(() => {});
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testLLMConnection({ enabled, apiKey, baseUrl, model, remark, maxTokens, temperature });
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveLLMConfig({ enabled, apiKey, baseUrl, model, remark, maxTokens, temperature });
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save LLM config:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-800">{t('llmConfig', lang) || 'LLM Config'}</h2>
            {llmStatus && (
              <span className={`w-3 h-3 rounded-full ${llmStatus.status === 'green' ? 'bg-green-500' : llmStatus.status === 'red' ? 'bg-red-500' : 'bg-yellow-500'}`} title={llmStatus.status === 'green' ? (t('llmConnected', lang) || 'Connected') : llmStatus.status === 'red' ? (t('llmConnectionFailed', lang) || 'Failed') : (t('llmNotConfigured', lang) || 'Not configured')} />
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {testResult && (
          <div className={`mx-5 mt-4 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <i className={`fas ${testResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-1.5`}></i>
            {testResult.success ? (t('connectionSuccess', lang) || 'Connection successful') : `${t('connectionFailed', lang) || 'Connection failed'}: ${testResult.error}`}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">{t('enableAiDiagnosis', lang) || 'Enable AI Diagnosis'}</label>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-purple-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiAddress', lang) || 'API Address'}</label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <div className="mt-1 text-xs text-gray-500 space-y-0.5">
              <div>Models API: <code className="bg-gray-100 px-1 rounded">{baseUrl}/v1/models</code></div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiKey', lang) || 'API Key'}</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={t('apiKeyOptional', lang) || 'Optional (not needed for local Ollama)'}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className={`fas ${showApiKey ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('modelName', lang) || 'Model'}</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="qwen3:32b, gpt-4o, deepseek-chat..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('remark', lang) || 'Remark'}</label>
            <input
              type="text"
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder={t('remarkPlaceholder', lang) || 'e.g. Local Qwen3, Cloud GPT-4'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('maxTokens', lang) || 'Max Tokens'}</label>
              <input
                type="number"
                value={maxTokens}
                onChange={e => setMaxTokens(parseInt(e.target.value) || 2048)}
                min={256}
                max={8192}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('temperature', lang) || 'Temperature'}</label>
              <input
                type="number"
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value) || 0.3)}
                min={0}
                max={2}
                step={0.1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <button
            onClick={handleTestConnection}
            disabled={testing || !baseUrl}
            className="px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-800 border border-purple-300 hover:border-purple-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('testing', lang) || 'Testing...'}</> : <><i className="fas fa-plug mr-1.5"></i>{t('testConnection', lang) || 'Test Connection'}</>}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              {t('cancel', lang) || 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('saving', lang) || 'Saving...'}</> : <><i className="fas fa-save mr-1.5"></i>{t('confirm', lang) || 'Save'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
