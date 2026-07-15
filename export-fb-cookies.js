#!/usr/bin/env node
// export-fb-cookies.js
// Run ONCE locally while logged into Facebook in Chrome.
// Saves your FB session to .fb-cookies.json
// Then add contents as GitHub Secret: FB_COOKIES
// Usage: node export-fb-cookies.js

const { chromium } = require('playwright');
const fs = require('fs');

const CHROME_PROFILE = process.env.HOME + '/Library/Application Support/Google/Chrome/Default';

async function exportCookies() {
  console.log('Launching Chrome with your existing profile...');
  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: false, channel: 'chrome', args: ['--no-first-run','--no-default-browser-check']
  });
  const page = browser.pages()[0] || await browser.newPage();
  console.log('Navigating to Facebook Marketplace selling page...');
  await page.goto('https://www.facebook.com/marketplace/you/selling', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  if (page.url().includes('login')) {
    console.error('Not logged into Facebook. Please log in first then re-run.');
    await browser.close(); process.exit(1);
  }
  console.log('Logged in confirmed. Extracting cookies...');
  const cookies = await browser.cookies(['https://www.facebook.com']);
  fs.writeFileSync('.fb-cookies.json', JSON.stringify(cookies, null, 2));
  console.log('Saved ' + cookies.length + ' cookies to .fb-cookies.json');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Copy the full contents of .fb-cookies.json');
  console.log('  2. GitHub repo: Settings > Secrets > Actions > New secret');
  console.log('  3. Name: FB_COOKIES | Value: paste the JSON');
  console.log('  4. Done - the 5am scraper will use this session automatically');
  console.log('');
  console.log('Refresh every ~60 days by re-running this script and updating the secret.');
  await browser.close();
}

exportCookies().catch(err => { console.error('Error:', err.message); process.exit(1); });
