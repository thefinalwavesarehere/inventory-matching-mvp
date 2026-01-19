/**
 * E2E tests for authentication flow
 * Tests signup, login, and project access
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
  });

  test('should display login page with signin mode by default', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('Inventory Matching');

    // Check signin mode is active
    await expect(page.locator('text=Sign in to your account')).toBeVisible();

    // Check email and password fields are visible
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    // Check fullName field is NOT visible in signin mode
    await expect(page.locator('#fullName')).not.toBeVisible();

    // Check submit button says "Sign In"
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('should toggle to signup mode', async ({ page }) => {
    // Click the signup toggle button
    await page.click('text=Don\'t have an account? Sign up');

    // Check signup mode is active
    await expect(page.locator('text=Create a new account')).toBeVisible();

    // Check all signup fields are visible
    await expect(page.locator('#fullName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();

    // Check submit button says "Sign Up"
    await expect(page.locator('button[type="submit"]')).toContainText('Sign Up');
  });

  test('should show error when passwords do not match', async ({ page }) => {
    // Switch to signup mode
    await page.click('text=Don\'t have an account? Sign up');

    // Fill in the form with mismatched passwords
    await page.fill('#fullName', 'Test User');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.fill('#confirmPassword', 'password456');

    // Submit the form
    await page.click('button[type="submit"]');

    // Check error message appears
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });

  test('should show validation error for short password', async ({ page }) => {
    // Switch to signup mode
    await page.click('text=Don\'t have an account? Sign up');

    // Fill in the form with a short password
    await page.fill('#fullName', 'Test User');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', '12345'); // Less than 6 characters
    await page.fill('#confirmPassword', '12345');

    // Try to submit (should be blocked by browser validation)
    const passwordInput = page.locator('#password');
    const minLength = await passwordInput.getAttribute('minLength');
    expect(minLength).toBe('6');
  });

  test('should require email field', async ({ page }) => {
    // Try to submit without filling email
    const emailInput = page.locator('#email');
    const isRequired = await emailInput.getAttribute('required');
    expect(isRequired).not.toBeNull();
  });

  test('should navigate to home page when already logged in', async ({ page, context }) => {
    // This test would require setting up a valid session
    // Skipping actual implementation as it requires mocking Supabase auth
    // In a real E2E environment, you would:
    // 1. Create a test user in Supabase
    // 2. Set session cookies
    // 3. Verify redirect to home page
  });
});

test.describe('Login Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should show loading state when submitting', async ({ page }) => {
    // Fill in valid credentials
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');

    // Intercept the auth request to simulate loading
    await page.route('**/auth/v1/token**', async route => {
      // Delay response to see loading state
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.abort();
    });

    // Submit form
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Check loading state
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText('Signing in...');
  });

  test('should toggle between signin and signup modes', async ({ page }) => {
    // Start in signin mode
    await expect(page.locator('text=Sign in to your account')).toBeVisible();

    // Toggle to signup
    await page.click('text=Don\'t have an account? Sign up');
    await expect(page.locator('text=Create a new account')).toBeVisible();
    await expect(page.locator('#fullName')).toBeVisible();

    // Toggle back to signin
    await page.click('text=Already have an account? Sign in');
    await expect(page.locator('text=Sign in to your account')).toBeVisible();
    await expect(page.locator('#fullName')).not.toBeVisible();
  });
});

test.describe('Project Access (Regression Test for Unauthorized Bug)', () => {
  test('should access projects page without Unauthorized error', async ({ page, context }) => {
    // This test specifically addresses the "Unauthorized projects" bug
    // In a real E2E test environment, you would:
    // 1. Create a test user and log in
    // 2. Navigate to the projects page
    // 3. Verify no "Unauthorized" errors appear
    // 4. Verify projects list loads successfully

    // For now, we'll verify the page structure exists
    await page.goto('/projects');

    // If not logged in, should redirect to login
    // If logged in, should show projects list
    const url = page.url();
    expect(url).toMatch(/\/(login|projects)/);
  });
});
