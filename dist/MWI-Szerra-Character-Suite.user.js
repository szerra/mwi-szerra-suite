// ==UserScript==
// @name         MWI Szerra 角色資訊包
// @namespace    https://github.com/szerra/mwi-szerra-suite
// @version      1.0.0
// @description  整合 Talent Market、裝備同步、角色名片與技能需求提示；可從 Tampermonkey 選單逐項開關。
// @author       Szerra integration; see THIRD_PARTY_NOTICES.md
// @license      CC-BY-NC-SA-4.0
// @icon         https://www.milkywayidle.com/favicon.svg
// @homepageURL  https://github.com/szerra/mwi-szerra-suite
// @supportURL   https://github.com/szerra/mwi-szerra-suite/issues
// @updateURL    https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Character-Suite.user.js
// @downloadURL  https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Character-Suite.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://test.milkywayidlecn.com/*
// @match        https://papiyas.chat/*
// @match        https://shykai.github.io/MWICombatSimulatorTest/*
// @match        https://amvoidguy.github.io/MWICombatSimulatorTest/*
// @match        https://milkonomy.pages.dev/*
// @match        https://hyhfish.github.io/milkonomy/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      papiyas.chat
// @connect      tupian.li
// @connect      www.milkywayidle.com
// @connect      www.milkywayidlecn.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @resource     cardStyles https://papiyas.chat/static/js/mwi-card-styles.css?v=1.5.2
// ==/UserScript==
(() => {
  "use strict";

  const __MWISzerraSuite = (() => {
    const packId = "character";
    const storageKey = `mwi.szerra.suite.${packId}.modules.v1`;
    const defaults = {
      "equipment-sync": true,
      "talent-market": true,
      "character-card": true,
      "skill-requirements": true
    };
    const menuItems = [
      { id: "equipment-sync", label: "裝備資料同步" },
      { id: "talent-market", label: "Talent Market" },
      { id: "character-card", label: "角色名片" },
      { id: "skill-requirements", label: "技能需求提示" }
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
  // Module: 裝備資料同步
  // Original: [银河奶牛]装备数据同步.user.js v1.2.7
  // Author: Sunrishe
  // License: MIT
  // Source: https://greasyfork.org/scripts/574037
  // WebSocket compatibility patches: 0
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("equipment-sync", "裝備資料同步", "body", () => {
    (function (sbxWin, window) {
        'use strict';
    
        // ==================== 配置 ====================
        const hostname = window.location.hostname;
        const domainname = hostname.substring(hostname.lastIndexOf('.', hostname.lastIndexOf('.') - 1) + 1);
        const CONFIG = {
            // WebSocket 事件名
            mwiWsSend: 'mwi-ws:send',
            mwiWsReceived: 'mwi-ws:message-received',
            // GM 存储键名
            mwiMilkonomyPreset: 'mwiMilkonomyPreset',
            // 游戏域名
            characterId: new URLSearchParams(window.location.search).get('characterId'),
            hostname,
            domainname,
            // 网站类型判断
            isGameSite: domainname === 'milkywayidle.com' || domainname === 'milkywayidlecn.com',
            isMilkonomySite: !(domainname === 'milkywayidle.com' || domainname === 'milkywayidlecn.com'),
            // LocalStorage Keys
            lsPresets: 'player-action-config-presets',
            // 组件样式
            milkonomy: {componentClass: 'mwi-ms-component'}
        };
    
        // ==================== 工具函数 ====================
        const utils = {
            substrLastSlash(hrid) {
                return hrid?.substring(hrid.lastIndexOf('/') + 1);
            },
    
            getItemTypeSuffix(type) {
                const suffix = utils.substrLastSlash(type);
                if (suffix.endsWith('_tool')) return 'tool';
                if (suffix.endsWith('_charm')) return 'charm';
                return suffix;
            },
    
            getReactProps(el) {
                const key = Reflect.ownKeys(el || {}).find(k => k.startsWith('__reactProps$'));
                return key ? el[key]?.children[0]?._owner?.memoizedProps : null;
            },
    
            getItemByHash(hash) {
                if (!hash || !hash.includes('::')) return null;
                const arr = hash.split('::') ?? [];
                return arr.length !== 4 ? null : {characterId: arr[0], location: arr[1], itemHrid: arr[2], enhancementLevel: parseInt(arr[3])};
            },
    
            getTextBetween(start, end) {
                let text = '';
                let current = start.nextSibling;
    
                while (current && current !== end) {
                    if (current.nodeType === 3) {
                        text += current.textContent;
                    }
                    current = current.nextSibling;
                }
    
                return text;
            }
        };
    
        // ==================== WebSocket 拦截 ====================
        class WebSocketInterception {
            constructor(targetWindow) {
                this.window = targetWindow;
                this.OriginalWebSocket = this.window.WebSocket;
                this._intercept();
            }
    
            _intercept() {
                const self = this;
                const OriginalWebSocket = this.OriginalWebSocket;
    
                function InterceptedWebSocket(...args) {
                    const [url] = args;
                    const ws = new OriginalWebSocket(...args);
    
                    if (typeof url === 'string' && url.includes(CONFIG.domainname + '/ws')) {
                        ws.send = function (data) {
                            try {
                                self._dispatchEvent(CONFIG.mwiWsSend, data);
                            } catch {}
                            return OriginalWebSocket.prototype.send.call(this, data);
                        };
    
                        ws.addEventListener('message', event => {
                            try {
                                self._dispatchEvent(CONFIG.mwiWsReceived, event.data);
                            } catch {}
                        });
    
                        ws.addEventListener('open', () => console.log('[EDS] WebSocket connected'));
                        ws.addEventListener('close', () => console.log('[EDS] WebSocket disconnected'));
                    }
    
                    return ws;
                }
    
                InterceptedWebSocket.prototype = OriginalWebSocket.prototype;
                InterceptedWebSocket.OPEN = OriginalWebSocket.OPEN;
                InterceptedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
                InterceptedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
                InterceptedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    
                this.window.WebSocket = InterceptedWebSocket;
                this._patchErrorHandlers();
            }
    
            _patchErrorHandlers() {
                this.window.addEventListener(
                    'error',
                    e => {
                        if (e.message?.includes('WebSocket') && e.message?.includes('failed')) {
                            e.stopImmediatePropagation();
                            e.preventDefault();
                        }
                    },
                    true
                );
    
                this.window.addEventListener('unhandledrejection', e => {
                    if (e.reason?.message?.includes('WebSocket')) {
                        e.preventDefault();
                    }
                });
            }
    
            _dispatchEvent(eventName, data) {
                this.window.dispatchEvent(new CustomEvent(eventName, {detail: JSON.parse(data)}));
            }
        }
    
        // ==================== 游戏网站逻辑 ====================
        class Milkywayidle {
            constructor() {
                this.specialData = {};
                this.ws = new WebSocketInterception(window);
                this._initWsListener();
                this._injectStyle();
                this._initObserver();
            }
    
            _initWsListener() {
                window.addEventListener(CONFIG.mwiWsReceived, event => {
                    try {
                        const data = event.detail || {};
                        if (data.type === 'init_character_data') {
                            console.log('[EDS] 收到init_character_data消息');
                            this.specialData.characterHouseRoomMap = data.characterHouseRoomMap;
                            this.specialData.characterAchievements = data.characterAchievements;
                            MilkonomyPresetConverter.syncToGm(data);
                            console.log('[EDS] 已将转换后的preset存入GM');
                        } else if (data.type === 'house_rooms_updated') {
                            console.log('[EDS] 收到house_rooms_updated消息');
                            this.specialData.characterHouseRoomMap = data.characterHouseRoomMap;
                            MilkonomyPresetConverter.syncToGm(MilkonomyPresetConverter.loadGameData(this.specialData));
                            console.log('[EDS] 已将转换后的preset存入GM');
                        }
                    } catch {}
                });
            }
    
            _injectStyle() {
                GM_addStyle(`
                    .EquipmentPanel_buttonContainer__c33hx {
                        display: flex;
                        grid-gap: var(--spacing-xs);
                        gap: var(--spacing-xs);
                    }
    
                    .LoadoutsPanel_loadoutsPanel__Gc5VA .LoadoutsPanel_selectedLoadout__1ozGd .LoadoutsPanel_details__3uO1G .LoadoutsPanel_setup__3mazG .LoadoutsPanel_buttonsContainer__8JWnI {
                        display: flex;
                        align-items: center;
                        justify-content: flex-start !important; /* 改成左对齐 */
                        grid-gap: var(--spacing-xs);
                        gap: var(--spacing-xs);
                    }
    
                    /* 第一个按钮靠左，后面所有按钮挤到右边 */
                    .LoadoutsPanel_buttonsContainer__8JWnI button:first-child {
                        margin-right: auto;
                    }
                `);
            }
    
            _initObserver() {
                const observer = new MutationObserver(() => {
                    // 装备面板
                    const equipmentPanel = document.querySelector('.EquipmentPanel_equipmentPanel__29pDG');
                    if (equipmentPanel) this._initCopyMilkonomyBtn(equipmentPanel);
    
                    // 配装编辑面板
                    const loadoutsPanel = document.querySelector('.LoadoutsPanel_selectedLoadout__1ozGd');
                    if (loadoutsPanel) this._initCopyCombatSimulatorBtn(loadoutsPanel);
                });
                observer.observe(document.body, {childList: true, subtree: true});
                window.addEventListener('beforeunload', () => observer.disconnect());
            }
    
            _initCopyMilkonomyBtn(equipmentPanel) {
                if (equipmentPanel.querySelector('.' + CONFIG.milkonomy.componentClass)) return;
    
                const buttonContainer = equipmentPanel.querySelector('.EquipmentPanel_buttonContainer__c33hx');
                const buttons = buttonContainer.querySelectorAll('button');
                const lastButton = buttons[buttons.length - 1];
    
                this.copyMilkonomyBtn = lastButton.cloneNode(true);
                this.copyMilkonomyBtn.textContent = '复制Milkonomy数据';
                this.copyMilkonomyBtn.title = '在Milkonomy网站预设方案编辑页面点导入按钮填入数据';
                this.copyMilkonomyBtn.classList.add(CONFIG.milkonomy.componentClass);
                this.copyMilkonomyBtn.onclick = () => {
                    const gameData = MilkonomyPresetConverter.loadGameData(this.specialData);
                    const _preset = MilkonomyPresetConverter.syncToGm(gameData);
                    const preset = MilkonomyPresetConverter.filterConvertData(_preset);
                    GM_setClipboard(JSON.stringify(preset));
                };
                buttonContainer.appendChild(this.copyMilkonomyBtn);
            }
    
            _initCopyCombatSimulatorBtn(loadoutsPanel) {
                if (loadoutsPanel.querySelector('.' + CONFIG.milkonomy.componentClass)) return;
    
                const detailsEl = loadoutsPanel.querySelector('.LoadoutsPanel_details__3uO1G');
                if (!this._isCombatLoadout(detailsEl)) return;
    
                const buttonContainer = loadoutsPanel.querySelector('.LoadoutsPanel_buttonsContainer__8JWnI');
                const buttons = buttonContainer.querySelectorAll('button');
                const lastButton = buttons[buttons.length - 1];
    
                this.copyCombatSimulatorBtn = lastButton.cloneNode(true);
                this.copyCombatSimulatorBtn.textContent = '导出配装';
                this.copyCombatSimulatorBtn.title = '导出战斗模拟器所需数据';
                this.copyCombatSimulatorBtn.classList.add('Button_success__6d6kU');
                this.copyCombatSimulatorBtn.classList.add(CONFIG.milkonomy.componentClass);
                this.copyCombatSimulatorBtn.onclick = () => this._handleCopyCombatSimulator(detailsEl);
                lastButton.before(this.copyCombatSimulatorBtn);
            }
    
            _isCombatLoadout(detailsEl) {
                const useEl = detailsEl?.querySelector('.LoadoutsPanel_metadata__1TXX2 svg use');
                return useEl?.getAttribute('href')?.split('#')?.[1] === 'combat';
            }
    
            _getLoadoutName(detailsEl) {
                const titleEl = detailsEl.querySelector('.LoadoutsPanel_metadata__1TXX2');
                const svgEl = titleEl.querySelector('svg');
                const updateBtnEl = titleEl.querySelector('.Button_button__1Fe9z');
                return utils.getTextBetween(svgEl, updateBtnEl)?.trim();
            }
    
            _handleCopyCombatSimulator(detailsEl) {
                const name = this._getLoadoutName(detailsEl);
                const data = utils.getReactProps(detailsEl) || {};
                const loadoutInfo = Object.values(data.characterLoadoutDict || {}).find(v => v.name === name);
                if (!loadoutInfo) {
                    alert('未找到配装方案');
                    return;
                }
                const otherInfo = {
                    characterSkills: [...data.characterSkillMap.values()],
                    characterAbilities: [...data.characterAbilityMap.values()],
                    characterHouseRoomMap: this.characterHouseRoomMap,
                    characterAchievements: this.characterAchievements
                };
                const convert = CombatSimulatorConverter.convert(loadoutInfo, otherInfo);
                GM_setClipboard(JSON.stringify(convert));
            }
        }
    
        class CombatSimulatorConverter {
            static SKILLS = ['stamina', 'intelligence', 'attack', 'defense', 'melee', 'ranged', 'magic'];
    
            static convert(loadoutInfo, {characterSkills, characterHouseRoomMap, characterAbilities, characterAchievements}) {
                return {
                    player: {...this._getCombatLevelMap(characterSkills), equipment: this._getEquipments(loadoutInfo.wearableMap)},
                    food: {'/action_types/combat': this._getFoods(loadoutInfo.foodItemHrids)},
                    drinks: {'/action_types/combat': this._getDrinks(loadoutInfo.drinkItemHrids)},
                    abilities: this._getAbilities(loadoutInfo.abilityMap, characterAbilities),
                    triggerMap: this._getTriggerMap(loadoutInfo.abilityCombatTriggersMap, loadoutInfo.consumableCombatTriggersMap),
                    houseRooms: this._getHouseRoomMap(characterHouseRoomMap),
                    achievements: this._getAchievementMap(characterAchievements)
                };
            }
    
            static _getCombatLevelMap(characterSkills) {
                const res = {};
                for (const skill of this.SKILLS) {
                    res[skill + 'Level'] = characterSkills?.find(v => v.skillHrid === '/skills/' + skill)?.level || 0;
                }
                return res;
            }
    
            static _getEquipments(wearableMap) {
                const arr = [];
                Object.entries(wearableMap)?.forEach(([loc, hash]) => {
                    const item = utils.getItemByHash(hash);
                    if (item) arr.push({itemLocationHrid: loc, itemHrid: item.itemHrid, enhancementLevel: item.enhancementLevel});
                });
                return arr;
            }
    
            static _getFoods(itemHrids) {
                return itemHrids?.map(hrid => ({itemHrid: hrid})) || [];
            }
    
            static _getDrinks(itemHrids) {
                return itemHrids?.map(hrid => ({itemHrid: hrid})) || [];
            }
    
            static _getAbilities(abilityMap, characterAbilities) {
                const arr = [];
                Object.entries(abilityMap)?.forEach(([, hrid]) => {
                    arr.push({abilityHrid: hrid, level: characterAbilities?.find(v => v.abilityHrid === hrid)?.level || 0});
                });
                return arr;
            }
    
            static _getTriggerMap(abilityCombatTriggersMap, consumableCombatTriggersMap) {
                return {...abilityCombatTriggersMap, ...consumableCombatTriggersMap};
            }
    
            static _getHouseRoomMap(characterHouseRoomMap) {
                const res = {};
                Object.entries(characterHouseRoomMap)?.forEach(([hrid, data]) => {
                    res[hrid] = data.level;
                });
                return res;
            }
    
            static _getAchievementMap(characterAchievements) {
                const res = {};
                characterAchievements?.forEach(v => {
                    res[v.achievementHrid] = v.isCompleted;
                });
                return res;
            }
        }
    
        // ==================== Milkonomy 网站逻辑 ====================
        class Milkonomy {
            constructor() {
                this._observer = null;
                this._initValueChangeListener();
                this._initObserver();
            }
    
            _initValueChangeListener() {
                GM_addValueChangeListener(CONFIG.mwiMilkonomyPreset, (_name, _oldValue, newValue, remote) => {
                    if (remote && newValue) {
                        console.log('[EDS] 配装数据发生变化', newValue);
                    }
                });
            }
    
            _initObserver() {
                this._observer = new MutationObserver(() => {
                    const gameInfo = document.querySelector('.game-info');
                    if (gameInfo && !gameInfo.querySelector('.' + CONFIG.milkonomy.componentClass)) {
                        this._addSyncButton(gameInfo);
                    }
                });
    
                this._observer.observe(document.body, {childList: true, subtree: true});
                window.addEventListener('beforeunload', () => this._observer.disconnect());
            }
    
            _addSyncButton(gameInfo) {
                const syncBtn = document.createElement('button');
                syncBtn.className = CONFIG.milkonomy.componentClass + ' el-button el-button--primary';
                syncBtn.style = 'margin-left: 0.5rem;';
                syncBtn.innerHTML = '<span>同步配装</span>';
                syncBtn.onclick = () => this._doSync();
                gameInfo.querySelector('.items-center > .items-center')?.after(syncBtn);
            }
    
            _doSync() {
                const _preset = GM_getValue(CONFIG.mwiMilkonomyPreset);
                if (!_preset || !('name' in _preset)) return;
                const preset = MilkonomyPresetConverter.filterConvertData(_preset);
                const presets = JSON.parse(window.localStorage.getItem(CONFIG.lsPresets)) || [];
                let index = presets.findIndex(v => v.name === preset.name);
    
                if (index === -1) {
                    presets.push(preset);
                    index = presets.length - 1;
                } else {
                    presets[index] = preset;
                }
    
                window.localStorage.setItem(CONFIG.lsPresets, JSON.stringify(presets));
                window.localStorage.setItem('player-action-preset-index', index);
                setTimeout(() => window.location.reload(), 500);
            }
        }
    
        // ==================== 配装数据转换器 ====================
        class MilkonomyPresetConverter {
            // 生活装备配置（只包含需要同步的装备）
            static INCLUDE_ITEMS = {
                '/items/advanced_alchemy_charm': {
                    hrid: '/items/advanced_alchemy_charm',
                    name: '高级炼金护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 50, skillName: '炼金'}]
                },
                '/items/advanced_brewing_charm': {
                    hrid: '/items/advanced_brewing_charm',
                    name: '高级冲泡护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 50, skillName: '冲泡'}]
                },
                '/items/advanced_cheesesmithing_charm': {
                    hrid: '/items/advanced_cheesesmithing_charm',
                    name: '高级奶酪锻造护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 50, skillName: '奶酪锻造'}]
                },
                '/items/advanced_cooking_charm': {
                    hrid: '/items/advanced_cooking_charm',
                    name: '高级烹饪护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 50, skillName: '烹饪'}]
                },
                '/items/advanced_crafting_charm': {
                    hrid: '/items/advanced_crafting_charm',
                    name: '高级制作护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 50, skillName: '制作'}]
                },
                '/items/advanced_enhancing_charm': {
                    hrid: '/items/advanced_enhancing_charm',
                    name: '高级强化护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 50, skillName: '强化'}]
                },
                '/items/advanced_foraging_charm': {
                    hrid: '/items/advanced_foraging_charm',
                    name: '高级采摘护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 50, skillName: '采摘'}]
                },
                '/items/advanced_milking_charm': {
                    hrid: '/items/advanced_milking_charm',
                    name: '高级挤奶护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 50, skillName: '挤奶'}]
                },
                '/items/advanced_tailoring_charm': {
                    hrid: '/items/advanced_tailoring_charm',
                    name: '高级缝纫护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 50, skillName: '缝纫'}]
                },
                '/items/advanced_woodcutting_charm': {
                    hrid: '/items/advanced_woodcutting_charm',
                    name: '高级伐木护符',
                    type: '/equipment_types/charm',
                    itemLevel: 40,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 50, skillName: '伐木'}]
                },
                '/items/alchemists_bottoms': {
                    hrid: '/items/alchemists_bottoms',
                    name: '炼金师下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 90, skillName: '炼金'}]
                },
                '/items/alchemists_top': {
                    hrid: '/items/alchemists_top',
                    name: '炼金师上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 90, skillName: '炼金'}]
                },
                '/items/artificer_cape': {
                    hrid: '/items/artificer_cape',
                    name: '工匠披风',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/cheesesmithing', level: 80, skillName: '奶酪锻造'},
                        {skillHrid: '/skills/crafting', level: 80, skillName: '制作'},
                        {skillHrid: '/skills/tailoring', level: 80, skillName: '缝纫'}
                    ]
                },
                '/items/artificer_cape_refined': {
                    hrid: '/items/artificer_cape_refined',
                    name: '工匠披风 ★',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/cheesesmithing', level: 100, skillName: '奶酪锻造'},
                        {skillHrid: '/skills/crafting', level: 100, skillName: '制作'},
                        {skillHrid: '/skills/tailoring', level: 100, skillName: '缝纫'}
                    ]
                },
                '/items/azure_alembic': {
                    hrid: '/items/azure_alembic',
                    name: '蔚蓝蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 20, skillName: '炼金'}]
                },
                '/items/azure_brush': {
                    hrid: '/items/azure_brush',
                    name: '蔚蓝刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 20, skillName: '挤奶'}]
                },
                '/items/azure_chisel': {
                    hrid: '/items/azure_chisel',
                    name: '蔚蓝凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 20, skillName: '制作'}]
                },
                '/items/azure_enhancer': {
                    hrid: '/items/azure_enhancer',
                    name: '蔚蓝强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 20, skillName: '强化'}]
                },
                '/items/azure_hammer': {
                    hrid: '/items/azure_hammer',
                    name: '蔚蓝锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 20, skillName: '奶酪锻造'}]
                },
                '/items/azure_hatchet': {
                    hrid: '/items/azure_hatchet',
                    name: '蔚蓝斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 20, skillName: '伐木'}]
                },
                '/items/azure_needle': {
                    hrid: '/items/azure_needle',
                    name: '蔚蓝针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 20, skillName: '缝纫'}]
                },
                '/items/azure_pot': {
                    hrid: '/items/azure_pot',
                    name: '蔚蓝壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 20, skillName: '冲泡'}]
                },
                '/items/azure_shears': {
                    hrid: '/items/azure_shears',
                    name: '蔚蓝剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 20, skillName: '采摘'}]
                },
                '/items/azure_spatula': {
                    hrid: '/items/azure_spatula',
                    name: '蔚蓝锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 20, skillName: '烹饪'}]
                },
                '/items/basic_alchemy_charm': {
                    hrid: '/items/basic_alchemy_charm',
                    name: '基础炼金护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 25, skillName: '炼金'}]
                },
                '/items/basic_brewing_charm': {
                    hrid: '/items/basic_brewing_charm',
                    name: '基础冲泡护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 25, skillName: '冲泡'}]
                },
                '/items/basic_cheesesmithing_charm': {
                    hrid: '/items/basic_cheesesmithing_charm',
                    name: '基础奶酪锻造护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 25, skillName: '奶酪锻造'}]
                },
                '/items/basic_cooking_charm': {
                    hrid: '/items/basic_cooking_charm',
                    name: '基础烹饪护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 25, skillName: '烹饪'}]
                },
                '/items/basic_crafting_charm': {
                    hrid: '/items/basic_crafting_charm',
                    name: '基础制作护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 25, skillName: '制作'}]
                },
                '/items/basic_enhancing_charm': {
                    hrid: '/items/basic_enhancing_charm',
                    name: '基础强化护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 25, skillName: '强化'}]
                },
                '/items/basic_foraging_charm': {
                    hrid: '/items/basic_foraging_charm',
                    name: '基础采摘护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 25, skillName: '采摘'}]
                },
                '/items/basic_milking_charm': {
                    hrid: '/items/basic_milking_charm',
                    name: '基础挤奶护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 25, skillName: '挤奶'}]
                },
                '/items/basic_tailoring_charm': {
                    hrid: '/items/basic_tailoring_charm',
                    name: '基础缝纫护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 25, skillName: '缝纫'}]
                },
                '/items/basic_woodcutting_charm': {
                    hrid: '/items/basic_woodcutting_charm',
                    name: '基础伐木护符',
                    type: '/equipment_types/charm',
                    itemLevel: 20,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 25, skillName: '伐木'}]
                },
                '/items/brewers_bottoms': {
                    hrid: '/items/brewers_bottoms',
                    name: '饮品师下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 90, skillName: '冲泡'}]
                },
                '/items/brewers_top': {
                    hrid: '/items/brewers_top',
                    name: '饮品师上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 90, skillName: '冲泡'}]
                },
                '/items/burble_alembic': {
                    hrid: '/items/burble_alembic',
                    name: '深紫蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 35, skillName: '炼金'}]
                },
                '/items/burble_brush': {
                    hrid: '/items/burble_brush',
                    name: '深紫刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 35, skillName: '挤奶'}]
                },
                '/items/burble_chisel': {
                    hrid: '/items/burble_chisel',
                    name: '深紫凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 35, skillName: '制作'}]
                },
                '/items/burble_enhancer': {
                    hrid: '/items/burble_enhancer',
                    name: '深紫强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 35, skillName: '强化'}]
                },
                '/items/burble_hammer': {
                    hrid: '/items/burble_hammer',
                    name: '深紫锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 35, skillName: '奶酪锻造'}]
                },
                '/items/burble_hatchet': {
                    hrid: '/items/burble_hatchet',
                    name: '深紫斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 35, skillName: '伐木'}]
                },
                '/items/burble_needle': {
                    hrid: '/items/burble_needle',
                    name: '深紫针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 35, skillName: '缝纫'}]
                },
                '/items/burble_pot': {
                    hrid: '/items/burble_pot',
                    name: '深紫壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 35, skillName: '冲泡'}]
                },
                '/items/burble_shears': {
                    hrid: '/items/burble_shears',
                    name: '深紫剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 35, skillName: '采摘'}]
                },
                '/items/burble_spatula': {
                    hrid: '/items/burble_spatula',
                    name: '深紫锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 35,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 35, skillName: '烹饪'}]
                },
                '/items/celestial_alembic': {
                    hrid: '/items/celestial_alembic',
                    name: '星空蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 90, skillName: '炼金'}]
                },
                '/items/celestial_brush': {
                    hrid: '/items/celestial_brush',
                    name: '星空刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 90, skillName: '挤奶'}]
                },
                '/items/celestial_chisel': {
                    hrid: '/items/celestial_chisel',
                    name: '星空凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 90, skillName: '制作'}]
                },
                '/items/celestial_enhancer': {
                    hrid: '/items/celestial_enhancer',
                    name: '星空强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 90, skillName: '强化'}]
                },
                '/items/celestial_hammer': {
                    hrid: '/items/celestial_hammer',
                    name: '星空锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 90, skillName: '奶酪锻造'}]
                },
                '/items/celestial_hatchet': {
                    hrid: '/items/celestial_hatchet',
                    name: '星空斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 90, skillName: '伐木'}]
                },
                '/items/celestial_needle': {
                    hrid: '/items/celestial_needle',
                    name: '星空针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 90, skillName: '缝纫'}]
                },
                '/items/celestial_pot': {
                    hrid: '/items/celestial_pot',
                    name: '星空壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 90, skillName: '冲泡'}]
                },
                '/items/celestial_shears': {
                    hrid: '/items/celestial_shears',
                    name: '星空剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 90, skillName: '采摘'}]
                },
                '/items/celestial_spatula': {
                    hrid: '/items/celestial_spatula',
                    name: '星空锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 90, skillName: '烹饪'}]
                },
                '/items/chance_cape': {
                    hrid: '/items/chance_cape',
                    name: '机缘披风',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/alchemy', level: 80, skillName: '炼金'},
                        {skillHrid: '/skills/enhancing', level: 80, skillName: '强化'}
                    ]
                },
                '/items/chance_cape_refined': {
                    hrid: '/items/chance_cape_refined',
                    name: '机缘披风 ★',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/alchemy', level: 100, skillName: '炼金'},
                        {skillHrid: '/skills/enhancing', level: 100, skillName: '强化'}
                    ]
                },
                '/items/cheese_alembic': {
                    hrid: '/items/cheese_alembic',
                    name: '奶酪蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 1, skillName: '炼金'}]
                },
                '/items/cheese_brush': {
                    hrid: '/items/cheese_brush',
                    name: '奶酪刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 1, skillName: '挤奶'}]
                },
                '/items/cheese_chisel': {
                    hrid: '/items/cheese_chisel',
                    name: '奶酪凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 1, skillName: '制作'}]
                },
                '/items/cheese_enhancer': {
                    hrid: '/items/cheese_enhancer',
                    name: '奶酪强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 1, skillName: '强化'}]
                },
                '/items/cheese_hammer': {
                    hrid: '/items/cheese_hammer',
                    name: '奶酪锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 1, skillName: '奶酪锻造'}]
                },
                '/items/cheese_hatchet': {
                    hrid: '/items/cheese_hatchet',
                    name: '奶酪斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 1, skillName: '伐木'}]
                },
                '/items/cheese_needle': {
                    hrid: '/items/cheese_needle',
                    name: '奶酪针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 1, skillName: '缝纫'}]
                },
                '/items/cheese_pot': {
                    hrid: '/items/cheese_pot',
                    name: '奶酪壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 1, skillName: '冲泡'}]
                },
                '/items/cheese_shears': {
                    hrid: '/items/cheese_shears',
                    name: '奶酪剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 1, skillName: '采摘'}]
                },
                '/items/cheese_spatula': {
                    hrid: '/items/cheese_spatula',
                    name: '奶酪锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 1, skillName: '烹饪'}]
                },
                '/items/cheesemakers_bottoms': {
                    hrid: '/items/cheesemakers_bottoms',
                    name: '奶酪师下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 90, skillName: '奶酪锻造'}]
                },
                '/items/cheesemakers_top': {
                    hrid: '/items/cheesemakers_top',
                    name: '奶酪师上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 90, skillName: '奶酪锻造'}]
                },
                '/items/chefs_bottoms': {
                    hrid: '/items/chefs_bottoms',
                    name: '厨师下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 90, skillName: '烹饪'}]
                },
                '/items/chefs_top': {
                    hrid: '/items/chefs_top',
                    name: '厨师上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 90, skillName: '烹饪'}]
                },
                '/items/collectors_boots': {
                    hrid: '/items/collectors_boots',
                    name: '收藏家靴',
                    type: '/equipment_types/feet',
                    itemLevel: 60,
                    levelRequirements: [
                        {skillHrid: '/skills/milking', level: 60, skillName: '挤奶'},
                        {skillHrid: '/skills/foraging', level: 60, skillName: '采摘'},
                        {skillHrid: '/skills/woodcutting', level: 60, skillName: '伐木'}
                    ]
                },
                '/items/crafters_bottoms': {
                    hrid: '/items/crafters_bottoms',
                    name: '工匠下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 90, skillName: '制作'}]
                },
                '/items/crafters_top': {
                    hrid: '/items/crafters_top',
                    name: '工匠上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 90, skillName: '制作'}]
                },
                '/items/crimson_alembic': {
                    hrid: '/items/crimson_alembic',
                    name: '绛红蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 50, skillName: '炼金'}]
                },
                '/items/crimson_brush': {
                    hrid: '/items/crimson_brush',
                    name: '绛红刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 50, skillName: '挤奶'}]
                },
                '/items/crimson_chisel': {
                    hrid: '/items/crimson_chisel',
                    name: '绛红凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 50, skillName: '制作'}]
                },
                '/items/crimson_enhancer': {
                    hrid: '/items/crimson_enhancer',
                    name: '绛红强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 50, skillName: '强化'}]
                },
                '/items/crimson_hammer': {
                    hrid: '/items/crimson_hammer',
                    name: '绛红锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 50, skillName: '奶酪锻造'}]
                },
                '/items/crimson_hatchet': {
                    hrid: '/items/crimson_hatchet',
                    name: '绛红斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 50, skillName: '伐木'}]
                },
                '/items/crimson_needle': {
                    hrid: '/items/crimson_needle',
                    name: '绛红针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 50, skillName: '缝纫'}]
                },
                '/items/crimson_pot': {
                    hrid: '/items/crimson_pot',
                    name: '绛红壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 50, skillName: '冲泡'}]
                },
                '/items/crimson_shears': {
                    hrid: '/items/crimson_shears',
                    name: '绛红剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 50, skillName: '采摘'}]
                },
                '/items/crimson_spatula': {
                    hrid: '/items/crimson_spatula',
                    name: '绛红锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 50,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 50, skillName: '烹饪'}]
                },
                '/items/culinary_cape': {
                    hrid: '/items/culinary_cape',
                    name: '厨师披风',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/cooking', level: 80, skillName: '烹饪'},
                        {skillHrid: '/skills/brewing', level: 80, skillName: '冲泡'}
                    ]
                },
                '/items/culinary_cape_refined': {
                    hrid: '/items/culinary_cape_refined',
                    name: '厨师披风 ★',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/cooking', level: 100, skillName: '烹饪'},
                        {skillHrid: '/skills/brewing', level: 100, skillName: '冲泡'}
                    ]
                },
                '/items/dairyhands_bottoms': {
                    hrid: '/items/dairyhands_bottoms',
                    name: '挤奶工下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 90, skillName: '挤奶'}]
                },
                '/items/dairyhands_top': {
                    hrid: '/items/dairyhands_top',
                    name: '挤奶工上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 90, skillName: '挤奶'}]
                },
                '/items/earrings_of_essence_find': {
                    hrid: '/items/earrings_of_essence_find',
                    name: '精华发现耳环',
                    type: '/equipment_types/earrings',
                    itemLevel: 30,
                    levelRequirements: []
                },
                '/items/earrings_of_gathering': {
                    hrid: '/items/earrings_of_gathering',
                    name: '采集耳环',
                    type: '/equipment_types/earrings',
                    itemLevel: 15,
                    levelRequirements: []
                },
                '/items/earrings_of_rare_find': {
                    hrid: '/items/earrings_of_rare_find',
                    name: '稀有发现耳环',
                    type: '/equipment_types/earrings',
                    itemLevel: 60,
                    levelRequirements: []
                },
                '/items/enchanted_gloves': {
                    hrid: '/items/enchanted_gloves',
                    name: '附魔手套',
                    type: '/equipment_types/hands',
                    itemLevel: 60,
                    levelRequirements: [
                        {skillHrid: '/skills/alchemy', level: 60, skillName: '炼金'},
                        {skillHrid: '/skills/enhancing', level: 60, skillName: '强化'}
                    ]
                },
                '/items/enhancers_bottoms': {
                    hrid: '/items/enhancers_bottoms',
                    name: '强化师下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 90, skillName: '强化'}]
                },
                '/items/enhancers_top': {
                    hrid: '/items/enhancers_top',
                    name: '强化师上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 90, skillName: '强化'}]
                },
                '/items/expert_alchemy_charm': {
                    hrid: '/items/expert_alchemy_charm',
                    name: '专家炼金护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 75, skillName: '炼金'}]
                },
                '/items/expert_brewing_charm': {
                    hrid: '/items/expert_brewing_charm',
                    name: '专家冲泡护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 75, skillName: '冲泡'}]
                },
                '/items/expert_cheesesmithing_charm': {
                    hrid: '/items/expert_cheesesmithing_charm',
                    name: '专家奶酪锻造护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 75, skillName: '奶酪锻造'}]
                },
                '/items/expert_cooking_charm': {
                    hrid: '/items/expert_cooking_charm',
                    name: '专家烹饪护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 75, skillName: '烹饪'}]
                },
                '/items/expert_crafting_charm': {
                    hrid: '/items/expert_crafting_charm',
                    name: '专家制作护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 75, skillName: '制作'}]
                },
                '/items/expert_enhancing_charm': {
                    hrid: '/items/expert_enhancing_charm',
                    name: '专家强化护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 75, skillName: '强化'}]
                },
                '/items/expert_foraging_charm': {
                    hrid: '/items/expert_foraging_charm',
                    name: '专家采摘护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 75, skillName: '采摘'}]
                },
                '/items/expert_milking_charm': {
                    hrid: '/items/expert_milking_charm',
                    name: '专家挤奶护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 75, skillName: '挤奶'}]
                },
                '/items/expert_tailoring_charm': {
                    hrid: '/items/expert_tailoring_charm',
                    name: '专家缝纫护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 75, skillName: '缝纫'}]
                },
                '/items/expert_woodcutting_charm': {
                    hrid: '/items/expert_woodcutting_charm',
                    name: '专家伐木护符',
                    type: '/equipment_types/charm',
                    itemLevel: 60,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 75, skillName: '伐木'}]
                },
                '/items/eye_watch': {
                    hrid: '/items/eye_watch',
                    name: '掌上监工',
                    type: '/equipment_types/off_hand',
                    itemLevel: 60,
                    levelRequirements: [
                        {skillHrid: '/skills/cheesesmithing', level: 60, skillName: '奶酪锻造'},
                        {skillHrid: '/skills/crafting', level: 60, skillName: '制作'},
                        {skillHrid: '/skills/tailoring', level: 60, skillName: '缝纫'}
                    ]
                },
                '/items/foragers_bottoms': {
                    hrid: '/items/foragers_bottoms',
                    name: '采摘者下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 90, skillName: '采摘'}]
                },
                '/items/foragers_top': {
                    hrid: '/items/foragers_top',
                    name: '采摘者上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 90, skillName: '采摘'}]
                },
                '/items/gatherer_cape': {
                    hrid: '/items/gatherer_cape',
                    name: '采集者披风',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/milking', level: 80, skillName: '挤奶'},
                        {skillHrid: '/skills/foraging', level: 80, skillName: '采摘'},
                        {skillHrid: '/skills/woodcutting', level: 80, skillName: '伐木'}
                    ]
                },
                '/items/gatherer_cape_refined': {
                    hrid: '/items/gatherer_cape_refined',
                    name: '采集者披风 ★',
                    type: '/equipment_types/back',
                    itemLevel: 80,
                    levelRequirements: [
                        {skillHrid: '/skills/milking', level: 100, skillName: '挤奶'},
                        {skillHrid: '/skills/foraging', level: 100, skillName: '采摘'},
                        {skillHrid: '/skills/woodcutting', level: 100, skillName: '伐木'}
                    ]
                },
                '/items/grandmaster_alchemy_charm': {
                    hrid: '/items/grandmaster_alchemy_charm',
                    name: '宗师炼金护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 125, skillName: '炼金'}]
                },
                '/items/grandmaster_brewing_charm': {
                    hrid: '/items/grandmaster_brewing_charm',
                    name: '宗师冲泡护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 125, skillName: '冲泡'}]
                },
                '/items/grandmaster_cheesesmithing_charm': {
                    hrid: '/items/grandmaster_cheesesmithing_charm',
                    name: '宗师奶酪锻造护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 125, skillName: '奶酪锻造'}]
                },
                '/items/grandmaster_cooking_charm': {
                    hrid: '/items/grandmaster_cooking_charm',
                    name: '宗师烹饪护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 125, skillName: '烹饪'}]
                },
                '/items/grandmaster_crafting_charm': {
                    hrid: '/items/grandmaster_crafting_charm',
                    name: '宗师制作护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 125, skillName: '制作'}]
                },
                '/items/grandmaster_enhancing_charm': {
                    hrid: '/items/grandmaster_enhancing_charm',
                    name: '宗师强化护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 125, skillName: '强化'}]
                },
                '/items/grandmaster_foraging_charm': {
                    hrid: '/items/grandmaster_foraging_charm',
                    name: '宗师采摘护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 125, skillName: '采摘'}]
                },
                '/items/grandmaster_milking_charm': {
                    hrid: '/items/grandmaster_milking_charm',
                    name: '宗师挤奶护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 125, skillName: '挤奶'}]
                },
                '/items/grandmaster_tailoring_charm': {
                    hrid: '/items/grandmaster_tailoring_charm',
                    name: '宗师缝纫护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 125, skillName: '缝纫'}]
                },
                '/items/grandmaster_woodcutting_charm': {
                    hrid: '/items/grandmaster_woodcutting_charm',
                    name: '宗师伐木护符',
                    type: '/equipment_types/charm',
                    itemLevel: 100,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 125, skillName: '伐木'}]
                },
                '/items/guzzling_pouch': {
                    hrid: '/items/guzzling_pouch',
                    name: '暴饮之囊',
                    type: '/equipment_types/pouch',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/total_level', level: 1250, skillName: '总等级'}]
                },
                '/items/holy_alembic': {
                    hrid: '/items/holy_alembic',
                    name: '神圣蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 80, skillName: '炼金'}]
                },
                '/items/holy_brush': {
                    hrid: '/items/holy_brush',
                    name: '神圣刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 80, skillName: '挤奶'}]
                },
                '/items/holy_chisel': {
                    hrid: '/items/holy_chisel',
                    name: '神圣凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 80, skillName: '制作'}]
                },
                '/items/holy_enhancer': {
                    hrid: '/items/holy_enhancer',
                    name: '神圣强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 80, skillName: '强化'}]
                },
                '/items/holy_hammer': {
                    hrid: '/items/holy_hammer',
                    name: '神圣锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 80, skillName: '奶酪锻造'}]
                },
                '/items/holy_hatchet': {
                    hrid: '/items/holy_hatchet',
                    name: '神圣斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 80, skillName: '伐木'}]
                },
                '/items/holy_needle': {
                    hrid: '/items/holy_needle',
                    name: '神圣针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 80, skillName: '缝纫'}]
                },
                '/items/holy_pot': {
                    hrid: '/items/holy_pot',
                    name: '神圣壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 80, skillName: '冲泡'}]
                },
                '/items/holy_shears': {
                    hrid: '/items/holy_shears',
                    name: '神圣剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 80, skillName: '采摘'}]
                },
                '/items/holy_spatula': {
                    hrid: '/items/holy_spatula',
                    name: '神圣锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 80, skillName: '烹饪'}]
                },
                '/items/lumberjacks_bottoms': {
                    hrid: '/items/lumberjacks_bottoms',
                    name: '伐木工下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 90, skillName: '伐木'}]
                },
                '/items/lumberjacks_top': {
                    hrid: '/items/lumberjacks_top',
                    name: '伐木工上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 90, skillName: '伐木'}]
                },
                '/items/master_alchemy_charm': {
                    hrid: '/items/master_alchemy_charm',
                    name: '大师炼金护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 100, skillName: '炼金'}]
                },
                '/items/master_brewing_charm': {
                    hrid: '/items/master_brewing_charm',
                    name: '大师冲泡护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 100, skillName: '冲泡'}]
                },
                '/items/master_cheesesmithing_charm': {
                    hrid: '/items/master_cheesesmithing_charm',
                    name: '大师奶酪锻造护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 100, skillName: '奶酪锻造'}]
                },
                '/items/master_cooking_charm': {
                    hrid: '/items/master_cooking_charm',
                    name: '大师烹饪护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 100, skillName: '烹饪'}]
                },
                '/items/master_crafting_charm': {
                    hrid: '/items/master_crafting_charm',
                    name: '大师制作护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 100, skillName: '制作'}]
                },
                '/items/master_enhancing_charm': {
                    hrid: '/items/master_enhancing_charm',
                    name: '大师强化护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 100, skillName: '强化'}]
                },
                '/items/master_foraging_charm': {
                    hrid: '/items/master_foraging_charm',
                    name: '大师采摘护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 100, skillName: '采摘'}]
                },
                '/items/master_milking_charm': {
                    hrid: '/items/master_milking_charm',
                    name: '大师挤奶护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 100, skillName: '挤奶'}]
                },
                '/items/master_tailoring_charm': {
                    hrid: '/items/master_tailoring_charm',
                    name: '大师缝纫护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 100, skillName: '缝纫'}]
                },
                '/items/master_woodcutting_charm': {
                    hrid: '/items/master_woodcutting_charm',
                    name: '大师伐木护符',
                    type: '/equipment_types/charm',
                    itemLevel: 80,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 100, skillName: '伐木'}]
                },
                '/items/necklace_of_efficiency': {
                    hrid: '/items/necklace_of_efficiency',
                    name: '效率项链',
                    type: '/equipment_types/neck',
                    itemLevel: 30,
                    levelRequirements: []
                },
                '/items/necklace_of_speed': {
                    hrid: '/items/necklace_of_speed',
                    name: '速度项链',
                    type: '/equipment_types/neck',
                    itemLevel: 75,
                    levelRequirements: []
                },
                '/items/necklace_of_wisdom': {
                    hrid: '/items/necklace_of_wisdom',
                    name: '经验项链',
                    type: '/equipment_types/neck',
                    itemLevel: 60,
                    levelRequirements: []
                },
                '/items/philosophers_earrings': {
                    hrid: '/items/philosophers_earrings',
                    name: '贤者耳环',
                    type: '/equipment_types/earrings',
                    itemLevel: 90,
                    levelRequirements: []
                },
                '/items/philosophers_necklace': {
                    hrid: '/items/philosophers_necklace',
                    name: '贤者项链',
                    type: '/equipment_types/neck',
                    itemLevel: 90,
                    levelRequirements: []
                },
                '/items/philosophers_ring': {
                    hrid: '/items/philosophers_ring',
                    name: '贤者戒指',
                    type: '/equipment_types/ring',
                    itemLevel: 90,
                    levelRequirements: []
                },
                '/items/rainbow_alembic': {
                    hrid: '/items/rainbow_alembic',
                    name: '彩虹蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 65, skillName: '炼金'}]
                },
                '/items/rainbow_brush': {
                    hrid: '/items/rainbow_brush',
                    name: '彩虹刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 65, skillName: '挤奶'}]
                },
                '/items/rainbow_chisel': {
                    hrid: '/items/rainbow_chisel',
                    name: '彩虹凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 65, skillName: '制作'}]
                },
                '/items/rainbow_enhancer': {
                    hrid: '/items/rainbow_enhancer',
                    name: '彩虹强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 65, skillName: '强化'}]
                },
                '/items/rainbow_hammer': {
                    hrid: '/items/rainbow_hammer',
                    name: '彩虹锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 65, skillName: '奶酪锻造'}]
                },
                '/items/rainbow_hatchet': {
                    hrid: '/items/rainbow_hatchet',
                    name: '彩虹斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 65, skillName: '伐木'}]
                },
                '/items/rainbow_needle': {
                    hrid: '/items/rainbow_needle',
                    name: '彩虹针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 65, skillName: '缝纫'}]
                },
                '/items/rainbow_pot': {
                    hrid: '/items/rainbow_pot',
                    name: '彩虹壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 65, skillName: '冲泡'}]
                },
                '/items/rainbow_shears': {
                    hrid: '/items/rainbow_shears',
                    name: '彩虹剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 65, skillName: '采摘'}]
                },
                '/items/rainbow_spatula': {
                    hrid: '/items/rainbow_spatula',
                    name: '彩虹锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 65,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 65, skillName: '烹饪'}]
                },
                '/items/red_culinary_hat': {
                    hrid: '/items/red_culinary_hat',
                    name: '红色厨师帽',
                    type: '/equipment_types/head',
                    itemLevel: 60,
                    levelRequirements: [
                        {skillHrid: '/skills/cooking', level: 60, skillName: '烹饪'},
                        {skillHrid: '/skills/brewing', level: 60, skillName: '冲泡'}
                    ]
                },
                '/items/ring_of_essence_find': {
                    hrid: '/items/ring_of_essence_find',
                    name: '精华发现戒指',
                    type: '/equipment_types/ring',
                    itemLevel: 30,
                    levelRequirements: []
                },
                '/items/ring_of_gathering': {
                    hrid: '/items/ring_of_gathering',
                    name: '采集戒指',
                    type: '/equipment_types/ring',
                    itemLevel: 15,
                    levelRequirements: []
                },
                '/items/ring_of_rare_find': {
                    hrid: '/items/ring_of_rare_find',
                    name: '稀有发现戒指',
                    type: '/equipment_types/ring',
                    itemLevel: 60,
                    levelRequirements: []
                },
                '/items/tailors_bottoms': {
                    hrid: '/items/tailors_bottoms',
                    name: '裁缝下装',
                    type: '/equipment_types/legs',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 90, skillName: '缝纫'}]
                },
                '/items/tailors_top': {
                    hrid: '/items/tailors_top',
                    name: '裁缝上衣',
                    type: '/equipment_types/body',
                    itemLevel: 90,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 90, skillName: '缝纫'}]
                },
                '/items/trainee_alchemy_charm': {
                    hrid: '/items/trainee_alchemy_charm',
                    name: '实习炼金护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 1, skillName: '炼金'}]
                },
                '/items/trainee_brewing_charm': {
                    hrid: '/items/trainee_brewing_charm',
                    name: '实习冲泡护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 1, skillName: '冲泡'}]
                },
                '/items/trainee_cheesesmithing_charm': {
                    hrid: '/items/trainee_cheesesmithing_charm',
                    name: '实习奶酪锻造护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 1, skillName: '奶酪锻造'}]
                },
                '/items/trainee_cooking_charm': {
                    hrid: '/items/trainee_cooking_charm',
                    name: '实习烹饪护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 1, skillName: '烹饪'}]
                },
                '/items/trainee_crafting_charm': {
                    hrid: '/items/trainee_crafting_charm',
                    name: '实习制作护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 1, skillName: '制作'}]
                },
                '/items/trainee_enhancing_charm': {
                    hrid: '/items/trainee_enhancing_charm',
                    name: '实习强化护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 1, skillName: '强化'}]
                },
                '/items/trainee_foraging_charm': {
                    hrid: '/items/trainee_foraging_charm',
                    name: '实习采摘护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 1, skillName: '采摘'}]
                },
                '/items/trainee_milking_charm': {
                    hrid: '/items/trainee_milking_charm',
                    name: '实习挤奶护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 1, skillName: '挤奶'}]
                },
                '/items/trainee_tailoring_charm': {
                    hrid: '/items/trainee_tailoring_charm',
                    name: '实习缝纫护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 1, skillName: '缝纫'}]
                },
                '/items/trainee_woodcutting_charm': {
                    hrid: '/items/trainee_woodcutting_charm',
                    name: '实习伐木护符',
                    type: '/equipment_types/charm',
                    itemLevel: 1,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 1, skillName: '伐木'}]
                },
                '/items/verdant_alembic': {
                    hrid: '/items/verdant_alembic',
                    name: '翠绿蒸馏器',
                    type: '/equipment_types/alchemy_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/alchemy', level: 10, skillName: '炼金'}]
                },
                '/items/verdant_brush': {
                    hrid: '/items/verdant_brush',
                    name: '翠绿刷子',
                    type: '/equipment_types/milking_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/milking', level: 10, skillName: '挤奶'}]
                },
                '/items/verdant_chisel': {
                    hrid: '/items/verdant_chisel',
                    name: '翠绿凿子',
                    type: '/equipment_types/crafting_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/crafting', level: 10, skillName: '制作'}]
                },
                '/items/verdant_enhancer': {
                    hrid: '/items/verdant_enhancer',
                    name: '翠绿强化器',
                    type: '/equipment_types/enhancing_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/enhancing', level: 10, skillName: '强化'}]
                },
                '/items/verdant_hammer': {
                    hrid: '/items/verdant_hammer',
                    name: '翠绿锤子',
                    type: '/equipment_types/cheesesmithing_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 10, skillName: '奶酪锻造'}]
                },
                '/items/verdant_hatchet': {
                    hrid: '/items/verdant_hatchet',
                    name: '翠绿斧头',
                    type: '/equipment_types/woodcutting_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/woodcutting', level: 10, skillName: '伐木'}]
                },
                '/items/verdant_needle': {
                    hrid: '/items/verdant_needle',
                    name: '翠绿针',
                    type: '/equipment_types/tailoring_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/tailoring', level: 10, skillName: '缝纫'}]
                },
                '/items/verdant_pot': {
                    hrid: '/items/verdant_pot',
                    name: '翠绿壶',
                    type: '/equipment_types/brewing_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/brewing', level: 10, skillName: '冲泡'}]
                },
                '/items/verdant_shears': {
                    hrid: '/items/verdant_shears',
                    name: '翠绿剪刀',
                    type: '/equipment_types/foraging_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/foraging', level: 10, skillName: '采摘'}]
                },
                '/items/verdant_spatula': {
                    hrid: '/items/verdant_spatula',
                    name: '翠绿锅铲',
                    type: '/equipment_types/cooking_tool',
                    itemLevel: 10,
                    levelRequirements: [{skillHrid: '/skills/cooking', level: 10, skillName: '烹饪'}]
                }
            };
    
            static SKILL_TO_HOUSE_MAP = {
                milking: 'dairy_barn',
                foraging: 'garden',
                woodcutting: 'log_shed',
                cheesesmithing: 'forge',
                crafting: 'workshop',
                tailoring: 'sewing_parlor',
                cooking: 'kitchen',
                brewing: 'brewery',
                alchemy: 'laboratory',
                enhancing: 'observatory'
            };
    
            static ACTION_LOCATIONS = ['tool', 'legs', 'body', 'charm', 'back'];
            static EQUIPMENT_LOCATIONS = ['off_hand', 'head', 'hands', 'feet', 'neck', 'earrings', 'ring', 'pouch'];
            static BUFF_TYPES = ['experience', 'gathering_quantity', 'production_efficiency', 'enhancing_speed'];
            // 存储卷轴名称后缀跟buff名称不同的对应关系
            static SCROLL_TO_PERSON_BUFF_MAP = {};
            static ACHIEVEMENT_TIER_MAP = {
                veteran: [
                    'bestiary_points_100',
                    'build_room_level_3',
                    'coinify_coins_1m',
                    'collection_points_500',
                    'cook_spaceberry_cake',
                    'defeat_chronofrost_sorcerer',
                    'defeat_jerry_t5',
                    'defeat_red_panda',
                    'enhance_to_10',
                    'labyrinth_floor_4',
                    'learn_special_ability',
                    'tailor_umbral_tunic',
                    'total_level_1000',
                    'woodcut_arcane_tree'
                ],
                novice: [
                    'bestiary_points_20',
                    'brew_gourmet_tea',
                    'cheesesmith_azure_tool',
                    'collection_points_100',
                    'defeat_marine_huntress',
                    'defeat_shoebill',
                    'enhance_to_3',
                    'learn_ability',
                    'tailor_medium_pouch',
                    'task_tokens_10',
                    'total_level_250'
                ],
                elite: [
                    'bestiary_points_200',
                    'brew_ultra_magic_coffee',
                    'build_room_level_6',
                    'clear_chimerical_den',
                    'clear_sinister_circus',
                    'collect_branch_of_insight',
                    'collect_butter_of_proficiency',
                    'collect_thread_of_expertise',
                    'collection_points_1000',
                    'craft_dungeon_equipment',
                    'defeat_crystal_colossus',
                    'defeat_dusk_revenant',
                    'enhance_level_80_to_10',
                    'equip_expert_task_badge',
                    'labyrinth_floor_6',
                    'total_level_1500'
                ],
                adept: [
                    'bestiary_points_40',
                    'build_room_level_1',
                    'buy_trainee_charm',
                    'collection_points_200',
                    'cook_peach_yogurt',
                    'craft_jewelry',
                    'decompose_bamboo_gloves',
                    'defeat_gobo_chieftain',
                    'defeat_luna_empress',
                    'defeat_the_watcher',
                    'enhance_to_6',
                    'equip_ginkgo_weapon',
                    'labyrinth_floor_2',
                    'total_level_500'
                ],
                champion: [
                    'bestiary_points_400',
                    'build_room_level_8',
                    'clear_enchanted_fortress',
                    'clear_pirate_cove',
                    'clear_t1_dungeon_10_times',
                    'collection_points_2000',
                    'craft_celestial_tool_or_outfit',
                    'craft_master_charm',
                    'defeat_demonic_overlord_t1',
                    'defeat_stalactite_golem_t5',
                    'enhance_level_90_to_10',
                    'labyrinth_floor_8',
                    'refine_dungeon_equipment',
                    'tailor_gluttonous_or_guzzling_pouch',
                    'total_level_1800',
                    'transmute_philosophers_stone'
                ],
                beginner: ['complete_tutorial', 'cook_apple_gummy', 'craft_wooden_bow', 'defeat_jerry', 'gather_milk', 'total_level_100']
            };
            static COMBAT_ACHIEVEMENTS = ['elite'];
    
            static HOSTNAME_PROPS_FILTERED_MAP = {
                DEFAULT: data => {
                    const actionConfigMap = Object.fromEntries(
                        Object.entries(data.actionConfigMap ?? {}).map(([k, v]) => {
                            const {back, ...rest} = v ?? {};
                            return [k, rest];
                        })
                    );
                    return ({
                        actionConfigMap,
                        specialEquimentMap: data.specialEquimentMap,
                        communityBuffMap: data.communityBuffMap,
                        name: data.name,
                        color: data.color
                    });
                },
                'hyhfish.github.io': data => data
            };
    
            static filterConvertData(convertData) {
                const handler = this.HOSTNAME_PROPS_FILTERED_MAP[CONFIG.hostname] || this.HOSTNAME_PROPS_FILTERED_MAP.DEFAULT;
                return handler(convertData);
            }
    
            static loadGameData({characterHouseRoomMap, characterAchievements}) {
                const headerElement = document.querySelector('.Header_header__1DxsV');
                const game = utils.getReactProps(headerElement) || {};
    
                return {
                    character: game.character,
                    characterItems: game.characterItemMap,
                    characterHouseRoomMap,
                    characterSkills: [...game.characterSkillMap.values()],
                    actionTypeDrinkSlotsMap: game.actionTypeDrinkSlotsDict,
                    communityBuffs: game.communityBuffs,
                    characterAchievements,
                    characterBuffs: game.characterBuffs
                };
            }
    
            static syncToGm(characterData) {
                const preset = this.convert(characterData);
                GM_setValue(CONFIG.mwiMilkonomyPreset, preset);
                return preset;
            }
    
            static convert({
                character,
                characterItems,
                characterSkills,
                characterHouseRoomMap,
                actionTypeDrinkSlotsMap,
                communityBuffs,
                characterAchievements,
                characterBuffs
            }) {
                const validItems = this._filterValidItems(characterItems);
    
                return {
                    name: character?.name || CONFIG.characterId,
                    color: '#90ee90',
                    actionConfigMap: this._convert2ActionConfig(characterSkills, characterHouseRoomMap, actionTypeDrinkSlotsMap, validItems),
                    specialEquimentMap: this._convert2SpecialEquiment(validItems),
                    communityBuffMap: this._convert2CommunityBuff(communityBuffs),
                    // 以下是hyhfish.github.io特有字段
                    achievementBuffMap: this._convert2AchievementBuffMap(characterAchievements),
                    seals: this._convert2Seals(characterBuffs)
                };
            }
    
            static _filterValidItems(characterItems) {
                const validItems = {};
    
                characterItems?.forEach(item => {
                    const info = this.INCLUDE_ITEMS[item.itemHrid];
                    if (!info) return;
    
                    const type = utils.getItemTypeSuffix(info.type);
                    const typeData = validItems[type] || {};
                    let levelRequirements = info.levelRequirements || [];
    
                    if (levelRequirements.length === 0) {
                        levelRequirements = [{skillHrid: '/skills/all', level: info.itemLevel}];
                    }
    
                    levelRequirements.forEach(v => {
                        const skill = utils.substrLastSlash(v.skillHrid);
                        let skillData = typeData[skill];
                        // 1.该部位未获取到数据
                        // 2.已获取数据不能是已穿戴
                        // 2.1.已获取数据的需求等级小于新物品需求等级
                        // 2.2.需求等级相同，判断强化等级
                        if (
                            !skillData ||
                            (!skillData.isWearable &&
                                (skillData.requiredLevel < v.level ||
                                    (skillData.requiredLevel === v.level && skillData.enhanceLevel < item.enhancementLevel)))
                        ) {
                            typeData[skill] = {
                                itemHrid: item.itemHrid,
                                itemName: info.name,
                                isWearable: item.itemLocationHrid !== '/item_locations/inventory',
                                enhanceLevel: item.enhancementLevel,
                                itemLevel: info.itemLevel,
                                requiredLevel: v.level
                            };
                        }
                    });
    
                    validItems[type] = typeData;
                });
    
                return validItems;
            }
    
            static _convert2ActionConfig(characterSkills, characterHouseRoomMap, actionTypeDrinkSlotsMap, validItems) {
                const result = {};
    
                for (const [skill, house] of Object.entries(this.SKILL_TO_HOUSE_MAP)) {
                    const aData = {action: skill};
                    aData.playerLevel = characterSkills?.find(v => v.skillHrid === '/skills/' + skill)?.level || 0;
    
                    for (const loc of this.ACTION_LOCATIONS) {
                        const items = validItems[loc];
                        const item = items?.[skill] || items?.all;
                        const type = loc === 'tool' ? skill + '_tool' : loc;
                        aData[loc] = item ? {type, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type};
                    }
    
                    aData.houseLevel = characterHouseRoomMap?.['/house_rooms/' + house]?.level || 0;
                    aData.tea = actionTypeDrinkSlotsMap?.['/action_types/' + skill]?.filter(v => !!v)?.map(v => v.itemHrid) ?? [];
                    result[skill] = aData;
                }
    
                return result;
            }
    
            static _convert2SpecialEquiment(validItems) {
                const result = {};
    
                for (const loc of this.EQUIPMENT_LOCATIONS) {
                    const items = validItems[loc];
                    const item = items?.all || items?.[Object.keys(items || {})?.[0]];
                    result[loc] = item ? {type: loc, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type: loc};
                }
    
                return result;
            }
    
            static _convert2CommunityBuff(communityBuffs) {
                const result = {};
    
                communityBuffs?.forEach(v => {
                    const type = utils.substrLastSlash(v.hrid);
                    if (this.BUFF_TYPES.includes(type)) {
                        result[type] = {type, hrid: v.hrid, level: v.level};
                    }
                });
    
                return result;
            }
    
            static _convert2AchievementBuffMap(characterAchievements) {
                const completedMap = {};
                characterAchievements?.forEach(v => {
                    completedMap[utils.substrLastSlash(v.achievementHrid)] = v.isCompleted;
                });
                const res = {};
                Object.entries(this.ACHIEVEMENT_TIER_MAP).forEach(([tier, achievements]) => {
                    if (this.COMBAT_ACHIEVEMENTS.includes(tier)) return;
                    const enabled = (achievements?.filter(v => !completedMap[v])?.length ?? 0) === 0;
                    res[tier] = {type: tier, enabled};
                });
                return res;
            }
    
            static _convert2Seals(characterBuffs) {
                const now = Date.now();
                return (
                    characterBuffs
                        ?.filter(v => now < Date.parse(v.expiresAt))
                        ?.map(v => {
                            const buffHrid = utils.substrLastSlash(v.hrid);
                            let itemId = this.SCROLL_TO_PERSON_BUFF_MAP?.[buffHrid] || 'seal_of_' + buffHrid;
                            return '/items/' + itemId;
                        }) || []
                );
            }
        }
    
        // ==================== 初始化 ====================
        function init() {
            if (CONFIG.isGameSite) {
                console.log('[EDS] 初始化游戏网站中……');
                new Milkywayidle();
                console.log('[EDS] 初始化游戏网站初始化完成');
            } else if (CONFIG.isMilkonomySite) {
                console.log('[EDS] 初始化利润网站中……');
                new Milkonomy();
                console.log('[EDS] 初始化利润网站初始化完成');
            }
        }
    
        init();
    })(window, unsafeWindow);
  });

  // ---------------------------------------------------------------------------
  // Module: Talent Market
  // Original: [MWI]Talent Market.user.js v1.5.6
  // Author: SHIIN
  // License: CC-BY-NC-SA-4.0
  // Source: https://greasyfork.org/scripts/559347
  // WebSocket compatibility patches: 0
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("talent-market", "Talent Market", "idle", () => {
    (function(global) {
        'use strict';
        const SnapDOM = (function() {
            function initSnapDOM() {
                if (typeof global.snapdom !== 'undefined') return;
                global.snapdom = async function(node, options = {}) {
                    const scale = options.scale || 2;
                    const width = options.width || node.offsetWidth;
                    const height = options.height || node.offsetHeight;
                    const bgcolor = options.backgroundColor || 'transparent';
                    async function cloneNode(node, filter) {
                        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
                        if (node.nodeType !== Node.ELEMENT_NODE) return null;
                        const clone = node.cloneNode(false);
                        const style = window.getComputedStyle(node);
                        for (let i = 0; i < style.length; i++) {
                            const name = style[i];
                            if (name !== 'backgroundImage') clone.style[name] = style.getPropertyValue(name);
                        }
                        const classNameForFix = typeof node.className === 'string' ? node.className : (node.className?.baseVal || '');
                        if (classNameForFix.includes('mwi-stat-value') || classNameForFix.includes('mwi-stat-label') || classNameForFix.includes('mwi-character-id')) {
                            clone.style.setProperty('overflow', 'visible', 'important');
                            clone.style.setProperty('text-overflow', 'clip', 'important');
                            clone.style.setProperty('white-space', 'nowrap', 'important');
                            clone.style.setProperty('max-width', 'none', 'important');
                        }
                        if (classNameForFix.includes('mwi-stat-item') || classNameForFix.includes('mwi-character-id-wrapper') || classNameForFix.includes('mwi-character-info-top')) {
                            clone.style.setProperty('overflow', 'visible', 'important');
                            clone.style.setProperty('max-width', 'none', 'important');
                        }
                        if (classNameForFix.includes('CharacterName_name') || classNameForFix.includes('CharacterName_characterName')) {
                            clone.style.setProperty('overflow', 'visible', 'important');
                            clone.style.setProperty('height', 'auto', 'important');
                            clone.style.setProperty('max-height', 'none', 'important');
                            clone.style.setProperty('line-height', 'normal', 'important');
                        }
                        if (node.style) {
                            for (let i = 0; i < node.style.length; i++) {
                                const propName = node.style[i];
                                if (propName.startsWith('--')) clone.style.setProperty(propName, node.style.getPropertyValue(propName));
                            }
                        }
                        if (node.tagName === 'use' || node.tagName === 'USE') {
                            const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                            if (href) { clone.setAttribute('href', href); clone.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); }
                        }
                        let backgroundApplied = false;
                        if (node.style?.backgroundImage && node.style.backgroundImage !== 'none') {
                            clone.style.backgroundImage = node.style.backgroundImage;
                            const inlineMatch = node.style.backgroundImage.match(/url\(["']?([^"']*?)["']?\)/);
                            backgroundApplied = !!(inlineMatch?.[1] || node.style.backgroundImage.includes('gradient'));
                        }
                        const bgProps = ['backgroundImage', 'backgroundColor', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment', 'backgroundClip', 'backgroundOrigin'];
                        bgProps.forEach(prop => {
                            const computedValue = style.getPropertyValue(prop);
                            if (computedValue && computedValue !== 'none' && computedValue !== 'initial') {
                                clone.style.setProperty(prop, computedValue);
                                if (prop === 'backgroundImage' && computedValue !== 'none') backgroundApplied = true;
                            }
                        });
                        if (backgroundApplied) {
                            ['backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment'].forEach(prop => {
                                const value = node.style?.[prop] || style.getPropertyValue(prop);
                                if (value && value !== 'initial') clone.style[prop] = value;
                            });
                        }
                        const supportsMask = CSS.supports('mask', 'linear-gradient(#fff 0 0)') || CSS.supports('-webkit-mask', 'linear-gradient(#fff 0 0)');
                        ['::before', '::after'].forEach(pseudo => {
                            const pseudoStyle = window.getComputedStyle(node, pseudo);
                            const content = pseudoStyle.getPropertyValue('content');
                            const background = pseudoStyle.getPropertyValue('background');
                            if ((content && content !== 'none' && content !== 'normal') || (background && background.includes('gradient'))) {
                                const classNameStr = typeof node.className === 'string' ? node.className : (node.className?.baseVal || node.className?.toString() || '');
                                if (classNameStr.includes('mwi-character-info-top') && pseudo === '::before') return;
                                if (classNameStr.includes('mwi-character-card') && pseudo === '::before' && !supportsMask) return;
                                const pseudoElement = document.createElement('div');
                                pseudoElement.className = `pseudo-${pseudo.replace('::', '')}`;
                                ['position', 'top', 'right', 'bottom', 'left', 'inset', 'width', 'height', 'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-attachment', 'background-clip', 'border-radius', 'padding', 'margin', 'z-index', 'pointer-events', 'backdrop-filter', '-webkit-backdrop-filter', 'mask', '-webkit-mask', 'mask-composite', '-webkit-mask-composite'].forEach(prop => {
                                    const value = pseudoStyle.getPropertyValue(prop);
                                    if (value && value !== 'initial' && value !== 'auto' && value !== 'normal') pseudoElement.style.setProperty(prop, value);
                                });
                                const zIndex = pseudoStyle.getPropertyValue('z-index');
                                pseudoElement.style.setProperty('z-index', (zIndex && zIndex !== 'auto') ? zIndex : '-1', 'important');
                                if (pseudo === '::before') clone.insertBefore(pseudoElement, clone.firstChild || null);
                                else clone.appendChild(pseudoElement);
                            }
                        });
                        for (let i = 0; i < node.childNodes.length; i++) {
                            const child = await cloneNode(node.childNodes[i], filter);
                            if (child) clone.appendChild(child);
                        }
                        return clone;
                    }
                    async function embedSVG(clone) {
                        const spriteMap = {};
                        const uses = clone.querySelectorAll('use');
                        for (const use of uses) {
                            const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                            if (!href) continue;
                            if (href.includes('.svg#')) {
                                const [spriteUrl, symbolId] = href.split('#');
                                if (!spriteMap[spriteUrl]) spriteMap[spriteUrl] = new Set();
                                spriteMap[spriteUrl].add(symbolId);
                            } else if (href.startsWith('#')) {
                                const symbolId = href.substring(1);
                                const symbol = document.getElementById(symbolId);
                                if (!symbol) continue;
                                const svg = use.closest('svg');
                                if (!svg) continue;
                                let defs = svg.querySelector('defs');
                                if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
                                if (!defs.querySelector('#' + symbolId)) { const clonedSymbol = symbol.cloneNode(true); clonedSymbol.querySelectorAll('text, tspan').forEach(t => t.remove()); defs.appendChild(clonedSymbol); }
                            }
                        }
                        for (const [spriteUrl, symbolIds] of Object.entries(spriteMap)) {
                            try {
                                const response = await fetch(spriteUrl);
                                const svgText = await response.text();
                                const svgDoc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
                                for (const symbolId of symbolIds) {
                                    const symbol = svgDoc.getElementById(symbolId);
                                    if (!symbol) continue;
                                    const relevantUses = clone.querySelectorAll(`use[href="${spriteUrl}#${symbolId}"]`);
                                    for (const use of relevantUses) {
                                        const svg = use.closest('svg');
                                        if (!svg) continue;
                                        let defs = svg.querySelector('defs');
                                        if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
                                        const spriteType = spriteUrl.match(/\/([^\/]+)_sprite/)?.[1] || 'unknown';
                                        const uniqueId = `${spriteType}_${symbolId}`;
                                        if (!defs.querySelector('#' + uniqueId)) { const clonedSymbol = symbol.cloneNode(true); clonedSymbol.id = uniqueId; clonedSymbol.querySelectorAll('text, tspan').forEach(t => t.remove()); defs.appendChild(clonedSymbol); }
                                        use.setAttribute('href', '#' + uniqueId);
                                        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + uniqueId);
                                    }
                                }
                            } catch (error) { console.warn('[SnapDOM] embedSVG fetch failed for sprite:', error.message); }
                        }
                    }
                    const clonedNode = await cloneNode(node, options.filter);
                    await embedSVG(clonedNode);
                    [{ selector: '.mwi-equipment-slot.filled', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-ability-item:not(.empty)', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-consumable-item:not(.empty)', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-house-item:not(.empty)', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-stat-item', bgColor: 'rgba(255, 255, 255, 0.03)' }, { selector: '.mwi-consumables-container, .mwi-abilities-grid, .mwi-equipment-grid, .mwi-house-grid', bgColor: 'rgba(0, 0, 0, 0.2)' }, { selector: '.mwi-stats-grid', bgColor: 'rgba(0, 0, 0, 0.06)' }].forEach(fix => {
                        clonedNode.querySelectorAll(fix.selector).forEach(el => {
                            if (!el.style.backgroundColor || el.style.backgroundColor === 'transparent') { el.style.backgroundColor = fix.bgColor; el.style.backdropFilter = 'blur(20px) saturate(180%)'; el.style.webkitBackdropFilter = 'blur(20px) saturate(180%)'; }
                        });
                    });
                    const xmlns = 'http://www.w3.org/2000/svg';
                    const svg = document.createElementNS(xmlns, 'svg');
                    svg.setAttribute('width', width * scale); svg.setAttribute('height', height * scale);
                    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                    svg.setAttribute('color-interpolation', 'sRGB'); svg.setAttribute('color-interpolation-filters', 'sRGB');
                    svg.style.backgroundColor = bgcolor;
                    const foreignObject = document.createElementNS(xmlns, 'foreignObject');
                    foreignObject.setAttribute('width', '100%'); foreignObject.setAttribute('height', '100%');
                    foreignObject.setAttribute('x', '0'); foreignObject.setAttribute('y', '0');
                    let bgImageUrl = null;
                    const cardElement = clonedNode.querySelector('.mwi-character-card') || clonedNode;
                    if (cardElement && cardElement.style.backgroundImage) {
                        const match = cardElement.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
                        if (match && match[1]) bgImageUrl = match[1];
                    }
                    foreignObject.appendChild(clonedNode); svg.appendChild(foreignObject);
                    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
                    return {
                        async toCanvas() {
                            return new Promise((resolve, reject) => {
                                const canvas = document.createElement('canvas');
                                canvas.width = width * scale; canvas.height = height * scale;
                                const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
                                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                                const drawSvgContent = () => {
                                    const svgImg = new Image();
                                    svgImg.crossOrigin = 'anonymous'; svgImg.decoding = 'sync';
                                    svgImg.onload = () => { ctx.drawImage(svgImg, 0, 0); resolve(canvas); };
                                    svgImg.onerror = () => reject(new Error('Failed to load SVG image'));
                                    svgImg.src = dataUrl;
                                };
                                if (bgImageUrl) {
                                    const bgImg = new Image();
                                    bgImg.crossOrigin = 'anonymous';
                                    bgImg.onload = () => { ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height); drawSvgContent(); };
                                    bgImg.onerror = () => { drawSvgContent(); };
                                    bgImg.src = bgImageUrl;
                                } else {
                                    if (bgcolor && bgcolor !== 'transparent') { ctx.fillStyle = bgcolor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
                                    drawSvgContent();
                                }
                            });
                        }
                    };
                };
            }
            return { async toCanvas(element, options = {}) { initSnapDOM(); const result = await global.snapdom(element, options); return result.toCanvas(); } };
        })();
        global.SnapDOM = SnapDOM;
    })(typeof window !== 'undefined' ? window : this);
    
    (function(global) {
        'use strict';
        const SVGTool = {
            sprites: { items: null, skills: null, abilities: null, misc: null, chat_icons: null, avatars: null, avatar_outfits: null },
            initialized: false,
            init() {
                if (this.initialized) return;
                try {
                    const rawAssets = localStorage.getItem('preloadedAssets');
                    if (rawAssets) {
                        const preloadedAssets = JSON.parse(rawAssets);
                        ['items', 'skills', 'abilities', 'misc', 'chat_icons', 'avatars', 'avatar_outfits'].forEach(type => {
                            const key = `${type}_sprite`;
                            if (preloadedAssets[key]) this.sprites[type] = preloadedAssets[key].split('?')[0];
                        });
                    }
                } catch (e) {}
                const missingSprites = Object.keys(this.sprites).filter(k => !this.sprites[k]);
                if (missingSprites.length > 0) {
                    document.querySelectorAll("svg use[href*='sprite']").forEach(useEl => {
                        const href = useEl.getAttribute("href") || useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                        if (!href) return;
                        const [filePath] = href.split('#');
                        missingSprites.forEach(type => { if (filePath.includes(`${type}_sprite`) && !this.sprites[type]) this.sprites[type] = filePath; });
                    });
                }
                const defaults = { items: '/static/media/items_sprite.6d12eb9d.svg', skills: '/static/media/skills_sprite.3bb4d936.svg', abilities: '/static/media/abilities_sprite.fdd1b4de.svg', misc: '/static/media/misc_sprite.6fa5e97c.svg', chat_icons: '/static/media/chat_icons_sprite.f870cd32.svg', avatars: '/static/media/avatars_sprite.23c6df2d.svg', avatar_outfits: '/static/media/avatar_outfits_sprite.fe228a76.svg' };
                Object.keys(defaults).forEach(key => { if (!this.sprites[key]) this.sprites[key] = defaults[key]; });
                this.initialized = true;
            },
            getSpriteURL(type = 'items') { if (!this.initialized) this.init(); return this.sprites[type] || this.sprites.items; },
            refreshFromDOM() {
                try {
                    const rawAssets = localStorage.getItem('preloadedAssets');
                    if (rawAssets) {
                        const preloadedAssets = JSON.parse(rawAssets);
                        ['items', 'skills', 'abilities', 'misc', 'chat_icons', 'avatars', 'avatar_outfits'].forEach(type => {
                            const key = `${type}_sprite`;
                            if (preloadedAssets[key]) {
                                const url = preloadedAssets[key].split('?')[0];
                                if (url && this.sprites[type] !== url) this.sprites[type] = url;
                            }
                        });
                    }
                } catch (e) {}
                document.querySelectorAll("svg use[href*='sprite']").forEach(useEl => {
                    const href = useEl.getAttribute("href") || useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    if (!href) return;
                    const [filePath] = href.split('#');
                    ['items', 'skills', 'abilities', 'misc', 'chat_icons', 'avatars', 'avatar_outfits'].forEach(type => {
                        if (filePath.includes(`${type}_sprite`) && this.sprites[type] !== filePath) this.sprites[type] = filePath;
                    });
                });
            },
            createIcon(hrid, width = 40, height = 40, type = 'items') {
                const iconId = hrid.split('/').pop();
                const spriteURL = this.getSpriteURL(type);
                if (!spriteURL) return `<div style="width:${width}px;height:${height}px;background:rgba(255,255,255,0.1);border-radius:4px;">?</div>`;
                return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${width}"><use href="${spriteURL}#${iconId}"></use></svg>`;
            }
        };
        global.SVGTool = SVGTool;
    })(typeof window !== 'undefined' ? window : this);
    
    (function() {
        'use strict';
        
        try {
            const cardStyles = GM_getResourceText('cardStyles');
            if (cardStyles) {
                GM_addStyle(cardStyles);
            }
        } catch (e) {
        }
        
        const SITE_URL = 'https://papiyas.chat';
        const IntervalManager = {
            intervals: new Map(),
            isPageVisible: true,
            visibilityHandler: null,
            
            init() {
                if (this.visibilityHandler) return;
                this.visibilityHandler = () => {
                    this.isPageVisible = !document.hidden;
                    if (this.isPageVisible) {
                        this.resumeAll();
                    } else {
                        this.pauseAll();
                    }
                };
                document.addEventListener('visibilitychange', this.visibilityHandler);
            },
            
            register(name, callback, interval) {
                this.init();
                if (this.intervals.has(name)) {
                    this.clear(name);
                }
                const id = setInterval(() => {
                    if (this.isPageVisible) {
                        callback();
                    }
                }, interval);
                this.intervals.set(name, { id, callback, interval });
                return id;
            },
            
            clear(name) {
                const entry = this.intervals.get(name);
                if (entry) {
                    clearInterval(entry.id);
                    this.intervals.delete(name);
                }
            },
            
            pauseAll() {
            },
            
            resumeAll() {
            },
            
            clearAll() {
                this.intervals.forEach((entry, name) => {
                    clearInterval(entry.id);
                });
                this.intervals.clear();
                if (this.visibilityHandler) {
                    document.removeEventListener('visibilitychange', this.visibilityHandler);
                    this.visibilityHandler = null;
                }
            }
        };
        const currentHostname = window.location.hostname;
        const isSimulatorPage = document.URL.includes("shykai.github.io/MWICombatSimulatorTest") ||
                                document.URL.includes("amvoidguy.github.io/MWICombatSimulatorTest");
        
        const cardLinkFillStatus = {
            submitFormFilled: false,
            editFormFilled: false,
            submitFormExists: false,
            editFormExists: false,
            currentTimestamp: 0,
            checkFormExistence: function() {
                this.submitFormExists = !!document.querySelector('#cardLink');
                this.editFormExists = !!document.querySelector('#editCardLink');
            },
            markFilled: function(formType, timestamp) {
                if (timestamp !== this.currentTimestamp) {
                    this.submitFormFilled = false;
                    this.editFormFilled = false;
                    this.currentTimestamp = timestamp;
                }
                this.checkFormExistence();
                if (formType === 'submit') {
                    this.submitFormFilled = true;
                } else if (formType === 'edit') {
                    this.editFormFilled = true;
                }
                const submitDone = !this.submitFormExists || this.submitFormFilled;
                const editDone = !this.editFormExists || this.editFormFilled;
                if (submitDone && editDone) {
                    GM_setValue('mwi_card_image_url', '');
                    GM_setValue('mwi_card_image_timestamp', 0);
                    GM_setValue('mwi_upload_progress', 0);
                    GM_setValue('mwi_upload_status', '');
                    this.submitFormFilled = false;
                    this.editFormFilled = false;
                    this.currentTimestamp = 0;
                }
            },
            reset: function() {
                this.submitFormFilled = false;
                this.editFormFilled = false;
                this.submitFormExists = false;
                this.editFormExists = false;
                this.currentTimestamp = 0;
            }
        };
        function enableClipboardPermissionsIfSupported(iframeElement) {
            if (!iframeElement) {
                return;
            }
            try {
                const userAgent = (navigator.userAgent || '').toLowerCase();
                const isChromiumFamily = /chrome|edg|opr|brave|vivaldi/.test(userAgent) && !userAgent.includes('firefox');
                if (!isChromiumFamily) {
                    return;
                }
                iframeElement.setAttribute('allow', 'clipboard-read; clipboard-write');
            } catch (error) {
            }
        }
        if (currentHostname === 'papiyas.chat') {
            try {
                localStorage.setItem('mwi_tm_version', GM_info.script.version);
            } catch (e) {}
            if (window.self !== window.top) {
                initPapiyasChatFeatures();
            }
            return;
        }
        try {
            GM_setValue('mwi_tm_version', GM_info.script.version);
        } catch (e) {}
    
        if (!isSimulatorPage) {
        (function initNavigationLink() {
            window.detectLanguage = function() {
                const lang = localStorage.getItem("i18nextLng") || document.documentElement.lang || navigator.language || 'en';
                return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
            };
            
            function findSocko(container) {
                return [...container.children].find(el => 
                    el.textContent.includes('socko') || el.textContent.includes('战斗榜')
                );
            }
            
            function createLink() {
                const lang = window.detectLanguage();
                const div = document.createElement('div');
                div.className = 'NavigationBar_minorNavigationLink__31K7Y mwi-talent-market-link';
                div.style.cssText = 'cursor: pointer; color: #FFA500;';
                div.textContent = lang === 'zh' ? '人才市场 SHIIN' : 'Talent Market SHIIN';
                div.addEventListener('click', () => {
                    if (typeof window.toggleTalentMarketModal === 'function') {
                        window.toggleTalentMarketModal();
                    }
                });
                return div;
            }
            
            function insertOrRepositionLink(forceFallback = false) {
                const container = document.querySelector('.NavigationBar_minorNavigationLinks__dbxh7');
                if (!container) return false;
                
                const socko = findSocko(container);
                let link = document.querySelector('.mwi-talent-market-link');
                
                if (link) {
                    if (socko && socko.nextElementSibling !== link) {
                        socko.insertAdjacentElement('afterend', link);
                    }
                    return true;
                }
                
                if (socko) {
                    socko.insertAdjacentElement('afterend', createLink());
                    return true;
                }
                
                if (forceFallback) {
                    container.insertAdjacentElement('afterbegin', createLink());
                    return true;
                }
                
                return false;
            }
            
            let attempts = 0;
            const maxAttempts = 15;
            const checkInterval = setInterval(() => {
                attempts++;
                const isLastAttempt = attempts >= maxAttempts;
                if (insertOrRepositionLink(isLastAttempt) || isLastAttempt) {
                    clearInterval(checkInterval);
                }
            }, 200);
            
            let throttleTimer = null;
            let initialCheckDone = false;
            const observer = new MutationObserver(() => {
                if (throttleTimer) return;
                throttleTimer = setTimeout(() => {
                    throttleTimer = null;
                    const linkExists = !!document.querySelector('.mwi-talent-market-link');
                    insertOrRepositionLink(!linkExists && initialCheckDone);
                }, 200);
            });
            setTimeout(() => { initialCheckDone = true; }, 3000);
            
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    observer.observe(document.body, { childList: true, subtree: true });
                });
            }
        })();
        } // end if (!isSimulatorPage)
        
        const CARD_BACKGROUND_IMAGE = 'https://tupian.li/images/2026/01/06/695c6aa763f87.png';
        const BackgroundImagePreloader = {
            cachedDataURL: null,
            isLoading: false,
            loadPromise: null,
            async preload() {
                if (this.cachedDataURL) {
                    return this.cachedDataURL;
                }
                if (this.isLoading) {
                    return this.loadPromise;
                }
                this.isLoading = true;
                this.loadPromise = this._loadImage();
                try {
                    this.cachedDataURL = await this.loadPromise;
                    return this.cachedDataURL;
                } catch (error) {
                    this.cachedDataURL = null;
                    throw error;
                } finally {
                    this.isLoading = false;
                    this.loadPromise = null;
                }
            },
            async _loadImage() {
                if (!CARD_BACKGROUND_IMAGE || CARD_BACKGROUND_IMAGE.trim() === '') {
                    throw new Error('Background image URL not configured');
                }
                const blob = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: CARD_BACKGROUND_IMAGE,
                        responseType: 'blob',
                        onload: (response) => {
                            if (response.status >= 200 && response.status < 300) {
                                resolve(response.response);
                            } else {
                                reject(new Error(`HTTP ${response.status}`));
                            }
                        },
                        onerror: () => reject(new Error('Network error loading background image')),
                        ontimeout: () => reject(new Error('Timeout loading background image'))
                    });
                });
                const img = await new Promise((resolve, reject) => {
                    const imgEl = new Image();
                    imgEl.crossOrigin = 'anonymous';
                    imgEl.decoding = 'sync';
                    const blobUrl = URL.createObjectURL(blob);
                    imgEl.onload = () => { URL.revokeObjectURL(blobUrl); resolve(imgEl); };
                    imgEl.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Failed to decode background image')); };
                    imgEl.src = blobUrl;
                });
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb', willReadFrequently: false });
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(img.src);
                return canvas.toDataURL('image/png', 1.0);
            },
            getCached() {
                return this.cachedDataURL;
            },
            clear() {
                this.cachedDataURL = null;
                this.isLoading = false;
                this.loadPromise = null;
            }
        };
        if (currentHostname !== 'papiyas.chat' && !isSimulatorPage) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    BackgroundImagePreloader.preload().catch(() => {});
                });
            } else {
                BackgroundImagePreloader.preload().catch(() => {});
            }
        }
        
        function initCardUploadMonitor() {
            let lastProcessedTimestamp = 0;
            let isUploading = false;
            
            const monitorCallback = async () => {
                if (isUploading) {
                    return;
                }
                
                const requestTimestamp = GM_getValue('mwi_card_upload_request', 0);
                
                if (requestTimestamp && requestTimestamp !== lastProcessedTimestamp) {
                    lastProcessedTimestamp = requestTimestamp;
                    isUploading = true;
                    
                    GM_setValue('mwi_card_upload_request', 0);
                    
                    try {
                        let cardElement = document.getElementById('mwi-card-content');
                        
                        if (!cardElement) {
                            if (typeof generateCharacterCard === 'function') {
                                await generateCharacterCard();
                                
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                
                                cardElement = document.getElementById('mwi-card-content');
                                if (!cardElement) {
                                    throw new Error('名片生成后仍未找到DOM元素');
                                }
                            } else {
                                throw new Error('generateCharacterCard函数不存在');
                            }
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                        
                        const imageUrl = await generateAndUploadCard();
                        
                        const responseData = {
                            type: 'MWI_UPLOAD_CARD_RESPONSE',
                            success: true,
                            imageUrl: imageUrl
                        };
                        
                        window.postMessage(responseData, '*');
                        
                        const iframes = document.querySelectorAll('iframe');
                        iframes.forEach((iframe, index) => {
                            try {
                                iframe.contentWindow.postMessage(responseData, '*');
                            } catch (e) {}
                        });
                        
                        if (window.parent && window.parent !== window) {
                            try {
                                window.parent.postMessage(responseData, '*');
                            } catch (e) {}
                        }
                        
                    } catch (error) {
                        const errorData = {
                            type: 'MWI_UPLOAD_CARD_RESPONSE',
                            success: false,
                            error: error.message
                        };
                        window.postMessage(errorData, '*');
                        
                        const iframes = document.querySelectorAll('iframe');
                        iframes.forEach((iframe) => {
                            try {
                                iframe.contentWindow.postMessage(errorData, '*');
                            } catch (e) {}
                        });
                    } finally {
                        isUploading = false;
                    }
                }
            };
            
            IntervalManager.register('cardUploadMonitor', monitorCallback, 500);
        }
        function initPapiyasChatFeatures() {
            try {
                const btName = GM_getValue('bt_auth_name', '');
                if (btName) localStorage.setItem('bt_auth_name', btName);
                localStorage.setItem('mwi_tm_version', GM_info.script.version);
            } catch (e) { /* silent */ }
            initFormImportListener();
            initSimulatorDataAutoFill();
            initCardImageUrlAutoFill();
            initEditFormAutoFill();
            initEditCardImageUrlAutoFill();
            initGuildFormAutoFill();
            initEditGuildFormAutoFill();
        }
        function initCardImageUrlAutoFill() {
            let lastProcessedTimestamp = 0;
            function fillCardLink(cardImageUrl, timestamp) {
                if (typeof window.__fillCardLink__ === 'function') {
                    window.__fillCardLink__(cardImageUrl);
                }
                lastProcessedTimestamp = timestamp;
                cardLinkFillStatus.markFilled('submit', timestamp);
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
            }
            function checkAndFillCardLink() {
                try {
                    const cardImageUrl = GM_getValue('mwi_card_image_url', '');
                    const timestamp = GM_getValue('mwi_card_image_timestamp', 0);
                    
                    if (cardImageUrl && timestamp && timestamp !== lastProcessedTimestamp) {
                        fillCardLink(cardImageUrl, timestamp);
                        return;
                    }
                } catch (error) {
                }
            }
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'MWI_UPLOAD_CARD_RESPONSE' && event.data.success && event.data.imageUrl) {
                    const timestamp = Date.now();
                    if (timestamp !== lastProcessedTimestamp) {
                        fillCardLink(event.data.imageUrl, timestamp);
                    }
                }
            });
            IntervalManager.register('cardImageUrlAutoFill', checkAndFillCardLink, 500);
            setTimeout(checkAndFillCardLink, 100);
        }
    
        
        function initFormImportListener() {
            function getUserIdFromPage() {
                const pageType = detectPageType();
                let userId = '';
                if (pageType === 'guild') {
                    const submitInput = document.querySelector('#guildLeaderId');
                    const editInput = document.querySelector('#editGuildLeaderId');
                    userId = submitInput?.value?.trim() || editInput?.value?.trim() || '';
                } else {
                    const submitInput = document.querySelector('#playerId');
                    const editInput = document.querySelector('#editPlayerId');
                    userId = submitInput?.value?.trim() || editInput?.value?.trim() || '';
                }
                return userId;
            }
            function detectPageType() {
                const url = window.location.pathname;
                if (url.includes('/guild')) return 'guild';
                if (url.includes('/IC')) return 'ic';
                return 'standard';
            }
            async function getGameData(pageType) {
                const simulatorDataStr = GM_getValue('mwi_simulator_data', null);
                
                if (simulatorDataStr) {
                    try {
                        const simulatorData = JSON.parse(simulatorDataStr);
                        return simulatorData;
                    } catch (e) {}
                }
                
                const baseData = {
                    battleLevel: '123.456',
                    combatLevel: '78.901',
                    mainAttributeLevel: '45.678',
                    characterTotalLevel: '567.890'
                };
                if (pageType === 'guild') {
                    return {
                        battleLevel: baseData.battleLevel,
                        combatLevel: baseData.combatLevel,
                        mainAttributeLevel: baseData.mainAttributeLevel,
                        characterTotalLevel: baseData.characterTotalLevel
                    };
                } else {
                    return baseData;
                }
            }
            async function fillFormData(data, pageType) {
                const commonFields = {
                    'battle-level-input': data.battleLevel,
                    'combat-level-input': data.combatLevel,
                    'main-attribute-level-input': data.mainAttributeLevel,
                    'character-total-level-input': data.characterTotalLevel
                };
                const guildFields = {
                    'guild-battle-level': data.battleLevel,
                    'guild-combat-level': data.combatLevel,
                    'guild-main-attribute-level': data.mainAttributeLevel,
                    'guild-character-total-level': data.characterTotalLevel
                };
                const fieldsToFill = pageType === 'guild' ? 
                    { ...commonFields, ...guildFields } : 
                    commonFields;
                for (const [id, value] of Object.entries(fieldsToFill)) {
                    const selectors = [
                        `#${id}`,
                        `input[id="${id}"]`,
                        `input[name="${id}"]`,
                        `[data-field="${id}"]`
                    ];
                    for (const selector of selectors) {
                        const input = document.querySelector(selector);
                        if (input) {
                            input.removeAttribute('readonly');
                            input.removeAttribute('disabled');
                            input.value = value;
                            const events = ['input', 'change', 'blur', 'keyup'];
                            events.forEach(eventType => {
                                input.dispatchEvent(new Event(eventType, { bubbles: true }));
                            });
                            break;
                        }
                    }
                }
            }
            function listenImportButton() {
                if (window._MWI_IMPORT_LISTENER_ATTACHED) {
                    return;
                }
                
                const importHandler = async (e) => {
                    
                    try {
                        const pageType = detectPageType();
                        
                        const gameData = await getGameData(pageType);
                        
                        await fillFormData(gameData, pageType);
                        
                        document.dispatchEvent(new CustomEvent('plugin-import-response', {
                            detail: {
                                success: true,
                                data: gameData,
                                pageType: pageType
                            }
                        }));
                        
                        const isInGuildModal = !!(document.querySelector('.guild-submit-modal-content') || document.querySelector('.edit-guild-modal-content'));
                        
                        if (!isInGuildModal) {
                            GM_setValue('mwi_card_upload_request', Date.now());
                        }
                    } catch (error) {
                        document.dispatchEvent(new CustomEvent('plugin-import-response', {
                            detail: {
                                success: false,
                                error: error.message
                            }
                        }));
                    }
                };
                
                document.addEventListener('plugin-import-request', importHandler);
                window._MWI_IMPORT_LISTENER_ATTACHED = true;
            }
            listenImportButton();
        }
        
        async function generateAndUploadCard() {
            return await autoUploadCard();
        }
        
        window.addEventListener('message', async (event) => {
            if (event.data && event.data.type === 'MWI_GENERATE_CARD_REQUEST') {
                try {
                    if (typeof generateCharacterCard === 'function') {
                        await generateCharacterCard();
                    } else {
                        throw new Error('generateCharacterCard函数未找到');
                    }
                } catch (error) {
                }
            }
            if (event.data && event.data.type === 'MWI_UPLOAD_CARD_REQUEST') {
                try {
                    const imageUrl = await generateAndUploadCard();
                    
                    const responseData = {
                        type: 'MWI_UPLOAD_CARD_RESPONSE',
                        success: true,
                        imageUrl: imageUrl
                    };
                    
                    if (event.source) {
                        event.source.postMessage(responseData, event.origin);
                    }
                    
                    window.postMessage(responseData, '*');
                    
                } catch (error) {
                    const errorData = {
                        type: 'MWI_UPLOAD_CARD_RESPONSE',
                        success: false,
                        error: error.message
                    };
                    
                    if (event.source) {
                        event.source.postMessage(errorData, event.origin);
                    }
                    window.postMessage(errorData, '*');
                }
            }
            
            if (event.data && event.data.type === 'MODAL_OPENED') {
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
            }
            
            if (event.data && event.data.type === 'MODAL_CLOSED') {
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
                GM_setValue('mwi_card_upload_request', 0);
            }
        });
        function initSimulatorDataAutoFill() {
            function attachImportListener() {
                const importBtnSelectors = [
                    '#submitForm > div:nth-child(1) > button:nth-child(1)',
                    '#submitForm button:first-child'
                ];
                let importBtn = null;
                for (const selector of importBtnSelectors) {
                    importBtn = document.querySelector(selector);
                    if (importBtn) {
                        break;
                    }
                }
                if (!importBtn) {
                    const allButtons = document.querySelectorAll('#submitForm button');
                    for (const btn of allButtons) {
                        const text = btn.textContent?.trim() || '';
                        if (text.includes('导入数据') || text.includes('Import Data')) {
                            importBtn = btn;
                            break;
                        }
                    }
                }
                if (!importBtn) {
                    return false;
                }
                if (importBtn.dataset.simulatorListenerAttached) {
                    importBtn.removeEventListener('click', importBtn._simulatorClickHandler);
                }
                const clickHandler = async function(e) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const simDataInput = document.querySelector('#simData');
                        if (!simDataInput) {
                            return;
                        }
                        let simulatorData = null;
                        try {
                            const storedData = GM_getValue('mwi_simulator_data', '');
                            if (storedData) {
                                simulatorData = JSON.parse(storedData);
                            }
                        } catch (e) {
                        }
                        if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                            const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                            if (typeof getSimData === 'function') {
                                simulatorData = getSimData();
                            }
                        }
                        if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                            simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                        }
                        if (!simulatorData) {
                            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                            const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                            alert(message);
                            return;
                        }
                        const dataString = JSON.stringify(simulatorData, null, 2);
                        simDataInput.value = dataString;
                        simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                        simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                        await new Promise(resolve => setTimeout(resolve, 500));
                        let targetWindow = null;
                        if (window.opener && !window.opener.closed) {
                            targetWindow = window.opener;
                        } else if (window.parent && window.parent !== window) {
                            targetWindow = window.parent;
                        } else if (window.top && window.top !== window) {
                            targetWindow = window.top;
                        }
                        if (targetWindow) {
                            targetWindow.postMessage({
                                type: 'MWI_GENERATE_CARD_REQUEST',
                                timestamp: Date.now()
                            }, '*');
                        } else if (window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.generateCard === 'function') {
                            await window.MWI_INTEGRATED.generateCard();
                        }
                    } catch (error) {
                        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                        const message = lang === 'zh' ? '填写数据失败: ' + error.message : 'Failed to fill data: ' + error.message;
                        alert(message);
                    }
                };
                importBtn._simulatorClickHandler = clickHandler;
                importBtn.addEventListener('click', clickHandler);
                importBtn.dataset.simulatorListenerAttached = 'true';
                return true;
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        if (!attachImportListener()) {
                            const observer = new MutationObserver(() => {
                                if (attachImportListener()) {
                                    observer.disconnect();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                        }
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    if (!attachImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            }
        }
        function initEditFormAutoFill() {
            function attachEditImportListener() {
                const importBtnSelectors = [
                    '#editForm > div:nth-child(1) > button:nth-child(1)',
                    '#editForm button:first-child',
                    '#editForm .import-data-btn'
                ];
                let importBtn = null;
                for (const selector of importBtnSelectors) {
                    importBtn = document.querySelector(selector);
                    if (importBtn) {
                        break;
                    }
                }
                if (!importBtn) {
                    return false;
                }
                if (importBtn.dataset.editSimulatorListenerAttached) {
                    importBtn.removeEventListener('click', importBtn._editSimulatorClickHandler);
                }
                const clickHandler = async function(e) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const simDataInput = document.querySelector('#editSimData');
                        if (!simDataInput) {
                            return;
                        }
                        let simulatorData = null;
                        try {
                            const storedData = GM_getValue('mwi_simulator_data', '');
                            if (storedData) {
                                simulatorData = JSON.parse(storedData);
                            }
                        } catch (e) {
                        }
                        if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                            const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                            if (typeof getSimData === 'function') {
                                simulatorData = getSimData();
                            }
                        }
                        if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                            simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                        }
                        if (!simulatorData) {
                            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                            const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                            alert(message);
                            return;
                        }
                        const dataString = JSON.stringify(simulatorData, null, 2);
                        simDataInput.value = dataString;
                        simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                        simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                        await new Promise(resolve => setTimeout(resolve, 500));
                        let targetWindow = null;
                        if (window.opener && !window.opener.closed) {
                            targetWindow = window.opener;
                        } else if (window.parent && window.parent !== window) {
                            targetWindow = window.parent;
                        } else if (window.top && window.top !== window) {
                            targetWindow = window.top;
                        }
                        if (targetWindow) {
                            targetWindow.postMessage({
                                type: 'MWI_GENERATE_CARD_REQUEST',
                                timestamp: Date.now()
                            }, '*');
                        } else if (window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.generateCard === 'function') {
                            await window.MWI_INTEGRATED.generateCard();
                        }
                    } catch (error) {
                        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                        const message = lang === 'zh' ? '填写数据失败: ' + error.message : 'Failed to fill data: ' + error.message;
                        alert(message);
                    }
                };
                importBtn._editSimulatorClickHandler = clickHandler;
                importBtn.addEventListener('click', clickHandler);
                importBtn.dataset.editSimulatorListenerAttached = 'true';
                return true;
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        if (!attachEditImportListener()) {
                            const observer = new MutationObserver(() => {
                                if (attachEditImportListener()) {
                                    observer.disconnect();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                        }
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    if (!attachEditImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachEditImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            }
        }
        function initGuildFormAutoFill() {
            function attachGuildImportListener() {
                const importBtnSelectors = [
                    '#guildForm > div:nth-child(1) > button:nth-child(1)',
                    '#guildForm button:first-child',
                    '#guildForm .import-data-btn'
                ];
                let importBtn = null;
                for (const selector of importBtnSelectors) {
                    importBtn = document.querySelector(selector);
                    if (importBtn) {
                        break;
                    }
                }
                if (!importBtn) {
                    return false;
                }
                if (importBtn.dataset.guildSimulatorListenerAttached) {
                    importBtn.removeEventListener('click', importBtn._guildSimulatorClickHandler);
                }
                const clickHandler = async function(e) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const simDataInput = document.querySelector('#guildSimData');
                        if (!simDataInput) {
                            return;
                        }
                        let simulatorData = null;
                        try {
                            const storedData = GM_getValue('mwi_simulator_data', '');
                            if (storedData) {
                                simulatorData = JSON.parse(storedData);
                            }
                        } catch (e) {
                        }
                        if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                            const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                            if (typeof getSimData === 'function') {
                                simulatorData = getSimData();
                            }
                        }
                        if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                            simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                        }
                        if (!simulatorData) {
                            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                            const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                            alert(message);
                            return;
                        }
                        const dataString = JSON.stringify(simulatorData, null, 2);
                        simDataInput.value = dataString;
                        simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                        simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (error) {
                        alert('填写数据失败: ' + error.message);
                    }
                };
                importBtn._guildSimulatorClickHandler = clickHandler;
                importBtn.addEventListener('click', clickHandler);
                importBtn.dataset.guildSimulatorListenerAttached = 'true';
                return true;
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        if (!attachGuildImportListener()) {
                            const observer = new MutationObserver(() => {
                                if (attachGuildImportListener()) {
                                    observer.disconnect();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                        }
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    if (!attachGuildImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachGuildImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            }
        }
        function initEditGuildFormAutoFill() {
            function attachEditGuildImportListener() {
                const importBtnSelectors = [
                    '#editGuildForm > div:nth-child(1) > button:nth-child(1)',
                    '#editGuildForm button:first-child',
                    '#editGuildForm .import-data-btn'
                ];
                let importBtn = null;
                for (const selector of importBtnSelectors) {
                    importBtn = document.querySelector(selector);
                    if (importBtn) {
                        break;
                    }
                }
                if (!importBtn) {
                    return false;
                }
                if (importBtn.dataset.editGuildSimulatorListenerAttached) {
                    importBtn.removeEventListener('click', importBtn._editGuildSimulatorClickHandler);
                }
                const clickHandler = async function(e) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const simDataInput = document.querySelector('#editGuildSimData');
                        if (!simDataInput) {
                            return;
                        }
                        let simulatorData = null;
                        try {
                            const storedData = GM_getValue('mwi_simulator_data', '');
                            if (storedData) {
                                simulatorData = JSON.parse(storedData);
                            }
                        } catch (e) {
                        }
                        if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                            const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                            if (typeof getSimData === 'function') {
                                simulatorData = getSimData();
                            }
                        }
                        if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                            simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                        }
                        if (!simulatorData) {
                            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                            const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                            alert(message);
                            return;
                        }
                        const dataString = JSON.stringify(simulatorData, null, 2);
                        simDataInput.value = dataString;
                        simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                        simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (error) {
                        alert('填写数据失败: ' + error.message);
                    }
                };
                importBtn._editGuildSimulatorClickHandler = clickHandler;
                importBtn.addEventListener('click', clickHandler);
                importBtn.dataset.editGuildSimulatorListenerAttached = 'true';
                return true;
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        if (!attachEditGuildImportListener()) {
                            const observer = new MutationObserver(() => {
                                if (attachEditGuildImportListener()) {
                                    observer.disconnect();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                        }
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    if (!attachEditGuildImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachEditGuildImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            }
        }
        function initEditCardImageUrlAutoFill() {
            let lastProcessedTimestamp = 0;
            function fillEditCardLink(cardImageUrl, timestamp) {
                if (typeof window.__fillCardLink__ === 'function') {
                    window.__fillCardLink__(cardImageUrl);
                }
                lastProcessedTimestamp = timestamp;
                cardLinkFillStatus.markFilled('edit', timestamp);
            }
            function checkAndFillEditCardLink() {
                try {
                    const cardImageUrl = GM_getValue('mwi_card_image_url', '');
                    const timestamp = GM_getValue('mwi_card_image_timestamp', 0);
                    
                    if (cardImageUrl && timestamp && timestamp !== lastProcessedTimestamp) {
                        fillEditCardLink(cardImageUrl, timestamp);
                        return;
                    }
                } catch (error) {
                }
            }
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'MWI_UPLOAD_CARD_RESPONSE' && event.data.success && event.data.imageUrl) {
                    const timestamp = Date.now();
                    if (timestamp !== lastProcessedTimestamp) {
                        fillEditCardLink(event.data.imageUrl, timestamp);
                    }
                }
            });
            IntervalManager.register('editCardImageUrlAutoFill', checkAndFillEditCardLink, 500);
            setTimeout(checkAndFillEditCardLink, 100);
        }
        window.MWI_INTEGRATED = {
            generateCard: null,
            closeCard: null,
            getData: null,
            getSimulatorData: null,
            isDataLoaded: null,
            websocketData: null
        };
    
        const BuildScoreModule = (function() {
            function getMarketApiUrl() {
                if (window.location.href.includes("milkywayidle.com")) return "https://www.milkywayidle.com/game_data/marketplace.json";
                if (window.location.href.includes("milkywayidlecn.com")) return "https://www.milkywayidlecn.com/game_data/marketplace.json";
                var server = GM_getValue('mwi_game_server', 'en');
                return server === 'cn' ? "https://www.milkywayidlecn.com/game_data/marketplace.json" : "https://www.milkywayidle.com/game_data/marketplace.json";
            }
    
            let cachedMarketData = null;
            let marketDataTimestamp = 0;
            let levelExperienceTable = null;
            let itemDetailMap = null;
            let actionDetailMap = null;
            let houseRoomDetailMap = null;
    
            const enhanceParams = {
                enhancing_level: 125,
                laboratory_level: 6,
                enhancer_bonus: 5.42,
                glove_bonus: 12.9,
                tea_enhancing: false,
                tea_super_enhancing: false,
                tea_ultra_enhancing: true,
                tea_blessed: true,
                priceAskBidRatio: 1,
            };
    
            async function fetchMarketData(forceFetch = false) {
                const now = Date.now();
                if (!forceFetch && cachedMarketData && (now - marketDataTimestamp) < 3600000) {
                    return cachedMarketData;
                }
    
                try {
                    var gmMktJson = GM_getValue('mwi_market_data_for_sim', '');
                    var gmMktTs = GM_getValue('mwi_market_data_timestamp', '');
                    if (!forceFetch && gmMktJson && gmMktTs && (now - parseInt(gmMktTs)) < 3600000) {
                        cachedMarketData = JSON.parse(gmMktJson);
                        marketDataTimestamp = parseInt(gmMktTs);
                        return cachedMarketData;
                    }
                } catch (e) {}
    
                const cachedTimestamp = localStorage.getItem("MWITools_marketAPI_timestamp");
                const cachedJson = localStorage.getItem("MWITools_marketAPI_json");
                if (!forceFetch && cachedTimestamp && cachedJson && (now - parseInt(cachedTimestamp)) < 3600000) {
                    try {
                        cachedMarketData = JSON.parse(cachedJson);
                        marketDataTimestamp = parseInt(cachedTimestamp);
                        return cachedMarketData;
                    } catch (e) {}
                }
    
                const sendRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
                if (!sendRequest) return cachedMarketData;
    
                const response = await new Promise((resolve) => {
                    sendRequest({
                        url: getMarketApiUrl(),
                        method: "GET",
                        timeout: 5000,
                        onload: resolve,
                        onerror: () => resolve(null),
                        ontimeout: () => resolve(null)
                    });
                });
    
                if (response && response.status === 200) {
                    const jsonObj = JSON.parse(response.responseText);
                    if (jsonObj && jsonObj.marketData) {
                        jsonObj.marketData["/items/coin"] = { 0: { a: 1, b: 1 } };
                        jsonObj.marketData["/items/task_token"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/cowbell"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/small_treasure_chest"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/medium_treasure_chest"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/large_treasure_chest"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/basic_task_badge"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/advanced_task_badge"] = { 0: { a: 0, b: 0 } };
                        jsonObj.marketData["/items/expert_task_badge"] = { 0: { a: 0, b: 0 } };
                        cachedMarketData = jsonObj;
                        marketDataTimestamp = now;
                        localStorage.setItem("MWITools_marketAPI_timestamp", now.toString());
                        localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(jsonObj));
                        return jsonObj;
                    }
                }
                return cachedMarketData;
            }
    
            function initClientData(clientData) {
                if (clientData) {
                    levelExperienceTable = clientData.levelExperienceTable;
                    itemDetailMap = clientData.itemDetailMap;
                    actionDetailMap = clientData.actionDetailMap;
                    houseRoomDetailMap = clientData.houseRoomDetailMap;
                }
            }
    
            function getWeightedMarketPrice(marketPrices, ratio = 0.5) {
                if (!marketPrices || !marketPrices[0]) return 0;
                let ask = marketPrices[0].a || 0;
                let bid = marketPrices[0].b || 0;
                if (ask > 0 && bid < 0) bid = ask;
                if (bid > 0 && ask < 0) ask = bid;
                return ask * ratio + bid * (1 - ratio);
            }
    
            async function getHouseFullBuildPrice(house) {
                const marketData = await fetchMarketData();
                if (!marketData || !houseRoomDetailMap) return 0;
    
                const roomDetail = houseRoomDetailMap[house.houseRoomHrid];
                if (!roomDetail || !roomDetail.upgradeCostsMap) return 0;
    
                let cost = 0;
                for (let i = 1; i <= house.level; i++) {
                    const levelCosts = roomDetail.upgradeCostsMap[i];
                    if (levelCosts) {
                        for (const item of levelCosts) {
                            const prices = marketData.marketData[item.itemHrid];
                            if (prices && prices[0]) {
                                cost += item.count * getWeightedMarketPrice(prices);
                            }
                        }
                    }
                }
                return cost;
            }
    
            async function calculateAbilityScore(combatAbilities) {
                const marketData = await fetchMarketData();
                if (!marketData || !combatAbilities || !levelExperienceTable) return 0;
    
                const exp50Skills = ["poke", "scratch", "smack", "quick_shot", "water_strike", "fireball", "entangle", "minor_heal"];
    
                const getNeedBooksToLevel = (targetLevel, expPerBook) => {
                    const needExp = levelExperienceTable[targetLevel] || 0;
                    return parseFloat(((needExp / expPerBook) + 1).toFixed(1));
                };
    
                let totalPrice = 0;
                for (const ability of combatAbilities) {
                    if (!ability || !ability.abilityHrid) continue;
                    const expPerBook = exp50Skills.some(s => ability.abilityHrid.includes(s)) ? 50 : 500;
                    const numBooks = getNeedBooksToLevel(ability.level, expPerBook);
                    const itemHrid = ability.abilityHrid.replace("/abilities/", "/items/");
                    const prices = marketData.marketData[itemHrid];
                    if (prices && prices[0]) {
                        totalPrice += numBooks * getWeightedMarketPrice(prices);
                    }
                }
                return totalPrice / 1000000;
            }
    
            function Enhancelate(itemHrid, stopAt, protectAt) {
                const successRate = [50, 45, 45, 40, 40, 40, 35, 35, 35, 35, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
                const itemLevel = itemDetailMap?.[itemHrid]?.itemLevel || 1;
    
                const effectiveLevel = enhanceParams.enhancing_level +
                    (enhanceParams.tea_enhancing ? 3 : 0) +
                    (enhanceParams.tea_super_enhancing ? 6 : 0) +
                    (enhanceParams.tea_ultra_enhancing ? 8 : 0);
    
                let totalBonus;
                if (effectiveLevel >= itemLevel) {
                    totalBonus = 1 + (0.05 * (effectiveLevel + enhanceParams.laboratory_level - itemLevel) + enhanceParams.enhancer_bonus) / 100;
                } else {
                    totalBonus = 1 - 0.5 * (1 - effectiveLevel / itemLevel) + (0.05 * enhanceParams.laboratory_level + enhanceParams.enhancer_bonus) / 100;
                }
    
                let markov = math.zeros(20, 20);
                for (let i = 0; i < stopAt; i++) {
                    const successChance = (successRate[i] / 100.0) * totalBonus;
                    const destination = i >= protectAt ? i - 1 : 0;
                    if (enhanceParams.tea_blessed) {
                        markov.set([i, i + 2], successChance * 0.01);
                        markov.set([i, i + 1], successChance * 0.99);
                        markov.set([i, destination], 1 - successChance);
                    } else {
                        markov.set([i, i + 1], successChance);
                        markov.set([i, destination], 1.0 - successChance);
                    }
                }
                markov.set([stopAt, stopAt], 1.0);
    
                const Q = markov.subset(math.index(math.range(0, stopAt), math.range(0, stopAt)));
                const M = math.inv(math.subtract(math.identity(stopAt), Q));
                const attemptsArray = M.subset(math.index(math.range(0, 1), math.range(0, stopAt)));
                const attempts = math.flatten(math.row(attemptsArray, 0).valueOf()).reduce((a, b) => a + b, 0);
                const protectAttempts = M.subset(math.index(math.range(0, 1), math.range(protectAt, stopAt)));
                const protectArray = typeof protectAttempts === "number" ? [protectAttempts] : math.flatten(math.row(protectAttempts, 0).valueOf());
                const protects = protectArray.map((a, i) => a * markov.get([i + protectAt, i + protectAt - 1])).reduce((a, b) => a + b, 0);
    
                return { actions: attempts, protectCount: protects };
            }
    
            function getItemMarketPrice(hrid, marketData) {
                const priceData = marketData?.marketData?.[hrid];
                if (!priceData || !priceData[0]) return 0;
                let ask = priceData[0].a || 0;
                let bid = priceData[0].b || 0;
                if (ask > 0 && bid < 0) bid = ask;
                if (bid > 0 && ask < 0) ask = bid;
                return ask * enhanceParams.priceAskBidRatio + bid * (1 - enhanceParams.priceAskBidRatio);
            }
    
            function getActionHridFromItemName(name) {
                let newName = name.replace("Milk", "Cow");
                newName = newName.replace("Log", "Tree");
                newName = newName.replace("Cowing", "Milking");
                newName = newName.replace("Rainbow Cow", "Unicow");
                newName = newName.replace("Collector's Boots", "Collectors Boots");
                newName = newName.replace("Knight's Aegis", "Knights Aegis");
    
                if (!actionDetailMap) return null;
    
                for (const action of Object.values(actionDetailMap)) {
                    if (action.name === newName) {
                        return action.hrid;
                    }
                }
                return null;
            }
    
            function getBaseItemProductionCost(itemName, marketData) {
                const actionHrid = getActionHridFromItemName(itemName);
                if (!actionHrid || !actionDetailMap || !actionDetailMap[actionHrid]) {
                    return -1;
                }
    
                let totalPrice = 0;
                const inputItems = JSON.parse(JSON.stringify(actionDetailMap[actionHrid].inputItems || []));
    
                for (let item of inputItems) {
                    totalPrice += getItemMarketPrice(item.itemHrid, marketData) * item.count;
                }
                totalPrice *= 0.9;
    
                const upgradedFromItemHrid = actionDetailMap[actionHrid]?.upgradeItemHrid;
                if (upgradedFromItemHrid) {
                    totalPrice += getItemMarketPrice(upgradedFromItemHrid, marketData) * 1;
                }
    
                return totalPrice;
            }
    
            function getRealisticBaseItemPrice(hrid, marketData) {
                const itemDetail = itemDetailMap?.[hrid];
                if (!itemDetail) return 0;
    
                const productionCost = getBaseItemProductionCost(itemDetail.name, marketData);
                const priceData = marketData?.marketData?.[hrid];
                const ask = priceData?.[0]?.a || 0;
                const bid = priceData?.[0]?.b || 0;
    
                let result = 0;
    
                if (ask > 0) {
                    if (bid > 0) {
                        if (ask / bid > 1.3) {
                            result = Math.max(bid, productionCost);
                        } else {
                            result = ask;
                        }
                    } else {
                        if (productionCost > 0 && ask / productionCost > 1.3) {
                            result = productionCost;
                        } else {
                            result = Math.max(ask, productionCost);
                        }
                    }
                } else {
                    if (bid > 0) {
                        result = Math.max(bid, productionCost);
                    } else {
                        result = productionCost > 0 ? productionCost : 0;
                    }
                }
    
                return result;
            }
    
            function getCosts(hrid, marketData) {
                const detail = itemDetailMap?.[hrid];
                if (!detail) return null;
    
                const baseCost = getRealisticBaseItemPrice(hrid, marketData);
                const protectHrids = detail.protectionItemHrids 
                    ? [hrid, "/items/mirror_of_protection", ...detail.protectionItemHrids]
                    : [hrid, "/items/mirror_of_protection"];
    
                let minProtectCost = getRealisticBaseItemPrice(protectHrids[0], marketData);
                for (let i = 1; i < protectHrids.length; i++) {
                    const cost = getRealisticBaseItemPrice(protectHrids[i], marketData);
                    if (cost > 0 && (minProtectCost <= 0 || cost < minProtectCost)) {
                        minProtectCost = cost;
                    }
                }
    
                let perActionCost = 0;
                if (detail.enhancementCosts) {
                    for (const need of detail.enhancementCosts) {
                        const price = need.itemHrid.startsWith("/items/trainee_") ? 250000 : getRealisticBaseItemPrice(need.itemHrid, marketData);
                        perActionCost += price * need.count;
                    }
                }
    
                return { baseCost, minProtectCost, perActionCost };
            }
    
            async function findBestEnhanceStrat(itemHrid, stopAt) {
                const marketData = await fetchMarketData();
                if (!marketData || !itemDetailMap) return null;
    
                let best = null;
                for (let protectAt = 2; protectAt <= stopAt; protectAt++) {
                    const sim = Enhancelate(itemHrid, stopAt, protectAt);
                    const costs = getCosts(itemHrid, marketData);
                    if (!costs) continue;
                    const totalCost = costs.baseCost + costs.minProtectCost * sim.protectCount + costs.perActionCost * sim.actions;
                    if (!best || totalCost < best.totalCost) {
                        best = { protectAt, totalCost };
                    }
                }
                return best;
            }
    
            async function findBestEnhanceStratWithPhiMirror(itemHrid, stopAt) {
                const marketData = await fetchMarketData();
                if (!marketData || !itemDetailMap) return null;
    
                let best = await findBestEnhanceStrat(itemHrid, stopAt);
                if (!best) return best;
    
                const pMirrorHrid = "/items/philosophers_mirror";
                const pMirrorCost = getItemMarketPrice(pMirrorHrid, marketData);
                if (pMirrorCost <= 0) return best;
    
                if (stopAt <= 3) return best;
    
                const keyRefined = "_refined";
                const isRefined = itemHrid.includes(keyRefined);
                const baseItemHrid = isRefined ? itemHrid.replace(keyRefined, "") : itemHrid;
    
                const lowerBest = {};
                const lowestAt = 9;
                for (let i = lowestAt; i < stopAt; i++) {
                    lowerBest[i] = await findBestEnhanceStrat(baseItemHrid, i);
                }
    
                let refinedCost = 0;
                if (isRefined && actionDetailMap) {
                    const itemDetail = itemDetailMap[itemHrid];
                    if (itemDetail) {
                        const actionHrid = getActionHridFromItemName(itemDetail.name);
                        if (actionHrid && actionDetailMap[actionHrid]?.inputItems) {
                            for (const item of actionDetailMap[actionHrid].inputItems) {
                                refinedCost += getItemMarketPrice(item.itemHrid, marketData) * item.count;
                            }
                        }
                    }
                }
    
                const fibonacci = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181];
    
                for (let protectAt = lowestAt + 1; protectAt < stopAt; protectAt++) {
                    if (!lowerBest[protectAt] || !lowerBest[protectAt - 1]) continue;
    
                    const baseCount = fibonacci[stopAt - protectAt + 1];
                    const inputCount = fibonacci[stopAt - protectAt];
                    const protectCount = baseCount + inputCount - 1;
    
                    const totalCost = baseCount * lowerBest[protectAt].totalCost + inputCount * lowerBest[protectAt - 1].totalCost + pMirrorCost * protectCount + refinedCost;
    
                    if (totalCost < best.totalCost) {
                        best = { protectAt, totalCost };
                    }
                }
                return best;
            }
    
            async function calculateEquipmentScore(characterItems) {
                const marketData = await fetchMarketData();
                if (!marketData || !characterItems) return 0;
    
                let totalValue = 0;
                for (const item of characterItems) {
                    if (item.itemLocationHrid === "/item_locations/inventory") continue;
    
                    const enhanceLevel = item.enhancementLevel || 0;
                    const prices = marketData.marketData[item.itemHrid];
    
                    if (enhanceLevel > 1) {
                        const best = await findBestEnhanceStratWithPhiMirror(item.itemHrid, enhanceLevel);
                        if (best) {
                            var roundedCost = best.totalCost ? Math.round(best.totalCost) : 0;
                            totalValue += item.count * roundedCost;
                        }
                    } else if (prices && prices[0]) {
                        const ask = prices[0].a > 0 ? prices[0].a : 0;
                        const bid = prices[0].b > 0 ? prices[0].b : 0;
                        totalValue += item.count * (ask * 0.5 + bid * 0.5);
                    }
                }
                return totalValue / 1000000;
            }
    
            async function calculateBuildScore(characterData) {
                if (!characterData) return null;
    
                const battleHouses = ["dining_room", "library", "dojo", "gym", "armory", "archery_range", "mystical_study"];
                let houseScore = 0;
    
                if (characterData.characterHouseRoomMap) {
                    for (const key in characterData.characterHouseRoomMap) {
                        const house = characterData.characterHouseRoomMap[key];
                        if (battleHouses.some(h => house.houseRoomHrid.includes(h))) {
                            houseScore += await getHouseFullBuildPrice(house) / 1000000;
                        }
                    }
                }
    
                const combatAbilities = characterData.combatUnit?.combatAbilities || [];
                const abilityScore = await calculateAbilityScore(combatAbilities);
    
                const equipmentScore = await calculateEquipmentScore(characterData.characterItems || []);
    
                const totalScore = houseScore + abilityScore + equipmentScore;
    
                return {
                    total: parseFloat(totalScore.toFixed(1)),
                    house: parseFloat(houseScore.toFixed(1)),
                    ability: parseFloat(abilityScore.toFixed(1)),
                    equipment: parseFloat(equipmentScore.toFixed(1))
                };
            }
    
            return {
                initClientData,
                fetchMarketData,
                calculateBuildScore
            };
        })();
    
        const DataStore = {
            raw: null,
            characterSkills: null,
            characterItems: null,
            characterAbilities: null,
            combatUnit: null,
            characterHouseRoomMap: null,
            currentEquipmentMap: {},
            currentActions: [],
            combatSetup: null,
            actionTypeFoodSlotsMap: null,
            actionTypeDrinkSlotsMap: null,
            abilityCombatTriggersMap: null,
            consumableCombatTriggersMap: null,
            characterName: null,
            totalLevel: null,
            buildScore: null,
            weaponType: null,
            weaponTypeEN: null,
            combatLevel: null,
            guildName: null,
            guildLevel: null,
            guildMembers: null,
            characterId: null,
            nameColor: null,
            nameColorHrid: null,
            nameElementHTML: null,
            chatIconHrid: null,
            supporterBadgeHrid: null,
            profileIconHrid: null,
            avatarHrid: null,
            outfitHrid: null,
            itemDetailMap: null,
            actionDetailMap: null,
            abilityDetailMap: null,
            achievementDetailMap: null,
            achievementTierDetailMap: null,
            characterAchievements: null,
            isLoaded: false,
            hookInstalled: false,
            dataLoadedOnce: false,
            gameMode: null,
            partyInfo: null,
            sharableCharacterMap: null,
            wsConnection: null,
            pendingSentMessages: [],
            profileMap: {},
            profileRequestTemplate: null,
            suppressProfileUI: false
        };
    
        const WebSocketHook = {
            install() {
                if (DataStore.hookInstalled) {
                    return false;
                }
                
                this.hookSend();
                
                window.addEventListener('mwi_websocket_data', (e) => {
                    if (e.detail && e.detail.rawMessage) {
                        this.handleMessage(e.detail.rawMessage);
                    }
                });
                
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
                    if (!descriptor || !descriptor.get) {
                        DataStore.hookInstalled = true;
                        return false;
                    }
                    const originalGetter = descriptor.get;
                    
                    if (originalGetter._MWI_HOOKED || originalGetter._MWI_INTEGRATED_HOOKED) {
                        DataStore.hookInstalled = true;
                        return false;
                    }
                    
                    descriptor.get = function interceptData() {
                        const ws = this.currentTarget;
                        if (!(ws instanceof WebSocket)) {
                            return originalGetter.call(this);
                        }
                        const isMWIWebSocket = ws.url && (
                            ws.url.includes("api.milkywayidle.com/ws") ||
                            ws.url.includes("api-test.milkywayidle.com/ws") ||
                            ws.url.includes("api.milkywayidlecn.com/ws") ||
                            ws.url.includes("api-test.milkywayidlecn.com/ws")
                        );
                        if (!isMWIWebSocket) {
                            return originalGetter.call(this);
                        }
                        if (!DataStore.wsConnection || DataStore.wsConnection.readyState !== WebSocket.OPEN) {
                            DataStore.wsConnection = ws;
                        }
                        const rawMessage = originalGetter.call(this);
                        try {
                            Object.defineProperty(this, "data", {
                                value: rawMessage,
                                writable: false,
                                configurable: true
                            });
                        } catch (e) {}
                        
                        try {
                            window.dispatchEvent(new CustomEvent('mwi_websocket_data', {
                                detail: { rawMessage: rawMessage }
                            }));
                        } catch (e) {}
                        
                        WebSocketHook.handleMessage(rawMessage);
                        return rawMessage;
                    };
                    
                    descriptor.get._MWI_HOOKED = true;
                    descriptor.get._MWI_INTEGRATED_HOOKED = true;
                    
                    try {
                        Object.defineProperty(MessageEvent.prototype, "data", descriptor);
                    } catch (e) {
                        DataStore.hookInstalled = true;
                        return false;
                    }
                    DataStore.hookInstalled = true;
                    return true;
                } catch (error) {
                    DataStore.hookInstalled = true;
                    return false;
                }
            },
            hookSend() {
                const origSend = WebSocket.prototype.send;
                if (origSend._MWI_TM_SEND_HOOKED) return;
                WebSocket.prototype.send = function (data) {
                    const isMWI = this.url && (
                        this.url.includes("api.milkywayidle.com/ws") ||
                        this.url.includes("api-test.milkywayidle.com/ws") ||
                        this.url.includes("api.milkywayidlecn.com/ws") ||
                        this.url.includes("api-test.milkywayidlecn.com/ws")
                    );
                    if (isMWI) {
                        if (!DataStore.wsConnection || DataStore.wsConnection.readyState !== WebSocket.OPEN) {
                            DataStore.wsConnection = this;
                        }
                        try {
                            const msg = JSON.parse(data);
                            DataStore.pendingSentMessages.push({ msg, timestamp: Date.now() });
                            if (DataStore.pendingSentMessages.length > 20) {
                                DataStore.pendingSentMessages.shift();
                            }
                        } catch (e) { }
                    }
                    return origSend.call(this, data);
                };
                WebSocket.prototype.send._MWI_TM_SEND_HOOKED = true;
            },
            _simDataSaveTimer: null,
            _debouncedSaveSimData(delay) {
                const self = this;
                if (self._simDataSaveTimer) clearTimeout(self._simDataSaveTimer);
                self._simDataSaveTimer = setTimeout(() => {
                    self._simDataSaveTimer = null;
                    try {
                        const simulatorData = self.generateSimulatorData();
                        if (simulatorData) {
                            GM_setValue('mwi_simulator_data', JSON.stringify(simulatorData));
                        }
                    } catch (e) {}
                }, delay || 300);
            },
            handleMessage(rawMessage) {
                try {
                    const data = JSON.parse(rawMessage);
                    switch (data.type) {
                        case "init_character_data":
                            this.processCharacterData(data);
                            DataStore.dataLoadedOnce = true;
                            break;
                        case "init_client_data":
                            if (!DataStore.dataLoadedOnce) this.processClientData(data);
                            break;
                        case "items_updated":
                            this.updateItems(data);
                            break;
                        case "profile_shared":
                            this.storeProfile(data);
                            break;
                        case "actions_updated":
                            if (DataStore.isLoaded && data.characterActions) {
                                DataStore.currentActions = data.characterActions;
                            }
                            break;
                        case "party_updated":
                            if (DataStore.isLoaded) {
                                DataStore.partyInfo = data.partyInfo || DataStore.partyInfo;
                                if (data.partyInfo?.sharableCharacterMap) {
                                    DataStore.sharableCharacterMap = data.partyInfo.sharableCharacterMap;
                                }
                            }
                            break;
                        default:
                            break;
                    }
                } catch (error) {
                }
            },
            processCharacterData(data) {
                DataStore.raw = data;
                DataStore.characterSkills = data.characterSkills || [];
                DataStore.characterItems = data.characterItems || [];
                DataStore.characterAbilities = data.characterAbilities || [];
                DataStore.combatUnit = data.combatUnit || null;
                DataStore.characterHouseRoomMap = data.characterHouseRoomMap || {};
                DataStore.currentActions = data.characterActions || [];
                DataStore.combatSetup = data.characterCombatSetup || null;
                DataStore.actionTypeFoodSlotsMap = data.actionTypeFoodSlotsMap || {};
                DataStore.actionTypeDrinkSlotsMap = data.actionTypeDrinkSlotsMap || {};
                DataStore.abilityCombatTriggersMap = data.abilityCombatTriggersMap || {};
                DataStore.consumableCombatTriggersMap = data.consumableCombatTriggersMap || {};
                DataStore.characterName = data.characterName || 
                                         data.character?.name || 
                                         data.combatUnit?.name ||
                                         this.getNameFromDOM() ||
                                         "Unknown Adventurer";
                DataStore.characterId = data.character?.id || null;
                DataStore.gameMode = data.gameMode || data.character?.gameMode || null;
                DataStore.nameColor = null;
                DataStore.nameColorHrid = data.character?.nameColorHrid || null;
                DataStore.chatIconHrid = data.character?.chatIconHrid || null;
                DataStore.supporterBadgeHrid = data.character?.specialChatIconHrid || null;
                DataStore.profileIconHrid = data.character?.profileIconHrid || null;
                DataStore.avatarHrid = data.character?.avatarHrid || null;
                DataStore.outfitHrid = data.character?.avatarOutfitHrid || null;
                DataStore.characterAchievements = data.characterAchievements || [];
                const host = location.hostname;
                const apiUrls = host.includes('test.milkywayidlecn') ? ['https://api-test.milkywayidlecn.com/v1/users/me']
                    : host.includes('milkywayidlecn') ? ['https://api.milkywayidlecn.com/v1/users/me']
                    : host.includes('test.milkywayidle') ? ['https://api-test.milkywayidle.com/v1/users/me']
                    : ['https://api.milkywayidle.com/v1/users/me'];
                const tryFetch = (index = 0) => {
                    if (index >= apiUrls.length) return;
                    fetch(apiUrls[index], { credentials: 'include' })
                        .then(r => {
                            if (!r.ok) throw new Error('HTTP ' + r.status);
                            return r.json();
                        })
                        .then(apiData => {
                            if (apiData?.characters) {
                                const char = apiData.characters.find(c => c.name === DataStore.characterName);
                                if (char) {
                                    DataStore.chatIconHrid = char.chatIconHrid || DataStore.chatIconHrid;
                                    DataStore.supporterBadgeHrid = char.specialChatIconHrid || DataStore.supporterBadgeHrid;
                                    DataStore.avatarHrid = char.avatarHrid || DataStore.avatarHrid;
                                    DataStore.outfitHrid = char.avatarOutfitHrid || DataStore.outfitHrid;
                                    DataStore.nameColorHrid = char.nameColorHrid || DataStore.nameColorHrid;
                                    DataStore.gameMode = char.gameMode || DataStore.gameMode;
                                    this._debouncedSaveSimData();
                                }
                            }
                        })
                        .catch(() => tryFetch(index + 1));
                };
                tryFetch();
                DataStore.guildName = data.guild?.name || null;
                DataStore.guildLevel = data.guild?.level || null;
                DataStore.guildMembers = data.guildCharacterMap ? Object.keys(data.guildCharacterMap).length : null;
                DataStore.totalLevel = null;
                DataStore.buildScore = null;
                const self = this;
                const checkTotalLevel = (attempt = 0, maxAttempts = 10) => {
                    const totalLevelElem = document.querySelector('.Header_totalLevel__8LY3Q');
                    if (totalLevelElem) {
                        const match = totalLevelElem.textContent.match(/(\d+)/);
                        if (match) {
                            DataStore.totalLevel = parseInt(match[1]);
                            window.dispatchEvent(new CustomEvent('mwi_totallevel_updated', { detail: { totalLevel: DataStore.totalLevel } }));
                            self._debouncedSaveSimData();
                            return;
                        }
                    }
                    if (attempt < maxAttempts) {
                        setTimeout(() => checkTotalLevel(attempt + 1, maxAttempts), 500);
                    }
                };
                setTimeout(() => checkTotalLevel(), 1500);
                const nameColorHrid = data.character?.nameColorHrid || null;
                DataStore.nameElementHTML = null;
                if (nameColorHrid || DataStore.characterName) {
                    setTimeout(() => {
                        const nameContainer = document.querySelector('.CharacterName_characterName__2FqyZ') || 
                                             document.querySelector('[class*="CharacterName_characterName"]');
                        if (nameContainer) {
                            const nameLink = nameContainer.querySelector('a') || nameContainer;
                            const computedStyle = window.getComputedStyle(nameLink);
                            const extractedColor = computedStyle.color;
                            if (extractedColor && extractedColor !== 'rgb(255, 255, 255)' && extractedColor !== 'rgb(0, 0, 0)') {
                                DataStore.nameColor = extractedColor;
                                self._debouncedSaveSimData();
                            }
                            const clonedContainer = nameContainer.cloneNode(true);
                            const chatIcon = clonedContainer.querySelector('.CharacterName_chatIcon__22lxV') ||
                                            clonedContainer.querySelector('[class*="CharacterName_chatIcon"]');
                            if (chatIcon) chatIcon.remove();
                            const clickableElements = clonedContainer.querySelectorAll('a, [href]');
                            clickableElements.forEach(el => {
                                if (el.tagName.toLowerCase() === 'a') {
                                    const span = document.createElement('span');
                                    span.innerHTML = el.innerHTML;
                                    if (el.className) span.className = el.className;
                                    if (el.style.cssText) span.style.cssText = el.style.cssText;
                                    el.replaceWith(span);
                                } else {
                                    el.removeAttribute('href');
                                }
                            });
                            DataStore.nameElementHTML = clonedContainer.outerHTML;
                        }
                    }, 2000);
                }
                DataStore.partyInfo = data.partyInfo || null;
                DataStore.sharableCharacterMap = data.partyInfo?.sharableCharacterMap || null;
                DataStore.currentEquipmentMap = {};
                DataStore.characterItems.forEach(item => {
                    if (item.itemLocationHrid && item.itemLocationHrid !== "/item_locations/inventory") {
                        DataStore.currentEquipmentMap[item.itemLocationHrid] = item;
                    }
                });
                const weaponInfo = getWeapon(DataStore.currentEquipmentMap);
                DataStore.weaponType = weaponInfo.zh;
                DataStore.weaponTypeEN = weaponInfo.en;
                DataStore.combatLevel = DataStore.combatUnit?.combatLevel || null;
                if (DataStore.combatLevel === null && DataStore.characterSkills) {
                    const stamina = DataStore.characterSkills.find(s => s.skillHrid === '/skills/stamina')?.level || 0;
                    const intelligence = DataStore.characterSkills.find(s => s.skillHrid === '/skills/intelligence')?.level || 0;
                    const attack = DataStore.characterSkills.find(s => s.skillHrid === '/skills/attack')?.level || 0;
                    const defense = DataStore.characterSkills.find(s => s.skillHrid === '/skills/defense')?.level || 0;
                    const melee = DataStore.characterSkills.find(s => s.skillHrid === '/skills/melee')?.level || 0;
                    const ranged = DataStore.characterSkills.find(s => s.skillHrid === '/skills/ranged')?.level || 0;
                    const magic = DataStore.characterSkills.find(s => s.skillHrid === '/skills/magic')?.level || 0;
                    const maxCombatSkill = Math.max(melee, ranged, magic);
                    const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
                    DataStore.combatLevel = Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);
                }
                DataStore.isLoaded = true;
                try { GM_setValue("bt_auth_name", DataStore.characterName); } catch (e) { }
                btRestoreAutoUploadState();
                window.MWI_INTEGRATED.websocketData = data;
                this._debouncedSaveSimData(0);
                window.dispatchEvent(new CustomEvent("mwi_data_ready", {
                    detail: { characterName: DataStore.characterName, dataLoaded: true }
                }));
                if (DataStore.itemDetailMap) {
                    const self = this;
                    (async () => {
                        try {
                            const scoreResult = await BuildScoreModule.calculateBuildScore(DataStore.raw);
                            if (scoreResult) {
                                DataStore.buildScore = scoreResult.total;
                                window.dispatchEvent(new CustomEvent('mwi_buildscore_updated', { detail: { buildScore: DataStore.buildScore } }));
                                self._debouncedSaveSimData();
                            }
                        } catch (e) {}
                    })();
                }
            },
            processClientData(data) {
                DataStore.itemDetailMap = data.itemDetailMap || null;
                DataStore.actionDetailMap = data.actionDetailMap || null;
                DataStore.abilityDetailMap = data.abilityDetailMap || null;
                DataStore.achievementDetailMap = data.achievementDetailMap || null;
                DataStore.achievementTierDetailMap = data.achievementTierDetailMap || null;
                BuildScoreModule.initClientData(data);
                try {
                    const clientDataForSim = {
                        levelExperienceTable: data.levelExperienceTable || null,
                        itemDetailMap: data.itemDetailMap || null,
                        actionDetailMap: data.actionDetailMap || null,
                        houseRoomDetailMap: data.houseRoomDetailMap || null
                    };
                    GM_setValue('mwi_client_data_for_sim', LZString.compressToUTF16(JSON.stringify(clientDataForSim)));
                } catch (e) { /* silent */ }
                if (DataStore.raw) {
                    const self = this;
                    (async () => {
                        try {
                            const scoreResult = await BuildScoreModule.calculateBuildScore(DataStore.raw);
                            if (scoreResult) {
                                DataStore.buildScore = scoreResult.total;
                                window.dispatchEvent(new CustomEvent('mwi_buildscore_updated', { detail: { buildScore: DataStore.buildScore } }));
                                self._debouncedSaveSimData();
                            }
                        } catch (e) {}
                    })();
                }
            },
            updateItems(data) {
                if (!DataStore.isLoaded || !data.characterItems) return;
                DataStore.characterItems = data.characterItems;
                DataStore.currentEquipmentMap = {};
                DataStore.characterItems.forEach(item => {
                    if (item.itemLocationHrid && item.itemLocationHrid !== "/item_locations/inventory") {
                        DataStore.currentEquipmentMap[item.itemLocationHrid] = item;
                    }
                });
                const weaponInfo = getWeapon(DataStore.currentEquipmentMap);
                DataStore.weaponType = weaponInfo.zh;
                DataStore.weaponTypeEN = weaponInfo.en;
            },
            getNameFromDOM() {
                const selectors = [
                    '.CharacterName_characterName__2FqyZ',
                    '.Header_name__227rJ',
                    '.character-name',
                    '.player-name'
                ];
                for (const selector of selectors) {
                    const elem = document.querySelector(selector);
                    if (elem?.textContent?.trim()) return elem.textContent.trim();
                }
                return null;
            },
            generateSimulatorData() {
                if (!DataStore.characterSkills) {
                    return null;
                }
                const foodSlots = (DataStore.actionTypeFoodSlotsMap || {})["/action_types/combat"] || [];
                const drinkSlots = (DataStore.actionTypeDrinkSlotsMap || {})["/action_types/combat"] || [];
                const mapSlots = (slots) => slots.map(slot => ({ itemHrid: slot?.itemHrid || "" }));
                const food = { "/action_types/combat": mapSlots(foodSlots) };
                const drinks = { "/action_types/combat": mapSlots(drinkSlots) };
                const abilities = Array(5).fill({ abilityHrid: "", level: "1" });
                const combatAbilities = DataStore.combatUnit?.combatAbilities || [];
                let normalIdx = 1;
                combatAbilities.forEach(ability => {
                    if (!ability) return;
                    const detail = DataStore.abilityDetailMap?.[ability.abilityHrid];
                    const idx = detail?.isSpecialAbility ? 0 : (normalIdx < abilities.length ? normalIdx++ : -1);
                    if (idx >= 0) {
                        abilities[idx] = { abilityHrid: ability.abilityHrid, level: ability.level };
                    }
                });
                const triggerMap = Object.assign(
                    {}, 
                    DataStore.abilityCombatTriggersMap || {}, 
                    DataStore.consumableCombatTriggersMap || {}
                );
                const productionTools = [
                    "/item_locations/woodcutting_tool",
                    "/item_locations/foraging_tool",
                    "/item_locations/milking_tool",
                    "/item_locations/cheesesmithing_tool",
                    "/item_locations/crafting_tool",
                    "/item_locations/tailoring_tool",
                    "/item_locations/cooking_tool",
                    "/item_locations/brewing_tool",
                    "/item_locations/alchemy_tool",
                    "/item_locations/enhancing_tool"
                ];
                const getSkillLevel = (skillHrid) => {
                    return DataStore.characterSkills?.find(s => s.skillHrid === skillHrid)?.level || 0;
                };
                const meleeLevel = getSkillLevel("/skills/melee");
                const rangedLevel = getSkillLevel("/skills/ranged");
                const magicLevel = getSkillLevel("/skills/magic");
                return {
                    player: {
                        defenseLevel: getSkillLevel("/skills/defense"),
                        magicLevel: magicLevel,
                        attackLevel: getSkillLevel("/skills/attack"),
                        intelligenceLevel: getSkillLevel("/skills/intelligence"),
                        staminaLevel: getSkillLevel("/skills/stamina"),
                        meleeLevel: meleeLevel,
                        rangedLevel: rangedLevel,
                        equipment: Object.entries(DataStore.currentEquipmentMap)
                            .filter(([location]) => !productionTools.includes(location))
                            .map(([location, item]) => ({
                                itemLocationHrid: location,
                                itemHrid: item.itemHrid,
                                enhancementLevel: item.enhancementLevel || 0
                            }))
                    },
                    food: food,
                    drinks: drinks,
                    abilities: abilities,
                    triggerMap: triggerMap,
                    houseRooms: Object.fromEntries(
                        Object.entries(DataStore.characterHouseRoomMap || {}).map(([hrid, data]) => [hrid, data.level || 0])
                    ),
                    characterName: DataStore.characterName || "Unknown Adventurer",
                    totalLevel: DataStore.totalLevel || null,
                    buildScore: DataStore.buildScore || null,
                    combatLevel: DataStore.combatLevel || null,
                    weaponType: DataStore.weaponTypeEN || null,
                    guildName: DataStore.guildName || null,
                    guildLevel: DataStore.guildLevel || null,
                    guildMembers: DataStore.guildMembers || null,
                    nameColorHrid: DataStore.nameColorHrid || null,
                    chatIconHrid: DataStore.chatIconHrid || null,
                    supporterBadgeHrid: DataStore.supporterBadgeHrid || null,
                    gameMode: DataStore.gameMode || null
                };
            },
            storeProfile(data) {
                if (!data.profile?.characterSkills?.[0]?.characterID) return;
                const charID = data.profile.characterSkills[0].characterID;
                const charName = data.profile.sharableCharacter?.name || "Unknown";
                DataStore.profileMap[charID] = { characterID: charID, characterName: charName, profile: data.profile, timestamp: Date.now() };
                const wt = getWeapon(data.profile?.wearableItemMap);
                btCacheWeaponType(charID, charName, wt?.en || null);
                try {
                    GM_xmlhttpRequest({ 
                        method: "POST", 
                        url: SITE_URL + "/api/teams/player", 
                        headers: { "Content-Type": "application/json" }, 
                        data: JSON.stringify({ characterId: charID, playerName: charName, weaponType: wt?.en || '' }), 
                        onload(r) { }, 
                        onerror(e) { } 
                    });
                } catch (e) { }
            }
        };
    
        const BT_WEAPON_LISTS = {
            bow: ["gobo_shooter", "cursed_bow", "cursed_bow_refined"],
            water: ["rippling_trident", "rippling_trident_refined", "frost_staff", "frost_staff_refined"],
            fire: ["gobo_boomstick", "blazing_trident", "blazing_trident_refined", "infernal_battlestaff", "infernal_battlestaff_refined"],
            nature: ["jackalope_staff", "jackalope_staff_refined", "blooming_trident", "blooming_trident_refined"],
            sword: ["gobo_slasher", "werewolf_slasher", "werewolf_slasher_refined"],
            mace: ["gobo_smasher", "granite_bludgeon", "granite_bludgeon_refined", "chaotic_flail", "chaotic_flail_refined"],
            spear: ["gobo_stabber"],
            bulwark: ["griffin_bulwark", "griffin_bulwark_refined", "spiked_bulwark", "spiked_bulwark_refined"]
        };
        function btGetItemHridBySlot(map, slot) {
            const d = map[slot]?.itemHrid;
            if (d) return d;
            for (const k in map) { if (map[k].itemLocationHrid === slot) return map[k].itemHrid; }
            return null;
        }
        function getWeapon(wearableItemMap) {
            if (!wearableItemMap) return { zh: null, en: null };
            const weaponTypeMap = {
                "水法": "Water",
                "火法": "Fire",
                "自然法": "Nature",
                "弓": "Bow",
                "弩": "Crossbow",
                "盾": "Bulwark",
                "枪": "Spear",
                "锤": "Flail",
                "剑": "Sword"
            };
            const oh = btGetItemHridBySlot(wearableItemMap, '/item_locations/off_hand');
            if (oh) {
                const offWeapon = oh.includes('/') ? oh.split('/').pop() : oh;
                if (offWeapon && (offWeapon.includes("_bulwark") || BT_WEAPON_LISTS.bulwark.includes(offWeapon))) {
                    return { zh: "盾", en: "Bulwark" };
                }
            }
            const h = btGetItemHridBySlot(wearableItemMap, '/item_locations/main_hand') || btGetItemHridBySlot(wearableItemMap, '/item_locations/two_hand');
            if (!h) return { zh: null, en: null };
            const weapon = h.includes('/') ? h.split('/').pop() : h;
            if (!weapon) return { zh: null, en: null };
            let typeZH = null;
            if (weapon.includes("_bow") || BT_WEAPON_LISTS.bow.includes(weapon)) {
                typeZH = "弓";
            } else if (weapon.includes("_crossbow")) {
                typeZH = "弩";
            } else if (weapon.includes("_water_staff") || BT_WEAPON_LISTS.water.includes(weapon)) {
                typeZH = "水法";
            } else if (weapon.includes("_fire_staff") || BT_WEAPON_LISTS.fire.includes(weapon)) {
                typeZH = "火法";
            } else if (weapon.includes("_nature_staff") || BT_WEAPON_LISTS.nature.includes(weapon)) {
                typeZH = "自然法";
            } else if (weapon.includes("_sword") || BT_WEAPON_LISTS.sword.includes(weapon)) {
                if (weapon === "cheese_sword") return { zh: null, en: null };
                typeZH = "剑";
            } else if (weapon.includes("_mace") || BT_WEAPON_LISTS.mace.includes(weapon)) {
                typeZH = "锤";
            } else if (weapon.includes("_spear") || BT_WEAPON_LISTS.spear.includes(weapon)) {
                typeZH = "枪";
            } else if (weapon.includes("_bulwark") || BT_WEAPON_LISTS.bulwark.includes(weapon)) {
                typeZH = "盾";
            }
            return {
                zh: typeZH,
                en: typeZH ? weaponTypeMap[typeZH] : null
            };
        }
        // ==================== Persistent Weapon Cache ====================
        const BT_WEAPON_CACHE_KEY = 'mwi_bt_weapon_cache';
        let btWeaponCache = {};
        try { btWeaponCache = JSON.parse(GM_getValue(BT_WEAPON_CACHE_KEY, '{}')); } catch (e) { btWeaponCache = {}; }
        function btSaveWeaponCache() {
            try { GM_setValue(BT_WEAPON_CACHE_KEY, JSON.stringify(btWeaponCache)); } catch (e) {}
        }
        function btCacheWeaponType(characterID, characterName, weaponType) {
            btWeaponCache[characterID] = { name: characterName, weapon: weaponType, ts: Date.now() };
            btSaveWeaponCache();
        }
        function btGetCachedWeaponType(characterID) {
            return btWeaponCache[characterID]?.weapon || null;
        }
        function btGetMissingMembers() {
            const psm = DataStore.partyInfo?.partySlotMap;
            if (!psm) return [];
            const missing = [];
            for (const m of Object.values(psm)) {
                if (!m.characterID || m.characterID === DataStore.characterId) continue;
                if (DataStore.profileMap[m.characterID] || btWeaponCache[m.characterID]) continue;
                const sc = DataStore.sharableCharacterMap?.[m.characterID] || DataStore.sharableCharacterMap?.[String(m.characterID)];
                missing.push(sc?.name || 'Unknown');
            }
            return missing;
        }
        function btRestoreAutoUploadState() {
            if (GM_getValue('mwi_upload_team_disabled', false)) return;
            BattleTeamsModule.startAutoUpload();
        }
    
        const BattleTeamsModule = (() => {
            const UPLOAD_URL = SITE_URL + "/api/teams/upload";
            const AUTO_INTERVAL_MS = 90 * 60 * 1000;
            const ADZ = ['pirate_cove', 'enchanted_fortress', 'sinister_circus', 'chimerical_den'];
            let autoUploadTimer = null;
    
            function getMemberName(characterID) {
                const p = DataStore.profileMap[characterID];
                if (p) return p.characterName;
                const sm = DataStore.sharableCharacterMap;
                const sc = sm?.[characterID] || sm?.[String(characterID)];
                return sc?.name || "Unknown";
            }
    
            function buildTeamExportData() {
                if (!DataStore.isLoaded) return { error: "Game data not loaded" };
                const psm = DataStore.partyInfo?.partySlotMap;
                const members = [];
                let zone = "", difficulty = "";
                if (psm) {
                    zone = DataStore.partyInfo?.party?.actionHrid || "";
                    const dt = DataStore.partyInfo?.party?.difficultyTier;
                    difficulty = (dt != null) ? "T" + dt : "";
                }
                if (!zone) {
                    const combatAction = (DataStore.currentActions || []).find(a => a?.actionHrid?.includes("/actions/combat/"));
                    if (combatAction) {
                        zone = combatAction.actionHrid;
                        difficulty = (combatAction.difficultyTier != null) ? "T" + combatAction.difficultyTier : "";
                    }
                }
                const selfWeapon = getWeapon(DataStore.currentEquipmentMap).en;
                if (!psm) {
                    if (!zone) zone = 'solo';
                    members.push({ slot: 1, player_name: DataStore.characterName, weapon_type: selfWeapon, weapon_ts: Date.now() });
                } else {
                    if (!zone) return { error: "Not in combat" };
                    let si = 1;
                    for (const m of Object.values(psm)) {
                        if (!m.characterID) { si++; continue; }
                        if (String(m.characterID) === String(DataStore.characterId)) {
                            members.push({ slot: si, player_name: DataStore.characterName, weapon_type: selfWeapon, weapon_ts: Date.now() });
                        } else {
                            const p = DataStore.profileMap[m.characterID];
                            const mwt = p ? getWeapon(p.profile?.wearableItemMap).en : btGetCachedWeaponType(m.characterID);
                            const mts = p ? (p.timestamp || 0) : (btWeaponCache[m.characterID]?.ts || 0);
                            members.push({ slot: si, player_name: getMemberName(m.characterID), weapon_type: mwt, weapon_ts: mts });
                        }
                        si++;
                    }
                }
                if (members.length < 1) return { error: "No team members detected" };
                const isBattling = !!(DataStore.partyInfo?.party?.status === "battling" || (DataStore.currentActions || []).some(a => a?.actionHrid?.includes("/actions/combat/")));
                return { zone, difficulty, members, isBattling };
            }
    
            function uploadTeamData(data) {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: UPLOAD_URL,
                        headers: { "Content-Type": "application/json" },
                        data: JSON.stringify(data),
                        onload(r) { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); } },
                        onerror(e) { reject(e); }
                    });
                });
            }
    
            async function silentUpload() {
                if (!DataStore.isLoaded) return;
                if (DataStore.gameMode && DataStore.gameMode !== 'standard') return;
                const result = buildTeamExportData();
                if (result.error) return;
                result.characterType = 'standard';
                result.gameMode = DataStore.gameMode || null;
                result.reporter = DataStore.characterName || '';
                try { await uploadTeamData(result); } catch (e) {}
            }
    
            return {
                startAutoUpload() {
                    if (autoUploadTimer) clearInterval(autoUploadTimer);
                    setTimeout(() => silentUpload(), 5000);
                    autoUploadTimer = setInterval(() => silentUpload(), AUTO_INTERVAL_MS);
                },
                stopAutoUpload() {
                    if (autoUploadTimer) {
                        clearInterval(autoUploadTimer);
                        autoUploadTimer = null;
                    }
                },
                isRunning() { return autoUploadTimer !== null; }
            };
        })();
        const isZH = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
        const currentLang = isZH ? 'zh' : 'en';
        const i18n = {
            combat: { zh: '战斗', en: 'Combat' },
            intelligence: { zh: '智力', en: 'Intelligence' },
            stamina: { zh: '耐力', en: 'Stamina' },
            attack: { zh: '攻击', en: 'Attack' },
            defense: { zh: '防御', en: 'Defense' },
            melee: { zh: '近战', en: 'Melee' },
            ranged: { zh: '远程', en: 'Ranged' },
            magic: { zh: '魔法', en: 'Magic' },
            house: { zh: '房屋', en: 'House' },
            dojo: { zh: '道场', en: 'Dojo' },
            library: { zh: '图书馆', en: 'Library' },
            dining_room: { zh: '餐厅', en: 'Dining Room' },
            mystical_study: { zh: '神秘研究室', en: 'Mystical Study' },
            armory: { zh: '军械库', en: 'Armory' },
            gym: { zh: '健身房', en: 'Gym' },
            archery_range: { zh: '射箭场', en: 'Archery Range' },
            back: { zh: '背部', en: 'Back' },
            head: { zh: '头部', en: 'Head' },
            trinket: { zh: '饰品', en: 'Trinket' },
            neck: { zh: '项链', en: 'Neck' },
            main_hand: { zh: '主手', en: 'Main Hand' },
            body: { zh: '身体', en: 'Body' },
            off_hand: { zh: '副手', en: 'Off Hand' },
            earrings: { zh: '耳环', en: 'Earrings' },
            hands: { zh: '手套', en: 'Hands' },
            legs: { zh: '腿部', en: 'Legs' },
            pouch: { zh: '腰包', en: 'Pouch' },
            ring: { zh: '戒指', en: 'Ring' },
            feet: { zh: '鞋子', en: 'Feet' },
            charm: { zh: '护符', en: 'Charm' },
            two_hand: { zh: '双手', en: 'Two Hand' },
            food: { zh: '食物', en: 'Food' },
            drink: { zh: '饮料', en: 'Drink' },
            abilities: { zh: '技能', en: 'Abilities' },
            level: { zh: 'Lv', en: 'Lv' },
            unknown: { zh: '未知', en: 'Unknown' }
        };
        function t(key) {
            return i18n[key]?.[currentLang] || key;
        }
        const ClientData = new class {
            #data = null;
            #hrid2name = {};
            #name2hrid = {};
            #loaded = false;
            init() {
                if (this.#loaded) return;
                const compressed = localStorage.getItem("initClientData");
                if (!compressed) return;
                try {
                    this.#data = JSON.parse(LZString.decompressFromUTF16(compressed));
                    this.#buildMappings();
                    this.#loaded = true;
                    DataStore.itemDetailMap = this.#data.itemDetailMap;
                    DataStore.actionDetailMap = this.#data.actionDetailMap;
                    DataStore.abilityDetailMap = this.#data.abilityDetailMap;
                    DataStore.achievementDetailMap = this.#data.achievementDetailMap;
                    DataStore.achievementTierDetailMap = this.#data.achievementTierDetailMap;
                } catch (e) { /* silent */ }
            }
            get() {
                if (!this.#loaded) this.init();
                return this.#data;
            }
            #buildMappings() {
                if (!this.#data) return;
                const maps = [
                    this.#data.itemDetailMap,
                    this.#data.abilityDetailMap,
                    this.#data.actionDetailMap,
                    this.#data.skillDetailMap
                ];
                for (const detailMap of maps) {
                    if (!detailMap) continue;
                    for (const hrid in detailMap) {
                        const detail = detailMap[hrid];
                        if (detail && detail.name) {
                            this.#hrid2name[hrid] = detail.name;
                            this.#name2hrid[detail.name] = hrid;
                        }
                    }
                }
            }
            hrid2name(hrid) {
                if (!hrid) return hrid;
                if (!this.#loaded) this.init();
                return this.#hrid2name[hrid] || hrid.split('/').pop();
            }
            name2hrid(name) {
                if (!name) return name;
                if (!this.#loaded) this.init();
                return this.#name2hrid[name] || name;
            }
            getItemDetail(hrid) {
                if (!this.#loaded) this.init();
                return this.#data?.itemDetailMap?.[hrid] || null;
            }
        };
        function getAllData() {
            if (!DataStore.isLoaded) {
                return null;
            }
            return {
                characterName: DataStore.characterName,
                characterId: DataStore.characterId,
                totalLevel: DataStore.totalLevel,
                buildScore: DataStore.buildScore,
                combatLevel: DataStore.combatLevel,
                weaponType: DataStore.weaponType,
                weaponTypeEN: DataStore.weaponTypeEN,
                guildName: DataStore.guildName,
                guildLevel: DataStore.guildLevel,
                guildMembers: DataStore.guildMembers,
                displayName: DataStore.characterName || 'Player 1',
                nameColor: DataStore.nameColor,
                chatIconHrid: DataStore.chatIconHrid,
                profileIconHrid: DataStore.profileIconHrid,
                avatarHrid: DataStore.avatarHrid,
                outfitHrid: DataStore.outfitHrid,
                characterSkills: DataStore.characterSkills,
                characterItems: DataStore.characterItems,
                characterAbilities: DataStore.characterAbilities,
                equipment: DataStore.currentEquipmentMap,
                combatUnit: DataStore.combatUnit,
                houseRooms: DataStore.characterHouseRoomMap,
                foodSlots: DataStore.actionTypeFoodSlotsMap,
                drinkSlots: DataStore.actionTypeDrinkSlotsMap,
                combatSetup: DataStore.combatSetup
            };
        }
        function getSimulatorData() {
            return WebSocketHook.generateSimulatorData();
        }
        function isDataReady() {
            return DataStore.isLoaded;
        }
        function waitForData(timeout = 10000) {
            return new Promise((resolve, reject) => {
                if (DataStore.isLoaded) {
                    resolve(getAllData());
                    return;
                }
                const timer = setTimeout(() => {
                    window.removeEventListener('mwi_data_ready', handler);
                    reject(new Error('Data loading timeout'));
                }, timeout);
                const handler = () => {
                    clearTimeout(timer);
                    resolve(getAllData());
                };
                window.addEventListener('mwi_data_ready', handler, { once: true });
            });
        }
        function toggleTalentMarketModal() {
            const existing = document.getElementById('talent-market-modal');
            if (existing) {
                if (existing.style.display === 'none') {
                    existing.style.display = '';
                    if (existing._onShow) existing._onShow();
                } else {
                    if (existing._onHide) existing._onHide();
                    existing.style.display = 'none';
                }
                return;
            }
            createTalentMarketModal();
        }
        window.toggleTalentMarketModal = toggleTalentMarketModal;
        function createTalentMarketModal() {
            const isZH = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
            const I18N = {
                zh: {
                    title: 'Talent Market',
                    back: '返回',
                    refresh: '刷新',
                    close: '关闭',
                    loading: '加载中...',
                    loadingSlow: '加载时间较长,请稍候...',
                    loadFailed: '加载失败,请检查网络连接',
                    loadTimeout: '加载超时，请检查网络连接或刷新页面',
                    disableUpload: '不上传队伍信息',
                },
                en: {
                    title: 'Talent Market',
                    back: 'Back',
                    refresh: 'Refresh',
                    close: 'Close',
                    loading: 'Loading...',
                    loadingSlow: 'Loading is taking longer...',
                    loadFailed: 'Failed to load, check connection',
                    loadTimeout: 'Loading timeout, please check network connection or refresh the page',
                    disableUpload: 'Disable Upload',
                }
            };
            const t = I18N[isZH ? 'zh' : 'en'];
            const LAYOUT_CONFIG = {
                MIN_WIDTH: 540,
                MIN_HEIGHT: 787,
                NARROW_THRESHOLD: 970,
                MOBILE_THRESHOLD: 550,
                MARGIN_RATIO: 0.05,
                VIEWPORT_RATIO: 0.9,
                LOAD_TIMEOUT: 10000,
                MESSAGING_DELAY: 200,
                RESIZE_DEBOUNCE: 150
            };
            const existing = document.getElementById('talent-market-modal');
            if (existing) {
                return existing;
            }
            const modal = document.createElement('div');
            modal.id = 'talent-market-modal';
            modal._currentUrl = SITE_URL;
            modal.innerHTML = `
                <div class="tm-overlay">
                    <div class="tm-container">
                        <div class="tm-header">
                            <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                                <button class="tm-btn-refresh" title="${t.refresh}">${t.refresh}</button>
                                <button class="tm-btn-settings" title="${isZH ? '战力分自动更新设置' : 'BuildScore Auto-Update Settings'}" style="background:${GM_getValue('mwi_buildscore_auto_enabled', false) && GM_getValue('mwi_buildscore_password', null) ? '#166534' : '#334155'};color:${GM_getValue('mwi_buildscore_auto_enabled', false) && GM_getValue('mwi_buildscore_password', null) ? '#86efac' : '#94a3b8'};border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">${GM_getValue('mwi_buildscore_auto_enabled', false) && GM_getValue('mwi_buildscore_password', null) ? (isZH ? '已启用自动更新' : 'Auto: ON') : (isZH ? '未启用自动更新' : 'Auto: OFF')}</button>
                                <label class="tm-upload-team-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#ffffff;user-select:none;white-space:nowrap;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px 10px;">
                                    <input type="checkbox" class="tm-upload-team-checkbox" ${GM_getValue('mwi_upload_team_disabled', false) ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:#66CCFF;" />
                                    ${t.disableUpload}
                                </label>
                            </div>
                            <div class="tm-title">
                                <h2>${t.title}</h2>
                            </div>
                            <div class="tm-controls">
                                <button class="tm-btn-close" title="${t.close}">${t.close}</button>
                            </div>
                        </div>
                        <div class="tm-content">
                            <iframe 
                                id="tm-iframe" 
                                src="${SITE_URL}?embedded=true&v=${Date.now()}"
                                frameborder="0"
                                loading="eager"
                                fetchpriority="high"
                            ></iframe>
    
                            <div class="tm-loading">
                                <div class="tm-spinner"></div>
                                <p>${t.loading}</p>
                            </div>
                        </div>
                    </div>
                </div>
                `;
                const container = modal.querySelector('.tm-container');
                initCardUploadMonitor();
                bindTalentMarketEvents(modal, t, LAYOUT_CONFIG);
                requestAnimationFrame(() => {
                    document.body.appendChild(modal);
                    updateScrollbarState(container, LAYOUT_CONFIG);
                });
            const iframe = modal.querySelector('#tm-iframe');
            enableClipboardPermissionsIfSupported(iframe);
            const loadingEl = modal.querySelector('.tm-loading');
            let loadTimeout = null;
            const handleResize = () => {
                updateScrollbarState(container, LAYOUT_CONFIG);
                updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
            };
            const resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.target === container) {
                        handleResize();
                    }
                }
            });
            resizeObserver.observe(container);
            modal._onHide = () => {
                IntervalManager.clear('cardUploadMonitor');
                window._MWI_UPLOAD_IN_PROGRESS = false;
                GM_setValue('mwi_card_upload_request', 0);
                GM_setValue('mwi_card_image_url', '');
                GM_setValue('mwi_card_image_timestamp', 0);
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
                cardLinkFillStatus.reset();
                closeCard();
            };
            modal._onShow = () => {
                initCardUploadMonitor();
                updateScrollbarState(container, LAYOUT_CONFIG);
                updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
            };
            modal._cleanup = () => {
                resizeObserver.disconnect();
                document.removeEventListener('keydown', handleEscape);
                if (loadTimeout) clearTimeout(loadTimeout);
                modal._onHide();
            };
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    toggleTalentMarketModal();
                }
            };
            document.addEventListener('keydown', handleEscape);
            iframe.addEventListener('load', () => {
                if (loadTimeout) clearTimeout(loadTimeout);
                loadingEl.style.display = 'none';
                iframe._loaded = true;
                setupIframeMessaging(iframe, LAYOUT_CONFIG);
                updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
            }, { once: true });
            loadTimeout = setTimeout(() => {
                if (loadingEl.style.display !== 'none') {
                    loadingEl.innerHTML = `<p style="color:#fbbf24;">${t.loadingSlow}</p>`;
                }
            }, LAYOUT_CONFIG.LOAD_TIMEOUT);
            iframe.addEventListener('error', () => {
                if (loadTimeout) clearTimeout(loadTimeout);
                loadingEl.innerHTML = `<p style="color:#ef4444;">${t.loadFailed}</p>`;
            }, { once: true });
            return modal;
        }
        function bindTalentMarketEvents(modal, t, LAYOUT_CONFIG) {
            const loadingEl = modal.querySelector('.tm-loading');
    
            const refreshIframe = () => {
                const iframe = modal.querySelector('#tm-iframe');
                if (iframe) {
                    if (loadingEl) {
                        loadingEl.style.display = 'flex';
                        loadingEl.innerHTML = `<div class="tm-spinner"></div><p>${t.loading}</p>`;
                    }
                    const hideLoadingOnLoad = () => {
                        if (loadingEl) {
                            loadingEl.style.display = 'none';
                        }
                    };
                    iframe.addEventListener('load', hideLoadingOnLoad, { once: true });
                    const currentSrc = iframe.src;
                    iframe.src = 'about:blank';
                    setTimeout(() => {
                        iframe.src = currentSrc;
                    }, 50);
                }
            };
            modal.querySelector('.tm-btn-close').addEventListener('click', () => {
                if (modal._onHide) modal._onHide();
                modal.style.display = 'none';
            });
            modal.querySelector('.tm-btn-refresh').addEventListener('click', () => {
                refreshIframe();
            });
            modal.querySelector('.tm-btn-settings').addEventListener('click', () => {
                if (typeof BuildScoreAutoUpdater !== 'undefined') {
                    BuildScoreAutoUpdater.showSettingsDialog();
                }
            });
            const uploadTeamCheckbox = modal.querySelector('.tm-upload-team-checkbox');
            if (uploadTeamCheckbox) {
                uploadTeamCheckbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        GM_setValue('mwi_upload_team_disabled', true);
                        BattleTeamsModule.stopAutoUpload();
                    } else {
                        GM_setValue('mwi_upload_team_disabled', false);
                        BattleTeamsModule.startAutoUpload();
                    }
                });
            }
        }
        function updateIframeViewportInfo(iframe, width, height, LAYOUT_CONFIG) {
            if (!iframe || !iframe.contentWindow || !iframe._loaded) return;
            if (!iframe.src || !iframe.src.startsWith(SITE_URL)) return;
            const isMobile = width < LAYOUT_CONFIG.MOBILE_THRESHOLD;
            const isNarrow = width < LAYOUT_CONFIG.NARROW_THRESHOLD;
            try {
                iframe.contentWindow.postMessage({
                    type: 'VIEWPORT_UPDATE',
                    data: { width, height, isMobile, isNarrow }
                }, SITE_URL);
            } catch (e) {}
        }
        function setupIframeMessaging(iframe, LAYOUT_CONFIG) {
            const container = iframe.closest('.tm-container');
            if (container) {
                setTimeout(() => {
                    updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
                }, LAYOUT_CONFIG.MESSAGING_DELAY);
            }
            if (window._talentMarketMessageListenerAdded) return;
            window._talentMarketMessageListenerAdded = true;
            window.addEventListener('message', (event) => {
                if (event.origin !== SITE_URL) return;
                const { type, data } = event.data;
                switch(type) {
                    case 'CLOSE_MODAL':
                        const modal = document.getElementById('talent-market-modal');
                        if (modal) {
                            if (modal._cleanup) modal._cleanup();
                            modal.remove();
                        }
                        break;
                }
            });
        }
        function updateScrollbarState(container, LAYOUT_CONFIG) {
            const currentWidth = container.offsetWidth;
            const currentHeight = container.offsetHeight;
            if (currentWidth < LAYOUT_CONFIG.NARROW_THRESHOLD) {
                container.setAttribute('data-narrow', 'true');
            } else {
                container.removeAttribute('data-narrow');
            }
            if (currentHeight < LAYOUT_CONFIG.MIN_HEIGHT) {
                container.setAttribute('data-short', 'true');
            } else {
                container.removeAttribute('data-short');
            }
            if (currentWidth < LAYOUT_CONFIG.MOBILE_THRESHOLD) {
                container.setAttribute('data-mobile', 'true');
            } else {
                container.removeAttribute('data-mobile');
            }
        }
        function generateRandomGradientBorder() {
            let colorPool, angles;
            try {
                const style = getComputedStyle(document.documentElement);
                const poolStr = style.getPropertyValue('--card-gradient-colors').trim().replace(/^'|'$/g, '');
                const anglesStr = style.getPropertyValue('--card-gradient-angles').trim().replace(/^'|'$/g, '');
                if (poolStr) colorPool = JSON.parse(poolStr);
                if (anglesStr) angles = JSON.parse(anglesStr);
            } catch (e) {}
            if (!colorPool || !colorPool.length) {
                colorPool = ['#8B5CF6','#EC4899','#F59E0B','#A855F7','#3B82F6','#9333EA','#DB2777','#C084FC','#26C6DA','#F472B6','#7C3AED','#A78BFA','#06B6D4','#9D4EDD','#C77DFF','#E0AAFF','#BF40BF','#DA70D6','#EE82EE','#E879F9','#BA55D3','#9370DB','#34D399','#10B981','#14B8A6','#22C55E','#6366F1','#0EA5E9','#FF006E','#FF499E','#F43F5E','#FB7185','#E91E63','#FF1744','#FF4081','#FF69B4','#FF1493','#F59E0B','#EF4444','#FBBF24','#F97316','#DC2626','#FFD700','#FFA500','#FF8C00','#00CED1','#48D1CC','#20B2AA','#4169E1','#6495ED','#7B68EE','#536DFE','#FF6347','#FF4500','#1E90FF','#00BFFF','#87CEEB','#4FC3F7','#29B6F6','#64B5F6','#00E676','#1DE9B6','#18FFFF','#64FFDA','#69F0AE','#EEFF41','#FFD740','#FFAB40','#FF6E40','#9890E3','#B721FF','#FBC2EB','#A18CD1'];
            }
            if (!angles || !angles.length) {
                angles = [45, 90, 135, 180, 225, 270, 315, 360];
            }
            const count = 3 + Math.floor(Math.random() * 2);
            const shuffled = colorPool.slice().sort(() => Math.random() - 0.5);
            const picked = shuffled.slice(0, count);
            const angle = angles[Math.floor(Math.random() * angles.length)];
            return `linear-gradient(${angle}deg, ${picked.join(', ')})`;
        }
        function getCompletedAchievementTiers() {
            const achievements = DataStore.characterAchievements || [];
            const achievementDetailMap = DataStore.achievementDetailMap || {};
            const tierCounts = {
                '/achievement_tiers/beginner': { completed: 0, total: 0 },
                '/achievement_tiers/novice': { completed: 0, total: 0 },
                '/achievement_tiers/adept': { completed: 0, total: 0 },
                '/achievement_tiers/veteran': { completed: 0, total: 0 },
                '/achievement_tiers/elite': { completed: 0, total: 0 },
                '/achievement_tiers/champion': { completed: 0, total: 0 }
            };
            for (const hrid in achievementDetailMap) {
                const detail = achievementDetailMap[hrid];
                if (detail && detail.tierHrid && tierCounts[detail.tierHrid]) {
                    tierCounts[detail.tierHrid].total++;
                }
            }
            achievements.forEach(ach => {
                if (ach.isCompleted) {
                    const detail = achievementDetailMap[ach.achievementHrid];
                    if (detail && detail.tierHrid && tierCounts[detail.tierHrid]) {
                        tierCounts[detail.tierHrid].completed++;
                    }
                }
            });
            const completedTiers = [];
            const tierOrder = ['beginner', 'novice', 'adept', 'veteran', 'elite', 'champion'];
            tierOrder.forEach(tier => {
                const tierHrid = `/achievement_tiers/${tier}`;
                const data = tierCounts[tierHrid];
                if (data && data.completed > 0 && data.completed === data.total) {
                    completedTiers.push(tier);
                }
            });
            return completedTiers;
        }
        function generateAchievementIconsHTML() {
            const completedTiers = getCompletedAchievementTiers();
            const iconConfig = {
                beginner: { sprite: 'buffs', id: 'gathering' },
                novice: { sprite: 'buffs', id: 'wisdom' },
                adept: { sprite: 'buffs', id: 'efficiency' },
                veteran: { sprite: 'items', id: 'butter_of_proficiency' },
                elite: { sprite: 'misc', id: 'combat' },
                champion: { sprite: 'skills', id: 'enhancing' }
            };
            const spriteURLs = {
                buffs: '/static/media/buffs_sprite.cd54d85e.svg',
                items: SVGTool.getSpriteURL('items'),
                misc: SVGTool.getSpriteURL('misc'),
                skills: SVGTool.getSpriteURL('skills')
            };
            let html = '<div class="mwi-achievement-icons" style="display:flex;gap:3px;position:absolute;top:12px;left:12px;z-index:10;">';
            html += `<svg width="30" height="30" viewBox="0 0 40 40" style="width:30px;height:30px;margin-top:-2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"><g clip-path="url(#ach)"><path fill="#546DDB" d="M4 7h32v26H4z"></path><path fill="#546DDB" d="M4 7h5v26H4z"></path><path fill="#000" fill-opacity=".2" d="M4 7h5v26H4z"></path><path fill="#546DDB" d="M31 7h5v26h-5z"></path><path fill="#000" fill-opacity=".2" d="M31 7h5v26h-5z"></path><path fill="#546DDB" d="M1 7h6v26H1z"></path><path fill="#fff" fill-opacity=".6" d="M1 7h6v26H1z"></path><path fill="#546DDB" d="M33 7h6v26h-6z"></path><path fill="#fff" fill-opacity=".6" d="M33 7h6v26h-6z"></path><path d="M5 1.875C5 3.325 4.552 6 4 6S3 3.325 3 1.875C3 .425 3.448 0 4 0s1 .425 1 1.875ZM3 38.125C3 36.675 3.448 34 4 34s1 2.675 1 4.125C5 39.575 4.552 40 4 40s-1-.425-1-1.875ZM37 1.875C37 3.325 36.552 6 36 6s-1-2.675-1-4.125C35 .425 35.448 0 36 0s1 .425 1 1.875ZM35 38.125c0-1.45.448-4.125 1-4.125s1 2.675 1 4.125c0 1.45-.448 1.875-1 1.875s-1-.425-1-1.875Z" fill="#C57A09"></path><rect y="5" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect y="5" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><rect y="33" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect y="33" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><rect x="32" y="5" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect x="32" y="5" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><rect x="32" y="33" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect x="32" y="33" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><path d="M18.99 11.846c.382-.886 1.639-.886 2.02 0l1.706 3.96c.16.37.508.624.909.66l4.293.399c.961.09 1.35 1.285.625 1.922l-3.24 2.846a1.1 1.1 0 0 0-.347 1.068l.948 4.206c.212.942-.805 1.68-1.635 1.188l-3.707-2.201a1.1 1.1 0 0 0-1.124 0l-3.707 2.201c-.83.493-1.847-.246-1.635-1.188l.948-4.206a1.1 1.1 0 0 0-.347-1.069l-3.24-2.845c-.725-.637-.336-1.833.625-1.922l4.293-.398c.401-.037.75-.29.91-.66l1.705-3.961Z" fill="#FAA21E"></path></g></svg>`;
            completedTiers.forEach(tier => {
                const config = iconConfig[tier];
                if (config) {
                    const spriteURL = spriteURLs[config.sprite];
                    html += `<svg width="24" height="24" viewBox="0 0 24 24" style="width:26px;height:26px;border:1px solid #59d0b9;border-radius:4px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"><use href="${spriteURL}#${config.id}"></use></svg>`;
                }
            });
            html += '</div>';
            return html;
        }
        async function generateCharacterCard() {
            const existingContainer = document.querySelector('.mwi-card-container');
            if (existingContainer) return;
            if (!DataStore.characterSkills || DataStore.characterSkills.length === 0) {
                alert('Data not loaded!' + String.fromCharCode(10) + String.fromCharCode(10) + 'Please refresh the page and wait for data to auto-load (about 3 seconds)');
                return;
            }
            const container = document.createElement('div');
            container.className = 'mwi-card-container';
            let bgImageDataURL = '';
            if (CARD_BACKGROUND_IMAGE && CARD_BACKGROUND_IMAGE.trim() !== '') {
                try {
                    bgImageDataURL = BackgroundImagePreloader.getCached();
                    if (!bgImageDataURL) {
                        bgImageDataURL = await BackgroundImagePreloader.preload();
                    }
                    if (!bgImageDataURL) {
                        throw new Error('Failed to load background image');
                    }
                } catch (error) {
                    bgImageDataURL = '';
                }
            } else {
                const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                const message = lang === 'zh' 
                    ? '错误:未配置名片背景图!' + String.fromCharCode(10) + String.fromCharCode(10) + '请在脚本中设置CARD_BACKGROUND_IMAGE变量'
                    : 'Error: Card background image not configured!' + String.fromCharCode(10) + String.fromCharCode(10) + 'Please set CARD_BACKGROUND_IMAGE variable in the script';
                alert(message);
                return;
            }
            const bgImageStyle = bgImageDataURL ? `background-image: url(${bgImageDataURL});` : '';
            const borderGradient = generateRandomGradientBorder();
            container.innerHTML = `
                <div class="mwi-character-card" id="mwi-card-content" style="${bgImageStyle} --card-border-gradient: ${borderGradient};" data-border-gradient="${borderGradient}">
                    <div style="text-align: center; padding: 40px; color: #94a3b8;">Generating...</div>
                </div>
            `;
            document.body.appendChild(container);
            setTimeout(() => renderCard(), 100);
        }
        function renderCard() {
            const cardContent = document.getElementById('mwi-card-content');
            if (!cardContent) return;
            const container = cardContent.parentElement;
            if (!container) return;
            const borderGradient = cardContent.getAttribute('data-border-gradient') || generateRandomGradientBorder();
            SVGTool.refreshFromDOM();
            ClientData.init();
            const isZH = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
            const nameElementHTML = DataStore.nameElementHTML;
            const chatIconSpriteURL = SVGTool.getSpriteURL('chat_icons');
            const avatarsSpriteURL = SVGTool.getSpriteURL('avatars');
            const avatarOutfitsSpriteURL = SVGTool.getSpriteURL('avatar_outfits');
            const chatIconId = DataStore.chatIconHrid ? DataStore.chatIconHrid.split('/').pop() : null;
            const supporterBadgeId = DataStore.supporterBadgeHrid ? DataStore.supporterBadgeHrid.split('/').pop() : null;
            const avatarId = DataStore.avatarHrid ? DataStore.avatarHrid.split('/').pop() : null;
            const outfitId = DataStore.outfitHrid ? DataStore.outfitHrid.split('/').pop() : null;
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            const achievementIconsHTML = generateAchievementIconsHTML();
            let html = `
                ${achievementIconsHTML}
                <div class="mwi-card-body" data-lang="${currentLang}" style="position:relative;">
                    <div class="mwi-card-timestamp">${timestamp}</div>
            `;
            html += `
                    <div class="mwi-card-character">
            `;
            html += `
                <div class="mwi-card-section">
                    <div class="mwi-character-info-container">
            `;
            if (supporterBadgeId || chatIconId || nameElementHTML || DataStore.characterName) {
                html += `
                    <div class="mwi-character-info-top" style="--name-border-gradient: ${borderGradient};">
                `;
                if (supporterBadgeId) {
                    html += `
                        <svg class="mwi-character-supporter-badge" width="40" height="40" viewBox="0 0 24 24">
                            <use href="${chatIconSpriteURL}#${supporterBadgeId}"></use>
                        </svg>
                    `;
                }
                if (chatIconId) {
                    html += `
                        <svg class="mwi-character-chat-icon" width="40" height="40" viewBox="0 0 24 24">
                            <use href="${chatIconSpriteURL}#${chatIconId}"></use>
                        </svg>
                    `;
                }
                if (nameElementHTML) {
                    const _iconCount = (supporterBadgeId ? 1 : 0) + (chatIconId ? 1 : 0);
                    const _wrapperStyle = _iconCount >= 2 ? 'transform: translate(-18px, 0px);' : '';
                    html += `
                        <div class="mwi-character-id-wrapper" style="${_wrapperStyle}">
                            ${nameElementHTML}
                        </div>
                    `;
                } else if (DataStore.characterName) {
                    html += `
                        <div class="mwi-character-id" style="color: #ffffff !important;">${DataStore.characterName}</div>
                    `;
                }
                html += `
                    </div>
                `;
            }
            if (avatarId || outfitId) {
                html += `
                    <div class="mwi-character-info-bottom">
                        <div class="mwi-character-avatar-wrapper">
                `;
                if (avatarId) {
                    html += `
                            <svg class="mwi-character-avatar" width="280" height="280" viewBox="0 0 24 24">
                                <use href="${avatarsSpriteURL}#${avatarId}"></use>
                            </svg>
                    `;
                }
                if (outfitId) {
                    html += `
                            <svg class="mwi-character-outfit" width="280" height="280" viewBox="0 0 24 24">
                                <use href="${avatarOutfitsSpriteURL}#${outfitId}"></use>
                            </svg>
                    `;
                }
                html += `
                        </div>
                    </div>
                `;
            }
            html += `
                    </div>
                </div>
            `;
            html += `
                    </div>
            `;
            html += `
                    <div class="mwi-card-left">
            `;
            html += `
                <div class="mwi-card-section">
                    <div class="mwi-equipment-grid">
            `;
            const equipmentSlots = {
                '/item_locations/back': { row: 1, col: 1, name: t('back') },
                '/item_locations/head': { row: 1, col: 2, name: t('head') },
                '/item_locations/trinket': { row: 1, col: 3, name: t('trinket') },
                '/item_locations/neck': { row: 1, col: 4, name: t('neck') },
                '/item_locations/main_hand': { row: 2, col: 1, name: t('main_hand') },
                '/item_locations/body': { row: 2, col: 2, name: t('body') },
                '/item_locations/off_hand': { row: 2, col: 3, name: t('off_hand') },
                '/item_locations/earrings': { row: 2, col: 4, name: t('earrings') },
                '/item_locations/hands': { row: 3, col: 1, name: t('hands') },
                '/item_locations/legs': { row: 3, col: 2, name: t('legs') },
                '/item_locations/pouch': { row: 3, col: 3, name: t('pouch') },
                '/item_locations/ring': { row: 3, col: 4, name: t('ring') },
                '/item_locations/feet': { row: 4, col: 2, name: t('feet') },
                '/item_locations/charm': { row: 4, col: 4, name: t('charm') },
                '/item_locations/two_hand': { row: 2, col: 1, name: t('two_hand'), colspan: 2 }
            };
            const hasTwoHand = !!DataStore.currentEquipmentMap['/item_locations/two_hand'];
            for (let row = 1; row <= 4; row++) {
                for (let col = 1; col <= 4; col++) {
                    if ((row === 4 && col === 1) || (row === 4 && col === 3)) {
                        html += `<div style="width: 60px; height: 60px;"></div>`;
                        continue;
                    }
                    let slotEntry = Object.entries(equipmentSlots).find(([_, slot]) => 
                        slot.row === row && slot.col === col
                    );
                    if (row === 2 && col === 1 && hasTwoHand) {
                        slotEntry = ['/item_locations/two_hand', equipmentSlots['/item_locations/two_hand']];
                    }
                    if (row === 2 && col === 3 && hasTwoHand) {
                        slotEntry = null;
                    }
                    if (slotEntry) {
                        const [slotHrid, slotInfo] = slotEntry;
                        const item = DataStore.currentEquipmentMap[slotHrid];
                        if (item) {
                            const itemDetail = DataStore.itemDetailMap?.[item.itemHrid];
                            const itemName = itemDetail?.name || item.itemHrid.split('/').pop();
                            const enhance = item.enhancementLevel || 0;
                            const itemLevel = itemDetail?.itemLevel || 0;
                            const iconId = item.itemHrid.split('/').pop();
                            const spriteURL = SVGTool.getSpriteURL('items');
                            html += `
                                <div class="mwi-equipment-slot filled" title="${itemName}${enhance > 0 ? ` +${enhance}` : ''}">
                                    <svg viewBox="0 0 42 42">
                                        <use href="${spriteURL}#${iconId}"></use>
                                    </svg>
                                    ${enhance > 0 ? `<div class="mwi-enhance-level">+${enhance}</div>` : ''}
                                    ${itemLevel > 0 ? `<div class="mwi-item-level">${itemLevel}</div>` : ''}
                                </div>
                            `;
                        } else {
                            html += `
                                <div class="mwi-equipment-slot empty"></div>
                            `;
                        }
                    } else {
                        html += `<div class="mwi-equipment-slot empty" style="opacity: 0.3;"></div>`;
                    }
                }
            }
            html += `</div></div>`;
            const stamina = DataStore.characterSkills.find(s => s.skillHrid === '/skills/stamina')?.level || 0;
            const intelligence = DataStore.characterSkills.find(s => s.skillHrid === '/skills/intelligence')?.level || 0;
            const attack = DataStore.characterSkills.find(s => s.skillHrid === '/skills/attack')?.level || 0;
            const defense = DataStore.characterSkills.find(s => s.skillHrid === '/skills/defense')?.level || 0;
            const melee = DataStore.characterSkills.find(s => s.skillHrid === '/skills/melee')?.level || 0;
            const ranged = DataStore.characterSkills.find(s => s.skillHrid === '/skills/ranged')?.level || 0;
            const magic = DataStore.characterSkills.find(s => s.skillHrid === '/skills/magic')?.level || 0;
            const maxCombatSkill = Math.max(melee, ranged, magic);
            const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
            const combatLevel = Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);
            const firstRowStats = [
                { hrid: '/skills/intelligence', name: t('intelligence'), level: intelligence },
                { hrid: '/skills/stamina', name: t('stamina'), level: stamina },
                { hrid: '/skills/attack', name: t('attack'), level: attack }
            ].sort((a, b) => b.level - a.level);
            const secondRowStats = [
                { hrid: '/skills/magic', name: t('magic'), level: magic },
                { hrid: '/skills/melee', name: t('melee'), level: melee },
                { hrid: '/skills/ranged', name: t('ranged'), level: ranged },
                { hrid: '/skills/defense', name: t('defense'), level: defense }
            ].sort((a, b) => b.level - a.level);
            html += `
                <div class="mwi-card-section">
                    <div class="mwi-stats-grid">
            `;
            const miscSpriteURL = SVGTool.getSpriteURL('misc');
            const skillsSpriteURL = SVGTool.getSpriteURL('skills');
            const combatLevelClass = combatLevel >= 140 ? 'highlight' : '';
            html += `
                <div class="mwi-stat-item">
                    <span class="mwi-stat-label">${t('combat')}</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
                        <use href="${miscSpriteURL}#combat"></use>
                    </svg>
                    <span class="mwi-stat-value ${combatLevelClass}" style="overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size:14px;font-weight:bold;">Lv.${combatLevel}</span>
                </div>
            `;
            firstRowStats.forEach(stat => {
                const name = stat.hrid.split('/').pop();
                const levelClass = stat.level >= 140 ? 'highlight' : '';
                html += `
                    <div class="mwi-stat-item">
                        <span class="mwi-stat-label">${stat.name}</span>
                        <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
                            <use href="${skillsSpriteURL}#${name}"></use>
                        </svg>
                        <span class="mwi-stat-value ${levelClass}" style="overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size: 14px; font-weight: bold;">Lv.${stat.level}</span>
                    </div>
                `;
            });
            secondRowStats.forEach(stat => {
                const name = stat.hrid.split('/').pop();
                const levelClass = stat.level >= 140 ? 'highlight' : '';
                html += `
                    <div class="mwi-stat-item">
                        <span class="mwi-stat-label">${stat.name}</span>
                        <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
                            <use href="${skillsSpriteURL}#${name}"></use>
                        </svg>
                        <span class="mwi-stat-value ${levelClass}" style="overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size:14px;font-weight:bold;">Lv.${stat.level}</span>
                    </div>
                `;
            });
            html += `</div></div>`;
            html += `
                    </div>
            `;
            html += `
                    <div class="mwi-card-right">
            `;
            const productionToolSlots = [
                "/item_locations/woodcutting_tool",
                "/item_locations/foraging_tool",
                "/item_locations/milking_tool",
                "/item_locations/cheesesmithing_tool",
                "/item_locations/crafting_tool",
                "/item_locations/tailoring_tool",
                "/item_locations/cooking_tool",
                "/item_locations/brewing_tool",
                "/item_locations/alchemy_tool",
                "/item_locations/enhancing_tool"
            ];
            html += `
                <div class="mwi-card-section">
                    <div class="mwi-equipment-grid" style="grid-template-columns:repeat(5,46px);grid-template-rows:repeat(2,46px);width:294px;height:154px;margin:0 auto;padding:10px 15px;gap:8px;box-sizing:border-box;justify-content:center;align-content:center;">
            `;
            for (const slot of productionToolSlots) {
                const item = DataStore.currentEquipmentMap[slot];
                if (item) {
                    const itemDetail = DataStore.itemDetailMap?.[item.itemHrid];
                    const itemName = itemDetail?.name || item.itemHrid.split('/').pop();
                    const enhance = item.enhancementLevel || 0;
                    const iconId = item.itemHrid.split('/').pop();
                    const spriteURL = SVGTool.getSpriteURL('items');
                    html += `
                        <div class="mwi-equipment-slot filled" title="${itemName}${enhance > 0 ? ` +${enhance}` : ''}" style="width:100%;height:100%;">
                            <svg viewBox="0 0 42 42">
                                <use href="${spriteURL}#${iconId}"></use>
                            </svg>
                            ${enhance > 0 ? `<div class="mwi-enhance-level">+${enhance}</div>` : ''}
                        </div>
                    `;
                } else {
                    html += `<div class="mwi-equipment-slot empty" style="width:100%;height:100%;"></div>`;
                }
            }
            html += `
                    </div>
                </div>
            `;
            const houseRooms = DataStore.characterHouseRoomMap || {};
            const firstRowRooms = [
                { hrid: '/house_rooms/dojo', icon: 'attack', name: t('dojo') },
                { hrid: '/house_rooms/library', icon: 'intelligence', name: t('library') },
                { hrid: '/house_rooms/dining_room', icon: 'stamina', name: t('dining_room') }
            ];
            const secondRowRooms = [
                { hrid: '/house_rooms/mystical_study', icon: 'magic', name: t('mystical_study') },
                { hrid: '/house_rooms/armory', icon: 'defense', name: t('armory') },
                { hrid: '/house_rooms/gym', icon: 'melee', name: t('gym') },
                { hrid: '/house_rooms/archery_range', icon: 'ranged', name: t('archery_range') }
            ];
            const existingFirstRow = firstRowRooms
                .filter(room => houseRooms[room.hrid])
                .sort((a, b) => {
                    const levelA = houseRooms[a.hrid]?.level || 0;
                    const levelB = houseRooms[b.hrid]?.level || 0;
                    return levelB - levelA;
                });
            const existingSecondRow = secondRowRooms
                .filter(room => houseRooms[room.hrid])
                .sort((a, b) => {
                    const levelA = houseRooms[a.hrid]?.level || 0;
                    const levelB = houseRooms[b.hrid]?.level || 0;
                    return levelB - levelA;
                });
            html += `
                <div class="mwi-card-section">
                    <div class="mwi-house-grid">
            `;
            for (let i = 0; i < 3; i++) {
                const room = existingFirstRow[i];
                if (room) {
                    const roomData = houseRooms[room.hrid];
                    const roomLevel = roomData.level || 0;
                    const spriteURL = SVGTool.getSpriteURL('skills');
                    const levelClass = roomLevel === 8 ? 'max' : 'normal';
                    html += `
                        <div class="mwi-house-item" title="${room.name} Lv.${roomLevel}">
                            <svg viewBox="0 0 42 42">
                                <use href="${spriteURL}#${room.icon}"></use>
                            </svg>
                            <div class="mwi-house-level ${levelClass}">Lv.${roomLevel}</div>
                        </div>
                    `;
                } else {
                    html += `<div class="mwi-house-item empty"></div>`;
                }
            }
            html += `<div class="mwi-house-item" style="cursor: default; display: flex; align-items: center; justify-content: center;">
                <svg viewBox="0 0 24 24" style="width: 42px; height: 42px;">
                    <use href="${miscSpriteURL}#house"></use>
                </svg>
            </div>`;
            for (let i = 0; i < 4; i++) {
                const room = existingSecondRow[i];
                if (room) {
                    const roomData = houseRooms[room.hrid];
                    const roomLevel = roomData.level || 0;
                    const spriteURL = SVGTool.getSpriteURL('skills');
                    const levelClass = roomLevel === 8 ? 'max' : 'normal';
                    html += `
                        <div class="mwi-house-item" title="${room.name} Lv.${roomLevel}">
                            <svg viewBox="0 0 42 42">
                                <use href="${spriteURL}#${room.icon}"></use>
                            </svg>
                            <div class="mwi-house-level ${levelClass}">Lv.${roomLevel}</div>
                        </div>
                    `;
                } else {
                    html += `<div class="mwi-house-item empty"></div>`;
                }
            }
            html += `</div></div>`;
            const combatAbilities = DataStore.combatUnit?.combatAbilities || [];
            const auraAbilities = [
                '/abilities/insanity',
                '/abilities/mystic_aura',
                '/abilities/critical_aura',
                '/abilities/speed_aura',
                '/abilities/fierce_aura',
                '/abilities/guardian_aura',
                '/abilities/revive',
                '/abilities/invincible'
            ];
            const equippedNormalAbilities = [];
            const equippedAuras = [];
            combatAbilities.forEach(ability => {
                if (auraAbilities.includes(ability.abilityHrid)) {
                    equippedAuras.push(ability);
                } else {
                    equippedNormalAbilities.push(ability);
                }
            });
            const equippedAbilityHrids = new Set(combatAbilities.map(a => a.abilityHrid));
            const unequippedAuras = [];
            auraAbilities.forEach(auraHrid => {
                const learnedAura = DataStore.characterAbilities.find(a => a.abilityHrid === auraHrid);
                if (learnedAura && !equippedAbilityHrids.has(auraHrid)) {
                    unequippedAuras.push(learnedAura);
                }
            });
            unequippedAuras.sort((a, b) => b.level - a.level);
            const firstRowAbilities = equippedNormalAbilities.slice(0, 4);
            const auraRowDisplay = [];
            if (equippedAuras.length > 0) {
                auraRowDisplay.push(equippedAuras[0]);
            }
            const remainingSlots = 4 - auraRowDisplay.length;
            const topUnequippedAuras = unequippedAuras.slice(0, remainingSlots);
            auraRowDisplay.push(...topUnequippedAuras);
            html += `
                <div class="mwi-card-section">
                    <div class="mwi-abilities-grid">
            `;
            for (let i = 0; i < 4; i++) {
                const ability = firstRowAbilities[i];
                if (ability && ability.abilityHrid) {
                    const abilityDetail = DataStore.abilityDetailMap?.[ability.abilityHrid];
                    const abilityName = abilityDetail?.name || ability.abilityHrid.split('/').pop();
                    const combatActionHrid = abilityDetail?.combatActionHrid || ability.abilityHrid;
                    const iconId = combatActionHrid.split('/').pop();
                    const spriteURL = SVGTool.getSpriteURL('abilities');
                    html += `
                        <div class="mwi-ability-item" title="${abilityName} Lv.${ability.level}">
                            <svg viewBox="0 0 40 40">
                                <use href="${spriteURL}#${iconId}"></use>
                            </svg>
                            <div class="mwi-ability-level">Lv.${ability.level}</div>
                        </div>
                    `;
                } else {
                    html += `<div class="mwi-ability-item empty"></div>`;
                }
            }
            for (let i = 0; i < 4; i++) {
                const aura = auraRowDisplay[i];
                if (aura && aura.abilityHrid) {
                    const abilityDetail = DataStore.abilityDetailMap?.[aura.abilityHrid];
                    const abilityName = abilityDetail?.name || aura.abilityHrid.split('/').pop();
                    const combatActionHrid = abilityDetail?.combatActionHrid || aura.abilityHrid;
                    const iconId = combatActionHrid.split('/').pop();
                    const spriteURL = SVGTool.getSpriteURL('abilities');
                    html += `
                        <div class="mwi-ability-item" title="${abilityName} Lv.${aura.level}">
                            <svg viewBox="0 0 40 40">
                                <use href="${spriteURL}#${iconId}"></use>
                            </svg>
                            <div class="mwi-ability-level">Lv.${aura.level}</div>
                        </div>
                    `;
                } else {
                    html += `<div class="mwi-ability-item empty"></div>`;
                }
            }
            html += `</div></div>`;
            html += `
                    </div>
                </div>
            `;
            cardContent.innerHTML = html;
        }
        function closeCard() {
            const container = document.querySelector('.mwi-card-container');
            if (container) {
                container.remove();
                window._MWI_UPLOAD_IN_PROGRESS = false;
                GM_setValue('mwi_card_upload_request', 0);
                GM_setValue('mwi_card_image_url', '');
                GM_setValue('mwi_card_image_timestamp', 0);
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
                cardLinkFillStatus.reset();
            }
        }
        async function autoUploadCard() {
            if (window._MWI_UPLOAD_IN_PROGRESS) {
                return;
            }
            
            const cardElement = document.getElementById('mwi-card-content');
            if (!cardElement) {
                const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                throw new Error(lang === 'zh' ? '未找到名片元素' : 'Card element not found');
            }
            
            window._MWI_UPLOAD_IN_PROGRESS = true;
            
            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
            
            const existingOverlay = document.getElementById('mwi-upload-progress-overlay');
            if (existingOverlay) {
                existingOverlay.remove();
            }
            
            const abortController = new AbortController();
            let isCancelled = false;
            
            const progressOverlay = document.createElement('div');
            progressOverlay.id = 'mwi-upload-progress-overlay';
            progressOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 999999999;
                backdrop-filter: blur(4px);
            `;
            progressOverlay.innerHTML = `
                <div style="position: relative; max-width: 90%;">
                    <button id="mwi-upload-close-btn" style="
                        position: absolute;
                        top: -40px;
                        right: 0;
                        border: none;
                        background: rgba(255, 255, 255, 0.15);
                        backdrop-filter: blur(8px);
                        color: rgba(255, 255, 255, 0.9);
                        font-size: 12px;
                        cursor: pointer;
                        padding: 6px 12px;
                        border-radius: 6px;
                        transition: background 0.2s;
                    " title="${lang === 'zh' ? '中止上传' : 'Cancel upload'}">${lang === 'zh' ? '中止上传' : 'Cancel'}</button>
                    <div style="background: white; border-radius: 12px; padding: 32px 48px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); min-width: 300px; text-align: center;">
                        <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 20px;">${lang === 'zh' ? '名片上传中...' : 'Uploading card...'}</div>
                        <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
                            <div id="mwi-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb); transition: width 0.3s;"></div>
                        </div>
                        <div id="mwi-progress-text" style="font-size: 14px; color: #666;">${lang === 'zh' ? '准备中...' : 'Preparing...'}</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(progressOverlay);
            
            const closeBtn = document.getElementById('mwi-upload-close-btn');
            closeBtn.addEventListener('mouseover', () => { closeBtn.style.background = 'rgba(255, 255, 255, 0.25)'; });
            closeBtn.addEventListener('mouseout', () => { closeBtn.style.background = 'rgba(255, 255, 255, 0.15)'; });
            closeBtn.addEventListener('click', () => {
                isCancelled = true;
                abortController.abort();
                progressOverlay.remove();
                closeCard();
                window._MWI_UPLOAD_IN_PROGRESS = false;
                GM_setValue('mwi_card_upload_request', 0);
                GM_setValue('mwi_card_image_url', '');
                GM_setValue('mwi_card_image_timestamp', 0);
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
                cardLinkFillStatus.reset();
            });
            
            const progressBar = document.getElementById('mwi-progress-bar');
            const progressText = document.getElementById('mwi-progress-text');
            function updateProgress(percent, text) {
                if (isCancelled) return;
                if (progressBar) progressBar.style.width = percent + '%';
                if (progressText) progressText.textContent = text;
            }
            try {
                if (isCancelled) return;
                updateProgress(10, lang === 'zh' ? '生成截图中...' : 'Generating screenshot...');
                const cardContainer = cardElement.closest('.mwi-card-container');
                const savedContainerCss = cardContainer ? cardContainer.style.cssText : '';
                const savedCardCss = cardElement.style.cssText;
                if (cardContainer) cardContainer.style.cssText += ';max-width:none!important;width:940px!important;overflow:visible!important;';
                cardElement.style.cssText += ';width:940px!important;height:520px!important;';
                await new Promise(r => setTimeout(r, 50));
                const canvas = await SnapDOM.toCanvas(cardElement, {
                    width: 940,
                    height: 520,
                    backgroundColor: '#1a1a2e',
                    scale: 2,
                    logging: false
                });
                if (cardContainer) cardContainer.style.cssText = savedContainerCss;
                cardElement.style.cssText = savedCardCss;
                if (isCancelled) throw new Error('cancelled');
                updateProgress(30, lang === 'zh' ? '转换图片中...' : 'Converting image...');
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(blob => {
                        if (!blob) reject(new Error(lang === 'zh' ? 'Canvas转换Blob失败' : 'Canvas to Blob conversion failed'));
                        else resolve(blob);
                    }, 'image/png', 1.0);
                });
                if (isCancelled) throw new Error('cancelled');
                updateProgress(50, lang === 'zh' ? '截图完成,开始上传...' : 'Screenshot complete, uploading...');
                const UPLOAD_ENDPOINT = 'https://tupian.li/api/v1/upload';
                updateProgress(80, lang === 'zh' ? '正在上传图片...需要2分钟' : 'Uploading image... may take 2 minutes');
                const formData = new FormData();
                formData.append('file', blob, 'character-card.png');
                let uploadResp;
                let lastError;
                const maxRetries = 3;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        if (isCancelled) throw new Error('cancelled');
                        if (attempt > 1) {
                            const retryText = lang === 'zh' 
                                ? `重试上传 (${attempt}/${maxRetries})...`
                                : `Retrying upload (${attempt}/${maxRetries})...`;
                            updateProgress(80 + (attempt - 1) * 3, retryText);
                            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                        }
                        uploadResp = await fetch(UPLOAD_ENDPOINT, {
                            method: 'POST',
                            body: formData,
                            signal: abortController.signal
                        });
                        if (uploadResp.ok) {
                            break;
                        }
                        lastError = new Error(lang === 'zh' ? `状态码: ${uploadResp.status}` : `Status code: ${uploadResp.status}`);
                        if (attempt === maxRetries) {
                            throw lastError;
                        }
                    } catch (error) {
                        if (isCancelled || error.name === 'AbortError' || error.message === 'cancelled') {
                            throw new Error('cancelled');
                        }
                        lastError = error;
                        if (attempt === maxRetries) {
                            const errorMsg = lang === 'zh'
                                ? `上传失败 (已重试${maxRetries}次): ${error.message}`
                                : `Upload failed (retried ${maxRetries} times): ${error.message}`;
                            throw new Error(errorMsg);
                        }
                    }
                }
                if (!uploadResp || !uploadResp.ok) {
                    throw lastError || new Error(lang === 'zh' ? '上传失败' : 'Upload failed');
                }
                if (isCancelled) throw new Error('cancelled');
                updateProgress(90, lang === 'zh' ? '处理响应...' : 'Processing response...');
                const data = await uploadResp.json();
                let imageUrl = null;
                if (data && typeof data === 'object' && data.status === true && data.data && data.data.pathname) {
                    imageUrl = 'https://tupian.li/images/' + data.data.pathname;
                } else if (data && typeof data === 'object' && data.success && data.data && data.data.url) {
                    imageUrl = data.data.url;
                } else if (data && typeof data === 'object' && data.url) {
                    imageUrl = data.url;
                } else if (data && typeof data === 'object' && data.link) {
                    imageUrl = data.link;
                }
                if (!imageUrl) {
                    throw new Error(lang === 'zh' ? '无法解析API返回的图片链接' : 'Unable to parse image link from API response');
                }
                if (isCancelled) throw new Error('cancelled');
                updateProgress(100, lang === 'zh' ? '名片上传成功!' : 'Card upload successful!');
                const timestamp = Date.now();
                GM_setValue('mwi_card_image_url', imageUrl);
                GM_setValue('mwi_card_image_timestamp', timestamp);
                
                if (typeof window.__fillCardLink__ === 'function') {
                    window.__fillCardLink__(imageUrl);
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                const savedUrl = GM_getValue('mwi_card_image_url', '');
                const savedTimestamp = GM_getValue('mwi_card_image_timestamp', 0);
                if (savedUrl !== imageUrl || savedTimestamp !== timestamp) {
                    GM_setValue('mwi_card_image_url', imageUrl);
                    GM_setValue('mwi_card_image_timestamp', timestamp);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                setTimeout(() => {
                    progressOverlay.remove();
                    closeCard();
                    window._MWI_UPLOAD_IN_PROGRESS = false;
                }, 800);
                return imageUrl;
            } catch (error) {
                if (isCancelled || error.message === 'cancelled') {
                    return;
                }
                progressOverlay.innerHTML = `
                    <div style="background: white; border-radius: 12px; padding: 32px 48px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); min-width: 300px; max-width: 90%; text-align: center;">
                        <div style="color: #ef4444; font-size: 16px; margin-bottom: 10px;">${lang === 'zh' ? '上传失败' : 'Upload failed'}</div>
                        <div style="color: #94a3b8; font-size: 14px;">${error.message}</div>
                    </div>
                `;
                setTimeout(() => {
                    progressOverlay.remove();
                }, 3000);
                throw error;
            }
        }
        if (!isSimulatorPage) {
            WebSocketHook.install();
        }
    
        const EQUIP_SLOTS = ['head', 'body', 'legs', 'feet', 'hands', 'weapon', 'off_hand', 'pouch', 'neck', 'earrings', 'ring', 'back', 'charm'];
        const LEVEL_TYPES = ['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'];
        const ABILITY_SLOT_COUNT = 5;
        const PLAYER_COUNT = 5;
    
        const SimulatorBuildScore = {
            playerData: {},
            clientDataLoaded: false,
            calculating: {},
            extraItems: {},
            extraItemsCaptured: {},
    
            init() {
                if (!isSimulatorPage) return;
                this.loadClientData();
                this.injectStyles();
                this.waitForDOM();
            },
    
            loadClientData() {
                if (this.clientDataLoaded) return true;
                try {
                    const compressed = GM_getValue('mwi_client_data_for_sim', '');
                    if (!compressed) return false;
                    const json = LZString.decompressFromUTF16(compressed);
                    if (!json) return false;
                    BuildScoreModule.initClientData(JSON.parse(json));
                    this.clientDataLoaded = true;
                    return true;
                } catch (e) {
                    return false;
                }
            },
    
            injectStyles() {
                const style = document.createElement('style');
                style.textContent = '.tm-bs-badge { display:inline-block; font-size:14px; font-weight:700; color:#fbbf24; background:rgba(251,191,36,0.15); border:1px solid rgba(251,191,36,0.3); border-radius:4px; padding:1px 6px; margin-left:6px; line-height:22px; vertical-align:middle; white-space:nowrap; transition:all .3s ease; }' +
                    '.tm-bs-badge.calculating { color:#94a3b8; background:rgba(148,163,184,0.15); border-color:rgba(148,163,184,0.3); }' +
                    '.tm-bs-summary { display:flex; gap:8px; padding:6px 12px; background:rgba(30,41,59,0.8); border:1px solid rgba(148,163,184,0.2); border-radius:6px; margin:8px 0; font-size:12px; color:#e2e8f0; flex-wrap:wrap; align-items:center; }' +
                    '.tm-bs-summary-item { display:flex; align-items:center; gap:4px; }' +
                    '.tm-bs-summary-label { color:#94a3b8; }' +
                    '.tm-bs-summary-value { color:#fbbf24; font-weight:700; font-size:15px; }' +
                    '.tm-bs-summary-total { color:#f59e0b; font-weight:700; font-size:20px; }' +
                    '.tm-bs-recalc { cursor:pointer; color:#94a3b8; font-size:11px; margin-left:auto; padding:2px 8px; border:1px solid rgba(148,163,184,0.3); border-radius:3px; background:transparent; transition:all .2s; }' +
                    '.tm-bs-recalc:hover { color:#fbbf24; border-color:rgba(251,191,36,0.4); }' +
                    'a[id^="player"][id$="-tab"]:focus, a[id^="player"][id$="-tab"]:focus-visible { outline:none !important; box-shadow:none !important; }';
                document.head.appendChild(style);
            },
    
            _getActivePlayerIdx() {
                const tab = document.querySelector('a.nav-link.active[id^="player"][id$="-tab"]');
                return tab ? parseInt(tab.id.replace('player', '').replace('-tab', '')) : 0;
            },
    
            _interceptInputValue(input, onValueSet) {
                if (!input || input._tmBsHooked) return;
                input._tmBsHooked = true;
                const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                if (desc && desc.set) {
                    const origSet = desc.set;
                    Object.defineProperty(input, 'value', {
                        get() { return desc.get.call(this); },
                        set(val) { origSet.call(this, val); if (val) onValueSet(val); },
                        configurable: true
                    });
                }
                input.addEventListener('input', () => { if (input.value) onValueSet(input.value); });
            },
    
            _listenChange(el, handler) {
                if (!el) return;
                el.addEventListener('change', handler);
                if (el.tagName === 'INPUT') el.addEventListener('input', handler);
            },
    
            waitForDOM() {
                var self = this;
                var check = function() {
                    var firstTab = document.querySelector('a#player1-tab');
                    if (firstTab) {
                        for (var t = 1; t <= PLAYER_COUNT; t++) {
                            var pt = document.querySelector('a#player' + t + '-tab');
                            if (pt) pt.spellcheck = false;
                        }
                        self.hookImportButton();
                        self.observeTabChanges();
                        self.observeFormChanges();
                        self.observeModalCheckboxes();
                        self.tryReadExistingData();
                        return;
                    }
                    setTimeout(check, 300);
                };
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', check);
                } else {
                    check();
                }
            },
    
            hookImportButton() {
                var self = this;
                var check = function() {
                    var importBtn = document.querySelector('button#buttonImportSet');
                    if (!importBtn) {
                        setTimeout(check, 300);
                        return;
                    }
                    if (importBtn._tmBsHooked) return;
                    importBtn._tmBsHooked = true;
    
                    importBtn.addEventListener('click', function() {
                        setTimeout(function() {
                            self.readImportedData();
                            for (var pp = 1; pp <= PLAYER_COUNT; pp++) {
                                self.readPerPlayerImportedData(pp);
                            }
                        }, 200);
                    });
    
                    var inputElem = document.querySelector('input#inputSetGroupCombatAll');
                    if (inputElem) {
                        var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                        if (desc && desc.set) {
                            var origSet = desc.set;
                            Object.defineProperty(inputElem, 'value', {
                                get: function() { return desc.get.call(this); },
                                set: function(val) {
                                    origSet.call(this, val);
                                    if (val) {
                                        self._pendingImportData = val;
                                        setTimeout(function() { self.readImportedData(); }, 300);
                                    }
                                },
                                configurable: true
                            });
                        }
                        inputElem.addEventListener('input', function() {
                            if (inputElem.value) {
                                setTimeout(function() { self.readImportedData(); }, 300);
                            }
                        });
                    }
    
                    for (var pi = 1; pi <= PLAYER_COUNT; pi++) {
                        (function(idx) {
                            var perPlayerInput = document.querySelector('input#inputSetGroupCombatplayer' + idx);
                            if (perPlayerInput && !perPlayerInput._tmBsHooked) {
                                perPlayerInput._tmBsHooked = true;
                                var ppDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                                if (ppDesc && ppDesc.set) {
                                    var origPPSet = ppDesc.set;
                                    Object.defineProperty(perPlayerInput, 'value', {
                                        get: function() { return ppDesc.get.call(this); },
                                        set: function(val) {
                                            origPPSet.call(this, val);
                                            if (val) setTimeout(function() { self.readPerPlayerImportedData(idx); }, 300);
                                        },
                                        configurable: true
                                    });
                                }
                                perPlayerInput.addEventListener('input', function() {
                                    if (perPlayerInput.value) setTimeout(function() { self.readPerPlayerImportedData(idx); }, 300);
                                });
                            }
                        })(pi);
                    }
    
                    var soloImportBtn = document.querySelector('button#buttonImportSolo');
                    if (soloImportBtn && !soloImportBtn._tmBsHooked) {
                        soloImportBtn._tmBsHooked = true;
                        soloImportBtn.addEventListener('click', function() {
                            setTimeout(function() { self.readSoloImportedData(); }, 200);
                        });
                    }
    
                    var soloInput = document.querySelector('input#inputSetSolo');
                    if (soloInput && !soloInput._tmBsHooked) {
                        soloInput._tmBsHooked = true;
                        var soloDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                        if (soloDesc && soloDesc.set) {
                            var origSoloSet = soloDesc.set;
                            Object.defineProperty(soloInput, 'value', {
                                get: function() { return soloDesc.get.call(this); },
                                set: function(val) {
                                    origSoloSet.call(this, val);
                                    if (val) {
                                        setTimeout(function() { self.readSoloImportedData(); }, 300);
                                    }
                                },
                                configurable: true
                            });
                        }
                        soloInput.addEventListener('input', function() {
                            if (soloInput.value) {
                                setTimeout(function() { self.readSoloImportedData(); }, 300);
                            }
                        });
                    }
                };
                check();
            },
    
            readImportedData() {
                try {
                    var rawData = this._pendingImportData || null;
                    this._pendingImportData = null;
                    if (!rawData) {
                        var inputElem = document.querySelector('input#inputSetGroupCombatAll');
                        if (inputElem) rawData = inputElem.value;
                    }
                    if (!rawData) return;
                    var exportObj = JSON.parse(rawData);
                    for (var i = 1; i <= PLAYER_COUNT; i++) {
                        if (exportObj[i]) {
                            var pds = typeof exportObj[i] === 'string' ? exportObj[i] : JSON.stringify(exportObj[i]);
                            this.playerData[i] = JSON.parse(pds);
                            if (this.playerData[i].characterName) {
                                this.playerData[i]._characterName = this.playerData[i].characterName;
                            }
                        }
                    }
                    this.extraItems = {};
                    this.extraItemsCaptured = {};
                    this.readPlayerNamesFromTabs();
                    this.recalculateAll();
                } catch (e) { /* silent */ }
            },
    
            readSoloImportedData() {
                try {
                    var inputElem = document.querySelector('input#inputSetSolo');
                    if (!inputElem || !inputElem.value) return;
                    var playerData = JSON.parse(inputElem.value);
                    var playerIdx = this._getActivePlayerIdx() || 1;
                    this.playerData[playerIdx] = playerData;
                    if (playerData.characterName) {
                        this.playerData[playerIdx]._characterName = playerData.characterName;
                    }
                    delete this.extraItems[playerIdx];
                    delete this.extraItemsCaptured[playerIdx];
                    this.readPlayerNamesFromTabs();
                    this.recalculatePlayer(playerIdx);
                } catch (e) { /* silent */ }
            },
    
            readPerPlayerImportedData(playerIdx) {
                try {
                    var inputElem = document.querySelector('input#inputSetGroupCombatplayer' + playerIdx);
                    if (!inputElem || !inputElem.value) return;
                    var playerData = JSON.parse(inputElem.value);
                    this.playerData[playerIdx] = playerData;
                    if (playerData.characterName) {
                        this.playerData[playerIdx]._characterName = playerData.characterName;
                    }
                    delete this.extraItems[playerIdx];
                    delete this.extraItemsCaptured[playerIdx];
                    this.readPlayerNamesFromTabs();
                    this.recalculatePlayer(playerIdx);
                } catch (e) { /* silent */ }
            },
    
            readPlayerNamesFromTabs() {
                for (var i = 1; i <= PLAYER_COUNT; i++) {
                    var tab = document.querySelector('a#player' + i + '-tab');
                    if (!tab || !this.playerData[i]) continue;
                    var badge = tab.querySelector('.tm-bs-badge');
                    var name = tab.textContent.trim();
                    if (badge) name = name.replace(badge.textContent, '').trim();
                    this.playerData[i]._characterName = this.playerData[i].characterName
                        || (name && name !== 'Player ' + i ? name : null)
                        || 'Player ' + i;
                }
            },
    
            tryReadExistingData() {
                var self = this;
                setTimeout(function() {
                    var inputElem = document.querySelector('input#inputSetGroupCombatAll');
                    if (inputElem && inputElem.value) {
                        self.readImportedData();
                        return;
                    }
                    var hasNamedTabs = false;
                    for (var i = 1; i <= PLAYER_COUNT; i++) {
                        var tab = document.querySelector('a#player' + i + '-tab');
                        if (tab) {
                            var name = tab.textContent.trim();
                            if (name && name !== 'Player ' + i) {
                                hasNamedTabs = true;
                                break;
                            }
                        }
                    }
                    if (hasNamedTabs) {
                        setTimeout(function() {
                            var inp = document.querySelector('input#inputSetGroupCombatAll');
                            if (inp && inp.value) {
                                self.readImportedData();
                            }
                        }, 2000);
                    }
                }, 500);
            },
    
            observeTabChanges() {
                var tabList = document.querySelector('#playerTab');
                if (!tabList) return;
                var self = this;
    
                var observer = new MutationObserver(function(mutations) {
                    for (var k = 0; k < mutations.length; k++) {
                        var m = mutations[k];
                        if (m.type === 'characterData' || m.type === 'childList') {
                            var target = m.target.closest ? m.target.closest('.nav-link') :
                                        (m.target.parentElement && m.target.parentElement.closest ? m.target.parentElement.closest('.nav-link') : null);
                            if (target && target.id && /^player\d+-tab$/.test(target.id)) {
                                var idx = parseInt(target.id.replace('player', '').replace('-tab', ''));
                                if (self.playerData[idx]) {
                                    var badge = target.querySelector('.tm-bs-badge');
                                    var nm = target.textContent.trim();
                                    if (badge) nm = nm.replace(badge.textContent, '').trim();
                                    if (nm && nm !== 'Player ' + idx) {
                                        self.playerData[idx]._characterName = nm;
                                    }
                                }
                            }
                        }
                    }
                });
                observer.observe(tabList, { childList: true, subtree: true, characterData: true });
            },
    
            observeFormChanges() {
                var self = this;
                var debounceTimer = null;
                var handleChange = function() {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(function() {
                        var idx = self._getActivePlayerIdx();
                        if (idx) self.readPlayerStateFromDOM(idx);
                    }, 800);
                };
                for (var i = 0; i < EQUIP_SLOTS.length; i++) {
                    this._listenChange(document.getElementById('selectEquipment_' + EQUIP_SLOTS[i]), handleChange);
                    this._listenChange(document.getElementById('inputEquipmentEnhancementLevel_' + EQUIP_SLOTS[i]), handleChange);
                }
                for (var j = 0; j < ABILITY_SLOT_COUNT; j++) {
                    this._listenChange(document.getElementById('selectAbility_' + j), handleChange);
                    this._listenChange(document.getElementById('inputAbilityLevel_' + j), handleChange);
                }
                for (var k = 0; k < LEVEL_TYPES.length; k++) {
                    this._listenChange(document.getElementById('inputLevel_' + LEVEL_TYPES[k]), handleChange);
                }
                var houseInputs = document.querySelectorAll('input[data-house-hrid]');
                for (var h = 0; h < houseInputs.length; h++) {
                    this._listenChange(houseInputs[h], handleChange);
                }
            },
    
            captureExtraItems(playerIdx) {
                var data = this.playerData[playerIdx];
                this.extraItems[playerIdx] = [];
                if (!data || !data.player || !data.player.equipment) return;
                var visibleHrids = {};
                for (var i = 0; i < EQUIP_SLOTS.length; i++) {
                    var sel = document.getElementById('selectEquipment_' + EQUIP_SLOTS[i]);
                    if (sel && sel.value) visibleHrids[sel.value] = true;
                }
                for (var j = 0; j < data.player.equipment.length; j++) {
                    var eq = data.player.equipment[j];
                    if (eq && eq.itemHrid && !visibleHrids[eq.itemHrid]) {
                        this.extraItems[playerIdx].push({
                            itemLocationHrid: eq.itemLocationHrid || '/item_locations/unknown',
                            itemHrid: eq.itemHrid,
                            enhancementLevel: eq.enhancementLevel || 0,
                            count: 1
                        });
                    }
                }
            },
    
            buildCharacterDataFromDOM() {
                var items = [];
                for (var i = 0; i < EQUIP_SLOTS.length; i++) {
                    var sel = document.getElementById('selectEquipment_' + EQUIP_SLOTS[i]);
                    if (!sel || !sel.value) continue;
                    var enh = document.getElementById('inputEquipmentEnhancementLevel_' + EQUIP_SLOTS[i]);
                    items.push({
                        itemLocationHrid: '/item_locations/equipment',
                        itemHrid: sel.value,
                        enhancementLevel: enh ? (parseInt(enh.value) || 0) : 0,
                        count: 1
                    });
                }
                var abilities = [];
                for (var j = 0; j < ABILITY_SLOT_COUNT; j++) {
                    var abSel = document.getElementById('selectAbility_' + j);
                    if (!abSel || !abSel.value) continue;
                    var abLvl = document.getElementById('inputAbilityLevel_' + j);
                    abilities.push({ abilityHrid: abSel.value, level: parseInt(abLvl ? abLvl.value : '1') || 1 });
                }
                var rooms = {};
                var houseInputs = document.querySelectorAll('input[data-house-hrid]');
                for (var h = 0; h < houseInputs.length; h++) {
                    var hrid = houseInputs[h].dataset.houseHrid;
                    var level = parseInt(houseInputs[h].value) || 0;
                    if (hrid && level > 0) rooms[hrid] = { houseRoomHrid: hrid, level: level };
                }
                return { characterHouseRoomMap: rooms, combatUnit: { combatAbilities: abilities }, characterItems: items };
            },
    
            readPlayerStateFromDOM(playerIdx) {
                if (!this.extraItemsCaptured[playerIdx] && this.playerData[playerIdx]) {
                    this.captureExtraItems(playerIdx);
                    this.extraItemsCaptured[playerIdx] = true;
                }
                var characterData = this.buildCharacterDataFromDOM();
                if (this.extraItems[playerIdx]) {
                    for (var x = 0; x < this.extraItems[playerIdx].length; x++) {
                        characterData.characterItems.push(this.extraItems[playerIdx][x]);
                    }
                }
                this._calculate(playerIdx, characterData);
            },
    
            async _calculate(playerIdx, characterData) {
                if (!this.loadClientData()) return;
                if (this.calculating[playerIdx]) return;
                this.calculating[playerIdx] = true;
                this.updateBadge(playerIdx, null, true);
                try {
                    var result = await BuildScoreModule.calculateBuildScore(characterData);
                    if (result) {
                        this.updateBadge(playerIdx, result, false);
                        this.updateDetailPanel(playerIdx, result);
                    }
                } catch (e) {
                    this.updateBadge(playerIdx, null, false);
                } finally {
                    this.calculating[playerIdx] = false;
                }
            },
    
            async recalculateAll() {
                if (!this.loadClientData()) return;
                for (var i = 1; i <= PLAYER_COUNT; i++) {
                    if (this.playerData[i]) await this.recalculatePlayer(i);
                }
            },
    
            recalculatePlayer(playerIdx) {
                var data = this.playerData[playerIdx];
                if (!data) return;
                return this._calculate(playerIdx, this.convertToCharacterData(data));
            },
    
            convertToCharacterData(pd) {
                var rooms = {};
                if (pd.houseRooms) {
                    var hrids = Object.keys(pd.houseRooms);
                    for (var h = 0; h < hrids.length; h++) {
                        rooms[hrids[h]] = { houseRoomHrid: hrids[h], level: pd.houseRooms[hrids[h]] };
                    }
                }
                var abilities = [];
                if (pd.abilities) {
                    for (var a = 0; a < pd.abilities.length; a++) {
                        var ab = pd.abilities[a];
                        if (ab && ab.abilityHrid) abilities.push({ abilityHrid: ab.abilityHrid, level: parseInt(ab.level) || 1 });
                    }
                }
                var items = [];
                if (pd.player && pd.player.equipment) {
                    for (var e = 0; e < pd.player.equipment.length; e++) {
                        var eq = pd.player.equipment[e];
                        if (eq && eq.itemHrid) {
                            items.push({ itemLocationHrid: eq.itemLocationHrid || '/item_locations/unknown', itemHrid: eq.itemHrid, enhancementLevel: eq.enhancementLevel || 0, count: 1 });
                        }
                    }
                }
                return { characterHouseRoomMap: rooms, combatUnit: { combatAbilities: abilities }, characterItems: items };
            },
    
            updateBadge(playerIdx, scoreResult, isCalculating) {
                var tab = document.querySelector('a#player' + playerIdx + '-tab');
                if (!tab) return;
                var charName = this.playerData[playerIdx] && this.playerData[playerIdx]._characterName;
                if (charName) {
                    var found = false;
                    for (var c = 0; c < tab.childNodes.length; c++) {
                        if (tab.childNodes[c].nodeType === 3) {
                            tab.childNodes[c].textContent = charName;
                            found = true;
                            break;
                        }
                    }
                    if (!found) tab.insertBefore(document.createTextNode(charName), tab.firstChild);
                }
                var badge = tab.querySelector('.tm-bs-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'tm-bs-badge';
                    tab.appendChild(badge);
                }
                if (isCalculating) {
                    badge.className = 'tm-bs-badge calculating';
                    badge.textContent = '...';
                } else if (scoreResult) {
                    badge.className = 'tm-bs-badge';
                    badge.textContent = scoreResult.total.toFixed(1);
                } else {
                    badge.className = 'tm-bs-badge calculating';
                    badge.textContent = 'N/A';
                }
            },
    
            updateDetailPanel(playerIdx, scoreResult) {
                var tabContent = document.querySelector('#player' + playerIdx);
                if (!tabContent) return;
                var panel = tabContent.querySelector('.tm-bs-summary');
                if (!panel) {
                    panel = document.createElement('div');
                    panel.className = 'tm-bs-summary';
                    tabContent.insertBefore(panel, tabContent.firstChild);
                }
                var name = (this.playerData[playerIdx] && this.playerData[playerIdx]._characterName)
                           ? this.playerData[playerIdx]._characterName : 'Player ' + playerIdx;
                var self = this;
                var _isZH = (localStorage.getItem('i18nextLng') || '').toLowerCase().startsWith('zh');
                var _lbl = _isZH
                    ? { total: '\u6218\u529b\u6253\u9020\u5206:', house: '\u623f\u5b50\u5206:', ability: '\u6280\u80fd\u5206:', equip: '\u88c5\u5907\u5206:' }
                    : { total: 'Build Score:', house: 'House:', ability: 'Ability:', equip: 'Equipment:' };
                panel.innerHTML =
                    '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + name + '</span></span>' +
                    '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.total + '</span> <span class="tm-bs-summary-total">' + scoreResult.total.toFixed(1) + '</span></span>' +
                    '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.house + '</span> <span class="tm-bs-summary-value">' + scoreResult.house.toFixed(1) + '</span></span>' +
                    '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.ability + '</span> <span class="tm-bs-summary-value">' + scoreResult.ability.toFixed(1) + '</span></span>' +
                    '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.equip + '</span> <span class="tm-bs-summary-value">' + scoreResult.equipment.toFixed(1) + '</span></span>' +
                    '<button class="tm-bs-recalc" title="Recalculate">Recalc</button>';
                panel.querySelector('.tm-bs-recalc').addEventListener('click', function() {
                    self.readImportedData();
                });
            },
    
            styleModalPlayerCheckboxes() {
                var playerInfo = [];
                for (var i = 1; i <= PLAYER_COUNT; i++) {
                    var tab = document.querySelector('a#player' + i + '-tab');
                    if (!tab) continue;
                    var badge = tab.querySelector('.tm-bs-badge');
                    if (!badge) continue;
                    var scoreText = badge.textContent.trim();
                    if (!scoreText) continue;
                    var fullText = tab.textContent.trim();
                    var name = fullText.replace(scoreText, '').trim();
                    if (!name) continue;
                    playerInfo.push({ name: name, score: scoreText, concat: name + scoreText });
                }
                if (playerInfo.length === 0) return;
                var labels = document.querySelectorAll('.modal-body .form-check-label');
                for (var k = 0; k < labels.length; k++) {
                    var label = labels[k];
                    if (label.querySelector('.tm-bs-badge')) continue;
                    var txt = label.textContent.trim();
                    for (var j = 0; j < playerInfo.length; j++) {
                        if (txt === playerInfo[j].concat) {
                            var input = label.querySelector('input');
                            if (input) {
                                label.textContent = '';
                                label.appendChild(input);
                                label.appendChild(document.createTextNode(playerInfo[j].name));
                            } else {
                                label.textContent = playerInfo[j].name;
                            }
                            var b = document.createElement('span');
                            b.className = 'tm-bs-badge';
                            b.textContent = playerInfo[j].score;
                            label.appendChild(b);
                            break;
                        }
                    }
                }
            },
    
            observeModalCheckboxes() {
                var self = this;
                var debounceTimer = null;
                var observer = new MutationObserver(function() {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(function() {
                        self.styleModalPlayerCheckboxes();
                    }, 200);
                });
                var target = document.body;
                if (target) {
                    observer.observe(target, { childList: true, subtree: true });
                }
            }
        };
    
        SimulatorBuildScore.init();
    
        const TM_BROWSER_API = 'https://papiyas.chat/api/user-data-all';
        const TMB_BLANK_PLAYER = '{"player":{"attackLevel":1,"magicLevel":1,"meleeLevel":1,"rangedLevel":1,"defenseLevel":1,"staminaLevel":1,"intelligenceLevel":1,"equipment":[]},"food":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"drinks":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"abilities":[{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"}],"triggerMap":{},"zone":"/actions/combat/fly","simulationTime":"100","houseRooms":{"/house_rooms/dairy_barn":0,"/house_rooms/garden":0,"/house_rooms/log_shed":0,"/house_rooms/forge":0,"/house_rooms/workshop":0,"/house_rooms/sewing_parlor":0,"/house_rooms/kitchen":0,"/house_rooms/brewery":0,"/house_rooms/laboratory":0,"/house_rooms/observatory":0,"/house_rooms/dining_room":0,"/house_rooms/library":0,"/house_rooms/dojo":0,"/house_rooms/gym":0,"/house_rooms/armory":0,"/house_rooms/archery_range":0,"/house_rooms/mystical_study":0}}';
    
        const TMB_I18N = {
            zh: {
                title: 'Talent Market', btn: '\u4eba\u624d\u5e02\u573a',
                job: '\u804c\u4e1a', minPower: '\u6700\u4f4e\u6218\u529b', minLevel: '\u6700\u4f4e\u7b49\u7ea7', idSearch: '\u641c\u7d22ID',
                clear: '\u6e05\u9664', all: '\u5168\u90e8',
                colId: 'ID', colJob: '\u804c\u4e1a', colPower: '\u6218\u529b\u5206', colLevel: '\u6218\u7b49', colMainAttr: '\u4e3b\u5c5e\u6027', colCard: '\u540d\u7247', colAction: '\u64cd\u4f5c',
                view: '\u67e5\u770b\u540d\u7247', add: '\u5bfc\u5165\u81f3', loading: '\u52a0\u8f7d\u4e2d...', noData: '\u672a\u627e\u5230\u7528\u6237',
                loadFail: '\u52a0\u8f7d\u5931\u8d25', parseFail: '\u89e3\u6790\u5931\u8d25', usersFound: '\u4e2a\u7528\u6237',
                tabStd: '\u6807\u51c6', tabIC: 'IC',
                loginId: '\u89d2\u8272ID', loginPwd: '\u7b80\u5386\u5bc6\u7801',
                loginBtn: '\u767b\u5f55', loginCancel: '\u53d6\u6d88', loginFail: '\u9a8c\u8bc1\u5931\u8d25',
                loginSuccess: '\u9a8c\u8bc1\u6210\u529f', loginNoPwd: '\u8be5ID\u672a\u8bbe\u7f6e\u5bc6\u7801',
                loginLocked: '\u5c1d\u8bd5\u6b21\u6570\u8fc7\u591a\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', loginVerifying: '\u9a8c\u8bc1\u4e2d...',
                authVerified: '\u5df2\u9a8c\u8bc1', authUnverified: '\u672a\u767b\u5f55',
                loginDesc: '\u8bf7\u8f93\u5165\u4eba\u624d\u5e02\u573a\u7684\u7528\u6237\u540d\u548c\u5bc6\u7801\u8fdb\u884c\u767b\u5f55\uff0c\u767b\u5f55\u540e\u624d\u53ef\u8c03\u7528\u6570\u636e\n\u5982\u679c\u6ca1\u6709\u7528\u6237\u540d\u548c\u5bc6\u7801\uff0c\u8bf7\u5148\u524d\u5f80\u4eba\u624d\u5e02\u573a\u63d0\u4ea4\u7b80\u5386\u4ee5\u83b7\u53d6\u7528\u6237\u540d\u548c\u5bc6\u7801'
            },
            en: {
                title: 'Talent Market', btn: 'Talent Market',
                job: 'Job', minPower: 'Min Power', minLevel: 'Min Level', idSearch: 'Search ID',
                clear: 'Clear', all: 'All',
                colId: 'ID', colJob: 'Job', colPower: 'Power', colLevel: 'Level', colMainAttr: 'Main Attr', colCard: 'Card', colAction: 'Action',
                view: 'View Card', add: 'Import', loading: 'Loading...', noData: 'No users found',
                loadFail: 'Failed to load', parseFail: 'Failed to parse', usersFound: 'users found',
                tabStd: 'Standard', tabIC: 'IC',
                loginId: 'Character ID', loginPwd: 'Resume Password',
                loginBtn: 'Login', loginCancel: 'Cancel', loginFail: 'Verification failed',
                loginSuccess: 'Verified', loginNoPwd: 'No password set for this ID',
                loginLocked: 'Too many attempts, try later', loginVerifying: 'Verifying...',
                authVerified: 'Verified', authUnverified: 'Not logged in',
                loginDesc: 'Please enter your Talent Market username and password to log in. You need to log in before importing data.\nIf you don\'t have an account, please submit a resume on the Talent Market website first.'
            }
        };
    
        const TalentMarketBrowser = {
            data: { standard: [], ic: [] },
            activeTab: 'standard',
            loading: false,
            panelVisible: false,
            filters: { job: '', minPower: '', minLevel: '', idSearch: '' },
            sortField: 'updateTime',
            sortDir: 'desc',
    
            _t(key) {
                var lang = (localStorage.getItem('i18nextLng') || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
                return (TMB_I18N[lang] && TMB_I18N[lang][key]) || TMB_I18N.en[key] || key;
            },
    
            _getMainAttr(u) {
                if (u._cachedMainAttr !== undefined) return u._cachedMainAttr;
                try {
                    var sd = u.simdata;
                    if (!sd) { u._cachedMainAttr = ''; return ''; }
                    var parsed = typeof sd === 'string' ? JSON.parse(sd) : sd;
                    var p = parsed.player || parsed;
                    var isZH = (localStorage.getItem('i18nextLng') || '').toLowerCase().startsWith('zh');
                    var attrs = [
                        { key: 'meleeLevel', zh: '\u8fd1\u6218', en: 'Melee' },
                        { key: 'rangedLevel', zh: '\u8fdc\u7a0b', en: 'Ranged' },
                        { key: 'magicLevel', zh: '\u9b54\u6cd5', en: 'Magic' },
                        { key: 'attackLevel', zh: '\u653b\u51fb', en: 'Attack' }
                    ];
                    var best = null;
                    for (var i = 0; i < attrs.length; i++) {
                        var val = parseInt(p[attrs[i].key]) || 0;
                        if (!best || val > best.val) best = { val: val, attr: attrs[i] };
                    }
                    var result = (!best || best.val <= 0) ? '' : best.val + ' ' + (isZH ? best.attr.zh : best.attr.en);
                    u._cachedMainAttr = result;
                    return result;
                } catch (e) { u._cachedMainAttr = ''; return ''; }
            },
    
            init() {
                if (!isSimulatorPage) return;
                this._injectStyles();
                this._waitForDOM();
            },
    
            _injectStyles() {
                var s = document.createElement('style');
                s.textContent =
                    '#tmBrowserBtn { display:inline-flex; align-items:center; gap:4px; padding:6px 16px; margin-left:8px; background:#0F95B0; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; vertical-align:middle; transition:all .2s; }' +
                    '#tmBrowserBtn:hover { background:#0D7A8E; transform:translateY(-1px); }' +
                    '#tmBrowserBtn.active { box-shadow:0 0 0 2px #0F95B0; }' +
                    '#tmBrowserOverlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; justify-content:center; align-items:center; }' +
                    '#tmBrowserOverlay.visible { display:flex; }' +
                    '#tmBrowserPanel { background:linear-gradient(135deg,hsl(190,87%,12%) 0%,hsl(190,70%,14%) 25%,hsl(190,59%,16%) 50%,hsl(190,50%,18%) 75%,hsl(190,45%,20%) 100%); border:1px solid rgba(255,255,255,0.15); border-radius:16px; width:900px; max-width:95vw; height:80vh; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.1); }' +
                    '.tmb-header { display:flex; justify-content:center; align-items:center; padding:20px 16px; background:rgba(255,255,255,0.08); border-bottom:1px solid rgba(255,255,255,0.1); flex-shrink:0; position:relative; }' +
                    '.tmb-header .tm-title { text-align:center; }' +
                    '.tmb-header .tm-title h2 { display:block; color:#e8eaed; font-size:1.8em; font-weight:600; margin:0; border:none; padding:0; line-height:1.2; }' +
                    '.tmb-close-btn { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#e8eaed; font-size:28px; font-weight:bold; cursor:pointer; padding:0; line-height:1; opacity:1; }' +
                    '.tmb-close-btn:hover { color:#64b5f6; }' +
                    '.tmb-auth-btn { position:absolute; left:12px; top:50%; transform:translateY(-50%); padding:4px 12px; font-size:13px; border-radius:6px; cursor:pointer; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); transition:all .15s; }' +
                    '.tmb-auth-btn:hover { background:rgba(255,255,255,0.15); }' +
                    '.tmb-auth-btn.verified { background:rgba(76,175,80,0.15); border-color:rgba(76,175,80,0.4); color:#66bb6a; }' +
                    '.tmb-tabs { display:flex; border-bottom:1px solid rgba(255,255,255,0.1); flex-shrink:0; }' +
                    '.tmb-tab { flex:1; padding:8px 0; text-align:center; font-size:15px; font-weight:600; color:rgba(255,255,255,0.6); background:transparent; border:none; cursor:pointer; transition:all .2s; border-bottom:2px solid transparent; }' +
                    '.tmb-tab.active { color:#e8eaed; border-bottom-color:rgba(85,155,135,0.6); background:rgba(255,255,255,0.05); }' +
                    '.tmb-tab:hover { color:rgba(255,255,255,0.85); }' +
                    '.tmb-filters { display:flex; gap:10px; padding:12px 16px; flex-wrap:wrap; align-items:center; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; margin:6px; flex-shrink:0; }' +
                    '.tmb-filter-item { display:flex; flex-direction:column; gap:2px; justify-content:center; }' +
                    '.tmb-filter-item label { font-size:15px; color:rgba(255,255,255,0.8); font-weight:500; }' +
                    '.tmb-filter-item select, .tmb-filter-item input { padding:6px 10px; font-size:15px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:6px; outline:none; min-width:120px; height:32px; }' +
                    '.tmb-filter-item select:focus, .tmb-filter-item input:focus { outline:none; border-color:rgba(255,255,255,0.4); }' +
                    '.tmb-filter-item select option { background:rgba(255,255,255,0.95); color:#333; }' +
                    '.tmb-filter-item input::placeholder { color:rgba(255,255,255,0.5); font-size:13px; }' +
                    '.tmb-clear-btn { padding:6px 28px; font-size:15px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.3); border-radius:6px; cursor:pointer; margin-left:auto; transition:all .15s; align-self:stretch; display:flex; align-items:center; }' +
                    '.tmb-clear-btn:hover { background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.4); }' +
                    '.tmb-table-wrap { flex:1; overflow-y:auto; overflow-x:auto; min-height:0; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; margin:0 6px 6px; scrollbar-width:thin; scrollbar-color:rgb(85,155,135) transparent; }' +
                    '.tmb-table-wrap::-webkit-scrollbar { width:1px; height:1px; }' +
                    '.tmb-table-wrap::-webkit-scrollbar-track { background:transparent; }' +
                    '.tmb-table-wrap::-webkit-scrollbar-thumb { background:rgb(20,54,60); border-radius:1px; }' +
                    '.tmb-table { width:100%; border-collapse:collapse; font-size:16px; }' +
                    '.tmb-table thead { position:sticky; top:0; z-index:2; background:rgba(20,54,60,0.95); backdrop-filter:blur(10px); }' +
                    '.tmb-table th { padding:10px 10px; color:#e8eaed; font-weight:600; text-align:center; border-bottom:2px solid rgba(85,155,135,0.6); border-right:1px solid rgba(255,255,255,0.1); white-space:nowrap; font-size:16px; }' +
                    '.tmb-table th:last-child { border-right:none; }' +
                    '.tmb-table th.sortable { cursor:pointer; user-select:none; }' +
                    '.tmb-table th.sortable:hover { background:rgba(255,255,255,0.08); }' +
                    '.tmb-sort-indicator { display:inline-block; margin-left:2px; font-size:12px; color:rgba(255,255,255,0.3); width:12px; height:12px; vertical-align:middle; }' +
                    '.tmb-sort-indicator::after { content:"\\25BC"; }' +
                    '.tmb-sort-indicator.sort-desc { color:#4fc3f7; }' +
                    '.tmb-table td { padding:8px 10px; color:#e8eaed; border-bottom:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1); text-align:center; font-size:16px; }' +
                    '.tmb-table td:last-child { border-right:none; }' +
                    '.tmb-table tbody tr { height:44px; border-bottom:1px solid rgba(255,255,255,0.1); transition:background-color 0.2s ease; background:rgba(255,255,255,0.02); }' +
                    '.tmb-table tbody tr:nth-child(even) { background:rgba(255,255,255,0.06); }' +
                    '.tmb-table tbody tr:hover { background:rgba(85,155,135,0.2); }' +
                    '.tmb-card-link { color:#64b5f6; cursor:pointer; text-decoration:none; font-size:15px; }' +
                    '.tmb-card-link:hover { text-decoration:underline; }' +
                    '.tmb-add-btn { padding:8px 18px; font-size:15px; background:#0F95B0; color:#fff; border:none; border-radius:6px; cursor:pointer; white-space:nowrap; position:relative; transition:all .2s; }' +
                    '.tmb-add-btn:hover { background:#0D7A8E; }' +
                    '.tmb-add-menu { position:absolute; right:0; top:100%; background:rgba(20,54,60,0.98); border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:4px; z-index:100; box-shadow:0 4px 16px rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:3px; backdrop-filter:blur(10px); }' +
                    '.tmb-add-menu button { padding:8px 24px; font-size:15px; background:rgba(255,255,255,0.1); color:#e8eaed; border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer; white-space:nowrap; transition:all .15s; }' +
                    '.tmb-add-menu button:hover { background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.3); }' +
                    '.tmb-loading { text-align:center; padding:20px; color:rgba(255,255,255,0.7); font-size:13px; }' +
                    '.tmb-empty { text-align:center; padding:20px; color:rgba(255,255,255,0.5); font-size:13px; }' +
                    '.tmb-count { font-size:14px; color:rgba(255,255,255,0.6); padding:6px 12px; flex-shrink:0; }' +
                    '#tmbCardPreview { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10001; justify-content:center; align-items:center; cursor:pointer; }' +
                    '#tmbCardPreview.visible { display:flex; }' +
                    '#tmbCardPreview img { max-width:90vw; max-height:90vh; border-radius:0; box-shadow:0 8px 32px rgba(0,0,0,0.5); object-fit:contain; }' +
                    '#tmbCardPreview .tmb-preview-close { position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#fff; font-size:24px; width:40px; height:40px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; }' +
                    '#tmbCardPreview .tmb-preview-close:hover { background:rgba(255,255,255,0.3); }' +
                    '#tmbLoginOverlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10002; justify-content:center; align-items:center; }' +
                    '#tmbLoginOverlay.visible { display:flex; }' +
                    '.tmb-login-panel { background:linear-gradient(135deg,hsl(190,87%,12%),hsl(190,50%,18%)); border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:24px; min-width:320px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.4); }' +
                    '.tmb-login-desc { color:#ffffff; font-size:18px; line-height:1.6; margin-bottom:14px; white-space:pre-line; text-align:center; }' +
                    '.tmb-login-field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; align-items:center; }' +
                    '.tmb-login-field label { color:rgba(255,255,255,0.8); font-size:14px; }' +
                    '.tmb-login-field input { padding:8px 12px; font-size:15px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:6px; outline:none; width:50%; box-sizing:border-box; }' +
                    '.tmb-login-field input:focus { border-color:rgba(255,255,255,0.4); }' +
                    '.tmb-login-msg { text-align:center; font-size:13px; min-height:20px; margin-bottom:8px; }' +
                    '.tmb-login-msg.error { color:#ef5350; }' +
                    '.tmb-login-msg.success { color:#66bb6a; }' +
                    '.tmb-login-btns { display:flex; gap:10px; justify-content:center; }' +
                    '.tmb-login-btns button { padding:8px 24px; font-size:15px; border-radius:6px; cursor:pointer; border:1px solid rgba(255,255,255,0.2); transition:all .15s; }' +
                    '.tmb-login-submit { background:#0F95B0; color:#fff; border-color:#0F95B0 !important; }' +
                    '.tmb-login-submit:hover { background:#0D7A8E; }' +
                    '.tmb-login-submit:disabled { opacity:0.6; cursor:not-allowed; }' +
                    '.tmb-login-cancel { background:rgba(255,255,255,0.1); color:#e8eaed; }' +
                    '.tmb-login-cancel:hover { background:rgba(255,255,255,0.2); }';
                document.head.appendChild(s);
            },
    
            _waitForDOM() {
                var self = this;
                var check = function() {
                    var tabList = document.querySelector('#playerTab');
                    if (tabList) {
                        self._createUI(tabList);
                        return;
                    }
                    setTimeout(check, 500);
                };
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', check);
                } else {
                    check();
                }
            },
    
            _createUI(tabList) {
                var self = this;
                var li = document.createElement('li');
                li.className = 'nav-item';
                li.setAttribute('role', 'presentation');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                var btn = document.createElement('button');
                btn.id = 'tmBrowserBtn';
                btn.innerHTML = self._t('btn');
                btn.addEventListener('click', function() { self._toggle(); });
                li.appendChild(btn);
                tabList.appendChild(li);
    
                var overlay = document.createElement('div');
                overlay.id = 'tmBrowserOverlay';
                var panel = document.createElement('div');
                panel.id = 'tmBrowserPanel';
    
                var header = document.createElement('div');
                header.className = 'tmb-header';
                var isAuthed = GM_getValue('tmb_auth_id', '') && GM_getValue('tmb_auth_pwd', '');
                var authCls = isAuthed ? 'tmb-auth-btn verified' : 'tmb-auth-btn';
                var authTxt = isAuthed ? self._t('authVerified') : self._t('authUnverified');
                header.innerHTML = '<button class="' + authCls + '" id="tmbAuthBtn">' + authTxt + '</button><div class="tm-title"><h2>' + self._t('title') + '</h2></div><button class="tmb-close-btn">\u00d7</button>';
                header.querySelector('.tmb-close-btn').addEventListener('click', function() { self._toggle(); });
                header.querySelector('#tmbAuthBtn').addEventListener('click', function() {
                    self._showLoginDialog(function() { self._updateAuthBtn(); });
                });
                panel.appendChild(header);
    
                var tabs = document.createElement('div');
                tabs.className = 'tmb-tabs';
                var tabStd = document.createElement('button');
                tabStd.className = 'tmb-tab active';
                tabStd.textContent = self._t('tabStd');
                tabStd.dataset.tab = 'standard';
                var tabIC = document.createElement('button');
                tabIC.className = 'tmb-tab';
                tabIC.textContent = self._t('tabIC');
                tabIC.dataset.tab = 'ic';
                tabs.appendChild(tabStd);
                tabs.appendChild(tabIC);
                tabs.addEventListener('click', function(e) {
                    if (e.target.dataset.tab) {
                        self.activeTab = e.target.dataset.tab;
                        tabs.querySelectorAll('.tmb-tab').forEach(function(t) { t.classList.remove('active'); });
                        e.target.classList.add('active');
                        self._applyFilters();
                    }
                });
                panel.appendChild(tabs);
    
                var filters = document.createElement('div');
                filters.className = 'tmb-filters';
                filters.innerHTML =
                    '<div class="tmb-filter-item"><label>' + self._t('minPower') + '</label><input type="number" id="tmbPowerFilter" placeholder="0" min="0" step="any"></div>' +
                    '<div class="tmb-filter-item"><label>' + self._t('minLevel') + '</label><input type="number" id="tmbLevelFilter" placeholder="0" min="0" step="1"></div>' +
                    '<div class="tmb-filter-item"><label>' + self._t('idSearch') + '</label><input type="text" id="tmbIdFilter" placeholder="' + self._t('idSearch') + '"></div>' +
                    '<div class="tmb-filter-item"><label>' + self._t('job') + '</label><select id="tmbJobFilter">' +
                    '<option value="">' + self._t('all') + '</option>' +
                    '<option value="\u6c34\u6cd5">\u6c34\u6cd5</option>' +
                    '<option value="\u706b\u6cd5">\u706b\u6cd5</option>' +
                    '<option value="\u81ea\u7136\u6cd5">\u81ea\u7136\u6cd5</option>' +
                    '<option value="\u5f13">\u5f13</option>' +
                    '<option value="\u5f29">\u5f29</option>' +
                    '<option value="\u76fe">\u76fe</option>' +
                    '<option value="\u67aa">\u67aa</option>' +
                    '<option value="\u9524">\u9524</option>' +
                    '<option value="\u5251">\u5251</option>' +
                    '</select></div>' +
                    '<button class="tmb-clear-btn" id="tmbClearBtn">' + self._t('clear') + '</button>';
                panel.appendChild(filters);
    
                var countRow = document.createElement('div');
                countRow.className = 'tmb-count';
                countRow.id = 'tmbCount';
                panel.appendChild(countRow);
    
                var tableWrap = document.createElement('div');
                tableWrap.className = 'tmb-table-wrap';
                tableWrap.innerHTML =
                    '<table class="tmb-table"><thead><tr>' +
                    '<th>' + self._t('colId') + '</th>' +
                    '<th>' + self._t('colJob') + '</th>' +
                    '<th class="sortable" data-sort="power">' + self._t('colPower') + '<span class="tmb-sort-indicator notranslate" translate="no"></span></th>' +
                    '<th class="sortable" data-sort="level">' + self._t('colLevel') + '<span class="tmb-sort-indicator notranslate" translate="no"></span></th>' +
                    '<th class="sortable" data-sort="mainAttr">' + self._t('colMainAttr') + '<span class="tmb-sort-indicator notranslate" translate="no"></span></th>' +
                    '<th>' + self._t('colCard') + '</th>' +
                    '<th>' + self._t('colAction') + '</th>' +
                    '</tr></thead><tbody id="tmbBody"></tbody></table>';
                tableWrap.querySelector('thead').addEventListener('click', function(e) {
                    var th = e.target.closest('th.sortable');
                    if (!th) return;
                    var field = th.dataset.sort;
                    if (self.sortField === field) {
                        self.sortField = 'updateTime';
                        self.sortDir = 'desc';
                    } else {
                        self.sortField = field;
                        self.sortDir = 'desc';
                    }
                    tableWrap.querySelectorAll('.tmb-sort-indicator').forEach(function(s) { s.className = 'tmb-sort-indicator'; });
                    if (self.sortField === field) {
                        var indicator = th.querySelector('.tmb-sort-indicator');
                        if (indicator) indicator.className = 'tmb-sort-indicator sort-desc';
                    }
                    self._applyFilters();
                });
                panel.appendChild(tableWrap);
    
                overlay.appendChild(panel);
                document.body.appendChild(overlay);
    
                overlay.addEventListener('click', function(e) {
                    if (e.target === overlay) self._toggle();
                });
    
                var debounce = null;
                var onFilter = function() {
                    clearTimeout(debounce);
                    debounce = setTimeout(function() {
                        self.filters.job = document.getElementById('tmbJobFilter').value;
                        self.filters.minPower = document.getElementById('tmbPowerFilter').value;
                        self.filters.minLevel = document.getElementById('tmbLevelFilter').value;
                        self.filters.idSearch = document.getElementById('tmbIdFilter').value;
                        self._applyFilters();
                    }, 250);
                };
                ['tmbJobFilter', 'tmbPowerFilter', 'tmbLevelFilter', 'tmbIdFilter'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', onFilter);
                        el.addEventListener('change', onFilter);
                    }
                });
                document.getElementById('tmbClearBtn').addEventListener('click', function() {
                    self.filters = { job: '', minPower: '', minLevel: '', idSearch: '' };
                    document.getElementById('tmbJobFilter').value = '';
                    document.getElementById('tmbPowerFilter').value = '';
                    document.getElementById('tmbLevelFilter').value = '';
                    document.getElementById('tmbIdFilter').value = '';
                    self._applyFilters();
                });
    
                document.addEventListener('click', function(e) {
                    if (!e.target.closest('.tmb-add-btn') && !e.target.closest('.tmb-add-menu')) {
                        var menus = document.querySelectorAll('.tmb-add-menu');
                        menus.forEach(function(m) { m.remove(); });
                    }
                });
            },
    
            _toggle() {
                var overlay = document.getElementById('tmBrowserOverlay');
                var btn = document.getElementById('tmBrowserBtn');
                if (!overlay) return;
                this.panelVisible = !this.panelVisible;
                overlay.classList.toggle('visible', this.panelVisible);
                btn.classList.toggle('active', this.panelVisible);
                if (this.panelVisible && this.data.standard.length === 0 && this.data.ic.length === 0) {
                    this._fetchData();
                }
            },
    
            _fetchData() {
                if (this.loading) return;
                this.loading = true;
                var self = this;
                var body = document.getElementById('tmbBody');
                var count = document.getElementById('tmbCount');
                if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-loading">' + self._t('loading') + '</td></tr>';
                if (count) count.textContent = '';
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: TM_BROWSER_API,
                    timeout: 15000,
                    onload: function(response) {
                        try {
                            var json = JSON.parse(response.responseText);
                            var rawStd = (json.standard && json.standard.data) ? json.standard.data : [];
                            var rawIc = (json.ic && json.ic.data) ? json.ic.data : [];
                            var hasSimdata = function(u) { return u.simdata && u.simdata.trim().length > 0; };
                            self.data.standard = rawStd.filter(hasSimdata);
                            self.data.ic = rawIc.filter(hasSimdata);
                            self._applyFilters();
                        } catch (e) {
                            if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + self._t('parseFail') + '</td></tr>';
                        } finally {
                            self.loading = false;
                        }
                    },
                    onerror: function() {
                        if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + self._t('loadFail') + '</td></tr>';
                        self.loading = false;
                    },
                    ontimeout: function() {
                        if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + self._t('loadFail') + '</td></tr>';
                        self.loading = false;
                    }
                });
            },
    
            _applyFilters() {
                var src = this.activeTab === 'ic' ? this.data.ic : this.data.standard;
                var f = this.filters;
                var filtered = src.filter(function(u) {
                    if (f.job && (u.job || '') !== f.job) return false;
                    if (f.minPower && parseFloat(u.mainAttrLevel || 0) < parseFloat(f.minPower)) return false;
                    if (f.minLevel) {
                        var lvl = 0;
                        if (u.simdataDisplay) lvl = parseInt(u.simdataDisplay) || 0;
                        else if (u.battleLevel) lvl = parseInt(u.battleLevel) || 0;
                        if (lvl < parseInt(f.minLevel)) return false;
                    }
                    if (f.idSearch && (u.id || '').toLowerCase().indexOf(f.idSearch.toLowerCase()) === -1) return false;
                    return true;
                });
                var self = this;
                var sf = this.sortField;
                filtered.sort(function(a, b) {
                    var va, vb;
                    if (sf === 'power') {
                        va = parseFloat(a.mainAttrLevel) || 0;
                        vb = parseFloat(b.mainAttrLevel) || 0;
                    } else if (sf === 'level') {
                        va = parseInt(a.simdataDisplay || a.battleLevel) || 0;
                        vb = parseInt(b.simdataDisplay || b.battleLevel) || 0;
                    } else if (sf === 'mainAttr') {
                        var ma = self._getMainAttr(a), mb = self._getMainAttr(b);
                        va = ma ? parseInt(ma) || 0 : 0;
                        vb = mb ? parseInt(mb) || 0 : 0;
                    } else {
                        va = a.updateTime ? new Date(a.updateTime).getTime() : 0;
                        vb = b.updateTime ? new Date(b.updateTime).getTime() : 0;
                    }
                    return vb - va;
                });
                this._renderTable(filtered);
            },
    
            _renderTable(users) {
                var body = document.getElementById('tmbBody');
                var count = document.getElementById('tmbCount');
                if (!body) return;
                if (count) count.textContent = users.length + ' ' + this._t('usersFound');
                if (users.length === 0) {
                    body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + this._t('noData') + '</td></tr>';
                    return;
                }
                var self = this;
                var html = '';
                var max = Math.min(users.length, 200);
                for (var i = 0; i < max; i++) {
                    var u = users[i];
                    var uid = (u.id || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    var job = (u.job || '').replace(/</g, '&lt;');
                    var power = u.mainAttrLevel || '';
                    var levelRaw = u.simdataDisplay || u.battleLevel || '';
                    var level = levelRaw ? parseInt(levelRaw) || levelRaw : '';
                    var hasCard = u.cardLink ? true : false;
                    var mainAttr = self._getMainAttr(u);
                    html += '<tr data-idx="' + i + '">' +
                        '<td>' + uid + '</td>' +
                        '<td>' + job + '</td>' +
                        '<td>' + power + '</td>' +
                        '<td>' + level + '</td>' +
                        '<td>' + mainAttr + '</td>' +
                        '<td>' + (hasCard ? '<a class="tmb-card-link" data-card="' + i + '">' + self._t('view') + '</a>' : '-') + '</td>' +
                        '<td><button class="tmb-add-btn" data-add="' + i + '">' + self._t('add') + '</button></td>' +
                        '</tr>';
                }
                body.innerHTML = html;
                body._tmbUsers = users;
                body.onclick = function(e) {
                    var cardLink = e.target.closest('[data-card]');
                    if (cardLink) {
                        var ci = parseInt(cardLink.dataset.card);
                        if (users[ci] && users[ci].cardLink) {
                            self._viewCard(users[ci].cardLink);
                        }
                        return;
                    }
                    var menuBtn = e.target.closest('.tmb-add-menu button');
                    if (menuBtn) {
                        e.stopPropagation();
                        var pi = parseInt(menuBtn.dataset.player);
                        var rowIdx = parseInt(menuBtn.dataset.useridx);
                        var menuEl = menuBtn.closest('.tmb-add-menu');
                        if (menuEl) menuEl.remove();
                        if (users[rowIdx]) {
                            self._requireAuth(function() { self._addToPlayer(pi, users[rowIdx]); });
                        }
                        return;
                    }
                    var addBtn = e.target.closest('[data-add]');
                    if (addBtn) {
                        e.stopPropagation();
                        var ai = parseInt(addBtn.dataset.add);
                        self._showAddMenu(addBtn, users[ai]);
                        return;
                    }
                };
            },
    
            _showAddMenu(btn) {
                document.querySelectorAll('.tmb-add-menu').forEach(function(m) { m.remove(); });
                var menu = document.createElement('div');
                menu.className = 'tmb-add-menu';
                var idx = parseInt(btn.dataset.add);
                for (var p = 1; p <= PLAYER_COUNT; p++) {
                    var b = document.createElement('button');
                    b.textContent = 'P' + p;
                    b.dataset.player = p;
                    b.dataset.useridx = idx;
                    menu.appendChild(b);
                }
                btn.appendChild(menu);
            },
    
            _viewCard(cardUrl) {
                var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;
                if (isMobile) {
                    window.open(cardUrl, '_blank');
                    return;
                }
                var preview = document.getElementById('tmbCardPreview');
                if (!preview) {
                    preview = document.createElement('div');
                    preview.id = 'tmbCardPreview';
                    preview.innerHTML = '<button class="tmb-preview-close">\u00d7</button><img src="" alt="Card">';
                    preview.addEventListener('click', function(e) {
                        if (e.target === preview || e.target.classList.contains('tmb-preview-close')) {
                            preview.classList.remove('visible');
                        }
                    });
                    document.body.appendChild(preview);
                }
                preview.querySelector('img').src = cardUrl;
                preview.classList.add('visible');
            },
    
            _updateAuthBtn() {
                var btn = document.getElementById('tmbAuthBtn');
                if (!btn) return;
                var isAuthed = GM_getValue('tmb_auth_id', '') && GM_getValue('tmb_auth_pwd', '');
                btn.className = isAuthed ? 'tmb-auth-btn verified' : 'tmb-auth-btn';
                btn.textContent = isAuthed ? this._t('authVerified') : this._t('authUnverified');
            },
    
            _requireAuth(callback) {
                var savedId = GM_getValue('tmb_auth_id', '');
                var savedPwd = GM_getValue('tmb_auth_pwd', '');
                if (savedId && savedPwd) {
                    callback();
                    return;
                }
                this._showLoginDialog(callback);
            },
    
            _showLoginDialog(callback) {
                var self = this;
                var existing = document.getElementById('tmbLoginOverlay');
                if (existing) existing.remove();
                var overlay = document.createElement('div');
                overlay.id = 'tmbLoginOverlay';
                var savedId = GM_getValue('tmb_auth_id', '');
                var escapedId = savedId.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                overlay.innerHTML =
                    '<div class="tmb-login-panel">' +
                    '<div class="tmb-login-desc">' + self._t('loginDesc') + '</div>' +
                    '<div class="tmb-login-field"><label>' + self._t('loginId') + '</label><input type="text" id="tmbLoginId" value="' + escapedId + '" autocomplete="off"></div>' +
                    '<div class="tmb-login-field"><label>' + self._t('loginPwd') + '</label><input type="password" id="tmbLoginPwd" autocomplete="new-password"></div>' +
                    '<div class="tmb-login-msg" id="tmbLoginMsg"></div>' +
                    '<div class="tmb-login-btns">' +
                    '<button class="tmb-login-cancel" id="tmbLoginCancel">' + self._t('loginCancel') + '</button>' +
                    '<button class="tmb-login-submit" id="tmbLoginSubmit">' + self._t('loginBtn') + '</button>' +
                    '</div></div>';
                document.body.appendChild(overlay);
                overlay.classList.add('visible');
                var idInput = document.getElementById('tmbLoginId');
                var pwdInput = document.getElementById('tmbLoginPwd');
                var msgEl = document.getElementById('tmbLoginMsg');
                var submitBtn = document.getElementById('tmbLoginSubmit');
                var cancelBtn = document.getElementById('tmbLoginCancel');
                if (!savedId) idInput.focus(); else pwdInput.focus();
                cancelBtn.addEventListener('click', function() { overlay.remove(); });
                overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
                submitBtn.addEventListener('click', function() {
                    var id = idInput.value.trim();
                    var pwd = pwdInput.value;
                    if (!id || !pwd) {
                        msgEl.className = 'tmb-login-msg error';
                        msgEl.textContent = self._t('loginFail');
                        return;
                    }
                    submitBtn.disabled = true;
                    submitBtn.textContent = self._t('loginVerifying');
                    msgEl.className = 'tmb-login-msg';
                    msgEl.textContent = '';
                    self._verifyCredentials(id, pwd, function(success, errMsg) {
                        if (success) {
                            GM_setValue('tmb_auth_id', id);
                            GM_setValue('tmb_auth_pwd', pwd);
                            msgEl.className = 'tmb-login-msg success';
                            msgEl.textContent = self._t('loginSuccess');
                            self._updateAuthBtn();
                            setTimeout(function() {
                                overlay.remove();
                                callback();
                            }, 500);
                        } else {
                            submitBtn.disabled = false;
                            submitBtn.textContent = self._t('loginBtn');
                            msgEl.className = 'tmb-login-msg error';
                            msgEl.textContent = errMsg || self._t('loginFail');
                        }
                    });
                });
                pwdInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') submitBtn.click();
                });
            },
    
            _verifyCredentials(id, pwd, callback) {
                var self = this;
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://papiyas.chat/api/verify-password',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ id: id, password: pwd }),
                    onload: function(response) {
                        try {
                            var json = JSON.parse(response.responseText);
                            if (json.success) {
                                callback(true);
                            } else {
                                var msg = self._t('loginFail');
                                if (json.code === 'ERR-2') msg = self._t('loginNoPwd');
                                else if (json.code === 'ERR-LOCKED') msg = self._t('loginLocked');
                                else if (json.message) msg = json.message;
                                callback(false, msg);
                            }
                        } catch (e) {
                            callback(false, self._t('loginFail'));
                        }
                    },
                    onerror: function() {
                        callback(false, self._t('loginFail'));
                    }
                });
            },
    
            _addToPlayer(playerIdx, userData) {
                if (!userData || !userData.simdata) return;
                var simdata = userData.simdata;
                if (typeof simdata === 'object') simdata = JSON.stringify(simdata);
                var groupObj = {};
                for (var s = 1; s <= 5; s++) {
                    if (s === playerIdx) {
                        groupObj[s] = simdata;
                    } else if (typeof SimulatorBuildScore !== 'undefined' && SimulatorBuildScore.playerData && SimulatorBuildScore.playerData[s]) {
                        groupObj[s] = JSON.stringify(SimulatorBuildScore.playerData[s]);
                    } else {
                        groupObj[s] = TMB_BLANK_PLAYER;
                    }
                }
                var groupJson = JSON.stringify(groupObj);
                var groupTab = document.querySelector('a#group-combat-tab');
                if (groupTab) groupTab.click();
                var groupInput = document.querySelector('input#inputSetGroupCombatAll');
                if (groupInput) {
                    groupInput.value = groupJson;
                }
                var importBtn = document.querySelector('button#buttonImportSet');
                if (importBtn) {
                    importBtn.click();
                }
                var playerTab = document.querySelector('a#player' + playerIdx + '-tab');
                if (playerTab && userData.id) {
                    playerTab.textContent = userData.id;
                }
            }
        };
    
        TalentMarketBrowser.init();
    
        const BuildScoreAutoUpdater = {
            INTERVAL: 60 * 60 * 1000,
            timer: null,
            lastUpdate: 0,
            enabled: false,
            password: null,
            initTimeout: null,
            
            init() {
                this.enabled = GM_getValue('mwi_buildscore_auto_enabled', false);
                this.password = GM_getValue('mwi_buildscore_password', null);
                if (this.enabled && this.password) {
                    this.start();
                    if (this.initTimeout) clearTimeout(this.initTimeout);
                    this.initTimeout = setTimeout(() => {
                        if (DataStore.isLoaded && DataStore.buildScore) {
                            this.sendBuildScoreUpdate();
                        }
                    }, 5000);
                }
            },
            
            setPassword(pwd) {
                this.password = pwd;
                GM_setValue('mwi_buildscore_password', pwd);
            },
            
            enable() {
                this.enabled = true;
                GM_setValue('mwi_buildscore_auto_enabled', true);
                this.start();
            },
                
            disable() {
                this.enabled = false;
                GM_setValue('mwi_buildscore_auto_enabled', false);
                this.stop();
            },
                
            sendBuildScoreUpdate() {
                if (!this.enabled || !this.password) {
                    return false;
                }
                if (!DataStore.isLoaded || !DataStore.characterName || !DataStore.buildScore) {
                    return false;
                }
                const gameMode = DataStore.gameMode;
                const isIronman = gameMode && (gameMode === 'IRONMAN' || gameMode.toLowerCase().includes('iron'));
                const apiEndpoint = isIronman 
                    ? `${SITE_URL}/api/ic/ranking/${encodeURIComponent(DataStore.characterName)}/buildscore`
                    : `${SITE_URL}/api/ranking/${encodeURIComponent(DataStore.characterName)}/buildscore`;
                
                const simdata = WebSocketHook.generateSimulatorData();
                const self = this;
                
                GM_xmlhttpRequest({
                    method: 'PATCH',
                    url: apiEndpoint,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ 
                        buildScore: DataStore.buildScore, 
                        password: this.password,
                        simdata: simdata ? JSON.stringify(simdata) : null
                    }),
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            self.lastUpdate = Date.now();
                        } else {
                            try {
                                const result = JSON.parse(response.responseText);
                                if (result.code === 'ERR-WRONG-PWD') {
                                    self.disable();
                                }
                            } catch (e) {}
                        }
                    },
                    onerror: function() {}
                });
                return true;
            },
            
            start() {
                if (this.timer) return;
                if (!this.enabled || !this.password) return;
                this.timer = setInterval(() => {
                    if (DataStore.isLoaded && DataStore.buildScore) {
                        this.sendBuildScoreUpdate();
                    }
                }, this.INTERVAL);
            },
            
            stop() {
                if (this.timer) {
                    clearInterval(this.timer);
                    this.timer = null;
                }
            },
            
            showSettingsDialog() {
                const isZH = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
                const existing = document.getElementById('buildscore-settings-dialog');
                if (existing) existing.remove();
                
                const currentEnabled = GM_getValue('mwi_buildscore_auto_enabled', false);
                this.enabled = currentEnabled;
                
                const dialog = document.createElement('div');
                dialog.id = 'buildscore-settings-dialog';
                dialog.innerHTML = `
                    <div class="bs-dialog-container">
                        <h3 class="bs-dialog-title">${isZH ? '模拟器数据自动更新' : 'Simulator Data Auto-Update'}</h3>
                        <div class="bs-dialog-checkbox-row">
                            <label class="bs-dialog-checkbox-label">
                                <input type="checkbox" id="bs-auto-enabled" class="bs-dialog-checkbox" ${currentEnabled ? 'checked' : ''}>
                                <span>${isZH ? '启用自动更新' : 'Enable auto-update'}</span>
                            </label>
                        </div>
                        <div class="bs-dialog-description">
                            ${isZH ? '启用并保存简历密码后，会定时自动获取模拟器数据上传更新到人才市场<br><br>注：名片图片仍需手动重新导入生成提交<br>如果没有提交过简历请先投递简历此设置才生效' : 'After enabling and saving resume password, simulator data will be automatically uploaded to talent market<br><br>Note: Card images still need to be manually re-imported and submitted<br>If you have not submitted a resume yet, please submit one first for this setting to take effect'}
                        </div>
                        <div class="bs-dialog-input-group">
                            <label class="bs-dialog-label">${isZH ? '简历密码' : 'Resume Password'}</label>
                            <input type="password" id="bs-password" class="bs-dialog-input" autocomplete="new-password" placeholder="${this.password ? (isZH ? '已保存' : 'Saved') : (isZH ? '请输入简历密码' : 'Enter resume password')}">
                        </div>
                        <div class="bs-dialog-buttons">
                            <button id="bs-cancel" class="bs-dialog-btn-cancel">${isZH ? '取消' : 'Cancel'}</button>
                            <button id="bs-save" class="bs-dialog-btn-save">${isZH ? '保存' : 'Save'}</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(dialog);
                const self = this;
                dialog.querySelector('#bs-cancel').onclick = () => dialog.remove();
                dialog.querySelector('#bs-save').onclick = async () => {
                    const enabled = dialog.querySelector('#bs-auto-enabled').checked;
                    const pwd = dialog.querySelector('#bs-password').value;
                    const saveBtn = dialog.querySelector('#bs-save');
                    
                    if (enabled) {
                        const passwordToUse = pwd || self.password;
                        if (!passwordToUse) {
                            self.showToast(isZH ? '请先输入密码' : 'Please enter password', 'warning');
                            return;
                        }
                        
                        let charName = DataStore.characterName;
                        if (!charName) {
                            const nameEl = document.querySelector('.CharacterName_characterName__2FqyZ') || 
                                          document.querySelector('[class*="CharacterName_characterName"]');
                            if (nameEl) {
                                charName = nameEl.textContent?.trim();
                                if (charName) DataStore.characterName = charName;
                            }
                        }
                        
                        if (!charName) {
                            self.showToast(isZH ? '无法获取角色名，请刷新页面重试' : 'Cannot get character name, please refresh', 'warning');
                            return;
                        }
                        
                        if (!DataStore.buildScore || DataStore.buildScore <= 0) {
                            self.showToast(isZH ? '数据未加载，请刷新页面再尝试' : 'BuildScore not loaded, please wait for game data', 'warning');
                            return;
                        }
                        
                        saveBtn.disabled = true;
                        saveBtn.textContent = isZH ? '验证中...' : 'Verifying...';
                        
                        const gameMode = DataStore.gameMode;
                        const isIronman = gameMode && (gameMode === 'IRONMAN' || gameMode.toLowerCase().includes('iron'));
                        const apiEndpoint = isIronman 
                            ? `${SITE_URL}/api/ic/ranking/${encodeURIComponent(charName)}/buildscore`
                            : `${SITE_URL}/api/ranking/${encodeURIComponent(charName)}/buildscore`;
                        
                        GM_xmlhttpRequest({
                            method: 'PATCH',
                            url: apiEndpoint,
                            headers: { 'Content-Type': 'application/json' },
                            data: JSON.stringify({ buildScore: DataStore.buildScore || 0, password: passwordToUse }),
                            onload: function(response) {
                                try {
                                    const result = JSON.parse(response.responseText);
                                    if (response.status >= 200 && response.status < 300) {
                                        self.setPassword(passwordToUse);
                                        self.enable();
                                        self.updateButtonText();
                                        self.showToast(isZH ? '自动更新已启用' : 'Auto-update enabled', 'success');
                                        dialog.remove();
                                    } else if (result.code === 'ERR-WRONG-PWD') {
                                        self.showToast(isZH ? '密码不正确' : 'Incorrect password', 'error');
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = isZH ? '保存' : 'Save';
                                    } else if (result.code === 'ERR-RATE-LIMIT') {
                                        self.setPassword(passwordToUse);
                                        self.enable();
                                        self.updateButtonText();
                                        self.showToast(isZH ? '自动更新已启用' : 'Auto-update enabled (rate limited, will update later)', 'success');
                                        dialog.remove();
                                    } else if (result.code === 'ERR-NO-PWD-SET') {
                                        self.showToast(isZH ? '该用户未设置简历密码，请先确定已提交过简历' : 'No password set, please set one on website first', 'error');
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = isZH ? '保存' : 'Save';
                                    } else if (response.status === 404) {
                                        self.showToast(isZH ? '用户记录不存在，请先提交简历' : 'User not found, please submit resume first', 'error');
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = isZH ? '保存' : 'Save';
                                    } else {
                                        self.showToast(isZH ? '验证失败: ' + result.message : 'Verification failed: ' + result.message, 'error');
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = isZH ? '保存' : 'Save';
                                    }
                                } catch (e) {
                                    self.showToast(isZH ? '响应解析错误' : 'Response parse error', 'error');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = isZH ? '保存' : 'Save';
                                }
                            },
                            onerror: function() {
                                self.showToast(isZH ? '网络错误，请重试' : 'Network error, please try again', 'error');
                                saveBtn.disabled = false;
                                saveBtn.textContent = isZH ? '保存' : 'Save';
                            }
                        });
                    } else {
                        self.disable();
                        self.updateButtonText();
                        dialog.remove();
                    }
                };
                dialog.onclick = (e) => { if (e.target === dialog) dialog.remove(); };
            },
            
            updateButtonText() {
                const btn = document.querySelector('.tm-btn-settings');
                if (!btn) return;
                const isZH = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
                if (this.enabled && this.password) {
                    btn.textContent = isZH ? '已启用自动更新' : 'Auto: ON';
                    btn.style.background = '#166534';
                    btn.style.color = '#86efac';
                } else {
                    btn.textContent = isZH ? '未启用自动更新' : 'Auto: OFF';
                    btn.style.background = '#334155';
                    btn.style.color = '#94a3b8';
                }
            },
            
            showToast(message, type = 'success') {
                const existing = document.getElementById('bs-toast');
                if (existing) existing.remove();
                
                const toast = document.createElement('div');
                toast.id = 'bs-toast';
                toast.className = type;
                toast.textContent = message;
                
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translate(-50%,-50%) scale(0.9)';
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }
        };
        
        window.MWI_INTEGRATED.showBuildScoreSettings = () => BuildScoreAutoUpdater.showSettingsDialog();
        window.addEventListener('mwi_buildscore_updated', () => {
            BuildScoreAutoUpdater.init();
        });
        
        const tryGetCharacterNameFromDOM = () => {
            if (DataStore.characterName) return DataStore.characterName;
            const nameEl = document.querySelector('.CharacterName_characterName__2FqyZ') || 
                          document.querySelector('[class*="CharacterName_characterName"]');
            if (nameEl) {
                const name = nameEl.textContent?.trim();
                if (name) {
                    DataStore.characterName = name;
                    return name;
                }
            }
            return null;
        };
        
        let initRetryCount = 0;
        const initAutoUpdater = () => {
            if (DataStore.isLoaded && DataStore.characterName) {
                BuildScoreAutoUpdater.init();
            } else {
                tryGetCharacterNameFromDOM();
                initRetryCount++;
                if (initRetryCount < 30) {
                    setTimeout(initAutoUpdater, 2000);
                }
            }
        };
        if (!isSimulatorPage) {
            setTimeout(initAutoUpdater, 3000);
        }
        
        (function loadCachedClientData() {
            const cachedData = localStorage.getItem("initClientData");
            if (cachedData) {
                try {
                    const decompressed = LZString.decompressFromUTF16(cachedData);
                    if (decompressed) {
                        const clientData = JSON.parse(decompressed);
                        BuildScoreModule.initClientData(clientData);
                        DataStore.itemDetailMap = clientData.itemDetailMap || null;
                        DataStore.actionDetailMap = clientData.actionDetailMap || null;
                        DataStore.abilityDetailMap = clientData.abilityDetailMap || null;
                        try {
                            GM_setValue('mwi_client_data_for_sim', cachedData);
                            GM_setValue('mwi_game_server', window.location.href.includes('milkywayidlecn.com') ? 'cn' : 'en');
                            var mktJson = localStorage.getItem('MWITools_marketAPI_json');
                            var mktTs = localStorage.getItem('MWITools_marketAPI_timestamp');
                            if (mktJson && mktTs) {
                                GM_setValue('mwi_market_data_for_sim', mktJson);
                                GM_setValue('mwi_market_data_timestamp', mktTs);
                            }
                        } catch (e2) { /* silent */ }
                    }
                } catch (e) {}
            }
        })();
        ClientData.init();
        SVGTool.init();
        function waitForDOMAndCreateUI() {
            if (document.body) {
                window.MWI_INTEGRATED.generateCard = generateCharacterCard;
                window.MWI_INTEGRATED.closeCard = closeCard;
                window.MWI_INTEGRATED.getData = getAllData;
                window.MWI_INTEGRATED.getSimulatorData = getSimulatorData;
                window.MWI_INTEGRATED.isDataLoaded = isDataReady;
                window.MWI_INTEGRATED.waitForData = waitForData;
                window.MWI_INTEGRATED.ClientData = ClientData;
            } else {
                setTimeout(waitForDOMAndCreateUI, 50);
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', waitForDOMAndCreateUI);
            window.addEventListener('load', waitForDOMAndCreateUI);
        } else {
            waitForDOMAndCreateUI();
        }
    })();
  });

  // ---------------------------------------------------------------------------
  // Module: 角色名片
  // Original: MWI角色名片插件.user.js v1.7.0
  // Author: Windoge
  // License: MIT
  // Source: https://greasyfork.org/scripts/543862
  // WebSocket compatibility patches: 1
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("character-card", "角色名片", "idle", () => {
    (function() {
        'use strict';
    
        // 使用立即执行函数避免全局变量污染
        const MWICharacterCard = (function() {
            const isZHInGameSetting = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh"); // 获取游戏内设置语言
            let isZH = isZHInGameSetting; // MWITools 本身显示的语言默认由游戏内设置语言决定
    
            // 检测移动端
            function isMobile() {
                return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            }
    
            // 获取近战等级，兼容旧数据（使用power等级作为后备）
            function getMeleeLevel(characterSkills) {
                if (!characterSkills || !Array.isArray(characterSkills)) return 0;
    
                // 优先查找melee技能
                const meleeSkill = characterSkills.find(s => s.skillHrid.includes('/skills/melee'));
                if (meleeSkill) {
                    return meleeSkill.level || 0;
                }
    
                // 如果没有melee技能，查找power技能作为兼容
                const powerSkill = characterSkills.find(s => s.skillHrid.includes('/skills/power'));
                if (powerSkill) {
                    console.log('[兼容性] 使用power等级作为melee等级:', powerSkill.level);
                    return powerSkill.level || 0;
                }
    
                return 0;
            }
    
            // 获取角色对象的近战等级，兼容旧数据
            function getMeleeLevelFromCharacterObj(characterObj) {
                // 如果直接有 meleeLevel 属性，优先使用
                if (characterObj.meleeLevel !== undefined) {
                    return characterObj.meleeLevel;
                }
    
                // 如果有 powerLevel 属性，使用作为兼容
                if (characterObj.powerLevel !== undefined) {
                    console.log('[兼容性] 从角色对象使用powerLevel作为meleeLevel:', characterObj.powerLevel);
                    return characterObj.powerLevel;
                }
    
                // 如果有 characterSkills 数组，使用 getMeleeLevel 函数
                if (characterObj.characterSkills) {
                    return getMeleeLevel(characterObj.characterSkills);
                }
    
                return 0;
            }
    
            // 进入队伍编辑模式
            function enterTeamEditMode(modal) {
                try {
                    if (!modal) return;
                    // 仅在首次进入编辑时记录原始数据，后续编辑中的重渲染不覆盖
                    if (!state.teamCard.editMode || !state.teamCard.originalMembers) {
                        try {
                            state.teamCard.originalMembers = JSON.parse(JSON.stringify(state.teamCard.members));
                        } catch (e) {
                            state.teamCard.originalMembers = state.teamCard.members.slice();
                        }
                    }
                    state.teamCard.editMode = true;
    
                    const container = modal.querySelector('#team-character-card');
                    const maxMembers = 5;
    
                    // 在按钮行后面插入编辑按钮（保存/取消/添加）
                    const buttonRow = modal.querySelector('.button-row');
                    const editBtn = modal.querySelector('.edit-team-card-btn');
                    const downloadBtn = modal.querySelector('.download-team-card-btn');
                    const refreshBtn = modal.querySelector('.refresh-team-card-btn');
                    if (editBtn) editBtn.style.display = 'none';
                    if (downloadBtn) downloadBtn.disabled = true;
                    if (refreshBtn) refreshBtn.disabled = true;
                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'save-team-card-btn';
                    saveBtn.textContent = isZH ? '保存' : 'Save';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'cancel-team-card-btn';
                    cancelBtn.textContent = isZH ? '取消' : 'Cancel';
                    const addBtn = document.createElement('button');
                    addBtn.className = 'add-team-card-btn';
                    addBtn.textContent = isZH ? '添加角色' : 'Add Member';
                    buttonRow.appendChild(saveBtn);
                    buttonRow.appendChild(cancelBtn);
                    buttonRow.appendChild(addBtn);
    
                    const refreshAddBtnState = () => {
                        const disabled = state.teamCard.members && state.teamCard.members.length >= maxMembers;
                        addBtn.disabled = disabled;
                    };
    
                    // 编辑时禁止卡片拦截点击，便于点击删除按钮
                    container.querySelectorAll('.team-card-wrap .character-card').forEach(card => {
                        card.style.pointerEvents = 'none';
                    });
    
                    // 为每个成员添加删除按钮（包括自己）
                    const wraps = container.querySelectorAll('.team-card-wrap');
                    wraps.forEach((wrap, idx) => {
                        const m = state.teamCard.members[idx];
                        if (!m) return;
                        const del = document.createElement('button');
                        del.textContent = '×';
                        del.title = m.isSelf ? (isZH ? '删除自己' : 'Remove Myself') : (isZH ? '删除该队友' : 'Remove');
                        del.style.cssText = 'position:absolute; right:4px; top:4px; background:#dc3545; color:#fff; border:none; width:22px; height:22px; border-radius:50%; cursor:pointer; z-index:9999; pointer-events:auto;';
                        del.addEventListener('click', (e) => {
                            e.stopPropagation();
                            try {
                                state.teamCard.members.splice(idx, 1);
                            } catch(err) {}
                            saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                            // 重渲染，强制使用 state 数据，且保持编辑模式
                            try { document.body.removeChild(modal); } catch(err) {}
                            showPartyCharacterCard({ forceState: true, openEditMode: true });
                        }, { capture: true });
                        wrap.style.position = 'relative';
                        wrap.appendChild(del);
                    });
    
                    // 添加角色
                    addBtn.onclick = () => {
                        if (state.teamCard.members && state.teamCard.members.length >= maxMembers) return;
                        const promptDiv = document.createElement('div');
                        promptDiv.className = 'character-card-modal';
                        promptDiv.innerHTML = `
                            <div class="modal-content" style="max-width:95vw;width:1800px;background:#1a1a2e;border:2px solid #4a90e2;border-radius:15px;color:#fff;">
                                <button class="close-modal">&times;</button>
                                <div class="instruction-banner">${isZH ? '请输入已导出的角色数据' : 'Paste exported character data'}</div>
                                <div style="margin-bottom:10px;">
                                    <label style="display:block;margin-bottom:6px;color:#4a90e2;">${isZH ? '角色名（选填）' : 'Character Name (optional)'}:</label>
                                    <input class="add-member-name" placeholder="${isZH ? '如不填写，使用数据内/默认的名称' : 'Leave empty to use name from data or default'}" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #4a90e2;border-radius:8px;color:#fff;font-size:14px;" />
                                </div>
                                <div style="margin-bottom:8px;">
                                    <label style="display:block;margin-bottom:6px;color:#4a90e2;">${isZH ? '角色数据JSON' : 'Character Data JSON'}:</label>
                                    <textarea class="add-member-json" style="width:100%;height:300px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #4a90e2;border-radius:8px;padding:10px;font-family:Courier New, monospace;"></textarea>
                                </div>
                                <div class="button-row" style="margin-top:10px;">
                                    <button class="import-member-btn">${isZH ? '导入' : 'Import'}</button>
                                    <button class="cancel-import-btn">${isZH ? '取消' : 'Cancel'}</button>
                                </div>
                            </div>`;
                        document.body.appendChild(promptDiv);
                        const close = () => document.body.removeChild(promptDiv);
                        promptDiv.querySelector('.close-modal').onclick = close;
                        promptDiv.querySelector('.cancel-import-btn').onclick = close;
                        promptDiv.onclick = (e) => { if (e.target === promptDiv) close(); };
                        promptDiv.querySelector('.import-member-btn').onclick = () => {
                            try {
                                const txt = promptDiv.querySelector('.add-member-json').value.trim();
                                const nameInput = promptDiv.querySelector('.add-member-name').value.trim();
                                const obj = JSON.parse(txt);
                                if (!isValidCharacterData(obj)) {
                                    showToastNotice(isZH ? 'JSON无效，未检测到角色数据' : 'Invalid JSON', 'error');
                                    return;
                                }
                                const name = nameInput || obj.player?.name || obj.character?.name || (isZH ? '角色' : 'Character');
                                // 统一格式到 { player, abilities, characterSkills, characterHouseRoomMap, houseRooms }
                                let normalized;
                                if (obj.player) {
                                    normalized = obj;
                                } else if (obj.character || obj.characterItems || obj.characterSkills) {
                                    normalized = { player: { name: name, equipment: obj.characterItems || [], characterItems: obj.characterItems || [] }, abilities: obj.abilities || [], characterSkills: obj.characterSkills || [], characterHouseRoomMap: obj.characterHouseRoomMap || {}, houseRooms: obj.houseRooms || {} };
                                } else {
                                    normalized = { player: obj };
                                }
                                // 确保 members 数组已初始化
                                if (!state.teamCard.members) {
                                    state.teamCard.members = [];
                                }
                                state.teamCard.members.push({ name, data: normalized, isSelf: false });
                                saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                                close();
                                try { document.body.removeChild(modal); } catch(err) {}
                                showPartyCharacterCard({ forceState: true, openEditMode: true });
                                showToastNotice(isZH ? '已导入角色' : 'Member imported', 'success');
                            } catch (err) {
                                showToastNotice(isZH ? 'JSON解析失败' : 'JSON parse error', 'error');
                            }
                        };
                    };
    
                    // 保存
                    saveBtn.onclick = () => {
                        state.teamCard.editMode = false;
                        state.teamCard.originalMembers = null;
                        saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                        showToastNotice(isZH ? '已保存' : 'Saved', 'success');
                        // 恢复按钮与交互
                        if (editBtn) editBtn.style.display = '';
                        if (downloadBtn) downloadBtn.disabled = false;
                        if (refreshBtn) refreshBtn.disabled = false;
                        container.querySelectorAll('.team-card-wrap .character-card').forEach(card => {
                            card.style.pointerEvents = '';
                        });
                        // 关闭当前编辑视图并以非编辑模式重渲染，清理删除/保存/取消按钮
                        try { document.body.removeChild(modal); } catch (e) {}
                        showPartyCharacterCard({ forceState: true });
                    };
    
                    // 取消
                    cancelBtn.onclick = () => {
                        if (state.teamCard.originalMembers) {
                            // 深拷贝恢复
                            try {
                                state.teamCard.members = JSON.parse(JSON.stringify(state.teamCard.originalMembers));
                            } catch (e) {
                                state.teamCard.members = state.teamCard.originalMembers;
                            }
                            state.teamCard.editMode = false;
                            state.teamCard.originalMembers = null;
                            // 尝试写入缓存（忽略配额错误）
                            saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                            // 恢复按钮与交互
                            if (editBtn) editBtn.style.display = '';
                            if (downloadBtn) downloadBtn.disabled = false;
                            if (refreshBtn) refreshBtn.disabled = false;
                            try { document.body.removeChild(modal); } catch (e) {}
                            // 强制使用内存状态渲染，避免缓存配额失败导致无法回滚
                            showPartyCharacterCard({ forceState: true });
                        }
                    };
    
                    refreshAddBtnState();
                } catch (e) {
                    console.warn('进入编辑模式失败', e);
                }
            }
    
            // 获取当前有效的布局模式
            function getEffectiveLayoutMode() {
                return state.layoutMode.getCurrentMode();
            }
    
            // 切换布局模式
            function toggleLayoutMode() {
                const currentMode = getEffectiveLayoutMode();
                const newMode = currentMode === 'mobile' ? 'desktop' : 'mobile';
                state.layoutMode.forcedMode = newMode;
    
                // 重新生成名片并应用新布局
                refreshCharacterCard();
            }
    
            // 刷新角色名片布局
            function refreshCharacterCard() {
                const characterCard = document.querySelector('#character-card');
                if (!characterCard) return;
    
                const modal = characterCard.closest('.character-card-modal');
                if (!modal) return;
    
                // 获取当前数据
                // 通过检查技能槽是否有data-skill-index属性来判断是否为我的角色名片（可编辑技能）
                const isMyCharacterCard = characterCard.querySelector('.skill-panel .skill-slot[data-skill-index]') !== null;
                let characterData, characterName, characterNameElement;
    
                if (isMyCharacterCard) {
                    // 我的角色名片
                    characterData = {
                        player: {
                            name: window.characterCardWebSocketData?.characterName || (isZH ? '角色' : 'Character'),
                            equipment: window.characterCardWebSocketData?.characterItems || [],
                            characterItems: window.characterCardWebSocketData?.characterItems || [],
                            staminaLevel: window.characterCardWebSocketData?.characterSkills?.find(s => s.skillHrid.includes('/skills/stamina'))?.level || 0,
                            intelligenceLevel: window.characterCardWebSocketData?.characterSkills?.find(s => s.skillHrid.includes('/skills/intelligence'))?.level || 0,
                            attackLevel: window.characterCardWebSocketData?.characterSkills?.find(s => s.skillHrid.includes('/skills/attack'))?.level || 0,
                            meleeLevel: getMeleeLevel(window.characterCardWebSocketData?.characterSkills),
                            defenseLevel: window.characterCardWebSocketData?.characterSkills?.find(s => s.skillHrid.includes('/skills/defense'))?.level || 0,
                            rangedLevel: window.characterCardWebSocketData?.characterSkills?.find(s => s.skillHrid.includes('/skills/ranged'))?.level || 0,
                            magicLevel: window.characterCardWebSocketData?.characterSkills?.find(s => s.skillHrid.includes('/skills/magic'))?.level || 0
                        },
                        abilities: window.characterCardWebSocketData?.characterAbilities || [],
                        characterSkills: window.characterCardWebSocketData?.characterSkills || [],
                        houseRooms: window.characterCardWebSocketData?.characterHouseRoomMap || {},
                        characterHouseRoomMap: window.characterCardWebSocketData?.characterHouseRoomMap || {}
                    };
                    characterName = characterData.player.name;
    
                    // 获取第一个角色名元素（我的角色）
                    const characterNameDivs = document.querySelectorAll('.CharacterName_characterName__2FqyZ');
                    if (characterNameDivs.length > 0) {
                        characterNameElement = characterNameDivs[0].outerHTML;
                    }
                } else {
                    // 他人角色名片（从剪贴板）- 使用缓存的数据
                    if (!state.clipboardCharacterData) {
                        console.warn('剪贴板数据缓存为空，无法刷新布局');
                        return;
                    }
    
                    characterData = state.clipboardCharacterData.data;
                    characterName = state.clipboardCharacterData.name;
                    characterNameElement = state.clipboardCharacterData.nameElement;
                }
    
                // 重新生成名片HTML
                const newCardHTML = generateCharacterCard(characterData, characterName, characterNameElement, isMyCharacterCard);
                characterCard.outerHTML = newCardHTML;
    
                // 重新绑定事件监听器
                const newCharacterCard = document.querySelector('#character-card');
                if (isMyCharacterCard) {
                    // 重新绑定技能槽点击事件
                    const skillSlots = newCharacterCard.querySelectorAll('.skill-slot, .empty-skill-slot');
                    skillSlots.forEach(slot => {
                        slot.addEventListener('click', function() {
                            const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                            showSkillSelector(skillIndex);
                        });
                    });
                }
    
                // 重新绑定布局切换按钮事件
                const layoutToggleBtn = modal.querySelector('.layout-toggle-btn');
                if (layoutToggleBtn) {
                    layoutToggleBtn.onclick = toggleLayoutMode;
                    // 更新按钮文本
                    updateLayoutToggleButton();
                }
    
                // 更新模态框容器的布局类名
                updateModalLayoutClass();
            }
    
            // 获取布局切换按钮的文本
            function getLayoutToggleText() {
                const currentMode = getEffectiveLayoutMode();
                const currentIcon = currentMode === 'mobile' ? '📱' : '🖥';
                const nextIcon = currentMode === 'mobile' ? '🖥' : '📱';
                return `${currentIcon} → ${nextIcon}`;
            }
    
            // 更新布局切换按钮的显示
            function updateLayoutToggleButton() {
                const layoutToggleBtn = document.querySelector('.layout-toggle-btn');
                if (!layoutToggleBtn) return;
    
                const currentMode = getEffectiveLayoutMode();
                const currentIcon = currentMode === 'mobile' ? '📱' : '🖥';
                const nextIcon = currentMode === 'mobile' ? '🖥' : '📱';
    
                layoutToggleBtn.textContent = `${currentIcon} → ${nextIcon}`;
                layoutToggleBtn.title = isZH ?
                    `当前: ${currentMode === 'mobile' ? '移动端' : 'PC端'}布局，点击切换到${currentMode === 'mobile' ? 'PC端' : '移动端'}布局` :
                    `Current: ${currentMode === 'mobile' ? 'Mobile' : 'Desktop'} layout, click to switch to ${currentMode === 'mobile' ? 'Desktop' : 'Mobile'} layout`;
            }
    
            // 更新模态框容器的布局类名
            function updateModalLayoutClass() {
                const modalContent = document.querySelector('.character-card-modal .modal-content');
                if (!modalContent) return;
    
                const currentMode = getEffectiveLayoutMode();
    
                // 移除之前的布局类名
                modalContent.classList.remove('desktop-layout', 'mobile-layout');
    
                // 添加当前布局对应的类名
                if (currentMode === 'desktop') {
                    modalContent.classList.add('desktop-layout');
                } else {
                    modalContent.classList.add('mobile-layout');
                }
            }
    
            // 简化的SVG创建工具
            class CharacterCardSVGTool {
                constructor() {
                    this.isLoaded = false;
                    this.spriteSheets = {
                        items: null,
                        skills: null,
                        abilities: null,
                        misc: null
                    };
                }
    
                // 动态获取SVG sprite文件路径
                async discoverSpritePaths() {
                    const spritePaths = {};
    
                    try {
                        // 方法1: 从页面中已存在的SVG use元素获取路径
                        const useElements = document.querySelectorAll('svg use[href*="/static/media/"]');
                        for (const useEl of useElements) {
                            const href = useEl.getAttribute('href');
                            if (href && href.includes('#')) {
                                const [filePath] = href.split('#');
                                if (filePath.includes('items_sprite')) {
                                    spritePaths.items = filePath;
                                } else if (filePath.includes('skills_sprite')) {
                                    spritePaths.skills = filePath;
                                } else if (filePath.includes('abilities_sprite')) {
                                    spritePaths.abilities = filePath;
                                } else if (filePath.includes('misc_sprite')) {
                                    spritePaths.misc = filePath;
                                } else if (filePath.includes('chat_icons_sprite')) {
                                    spritePaths.chat_icons = filePath;
                                }
                            }
                        }
    
                        // 方法2: 如果方法1没有找到足够的路径，尝试从CSS中获取
                        if (Object.keys(spritePaths).length < 3) {
                            const stylesheets = Array.from(document.styleSheets);
                            for (const stylesheet of stylesheets) {
                                try {
                                    const rules = Array.from(stylesheet.cssRules || stylesheet.rules || []);
                                    for (const rule of rules) {
                                        if (rule.style && rule.style.backgroundImage) {
                                            const bgImage = rule.style.backgroundImage;
                                            const match = bgImage.match(/url\(['"]?([^'"]*\/static\/media\/[^'"]*\.svg)['"]?\)/);
                                            if (match) {
                                                const filePath = match[1];
                                                if (filePath.includes('items_sprite')) {
                                                    spritePaths.items = filePath;
                                                } else if (filePath.includes('skills_sprite')) {
                                                    spritePaths.skills = filePath;
                                                } else if (filePath.includes('abilities_sprite')) {
                                                    spritePaths.abilities = filePath;
                                                } else if (filePath.includes('misc_sprite')) {
                                                    spritePaths.misc = filePath;
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // 跨域或其他CSS访问错误，忽略
                                }
                            }
                        }
    
                        // 方法3: 从游戏的JavaScript代码中提取路径
                        if (Object.keys(spritePaths).length < 3) {
                            const jsPathsFound = await this.extractPathsFromJS();
                            Object.assign(spritePaths, jsPathsFound);
                        }
    
                        // 方法4: 如果还是没找到，尝试通过网络请求探测常见的文件名模式
                        const missingTypes = ['items', 'skills', 'abilities', 'misc'].filter(type => !spritePaths[type]);
                        if (missingTypes.length > 0) {
                            console.log('尝试通过网络请求探测SVG文件路径...');
    
                            // 生成可能的哈希值模式（8位十六进制）
                            const possibleHashes = await this.generatePossibleHashes();
    
                            for (const type of missingTypes) {
                                for (const hash of possibleHashes) {
                                    const testPath = `/static/media/${type}_sprite.${hash}.svg`;
                                    try {
                                        const response = await fetch(testPath, { method: 'HEAD' });
                                        if (response.ok) {
                                            spritePaths[type] = testPath;
                                            console.log(`发现 ${type} sprite: ${testPath}`);
                                            break;
                                        }
                                    } catch (e) {
                                        // 继续尝试下一个
                                    }
                                }
                            }
                        }
    
                    } catch (error) {
                        console.warn('动态获取SVG路径时出错:', error);
                    }
    
                    return spritePaths;
                }
    
                // 从游戏的JavaScript代码中提取SVG路径
                async extractPathsFromJS() {
                    const foundPaths = {};
    
                    try {
                        // 获取所有script标签
                        const scripts = Array.from(document.querySelectorAll('script[src]'));
    
                        for (const script of scripts) {
                            // 只检查游戏的主要JS文件
                            if (script.src.includes('/static/js/') || script.src.includes('main.') || script.src.includes('chunk.')) {
                                try {
                                    const response = await fetch(script.src);
                                    const jsContent = await response.text();
    
                                    // 搜索SVG sprite路径的模式
                                    const patterns = [
                                        // 直接的路径字符串
                                        /["'](\/static\/media\/(?:items|skills|abilities|misc)_sprite\.[a-f0-9]{8,}\.svg)["']/g,
                                        // webpack模块导入
                                        /(?:items|skills|abilities|misc)_sprite["']:\s*["']([^"']+)["']/g,
                                        // React组件中的导入
                                        /from\s+["']([^"']*(?:items|skills|abilities|misc)_sprite[^"']*)["']/g
                                    ];
    
                                    for (const pattern of patterns) {
                                        let match;
                                        while ((match = pattern.exec(jsContent)) !== null) {
                                            const path = match[1];
                                            if (path.includes('items_sprite')) {
                                                foundPaths.items = path;
                                            } else if (path.includes('skills_sprite')) {
                                                foundPaths.skills = path;
                                            } else if (path.includes('abilities_sprite')) {
                                                foundPaths.abilities = path;
                                            } else if (path.includes('misc_sprite')) {
                                                foundPaths.misc = path;
                                            }
                                        }
                                    }
    
                                    // 如果找到了足够的路径，就停止搜索
                                    if (Object.keys(foundPaths).length >= 3) {
                                        break;
                                    }
    
                                } catch (e) {
                                    // 跳过无法访问的脚本
                                    continue;
                                }
                            }
                        }
    
                        if (Object.keys(foundPaths).length > 0) {
                            console.log('从JavaScript代码中发现的SVG路径:', foundPaths);
                        }
    
                    } catch (error) {
                        console.warn('从JavaScript代码提取SVG路径时出错:', error);
                    }
    
                    return foundPaths;
                }
    
                // 生成可能的哈希值（基于常见的webpack哈希模式）
                async generatePossibleHashes() {
                    const hashes = [];
    
                    // 从页面中已有的静态资源URL提取哈希模式
                    const allLinks = Array.from(document.querySelectorAll('link[href*="/static/"], script[src*="/static/"]'));
                    const allUrls = [
                        ...allLinks.map(el => el.href || el.src),
                        ...Array.from(document.querySelectorAll('img[src*="/static/"]')).map(el => el.src)
                    ];
    
                    for (const url of allUrls) {
                        const match = url.match(/\/static\/media\/[^\/]+\.([a-f0-9]{8,})\.(?:svg|png|jpg|js|css)/);
                        if (match && match[1]) {
                            hashes.push(match[1]);
                        }
                    }
    
                    // 去重并限制数量
                    return [...new Set(hashes)].slice(0, 10);
                }
    
                async loadSpriteSheets() {
                    console.log('开始动态加载SVG sprite系统...');
    
                    // 检查缓存的路径（避免重复检测）
                    const cacheKey = 'mwi_sprite_paths_cache';
                    const cachedPaths = this.getCachedSpritePaths(cacheKey);
    
                    let discoveredPaths = {};
    
                    if (cachedPaths && Object.keys(cachedPaths).length >= 3) {
                        console.log('使用缓存的SVG sprite路径:', cachedPaths);
                        discoveredPaths = cachedPaths;
                    } else {
                        console.log('缓存无效，开始动态发现SVG sprite路径...');
                        // 动态发现sprite路径
                        discoveredPaths = await this.discoverSpritePaths();
    
                        // 缓存发现的路径
                        if (Object.keys(discoveredPaths).length > 0) {
                            this.cacheSpritePaths(cacheKey, discoveredPaths);
                        }
                    }
    
                    // 更新sprite路径，使用发现的路径或后备路径
                    this.spriteSheets = {
                        items: discoveredPaths.items || '/static/media/items_sprite.d4d08849.svg', // 后备路径
                        skills: discoveredPaths.skills || '/static/media/skills_sprite.3bb4d936.svg',
                        abilities: discoveredPaths.abilities || '/static/media/abilities_sprite.fdd1b4de.svg',
                        misc: discoveredPaths.misc || '/static/media/misc_sprite.6fa5e97c.svg'
                    };
    
                    console.log('SVG sprite系统已初始化');
                    console.log('发现的Sprite文件路径:', discoveredPaths);
                    console.log('使用的Sprite文件路径:', this.spriteSheets);
    
                    // 验证路径是否有效（仅验证发现的路径）
                    let validPaths = 0;
                    const pathsToValidate = Object.keys(discoveredPaths).length > 0 ?
                        Object.entries(discoveredPaths) :
                        Object.entries(this.spriteSheets).slice(0, 2); // 只验证前两个作为快速检查
    
                    for (const [type, path] of pathsToValidate) {
                        if (path) {
                            try {
                                const response = await fetch(path, { method: 'HEAD' });
                                if (response.ok) {
                                    validPaths++;
                                } else {
                                    console.warn(`SVG sprite ${type} 路径无效: ${path}`);
                                    // 如果发现的路径无效，清除缓存
                                    if (Object.keys(discoveredPaths).length > 0) {
                                        this.clearCachedSpritePaths(cacheKey);
                                    }
                                }
                            } catch (e) {
                                console.warn(`SVG sprite ${type} 路径检查失败: ${path}`);
                            }
                        }
                    }
    
                    // 最终从DOM再刷新一次，确保使用最新的hash（优先级最高）
                    this.refreshSpritePathsFromDOM();
    
                    this.isLoaded = validPaths > 0 || Object.keys(this.spriteSheets).length > 0;
                    console.log(`SVG sprite系统加载${this.isLoaded ? '成功' : '失败'}，验证的有效路径: ${validPaths}/${pathsToValidate.length}`);
                    return this.isLoaded;
                }
    
                // 缓存sprite路径
                cacheSpritePaths(cacheKey, paths) {
                    try {
                        const cacheData = {
                            paths: paths,
                            timestamp: Date.now(),
                            version: window.location.href // 使用URL作为版本标识
                        };
                        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                        console.log('SVG sprite路径已缓存');
                    } catch (e) {
                        console.warn('缓存SVG sprite路径失败:', e);
                    }
                }
    
                // 获取缓存的sprite路径
                getCachedSpritePaths(cacheKey) {
                    try {
                        const cached = localStorage.getItem(cacheKey);
                        if (!cached) return null;
    
                        const cacheData = JSON.parse(cached);
                        const now = Date.now();
                        const cacheAge = now - cacheData.timestamp;
                        const maxAge = 24 * 60 * 60 * 1000; // 24小时
    
                        // 检查缓存是否过期或版本是否匹配
                        if (cacheAge > maxAge || cacheData.version !== window.location.href) {
                            localStorage.removeItem(cacheKey);
                            return null;
                        }
    
                        return cacheData.paths;
                    } catch (e) {
                        console.warn('读取缓存的SVG sprite路径失败:', e);
                        return null;
                    }
                }
    
                // 清除缓存的sprite路径
                clearCachedSpritePaths(cacheKey) {
                    try {
                        localStorage.removeItem(cacheKey);
                        console.log('已清除SVG sprite路径缓存');
                    } catch (e) {
                        console.warn('清除SVG sprite路径缓存失败:', e);
                    }
                }
    
                // 动态获取指定sprite的路径（从页面DOM中实时发现）
                getDynamicSpritePath(spriteNamePrefix) {
                    try {
                        const useElements = document.querySelectorAll(`svg use[href*="${spriteNamePrefix}"]`);
                        if (useElements.length > 0) {
                            const href = useElements[0].getAttribute('href');
                            if (href && href.includes('#')) {
                                const [filePath] = href.split('#');
                                return filePath;
                            }
                        }
                        return null;
                    } catch (e) {
                        console.warn(`获取${spriteNamePrefix}路径失败:`, e);
                        return null;
                    }
                }
    
                // 动态获取chat_icons_sprite路径
                getChatIconsSpritePath() {
                    const path = this.getDynamicSpritePath('chat_icons_sprite');
                    if (path) {
                        console.log('动态发现chat_icons_sprite路径:', path);
                        return path;
                    }
                    console.log('未找到chat_icons_sprite，使用默认路径');
                    return '/static/media/chat_icons_sprite.61d2499f.svg';
                }
    
                // 从DOM中实时刷新所有sprite路径，确保使用最新的hash
                refreshSpritePathsFromDOM() {
                    const typeMap = {
                        items: 'items_sprite',
                        skills: 'skills_sprite',
                        abilities: 'abilities_sprite',
                        misc: 'misc_sprite'
                    };
                    let updated = false;
                    for (const [type, prefix] of Object.entries(typeMap)) {
                        const dynamicPath = this.getDynamicSpritePath(prefix);
                        if (dynamicPath && this.spriteSheets[type] !== dynamicPath) {
                            console.log(`刷新${type} sprite路径: ${this.spriteSheets[type]} -> ${dynamicPath}`);
                            this.spriteSheets[type] = dynamicPath;
                            updated = true;
                        }
                    }
                    if (updated) {
                        const cacheKey = 'mwi_sprite_paths_cache';
                        this.clearCachedSpritePaths(cacheKey);
                        console.log('已从DOM刷新sprite路径，旧缓存已清除');
                    }
                    return updated;
                }
    
                // 创建MWI风格的SVG图标 - 直接返回HTML字符串
                createSVGIcon(itemId, options = {}) {
                    const { className = 'Icon_icon__2LtL_', title = itemId, type = 'items' } = options;
                    // 尝试从DOM实时获取最新路径（轻量操作，仅在路径有变化时更新）
                    const dynamicPath = this.getDynamicSpritePath(`${type}_sprite`);
                    if (dynamicPath && this.spriteSheets[type] !== dynamicPath) {
                        this.spriteSheets[type] = dynamicPath;
                    }
                    const svgHref = `${this.spriteSheets[type]}#${itemId}`;
    
                    // 收集调试信息
                    if (!state.debugInfo.firstSvgPath) {
                        state.debugInfo.firstSvgPath = svgHref;
                    }
                    state.debugInfo.iconCount++;
    
                    return `<svg role="img" aria-label="${title}" class="${className}" width="100%" height="100%">
                        <use href="${svgHref}"></use>
                    </svg>`;
                }
    
                // 后备图标
                createFallbackIcon(itemId, className, title) {
                    const text = itemId.length > 6 ? itemId.substring(0, 6) : itemId;
                    return `<div class="${className}" title="${title}" style="
                        width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
                        background: #4a90e2; color: white; font-size: 10px; border-radius: 4px;
                    ">${text}</div>`;
                }
    
                hasIcon() { return this.isLoaded; }
            }
    
            // 技能选择器相关函数
            function showSkillSelector(skillIndex) {
                // 获取所有可用技能（包括未装备的）
                const allSkills = window.characterCardWebSocketData?.characterAbilities || [];
                const availableSkills = allSkills
                    .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"))
                    .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));
    
                // 创建技能选择器模态框
                const modal = document.createElement('div');
                modal.className = 'skill-selector-modal';
                modal.innerHTML = `
                    <div class="skill-selector-content">
                        <div class="skill-selector-header">
                            <h3>${isZH ? '选择技能' : 'Select Skill'}</h3>
                            <button class="close-skill-selector">&times;</button>
                        </div>
                        <div class="skill-selector-grid">
                            <!-- 空按钮 -->
                            <div class="skill-option empty-skill-option" data-skill-index="${skillIndex}" data-ability-hrid="" data-level="0">
                                <div class="skill-option-icon">
                                    <div class="empty-skill-icon">-</div>
                                </div>
                                <div class="skill-option-level">${isZH ? '空' : 'Empty'}</div>
                            </div>
                            ${availableSkills.map(skill => `
                                <div class="skill-option" data-skill-index="${skillIndex}" data-ability-hrid="${skill.abilityHrid}" data-level="${skill.level}">
                                    <div class="skill-option-icon">
                                        ${createSvgIcon(skill.abilityHrid, 'abilities')}
                                    </div>
                                    <div class="skill-option-level">Lv.${skill.level}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
    
                // 添加事件监听器
                modal.querySelector('.close-skill-selector').onclick = () => {
                    document.body.removeChild(modal);
                };
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        document.body.removeChild(modal);
                    }
                };
    
                // 添加技能选项点击事件监听器
                const skillOptions = modal.querySelectorAll('.skill-option');
                skillOptions.forEach(option => {
                    option.addEventListener('click', function() {
                        const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                        const abilityHrid = this.getAttribute('data-ability-hrid');
                        const level = parseInt(this.getAttribute('data-level'));
                        selectSkill(skillIndex, abilityHrid, level);
                    });
                });
    
                document.body.appendChild(modal);
            }
    
            function selectSkill(skillIndex, abilityHrid, level) {
                // 更新用户选择的技能
                if (abilityHrid === "") {
                    // 选择"空"选项，删除该位置的技能
                    delete state.customSkills.selectedSkills[skillIndex];
                } else {
                    // 选择具体技能
                    state.customSkills.selectedSkills[skillIndex] = {
                        abilityHrid: abilityHrid,
                        level: level,
                        slotNumber: skillIndex + 1
                    };
                }
    
                                // 重新生成技能面板
                    const characterCard = document.querySelector('#character-card');
                    if (characterCard) {
                        const skillPanel = characterCard.querySelector('.skill-panel');
                        if (skillPanel) {
                            // 重新生成技能面板内容
                            const characterData = {
                                abilities: window.characterCardWebSocketData?.characterAbilities || [],
                                characterSkills: window.characterCardWebSocketData?.characterSkills || []
                            };
                            const newSkillPanel = generateSkillPanel(characterData, true);
                            skillPanel.innerHTML = newSkillPanel.replace(/<div class="skill-panel">([\s\S]*?)<\/div>$/, '$1');
    
                            // 重新添加事件监听器
                            const skillSlots = skillPanel.querySelectorAll('.skill-slot, .empty-skill-slot');
                            skillSlots.forEach(slot => {
                                slot.addEventListener('click', function() {
                                    const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                                    showSkillSelector(skillIndex);
                                });
                            });
                        }
                    }
    
                    // 确保布局切换按钮的事件监听器仍然有效
                    const characterCardModal = characterCard.closest('.character-card-modal');
                    if (characterCardModal) {
                        const layoutToggleBtn = characterCardModal.querySelector('.layout-toggle-btn');
                        if (layoutToggleBtn) {
                            // 重新绑定布局切换按钮事件
                            layoutToggleBtn.onclick = toggleLayoutMode;
                            // 更新按钮文本
                            updateLayoutToggleButton();
                        }
                    }
    
                // 关闭技能选择器
                const modal = document.querySelector('.skill-selector-modal');
                if (modal) {
                    document.body.removeChild(modal);
                }
            }
    
            // 全局版本号
            const VERSION = '1.7.0';
    
            // 使用闭包管理状态，避免全局变量
            const state = {
                svgTool: new CharacterCardSVGTool(),
                debugInfo: {
                    firstSvgPath: null,
                    iconCount: 0
                },
                observer: null,
                timer: null,
                isInitialized: false,
                // 用户自定义技能展示状态
                customSkills: {
                    selectedSkills: [], // 用户选择的技能列表
                    maxSkills: 8 // 最大技能数量
                },
                // 布局模式控制
                layoutMode: {
                    forcedMode: null, // null=自动检测, 'desktop'=强制PC端, 'mobile'=强制移动端
                    getCurrentMode: function() {
                        if (this.forcedMode) return this.forcedMode;
                        return isMobile() ? 'mobile' : 'desktop';
                    }
                },
                // 缓存剪贴板角色数据，用于布局切换
                clipboardCharacterData: null,
                // 队伍名片数据
                teamCard: {
                    members: [], // [{ name, data, isSelf }]
                    teamName: '',
                    editMode: false,
                    originalMembers: null
                }
            };
    
            // 简化的SVG图标创建函数
            function createSvgIcon(itemHrid, iconType = null, className = 'Icon_icon__2LtL_') {
                // 自动检测图标类型和提取itemId
                let type = 'items';
                let itemId = itemHrid;
    
                if (itemHrid.startsWith('/items/')) {
                    type = 'items';
                    itemId = itemHrid.replace('/items/', '');
                } else if (itemHrid.startsWith('/abilities/')) {
                    type = 'abilities';
                    itemId = itemHrid.replace('/abilities/', '');
                } else if (itemHrid.startsWith('/skills/')) {
                    type = 'skills';
                    itemId = itemHrid.replace('/skills/', '');
                } else if (itemHrid.startsWith('/misc/')) {
                    type = 'misc';
                    itemId = itemHrid.replace('/misc/', '');
                } else {
                    // 对于基础属性图标
                    if (['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'].includes(itemHrid)) {
                        type = 'skills';
                        itemId = itemHrid;
                    } else {
                        itemId = itemHrid.replace("/items/", "").replace("/abilities/", "").replace("/skills/", "").replace("/misc/", "");
                    }
                }
    
                // 如果手动指定了类型，使用指定的类型
                if (iconType) {
                    type = iconType;
                }
    
                // 使用SVG工具创建图标
                if (state.svgTool && state.svgTool.isLoaded) {
                    return state.svgTool.createSVGIcon(itemId, {
                        className: className,
                        title: itemId,
                        type: type
                    });
                }
    
                // 后备方案
                return state.svgTool.createFallbackIcon(itemId, className, itemId);
            }
    
            function generateEquipmentPanel(characterObj) {
                // MWI装备槽位映射 - 使用grid位置
                const equipmentSlots = {
                    "/item_locations/back": { row: 1, col: 1, name: "背部" },
                    "/item_locations/head": { row: 1, col: 2, name: "头部" },
                    "/item_locations/main_hand": { row: 2, col: 1, name: "主手" },
                    "/item_locations/body": { row: 2, col: 2, name: "身体" },
                    "/item_locations/off_hand": { row: 2, col: 3, name: "副手" },
                    "/item_locations/hands": { row: 3, col: 1, name: "手部" },
                    "/item_locations/legs": { row: 3, col: 2, name: "腿部" },
                    "/item_locations/pouch": { row: 3, col: 3, name: "口袋" },
                    "/item_locations/feet": { row: 4, col: 2, name: "脚部" },
                    "/item_locations/neck": { row: 1, col: 5, name: "项链" },
                    "/item_locations/earrings": { row: 2, col: 5, name: "耳环" },
                    "/item_locations/ring": { row: 3, col: 5, name: "戒指" },
                    "/item_locations/trinket": { row: 1, col: 3, name: "饰品" },
                    "/item_locations/two_hand": { row: 2, col: 1, name: "双手" },
                    "/item_locations/charm": { row: 4, col: 5, name: "护符" }
                };
    
                let items = characterObj.equipment || characterObj.characterItems || [];
                const equipmentMap = {};
                let hasTwoHandWeapon = false;
    
                // 构建装备映射
                items.forEach(item => {
                    const slotInfo = equipmentSlots[item.itemLocationHrid];
                    if (slotInfo) {
                        equipmentMap[item.itemLocationHrid] = item;
                        if (item.itemLocationHrid === "/item_locations/two_hand") hasTwoHandWeapon = true;
                    }
                });
    
                // 创建MWI风格的装备面板
                let html = '<div class="equipment-panel">';
                html += `<div class="panel-title">${isZH ? '装备' : 'Equipments'}</div>`;
                html += '<div class="EquipmentPanel_playerModel__3LRB6" style="margin-top:30px">';
    
                // 遍历所有装备槽位
                Object.entries(equipmentSlots).forEach(([slotHrid, slotInfo]) => {
                    // 如果有双手武器，跳过单手主手槽
                    if (hasTwoHandWeapon && slotHrid === "/item_locations/main_hand") {
                        return;
                    }
    
                    // 如果没有双手武器，跳过双手槽
                    if (!hasTwoHandWeapon && slotHrid === "/item_locations/two_hand") {
                        return;
                    }
    
                    const item = equipmentMap[slotHrid];
    
                    html += `<div style="grid-row-start: ${slotInfo.row}; grid-column-start: ${slotInfo.col};">`;
                    html += '<div class="ItemSelector_itemSelector__2eTV6">';
                    html += '<div class="ItemSelector_itemContainer__3olqe">';
                    html += '<div class="Item_itemContainer__x7kH1">';
                    html += '<div>';
    
                    if (item) {
                        // 有装备的槽位
                        const itemName = item.itemHrid.replace('/items/', '');
                        const enhancementLevel = item.enhancementLevel || 0;
    
                        html += '<div class="Item_item__2De2O Item_clickable__3viV6" style="position: relative;">';
                        html += '<div class="Item_iconContainer__5z7j4">';
                        html += createSvgIcon(item.itemHrid, 'items'); // 使用MWI的Icon类
                        html += '</div>';
    
                        // 强化等级 - 完全按照MWI原生格式
                        if (enhancementLevel > 0) {
                            html += `<div class="Item_enhancementLevel__19g-e enhancementProcessed enhancementLevel_${enhancementLevel}" style="z-index: 9">+${enhancementLevel}</div>`;
                        }
    
                        html += '</div>';
                    } else {
                        // 空装备槽
                        html += '<div class="Item_item__2De2O" style="position: relative; opacity: 0.3;">';
                        html += '<div class="Item_iconContainer__5z7j4">';
                        html += `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #999; font-size: 10px;">${isZH ? '空' : 'Empty'}</div>`;
                        html += '</div>';
                        html += '</div>';
                    }
    
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                });
    
                html += '</div>'; // EquipmentPanel_playerModel__3LRB6
                html += '</div>'; // equipment-panel
    
                return html;
            }
    
            // 从页面获取战斗等级
            function calculateCombatLevel(characterObj) {
                try {
                    // 获取各项属性等级
                    const stamina = characterObj.staminaLevel || 0;
                    const intelligence = characterObj.intelligenceLevel || 0;
                    const defense = characterObj.defenseLevel || 0;
                    const attack = characterObj.attackLevel || 0;
                    const melee = getMeleeLevelFromCharacterObj(characterObj);
                    const ranged = characterObj.rangedLevel || 0;
                    const magic = characterObj.magicLevel || 0;
    
                    // 计算公式：战斗等级 = 0.1 * (耐力 + 智力 + 攻击 + 防御 + MAX(近战, 远程, 魔法)) + 0.5 * MAX(攻击, 防御, 近战, 远程, 魔法)
                    const maxCombatSkill = Math.max(melee, ranged, magic);
                    const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
                    const combatLevel = Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);
    
                    return combatLevel;
                } catch (error) {
                    console.log('计算战斗等级失败:', error);
                    return 0;
                }
            }
    
            function getCombatLevelFromPage() {
                try {
                    // 查找包含战斗等级信息的元素
                    const overviewTab = document.querySelector('.SharableProfile_overviewTab__W4dCV');
                    if (overviewTab) {
                        // 查找包含"战斗等级:"文本的div元素
                        const combatLevelDiv = Array.from(overviewTab.querySelectorAll('div')).find(div =>
                            div.textContent && div.textContent.includes('战斗等级:')
                        );
    
                        if (combatLevelDiv) {
                            // 提取数字
                            const match = combatLevelDiv.textContent.match(/战斗等级:\s*(\d+)/);
                            if (match && match[1]) {
                                return parseInt(match[1]);
                            }
                        }
                    }
                } catch (error) {
                    console.log('获取战斗等级失败:', error);
                }
                return 0;
            }
    
            function generateAbilityPanel(characterObj) {
                const abilityMapping = [
                    { key: "staminaLevel", name: isZH ? "耐力" : "Stamina", icon: "stamina" },
                    { key: "intelligenceLevel", name: isZH ? "智力" : "Intelligence", icon: "intelligence" },
                    { key: "attackLevel", name: isZH ? "攻击" : "Attack", icon: "attack" },
                    { key: "meleeLevel", name: isZH ? "近战" : "Melee", icon: "melee" },
                    { key: "defenseLevel", name: isZH ? "防御" : "Defense", icon: "defense" },
                    { key: "rangedLevel", name: isZH ? "远程" : "Ranged", icon: "ranged" },
                    { key: "magicLevel", name: isZH ? "魔法" : "Magic", icon: "magic" }
                ];
    
                let html = '<div class="ability-panel">';
                html += `<div class="panel-title">${isZH ? '属性等级' : 'Skills'}</div><div class="ability-list">`;
    
                // 添加战斗等级作为第一行
                const combatLevel = calculateCombatLevel(characterObj);
                html += `<div class="ability-row">
                    <div class="ability-icon">
                        ${createSvgIcon('combat', 'misc')}
                    </div>
                    <span style="flex: 1;">${isZH ? '战斗' : 'Combat'}</span>
                    <span class="level">Lv.${combatLevel}</span>
                </div>`;
    
                abilityMapping.forEach(ability => {
                    let level = 0;
                    if (characterObj[ability.key]) {
                        level = characterObj[ability.key];
                    } else if (characterObj.characterSkills) {
                        const skillKey = ability.key.replace('Level', '');
                        if (skillKey === 'melee') {
                            // 特殊处理近战等级，使用兼容函数
                            level = getMeleeLevel(characterObj.characterSkills);
                        } else {
                            const skill = characterObj.characterSkills.find(skill => skill.skillHrid.includes(`/skills/${skillKey}`));
                            level = skill ? skill.level : 0;
                        }
                    }
    
                    html += `<div class="ability-row">
                        <div class="ability-icon">${createSvgIcon(ability.icon, 'skills')}</div>
                        <span style="flex: 1;">${ability.name}</span>
                        <span class="level">Lv.${level}</span>
                    </div>`;
                });
    
                return html + '</div></div>';
            }
    
            function generateSkillPanel(data, isMyCharacter = false, options = {}) {
                const teamMode = options && options.teamMode;
                let abilities = data.abilities || data.characterSkills || [];
    
                let combatSkills;
    
                if (isMyCharacter) {
                    // 团队模式：仅显示已装备技能（slotNumber>0），不显示空槽，不可编辑
                    if (teamMode) {
                        combatSkills = abilities
                            .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"))
                            .filter(ability => ability.slotNumber && ability.slotNumber > 0)
                            .sort((a, b) => a.slotNumber - b.slotNumber);
                        let html = '<div class="skill-panel">';
                        html += `<div class="panel-title">${isZH ? '技能等级' : 'Abilities'}</div>`;
                        html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';
                        combatSkills.forEach(selectedSkill => {
                            html += '<div>';
                            html += `<div class="Ability_ability__1njrh">`;
                            html += '<div class="Ability_iconContainer__3syNQ">';
                            html += createSvgIcon(selectedSkill.abilityHrid, 'abilities');
                            html += '</div>';
                            html += `<div class="Ability_level__1L-do">Lv.${selectedSkill.level}</div>`;
                            html += '</div>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '</div>';
                        return html;
                    }
                    // 场景2：根据slotNumber筛选和排序
                    combatSkills = abilities
                        .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"))
                        .filter(ability => ability.slotNumber && ability.slotNumber > 0)
                        .sort((a, b) => a.slotNumber - b.slotNumber); // 按slotNumber升序排列
    
                    // 初始化用户选择的技能（如果为空）
                    if (state.customSkills.selectedSkills.length === 0) {
                        // 默认显示前5个技能
                        state.customSkills.selectedSkills = combatSkills.slice(0, 5).map(skill => ({
                            abilityHrid: skill.abilityHrid,
                            level: skill.level,
                            slotNumber: skill.slotNumber
                        }));
                    }
    
                    let html = '<div class="skill-panel">';
                    html += `<div class="panel-title">${isZH ? '技能等级' : 'Abilities'}</div>`;
    
                    // 使用MWI原生的技能网格容器
                    html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';
    
                    // 渲染用户选择的技能（最多8个）
                    for (let i = 0; i < state.customSkills.maxSkills; i++) {
                        const selectedSkill = state.customSkills.selectedSkills[i];
    
                        if (selectedSkill) {
                            // 显示已选择的技能
                            html += '<div>';
                            html += `<div class="Ability_ability__1njrh Ability_clickable__w9HcM skill-slot" data-skill-index="${i}">`;
                            html += '<div class="Ability_iconContainer__3syNQ">';
                            html += createSvgIcon(selectedSkill.abilityHrid, 'abilities');
                            html += '</div>';
                            html += `<div class="Ability_level__1L-do">Lv.${selectedSkill.level}</div>`;
                            html += '</div>';
                            html += '</div>';
                        } else {
                            // 显示空白位置（鼠标悬停时显示虚线边框）
                            html += '<div>';
                            html += `<div class="Ability_ability__1njrh Ability_clickable__w9HcM empty-skill-slot" data-skill-index="${i}">`;
                            html += '</div>';
                            html += '</div>';
                        }
                    }
    
                    html += '</div>'; // AbilitiesPanel_abilityGrid__-p-VF
                    html += '</div>'; // skill-panel
    
                    return html;
                } else {
                    // 场景1：保持原始顺序，不排序
                    combatSkills = abilities
                        .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"));
                    // 团队模式下，如果包含 slotNumber 字段，则仅展示已装备技能
                    if (teamMode) {
                        const hasSlot = combatSkills.some(a => a.slotNumber && a.slotNumber > 0);
                        if (hasSlot) {
                            combatSkills = combatSkills
                                .filter(a => a.slotNumber && a.slotNumber > 0)
                                .sort((a, b) => a.slotNumber - b.slotNumber);
                        }
                    }
    
                    let html = '<div class="skill-panel">';
                    html += `<div class="panel-title">${isZH ? '技能等级' : 'Abilities'}</div>`;
    
                    // 使用MWI原生的技能网格容器
                    html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';
    
                    // 渲染每个技能
                    combatSkills.forEach(ability => {
                        const abilityId = ability.abilityHrid.replace('/abilities/', '');
    
                        html += '<div>';
                        html += '<div class="Ability_ability__1njrh Ability_clickable__w9HcM">';
                        html += '<div class="Ability_iconContainer__3syNQ">';
                        html += createSvgIcon(ability.abilityHrid, 'abilities'); // 使用完整的hrid
                        html += '</div>';
                        html += `<div class="Ability_level__1L-do">Lv.${ability.level}</div>`;
                        html += '</div>';
                        html += '</div>';
                    });
    
                    html += '</div>'; // AbilitiesPanel_abilityGrid__-p-VF
                    html += '</div>'; // skill-panel
    
                    return html;
                }
            }
    
            function generateHousePanel(data) {
                const houseRoomsMapping = [
                    { hrid: "/house_rooms/dining_room", icon: "stamina", name: isZH ? "餐厅" : "Dining Room" },
                    { hrid: "/house_rooms/library", icon: "intelligence", name: isZH ? "图书馆" : "Library" },
                    { hrid: "/house_rooms/dojo", icon: "attack", name: isZH ? "道场" : "Dojo" },
                    { hrid: "/house_rooms/gym", icon: "melee", name: isZH ? "健身房" : "Gym" },
                    { hrid: "/house_rooms/armory", icon: "defense", name: isZH ? "军械库" : "Armory" },
                    { hrid: "/house_rooms/archery_range", icon: "ranged", name: isZH ? "射箭场" : "Archery Range" },
                    { hrid: "/house_rooms/mystical_study", icon: "magic", name: isZH ? "神秘研究室" : "Mystical Study" }
                ];
    
                let houseRoomMap = data.houseRooms || data.characterHouseRoomMap || {};
    
                let html = '<div class="house-panel">';
                html += `<div class="panel-title">${isZH ? '房屋等级' : 'House Rooms'}</div>`;
    
                // 使用和技能面板相同的MWI原生结构
                html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';
    
                // 遍历所有房屋类型
                houseRoomsMapping.forEach(houseRoom => {
                    let level = 0;
                    if (houseRoomMap[houseRoom.hrid]) {
                        level = typeof houseRoomMap[houseRoom.hrid] === 'object'
                            ? houseRoomMap[houseRoom.hrid].level || 0
                            : houseRoomMap[houseRoom.hrid];
                    }
    
                    // 使用和技能相同的MWI原生结构
                    html += '<div>';
                    html += '<div class="Ability_ability__1njrh Ability_clickable__w9HcM">';
                    html += '<div class="Ability_iconContainer__3syNQ">';
                    html += createSvgIcon(houseRoom.icon, 'skills'); // 使用标准的Icon类
                    html += '</div>';
                    // 为8级房屋添加特殊显示
                    let levelText = '';
                    let levelClass = 'Ability_level__1L-do';
    
                    if (level === 8) {
                        levelText = `Lv.8`;
                        levelClass += ' house-max-level';
                    } else if (level > 0) {
                        levelText = `Lv.${level}`;
                    } else {
                        levelText = isZH ? '未建造' : 'Lv.0';
                    }
    
                    html += `<div class="${levelClass}">${levelText}</div>`;
                    html += '</div>';
                    html += '</div>';
                });
    
                html += '</div>'; // AbilitiesPanel_abilityGrid__-p-VF
                html += '</div>'; // house-panel
    
                return html;
            }
    
            function generateCharacterCard(data, characterName, characterNameElement = null, isMyCharacter = false, options = {}) {
                let characterObj = data.player || data;
                const equipmentPanel = generateEquipmentPanel(characterObj);
    
                // 创建标题栏内容
                let headerContent = '';
                if (characterNameElement) {
                    // 使用从页面复制的角色信息元素
                    headerContent = characterNameElement;
                } else {
                    // 后备方案：使用简单的角色名
                    headerContent = `<h2>${characterName}</h2>`;
                }
    
                // 根据当前布局模式添加相应的类名
                const currentLayoutMode = getEffectiveLayoutMode();
                const layoutClass = `layout-${currentLayoutMode}`;
    
                return `
                    <div id="character-card" class="character-card ${layoutClass}">
                        <div class="card-header">${headerContent}</div>
                        <div class="card-content">
                            ${equipmentPanel}
                            ${generateAbilityPanel(characterObj)}
                            ${generateSkillPanel(data, isMyCharacter, options)}
                            ${generateHousePanel(data)}
                        </div>
                    </div>
                `;
            }
    
            function createModalStyles() {
                const style = document.createElement('style');
                style.textContent = `
                    .character-card-modal {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(0, 0, 0, 0.8); z-index: 10000; display: flex;
                        justify-content: center; align-items: center; padding: 16px; box-sizing: border-box;
                    }
                    .modal-content {
                        background: white; border-radius: 15px; padding: 20px;
                        max-width: 90vw; max-height: 90vh; overflow: auto; position: relative;
                        transition: max-width 0.3s ease;
                    }
    
                    /* 当强制使用桌面布局时，扩大容器尺寸 */
                    .modal-content.desktop-layout {
                        max-width: 95vw;
                    }
    
                    /* 当强制使用桌面布局时，使用桌面端的完整尺寸 */
                    .modal-content.desktop-layout .character-card {
                        max-width: 1000px;
                        width: auto;
                    }
    
                    /* 当强制使用移动端布局时，使用移动端的紧凑尺寸 */
                    .modal-content.mobile-layout .character-card {
                        max-width: 500px;
                        width: auto;
                    }
                    .close-modal {
                        position: absolute; top: 10px; right: 15px; background: none;
                        border: none; font-size: 24px; cursor: pointer; color: #666; z-index: 1;
                    }
                    .close-modal:hover { color: #000; }
                    .character-card {
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                        border: 2px solid #4a90e2; border-radius: 15px; padding: 20px; color: white;
                        font-family: 'Arial', sans-serif; max-width: 800px; margin: 0 auto;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                    }
                    .card-header {
                        text-align: center; margin-bottom: 20px; border-bottom: 2px solid #4a90e2;
                        padding: 8px 10px 12px 10px; min-height: 45px; display: flex;
                        align-items: center; justify-content: center;
                    }
                    .card-header h2 {
                        margin: 0; color: #4a90e2; font-size: 24px; text-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
                    }
    
                    /* 角色信息元素在名片中的样式 */
                    .card-header .CharacterName_characterName__2FqyZ {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
    
                    .card-header .CharacterName_chatIcon__22lxV {
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
    
                    .card-header .CharacterName_name__1amXp {
                        font-size: 20px;
                        line-height: 1.3;
                        padding: 4px 0;
                        display: inline-block;
                        vertical-align: middle;
                        margin: 0;
                        transform: translateY(-2px);
                    }
    
                    /* 修复角色名内部span标签的高度问题 */
                    .card-header .CharacterName_name__1amXp span {
                        height: 24px;
                        line-height: 24px;
                        display: inline-block;
                        color: inherit;
                        text-shadow: inherit;
                        font-size: inherit;
                        font-weight: inherit;
                        vertical-align: middle;
                        overflow: visible;
                    }
    
                    .card-header .CharacterName_gameMode__2Pvw8 {
                        font-size: 14px;
                        opacity: 0.8;
                    }
                    .card-content {
                        display: grid; gap: 20px;
                    }
    
                    /* PC端布局 */
                    .character-card.layout-desktop .card-content {
                        grid-template-columns: 1fr 0.7fr;
                        grid-template-rows: auto 1fr;
                    }
    
                    /* 移动端布局 */
                    .character-card.layout-mobile .card-content {
                        grid-template-columns: 1fr;
                        grid-template-rows: auto auto auto auto;
                    }
                    .equipment-panel, .house-panel, .ability-panel, .skill-panel {
                        background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 6px;
                        border: 1px solid rgba(74, 144, 226, 0.3);
                    }
                    .panel-title {
                        margin: 0 0 15px 0; color: #4a90e2; font-size: 16px;
                        border-bottom: 1px solid rgba(74, 144, 226, 0.3); padding-bottom: 5px; text-align: center;
                    }
                    /* PC端面板位置 */
                    .character-card.layout-desktop .equipment-panel { grid-column: 1; grid-row: 1; }
                    .character-card.layout-desktop .ability-panel { grid-column: 2; grid-row: 1; }
                    .character-card.layout-desktop .house-panel { grid-column: 1; grid-row: 2; }
                    .character-card.layout-desktop .skill-panel { grid-column: 2; grid-row: 2; }
    
                    /* 移动端面板位置 */
                    .character-card.layout-mobile .equipment-panel { grid-column: 1; grid-row: 1; }
                    .character-card.layout-mobile .ability-panel { grid-column: 1; grid-row: 2; }
                    .character-card.layout-mobile .house-panel { grid-column: 1; grid-row: 3; }
                    .character-card.layout-mobile .skill-panel { grid-column: 1; grid-row: 4; }
    
                    /* 只为模态框内的装备面板添加网格布局，不影响游戏原生UI */
                    .character-card .EquipmentPanel_playerModel__3LRB6 {
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        grid-template-rows: repeat(4, auto);
                        gap: 8px;
                        padding: 10px;
                        max-width: 350px;
                        margin: 0 auto;
                    }
    
                    /* 确保装备槽的基本布局 */
                    .character-card .ItemSelector_itemSelector__2eTV6 {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
    
                    /* 技能面板样式 - 仅作用于角色名片内 */
                    .character-card .AbilitiesPanel_abilityGrid__-p-VF {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 8px;
                        padding: 10px;
                        max-height: 180px;
                        overflow-y: auto;
                    }
    
                    /* 技能项容器 */
                    .character-card .Ability_ability__1njrh {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 70px;
                        border-radius: 8px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(74, 144, 226, 0.3);
                        transition: all 0.2s ease;
                    }
    
                    .character-card .Ability_ability__1njrh.Ability_clickable__w9HcM:hover {
                        background: rgba(74, 144, 226, 0.1);
                        border-color: #4a90e2;
                        transform: scale(1.05);
                    }
    
                    /* 技能图标容器 */
                    .character-card .Ability_iconContainer__3syNQ {
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 4px;
                    }
    
                    /* 房屋等级图标容器 - 调整垂直居中 */
                    .character-card .house-panel .Ability_iconContainer__3syNQ {
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 4px;
                        transform: translateY(2px);
                    }
    
                    /* 技能等级文字 */
                    .character-card .Ability_level__1L-do {
                        font-size: 12px;
                        font-weight: bold;
                        color: #fff;
                        text-align: center;
                    }
    
                    /* 房屋最高等级特殊样式 */
                    .character-card .house-max-level {
                        color: #ff8c00 !important;
                        font-weight: bold;
                        text-shadow: 0 0 4px rgba(255, 140, 0, 0.5);
                    }
                    .ability-panel { grid-column: 2; grid-row: 1; }
                    .ability-list { flex: 1; }
                    .ability-row {
                        display: flex; align-items: center; margin-bottom: 8px; padding: 4px; border-radius: 4px;
                    }
                    .ability-icon {
                        width: 30px; height: 30px; margin-right: 10px; display: flex;
                        align-items: center; justify-content: center;
                    }
                    .house-panel {
                        grid-column: 1;
                        grid-row: 2;
                    }
    
    
                    .skill-panel {
                        grid-column: 2;
                        grid-row: 2;
                    }
                    .level { color: #fff; font-weight: bold; }
                    @media (max-width: 768px) {
                        /* 移动端模态框调整 */
                        .character-card-modal {
                            padding: 8px;
                        }
    
                        .modal-content {
                            max-width: 95vw;
                            max-height: 95vh;
                            padding: 12px;
                            overflow-y: auto;
                        }
    
                        /* 移动端布局覆盖 - 当在移动设备上且没有强制模式时 */
                        .character-card:not(.layout-desktop) .card-content {
                            grid-template-columns: 1fr !important;
                            grid-template-rows: auto auto auto auto !important;
                            gap: 12px;
                        }
    
                        .character-card:not(.layout-desktop) .equipment-panel { grid-column: 1 !important; grid-row: 1 !important; }
                        .character-card:not(.layout-desktop) .ability-panel { grid-column: 1 !important; grid-row: 2 !important; }
                        .character-card:not(.layout-desktop) .house-panel { grid-column: 1 !important; grid-row: 3 !important; }
                        .character-card:not(.layout-desktop) .skill-panel { grid-column: 1 !important; grid-row: 4 !important; }
    
                        /* 移动端面板样式调整 */
                        .equipment-panel, .house-panel, .ability-panel, .skill-panel {
                            padding: 10px;
                            margin-bottom: 4px;
                        }
    
                        /* 移动端装备面板调整 - 保持游戏原始布局 */
                        .character-card .EquipmentPanel_playerModel__3LRB6 {
                            gap: 6px;
                            padding: 8px;
                            max-width: 100%;
                        }
    
                        /* 移动端技能面板调整 - 每行4个 */
                        .character-card .ability-panel .AbilitiesPanel_abilityGrid__-p-VF {
                            grid-template-columns: repeat(4, 1fr);
                            gap: 10px;
                            padding: 12px;
                            max-height: 180px;
                        }
    
                        /* 移动端房屋面板调整 - 每行4个 */
                        .character-card .house-panel .AbilitiesPanel_abilityGrid__-p-VF {
                            grid-template-columns: repeat(4, 1fr);
                            gap: 8px;
                            padding: 10px;
                            max-height: 180px;
                        }
    
                        /* 移动端技能卡片间距调整 */
                        .character-card .ability-panel .Ability_ability__1njrh {
                            margin: 2px;
                            min-height: 75px;
                        }
    
                        /* 移动端房屋卡片间距调整 - 4列布局 */
                        .character-card .house-panel .Ability_ability__1njrh {
                            margin: 1px;
                            min-height: 65px;
                            font-size: 11px;
                        }
    
                        /* 移动端房屋等级图标容器 - 调整垂直居中 */
                        .character-card .house-panel .Ability_iconContainer__3syNQ {
                            transform: translateY(1px);
                        }
    
                        /* 移动端面板标题调整 */
                        .panel-title {
                            font-size: 14px;
                            margin-bottom: 8px;
                            padding-bottom: 4px;
                        }
    
                        /* 移动端字体调整 */
                        .character-card {
                            font-size: 12px;
                        }
    
                        /* 移动端指示横幅调整 */
                        .instruction-banner {
                            padding: 8px;
                            font-size: 14px;
                        }
                    }
    
                    .instruction-banner {
                        background: #17a2b8; color: white; padding: 10px; border-radius: 5px;
                        margin-bottom: 10px; font-weight: bold; text-align: center;
                    }
    
                    .download-section {
                        text-align: center; margin-bottom: 15px;
                    }
    
                    /* 统一按钮外观：下载 / 刷新 / 编辑 / 添加 */
                    .download-card-btn,
                    .download-team-card-btn,
                    .refresh-team-card-btn,
                    .edit-team-card-btn,
                    .add-team-card-btn {
                        background: #17a2b8;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
    
                    .download-card-btn:hover:not(:disabled),
                    .download-team-card-btn:hover:not(:disabled),
                    .refresh-team-card-btn:hover:not(:disabled),
                    .edit-team-card-btn:hover:not(:disabled),
                    .add-team-card-btn:hover:not(:disabled) {
                        background: #138496;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    }
    
                    .download-card-btn:disabled,
                    .download-team-card-btn:disabled,
                    .refresh-team-card-btn:disabled,
                    .edit-team-card-btn:disabled,
                    .add-team-card-btn:disabled {
                        background: #6c757d; cursor: not-allowed; transform: none;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
    
                    /* 保存（绿色） */
                    .save-team-card-btn {
                        background: #28a745;
                        color: #fff;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .save-team-card-btn:hover:not(:disabled) {
                        background: #218838;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    }
                    .save-team-card-btn:disabled {
                        background: #6c757d; cursor: not-allowed; transform: none;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
    
                    /* 取消（红色） */
                    .cancel-team-card-btn {
                        background: #dc3545;
                        color: #fff;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .cancel-team-card-btn:hover:not(:disabled) {
                        background: #c82333;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    }
                    .cancel-team-card-btn:disabled {
                        background: #6c757d; cursor: not-allowed; transform: none;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
    
                    /* 布局切换按钮样式 */
                    .layout-toggle-btn {
                        background: #17a2b8;
                        color: white;
                        border: none;
                        padding: 6px 10px;
                        border-radius: 4px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        font-weight: bold;
                    }
    
                    .layout-toggle-btn:hover {
                        background: #138496;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    }
    
                    .layout-toggle-btn:active {
                        transform: translateY(0);
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
    
                    /* 技能提示样式 */
                    .skill-hint {
                        margin-top: 8px;
                        text-align: center;
                    }
    
                    .skill-hint span {
                        font-size: 12px;
                        color: #17a2b8;
                        font-style: italic;
                        background: rgba(23, 162, 184, 0.1);
                        padding: 4px 8px;
                        border-radius: 4px;
                        border: 1px solid rgba(23, 162, 184, 0.3);
                    }
    
                    /* 按钮行样式 */
                    .button-row {
                        display: flex;
                        gap: 8px;
                        justify-content: center;
                        align-items: center;
                        margin-bottom: 8px;
                    }
    
                    .save-skill-config-btn,
                    .load-skill-config-btn {
                        background: #17a2b8;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
    
                    .save-skill-config-btn:hover,
                    .load-skill-config-btn:hover {
                        background: #138496;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    }
    
    
    
                    /* 仅为角色名片内的SVG图标添加优化，不影响游戏原生UI */
                    .character-card .Icon_icon__2LtL_ {
                        width: 100%;
                        height: 100%;
                        filter: drop-shadow(0 0 2px rgba(0,0,0,0.3));
                        image-rendering: -webkit-optimize-contrast;
                        image-rendering: -moz-crisp-edges;
                        image-rendering: pixelated;
                    }
    
                    /* 空白技能槽样式 */
                    .character-card .empty-skill-slot {
                        cursor: pointer;
                        border: 1px dashed rgba(74, 144, 226, 0.3);
                        background: transparent;
                        min-height: 70px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
    
                    .character-card .empty-skill-slot:hover {
                        border: 1px dashed #4a90e2;
                        background: rgba(74, 144, 226, 0.1);
                    }
    
                    /* 技能选择器模态框样式 */
                    .skill-selector-modal {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.8);
                        z-index: 20000;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 16px;
                        box-sizing: border-box;
                    }
    
                    .skill-selector-content {
                        background: #1a1a2e;
                        border-radius: 15px;
                        padding: 20px;
                        max-width: 80vw;
                        max-height: 80vh;
                        overflow: auto;
                        position: relative;
                        min-width: 400px;
                        border: 2px solid #4a90e2;
                    }
    
                    .skill-selector-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        border-bottom: 1px solid #4a90e2;
                        padding-bottom: 10px;
                    }
    
                    .skill-selector-header h3 {
                        margin: 0;
                        color: #fff;
                        font-size: 18px;
                    }
    
                    .close-skill-selector {
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #ccc;
                        padding: 0;
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
    
                    .close-skill-selector:hover {
                        color: #fff;
                    }
    
                    .skill-selector-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 12px;
                        max-height: 400px;
                        overflow-y: auto;
                    }
    
                    .skill-option {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding: 8px;
                        border: 1px solid #4a90e2;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        background: rgba(255, 255, 255, 0.05);
                    }
    
                    .skill-option:hover {
                        border-color: #4a90e2;
                        background: rgba(74, 144, 226, 0.2);
                        transform: scale(1.05);
                    }
    
                    .skill-option-icon {
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 4px;
                    }
    
                    .skill-option-level {
                        font-size: 11px;
                        font-weight: bold;
                        color: #fff;
                        text-align: center;
                    }
    
                    /* 空技能选项样式 */
                    .skill-option.empty-skill-option {
                        border: 1px dashed #4a90e2;
                        background: rgba(255, 255, 255, 0.02);
                    }
    
                    .skill-option.empty-skill-option:hover {
                        border-color: #4a90e2;
                        background: rgba(74, 144, 226, 0.1);
                    }
    
                    .empty-skill-icon {
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 1px dashed #4a90e2;
                        border-radius: 4px;
                        color: #4a90e2;
                        font-size: 16px;
                        font-weight: bold;
                    }
    
    
    
                    /* 移动端技能选择器调整 */
                    @media (max-width: 768px) {
                        .skill-selector-content {
                            max-width: 95vw;
                            min-width: 300px;
                            padding: 15px;
                        }
    
                        .skill-selector-grid {
                            grid-template-columns: repeat(4, 1fr);
                            gap: 8px;
                        }
    
                        .skill-option {
                            padding: 6px;
                        }
    
                        .skill-option-icon {
                            width: 32px;
                            height: 32px;
                        }
    
                        .skill-option-level {
                            font-size: 10px;
                        }
    
                        .empty-skill-icon {
                            width: 32px;
                            height: 32px;
                            font-size: 14px;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
    
            // 队伍名片样式（单独注入，避免干扰已有样式）
            function createTeamStyles() {
                const style = document.createElement('style');
                style.textContent = `
                    .team-card-modal .modal-content { max-width: 98vw; }
                    .team-name { text-align: center; color: #4a90e2; font-weight: bold; margin: 6px 0 12px 0; }
                    .team-cards-container {
                        display: flex;
                        gap: 6px;
                        flex-wrap: nowrap;
                        align-items: flex-start;
                        overflow-x: auto;
                        padding-bottom: 8px;
                        justify-content: center;
                        min-height: 200px;
                    }
                    /* 当内容宽度超过容器时，切换到靠左显示以便滚动 */
                    .team-cards-container.overflow-mode {
                        justify-content: flex-start;
                    }
                    .team-card-wrap { width: 320px; position: relative; }
                    .team-card-wrap .character-card { position: absolute; top: 0; left: 0; transform: scale(0.8); transform-origin: top left; width: 390px; }
                    .team-mode .card-header { margin-bottom: 12px; }
                    .team-mode .panel-title { font-size: 14px; margin-bottom: 10px; }
                    .team-mode .character-card .EquipmentPanel_playerModel__3LRB6 { gap: 6px; padding: 8px; }
                    .team-hint { text-align: center; color: #4a90e2; font-size: 12px; margin: -4px 0 10px 0; opacity: 0.9; }
                    /* 轻量全局提示条 */
                    .toast-notice {
                        position: fixed;
                        top: 16px;
                        right: 16px;
                        padding: 8px 12px;
                        border-radius: 4px;
                        color: #fff;
                        font-size: 12px;
                        z-index: 20001;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        opacity: 0;
                        transform: translateY(-6px);
                        transition: opacity 0.2s ease, transform 0.2s ease;
                    }
                    .toast-notice.show { opacity: 1; transform: translateY(0); }
                    .toast-success { background: #344386; }
                    .toast-error { background: #4f171f; }
                    .toast-info { background: #344386; }
                    /* 空队伍提示样式 */
                    .empty-team-placeholder {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 200px;
                        border: 2px dashed #4a90e2;
                        border-radius: 15px;
                        background: rgba(74, 144, 226, 0.1);
                        color: #4a90e2;
                        text-align: center;
                        padding: 20px;
                        margin: 10px 0;
                    }
                    .empty-team-placeholder .empty-icon {
                        font-size: 48px;
                        margin-bottom: 15px;
                        opacity: 0.7;
                    }
                    .empty-team-placeholder .empty-title {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    .empty-team-placeholder .empty-subtitle {
                        font-size: 14px;
                        opacity: 0.8;
                    }
                `;
                document.head.appendChild(style);
            }
    
            function adjustTeamCardWrapHeights() {
                try {
                    const scale = 0.8;
                    const wraps = document.querySelectorAll('.team-card-wrap');
                    wraps.forEach(w => {
                        const card = w.querySelector('.character-card');
                        if (!card) return;
                        const unscaledHeight = card.offsetHeight; // layout height
                        const scaledHeight = Math.round(unscaledHeight * scale);
                        w.style.height = scaledHeight + 'px';
                    });
                } catch (e) { /* ignore */ }
            }
    
            // 动态调整队伍名片容器的居中显示
            function adjustTeamCardsLayout() {
                try {
                    const container = document.querySelector('.team-cards-container');
                    if (!container) return;
    
                    // 等待一个微任务，确保DOM更新完成
                    setTimeout(() => {
                        const containerWidth = container.clientWidth;
                        const scrollWidth = container.scrollWidth;
    
                        // 如果内容宽度超过容器宽度，切换到靠左显示以便滚动
                        if (scrollWidth > containerWidth) {
                            container.classList.add('overflow-mode');
                        } else {
                            container.classList.remove('overflow-mode');
                        }
                    }, 10);
                } catch (e) { /* ignore */ }
            }
    
            // 轻量提示条
            function showToastNotice(text, variant = 'success', durationMs = 1800) {
                try {
                    const div = document.createElement('div');
                    div.className = `toast-notice toast-${variant}`;
                    div.textContent = text;
                    document.body.appendChild(div);
                    // 触发过渡
                    requestAnimationFrame(() => div.classList.add('show'));
                    setTimeout(() => {
                        try {
                            div.classList.remove('show');
                            setTimeout(() => document.body.removeChild(div), 250);
                        } catch (e) {}
                    }, durationMs);
                } catch (e) {}
            }
    
            // 转换 WS 的 init_character_data 为名片数据
            function transformInitCharacterDataToCardData(parsedData) {
                return {
                    player: {
                        name: parsedData.character?.name || parsedData.characterName || parsedData.name || (isZH ? '角色' : 'Character'),
                        equipment: parsedData.characterItems || [],
                        characterItems: parsedData.characterItems || [],
                        staminaLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/stamina'))?.level || 0,
                        intelligenceLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/intelligence'))?.level || 0,
                        attackLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/attack'))?.level || 0,
                        meleeLevel: getMeleeLevel(parsedData.characterSkills),
                        defenseLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/defense'))?.level || 0,
                        rangedLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/ranged'))?.level || 0,
                        magicLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/magic'))?.level || 0
                    },
                    abilities: parsedData.characterAbilities || [],
                    characterSkills: parsedData.characterSkills || [],
                    houseRooms: parsedData.characterHouseRoomMap || {},
                    characterHouseRoomMap: parsedData.characterHouseRoomMap || {}
                };
            }
    
            // 将 profile_shared 存档对象转换为名片数据
            function transformProfileSharedToCardData(profileStoredObj) {
                try {
                    const profile = profileStoredObj.profile;
                    const characterName = profileStoredObj.characterName || profile?.sharableCharacter?.name || (isZH ? '角色' : 'Character');
                    const wearableMap = profile?.wearableItemMap || {};
                    const equipment = Object.values(wearableMap || {}).map(item => ({
                        itemLocationHrid: item.itemLocationHrid,
                        itemHrid: item.itemHrid,
                        enhancementLevel: item.enhancementLevel || 0
                    }));
                    const characterSkills = (profile?.characterSkills || []).map(s => ({
                        skillHrid: s.skillHrid,
                        level: s.level
                    }));
                    const levels = {
                        staminaLevel: characterSkills.find(s => s.skillHrid.includes('/skills/stamina'))?.level || 0,
                        intelligenceLevel: characterSkills.find(s => s.skillHrid.includes('/skills/intelligence'))?.level || 0,
                        attackLevel: characterSkills.find(s => s.skillHrid.includes('/skills/attack'))?.level || 0,
                        meleeLevel: getMeleeLevel(characterSkills),
                        defenseLevel: characterSkills.find(s => s.skillHrid.includes('/skills/defense'))?.level || 0,
                        rangedLevel: characterSkills.find(s => s.skillHrid.includes('/skills/ranged'))?.level || 0,
                        magicLevel: characterSkills.find(s => s.skillHrid.includes('/skills/magic'))?.level || 0
                    };
                    const abilities = (profile?.equippedAbilities || []).map(a => ({ abilityHrid: a?.abilityHrid || '', level: a?.level || 1 }));
                    const houseMapRaw = profile?.characterHouseRoomMap || {};
                    const houseRooms = {};
                    try { Object.values(houseMapRaw).forEach(h => { if (h?.houseRoomHrid) houseRooms[h.houseRoomHrid] = h.level || 0; }); } catch {}
                    return {
                        player: { name: characterName, equipment, characterItems: equipment, ...levels },
                        abilities,
                        characterSkills,
                        houseRooms,
                        characterHouseRoomMap: houseMapRaw
                    };
                } catch (e) {
                    console.warn('transformProfileSharedToCardData 失败:', e);
                    return null;
                }
            }
    
            function getTeamNameFromPage() {
                const nameEl = document.querySelector('.Party_partyName__3XL5z');
                return nameEl ? nameEl.textContent.trim() : (isZH ? '队伍' : 'Party');
            }
    
            // 构建队伍成员名片数据列表
            function buildPartyCharacterDataList() {
                const list = [];
                const wsData = window.characterCardWebSocketData;
                if (!wsData || !wsData.partyInfo) {
                    console.log('[队伍名片] 未检测到 partyInfo，无法构建队伍数据');
                    return list;
                }
                const myId = wsData?.character?.id;
                const slotMap = wsData.partyInfo.partySlotMap || {};
                const storedProfilesStr = localStorage.getItem('profile_export_list');
                let storedProfiles = [];
                try { storedProfiles = storedProfilesStr ? JSON.parse(storedProfilesStr) : []; } catch {}
    
                console.log('[队伍名片] 检测到队伍成员槽位:', Object.keys(slotMap).length);
                let idx = 0;
                for (const member of Object.values(slotMap)) {
                    if (!member?.characterID) continue;
                    idx++;
                    if (member.characterID === myId) {
                        const selfName = wsData?.character?.name || wsData.characterName || (isZH ? '角色' : 'Character');
                        console.log(`[队伍名片] 成员${idx}: 自己 (${selfName}) 使用WS数据`);
                        list.push({ name: selfName, data: transformInitCharacterDataToCardData(wsData), isSelf: true });
                    } else {
                        const match = storedProfiles.find(p => p.characterID === member.characterID);
                        if (match) {
                            const cardData = transformProfileSharedToCardData(match);
                            if (cardData) {
                                console.log(`[队伍名片] 成员${idx}: ${match.characterName} 使用profile_shared存档`);
                                list.push({ name: match.characterName, data: cardData, isSelf: false });
                            } else {
                                console.log(`[队伍名片] 成员${idx}: ${member.characterID} 转换失败`);
                            }
                        } else {
                            console.log(`[队伍名片] 成员${idx}: ${member.characterID} 未找到profile_shared记录（请先在游戏中打开其资料页）`);
                            list.push({ name: isZH ? '未知成员' : 'Unknown Member', data: { player: { name: isZH ? '未知' : 'Unknown', equipment: [] }, abilities: [], characterSkills: [], houseRooms: {}, characterHouseRoomMap: {} }, isSelf: false });
                        }
                    }
                }
                return list;
            }
    
            // 本地存储键
            const TEAM_CARD_STORAGE_KEY = 'mwi_team_card_cache_v1';
    
            function saveTeamCardToStorage(teamName, members) {
                try {
                    const data = { teamName, members };
                    localStorage.setItem(TEAM_CARD_STORAGE_KEY, JSON.stringify(data));
                    console.log('[队伍名片] 已保存队伍名片数据');
                } catch (e) { console.warn('保存队伍名片失败', e); }
            }
    
            function loadTeamCardFromStorage() {
                try {
                    const str = localStorage.getItem(TEAM_CARD_STORAGE_KEY);
                    if (!str) return null;
                    const obj = JSON.parse(str);
                    if (!obj || !Array.isArray(obj.members)) return null;
                    return obj;
                } catch (e) { return null; }
            }
    
            // 下载队伍名片
            async function downloadTeamCharacterCard() {
                try {
                    const wrapper = document.getElementById('team-character-card');
                    if (!wrapper) { alert(isZH ? '未找到队伍名片元素' : 'Team card element not found'); return; }
                    const btn = document.querySelector('.download-team-card-btn');
                    const originalText = btn ? btn.textContent : '';
                    if (btn) { btn.textContent = isZH ? '生成中...' : 'Generating...'; btn.disabled = true; }
    
                    // 保持与预览一致的结构，直接克隆容器
                    const cloned = wrapper.cloneNode(true);
                    const renderRoot = cloned;
                    state.svgTool.refreshSpritePathsFromDOM();
                    const spriteContents = {};
                    const spriteUrls = Object.values(state.svgTool.spriteSheets);
                    const needsChatSprite = renderRoot.querySelector('svg use[href*="chat_icons_sprite"]');
                    if (needsChatSprite) {
                        const chatSpritePath = state.svgTool.getChatIconsSpritePath();
                        spriteUrls.push(chatSpritePath);
                    }
                    for (const url of spriteUrls) { const content = await loadSpriteContent(url); if (content) spriteContents[url] = content; }
                    const useElements = renderRoot.querySelectorAll('svg use');
                    useElements.forEach(useElement => {
                        try {
                            const href = useElement.getAttribute('href');
                            const svg = useElement.closest('svg');
                            if (!href || !href.includes('#') || !svg) return;
                            const [spriteUrl, symbolId] = href.split('#');
                            const spriteContent = spriteContents[spriteUrl];
                            if (!spriteContent || !symbolId) return;
                            const symbol = spriteContent.querySelector(`#${symbolId}`);
                            if (!symbol) return;
                            const symbolClone = symbol.cloneNode(true);
                            svg.innerHTML = '';
                            svg.setAttribute('fill', 'none');
                            const viewBox = symbol.getAttribute('viewBox');
                            if (viewBox) svg.setAttribute('viewBox', viewBox);
                            while (symbolClone.firstChild) svg.appendChild(symbolClone.firstChild);
                        } catch (e) {}
                    });
    
                    const temp = document.createElement('div');
                    temp.style.position = 'absolute'; temp.style.left = '-9999px'; temp.style.top = '-9999px';
                    temp.appendChild(renderRoot); document.body.appendChild(temp);
                    const canvas = await html2canvas(renderRoot, { backgroundColor: '#1a1a2e', scale: 2, useCORS: true, logging: false });
                    document.body.removeChild(temp);
                    const a = document.createElement('a');
                    a.download = `MWI_Party_Card_${Date.now()}.png`; a.href = canvas.toDataURL('image/png', 1.0);
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    if (btn) { btn.textContent = originalText; btn.disabled = false; }
                    console.log('队伍名片图片已生成并下载');
                } catch (e) {
                    console.error('下载队伍名片失败:', e);
                    alert(isZH ? '下载队伍名片失败' : 'Failed to download team card');
                    const btn = document.querySelector('.download-team-card-btn');
                    if (btn) { btn.textContent = isZH ? '下载队伍名片' : 'Download Team Card'; btn.disabled = false; }
                }
            }
    
            // 展示队伍名片
            function showPartyCharacterCard(options = {}) {
                try {
                    const { forceState = false, openEditMode = false } = options;
                    let teamName = getTeamNameFromPage();
                    console.log(`[队伍名片] 队伍名称: ${teamName}`);
                    let members;
                    if (forceState && state.teamCard.members !== undefined) {
                        // 强制使用内存状态，包括空数组
                        members = state.teamCard.members;
                        teamName = state.teamCard.teamName || teamName;
                    } else {
                        const cached = loadTeamCardFromStorage();
                        if (cached && cached.members !== undefined) {
                            teamName = cached.teamName || teamName;
                            members = cached.members;
                            console.log('[队伍名片] 已从缓存加载队伍数据');
                        } else if (state.teamCard.members !== undefined) {
                            members = state.teamCard.members;
                            teamName = state.teamCard.teamName || teamName;
                        } else {
                            // 最后兜底：如果没有缓存也没有内存状态，才从当前队伍构建
                            members = buildPartyCharacterDataList();
                        }
                    }
                    // 移除原来的空队伍检查，允许显示空队伍
                    state.teamCard.members = members || [];
                    state.teamCard.teamName = teamName;
    
                    let cardsHTML;
                    if (!members || members.length === 0) {
                        // 显示空队伍提示
                        cardsHTML = `
                            <div class="empty-team-placeholder">
                                <div class="empty-icon">👥</div>
                                <div class="empty-title">${isZH ? '当前队伍为空' : 'Current team is empty'}</div>
                                <div class="empty-subtitle">${isZH ? '点击"添加角色"按钮进行添加' : 'Click "Add Member" button to add characters'}</div>
                            </div>
                        `;
                    } else {
                        cardsHTML = members.map((m, idx) => {
                            const name = m.name || (isZH ? '角色' : 'Character');
                            const cardHtml = generateCharacterCard(m.data, name, null, false, { teamMode: true });
                            // 强制纵向布局：将 desktop 替换为 mobile，并缩放以适配队伍并排
                            const forcedMobile = cardHtml.replace('layout-desktop', 'layout-mobile');
                            return `<div class="team-card-wrap" data-index="${idx}"><div class="team-mode">${forcedMobile}</div></div>`;
                        }).join('');
                    }
                    const modal = document.createElement('div');
                    modal.className = 'character-card-modal team-card-modal';
                    modal.innerHTML = `
                        <div class="modal-content">
                            <button class="close-modal">&times;</button>
                            <div class="instruction-banner">${isZH ? `MWI队伍名片 (该功能目前不支持移动端)` : `MWI Party Cards (This feature is not supported on mobile devices)`}</div>
                            <div class="team-hint">${isZH ? '请先查看队友资料并刷新页面，才能正常使用队伍名片' : 'Please open teammates\' profiles in-game and refresh the page before using Party Cards.'}</div>
                            <div class="download-section">
                                <div class="button-row">
                                    <button class="refresh-team-card-btn">${isZH ? '重新获取数据' : 'Refresh Data'}</button>
                                    <button class="download-team-card-btn">${isZH ? '下载队伍名片' : 'Download Team Card'}</button>
                                    <button class="edit-team-card-btn">${isZH ? '编辑名片' : 'Edit Cards'}</button>
                                </div>
                            </div>
                            <div class="team-name">${teamName}</div>
                            <div id="team-character-card" class="team-cards-container">${cardsHTML}</div>
                        </div>`;
                    modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
                    modal.querySelector('.download-team-card-btn').onclick = async () => {
                        try {
                            const refreshBtn = modal.querySelector('.refresh-team-card-btn');
                            const editBtn = modal.querySelector('.edit-team-card-btn');
                            if (refreshBtn) refreshBtn.disabled = true;
                            if (editBtn) editBtn.disabled = true;
                            await downloadTeamCharacterCard();
                        } finally {
                            const refreshBtn = modal.querySelector('.refresh-team-card-btn');
                            const editBtn = modal.querySelector('.edit-team-card-btn');
                            if (refreshBtn) refreshBtn.disabled = false;
                            if (editBtn) editBtn.disabled = false;
                        }
                    };
                    modal.querySelector('.refresh-team-card-btn').onclick = () => {
                        const newMembers = buildPartyCharacterDataList();
                        if (newMembers && newMembers.length) {
                            state.teamCard.members = newMembers;
                            state.teamCard.teamName = getTeamNameFromPage();
                            saveTeamCardToStorage(state.teamCard.teamName, newMembers);
                            try { document.body.removeChild(modal); } catch(err) {}
                            showPartyCharacterCard({ forceState: true });
                            showToastNotice(isZH ? '已重新获取队伍数据' : 'Party data refreshed', 'info');
                        } else {
                            showToastNotice(isZH ? '未获取到任何队伍数据' : 'No party data fetched', 'error');
                        }
                    };
                    modal.querySelector('.edit-team-card-btn').onclick = () => enterTeamEditMode(modal);
                    modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
                    // 监听尺寸变化，动态更新高度和布局，避免窗口尺寸变化导致空白
                    let resizeTimer;
                    const onResize = () => {
                        clearTimeout(resizeTimer);
                        resizeTimer = setTimeout(() => {
                            adjustTeamCardWrapHeights();
                            adjustTeamCardsLayout();
                        }, 50);
                    };
                    window.addEventListener('resize', onResize);
                    // 关闭时移除监听
                    const removeModal = () => {
                        try { window.removeEventListener('resize', onResize); } catch(e) {}
                        try { document.body.removeChild(modal); } catch(e) {}
                    };
                    modal.querySelector('.close-modal').onclick = removeModal;
                    modal.onclick = (e) => { if (e.target === modal) removeModal(); };
                    document.body.appendChild(modal);
                    // 修正队伍卡包裹高度，去掉预览底部空白
                    adjustTeamCardWrapHeights();
                    // 动态调整队伍名片的居中显示
                    adjustTeamCardsLayout();
                    if (openEditMode) {
                        enterTeamEditMode(modal);
                    }
                } catch (e) {
                    console.error('生成队伍名片失败:', e);
                    alert(isZH ? '生成队伍名片失败' : 'Failed to show party card');
                }
            }
    
            async function readClipboardData() {
                try {
                    const text = await navigator.clipboard.readText();
                    return text;
                } catch (error) {
                    console.log('无法读取剪贴板:', error);
                    return null;
                }
            }
    
            function isValidCharacterData(data) {
                if (!data || typeof data !== 'object') return false;
    
                // 检查新格式 (player对象)
                if (data.player && (
                    data.player.equipment ||
                    data.player.characterItems ||
                    data.player.staminaLevel !== undefined ||
                    data.player.name
                )) {
                    return true;
                }
    
                // 检查旧格式
                if (data.character && (data.characterSkills || data.characterItems)) {
                    return true;
                }
    
                // 检查是否直接包含关键字段
                if (data.equipment || data.characterItems || data.characterSkills) {
                    return true;
                }
    
                // 检查是否包含技能等级字段
                if (data.staminaLevel !== undefined || data.intelligenceLevel !== undefined ||
                    data.attackLevel !== undefined || data.meleeLevel !== undefined || data.powerLevel !== undefined) {
                    return true;
                }
    
                // 检查是否包含房屋数据
                if (data.houseRooms || data.characterHouseRoomMap) {
                    return true;
                }
    
                // 检查是否包含能力数据
                if (data.abilities && Array.isArray(data.abilities)) {
                    return true;
                }
    
                return false;
            }
    
            // 获取SVG sprite内容
            async function loadSpriteContent(spriteUrl) {
                try {
                    const response = await fetch(spriteUrl);
                    const svgText = await response.text();
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    return svgDoc.documentElement;
                } catch (error) {
                    console.warn('无法加载sprite:', spriteUrl, error);
                    return null;
                }
            }
    
            // 下载名片功能
            async function downloadCharacterCard() {
                try {
                    // 获取名片元素
                    const cardElement = document.getElementById('character-card');
                    if (!cardElement) {
                        alert(isZH ? '未找到名片元素' : 'Character card element not found');
                        return;
                    }
    
                    // 显示下载提示
                    const downloadBtn = document.querySelector('.download-card-btn');
                    const originalText = downloadBtn.textContent;
                    downloadBtn.textContent = isZH ? '生成中...' : 'Generating...';
                    downloadBtn.disabled = true;
    
                    // 克隆名片元素用于处理
                    const clonedCard = cardElement.cloneNode(true);
    
                    // 确保克隆的元素有正确的布局类名
                    const currentLayoutMode = getEffectiveLayoutMode();
                    clonedCard.className = clonedCard.className.replace(/layout-(mobile|desktop)/g, '');
                    clonedCard.classList.add(`layout-${currentLayoutMode}`);
    
                    // 如果是场景2（我的角色名片），重新生成技能面板以保持自定义技能状态
                    const isMyCharacterCard = cardElement.querySelector('.skill-panel .empty-skill-slot') !== null;
                    if (isMyCharacterCard && state.customSkills.selectedSkills.length > 0) {
                        const skillPanel = clonedCard.querySelector('.skill-panel');
                        if (skillPanel) {
                            const characterData = {
                                abilities: window.characterCardWebSocketData?.characterAbilities || [],
                                characterSkills: window.characterCardWebSocketData?.characterSkills || []
                            };
                            const newSkillPanel = generateSkillPanel(characterData, true);
                            skillPanel.innerHTML = newSkillPanel.replace(/<div class="skill-panel">([\s\S]*?)<\/div>$/, '$1');
                        }
                    }
    
                    // 下载前从DOM刷新所有sprite路径，确保使用最新hash
                    state.svgTool.refreshSpritePathsFromDOM();
                    const spriteContents = {};
                    const spriteUrls = Object.values(state.svgTool.spriteSheets);
    
                    // 检查是否需要加载聊天图标sprite
                    const needsChatSprite = clonedCard.querySelector('svg use[href*="chat_icons_sprite"]');
                    if (needsChatSprite) {
                        const chatSpritePath = state.svgTool.getChatIconsSpritePath();
                        spriteUrls.push(chatSpritePath);
                    }
    
                    for (const url of spriteUrls) {
                        const content = await loadSpriteContent(url);
                        if (content) {
                            spriteContents[url] = content;
                        }
                    }
    
    
    
                    // 替换所有使用<use>的SVG为实际内容
                    const useElements = clonedCard.querySelectorAll('svg use');
    
                    useElements.forEach((useElement, index) => {
                        try {
                            const href = useElement.getAttribute('href');
                            const svg = useElement.closest('svg');
    
                            if (href && href.includes('#')) {
                                const [spriteUrl, symbolId] = href.split('#');
                                const spriteContent = spriteContents[spriteUrl];
    
                                if (spriteContent && symbolId) {
                                    const symbol = spriteContent.querySelector(`#${symbolId}`);
                                    if (symbol) {
                                        // 创建新的SVG内容
                                        const svg = useElement.closest('svg');
                                        if (svg) {
                                            const symbolClone = symbol.cloneNode(true);
    
                                            // 清空原SVG内容并添加symbol内容
                                            svg.innerHTML = '';
    
                                            // 添加fill="none"属性解决填充问题
                                            svg.setAttribute('fill', 'none');
    
                                            // 如果symbol有viewBox，应用到svg
                                            const viewBox = symbol.getAttribute('viewBox');
                                            if (viewBox) {
                                                svg.setAttribute('viewBox', viewBox);
                                            }
    
                                            // 复制symbol的所有子元素到svg
                                            while (symbolClone.firstChild) {
                                                svg.appendChild(symbolClone.firstChild);
                                            }
                                        }
                                    } else {
                                        // 如果找不到symbol，创建文字替代
                                        const svg = useElement.closest('svg');
                                        if (svg) {
                                            svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="10">${symbolId.substring(0, 3)}</text>`;
                                        }
                                    }
                                } else {
                                    // 如果找不到spriteContent，创建简单替代
                                    const svg = useElement.closest('svg');
                                    if (svg && symbolId) {
                                        const shortText = symbolId.length > 2 ? symbolId.substring(0, 2) : symbolId;
                                        svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="8">${shortText}</text>`;
                                    }
                                }
                            }
                        } catch (error) {
                            console.warn('处理SVG元素时出错:', error);
                        }
                    });
    
                    // 处理角色名样式 - 确保文字完整显示
                    const characterNameDiv = clonedCard.querySelector('.CharacterName_name__1amXp');
                    if (characterNameDiv) {
                        characterNameDiv.className = ''; // 清除所有class，使角色名显示为白色
                        // 应用内联样式确保文字完整显示
                        characterNameDiv.style.cssText = `
                            color: white !important;
                            font-size: 20px !important;
                            font-weight: bold !important;
                            line-height: 1.3 !important;
                            padding: 4px 0 !important;
                            display: inline-block !important;
                            vertical-align: middle !important;
                            margin: 0 !important;
                            transform: translateY(-2px) !important;
                            text-shadow: 0 0 10px rgba(74, 144, 226, 0.5) !important;
                        `;
    
                        // 修复内部span标签的高度问题
                        const characterNameSpan = characterNameDiv.querySelector('span');
                        if (characterNameSpan) {
                            characterNameSpan.style.cssText = `
                                height: 24px !important;
                                line-height: 24px !important;
                                display: inline-block !important;
                                color: inherit !important;
                                text-shadow: inherit !important;
                                font-size: inherit !important;
                                font-weight: inherit !important;
                                vertical-align: middle !important;
                                overflow: visible !important;
                            `;
                        }
                    }
    
                    // 检测是否为移动端设备 - 考虑用户的强制布局设置
                    const finalLayoutMode = getEffectiveLayoutMode();
                    const isMobileDevice = finalLayoutMode === 'mobile';
    
                    // 内联关键样式（避免linear-gradient问题）
                    const styleElement = document.createElement('style');
    
                    // 根据有效布局模式选择不同的样式
                    if (isMobileDevice) {
                        // 移动端样式 - 单列布局
                        styleElement.textContent = `
                            .character-card {
                                background: #1a1a2e !important;
                                border: 2px solid #4a90e2 !important;
                                border-radius: 15px !important;
                                padding: 15px !important;
                                color: white !important;
                                font-family: Arial, sans-serif !important;
                                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
                                max-width: 100% !important;
                                width: 350px !important;
                            }
                            .card-header {
                                text-align: center !important;
                                margin-bottom: 15px !important;
                                border-bottom: 2px solid #4a90e2 !important;
                                padding: 8px 10px 12px 10px !important;
                                min-height: 40px !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                            }
                            .card-content {
                                display: grid !important;
                                grid-template-columns: 1fr !important;
                                grid-template-rows: auto auto auto auto !important;
                                gap: 15px !important;
                            }
                            .equipment-panel { grid-column: 1 !important; grid-row: 1 !important; }
                            .ability-panel { grid-column: 1 !important; grid-row: 2 !important; }
                            .house-panel { grid-column: 1 !important; grid-row: 3 !important; }
                            .skill-panel { grid-column: 1 !important; grid-row: 4 !important; }
                            .equipment-panel, .house-panel, .ability-panel, .skill-panel {
                                background: rgba(255, 255, 255, 0.1) !important;
                                border-radius: 10px !important;
                                padding: 10px !important;
                                margin-bottom: 4px !important;
                                border: 1px solid rgba(74, 144, 226, 0.3) !important;
                            }
                            .panel-title {
                                margin: 0 0 10px 0 !important;
                                color: #4a90e2 !important;
                                font-size: 14px !important;
                                border-bottom: 1px solid rgba(74, 144, 226, 0.3) !important;
                                padding-bottom: 4px !important;
                                text-align: center !important;
                            }
                            .EquipmentPanel_playerModel__3LRB6 {
                                display: grid !important;
                                grid-template-columns: repeat(5, 1fr) !important;
                                grid-template-rows: repeat(4, auto) !important;
                                gap: 6px !important;
                                padding: 8px !important;
                                max-width: 100% !important;
                                margin: 0 auto !important;
                            }
                            /* 技能面板 - 每行4个 */
                            .ability-panel .AbilitiesPanel_abilityGrid__-p-VF {
                                display: grid !important;
                                grid-template-columns: repeat(4, 1fr) !important;
                                gap: 10px !important;
                                padding: 12px !important;
                                max-height: 180px !important;
                                overflow-y: auto !important;
                            }
    
                            /* 房屋面板 - 每行4个 */
                            .house-panel .AbilitiesPanel_abilityGrid__-p-VF {
                                display: grid !important;
                                grid-template-columns: repeat(4, 1fr) !important;
                                gap: 8px !important;
                                padding: 10px !important;
                                max-height: 180px !important;
                                overflow-y: auto !important;
                            }
                            /* 技能卡片样式 */
                            .ability-panel .Ability_ability__1njrh {
                                margin: 2px !important;
                                min-height: 75px !important;
                            }
    
                            /* 房屋卡片样式 - 4列布局 */
                            .house-panel .Ability_ability__1njrh {
                                margin: 1px !important;
                                min-height: 65px !important;
                                font-size: 11px !important;
                            }
                            .level { color: #fff !important; font-weight: bold !important; font-size: 12px !important; }
                            svg { width: 100% !important; height: 100% !important; }
                        `;
                    } else {
                        // 桌面端样式 - 双列布局
                        styleElement.textContent = `
                            .character-card {
                                background: #1a1a2e !important;
                                border: 2px solid #4a90e2 !important;
                                border-radius: 15px !important;
                                padding: 20px !important;
                                color: white !important;
                                font-family: Arial, sans-serif !important;
                                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
                                min-width: 700px !important;
                                width: auto !important;
                            }
                            .card-header {
                                text-align: center !important;
                                margin-bottom: 20px !important;
                                border-bottom: 2px solid #4a90e2 !important;
                                padding: 8px 10px 12px 10px !important;
                                min-height: 45px !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                            }
                            .card-content {
                                display: grid !important;
                                grid-template-columns: 1fr 0.7fr !important;
                                grid-template-rows: auto 1fr !important;
                                gap: 20px !important;
                            }
                            .equipment-panel { grid-column: 1 !important; grid-row: 1 !important; }
                            .ability-panel { grid-column: 2 !important; grid-row: 1 !important; }
                            .house-panel { grid-column: 1 !important; grid-row: 2 !important; }
                            .skill-panel { grid-column: 2 !important; grid-row: 2 !important; }
                            .equipment-panel, .house-panel, .ability-panel, .skill-panel {
                                background: rgba(255, 255, 255, 0.1) !important;
                                border-radius: 10px !important;
                                padding: 15px !important;
                                border: 1px solid rgba(74, 144, 226, 0.3) !important;
                            }
                            .panel-title {
                                margin: 0 0 15px 0 !important;
                                color: #4a90e2 !important;
                                font-size: 16px !important;
                                border-bottom: 1px solid rgba(74, 144, 226, 0.3) !important;
                                padding-bottom: 5px !important;
                                text-align: center !important;
                            }
                            .EquipmentPanel_playerModel__3LRB6 {
                                display: grid !important;
                                grid-template-columns: repeat(5, 1fr) !important;
                                grid-template-rows: repeat(4, auto) !important;
                                gap: 8px !important;
                                padding: 10px !important;
                                max-width: 350px !important;
                                margin: 0 auto !important;
                            }
                            .AbilitiesPanel_abilityGrid__-p-VF {
                                display: grid !important;
                                grid-template-columns: repeat(4, 1fr) !important;
                                gap: 8px !important;
                                padding: 10px !important;
                                max-height: 180px !important;
                                overflow-y: auto !important;
                            }
                            .level { color: #fff !important; font-weight: bold !important; }
                            svg { width: 100% !important; height: 100% !important; }
                        `;
                    }
                    clonedCard.insertBefore(styleElement, clonedCard.firstChild);
    
                    // 配置尺寸参数（在创建容器之前）
                    // 为PC端布局确保最小宽度，避免在移动设备上展示不全
                    const minWidth = isMobileDevice ? 350 : 700; // PC端布局至少需要700px宽度
                    const actualWidth = Math.max(cardElement.offsetWidth, minWidth);
    
                    // 创建临时容器
                    const tempContainer = document.createElement('div');
                    tempContainer.style.position = 'absolute';
                    tempContainer.style.left = '-9999px';
                    tempContainer.style.top = '-9999px';
                    tempContainer.style.width = actualWidth + 'px'; // 确保容器有足够宽度
                    tempContainer.appendChild(clonedCard);
                    document.body.appendChild(tempContainer);
    
                    // 确保克隆的名片有足够宽度来完整展示PC端布局
                    if (!isMobileDevice) {
                        clonedCard.style.width = actualWidth + 'px';
                        clonedCard.style.minWidth = minWidth + 'px';
                    }
    
                    const options = {
                        backgroundColor: '#1a1a2e', // 使用纯色背景代替渐变
                        scale: isMobileDevice ? 1.5 : 2, // 移动端布局使用较小的缩放比例
                        useCORS: true,
                        allowTaint: true,
                        foreignObjectRendering: false,
                        width: actualWidth, // 使用计算出的实际宽度
                        height: isMobileDevice ? undefined : cardElement.offsetHeight, // 移动端布局自动计算高度
                        logging: false, // 关闭日志减少干扰
                        onclone: function(clonedDoc) {
                            try {
                                // 在克隆的文档中应用样式修复
                                const clonedCard = clonedDoc.querySelector('#character-card');
                                if (clonedCard) {
                                    if (isMobileDevice) {
                                        // 移动端布局样式修复
                                        clonedCard.style.background = '#1a1a2e';
                                        clonedCard.style.border = '2px solid #4a90e2';
                                        clonedCard.style.borderRadius = '15px';
                                        clonedCard.style.padding = '15px';
                                        clonedCard.style.color = 'white';
                                        clonedCard.style.fontFamily = 'Arial, sans-serif';
                                        clonedCard.style.width = '350px';
                                        clonedCard.style.maxWidth = '100%';
                                    } else {
                                        // 桌面端布局样式修复
                                        clonedCard.style.background = '#1a1a2e';
                                        clonedCard.style.border = '2px solid #4a90e2';
                                        clonedCard.style.borderRadius = '15px';
                                        clonedCard.style.padding = '20px';
                                        clonedCard.style.color = 'white';
                                        clonedCard.style.fontFamily = 'Arial, sans-serif';
                                        clonedCard.style.minWidth = minWidth + 'px';
                                        clonedCard.style.width = actualWidth + 'px';
                                    }
    
                                    // 确保所有文本都是白色
                                    const allText = clonedCard.querySelectorAll('*');
                                    allText.forEach(el => {
                                        if (el.tagName !== 'SVG' && el.tagName !== 'USE') {
                                            el.style.color = 'white';
                                        }
                                    });
                                }
                            } catch (error) {
                                console.warn('处理克隆文档时出错:', error);
                            }
                        }
                    };
    
                    // 生成画布
                    const canvas = await html2canvas(clonedCard, options);
    
                    // 清理临时容器
                    document.body.removeChild(tempContainer);
    
                    // 检查画布是否有内容
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    let hasContent = false;
    
                    // 检查是否有非透明像素
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] > 0) {
                            hasContent = true;
                            break;
                        }
                    }
    
                    if (!hasContent) {
                        console.warn('主要下载方法生成的图片为空，尝试备用方法...');
                        // 使用更简单的方法重试
                        const simpleOptions = {
                            backgroundColor: '#1a1a2e',
                            scale: 1,
                            useCORS: false,
                            allowTaint: true,
                            logging: false,
                            width: cardElement.offsetWidth,
                            height: cardElement.offsetHeight
                        };
    
                        const simpleCanvas = await html2canvas(cardElement, simpleOptions);
                        const simpleCtx = simpleCanvas.getContext('2d');
                        const simpleImageData = simpleCtx.getImageData(0, 0, simpleCanvas.width, simpleCanvas.height);
                        const simpleData = simpleImageData.data;
                        let simpleHasContent = false;
    
                        // 检查备用方法是否有内容
                        for (let i = 3; i < simpleData.length; i += 4) {
                            if (simpleData[i] > 0) {
                                simpleHasContent = true;
                                break;
                            }
                        }
    
                        if (simpleHasContent) {
                            // 备用方法成功，使用备用画布
                            const link = document.createElement('a');
                            link.download = `MWI_Character_Card_${new Date().getTime()}.png`;
                            link.href = simpleCanvas.toDataURL('image/png', 1.0);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
    
                            // 清理并恢复按钮状态
                            document.body.removeChild(tempContainer);
                            downloadBtn.textContent = originalText;
                            downloadBtn.disabled = false;
                            console.log('使用备用方法成功生成名片图片');
                            return;
                        } else {
                            throw new Error('生成的图片没有内容（主要方法和备用方法都失败）');
                        }
                    }
    
                    // 创建下载链接
                    const link = document.createElement('a');
                    link.download = `MWI_Character_Card_${new Date().getTime()}.png`;
                    link.href = canvas.toDataURL('image/png', 1.0);
    
                    // 触发下载
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
    
                    // 恢复按钮状态
                    downloadBtn.textContent = originalText;
                    downloadBtn.disabled = false;
    
                    console.log('名片图片已生成并下载');
    
                } catch (error) {
                    console.error('下载名片失败:', error);
                    alert(isZH ?
                        '下载名片失败\n\n错误信息: ' + error.message + '\n\n建议：请确保网络连接正常，并允许浏览器下载文件' :
                        'Failed to download character card\n\nError: ' + error.message + '\n\nSuggestion: Please ensure network connection and allow browser downloads');
    
                    // 恢复按钮状态
                    const downloadBtn = document.querySelector('.download-card-btn');
                    if (downloadBtn) {
                        downloadBtn.textContent = isZH ? '下载名片' : 'Download Card';
                        downloadBtn.disabled = false;
                    }
                }
            }
    
    
    
            // 自动点击导出按钮的辅助函数
            async function autoClickExportButton() {
                try {
                    console.log('尝试自动点击导出按钮...');
    
                    // 查找导出按钮的多种可能选择器
                    const exportButtonSelectors = [
                        // 中文版本的按钮文本
                        'button:contains("导出人物到剪贴板")',
                        // 英文版本的按钮文本
                        'button:contains("Export to clipboard")',
                    ];
    
                    let exportButton = null;
    
                    // 尝试通过按钮文本查找（中文和英文）
                    const allButtons = document.querySelectorAll('button');
                    for (const button of allButtons) {
                        const buttonText = button.textContent.trim();
                        if (buttonText.includes('导出人物到剪贴板') ||
                            buttonText.includes('Export to clipboard')) {
                            exportButton = button;
                            break;
                        }
                    }
    
                    // 如果通过文本没找到，尝试其他属性
                    if (!exportButton) {
                        for (const selector of exportButtonSelectors.slice(4)) { // 跳过contains选择器
                            try {
                                exportButton = document.querySelector(selector);
                                if (exportButton) {
                                    console.log('通过选择器找到导出按钮:', selector);
                                    break;
                                }
                            } catch (e) {
                                // 忽略选择器错误
                            }
                        }
                    }
    
                    if (!exportButton) {
                        console.log('未找到导出按钮，将直接尝试读取剪贴板');
                        return false;
                    }
    
                    // 检查按钮是否可点击
                    if (exportButton.disabled || exportButton.style.display === 'none') {
                        console.log('导出按钮不可用，将直接尝试读取剪贴板');
                        return false;
                    }
    
                    // 点击按钮
                    exportButton.click();
                    console.log('已点击导出按钮，等待数据导出...');
    
                    // 等待一段时间让数据导出到剪贴板
                    await new Promise(resolve => setTimeout(resolve, 500));
    
                    return true;
                } catch (error) {
                    console.log('自动点击导出按钮失败:', error);
                    return false;
                }
            }
    
            // 使用剪贴板数据生成名片（用于查看其他角色）
            async function showCharacterCard() {
                try {
                    let characterData = null;
                    let dataSource = isZH ? `剪贴板数据` : `Clipboard Data`;
    
                    // 先尝试自动点击导出按钮
                    const autoExportSuccess = await autoClickExportButton();
    
                    const clipboardText = await readClipboardData();
    
                    if (!clipboardText) {
                        const errorMessage = autoExportSuccess ?
                            (isZH ?
                                '已尝试自动导出，但无法读取剪贴板数据\n\n请确保：\n1. 允许浏览器访问剪贴板\n2. 等待导出完成后重试' :
                                'Auto export attempted, but cannot read clipboard data\n\nPlease ensure:\n1. Allow browser to access clipboard\n2. Wait for export to complete and retry'
                            ) :
                            (isZH ?
                                '无法读取剪贴板数据\n\n请确保：\n1. 先点击"导出人物到剪贴板"按钮\n2. 允许浏览器访问剪贴板\n3. 剪贴板中有有效的角色数据' :
                                'Cannot read clipboard data\n\nPlease ensure:\n1. Click "Export to clipboard" button first\n2. Allow browser to access clipboard\n3. Valid character data in clipboard'
                            );
                        alert(errorMessage);
                        return;
                    }
    
                    try {
                        characterData = JSON.parse(clipboardText);
                    } catch (error) {
                        alert(isZH ?
                            '剪贴板中的数据不是有效的JSON格式\n\n请确保先点击"导出人物到剪贴板"按钮' :
                            'Data in clipboard is not valid JSON\n\nPlease ensure you clicked "Export to clipboard" button first');
                        return;
                    }
    
                    if (!isValidCharacterData(characterData)) {
                        alert(isZH ?
                            '剪贴板中的数据不包含有效的角色信息\n\n请确保使用MWI Tools的"导出人物到剪贴板"功能' :
                            'Data in clipboard does not contain valid character information\n\nPlease ensure you use MWI Tools "Export to clipboard" feature');
                        return;
                    }
    
                    // 重置调试信息
                    state.debugInfo.firstSvgPath = null;
                    state.debugInfo.iconCount = 0;
    
                    const characterName = characterData.player?.name || characterData.character?.name || (isZH ? '角色' : 'Character');
    
                    // 查找页面中的角色信息元素 - 获取最后一个（用于查看其他角色）
                    let characterNameElement = null;
                    const characterNameDivs = document.querySelectorAll('.CharacterName_characterName__2FqyZ');
                    if (characterNameDivs.length > 0) {
                        // 取最后一个元素（用于查看其他角色）
                        const lastCharacterNameDiv = characterNameDivs[characterNameDivs.length - 1];
                        characterNameElement = lastCharacterNameDiv.outerHTML;
                    }
    
                    // 缓存剪贴板数据，用于布局切换
                    state.clipboardCharacterData = {
                        data: characterData,
                        name: characterName,
                        nameElement: characterNameElement
                    };
    
                    const modal = document.createElement('div');
                    modal.className = 'character-card-modal';
                    modal.innerHTML = `
                        <div class="modal-content">
                            <button class="close-modal">&times;</button>
                            <div class="instruction-banner">
                                ${isZH ?
                                    `MWI角色名片插件 v${VERSION} (数据来源: ${dataSource})` :
                                    `MWI Character Card Plugin v${VERSION} (Data Source: ${dataSource})`
                                }
                            </div>
                            <div class="download-section">
                                <div class="button-row">
                                    <button class="download-card-btn">${isZH ? '下载名片' : 'Download Card'}</button>
                                    <button class="layout-toggle-btn">${getLayoutToggleText()}</button>
                                </div>
                            </div>
                            ${generateCharacterCard(characterData, characterName, characterNameElement, false)}
                        </div>
                    `;
    
                    modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
                    modal.querySelector('.download-card-btn').onclick = downloadCharacterCard;
                    modal.querySelector('.layout-toggle-btn').onclick = toggleLayoutMode;
                    modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
    
                    // 初始化布局切换按钮显示
                    updateLayoutToggleButton();
    
                    // 初始化模态框容器布局类名
                    updateModalLayoutClass();
    
                    // 添加技能槽点击事件监听器（仅场景2需要）
                    const skillSlots = modal.querySelectorAll('.skill-slot, .empty-skill-slot');
                    skillSlots.forEach(slot => {
                        slot.addEventListener('click', function() {
                            const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                            showSkillSelector(skillIndex);
                        });
                    });
    
                    document.body.appendChild(modal);
    
                } catch (error) {
                    console.error('生成角色名片失败:', error);
                    alert(isZH ?
                        '生成角色名片时发生错误\n\n错误信息: ' + error.message :
                        'Error occurred while generating character card\n\nError: ' + error.message);
                }
            }
    
            // 使用WebSocket数据生成名片（用于查看当前角色）
            async function showMyCharacterCard() {
                try {
                    // 获取当前角色名
                    const currentCharacterName = window.characterCardWebSocketData?.characterName ||
                        window.characterCardWebSocketData?.name ||
                        (isZH ? '角色' : 'Character');
    
                    // 检查是否需要重置技能配置（角色切换）
                    const configKey = `mwi_skill_config_${currentCharacterName}`;
                    const savedConfig = localStorage.getItem(configKey);
    
                    if (savedConfig) {
                        // 有保存的配置，检查是否匹配当前角色
                        try {
                            const configData = JSON.parse(savedConfig);
                            if (configData.characterName === currentCharacterName) {
                                // 角色匹配，保持现有配置
                                console.log(`使用保存的技能配置: ${currentCharacterName}`);
                            } else {
                                // 角色不匹配，重置配置
                                state.customSkills.selectedSkills = [];
                                console.log(`角色切换，重置技能配置: ${currentCharacterName}`);
                            }
                        } catch (error) {
                            // 配置数据错误，重置
                            state.customSkills.selectedSkills = [];
                            console.log('配置数据错误，重置技能配置');
                        }
                    } else {
                        // 没有保存的配置，重置
                        state.customSkills.selectedSkills = [];
                    }
    
                    let characterData = null;
                    let dataSource = isZH ? `WS数据` : `WebSocket Data`;
    
                    // 检查是否有WebSocket数据
                    if (!window.characterCardWebSocketData) {
                        alert(isZH ?
                            '未找到当前角色数据\n\n请确保：\n1. 已登录游戏\n2. 等待游戏数据加载完成\n3. 刷新页面后重试' :
                            'No current character data found\n\nPlease ensure:\n1. You are logged into the game\n2. Wait for game data to load\n3. Refresh the page and try again');
                        return;
                    }
    
                    const parsedData = window.characterCardWebSocketData;
    
                    if (parsedData && parsedData.type === "init_character_data") {
                        // 将WebSocket数据格式转换为角色名片插件需要的格式
                        characterData = {
                            player: {
                                name: parsedData.characterName || parsedData.name || (isZH ? '角色' : 'Character'),
                                equipment: parsedData.characterItems || [],
                                characterItems: parsedData.characterItems || [],
                                staminaLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/stamina'))?.level || 0,
                                intelligenceLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/intelligence'))?.level || 0,
                                attackLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/attack'))?.level || 0,
                                meleeLevel: getMeleeLevel(parsedData.characterSkills),
                                defenseLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/defense'))?.level || 0,
                                rangedLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/ranged'))?.level || 0,
                                magicLevel: parsedData.characterSkills?.find(s => s.skillHrid.includes('/skills/magic'))?.level || 0
                            },
                            abilities: parsedData.characterAbilities || [],
                            characterSkills: parsedData.characterSkills || [],
                            houseRooms: parsedData.characterHouseRoomMap || {},
                            characterHouseRoomMap: parsedData.characterHouseRoomMap || {}
                        };
                    } else {
                        alert(isZH ?
                            'WebSocket数据格式不正确\n\n请刷新页面后重试' :
                            'WebSocket data format is incorrect\n\nPlease refresh the page and try again');
                        return;
                    }
    
                    if (!isValidCharacterData(characterData)) {
                        alert(isZH ?
                            'WebSocket数据不包含有效的角色信息\n\n请刷新页面后重试' :
                            'WebSocket data does not contain valid character information\n\nPlease refresh the page and try again');
                        return;
                    }
    
                    // 重置调试信息
                    state.debugInfo.firstSvgPath = null;
                    state.debugInfo.iconCount = 0;
    
                    const characterName = characterData.player?.name || characterData.character?.name || (isZH ? '角色' : 'Character');
    
                    // 查找页面中的角色信息元素 - 获取第一个（右上角的当前用户）
                    let characterNameElement = null;
                    const characterNameDivs = document.querySelectorAll('.CharacterName_characterName__2FqyZ');
                    if (characterNameDivs.length > 0) {
                        // 取第一个元素（右上角的当前用户）
                        const firstCharacterNameDiv = characterNameDivs[0];
                        characterNameElement = firstCharacterNameDiv.outerHTML;
                    }
    
                    const modal = document.createElement('div');
                    modal.className = 'character-card-modal';
                    modal.innerHTML = `
                        <div class="modal-content">
                            <button class="close-modal">&times;</button>
                            <div class="instruction-banner">
                                ${isZH ?
                                    `MWI角色名片插件 v${VERSION} (数据来源: ${dataSource})` :
                                    `MWI Character Card Plugin v${VERSION} (Data Source: ${dataSource})`
                                }
                            </div>
                            <div class="download-section">
                                <div class="button-row">
                                    <button class="download-card-btn">${isZH ? '下载名片' : 'Download Card'}</button>
                                    <button class="save-skill-config-btn">${isZH ? '保存技能配置' : 'Save Skill Config'}</button>
                                    <button class="load-skill-config-btn">${isZH ? '读取技能配置' : 'Load Skill Config'}</button>
                                    <button class="layout-toggle-btn">${getLayoutToggleText()}</button>
                                </div>
                                <div class="skill-hint">
                                    <span>${isZH ? '💡 点击技能图标可更换/添加展示的技能' : '💡 Click skill icons to change/add displayed skills'}</span>
                                </div>
                            </div>
                            ${generateCharacterCard(characterData, characterName, characterNameElement, true)}
                        </div>
                    `;
    
                    modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
                    modal.querySelector('.download-card-btn').onclick = downloadCharacterCard;
                    modal.querySelector('.layout-toggle-btn').onclick = toggleLayoutMode;
                    modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
    
                    // 初始化布局切换按钮显示
                    updateLayoutToggleButton();
    
                    // 初始化模态框容器布局类名
                    updateModalLayoutClass();
    
                    // 添加技能配置按钮事件监听器
                    modal.querySelector('.save-skill-config-btn').onclick = () => {
                        saveSkillConfig(characterName);
                    };
                    modal.querySelector('.load-skill-config-btn').onclick = () => {
                        loadSkillConfig(characterName);
                    };
    
                    // 添加技能槽点击事件监听器
                    const skillSlots = modal.querySelectorAll('.skill-slot, .empty-skill-slot');
                    skillSlots.forEach(slot => {
                        slot.addEventListener('click', function() {
                            const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                            showSkillSelector(skillIndex);
                        });
                    });
    
                    document.body.appendChild(modal);
    
                } catch (error) {
                    console.error('生成我的角色名片失败:', error);
                    alert(isZH ?
                        '生成我的角色名片时发生错误\n\n错误信息: ' + error.message :
                        'Error occurred while generating my character card\n\nError: ' + error.message);
                }
            }
    
            function addCharacterCardButton() {
                const checkElem = () => {
                    const selectedElement = document.querySelector(`div.SharableProfile_overviewTab__W4dCV`);
                    if (selectedElement) {
                        clearInterval(state.timer);
                        if (selectedElement.querySelector('.character-card-btn')) return;
    
                        const button = document.createElement("button");
                        button.className = 'character-card-btn';
                        button.textContent = isZH ? "查看角色名片" : "View Character Card";
                        button.style.cssText = `
                            border-radius: 6px; background-color: #17a2b8; color: white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 0px;
                            display: inline-block; cursor: pointer; transition: all 0.2s ease;
                        `;
    
                        // 添加hover效果
                        button.addEventListener('mouseenter', () => {
                            button.style.backgroundColor = '#138496';
                            button.style.transform = 'translateY(-1px)';
                        });
    
                        button.addEventListener('mouseleave', () => {
                            button.style.backgroundColor = '#17a2b8';
                            button.style.transform = 'translateY(0)';
                        });
    
                        button.onclick = () => {
                            showCharacterCard();
                            return false;
                        };
    
                        // 创建按钮容器并居中
                        const buttonContainer = document.createElement('div');
                        buttonContainer.style.cssText = 'text-align: center;';
                        buttonContainer.appendChild(button);
    
                        // 插入按钮容器
                        selectedElement.appendChild(buttonContainer);
    
                        // 修改 SharableProfile_tabsComponentContainer__2T8DG 元素的高度
                        const tabsContainer = document.querySelector('.SharableProfile_tabsComponentContainer__2T8DG');
                        if (tabsContainer) {
                            tabsContainer.style.height = '34rem';
                        }
    
                        console.log('角色名片按钮已添加');
                        return false;
                    }
                };
                state.timer = setInterval(checkElem, 1000);
            }
    
            // 在右上角角色信息区域添加"我的角色名片"按钮
            function addMyCharacterCardButton() {
                const checkMyButton = () => {
                    const headerNameElements = document.querySelectorAll('.Header_name__227rJ');
                    if (headerNameElements.length > 0) {
                        // 找到右上角的角色信息容器
                        const headerNameElement = headerNameElements[0];
    
                        // 检查是否已经添加过按钮
                        if (headerNameElement.querySelector('.my-character-card-btn')) {
                            return;
                        }
    
                        // 创建按钮
                        const myButton = document.createElement("button");
                        myButton.className = 'my-character-card-btn';
                        myButton.textContent = isZH ? "角色名片" : "Character Card";
                        myButton.style.cssText = `
                            border-radius: 4px; height: 14px; background-color: #28a745; color: white;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.2); border: 0px; margin-left: 4px;
                            display: inline-block; padding: 0 8px; font-size: 11px; cursor: pointer;
                            transition: all 0.2s ease; vertical-align: middle;
                        `;
    
                        // 添加hover效果
                        myButton.addEventListener('mouseenter', () => {
                            myButton.style.backgroundColor = '#218838';
                            myButton.style.transform = 'translateY(-1px)';
                        });
    
                        myButton.addEventListener('mouseleave', () => {
                            myButton.style.backgroundColor = '#28a745';
                            myButton.style.transform = 'translateY(0)';
                        });
    
                        myButton.onclick = () => {
                            showMyCharacterCard();
                            return false;
                        };
    
                        // 将按钮插入到Header_name容器中
                        headerNameElement.appendChild(myButton);
    
                        console.log('我的角色名片按钮已添加到右上角');
                        return false;
                    }
                };
    
                // 使用定时器检查并添加按钮
                const myButtonTimer = setInterval(checkMyButton, 1000);
    
                // 清理定时器（当按钮添加成功后）
                setTimeout(() => {
                    clearInterval(myButtonTimer);
                }, 10000); // 10秒后停止检查
            }
    
            // 在队伍信息区域添加“查看队伍名片”按钮
            function addPartyCardButton() {
                const checkParty = () => {
                    const optionsEl = document.querySelector('.Party_partyOptions__3HGXK');
                    if (!optionsEl) return;
                    if (optionsEl.querySelector('.party-card-btn')) return;
    
                    const btn = document.createElement('button');
                    btn.className = 'party-card-btn';
                    btn.textContent = isZH ? '查看队伍名片（仅限桌面端）' : 'View Party Cards (Desktop Only)';
                    btn.style.cssText = `
                        border-radius: 2px; background-color: #28a745; color: white;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2); border: 0px; margin-left: 8px;
                        display: inline-block; padding: 0 8px; cursor: pointer;
                        transition: all 0.2s ease; vertical-align: middle;
                    `;
                    btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = '#218838'; btn.style.transform = 'translateY(-1px)'; });
                    btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = '#28a745'; btn.style.transform = 'translateY(0)'; });
                    btn.onclick = () => { showPartyCharacterCard(); return false; };
    
                    // 包装成 div 与其他 div 同级显示
                    const wrapperDiv = document.createElement('div');
                    wrapperDiv.style.display = 'inline-block';
                    wrapperDiv.appendChild(btn);
                    optionsEl.appendChild(wrapperDiv);
                    console.log('队伍名片按钮已添加');
                };
                // 初次尝试与后续监听
                const timer = setInterval(() => {
                    if (document.querySelector('.Party_partyOptions__3HGXK')) {
                        clearInterval(timer);
                        checkParty();
                    }
                }, 1000);
    
                // DOM 变化时重试插入
                const partyObserver = new MutationObserver(() => checkParty());
                partyObserver.observe(document.body, { childList: true, subtree: true });
            }
    
                     async function init() {
                 console.log(`MWI角色名片插件 v${VERSION}`);
                console.log('使用说明：');
                console.log('1. 在角色信息界面点击"查看角色名片"按钮 - 使用剪贴板数据');
                console.log('2. 在右上角点击"我的角色名片"按钮 - 使用WebSocket数据');
    
                createModalStyles();
                createTeamStyles();
                const spritesLoaded = await state.svgTool.loadSpriteSheets();
                console.log(`图标系统初始化${spritesLoaded ? '成功' : '失败'}，将使用${spritesLoaded ? 'MWI原版SVG图标' : '后备图标显示'}`);
                if (spritesLoaded) {
                    console.log('SVG Sprite文件:', state.svgTool.spriteSheets);
                }
    
                // 设置WebSocket Hook
                hookWebSocket();
    
                // 监听角色数据可用事件
                window.addEventListener('characterDataAvailable', function(event) {
                    // 静默处理事件
                });
    
                addCharacterCardButton();
                addMyCharacterCardButton();
                addPartyCardButton();
    
                // 创建一个MutationObserver来监听body的子节点变化
                state.observer = new MutationObserver((mutationsList, observer) => {
                    for(const mutation of mutationsList) {
                        if (mutation.type === 'childList') {
                            // 检查是否是SharableProfile_overviewTab__W4dCV的子节点变化
                            if (mutation.target.classList.contains('SharableProfile_overviewTab__W4dCV')) {
                                // 延迟执行，确保DOM更新完成
                                setTimeout(addCharacterCardButton, 100);
                            }
                        }
                    }
                });
                state.observer.observe(document.body, { childList: true, subtree: true });
            }
    
            // 清理函数
            function cleanup() {
                if (state.observer) {
                    state.observer.disconnect();
                    state.observer = null;
                }
                if (state.timer) {
                    clearInterval(state.timer);
                    state.timer = null;
                }
            }
    
            // 暴露数据给其他脚本的函数
            function exposeDataToOtherScripts() {
                // 创建一个全局函数，让MWI Tools可以调用
                window.exposeMWIToolsData = function(data) {
                    window.mwiToolsData = data;
                };
    
                // 监听来自MWI Tools的消息
                window.addEventListener('message', function(event) {
                    if (event.source === window && event.data && event.data.type === 'MWI_TOOLS_DATA') {
                        window.mwiToolsData = event.data.data;
                    }
                });
    
                // 监听localStorage变化
                window.addEventListener('storage', function(event) {
                    if (event.key === 'init_character_data' && event.newValue) {
                        try {
                            const data = JSON.parse(event.newValue);
                            window.mwiToolsData = data;
                        } catch (error) {
                            // 静默处理错误
                        }
                    }
                });
            }
    
            // WebSocket Hook函数 - 参考MWI Tools的实现
            function hookWebSocket() {
                // 检查是否已经hook过
                if (window.characterCardWebSocketHooked) {
                    return;
                }
    
                try {
                    // 获取MessageEvent.prototype.data的属性描述符
                    const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
                    if (!dataProperty) {
                        return;
                    }
    
                    const oriGet = dataProperty.get;
    
                    // 重写getter
                    dataProperty.get = function() {
                        const socket = this.currentTarget;
    
                        // 检查是否是WebSocket连接
                        if (!(socket instanceof WebSocket)) {
                            return oriGet.call(this);
                        }
    
                        // 检查是否是MWI的WebSocket连接
                        if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1 &&
                            socket.url.indexOf("api-test.milkywayidle.com/ws") <= -1 &&
                            socket.url.indexOf("api.milkywayidlecn.com/ws") <= -1) {
                            return oriGet.call(this);
                        }
    
                        // 获取原始消息
                        const message = oriGet.call(this);
    
                        // 防止循环调用
                        Object.defineProperty(this, "data", { value: message, configurable: true });
    
                        // 处理消息
                        handleWebSocketMessage(message);
    
                        return message;
                    };
    
                    // 重新定义属性
                    Object.defineProperty(MessageEvent.prototype, "data", dataProperty);
    
                    // 标记已hook
                    window.characterCardWebSocketHooked = true;
    
                } catch (error) {
                    // 静默处理错误
                }
            }
    
            // 处理WebSocket消息
            function handleWebSocketMessage(message) {
                try {
                    const obj = JSON.parse(message);
    
                    // 处理角色数据
                    if (obj && obj.type === "init_character_data") {
                        console.log('=== 检测到角色数据 ===');
                        console.log('角色名称:', obj.characterName);
                        console.log('装备数量:', obj.characterItems?.length || 0);
                        console.log('技能数量:', obj.characterSkills?.length || 0);
                        console.log('能力数量:', obj.characterAbilities?.length || 0);
                        console.log('房屋数据:', obj.characterHouseRoomMap);
                        console.log('完整数据:', obj);
    
                        // 存储到全局变量
                        window.mwiToolsData = obj;
                        window.characterCardWebSocketData = obj;
    
                        // 存储到localStorage
                        try {
                            localStorage.setItem('init_character_data', message);
                            console.log('已存储到localStorage');
                        } catch (error) {
                            console.log('localStorage存储失败:', error);
                        }
    
                        // 触发数据可用事件
                        window.dispatchEvent(new CustomEvent('characterDataAvailable', {
                            detail: obj
                        }));
    
                        console.log('=== 角色数据处理完成 ===');
                    } else if (obj && obj.type === 'profile_shared') {
                        // 存储队友 profile_shared 以便队伍名片使用
                        try {
                            let listStr = localStorage.getItem('profile_export_list');
                            let list = [];
                            try { list = listStr ? JSON.parse(listStr) : []; } catch {}
                            obj.characterID = obj.profile?.characterSkills?.[0]?.characterID;
                            obj.characterName = obj.profile?.sharableCharacter?.name;
                            obj.timestamp = Date.now();
                            list = (list || []).filter(it => it.characterID !== obj.characterID);
                            list.unshift(obj);
                            if (list.length > 20) list.pop();
                            localStorage.setItem('profile_export_list', JSON.stringify(list));
                            console.log('[队伍名片] 已保存队友资料 profile_shared: ', obj.characterName);
                        } catch (e) {
                            // 静默
                        }
                    } else if (obj && obj.type === 'new_battle') {
                        // 可用于后续扩展（例如消耗品等）
                        try { localStorage.setItem('new_battle', message); } catch {}
                    }
    
                } catch (error) {
                    // 静默处理解析错误，不打印日志
                }
            }
    
            // 在脚本卸载时清理
            window.addEventListener('unload', cleanup);
    
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
    
            // 初始化数据暴露机制
            exposeDataToOtherScripts();
    
            // 保存技能配置函数
            function saveSkillConfig(characterName) {
                try {
                    const configKey = `mwi_skill_config_${characterName}`;
    
                    // 只保存技能ID和位置，不保存等级
                    const simplifiedSkills = state.customSkills.selectedSkills.map((skill, index) => ({
                        abilityHrid: skill.abilityHrid,
                        position: index
                    }));
    
                    const configData = {
                        characterName: characterName,
                        selectedSkills: simplifiedSkills,
                        timestamp: Date.now()
                    };
    
                    localStorage.setItem(configKey, JSON.stringify(configData));
    
                    // 显示成功提示
                    const saveBtn = document.querySelector('.save-skill-config-btn');
                    const originalText = saveBtn.textContent;
                    saveBtn.textContent = isZH ? '保存成功!' : 'Saved!';
                    saveBtn.style.backgroundColor = '#28a745';
    
                    setTimeout(() => {
                        saveBtn.textContent = originalText;
                        saveBtn.style.backgroundColor = '#17a2b8';
                    }, 2000);
    
                    console.log(`技能配置已保存: ${characterName}`);
                } catch (error) {
                    console.error('保存技能配置失败:', error);
                    alert(isZH ? '保存技能配置失败' : 'Failed to save skill config');
                }
            }
    
            // 读取技能配置函数
            function loadSkillConfig(characterName) {
                try {
                    const configKey = `mwi_skill_config_${characterName}`;
                    const savedConfig = localStorage.getItem(configKey);
    
                    if (!savedConfig) {
                        alert(isZH ?
                            `未找到角色 "${characterName}" 的技能配置\n\n请先保存技能配置` :
                            `No skill config found for character "${characterName}"\n\nPlease save skill config first`);
                        return false;
                    }
    
                    const configData = JSON.parse(savedConfig);
    
                    // 验证配置数据
                    if (!configData.selectedSkills || !Array.isArray(configData.selectedSkills)) {
                        alert(isZH ? '技能配置数据格式错误' : 'Invalid skill config data format');
                        return false;
                    }
    
                    // 从WebSocket数据获取最新技能信息并应用配置
                    const allSkills = window.characterCardWebSocketData?.characterAbilities || [];
                    const restoredSkills = [];
    
                    configData.selectedSkills.forEach(savedSkill => {
                        if (savedSkill.abilityHrid) {
                            // 从WebSocket数据中找到对应的技能
                            const currentSkill = allSkills.find(skill =>
                                skill.abilityHrid === savedSkill.abilityHrid
                            );
    
                            if (currentSkill) {
                                // 使用最新的等级信息
                                restoredSkills[savedSkill.position] = {
                                    abilityHrid: currentSkill.abilityHrid,
                                    level: currentSkill.level,
                                    slotNumber: currentSkill.slotNumber
                                };
                            }
                        }
                    });
    
                    // 应用恢复的技能配置
                    state.customSkills.selectedSkills = restoredSkills;
    
                    // 重新生成技能面板
                    const characterCard = document.querySelector('#character-card');
                    if (characterCard) {
                        const skillPanel = characterCard.querySelector('.skill-panel');
                        if (skillPanel) {
                            const characterData = {
                                abilities: window.characterCardWebSocketData?.characterAbilities || [],
                                characterSkills: window.characterCardWebSocketData?.characterSkills || []
                            };
                            const newSkillPanel = generateSkillPanel(characterData, true);
                            skillPanel.innerHTML = newSkillPanel.replace(/<div class="skill-panel">([\s\S]*?)<\/div>$/, '$1');
    
                            // 重新添加事件监听器
                            const skillSlots = skillPanel.querySelectorAll('.skill-slot, .empty-skill-slot');
                            skillSlots.forEach(slot => {
                                slot.addEventListener('click', function() {
                                    const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                                    showSkillSelector(skillIndex);
                                });
                            });
                        }
                    }
    
                    // 显示成功提示
                    const loadBtn = document.querySelector('.load-skill-config-btn');
                    const originalText = loadBtn.textContent;
                    loadBtn.textContent = isZH ? '读取成功!' : 'Loaded!';
                    loadBtn.style.backgroundColor = '#28a745';
    
                    setTimeout(() => {
                        loadBtn.textContent = originalText;
                        loadBtn.style.backgroundColor = '#17a2b8';
                    }, 2000);
    
                    console.log(`技能配置已读取: ${characterName}`);
                    return true;
                } catch (error) {
                    console.error('读取技能配置失败:', error);
                    alert(isZH ? '读取技能配置失败' : 'Failed to load skill config');
                    return false;
                }
            }
    
            // 将函数暴露到全局作用域
            if (typeof window !== 'undefined') {
                window.showSkillSelector = showSkillSelector;
                window.selectSkill = selectSkill;
            }
    
        })(); // 结束立即执行函数
    
    })();
  });

  // ---------------------------------------------------------------------------
  // Module: 技能需求提示
  // Original: MWI QoL 技能需求.user.js v1.2.0
  // Author: GodofTheFallen, AlexZaw
  // License: MIT
  // Source: https://greasyfork.org/scripts/532227
  // WebSocket compatibility patches: 0
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("skill-requirements", "技能需求提示", "idle", () => {
    (function () {
        'use strict';
    
        const levelNotEnoughColor = 'red';
        const levelEnoughColor = 'blue';
    
        const selectors = {
            tooltipPopper: '.MuiTooltip-popper',
            tooltipText: '[class*="ItemTooltipText_itemTooltipText__"]',
            equipmentDetail: '[class*="ItemTooltipText_equipmentDetail__"]',
            abilityDetail: '[class*="ItemTooltipText_abilityDetail__"]',
            navigationLinks: '[class*="NavigationBar_navigationLinks__"]',
            navigationLabel: '[class*="NavigationBar_label__"]',
            navigationLevel: '[class*="NavigationBar_level__"]',
            totalLevel: '[class*="Header_totalLevel__"]',
        };
    
        const requiredLevelItemStyle = document.createElement('style');
        requiredLevelItemStyle.textContent = `
          :where(${selectors.tooltipText})
          :where(${selectors.equipmentDetail}, ${selectors.abilityDetail})
          > div:nth-child(2) {
            color: ${levelEnoughColor};
          }
        `;
        document.head.appendChild(requiredLevelItemStyle);
    
        let mainScheduled = false;
    
        const observer = new MutationObserver((changes) => {
            if (!changes.some(mutationTouchesTooltip)) {
                return;
            }
            scheduleMain();
        });
    
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    
        scheduleMain();
    
        function mutationTouchesTooltip(change) {
            const target = change.target?.nodeType === Node.ELEMENT_NODE
                ? change.target
                : null;
    
            if (target?.closest?.(selectors.tooltipPopper)) {
                return true;
            }
    
            return [...change.addedNodes].some((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return false;
                }
                return node.matches?.(`${selectors.tooltipPopper}, ${selectors.tooltipText}`) ||
                    node.querySelector?.(`${selectors.tooltipPopper}, ${selectors.tooltipText}`);
            });
        }
    
        function scheduleMain() {
            if (mainScheduled) {
                return;
            }
            mainScheduled = true;
            requestAnimationFrame(() => {
                mainScheduled = false;
                main();
            });
        }
    
        function main() {
            const visiblePoppers = [...document.querySelectorAll(selectors.tooltipPopper)]
                .filter(isVisible);
    
            visiblePoppers.forEach((popper) => {
                popper.querySelectorAll(selectors.tooltipText).forEach(processTooltip);
            });
        }
    
        function isVisible(element) {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 &&
                style.display !== 'none' && style.visibility !== 'hidden';
        }
    
        function processTooltip(tooltipText) {
            const detail = tooltipText.querySelector(
                `${selectors.equipmentDetail}, ${selectors.abilityDetail}`
            );
    
            if (!detail) {
                return;
            }
    
            getRequirementElements(detail).forEach((element) => {
                const requirement = parseRequirement(element.textContent);
                if (!requirement) {
                    return;
                }
    
                const enough = requirement.currentLevel >= requirement.requiredLevel;
                element.style.color = enough ? levelEnoughColor : levelNotEnoughColor;
                element.style.fontWeight = enough ? '' : '700';
                element.title = `目前等級: ${requirement.currentLevel} / 需要等級: ${requirement.requiredLevel}`;
            });
        }
    
        function getRequirementElements(detail) {
            const requirementContainer = detail.children[1];
            if (!requirementContainer) {
                return [];
            }
    
            const elements = [...requirementContainer.children];
            return elements.length > 0 ? elements : [requirementContainer];
        }
    
        function parseRequirement(text) {
            const requiredLevelMatch = text.match(/\d[\d,]*/);
            if (!requiredLevelMatch) {
                return null;
            }
    
            const requiredLevel = Number(requiredLevelMatch[0].replaceAll(',', ''));
            const normalizedRequirement = normalizeText(text);
    
            if (/total/i.test(text) || normalizedRequirement.includes('总等级') ||
                normalizedRequirement.includes('總等級')) {
                const currentLevel = getTotalLevel();
                return Number.isFinite(currentLevel)
                    ? { requiredLevel, currentLevel }
                    : null;
            }
    
            const allSkills = getAllSkillLevels()
                .sort((a, b) => normalizeText(b.name).length - normalizeText(a.name).length);
    
            const requiredSkill = allSkills.find((skill) =>
                normalizedRequirement.includes(normalizeText(skill.name))
            );
    
            if (!requiredSkill) {
                return null;
            }
    
            return {
                requiredLevel,
                currentLevel: requiredSkill.level,
            };
        }
    
        function normalizeText(text) {
            return String(text)
                .toLowerCase()
                .replace(/[\s:：,，。.!！?？()（）\[\]]/g, '')
                .replace(/levels?/g, '')
                .replace(/[级級]/g, '');
        }
    
        function getTotalLevel() {
            const totalLevelElement = document.querySelector(selectors.totalLevel);
            const matches = totalLevelElement?.textContent.match(/\d[\d,]*/g);
            if (!matches?.length) {
                return NaN;
            }
            return Number(matches.at(-1).replaceAll(',', ''));
        }
    
        function getAllSkillLevels() {
            const navigationLinks = document.querySelector(selectors.navigationLinks);
            if (!navigationLinks) {
                return [];
            }
    
            return [...navigationLinks.querySelectorAll(selectors.navigationLabel)]
                .map((label) => {
                    const scope = label.parentElement;
                    const levelElement = scope?.querySelector(selectors.navigationLevel);
                    const levelMatch = levelElement?.textContent.match(/\d[\d,]*/);
    
                    if (!levelMatch) {
                        return null;
                    }
    
                    return {
                        name: label.textContent.trim(),
                        level: Number(levelMatch[0].replaceAll(',', '')),
                    };
                })
                .filter(Boolean);
        }
    })();
  });

})();
