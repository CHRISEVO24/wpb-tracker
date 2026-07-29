#!/usr/bin/env node
// fb-scraper.js - Builds fb-listings.json from fb_url_mapping.json
// Uses URL mapping since headless FB scraping is blocked from cloud IPs

const fs = require('fs');

if (!fs.existsSync('fb_url_mapping.json')) {
  console.error('fb_url_mapping.json not found');
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync('fb_url_mapping.json', 'utf8'));
console.log('Loaded ' + mapping.length + ' listings from fb_url_mapping.json');

const listings = mapping.map(m => ({
  title: m.title,
  price: '',
  status: 'Active',
  listed_date: '',
  fb_url: m.fb_url || '',
  share_url: m.share_url || '',
  item_id: m.item_id || ''
}));

fs.writeFileSync('fb-listings.json', JSON.stringify(listings, null, 2));
console.log('Saved fb-listings.json with ' + listings.length + ' listings');
