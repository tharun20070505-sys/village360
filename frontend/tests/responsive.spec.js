import { expect, test } from '@playwright/test';

async function expectFitsViewport(page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )).toBeLessThanOrEqual(1);
}

test('field teams can discover every module on a small screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1})).toHaveText(/village\s*360°/i);
  await expectFitsViewport(page);
  const menu = page.getByRole('button', {name: 'Open navigation'});
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole('navigation', {name: 'Main navigation'}).getByText('Survey categories').click();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  }
  await page.getByRole('button', { name: /view all modules/i }).click();
  await expect(page.getByRole('link', {name: /student participation/i})).toBeVisible();
  await expectFitsViewport(page);
});

test('start survey redirects an unauthenticated device to the login form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', {name: /^start survey$/i}).click();
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  const password = page.locator('input[type="password"]');
  await expect(password).toBeVisible();
  await expect(page.getByRole('button', {name: /sign in|log in|login/i})).toBeVisible();
  await expectFitsViewport(page);
});

test('surveyor signs in and stores a farmer response from a mobile form', async ({page}) => {
  await page.goto('/surveys/farmers/new');
  await page.getByLabel('Email / Surveyor ID').fill('mobile@example.test');
  await page.getByLabel('Password', {exact:true}).fill(process.env.V360_TEST_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Farmer survey',exact:true})).toBeVisible();
  await expectFitsViewport(page);
  await page.getByLabel('Village',{exact:true}).selectOption({label:'Test village'});
  await page.getByLabel('Ward',{exact:true}).selectOption({label:'Test ward'});
  await page.getByLabel(/participant understands/).check();
  await page.getByLabel('Main crops').fill('Millet');
  await page.getByLabel('Irrigation source').selectOption({label:'Rain-fed'});
  await page.getByLabel('Water availability').selectOption({label:'Intermittent'});
  await page.getByLabel('Agricultural difficulties').fill('Shortage of irrigation water');
  await page.getByLabel('Support requirements').fill('Repair the common water point');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review and submit'})).toBeVisible();
  await page.getByLabel(/confirm they are accurate/).check();
  await page.getByRole('button',{name:'Confirm and save'}).click();
  await expect(page.getByRole('heading',{name:'Record saved'})).toBeVisible();
  await page.getByRole('link',{name:'View saved record'}).click();
  await expect(page.getByText('Millet',{exact:true})).toBeVisible();
  await expectFitsViewport(page);
});
