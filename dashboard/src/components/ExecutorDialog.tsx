import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { TestCase, TestDescribe, TestFile } from '../types';

interface ExecutorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Lang;
  testFiles: TestFile[];
  testCases: TestCase[];
  selectedIds: Set<string>;
  expandedPaths: Set<string>;
  isExecuting: boolean;
  isLoadingTests: boolean;
  logs: Array<{ msg: string; type: string }>;
  versionInput: string;
  testDir: string;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onExpandedPathsChange: (paths: Set<string>) => void;
  onRun: (mode: 'test' | 'describe' | 'file', target: string) => void;
  onStop: () => void;
  onClearLogs: () => void;
  onVersionChange: (v: string) => void;
  onTestDirChange: (dir: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onModal: (content: React.ReactNode) => void;
}

function countTestsInDescribe(describe: TestDescribe): number {
  return describe.tests.length + describe.describes.reduce((s, d) => s + countTestsInDescribe(d), 0);
}

function countTestsInFile(file: TestFile): number {
  return file.tests.length + file.describes.reduce((s, d) => s + countTestsInDescribe(d), 0);
}

function countSelectedInDescribe(describe: TestDescribe, selectedIds: Set<string>): number {
  return describe.tests.filter(t => selectedIds.has(t.id)).length + 
         describe.describes.reduce((s, d) => s + countSelectedInDescribe(d, selectedIds), 0);
}

function countSelectedInFile(file: TestFile, selectedIds: Set<string>): number {
  return file.tests.filter(t => selectedIds.has(t.id)).length + 
         file.describes.reduce((s, d) => s + countSelectedInDescribe(d, selectedIds), 0);
}

function countStatusInDescribe(describe: TestDescribe) {
  let passed = 0, failed = 0, running = 0, pending = 0, idle = 0;
  function collect(d: TestDescribe) {
    for (const t of d.tests) {
      const status = t.status || 'idle';
      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;
      else if (status === 'running') running++;
      else if (status === 'pending') pending++;
      else idle++;
    }
    for (const child of d.describes) collect(child);
  }
  collect(describe);
  return { passed, failed, running, pending, idle };
}

function getNodeStatus(statusCount: { passed: number; failed: number; running: number; pending: number; idle: number }) {
  if (statusCount.failed > 0) return 'failed';
  if (statusCount.running > 0) return 'running';
  if (statusCount.pending > 0) return 'pending';
  if (statusCount.passed > 0) return 'passed';
  return 'idle';
}

function countStatusInFile(file: TestFile) {
  let passed = 0, failed = 0, running = 0, pending = 0, idle = 0;
  for (const t of file.tests) {
    const status = t.status || 'idle';
    if (status === 'passed') passed++;
    else if (status === 'failed') failed++;
    else if (status === 'running') running++;
    else if (status === 'pending') pending++;
    else idle++;
  }
  for (const d of file.describes) {
    const dCount = countStatusInDescribe(d);
    passed += dCount.passed;
    failed += dCount.failed;
    running += dCount.running;
    pending += dCount.pending;
    idle += dCount.idle;
  }
  return { passed, failed, running, pending, idle };
}

function collectAllIdsInDescribe(describe: TestDescribe): string[] {
  const ids: string[] = [];
  for (const t of describe.tests) ids.push(t.id);
  for (const d of describe.describes) ids.push(...collectAllIdsInDescribe(d));
  return ids;
}

function collectAllIdsInFile(file: TestFile): string[] {
  const ids: string[] = [];
  for (const t of file.tests) ids.push(t.id);
  for (const d of file.describes) ids.push(...collectAllIdsInDescribe(d));
  return ids;
}

const TestItemView = memo(function TestItemView({ test, statusOverride, selectedIds, onSelectedIdsChange, onRunTest }: {
  test: TestCase;
  statusOverride?: string;
  durationOverride?: number | null;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onRunTest: (test: TestCase) => void;
}) {
  const isSelected = selectedIds.has(test.id);
  const currentStatus = statusOverride || test.status;

  const toggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (isSelected) next.delete(test.id);
    else next.add(test.id);
    onSelectedIdsChange(next);
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
    <div
      className="flex items-center gap-1.5 py-1 px-2 ml-4 rounded-lg hover:bg-gray-50 transition-colors text-xs cursor-pointer group"
      onClick={toggleSelect}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={toggleSelect}
        onClick={e => e.stopPropagation()}
        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
      />
      {statusIcon(currentStatus)}
      <span className={`flex-1 truncate ${currentStatus === 'failed' ? 'text-red-600' : 'text-gray-600'}`}>{test.name}</span>
      <span className="text-gray-400 text-[10px]">:{test.line}</span>
      {test.lastDuration != null && (
        <span className="text-gray-400 text-[10px]">{(test.lastDuration / 1000).toFixed(1)}s</span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRunTest(test); }}
        className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-600 rounded text-[10px] transition-opacity"
        title="Run this test"
      >
        <i className="fas fa-play mr-0.5"></i>Run
      </button>
    </div>
  );
});

const DescribeView = memo(function DescribeView({ describe, depth, selectedIds, expandedPaths, testCaseStatusMap, onSelectedIdsChange, onExpandedPathsChange, onRunDescribe, onRunTest }: {
  describe: TestDescribe;
  depth: number;
  selectedIds: Set<string>;
  expandedPaths: Set<string>;
  testCaseStatusMap: Map<string, { status?: string; lastDuration: number | null; lastError: string | null }>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onExpandedPathsChange: (paths: Set<string>) => void;
  onRunDescribe: (describe: TestDescribe) => void;
  onRunTest: (test: TestCase) => void;
}) {
  const path = `${describe.file}::${describe.title}::${describe.line}`;
  const isExpanded = expandedPaths.has(path);
  
  const total = useMemo(() => countTestsInDescribe(describe), [describe]);
  const selected = useMemo(() => countSelectedInDescribe(describe, selectedIds), [describe, selectedIds]);
  const allSelected = total > 0 && selected === total;
  const statusCount = useMemo(() => {
    let passed = 0, failed = 0, running = 0, pending = 0, idle = 0;
    function collect(d: TestDescribe) {
      for (const t of d.tests) {
        const override = testCaseStatusMap.get(t.id);
        const status = override?.status || t.status || 'idle';
        if (status === 'passed') passed++;
        else if (status === 'failed') failed++;
        else if (status === 'running') running++;
        else if (status === 'pending') pending++;
        else idle++;
      }
      for (const child of d.describes) collect(child);
    }
    collect(describe);
    return { passed, failed, running, pending, idle };
  }, [describe, testCaseStatusMap]);
  const nodeStatus = getNodeStatus(statusCount);

  const nodeStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <i className="fas fa-check-circle text-green-500"></i>;
      case 'failed': return <i className="fas fa-times-circle text-red-500"></i>;
      case 'running': return <i className="fas fa-spinner fa-spin text-blue-500"></i>;
      case 'pending': return <i className="fas fa-clock text-amber-500 animate-pulse"></i>;
      default: return null;
    }
  };

  const renderStatusBadge = (count: number, status: string, icon: string, colorClass: string) => {
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

  const toggleExpand = () => {
    const next = new Set(expandedPaths);
    if (isExpanded) next.delete(path);
    else next.add(path);
    onExpandedPathsChange(next);
  };

  const toggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    const allIds = collectAllIdsInDescribe(describe);
    if (allSelected) {
      for (const id of allIds) next.delete(id);
    } else {
      for (const id of allIds) next.add(id);
    }
    onSelectedIdsChange(next);
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-xs group ${depth > 0 ? 'ml-4' : ''}`}
        onClick={toggleExpand}
      >
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = !allSelected && selected > 0; }}
          onChange={toggleSelect}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <i className={`fas fa-chevron-right text-gray-400 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
        {nodeStatusIcon(nodeStatus)}
        <i className="fas fa-layer-group text-purple-400"></i>
        <span className="font-medium text-gray-700 flex-1 truncate">{describe.title}</span>
        <div className="flex items-center gap-1">
          {statusBadges()}
        </div>
        <span className="text-gray-400 text-[10px]">{selected}/{total}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRunDescribe(describe); }}
          className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded text-[10px] transition-opacity"
          title="Run this describe block"
        >
          <i className="fas fa-play mr-0.5"></i>Run
        </button>
      </div>
      {isExpanded && (
        <div className="ml-2">
          {describe.describes.map(child => (
            <DescribeView
              key={`${child.file}::${child.title}::${child.line}`}
              describe={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expandedPaths={expandedPaths}
              testCaseStatusMap={testCaseStatusMap}
              onSelectedIdsChange={onSelectedIdsChange}
              onExpandedPathsChange={onExpandedPathsChange}
              onRunDescribe={onRunDescribe}
              onRunTest={onRunTest}
            />
          ))}
          {describe.tests.map(test => {
            const statusOverride = testCaseStatusMap.get(test.id);
            return (
              <TestItemView
                key={test.id}
                test={test}
                statusOverride={statusOverride?.status}
                selectedIds={selectedIds}
                onSelectedIdsChange={onSelectedIdsChange}
                onRunTest={onRunTest}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

const FileView = memo(function FileView({ file, selectedIds, expandedPaths, testCaseStatusMap, onSelectedIdsChange, onExpandedPathsChange, onRunFile, onRunDescribe, onRunTest }: {
  file: TestFile;
  selectedIds: Set<string>;
  expandedPaths: Set<string>;
  testCaseStatusMap: Map<string, { status?: string; lastDuration: number | null; lastError: string | null }>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onExpandedPathsChange: (paths: Set<string>) => void;
  onRunFile: (file: TestFile) => void;
  onRunDescribe: (describe: TestDescribe) => void;
  onRunTest: (test: TestCase) => void;
}) {
  const path = file.file;
  const isExpanded = expandedPaths.has(path);
  
  const total = useMemo(() => countTestsInFile(file), [file]);
  const selected = useMemo(() => countSelectedInFile(file, selectedIds), [file, selectedIds]);
  const allSelected = total > 0 && selected === total;
  const statusCount = useMemo(() => {
    let passed = 0, failed = 0, running = 0, pending = 0, idle = 0;
    for (const t of file.tests) {
      const override = testCaseStatusMap.get(t.id);
      const status = override?.status || t.status || 'idle';
      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;
      else if (status === 'running') running++;
      else if (status === 'pending') pending++;
      else idle++;
    }
    for (const d of file.describes) {
      function collect(dd: TestDescribe) {
        for (const t of dd.tests) {
          const override = testCaseStatusMap.get(t.id);
          const status = override?.status || t.status || 'idle';
          if (status === 'passed') passed++;
          else if (status === 'failed') failed++;
          else if (status === 'running') running++;
          else if (status === 'pending') pending++;
          else idle++;
        }
        for (const child of dd.describes) collect(child);
      }
      collect(d);
    }
    return { passed, failed, running, pending, idle };
  }, [file, testCaseStatusMap]);
  const nodeStatus = getNodeStatus(statusCount);

  const nodeStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <i className="fas fa-check-circle text-green-500"></i>;
      case 'failed': return <i className="fas fa-times-circle text-red-500"></i>;
      case 'running': return <i className="fas fa-spinner fa-spin text-blue-500"></i>;
      case 'pending': return <i className="fas fa-clock text-amber-500 animate-pulse"></i>;
      default: return null;
    }
  };

  const renderStatusBadge = (count: number, status: string, icon: string, colorClass: string) => {
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

  const toggleExpand = () => {
    const next = new Set(expandedPaths);
    if (isExpanded) next.delete(path);
    else next.add(path);
    onExpandedPathsChange(next);
  };

  const toggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    const allIds = collectAllIdsInFile(file);
    if (allSelected) {
      for (const id of allIds) next.delete(id);
    } else {
      for (const id of allIds) next.add(id);
    }
    onSelectedIdsChange(next);
  };

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-xs group"
        onClick={toggleExpand}
      >
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = !allSelected && selected > 0; }}
          onChange={toggleSelect}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <i className={`fas fa-chevron-right text-gray-400 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
        {nodeStatusIcon(nodeStatus)}
        <i className="fas fa-file-code text-amber-400"></i>
        <span className="font-medium text-gray-700 flex-1 truncate">{file.title}</span>
        <div className="flex items-center gap-1">
          {statusBadges()}
        </div>
        <span className="text-gray-400 text-[10px]">{selected}/{total}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRunFile(file); }}
          className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-600 rounded text-[10px] transition-opacity"
          title="Run this file"
        >
          <i className="fas fa-play mr-0.5"></i>Run
        </button>
      </div>
      {isExpanded && (
        <div className="ml-2">
          {file.describes.map(describe => (
            <DescribeView
              key={`${describe.file}::${describe.title}::${describe.line}`}
              describe={describe}
              depth={0}
              selectedIds={selectedIds}
              expandedPaths={expandedPaths}
              testCaseStatusMap={testCaseStatusMap}
              onSelectedIdsChange={onSelectedIdsChange}
              onExpandedPathsChange={onExpandedPathsChange}
              onRunDescribe={onRunDescribe}
              onRunTest={onRunTest}
            />
          ))}
          {file.tests.map(test => {
            const statusOverride = testCaseStatusMap.get(test.id);
            return (
              <TestItemView
                key={test.id}
                test={test}
                statusOverride={statusOverride?.status}
                selectedIds={selectedIds}
                onSelectedIdsChange={onSelectedIdsChange}
                onRunTest={onRunTest}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

export function ExecutorDialog({
  isOpen, onClose, lang, testFiles, testCases, selectedIds, expandedPaths, isExecuting, isLoadingTests, logs, versionInput, testDir,
  onSelectedIdsChange, onExpandedPathsChange, onRun, onStop, onClearLogs,
  onVersionChange, onTestDirChange, onSelectAll, onClearAll, onExpandAll, onCollapseAll, onModal,
}: ExecutorDialogProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [tempTestDir, setTempTestDir] = useState(testDir);
  const [isValidating, setIsValidating] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectedCount = selectedIds.size;
  
  const testCaseStatusMap = useMemo(() => {
    const map = new Map<string, { status?: string; lastDuration: number | null; lastError: string | null }>();
    for (const tc of testCases) {
      map.set(tc.id, { status: tc.status, lastDuration: tc.lastDuration, lastError: tc.lastError });
    }
    return map;
  }, [testCases]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isMaximized) {
          setIsMaximized(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isMaximized, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    setTempTestDir(testDir);
  }, [testDir]);

  /**
   * 处理单个测试用例的执行
   * 在执行前更新selectedIds为当前测试用例，确保统计和状态显示正确
   */
  const handleRunTest = (test: TestCase) => {
    onSelectedIdsChange(new Set([test.id]));
    onRun('test', `${test.file}:${test.line}`);
  };

  /**
   * 处理describe块的执行
   * 在执行前更新selectedIds为该describe块中的所有测试用例，确保统计和状态显示正确
   */
  const handleRunDescribe = (describe: TestDescribe) => {
    const allIds = collectAllIdsInDescribe(describe);
    onSelectedIdsChange(new Set(allIds));
    const locations: string[] = [];
    function collectLocations(d: TestDescribe) {
      for (const test of d.tests) {
        locations.push(`${test.file}:${test.line}`);
      }
      for (const child of d.describes) {
        collectLocations(child);
      }
    }
    collectLocations(describe);
    onRun('test', locations.join(','));
  };

  /**
   * 处理文件的执行
   * 在执行前更新selectedIds为该文件中的所有测试用例，确保统计和状态显示正确
   */
  const handleRunFile = (file: TestFile) => {
    const allIds = collectAllIdsInFile(file);
    onSelectedIdsChange(new Set(allIds));
    onRun('file', file.file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isMaximized ? undefined : onClose}
      />
      <div 
        ref={dialogRef}
        className={`relative bg-white shadow-2xl transition-all duration-300 flex flex-col ${
          isMaximized 
            ? 'w-full h-full rounded-none' 
            : 'w-[90vw] max-w-[1200px] h-[85vh] rounded-2xl'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2">
              <i className="fas fa-play-circle text-white text-lg"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{t('executor', lang)}</h2>
              <p className="text-xs text-white/70">{t('testCaseTree', lang)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title={isMaximized ? t('restore', lang) : t('maximize', lang)}
            >
              <i className={`fas ${isMaximized ? 'fa-compress' : 'fa-expand'}`}></i>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title={t('close', lang)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-5">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3 flex-shrink-0">
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <i className="fas fa-tag text-indigo-400"></i>
                <input
                  type="text"
                  value={versionInput}
                  onChange={e => onVersionChange(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 outline-none w-32"
                  placeholder={t('versionLabel', lang)}
                />
              </div>
              <button
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  if (ids.length > 0) {
                    const locations: string[] = [];
                    for (const file of testFiles) {
                      for (const test of file.tests) {
                        if (ids.includes(test.id)) {
                          locations.push(`${test.file}:${test.line}`);
                        }
                      }
                      for (const describe of file.describes) {
                        function collectTests(d: typeof describe) {
                          for (const test of d.tests) {
                            if (ids.includes(test.id)) {
                              locations.push(`${test.file}:${test.line}`);
                            }
                          }
                          for (const child of d.describes) collectTests(child);
                        }
                        collectTests(describe);
                      }
                    }
                    if (locations.length > 0) {
                      onRun('test', locations.join(','));
                    }
                  }
                }}
                disabled={isExecuting || selectedCount === 0}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ${
                  isExecuting || selectedCount === 0
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
          </div>

          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              isExecuting 
                ? 'bg-yellow-100 text-yellow-600' 
                : testCases.length > 0 
                  ? 'bg-green-100 text-green-600' 
                  : 'bg-red-100 text-red-600'
            }`}>
              {isExecuting 
                ? t('running', lang) 
                : testCases.length > 0 
                  ? t('executorReady', lang) 
                  : t('noTestCases', lang)
              }
            </span>
            <span>{t('selectedCases', lang)}: <strong className="text-indigo-600">{selectedCount}</strong></span>
            <div className="flex-1"></div>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <i className="fas fa-folder-open text-indigo-400"></i>
              <input
                type="text"
                value={tempTestDir}
                onChange={e => setTempTestDir(e.target.value)}
                className="bg-transparent text-xs text-gray-700 outline-none w-48"
                placeholder={t('testDirPlaceholder', lang)}
                title={
                  tempTestDir !== testDir 
                    ? `${t('inputPath', lang)}: ${tempTestDir}\n${t('currentValidDir', lang)}: ${testDir}`
                    : `${t('currentDir', lang)}: ${testDir}`
                }
              />
              <button
                onClick={async () => {
                  setIsValidating(true);
                  try {
                    await onTestDirChange(tempTestDir);
                  } finally {
                    setIsValidating(false);
                  }
                }}
                disabled={isValidating || isExecuting}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  isValidating || isExecuting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-600'
                }`}
              >
                {isValidating ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i>{t('loading', lang)}</>
                ) : (
                  <><i className="fas fa-sync-alt mr-1"></i>{t('loadTestCases', lang)}</>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 flex gap-4 min-h-0">
            <div className="flex-1 border rounded-xl p-3 overflow-y-auto bg-gray-50 relative">
              {isLoadingTests && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fas fa-vial text-indigo-600 text-sm"></i>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600 font-medium">{t('loadingTests', lang)}</p>
                  <p className="mt-1 text-xs text-gray-400">{t('pleaseWait', lang)}</p>
                </div>
              )}
              {testFiles.length === 0 ? (
                <p className="text-gray-400 text-xs p-4 text-center">{t('noTestCases', lang)}</p>
              ) : testFiles.map(file => (
                <FileView
                  key={file.file}
                  file={file}
                  selectedIds={selectedIds}
                  expandedPaths={expandedPaths}
                  testCaseStatusMap={testCaseStatusMap}
                  onSelectedIdsChange={onSelectedIdsChange}
                  onExpandedPathsChange={onExpandedPathsChange}
                  onRunFile={handleRunFile}
                  onRunDescribe={handleRunDescribe}
                  onRunTest={handleRunTest}
                />
              ))}
            </div>

            <div className="w-[400px] border rounded-xl bg-gray-900 p-3 flex flex-col">
              <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <span className="text-xs text-gray-400 font-medium">
                  <i className="fas fa-terminal mr-1.5"></i>{t('liveLogs', lang)}
                </span>
                <button onClick={onClearLogs} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  <i className="fas fa-eraser mr-1"></i>{t('clearLogs', lang)}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-0.5 font-mono text-[11px]">
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
        </div>
      </div>
    </div>
  );
}
