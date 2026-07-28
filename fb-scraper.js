#!/usr/bin/env node
// fb-scraper.js - Scrapes FB Marketplace seller listings page
// Runs in GitHub Actions headlessly. Outputs: fb-listings.json

const { chromium } = require('playwright');
const fs = require('fs');

const FB_COOKIES_JSON = process.env.FB_COOKIES;
if (!FB_COOKIES_JSON) {
      console.error('FB_COOKIES environment variable not set.');
      process.exit(1);
}

async function scrapeFBListings() {
      console.log('Launching headless browser...');
      const browser = await chromium.launch({
              headless: true,
              args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--disable-dev-shm-usage','--window-size=1280,900']
      });
      const context = await browser.newContext({
              userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              viewport: { width: 1280, height: 900 },
              locale: 'en-US',
              timezoneId: 'America/New_York'
      });

  const cookies = JSON.parse(FB_COOKIES_JSON);
      await context.addCookies(cookies);
      console.log('Injected ' + cookies.length + ' cookies');

  const page = await context.newPage();
      await page.addInitScript(() => {
              Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
              window.chrome = { runtime: {} };
      });

  console.log('Loading FB Marketplace seller listings page...');
      await page.goto('https://www.facebook.com/marketplace/seller/listings/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

  const url = page.url();
      if (url.includes('login') || url.includes('checkpoint')) {
              console.error('Session expired - update FB_COOKIES secret.');
              await browser.close();
              process.exit(1);
      }

  console.log('Page loaded. Scrolling to load all listings...');

  let previousCount = 0;
      let stableRounds = 0;
      let scrollAttempts = 0;

  while (scrollAttempts < 40) {
          await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
          await page.waitForTimeout(2000);
          const text = await page.evaluate(() => document.body.innerText);
          // New page uses price format $XX,XXX.XX and Edit buttons
        const priceMatches = (text.match(/\$[\d,]+\.\d{2}/g) || []).length;
          const editMatches = (text.match(/\bEdit\b/g) || []).length;
          const count = Math.max(priceMatches, editMatches);
          console.log('Scroll ' + (scrollAttempts + 1) + ': ~' + priceMatches + ' prices, ' + editMatches + ' edit buttons');
          if (count <= previousCount) {
                    stableRounds++;
                    if (stableRounds >= 5) { console.log('List stable after ' + (scrollAttempts + 1) + ' scrolls'); break; }
          } else { stableRounds = 0; }
          previousCount = count;
          scrollAttempts++;
  }

  const finalText = await page.evaluate(() => document.body.innerText);
      const listings = parseListings(finalText);
      console.log('Found ' + listings.length + ' listings total');

  let urlMapping = {};
      if (fs.existsSync('fb_url_mapping.json')) {
              try {
                        const mapping = JSON.parse(fs.readFileSync('fb_url_mapping.json', 'utf8'));
                        mapping.forEach(m => { const key = m.title.toLowerCase().trim(); urlMapping[key] = { fb_url: m.fb_url, share_url: m.share_url, item_id: m.item_id }; });
                        console.log('Loaded ' + mapping.length + ' URL mappings from fb_url_mapping.json');
              } catch(e) { console.log('Could not load fb_url_mapping.json: ' + e.message); }
      }

  listings.forEach(listing => {
          const key = listing.title.toLowerCase().trim();
          const match = urlMapping[key];
          if (match) { listing.fb_url = match.fb_url; listing.share_url = match.share_url; listing.item_id = match.item_id; }
  });

  fs.writeFileSync('fb-listings.json', JSON.stringify(listings, null, 2));
      console.log('Saved fb-listings.json with ' + listings.length + ' listings');
      await browser.close();
      return listings;
}

function parseListings(text) {
      // New page structure: Title, Category: Watches, Status, $Price.00, Local pickup, nums, Edit
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      const listings = [];
      let i = 0;

  while (i < lines.length) {
          // Match price in new format: $44,000.00
        if (lines[i].match(/^\$[\d,]+\.\d{2}$/) && i > 0) {
                  const price = lines[i].replace(/\.\d{2}$/, ''); // strip cents: $44,000
            // Title is 1-2 lines before price, after status
            let title = '';
                  let status = 'unknown';

            // Look back for status and title
            for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
                        const line = lines[j];
                        if (['Active', 'Sold', 'Pending', 'Out of stock', 'Inactive'].includes(line)) {
                                      status = line;
                                      // Title is the line(s) before status
                          if (j > 0 && !lines[j-1].startsWith('Category:')) {
                                          title = lines[j-1];
                          } else if (j > 1) {
                                          title = lines[j-2];
                          }
                                      break;
                        }
                        if (line.startsWith('Category:')) continue;
                        // If no status found yet, this might be the title
                    if (!title && line.length > 5 && !line.startsWith('$') && !line.startsWith('Category:')) {
                                  title = line;
                    }
            }

            if (title && title.length > 3) {
                        listings.push({ title, price, status, listed_date: '', fb_url: '', share_url: '', item_id: '' });
            }
        }
          i++;
  }
      return listings;
}

scrapeFBListings().catch(err => { console.error('Scraper error:', err.message); process.exit(1); });
