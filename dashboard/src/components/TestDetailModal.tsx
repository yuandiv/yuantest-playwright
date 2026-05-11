import { useState, useEffect, useRef, useCallback } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { RunDetail, TestAttachment, AIDiagnosis, RetryHistoryEntry } from '../types';
import * as api from '../services/api';

interface TestDetailModalProps {
  lang: Lang;
  test: RunDetail | null;
  runId: number;
  htmlReportUrl?: string | null;
  onClose: () => void;
}

interface DisplayData {
  status: 'passed' | 'failed';
  duration: string;
  error: string | null;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
  stackTrace?: string;
  logs?: string[];
  attachments?: TestAttachment[];
}

export function TestDetailModal({ lang, test, runId, htmlReportUrl, onClose }: TestDetailModalProps) {
  const [selectedAttachment, setSelectedAttachment] = useState<TestAttachment | null>(null);
  const [activeTab, setActiveTab] = useState<'error' | 'screenshots' | 'videos' | 'other'>('error');
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [diagnosis, setDiagnosis] = useState<AIDiagnosis | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const diagnosisCache = useRef<Map<string, AIDiagnosis>>(new Map());

  const [selectedRetryIndex, setSelectedRetryIndex] = useState<number>(-1);
  const [retryData, setRetryData] = useState<RetryHistoryEntry[] | null>(null);
  const [loadingRetryData, setLoadingRetryData] = useState(false);

  const hasRetries = (test?.manualReruns && test.manualReruns > 0) || (test?.runHistory && test.runHistory.length > 0);
  const totalExecutions = hasRetries ? (test?.runHistory?.length ?? 0) + 1 : 1;

  useEffect(() => {
    if (hasRetries) {
      setSelectedRetryIndex(totalExecutions - 1);
    } else {
      setSelectedRetryIndex(-1);
    }
    setRetryData(null);
    setLoadingRetryData(false);
  }, [test?.id]);

  const loadRetryData = useCallback(async () => {
    if (!test || retryData) return;
    setLoadingRetryData(true);
    try {
      const data = await api.getRetryData(runId, test.id);
      if (data) {
        setRetryData(data);
      }
    } catch {
      // ignore
    }
    setLoadingRetryData(false);
  }, [test?.id, runId, retryData]);

  useEffect(() => {
    if (hasRetries && !retryData && !loadingRetryData) {
      loadRetryData();
    }
  }, [hasRetries, retryData, loadingRetryData, loadRetryData]);

  const getDisplayData = (): DisplayData => {
    if (!test) {
      return { status: 'failed', duration: '0', error: null };
    }

    if (!hasRetries || selectedRetryIndex === -1 || selectedRetryIndex === totalExecutions - 1) {
      return {
        status: test.status,
        duration: test.duration,
        error: test.error,
        screenshots: test.screenshots,
        videos: test.videos,
        traces: test.traces,
        stackTrace: test.stackTrace,
        logs: test.logs,
        attachments: test.attachments,
      };
    }

    if (retryData && selectedRetryIndex >= 0 && selectedRetryIndex < retryData.length) {
      const entry = retryData[selectedRetryIndex];
      return {
        status: entry.status === 'passed' ? 'passed' : 'failed',
        duration: (entry.duration / 1000).toFixed(2),
        error: entry.error || null,
        screenshots: entry.screenshots,
        videos: entry.videos,
        traces: entry.traces,
        stackTrace: entry.stackTrace,
        logs: entry.logs,
      };
    }

    if (test.runHistory && selectedRetryIndex >= 0 && selectedRetryIndex < test.runHistory.length) {
      const entry = test.runHistory[selectedRetryIndex];
      return {
        status: entry.status === 'passed' ? 'passed' : 'failed',
        duration: (entry.duration / 1000).toFixed(2),
        error: entry.error || null,
        screenshots: entry.screenshots,
        videos: entry.videos,
        traces: entry.traces,
        stackTrace: entry.stackTrace,
        logs: entry.logs,
      };
    }

    return {
      status: test.status,
      duration: test.duration,
      error: test.error,
      screenshots: test.screenshots,
      videos: test.videos,
      traces: test.traces,
      stackTrace: test.stackTrace,
      logs: test.logs,
      attachments: test.attachments,
    };
  };

  const displayData = getDisplayData();
  const hasError = displayData.status === 'failed' && !!displayData.error;

  useEffect(() => {
    const handleConfigChanged = () => {
      diagnosisCache.current.clear();
      setDiagnosis(null);
      setDiagnosisError(null);
      api.getLLMConfig().then(config => {
        setLlmEnabled(config?.enabled === true && !!config.baseUrl && !!config.model);
      }).catch(() => {
        setLlmEnabled(false);
      });
    };
    window.addEventListener('llm-config-changed', handleConfigChanged);
    return () => window.removeEventListener('llm-config-changed', handleConfigChanged);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    api.getLLMConfig().then(config => {
      setLlmEnabled(config?.enabled === true && !!config.baseUrl && !!config.model);
    }).catch(() => {
      setLlmEnabled(false);
    });
  }, []);

  useEffect(() => {
    if (activeTab === 'error' && hasError && llmEnabled && test) {
      const cacheKey = hasRetries ? `${test.id}_retry${selectedRetryIndex}` : test.id;
      const cached = diagnosisCache.current.get(cacheKey);
      if (cached) {
        setDiagnosis(cached);
        setDiagnosing(false);
        setDiagnosisError(null);
        setStreamingContent('');
        return;
      }

      setDiagnosing(true);
      setDiagnosis(null);
      setDiagnosisError(null);
      setStreamingContent('');

      const requestDiagnosis = () => {
        api.requestDiagnosisStream({
          testTitle: test.name,
          error: displayData.error || '',
          file: test.file,
          line: test.line,
          testId: test.id,
          runId: String(runId),
          lang,
          screenshots: displayData.screenshots,
          logs: displayData.logs,
          browser: test.browser,
          stackTrace: displayData.stackTrace,
        }, {
          onStart: () => {
            setStreamingContent('');
          },
          onChunk: (content) => {
            setStreamingContent(prev => prev + content);
          },
          onComplete: (diagnosisResult) => {
            setDiagnosis(diagnosisResult);
            diagnosisCache.current.set(cacheKey, diagnosisResult);
            setDiagnosing(false);
            setStreamingContent('');
          },
          onError: (error) => {
            setDiagnosisError(error);
            setDiagnosing(false);
          }
        });
      };

      api.getPersistedDiagnosis(runId, test.id).then(result => {
        if (result?.found && result.diagnosis) {
          setDiagnosis(result.diagnosis);
          diagnosisCache.current.set(cacheKey, result.diagnosis);
          setDiagnosing(false);
          return;
        }
        requestDiagnosis();
      }).catch(() => {
        requestDiagnosis();
      });
    }
  }, [activeTab, hasError, llmEnabled, test, runId, selectedRetryIndex]);

  if (!test) return null;

  const screenshots = displayData.attachments?.filter((a: TestAttachment) =>
    a.contentType?.startsWith('image/') || a.name.toLowerCase().includes('screenshot')
  ) || [];

  const videos = displayData.attachments?.filter((a: TestAttachment) =>
    a.contentType?.startsWith('video/') || a.name.toLowerCase().includes('video')
  ) || [];

  const otherAttachments = displayData.attachments?.filter((a: TestAttachment) =>
    !screenshots.includes(a) && !videos.includes(a)
  ) || [];

  const displayScreenshots = displayData.screenshots || [];
  const displayVideos = displayData.videos || [];

  const hasScreenshots = screenshots.length > 0 || displayScreenshots.length > 0;
  const hasVideos = videos.length > 0 || displayVideos.length > 0;
  const hasOther = otherAttachments.length > 0;

  const handleRetryDiagnosis = () => {
    if (!test) return;
    const cacheKey = hasRetries ? `${test.id}_retry${selectedRetryIndex}` : test.id;
    diagnosisCache.current.delete(cacheKey);
    setDiagnosis(null);
    setDiagnosisError(null);
    setDiagnosing(true);
    setStreamingContent('');

    api.requestDiagnosisStream({
      testTitle: test.name,
      error: displayData.error || '',
      file: test.file,
      line: test.line,
      testId: test.id,
      runId: String(runId),
      lang,
      screenshots: displayData.screenshots,
      logs: displayData.logs,
      browser: test.browser,
      stackTrace: displayData.stackTrace,
    }, {
      onStart: () => {
        setStreamingContent('');
      },
      onChunk: (content) => {
        setStreamingContent(prev => prev + content);
      },
      onComplete: (diagnosisResult) => {
        setDiagnosis(diagnosisResult);
        diagnosisCache.current.set(cacheKey, diagnosisResult);
        setDiagnosing(false);
        setStreamingContent('');
      },
      onError: (error) => {
        setDiagnosisError(error);
        setDiagnosing(false);
      }
    });
  };

  const getRetryStatusLabel = (index: number, status: string, duration: number) => {
    const statusIcon = status === 'passed' ? '✅' : '❌';
    const durationStr = (duration / 1000).toFixed(2);
    if (index === 0) {
      return `${statusIcon} ${t('firstExecution', lang)} (${durationStr}s)`;
    }
    const label = t('retryExecution', lang).replace('{n}', String(index));
    return `${statusIcon} ${label} (${durationStr}s)`;
  };

  const getRetryStatusForIndex = (index: number): { status: string; duration: number } => {
    if (retryData && index < retryData.length) {
      return { status: retryData[index].status, duration: retryData[index].duration };
    }
    if (test.runHistory && index < test.runHistory.length) {
      return { status: test.runHistory[index].status, duration: test.runHistory[index].duration };
    }
    if (index === totalExecutions - 1) {
      return { status: test.status, duration: parseFloat(test.duration) * 1000 };
    }
    return { status: 'unknown', duration: 0 };
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                displayData.status === 'passed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {displayData.status === 'passed' ? '✅' : '❌'} {displayData.status.toUpperCase()}
              </span>
              <span className="text-sm text-gray-500">⏱️ {displayData.duration}s</span>
            </div>
            <h2 className="text-lg font-bold text-gray-800 pr-8">{test.name}</h2>
            {test.file && (
              <p className="text-xs text-gray-500 mt-1">
                📄 {test.file}{test.line ? `:${test.line}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {hasRetries && (
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
            <div className="text-xs font-medium text-gray-500 mb-1.5">{t('retryHistory', lang)}</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {Array.from({ length: totalExecutions }, (_, i) => {
                const info = getRetryStatusForIndex(i);
                const isSelected = i === selectedRetryIndex;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedRetryIndex(i);
                      setActiveTab('error');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {getRetryStatusLabel(i, info.status, info.duration)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex border-b border-gray-200 bg-gray-50">
          {hasError && (
            <button
              onClick={() => setActiveTab('error')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'error'
                  ? 'text-red-600 border-b-2 border-red-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-exclamation-circle mr-1.5"></i>
              {t('errorDebug', lang)}
            </button>
          )}
          {hasScreenshots && (
            <button
              onClick={() => setActiveTab('screenshots')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'screenshots'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-image mr-1.5"></i>
              {t('screenshots', lang) || 'Screenshots'} ({screenshots.length + displayScreenshots.length})
            </button>
          )}
          {hasVideos && (
            <button
              onClick={() => setActiveTab('videos')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'videos'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-video mr-1.5"></i>
              {t('videos', lang) || 'Videos'} ({videos.length + displayVideos.length})
            </button>
          )}
          {hasOther && (
            <button
              onClick={() => setActiveTab('other')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'other'
                  ? 'text-gray-600 border-b-2 border-gray-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-paperclip mr-1.5"></i>
              {t('otherAttachments', lang) || 'Other'} ({otherAttachments.length})
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loadingRetryData && hasRetries && (
            <div className="flex items-center justify-center py-4 text-sm text-gray-500">
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {t('loadingRetryData', lang)}
            </div>
          )}

          {activeTab === 'error' && hasError && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-bug text-red-600"></i>
                  <span className="font-semibold text-red-700">{t('errorMessage', lang) || 'Error Message'}</span>
                </div>
                <pre className="text-sm text-red-600 whitespace-pre-wrap font-mono overflow-x-auto max-h-96">
                  {displayData.error}
                </pre>
              </div>

              {displayData.stackTrace && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-layer-group text-gray-600"></i>
                    <span className="font-semibold text-gray-700">{t('stackTrace', lang) || 'Stack Trace'}</span>
                  </div>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono overflow-x-auto max-h-64">
                    {displayData.stackTrace}
                  </pre>
                </div>
              )}

              {!displayData.stackTrace && displayData.error && displayData.error.includes('Stack trace:') && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-layer-group text-gray-600"></i>
                    <span className="font-semibold text-gray-700">{t('stackTrace', lang) || 'Stack Trace'}</span>
                  </div>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono overflow-x-auto max-h-64">
                    {displayData.error.split('Stack trace:')[1]?.trim() || ''}
                  </pre>
                </div>
              )}

              {llmEnabled ? (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-robot text-purple-600"></i>
                      <span className="font-semibold text-purple-700">{t('aiDiagnosis', lang) || 'AI Diagnosis'}</span>
                    </div>
                    {diagnosis && (
                      <button
                        onClick={handleRetryDiagnosis}
                        className="text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1"
                      >
                        <i className="fas fa-redo"></i>
                        {t('retryDiagnosis', lang) || 'Retry'}
                      </button>
                    )}
                  </div>
                  {diagnosing && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-purple-600 text-sm">
                        <i className="fas fa-spinner fa-spin"></i>
                        <span>{t('diagnosing', lang) || 'Analyzing...'}</span>
                      </div>
                      {streamingContent && (
                        <div className="mt-2 p-2 bg-white rounded border border-purple-200">
                          <pre className="text-xs text-purple-700 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                            {streamingContent}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                  {diagnosisError && (
                    <div className="space-y-2">
                      <div className="text-sm text-red-600 flex items-center gap-1">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{t('diagnosisUnavailable', lang) || 'AI diagnosis unavailable'}: {diagnosisError}</span>
                      </div>
                      <div className="text-sm text-purple-700 space-y-1">
                        <ul className="space-y-1">
                          <li>• {t('checkSelector', lang) || 'Check if the selector is correct'}</li>
                          <li>• {t('checkElement', lang) || 'Verify the element exists in the DOM'}</li>
                          <li>• {t('checkTimeout', lang) || 'Consider increasing timeout if needed'}</li>
                          <li>• {t('checkNetwork', lang) || 'Check network connectivity and API responses'}</li>
                          <li>• {t('viewScreenshots', lang) || 'View screenshots and videos for visual debugging'}</li>
                        </ul>
                      </div>
                    </div>
                  )}
                  {diagnosis && !diagnosing && (
                    <div className="space-y-3">
                      {diagnosis.category && (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          diagnosis.category === 'timeout' ? 'bg-orange-100 text-orange-800' :
                          diagnosis.category === 'selector' ? 'bg-purple-100 text-purple-800' :
                          diagnosis.category === 'assertion' ? 'bg-blue-100 text-blue-800' :
                          diagnosis.category === 'network' ? 'bg-red-100 text-red-800' :
                          diagnosis.category === 'frame' ? 'bg-yellow-100 text-yellow-800' :
                          diagnosis.category === 'auth' ? 'bg-pink-100 text-pink-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {t(`category.${diagnosis.category}`, lang) || diagnosis.category}
                        </span>
                      )}
                      <div>
                        <div className="text-xs font-medium text-purple-500 mb-1">{t('summary', lang) || 'Summary'}</div>
                        <div className="text-sm text-purple-800">{diagnosis.summary}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-purple-500 mb-1">{t('rootCause', lang) || 'Root Cause'}</div>
                        <div className="text-sm text-purple-800">{diagnosis.rootCause}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-purple-500 mb-1">{t('suggestions', lang) || 'Suggestions'}</div>
                        <ul className="text-sm text-purple-700 space-y-1">
                          {diagnosis.suggestions.map((s, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-purple-400 mt-0.5">💡</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {diagnosis.codeDiffs && diagnosis.codeDiffs.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-sm font-medium mb-1">{t('codeDiffs', lang) || '代码修复建议'}</h5>
                          {diagnosis.codeDiffs.map((diff, i) => (
                            <div key={i} className="mb-2">
                              <div className="text-xs text-gray-500 mb-1">{diff.filePath}</div>
                              <div className="text-xs text-gray-600 mb-1">{diff.description}</div>
                              <pre className="bg-gray-900 text-green-400 p-2 rounded text-xs overflow-x-auto font-mono whitespace-pre">
                                {diff.unifiedDiff}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                      {diagnosis.docLinks && diagnosis.docLinks.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-sm font-medium mb-1">{t('docLinks', lang) || '参考文档'}</h5>
                          <ul className="text-xs space-y-1">
                            {diagnosis.docLinks.map((link, i) => (
                              <li key={i}>
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                  {link.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diagnosis.reasoningSteps && diagnosis.reasoningSteps.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-sm font-medium mb-1">{t('reasoningSteps', lang) || '推理步骤'}</h5>
                          <div className="space-y-1">
                            {diagnosis.reasoningSteps.map((step, i) => (
                              <div key={i} className="text-xs bg-gray-50 p-2 rounded">
                                <span className="font-medium">Step {step.step}:</span>{' '}
                                {step.tool ? (
                                  <span>调用 <code className="bg-gray-200 px-1 rounded">{step.tool}</code></span>
                                ) : null}
                                {' '}{step.thought}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {diagnosis.analysisMode && (
                        <div className="text-xs text-gray-400 mt-1">
                          {t('analysisMode', lang) || '分析模式'}: {diagnosis.analysisMode === 'agent' ? '🤖 Agent 多轮推理' : diagnosis.analysisMode === 'single' ? '📊 单次分析' : '⚡ 简化模式'}
                        </div>
                      )}
                      {diagnosis.calibratedConfidence !== undefined && diagnosis.calibratedConfidence < 0.5 && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                          ⚠️ {t('lowConfidenceWarning', lang) || '低置信度诊断，建议人工确认'}
                        </div>
                      )}
                      {diagnosis.contextUsed && (
                        <div className="mt-2 text-xs text-gray-400">
                          {t('contextUsed', lang) || '使用上下文'}: {
                            [
                              diagnosis.contextUsed.sourceCode && '源代码',
                              diagnosis.contextUsed.screenshot && '截图',
                              diagnosis.contextUsed.consoleLogs && '控制台日志',
                              diagnosis.contextUsed.stackTrace && '堆栈跟踪',
                              diagnosis.contextUsed.historyData && '历史数据',
                              diagnosis.contextUsed.environmentInfo && '环境信息',
                            ].filter(Boolean).join(' · ') || t('noContextUsed', lang) || '无额外上下文'
                          }
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-purple-400 pt-1 border-t border-purple-100">
                        <span>{t('model', lang) || 'Model'}: {diagnosis.model}</span>
                        {(diagnosis.calibratedConfidence ?? diagnosis.confidence) > 0 && (
                          <span>{t('confidence', lang) || 'Confidence'}: {Math.round((diagnosis.calibratedConfidence ?? diagnosis.confidence) * 100)}%</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-lightbulb text-blue-600"></i>
                    <span className="font-semibold text-blue-700">{t('suggestions', lang) || 'Suggestions'}</span>
                  </div>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• {t('checkSelector', lang) || 'Check if the selector is correct'}</li>
                    <li>• {t('checkElement', lang) || 'Verify the element exists in the DOM'}</li>
                    <li>• {t('checkTimeout', lang) || 'Consider increasing timeout if needed'}</li>
                    <li>• {t('checkNetwork', lang) || 'Check network connectivity and API responses'}</li>
                    <li>• {t('viewScreenshots', lang) || 'View screenshots and videos for visual debugging'}</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'screenshots' && hasScreenshots && (
            <div className="space-y-4">
              {displayScreenshots.map((screenshotUrl, index) => (
                <div key={`retry-screenshot-${index}`} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      <i className="fas fa-image mr-2 text-blue-500"></i>
                      Screenshot {index + 1}
                    </span>
                    <a
                      href={screenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-external-link-alt mr-1"></i>
                      {t('openNewTab', lang) || 'Open in new tab'}
                    </a>
                  </div>
                  <div className="p-2 bg-gray-100">
                    <img
                      src={screenshotUrl}
                      alt={`Screenshot ${index + 1}`}
                      className="max-w-full h-auto mx-auto rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedAttachment({ name: `Screenshot ${index + 1}`, path: screenshotUrl, contentType: 'image/png' })}
                    />
                  </div>
                </div>
              ))}
              {screenshots.map((screenshot, index) => (
                <div key={`attach-screenshot-${index}`} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      <i className="fas fa-image mr-2 text-blue-500"></i>
                      {screenshot.name}
                    </span>
                    <a
                      href={screenshot.path || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-external-link-alt mr-1"></i>
                      {t('openNewTab', lang) || 'Open in new tab'}
                    </a>
                  </div>
                  <div className="p-2 bg-gray-100">
                    {screenshot.path ? (
                      <img
                        src={screenshot.path}
                        alt={screenshot.name}
                        className="max-w-full h-auto mx-auto rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedAttachment(screenshot)}
                      />
                    ) : screenshot.body ? (
                      <img
                        src={`data:${screenshot.contentType || 'image/png'};base64,${screenshot.body}`}
                        alt={screenshot.name}
                        className="max-w-full h-auto mx-auto rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedAttachment(screenshot)}
                      />
                    ) : (
                      <div className="text-center text-gray-400 py-8">
                        <i className="fas fa-image text-4xl mb-2"></i>
                        <p className="text-sm">{t('imageNotAvailable', lang) || 'Image not available'}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'videos' && hasVideos && (
            <div className="space-y-4">
              {displayVideos.map((videoUrl, index) => (
                <div key={`retry-video-${index}`} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      <i className="fas fa-video mr-2 text-purple-500"></i>
                      Video {index + 1}
                    </span>
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-download mr-1"></i>
                      {t('download', lang) || 'Download'}
                    </a>
                  </div>
                  <div className="p-2 bg-black">
                    <video
                      src={videoUrl}
                      controls
                      className="max-w-full h-auto mx-auto"
                      style={{ maxHeight: '400px' }}
                    >
                      {t('videoNotSupported', lang) || 'Your browser does not support the video tag.'}
                    </video>
                  </div>
                </div>
              ))}
              {videos.map((video, index) => (
                <div key={`attach-video-${index}`} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      <i className="fas fa-video mr-2 text-purple-500"></i>
                      {video.name}
                    </span>
                    <a
                      href={video.path || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-download mr-1"></i>
                      {t('download', lang) || 'Download'}
                    </a>
                  </div>
                  <div className="p-2 bg-black">
                    {video.path ? (
                      <video
                        src={video.path}
                        controls
                        className="max-w-full h-auto mx-auto"
                        style={{ maxHeight: '400px' }}
                      >
                        {t('videoNotSupported', lang) || 'Your browser does not support the video tag.'}
                      </video>
                    ) : (
                      <div className="text-center text-gray-400 py-8">
                        <i className="fas fa-video text-4xl mb-2"></i>
                        <p className="text-sm">{t('videoNotAvailable', lang) || 'Video not available'}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'other' && hasOther && (
            <div className="space-y-2">
              {otherAttachments.map((attachment, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <i className="fas fa-file text-gray-400 text-lg"></i>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{attachment.name}</p>
                      {attachment.contentType && (
                        <p className="text-xs text-gray-500">{attachment.contentType}</p>
                      )}
                    </div>
                  </div>
                  {attachment.path && (
                    <a
                      href={attachment.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      <i className="fas fa-external-link-alt"></i>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {!hasError && !hasScreenshots && !hasVideos && !hasOther && (
            <div className="text-center py-12 text-gray-400">
              <i className="fas fa-folder-open text-5xl mb-3"></i>
              <p>{t('noAttachments', lang) || 'No attachments available'}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500">
              {t('runId', lang) || 'Run ID'}: {runId} • {t('testId', lang) || 'Test ID'}: {test.id}
            </div>
            {htmlReportUrl && (
              <a
                href={`${htmlReportUrl}#?testId=${test.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <i className="fas fa-external-link-alt"></i>
                {t('viewHtmlReport', lang) || 'View HTML Report'}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t('close', lang) || 'Close'}
          </button>
        </div>
      </div>

      {selectedAttachment && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedAttachment(null)}
        >
          <button
            onClick={() => setSelectedAttachment(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
          >
            <i className="fas fa-times text-2xl"></i>
          </button>
          {selectedAttachment.path ? (
            <img
              src={selectedAttachment.path}
              alt={selectedAttachment.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : selectedAttachment.body ? (
            <img
              src={`data:${selectedAttachment.contentType || 'image/png'};base64,${selectedAttachment.body}`}
              alt={selectedAttachment.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
