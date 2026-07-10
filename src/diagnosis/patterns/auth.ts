/**
 * 认证类错误模式
 */
import { ErrorPattern } from '../knowledge-base';

export const AUTH_PATTERNS: ErrorPattern[] = [
  {
    id: 'auth-token-expired',
    category: 'auth',
    name: '认证令牌过期',
    description: '使用的认证令牌已过期',
    regex: [/token.*expired/i, /auth.*expired/i, /401.*unauthorized/i, /unauthorized/i],
    rootCauseTemplate: {
      zh: '测试使用的认证令牌已过期，需要重新获取有效的令牌',
      en: 'The authentication token used in the test has expired and needs to be refreshed',
    },
    suggestionsTemplate: {
      zh: [
        '在测试前重新获取有效的认证令牌',
        '使用 page.context().addCookies() 或 page.context().setExtraHTTPHeaders() 设置新令牌',
        '对于 token 过期场景，应在测试中处理自动刷新逻辑',
        '使用 storageState 保存并复用认证状态',
      ],
      en: [
        'Re-acquire a valid authentication token before the test',
        'Set the new token using page.context().addCookies() or page.context().setExtraHTTPHeaders()',
        'For token expiry scenarios, implement auto-refresh logic in the test',
        'Use storageState to save and reuse authentication state',
      ],
    },
    docLinks: [
      { title: 'Authentication', url: 'https://playwright.dev/docs/auth' },
      { title: 'Storage State', url: 'https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state' },
    ],
  },
  {
    id: 'auth-login-failed',
    category: 'auth',
    name: '登录失败',
    description: '用户名或密码验证失败',
    regex: [/login.*failed/i, /invalid.*credential/i, /invalid.*password/i, /invalid.*username/i],
    rootCauseTemplate: {
      zh: '登录凭据验证失败，可能因为用户名/密码错误、账号被锁定或验证码拦截',
      en: 'Login credential validation failed, possibly due to incorrect username/password, account lockout, or CAPTCHA interception',
    },
    suggestionsTemplate: {
      zh: [
        '确认测试账号的用户名和密码是否正确',
        '检查账号是否被锁定或过期',
        '检查是否有验证码或二次验证机制',
        '使用 API 直接设置认证令牌或 cookie，绕过 UI 登录',
      ],
      en: [
        'Verify the test account username and password are correct',
        'Check if the account is locked or expired',
        'Check for CAPTCHA or two-factor authentication mechanisms',
        'Set authentication tokens or cookies directly via API, bypassing UI login',
      ],
    },
    docLinks: [
      { title: 'Authentication', url: 'https://playwright.dev/docs/auth' },
    ],
  },
  {
    id: 'auth-permission-denied',
    category: 'auth',
    name: '权限不足',
    description: '当前用户权限不足以执行操作',
    regex: [/forbidden/i, /403.*forbidden/i, /permission.*denied/i, /access.*denied/i, /insufficient.*permission/i],
    rootCauseTemplate: {
      zh: '当前登录用户没有执行该操作的权限，可能因为角色不对、功能未授权或资源受限',
      en: 'The currently logged-in user does not have permission to perform this action, possibly due to wrong role, unauthorized feature, or restricted resources',
    },
    suggestionsTemplate: {
      zh: [
        '确认测试账号具有所需的角色和权限',
        '检查 RBAC（基于角色的访问控制）配置',
        '使用具有更高权限的测试账号',
        '通过 API 直接设置用户角色或权限级别',
      ],
      en: [
        'Verify the test account has the required roles and permissions',
        'Check RBAC (Role-Based Access Control) configuration',
        'Use a test account with higher privileges',
        'Set user roles or permission levels directly via API',
      ],
    },
    docLinks: [
      { title: 'Authentication', url: 'https://playwright.dev/docs/auth' },
    ],
  },
];
