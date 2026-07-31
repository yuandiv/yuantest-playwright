import React, { useState, useEffect, useCallback } from 'react';
import { Lang, t } from '../../i18n';
import * as api from '../../services/api';

interface CustomErrorPatternsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Lang;
}

interface ErrorPattern {
  id: string;
  category: string;
  name: string;
  description?: string;
  regex: string[];
  rootCauseTemplate: { zh: string; en: string };
  suggestionsTemplate: { zh: string[]; en: string[] };
}

export const CustomErrorPatternsDialog: React.FC<CustomErrorPatternsDialogProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [patterns, setPatterns] = useState<ErrorPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPattern, setNewPattern] = useState({
    id: '',
    category: 'unknown',
    name: '',
    description: '',
    regex: '',
    rootCauseZh: '',
    rootCauseEn: '',
    suggestionsZh: '',
    suggestionsEn: '',
  });

  const loadPatterns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCustomErrorPatterns();
      if (data) {
        setPatterns(data);
      }
    } catch (e) {
      console.error('Failed to load custom error patterns:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPatterns();
    }
  }, [isOpen, loadPatterns]);

  const handleAddPattern = async () => {
    if (!newPattern.id || !newPattern.name || !newPattern.regex) return;

    try {
      await api.addErrorPattern({
        id: newPattern.id,
        category: newPattern.category,
        name: newPattern.name,
        description: newPattern.description,
        regex: newPattern.regex.split('\n').filter(Boolean),
        rootCauseTemplate: { zh: newPattern.rootCauseZh, en: newPattern.rootCauseEn },
        suggestionsTemplate: {
          zh: newPattern.suggestionsZh.split('\n').filter(Boolean),
          en: newPattern.suggestionsEn.split('\n').filter(Boolean),
        },
      });
      setShowAddForm(false);
      setNewPattern({
        id: '',
        category: 'unknown',
        name: '',
        description: '',
        regex: '',
        rootCauseZh: '',
        rootCauseEn: '',
        suggestionsZh: '',
        suggestionsEn: '',
      });
      await loadPatterns();
    } catch (e) {
      console.error('Failed to add error pattern:', e);
    }
  };

  const handleDeletePattern = async (patternId: string) => {
    try {
      await api.deleteErrorPattern(patternId);
      await loadPatterns();
    } catch (e) {
      console.error('Failed to delete error pattern:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              <i className="fas fa-puzzle-piece mr-2 text-emerald-500"></i>
              {t('customErrorPatterns', lang)}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('customPatternsDesc', lang)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {patterns.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {t('existingPatterns', lang)} ({patterns.length})
                  </h3>
                  <div className="space-y-2">
                    {patterns.map((pattern) => (
                      <div key={pattern.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-800">{pattern.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700">
                                {pattern.category}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">{pattern.id}</span>
                            </div>
                            {pattern.description && (
                              <p className="text-xs text-gray-500 mt-0.5">{pattern.description}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pattern.regex.map((r, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-mono">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeletePattern(pattern.id)}
                            className="ml-3 text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                            title={t('deletePattern', lang)}
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                >
                  <i className={`fas ${showAddForm ? 'fa-times' : 'fa-plus'} mr-1`}></i>
                  {showAddForm ? (t('cancel', lang) || '取消') : (t('addPattern', lang) || '添加模式')}
                </button>
              </div>

              {showAddForm && (
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {t('addNewPattern', lang)}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('patternId', lang) || '模式ID'} *
                      </label>
                      <input
                        value={newPattern.id}
                        onChange={e => setNewPattern(p => ({ ...p, id: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. custom-db-connection"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('patternName', lang) || '模式名称'} *
                      </label>
                      <input
                        value={newPattern.name}
                        onChange={e => setNewPattern(p => ({ ...p, name: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder={lang === 'zh' ? '例如：数据库连接失败' : 'e.g. Database Connection Failed'}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('patternCategory', lang) || '分类'}
                      </label>
                      <select
                        value={newPattern.category}
                        onChange={e => setNewPattern(p => ({ ...p, category: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {['timeout', 'selector', 'assertion', 'network', 'frame', 'auth', 'unknown'].map(cat => (
                          <option key={cat} value={cat}>{t(`category.${cat}`, lang) || cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('patternDescription', lang) || '描述'}
                      </label>
                      <input
                        value={newPattern.description}
                        onChange={e => setNewPattern(p => ({ ...p, description: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder={lang === 'zh' ? '模式描述' : 'Pattern description'}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('patternRegex', lang) || '正则表达式'} * ({lang === 'zh' ? '每行一个' : 'One per line'})
                      </label>
                      <textarea
                        value={newPattern.regex}
                        onChange={e => setNewPattern(p => ({ ...p, regex: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows={2}
                        placeholder="ECONNREFUSED\nconnection.*refused"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('rootCause', lang) || '根本原因'} (中文)
                      </label>
                      <input
                        value={newPattern.rootCauseZh}
                        onChange={e => setNewPattern(p => ({ ...p, rootCauseZh: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('rootCause', lang) || '根本原因'} (English)
                      </label>
                      <input
                        value={newPattern.rootCauseEn}
                        onChange={e => setNewPattern(p => ({ ...p, rootCauseEn: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('suggestions', lang) || '建议'} (中文, {lang === 'zh' ? '每行一条' : 'one per line'})
                      </label>
                      <textarea
                        value={newPattern.suggestionsZh}
                        onChange={e => setNewPattern(p => ({ ...p, suggestionsZh: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        {t('suggestions', lang) || '建议'} (English, one per line)
                      </label>
                      <textarea
                        value={newPattern.suggestionsEn}
                        onChange={e => setNewPattern(p => ({ ...p, suggestionsEn: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={handleAddPattern}
                      disabled={!newPattern.id || !newPattern.name || !newPattern.regex}
                      className="px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="fas fa-check mr-1"></i>
                      {t('savePattern', lang) || '保存'}
                    </button>
                  </div>
                </div>
              )}

              {patterns.length === 0 && !showAddForm && (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
                  <i className="fas fa-puzzle-piece text-2xl text-gray-300 mb-2"></i>
                  <p className="text-gray-400 text-xs">
                    {lang === 'zh' ? '暂无自定义错误模式' : 'No custom error patterns'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomErrorPatternsDialog;
