// ==UserScript==
// @name         MWI Szerra 戰鬥資訊包
// @namespace    https://github.com/szerra/mwi-szerra-suite
// @version      1.0.6
// @description  整合戰鬥 HUD、升級時間、模擬器匯入、掉落統計與戰鬥特效；可從 Tampermonkey 選單逐項開關。
// @author       Szerra integration; see THIRD_PARTY_NOTICES.md
// @license      CC-BY-NC-SA-4.0
// @icon         https://www.milkywayidle.com/favicon.svg
// @homepageURL  https://github.com/szerra/mwi-szerra-suite
// @supportURL   https://github.com/szerra/mwi-szerra-suite/issues
// @updateURL    https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Combat-Suite.user.js
// @downloadURL  https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Combat-Suite.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @match        https://*/MWICombatSimulatorTest/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      textdb.online
// @connect      raw.githubusercontent.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/blueimp-md5/2.19.0/js/md5.min.js
// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/ml-fft@1.3.5/dist/ml-fft.min.js
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// ==/UserScript==
(() => {
  "use strict";

  const __MWISzerraSuite = (() => {
    const packId = "combat";
    const storageKey = `mwi.szerra.suite.${packId}.modules.v1`;
    const defaults = {
      "combat-vfx": true,
      "level-time": true,
      "realtime-simulator": true,
      "luck-stats": true,
      "battle-hud": true
    };
    const menuItems = [
      { id: "combat-vfx", label: "戰鬥技能特效" },
      { id: "level-time", label: "戰鬥升級所需時間" },
      { id: "realtime-simulator", label: "戰鬥模擬即時匯入" },
      { id: "luck-stats", label: "掉落與運氣統計" },
      { id: "battle-hud", label: "戰鬥 HUD" }
    ];
    let saved = {};
    try {
      saved = GM_getValue(storageKey, {}) || {};
    } catch (error) {
      console.warn(`[MWI Szerra ${packId}] 無法讀取模組設定`, error);
    }
    const state = { ...defaults, ...saved };

    function save() {
      try {
        GM_setValue(storageKey, state);
      } catch (error) {
        console.warn(`[MWI Szerra ${packId}] 無法儲存模組設定`, error);
      }
    }

    function registerMenus() {
      if (typeof GM_registerMenuCommand !== "function") return;
      for (const item of menuItems) {
        const enabled = state[item.id] !== false;
        const label = `${enabled ? "✅" : "⛔"} ${item.label}（點擊${enabled ? "停用" : "啟用"}）`;
        GM_registerMenuCommand(label, () => {
          state[item.id] = !enabled;
          save();
          window.location.reload();
        });
      }
    }

    function execute(id, label, factory) {
      try {
        factory();
        console.info(`[MWI Szerra ${packId}] 已啟動：${label}`);
      } catch (error) {
        console.error(`[MWI Szerra ${packId}] 模組啟動失敗：${label}`, error);
      }
    }

    function whenBodyReady(callback) {
      if (document.body) {
        callback();
        return;
      }
      const observer = new MutationObserver(() => {
        if (!document.body) return;
        observer.disconnect();
        callback();
      });
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    }

    function whenIdle(callback) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", callback, { once: true });
      } else {
        setTimeout(callback, 0);
      }
    }

    function run(id, label, phase, factory) {
      if (state[id] === false) {
        console.info(`[MWI Szerra ${packId}] 已停用：${label}`);
        return;
      }
      const callback = () => execute(id, label, factory);
      if (phase === "start") callback();
      else if (phase === "body") whenBodyReady(callback);
      else whenIdle(callback);
    }

    registerMenus();
    return { run };
  })();

  // ---------------------------------------------------------------------------
  // Module: 戰鬥技能特效
  // Original: MWI 戰鬥技能特效.user.js v0.1.13
  // Author: Local build for gzerr
  // License: MIT
  // Source: https://github.com/szerra/mwi-combat-vfx
  // WebSocket compatibility patches: 0
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("combat-vfx", "戰鬥技能特效", "start", () => {
    (function () {
      "use strict";
    
      const VERSION = "0.1.13";
      const CANVAS_ID = "mwiCombatVfxCanvas0113";
      const MONSTER_UNIT_CLASS = "mwiCombatVfxMonsterUnit";
      const ORIGINAL_SPLAT_STYLE_ID = "mwiCombatVfxOriginalMonsterSplatStyle";
      const WS_HOSTS = ["api.milkywayidle.com/ws", "api-test.milkywayidle.com/ws"];
      const HP_TRAIL_CLASS = "mwiCombatVfxHpTrail";
      const HP_TRAIL_DELAY = 90;
      const HP_TRAIL_DURATION = 460;
      const hpTrailStates = new WeakMap();
    
      if (window.__mwiCombatVfx0113Installed) return;
      window.__mwiCombatVfx0113Installed = true;
    
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
            : effect.isCrit ? rgba([255, 220, 86], alpha) : rgba([255, 255, 255], alpha);
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
    
      function drawBloomHeal(effect, p) {
        const target = effect.targets[0];
        if (!target) return;
        const color = effect.profile.color;
        const accent = COLORS.teal;
        const flower = [158, 255, 188];
        const targetPoint = target.point;
        const alpha = fadeOut(p, 0.75);
        const handAlpha = alpha * (0.72 + 0.28 * Math.sin(Math.PI * clamp(p / 0.7)));
    
        // The weapon mark belongs to the caster. Keep it small, in front of the
        // hand and clipped to that player's portrait so it never covers a teammate.
        withEffectClip(effect.casterBounds, () => {
          drawTridentGlyph(effect.casterHand, 44, color, flower, handAlpha, 1.35);
          discGlow(effect.casterHand.x, effect.casterHand.y, 5.5, accent, handAlpha * 0.42);
          for (let i = 0; i < 5; i++) {
            const angle = i * Math.PI * 2 / 5 + p * 1.2;
            const radius = 10 + 5 * easeOut(p);
            bloomPetal(
              effect.casterHand.x + Math.cos(angle) * radius,
              effect.casterHand.y + Math.sin(angle) * radius,
              angle,
              5,
              1.6,
              i % 2 ? flower : accent,
              handAlpha * 0.58
            );
          }
        });
    
        const bloom = clamp((p - 0.10) / 0.44);
        const bloomAlpha = fadeOut(p, 0.76);
        if (bloom <= 0 || bloomAlpha <= 0) return;
        const open = easeOut(bloom);
        const center = { x: targetPoint.x, y: targetPoint.y + 8 };
    
        // The receiver gets only a compact local heal bloom. No projectile crosses
        // the party and no second trident covers the healed character.
        withEffectClip(target.bounds, () => {
          discGlow(center.x, center.y, 7 + open * 7, color, bloomAlpha * 0.60);
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4 + p * 0.55;
            const radius = 5 + open * 10;
            bloomPetal(
              center.x + Math.cos(angle) * radius * 0.52,
              center.y + Math.sin(angle) * radius * 0.34,
              angle,
              6 + open * 9,
              2.0 + open * 2.3,
              i % 2 ? flower : accent,
              bloomAlpha * (0.56 + open * 0.28)
            );
          }
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
          const groundY = effect.sourceAnchor.groundY;
          ellipseGlow(effect.sourceAnchor.x, groundY, 10 + open * 22, 3 + open * 5, color, alpha * 0.72, 1.45);
          ellipseGlow(effect.sourceAnchor.x, groundY, 6 + open * 14, 2 + open * 3, accent, alpha * 0.58, 1.05);
    
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = rgba(accent, alpha * 0.84);
          ctx.shadowColor = rgba(color, alpha);
          ctx.shadowBlur = 7;
          ctx.lineWidth = 1.5;
          const radius = 15 + open * 4;
          for (let ring = 0; ring < 2; ring++) {
            const start = -Math.PI * 0.18 + ring * Math.PI;
            const end = start - Math.PI * (0.9 + open * 0.55);
            ctx.beginPath();
            ctx.arc(effect.sourceAnchor.x, effect.sourceAnchor.y, radius + ring * 7, start, end, true);
            ctx.stroke();
            const hx = effect.sourceAnchor.x + Math.cos(end) * (radius + ring * 7);
            const hy = effect.sourceAnchor.y + Math.sin(end) * (radius + ring * 7);
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + 5, hy - 2);
            ctx.lineTo(hx + 2, hy + 4);
            ctx.closePath();
            ctx.fillStyle = rgba(accent, alpha * 0.86);
            ctx.fill();
          }
          ctx.restore();
    
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
    
        const impact = clamp((p - 0.12) / 0.58);
        if (impact <= 0) return;
        const impactAlpha = fadeOut(impact, 0.58);
        const open = easeOut(impact);
        effect.targets.forEach((target, index) => {
          withEffectClip(target.bounds, () => {
            const point = target.point;
            drawTridentGlyph(point, 37, fire, core, impactAlpha, 1.28);
            ellipseGlow(point.x, point.y + 10, 7 + open * 18, 5 + open * 10, fire, impactAlpha * 0.72, 1.35);
            sparkBurst(point, 0.54 + impact * 0.36, fire, effect.seed + index * 29, 9, 24);
          });
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
          if (mode === "frostSurge") withEffectClip(target.bounds, drawTargetEffect);
          else drawTargetEffect();
        }
      }
    
      function drawIceEruption(target, progress, alpha, seed) {
        const anchor = target.anchor || {};
        const center = targetBodyPoint(target);
        const width = Number.isFinite(anchor.width) ? anchor.width : 100;
        const height = Number.isFinite(anchor.height) ? anchor.height : 100;
        const blockWidth = clamp(width * 0.58, 44, 70);
        const blockHeight = clamp(height * 0.52, 50, 78);
        const fall = easeInOut(clamp(progress / 0.62));
        const crash = clamp((progress - 0.62) / 0.38);
        const intactAlpha = alpha * (1 - smoothstep(0.04, 0.58, crash));
        const bounds = target.bounds;
        const startY = bounds ? bounds.top - blockHeight * 0.42 : center.y - height * 0.9;
        const impactY = center.y - clamp(height * 0.14, 8, 16);
        const blockY = lerp(startY, impactY, Math.pow(fall, 1.7));
        const blockX = center.x + Math.sin(progress * Math.PI * 3 + target.index) * 2.2 * (1 - fall);
    
        if (intactAlpha > 0.02) {
          for (let i = 0; i < 4; i++) {
            const streakX = blockX + (i - 1.5) * blockWidth * 0.21;
            const streakLength = 12 + rand(seed + target.index * 13, i) * 18;
            pathGlow([
              { x: streakX, y: blockY - blockHeight * 0.56 - streakLength },
              { x: streakX, y: blockY - blockHeight * 0.56 - 2 }
            ], COLORS.ice, intactAlpha * 0.38, 0.8, 4);
          }
    
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.translate(blockX, blockY);
          ctx.rotate((rand(seed + target.index, 2) - 0.5) * 0.10 * (1 - fall));
          ctx.shadowColor = rgba(COLORS.ice, intactAlpha);
          ctx.shadowBlur = 13;
          ctx.lineJoin = "round";
          ctx.lineWidth = 1.6;
    
          const left = -blockWidth / 2;
          const right = blockWidth / 2;
          const top = -blockHeight / 2;
          const bottom = blockHeight / 2;
          const bevel = clamp(blockWidth * 0.14, 6, 10);
    
          ctx.fillStyle = rgba([62, 177, 236], intactAlpha * 0.42);
          ctx.strokeStyle = rgba([231, 252, 255], intactAlpha * 0.94);
          ctx.beginPath();
          ctx.moveTo(left + bevel, top);
          ctx.lineTo(right - bevel * 0.55, top);
          ctx.lineTo(right, top + bevel);
          ctx.lineTo(right - bevel * 0.25, bottom - bevel * 0.45);
          ctx.lineTo(right - bevel, bottom);
          ctx.lineTo(left + bevel * 0.35, bottom);
          ctx.lineTo(left, bottom - bevel);
          ctx.lineTo(left, top + bevel * 0.65);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
    
          ctx.fillStyle = rgba([194, 247, 255], intactAlpha * 0.34);
          ctx.beginPath();
          ctx.moveTo(left + bevel, top);
          ctx.lineTo(right - bevel * 0.55, top);
          ctx.lineTo(right - bevel * 1.45, top + bevel);
          ctx.lineTo(left + bevel * 0.35, top + bevel * 1.18);
          ctx.closePath();
          ctx.fill();
    
          ctx.fillStyle = rgba([31, 119, 207], intactAlpha * 0.30);
          ctx.beginPath();
          ctx.moveTo(right - bevel * 1.45, top + bevel);
          ctx.lineTo(right - bevel * 0.55, top);
          ctx.lineTo(right, top + bevel);
          ctx.lineTo(right - bevel * 0.25, bottom - bevel * 0.45);
          ctx.lineTo(right - bevel * 1.25, bottom - bevel * 1.2);
          ctx.closePath();
          ctx.fill();
    
          ctx.strokeStyle = rgba([239, 254, 255], intactAlpha * (0.36 + fall * 0.5));
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-blockWidth * 0.08, top + bevel * 0.7);
          ctx.lineTo(-blockWidth * 0.18, -blockHeight * 0.06);
          ctx.lineTo(blockWidth * 0.02, blockHeight * 0.09);
          ctx.lineTo(-blockWidth * 0.11, bottom - bevel * 0.7);
          ctx.moveTo(blockWidth * 0.20, -blockHeight * 0.16);
          ctx.lineTo(blockWidth * 0.05, blockHeight * 0.02);
          ctx.stroke();
          ctx.restore();
        }
    
        if (crash <= 0) return;
        const burstAlpha = alpha * (1 - smoothstep(0.60, 1, crash));
        const burstCenter = { x: center.x, y: impactY + blockHeight * 0.16 };
        discGlow(burstCenter.x, burstCenter.y, 10 + easeOut(crash) * 20, COLORS.ice, burstAlpha * 0.68);
        ellipseGlow(burstCenter.x, burstCenter.y + 7, 12 + easeOut(crash) * 28, 6 + easeOut(crash) * 13, [224, 251, 255], burstAlpha * 0.72, 1.5);
    
        for (let i = 0; i < 12; i++) {
          const random = rand(seed + target.index * 31, i);
          const angle = lerp(-Math.PI * 0.94, -Math.PI * 0.06, random);
          const distance = easeOut(crash) * (12 + rand(seed + 17, i) * 40);
          const shardX = burstCenter.x + Math.cos(angle) * distance;
          const shardY = burstCenter.y + Math.sin(angle) * distance + crash * crash * 14;
          const shardSize = 3.5 + rand(seed + 29, i) * 6;
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
          ctx.moveTo(shardSize, 0);
          ctx.lineTo(-shardSize * 0.55, shardSize * 0.42);
          ctx.lineTo(-shardSize * 0.22, -shardSize * 0.38);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    
      function drawManaFountain(effect, target, progress, alpha) {
        const base = targetGroundPoint(target);
        for (let i = 0; i < 7; i++) {
          const offset = (i - 3) * 6;
          const height = progress * (45 + Math.abs(i - 3) * -4);
          pathGlow([{ x: base.x + offset, y: base.y }, { x: base.x + offset * 0.35, y: base.y - height }], COLORS.water, alpha, 2.2, 9);
        }
        const returnT = easeInOut(clamp((progress - 0.46) / 0.54));
        if (returnT > 0) {
          const control = { x: (base.x + effect.start.x) / 2, y: Math.min(base.y, effect.start.y) - 34 };
          const points = [];
          for (let i = 0; i <= 18; i++) points.push(qBezier(base, control, effect.start, returnT * i / 18));
          pathGlow(points, [75, 150, 255], alpha * 0.45, 1.4, 7);
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
          verticalMagicCircle(
            effect.sourceAnchor,
            effect.towardPoint,
            effect.profile.color,
            alpha,
            p * Math.PI * 5 + effect.seed,
            radius,
            p
          );
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
        const duration = 920;
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
  });

  // ---------------------------------------------------------------------------
  // Module: 戰鬥升級所需時間
  // Original: [银河奶牛]显示战斗升级所需时间.user.js v1.4
  // Author: DOUBAO-DiamondMoo
  // License: MIT
  // Source: https://greasyfork.org/scripts/556360
  // WebSocket compatibility patches: 0
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("level-time", "戰鬥升級所需時間", "idle", () => {
    (function() {
        'use strict';
    
        // 技能中英对照表
        const SKILL_MAP = {
            "/skills/stamina": "耐力",
            "/skills/intelligence": "智力",
            "/skills/attack": "攻击",
            "/skills/defense": "防御",
            "/skills/melee": "近战",
            "/skills/ranged": "远程",
            "/skills/magic": "魔法"
        };
    
        // 反向技能映射（通过技能名称找key）
        const REVERSE_SKILL_MAP = Object.fromEntries(
            Object.entries(SKILL_MAP).map(([key, value]) => [value, key])
        );
    
        // 已处理的提示框列表，避免重复处理
        const processedTooltips = new Set();
    
        // 获取游戏核心状态
        function getGameState() {
            try {
                // 获取GamePage元素
                const gamePageEl = document.querySelector('[class^="GamePage"]');
                if (!gamePageEl) return null;
    
                // 提取react fiber节点
                const fiberKeys = Reflect.ownKeys(gamePageEl).filter(k =>
                    k.startsWith('__reactFiber$')
                );
    
                if (fiberKeys.length === 0) return null;
    
                // 尝试找到有效的fiber key
                for (const fiberKey of fiberKeys) {
                    const stateNode = gamePageEl[fiberKey]?.return?.stateNode;
                    if (stateNode?.state) {
                        return stateNode.state;
                    }
                }
    
                return null;
            } catch (error) {
                console.log(`[升级时间脚本] 获取游戏状态出错:`, error);
                return null;
            }
        }
    
        // 计算战斗持续时间（秒）
        function calculateBattleDuration(combatStartTime) {
            if (!combatStartTime) return 0;
            const start = new Date(combatStartTime).getTime();
            const now = new Date().getTime(); // 当前UTC时间（与start时区一致）
            return Math.max(1, Math.floor((now - start) / 1000)); // 最小1秒避免除零
        }
    
        // 格式化秒数为年日时分
        function formatSeconds(seconds) {
            const years = Math.floor(seconds / 31536000); // 365天×24小时×3600秒
            seconds %= 31536000;
            const days = Math.floor(seconds / 86400); // 24×3600
            seconds %= 86400;
            const hours = Math.floor(seconds / 3600);
            seconds %= 3600;
            const minutes = Math.floor(seconds / 60);
    
            // 拼接非零单位
            const parts = [];
            if (years > 0) parts.push(`${years.toLocaleString()} y`);
            if (days > 0) parts.push(`${days} d`);
            if (hours > 0) parts.push(`${hours} h`);
            if (minutes > 0 || parts.length === 0) parts.push(`${minutes} m`);
            return parts.join(' ');
        }
    
        // 处理技能提示框
        function handleSkillTooltip(tooltipEl) {
            try {
                // 检查是否已处理过
                if (processedTooltips.has(tooltipEl)) return;
                processedTooltips.add(tooltipEl);
    
                const gameState = getGameState();
                if (!gameState) return;
    
                // 1. 获取当前角色ID和战斗信息
                const playerId = gameState.character?.id;
                const battlePlayers = gameState.battlePlayers;
                const combatStartTime = gameState.combatStartTime;
    
                // 校验战斗状态
                if (!playerId || !battlePlayers || !combatStartTime) {
                    console.log("未在战斗中");
                    return;
                }
    
                // 2. 找到当前玩家在战斗中的索引
                let playerIndex = battlePlayers.findIndex(
                    p => p.character?.id === playerId
                );
    
    
                // 3. 获取当前提示框的技能名称
                const skillNameEl = tooltipEl.querySelector('.NavigationBar_name__jAIEQ');
                const skillName = skillNameEl?.textContent?.trim();
                if (!skillName || !REVERSE_SKILL_MAP[skillName]) {
                    return;
                }
    
                // 4. 获取该技能的总经验和升级所需经验
                const playerData = battlePlayers[playerIndex];
                const totalExpMap = playerData.totalSkillExperienceMap;
                const skillKey = REVERSE_SKILL_MAP[skillName];
                const totalExp = totalExpMap?.[skillKey] || 0;
    
                // 获取升级所需经验
                const needExpEl = tooltipEl.querySelector('div:nth-child(4)');
                const needExp = needExpEl
                    ? parseFloat(needExpEl.textContent.replace(/[^0-9.-]/g, ''))
                    : 0;
    
                if (totalExp <= 0 || needExp <= 0) {
                    return;
                }
    
                // 5. 计算每小时经验值
                const battleDurationSec = calculateBattleDuration(combatStartTime);
                const expPerHour = (totalExp / battleDurationSec) * 3600;
                if (expPerHour <= 0) {
                    return;
                }
    
                // 6. 计算升级剩余时间并创建元素
                const remainingSec = Math.ceil(needExp / expPerHour * 3600);
                const remainingTimeStr = formatSeconds(remainingSec);
    
                // 7. 计算升级具体时间
                function formatUpgradeTime(seconds) {
                    const now = new Date();
                    const upgradeDate = new Date(now.getTime() + seconds * 1000);
    
                    const currentYear = now.getFullYear();
                    const upgradeYear = upgradeDate.getFullYear();
                    const month = String(upgradeDate.getMonth() + 1).padStart(2, '0');
                    const day = String(upgradeDate.getDate()).padStart(2, '0');
                    const hours = String(upgradeDate.getHours()).padStart(2, '0');
                    const minutes = String(upgradeDate.getMinutes()).padStart(2, '0');
    
                    // 如果升级时间超过30天且跨年度才显示年份
                    const days = Math.floor(seconds / 86400);
                    if (days >= 30 && upgradeYear > currentYear) {
                        return `${upgradeYear}/${month}/${day} ${hours}:${minutes}`;
                    } else {
                        return `${month}/${day} ${hours}:${minutes}`;
                    }
                }
    
                const upgradeTimeStr = formatUpgradeTime(remainingSec);
    
                // 8. 插入或更新升级时间元素（避免重复）
                let timeEl = tooltipEl.querySelector('.upgrade-time-display');
                if (!timeEl) {
                    timeEl = document.createElement('div');
                    timeEl.className = 'upgrade-time-display';
                    timeEl.style.cssText = 'line-height: 1.4;';
                    // 插入到升级所需经验之后、说明信息之前
                    const infoEl = tooltipEl.querySelector('.NavigationBar_info__3zahT');
                    tooltipEl.insertBefore(timeEl, infoEl);
                }
                timeEl.innerHTML = `升级所需时间:  ${remainingTimeStr}<br>升级具体时间: ${upgradeTimeStr}`;
    
            } catch (error) {
                console.log(`[升级时间脚本] 处理技能提示框出错:`, error);
            }
        }
    
        // 初始化脚本
        function initScript() {
            // 使用MutationObserver监听DOM变化
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    // 检查添加的节点
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            // 检查节点本身是否是提示框
                            if (node.classList.contains('NavigationBar_navigationSkillTooltip__3a9Rz')) {
                                handleSkillTooltip(node);
                            }
                            // 检查节点内是否包含提示框
                            const tooltips = node.querySelectorAll('.NavigationBar_navigationSkillTooltip__3a9Rz');
                            if (tooltips.length > 0) {
                                tooltips.forEach(tooltip => {
                                    handleSkillTooltip(tooltip);
                                });
                            }
                        }
                    });
    
                    // 检查修改的节点（提示框可能通过修改现有节点显示）
                    if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
                        const target = mutation.target;
                        // 检查目标节点是否是提示框或包含提示框
                        if (target.classList.contains('NavigationBar_navigationSkillTooltip__3a9Rz')) {
                            handleSkillTooltip(target);
                        }
                        const tooltips = target.querySelectorAll('.NavigationBar_navigationSkillTooltip__3a9Rz');
                        if (tooltips.length > 0) {
                            tooltips.forEach(tooltip => {
                                handleSkillTooltip(tooltip);
                            });
                        }
                    }
                });
            });
    
            // 监听整个文档的变化
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'data-popper-placement'] // 常见的提示框变化属性
            });
        }
    
        // 等待页面完全加载后初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initScript);
        } else {
            initScript();
        }
    })();
  });

  // ---------------------------------------------------------------------------
  // Module: 戰鬥模擬即時匯入
  // Original: [MWI] Realtime Import Of Battle Simulation.user.js v0.3.6
  // Author: Yannis
  // License: CC-BY-NC-SA-4.0
  // Source: https://greasyfork.org/scripts/539672
  // WebSocket compatibility patches: 1
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("realtime-simulator", "戰鬥模擬即時匯入", "idle", () => {
    // 感谢 'MWITool' 为本脚本提供的技术参考，本脚本部分代码来源于 MWITool，请勿删除本版权声明
    // 本脚本若有任何问题，欢迎随时与开发者联系与反馈，感谢使用
    // Thanks 'MWITool' for the technical reference provided for this script.
    // Some of the code in this script is sourced from MWITool.
    // Please do not delete this copyright notice.
    //
    // https://greasyfork.org/en/scripts/494467-mwitools
    
    (function () {
        'use strict';
    
        const debug = console.log.bind(null, '%c[BatSync]%c', 'color:green', 'color:black');
        const info = console.log.bind(null, '%c[BatSync]%c', 'color:cyan', 'color:black');
        const error = console.log.bind(null, '%c[BatSync]%c', 'color:red', 'color:black');
    
        // 语言设定
        const isZHInGameSetting = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
        let isZH = isZHInGameSetting;
    
        let playerId;
        let firstImport = true;
        let clientData = {};
    
        // #region Utils
    
        /**
         * 解压缩数据
         * @param {string} compressed - 偏移后的压缩数据
         * @returns {string} 解压后的原始数据
         */
        function decompressData(compressed) {
            if (!compressed || compressed === "") return "";
    
            try {
                // 使用标准库解压
                return LZString.decompressFromUTF16(compressed);
            } catch (e) {
                error("解压失败:", e);
                return "";
            }
        }
    
        // #endregion
    
        // #region TextDB
    
        // 从TextDB获取数据
        async function getDataFromTextDB(key) {
            // info(`Get data from TextDB: ${key}`);
    
            const response = await new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://textdb.online/${key}`,
                    timeout: 5000,
                    onload: resolve,
                    ontimeout: (e) => resolve({ status: 504, error: "timeout" }),
                    onerror: (e) => resolve({ status: 500, error: e })
                })
            });
            if (response.status !== 200) {
                error(`Error get from TextDB`, {
                    key: key,
                    status: response.status,
                    error: response.error
                });
            } else {
                info(`Get data from TextDB`, {
                    key: key,
                    data: response.responseText
                });
            }
    
            return response.responseText;
        }
    
        // 保存数据到TextDB
        async function saveDataToTextDB(key, data) {
            // info("保存TextDB数据", {
            //     key: key,
            //     data: data
            // });
    
            const params = new URLSearchParams();
            params.append('key', key);
            params.append('value', data.toString());
    
            const response = await new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.textdb.online/update/',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    data: params,
                    onload: resolve,
                    onerror: function (e) {
                        error("Error saving to TextDB:", e);
                        reject(e);
                    }
                });
            });
    
            if (response.status !== 200) {
                error('Failed saving to TextDB:', response);
            } else {
                info(`Save data to TextDB success, key: ${key}`)
            }
        }
    
        // 生成玩家唯一Key(MD5)
        function getPlayerUniqueKey(characterId) {
            return `mwi_${characterId}_${md5(md5(characterId))}`;
        }
    
        // #endregion
    
        // #region 角色数据
    
        // 获取客户端初始化数据
        function getInitClientData() {
            const compressed = GM_getValue("init_client_data", "");
            return JSON.parse(decompressData(compressed));
        }
    
        // 获取当前角色数据
        function getCurrentPlayerData() {
            let playerId = GM_getValue("current_character_id", null);
            if (playerId) {
                return getPlayerData(playerId);
            } else {
                return;
            }
        }
    
        // 获取角色数据
        function getPlayerData(id) {
            let playersDataStr = GM_getValue("mwi_players_data", null) || JSON.stringify(new Array());
            let playersData = JSON.parse(playersDataStr);
            const pIndex = playersData.findIndex(obj => obj.character.id === id);
            if (pIndex !== -1) {
                return playersData[pIndex];
            } else {
                return;
            }
        }
    
        // 保存角色数据
        function saveCharacterData(obj) {
            let playersDataStr = GM_getValue("mwi_players_data", null) || JSON.stringify(new Array());
            let playersData = JSON.parse(playersDataStr);
            playersData = playersData.filter(e => e.character.id !== obj.character.id);
            playersData.unshift(obj);
            if (playersData.length > 20) {
                playersData.pop();
            }
            GM_setValue("mwi_players_data", JSON.stringify(playersData));
        }
    
        // #endregion
    
        // #region HookMessage
    
        // 监听WebSocket
        function hookWS() {
            const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
            const oriGet = dataProperty.get;
    
            dataProperty.get = hookedGet;
            Object.defineProperty(MessageEvent.prototype, "data", dataProperty);
    
            function hookedGet() {
                const socket = this.currentTarget;
                if (!(socket instanceof WebSocket)) {
                    return oriGet.call(this);
                }
                if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1 && socket.url.indexOf("api.milkywayidlecn.com/ws") <= -1 && socket.url.indexOf("api-test.milkywayidle.com/ws") <= -1) {
                    return oriGet.call(this);
                }
    
                const message = oriGet.call(this);
                Object.defineProperty(this, "data", { value: message, configurable: true }); // Anti-loop
    
                try {
                    handleMessage(message);
                } catch (e) {
                    error(`处理消息协议时出错: ${e}`);
                    console.log(e.stack);
                }
                return message;
            }
        }
    
        // 消息处理
        function handleMessage(message) {
            let obj = JSON.parse(message);
            if (!obj) {
                return;
            }
            switch (obj.type) {
                case 'pong': {
                    // ping-pong
                    break;
                }
                case 'active_player_count_updated': {
                    // 活跃人数更新
                    break;
                }
                case 'init_client_data': {
                    // 客户端数据
                    clientData.actionDetailMap = obj.actionDetailMap;
                    clientData.levelExperienceTable = obj.levelExperienceTable;
                    clientData.itemDetailMap = obj.itemDetailMap;
                    clientData.actionCategoryDetailMap = obj.actionCategoryDetailMap;
                    clientData.abilityDetailMap = obj.abilityDetailMap;
                    break;
                }
                case 'init_character_data': {
                    playerId = obj.character.id;
                    // 初始化信息
                    GM_setValue("init_character_data", message);
                    GM_setValue("current_character_id", playerId);
                    let player = getPlayerData(playerId);
                    if (player) {
                        obj.abilityCombatTriggersMap = { ...player.abilityCombatTriggersMap, ...obj.abilityCombatTriggersMap }
                        obj.consumableCombatTriggersMap = { ...player.consumableCombatTriggersMap, ...obj.consumableCombatTriggersMap }
                    }
                    obj.battleObj = buildBattleObjFromPlayer(obj, true);
                    saveCharacterData(obj);
                    saveDataToTextDB(getPlayerUniqueKey(playerId), JSON.stringify(obj.battleObj));
                    break;
                }
                case 'profile_shared': {
                    // 角色详情
                    let player = getPlayerData(obj.profile.characterSkills[0].characterID)
                    let battleObj = buildBattleObjFromProfileShared(player, obj);
                    if (!player) {
                        // 不是本角色
                        player = {}
                        player.character = {}
                        player.character.id = battleObj.character.id
                        player.character.name = battleObj.character.name
                    }
                    player.battleObj = battleObj;
                    saveCharacterData(player);
                    let playerUniqueKey = getPlayerUniqueKey(player.character.id);
                    info(`Player Uniquekey: `, {
                        playerId: player.character.id,
                        playerName: player.character.name,
                        playerUniqueKey: playerUniqueKey,
                        textDBUrl: `https://textdb.online/${playerUniqueKey}`
                    });
    
                    addExportButton(player.character.id);
                    break;
                }
                case 'new_battle': {
                    // 战斗更新
                    for (const battlePlayer of obj.players) {
                        let player = getPlayerData(battlePlayer.character.id);
                        let battleObj = buildBattleObjFromNewBattle(player, battlePlayer);
                        if (!player) {
                            // 不是本角色
                            player = {}
                            player.character = {}
                            player.character.id = battleObj.character.id
                            player.character.name = battleObj.character.name
                        }
                        player.battleObj = battleObj;
                        saveCharacterData(player);
                    }
                    break;
                }
                case 'items_updated': {
                    // 物品更新
                    let player = getPlayerData(playerId);
                    if (!player) {
                        break;
                    }
                    let update = false;
                    if (obj.endCharacterItems) {
                        for (const item of Object.values(obj.endCharacterItems)) {
                            if (item.itemLocationHrid !== "/item_locations/inventory" && item.count > 0) {
                                // 装备更新
                                let equipment = player.battleObj.player.equipment;
                                equipment = equipment.filter(e => e.itemLocationHrid !== item.itemLocationHrid);
                                equipment.push({
                                    itemLocationHrid: item.itemLocationHrid,
                                    itemHrid: item.itemHrid,
                                    enhancementLevel: item.enhancementLevel,
                                })
                                player.battleObj.player.equipment = equipment;
                                update = true;
                            }
                        }
                    }
                    if (update) {
                        saveCharacterData(player);
                    }
                    break;
                }
                case 'action_type_consumable_slots_updated': {
                    // 消耗栏更新
                    let player = getPlayerData(playerId);
                    if (!player) {
                        break;
                    }
                    player.actionTypeDrinkSlotsMap = obj.actionTypeDrinkSlotsMap;
                    player.actionTypeFoodSlotsMap = obj.actionTypeFoodSlotsMap;
                    player.battleObj = buildBattleObjFromPlayer(player, false);
                    saveCharacterData(player);
                    break;
                }
                case 'abilities_updated': {
                    // 技能更新
                    let player = getPlayerData(playerId);
                    let equippedAbilities = [];
                    for (let i = equippedAbilities.length; i < 5; i++) {
                        equippedAbilities.push({})
                    }
                    if (obj.endCharacterAbilities) {
                        // 更新技能详情
                        for (const ability of obj.endCharacterAbilities) {
                            const aDetail = player.characterAbilities.find(e => e.abilityHrid === ability.abilityHrid);
                            if (aDetail) {
                                aDetail.slotNumber = ability.slotNumber;
                            }
                        }
                        // 更新技能列表
                        const slotAbilities = player.characterAbilities.filter(e => e.slotNumber > 0);
                        for (const ability of slotAbilities) {
                            equippedAbilities[ability.slotNumber - 1] = {
                                abilityHrid: ability.abilityHrid,
                                level: ability.level,
                                experience: ability.experience,
                                availableTime: ability.updatedAt
                            }
                        }
                    }
                    player.combatUnit.combatAbilities = equippedAbilities.filter(e => e.abilityHrid && e.abilityHrid.length > 0);
                    player.battleObj = buildBattleObjFromPlayer(player, false);
                    saveCharacterData(player);
                    break;
                }
                case 'combat_triggers_updated': {
                    let player = getPlayerData(playerId);
                    if (!player) {
                        break;
                    }
                    if (obj.combatTriggerTypeHrid === '/combat_trigger_types/ability') {
                        // 技能栏 Trigger 更新
                        player.abilityCombatTriggersMap[obj.abilityHrid] = obj.combatTriggers;
                    } else if (obj.combatTriggerTypeHrid === '/combat_trigger_types/consumable') {
                        // 消耗栏 Trigger 更新
                        player.consumableCombatTriggersMap[obj.itemHrid] = obj.combatTriggers;
                    } else {
                        break;
                    }
                    player.battleObj = buildBattleObjFromPlayer(player, false);
                    saveCharacterData(player);
                    saveDataToTextDB(getPlayerUniqueKey(playerId), JSON.stringify(player.battleObj));
                    break;
                }
                case 'all_combat_triggers_updated': {
                    // 所有 Triggers 更新
                    let player = getPlayerData(playerId);
                    if (!player) {
                        break;
                    }
                    player.abilityCombatTriggersMap = { ...player.abilityCombatTriggersMap, ...obj.abilityCombatTriggersMap };
                    player.consumableCombatTriggersMap = { ...player.consumableCombatTriggersMap, ...obj.consumableCombatTriggersMap };
                    player.battleObj = buildBattleObjFromPlayer(player, false);
                    saveCharacterData(player);
                    saveDataToTextDB(getPlayerUniqueKey(playerId), JSON.stringify(player.battleObj));
                    break;
                }
                case 'party_updated': {
                    // 队伍更新
                    let player = getPlayerData(playerId);
                    if (!player) {
                        break;
                    }
                    player.partyInfo = obj.partyInfo;
                    saveCharacterData(player);
                    break;
                }
                case 'chat_message_received': {
                    // 聊天消息
                    break;
                }
                case 'action_completed': {
                    // 行动完成
                    break;
                }
                default: {
                    // info(obj);
                }
            }
        }
    
        // #endregion
    
        // #region Builders
    
        // 构建战斗模拟信息(InitData)
        function buildBattleObjFromPlayer(obj, init) {
            let battleObj = init ? {} : obj.battleObj;
            // Base
            battleObj.character = {}
            battleObj.character.id = obj.character.id;
            battleObj.character.name = obj.character.name;
            battleObj.character.gameMode = obj.character.gameMode;
            battleObj.timestamp = Date.now();
            battleObj.valid = true;
            if (init) {
                // Levels
                battleObj.player = {}
                for (const skill of obj.characterSkills) {
                    if (skill.skillHrid.includes("stamina")) {
                        battleObj.player.staminaLevel = skill.level;
                    } else if (skill.skillHrid.includes("intelligence")) {
                        battleObj.player.intelligenceLevel = skill.level;
                    } else if (skill.skillHrid.includes("attack")) {
                        battleObj.player.attackLevel = skill.level;
                    } else if (skill.skillHrid.includes("melee")) {
                        battleObj.player.meleeLevel = skill.level;
                    } else if (skill.skillHrid.includes("defense")) {
                        battleObj.player.defenseLevel = skill.level;
                    } else if (skill.skillHrid.includes("ranged")) {
                        battleObj.player.rangedLevel = skill.level;
                    } else if (skill.skillHrid.includes("magic")) {
                        battleObj.player.magicLevel = skill.level;
                    }
                }
                // Equipments
                battleObj.player.equipment = [];
                if (obj.characterItems) {
                    for (const item of obj.characterItems) {
                        if (!item.itemLocationHrid.includes("/item_locations/inventory")) {
                            battleObj.player.equipment.push({
                                itemLocationHrid: item.itemLocationHrid,
                                itemHrid: item.itemHrid,
                                enhancementLevel: item.enhancementLevel,
                            });
                        }
                    }
                }
            }
            // Food
            battleObj.food = {}
            battleObj.food["/action_types/combat"] = [];
            if (obj.actionTypeFoodSlotsMap["/action_types/combat"]) {
                for (const food of obj.actionTypeFoodSlotsMap["/action_types/combat"]) {
                    if (food) {
                        battleObj.food["/action_types/combat"].push({
                            itemHrid: food.itemHrid,
                        });
                    } else {
                        battleObj.food["/action_types/combat"].push({
                            itemHrid: "",
                        });
                    }
                }
            }
            // Drinks
            battleObj.drinks = {}
            battleObj.drinks["/action_types/combat"] = [];
            if (obj.actionTypeDrinkSlotsMap["/action_types/combat"]) {
                for (const drink of obj.actionTypeDrinkSlotsMap["/action_types/combat"]) {
                    if (drink) {
                        battleObj.drinks["/action_types/combat"].push({
                            itemHrid: drink.itemHrid,
                        });
                    } else {
                        battleObj.drinks["/action_types/combat"].push({
                            itemHrid: "",
                        });
                    }
                }
            }
            // Abilities
            battleObj.abilities = [];
            for (let i = 0; i < 5; i++) {
                battleObj.abilities.push({
                    abilityHrid: "",
                    level: "1",
                })
            }
            if (obj.combatUnit.combatAbilities) {
                for (const ability of obj.combatUnit.combatAbilities) {
                    const aDetail = obj.characterAbilities.find(e => e.abilityHrid === ability.abilityHrid);
                    if (aDetail) {
                        battleObj.abilities[aDetail.slotNumber - 1] = {
                            abilityHrid: ability.abilityHrid,
                            level: ability.level,
                            experience: ability.experience,
                            availableTime: ability.updatedAt
                        };
                    }
                }
            }
            // TriggerMap
            battleObj.triggerMap = { ...obj.abilityCombatTriggersMap, ...obj.consumableCombatTriggersMap };
            // HouseRooms
            battleObj.houseRooms = {};
            if (obj.characterHouseRoomMap) {
                for (const house of Object.values(obj.characterHouseRoomMap)) {
                    battleObj.houseRooms[house.houseRoomHrid] = house.level;
                }
            }
            return battleObj;
        }
    
        // 构建战斗模拟信息(ProfileShared)
        function buildBattleObjFromProfileShared(player, obj) {
            let battleObj = {};
            // Base
            battleObj.character = {}
            battleObj.character.id = player ? player.character.id : obj.profile.characterSkills[0].characterID;
            battleObj.character.name = obj.profile.sharableCharacter.name;
            battleObj.character.gameMode = obj.profile.sharableCharacter.gameMode;
            battleObj.timestamp = Date.now();
            battleObj.valid = true;
            // Levels
            battleObj.player = {}
            for (const skill of obj.profile.characterSkills) {
                if (skill.skillHrid.includes("stamina")) {
                    battleObj.player.staminaLevel = skill.level;
                } else if (skill.skillHrid.includes("intelligence")) {
                    battleObj.player.intelligenceLevel = skill.level;
                } else if (skill.skillHrid.includes("attack")) {
                    battleObj.player.attackLevel = skill.level;
                } else if (skill.skillHrid.includes("melee")) {
                    battleObj.player.meleeLevel = skill.level;
                } else if (skill.skillHrid.includes("defense")) {
                    battleObj.player.defenseLevel = skill.level;
                } else if (skill.skillHrid.includes("ranged")) {
                    battleObj.player.rangedLevel = skill.level;
                } else if (skill.skillHrid.includes("magic")) {
                    battleObj.player.magicLevel = skill.level;
                }
            }
            // Equipments
            battleObj.player.equipment = [];
            if (obj.profile.wearableItemMap) {
                for (const key in obj.profile.wearableItemMap) {
                    const item = obj.profile.wearableItemMap[key];
                    battleObj.player.equipment.push({
                        itemLocationHrid: item.itemLocationHrid,
                        itemHrid: item.itemHrid,
                        enhancementLevel: item.enhancementLevel,
                    });
                }
            }
            // Food and Drinks
            battleObj.food = {}
            battleObj.food["/action_types/combat"] = [];
            battleObj.drinks = {}
            battleObj.drinks["/action_types/combat"] = [];
            let wearableItemMap = obj.profile.wearableItemMap;
            let weapon = null;
            if (wearableItemMap) {
                weapon = wearableItemMap["/item_locations/main_hand"]?.itemHrid ||
                    wearableItemMap["/item_locations/two_hand"]?.itemHrid;
            }
            if (player) {
                battleObj.food = player.battleObj.food;
                battleObj.drinks = player.battleObj.drinks;
            } else if (weapon) {
                if (weapon.includes("shooter") || weapon.includes("bow")) {
                    // 远程
                    battleObj.food["/action_types/combat"] = [
                        // 2红1蓝
                        { itemHrid: "/items/spaceberry_donut" },
                        { itemHrid: "/items/spaceberry_cake" },
                        { itemHrid: "/items/star_fruit_yogurt" }
                    ]
                    battleObj.drinks["/action_types/combat"] = [
                        // 经验.超远.暴击
                        { itemHrid: "/items/wisdom_coffee" },
                        { itemHrid: "/items/super_ranged_coffee" },
                        { itemHrid: "/items/critical_coffee" }
                    ]
                } else if (weapon.includes("boomstick") || weapon.includes("staff") || weapon.includes("trident")) {
                    // 法师
                    battleObj.food["/action_types/combat"] = [
                        // 1红2蓝
                        { itemHrid: "/items/spaceberry_cake" },
                        { itemHrid: "/items/star_fruit_gummy" },
                        { itemHrid: "/items/star_fruit_yogurt" }
                    ]
                    battleObj.drinks["/action_types/combat"] = [
                        // 经验.超魔.吟唱
                        { itemHrid: "/items/wisdom_coffee" },
                        { itemHrid: "/items/super_magic_coffee" },
                        { itemHrid: "/items/channeling_coffee" }
                    ]
                } else if (weapon.includes("bulwark")) {
                    // 双手盾
                    battleObj.food["/action_types/combat"] = [
                        // 2红1蓝
                        { itemHrid: "/items/spaceberry_donut" },
                        { itemHrid: "/items/spaceberry_cake" },
                        { itemHrid: "/items/star_fruit_yogurt" }
                    ]
                    battleObj.drinks["/action_types/combat"] = [
                        // 经验.超防.超耐
                        { itemHrid: "/items/wisdom_coffee" },
                        { itemHrid: "/items/super_defense_coffee" },
                        { itemHrid: "/items/super_stamina_coffee" }
                    ]
                } else {
                    // 近战
                    battleObj.food["/action_types/combat"] = [
                        // 2红1蓝
                        { itemHrid: "/items/spaceberry_donut" },
                        { itemHrid: "/items/spaceberry_cake" },
                        { itemHrid: "/items/star_fruit_yogurt" }
                    ]
                    battleObj.drinks["/action_types/combat"] = [
                        // 经验.超力.迅捷
                        { itemHrid: "/items/wisdom_coffee" },
                        { itemHrid: "/items/super_power_coffee" },
                        { itemHrid: "/items/swiftness_coffee" }
                    ]
                }
            }
            // Abilities
            battleObj.abilities = [];
            for (let i = 0; i < 5; i++) {
                battleObj.abilities.push({
                    abilityHrid: "",
                    level: "1",
                })
            }
            if (obj.profile.equippedAbilities) {
                let index = 1;
                for (const ability of obj.profile.equippedAbilities) {
                    if (ability && clientData.abilityDetailMap[ability.abilityHrid].isSpecialAbility) {
                        battleObj.abilities[0] = {
                            abilityHrid: ability.abilityHrid,
                            level: ability.level,
                            experience: ability.experience,
                            availableTime: ability.updatedAt
                        };
                    } else if (ability) {
                        battleObj.abilities[index++] = {
                            abilityHrid: ability.abilityHrid,
                            level: ability.level,
                            experience: ability.experience,
                            availableTime: ability.updatedAt
                        };
                    }
                }
            }
            // TriggerMap
            if (player) {
                battleObj.triggerMap = player.battleObj.triggerMap;
            }
            // HouseRooms
            battleObj.houseRooms = {};
            for (const house of Object.values(obj.profile.characterHouseRoomMap)) {
                battleObj.houseRooms[house.houseRoomHrid] = house.level;
            }
            return battleObj;
        }
    
        // 构建战斗模拟信息(NewBattle)
        function buildBattleObjFromNewBattle(player, obj) {
            let battleObj = {};
            if (player) {
                battleObj = player.battleObj;
            }
            // Base
            battleObj.character = battleObj.character ?? {};
            battleObj.character.id = obj.character.id;
            battleObj.character.name = obj.character.name;
            battleObj.character.gameMode = obj.character.gameMode;
            battleObj.timestamp = Date.now();
            battleObj.valid = battleObj.valid;
            // Levels
            battleObj.player = battleObj.player ?? {};
            battleObj.player.staminaLevel = battleObj.player.staminaLevel ?? 1;
            battleObj.player.intelligenceLevel = battleObj.player.intelligenceLevel ?? 1;
            battleObj.player.attackLevel = battleObj.player.attackLevel ?? 1;
            battleObj.player.meleeLevel = battleObj.player.meleeLevel ?? 1;
            battleObj.player.defenseLevel = battleObj.player.defenseLevel ?? 1;
            battleObj.player.rangedLevel = battleObj.player.rangedLevel ?? 1;
            battleObj.player.magicLevel = battleObj.player.magicLevel ?? 1;
            // Equipments
            battleObj.player.equipment = battleObj.player.equipment ?? [];
            // Food and Drinks
            battleObj.food = {};
            battleObj.food["/action_types/combat"] = [];
            battleObj.drinks = {};
            battleObj.drinks["/action_types/combat"] = [];
            if (obj.combatConsumables) {
                for (const consumable of obj.combatConsumables) {
                    if (consumable.itemHrid.includes("coffee")) {
                        battleObj.drinks["/action_types/combat"].push({
                            itemHrid: consumable.itemHrid
                        })
                    } else {
                        battleObj.food["/action_types/combat"].push({
                            itemHrid: consumable.itemHrid
                        })
                    }
                }
            }
            // Abilities
            battleObj.abilities = [];
            for (let i = 0; i < 5; i++) {
                battleObj.abilities.push({
                    abilityHrid: "",
                    level: "1",
                })
            }
            if (obj.combatAbilities) {
                let index = 1;
                for (const ability of obj.combatAbilities) {
                    if (ability && clientData.abilityDetailMap[ability.abilityHrid].isSpecialAbility) {
                        battleObj.abilities[0] = {
                            abilityHrid: ability.abilityHrid,
                            level: ability.level,
                            experience: ability.experience,
                            availableTime: ability.updatedAt
                        };
                    } else if (ability) {
                        battleObj.abilities[index++] = {
                            abilityHrid: ability.abilityHrid,
                            level: ability.level,
                            experience: ability.experience,
                            availableTime: ability.updatedAt
                        };
                    }
                }
            }
            // TriggerMap
            battleObj.triggerMap = { ...battleObj.triggerMap };
            // HouseRooms
            battleObj.houseRooms = { ...battleObj.houseRooms };
            return battleObj;
        }
    
        // #endregion
    
        // #region Battle Simulater
    
        // 添加个人资料导出
        function addExportButton(characterId) {
            const checkElem = () => {
                const selectedElement = document.querySelector(`div.SharableProfile_overviewTab__W4dCV`);
                if (selectedElement) {
                    clearInterval(timer);
                    const button = document.createElement("button");
                    selectedElement.appendChild(button);
                    button.textContent = isZH ? "查看云模拟数据" : "View Cloud Data";
                    button.style.borderRadius = "5px";
                    button.style.height = "30px";
                    button.style.backgroundColor = "orange";
                    button.style.color = "black";
                    button.style.boxShadow = "none";
                    button.style.border = "0px";
                    button.onclick = function () {
                        window.open(`https://textdb.online/${getPlayerUniqueKey(characterId)}`)
                        return false;
                    };
                    return false;
                }
            };
            let timer = setInterval(checkElem, 200);
        }
    
        function refreshLoadoutOptions(selectBox, loadouts) {
            if (!selectBox) {
                return;
            }
            selectBox.options.length = 0;
            selectBox.disabled = true;
    
            let defaultOption = document.createElement("option");
            defaultOption.textContent = isZH ? "选择游戏内配装" : "Select Game Loadout";
            defaultOption.selected = true;
            defaultOption.disabled = true;
            defaultOption.hidden = true;
            selectBox.appendChild(defaultOption);
            if (loadouts) {
                for (const loadout of loadouts) {
                    selectBox.options.add(new Option(loadout.name, loadout.id));
                    let option = document.createElement("option");
                    option.textContent = loadout.name;
                    option.value = loadout.id;
                }
            }
        }
    
        // 添加实时导入按钮
        function addImportButtonForMWICombatSimulate() {
            const checkElem = () => {
                clearInterval(timer);
    
                const equipCol = document.querySelector(`.container-fluid`)?.querySelector(`.col-md-5`);
                if (equipCol) {
                    let loadoutDiv = document.createElement("div");
                    loadoutDiv.className = "row mb-3";
                    equipCol.insertBefore(loadoutDiv, equipCol.firstChild);
    
                    // 配装导入按钮selectBox
                    let selectBoxDiv = document.createElement("div");
                    loadoutDiv.appendChild(selectBoxDiv);
                    selectBoxDiv.className = "col-md-6";
    
                    let selectBox = document.createElement("select");
                    selectBoxDiv.appendChild(selectBox);
                    selectBox.id = "selectLoadout"
                    selectBox.className = "form-select";
                    refreshLoadoutOptions(selectBox);
    
                    let selectBoxBtn = document.createElement("button");
                    loadoutDiv.appendChild(selectBoxBtn);
                    selectBoxBtn.textContent = isZH ? "使用配装(施工中)" : "Use Loadout";
                    selectBoxBtn.className = "btn btn-warning";
                    selectBoxBtn.style = `width: 120px`;
                    selectBoxBtn.disabled = true;
                    selectBoxBtn.onclick = function () {
                    };
                    // characterLoadoutMap
    
                    document.querySelector(`.container-fluid`)
                }
    
                const btnEquipSets = document.querySelector(`button#buttonEquipmentSets`);
                if (btnEquipSets) {
                    let divRow = document.createElement("div");
                    divRow.className = "row";
                    btnEquipSets.parentElement.parentElement.prepend(divRow);
    
                    // 导入按钮
                    let div1 = document.createElement("div");
                    div1.className = "mb-3 pt-2";
                    divRow.append(div1);
                    let button1 = document.createElement("button");
                    div1.append(button1);
                    button1.textContent = isZH ? "实时导入本地数据" : "Real-time Import From Local";
                    button1.className = "btn btn-warning";
                    button1.onclick = function () {
                        const btnGetPrice = document.querySelector(`button#buttonGetPrices`);
                        if (btnGetPrice) {
                            btnGetPrice.click();
                        }
                        importDataForMWICombatSimulate(button1, false);
                        return false;
                    };
    
                    // 网络导入按钮
                    let div2 = document.createElement("div");
                    div2.className = "mb-3 pt-1";
                    divRow.append(div2);
                    let button2 = document.createElement("button");
                    div2.append(button2);
                    button2.textContent = isZH ? "实时导入网络云数据" : "Real-time Import From Network";
                    button2.className = "btn btn-warning";
                    button2.onclick = function () {
                        const btnGetPrice = document.querySelector(`button#buttonGetPrices`);
                        if (btnGetPrice) {
                            btnGetPrice.click();
                        }
                        importDataForMWICombatSimulate(button2, true);
                        return false;
                    };
                }
            };
            let timer = setInterval(checkElem, 200);
        }
    
        // 导入数据
        async function importDataForMWICombatSimulate(button, readCloudData = false) {
            if (!firstImport) {
                let userConfirm = window.confirm(isZH ? "是否要覆盖当前数据" : "Do you want to overwrite the current data?");
                if (!userConfirm) {
                    return;
                }
            }
            firstImport = false;
    
            let preTextContent = button.textContent;
            let preClassName = button.className;
            button.textContent = isZH ? "正在导入数据..." : "Importing...";
            button.className = "btn btn-warning";
            button.disabled = true;
    
            clientData = getInitClientData();
            let player = getCurrentPlayerData();
    
            const BLANK_PLAYER_JSON_STR = `{\"player\":{\"attackLevel\":1,\"meleeLevel\":1,\"magicLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/observatory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0}}`;
    
            const players = {};
            let isParty = false;
            let zone = "/actions/combat/fly";
            let isZoneDungeon = false;
            let difficultyTier = 0;
    
            if (!player?.partyInfo?.partySlotMap) {
                // 个人
                players[1] = {
                    name: player.character.name,
                    imported: true,
                    cloudData: false,
                    battleData: JSON.stringify(player.battleObj),
                };
                // Zone
                for (const action of player.characterActions) {
                    if (action && action.actionHrid.includes("/actions/combat/")) {
                        zone = action.actionHrid;
                        difficultyTier = action.difficultyTier;
                        isZoneDungeon = clientData.actionDetailMap[action.actionHrid]?.combatZoneInfo?.isDungeon;
                        break;
                    }
                }
            } else {
                // 队伍
                isParty = true;
                let i = 0;
                for (const member of Object.values(player.partyInfo.partySlotMap)) {
                    i++;
                    if (member.characterID) {
                        if (member.characterID === player.character.id) {
                            players[i] = {
                                name: player.character.name,
                                imported: true,
                                cloudData: false,
                                battleData: JSON.stringify(player.battleObj),
                            };
                        } else {
                            let memberData = getPlayerData(member.characterID);
                            let battleObj = memberData?.battleObj;
    
                            if (readCloudData) {
                                // 读取共享Trigger数据
                                let sharedTextDBStr = await getDataFromTextDB(getPlayerUniqueKey(member.characterID));
                                if (sharedTextDBStr) {
                                    let sharedTextDB = JSON.parse(sharedTextDBStr);
                                    if (battleObj) {
                                        battleObj.triggerMap = {
                                            ...battleObj.triggerMap,
                                            ...sharedTextDB.triggerMap
                                        }
                                    } else {
                                        battleObj = sharedTextDB;
                                    }
                                } else {
                                    readCloudData = false;
                                }
                            }
    
                            if (battleObj && battleObj.valid) {
                                players[i] = {
                                    name: battleObj.character.name,
                                    imported: true,
                                    cloudData: readCloudData,
                                    battleData: JSON.stringify(battleObj),
                                };
                            } else {
                                players[i] = {
                                    name: isZH ? "需要点开个人资料" : "Open profile in game",
                                    imported: true,
                                    cloudData: false,
                                    battleData: BLANK_PLAYER_JSON_STR,
                                };
                            }
                        }
                    }
                }
                // Zone
                zone = player.partyInfo?.party?.actionHrid;
                difficultyTier = player.partyInfo?.party?.difficultyTier;
                isZoneDungeon = clientData.actionDetailMap[zone]?.combatZoneInfo?.isDungeon;
            }
    
            // Select zone or dungeon
            if (zone) {
                document.querySelector(`input#simDungeonToggle`).checked = isZoneDungeon;
                document.querySelector(`input#simDungeonToggle`).dispatchEvent(new Event("change"));
                let elementZone = isZoneDungeon ? document.querySelector(`select#selectDungeon`) : document.querySelector(`select#selectZone`);
                if (elementZone.selectedIndex <= 0) {
                    for (let i = 0; i < elementZone.options.length; i++) {
                        if (elementZone.options[i].value === zone) {
                            elementZone.options[i].selected = true;
                            break;
                        }
                    }
                }
            }
    
            // Select difficultyTier
            let elementDifficulty = document.querySelector(`select#selectDifficulty`);
            if (elementDifficulty.selectedIndex <= 0) {
                for (let i = 0; i < elementDifficulty.options.length; i++) {
                    if (elementDifficulty.options[i].value == difficultyTier) {
                        elementDifficulty.options[i].selected = true;
                        break;
                    }
                }
            }
    
            for (let i = 1; i <= 5; i++) {
                if (!players[i]) {
                    players[i] = {
                        name: `Player ${i}`,
                        imported: false,
                        cloudData: false,
                        battleData: BLANK_PLAYER_JSON_STR,
                    };
                }
                let aTab = document.querySelector(`a#player${i}-tab`);
                aTab.textContent = players[i].name;
                aTab.style.cssText = ''
                if (players[i].cloudData) {
                    aTab.style.backgroundImage = "linear-gradient(-20deg, #00cdac 0%, #8ddad5 100%)";
                    aTab.style.color = "black";
                }
                let checkbox = document.querySelector(`input#player${i}.form-check-input.player-checkbox`);
                if (checkbox) {
                    checkbox.checked = players[i].imported;
                    checkbox.dispatchEvent(new Event("change"));
                }
            }
    
            document.querySelector(`a#group-combat-tab`).click();
            const editImport = document.querySelector(`input#inputSetGroupCombatAll`);
            editImport.value = JSON.stringify(Object.keys(players).reduce((acc, key) => {
                acc[key] = players[key].battleData;
                return acc;
            }, {}));
            document.querySelector(`button#buttonImportSet`).click();
    
            // 模拟时长
            document.querySelector(`input#inputSimulationTime`).value = 24;
    
            button.textContent = isZH ? "成功导入数据" : "Imported Successful";
            button.className = "btn btn-success";
            button.disabled = false;
            setTimeout(() => {
                button.textContent = preTextContent;
                button.className = preClassName;
            }, 1500);
    
            if (!isParty) {
                setTimeout(() => {
                    document.querySelector(`button#buttonStartSimulation`).click();
                }, 500);
            }
        }
    
        // 监听模拟结果
        async function observeResultsForMWICombatSimulate() {
            let resultDiv = document.querySelector(`div.row`)?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`);
            while (!resultDiv) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                resultDiv = document.querySelector(`div.row`)?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`);
            }
    
            const deathDiv = document.querySelector(`div#simulationResultPlayerDeaths`);
            const expDiv = document.querySelector(`div#simulationResultExperienceGain`);
            const consumeDiv = document.querySelector(`div#simulationResultConsumablesUsed`);
            deathDiv.style.backgroundColor = "#FFEAE9";
            deathDiv.style.color = "black";
            expDiv.style.backgroundColor = "#CDFFDD";
            expDiv.style.color = "black";
            consumeDiv.style.backgroundColor = "#F0F8FF";
            consumeDiv.style.color = "black";
    
            let div = document.createElement("div");
            div.id = "tillLevel";
            div.style.backgroundColor = "#FFFFE0";
            div.style.color = "black";
            div.textContent = "";
            resultDiv.append(div);
        }
    
        // #endregion
    
        // #region Main Logic
    
        // ==================================================
        // Script Start
        // ==================================================
    
        if (localStorage.getItem("initClientData")) {
            const compressed = localStorage.getItem("initClientData");
            const obj = JSON.parse(decompressData(compressed));
            GM_setValue("init_client_data", compressed);
    
            clientData.actionDetailMap = obj.actionDetailMap;
            clientData.levelExperienceTable = obj.levelExperienceTable;
            clientData.itemDetailMap = obj.itemDetailMap;
            clientData.actionCategoryDetailMap = obj.actionCategoryDetailMap;
            clientData.abilityDetailMap = obj.abilityDetailMap;
        }
    
        if (document.URL.includes("/MWICombatSimulatorTest/")) {
            addImportButtonForMWICombatSimulate();
            observeResultsForMWICombatSimulate();
        }
    
        hookWS();
    
        // #endregion
    
    })();
  });

  // ---------------------------------------------------------------------------
  // Module: 掉落與運氣統計
  // Original: [银河奶牛]康康运气_修复.user.js v0.1.34
  // Author: Weierstras@www.milkywayidle.com
  // License: MIT
  // Source: https://greasyfork.org/scripts/546427
  // WebSocket compatibility patches: 1
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("luck-stats", "掉落與運氣統計", "idle", () => {
    /*
     * 参考文献:
     *   - [银河奶牛]食用工具 (https://greasyfork.org/zh-CN/scripts/499963-银河奶牛-食用工具)
     *   - MWITools (https://greasyfork.org/zh-CN/scripts/494467-mwitools)
     *   - 牛牛聊天增强插件 (https://greasyfork.org/zh-CN/scripts/535795-牛牛聊天增强插件)
     */
    
    // @ts-ignore
    GM_addStyle(`
    .lll_Button_battlePlayerFood__custom { background-color: #546ddb !important; color: white; border-radius: 5px; padding: 5px 10px; cursor: pointer; transition: background-color 0.15s ease-out; }
    .lll_Button_battlePlayerFood__custom:hover { background-color: #6b84ff !important; }
    .lll_Button_battlePlayerLoot__custom { background-color: #db5454 !important; color: white; border-radius: 5px; padding: 5px 10px; cursor: pointer; transition: background-color 0.15s ease-out; }
    .lll_Button_battlePlayerLoot__custom:hover { background-color: #ff6b6b !important; }
    
    :root {
        --button-close: rgb(187, 94, 94);
        --button-close-hover: rgb(228, 117, 117);
        --button-close-click: rgb(168, 86, 86);
        --button-settings: rgb(118, 130, 182);
        --button-settings-hover: rgb(135, 155, 230);
        --button-settings-click: rgb(100, 112, 151);
    
        --border: rgb(113, 123, 169);
        --border-separator: rgb(73, 81, 113);
    
        --card-background: rgb(42, 43, 66);
        --card-title-text: rgb(237, 239, 249);
        --card-title-background:rgb(57, 59, 88);
    
        --item-background:rgb(54, 60, 83);
        --item-border:rgb(103, 113, 149);
        --item-background-hover: #414662;
        --item-border-hover: rgb(123, 133, 179);
    
        --tab-background: rgb(28, 32, 47);
        --tab-button: var(--border);
        --tab-button-hover: rgba(108, 117, 160, 0.5);
        --tab-button-click:rgb(68, 75, 111);
    
        --title-text-shadow: 0 0 1.5px rgba(42, 43, 66, 0.6);
    }
    
    
    .lll_btn_noSelect { cursor: pointer; user-select: none; }
    .lll_text_noSelect { cursor: default; user-select: none; }
    
    /* popup */
    .lll_popup_root { background-color: rgb(54, 59, 91); border: 2px solid rgba(74, 79, 111, 0.5); position: fixed; top: 50%; left: 50%; color: white; box-shadow: 0 0 5px 1px black; border-radius: 11px 11px 17px 17px; z-index: 10000; white-space: nowrap; display: flex; flex-direction: column; }
    
    .lll_tab_btnContainer { margin: 5px 5px 0 5px; padding-right: 10px; align-items: start; display: flex; gap: 5px; flex: 1; }
    .lll_tab_btnSettingsContainer { width: 37px; margin: 0 0 0 auto; cursor: pointer; display: flex; }
    .lll_tab_btnCloseContainer { width: 37px; margin: 0 0 0 auto; cursor: pointer; display: flex; }
    .lll_tab_btnClose { border-radius: 10px; background: var(--button-close); border: none; box-shadow: 0 0 1px black; height: 19px; width: 19px; margin: auto auto auto 8px; transition: background-color 0.1s ease-out; cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center; }
    .lll_tab_btnCloseContainer:hover .lll_tab_btnClose { background: var(--button-close-hover); }
    .lll_tab_btnCloseContainer:active .lll_tab_btnClose { background: var(--button-close-click); }
    .lll_tab_btnSettings { border-radius: 10px; background: var(--button-settings); border: none; box-shadow: 0 0 1px black; height: 19px; width: 19px; margin: auto 8px auto auto; transition: background-color 0.1s ease-out; cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center; }
    .lll_tab_btnSettingsContainer:hover .lll_tab_btnSettings { background: var(--button-settings-hover); }
    .lll_tab_btnSettingsContainer:active .lll_tab_btnSettings { background: var(--button-settings-click); }
    
    .lll_tab_btn { padding: 7px 18px; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 500; text-shadow: var(--title-text-shadow); border-radius: 8px 8px 0 0; text-align: center; cursor: pointer; user-select: none; transition: background-color 0.1s ease-out; }
    .lll_tab_btn:hover { background-color: var(--tab-button-hover); }
    .lll_tab_btn:active { background-color: var(--tab-button-click); }
    .lll_tab_btn.active { background-color: var(--tab-button); cursor: default; color: white; }
    .lll_tab_pageContainer { margin: -1px -2px -2px -2px; border: 1.5px solid rgba(113, 123, 169, 0.5); border-radius: 8px 8px 15px 15px; background-color: var(--tab-background); min-height: 0; min-height: 0; display: flex; flex-direction: column; }
    .lll_tab_pageTitle { display: block; margin: -1px; border-radius: 5px 5px 0 0; }
    .lll_tab_pageTitleText { width: fit-content; padding: 0 30px; margin: auto; text-align: center; background-color: var(--border); border-radius: 0 0 5px 5px; font-size: 16px; font-weight: bold; }
    .lll_tab_page { overflow: auto; display: none; }
    .lll_tab_page.active { display: block; }
    
    .lll_plainPopup_root { z-index: 200; position: fixed; top: 0; left: 0; height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .lll_plainPopup_background { height: 100%; width: 100%; background-color: var(--color-midnight-800); opacity: .8; }
    .lll_plainPopup_containerRoot { margin: -1px -2px -2px -2px; border: 1.5px solid rgba(214, 222, 255, 0.3); border-radius: 8px; background-color: var(--tab-background); display: flex; flex-direction: column; min-height: 0; position: absolute; min-width: 300px; max-width: 98%; min-height: 100px; max-height: 98%; padding: 10px; box-shadow: 0 0 5px 1px black; font-size: 14px; font-weight: 400; overflow: auto; }
    .lll_plainPopup_container { width: 100%; height: 100%; color: rgb(231, 231, 231); display: flex; flex-direction: column; gap: 12px; }
    .lll_plainPopup_title { font-size: 16px; font-weight: 500; color: rgb(231, 231, 231); text-align: center; }
    
    /* content */
    .lll_div_panelContent { margin: 20px; }
    .lll_div_settingPanelContent { font-size: 15px; margin: 20px; display: flex; flex-direction: column; gap: 20px; }
    
    .lll_separator { border-top: 1.5px solid var(--border-separator); }
    .lll_div_card { padding: 10px; border-radius: 10px; background-color: var(--card-background); border: 1.5px solid var(--border); margin: 0px auto; overflow: hidden; display: flex; flex-direction: column; }
    .lll_div_cardTitle { background-color: var(--card-title-background); text-align: center; font-size: 16px; color: var(--card-title-text); margin: -10px -10px 8px -10px; padding: 5px 0; user-select: none; }
    .lll_div_cardTitle.large { margin-bottom: 10px; padding: 5px 0; font-size: 20px; font-weight: bold; text-shadow: 0 0 2px var(--tab-background); }
    .lll_div_card .lll_separator { border-color: var(--border); }
    .lll_div_item { display: flex; align-items: center; background-color: var(--item-background); border: 1.5px solid var(--item-border); border-radius: 5px; padding: 8px; white-space: nowrap; flex-shrink: 0; cursor: default; }
    .lll_div_item:hover { background-color: var(--item-background-hover); border: 1.5px solid var(--item-border-hover); }
    
    .lll_div_column { display: flex; flex-direction: column; gap: 15px; }
    .lll_div_row { display: flex; gap: 15px; justify-content: center; }
    
    .lll_label { margin: auto 0; text-align: center; }
    .lll_btn { height: auto; position: sticky; margin: 5px; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; }
    
    .lll_input_checkbox { margin: auto 0; }
    .lll_input_select { padding: 5px 10px 5px 5px; margin: auto 0; border: 1px solid #ced4da; border-radius: 5px; }
    .lll_input { padding: 5px 10px 5px 5px; margin: auto 0; border: 1px solid #ced4da; border-radius: 5px; }
    .lll_input_sliderWrapper { display: flex; gap: 10px; }
    .lll_input_sliderLabel { min-width: 50px; margin: auto 0; text-align: left; }
    
    /* battle */
    .lll_btn_battleDropAnalyzer { background-color: #21967e !important; color: white; border-radius: 5px; padding: 5px 10px; cursor: pointer; transition: background-color 0.15s ease-out;  }
    .lll_btn_battleDropAnalyzer:hover { background-color:rgb(37, 184, 152) !important; }
    
    /* chest */
    .lll_div_chestOpenContent { width: 100%; height: 100%; color: rgb(231, 231, 231); display: flex; flex-direction: column; gap: 12px; }
    .lll_div_chestOpenContent .lll_div_row { width: 100%; gap: 10px; }
    .lll_div_chestOpenContent .lll_div_card { border-radius: 8px; background-color: rgb(38, 42, 58); border: 1.5px solid rgba(117, 123, 148, 1); width: 100%; margin: 0; }
    .lll_div_chestOpenContent .lll_div_card .lll_separator { border-color: rgba(117, 123, 148, 1); }
    .lll_div_chestOpenContent .lll_div_cardTitle { background-color: rgb(66, 71, 90); text-align: center; font-size: 14px; text-align: left; color: var(--card-title-text); margin: -10px -10px 8px -10px; padding: 3px 10px; }
    `);
    
    var defaultOptions = {
        line: {
            color: '#F66',
            width: 1,
            dashPattern: []
        },
        sync: {
            enabled: false,
            group: 1,
            suppressTooltips: false
        },
        zoom: {
            enabled: true,
            zoomboxBackgroundColor: 'rgba(66,133,244,0.2)',
            zoomboxBorderColor: '#48F',
            zoomButtonText: 'Reset Zoom',
            zoomButtonClass: 'reset-zoom',
        },
        snap: {
            enabled: false,
        },
        callbacks: {
            beforeZoom: function (start, end) {
                return true;
            },
            afterZoom: () => { }
        }
    };
    function valueOrDefault(value, defaultValue) {
        return typeof value === 'undefined' ? defaultValue : value;
    }
    
    // chartjs-plugin-crosshair (https://cdn.jsdelivr.net/npm/chartjs-plugin-crosshair@2.0.0/dist/chartjs-plugin-crosshair.min.js)
    const TracePlugin = {
        id: 'crosshair',
    
        afterInit: function (chart) {
    
            if (!chart.config.options.scales.x) {
                return
            }
    
            var xScaleType = chart.config.options.scales.x.type
    
            if (xScaleType !== 'linear' && xScaleType !== 'time' && xScaleType !== 'category' && xScaleType !== 'logarithmic') {
                return;
            }
    
            if (chart.options.plugins.crosshair === undefined) {
                chart.options.plugins.crosshair = defaultOptions;
            }
    
            chart.crosshair = {
                enabled: false,
                suppressUpdate: false,
                x: null,
                originalData: [],
                originalXRange: {},
                dragStarted: false,
                dragStartX: null,
                dragEndX: null,
                suppressTooltips: false,
                ignoreNextEvents: 0,
                reset: function () {
                    this.resetZoom(chart, false, false);
                }.bind(this)
            };
    
            var syncEnabled = this.getOption(chart, 'sync', 'enabled');
            if (syncEnabled) {
                chart.crosshair.syncEventHandler = function (e) {
                    this.handleSyncEvent(chart, e);
                }.bind(this);
    
                chart.crosshair.resetZoomEventHandler = function (e) {
    
                    var syncGroup = this.getOption(chart, 'sync', 'group');
    
                    if (e.chartId !== chart.id && e.syncGroup === syncGroup) {
                        this.resetZoom(chart, true);
                    }
                }.bind(this);
    
                window.addEventListener('sync-event', chart.crosshair.syncEventHandler);
                window.addEventListener('reset-zoom-event', chart.crosshair.resetZoomEventHandler);
            }
    
            chart.panZoom = this.panZoom.bind(this, chart);
        },
    
        afterDestroy: function (chart) {
            var syncEnabled = this.getOption(chart, 'sync', 'enabled');
            if (syncEnabled) {
                window.removeEventListener('sync-event', chart.crosshair.syncEventHandler);
                window.removeEventListener('reset-zoom-event', chart.crosshair.resetZoomEventHandler);
            }
        },
    
        panZoom: function (chart, increment) {
            if (chart.crosshair.originalData.length === 0) {
                return;
            }
            var diff = chart.crosshair.end - chart.crosshair.start;
            var min = chart.crosshair.min;
            var max = chart.crosshair.max;
            if (increment < 0) { // left
                chart.crosshair.start = Math.max(chart.crosshair.start + increment, min);
                chart.crosshair.end = chart.crosshair.start === min ? min + diff : chart.crosshair.end + increment;
            } else { // right
                chart.crosshair.end = Math.min(chart.crosshair.end + increment, chart.crosshair.max);
                chart.crosshair.start = chart.crosshair.end === max ? max - diff : chart.crosshair.start + increment;
            }
    
            this.doZoom(chart, chart.crosshair.start, chart.crosshair.end);
        },
    
        getOption: function (chart, category, name) {
            return valueOrDefault(chart.options.plugins.crosshair[category] ? chart.options.plugins.crosshair[category][name] : undefined, defaultOptions[category][name]);
        },
    
        getXScale: function (chart) {
            return chart.data.datasets.length ? chart.scales[chart.getDatasetMeta(0).xAxisID] : null;
        },
        getYScale: function (chart) {
            return chart.scales[chart.getDatasetMeta(0).yAxisID];
        },
    
        handleSyncEvent: function (chart, e) {
    
            var syncGroup = this.getOption(chart, 'sync', 'group');
    
            // stop if the sync event was fired from this chart
            if (e.chartId === chart.id) {
                return;
            }
    
            // stop if the sync event was fired from a different group
            if (e.syncGroup !== syncGroup) {
                return;
            }
    
            var xScale = this.getXScale(chart);
    
            if (!xScale) {
                return;
            }
    
            // Safari fix
            var buttons = (e.original.native.buttons === undefined ? e.original.native.which : e.original.native.buttons);
            if (e.original.type === 'mouseup') {
                buttons = 0;
            }
    
    
            var newEvent = {
                // do not transmit click events to prevent unwanted changing of synced charts. We do need to transmit a event to stop zooming on synced charts however.
                type: e.original.type == "click" ? "mousemove" : e.original.type,
                chart: chart,
                x: xScale.getPixelForValue(e.xValue),
                y: e.original.y,
                native: {
                    buttons: buttons
                },
                stop: true
            };
            chart._eventHandler(newEvent);
        },
    
        afterEvent: function (chart, event) {
    
            if (chart.config.options.scales.x.length == 0) {
                return
            }
    
            let e = event.event
    
            var xScaleType = chart.config.options.scales.x.type
    
            if (xScaleType !== 'linear' && xScaleType !== 'time' && xScaleType !== 'category' && xScaleType !== 'logarithmic') {
                return;
            }
    
            var xScale = this.getXScale(chart);
    
            if (!xScale) {
                return;
            }
    
            if (chart.crosshair.ignoreNextEvents > 0) {
                chart.crosshair.ignoreNextEvents -= 1
                return;
            }
    
            // fix for Safari
            var buttons = (e.native.buttons === undefined ? e.native.which : e.native.buttons);
            if (e.native.type === 'mouseup') {
                buttons = 0;
            }
    
            var syncEnabled = this.getOption(chart, 'sync', 'enabled');
            var syncGroup = this.getOption(chart, 'sync', 'group');
    
            // fire event for all other linked charts
            if (!e.stop && syncEnabled) {
                let event = new CustomEvent('sync-event');
                // @ts-ignore
                event.chartId = chart.id; event.syncGroup = syncGroup; event.original = e; event.xValue = xScale.getValueForPixel(e.x);
                window.dispatchEvent(event);
            }
    
            // suppress tooltips for linked charts
            var suppressTooltips = this.getOption(chart, 'sync', 'suppressTooltips');
    
            chart.crosshair.suppressTooltips = e.stop && suppressTooltips;
    
            chart.crosshair.enabled = (e.type !== 'mouseout' && (e.x > xScale.getPixelForValue(xScale.min) && e.x < xScale.getPixelForValue(xScale.max)));
    
            if (!chart.crosshair.enabled && !chart.crosshair.suppressUpdate) {
                if (e.x > xScale.getPixelForValue(xScale.max)) {
                    // suppress future updates to prevent endless redrawing of chart
                    chart.crosshair.suppressUpdate = true
                    chart.update('none');
                }
                chart.crosshair.dragStarted = false // cancel zoom in progress
                return false;
            }
            chart.crosshair.suppressUpdate = false
    
            // handle drag to zoom
            var zoomEnabled = this.getOption(chart, 'zoom', 'enabled');
    
            if (buttons === 1 && !chart.crosshair.dragStarted && zoomEnabled) {
                chart.crosshair.dragStartX = e.x;
                chart.crosshair.dragStarted = true;
            }
    
            // handle drag to zoom
            if (chart.crosshair.dragStarted && buttons === 0) {
                chart.crosshair.dragStarted = false;
    
                var start = xScale.getValueForPixel(chart.crosshair.dragStartX);
                var end = xScale.getValueForPixel(chart.crosshair.x);
    
                if (Math.abs(chart.crosshair.dragStartX - chart.crosshair.x) > 1) {
                    this.doZoom(chart, start, end);
                }
                chart.update('none');
            }
    
            chart.crosshair.x = e.x;
    
    
            chart.draw();
    
        },
    
        afterDraw: function (chart) {
    
            if (!chart.crosshair.enabled) {
                return;
            }
    
            if (chart.crosshair.dragStarted) {
                this.drawZoombox(chart);
            } else {
                this.drawTraceLine(chart);
                this.interpolateValues(chart);
                this.drawTracePoints(chart);
            }
    
            return true;
        },
    
        beforeTooltipDraw: function (chart) {
            // suppress tooltips on dragging
            return !chart.crosshair.dragStarted && !chart.crosshair.suppressTooltips;
        },
    
        resetZoom: function (chart) {
    
            var stop = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
            var update = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    
            if (update) {
                if (chart.crosshair.originalData.length > 0) {
                    // reset original data
                    for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
                        var dataset = chart.data.datasets[datasetIndex];
                        dataset.data = chart.crosshair.originalData.shift(0);
                    }
                }
    
                // reset original xRange
                if (chart.crosshair.originalXRange.min) {
                    chart.options.scales.x.min = chart.crosshair.originalXRange.min;
                    chart.crosshair.originalXRange.min = null;
                } else {
                    delete chart.options.scales.x.min;
                }
                if (chart.crosshair.originalXRange.max) {
                    chart.options.scales.x.max = chart.crosshair.originalXRange.max;
                    chart.crosshair.originalXRange.max = null;
                } else {
                    delete chart.options.scales.x.max;
                }
            }
    
            if (chart.crosshair.button && chart.crosshair.button.parentNode) {
                chart.crosshair.button.parentNode.removeChild(chart.crosshair.button);
                chart.crosshair.button = false;
            }
    
            var syncEnabled = this.getOption(chart, 'sync', 'enabled');
    
            if (!stop && update && syncEnabled) {
    
                var syncGroup = this.getOption(chart, 'sync', 'group');
    
                var event = new CustomEvent('reset-zoom-event');
                // @ts-ignore
                event.chartId = chart.id; event.syncGroup = syncGroup;
                window.dispatchEvent(event);
            }
            if (update) {
                chart.update('none');
            }
        },
    
        doZoom: function (chart, start, end) {
    
            // swap start/end if user dragged from right to left
            if (start > end) {
                var tmp = start;
                start = end;
                end = tmp;
            }
    
            // notify delegate
            var beforeZoomCallback = valueOrDefault(chart.options.plugins.crosshair.callbacks ? chart.options.plugins.crosshair.callbacks.beforeZoom : undefined, defaultOptions.callbacks.beforeZoom);
    
            if (!beforeZoomCallback(start, end)) {
                return false;
            }
    
            chart.crosshair.dragStarted = false
    
            if (chart.options.scales.x.min && chart.crosshair.originalData.length === 0) {
                chart.crosshair.originalXRange.min = chart.options.scales.x.min;
            }
            if (chart.options.scales.x.max && chart.crosshair.originalData.length === 0) {
                chart.crosshair.originalXRange.max = chart.options.scales.x.max;
            }
    
            if (!chart.crosshair.button) {
                // add restore zoom button
                var button = document.createElement('button');
    
                var buttonText = this.getOption(chart, 'zoom', 'zoomButtonText')
                var buttonClass = this.getOption(chart, 'zoom', 'zoomButtonClass')
    
                var buttonLabel = document.createTextNode(buttonText);
                button.appendChild(buttonLabel);
                button.className = buttonClass;
                button.addEventListener('click', function () {
                    this.resetZoom(chart);
                }.bind(this));
                chart.canvas.parentNode.appendChild(button);
                chart.crosshair.button = button;
            }
    
            // set axis scale
            chart.options.scales.x.min = start;
            chart.options.scales.x.max = end;
    
            // make a copy of the original data for later restoration
    
            var storeOriginals = (chart.crosshair.originalData.length === 0) ? true : false;
    
    
            var filterDataset = (chart.config.options.scales.x.type !== 'category')
    
            if (filterDataset) {
    
    
                for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
    
                    var newData = [];
    
                    var index = 0;
                    var started = false;
                    var stop = false;
                    if (storeOriginals) {
                        chart.crosshair.originalData[datasetIndex] = chart.data.datasets[datasetIndex].data;
                    }
    
                    var sourceDataset = chart.crosshair.originalData[datasetIndex];
    
                    for (var oldDataIndex = 0; oldDataIndex < sourceDataset.length; oldDataIndex++) {
    
                        var oldData = sourceDataset[oldDataIndex];
                        // var oldDataX = this.getXScale(chart).getRightValue(oldData)
                        var oldDataX = oldData.x !== undefined ? oldData.x : NaN
    
                        // append one value outside of bounds
                        if (oldDataX >= start && !started && index > 0) {
                            newData.push(sourceDataset[index - 1]);
                            started = true;
                        }
                        if (oldDataX >= start && oldDataX <= end) {
                            newData.push(oldData);
                        }
                        if (oldDataX > end && !stop && index < sourceDataset.length) {
                            newData.push(oldData);
                            stop = true;
                        }
                        index += 1;
                    }
    
                    chart.data.datasets[datasetIndex].data = newData;
                }
            }
    
            chart.crosshair.start = start;
            chart.crosshair.end = end;
    
    
            if (storeOriginals) {
                var xAxes = this.getXScale(chart);
                chart.crosshair.min = xAxes.min;
                chart.crosshair.max = xAxes.max;
            }
    
            chart.crosshair.ignoreNextEvents = 2 // ignore next 2 events to prevent starting a new zoom action after updating the chart
    
            chart.update('none');
    
    
            var afterZoomCallback = this.getOption(chart, 'callbacks', 'afterZoom');
    
            afterZoomCallback(start, end);
        },
    
        drawZoombox: function (chart) {
    
            var yScale = this.getYScale(chart);
    
            var borderColor = this.getOption(chart, 'zoom', 'zoomboxBorderColor');
            var fillColor = this.getOption(chart, 'zoom', 'zoomboxBackgroundColor');
    
            chart.ctx.beginPath();
            chart.ctx.rect(chart.crosshair.dragStartX, yScale.getPixelForValue(yScale.max), chart.crosshair.x - chart.crosshair.dragStartX, yScale.getPixelForValue(yScale.min) - yScale.getPixelForValue(yScale.max));
            chart.ctx.lineWidth = 1;
            chart.ctx.strokeStyle = borderColor;
            chart.ctx.fillStyle = fillColor;
            chart.ctx.fill();
            chart.ctx.fillStyle = '';
            chart.ctx.stroke();
            chart.ctx.closePath();
        },
    
        drawTraceLine: function (chart) {
    
            var yScale = this.getYScale(chart);
    
            var lineWidth = this.getOption(chart, 'line', 'width');
            var color = this.getOption(chart, 'line', 'color');
            var dashPattern = this.getOption(chart, 'line', 'dashPattern');
            var snapEnabled = this.getOption(chart, 'snap', 'enabled');
    
            var lineX = chart.crosshair.x;
    
            if (snapEnabled && chart._active.length) {
                lineX = chart._active[0].element.x;
            }
    
            chart.ctx.beginPath();
            chart.ctx.setLineDash(dashPattern);
            chart.ctx.moveTo(lineX, yScale.getPixelForValue(yScale.max));
            chart.ctx.lineWidth = lineWidth;
            chart.ctx.strokeStyle = color;
            chart.ctx.lineTo(lineX, yScale.getPixelForValue(yScale.min));
            chart.ctx.stroke();
            chart.ctx.setLineDash([]);
    
        },
    
        drawTracePoints: function (chart) {
    
            for (var chartIndex = 0; chartIndex < chart.data.datasets.length; chartIndex++) {
    
                var dataset = chart.data.datasets[chartIndex];
                var meta = chart.getDatasetMeta(chartIndex);
    
                var yScale = chart.scales[meta.yAxisID];
    
                if ((meta.hidden ?? chart.data.datasets[chartIndex].hidden) || !dataset.interpolate) {
                    continue;
                }
    
                chart.ctx.beginPath();
                chart.ctx.arc(chart.crosshair.x, yScale.getPixelForValue(dataset.interpolatedValue), 3, 0, 2 * Math.PI, false);
                chart.ctx.fillStyle = 'white';
                chart.ctx.lineWidth = 2;
                chart.ctx.strokeStyle = dataset.borderColor;
                chart.ctx.fill();
                chart.ctx.stroke();
    
            }
    
        },
    
        interpolateValues: function (chart) {
            for (var chartIndex = 0; chartIndex < chart.data.datasets.length; chartIndex++) {
                let dataset = chart.data.datasets[chartIndex];
                let meta = chart.getDatasetMeta(chartIndex);
    
                let xScale = chart.scales[meta.xAxisID];
                let xValue = xScale.getValueForPixel(chart.crosshair.x);
    
                if ((meta.hidden ?? chart.data.datasets[chartIndex].hidden) || !dataset.interpolate) {
                    continue;
                }
    
                let data = dataset.data;
                let index = data.findIndex(function (o) {
                    return o.x >= xValue;
                });
                let prev = data[index - 1];
                let next = data[index];
    
                if (chart.data.datasets[chartIndex].steppedLine && prev) {
                    dataset.interpolatedValue = prev.y;
                } else if (prev && next) {
                    let slope = (next.y - prev.y) / (next.x - prev.x);
                    dataset.interpolatedValue = prev.y + (xValue - prev.x) * slope;
                } else {
                    dataset.interpolatedValue = NaN;
                }
            }
    
        }
    
    };
    // @ts-ignore
    Chart.register(TracePlugin);
    
    /*
     * TODO:
     *   - 英语翻译
     *   - UI 重构
     *     - 非战斗全图模拟
     *   - 战斗统计
     *     - 历史记录
     *     - 期望掉落
     *   - 开箱统计
     *     - 设置
     *     - 运气底色
     *     - 历史记录
     *   - 强化统计
     *     - 强化运气
     *   - 任务
     *     - 期望收益（制作rarity=2写错了）
     *     - 计算是否应该刷新
     */
    
    /** counted item
     * @typedef {{ hrid: string, count: number }} CountedItem
     */
    /** init_character_data.characterInfo - CharacterInfo
     * @typedef {Object} CharacterInfo
     * @property {number} characterID
     * @property {number} offlineHourCap
     * @property {number} actionQueueCap
     * @property {number} loadoutSlotCap
     * @property {number} marketListingCap
     * @property {number} taskSlotCap
     * @property {boolean} isTutorialCompleted
     * @property {number} taskCooldownHours
     * @property {string} lastTaskTimestamp
     * @property {number} unreadTaskCount
     * @property {number} totalTaskPoints
     * @property {number} redeemedTaskPoints
     * @property {boolean} isCombatTaskBlockUnlocked
     * @property {number} famePoints
     * @property {boolean} fameLeaderboardOptOut
     */
    
    (function () {
        'use strict';
    
        const dbg = console.log.bind(null, '%c[康康运气]%c', 'color:blue', 'color:black');
        const out = console.log.bind(null, '%c[康康运气]%c', 'color:green', 'color:black');
        const err = console.log.bind(null, '%c[康康运气]%c', 'color:red', 'color:black');
    
        // @ts-ignore
        const FFT = mlFft.FFT;
    
        const isCN = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
        let isMobile = window.innerWidth < 768; // 判断是否为移动设备
        window.addEventListener('resize', () => { isMobile = window.innerWidth < 768; });
    
        const Utils = new class {
            #inf = 0x3FFFFFFE;
            floor(n) { return n > this.#inf || n < -this.#inf ? Math.floor(n) : ((n + this.#inf) | 0) - this.#inf; }
            round(n) { return this.floor(n + 0.5); }
            randInt(l, r) { return l + Math.floor(Math.random() * (r - l)); }
    
            HSVtoRGB(h, s, v, a = 1) {
                var r, g, b, i, f, p, q, t;
                i = Math.floor(h * 6);
                f = h * 6 - i;
                p = v * (1 - s);
                q = v * (1 - f * s);
                t = v * (1 - (1 - f) * s);
                switch (i % 6) {
                    case 0: r = v; g = t; b = p; break;
                    case 1: r = q; g = v; b = p; break;
                    case 2: r = p; g = v; b = t; break;
                    case 3: r = p; g = q; b = v; break;
                    case 4: r = t; g = p; b = v; break;
                    case 5: r = v; g = p; b = q; break;
                }
                r = Math.round(r * 255);
                g = Math.round(g * 255);
                b = Math.round(b * 255);
                return {
                    r: r, g: g, b: b,
                    rgb: `rgba(${r}, ${g}, ${b})`,
                    rgba: `rgba(${r}, ${g}, ${b}, ${a})`,
                };
            }
            luckColor(luck) {
                luck = Math.min(Math.max(luck, 0), 1);
                const h = luck * 0.34;
                const s = 0.9 - luck * 0.25;
                const v = 1 - luck * 0.25;
                return Utils.HSVtoRGB(h, s, v).rgb;
            };
    
            /**
             * 格式化数字为带KMBT单位的价格
             * @param {number} value
             * @param {{ type?: 'fixedPrecision' | 'fixedLength' | 'mwi' | 'edible', precision?: number, threshold?: number}} style
             * @returns {string}
             */
            formatPrice(value, style = null) {
                const styleMap = {
                    fixedPrecision(_, value, style) {
                        const precision = style?.precision ?? 4;
                        if (value < 10000) return value.toFixed(0);
                        const e = Math.floor(Math.log10(value));
                        const base = Math.min(12, 3 + Math.max(0, Math.floor((e - precision) / 3) * 3));
                        const unit = "1KMBT"[base / 3];
                        const a = value / Math.pow(10, base);
                        const decLen = precision - (e - base) - 1 - (a < 1 ? 1 : 0);
                        return a.toFixed(decLen) + unit;
                    },
                    fixedLength(isNegative, value, style) {
                        const precision = style?.precision ?? 4;
                        return this.fixedPrecision(isNegative, value, { precision: precision - (isNegative ? 1 : 0) });
                    },
                    mwi(_, value, style) {
                        const precision = style?.precision ?? 4;
                        if (value < 100000) return value.toFixed(0);
                        const e = Math.floor(Math.log10(value));
                        const base = Math.min(12, 3 + Math.max(0, Math.floor((e - precision) / 3) * 3));
                        const unit = "1KMBT"[base / 3];
                        const decLen = precision - (e - base) - 1;
                        return (value / Math.pow(10, base)).toFixed(decLen) + unit;
                    },
                    edible(_, value, style) {
                        // edible: threshold = 10, mwitools: threshold = 1
                        const threshold = style?.threshold ?? 10;
                        const precision = style?.precision ?? 1;
                        if (value >= 1e12 * threshold) return (value / 1e12).toFixed(precision) + 'T';
                        if (value >= 1e9 * threshold) return (value / 1e9).toFixed(precision) + 'B';
                        if (value >= 1e6 * threshold) return (value / 1e6).toFixed(precision) + 'M';
                        if (value >= 1e3 * threshold) return (value / 1e3).toFixed(precision) + 'K';
                        return value.toFixed(0);
                    },
                };
                const isNegative = value < 0;
                value = Math.abs(value);
                const sign = (isNegative ? '-' : '');
                return sign + styleMap[style?.type ?? 'fixedLength'](isNegative, value, style);
            }
            /**
             * 每三个数之间加逗号
             * @param {number} value
             * @returns {string}
             */
            formatNumber(value) {
                return value.toString().replace(/\d+/, function (n) {
                    return n.replace(/(\d)(?=(?:\d{3})+$)/g, '$1,')
                })
            }
            formatLuck(value) {
                const ret = (value * 100).toFixed(2);
                return `${ret === '100.00' ? '100.0' : ret}%`;
            }
            /**
             * 格式化时间
             * @param {number} duration
             * @param {'hm' | 'hms' | 'h'} format
             * @returns {string}
             */
            formatDuration(duration, format = 'hm') {
                const h = Math.floor(duration / 3600);
                const m = Math.floor(duration / 60) % 60;
                const s = Math.floor(duration) % 60;
                const formatMap = {
                    'hm': `${h}h ${m < 10 ? '0' : ''}${m}m`,
                    'hms': `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`,
                    'h': `${Math.floor(duration / 3600).toFixed(1)}h`,
                };
                return formatMap[format];
            }
            /**
             * 格式化时间
             * @param {Date} date
             * @returns {string}
             */
            formatDate(date) {
                return date.toLocaleString()
            }
    
            /**
             * 二分查找 l <= x <= r 使得 f(x) = dest
             * @param {(x: number) => number} f 递增函数
             * @param {number} l
             * @param {number} r
             * @param {number} dest
             * @param {number} maxIter 最大迭代次数
             * @returns
             */
            binarySearch(f, l, r, dest, maxIter = 60) {
                for (let i = 0; i < maxIter; ++i) {
                    let mid = (l + r) / 2;
                    if (f(mid) < dest) l = mid;
                    else r = mid;
                }
                return (l + r) / 2;
            };
        };
    
        const LocalStorageName = 'lll_data';
        const LocalStorageVersion = '0.1.11';
        const LocalStorageVerbose = true;
        const LocalStorageData = new class {
            constructor() {
                if (this.get('version') !== LocalStorageVersion) this.clearAll();
                this.set('version', LocalStorageVersion);
            }
            clearAll() {
                localStorage.removeItem(LocalStorageName);
            }
            get(key) {
                const data = JSON.parse(localStorage.getItem(LocalStorageName) ?? 'null');
                if (LocalStorageVerbose) out(`load ${key} from localStorage: ${key} =`, data?.[key]);
                return data?.[key];
            }
            set(key, value) {
                const data = JSON.parse(localStorage.getItem(LocalStorageName) ?? '{}');
                data[key] = value;
                localStorage.setItem(LocalStorageName, JSON.stringify(data));
                if (LocalStorageVerbose) out(`saved ${key} to localStorage: ${key} =`, value);
            }
        };
    
        let Config = {
            general: {
                /** @type {'default' | 'zh' | 'en'} */ language: 'default',
            },
            market: {
                /** @type {MarketDataSource} */ source: {
                    type: 'mwi',
                    addr: '',
                },
                autoUpdateInterval: 6, // (h)
                computeNetProfit: true,
                computeNonTradable: true,
            },
            charaFunc: {
                verbose: false,
                cdfIterSpeed: 0.9,
                cdfLimitEps: 1e-4,
                cdfMaxIter: 30,
                cdfEps: 1e-4,
                cdfWrapping: 0.4,
                rescaleSamples: 64,
                samples: isMobile ? 512 : 4096,
            },
            chart: {
                interpolatePoints: isMobile ? 128 : 512,
                tension: 0.4,
                defaultScale: { width: 600, height: 400 },
            },
            battleDrop: {
                verbose: false,
                analyzer: {
                    minLimit: 1e8,
                    perWaveLimit: 2e5,
                },
                ui: {
                    overviewItemSortOrder: 'unitBid', // totalBid
                    overviewItemMaxNumber: 10,
                    overviewItemMinRarity: 0,
                    overviewShowStdDev: true,
                    overviewUseLegacyUi: isCN ? true : false,
                    overviewShowDeathCount: false,
                    overviewShowXpPerDay: false,
                    overviewShowExpectDrop: false,
                    overviewMsgFmt: isCN ? '总计价值: {income}   每天收入: {income.daily}/d   期望日入: {income.daily.mean}/d   当前运气: {luck}' : 'Income: {income}   Daily Income: {income.daily}/d   Expected Daily Income: {income.daily.mean}/d   Luck: {luck}',
                    /** @type {'doubleClick' | 'ctrlClick' | 'disable'} */ overviewInsertToChatAction: isMobile ? 'doubleClick' : 'ctrlClick',
                    customPanelShowSolo: false,
                    customPanelMaxRunCount: 100000,
                    customPanelMaxSliderValue: 1500,
                    detailsChartCdfEps: 0.05,
                    detailsChartSigmaCoeff: 2,
                    customChartCdfEps: 0.005,
                    customChartSigmaCoeff: 2,
                },
            },
            chestDrop: {
                verbose: false,
                // analyzer: { },
                ui: {
                    useOriginalPopup: false,
                    overviewItemSortOrder: 'rarity', // unitBit, totalBid, default
                    customPanelMaxCount: 1000,
                    customPanelMaxSliderValue: 100,
                    detailsChartCdfEps: 0.05,
                    detailsChartSigmaCoeff: 2,
                    customChartCdfEps: 0.005,
                    customChartSigmaCoeff: 2,
                }
            },
        };
        const defaultConfig = JSON.parse(JSON.stringify(Config));
        const ConfigManager = new class {
            storageDataName = 'config';
            constructor() { this.loadConfig(); }
            loadConfig() {
                function readConfig(defaultConfig, userConfig) {
                    if (typeof defaultConfig !== 'object') {
                        return userConfig ?? defaultConfig;
                    }
                    const ret = {};
                    for (const [key, value] of Object.entries(defaultConfig)) {
                        if (userConfig.hasOwnProperty(key)) ret[key] = readConfig(value, userConfig[key]);
                        else ret[key] = value;
                    }
                    return ret;
                }
                Config = readConfig(Config, LocalStorageData.get(this.storageDataName) ?? {});
            }
            saveConfig() {
                LocalStorageData.set(this.storageDataName, Config);
            }
            reset() {
                LocalStorageData.set(this.storageDataName, {});
            }
        };
    
        const defaultLanguage = isCN ? 'zh' : 'en';
        let language;
        function updateLanguage() { language = Config.general.language === 'default' ? defaultLanguage : Config.general.language; }
        updateLanguage();
    
        const UiLocale = {
            chart: {
                expectation: { zh: '期望', en: 'Expectation' },
                stddev: { zh: '标准差', en: 'Standard Deviation' },
                median: { zh: '中位数', en: 'Median' },
                income: { zh: '收入', en: 'Income' },
            },
            battleDrop: {
                tabLabel: { zh: '战斗', en: 'Combat' },
                btnLabel: { zh: '统计', en: 'Statistics' },
                sortOrder: {
                    totalBid: { zh: '总价值（卖）', en: 'Total price (bid)' },
                    totalAsk: { zh: '总价值（买）', en: 'Total price (ask)' },
                    unitBid: { zh: '单位价值（卖）', en: 'Unit price (bid)' },
                    unitAsk: { zh: '单位价值（买）', en: 'Unit price (ask)' },
                },
                overview: {
                    tabLabel: { zh: '概览', en: 'Overview' },
                    income: { zh: '总计价值', en: 'Income' },
                    dailyIncome: { zh: '每天收入', en: 'Daily Income' },
                    dailyProfit: { zh: '每天利润', en: 'Daily Profit' },
                    luck: { zh: '当前运气', en: 'Luck' },
                    mean: { zh: '期望', en: 'mean' },
                    stdDev: { zh: '标准差', en: 'std. dev.' },
                    experience: { zh: '经验', en: ' EXP' },
                    total: { zh: '总计', en: 'Total'},
                    incomeExpt: { zh: '期望产值', en: 'E[income]' },
                    dailyIncomeExpt: { zh: '期望日入', en: 'E[daily income]' },
                    dailyProfitExpt: { zh: '期望日利', en: 'E[daily profit]' },
                    deathCount: { zh: '死亡次数', en: 'Death Count' },
                    info400: {
                        zh: r => `打了 ${r} 次<br>什么都没掉${['🤡', '😅', '😰', '😨', '😋', '😵', '🤯'][Utils.randInt(0, 7)]}`,
                        en: r => `${r} epochs,<br>get nothing${['🤡', '😅', '😰', '😨', '😋', '😵', '🤯'][Utils.randInt(0, 7)]}`,
                    },
                    info800: {
                        zh: r => `打了 ${r} 次<br>什么都没掉🤣👉`,
                        en: r => `${r} epochs,<br>get nothing🤣👉`,
                    },
                },
                distribution: {
                    tabLabel: { zh: '分布', en: 'Distribution' },
                    allMap: { zh: '全图收益分布', en: 'Distributions for all maps' },
                    mapSelect: { zh: '地图', en: 'Map' },
                    epochInput: { zh: '战斗次数', en: 'Epochs' },
                    back: { zh: '返回', en: 'Back' },
                },
                history: {
                    tabLabel: { zh: '历史', en: 'History' },
                },
                settings: {
                    tabLabel: { zh: '设置', en: 'Settings' },
                    sortOrder: { zh: '掉落物排序方式', en: 'Loot items sorting order' },
                    displayLimit: { zh: '掉落物最大显示数量', en: 'Loot items display limit' },
                    showNormal: { zh: '显示普通掉落物', en: 'Show normal items' },
                    insertToChatAction: { zh: '发送统计信息到聊天框', en: 'Insert statistics information to chat panel' },
                    doubleClick: { zh: '双击', en: 'Double click' },
                    ctrlClick: { zh: 'Ctrl + 单击', en: 'Ctrl + click' },
                    disable: { zh: '禁用', en: 'Disable' },
                    msgFmt: { zh: '消息格式', en: 'Chat message format' },
                    msgFmtDesc: {
                        zh: `
                            {income}: 当前收入; <br>
                            {income.daily}: 每日收入; <br>
                            {profit}: 当前利润; <br>
                            {profit.daily}: 每日利润; <br>
                            {*.mean}: 期望（例如 {income.daily.mean} 表示期望日入）; <br>
                            {*.stddev}: 标准差; <br>
                        `,
                        en: `
                            {income}: Current income; <br>
                            {income.daily}: Daily income; <br>
                            {profit}: Current profit; <br>
                            {profit.daily}: Daily profit; <br>
                            {*.mean}: Expectation (e.g., {income.daily.mean} denotes expected income per day); <br>
                            {*.stddev}: Standard deviation; <br>
                        `
                    },
                    useLegacyUi: { zh: '使用旧版 UI', en: 'Use legacy UI' },
                    showStdDev: { zh: '显示标准差', en: 'Show standard deviation' },
                    showDeathCount: { zh: '显示死亡次数', en: 'Show death count' },
                    showXpPerDay: { zh: '显示每日经验', en: 'Show xp per day'},
                    showExpectDrop: { zh: '显示掉落期望', en: 'Show expected drop'}
                },
            },
            chestDrop: {
                tabLabel: { zh: '开箱', en: 'Chest Opening' },
                sortOrder: {
                    default: { zh: '默认排序', en: 'Default' },
                    rarity: { zh: '稀有度', en: 'Rarity' },
                    totalBid: { zh: '总价值（卖）', en: 'Total price (bid)' },
                    unitBid: { zh: '单位价值（卖）', en: 'Unit price (bid)' },
                },
                chestOpen: {
                    tabLabel: { zh: '概览', en: 'Overview' },
                    openedLoot: { zh: '打开的战利品', en: 'Opened Loot' },
                    youFound: { zh: '你找到了', en: 'You found' },
                    currentChest: { zh: '当前箱子', en: 'Current' },
                    history: { zh: '历史记录', en: 'History' },
                    close: { zh: '关闭', en: 'Close' },
                    details: { zh: '详细', en: 'Details' },
                    count: { zh: '开箱次数', en: 'Amount' },
                    income: { zh: '开箱价值', en: 'Income' },
                    profit: { zh: '当前利润', en: 'Profit' },
                    luck: { zh: '当前运气', en: 'Luck' },
                    incomeExpt: { zh: '期望价值', en: 'E[income]' },
                    histLuck: { zh: '历史运气', en: 'Luck' },
                    higherThanExpt: { zh: '高于期望', en: 'Higher' },
                    lowerThanExpt: { zh: '低于期望', en: 'Lower' },
                    stdDev: { zh: '标准差', en: 'std. dev.' },
                },
                distribution: {
                    tabLabel: { zh: '分布', en: 'Distribution' },
                    allChest: { zh: '所有箱子收益分布', en: 'Distributions for all chests' },
                    chestSelect: { zh: '箱子', en: 'Chest' },
                    cntInput: { zh: '开箱次数', en: 'Amount' },
                    return: { zh: '返回', en: 'Return' },
                },
                settings: {
                    tabLabel: { zh: '设置', en: 'Settings' },
                    useOriPopup: { zh: '使用原版开箱界面', en: 'Use original popup' },
                },
            },
            taskAnalyzer: {
                tabLabel: { zh: '任务', en: 'Task' },
                btnLabel: { zh: '统计', en: 'Statistics' },
                tooltip: {
                    tabLabel: { zh: '任务统计', en: 'Statistics' },
                    overflowTime: { zh: '任务溢出时间', en: 'Task overflow time' },
                    expectedRewards: {
                        zh: (price, coin, token) => `任务期望奖励: ${price} (${coin} 金币, ${token} 任务代币)`,
                        en: (price, coin, token) => `Expected rewards: ${price} (${coin} coins, ${token} task tokens)`
                    },
                    expectedEpochs: { zh: '期望次数', en: 'Expected epochs in each zone' },
                    mapRunCount: {
                        zh: (z, tot, rest) => `图 ${z}: ${tot} 次 (剩 ${rest} 次)`,
                        en: (z, tot, rest) => `Z${z}: ${tot} (${rest} rest)`,
                    }
                },
            },
            tooltip: {
                item: {
                    count: { zh: '数量', en: 'Amount' },
                    price: { zh: '价格', en: 'Price' },
                }
            },
            settings: {
                market: {
                    tabLabel: { zh: '市场', en: 'Market' },
                    apiSource: { zh: '市场数据源', en: 'Market API source' },
                    apiAddr: { zh: 'API 地址', en: 'API address' },
                    apiOfficial: { zh: '官方', en: 'Official' },
                    apiCustom: { zh: '自定义', en: 'Custom' },
                    autoUpdateTime: { zh: '自动更新间隔 (h)', en: 'Auto update time interval (h)' },
                    updateMarket: { zh: '更新市场价格', en: 'Update market data' },
                    fetchMarketDataFail: { zh: '获取价格失败', en: 'Fetch market data failed' },
                    lastUpdated: { zh: '上次更新时间', en: 'Last updated' },
                    updating: { zh: '更新中', en: 'Updating' },
                    updateFinish: { zh: '更新完成', en: 'Update finished' },
                    computeNetProfit: { zh: '计算净利润', en: 'Show net profit' },
                    computeNetProfitDesc: { zh: '扣除 2% 的税 (牛铃扣 18%)', en: '2% taxed (18% for cowbells)' },
                    computeNonTradable: { zh: '计算不可交易物品的卖价', en: 'Compute bid price of non-tradeable assets' },
                    computeNonTradableDesc: { zh: '牛铃、背部装备等', en: 'Cowbells, back equipments' },
                },
                misc: {
                    tabLabel: { zh: '其它', en: 'Misc.' },
                    language: { zh: '语言', en: 'Language' },
                    languageDefault: { zh: '默认', en: 'Default' },
                    sampleRate: { zh: '采样数', en: 'Sample rate' },
                    sampleRateDesc: { zh: '采样数越大，运气计算越精确、速度越慢', en: 'Better accuracy but longer running time for larger sample rate' },
                    interpolationCount: { zh: '图表关键点数', en: 'Chart interpolation count' },
                    interpolationCountDesc: { zh: '关键点越多，图表绘制越精细', en: 'Better chart for larger interpolation count' },
                },
            },
        };
    
    
        //#region Listener
    
        const MessageHandler = new class {
            /**
             * @typedef { 'init_client_data' | 'init_character_data'
             *   | 'new_battle' | 'action_completed'
             *   | 'loot_opened'
             *   | 'skills_updated' | 'character_info_updated'
             *   | 'quests_updated' | 'task_type_blocks_updated' | 'discard_random_task'
             * } MessageType
             */
    
            listeners = {};
    
            constructor() { this.hookWS(); }
    
            hookWS() {
                const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
                const oriGet = dataProperty.get;
                dataProperty.get = hookedGet;
                Object.defineProperty(MessageEvent.prototype, "data", dataProperty);
                const handleMessageRecv = this.handleMessageRecv.bind(this);
    
                function hookedGet() {
                    const socket = this.currentTarget;
                    if (!(socket instanceof WebSocket)) {
                        return oriGet.call(this);
                    }
                    if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1 && socket.url.indexOf("api-test.milkywayidle.com/ws") <= -1 && socket.url.indexOf("api.milkywayidlecn.com/ws") <= -1 && socket.url.indexOf("api-test.milkywayidlecn.com/ws") <= -1) {
                        return oriGet.call(this);
                    }
                    const message = oriGet.call(this);
                    Object.defineProperty(this, "data", { value: message, configurable: true }); // Anti-loop
                    handleMessageRecv(message);
                    return message;
                }
            }
    
            /**
             *
             * @param {MessageType} type
             * @param {(msg: string) => void} handler
             * @param {number} priority
             */
            addListener(type, handler, priority = 0) {
                (this.listeners[type] ??= []).push({
                    handler: handler,
                    priority: priority,
                });
            }
    
            handleMessageRecv(message) {
                let obj = JSON.parse(message);
                if (!obj) return message;
                if (!this.listeners.hasOwnProperty(obj.type)) return message;
                this.listeners[obj.type]
                    .sort((a, b) => a.priority - b.priority)
                    .forEach(f => { f.handler(obj); });
                return message;
            }
        };
    
        const Keyboard = new class {
            #isKeyDown = {};
    
            constructor() {
                document.addEventListener('keydown', (event) => {
                    this.#isKeyDown[event.key] = true;
                });
                document.addEventListener('keyup', (event) => {
                    this.#isKeyDown[event.key] = false;
                });
            }
            isKeyDown(key) {
                return this.#isKeyDown[key] ?? false;
            }
            isCtrlDown() {
                return this.isKeyDown('Control') || this.isKeyDown('Meta');
            }
        }
    
        //#endregion
    
    
        //#region Math
    
        /** Complex number
         * @typedef {number[]} Complex
         */
        const Complex = new class {
            add = (a, b) => [a[0] + b[0], a[1] + b[1]]
            sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
            mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
            mulRe = (a, x) => [a[0] * x, a[1] * x]
            div = (a, b) => {
                const mag = b[0] * b[0] + b[1] * b[1];
                return [(a[0] * b[0] + a[1] * b[1]) / mag, (a[1] * b[0] - a[0] * b[1]) / mag];
            }
            abs = (c) => Math.sqrt(c[0] * c[0] + c[1] * c[1])
            pow = (c, x) => {
                const arg = Math.atan2(c[1], c[0]) * x;
                const mag = Math.pow(c[0] * c[0] + c[1] * c[1], x / 2);
                return [mag * Math.cos(arg), mag * Math.sin(arg)];
            }
        };
    
        const ComplexVector = new class {
            constantRe(n, a) {
                const v = Array(n);
                for (let i = 0; i < n; i += 4) {
                    v[i] = [a, 0]; v[i + 1] = [a, 0]; v[i + 2] = [a, 0]; v[i + 3] = [a, 0];
                    // v[i + 4] = [a, 0]; v[i + 5] = [a, 0]; v[i + 6] = [a, 0]; v[i + 7] = [a, 0];
                }
                return v;
            }
            mul(a, b) {
                const n = a.length, z = Array(n);
                for (let i = 0; i < n;) {
                    z[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                    z[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                    z[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                    z[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                }
                return z;
            }
            mulEq(a, b) {
                const n = a.length;
                for (let i = 0; i < n;) {
                    a[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                    a[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                    a[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                    a[i] = [a[i][0] * b[i][0] - a[i][1] * b[i][1], a[i][0] * b[i][1] + a[i][1] * b[i][0]]; ++i;
                }
                return a;
            }
            mulReEq(a, x) {
                const n = a.length;
                for (let i = 0; i < n;) {
                    a[i][0] *= x; a[i][1] *= x; ++i;
                    a[i][0] *= x; a[i][1] *= x; ++i;
                    a[i][0] *= x; a[i][1] *= x; ++i;
                    a[i][0] *= x; a[i][1] *= x; ++i;
                }
                return a;
            }
            addEq(a, b) {
                const n = a.length;
                for (let i = 0; i < n;) {
                    a[i][0] += b[i][0]; a[i][1] += b[i][1]; ++i;
                    a[i][0] += b[i][0]; a[i][1] += b[i][1]; ++i;
                    a[i][0] += b[i][0]; a[i][1] += b[i][1]; ++i;
                    a[i][0] += b[i][0]; a[i][1] += b[i][1]; ++i;
                }
                return a;
            }
            addMulEq(dest, a, b) {
                const n = dest.length;
                for (let i = 0; i < n;) {
                    dest[i][0] += a[i][0] * b[i][0] - a[i][1] * b[i][1]; dest[i][1] += a[i][0] * b[i][1] + a[i][1] * b[i][0]; ++i;
                    dest[i][0] += a[i][0] * b[i][0] - a[i][1] * b[i][1]; dest[i][1] += a[i][0] * b[i][1] + a[i][1] * b[i][0]; ++i;
                    dest[i][0] += a[i][0] * b[i][0] - a[i][1] * b[i][1]; dest[i][1] += a[i][0] * b[i][1] + a[i][1] * b[i][0]; ++i;
                    dest[i][0] += a[i][0] * b[i][0] - a[i][1] * b[i][1]; dest[i][1] += a[i][0] * b[i][1] + a[i][1] * b[i][0]; ++i;
                }
                return a;
            }
        };
    
        /** Cumulative distribution function
         * @typedef {(x: number) => number} CDF
         */
        /** Characteristic function: (samples, scale) => [ MGF(scale * T * 2πi) : 0 <= T < samples ]
         * @typedef {(samples: number, scale: number) => Complex[]} CharaFunc
         */
        const CharaFunc = new class {
            // returns [exp(Tai) : 0 <= T < samples]
            getRoots(a, samples) {
                let sin = Array(samples), cos = Array(samples);
                sin[0] = 0; cos[0] = 1;
                sin[1] = Math.sin(a); cos[1] = Math.cos(a);
                sin[2] = sin[1] * cos[1] + cos[1] * sin[1]; cos[2] = cos[1] * cos[1] - sin[1] * sin[1];
                sin[3] = sin[1] * cos[2] + cos[1] * sin[2]; cos[3] = cos[1] * cos[2] - sin[1] * sin[2];
                for (let i = 4; i < samples; i += 4) {
                    const j = Utils.floor(i / 2), k = i - j;
                    sin[i] = sin[j] * cos[k] + cos[j] * sin[k]; cos[i] = cos[j] * cos[k] - sin[j] * sin[k];
                    sin[i + 1] = sin[j] * cos[k + 1] + cos[j] * sin[k + 1]; cos[i + 1] = cos[j] * cos[k + 1] - sin[j] * sin[k + 1];
                    sin[i + 2] = sin[j + 1] * cos[k + 1] + cos[j + 1] * sin[k + 1]; cos[i + 2] = cos[j + 1] * cos[k + 1] - sin[j + 1] * sin[k + 1];
                    sin[i + 3] = sin[j + 1] * cos[k + 2] + cos[j + 1] * sin[k + 2]; cos[i + 3] = cos[j + 1] * cos[k + 2] - sin[j + 1] * sin[k + 2];
                }
                return [cos, sin];
            }
    
            constant(x) {
                return (samples, _) => ComplexVector.constantRe(samples, x);
            }
            mul(cf1, cf2) {
                return (samples, scale) => {
                    const z = cf1(samples, scale);
                    const y = cf2(samples, scale);
                    ComplexVector.mulEq(z, y);
                    return z;
                };
            }
            mulList(cfs) {
                if (cfs.length === 0) return this.constant(1);
                return (samples, scale) => {
                    let z = cfs[0](samples, scale);
                    for (let i = 1; i < cfs.length; ++i) {
                        const y = cfs[i](samples, scale);
                        ComplexVector.mulEq(z, y);
                    }
                    return z;
                };
            }
            pow(cf, n) {
                return (samples, scale) => {
                    let z = cf(samples, scale);
                    for (let T = 0; T < samples; ++T) z[T] = Complex.pow(z[T], n);
                    return z;
                };
            }
    
            // Compute cumulative distribution function given characteristic function.
            // return (x) => CDF(x / scale)
            getScaledCDF(cf, samples, scale) {
                const padding = 2;
                const offset = Config.charaFunc.cdfWrapping;
    
                const N = samples * padding;
                const val = cf(samples, scale * (1 - offset))
                    .concat(Array(N - samples).fill([0, 0]));
                let re = val.map(a => a[0]);
                let im = val.map(a => a[1]);
                FFT.init(N);
                FFT.fft(re, im);
                re = re.map(a => a - 0.5);
                const sum = re.reduce((x, acc) => acc + x, 0);
                re = re.map(a => a / sum);
    
                let cdf = Array(N);
                cdf[0] = (re[0] + re[N - 1]) / 2;
                for (let i = 1; i < N; ++i) {
                    cdf[i] = cdf[i - 1] + (re[i] + re[i - 1]) / 2;
                }
                const movingMedian = (a, siz) => {
                    const n = a.length;
                    let b = Array(n);
                    for (let i = 0; i < n; ++i) {
                        let w = [];
                        for (let j = i - siz + 1; j <= i + siz; ++j) {
                            const p = a[(j + n) % n];
                            const x = j < 0 ? p - 1 : j >= n ? p + 1 : p;
                            w.push(x);
                        }
                        for (let i = 0; i <= siz; ++i) {
                            for (let j = i + 1; j < w.length; ++j) {
                                if (w[i] > w[j]) { const t = w[i]; w[i] = w[j]; w[j] = t; }
                            }
                        }
                        b[i] = (w[siz - 1] + w[siz]) / 2;
                    }
                    return b;
                }
                cdf = movingMedian(cdf, padding);
                let base = cdf[Utils.floor(N * (1 - offset))] - 1;
                for (let i = 0; i < N; ++i) cdf[i] -= base;
                for (let i = 1; i < N; ++i) if (cdf[i] < cdf[i - 1]) cdf[i] = cdf[i - 1];
    
                const interpolate = (acc, x) => {
                    if (x < 0) return 0;
                    if (x >= 1) return 1;
                    const t = x * (1 - offset) * N - 0.5;
                    const i = Utils.round(t), r = t - i;
                    const L = i - 1 < 0 ? acc[i + N - 1] - 1 : acc[i - 1];
                    const R = i + 1 >= N ? acc[i - N + 1] + 1 : acc[i + 1];
                    const A = (acc[i] + L) / 2, B = (acc[i] + R) / 2;
                    const kA = acc[i] - L, kB = R - acc[i];
                    const ret = 2 * (r + 1) * (r - 0.5) * (r - 0.5) * A
                        + 2 * (1 - r) * (r + 0.5) * (r + 0.5) * B
                        + (r * r - 0.25) * ((r - 0.5) * kA + (r + 0.5) * kB);
                    return ret < 0 ? 0 : ret > 1 ? 1 : ret;
                };
                return (x) => interpolate(cdf, x);
            }
    
            // return {limit, (x) => CDF(x)}
            getCDF(cf, samples, limit = 1e8, rescaleSamples = null) {
                const eps = Config.charaFunc.cdfEps;
                const speed = Config.charaFunc.cdfIterSpeed;
                const maxIter = Config.charaFunc.cdfMaxIter;
                rescaleSamples ??= Config.charaFunc.rescaleSamples;
                for (let i = 0; i < maxIter; ++i) {
                    if (Config.charaFunc.verbose) out(`iteration ${i}: limit = ${limit}`);
                    let cdf = this.getScaledCDF(cf, rescaleSamples, 1 / limit);
                    if (cdf(speed) < 1 - eps) break;
                    const x = Utils.binarySearch(cdf, 0, 1, 1 - eps);
                    if (x / speed > 1 - Config.charaFunc.cdfLimitEps) break;
                    limit *= x / speed;
                }
                let cdf = this.getScaledCDF(cf, samples, 1 / limit);
                return {
                    limit: limit,
                    cdf: (x) => cdf(x / limit),
                };
            }
        };
    
        const DropAnalyzer = new class {
            /**
             * @typedef {Object} ItemDropData
             * @property {string} hrid 物品名称
             * @property {number[] | number} dropRate 掉落概率
             * @property {number} minCount 最少掉落数量
             * @property {number} maxCount 最多掉落数量
             * @property {number} price 物品价格
             */
    
            /**
             * @param {ItemDropData} item
             * @param {number} difficultyTier
             * @returns {number}
             */
            itemCountExpt(item, difficultyTier = 0) {
                let { minCount: l, maxCount: r, dropRate } = item;
                if (!(typeof dropRate === 'number')) {dropRate = dropRate[difficultyTier]}
                return dropRate * (l + r) / 2;
            }
    
            /**
             * @param {ItemDropData} item
             * @param {number} difficultyTier
             * @returns {number}
             */
            itemCountVar(item, difficultyTier = 0) {
                let { minCount: l, maxCount: r, dropRate } = item;
                const F = (x) => {
                    const a = Math.floor(x);
                    const p = x - a;
                    return a * ((a * a + 0.5) / 3 + p * (a + p)) + p * p / 2;
                };
                const EX2 = (l, r) => {
                    if (r > l + 1e-5) {
                        return (F(r) - F(l)) / (r - l);
                    } else {
                        const x = (l + r) / 2;
                        const a = Math.floor(x);
                        const p = x - a;
                        return a * a + 2 * a * p + p;
                    }
                };
                const EX = this.itemCountExpt(item);
                if (!(typeof dropRate === 'number')) {dropRate = dropRate[difficultyTier]}
                return dropRate * EX2(l, r) - EX * EX;
            }
    
            /** Characteristic function for drop distribution (minCount, maxCount, dropRate, price).
             * @param {ItemDropData} data
             * @returns {CharaFunc}
             */
            charaFunc(data) {
                const { minCount: l, maxCount: r, dropRate, price } = data;
                const eps = 1e-8; // eps < 1/samples
                const L = Math.ceil(l);
                const R = Utils.floor(r);
    
                if (L > R || r - l < eps) {
                    const p = (l + r) / 2 - R;
                    const pr = p * dropRate;
                    const mpr = (1 - p) * dropRate;
                    const mr = 1 - dropRate;
    
                    // p: R+1, 1-p: R
                    return (samples, scale) => {
                        let val = Array(samples);
                        const base = 2 * Math.PI * scale * price;
                        const [cosR1, sinR1] = CharaFunc.getRoots(base * (R + 1), samples);
                        const [cosR, sinR] = CharaFunc.getRoots(base * R, samples);
                        for (let T = 0; T < samples; ++T) {
                            val[T] = [
                                cosR1[T] * pr + cosR[T] * mpr + mr,
                                sinR1[T] * pr + sinR[T] * mpr
                            ]
                        }
                        return val;
                    };
                }
                if (L == R) {
                    const pL = dropRate * (L - l) * (L - l) / ((r - l) * 2);
                    const pR = dropRate * (r - R) * (r - R) / ((r - l) * 2);
                    const mr = 1 - dropRate;
                    // pL: R-1, pR: R+1
                    return (samples, scale) => {
                        let val = Array(samples);
                        const base = 2 * Math.PI * scale * price;
                        const [cos, sin] = CharaFunc.getRoots(base, samples);
                        const [cosR, sinR] = CharaFunc.getRoots(base * R, samples);
                        for (let T = 0; T < samples; ++T) {
                            const a = [dropRate + (pL + pR) * (cos[T] - 1), (-pL + pR) * sin[T]];
                            val[T] = Complex.mul([cosR[T], sinR[T]], a);
                            val[T][0] += mr;
                        }
                        return val;
                    };
                }
    
                const dL = L - l, dR = r - R;
                const dL2 = dL * dL, dR2 = dR * dR;
                const mr = 1 - dropRate;
                const invLen = dropRate / (r - l);
                return (samples, scale) => {
                    let val = Array(samples);
                    const base = 2 * Math.PI * scale * price;
                    const [cos, sin] = CharaFunc.getRoots(base, samples);
                    const [cosR, sinR] = CharaFunc.getRoots(base * R, samples);
                    const [cosL, sinL] = CharaFunc.getRoots(base * L, samples);
                    for (let T = 0; T < samples; ++T) {
                        const ctm1d2 = (cos[T] - 1) / 2, std2 = sin[T] / 2;
                        const elt = [cosL[T], sinL[T]];
                        const ert = [cosR[T], sinR[T]];
                        const fL = Complex.mul([dL + dL2 * ctm1d2, -dL2 * std2], elt);
                        const fR = Complex.mul([dR + dR2 * ctm1d2, dR2 * std2], ert)
                        const irwin = ctm1d2 > -eps && std2 < eps && std2 > -eps ?
                            [(R - L) * elt[0], (R - L) * (elt[1] + std2 * (R - L - 1))] :
                            Complex.div([ert[0] - elt[0], ert[1] - elt[1]], [ctm1d2 * 2, std2 * 2]);
                        const fMid = Complex.mul(irwin, [1 + ctm1d2, std2]);
                        val[T] = [mr + invLen * (fL[0] + fR[0] + fMid[0]), invLen * (fL[1] + fR[1] + fMid[1])];
                    }
                    return val;
                };
            }
        };
    
        //#endregion
    
    
        //#region UI
    
        const Ui = new class {
            constructor() {
                // 创建阴影效果
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                defs.innerHTML = `
                    <filter id="lll_shadow" x="-20" y="-20" height="150" width="150">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                        <feOffset dx="0" dy="0" result="offsetblur"/>
                        <feFlood flood-color="rgba(0, 0, 0, 0.3)"/>
                        <feComposite in2="offsetblur" operator="in"/>
                        <feMerge>
                            <feMergeNode/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                `;
                svg.appendChild(defs);
                document.body.appendChild(svg);
            }
    
            /**
             * @param {HTMLElement} elem
             * @param {Object} options
             */
            applyOptions(elem, options) {
                if (typeof options === 'object') {
                    Object.entries(options ?? {}).forEach(([key, value]) => {
                        if (key === 'style' && typeof value === 'object') {
                            Object.entries(value ?? {}).forEach(([k, v]) => { elem.style[k] = v; });
                        } else elem[key] = value;
                    });
                } else elem.className = options;
            }
    
            elem(tagName, options = null, child = null) {
                const elem = document.createElement(tagName);
                this.applyOptions(elem, options);
                if (typeof child === 'object') {
                    if (Array.isArray(child)) child.forEach(child => { if (child !== null) elem.appendChild(child); });
                    else if (child) elem.appendChild(child);
                } else if (typeof child === 'string') elem.innerHTML = child;
                return elem;
            }
    
            div(options = null, childList = null) {
                return this.elem('div', options, childList);
            }
    
            button(text, options = null) {
                const button = Ui.elem('button', {
                    className: 'Button_button__1Fe9z lll_btn',
                    textContent: text,
                });
                this.applyOptions(button, options);
                return button;
            }
    
            /**
             * @param {{ checked: boolean, onchange: (checked: boolean) => void }} options
             * @param {Object} uiOptions
             */
            checkBox(options, uiOptions = null) {
                const input = Ui.elem('input', 'lll_input_checkbox');
                input.type = 'checkbox';
                input.checked = options.checked;
                input.onchange = () => { options.onchange(input.checked); };
                this.applyOptions(input, uiOptions);
                return input;
            }
    
            /**
             * @typedef {Object} SliderOptions
             * @property {number} initValue
             * @property {number} minValue
             * @property {number} maxValue
             * @property {(value: number) => number} mapFunc
             * @property {(sliderValue: number) => number} invMapFunc
             * @property {(value: number) => void} [oninput = null]
             * @property {(value: number) => void} [onchange = null]
             */
            /**
             * @param {SliderOptions} options
             * @param {Object} inputOptions
             * @param {Object} labelOptions
             * @param {Object} wrapperOptions
             */
            slider(options, inputOptions = null, labelOptions = null, wrapperOptions = null) {
                const input = Ui.elem('input', 'lll_input_slider');
                this.applyOptions(input, inputOptions);
                input.type = 'range';
                input.min = Math.ceil(options.invMapFunc(options.minValue)).toString();
                input.max = Math.floor(options.invMapFunc(options.maxValue)).toString();
                input.step = '1';
                input.value = Math.round(options.invMapFunc(options.initValue)).toString();
                const label = Ui.div('lll_input_sliderLabel', options.initValue.toString());
                this.applyOptions(label, labelOptions);
                const wrapper = Ui.div('lll_input_sliderWrapper', [input, label]);
                this.applyOptions(wrapper, wrapperOptions);
                input.oninput = () => {
                    const value = options.mapFunc(parseInt(input.value));
                    label.innerHTML = value.toString();
                    options.oninput?.(value);
                };
                input.onchange = () => {
                    const value = options.mapFunc(parseInt(input.value));
                    label.innerHTML = value.toString();
                    options.onchange?.(value);
                };
                return wrapper;
            }
    
            /**
             * @typedef {Object} NumberInputOptions
             * @property {number} initValue
             * @property {number} minValue
             * @property {number} maxValue
             * @property {(value: number) => void} [oninput = null]
             * @property {(value: number) => void} [onchange = null]
             */
            /**
             * @param {NumberInputOptions} options
             * @param {Object} uiOptions
             */
            numberInput(options, uiOptions = null) {
                let input = Ui.elem('input', 'lll_input');
                this.applyOptions(input, uiOptions);
                input.type = 'number';
                input.min = options.minValue.toString();
                input.max = options.maxValue.toString();
                input.step = 1;
                input.value = options.initValue.toString();
                input.oninput = () => {
                    let val = Math.round(parseInt(input.value));
                    options.oninput?.(val);
                }
                input.onchange = () => {
                    let val = Math.round(parseInt(input.value));
                    val = Math.min(Math.max(val, options.minValue), options.maxValue);
                    input.value = val.toString();
                    options.onchange?.(val);
                };
                return input;
            }
    
            itemSvgIcon(hrid, size = 20, useShadow = false) {
                // 创建图标
                let svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svgIcon.setAttribute('width', size.toString());
                svgIcon.setAttribute('height', size.toString());
                svgIcon.style.verticalAlign = 'middle';
    
                let useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                let item_icon_url = document.querySelector("div[class^='Item_itemContainer'] use")?.getAttribute("href")?.split("#")[0];
                item_icon_url ??= '/static/media/items_sprite.6d12eb9d.svg';
                useElement.setAttribute('href', `${item_icon_url}#${hrid.split('/').pop()}`);
                if (useShadow) useElement.setAttribute('filter', 'url(#lll_shadow)');
                svgIcon.appendChild(useElement);
                return svgIcon;
            }
        };
    
        const Tooltip = new class {
            root = null;
            tooltip = null;
    
            constructor() { this.init(); }
    
            init() {
                const rootClass = 'link-tooltip MuiPopper-root MuiTooltip-popper css-112l0a2';
                const tooltipClass = 'MuiTooltip-tooltip MuiTooltip-tooltipPlacementBottom css-1spb1s5';
                this.tooltip = Ui.div(tooltipClass);
                this.root = Ui.div({ className: rootClass, style: { zIndex: 100000, position: 'absolute' } }, this.tooltip);
                document.body.appendChild(this.root);
                this.hide();
            }
    
            /**
             * @param {Element} target
             * @param {Element | (() => Element)} content
             * @param {'left' | 'center'} align
             */
            attach(target, content, align = 'left') {
                const contentGen = typeof content === 'function' ? content : (() => content);
                target.addEventListener('mouseover', (e) => {
                    this.show(contentGen().outerHTML, target, align);
                });
                target.addEventListener('mouseout', () => {
                    this.hide();
                });
            }
            show(innerHTML, target = null, align = 'left') {
                const gap = 2;
                this.root.style.display = 'block';
                this.root.style.left = 0;
                this.root.style.top = 0;
                this.tooltip.innerHTML = innerHTML;
                if (target) {
                    const targetRect = target.getBoundingClientRect();
                    const tooltipRootRect = this.root.getBoundingClientRect();
                    const tooltipRect = this.tooltip.getBoundingClientRect();
                    let left = targetRect.left;
                    if (align === 'center') left -= (tooltipRect.width - targetRect.width) / 2;
                    let top = targetRect.bottom + gap;
                    const windowWidth = window.innerWidth;
                    const windowHeight = window.innerHeight + window.scrollY;
                    if (left + tooltipRect.width > windowWidth) left = windowWidth - tooltipRect.width;
                    if (left < 0) left = 0;
                    if (top + tooltipRect.height > windowHeight) top = targetRect.top - tooltipRect.height - gap;
                    this.root.style.left = `${left - (tooltipRootRect.width - tooltipRect.width) / 2}px`;
                    this.root.style.top = `${top - (tooltipRootRect.height - tooltipRect.height) / 2}px`;
                }
            }
            hide() { this.root.style.display = 'none'; }
    
            description(title, content) {
                const childList = title !== null ? [
                    Ui.div('GuideTooltip_title__1QDN9', title),
                    Ui.div('GuideTooltip_content__1_yqJ', Ui.div('GuideTooltip_paragraph__18Zcq', content)),
                ] : [
                    Ui.div('GuideTooltip_paragraph__18Zcq', content)
                ];
                return Ui.div('GuideTooltip_guideTooltipText__PhA_Q', childList);
            }
            item(hrid, count) {
                const ask = Market.getPriceByHrid(hrid, 'ask');
                const bid = Market.getPriceByHrid(hrid, 'bid');
                const formatPrice = x => Utils.formatPrice(x, { precision: 3 });
                return Ui.div('ItemTooltipText_itemTooltipText__zFq3A', [
                    Ui.div('ItemTooltipText_name__2JAHA', Localizer.hridToName(hrid)),
                    Ui.div(null, `${UiLocale.tooltip.item.count[language]}: ${Utils.formatNumber(count)}`),
                    Ui.div({ style: { color: '#804600' } },
                        `${UiLocale.tooltip.item.price[language]}: ${formatPrice(ask)} / ${formatPrice(bid)} (${formatPrice(ask * count)} / ${formatPrice(bid * count)})`
                    ),
                ]);
            }
        }
    
        class Popup {
            parentNode = document.body;
            root = null;
            onclose = null;
            rescale() { }
            construct() {
                throw new Error("Method not implemented.");
            }
            open() {
                if (this.root) this.close();
                this.construct();
                this.parentNode.append(this.root);
                const onWindowResize = () => {
                    if (!this.root) return;
                    this.rescale();
                }
                onWindowResize();
                window.addEventListener('resize', () => { onWindowResize(); });
            }
            close() {
                if (!this.root) return;
                this.onclose?.();
                this.parentNode.removeChild(this.root);
                this.root = null;
            }
        };
    
        class TabbedPopup extends Popup {
            btnContainer = null;
            btns = null;
            showSettings = true;
    
            pageContainer = null;
            pages = null;
            generators = null;
    
            pageTitle = null;
            pageTitleText = null;
            pageTitles = null;
    
            createCloseSvg() {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '11px');
                svg.setAttribute('height', '11px');
                svg.setAttribute('viewBox', '0 0 1280 1280');
                svg.innerHTML = `
                <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#5b2f2f" stroke="none">
                    <path d="M2321 12784 c-122 -33 -105 -17 -1184 -1093 -565 -565 -1041 -1046 -1057 -1070 -94 -140 -103 -331 -23 -471 16 -28 702 -722 1877 -1897 l1851 -1853 -1856 -1857 c-1511 -1512 -1860 -1867 -1878 -1906 -29 -64 -51 -152 -51 -202 0 -59 27 -161 57 -219 39 -74 2085 -2120 2159 -2159 137 -72 291 -74 427 -6 29 14 611 590 1899 1877 l1858 1857 1852 -1851 c1176 -1175 1870 -1861 1898 -1877 149 -86 343 -70 487 38 32 23 513 499 1069 1056 765 768 1017 1026 1037 1065 73 141 74 305 0 434 -16 28 -709 729 -1877 1898 l-1851 1852 1851 1853 c1168 1168 1861 1869 1877 1897 74 129 73 293 0 434 -20 39 -272 297 -1037 1065 -556 557 -1037 1033 -1069 1056 -144 108 -338 124 -487 38 -28 -16 -722 -702 -1898 -1877 l-1852 -1851 -1858 1857 c-1288 1287 -1870 1863 -1899 1877 -100 50 -219 63 -322 35z"/>
                </g>`;
                return svg;
            }
            createSettingsSvg() {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '13px');
                svg.setAttribute('height', '13px');
                svg.setAttribute('viewBox', '0 0 1280 1280');
                svg.innerHTML = `
                <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#2f3451" stroke="none">
                    <path d="M6010 12794 c-25 -2 -103 -9 -175 -15 -143 -12 -390 -49 -503 -74
                    l-72 -17 0 -529 0 -530 -139 -207 c-158 -234 -272 -376 -371 -461 -174 -150
                    -329 -225 -570 -277 -67 -15 -129 -18 -290 -18 -216 0 -338 13 -540 59 l-103
                    23 -366 366 -367 367 -139 -112 c-409 -327 -760 -689 -1070 -1102 l-58 -78
                    355 -357 356 -357 40 -105 c99 -258 137 -439 137 -655 0 -152 -9 -214 -47
                    -339 -97 -315 -393 -608 -871 -861 l-104 -55 -510 0 c-437 0 -512 -2 -516 -14
                    -10 -26 -55 -336 -69 -471 -8 -82 -13 -266 -12 -495 0 -373 10 -553 54 -954
                    11 -99 20 -183 20 -188 0 -4 227 -8 504 -8 l503 0 84 -34 c417 -169 661 -374
                    800 -672 141 -299 140 -732 -2 -1218 l-21 -71 -356 -357 -356 -357 27 -40 c45
                    -68 219 -281 350 -427 251 -282 517 -537 771 -740 l130 -105 371 371 371 370
                    79 10 c142 17 511 23 645 11 434 -40 741 -184 989 -464 75 -86 193 -261 250
                    -373 l41 -81 0 -525 0 -525 103 -16 c144 -23 406 -54 577 -69 189 -17 765 -16
                    935 0 137 14 468 59 498 68 16 5 17 39 17 538 l0 532 46 95 c141 290 366 525
                    634 659 117 59 291 114 445 141 113 20 164 23 385 24 154 0 302 -5 375 -14
                    l120 -13 397 -400 398 -401 37 29 c85 63 356 286 468 384 302 265 573 556 755
                    813 l34 48 -397 397 -397 397 -34 170 c-59 293 -70 384 -70 585 -1 143 4 204
                    18 270 48 220 136 387 291 549 142 149 293 255 533 375 l132 66 575 0 575 0 5
                    23 c7 35 34 248 50 407 52 515 43 1075 -26 1529 -11 75 -22 144 -25 154 -5 16
                    -42 17 -589 17 l-584 0 -128 64 c-540 271 -784 609 -818 1136 -10 155 22 485
                    75 760 l10 55 405 405 405 405 -64 93 c-205 303 -507 614 -872 897 -182 143
                    -372 278 -382 273 -5 -1 -184 -174 -396 -383 -279 -274 -397 -384 -424 -393
                    -20 -8 -100 -27 -177 -43 -747 -155 -1306 99 -1725 786 l-60 99 0 553 c0 455
                    -2 553 -13 553 -8 0 -94 9 -193 20 -364 40 -536 51 -829 54 -165 2 -320 2
                    -345 0z m725 -4200 c242 -29 482 -102 720 -219 252 -124 440 -260 636 -461
                    291 -300 495 -679 589 -1095 65 -289 67 -678 4 -964 -181 -817 -764 -1463
                    -1548 -1714 -241 -77 -425 -105 -691 -105 -372 0 -669 68 -1000 229 -332 161
                    -616 393 -826 675 -113 152 -159 227 -239 392 -117 239 -193 507 -221 777 -16
                    153 -6 431 20 586 123 727 562 1329 1214 1665 420 217 856 293 1342 234z"/>
                </g>`;
                return svg;
            }
    
            rescale() {
                // ref: 650px
                if (!window?.innerWidth) return;
                const maxWidth = 0.9 * window.innerWidth;
                const scale = Math.min(1, maxWidth / 650);
                this.root.style.transform = `translate(-50%, -50%) scale(${scale})`;
                this.root.style.maxWidth = `${90 / scale}%`;
                this.root.style.maxHeight = `${90 / scale}%`;
            }
    
            handleDrag(header, panel) {
                let offsetX, offsetY;
                let dragging = false;
                let dragStartTime = 0;
                const dragBegin = function (e, pos) {
                    const rect = panel.getBoundingClientRect();
                    const isResizing = e.clientX > rect.right - 10 || e.clientY > rect.bottom - 10;
                    if (isResizing || e.target.className === "lll_tab_btn") return;
                    dragging = true;
                    offsetX = pos.clientX - panel.offsetLeft;
                    offsetY = pos.clientY - panel.offsetTop;
                    e.preventDefault();
                };
                const dragMove = function (e, pos) {
                    if (!dragging) return;
                    const now = Date.now();
                    if (now - dragStartTime < 16) return; // 限制每16毫秒更新一次
                    dragStartTime = now;
    
                    var newX = pos.clientX - offsetX;
                    var newY = pos.clientY - offsetY;
                    panel.style.left = Math.round(newX) + "px";
                    panel.style.top = Math.round(newY) + "px";
                };
                const dragEnd = function () { dragging = false; };
    
                header.addEventListener("mousedown", e => { dragBegin(e, e); });
                document.addEventListener("mousemove", e => { dragMove(e, e); });
                document.addEventListener("mouseup", dragEnd);
    
                header.addEventListener("touchstart", e => { dragBegin(e, e.touches[0]); });
                document.addEventListener("touchmove", e => { dragMove(e, e.touches[0]); });
                document.addEventListener("touchend", dragEnd);
            }
    
            construct() {
                this.btnContainer = Ui.div('lll_tab_btnContainer');
                this.btns = [];
                this.pageTitleText = Ui.div('lll_tab_pageTitleText');
                this.pages = [];
                this.pages = [];
                this.generators = [];
                this.pageTitle = Ui.div('lll_tab_pageTitle', this.pageTitleText);
                this.pageContainer = Ui.div('lll_tab_pageContainer', this.pageTitle);
                this.pageTitles = [];
                const settingsBtn = Ui.div('lll_tab_btnSettingsContainer', Ui.div('lll_tab_btnSettings', this.createSettingsSvg()));
                settingsBtn.onclick = () => { SettingsUi.showPopup(); };
                const closeBtn = Ui.div('lll_tab_btnCloseContainer', Ui.div('lll_tab_btnClose', this.createCloseSvg()));
                closeBtn.onclick = () => { this.close(); };
                this.root = Ui.div('lll_popup_root', [
                    Ui.div({ style: 'display: flex;' }, [this.btnContainer, this.showSettings ? settingsBtn : null, closeBtn]),
                    this.pageContainer
                ]);
                this.handleDrag(this.btnContainer, this.root);
            }
            switchTab(id) {
                for (let i = 0; i < this.pages.length; ++i) {
                    this.pages[i].className = i === id ? 'lll_tab_page active' : 'lll_tab_page';
                    this.btns[i].className = i === id ? 'lll_tab_btn active' : 'lll_tab_btn';
                }
                const currentPage = this.pages[id];
                if (currentPage.lastChild) {
                    currentPage.removeChild(currentPage.lastChild);
                }
                currentPage.appendChild(this.generators[id]());
                if (this.pageTitles[id]) {
                    this.pageTitleText.innerHTML = this.pageTitles[id];
                    this.pageTitle.style.display = 'block';
                } else this.pageTitle.style.display = 'none';
            }
            addTab(text, content, title = null) {
                const id = this.pages.length;
                const contentGen = typeof content === 'function' ? content : (() => content);
                this.generators.push(contentGen);
    
                const btn = Ui.div('lll_tab_btn', text);
                btn.onclick = () => { this.switchTab(id); };
                this.btns.push(btn);
                this.btnContainer.appendChild(btn);
    
                const page = Ui.div('lll_tab_page');
                this.pages.push(page);
                this.pageContainer.appendChild(page);
                const titleHTML = typeof title === 'object' ? title?.outerHTML : title;
                this.pageTitles.push(titleHTML);
                if (id === 0) this.switchTab(id);
            }
        };
    
        class PlainPopup extends Popup {
            title = '';
            contentGen = null;
    
            construct() {
                this.root = Ui.div('lll_plainPopup_root', [
                    Ui.div({ className: 'lll_plainPopup_background', onclick: () => { this.close(); } }),
                    Ui.div('lll_plainPopup_containerRoot',
                        Ui.div('lll_plainPopup_container', [
                            Ui.div('lll_plainPopup_title', this.title),
                            this.contentGen(),
                        ])
                    )
                ]);
            }
            setContent(content, title = null) {
                this.contentGen = typeof content === 'function' ? content : (() => content);
                this.title = title;
            }
        };
    
        const ChartRenderer = new class {
            constructor() {
                this.initChartTooltip();
            }
    
            initChartTooltip() {
                // @ts-ignore
                Chart.Tooltip.positioners.myCustomPositioner = function (elements, eventPosition) {
                    let x = 0, y = 0, count = 0;
                    for (let e of elements) {
                        // @ts-ignore
                        const datasets = eventPosition.chart?.data?.datasets;
                        if (datasets) this._datasets = datasets;
                        if (this._datasets[e.datasetIndex].tag != "cdf") continue;
                        x += e.element.x; y += e.element.y; ++count;
                    }
                    if (count == 0) return false;
                    if (count > 0) { x /= count; y /= count; }
                    else { x = eventPosition.x; y = eventPosition.y; }
                    return { x: x, y: y };
                };
                // @ts-ignore
                Chart.Interaction.modes.myCustomMode = function (chart, e, options) {
                    let items = [];
                    for (let datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
                        if (chart.data.datasets[datasetIndex].tag == "aux") continue;
    
                        let meta = chart.getDatasetMeta(datasetIndex);
                        if (meta.hidden ?? chart.data.datasets[datasetIndex].hidden) continue;
    
                        let xScale = chart.scales[meta.xAxisID];
                        let yScale = chart.scales[meta.yAxisID];
                        let xValue = xScale.getValueForPixel(e.x);
                        if (xValue > xScale.max || xValue < xScale.min) continue;
    
                        let data = chart.data.datasets[datasetIndex].data;
                        let index = data.findIndex(o => o.x >= xValue);
                        if (index === -1) continue;
    
                        // linear interpolate value
                        let prev = data[index - 1], next = data[index];
                        let interpolatedValue = NaN;
                        if (prev && next) {
                            let slope = (next.y - prev.y) / (next.x - prev.x);
                            interpolatedValue = prev.y + (xValue - prev.x) * slope;
                        }
                        if (isNaN(interpolatedValue)) continue;
                        let yPosition = yScale.getPixelForValue(interpolatedValue);
                        if (isNaN(yPosition)) continue;
    
                        // create a 'fake' event point
                        let fakePoint = {
                            hasValue: function () { return true; },
                            tooltipPosition: function () { return this._model },
                            value: { x: xValue, y: interpolatedValue },
                            skip: false,
                            stop: false,
                            x: e.x,
                            y: yPosition
                        }
                        items.push({ datasetIndex: datasetIndex, element: fakePoint, index: 0 });
                    }
                    return items;
                };
            }
    
            #generateDataSetCDF(f, l, r) {
                const N = Config.chart.interpolatePoints;
                let ret = [];
                for (let i = 0; i <= N; ++i) {
                    const x = i * (r - l) / N + l;
                    ret.push({ x: x, y: f(x) });
                }
                return ret;
            };
            #generateDataSetPDF(f, l, r) {
                const N = Config.chart.interpolatePoints;
                let ret = [], pre = f(l - (r - l) / N), max = 0;
                for (let i = 0; i <= N; ++i) {
                    const x = i * (r - l) / N + l;
                    const cur = f(x);
                    ret.push({ x: x, y: cur - pre });
                    max = Math.max(cur - pre, max);
                    pre = cur;
                }
                for (let i = 0; i <= N; ++i) ret[i].y /= max;
                for (let i = 0; i <= N; ++i) ret[i].y = ret[i].y * 0.8 - 1;
                return ret;
            };
    
            /**
             * @param {HTMLCanvasElement} canvas
             * @param {{
             *     limitL: number, limitR: number,
             *     datasets: { cdf: CDF, shadow: number, display: boolean, label: string, color: number}[]
             * }} data
             * @returns {Chart}
             */
            cdfPdfChart(canvas, data) {
                const rgbaColor = (color, a) => {
                    return Utils.HSVtoRGB(color, 0.4, 1, a).rgba;
                }
                const generateCDF = (f, l = data.limitL, r = data.limitR) => this.#generateDataSetCDF(f, l, r);
                const generatePDF = (f, l = data.limitL, r = data.limitR) => this.#generateDataSetPDF(f, l, r);
    
                let datasets = [];
                for (const dataset of data.datasets) {
                    datasets.push({
                        borderColor: rgbaColor(dataset.color, 1),
                        borderWidth: 2,
                        showLine: true,
                        hidden: !dataset.display,
                        label: dataset.label,
                        data: generateCDF(dataset.cdf),
                        interpolate: true,
                        pointRadius: 0,
                        tension: Config.chart.tension,
                        fill: false,
                        tag: "cdf",
                    });
                    datasets.push({
                        borderColor: rgbaColor(dataset.color, 1),
                        borderWidth: 2,
                        showLine: true,
                        hidden: !dataset.display,
                        label: dataset.label + "(PDF)",
                        data: generatePDF(dataset.cdf),
                        interpolate: true,
                        pointRadius: 0,
                        tension: Config.chart.tension,
                        fill: false,
                        tag: "pdf",
                    });
                    datasets.push({
                        backgroundColor: rgbaColor(dataset.color, 0.4),
                        borderWidth: 0,
                        showLine: true,
                        label: "",
                        data: [{ x: 0, y: 0 }, { x: dataset.shadow, y: 0 }],
                        pointRadius: 0,
                        fill: "-2",
                        tag: "aux",
                    });
                    datasets.push({
                        backgroundColor: rgbaColor(dataset.color, 0.4),
                        borderWidth: 0,
                        showLine: true,
                        label: "",
                        data: [{ x: 0, y: -1 }, { x: dataset.shadow, y: -1 }],
                        pointRadius: 0,
                        fill: "-2",
                        tag: "aux",
                    });
                }
    
                const chart = new Chart(canvas.getContext('2d'), {
                    type: "scatter",
                    data: { datasets: datasets },
                    options: {
                        // @ts-ignore
                        animation: false,
                        interaction: {
                            intersect: false,
                            mode: 'myCustomMode',
                        },
                        plugins: {
                            crosshair: {
                                sync: { enabled: false },
                                zoom: { enabled: true },
                                callbacks: {
                                    afterZoom: () => function (start, end) {
                                        for (let i = 0; i < data.datasets.length; ++i) {
                                            const dataset = data.datasets[i];
                                            chart.data.datasets[i * 4].data = generateCDF(dataset.cdf, start, end);
                                            chart.data.datasets[i * 4 + 1].data = generatePDF(dataset.cdf, start, end);
                                        }
                                        chart.update();
                                    }
                                }
                            },
                            tooltip: {
                                enabled: true,
                                animation: false,
                                intersect: false,
                                position: 'myCustomPositioner',
                                filter: d => d.chart.data.datasets[d.datasetIndex].tag == "cdf",
                                callbacks: {
                                    title: d => Utils.formatPrice(d[0].element.value.x),
                                    label: d => {
                                        return d.chart.data.datasets[d.datasetIndex].label + ": " + d.element.value.y.toFixed(2);
                                    }
                                }
                            },
                            legend: {
                                display: true,
                                labels: { filter: (a, d) => d.datasets[a.datasetIndex].tag == "cdf" },
                                onClick: function (e, legendItem, legend) {
                                    const name = legendItem.text;
                                    const index = legendItem.datasetIndex;
                                    let ci = legend.chart;
                                    [
                                        ci.getDatasetMeta(index),
                                        ci.getDatasetMeta(index + 1),
                                    ].forEach(function (meta) {
                                        meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : !meta.hidden;
                                    });
                                    ci.update();
                                }
                            }
                        },
                        scales: {
                            // @ts-ignore
                            x: {
                                min: data.limitL,
                                max: data.limitR,
                                type: 'linear',
                                title: { display: true, text: UiLocale.chart.income[language] },
                                grid: { color: "rgba(255,255,255,0.15)" },
                                ticks: {
                                    color: "#FFFFFF",
                                    callback: (value, index, ticks) => Utils.formatPrice(value),
                                },
                                border: { color: "rgba(255,255,255,0.5)" },
                            },
                            y: {
                                min: -1,
                                max: 1,
                                title: { display: true, text: 'PDF | CDF' },
                                grid: {
                                    color: function (context) {
                                        if (context.tick.value == 0 || context.tick.value == -1)
                                            return "rgba(255,255,255,0.5)";
                                        return "rgba(255,255,255,0.15)";
                                    }
                                },
                                position: "left",
                                ticks: {
                                    callback: (value, index, ticks) => value >= 0 ? value : "",
                                }
                            },
                        }
                    },
                });
                return chart;
            }
    
            /**
             * @param {HTMLCanvasElement} canvas
             * @param {{
             *     limitL: number, limitR: number,
             *     cdf: CDF, mu: number, sigma: number, median: number
             * }} data
             * @returns {Chart}
             */
            cdfPdfWithMedianMeanChart(canvas, data) {
                const rgbaColor = (color, a, s = 0.4, v = 1) => {
                    return Utils.HSVtoRGB(color, s, v, a).rgba;
                }
                const generateCDF = (f, l = data.limitL, r = data.limitR) => this.#generateDataSetCDF(f, l, r);
                const generatePDF = (f, l = data.limitL, r = data.limitR) => this.#generateDataSetPDF(f, l, r);
                const interpolate = (data, x) => {
                    let index = data.findIndex(o => o.x >= x);
                    if (index === -1) return NaN;
                    let prev = data[index - 1], next = data[index];
                    let y = NaN;
                    if (prev && next) {
                        let slope = (next.y - prev.y) / (next.x - prev.x);
                        y = prev.y + (x - prev.x) * slope;
                    }
                    return y;
                }
    
    
                let datasets = [];
                datasets.push({
                    borderColor: rgbaColor(0, 1),
                    borderWidth: 2,
                    showLine: true,
                    label: '',
                    data: generateCDF(data.cdf),
                    interpolate: true,
                    pointRadius: 0,
                    tension: Config.chart.tension,
                    fill: false,
                    tag: "cdf",
                });
                datasets.push({
                    borderColor: rgbaColor(0, 1),
                    borderWidth: 2,
                    showLine: true,
                    label: '',
                    data: generatePDF(data.cdf),
                    interpolate: true,
                    pointRadius: 0,
                    tension: Config.chart.tension,
                    fill: false,
                    tag: "pdf",
                });
                datasets.push({
                    borderColor: rgbaColor(0, 1, 0.25),
                    borderWidth: 2,
                    showLine: true,
                    label: UiLocale.chart.expectation[language],
                    data: [{ x: data.mu, y: 0 }, { x: data.mu, y: interpolate(datasets[0].data, data.mu) }],
                    pointRadius: 0,
                    tag: "aux",
                });
                datasets.push({
                    borderColor: rgbaColor(0, 1, 0.25),
                    borderWidth: 2,
                    showLine: true,
                    label: "",
                    data: [{ x: data.mu, y: -1 }, { x: data.mu, y: interpolate(datasets[1].data, data.mu) }],
                    pointRadius: 0,
                    tag: "aux",
                });
                datasets.push({
                    backgroundColor: rgbaColor(0, 0.3, 0.3),
                    borderWidth: 0,
                    showLine: true,
                    label: UiLocale.chart.stddev[language],
                    data: [{ x: Math.max(0, data.mu - data.sigma), y: 0 }, { x: data.mu + data.sigma, y: 0 }],
                    pointRadius: 0,
                    fill: "-4",
                    tag: "aux",
                });
                datasets.push({
                    backgroundColor: rgbaColor(0, 0.3, 0.3),
                    borderWidth: 0,
                    showLine: true,
                    label: "",
                    data: [{ x: Math.max(0, data.mu - data.sigma), y: -1 }, { x: data.mu + data.sigma, y: -1 }],
                    pointRadius: 0,
                    fill: "-4",
                    tag: "aux",
                });
                datasets.push({
                    borderColor: rgbaColor(0.2, 1, 0.3),
                    borderWidth: 2,
                    showLine: true,
                    label: UiLocale.chart.median[language],
                    data: [{ x: data.median, y: 0 }, { x: data.median, y: interpolate(datasets[0].data, data.median) }],
                    pointRadius: 0,
                    tag: "aux",
                });
                datasets.push({
                    borderColor: rgbaColor(0.2, 1, 0.3),
                    borderWidth: 2,
                    showLine: true,
                    label: "",
                    data: [{ x: data.median, y: -1 }, { x: data.median, y: interpolate(datasets[1].data, data.median) }],
                    pointRadius: 0,
                    tag: "aux",
                });
    
                const chart = new Chart(canvas.getContext('2d'), {
                    type: "scatter",
                    data: { datasets: datasets },
                    options: {
                        // @ts-ignore
                        animation: false,
                        interaction: {
                            intersect: false,
                            mode: 'myCustomMode',
                        },
                        plugins: {
                            crosshair: {
                                sync: { enabled: false },
                                zoom: { enabled: true },
                                callbacks: {
                                    afterZoom: () => function (start, end) {
                                        chart.data.datasets[0].data = generateCDF(data.cdf, start, end);
                                        chart.data.datasets[1].data = generatePDF(data.cdf, start, end);
                                        chart.data.datasets[2].data = [{ x: data.mu, y: 0 }, { x: data.mu, y: interpolate(datasets[0].data, data.mu) }];
                                        chart.data.datasets[3].data = [{ x: data.mu, y: -1 }, { x: data.mu, y: interpolate(datasets[1].data, data.mu) }];
                                        chart.data.datasets[6].data = [{ x: data.median, y: 0 }, { x: data.median, y: interpolate(datasets[0].data, data.median) }];
                                        chart.data.datasets[7].data = [{ x: data.median, y: -1 }, { x: data.median, y: interpolate(datasets[1].data, data.median) }];
                                        chart.update();
                                    }
                                }
                            },
                            tooltip: {
                                enabled: true,
                                animation: false,
                                intersect: false,
                                position: 'myCustomPositioner',
                                filter: d => d.chart.data.datasets[d.datasetIndex].tag == "cdf",
                                callbacks: {
                                    title: d => Utils.formatPrice(d[0].element.value.x),
                                    label: d => {
                                        return d.chart.data.datasets[d.datasetIndex].label + ": " + d.element.value.y.toFixed(2);
                                    }
                                }
                            },
                            legend: {
                                display: true,
                                labels: { filter: (a, d) => d.datasets[a.datasetIndex].label != "" },
                                onClick: function (e, legendItem, legend) {
                                    const name = legendItem.text;
                                    const index = legendItem.datasetIndex;
                                    let ci = legend.chart;
                                    [
                                        ci.getDatasetMeta(index),
                                        ci.getDatasetMeta(index + 1),
                                    ].forEach(function (meta) {
                                        meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : !meta.hidden;
                                    });
                                    ci.update();
                                }
                            }
                        },
                        scales: {
                            // @ts-ignore
                            x: {
                                min: data.limitL,
                                max: data.limitR,
                                type: 'linear',
                                title: { display: true, text: UiLocale.chart.income[language] },
                                grid: { color: "rgba(255,255,255,0.15)" },
                                ticks: {
                                    color: "#FFFFFF",
                                    callback: (value, index, ticks) => Utils.formatPrice(value),
                                },
                                border: { color: "rgba(255,255,255,0.5)" },
                            },
                            y: {
                                min: -1,
                                max: 1,
                                title: { display: true, text: 'PDF | CDF' },
                                grid: {
                                    color: function (context) {
                                        if (context.tick.value == 0 || context.tick.value == -1)
                                            return "rgba(255,255,255,0.5)";
                                        return "rgba(255,255,255,0.15)";
                                    }
                                },
                                position: "left",
                                ticks: {
                                    callback: (value, index, ticks) => value >= 0 ? value : "",
                                }
                            },
                        }
                    },
                });
                return chart;
            }
    
            /**
             * @returns {{ wrapper: HTMLElement, canvas: HTMLCanvasElement }}
             */
            getCanvas() {
                const canvasWidth = Config.chart.defaultScale.width;
                const canvasHeight = Config.chart.defaultScale.height;
                const canvas = Ui.elem('canvas', { width: canvasWidth, height: canvasHeight });
                const canvasDiv = Ui.div({ style: `min-width: ${canvasWidth}px; min-height: ${canvasHeight}px;` }, canvas);
                return { wrapper: canvasDiv, canvas: canvas };
            }
        };
    
        //#endregion
    
    
        //#region InGame
    
        /**
         * 解压缩数据
         * @param {string} compressed - 偏移后的压缩数据
         * @returns {string} 解压后的原始数据
         */
        function decompressData(compressed) {
            if (!compressed || compressed === "") return "";
    
            try {
                // 使用标准库解压
                return LZString.decompressFromUTF16(compressed);
            } catch (error) {
                err("解压失败:", error);
                return null;
            }
        }
    
    
        const ClientData = new class {
            #data = null;
            #hrid2name = {};
            #name2hrid = {};
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.set(msg); }, -100);
            }
            get() {
                if (!this.#data) this.set(JSON.parse(decompressData(localStorage.getItem("initClientData"))));
                return this.#data;
            }
            set(val) {
                this.#data = val;
                this.#hrid2name = {};
                const itemDetail = val.itemDetailMap;
                for (const key in itemDetail) {
                    if (itemDetail[key] && typeof itemDetail[key] === 'object' && itemDetail[key].name) {
                        this.#hrid2name[key] = itemDetail[key].name;
                        this.#name2hrid[itemDetail[key].name] = key;
                    }
                }
            }
            /**
             * @param {string} hrid
             * @returns {string}
             */
            hrid2name(hrid) {
                if (!hrid) return hrid;
                return this.#hrid2name[hrid] || hrid.split('/').pop();
            }
            /**
             * @param {string} itemName
             * @returns {string}
             */
            name2ItemHrid(itemName) {
                if (!itemName) return itemName;
                return this.#name2hrid[itemName] || `/items/${itemName.toLowerCase().split(' ').reduce((pre, cur) => pre + '_' + cur, '')}`;
            }
        };
    
        const CharacterData = new class {
            #data = null;
    
            playerId = null;
            playerName = null;
    
            /** @type {Object<string, number>} */
            skillLevel = {};
    
            constructor() {
                MessageHandler.addListener('init_character_data', msg => { this.onInitCharacterData(msg); }, -100);
                MessageHandler.addListener('skills_updated', msg => { this.onLevelUpdated(msg); });
            }
            get() { return this.#data; }
    
            onInitCharacterData(msg) {
                this.#data = msg;
                this.playerId = msg.character.id;
                this.playerName = msg.character.name;
                this.updateLevel(msg.characterSkills);
            }
            onLevelUpdated(msg) { this.updateLevel(msg.endCharacterSkills); }
    
            updateLevel(skills) {
                skills.forEach(m => {
                    const name = m.skillHrid.split('/').pop();
                    this.skillLevel[name] = m.level;
                });
                const { stamina, intelligence, defense, attack, melee, ranged, magic } = this.skillLevel;
                this.skillLevel.combat = (stamina + intelligence + defense +attack + Math.max(melee, ranged, magic)) / 10 + Math.max(attack, defense, melee, ranged, magic);
            }
        };
    
        const Market = new class {
            /**
             * @typedef {'ask' | 'bid' | 'vendor'} PriceType
             */
            /**
             * @typedef {Object} MarketDataEntry
             * @property {number} ask
             * @property {number} bid
             */
            /**
             * @typedef {Object} MarketData
             * @property {number} time 市场更新时间 (s)
             * @property {{ [itemHrid: string]: { [enhanceLevel: number]: MarketDataEntry } }} market 市场信息
             * @property {{ [itemHrid: string]: number }} vendor
             */
            /**
             * @typedef {Object} MarketDataSource
             * @property {'mwi' | 'milkyapi' | 'custom'} type
             * @property {string} [addr = null]
             */
    
            storageDataName = 'marketData';
    
            apiMap = {
                mwi: {
                    desc: UiLocale.settings.market.apiOfficial[language],
                    order: 1,
                    addr: 'https://www.milkywayidle.com/game_data/marketplace.json'
                },
                milkyapi: {
                    desc: 'HolyChikenz - MWIApi',
                    order: 2,
                    addr: 'https://raw.githubusercontent.com/holychikenz/MWIApi/main/milkyapi.json',
                },
                custom: {
                    desc: UiLocale.settings.market.apiCustom[language],
                    order: 3,
                    addr: '',
                }
            };
    
            /** @type {MarketData} */ marketData = null;
    
            chestDropData = {};
    
            specialItemPrices = { '/items/coin': { ask: 1, bid: 1 } };
            chestCosts = {};
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.onInitClientData(msg); }, -90);
            }
    
            onInitClientData(_) {
                this.marketData = LocalStorageData.get(this.storageDataName);
                const updateInterval = Config.market.autoUpdateInterval * 3600;
                if (!(this.marketData?.time > Date.now() / 1000 - updateInterval)) this.update();
                else this.initMarketData();
            }
            update(afterUpdated = null) {
                const source = Config.market.source;
                if (source.type !== 'custom') source.addr = this.apiMap[source.type].addr;
                out(`fetching market data from ${source.addr}`);
                fetch(source.addr).then(res => {
                    res.json().then(data => {
                        this.marketData = this.formatMarketData(data);
                        LocalStorageData.set(this.storageDataName, this.marketData);
                        out(`market updated:`, new Date(this.marketData.time).toLocaleString());
                        this.initMarketData();
                        afterUpdated?.();
                    });
                });
            }
            formatMarketData(raw) {
                const format = raw.market?.hasOwnProperty('Coin') ? 'milkyapi' : 'mwi';
                if (format === 'milkyapi') {
                    const data = { market: {}, vendor: {}, time: raw.time };
                    for (const [itemName, price] of Object.entries(raw.market)) {
                        const itemHrid = ClientData.name2ItemHrid(itemName);
                        (data.market[itemHrid] ??= {})[0] = { ask: price.ask, bid: price.bid };
                    }
                    return data;
                }
                if (format === 'mwi') {
                    const data = { market: {}, vendor: {}, time: raw.timestamp };
                    for (const [itemHrid, prices] of Object.entries(raw.marketData)) {
                        for (const [level, price] of Object.entries(prices)) {
                            (data.market[itemHrid] ??= {})[level] = { ask: price.a, bid: price.b };
                        }
                    }
                    return data;
                }
                throw "unknown market data format";
            }
            initMarketData() {
                this.#initVendorPrice();
                this.#initSpecialItemPrices();
                this.#initShopData();
                this.#initChestData();
                out("市场信息 (marketData)", this.marketData);
            }
    
            #initVendorPrice() {
                const itemDetails = ClientData.get().itemDetailMap;
                for (const [hrid, detail] of Object.entries(itemDetails)) {
                    this.marketData.vendor[hrid] = detail.sellPrice ?? 0;
                }
            }
    
            #initSpecialItemPrices() {
                const computeNonTradable = Config.market.computeNonTradable;
                this.specialItemPrices = {
                    '/items/coin': { ask: 1, bid: 1 },
                    '/items/cowbell': {
                        ask: this.getPriceFromAPI('/items/bag_of_10_cowbells', 'ask') / 10,
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/bag_of_10_cowbells', 'bid') / 10 : 0,
                    },
                    '/items/chimerical_quiver': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                    '/items/sinister_cape': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                    '/items/enchanted_cloak': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                    '/items/gatherer_cape': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                    '/items/artificer_cape': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                    '/items/culinary_cape': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                    '/items/chance_cape': {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask'),
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') : 0,
                    },
                };
                for (let itemName in this.specialItemPrices) {
                    (this.marketData.market[itemName] ??= {})[0] = {
                        ask: this.specialItemPrices[itemName].ask,
                        bid: this.specialItemPrices[itemName].bid,
                    };
                }
    
                this.chestCosts = {
                    "/items/chimerical_chest": {
                        keyAsk: this.getPriceFromAPI('/items/chimerical_chest_key', 'ask') || 3000e3,
                        keyBid: this.getPriceFromAPI('/items/chimerical_chest_key', 'bid') || 3000e3,
                        entryAsk: this.getPriceFromAPI('/items/chimerical_entry_key', 'ask') || 280e3,
                        entryBid: this.getPriceFromAPI('/items/chimerical_entry_key', 'bid') || 280e3
                    },
                    "/items/sinister_chest": {
                        keyAsk: this.getPriceFromAPI('/items/sinister_chest_key', 'ask') || 5600e3,
                        keyBid: this.getPriceFromAPI('/items/sinister_chest_key', 'bid') || 5400e3,
                        entryAsk: this.getPriceFromAPI('/items/sinister_entry_key', 'ask') || 300e3,
                        entryBid: this.getPriceFromAPI('/items/sinister_entry_key', 'bid') || 280e3
                    },
                    "/items/enchanted_chest": {
                        keyAsk: this.getPriceFromAPI('/items/enchanted_chest_key', 'ask') || 7600e3,
                        keyBid: this.getPriceFromAPI('/items/enchanted_chest_key', 'bid') || 7200e3,
                        entryAsk: this.getPriceFromAPI('/items/enchanted_entry_key', 'ask') || 360e3,
                        entryBid: this.getPriceFromAPI('/items/enchanted_entry_key', 'bid') || 360e3
                    },
                    "/items/pirate_chest": {
                        keyAsk: this.getPriceFromAPI('/items/pirate_chest_key', 'ask') || 9400e3,
                        keyBid: this.getPriceFromAPI('/items/pirate_chest_key', 'bid') || 9200e3,
                        entryAsk: this.getPriceFromAPI('/items/pirate_entry_key', 'ask') || 460e3,
                        entryBid: this.getPriceFromAPI('/items/pirate_entry_key', 'bid') || 440e3
                    },
                    "/items/chimerical_refinement_chest": {
                        keyAsk: this.getPriceFromAPI('/items/chimerical_chest_key', 'ask') || 3000e3,
                        keyBid: this.getPriceFromAPI('/items/chimerical_chest_key', 'bid') || 3000e3,
                    },
                    "/items/sinister_refinement_chest": {
                        keyAsk: this.getPriceFromAPI('/items/sinister_chest_key', 'ask') || 5600e3,
                        keyBid: this.getPriceFromAPI('/items/sinister_chest_key', 'bid') || 5400e3,
                    },
                    "/items/enchanted_refinement_chest": {
                        keyAsk: this.getPriceFromAPI('/items/enchanted_chest_key', 'ask') || 7600e3,
                        keyBid: this.getPriceFromAPI('/items/enchanted_chest_key', 'bid') || 7200e3,
                    },
                    "/items/pirate_refinement_chest": {
                        keyAsk: this.getPriceFromAPI('/items/pirate_chest_key', 'ask') || 9400e3,
                        keyBid: this.getPriceFromAPI('/items/pirate_chest_key', 'bid') || 9200e3,
                    }
                };
            }
    
            #initShopData() {
                const clientData = ClientData.get();
                const costItemValue = {};
                for (let details of Object.values(clientData.shopItemDetailMap)) {
                    const { itemHrid, costs } = details;
                    for (let cost of costs) {
                        const costHrid = cost.itemHrid;
                        if (costHrid === "/items/coin") continue;
    
                        const costCount = cost.count;
                        costItemValue[costHrid] ??= 0;
    
                        // 计算每种代币购买每个物品的收益
                        let bidValue = this.getPriceByHrid(itemHrid, "bid");
                        let profit = bidValue / (costs.length * costCount);
    
                        // 更新最赚钱的物品信息
                        if (profit > costItemValue[costHrid]) {
                            costItemValue[costHrid] = profit;
                            this.setPrice(costHrid, { ask: profit, bid: profit });
                        }
                    }
                }
            }
    
            #initChestData() {
                const clientData = ClientData.get();
    
                // 迭代计算箱子价值
                this.chestDropData = {};
                const maxIter = 20;
                for (let iter = 0; iter < maxIter; ++iter) {
                    for (let [boxHrid, items] of Object.entries(clientData.openableLootDropMap)) {
                        this.chestDropData[boxHrid] ??= {
                            order: clientData.itemDetailMap[boxHrid].sortIndex,
                            items: [],
                            totalAsk: 0,
                            totalBid: 0,
                        };
                        let totalAsk = 0, totalBid = 0;
                        for (let item of items) {
                            const itemName = ClientData.hrid2name(item.itemHrid);
                            const bidPrice = this.getPriceByName(itemName, "bid") ?? 0;
                            const askPrice = this.getPriceByName(itemName, "ask") ?? 0;
                            const expectedCount = DropAnalyzer.itemCountExpt(item);
                            totalAsk += askPrice * expectedCount;
                            totalBid += bidPrice * expectedCount;
                        }
                        this.chestDropData[boxHrid].totalAsk = totalAsk;
                        this.chestDropData[boxHrid].totalBid = totalBid;
    
                        if (boxHrid === '/items/bag_of_10_cowbells') continue;
                        if (this.chestCosts[boxHrid]) {
                            const { keyAsk=0, keyBid=0, entryAsk=0, entryBid=0 } = this.chestCosts[boxHrid];
                            this.setPrice(boxHrid, {
                                ask: totalAsk - keyBid - entryBid,
                                bid: totalBid - keyAsk - entryAsk,
                            });
                        } else {
                            this.setPrice(boxHrid, { ask: totalAsk, bid: totalBid });
                        }
                    }
    
                    // 更新任务代币（/items/task_token）价值
                    let tokenValue = { ask: 0, bid: 0 };
                    for (let [key, item] of Object.entries(clientData.taskShopItemDetailMap)) {
                        let itemName = item.name;
                        if (item.cost.itemHrid !== "/items/task_token") continue;
                        tokenValue.ask = Math.max(tokenValue.ask, this.getPriceByName(itemName, "ask") / item.cost.count);
                        tokenValue.bid = Math.max(tokenValue.bid, this.getPriceByName(itemName, "bid") / item.cost.count);
                    }
                    this.setPrice("/items/task_token", tokenValue);
    
                    // 更新迷宫代币（/items/labyrinth_token）价值
                    let labyrinthTokenValue = { ask: 0, bid: 0 };
                    for (let [key, item] of Object.entries(clientData.labyrinthShopItemDetailMap)) {
                        let itemName = item.name;
                        if (item.cost.itemHrid !== "/items/labyrinth_token") continue;
                        tokenValue.ask = Math.max(tokenValue.ask, this.getPriceByName(itemName, "ask") / item.cost.count);
                        tokenValue.bid = Math.max(tokenValue.bid, this.getPriceByName(itemName, "bid") / item.cost.count);
                    }
                    this.setPrice("/items/labyrinth_token", tokenValue);
                }
    
    
                // 计算箱子掉落物表
                for (let [boxHrid, items] of Object.entries(clientData.openableLootDropMap)) {
                    for (let item of items) {
                        const { itemHrid, dropRate, minCount, maxCount } = item;
                        this.chestDropData[boxHrid].items.push({
                            hrid: itemHrid,
                            dropRate: dropRate,
                            minCount: minCount,
                            maxCount: maxCount,
                        });
                    }
                }
    
                out("特殊物品价格表 (Market.specialItemPrices)", this.specialItemPrices);
                out("箱子掉落物列表 (Market.chestDropData)", this.chestDropData);
            }
    
            setPrice(itemHrid, price, enhanceLevel = 0) {
                this.marketData.market[itemHrid] ??= {};
                this.marketData.market[itemHrid][enhanceLevel] ??= { ask: -1, bid: -1 };
                if (price.ask) this.marketData.market[itemHrid][enhanceLevel].ask = price.ask;
                if (price.bid) this.marketData.market[itemHrid][enhanceLevel].bid = price.bid;
                this.specialItemPrices[itemHrid] = price;
            }
    
            /**
             * @param {string} itemHrid
             * @param {PriceType} priceType
             * @param {number} enhanceLevel
             * @param {boolean} computeNetProfit
             * @returns {number}
             */
            getPriceFromAPI(itemHrid, priceType = 'bid', enhanceLevel = 0, computeNetProfit = null) {
                if (priceType === 'vendor') return this.marketData.vendor[itemHrid] ?? 0;
                const itemPrice = this.marketData.market[itemHrid]?.[enhanceLevel]?.[priceType];
                const netProfit = computeNetProfit ?? Config.market.computeNetProfit;
                if (typeof itemPrice === 'number' && itemPrice !== -1) {
                    if (netProfit && priceType === 'bid') {
                        if (itemHrid === '/items/bag_of_10_cowbells') return Math.floor(itemPrice * 0.82);
                        return Math.floor(itemPrice * 0.98);
                    }
                    return itemPrice;
                }
                return null;
            }
    
            /**
             * @param {string} itemHrid
             * @param {PriceType} priceType
             * @param {number} enhanceLevel
             * @param {boolean} computeNetProfit
             * @returns {number}
             */
            getPriceByHrid(itemHrid, priceType = 'bid', enhanceLevel = 0, computeNetProfit = null) {
                if (!this.marketData?.market) return null;
                const netProfit = computeNetProfit ?? Config.market.computeNetProfit;
                if (this.specialItemPrices[itemHrid]) return this.specialItemPrices[itemHrid][priceType];
                const marketPrice = this.getPriceFromAPI(itemHrid, priceType, enhanceLevel, netProfit);
                if (marketPrice) return marketPrice;
                if (priceType === 'ask') {
                    return Math.ceil(this.getPriceByHrid(itemHrid, 'bid', enhanceLevel, false) / 0.98);
                }
                if (priceType === 'bid' && this.marketData.market[itemHrid]) {
                    const itemPrice = this.marketData.vendor[itemHrid];
                    if (typeof itemPrice === 'number' && itemPrice > 0) {
                        return itemPrice * 3;
                    }
                }
                return null;
            }
    
            /**
             * @param {string} itemName
             * @param {PriceType} priceType
             * @param {number} enhanceLevel
             * @returns {number}
             */
            getPriceByName(itemName, priceType = 'bid', enhanceLevel = 0) {
                const itemHrid = ClientData.name2ItemHrid(itemName);
                return this.getPriceByHrid(itemHrid, priceType, enhanceLevel);
            }
    
            /**
             * @param {CountedItem | CountedItem[]} items
             * @param {PriceType} priceType
             * @returns {number}
             */
            getTotalPrice(items, priceType = 'bid') {
                return (Array.isArray(items) ? items : [items])
                    .reduce((pre, cur) => pre + cur.count * this.getPriceByHrid(cur.hrid, priceType), 0);
            }
        };
    
        const BattleData = new class {
            /**
             * @typedef {Object} MapDataInfo
             * @property {'solo' | 'group' | 'dungeon'} type
             * @property {0 | 1 | 2} eliteTier
             * @property {string} mapHrid
             * @property {number} mapIndex 地图序号（1~11）
             * @property {string} name 地图名字（英文）
             * @property {number} order 地图顺序
             */
            /**
             * @typedef {Object} MapData_ItemDropData
             * @property {boolean} isRare
             * @property {string} itemHrid
             * @property {number} dropRate
             * @property {number} minCount
             * @property {number} maxCount
             * @property {number} dropRatePerDifficultyTier
             */
            /**
             * @typedef {Object} MapData
             * @property {MapDataInfo} info
             * @property {SpawnInfo} spawnInfo
             * @property {Object<string, MapData_ItemDropData[]>} monsterDrops
             * @property {Object<string, MapData_ItemDropData[]>} bossDrops
             */
    
            /** @type {{ [mapHrid: string]: MapData }} */
            mapData = {};
    
            /** @type {{ [monsterHrid: string]: { type: 'boss' | 'monster', actionHrid: string, mapHrid: string } }} */
            monsterInfo = {};
    
            /** @type {Object<string, number>} */
            itemFreq = {};
    
            /** @type {string} */ currentMapHrid = null;
            /** @type {number} */ difficultyTier = 0;
            /** @type {boolean} */ inBattle = false;
            /** @type {boolean} */ inDungeon = false;
            /** 战斗开始时间 (s) @type {number} */ startTime = 0;
            /** 战斗持续时间 (s) @type {number} */ duration = 0;
            /** @type {number} */ runCount = 0;
    
            /** @type {string[]} */
            playerList = [];
    
            /**
             * @typedef {Object} PlayerStatus
             * @property {string} aura
             * @property {{ [skillHrid: string]: number }} skillExp
             * @property {number} combatDropQuantity
             * @property {number} combatDropRate
             * @property {number} combatRareFind
             * @property {number} deathCount
             */
            /** @type {{ [playerName: string]: PlayerStatus }} */
            playerStat = {};
    
            /**
             * @typedef {Object} PlayerLootInfo
             * @property {CountedItem[]} items
             * @property {() => number} price
             */
            /** @type {{ [playerName: string]: PlayerLootInfo }} */
            playerLoot = {};
    
            /**
             * @typedef {Object} PlayerFoodInfo
             * @property {{ [itemName: string]: CountedItem }} food
             * @property {number} drinkConcentration
             */
            /** @type {{ [playerName: string]: PlayerFoodInfo }} */
            playerFood = {};
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.onInitClientData(msg); }, -90);
                MessageHandler.addListener('init_character_data', msg => { this.onInitCharacterData(msg); });
                MessageHandler.addListener('new_battle', msg => { this.onNewBattle(msg); }, -100);
                MessageHandler.addListener('action_completed', msg => { this.onActionCompleted(msg); });
            }
    
            onNewBattle(msg) {
                this.startTime = new Date(msg.combatStartTime).getTime() / 1000;
                this.duration = new Date().getTime() / 1000 - this.startTime;
                this.runCount = msg.battleId || 1;
                this.playerList = msg.players.map(p => p.character.name);
                for (let player of msg.players) {
                    const playerName = player.character.name;
    
                    // 初始化玩家数据
                    this.playerStat[playerName] = {
                        aura: null,
                        skillExp: {},
                        combatDropQuantity: player.combatDetails.combatStats.combatDropQuantity,
                        combatDropRate: player.combatDetails.combatStats.combatDropRate,
                        combatRareFind: player.combatDetails.combatStats.combatRareFind,
                        deathCount: 0,
                    };
    
                    // 处理战利品
                    let playerLoot = { items: [], price: null };
                    Object.values(player.totalLootMap).forEach(loot => {
                        playerLoot.items.push({
                            hrid: loot.itemHrid,
                            count: loot.count,
                        });
                    });
                    playerLoot.price = () => playerLoot.items.reduce((pre, item) => {
                        const bidPrice = Market.getPriceByHrid(item.hrid);
                        return pre + item.count * bidPrice;
                    }, 0);
                    this.playerLoot[playerName] = playerLoot;
    
                    // 处理消耗品
                    let playerFood = {
                        drinkConcentration: player.combatDetails.combatStats.drinkConcentration,
                        food: {},
                    };
                    player.combatConsumables?.forEach(consumable => {
                        const itemName = ClientData.hrid2name(consumable.itemHrid);
                        playerFood.food[itemName] = {
                            hrid: consumable.itemHrid,
                            count: consumable.count,
                        };
                    });
                    this.playerFood[playerName] = playerFood;
    
                    // 处理光环&经验
                    const auraAbilities = [
                        'revive',
                        'insanity',
                        'invincible',
                        'fierce_aura',
                        'aqua_aura',
                        'sylvan_aura',
                        'flame_aura',
                        'speed_aura',
                        'critical_aura'
                    ];
                    player.combatAbilities.forEach(ability => {
                        const isAura = auraAbilities.some(aura => ability.abilityHrid.endsWith(aura));
                        if (isAura) this.playerStat[playerName].aura = ability.abilityHrid;
                    });
                    Object.keys(player.totalSkillExperienceMap).forEach(hrid => {
                        this.playerStat[playerName].skillExp[hrid] = player.totalSkillExperienceMap[hrid];
                    });
    
                    //处理死亡次数
                    this.playerStat[playerName].deathCount = player.deathCount || 0;
                }
            }
    
            onInitCharacterData(msg) { this.setCurrentMapHrid(msg.characterActions[0]); }
            onActionCompleted(msg) { this.setCurrentMapHrid(msg.endCharacterAction); }
            setCurrentMapHrid(charaAction) {
                const actionHrid = charaAction?.actionHrid;
                if (actionHrid?.startsWith("/actions/combat/")) {
                    this.currentMapHrid = actionHrid;
                    this.difficultyTier = charaAction?.difficultyTier || 0;
                    this.inBattle = true;
                    this.inDungeon = !this.mapData.hasOwnProperty(actionHrid);
                } else this.inBattle = false;
            }
    
            onInitClientData(msg) {
                this.initCombatMapData(msg);
                this.initMonsterInfo(msg);
                this.initItemFreq();
            }
            initCombatMapData(clientData) {
                // 处理战斗地图数据
                const monsterMap = clientData.combatMonsterDetailMap;
                const actionDetailMap = clientData.actionDetailMap;
                for (const [actionHrid, actionDetail] of Object.entries(actionDetailMap)) {
                    if (!actionHrid.startsWith("/actions/combat/")) continue;
                    if (!actionDetail.combatZoneInfo) continue;
                    if (actionDetail.combatZoneInfo.isDungeon) {
                        const dungeonInfo = actionDetail.combatZoneInfo.dungeonInfo;
                        this.mapData[actionHrid] = {
                            info: {
                                type: 'dungeon',
                                eliteTier: 2,
                                mapHrid: actionHrid,
                                mapIndex: 0,
                                name: actionDetail.name,
                                order: actionDetail.sortIndex,
                            },
                            spawnInfo: {
                                bossWave: 1,
                                maxSpawnCount: 0,
                                maxTotalStrength: 0,
                                spawns: [],
                                expectedSpawns: {},
                            },
                            monsterDrops: {},
                            bossDrops: {
                                '_dungeon': dungeonInfo.rewardDropTable.map(item => ({
                                    isRare: false, ...item
                                })),
                            },
                        }
                        continue;
                    }
                    const fightInfo = actionDetail.combatZoneInfo.fightInfo;
                    const spawnInfo = fightInfo?.randomSpawnInfo;
                    let spawns = spawnInfo?.spawns;
                    if (!spawns || spawns.length === 0) continue;
    
                    const totalRate = spawns.reduce((s, x) => s + x.rate, 0);
                    spawns = spawns.map(s => ({
                        hrid: s.combatMonsterHrid,
                        strength: s.strength,
                        rate: s.rate / totalRate,
                    }));
                    const mapType = spawnInfo.spawns.length > 1 || spawnInfo.bossWave > 0 ? "group" : "solo";
                    const mapHrid = actionDetail.category.replace("/action_categories/", "/actions/");
                    const mapIndex = ClientData.get().actionCategoryDetailMap?.[actionDetail.category]?.sortIndex;
    
                    // 合并普通掉落和稀有掉落
                    const getDrops = (hrid, s) => [
                        hrid, [].concat(
                            monsterMap[hrid].dropTable
                                .map(item => ({ isRare: false, ...item }))
                        ).concat(
                            monsterMap[hrid].rareDropTable
                                .map(item => ({ isRare: true, ...item }))
                        )
                    ];
                    const monsterDrops = Object.fromEntries(spawns.map(s => getDrops(s.hrid, s)));
                    const bossDrops = Object.fromEntries(
                        (fightInfo.bossSpawns ?? []).map(s => getDrops(s.combatMonsterHrid, s)));
    
                    const spawnInfoMod = {
                        maxSpawnCount: spawnInfo.maxSpawnCount,
                        maxTotalStrength: spawnInfo.maxTotalStrength,
                        bossWave: fightInfo.battlesPerBoss || 0,
                        spawns: spawns,
                        expectedSpawns: null,
                    };
                    spawnInfoMod.expectedSpawns = BattleDropAnalyzer.computeExpectedSpawns(spawnInfoMod);
                    this.mapData[actionHrid] = {
                        info: {
                            type: mapType,
                            eliteTier: actionHrid.includes('elite') ? 1 : 0,
                            mapHrid: mapHrid,
                            mapIndex: mapIndex,
                            name: actionDetail.name,
                            order: actionDetail.sortIndex,
                        },
                        spawnInfo: spawnInfoMod,
                        monsterDrops: monsterDrops,
                        bossDrops: bossDrops,
                    }
                }
    
                out("地图信息 (BattleData.mapData)", this.mapData);
            }
            initItemFreq() {
                let itemTotalCount = {}, itemNum = {};
                for (let mapHrid in this.mapData) {
                    if (this.mapData[mapHrid].info.type == 'solo') continue;
                    const itemCount = {};
                    const dropData = this.getDropData(mapHrid);
                    for (const [_, drops] of Object.entries(dropData.bossDrops)) {
                        for (const item of drops) {
                            itemCount[item.hrid] ??= 0;
                            let itemCountTier = 0;
                            for (let tier = 0; tier < item.dropRate.length; tier++) {
                                itemCountTier += DropAnalyzer.itemCountExpt(item, tier);
                            }
                            itemCountTier /= item.dropRate.length;
                            itemCount[item.hrid] += itemCountTier;
                        }
                    }
                    const expectedSpawns = dropData.spawnInfo.expectedSpawns;
                    for (const [hrid, drops] of Object.entries(dropData.monsterDrops)) {
                        const cnt = expectedSpawns[hrid] * 9;
                        for (const item of drops) {
                            itemCount[item.hrid] ??= 0;
                            let itemCountTier = 0;
                            for (let tier = 0; tier < item.dropRate.length; tier++) {
                                itemCountTier += DropAnalyzer.itemCountExpt(item, tier);
                            }
                            itemCountTier /= item.dropRate.length;
                            itemCount[item.hrid] += cnt * itemCountTier;
                        }
                    }
                    for (let hrid in itemCount) {
                        itemTotalCount[hrid] = (itemTotalCount[hrid] ?? 0) + itemCount[hrid];
                        itemNum[hrid] = (itemNum[hrid] ?? 0) + 1;
                    }
                }
    
                this.itemFreq = {};
                for (let hrid in itemTotalCount) {
                    let count = itemTotalCount[hrid] / itemNum[hrid];
                    this.itemFreq[hrid] = count;
                }
            }
            initMonsterInfo(_) {
                for (let [mapHrid, detail] of Object.entries(this.mapData)) {
                    if (detail.info.eliteTier !== 0) continue;
                    if (detail.info.type !== 'group') {
                        for (let monsterHrid in detail.monsterDrops) {
                            this.monsterInfo[monsterHrid] ??= { type: 'monster', actionHrid: null, mapHrid: null };
                            this.monsterInfo[monsterHrid].actionHrid = mapHrid;
                        }
                    } else {
                        for (let monsterHrid in detail.monsterDrops) {
                            this.monsterInfo[monsterHrid] ??= { type: 'monster', actionHrid: null, mapHrid: null };
                            this.monsterInfo[monsterHrid].mapHrid = mapHrid;
                        }
                        for (let monsterHrid in detail.bossDrops) {
                            this.monsterInfo[monsterHrid] = { type: 'boss', actionHrid: mapHrid, mapHrid: mapHrid };
                        }
                    }
                }
                out('怪物信息 (BattleData.monsterInfo)', this.monsterInfo);
            }
    
            /**
             * @param {string} mapHrid
             * @param {number} runCount
             * @param {string} playerName
             * @returns {MapDropData}
             */
            getDropData(mapHrid, runCount = 11, playerName = null) {
                const mapData = this.mapData[mapHrid];
                const bossWave = mapData.spawnInfo.bossWave;
                const bossCount = bossWave ? Math.floor((runCount - 1) / bossWave) : 0;
                const normalCount = bossWave ? bossCount * (bossWave - 1) + (runCount - 1) % bossWave : runCount - 1;
                const /** @type {MapDropData} */ dropData = {
                    spawnInfo: mapData.spawnInfo,
                    bossCount: bossCount,
                    normalCount: normalCount,
                    bossDrops: {},
                    monsterDrops: {},
                };
    
                const processDrop = (/** @type {MapData_ItemDropData} */ item) => {
                    const itemName = ClientData.hrid2name(item.itemHrid);
                    const price = Market.getPriceByName(itemName);
    
                    let { minCount, maxCount, dropRate } = item;
                    const dropRatePerTier = item.dropRatePerDifficultyTier || 0;
    
                    if (playerName) {
                        const playerStat = this.playerStat[playerName];
                        const commonRateMultiplier = 1 + (playerStat.combatDropRate || 0);
                        const rareRateMultiplier = 1 + (playerStat.combatRareFind || 0);
                        const quantityMultiplier = (1 + (playerStat.combatDropQuantity || 0)) / this.playerList.length * (mapData.info.type === 'dungeon' ? 5 : 1);
                        const rateMultiplier = item.isRare ? rareRateMultiplier : commonRateMultiplier;
                        minCount *= quantityMultiplier;
                        maxCount *= quantityMultiplier;
                        const len = mapData.info.type === 'dungeon'? 3 : (mapData.info.type === 'group'? 6 : 1);
                        dropRate = Array.from({length: len}, (_, n) => {
                            let rate = dropRate + n * dropRatePerTier;
                            rate = rate * (1 + n * 0.1) * rateMultiplier;
                            return Math.min(Math.max(rate, 0), 1);
                        });
                    }
    
                    return {
                        hrid: item.itemHrid,
                        name: itemName,
                        price: price,
                        minCount: minCount,
                        maxCount: maxCount,
                        dropRate: dropRate,
                    };
                };
    
                for (let [hrid, drops] of Object.entries(mapData.bossDrops)){
                    dropData.bossDrops[hrid] = drops.map(drop => processDrop(drop));}
                for (let [hrid, drops] of Object.entries(mapData.monsterDrops)){
                    dropData.monsterDrops[hrid] = drops.map(drop => processDrop(drop));}
                return dropData;
            }
    
            /**
             * @param {string} mapHrid
             * @param {number} runCount
             * @param {string} playerName
             * @returns {MapDropData}
             */
            getDropDataDifficulty(mapHrid, runCount = 11, playerName = null) {
                let dropData = this.getDropData(mapHrid, runCount, playerName);
                for (let [hrid, drops] of Object.entries(dropData.bossDrops)) {
                    dropData.bossDrops[hrid] = drops.map(drop => {
                        const newDropRate = drop.dropRate?.[this.difficultyTier];
                        return {
                            ...drop,
                            dropRate: newDropRate
                        };
                    });
                }
    
                for (let [hrid, drops] of Object.entries(dropData.monsterDrops)) {
                    dropData.monsterDrops[hrid] = drops.map(drop => {
                        const newDropRate = drop.dropRate?.[this.difficultyTier];
                        return {
                            ...drop,
                            dropRate: newDropRate
                        };
                    });
                }
                return dropData
            }
    
            /**
             * @param {string} playerName
             * @returns {MapDropData}
             */
            getCurrentDropData(playerName = null) {
                if (!this.currentMapHrid) return null;
                return this.getDropDataDifficulty(this.currentMapHrid, this.runCount, playerName);
            }
        };
    
        const Localizer = new class {
            // items, actions, monsters, abilities, skills
            ZhNameDict = {
                "/items/coin": "\u91d1\u5e01",
                "/items/task_token": "\u4efb\u52a1\u4ee3\u5e01",
                "/items/labyrinth_token": "\u8ff7\u5bab\u4ee3\u5e01",
                "/items/chimerical_token": "\u5947\u5e7b\u4ee3\u5e01",
                "/items/sinister_token": "\u9634\u68ee\u4ee3\u5e01",
                "/items/enchanted_token": "\u79d8\u6cd5\u4ee3\u5e01",
                "/items/pirate_token": "\u6d77\u76d7\u4ee3\u5e01",
                "/items/cowbell": "\u725b\u94c3",
                "/items/bag_of_10_cowbells": "\u725b\u94c3\u888b (10\u4e2a)",
                "/items/purples_gift": "\u5c0f\u7d2b\u725b\u7684\u793c\u7269",
                "/items/small_meteorite_cache": "\u5c0f\u9668\u77f3\u8231",
                "/items/medium_meteorite_cache": "\u4e2d\u9668\u77f3\u8231",
                "/items/large_meteorite_cache": "\u5927\u9668\u77f3\u8231",
                "/items/small_artisans_crate": "\u5c0f\u5de5\u5320\u5323",
                "/items/medium_artisans_crate": "\u4e2d\u5de5\u5320\u5323",
                "/items/large_artisans_crate": "\u5927\u5de5\u5320\u5323",
                "/items/small_treasure_chest": "\u5c0f\u5b9d\u7bb1",
                "/items/medium_treasure_chest": "\u4e2d\u5b9d\u7bb1",
                "/items/large_treasure_chest": "\u5927\u5b9d\u7bb1",
                "/items/chimerical_chest": "\u5947\u5e7b\u5b9d\u7bb1",
                "/items/chimerical_refinement_chest": "\u5947\u5e7b\u7cbe\u70bc\u5b9d\u7bb1",
                "/items/sinister_chest": "\u9634\u68ee\u5b9d\u7bb1",
                "/items/sinister_refinement_chest": "\u9634\u68ee\u7cbe\u70bc\u5b9d\u7bb1",
                "/items/enchanted_chest": "\u79d8\u6cd5\u5b9d\u7bb1",
                "/items/enchanted_refinement_chest": "\u79d8\u6cd5\u7cbe\u70bc\u5b9d\u7bb1",
                "/items/pirate_chest": "\u6d77\u76d7\u5b9d\u7bb1",
                "/items/pirate_refinement_chest": "\u6d77\u76d7\u7cbe\u70bc\u5b9d\u7bb1",
                "/items/purdoras_box_skilling": "\u7d2b\u591a\u62c9\u4e4b\u76d2\uff08\u751f\u6d3b\uff09",
                "/items/purdoras_box_combat": "\u7d2b\u591a\u62c9\u4e4b\u76d2\uff08\u6218\u6597\uff09",
                "/items/labyrinth_refinement_chest": "\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1",
                "/items/seal_of_gathering": "\u91c7\u96c6\u5377\u8f74",
                "/items/seal_of_gourmet": "\u7f8e\u98df\u5377\u8f74",
                "/items/seal_of_processing": "\u52a0\u5de5\u5377\u8f74",
                "/items/seal_of_efficiency": "\u6548\u7387\u5377\u8f74",
                "/items/seal_of_action_speed": "\u884c\u52a8\u901f\u5ea6\u5377\u8f74",
                "/items/seal_of_combat_drop": "\u6218\u6597\u6389\u843d\u5377\u8f74",
                "/items/seal_of_attack_speed": "\u653b\u51fb\u901f\u5ea6\u5377\u8f74",
                "/items/seal_of_cast_speed": "\u65bd\u6cd5\u901f\u5ea6\u5377\u8f74",
                "/items/seal_of_damage": "\u4f24\u5bb3\u5377\u8f74",
                "/items/seal_of_critical_rate": "\u66b4\u51fb\u7387\u5377\u8f74",
                "/items/seal_of_wisdom": "\u7ecf\u9a8c\u5377\u8f74",
                "/items/seal_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u5377\u8f74",
                "/items/blue_key_fragment": "\u84dd\u8272\u94a5\u5319\u788e\u7247",
                "/items/green_key_fragment": "\u7eff\u8272\u94a5\u5319\u788e\u7247",
                "/items/purple_key_fragment": "\u7d2b\u8272\u94a5\u5319\u788e\u7247",
                "/items/white_key_fragment": "\u767d\u8272\u94a5\u5319\u788e\u7247",
                "/items/orange_key_fragment": "\u6a59\u8272\u94a5\u5319\u788e\u7247",
                "/items/brown_key_fragment": "\u68d5\u8272\u94a5\u5319\u788e\u7247",
                "/items/stone_key_fragment": "\u77f3\u5934\u94a5\u5319\u788e\u7247",
                "/items/dark_key_fragment": "\u9ed1\u6697\u94a5\u5319\u788e\u7247",
                "/items/burning_key_fragment": "\u71c3\u70e7\u94a5\u5319\u788e\u7247",
                "/items/chimerical_entry_key": "\u5947\u5e7b\u94a5\u5319",
                "/items/chimerical_chest_key": "\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319",
                "/items/sinister_entry_key": "\u9634\u68ee\u94a5\u5319",
                "/items/sinister_chest_key": "\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319",
                "/items/enchanted_entry_key": "\u79d8\u6cd5\u94a5\u5319",
                "/items/enchanted_chest_key": "\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319",
                "/items/pirate_entry_key": "\u6d77\u76d7\u94a5\u5319",
                "/items/pirate_chest_key": "\u6d77\u76d7\u5b9d\u7bb1\u94a5\u5319",
                "/items/donut": "\u751c\u751c\u5708",
                "/items/blueberry_donut": "\u84dd\u8393\u751c\u751c\u5708",
                "/items/blackberry_donut": "\u9ed1\u8393\u751c\u751c\u5708",
                "/items/strawberry_donut": "\u8349\u8393\u751c\u751c\u5708",
                "/items/mooberry_donut": "\u54de\u8393\u751c\u751c\u5708",
                "/items/marsberry_donut": "\u706b\u661f\u8393\u751c\u751c\u5708",
                "/items/spaceberry_donut": "\u592a\u7a7a\u8393\u751c\u751c\u5708",
                "/items/cupcake": "\u7eb8\u676f\u86cb\u7cd5",
                "/items/blueberry_cake": "\u84dd\u8393\u86cb\u7cd5",
                "/items/blackberry_cake": "\u9ed1\u8393\u86cb\u7cd5",
                "/items/strawberry_cake": "\u8349\u8393\u86cb\u7cd5",
                "/items/mooberry_cake": "\u54de\u8393\u86cb\u7cd5",
                "/items/marsberry_cake": "\u706b\u661f\u8393\u86cb\u7cd5",
                "/items/spaceberry_cake": "\u592a\u7a7a\u8393\u86cb\u7cd5",
                "/items/gummy": "\u8f6f\u7cd6",
                "/items/apple_gummy": "\u82f9\u679c\u8f6f\u7cd6",
                "/items/orange_gummy": "\u6a59\u5b50\u8f6f\u7cd6",
                "/items/plum_gummy": "\u674e\u5b50\u8f6f\u7cd6",
                "/items/peach_gummy": "\u6843\u5b50\u8f6f\u7cd6",
                "/items/dragon_fruit_gummy": "\u706b\u9f99\u679c\u8f6f\u7cd6",
                "/items/star_fruit_gummy": "\u6768\u6843\u8f6f\u7cd6",
                "/items/yogurt": "\u9178\u5976",
                "/items/apple_yogurt": "\u82f9\u679c\u9178\u5976",
                "/items/orange_yogurt": "\u6a59\u5b50\u9178\u5976",
                "/items/plum_yogurt": "\u674e\u5b50\u9178\u5976",
                "/items/peach_yogurt": "\u6843\u5b50\u9178\u5976",
                "/items/dragon_fruit_yogurt": "\u706b\u9f99\u679c\u9178\u5976",
                "/items/star_fruit_yogurt": "\u6768\u6843\u9178\u5976",
                "/items/milking_tea": "\u6324\u5976\u8336",
                "/items/foraging_tea": "\u91c7\u6458\u8336",
                "/items/woodcutting_tea": "\u4f10\u6728\u8336",
                "/items/cooking_tea": "\u70f9\u996a\u8336",
                "/items/brewing_tea": "\u51b2\u6ce1\u8336",
                "/items/alchemy_tea": "\u70bc\u91d1\u8336",
                "/items/enhancing_tea": "\u5f3a\u5316\u8336",
                "/items/cheesesmithing_tea": "\u5976\u916a\u953b\u9020\u8336",
                "/items/crafting_tea": "\u5236\u4f5c\u8336",
                "/items/tailoring_tea": "\u7f1d\u7eab\u8336",
                "/items/super_milking_tea": "\u8d85\u7ea7\u6324\u5976\u8336",
                "/items/super_foraging_tea": "\u8d85\u7ea7\u91c7\u6458\u8336",
                "/items/super_woodcutting_tea": "\u8d85\u7ea7\u4f10\u6728\u8336",
                "/items/super_cooking_tea": "\u8d85\u7ea7\u70f9\u996a\u8336",
                "/items/super_brewing_tea": "\u8d85\u7ea7\u51b2\u6ce1\u8336",
                "/items/super_alchemy_tea": "\u8d85\u7ea7\u70bc\u91d1\u8336",
                "/items/super_enhancing_tea": "\u8d85\u7ea7\u5f3a\u5316\u8336",
                "/items/super_cheesesmithing_tea": "\u8d85\u7ea7\u5976\u916a\u953b\u9020\u8336",
                "/items/super_crafting_tea": "\u8d85\u7ea7\u5236\u4f5c\u8336",
                "/items/super_tailoring_tea": "\u8d85\u7ea7\u7f1d\u7eab\u8336",
                "/items/ultra_milking_tea": "\u7a76\u6781\u6324\u5976\u8336",
                "/items/ultra_foraging_tea": "\u7a76\u6781\u91c7\u6458\u8336",
                "/items/ultra_woodcutting_tea": "\u7a76\u6781\u4f10\u6728\u8336",
                "/items/ultra_cooking_tea": "\u7a76\u6781\u70f9\u996a\u8336",
                "/items/ultra_brewing_tea": "\u7a76\u6781\u51b2\u6ce1\u8336",
                "/items/ultra_alchemy_tea": "\u7a76\u6781\u70bc\u91d1\u8336",
                "/items/ultra_enhancing_tea": "\u7a76\u6781\u5f3a\u5316\u8336",
                "/items/ultra_cheesesmithing_tea": "\u7a76\u6781\u5976\u916a\u953b\u9020\u8336",
                "/items/ultra_crafting_tea": "\u7a76\u6781\u5236\u4f5c\u8336",
                "/items/ultra_tailoring_tea": "\u7a76\u6781\u7f1d\u7eab\u8336",
                "/items/gathering_tea": "\u91c7\u96c6\u8336",
                "/items/gourmet_tea": "\u7f8e\u98df\u8336",
                "/items/wisdom_tea": "\u7ecf\u9a8c\u8336",
                "/items/processing_tea": "\u52a0\u5de5\u8336",
                "/items/efficiency_tea": "\u6548\u7387\u8336",
                "/items/artisan_tea": "\u5de5\u5320\u8336",
                "/items/catalytic_tea": "\u50ac\u5316\u8336",
                "/items/blessed_tea": "\u798f\u6c14\u8336",
                "/items/stamina_coffee": "\u8010\u529b\u5496\u5561",
                "/items/intelligence_coffee": "\u667a\u529b\u5496\u5561",
                "/items/defense_coffee": "\u9632\u5fa1\u5496\u5561",
                "/items/attack_coffee": "\u653b\u51fb\u5496\u5561",
                "/items/melee_coffee": "\u8fd1\u6218\u5496\u5561",
                "/items/ranged_coffee": "\u8fdc\u7a0b\u5496\u5561",
                "/items/magic_coffee": "\u9b54\u6cd5\u5496\u5561",
                "/items/super_stamina_coffee": "\u8d85\u7ea7\u8010\u529b\u5496\u5561",
                "/items/super_intelligence_coffee": "\u8d85\u7ea7\u667a\u529b\u5496\u5561",
                "/items/super_defense_coffee": "\u8d85\u7ea7\u9632\u5fa1\u5496\u5561",
                "/items/super_attack_coffee": "\u8d85\u7ea7\u653b\u51fb\u5496\u5561",
                "/items/super_melee_coffee": "\u8d85\u7ea7\u8fd1\u6218\u5496\u5561",
                "/items/super_ranged_coffee": "\u8d85\u7ea7\u8fdc\u7a0b\u5496\u5561",
                "/items/super_magic_coffee": "\u8d85\u7ea7\u9b54\u6cd5\u5496\u5561",
                "/items/ultra_stamina_coffee": "\u7a76\u6781\u8010\u529b\u5496\u5561",
                "/items/ultra_intelligence_coffee": "\u7a76\u6781\u667a\u529b\u5496\u5561",
                "/items/ultra_defense_coffee": "\u7a76\u6781\u9632\u5fa1\u5496\u5561",
                "/items/ultra_attack_coffee": "\u7a76\u6781\u653b\u51fb\u5496\u5561",
                "/items/ultra_melee_coffee": "\u7a76\u6781\u8fd1\u6218\u5496\u5561",
                "/items/ultra_ranged_coffee": "\u7a76\u6781\u8fdc\u7a0b\u5496\u5561",
                "/items/ultra_magic_coffee": "\u7a76\u6781\u9b54\u6cd5\u5496\u5561",
                "/items/wisdom_coffee": "\u7ecf\u9a8c\u5496\u5561",
                "/items/lucky_coffee": "\u5e78\u8fd0\u5496\u5561",
                "/items/swiftness_coffee": "\u8fc5\u6377\u5496\u5561",
                "/items/channeling_coffee": "\u541f\u5531\u5496\u5561",
                "/items/critical_coffee": "\u66b4\u51fb\u5496\u5561",
                "/items/poke": "\u7834\u80c6\u4e4b\u523a",
                "/items/impale": "\u900f\u9aa8\u4e4b\u523a",
                "/items/puncture": "\u7834\u7532\u4e4b\u523a",
                "/items/penetrating_strike": "\u8d2f\u5fc3\u4e4b\u523a",
                "/items/scratch": "\u722a\u5f71\u65a9",
                "/items/cleave": "\u5206\u88c2\u65a9",
                "/items/maim": "\u8840\u5203\u65a9",
                "/items/crippling_slash": "\u81f4\u6b8b\u65a9",
                "/items/smack": "\u91cd\u78be",
                "/items/sweep": "\u91cd\u626b",
                "/items/stunning_blow": "\u91cd\u9524",
                "/items/fracturing_impact": "\u788e\u88c2\u51b2\u51fb",
                "/items/shield_bash": "\u76fe\u51fb",
                "/items/quick_shot": "\u5feb\u901f\u5c04\u51fb",
                "/items/aqua_arrow": "\u6d41\u6c34\u7bad",
                "/items/flame_arrow": "\u70c8\u7130\u7bad",
                "/items/rain_of_arrows": "\u7bad\u96e8",
                "/items/silencing_shot": "\u6c89\u9ed8\u4e4b\u7bad",
                "/items/steady_shot": "\u7a33\u5b9a\u5c04\u51fb",
                "/items/pestilent_shot": "\u75ab\u75c5\u5c04\u51fb",
                "/items/penetrating_shot": "\u8d2f\u7a7f\u5c04\u51fb",
                "/items/water_strike": "\u6d41\u6c34\u51b2\u51fb",
                "/items/ice_spear": "\u51b0\u67aa\u672f",
                "/items/frost_surge": "\u51b0\u971c\u7206\u88c2",
                "/items/mana_spring": "\u6cd5\u529b\u55b7\u6cc9",
                "/items/entangle": "\u7f20\u7ed5",
                "/items/toxic_pollen": "\u5267\u6bd2\u7c89\u5c18",
                "/items/natures_veil": "\u81ea\u7136\u83cc\u5e55",
                "/items/life_drain": "\u751f\u547d\u5438\u53d6",
                "/items/fireball": "\u706b\u7403",
                "/items/flame_blast": "\u7194\u5ca9\u7206\u88c2",
                "/items/firestorm": "\u706b\u7130\u98ce\u66b4",
                "/items/smoke_burst": "\u70df\u7206\u706d\u5f71",
                "/items/minor_heal": "\u521d\u7ea7\u81ea\u6108\u672f",
                "/items/heal": "\u81ea\u6108\u672f",
                "/items/quick_aid": "\u5feb\u901f\u6cbb\u7597\u672f",
                "/items/rejuvenate": "\u7fa4\u4f53\u6cbb\u7597\u672f",
                "/items/taunt": "\u5632\u8bbd",
                "/items/provoke": "\u6311\u8845",
                "/items/toughness": "\u575a\u97e7",
                "/items/elusiveness": "\u95ea\u907f",
                "/items/precision": "\u7cbe\u786e",
                "/items/berserk": "\u72c2\u66b4",
                "/items/elemental_affinity": "\u5143\u7d20\u589e\u5e45",
                "/items/frenzy": "\u72c2\u901f",
                "/items/spike_shell": "\u5c16\u523a\u9632\u62a4",
                "/items/retribution": "\u60e9\u6212",
                "/items/vampirism": "\u5438\u8840",
                "/items/revive": "\u590d\u6d3b",
                "/items/insanity": "\u75af\u72c2",
                "/items/invincible": "\u65e0\u654c",
                "/items/speed_aura": "\u901f\u5ea6\u5149\u73af",
                "/items/guardian_aura": "\u5b88\u62a4\u5149\u73af",
                "/items/fierce_aura": "\u7269\u7406\u5149\u73af",
                "/items/critical_aura": "\u66b4\u51fb\u5149\u73af",
                "/items/mystic_aura": "\u5143\u7d20\u5149\u73af",
                "/items/gobo_stabber": "\u54e5\u5e03\u6797\u957f\u5251",
                "/items/gobo_slasher": "\u54e5\u5e03\u6797\u5173\u5200",
                "/items/gobo_smasher": "\u54e5\u5e03\u6797\u72fc\u7259\u68d2",
                "/items/spiked_bulwark": "\u5c16\u523a\u91cd\u76fe",
                "/items/werewolf_slasher": "\u72fc\u4eba\u5173\u5200",
                "/items/griffin_bulwark": "\u72ee\u9e6b\u91cd\u76fe",
                "/items/griffin_bulwark_refined": "\u72ee\u9e6b\u91cd\u76fe\uff08\u7cbe\uff09",
                "/items/gobo_shooter": "\u54e5\u5e03\u6797\u5f39\u5f13",
                "/items/vampiric_bow": "\u5438\u8840\u5f13",
                "/items/cursed_bow": "\u5492\u6028\u4e4b\u5f13",
                "/items/cursed_bow_refined": "\u5492\u6028\u4e4b\u5f13\uff08\u7cbe\uff09",
                "/items/gobo_boomstick": "\u54e5\u5e03\u6797\u706b\u68cd",
                "/items/cheese_bulwark": "\u5976\u916a\u91cd\u76fe",
                "/items/verdant_bulwark": "\u7fe0\u7eff\u91cd\u76fe",
                "/items/azure_bulwark": "\u851a\u84dd\u91cd\u76fe",
                "/items/burble_bulwark": "\u6df1\u7d2b\u91cd\u76fe",
                "/items/crimson_bulwark": "\u7edb\u7ea2\u91cd\u76fe",
                "/items/rainbow_bulwark": "\u5f69\u8679\u91cd\u76fe",
                "/items/holy_bulwark": "\u795e\u5723\u91cd\u76fe",
                "/items/wooden_bow": "\u6728\u5f13",
                "/items/birch_bow": "\u6866\u6728\u5f13",
                "/items/cedar_bow": "\u96ea\u677e\u5f13",
                "/items/purpleheart_bow": "\u7d2b\u5fc3\u5f13",
                "/items/ginkgo_bow": "\u94f6\u674f\u5f13",
                "/items/redwood_bow": "\u7ea2\u6749\u5f13",
                "/items/arcane_bow": "\u795e\u79d8\u5f13",
                "/items/stalactite_spear": "\u77f3\u949f\u957f\u67aa",
                "/items/granite_bludgeon": "\u82b1\u5c97\u5ca9\u5927\u68d2",
                "/items/furious_spear": "\u72c2\u6012\u957f\u67aa",
                "/items/furious_spear_refined": "\u72c2\u6012\u957f\u67aa\uff08\u7cbe\uff09",
                "/items/regal_sword": "\u541b\u738b\u4e4b\u5251",
                "/items/regal_sword_refined": "\u541b\u738b\u4e4b\u5251\uff08\u7cbe\uff09",
                "/items/chaotic_flail": "\u6df7\u6c8c\u8fde\u67b7",
                "/items/chaotic_flail_refined": "\u6df7\u6c8c\u8fde\u67b7\uff08\u7cbe\uff09",
                "/items/soul_hunter_crossbow": "\u7075\u9b42\u730e\u624b\u5f29",
                "/items/sundering_crossbow": "\u88c2\u7a7a\u4e4b\u5f29",
                "/items/sundering_crossbow_refined": "\u88c2\u7a7a\u4e4b\u5f29\uff08\u7cbe\uff09",
                "/items/frost_staff": "\u51b0\u971c\u6cd5\u6756",
                "/items/infernal_battlestaff": "\u70bc\u72f1\u6cd5\u6756",
                "/items/jackalope_staff": "\u9e7f\u89d2\u5154\u4e4b\u6756",
                "/items/rippling_trident": "\u6d9f\u6f2a\u4e09\u53c9\u621f",
                "/items/rippling_trident_refined": "\u6d9f\u6f2a\u4e09\u53c9\u621f\uff08\u7cbe\uff09",
                "/items/blooming_trident": "\u7efd\u653e\u4e09\u53c9\u621f",
                "/items/blooming_trident_refined": "\u7efd\u653e\u4e09\u53c9\u621f\uff08\u7cbe\uff09",
                "/items/blazing_trident": "\u70bd\u7130\u4e09\u53c9\u621f",
                "/items/blazing_trident_refined": "\u70bd\u7130\u4e09\u53c9\u621f\uff08\u7cbe\uff09",
                "/items/cheese_sword": "\u5976\u916a\u5251",
                "/items/verdant_sword": "\u7fe0\u7eff\u5251",
                "/items/azure_sword": "\u851a\u84dd\u5251",
                "/items/burble_sword": "\u6df1\u7d2b\u5251",
                "/items/crimson_sword": "\u7edb\u7ea2\u5251",
                "/items/rainbow_sword": "\u5f69\u8679\u5251",
                "/items/holy_sword": "\u795e\u5723\u5251",
                "/items/cheese_spear": "\u5976\u916a\u957f\u67aa",
                "/items/verdant_spear": "\u7fe0\u7eff\u957f\u67aa",
                "/items/azure_spear": "\u851a\u84dd\u957f\u67aa",
                "/items/burble_spear": "\u6df1\u7d2b\u957f\u67aa",
                "/items/crimson_spear": "\u7edb\u7ea2\u957f\u67aa",
                "/items/rainbow_spear": "\u5f69\u8679\u957f\u67aa",
                "/items/holy_spear": "\u795e\u5723\u957f\u67aa",
                "/items/cheese_mace": "\u5976\u916a\u9489\u5934\u9524",
                "/items/verdant_mace": "\u7fe0\u7eff\u9489\u5934\u9524",
                "/items/azure_mace": "\u851a\u84dd\u9489\u5934\u9524",
                "/items/burble_mace": "\u6df1\u7d2b\u9489\u5934\u9524",
                "/items/crimson_mace": "\u7edb\u7ea2\u9489\u5934\u9524",
                "/items/rainbow_mace": "\u5f69\u8679\u9489\u5934\u9524",
                "/items/holy_mace": "\u795e\u5723\u9489\u5934\u9524",
                "/items/wooden_crossbow": "\u6728\u5f29",
                "/items/birch_crossbow": "\u6866\u6728\u5f29",
                "/items/cedar_crossbow": "\u96ea\u677e\u5f29",
                "/items/purpleheart_crossbow": "\u7d2b\u5fc3\u5f29",
                "/items/ginkgo_crossbow": "\u94f6\u674f\u5f29",
                "/items/redwood_crossbow": "\u7ea2\u6749\u5f29",
                "/items/arcane_crossbow": "\u795e\u79d8\u5f29",
                "/items/wooden_water_staff": "\u6728\u5236\u6c34\u6cd5\u6756",
                "/items/birch_water_staff": "\u6866\u6728\u6c34\u6cd5\u6756",
                "/items/cedar_water_staff": "\u96ea\u677e\u6c34\u6cd5\u6756",
                "/items/purpleheart_water_staff": "\u7d2b\u5fc3\u6c34\u6cd5\u6756",
                "/items/ginkgo_water_staff": "\u94f6\u674f\u6c34\u6cd5\u6756",
                "/items/redwood_water_staff": "\u7ea2\u6749\u6c34\u6cd5\u6756",
                "/items/arcane_water_staff": "\u795e\u79d8\u6c34\u6cd5\u6756",
                "/items/wooden_nature_staff": "\u6728\u5236\u81ea\u7136\u6cd5\u6756",
                "/items/birch_nature_staff": "\u6866\u6728\u81ea\u7136\u6cd5\u6756",
                "/items/cedar_nature_staff": "\u96ea\u677e\u81ea\u7136\u6cd5\u6756",
                "/items/purpleheart_nature_staff": "\u7d2b\u5fc3\u81ea\u7136\u6cd5\u6756",
                "/items/ginkgo_nature_staff": "\u94f6\u674f\u81ea\u7136\u6cd5\u6756",
                "/items/redwood_nature_staff": "\u7ea2\u6749\u81ea\u7136\u6cd5\u6756",
                "/items/arcane_nature_staff": "\u795e\u79d8\u81ea\u7136\u6cd5\u6756",
                "/items/wooden_fire_staff": "\u6728\u5236\u706b\u6cd5\u6756",
                "/items/birch_fire_staff": "\u6866\u6728\u706b\u6cd5\u6756",
                "/items/cedar_fire_staff": "\u96ea\u677e\u706b\u6cd5\u6756",
                "/items/purpleheart_fire_staff": "\u7d2b\u5fc3\u706b\u6cd5\u6756",
                "/items/ginkgo_fire_staff": "\u94f6\u674f\u706b\u6cd5\u6756",
                "/items/redwood_fire_staff": "\u7ea2\u6749\u706b\u6cd5\u6756",
                "/items/arcane_fire_staff": "\u795e\u79d8\u706b\u6cd5\u6756",
                "/items/eye_watch": "\u638c\u4e0a\u76d1\u5de5",
                "/items/snake_fang_dirk": "\u86c7\u7259\u77ed\u5251",
                "/items/vision_shield": "\u89c6\u89c9\u76fe",
                "/items/gobo_defender": "\u54e5\u5e03\u6797\u9632\u5fa1\u8005",
                "/items/vampire_fang_dirk": "\u5438\u8840\u9b3c\u77ed\u5251",
                "/items/knights_aegis": "\u9a91\u58eb\u76fe",
                "/items/knights_aegis_refined": "\u9a91\u58eb\u76fe\uff08\u7cbe\uff09",
                "/items/treant_shield": "\u6811\u4eba\u76fe",
                "/items/manticore_shield": "\u874e\u72ee\u76fe",
                "/items/tome_of_healing": "\u6cbb\u7597\u4e4b\u4e66",
                "/items/tome_of_the_elements": "\u5143\u7d20\u4e4b\u4e66",
                "/items/watchful_relic": "\u8b66\u6212\u9057\u7269",
                "/items/bishops_codex": "\u4e3b\u6559\u6cd5\u5178",
                "/items/bishops_codex_refined": "\u4e3b\u6559\u6cd5\u5178\uff08\u7cbe\uff09",
                "/items/cheese_buckler": "\u5976\u916a\u5706\u76fe",
                "/items/verdant_buckler": "\u7fe0\u7eff\u5706\u76fe",
                "/items/azure_buckler": "\u851a\u84dd\u5706\u76fe",
                "/items/burble_buckler": "\u6df1\u7d2b\u5706\u76fe",
                "/items/crimson_buckler": "\u7edb\u7ea2\u5706\u76fe",
                "/items/rainbow_buckler": "\u5f69\u8679\u5706\u76fe",
                "/items/holy_buckler": "\u795e\u5723\u5706\u76fe",
                "/items/wooden_shield": "\u6728\u76fe",
                "/items/birch_shield": "\u6866\u6728\u76fe",
                "/items/cedar_shield": "\u96ea\u677e\u76fe",
                "/items/purpleheart_shield": "\u7d2b\u5fc3\u76fe",
                "/items/ginkgo_shield": "\u94f6\u674f\u76fe",
                "/items/redwood_shield": "\u7ea2\u6749\u76fe",
                "/items/arcane_shield": "\u795e\u79d8\u76fe",
                "/items/gatherer_cape": "\u91c7\u96c6\u8005\u62ab\u98ce",
                "/items/gatherer_cape_refined": "\u91c7\u96c6\u8005\u62ab\u98ce\uff08\u7cbe\uff09",
                "/items/artificer_cape": "\u5de5\u5320\u62ab\u98ce",
                "/items/artificer_cape_refined": "\u5de5\u5320\u62ab\u98ce\uff08\u7cbe\uff09",
                "/items/culinary_cape": "\u53a8\u5e08\u62ab\u98ce",
                "/items/culinary_cape_refined": "\u53a8\u5e08\u62ab\u98ce\uff08\u7cbe\uff09",
                "/items/chance_cape": "\u673a\u7f18\u62ab\u98ce",
                "/items/chance_cape_refined": "\u673a\u7f18\u62ab\u98ce\uff08\u7cbe\uff09",
                "/items/sinister_cape": "\u9634\u68ee\u62ab\u98ce",
                "/items/sinister_cape_refined": "\u9634\u68ee\u62ab\u98ce\uff08\u7cbe\uff09",
                "/items/chimerical_quiver": "\u5947\u5e7b\u7bad\u888b",
                "/items/chimerical_quiver_refined": "\u5947\u5e7b\u7bad\u888b\uff08\u7cbe\uff09",
                "/items/enchanted_cloak": "\u79d8\u6cd5\u62ab\u98ce",
                "/items/enchanted_cloak_refined": "\u79d8\u6cd5\u62ab\u98ce\uff08\u7cbe\uff09",
                "/items/red_culinary_hat": "\u7ea2\u8272\u53a8\u5e08\u5e3d",
                "/items/snail_shell_helmet": "\u8717\u725b\u58f3\u5934\u76d4",
                "/items/vision_helmet": "\u89c6\u89c9\u5934\u76d4",
                "/items/fluffy_red_hat": "\u84ec\u677e\u7ea2\u5e3d\u5b50",
                "/items/corsair_helmet": "\u63a0\u593a\u8005\u5934\u76d4",
                "/items/corsair_helmet_refined": "\u63a0\u593a\u8005\u5934\u76d4\uff08\u7cbe\uff09",
                "/items/acrobatic_hood": "\u6742\u6280\u5e08\u515c\u5e3d",
                "/items/acrobatic_hood_refined": "\u6742\u6280\u5e08\u515c\u5e3d\uff08\u7cbe\uff09",
                "/items/magicians_hat": "\u9b54\u672f\u5e08\u5e3d",
                "/items/magicians_hat_refined": "\u9b54\u672f\u5e08\u5e3d\uff08\u7cbe\uff09",
                "/items/cheese_helmet": "\u5976\u916a\u5934\u76d4",
                "/items/verdant_helmet": "\u7fe0\u7eff\u5934\u76d4",
                "/items/azure_helmet": "\u851a\u84dd\u5934\u76d4",
                "/items/burble_helmet": "\u6df1\u7d2b\u5934\u76d4",
                "/items/crimson_helmet": "\u7edb\u7ea2\u5934\u76d4",
                "/items/rainbow_helmet": "\u5f69\u8679\u5934\u76d4",
                "/items/holy_helmet": "\u795e\u5723\u5934\u76d4",
                "/items/rough_hood": "\u7c97\u7cd9\u515c\u5e3d",
                "/items/reptile_hood": "\u722c\u884c\u52a8\u7269\u515c\u5e3d",
                "/items/gobo_hood": "\u54e5\u5e03\u6797\u515c\u5e3d",
                "/items/beast_hood": "\u91ce\u517d\u515c\u5e3d",
                "/items/umbral_hood": "\u6697\u5f71\u515c\u5e3d",
                "/items/cotton_hat": "\u68c9\u5e3d",
                "/items/linen_hat": "\u4e9a\u9ebb\u5e3d",
                "/items/bamboo_hat": "\u7af9\u5e3d",
                "/items/silk_hat": "\u4e1d\u5e3d",
                "/items/radiant_hat": "\u5149\u8f89\u5e3d",
                "/items/dairyhands_top": "\u6324\u5976\u5de5\u4e0a\u8863",
                "/items/foragers_top": "\u91c7\u6458\u8005\u4e0a\u8863",
                "/items/lumberjacks_top": "\u4f10\u6728\u5de5\u4e0a\u8863",
                "/items/cheesemakers_top": "\u5976\u916a\u5e08\u4e0a\u8863",
                "/items/crafters_top": "\u5de5\u5320\u4e0a\u8863",
                "/items/tailors_top": "\u88c1\u7f1d\u4e0a\u8863",
                "/items/chefs_top": "\u53a8\u5e08\u4e0a\u8863",
                "/items/brewers_top": "\u996e\u54c1\u5e08\u4e0a\u8863",
                "/items/alchemists_top": "\u70bc\u91d1\u5e08\u4e0a\u8863",
                "/items/enhancers_top": "\u5f3a\u5316\u5e08\u4e0a\u8863",
                "/items/gator_vest": "\u9cc4\u9c7c\u9a6c\u7532",
                "/items/turtle_shell_body": "\u9f9f\u58f3\u80f8\u7532",
                "/items/colossus_plate_body": "\u5de8\u50cf\u80f8\u7532",
                "/items/demonic_plate_body": "\u6076\u9b54\u80f8\u7532",
                "/items/anchorbound_plate_body": "\u951a\u5b9a\u80f8\u7532",
                "/items/anchorbound_plate_body_refined": "\u951a\u5b9a\u80f8\u7532\uff08\u7cbe\uff09",
                "/items/maelstrom_plate_body": "\u6012\u6d9b\u80f8\u7532",
                "/items/maelstrom_plate_body_refined": "\u6012\u6d9b\u80f8\u7532\uff08\u7cbe\uff09",
                "/items/marine_tunic": "\u6d77\u6d0b\u76ae\u8863",
                "/items/revenant_tunic": "\u4ea1\u7075\u76ae\u8863",
                "/items/griffin_tunic": "\u72ee\u9e6b\u76ae\u8863",
                "/items/kraken_tunic": "\u514b\u62c9\u80af\u76ae\u8863",
                "/items/kraken_tunic_refined": "\u514b\u62c9\u80af\u76ae\u8863\uff08\u7cbe\uff09",
                "/items/icy_robe_top": "\u51b0\u971c\u888d\u670d",
                "/items/flaming_robe_top": "\u70c8\u7130\u888d\u670d",
                "/items/luna_robe_top": "\u6708\u795e\u888d\u670d",
                "/items/royal_water_robe_top": "\u7687\u5bb6\u6c34\u7cfb\u888d\u670d",
                "/items/royal_water_robe_top_refined": "\u7687\u5bb6\u6c34\u7cfb\u888d\u670d\uff08\u7cbe\uff09",
                "/items/royal_nature_robe_top": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d",
                "/items/royal_nature_robe_top_refined": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d\uff08\u7cbe\uff09",
                "/items/royal_fire_robe_top": "\u7687\u5bb6\u706b\u7cfb\u888d\u670d",
                "/items/royal_fire_robe_top_refined": "\u7687\u5bb6\u706b\u7cfb\u888d\u670d\uff08\u7cbe\uff09",
                "/items/cheese_plate_body": "\u5976\u916a\u80f8\u7532",
                "/items/verdant_plate_body": "\u7fe0\u7eff\u80f8\u7532",
                "/items/azure_plate_body": "\u851a\u84dd\u80f8\u7532",
                "/items/burble_plate_body": "\u6df1\u7d2b\u80f8\u7532",
                "/items/crimson_plate_body": "\u7edb\u7ea2\u80f8\u7532",
                "/items/rainbow_plate_body": "\u5f69\u8679\u80f8\u7532",
                "/items/holy_plate_body": "\u795e\u5723\u80f8\u7532",
                "/items/rough_tunic": "\u7c97\u7cd9\u76ae\u8863",
                "/items/reptile_tunic": "\u722c\u884c\u52a8\u7269\u76ae\u8863",
                "/items/gobo_tunic": "\u54e5\u5e03\u6797\u76ae\u8863",
                "/items/beast_tunic": "\u91ce\u517d\u76ae\u8863",
                "/items/umbral_tunic": "\u6697\u5f71\u76ae\u8863",
                "/items/cotton_robe_top": "\u68c9\u888d\u670d",
                "/items/linen_robe_top": "\u4e9a\u9ebb\u888d\u670d",
                "/items/bamboo_robe_top": "\u7af9\u888d\u670d",
                "/items/silk_robe_top": "\u4e1d\u7ef8\u888d\u670d",
                "/items/radiant_robe_top": "\u5149\u8f89\u888d\u670d",
                "/items/dairyhands_bottoms": "\u6324\u5976\u5de5\u4e0b\u88c5",
                "/items/foragers_bottoms": "\u91c7\u6458\u8005\u4e0b\u88c5",
                "/items/lumberjacks_bottoms": "\u4f10\u6728\u5de5\u4e0b\u88c5",
                "/items/cheesemakers_bottoms": "\u5976\u916a\u5e08\u4e0b\u88c5",
                "/items/crafters_bottoms": "\u5de5\u5320\u4e0b\u88c5",
                "/items/tailors_bottoms": "\u88c1\u7f1d\u4e0b\u88c5",
                "/items/chefs_bottoms": "\u53a8\u5e08\u4e0b\u88c5",
                "/items/brewers_bottoms": "\u996e\u54c1\u5e08\u4e0b\u88c5",
                "/items/alchemists_bottoms": "\u70bc\u91d1\u5e08\u4e0b\u88c5",
                "/items/enhancers_bottoms": "\u5f3a\u5316\u5e08\u4e0b\u88c5",
                "/items/turtle_shell_legs": "\u9f9f\u58f3\u817f\u7532",
                "/items/colossus_plate_legs": "\u5de8\u50cf\u817f\u7532",
                "/items/demonic_plate_legs": "\u6076\u9b54\u817f\u7532",
                "/items/anchorbound_plate_legs": "\u951a\u5b9a\u817f\u7532",
                "/items/anchorbound_plate_legs_refined": "\u951a\u5b9a\u817f\u7532\uff08\u7cbe\uff09",
                "/items/maelstrom_plate_legs": "\u6012\u6d9b\u817f\u7532",
                "/items/maelstrom_plate_legs_refined": "\u6012\u6d9b\u817f\u7532\uff08\u7cbe\uff09",
                "/items/marine_chaps": "\u822a\u6d77\u76ae\u88e4",
                "/items/revenant_chaps": "\u4ea1\u7075\u76ae\u88e4",
                "/items/griffin_chaps": "\u72ee\u9e6b\u76ae\u88e4",
                "/items/kraken_chaps": "\u514b\u62c9\u80af\u76ae\u88e4",
                "/items/kraken_chaps_refined": "\u514b\u62c9\u80af\u76ae\u88e4\uff08\u7cbe\uff09",
                "/items/icy_robe_bottoms": "\u51b0\u971c\u888d\u88d9",
                "/items/flaming_robe_bottoms": "\u70c8\u7130\u888d\u88d9",
                "/items/luna_robe_bottoms": "\u6708\u795e\u888d\u88d9",
                "/items/royal_water_robe_bottoms": "\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9",
                "/items/royal_water_robe_bottoms_refined": "\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9\uff08\u7cbe\uff09",
                "/items/royal_nature_robe_bottoms": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9",
                "/items/royal_nature_robe_bottoms_refined": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9\uff08\u7cbe\uff09",
                "/items/royal_fire_robe_bottoms": "\u7687\u5bb6\u706b\u7cfb\u888d\u88d9",
                "/items/royal_fire_robe_bottoms_refined": "\u7687\u5bb6\u706b\u7cfb\u888d\u88d9\uff08\u7cbe\uff09",
                "/items/cheese_plate_legs": "\u5976\u916a\u817f\u7532",
                "/items/verdant_plate_legs": "\u7fe0\u7eff\u817f\u7532",
                "/items/azure_plate_legs": "\u851a\u84dd\u817f\u7532",
                "/items/burble_plate_legs": "\u6df1\u7d2b\u817f\u7532",
                "/items/crimson_plate_legs": "\u7edb\u7ea2\u817f\u7532",
                "/items/rainbow_plate_legs": "\u5f69\u8679\u817f\u7532",
                "/items/holy_plate_legs": "\u795e\u5723\u817f\u7532",
                "/items/rough_chaps": "\u7c97\u7cd9\u76ae\u88e4",
                "/items/reptile_chaps": "\u722c\u884c\u52a8\u7269\u76ae\u88e4",
                "/items/gobo_chaps": "\u54e5\u5e03\u6797\u76ae\u88e4",
                "/items/beast_chaps": "\u91ce\u517d\u76ae\u88e4",
                "/items/umbral_chaps": "\u6697\u5f71\u76ae\u88e4",
                "/items/cotton_robe_bottoms": "\u68c9\u888d\u88d9",
                "/items/linen_robe_bottoms": "\u4e9a\u9ebb\u888d\u88d9",
                "/items/bamboo_robe_bottoms": "\u7af9\u888d\u88d9",
                "/items/silk_robe_bottoms": "\u4e1d\u7ef8\u888d\u88d9",
                "/items/radiant_robe_bottoms": "\u5149\u8f89\u888d\u88d9",
                "/items/enchanted_gloves": "\u9644\u9b54\u624b\u5957",
                "/items/pincer_gloves": "\u87f9\u94b3\u624b\u5957",
                "/items/panda_gloves": "\u718a\u732b\u624b\u5957",
                "/items/magnetic_gloves": "\u78c1\u529b\u624b\u5957",
                "/items/dodocamel_gauntlets": "\u6e21\u6e21\u9a7c\u62a4\u624b",
                "/items/dodocamel_gauntlets_refined": "\u6e21\u6e21\u9a7c\u62a4\u624b\uff08\u7cbe\uff09",
                "/items/sighted_bracers": "\u7784\u51c6\u62a4\u8155",
                "/items/marksman_bracers": "\u795e\u5c04\u62a4\u8155",
                "/items/marksman_bracers_refined": "\u795e\u5c04\u62a4\u8155\uff08\u7cbe\uff09",
                "/items/chrono_gloves": "\u65f6\u7a7a\u624b\u5957",
                "/items/cheese_gauntlets": "\u5976\u916a\u62a4\u624b",
                "/items/verdant_gauntlets": "\u7fe0\u7eff\u62a4\u624b",
                "/items/azure_gauntlets": "\u851a\u84dd\u62a4\u624b",
                "/items/burble_gauntlets": "\u6df1\u7d2b\u62a4\u624b",
                "/items/crimson_gauntlets": "\u7edb\u7ea2\u62a4\u624b",
                "/items/rainbow_gauntlets": "\u5f69\u8679\u62a4\u624b",
                "/items/holy_gauntlets": "\u795e\u5723\u62a4\u624b",
                "/items/rough_bracers": "\u7c97\u7cd9\u62a4\u8155",
                "/items/reptile_bracers": "\u722c\u884c\u52a8\u7269\u62a4\u8155",
                "/items/gobo_bracers": "\u54e5\u5e03\u6797\u62a4\u8155",
                "/items/beast_bracers": "\u91ce\u517d\u62a4\u8155",
                "/items/umbral_bracers": "\u6697\u5f71\u62a4\u8155",
                "/items/cotton_gloves": "\u68c9\u624b\u5957",
                "/items/linen_gloves": "\u4e9a\u9ebb\u624b\u5957",
                "/items/bamboo_gloves": "\u7af9\u624b\u5957",
                "/items/silk_gloves": "\u4e1d\u624b\u5957",
                "/items/radiant_gloves": "\u5149\u8f89\u624b\u5957",
                "/items/collectors_boots": "\u6536\u85cf\u5bb6\u9774",
                "/items/shoebill_shoes": "\u9cb8\u5934\u9e73\u978b",
                "/items/black_bear_shoes": "\u9ed1\u718a\u978b",
                "/items/grizzly_bear_shoes": "\u68d5\u718a\u978b",
                "/items/polar_bear_shoes": "\u5317\u6781\u718a\u978b",
                "/items/pathbreaker_boots": "\u5f00\u8def\u8005\u9774",
                "/items/pathbreaker_boots_refined": "\u5f00\u8def\u8005\u9774\uff08\u7cbe\uff09",
                "/items/centaur_boots": "\u534a\u4eba\u9a6c\u9774",
                "/items/pathfinder_boots": "\u63a2\u8def\u8005\u9774",
                "/items/pathfinder_boots_refined": "\u63a2\u8def\u8005\u9774\uff08\u7cbe\uff09",
                "/items/sorcerer_boots": "\u5deb\u5e08\u9774",
                "/items/pathseeker_boots": "\u5bfb\u8def\u8005\u9774",
                "/items/pathseeker_boots_refined": "\u5bfb\u8def\u8005\u9774\uff08\u7cbe\uff09",
                "/items/cheese_boots": "\u5976\u916a\u9774",
                "/items/verdant_boots": "\u7fe0\u7eff\u9774",
                "/items/azure_boots": "\u851a\u84dd\u9774",
                "/items/burble_boots": "\u6df1\u7d2b\u9774",
                "/items/crimson_boots": "\u7edb\u7ea2\u9774",
                "/items/rainbow_boots": "\u5f69\u8679\u9774",
                "/items/holy_boots": "\u795e\u5723\u9774",
                "/items/rough_boots": "\u7c97\u7cd9\u9774",
                "/items/reptile_boots": "\u722c\u884c\u52a8\u7269\u9774",
                "/items/gobo_boots": "\u54e5\u5e03\u6797\u9774",
                "/items/beast_boots": "\u91ce\u517d\u9774",
                "/items/umbral_boots": "\u6697\u5f71\u9774",
                "/items/cotton_boots": "\u68c9\u9774",
                "/items/linen_boots": "\u4e9a\u9ebb\u9774",
                "/items/bamboo_boots": "\u7af9\u9774",
                "/items/silk_boots": "\u4e1d\u9774",
                "/items/radiant_boots": "\u5149\u8f89\u9774",
                "/items/small_pouch": "\u5c0f\u888b\u5b50",
                "/items/medium_pouch": "\u4e2d\u888b\u5b50",
                "/items/large_pouch": "\u5927\u888b\u5b50",
                "/items/giant_pouch": "\u5de8\u5927\u888b\u5b50",
                "/items/gluttonous_pouch": "\u8d2a\u98df\u4e4b\u888b",
                "/items/guzzling_pouch": "\u66b4\u996e\u4e4b\u56ca",
                "/items/necklace_of_efficiency": "\u6548\u7387\u9879\u94fe",
                "/items/fighter_necklace": "\u6218\u58eb\u9879\u94fe",
                "/items/ranger_necklace": "\u5c04\u624b\u9879\u94fe",
                "/items/wizard_necklace": "\u5deb\u5e08\u9879\u94fe",
                "/items/necklace_of_wisdom": "\u7ecf\u9a8c\u9879\u94fe",
                "/items/necklace_of_speed": "\u901f\u5ea6\u9879\u94fe",
                "/items/philosophers_necklace": "\u8d24\u8005\u9879\u94fe",
                "/items/earrings_of_gathering": "\u91c7\u96c6\u8033\u73af",
                "/items/earrings_of_essence_find": "\u7cbe\u534e\u53d1\u73b0\u8033\u73af",
                "/items/earrings_of_armor": "\u62a4\u7532\u8033\u73af",
                "/items/earrings_of_regeneration": "\u6062\u590d\u8033\u73af",
                "/items/earrings_of_resistance": "\u6297\u6027\u8033\u73af",
                "/items/earrings_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u8033\u73af",
                "/items/earrings_of_critical_strike": "\u66b4\u51fb\u8033\u73af",
                "/items/philosophers_earrings": "\u8d24\u8005\u8033\u73af",
                "/items/ring_of_gathering": "\u91c7\u96c6\u6212\u6307",
                "/items/ring_of_essence_find": "\u7cbe\u534e\u53d1\u73b0\u6212\u6307",
                "/items/ring_of_armor": "\u62a4\u7532\u6212\u6307",
                "/items/ring_of_regeneration": "\u6062\u590d\u6212\u6307",
                "/items/ring_of_resistance": "\u6297\u6027\u6212\u6307",
                "/items/ring_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u6212\u6307",
                "/items/ring_of_critical_strike": "\u66b4\u51fb\u6212\u6307",
                "/items/philosophers_ring": "\u8d24\u8005\u6212\u6307",
                "/items/trainee_milking_charm": "\u5b9e\u4e60\u6324\u5976\u62a4\u7b26",
                "/items/basic_milking_charm": "\u57fa\u7840\u6324\u5976\u62a4\u7b26",
                "/items/advanced_milking_charm": "\u9ad8\u7ea7\u6324\u5976\u62a4\u7b26",
                "/items/expert_milking_charm": "\u4e13\u5bb6\u6324\u5976\u62a4\u7b26",
                "/items/master_milking_charm": "\u5927\u5e08\u6324\u5976\u62a4\u7b26",
                "/items/grandmaster_milking_charm": "\u5b97\u5e08\u6324\u5976\u62a4\u7b26",
                "/items/trainee_foraging_charm": "\u5b9e\u4e60\u91c7\u6458\u62a4\u7b26",
                "/items/basic_foraging_charm": "\u57fa\u7840\u91c7\u6458\u62a4\u7b26",
                "/items/advanced_foraging_charm": "\u9ad8\u7ea7\u91c7\u6458\u62a4\u7b26",
                "/items/expert_foraging_charm": "\u4e13\u5bb6\u91c7\u6458\u62a4\u7b26",
                "/items/master_foraging_charm": "\u5927\u5e08\u91c7\u6458\u62a4\u7b26",
                "/items/grandmaster_foraging_charm": "\u5b97\u5e08\u91c7\u6458\u62a4\u7b26",
                "/items/trainee_woodcutting_charm": "\u5b9e\u4e60\u4f10\u6728\u62a4\u7b26",
                "/items/basic_woodcutting_charm": "\u57fa\u7840\u4f10\u6728\u62a4\u7b26",
                "/items/advanced_woodcutting_charm": "\u9ad8\u7ea7\u4f10\u6728\u62a4\u7b26",
                "/items/expert_woodcutting_charm": "\u4e13\u5bb6\u4f10\u6728\u62a4\u7b26",
                "/items/master_woodcutting_charm": "\u5927\u5e08\u4f10\u6728\u62a4\u7b26",
                "/items/grandmaster_woodcutting_charm": "\u5b97\u5e08\u4f10\u6728\u62a4\u7b26",
                "/items/trainee_cheesesmithing_charm": "\u5b9e\u4e60\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/items/basic_cheesesmithing_charm": "\u57fa\u7840\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/items/advanced_cheesesmithing_charm": "\u9ad8\u7ea7\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/items/expert_cheesesmithing_charm": "\u4e13\u5bb6\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/items/master_cheesesmithing_charm": "\u5927\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/items/grandmaster_cheesesmithing_charm": "\u5b97\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/items/trainee_crafting_charm": "\u5b9e\u4e60\u5236\u4f5c\u62a4\u7b26",
                "/items/basic_crafting_charm": "\u57fa\u7840\u5236\u4f5c\u62a4\u7b26",
                "/items/advanced_crafting_charm": "\u9ad8\u7ea7\u5236\u4f5c\u62a4\u7b26",
                "/items/expert_crafting_charm": "\u4e13\u5bb6\u5236\u4f5c\u62a4\u7b26",
                "/items/master_crafting_charm": "\u5927\u5e08\u5236\u4f5c\u62a4\u7b26",
                "/items/grandmaster_crafting_charm": "\u5b97\u5e08\u5236\u4f5c\u62a4\u7b26",
                "/items/trainee_tailoring_charm": "\u5b9e\u4e60\u7f1d\u7eab\u62a4\u7b26",
                "/items/basic_tailoring_charm": "\u57fa\u7840\u7f1d\u7eab\u62a4\u7b26",
                "/items/advanced_tailoring_charm": "\u9ad8\u7ea7\u7f1d\u7eab\u62a4\u7b26",
                "/items/expert_tailoring_charm": "\u4e13\u5bb6\u7f1d\u7eab\u62a4\u7b26",
                "/items/master_tailoring_charm": "\u5927\u5e08\u7f1d\u7eab\u62a4\u7b26",
                "/items/grandmaster_tailoring_charm": "\u5b97\u5e08\u7f1d\u7eab\u62a4\u7b26",
                "/items/trainee_cooking_charm": "\u5b9e\u4e60\u70f9\u996a\u62a4\u7b26",
                "/items/basic_cooking_charm": "\u57fa\u7840\u70f9\u996a\u62a4\u7b26",
                "/items/advanced_cooking_charm": "\u9ad8\u7ea7\u70f9\u996a\u62a4\u7b26",
                "/items/expert_cooking_charm": "\u4e13\u5bb6\u70f9\u996a\u62a4\u7b26",
                "/items/master_cooking_charm": "\u5927\u5e08\u70f9\u996a\u62a4\u7b26",
                "/items/grandmaster_cooking_charm": "\u5b97\u5e08\u70f9\u996a\u62a4\u7b26",
                "/items/trainee_brewing_charm": "\u5b9e\u4e60\u51b2\u6ce1\u62a4\u7b26",
                "/items/basic_brewing_charm": "\u57fa\u7840\u51b2\u6ce1\u62a4\u7b26",
                "/items/advanced_brewing_charm": "\u9ad8\u7ea7\u51b2\u6ce1\u62a4\u7b26",
                "/items/expert_brewing_charm": "\u4e13\u5bb6\u51b2\u6ce1\u62a4\u7b26",
                "/items/master_brewing_charm": "\u5927\u5e08\u51b2\u6ce1\u62a4\u7b26",
                "/items/grandmaster_brewing_charm": "\u5b97\u5e08\u51b2\u6ce1\u62a4\u7b26",
                "/items/trainee_alchemy_charm": "\u5b9e\u4e60\u70bc\u91d1\u62a4\u7b26",
                "/items/basic_alchemy_charm": "\u57fa\u7840\u70bc\u91d1\u62a4\u7b26",
                "/items/advanced_alchemy_charm": "\u9ad8\u7ea7\u70bc\u91d1\u62a4\u7b26",
                "/items/expert_alchemy_charm": "\u4e13\u5bb6\u70bc\u91d1\u62a4\u7b26",
                "/items/master_alchemy_charm": "\u5927\u5e08\u70bc\u91d1\u62a4\u7b26",
                "/items/grandmaster_alchemy_charm": "\u5b97\u5e08\u70bc\u91d1\u62a4\u7b26",
                "/items/trainee_enhancing_charm": "\u5b9e\u4e60\u5f3a\u5316\u62a4\u7b26",
                "/items/basic_enhancing_charm": "\u57fa\u7840\u5f3a\u5316\u62a4\u7b26",
                "/items/advanced_enhancing_charm": "\u9ad8\u7ea7\u5f3a\u5316\u62a4\u7b26",
                "/items/expert_enhancing_charm": "\u4e13\u5bb6\u5f3a\u5316\u62a4\u7b26",
                "/items/master_enhancing_charm": "\u5927\u5e08\u5f3a\u5316\u62a4\u7b26",
                "/items/grandmaster_enhancing_charm": "\u5b97\u5e08\u5f3a\u5316\u62a4\u7b26",
                "/items/trainee_stamina_charm": "\u5b9e\u4e60\u8010\u529b\u62a4\u7b26",
                "/items/basic_stamina_charm": "\u57fa\u7840\u8010\u529b\u62a4\u7b26",
                "/items/advanced_stamina_charm": "\u9ad8\u7ea7\u8010\u529b\u62a4\u7b26",
                "/items/expert_stamina_charm": "\u4e13\u5bb6\u8010\u529b\u62a4\u7b26",
                "/items/master_stamina_charm": "\u5927\u5e08\u8010\u529b\u62a4\u7b26",
                "/items/grandmaster_stamina_charm": "\u5b97\u5e08\u8010\u529b\u62a4\u7b26",
                "/items/trainee_intelligence_charm": "\u5b9e\u4e60\u667a\u529b\u62a4\u7b26",
                "/items/basic_intelligence_charm": "\u57fa\u7840\u667a\u529b\u62a4\u7b26",
                "/items/advanced_intelligence_charm": "\u9ad8\u7ea7\u667a\u529b\u62a4\u7b26",
                "/items/expert_intelligence_charm": "\u4e13\u5bb6\u667a\u529b\u62a4\u7b26",
                "/items/master_intelligence_charm": "\u5927\u5e08\u667a\u529b\u62a4\u7b26",
                "/items/grandmaster_intelligence_charm": "\u5b97\u5e08\u667a\u529b\u62a4\u7b26",
                "/items/trainee_attack_charm": "\u5b9e\u4e60\u653b\u51fb\u62a4\u7b26",
                "/items/basic_attack_charm": "\u57fa\u7840\u653b\u51fb\u62a4\u7b26",
                "/items/advanced_attack_charm": "\u9ad8\u7ea7\u653b\u51fb\u62a4\u7b26",
                "/items/expert_attack_charm": "\u4e13\u5bb6\u653b\u51fb\u62a4\u7b26",
                "/items/master_attack_charm": "\u5927\u5e08\u653b\u51fb\u62a4\u7b26",
                "/items/grandmaster_attack_charm": "\u5b97\u5e08\u653b\u51fb\u62a4\u7b26",
                "/items/trainee_defense_charm": "\u5b9e\u4e60\u9632\u5fa1\u62a4\u7b26",
                "/items/basic_defense_charm": "\u57fa\u7840\u9632\u5fa1\u62a4\u7b26",
                "/items/advanced_defense_charm": "\u9ad8\u7ea7\u9632\u5fa1\u62a4\u7b26",
                "/items/expert_defense_charm": "\u4e13\u5bb6\u9632\u5fa1\u62a4\u7b26",
                "/items/master_defense_charm": "\u5927\u5e08\u9632\u5fa1\u62a4\u7b26",
                "/items/grandmaster_defense_charm": "\u5b97\u5e08\u9632\u5fa1\u62a4\u7b26",
                "/items/trainee_melee_charm": "\u5b9e\u4e60\u8fd1\u6218\u62a4\u7b26",
                "/items/basic_melee_charm": "\u57fa\u7840\u8fd1\u6218\u62a4\u7b26",
                "/items/advanced_melee_charm": "\u9ad8\u7ea7\u8fd1\u6218\u62a4\u7b26",
                "/items/expert_melee_charm": "\u4e13\u5bb6\u8fd1\u6218\u62a4\u7b26",
                "/items/master_melee_charm": "\u5927\u5e08\u8fd1\u6218\u62a4\u7b26",
                "/items/grandmaster_melee_charm": "\u5b97\u5e08\u8fd1\u6218\u62a4\u7b26",
                "/items/trainee_ranged_charm": "\u5b9e\u4e60\u8fdc\u7a0b\u62a4\u7b26",
                "/items/basic_ranged_charm": "\u57fa\u7840\u8fdc\u7a0b\u62a4\u7b26",
                "/items/advanced_ranged_charm": "\u9ad8\u7ea7\u8fdc\u7a0b\u62a4\u7b26",
                "/items/expert_ranged_charm": "\u4e13\u5bb6\u8fdc\u7a0b\u62a4\u7b26",
                "/items/master_ranged_charm": "\u5927\u5e08\u8fdc\u7a0b\u62a4\u7b26",
                "/items/grandmaster_ranged_charm": "\u5b97\u5e08\u8fdc\u7a0b\u62a4\u7b26",
                "/items/trainee_magic_charm": "\u5b9e\u4e60\u9b54\u6cd5\u62a4\u7b26",
                "/items/basic_magic_charm": "\u57fa\u7840\u9b54\u6cd5\u62a4\u7b26",
                "/items/advanced_magic_charm": "\u9ad8\u7ea7\u9b54\u6cd5\u62a4\u7b26",
                "/items/expert_magic_charm": "\u4e13\u5bb6\u9b54\u6cd5\u62a4\u7b26",
                "/items/master_magic_charm": "\u5927\u5e08\u9b54\u6cd5\u62a4\u7b26",
                "/items/grandmaster_magic_charm": "\u5b97\u5e08\u9b54\u6cd5\u62a4\u7b26",
                "/items/basic_task_badge": "\u57fa\u7840\u4efb\u52a1\u5fbd\u7ae0",
                "/items/advanced_task_badge": "\u9ad8\u7ea7\u4efb\u52a1\u5fbd\u7ae0",
                "/items/expert_task_badge": "\u4e13\u5bb6\u4efb\u52a1\u5fbd\u7ae0",
                "/items/celestial_brush": "\u661f\u7a7a\u5237\u5b50",
                "/items/cheese_brush": "\u5976\u916a\u5237\u5b50",
                "/items/verdant_brush": "\u7fe0\u7eff\u5237\u5b50",
                "/items/azure_brush": "\u851a\u84dd\u5237\u5b50",
                "/items/burble_brush": "\u6df1\u7d2b\u5237\u5b50",
                "/items/crimson_brush": "\u7edb\u7ea2\u5237\u5b50",
                "/items/rainbow_brush": "\u5f69\u8679\u5237\u5b50",
                "/items/holy_brush": "\u795e\u5723\u5237\u5b50",
                "/items/celestial_shears": "\u661f\u7a7a\u526a\u5200",
                "/items/cheese_shears": "\u5976\u916a\u526a\u5200",
                "/items/verdant_shears": "\u7fe0\u7eff\u526a\u5200",
                "/items/azure_shears": "\u851a\u84dd\u526a\u5200",
                "/items/burble_shears": "\u6df1\u7d2b\u526a\u5200",
                "/items/crimson_shears": "\u7edb\u7ea2\u526a\u5200",
                "/items/rainbow_shears": "\u5f69\u8679\u526a\u5200",
                "/items/holy_shears": "\u795e\u5723\u526a\u5200",
                "/items/celestial_hatchet": "\u661f\u7a7a\u65a7\u5934",
                "/items/cheese_hatchet": "\u5976\u916a\u65a7\u5934",
                "/items/verdant_hatchet": "\u7fe0\u7eff\u65a7\u5934",
                "/items/azure_hatchet": "\u851a\u84dd\u65a7\u5934",
                "/items/burble_hatchet": "\u6df1\u7d2b\u65a7\u5934",
                "/items/crimson_hatchet": "\u7edb\u7ea2\u65a7\u5934",
                "/items/rainbow_hatchet": "\u5f69\u8679\u65a7\u5934",
                "/items/holy_hatchet": "\u795e\u5723\u65a7\u5934",
                "/items/celestial_hammer": "\u661f\u7a7a\u9524\u5b50",
                "/items/cheese_hammer": "\u5976\u916a\u9524\u5b50",
                "/items/verdant_hammer": "\u7fe0\u7eff\u9524\u5b50",
                "/items/azure_hammer": "\u851a\u84dd\u9524\u5b50",
                "/items/burble_hammer": "\u6df1\u7d2b\u9524\u5b50",
                "/items/crimson_hammer": "\u7edb\u7ea2\u9524\u5b50",
                "/items/rainbow_hammer": "\u5f69\u8679\u9524\u5b50",
                "/items/holy_hammer": "\u795e\u5723\u9524\u5b50",
                "/items/celestial_chisel": "\u661f\u7a7a\u51ff\u5b50",
                "/items/cheese_chisel": "\u5976\u916a\u51ff\u5b50",
                "/items/verdant_chisel": "\u7fe0\u7eff\u51ff\u5b50",
                "/items/azure_chisel": "\u851a\u84dd\u51ff\u5b50",
                "/items/burble_chisel": "\u6df1\u7d2b\u51ff\u5b50",
                "/items/crimson_chisel": "\u7edb\u7ea2\u51ff\u5b50",
                "/items/rainbow_chisel": "\u5f69\u8679\u51ff\u5b50",
                "/items/holy_chisel": "\u795e\u5723\u51ff\u5b50",
                "/items/celestial_needle": "\u661f\u7a7a\u9488",
                "/items/cheese_needle": "\u5976\u916a\u9488",
                "/items/verdant_needle": "\u7fe0\u7eff\u9488",
                "/items/azure_needle": "\u851a\u84dd\u9488",
                "/items/burble_needle": "\u6df1\u7d2b\u9488",
                "/items/crimson_needle": "\u7edb\u7ea2\u9488",
                "/items/rainbow_needle": "\u5f69\u8679\u9488",
                "/items/holy_needle": "\u795e\u5723\u9488",
                "/items/celestial_spatula": "\u661f\u7a7a\u9505\u94f2",
                "/items/cheese_spatula": "\u5976\u916a\u9505\u94f2",
                "/items/verdant_spatula": "\u7fe0\u7eff\u9505\u94f2",
                "/items/azure_spatula": "\u851a\u84dd\u9505\u94f2",
                "/items/burble_spatula": "\u6df1\u7d2b\u9505\u94f2",
                "/items/crimson_spatula": "\u7edb\u7ea2\u9505\u94f2",
                "/items/rainbow_spatula": "\u5f69\u8679\u9505\u94f2",
                "/items/holy_spatula": "\u795e\u5723\u9505\u94f2",
                "/items/celestial_pot": "\u661f\u7a7a\u58f6",
                "/items/cheese_pot": "\u5976\u916a\u58f6",
                "/items/verdant_pot": "\u7fe0\u7eff\u58f6",
                "/items/azure_pot": "\u851a\u84dd\u58f6",
                "/items/burble_pot": "\u6df1\u7d2b\u58f6",
                "/items/crimson_pot": "\u7edb\u7ea2\u58f6",
                "/items/rainbow_pot": "\u5f69\u8679\u58f6",
                "/items/holy_pot": "\u795e\u5723\u58f6",
                "/items/celestial_alembic": "\u661f\u7a7a\u84b8\u998f\u5668",
                "/items/cheese_alembic": "\u5976\u916a\u84b8\u998f\u5668",
                "/items/verdant_alembic": "\u7fe0\u7eff\u84b8\u998f\u5668",
                "/items/azure_alembic": "\u851a\u84dd\u84b8\u998f\u5668",
                "/items/burble_alembic": "\u6df1\u7d2b\u84b8\u998f\u5668",
                "/items/crimson_alembic": "\u7edb\u7ea2\u84b8\u998f\u5668",
                "/items/rainbow_alembic": "\u5f69\u8679\u84b8\u998f\u5668",
                "/items/holy_alembic": "\u795e\u5723\u84b8\u998f\u5668",
                "/items/celestial_enhancer": "\u661f\u7a7a\u5f3a\u5316\u5668",
                "/items/cheese_enhancer": "\u5976\u916a\u5f3a\u5316\u5668",
                "/items/verdant_enhancer": "\u7fe0\u7eff\u5f3a\u5316\u5668",
                "/items/azure_enhancer": "\u851a\u84dd\u5f3a\u5316\u5668",
                "/items/burble_enhancer": "\u6df1\u7d2b\u5f3a\u5316\u5668",
                "/items/crimson_enhancer": "\u7edb\u7ea2\u5f3a\u5316\u5668",
                "/items/rainbow_enhancer": "\u5f69\u8679\u5f3a\u5316\u5668",
                "/items/holy_enhancer": "\u795e\u5723\u5f3a\u5316\u5668",
                "/items/milk": "\u725b\u5976",
                "/items/verdant_milk": "\u7fe0\u7eff\u725b\u5976",
                "/items/azure_milk": "\u851a\u84dd\u725b\u5976",
                "/items/burble_milk": "\u6df1\u7d2b\u725b\u5976",
                "/items/crimson_milk": "\u7edb\u7ea2\u725b\u5976",
                "/items/rainbow_milk": "\u5f69\u8679\u725b\u5976",
                "/items/holy_milk": "\u795e\u5723\u725b\u5976",
                "/items/cheese": "\u5976\u916a",
                "/items/verdant_cheese": "\u7fe0\u7eff\u5976\u916a",
                "/items/azure_cheese": "\u851a\u84dd\u5976\u916a",
                "/items/burble_cheese": "\u6df1\u7d2b\u5976\u916a",
                "/items/crimson_cheese": "\u7edb\u7ea2\u5976\u916a",
                "/items/rainbow_cheese": "\u5f69\u8679\u5976\u916a",
                "/items/holy_cheese": "\u795e\u5723\u5976\u916a",
                "/items/log": "\u539f\u6728",
                "/items/birch_log": "\u767d\u6866\u539f\u6728",
                "/items/cedar_log": "\u96ea\u677e\u539f\u6728",
                "/items/purpleheart_log": "\u7d2b\u5fc3\u539f\u6728",
                "/items/ginkgo_log": "\u94f6\u674f\u539f\u6728",
                "/items/redwood_log": "\u7ea2\u6749\u539f\u6728",
                "/items/arcane_log": "\u795e\u79d8\u539f\u6728",
                "/items/lumber": "\u6728\u677f",
                "/items/birch_lumber": "\u767d\u6866\u6728\u677f",
                "/items/cedar_lumber": "\u96ea\u677e\u6728\u677f",
                "/items/purpleheart_lumber": "\u7d2b\u5fc3\u6728\u677f",
                "/items/ginkgo_lumber": "\u94f6\u674f\u6728\u677f",
                "/items/redwood_lumber": "\u7ea2\u6749\u6728\u677f",
                "/items/arcane_lumber": "\u795e\u79d8\u6728\u677f",
                "/items/rough_hide": "\u7c97\u7cd9\u517d\u76ae",
                "/items/reptile_hide": "\u722c\u884c\u52a8\u7269\u76ae",
                "/items/gobo_hide": "\u54e5\u5e03\u6797\u76ae",
                "/items/beast_hide": "\u91ce\u517d\u76ae",
                "/items/umbral_hide": "\u6697\u5f71\u76ae",
                "/items/rough_leather": "\u7c97\u7cd9\u76ae\u9769",
                "/items/reptile_leather": "\u722c\u884c\u52a8\u7269\u76ae\u9769",
                "/items/gobo_leather": "\u54e5\u5e03\u6797\u76ae\u9769",
                "/items/beast_leather": "\u91ce\u517d\u76ae\u9769",
                "/items/umbral_leather": "\u6697\u5f71\u76ae\u9769",
                "/items/cotton": "\u68c9\u82b1",
                "/items/flax": "\u4e9a\u9ebb",
                "/items/bamboo_branch": "\u7af9\u5b50",
                "/items/cocoon": "\u8695\u8327",
                "/items/radiant_fiber": "\u5149\u8f89\u7ea4\u7ef4",
                "/items/cotton_fabric": "\u68c9\u82b1\u5e03\u6599",
                "/items/linen_fabric": "\u4e9a\u9ebb\u5e03\u6599",
                "/items/bamboo_fabric": "\u7af9\u5b50\u5e03\u6599",
                "/items/silk_fabric": "\u4e1d\u7ef8",
                "/items/radiant_fabric": "\u5149\u8f89\u5e03\u6599",
                "/items/egg": "\u9e21\u86cb",
                "/items/wheat": "\u5c0f\u9ea6",
                "/items/sugar": "\u7cd6",
                "/items/blueberry": "\u84dd\u8393",
                "/items/blackberry": "\u9ed1\u8393",
                "/items/strawberry": "\u8349\u8393",
                "/items/mooberry": "\u54de\u8393",
                "/items/marsberry": "\u706b\u661f\u8393",
                "/items/spaceberry": "\u592a\u7a7a\u8393",
                "/items/apple": "\u82f9\u679c",
                "/items/orange": "\u6a59\u5b50",
                "/items/plum": "\u674e\u5b50",
                "/items/peach": "\u6843\u5b50",
                "/items/dragon_fruit": "\u706b\u9f99\u679c",
                "/items/star_fruit": "\u6768\u6843",
                "/items/arabica_coffee_bean": "\u4f4e\u7ea7\u5496\u5561\u8c46",
                "/items/robusta_coffee_bean": "\u4e2d\u7ea7\u5496\u5561\u8c46",
                "/items/liberica_coffee_bean": "\u9ad8\u7ea7\u5496\u5561\u8c46",
                "/items/excelsa_coffee_bean": "\u7279\u7ea7\u5496\u5561\u8c46",
                "/items/fieriosa_coffee_bean": "\u706b\u5c71\u5496\u5561\u8c46",
                "/items/spacia_coffee_bean": "\u592a\u7a7a\u5496\u5561\u8c46",
                "/items/green_tea_leaf": "\u7eff\u8336\u53f6",
                "/items/black_tea_leaf": "\u9ed1\u8336\u53f6",
                "/items/burble_tea_leaf": "\u7d2b\u8336\u53f6",
                "/items/moolong_tea_leaf": "\u54de\u9f99\u8336\u53f6",
                "/items/red_tea_leaf": "\u7ea2\u8336\u53f6",
                "/items/emp_tea_leaf": "\u865a\u7a7a\u8336\u53f6",
                "/items/catalyst_of_coinification": "\u70b9\u91d1\u50ac\u5316\u5242",
                "/items/catalyst_of_decomposition": "\u5206\u89e3\u50ac\u5316\u5242",
                "/items/catalyst_of_transmutation": "\u8f6c\u5316\u50ac\u5316\u5242",
                "/items/prime_catalyst": "\u81f3\u9ad8\u50ac\u5316\u5242",
                "/items/snake_fang": "\u86c7\u7259",
                "/items/shoebill_feather": "\u9cb8\u5934\u9e73\u7fbd\u6bdb",
                "/items/snail_shell": "\u8717\u725b\u58f3",
                "/items/crab_pincer": "\u87f9\u94b3",
                "/items/turtle_shell": "\u4e4c\u9f9f\u58f3",
                "/items/marine_scale": "\u6d77\u6d0b\u9cde\u7247",
                "/items/treant_bark": "\u6811\u76ae",
                "/items/centaur_hoof": "\u534a\u4eba\u9a6c\u8e44",
                "/items/luna_wing": "\u6708\u795e\u7ffc",
                "/items/gobo_rag": "\u54e5\u5e03\u6797\u62b9\u5e03",
                "/items/goggles": "\u62a4\u76ee\u955c",
                "/items/magnifying_glass": "\u653e\u5927\u955c",
                "/items/eye_of_the_watcher": "\u89c2\u5bdf\u8005\u4e4b\u773c",
                "/items/icy_cloth": "\u51b0\u971c\u7ec7\u7269",
                "/items/flaming_cloth": "\u70c8\u7130\u7ec7\u7269",
                "/items/sorcerers_sole": "\u9b54\u6cd5\u5e08\u978b\u5e95",
                "/items/chrono_sphere": "\u65f6\u7a7a\u7403",
                "/items/frost_sphere": "\u51b0\u971c\u7403",
                "/items/panda_fluff": "\u718a\u732b\u7ed2",
                "/items/black_bear_fluff": "\u9ed1\u718a\u7ed2",
                "/items/grizzly_bear_fluff": "\u68d5\u718a\u7ed2",
                "/items/polar_bear_fluff": "\u5317\u6781\u718a\u7ed2",
                "/items/red_panda_fluff": "\u5c0f\u718a\u732b\u7ed2",
                "/items/magnet": "\u78c1\u94c1",
                "/items/stalactite_shard": "\u949f\u4e73\u77f3\u788e\u7247",
                "/items/living_granite": "\u82b1\u5c97\u5ca9",
                "/items/colossus_core": "\u5de8\u50cf\u6838\u5fc3",
                "/items/vampire_fang": "\u5438\u8840\u9b3c\u4e4b\u7259",
                "/items/werewolf_claw": "\u72fc\u4eba\u4e4b\u722a",
                "/items/revenant_anima": "\u4ea1\u8005\u4e4b\u9b42",
                "/items/soul_fragment": "\u7075\u9b42\u788e\u7247",
                "/items/infernal_ember": "\u5730\u72f1\u4f59\u70ec",
                "/items/demonic_core": "\u6076\u9b54\u6838\u5fc3",
                "/items/griffin_leather": "\u72ee\u9e6b\u4e4b\u76ae",
                "/items/manticore_sting": "\u874e\u72ee\u4e4b\u523a",
                "/items/jackalope_antler": "\u9e7f\u89d2\u5154\u4e4b\u89d2",
                "/items/dodocamel_plume": "\u6e21\u6e21\u9a7c\u4e4b\u7fce",
                "/items/griffin_talon": "\u72ee\u9e6b\u4e4b\u722a",
                "/items/chimerical_refinement_shard": "\u5947\u5e7b\u7cbe\u70bc\u788e\u7247",
                "/items/acrobats_ribbon": "\u6742\u6280\u5e08\u5f69\u5e26",
                "/items/magicians_cloth": "\u9b54\u672f\u5e08\u7ec7\u7269",
                "/items/chaotic_chain": "\u6df7\u6c8c\u9501\u94fe",
                "/items/cursed_ball": "\u8bc5\u5492\u4e4b\u7403",
                "/items/sinister_refinement_shard": "\u9634\u68ee\u7cbe\u70bc\u788e\u7247",
                "/items/royal_cloth": "\u7687\u5bb6\u7ec7\u7269",
                "/items/knights_ingot": "\u9a91\u58eb\u4e4b\u952d",
                "/items/bishops_scroll": "\u4e3b\u6559\u5377\u8f74",
                "/items/regal_jewel": "\u541b\u738b\u5b9d\u77f3",
                "/items/sundering_jewel": "\u88c2\u7a7a\u5b9d\u77f3",
                "/items/enchanted_refinement_shard": "\u79d8\u6cd5\u7cbe\u70bc\u788e\u7247",
                "/items/marksman_brooch": "\u795e\u5c04\u80f8\u9488",
                "/items/corsair_crest": "\u63a0\u593a\u8005\u5fbd\u7ae0",
                "/items/damaged_anchor": "\u7834\u635f\u8239\u951a",
                "/items/maelstrom_plating": "\u6012\u6d9b\u7532\u7247",
                "/items/kraken_leather": "\u514b\u62c9\u80af\u76ae\u9769",
                "/items/kraken_fang": "\u514b\u62c9\u80af\u4e4b\u7259",
                "/items/pirate_refinement_shard": "\u6d77\u76d7\u7cbe\u70bc\u788e\u7247",
                "/items/pathbreaker_lodestone": "\u5f00\u8def\u8005\u78c1\u77f3",
                "/items/pathfinder_lodestone": "\u63a2\u8def\u8005\u78c1\u77f3",
                "/items/pathseeker_lodestone": "\u5bfb\u8def\u8005\u78c1\u77f3",
                "/items/labyrinth_refinement_shard": "\u8ff7\u5bab\u7cbe\u70bc\u788e\u7247",
                "/items/butter_of_proficiency": "\u7cbe\u901a\u4e4b\u6cb9",
                "/items/thread_of_expertise": "\u4e13\u7cbe\u4e4b\u7ebf",
                "/items/branch_of_insight": "\u6d1e\u5bdf\u4e4b\u679d",
                "/items/gluttonous_energy": "\u8d2a\u98df\u80fd\u91cf",
                "/items/guzzling_energy": "\u66b4\u996e\u80fd\u91cf",
                "/items/milking_essence": "\u6324\u5976\u7cbe\u534e",
                "/items/foraging_essence": "\u91c7\u6458\u7cbe\u534e",
                "/items/woodcutting_essence": "\u4f10\u6728\u7cbe\u534e",
                "/items/cheesesmithing_essence": "\u5976\u916a\u953b\u9020\u7cbe\u534e",
                "/items/crafting_essence": "\u5236\u4f5c\u7cbe\u534e",
                "/items/tailoring_essence": "\u7f1d\u7eab\u7cbe\u534e",
                "/items/cooking_essence": "\u70f9\u996a\u7cbe\u534e",
                "/items/brewing_essence": "\u51b2\u6ce1\u7cbe\u534e",
                "/items/alchemy_essence": "\u70bc\u91d1\u7cbe\u534e",
                "/items/enhancing_essence": "\u5f3a\u5316\u7cbe\u534e",
                "/items/swamp_essence": "\u6cbc\u6cfd\u7cbe\u534e",
                "/items/aqua_essence": "\u6d77\u6d0b\u7cbe\u534e",
                "/items/jungle_essence": "\u4e1b\u6797\u7cbe\u534e",
                "/items/gobo_essence": "\u54e5\u5e03\u6797\u7cbe\u534e",
                "/items/eyessence": "\u773c\u7cbe\u534e",
                "/items/sorcerer_essence": "\u6cd5\u5e08\u7cbe\u534e",
                "/items/bear_essence": "\u718a\u718a\u7cbe\u534e",
                "/items/golem_essence": "\u9b54\u50cf\u7cbe\u534e",
                "/items/twilight_essence": "\u66ae\u5149\u7cbe\u534e",
                "/items/abyssal_essence": "\u5730\u72f1\u7cbe\u534e",
                "/items/chimerical_essence": "\u5947\u5e7b\u7cbe\u534e",
                "/items/sinister_essence": "\u9634\u68ee\u7cbe\u534e",
                "/items/enchanted_essence": "\u79d8\u6cd5\u7cbe\u534e",
                "/items/pirate_essence": "\u6d77\u76d7\u7cbe\u534e",
                "/items/labyrinth_essence": "\u8ff7\u5bab\u7cbe\u534e",
                "/items/task_crystal": "\u4efb\u52a1\u6c34\u6676",
                "/items/star_fragment": "\u661f\u5149\u788e\u7247",
                "/items/pearl": "\u73cd\u73e0",
                "/items/amber": "\u7425\u73c0",
                "/items/garnet": "\u77f3\u69b4\u77f3",
                "/items/jade": "\u7fe1\u7fe0",
                "/items/amethyst": "\u7d2b\u6c34\u6676",
                "/items/moonstone": "\u6708\u4eae\u77f3",
                "/items/sunstone": "\u592a\u9633\u77f3",
                "/items/philosophers_stone": "\u8d24\u8005\u4e4b\u77f3",
                "/items/crushed_pearl": "\u73cd\u73e0\u788e\u7247",
                "/items/crushed_amber": "\u7425\u73c0\u788e\u7247",
                "/items/crushed_garnet": "\u77f3\u69b4\u77f3\u788e\u7247",
                "/items/crushed_jade": "\u7fe1\u7fe0\u788e\u7247",
                "/items/crushed_amethyst": "\u7d2b\u6c34\u6676\u788e\u7247",
                "/items/crushed_moonstone": "\u6708\u4eae\u77f3\u788e\u7247",
                "/items/crushed_sunstone": "\u592a\u9633\u77f3\u788e\u7247",
                "/items/crushed_philosophers_stone": "\u8d24\u8005\u4e4b\u77f3\u788e\u7247",
                "/items/shard_of_protection": "\u4fdd\u62a4\u788e\u7247",
                "/items/mirror_of_protection": "\u4fdd\u62a4\u4e4b\u955c",
                "/items/philosophers_mirror": "\u8d24\u8005\u4e4b\u955c",
                "/items/basic_torch": "\u57fa\u7840\u706b\u628a",
                "/items/advanced_torch": "\u8fdb\u9636\u706b\u628a",
                "/items/expert_torch": "\u4e13\u5bb6\u706b\u628a",
                "/items/basic_shroud": "\u57fa\u7840\u6597\u7bf7",
                "/items/advanced_shroud": "\u8fdb\u9636\u6597\u7bf7",
                "/items/expert_shroud": "\u4e13\u5bb6\u6597\u7bf7",
                "/items/basic_beacon": "\u57fa\u7840\u63a2\u7167\u706f",
                "/items/advanced_beacon": "\u8fdb\u9636\u63a2\u7167\u706f",
                "/items/expert_beacon": "\u4e13\u5bb6\u63a2\u7167\u706f",
                "/items/basic_food_crate": "\u57fa\u7840\u98df\u7269\u7bb1",
                "/items/advanced_food_crate": "\u8fdb\u9636\u98df\u7269\u7bb1",
                "/items/expert_food_crate": "\u4e13\u5bb6\u98df\u7269\u7bb1",
                "/items/basic_tea_crate": "\u57fa\u7840\u8336\u53f6\u7bb1",
                "/items/advanced_tea_crate": "\u8fdb\u9636\u8336\u53f6\u7bb1",
                "/items/expert_tea_crate": "\u4e13\u5bb6\u8336\u53f6\u7bb1",
                "/items/basic_coffee_crate": "\u57fa\u7840\u5496\u5561\u7bb1",
                "/items/advanced_coffee_crate": "\u8fdb\u9636\u5496\u5561\u7bb1",
                "/items/expert_coffee_crate": "\u4e13\u5bb6\u5496\u5561\u7bb1",
    
                "/actions/milking/cow": "\u5976\u725b",
                "/actions/milking/verdant_cow": "\u7fe0\u7eff\u5976\u725b",
                "/actions/milking/azure_cow": "\u851a\u84dd\u5976\u725b",
                "/actions/milking/burble_cow": "\u6df1\u7d2b\u5976\u725b",
                "/actions/milking/crimson_cow": "\u7edb\u7ea2\u5976\u725b",
                "/actions/milking/unicow": "\u5f69\u8679\u5976\u725b",
                "/actions/milking/holy_cow": "\u795e\u5723\u5976\u725b",
                "/actions/foraging/egg": "\u9e21\u86cb",
                "/actions/foraging/wheat": "\u5c0f\u9ea6",
                "/actions/foraging/sugar": "\u7cd6",
                "/actions/foraging/cotton": "\u68c9\u82b1",
                "/actions/foraging/farmland": "\u7fe0\u91ce\u519c\u573a",
                "/actions/foraging/blueberry": "\u84dd\u8393",
                "/actions/foraging/apple": "\u82f9\u679c",
                "/actions/foraging/arabica_coffee_bean": "\u4f4e\u7ea7\u5496\u5561\u8c46",
                "/actions/foraging/flax": "\u4e9a\u9ebb",
                "/actions/foraging/shimmering_lake": "\u6ce2\u5149\u6e56\u6cca",
                "/actions/foraging/blackberry": "\u9ed1\u8393",
                "/actions/foraging/orange": "\u6a59\u5b50",
                "/actions/foraging/robusta_coffee_bean": "\u4e2d\u7ea7\u5496\u5561\u8c46",
                "/actions/foraging/misty_forest": "\u8ff7\u96fe\u68ee\u6797",
                "/actions/foraging/strawberry": "\u8349\u8393",
                "/actions/foraging/plum": "\u674e\u5b50",
                "/actions/foraging/liberica_coffee_bean": "\u9ad8\u7ea7\u5496\u5561\u8c46",
                "/actions/foraging/bamboo_branch": "\u7af9\u5b50",
                "/actions/foraging/burble_beach": "\u6df1\u7d2b\u6c99\u6ee9",
                "/actions/foraging/mooberry": "\u54de\u8393",
                "/actions/foraging/peach": "\u6843\u5b50",
                "/actions/foraging/excelsa_coffee_bean": "\u7279\u7ea7\u5496\u5561\u8c46",
                "/actions/foraging/cocoon": "\u8695\u8327",
                "/actions/foraging/silly_cow_valley": "\u50bb\u725b\u5c71\u8c37",
                "/actions/foraging/marsberry": "\u706b\u661f\u8393",
                "/actions/foraging/dragon_fruit": "\u706b\u9f99\u679c",
                "/actions/foraging/fieriosa_coffee_bean": "\u706b\u5c71\u5496\u5561\u8c46",
                "/actions/foraging/olympus_mons": "\u5965\u6797\u5339\u65af\u5c71",
                "/actions/foraging/spaceberry": "\u592a\u7a7a\u8393",
                "/actions/foraging/star_fruit": "\u6768\u6843",
                "/actions/foraging/spacia_coffee_bean": "\u592a\u7a7a\u5496\u5561\u8c46",
                "/actions/foraging/radiant_fiber": "\u5149\u8f89\u7ea4\u7ef4",
                "/actions/foraging/asteroid_belt": "\u5c0f\u884c\u661f\u5e26",
                "/actions/woodcutting/tree": "\u6811",
                "/actions/woodcutting/birch_tree": "\u6866\u6811",
                "/actions/woodcutting/cedar_tree": "\u96ea\u677e\u6811",
                "/actions/woodcutting/purpleheart_tree": "\u7d2b\u5fc3\u6811",
                "/actions/woodcutting/ginkgo_tree": "\u94f6\u674f\u6811",
                "/actions/woodcutting/redwood_tree": "\u7ea2\u6749\u6811",
                "/actions/woodcutting/arcane_tree": "\u5965\u79d8\u6811",
                "/actions/cheesesmithing/cheese": "\u5976\u916a",
                "/actions/cheesesmithing/cheese_boots": "\u5976\u916a\u9774",
                "/actions/cheesesmithing/cheese_gauntlets": "\u5976\u916a\u62a4\u624b",
                "/actions/cheesesmithing/cheese_sword": "\u5976\u916a\u5251",
                "/actions/cheesesmithing/cheese_brush": "\u5976\u916a\u5237\u5b50",
                "/actions/cheesesmithing/cheese_shears": "\u5976\u916a\u526a\u5200",
                "/actions/cheesesmithing/cheese_hatchet": "\u5976\u916a\u65a7\u5934",
                "/actions/cheesesmithing/cheese_spear": "\u5976\u916a\u957f\u67aa",
                "/actions/cheesesmithing/cheese_hammer": "\u5976\u916a\u9524\u5b50",
                "/actions/cheesesmithing/cheese_chisel": "\u5976\u916a\u51ff\u5b50",
                "/actions/cheesesmithing/cheese_needle": "\u5976\u916a\u9488",
                "/actions/cheesesmithing/cheese_spatula": "\u5976\u916a\u9505\u94f2",
                "/actions/cheesesmithing/cheese_pot": "\u5976\u916a\u58f6",
                "/actions/cheesesmithing/cheese_mace": "\u5976\u916a\u9489\u5934\u9524",
                "/actions/cheesesmithing/cheese_alembic": "\u5976\u916a\u84b8\u998f\u5668",
                "/actions/cheesesmithing/cheese_enhancer": "\u5976\u916a\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/cheese_helmet": "\u5976\u916a\u5934\u76d4",
                "/actions/cheesesmithing/cheese_buckler": "\u5976\u916a\u5706\u76fe",
                "/actions/cheesesmithing/cheese_bulwark": "\u5976\u916a\u91cd\u76fe",
                "/actions/cheesesmithing/cheese_plate_legs": "\u5976\u916a\u817f\u7532",
                "/actions/cheesesmithing/cheese_plate_body": "\u5976\u916a\u80f8\u7532",
                "/actions/cheesesmithing/verdant_cheese": "\u7fe0\u7eff\u5976\u916a",
                "/actions/cheesesmithing/verdant_boots": "\u7fe0\u7eff\u9774",
                "/actions/cheesesmithing/verdant_gauntlets": "\u7fe0\u7eff\u62a4\u624b",
                "/actions/cheesesmithing/verdant_sword": "\u7fe0\u7eff\u5251",
                "/actions/cheesesmithing/verdant_brush": "\u7fe0\u7eff\u5237\u5b50",
                "/actions/cheesesmithing/verdant_shears": "\u7fe0\u7eff\u526a\u5200",
                "/actions/cheesesmithing/verdant_hatchet": "\u7fe0\u7eff\u65a7\u5934",
                "/actions/cheesesmithing/verdant_spear": "\u7fe0\u7eff\u957f\u67aa",
                "/actions/cheesesmithing/verdant_hammer": "\u7fe0\u7eff\u9524\u5b50",
                "/actions/cheesesmithing/verdant_chisel": "\u7fe0\u7eff\u51ff\u5b50",
                "/actions/cheesesmithing/verdant_needle": "\u7fe0\u7eff\u9488",
                "/actions/cheesesmithing/verdant_spatula": "\u7fe0\u7eff\u9505\u94f2",
                "/actions/cheesesmithing/verdant_pot": "\u7fe0\u7eff\u58f6",
                "/actions/cheesesmithing/verdant_mace": "\u7fe0\u7eff\u9489\u5934\u9524",
                "/actions/cheesesmithing/snake_fang_dirk": "\u86c7\u7259\u77ed\u5251",
                "/actions/cheesesmithing/verdant_alembic": "\u7fe0\u7eff\u84b8\u998f\u5668",
                "/actions/cheesesmithing/verdant_enhancer": "\u7fe0\u7eff\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/verdant_helmet": "\u7fe0\u7eff\u5934\u76d4",
                "/actions/cheesesmithing/verdant_buckler": "\u7fe0\u7eff\u5706\u76fe",
                "/actions/cheesesmithing/verdant_bulwark": "\u7fe0\u7eff\u91cd\u76fe",
                "/actions/cheesesmithing/verdant_plate_legs": "\u7fe0\u7eff\u817f\u7532",
                "/actions/cheesesmithing/verdant_plate_body": "\u7fe0\u7eff\u80f8\u7532",
                "/actions/cheesesmithing/azure_cheese": "\u851a\u84dd\u5976\u916a",
                "/actions/cheesesmithing/azure_boots": "\u851a\u84dd\u9774",
                "/actions/cheesesmithing/azure_gauntlets": "\u851a\u84dd\u62a4\u624b",
                "/actions/cheesesmithing/azure_sword": "\u851a\u84dd\u5251",
                "/actions/cheesesmithing/azure_brush": "\u851a\u84dd\u5237\u5b50",
                "/actions/cheesesmithing/azure_shears": "\u851a\u84dd\u526a\u5200",
                "/actions/cheesesmithing/azure_hatchet": "\u851a\u84dd\u65a7\u5934",
                "/actions/cheesesmithing/azure_spear": "\u851a\u84dd\u957f\u67aa",
                "/actions/cheesesmithing/azure_hammer": "\u851a\u84dd\u9524\u5b50",
                "/actions/cheesesmithing/azure_chisel": "\u851a\u84dd\u51ff\u5b50",
                "/actions/cheesesmithing/azure_needle": "\u851a\u84dd\u9488",
                "/actions/cheesesmithing/azure_spatula": "\u851a\u84dd\u9505\u94f2",
                "/actions/cheesesmithing/azure_pot": "\u851a\u84dd\u58f6",
                "/actions/cheesesmithing/azure_mace": "\u851a\u84dd\u9489\u5934\u9524",
                "/actions/cheesesmithing/pincer_gloves": "\u87f9\u94b3\u624b\u5957",
                "/actions/cheesesmithing/azure_alembic": "\u851a\u84dd\u84b8\u998f\u5668",
                "/actions/cheesesmithing/azure_enhancer": "\u851a\u84dd\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/azure_helmet": "\u851a\u84dd\u5934\u76d4",
                "/actions/cheesesmithing/azure_buckler": "\u851a\u84dd\u5706\u76fe",
                "/actions/cheesesmithing/azure_bulwark": "\u851a\u84dd\u91cd\u76fe",
                "/actions/cheesesmithing/azure_plate_legs": "\u851a\u84dd\u817f\u7532",
                "/actions/cheesesmithing/snail_shell_helmet": "\u8717\u725b\u58f3\u5934\u76d4",
                "/actions/cheesesmithing/azure_plate_body": "\u851a\u84dd\u80f8\u7532",
                "/actions/cheesesmithing/turtle_shell_legs": "\u9f9f\u58f3\u817f\u7532",
                "/actions/cheesesmithing/turtle_shell_body": "\u9f9f\u58f3\u80f8\u7532",
                "/actions/cheesesmithing/burble_cheese": "\u6df1\u7d2b\u5976\u916a",
                "/actions/cheesesmithing/burble_boots": "\u6df1\u7d2b\u9774",
                "/actions/cheesesmithing/burble_gauntlets": "\u6df1\u7d2b\u62a4\u624b",
                "/actions/cheesesmithing/burble_sword": "\u6df1\u7d2b\u5251",
                "/actions/cheesesmithing/burble_brush": "\u6df1\u7d2b\u5237\u5b50",
                "/actions/cheesesmithing/burble_shears": "\u6df1\u7d2b\u526a\u5200",
                "/actions/cheesesmithing/burble_hatchet": "\u6df1\u7d2b\u65a7\u5934",
                "/actions/cheesesmithing/burble_spear": "\u6df1\u7d2b\u957f\u67aa",
                "/actions/cheesesmithing/burble_hammer": "\u6df1\u7d2b\u9524\u5b50",
                "/actions/cheesesmithing/burble_chisel": "\u6df1\u7d2b\u51ff\u5b50",
                "/actions/cheesesmithing/burble_needle": "\u6df1\u7d2b\u9488",
                "/actions/cheesesmithing/burble_spatula": "\u6df1\u7d2b\u9505\u94f2",
                "/actions/cheesesmithing/burble_pot": "\u6df1\u7d2b\u58f6",
                "/actions/cheesesmithing/burble_mace": "\u6df1\u7d2b\u9489\u5934\u9524",
                "/actions/cheesesmithing/burble_alembic": "\u6df1\u7d2b\u84b8\u998f\u5668",
                "/actions/cheesesmithing/burble_enhancer": "\u6df1\u7d2b\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/burble_helmet": "\u6df1\u7d2b\u5934\u76d4",
                "/actions/cheesesmithing/burble_buckler": "\u6df1\u7d2b\u5706\u76fe",
                "/actions/cheesesmithing/burble_bulwark": "\u6df1\u7d2b\u91cd\u76fe",
                "/actions/cheesesmithing/burble_plate_legs": "\u6df1\u7d2b\u817f\u7532",
                "/actions/cheesesmithing/burble_plate_body": "\u6df1\u7d2b\u80f8\u7532",
                "/actions/cheesesmithing/crimson_cheese": "\u7edb\u7ea2\u5976\u916a",
                "/actions/cheesesmithing/crimson_boots": "\u7edb\u7ea2\u9774",
                "/actions/cheesesmithing/crimson_gauntlets": "\u7edb\u7ea2\u62a4\u624b",
                "/actions/cheesesmithing/crimson_sword": "\u7edb\u7ea2\u5251",
                "/actions/cheesesmithing/crimson_brush": "\u7edb\u7ea2\u5237\u5b50",
                "/actions/cheesesmithing/crimson_shears": "\u7edb\u7ea2\u526a\u5200",
                "/actions/cheesesmithing/crimson_hatchet": "\u7edb\u7ea2\u65a7\u5934",
                "/actions/cheesesmithing/crimson_spear": "\u7edb\u7ea2\u957f\u67aa",
                "/actions/cheesesmithing/crimson_hammer": "\u7edb\u7ea2\u9524\u5b50",
                "/actions/cheesesmithing/crimson_chisel": "\u7edb\u7ea2\u51ff\u5b50",
                "/actions/cheesesmithing/crimson_needle": "\u7edb\u7ea2\u9488",
                "/actions/cheesesmithing/crimson_spatula": "\u7edb\u7ea2\u9505\u94f2",
                "/actions/cheesesmithing/crimson_pot": "\u7edb\u7ea2\u58f6",
                "/actions/cheesesmithing/crimson_mace": "\u7edb\u7ea2\u9489\u5934\u9524",
                "/actions/cheesesmithing/crimson_alembic": "\u7edb\u7ea2\u84b8\u998f\u5668",
                "/actions/cheesesmithing/crimson_enhancer": "\u7edb\u7ea2\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/crimson_helmet": "\u7edb\u7ea2\u5934\u76d4",
                "/actions/cheesesmithing/crimson_buckler": "\u7edb\u7ea2\u5706\u76fe",
                "/actions/cheesesmithing/crimson_bulwark": "\u7edb\u7ea2\u91cd\u76fe",
                "/actions/cheesesmithing/crimson_plate_legs": "\u7edb\u7ea2\u817f\u7532",
                "/actions/cheesesmithing/vision_helmet": "\u89c6\u89c9\u5934\u76d4",
                "/actions/cheesesmithing/vision_shield": "\u89c6\u89c9\u76fe",
                "/actions/cheesesmithing/crimson_plate_body": "\u7edb\u7ea2\u80f8\u7532",
                "/actions/cheesesmithing/rainbow_cheese": "\u5f69\u8679\u5976\u916a",
                "/actions/cheesesmithing/rainbow_boots": "\u5f69\u8679\u9774",
                "/actions/cheesesmithing/black_bear_shoes": "\u9ed1\u718a\u978b",
                "/actions/cheesesmithing/grizzly_bear_shoes": "\u68d5\u718a\u978b",
                "/actions/cheesesmithing/polar_bear_shoes": "\u5317\u6781\u718a\u978b",
                "/actions/cheesesmithing/rainbow_gauntlets": "\u5f69\u8679\u62a4\u624b",
                "/actions/cheesesmithing/rainbow_sword": "\u5f69\u8679\u5251",
                "/actions/cheesesmithing/panda_gloves": "\u718a\u732b\u624b\u5957",
                "/actions/cheesesmithing/rainbow_brush": "\u5f69\u8679\u5237\u5b50",
                "/actions/cheesesmithing/rainbow_shears": "\u5f69\u8679\u526a\u5200",
                "/actions/cheesesmithing/rainbow_hatchet": "\u5f69\u8679\u65a7\u5934",
                "/actions/cheesesmithing/rainbow_spear": "\u5f69\u8679\u957f\u67aa",
                "/actions/cheesesmithing/rainbow_hammer": "\u5f69\u8679\u9524\u5b50",
                "/actions/cheesesmithing/rainbow_chisel": "\u5f69\u8679\u51ff\u5b50",
                "/actions/cheesesmithing/rainbow_needle": "\u5f69\u8679\u9488",
                "/actions/cheesesmithing/rainbow_spatula": "\u5f69\u8679\u9505\u94f2",
                "/actions/cheesesmithing/rainbow_pot": "\u5f69\u8679\u58f6",
                "/actions/cheesesmithing/rainbow_mace": "\u5f69\u8679\u9489\u5934\u9524",
                "/actions/cheesesmithing/rainbow_alembic": "\u5f69\u8679\u84b8\u998f\u5668",
                "/actions/cheesesmithing/rainbow_enhancer": "\u5f69\u8679\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/rainbow_helmet": "\u5f69\u8679\u5934\u76d4",
                "/actions/cheesesmithing/rainbow_buckler": "\u5f69\u8679\u5706\u76fe",
                "/actions/cheesesmithing/rainbow_bulwark": "\u5f69\u8679\u91cd\u76fe",
                "/actions/cheesesmithing/rainbow_plate_legs": "\u5f69\u8679\u817f\u7532",
                "/actions/cheesesmithing/rainbow_plate_body": "\u5f69\u8679\u80f8\u7532",
                "/actions/cheesesmithing/holy_cheese": "\u795e\u5723\u5976\u916a",
                "/actions/cheesesmithing/holy_boots": "\u795e\u5723\u9774",
                "/actions/cheesesmithing/holy_gauntlets": "\u795e\u5723\u62a4\u624b",
                "/actions/cheesesmithing/holy_sword": "\u795e\u5723\u5251",
                "/actions/cheesesmithing/holy_brush": "\u795e\u5723\u5237\u5b50",
                "/actions/cheesesmithing/holy_shears": "\u795e\u5723\u526a\u5200",
                "/actions/cheesesmithing/holy_hatchet": "\u795e\u5723\u65a7\u5934",
                "/actions/cheesesmithing/holy_spear": "\u795e\u5723\u957f\u67aa",
                "/actions/cheesesmithing/holy_hammer": "\u795e\u5723\u9524\u5b50",
                "/actions/cheesesmithing/holy_chisel": "\u795e\u5723\u51ff\u5b50",
                "/actions/cheesesmithing/holy_needle": "\u795e\u5723\u9488",
                "/actions/cheesesmithing/holy_spatula": "\u795e\u5723\u9505\u94f2",
                "/actions/cheesesmithing/holy_pot": "\u795e\u5723\u58f6",
                "/actions/cheesesmithing/holy_mace": "\u795e\u5723\u9489\u5934\u9524",
                "/actions/cheesesmithing/magnetic_gloves": "\u78c1\u529b\u624b\u5957",
                "/actions/cheesesmithing/stalactite_spear": "\u77f3\u949f\u957f\u67aa",
                "/actions/cheesesmithing/granite_bludgeon": "\u82b1\u5c97\u5ca9\u5927\u68d2",
                "/actions/cheesesmithing/vampire_fang_dirk": "\u5438\u8840\u9b3c\u77ed\u5251",
                "/actions/cheesesmithing/werewolf_slasher": "\u72fc\u4eba\u5173\u5200",
                "/actions/cheesesmithing/holy_alembic": "\u795e\u5723\u84b8\u998f\u5668",
                "/actions/cheesesmithing/holy_enhancer": "\u795e\u5723\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/holy_helmet": "\u795e\u5723\u5934\u76d4",
                "/actions/cheesesmithing/holy_buckler": "\u795e\u5723\u5706\u76fe",
                "/actions/cheesesmithing/holy_bulwark": "\u795e\u5723\u91cd\u76fe",
                "/actions/cheesesmithing/holy_plate_legs": "\u795e\u5723\u817f\u7532",
                "/actions/cheesesmithing/holy_plate_body": "\u795e\u5723\u80f8\u7532",
                "/actions/cheesesmithing/celestial_brush": "\u661f\u7a7a\u5237\u5b50",
                "/actions/cheesesmithing/celestial_shears": "\u661f\u7a7a\u526a\u5200",
                "/actions/cheesesmithing/celestial_hatchet": "\u661f\u7a7a\u65a7\u5934",
                "/actions/cheesesmithing/celestial_hammer": "\u661f\u7a7a\u9524\u5b50",
                "/actions/cheesesmithing/celestial_chisel": "\u661f\u7a7a\u51ff\u5b50",
                "/actions/cheesesmithing/celestial_needle": "\u661f\u7a7a\u9488",
                "/actions/cheesesmithing/celestial_spatula": "\u661f\u7a7a\u9505\u94f2",
                "/actions/cheesesmithing/celestial_pot": "\u661f\u7a7a\u58f6",
                "/actions/cheesesmithing/celestial_alembic": "\u661f\u7a7a\u84b8\u998f\u5668",
                "/actions/cheesesmithing/celestial_enhancer": "\u661f\u7a7a\u5f3a\u5316\u5668",
                "/actions/cheesesmithing/colossus_plate_body": "\u5de8\u50cf\u80f8\u7532",
                "/actions/cheesesmithing/colossus_plate_legs": "\u5de8\u50cf\u817f\u7532",
                "/actions/cheesesmithing/demonic_plate_body": "\u6076\u9b54\u80f8\u7532",
                "/actions/cheesesmithing/demonic_plate_legs": "\u6076\u9b54\u817f\u7532",
                "/actions/cheesesmithing/spiked_bulwark": "\u5c16\u523a\u91cd\u76fe",
                "/actions/cheesesmithing/dodocamel_gauntlets": "\u6e21\u6e21\u9a7c\u62a4\u624b",
                "/actions/cheesesmithing/corsair_helmet": "\u63a0\u593a\u8005\u5934\u76d4",
                "/actions/cheesesmithing/knights_aegis": "\u9a91\u58eb\u76fe",
                "/actions/cheesesmithing/anchorbound_plate_legs": "\u951a\u5b9a\u817f\u7532",
                "/actions/cheesesmithing/maelstrom_plate_legs": "\u6012\u6d9b\u817f\u7532",
                "/actions/cheesesmithing/griffin_bulwark": "\u72ee\u9e6b\u91cd\u76fe",
                "/actions/cheesesmithing/furious_spear": "\u72c2\u6012\u957f\u67aa",
                "/actions/cheesesmithing/chaotic_flail": "\u6df7\u6c8c\u8fde\u67b7",
                "/actions/cheesesmithing/regal_sword": "\u541b\u738b\u4e4b\u5251",
                "/actions/cheesesmithing/anchorbound_plate_body": "\u951a\u5b9a\u80f8\u7532",
                "/actions/cheesesmithing/maelstrom_plate_body": "\u6012\u6d9b\u80f8\u7532",
                "/actions/cheesesmithing/dodocamel_gauntlets_refined": "\u6e21\u6e21\u9a7c\u62a4\u624b\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/corsair_helmet_refined": "\u63a0\u593a\u8005\u5934\u76d4\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/knights_aegis_refined": "\u9a91\u58eb\u76fe\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/anchorbound_plate_legs_refined": "\u951a\u5b9a\u817f\u7532\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/maelstrom_plate_legs_refined": "\u6012\u6d9b\u817f\u7532\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/griffin_bulwark_refined": "\u72ee\u9e6b\u91cd\u76fe\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/furious_spear_refined": "\u72c2\u6012\u957f\u67aa\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/chaotic_flail_refined": "\u6df7\u6c8c\u8fde\u67b7\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/regal_sword_refined": "\u541b\u738b\u4e4b\u5251\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/anchorbound_plate_body_refined": "\u951a\u5b9a\u80f8\u7532\uff08\u7cbe\uff09",
                "/actions/cheesesmithing/maelstrom_plate_body_refined": "\u6012\u6d9b\u80f8\u7532\uff08\u7cbe\uff09",
                "/actions/crafting/lumber": "\u6728\u677f",
                "/actions/crafting/wooden_crossbow": "\u6728\u5f29",
                "/actions/crafting/wooden_water_staff": "\u6728\u5236\u6c34\u6cd5\u6756",
                "/actions/crafting/basic_task_badge": "\u57fa\u7840\u4efb\u52a1\u5fbd\u7ae0",
                "/actions/crafting/advanced_task_badge": "\u9ad8\u7ea7\u4efb\u52a1\u5fbd\u7ae0",
                "/actions/crafting/expert_task_badge": "\u4e13\u5bb6\u4efb\u52a1\u5fbd\u7ae0",
                "/actions/crafting/wooden_shield": "\u6728\u76fe",
                "/actions/crafting/wooden_nature_staff": "\u6728\u5236\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/wooden_bow": "\u6728\u5f13",
                "/actions/crafting/wooden_fire_staff": "\u6728\u5236\u706b\u6cd5\u6756",
                "/actions/crafting/birch_lumber": "\u767d\u6866\u6728\u677f",
                "/actions/crafting/birch_crossbow": "\u6866\u6728\u5f29",
                "/actions/crafting/birch_water_staff": "\u6866\u6728\u6c34\u6cd5\u6756",
                "/actions/crafting/crushed_pearl": "\u73cd\u73e0\u788e\u7247",
                "/actions/crafting/birch_shield": "\u6866\u6728\u76fe",
                "/actions/crafting/birch_nature_staff": "\u6866\u6728\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/birch_bow": "\u6866\u6728\u5f13",
                "/actions/crafting/ring_of_gathering": "\u91c7\u96c6\u6212\u6307",
                "/actions/crafting/birch_fire_staff": "\u6866\u6728\u706b\u6cd5\u6756",
                "/actions/crafting/earrings_of_gathering": "\u91c7\u96c6\u8033\u73af",
                "/actions/crafting/cedar_lumber": "\u96ea\u677e\u6728\u677f",
                "/actions/crafting/cedar_crossbow": "\u96ea\u677e\u5f29",
                "/actions/crafting/cedar_water_staff": "\u96ea\u677e\u6c34\u6cd5\u6756",
                "/actions/crafting/basic_milking_charm": "\u57fa\u7840\u6324\u5976\u62a4\u7b26",
                "/actions/crafting/basic_foraging_charm": "\u57fa\u7840\u91c7\u6458\u62a4\u7b26",
                "/actions/crafting/basic_woodcutting_charm": "\u57fa\u7840\u4f10\u6728\u62a4\u7b26",
                "/actions/crafting/basic_cheesesmithing_charm": "\u57fa\u7840\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/actions/crafting/basic_crafting_charm": "\u57fa\u7840\u5236\u4f5c\u62a4\u7b26",
                "/actions/crafting/basic_tailoring_charm": "\u57fa\u7840\u7f1d\u7eab\u62a4\u7b26",
                "/actions/crafting/basic_cooking_charm": "\u57fa\u7840\u70f9\u996a\u62a4\u7b26",
                "/actions/crafting/basic_brewing_charm": "\u57fa\u7840\u917f\u9020\u62a4\u7b26",
                "/actions/crafting/basic_alchemy_charm": "\u57fa\u7840\u70bc\u91d1\u62a4\u7b26",
                "/actions/crafting/basic_enhancing_charm": "\u57fa\u7840\u5f3a\u5316\u62a4\u7b26",
                "/actions/crafting/cedar_shield": "\u96ea\u677e\u76fe",
                "/actions/crafting/cedar_nature_staff": "\u96ea\u677e\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/cedar_bow": "\u96ea\u677e\u5f13",
                "/actions/crafting/crushed_amber": "\u7425\u73c0\u788e\u7247",
                "/actions/crafting/cedar_fire_staff": "\u96ea\u677e\u706b\u6cd5\u6756",
                "/actions/crafting/ring_of_essence_find": "\u7cbe\u534e\u53d1\u73b0\u6212\u6307",
                "/actions/crafting/earrings_of_essence_find": "\u7cbe\u534e\u53d1\u73b0\u8033\u73af",
                "/actions/crafting/necklace_of_efficiency": "\u6548\u7387\u9879\u94fe",
                "/actions/crafting/purpleheart_lumber": "\u7d2b\u5fc3\u6728\u677f",
                "/actions/crafting/purpleheart_crossbow": "\u7d2b\u5fc3\u5f29",
                "/actions/crafting/purpleheart_water_staff": "\u7d2b\u5fc3\u6c34\u6cd5\u6756",
                "/actions/crafting/purpleheart_shield": "\u7d2b\u5fc3\u76fe",
                "/actions/crafting/purpleheart_nature_staff": "\u7d2b\u5fc3\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/purpleheart_bow": "\u7d2b\u5fc3\u5f13",
                "/actions/crafting/advanced_milking_charm": "\u9ad8\u7ea7\u6324\u5976\u62a4\u7b26",
                "/actions/crafting/advanced_foraging_charm": "\u9ad8\u7ea7\u91c7\u6458\u62a4\u7b26",
                "/actions/crafting/advanced_woodcutting_charm": "\u9ad8\u7ea7\u4f10\u6728\u62a4\u7b26",
                "/actions/crafting/advanced_cheesesmithing_charm": "\u9ad8\u7ea7\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/actions/crafting/advanced_crafting_charm": "\u9ad8\u7ea7\u5236\u4f5c\u62a4\u7b26",
                "/actions/crafting/advanced_tailoring_charm": "\u9ad8\u7ea7\u7f1d\u7eab\u62a4\u7b26",
                "/actions/crafting/advanced_cooking_charm": "\u9ad8\u7ea7\u70f9\u996a\u62a4\u7b26",
                "/actions/crafting/advanced_brewing_charm": "\u9ad8\u7ea7\u917f\u9020\u62a4\u7b26",
                "/actions/crafting/advanced_alchemy_charm": "\u9ad8\u7ea7\u70bc\u91d1\u62a4\u7b26",
                "/actions/crafting/advanced_enhancing_charm": "\u9ad8\u7ea7\u5f3a\u5316\u62a4\u7b26",
                "/actions/crafting/advanced_stamina_charm": "\u9ad8\u7ea7\u8010\u529b\u62a4\u7b26",
                "/actions/crafting/advanced_intelligence_charm": "\u9ad8\u7ea7\u667a\u529b\u62a4\u7b26",
                "/actions/crafting/advanced_attack_charm": "\u9ad8\u7ea7\u653b\u51fb\u62a4\u7b26",
                "/actions/crafting/advanced_defense_charm": "\u9ad8\u7ea7\u9632\u5fa1\u62a4\u7b26",
                "/actions/crafting/advanced_melee_charm": "\u9ad8\u7ea7\u8fd1\u6218\u62a4\u7b26",
                "/actions/crafting/advanced_ranged_charm": "\u9ad8\u7ea7\u8fdc\u7a0b\u62a4\u7b26",
                "/actions/crafting/advanced_magic_charm": "\u9ad8\u7ea7\u9b54\u6cd5\u62a4\u7b26",
                "/actions/crafting/crushed_garnet": "\u77f3\u69b4\u77f3\u788e\u7247",
                "/actions/crafting/crushed_jade": "\u7fe1\u7fe0\u788e\u7247",
                "/actions/crafting/crushed_amethyst": "\u7d2b\u6c34\u6676\u788e\u7247",
                "/actions/crafting/catalyst_of_coinification": "\u70b9\u91d1\u50ac\u5316\u5242",
                "/actions/crafting/treant_shield": "\u6811\u4eba\u76fe",
                "/actions/crafting/purpleheart_fire_staff": "\u7d2b\u5fc3\u706b\u6cd5\u6756",
                "/actions/crafting/ring_of_regeneration": "\u6062\u590d\u6212\u6307",
                "/actions/crafting/earrings_of_regeneration": "\u6062\u590d\u8033\u73af",
                "/actions/crafting/fighter_necklace": "\u6218\u58eb\u9879\u94fe",
                "/actions/crafting/ginkgo_lumber": "\u94f6\u674f\u6728\u677f",
                "/actions/crafting/ginkgo_crossbow": "\u94f6\u674f\u5f29",
                "/actions/crafting/ginkgo_water_staff": "\u94f6\u674f\u6c34\u6cd5\u6756",
                "/actions/crafting/ring_of_armor": "\u62a4\u7532\u6212\u6307",
                "/actions/crafting/catalyst_of_decomposition": "\u5206\u89e3\u50ac\u5316\u5242",
                "/actions/crafting/ginkgo_shield": "\u94f6\u674f\u76fe",
                "/actions/crafting/earrings_of_armor": "\u62a4\u7532\u8033\u73af",
                "/actions/crafting/ginkgo_nature_staff": "\u94f6\u674f\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/ranger_necklace": "\u5c04\u624b\u9879\u94fe",
                "/actions/crafting/ginkgo_bow": "\u94f6\u674f\u5f13",
                "/actions/crafting/ring_of_resistance": "\u6297\u6027\u6212\u6307",
                "/actions/crafting/crushed_moonstone": "\u6708\u4eae\u77f3\u788e\u7247",
                "/actions/crafting/ginkgo_fire_staff": "\u94f6\u674f\u706b\u6cd5\u6756",
                "/actions/crafting/earrings_of_resistance": "\u6297\u6027\u8033\u73af",
                "/actions/crafting/wizard_necklace": "\u5deb\u5e08\u9879\u94fe",
                "/actions/crafting/ring_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u6212\u6307",
                "/actions/crafting/expert_milking_charm": "\u4e13\u5bb6\u6324\u5976\u62a4\u7b26",
                "/actions/crafting/expert_foraging_charm": "\u4e13\u5bb6\u91c7\u6458\u62a4\u7b26",
                "/actions/crafting/expert_woodcutting_charm": "\u4e13\u5bb6\u4f10\u6728\u62a4\u7b26",
                "/actions/crafting/expert_cheesesmithing_charm": "\u4e13\u5bb6\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/actions/crafting/expert_crafting_charm": "\u4e13\u5bb6\u5236\u4f5c\u62a4\u7b26",
                "/actions/crafting/expert_tailoring_charm": "\u4e13\u5bb6\u7f1d\u7eab\u62a4\u7b26",
                "/actions/crafting/expert_cooking_charm": "\u4e13\u5bb6\u70f9\u996a\u62a4\u7b26",
                "/actions/crafting/expert_brewing_charm": "\u4e13\u5bb6\u917f\u9020\u62a4\u7b26",
                "/actions/crafting/expert_alchemy_charm": "\u4e13\u5bb6\u70bc\u91d1\u62a4\u7b26",
                "/actions/crafting/expert_enhancing_charm": "\u4e13\u5bb6\u5f3a\u5316\u62a4\u7b26",
                "/actions/crafting/expert_stamina_charm": "\u4e13\u5bb6\u8010\u529b\u62a4\u7b26",
                "/actions/crafting/expert_intelligence_charm": "\u4e13\u5bb6\u667a\u529b\u62a4\u7b26",
                "/actions/crafting/expert_attack_charm": "\u4e13\u5bb6\u653b\u51fb\u62a4\u7b26",
                "/actions/crafting/expert_defense_charm": "\u4e13\u5bb6\u9632\u5fa1\u62a4\u7b26",
                "/actions/crafting/expert_melee_charm": "\u4e13\u5bb6\u8fd1\u6218\u62a4\u7b26",
                "/actions/crafting/expert_ranged_charm": "\u4e13\u5bb6\u8fdc\u7a0b\u62a4\u7b26",
                "/actions/crafting/expert_magic_charm": "\u4e13\u5bb6\u9b54\u6cd5\u62a4\u7b26",
                "/actions/crafting/catalyst_of_transmutation": "\u8f6c\u5316\u50ac\u5316\u5242",
                "/actions/crafting/earrings_of_rare_find": "\u7a00\u6709\u53d1\u73b0\u8033\u73af",
                "/actions/crafting/necklace_of_wisdom": "\u7ecf\u9a8c\u9879\u94fe",
                "/actions/crafting/redwood_lumber": "\u7ea2\u6749\u6728\u677f",
                "/actions/crafting/redwood_crossbow": "\u7ea2\u6749\u5f29",
                "/actions/crafting/redwood_water_staff": "\u7ea2\u6749\u6c34\u6cd5\u6756",
                "/actions/crafting/redwood_shield": "\u7ea2\u6749\u76fe",
                "/actions/crafting/redwood_nature_staff": "\u7ea2\u6749\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/redwood_bow": "\u7ea2\u6749\u5f13",
                "/actions/crafting/crushed_sunstone": "\u592a\u9633\u77f3\u788e\u7247",
                "/actions/crafting/chimerical_entry_key": "\u5947\u5e7b\u94a5\u5319",
                "/actions/crafting/chimerical_chest_key": "\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319",
                "/actions/crafting/eye_watch": "\u638c\u4e0a\u76d1\u5de5",
                "/actions/crafting/watchful_relic": "\u8b66\u6212\u9057\u7269",
                "/actions/crafting/redwood_fire_staff": "\u7ea2\u6749\u706b\u6cd5\u6756",
                "/actions/crafting/ring_of_critical_strike": "\u66b4\u51fb\u6212\u6307",
                "/actions/crafting/mirror_of_protection": "\u4fdd\u62a4\u4e4b\u955c",
                "/actions/crafting/earrings_of_critical_strike": "\u66b4\u51fb\u8033\u73af",
                "/actions/crafting/necklace_of_speed": "\u901f\u5ea6\u9879\u94fe",
                "/actions/crafting/arcane_lumber": "\u795e\u79d8\u6728\u677f",
                "/actions/crafting/arcane_crossbow": "\u795e\u79d8\u5f29",
                "/actions/crafting/arcane_water_staff": "\u795e\u79d8\u6c34\u6cd5\u6756",
                "/actions/crafting/master_milking_charm": "\u5927\u5e08\u6324\u5976\u62a4\u7b26",
                "/actions/crafting/master_foraging_charm": "\u5927\u5e08\u91c7\u6458\u62a4\u7b26",
                "/actions/crafting/master_woodcutting_charm": "\u5927\u5e08\u4f10\u6728\u62a4\u7b26",
                "/actions/crafting/master_cheesesmithing_charm": "\u5927\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/actions/crafting/master_crafting_charm": "\u5927\u5e08\u5236\u4f5c\u62a4\u7b26",
                "/actions/crafting/master_tailoring_charm": "\u5927\u5e08\u7f1d\u7eab\u62a4\u7b26",
                "/actions/crafting/master_cooking_charm": "\u5927\u5e08\u70f9\u996a\u62a4\u7b26",
                "/actions/crafting/master_brewing_charm": "\u5927\u5e08\u917f\u9020\u62a4\u7b26",
                "/actions/crafting/master_alchemy_charm": "\u5927\u5e08\u70bc\u91d1\u62a4\u7b26",
                "/actions/crafting/master_enhancing_charm": "\u5927\u5e08\u5f3a\u5316\u62a4\u7b26",
                "/actions/crafting/master_stamina_charm": "\u5927\u5e08\u8010\u529b\u62a4\u7b26",
                "/actions/crafting/master_intelligence_charm": "\u5927\u5e08\u667a\u529b\u62a4\u7b26",
                "/actions/crafting/master_attack_charm": "\u5927\u5e08\u653b\u51fb\u62a4\u7b26",
                "/actions/crafting/master_defense_charm": "\u5927\u5e08\u9632\u5fa1\u62a4\u7b26",
                "/actions/crafting/master_melee_charm": "\u5927\u5e08\u8fd1\u6218\u62a4\u7b26",
                "/actions/crafting/master_ranged_charm": "\u5927\u5e08\u8fdc\u7a0b\u62a4\u7b26",
                "/actions/crafting/master_magic_charm": "\u5927\u5e08\u9b54\u6cd5\u62a4\u7b26",
                "/actions/crafting/sinister_entry_key": "\u9634\u68ee\u94a5\u5319",
                "/actions/crafting/sinister_chest_key": "\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319",
                "/actions/crafting/arcane_shield": "\u795e\u79d8\u76fe",
                "/actions/crafting/arcane_nature_staff": "\u795e\u79d8\u81ea\u7136\u6cd5\u6756",
                "/actions/crafting/manticore_shield": "\u874e\u72ee\u76fe",
                "/actions/crafting/arcane_bow": "\u795e\u79d8\u5f13",
                "/actions/crafting/enchanted_entry_key": "\u79d8\u6cd5\u94a5\u5319",
                "/actions/crafting/enchanted_chest_key": "\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319",
                "/actions/crafting/pirate_entry_key": "\u6d77\u76d7\u94a5\u5319",
                "/actions/crafting/pirate_chest_key": "\u6d77\u76d7\u5b9d\u7bb1\u94a5\u5319",
                "/actions/crafting/arcane_fire_staff": "\u795e\u79d8\u706b\u6cd5\u6756",
                "/actions/crafting/vampiric_bow": "\u5438\u8840\u5f13",
                "/actions/crafting/soul_hunter_crossbow": "\u7075\u9b42\u730e\u624b\u5f29",
                "/actions/crafting/frost_staff": "\u51b0\u971c\u6cd5\u6756",
                "/actions/crafting/infernal_battlestaff": "\u70bc\u72f1\u6cd5\u6756",
                "/actions/crafting/jackalope_staff": "\u9e7f\u89d2\u5154\u4e4b\u6756",
                "/actions/crafting/philosophers_ring": "\u8d24\u8005\u6212\u6307",
                "/actions/crafting/crushed_philosophers_stone": "\u8d24\u8005\u4e4b\u77f3\u788e\u7247",
                "/actions/crafting/philosophers_earrings": "\u8d24\u8005\u8033\u73af",
                "/actions/crafting/philosophers_necklace": "\u8d24\u8005\u9879\u94fe",
                "/actions/crafting/bishops_codex": "\u4e3b\u6559\u6cd5\u5178",
                "/actions/crafting/cursed_bow": "\u5492\u6028\u4e4b\u5f13",
                "/actions/crafting/sundering_crossbow": "\u88c2\u7a7a\u4e4b\u5f29",
                "/actions/crafting/rippling_trident": "\u6d9f\u6f2a\u4e09\u53c9\u621f",
                "/actions/crafting/blooming_trident": "\u7efd\u653e\u4e09\u53c9\u621f",
                "/actions/crafting/blazing_trident": "\u70bd\u7130\u4e09\u53c9\u621f",
                "/actions/crafting/grandmaster_milking_charm": "\u5b97\u5e08\u6324\u5976\u62a4\u7b26",
                "/actions/crafting/grandmaster_foraging_charm": "\u5b97\u5e08\u91c7\u6458\u62a4\u7b26",
                "/actions/crafting/grandmaster_woodcutting_charm": "\u5b97\u5e08\u4f10\u6728\u62a4\u7b26",
                "/actions/crafting/grandmaster_cheesesmithing_charm": "\u5b97\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26",
                "/actions/crafting/grandmaster_crafting_charm": "\u5b97\u5e08\u5236\u4f5c\u62a4\u7b26",
                "/actions/crafting/grandmaster_tailoring_charm": "\u5b97\u5e08\u7f1d\u7eab\u62a4\u7b26",
                "/actions/crafting/grandmaster_cooking_charm": "\u5b97\u5e08\u70f9\u996a\u62a4\u7b26",
                "/actions/crafting/grandmaster_brewing_charm": "\u5b97\u5e08\u917f\u9020\u62a4\u7b26",
                "/actions/crafting/grandmaster_alchemy_charm": "\u5b97\u5e08\u70bc\u91d1\u62a4\u7b26",
                "/actions/crafting/grandmaster_enhancing_charm": "\u5b97\u5e08\u5f3a\u5316\u62a4\u7b26",
                "/actions/crafting/grandmaster_stamina_charm": "\u5b97\u5e08\u8010\u529b\u62a4\u7b26",
                "/actions/crafting/grandmaster_intelligence_charm": "\u5b97\u5e08\u667a\u529b\u62a4\u7b26",
                "/actions/crafting/grandmaster_attack_charm": "\u5b97\u5e08\u653b\u51fb\u62a4\u7b26",
                "/actions/crafting/grandmaster_defense_charm": "\u5b97\u5e08\u9632\u5fa1\u62a4\u7b26",
                "/actions/crafting/grandmaster_melee_charm": "\u5b97\u5e08\u8fd1\u6218\u62a4\u7b26",
                "/actions/crafting/grandmaster_ranged_charm": "\u5b97\u5e08\u8fdc\u7a0b\u62a4\u7b26",
                "/actions/crafting/grandmaster_magic_charm": "\u5b97\u5e08\u9b54\u6cd5\u62a4\u7b26",
                "/actions/crafting/bishops_codex_refined": "\u4e3b\u6559\u6cd5\u5178\uff08\u7cbe\uff09",
                "/actions/crafting/cursed_bow_refined": "\u5492\u6028\u4e4b\u5f13\uff08\u7cbe\uff09",
                "/actions/crafting/sundering_crossbow_refined": "\u88c2\u7a7a\u4e4b\u5f29\uff08\u7cbe\uff09",
                "/actions/crafting/rippling_trident_refined": "\u6d9f\u6f2a\u4e09\u53c9\u621f\uff08\u7cbe\uff09",
                "/actions/crafting/blooming_trident_refined": "\u7efd\u653e\u4e09\u53c9\u621f\uff08\u7cbe\uff09",
                "/actions/crafting/blazing_trident_refined": "\u70bd\u7130\u4e09\u53c9\u621f\uff08\u7cbe\uff09",
                "/actions/tailoring/rough_leather": "\u7c97\u7cd9\u76ae\u9769",
                "/actions/tailoring/cotton_fabric": "\u68c9\u82b1\u5e03\u6599",
                "/actions/tailoring/rough_boots": "\u7c97\u7cd9\u9774",
                "/actions/tailoring/cotton_boots": "\u68c9\u9774",
                "/actions/tailoring/rough_bracers": "\u7c97\u7cd9\u62a4\u8155",
                "/actions/tailoring/cotton_gloves": "\u68c9\u624b\u5957",
                "/actions/tailoring/small_pouch": "\u5c0f\u888b\u5b50",
                "/actions/tailoring/rough_hood": "\u7c97\u7cd9\u515c\u5e3d",
                "/actions/tailoring/cotton_hat": "\u68c9\u5e3d",
                "/actions/tailoring/rough_chaps": "\u7c97\u7cd9\u76ae\u88e4",
                "/actions/tailoring/cotton_robe_bottoms": "\u68c9\u888d\u88d9",
                "/actions/tailoring/rough_tunic": "\u7c97\u7cd9\u76ae\u8863",
                "/actions/tailoring/cotton_robe_top": "\u68c9\u888d\u670d",
                "/actions/tailoring/reptile_leather": "\u722c\u884c\u52a8\u7269\u76ae\u9769",
                "/actions/tailoring/linen_fabric": "\u4e9a\u9ebb\u5e03\u6599",
                "/actions/tailoring/reptile_boots": "\u722c\u884c\u52a8\u7269\u9774",
                "/actions/tailoring/linen_boots": "\u4e9a\u9ebb\u9774",
                "/actions/tailoring/reptile_bracers": "\u722c\u884c\u52a8\u7269\u62a4\u8155",
                "/actions/tailoring/linen_gloves": "\u4e9a\u9ebb\u624b\u5957",
                "/actions/tailoring/reptile_hood": "\u722c\u884c\u52a8\u7269\u515c\u5e3d",
                "/actions/tailoring/linen_hat": "\u4e9a\u9ebb\u5e3d",
                "/actions/tailoring/reptile_chaps": "\u722c\u884c\u52a8\u7269\u76ae\u88e4",
                "/actions/tailoring/linen_robe_bottoms": "\u4e9a\u9ebb\u888d\u88d9",
                "/actions/tailoring/medium_pouch": "\u4e2d\u888b\u5b50",
                "/actions/tailoring/reptile_tunic": "\u722c\u884c\u52a8\u7269\u76ae\u8863",
                "/actions/tailoring/linen_robe_top": "\u4e9a\u9ebb\u888d\u670d",
                "/actions/tailoring/shoebill_shoes": "\u9cb8\u5934\u9e73\u978b",
                "/actions/tailoring/gobo_leather": "\u54e5\u5e03\u6797\u76ae\u9769",
                "/actions/tailoring/bamboo_fabric": "\u7af9\u5b50\u5e03\u6599",
                "/actions/tailoring/gobo_boots": "\u54e5\u5e03\u6797\u9774",
                "/actions/tailoring/bamboo_boots": "\u7af9\u9774",
                "/actions/tailoring/gobo_bracers": "\u54e5\u5e03\u6797\u62a4\u8155",
                "/actions/tailoring/bamboo_gloves": "\u7af9\u624b\u5957",
                "/actions/tailoring/gobo_hood": "\u54e5\u5e03\u6797\u515c\u5e3d",
                "/actions/tailoring/bamboo_hat": "\u7af9\u5e3d",
                "/actions/tailoring/gobo_chaps": "\u54e5\u5e03\u6797\u76ae\u88e4",
                "/actions/tailoring/bamboo_robe_bottoms": "\u7af9\u888d\u88d9",
                "/actions/tailoring/large_pouch": "\u5927\u888b\u5b50",
                "/actions/tailoring/gobo_tunic": "\u54e5\u5e03\u6797\u76ae\u8863",
                "/actions/tailoring/bamboo_robe_top": "\u7af9\u888d\u670d",
                "/actions/tailoring/marine_tunic": "\u6d77\u6d0b\u76ae\u8863",
                "/actions/tailoring/marine_chaps": "\u822a\u6d77\u76ae\u88e4",
                "/actions/tailoring/icy_robe_top": "\u51b0\u971c\u888d\u670d",
                "/actions/tailoring/icy_robe_bottoms": "\u51b0\u971c\u888d\u88d9",
                "/actions/tailoring/flaming_robe_top": "\u70c8\u7130\u888d\u670d",
                "/actions/tailoring/flaming_robe_bottoms": "\u70c8\u7130\u888d\u88d9",
                "/actions/tailoring/beast_leather": "\u91ce\u517d\u76ae\u9769",
                "/actions/tailoring/silk_fabric": "\u4e1d\u7ef8",
                "/actions/tailoring/beast_boots": "\u91ce\u517d\u9774",
                "/actions/tailoring/silk_boots": "\u4e1d\u9774",
                "/actions/tailoring/beast_bracers": "\u91ce\u517d\u62a4\u8155",
                "/actions/tailoring/silk_gloves": "\u4e1d\u624b\u5957",
                "/actions/tailoring/collectors_boots": "\u6536\u85cf\u5bb6\u9774",
                "/actions/tailoring/sighted_bracers": "\u7784\u51c6\u62a4\u8155",
                "/actions/tailoring/beast_hood": "\u91ce\u517d\u515c\u5e3d",
                "/actions/tailoring/silk_hat": "\u4e1d\u5e3d",
                "/actions/tailoring/beast_chaps": "\u91ce\u517d\u76ae\u88e4",
                "/actions/tailoring/silk_robe_bottoms": "\u4e1d\u7ef8\u888d\u88d9",
                "/actions/tailoring/centaur_boots": "\u534a\u4eba\u9a6c\u9774",
                "/actions/tailoring/sorcerer_boots": "\u5deb\u5e08\u9774",
                "/actions/tailoring/giant_pouch": "\u5de8\u5927\u888b\u5b50",
                "/actions/tailoring/beast_tunic": "\u91ce\u517d\u76ae\u8863",
                "/actions/tailoring/silk_robe_top": "\u4e1d\u7ef8\u888d\u670d",
                "/actions/tailoring/red_culinary_hat": "\u7ea2\u8272\u53a8\u5e08\u5e3d",
                "/actions/tailoring/luna_robe_top": "\u6708\u795e\u888d\u670d",
                "/actions/tailoring/luna_robe_bottoms": "\u6708\u795e\u888d\u88d9",
                "/actions/tailoring/umbral_leather": "\u6697\u5f71\u76ae\u9769",
                "/actions/tailoring/radiant_fabric": "\u5149\u8f89\u5e03\u6599",
                "/actions/tailoring/umbral_boots": "\u6697\u5f71\u9774",
                "/actions/tailoring/radiant_boots": "\u5149\u8f89\u9774",
                "/actions/tailoring/umbral_bracers": "\u6697\u5f71\u62a4\u8155",
                "/actions/tailoring/radiant_gloves": "\u5149\u8f89\u624b\u5957",
                "/actions/tailoring/enchanted_gloves": "\u9644\u9b54\u624b\u5957",
                "/actions/tailoring/fluffy_red_hat": "\u84ec\u677e\u7ea2\u5e3d\u5b50",
                "/actions/tailoring/chrono_gloves": "\u65f6\u7a7a\u624b\u5957",
                "/actions/tailoring/umbral_hood": "\u6697\u5f71\u515c\u5e3d",
                "/actions/tailoring/radiant_hat": "\u5149\u8f89\u5e3d",
                "/actions/tailoring/umbral_chaps": "\u6697\u5f71\u76ae\u88e4",
                "/actions/tailoring/radiant_robe_bottoms": "\u5149\u8f89\u888d\u88d9",
                "/actions/tailoring/umbral_tunic": "\u6697\u5f71\u76ae\u8863",
                "/actions/tailoring/radiant_robe_top": "\u5149\u8f89\u888d\u670d",
                "/actions/tailoring/revenant_chaps": "\u4ea1\u7075\u76ae\u88e4",
                "/actions/tailoring/griffin_chaps": "\u72ee\u9e6b\u76ae\u88e4",
                "/actions/tailoring/dairyhands_top": "\u6324\u5976\u5de5\u4e0a\u8863",
                "/actions/tailoring/dairyhands_bottoms": "\u6324\u5976\u5de5\u4e0b\u88c5",
                "/actions/tailoring/foragers_top": "\u91c7\u6458\u8005\u4e0a\u8863",
                "/actions/tailoring/foragers_bottoms": "\u91c7\u6458\u8005\u4e0b\u88c5",
                "/actions/tailoring/lumberjacks_top": "\u4f10\u6728\u5de5\u4e0a\u8863",
                "/actions/tailoring/lumberjacks_bottoms": "\u4f10\u6728\u5de5\u4e0b\u88c5",
                "/actions/tailoring/cheesemakers_top": "\u5976\u916a\u5e08\u4e0a\u8863",
                "/actions/tailoring/cheesemakers_bottoms": "\u5976\u916a\u5e08\u4e0b\u88c5",
                "/actions/tailoring/crafters_top": "\u5de5\u5320\u4e0a\u8863",
                "/actions/tailoring/crafters_bottoms": "\u5de5\u5320\u4e0b\u88c5",
                "/actions/tailoring/tailors_top": "\u88c1\u7f1d\u4e0a\u8863",
                "/actions/tailoring/tailors_bottoms": "\u88c1\u7f1d\u4e0b\u88c5",
                "/actions/tailoring/chefs_top": "\u53a8\u5e08\u4e0a\u8863",
                "/actions/tailoring/chefs_bottoms": "\u53a8\u5e08\u4e0b\u88c5",
                "/actions/tailoring/brewers_top": "\u996e\u54c1\u5e08\u4e0a\u8863",
                "/actions/tailoring/brewers_bottoms": "\u996e\u54c1\u5e08\u4e0b\u88c5",
                "/actions/tailoring/alchemists_top": "\u70bc\u91d1\u5e08\u4e0a\u8863",
                "/actions/tailoring/alchemists_bottoms": "\u70bc\u91d1\u5e08\u4e0b\u88c5",
                "/actions/tailoring/enhancers_top": "\u5f3a\u5316\u5e08\u4e0a\u8863",
                "/actions/tailoring/enhancers_bottoms": "\u5f3a\u5316\u5e08\u4e0b\u88c5",
                "/actions/tailoring/revenant_tunic": "\u4ea1\u7075\u76ae\u8863",
                "/actions/tailoring/griffin_tunic": "\u72ee\u9e6b\u76ae\u8863",
                "/actions/tailoring/gluttonous_pouch": "\u8d2a\u98df\u4e4b\u888b",
                "/actions/tailoring/guzzling_pouch": "\u66b4\u996e\u4e4b\u56ca",
                "/actions/tailoring/marksman_bracers": "\u795e\u5c04\u62a4\u8155",
                "/actions/tailoring/acrobatic_hood": "\u6742\u6280\u5e08\u515c\u5e3d",
                "/actions/tailoring/magicians_hat": "\u9b54\u672f\u5e08\u5e3d",
                "/actions/tailoring/kraken_chaps": "\u514b\u62c9\u80af\u76ae\u88e4",
                "/actions/tailoring/royal_water_robe_bottoms": "\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9",
                "/actions/tailoring/royal_nature_robe_bottoms": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9",
                "/actions/tailoring/royal_fire_robe_bottoms": "\u7687\u5bb6\u706b\u7cfb\u888d\u88d9",
                "/actions/tailoring/kraken_tunic": "\u514b\u62c9\u80af\u76ae\u8863",
                "/actions/tailoring/royal_water_robe_top": "\u7687\u5bb6\u6c34\u7cfb\u888d\u670d",
                "/actions/tailoring/royal_nature_robe_top": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d",
                "/actions/tailoring/royal_fire_robe_top": "\u7687\u5bb6\u706b\u7cfb\u888d\u670d",
                "/actions/tailoring/chimerical_quiver_refined": "\u5947\u5e7b\u7bad\u888b\uff08\u7cbe\uff09",
                "/actions/tailoring/sinister_cape_refined": "\u9634\u68ee\u6597\u7bf7\uff08\u7cbe\uff09",
                "/actions/tailoring/enchanted_cloak_refined": "\u79d8\u6cd5\u62ab\u98ce\uff08\u7cbe\uff09",
                "/actions/tailoring/marksman_bracers_refined": "\u795e\u5c04\u62a4\u8155\uff08\u7cbe\uff09",
                "/actions/tailoring/acrobatic_hood_refined": "\u6742\u6280\u5e08\u515c\u5e3d\uff08\u7cbe\uff09",
                "/actions/tailoring/magicians_hat_refined": "\u9b54\u672f\u5e08\u5e3d\uff08\u7cbe\uff09",
                "/actions/tailoring/kraken_chaps_refined": "\u514b\u62c9\u80af\u76ae\u88e4\uff08\u7cbe\uff09",
                "/actions/tailoring/royal_water_robe_bottoms_refined": "\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9\uff08\u7cbe\uff09",
                "/actions/tailoring/royal_nature_robe_bottoms_refined": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9\uff08\u7cbe\uff09",
                "/actions/tailoring/royal_fire_robe_bottoms_refined": "\u7687\u5bb6\u706b\u7cfb\u888d\u88d9\uff08\u7cbe\uff09",
                "/actions/tailoring/kraken_tunic_refined": "\u514b\u62c9\u80af\u76ae\u8863\uff08\u7cbe\uff09",
                "/actions/tailoring/royal_water_robe_top_refined": "\u7687\u5bb6\u6c34\u7cfb\u888d\u670d\uff08\u7cbe\uff09",
                "/actions/tailoring/royal_nature_robe_top_refined": "\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d\uff08\u7cbe\uff09",
                "/actions/tailoring/royal_fire_robe_top_refined": "\u7687\u5bb6\u706b\u7cfb\u888d\u670d\uff08\u7cbe\uff09",
                "/actions/cooking/donut": "\u751c\u751c\u5708",
                "/actions/cooking/cupcake": "\u7eb8\u676f\u86cb\u7cd5",
                "/actions/cooking/gummy": "\u8f6f\u7cd6",
                "/actions/cooking/yogurt": "\u9178\u5976",
                "/actions/cooking/blueberry_donut": "\u84dd\u8393\u751c\u751c\u5708",
                "/actions/cooking/blueberry_cake": "\u84dd\u8393\u86cb\u7cd5",
                "/actions/cooking/apple_gummy": "\u82f9\u679c\u8f6f\u7cd6",
                "/actions/cooking/apple_yogurt": "\u82f9\u679c\u9178\u5976",
                "/actions/cooking/blackberry_donut": "\u9ed1\u8393\u751c\u751c\u5708",
                "/actions/cooking/blackberry_cake": "\u9ed1\u8393\u86cb\u7cd5",
                "/actions/cooking/orange_gummy": "\u6a59\u5b50\u8f6f\u7cd6",
                "/actions/cooking/orange_yogurt": "\u6a59\u5b50\u9178\u5976",
                "/actions/cooking/strawberry_donut": "\u8349\u8393\u751c\u751c\u5708",
                "/actions/cooking/strawberry_cake": "\u8349\u8393\u86cb\u7cd5",
                "/actions/cooking/plum_gummy": "\u674e\u5b50\u8f6f\u7cd6",
                "/actions/cooking/plum_yogurt": "\u674e\u5b50\u9178\u5976",
                "/actions/cooking/mooberry_donut": "\u54de\u8393\u751c\u751c\u5708",
                "/actions/cooking/mooberry_cake": "\u54de\u8393\u86cb\u7cd5",
                "/actions/cooking/peach_gummy": "\u6843\u5b50\u8f6f\u7cd6",
                "/actions/cooking/peach_yogurt": "\u6843\u5b50\u9178\u5976",
                "/actions/cooking/marsberry_donut": "\u706b\u661f\u8393\u751c\u751c\u5708",
                "/actions/cooking/marsberry_cake": "\u706b\u661f\u8393\u86cb\u7cd5",
                "/actions/cooking/dragon_fruit_gummy": "\u706b\u9f99\u679c\u8f6f\u7cd6",
                "/actions/cooking/dragon_fruit_yogurt": "\u706b\u9f99\u679c\u9178\u5976",
                "/actions/cooking/spaceberry_donut": "\u592a\u7a7a\u8393\u751c\u751c\u5708",
                "/actions/cooking/spaceberry_cake": "\u592a\u7a7a\u8393\u86cb\u7cd5",
                "/actions/cooking/star_fruit_gummy": "\u6768\u6843\u8f6f\u7cd6",
                "/actions/cooking/star_fruit_yogurt": "\u6768\u6843\u9178\u5976",
                "/actions/brewing/milking_tea": "\u6324\u5976\u8336",
                "/actions/brewing/stamina_coffee": "\u8010\u529b\u5496\u5561",
                "/actions/brewing/foraging_tea": "\u91c7\u6458\u8336",
                "/actions/brewing/intelligence_coffee": "\u667a\u529b\u5496\u5561",
                "/actions/brewing/gathering_tea": "\u91c7\u96c6\u8336",
                "/actions/brewing/woodcutting_tea": "\u4f10\u6728\u8336",
                "/actions/brewing/cooking_tea": "\u70f9\u996a\u8336",
                "/actions/brewing/defense_coffee": "\u9632\u5fa1\u5496\u5561",
                "/actions/brewing/brewing_tea": "\u51b2\u6ce1\u8336",
                "/actions/brewing/attack_coffee": "\u653b\u51fb\u5496\u5561",
                "/actions/brewing/gourmet_tea": "\u7f8e\u98df\u8336",
                "/actions/brewing/alchemy_tea": "\u70bc\u91d1\u8336",
                "/actions/brewing/enhancing_tea": "\u5f3a\u5316\u8336",
                "/actions/brewing/cheesesmithing_tea": "\u5976\u916a\u953b\u9020\u8336",
                "/actions/brewing/melee_coffee": "\u8fd1\u6218\u5496\u5561",
                "/actions/brewing/crafting_tea": "\u5236\u4f5c\u8336",
                "/actions/brewing/ranged_coffee": "\u8fdc\u7a0b\u5496\u5561",
                "/actions/brewing/wisdom_tea": "\u7ecf\u9a8c\u8336",
                "/actions/brewing/wisdom_coffee": "\u7ecf\u9a8c\u5496\u5561",
                "/actions/brewing/tailoring_tea": "\u7f1d\u7eab\u8336",
                "/actions/brewing/magic_coffee": "\u9b54\u6cd5\u5496\u5561",
                "/actions/brewing/super_milking_tea": "\u8d85\u7ea7\u6324\u5976\u8336",
                "/actions/brewing/super_stamina_coffee": "\u8d85\u7ea7\u8010\u529b\u5496\u5561",
                "/actions/brewing/super_foraging_tea": "\u8d85\u7ea7\u91c7\u6458\u8336",
                "/actions/brewing/super_intelligence_coffee": "\u8d85\u7ea7\u667a\u529b\u5496\u5561",
                "/actions/brewing/processing_tea": "\u52a0\u5de5\u8336",
                "/actions/brewing/lucky_coffee": "\u5e78\u8fd0\u5496\u5561",
                "/actions/brewing/super_woodcutting_tea": "\u8d85\u7ea7\u4f10\u6728\u8336",
                "/actions/brewing/super_cooking_tea": "\u8d85\u7ea7\u70f9\u996a\u8336",
                "/actions/brewing/super_defense_coffee": "\u8d85\u7ea7\u9632\u5fa1\u5496\u5561",
                "/actions/brewing/super_brewing_tea": "\u8d85\u7ea7\u51b2\u6ce1\u8336",
                "/actions/brewing/ultra_milking_tea": "\u7a76\u6781\u6324\u5976\u8336",
                "/actions/brewing/super_attack_coffee": "\u8d85\u7ea7\u653b\u51fb\u5496\u5561",
                "/actions/brewing/ultra_stamina_coffee": "\u7a76\u6781\u8010\u529b\u5496\u5561",
                "/actions/brewing/efficiency_tea": "\u6548\u7387\u8336",
                "/actions/brewing/swiftness_coffee": "\u8fc5\u6377\u5496\u5561",
                "/actions/brewing/super_alchemy_tea": "\u8d85\u7ea7\u70bc\u91d1\u8336",
                "/actions/brewing/super_enhancing_tea": "\u8d85\u7ea7\u5f3a\u5316\u8336",
                "/actions/brewing/ultra_foraging_tea": "\u7a76\u6781\u91c7\u6458\u8336",
                "/actions/brewing/ultra_intelligence_coffee": "\u7a76\u6781\u667a\u529b\u5496\u5561",
                "/actions/brewing/channeling_coffee": "\u541f\u5531\u5496\u5561",
                "/actions/brewing/super_cheesesmithing_tea": "\u8d85\u7ea7\u5976\u916a\u953b\u9020\u8336",
                "/actions/brewing/ultra_woodcutting_tea": "\u7a76\u6781\u4f10\u6728\u8336",
                "/actions/brewing/super_melee_coffee": "\u8d85\u7ea7\u8fd1\u6218\u5496\u5561",
                "/actions/brewing/artisan_tea": "\u5de5\u5320\u8336",
                "/actions/brewing/super_crafting_tea": "\u8d85\u7ea7\u5236\u4f5c\u8336",
                "/actions/brewing/ultra_cooking_tea": "\u7a76\u6781\u70f9\u996a\u8336",
                "/actions/brewing/super_ranged_coffee": "\u8d85\u7ea7\u8fdc\u7a0b\u5496\u5561",
                "/actions/brewing/ultra_defense_coffee": "\u7a76\u6781\u9632\u5fa1\u5496\u5561",
                "/actions/brewing/catalytic_tea": "\u50ac\u5316\u8336",
                "/actions/brewing/critical_coffee": "\u66b4\u51fb\u5496\u5561",
                "/actions/brewing/super_tailoring_tea": "\u8d85\u7ea7\u7f1d\u7eab\u8336",
                "/actions/brewing/ultra_brewing_tea": "\u7a76\u6781\u51b2\u6ce1\u8336",
                "/actions/brewing/super_magic_coffee": "\u8d85\u7ea7\u9b54\u6cd5\u5496\u5561",
                "/actions/brewing/ultra_attack_coffee": "\u7a76\u6781\u653b\u51fb\u5496\u5561",
                "/actions/brewing/blessed_tea": "\u798f\u6c14\u8336",
                "/actions/brewing/ultra_alchemy_tea": "\u7a76\u6781\u70bc\u91d1\u8336",
                "/actions/brewing/ultra_enhancing_tea": "\u7a76\u6781\u5f3a\u5316\u8336",
                "/actions/brewing/ultra_cheesesmithing_tea": "\u7a76\u6781\u5976\u916a\u953b\u9020\u8336",
                "/actions/brewing/ultra_melee_coffee": "\u7a76\u6781\u8fd1\u6218\u5496\u5561",
                "/actions/brewing/ultra_crafting_tea": "\u7a76\u6781\u5236\u4f5c\u8336",
                "/actions/brewing/ultra_ranged_coffee": "\u7a76\u6781\u8fdc\u7a0b\u5496\u5561",
                "/actions/brewing/ultra_tailoring_tea": "\u7a76\u6781\u7f1d\u7eab\u8336",
                "/actions/brewing/ultra_magic_coffee": "\u7a76\u6781\u9b54\u6cd5\u5496\u5561",
                "/actions/alchemy/coinify": "\u70b9\u91d1",
                "/actions/alchemy/transmute": "\u8f6c\u5316",
                "/actions/alchemy/decompose": "\u5206\u89e3",
                "/actions/enhancing/enhance": "\u5f3a\u5316",
                "/actions/combat/fly": "\u82cd\u8747",
                "/actions/combat/rat": "\u6770\u745e",
                "/actions/combat/skunk": "\u81ed\u9f2c",
                "/actions/combat/porcupine": "\u8c6a\u732a",
                "/actions/combat/slimy": "\u53f2\u83b1\u59c6",
                "/actions/combat/smelly_planet": "\u81ed\u81ed\u661f\u7403",
                "/actions/combat/frog": "\u9752\u86d9",
                "/actions/combat/snake": "\u86c7",
                "/actions/combat/swampy": "\u6cbc\u6cfd\u866b",
                "/actions/combat/alligator": "\u590f\u6d1b\u514b",
                "/actions/combat/swamp_planet": "\u6cbc\u6cfd\u661f\u7403",
                "/actions/combat/sea_snail": "\u8717\u725b",
                "/actions/combat/crab": "\u8783\u87f9",
                "/actions/combat/aquahorse": "\u6c34\u9a6c",
                "/actions/combat/nom_nom": "\u54ac\u54ac\u9c7c",
                "/actions/combat/turtle": "\u5fcd\u8005\u9f9f",
                "/actions/combat/aqua_planet": "\u6d77\u6d0b\u661f\u7403",
                "/actions/combat/jungle_sprite": "\u4e1b\u6797\u7cbe\u7075",
                "/actions/combat/myconid": "\u8611\u83c7\u4eba",
                "/actions/combat/treant": "\u6811\u4eba",
                "/actions/combat/centaur_archer": "\u534a\u4eba\u9a6c\u5f13\u7bad\u624b",
                "/actions/combat/jungle_planet": "\u4e1b\u6797\u661f\u7403",
                "/actions/combat/gobo_stabby": "\u523a\u523a",
                "/actions/combat/gobo_slashy": "\u780d\u780d",
                "/actions/combat/gobo_smashy": "\u9524\u9524",
                "/actions/combat/gobo_shooty": "\u54bb\u54bb",
                "/actions/combat/gobo_boomy": "\u8f70\u8f70",
                "/actions/combat/gobo_planet": "\u54e5\u5e03\u6797\u661f\u7403",
                "/actions/combat/eye": "\u72ec\u773c",
                "/actions/combat/eyes": "\u53e0\u773c",
                "/actions/combat/veyes": "\u590d\u773c",
                "/actions/combat/planet_of_the_eyes": "\u773c\u7403\u661f\u7403",
                "/actions/combat/novice_sorcerer": "\u65b0\u624b\u5deb\u5e08",
                "/actions/combat/ice_sorcerer": "\u51b0\u971c\u5deb\u5e08",
                "/actions/combat/flame_sorcerer": "\u706b\u7130\u5deb\u5e08",
                "/actions/combat/elementalist": "\u5143\u7d20\u6cd5\u5e08",
                "/actions/combat/sorcerers_tower": "\u5deb\u5e08\u4e4b\u5854",
                "/actions/combat/gummy_bear": "\u8f6f\u7cd6\u718a",
                "/actions/combat/panda": "\u718a\u732b",
                "/actions/combat/black_bear": "\u9ed1\u718a",
                "/actions/combat/grizzly_bear": "\u68d5\u718a",
                "/actions/combat/polar_bear": "\u5317\u6781\u718a",
                "/actions/combat/bear_with_it": "\u718a\u718a\u661f\u7403",
                "/actions/combat/magnetic_golem": "\u78c1\u529b\u9b54\u50cf",
                "/actions/combat/stalactite_golem": "\u949f\u4e73\u77f3\u9b54\u50cf",
                "/actions/combat/granite_golem": "\u82b1\u5c97\u5ca9\u9b54\u50cf",
                "/actions/combat/golem_cave": "\u9b54\u50cf\u6d1e\u7a74",
                "/actions/combat/zombie": "\u50f5\u5c38",
                "/actions/combat/vampire": "\u5438\u8840\u9b3c",
                "/actions/combat/werewolf": "\u72fc\u4eba",
                "/actions/combat/twilight_zone": "\u66ae\u5149\u4e4b\u5730",
                "/actions/combat/abyssal_imp": "\u6df1\u6e0a\u5c0f\u9b3c",
                "/actions/combat/soul_hunter": "\u7075\u9b42\u730e\u624b",
                "/actions/combat/infernal_warlock": "\u5730\u72f1\u672f\u58eb",
                "/actions/combat/infernal_abyss": "\u5730\u72f1\u6df1\u6e0a",
                "/actions/combat/chimerical_den": "\u5947\u5e7b\u6d1e\u7a74",
                "/actions/combat/sinister_circus": "\u9634\u68ee\u9a6c\u620f\u56e2",
                "/actions/combat/enchanted_fortress": "\u79d8\u6cd5\u8981\u585e",
                "/actions/combat/pirate_cove": "\u6d77\u76d7\u57fa\u5730",
    
                // monsterNames
                "/monsters/abyssal_imp": "\u6df1\u6e0a\u5c0f\u9b3c",
                "/monsters/acrobat": "\u6742\u6280\u5e08",
                "/monsters/anchor_shark": "\u6301\u951a\u9ca8",
                "/monsters/aquahorse": "\u6c34\u9a6c",
                "/monsters/black_bear": "\u9ed1\u718a",
                "/monsters/gobo_boomy": "\u8f70\u8f70",
                "/monsters/brine_marksman": "\u6d77\u76d0\u5c04\u624b",
                "/monsters/captain_fishhook": "\u9c7c\u94a9\u8239\u957f",
                "/monsters/butterjerry": "\u8776\u9f20",
                "/monsters/centaur_archer": "\u534a\u4eba\u9a6c\u5f13\u7bad\u624b",
                "/monsters/chronofrost_sorcerer": "\u971c\u65f6\u5deb\u5e08",
                "/monsters/crystal_colossus": "\u6c34\u6676\u5de8\u50cf",
                "/monsters/demonic_overlord": "\u6076\u9b54\u9738\u4e3b",
                "/monsters/deranged_jester": "\u5c0f\u4e11\u7687",
                "/monsters/dodocamel": "\u6e21\u6e21\u9a7c",
                "/monsters/dusk_revenant": "\u9ec4\u660f\u4ea1\u7075",
                "/monsters/elementalist": "\u5143\u7d20\u6cd5\u5e08",
                "/monsters/enchanted_bishop": "\u79d8\u6cd5\u4e3b\u6559",
                "/monsters/enchanted_king": "\u79d8\u6cd5\u56fd\u738b",
                "/monsters/enchanted_knight": "\u79d8\u6cd5\u9a91\u58eb",
                "/monsters/enchanted_pawn": "\u79d8\u6cd5\u58eb\u5175",
                "/monsters/enchanted_queen": "\u79d8\u6cd5\u738b\u540e",
                "/monsters/enchanted_rook": "\u79d8\u6cd5\u5821\u5792",
                "/monsters/eye": "\u72ec\u773c",
                "/monsters/eyes": "\u53e0\u773c",
                "/monsters/flame_sorcerer": "\u706b\u7130\u5deb\u5e08",
                "/monsters/fly": "\u82cd\u8747",
                "/monsters/frog": "\u9752\u86d9",
                "/monsters/sea_snail": "\u8717\u725b",
                "/monsters/giant_shoebill": "\u9cb8\u5934\u9e73",
                "/monsters/gobo_chieftain": "\u54e5\u5e03\u6797\u914b\u957f",
                "/monsters/granite_golem": "\u82b1\u5c97\u9b54\u50cf",
                "/monsters/griffin": "\u72ee\u9e6b",
                "/monsters/grizzly_bear": "\u68d5\u718a",
                "/monsters/gummy_bear": "\u8f6f\u7cd6\u718a",
                "/monsters/crab": "\u8783\u87f9",
                "/monsters/ice_sorcerer": "\u51b0\u971c\u5deb\u5e08",
                "/monsters/infernal_warlock": "\u5730\u72f1\u672f\u58eb",
                "/monsters/jackalope": "\u9e7f\u89d2\u5154",
                "/monsters/rat": "\u6770\u745e",
                "/monsters/juggler": "\u6742\u800d\u8005",
                "/monsters/jungle_sprite": "\u4e1b\u6797\u7cbe\u7075",
                "/monsters/luna_empress": "\u6708\u795e\u4e4b\u8776",
                "/monsters/magician": "\u9b54\u672f\u5e08",
                "/monsters/magnetic_golem": "\u78c1\u529b\u9b54\u50cf",
                "/monsters/manticore": "\u72ee\u874e\u517d",
                "/monsters/marine_huntress": "\u6d77\u6d0b\u730e\u624b",
                "/monsters/myconid": "\u8611\u83c7\u4eba",
                "/monsters/nom_nom": "\u54ac\u54ac\u9c7c",
                "/monsters/novice_sorcerer": "\u65b0\u624b\u5deb\u5e08",
                "/monsters/panda": "\u718a\u732b",
                "/monsters/polar_bear": "\u5317\u6781\u718a",
                "/monsters/porcupine": "\u8c6a\u732a",
                "/monsters/rabid_rabbit": "\u75af\u9b54\u5154",
                "/monsters/red_panda": "\u5c0f\u718a\u732b",
                "/monsters/alligator": "\u590f\u6d1b\u514b",
                "/monsters/gobo_shooty": "\u54bb\u54bb",
                "/monsters/skunk": "\u81ed\u9f2c",
                "/monsters/gobo_slashy": "\u780d\u780d",
                "/monsters/slimy": "\u53f2\u83b1\u59c6",
                "/monsters/gobo_smashy": "\u9524\u9524",
                "/monsters/soul_hunter": "\u7075\u9b42\u730e\u624b",
                "/monsters/squawker": "\u9e66\u9e49",
                "/monsters/gobo_stabby": "\u523a\u523a",
                "/monsters/stalactite_golem": "\u949f\u4e73\u77f3\u9b54\u50cf",
                "/monsters/swampy": "\u6cbc\u6cfd\u866b",
                "/monsters/the_kraken": "\u514b\u62c9\u80af",
                "/monsters/the_watcher": "\u89c2\u5bdf\u8005",
                "/monsters/snake": "\u86c7",
                "/monsters/tidal_conjuror": "\u6f6e\u6c50\u53ec\u5524\u5e08",
                "/monsters/treant": "\u6811\u4eba",
                "/monsters/turtle": "\u5fcd\u8005\u9f9f",
                "/monsters/vampire": "\u5438\u8840\u9b3c",
                "/monsters/veyes": "\u590d\u773c",
                "/monsters/werewolf": "\u72fc\u4eba",
                "/monsters/zombie": "\u50f5\u5c38",
                "/monsters/zombie_bear": "\u50f5\u5c38\u718a",
    
                // abilityNames
                "/abilities/poke": "\u7834\u80c6\u4e4b\u523a",
                "/abilities/impale": "\u900f\u9aa8\u4e4b\u523a",
                "/abilities/puncture": "\u7834\u7532\u4e4b\u523a",
                "/abilities/penetrating_strike": "\u8d2f\u5fc3\u4e4b\u523a",
                "/abilities/scratch": "\u722a\u5f71\u65a9",
                "/abilities/cleave": "\u5206\u88c2\u65a9",
                "/abilities/maim": "\u8840\u5203\u65a9",
                "/abilities/crippling_slash": "\u81f4\u6b8b\u65a9",
                "/abilities/smack": "\u91cd\u78be",
                "/abilities/sweep": "\u91cd\u626b",
                "/abilities/stunning_blow": "\u91cd\u9524",
                "/abilities/fracturing_impact": "\u788e\u88c2\u51b2\u51fb",
                "/abilities/shield_bash": "\u76fe\u51fb",
                "/abilities/quick_shot": "\u5feb\u901f\u5c04\u51fb",
                "/abilities/aqua_arrow": "\u6d41\u6c34\u7bad",
                "/abilities/flame_arrow": "\u70c8\u7130\u7bad",
                "/abilities/rain_of_arrows": "\u7bad\u96e8",
                "/abilities/silencing_shot": "\u6c89\u9ed8\u4e4b\u7bad",
                "/abilities/steady_shot": "\u7a33\u5b9a\u5c04\u51fb",
                "/abilities/pestilent_shot": "\u75ab\u75c5\u5c04\u51fb",
                "/abilities/penetrating_shot": "\u8d2f\u7a7f\u5c04\u51fb",
                "/abilities/water_strike": "\u6d41\u6c34\u51b2\u51fb",
                "/abilities/ice_spear": "\u51b0\u67aa\u672f",
                "/abilities/frost_surge": "\u51b0\u971c\u7206\u88c2",
                "/abilities/mana_spring": "\u6cd5\u529b\u55b7\u6cc9",
                "/abilities/entangle": "\u7f20\u7ed5",
                "/abilities/toxic_pollen": "\u5267\u6bd2\u7c89\u5c18",
                "/abilities/natures_veil": "\u81ea\u7136\u83cc\u5e55",
                "/abilities/life_drain": "\u751f\u547d\u5438\u53d6",
                "/abilities/fireball": "\u706b\u7403",
                "/abilities/flame_blast": "\u7194\u5ca9\u7206\u88c2",
                "/abilities/firestorm": "\u706b\u7130\u98ce\u66b4",
                "/abilities/smoke_burst": "\u70df\u7206\u706d\u5f71",
                "/abilities/minor_heal": "\u521d\u7ea7\u81ea\u6108\u672f",
                "/abilities/heal": "\u81ea\u6108\u672f",
                "/abilities/quick_aid": "\u5feb\u901f\u6cbb\u7597\u672f",
                "/abilities/rejuvenate": "\u7fa4\u4f53\u6cbb\u7597\u672f",
                "/abilities/taunt": "\u5632\u8bbd",
                "/abilities/provoke": "\u6311\u8845",
                "/abilities/toughness": "\u575a\u97e7",
                "/abilities/elusiveness": "\u95ea\u907f",
                "/abilities/precision": "\u7cbe\u786e",
                "/abilities/berserk": "\u72c2\u66b4",
                "/abilities/frenzy": "\u72c2\u901f",
                "/abilities/elemental_affinity": "\u5143\u7d20\u589e\u5e45",
                "/abilities/spike_shell": "\u5c16\u523a\u9632\u62a4",
                "/abilities/arcane_reflection": "\u5965\u672f\u53cd\u5c04",
                "/abilities/vampirism": "\u5438\u8840",
                "/abilities/revive": "\u590d\u6d3b",
                "/abilities/insanity": "\u75af\u72c2",
                "/abilities/invincible": "\u65e0\u654c",
                "/abilities/fierce_aura": "\u7269\u7406\u5149\u73af",
                "/abilities/aqua_aura": "\u6d41\u6c34\u5149\u73af",
                "/abilities/sylvan_aura": "\u81ea\u7136\u5149\u73af",
                "/abilities/flame_aura": "\u706b\u7130\u5149\u73af",
                "/abilities/speed_aura": "\u901f\u5ea6\u5149\u73af",
                "/abilities/critical_aura": "\u66b4\u51fb\u5149\u73af",
                "/abilities/promote": "\u664b\u5347",
    
                '/skills/attack': '攻击',
                '/skills/defense': '防御',
                '/skills/intelligence': '智力',
                '/skills/melee': '近战',
                '/skills/stamina': '耐力',
                '/skills/magic': '魔法',
                '/skills/ranged': '远程',
            };
            EnNameDict = {};
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.onInitClientData(msg); }, -99);
            }
    
            onInitClientData(client) {
                const inverseKV = (obj) => {
                    const retobj = {};
                    for (const key in obj) {
                        retobj[obj[key]] = key;
                    }
                    return retobj;
                };
                const initEnNameDict = detailMap => {
                    for (const [hrid, detail] of Object.entries(detailMap)) {
                        this.EnNameDict[hrid] = detail.name;
                    }
                };
                initEnNameDict(client.skillDetailMap);
                initEnNameDict(client.abilityDetailMap);
                initEnNameDict(client.itemDetailMap);
                initEnNameDict(client.combatMonsterDetailMap);
                initEnNameDict(client.actionDetailMap); ``
            }
    
            /**
             * @param {string} hrid
             * @param {'zh' | 'en'} lang
             */
            hridToName(hrid, lang = language) {
                return (lang === 'zh' ? this.ZhNameDict : this.EnNameDict)[hrid] || hrid;
            }
        };
    
        //#endregion
    
    
        //#region InGameController
    
        const ChatPanel = new class {
            /**
             * @param {HTMLElement} elem
             * @param {string | (() => string)} text
             * @param {'ctrlClick' | 'doubleClick' | 'disable'} method
             */
            attachInsertToChat(elem, text, method) {
                const gen = typeof text === 'string' ? () => text : text;
                if (method === 'ctrlClick') {
                    elem.addEventListener('click', () => {
                        if (!Keyboard.isCtrlDown()) return;
                        ChatPanel.insertToChat(gen());
                    });
                } else if (method === 'doubleClick') {
                    elem.addEventListener('dblclick', () => {
                        ChatPanel.insertToChat(gen());
                    });
                }
            }
    
            insertToChat(text) {
                const chatSelector = '#root > div > div > div.GamePage_gamePanel__3uNKN > div.GamePage_contentPanel__Zx4FH > div.GamePage_middlePanel__uDts7 > div.GamePage_chatPanel__mVaVt > div > div.Chat_chatInputContainer__2euR8 > form > input';
                const chat = document.querySelector(chatSelector);
                this.insertToInput(chat, text);
            }
    
            insertToInput(inputElement, text) {
                // From 牛牛聊天增强插件 by HouGuoYu
                const start = inputElement.selectionStart;
                const end = inputElement.selectionEnd;
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                ).set;
                nativeInputValueSetter.call(inputElement, inputElement.value.substring(0, start) + text + inputElement.value.substring(end));
                const event = new Event('input', {
                    bubbles: true,
                    cancelable: true
                });
                inputElement.dispatchEvent(event);
                inputElement.selectionStart = inputElement.selectionEnd = start + text.length;
                inputElement.focus();
            }
        };
    
        //#endregion
    
    
        //#region History
    
        const BattleHistory = new class {
            storageDataName = 'battleHistory';
    
            /**
             * @typedef {Object} BattleHistoryDataEntry
             * @property {string} startTimeLocale
             * @property {number} startTime
             * @property {number} duration
             * @property {number} runCount
             * @property {number} eph
             * @property {number} income
             * @property {number} profit
             * @property {number} luck
             * @property {CountedItem[]} drops
             */
            /**
             * @typedef {Object} BattleHistoryData
             * @property {string} playerName
             * @property {{ [mapHrid: string]: { [timeStamp: number]: BattleHistoryDataEntry } }} data
             */
            /** @type {{ [playerId: number]: BattleHistoryData }} */
            history = {};
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.onInitClientData(msg); });
                MessageHandler.addListener('new_battle', msg => { this.onNewBattle(msg); });
            }
    
            onInitClientData(_) {
                this.load();
            }
    
            onNewBattle(_) {
                this.update();
            }
    
            update() {
                if (!BattleData.inBattle) return;
                const mapHrid = BattleData.currentMapHrid;
                const mapData = BattleData.mapData[mapHrid];
                if (!mapData) return;
                const bossWave = mapData.spawnInfo.bossWave;
                if (BattleData.runCount === 1) return;
                if (bossWave && (BattleData.runCount - 1) % bossWave !== 0) return;
                const stat = BattleDropAnalyzer.analyzeCurrent();
                const /** @type {BattleHistoryDataEntry} */ current = {
                    startTimeLocale: Utils.formatDate(new Date(BattleData.startTime * 1000)),
                    startTime: BattleData.startTime,
                    duration: BattleData.duration,
                    runCount: BattleData.runCount,
                    eph: 3600 * (BattleData.runCount - 1) / BattleData.duration,
                    income: stat.currentIncome.income,
                    profit: stat.currentIncome.profit,
                    luck: stat.luck,
                    drops: BattleData.playerLoot[CharacterData.playerName].items,
                };
                const playerId = CharacterData.playerId;
                const key = Math.round(BattleData.startTime);
                this.history[playerId] ??= { playerName: CharacterData.playerName, data: {} };
                (this.history[playerId].data[mapHrid] ??= {})[key] = current;
                this.save();
            }
    
            load() {
                this.history = LocalStorageData.get(this.storageDataName) || {};
            }
            save() {
                LocalStorageData.set(this.storageDataName, this.history);
            }
        }
    
        const ChestOpenHistory = new class {
            /**
             * @typedef {Object} ChestOpenHistoryData
             * @property {string} playerName
             * @property {{ [mapHrid: string]: { [timeStamp: number]: BattleHistoryDataEntry } }} data
             */
            /** @type {{ [playerId: number]: BattleHistoryData }} */
            history = {};
    
            update() {
    
            }
            loadFromEdibleTools() {
    
            }
        }
    
        //#endregion
    
    
        const SettingsUi = new class {
            popup = new TabbedPopup();
    
            settingRow(text, desc, input) {
                const textDiv = Ui.div('lll_label', text);
                if (desc !== null) Tooltip.attach(textDiv, Tooltip.description(null, desc), 'center');
                return Ui.div('lll_div_row', [textDiv, input]);
            }
    
            constructUpdateMarket() {
                const locale = UiLocale.settings.market;
                let updateMarketInfo = Ui.div('lll_label',
                    Market.marketData?.time ?
                        `${locale.lastUpdated[language]}: ${new Date(Market.marketData.time * 1000).toLocaleString()}` :
                        locale.fetchMarketDataFail[language]
                );
                let updateMarketBtn = Ui.button(locale.updateMarket[language]);
                updateMarketBtn.onclick = () => {
                    updateMarketInfo.style.minWidth = getComputedStyle(updateMarketInfo).width;
                    updateMarketInfo.innerHTML = `${locale.updating[language]}...`;
                    Market.update(() => {
                        updateMarketInfo.innerHTML = `${locale.updateFinish[language]}: ${Utils.formatDate(new Date(Market.marketData.time * 1000))}`;
                    });
                };
                return Ui.div('lll_div_row', [updateMarketBtn, updateMarketInfo]);
            }
    
            constructMarketPanel() {
                let panel = Ui.div('lll_div_settingPanelContent');
                const locale = UiLocale.settings.market;
    
                const /** @type {HTMLInputElement} */ apiAddrInput = Ui.elem('input', 'lll_input');
                const setApiAddrInput = () => {
                    const src = Config.market.source;
                    if (src.type !== 'custom') {
                        apiAddrInput.readOnly = true;
                        apiAddrInput.value = Market.apiMap[src.type].addr;
                    } else {
                        apiAddrInput.readOnly = false;
                    }
                };
                apiAddrInput.onchange = () => {
                    Config.market.source.addr = apiAddrInput.value;
                    ConfigManager.saveConfig();
                };
                setApiAddrInput();
                const apiSelect = Ui.elem('select', 'lll_input_select');
                const apiList = Object.entries(Market.apiMap)
                    .sort((a, b) => a[1].order - b[1].order);
                for (let [type, info] of apiList) {
                    const text = info.desc;
                    let option = new Option(text, type);
                    if (Config.market.source.type === type) option.selected = true;
                    apiSelect.options.add(option);
                }
                apiSelect.onchange = () => {
                    const type = apiSelect.options[apiSelect.selectedIndex].value;
                    Config.market.source.type = type;
                    setApiAddrInput();
                    Config.market.source.addr = apiAddrInput.value;
                    ConfigManager.saveConfig();
                };
                panel.appendChild(SettingsUi.settingRow(locale.apiSource[language], null, apiSelect));
                panel.appendChild(SettingsUi.settingRow(locale.apiAddr[language], null, apiAddrInput));
                panel.appendChild(SettingsUi.settingRow(locale.autoUpdateTime[language], null, Ui.numberInput({
                    initValue: Config.market.autoUpdateInterval,
                    minValue: 0,
                    maxValue: 10000,
                    onchange: val => {
                        Config.market.autoUpdateInterval = val;
                        ConfigManager.saveConfig();
                    }
                })));
                panel.appendChild(this.constructUpdateMarket());
    
                panel.appendChild(Ui.div('lll_separator'));
    
                panel.appendChild(SettingsUi.settingRow(
                    locale.computeNetProfit[language], locale.computeNetProfitDesc[language],
                    Ui.checkBox({
                        checked: Config.market.computeNetProfit,
                        onchange: checked => {
                            Config.market.computeNetProfit = checked;
                            ConfigManager.saveConfig();
                            Market.initMarketData();
                        }
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.computeNonTradable[language], locale.computeNonTradableDesc[language],
                    Ui.checkBox({
                        checked: Config.market.computeNonTradable,
                        onchange: checked => {
                            Config.market.computeNonTradable = checked;
                            ConfigManager.saveConfig();
                            Market.initMarketData();
                        }
                    })
                ));
    
                return panel;
            }
    
            constructMiscPanel() {
                let panel = Ui.div('lll_div_settingPanelContent');
                const locale = UiLocale.settings.misc;
    
    
                const langSelect = Ui.elem('select', 'lll_input_select');
                const langList = [
                    ['default', locale.languageDefault[language]],
                    ['zh', '中文'],
                    ['en', 'English'],
                ]
                for (let [type, desc] of langList) {
                    let option = new Option(desc, type);
                    if (Config.general.language === type) option.selected = true;
                    langSelect.options.add(option);
                }
                langSelect.onchange = () => {
                    let type = langSelect.options[langSelect.selectedIndex].value;
                    Config.general.language = type;
                    updateLanguage();
                    ConfigManager.saveConfig();
                };
                panel.appendChild(SettingsUi.settingRow(locale.language[language], null, langSelect));
    
                panel.appendChild(Ui.div('lll_separator'));
    
                panel.appendChild(SettingsUi.settingRow(
                    locale.sampleRate[language], locale.sampleRateDesc[language],
                    Ui.slider({
                        initValue: Config.charaFunc.samples,
                        minValue: 64,
                        maxValue: 65536,
                        mapFunc: x => Math.pow(2, x),
                        invMapFunc: x => Math.log2(x),
                        onchange: samples => {
                            Config.charaFunc.samples = samples;
                            ConfigManager.saveConfig();
                        },
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.interpolationCount[language], locale.interpolationCountDesc[language],
                    Ui.slider({
                        initValue: Config.chart.interpolatePoints,
                        minValue: 64,
                        maxValue: 4096,
                        mapFunc: x => Math.pow(2, x),
                        invMapFunc: x => Math.log2(x),
                        onchange: samples => {
                            Config.chart.interpolatePoints = samples;
                            ConfigManager.saveConfig();
                        },
                    })
                ));
    
                return panel;
            }
    
            showPopup() {
                this.popup.showSettings = false;
                this.popup.open();
                this.popup.addTab(UiLocale.settings.market.tabLabel[language], () => this.constructMarketPanel(), null);
                this.popup.addTab(UiLocale.battleDrop.tabLabel[language], () => BattleDropAnalyzerUi.constructSettingsPanel(), null);
                this.popup.addTab(UiLocale.chestDrop.tabLabel[language], () => ChestDropAnalyzerUi.constructSettingsPanel(), null);
                this.popup.addTab(UiLocale.settings.misc.tabLabel[language], () => this.constructMiscPanel(), null);
            }
    
        }
    
    
        //#region BattleDropAnalyzer
    
        const BattleDropAnalyzer = new class {
            /**
             * @typedef {Object} SpawnInfo
             * @property {number} bossWave
             * @property {number} maxSpawnCount
             * @property {number} maxTotalStrength
             * @property {Object<string, number>} expectedSpawns
             * @property {{ hrid: string, strength: number, rate: number, eliterTier: number }[]} spawns
             */
            /**
             * @typedef {Object} MapDropData
             * @property {SpawnInfo} spawnInfo
             * @property {number} bossCount
             * @property {number} normalCount
             * @property {Object<string, ItemDropData[]>} bossDrops
             * @property {Object<string, ItemDropData[]>} monsterDrops
             */
    
            computeExpectedSpawns(spawnInfo) {
                const { spawns, maxSpawnCount: K, maxTotalStrength: N } = spawnInfo;
                const res = {};
                spawns.forEach(m => { res[m.hrid] = 0; });
    
                const dp = Array(N + 1);
                for (let i = 0; i <= N; ++i) dp[i] = Array(K + 1).fill(0);
                dp[0][0] = 1;
    
                for (let i = 0; i <= N; ++i) {
                    for (let j = 0; j <= K; ++j) {
                        for (const monster of spawns) {
                            const ni = i + monster.strength, nj = j + 1;
                            if (ni > N || nj > K) continue;
                            let val = dp[i][j] * monster.rate;
                            dp[ni][nj] += val;
                            res[monster.hrid] += val;
                        }
                    }
                }
                return res;
            }
            dropListExpectation(dropData) {
                const itemCounts = {};
    
                const addToCounts = (item, count) => {
                    const hrid = item.hrid; // 假设物品唯一标识符为 hrid
                    const expectedQty = count * DropAnalyzer.itemCountExpt(item);
    
                    if (!itemCounts[hrid]) {
                        itemCounts[hrid] = 0;
                    }
                    itemCounts[hrid] += expectedQty;
                };
    
                for (const [_, drops] of Object.entries(dropData.bossDrops)) {
                    const cnt = dropData.bossCount;
                    for (const item of drops) {
                        addToCounts(item, cnt);
                    }
                }
    
                const expectedSpawns = this.computeExpectedSpawns(dropData.spawnInfo);
                for (const [hrid, drops] of Object.entries(dropData.monsterDrops)) {
                    const cnt = (expectedSpawns[hrid] || 0) * dropData.normalCount;
                    for (const item of drops) {
                        addToCounts(item, cnt);
                    }
                }
    
                return itemCounts;
            }
            dropExpectation(dropData) {
                let E = 0;
                for (const [_, drops] of Object.entries(dropData.bossDrops)) {
                    const cnt = dropData.bossCount;
                    for (const item of drops) E += cnt * DropAnalyzer.itemCountExpt(item) * item.price;
                }
                const expectedSpawns = this.computeExpectedSpawns(dropData.spawnInfo);
                for (const [hrid, drops] of Object.entries(dropData.monsterDrops)) {
                    const cnt = expectedSpawns[hrid] * dropData.normalCount;
                    for (const item of drops) E += cnt * DropAnalyzer.itemCountExpt(item) * item.price;
                }
                return E;
            }
            dropVariance(dropData) {
                let Var = 0;
                for (const [_, drops] of Object.entries(dropData.bossDrops)) {
                    const cnt = dropData.bossCount;
                    for (const item of drops) Var += cnt * DropAnalyzer.itemCountVar(item) * item.price * item.price;
                }
                const expectedSpawns = this.computeExpectedSpawns(dropData.spawnInfo);
                for (const [hrid, drops] of Object.entries(dropData.monsterDrops)) {
                    const cnt = expectedSpawns[hrid] * dropData.normalCount;
                    for (const item of drops) Var += cnt * DropAnalyzer.itemCountVar(item) * item.price * item.price;
                }
                return Var;
            }
    
            #monsterCF(monsterDrops) {
                const cfs = [];
                for (const drop of monsterDrops) {
                    cfs.push(DropAnalyzer.charaFunc(drop));
                }
                return CharaFunc.mulList(cfs);
            }
            #getSpawnTransGraph(spawnInfo) {
                const { spawns, maxSpawnCount: K, maxTotalStrength: N } = spawnInfo;
    
                const idMap = {};
                const nodes = [];
                const hasId = (i, j) => { return idMap.hasOwnProperty(i * (K + 1) + j); };
                const getId = (i, j) => {
                    const h = i * (K + 1) + j;
                    if (!hasId(i, j)) {
                        idMap[h] = nodes.length;
                        nodes.push({ init: 0, edges: [] });
                    }
                    return idMap[h];
                };
                getId(0, 0);
    
                for (let i = 0; i <= N; ++i) {
                    for (let j = 0; j <= K; ++j) {
                        if (!hasId(i, j)) continue;
                        const id = getId(i, j);
                        for (const monster of spawns) {
                            const ni = i + monster.strength, nj = j + 1;
                            if (ni > N || nj > K) {
                                nodes[id].init += monster.rate;
                                continue;
                            }
                            nodes[id].edges.push({
                                to: getId(ni, nj),
                                hrid: monster.hrid,
                            });
                        }
                    }
                }
                return nodes;
            }
            #normalWaveCF(spawnInfo, monsterDrops) {
                const spawns = spawnInfo.spawns;
                const cfs = {};
                for (const monster of spawns) {
                    cfs[monster.hrid] = this.#monsterCF(monsterDrops[monster.hrid]);
                }
                const transGraph = this.#getSpawnTransGraph(spawnInfo);
                return (samples, scale) => {
                    const cfTab = {};
                    for (const monster of spawns) {
                        const z = cfs[monster.hrid](samples, scale);
                        ComplexVector.mulReEq(z, monster.rate);
                        cfTab[monster.hrid] = z;
                    }
                    const val = Array(transGraph.length);
                    for (let u = transGraph.length - 1; u >= 0; --u) {
                        val[u] = ComplexVector.constantRe(samples, transGraph[u].init);
                        for (const e of transGraph[u].edges) {
                            ComplexVector.addMulEq(val[u], val[e.to], cfTab[e.hrid]);
                        }
                    }
                    return val[0];
                };
            }
            battleCF(dropData) {
                if (Config.battleDrop.verbose) out("DropData:", dropData)
                const normalCF = this.#normalWaveCF(dropData.spawnInfo, dropData.monsterDrops);
                const bossCF = CharaFunc.mulList(
                    Object.values(dropData.bossDrops).map(m => this.#monsterCF(m)));
                return CharaFunc.mul(
                    CharaFunc.pow(normalCF, dropData.normalCount),
                    CharaFunc.pow(bossCF, dropData.bossCount)
                );
            }
    
            battleCDF(dropData) {
                const start = new Date().getTime();
                const samples = Config.charaFunc.samples;
                const cf = BattleDropAnalyzer.battleCF(dropData);
                let cdf;
                const minLimit = Config.battleDrop.analyzer.minLimit;
                const dungeonDrop = dropData.bossDrops?.['_dungeon']?.[0];
                if (!dungeonDrop) {
                    const perWaveLimit = Config.battleDrop.analyzer.perWaveLimit;
                    const limit = Math.max(minLimit, perWaveLimit * (dropData.bossCount + dropData.normalCount));
                    cdf = CharaFunc.getCDF(cf, samples, limit);
                } else {
                    const chestPrice = Market.getPriceByName(dungeonDrop.name);
                    const epoch = dropData.bossCount;
                    const count = (dungeonDrop.minCount + dungeonDrop.maxCount) / 2;
                    const baseCount = Math.floor(count);
                    const basePrice = chestPrice * baseCount * epoch;
                    const limit = Math.max(samples, epoch);
                    const decCDF = CharaFunc.getCDF(CharaFunc.pow(DropAnalyzer.charaFunc({
                        hrid: dungeonDrop.hrid,
                        minCount: count - baseCount,
                        maxCount: count - baseCount,
                        dropRate: 1,
                        price: 1,
                    }), epoch), samples, limit);
                    cdf = {
                        limit: decCDF.limit * chestPrice + basePrice,
                        cdf: (x) => {
                            const chestCount = (x - basePrice) / chestPrice;
                            return decCDF.cdf(chestCount + 16 / samples);
                        },
                    };
                }
    
                const end = new Date().getTime();
                if (Config.battleDrop.verbose) out(`${end - start}ms`);
                return cdf;
            }
    
            getItemRarity(itemHrid) {
                const value = Market.getPriceByHrid(itemHrid, 'bid', 0, false);
                const count = BattleData.itemFreq[itemHrid];
                let r = 0;
                if (count >= 1 || value <= 1000) {
                    if (itemHrid.includes('_chest')) r = 0;
                    else r = -1;
                } else if (itemHrid.includes('_aura')
                    || itemHrid === '/items/revive'
                    || itemHrid === '/items/insanity'
                    || itemHrid === '/items/invincible') r = 6; // 蓝书
                else if (value >= 2e6) r = 5; // 发光红
                else if (value >= 8e5) r = 4; // 橙
                else if (value >= 2.5e5) r = 3; // 紫
                else if (value >= 2e5) r = 2; // 蓝
                else if (value >= 1e5 && count <= 0.02) r = 2; // 蓝
                else if (value >= 5e4 && count <= 7e-3) r = 2; // 蓝
                else if (value >= 3e4) r = 1; // 绿
                return r;
            }
    
            analyzeCurrent(playerName = null) {
                playerName ??= CharacterData.playerName;
                const foodConsumption = (player) => {
                    const foodData = JSON.parse(localStorage.getItem('Edible_Tools') ?? '{}')
                        .Combat_Data?.Combat_Player_Data?.[player]?.Food_Data?.Statistics;
                    if (!foodData || !foodData.Time) {
                        let totalFoodPrice = 0;
                        const playerFood = BattleData.playerFood[player];
                        for (let itemName in playerFood.food) {
                            const foodPrice = Market.getPriceByName(itemName, 'ask') || 500;
                            const itemNameLower = itemName.toLowerCase();
                            let consumptionRate = 0;
                            if (itemNameLower.endsWith('coffee')) {
                                consumptionRate = 300 / (1 + (playerFood.drinkConcentration || 0));
                            } else if (itemNameLower.endsWith('donut') || itemNameLower.endsWith('cake')) {
                                consumptionRate = 60;
                            } else if (itemNameLower.endsWith('gummy') || itemNameLower.endsWith('yogurt')) {
                                consumptionRate = 60;
                            }
                            totalFoodPrice += foodPrice / consumptionRate;
                        }
                        return { isSteady: false, price: totalFoodPrice };
                    }
                    let totalFoodPrice = 0;
                    for (let [itemHrid, count] of Object.entries(foodData.Food)) {
                        const foodPrice = Market.getPriceByHrid(itemHrid, 'ask') || 500;
                        totalFoodPrice += foodPrice * count;
                    }
                    return { isSteady: true, price: totalFoodPrice / foodData.Time };
                };
    
                const food = foodConsumption(playerName);
                const dropData = BattleData.getCurrentDropData(playerName);
                const dropListExpectation = BattleDropAnalyzer.dropListExpectation(dropData);
                const income = BattleData.playerLoot[playerName].price();
                const incomeExpectation = BattleDropAnalyzer.dropExpectation(dropData);
                const incomeVariance = BattleDropAnalyzer.dropVariance(dropData);
                const dailyIncome = 86400 * income / BattleData.duration;
                const dailyIncomeExpectation = 86400 * incomeExpectation / BattleData.duration;
                const dailyIncomeVariance = 86400 * incomeVariance / BattleData.duration;
                const profit = income - food.price * BattleData.duration;
                const profitExpectation = incomeExpectation - food.price * BattleData.duration;
                const dailyProfit = dailyIncome - 86400 * food.price;
                const dailyProfitExpectation = dailyIncomeExpectation - 86400 * food.price;
                const luck = BattleDropAnalyzer.battleCDF(dropData).cdf(income);
                return {
                    /** @type {MapDropData} */ dropData: dropData,
                    currentIncome: {
                        /** @type {number} */ income: income,
                        /** @type {number} */ expectation: incomeExpectation,
                        /** @type {number} */ variance: incomeVariance,
                        /** @type {number} */ stddev: Math.sqrt(incomeVariance),
                        /** @type {object}*/dropExpect: dropListExpectation,
                    },
                    dailyIncome: {
                        /** @type {number} */ income: dailyIncome,
                        /** @type {number} */ expectation: dailyIncomeExpectation,
                        /** @type {number} */ variance: dailyIncomeVariance,
                        /** @type {number} */ stddev: Math.sqrt(dailyIncomeVariance),
                    },
                    currentProfit: {
                        /** @type {number} */ profit: profit,
                        /** @type {number} */ expectation: profitExpectation,
                    },
                    dailyProfit: {
                        /** @type {number} */ profit: dailyProfit,
                        /** @type {number} */ expectation: dailyProfitExpectation,
                    },
                    /** @type {number} */ luck: luck,
                    /** @type {boolean} */ isSteady: food.isSteady,
                }
            }
        };
    
        const BattleDropAnalyzerUi = new class {
            popup = new TabbedPopup();
            contentDiv = null;
    
            /** @type {Object<string, { desc: string, weight: (item: CountedItem) => number }>} */
            itemSortOrderMap = {
                'totalBid': {
                    desc: UiLocale.battleDrop.sortOrder.totalBid[language],
                    weight: item => Market.getPriceByHrid(item.hrid) * item.count,
                },
                'unitBid': {
                    desc: UiLocale.battleDrop.sortOrder.unitBid[language],
                    weight: item => Market.getPriceByHrid(item.hrid),
                },
            }
    
            constructor() {
                // 在加载完分赃按钮后添加统计按钮
                this.observe();
    
                document.addEventListener('copy', (e) => {
                    // @ts-ignore
                    if (!document.getElementById('lll_battle_overviewPanel')?.contains(e.target)) return;
                    if (!e.clipboardData) return;
                    let content = window?.getSelection().toString();
                    content = content.replaceAll(/└|├|\x20/g, '').replaceAll('\t', '').replaceAll('\n', '   ').replaceAll(':', ': ');
                    e.clipboardData.setData('text/plain', content.trim());
                    e.preventDefault();
                });
            }
    
            observe() {
                const observer = new MutationObserver((mutationsList, observer) => {
                    mutationsList.forEach(mutation => {
                        mutation.addedNodes.forEach(addedNode => {
                            // @ts-ignore
                            const classList = addedNode.classList;
                            if (!classList) return;
    
                            // 切换页面
                            if (classList.contains('MainPanel_subPanelContainer__1i-H9')) {
                                // @ts-ignore
                                if (addedNode.querySelector(".CombatPanel_combatPanel__QylPo")) {
                                    this.addButtonBeforeEdible();
                                }
                            }
    
                            // 初始化
                            if (classList.contains('GamePage_contentPanel__Zx4FH')) {
                                // @ts-ignore
                                if (addedNode.querySelector('div.GamePage_middlePanel__uDts7 > div.GamePage_mainPanel__2njyb > div > div:nth-child(1) > div.CombatPanel_combatPanel__QylPo')) {
                                    dbg(addedNode);
                                    this.addButtonBeforeEdible();
                                }
                            }
    
                            // 食用工具原来的按钮
                            if (classList.contains('Button_battlePlayerLoot__custom')) {
                                this.addButtonAfterEdible();
                            }
                        });
                    });
                });
                const rootNode = document.body;
                const config = { childList: true, subtree: true };
                observer.observe(rootNode, config);
                this.addButtonBeforeEdible();
            }
    
            constructOverviewPanel() {
                const locale = UiLocale.battleDrop.overview;
    
                const itemStyle = (rarity) => {
                    if (rarity == 6) return `color:rgb(100, 219, 255); text-shadow: 0 0 2px rgb(12, 59, 110), 0 0 3px rgb(64, 201, 236), 0 0 5px rgb(145, 231, 253);`;
                    else if (rarity == 5) return `color: #ff8888; text-shadow: 0 0 1px #800000, 0 0 2px #ff0000;`;
                    else if (rarity == 4) return `color:rgb(255, 168, 68);`;
                    else if (rarity == 3) return `color:rgb(229, 134, 255);`;
                    else if (rarity == 2) return `color:rgb(169, 213, 255);`;
                    else if (rarity == 1) return `color:rgb(185, 241, 190);`;
                    else if (rarity == 0) return `color:rgb(255, 255, 255);`;
                    return `color:rgb(180, 180, 180);`;
                };
                const itemText = (hrid, rarity, count, countExpect) => {
                    // 创建图标
                    let svgIcon = Ui.itemSvgIcon(hrid);
                    let itemDiv;
                    if (countExpect === 0) {
                        itemDiv = Ui.div('lll_div_item', `
                        <span style="color: white; margin-right: 3px; text-align: center; font-size: 16px; line-height: 1.2;">
                            ${Utils.formatPrice(count)}
                        </span>
    					${svgIcon.outerHTML}
    					<span style="${itemStyle(rarity)} margin-left: 3px; white-space: nowrap; font-size: 16px; line-height: 1.2;">
                            ${Localizer.hridToName(hrid)}
                        </span>
    				`)
                    } else {
                        itemDiv = Ui.div('lll_div_item', `
                        <span style="color: white; margin-right: 3px; text-align: center; font-size: 16px; line-height: 1.2;">
                            ${Utils.formatPrice(count)} / ${countExpect < 1 ? countExpect.toFixed(2) : countExpect < 10 ? countExpect.toFixed(1) : Utils.formatPrice(countExpect)}
                        </span>
    					${svgIcon.outerHTML}
    					<span style="${itemStyle(rarity)} margin-left: 3px; white-space: nowrap; font-size: 16px; line-height: 1.2;">
                            ${Localizer.hridToName(hrid)}
                        </span>
    				`)
                    }
                    Tooltip.attach(itemDiv, Tooltip.item(hrid, count));
                    return itemDiv;
                };
                const getPlayerDiv = (player) => {
                    let playerName = Ui.div('lll_div_cardTitle large', player);
                    playerName.onclick = () => {
                        const height = getComputedStyle(playerName).height;
                        playerName.style.height = height;
                        playerName.innerHTML = playerName.innerHTML === '' ? player : '';
                    };
                    let innerText = Ui.div({ style: 'fontSize: 16px;' });
    
                    let playerDiv = Ui.div('lll_div_card', [playerName, innerText]);
    
                    const stat = BattleDropAnalyzer.analyzeCurrent(player);
                    const isBeatAvg = (stat.currentIncome.income - stat.currentIncome.expectation) / Math.sqrt(stat.currentIncome.variance); // -1 ~ 1
                    const colorLuck = Utils.luckColor(stat.luck);
                    const colorAvg = Utils.luckColor(isBeatAvg / 2 + 0.5);
    
                    // 计算经验
                    let maxSkill = null, maxXp = 0, totalXp = 0;
                    if (BattleData.playerStat[player]?.skillExp) {
                        for (let skill in BattleData.playerStat[player].skillExp) {
                            let xp = BattleData.playerStat[player].skillExp[skill];
                            totalXp += xp
                            if (xp > maxXp) { maxXp = xp; maxSkill = skill; }
                        }
                    }
                    const xpName = Localizer.hridToName(maxSkill);
                    const xpPerHour = Utils.formatPrice(3600 * maxXp / BattleData.duration);
                    const totalXpPerHour = Utils.formatPrice(3600 * totalXp / BattleData.duration);
                    const xpPerDay = Utils.formatPrice(86400 * maxXp / BattleData.duration);
                    const totalXpPerDay = Utils.formatPrice(86400 * totalXp / BattleData.duration);
    
                    // 计算每小时死亡次数
                    const deathPerHour = 3600 * (BattleData.playerStat[player]?.deathCount || 0) / BattleData.duration;
                    const colorDeath = Utils.luckColor(1 - Math.min(deathPerHour, 1))
    
                    // 绘制表格
                    const legacyUi = Config.battleDrop.ui.overviewUseLegacyUi;
                    const showStdDev = Config.battleDrop.ui.overviewShowStdDev;
                    const showDeathCount = Config.battleDrop.ui.overviewShowDeathCount;
                    const showXpPerDay = Config.battleDrop.ui.overviewShowXpPerDay;
    
                    const tabText = (x) => `<td style="text-align: left;">${x}:&thinsp;</td>`;
                    const tabValue = (x) => {
                        let i = x.length - 1;
                        for (; i >= 0; --i) if (x[i] >= '0' && x[i] <= '9') break;
                        const unit = x.slice(i + 1);
                        let num = x.slice(0, i + 1);
                        return `<td style="text-align: left;"><span style="margin: 0 -2px 0 0;">${num}</span></td><td>${unit}</td>`;
                    };
                    const tabSeparator = () => Ui.elem('tr', null, '<td colspan="3"><div class="lll_separator" style="margin: 6px -3px"></div></td>');
                    const tabPad = () => Ui.elem('tr', null, '<td colspan="3"><div style="margin-top: 3px"></div></td>');
                    const tabRow = (color, child) => Ui.elem('tr', { style: `color: ${color};` }, child);
                    const tabRowLight = (color, child) => Ui.elem('tr', { style: `color: ${color}; font-weight: normal;` }, child);
                    const tabNoSel = (x) => `<span class="lll_text_noSelect" style="color: var(--border); font-family: sans-serif;">${x}</span>`;
    
                    const tableOld = Ui.elem('table', { style: 'font-weight: bold; line-height: 1.2; width: 100%;' }, [
                        tabRow(colorLuck, tabText(locale.income[language]) + tabValue(Utils.formatPrice(stat.currentIncome.income))),
                        tabRow(colorLuck, tabText(locale.dailyIncome[language]) + tabValue(Utils.formatPrice(stat.dailyIncome.income) + '/d')),
                        tabRow(colorLuck, tabText(locale.luck[language]) + tabValue(Utils.formatLuck(stat.luck))),
                        tabSeparator(),
                        tabRow(colorAvg, tabText(locale.incomeExpt[language]) + tabValue(Utils.formatPrice(stat.currentIncome.expectation))),
                        showStdDev ? tabRow(colorAvg, tabText(tabNoSel('└') + locale.stdDev[language]) + tabValue(Utils.formatPrice(Math.sqrt(stat.currentIncome.variance)))) : null,
                        tabRow(colorAvg, tabText(locale.dailyIncomeExpt[language]) + tabValue(Utils.formatPrice(stat.dailyIncome.expectation) + '/d')),
                        showStdDev ? tabRow(colorAvg, tabText(tabNoSel('└') + locale.stdDev[language]) + tabValue(Utils.formatPrice(Math.sqrt(stat.dailyIncome.variance)))) : null,
                        tabRow(colorAvg, tabText(locale.dailyProfitExpt[language]) + tabValue(
                            (stat.isSteady ? '' : '<span style="margin: 0 1px 0 0;">≥</span>')
                            + Utils.formatPrice(stat.dailyProfit.expectation, { precision: stat.isSteady ? 4 : 3 })
                                .replace('-', '<span style="font-family: Consolas, monaco, monospace;">-</span>')
                            + '/d'
                        )),
                        tabSeparator(),
                        ...(showXpPerDay?[
                            tabRow('#ffc107', tabText(xpName + locale.experience[language]) + tabValue(xpPerDay + '/d')),
                            tabRow('#ffc107', tabText(locale.total[language] + locale.experience[language]) + tabValue(totalXpPerDay + '/d')),
                        ]:[
                            tabRow('#ffc107', tabText(xpName + locale.experience[language]) + tabValue(xpPerHour + '/h')),
                            tabRow('#ffc107', tabText(locale.total[language] + locale.experience[language]) + tabValue(totalXpPerHour + '/h')),
                        ]),
                        ...(showDeathCount?[
                            tabSeparator(),
                            tabRow(colorDeath, tabText(locale.deathCount[language]) + tabValue(deathPerHour.toFixed(2) + '/h'))
                        ]:[]),
                    ]);
                    const tableNew = Ui.elem('table', { style: 'font-weight: bold; line-height: 1.1; width: 100%;' }, [
                        tabRow(colorLuck, tabText(locale.luck[language]) + tabValue(Utils.formatLuck(stat.luck))),
                        tabPad(),
                        tabRow(colorLuck, tabText(locale.income[language]) + tabValue(Utils.formatPrice(stat.currentIncome.income))),
                        tabRowLight(colorAvg, tabText(tabNoSel(showStdDev ? '├' : '└') + locale.mean[language]) + tabValue(Utils.formatPrice(stat.currentIncome.expectation))),
                        showStdDev ? tabRowLight(colorAvg, tabText(tabNoSel('└') + locale.stdDev[language]) + tabValue(Utils.formatPrice(Math.sqrt(stat.currentIncome.variance)))) : null,
                        tabPad(),
                        tabRow(colorLuck, tabText(locale.dailyIncome[language]) + tabValue(Utils.formatPrice(stat.dailyIncome.income) + '/d')),
                        tabRowLight(colorAvg, tabText(tabNoSel(showStdDev ? '├' : '└') + locale.mean[language]) + tabValue(Utils.formatPrice(stat.dailyIncome.expectation) + '/d')),
                        showStdDev ? tabRowLight(colorAvg, tabText(tabNoSel('└') + locale.stdDev[language]) + tabValue(Utils.formatPrice(Math.sqrt(stat.dailyIncome.variance)))) : null,
                        tabPad(),
                        tabRow(colorLuck, tabText(locale.dailyProfit[language]) + tabValue(
                            (stat.isSteady ? '' : '<span style="margin: 0 1px 0 0;">≥</span>')
                            + Utils.formatPrice(stat.dailyProfit.profit, { precision: stat.isSteady ? 4 : 3 })
                                .replace('-', '<span style="font-family: Consolas, monaco, monospace;">-</span>')
                            + '/d'
                        )),
                        tabRowLight(colorAvg, tabText(tabNoSel('└') + locale.mean[language]) + tabValue(
                            (stat.isSteady ? '' : '<span style="margin: 0 1px 0 0;">≥</span>')
                            + Utils.formatPrice(stat.dailyProfit.expectation, { precision: stat.isSteady ? 4 : 3 })
                                .replace('-', '<span style="font-family: Consolas, monaco, monospace;">-</span>')
                            + '/d'
                        )),
                        tabSeparator(),
                        ...(showXpPerDay?[
                            tabRow('#ffc107', tabText(xpName + locale.experience[language]) + tabValue(xpPerDay + '/d')),
                            tabRow('#ffc107', tabText(locale.total[language] + locale.experience[language]) + tabValue(totalXpPerDay + '/d')),
                        ]:[
                            tabRow('#ffc107', tabText(xpName + locale.experience[language]) + tabValue(xpPerHour + '/h')),
                            tabRow('#ffc107', tabText(locale.total[language] + locale.experience[language]) + tabValue(totalXpPerHour + '/h')),
                        ]),
                        ...(showDeathCount?[
                            tabSeparator(),
                            tabRow(colorDeath, tabText(locale.deathCount[language]) + tabValue(deathPerHour.toFixed(2) + '/h'))
                        ]:[]),
                    ]);
                    const table = legacyUi ? tableOld : tableNew;
                    const chatMsg = () => {
                        const msg = Config.battleDrop.ui.overviewMsgFmt
                            .replace('{income}', Utils.formatPrice(stat.currentIncome.income))
                            .replace('{income.mean}', Utils.formatPrice(stat.currentIncome.expectation))
                            .replace('{income.stddev}', Utils.formatPrice(stat.currentIncome.stddev))
                            .replace('{income.daily}', Utils.formatPrice(stat.dailyIncome.income))
                            .replace('{income.daily.mean}', Utils.formatPrice(stat.dailyIncome.expectation))
                            .replace('{income.daily.stddev}', Utils.formatPrice(stat.dailyIncome.stddev))
                            .replace('{profit}', Utils.formatPrice(stat.currentProfit.profit))
                            .replace('{profit.mean}', Utils.formatPrice(stat.currentProfit.expectation))
                            .replace('{profit.daily}', Utils.formatPrice(stat.dailyProfit.profit))
                            .replace('{profit.daily.mean}', Utils.formatPrice(stat.dailyProfit.expectation))
                            .replace('{luck}', Utils.formatLuck(stat.luck));
                        return msg;
                    }
                    ChatPanel.attachInsertToChat(table, chatMsg, Config.battleDrop.ui.overviewInsertToChatAction);
                    innerText.appendChild(table);
    
                    let itemsDiv = Ui.div({ style: 'margin-top: 10px; gap: 8px; display: flex; flex-direction: column;' });
                    innerText.appendChild(itemsDiv);
    
                    const order = this.itemSortOrderMap[Config.battleDrop.ui.overviewItemSortOrder].weight;
                    let itemCount = 0;
                    if (Config.battleDrop.ui.overviewShowExpectDrop) {
                        const dropItems = BattleData.playerLoot[player].items.reduce((acc, item) => {
                            acc[item.hrid] = item.count;
                            return acc;
                        }, {});
                        const dropItemsExpect = Object.entries(stat.currentIncome.dropExpect).map(([hrid, count]) => ({
                            hrid: hrid,
                            count: count,
                            dropCount: dropItems[hrid] || 0,
                        })).sort(
                            (a, b) => order(b) - order(a)
                        )
                        for (let item of dropItemsExpect) {
                            if (item.count === 0) continue;
                            const hrid = item.hrid;
                            const rarity = BattleDropAnalyzer.getItemRarity(hrid);
                            if (rarity < Config.battleDrop.ui.overviewItemMinRarity) continue;
                            itemsDiv.appendChild(itemText(hrid, rarity, item.dropCount, item.count));
                            if (++itemCount >= Config.battleDrop.ui.overviewItemMaxNumber) break;
                        }
                    } else {
                        const dropItems = BattleData.playerLoot[player].items.sort(
                            (a, b) => order(b) - order(a)
                        );
                        for (let item of dropItems) {
                            const hrid = item.hrid;
                            const rarity = BattleDropAnalyzer.getItemRarity(hrid);
                            if (rarity < Config.battleDrop.ui.overviewItemMinRarity) continue;
                            itemsDiv.appendChild(itemText(hrid, rarity, item.count, 0));
                            if (++itemCount >= Config.battleDrop.ui.overviewItemMaxNumber) break;
                        }
                    }
                    if (itemCount === 0) {
                        const runCount = BattleData.runCount - 1;
                        if (runCount >= 800) {
                            let info = `${UiLocale.battleDrop.overview.info800[language](runCount)}`;
                            let text = Ui.div({
                                style: {
                                    textAlign: 'center',
                                    color: 'rgb(252, 255, 188)',
                                    margin: '0 0 10px 0',
                                    textShadow: '0 0 1px rgb(167, 164, 0), 0 0 2px rgb(246, 255, 117), 0 0 3px rgb(251, 255, 201)',
                                }
                            }, info);
                            itemsDiv.appendChild(text);
                        } else if (runCount >= 400) {
                            let info = `${UiLocale.battleDrop.overview.info400[language](runCount)}`;
                            let text = Ui.div({
                                style: {
                                    textAlign: 'center',
                                    color: 'rgb(180, 180, 180)',
                                    margin: '0 0 10px 0',
                                }
                            }, info);
                            itemsDiv.appendChild(text);
                        }
                    }
                    return playerDiv;
                };
    
                let panel = Ui.div({ id: 'lll_battle_overviewPanel' });
                panel.style.padding = '13px 20px 20px 20px';
    
                let contentDiv = document.createElement('div');
                contentDiv.style.display = 'flex';
                contentDiv.style.gap = '15px';
                panel.appendChild(contentDiv);
                for (let player of BattleData.playerList) {
                    contentDiv.appendChild(getPlayerDiv(player));
                }
                return panel;
            }
    
            constructDetailsPanel() {
                let panel = document.createElement('div');
                panel.style.padding = '20px';
    
                const detailsPanel = () => {
                    const contentDiv = document.createElement('div');
                    panel.appendChild(contentDiv);
    
                    // 创建图表
                    const canvas = ChartRenderer.getCanvas();
                    contentDiv.appendChild(canvas.wrapper);
                    this.renderDetailsChart(canvas.canvas);
    
                    // 添加自定义按钮
                    const customButton = Ui.button(UiLocale.battleDrop.distribution.allMap[language]);
                    customButton.onclick = () => {
                        panel.removeChild(contentDiv);
                        customPanel();
                    };
                    contentDiv.appendChild(Ui.div(null, customButton));
                }
                const customPanel = () => {
                    const defaultPlayer = CharacterData.playerName;
                    const defaultMap = BattleData.currentMapHrid;
                    const defaultRunCount = BattleData.runCount;
    
                    const maxRunCount = Config.battleDrop.ui.customPanelMaxRunCount;
                    const maxSliderValue = Config.battleDrop.ui.customPanelMaxSliderValue;
                    let runCount = defaultRunCount;
                    const renderChart = (value = null) => {
                        const playerName = defaultPlayer;
                        const mapHrid = mapSelect.options[mapSelect.selectedIndex].value;
                        if (value !== null) runCount = value + 1;
                        while (canvasDiv.lastChild) canvasDiv.removeChild(canvasDiv.lastChild);
                        const canvas = ChartRenderer.getCanvas();
                        canvasDiv.appendChild(canvas.wrapper);
                        this.renderCustomChart(canvas.canvas, mapHrid, runCount, playerName);
                    }
    
                    const contentDiv = Ui.div('lll_div_column');
                    panel.appendChild(contentDiv);
    
                    // 设置
                    const configDiv = Ui.div({ style: 'padding: 5px 0; gap: 15px; display: flex; justify-content: space-around;' });
                    contentDiv.appendChild(configDiv);
    
                    const mapSelectorDiv = Ui.div({ style: 'display: flex; gap: 10px;' });
                    mapSelectorDiv.appendChild(Ui.div('lll_label', UiLocale.battleDrop.distribution.mapSelect[language]));
                    const mapSelect = Ui.elem('select', 'lll_input_select');
                    mapSelectorDiv.appendChild(mapSelect);
                    const sortedMapData = Object.entries(BattleData.mapData)
                        .sort((a, b) => a[1].info.order - b[1].info.order);
                    for (let [mapHrid, data] of sortedMapData) {
                        if (!Config.battleDrop.ui.customPanelShowSolo && data.info.type == 'solo') continue;
                        const text = Localizer.hridToName(mapHrid);
                        let option = new Option(text, mapHrid);
                        if (defaultMap === mapHrid) option.selected = true;
                        mapSelect.options.add(option);
                    }
                    mapSelect.onchange = () => { renderChart(); };
                    configDiv.appendChild(mapSelectorDiv);
    
                    let runCountInputDiv = Ui.div({ style: 'display: flex; gap: 10px;' });
                    configDiv.appendChild(runCountInputDiv);
                    runCountInputDiv.appendChild(Ui.div('lll_label', UiLocale.battleDrop.distribution.epochInput[language]));
                    const getRunCount = (val, inv = 1) => {
                        const A = maxSliderValue * maxRunCount / (maxRunCount - maxSliderValue);
                        const x = parseInt(val);
                        return Math.round(A * x / (A - x * inv));
                    };
    
                    const runCountInput = Ui.slider({
                        initValue: defaultRunCount,
                        minValue: 1,
                        maxValue: maxRunCount,
                        mapFunc: x => getRunCount(x, 1),
                        invMapFunc: x => getRunCount(x, -1),
                        oninput: x => { if (!isMobile) renderChart(x); },
                        onchange: x => { renderChart(x); },
                    }, null, { style: { minWidth: '60px' } })
                    runCountInputDiv.appendChild(runCountInput);
    
                    // 图表容器
                    const canvasDiv = Ui.div();
                    contentDiv.appendChild(canvasDiv);
                    renderChart();
    
                    // 返回到详细页面
                    const customButton = Ui.button(UiLocale.battleDrop.distribution.back[language]);
                    customButton.onclick = () => {
                        panel.removeChild(contentDiv);
                        detailsPanel();
                    };
                    contentDiv.appendChild(Ui.div(null, customButton));
                }
                detailsPanel();
    
                return panel;
            }
            renderDetailsChart(canvas) {
                let data = { limitL: 1e18, limitR: 0, datasets: [] };
                let limit = 0;
                for (let playerOrder = 0; playerOrder < BattleData.playerList.length; ++playerOrder) {
                    const player = BattleData.playerList[playerOrder];
                    const dropData = BattleData.getCurrentDropData(player);
                    const dist = BattleDropAnalyzer.battleCDF(dropData);
                    const income = BattleData.playerLoot[player].price();
    
                    const mu = BattleDropAnalyzer.dropExpectation(dropData);
                    const sigma = Math.sqrt(BattleDropAnalyzer.dropVariance(dropData));
                    const coeff = Config.battleDrop.ui.detailsChartSigmaCoeff;
                    data.limitL = Math.max(Math.min(data.limitL, mu - coeff * sigma), 0);
                    data.limitR = Math.max(data.limitR, Math.max(income, mu + coeff * sigma));
    
                    limit = Math.max(limit, dist.limit);
                    data.datasets.push({
                        label: player,
                        display: player === CharacterData.playerName,
                        shadow: income,
                        color: [0, 0.2, 0.45, 0.7, 0.85][playerOrder % 5],
                        cdf: dist.cdf,
                    });
                }
    
                const eps = Config.battleDrop.ui.detailsChartCdfEps;
                for (const player of data.datasets) {
                    data.limitL = Math.min(data.limitL, Utils.binarySearch(player.cdf, 0, limit, eps));
                    data.limitR = Math.max(data.limitR, Utils.binarySearch(player.cdf, 0, limit, 1 - eps));
                }
    
                ChartRenderer.cdfPdfChart(canvas, data);
            }
            renderCustomChart(canvas, mapHrid, runCount, playerName) {
                const dropData = BattleData.getDropDataDifficulty(mapHrid, runCount, playerName);
                const data = BattleDropAnalyzer.battleCDF(dropData);
    
                const eps = Config.battleDrop.ui.customChartCdfEps;
                let limitL = Utils.binarySearch(data.cdf, 0, data.limit, eps);
                let limitR = Utils.binarySearch(data.cdf, 0, data.limit, 1 - eps);
                const median = Utils.binarySearch(data.cdf, 0, data.limit, 0.5);
                const mu = BattleDropAnalyzer.dropExpectation(dropData);
                const sigma = Math.sqrt(BattleDropAnalyzer.dropVariance(dropData));
                const coeff = Config.battleDrop.ui.customChartSigmaCoeff;
                limitL = Math.max(Math.min(limitL, mu - coeff * sigma), 0);
                limitR = Math.max(limitR, mu + coeff * sigma);
    
                ChartRenderer.cdfPdfWithMedianMeanChart(canvas, {
                    limitL: limitL,
                    limitR: limitR,
                    cdf: data.cdf,
                    mu: mu,
                    sigma: sigma,
                    median: median,
                })
            }
    
            constructSettingsPanel() {
                let panel = Ui.div('lll_div_settingPanelContent');
                const locale = UiLocale.battleDrop.settings;
    
                let itemSortOrderSelect = Ui.elem('select', 'lll_input_select');
                for (let [key, order] of Object.entries(this.itemSortOrderMap)) {
                    let option = new Option(order.desc, key);
                    if (key === Config.battleDrop.ui.overviewItemSortOrder) option.selected = true;
                    itemSortOrderSelect.options.add(option);
                }
                itemSortOrderSelect.onchange = () => {
                    const order = itemSortOrderSelect.options[itemSortOrderSelect.selectedIndex].value;
                    Config.battleDrop.ui.overviewItemSortOrder = order;
                    ConfigManager.saveConfig();
                };
                panel.appendChild(SettingsUi.settingRow(locale.sortOrder[language], null, itemSortOrderSelect));
    
                panel.appendChild(SettingsUi.settingRow(
                    locale.displayLimit[language], null, Ui.numberInput({
                        initValue: Config.battleDrop.ui.overviewItemMaxNumber,
                        minValue: 1,
                        maxValue: 20,
                        onchange: val => {
                            Config.battleDrop.ui.overviewItemMaxNumber = val;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.showNormal[language], null, Ui.checkBox({
                        checked: Config.battleDrop.ui.overviewItemMinRarity === -1,
                        onchange: checked => {
                            let val = checked ? -1 : 0;
                            Config.battleDrop.ui.overviewItemMinRarity = val;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
    
                panel.appendChild(Ui.div('lll_separator'));
    
                const actionSelect = Ui.elem('select', 'lll_input_select');
                const actionList = [
                    ['doubleClick', locale.doubleClick[language]],
                    ['ctrlClick', locale.ctrlClick[language]],
                    ['disable', locale.disable[language]],
                ];
                for (let [type, text] of actionList) {
                    let option = new Option(text, type);
                    if (Config.battleDrop.ui.overviewInsertToChatAction === type) option.selected = true;
                    actionSelect.options.add(option);
                }
                actionSelect.onchange = () => {
                    const type = actionSelect.options[actionSelect.selectedIndex].value;
                    Config.battleDrop.ui.overviewInsertToChatAction = type;
                    ConfigManager.saveConfig();
                };
                panel.appendChild(SettingsUi.settingRow(locale.insertToChatAction[language], null, actionSelect));
    
                const msgFmtInput = Ui.elem('textarea', 'lll_input');
                msgFmtInput.value = Config.battleDrop.ui.overviewMsgFmt;
                msgFmtInput.onchange = () => {
                    Config.battleDrop.ui.overviewMsgFmt = msgFmtInput.value;
                    ConfigManager.saveConfig();
                };
                msgFmtInput.style.width = '250px';
                msgFmtInput.style.height = '100px';
                Tooltip.attach(msgFmtInput, Tooltip
                    .description(null, locale.msgFmtDesc[language]), 'center');
                panel.appendChild(SettingsUi.settingRow(locale.msgFmt[language], null, msgFmtInput));
    
                panel.appendChild(Ui.div('lll_separator'));
    
                panel.appendChild(SettingsUi.settingRow(
                    locale.useLegacyUi[language], null, Ui.checkBox({
                        checked: Config.battleDrop.ui.overviewUseLegacyUi,
                        onchange: checked => {
                            Config.battleDrop.ui.overviewUseLegacyUi = checked;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.showStdDev[language], null, Ui.checkBox({
                        checked: Config.battleDrop.ui.overviewShowStdDev,
                        onchange: checked => {
                            Config.battleDrop.ui.overviewShowStdDev = checked;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.showDeathCount[language], null, Ui.checkBox({
                        checked: Config.battleDrop.ui.overviewShowDeathCount,
                        onchange: checked => {
                            Config.battleDrop.ui.overviewShowDeathCount = checked;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.showXpPerDay[language], null, Ui.checkBox({
                        checked: Config.battleDrop.ui.overviewShowXpPerDay,
                        onchange: checked => {
                            Config.battleDrop.ui.overviewShowXpPerDay = checked;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
                panel.appendChild(SettingsUi.settingRow(
                    locale.showExpectDrop[language], null, Ui.checkBox({
                        checked: Config.battleDrop.ui.overviewShowExpectDrop,
                        onchange: checked => {
                            Config.battleDrop.ui.overviewShowExpectDrop = checked;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
    
                return panel;
            }
    
            constructHistoryPanel() {
                let panel = document.createElement('div');
                panel.style.margin = '20px';
    
                let contentDiv = document.createElement('div');
                contentDiv.style.minWidth = '600px';
                contentDiv.style.minHeight = '400px';
                panel.appendChild(contentDiv);
    
                return panel;
            }
    
            showPopup() {
                this.popup.open();
                const inBattle = BattleData.duration > 0;
                if (inBattle && BattleData.runCount > 1) {
                    const eph = `${(3600 * (BattleData.runCount - 1) / BattleData.duration).toFixed(1)} EPH`;
                    const duration = Utils.formatDuration(BattleData.duration);
                    const title = Ui.elem('span', null, [
                        Ui.elem('span', { style: 'margin-right: 15px; text-shadow: var(--title-text-shadow);' }, eph),
                        Ui.elem('span', { style: 'color:rgb(217, 220, 255)' }, duration),
                    ])
                    this.popup.addTab(UiLocale.battleDrop.overview.tabLabel[language], () => this.constructOverviewPanel(), title);
                    this.popup.addTab(UiLocale.battleDrop.distribution.tabLabel[language], () => this.constructDetailsPanel(), null);
                }
                // this.popup.addTab(UiDict.battleDrop.history.tabLabel[language], () => this.constructHistoryPanel(), null);
                this.popup.addTab(UiLocale.battleDrop.settings.tabLabel[language], () => this.constructSettingsPanel(), null);
            }
    
            tabSelector = '#root > div > div > div.GamePage_gamePanel__3uNKN > div.GamePage_contentPanel__Zx4FH > div.GamePage_middlePanel__uDts7 > div.GamePage_mainPanel__2njyb > div > div:nth-child(1) > div > div > div > div.TabsComponent_tabsContainer__3BDUp > div > div > div';
            btnBaseClassName = 'MuiButtonBase-root MuiTab-root MuiTab-textColorPrimary css-1q2h7u5';
            addButton(tabsContainer) {
                let button = Ui.div(this.btnBaseClassName + ' lll_btn_battleDropAnalyzer', UiLocale.battleDrop.btnLabel[language]);
                button.onclick = () => { this.showPopup(); };
    
                // 将按钮插入到最后一个标签后面
                let lastTab = tabsContainer.children[tabsContainer.children.length - 1];
                tabsContainer.insertBefore(button, lastTab.nextSibling);
            }
            addButtonBeforeEdible() {
                var tabsContainer = document.querySelector(this.tabSelector);
                if (!tabsContainer) return;
                if (tabsContainer.querySelector('.lll_btn_battleDropAnalyzer')) return;
                this.addButton(tabsContainer);
            }
            addButtonAfterEdible() {
                var tabsContainer = document.querySelector(this.tabSelector);
                if (!tabsContainer) return;
                if (tabsContainer.querySelector('.lll_Button_battlePlayerLoot__custom')) return;
    
                // 修改食用工具前俩按钮的样式
                let foodBtn = tabsContainer.querySelector('.Button_battlePlayerFood__custom');
                foodBtn.className = this.btnBaseClassName + ' lll_Button_battlePlayerFood__custom';
                let lootBtn = tabsContainer.querySelector('.Button_battlePlayerLoot__custom');
                lootBtn.className = this.btnBaseClassName + ' lll_Button_battlePlayerLoot__custom';
    
                const originalBtn = tabsContainer.querySelector('.lll_btn_battleDropAnalyzer');
                if (originalBtn) tabsContainer.removeChild(originalBtn);
                this.addButton(tabsContainer);
            }
        };
    
        //#endregion
    
    
        //#region TaskAnalyzer
    
        const TaskData = new class {
            /**
             * @typedef {Object} Task
             * @property {'monster' | 'action'} type
             * @property {string} actionHrid
             * @property {string} monsterHrid
             * @property {number} goalCount
             * @property {number} currentCount
             * @property {{ itemHrid: string, count: number }[]} rewards
             * @property {'in_progress' | 'completed' | 'claimed'} status
             * @property {{ coin: number, cowbell: number, mooPass: number }} rerollCount
             */
    
            /** @type {Map<number, Task>} */ tasks = new Map();
            /** @type {TaskActionType[]} */ blockedTypes = null;
            /** @type {CharacterInfo} */ charaInfo = null;
    
            /** @type {Object<string, { type: 'boss' | 'monster', actionHrid: string, mapHrid: string }>} */
            monsterInfo = {};
    
            constructor() {
                MessageHandler.addListener('init_character_data', msg => { this.onInitCharacterData(msg); });
                MessageHandler.addListener('character_info_updated', msg => { this.onCharacterInfoUpdated(msg); });
                MessageHandler.addListener('quests_updated', msg => { this.onQuestUpdated(msg); });
                MessageHandler.addListener('action_completed', msg => { this.onQuestUpdated(msg); });
                MessageHandler.addListener('discard_random_task', msg => { this.onDiscardTask(msg); });
                MessageHandler.addListener('task_type_blocks_updated', msg => { this.onTaskTypeBlocksUpdated(msg); });
            }
    
            onInitCharacterData(msg) {
                if (!msg.characterQuests) return;
                msg.characterQuests.forEach(t => { this.updateTask(t); });
                this.charaInfo = msg.characterInfo;
                this.onTaskTypeBlocksUpdated(msg);
                out('任务列表 (TaskData.tasks)', this.tasks);
            }
            onCharacterInfoUpdated(msg) {
                this.charaInfo = msg.characterInfo;
            }
            onQuestUpdated(msg) {
                if (!msg.endCharacterQuests) return;
                msg.endCharacterQuests.forEach(t => { this.updateTask(t); });
                out('【更新】任务列表 (TaskData.tasks)', this.tasks);
            }
            onDiscardTask(msg) {
                this.tasks.delete(msg.discardRandomTaskData.characterQuestId);
            }
            onTaskTypeBlocksUpdated(msg) {
                const blocks = msg.characterTaskTypeBlocks;
                if (!blocks) return;
                this.blockedTypes = [];
                blocks.forEach(t => {
                    if (t.randomTaskTypeHrid === '') return;
                    this.blockedTypes.push(t.randomTaskTypeHrid.split('/').pop());
                });
                out('屏蔽任务列表 (TaskData.blockedTypes)', this.blockedTypes);
            }
    
            updateTask(taskRaw) {
                const task = {
                    type: taskRaw.type.split('/').pop(),
                    actionHrid: taskRaw.actionHrid,
                    monsterHrid: taskRaw.monsterHrid,
                    goalCount: taskRaw.goalCount,
                    currentCount: taskRaw.currentCount,
                    rewards: JSON.parse(taskRaw.itemRewardsJSON),
                    status: taskRaw.status.split('/').pop(),
                    rerollCount: {
                        coin: taskRaw.coinRerollCount,
                        cowbell: taskRaw.cowbellRerollCount,
                        mooPass: taskRaw.mooPassRerollCount,
                    },
                };
                if (task.status === 'completed' || task.status === 'claimed') this.tasks.delete(taskRaw.id);
                else this.tasks.set(taskRaw.id, task);
                return task;
            }
        };
    
        const TaskGenerator = new class {
            /**
             * @typedef {'milking' | 'foraging' | 'woodcutting' | 'cheesesmithing'
             *     | 'crafting' | 'tailoring' | 'cooking' | 'brewing' | 'combat'} TaskActionType
             */
            /**
             * @typedef {Object} TaskInfo
             * @property {TaskActionType} actionType
             * @property {string} actionHrid
             * @property {number} minLevel
             * @property {number} weight
             * @property {number} goalCount
             * @property {{ coin: number, taskToken: number }} rewards
             */
    
            /** @type {TaskActionType[]} */
            actionTypeList = ['milking', 'foraging', 'woodcutting', 'cheesesmithing',
                'crafting', 'tailoring', 'cooking', 'brewing', 'combat'];
    
            /** @type {{ [actionType: string]: { [actionHrid: string]: TaskInfo } }} */
            taskInfo = {};
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.onInitClientData(msg); });
            }
    
            gatheringGoalCountTable = {
                1: 90.4,
                10: 219.9,
                20: 274.9,
                35: 474.7,
                50: 774.4,
                65: 1113.3,
                80: 1454.6,
            };
            productionGoalCountTable = {
                'Cheese Boots': 11.666666666666666,
                'Cheese Gauntlets': 11.5,
                'Cheese Sword': 5.333333333333333,
                'Cheese Brush': 9.11111111111111,
                'Cheese Hatchet': 8.833333333333334,
                'Cheese Shears': 9.428571428571429,
                'Cheese Spear': 8.875,
                'Cheese Chisel': 13.75,
                'Cheese Hammer': 14.272727272727273,
                'Cheese Needle': 14,
                'Cheese Pot': 14.714285714285714,
                'Cheese Spatula': 14.875,
                'Cheese Mace': 13.2,
                'Cheese Alembic': 20.333333333333332,
                'Cheese Buckler': 24.6,
                'Cheese Enhancer': 20.88888888888889,
                'Cheese Helmet': 27.571428571428573,
                'Cheese Bulwark': 13.222222222222221,
                'Cheese Plate Legs': 26.5,
                'Cheese Plate Body': 28.4,
                'Verdant Boots': 12.5,
                'Verdant Gauntlets': 13.9,
                'Verdant Sword': 5.454545454545454,
                'Verdant Brush': 8,
                'Verdant Hatchet': 8,
                'Verdant Shears': 8.571428571428571,
                'Verdant Spear': 7.125,
                'Verdant Chisel': 9.9,
                'Verdant Hammer': 9.76923076923077,
                'Verdant Needle': 9.6,
                'Verdant Pot': 9.8,
                'Verdant Spatula': 9.714285714285714,
                'Verdant Mace': 8.571428571428571,
                'Verdant Alembic': 11.5,
                'Verdant Buckler': 13.5,
                'Verdant Enhancer': 12,
                'Verdant Helmet': 16.6,
                'Verdant Bulwark': 7.769230769230769,
                'Verdant Plate Legs': 13.833333333333334,
                'Verdant Plate Body': 13.88888888888889,
                'Azure Boots': 8.363636363636363,
                'Azure Gauntlets': 9,
                'Azure Sword': 3.6923076923076925,
                'Azure Brush': 5.25,
                'Azure Hatchet': 5.111111111111111,
                'Azure Shears': 5,
                'Azure Spear': 4.222222222222222,
                'Azure Chisel': 6.1875,
                'Azure Hammer': 6.333333333333333,
                'Azure Needle': 6.166666666666667,
                'Azure Pot': 5.857142857142857,
                'Azure Spatula': 6.333333333333333,
                'Azure Mace': 5,
                'Azure Alembic': 6.8,
                'Azure Buckler': 7.625,
                'Azure Enhancer': 6.75,
                'Azure Helmet': 9.444444444444445,
                'Azure Bulwark': 4.333333333333333,
                'Azure Plate Legs': 7.166666666666667,
                'Azure Plate Body': 7.2,
                'Burble Boots': 8.555555555555555,
                'Burble Gauntlets': 8.692307692307692,
                'Burble Sword': 3.7142857142857144,
                'Burble Brush': 5.454545454545454,
                'Burble Hatchet': 5.090909090909091,
                'Burble Shears': 5,
                'Burble Spear': 4,
                'Burble Chisel': 5.916666666666667,
                'Burble Hammer': 5.75,
                'Burble Needle': 5.916666666666667,
                'Burble Pot': 5.333333333333333,
                'Burble Spatula': 6.333333333333333,
                'Burble Mace': 4.857142857142857,
                'Burble Alembic': 6.25,
                'Burble Buckler': 8,
                'Burble Enhancer': 6.357142857142857,
                'Burble Helmet': 8.555555555555555,
                'Burble Bulwark': 3.8333333333333335,
                'Burble Plate Legs': 7,
                'Burble Plate Body': 6.769230769230769,
                'Crimson Boots': 7.5,
                'Crimson Gauntlets': 8.5,
                'Crimson Sword': 4,
                'Crimson Brush': 5.545454545454546,
                'Crimson Hatchet': 5.2,
                'Crimson Shears': 5.6,
                'Crimson Spear': 4,
                'Crimson Chisel': 5.833333333333333,
                'Crimson Hammer': 6.166666666666667,
                'Crimson Needle': 5.8,
                'Crimson Pot': 6.3,
                'Crimson Spatula': 6,
                'Crimson Mace': 4.2,
                'Crimson Alembic': 6,
                'Crimson Buckler': 7.714285714285714,
                'Crimson Enhancer': 6.25,
                'Crimson Helmet': 9.5,
                'Crimson Bulwark': 4.125,
                'Crimson Plate Legs': 7,
                'Crimson Plate Body': 7.25,
                'Rainbow Boots': 8,
                'Rainbow Gauntlets': 8.615384615384615,
                'Rainbow Sword': 3.7142857142857144,
                'Rainbow Brush': 4.875,
                'Rainbow Hatchet': 4.714285714285714,
                'Rainbow Shears': 5.1,
                'Rainbow Spear': 3.888888888888889,
                'Rainbow Chisel': 5.470588235294118,
                'Rainbow Hammer': 5.444444444444445,
                'Rainbow Needle': 5.4375,
                'Rainbow Pot': 5.666666666666667,
                'Rainbow Spatula': 5.5625,
                'Rainbow Mace': 4.75,
                'Rainbow Alembic': 6.090909090909091,
                'Rainbow Buckler': 6.888888888888889,
                'Rainbow Enhancer': 5.846153846153846,
                'Rainbow Helmet': 8.357142857142858,
                'Rainbow Bulwark': 3.4285714285714284,
                'Rainbow Plate Legs': 7,
                'Rainbow Plate Body': 6,
                'Holy Boots': 6.833333333333333,
                'Holy Gauntlets': 6.555555555555555,
                'Holy Sword': 3,
                'Holy Brush': 3.909090909090909,
                'Holy Hatchet': 3.909090909090909,
                'Holy Shears': 3.8181818181818183,
                'Holy Spear': 3.4375,
                'Holy Chisel': 4.4,
                'Holy Hammer': 4.333333333333333,
                'Holy Needle': 4.75,
                'Holy Pot': 4.666666666666667,
                'Holy Spatula': 4.454545454545454,
                'Holy Mace': 4.142857142857143,
                'Holy Alembic': 4.666666666666667,
                'Holy Buckler': 5.625,
                'Holy Enhancer': 4.6,
                'Holy Helmet': 7,
                'Holy Bulwark': 3,
                'Holy Plate Legs': 5.230769230769231,
                'Holy Plate Body': 5.142857142857143,
                'Wooden Crossbow': 5.285714285714286,
                'Wooden Water Staff': 5.363636363636363,
                'Wooden Shield': 10.826086956521738,
                'Wooden Nature Staff': 9.37037037037037,
                'Wooden Bow': 10.192307692307692,
                'Wooden Fire Staff': 16.0625,
                'Birch Crossbow': 5.225806451612903,
                'Birch Water Staff': 5.44,
                'Birch Shield': 9.724137931034482,
                'Birch Nature Staff': 7.541666666666667,
                'Birch Bow': 6.333333333333333,
                'Birch Fire Staff': 8.6,
                'Cedar Crossbow': 3.4615384615384617,
                'Cedar Water Staff': 3.2857142857142856,
                'Cedar Shield': 6.153846153846154,
                'Cedar Nature Staff': 4.555555555555555,
                'Cedar Bow': 3.6129032258064515,
                'Cedar Fire Staff': 5.033333333333333,
                'Purpleheart Crossbow': 3.56,
                'Purpleheart Water Staff': 3.793103448275862,
                'Purpleheart Shield': 5.84375,
                'Purpleheart Nature Staff': 4,
                'Purpleheart Bow': 3.6774193548387095,
                'Purpleheart Fire Staff': 5.0476190476190474,
                'Ginkgo Crossbow': 3.5454545454545454,
                'Ginkgo Water Staff': 3.607142857142857,
                'Ginkgo Shield': 6.473684210526316,
                'Ginkgo Nature Staff': 4.393939393939394,
                'Ginkgo Bow': 3.6206896551724137,
                'Ginkgo Fire Staff': 5.032258064516129,
                'Redwood Crossbow': 3.3076923076923075,
                'Redwood Water Staff': 3.357142857142857,
                'Redwood Shield': 5.571428571428571,
                'Redwood Nature Staff': 4.071428571428571,
                'Redwood Bow': 3.44,
                'Redwood Fire Staff': 4.633333333333334,
                'Arcane Crossbow': 2.64,
                'Arcane Water Staff': 2.8529411764705883,
                'Arcane Shield': 4.8,
                'Arcane Nature Staff': 3.5454545454545454,
                'Arcane Bow': 2.7037037037037037,
                'Arcane Fire Staff': 3.793103448275862,
                'Cotton Boots': 12.083333333333334,
                'Rough Boots': 12.28,
                'Cotton Gloves': 21,
                'Rough Bracers': 20.807692307692307,
                'Cotton Hat': 28.8125,
                'Rough Hood': 28.958333333333332,
                'Cotton Robe Bottoms': 30.96153846153846,
                'Rough Chaps': 29.65,
                'Cotton Robe Top': 35.7,
                'Rough Tunic': 37.5,
                'Linen Boots': 11.333333333333334,
                'Reptile Boots': 10.5,
                'Linen Gloves': 13.583333333333334,
                'Reptile Bracers': 13.454545454545455,
                'Linen Hat': 13.307692307692308,
                'Reptile Hood': 13.571428571428571,
                'Linen Robe Bottoms': 12.842105263157896,
                'Reptile Chaps': 11.833333333333334,
                'Linen Robe Top': 12.366666666666667,
                'Reptile Tunic': 12.238095238095237,
                'Bamboo Boots': 8.928571428571429,
                'Gobo Boots': 9.785714285714286,
                'Bamboo Gloves': 10.80952380952381,
                'Gobo Bracers': 11.181818181818182,
                'Bamboo Hat': 11,
                'Gobo Hood': 10.666666666666666,
                'Bamboo Robe Bottoms': 8.571428571428571,
                'Gobo Chaps': 8.68,
                'Bamboo Robe Top': 8.863636363636363,
                'Gobo Tunic': 8.772727272727273,
                'Beast Boots': 8.172413793103448,
                'Silk Boots': 8.08695652173913,
                'Beast Bracers': 10.181818181818182,
                'Silk Gloves': 10.375,
                'Beast Hood': 9.318181818181818,
                'Silk Hat': 9.137931034482758,
                'Beast Chaps': 7.3,
                'Silk Robe Bottoms': 7.583333333333333,
                'Beast Tunic': 8.047619047619047,
                'Silk Robe Top': 7.75,
                'Radiant Boots': 7.9523809523809526,
                'Umbral Boots': 7.7272727272727275,
                'Radiant Gloves': 9.470588235294118,
                'Umbral Bracers': 9.857142857142858,
                'Radiant Hat': 8.846153846153847,
                'Umbral Hood': 8.8,
                'Radiant Robe Bottoms': 7.25,
                'Umbral Chaps': 7.375,
                'Radiant Robe Top': 7.208333333333333,
                'Umbral Tunic': 7.416666666666667,
            };
            brewingGoalCountTable = {
                'Milking Tea': 37.94444444444444,
                'Stamina Coffee': 38.2962962962963,
                'Foraging Tea': 84.14516129032258,
                'Intelligence Coffee': 83.13698630136986,
                'Gathering Tea': 115.75342465753425,
                'Woodcutting Tea': 132.7058823529412,
                'Cooking Tea': 94.79166666666667,
                'Defense Coffee': 94.53225806451613,
                'Brewing Tea': 139.18867924528303,
                'Attack Coffee': 152.27586206896552,
                'Gourmet Tea': 163.0793650793651,
                'Alchemy Tea': 183.74603174603175,
                'Enhancing Tea': 183.14492753623188,
                'Cheesesmithing Tea': 110.80701754385964,
                'Power Coffee': 115.14285714285714,
                'Crafting Tea': 160.8985507246377,
                'Ranged Coffee': 160.38983050847457,
                'Wisdom Coffee': 171.4047619047619,
                'Wisdom Tea': 167.62962962962962,
                'Magic Coffee': 217.41860465116278,
                'Tailoring Tea': 218.01960784313727,
                'Super Milking Tea': 69,
                'Super Stamina Coffee': 57.55555555555556,
                'Super Foraging Tea': 78,
                'Super Intelligence Coffee': 80.33333333333333,
                'Lucky Coffee': 302.96078431372547,
                'Processing Tea': 292.578125,
                'Super Woodcutting Tea': 97.14285714285714,
                'Super Cooking Tea': 102.2,
                'Super Defense Coffee': 94.4,
                'Super Attack Coffee': 140,
                'Super Brewing Tea': 120.11111111111111,
                'Ultra Milking Tea': 69.625,
                'Ultra Stamina Coffee': 66.33333333333333,
                'Efficiency Tea': 481.2857142857143,
                'Swiftness Coffee': 490.24528301886795,
                'Super Alchemy Tea': 159.5,
                'Super Enhancing Tea': 168.25,
                'Ultra Foraging Tea': 82.5,
                'Ultra Intelligence Coffee': 88.16666666666667,
                'Channeling Coffee': 645.4,
                'Super Cheesesmithing Tea': 144.4,
                'Super Power Coffee': 150,
                'Ultra Woodcutting Tea': 113.85714285714286,
                'Artisan Tea': 538.6,
                'Super Crafting Tea': 194.5,
                'Super Ranged Coffee': 185.5,
                'Ultra Cooking Tea': 113.88888888888889,
                'Ultra Defense Coffee': 107.75,
                'Catalytic Tea': 670.3770491803278,
                'Critical Coffee': 679.1,
                'Super Magic Coffee': 207.42857142857142,
                'Super Tailoring Tea': 221.28571428571428,
                'Ultra Attack Coffee': 146.66666666666666,
                'Ultra Brewing Tea': 153.16666666666666,
                'Blessed Tea': 841.0185185185185,
                'Ultra Alchemy Tea': 180.375,
                'Ultra Enhancing Tea': 202.83333333333334,
                'Ultra Cheesesmithing Tea': 225.4,
                'Ultra Power Coffee': 203.5,
                'Ultra Crafting Tea': 262.45454545454544,
                'Ultra Ranged Coffee': 252.125,
                'Ultra Magic Coffee': 328.5,
                'Ultra Tailoring Tea': 356.3333333333333,
            };
    
            matchFilter(name, filter) {
                let i = 0;
                for (; i < filter.length; ++i) {
                    if (typeof filter[i] === 'string' || filter[i](name)) break;
                }
                return i;
            }
            getGatheringTaskInfo(detail) {
                const level = detail.levelRequirement.level;
                return {
                    weight: 1,
                    goalCount: this.gatheringGoalCountTable[level],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                };
            }
            getCheesesmithingTaskInfo(detail) {
                const name = detail.name;
                const filters = [
                    name => name.endsWith('Cheese'),
                    name => name.includes('Cheese') || name.includes('Verdant') || name.includes('Azure') || name.includes('Burble')
                        || name.includes('Crimson') || name.includes('Rainbow') || name.includes('Holy'),
                    'otherwise',
                ];
                const rarity = this.matchFilter(name, filters);
                const level = detail.levelRequirement.level;
                if (rarity === 0) return this.getGatheringTaskInfo(detail);
                if (rarity === 2) return {
                    weight: 1 / 42,
                    goalCount: 1,
                    taskToken: 0.2 * level + 4,
                    coin: Math.pow(1.34 * level + 26.5, 2.4),
                };
                return {
                    weight: 0.1,
                    goalCount: this.productionGoalCountTable[name],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                };
            }
            getCraftingTaskInfo(detail) {
                const name = detail.name;
                if (name.includes('Task Badge') || name.includes('Key')) return null;
                const filters = [
                    name => name.includes('Lumber'),
                    name => name.includes('Wooden') || name.includes('Birch') || name.includes('Cedar') || name.includes('Purpleheart')
                        || name.includes('Ginkgo') || name.includes('Redwood') || name.includes('Arcane'),
                    'otherwise',
                ];
                const rarity = this.matchFilter(name, filters);
                const level = detail.levelRequirement.level;
                if (rarity === 0) return this.getGatheringTaskInfo(detail);
                if (rarity === 2) return {
                    weight: 0.07,
                    goalCount: 1,
                    taskToken: 0.2 * level + 4,
                    coin: Math.pow(1.34 * level + 26.5, 2.4),
                }
                return {
                    weight: 1 / 3,
                    goalCount: this.productionGoalCountTable[name],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                };
            }
            getTailoringTaskInfo(detail) {
                const name = detail.name;
                const filters = [
                    name => name.includes('Leather') || name.includes('Fabric'),
                    name => name.includes('Cotton') || name.includes('Linen') || name.includes('Bamboo') || name.includes('Silk') || name.includes('Radiant')
                        || name.includes('Rough') || name.includes('Reptile') || name.includes('Gobo') || name.includes('Beast') || name.includes('Umbral'),
                    'otherwise',
                ];
                const rarity = this.matchFilter(name, filters);
                const level = detail.levelRequirement.level;
                if (rarity === 0) return {
                    weight: 1,
                    goalCount: {
                        1: 96.2,
                        15: 256.1,
                        35: 490.4,
                        55: 852.5,
                        75: 1447.0,
                    }[level],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                }
                if (rarity === 2) return {
                    weight: 5 / 58,
                    goalCount: 1,
                    taskToken: 0.2 * level + 4,
                    coin: Math.pow(1.34 * level + 26.5, 2.4),
                }
                return {
                    weight: 0.4,
                    goalCount: this.productionGoalCountTable[name],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                };
            }
            getCookingTaskInfo(detail) {
                const level = detail.levelRequirement.level;
                return {
                    weight: 1,
                    goalCount: {
                        1: 76.2,
                        10: 188.2,
                        20: 225.4,
                        35: 392.1,
                        50: 649.6,
                        65: 1110.3,
                        80: 1526.0,
                    }[level],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                };
            }
            getBrewingTaskInfo(detail) {
                const name = detail.name;
                const filters = [
                    name => !name.includes('Super') && !name.includes('Ultra'),
                    'otherwise'
                ];
                const rarity = this.matchFilter(name, filters);
                const level = detail.levelRequirement.level;
                if (rarity === 0) return {
                    weight: 1,
                    goalCount: this.brewingGoalCountTable[name],
                    taskToken: 0.1 * level + 2,
                    coin: Math.pow(level + 20, 2.4),
                };
                return {
                    weight: 0.1,
                    goalCount: this.brewingGoalCountTable[name],
                    taskToken: 0.2 * level + 4,
                    coin: Math.pow(1.34 * level + 26.5, 2.4),
                };
            }
            getCombatTaskInfo(detail) {
                const mapData = BattleData.mapData[detail.hrid];
                if (!mapData) return null;
                if (mapData.info.eliteTier >= 1) return null;
                if (mapData.info.type === 'group') {
                    const id = Math.min(mapData.info.mapIndex, 6) - 2; // 0,1,2,3,4
                    if (id < 0) return null;
                    const hrid = Object.keys(mapData.bossDrops)[0];
                    const monsterDetail = ClientData.get().combatMonsterDetailMap[hrid];
                    const level = monsterDetail.combatDetails.combatLevel;
                    return {
                        weight: 1 / 60,
                        monsterLevel: level,
                        goalCount: [5, 6.3, 8.6, 9.4, 10][id],
                        taskToken: [10, 12.5, 17, 18.5, 20][id],
                        coin: [25653, 60834, 138242, 170250, 216800][id],
                    };
                }
                const hrid = Object.keys(mapData.monsterDrops)[0];
                const monsterDetail = ClientData.get().combatMonsterDetailMap[hrid];
                const level = monsterDetail.combatDetails.combatLevel;
                return {
                    weight: 1,
                    monsterLevel: level,
                    goalCount: 0.5 * level + 50,
                    taskToken: 0.036 * level + 2.78,
                    coin: Math.pow(0.4 * level + 20, 2.4),
                };
            }
            /**
             * @param {string} actionHrid
             * @returns {TaskInfo?}
             */
            getTaskInfo(actionType, actionHrid) {
                const detail = ClientData.get().actionDetailMap[actionHrid];
                const formatTaskInfo = info => {
                    // dbg(detail.name, info);
                    if (!info) return null;
                    let level;
                    if (actionType === 'combat') {
                        level = Math.min(Math.ceil(Math.pow(info.monsterLevel, 0.862)), 90);
                    } else level = detail.levelRequirement.level;
                    const /** @type {TaskInfo} */ ret = {
                        actionType: actionType,
                        actionHrid: detail.hrid,
                        minLevel: level,
                        weight: info.weight,
                        goalCount: info.goalCount,
                        rewards: {
                            taskToken: info.taskToken,
                            coin: info.coin,
                        },
                    };
                    return ret;
                };
                switch (actionType) {
                    case 'milking': return formatTaskInfo(this.getGatheringTaskInfo(detail));
                    case 'foraging': return formatTaskInfo(this.getGatheringTaskInfo(detail));
                    case 'woodcutting': return formatTaskInfo(this.getGatheringTaskInfo(detail));
                    case 'cheesesmithing': return formatTaskInfo(this.getCheesesmithingTaskInfo(detail));
                    case 'crafting': return formatTaskInfo(this.getCraftingTaskInfo(detail));
                    case 'tailoring': return formatTaskInfo(this.getTailoringTaskInfo(detail));
                    case 'cooking': return formatTaskInfo(this.getCookingTaskInfo(detail));
                    case 'brewing': return formatTaskInfo(this.getBrewingTaskInfo(detail));
                    case 'combat': return formatTaskInfo(this.getCombatTaskInfo(detail));
                }
            }
            onInitClientData(client) {
                for (let hrid in client.actionDetailMap) {
                    const /** @type {any} */ actionType = hrid.split('/')[2];
                    const info = this.getTaskInfo(actionType, hrid);
                    if (!info) continue;
                    (this.taskInfo[actionType] ??= {})[hrid] = info;
                }
                out('任务生成信息 (TaskGenerator.taskInfo)', this.taskInfo);
            }
    
            /**
             * @param {TaskActionType} actionType
             * @param {number} level
             * @returns {number}
             */
            getActionWeight(actionType, level) {
                if (actionType !== 'combat') return level + 50;
                return 3 * level + 300;
            }
    
            /**
             * @param {{ [actionType: string]: number }} skillLevel
             * @param {TaskActionType[]} blockList
             * @returns {TaskInfo[]}
             */
            getTaskGenerationInfo(skillLevel, blockList) {
                const actionTypeList = this.actionTypeList.filter(name => !blockList.some(blockName => name === blockName));
                const actionWeightTotal = actionTypeList.reduce((pre, cur) => pre + this.getActionWeight(cur, skillLevel[cur]), 0);
                const actionWeight = {};
                actionTypeList.forEach(name => { actionWeight[name] = this.getActionWeight(name, skillLevel[name]) / actionWeightTotal });
                let ret = [];
                for (let [skill, weight] of Object.entries(actionWeight)) {
                    const level = skillLevel[skill];
                    const choices = Object.entries(this.taskInfo[skill]).filter(([_, info]) => level >= info.minLevel);
                    const totalWeight = choices.reduce((pre, cur) => pre + cur[1].weight, 0);
                    choices.forEach(([_, info]) => {
                        const w = weight * info.weight / totalWeight;
                        ret.push({ ...info, weight: w });
                    });
                }
                return ret;
            }
        }
    
        const TaskAnalyzer = new class {
            computeOverflowDate() {
                const charaInfo = TaskData.charaInfo;
                const currentTaskCount = TaskData.tasks.size;
                const taskCooldown = charaInfo.taskCooldownHours * 3.6e6;
                const taskCount = charaInfo.unreadTaskCount + currentTaskCount;
                const availTaskCount = charaInfo.taskSlotCap - taskCount;
                const lastTaskDate = new Date(charaInfo.lastTaskTimestamp).getTime();
                const overflowDate = new Date(lastTaskDate + (availTaskCount + 1) * taskCooldown);
                return overflowDate;
            }
    
            /**
             * 需要打多少波怪完成任务
             * @param {Task} task
             * @returns {{ total: number, rest: number }}
             */
            computeCombatTaskWaves(task) {
                const monsterHrid = task.monsterHrid;
                const info = BattleData.monsterInfo[task.monsterHrid];
                const spawns = BattleData.mapData[info.mapHrid].spawnInfo.expectedSpawns;
                const bossWave = BattleData.mapData[info.mapHrid].spawnInfo.bossWave;
                const compute = (count) => {
                    if (spawns[monsterHrid]) {
                        const normalCount = Math.ceil(count / spawns[monsterHrid]);
                        const bossCount = bossWave ? Math.floor((normalCount - 1) / (bossWave - 1)) : 0;
                        return normalCount + bossCount;
                    }
                    return count * bossWave;
                }
                return {
                    total: compute(task.goalCount),
                    rest: compute(task.goalCount - task.currentCount),
                }
            }
    
            /**
             * 每个图分别需要打多少波怪完成所有任务
             * @param {Map<number, Task>} tasks
             * @returns {Object<string, { total: number, rest: number }>} total: 一共多少波; rest: 还剩多少波
             */
            computeAllCombatTaskWaves(tasks = TaskData.tasks) {
                /** @type {Object<string, Object<string,{ total: number, rest: number }>>} */
                const grouped = {};
                tasks.forEach(task => {
                    if (task.type != 'monster') return;
                    const info = BattleData.monsterInfo[task.monsterHrid];
                    const mapHrid = info.mapHrid;
                    const current = this.computeCombatTaskWaves(task);
                    (grouped[mapHrid] ??= {})[task.monsterHrid] ??= { total: 0, rest: 0 };
                    grouped[mapHrid][task.monsterHrid].total += current.total;
                    grouped[mapHrid][task.monsterHrid].rest += current.rest;
                });
    
                /** @type {Object<string, { total: number, rest: number }>} */
                const ret = {};
                for (const key in grouped) {
                    ret[key] = Object.values(grouped[key]).reduce((pre, cur) => {
                        return {
                            total: Math.max(pre.total, cur.total),
                            rest: Math.max(pre.rest, cur.rest),
                        };
                    }, { total: 0, rest: 0 });
                }
                return ret;
            }
    
            /**
             * @param {Task} task
             * @returns {{ coin: number, cowbell: number }} 下一次使用牛铃/钱刷新的价格
             */
            getTaskRerollCost(task) {
                const count = task.rerollCount;
                const getCost = (x) => {
                    if (x >= 5) return 32;
                    return Math.pow(x, 2);
                };
                return {
                    coin: getCost(count.coin) * 10000,
                    cowbell: getCost(count.cowbell),
                };
            }
    
            /**
             * @param {{ [actionType: string]: number }} skillLevel
             * @param {TaskActionType[]} blockList
             */
            getTaskExpectedRewards(skillLevel, blockList) {
                const ret = { coin: 0, taskToken: 0, price: 0 };
                const taskInfo = TaskGenerator.getTaskGenerationInfo(skillLevel, blockList);
                for (let info of taskInfo) {
                    ret.coin += info.weight * info.rewards.coin;
                    ret.taskToken += info.weight * info.rewards.taskToken;
                }
                const taskTokenPrice = Market.getPriceByName("Task Token") + Market.getPriceByName("Purple's Gift") / 50;
                out(Market.getPriceByName("Task Token"))
                ret.price = ret.coin + ret.taskToken * taskTokenPrice;
                return ret;
            }
        };
    
        const TaskAnalyzerUi = new class {
            constructor() {
                setInterval(() => { this.addButton(); }, 500);
            }
    
            constructTooltip() {
                const locale = UiLocale.taskAnalyzer.tooltip;
    
                const overflowDate = TaskAnalyzer.computeOverflowDate();
                const mapRunCount = [];
                Object.entries(TaskAnalyzer.computeAllCombatTaskWaves()).forEach(([hrid, cnt]) => {
                    mapRunCount.push([BattleData.mapData[hrid].info.mapIndex, cnt]);
                });
                mapRunCount.sort((a, b) => a[0] - b[0]);
                const rewards = TaskAnalyzer.getTaskExpectedRewards(CharacterData.skillLevel, TaskData.blockedTypes);
    
                const descDiv = Ui.div(null, [
                    Ui.div(null, `${locale.overflowTime[language]}: ${Utils.formatDate(overflowDate)}`),
                    Ui.div(null, locale.expectedRewards[language](Utils.formatPrice(rewards.price), Utils.formatPrice(rewards.coin), rewards.taskToken.toFixed(2))),
                    Ui.div(null, `${locale.expectedEpochs[language]}:`)
                ]);
                mapRunCount.forEach(([id, cnt]) => {
                    descDiv.appendChild(Ui.div(null, locale.mapRunCount[language](id, cnt.total, cnt.rest)));
                });
                return descDiv;
            }
    
            addButton() {
                var tabsContainer = document.querySelector("#root > div > div > div.GamePage_gamePanel__3uNKN > div.GamePage_contentPanel__Zx4FH > div.GamePage_middlePanel__uDts7 > div.GamePage_mainPanel__2njyb > div > div:nth-child(2) > div > div.TasksPanel_tabsComponentContainer__3Q2EX > div > div.TabsComponent_tabsContainer__3BDUp > div > div > div");
                var referenceTab = tabsContainer ? tabsContainer.children[1] : null;
                if (!tabsContainer || !referenceTab) return;
                if (tabsContainer.querySelector('.lll_btn_taskAnalyzer')) return;
                const baseClassName = referenceTab.className;
    
                let button = document.createElement('div');
                button.className = baseClassName + ' lll_btn_taskAnalyzer';
                button.setAttribute('script_translatedfrom', 'New Action');
                button.textContent = UiLocale.taskAnalyzer.btnLabel[language];
                button.onclick = () => { dbg("咕咕咕"); };
    
                Tooltip.attach(button, Tooltip.description(UiLocale.taskAnalyzer.tooltip.tabLabel[language], this.constructTooltip()));
    
                // 将按钮插入到最后一个标签后面
                let lastTab = tabsContainer.children[tabsContainer.children.length - 1];
                tabsContainer.insertBefore(button, lastTab.nextSibling);
            }
        };
    
        //#endregion
    
    
        //#region ChestDropAnalyzer
    
        const ChestDropAnalyzer = new class {
            /**
             * @param {string} chestHrid
             * @param {PriceType} priceType
             * @returns {ItemDropData[]}
             */
            getChestDropData(chestHrid, priceType = 'bid') {
                const items = [];
                const chest = Market.chestDropData[chestHrid];
                if (!chest) return null;
                chest.items.forEach(item => {
                    items.push({
                        hrid: item.hrid,
                        dropRate: item.dropRate,
                        minCount: item.minCount,
                        maxCount: item.maxCount,
                        price: Market.getPriceByHrid(item.hrid, priceType),
                    })
                });
                return items;
            }
    
            dropExpectation(dropData) {
                return dropData.reduce((pre, cur) => pre + DropAnalyzer.itemCountExpt(cur) * cur.price, 0);
            }
            dropVariance(dropData) {
                return dropData.reduce((pre, cur) => pre + DropAnalyzer.itemCountVar(cur) * cur.price * cur.price, 0);
            }
    
            chestCF(dropData, count) {
                if (Config.battleDrop.verbose) out("DropData:", count, dropData);
                const cf = CharaFunc.mulList(dropData.map(drop => DropAnalyzer.charaFunc(drop)));
                return CharaFunc.pow(cf, count);
            }
    
            /**
             * @param {CountedItem} openedItem
             * @param {PriceType} priceType
             * @returns {{ limit: number, cdf: CDF }}
             */
            chestCDF(openedItem, priceType = 'bid') {
                const start = new Date().getTime();
                const samples = Config.charaFunc.samples;
                const dropData = this.getChestDropData(openedItem.hrid, priceType);
                const minLimit = dropData.reduce((pre, cur) => Math.max(pre, cur.price * cur.maxCount), 0);
                const perChestLimit = this.dropExpectation(dropData) * 3;
                const cf = this.chestCF(dropData, openedItem.count);
                const limit = minLimit + perChestLimit * openedItem.count;
                let cdf = CharaFunc.getCDF(cf, samples, limit);
    
                const end = new Date().getTime();
                if (Config.chestDrop.verbose) out(`${end - start}ms`);
                return cdf;
            }
    
            /**
             * @param {CountedItem} openedItem
             * @returns {(item: CountedItem) => number} rarity of item
             */
            getRarity(openedItem) {
                const chest = this.getChestDropData(openedItem.hrid);
                if (!chest) return _ => 0;
                const baseRate = {}, baseCount = {};
                chest.forEach(item => {
                    if (item.dropRate > (baseRate[item.hrid] ?? 0)) {
                        baseRate[item.hrid] = item.dropRate;
                        baseCount[item.hrid] = item.maxCount * openedItem.count;
                    }
                });
                return item => {
                    const rate = baseRate[item.hrid], count = baseCount[item.hrid];
                    const price = Market.getPriceByHrid(item.hrid);
                    const bonus = item.count > count * 2 ? 0.5 : 0;
                    if (rate <= 0.001) return 6 + bonus;
                    if (rate <= 0.01) return 5 + bonus;
                    if (rate <= 0.02) return 4 + bonus;
                    if (rate <= 0.05) return 3 + bonus;
                    if (rate <= 0.15) return 2 + bonus;
                    if (rate <= 0.5) return 1 + bonus;
                    return 0 + bonus;
                };
            }
    
            /**
             * @param {CountedItem} openedItem
             * @param {number} income
             * @param {PriceType} priceType
             */
            analyze(openedItem, income, priceType = 'bid') {
                const dropData = this.getChestDropData(openedItem.hrid, priceType);
                const incomeExpectation = this.dropExpectation(dropData) * openedItem.count;
                const incomeVariance = this.dropVariance(dropData) * openedItem.count;
                const cdf = this.chestCDF(openedItem, priceType);
                const luck = cdf.cdf(income);
                let profit = income;
                const chestCost = Market.chestCosts[openedItem.hrid];
                if (chestCost) {
                    const { keyAsk=0, keyBid=0, entryAsk=0, entryBid=0 } = chestCost;
                    const cost = priceType === 'bid' ? keyAsk + entryAsk : keyBid + entryBid;
                    profit -= cost * openedItem.count;
                }
                return {
                    /** @type {{ limit: number, cdf: CDF }} */ cdf: cdf,
                    /** @type {number} */ income: income,
                    /** @type {number} */ incomeExpectation: incomeExpectation,
                    /** @type {number} */ incomeVariance: incomeVariance,
                    /** @type {number} */ profit: profit,
                    /** @type {number} */ luck: luck,
                }
            }
        }
    
        const ChestDropAnalyzerUi = new class {
            popup = new TabbedPopup();
            openChestPopup = new PlainPopup();
    
            /** @type {Object<string, { desc: string, weight: (item: CountedItem, rarity: number) => number }>} */
            itemSortOrderMap = {
                'default': {
                    desc: UiLocale.chestDrop.sortOrder.default[language],
                    weight: null,
                },
                'rarity': {
                    desc: UiLocale.chestDrop.sortOrder.rarity[language],
                    weight: (item, rarity) => rarity * 1e15 + Market.getPriceByHrid(item.hrid),
                },
                'totalBid': {
                    desc: UiLocale.chestDrop.sortOrder.totalBid[language],
                    weight: (item, rarity) => Market.getPriceByHrid(item.hrid) * item.count,
                },
                'unitBid': {
                    desc: UiLocale.chestDrop.sortOrder.unitBid[language],
                    weight: (item, rarity) => Market.getPriceByHrid(item.hrid),
                },
            }
    
            constructor() {
                MessageHandler.addListener('loot_opened', msg => { this.onLootOpened(msg); });
    
                document.addEventListener('copy', (e) => {
                    // @ts-ignore
                    if (!document.getElementById('lll_chestOpenPopup')?.contains(e.target)) return;
                    if (!e.clipboardData) return;
                    let content = window?.getSelection().toString();
                    content = content.replaceAll(/└|├|\x20/g, '').replaceAll('\t', '').replaceAll('\n', '    ').replaceAll(':', ': ');
                    e.clipboardData.setData('text/plain', content.trim());
                    e.preventDefault();
                });
            }
    
    
            /**
             * @param {CountedItem} openedItem
             * @param {CountedItem[]} gainedItems
             */
            constructDetailsPanel(openedItem, gainedItems) {
                let panel = document.createElement('div');
                panel.style.padding = '20px';
    
                const detailsPanel = () => {
                    const contentDiv = document.createElement('div');
                    panel.appendChild(contentDiv);
    
                    // 创建图表
                    const canvas = ChartRenderer.getCanvas();
                    contentDiv.appendChild(canvas.wrapper);
                    this.renderDetailsChart(canvas.canvas, openedItem, gainedItems);
    
                    // 添加自定义按钮
                    const customButton = Ui.button(UiLocale.chestDrop.distribution.allChest[language]);
                    customButton.onclick = () => {
                        panel.removeChild(contentDiv);
                        customPanel();
                    };
                    contentDiv.appendChild(Ui.div(null, customButton));
                }
                const customPanel = () => {
                    const defaultChestHrid = openedItem.hrid;
                    const defaultChestCount = openedItem.count;
                    const maxCount = Config.chestDrop.ui.customPanelMaxCount;
                    const maxSliderValue = Config.chestDrop.ui.customPanelMaxSliderValue;
                    let count = defaultChestCount;
                    const renderChart = (value = null) => {
                        const itemHrid = mapSelect.options[mapSelect.selectedIndex].value;
                        if (value !== null) count = value;
                        while (canvasDiv.lastChild) canvasDiv.removeChild(canvasDiv.lastChild);
                        const canvas = ChartRenderer.getCanvas();
                        canvasDiv.appendChild(canvas.wrapper);
                        this.renderCustomChart(canvas.canvas, { hrid: itemHrid, count: count });
                    }
    
                    const contentDiv = Ui.div('lll_div_column');
                    panel.appendChild(contentDiv);
    
                    // 设置
                    const configDiv = Ui.div({ style: 'padding: 5px 0; gap: 15px; display: flex; justify-content: space-around;' });
                    contentDiv.appendChild(configDiv);
    
                    const mapSelectorDiv = Ui.div({ style: 'display: flex; gap: 10px;' });
                    mapSelectorDiv.appendChild(Ui.div('lll_label', UiLocale.chestDrop.distribution.chestSelect[language]));
                    const mapSelect = Ui.elem('select', 'lll_input_select');
                    mapSelectorDiv.appendChild(mapSelect);
                    const sortedChestData = Object.entries(Market.chestDropData)
                        .sort((a, b) => a[1].order - b[1].order);
                    for (let [hrid, data] of sortedChestData) {
                        const text = Localizer.hridToName(hrid);
                        let option = new Option(text, hrid);
                        if (defaultChestHrid === hrid) option.selected = true;
                        mapSelect.options.add(option);
                    }
                    mapSelect.onchange = () => { renderChart(); };
                    configDiv.appendChild(mapSelectorDiv);
    
                    let runCountInputDiv = Ui.div({ style: 'display: flex; gap: 10px;' });
                    configDiv.appendChild(runCountInputDiv);
                    runCountInputDiv.appendChild(Ui.div('lll_label', UiLocale.chestDrop.distribution.cntInput[language]));
                    const getRunCount = (val, inv = 1) => {
                        const A = maxSliderValue * maxCount / (maxCount - maxSliderValue);
                        const x = parseInt(val);
                        return Math.round(A * x / (A - x * inv));
                    };
    
                    const runCountInput = Ui.slider({
                        initValue: defaultChestCount,
                        minValue: 1,
                        maxValue: maxCount,
                        mapFunc: x => getRunCount(x, 1),
                        invMapFunc: x => getRunCount(x, -1),
                        oninput: x => { if (!isMobile) renderChart(x); },
                        onchange: x => { renderChart(x); },
                    }, null, { style: { minWidth: '60px' } })
                    runCountInputDiv.appendChild(runCountInput);
    
                    // 图表容器
                    const canvasDiv = Ui.div();
                    contentDiv.appendChild(canvasDiv);
                    renderChart();
    
                    // 返回到详细页面
                    const customButton = Ui.button(UiLocale.chestDrop.distribution.return[language]);
                    customButton.onclick = () => {
                        panel.removeChild(contentDiv);
                        detailsPanel();
                    };
                    contentDiv.appendChild(Ui.div(null, customButton));
                }
                detailsPanel();
    
                return panel;
            }
            /**
             * @param {HTMLCanvasElement} canvas
             * @param {CountedItem} openedItem
             * @param {CountedItem[]} gainedItems
             */
            renderDetailsChart(canvas, openedItem, gainedItems) {
                const eps = Config.chestDrop.ui.detailsChartCdfEps;
                const coeff = Config.chestDrop.ui.detailsChartSigmaCoeff;
    
                const income = Market.getTotalPrice(gainedItems);
                const stat = ChestDropAnalyzer.analyze(openedItem, income);
                const dist = stat.cdf;
    
                const mu = stat.incomeExpectation;
                const sigma = Math.sqrt(stat.incomeVariance);
                const limit = dist.limit;
                const data = {
                    limitL: Math.max(mu - coeff * sigma, 0),
                    limitR: Math.max(income, mu + coeff * sigma),
                    datasets: [{
                        label: Localizer.hridToName(openedItem.hrid),
                        display: true,
                        shadow: income,
                        color: 0,
                        cdf: dist.cdf,
                    }],
                };
    
                for (const chest of data.datasets) {
                    data.limitL = Math.min(data.limitL, Utils.binarySearch(chest.cdf, 0, limit, eps));
                    data.limitR = Math.max(data.limitR, Utils.binarySearch(chest.cdf, 0, limit, 1 - eps));
                }
    
                ChartRenderer.cdfPdfChart(canvas, data);
            }
            /**
             * @param {HTMLCanvasElement} canvas
             * @param {CountedItem} openedItem
             */
            renderCustomChart(canvas, openedItem) {
                const eps = Config.chestDrop.ui.customChartCdfEps;
                const coeff = Config.chestDrop.ui.customChartSigmaCoeff;
    
                const stat = ChestDropAnalyzer.analyze(openedItem, 0);
                const dist = stat.cdf;
    
                let limitL = Utils.binarySearch(dist.cdf, 0, dist.limit, eps);
                let limitR = Utils.binarySearch(dist.cdf, 0, dist.limit, 1 - eps);
                const median = Utils.binarySearch(dist.cdf, 0, dist.limit, 0.5);
                const mu = stat.incomeExpectation;
                const sigma = Math.sqrt(stat.incomeVariance);
                limitL = Math.max(Math.min(limitL, mu - coeff * sigma), 0);
                limitR = Math.max(limitR, mu + coeff * sigma);
    
                ChartRenderer.cdfPdfWithMedianMeanChart(canvas, {
                    limitL: limitL,
                    limitR: limitR,
                    cdf: dist.cdf,
                    mu: mu,
                    sigma: sigma,
                    median: median,
                })
            }
    
    
            constructSettingsPanel() {
                let panel = Ui.div('lll_div_settingPanelContent');
                const locale = UiLocale.chestDrop.settings;
    
                panel.appendChild(SettingsUi.settingRow(
                    locale.useOriPopup[language], null,
                    Ui.checkBox({
                        checked: Config.chestDrop.ui.useOriginalPopup,
                        onchange: checked => {
                            Config.chestDrop.ui.useOriginalPopup = checked;
                            ConfigManager.saveConfig();
                        }
                    })
                ));
    
                return panel;
            }
    
            /**
             * @param {CountedItem} openedItem
             * @param {CountedItem[]} gainedItems
             */
            showPopup(openedItem, gainedItems) {
                this.popup.open();
                // this.popup.addTab('概览', () => this.constructOverviewPanel(), null);
                this.popup.addTab(UiLocale.chestDrop.distribution.tabLabel[language], () => this.constructDetailsPanel(openedItem, gainedItems), null);
                // this.popup.addTab('历史', () => this.constructHistoryPanel(), null);
                this.popup.addTab(UiLocale.chestDrop.settings.tabLabel[language], () => this.constructSettingsPanel(), null);
            }
    
            /**
             * @param {CountedItem} openedItem
             * @param {CountedItem[]} gainedItems
             */
            constructOpenChestPopup(openedItem, gainedItems) {
                if (Config.chestDrop.verbose) out(openedItem, gainedItems);
                const itemStyle = rarity => {
                    if (rarity === 0) return 'border: 1px solid rgba(96, 96, 109, 1); background-color:rgba(96, 96, 109, 0.5);';
                    if (rarity === 0.5) return 'border: 1px solid rgb(121, 121, 131); background-color:rgba(112, 112, 126, 0.5); box-shadow: 0 0 3px 1px rgba(138, 138, 150, 0.8);';
                    if (rarity === 1) return 'border: 1px solid rgba(107, 129, 109, 1); background-color: rgba(107, 129, 109, 0.5);';
                    if (rarity === 1.5) return 'border: 1px solid rgb(118, 148, 120); background-color: rgba(117, 145, 120, 0.5); box-shadow: 0 0 3px 1px rgba(130, 159, 132, 0.8);';
                    if (rarity === 2) return 'border: 1px solid rgba(121, 140, 165, 1); background-color: rgba(121, 140, 165, 0.5);';
                    if (rarity === 2.5) return 'border: 1px solid rgb(134, 160, 180); background-color: rgba(146, 170, 189, 0.5); box-shadow: 0 0 3px 1px rgba(138, 171, 182, 0.8);';
                    if (rarity === 3 || rarity === 3.5) return 'border: 1px solid rgba(139, 113, 156, 1); background-color: rgba(139, 113, 156, 0.5);';
                    if (rarity === 4 || rarity === 4.5) return 'border: 1px solid rgba(208, 167, 127, 1); background-color: rgba(208, 167, 127, 0.5);';
                    if (rarity === 5 || rarity === 5.5) return 'border: 1px solid rgb(196, 130, 130); background-color: rgba(189, 128, 128, 0.5); box-shadow: 0 0 3px 1px rgba(216, 143, 143, 0.8);';
                    if (rarity === 6 || rarity === 6.5) return 'border: 1px solid rgba(234, 231, 147, 1); background-color: rgba(234, 231, 147, 0.5); box-shadow: 0 0 3px 1.5px rgba(234, 231, 147, 0.8);';
                    return 'border: 1px solid rgba(96, 96, 109, 1); background-color:rgba(96, 96, 109, 0.5);';
                };
                const itemIcon = (item, rarity) => {
                    const { hrid, count } = item;
                    const ret = Ui.div(
                        { style: `margin: auto; width: 60px; height: 60px; font-size: 13px; display: grid; border-radius: 4px; ${itemStyle(rarity)}` },
                        [
                            Ui.div({ style: 'grid-area: 1/1; width: 42px; height: 42px; margin: auto;' },
                                Ui.itemSvgIcon(hrid, 42, true),
                            ),
                            Ui.div({ style: 'grid-area: 1/1; font-size: 13px; font-weight: 500; display: flex; align-items: flex-end; justify-content: flex-end; margin: 0 2px -1px 0; text-shadow: -1px 0 var(--color-background-game),0 1px var(--color-background-game),1px 0 var(--color-background-game),0 -1px var(--color-background-game); user-select: none;' }, Utils.formatPrice(count, { type: 'mwi' })),
                        ]
                    );
                    Tooltip.attach(ret, Tooltip.item(hrid, count), 'center');
                    return ret;
                };
                const getRarity = ChestDropAnalyzer.getRarity(openedItem);
                const order = this.itemSortOrderMap[Config.chestDrop.ui.overviewItemSortOrder].weight;
                const sortedItems = order === null ? gainedItems : gainedItems.sort(
                    (a, b) => order(b, getRarity(b)) - order(a, getRarity(a))
                );
                const itemIconList = [];
                sortedItems.forEach(item => {
                    itemIconList.push(itemIcon(item, getRarity(item)))
                });
    
                const stat = ChestDropAnalyzer.analyze(openedItem, Market.getTotalPrice(gainedItems));
                const colorLuck = `color: ${Utils.luckColor(stat.luck)}`;
                const colorAvg = `color: ${Utils.luckColor(stat.income > stat.incomeExpectation)}`;
                const tablePrice = (x) => {
                    let i = x.length - 1;
                    for (; i >= 0; --i) if (x[i] >= '0' && x[i] <= '9') break;
                    const unit = x.slice(i + 1);
                    let num = x.slice(0, i + 1);
                    return `<td style="text-align: right;"><span style="margin: 0 -3px 0 0;">${num}</span></td><td>${unit}</td>`;
                };
                const currentDiv = Ui.div({ style: 'margin: -2px -4px; font-size: 13px;' }, Ui.elem('table', { style: 'line-height: 1.1; width: 100%;' }, `
                    <tr style="${colorLuck}">
                        <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.count[language]}:</td>
                        ${tablePrice(Utils.formatPrice(openedItem.count))}
                    </tr>
                    <tr style="${colorLuck}">
                        <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.income[language]}:</td>
                        ${tablePrice(Utils.formatPrice(stat.income))}
                    </tr>
                    ${stat.income == stat.profit ? '' : `
                    <tr style="${colorLuck}">
                        <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.profit[language]}:</td>
                        ${tablePrice(Utils.formatPrice(stat.profit).replace('-', '<span style="font-family: Consolas, monaco, monospace;">-</span>'))}
                    </tr>
                    `}
                    <tr style="${colorLuck}">
                        <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.luck[language]}:</td>
                        ${tablePrice(Utils.formatLuck(stat.luck))}
                    </tr>
                    <tr><td colspan="3"><div class="lll_separator" style="margin: 2px -3px"></div></td></tr>
                    <tr style="${colorAvg}">
                        <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.incomeExpt[language]}:</td>
                        ${tablePrice(Utils.formatPrice(stat.incomeExpectation))}
                    </tr>
                    <tr style="${colorAvg}">
                        <td style="text-align: right;"><span class="lll_text_noSelect" style="color: var(--border)">└</span>${UiLocale.chestDrop.chestOpen.stdDev[language]}:</td>
                        ${tablePrice(Utils.formatPrice(Math.sqrt(stat.incomeVariance)))}
                    </tr>
                    <tr style="${colorAvg}">
                        <td style="text-align: right;">
                            ${UiLocale.chestDrop.chestOpen[stat.income > stat.incomeExpectation ? 'higherThanExpt' : 'lowerThanExpt'][language]}:
                        </td>
                        ${tablePrice(Utils.formatPrice(Math.abs(stat.income - stat.incomeExpectation)))}
                    </tr>
                `));
    
                const chestOpenHistory = JSON.parse(localStorage.getItem('Edible_Tools') ?? 'null')?.Chest_Open_Data?.[CharacterData.playerId]
                    ?.开箱数据?.[ClientData.hrid2name(openedItem.hrid)];
                let historyDiv;
                if (!chestOpenHistory) historyDiv = Ui.div(null, '需安装食用工具');
                else {
                    const count = chestOpenHistory.总计开箱数量 + openedItem.count;
                    const income = Object.entries(chestOpenHistory.获得物品).reduce(
                        (pre, cur) => pre + cur[1].数量 * Market.getPriceByName(cur[0]), 0
                    ) + stat.income;
                    const historyStat = ChestDropAnalyzer.analyze({ hrid: openedItem.hrid, count: count }, income);
                    const colorLuckHist = `color: ${Utils.luckColor(historyStat.luck)}`;
                    const colorAvgHist = `color: ${Utils.luckColor(historyStat.income > historyStat.incomeExpectation)}`;
                    historyDiv = Ui.div({ style: 'margin: -2px -4px; font-size:13px;' }, Ui.elem('table', { style: 'line-height: 1.1; width: 100%;' }, `
                        <tr style="${colorLuckHist}">
                            <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.count[language]}:</td>
                            ${tablePrice(Utils.formatPrice(count))}
                        </tr>
                        <tr style="${colorLuckHist}">
                            <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.income[language]}:</td>
                            ${tablePrice(Utils.formatPrice(historyStat.income))}
                        </tr>
                        ${historyStat.income == historyStat.profit ? '' : `
                        <tr style="${colorLuckHist}">
                            <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.profit[language]}:</td>
                            ${tablePrice(Utils.formatPrice(historyStat.profit).replace('-', '<span style="font-family: Consolas, monaco, monospace;">-</span>'))}
                        </tr>
                        `}
                        <tr style="${colorLuckHist}">
                            <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.histLuck[language]}:</td>
                            ${tablePrice(Utils.formatLuck(historyStat.luck))}
                        </tr>
                        <tr><td colspan="3"><div class="lll_separator" style="margin: 2px -3px"></div></td></tr>
                        <tr style="${colorAvgHist}">
                            <td style="text-align: right;">${UiLocale.chestDrop.chestOpen.incomeExpt[language]}:</td>
                            ${tablePrice(Utils.formatPrice(historyStat.incomeExpectation))}
                        </tr>
                        <tr style="${colorAvgHist}">
                            <td style="text-align: right;"><span class="lll_text_noSelect" style="color: var(--border)">└</span>${UiLocale.chestDrop.chestOpen.stdDev[language]}:</td>
                            ${tablePrice(Utils.formatPrice(Math.sqrt(historyStat.incomeVariance)))}
                        </tr>
                        <tr style="${colorAvgHist}">
                            <td style="text-align: right;">
                                ${UiLocale.chestDrop.chestOpen[historyStat.income > historyStat.incomeExpectation ? 'higherThanExpt' : 'lowerThanExpt'][language]}:
                            </td>
                            ${tablePrice(Utils.formatPrice(Math.abs(historyStat.income - historyStat.incomeExpectation)))}
                        </tr>
                    `));
                }
    
                return Ui.div({ style: 'padding: 5px;', id: 'lll_chestOpenPopup' },
                    Ui.div('lll_div_chestOpenContent', [
                        Ui.div('lll_div_row', itemIcon(openedItem, 0)),
                        Ui.div({ className: 'lll_div_row', style: 'margin-top: 8px;' }, Ui.div('lll_div_card', [
                            Ui.div('lll_div_cardTitle', UiLocale.chestDrop.chestOpen.youFound[language]),
                            Ui.div({ style: 'margin-top: 3px; width: 100%; display: grid; grid-template-columns: repeat(4,60px); grid-gap: 6px; justify-content: center;' }, itemIconList),
                        ])),
                        Ui.div('lll_div_row', [
                            Ui.div('lll_div_card', [
                                Ui.div('lll_div_cardTitle', UiLocale.chestDrop.chestOpen.currentChest[language]),
                                currentDiv,
                            ]),
                            Ui.div('lll_div_card', [
                                Ui.div('lll_div_cardTitle', UiLocale.chestDrop.chestOpen.history[language]),
                                historyDiv,
                            ]),
                        ]),
                        Ui.div('lll_div_row', [
                            Ui.elem('button', { className: 'Button_button__1Fe9z', style: 'margin: auto;', onclick: () => { this.openChestPopup.close(); } }, UiLocale.chestDrop.chestOpen.close[language]),
                            Ui.elem('button', { className: 'Button_button__1Fe9z', style: 'margin: auto;', onclick: () => { this.openChestPopup.close(); this.showPopup(openedItem, gainedItems) } }, UiLocale.chestDrop.chestOpen.details[language]),
                        ]),
                    ])
                );
            }
            showOpenChestPopup(msg) {
                const formatter = item => ({ hrid: item.itemHrid, count: item.count });
                const openedItem = formatter(msg.openedItem);
                const gainedItems = msg.gainedItems.map(formatter);
                this.openChestPopup.setContent(this.constructOpenChestPopup(openedItem, gainedItems), UiLocale.chestDrop.chestOpen.openedLoot[language]);
                this.openChestPopup.open();
            }
    
            handleOriginalPopup(node) {
                let closeBtn = node.querySelector('div.Modal_background__2B88R');
                closeBtn.click?.();
            }
            observeOriginalPopup() {
                const observer = new MutationObserver((mutationsList, observer) => {
                    mutationsList.forEach(mutation => {
                        mutation.addedNodes.forEach(addedNode => {
                            // @ts-ignore
                            if (addedNode.classList && addedNode.classList.contains('Modal_modalContainer__3B80m')) {
                                this.handleOriginalPopup(addedNode);
                                observer.disconnect();
                            }
                        });
                    });
                });
                const rootNode = document.body;
                const config = { childList: true, subtree: true };
                observer.observe(rootNode, config);
            }
    
            onLootOpened(msg) {
                if (Config.chestDrop.ui.useOriginalPopup) return;
                this.observeOriginalPopup();
                this.showOpenChestPopup(msg);
            }
        };
    
        //#endregion
    
        MessageHandler.handleMessageRecv(decompressData(localStorage.getItem("initClientData")));
    })();
  });

  // ---------------------------------------------------------------------------
  // Module: 戰鬥 HUD
  // Original: MWI Battle HUD.user.js v0.3.17
  // Author: mortymorty
  // License: MIT
  // Source: https://greasyfork.org/scripts/582499
  // WebSocket compatibility patches: 1
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("battle-hud", "戰鬥 HUD", "idle", () => {
    /*
     * 参考文献:
     *   - [银河奶牛]食用工具 (https://greasyfork.org/zh-CN/scripts/499963-银河奶牛-食用工具)
     *   - MWITools (https://greasyfork.org/zh-CN/scripts/494467-mwitools)
     */
    
    // @ts-ignore
    GM_addStyle(`
    :root {
        --lll-border: rgb(113, 123, 169);
        --lll-border-soft: rgba(113, 123, 169, 0.45);
        --lll-bg: rgb(28, 32, 47);
        --lll-panel: rgb(42, 43, 66);
        --lll-panel-2: rgb(54, 60, 83);
        --lll-panel-3: rgb(57, 59, 88);
        --lll-text: rgb(237, 239, 249);
        --lll-text-soft: rgb(184, 190, 220);
        --lll-accent: rgb(37, 184, 152);
        --lll-close: rgb(187, 94, 94);
        --lll-close-hover: rgb(228, 117, 117);
        --lll-consumable-warn: rgb(224, 192, 74);
    }
    
    .lll_single_popup {
        --lll-popup-width: 720px;
        --lll-popup-collapsed-max-width: 720px;
        --lll-player-min-width: 204px;
        --lll-player-gap: 16px;
        --lll-popup-top-space: calc(env(safe-area-inset-top, 0px) + 1px);
        position: fixed;
        top: var(--lll-popup-top-space); /* 顶部留小间距，同时兼顾刘海和状态栏 */
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        width: min(var(--lll-popup-width), calc(100vw - 12px));
        max-height: calc(100dvh - var(--lll-popup-top-space) - 1px);
        box-sizing: border-box;
        color: var(--lll-text);
        background: rgba(28, 32, 47, 0.85); /* 半透明暗色背景 */
        backdrop-filter: blur(12px); /* 核心：现代毛玻璃模糊 */
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08); /* 极细精致亮边 */
        border-radius: 12px; /* 现代圆角 */
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6); /* 柔和深邃的阴影 */
        display: flex;
        flex-direction: column;
        overflow: visible;
        font-size: 14px;
    }
        .lll_single_popup.lll_collapsed {
        width: min(var(--lll-popup-width), var(--lll-popup-collapsed-max-width), calc(100vw - 12px));
    }
    .lll_single_header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 8px;
        padding: 1px 12px; /* 收窄标题栏高度，保持紧凑 HUD 感 */
        border-bottom: 1px solid rgba(255, 255, 255, 0.05); /* 🔴 一条隐约可见的亮色底线 */
        user-select: none;
        background: rgba(0, 0, 0, 0.15); /* 顶部稍微暗色打底，烘托战斗状态 */
        border-top-left-radius: 11px;
        border-top-right-radius: 11px;
        position: relative;
        cursor: grab;
        touch-action: none;
    }
    .lll_collapsed .lll_single_header {
        cursor: grab;
    }
    .lll_single_popup.lll_dragging .lll_single_header {
        cursor: grabbing;
    }
    .lll_single_title {
        font-size: 16px;
        font-weight: 700;
        text-shadow: 0 0 1.5px rgba(42, 43, 66, 0.8);
        justify-self: start;
        white-space: nowrap;
    }
    .lll_single_headerLeft {
        display: flex;
        align-items: center;
        gap: 12px;
        justify-self: start;
        white-space: nowrap;
    }
    .lll_single_summaryCompact {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        line-height: 1.15;
        color: var(--lll-text-soft);
        white-space: nowrap;
    }
    .lll_single_metricCompact {
        display: flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
    }
    .lll_single_metricLabel {
        color: rgba(255, 255, 255, 0.45);
        font-weight: normal;
        display: flex;
        align-items: center;
        white-space: nowrap;
    }
    .lll_single_topLoot {
        display: flex;
        align-items: center;
        gap: 6px;
        justify-self: center;
        min-width: 0;
    }
    .lll_single_topLootBadge {
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 4px;
        padding: 1px 6px;
        cursor: default;
        transition: all 0.2s ease-out;
    }
    .lll_single_topLootBadge:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.15);
        transform: scale(1.05);
    }
    .lll_single_topLootCount {
        font-size: 11px;
        font-weight: 700;
        color: var(--lll-text-soft);
    }
    .lll_single_topLootBadge:hover .lll_single_topLootCount {
        color: #fff;
    }
    .lll_single_headerRight {
        display: flex;
        align-items: center;
        gap: 8px;
        justify-self: end;
    }
    .lll_single_gearBtn {
        font-size: 18px;
        cursor: pointer;
        user-select: none;
        touch-action: manipulation;
        transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 6px;
    }
    .lll_single_gearBtn:hover {
        transform: rotate(45deg);
    }
    .lll_single_metric {
        display: flex;
        gap: 4px;
        align-items: baseline;
        white-space: nowrap;
    }
    .lll_single_metricValue {
        color: white;
        font-weight: 700;
    }
    .lll_single_threshold {
        display: flex;
        align-items: center;
        gap: 5px;
        color: var(--lll-text-soft);
        cursor: default;
    }
    .lll_single_input {
        width: 62px;
        padding: 3px 6px;
        color: white;
        background: rgb(32, 36, 54);
        border: 1px solid var(--lll-border);
        border-radius: 5px;
        text-align: right;
    }
    .lll_single_input:disabled {
        opacity: 0.45;
    }
    .lll_single_toggle {
        display: flex;
        align-items: center;
        gap: 5px;
        color: var(--lll-text-soft);
        cursor: pointer;
        user-select: none;
    }
    .lll_single_toggleInput {
        display: none;
    }
    .lll_single_toggleTrack {
        width: 30px;
        height: 16px;
        border-radius: 999px;
        background: rgb(82, 88, 119);
        border: 1px solid rgb(107, 116, 153);
        position: relative;
        transition: background-color 0.15s ease-out;
    }
    .lll_single_toggleTrack::after {
        content: "";
        position: absolute;
        width: 12px;
        height: 12px;
        top: 1px;
        left: 1px;
        border-radius: 50%;
        background: rgb(230, 233, 248);
        transition: transform 0.15s ease-out;
    }
    .lll_single_toggleInput:checked + .lll_single_toggleTrack {
        background: var(--lll-accent);
    }
    .lll_single_toggleInput:checked + .lll_single_toggleTrack::after {
        transform: translateX(14px);
    }
    .lll_single_body {
        min-height: 0;
        min-width: 0;
        margin: 0; /* 移除负 margin，采用标准流布局 */
        padding: 12px; /* 稍微增加一点内边距，让排版更舒适呼吸 */
        box-sizing: border-box;
        border: none; /* 🔴 核心：移除内部大黑盒子的实线边框！ */
        border-radius: 0;
        background: transparent; /* 🔴 核心：变透明，透出最外层的毛玻璃！ */
        overflow-x: auto;
        overflow-y: auto;
        overscroll-behavior: contain;
    }
    .lll_single_players {
        display: grid;
        grid-template-columns: repeat(var(--lll-player-columns), minmax(var(--lll-player-min-width), 1fr));
        gap: var(--lll-player-gap); /* 增大列间距，利用负空间（Negative Space）进行分隔 */
    }
    .lll_single_playersViewport {
        width: 100%;
        min-width: 0;
    }
    .lll_single_player {
        background: transparent; /* 完全移除玩家列背景 */
        border: none; /* 完全移除玩家列边框 */
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .lll_single_playerHeader {
        padding: 7px 8px;
        background: var(--lll-panel-3);
        text-align: center;
        font-size: 14px;
        font-weight: 700;
        color: var(--lll-text);
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .lll_single_stats {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 8px;
        border-bottom: 1px solid var(--lll-border-soft);
    }
    .lll_single_stat {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 8px;
        align-items: baseline;
        line-height: 1.25;
    }
    .lll_single_statLabel {
        color: var(--lll-text-soft);
        white-space: nowrap;
    }
    .lll_single_statValue {
        min-width: 0;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .lll_single_iconRow {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        padding: 6px 8px;
        border-bottom: 1px solid var(--lll-border-soft);
    }
    .lll_single_iconRowLabel {
        display: none;
        flex: 0 0 4.8em;
        color: var(--lll-text-soft);
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
    }
    .lll_single_iconRowBody {
        flex: 0 0 auto;
        min-width: 0;
    }
    .lll_single_consumableList {
        display: grid;
        grid-template-columns: repeat(6, 28px);
        justify-content: start;
        gap: 4px;
        padding: 6px 8px;
    }
    .lll_single_consumableSlot {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid transparent;
        border-radius: 4px;
    }
    .lll_single_consumableSlotEmpty {
        background: transparent;
    }
    .lll_single_consumableSlotLow {
        border-color: var(--lll-close-hover);
        box-shadow: 0 0 0 1px rgba(228, 117, 117, 0.25) inset;
    }
    .lll_single_consumableSlotWarn {
        border-color: var(--lll-consumable-warn);
        box-shadow: 0 0 0 1px rgba(224, 192, 74, 0.24) inset;
    }
    .lll_single_abilityList {
        display: grid;
        grid-template-columns: repeat(5, 28px);
        justify-content: start;
        gap: 4px;
        padding: 0 8px 6px;
    }
    .lll_single_abilitySlot {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid transparent;
        border-radius: 4px;
    }
    .lll_single_abilitySlotEmpty {
        background: transparent;
    }
    .lll_single_lootList {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 6px;
    }
    .lll_single_item {
        display: grid;
        grid-template-columns: auto 18px minmax(0, 1fr);
        gap: 6px; /* 稍微增加内部分隔 */
        align-items: center;
        height: 30px;
        padding: 4px 6px; /* 增加内边距，触感更佳 */
        background: rgba(255, 255, 255, 0.02); /* 极其微弱的底色 */
        border: 1px solid transparent; /* 移除实体边框，保留占位防止抖动 */
        border-radius: 4px;
        font-size: 16px;
        box-sizing: border-box;
        transition: background 0.15s ease, border-color 0.15s ease;
    }
    .lll_single_item:hover {
        background: rgba(255, 255, 255, 0.08); /* 悬浮时半透明色块亮起 */
        border-color: rgba(255, 255, 255, 0.1);
    }
    .lll_single_item.lll_lootHighlight {
        background: rgba(255, 255, 255, 0.13);
        border-color: rgba(255, 255, 255, 0.18);
    }
    .lll_single_item.lll_lootHighlightSource {
        background: rgba(255, 255, 255, 0.18);
        border-color: rgba(255, 255, 255, 0.28);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    }
    
    .lll_single_itemPlaceholder {
        min-height: 30px;
        padding: 4px 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.12); /* 极其淡的灰色中划线色值 */
        border: 1px dashed rgba(255, 255, 255, 0.04); /* 几乎不可见的极微弱虚线 */
        border-radius: 4px;
        box-sizing: border-box;
    }
    
    .lll_single_itemName {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .lll_single_itemName.lll_single_itemNameHighValue {
        color: #ff9f43;
        font-weight: 700;
    }
    .lll_single_itemCount {
        color: white;
        font-weight: 700;
    }
    .lll_single_tooltip {
        position: fixed;
        z-index: 10020;
        max-width: min(320px, calc(100vw - 16px));
        padding: 8px 10px;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(20, 24, 36, 0.97);
        color: var(--lll-text);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        font-size: 12px;
        line-height: 1.4;
        white-space: pre-line;
        overflow-wrap: anywhere;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translateY(4px);
        transition: opacity 0.12s ease, transform 0.12s ease, visibility 0s linear 0.12s;
    }
    .lll_single_tooltip.lll_visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
        transition: opacity 0.12s ease, transform 0.12s ease;
    }
    [data-lll-tooltip="1"] {
        cursor: help;
        touch-action: manipulation;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
    }
    .lll_single_empty {
        color: var(--lll-text-soft);
        padding: 10px;
        text-align: center;
    }
    .lll_single_status {
        color: var(--lll-text-soft);
        margin-bottom: 10px;
        text-align: center;
    }
    
    /* 齿轮设置按钮样式 */
    /* 下拉菜单样式 */
    .lll_single_settingsDropdown {
        position: absolute;
        top: 36px;
        right: 12px;
        width: 240px;
        background: rgba(28, 32, 47, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 10005;
        animation: lll-dropdown-in 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-sizing: border-box;
    }
    @keyframes lll-dropdown-in {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    /* 下拉项样式 */
    .lll_single_dropdownRow {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        color: var(--lll-text);
        font-size: 13px;
    }
    .lll_single_dropdownLabel {
        color: var(--lll-text-soft);
        white-space: nowrap;
    }
    
    @media (max-width: 600px) {
        .lll_single_popup {
            width: calc(100vw - 2px);
            max-height: calc(100dvh - var(--lll-popup-top-space) - 1px);
            font-size: 13px;
        }
        .lll_single_popup.lll_collapsed {
            width: calc(100vw - 2px);
        }
        .lll_single_header {
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-rows: auto;
            padding: 3px 8px;
        }
        .lll_single_headerLeft {
            grid-column: 1;
            min-width: 0;
            gap: 8px;
        }
        .lll_single_summaryCompact {
            gap: 8px;
            font-size: 12px;
            min-width: 0;
            overflow: hidden;
        }
        .lll_single_headerRight {
            grid-column: 2;
            grid-row: 1;
            gap: 6px;
            align-self: start;
        }
        .lll_single_topLoot {
            display: none;
        }
        .lll_single_body {
            padding: 8px;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
        }
        .lll_single_players {
            gap: 8px;
        }
        .lll_mobile-vertical .lll_single_players {
            grid-template-columns: 1fr;
        }
        .lll_mobile-horizontal .lll_single_players {
            grid-template-columns: repeat(var(--lll-player-columns), minmax(var(--lll-player-min-width), 1fr));
            gap: var(--lll-player-gap);
        }
        .lll_mobile-horizontal .lll_single_playersViewport {
            overflow: hidden;
        }
        .lll_single_popup.lll_mobile-horizontal {
            font-size: 22px;
        }
        .lll_mobile-horizontal .lll_single_header {
            gap: 10px;
            padding: 4px 10px;
        }
        .lll_mobile-horizontal .lll_single_summaryCompact {
            gap: 10px;
            font-size: 22px;
        }
        .lll_mobile-horizontal .lll_single_metricLabel {
            font-size: 19px;
        }
        .lll_mobile-horizontal .lll_single_metricValue {
            font-size: 22px;
        }
        .lll_mobile-horizontal .lll_single_headerRight {
            gap: 8px;
        }
        .lll_mobile-horizontal .lll_single_gearBtn {
            width: 40px;
            height: 40px;
            font-size: 28px;
        }
        .lll_mobile-horizontal .lll_single_playerHeader {
            padding: 6px 10px;
            font-size: 22px;
            line-height: 1.1;
        }
        .lll_mobile-horizontal .lll_single_player {
            border-left: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 0;
        }
        .lll_mobile-horizontal .lll_single_player:first-child {
            border-left: 0;
        }
        .lll_mobile-horizontal .lll_single_stats {
            gap: 8px;
            padding: 10px;
        }
        .lll_mobile-horizontal .lll_single_stat {
            gap: 10px;
            line-height: 1.35;
        }
        .lll_mobile-horizontal .lll_single_statLabel {
            font-size: 19px;
        }
        .lll_mobile-horizontal .lll_single_statValue {
            font-size: 22px;
        }
        .lll_mobile-horizontal .lll_single_iconRow {
            gap: 8px;
            padding: 8px 10px;
        }
        .lll_mobile-horizontal .lll_single_iconRowLabel {
            font-size: 19px;
        }
        .lll_mobile-horizontal .lll_single_consumableList {
            gap: 6px;
            padding: 8px 10px;
        }
        .lll_mobile-horizontal .lll_single_abilityList {
            gap: 6px;
            padding: 0 10px 8px;
        }
        .lll_mobile-horizontal .lll_single_consumableSlot,
        .lll_mobile-horizontal .lll_single_abilitySlot {
            width: 36px;
            height: 36px;
            border-radius: 6px;
        }
        .lll_mobile-horizontal .lll_single_item {
            height: 38px;
            padding: 6px 8px;
            font-size: 24px;
        }
        .lll_mobile-horizontal .lll_single_itemPlaceholder {
            min-height: 38px;
        }
        .lll_mobile-horizontal .lll_single_itemCount {
            font-size: 21px;
        }
        .lll_mobile-horizontal .lll_single_settingsDropdown {
            width: min(92vw, 340px);
        }
        .lll_mobile-horizontal .lll_single_dropdownRow {
            min-height: 52px;
            font-size: 20px;
        }
        .lll_mobile-horizontal .lll_single_input {
            width: 92px;
            padding: 5px 8px;
            font-size: 20px;
        }
        .lll_mobile-horizontal .lll_single_toggleTrack {
            width: 52px;
            height: 30px;
        }
        .lll_mobile-horizontal .lll_single_toggleTrack::after {
            width: 24px;
            height: 24px;
            top: 2px;
            left: 2px;
        }
        .lll_mobile-horizontal .lll_single_toggleInput:checked + .lll_single_toggleTrack::after {
            transform: translateX(22px);
        }
        .lll_single_player {
            border-radius: 6px;
        }
        .lll_single_playerHeader {
            padding: 6px 8px;
            font-size: 13px;
        }
        .lll_single_stats {
            gap: 4px;
            padding: 6px 8px;
        }
        .lll_single_iconRow {
            gap: 6px;
            padding: 6px 8px;
        }
        .lll_single_iconRowLabel {
            display: block;
            font-size: 12px;
        }
        .lll_single_stat {
            gap: 6px;
        }
        .lll_single_consumableList {
            grid-template-columns: repeat(6, 32px);
            gap: 6px;
            padding: 0;
        }
        .lll_single_abilityList {
            grid-template-columns: repeat(5, 32px);
            gap: 6px;
            padding: 0;
        }
        .lll_single_consumableSlot,
        .lll_single_abilitySlot {
            width: 32px;
            height: 32px;
            border-radius: 5px;
        }
        .lll_single_item {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 4px;
            height: auto;
            min-height: 34px;
            font-size: 15px;
            padding: 4px 6px;
        }
        .lll_single_itemPlaceholder {
            min-height: 34px;
        }
        .lll_single_itemName {
            flex: 0 1 auto;
            min-width: 0;
        }
        .lll_single_itemCount {
            flex: 0 0 auto;
            margin-left: 2px;
            padding: 1px 6px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: var(--lll-text);
            font-size: 12px;
            line-height: 1.2;
        }
        .lll_single_input {
            width: 78px;
            padding: 5px 8px;
            font-size: 14px;
        }
        .lll_single_toggleTrack {
            width: 40px;
            height: 22px;
        }
        .lll_single_toggleTrack::after {
            width: 16px;
            height: 16px;
            top: 2px;
            left: 2px;
        }
        .lll_single_toggleInput:checked + .lll_single_toggleTrack::after {
            transform: translateX(20px);
        }
        .lll_single_dropdownRow {
            min-height: 44px;
            font-size: 14px;
        }
        .lll_single_gearBtn {
            width: 32px;
            height: 32px;
            font-size: 18px;
        }
        .lll_single_gearBtn:hover,
        .lll_single_topLootBadge:hover,
        .lll_single_item:hover {
            transform: none;
        }
        .lll_single_settingsDropdown {
            left: 0;
            right: 0;
            width: auto;
            top: 60px;
            padding: 14px 12px;
            border-radius: 10px;
            max-height: calc(100dvh - env(safe-area-inset-top, 0px) - 64px);
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }
        .lll_mobile-horizontal .lll_single_item {
            display: grid;
            grid-template-columns: max-content 24px minmax(0, 1fr);
            gap: 5px;
            align-items: center;
            justify-content: stretch;
            height: 38px;
            min-height: 38px;
            padding: 5px 6px;
        }
        .lll_mobile-horizontal .lll_single_item > svg {
            grid-column: 2;
            grid-row: 1;
            justify-self: center;
            width: 24px;
            height: 24px;
        }
        .lll_mobile-horizontal .lll_single_itemName {
            grid-column: 3;
            grid-row: 1;
            min-width: 0;
        }
        .lll_mobile-horizontal .lll_single_itemCount {
            grid-column: 1;
            grid-row: 1;
            justify-self: start;
            width: auto;
            min-width: 0;
            margin-left: 0;
            padding: 0;
            border-radius: 0;
            background: transparent;
            color: var(--lll-text);
            font-size: 20px;
            line-height: 1;
            text-align: left;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-variant-numeric: tabular-nums;
            font-feature-settings: "tnum";
        }
        .lll_mobile-horizontal .lll_single_itemCount::before {
            content: "";
        }
        .lll_mobile-horizontal .lll_single_iconRow {
            display: block;
            padding: 6px 8px;
        }
        .lll_mobile-horizontal .lll_single_iconRowLabel {
            display: none;
        }
        .lll_mobile-horizontal .lll_single_iconRowBody {
            min-width: 0;
        }
        .lll_mobile-horizontal .lll_single_consumableList {
            padding: 0;
        }
        .lll_mobile-horizontal .lll_single_abilityList {
            padding: 0;
        }
        .lll_mobile-horizontal .lll_single_consumableList {
            grid-template-columns: repeat(6, 30px);
            gap: 4px;
        }
        .lll_mobile-horizontal .lll_single_consumableSlot {
            width: 30px;
            height: 30px;
            border-radius: 5px;
        }
        .lll_mobile-horizontal .lll_single_consumableSlot > svg {
            width: 22px;
            height: 22px;
        }
    }
    
    `);
    
    /** counted item
     * @typedef {{ hrid: string, count: number }} CountedItem
     */
    
    (function () {
        'use strict';
    
        const App = Object.freeze({
            name: 'MWI Battle HUD',
            logPrefix: '%c[MWI Battle HUD]%c',
            storage: {
                name: 'lll_single_page_data',
                version: '0.1.0',
                verbose: false,
            },
            ui: {
                mobileBreakpoint: 768,
                mobileMaxWidth: 600,
                layout: {
                    singlePlayerMinWidth: 420,
                    playerPreferredWidth: 220,
                    playerMinWidth: 204,
                    playerGap: 16,
                    mobileHorizontalPlayerGap: 0,
                    bodyHorizontalPadding: 24,
                    mobileBodyHorizontalPadding: 16,
                    popupBorderWidth: 2,
                    collapsedMaxWidth: 720,
                },
            },
            combatConsumables: {
                slotCount: 6,
                foodSlotCount: 3,
                foodLowThreshold: 1440,
                drinkLowThreshold: 288,
                stockHighMultiplier: 3,
            },
            combatAbilities: {
                slotCount: 5,
            },
            websocketHosts: [
                'api.milkywayidle.com/ws',
                'api-test.milkywayidle.com/ws',
                'api.milkywayidlecn.com/ws',
                'api-test.milkywayidlecn.com/ws',
            ],
        });
    
        const Logger = new class {
            #bind(color) { return console.log.bind(null, App.logPrefix, `color:${color}`, 'color:black'); }
            debug = this.#bind('blue');
            info = this.#bind('green');
            error = this.#bind('red');
        };
        const out = Logger.info;
        const err = Logger.error;
    
        const isCN = !['en'].some(lang => localStorage.getItem('i18nextLng')?.toLowerCase()?.startsWith(lang));
        const defaultLanguage = isCN ? 'zh' : 'en';
        let language = defaultLanguage;
    
        const UiLocale = {
            button: { zh: '统计', en: 'Stats' },
            // 1. 将“战斗统计”升级为具有沉浸感的“战斗 HUD”
            title: { zh: '⚔️', en: '⚔️' },
    
            // 2. 为 EPH 增加动态闪电图标
            eph: { zh: '⚡', en: '⚡' },
    
            // 3. 🔴 极其关键：直接将“用时”文字精简为钟表图标，彻底释放空间，防止文本拥挤
            duration: { zh: '⏱️', en: '⏱️' },
    
            // 4. 将过滤文字精简为金币符号
            threshold: { zh: '💰 过滤 >=', en: '💰 Unit >=' },
    
            thresholdUnit: { zh: 'K', en: 'K' },
            topExp: { zh: '选修经验/h', en: 'Focus Training/h' },
            totalExp: { zh: '总经验/h', en: 'Total EXP/h' },
            deathCount: { zh: '死亡次数', en: 'Deaths' },
            settings: { zh: '⚙️ 设置', en: '⚙️ Settings' },
            optFilter: { zh: '启用掉落过滤', en: 'Enable Filter' },
            optThreshold: { zh: '价值阈值', en: 'Min Price (K)' },
            optPlaceholder: { zh: '对齐空卡片(虚线框)', en: 'Align Empty (Dashed)' },
            optShowExp: { zh: '显示经验统计', en: 'Show Experience' },
            optShowDeaths: { zh: '显示死亡次数', en: 'Show Deaths' },
            optShowConsumables: { zh: '显示消耗品', en: 'Show Consumables' },
            optShowAbilities: { zh: '显示技能栏', en: 'Show Abilities' },
            optMobileHorizontal: { zh: '移动端横向布局', en: 'Mobile Horizontal Layout' },
            abilityRowLabel: { zh: '技能', en: 'Skills' },
            consumableRowLabel: { zh: '消耗品', en: 'Supplies' },
            loot: { zh: '掉落信息', en: 'Loot' },
            unitPriceLabel: { zh: '单价', en: 'Unit Price' },
            totalPriceLabel: { zh: '总价', en: 'Total Price' },
            marketLoading: { zh: '市场价格加载中，掉落过滤会在价格可用后刷新。', en: 'Market data is loading. Loot filtering refreshes after prices are ready.' },
            noBattle: { zh: '暂无战斗数据。进入战斗后再打开或等待下一次战斗消息。', en: 'No battle data yet. Open this after entering combat or wait for the next battle message.' },
            battleSyncing: { zh: '战斗数据同步中，等待下一条战斗消息。', en: 'Battle data is syncing. Waiting for the next combat update.' },
            noLoot: { zh: '无符合阈值的掉落', en: 'No loot above threshold' },
            none: { zh: '无', en: 'None' },
            unknown: { zh: '未知', en: 'Unknown' },
        };
    
        const Utils = new class {
            isMobileViewport() {
                return window.matchMedia
                    ? window.matchMedia(`(max-width: ${App.ui.mobileMaxWidth}px)`).matches
                    : window.innerWidth <= App.ui.mobileMaxWidth;
            }
    
            isIOSWebKit() {
                const ua = navigator.userAgent || '';
                const platform = navigator.platform || '';
                return /iPad|iPhone|iPod/.test(ua)
                    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            }
    
            formatPrice(value, style = null) {
                value = Number(value);
                if (!Number.isFinite(value)) return '-';
                const precision = style?.precision ?? 4;
                const isNegative = value < 0;
                value = Math.abs(value);
                const sign = isNegative ? '-' : '';
                if (value < 10000) return sign + value.toFixed(0);
                const e = Math.floor(Math.log10(value));
                const base = Math.min(12, 3 + Math.max(0, Math.floor((e - precision) / 3) * 3));
                const unit = '1KMBT'[base / 3];
                const scaled = value / Math.pow(10, base);
                const decLen = Math.max(0, precision - (e - base) - 1 - (scaled < 1 ? 1 : 0));
                return sign + scaled.toFixed(decLen) + unit;
            }
    
            formatNumber(value) {
                value = Number(value);
                if (!Number.isFinite(value)) return '-';
                return Math.round(value).toString().replace(/\d+/, n => n.replace(/(\d)(?=(?:\d{3})+$)/g, '$1,'));
            }
    
            formatExp(value) {
                value = Number(value);
                if (!Number.isFinite(value)) return '-';
                return `${(value / 1000).toFixed(1)}K`;
            }
    
            formatDuration(duration) {
                duration = Math.max(0, Number(duration) || 0);
                const h = Math.floor(duration / 3600);
                const m = Math.floor(duration / 60) % 60;
                return `${h}h ${m < 10 ? '0' : ''}${m}m`;
            }
    
            clamp(value, min, max) {
                return Math.min(Math.max(value, min), max);
            }
        };
    
        const LocalStorageData = new class {
            #readRoot() {
                const root = JSON.parse(localStorage.getItem(App.storage.name) ?? '{}');
                if (root.version !== App.storage.version) root.version = App.storage.version;
                return root;
            }
    
            get(key) {
                const data = this.#readRoot();
                if (App.storage.verbose) out(`load ${key} from localStorage:`, data[key]);
                return data[key];
            }
    
            set(key, value) {
                const data = this.#readRoot();
                data[key] = value;
                localStorage.setItem(App.storage.name, JSON.stringify(data));
                if (App.storage.verbose) out(`saved ${key} to localStorage:`, value);
            }
        };
    
        let Config = {
            general: {
                /** @type {'default' | 'zh' | 'en'} */ language: 'default',
            },
            market: {
                autoUpdateInterval: 6,
                computeNetProfit: true,
                computeNonTradable: true,
            },
            ui: {
                minUnitPriceK: 10,
                filterEnabled: true,
                placeholderEnabled: true,
                showExp: true,
                showDeaths: true,
                showConsumables: true,
                showAbilities: true,
                mobileHorizontalLayout: true,
            },
        };
    
        const ConfigManager = new class {
            storageDataName = 'config';
    
            constructor() {
                this.loadConfig();
            }
    
            loadConfig() {
                const merge = (defaults, user) => {
                    if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
                        return user ?? defaults;
                    }
                    const ret = {};
                    for (const [key, value] of Object.entries(defaults)) {
                        ret[key] = merge(value, user?.[key]);
                    }
                    return ret;
                };
                Config = merge(Config, LocalStorageData.get(this.storageDataName) ?? {});
                language = Config.general.language === 'default' ? defaultLanguage : Config.general.language;
            }
    
            saveConfig() {
                LocalStorageData.set(this.storageDataName, Config);
            }
        };
    
        const MessageHandler = new class {
            listeners = {};
    
            constructor() {
                this.hookWS();
            }
    
            hookWS() {
                const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
                const oriGet = dataProperty.get;
                const handleMessageRecv = this.handleMessageRecv.bind(this);
                dataProperty.get = function hookedGet() {
                    const socket = this.currentTarget;
                    if (!(socket instanceof WebSocket)) return oriGet.call(this);
                    if (!App.websocketHosts.some(host => socket.url.indexOf(host) > -1)) return oriGet.call(this);
                    const message = oriGet.call(this);
                    Object.defineProperty(this, "data", { value: message, configurable: true });
                    handleMessageRecv(message);
                    return message;
                };
                Object.defineProperty(MessageEvent.prototype, 'data', dataProperty);
            }
    
            addListener(type, handler, priority = 0) {
                (this.listeners[type] ??= []).push({ handler, priority });
            }
    
            handleMessageRecv(message) {
                if (!message) return message;
                let obj;
                try {
                    obj = typeof message === 'string' ? JSON.parse(message) : message;
                } catch (_) {
                    return message;
                }
                if (!obj?.type || !this.listeners[obj.type]) return message;
                this.listeners[obj.type]
                    .sort((a, b) => a.priority - b.priority)
                    .forEach(listener => {
                        try {
                            listener.handler(obj);
                        } catch (error) {
                            err(`message listener failed: ${obj.type}`, error);
                        }
                    });
                return message;
            }
        };
    
        const Ui = new class {
            abilityIconUrl = null;
            abilityIconRetryTimer = null;
            abilityIconRetryCount = 0;
    
            constructor() {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '0');
                svg.setAttribute('height', '0');
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                defs.innerHTML = `
                    <filter id="lll_shadow" x="-20" y="-20" height="150" width="150">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                        <feOffset dx="0" dy="0" result="offsetblur"/>
                        <feFlood flood-color="rgba(0, 0, 0, 0.3)"/>
                        <feComposite in2="offsetblur" operator="in"/>
                        <feMerge>
                            <feMergeNode/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                `;
                svg.appendChild(defs);
                (document.body || document.documentElement)?.appendChild(svg);
            }
    
            applyOptions(elem, options) {
                if (typeof options === 'string') {
                    elem.className = options;
                    return;
                }
                Object.entries(options ?? {}).forEach(([key, value]) => {
                    if (key === 'style') {
                        if (typeof value === 'object') Object.assign(elem.style, value);
                        else elem.setAttribute('style', value);
                    } else {
                        elem[key] = value;
                    }
                });
            }
    
            elem(tagName, options = null, child = null) {
                const elem = document.createElement(tagName);
                this.applyOptions(elem, options);
                if (Array.isArray(child)) {
                    child.forEach(node => { if (node) elem.appendChild(node); });
                } else if (child instanceof Node) {
                    elem.appendChild(child);
                } else if (typeof child === 'string') {
                    elem.textContent = child;
                }
                return elem;
            }
    
            div(options = null, childList = null) {
                return this.elem('div', options, childList);
            }
    
            itemSvgIcon(hrid, size = 22, useShadow = false) {
                const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svgIcon.setAttribute('width', size.toString());
                svgIcon.setAttribute('height', size.toString());
                svgIcon.style.verticalAlign = 'middle';
    
                const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                let itemIconUrl = document.querySelector("div[class^='Item_itemContainer'] use")?.getAttribute('href')?.split('#')[0];
                itemIconUrl ??= '/static/media/items_sprite.6d12eb9d.svg';
                const iconHref = `${itemIconUrl}#${hrid.split('/').pop()}`;
                useElement.setAttribute('href', iconHref);
                useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', iconHref);
                if (useShadow && !Utils.isIOSWebKit()) useElement.setAttribute('filter', 'url(#lll_shadow)');
                svgIcon.appendChild(useElement);
                return svgIcon;
            }
    
            getAbilityIconUrl(iconId) {
                if (this.abilityIconUrl) return this.abilityIconUrl;
    
                const pageUseHrefs = [...document.querySelectorAll('use')]
                    .filter(use => !use.closest('.lll_single_popup'))
                    .map(use => use.getAttribute('href') || use.href?.baseVal || '');
    
                let abilityIconUrl = pageUseHrefs
                    .find(href => href.endsWith(`#${iconId}`))
                    ?.split('#')[0];
                abilityIconUrl ??= pageUseHrefs
                    .find(href => href.toLowerCase().includes('abilit') && href.toLowerCase().includes('sprite'))
                    ?.split('#')[0];
                abilityIconUrl ??= performance.getEntriesByType('resource')
                    .map(entry => (entry.name || '').split('#')[0])
                    .find(url => {
                        const normalized = url.toLowerCase();
                        return normalized.includes('abilit')
                            && normalized.includes('sprite')
                            && normalized.split('?')[0].endsWith('.svg');
                    });
    
                if (abilityIconUrl) {
                    this.abilityIconUrl = abilityIconUrl;
                    this.abilityIconRetryCount = 0;
                    return abilityIconUrl;
                }
    
                return null;
            }
    
            scheduleAbilityIconRetry() {
                if (this.abilityIconRetryTimer || this.abilityIconRetryCount >= 20) return;
                this.abilityIconRetryCount += 1;
                this.abilityIconRetryTimer = setTimeout(() => {
                    this.abilityIconRetryTimer = null;
                    if (this.getAbilityIconUrl('')) {
                        document.dispatchEvent(new CustomEvent('lll-single-battle-updated'));
                    } else {
                        this.scheduleAbilityIconRetry();
                    }
                }, 500);
            }
    
            abilitySvgIcon(hrid, size = 22, useShadow = false) {
                const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svgIcon.setAttribute('width', size.toString());
                svgIcon.setAttribute('height', size.toString());
                svgIcon.style.verticalAlign = 'middle';
    
                const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                const iconId = hrid.split('/').pop();
                const abilityIconUrl = this.getAbilityIconUrl(iconId);
                if (!abilityIconUrl) {
                    this.scheduleAbilityIconRetry();
                    return svgIcon;
                }
    
                const iconHref = `${abilityIconUrl}#${iconId}`;
                useElement.setAttribute('href', iconHref);
                useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', iconHref);
                if (useShadow && !Utils.isIOSWebKit()) useElement.setAttribute('filter', 'url(#lll_shadow)');
                svgIcon.appendChild(useElement);
                return svgIcon;
            }
    
        };
    
        const Tooltip = new class {
            root = null;
            target = null;
            hideTimer = null;
            showTimer = null;
            isTouchInteraction = false;
            touchClickSuppressUntil = 0;
    
            isHoverCapable() {
                try {
                    return window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? false;
                } catch (_) {
                    return false;
                }
            }
    
            ensureRoot() {
                if (this.root) return this.root;
                this.root = Ui.div('lll_single_tooltip');
                this.root.setAttribute('role', 'tooltip');
                this.root.setAttribute('aria-hidden', 'true');
                (document.body || document.documentElement)?.appendChild(this.root);
                return this.root;
            }
    
            clearTimers() {
                if (this.hideTimer) {
                    clearTimeout(this.hideTimer);
                    this.hideTimer = null;
                }
                if (this.showTimer) {
                    clearTimeout(this.showTimer);
                    this.showTimer = null;
                }
            }
    
            hide(immediate = false) {
                this.clearTimers();
                this.target = null;
                if (!this.root) return;
                const applyHide = () => {
                    this.root.classList.remove('lll_visible');
                    this.root.setAttribute('aria-hidden', 'true');
                    this.root.textContent = '';
                };
                if (immediate) {
                    applyHide();
                    return;
                }
                this.hideTimer = setTimeout(applyHide, 80);
            }
    
            position(target) {
                if (!this.root || !target) return;
                const rect = target.getBoundingClientRect();
                const tooltipRect = this.root.getBoundingClientRect();
                const viewport = window.visualViewport;
                const viewportWidth = viewport?.width ?? window.innerWidth;
                const viewportHeight = viewport?.height ?? window.innerHeight;
                const margin = 10;
                let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
                let top = rect.bottom + margin;
    
                if (left < 8) left = 8;
                if (left + tooltipRect.width > viewportWidth - 8) {
                    left = Math.max(8, viewportWidth - tooltipRect.width - 8);
                }
                if (top + tooltipRect.height > viewportHeight - 8) {
                    top = rect.top - tooltipRect.height - margin;
                }
                if (top < 8) top = 8;
    
                this.root.style.left = `${Math.round(left)}px`;
                this.root.style.top = `${Math.round(top)}px`;
            }
    
            show(target, text, immediate = false) {
                if (!target || !text) return;
                this.clearTimers();
                this.target = target;
                const root = this.ensureRoot();
                root.textContent = text;
                root.style.visibility = 'hidden';
                root.classList.remove('lll_visible');
                const doShow = () => {
                    if (!this.target || this.target !== target) return;
                    this.position(target);
                    root.style.visibility = 'visible';
                    root.setAttribute('aria-hidden', 'false');
                    root.classList.add('lll_visible');
                };
                if (immediate) {
                    doShow();
                } else {
                    this.showTimer = setTimeout(doShow, 250);
                }
            }
    
            attach(target, getText, options = {}) {
                if (!target || typeof getText !== 'function') return target;
                const {
                    hover = true,
                    touch = true,
                    focus = false,
                    focusable = false,
                    stopPropagation = true,
                } = options;
                target.dataset.lllTooltip = '1';
                const label = getText();
                if (label) target.setAttribute('aria-label', label);
                target.removeAttribute('title');
                if (focusable && target.tabIndex < 0) target.tabIndex = 0;
                if (hover) {
                    target.addEventListener('pointerenter', event => {
                        if (!this.isHoverCapable()) return;
                        this.isTouchInteraction = false;
                        this.show(event.currentTarget, getText(), false);
                    });
                    target.addEventListener('pointerleave', () => {
                        if (!this.isHoverCapable()) return;
                        this.hide(false);
                    });
                }
                if (focus) {
                    target.addEventListener('focus', event => {
                        if (!this.isHoverCapable()) return;
                        this.show(event.currentTarget, getText(), true);
                    });
                    target.addEventListener('blur', () => {
                        if (!this.isHoverCapable()) return;
                        this.hide(true);
                    });
                }
                if (touch) {
                    target.addEventListener('pointerup', event => {
                        if (event.pointerType === 'mouse') return;
                        if (stopPropagation) event.stopPropagation();
                        this.isTouchInteraction = true;
                        this.touchClickSuppressUntil = Date.now() + 400;
                        if (this.target === event.currentTarget && this.root?.classList.contains('lll_visible')) {
                            this.hide(true);
                            return;
                        }
                        this.show(event.currentTarget, getText(), true);
                    });
                    target.addEventListener('click', event => {
                        if (Date.now() < this.touchClickSuppressUntil) {
                            if (stopPropagation) event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                        if (this.isHoverCapable()) return;
                        if (stopPropagation) event.stopPropagation();
                        this.isTouchInteraction = true;
                        if (this.target === event.currentTarget && this.root?.classList.contains('lll_visible')) {
                            this.hide(true);
                            return;
                        }
                        this.show(event.currentTarget, getText(), true);
                    });
                    target.addEventListener('contextmenu', event => {
                        if (!this.isHoverCapable()) event.preventDefault();
                    });
                }
                return target;
            }
    
            installGlobalDismiss() {
                const dismiss = event => {
                    if (!this.root || !this.root.classList.contains('lll_visible')) return;
                    if (this.target && this.target.contains(event.target)) return;
                    this.hide(true);
                };
                document.addEventListener('pointerdown', dismiss, true);
                document.addEventListener('scroll', () => {
                    if (this.root?.classList.contains('lll_visible')) this.hide(true);
                }, true);
                window.addEventListener('resize', () => {
                    if (this.root?.classList.contains('lll_visible') && this.target) {
                        this.position(this.target);
                    }
                }, { passive: true });
                window.visualViewport?.addEventListener('resize', () => {
                    if (this.root?.classList.contains('lll_visible') && this.target) {
                        this.position(this.target);
                    }
                }, { passive: true });
            }
        };
    
        Tooltip.installGlobalDismiss();
    
        function decompressData(compressed) {
            if (!compressed) return '';
            try {
                return LZString.decompressFromUTF16(compressed) || '';
            } catch (error) {
                err('解压失败:', error);
                return '';
            }
        }
    
        const ClientData = new class {
            #data = null;
            #hrid2name = {};
            #name2hrid = {};
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.set(msg); }, -100);
            }
    
            get() {
                if (!this.#data) {
                    const cached = decompressData(localStorage.getItem('initClientData'));
                    if (cached) this.set(JSON.parse(cached));
                }
                return this.#data ?? {};
            }
    
            set(val) {
                if (!val) return;
                this.#data = val;
                this.#hrid2name = {};
                this.#name2hrid = {};
                [
                    val.itemDetailMap,
                    val.skillDetailMap,
                    val.abilityDetailMap,
                    val.combatMonsterDetailMap,
                    val.actionDetailMap,
                ].forEach(detailMap => {
                    for (const [hrid, detail] of Object.entries(detailMap ?? {})) {
                        if (!detail?.name) continue;
                        this.#hrid2name[hrid] = detail.name;
                        if (hrid.startsWith('/items/')) this.#name2hrid[detail.name] = hrid;
                    }
                });
            }
    
            hrid2name(hrid) {
                if (!hrid) return hrid;
                return this.#hrid2name[hrid] || hrid.split('/').pop().replaceAll('_', ' ');
            }
    
            name2ItemHrid(itemName) {
                if (!itemName) return itemName;
                return this.#name2hrid[itemName] || `/items/${itemName.toLowerCase().split(' ').join('_')}`;
            }
        };
    
        const CharacterData = new class {
            playerId = null;
            playerName = null;
    
            constructor() {
                MessageHandler.addListener('init_character_data', msg => { this.onInitCharacterData(msg); }, -100);
            }
    
            onInitCharacterData(msg) {
                this.playerId = msg.character?.id ?? null;
                this.playerName = msg.character?.name ?? null;
            }
        };
    
        const GameTranslation = new class {
            itemNames = null;
            skillNames = null;
            abilityNames = null;
            loading = false;
    
            async loadItemNames(retryCount = 0) {
                if (language !== 'zh' || this.itemNames || this.loading) return;
                this.loading = true;
                try {
                    for (const url of this.findLoadedJsUrls()) {
                        const src = await fetch(url).then(res => res.ok ? res.text() : '');
                        if (!this.isLikelyChineseTranslationChunk(src)) continue;
    
                        const itemNames = this.extractNamedStringMap(src, 'itemNames');
                        if (!itemNames || Object.keys(itemNames).length === 0) continue;
    
                        const skillNames = this.extractNamedStringMap(src, 'skillNames') ?? {};
                        const abilityNames = this.extractNamedStringMap(src, 'abilityNames') ?? {};
    
                        this.itemNames = itemNames;
                        this.skillNames = skillNames;
                        this.abilityNames = abilityNames;
    
                        out('中文物品字典加载完成 (itemNames)', {
                            url,
                            count: Object.keys(itemNames).length,
                            skillCount: Object.keys(skillNames).length,
                            abilityCount: Object.keys(abilityNames).length
                        });
                        document.dispatchEvent(new CustomEvent('lll-single-translation-updated'));
                        return;
                    }
                } catch (error) {
                    err('中文物品字典加载失败:', error);
                } finally {
                    this.loading = false;
                }
    
                if (!this.itemNames && retryCount < 5) {
                    setTimeout(() => { this.loadItemNames(retryCount + 1); }, 500);
                }
            }
    
            findLoadedJsUrls() {
                return [...new Set(
                    performance.getEntriesByType('resource')
                        .map(entry => entry.name)
                        .filter(url => url.includes('/static/js/') && url.split('?')[0].endsWith('.js'))
                )];
            }
    
            isLikelyChineseTranslationChunk(src) {
                if (!src.includes('itemNames')) return false;
                return src.includes('\\u78c1') || src.includes('磁') || /[\u4e00-\u9fff]/.test(src);
            }
    
            extractNamedStringMap(src, name) {
                const objectText = this.extractNamedObjectText(src, name);
                if (!objectText) return null;
                try {
                    const parsed = JSON.parse(objectText);
                    return parsed && typeof parsed === 'object' ? parsed : null;
                } catch (_) {
                    return this.parseStringMap(objectText);
                }
            }
    
            extractNamedObjectText(src, name) {
                const pattern = new RegExp(`["']?${name}["']?\\s*:\\s*\\{`);
                const match = pattern.exec(src);
                if (!match) return null;
                const braceStart = src.indexOf('{', match.index);
                let depth = 0;
                let quote = null;
                for (let i = braceStart; i < src.length; i++) {
                    const ch = src[i];
                    if (quote) {
                        if (ch === '\\') {
                            i++;
                        } else if (ch === quote) {
                            quote = null;
                        }
                        continue;
                    }
                    if (ch === '"' || ch === "'") {
                        quote = ch;
                        continue;
                    }
                    if (ch === '{') depth++;
                    if (ch === '}') {
                        depth--;
                        if (depth === 0) return src.slice(braceStart, i + 1);
                    }
                }
                return null;
            }
    
            parseStringMap(objectText) {
                const ret = {};
                const pairRegex = /"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
                let match;
                while ((match = pairRegex.exec(objectText)) !== null) {
                    try {
                        const key = JSON.parse(`"${match[1]}"`);
                        const value = JSON.parse(`"${match[2]}"`);
                        ret[key] = value;
                    } catch (_) { }
                }
                return ret;
            }
    
            hridToItemName(hrid) {
                if (language !== 'zh') return null;
                return this.itemNames?.[hrid] ?? null;
            }
    
            hridToSkillName(hrid) {
                if (language !== 'zh') return null;
                return this.skillNames?.[hrid] ?? null;
            }
    
            hridToAbilityName(hrid) {
                if (language !== 'zh') return null;
                return this.abilityNames?.[hrid] ?? null;
            }
        };
    
        const Localizer = new class {
            hridToName(hrid) {
                return GameTranslation.hridToItemName(hrid)
                    || GameTranslation.hridToSkillName(hrid)
                    || GameTranslation.hridToAbilityName(hrid)
                    || ClientData.hrid2name(hrid)
                    || hrid
                    || UiLocale.unknown[language];
            }
        };
    
        const Market = new class {
            storageDataName = 'marketData';
            apiAddr = 'https://www.milkywayidle.com/game_data/marketplace.json';
            marketData = null;
            specialItemPrices = { '/items/coin': { ask: 1, bid: 1 } };
            ready = false;
    
            constructor() {
                MessageHandler.addListener('init_client_data', msg => { this.onInitClientData(msg); }, -90);
            }
    
            onInitClientData(_) {
                this.marketData = LocalStorageData.get(this.storageDataName);
                const updateInterval = Config.market.autoUpdateInterval * 3600;
                if (this.marketData?.time > Date.now() / 1000 - updateInterval) {
                    this.initMarketData();
                    return;
                }
                this.update();
            }
    
            update(afterUpdated = null) {
                out(`fetching market data from ${this.apiAddr}`);
                fetch(this.apiAddr)
                    .then(res => res.json())
                    .then(data => {
                        this.marketData = this.formatMarketData(data);
                        LocalStorageData.set(this.storageDataName, this.marketData);
                        this.initMarketData();
                        afterUpdated?.();
                    })
                    .catch(error => {
                        err('fetch market data failed:', error);
                        if (this.marketData) this.initMarketData();
                    });
            }
    
            formatMarketData(raw) {
                if (raw.market?.hasOwnProperty('Coin')) {
                    const data = { market: {}, vendor: {}, time: raw.time };
                    for (const [itemName, price] of Object.entries(raw.market)) {
                        const itemHrid = ClientData.name2ItemHrid(itemName);
                        (data.market[itemHrid] ??= {})[0] = { ask: price.ask, bid: price.bid };
                    }
                    return data;
                }
                if (raw.marketData) {
                    const data = { market: {}, vendor: {}, time: raw.timestamp };
                    for (const [itemHrid, prices] of Object.entries(raw.marketData)) {
                        for (const [level, price] of Object.entries(prices)) {
                            (data.market[itemHrid] ??= {})[level] = { ask: price.a, bid: price.b };
                        }
                    }
                    return data;
                }
                throw new Error('unknown market data format');
            }
    
            initMarketData() {
                this.marketData ??= { market: {}, vendor: {}, time: 0 };
                this.marketData.market ??= {};
                this.marketData.vendor ??= {};
                this.#initVendorPrice();
                this.#initSpecialItemPrices();
                this.ready = true;
                document.dispatchEvent(new CustomEvent('lll-single-market-updated'));
                out('市场信息 (marketData)', this.marketData);
            }
    
            #initVendorPrice() {
                const itemDetails = ClientData.get().itemDetailMap ?? {};
                for (const [hrid, detail] of Object.entries(itemDetails)) {
                    this.marketData.vendor[hrid] = detail.sellPrice ?? 0;
                }
            }
    
            #initSpecialItemPrices() {
                const computeNonTradable = Config.market.computeNonTradable;
                this.specialItemPrices = {
                    '/items/coin': { ask: 1, bid: 1 },
                    '/items/cowbell': {
                        ask: (this.getPriceFromAPI('/items/bag_of_10_cowbells', 'ask') ?? 0) / 10,
                        bid: computeNonTradable ? (this.getPriceFromAPI('/items/bag_of_10_cowbells', 'bid') ?? 0) / 10 : 0,
                    },
                };
                [
                    '/items/chimerical_quiver',
                    '/items/sinister_cape',
                    '/items/enchanted_cloak',
                    '/items/gatherer_cape',
                    '/items/artificer_cape',
                    '/items/culinary_cape',
                    '/items/chance_cape',
                ].forEach(hrid => {
                    this.specialItemPrices[hrid] = {
                        ask: this.getPriceFromAPI('/items/mirror_of_protection', 'ask') ?? 0,
                        bid: computeNonTradable ? this.getPriceFromAPI('/items/mirror_of_protection', 'bid') ?? 0 : 0,
                    };
                });
                for (const [itemHrid, price] of Object.entries(this.specialItemPrices)) {
                    (this.marketData.market[itemHrid] ??= {})[0] = price;
                }
            }
    
            getPriceFromAPI(itemHrid, priceType = 'bid', enhanceLevel = 0, computeNetProfit = null) {
                if (priceType === 'vendor') return this.marketData?.vendor?.[itemHrid] ?? 0;
                const itemPrice = this.marketData?.market?.[itemHrid]?.[enhanceLevel]?.[priceType];
                const netProfit = computeNetProfit ?? Config.market.computeNetProfit;
                if (typeof itemPrice === 'number' && itemPrice !== -1) {
                    if (netProfit && priceType === 'bid') {
                        if (itemHrid === '/items/bag_of_10_cowbells') return Math.floor(itemPrice * 0.82);
                        return Math.floor(itemPrice * 0.98);
                    }
                    return itemPrice;
                }
                return null;
            }
    
            getPriceByHrid(itemHrid, priceType = 'bid', enhanceLevel = 0, computeNetProfit = null) {
                if (!this.marketData?.market) return null;
                if (this.specialItemPrices[itemHrid]) return this.specialItemPrices[itemHrid][priceType] ?? 0;
                const marketPrice = this.getPriceFromAPI(itemHrid, priceType, enhanceLevel, computeNetProfit);
                if (marketPrice) return marketPrice;
                if (priceType === 'ask') {
                    const bid = this.getPriceByHrid(itemHrid, 'bid', enhanceLevel, false);
                    return bid ? Math.ceil(bid / 0.98) : null;
                }
                const vendorPrice = this.marketData.vendor?.[itemHrid];
                if (typeof vendorPrice === 'number' && vendorPrice > 0) return vendorPrice * 3;
                return null;
            }
        };
    
        const BattleData = new class {
            currentMapHrid = null;
            inBattle = false;
            startTime = 0;
            duration = 0;
            runCount = 0;
            playerList = [];
            playerStat = {};
            playerLoot = {};
            playerConsumables = {};
            playerAbilities = {};
    
            constructor() {
                MessageHandler.addListener('init_character_data', msg => { this.onInitCharacterData(msg); });
                MessageHandler.addListener('action_completed', msg => { this.onActionCompleted(msg); });
                MessageHandler.addListener('new_battle', msg => { this.onNewBattle(msg); }, -100);
            }
    
            onInitCharacterData(msg) {
                this.setCurrentAction(msg.characterActions?.[0]);
            }
    
            onActionCompleted(msg) {
                this.setCurrentAction(msg.endCharacterAction);
            }
    
            setCurrentAction(action) {
                const previousActionHrid = this.currentMapHrid;
                const previousInBattle = this.inBattle;
                const actionHrid = action?.actionHrid;
                this.currentMapHrid = actionHrid ?? this.currentMapHrid;
                this.inBattle = !!actionHrid?.startsWith('/actions/combat/');
                if (previousActionHrid !== this.currentMapHrid || previousInBattle !== this.inBattle) {
                    document.dispatchEvent(new CustomEvent('lll-single-action-updated'));
                }
            }
    
            onNewBattle(msg) {
                const previousInBattle = this.inBattle;
                this.inBattle = true;
                const start = new Date(msg.combatStartTime).getTime() / 1000;
                this.startTime = Number.isFinite(start) ? start : Date.now() / 1000;
                this.duration = this.elapsedSeconds();
                this.runCount = Number(msg.battleId) || 1;
                this.playerList = (msg.players ?? []).map(player => player.character?.name).filter(Boolean).slice(0, 5);
                this.playerStat = {};
                this.playerLoot = {};
                this.playerConsumables = {};
                this.playerAbilities = {};
    
                for (const player of msg.players ?? []) {
                    const playerName = player.character?.name;
                    if (!playerName) continue;
                    this.playerStat[playerName] = {
                        skillExp: { ...(player.totalSkillExperienceMap ?? {}) },
                        deathCount: player.deathCount || 0,
                    };
                    this.playerLoot[playerName] = {
                        items: Object.values(player.totalLootMap ?? {}).map(loot => ({
                            hrid: loot.itemHrid,
                            count: loot.count,
                        })),
                    };
                    this.playerConsumables[playerName] = {
                        slots: this.normalizeConsumableSlots(player.combatConsumables),
                    };
                    this.playerAbilities[playerName] = {
                        slots: this.normalizeAbilitySlots(player.combatAbilities),
                    };
                }
                if (!previousInBattle) {
                    document.dispatchEvent(new CustomEvent('lll-single-action-updated'));
                }
                document.dispatchEvent(new CustomEvent('lll-single-battle-updated'));
            }
    
            normalizeConsumableSlots(rawConsumables) {
                const slots = Array.from({ length: App.combatConsumables.slotCount }, () => null);
                if (!Array.isArray(rawConsumables)) return slots;
                rawConsumables.slice(0, App.combatConsumables.slotCount).forEach((consumable, index) => {
                    if (!consumable?.itemHrid) return;
                    slots[index] = {
                        hrid: consumable.itemHrid,
                        count: Number(consumable.count) || 0,
                        enhancementLevel: Number(consumable.enhancementLevel) || 0,
                        availableTime: consumable.availableTime || null,
                        itemHash: consumable.itemHash || '',
                    };
                });
                return slots;
            }
    
            normalizeAbilitySlots(rawAbilities) {
                const slots = Array.from({ length: App.combatAbilities.slotCount }, () => null);
                if (!Array.isArray(rawAbilities)) return slots;
                rawAbilities.slice(0, App.combatAbilities.slotCount).forEach((ability, index) => {
                    if (!ability?.abilityHrid) return;
                    slots[index] = {
                        hrid: ability.abilityHrid,
                        level: Number(ability.level) || 0,
                        experience: Number(ability.experience) || 0,
                        availableTime: ability.availableTime || null,
                    };
                });
                return slots;
            }
    
            elapsedSeconds() {
                if (!this.startTime) return this.duration || 0;
                return Math.max(0, Date.now() / 1000 - this.startTime);
            }
    
            hasBattleData() {
                return this.playerList.length > 0;
            }
        };
    
        const SinglePageAnalyzer = new class {
            getSummary() {
                const duration = BattleData.elapsedSeconds();
                const completedRuns = Math.max(0, BattleData.runCount - 1);
                const eph = duration > 0 ? 3600 * completedRuns / duration : 0;
                const round = BattleData.runCount || 0;
                return { duration, completedRuns, eph, round };
            }
    
            getExperience(playerName) {
                const duration = BattleData.elapsedSeconds();
                const hours = duration > 0 ? duration / 3600 : 0;
                const skillExp = BattleData.playerStat[playerName]?.skillExp ?? {};
                const entries = Object.entries(skillExp)
                    .map(([hrid, exp]) => ({ hrid, exp: Number(exp) || 0 }))
                    .filter(entry => entry.exp > 0)
                    .sort((a, b) => b.exp - a.exp);
                const total = entries.reduce((sum, entry) => sum + entry.exp, 0);
                const top = entries[0] ?? null;
                const totalPerHour = hours > 0 ? total / hours : 0;
                const topPerHour = hours > 0 ? (top?.exp ?? 0) / hours : 0;
                return {
                    total: totalPerHour,
                    topName: top ? Localizer.hridToName(top.hrid) : UiLocale.none[language],
                    topExp: topPerHour,
                    hasTop: !!top,
                };
            }
    
            getLoot(playerName, thresholdK, filterEnabled) {
                const threshold = Math.max(0, Number(thresholdK) || 0) * 1000;
                return (BattleData.playerLoot[playerName]?.items ?? [])
                    .map(item => {
                        const unitPrice = Market.getPriceByHrid(item.hrid) ?? 0;
                        const isAboveThreshold = unitPrice >= threshold;
                        return {
                            hrid: item.hrid,
                            count: item.count,
                            unitPrice,
                            totalPrice: unitPrice * item.count,
                            isAboveThreshold,
                        };
                    })
                    .filter(item => !filterEnabled || item.isAboveThreshold || item.hrid.includes('_chest'))
                    .sort((a, b) => (b.unitPrice - a.unitPrice) || (b.totalPrice - a.totalPrice));
            }
    
            getConsumables(playerName) {
                const rawSlots = BattleData.playerConsumables[playerName]?.slots ?? [];
                return Array.from({ length: App.combatConsumables.slotCount }, (_, index) => {
                    const item = rawSlots[index];
                    if (!item) return null;
                    const isFoodSlot = index < App.combatConsumables.foodSlotCount;
                    const lowThreshold = isFoodSlot
                        ? App.combatConsumables.foodLowThreshold
                        : App.combatConsumables.drinkLowThreshold;
                    const highThreshold = lowThreshold * App.combatConsumables.stockHighMultiplier;
                    const count = Number(item.count) || 0;
                    const stockState = count < lowThreshold
                        ? 'low'
                        : count >= highThreshold
                            ? 'high'
                            : 'warn';
                    return {
                        ...item,
                        count,
                        slotIndex: index,
                        slotType: isFoodSlot ? 'food' : 'drink',
                        lowThreshold,
                        highThreshold,
                        stockState,
                    };
                });
            }
    
            getAbilities(playerName) {
                const rawSlots = BattleData.playerAbilities[playerName]?.slots ?? [];
                return Array.from({ length: App.combatAbilities.slotCount }, (_, index) => {
                    const ability = rawSlots[index];
                    if (!ability) return null;
                    return {
                        ...ability,
                        slotIndex: index,
                    };
                });
            }
    
            getPlayers(thresholdK, filterEnabled) {
                return BattleData.playerList.map(playerName => ({
                    name: playerName,
                    experience: this.getExperience(playerName),
                    deathCount: BattleData.playerStat[playerName]?.deathCount ?? 0,
                    consumables: this.getConsumables(playerName),
                    abilities: this.getAbilities(playerName),
                    loot: this.getLoot(playerName, thresholdK, filterEnabled),
                }));
            }
        };
    
        class SinglePagePopup {
            root = null;
            body = null;
            roundText = null;
            ephText = null;
            durationText = null;
            dropdown = null;
            outsidePointerHandler = null;
            escKeyHandler = null;
            collapsed = false;
            popupPosition = null;
            headerDrag = null;
            suppressHeaderClickUntil = 0;
            lootHighlightHrid = null;
            lootHighlightSource = null;
            lootHighlightMode = null;
            lootHighlightPointerX = null;
            lootHighlightPointerY = null;
            lootHighlightClearTimer = null;
    
            isMobileHorizontalMode() {
                return Utils.isMobileViewport() && Config.ui.mobileHorizontalLayout;
            }
    
            syncPopupModeClass() {
                if (!this.root) return;
                this.root.classList.toggle('lll_mobile-horizontal', this.isMobileHorizontalMode());
                this.root.classList.toggle('lll_mobile-vertical', Utils.isMobileViewport() && !Config.ui.mobileHorizontalLayout);
            }
    
            constrainPopupPosition(left, top) {
                const viewport = window.visualViewport;
                const viewportWidth = viewport?.width ?? window.innerWidth;
                const viewportHeight = viewport?.height ?? window.innerHeight;
                const margin = 1;
                const rect = this.root.getBoundingClientRect();
                const maxLeft = Math.max(margin, viewportWidth - rect.width - margin);
                const headerHeight = this.root.querySelector('.lll_single_header')?.getBoundingClientRect().height ?? 32;
                const minVisibleHeight = Math.min(rect.height, headerHeight + margin);
                const maxTop = Math.max(margin, viewportHeight - minVisibleHeight);
                return {
                    left: Math.round(Utils.clamp(left, margin, maxLeft)),
                    top: Math.round(Utils.clamp(top, margin, maxTop)),
                };
            }
    
            applyPopupPosition(left, top) {
                if (!this.root) return;
                const position = this.constrainPopupPosition(left, top);
                this.popupPosition = position;
                this.root.style.left = `${position.left}px`;
                this.root.style.top = `${position.top}px`;
                this.root.style.transform = 'none';
                this.root.style.setProperty('--lll-popup-top-space', `${position.top}px`);
            }
    
            syncPopupPosition() {
                if (!this.root || !this.popupPosition) return;
                this.applyPopupPosition(this.popupPosition.left, this.popupPosition.top);
            }
    
            isHeaderDragIgnored(target) {
                return !!target?.closest?.('.lll_single_gearBtn, .lll_single_settingsDropdown, input, button, select, textarea, a, label');
            }
    
            startHeaderDrag(header, event) {
                if (!this.root || this.isHeaderDragIgnored(event.target)) return;
                if (event.isPrimary === false || event.button !== 0) return;
                const rect = this.root.getBoundingClientRect();
                this.headerDrag = {
                    header,
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startLeft: rect.left,
                    startTop: rect.top,
                    dragged: false,
                };
                try { header.setPointerCapture?.(event.pointerId); } catch (_) { /* ignore capture failures */ }
            }
    
            moveHeaderDrag(event) {
                const drag = this.headerDrag;
                if (!drag || drag.pointerId !== event.pointerId || !this.root) return;
    
                const dx = event.clientX - drag.startX;
                const dy = event.clientY - drag.startY;
                if (!drag.dragged) {
                    if (Math.hypot(dx, dy) < 4) return;
                    drag.dragged = true;
                    this.root.classList.add('lll_dragging');
                    this.closeSettingsDropdown();
                    Tooltip.hide(true);
                    this.clearLootHighlight(true);
                }
    
                event.preventDefault();
                this.applyPopupPosition(drag.startLeft + dx, drag.startTop + dy);
            }
    
            finishHeaderDrag(event) {
                const drag = this.headerDrag;
                if (!drag || drag.pointerId !== event.pointerId) return;
    
                if (drag.dragged) {
                    event.preventDefault?.();
                    event.stopImmediatePropagation?.();
                    this.suppressHeaderClickUntil = Date.now() + 350;
                }
    
                this.root?.classList.remove('lll_dragging');
                try {
                    if (drag.header.hasPointerCapture?.(drag.pointerId)) {
                        drag.header.releasePointerCapture(drag.pointerId);
                    }
                } catch (_) { /* ignore capture failures */ }
                this.headerDrag = null;
            }
    
            suppressHeaderClick(event) {
                if (Date.now() >= this.suppressHeaderClickUntil) return false;
                event.preventDefault();
                event.stopImmediatePropagation();
                return true;
            }
    
            clearLootHighlight(immediate = true) {
                if (this.lootHighlightClearTimer) {
                    clearTimeout(this.lootHighlightClearTimer);
                    this.lootHighlightClearTimer = null;
                }
                this.lootHighlightHrid = null;
                this.lootHighlightSource = null;
                this.lootHighlightMode = null;
                if (immediate) {
                    this.syncLootHighlight();
                    return;
                }
                this.syncLootHighlight();
            }
    
            scheduleLootHighlightClear(delay = 80) {
                if (this.lootHighlightClearTimer) clearTimeout(this.lootHighlightClearTimer);
                this.lootHighlightClearTimer = setTimeout(() => {
                    this.lootHighlightClearTimer = null;
                    this.clearLootHighlight(true);
                }, delay);
            }
    
            setLootHighlight(hrid, source = null, mode = 'hover') {
                if (!hrid) {
                    this.clearLootHighlight(true);
                    return;
                }
                if (this.lootHighlightClearTimer) {
                    clearTimeout(this.lootHighlightClearTimer);
                    this.lootHighlightClearTimer = null;
                }
                this.lootHighlightHrid = hrid;
                this.lootHighlightSource = source;
                this.lootHighlightMode = mode;
                this.syncLootHighlight();
            }
    
            toggleLootHighlight(hrid, source = null) {
                if (!hrid) return;
                if (this.lootHighlightHrid === hrid && this.lootHighlightSource === source) {
                    this.clearLootHighlight(true);
                    return;
                }
                this.setLootHighlight(hrid, source, 'touch');
            }
    
            trackLootPointer(event) {
                if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
                if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
                this.lootHighlightPointerX = event.clientX;
                this.lootHighlightPointerY = event.clientY;
            }
    
            restoreHoverLootHighlight() {
                if (this.lootHighlightMode !== 'hover' || !this.lootHighlightHrid) return;
                const x = this.lootHighlightPointerX;
                const y = this.lootHighlightPointerY;
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                const hovered = document.elementFromPoint(x, y)?.closest?.('.lll_single_item[data-loot-hrid]');
                if (hovered && hovered.dataset.lootHrid === this.lootHighlightHrid) {
                    this.setLootHighlight(this.lootHighlightHrid, hovered, 'hover');
                }
            }
    
            syncLootHighlight() {
                if (!this.root) return;
                const activeHrid = this.lootHighlightHrid;
                const rows = [...this.root.querySelectorAll('.lll_single_item[data-loot-hrid]')];
                let matchedCount = 0;
                let sourceApplied = false;
                const sourceInRoot = !!this.lootHighlightSource && this.root.contains(this.lootHighlightSource);
    
                rows.forEach(row => {
                    row.classList.remove('lll_lootHighlight', 'lll_lootHighlightSource');
                    if (activeHrid && row.dataset.lootHrid === activeHrid) {
                        matchedCount += 1;
                        row.classList.add('lll_lootHighlight');
                        if (!sourceApplied && (row === this.lootHighlightSource || !sourceInRoot)) {
                            row.classList.add('lll_lootHighlightSource');
                            sourceApplied = true;
                        }
                    }
                });
    
                if (activeHrid && matchedCount > 0 && !sourceApplied) {
                    const sourceRow = rows.find(row => row.dataset.lootHrid === activeHrid);
                    if (sourceRow) sourceRow.classList.add('lll_lootHighlightSource');
                }
    
                if (activeHrid && matchedCount === 0) {
                    this.clearLootHighlight(true);
                }
            }
    
            setCollapsed(collapsed) {
                const wasCollapsed = this.collapsed;
                this.collapsed = collapsed;
                if (collapsed) {
                    this.closeSettingsDropdown();
                    Tooltip.hide(true);
                    this.clearLootHighlight(true);
                }
                if (!this.root) return;
                this.syncPopupModeClass();
                this.body.style.display = collapsed ? 'none' : '';
                this.root.classList.toggle('lll_collapsed', collapsed);
                this.root.classList.toggle('lll_mobile-expanded', !collapsed && Utils.isMobileViewport());
                this.syncPopupPosition();
                if (wasCollapsed && !collapsed) this.render();
            }
    
            toggleCollapsed() {
                this.setCollapsed(!this.collapsed);
            }
    
            resetExpanded() {
                this.setCollapsed(false);
            }
    
            open() {
                if (this.root) {
                    this.render();
                    return;
                }
                this.construct();
                const mountPoint = document.body || document.documentElement;
                if (!mountPoint) return;
                mountPoint.appendChild(this.root);
                this.render();
                this.setCollapsed(Utils.isMobileViewport() ? true : this.collapsed);
            }
    
            close() {
                if (!this.root) return;
                this.closeSettingsDropdown();
                Tooltip.hide(true);
                this.clearLootHighlight(true);
                this.root.remove();
                this.root = null;
                this.headerDrag = null;
                if (this.outsidePointerHandler) {
                    document.removeEventListener('mousedown', this.outsidePointerHandler, true);
                    document.removeEventListener('touchstart', this.outsidePointerHandler, true);
                    this.outsidePointerHandler = null;
                }
                if (this.escKeyHandler) {
                    document.removeEventListener('keydown', this.escKeyHandler, true);
                    this.escKeyHandler = null;
                }
            }
    
            toggleSettingsDropdown() {
                if (this.dropdown) {
                    this.closeSettingsDropdown();
                } else {
                    if (this.collapsed && !Utils.isMobileViewport()) {
                        this.setCollapsed(false);
                    }
                    this.openSettingsDropdown();
                }
            }
    
            closeSettingsDropdown() {
                if (!this.dropdown) return;
                this.dropdown.remove();
                this.dropdown = null;
            }
    
            openSettingsDropdown() {
                if (this.dropdown) return;
    
                const filterToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.filterEnabled,
                });
                const thresholdInput = Ui.elem('input', {
                    className: 'lll_single_input',
                    type: 'number',
                    min: '0',
                    step: '1',
                    value: String(Config.ui.minUnitPriceK),
                });
    
                filterToggle.addEventListener('change', () => {
                    Config.ui.filterEnabled = filterToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                thresholdInput.addEventListener('mousedown', event => { event.stopPropagation(); });
                thresholdInput.addEventListener('touchstart', event => { event.stopPropagation(); });
                thresholdInput.addEventListener('input', () => {
                    const value = Math.round(Number(thresholdInput.value));
                    Config.ui.minUnitPriceK = Number.isFinite(value) ? Utils.clamp(value, 0, 100000000) : 0;
                    ConfigManager.saveConfig();
                    this.render();
                });
                thresholdInput.addEventListener('change', () => {
                    thresholdInput.value = String(Config.ui.minUnitPriceK);
                });
    
                const placeholderToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.placeholderEnabled,
                });
                placeholderToggle.addEventListener('change', () => {
                    Config.ui.placeholderEnabled = placeholderToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                const expToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.showExp,
                });
                expToggle.addEventListener('change', () => {
                    Config.ui.showExp = expToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                const deathsToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.showDeaths,
                });
                deathsToggle.addEventListener('change', () => {
                    Config.ui.showDeaths = deathsToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                const consumablesToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.showConsumables,
                });
                consumablesToggle.addEventListener('change', () => {
                    Config.ui.showConsumables = consumablesToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                const abilitiesToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.showAbilities,
                });
                abilitiesToggle.addEventListener('change', () => {
                    Config.ui.showAbilities = abilitiesToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                const mobileHorizontalToggle = Ui.elem('input', {
                    className: 'lll_single_toggleInput',
                    type: 'checkbox',
                    checked: Config.ui.mobileHorizontalLayout,
                });
                mobileHorizontalToggle.addEventListener('change', () => {
                    Config.ui.mobileHorizontalLayout = mobileHorizontalToggle.checked;
                    ConfigManager.saveConfig();
                    this.render();
                });
    
                const makeToggleRow = (label, input) => {
                    return Ui.div('lll_single_dropdownRow', [
                        Ui.div('lll_single_dropdownLabel', label),
                        Ui.elem('label', 'lll_single_toggle', [
                            input,
                            Ui.div('lll_single_toggleTrack'),
                        ]),
                    ]);
                };
    
                this.dropdown = Ui.div('lll_single_settingsDropdown', [
                    makeToggleRow(UiLocale.optFilter[language], filterToggle),
                    Ui.div('lll_single_dropdownRow', [
                        Ui.div('lll_single_dropdownLabel', UiLocale.optThreshold[language]),
                        Ui.div('lll_single_metric', [
                            thresholdInput,
                            Ui.elem('div', { textContent: ' K', style: 'margin-left: 4px; color: var(--lll-text-soft); font-weight: bold;' })
                        ]),
                    ]),
                    makeToggleRow(UiLocale.optPlaceholder[language], placeholderToggle),
                    makeToggleRow(UiLocale.optShowExp[language], expToggle),
                    makeToggleRow(UiLocale.optShowDeaths[language], deathsToggle),
                    makeToggleRow(UiLocale.optShowConsumables[language], consumablesToggle),
                    makeToggleRow(UiLocale.optShowAbilities[language], abilitiesToggle),
                    makeToggleRow(UiLocale.optMobileHorizontal[language], mobileHorizontalToggle),
                ]);
    
                // 阻止点击事件穿透，从而防止折叠面板
                this.dropdown.addEventListener('mousedown', event => { event.stopPropagation(); });
                this.dropdown.addEventListener('touchstart', event => { event.stopPropagation(); });
    
                this.root.appendChild(this.dropdown);
            }
    
            construct() {
                this.roundText = Ui.div('lll_single_metricValue', '0');
                this.ephText = Ui.div('lll_single_metricValue', '0.0');
                this.durationText = Ui.div('lll_single_metricValue', '0m 00s');
    
                const gearBtn = Ui.div('lll_single_gearBtn', '⚙️');
                Tooltip.attach(gearBtn, () => UiLocale.settings[language], {
                    hover: true,
                    touch: false,
                    focus: true,
                    focusable: true,
                    stopPropagation: false,
                });
                gearBtn.setAttribute('role', 'button');
                gearBtn.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleSettingsDropdown();
                });
                gearBtn.onclick = event => {
                    event.stopPropagation();
                    this.toggleSettingsDropdown();
                };
    
                this.body = Ui.div('lll_single_body');
                
                const headerLeft = Ui.div('lll_single_headerLeft', [
                    Ui.div('lll_single_summaryCompact', [
                        Ui.div('lll_single_metricCompact', [Ui.div('lll_single_metricLabel', UiLocale.title[language]), this.roundText]),
                        Ui.div('lll_single_metricCompact', [Ui.div('lll_single_metricLabel', UiLocale.eph[language]), this.ephText]),
                        Ui.div('lll_single_metricCompact', [Ui.div('lll_single_metricLabel', UiLocale.duration[language]), this.durationText]),
                    ]),
                ]);
    
                this.topLootContainer = Ui.div('lll_single_topLoot');
    
                const header = Ui.div('lll_single_header', [
                    headerLeft,
                    this.topLootContainer,
                    Ui.div('lll_single_headerRight', [
                        gearBtn,
                    ]),
                ]);
    
                header.onclick = event => {
                    if (this.suppressHeaderClick(event)) return;
                    if (event.target.closest('.lll_single_gearBtn')) return;
                    if (event.target.closest('.lll_single_topLoot')) return;
                    this.toggleCollapsed();
                };
                header.addEventListener('click', event => { this.suppressHeaderClick(event); }, true);
                header.addEventListener('pointerdown', event => { this.startHeaderDrag(header, event); }, true);
                header.addEventListener('pointermove', event => { this.moveHeaderDrag(event); }, true);
                header.addEventListener('pointerup', event => { this.finishHeaderDrag(event); }, true);
                header.addEventListener('pointercancel', event => { this.finishHeaderDrag(event); }, true);
    
                this.root = Ui.div('lll_single_popup', [header, this.body]);
    
                this.outsidePointerHandler = event => {
                    if (!this.root || this.root.contains(event.target)) {
                        if (this.dropdown && !this.dropdown.contains(event.target) && !event.target.closest('.lll_single_gearBtn')) {
                            this.closeSettingsDropdown();
                        }
                        return;
                    }
                    this.clearLootHighlight(true);
                    this.setCollapsed(true);
                };
    
                this.escKeyHandler = event => {
                    if (event.key === 'Escape') {
                        if (this.dropdown) {
                            this.closeSettingsDropdown();
                        } else {
                            this.setCollapsed(true);
                        }
                    }
                };
    
                document.addEventListener('mousedown', this.outsidePointerHandler, true);
                document.addEventListener('touchstart', this.outsidePointerHandler, true);
                document.addEventListener('keydown', this.escKeyHandler, true);
            }
    
            applyPlayerLayout(playerCount) {
                const layout = App.ui.layout;
                const isMobile = Utils.isMobileViewport();
                const useMobileHorizontal = isMobile && Config.ui.mobileHorizontalLayout;
                const columns = isMobile
                    ? (useMobileHorizontal ? Utils.clamp(playerCount || 1, 1, 5) : 1)
                    : Utils.clamp(playerCount || 1, 1, 5);
                const playerGap = useMobileHorizontal ? layout.mobileHorizontalPlayerGap : layout.playerGap;
                const bodyHorizontalPadding = isMobile ? layout.mobileBodyHorizontalPadding : layout.bodyHorizontalPadding;
                const totalGapWidth = (columns - 1) * playerGap;
                const gridContentWidth = columns * layout.playerPreferredWidth + totalGapWidth;
                const popupContentWidth = gridContentWidth + bodyHorizontalPadding + layout.popupBorderWidth;
                const popupWidth = isMobile
                    ? Math.max(0, window.innerWidth - 2)
                    : Math.max(
                        layout.singlePlayerMinWidth,
                        popupContentWidth
                    );
                const gridMinWidth = isMobile
                    ? (useMobileHorizontal ? columns * layout.playerMinWidth + totalGapWidth : 0)
                    : columns * layout.playerMinWidth + totalGapWidth;
    
                this.root.style.setProperty('--lll-popup-width', `${popupWidth}px`);
                this.root.style.setProperty('--lll-popup-collapsed-max-width', `${layout.collapsedMaxWidth}px`);
                this.root.style.setProperty('--lll-player-min-width', `${layout.playerMinWidth}px`);
                this.root.style.setProperty('--lll-player-gap', `${playerGap}px`);
    
                return {
                    columns,
                    gridMinWidth,
                    useMobileHorizontal,
                    gridContentWidth,
                    popupContentWidth,
                    popupWidth,
                };
            }
    
            resetBodyLayoutState() {
                if (!this.body) return;
                this.body.style.overflowX = '';
                this.body.style.overflowY = '';
                this.body.style.minHeight = '';
            }
    
            renderEmptyState(message) {
                this.applyPlayerLayout(1);
                this.syncPopupModeClass();
                this.resetBodyLayoutState();
                this.body.replaceChildren();
                this.topLootContainer?.replaceChildren();
                this.body.appendChild(Ui.div('lll_single_empty', message));
                if (Tooltip.target && !document.contains(Tooltip.target)) Tooltip.hide(true);
                this.clearLootHighlight(true);
                this.syncPopupPosition();
            }
    
            render() {
                if (!this.root) return;
                const summary = SinglePageAnalyzer.getSummary();
                this.roundText.textContent = `${summary.round}`;
                this.ephText.textContent = `${summary.eph.toFixed(1)}`;
                this.durationText.textContent = Utils.formatDuration(summary.duration);
                if (Tooltip.target && !document.contains(Tooltip.target)) Tooltip.hide(true);
                this.body.replaceChildren();
                this.topLootContainer.replaceChildren();
    
                if (!BattleData.hasBattleData()) {
                    this.renderEmptyState(BattleData.inBattle ? UiLocale.battleSyncing[language] : UiLocale.noBattle[language]);
                    return;
                }
    
                // 更新头部中间战利品 Top 3 徽标
                const meLoot = SinglePageAnalyzer.getLoot(CharacterData.playerName, Config.ui.minUnitPriceK, Config.ui.filterEnabled);
                if (meLoot && meLoot.length > 0) {
                    const top3 = meLoot.slice(0, 3);
    
                    top3.forEach(item => {
                        const badge = Ui.div('lll_single_topLootBadge', [
                            Ui.itemSvgIcon(item.hrid, 20, true),
                            Ui.div('lll_single_topLootCount', `${Utils.formatNumber(item.count)}`)
                        ]);
                        const itemName = Localizer.hridToName(item.hrid);
                        Tooltip.attach(badge, () => itemName, {
                            hover: true,
                            touch: true,
                        });
                        this.topLootContainer.appendChild(badge);
                    });
                }
    
                if (!Market.ready) {
                    this.body.appendChild(Ui.div('lll_single_status', UiLocale.marketLoading[language]));
                }
    
                const players = SinglePageAnalyzer.getPlayers(Config.ui.minUnitPriceK, Config.ui.filterEnabled);
                if (players.length === 0) {
                    this.renderEmptyState(BattleData.inBattle ? UiLocale.battleSyncing[language] : UiLocale.noBattle[language]);
                    return;
                }
    
                // --- 【新增：生成全局排序主列表】 ---
                const hridSet = new Set();
                players.forEach(p => {
                    p.loot.forEach(item => hridSet.add(item.hrid));
                });
                const masterHrids = Array.from(hridSet).sort((a, b) => {
                    const priceA = Market.getPriceByHrid(a) ?? 0;
                    const priceB = Market.getPriceByHrid(b) ?? 0;
                    return priceB - priceA; // 价格从高到低排序
                });
                // ----------------------------------
    
                const layoutInfo = this.applyPlayerLayout(players.length);
                this.syncPopupModeClass();
    
                const grid = Ui.div('lll_single_players');
                grid.style.setProperty('--lll-player-columns', layoutInfo.columns.toString());
                if (layoutInfo.useMobileHorizontal) {
                    grid.style.width = layoutInfo.columns === 1 ? '100%' : `${layoutInfo.gridContentWidth}px`;
                } else if (layoutInfo.gridMinWidth > 0) {
                    grid.style.minWidth = `${layoutInfo.gridMinWidth}px`;
                }
                players.forEach(player => { grid.appendChild(this.renderPlayer(player, masterHrids)); });
    
                if (layoutInfo.useMobileHorizontal) {
                    const viewport = Ui.div('lll_single_playersViewport', [grid]);
                    this.body.style.overflowX = 'hidden';
                    this.body.style.overflowY = 'auto';
                    viewport.style.overflow = 'hidden';
                    viewport.style.width = '100%';
                    viewport.style.display = 'block';
                    this.body.appendChild(viewport);
                    const bodyStyle = window.getComputedStyle(this.body);
                    const bodyPaddingX = (parseFloat(bodyStyle.paddingLeft) || 0) + (parseFloat(bodyStyle.paddingRight) || 0);
                    const measuredBodyWidth = this.body.clientWidth || this.root.clientWidth || window.innerWidth;
                    const availableWidth = Math.max(0, measuredBodyWidth - bodyPaddingX);
                    const scale = layoutInfo.columns === 1
                        ? 1
                        : layoutInfo.gridContentWidth > 0 && availableWidth > 0
                            ? Math.min(1, availableWidth / layoutInfo.gridContentWidth)
                            : 1;
                    grid.style.transformOrigin = 'top left';
                    grid.style.transform = scale < 1 ? `scale(${scale})` : 'none';
                    viewport.style.height = grid.scrollHeight > 0 ? `${Math.ceil(grid.scrollHeight * scale)}px` : '';
                } else {
                    this.body.style.overflowX = 'hidden';
                    this.body.style.overflowY = 'auto';
                    this.body.appendChild(grid);
                    grid.style.transform = 'none';
                    this.body.style.minHeight = '';
                }
                if (Tooltip.target && !document.contains(Tooltip.target)) Tooltip.hide(true);
                this.syncLootHighlight();
                this.restoreHoverLootHighlight();
                this.syncPopupPosition();
            }
    
            renderPlayer(player, masterHrids = []) {
                const exp = player.experience;
                const isMe = player.name === CharacterData.playerName;
    
                // 创建玩家头部的 div
                const headerDiv = Ui.div('lll_single_playerHeader', player.name);
                if (isMe) {
                    headerDiv.style.color = '#ffe066'; // 使用柔和且亮眼的黄金色，在游戏暗色背景下非常显眼
                    headerDiv.style.textShadow = '0 0 4px rgba(255, 224, 102, 0.4)'; // 附带微微的金色发光，增强辨识度
                }
    
                const topExpLabel = exp.hasTop
                    ? (language === 'zh' ? `${exp.topName}经验/h` : `${exp.topName} EXP/h`)
                    : UiLocale.topExp[language];
    
                const statsChildren = [];
                if (Config.ui.showExp) {
                    statsChildren.push(this.renderStat(topExpLabel, Utils.formatExp(exp.topExp)));
                    statsChildren.push(this.renderStat(UiLocale.totalExp[language], Utils.formatExp(exp.total)));
                }
                if (Config.ui.showDeaths) {
                    statsChildren.push(this.renderStat(UiLocale.deathCount[language], Utils.formatNumber(player.deathCount)));
                }
    
                const statsContainer = statsChildren.length > 0
                    ? Ui.div('lll_single_stats', statsChildren)
                    : null;
    
                const playerElements = [headerDiv];
                if (statsContainer) playerElements.push(statsContainer);
                if (Config.ui.showAbilities) playerElements.push(this.renderAbilityList(player.abilities));
                if (Config.ui.showConsumables) playerElements.push(this.renderConsumableList(player.consumables));
                playerElements.push(this.renderLootList(player.loot, masterHrids));
    
                return Ui.div('lll_single_player', playerElements);
            }
    
            renderStat(label, value) {
                return Ui.div('lll_single_stat', [
                    Ui.div('lll_single_statLabel', label),
                    Ui.div('lll_single_statValue', value),
                ]);
            }
    
            renderLabeledIconRow(label, bodyClass, children) {
                return Ui.div('lll_single_iconRow', [
                    Ui.div('lll_single_iconRowLabel', label),
                    Ui.div('lll_single_iconRowBody', [
                        Ui.div(bodyClass, children),
                    ]),
                ]);
            }
    
            renderConsumableList(consumables = []) {
                const slots = Array.from({ length: App.combatConsumables.slotCount }, (_, index) => consumables[index] ?? null);
                return this.renderLabeledIconRow(
                    UiLocale.consumableRowLabel[language],
                    'lll_single_consumableList',
                    slots.map(item => this.renderConsumableSlot(item)),
                );
            }
    
            renderConsumableSlot(item) {
                const classes = ['lll_single_consumableSlot'];
                if (!item) classes.push('lll_single_consumableSlotEmpty');
                switch (item?.stockState) {
                    case 'low':
                        classes.push('lll_single_consumableSlotLow');
                        break;
                    case 'warn':
                        classes.push('lll_single_consumableSlotWarn');
                        break;
                }
    
                const slot = Ui.div(classes.join(' '));
                if (!item) return slot;
    
                slot.appendChild(Ui.itemSvgIcon(item.hrid, 24, true));
                Tooltip.attach(slot, () => `${Localizer.hridToName(item.hrid)} x${Utils.formatNumber(item.count)}`, {
                    hover: true,
                    touch: true,
                });
                return slot;
            }
    
            renderAbilityList(abilities = []) {
                const slots = Array.from({ length: App.combatAbilities.slotCount }, (_, index) => abilities[index] ?? null);
                return this.renderLabeledIconRow(
                    UiLocale.abilityRowLabel[language],
                    'lll_single_abilityList',
                    slots.map(ability => this.renderAbilitySlot(ability)),
                );
            }
    
            renderAbilitySlot(ability) {
                const classes = ['lll_single_abilitySlot'];
                if (!ability) classes.push('lll_single_abilitySlotEmpty');
    
                const slot = Ui.div(classes.join(' '));
                if (!ability) return slot;
    
                slot.appendChild(Ui.abilitySvgIcon(ability.hrid, 24, true));
                Tooltip.attach(slot, () => `${Localizer.hridToName(ability.hrid)} Lv.${Utils.formatNumber(ability.level)}`, {
                    hover: true,
                    touch: true,
                });
                return slot;
            }
    
            renderLootList(loot, masterHrids = []) {
                const list = Ui.div('lll_single_lootList');
                if (loot.length === 0) {
                    list.appendChild(Ui.div('lll_single_empty', UiLocale.noLoot[language]));
                    return list;
                }
    
                // 将当前玩家掉落转为 Map，方便高效查找
                const lootMap = new Map(loot.map(item => [item.hrid, item]));
    
                if (Config.ui.placeholderEnabled) {
                    // 遍历全局主列表对齐渲染
                    masterHrids.forEach(hrid => {
                        const item = lootMap.get(hrid);
                        if (item) {
                            // 玩家有该物品，渲染正常卡片
                            list.appendChild(this.renderLootItem(item));
                        } else {
                            // 玩家没有该物品，渲染虚线占位框
                            list.appendChild(Ui.div('lll_single_itemPlaceholder'));
                        }
                    });
                } else {
                    // 不对齐，仅按原有高价格到低价格渲染玩家自己的掉落
                    loot.forEach(item => {
                        list.appendChild(this.renderLootItem(item));
                    });
                }
                return list;
            }
    
            renderLootItem(item) {
                const itemNameClasses = ['lll_single_itemName'];
                if (item.isAboveThreshold) itemNameClasses.push('lll_single_itemNameHighValue');
                const row = Ui.div('lll_single_item', [
                    Ui.div('lll_single_itemCount', Utils.formatNumber(item.count)),
                    Ui.itemSvgIcon(item.hrid, 20, true),
                    Ui.div(itemNameClasses.join(' '), Localizer.hridToName(item.hrid)),
                ]);
                row.dataset.lootHrid = item.hrid;
                Tooltip.attach(row, () => `${UiLocale.unitPriceLabel[language]}: ${Utils.formatPrice(item.unitPrice)}\n${UiLocale.totalPriceLabel[language]}: ${Utils.formatPrice(item.totalPrice)}`, {
                    hover: true,
                    touch: true,
                });
                if (Tooltip.isHoverCapable()) {
                    row.addEventListener('pointerenter', event => {
                        this.trackLootPointer(event);
                        this.setLootHighlight(item.hrid, row);
                    });
                    row.addEventListener('pointermove', event => {
                        this.trackLootPointer(event);
                    });
                    row.addEventListener('pointerleave', () => {
                        if (this.lootHighlightHrid === item.hrid) {
                            this.scheduleLootHighlightClear();
                        }
                    });
                } else {
                    row.addEventListener('click', event => {
                        event.stopPropagation();
                        this.toggleLootHighlight(item.hrid, row);
                    });
                }
                return row;
            }
        }
    
        const SinglePageController = new class {
            popup = new SinglePagePopup();
            viewportChangeHandler = null;
    
            syncVisibility() {
                if (BattleData.inBattle) {
                    this.popup.open();
                } else {
                    this.popup.close();
                }
            }
    
            constructor() {
                document.addEventListener('lll-single-battle-updated', () => {
                    this.syncVisibility();
                    if (this.popup.root) this.popup.render();
                });
                document.addEventListener('lll-single-market-updated', () => { if (this.popup.root) this.popup.render(); });
                document.addEventListener('lll-single-translation-updated', () => { if (this.popup.root) this.popup.render(); });
    
                document.addEventListener('lll-single-action-updated', () => {
                    if (Utils.isMobileViewport()) {
                        this.popup.setCollapsed(true);
                    } else {
                        this.popup.resetExpanded();
                    }
                    this.syncVisibility();
                });
    
                this.viewportChangeHandler = () => {
                    if (this.popup.root) this.popup.render();
                };
                window.addEventListener('resize', this.viewportChangeHandler, { passive: true });
                window.visualViewport?.addEventListener('resize', this.viewportChangeHandler, { passive: true });
    
                this.syncVisibility();
            }
    
        };
    
        const ScriptBootstrap = new class {
            start() {
                this.replayCachedClientData();
                GameTranslation.loadItemNames();
            }
    
            replayCachedClientData() {
                MessageHandler.handleMessageRecv(decompressData(localStorage.getItem('initClientData')));
            }
        };
    
        ScriptBootstrap.start();
    })();
  });

})();
