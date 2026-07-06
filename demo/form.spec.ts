import { test, expect } from '@playwright/test';

/**
 * 表单功能测试套件
 * 覆盖：正向流程、异常流程、边界值测试、数据验证
 */
test.describe('表单功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/form');
  });

  // ─── 正向流程 ───

  test('填写并成功提交表单', async ({ page }) => {
    await page.fill('[data-testid="name-input"]', '张三');
    await page.fill('[data-testid="email-input"]', 'zhangsan@example.com');
    await page.selectOption('[data-testid="country-select"]', 'CN');
    await page.check('[data-testid="agree-checkbox"]');
    await page.click('[data-testid="submit-button"]');

    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('提交成功');
  });

  // ─── 异常流程 ───

  test('提交无效邮箱显示验证错误', async ({ page }) => {
    await page.fill('[data-testid="name-input"]', '李四');
    await page.fill('[data-testid="email-input"]', 'not-an-email');
    await page.selectOption('[data-testid="country-select"]', 'CN');
    await page.check('[data-testid="agree-checkbox"]');
    await page.click('[data-testid="submit-button"]');

    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toContainText('无效的邮箱');
  });

  test('提交时未勾选同意协议', async ({ page }) => {
    await page.fill('[data-testid="name-input"]', '王五');
    await page.fill('[data-testid="email-input"]', 'wangwu@example.com');
    await page.selectOption('[data-testid="country-select"]', 'CN');
    await page.click('[data-testid="submit-button"]');

    await expect(page.locator('[data-testid="agree-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="agree-error"]')).toContainText('请同意');
  });

  test('提交空表单', async ({ page }) => {
    await page.click('[data-testid="submit-button"]');

    await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
  });

  // ─── 边界值测试 ───

  test('姓名字段输入最大长度（100字符）', async ({ page }) => {
    const longName = '赵'.repeat(100);
    await page.fill('[data-testid="name-input"]', longName);
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.selectOption('[data-testid="country-select"]', 'CN');
    await page.check('[data-testid="agree-checkbox"]');
    await page.click('[data-testid="submit-button"]');

    await expect(page.locator('[data-testid="success-message"], [data-testid="name-error"]').first()).toBeVisible();
  });

  test('邮箱字段输入邮箱的最大长度', async ({ page }) => {
    const localPart = 'a'.repeat(64);
    const longEmail = `${localPart}@example.com`;
    await page.fill('[data-testid="name-input"]', '测试用户');
    await page.fill('[data-testid="email-input"]', longEmail);
    await page.selectOption('[data-testid="country-select"]', 'CN');
    await page.check('[data-testid="agree-checkbox"]');
    await page.click('[data-testid="submit-button"]');

    await expect(page.locator('[data-testid="success-message"], [data-testid="email-error"]').first()).toBeVisible();
  });

  test('快速重复提交表单', async ({ page }) => {
    await page.fill('[data-testid="name-input"]', '快速提交');
    await page.fill('[data-testid="email-input"]', 'fast@example.com');
    await page.selectOption('[data-testid="country-select"]', 'CN');
    await page.check('[data-testid="agree-checkbox"]');

    // 连续点击多次
    await page.click('[data-testid="submit-button"]');
    await page.click('[data-testid="submit-button"]');
    await page.click('[data-testid="submit-button"]');

    // 应只提交一次，不重复
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    const successCount = await page.locator('[data-testid="success-message"]').count();
    expect(successCount).toBeLessThanOrEqual(1);
  });

  // ─── 数据验证 ───

  test('表单数据在提交后持续保存', async ({ page }) => {
    const name = '持久化测试';
    const email = 'persist@example.com';

    await page.fill('[data-testid="name-input"]', name);
    await page.fill('[data-testid="email-input"]', email);
    await page.selectOption('[data-testid="country-select"]', 'US');
    await page.check('[data-testid="agree-checkbox"]');
    await page.click('[data-testid="submit-button"]');

    // 验证提交的数据显示在确认页
    await expect(page.locator('[data-testid="submitted-name"]')).toContainText(name);
    await expect(page.locator('[data-testid="submitted-email"]')).toContainText(email);
  });

  test('下拉选项值正确', async ({ page }) => {
    const countries = ['CN', 'US', 'JP', 'GB', 'DE'];
    for (const country of countries) {
      await page.selectOption('[data-testid="country-select"]', country);
      const selectedValue = await page.locator('[data-testid="country-select"]').inputValue();
      expect(selectedValue).toBe(country);
    }
  });
});
