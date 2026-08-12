import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const vfxPath = path.join(root, "vendor", "combat-vfx.user.js");
const avatarPath = path.join(root, "standalone", "avatar-library.user.js");
const outputPath = path.join(
  root,
  "standalone",
  "MWI-Szerra-Combat-Appearance.user.js",
);

function stripMetadata(source, label) {
  const stripped = source.replace(
    /^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m,
    "",
  );
  if (stripped === source) {
    throw new Error(`找不到 ${label} 的 userscript metadata`);
  }
  return stripped.trim();
}

let vfx = stripMetadata(fs.readFileSync(vfxPath, "utf8"), "戰鬥特效");
let avatar = stripMetadata(
  fs.readFileSync(avatarPath, "utf8"),
  "角色圖庫",
);

vfx = vfx.replace(
  'const WS_HOSTS = ["api.milkywayidle.com/ws", "api-test.milkywayidle.com/ws"];',
  'const WS_HOSTS = ["api.milkywayidle.com/ws", "api-test.milkywayidle.com/ws", "api.milkywayidlecn.com/ws", "api-test.milkywayidlecn.com/ws"];',
);

const avatarStartSafe = `    const begin = () => initialize().catch((error) => {
      console.error(\`[\${SCRIPT_ID}] 初始化失敗\`, error);
    });
    if (document.body) begin();
    else document.addEventListener('DOMContentLoaded', begin, { once: true });`;
const avatarStartPattern = /    initialize\(\)\.catch\(\(error\) => \{\r?\n      console\.error\(`\[\$\{SCRIPT_ID\}\] 初始化失敗`, error\);\r?\n    \}\);/;
if (!avatarStartPattern.test(avatar)) {
  throw new Error("找不到角色圖庫啟動區段");
}
avatar = avatar.replace(avatarStartPattern, avatarStartSafe);

const metadata = `// ==UserScript==
// @name         MWI 自訂角色圖庫
// @name:zh-TW   MWI 戰鬥外觀與角色圖庫
// @name:zh-CN   MWI 战斗外观与角色图库
// @namespace    https://github.com/szerra/mwi-szerra-suite
// @version      1.0.0
// @description  獨立戰鬥外觀包：只包含技能特效與自己／隊友角色圖片更換，不包含 DPS、市場、模擬器或公會資料功能。
// @author       Szerra local build
// @license      MIT
// @icon         https://www.milkywayidle.com/favicon.svg
// @homepageURL  https://github.com/szerra/mwi-szerra-suite
// @supportURL   https://github.com/szerra/mwi-szerra-suite/issues
// @updateURL    https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/standalone/MWI-Szerra-Combat-Appearance.user.js
// @downloadURL  https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/standalone/MWI-Szerra-Combat-Appearance.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==`;

const output = `${metadata}

/* ===== 戰鬥技能特效（來源版本 0.1.26） ===== */
${vfx}

/* ===== 自訂角色圖庫（來源版本 0.1.8） ===== */
${avatar}
`;

fs.writeFileSync(outputPath, output, "utf8");
console.log(`已建立 ${path.relative(root, outputPath)}`);
