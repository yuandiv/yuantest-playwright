import { test, expect } from '@playwright/test';

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.goto('/admin/users');
  });

  test('should display users table', async ({ page }) => {
    await expect(page.locator('table.users')).toBeVisible();
  });

  test('should search users by name', async ({ page }) => {
    await page.fill('input[placeholder="Search users"]', 'John');
    await page.press('input[placeholder="Search users"]', 'Enter');
    const rows = page.locator('table.users tbody tr');
    await expect(rows).toHaveCount(1);
  });

  test('should add new user', async ({ page }) => {
    await page.click('button:has-text("Add User")');
    await page.fill('#new-username', 'newuser');
    await page.fill('#new-email', 'newuser@example.com');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.toast-success')).toBeVisible();
  });

  test('should edit existing user', async ({ page }) => {
    await page.click('table.users tbody tr:first-child .edit-btn');
    await page.fill('#edit-email', 'updated@example.com');
    await page.click('button:has-text("Update")');
    await expect(page.locator('.toast-success')).toBeVisible();
  });

  test('should delete user with confirmation', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.click('table.users tbody tr:first-child .delete-btn');
    await expect(page.locator('.toast-success')).toBeVisible();
  });

  test('should paginate users list', async ({ page }) => {
    await page.click('.pagination >> text=2');
    await expect(page.locator('.pagination .active')).toContainText('2');
  });
});
