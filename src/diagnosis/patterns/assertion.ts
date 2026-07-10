/**
 * 断言类错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const ASSERTION_PATTERNS: ErrorPattern[] = [
  {
    id: 'assertion-text-mismatch',
    category: 'assertion',
    name: '文本断言不匹配',
    description: '期望的文本与实际页面文本不一致',
    regex: [/expected.*text.*to.*be/i, /text.*mismatch/i, /expect.*toHaveText/i, /toContainText.*failed/i],
    rootCauseTemplate: {
      zh: '页面实际文本与断言期望值不匹配，可能是因为页面内容变更、国际化切换或元素状态变化',
      en: 'The actual text on the page does not match the expected assertion value, possibly due to content changes, i18n switching, or element state changes',
    },
    suggestionsTemplate: {
      zh: [
        '检查页面当前显示的实际文本与断言值是否一致',
        '确认页面是否使用了正确的语言/区域设置',
        '使用部分匹配（toContainText）替代完全匹配（toHaveText）',
        '检查是否有前后空格或不可见字符差异',
      ],
      en: [
        'Verify the actual text on the page matches the assertion value',
        'Confirm the correct language/region settings are applied',
        'Use partial match (toContainText) instead of exact match (toHaveText)',
        'Check for leading/trailing spaces or invisible character differences',
      ],
    },
    docLinks: [
      { title: 'Assertions', url: 'https://playwright.dev/docs/test-assertions' },
      { title: 'Best Practices', url: 'https://playwright.dev/docs/best-practices' },
    ],
  },
  {
    id: 'assertion-visible',
    category: 'assertion',
    name: '元素可见性断言失败',
    description: '期望可见的元素实际不可见',
    regex: [/expected.*visible/i, /element.*not visible/i, /toBeVisible.*failed/i],
    rootCauseTemplate: {
      zh: '页面元素存在但不可见，可能被 CSS 隐藏、被其他元素遮挡、或处于折叠/收起状态',
      en: 'The element exists on the page but is not visible. It may be hidden by CSS, obscured by other elements, or in a collapsed/closed state',
    },
    suggestionsTemplate: {
      zh: [
        '检查元素 CSS 是否设置了 display:none、visibility:hidden 或 opacity:0',
        '确认元素是否在视口之外（需滚动）',
        '检查是否有条件渲染（v-if / ngIf）导致元素未渲染',
        '使用 page.locator().waitFor({ state: "visible" }) 等待元素可见',
      ],
      en: [
        'Check if the element has CSS properties: display:none, visibility:hidden, or opacity:0',
        'Verify the element is within the viewport (may need scrolling)',
        'Check for conditional rendering (v-if / ngIf)',
        'Use page.locator().waitFor({ state: "visible" }) to wait for visibility',
      ],
    },
    docLinks: [
      { title: 'Assertions', url: 'https://playwright.dev/docs/test-assertions' },
      { title: 'Actionability', url: 'https://playwright.dev/docs/actionability' },
    ],
  },
  {
    id: 'assertion-enabled',
    category: 'assertion',
    name: '元素可操作性断言失败',
    description: '期望可操作的元素实际不可用',
    regex: [/expected.*enabled/i, /element.*not enabled/i, /toBeEnabled.*failed/i, /not actionable/i],
    rootCauseTemplate: {
      zh: '元素存在于页面上但不可操作，可能是因为元素处于禁用状态、被遮挡或正在加载中',
      en: 'The element exists on the page but is not actionable, possibly because it is disabled, obscured, or still loading',
    },
    suggestionsTemplate: {
      zh: [
        '检查元素是否有 disabled 属性或 disabled CSS class',
        '确认元素没有被 loading spinner 或 overlay 遮挡',
        '等待元素可操作：page.locator().waitFor({ state: "attached" })',
        '检查是否有前置条件未满足（如表单验证）',
      ],
      en: [
        'Check if the element has a disabled attribute or CSS class',
        'Ensure the element is not covered by a loading spinner or overlay',
        'Wait for the element to be actionable: page.locator().waitFor({ state: "attached" })',
        'Check for unmet prerequisites (e.g. form validation)',
      ],
    },
    docLinks: [
      { title: 'Assertions', url: 'https://playwright.dev/docs/test-assertions' },
      { title: 'Actionability', url: 'https://playwright.dev/docs/actionability' },
    ],
  },
  {
    id: 'assertion-count',
    category: 'assertion',
    name: '元素数量断言失败',
    description: '页面中元素的数量与预期不符',
    regex: [/expected.*count/i, /toHaveCount.*failed/i, /expected.*length/i],
    rootCauseTemplate: {
      zh: 'DOM 中匹配的元素数量与预期不符，可能因为列表数据变化、筛选条件不同或动态加载不完全',
      en: 'The number of matching elements in the DOM does not match expectations, possibly due to list data changes, different filter conditions, or incomplete dynamic loading',
    },
    suggestionsTemplate: {
      zh: [
        '确认数据源是否正确返回了预期数量的数据',
        '检查是否有分页加载或无限滚动机制未触达',
        '使用 locator.all() 获取所有元素并检查实际结构',
        '考虑使用 toHaveCount 配合轮询等待动态数据加载完成',
      ],
      en: [
        'Verify the data source returns the expected number of records',
        'Check for pagination or infinite scroll that has not been triggered',
        'Use locator.all() to get all elements and inspect the actual structure',
        'Use toHaveCount with polling to wait for dynamic data to load',
      ],
    },
    docLinks: [{ title: 'Assertions', url: 'https://playwright.dev/docs/test-assertions' }],
  },
  {
    id: 'assertion-value',
    category: 'assertion',
    name: '输入值断言失败',
    description: '输入框的当前值与预期不符',
    regex: [/toHaveValue.*failed/i, /expected.*value/i],
    rootCauseTemplate: {
      zh: '输入框的当前值与断言期望值不匹配，可能因为输入未成功、清空操作无效或异步数据绑定',
      en: 'The current value of the input field does not match the expected assertion, possibly due to failed input, ineffective clear operation, or async data binding',
    },
    suggestionsTemplate: {
      zh: [
        '确认输入操作已成功（检查 fill 或 type 是否执行）',
        '使用 triple-click 或 clear() + fill() 确保输入框被清空',
        '检查是否有异步数据绑定（如 Vue v-model, React onChange）延迟',
        '使用 pressSequentially 模拟真实键盘输入',
      ],
      en: [
        'Verify the input action completed successfully (check fill or type)',
        'Use triple-click or clear() + fill() to ensure the input is cleared',
        'Check for async data binding delays (e.g. Vue v-model, React onChange)',
        'Use pressSequentially to simulate real keyboard input',
      ],
    },
    docLinks: [{ title: 'Assertions', url: 'https://playwright.dev/docs/test-assertions' }],
  },
];
