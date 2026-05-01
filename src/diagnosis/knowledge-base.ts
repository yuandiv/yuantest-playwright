export interface ErrorPattern {
  id: string;
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  name: string;
  description: string;
  regex: RegExp[];
  rootCauseTemplate: { zh: string; en: string };
  suggestionsTemplate: { zh: string[]; en: string[] };
  docLinks: { title: string; url: string }[];
}

const TIMEOUT_PATTERNS: ErrorPattern[] = [
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
];

const SELECTOR_PATTERNS: ErrorPattern[] = [
  {
    id: 'selector-element-not-found',
    category: 'selector',
    name: '元素不存在',
    description: '选择器未匹配到任何 DOM 元素',
    regex: [/No element found.*selector/, /Element is not attached/],
    rootCauseTemplate: {
      zh: '选择器未匹配到页面中的任何元素，可能因为元素尚未渲染、已被移除或选择器拼写错误',
      en: 'The selector did not match any element on the page, possibly because the element has not rendered yet, has been removed, or the selector is misspelled',
    },
    suggestionsTemplate: {
      zh: [
        '使用 waitForSelector 确保元素存在后再操作',
        '检查选择器是否正确，尝试在浏览器开发者工具中验证',
        '确认页面是否完全加载，元素是否在动态内容中',
        '考虑使用更稳定的数据属性选择器如 [data-testid]',
      ],
      en: [
        'Use waitForSelector to ensure the element exists before interacting',
        'Verify the selector is correct by testing in browser DevTools',
        'Confirm the page is fully loaded and the element is in dynamic content',
        'Consider using more stable data attribute selectors like [data-testid]',
      ],
    },
    docLinks: [
      { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
      { title: 'Locators', url: 'https://playwright.dev/docs/locators' },
    ],
  },
  {
    id: 'selector-strict-mode',
    category: 'selector',
    name: '选择器歧义',
    description: '严格模式下选择器匹配到多个元素',
    regex: [/strict mode violation/, /multiple elements matched/],
    rootCauseTemplate: {
      zh: '选择器匹配到了多个元素，但 Playwright 严格模式要求唯一匹配，需要更精确的选择器',
      en: 'The selector matched multiple elements, but Playwright strict mode requires a unique match; a more specific selector is needed',
    },
    suggestionsTemplate: {
      zh: [
        '使用 .first()、.nth() 或 .last() 明确指定目标元素',
        '缩小选择器范围，添加更多上下文如 .parent .child',
        '使用具有唯一性的属性如 data-testid 或 aria-label',
        '使用 locator.filter() 进一步筛选匹配结果',
      ],
      en: [
        'Use .first(), .nth(), or .last() to explicitly target the desired element',
        'Narrow the selector scope by adding more context like .parent .child',
        'Use unique attributes like data-testid or aria-label',
        'Use locator.filter() to further refine matches',
      ],
    },
    docLinks: [
      { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
      { title: 'Locators', url: 'https://playwright.dev/docs/locators' },
    ],
  },
  {
    id: 'selector-iframe',
    category: 'selector',
    name: 'iframe 内选择器',
    description: '在 iframe 内部查找元素失败',
    regex: [/frame.*selector/, /iframe.*element/],
    rootCauseTemplate: {
      zh: '尝试在主文档上下文中查找 iframe 内的元素，需要先获取 frame 对象再操作',
      en: 'Attempted to find an element inside an iframe from the main document context; need to get the frame object first before operating',
    },
    suggestionsTemplate: {
      zh: [
        '使用 page.frameLocator() 或 frame.locator() 在 iframe 内定位元素',
        '确认 iframe 已加载完成后再操作内部元素',
        '检查 iframe 是否为跨域，跨域 iframe 有安全限制',
        '使用 frame.waitForSelector() 等待 iframe 内元素出现',
      ],
      en: [
        'Use page.frameLocator() or frame.locator() to locate elements inside an iframe',
        'Ensure the iframe is fully loaded before interacting with its elements',
        'Check if the iframe is cross-origin; cross-origin iframes have security restrictions',
        'Use frame.waitForSelector() to wait for elements inside the iframe',
      ],
    },
    docLinks: [
      { title: 'Frames', url: 'https://playwright.dev/docs/frames' },
      { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
    ],
  },
];

const ASSERTION_PATTERNS: ErrorPattern[] = [
  {
    id: 'assertion-text-mismatch',
    category: 'assertion',
    name: '文本不匹配',
    description: '元素文本内容与预期值不匹配',
    regex: [/Expected.*text.*received/, /Text content mismatch/],
    rootCauseTemplate: {
      zh: '元素的实际文本内容与断言期望值不一致，可能因为动态内容变化、国际化差异或元素文本包含空白字符',
      en: 'The actual text content of the element does not match the expected assertion value, possibly due to dynamic content changes, i18n differences, or whitespace in element text',
    },
    suggestionsTemplate: {
      zh: [
        '使用 toContainText() 替代 toHaveText() 进行部分匹配',
        '检查文本中是否包含前后空白字符，使用 trim() 处理',
        '确认动态内容是否已加载完成再做断言',
        '使用正则表达式匹配：toHaveText(/pattern/)',
      ],
      en: [
        'Use toContainText() instead of toHaveText() for partial matching',
        'Check if the text contains leading/trailing whitespace, use trim() to handle it',
        'Ensure dynamic content has fully loaded before asserting',
        'Use regex matching: toHaveText(/pattern/)',
      ],
    },
    docLinks: [
      { title: 'Test Assertions', url: 'https://playwright.dev/docs/test-assertions' },
    ],
  },
  {
    id: 'assertion-visibility',
    category: 'assertion',
    name: '可见性断言失败',
    description: '元素的可见性状态与预期不符',
    regex: [/Expected.*visible.*hidden/, /Element is not visible/],
    rootCauseTemplate: {
      zh: '元素的可见性状态与断言不符，可能因为元素被 CSS 隐藏、被其他元素遮挡或尚未渲染完成',
      en: 'The element visibility state does not match the assertion, possibly because the element is hidden by CSS, obscured by another element, or not yet fully rendered',
    },
    suggestionsTemplate: {
      zh: [
        '使用 toBeVisible() 断言前先等待元素出现',
        '检查元素的 CSS 样式：display、visibility、opacity',
        '确认元素是否被父容器的 overflow:hidden 裁剪',
        '使用 toBeAttached() 判断元素是否在 DOM 中而不要求可见',
      ],
      en: [
        'Wait for the element to appear before using toBeVisible() assertion',
        'Check element CSS styles: display, visibility, opacity',
        'Verify if the element is clipped by a parent container with overflow:hidden',
        'Use toBeAttached() to check if the element is in the DOM without requiring visibility',
      ],
    },
    docLinks: [
      { title: 'Test Assertions', url: 'https://playwright.dev/docs/test-assertions' },
    ],
  },
  {
    id: 'assertion-attribute',
    category: 'assertion',
    name: '属性断言失败',
    description: '元素的属性值与预期不符',
    regex: [/Expected.*attribute.*value/, /Attribute mismatch/],
    rootCauseTemplate: {
      zh: '元素属性值与断言期望不一致，可能因为属性名拼写错误、属性值动态生成或属性尚未更新',
      en: 'The element attribute value does not match the expected assertion, possibly due to misspelled attribute name, dynamically generated value, or attribute not yet updated',
    },
    suggestionsTemplate: {
      zh: [
        '确认属性名拼写正确，注意大小写敏感',
        '使用 toHaveAttribute() 前等待属性值更新',
        '对动态属性值使用正则或部分匹配',
        '检查元素是否正确，属性可能属于不同元素',
      ],
      en: [
        'Confirm the attribute name is spelled correctly, note case sensitivity',
        'Wait for the attribute value to update before using toHaveAttribute()',
        'Use regex or partial matching for dynamic attribute values',
        'Verify the correct element is targeted; the attribute may belong to a different element',
      ],
    },
    docLinks: [
      { title: 'Test Assertions', url: 'https://playwright.dev/docs/test-assertions' },
    ],
  },
];

const NETWORK_PATTERNS: ErrorPattern[] = [
  {
    id: 'network-request-failed',
    category: 'network',
    name: '请求失败',
    description: '网络请求未能成功完成',
    regex: [/Request failed/, /net::ERR_/],
    rootCauseTemplate: {
      zh: '网络请求失败，可能因为服务不可用、网络连接中断或 SSL 证书问题',
      en: 'Network request failed, possibly due to unavailable service, network connection interruption, or SSL certificate issues',
    },
    suggestionsTemplate: {
      zh: [
        '检查目标服务是否正常运行和可访问',
        '确认网络连接和代理设置是否正确',
        '使用 page.route() 模拟网络请求以隔离测试',
        '检查 SSL 证书配置，必要时设置 ignoreHTTPSErrors: true',
      ],
      en: [
        'Check if the target service is running and accessible',
        'Verify network connection and proxy settings are correct',
        'Use page.route() to mock network requests for test isolation',
        'Check SSL certificate configuration; set ignoreHTTPSErrors: true if necessary',
      ],
    },
    docLinks: [
      { title: 'Network', url: 'https://playwright.dev/docs/network' },
    ],
  },
  {
    id: 'network-cors',
    category: 'network',
    name: 'CORS 跨域错误',
    description: '跨域资源共享策略阻止了请求',
    regex: [/CORS/, /Cross-Origin/],
    rootCauseTemplate: {
      zh: 'CORS 策略阻止了跨域请求，服务端未正确配置 Access-Control-Allow-Origin 等响应头',
      en: 'CORS policy blocked the cross-origin request; the server did not correctly configure Access-Control-Allow-Origin and other response headers',
    },
    suggestionsTemplate: {
      zh: [
        '确认服务端是否正确配置了 CORS 响应头',
        '使用 page.route() 拦截并修改响应头以绕过 CORS',
        '在测试环境中配置同源访问或使用代理',
        '检查请求方法和自定义头是否在服务端允许列表中',
      ],
      en: [
        'Verify the server has correctly configured CORS response headers',
        'Use page.route() to intercept and modify response headers to bypass CORS',
        'Configure same-origin access or use a proxy in the test environment',
        'Check if the request method and custom headers are in the server allowlist',
      ],
    },
    docLinks: [
      { title: 'Network', url: 'https://playwright.dev/docs/network' },
    ],
  },
  {
    id: 'network-dns',
    category: 'network',
    name: 'DNS 解析失败',
    description: '域名无法解析为 IP 地址',
    regex: [/ERR_NAME_NOT_RESOLVED/, /DNS/],
    rootCauseTemplate: {
      zh: 'DNS 解析失败，域名无法解析为 IP 地址，可能因为域名拼写错误、DNS 服务不可用或本地 hosts 配置问题',
      en: 'DNS resolution failed; the domain name cannot be resolved to an IP address, possibly due to misspelled domain, unavailable DNS service, or local hosts configuration issues',
    },
    suggestionsTemplate: {
      zh: [
        '确认 URL 中的域名拼写正确',
        '检查 DNS 服务是否正常，尝试在终端中 ping 域名',
        '检查本地 hosts 文件是否有错误的域名映射',
        '在 CI 环境中确认 DNS 配置和网络策略',
      ],
      en: [
        'Confirm the domain name in the URL is spelled correctly',
        'Check if DNS service is working; try pinging the domain in terminal',
        'Check the local hosts file for incorrect domain mappings',
        'Verify DNS configuration and network policies in CI environment',
      ],
    },
    docLinks: [
      { title: 'Network', url: 'https://playwright.dev/docs/network' },
    ],
  },
];

const FRAME_PATTERNS: ErrorPattern[] = [
  {
    id: 'frame-detached',
    category: 'frame',
    name: 'Frame 已分离',
    description: '操作的 frame 已从页面中分离',
    regex: [/frame.*detached/, /Frame was detached/],
    rootCauseTemplate: {
      zh: '目标 iframe 已从 DOM 中移除或分离，可能因为页面导航、动态内容更新或 JavaScript 移除了 iframe',
      en: 'The target iframe has been removed or detached from the DOM, possibly due to page navigation, dynamic content update, or JavaScript removing the iframe',
    },
    suggestionsTemplate: {
      zh: [
        '在操作前重新获取 frame 引用',
        '使用 try-catch 处理 frame 分离的情况',
        '等待页面稳定后再操作 iframe',
        '检查是否有 JavaScript 代码动态移除了 iframe',
      ],
      en: [
        'Re-acquire the frame reference before operating',
        'Use try-catch to handle frame detachment scenarios',
        'Wait for the page to stabilize before operating on the iframe',
        'Check if JavaScript code is dynamically removing the iframe',
      ],
    },
    docLinks: [
      { title: 'Frames', url: 'https://playwright.dev/docs/frames' },
    ],
  },
  {
    id: 'frame-cross-origin',
    category: 'frame',
    name: '跨 Frame 安全限制',
    description: '跨域 iframe 的安全策略阻止了操作',
    regex: [/cross-origin frame/, /frame.*security/],
    rootCauseTemplate: {
      zh: '跨域 iframe 受浏览器同源策略限制，无法直接访问其内部 DOM 或执行操作',
      en: 'Cross-origin iframe is restricted by the browser same-origin policy; cannot directly access its internal DOM or perform operations',
    },
    suggestionsTemplate: {
      zh: [
        '确保测试环境与 iframe 同源，或使用相同的基础 URL',
        '使用 page.goto() 直接导航到 iframe 的 URL 进行测试',
        '在开发环境中配置 CORS 和 CSP 允许跨域访问',
        '使用 Playwright 的 context.addCookies() 设置认证状态',
      ],
      en: [
        'Ensure the test environment is same-origin with the iframe, or use the same base URL',
        'Use page.goto() to navigate directly to the iframe URL for testing',
        'Configure CORS and CSP in the development environment to allow cross-origin access',
        'Use Playwright context.addCookies() to set authentication state',
      ],
    },
    docLinks: [
      { title: 'Frames', url: 'https://playwright.dev/docs/frames' },
      { title: 'Auth', url: 'https://playwright.dev/docs/auth' },
    ],
  },
];

const AUTH_PATTERNS: ErrorPattern[] = [
  {
    id: 'auth-token-expired',
    category: 'auth',
    name: 'Token 过期',
    description: '认证令牌已过期导致请求被拒绝',
    regex: [/401.*Unauthorized/, /token.*expired/],
    rootCauseTemplate: {
      zh: '认证令牌已过期，服务端返回 401 未授权响应，需要重新登录或刷新令牌',
      en: 'Authentication token has expired; the server returned a 401 Unauthorized response; need to re-login or refresh the token',
    },
    suggestionsTemplate: {
      zh: [
        '在每个测试前使用 storageState 恢复有效的认证状态',
        '使用 beforeAll 或 beforeEach 重新登录获取新令牌',
        '配置令牌自动刷新机制',
        '使用 Playwright 的 storageState 保存和复用登录状态',
      ],
      en: [
        'Use storageState to restore valid authentication state before each test',
        'Use beforeAll or beforeEach to re-login and obtain a new token',
        'Configure automatic token refresh mechanism',
        'Use Playwright storageState to save and reuse login state',
      ],
    },
    docLinks: [
      { title: 'Auth', url: 'https://playwright.dev/docs/auth' },
    ],
  },
  {
    id: 'auth-redirect-login',
    category: 'auth',
    name: '未登录重定向',
    description: '未认证时被重定向到登录页面',
    regex: [/302.*redirect.*login/, /Redirected to login/],
    rootCauseTemplate: {
      zh: '未认证用户访问受保护页面时被重定向到登录页，可能因为 session 失效或未正确设置认证状态',
      en: 'Unauthenticated user was redirected to the login page when accessing a protected page, possibly because the session expired or authentication state was not set correctly',
    },
    suggestionsTemplate: {
      zh: [
        '使用 storageState 在测试开始前恢复已登录状态',
        '在 globalSetup 中预创建认证状态并保存',
        '检查 cookie 和 localStorage 中的认证信息是否完整',
        '使用 Playwright 的 projects 配置共享 storageState',
      ],
      en: [
        'Use storageState to restore logged-in state before the test starts',
        'Pre-create authentication state in globalSetup and save it',
        'Check if authentication information in cookies and localStorage is complete',
        'Use Playwright projects configuration to share storageState',
      ],
    },
    docLinks: [
      { title: 'Auth', url: 'https://playwright.dev/docs/auth' },
    ],
  },
];

const ALL_PATTERNS: ErrorPattern[] = [
  ...TIMEOUT_PATTERNS,
  ...SELECTOR_PATTERNS,
  ...ASSERTION_PATTERNS,
  ...NETWORK_PATTERNS,
  ...FRAME_PATTERNS,
  ...AUTH_PATTERNS,
];

/**
 * 根据错误消息匹配所有符合的错误模式
 * @param error - 错误消息字符串
 * @returns 匹配到的 ErrorPattern 列表
 */
export function matchPatterns(error: string): ErrorPattern[] {
  return ALL_PATTERNS.filter((pattern) =>
    pattern.regex.some((re) => re.test(error))
  );
}

/**
 * 将匹配到的错误模式转换为 few-shot prompt 片段
 * @param patterns - 匹配到的错误模式列表
 * @param lang - 语言标识，'zh' 或 'en'
 * @returns 格式化的 few-shot prompt 字符串
 */
export function buildFewShotExamples(patterns: ErrorPattern[], lang: string): string {
  if (patterns.length === 0) {
    return '';
  }

  const isZh = lang === 'zh';
  const lines: string[] = [isZh ? '已知错误模式分析：' : 'Known error pattern analysis:'];

  for (const pattern of patterns) {
    const rootCause = isZh ? pattern.rootCauseTemplate.zh : pattern.rootCauseTemplate.en;
    const suggestions = isZh ? pattern.suggestionsTemplate.zh : pattern.suggestionsTemplate.en;
    const docLinks = pattern.docLinks
      .map((link) => `${link.title}: ${link.url}`)
      .join('; ');

    lines.push(`- ${isZh ? '模式' : 'Pattern'}：${pattern.name}`);
    lines.push(`  ${isZh ? '典型根因' : 'Root cause'}：${rootCause}`);
    lines.push(`  ${isZh ? '建议修复' : 'Suggestions'}：${suggestions.join('；')}`);
    lines.push(`  ${isZh ? '参考文档' : 'References'}：${docLinks}`);
  }

  return lines.join('\n');
}
