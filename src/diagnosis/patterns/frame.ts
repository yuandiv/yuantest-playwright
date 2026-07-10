/**
 * IFrame 类错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const FRAME_PATTERNS: ErrorPattern[] = [
  {
    id: 'frame-detached',
    category: 'frame',
    name: 'Iframe 已从页面分离',
    description: '操作的 iframe 已从页面 DOM 中分离',
    regex: [/frame.*detached/i, /iframe.*not found/i, /frame.*not loaded/i],
    rootCauseTemplate: {
      zh: '操作的 iframe 已从页面中移除或从未加载完成，可能因为页面更新、iframe 懒加载或动态插入',
      en: 'The target iframe has been removed from the page or never finished loading, possibly due to page updates, lazy loading, or dynamic insertion',
    },
    suggestionsTemplate: {
      zh: [
        '使用 page.frameLocator() 重新获取 iframe 引用',
        '等待 iframe 加载完成：page.waitForSelector("iframe", { state: "attached" })',
        '检查 iframe 的 src 属性是否正确定向到可访问的 URL',
        '如果 iframe 是动态创建的，需在创建完成的时机后操作',
      ],
      en: [
        'Re-acquire the iframe reference with page.frameLocator()',
        'Wait for the iframe to load: page.waitForSelector("iframe", { state: "attached" })',
        'Verify the iframe src attribute points to an accessible URL',
        'If the iframe is created dynamically, wait for its creation before interacting',
      ],
    },
    docLinks: [
      { title: 'Frames', url: 'https://playwright.dev/docs/frames' },
    ],
  },
  {
    id: 'frame-cross-origin',
    category: 'frame',
    name: '跨域 iframe 访问受限',
    description: '尝试访问跨域 iframe 内容时受限',
    regex: [/cross.*origin.*frame/i, /blocked.*frame/i, /same-origin.*policy/i],
    rootCauseTemplate: {
      zh: '尝试访问跨域 iframe 的内容，受同源策略限制无法操作',
      en: 'Attempting to access content from a cross-origin iframe, blocked by same-origin policy',
    },
    suggestionsTemplate: {
      zh: [
        '确认 iframe 的源是否与主页面相同',
        '对于跨域 iframe，只能操作其导航（goto/reload），无法读取内容',
        '如果必须操作跨域 iframe，考虑通过 postMessage 通信方式',
        '在测试中尽量使用同源 iframe 或绕过 iframe 直接访问目标页面',
      ],
      en: [
        'Verify the iframe origin matches the main page',
        'For cross-origin iframes, only navigation (goto/reload) is allowed, not content access',
        'If cross-origin iframe interaction is required, consider using postMessage communication',
        'In tests, prefer same-origin iframes or bypass the iframe and access the target page directly',
      ],
    },
    docLinks: [
      { title: 'Frames', url: 'https://playwright.dev/docs/frames' },
      { title: 'Same-Origin Policy', url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy' },
    ],
  },
  {
    id: 'frame-nested',
    category: 'frame',
    name: '嵌套 iframe 定位错误',
    description: '在嵌套 iframe 结构中找不到目标元素',
    regex: [/nested.*frame/i, /child.*frame.*not/i, /frame.*hierarchy/i],
    rootCauseTemplate: {
      zh: '在多层嵌套的 iframe 结构中，未正确指定完整的 iframe 层级路径',
      en: 'In a multi-level nested iframe structure, the complete iframe hierarchy path was not correctly specified',
    },
    suggestionsTemplate: {
      zh: [
        '使用 page.frameLocator() 逐层定位：page.frameLocator("#outer").frameLocator("#inner")',
        '确认 iframe 的 ID 或 name 属性值',
        '使用 page.frames() 列出所有可用 frame 然后按条件筛选',
        '考虑使用 page.frame({ url: "..." }) 通过 URL 定位 iframe',
      ],
      en: [
        'Use page.frameLocator() to navigate the hierarchy: page.frameLocator("#outer").frameLocator("#inner")',
        'Verify the iframe ID or name attribute values',
        'List all available frames using page.frames() and filter',
        'Use page.frame({ url: "..." }) to locate an iframe by its URL',
      ],
    },
    docLinks: [
      { title: 'Frames', url: 'https://playwright.dev/docs/frames' },
    ],
  },
];
