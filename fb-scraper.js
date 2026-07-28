#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');

const FB_COOKIES_JSON = process.env.FB_COOKIES;
if (!FB_COOKIES_JSON) { console.error('FB_COOKIES not set.'); process.exit(1); }

async function scrapeFBListings() {
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--disable-dev-shm-usage'] });
        const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
        const cookies = JSON.parse(FB_COOKIES_JSON);
        await context.addCookies(cookies);
        console.log('Injected ' + cookies.length + ' cookies');
        const page = await context.newPage();
        await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); window.chrome = { runtime: {} }; });
        console.log('Navigating to seller listings...');
        await page.goto('https://www.facebook.com/marketplace/seller/listings/', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        const url = page.url();
        console.log('Final URL: ' + url);
        const text = await page.evaluate(() => document.body.innerText);
        console.log('Page text sample (first 500 chars):');
        console.log(text.slice(0, 500));
        console.log('Price matches: ' + (text.match(/\$[\d,]+/g) || []).length);
        console.log('Edit matches: ' + (text.match(/\bEdit\b/g) || []).length);
        await browser.close();
}

scrapeFBListings().catch(err => { console.error('Error:', err.message); process.exit(1); });
