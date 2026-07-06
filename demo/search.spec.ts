import { test, expect } from '@playwright/test';

/**
 * 搜索功能测试套件
 * 覆盖：正向流程、异常流程、边界值测试、数据验证
 */
test.describe('搜索功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search');
  });

  // ─── 正向流程 ───

  test('输入关键词并成功显示搜索结果', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'Playwright');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="result-item"]').first()).toBeVisible();
  });

  test('搜索结果数量正确显示', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'Playwright');
    await page.click('[data-testid="search-button"]');

    const resultCount = await page.locator('[data-testid="result-item"]').count();
    await expect(page.locator('[data-testid="result-count"]')).toContainText(`${resultCount}`);
  });

  test('搜索结果包含关键词高亮', async ({ page }) => {
    const keyword = 'Playwright';
    await page.fill('[data-testid="search-input"]', keyword);
    await page.click('[data-testid="search-button"]');

    const highlightedItems = page.locator('[data-testid="result-item"] mark');
    const count = await highlightedItems.count();
    expect(count).toBeGreaterThan(0);
  });

  // ─── 异常流程 ───

  test('搜索无匹配关键词显示空结果提示', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'zzz_nonexistent_term_xxx');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="no-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="no-results"]')).toContainText('未找到');
  });

  test('搜索服务异常时显示错误提示', async ({ page }) => {
    // 模拟网络错误
    await page.route('**/api/search**', (route) => route.abort('connectionfailed'));

    await page.fill('[data-testid="search-input"]', 'Playwright');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="search-error"]')).toBeVisible();
  });

  test('搜索超时时显示超时提示', async ({ page }) => {
    await page.route('**/api/search**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 30000));
    });

    await page.fill('[data-testid="search-input"]', 'Playwright');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="timeout-message"]')).toBeVisible({ timeout: 10000 });
  });

  // ─── 边界值测试 ───

  test('搜索关键词为空字符串', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', '');
    await page.click('[data-testid="search-button"]');

    // 空搜索应显示默认内容或提示
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test('搜索超长关键词（500字符）', async ({ page }) => {
    const longQuery = 'a'.repeat(500);
    await page.fill('[data-testid="search-input"]', longQuery);
    await page.click('[data-testid="search-button"]');

    // 不应崩溃，应有正常响应
    await expect(page.locator('[data-testid="search-results"], [data-testid="no-results"]').first()).toBeVisible();
  });

  test('搜索特殊字符', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', '<script>alert("xss")</script>');
    await page.click('[data-testid="search-button"]');

    // 应安全处理，XSS 不应执行
    await expect(page.locator('[data-testid="search-results"], [data-testid="no-results"]').first()).toBeVisible();
  });

  test('连续快速提交搜索', async ({ page }) => {
    const keywords = ['a', 'ab', 'abc', 'abcd', 'abcde'];
    for (const kw of keywords) {
      await page.fill('[data-testid="search-input"]', kw);
      await page.click('[data-testid="search-button"]');
    }

    // 最后一次搜索应正确显示
    await expect(page.locator('[data-testid="search-results"], [data-testid="no-results"]').first()).toBeVisible();
  });

  // ─── 数据验证 ───

  test('搜索结果分页显示', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'test');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
    const itemsPerPage = await page.locator('[data-testid="result-item"]').count();
    expect(itemsPerPage).toBeLessThanOrEqual(20);
  });

  test('搜索关键词在 URL 中正确编码', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', '中文搜索 + 特殊符号');
    await page.click('[data-testid="search-button"]');

    const url = page.url();
    expect(url).toContain('q=');
    expect(url).not.toContain(' ');
  });
});
