import { test, expect } from '@playwright/test';

/**
 * 登录功能测试套件
 * 覆盖：正向流程、异常流程、边界值测试、数据验证
 */
test.describe('登录功能', () => {
  const validUser = { username: 'admin', password: 'password123' };

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  // ─── 正向流程 ───

  test('使用有效凭据成功登录', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', validUser.password);
    await page.click('[data-testid="login-button"]');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('[data-testid="user-greeting"]')).toContainText('欢迎');
  });

  test('登录成功后页面包含用户名', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', validUser.password);
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="user-greeting"]')).toContainText(validUser.username);
  });

  // ─── 异常流程 ───

  test('使用错误密码登录显示错误信息', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('密码错误');
  });

  test('使用不存在的用户名登录显示错误信息', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', 'nonexistent_user');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('用户不存在');
  });

  test('不填写表单直接提交显示验证提示', async ({ page }) => {
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="username-input"]:invalid')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]:invalid')).toBeVisible();
  });

  test('连续多次登录失败后显示锁定提示', async ({ page }) => {
    const maxAttempts = 5;
    for (let i = 0; i < maxAttempts; i++) {
      await page.fill('[data-testid="username-input"]', validUser.username);
      await page.fill('[data-testid="password-input"]', 'wrongpassword');
      await page.click('[data-testid="login-button"]');
    }

    await expect(page.locator('[data-testid="lockout-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="lockout-message"]')).toContainText('账户已锁定');
  });

  // ─── 边界值测试 ───

  test('用户名为空字符串', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', '');
    await page.fill('[data-testid="password-input"]', validUser.password);
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="username-input"]')).toBeFocused();
  });

  test('密码为空字符串', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', '');
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="password-input"]')).toBeFocused();
  });

  test('用户名长度超过最大限制（255字符）', async ({ page }) => {
    const longUsername = 'a'.repeat(256);
    await page.fill('[data-testid="username-input"]', longUsername);
    await page.fill('[data-testid="password-input"]', validUser.password);

    const inputValue = await page.inputValue('[data-testid="username-input"]');
    expect(inputValue.length).toBeLessThanOrEqual(255);
  });

  test('密码包含特殊字符', async ({ page }) => {
    const specialCharsPwd = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', specialCharsPwd);
    await page.click('[data-testid="login-button"]');

    // 特殊字符密码应能正常提交（不报格式错误）
    const errorVisible = await page.locator('[data-testid="error-message"]').isVisible();
    const isRedirected = page.url().includes('/dashboard');
    expect(errorVisible || isRedirected).toBe(true);
  });

  // ─── 数据验证 ───

  test('密码输入应被遮蔽显示', async ({ page }) => {
    const passwordInput = page.locator('[data-testid="password-input"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('登录成功后跳转到仪表盘', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', validUser.password);
    await page.click('[data-testid="login-button"]');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('[data-testid="dashboard-title"]')).toBeVisible();
  });

  test('退出登录后重定向回登录页', async ({ page }) => {
    await page.fill('[data-testid="username-input"]', validUser.username);
    await page.fill('[data-testid="password-input"]', validUser.password);
    await page.click('[data-testid="login-button"]');

    await page.click('[data-testid="logout-button"]');
    await expect(page).toHaveURL(/\/login/);
  });
});
