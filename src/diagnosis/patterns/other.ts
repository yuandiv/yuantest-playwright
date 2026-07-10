/**
 * 其他独立错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const DATA_VALIDATION_PATTERN: ErrorPattern = {
  id: 'data-validation-mismatch',
  category: 'assertion',
  name: '数据校验不匹配',
  description: '验证数据格式或内容时发现不匹配',
  regex: [
    /validation.*failed/i,
    /expected.*pattern/i,
    /invalid.*format/i,
    /数据.*不匹配/i,
    /valid.*format.*expected/i,
  ],
  rootCauseTemplate: {
    zh: '数据格式或内容校验失败，可能因为数据源变更、格式标准化规则调整或测试数据过期',
    en: 'Data format or content validation failed, possibly due to data source changes, format standardization rule adjustments, or expired test data',
  },
  suggestionsTemplate: {
    zh: [
      '检查数据源是否已更新或重构',
      '确认日期、货币、数字等格式是否符合当前区域设置',
      '验证测试数据是否仍有效',
      '考虑使用更灵活的数据匹配策略（如正则表达式或模糊匹配）',
    ],
    en: [
      'Check if the data source has been updated or restructured',
      'Verify date, currency, number formats match the current locale settings',
      'Validate that the test data is still valid',
      'Consider using more flexible matching strategies (regex or fuzzy matching)',
    ],
  },
  docLinks: [],
};

export const STATE_INCONSISTENCY_PATTERN: ErrorPattern = {
  id: 'state-inconsistency',
  category: 'unknown',
  name: '状态不一致',
  description: '应用状态与预期状态不一致',
  regex: [
    /state.*inconsistent/i,
    /expected.*state.*but.*found/i,
    /状态.*不一致/i,
    /expected.*to.*be.*but.*was/i,
  ],
  rootCauseTemplate: {
    zh: '应用的当前状态与测试预期状态不一致，可能因为前一步操作未正确执行、状态未正常流转或异步操作延迟',
    en: 'The current application state does not match the expected test state, possibly due to an unexecuted previous step, abnormal state transition, or async operation delay',
  },
  suggestionsTemplate: {
    zh: [
      '检查前置操作是否已成功执行并通过断言验证',
      '增加适当等待，确保状态变更完成后再进行验证',
      '检查是否有竞态条件导致状态错误',
      '分步调试：打印关键步骤后的页面状态信息',
    ],
    en: [
      'Verify that previous steps executed successfully and passed assertions',
      'Add appropriate waits to ensure state transitions complete before verification',
      'Check for race conditions causing state errors',
      'Step-by-step debugging: print page state information after key steps',
    ],
  },
  docLinks: [],
};

export const RACE_CONDITION_PATTERN: ErrorPattern = {
  id: 'race-condition',
  category: 'unknown',
  name: '竞态条件',
  description: '测试因竞态条件而出现不可预期的行为',
  regex: [
    /race condition/i,
    /flaky/i,
    /intermittent/i,
    /sometimes.*passes/i,
    /occasionally.*fail/i,
  ],
  rootCauseTemplate: {
    zh: '竞态条件：测试结果不稳定，可能因为异步操作完成时机不确定、事件监听时机不准确或数据加载顺序不可控',
    en: 'Race condition: test results are unstable, possibly due to uncertain async operation timing, inaccurate event listener timing, or uncontrolled data loading order',
  },
  suggestionsTemplate: {
    zh: [
      '使用 auto-waiting API（如 locator.click、locator.fill）替代手动等待',
      '使用 page.waitForResponse / page.waitForSelector 确保异步操作完成',
      '添加显式等待代替固定时间 sleep',
      '检查是否有全局状态（localStorage、sessionStorage、IndexedDB）在测试间残留',
    ],
    en: [
      'Use auto-waiting APIs (locator.click, locator.fill) instead of manual waits',
      'Use page.waitForResponse / page.waitForSelector to ensure async operations complete',
      'Add explicit waits instead of fixed-time sleep',
      'Check for global state (localStorage, sessionStorage, IndexedDB) leaking between tests',
    ],
  },
  docLinks: [
    { title: 'Actionability', url: 'https://playwright.dev/docs/actionability' },
    { title: 'Best Practices', url: 'https://playwright.dev/docs/best-practices' },
  ],
};

export const ENV_CONFIG_PATTERN: ErrorPattern = {
  id: 'env-config-mismatch',
  category: 'unknown',
  name: '环境配置差异',
  description: '不同环境之间的配置差异导致测试失败',
  regex: [
    /environment.*mismatch/i,
    /config.*error/i,
    /环境.*配置/i,
    /CI.*differs.*local/i,
    /This request is not supported/i,
  ],
  rootCauseTemplate: {
    zh: '不同测试环境之间的配置差异导致测试行为不一致，可能因为环境变量不同、API Base URL 不同或功能开关配置差异',
    en: 'Configuration differences between test environments cause inconsistent test behavior, possibly due to different environment variables, API base URLs, or feature flag configurations',
  },
  suggestionsTemplate: {
    zh: [
      '检查 .env 文件和环境变量是否正确配置',
      '确保 CI/CD 环境配置与本地开发环境一致',
      '在 playwright.config.ts 中显式配置所有环境特定参数',
      '使用 test.use() 或 project.use() 为不同项目指定不同的配置',
    ],
    en: [
      'Check .env files and environment variables are correctly configured',
      'Ensure CI/CD environment configuration matches local development',
      'Explicitly configure all environment-specific parameters in playwright.config.ts',
      'Use test.use() or project.use() to specify different configurations for different projects',
    ],
  },
  docLinks: [
    { title: 'Test Configuration', url: 'https://playwright.dev/docs/test-configuration' },
  ],
};

export const HEADLESS_PATTERN: ErrorPattern = {
  id: 'headless-difference',
  category: 'unknown',
  name: 'Headless 模式差异',
  description: 'Headed 与 headless 模式下的行为差异',
  regex: [
    /headless.*difference/i,
    /render.*differ.*headless/i,
  ],
  rootCauseTemplate: {
    zh: 'Headless 环境差异：测试在 headed 模式下通过但在 headless 模式下失败，可能因为字体渲染、动画速度或视口大小不同',
    en: 'Headless environment difference: test passes in headed mode but fails in headless, possibly due to different font rendering, animation speed, or viewport size',
  },
  suggestionsTemplate: {
    zh: [
      '确保 headless 和 headed 模式使用相同的视口大小',
      '在 playwright.config.ts 中设置稳定的视口：viewport: { width: 1280, height: 720 }',
      '禁用动画：在 context 选项中设置 reducedMotion: "reduce"',
      '使用截图对比排查 headless 模式下的渲染差异',
      '尝试在 CI 中使用 xvfb-run 模拟显示环境',
    ],
    en: [
      'Ensure headless and headed modes use the same viewport size',
      'Set a stable viewport in playwright.config.ts: viewport: { width: 1280, height: 720 }',
      'Disable animations: set reducedMotion: "reduce" in context options',
      'Use screenshot comparison to debug rendering differences in headless mode',
      'Try using xvfb-run in CI to simulate a display environment',
    ],
  },
  docLinks: [{ title: 'Playwright Browsers', url: 'https://playwright.dev/docs/browsers' }],
};

export const CONCURRENT_PATTERN: ErrorPattern = {
  id: 'concurrent-execution',
  category: 'unknown',
  name: '并发执行冲突',
  description: '并行运行测试时产生的冲突',
  regex: [
    /concurrent.*conflict/i,
    /parallel.*conflict/i,
    /worker.*conflict/i,
    /test.*isolation.*fail/i,
    /shared.*state.*conflict/i,
  ],
  rootCauseTemplate: {
    zh: '多 worker 并行执行测试时产生冲突，可能因为修改了共享状态（数据库记录、文件、全局变量）或使用了不唯一的测试数据',
    en: 'Conflicts arise when multiple workers execute tests in parallel, possibly due to shared state modification (DB records, files, global variables) or non-unique test data',
  },
  suggestionsTemplate: {
    zh: [
      '确保测试数据在每次运行时具有唯一性（如使用随机数或 UUID 作为标识符）',
      '使用 test.describe.configure({ mode: "serial" }) 将相关测试标记为串行',
      '在 playwright.config.ts 中限制 workers 数量',
      '检查是否依赖了全局状态或外部共享资源',
    ],
    en: [
      'Ensure test data is unique per run (use random numbers or UUIDs as identifiers)',
      'Use test.describe.configure({ mode: "serial" }) to mark related tests as serial',
      'Limit the number of workers in playwright.config.ts',
      'Check for dependencies on global state or external shared resources',
    ],
  },
  docLinks: [
    { title: 'Parallelism', url: 'https://playwright.dev/docs/test-parallel' },
    { title: 'Test Isolation', url: 'https://playwright.dev/docs/browser-contexts' },
  ],
};
