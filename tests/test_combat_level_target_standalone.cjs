const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(
    root,
    "standalone",
    "MWI-Combat-Level-Target.user.js"
);
let source = fs.readFileSync(scriptPath, "utf8");

assert.equal(
    (source.match(/\/\/ ==UserScript==/g) || []).length,
    1,
    "standalone script must contain exactly one userscript metadata block"
);
assert.match(source, /@name\s+MWI 戰鬥目標等級時間計算/);
assert.match(source, /@name:zh-TW\s+MWI 戰鬥目標等級時間計算/);
assert.match(source, /@name:zh-CN\s+MWI 战斗目标等级时间计算/);
assert.match(source, /@namespace\s+https:\/\/github\.com\/szerra\/mwi-szerra-suite/);
assert.match(source, /@version\s+1\.5\.0-szerra\.2/);
assert.match(source, /@author\s+.*DOUBAO-DiamondMoo.*Szerra/);
assert.match(source, /@homepageURL\s+https:\/\/github\.com\/szerra\/mwi-szerra-suite/);
assert.match(source, /@supportURL\s+https:\/\/github\.com\/szerra\/mwi-szerra-suite\/issues/);

const rawScriptUrl =
    "https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/" +
    "standalone/MWI-Combat-Level-Target.user.js";
assert.match(source, new RegExp(`@updateURL\\s+${rawScriptUrl.replaceAll(".", "\\.")}`));
assert.match(source, new RegExp(`@downloadURL\\s+${rawScriptUrl.replaceAll(".", "\\.")}`));
assert.doesNotMatch(source, /update\.greasyfork\.org/);

for (const match of [
    "https://www.milkywayidle.com/*",
    "https://milkywayidle.com/*",
    "https://test.milkywayidle.com/*",
    "https://www.milkywayidlecn.com/*",
    "https://milkywayidlecn.com/*",
    "https://test.milkywayidlecn.com/*",
]) {
    assert.ok(source.includes(`// @match        ${match}`), `missing @match ${match}`);
}
assert.match(source, /@grant\s+GM_getValue/);
assert.match(source, /@grant\s+GM_setValue/);

source = source.replace(
    /\}\)\(\);\s*$/,
    [
        "globalThis.__levelTargetTest = {",
        "calculateTargetProgress,",
        "formatSeconds",
        "};",
        "})();",
    ].join("\n")
);

const context = {
    console,
    document: {
        readyState: "loading",
        addEventListener() {},
    },
};
vm.runInNewContext(source, context, { filename: scriptPath });

const { calculateTargetProgress, formatSeconds } =
    context.__levelTargetTest;
const experienceTable = [0, 0, 100, 300, 700];

assert.deepEqual(
    { ...calculateTargetProgress(experienceTable, 2, 50, 4, 3600) },
    {
        status: "ready",
        targetNeedExp: 450,
        targetSeconds: 450,
    }
);
assert.equal(
    calculateTargetProgress(experienceTable, 4, 50, 4, 3600).status,
    "reached"
);
assert.equal(
    calculateTargetProgress(experienceTable, 2, 50, 5, 3600).status,
    "unavailable"
);
assert.equal(formatSeconds(90061), "1 d 1 h 1 m");
assert.match(source, /戰鬥技能目標等級/);
assert.match(source, /"攻擊": "\/skills\/attack"/);
assert.match(source, /"遠程": "\/skills\/ranged"/);

console.log("PASS standalone combat target-level calculator");
