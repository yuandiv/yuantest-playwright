import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Lang, t } from '../i18n';
import { FlakyTest, QuarantinedTest, RunReport, FlakyClassification } from '../types';
import * as api from '../services/api';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface FlakyTestsPanelProps {
  lang: Lang;
  reports: RunReport[];
  flakyTests: FlakyTest[];
  quarantinedTests: QuarantinedTest[];
  onReleaseTest: (testId: string) => void;
  onValidateReleaseTest: (testId: string) => void;
  onRefresh: () => Promise<void>;
  onClearFlakyHistory: () => Promise<void>;
  onNavigateToFailureAnalysis?: () => void;
}

type TabKey = 'overview' | 'list' | 'trend' | 'causal' | 'correlations';

interface CausalNodeData {
  id: string;
  type: 'test' | 'infrastructure' | 'external_service' | 'shared_state';
  label: string;
  metadata: Record<string, unknown>;
}

interface CausalEdgeData {
  from: string;
  to: string;
  weight: number;
  type: string;
  confidence: number;
}

interface CausalGraphData {
  nodes: CausalNodeData[];
  edges: CausalEdgeData[];
  rootCauses: CausalNodeData[];
  impactMap: Record<string, string[]>;
  builtAt: number;
}

interface ImpactAnalysisData {
  testId: string;
  directlyAffected: string[];
  indirectlyAffected: string[];
  totalImpact: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return value;
}

const NODE_TYPE_STYLES: Record<string, { fill: string; stroke: string; icon: string; label: string }> = {
  test: { fill: '#dbeafe', stroke: '#3b82f6', icon: 'fa-vial', label: 'Test' },
  infrastructure: { fill: '#fef3c7', stroke: '#f59e0b', icon: 'fa-server', label: 'Infra' },
  external_service: { fill: '#fce7f3', stroke: '#ec4899', icon: 'fa-cloud', label: 'ExtSvc' },
  shared_state: { fill: '#e0e7ff', stroke: '#6366f1', icon: 'fa-database', label: 'Shared' },
};

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

function categorizeErrorLocal(error: string): string {
  const lower = error.toLowerCase();
  if (/timeout|timed?\s*out|exceeded.*time/.test(lower)) return 'timeout';
  if (/selector|element.*not.*found|waiting.*locator|no.*element/.test(lower)) return 'selector';
  if (/network|fetch|econnrefused|dns|net::|request.*fail|err_connection|cors/.test(lower)) return 'network';
  if (/assert|expect.*received|expected.*but/.test(lower)) return 'assertion';
  if (/frame|iframe|context.*destroyed|page.*closed/.test(lower)) return 'frame';
  if (/auth|unauthorized|forbidden|401|403|login|token/.test(lower)) return 'auth';
  return 'unknown';
}

function CausalGraphView({ graph, lang, onSelectNode }: { graph: CausalGraphData; lang: Lang; onSelectNode: (id: string) => void }) {
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const centerX = 400;
    const centerY = 250;
    const rootCauseIds = new Set(graph.rootCauses.map(n => n.id));

    const rootNodes = graph.nodes.filter(n => rootCauseIds.has(n.id));
    const otherNodes = graph.nodes.filter(n => !rootCauseIds.has(n.id));

    rootNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(rootNodes.length, 1) - Math.PI / 2;
      const radius = 80;
      positions.set(node.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    otherNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(otherNodes.length, 1);
      const radius = Math.min(200, 100 + otherNodes.length * 15);
      positions.set(node.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    return positions;
  }, [graph]);

  const width = 800;
  const height = 500;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: '500px' }}>
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
        </marker>
        <marker id="arrowhead-root" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
        </marker>
      </defs>

      {graph.edges.map((edge, i) => {
        const from = nodePositions.get(edge.from);
        const to = nodePositions.get(edge.to);
        if (!from || !to) return null;
        const isFromRoot = graph.rootCauses.some(n => n.id === edge.from);
        return (
          <line
            key={`edge-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={isFromRoot ? '#ef4444' : '#94a3b8'}
            strokeWidth={Math.max(1, edge.weight * 3)}
            strokeOpacity={0.6}
            markerEnd={isFromRoot ? 'url(#arrowhead-root)' : 'url(#arrowhead)'}
          />
        );
      })}

      {graph.nodes.map(node => {
        const pos = nodePositions.get(node.id);
        if (!pos) return null;
        const isRootCause = graph.rootCauses.some(n => n.id === node.id);
        const style = NODE_TYPE_STYLES[node.type] || NODE_TYPE_STYLES.test;
        return (
          <g key={node.id} onClick={() => onSelectNode(node.id)} className="cursor-pointer">
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isRootCause ? 28 : 22}
              fill={isRootCause ? '#fecaca' : style.fill}
              stroke={isRootCause ? '#ef4444' : style.stroke}
              strokeWidth={isRootCause ? 3 : 2}
            />
            {isRootCause && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={32}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.5}
              />
            )}
            <text
              x={pos.x}
              y={pos.y + 4}
              textAnchor="middle"
              fontSize={9}
              fontWeight={isRootCause ? 'bold' : 'normal'}
              fill={isRootCause ? '#dc2626' : '#374151'}
            >
              {node.label.length > 12 ? node.label.slice(0, 12) + '…' : node.label}
            </text>
          </g>
        );
      })}

      <g>
        {Object.entries(NODE_TYPE_STYLES).map(([type, style], i) => (
          <g key={type} transform={`translate(10, ${height - 80 + i * 18})`}>
            <circle cx={8} cy={8} r={6} fill={style.fill} stroke={style.stroke} strokeWidth={1.5} />
            <text x={20} y={12} fontSize={10} fill="#6b7280">{style.label}</text>
          </g>
        ))}
        <g transform={`translate(10, ${height - 80 + Object.keys(NODE_TYPE_STYLES).length * 18})`}>
          <circle cx={8} cy={8} r={6} fill="#fecaca" stroke="#ef4444" strokeWidth={2} />
          <text x={20} y={12} fontSize={10} fill="#6b7280">{t('rootCauseNode', lang)}</text>
        </g>
      </g>
    </svg>
  );
}

export function FlakyTestsPanel({
  lang,
  reports,
  flakyTests,
  quarantinedTests,
  onReleaseTest,
  onValidateReleaseTest,
  onRefresh,
  onClearFlakyHistory,
  onNavigateToFailureAnalysis,
}: FlakyTestsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [causalGraph, setCausalGraph] = useState<CausalGraphData | null>(null);
  const [loadingCausalGraph, setLoadingCausalGraph] = useState(false);
  const [selectedImpact, setSelectedImpact] = useState<ImpactAnalysisData | null>(null);
  const [correlations, setCorrelations] = useState<any[] | null>(null);
  const [loadingCorrelations, setLoadingCorrelations] = useState(false);
  const [healthScore, setHealthScore] = useState<any | null>(null);

  const classificationCounts = useMemo(() => {
    const counts: Record<string, number> = { broken: 0, flaky: 0, regression: 0, monitor: 0, stable: 0 };
    flakyTests.forEach(test => {
      const cls = test.classification || 'flaky';
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return counts;
  }, [flakyTests]);

  const trendData = useMemo(() => {
    if (!reports || reports.length < 2) return [];
    return reports.slice(-20).map(report => {
      const details = report.details || [];
      const failedDetails = details.filter(d => d.status === 'failed');
      const byCategory: Record<string, number> = { timeout: 0, selector: 0, network: 0, assertion: 0, frame: 0, auth: 0, unknown: 0 };
      failedDetails.forEach(d => {
        const error = d.error || '';
        const cat = categorizeErrorLocal(error);
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });
      return {
        time: new Date(report.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        total: failedDetails.length,
        ...byCategory,
      };
    });
  }, [reports, lang]);

  useEffect(() => {
    api.getFlakyHealth().then(data => {
      if (data) setHealthScore(data);
    }).catch(() => {});
  }, []);

  const handleLoadCausalGraph = async () => {
    setLoadingCausalGraph(true);
    setSelectedImpact(null);
    try {
      const data = await api.getCausalGraph();
      if (data) {
        setCausalGraph(data as CausalGraphData);
      }
    } catch {
      setCausalGraph(null);
    } finally {
      setLoadingCausalGraph(false);
    }
  };

  const handleSelectCausalNode = async (nodeId: string) => {
    try {
      const data = await api.getImpactAnalysis(nodeId);
      if (data) {
        setSelectedImpact(data as ImpactAnalysisData);
      }
    } catch {
      setSelectedImpact(null);
    }
  };

  const handleLoadCorrelations = async () => {
    setLoadingCorrelations(true);
    try {
      const data = await api.getCorrelations();
      if (data) {
        setCorrelations(data);
      }
    } catch {
      setCorrelations(null);
    } finally {
      setLoadingCorrelations(false);
    }
  };

  const getStabilityInfo = (failureRate: number) => {
    if (failureRate <= 0.2) {
      return { label: t('highStability', lang), color: 'bg-green-100 text-green-700 border-green-200', icon: 'fas fa-shield-check' };
    } else if (failureRate <= 0.5) {
      return { label: t('mediumStability', lang), color: 'bg-amber-100 text-amber-700 border-amber-200', icon: 'fas fa-exclamation-circle' };
    } else {
      return { label: t('lowStability', lang), color: 'bg-red-100 text-red-700 border-red-200', icon: 'fas fa-exclamation-triangle' };
    }
  };

  const getClassificationInfo = (classification?: FlakyClassification) => {
    switch (classification) {
      case 'broken': return { label: t('brokenLabel', lang), color: 'bg-red-100 text-red-700', icon: 'fas fa-bug' };
      case 'regression': return { label: t('regressionLabel', lang), color: 'bg-orange-100 text-orange-700', icon: 'fas fa-arrow-trend-down' };
      case 'flaky': return { label: t('flakyLabel', lang), color: 'bg-amber-100 text-amber-700', icon: 'fas fa-shuffle' };
      case 'monitor': return { label: t('monitorLabel', lang), color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-eye' };
      case 'stable': return { label: t('stableLabel', lang), color: 'bg-green-100 text-green-700', icon: 'fas fa-check-circle' };
      default: return null;
    }
  };

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'overview', label: t('overview', lang), icon: 'fas fa-chart-pie' },
    { key: 'list', label: t('testCaseList', lang), icon: 'fas fa-list' },
    { key: 'trend', label: t('failureTrend', lang), icon: 'fas fa-chart-line' },
    { key: 'causal', label: t('causalGraph', lang), icon: 'fas fa-project-diagram' },
    { key: 'correlations', label: t('correlationAnalysis', lang), icon: 'fas fa-link' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="border-b border-gray-100 px-5 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            <i className="fas fa-bug mr-2 text-amber-500"></i>{t('flakyTestsTitle', lang)}
          </h2>
          <span className="text-xs text-gray-400">{flakyTests.length} {t('items', lang)}</span>
          <div className="flex-1"></div>
          {onNavigateToFailureAnalysis && (
            <button
              onClick={onNavigateToFailureAnalysis}
              className="text-xs px-3 py-1.5 rounded-lg border text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer"
            >
              <i className="fas fa-search-plus mr-1"></i>{t('viewFailureAnalysis', lang) || '失败分析'}
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-all cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-amber-50 text-amber-700 border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className={`${tab.icon} mr-1`}></i>{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                    <i className="fas fa-bug text-sm text-white"></i>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mb-1">{t('total', lang)}</div>
                <div className="text-2xl font-bold text-amber-600">{flakyTests.length}</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-4 border border-red-100">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                    <i className="fas fa-fire text-sm text-white"></i>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mb-1">{t('brokenLabel', lang)}</div>
                <div className="text-2xl font-bold text-red-600">{classificationCounts.broken}</div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                    <i className="fas fa-arrow-trend-down text-sm text-white"></i>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mb-1">{t('regressionLabel', lang)}</div>
                <div className="text-2xl font-bold text-orange-600">{classificationCounts.regression}</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-4 border border-yellow-100">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center">
                    <i className="fas fa-shuffle text-sm text-white"></i>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mb-1">{t('flakyLabel', lang)}</div>
                <div className="text-2xl font-bold text-yellow-600">{classificationCounts.flaky}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <i className="fas fa-eye text-sm text-white"></i>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mb-1">{t('monitorLabel', lang)}</div>
                <div className="text-2xl font-bold text-blue-600">{classificationCounts.monitor}</div>
              </div>
            </div>

            {healthScore && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    <i className="fas fa-heartbeat mr-1.5 text-indigo-500"></i>{t('healthScore', lang)}
                  </h3>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: t('overall', lang), value: safeNumber(healthScore.overall, 0), color: 'indigo' },
                    { label: t('stability', lang), value: safeNumber(healthScore.stability, 0), color: 'green' },
                    { label: t('trend', lang), value: safeNumber(healthScore.trend, 0), color: 'blue' },
                    { label: t('recoverability', lang), value: safeNumber(healthScore.recoverability, 0), color: 'amber' },
                    { label: t('predictability', lang), value: safeNumber(healthScore.predictability, 0), color: 'purple' },
                  ].map(item => (
                    <div key={item.label} className="text-center">
                      <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                      <div className="text-lg font-bold" style={{ color: item.value >= 70 ? '#22c55e' : item.value >= 40 ? '#f59e0b' : '#ef4444' }}>
                        {item.value.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {quarantinedTests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  <i className="fas fa-lock mr-1.5 text-red-500"></i>{t('quarantinedTests', lang)}
                  <span className="text-xs text-gray-400 ml-2">{quarantinedTests.length} {t('items', lang)}</span>
                </h3>
                <div className="space-y-2">
                  {quarantinedTests.slice(0, 5).map(test => (
                    <div key={test.testId} className="bg-gradient-to-r from-red-50 to-white border border-red-100 rounded-lg p-2.5">
                      <div className="flex justify-between items-center">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs text-gray-800 truncate">{test.title}</p>
                          <p className="text-[10px] text-gray-400">
                            <i className="fas fa-times-circle mr-0.5 text-red-400"></i>{(safeNumber(test.failureRate, 0) * 100).toFixed(0)}%
                            {test.consecutivePassesSinceQuarantine != null && test.consecutivePassesSinceQuarantine > 0 && (
                              <><span className="mx-1">·</span><i className="fas fa-check mr-0.5 text-green-500"></i>{test.consecutivePassesSinceQuarantine}</>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] hover:bg-blue-600 cursor-pointer"
                            onClick={() => onValidateReleaseTest(test.testId)}
                          >
                            <i className="fas fa-flask mr-0.5"></i>{t('validateReleaseAction', lang)}
                          </button>
                          <button
                            className="bg-green-500 text-white px-2 py-0.5 rounded text-[10px] hover:bg-green-600 cursor-pointer"
                            onClick={() => onReleaseTest(test.testId)}
                          >
                            <i className="fas fa-unlock mr-0.5"></i>{t('releaseAction', lang)}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'list' && (
          <div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {flakyTests.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-check-circle text-3xl text-green-300 mb-2"></i>
                  <p className="text-gray-400 text-xs">{t('noFlakyTests', lang)}</p>
                </div>
              ) : flakyTests.map(test => {
                const rate = (safeNumber(test.failureRate, 0) * 100).toFixed(0);
                const stability = getStabilityInfo(safeNumber(test.failureRate, 0));
                const classInfo = getClassificationInfo(test.classification);
                return (
                  <div key={test.testId} className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg p-3 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm text-gray-800 truncate" title={test.title}>{test.title}</p>
                          {classInfo && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${classInfo.color} flex-shrink-0`}>
                              <i className={`${classInfo.icon} mr-0.5`}></i>{classInfo.label}
                            </span>
                          )}
                          {test.trendAnalysis && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              test.trendAnalysis.direction === 'improving' ? 'bg-green-100 text-green-700' :
                              test.trendAnalysis.direction === 'degrading' ? 'bg-red-100 text-red-700' :
                              test.trendAnalysis.direction === 'volatile' ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              <i className={`fas ${
                                test.trendAnalysis.direction === 'improving' ? 'fa-arrow-trend-up' :
                                test.trendAnalysis.direction === 'degrading' ? 'fa-arrow-trend-down' :
                                test.trendAnalysis.direction === 'volatile' ? 'fa-bolt' :
                                'fa-minus'
                              } mr-0.5`}></i>
                              {test.trendAnalysis.direction === 'improving' ? t('trendImproving', lang) :
                               test.trendAnalysis.direction === 'degrading' ? t('trendDegrading', lang) :
                               test.trendAnalysis.direction === 'volatile' ? t('trendVolatile', lang) :
                               test.trendAnalysis.direction === 'stable' ? t('trendStable', lang) :
                               test.trendAnalysis.direction}
                            </span>
                          )}
                          {test.healthScore && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              safeNumber(test.healthScore.overall, 0) >= 70 ? 'bg-green-100 text-green-700' :
                              safeNumber(test.healthScore.overall, 0) >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              <i className="fas fa-heartbeat mr-0.5"></i>{safeNumber(test.healthScore.overall, 0).toFixed(0)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          <i className="fas fa-hashtag mr-0.5"></i>{t('runCount', lang)}: {test.totalRuns}
                          {test.lastFailure && (
                            <><span className="mx-1.5">·</span><i className="fas fa-clock mr-0.5"></i>{new Date(test.lastFailure).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</>
                          )}
                        </p>
                        {test.rootCause && (
                          <p className="text-xs text-blue-500 mt-1">
                            <i className="fas fa-search mr-0.5"></i>{test.rootCause.primaryCause}
                            <span className="text-gray-400 ml-1">({(safeNumber(test.rootCause.confidence, 0) * 100).toFixed(0)}%)</span>
                          </p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${stability.color} border ml-2 flex-shrink-0`}>
                        <i className={`${stability.icon} mr-0.5`}></i>{stability.label} · {rate}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${test.failureRate > 0.5 ? 'bg-red-500' : test.failureRate > 0.2 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.max(test.failureRate * 100, 2)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'trend' && (
          <div>
            {trendData.length >= 2 ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    <i className="fas fa-chart-line mr-1.5 text-indigo-500"></i>{t('failureTrend', lang)}
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="timeout" stackId="categories" fill="#f59e0b" name={t('category.timeout', lang)} />
                    <Bar dataKey="selector" stackId="categories" fill="#8b5cf6" name={t('category.selector', lang)} />
                    <Bar dataKey="network" stackId="categories" fill="#3b82f6" name={t('category.network', lang)} />
                    <Bar dataKey="assertion" stackId="categories" fill="#ef4444" name={t('category.assertion', lang)} />
                    <Bar dataKey="frame" stackId="categories" fill="#f97316" name={t('category.frame', lang)} />
                    <Bar dataKey="auth" stackId="categories" fill="#06b6d4" name={t('category.auth', lang)} />
                    <Bar dataKey="unknown" stackId="categories" fill="#6b7280" name={t('category.unknown', lang)} />
                    <Line type="monotone" dataKey="total" stroke="#1f2937" strokeWidth={2} dot={{ r: 3 }} name={t('failureCount', lang)} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
                <i className="fas fa-chart-line text-2xl text-gray-300 mb-2"></i>
                <p className="text-gray-400 text-xs">{t('noTrendData', lang) || 'Not enough data for trend analysis'}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'causal' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                <i className="fas fa-project-diagram mr-1.5 text-indigo-500"></i>{t('causalGraph', lang)}
              </h3>
              {!causalGraph && !loadingCausalGraph && (
                <button
                  onClick={handleLoadCausalGraph}
                  className="text-xs px-3 py-1.5 rounded-lg border text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                >
                  <i className="fas fa-download mr-1"></i>{t('loadCausalGraph', lang) || 'Load Causal Graph'}
                </button>
              )}
              {loadingCausalGraph && (
                <span className="text-xs text-gray-400"><i className="fas fa-spinner animate-spin mr-1"></i>{t('loading', lang)}</span>
              )}
            </div>

            {causalGraph && (
              <>
                <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                  <span><i className="fas fa-circle mr-1 text-blue-400"></i>{causalGraph.nodes.length} {t('nodes', lang) || 'nodes'}</span>
                  <span><i className="fas fa-arrow-right mr-1 text-gray-400"></i>{causalGraph.edges.length} {t('edges', lang) || 'edges'}</span>
                  <span><i className="fas fa-bullseye mr-1 text-red-400"></i>{causalGraph.rootCauses.length} {t('rootCauseNode', lang)}</span>
                </div>
                <div className="p-3 overflow-x-auto">
                  <CausalGraphView graph={causalGraph} lang={lang} onSelectNode={handleSelectCausalNode} />
                </div>

                {selectedImpact && (
                  <div className="border-t border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">
                        <i className="fas fa-sitemap mr-1.5 text-indigo-500"></i>{t('impactAnalysis', lang)}
                      </h4>
                      <span className="text-xs text-gray-400" title={selectedImpact.testId}>{flakyTests.find(ft => ft.testId === selectedImpact.testId)?.title || selectedImpact.testId}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-blue-600 mb-1">{t('directlyAffected', lang)}</div>
                        <div className="text-lg font-bold text-blue-700">{selectedImpact.directlyAffected.length}</div>
                      </div>
                      <div className="bg-indigo-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-indigo-600 mb-1">{t('indirectlyAffected', lang)}</div>
                        <div className="text-lg font-bold text-indigo-700">{selectedImpact.indirectlyAffected.length}</div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-amber-600 mb-1">{t('totalImpact', lang)}</div>
                        <div className="text-lg font-bold text-amber-700">{selectedImpact.totalImpact}</div>
                      </div>
                      <div className="rounded-lg p-3 text-center" style={{ backgroundColor: RISK_COLORS[selectedImpact.riskLevel] + '15' }}>
                        <div className="text-xs mb-1" style={{ color: RISK_COLORS[selectedImpact.riskLevel] }}>{t('riskLevel', lang)}</div>
                        <div className="text-lg font-bold" style={{ color: RISK_COLORS[selectedImpact.riskLevel] }}>{selectedImpact.riskLevel === 'low' ? t('riskLow', lang) : selectedImpact.riskLevel === 'medium' ? t('riskMedium', lang) : selectedImpact.riskLevel === 'high' ? t('riskHigh', lang) : selectedImpact.riskLevel === 'critical' ? t('riskCritical', lang) : selectedImpact.riskLevel.toUpperCase()}</div>
                      </div>
                    </div>
                    {selectedImpact.recommendation && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-600 mb-1">
                          <i className="fas fa-lightbulb mr-1 text-amber-500"></i>{t('recommendation', lang)}
                        </p>
                        <p className="text-xs text-gray-500">{selectedImpact.recommendation}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!causalGraph && !loadingCausalGraph && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-project-diagram text-xl text-gray-400"></i>
                </div>
                <p className="text-gray-500 text-sm mb-1">{t('causalGraph', lang)}</p>
                <p className="text-gray-400 text-xs">{t('noCausalGraphData', lang)}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'correlations' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                <i className="fas fa-link mr-1.5 text-indigo-500"></i>{t('correlationAnalysis', lang)}
              </h3>
              {!correlations && !loadingCorrelations && (
                <button
                  onClick={handleLoadCorrelations}
                  className="text-xs px-3 py-1.5 rounded-lg border text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                >
                  <i className="fas fa-download mr-1"></i>{t('loadCorrelations', lang) || 'Load Correlations'}
                </button>
              )}
              {loadingCorrelations && (
                <span className="text-xs text-gray-400"><i className="fas fa-spinner animate-spin mr-1"></i>{t('loading', lang)}</span>
              )}
            </div>

            {correlations && correlations.length > 0 ? (
              <div className="space-y-3">
                {correlations.map((group: any, idx: number) => {
                  const correlationTypeLabel = (ct: string) => {
                    switch (ct) {
                      case 'same_run': return t('correlationSameRun', lang);
                      case 'same_shard': return t('correlationSameShard', lang);
                      case 'same_time_window': return t('correlationSameTimeWindow', lang);
                      case 'same_error_pattern': return t('correlationSameErrorPattern', lang);
                      case 'same_file': return t('correlationSameFile', lang);
                      default: return ct || t('correlationGroup', lang);
                    }
                  };
                  return (
                  <div key={group.groupId || idx} className="bg-gradient-to-r from-indigo-50 to-white border border-indigo-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-indigo-700">
                        <i className="fas fa-link mr-1"></i>{correlationTypeLabel(group.correlationType)} #{idx + 1}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">
                        {t('confidence', lang)}: {(safeNumber(group.confidence, 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(group.testTitles || group.testIds || []).map((item: string, i: number) => {
                        const title = group.testTitles ? item : item;
                        const id = group.testIds ? group.testIds[i] : item;
                        return (
                          <span key={id || i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100" title={id}>{title}</span>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : correlations && correlations.length === 0 ? (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
                <i className="fas fa-link text-2xl text-gray-300 mb-2"></i>
                <p className="text-gray-400 text-xs">{t('noCorrelationData', lang) || 'No correlation data available'}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
