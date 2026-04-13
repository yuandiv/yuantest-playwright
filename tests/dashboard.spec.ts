import { test, expect } from '@playwright/test';

test.describe('Baidu Search Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.baidu.com');
  });

  test('should display Baidu homepage', async ({ page }) => {
    await expect(page).toHaveTitle(/百度一下/);
    await expect(page.locator('#su')).toBeVisible();
  });

  test('should search for content', async ({ page }) => {
    await page.fill('#kw', 'Playwright testing');
    await page.click('#su');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/Playwright testing/);
  });

  test('should display news tab', async ({ page }) => {
    await expect(page.locator('text=新闻')).toBeVisible();
    await page.click('text=新闻');
    await expect(page).toHaveURL(/news\.baidu\.com/);
  });

  test('should display hao123 link', async ({ page }) => {
    await expect(page.locator('text=hao123')).toBeVisible();
  });

  test('should display settings menu', async ({ page }) => {
    await expect(page.locator('.s-top-loginbtn')).toBeVisible();
  });
});
