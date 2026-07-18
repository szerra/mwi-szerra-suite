// ==UserScript==
// @name         MWI 戰鬥技能特效
// @namespace    codex.local.mwi.combat-vfx
// @version      0.1.16
// @description  攻擊讀條時在手前方顯示法陣，彈道同步命中，並把怪物狀態與全隊光環依實際持續時間附著在角色上。
// @author       Local build for gzerr
// @license      MIT
// @icon         https://www.milkywayidle.com/favicon.svg
// @homepageURL  https://github.com/szerra/mwi-combat-vfx
// @updateURL    https://raw.githubusercontent.com/szerra/mwi-combat-vfx/main/MWI-Combat-VFX.user.js
// @downloadURL  https://raw.githubusercontent.com/szerra/mwi-combat-vfx/main/MWI-Combat-VFX.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "0.1.16";
  const CANVAS_ID = "mwiCombatVfxCanvas0116";
  const MONSTER_UNIT_CLASS = "mwiCombatVfxMonsterUnit";
  const ORIGINAL_SPLAT_STYLE_ID = "mwiCombatVfxOriginalMonsterSplatStyle";
  const WS_HOSTS = ["api.milkywayidle.com/ws", "api-test.milkywayidle.com/ws"];
  const HP_TRAIL_CLASS = "mwiCombatVfxHpTrail";
  const HP_TRAIL_DELAY = 90;
  const HP_TRAIL_DURATION = 460;
  const hpTrailStates = new WeakMap();

  if (window.__mwiCombatVfx0116Installed) return;
  window.__mwiCombatVfx0116Installed = true;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
  const easeInOut = t => 0.5 - Math.cos(Math.PI * clamp(t)) / 2;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const fadeOut = (p, from = 0.76) => 1 - smoothstep(from, 1, p);
  const rgba = (color, alpha = 1) => `rgba(${color[0]},${color[1]},${color[2]},${clamp(alpha)})`;
  const rand = (seed, index = 0) => {
    const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  const qBezier = (a, b, c, t) => {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      y: u * u * a.y + 2 * u * t * b.y + t * t * c.y
    };
  };

  const COLORS = {
    white: [225, 244, 255],
    silver: [184, 216, 240],
    cyan: [52, 202, 255],
    water: [45, 168, 255],
    ice: [137, 229, 255],
    fire: [255, 91, 20],
    gold: [255, 190, 54],
    red: [255, 46, 62],
    purple: [177, 72, 255],
    violet: [115, 74, 255],
    green: [71, 222, 126],
    poison: [157, 226, 42],
    teal: [55, 225, 194],
    enemy: [255, 68, 80]
  };

  const PROFILES = {
    autoAttack: { style: "weapon", color: COLORS.white, duration: 720 },
    "/abilities/poke": { style: "poke", color: COLORS.silver, duration: 650 },
    "/abilities/impale": { style: "impale", color: COLORS.white, duration: 820 },
    "/abilities/puncture": { style: "puncture", color: COLORS.gold, duration: 850 },
    "/abilities/penetrating_strike": { style: "penetratingStrike", color: COLORS.red, duration: 850, chain: true },
    "/abilities/scratch": { style: "scratch", color: COLORS.red, duration: 700 },
    "/abilities/cleave": { style: "cleave", color: COLORS.cyan, duration: 900, area: true },
    "/abilities/maim": { style: "maim", color: COLORS.red, duration: 1000 },
    "/abilities/crippling_slash": { style: "cripplingSlash", color: COLORS.purple, duration: 1050, area: true },
    "/abilities/smack": { style: "smack", color: COLORS.gold, duration: 800 },
    "/abilities/sweep": { style: "sweep", color: COLORS.gold, duration: 950, area: true },
    "/abilities/stunning_blow": { style: "stunningBlow", color: COLORS.gold, duration: 1050 },
    "/abilities/fracturing_impact": { style: "fracturingImpact", color: [255, 93, 34], duration: 1100, area: true },
    "/abilities/shield_bash": { style: "shieldBash", color: [87, 180, 255], duration: 900 },

    "/abilities/quick_shot": { style: "quickShot", color: COLORS.white, duration: 620 },
    "/abilities/aqua_arrow": { style: "aquaArrow", color: COLORS.water, duration: 850 },
    "/abilities/flame_arrow": { style: "flameArrow", color: COLORS.fire, duration: 900 },
    "/abilities/rain_of_arrows": { style: "rainOfArrows", color: COLORS.silver, duration: 1200, area: true },
    "/abilities/silencing_shot": { style: "silencingShot", color: COLORS.purple, duration: 950 },
    "/abilities/steady_shot": { style: "steadyShot", color: COLORS.gold, duration: 850 },
    "/abilities/pestilent_shot": { style: "pestilentShot", color: COLORS.poison, duration: 1100 },
    "/abilities/penetrating_shot": { style: "penetratingShot", color: COLORS.cyan, duration: 850, chain: true },

    "/abilities/water_strike": { style: "waterStrike", color: COLORS.water, duration: 1000, magic: true },
    "/abilities/ice_spear": { style: "iceSpear", color: COLORS.ice, duration: 1050, magic: true },
    "/abilities/frost_surge": { style: "frostSurge", color: COLORS.ice, duration: 1250, magic: true, area: true },
    "/abilities/mana_spring": { style: "manaSpring", color: [75, 150, 255], duration: 1300, magic: true, area: true },
    "/abilities/entangle": { style: "entangle", color: COLORS.green, duration: 1150, magic: true },
    "/abilities/toxic_pollen": { style: "toxicPollen", color: COLORS.poison, duration: 1300, magic: true, area: true },
    "/abilities/natures_veil": { style: "naturesVeil", color: COLORS.teal, duration: 1300, magic: true, area: true },
    "/abilities/life_drain": { style: "lifeDrain", color: [208, 45, 123], duration: 1250, magic: true },
    "/abilities/fireball": { style: "fireball", color: COLORS.fire, duration: 1050, magic: true },
    "/abilities/flame_blast": { style: "flameBlast", color: COLORS.fire, duration: 1250, magic: true, area: true },
    "/abilities/firestorm": { style: "firestorm", color: COLORS.fire, duration: 1450, magic: true, area: true },
    "/abilities/smoke_burst": { style: "smokeBurst", color: [132, 78, 205], duration: 1200, magic: true }
  };

  const ATTACK_ABILITIES = new Set(Object.keys(PROFILES));
  const DIRECT_HEAL_ABILITIES = new Set([
    "/abilities/minor_heal",
    "/abilities/heal",
    "/abilities/quick_aid",
    "/abilities/rejuvenate",
    "/abilities/revive",
    "/abilities/life_drain"
  ]);
  // Ripple restores 10 MP in the same update that pays the completed
  // ability's mana cost. These live costs let us distinguish a real proc
  // from the separate food/drink regeneration updates without rolling the
  // displayed proc chance ourselves.
  const ABILITY_MANA_COSTS = Object.freeze({
    "/abilities/water_strike": 10,
    "/abilities/ice_spear": 45,
    "/abilities/frost_surge": 75,
    "/abilities/mana_spring": 75,
    "/abilities/entangle": 10,
    "/abilities/toxic_pollen": 45,
    "/abilities/natures_veil": 75,
    "/abilities/life_drain": 45,
    "/abilities/fireball": 10,
    "/abilities/flame_blast": 45,
    "/abilities/firestorm": 75,
    "/abilities/smoke_burst": 75,
    "/abilities/elemental_affinity": 65,
    "/abilities/critical_aura": 100,
    "/abilities/fierce_aura": 100,
    "/abilities/guardian_aura": 100,
    "/abilities/mystic_aura": 100,
    "/abilities/speed_aura": 100
  });
  const observedAbilityManaCosts = new Map();
  const STYLE_ROUTES = Object.freeze({
    weapon: "weapon",
    poke: "thrust", impale: "thrust", puncture: "thrust", penetratingStrike: "thrust",
    scratch: "slash", cleave: "slash", maim: "slash", cripplingSlash: "slash", sweep: "slash",
    smack: "blunt", stunningBlow: "blunt", fracturingImpact: "blunt", shieldBash: "blunt",
    quickShot: "arrow", aquaArrow: "arrow", flameArrow: "arrow", rainOfArrows: "arrow",
    silencingShot: "arrow", steadyShot: "arrow", pestilentShot: "arrow", penetratingShot: "arrow",
    waterStrike: "magic", iceSpear: "magic", frostSurge: "magic", manaSpring: "magic",
    entangle: "magic", toxicPollen: "magic", naturesVeil: "magic", lifeDrain: "magic",
    fireball: "magic", flameBlast: "magic", firestorm: "magic", smokeBurst: "magic"
  });
  const MAGIC_STYLES = new Set([
    "waterStrike", "iceSpear", "frostSurge", "manaSpring", "entangle", "toxicPollen",
    "naturesVeil", "lifeDrain", "fireball", "flameBlast", "firestorm", "smokeBurst"
  ]);

  const AURA_KIND_STYLES = Object.freeze({
    manaSpring: { color: [75, 150, 255], accent: COLORS.ice },
    criticalAura: { color: COLORS.gold, accent: COLORS.white },
    fierceAura: { color: COLORS.red, accent: COLORS.gold },
    guardianAura: { color: [70, 170, 255], accent: COLORS.cyan },
    mysticAura: { color: COLORS.purple, accent: COLORS.teal },
    speedAura: { color: COLORS.teal, accent: COLORS.cyan },
    elementalAffinity: { color: COLORS.violet, accent: COLORS.fire }
  });

  // 伺服器的完整 combatBuffMap 會提供真正的開始與結束時間；
  // 精簡 battle_updated 沒有附 buff 表時，才用下列官方技能時間暫時補上。
  const AURA_SPECS = Object.freeze({
    "/abilities/mana_spring": { kind: "manaSpring", target: "party", duration: 10000 },
    "/abilities/critical_aura": { kind: "criticalAura", target: "party", duration: 120000 },
    "/abilities/fierce_aura": { kind: "fierceAura", target: "party", duration: 120000 },
    "/abilities/guardian_aura": { kind: "guardianAura", target: "party", duration: 120000 },
    "/abilities/mystic_aura": { kind: "mysticAura", target: "party", duration: 120000 },
    "/abilities/speed_aura": { kind: "speedAura", target: "party", duration: 120000 },
    "/abilities/elemental_affinity": { kind: "elementalAffinity", target: "self", duration: 20000 }
  });

  // battle_updated 的精簡封包目前不會附 combatBuffMap，因此命中時先依技能的
  // 固定狀態時間顯示；只要後續收到完整 combatBuffMap，就以伺服器的 startTime
  // 與 duration 為準校正或延長。duration 在遊戲封包中使用奈秒。
  const INFERRED_STATUS_SPECS = Object.freeze({
    "/abilities/maim": [
      { kind: "bleed", duration: 9000 },
      { kind: "vulnerable", duration: 12000 }
    ],
    "/abilities/firestorm": [{ kind: "burn", duration: 6000 }],
    "/abilities/puncture": [{ kind: "armorBreak", duration: 10000 }],
    "/abilities/crippling_slash": [{ kind: "weaken", duration: 12000 }],
    "/abilities/fracturing_impact": [{ kind: "vulnerable", duration: 12000 }],
    "/abilities/ice_spear": [{ kind: "frost", duration: 8000 }],
    "/abilities/frost_surge": [{ kind: "frost", duration: 9000 }],
    "/abilities/pestilent_shot": [{ kind: "corrosion", duration: 12000 }],
    "/abilities/toxic_pollen": [{ kind: "corrosion", duration: 10000 }],
    "/abilities/smoke_burst": [{ kind: "blind", duration: 8000 }]
  });

  for (const [abilityHrid, profile] of Object.entries(PROFILES)) {
    if (!STYLE_ROUTES[profile.style]) {
      console.error(`[MWI Combat VFX ${VERSION}] 技能沒有繪圖路由：${abilityHrid} -> ${profile.style}`);
    }
  }
  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let animationFrame = 0;
  let effectSequence = 0;
  let battleGeneration = 0;
  let activeEffects = [];
  let attachedStatuses = new Map();
  let attachedAuras = new Map();
  let pageHidden = document.hidden;

  let monsterHp = [];
  let monsterMp = [];
  let monsterAtkCounter = [];
  let monsterDmgCounter = [];
  let monsterCritCounter = [];
  let playerHp = [];
  let playerMp = [];
  let playerAtkCounter = [];
  let playerDmgCounter = [];
  let playerCritCounter = [];
  let playerPreparingAbility = [];
  let playerBloomChance = [];
  let playerRippleChance = [];
  let playerBlazeChance = [];
  let pendingMonsterCasts = new Map();

  function ensureOriginalMonsterSplatStyle() {
    if (document.getElementById(ORIGINAL_SPLAT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = ORIGINAL_SPLAT_STYLE_ID;
    style.textContent = `
      .${MONSTER_UNIT_CLASS} [class*="CombatUnit_splat"][class*="CombatUnit_damage"],
      .${MONSTER_UNIT_CLASS} [class*="CombatUnit_splat"][class*="CombatUnit_miss"],
      .${MONSTER_UNIT_CLASS} [class*="CombatUnit_splat"][class*="CombatUnit_critical"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureCanvas() {
    if (!document.body) return false;
    ensureOriginalMonsterSplatStyle();
    if (canvas && canvas.isConnected) return true;
    canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = CANVAS_ID;
      Object.assign(canvas.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "201"
      });
      document.body.appendChild(canvas);
    }
    ctx = canvas.getContext("2d");
    resizeCanvas();
    return true;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(window.innerWidth * dpr));
    const height = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function findCombatUnits() {
    const playersArea = document.querySelector('[class*="BattlePanel_playersArea"]');
    const monstersArea = document.querySelector('[class*="BattlePanel_monstersArea"]');
    const visibleUnits = root => root ? Array.from(root.querySelectorAll('[class*="CombatUnit_combatUnit"]')).filter(isVisible) : [];
    let players = visibleUnits(playersArea);
    let monsters = visibleUnits(monstersArea);
    if (!players.length || !monsters.length) {
      const grids = Array.from(document.querySelectorAll('[class*="BattlePanel_combatUnitGrid"]')).filter(isVisible);
      if (!players.length && grids[0]) players = visibleUnits(grids[0]);
      if (!monsters.length && grids[1]) monsters = visibleUnits(grids[1]);
    }
    monsters.forEach(unit => unit.classList.add(MONSTER_UNIT_CLASS));
    return { players, monsters };
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function parseDisplayedMaxHp(valueElement) {
    const text = valueElement?.textContent || "";
    const separator = text.lastIndexOf("/");
    if (separator < 0) return NaN;
    const numeric = text.slice(separator + 1).replace(/[^0-9.-]/g, "");
    return Number(numeric);
  }

  function readScaleX(element, fallback) {
    const transform = window.getComputedStyle(element).transform;
    if (!transform || transform === "none") return fallback;
    const match = transform.match(/^matrix(?:3d)?\((.+)\)$/);
    if (!match) return fallback;
    const values = match[1].split(",").map(Number);
    const scaleX = values[0];
    return Number.isFinite(scaleX) ? clamp(scaleX) : fallback;
  }

  function styleDamageHpTrail(hpBar, hpFront, hpValue, trail) {
    trail.className = `${hpFront.className} ${HP_TRAIL_CLASS}`;
    Object.assign(trail.style, {
      background: "var(--color-warning, rgb(255, 91, 91))",
      width: `${hpFront.offsetWidth || hpBar.clientWidth}px`,
      height: `${hpFront.offsetHeight || hpBar.clientHeight}px`,
      transformOrigin: "left center",
      pointerEvents: "none",
      willChange: "transform"
    });

    if (window.getComputedStyle(hpBar).display.includes("grid")) {
      trail.style.gridArea = "1 / 1";
      trail.style.zIndex = "0";
      hpFront.style.zIndex = "1";
      hpValue.style.zIndex = "2";
    } else {
      if (window.getComputedStyle(hpBar).position === "static") hpBar.style.position = "relative";
      trail.style.position = "absolute";
      trail.style.top = "0";
      trail.style.left = "0";
      trail.style.zIndex = "0";
      hpFront.style.position = "relative";
      hpFront.style.zIndex = "1";
      hpValue.style.position = "relative";
      hpValue.style.zIndex = "2";
    }
  }

  // Restored from MWI-Hit-Tracker-Canvas (Artintel, BKN46, MIT), adapted to
  // hashed class names and the current grid-based Milky Way Idle HP bar. A
  // single compositor-animated trail is reused per bar so rapid hits do not
  // create stacks of DOM nodes and timers or jump back to an older HP value.
  function addDamageHpTrail(unit, previousHp, currentHp) {
    if (!unit || !(previousHp > currentHp) || currentHp < 0) return;
    const hpBar = unit.querySelector('[class*="HitpointsBar_hitpointsBar"]');
    const hpFront = hpBar?.querySelector('[class*="HitpointsBar_currentHp"]');
    const hpValue = hpBar?.querySelector('[class*="HitpointsBar_hpValue"]');
    if (!hpBar || !hpFront || !hpValue) return;

    const maxHp = parseDisplayedMaxHp(hpValue);
    if (!(maxHp > 0)) return;
    const fromRatio = clamp(previousHp / maxHp);
    const toRatio = clamp(currentHp / maxHp);
    if (!(fromRatio > toRatio)) return;

    let state = hpTrailStates.get(hpBar);
    let trail = state?.trail;
    if (!trail?.isConnected) {
      trail = document.createElement("div");
      styleDamageHpTrail(hpBar, hpFront, hpValue, trail);
      hpBar.insertBefore(trail, hpFront);
      state = { trail, animation: null, cleanupTimer: 0 };
      hpTrailStates.set(hpBar, state);
    } else {
      styleDamageHpTrail(hpBar, hpFront, hpValue, trail);
    }

    const visualRatio = state.animation ? readScaleX(trail, fromRatio) : fromRatio;
    const startRatio = clamp(Math.max(toRatio, visualRatio));
    state.animation?.cancel();
    if (state.cleanupTimer) window.clearTimeout(state.cleanupTimer);
    trail.style.transition = "none";
    trail.style.transform = `scaleX(${startRatio})`;

    if (typeof trail.animate === "function") {
      const totalDuration = HP_TRAIL_DELAY + HP_TRAIL_DURATION;
      const animation = trail.animate([
        { transform: `scaleX(${startRatio})`, offset: 0 },
        {
          transform: `scaleX(${startRatio})`,
          offset: HP_TRAIL_DELAY / totalDuration,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)"
        },
        { transform: `scaleX(${toRatio})`, offset: 1 }
      ], {
        duration: totalDuration,
        fill: "forwards"
      });
      state.animation = animation;
      animation.onfinish = () => {
        if (state.animation !== animation) return;
        state.animation = null;
        trail.remove();
        hpTrailStates.delete(hpBar);
      };
      return;
    }

    window.requestAnimationFrame(() => {
      if (!trail.isConnected) return;
      trail.style.transition = `transform ${HP_TRAIL_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1) ${HP_TRAIL_DELAY}ms`;
      trail.style.transform = `scaleX(${toRatio})`;
    });
    state.cleanupTimer = window.setTimeout(() => {
      trail.remove();
      hpTrailStates.delete(hpBar);
    }, HP_TRAIL_DELAY + HP_TRAIL_DURATION + 50);
  }

  function clearDamageHpTrails() {
    document.querySelectorAll(`.${HP_TRAIL_CLASS}`).forEach(element => {
      element.getAnimations?.().forEach(animation => animation.cancel());
      element.remove();
    });
  }

  function unitAnchor(unit, towardX = null) {
    if (!unit) return null;
    // Grouped querySelector follows DOM order, so the outer 120px model wrapper used
    // to win over the inner monster icon.  That wrapper also contains the tier and
    // action row, which made ground effects land on the skill label.  Prefer the
    // actual visible icon explicitly and only fall back to the wrapper.
    const model = unit.querySelector('[class*="CombatUnit_unitIconContainer"]')
      || unit.querySelector('[class*="CombatUnit_monsterIcon"]')
      || unit.querySelector('[class*="CombatUnit_model"]')
      || unit;
    const modelRect = model.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    let x = modelRect.left + modelRect.width / 2;
    const y = modelRect.top + modelRect.height * 0.52;
    if (Number.isFinite(towardX)) {
      x += Math.sign(towardX - x) * Math.min(28, modelRect.width * 0.28);
    }
    return {
      x,
      y,
      groundY: Math.min(unitRect.bottom - 12, modelRect.bottom - 4),
      width: modelRect.width,
      height: modelRect.height
    };
  }

  function unitEffectBounds(unit) {
    if (!unit) return null;
    const model = unit.querySelector('[class*="CombatUnit_unitIconContainer"]')
      || unit.querySelector('[class*="CombatUnit_monsterIcon"]')
      || unit.querySelector('[class*="CombatUnit_model"]')
      || unit;
    const modelRect = model.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    return {
      left: Math.max(unitRect.left + 2, modelRect.left - 2),
      top: Math.max(unitRect.top + 2, modelRect.top - 2),
      right: Math.min(unitRect.right - 2, modelRect.right + 2),
      bottom: Math.min(unitRect.bottom - 2, modelRect.bottom + 2)
    };
  }

  function unitDropBounds(unit) {
    if (!unit) return null;
    const model = unit.querySelector('[class*="CombatUnit_unitIconContainer"]')
      || unit.querySelector('[class*="CombatUnit_monsterIcon"]')
      || unit.querySelector('[class*="CombatUnit_model"]')
      || unit;
    const modelRect = model.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    return {
      left: Math.max(unitRect.left + 2, modelRect.left - 2),
      top: Math.max(0, unitRect.top - 36),
      right: Math.min(unitRect.right - 2, modelRect.right + 2),
      bottom: Math.min(unitRect.bottom - 2, modelRect.bottom + 2)
    };
  }

  function withEffectClip(bounds, draw) {
    if (!bounds) return draw();
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, width, height);
    ctx.clip();
    draw();
    ctx.restore();
  }

  function procHandPoint(anchor) {
    if (!anchor) return null;
    return {
      x: anchor.x + clamp(anchor.width * 0.23, 15, 24),
      y: anchor.y + clamp(anchor.height * 0.03, 1, 5)
    };
  }

  function targetBodyPoint(target, yOffset = 0) {
    return {
      x: target.point.x,
      y: target.point.y + yOffset
    };
  }

  function targetGroundPoint(target) {
    const anchor = target.anchor || {};
    const height = Number.isFinite(anchor.height) ? anchor.height : 90;
    const fallback = target.point.y + clamp(height * 0.44, 24, 42);
    return {
      x: target.point.x,
      y: Number.isFinite(anchor.groundY) ? Math.min(anchor.groundY, fallback) : fallback
    };
  }

  function pathGlow(points, color, alpha, width = 3, blur = 12) {
    if (!ctx || points.length < 2 || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = blur;
    ctx.strokeStyle = rgba(color, alpha * 0.68);
    ctx.lineWidth = width * 2.8;
    ctx.stroke();
    ctx.shadowBlur = blur * 0.45;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba([248, 253, 255], alpha * 0.9);
    ctx.lineWidth = Math.max(0.8, width * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  function drawTridentGlyph(center, height, color, accent, alpha, width = 1.45) {
    if (!center || alpha <= 0) return;
    const half = height / 2;
    const top = center.y - half;
    const bottom = center.y + half;
    const shoulderY = top + height * 0.30;
    const outer = height * 0.22;
    const tine = height * 0.22;

    pathGlow([
      { x: center.x, y: bottom },
      { x: center.x, y: top + height * 0.12 }
    ], color, alpha, width, 7);
    pathGlow([
      { x: center.x, y: shoulderY + height * 0.08 },
      { x: center.x - outer, y: shoulderY },
      { x: center.x - outer, y: shoulderY - tine }
    ], accent, alpha * 0.94, width * 0.86, 6);
    pathGlow([
      { x: center.x, y: shoulderY + height * 0.08 },
      { x: center.x + outer, y: shoulderY },
      { x: center.x + outer, y: shoulderY - tine }
    ], accent, alpha * 0.94, width * 0.86, 6);
    pathGlow([
      { x: center.x, y: top + height * 0.23 },
      { x: center.x, y: top }
    ], accent, alpha, width * 0.92, 7);
    discGlow(center.x, center.y + height * 0.05, height * 0.08, color, alpha * 0.36);
  }

  // 彈道專用：保留亮芯，但外光比一般符號與爆炸線條窄，避免拖尾變成粗光柱。
  function trailGlow(points, color, alpha, width = 1.25, blur = 8) {
    if (!ctx || points.length < 2 || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.shadowColor = rgba(color, alpha * 0.82);
    ctx.shadowBlur = blur;
    ctx.strokeStyle = rgba(color, alpha * 0.48);
    ctx.lineWidth = width * 1.55;
    ctx.stroke();
    ctx.shadowBlur = blur * 0.32;
    ctx.strokeStyle = rgba(color, alpha * 0.96);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba([248, 253, 255], alpha * 0.68);
    ctx.lineWidth = Math.max(0.42, width * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  function ellipseGlow(x, y, rx, ry, color, alpha, width = 2, rotation = 0) {
    if (!ctx || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rotation, 0, Math.PI * 2);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 11;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  function discGlow(x, y, radius, color, alpha) {
    if (!ctx || alpha <= 0 || radius <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
    gradient.addColorStop(0, rgba([255, 255, 255], alpha));
    gradient.addColorStop(0.28, rgba(color, alpha * 0.85));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function magicCircle(anchor, color, alpha, spin, radius = 33) {
    if (!anchor || alpha <= 0) return;
    ellipseGlow(anchor.x, anchor.groundY, radius, radius * 0.26, color, alpha, 1.6);
    ellipseGlow(anchor.x, anchor.groundY, radius * 0.68, radius * 0.16, color, alpha * 0.75, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(color, alpha * 0.8);
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const angle = spin + i * Math.PI / 4;
      const x1 = anchor.x + Math.cos(angle) * radius;
      const y1 = anchor.groundY + Math.sin(angle) * radius * 0.26;
      const x2 = anchor.x + Math.cos(angle) * (radius - 7);
      const y2 = anchor.groundY + Math.sin(angle) * (radius - 7) * 0.26;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frontCastPoint(anchor, toward) {
    if (!anchor) return null;
    const direction = Math.sign((toward?.x ?? window.innerWidth) - anchor.x) || 1;
    const reach = clamp(anchor.width * 0.32, 24, 38);
    return {
      x: anchor.x + direction * reach,
      y: anchor.y - clamp(anchor.height * 0.04, 2, 8),
      direction
    };
  }

  function verticalMagicCircle(anchor, toward, color, alpha, spin, radius = 28, progress = 1) {
    if (!anchor || alpha <= 0) return null;
    const center = frontCastPoint(anchor, toward);
    const rx = radius * 0.34;
    const ry = radius;
    ellipseGlow(center.x, center.y, rx, ry, color, alpha, 1.8);
    ellipseGlow(center.x, center.y, rx * 0.66, ry * 0.68, color, alpha * 0.72, 1.1);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(color, alpha * 0.82);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 7;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 8; i++) {
      const angle = spin + i * Math.PI / 4;
      const x1 = center.x + Math.cos(angle) * rx;
      const y1 = center.y + Math.sin(angle) * ry;
      const x2 = center.x + Math.cos(angle) * rx * 0.72;
      const y2 = center.y + Math.sin(angle) * ry * 0.72;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx + 3, ry + 3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(progress));
    ctx.stroke();
    ctx.restore();
    discGlow(center.x + center.direction * 2, center.y, 3.5, color, alpha * 0.74);
    return center;
  }

  function drawArrowGlyph(point, angle, color, alpha, scale = 1) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 8;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.fillStyle = rgba([240, 252, 255], alpha);
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(-18 * scale, 0);
    ctx.lineTo(9 * scale, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13 * scale, 0);
    ctx.lineTo(3 * scale, -5 * scale);
    ctx.lineTo(5 * scale, 0);
    ctx.lineTo(3 * scale, 5 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function sparkBurst(target, p, color, seed, count = 18, spread = 42) {
    const local = clamp((p - 0.54) / 0.34);
    const alpha = fadeOut(local, 0.42);
    if (local <= 0 || alpha <= 0) return;
    for (let i = 0; i < count; i++) {
      const angle = rand(seed, i) * Math.PI * 2;
      const distance = spread * easeOut(local) * (0.35 + rand(seed + 7, i) * 0.65);
      const end = { x: target.x + Math.cos(angle) * distance, y: target.y + Math.sin(angle) * distance };
      pathGlow([
        { x: target.x + Math.cos(angle) * distance * 0.45, y: target.y + Math.sin(angle) * distance * 0.45 },
        end
      ], color, alpha * (0.45 + rand(seed + 13, i) * 0.5), 0.8 + rand(seed + 19, i), 4);
    }
    discGlow(target.x, target.y, 7 + 13 * (1 - local), color, alpha);
  }

  function impactRing(target, p, color, seed, radius = 38) {
    const local = clamp((p - 0.52) / 0.4);
    const alpha = fadeOut(local, 0.45);
    if (local <= 0 || alpha <= 0) return;
    ellipseGlow(target.x, target.y, 6 + radius * easeOut(local), 6 + radius * easeOut(local), color, alpha, 1.7);
    sparkBurst(target, p, color, seed, 12, radius);
  }

  function drawDamage(effect, p) {
    if (p < 0.58) return;
    const local = clamp((p - 0.58) / 0.42);
    const alpha = 1 - smoothstep(0.62, 1, local);
    for (const target of effect.targets) {
      if (!(target.damage > 0) && !target.miss) continue;
      const label = target.miss ? "MISS" : String(Math.round(target.damage));
      const size = target.miss ? 16 : clamp(13 + Math.log10(target.damage + 1) * 2.7, 13, 24);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.font = `500 ${size}px "Arial Narrow", "Roboto Condensed", "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1.25, size * 0.075);
      ctx.strokeStyle = target.miss
        ? rgba([53, 64, 82], alpha * 0.82)
        : rgba([26, 42, 54], alpha * 0.86);
      const y = target.point.y - 29 - easeOut(local) * 19;
      ctx.strokeText(label, target.point.x, y);
      ctx.fillStyle = target.miss
        ? rgba([207, 221, 239], alpha)
        : rgba(effect.profile.color, alpha);
      ctx.fillText(label, target.point.x, y);
      ctx.restore();
    }
  }

  function bloomPetal(x, y, angle, length, width, color, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 9;
    ctx.fillStyle = rgba(color, alpha * 0.82);
    ctx.beginPath();
    ctx.ellipse(length * 0.48, 0, Math.max(1, length * 0.52), Math.max(1, width), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawProcText(text, x, y, color, outline, alpha, size = 18) {
    if (!text || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `900 ${size}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * 0.22);
    ctx.strokeStyle = rgba(outline, alpha * 0.96);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = rgba(color, alpha);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawWeaponProcRain(bounds, anchor, p, seed, kind) {
    if (!bounds || !anchor) return;
    const water = kind === "water";
    const color = water ? [103, 203, 255] : [105, 255, 151];
    const accent = water ? [211, 249, 255] : [225, 255, 205];
    const alpha = smoothstep(0, 0.08, p) * fadeOut(p, 0.82);
    if (alpha <= 0.01) return;
    const left = bounds.left + 7;
    const right = bounds.right - 7;
    const top = bounds.top + 4;
    const groundY = Math.min(bounds.bottom - 6, Number.isFinite(anchor.groundY) ? anchor.groundY : bounds.bottom - 8);
    const bottom = Math.max(top + 12, groundY - 1);
    const count = water ? 13 : 15;

    for (let i = 0; i < count; i++) {
      const speed = 1.22 + rand(seed + 17, i) * 0.58;
      const phase = (p * speed + rand(seed + 31, i)) % 1;
      const localAlpha = alpha
        * smoothstep(0, 0.08, phase)
        * (1 - smoothstep(0.84, 1, phase));
      const lane = rand(seed + 47, i);
      const x = lerp(left, right, lane) + Math.sin(p * 8 + i * 1.7) * 1.5;
      const y = lerp(top, bottom, phase);
      const size = 2.1 + rand(seed + 61, i) * 2.0;

      if (water) {
        pathGlow([
          { x, y: y - 8 - size },
          { x: x - 0.8, y: y - size * 1.25 }
        ], color, localAlpha * 0.32, 0.65, 3);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(x, y);
        ctx.fillStyle = rgba(color, localAlpha * 0.72);
        ctx.strokeStyle = rgba(accent, localAlpha * 0.92);
        ctx.shadowColor = rgba(color, localAlpha);
        ctx.shadowBlur = 6;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.8);
        ctx.bezierCurveTo(size * 0.95, -size * 0.45, size * 0.86, size * 0.78, 0, size);
        ctx.bezierCurveTo(-size * 0.86, size * 0.78, -size * 0.95, -size * 0.45, 0, -size * 1.8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(x, y);
        ctx.strokeStyle = rgba(i % 3 ? color : accent, localAlpha * 0.92);
        ctx.shadowColor = rgba(color, localAlpha);
        ctx.shadowBlur = 6;
        ctx.lineWidth = 1.15;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.30);
        ctx.lineTo(0, size * 1.30);
        ctx.moveTo(-size * 1.30, 0);
        ctx.lineTo(size * 1.30, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (water) {
      for (let i = 0; i < 3; i++) {
        const x = lerp(left + 5, right - 5, rand(seed + 83, i));
        ellipseGlow(x, groundY, 3 + i * 1.6, 1.0 + i * 0.45, accent, alpha * (0.36 - i * 0.06), 0.7, p * 3 + i);
      }
    } else {
      ellipseGlow(anchor.x, groundY, 8 + easeOut(p) * 12, 2.4 + easeOut(p) * 3.2, color, alpha * 0.34, 0.9, -p * 2.4);
    }
  }

  function drawBloomHeal(effect, p) {
    const target = effect.targets[0];
    if (!target) return;
    const color = effect.profile.color;
    const flower = [158, 255, 188];
    const targetPoint = target.point;
    const alpha = fadeOut(p, 0.75);
    const handAlpha = alpha * (0.72 + 0.28 * Math.sin(Math.PI * clamp(p / 0.7)));

    // The weapon mark belongs to the caster. Keep it small, in front of the
    // hand and clipped to that player's portrait so it never covers a teammate.
    withEffectClip(effect.casterBounds, () => {
      drawTridentGlyph(effect.casterHand, 44, color, flower, handAlpha, 1.35);
      discGlow(effect.casterHand.x, effect.casterHand.y, 5.5, COLORS.teal, handAlpha * 0.42);
    });

    const bloom = clamp((p - 0.10) / 0.44);
    const bloomAlpha = fadeOut(p, 0.76);
    if (bloom <= 0 || bloomAlpha <= 0) return;
    const open = easeOut(bloom);
    const center = { x: targetPoint.x, y: targetPoint.y + 8 };

    // The healed character receives a compact rain of green healing crosses.
    // It stays inside that party slot and never covers a neighbouring player.
    withEffectClip(target.bounds, () => {
      drawWeaponProcRain(target.bounds, target.anchor, p, effect.seed + target.index * 37, "heal");
      discGlow(center.x, center.y, 5 + open * 5, color, bloomAlpha * 0.42);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(center.x, center.y - 5);
      ctx.strokeStyle = rgba(flower, bloomAlpha * 0.82);
      ctx.shadowColor = rgba(color, bloomAlpha);
      ctx.shadowBlur = 8;
      ctx.lineCap = "round";
      ctx.lineWidth = 1.7;
      const crossSize = 5 + open * 3;
      ctx.beginPath();
      ctx.moveTo(0, -crossSize);
      ctx.lineTo(0, crossSize);
      ctx.moveTo(-crossSize, 0);
      ctx.lineTo(crossSize, 0);
      ctx.stroke();
      ctx.restore();
    });

    if (p > 0.28) {
      const local = clamp((p - 0.28) / 0.55);
      const textAlpha = 1 - smoothstep(0.64, 1, local);
      const y = targetPoint.y - 38 - easeOut(local) * 22;
      withEffectClip(target.bounds, () => {
        drawProcText(`+${Math.round(effect.healing)}`, targetPoint.x, y, [174, 255, 204], [23, 73, 55], textAlpha, 19);
      });
    }
  }

  function drawRippleProc(effect, p) {
    const color = [71, 166, 255];
    const accent = [177, 241, 255];
    const alpha = fadeOut(p, 0.76);
    const open = easeOut(clamp(p / 0.55));
    withEffectClip(effect.casterBounds, () => {
      drawTridentGlyph(effect.casterHand, 43, color, accent, alpha, 1.35);
      discGlow(effect.casterHand.x, effect.casterHand.y, 5.5, color, alpha * 0.44);
      drawWeaponProcRain(effect.casterBounds, effect.sourceAnchor, p, effect.seed, "water");
      const groundY = effect.sourceAnchor.groundY;
      ellipseGlow(effect.sourceAnchor.x, groundY, 7 + open * 14, 2 + open * 3, color, alpha * 0.46, 1.0, p * 2.4);

      if (p > 0.18) {
        const textLocal = clamp((p - 0.18) / 0.62);
        const textAlpha = 1 - smoothstep(0.62, 1, textLocal);
        const y = Math.max(effect.casterBounds.top + 12, effect.sourceAnchor.y - 30 - easeOut(textLocal) * 13);
        drawProcText("+10 MP", effect.sourceAnchor.x, y, accent, [17, 58, 106], textAlpha, 15);
      }
    });
  }

  function drawBlazeProc(effect, p) {
    const fire = [255, 91, 24];
    const core = [255, 224, 123];
    const alpha = fadeOut(p, 0.76);
    withEffectClip(effect.casterBounds, () => {
      drawTridentGlyph(effect.casterHand, 43, fire, core, alpha, 1.35);
      discGlow(effect.casterHand.x, effect.casterHand.y, 5.5, fire, alpha * 0.46);
    });

    const travel = easeInOut(clamp((p - 0.02) / 0.34));
    const projectileAlpha = 1 - smoothstep(0.40, 0.58, p);
    const impact = clamp((p - 0.30) / 0.36);
    const impactAlpha = fadeOut(impact, 0.56);
    effect.targets.forEach((target, index) => {
      const control = {
        x: (effect.casterHand.x + target.point.x) / 2,
        y: Math.min(effect.casterHand.y, target.point.y) - 18 - index * 3
      };
      const headT = travel;
      const tailT = Math.max(0, travel - 0.16);
      const trail = [];
      for (let step = 0; step <= 16; step++) {
        trail.push(qBezier(effect.casterHand, control, target.point, lerp(tailT, headT, step / 16)));
      }
      const head = qBezier(effect.casterHand, control, target.point, headT);
      if (travel < 0.995 && projectileAlpha > 0.01) {
        trailGlow(trail, fire, projectileAlpha * 0.82, 0.72, 5);
        discGlow(head.x, head.y, 4.3, fire, projectileAlpha * 0.92);
        discGlow(head.x, head.y, 2.0, core, projectileAlpha * 0.96);
        for (let ember = 0; ember < 3; ember++) {
          const angle = p * 14 + ember * Math.PI * 2 / 3 + index;
          discGlow(
            head.x + Math.cos(angle) * (3.5 + ember),
            head.y + Math.sin(angle) * (2.5 + ember * 0.7),
            0.9 + ember * 0.35,
            ember === 1 ? core : fire,
            projectileAlpha * 0.62
          );
        }
      }
      if (impact > 0) {
        withEffectClip(target.bounds, () => {
          discGlow(target.point.x, target.point.y, 4 + (1 - impact) * 5, fire, impactAlpha * 0.78);
          ellipseGlow(target.point.x, target.point.y, 5 + easeOut(impact) * 13, 5 + easeOut(impact) * 13, core, impactAlpha * 0.58, 0.9);
          sparkBurst(target.point, 0.56 + impact * 0.30, fire, effect.seed + index * 29, 8, 21);
        });
      }
    });
  }

  function projectileCurve(effect, target, p, height = 28) {
    const travel = easeInOut(clamp((p - 0.16) / 0.48));
    const control = {
      x: (effect.start.x + target.point.x) / 2,
      y: Math.min(effect.start.y, target.point.y) - height
    };
    const points = [];
    const headT = travel;
    const tailT = Math.max(0, headT - 0.25);
    for (let i = 0; i <= 22; i++) points.push(qBezier(effect.start, control, target.point, lerp(tailT, headT, i / 22)));
    return { travel, control, points, head: qBezier(effect.start, control, target.point, headT) };
  }

  function drawWeapon(effect, p) {
    for (const target of effect.targets) {
      const curve = projectileCurve(effect, target, p, 8);
      const alpha = p < 0.67 ? 1 : fadeOut(p, 0.68);
      trailGlow(curve.points, COLORS.white, alpha, 1.15, 7);
      if (curve.travel > 0.04 && curve.travel < 0.98) {
        const angle = Math.atan2(target.point.y - effect.start.y, target.point.x - effect.start.x);
        drawArrowGlyph(curve.head, angle, COLORS.white, alpha, 0.85);
      }
      if (p > 0.52) {
        for (let i = -1; i <= 1; i++) {
          const a = -0.8 + i * 0.36;
          pathGlow([
            { x: target.point.x - Math.cos(a) * 23, y: target.point.y - Math.sin(a) * 23 },
            { x: target.point.x + Math.cos(a) * 23, y: target.point.y + Math.sin(a) * 23 }
          ], COLORS.white, fadeOut(p, 0.70), 2.1, 8);
        }
        impactRing(target.point, p, COLORS.white, effect.seed, 26);
      }
    }
  }

  function drawThrust(effect, p, mode) {
    const targets = mode === "penetratingStrike" ? effect.targets : effect.targets.slice(0, 1);
    const allPoints = [effect.start, ...targets.map(target => target.point)];
    const travel = easeInOut(clamp((p - 0.14) / 0.45));
    const endIndex = (allPoints.length - 1) * travel;
    const idx = Math.min(allPoints.length - 2, Math.floor(endIndex));
    const partial = endIndex - idx;
    const head = {
      x: lerp(allPoints[idx].x, allPoints[idx + 1].x, partial),
      y: lerp(allPoints[idx].y, allPoints[idx + 1].y, partial)
    };
    const width = mode === "poke" ? 0.85 : mode === "impale" ? 1.75 : 1.25;
    trailGlow([effect.start, head], effect.profile.color, fadeOut(p, 0.67), width, 8);
    if (mode === "impale") {
      for (let i = 0; i < 3; i++) ellipseGlow(head.x - i * 13, head.y, 5 + i * 5, 16 + i * 5, COLORS.white, fadeOut(p, 0.64) * 0.7, 1.2);
    }
    for (const target of targets) {
      if (p > 0.50) impactRing(target.point, p, effect.profile.color, effect.seed + target.index * 17, mode === "impale" ? 44 : 30);
      if (mode === "puncture" && p > 0.56) drawCrackedShield(target.point, p, effect.profile.color);
    }
  }

  function drawCrackedShield(point, p, color) {
    const alpha = fadeOut(p, 0.78);
    ctx.save();
    ctx.translate(point.x, point.y - 15);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(color, alpha);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -15); ctx.lineTo(12, -9); ctx.lineTo(9, 9); ctx.lineTo(0, 17); ctx.lineTo(-9, 9); ctx.lineTo(-12, -9); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(-2, -1); ctx.lineTo(5, 3); ctx.lineTo(-4, 14); ctx.stroke();
    ctx.restore();
  }

  function drawSlash(effect, p, mode) {
    const targets = effect.targets;
    const alpha = fadeOut(p, 0.75);
    if (["cleave", "cripplingSlash", "sweep"].includes(mode)) {
      if (!targets.length) return;
      const sorted = targets.map(t => t.point).sort((a, b) => a.x - b.x);
      const left = sorted[0];
      const right = sorted[sorted.length - 1];
      const centerY = sorted.reduce((sum, point) => sum + point.y, 0) / sorted.length;
      const start = { x: left.x - 38, y: centerY + (mode === "cripplingSlash" ? 26 : 18) };
      const end = { x: right.x + 38, y: centerY + (mode === "cripplingSlash" ? 26 : 18) };
      const control = { x: (left.x + right.x) / 2, y: centerY - (mode === "sweep" ? 26 : 34) };
      const progress = easeOut(clamp((p - 0.25) / 0.35));
      const points = [];
      for (let i = 0; i <= 28; i++) points.push(qBezier(start, control, end, progress * i / 28));
      pathGlow(points, effect.profile.color, alpha, mode === "sweep" ? 4.2 : 3.2, mode === "sweep" ? 13 : 11);
      for (const target of targets) {
        if (p > 0.50) impactRing(target.point, p, effect.profile.color, effect.seed + target.index * 11, 30);
        if (mode === "cripplingSlash" && p > 0.58) drawDownGlyph(target.point, p, COLORS.purple);
      }
      return;
    }
    for (const target of targets.slice(0, 1)) {
      const travel = easeInOut(clamp((p - 0.12) / 0.38));
      const dash = { x: lerp(effect.start.x, target.point.x, travel), y: lerp(effect.start.y, target.point.y, travel) };
      trailGlow([effect.start, dash], effect.profile.color, alpha * 0.35, 0.78, 5);
      const count = mode === "scratch" ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 9;
        const angle = -0.76 + i * 0.12;
        pathGlow([
          { x: target.point.x - 31 * Math.cos(angle), y: target.point.y - 31 * Math.sin(angle) + offset },
          { x: target.point.x + 31 * Math.cos(angle), y: target.point.y + 31 * Math.sin(angle) + offset }
        ], effect.profile.color, p > 0.43 ? alpha : 0, mode === "maim" ? 5 : 3, 11);
      }
      if (p > 0.49) impactRing(target.point, p, effect.profile.color, effect.seed, 31);
      if (mode === "maim" && p > 0.56) drawBleed(target.point, p, effect.seed);
    }
  }

  function drawBleed(point, p, seed) {
    const local = clamp((p - 0.56) / 0.44);
    const alpha = fadeOut(local, 0.62);
    ctx.save();
    ctx.fillStyle = rgba(COLORS.red, alpha);
    ctx.shadowColor = rgba(COLORS.red, alpha);
    ctx.shadowBlur = 7;
    for (let i = 0; i < 5; i++) {
      const x = point.x + (rand(seed, i) - 0.5) * 35;
      const y = point.y + 7 + local * (18 + rand(seed + 3, i) * 22);
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + rand(seed + 5, i) * 2, 4 + rand(seed + 7, i) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDownGlyph(point, p, color) {
    const alpha = fadeOut(p, 0.82);
    pathGlow([{ x: point.x, y: point.y - 38 }, { x: point.x, y: point.y - 18 }], color, alpha, 2.5, 7);
    pathGlow([{ x: point.x - 6, y: point.y - 25 }, { x: point.x, y: point.y - 18 }, { x: point.x + 6, y: point.y - 25 }], color, alpha, 2.5, 7);
  }

  function drawBlunt(effect, p, mode) {
    if (mode === "fracturingImpact") return drawFracturing(effect, p);
    if (mode === "sweep") return drawSlash(effect, p, "sweep");
    for (const target of effect.targets.slice(0, 1)) {
      const travel = easeInOut(clamp((p - 0.12) / 0.42));
      const head = { x: lerp(effect.start.x, target.point.x, travel), y: lerp(effect.start.y, target.point.y, travel) };
      if (mode === "shieldBash") {
        drawShield(head, effect.profile.color, fadeOut(p, 0.68), 0.85 + travel * 0.3);
      } else {
        trailGlow([effect.start, head], effect.profile.color, fadeOut(p, 0.68) * 0.48, mode === "smack" ? 1.55 : 1.95, 8);
      }
      if (p > 0.50) {
        impactRing(target.point, p, effect.profile.color, effect.seed, mode === "stunningBlow" ? 49 : 38);
        if (mode === "stunningBlow") drawStunStars(target.point, p, effect.seed);
      }
    }
  }

  function drawShield(point, color, alpha, scale = 1) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(scale, scale);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(color, alpha);
    ctx.fillStyle = rgba(color, alpha * 0.22);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(16, -12); ctx.lineTo(13, 11); ctx.lineTo(0, 22); ctx.lineTo(-13, 11); ctx.lineTo(-16, -12); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawStunStars(point, p, seed) {
    const local = clamp((p - 0.54) / 0.46);
    const alpha = fadeOut(local, 0.68);
    ctx.save();
    ctx.fillStyle = rgba(COLORS.gold, alpha);
    ctx.shadowColor = rgba(COLORS.gold, alpha);
    ctx.shadowBlur = 8;
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + local * 2.8;
      const x = point.x + Math.cos(angle) * 26;
      const y = point.y - 28 + Math.sin(angle) * 8;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const r = k % 2 ? 2.2 : 5.2;
        const a = k * Math.PI / 4;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawFracturing(effect, p) {
    const local = clamp((p - 0.34) / 0.5);
    const alpha = fadeOut(local, 0.7);
    for (const target of effect.targets) {
      const ground = targetGroundPoint(target);
      discGlow(ground.x, ground.y, 12 + 20 * local, effect.profile.color, alpha * 0.8);
      for (let i = 0; i < 8; i++) {
        const angle = rand(effect.seed + target.index, i) * Math.PI * 2;
        const distance = 20 + rand(effect.seed + 8, i) * 42;
        pathGlow([ground, { x: ground.x + Math.cos(angle) * distance * local, y: ground.y + Math.sin(angle) * distance * 0.35 * local }], effect.profile.color, alpha, 1.6, 5);
      }
      if (p > 0.52) impactRing(target.point, p, effect.profile.color, effect.seed + target.index, 38);
      if (p > 0.60) drawDownGlyph(target.point, p, COLORS.red);
    }
  }

  function drawArrow(effect, p, mode) {
    if (mode === "rainOfArrows") return drawArrowRain(effect, p);
    const targets = ["penetratingShot"].includes(mode) ? effect.targets : effect.targets.slice(0, 1);
    const ordered = targets.slice().sort((a, b) => a.point.x - b.point.x);
    const final = ordered[ordered.length - 1];
    if (!final) return;
    const travel = easeInOut(clamp((p - 0.12) / 0.47));
    const head = { x: lerp(effect.start.x, final.point.x, travel), y: lerp(effect.start.y, final.point.y, travel) };
    const tail = { x: lerp(effect.start.x, final.point.x, Math.max(0, travel - 0.28)), y: lerp(effect.start.y, final.point.y, Math.max(0, travel - 0.28)) };
    const color = effect.profile.color;
    trailGlow([tail, head], color, fadeOut(p, 0.67), mode === "quickShot" ? 0.78 : 1.1, mode === "quickShot" ? 5 : 7);
    const angle = Math.atan2(final.point.y - effect.start.y, final.point.x - effect.start.x);
    drawArrowGlyph(head, angle, color, fadeOut(p, 0.67), mode === "steadyShot" ? 1.15 : 0.9);
    if (mode === "flameArrow") drawEmberTrail(effect, tail, head, p);
    if (mode === "aquaArrow") drawWaterWake(effect, tail, head, p);
    if (mode === "steadyShot") {
      ellipseGlow(head.x, head.y, 13, 13, COLORS.gold, fadeOut(p, 0.69), 1.4);
      ellipseGlow(head.x, head.y, 24, 24, COLORS.gold, fadeOut(p, 0.69) * 0.75, 1);
    }
    for (const target of ordered) {
      if (p > 0.50) impactRing(target.point, p, color, effect.seed + target.index * 13, 31);
      if (mode === "silencingShot" && p > 0.57) drawMuteGlyph(target.point, p, color);
      if (mode === "pestilentShot" && p > 0.54) {
        drawPoisonCloud(target.point, p, effect.seed, COLORS.poison);
        drawCrackedShield(target.point, p, COLORS.poison);
      }
    }
  }

  function drawArrowRain(effect, p) {
    const local = clamp((p - 0.22) / 0.62);
    const alpha = fadeOut(p, 0.82);
    for (const target of effect.targets) {
      for (let i = 0; i < 8; i++) {
        const delay = i * 0.055;
        const fall = easeOut(clamp((local - delay) / 0.45));
        const x = target.point.x + (rand(effect.seed + target.index, i) - 0.5) * 72;
        const startY = target.point.y - 135 - rand(effect.seed + 4, i) * 45;
        const bodySpread = Math.min(34, target.anchor.height * 0.38);
        const endY = target.point.y + (rand(effect.seed + 8, i) - 0.5) * bodySpread;
        const y = lerp(startY, endY, fall);
        drawArrowGlyph({ x, y }, Math.PI / 2, COLORS.silver, alpha, 0.7);
        if (fall > 0.92) discGlow(x, endY, 4, COLORS.cyan, alpha * 0.8);
      }
      if (p > 0.55) impactRing(target.point, p, COLORS.cyan, effect.seed + target.index, 28);
    }
  }

  function drawEmberTrail(effect, tail, head, p) {
    const alpha = fadeOut(p, 0.72);
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const x = lerp(tail.x, head.x, t);
      const y = lerp(tail.y, head.y, t) + (rand(effect.seed, i) - 0.5) * 11;
      discGlow(x, y, 1.3 + rand(effect.seed + 3, i) * 2.2, COLORS.fire, alpha * (0.35 + t * 0.55));
    }
  }

  function drawWaterWake(effect, tail, head, p) {
    const alpha = fadeOut(p, 0.72);
    const dx = head.x - tail.x;
    const dy = head.y - tail.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    for (const sign of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const wave = Math.sin(t * Math.PI * 5 + effect.seed) * 5 * sign;
        points.push({ x: lerp(tail.x, head.x, t) + nx * wave, y: lerp(tail.y, head.y, t) + ny * wave });
      }
      trailGlow(points, COLORS.water, alpha * 0.68, 0.68, 4);
    }
  }

  function drawMuteGlyph(point, p, color) {
    const alpha = fadeOut(p, 0.82);
    ellipseGlow(point.x, point.y - 21, 17, 17, color, alpha, 1.5);
    pathGlow([{ x: point.x - 10, y: point.y - 31 }, { x: point.x + 10, y: point.y - 11 }], color, alpha, 2.2, 7);
    pathGlow([{ x: point.x - 10, y: point.y - 11 }, { x: point.x + 10, y: point.y - 31 }], color, alpha, 2.2, 7);
  }

  function drawPoisonCloud(point, p, seed, color) {
    const local = clamp((p - 0.50) / 0.5);
    const alpha = fadeOut(local, 0.66);
    for (let i = 0; i < 13; i++) {
      const angle = rand(seed, i) * Math.PI * 2;
      const distance = easeOut(local) * (10 + rand(seed + 5, i) * 35);
      discGlow(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance * 0.65, 3 + rand(seed + 9, i) * 8, color, alpha * 0.45);
    }
  }

  function drawMagicProjectile(effect, p, mode) {
    const castAlpha = clamp(p / 0.16) * (1 - smoothstep(0.48, 0.70, p));
    if (effect.targets[0]) {
      verticalMagicCircle(effect.sourceAnchor, effect.targets[0].point, effect.profile.color, castAlpha, p * 8 + effect.seed, 27);
    }

    if (["frostSurge", "manaSpring", "toxicPollen", "naturesVeil", "flameBlast", "firestorm"].includes(mode)) {
      return drawMagicArea(effect, p, mode);
    }
    if (mode === "entangle") return drawEntangle(effect, p);
    if (mode === "lifeDrain") return drawLifeDrain(effect, p);

    for (const target of effect.targets.slice(0, 1)) {
      if (mode === "iceSpear") {
        const curve = projectileCurve(effect, target, p, 14);
        trailGlow(curve.points, COLORS.ice, fadeOut(p, 0.70), 1.25, 8);
        const angle = Math.atan2(target.point.y - effect.start.y, target.point.x - effect.start.x);
        ctx.save(); ctx.translate(curve.head.x, curve.head.y); ctx.rotate(angle); ctx.fillStyle = rgba([230, 253, 255], fadeOut(p, 0.70));
        ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(-9, -6); ctx.lineTo(-3, 0); ctx.lineTo(-9, 6); ctx.closePath(); ctx.fill(); ctx.restore();
        if (p > 0.52) {
          impactRing(target.point, p, COLORS.ice, effect.seed, 41);
          drawSnowflake(target.point, p, COLORS.ice);
        }
      } else if (mode === "smokeBurst") {
        const curve = projectileCurve(effect, target, p, 18);
        trailGlow(curve.points, effect.profile.color, fadeOut(p, 0.67), 1.15, 8);
        for (let i = 0; i < 9; i++) discGlow(curve.head.x + (rand(effect.seed, i) - 0.5) * 22, curve.head.y + (rand(effect.seed + 4, i) - 0.5) * 22, 4 + rand(effect.seed + 8, i) * 8, [80, 54, 115], fadeOut(p, 0.70) * 0.52);
        if (p > 0.50) {
          drawPoisonCloud(target.point, p, effect.seed, [105, 76, 135]);
          drawMuteGlyph(target.point, p, effect.profile.color);
        }
      } else if (mode === "waterStrike") {
        const curve = projectileCurve(effect, target, p, 31);
        trailGlow(curve.points, COLORS.water, fadeOut(p, 0.70), 1.25, 8);
        drawWaterWake(effect, curve.points[0], curve.head, p);
        if (p > 0.52) {
          impactRing(target.point, p, COLORS.water, effect.seed, 44);
          drawWaterSplash(target.point, p, effect.seed);
        }
      } else if (mode === "fireball") {
        const curve = projectileCurve(effect, target, p, 26);
        trailGlow(curve.points, COLORS.fire, fadeOut(p, 0.70), 1.55, 9);
        discGlow(curve.head.x, curve.head.y, 9, COLORS.fire, fadeOut(p, 0.70));
        drawEmberTrail(effect, curve.points[0], curve.head, p);
        if (p > 0.52) {
          impactRing(target.point, p, COLORS.fire, effect.seed, 48);
          sparkBurst(target.point, p, COLORS.gold, effect.seed + 23, 22, 54);
        }
      } else {
        console.error(`[MWI Combat VFX ${VERSION}] 法術沒有繪圖函式：${mode}`);
      }
    }
  }

  function drawWaterSplash(point, p, seed) {
    const local = clamp((p - 0.50) / 0.45);
    const alpha = fadeOut(local, 0.60);
    for (let i = 0; i < 12; i++) {
      const angle = lerp(-Math.PI * 0.92, -Math.PI * 0.08, i / 11);
      const distance = easeOut(local) * (24 + rand(seed, i) * 32);
      const end = { x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance };
      pathGlow([point, end], COLORS.water, alpha, 1.3, 5);
      discGlow(end.x, end.y, 1.8, COLORS.ice, alpha);
    }
  }

  function drawSnowflake(point, p, color) {
    const alpha = fadeOut(p, 0.84);
    const center = { x: point.x, y: point.y - 30 };
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI / 3;
      const dx = Math.cos(angle) * 12;
      const dy = Math.sin(angle) * 12;
      pathGlow([{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }], color, alpha, 1.4, 5);
    }
  }

  function drawMagicArea(effect, p, mode) {
    const ready = clamp((p - 0.12) / 0.24) * (1 - smoothstep(0.82, 1, p));
    const erupt = easeOut(clamp((p - 0.34) / 0.34));
    const alpha = fadeOut(p, 0.82);
    for (const target of effect.targets) {
      const drawTargetEffect = () => {
        const body = targetBodyPoint(target);
        // This is an impact lock around the monster body, not a floor casting circle.
        // The attack casting circle already appears in front of the caster's hand.
        ellipseGlow(body.x, body.y, 17 + ready * 12, 22 + ready * 15, effect.profile.color, ready * 0.42, 1.25, -p * 2.4 - target.index);
        if (mode === "frostSurge") drawIceEruption(target, erupt, alpha, effect.seed);
        if (mode === "manaSpring") drawManaFountain(effect, target, erupt, alpha);
        if (mode === "toxicPollen") drawToxicDust(target, erupt, alpha, effect.seed);
        if (mode === "naturesVeil") drawSporeVeil(target, erupt, alpha, effect.seed);
        if (mode === "flameBlast") drawLavaEruption(target, erupt, alpha, effect.seed);
        if (mode === "firestorm") drawFirestorm(target, p, alpha, effect.seed);
        if (p > 0.52) impactRing(target.point, p, effect.profile.color, effect.seed + target.index * 9, mode === "firestorm" ? 46 : 35);
      };
      if (mode === "frostSurge" || mode === "manaSpring") withEffectClip(target.dropBounds || target.bounds, drawTargetEffect);
      else drawTargetEffect();
    }
  }

  function drawIceEruption(target, progress, alpha, seed) {
    const anchor = target.anchor || {};
    const center = targetBodyPoint(target);
    const width = Number.isFinite(anchor.width) ? anchor.width : 100;
    const height = Number.isFinite(anchor.height) ? anchor.height : 100;
    const crystalWidth = clamp(width * 0.78, 58, 82);
    const crystalHeight = clamp(height * 0.90, 76, 102);
    const fall = easeInOut(clamp(progress / 0.62));
    const crash = clamp((progress - 0.62) / 0.38);
    const intactAlpha = alpha * (1 - smoothstep(0.04, 0.58, crash));
    const bounds = target.dropBounds || target.bounds;
    const startY = bounds
      ? (target.precast ? bounds.top + crystalHeight * 0.72 : bounds.top - crystalHeight * 0.25)
      : center.y - height * 0.9;
    const impactY = center.y - clamp(height * 0.14, 8, 16);
    const blockY = lerp(startY, impactY, Math.pow(fall, 1.7));
    const blockX = center.x + Math.sin(progress * Math.PI * 3 + target.index) * 2.2 * (1 - fall);

    if (intactAlpha > 0.02) {
      const circleY = bounds
        ? Math.min(blockY - crystalHeight * 0.55 - 5, bounds.top + 18)
        : blockY - crystalHeight * 0.64;
      const summonAlpha = intactAlpha * (1 - smoothstep(0.40, 0.82, fall));

      // A horizontal summoning seal opens above each monster's own card.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(blockX, circleY);
      ctx.rotate(progress * 1.8 + target.index * 0.17);
      ctx.strokeStyle = rgba([210, 251, 255], summonAlpha * 0.90);
      ctx.shadowColor = rgba(COLORS.ice, summonAlpha);
      ctx.shadowBlur = 9;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(0, 0, crystalWidth * 0.52, 7.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -progress * 34;
      ctx.strokeStyle = rgba(COLORS.ice, summonAlpha * 0.86);
      ctx.beginPath();
      ctx.ellipse(0, 0, crystalWidth * 0.39, 4.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const x1 = Math.cos(angle) * crystalWidth * 0.30;
        const y1 = Math.sin(angle) * 3.6;
        const x2 = Math.cos(angle) * crystalWidth * 0.45;
        const y2 = Math.sin(angle) * 6.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      for (let i = 0; i < 5; i++) {
        const streakX = blockX + (i - 2) * crystalWidth * 0.17;
        const start = circleY + 3 + rand(seed + target.index * 19, i) * 5;
        const end = Math.min(blockY - crystalHeight * 0.42, start + 18 + fall * 28);
        pathGlow([
          { x: streakX, y: start },
          { x: streakX + Math.sin(i * 2.1) * 1.5, y: end }
        ], [194, 246, 255], intactAlpha * 0.32, 0.7, 4);
      }

      for (let i = 0; i < 4; i++) {
        const streakX = blockX + (i - 1.5) * crystalWidth * 0.21;
        const streakLength = 12 + rand(seed + target.index * 13, i) * 18;
        pathGlow([
          { x: streakX, y: blockY - crystalHeight * 0.48 - streakLength },
          { x: streakX, y: blockY - crystalHeight * 0.48 - 2 }
        ], COLORS.ice, intactAlpha * 0.38, 0.8, 4);
      }

      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const fragmentX = blockX + side * crystalWidth * (0.42 + rand(seed + 73, i) * 0.16);
        const fragmentY = blockY - crystalHeight * 0.32 + rand(seed + 89, i) * crystalHeight * 0.70;
        const size = 1.4 + rand(seed + 97, i) * 2.4;
        ctx.save();
        ctx.translate(fragmentX, fragmentY);
        ctx.rotate(progress * 4 + i);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba([220, 252, 255], intactAlpha * 0.64);
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.8);
        ctx.lineTo(size * 0.65, 0);
        ctx.lineTo(0, size * 1.8);
        ctx.lineTo(-size * 0.65, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(blockX, blockY);
      ctx.rotate((rand(seed + target.index, 2) - 0.5) * 0.10 * (1 - fall));
      ctx.shadowColor = rgba(COLORS.ice, intactAlpha);
      ctx.shadowBlur = 14;
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.8;

      const sx = crystalWidth;
      const sy = crystalHeight;
      const silhouette = [
        [-0.33, -0.33], [-0.24, -0.54], [-0.11, -0.43], [-0.02, -0.68],
        [0.10, -0.46], [0.25, -0.61], [0.29, -0.38], [0.45, -0.25],
        [0.36, -0.02], [0.30, 0.16], [0.21, 0.48], [0.10, 0.30],
        [0.00, 0.70], [-0.10, 0.36], [-0.22, 0.57], [-0.25, 0.17],
        [-0.39, 0.30], [-0.34, 0.01], [-0.48, -0.19]
      ];
      const tracePolygon = points => {
        ctx.beginPath();
        points.forEach(([x, y], index) => {
          if (index === 0) ctx.moveTo(x * sx, y * sy);
          else ctx.lineTo(x * sx, y * sy);
        });
        ctx.closePath();
      };

      const iceGradient = ctx.createLinearGradient(0, -sy * 0.68, 0, sy * 0.70);
      iceGradient.addColorStop(0, rgba([205, 250, 255], intactAlpha * 0.58));
      iceGradient.addColorStop(0.48, rgba([42, 166, 235], intactAlpha * 0.56));
      iceGradient.addColorStop(1, rgba([22, 110, 205], intactAlpha * 0.62));
      ctx.fillStyle = iceGradient;
      ctx.strokeStyle = rgba([231, 252, 255], intactAlpha * 0.94);
      tracePolygon(silhouette);
      ctx.fill();
      ctx.stroke();

      const facets = [
        { fill: [219, 251, 255], a: 0.27, p: [[-0.24, -0.54], [-0.02, -0.68], [-0.05, -0.04], [-0.33, -0.33]] },
        { fill: [116, 218, 255], a: 0.23, p: [[-0.02, -0.68], [0.25, -0.61], [0.13, -0.09], [-0.05, -0.04]] },
        { fill: [16, 91, 190], a: 0.28, p: [[0.25, -0.61], [0.45, -0.25], [0.13, -0.09]] },
        { fill: [201, 248, 255], a: 0.20, p: [[-0.48, -0.19], [-0.05, -0.04], [-0.25, 0.17], [-0.39, 0.30]] },
        { fill: [109, 211, 255], a: 0.25, p: [[-0.05, -0.04], [0.13, -0.09], [0.10, 0.30], [0.00, 0.70], [-0.10, 0.36]] },
        { fill: [16, 83, 181], a: 0.26, p: [[0.13, -0.09], [0.36, -0.02], [0.21, 0.48], [0.10, 0.30]] },
        { fill: [188, 242, 255], a: 0.18, p: [[-0.25, 0.17], [-0.05, -0.04], [-0.10, 0.36], [-0.22, 0.57]] }
      ];
      for (const facet of facets) {
        ctx.fillStyle = rgba(facet.fill, intactAlpha * facet.a);
        ctx.strokeStyle = rgba([226, 252, 255], intactAlpha * 0.20);
        ctx.lineWidth = 0.65;
        tracePolygon(facet.p);
        ctx.fill();
        ctx.stroke();
      }

      // Luminous fractures converge on the snowflake core.
      ctx.strokeStyle = rgba([234, 254, 255], intactAlpha * (0.48 + fall * 0.44));
      ctx.shadowColor = rgba([113, 224, 255], intactAlpha);
      ctx.shadowBlur = 7;
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(-sx * 0.04, -sy * 0.02);
      ctx.lineTo(-sx * 0.20, -sy * 0.25);
      ctx.lineTo(-sx * 0.11, -sy * 0.43);
      ctx.moveTo(sx * 0.02, -sy * 0.03);
      ctx.lineTo(sx * 0.18, -sy * 0.26);
      ctx.lineTo(sx * 0.25, -sy * 0.52);
      ctx.moveTo(0, sy * 0.02);
      ctx.lineTo(sx * 0.08, sy * 0.27);
      ctx.lineTo(0, sy * 0.62);
      ctx.moveTo(-sx * 0.03, sy * 0.02);
      ctx.lineTo(-sx * 0.23, sy * 0.21);
      ctx.lineTo(-sx * 0.37, sy * 0.26);
      ctx.stroke();

      // Six-armed snowflake embedded in the crystal.
      const coreY = -sy * 0.02;
      const coreRadius = clamp(sx * 0.12, 7, 10);
      ctx.strokeStyle = rgba([243, 255, 255], intactAlpha * 0.98);
      ctx.lineWidth = 1.15;
      ctx.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI / 3;
        const dx = Math.cos(angle) * coreRadius;
        const dy = Math.sin(angle) * coreRadius;
        ctx.beginPath();
        ctx.moveTo(-dx, coreY - dy);
        ctx.lineTo(dx, coreY + dy);
        for (const direction of [-1, 1]) {
          const px = Math.cos(angle) * coreRadius * 0.56 * direction;
          const py = Math.sin(angle) * coreRadius * 0.56 * direction;
          const branch = coreRadius * 0.26;
          ctx.moveTo(px, coreY + py);
          ctx.lineTo(px + Math.cos(angle + Math.PI * 0.72) * branch * direction, coreY + py + Math.sin(angle + Math.PI * 0.72) * branch * direction);
          ctx.moveTo(px, coreY + py);
          ctx.lineTo(px + Math.cos(angle - Math.PI * 0.72) * branch * direction, coreY + py + Math.sin(angle - Math.PI * 0.72) * branch * direction);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    if (crash <= 0) return;
    const burstAlpha = alpha * (1 - smoothstep(0.60, 1, crash));
    const burstCenter = { x: center.x, y: impactY + crystalHeight * 0.16 };
    discGlow(burstCenter.x, burstCenter.y, 10 + easeOut(crash) * 20, COLORS.ice, burstAlpha * 0.68);
    ellipseGlow(burstCenter.x, burstCenter.y + 7, 12 + easeOut(crash) * 28, 6 + easeOut(crash) * 13, [224, 251, 255], burstAlpha * 0.72, 1.5);

    for (let i = 0; i < 12; i++) {
      const random = rand(seed + target.index * 31, i);
      const angle = lerp(-Math.PI * 0.94, -Math.PI * 0.06, random);
      const distance = easeOut(crash) * (12 + rand(seed + 17, i) * 40);
      const shardX = burstCenter.x + Math.cos(angle) * distance;
      const shardY = burstCenter.y + Math.sin(angle) * distance + crash * crash * 14;
      const shardSize = 3.5 + rand(seed + 29, i) * 5.5;
      const rotation = angle + crash * (rand(seed + 41, i) - 0.5) * 3.2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(shardX, shardY);
      ctx.rotate(rotation);
      ctx.fillStyle = rgba(i % 3 ? COLORS.ice : [235, 253, 255], burstAlpha * 0.68);
      ctx.strokeStyle = rgba([239, 254, 255], burstAlpha * 0.9);
      ctx.lineWidth = 0.8;
      ctx.shadowColor = rgba(COLORS.ice, burstAlpha);
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(shardSize * 1.55, 0);
      ctx.lineTo(-shardSize * 0.22, shardSize * 0.30);
      ctx.lineTo(-shardSize * 0.72, 0);
      ctx.lineTo(-shardSize * 0.22, -shardSize * 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawManaFountain(effect, target, progress, alpha) {
    const base = targetGroundPoint(target);
    const rise = easeOut(clamp(progress / 0.42));
    const bloom = easeOut(clamp((progress - 0.18) / 0.48));
    const settle = smoothstep(0.56, 1, progress);
    const fountainHeight = 47;
    const apex = { x: base.x, y: base.y - fountainHeight * rise };

    // Rotating mana basin: a liquid-looking pool with an inner rune ring.
    ellipseGlow(base.x, base.y + 2, 12 + bloom * 23, 4 + bloom * 5, [80, 185, 255], alpha * 0.68, 1.45, progress * 2.4);
    ellipseGlow(base.x, base.y + 1, 7 + bloom * 14, 2.5 + bloom * 3.6, [150, 105, 255], alpha * 0.54, 1.0, -progress * 3.1);
    discGlow(base.x, base.y - 1, 4 + bloom * 7, [118, 226, 255], alpha * 0.54);

    // Several narrow jets twist together before opening at the top.
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * 3.2;
      const sway = Math.sin(progress * Math.PI * 5 + i * 1.4) * 2.2;
      const start = { x: base.x + offset, y: base.y };
      const control = { x: base.x - offset * 0.8 + sway, y: lerp(base.y, apex.y, 0.56) };
      const end = { x: apex.x + offset * 0.32, y: apex.y + Math.abs(offset) * 0.18 };
      const points = [];
      for (let step = 0; step <= 16; step++) points.push(qBezier(start, control, end, step / 16));
      pathGlow(points, i % 2 ? [113, 205, 255] : [194, 248, 255], alpha * (0.62 + rise * 0.24), 1.15 + (i === 2 ? 0.55 : 0), 7);
    }

    // At the crest the mana fans out, then falls back as curved luminous water.
    if (bloom > 0.01) {
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1;
        const lane = i % 4;
        const spread = 13 + lane * 6.2;
        const start = { x: apex.x + side * (lane * 0.8), y: apex.y + lane * 0.7 };
        const control = {
          x: apex.x + side * spread * 0.64,
          y: apex.y - (10 + lane * 1.8) * bloom
        };
        const end = {
          x: base.x + side * spread * bloom,
          y: base.y - 2 - (1 - bloom) * 23 + settle * 3
        };
        const points = [];
        const visible = clamp(bloom * 1.18);
        for (let step = 0; step <= 18; step++) points.push(qBezier(start, control, end, visible * step / 18));
        pathGlow(points, lane % 2 ? [91, 166, 255] : [138, 234, 255], alpha * (0.58 - lane * 0.055), 1.05, 6);
      }

      for (let i = 0; i < 9; i++) {
        const angle = i * 2.399 + progress * 3.2;
        const radius = 8 + (i % 4) * 6;
        const particle = {
          x: apex.x + Math.cos(angle) * radius * bloom,
          y: apex.y + Math.sin(angle) * radius * 0.42 * bloom + settle * 8
        };
        discGlow(particle.x, particle.y, 1.2 + (i % 3) * 0.55, i % 3 ? [123, 221, 255] : [177, 119, 255], alpha * 0.56);
      }
    }

    // A small diamond rune makes it read as mana rather than ordinary water.
    if (rise > 0.35) {
      const runeY = apex.y - 7;
      const runeSize = 4 + bloom * 2.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(apex.x, runeY);
      ctx.rotate(Math.PI / 4 + progress * 1.8);
      ctx.strokeStyle = rgba([211, 251, 255], alpha * 0.84);
      ctx.shadowColor = rgba([112, 174, 255], alpha);
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.05;
      ctx.strokeRect(-runeSize, -runeSize, runeSize * 2, runeSize * 2);
      ctx.restore();
    }

    const returnT = easeInOut(clamp((progress - 0.46) / 0.54));
    if (returnT > 0) {
      const control = { x: (base.x + effect.start.x) / 2, y: Math.min(base.y, effect.start.y) - 34 };
      const points = [];
      for (let i = 0; i <= 18; i++) points.push(qBezier(base, control, effect.start, returnT * i / 18));
      pathGlow(points, [106, 181, 255], alpha * 0.34, 1.0, 6);
    }
  }

  function drawToxicDust(target, progress, alpha, seed) {
    for (let i = 0; i < 18; i++) {
      const angle = rand(seed + target.index, i) * Math.PI * 2;
      const distance = progress * (10 + rand(seed + 4, i) * 48);
      discGlow(target.point.x + Math.cos(angle) * distance, target.point.y + Math.sin(angle) * distance * 0.65, 2 + rand(seed + 9, i) * 6, COLORS.poison, alpha * 0.48);
    }
    drawCrackedShield(target.point, 0.60 + progress * 0.2, COLORS.poison);
  }

  function drawSporeVeil(target, progress, alpha, seed) {
    for (let i = 0; i < 16; i++) {
      const x = target.point.x + (rand(seed + target.index, i) - 0.5) * 78 * progress;
      const y = target.point.y + (rand(seed + 5, i) - 0.5) * 82 * progress;
      discGlow(x, y, 2 + rand(seed + 8, i) * 4, COLORS.teal, alpha * 0.62);
    }
    const eye = { x: target.point.x, y: target.point.y - 32 };
    ellipseGlow(eye.x, eye.y, 13, 8, COLORS.teal, alpha, 1.6);
    pathGlow([{ x: eye.x - 11, y: eye.y - 9 }, { x: eye.x + 11, y: eye.y + 9 }], COLORS.teal, alpha, 2, 6);
  }

  function drawLavaEruption(target, progress, alpha, seed) {
    const base = targetBodyPoint(target, 7);
    discGlow(base.x, base.y, 10 + progress * 15, COLORS.fire, alpha * 0.76);
    for (let i = 0; i < 9; i++) {
      const angle = lerp(-Math.PI * 0.88, -Math.PI * 0.12, i / 8);
      const distance = progress * (28 + rand(seed + target.index, i) * 48);
      pathGlow([base, { x: base.x + Math.cos(angle) * distance, y: base.y + Math.sin(angle) * distance }], COLORS.fire, alpha, 2 + rand(seed, i) * 2, 10);
    }
    drawFracturing({ targets: [target], profile: { color: COLORS.fire }, seed }, 0.42 + progress * 0.28);
  }

  function drawFirestorm(target, p, alpha, seed) {
    const local = easeOut(clamp((p - 0.28) / 0.48));
    const center = targetBodyPoint(target, 4);
    const ground = targetGroundPoint(target);
    ellipseGlow(ground.x, ground.y, 19 + local * 24, 5 + local * 6, COLORS.fire, alpha * 0.42, 1.3, p * 2.2);
    for (let ring = 0; ring < 3; ring++) {
      const points = [];
      for (let i = 0; i <= 30; i++) {
        const q = i / 30;
        const angle = q * Math.PI * 2.3 + p * 8 + ring * 1.7;
        const radius = (18 + ring * 12) * local * (0.7 + q * 0.3);
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y - (q - 0.42) * (36 + ring * 6) + Math.sin(angle) * radius * 0.42
        });
      }
      pathGlow(points, ring === 1 ? COLORS.gold : COLORS.fire, alpha * (0.72 - ring * 0.12), 2.5 + ring, 13);
    }
  }

  function drawVineLeaf(point, angle, size, alpha, color = COLORS.green) {
    if (!point || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 6;
    ctx.fillStyle = rgba(color, alpha * 0.76);
    ctx.strokeStyle = rgba([222, 255, 154], alpha * 0.74);
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.48, -size * 0.48, size, 0);
    ctx.quadraticCurveTo(size * 0.48, size * 0.48, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.lineTo(size * 0.82, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawEntangle(effect, p) {
    for (const target of effect.targets.slice(0, 1)) {
      const travel = easeInOut(clamp((p - 0.17) / 0.38));
      const trailAlpha = fadeOut(p, 0.76);
      const source = { x: effect.start.x, y: effect.start.y };
      const end = targetBodyPoint(target, clamp(target.anchor.height * 0.18, 10, 18));

      for (let strand = 0; strand < 3; strand++) {
        const phase = effect.seed * 0.07 + strand * 2.15;
        const control = {
          x: (source.x + end.x) / 2,
          y: Math.min(source.y, end.y) - 22 + (strand - 1) * 13
        };
        const headT = clamp(travel - strand * 0.025);
        const tailT = Math.max(0, headT - 0.58);
        const strandPoint = t => {
          const point = qBezier(source, control, end, t);
          const tx = 2 * (1 - t) * (control.x - source.x) + 2 * t * (end.x - control.x);
          const ty = 2 * (1 - t) * (control.y - source.y) + 2 * t * (end.y - control.y);
          const length = Math.hypot(tx, ty) || 1;
          const wave = Math.sin(t * Math.PI * 6 + phase) * (2.6 + strand * 0.65);
          point.x += -ty / length * wave;
          point.y += tx / length * wave;
          return { point, angle: Math.atan2(ty, tx) };
        };
        const points = [];
        for (let i = 0; i <= 28; i++) points.push(strandPoint(lerp(tailT, headT, i / 28)).point);
        trailGlow(points, strand === 1 ? [184, 240, 64] : COLORS.green, trailAlpha * (0.72 + strand * 0.1), 0.78 + strand * 0.12, 6);

        for (let leaf = 0; leaf < 3; leaf++) {
          const t = headT - 0.12 - leaf * 0.16 + strand * 0.018;
          if (t <= tailT + 0.03 || t >= headT - 0.02) continue;
          const sample = strandPoint(t);
          const side = (leaf + strand) % 2 ? 1 : -1;
          drawVineLeaf(sample.point, sample.angle + side * 0.72, 5.5 + leaf * 0.8, trailAlpha * 0.88, leaf === 1 ? [202, 245, 74] : COLORS.green);
        }
      }

      const bind = easeOut(clamp((p - 0.47) / 0.32));
      const bindAlpha = fadeOut(p, 0.87);
      if (bind <= 0 || bindAlpha <= 0) continue;
      const ground = targetGroundPoint(target);
      ellipseGlow(ground.x, ground.y, 13 + bind * 24, 4 + bind * 6, [176, 238, 57], bindAlpha * 0.74, 1.05, p * 1.4);
      ellipseGlow(ground.x, ground.y, 8 + bind * 15, 2 + bind * 4, COLORS.green, bindAlpha * 0.64, 0.8, -p * 1.8);

      for (let root = 0; root < 6; root++) {
        const angle = lerp(Math.PI * 0.94, Math.PI * 2.06, root / 5);
        const reach = (22 + rand(effect.seed + 91, root) * 17) * bind;
        const tip = { x: ground.x + Math.cos(angle) * reach, y: ground.y + Math.sin(angle) * reach * 0.24 };
        const control = { x: lerp(ground.x, tip.x, 0.52), y: ground.y - 7 - rand(effect.seed + 101, root) * 9 };
        const points = [];
        for (let i = 0; i <= 12; i++) points.push(qBezier(ground, control, tip, i / 12));
        trailGlow(points, root % 2 ? COLORS.green : [190, 239, 58], bindAlpha * 0.72, 0.78, 5);
      }

      for (let vine = 0; vine < 4; vine++) {
        const height = (42 + vine * 8 + rand(effect.seed + 131, vine) * 13) * bind;
        const phase = effect.seed * 0.09 + vine * 1.67 + p * 2.1;
        const points = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const radius = 3.5 + t * (5.5 + vine * 0.55);
          points.push({
            x: ground.x + (vine - 1.5) * 4.2 * (1 - t) + Math.sin(t * Math.PI * 3.25 + phase) * radius,
            y: ground.y - height * t
          });
        }
        trailGlow(points, vine % 2 ? [190, 239, 58] : COLORS.green, bindAlpha * (0.68 + vine * 0.06), 0.82 + vine * 0.08, 6);
        for (const leafT of [0.34, 0.62, 0.84]) {
          const index = Math.min(points.length - 1, Math.round(leafT * (points.length - 1)));
          const point = points[index];
          const previous = points[Math.max(0, index - 1)];
          const angle = Math.atan2(point.y - previous.y, point.x - previous.x) + ((index + vine) % 2 ? 0.78 : -0.78);
          drawVineLeaf(point, angle, 5.5 + vine * 0.45, bindAlpha * 0.82, vine % 2 ? [202, 245, 74] : COLORS.green);
        }
      }

      for (let coil = 0; coil < 3; coil++) {
        const y = ground.y - bind * (13 + coil * 18);
        ellipseGlow(ground.x, y, 10 + coil * 3.2, 3.2 + coil * 0.8, coil === 1 ? [210, 250, 78] : COLORS.green, bindAlpha * (0.72 - coil * 0.1), 0.85, p * (coil % 2 ? -2 : 2));
      }

      const haloAlpha = bindAlpha * smoothstep(0.48, 0.92, bind);
      ellipseGlow(target.point.x, target.point.y - 48, 17, 4.3, [215, 252, 73], haloAlpha, 1.15, p * 1.5);
      discGlow(ground.x, ground.y - 3, 8 + bind * 8, COLORS.green, bindAlpha * 0.38);
    }
  }

  function drawLifeDrain(effect, p) {
    for (const target of effect.targets.slice(0, 1)) {
      const local = clamp((p - 0.22) / 0.60);
      const alpha = fadeOut(p, 0.84);
      const control = { x: (target.point.x + effect.start.x) / 2, y: Math.min(target.point.y, effect.start.y) - 36 };
      const points = [];
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        const point = qBezier(target.point, control, effect.start, t);
        point.y += Math.sin(t * Math.PI * 7 + p * 10) * 5;
        points.push(point);
      }
      trailGlow(points, [220, 43, 116], alpha * clamp(local * 3), 1.3, 9);
      for (let i = 0; i < 8; i++) {
        const t = (local + i / 8) % 1;
        const point = qBezier(target.point, control, effect.start, t);
        discGlow(point.x, point.y, 2.5 + rand(effect.seed, i) * 2.5, t > 0.7 ? COLORS.green : [220, 43, 116], alpha);
      }
      if (p > 0.52) impactRing(target.point, p, [220, 43, 116], effect.seed, 32);
      if (p > 0.58) discGlow(effect.start.x, effect.start.y, 13, COLORS.green, alpha * 0.75);
    }
  }

  function drawEnemyAttack(effect, p) {
    for (const target of effect.targets) {
      const curve = projectileCurve(effect, target, p, 18);
      trailGlow(curve.points, COLORS.enemy, fadeOut(p, 0.70), 1.15, 7);
      if (p > 0.52) impactRing(target.point, p, COLORS.enemy, effect.seed + target.index, 29);
    }
  }

  function drawCastingEffect(effect, p) {
    const appear = smoothstep(0, 0.12, p);
    const disappear = 1 - smoothstep(0.90, 1, p);
    const alpha = appear * disappear * (0.76 + Math.sin(p * Math.PI * 10) * 0.12);
    const radius = 31 + Math.sin(p * Math.PI * 4) * 3;
    if (!effect.supportCast && effect.towardPoint) {
      const castCenter = verticalMagicCircle(
        effect.sourceAnchor,
        effect.towardPoint,
        effect.profile.color,
        alpha,
        p * Math.PI * 5 + effect.seed,
        radius,
        p
      );
      drawSpellCharge(effect, p, alpha, castCenter);
      if (effect.profile.style === "frostSurge" && effect.targets?.length) {
        const dropAlpha = smoothstep(0, 0.08, p) * (1 - smoothstep(0.97, 1, p));
        const dropProgress = clamp(p / 0.97) * 0.60;
        for (const target of effect.targets) {
          withEffectClip(target.dropBounds || target.bounds, () => {
            drawIceEruption(target, dropProgress, dropAlpha, effect.seed);
          });
        }
      }
      return;
    }

    magicCircle(effect.sourceAnchor, effect.profile.color, alpha, p * Math.PI * 5 + effect.seed, radius);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(effect.profile.color, alpha * 0.92);
    ctx.shadowColor = rgba(effect.profile.color, alpha);
    ctx.shadowBlur = 9;
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(
      effect.sourceAnchor.x,
      effect.sourceAnchor.groundY,
      radius + 7,
      (radius + 7) * 0.27,
      0,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * p
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawChargeShard(point, angle, size, color, alpha) {
    if (!point || alpha <= 0) return;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba(color, alpha * 0.48);
    ctx.strokeStyle = rgba([235, 253, 255], alpha * 0.94);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.65, size * 0.36);
    ctx.lineTo(-size * 0.28, 0);
    ctx.lineTo(-size * 0.65, -size * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSpellCharge(effect, p, alpha, center) {
    if (!center || alpha <= 0) return;
    const style = effect.profile.style;
    const phase = p * Math.PI * 4 + effect.seed;
    const grow = easeOut(clamp(p / 0.34));
    const pulse = 0.82 + Math.sin(phase * 1.7) * 0.12;
    const chargeAlpha = alpha * pulse;
    const forwardX = center.x + center.direction * (7 + grow * 7);
    const charge = { x: forwardX, y: center.y };

    if (style === "waterStrike" || style === "manaSpring") {
      discGlow(charge.x, charge.y, 4 + grow * (style === "manaSpring" ? 8 : 6), COLORS.water, chargeAlpha * 0.58);
      for (let i = 0; i < (style === "manaSpring" ? 5 : 3); i++) {
        const orbit = phase + i * Math.PI * 2 / (style === "manaSpring" ? 5 : 3);
        const radius = 9 + grow * 7 + (i % 2) * 3;
        drawStatusDrop(
          charge.x + Math.cos(orbit) * radius,
          charge.y + Math.sin(orbit) * radius,
          2.2 + (i % 2),
          i % 2 ? COLORS.cyan : COLORS.water,
          chargeAlpha * 0.78
        );
      }
      return;
    }

    if (style === "iceSpear" || style === "frostSurge") {
      const count = style === "frostSurge" ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 7;
        const shardPoint = {
          x: charge.x - center.direction * (i % 2) * 3,
          y: charge.y + offset
        };
        drawChargeShard(shardPoint, center.direction < 0 ? Math.PI : 0, 7 + grow * 5 - Math.abs(offset) * 0.12, COLORS.ice, chargeAlpha * 0.86);
      }
      if (style === "frostSurge") {
        for (let i = 0; i < 4; i++) {
          const orbit = phase * 0.7 + i * Math.PI / 2;
          drawStatusSnowflake(charge.x + Math.cos(orbit) * 20, charge.y + Math.sin(orbit) * 20, 2.7, chargeAlpha * 0.72, orbit);
        }
      }
      return;
    }

    if (style === "entangle") {
      for (let strand = 0; strand < 2; strand++) {
        const points = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          points.push({
            x: center.x + center.direction * t * (13 + grow * 13),
            y: center.y + Math.sin(t * Math.PI * 3 + phase + strand * Math.PI) * (5 + grow * 4)
          });
        }
        pathGlow(points, strand ? [186, 240, 60] : COLORS.green, chargeAlpha * 0.72, 0.9, 5);
      }
      return;
    }

    if (style === "toxicPollen" || style === "naturesVeil") {
      const color = style === "toxicPollen" ? COLORS.poison : COLORS.teal;
      const accent = style === "toxicPollen" ? [218, 245, 75] : [146, 255, 218];
      for (let i = 0; i < 10; i++) {
        const orbit = phase * (0.42 + i * 0.018) + rand(effect.seed, i) * Math.PI * 2;
        const radius = 5 + grow * (9 + rand(effect.seed + 7, i) * 14);
        const drift = Math.sin(phase + i) * 4;
        discGlow(charge.x + Math.cos(orbit) * radius, charge.y + Math.sin(orbit) * radius + drift, 1.5 + rand(effect.seed + 13, i) * 3.5, i % 3 ? color : accent, chargeAlpha * 0.55);
      }
      return;
    }

    if (style === "lifeDrain") {
      discGlow(charge.x, charge.y, 5 + grow * 9, [208, 45, 123], chargeAlpha * 0.68);
      for (let strand = 0; strand < 2; strand++) {
        const points = [];
        for (let i = 0; i <= 18; i++) {
          const t = i / 18;
          const orbit = phase + strand * Math.PI + t * Math.PI * 2.4;
          points.push({ x: charge.x + Math.cos(orbit) * (4 + t * 15), y: charge.y + Math.sin(orbit) * (4 + t * 10) });
        }
        pathGlow(points, strand ? COLORS.purple : [255, 58, 116], chargeAlpha * 0.62, 1, 6);
      }
      return;
    }

    if (style === "fireball" || style === "flameBlast" || style === "firestorm") {
      const fireSize = style === "firestorm" ? 12 : style === "flameBlast" ? 10 : 8;
      drawStatusFlame(charge.x, charge.y + 2, fireSize * (0.58 + grow * 0.42), chargeAlpha * 0.92, phase);
      const emberCount = style === "firestorm" ? 8 : style === "flameBlast" ? 6 : 4;
      for (let i = 0; i < emberCount; i++) {
        const orbit = phase * (style === "firestorm" ? 0.9 : 0.55) + i * Math.PI * 2 / emberCount;
        const radius = 10 + grow * (style === "firestorm" ? 18 : 11);
        discGlow(charge.x + Math.cos(orbit) * radius, charge.y + Math.sin(orbit) * radius * 0.72, 1.4 + (i % 3), i % 2 ? COLORS.fire : COLORS.gold, chargeAlpha * 0.68);
      }
      if (style === "firestorm") ellipseGlow(charge.x, charge.y, 15 + grow * 16, 7 + grow * 8, COLORS.fire, chargeAlpha * 0.64, 1.4, phase);
      return;
    }

    if (style === "smokeBurst") {
      for (let i = 0; i < 9; i++) {
        const orbit = phase * 0.28 + rand(effect.seed, i) * Math.PI * 2;
        const radius = 4 + grow * (8 + rand(effect.seed + 5, i) * 17);
        discGlow(charge.x + Math.cos(orbit) * radius, charge.y + Math.sin(orbit) * radius * 0.72 - grow * (i % 3) * 3, 3 + rand(effect.seed + 9, i) * 5, i % 3 ? [132, 78, 205] : [72, 52, 112], chargeAlpha * 0.38);
      }
    }
  }

  function drawStatusDrop(x, y, size, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = rgba(color, alpha);
    ctx.shadowColor = rgba(color, alpha);
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.5);
    ctx.bezierCurveTo(size * 0.9, -size * 0.35, size, size * 0.4, 0, size);
    ctx.bezierCurveTo(-size, size * 0.4, -size * 0.9, -size * 0.35, 0, -size * 1.5);
    ctx.fill();
    ctx.restore();
  }

  function drawStatusFlame(x, y, size, alpha, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba(COLORS.fire, alpha * 0.82);
    ctx.shadowColor = rgba(COLORS.fire, alpha);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -size * (1.3 + Math.sin(phase) * 0.16));
    ctx.bezierCurveTo(size * 0.75, -size * 0.55, size * 0.85, size * 0.35, 0, size * 0.72);
    ctx.bezierCurveTo(-size * 0.85, size * 0.35, -size * 0.7, -size * 0.45, 0, -size * 1.3);
    ctx.fill();
    ctx.fillStyle = rgba([255, 221, 71], alpha * 0.9);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.64);
    ctx.bezierCurveTo(size * 0.34, -size * 0.2, size * 0.32, size * 0.3, 0, size * 0.45);
    ctx.bezierCurveTo(-size * 0.32, size * 0.3, -size * 0.32, -size * 0.18, 0, -size * 0.64);
    ctx.fill();
    ctx.restore();
  }

  function drawStatusSnowflake(x, y, radius, alpha, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(COLORS.ice, alpha);
    ctx.shadowColor = rgba(COLORS.ice, alpha);
    ctx.shadowBlur = 7;
    ctx.lineWidth = 1.5;
    for (let arm = 0; arm < 3; arm++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAttachedStatus(status, anchor, now) {
    const wallNow = Date.now();
    const fadeInAlpha = clamp((wallNow - status.createdAt) / 220);
    const fadeOutAlpha = Number.isFinite(status.endAt) ? clamp((status.endAt - wallNow) / 420) : 1;
    const alpha = Math.min(fadeInAlpha, fadeOutAlpha) * 0.92;
    if (alpha <= 0) return;

    const phase = now * 0.001 + status.seed;
    const pulse = 0.72 + Math.sin(phase * 4.2) * 0.18;
    const point = { x: anchor.x, y: anchor.y };

    if (status.kind === "bleed") {
      for (let i = 0; i < 7; i++) {
        const fall = (phase * (0.42 + rand(status.seed, i) * 0.18) + rand(status.seed + 5, i)) % 1;
        const x = point.x + (rand(status.seed + 11, i) - 0.5) * Math.max(30, anchor.width * 0.54);
        const y = point.y - anchor.height * 0.24 + fall * anchor.height * 0.76;
        drawStatusDrop(x, y, 2.5 + rand(status.seed + 17, i) * 2.2, COLORS.red, alpha * (1 - fall * 0.3));
      }
      const slashPhase = phase % 1.35;
      if (slashPhase < 0.28) {
        const local = slashPhase / 0.28;
        pathGlow([
          { x: point.x - 24, y: point.y - 22 },
          { x: point.x + 24, y: point.y + 16 }
        ], COLORS.red, alpha * Math.sin(local * Math.PI) * 0.72, 2.8, 9);
      }
      return;
    }

    if (status.kind === "burn") {
      const baseY = anchor.groundY - 2;
      for (let i = 0; i < 6; i++) {
        const drift = (phase * (0.38 + rand(status.seed, i) * 0.18) + rand(status.seed + 3, i)) % 1;
        const x = point.x + (rand(status.seed + 7, i) - 0.5) * Math.max(38, anchor.width * 0.62) + Math.sin(phase * 3 + i) * 3;
        const y = baseY - 8 - drift * Math.max(30, anchor.height * 0.64);
        drawStatusFlame(x, y, 6 + rand(status.seed + 13, i) * 5, alpha * (1 - drift * 0.55), phase * 5 + i);
      }
      for (let i = 0; i < 8; i++) {
        const rise = (phase * 0.55 + rand(status.seed + 19, i)) % 1;
        discGlow(point.x + (rand(status.seed + 23, i) - 0.5) * anchor.width * 0.7, baseY - rise * anchor.height * 0.8, 1.2 + rand(status.seed + 29, i) * 1.8, COLORS.gold, alpha * (1 - rise));
      }
      return;
    }

    if (status.kind === "corrosion") {
      for (let i = 0; i < 10; i++) {
        const rise = (phase * (0.18 + rand(status.seed, i) * 0.14) + rand(status.seed + 31, i)) % 1;
        const x = point.x + (rand(status.seed + 37, i) - 0.5) * Math.max(35, anchor.width * 0.7);
        const y = anchor.groundY - rise * Math.max(36, anchor.height * 0.78);
        discGlow(x, y, 2 + rand(status.seed + 41, i) * 5, i % 2 ? COLORS.poison : [100, 238, 115], alpha * (0.22 + (1 - rise) * 0.38));
      }
      drawCrackedShield({ x: point.x, y: point.y + 3 }, 0.25, COLORS.poison);
      return;
    }

    if (status.kind === "frost" || status.kind === "slow") {
      ellipseGlow(point.x, anchor.groundY - 2, Math.max(26, anchor.width * 0.38), 8, COLORS.ice, alpha * pulse * 0.58, 1.4);
      for (let i = 0; i < 7; i++) {
        const orbit = phase * (0.35 + i * 0.025) + rand(status.seed, i) * Math.PI * 2;
        const radius = Math.max(22, anchor.width * 0.34) + rand(status.seed + 5, i) * 13;
        drawStatusSnowflake(point.x + Math.cos(orbit) * radius, point.y - 5 + Math.sin(orbit * 1.3) * anchor.height * 0.36, 3 + rand(status.seed + 9, i) * 2.5, alpha * 0.8, orbit);
      }
      return;
    }

    if (status.kind === "stun") {
      const starPoint = { x: point.x, y: point.y - Math.max(28, anchor.height * 0.46) };
      drawStunStars(starPoint, 0.62 + (Math.sin(phase * 2.2) + 1) * 0.04, status.seed + phase * 0.1);
      return;
    }

    if (status.kind === "silence") {
      drawMuteGlyph({ x: point.x, y: point.y - Math.max(15, anchor.height * 0.22) }, 0.34, COLORS.purple);
      return;
    }

    if (status.kind === "blind") {
      for (let i = 0; i < 7; i++) {
        const orbit = phase * 0.42 + i * Math.PI * 2 / 7;
        discGlow(point.x + Math.cos(orbit) * (18 + i % 3 * 5), point.y - 8 + Math.sin(orbit) * 16, 5 + i % 3 * 2, [126, 85, 177], alpha * 0.28);
      }
      ellipseGlow(point.x, point.y - 10, 18, 8, COLORS.purple, alpha * pulse, 1.4);
      pathGlow([{ x: point.x - 18, y: point.y - 23 }, { x: point.x + 18, y: point.y + 3 }], COLORS.purple, alpha * 0.86, 2.2, 7);
      return;
    }

    if (status.kind === "armorBreak") {
      drawCrackedShield({ x: point.x, y: point.y + 2 }, 0.22, COLORS.gold);
      return;
    }

    if (status.kind === "vulnerable" || status.kind === "weaken") {
      drawDownGlyph({ x: point.x, y: point.y - 1 }, 0.28, status.kind === "vulnerable" ? COLORS.red : COLORS.purple);
    }
  }

  function drawAttachedStatuses(now) {
    const wallNow = Date.now();
    const { monsters } = findCombatUnits();
    const visible = new Map();

    for (const [key, status] of attachedStatuses) {
      if ((Number.isFinite(status.endAt) && status.endAt <= wallNow) || monsterHp[status.monsterIndex] <= 0) {
        attachedStatuses.delete(key);
        continue;
      }
      const aggregateKey = `${status.monsterIndex}:${status.kind}`;
      const previous = visible.get(aggregateKey);
      if (!previous || status.endAt > previous.endAt) visible.set(aggregateKey, status);
    }

    for (const status of visible.values()) {
      const monster = monsters[status.monsterIndex];
      const anchor = unitAnchor(monster);
      if (anchor) drawAttachedStatus(status, anchor, now);
    }
    return visible.size;
  }

  function drawAuraGlyph(aura, anchor, now, layer) {
    const style = AURA_KIND_STYLES[aura.kind] || AURA_KIND_STYLES.mysticAura;
    const phase = (Date.now() - aura.createdAt) / 1000;
    const intro = smoothstep(0, 0.28, Math.max(0, phase));
    const remaining = Number.isFinite(aura.endAt) ? aura.endAt - Date.now() : 1000;
    const outro = clamp(remaining / 420);
    const pulse = 0.78 + Math.sin(phase * 3.2 + aura.seed) * 0.12;
    const alpha = intro * outro * pulse;
    const radius = Math.max(25, Math.min(47, anchor.width * 0.42)) + layer * 6;
    const groundY = anchor.groundY - 2 - layer * 0.8;
    const rotation = phase * (0.55 + layer * 0.08) + aura.seed;

    ellipseGlow(anchor.x, groundY, radius, radius * 0.24, style.color, alpha * 0.78, 2.1, 0);
    ellipseGlow(anchor.x, groundY, Math.max(12, radius - 9), Math.max(4, radius * 0.24 - 3), style.accent, alpha * 0.46, 1.2, 0);

    const points = 6;
    for (let i = 0; i < points; i++) {
      const angle = rotation + i * Math.PI * 2 / points;
      const x = anchor.x + Math.cos(angle) * radius;
      const y = groundY + Math.sin(angle) * radius * 0.24;
      const pointColor = aura.kind === "mysticAura"
        ? [COLORS.water, COLORS.green, COLORS.fire][i % 3]
        : (i % 2 ? style.accent : style.color);
      discGlow(x, y, 1.8 + (i % 3) * 0.45, pointColor, alpha * 0.82);
    }

    if (aura.kind === "speedAura") {
      for (const sign of [-1, 1]) {
        const x = anchor.x + sign * radius * 0.54;
        pathGlow([
          { x: x - sign * 11, y: groundY - 7 },
          { x: x + sign * 7, y: groundY - 10 }
        ], style.accent, alpha * 0.58, 1.2, 5);
      }
    } else if (aura.kind === "guardianAura") {
      drawShield({ x: anchor.x, y: groundY - 9 }, style.color, alpha * 0.24, 0.44 + layer * 0.03);
    } else if (aura.kind === "criticalAura") {
      for (let i = 0; i < 4; i++) {
        const angle = rotation * 0.6 + i * Math.PI / 2;
        discGlow(anchor.x + Math.cos(angle) * radius * 0.57, groundY + Math.sin(angle) * 5 - 4, 2.4, COLORS.gold, alpha * 0.9);
      }
    } else if (aura.kind === "manaSpring") {
      for (let i = 0; i < 4; i++) {
        const rise = (phase * 0.42 + i / 4) % 1;
        drawStatusDrop(anchor.x + (i - 1.5) * 8, groundY - 4 - rise * 18, 2.2, COLORS.water, alpha * (1 - rise));
      }
    } else if (aura.kind === "fierceAura") {
      for (const sign of [-1, 1]) {
        pathGlow([
          { x: anchor.x + sign * 7, y: groundY - 4 },
          { x: anchor.x + sign * 17, y: groundY - 15 }
        ], COLORS.red, alpha * 0.66, 1.5, 6);
      }
    } else if (aura.kind === "elementalAffinity") {
      [COLORS.water, COLORS.green, COLORS.fire].forEach((color, index) => {
        const angle = rotation * 0.7 + index * Math.PI * 2 / 3;
        discGlow(anchor.x + Math.cos(angle) * radius * 0.62, groundY - 6 + Math.sin(angle) * 7, 3, color, alpha * 0.84);
      });
    }
  }

  function drawAttachedAuras(now) {
    const wallNow = Date.now();
    const { players } = findCombatUnits();
    const visible = new Map();

    for (const [key, aura] of attachedAuras) {
      if ((Number.isFinite(aura.endAt) && aura.endAt <= wallNow) || playerHp[aura.playerIndex] <= 0) {
        attachedAuras.delete(key);
        continue;
      }
      const aggregateKey = `${aura.playerIndex}:${aura.kind}`;
      const previous = visible.get(aggregateKey);
      if (!previous || aura.endAt > previous.endAt) visible.set(aggregateKey, aura);
    }

    const byPlayer = new Map();
    for (const aura of visible.values()) {
      if (!byPlayer.has(aura.playerIndex)) byPlayer.set(aura.playerIndex, []);
      byPlayer.get(aura.playerIndex).push(aura);
    }
    for (const [playerIndex, auras] of byPlayer) {
      const player = players[playerIndex];
      const anchor = unitAnchor(player);
      if (!anchor) continue;
      auras.sort((a, b) => a.kind.localeCompare(b.kind));
      auras.forEach((aura, layer) => drawAuraGlyph(aura, anchor, now, layer));
    }
    return visible.size;
  }

  function drawEffect(effect, now) {
    const p = clamp((now - effect.startedAt) / effect.duration);
    const style = effect.profile.style;
    ctx.save();
    if (effect.kind === "cast") {
      drawCastingEffect(effect, p);
    } else if (effect.kind === "bloomHeal") {
      drawBloomHeal(effect, p);
    } else if (effect.kind === "rippleProc") {
      drawRippleProc(effect, p);
    } else if (effect.kind === "blazeProc") {
      drawBlazeProc(effect, p);
    } else if (effect.enemy) {
      drawEnemyAttack(effect, p);
    } else {
      const route = STYLE_ROUTES[style];
      if (route === "weapon") drawWeapon(effect, p);
      else if (route === "thrust") drawThrust(effect, p, style);
      else if (route === "slash") drawSlash(effect, p, style);
      else if (route === "blunt") drawBlunt(effect, p, style);
      else if (route === "arrow") drawArrow(effect, p, style);
      else if (route === "magic") drawMagicProjectile(effect, p, style);
    }
    ctx.restore();
    if (!effect.kind) drawDamage(effect, p);
    return p < 1;
  }

  function render(now) {
    animationFrame = 0;
    if (!ensureCanvas()) {
      animationFrame = requestAnimationFrame(render);
      return;
    }
    resizeCanvas();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const auraCount = drawAttachedAuras(now);
    const statusCount = drawAttachedStatuses(now);
    activeEffects = activeEffects.filter(effect => drawEffect(effect, now));
    if (activeEffects.length || statusCount || auraCount) animationFrame = requestAnimationFrame(render);
  }

  function requestRender() {
    if (!animationFrame) animationFrame = requestAnimationFrame(render);
  }

  function intervalToMilliseconds(value) {
    const numeric = numberOr(value, 1200);
    const milliseconds = numeric > 100000 ? numeric / 1000000 : numeric;
    return clamp(milliseconds, 350, 6000);
  }

  function stopCastEffect(playerIndex) {
    activeEffects = activeEffects.filter(effect => !(effect.kind === "cast" && effect.playerIndex === playerIndex));
  }

  function getCastProfile(abilityHrid) {
    const attackProfile = PROFILES[abilityHrid];
    if (attackProfile?.magic && MAGIC_STYLES.has(attackProfile.style)) return attackProfile;
    const auraSpec = AURA_SPECS[abilityHrid];
    if (!auraSpec) return null;
    const auraStyle = AURA_KIND_STYLES[auraSpec.kind] || AURA_KIND_STYLES.mysticAura;
    return { style: "auraCast", color: auraStyle.color, magic: true, duration: 650 };
  }

  function spawnCastEffect(playerIndex, abilityHrid, intervalValue) {
    const profile = getCastProfile(abilityHrid);
    if (pageHidden || !profile) return;
    const auraSpec = AURA_SPECS[abilityHrid];
    const { players, monsters } = findCombatUnits();
    const player = players[playerIndex];
    if (!player) return;
    const firstMonsterRect = monsters[0]?.getBoundingClientRect();
    const towardX = firstMonsterRect ? firstMonsterRect.left + firstMonsterRect.width / 2 : window.innerWidth;
    const sourceAnchor = unitAnchor(player, auraSpec && !ATTACK_ABILITIES.has(abilityHrid) ? null : towardX);
    if (!sourceAnchor) return;
    const targets = profile.style === "frostSurge"
      ? monsters.map((monster, index) => {
        if (monsterHp[index] === 0) return null;
        const anchor = unitAnchor(monster);
        const bounds = unitEffectBounds(monster);
        const dropBounds = unitDropBounds(monster);
        if (!anchor || !bounds || !dropBounds) return null;
        return {
          index,
          precast: true,
          anchor,
          bounds,
          dropBounds,
          point: { x: anchor.x, y: anchor.y }
        };
      }).filter(Boolean)
      : [];
    stopCastEffect(playerIndex);
    activeEffects.push({
      id: ++effectSequence,
      kind: "cast",
      playerIndex,
      abilityHrid,
      profile,
      sourceAnchor,
      supportCast: Boolean(auraSpec && !ATTACK_ABILITIES.has(abilityHrid)),
      towardPoint: auraSpec && !ATTACK_ABILITIES.has(abilityHrid)
        ? null
        : (firstMonsterRect ? { x: towardX, y: firstMonsterRect.top + firstMonsterRect.height / 2 } : null),
      targets,
      seed: effectSequence * 131 + playerIndex * 29,
      duration: intervalToMilliseconds(intervalValue),
      startedAt: performance.now()
    });
    requestRender();
  }

  function visualImpactPhase(profile) {
    const route = STYLE_ROUTES[profile.style];
    if (route === "weapon") return 0.64;
    if (route === "thrust") return 0.59;
    if (route === "slash") return 0.50;
    if (route === "blunt") return 0.54;
    if (route === "arrow") return profile.style === "rainOfArrows" ? 0.55 : 0.59;
    if (route === "magic") {
      if (profile.area) return 0.52;
      if (profile.style === "entangle") return 0.62;
      if (profile.style === "lifeDrain") return 0.52;
      return 0.64;
    }
    if (profile.style === "enemyAttack") return 0.64;
    return 0.52;
  }

  function syncedAttackStartedAt(profile, missed = false) {
    const now = performance.now();
    if (missed) return now;
    const impactDelay = 75;
    return now - Math.max(0, profile.duration * visualImpactPhase(profile) - impactDelay);
  }

  function spawnPlayerAttack(playerIndex, abilityHrid, hits, isCrit = false) {
    if (pageHidden || !hits.length) return;
    const profile = PROFILES[abilityHrid] || PROFILES.autoAttack;
    const { players, monsters } = findCombatUnits();
    const player = players[playerIndex];
    if (!player || !monsters.length) return;

    const validHits = hits
      .filter(hit => monsters[hit.index])
      .map(hit => ({ ...hit, element: monsters[hit.index] }))
      .sort((a, b) => a.index - b.index);
    if (!validHits.length) return;

    let selected = validHits;
    if (!profile.area && !profile.chain) selected = [validHits.slice().sort((a, b) => b.damage - a.damage)[0]];
    if (profile.chain) selected = validHits.slice(0, 2);

    const firstTargetRect = selected[0].element.getBoundingClientRect();
    const sourceAnchor = unitAnchor(player, firstTargetRect.left + firstTargetRect.width / 2);
    if (!sourceAnchor) return;
    const targets = selected.map(hit => {
      // towardX is only for placing the attack origin on the caster's facing
      // side.  Shifting the receiver made every projectile and AOE land on the
      // near edge of the portrait instead of the character body.
      const anchor = unitAnchor(hit.element);
      const missDirection = Math.sign(anchor.x - sourceAnchor.x) || 1;
      return {
        index: hit.index,
        damage: hit.damage,
        miss: Boolean(hit.miss),
        anchor,
        bounds: unitEffectBounds(hit.element),
        dropBounds: unitDropBounds(hit.element),
        point: {
          x: anchor.x + (hit.miss ? missDirection * 36 : 0),
          y: anchor.y - (hit.miss ? 26 : 0)
        }
      };
    });

    const start = STYLE_ROUTES[profile.style] === "magic"
      ? frontCastPoint(sourceAnchor, targets[0].point)
      : { x: sourceAnchor.x, y: sourceAnchor.y };

    activeEffects.push({
      id: ++effectSequence,
      seed: effectSequence * 97 + playerIndex * 19,
      abilityHrid,
      profile,
      sourceAnchor,
      start: { x: start.x, y: start.y },
      targets,
      isCrit,
      enemy: false,
      duration: profile.duration,
      startedAt: syncedAttackStartedAt(profile, targets.every(target => target.miss))
    });
    requestRender();
  }

  function spawnEnemyAttack(monsterIndex, hits, isCrit = false) {
    if (pageHidden || !hits.length) return;
    const { players, monsters } = findCombatUnits();
    const monster = monsters[monsterIndex];
    if (!monster || !players.length) return;
    const validHits = hits.filter(hit => players[hit.index]).map(hit => ({ ...hit, element: players[hit.index] }));
    if (!validHits.length) return;
    const firstRect = validHits[0].element.getBoundingClientRect();
    const sourceAnchor = unitAnchor(monster, firstRect.left + firstRect.width / 2);
    const targets = validHits.map(hit => {
      const anchor = unitAnchor(hit.element);
      return { index: hit.index, damage: hit.damage, anchor, point: { x: anchor.x, y: anchor.y } };
    });
    const profile = { style: "enemyAttack", color: COLORS.enemy, duration: 760 };
    activeEffects.push({
      id: ++effectSequence,
      seed: effectSequence * 103 + monsterIndex * 31,
      abilityHrid: "enemyAttack",
      profile,
      sourceAnchor,
      start: { x: sourceAnchor.x, y: sourceAnchor.y },
      targets,
      isCrit,
      enemy: true,
      duration: 760,
      startedAt: syncedAttackStartedAt(profile, false)
    });
    requestRender();
  }

  function spawnRippleProc(casterIndex, rippleChance) {
    if (pageHidden) return;
    const { players } = findCombatUnits();
    const caster = players[casterIndex];
    if (!caster) return;
    const sourceAnchor = unitAnchor(caster);
    const casterBounds = unitEffectBounds(caster);
    const casterHand = procHandPoint(sourceAnchor);
    if (!sourceAnchor || !casterBounds || !casterHand) return;
    const duration = 1080;
    activeEffects.push({
      id: ++effectSequence,
      kind: "rippleProc",
      casterIndex,
      rippleChance,
      profile: { style: "rippleProc", color: [71, 166, 255], duration },
      sourceAnchor,
      casterBounds,
      casterHand,
      seed: effectSequence * 163 + casterIndex * 41,
      duration,
      startedAt: performance.now() - 110
    });
    requestRender();
  }

  function spawnBlazeProc(casterIndex, targetIndices, blazeChance) {
    if (pageHidden || !targetIndices.length) return;
    const { players, monsters } = findCombatUnits();
    const caster = players[casterIndex];
    if (!caster) return;
    const sourceAnchor = unitAnchor(caster);
    const casterBounds = unitEffectBounds(caster);
    const casterHand = procHandPoint(sourceAnchor);
    if (!sourceAnchor || !casterBounds || !casterHand) return;
    const targets = targetIndices
      .filter(index => monsters[index])
      .map(index => {
        const anchor = unitAnchor(monsters[index]);
        const bounds = unitEffectBounds(monsters[index]);
        if (!anchor || !bounds) return null;
        return {
          index,
          anchor,
          bounds,
          point: { x: anchor.x, y: anchor.y + 2 }
        };
      })
      .filter(Boolean);
    if (!targets.length) return;
    const duration = 760;
    activeEffects.push({
      id: ++effectSequence,
      kind: "blazeProc",
      casterIndex,
      blazeChance,
      profile: { style: "blazeProc", color: [255, 91, 24], duration },
      sourceAnchor,
      casterBounds,
      casterHand,
      targets,
      seed: effectSequence * 179 + casterIndex * 43,
      duration,
      startedAt: performance.now() - 90
    });
    requestRender();
  }

  function spawnBloomHeal(casterIndex, targetIndex, healing, bloomChance) {
    if (pageHidden || !(healing > 0)) return;
    const { players } = findCombatUnits();
    const caster = players[casterIndex];
    const target = players[targetIndex];
    if (!caster || !target) return;
    const targetAnchor = unitAnchor(target);
    const sourceAnchor = unitAnchor(caster);
    if (!sourceAnchor || !targetAnchor) return;
    const targetPoint = { x: targetAnchor.x, y: targetAnchor.y };
    const casterBounds = unitEffectBounds(caster);
    const casterHand = procHandPoint(sourceAnchor);
    const targetBounds = unitEffectBounds(target);
    if (!casterBounds || !casterHand || !targetBounds) return;
    const duration = 1220;
    activeEffects.push({
      id: ++effectSequence,
      kind: "bloomHeal",
      casterIndex,
      bloomChance,
      healing,
      profile: { style: "bloomHeal", color: [76, 235, 145], duration },
      sourceAnchor,
      casterBounds,
      casterHand,
      targets: [{
        index: targetIndex,
        healing,
        anchor: targetAnchor,
        bounds: targetBounds,
        point: targetPoint
      }],
      seed: effectSequence * 149 + casterIndex * 37 + targetIndex * 59,
      duration,
      // 封包到達時補血已經發生，讓手前方綠叉與目標花朵立刻進入可見階段。
      startedAt: performance.now() - duration * 0.22
    });
    requestRender();
  }

  function numberOr(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function parseServerTimestamp(value) {
    if (typeof value !== "string" || !value || value.startsWith("0001-")) return NaN;
    const normalized = value.replace(/\.(\d{3})\d*Z$/, ".$1Z");
    return Date.parse(normalized);
  }

  function durationNanosecondsToMilliseconds(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric / 1000000 : 0;
  }

  function classifyCombatStatus(mapKey, buff) {
    const unique = String(buff?.uniqueHrid || mapKey || "").toLowerCase();
    const type = String(buff?.typeHrid || "").toLowerCase();
    const text = `${unique} ${type}`;
    const isDot = /damage_over_time|damage-over-time|\bdot\b/.test(text);

    if ((isDot && /fire|burn|blaze|firestorm/.test(text)) || /burn|burning|firestorm/.test(text)) return "burn";
    if ((isDot && /physical|maim|bleed/.test(text)) || /bleed|bleeding/.test(text)) return "bleed";
    if (/stun/.test(text)) return "stun";
    if (/silence|silencing|mute/.test(text)) return "silence";
    if (/blind|natures?_veil|smoke_burst/.test(text)) return "blind";
    if (/pestilent|toxic_pollen|corrosion|all_resistance|resistance_down/.test(text)) return "corrosion";
    if (/puncture|armor_break|armor_down/.test(text)) return "armorBreak";
    if (/ice_spear|frost_surge|freeze|frozen|slow|attack_speed_down/.test(text)) return "frost";
    if (/crippling_slash|damage_dealt_down|weaken/.test(text)) return "weaken";
    if (/damage_taken|fracturing_impact|vulnerable|curse/.test(text)) return "vulnerable";
    if (/maim/.test(text)) return type.includes("damage_taken") ? "vulnerable" : "bleed";
    return "";
  }

  function findCombatBuffMap(unit) {
    if (!unit || typeof unit !== "object") return null;
    for (const field of ["combatBuffMap", "combatBuffs", "buffMap", "buffs"]) {
      if (Object.prototype.hasOwnProperty.call(unit, field) && unit[field] && typeof unit[field] === "object") {
        return unit[field];
      }
    }
    return null;
  }

  function classifyPlayerAura(mapKey, buff) {
    const unique = String(buff?.uniqueHrid || mapKey || "").toLowerCase();
    const type = String(buff?.typeHrid || "").toLowerCase();
    const text = `${unique} ${type}`;
    if (/mana_spring/.test(text)) return "manaSpring";
    if (/critical_aura/.test(text)) return "criticalAura";
    if (/fierce_aura/.test(text)) return "fierceAura";
    if (/guardian_aura/.test(text)) return "guardianAura";
    if (/mystic_aura/.test(text)) return "mysticAura";
    if (/speed_aura/.test(text)) return "speedAura";
    if (/elemental_affinity/.test(text)) return "elementalAffinity";
    return "";
  }

  function upsertAttachedAura(key, next, authoritative = false) {
    const previous = attachedAuras.get(key);
    if (previous) {
      next.createdAt = previous.createdAt;
      next.seed = previous.seed;
      if (!authoritative) next.endAt = Math.max(previous.endAt, next.endAt);
    }
    attachedAuras.set(key, next);
  }

  function syncExactPlayerAuras(playerIndex, buffMap) {
    if (!buffMap || typeof buffMap !== "object") return;
    const prefix = `exact:aura:${playerIndex}:`;
    const seen = new Set();
    const wallNow = Date.now();

    for (const [mapKey, rawBuff] of Object.entries(buffMap)) {
      const buff = rawBuff && typeof rawBuff === "object" ? rawBuff : null;
      if (!buff) continue;
      const kind = classifyPlayerAura(mapKey, buff);
      const duration = durationNanosecondsToMilliseconds(buff.duration);
      const startAt = parseServerTimestamp(buff.startTime);
      if (!kind || !duration || !Number.isFinite(startAt)) continue;
      const endAt = startAt + duration;
      if (endAt <= wallNow) continue;

      const unique = String(buff.uniqueHrid || mapKey || `${kind}:${startAt}`);
      const key = `${prefix}${unique}`;
      seen.add(key);
      upsertAttachedAura(key, {
        playerIndex,
        kind,
        source: "server",
        unique,
        startAt,
        endAt,
        createdAt: Math.min(wallNow, startAt),
        seed: (playerIndex + 1) * 257 + unique.length * 19
      }, true);

      for (const [otherKey, aura] of attachedAuras) {
        if (otherKey.startsWith(`inferred:aura:${playerIndex}:`) && aura.kind === kind) attachedAuras.delete(otherKey);
      }
    }

    for (const key of [...attachedAuras.keys()]) {
      if (key.startsWith(prefix) && !seen.has(key)) attachedAuras.delete(key);
    }
    if (seen.size) requestRender();
  }

  function applyInferredAura(casterIndex, abilityHrid) {
    const spec = AURA_SPECS[abilityHrid];
    if (!spec) return;
    const wallNow = Date.now();
    const playerCount = Math.max(playerHp.length, findCombatUnits().players.length);
    const targets = spec.target === "party"
      ? Array.from({ length: playerCount }, (_, index) => index).filter(index => playerHp[index] !== 0)
      : [casterIndex];

    for (const playerIndex of targets) {
      const key = `inferred:aura:${playerIndex}:${spec.kind}:${casterIndex}`;
      upsertAttachedAura(key, {
        playerIndex,
        kind: spec.kind,
        source: abilityHrid,
        casterIndex,
        startAt: wallNow,
        endAt: wallNow + spec.duration,
        createdAt: wallNow,
        seed: (playerIndex + 1) * 193 + (casterIndex + 1) * 43 + abilityHrid.length * 17
      });
    }
    requestRender();
  }

  function upsertAttachedStatus(key, next, authoritative = false) {
    const previous = attachedStatuses.get(key);
    if (previous) {
      next.createdAt = previous.createdAt;
      next.seed = previous.seed;
      if (!authoritative) next.endAt = Math.max(previous.endAt, next.endAt);
    }
    attachedStatuses.set(key, next);
  }

  function syncExactMonsterStatuses(monsterIndex, buffMap) {
    if (!buffMap || typeof buffMap !== "object") return;
    const prefix = `exact:${monsterIndex}:`;
    const seen = new Set();
    const wallNow = Date.now();

    for (const [mapKey, rawBuff] of Object.entries(buffMap)) {
      const buff = rawBuff && typeof rawBuff === "object" ? rawBuff : null;
      if (!buff) continue;
      const kind = classifyCombatStatus(mapKey, buff);
      const duration = durationNanosecondsToMilliseconds(buff.duration);
      const startAt = parseServerTimestamp(buff.startTime);
      if (!kind || !duration || !Number.isFinite(startAt)) continue;
      const endAt = startAt + duration;
      if (endAt <= wallNow) continue;

      const unique = String(buff.uniqueHrid || mapKey || `${kind}:${startAt}`);
      const key = `${prefix}${unique}`;
      seen.add(key);
      upsertAttachedStatus(key, {
        monsterIndex,
        kind,
        source: "server",
        unique,
        startAt,
        endAt,
        createdAt: Math.min(wallNow, startAt),
        seed: (monsterIndex + 1) * 211 + unique.length * 17
      }, true);

      for (const [otherKey, status] of attachedStatuses) {
        if (otherKey.startsWith(`inferred:${monsterIndex}:`) && status.kind === kind) attachedStatuses.delete(otherKey);
      }
    }

    for (const key of [...attachedStatuses.keys()]) {
      if (key.startsWith(prefix) && !seen.has(key)) attachedStatuses.delete(key);
    }
    if (seen.size) requestRender();
  }

  function applyInferredStatuses(abilityHrid, hits) {
    const specs = INFERRED_STATUS_SPECS[abilityHrid];
    if (!specs || !hits?.length) return;
    const wallNow = Date.now();
    for (const hit of hits) {
      if (hit.miss || !(hit.damage > 0) || !Number.isInteger(hit.index)) continue;
      for (const spec of specs) {
        const key = `inferred:${hit.index}:${abilityHrid}:${spec.kind}`;
        upsertAttachedStatus(key, {
          monsterIndex: hit.index,
          kind: spec.kind,
          source: abilityHrid,
          startAt: wallNow,
          endAt: wallNow + spec.duration,
          createdAt: wallNow,
          seed: (hit.index + 1) * 173 + abilityHrid.length * 23 + spec.kind.length * 31
        });
      }
    }
    requestRender();
  }

  function didRippleProc(abilityHrid, previousMp, currentMp) {
    if (!Number.isFinite(previousMp) || !Number.isFinite(currentMp)) return false;
    const manaSpent = previousMp - currentMp;
    const fixedCost = ABILITY_MANA_COSTS[abilityHrid];
    const observedCost = observedAbilityManaCosts.get(abilityHrid);
    const expectedCost = Number.isFinite(fixedCost) ? fixedCost : observedCost;
    const procSpent = Number.isFinite(expectedCost) ? Math.max(0, expectedCost - 10) : NaN;
    const proc = Number.isFinite(procSpent) && Math.abs(manaSpent - procSpent) < 0.01;

    // Unknown abilities become detectable after one ordinary cast establishes
    // their full cost. Keep the largest observed spend because a Ripple cast is
    // exactly 10 lower than the normal value.
    if (!Number.isFinite(fixedCost) && manaSpent > 0) {
      observedAbilityManaCosts.set(abilityHrid, Math.max(observedCost || 0, manaSpent));
    }
    return proc;
  }

  function hasBlazeProcSignature(cast, aliveMonsterIndices, monsterSplats, primaryMonsterIndex) {
    if (!cast || !aliveMonsterIndices.length || !monsterSplats.length) return false;
    const counts = new Map(monsterSplats.map(splat => [splat.index, splat.count]));
    const profile = PROFILES[cast.abilityHrid];
    const isAttack = ATTACK_ABILITIES.has(cast.abilityHrid);
    const chainTargets = profile?.chain ? new Set(aliveMonsterIndices.slice(0, 2)) : null;

    // A Blaze proc adds one damage-splat attempt to every living monster.
    // Account for the completed base ability's own attempts, then require the
    // extra all-enemy layer. This matches both hits and misses because the
    // server increments dmgCounter for either result.
    return aliveMonsterIndices.every(index => {
      let required = 1;
      if (isAttack && profile?.area) required += 1;
      else if (isAttack && profile?.chain && chainTargets.has(index)) required += 1;
      else if (isAttack && !profile?.area && !profile?.chain && index === primaryMonsterIndex) required += 1;
      return numberOr(counts.get(index), 0) >= required;
    });
  }

  function clearPendingCasts(casts) {
    for (const cast of casts.values()) {
      if (cast.missTimer) clearTimeout(cast.missTimer);
    }
    casts.clear();
  }

  function normalizePreparingAbility(value) {
    return typeof value === "string" && value ? value : "autoAttack";
  }

  function choosePrimaryMonsterTarget() {
    const alive = [];
    for (let index = 0; index < monsterHp.length; index++) {
      if (monsterHp[index] > 0) alive.push(index);
    }
    if (!alive.length) return -1;
    return alive[0];
  }

  function spawnMissedPlayerAttack(cast, preferredTargetIndex = -1) {
    const targetIndex = preferredTargetIndex >= 0 ? preferredTargetIndex : choosePrimaryMonsterTarget();
    if (targetIndex >= 0) {
      spawnPlayerAttack(cast.index, cast.abilityHrid, [{ index: targetIndex, damage: 0, miss: true }], false);
    }
  }

  function scheduleInitialCastEffects(players) {
    const generation = battleGeneration;
    window.setTimeout(() => {
      if (generation !== battleGeneration) return;
      players.forEach((player, index) => {
        const abilityHrid = playerPreparingAbility[index];
        spawnCastEffect(index, abilityHrid, player.attackOrCastInterval);
      });
    }, 80);
  }

  function handleBattleMessage(payload) {
    if (typeof payload !== "string" || payload.charCodeAt(0) !== 123) return;
    let obj;
    try {
      obj = JSON.parse(payload);
    } catch (_) {
      return;
    }
    if (!obj || typeof obj !== "object") return;

    if (obj.type === "new_battle" && Array.isArray(obj.monsters) && Array.isArray(obj.players)) {
      battleGeneration++;
      clearDamageHpTrails();
      monsterHp = obj.monsters.map(monster => numberOr(monster.currentHitpoints, 0));
      monsterMp = obj.monsters.map(monster => numberOr(monster.currentManapoints, 0));
      monsterAtkCounter = obj.monsters.map(monster => numberOr(monster.attackAttemptCounter, 0));
      monsterDmgCounter = obj.monsters.map(monster => numberOr(monster.damageSplatCounter, 0));
      monsterCritCounter = obj.monsters.map(monster => numberOr(monster.criticalDamageSplatCounter, 0));
      playerHp = obj.players.map(player => numberOr(player.currentHitpoints, 0));
      playerMp = obj.players.map(player => numberOr(player.currentManapoints, 0));
      playerAtkCounter = obj.players.map(player => numberOr(player.attackAttemptCounter, 0));
      playerDmgCounter = obj.players.map(player => numberOr(player.damageSplatCounter, 0));
      playerCritCounter = obj.players.map(player => numberOr(player.criticalDamageSplatCounter, 0));
      playerPreparingAbility = obj.players.map(player => normalizePreparingAbility(player.preparingAbilityHrid));
      playerBloomChance = obj.players.map(player => numberOr(player?.combatDetails?.combatStats?.bloom, 0));
      playerRippleChance = obj.players.map(player => numberOr(player?.combatDetails?.combatStats?.ripple, 0));
      playerBlazeChance = obj.players.map(player => numberOr(player?.combatDetails?.combatStats?.blaze, 0));
      clearPendingCasts(pendingMonsterCasts);
      activeEffects = [];
      attachedStatuses.clear();
      attachedAuras.clear();
      obj.monsters.forEach((monster, index) => {
        const buffMap = findCombatBuffMap(monster);
        if (buffMap) syncExactMonsterStatuses(index, buffMap);
      });
      obj.players.forEach((player, index) => {
        const buffMap = findCombatBuffMap(player);
        if (buffMap) syncExactPlayerAuras(index, buffMap);
      });
      scheduleInitialCastEffects(obj.players);
      if (attachedStatuses.size || attachedAuras.size) requestRender();
      return;
    }

    if (obj.type !== "battle_updated") return;
    const mMap = obj.mMap || {};
    const pMap = obj.pMap || {};
    const monsterEntries = Object.entries(mMap);
    const playerEntries = Object.entries(pMap);
    if (!monsterEntries.length && !playerEntries.length) return;

    // Player single-target attacks focus the first monster that was alive when
    // the server processed this update.  Capture it before applying the new HP
    // values, otherwise a killing blow would incorrectly jump to the next unit.
    const aliveMonsterIndicesBeforeUpdate = monsterHp
      .map((hp, index) => hp > 0 ? index : -1)
      .filter(index => index >= 0);
    const primaryMonsterIndexBeforeUpdate = choosePrimaryMonsterTarget();

    const now = performance.now();
    for (const [index, cast] of pendingMonsterCasts) {
      if (now - cast.createdAt > 900) pendingMonsterCasts.delete(index);
    }

    const completedPlayerCasts = [];
    const completedAuraCasts = [];
    const completedBloomCasts = [];
    const completedRippleCasts = [];
    const completedBlazeCasts = [];
    for (const [key, player] of playerEntries) {
      const index = Number(key);
      const buffMap = findCombatBuffMap(player);
      if (buffMap) syncExactPlayerAuras(index, buffMap);
      const previousMp = playerMp[index];
      const currentMp = numberOr(player.cMP, previousMp);
      const previousAtk = playerAtkCounter[index];
      const currentAtk = numberOr(player.atkCounter, previousAtk);
      const abilityHrid = typeof player.abilityHrid === "string" ? player.abilityHrid : "";
      if (Number.isFinite(currentAtk) && (!Number.isFinite(previousAtk) || currentAtk > previousAtk)) {
        const completedAbility = playerPreparingAbility[index] || "autoAttack";
        stopCastEffect(index);
        if (ATTACK_ABILITIES.has(completedAbility)) {
          completedPlayerCasts.push({ index, abilityHrid: completedAbility, counter: currentAtk });
        }
        if (AURA_SPECS[completedAbility]) {
          completedAuraCasts.push({ index, abilityHrid: completedAbility });
        }
        const bloomChance = numberOr(playerBloomChance[index], 0);
        if (bloomChance > 0 && completedAbility !== "autoAttack" && !DIRECT_HEAL_ABILITIES.has(completedAbility)) {
          completedBloomCasts.push({ index, abilityHrid: completedAbility, bloomChance });
        }
        const rippleChance = numberOr(playerRippleChance[index], 0);
        if (
          rippleChance > 0
          && completedAbility !== "autoAttack"
          && didRippleProc(completedAbility, previousMp, currentMp)
        ) {
          completedRippleCasts.push({ index, abilityHrid: completedAbility, rippleChance });
        }
        const blazeChance = numberOr(playerBlazeChance[index], 0);
        if (blazeChance > 0 && completedAbility !== "autoAttack") {
          completedBlazeCasts.push({ index, abilityHrid: completedAbility, blazeChance });
        }
        const nextAbility = normalizePreparingAbility(abilityHrid);
        playerPreparingAbility[index] = nextAbility;
        spawnCastEffect(index, nextAbility, player.int);
      }
      if (Number.isFinite(currentMp)) playerMp[index] = currentMp;
      if (Number.isFinite(currentAtk)) playerAtkCounter[index] = currentAtk;
    }

    for (const cast of completedAuraCasts) applyInferredAura(cast.index, cast.abilityHrid);
    for (const cast of completedRippleCasts) spawnRippleProc(cast.index, cast.rippleChance);

    for (const [key, monster] of monsterEntries) {
      const index = Number(key);
      const buffMap = findCombatBuffMap(monster);
      if (buffMap) syncExactMonsterStatuses(index, buffMap);
      const previousMp = monsterMp[index];
      const currentMp = numberOr(monster.cMP, previousMp);
      const previousAtk = monsterAtkCounter[index];
      const currentAtk = numberOr(monster.atkCounter, previousAtk);
      if (Number.isFinite(currentAtk) && (!Number.isFinite(previousAtk) || currentAtk > previousAtk)) {
        pendingMonsterCasts.set(index, { index, counter: currentAtk, createdAt: now });
      }
      if (Number.isFinite(currentMp)) monsterMp[index] = currentMp;
      if (Number.isFinite(currentAtk)) monsterAtkCounter[index] = currentAtk;
    }

    const monsterHits = [];
    const monsterSplats = [];
    const combatUnits = findCombatUnits();
    for (const [key, monster] of monsterEntries) {
      const index = Number(key);
      const previousHp = monsterHp[index];
      const currentHp = numberOr(monster.cHP, previousHp);
      const damage = Number.isFinite(previousHp) && Number.isFinite(currentHp) ? previousHp - currentHp : 0;
      const previousDmg = monsterDmgCounter[index];
      const currentDmg = numberOr(monster.dmgCounter, previousDmg);
      const previousCrit = monsterCritCounter[index];
      const currentCrit = numberOr(monster.critCounter, previousCrit);
      if (damage > 0) {
        const crit = Number.isFinite(previousCrit) && Number.isFinite(currentCrit) && currentCrit > previousCrit;
        monsterHits.push({ index, damage, crit });
        addDamageHpTrail(combatUnits.monsters[index], previousHp, currentHp);
      }
      if (Number.isFinite(previousDmg) && Number.isFinite(currentDmg) && currentDmg > previousDmg) {
        monsterSplats.push({ index, count: currentDmg - previousDmg });
      }
      if (Number.isFinite(currentHp)) monsterHp[index] = currentHp;
      if (Number.isFinite(currentDmg)) monsterDmgCounter[index] = currentDmg;
      if (Number.isFinite(currentCrit)) monsterCritCounter[index] = currentCrit;
    }

    for (const cast of completedBlazeCasts) {
      if (hasBlazeProcSignature(
        cast,
        aliveMonsterIndicesBeforeUpdate,
        monsterSplats,
        primaryMonsterIndexBeforeUpdate
      )) {
        spawnBlazeProc(cast.index, aliveMonsterIndicesBeforeUpdate, cast.blazeChance);
      }
    }

    if (completedPlayerCasts.length) {
      for (const cast of completedPlayerCasts) {
        const profile = PROFILES[cast.abilityHrid] || PROFILES.autoAttack;
        if (profile.area || profile.chain) {
          if (monsterHits.length) {
            spawnPlayerAttack(cast.index, cast.abilityHrid, monsterHits, monsterHits.some(hit => hit.crit));
            applyInferredStatuses(cast.abilityHrid, monsterHits);
          } else {
            spawnMissedPlayerAttack(cast, primaryMonsterIndexBeforeUpdate);
          }
          continue;
        }

        // A battle_updated frame may also contain other players' damage and
        // anonymous DOT ticks.  Picking the largest HP loss made Fireball,
        // Entangle and Water Strike fly to an unrelated monster.  Bind every
        // single-target cast to the server's current primary monster instead.
        const targetIndex = primaryMonsterIndexBeforeUpdate >= 0
          ? primaryMonsterIndexBeforeUpdate
          : (monsterSplats[0]?.index ?? monsterHits[0]?.index ?? -1);
        const targetHit = monsterHits.find(hit => hit.index === targetIndex);
        if (targetHit) {
          spawnPlayerAttack(cast.index, cast.abilityHrid, [targetHit], targetHit.crit);
          applyInferredStatuses(cast.abilityHrid, [targetHit]);
        } else {
          spawnMissedPlayerAttack(cast, targetIndex);
        }
      }
    }

    const playerHits = [];
    const playerHeals = [];
    for (const [key, player] of playerEntries) {
      const index = Number(key);
      const previousHp = playerHp[index];
      const currentHp = numberOr(player.cHP, previousHp);
      const damage = Number.isFinite(previousHp) && Number.isFinite(currentHp) ? previousHp - currentHp : 0;
      const previousDmg = playerDmgCounter[index];
      const currentDmg = numberOr(player.dmgCounter, previousDmg);
      const previousCrit = playerCritCounter[index];
      const currentCrit = numberOr(player.critCounter, previousCrit);
      if (damage > 0) {
        const crit = Number.isFinite(previousCrit) && Number.isFinite(currentCrit) && currentCrit > previousCrit;
        playerHits.push({ index, damage, crit });
        addDamageHpTrail(combatUnits.players[index], previousHp, currentHp);
      } else if (damage < 0) {
        playerHeals.push({ index, healing: -damage });
      }
      if (Number.isFinite(currentHp)) playerHp[index] = currentHp;
      if (Number.isFinite(currentDmg)) playerDmgCounter[index] = currentDmg;
      if (Number.isFinite(currentCrit)) playerCritCounter[index] = currentCrit;
    }
    if (completedBloomCasts.length && playerHeals.length) {
      // 綻放只治療一位最低生命百分比的隊友；若同包還含自然回血，取本次最大增量。
      const bloomCast = completedBloomCasts[0];
      const bloomTarget = playerHeals.slice().sort((a, b) => b.healing - a.healing)[0];
      spawnBloomHeal(bloomCast.index, bloomTarget.index, bloomTarget.healing, bloomCast.bloomChance);
    }
    if (playerHits.length) {
      const casts = [...pendingMonsterCasts.values()].filter(cast => now - cast.createdAt <= 900);
      for (const cast of casts) {
        spawnEnemyAttack(cast.index, playerHits, playerHits.some(hit => hit.crit));
        pendingMonsterCasts.delete(cast.index);
      }
    }
  }

  function hookWebSocketMessages() {
    const descriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
    if (!descriptor || typeof descriptor.get !== "function" || descriptor.configurable === false) {
      console.warn(`[MWI Combat VFX ${VERSION}] 無法掛接戰鬥訊息。`);
      return;
    }
    const originalGet = descriptor.get;
    const seenEvents = new WeakSet();
    Object.defineProperty(MessageEvent.prototype, "data", {
      ...descriptor,
      get: function () {
        const value = originalGet.call(this);
        if (!seenEvents.has(this)) {
          seenEvents.add(this);
          const socket = this.currentTarget;
          const url = socket && typeof socket.url === "string" ? socket.url : "";
          if (WS_HOSTS.some(host => url.includes(host))) {
            try {
              handleBattleMessage(value);
            } catch (error) {
              console.warn(`[MWI Combat VFX ${VERSION}] 戰鬥訊息處理失敗：`, error);
            }
          }
        }
        return value;
      }
    });
  }

  document.addEventListener("visibilitychange", () => {
    pageHidden = document.hidden;
    if (pageHidden) {
      activeEffects = [];
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    } else if (attachedStatuses.size || attachedAuras.size) {
      requestRender();
    }
  });
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.addEventListener("DOMContentLoaded", ensureCanvas, { once: true });

  hookWebSocketMessages();
  if (document.body) ensureCanvas();

  console.info(`[MWI Combat VFX] ${VERSION} 已載入（攻擊同步、隊伍光環、無調整介面）`);
})();
