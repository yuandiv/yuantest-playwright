import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('should display login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-message')).toBeVisible();
  });

  test('should navigate to forgot password', async ({ page }) => {
    await page.goto('/login');
    await page.click('a[href="/forgot-password"]');
    await expect(page).toHaveURL('/forgot-password');
  });
});
