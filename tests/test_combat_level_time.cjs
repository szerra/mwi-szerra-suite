const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.resolve(
    __dirname,
    "../vendor/combat-level-time.user.js"
);
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace(
    /\}\)\(\);\s*$/,
    [
        "globalThis.__levelTimeTest = {",
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
vm.runInNewContext(source, context, { filename: sourcePath });

const { calculateTargetProgress, formatSeconds } = context.__levelTimeTest;
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

console.log("PASS combat target-level calculator");
