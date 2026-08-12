const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(
  root,
  "standalone",
  "MWI-Szerra-Combat-Appearance.user.js",
);
const source = fs.readFileSync(scriptPath, "utf8");

assert.equal(
  (source.match(/\/\/ ==UserScript==/g) || []).length,
  1,
  "只能有一份 userscript metadata",
);
assert.match(source, /@version\s+1\.0\.0/);
assert.match(source, /MWI 戰鬥外觀與角色圖庫/);
assert.match(source, /__mwiCombatVfx0118Installed/);
assert.match(source, /mwi-avatar-library-v1/);
assert.match(source, /api\.milkywayidlecn\.com\/ws/);
assert.doesNotMatch(source, /MWI Battle HUD/);
assert.doesNotMatch(source, /Realtime Import Of Battle Simulation/);
assert.doesNotMatch(source, /Talent Market/);
assert.doesNotMatch(source, /mwi-guild-data-bridge:/);

console.log("standalone appearance package checks passed");
