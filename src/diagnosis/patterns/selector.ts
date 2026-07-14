/**
 * 选择器类错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const SELECTOR_PATTERNS: ErrorPattern[] = [
  {
    id: 'selector-element-not-found',
    category: 'selector',
    name: '元素未找到',
    description: '在 DOM 中未找到匹配选择器的元素',
    regex: [/selector.*not found/, /element.*not found/i, /Cannot find element.*using.*selector/i],
    rootCauseTemplate: {
      zh: '页面 DOM 中不存在匹配指定选择器的元素，可能由于页面结构变化、动态渲染未完成或选择器拼写错误',
      en: 'No element matching the specified selector was found in the DOM, possibly due to page structure changes, incomplete dynamic rendering, or incorrect selector spelling',
    },
    suggestionsTemplate: {
      zh: [
        '检查选择器是否与当前页面结构匹配（使用浏览器开发者工具验证）',
        '考虑使用 page.waitForSelector 确保元素已渲染',
        '改用更稳定的定位方式：page.getByRole(), page.getByText(), page.getByTestId()',
        '如果元素是动态加载的，需在操作前等待：await page.waitForSelector(selector)',
      ],
      en: [
        'Verify the selector matches the current page structure (use browser DevTools)',
        'Use page.waitForSelector to ensure the element is rendered before interacting',
        'Try more stable locators: page.getByRole(), page.getByText(), page.getByTestId()',
        'Wait for dynamic elements: await page.waitForSelector(selector)',
      ],
    },
    docLinks: [
      { title: 'Locators', url: 'https://playwright.dev/docs/locators' },
      { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
    ],
  },
  {
    id: 'selector-multiple-elements',
    category: 'selector',
    name: '匹配到多个元素',
    description: '选择器匹配到多个元素导致操作歧义',
    regex: [
      /strict mode violation/i,
      /resolved to multiple elements/i,
      /multiple.*elements.*found/i,
    ],
    rootCauseTemplate: {
      zh: '选择器匹配到多个元素，Playwright 在严格模式下无法确定目标元素',
      en: 'The selector matched multiple elements, and Playwright cannot determine the intended target in strict mode',
    },
    suggestionsTemplate: {
      zh: [
        '使用更精确的选择器：结合文本、属性或位置缩小范围',
        '使用 page.locator().first() 或 page.locator().nth(N) 选择特定元素',
        '考虑使用 page.getByRole() 配合 name 选项精确定位',
        '使用 filter() 方法添加额外过滤条件：locator.filter({ hasText: "..." })',
      ],
      en: [
        'Use a more specific selector: combine text, attributes, or position',
        'Use page.locator().first() or page.locator().nth(N) to target a specific element',
        'Use page.getByRole() with the name option for precise targeting',
        'Add filter conditions: locator.filter({ hasText: "..." })',
      ],
    },
    docLinks: [
      { title: 'Locators', url: 'https://playwright.dev/docs/locators' },
      { title: 'Strict Mode', url: 'https://playwright.dev/docs/locators#strictness' },
    ],
  },
  {
    id: 'selector-detached',
    category: 'selector',
    name: '元素已从 DOM 中分离',
    description: '元素在操作前已从 DOM 中分离（stale element）',
    regex: [/element.*detached/i, /stale element/i, /element.*no longer attached/i],
    rootCauseTemplate: {
      zh: '元素在捕获引用后从 DOM 中被移除或重新渲染，导致对旧引用的操作失败',
      en: 'The element was removed or re-rendered in the DOM after capturing its reference, causing the operation on the stale reference to fail',
    },
    suggestionsTemplate: {
      zh: [
        '在每次操作前重新查询元素，而不是缓存 locator 结果',
        '检查是否有页面更新或 AJAX 刷新导致元素重新渲染',
        '使用 page.waitForSelector 重新等待元素重新出现',
        '考虑使用 locator.waitFor() 等待元素稳定后再操作',
      ],
      en: [
        'Re-query the element before each action instead of caching locator results',
        'Check for page updates or AJAX refreshes that may have re-rendered the element',
        'Use page.waitForSelector to re-wait for the element to appear',
        'Use locator.waitFor() to ensure the element is stable before interacting',
      ],
    },
    docLinks: [{ title: 'Locators', url: 'https://playwright.dev/docs/locators' }],
  },
];
