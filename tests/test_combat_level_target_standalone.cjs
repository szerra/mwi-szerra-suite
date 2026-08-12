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
assert.match(source, /@version\s+1\.5\.0-szerra\.3/);
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
assert.match(source, /@grant\s+unsafeWindow/);
assert.match(
    source,
    /@require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/lz-string@1\.5\.0\/libs\/lz-string\.min\.js/
);

source = source.replace(
    /\}\)\(\);\s*$/,
    [
        "globalThis.__levelTargetTest = {",
        "calculateTargetProgress,",
        "formatSeconds,",
        "getLevelExperienceTable,",
        "startLevelExperienceTableRetry,",
        "refreshVisibleTooltips,",
        "TABLE_RETRY_INTERVAL_MS,",
        "TABLE_RETRY_LIMIT",
        "};",
        "})();",
    ].join("\n")
);

const experienceTable = [0, 0, 100, 300, 700];
const context = {
    console,
    unsafeWindow: {
        localStorage: {
            getItem(key) {
                return key === "initClientData" ? "compressed-cache" : null;
            },
        },
        localStorageUtil: {
            getInitClientData() {
                return { levelExperienceTable: experienceTable };
            },
        },
    },
    document: {
        readyState: "loading",
        addEventListener() {},
        querySelectorAll() {
            return [];
        },
    },
};
vm.runInNewContext(source, context, { filename: scriptPath });

const {
    calculateTargetProgress,
    formatSeconds,
    getLevelExperienceTable,
} =
    context.__levelTargetTest;

assert.equal(
    getLevelExperienceTable(),
    experienceTable,
    "must read the official table through the game's native cache decoder"
);

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

function loadRetryHarness() {
    let retrySource = fs.readFileSync(scriptPath, "utf8");
    retrySource = retrySource.replace(
        /function refreshVisibleTooltips\(\) \{[\s\S]*?\n    \}\n\n    function ensureTargetLevelControl/,
        [
            "function refreshVisibleTooltips() {",
            "    globalThis.__refreshVisibleTooltipsCount =",
            "        (globalThis.__refreshVisibleTooltipsCount || 0) + 1;",
            "}",
            "",
            "    function ensureTargetLevelControl",
        ].join("\n")
    );
    retrySource = retrySource.replace(
        /\}\)\(\);\s*$/,
        [
            "globalThis.__levelRetryTest = {",
            "startLevelExperienceTableRetry,",
            "TABLE_RETRY_INTERVAL_MS,",
            "TABLE_RETRY_LIMIT",
            "};",
            "})();",
        ].join("\n")
    );

    let ready = false;
    let visibleTooltipRefreshQueries = 0;
    const intervalCallbacks = [];
    const clearedIntervals = [];
    const retryContext = {
        console,
        unsafeWindow: {
            localStorage: {
                getItem() {
                    return "compressed-cache";
                },
            },
            localStorageUtil: {
                getInitClientData() {
                    return ready
                        ? { levelExperienceTable: experienceTable }
                        : { levelExperienceTable: {} };
                },
            },
        },
        setInterval(callback) {
            intervalCallbacks.push(callback);
            return intervalCallbacks.length;
        },
        clearInterval(id) {
            clearedIntervals.push(id);
        },
        document: {
            readyState: "loading",
            addEventListener() {},
            querySelectorAll() {
                visibleTooltipRefreshQueries += 1;
                return [];
            },
        },
    };
    vm.runInNewContext(retrySource, retryContext, { filename: scriptPath });
    return {
        retryContext,
        intervalCallbacks,
        clearedIntervals,
        makeReady() {
            ready = true;
        },
        getVisibleTooltipRefreshQueries() {
            return visibleTooltipRefreshQueries;
        },
    };
}

const retryHarness = loadRetryHarness();
retryHarness.retryContext.__levelRetryTest.startLevelExperienceTableRetry();
assert.equal(retryHarness.intervalCallbacks.length, 1);
assert.equal(
    retryHarness.retryContext.__levelRetryTest.TABLE_RETRY_INTERVAL_MS,
    1000
);
assert.equal(retryHarness.retryContext.__levelRetryTest.TABLE_RETRY_LIMIT, 60);
retryHarness.makeReady();
retryHarness.intervalCallbacks[0]();
assert.deepEqual(retryHarness.clearedIntervals, [1]);
assert.equal(retryHarness.getVisibleTooltipRefreshQueries(), 1);

console.log("PASS delayed official experience table recovery");

function loadFallbackHarness() {
    let fallbackSource = fs.readFileSync(scriptPath, "utf8");
    fallbackSource = fallbackSource.replace(
        /\}\)\(\);\s*$/,
        [
            "globalThis.__levelFallbackTest = {",
            "getLevelExperienceTable",
            "};",
            "})();",
        ].join("\n")
    );

    const fallbackContext = {
        console,
        unsafeWindow: {
            localStorage: {
                getItem() {
                    return "compressed-cache";
                },
            },
        },
        LZString: {
            decompressFromUTF16(value) {
                assert.equal(value, "compressed-cache");
                return JSON.stringify({ levelExperienceTable: experienceTable });
            },
        },
        document: {
            readyState: "loading",
            addEventListener() {},
        },
    };
    vm.runInNewContext(fallbackSource, fallbackContext, { filename: scriptPath });
    return fallbackContext.__levelFallbackTest.getLevelExperienceTable();
}

assert.deepEqual(
    Array.from(loadFallbackHarness()),
    Array.from(experienceTable),
    "must decode the compressed cache when the native game decoder is absent"
);
assert.match(source, /usableLevels\.length === 0/);

console.log("PASS compressed cache fallback and table validation");
