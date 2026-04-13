import { test, expect } from '@playwright/test';

test.describe('Shopping Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
  });

  test('should display product list', async ({ page }) => {
    const products = page.locator('.product-item');
    await expect(products).toHaveCount(12);
  });

  test('should add product to cart', async ({ page }) => {
    await page.click('.product-item:first-child .add-to-cart');
    await expect(page.locator('.cart-count')).toContainText('1');
  });

  test('should update cart quantity', async ({ page }) => {
    await page.click('.product-item:first-child .add-to-cart');
    await page.goto('/cart');
    await page.fill('.quantity-input', '3');
    await page.press('.quantity-input', 'Tab');
    await expect(page.locator('.cart-total')).toContainText(/\$[\d.]+/);
  });

  test('should remove item from cart', async ({ page }) => {
    await page.click('.product-item:first-child .add-to-cart');
    await page.goto('/cart');
    await page.click('.remove-item');
    await expect(page.locator('.empty-cart')).toBeVisible();
  });

  test('should proceed to checkout', async ({ page }) => {
    await page.click('.product-item:first-child .add-to-cart');
    await page.goto('/cart');
    await page.click('button:has-text("Checkout")');
    await expect(page).toHaveURL('/checkout');
  });

  test('should apply discount code', async ({ page }) => {
    await page.click('.product-item:first-child .add-to-cart');
    await page.goto('/cart');
    await page.fill('#discount-code', 'SAVE10');
    await page.click('button:has-text("Apply")');
    await expect(page.locator('.discount-applied')).toBeVisible();
  });
});
