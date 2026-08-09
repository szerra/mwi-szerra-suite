const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "..", "vendor", "combat-vfx.user.js");
const source = fs.readFileSync(sourcePath, "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`  function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `cannot extract ${name}`);
  return source.slice(start, end);
}

const colorMatch = source.match(
  /const PLAYER_DAMAGE_COLORS = Object\.freeze\((\[[\s\S]*?\n  \])\);/
);
assert.ok(colorMatch, "player damage palette is missing");
const colors = Function(`return ${colorMatch[1]}`)();
assert.deepEqual(colors, [
  [61, 200, 255],
  [255, 190, 54],
  [83, 226, 126],
  [190, 105, 255],
  [255, 105, 154]
]);
assert.equal(new Set(colors.map(color => color.join(","))).size, 5);

const helperSource = [
  extractFunction("initialCombatValue", "isGuildTrialStart"),
  extractFunction("isGuildTrialStart", "handleBattleMessage")
].join("\n");
const { initialCombatValue, isGuildTrialStart } = Function(
  `${helperSource}; return { initialCombatValue, isGuildTrialStart };`
)();

assert.equal(initialCombatValue({ currentHitpoints: 12 }, "currentHitpoints"), 12);
assert.equal(initialCombatValue({ combatDetails: { currentHitpoints: 34 } }, "currentHitpoints"), 34);
assert.equal(isGuildTrialStart({ monsters: [{ hrid: "/monsters/trial_badger" }] }), true);
assert.equal(isGuildTrialStart({
  monsters: [{ combatDetails: { combatMonsterHrid: "/monsters/trial_jellyfish" } }]
}), true);
assert.equal(isGuildTrialStart({ monsters: [{ hrid: "/monsters/griffin" }] }), false);

assert.match(source, /playerIndex,\s*\n\s*abilityHrid,/);
assert.match(source, /PLAYER_DAMAGE_COLORS\[effect\.playerIndex\]/);
assert.match(source, /numbersOnly: guildTrialBattle/g);
assert.match(source, /if \(!effect\.numbersOnly\)/);
assert.match(source, /guildTrialBattle \? 0 : drawAttachedAuras/);
assert.match(source, /guildTrialBattle \? 0 : drawAttachedStatuses/);
assert.match(source, /\.filter\(hit => !guildTrialBattle \|\| hit\.damage > 0\)/);
assert.match(source, /\["battle_updated", "guild_battle_updated"\]/);

console.log("PASS combat-vfx: five player colors and guild-trial numbers-only mode");
