/**
 * 超时类错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const TIMEOUT_PATTERNS: ErrorPattern[] = [
  {
    id: 'timeout-element-wait',
    category: 'timeout',
    name: '元素等待超时',
    description: '等待选择器匹配的元素出现在 DOM 中时超时',
    regex: [/Timeout.*waiting for.*selector/, /Waiting for selector.*timed out/],
    rootCauseTemplate: {
      zh: '页面中目标元素未在超时时间内出现，可能因为页面加载慢、元素渲染延迟或选择器错误',
      en: 'The target element did not appear within the timeout, possibly due to slow page load, delayed rendering, or incorrect selector',
    },
    suggestionsTemplate: {
      zh: [
        '增加超时时间：page.waitForSelector(selector, { timeout: 30000 })',
        '检查选择器是否正确，确认元素确实存在于页面中',
        '使用 page.waitForLoadState("networkidle") 等待页面完全加载后再操作',
        '确认元素是否在 iframe 或 shadow DOM 中',
      ],
      en: [
        'Increase timeout: page.waitForSelector(selector, { timeout: 30000 })',
        'Verify the selector is correct and the element exists on the page',
        'Use page.waitForLoadState("networkidle") to wait for full page load before interacting',
        'Check if the element is inside an iframe or shadow DOM',
      ],
    },
    docLinks: [
      { title: 'Test Timeouts', url: 'https://playwright.dev/docs/test-timeouts' },
      { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
    ],
  },
  {
    id: 'timeout-navigation',
    category: 'timeout',
    name: '导航超时',
    description: '页面导航操作未在超时时间内完成',
    regex: [/Timeout.*navigating/, /Navigation timeout/],
    rootCauseTemplate: {
      zh: '页面导航未在超时时间内完成，可能因为网络慢、服务端响应延迟或重定向循环',
      en: 'Page navigation did not complete within the timeout, possibly due to slow network, delayed server response, or redirect loops',
    },
    suggestionsTemplate: {
      zh: [
        '增加导航超时：page.goto(url, { timeout: 60000 })',
        '使用 page.waitForLoadState("domcontentloaded") 替代默认的 load 事件',
        '检查是否存在重定向循环或服务端挂起',
        '确认目标 URL 是否可访问',
      ],
      en: [
        'Increase navigation timeout: page.goto(url, { timeout: 60000 })',
        'Use page.waitForLoadState("domcontentloaded") instead of the default load event',
        'Check for redirect loops or server hanging',
        'Verify the target URL is accessible',
      ],
    },
    docLinks: [
      { title: 'Test Timeouts', url: 'https://playwright.dev/docs/test-timeouts' },
      { title: 'Navigation', url: 'https://playwright.dev/docs/navigations' },
    ],
  },
  {
    id: 'timeout-api-response',
    category: 'timeout',
    name: 'API 响应超时',
    description: '等待 API 请求响应时超时',
    regex: [/Timeout.*waiting for.*response/, /Request timeout/],
    rootCauseTemplate: {
      zh: 'API 请求未在超时时间内返回响应，可能因为后端处理慢、网络问题或请求未发出',
      en: 'API request did not return a response within the timeout, possibly due to slow backend processing, network issues, or request not being sent',
    },
    suggestionsTemplate: {
      zh: [
        '增加等待超时：page.waitForResponse(url, { timeout: 30000 })',
        '确认 API 请求是否实际发出（检查网络面板）',
        '检查后端服务是否正常运行',
        '使用 route 拦截并模拟 API 响应以隔离测试',
      ],
      en: [
        'Increase wait timeout: page.waitForResponse(url, { timeout: 30000 })',
        'Verify the API request is actually being sent (check network panel)',
        'Check if the backend service is running normally',
        'Use route interception to mock API responses for test isolation',
      ],
    },
    docLinks: [
      { title: 'Test Timeouts', url: 'https://playwright.dev/docs/test-timeouts' },
      { title: 'Network', url: 'https://playwright.dev/docs/network' },
    ],
  },
  {
    id: 'timeout-misc',
    category: 'timeout',
    name: '其他超时',
    description: '通用超时错误，未匹配到特定超时类型',
    regex: [/timeout/i, /timed out/i, /time out/i],
    rootCauseTemplate: {
      zh: '操作未在超时时间内完成，可能因为页面交互耗时过长或条件未满足',
      en: 'An operation did not complete within the timeout, possibly due to long interaction time or unmet conditions',
    },
    suggestionsTemplate: {
      zh: [
        '检查超时设置是否合理',
        '确认页面元素和网络请求是否正常',
        '使用 waitForLoadState 或 waitForSelector 的 specific options 替代全局超时',
      ],
      en: [
        'Review timeout settings',
        'Verify page elements and network requests are normal',
        'Use waitForLoadState or waitForSelector with specific options instead of global timeout',
      ],
    },
    docLinks: [{ title: 'Playwright Test Timeouts', url: 'https://playwright.dev/docs/test-timeouts' }],
  },
];
