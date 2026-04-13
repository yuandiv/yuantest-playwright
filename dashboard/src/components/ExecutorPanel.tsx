import { Lang } from '../i18n';
import { t } from '../i18n';
import { TestCase } from '../types';

interface ExecutorPanelProps {
  lang: Lang;
  testCases: TestCase[];
  selectedIds: Set<string>;
  expandedPaths: Set<string>;
  isExecuting: boolean;
  logs: Array<{ msg: string; type: string }>;
  versionInput: string;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onExpandedPathsChange: (paths: Set<string>) => void;
  onRun: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  onVersionChange: (v: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onModal: (content: React.ReactNode) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  tests: TestCase[];
}

function buildTree(testCases: TestCase[]): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: '', children: [], tests: [] };
  for (const tc of testCases) {
    const parts = tc.path.split(/[/\\]/);
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let child = current.children.find(c => c.name === parts[i]);
      if (!child) {
        child = { name: parts[i], fullPath: parts.slice(0, i + 1).join('/'), children: [], tests: [] };
        current.children.push(child);
      }
      current = child;
    }
    current.tests.push(tc);
  }
  return root.children;
}

function countTests(node: TreeNode): number {
  return node.tests.length + node.children.reduce((s, c) => s + countTests(c), 0);
}

function countSelected(node: TreeNode, selectedIds: Set<string>): number {
  return node.tests.filter(t => selectedIds.has(t.id)).length + node.children.reduce((s, c) => s + countSelected(c, selectedIds), 0);
}

function areAllSelected(node: TreeNode, selectedIds: Set<string>): boolean {
  const allIds = new Set<string>();
  function collect(n: TreeNode) {
    for (const t of n.tests) allIds.add(t.id);
    for (const c of n.children) collect(c);
  }
  collect(node);
  if (allIds.size === 0) return false;
  for (const id of allIds) {
    if (!selectedIds.has(id)) return false;
  }
  return true;
}

function collectAllIds(node: TreeNode): string[] {
  const ids: string[] = [];
  function collect(n: TreeNode) {
    for (const t of n.tests) ids.push(t.id);
    for (const c of n.children) collect(c);
  }
  collect(node);
  return ids;
}

interface StatusCount {
  passed: number;
  failed: number;
  running: number;
  pending: number;
  idle: number;
}

function countStatus(node: TreeNode): StatusCount {
  const count: StatusCount = { passed: 0, failed: 0, running: 0, pending: 0, idle: 0 };
  function collect(n: TreeNode) {
    for (const t of n.tests) {
      const status = t.status || 'idle';
      count[status]++;
    }
    for (const c of n.children) collect(c);
  }
  collect(node);
  return count;
}

function TreeNodeView({ node, lang, selectedIds, expandedPaths, depth, onSelectedIdsChange, onExpandedPathsChange }: {
  node: TreeNode;
  lang: Lang;
  selectedIds: Set<string>;
  expandedPaths: Set<string>;
  depth: number;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onExpandedPathsChange: (paths: Set<string>) => void;
}) {
  const isExpanded = expandedPaths.has(node.fullPath);
  const total = countTests(node);
  const selected = countSelected(node, selectedIds);
  const allSelected = areAllSelected(node, selectedIds);
  const statusCount = countStatus(node);

  const toggleExpand = () => {
    const next = new Set(expandedPaths);
    if (isExpanded) next.delete(node.fullPath);
    else next.add(node.fullPath);
    onExpandedPathsChange(next);
  };

  const toggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    const allIds = collectAllIds(node);
    if (allSelected) {
      for (const id of allIds) next.delete(id);
    } else {
      for (const id of allIds) next.add(id);
    }
    onSelectedIdsChange(next);
  };

  const renderStatusBadge = (count: number, status: keyof StatusCount, icon: string, colorClass: string) => {
    if (count === 0) return null;
    return (
      <span key={status} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${colorClass}`}>
        <i className={`fas fa-${icon}`}></i>
        {count}
      </span>
    );
  };

  const statusBadges = () => {
    const badges = [];
    if (statusCount.passed > 0) badges.push(renderStatusBadge(statusCount.passed, 'passed', 'fa-check', 'bg-green-100 text-green-600'));
    if (statusCount.failed > 0) badges.push(renderStatusBadge(statusCount.failed, 'failed', 'fa-times', 'bg-red-100 text-red-600'));
    if (statusCount.running > 0) badges.push(renderStatusBadge(statusCount.running, 'running', 'fa-spinner fa-spin', 'bg-blue-100 text-blue-600'));
    if (statusCount.pending > 0) badges.push(renderStatusBadge(statusCount.pending, 'pending', 'fa-clock', 'bg-amber-100 text-amber-600'));
    return badges;
  };

  const statusIcon = (status?: string) => {
    switch (status) {
      case 'passed': return <i className="fas fa-check-circle text-green-500"></i>;
      case 'failed': return <i className="fas fa-times-circle text-red-500"></i>;
      case 'running': return <i className="fas fa-spinner fa-spin text-blue-500"></i>;
      case 'pending': return <i className="fas fa-clock text-amber-500 animate-pulse"></i>;
      case 'idle':
      default: return null;
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-xs ${depth > 0 ? 'ml-4' : ''}`}
        onClick={toggleExpand}
      >
        <input
          type="checkbox"
          checked={allSelected && total > 0}
          ref={el => { if (el) el.indeterminate = !allSelected && selected > 0; }}
          onChange={toggleSelect}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <i className={`fas fa-chevron-right text-gray-400 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
        <i className="fas fa-folder text-amber-400"></i>
        <span className="font-medium text-gray-700 flex-1 truncate">{node.name}</span>
        <div className="flex items-center gap-1">
          {statusBadges()}
        </div>
        <span className="text-gray-400 text-[10px]">{selected}/{total}</span>
      </div>
      {isExpanded && (
        <div className="ml-2">
          {node.children.map(child => (
            <TreeNodeView
              key={child.fullPath}
              node={child}
              lang={lang}
              selectedIds={selectedIds}
              expandedPaths={expandedPaths}
              depth={depth + 1}
              onSelectedIdsChange={onSelectedIdsChange}
              onExpandedPathsChange={onExpandedPathsChange}
            />
          ))}
          {node.tests.map(test => (
            <div
              key={test.id}
              className={`flex items-center gap-1.5 py-1 px-2 ml-4 rounded-lg hover:bg-gray-50 transition-colors text-xs cursor-pointer`}
              onClick={() => {
                const next = new Set(selectedIds);
                if (next.has(test.id)) next.delete(test.id);
                else next.add(test.id);
                onSelectedIdsChange(next);
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(test.id)}
                onChange={e => {
                  e.stopPropagation();
                  const next = new Set(selectedIds);
                  if (next.has(test.id)) next.delete(test.id);
                  else next.add(test.id);
                  onSelectedIdsChange(next);
                }}
                onClick={e => e.stopPropagation()}
                className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              {statusIcon(test.status)}
              <span className={`flex-1 truncate ${test.status === 'failed' ? 'text-red-600' : 'text-gray-600'}`}>{test.name}</span>
              {test.lastDuration !== null && (
                <span className="text-gray-400 text-[10px]">{(test.lastDuration / 1000).toFixed(1)}s</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExecutorPanel({
  lang, testCases, selectedIds, expandedPaths, isExecuting, logs, versionInput,
  onSelectedIdsChange, onExpandedPathsChange, onRun, onStop, onClearLogs,
  onVersionChange, onSelectAll, onClearAll, onExpandAll, onCollapseAll, onModal,
}: ExecutorPanelProps) {
  const tree = buildTree(testCases);
  const selectedCount = selectedIds.size;

  return (
    <div className="bg-white rounded-[1.25rem] shadow-sm p-5">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            <i className="fas fa-play-circle text-indigo-500 mr-2"></i>{t('executor', lang)}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{t('testCaseTree', lang)} {t('dirDiscovery', lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExpandAll} className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors">
            <i className="fas fa-expand-alt mr-1"></i>{t('expandAll', lang)}
          </button>
          <button onClick={onCollapseAll} className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors">
            <i className="fas fa-compress-alt mr-1"></i>{t('collapseAll', lang)}
          </button>
          <button onClick={onSelectAll} className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-lg transition-colors">
            <i className="fas fa-check-double mr-1"></i>{t('selectAll', lang)}
          </button>
          <button onClick={onClearAll} className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors">
            <i className="fas fa-times mr-1"></i>{t('clearAll', lang)}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <i className="fas fa-tag text-indigo-400"></i>
          <input
            type="text"
            value={versionInput}
            onChange={e => onVersionChange(e.target.value)}
            className="bg-transparent text-sm text-gray-700 outline-none w-full"
            placeholder={t('versionLabel', lang)}
          />
        </div>
        <button
          onClick={onRun}
          disabled={isExecuting}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ${
            isExecuting
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:shadow-lg hover:shadow-indigo-200 active:scale-[0.98]'
          }`}
        >
          <i className={`fas ${isExecuting ? 'fa-spinner fa-spin' : 'fa-play'} mr-1.5`}></i>
          {isExecuting ? t('running', lang) : t('runSelected', lang)}
          <span className="ml-1.5 bg-white/20 px-2 py-0.5 rounded-full text-xs">{selectedCount}</span>
        </button>
        <button
          onClick={onStop}
          disabled={!isExecuting}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ${
            !isExecuting
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg hover:shadow-red-200 active:scale-[0.98]'
          }`}
        >
          <i className="fas fa-stop mr-1.5"></i>{t('stop', lang)}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
        <span className={`px-2 py-0.5 rounded-full font-medium ${isExecuting ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
          {isExecuting ? t('running', lang) : t('ready', lang)}
        </span>
        <span>{t('selectedCases', lang)}: <strong className="text-indigo-600">{selectedCount}</strong></span>
      </div>

      <div className="border rounded-xl p-3 max-h-[280px] overflow-y-auto bg-gray-50 mb-4">
        {testCases.length === 0 ? (
          <p className="text-gray-400 text-xs p-4 text-center">{t('noTestCases', lang)}</p>
        ) : tree.map(node => (
          <TreeNodeView
            key={node.fullPath}
            node={node}
            lang={lang}
            selectedIds={selectedIds}
            expandedPaths={expandedPaths}
            depth={0}
            onSelectedIdsChange={onSelectedIdsChange}
            onExpandedPathsChange={onExpandedPathsChange}
          />
        ))}
      </div>

      <div className="border rounded-xl bg-gray-900 p-3 max-h-[200px] overflow-y-auto">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400 font-medium">
            <i className="fas fa-terminal mr-1.5"></i>{t('liveLogs', lang)}
          </span>
          <button onClick={onClearLogs} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <i className="fas fa-eraser mr-1"></i>{t('clearLogs', lang)}
          </button>
        </div>
        <div className="space-y-0.5 font-mono text-[11px]">
          {logs.length === 0 ? (
            <p className="text-gray-600">{t('noTask', lang)}</p>
          ) : logs.map((log, i) => (
            <div key={i} className={`${
              log.type === 'error' ? 'text-red-400' :
              log.type === 'success' ? 'text-green-400' :
              log.type === 'warning' ? 'text-amber-400' :
              'text-gray-300'
            }`}>
              {log.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
