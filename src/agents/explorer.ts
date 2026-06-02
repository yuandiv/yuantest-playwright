import * as fs from 'fs';
import { chromium, Browser, Page, BrowserContext } from 'playwright-core';

interface AccessibilitySnapshotNode {
  role?: string;
  name?: string;
  value?: string;
  children?: AccessibilitySnapshotNode[];
}

type PageWithAccessibility = Page & {
  accessibility: {
    snapshot(options?: { interestingOnly?: boolean }): Promise<AccessibilitySnapshotNode | null>;
  };
};
import { logger } from '../logger';
import {
  AppExplorationResult,
  ExploreOptions,
  InteractiveElement,
  LinkInfo,
  FormInfo,
  PageSnapshot,
} from '../types';

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TIMEOUT = 30000;

const PAGINATION_PATTERN = /[?&]page=\d+|[?&]p=\d+|\/page\/\d+/;

const GENERIC_NAMES = new Set([
  'close',
  '×',
  '✕',
  '✖',
  'more',
  '...',
  '•••',
  'click here',
  'learn more',
  'read more',
  'click',
  '关闭',
  '更多',
  '点击',
  '了解更多',
  '阅读更多',
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'option',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'listbox',
  'tree',
  'gridcell',
  'columnheader',
  'rowheader',
]);

export class AppExplorer {
  private log = logger.child('AppExplorer');

  async explore(baseURL: string, options?: ExploreOptions): Promise<AppExplorationResult> {
    const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

    let browser: Browser | null = null;

    try {
      this.log.info(
        `Starting app exploration: ${baseURL} (depth=${maxDepth}, maxPages=${maxPages})`
      );

      browser = await chromium.launch({ headless: true });

      // 构建浏览器上下文选项
      const contextOptions: Record<string, unknown> = {
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
      };

      // 应用 storageState
      if (options?.storageState && fs.existsSync(options.storageState)) {
        contextOptions.storageState = options.storageState;
      }

      // 应用 extraHeaders
      const headers: Record<string, string> = { ...options?.extraHeaders };
      if (options?.authToken) {
        headers['Authorization'] = `Bearer ${options.authToken}`;
      }
      if (Object.keys(headers).length > 0) {
        contextOptions.extraHTTPHeaders = headers;
      }

      const context = await browser.newContext(contextOptions);

      // credentials 自动登录（在 BFS 开始前）
      if (options?.credentials && !options?.storageState) {
        await this.autoLogin(context, baseURL, options.credentials, timeout);
      }

      const visitedUrls = new Set<string>();
      const pages: PageSnapshot[] = [];
      const allRoutes: string[] = [];

      // BFS crawl
      const queue: { url: string; depth: number }[] = [{ url: baseURL, depth: 0 }];

      while (queue.length > 0 && pages.length < maxPages) {
        const { url, depth } = queue.shift() as { url: string; depth: number };

        const normalizedUrl = this.normalizeUrl(url, baseURL);
        if (visitedUrls.has(normalizedUrl)) {
          continue;
        }
        if (depth > maxDepth) {
          continue;
        }

        // 检查 URL 是否匹配排除模式
        if (options?.excludeUrlPatterns) {
          const shouldExclude = options.excludeUrlPatterns.some((pattern) =>
            normalizedUrl.includes(pattern)
          );
          if (shouldExclude) {
            continue;
          }
        }

        // 检测分页 URL 模式，跳过已访问页面的分页变体
        const urlWithoutPagination = normalizedUrl.replace(PAGINATION_PATTERN, '');
        if (visitedUrls.has(urlWithoutPagination) && PAGINATION_PATTERN.test(normalizedUrl)) {
          continue;
        }

        visitedUrls.add(normalizedUrl);

        let page: Page | null = null;
        try {
          this.log.info(`Exploring page: ${normalizedUrl} (depth=${depth})`);
          page = await context.newPage();
          await page.goto(normalizedUrl, { waitUntil: 'networkidle', timeout });

          const snapshot = await this.capturePageSnapshot(page, normalizedUrl, options);
          pages.push(snapshot);

          allRoutes.push(normalizedUrl);

          // Discover links for further crawling
          if (depth < maxDepth) {
            const links = snapshot.links
              .map((l) => l.href)
              .filter((href) => this.isSameOrigin(href, baseURL))
              .map((href) => this.normalizeUrl(href, baseURL));

            for (const link of links) {
              if (!visitedUrls.has(link)) {
                queue.push({ url: link, depth: depth + 1 });
              }
            }
          }
        } catch (error) {
          this.log.warn(
            `Failed to explore ${normalizedUrl}: ${error instanceof Error ? error.message : String(error)}`
          );
        } finally {
          if (page) {
            await page.close().catch(() => {});
          }
        }
      }

      await context.close();

      // 全局模板元素去重
      this.separateGlobalElements(pages);

      this.log.info(`Exploration complete: ${pages.length} pages, ${allRoutes.length} routes`);

      return {
        pages,
        routes: allRoutes,
        exploredAt: Date.now(),
        baseURL,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 自动登录：检测登录表单并填写凭证
   */
  private async autoLogin(
    context: BrowserContext,
    baseURL: string,
    credentials: { username: string; password: string },
    timeout: number
  ): Promise<void> {
    const page = await context.newPage();
    try {
      await page.goto(baseURL, { waitUntil: 'networkidle', timeout });

      // 检测登录表单
      const hasLoginForm = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        let hasUsername = false;
        let hasPassword = false;
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as HTMLInputElement;
          const type = input.type;
          const name = input.name.toLowerCase();
          const id = input.id.toLowerCase();
          if (type === 'password' || name.includes('password') || id.includes('password')) {
            hasPassword = true;
          }
          if (
            type === 'email' ||
            (type === 'text' &&
              (name.includes('user') ||
                name.includes('email') ||
                name.includes('login') ||
                id.includes('user') ||
                id.includes('email') ||
                id.includes('login')))
          ) {
            hasUsername = true;
          }
        }
        return hasUsername && hasPassword;
      });

      if (hasLoginForm) {
        // 填写用户名
        const usernameSelectors = [
          'input[name*="user"]',
          'input[name*="email"]',
          'input[name*="login"]',
          'input[id*="user"]',
          'input[id*="email"]',
          'input[id*="login"]',
          'input[type="email"]',
        ];
        for (const sel of usernameSelectors) {
          const el = await page.$(sel);
          if (el) {
            await el.fill(credentials.username);
            break;
          }
        }

        // 填写密码
        const passwordSelectors = [
          'input[type="password"]',
          'input[name*="password"]',
          'input[id*="password"]',
        ];
        for (const sel of passwordSelectors) {
          const el = await page.$(sel);
          if (el) {
            await el.fill(credentials.password);
            break;
          }
        }

        // 点击提交按钮
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("登录")',
          'button:has-text("Login")',
          'button:has-text("Sign in")',
        ];
        for (const sel of submitSelectors) {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            break;
          }
        }

        // 等待导航完成
        await page.waitForLoadState('networkidle', { timeout }).catch(() => {});

        this.log.info('Auto-login completed');
      } else {
        this.log.warn('No login form detected on the entry page');
      }
    } catch (error) {
      this.log.warn(`Auto-login failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }

  /**
   * 识别全局模板元素（在多个页面都出现的元素），将其从 interactiveElements 移到 globalElements
   */
  private separateGlobalElements(pages: PageSnapshot[]): void {
    if (pages.length < 2) {
      return;
    }

    // 统计每个元素在多少个页面中出现
    const elementPageCount = new Map<string, number>();
    for (const page of pages) {
      const seenOnPage = new Set<string>();
      for (const el of page.interactiveElements) {
        const key = `${el.role}:${el.name}`;
        if (!seenOnPage.has(key)) {
          seenOnPage.add(key);
          elementPageCount.set(key, (elementPageCount.get(key) || 0) + 1);
        }
      }
    }

    // 在超过 60% 的页面中都出现的元素视为全局模板元素
    const threshold = Math.ceil(pages.length * 0.6);
    const globalKeys = new Set<string>();
    for (const [key, count] of elementPageCount) {
      if (count >= threshold) {
        globalKeys.add(key);
      }
    }

    if (globalKeys.size === 0) {
      return;
    }

    // 将全局元素从 interactiveElements 移到 globalElements
    for (const page of pages) {
      const globalElements: InteractiveElement[] = [];
      const uniqueElements: InteractiveElement[] = [];

      for (const el of page.interactiveElements) {
        const key = `${el.role}:${el.name}`;
        if (globalKeys.has(key)) {
          globalElements.push(el);
        } else {
          uniqueElements.push(el);
        }
      }

      page.interactiveElements = uniqueElements;
      if (globalElements.length > 0) {
        page.globalElements = globalElements;
      }
    }

    this.log.info(
      `Identified ${globalKeys.size} global element patterns across ${pages.length} pages`
    );
  }

  private async capturePageSnapshot(
    page: Page,
    url: string,
    options?: ExploreOptions
  ): Promise<PageSnapshot> {
    const title = await page.title();

    const interactiveElements = await this.discoverInteractiveElements(page, options);

    const forms = await this.discoverForms(page);

    const links = await this.discoverLinks(page);

    return {
      url,
      title,
      interactiveElements,
      forms,
      links,
    };
  }

  private async discoverInteractiveElements(
    page: Page,
    options?: ExploreOptions
  ): Promise<InteractiveElement[]> {
    const elements: InteractiveElement[] = [];

    try {
      const snapshot = await (page as PageWithAccessibility).accessibility.snapshot({
        interestingOnly: true,
      });
      if (!snapshot) {
        return [];
      }

      this.collectFromSnapshot(snapshot, elements);

      // 过滤通用/低价值文本
      const filtered = elements.filter((el) => !GENERIC_NAMES.has(el.name.toLowerCase().trim()));

      // 过滤排除选择器匹配的元素
      const excludeSelectors = options?.excludeSelectors || [];
      if (excludeSelectors.length > 0) {
        const result: InteractiveElement[] = [];
        for (const el of filtered) {
          let excluded = false;
          try {
            const locator = page.locator(`role=${el.role}[name="${el.name}"]`);
            const count = await locator.count();
            if (count > 0) {
              for (let i = 0; i < count; i++) {
                const single = locator.nth(i);
                for (const excludeSel of excludeSelectors) {
                  const matches = await single.evaluate(
                    (node, sel) => !!(node as Element).closest(sel),
                    excludeSel
                  );
                  if (matches) {
                    excluded = true;
                    break;
                  }
                }
                if (excluded) {
                  break;
                }
              }
            }
          } catch {
            // 定位器匹配失败，不过滤该元素
          }
          if (!excluded) {
            result.push(el);
          }
        }
        return result;
      }

      return filtered;
    } catch (error) {
      this.log.warn(
        `Failed to discover interactive elements: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return elements;
  }

  private collectFromSnapshot(
    node: {
      role?: string;
      name?: string;
      value?: string;
      children?: Array<{
        role?: string;
        name?: string;
        value?: string;
        children?: Array<unknown>;
      }>;
    },
    elements: InteractiveElement[],
    _parentName?: string
  ): void {
    const { role, name, children } = node;

    if (role && name && this.isInteractiveRole(role)) {
      const trimmedName = name.trim();
      if (trimmedName) {
        elements.push({
          role,
          name: trimmedName,
          selector: this.buildSelector(role, trimmedName),
        });
      }
    }

    if (children) {
      for (const child of children) {
        this.collectFromSnapshot(
          child as Parameters<typeof this.collectFromSnapshot>[0],
          elements,
          role === 'group' ? name?.trim() : undefined
        );
      }
    }
  }

  private isInteractiveRole(role: string): boolean {
    return INTERACTIVE_ROLES.has(role);
  }

  private buildSelector(role: string, name: string): string {
    const escapedName = name.replace(/'/g, "\\'");
    return `getByRole('${role}', { name: '${escapedName}' })`;
  }

  private async discoverForms(page: Page): Promise<FormInfo[]> {
    const forms: FormInfo[] = [];

    try {
      const snapshot = await (page as PageWithAccessibility).accessibility.snapshot();
      if (!snapshot?.children) {
        return [];
      }

      this.collectFormsFromSnapshot(snapshot, forms, page);

      // 补充 action/method 属性（快照不含这些，需从 DOM 获取）
      for (const form of forms) {
        try {
          const formLocator = page.locator('form');
          const count = await formLocator.count();
          for (let i = 0; i < count; i++) {
            const action = await formLocator.nth(i).getAttribute('action');
            const method = await formLocator.nth(i).getAttribute('method');
            if (action) {
              form.action = action;
            }
            if (method) {
              form.method = method;
            }
          }
        } catch {
          // DOM 属性获取失败，不影响表单发现
        }
      }
    } catch (error) {
      this.log.warn(
        `Failed to discover forms: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return forms;
  }

  private collectFormsFromSnapshot(
    node: {
      role?: string;
      name?: string;
      children?: Array<unknown>;
    },
    forms: FormInfo[],
    _page: Page
  ): void {
    if (node.role === 'form' || node.role === 'group') {
      const fields: InteractiveElement[] = [];
      this.collectFormFields(node, fields);

      const submitButton = this.findSubmitButton(node);

      if (fields.length > 0) {
        forms.push({
          name: node.name?.trim() || `Form ${forms.length + 1}`,
          fields,
          submitButton: submitButton || undefined,
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectFormsFromSnapshot(
          child as Parameters<typeof this.collectFormsFromSnapshot>[0],
          forms,
          _page
        );
      }
    }
  }

  private collectFormFields(
    node: {
      role?: string;
      name?: string;
      children?: Array<unknown>;
    },
    fields: InteractiveElement[]
  ): void {
    if (node.role && node.name && this.isInteractiveRole(node.role) && node.role !== 'button') {
      const trimmedName = node.name.trim();
      if (trimmedName) {
        fields.push({
          role: node.role,
          name: trimmedName,
          selector: this.buildSelector(node.role, trimmedName),
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectFormFields(child as Parameters<typeof this.collectFormFields>[0], fields);
      }
    }
  }

  private findSubmitButton(node: {
    role?: string;
    name?: string;
    children?: Array<unknown>;
  }): InteractiveElement | null {
    const SUBMIT_KEYWORDS = [
      'submit',
      '提交',
      '登录',
      'login',
      'sign in',
      '注册',
      'register',
      '搜索',
      'search',
      '保存',
      'save',
      '发送',
      'send',
      '确认',
      'confirm',
    ];

    if (node.role === 'button' && node.name) {
      const nameLower = node.name.toLowerCase().trim();
      if (SUBMIT_KEYWORDS.some((kw) => nameLower.includes(kw))) {
        return {
          role: 'button',
          name: node.name.trim(),
          selector: this.buildSelector('button', node.name.trim()),
        };
      }
    }

    if (node.children) {
      for (const child of node.children) {
        const btn = this.findSubmitButton(child as Parameters<typeof this.findSubmitButton>[0]);
        if (btn) {
          return btn;
        }
      }
    }

    return null;
  }

  private async discoverLinks(page: Page): Promise<LinkInfo[]> {
    const links: LinkInfo[] = [];

    try {
      const snapshot = await (page as PageWithAccessibility).accessibility.snapshot({
        interestingOnly: true,
      });
      if (!snapshot) {
        return [];
      }

      // 从快照中收集链接名称和定位器
      const snapshotLinks: Array<{ name: string; selector: string }> = [];
      this.collectLinksFromSnapshot(snapshot, snapshotLinks);

      // 补充 href（快照不含 URL，需从 DOM 获取）
      for (const link of snapshotLinks) {
        let href = '';
        try {
          const locator = page.getByRole('link', { name: link.name });
          href = (await locator.first().getAttribute('href')) || '';
        } catch {
          // href 获取失败，留空
        }

        if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
          continue;
        }

        links.push({
          text: link.name,
          href,
          selector: link.selector,
        });
      }
    } catch (error) {
      this.log.warn(
        `Failed to discover links: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return links;
  }

  private collectLinksFromSnapshot(
    node: {
      role?: string;
      name?: string;
      children?: Array<unknown>;
    },
    links: Array<{ name: string; selector: string }>
  ): void {
    if (node.role === 'link' && node.name) {
      const trimmedName = node.name.trim();
      if (trimmedName) {
        links.push({
          name: trimmedName,
          selector: this.buildSelector('link', trimmedName),
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectLinksFromSnapshot(
          child as Parameters<typeof this.collectLinksFromSnapshot>[0],
          links
        );
      }
    }
  }

  private normalizeUrl(url: string, baseURL: string): string {
    try {
      if (url.startsWith('/')) {
        const base = new URL(baseURL);
        return `${base.origin}${url}`;
      }
      if (url.startsWith('./') || url.startsWith('../')) {
        return new URL(url, baseURL).href;
      }
      return new URL(url).href;
    } catch {
      return url;
    }
  }

  private isSameOrigin(url: string, baseURL: string): boolean {
    try {
      const urlObj = new URL(this.normalizeUrl(url, baseURL));
      const baseObj = new URL(baseURL);
      return urlObj.origin === baseObj.origin;
    } catch {
      return false;
    }
  }
}
