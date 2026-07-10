/**
 * 网络类错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const NETWORK_PATTERNS: ErrorPattern[] = [
  {
    id: 'network-request-failed',
    category: 'network',
    name: '网络请求失败',
    description: 'API 请求返回非 2xx 状态码或请求被拒绝',
    regex: [/net::ERR/, /Failed to load resource/i, /NetworkError/i, /fetch.*failed/i, /Request failed/i],
    rootCauseTemplate: {
      zh: '发送的网络请求未能成功完成，可能因为后端服务不可用、CORS 限制或请求参数错误',
      en: 'The network request failed to complete, possibly due to backend unavailability, CORS restrictions, or incorrect request parameters',
    },
    suggestionsTemplate: {
      zh: [
        '在浏览器网络面板中检查请求的实际响应状态和错误信息',
        '确认后端服务是否正常运行',
        '检查 API 端点 URL 是否正确',
        '检查是否有 CORS 限制，特别是跨域请求',
        '使用 page.route() 拦截并 mock API 响应以隔离测试',
      ],
      en: [
        'Check the actual response status and error in the browser Network panel',
        'Verify the backend service is running properly',
        'Check if the API endpoint URL is correct',
        'Check for CORS restrictions, especially for cross-origin requests',
        'Use page.route() to intercept and mock API responses for test isolation',
      ],
    },
    docLinks: [
      { title: 'Network', url: 'https://playwright.dev/docs/network' },
      { title: 'Route', url: 'https://playwright.dev/docs/api/class-page#page-route' },
    ],
  },
  {
    id: 'network-aborted',
    category: 'network',
    name: '网络请求被中止',
    description: 'API 请求在完成前被中止',
    regex: [/ERR_ABORTED/i, /aborted/i, /canceled/i],
    rootCauseTemplate: {
      zh: '网络请求在完成前被中止，可能因为导航跳转、页面刷新或超时取消',
      en: 'The network request was aborted before completion, possibly due to navigation, page refresh, or timeout cancellation',
    },
    suggestionsTemplate: {
      zh: [
        '检查请求是否因为页面导航而中断（例如表单提交触发了页面跳转）',
        '确保在发起请求后等待响应完成，而不是同时进行其他操作',
        '考虑增加请求超时时间',
        '使用 page.waitForResponse 确保请求完成',
      ],
      en: [
        'Check if the request was interrupted by navigation (e.g. form submission triggering redirect)',
        'Ensure you wait for the response after initiating the request',
        'Consider increasing the request timeout',
        'Use page.waitForResponse to ensure the request completes',
      ],
    },
    docLinks: [{ title: 'Network', url: 'https://playwright.dev/docs/network' }],
  },
  {
    id: 'network-connection-refused',
    category: 'network',
    name: '连接被拒绝',
    description: '目标服务器主动拒绝连接',
    regex: [/connection refused/i, /ERR_CONNECTION_REFUSED/i, /ECONNREFUSED/i],
    rootCauseTemplate: {
      zh: '目标服务器拒绝了连接请求，可能因为服务未启动、端口错误或防火墙阻止',
      en: 'The target server refused the connection, possibly because the service is not started, wrong port, or firewall blocking',
    },
    suggestionsTemplate: {
      zh: [
        '确认目标服务是否已启动并正在监听指定端口',
        '检查 URL 中的端口号是否正确',
        '确认防火墙或安全组规则没有阻止连接',
        '使用 curl 或浏览器直接访问该 URL 确认可达性',
      ],
      en: [
        'Verify the target service is started and listening on the specified port',
        'Check if the port number in the URL is correct',
        'Verify firewall or security group rules are not blocking the connection',
        'Test reachability using curl or accessing the URL directly in a browser',
      ],
    },
    docLinks: [{ title: 'Network', url: 'https://playwright.dev/docs/network' }],
  },
];
