import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import * as api from '../services/api';
import type { AgentConfig, TestPlan, HealerPatch, AgentHealResult, ProjectContextResponse } from '../services/api';
import type { LLMStatus } from '../types';

interface AgentPanelProps {
  lang: Lang;
  onClose: () => void;
  onOpenLLMConfig?: () => void;
}

type AgentTab = 'plan' | 'generate' | 'heal' | 'history';

export function AgentPanel({ lang, onClose, onOpenLLMConfig }: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<AgentTab>('plan');
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [projectCtx, setProjectCtx] = useState<ProjectContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [executorRunning, setExecutorRunning] = useState(false);

  const [planDescription, setPlanDescription] = useState('');
  const [planSeedTest, setPlanSeedTest] = useState('');
  const [planOutputDir, setPlanOutputDir] = useState('specs/');

  const [genPlanPath, setGenPlanPath] = useState('');
  const [genOutputDir, setGenOutputDir] = useState('tests/');
  const [genSeedTest, setGenSeedTest] = useState('');

  const [healTestPath, setHealTestPath] = useState('');
  const [healError, setHealError] = useState('');
  const [healStackTrace, setHealStackTrace] = useState('');
  const [healApply, setHealApply] = useState(false);

  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [healHistory, setHealHistory] = useState<AgentHealResult[]>([]);

  useEffect(() => {
    api.getAgentConfig().then(c => { if (c) setConfig(c); }).catch(() => {});
    api.getProjectContext().then(c => { if (c) setProjectCtx(c); }).catch(() => {});
    api.getLLMStatus().then(s => { if (s) setLlmStatus(s); }).catch(() => {});
    api.getRunStatus().then(s => { setExecutorRunning(s?.isRunning || false); }).catch(() => {});

    const interval = setInterval(() => {
      api.getLLMStatus().then(s => { if (s) setLlmStatus(s); }).catch(() => {});
      api.getRunStatus().then(s => { setExecutorRunning(s?.isRunning || false); }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      api.getAgentPlans().then(p => { if (p) setPlans(p); }).catch(() => {});
      api.getHealHistory().then(h => { if (h) setHealHistory(h); }).catch(() => {});
    }
  }, [activeTab]);

  const handlePlan = async () => {
    if (!planDescription.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateTestPlan({
        description: planDescription,
        seedTest: planSeedTest || undefined,
        outputDir: planOutputDir || undefined,
      });
      if (res?.success && res.data) {
        const plan = res.data;
        setResult(
          `✅ ${t('agentPlanGenerated', lang) || 'Plan generated'} (${res.duration}ms)\n` +
          `📋 ${plan.title}\n` +
          `${plan.description}\n` +
          `${t('agentScenarios', lang) || 'Scenarios'}: ${plan.scenarios.length}\n` +
          plan.scenarios.map((s, i) => `  ${i + 1}. ${s.name} (${s.steps.length} steps)`).join('\n') +
          (plan.filePath ? `\n📄 ${plan.filePath}` : '')
        );
      } else {
        setError(res?.error || (t('agentPlanFailed', lang) || 'Failed to generate plan'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!genPlanPath.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateTests({
        planPath: genPlanPath,
        outputDir: genOutputDir || undefined,
        seedTest: genSeedTest || undefined,
      });
      if (res?.success && res.data) {
        setResult(
          `✅ ${t('agentTestsGenerated', lang) || 'Tests generated'} (${res.duration}ms)\n` +
          res.data.map(f => `  📝 ${f}`).join('\n')
        );
      } else {
        setError(res?.error || (t('agentGenerateFailed', lang) || 'Failed to generate tests'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleHeal = async () => {
    if (!healTestPath.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.healTest({
        testFilePath: healTestPath,
        error: healError || undefined,
        stackTrace: healStackTrace || undefined,
        apply: healApply,
      });
      if (res?.success && res.data) {
        const healResult = res.data;
        setResult(
          `${healResult.healed ? '✅' : '⚠️'} ${t('agentHealResult', lang) || 'Heal result'} (${res.duration}ms)\n` +
          `🔧 ${healResult.testTitle}\n` +
          `${t('agentHealed', lang) || 'Healed'}: ${healResult.healed ? '✅' : '❌'}\n` +
          `${t('agentPatches', lang) || 'Patches'}: ${healResult.patches.length}\n` +
          `${t('agentRounds', lang) || 'Rounds'}: ${healResult.roundsUsed}\n` +
          healResult.patches.map((p, i) =>
            `  Patch ${i + 1}: ${(p.confidence * 100).toFixed(0)}% - ${p.reason}`
          ).join('\n')
        );
      } else {
        setError(res?.error || (t('agentHealFailed', lang) || 'Failed to heal test'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPatch = async (patch: HealerPatch) => {
    try {
      const res = await api.applyPatch(patch);
      if (res?.success) {
        setResult(`✅ ${t('agentPatchApplied', lang) || 'Patch applied'}: ${patch.filePath}`);
      } else {
        setError(t('agentPatchFailed', lang) || 'Failed to apply patch');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const llmReady = llmStatus?.status === 'green';
  const canUseAgents = llmReady;

  const tabs: { key: AgentTab; icon: string; label: string }[] = [
    { key: 'plan', icon: '📋', label: t('agentTabPlan', lang) || 'Planner' },
    { key: 'generate', icon: '⚡', label: t('agentTabGenerate', lang) || 'Generator' },
    { key: 'heal', icon: '🔧', label: t('agentTabHeal', lang) || 'Healer' },
    { key: 'history', icon: '📊', label: t('agentTabHistory', lang) || 'History' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {t('agentPanelTitle', lang) || 'Playwright Test Agents'}
            </h2>
            {projectCtx && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1" title={projectCtx.projectRoot}>
                  <i className="fas fa-folder-open"></i>
                  <span className="max-w-[200px] truncate">{projectCtx.projectRoot}</span>
                </span>
                {projectCtx.projectContext?.baseURL && (
                  <span className="flex items-center gap-1">
                    <i className="fas fa-globe"></i>
                    {projectCtx.projectContext.baseURL}
                  </span>
                )}
                {projectCtx.projectContext?.technology && (
                  <span className="flex items-center gap-1">
                    <i className="fas fa-code"></i>
                    {projectCtx.projectContext.technology}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(null); setResult(null); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5
                ${activeTab === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab !== 'history' && (
          !llmReady ? (
            <div className="px-4 py-2.5 text-sm flex items-center gap-2 bg-yellow-50 text-yellow-700 border-b border-yellow-100">
              <i className="fas fa-exclamation-triangle"></i>
              <span>{t('agentDependencyLLMRequired', lang)}</span>
              {onOpenLLMConfig && (
                <button 
                  onClick={() => { onClose(); onOpenLLMConfig(); }}
                  className="ml-auto text-yellow-600 hover:text-yellow-800 underline font-medium"
                >
                  {t('agentOpenLLMConfig', lang)}
                </button>
              )}
            </div>
          ) : executorRunning ? (
            <div className="px-4 py-2.5 text-sm flex items-center gap-2 bg-blue-50 text-blue-700 border-b border-blue-100">
              <i className="fas fa-info-circle"></i>
              <span>{t('agentDependencyExecutorBusy', lang)}</span>
            </div>
          ) : (
            <div className="px-4 py-2.5 text-sm flex items-center gap-2 bg-green-50 text-green-700 border-b border-green-100">
              <i className="fas fa-check-circle"></i>
              <span>{t('agentDependencyReady', lang)}</span>
            </div>
          )
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'plan' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('agentPlanDescription', lang) || 'Feature Description'}
                </label>
                <textarea
                  value={planDescription}
                  onChange={e => setPlanDescription(e.target.value)}
                  placeholder={t('agentPlanDescriptionPlaceholder', lang) || 'Describe the feature you want to test...'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('agentSeedTest', lang) || 'Seed Test'}
                  </label>
                  <input
                    type="text"
                    value={planSeedTest}
                    onChange={e => setPlanSeedTest(e.target.value)}
                    placeholder="tests/seed.spec.ts"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('agentOutputDir', lang) || 'Output Dir'}
                  </label>
                  <input
                    type="text"
                    value={planOutputDir}
                    onChange={e => setPlanOutputDir(e.target.value)}
                    placeholder="specs/"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={handlePlan}
                disabled={loading || !planDescription.trim() || !canUseAgents}
                title={!canUseAgents ? t('agentConfigureLLMFirst', lang) : undefined}
                className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> {t('agentGenerating', lang) || 'Generating...'}</>
                ) : (
                  <><i className="fas fa-magic"></i> {t('agentGeneratePlan', lang) || 'Generate Plan'}</>
                )}
              </button>
            </div>
          )}

          {activeTab === 'generate' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('agentPlanPath', lang) || 'Plan File Path'}
                </label>
                <input
                  type="text"
                  value={genPlanPath}
                  onChange={e => setGenPlanPath(e.target.value)}
                  placeholder="specs/login.md"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('agentOutputDir', lang) || 'Output Dir'}
                  </label>
                  <input
                    type="text"
                    value={genOutputDir}
                    onChange={e => setGenOutputDir(e.target.value)}
                    placeholder="tests/"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('agentSeedTest', lang) || 'Seed Test'}
                  </label>
                  <input
                    type="text"
                    value={genSeedTest}
                    onChange={e => setGenSeedTest(e.target.value)}
                    placeholder="tests/seed.spec.ts"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={loading || !genPlanPath.trim() || !canUseAgents}
                title={!canUseAgents ? t('agentConfigureLLMFirst', lang) : undefined}
                className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> {t('agentGenerating', lang) || 'Generating...'}</>
                ) : (
                  <><i className="fas fa-code"></i> {t('agentGenerateTests', lang) || 'Generate Tests'}</>
                )}
              </button>
            </div>
          )}

          {activeTab === 'heal' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('agentTestFilePath', lang) || 'Test File Path'}
                </label>
                <input
                  type="text"
                  value={healTestPath}
                  onChange={e => setHealTestPath(e.target.value)}
                  placeholder="tests/login.spec.ts"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('agentErrorMessage', lang) || 'Error Message'}
                </label>
                <textarea
                  value={healError}
                  onChange={e => setHealError(e.target.value)}
                  placeholder={t('agentErrorPlaceholder', lang) || 'Paste the error message...'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[60px] resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('agentStackTrace', lang) || 'Stack Trace'}
                </label>
                <textarea
                  value={healStackTrace}
                  onChange={e => setHealStackTrace(e.target.value)}
                  placeholder={t('agentStackPlaceholder', lang) || 'Paste the stack trace...'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[60px] resize-y"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="healApply"
                  checked={healApply}
                  onChange={e => setHealApply(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="healApply" className="text-sm text-gray-700">
                  {t('agentAutoApply', lang) || 'Auto-apply patches'}
                </label>
              </div>
              <button
                onClick={handleHeal}
                disabled={loading || !healTestPath.trim() || !canUseAgents}
                title={!canUseAgents ? t('agentConfigureLLMFirst', lang) : undefined}
                className="w-full bg-orange-600 text-white py-2.5 px-4 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> {t('agentHealing', lang) || 'Healing...'}</>
                ) : (
                  <><i className="fas fa-wrench"></i> {t('agentHealTest', lang) || 'Heal Test'}</>
                )}
              </button>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  📋 {t('agentTestPlans', lang) || 'Test Plans'}
                </h3>
                {plans.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('agentNoPlans', lang) || 'No test plans yet'}</p>
                ) : (
                  <div className="space-y-2">
                    {plans.map(plan => (
                      <div key={plan.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="font-medium text-sm text-gray-800">{plan.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {plan.scenarios.length} {t('agentScenarios', lang) || 'scenarios'} · {new Date(plan.createdAt).toLocaleString()}
                        </div>
                        {plan.filePath && (
                          <div className="text-xs text-blue-600 mt-1">{plan.filePath}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  🔧 {t('agentHealHistory', lang) || 'Heal History'}
                </h3>
                {healHistory.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('agentNoHealHistory', lang) || 'No heal history yet'}</p>
                ) : (
                  <div className="space-y-2">
                    {healHistory.map((entry, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-800">{entry.testTitle}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${entry.healed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {entry.healed ? '✅' : '❌'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {t('agentPatches', lang) || 'Patches'}: {entry.patches.length} · {t('agentRounds', lang) || 'Rounds'}: {entry.roundsUsed}
                        </div>
                        {entry.patches.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {entry.patches.map((patch, pi) => (
                              <div key={pi} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                                <span className="text-xs text-gray-600">{patch.reason}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">{(patch.confidence * 100).toFixed(0)}%</span>
                                  {!patch.appliedAt && (
                                    <button
                                      onClick={() => handleApplyPatch(patch)}
                                      className="text-xs text-blue-600 hover:text-blue-800"
                                    >
                                      {t('agentApply', lang) || 'Apply'}
                                    </button>
                                  )}
                                  {patch.appliedAt && (
                                    <span className="text-xs text-green-600">✓</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <pre className="text-sm text-green-800 whitespace-pre-wrap font-mono">{result}</pre>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
