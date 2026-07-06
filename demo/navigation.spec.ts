import { test, expect } from '@playwright/test';

/**
 * 页面导航与路由测试套件
 * 覆盖：正向流程、异常流程、边界值测试、数据验证
 */
test.describe('页面导航', () => {
  // ─── 正向流程 ───

  test('从首页导航到关于页面', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-about"]');
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator('[data-testid="about-title"]')).toBeVisible();
  });

  test('从首页导航到联系页面', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-contact"]');
    await expect(page).toHaveURL(/\/contact/);
    await expect(page.locator('[data-testid="contact-title"]')).toBeVisible();
  });

  test('浏览器前进后退导航正常', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-about"]');
    await expect(page).toHaveURL(/\/about/);

    await page.goBack();
    await expect(page).toHaveURL(/\/?$/);

    await page.goForward();
    await expect(page).toHaveURL(/\/about/);
  });

  test('深层嵌套路由可正常加载', async ({ page }) => {
    await page.goto('/products/category/electronics/item/123');
    await expect(page.locator('[data-testid="product-detail"]')).toBeVisible();
    await expect(page.locator('[data-testid="product-id"]')).toContainText('123');
  });

  // ─── 异常流程 ───

  test('访问不存在的路由显示 404 页面', async ({ page }) => {
    await page.goto('/nonexistent-route-xyz-123');
    await expect(page.locator('[data-testid="not-found-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="not-found-title"]')).toContainText('404');
  });

  test('访问无权限页面显示403', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.locator('[data-testid="forbidden-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="forbidden-title"]')).toContainText('403');
  });

  test('会话过期后访问受保护页面重定向到登录', async ({ page }) => {
    // 清除本地存储模拟会话过期
    await page.goto('/dashboard');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page).toHaveURL(/\/login/);
  });

  test('断网时导航显示断网提示', async ({ page }) => {
    await page.context().setOffline(true);
    await page.goto('/about').catch(() => {});

    // 应显示断网提示或使用 Service Worker 缓存
    const hasOfflineIndicator = await page.locator('[data-testid="offline-indicator"]').isVisible();
    const hasCachedPage = page.url().includes('/about');
    expect(hasOfflineIndicator || hasCachedPage).toBe(true);

    await page.context().setOffline(false);
  });

  // ─── 边界值测试 ───

  test('URL 参数数量极多时页面不崩溃', async ({ page }) => {
    const params = new URLSearchParams();
    for (let i = 0; i < 50; i++) {
      params.set(`param${i}`, `value${i}`);
    }
    await page.goto(`/search?${params.toString()}`);
    await expect(page.locator('body')).toBeVisible();
  });

  test('快速连续切换页面不崩溃', async ({ page }) => {
    const pages = ['/', '/about', '/contact', '/products', '/search'];
    for (const p of pages) {
      await page.goto(p);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  // ─── 数据验证 ───

  test('URL 查询参数正确传递到页面', async ({ page }) => {
    await page.goto('/search?q=playwright&category=test&page=1');

    const inputValue = await page.inputValue('[data-testid="search-input"]');
    expect(inputValue).toBe('playwright');
  });

  test('页面标题随路由变化', async ({ page }) => {
    const routeTitleMap = [
      { route: '/', title: /首页|Home/ },
      { route: '/about', title: /关于|About/ },
      { route: '/contact', title: /联系|Contact/ },
    ];

    for (const { route, title } of routeTitleMap) {
      await page.goto(route);
      await expect(page).toHaveTitle(title);
    }
  });

  test('锚点链接滚动到正确位置', async ({ page }) => {
    await page.goto('/about');
    await page.click('[data-testid="link-to-section"]');
    await page.waitForTimeout(500);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test('路由切换后组件状态重置', async ({ page }) => {
    await page.goto('/form');
    await page.fill('[data-testid="name-input"]', '临时数据');

    await page.click('[data-testid="nav-home"]');
    await page.goBack();

    const inputValue = await page.inputValue('[data-testid="name-input"]');
    expect(inputValue).toBe('');
  });
});
