#!/usr/bin/env node
/**
 * WPB Watch Co — History Trimmer (run once)
 * Trims your existing history.json to the last 30 days
 * so it's small enough to upload to GitHub.
 *
 * Usage:  node trim-history.js
 */

const fs   = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "history.json");

if (!fs.existsSync(HISTORY_FILE)) {
  console.log("❌ history.json not found in this folder.");
  process.exit(1);
}

const history  = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
const allKeys  = Object.keys(history).sort();
const before   = allKeys.length;
const fileSizeBefore = (fs.statSync(HISTORY_FILE).size / (1024 * 1024)).toFixed(1);

console.log(`\nWPB History Trimmer`);
console.log(`Current file size : ${fileSizeBefore} MB`);
console.log(`Total snapshots   : ${before}`);
console.log(`Date range        : ${allKeys[0]} → ${allKeys[allKeys.length-1]}\n`);

// Keep only last 30 days
const cutoff    = new Date();
cutoff.setDate(cutoff.getDate() - 30);
const cutoffStr = cutoff.toISOString().slice(0, 10);

console.log(`Keeping snapshots from ${cutoffStr} onwards...`);

const trimmed = {};
for (const key of allKeys) {
  if (key.slice(0, 10) >= cutoffStr) {
    trimmed[key] = history[key];
  }
}

const after        = Object.keys(trimmed).length;
const removed      = before - after;
const trimmedKeys  = Object.keys(trimmed).sort();

fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed)); // compact = smaller file

const fileSizeAfter = (fs.statSync(HISTORY_FILE).size / (1024 * 1024)).toFixed(1);

console.log(`\n✅ Done!`);
console.log(`   Removed   : ${removed} old snapshots`);
console.log(`   Kept      : ${after} snapshots`);
console.log(`   New range : ${trimmedKeys[0]} → ${trimmedKeys[trimmedKeys.length-1]}`);
console.log(`   File size : ${fileSizeBefore} MB → ${fileSizeAfter} MB`);
console.log(`\n→ You can now upload history.json to GitHub.\n`);
