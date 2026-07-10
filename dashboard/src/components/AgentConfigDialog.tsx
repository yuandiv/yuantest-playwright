import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import { LLMConfig } from '../types';
import type { MCPConfig } from '../services/chat-api';
import * as api from '../services/api';
import { useLLMStatus } from '../contexts/LLMStatusContext';
import {
  getMCPConfigs,
  updateMCPConfig,
  deleteMCPConfig,
  saveMCPConfigsFromJson,
  getMCPStatus,
  type MCPConnectionStatus,
} from '../services/chat-api';

interface AgentConfigDialogProps {
  lang: Lang;
  onClose: () => void;
  onLLMSaved: () => void;
  onMCPSaved: () => void;
  onMCPToggled: () => void;
}

type TabKey = 'llm' | 'mcp';
type MCPViewMode = 'list' | 'manual';

export function AgentConfigDialog({ lang, onClose, onLLMSaved, onMCPSaved, onMCPToggled }: AgentConfigDialogProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('llm');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">{t('agentConfig', lang) || '智能体设置'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧菜单 */}
          <div className="w-28 border-r border-gray-200 flex-shrink-0 py-3">
            <button
              onClick={() => setActiveTab('llm')}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'llm'
                  ? 'text-indigo-600 bg-indigo-50 border-r-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className="fas fa-brain mr-1.5"></i>
              {t('agentConfigLLM', lang) || 'LLM'}
            </button>
            <button
              onClick={() => setActiveTab('mcp')}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'mcp'
                  ? 'text-indigo-600 bg-indigo-50 border-r-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className="fas fa-plug mr-1.5"></i>
              {t('agentConfigMCP', lang) || 'MCP'}
            </button>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'llm' ? (
              <LLMConfigPanel lang={lang} onSaved={onLLMSaved} />
            ) : (
              <MCPConfigPanel lang={lang} onSaved={onMCPSaved} onToggled={onMCPToggled} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** LLM 配置面板 */
function LLMConfigPanel({ lang, onSaved }: { lang: Lang; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [remark, setRemark] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.3);
  const [chatTemplateKwargs, setChatTemplateKwargs] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ success: boolean; text: string } | null>(null);
  const llmCtx = useLLMStatus();

  useEffect(() => {
    api.getLLMConfig().then(config => {
      if (config) {
        setEnabled(config.enabled);
        setApiKey(config.apiKey || '');
        setBaseUrl(config.baseUrl || 'http://localhost:11434');
        setModel(config.model || '');
        setRemark(config.remark || '');
        setMaxTokens(config.maxTokens || 4096);
        setTemperature(config.temperature ?? 0.3);
        setChatTemplateKwargs(config.chatTemplateKwargs ?? true);
      }
    }).catch((err) => console.error('[LLMConfigPanel] getLLMConfig failed:', err));
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testLLMConnection({ enabled, apiKey, baseUrl, model, remark, maxTokens, temperature, chatTemplateKwargs });
      setTestResult(result);
      // 测试成功后通知全局刷新状态
      if (result?.success) {
        llmCtx.refresh();
        window.dispatchEvent(new CustomEvent('llm-config-changed'));
      }
    } catch (e) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await api.saveLLMConfig({ enabled, apiKey, baseUrl, model, remark, maxTokens, temperature, chatTemplateKwargs });
      if (saved) {
        setSaveMessage({ success: true, text: '保存成功' });
        window.dispatchEvent(new CustomEvent('llm-config-changed'));
      } else {
        setSaveMessage({ success: false, text: '保存失败' });
      }
      onSaved();
    } catch (e) {
      console.error('Failed to save LLM config:', e);
      setSaveMessage({ success: false, text: '保存失败' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  return (
    <div className="p-5 space-y-4 relative">

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <i className={`fas ${testResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-1.5`}></i>
          {testResult.success ? (t('connectionSuccess', lang) || 'Connection successful') : `${t('connectionFailed', lang) || 'Connection failed'}: ${testResult.error}`}
        </div>
      )}

      {saveMessage && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 ${saveMessage.success ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <i className={`fas ${saveMessage.success ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2`}></i>
          {saveMessage.text}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiAddress', lang) || 'API Address'}</label>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <div className="mt-1 text-xs text-gray-500">
          Models API: <code className="bg-gray-100 px-1 rounded">{baseUrl}/models</code>
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

      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
        <label className="text-sm font-medium text-gray-700 cursor-pointer">{t('chatTemplateKwargs', lang) || '推理'}</label>
        <button
          type="button"
          role="switch"
          aria-checked={chatTemplateKwargs}
          onClick={() => setChatTemplateKwargs(!chatTemplateKwargs)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            chatTemplateKwargs ? 'bg-purple-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              chatTemplateKwargs ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
        <button
          onClick={handleTestConnection}
          disabled={testing || !baseUrl}
          className="px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-800 border border-purple-300 hover:border-purple-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('testing', lang) || 'Testing...'}</> : <><i className="fas fa-plug mr-1.5"></i>{t('testConnection', lang) || 'Test Connection'}</>}
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
  );
}

/** MCP 配置面板 */
function MCPConfigPanel({ lang, onSaved, onToggled }: { lang: Lang; onSaved: () => void; onToggled: () => void }) {
  const [viewMode, setViewMode] = useState<MCPViewMode>('list');
  const [mcpServers, setMcpServers] = useState<MCPConfig[]>([]);
  const [mcpStatus, setMcpStatus] = useState<MCPConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    loadMCPConfigs();
  }, []);

  const loadMCPConfigs = async () => {
    setLoading(true);
    try {
      const [configs, status] = await Promise.all([getMCPConfigs(), getMCPStatus()]);
      if (configs) setMcpServers(configs);
      if (status) setMcpStatus(status);
    } catch (err) {
      console.error('[MCPConfigPanel] loadMCPConfigs failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMCPStatus = async () => {
    try {
      const status = await getMCPStatus();
      if (status) setMcpStatus(status);
    } catch (err) {
      console.error('[MCPConfigPanel] loadMCPStatus failed:', err);
    }
  };

  const getServerError = (id: string): string | undefined => {
    return mcpStatus?.servers.find((s) => s.id === id)?.error;
  };

  const isServerConnected = (id: string): boolean => {
    return mcpStatus?.servers.find((s) => s.id === id)?.connected ?? false;
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    setTogglingId(id);
    try {
      await updateMCPConfig(id, { enabled });
      setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
      await loadMCPStatus();
      onToggled();
    } catch (err) {
      console.error('[MCPConfigPanel] toggleEnabled failed:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMCPConfig(id);
      setMcpServers((prev) => prev.filter((s) => s.id !== id));
      onSaved();
    } catch (err) {
      console.error('[MCPConfigPanel] delete failed:', err);
    }
  };

  const handleSaveJson = async () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        setJsonError('配置JSON必须包含 "mcpServers" 对象');
        return;
      }
      setSaving(true);
      await saveMCPConfigsFromJson(parsed.mcpServers);
      await loadMCPConfigs();
      setViewMode('list');
      setJsonText('');
      onSaved();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setJsonError('JSON 格式错误: ' + err.message);
      } else {
        setJsonError('保存失败: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenManual = () => {
    setJsonText('// 示例:\n// {\n//   "mcpServers": {\n//     "example-server": {\n//       "command": "npx",\n//       "args": [\n//         "-y",\n//         "mcp-server-example"\n//       ]\n//     }\n//   }\n// }');
    setViewMode('manual');
    setJsonError(null);
  };

  const getPresetIcon = (name: string) => {
    if (name.startsWith('playwright')) return 'fa-globe';
    if (name === 'filesystem') return 'fa-folder-open';
    return 'fa-plug';
  };

  return (
    <div className="p-5">
      <p className="text-sm text-gray-500 mb-4">{t('mcpServersDesc', lang) || '管理您已添加的 MCP 服务器，可启用、配置或添加新的工具能力。'}</p>

      {viewMode === 'list' ? (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <i className="fas fa-spinner fa-spin mr-2"></i>{t('loading', lang) || '加载中...'}
            </div>
          ) : mcpServers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative mb-6">
                <div className="w-16 h-16 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <i className="fas fa-server text-3xl text-indigo-500"></i>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                  <i className="fas fa-plus text-white text-xs"></i>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">MCP Servers</h3>
              <p className="text-sm text-gray-400 mb-8">{t('noMcpServers', lang) || '暂无 MCP 服务器配置'}</p>
              <div className="flex items-center gap-2 text-gray-400">
                <i className="fas fa-arrow-down text-indigo-500"></i>
                <span className="text-xs">{t('addMcpServerHint', lang) || '点击下方添加按钮开始配置'}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mcpServers.map((server) => {
                const serverError = server.enabled ? getServerError(server.id) : undefined;
                const isConnected = server.enabled && isServerConnected(server.id);
                const isToggling = togglingId === server.id;
                return (
                <div key={server.id} className={`rounded-xl p-4 flex items-center gap-4 border transition-colors duration-300 ${serverError ? 'bg-amber-50/50 border-amber-200/60' : 'bg-gray-50 border-gray-100'}`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-300 ${serverError ? 'bg-amber-100' : 'bg-indigo-50'}`}>
                    <i className={`fas ${getPresetIcon(server.name)} ${serverError ? 'text-amber-500' : 'text-indigo-500'}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-700 truncate">{server.name}</h4>
                      {isToggling ? (
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-500">
                          <i className="fas fa-spinner fa-spin text-[10px]"></i>
                          {server.enabled ? '禁用中...' : '启用中...'}
                        </span>
                      ) : server.enabled ? (
                        <span className={`inline-flex items-center gap-1 text-xs transition-colors duration-300 ${isConnected ? 'text-green-600' : serverError ? 'text-amber-600' : 'text-green-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${isConnected ? 'bg-green-500' : serverError ? 'bg-amber-500' : 'bg-green-500'}`}></span>
                          {isConnected ? '已连接' : serverError ? '连接异常' : '已启用'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                          已禁用
                        </span>
                      )}
                      {server.source === 'builtin' && (
                        <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">内置</span>
                      )}
                    </div>
                    {server.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{server.description}</p>
                    )}
                    {server.command && (
                      <code className="text-xs text-gray-500 mt-1 block bg-gray-100 px-2 py-1 rounded font-mono">
                        {server.command} {server.args?.join(' ')}
                      </code>
                    )}
                    {serverError && (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
                        <i className="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i>
                        <span>{serverError}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(server.id, !server.enabled)}
                      disabled={isToggling}
                      className={`relative w-11 h-6 rounded-full transition-all duration-300 ${server.enabled ? 'bg-indigo-600' : 'bg-gray-300'} ${isToggling ? 'opacity-70 cursor-wait' : ''}`}
                    >
                      {isToggling ? (
                        <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow flex items-center justify-center">
                          <i className="fas fa-spinner fa-spin text-gray-400 text-[8px]"></i>
                        </span>
                      ) : (
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${server.enabled ? 'translate-x-5' : ''}`} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                    >
                      <i className="fas fa-trash text-sm"></i>
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-20"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-yellow-100 items-center justify-center">
                  <i className="fas fa-shield-alt text-yellow-600 text-xs"></i>
                </span>
              </span>
              <span className="text-xs text-yellow-600">{t('mcpSecurityHint', lang) || '配置前请确认来源，甄别风险'}</span>
            </div>
            <button
              onClick={handleOpenManual}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <i className="fas fa-plus"></i>
              {t('add', lang) || '添加'}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-base font-semibold text-gray-700 mb-4">{t('manualConfig', lang) || '手动配置'}</h3>
          <p className="text-sm text-gray-500 mb-4">{t('manualConfigDesc', lang) || '请从 MCP Servers 的介绍页面复制配置 JSON（优先使用 NPX 或 UVX 配置），并粘贴到输入框中。'}</p>
          <div className="relative">
            <textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
              className="w-full h-64 bg-gray-50 border border-gray-300 rounded-xl p-4 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder={`{\n  "mcpServers": {\n    "example-server": {\n      "command": "npx",\n      "args": ["-y", "mcp-server-example"]\n    }\n  }\n}`}
              spellCheck={false}
            />
            <div className="absolute top-3 right-3 text-xs text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">
              JSON
            </div>
          </div>
          {jsonError && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <i className="fas fa-exclamation-triangle"></i>
              <span>{jsonError}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
            <button
              onClick={() => setViewMode('list')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              <i className="fas fa-arrow-left mr-1"></i>
              {t('back', lang) || '返回'}
            </button>
            <button
              onClick={handleSaveJson}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('saving', lang) || '保存中...'}</> : <><i className="fas fa-check mr-1.5"></i>{t('confirm', lang) || '确认'}</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
