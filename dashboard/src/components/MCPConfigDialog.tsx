import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import type { MCPConfig } from '../types';
import {
  getMCPConfigs,
  updateMCPConfig,
  deleteMCPConfig,
  saveMCPConfigsFromJson,
  getMCPStatus,
  type MCPConnectionStatus,
} from '../services/chat-api';

interface MCPConfigDialogProps {
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
  onToggled: () => void;
}

type ViewMode = 'list' | 'manual';

export function MCPConfigDialog({ lang, onClose, onSaved, onToggled }: MCPConfigDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
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
      console.error('[MCPConfigDialog] loadMCPConfigs failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMCPStatusOnly = async () => {
    try {
      const status = await getMCPStatus();
      if (status) setMcpStatus(status);
    } catch (err) {
      console.error('[MCPConfigDialog] loadMCPStatus failed:', err);
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
      await loadMCPStatusOnly();
      onToggled();
    } catch (err) {
      console.error('[MCPConfigDialog] toggleEnabled failed:', err);
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
      console.error('[MCPConfigDialog] delete failed:', err);
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{t('mcpConfig', lang) || 'MCP 设置'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('mcpServersDesc', lang) || '管理您已添加的 MCP 服务器，可启用、配置或添加新的工具能力。'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {viewMode === 'list' ? (
            <>
              {mcpServers.length === 0 ? (
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
                    <span className="text-xs">{t('addMcpServerHint', lang) || '点击右下角添加按钮开始配置'}</span>
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
            </>
          ) : (
            <div>
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
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            {viewMode === 'list' ? (
              <div className="flex items-center gap-2">
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-20"></span>
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-yellow-100 items-center justify-center">
                    <i className="fas fa-shield-alt text-yellow-600 text-xs"></i>
                  </span>
                </span>
                <span className="text-xs text-yellow-600">{t('mcpSecurityHint', lang) || '配置前请确认来源，甄别风险'}</span>
              </div>
            ) : (
              <button
                onClick={() => setViewMode('list')}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                <i className="fas fa-arrow-left mr-1"></i>
                {t('back', lang) || '返回'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {viewMode === 'list' ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  {t('cancel', lang) || '取消'}
                </button>
                <button
                  onClick={handleOpenManual}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <i className="fas fa-plus"></i>
                  {t('add', lang) || '添加'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  {t('cancel', lang) || '取消'}
                </button>
                <button
                  onClick={handleSaveJson}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('saving', lang) || '保存中...'}</> : <><i className="fas fa-check mr-1.5"></i>{t('confirm', lang) || '确认'}</>}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
