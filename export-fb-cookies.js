#!/usr/bin/env node
// export-fb-cookies.js
// Opens a browser window, you log into Facebook, then press Enter to save cookies.
// Usage: node export-fb-cookies.js

const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

async function exportCookies() {
  console.log('Opening browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to Facebook...');
  await page.goto('https://www.facebook.com/login');

  console.log('');
  console.log('====================================================');
  console.log('  Please log into Facebook in the browser window.');
  console.log('  Once you are logged in and can see your feed,');
  console.log('  come back here and press ENTER to save cookies.');
  console.log('====================================================');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press ENTER when logged in...', () => { rl.close(); resolve(); }));

  const url = page.url();
  if (url.includes('login')) {
    console.error('Still on login page - please log in first.');
    await browser.close();
    process.exit(1);
  }

  console.log('Saving cookies...');
  const cookies = await context.cookies(['https://www.facebook.com']);
  fs.writeFileSync('.fb-cookies.json', JSON.stringify(cookies, null, 2));
  console.log('Saved ' + cookies.length + ' cookies to .fb-cookies.json');
  console.log('');
  console.log('Next: Copy the contents of .fb-cookies.json and add as');
  console.log('GitHub Secret named FB_COOKIES in your wpb-tracker repo.');

  await browser.close();
}

exportCookies().catch(err => { console.error('Error:', err.message); process.exit(1); });
