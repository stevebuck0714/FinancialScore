import { chromium } from 'playwright';

const targetUrl = String(process.env.PROD_UPTIME_URL || 'https://dashboard.corelytics.com').replace(/\/+$/, '');
const timeoutMs = Number(process.env.PROD_UPTIME_TIMEOUT_MS || 25000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.getByRole('heading', { name: 'Sign In' }).first().waitFor({ timeout: timeoutMs });
  await page.getByPlaceholder('Email').first().waitFor({ timeout: 8000 });
  console.log(`OK login form visible on ${targetUrl}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const title = await page.title().catch(() => '');
  const text = await page.locator('body').innerText().catch(() => '');
  await page.screenshot({ path: 'uptime-failure.png', fullPage: true }).catch(() => {});
  console.error(`FAIL login form missing on ${targetUrl}`);
  console.error(message);
  console.error(`title: ${title}`);
  console.error(`body: ${String(text).slice(0, 500)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
