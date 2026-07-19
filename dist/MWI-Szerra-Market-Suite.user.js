// ==UserScript==
// @name         MWI Szerra 市場工具包
// @namespace    https://github.com/szerra/mwi-szerra-suite
// @version      1.0.2
// @description  整合材料購物清單、市場高亮與收益面板；價格歷史由獨立的 mooket II 提供。
// @author       Szerra integration; see THIRD_PARTY_NOTICES.md
// @license      MIT
// @icon         https://www.milkywayidle.com/favicon.svg
// @homepageURL  https://github.com/szerra/mwi-szerra-suite
// @supportURL   https://github.com/szerra/mwi-szerra-suite/issues
// @updateURL    https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Market-Suite.user.js
// @downloadURL  https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Market-Suite.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      ghproxy.net
// @connect      mooket.qi-e.top
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// @resource     bootstrapCSS https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css
// ==/UserScript==
(() => {
  "use strict";

  const __MWISzerraSuite = (() => {
    const packId = "market";
    const storageKey = `mwi.szerra.suite.${packId}.modules.v1`;
    const defaults = {
      "market-mate": true,
      "profit-panel": true
    };
    const menuItems = [
      { id: "market-mate", label: "市場伴侶" },
      { id: "profit-panel", label: "收益面板" }
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
  // Module: 市場伴侶
  // Original: MWI 市场伴侣.user.js v2.3.0-szerra.2
  // Author: ColaCola
  // License: MIT
  // Source: https://greasyfork.org/scripts/567386
  // WebSocket compatibility patches: 0
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("market-mate", "市場伴侶", "start", () => {
    /* ============================================================================
     * MWI 市场伴侣 · 制作缺料计算 / 购物清单 / 市场高亮与预填 / 采购导航
     * ----------------------------------------------------------------------------
     * 分区目录(编辑器内搜索 "§NN" 跳转):
     *   §00 脚本配置与选择器        §01 国际化 i18n           §02 全局状态 STATE
     *   §02A Store 订阅中心          §02B 设置 Schema          §03 公共 API MWIMM
     *   §04 数据采集(WS/游戏数据)   §05 领域逻辑(Z-score/价格/计划/任务/数据层/配方链)
     *   §06 工具区(解析链/防注入)   §07(+07A) 业务流程/Actions §08 面板检测与需求提取
     *   §09 嵌入式渲染(徽章/链树/摘要)                        §10A 双形态壳 UI(Shadow DOM)
     *   §11 刷新与守护(看门狗)      §12 周边(快捷键/预填/采购导航)
     *   §13 样式注入                §14 启动
     * ----------------------------------------------------------------------------
     * 设计要点(语义不变量,改动前必读):
     *   · 数据优先级:WS 截获 > localStorage 缓存(自带 LZ 解压优先,页面全局仅兜底)
     *     > window.mwi;数据层未就绪时落 DOM 解析回退,并带懒重试自愈。
     *   · 防注入:DOM 解析只信带游戏 CSS-Modules 类名的节点,数值越界一律按解析失败,
     *     斜杠右侧数字恒为总需求量(绝不再乘次数)。
     *   · 徽章:data-mm-badge 属性 + ::after 渲染;重绘由数据签名缓存把守,跳绘前
     *     做逐行完整性核对(部分被第三方抹除也会触发补绘),看门狗每秒兜底。
     *   · 快捷键:购齐事件装填、fire-once;触发监听器幂等重挂 ×4 时机 + window/document
     *     双层冗余 + 事件打戳去重(免疫启动期文档重写清空监听器)。
     *   · 诊断:控制台 MWIMM.__selftest() / __probe() / __key() / __log()(log 导出),判定不说谎、检出即自愈。
     * ----------------------------------------------------------------------------
     * 公共 API: window.MWIMM   
     * ----------------------------------------------------------------------------
     * Other userscripts / plugins can interact with Market Mate via window.MWIMM.
     * 其他用户脚本/插件可通过 window.MWIMM 与本插件交互。
     *
     * ── 检测就绪 / Detecting readiness ──────────────────────────────────────────
     *   if (window.MWIMM && window.MWIMM.ready) { ... }
     *   // or wait via event:
     *   const onReady = () => { ... };
     *   if (window.MWIMM?.ready) onReady();
     *   else window.MWIMM?.on('ready', onReady);
     *
     * ── 字段 / Fields ───────────────────────────────────────────────────────────
     *   version       string   plugin version, e.g. "1.7.0"
     *   apiVersion    number   public API version (bumped on breaking changes)
     *   ready         boolean  init() finished
     *
     * ── 购物车读取 (read-only) ──────────────────────────────────────────────────
     *   getCartItems()                → CartItem[]    (deep clone, safe to mutate)
     *   getCartItem(itemId)           → CartItem | null
     *   hasCartItem(itemId)           → boolean
     *   getCartCount()                → number
     *
     *   CartItem = {
     *     itemId:    string   // bare id, e.g. "oak_log"
     *     name:      string   // localized display name
     *     quantity:  number   // remaining quantity to purchase
     *     starred:   boolean
     *     threshold: number | null    // reserve threshold, null if unset
     *     source:    string | null    // origin tag ("manual" / "material" / "api" ...)
     *     updatedAt: string | null    // ISO timestamp
     *   }
     *
     * ── 购物车写入 / Cart mutations ─────────────────────────────────────────────
     *   addToCart(item | item[])      → { ok, added, skipped }
     *      Accumulating add (existing items get their quantity increased).
     *      item = { itemId, quantity, name?, iconRef?, source? }
     *      itemId accepts "oak_log" / "/items/oak_log" / "#oak_log".
     *      quantity must be > 0 (otherwise the entry is skipped).
     *
     *   setCartItemQuantity(itemId, quantity) → { ok }
     *      Overwrites the quantity (in contrast to addToCart's accumulation).
     *      quantity = 0 removes the item (starred items are kept at 0).
     *
     *   removeFromCart(itemId)        → { ok }
     *   clearCart({ includeStarred = false } = {}) → { ok }
     *
     * ── 物品/市场 / Item & marketplace helpers ──────────────────────────────────
     *   resolveItemName(itemId)       → string    // localized display name
     *   openMarketplace(itemId)       → boolean   // open the in-game market panel
     *   normalizeItemId(itemId)       → string    // strip "/items/" or "#" prefix
     *
     * ── 事件 / Events ───────────────────────────────────────────────────────────
     *   on(event, handler) / off(event, handler)
     *      'ready'        handler({ version, apiVersion })
     *      'cart:change'  handler({ items })       fires after the cart is persisted
     *
     * ── 示例 / Example ──────────────────────────────────────────────────────────
     *   // Add 100 sugar and 50 egg to the shopping list:
     *   MWIMM.addToCart([
     *     { itemId: 'sugar',  quantity: 100 },
     *     { itemId: 'egg', quantity: 50  }
     *   ]);
     *
     *   // React to changes:
     *   MWIMM.on('cart:change', ({ items }) => {
     *     console.log('cart now has', items.length, 'items');
     *   });
     *
     *   // Jump to the marketplace for a specific item:
     *   MWIMM.openMarketplace('sugar');
     * ============================================================================
     */
    
    (function () {
        "use strict";
    
        /** 脚本元信息及 localStorage 键名 */
    
        // ════════════════════════════════════════════════════════════════════════
        // §00 脚本配置与选择器
        //     SCRIPT 常量(localStorage 键名,不得改动) / SEL / MARKET_SEL
        // ════════════════════════════════════════════════════════════════════════
    
        const SCRIPT = {
            id: "mwi-missing-cart-cn",
            version: "2.3",
            cartKey: "mwi_missing_cart_v1",         // 购物车持久化
            plansKey: "mwi_crafting_plans_v1",      // 制作计划持久化
            togglesKey: "mwi_missing_cart_toggles_v1"    // 开关状态
        };
    
        // ── 诊断 log —— 环形缓冲(零打扰观测,非防御层)──────────────
        //    目的:出问题时用户只需在控制台执行 MWIMM.__log() 并把输出全文贴给作者,
        //    即可离线定位根因。设计约束:不向控制台增噪(静默入缓冲)、重复事件折叠
        //    为 ×N、容量封顶 400 条、记录仪自身任何异常都被吞掉(绝不反伤宿主)。
        //    [mwi-mm] 前缀的既有 console 输出经钩子自动入流水,其他脚本的日志不收。
        const _log = {
            _buf: [], _cap: 400, _t0: Date.now(), _lastKey: "",
            _fmtArg(a) {
                try {
                    if (typeof a === "string") return a;
                    if (a instanceof Error) return a.message + " | " + String(a.stack || "").split("\n")[1];
                    return JSON.stringify(a).slice(0, 160);
                } catch (e) { return String(a); }
            },
            note(tag, msg) {
                try {
                    msg = String(msg).slice(0, 240);
                    const key = tag + "|" + msg;
                    const last = this._buf[this._buf.length - 1];
                    if (key === this._lastKey && last) { last.n++; last.t2 = Date.now(); return; }
                    this._buf.push({ t: Date.now(), t2: 0, tag, msg, n: 1 });
                    if (this._buf.length > this._cap) this._buf.splice(0, this._buf.length - this._cap);
                    this._lastKey = key;
                } catch (e) { /* 记录仪永不抛错 */ }
            },
            hookConsole() {
                try {
                    for (const lv of ["log", "info", "warn", "error"]) {
                        const orig = console[lv].bind(console);
                        console[lv] = (...args) => {
                            try {
                                if (typeof args[0] === "string" && args[0].startsWith("[mwi-mm]")) {
                                    this.note(lv, args.map(a => this._fmtArg(a)).join(" "));
                                }
                            } catch (e) { /* ignore */ }
                            return orig(...args);
                        };
                    }
                } catch (e) { /* ignore */ }
            },
            hookErrors() {
                try {
                    window.addEventListener("error", (ev) => {
                        const f = String(ev.filename || "");
                        this.note("uncaught", (ev.message || "?") + " @" + f.slice(-48) + ":" + (ev.lineno || 0));
                    });
                    window.addEventListener("unhandledrejection", (ev) => {
                        this.note("unhandled", this._fmtArg(ev.reason));
                    });
                } catch (e) { /* ignore */ }
            },
            dump() {
                const rel = (t) => "+" + ((t - this._t0) / 1000).toFixed(1) + "s";
                return this._buf.map(e =>
                    rel(e.t) + " [" + e.tag + "] " + e.msg + (e.n > 1 ? " ×" + e.n + "(至" + rel(e.t2) + ")" : "")
                ).join("\n");
            }
        };
        _log.hookConsole();
        _log.hookErrors();
    
        /** 游戏 DOM 选择器（技能制作面板 & 房屋建造面板） */
        const SEL = {
            detailRoot: '[class*="SkillActionDetail_skillActionDetail"]',       // 技能详情根节点
            regularComponent: '[class*="SkillActionDetail_regularComponent"]', // 常规材料区域
            requirements: '[class*="SkillActionDetail_itemRequirements"]',     // 材料需求容器
            requirementItems: '[class*="Item_itemContainer"]',                 // 单个材料项
            requirementInventory: '[class*="SkillActionDetail_inventoryCount"]', // 库存数量
            requirementInput: '[class*="SkillActionDetail_inputCount"]',       // 所需数量
            upgradeContainer: '[class*="SkillActionDetail_upgradeItemSelectorInput"]', // 升级物品选择器
            actionCountInput: '[class*="SkillActionDetail_maxActionCountInput"] input[class*="Input_input"]', // 行动次数输入
            actionContainer: '[class*="SkillActionDetail_actionContainer"]',   // 行动容器
            itemCore: '[class*="Item_item__"]',         // 物品核心元素
            itemCount: '[class*="Item_count"]',          // 物品数量标签
            houseRoot: '[class*="HousePanel_modalContent"]',        // 房屋面板根
            houseRequirements: '[class*="HousePanel_itemRequirements"]', // 房屋材料需求
            houseInventory: '[class*="HousePanel_inventoryCount"]',     // 房屋库存显示
            houseInput: '[class*="HousePanel_inputCount"]',             // 房屋所需数量
            houseCosts: '[class*="HousePanel_costs"]',                  // 房屋费用
            houseUpgradeBtn: '[class*="HousePanel_upgradeButton"]'      // 房屋升级按钮
        };
    
        // ── 市场弹窗选择器 ────────────────────────────────
        const MARKET_SEL = {
            modalContainer: '[class*="Modal_modalContainer"]',
            modalContent: '[class*="MarketplacePanel_modalContent"]',
            header: '[class*="MarketplacePanel_header"]',
            itemIcon: '[class*="MarketplacePanel_itemContainer"] svg use',
            priceInput: '[class*="MarketplacePanel_priceInput"]',
            quantityContainer: '[class*="MarketplacePanel_quantityInputs"]',
            quantityInput: '[class*="MarketplacePanel_quantityInputs"] input[class*="Input_input"]',
            submitButton: 'button[class*="Button_success"]',
            labelElement: '[class*="MarketplacePanel_label"]',
            marketPanel: '[class*="MarketplacePanel_marketplacePanel"]',
        };
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §01 国际化 i18n
        //     _I18N 词典(228 键) / _loadLangPref / t() —— 跟随游戏 i18nextLng
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 国际化 (i18n) 双语支持 ─────────────────────────────
        //   ★ 始终自动跟随游戏 i18nextLng 语言设置，不再手动切换。
    
        let _currentLang = "zh"; // 默认中文
    
        /** 从游戏 i18nextLng 自动检测语言 */
        function _loadLangPref() {
            try {
                const gameLang = localStorage.getItem("i18nextLng") || "";
                _currentLang = gameLang.startsWith("zh") ? "zh" : "en";
            } catch { /* ignore */ }
        }
    
        /** 获取当前 locale（用于 localeCompare 排序） */
        function _getLocale() {
            return _currentLang === "zh" ? "zh-Hans-CN" : "en";
        }
    
        // 启动时立即读取偏好
        _loadLangPref();
    
        /** 翻译映射表 */
        const _I18N = {
            // ── 通用 ──
            "unknown_item": { zh: "未知物品", en: "Unknown Item" },
            "upgrade_item": { zh: "升级物品", en: "Upgrade Item" },
            "item": { zh: "物品", en: "Item" },
    
    
    
            // ── 购物车内容 ──
            "shortage_n": { zh: "缺{0}", en: "Need {0}" },
    
    
    
            // ── 摘要面板 ──
            "summary_missing": { zh: "缺 {0} 种 / {1} 件", en: "{0} types / {1} pcs short" },
            "summary_sufficient": { zh: "材料充足", en: "Materials sufficient" },
            "add_to_cart": { zh: "加入购物清单", en: "Add to Shopping List" },
            "plan_count_label": { zh: "计划次数", en: "Planned actions" },
            "data_layer_tag": { zh: "⚡数据层", en: "⚡DataLayer" },
            "artisan_tag": { zh: "工匠-{0}%", en: "Artisan-{0}%" },
            "has_plan_tag": { zh: "已有计划", en: "Has Plan" },
            "create_plan_chk": { zh: "建计划", en: "Create plan" },
            "toast_plan_completed": { zh: "✅ 计划完成：{0}", en: "✅ Plan completed: {0}" },
            // ── 计划库存锁定提示 ──
            "locked_badge": { zh: "🔒{0}", en: "🔒{0}" },
            "locked_hover_title": { zh: "已被其他计划锁定：", en: "Locked by other plans:" },
            "locked_hover_line": { zh: "  {0} · {1}", en: "  {0} · {1}" },
            "summary_locked_tag": { zh: "🔒锁 {0} 种", en: "🔒 {0} types locked" },
            "summary_locked_hover_item": { zh: "{0} · 共锁 {1}", en: "{0} · total {1} locked" },
            "summary_locked_hover_sub": { zh: "    · {0} · {1}", en: "    · {0} · {1}" },
    
    
            // ── 采购导航 ──
            "nav_short": { zh: "缺 {0}", en: "Need {0}" },
            "nav_done_chip": { zh: "✓ 已购齐", en: "✓ Done" },
            "nav_progress": { zh: "待购 {0} / {1}", en: "{0} / {1} left" },
            "nav_item_done": { zh: "✅ {0} 已购齐", en: "✅ {0} fulfilled" },
            "nav_next_label": { zh: "下一项：{0} ×{1}", en: "Next: {0} ×{1}" },
            "nav_next_btn": { zh: "采购下一个 ▶", en: "Next item ▶" },
            "nav_all_done": { zh: "🎉 购物清单全部购齐！", en: "🎉 All items purchased!" },
            "prefill_tag": { zh: "已预填", en: "Pre-filled" },
    
            // ── Toast 消息 ──
            "toast_plan_done": { zh: "✅ 制作计划完成：{0}", en: "✅ Crafting plan done: {0}" },
            "toast_auto_removed": { zh: "已自动移除 {0} 种已补齐的物品", en: "Auto-removed {0} fulfilled item(s)" },
            "toast_refill_one": { zh: "「{0}」库存不足，已自动回填缺料", en: '"{0}" stock low, auto-refilled shortage' },
            "toast_refill_multi": { zh: "「{0}」等 {1} 种物品库存不足，已自动回填", en: '"{0}" and {1} other item(s) low, auto-refilled' },
            "toast_all_fulfilled": { zh: "购物清单已全部补齐，自动收起", en: "All items fulfilled, auto-collapsed" },
            "toast_no_missing": { zh: "当前没有需要补充的材料", en: "No materials needed" },
            "toast_no_id": { zh: "缺料已识别，但未拿到可加入清单的物品ID", en: "Shortage found but no valid item IDs" },
            "toast_added_skipped": { zh: "已加入 {0} 种，跳过 {1} 种无ID物品", en: "Added {0}, skipped {1} (no ID)" },
            "toast_added": { zh: "已加入购物清单：{0} 种，数量 {1}", en: "Added to list: {0} types, qty {1}" },
    
            // ── 状态/日志 ──
            "action_added_to_cart": { zh: "已将缺料加入购物清单", en: "Added shortage to shopping list" },
            "action_calculated": { zh: "已计算缺料：{0} 种，{1}", en: "Calculated: {0} types, {1} short" },
            "action_sufficient": { zh: "已计算缺料：材料充足", en: "Calculated: materials sufficient" },
            "action_startup": { zh: "v{0} 已启动（{1}，{2}，{3}，数据源:{4}），等待打开制作/房屋/市场弹窗", en: "v{0} started ({1}, {2}, {3}, src:{4}), waiting for panel" },
            "ws_exact": { zh: "WS精确", en: "WS" },
            "ws_waiting": { zh: "等待WS", en: "WS pending" },
            "dl_ok": { zh: "数据层✓", en: "DataLayer✓" },
            "dl_fallback": { zh: "DOM回退", en: "DOM fallback" },
            "plans_n": { zh: "{0}计划", en: "{0} plans" },
            "no_plans": { zh: "无计划", en: "No plans" },
            "cache": { zh: "缓存", en: "cache" },
    
    
    
            // ── Z-score 安全边际 ──
            "zscore_tag": { zh: "备料 {0}", en: "Buffer {0}" },
            "zscore_hover": { zh: "期望 {0} + 余量 {1} = {2}", en: "Expected {0} + margin {1} = {2}" },
    
            // ── 余量标记 ──
            "surplus_n": { zh: "余{0}", en: "+{0}" },
    
            // ── 配方链递归解算 ──
            "add_chain": { zh: "加入全链材料", en: "Add Full Chain" },
            "chain_title": { zh: "升级链 ({0}步)", en: "Upgrade Chain ({0} steps)" },
            "chain_current": { zh: "当前", en: "Current" },
            "chain_step_from": { zh: "升级自", en: "From" },
            "chain_tail": { zh: "链尾", en: "Base" },
            "toast_chain_added": { zh: "已加入完整配方链：{0} 种原始材料，数量 {1}", en: "Added full chain: {0} leaf materials, qty {1}" },
    
    
    
    
            // ── Next item 快捷键 ──
            "shortcut_hint_set_title": { zh: "当前快捷键，点击修改", en: "Current shortcut, click to edit" },
            "shortcut_hint_unset": { zh: "未设置快捷键", en: "No shortcut" },
            "shortcut_hint_unset_title": { zh: "点击进入设置面板", en: "Click to open settings" },
            "toast_shortcut_set": { zh: "快捷键已设置：{0}", en: "Shortcut set: {0}" },
        };
    
        /**
         * 翻译函数：根据当前语言获取翻译文本，支持 {0}, {1}... 占位符
         * @param {string} key - 翻译键
         * @param {...any} args - 占位符参数
         * @returns {string}
         */
        function t(key, ...args) {
            const entry = _I18N[key];
            if (!entry) return key;
            let text = entry[_currentLang] || entry["zh"] || key;
            for (let i = 0; i < args.length; i++) {
                text = text.replace(`{${i}}`, String(args[i] ?? ""));
            }
            return text;
        }
    
    
        /**
         * §02 全局运行时状态(上帝对象,拆解进行中)
         * 仅按三组重排字段书写顺序并标注归属,字段名与初值不变。
         *   [D] 领域数据  → 后续迁入 Store
         *   [S] 设置开关  → 后续迁入 Settings schema(经 saveToggles/loadToggles 持久化)
         *   [R] 运行时/UI → 后续留在 UI / Guard 区局部变量
         */
        const STATE = {
            // ── [D] 领域数据 ─────────────────────────────────────────────
            cart: new Map(),              // 购物车内容（itemId → CartRow）
            craftingPlans: new Map(),     // 制作计划（actionHrid → Plan）
            // ── [S] 设置开关(持久化于 SCRIPT.togglesKey) ────────────────
            craftingPlansEnabled: true,   // 制作计划功能开关
            locateEnabled: true,          // 市场定位开关
            includeUpgrade: true,         // 是否包含升级物品缺料
            inventorySyncEnabled: true,   // 库存同步开关
            autoCollapseEnabled: true,    // 自动收起开关
            autoPrefillEnabled: true,     // 市场弹窗自动预填数量
            purchaseNavEnabled: true,     // 采购导航条
            zScoreIndex: 0,               // 备料余量档位（Z_OPTIONS 索引）
            zScoreThreshold: 10,          // 备料余量起算次数：行动次数 > 此值才补料；以内按实际向上取整
            guzzlingPouchLevel: -1,       // -1 = 自动检测；0-20 = 手动指定
            priceEnabled: true,           // 价格显示开关
            cartTotalEnabled: true,       // 购物车总价显示开关
            questPanelEnabled: true,      // 任务追踪功能开关
            nextItemShortcut: null,       // {code, display, ctrl, shift, alt, meta} | null
            edgeZoneWidth: 10,            // -右缘热区宽度 px;0=禁用热区(只留小手柄)
            // ── [R] 运行时 / UI 状态(不持久化) ──────────────────────────
            currentModal: null,           // 当前检测到的弹窗 DOM
            currentData: null,            // 当前提取的缺料数据
            lastDataSignature: "",        // 上次数据签名（用于跳过相同数据的重绘）
            refreshTimer: null,           // 刷新定时器 ID
            lastAction: "",               // 状态栏文字
            suppressObserverDepth: 0,     // Observer 抑制深度计数
            enhCooldownUntil: 0,          // 强化面板重建冷却期截止时间戳
            lastNonEmptyModal: null,      // 上一个有有效数据的 modal DOM 引用
            observer: null,               // 全局 MutationObserver
            gameRootObserved: null,       // 主 observer 当前所挂的节点(现固定为 document.body)
            marketTargetItemId: "",       // 当前市场定位目标物品 ID
            marketMatchCount: 0,          // 市场定位匹配数
            marketPanelVisible: false,    // 市场面板是否可见
            manualActionCount: 1,         // 手动行动次数
            chainTreeOpen: false          // 升级链树是否展开
        };
    
        let _fiberHostCache = null;         // React Fiber 宿主缓存（用于调用 goToMarketplace）
        let _fiberHostCachedAt = 0;         // 缓存时间戳
        const FIBER_CACHE_TTL = 15000;      // Fiber 缓存过期时间（ms）
        const FIBER_MAX_DEPTH = 300;        // Fiber 树遍历最大深度
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §02A Store —— 领域数据订阅中心
        //     目标:业务函数改完数据后只调 Store.notify(主题),UI 自行订阅重绘,
        //           实现内核与界面解耦(完成接线)。
        //     设计约束:
        //       · 数据本体暂仍存于 STATE / _wsInventory / _marketDataCache;
        //         Store 先只提供"通知通道 + 统一只读入口",零引用改动 = 零破坏风险
        //       · 不引入任何外部库;监听器逐个 try/catch,单个出错不波及其余
        // ════════════════════════════════════════════════════════════════════════
        const Store = (() => {
            /** topic → Set<fn> */
            const _listeners = new Map();
            /** 合法主题(写错主题名 console.warn 提示,便于排查) */
            const TOPICS = ["cart", "plans", "quests", "inventory", "prices", "settings", "ui", "theme"];
    
            function _assertTopic(topic) {
                if (!TOPICS.includes(topic)) console.warn("[mwi-mm][Store] 未知主题:", topic);
            }
    
            /** 订阅;返回退订函数 */
            function subscribe(topic, fn) {
                _assertTopic(topic);
                if (!_listeners.has(topic)) _listeners.set(topic, new Set());
                _listeners.get(topic).add(fn);
                return () => { _listeners.get(topic)?.delete(fn); };
            }
    
            /** 通知该主题的全部监听器 */
            function notify(topic, payload) {
                _assertTopic(topic);
                const set = _listeners.get(topic);
                if (!set || set.size === 0) return;
                for (const fn of set) {
                    try { fn(payload); } catch (err) {
                        console.warn("[mwi-mm][Store] 监听器异常:", topic, err);
                    }
                }
            }
    
            return {
                TOPICS, subscribe, notify,
                // ── 统一只读入口(当前委托既有数据源;后续数据迁移时调用方无感) ──
                get cart() { return STATE.cart; },
                get plans() { return STATE.craftingPlans; },
                /** 调试:各主题当前监听器数量 */
                _debug() {
                    const out = {};
                    for (const [k, v] of _listeners) out[k] = v.size;
                    return out;
                }
            };
        })();
        console.info("[mwi-mm] §02A Store 已接线(主题 cart/ui/plans/quests)");
    
        // ════════════════════════════════════════════════════════════════════════
        // §02B 设置 Schema
        //     声明式设置表:§07 的 saveToggles / loadToggles 据此通用读写。
        //     持久化键、JSON 字段名与顺序、各字段校验语义与旧版 完全一致。
        //     UI 标签/描述暂仍在 §10 旧 UI 与 i18n;新 UI 落地时再并入本表。
        //     validate 仅在 loadToggles 执行时调用,可安全引用其后定义的常量(如 Z_OPTIONS)。
        // ════════════════════════════════════════════════════════════════════════
        const SETTINGS_SCHEMA = [
            { key: "locateEnabled",        type: "bool" },                                                  // 市场定位
            { key: "includeUpgrade",       type: "bool" },                                                  // 含升级物品
            { key: "inventorySyncEnabled", type: "bool" },                                                  // 库存同步
            { key: "autoCollapseEnabled",  type: "bool" },                                                  // 自动收起
            { key: "autoPrefillEnabled",   type: "bool" },                                                  // 市场预填
            { key: "purchaseNavEnabled",   type: "bool" },                                                  // 采购导航
            { key: "craftingPlansEnabled", type: "bool" },                                                  // 制作计划
            { key: "questPanelEnabled",    type: "bool" },                                                  // 任务追踪
            { key: "zScoreIndex",          type: "num", validate: v => v >= 0 && v < Z_OPTIONS.length },    // 备料余量档位
            { key: "zScoreThreshold",      type: "num", validate: v => v >= 1 && v <= 1000000 },            // 备料余量起算次数
            { key: "guzzlingPouchLevel",   type: "num", validate: v => v >= -1 && v <= 20 },                // 暴饮袋等级
            { key: "priceEnabled",         type: "bool" },                                                  // 价格显示
            { key: "cartTotalEnabled",     type: "bool" },                                                  // 总价显示
            { key: "nextItemShortcut",     type: "shortcut" },                                              // 下一项快捷键
            { key: "edgeZoneWidth",        type: "num", validate: v => v >= 0 && v <= 24 }                  // 热区宽度
        ];
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §03 公共 API window.MWIMM
        //     apiVersion 兼容承诺:对外字段与方法签名不得改变
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 公共 API（window.MWIMM）────────────────────────────
        //   暴露给其他 userscript / 插件使用。详见脚本顶部的注释文档。
        //   所有方法都做了 try/catch 防御，绝不抛异常打断调用方。
        //   写操作复用内部的 _addToCartCore / saveCart / Store.notify 路径，
        //   保证 UI、持久化、库存同步与人工操作完全一致。
        const _apiInternal = {
            handlers: { "ready": [], "cart:change": [] },
            fireDepth: 0,
    
            fire(event, dataOrFn) {
                const list = this.handlers[event];
                if (!list || !list.length) return;
                // 简单的重入保护，避免监听器内同步触发再触发导致栈溢出
                if (this.fireDepth > 4) {
                    console.warn("[mwi-mm] API event re-entry depth exceeded, dropping:", event);
                    return;
                }
                const data = (typeof dataOrFn === "function") ? (() => { try { return dataOrFn(); } catch (e) { return null; } })() : dataOrFn;
                this.fireDepth++;
                try {
                    // 复制一份再迭代，防止监听器在回调中调 off() 改动数组
                    const snapshot = list.slice();
                    for (const fn of snapshot) {
                        try { fn(data); } catch (e) { console.error("[mwi-mm] API handler error (" + event + "):", e); }
                    }
                } finally {
                    this.fireDepth--;
                }
            },
    
            markReady() {
                if (_publicAPI.ready) return;
                _publicAPI.ready = true;
                this.fire("ready", { version: SCRIPT.version, apiVersion: 1 });
            }
        };
    
        function _apiSnapshotRow(row) {
            if (!row) return null;
            return {
                itemId: row.itemId,
                name: resolveCartDisplayName(row),
                quantity: Number(row.quantity || 0),
                starred: !!row.starred,
                threshold: (typeof row.threshold === "number" && row.threshold > 0) ? row.threshold : null,
                source: row.source || null,
                updatedAt: row.updatedAt || null
            };
        }
    
        const _publicAPI = {
            version: SCRIPT.version,
            apiVersion: 1,
            ready: false,
    
            // ── 购物车读取 ──
            getCartItems() {
                try {
                    const out = [];
                    for (const row of STATE.cart.values()) {
                        const snap = _apiSnapshotRow(row);
                        if (snap) out.push(snap);
                    }
                    return out;
                } catch (e) { console.error("[mwi-mm] API getCartItems error:", e); return []; }
            },
    
            getCartItem(itemId) {
                try {
                    const id = normalizeCartItemId(itemId);
                    if (!id) return null;
                    return _apiSnapshotRow(STATE.cart.get(id));
                } catch (e) { console.error("[mwi-mm] API getCartItem error:", e); return null; }
            },
    
            hasCartItem(itemId) {
                try {
                    const id = normalizeCartItemId(itemId);
                    return id ? STATE.cart.has(id) : false;
                } catch (e) { return false; }
            },
    
            getCartCount() {
                try { return STATE.cart.size; } catch (e) { return 0; }
            },
    
            // ── 购物车写入 ──
            addToCart(itemOrArray) {
                try {
                    const items = Array.isArray(itemOrArray) ? itemOrArray : [itemOrArray];
                    let added = 0, skipped = 0;
                    for (const item of items) {
                        if (!item || typeof item !== "object") { skipped++; continue; }
                        if (_addToCartCore({
                            itemId: item.itemId,
                            name: item.name,
                            iconRef: item.iconRef,
                            quantity: item.quantity,
                            source: item.source || "api"
                        })) added++;
                        else skipped++;
                    }
                    if (added > 0) { saveCart(); Store.notify("cart"); }
                    return { ok: true, added, skipped };
                } catch (e) {
                    console.error("[mwi-mm] API addToCart error:", e);
                    return { ok: false, error: String(e), added: 0, skipped: 0 };
                }
            },
    
            setCartItemQuantity(itemId, qty) {
                try {
                    const id = normalizeCartItemId(itemId);
                    if (!id) return { ok: false, reason: "invalid_itemId" };
                    const n = Number(qty);
                    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "invalid_quantity" };
                    const row = STATE.cart.get(id);
                    if (n <= 0) {
                        if (!row) return { ok: true };
                        if (row.starred) row.quantity = 0;
                        else STATE.cart.delete(id);
                    } else if (row) {
                        row.quantity = n;
                        row.baselineStock = getInventoryCount(id);
                        row.updatedAt = nowIso();
                        row._manualOverrideUntil = Date.now() + 5 * 60 * 1000;
                    } else {
                        // 新增：直接借用 _addToCartCore（不存在时会以 quantity = n 插入）
                        _addToCartCore({ itemId: id, quantity: n, source: "api" });
                    }
                    saveCart(); Store.notify("cart");
                    return { ok: true };
                } catch (e) {
                    console.error("[mwi-mm] API setCartItemQuantity error:", e);
                    return { ok: false, error: String(e) };
                }
            },
    
            removeFromCart(itemId) {
                try {
                    const id = normalizeCartItemId(itemId);
                    if (!id) return { ok: false, reason: "invalid_itemId" };
                    if (!STATE.cart.has(id)) return { ok: false, reason: "item_not_found" };
                    STATE.cart.delete(id);
                    saveCart(); Store.notify("cart");
                    return { ok: true };
                } catch (e) {
                    console.error("[mwi-mm] API removeFromCart error:", e);
                    return { ok: false, error: String(e) };
                }
            },
    
            clearCart(opts) {
                try {
                    const includeStarred = !!(opts && opts.includeStarred);
                    if (includeStarred) {
                        STATE.cart.clear();
                    } else {
                        for (const [id, row] of STATE.cart) {
                            if (!row.starred) STATE.cart.delete(id);
                        }
                    }
                    saveCart(); Store.notify("cart");
                    return { ok: true };
                } catch (e) {
                    console.error("[mwi-mm] API clearCart error:", e);
                    return { ok: false, error: String(e) };
                }
            },
    
            // ── 物品/市场辅助 ──
            resolveItemName(itemId) {
                try {
                    const id = normalizeCartItemId(itemId);
                    if (!id) return "";
                    if (_dataLayer && _dataLayer.ready) {
                        const name = _dataLayer.hridToName("/items/" + id);
                        if (name) return name;
                    }
                    const row = STATE.cart.get(id);
                    return row ? (row.name || id) : id;
                } catch (e) { return ""; }
            },
    
            openMarketplace(itemId) {
                try {
                    const id = normalizeCartItemId(itemId);
                    if (!id) return false;
                    return openMarketplaceByCore(id) === true;
                } catch (e) { console.error("[mwi-mm] API openMarketplace error:", e); return false; }
            },
    
            normalizeItemId(itemId) {
                try { return normalizeCartItemId(itemId); } catch (e) { return ""; }
            },
    
            // ── 事件 ──
            on(event, handler) {
                try {
                    if (!_apiInternal.handlers[event] || typeof handler !== "function") return false;
                    _apiInternal.handlers[event].push(handler);
                    // 已经 ready 时为 'ready' 监听器立即派发一次（晚到的监听器也能收到）
                    if (event === "ready" && _publicAPI.ready) {
                        try { handler({ version: SCRIPT.version, apiVersion: 1 }); }
                        catch (e) { console.error("[mwi-mm] API late ready handler error:", e); }
                    }
                    return true;
                } catch (e) { return false; }
            },
    
            off(event, handler) {
                try {
                    const list = _apiInternal.handlers[event];
                    if (!list) return false;
                    const idx = list.indexOf(handler);
                    if (idx === -1) return false;
                    list.splice(idx, 1);
                    return true;
                } catch (e) { return false; }
            }
        };
    
        // ── 内置自检(调试用;双下划线前缀 = 不属于稳定 API 面)──
        //    全部检查只读无副作用:不写 localStorage、不动购物车、不触发渲染主题。
        //    用法:F12 控制台执行 MWIMM.__selftest()
        _publicAPI.__selftest = function () {
            const results = [];
            const check = (name, fn) => {
                try {
                    const v = fn();
                    results.push({ 项目: name, 结果: v === true ? "✓" : "✗", 备注: v === true ? "" : String(v) });
                } catch (err) { results.push({ 项目: name, 结果: "✗", 备注: String(err) }); }
            };
            check("Store 订阅/通知/退订", () => {
                let hits = 0;
                const un = Store.subscribe("settings", () => { hits++; });
                Store.notify("settings"); un(); Store.notify("settings");
                return hits === 1 || ("命中 " + hits + " 次(期望 1)");
            });
            check("parseCompactNumber", () =>
                (parseCompactNumber("1.2k") === 1200 && parseCompactNumber("3,500") === 3500
                 && parseCompactNumber("∞") === Infinity) || "解析结果异常");
            check("normalizeCartItemId", () =>
                (normalizeCartItemId("/items/cheese") === "cheese" && normalizeCartItemId("#milk") === "milk")
                || "归一化异常");
            check("formatQty", () => (formatQty(1234) === "1234" && formatQty(1.5) === "1.5") || "格式化异常");
            check("设置 Schema 序列化往返", () => {
                const out = {};
                for (const def of SETTINGS_SCHEMA) out[def.key] = STATE[def.key];
                const back = JSON.parse(JSON.stringify(out));
                for (const def of SETTINGS_SCHEMA) {
                    if (JSON.stringify(back[def.key]) !== JSON.stringify(STATE[def.key])) return def.key + " 不一致";
                }
                return true;
            });
            check("Actions 完整性", () =>
                Object.values(Actions).every(f => typeof f === "function") || "存在非函数项");
            check("防注入·textWithoutInjected", () => {
                // 离体 DOM,只读自检:模拟第三方插件往游戏数量元素里注入金额文本
                const host = document.createElement("div");
                host.className = "SkillActionDetail_inputCount__26AOJ";
                host.appendChild(document.createTextNode("0 / 4 "));
                const evil = document.createElement("span");
                evil.className = "thirdparty-price";
                evil.textContent = "57,419,680,725";
                host.appendChild(evil);
                const txt = textWithoutInjected(host);
                if (/57/.test(txt)) return "注入金额未被剔除: " + txt;
                if (!/4/.test(txt)) return "游戏自有文本被误删: " + txt;
                return true;
            });
            check("防注入·readActionCount 钳制", () => {
                const modal = document.createElement("div");
                const box = document.createElement("div");
                box.className = "SkillActionDetail_maxActionCountInput__3pKt0";
                const evil = document.createElement("span");
                evil.className = "profit-injected";
                evil.textContent = "143,459,201,800";
                box.appendChild(evil);
                modal.appendChild(box);
                const r = readActionCount(modal);
                return (r.value === 1 && !r.infinite) || ("期望回退为 1,实得 " + r.value);
            });
            check("防注入·行级钳制 rowLooksSane", () =>
                (rowLooksSane(100, 4) === true && rowLooksSane(57419680725 * 10000, 4) === false
                 && rowLooksSane(100, 57419680725) === false && rowLooksSane(-5, 4) === false)
                || "钳制判定异常");
            check("需求量·原生每次消耗+Toolkit 总量兼容", () => {
                // 游戏原生库存/每次消耗：0 / 8.9 先四舍五入为每次 9，
                // 行动 50 次时总需求必须为 450。
                const recipe = resolveNeed("0 / 8.9", 50);
                if (recipe.totalNeeded !== 450 || recipe.needPerAction !== 9 || recipe.stockOverride !== 0) {
                    return "原生配方解析失败:" + JSON.stringify(recipe);
                }
                // Toolkit 把 inputCount 改写成 "␣/ 302K␣"(截断、库存抹掉);
                // 右侧按总量处理(防平方爆炸);K 截断经整数吸附重建精确总量。
                const r = resolveNeed("\u00A0/ 302K\u00A0", 151096);   // 截图实测场景
                if (r.totalNeeded !== 302192) return "totalNeeded=" + r.totalNeeded + "(期望吸附重建为 302192)";
                if (r.needPerAction !== 2) return "needPerAction=" + r.needPerAction + "(期望 2)";
                const native = resolveNeed("1,434 / 4", 1);
                if (!(native.totalNeeded === 4 && native.stockOverride === 1434)) return "原生格式回归失败";
                const exact = resolveNeed("\u00A0/ 302,192\u00A0", 151096);
                return exact.totalNeeded === 302192 || "无后缀精确值被误吸附";
            });
            check("材料列·忽略第三方无 ID 伪装行", () => {
                const host = document.createElement("div");
                for (const id of ["ginkgo_lumber", "redwood_lumber", "arcane_lumber"]) {
                    const real = document.createElement("div");
                    real.className = "Item_itemContainer__test";
                    real.innerHTML = `<svg><use href="/static/items.svg#${id}"></use></svg>`;
                    host.appendChild(real);
                    const injected = document.createElement("div");
                    injected.className = "Item_itemContainer__test";
                    injected.textContent = "需要:450个";
                    host.appendChild(injected);
                }
                const rows = _pickRequirementItemRows(host);
                const ids = rows.map((row) => normalizeItemId(extractIconRef(row)));
                return (rows.length === 3 && ids.join(",") === "ginkgo_lumber,redwood_lumber,arcane_lumber")
                    || ("筛选结果异常:" + ids.join(","));
            });
            results.push({ 项目: "主题令牌", 结果: "ℹ", 备注: "内置暗色(固定)" });
            results.push({ 项目: "状态报告", 结果: "ℹ", 备注:
                "dataLayer:" + (_dataLayer.ready ? "✓" : "…") + " ws:" + (_wsInventory.ready ? "✓" : "…")
                + " cart:" + STATE.cart.size + " plans:" + STATE.craftingPlans.size
                + " ver:" + SCRIPT.version });
            try { console.table(results); } catch (err) { console.log(results); }
            const fails = results.filter(r => r.结果 === "✗").length;
            console.info("[mwi-mm] __selftest 完成:" + (fails === 0 ? "全部通过" : fails + " 项失败"));
            return results;
        };
    
        // ── log 导出(调试用;只读)── F12 执行 MWIMM.__log(),全选复制输出贴给作者
        _publicAPI.__log = function () {
            const lines = [];
            try {
                lines.push("══════ MWI 市场伴侣 log ══════");
                lines.push("版本 " + SCRIPT.version + " | 导出于 " + new Date().toISOString() + " | 启动后 " + ((Date.now() - _log._t0) / 1000).toFixed(0) + "s");
                lines.push("UA " + String(navigator.userAgent).slice(0, 120));
                try {
                    const st = {};
                    for (const f of SETTINGS_SCHEMA) st[f.key] = STATE[f.key];
                    lines.push("设置 " + JSON.stringify(st));
                } catch (e) { lines.push("设置 <读取失败:" + e.message + ">"); }
                try {
                    lines.push("数据层 ready=" + _dataLayer.ready + " | 缓存诊断=" + JSON.stringify(_dataLayer._cacheReadDiag || null));
                } catch (e) { lines.push("数据层 <读取失败>"); }
                try {
                    lines.push("看门狗 ticks=" + _wdTicks + " | 快捷键最近收键 " + (_shortcutManager._lastKeySeenAt ? ((Date.now() - _shortcutManager._lastKeySeenAt) / 1000).toFixed(0) + "s 前" : "(无)") + " | window.mwi=" + (typeof window.mwi !== "undefined"));
                } catch (e) { /* ignore */ }
                lines.push("—— 事件流水(重复折叠为 ×N)——");
                lines.push(_log.dump() || "(空)");
                lines.push("══════ 记录结束 ══════");
            } catch (e) { lines.push("<导出异常:" + (e && e.message) + ">"); }
            const out = lines.join("\n");
            console.log(out);
            return out;
        };
    
        // ── 提取路径体检(调试用;只读)── F12 执行 MWIMM.__probe()
        //    回答「当前面板的徽章数字走的哪条路径,数据层为什么没接住」。
        //    数据层路径用游戏内部精确值(免疫第三方 DOM 改写);DOM 回退路径解析屏上文本,
        //    遇 MWI_Toolkit 截断格式(302,192→"302K")会有 <1K 的尾数偏差(吸附已大幅缓解)。
        _publicAPI.__probe = function () {
            try {
                const modal = findActiveModal();
                if (!modal) { console.info("[mwi-mm] __probe: 当前无可见技能详情面板(制作/炼金/强化)"); return null; }
                const ctx = resolveActionContext(modal);
                const report = {
                    标题: _extractPanelTitle(modal),
                    行动识别: ctx ? { actionHrid: ctx.actionHrid, function: ctx.fn, 来源: "React Fiber" } : { 来源: "Fiber 失败,回退 DOM 类名: " + (_inferFunctionFromDom(modal) || "未知") },
                    数据层就绪: _dataLayer.ready, WS库存就绪: _wsInventory.ready,
                    次数读取: readActionCount(modal),
                };
                const data = extractRequirements(modal);
                report.实际路径 = data._dataLayerUsed ? "数据层(精确)" : "DOM(解析屏上文本)";
                report.行数 = (data.requirements || []).length;
                report.缺料 = (data.missingList || []).map(r => (r.name || r.itemId) + ":" + formatQty(r.missingRounded));
                if (!data._dataLayerUsed && _dataLayer.ready && (!ctx || ctx.fn === "/action_functions/production")) {
                    const trace = [];
                    try { _buildRequirementsFromData(modal, trace, ctx); } catch (err) { trace.push("抛异常: " + err); }
                    report.数据层放弃原因 = trace.length ? trace : ["(未触发任何放弃点,请截图回报)"];
                } else if (!_dataLayer.ready) {
                    // 现场重试一次缓存读取,带回逐级解码诊断
                    const cached = _readClientDataFromCache();
                    if (cached && !_capturedClientData) _capturedClientData = cached;
                    report.缓存诊断 = _cacheReadDiag || "(未执行)";
                    report.数据源 = {
                        WS截获: Boolean(_capturedClientData?.actionDetailMap),
                        全局LZString: typeof LZString !== "undefined",
                        "window.mwi": Boolean(window.mwi?.initClientData?.actionDetailMap)
                    };
                    if (cached || _capturedClientData?.actionDetailMap) {
                        report.数据层放弃原因 = ["缓存现已可读,尝试就地初始化: " + (_dataLayer.ensureReady() ? "✓ 成功(重新打开面板生效)" : "init 失败,见上方诊断")];
                    } else {
                        report.数据层放弃原因 = ["三个数据源均不可用,逐级诊断见「缓存诊断」"];
                    }
                }
                console.info("[mwi-mm] __probe:", report);
                return report;
            } catch (err) { console.warn("[mwi-mm] __probe:", err); }
        };
    
        // ── 快捷键体检(调试用;只读不抢键)── F12 执行 MWIMM.__key()
        //    20 秒内每次按键打印完整决策链,定位「为什么没触发」:
        //    录制中? / 快捷键已设? / 已装填(购齐横幅)? / 焦点元素? / code+修饰键匹配?
        _publicAPI.__key = function (seconds = 20) {
            try {
                const until = Date.now() + seconds * 1000;
                const probe = (e) => {
                    if (Date.now() > until) { window.removeEventListener("keydown", probe, true); console.info("[mwi-mm] __key 体检结束"); return; }
                    const s = STATE.nextItemShortcut;
                    const ae = document.activeElement;
                    const aeTag = ae ? (ae.tagName + (ae.isContentEditable ? "(可编辑)" : "")) : "无";
                    const inputFocused = Boolean(ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable));
                    const armedId = _shortcutManager._armedNextItemId;
                    const cartRow = armedId ? STATE.cart.get(armedId) : null;
                    const verdict = _shortcutManager._captureMode ? "✗ 录制中(抑制触发)"
                        : !s ? "✗ 未设置快捷键"
                        : !armedId ? "✗ 未装填 —— 需要先出现「已购齐→下一个」横幅(购齐事件)"
                        : inputFocused ? "✗ 焦点在输入框/编辑器,设计放行不抢键"
                        : !_shortcutManager._matches(e, s) ? ("✗ 按键不匹配(按下 " + e.code + ",已设 " + s.code + ")")
                        : (!cartRow || cartRow.quantity <= 0) ? ("△ 五门已过但装填目标已过期(清单无 " + armedId + " 或数量为0)—— 会自愈改跳,留意上一行日志")
                        : "✓ 应当触发(若仍未跳转,看「管理器收键」与控制台是否有跳转失败告警)";
                    // defaultPrevented = 触发监听器已抢键的铁证;心跳戳证明监听器在线
                    // 检出窗口层失联即就地重挂(自愈),并播报重挂计数
                    const handled = e.defaultPrevented;
                    const seen = _shortcutManager._lastKeySeenAt && (Date.now() - _shortcutManager._lastKeySeenAt < 500);
                    if (!seen) {
                        try { _shortcutManager._ensureListener(); } catch (err) { /* ignore */ }
                        console.warn("[mwi-mm] __key: 检出监听器失联,已就地重挂(累计第 " + _shortcutManager._repinCount + " 次),请再按一次验证");
                    }
                    console.info("[mwi-mm] __key:", { 按下: e.code, 修饰: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey }, 已设: s ? s.code : null, 已装填: armedId || null, 装填目标在清单: Boolean(cartRow && cartRow.quantity > 0), 焦点: aeTag, 管理器收键: seen ? "✓" : "✗(已自动重挂)", 已抢键preventDefault: handled, 重挂计数: _shortcutManager._repinCount, 判定: verdict });
                };
                window.addEventListener("keydown", probe, true);
                console.info("[mwi-mm] __key 体检开始:" + seconds + " 秒内按任意键查看决策链(建议在购齐横幅出现后按你设的快捷键)");
                return { 已设: STATE.nextItemShortcut, 已装填: _shortcutManager._armedNextItemId || null };
            } catch (err) { console.warn("[mwi-mm] __key:", err); }
        };
    
        // ── 新壳开关(调试用;不属于稳定 API 面)──
        //    MWIMM.__shell(false) 关闭并卸载新桌面壳;__shell(true) 开启并挂载;__shell() 查看状态
        _publicAPI.__shell = function (enable) {
            try {
                if (enable === true || enable === false) {
                    // 仅会话级挂卸(调试用,不再持久化;界面常驻)
                    if (enable) _newShell.init(); else _newShell.destroy();
                }
                return { mounted: Boolean(_newShell.host),
                         form: _newShell._form, detent: _newShell._detent,
                         edgeZoneWidth: STATE.edgeZoneWidth, ui: { ..._newShell._ui } };
            } catch (err) { console.warn("[mwi-mm] __shell:", err); }
        };
    
    
    
    
        // 立即挂到 window，让随后加载的其他脚本可检测到
        try {
            window.MWIMM = _publicAPI;
        } catch (e) {
            console.error("[mwi-mm] failed to expose window.MWIMM:", e);
        }
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §04 数据采集 Adapters
        //     _wsInventory / WS 截获游戏数据(LZ) / _marketDataCache / _wsDrinkSlots
        //     唯一允许接触游戏内部协议的区域;本区任何对外接口不得改变
        // ════════════════════════════════════════════════════════════════════════
    
        // ── WebSocket 精确库存追踪 ──────────────────────
        //   通过拦截 WebSocket 消息获取精确的物品库存，比 DOM 扫描更准确。
        //   改用 hash 主键存储 + 仅聚合 inventory 位置，
        //   修复强化场景中同 (itemHrid, enhLevel) 多条目互相覆盖导致库存归零的问题。
        const _wsInventory = {
            _hashMap: new Map(),    // hash → { itemHrid, itemLocationHrid, enhancementLevel, count }
            _detailMap: new Map(),  // hrid → Map<enhancementLevel, count>（仅 inventory 的聚合视图）
            ready: false,           // 是否已收到初始数据
            _callbacks: [],         // onChange 回调列表
    
            /** 初始化：清空并加载角色物品列表（init_character_data 时调用） */
            init(characterItems) {
                this._hashMap.clear();
                this._detailMap.clear();
                if (!Array.isArray(characterItems)) return;
                for (const item of characterItems) {
                    if (!item || !item.itemHrid) continue;
                    const key = item.hash || `${item.itemLocationHrid || ""}::${item.itemHrid}::${item.enhancementLevel || 0}`;
                    this._hashMap.set(key, {
                        itemHrid: item.itemHrid,
                        itemLocationHrid: item.itemLocationHrid || "",
                        enhancementLevel: item.enhancementLevel || 0,
                        count: item.count || 0,
                    });
                }
                this._rebuildDetailMap();
            },
    
            /** 增量更新：合并 endCharacterItems delta 到库存映射 */
            _patch(items) {
                if (!Array.isArray(items)) return;
                for (const item of items) {
                    if (!item || !item.itemHrid) continue;
                    const key = item.hash || `${item.itemLocationHrid || ""}::${item.itemHrid}::${item.enhancementLevel || 0}`;
                    this._hashMap.set(key, {
                        itemHrid: item.itemHrid,
                        itemLocationHrid: item.itemLocationHrid || "",
                        enhancementLevel: item.enhancementLevel || 0,
                        count: item.count || 0,
                    });
                }
                this._rebuildDetailMap();
            },
    
            /**
             * 从 hashMap 重建 detailMap（仅统计 inventory 位置的物品）
             * ★ 关键修复:
             *   1. 只统计背包中的物品，忽略装备栏/其他位置 → 防止装备覆盖背包库存
             *   2. 同 (hrid, level) 的多个 hash 条目累加 → 防止强化重置时新旧栈互相覆盖
             */
            _rebuildDetailMap() {
                this._detailMap.clear();
                for (const item of this._hashMap.values()) {
                    if (item.itemLocationHrid && item.itemLocationHrid !== "/item_locations/inventory") continue;
                    if (!this._detailMap.has(item.itemHrid)) {
                        this._detailMap.set(item.itemHrid, new Map());
                    }
                    const levels = this._detailMap.get(item.itemHrid);
                    const level = item.enhancementLevel || 0;
                    levels.set(level, (levels.get(level) || 0) + (item.count || 0));
                }
                this.ready = true;
                this._fireCallbacks();
            },
    
            /** 获取指定物品的基础等级（enhancementLevel=0）库存数 */
            getCount(rawItemId) {
                const bare = String(rawItemId || "").replace(/^\/items\//, "");
                const hrid = `/items/${bare}`;
                const levels = this._detailMap.get(hrid);
                if (!levels) return 0;
                return levels.get(0) || 0;
            },
    
            /**
             * 获取指定物品在所有位置中装备的最高强化等级
             * 用于查找非 inventory 的装备（如 guzzling_pouch 在 /item_locations/pouch）
             * 返回 -1 表示未找到
             */
            getEquippedLevel(itemHrid) {
                const hrid = itemHrid.startsWith("/items/") ? itemHrid : `/items/${itemHrid}`;
                let maxLevel = -1;
                for (const item of this._hashMap.values()) {
                    if (item.itemHrid !== hrid) continue;
                    if (item.count > 0 && item.enhancementLevel > maxLevel) {
                        maxLevel = item.enhancementLevel;
                    }
                }
                return maxLevel;
            },
    
            /** 导出库存快照（bareId → count），用于与 DOM 扫描方式统一接口 */
            getSnapshot() {
                const result = new Map();
                for (const [hrid, levels] of this._detailMap) {
                    const bareId = hrid.replace(/^\/items\//, "");
                    const count = levels.get(0) || 0;
                    if (count > 0) result.set(bareId, count);
                }
                return result;
            },
    
            /** 注册库存变更回调 */
            onChange(cb) {
                if (typeof cb === "function") this._callbacks.push(cb);
            },
    
            /** 触发所有注册的回调 */
            _fireCallbacks() {
                for (const cb of this._callbacks) {
                    try { cb(); } catch (e) { /* ignore */ }
                }
            }
        };
    
        // ── WS 截获的游戏数据（解除 Mooket 依赖）───────────
        let _capturedClientData = null;
    
        /** 最小化 LZString.decompressFromUTF16（MIT License, Copyright (c) pieroxy） */
        function _lzDecompressUTF16(input) {
            if (input == null || input === "") return "";
            const f = function (index) { return input.charCodeAt(index) - 32; };
            const length = input.length;
            const resetValue = 16384;
            let dictionary = [], enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", result = [], w, c, bits, resb, maxpower, power;
            let data = { val: f(0), position: resetValue, index: 1 };
            for (let i = 0; i < 3; i++) dictionary[i] = i;
            bits = 0; maxpower = Math.pow(2, 2); power = 1;
            while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) { data.position = resetValue; data.val = f(data.index++); }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
            }
            switch (bits) {
                case 0: bits = 0; maxpower = Math.pow(2, 8); power = 1;
                    while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = f(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                    c = String.fromCharCode(bits); break;
                case 1: bits = 0; maxpower = Math.pow(2, 16); power = 1;
                    while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = f(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                    c = String.fromCharCode(bits); break;
                case 2: return "";
            }
            dictionary[3] = c; w = c; result.push(c);
            while (true) {
                if (data.index > length) return "";
                bits = 0; maxpower = Math.pow(2, numBits); power = 1;
                while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = f(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                switch (c = bits) {
                    case 0: bits = 0; maxpower = Math.pow(2, 8); power = 1;
                        while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = f(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                        dictionary[dictSize++] = String.fromCharCode(bits); c = dictSize - 1; enlargeIn--; break;
                    case 1: bits = 0; maxpower = Math.pow(2, 16); power = 1;
                        while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = f(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                        dictionary[dictSize++] = String.fromCharCode(bits); c = dictSize - 1; enlargeIn--; break;
                    case 2: return result.join("");
                }
                if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
                if (dictionary[c]) entry = dictionary[c];
                else if (c === dictSize) entry = w + w.charAt(0);
                else return null;
                result.push(entry);
                dictionary[dictSize++] = w + entry.charAt(0);
                enlargeIn--;
                if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
                w = entry;
            }
        }
    
        /** 从 localStorage 读取 LZ 压缩的游戏初始化数据（initClientData）
         *  重写:旧实现是「全局 LZString 存在就只用它」——若页面全局是别的脚本留下的
         *  坏/不兼容实现,解出 null 后不会落到自带解压器,数据层整链失败(实测 __probe:
         *  数据层就绪=false,而 MWI_Toolkit 在自己沙箱用真库解同一份数据成功,证明数据无恙;
         *  自带解压器经 1.19MB 中文 JSON 镜像回归与真 lz-string 逐字节一致)。
         *  现改为逐级落穿:全局 LZString → 自带实现 → 明文 JSON,每级独立 try,
         *  并把每级结果记入 _cacheReadDiag 供 __probe 展示。 */
        let _cacheReadDiag = null;
        function _readClientDataFromCache() {
            const diag = { raw: null, steps: [] };
            _cacheReadDiag = diag;
            try {
                const raw = localStorage.getItem("initClientData");
                if (!raw) { diag.raw = "无(localStorage 键不存在)"; return null; }
                diag.raw = "存在,长度 " + raw.length;
                const tryParse = (json, tag) => {
                    if (!json || typeof json !== "string") { diag.steps.push(tag + ": 解压结果为空"); return null; }
                    if (json.charCodeAt(0) !== 123) { diag.steps.push(tag + ": 解压结果非 JSON(首字符 " + json.charCodeAt(0) + ")"); return null; }
                    try {
                        const parsed = JSON.parse(json);
                        if (parsed && parsed.actionDetailMap) { diag.steps.push(tag + ": ✓ 成功"); parsed._src = "localStorage(" + tag + ")"; return parsed; }
                        diag.steps.push(tag + ": JSON 可解析但无 actionDetailMap");
                        return null;
                    } catch (e) { diag.steps.push(tag + ": JSON.parse 失败 " + e); return null; }
                };
                // 1) 自带解压实现优先(确定性高于来历不明的页面全局)
                try {
                    const hit = tryParse(_lzDecompressUTF16(raw), "自带解压");
                    if (hit) return hit;
                } catch (e) { diag.steps.push("自带解压: 抛异常 " + e); }
                // 2) 页面全局 LZString 降级为兜底(自带实现万一失手时的第二意见)
                if (typeof LZString !== "undefined" && LZString.decompressFromUTF16) {
                    try {
                        const hit = tryParse(LZString.decompressFromUTF16(raw), "全局LZString");
                        if (hit) return hit;
                    } catch (e) { diag.steps.push("全局LZString: 抛异常 " + e); }
                } else { diag.steps.push("全局LZString: 不存在"); }
                // 3) 明文兜底(游戏将来若不压缩)
                try {
                    const hit = tryParse(raw, "明文JSON");
                    if (hit) return hit;
                } catch (e) { diag.steps.push("明文JSON: 抛异常 " + e); }
                return null;
            } catch (e) {
                diag.steps.push("外层异常: " + e);
                console.warn("[mwi-mm] localStorage initClientData 读取失败:", e);
                return null;
            }
        }
    
        // ── WS 市场数据缓存 ────────────────────────────────
        /** 市场订单簿缓存（WS 推送更新） */
        const _marketDataCache = {
            _cache: new Map(),   // itemHrid → { asks, bids, updatedAt }
            _callbacks: [],      // onChange 回调列表
    
            /** 更新指定物品的市场订单簿数据 */
            update(data) {
                if (!data?.marketItemOrderBooks) return;
                const { itemHrid, orderBooks } = data.marketItemOrderBooks;
                if (!itemHrid || !orderBooks?.[0]) return;
                const book = orderBooks[0];
                this._cache.set(itemHrid, {
                    asks: Array.isArray(book.asks) ? book.asks : [],
                    bids: Array.isArray(book.bids) ? book.bids : [],
                    updatedAt: Date.now()
                });
                this._fireCallbacks(itemHrid);
            },
    
            /** 按 hrid 获取缓存的订单簿 */
            get(itemHrid) { return this._cache.get(itemHrid) || null; },
            /** 按 bareId（不带 /items/ 前缀）获取 */
            getByBareId(bareId) { return this.get(`/items/${bareId}`); },
    
            /** 获取最低卖价挂单 */
            getBestAsk(itemHrid) {
                const data = this.get(itemHrid);
                if (!data?.asks?.length) return null;
                return data.asks.reduce((best, a) => (!best || a.price < best.price) ? a : best, null);
            },
    
            /** 获取最高买价挂单 */
            getBestBid(itemHrid) {
                const data = this.get(itemHrid);
                if (!data?.bids?.length) return null;
                return data.bids.reduce((best, b) => (!best || b.price > best.price) ? b : best, null);
            },
    
            /** 注册订单簿变更回调 */
            onChange(cb) { if (typeof cb === "function") this._callbacks.push(cb); },
    
            _fireCallbacks(itemHrid) {
                for (const cb of this._callbacks) {
                    try { cb(itemHrid); } catch (e) { /* ignore */ }
                }
            }
        };
    
        // ── WS 饮品插槽缓存（解除 React Fiber 依赖）─────────
        //   通过 WS 截获 actionTypeDrinkSlotsMap，替代脆弱的 React Fiber 访问。
        //   用于精确检测工匠茶（artisan_tea）是否在制作类技能的饮品栏中。
        const _wsDrinkSlots = {
            _map: {},  // actionType → ConsumableSlot[]（如 {"/action_types/crafting": [{itemHrid: "/items/artisan_tea", ...}]}）
    
            /** 从 init_character_data 初始化 */
            init(drinkSlotsMap) {
                if (drinkSlotsMap && typeof drinkSlotsMap === "object") {
                    this._map = drinkSlotsMap;
                }
            },
    
            /** 从 action_type_consumable_slots_updated 更新 */
            update(drinkSlotsMap) {
                if (drinkSlotsMap && typeof drinkSlotsMap === "object") {
                    this._map = drinkSlotsMap;
                }
            },
    
            /** 检查指定 actionType 是否装备了某种饮品 */
            hasDrink(actionType, itemHrid) {
                const slots = this._map[actionType];
                if (!Array.isArray(slots)) return false;
                return slots.some(s => s && s.itemHrid === itemHrid);
            },
    
            /** 获取指定 actionType 的饮品列表 */
            getSlots(actionType) {
                return this._map[actionType] || [];
            }
        };
    
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §04B 主题令牌
        //     运行时取色已整体移除:游戏按钮/弹窗采样在实战中不够稳定
        //     (accent 漂移等),正式版收敛为与游戏同系的内置暗色板。
        //     金色调为 #e8c87f(较 v1 的 #e9bf41 降饱和提亮度,可读性优先)。
        //     结构保留 ORDER / STATIC / tokens / init 供 §10A 消费,接口不变。
        // ════════════════════════════════════════════════════════════════════════
        const _themeProbe = {
            ORDER: ["pageBg", "panelBg", "cardBg", "line", "text", "textMut", "accent", "gold", "radius"],
            STATIC: {
                pageBg: "#1b1f30", panelBg: "#252a40", cardBg: "#333a57",
                line: "rgba(160,170,220,0.14)", text: "#eef0fa", textMut: "#a7aecf",
                accent: "#5667d6", gold: "#e8c87f", radius: "8px"
            },
            tokens: null, sources: null,
            init() {
                this.tokens = { ...this.STATIC };
                this.sources = {};
                for (const key of this.ORDER) this.sources[key] = "builtin";
            }
        };
    
        // ════════════════════════════════════════════════════════════════════════
        // §05 领域逻辑 Domain
        //     Z-score / _marketPrice / _craftingPlanTracker / _questTracker / _dataLayer / _recipeChain
        //     纯计算,不碰 DOM;后续可针对本区做 fixture 回放自检
        // ════════════════════════════════════════════════════════════════════════
    
        // ── Z-score 安全边际常量与计算模块 ──────────────────
        const Z_OPTIONS = [
            { z: 1.645, zh: "标准", en: "Standard", pct: "95%" },
            { z: 2.326, zh: "充足", en: "Ample",    pct: "99%" },
            { z: 3.090, zh: "十足", en: "Full",     pct: "99.9%" },
            { z: 0,     zh: "关闭", en: "Off",       pct: null }
        ];
    
        const ENHANCEMENT_BONUSES = [
            0.00, 0.02, 0.042, 0.066, 0.092, 0.12, 0.15, 0.182,
            0.216, 0.255, 0.29, 0.33, 0.372, 0.416, 0.462, 0.51,
            0.56, 0.612, 0.666, 0.722, 0.78
        ];
    
        const _zScoreCalc = {
            /**
             * 按工匠茶真实机制计算材料需求量（依据官方 Wiki：减料后每次需求 r=base×(1−p)，
             * 整数部分必耗，小数部分 f 是「多耗 1 个」的概率 → 每次消耗 ~ floor(r)+Bernoulli(f)）。
             * @param {number} base - 每次制作的单项基础材料消耗
             * @param {number} n    - 制作次数
             * @param {number} p    - 工匠茶节省比例
             * @param {number} z    - 余量 z 值（0 = 不补料，按期望向上取整）
             * @returns {{ expected: number, margin: number, total: number }}
             */
            calcMaterials(base, n, p, z) {
                if (n <= 0) return { expected: 0, margin: 0, total: 0 };
                if (p >= 1) return { expected: 0, margin: 0, total: 0 };
                const r = base * (1 - p);                 // 减料后每次需求（可能含小数）
                const expectedRaw = r * n;                // 期望总消耗
                const f = r - Math.floor(r);              // 小数部分 = Wiki「该项被消耗的概率」
                // 整数情形（f≈0，零波动）/ 无工匠 / z=0（次数未超阈值或关闭）→ 不补料，精确向上取整
                if (z <= 0 || p <= 0 || f < 1e-9) {
                    const val = Math.ceil(expectedRaw - 1e-9);
                    return { expected: val, margin: 0, total: val };
                }
                // 每次消耗为 floor(r)+Bernoulli(f)，N 次总方差 = n·f(1−f)
                const stddev = Math.sqrt(n * f * (1 - f));
                const margin = z * stddev;
                const cap = n * Math.ceil(r);             // 绝对上界：每次都顶格消耗 ceil(r)
                const total = Math.min(cap, Math.ceil(expectedRaw + margin));
                return { expected: Math.ceil(expectedRaw - 1e-9), margin: Math.ceil(margin), total };
            },
    
            /** 生成 hover 提示文字：「期望 472 + 余量 15 = 487」 */
            formatBreakdown(base, n, p, z) {
                const { expected, margin, total } = this.calcMaterials(base, n, p, z);
                return t("zscore_hover", expected, margin, total);
            },
    
            /** 获取当前激活的 Z 值 */
            getActiveZ() {
                return Z_OPTIONS[STATE.zScoreIndex]?.z || 0;
            },
    
            /** 次数门控：行动次数 ≤ 起算次数则不补料（返回 0），否则返回当前档位 z */
            _effectiveZ(n) {
                const thr = Number(STATE.zScoreThreshold) || 0;
                return (Number(n) > thr) ? this.getActiveZ() : 0;
            },
    
            /** 当前档位的本地化标签，如「标准(95%)」 */
            activeLabel() {
                const o = Z_OPTIONS[STATE.zScoreIndex];
                if (!o) return "";
                return (_currentLang === "zh" ? o.zh : o.en) + (o.pct ? "(" + o.pct + ")" : "");
            }
        };
    
        // ── 市场价格数据模块 ──────────────────────────────────
        const _marketPrice = {
            _cache: null,           // Map<bareId, { ask, bid, avg, vol }>
            _lastFetch: 0,
            _loading: false,
            _error: false,
            REFRESH_INTERVAL: 3600_000, // 1 小时
            FETCH_TIMEOUT: 15_000,      // ★ 网络超时（15秒）
            STORAGE_KEY: "mwi_mm_market_price_cache_v1", // ★ 持久化缓存键
    
            /** ★ 从 localStorage 恢复上次拉取的价格（页面刷新时免重新拉取） */
            _loadFromStorage() {
                try {
                    const raw = localStorage.getItem(this.STORAGE_KEY);
                    if (!raw) return false;
                    const parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== "object") return false;
                    const ts = Number(parsed.timestamp);
                    if (!Number.isFinite(ts) || Date.now() - ts >= this.REFRESH_INTERVAL) return false;
                    if (!Array.isArray(parsed.entries)) return false;
                    this._cache = new Map(parsed.entries);
                    this._lastFetch = ts;
                    console.log("[mwi-mm] Market prices loaded from localStorage:", this._cache.size, "items");
                    return true;
                } catch (e) {
                    console.warn("[mwi-mm] Market price cache restore failed:", e);
                    return false;
                }
            },
    
            /** ★ 写入 localStorage（忽略配额错误） */
            _saveToStorage() {
                if (!this._cache || !this._lastFetch) return;
                try {
                    const payload = JSON.stringify({
                        timestamp: this._lastFetch,
                        entries: [...this._cache.entries()]
                    });
                    localStorage.setItem(this.STORAGE_KEY, payload);
                } catch (e) {
                    // 超配额 / 隐私模式等场景安静失败，内存缓存仍有效
                }
            },
    
            /** 确保数据已加载（懒加载 + 内存缓存 1 小时 + localStorage 跨会话缓存） */
            async ensureData() {
                if (this._loading) return Boolean(this._cache);
                if (this._cache && Date.now() - this._lastFetch < this.REFRESH_INTERVAL) return true;
    
                // ★ 先尝试 localStorage（同步）— 命中即返回，不发网络请求
                if (!this._cache && this._loadFromStorage()) return true;
    
                this._loading = true;
                this._error = false;
    
                // ★ AbortController 超时保护，避免网络慢时无限等待
                const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
                const timeoutId = ctrl ? setTimeout(() => ctrl.abort(), this.FETCH_TIMEOUT) : null;
    
                try {
                    const base = location.hostname.includes("milkywayidlecn")
                        ? "https://www.milkywayidlecn.com" : "https://www.milkywayidle.com";
                    const url = base + "/game_data/marketplace.json";
                    console.log("[mwi-mm] Fetching market prices:", url);
                    const fetchOpts = ctrl ? { signal: ctrl.signal } : {};
                    const resp = await fetch(url, fetchOpts);
                    if (!resp.ok) {
                        console.error("[mwi-mm] Market price fetch failed, status:", resp.status);
                        this._error = true;
                        return false;
                    }
                    const raw = await resp.json();
                    // API 返回 { timestamp, marketData: { "/items/xxx": { "0": {...}, ... }, ... } }
                    const data = raw && raw.marketData ? raw.marketData : raw;
                    if (!data || typeof data !== "object") {
                        console.error("[mwi-mm] Market price data is invalid:", typeof data);
                        this._error = true;
                        return false;
                    }
                    this._cache = new Map();
                    let count = 0;
                    for (const [hrid, levels] of Object.entries(data)) {
                        if (!hrid.startsWith("/items/")) continue;
                        const info = levels["0"] || levels[0];
                        if (!info) continue;
                        const bareId = hrid.replace(/^\/items\//, "");
                        this._cache.set(bareId, {
                            ask: info.a ?? -1,
                            bid: info.b ?? -1,
                            avg: info.p ?? -1,
                            vol: info.v ?? 0
                        });
                        count++;
                    }
                    this._lastFetch = Date.now();
                    this._saveToStorage(); // ★ 持久化到 localStorage
                    console.log("[mwi-mm] Market prices loaded:", count, "items");
                    return true;
                } catch (err) {
                    if (err && err.name === "AbortError") {
                        console.error("[mwi-mm] Market price fetch timeout (", this.FETCH_TIMEOUT, "ms)");
                    } else {
                        console.error("[mwi-mm] Market price fetch error:", err);
                    }
                    this._error = true;
                    return false;
                } finally {
                    if (timeoutId) clearTimeout(timeoutId);
                    this._loading = false;
                }
            },
    
            /** 获取物品的采购价格（同步，从内存读取）
             *  优先级: ask > bid > avg > -1 */
            getPrice(bareId) {
                if (!this._cache) return -1;
                const info = this._cache.get(bareId);
                if (!info) return -1;
                if (info.ask > 0) return info.ask;
                if (info.bid > 0) return info.bid;
                if (info.avg > 0) return info.avg;
                return -1;
            },
    
            /** 数据是否就绪 */
            get ready() { return Boolean(this._cache); },
            /** 是否正在加载 */
            get loading() { return this._loading; }
        };
    
        /** 格式化金币数量（简短形式） */
        function formatGold(n) {
            if (!Number.isFinite(n) || n < 0) return "--";
            if (n < 1000) return String(Math.round(n));
            if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
            if (n < 1000000) return Math.round(n / 1000) + "K";
            if (n < 10000000) return (n / 1000000).toFixed(2).replace(/0$/, "").replace(/\.$/, "") + "M";
            if (n < 1000000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
            return (n / 1000000000).toFixed(2).replace(/0$/, "").replace(/\.$/, "") + "B";
        }
    
        // ── 制作计划追踪器 ──────────────────────────────────
        const _craftingPlanTracker = {
            // 半自动·快照进度：进度由 getPlanProgress 按「当前产出物库存 − 快照基线」实时计算，
            //   不再依赖 WS 事件计数（事件计数关网页会丢，库存差值离线仍准）。
            // 以下两个 WS 钩子仅用于动作推进时及时刷新计划页显示；不做任何自动完成或清除——
            //   计划唯一的移除途径是用户手动「完成 / 删除 / 清空」。
            /** WS 推送 action_completed → 刷新计划页进度条 */
            onActionCompleted(endCharacterAction) {
                if (!endCharacterAction || !endCharacterAction.actionHrid) return;
                if (!STATE.craftingPlans.has(endCharacterAction.actionHrid)) return;
                Store.notify("plans");
            },
    
            /** actions_updated isDone 信号 → 刷新计划页进度条 */
            onActionDone(actionHrid) {
                if (!actionHrid || !STATE.craftingPlans.has(actionHrid)) return;
                Store.notify("plans");
            }
        };
    
        // ── 任务追踪模块 ─────────────────────────────────────
        const PRODUCTION_SKILL_TYPES = new Set(["cheesesmithing", "crafting", "tailoring", "brewing", "cooking"]);
    
        const _questTracker = {
            _quests: [],   // 原始任务列表
            _ready: false,
    
            /** 从 init_character_data 初始化 */
            init(characterQuests) {
                if (!Array.isArray(characterQuests)) return;
                this._quests = characterQuests;
                this._ready = true;
                Store.notify("quests");
            },
    
            /** WS 推送更新（增量合并：只更新推送中出现的任务） */
            update(questPatches) {
                if (!Array.isArray(questPatches)) return;
                for (const patch of questPatches) {
                    const idx = this._quests.findIndex(q => q.hrid === patch.hrid);
                    if (idx >= 0) this._quests[idx] = patch;
                    else this._quests.push(patch);
                }
                Store.notify("quests");
            },
    
            /** 获取生产类任务 */
            getProductionTasks() {
                if (!this._ready || !_dataLayer.ready) return [];
                return this._quests.filter(q => {
                    if (!q || !q.actionHrid) return false;
                    if (q.status && q.status !== "/quest_status/in_progress") return false;
                    if ((q.currentCount || 0) >= (q.goalCount || 0)) return false;
                    const action = _dataLayer._actionMap?.[q.actionHrid];
                    if (!action || action.function !== "/action_functions/production") return false;
                    const bareType = (action.type || "").replace(/^\/action_types\//, "");
                    return PRODUCTION_SKILL_TYPES.has(bareType);
                }).map(q => {
                    const action = _dataLayer._actionMap[q.actionHrid];
                    const outputItem = action.outputItems?.[0];
                    const itemHrid = outputItem?.itemHrid || "";
                    const itemName = _dataLayer.hridToName(itemHrid) || itemHrid.replace(/^\/items\//, "");
                    const remaining = Math.max(0, (q.goalCount || 0) - (q.currentCount || 0));
                    return {
                        questHrid: q.hrid || "",
                        actionHrid: q.actionHrid,
                        actionName: _dataLayer.hridToName(q.actionHrid) || q.actionHrid,
                        itemHrid,
                        itemName,
                        done: q.currentCount || 0,
                        total: q.goalCount || 0,
                        remaining,
                        skillType: (action.type || "").replace(/^\/action_types\//, ""),
                        _action: action
                    };
                });
            },
    
        };
    
        // ── 数据层 — actionDetailMap / itemNameToHridDict ─────
        const _dataLayer = {
            ready: false,
            _clientData: null,
            _nameToHrid: null,
            _hridToName: null,
            _outputToAction: null,
            _actionMap: null,
            _houseRoomMap: null,
            _actionNameIndex: null,
            _lastRetryAt: 0,
    
            /** 懒重试自愈 — 就绪后只剩一次布尔判断;未就绪时最多每 10s 重试一次 init。
             *  覆盖「启动 8s 窗口内三个数据源都没到位,之后缓存才可读」的场景(旧版永不重试)。 */
            ensureReady() {
                if (this.ready) return true;
                const now = Date.now();
                if (now - this._lastRetryAt < 10000) return false;
                this._lastRetryAt = now;
                try {
                    if (!_capturedClientData?.actionDetailMap) {
                        const cached = _readClientDataFromCache();
                        if (cached) _capturedClientData = cached;
                    }
                    if (this.init()) console.log("[mwi-mm] 数据层延迟自愈成功(ensureReady)");
                } catch (err) { /* ignore */ }
                return this.ready;
            },
    
            /** 获取游戏客户端数据（优先 WS → localStorage → window.mwi） */
            _getClientData() {
                if (_capturedClientData?.actionDetailMap) return _capturedClientData;
                const cached = _readClientDataFromCache();
                if (cached) { _capturedClientData = cached; return cached; }
                if (window.mwi?.initClientData?.actionDetailMap) return window.mwi.initClientData;
                return null;
            },
    
            /** 获取国际化物品名称映射（displayName → hrid），支持中英文 */
            _getI18nItemNames() {
                try {
                    if (window.mwi?.itemNameToHridDict && typeof window.mwi.itemNameToHridDict === "object" && Object.keys(window.mwi.itemNameToHridDict).length > 100) {
                        return window.mwi.itemNameToHridDict;
                    }
                    const gameObj = this._getGameObject();
                    const resources = gameObj?.props?.i18n?.options?.resources;
                    if (!resources) return null;
                    const result = {};
                    for (const langKey of ["en", "zh"]) {
                        const names = resources[langKey]?.translation?.itemNames;
                        if (names && typeof names === "object") {
                            for (const [hrid, displayName] of Object.entries(names)) {
                                result[displayName] = hrid;
                            }
                        }
                    }
                    return Object.keys(result).length > 0 ? result : null;
                } catch { return null; }
            },
    
            /** 获取双语 hrid→name 映射（从游戏 i18n 资源中提取） */
            _getI18nBilingual() {
                const result = { en: new Map(), zh: new Map() };
                try {
                    const gameObj = this._getGameObject();
                    const resources = gameObj?.props?.i18n?.options?.resources;
                    if (!resources) return result;
                    for (const langKey of ["en", "zh"]) {
                        const names = resources[langKey]?.translation?.itemNames;
                        if (names && typeof names === "object") {
                            for (const [hrid, displayName] of Object.entries(names)) {
                                const fullHrid = hrid.startsWith("/items/") ? hrid : `/items/${hrid}`;
                                result[langKey].set(fullHrid, displayName);
                            }
                        }
                    }
                } catch { /* ignore */ }
                return result;
            },
    
            init() {
                const cd = this._getClientData();
                if (!cd || typeof cd !== "object") return false;
                this._clientData = cd;
    
                try {
                    this._nameToHrid = new Map();
                    this._hridToName = new Map();
                    // 双语名称映射
                    this._hridToNameEn = new Map();
                    this._hridToNameZh = new Map();
    
                    const i18nNames = this._getI18nItemNames();
                    if (i18nNames) {
                        for (const [name, hrid] of Object.entries(i18nNames)) {
                            this._nameToHrid.set(name, hrid);
                            this._nameToHrid.set(name.toLowerCase(), hrid);
                            this._hridToName.set(hrid, name);
                        }
                    }
    
                    // 构建双语名称索引
                    const bilingual = this._getI18nBilingual();
                    if (bilingual.en.size) this._hridToNameEn = bilingual.en;
                    if (bilingual.zh.size) this._hridToNameZh = bilingual.zh;
    
                    if (cd.itemDetailMap) {
                        for (const [hrid, detail] of Object.entries(cd.itemDetailMap)) {
                            if (detail && detail.name) {
                                if (!this._hridToName.has(hrid)) {
                                    this._hridToName.set(hrid, detail.name);
                                }
                                if (!this._nameToHrid.has(detail.name)) {
                                    this._nameToHrid.set(detail.name, hrid);
                                    this._nameToHrid.set(detail.name.toLowerCase(), hrid);
                                }
                                // 如果双语映射中缺少该物品，用 itemDetailMap 补全
                                // itemDetailMap 中的 name 取决于当前游戏语言
                                if (!this._hridToNameEn.has(hrid) && !this._hridToNameZh.has(hrid)) {
                                    this._hridToName.set(hrid, detail.name);
                                }
                            }
                        }
                    }
    
                    this._actionNameIndex = new Map();
                    if (cd.actionDetailMap) {
                        this._actionMap = cd.actionDetailMap;
                        this._outputToAction = new Map();
                        for (const action of Object.values(cd.actionDetailMap)) {
                            if (action.outputItems && Array.isArray(action.outputItems)) {
                                for (const output of action.outputItems) {
                                    if (output.itemHrid && !this._outputToAction.has(output.itemHrid)) {
                                        this._outputToAction.set(output.itemHrid, action);
                                    }
                                }
                            }
                            if (action.name) {
                                this._actionNameIndex.set(action.name, action);
                                this._actionNameIndex.set(action.name.toLowerCase(), action);
                            }
                        }
                    }
    
                    if (cd.houseRoomDetailMap) {
                        this._houseRoomMap = cd.houseRoomDetailMap;
                    }
    
                    // 构建升级链映射 outputHrid → upgradeHrid（前代物品）
                    this._upgradeChainMap = new Map();
                    if (cd.actionDetailMap) {
                        for (const action of Object.values(cd.actionDetailMap)) {
                            if (!action.upgradeItemHrid || action.function !== "/action_functions/production") continue;
                            const outputs = action.outputItems || [];
                            if (!outputs.length) continue;
                            const outputHrid = outputs[0].itemHrid;
                            if (outputHrid) {
                                this._upgradeChainMap.set(outputHrid, action.upgradeItemHrid);
                            }
                        }
                    }
    
                    this.ready = true;
                    const nameCount = this._hridToName?.size || 0;
                    const recipeCount = this._outputToAction?.size || 0;
                    const chainCount = this._upgradeChainMap?.size || 0;
                    console.log(`[mwi-mm] v${SCRIPT.version} DataLayer initialized: ${nameCount} names, ${recipeCount} recipes, ${chainCount} upgrade chains`);
                    return true;
                } catch (e) {
                    console.warn("[mwi-mm] 数据层初始化失败:", e);
                    this.ready = false;
                    return false;
                }
            },
    
            /** 将 hrid 转换为显示名称（根据当前语言选择） */
            hridToName(hrid) {
                // 优先使用当前语言的双语映射
                if (_currentLang === "en" && this._hridToNameEn?.size) {
                    const en = this._hridToNameEn.get(hrid);
                    if (en) return en;
                }
                if (_currentLang === "zh" && this._hridToNameZh?.size) {
                    const zh = this._hridToNameZh.get(hrid);
                    if (zh) return zh;
                }
                // 回退到通用映射
                return this._hridToName?.get(hrid) || null;
            },
    
            /** 通过 React Fiber 获取游戏组件实例（用于读取内部状态） */
            _getGameObject() {
                try {
                    const el = document.querySelector('[class^="GamePage"]');
                    if (!el) return null;
                    const key = Reflect.ownKeys(el).find(k => typeof k === 'string' && k.startsWith('__reactFiber$'));
                    if (!key) return null;
                    return el[key]?.return?.stateNode || null;
                } catch { return null; }
            },
    
            /**
             * 计算饮品浓缩倍率（基于 guzzling_pouch 强化等级）
             * ★ 改用 getEquippedLevel 从 hashMap 查找装备的暴饮袋，
             *   修复 _detailMap 仅含 inventory 物品后找不到装备栏暴饮袋的问题。
             */
            _getDrinkConcentration() {
                // ★ 手动指定暴饮袋等级时，直接用 ENHANCEMENT_BONUSES 计算
                if (STATE.guzzlingPouchLevel >= 0) {
                    const bonus = ENHANCEMENT_BONUSES[STATE.guzzlingPouchLevel] ?? 0;
                    return 1 + 0.1 * (1 + bonus);
                }
                const cd = this._clientData || this._getClientData();
                if (!cd) return 1;
                const pouchHrid = "/items/guzzling_pouch";
                // ★ 从 hashMap 查找所有位置的暴饮袋（含 /item_locations/pouch）
                const maxLevel = _wsInventory.getEquippedLevel(pouchHrid);
                if (maxLevel < 0) return 1;
                const pouchDetail = cd.itemDetailMap?.[pouchHrid];
                if (!pouchDetail?.equipmentDetail) return 1;
                const baseConc = pouchDetail.equipmentDetail.noncombatStats?.drinkConcentration || 0;
                const enhBonus = pouchDetail.equipmentDetail.noncombatEnhancementBonuses?.drinkConcentration || 0;
                const multiplier = cd.enhancementLevelTotalBonusMultiplierTable?.[maxLevel] || 0;
                return 1 + baseConc + enhBonus * multiplier;
            },
    
            /**
             * 计算工匠茶（artisan_tea）带来的材料减少加成比例
             * ★ 优先使用 WS 截获的饮品插槽数据，React Fiber 作为回退，
             *   解决 React Fiber 路径脆弱 / 属性名不匹配导致工匠加成丢失的问题。
             */
            _getArtisanBuff(actionType) {
                if (!actionType) return 0;
                const bareType = actionType.replace(/^\/action_types\//, "");
                // ★ 复用 PRODUCTION_SKILL_TYPES（第 954 行定义），消除重复硬编码
                if (!PRODUCTION_SKILL_TYPES.has(bareType)) return 0;
    
                // 策略1: WS 截获的饮品插槽（最可靠）
                if (_wsDrinkSlots.hasDrink(actionType, "/items/artisan_tea")) {
                    return 0.1 * this._getDrinkConcentration();
                }
    
                // 策略2: React Fiber 回退（兼容多种属性命名）
                try {
                    const gameObj = this._getGameObject();
                    if (gameObj?.state) {
                        const drinkMap = gameObj.state.actionTypeDrinkSlotsDict
                            || gameObj.state.actionTypeDrinkSlotsMap
                            || gameObj.state.actionTypeDrinkSlots;
                        if (drinkMap) {
                            const drinkSlots = drinkMap[actionType];
                            if (Array.isArray(drinkSlots)) {
                                const hasArtisan = drinkSlots.some(d => d?.itemHrid === "/items/artisan_tea");
                                if (hasArtisan) return 0.1 * this._getDrinkConcentration();
                            }
                        }
                    }
                } catch { /* ignore */ }
    
                return 0;
            },
    
            /** 根据物品名/配方名查找对应的 action 配方数据 */
            resolveActionByTitle(title) {
                if (!this.ready) return null;
                const trimmed = (title || "").trim();
                if (!trimmed) return null;
    
                // 先按物品名 → outputToAction 索引查找
                const itemHrid = this._nameToHrid.get(trimmed) || this._nameToHrid.get(trimmed.toLowerCase());
                if (itemHrid && itemHrid.startsWith("/items/") && this._outputToAction) {
                    const action = this._outputToAction.get(itemHrid);
                    if (action && action.inputItems) return action;
                }
    
                // 再按 action 名称索引查找
                const byName = this._actionNameIndex?.get(trimmed) || this._actionNameIndex?.get(trimmed.toLowerCase());
                if (byName && byName.inputItems) return byName;
    
                return null;
            },
    
            /** 按确定的 actionHrid 直接查表(由 React Fiber 读到的 actionDetail.hrid 驱动)。
             *  比标题文字 / SVG 反查更可靠:语言无关、零歧义、不受第三方 DOM 改写影响。 */
            resolveActionByHrid(hrid) {
                if (!this.ready || !hrid || !this._actionMap) return null;
                const a = this._actionMap[hrid];
                return (a && a.inputItems && a.inputItems.length) ? a : null;
            }
        };
    
        // ── 配方链递归解算模块 ──────────────────────────────
        const _recipeChain = {
            /** 检查物品是否可制作（在 _outputToAction 中存在生产配方） */
            isCraftable(itemHrid) {
                if (!_dataLayer.ready || !_dataLayer._outputToAction) return false;
                const action = _dataLayer._outputToAction.get(itemHrid);
                return !!(action && action.function === "/action_functions/production" && action.inputItems?.length);
            },
    
            /** 检查物品是否属于升级链（有前代物品） */
            isUpgradeChain(itemHrid) {
                return !!(_dataLayer._upgradeChainMap?.has(itemHrid));
            },
    
            /**
             * 获取完整升级链步骤（迭代遍历，非递归分解）
             * 沿 upgradeChainMap 向下走，每步收集非升级材料（套 artisan+z），升级前代 1:1 不套 artisan
             * @returns {Array<{stepHrid, craftRuns, upgradeFromHrid, materials: [{hrid, qty, name}]}>}
             */
            getChainSteps(targetHrid, qty) {
                if (!_dataLayer.ready) return [];
                const steps = [];
                let currentHrid = targetHrid;
                let neededQty = qty;
                const visited = new Set();
    
                while (neededQty > 0 && steps.length < 25) {
                    if (visited.has(currentHrid)) break; // 防循环
                    visited.add(currentHrid);
    
                    const action = _dataLayer._outputToAction?.get(currentHrid);
                    if (!action || action.function !== "/action_functions/production" || !action.inputItems?.length) break;
    
                    const outputCount = action.outputItems?.[0]?.count || 1;
                    const craftRuns = Math.ceil(neededQty / outputCount);
                    const artisanBuff = _dataLayer._getArtisanBuff(action.type);
                    const zVal = _zScoreCalc._effectiveZ(craftRuns);
                    const upgradeHrid = _dataLayer._upgradeChainMap?.get(currentHrid) || null;
    
                    // 收集非升级材料（套 artisan + z-score；金币跳过偏移）
                    const materials = [];
                    for (const inp of action.inputItems || []) {
                        const isUpgrade = upgradeHrid && inp.itemHrid === upgradeHrid && (inp.count || 1) === 1;
                        if (isUpgrade) continue; // 1:1 升级前代，不购买，沿链继续
                        const inpBareId = inp.itemHrid.replace(/^\/items\//, "");
                        const needed = isCoinItem(inpBareId)
                            ? Math.ceil((inp.count || 1) * craftRuns - 1e-9)
                            : _zScoreCalc.calcMaterials(inp.count || 1, craftRuns, artisanBuff, zVal).total;
                        materials.push({
                            hrid: inp.itemHrid,
                            qty: needed,
                            name: _dataLayer.hridToName(inp.itemHrid) || inpBareId
                        });
                    }
    
                    steps.push({
                        stepHrid: currentHrid,
                        stepName: _dataLayer.hridToName(currentHrid) || currentHrid.replace(/^\/items\//, ""),
                        craftRuns,
                        upgradeFromHrid: upgradeHrid,
                        materials
                    });
    
                    if (!upgradeHrid) break; // 链尾，无前代
                    currentHrid = upgradeHrid;
                    neededQty = craftRuns; // 1:1 升级，无 artisan
                }
                return steps;
            },
    
            /**
             * 汇总全链叶子材料（所有步骤的非升级材料合并）
             * @returns {Map<hrid, number>} hrid → 总需求量
             */
            getLeafMaterials(targetHrid, qty) {
                const steps = this.getChainSteps(targetHrid, qty);
                const merged = new Map();
                for (const step of steps) {
                    for (const mat of step.materials) {
                        merged.set(mat.hrid, (merged.get(mat.hrid) || 0) + mat.qty);
                    }
                }
                return merged;
            },
    
            /**
             * 构建子树结构（用于 UI 展开显示升级链步骤）
             * @returns {Array<{itemHrid, name, qty, depth, isCraftable, isUpgrade, isStep, materials}>}
             */
            buildSubTree(targetHrid, qty) {
                const steps = this.getChainSteps(targetHrid, qty);
                const rows = [];
                for (let i = 0; i < steps.length; i++) {
                    const step = steps[i];
                    // 每步的非升级材料
                    for (const mat of step.materials) {
                        rows.push({
                            itemHrid: mat.hrid, name: mat.name, qty: mat.qty,
                            depth: i + 1, isCraftable: false, isUpgrade: false
                        });
                    }
                    // 如果有升级前代，显示为步骤行
                    if (step.upgradeFromHrid && i < steps.length - 1) {
                        const nextStep = steps[i + 1];
                        rows.push({
                            itemHrid: step.upgradeFromHrid,
                            name: nextStep.stepName,
                            qty: step.craftRuns,
                            depth: i + 1, isCraftable: true, isUpgrade: true, isStep: true
                        });
                    }
                }
                return rows;
            },
    
            /** 叶子材料转购物车条目（扣除库存 + 购物车已有量）
             *  ★ 参数 excludeRecipes 接受 string 或 Set<string>，会原样透传给
             *    getEffectiveInventory —— 其内部已支持两种类型，这里不需要额外适配。
             */
            toCartItems(leafMap, excludeRecipes) {
                const items = [];
                for (const [hrid, qty] of leafMap) {
                    const bareId = hrid.replace(/^\/items\//, "");
                    if (isCoinItem(bareId)) continue;
                    const name = _dataLayer.hridToName(hrid) || bareId;
                    const stock = getEffectiveInventory(bareId, excludeRecipes);
                    const missing = Math.max(0, qty - stock);
                    // ★ 扣除购物车中已有的数量（已规划购买量），只添加净增量
                    const cartRow = STATE.cart.get(bareId);
                    const alreadyInCart = cartRow ? Math.max(0, cartRow.quantity) : 0;
                    const netMissing = Math.max(0, missing - alreadyInCart);
                    if (netMissing > 0) {
                        items.push({ itemId: bareId, name, iconRef: hrid, missing: netMissing, totalNeeded: qty });
                    }
                }
                return items;
            }
        };
    
        /** 等待游戏客户端数据就绪（轮询，最多等 maxWait ms） */
    
        // ════════════════════════════════════════════════════════════════════════
        // §04-续 数据采集(物理越区,就地标注)
        //     waitForClientData / setupWSInterceptor —— 逻辑归属 §04;
        //     WS 拦截器须在游戏建连前生效,为避免搬运风险保持原位
        // ════════════════════════════════════════════════════════════════════════
    
        function waitForClientData(maxWait = 8000) {
            return new Promise(resolve => {
                if (_capturedClientData?.actionDetailMap) { resolve(true); return; }
                const cached = _readClientDataFromCache();
                if (cached) { _capturedClientData = cached; resolve(true); return; }
                if (window.mwi?.initClientData?.actionDetailMap) { resolve(true); return; }
                const start = Date.now();
                let tick = 0;
                const timer = setInterval(() => {
                    tick++;
                    // 每 5 跳(≈1s)补查一次 localStorage —— 旧轮询只看 WS 与 window.mwi,
                    //       游戏启动期间晚写入的缓存会被永久错过且无任何重试。
                    if (tick % 5 === 0 && !_capturedClientData) {
                        const late = _readClientDataFromCache();
                        if (late) _capturedClientData = late;
                    }
                    if (_capturedClientData?.actionDetailMap || window.mwi?.initClientData?.actionDetailMap) {
                        clearInterval(timer);
                        resolve(true);
                    } else if (Date.now() - start > maxWait) {
                        clearInterval(timer);
                        resolve(false);
                    }
                }, 200);
            });
        }
    
        /**
         * 拦截 WebSocket 消息
         * 通过重写 MessageEvent.prototype.data getter，
         * 在游戏接收到 WS 消息时同步解析库存/市场/制作计划数据。
         * ★ 加 window 级 guard，避免脚本热更新/多副本时 getter 被层层包装。
         *   若已安装，直接复用原有拦截器，不再重复定义 getter。
         */
        function setupWSInterceptor() {
            if (window.__mwiMM_wsInterceptorInstalled) {
                console.log("[mwi-mm] WS 拦截器已由先前实例安装，跳过重复安装");
                return;
            }
            const prevGetter = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data")?.get;
            if (!prevGetter) {
                console.warn("[mwi-mm] 无法获取 MessageEvent.data getter，WS 库存追踪不可用");
                return;
            }
            // ★ 把原 getter 暴露到全局，便于未来恢复（目前脚本不主动恢复，保留入口）
            window.__mwiMM_origDataGetter = prevGetter;
            window.__mwiMM_wsInterceptorInstalled = true;
    
            Object.defineProperty(MessageEvent.prototype, "data", {
                configurable: true,
                enumerable: true,
                get: function () {
                    const socket = this.currentTarget;
                    const isGameWS = (socket instanceof WebSocket) && (
                        socket.url.indexOf("api.milkywayidle.com/ws") !== -1
                        || socket.url.indexOf("api-test.milkywayidle.com/ws") !== -1
                        || socket.url.indexOf("api.milkywayidlecn.com/ws") !== -1
                        || socket.url.indexOf("api-test.milkywayidlecn.com/ws") !== -1
                    );
    
                    const message = prevGetter.call(this);
    
                    if (isGameWS && !this.__mwiMMProcessed) {
                        this.__mwiMMProcessed = true;
                        try {
                            const obj = JSON.parse(message);
                            if (obj && typeof obj === "object") {
                                if (obj.type === "init_character_data" && Array.isArray(obj.characterItems)) {
                                    _wsInventory.init(obj.characterItems);
                                    // 同时截获饮品插槽数据
                                    if (obj.actionTypeDrinkSlotsMap) {
                                        _wsDrinkSlots.init(obj.actionTypeDrinkSlotsMap);
                                    }
                                    // 截获任务数据
                                    if (Array.isArray(obj.characterQuests)) {
                                        _questTracker.init(obj.characterQuests);
                                    }
                                    // ★ init_character_data 既见于首次连接，也见于断线重连/重登；
                                    //   后者会让 React 重挂 GamePage，使一次性挂载的监听器失效。React 重渲染
                                    //   需要时间，故延迟重挂并强制重绘自愈（两次重试覆盖渲染快/慢两种情况，
                                    //   ensureMainObserverAttached / _healObserversAfterRemount 均幂等，可安全重复调用）。
                                    setTimeout(() => { ensureMainObserverAttached(); scheduleRefresh(120); }, 300);
                                    setTimeout(_healObserversAfterRemount, 1200);
                                } else if (Array.isArray(obj.endCharacterItems)) {
                                    _wsInventory._patch(obj.endCharacterItems);
                                }
                                // 饮品插槽更新（周期性推送，含所有 actionType 的饮品状态）
                                if (obj.type === "action_type_consumable_slots_updated" && obj.actionTypeDrinkSlotsMap) {
                                    _wsDrinkSlots.update(obj.actionTypeDrinkSlotsMap);
                                }
                                if (obj.type === "init_client_data") {
                                    obj._src = "WS";
                                    _capturedClientData = obj;
                                    console.log("[mwi-mm] 已截获 init_client_data（WS）");
                                    if (!_dataLayer.ready) {
                                        _dataLayer.init();
                                    }
                                }
                                if (obj.type === "market_item_order_books_updated") {
                                    _marketDataCache.update(obj);
                                }
                                // 制作完成事件 — 精确匹配制作计划
                                if (obj.type === "action_completed" && obj.endCharacterAction) {
                                    _craftingPlanTracker.onActionCompleted(obj.endCharacterAction);
                                }
                                // 行动状态更新 — isDone 确认信号
                                if (obj.type === "actions_updated" && Array.isArray(obj.endCharacterActions)) {
                                    for (const ca of obj.endCharacterActions) {
                                        if (ca.isDone && ca.actionHrid) {
                                            _craftingPlanTracker.onActionDone(ca.actionHrid, ca.currentCount);
                                        }
                                    }
                                }
                                // 任务进度更新（action_completed / quests_updated 推送 endCharacterQuests）
                                if (Array.isArray(obj.endCharacterQuests)) {
                                    _questTracker.update(obj.endCharacterQuests);
                                }
                            }
                        } catch (e) {
                            // 非 JSON 消息或解析失败，忽略
                        }
                    }
    
                    return message;
                }
            });
    
            console.log("[mwi-mm] v" + SCRIPT.version + " WebSocket interceptor registered (lang=" + _currentLang + ")");
        }
    
        // ★ 尽早安装 WS 拦截器（不依赖 DOM，避免 document-idle 时错过 init_character_data）
        setupWSInterceptor();
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §06 工具区 Util
        //     文本/数字解析 / sprite 探测 / React Fiber 桥 / 市场定位高亮 / 库存 DOM 扫描
        //     已知职责混居(≥6 种),拆分推迟到内核接线验证后
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 工具函数 ──────────────────────────────────────────────────
    
        /** 返回当前时间的 ISO 格式字符串 */
        function nowIso() { return new Date().toISOString(); }
    
        /** 安全提取文字并截断（去多余空白，限制最大长度） */
        function safeText(value, maxLen = 160) {
            const text = String(value ?? "").replace(/\s+/g, " ").trim();
            if (text.length <= maxLen) return text;
            return text.slice(0, maxLen) + "...";
        }
    
        /** 获取元素 className 的小写形式（兼容 SVGAnimatedString） */
        function classNameLower(el) {
            const raw = el && typeof el.className === "string"
                ? el.className
                : (el && el.className && typeof el.className.baseVal === "string" ? el.className.baseVal : "");
            return String(raw || "").toLowerCase();
        }
    
        /** 判断元素是否可见（display/visibility/opacity + 尺寸） */
        function isVisible(el) {
            if (!el || !(el instanceof Element)) return false;
            const style = window.getComputedStyle(el);
            if (!style || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }
    
        /** 更新状态栏文字并触发重绘 */
        function setAction(text) {
            if (text === STATE.lastAction) return;
            STATE.lastAction = text;
            Store.notify("ui");
        }
    
        /** 临时抑制 MutationObserver（避免自身 DOM 操作触发循环刷新） */
        function suppressObserver() { STATE.suppressObserverDepth++; }
        /** 恢复 Observer（通过微任务延迟，确保当前 DOM 操作完成） */
        function resumeObserver() {
            queueMicrotask(() => { if (STATE.suppressObserverDepth > 0) STATE.suppressObserverDepth--; });
        }
        /** Observer 是否被抑制 */
        function isObserverSuppressed() { return STATE.suppressObserverDepth > 0; }
        /** 在抑制 Observer 期间执行函数 */
        function withObserverSuppressed(fn) {
            suppressObserver();
            try { return fn(); } finally { resumeObserver(); }
        }
    
        // ── 防注入硬防御 ──────────────────────────────
        //   第三方脚本可能往需求行附近注入数字文本,被 DOM 解析读成库存/需求/次数。
        //   L1 节点级:textWithoutInjected 剔除「非游戏 CSS-Modules 类名且含数字」的子元素;
        //   L2 数值级:解析结果超出合理上限 → 按解析失败处理,不出徽章也不出错数。
        //   游戏自有节点类名形如 `Comp_name__hash`(CSS-Modules),以此为白名单特征。
        const GAME_CLASS_RE = /(?:^|\s)[A-Za-z][\w-]*_[\w-]+__[\w-]{3,}(?:\s|$)/; // CSS-Modules: Comp_name__hash
        const MAX_SANE_ACTION_COUNT = 1e7;   // 制作次数上限(游戏排队远低于此;超出 = 读到了注入金额)
        const MAX_SANE_NEED = 1e6;           // 单次所需材料上限
        const MAX_SANE_STOCK = 1e13;         // 库存上限(金币富豪也到不了十万亿)
        const _suspectWarned = new Set();
        /** 同类可疑解析每会话只告警一次,避免刷屏 */
        function warnSuspectOnce(tag, detail) {
            if (_suspectWarned.has(tag)) return;
            _suspectWarned.add(tag);
            try { console.warn("[mwi-mm] 检测到可疑数值(疑似第三方插件注入),已忽略:", tag, detail); } catch (err) { /* ignore */ }
        }
        /** 元素自身是否带游戏 CSS-Modules 风格类名 */
        function hasGameClass(el) {
            if (!el || !el.className) return false;
            const cls = typeof el.className === "string" ? el.className : (el.className.baseVal || "");
            return GAME_CLASS_RE.test(cls);
        }
        /** L2: 行级数值合理性 — 任一越界即判定该行解析被污染(调用方应作解析失败处理) */
        function rowLooksSane(currentStock, needPerAction) {
            return Number.isFinite(currentStock) && currentStock >= 0 && currentStock <= MAX_SANE_STOCK
                && Number.isFinite(needPerAction) && needPerAction >= 0 && needPerAction <= MAX_SANE_NEED;
        }
    
        /** 提取元素文字，排除本插件注入的 DOM（徽章、摘要面板等）
         *  同时剔除第三方插件注入的数字节点(无游戏类名 + 含数字 = 外来数值) */
        function textWithoutInjected(el) {
            if (!el || !(el instanceof Element)) return "";
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.mwi-mm-upgrade-badge, .mwi-mm-upgrade-inline, .mwi-mm-summary-panel').forEach((node) => node.remove());
            for (const node of [...clone.querySelectorAll("*")]) {
                if (!clone.contains(node)) continue;           // 父级已被移除
                if (hasGameClass(node)) continue;              // 游戏自有节点保留
                if (!/\d/.test(node.textContent || "")) continue; // 不含数字的(图标等)保留
                node.remove();
            }
            return safeText(clone.textContent || "", 180);
        }
    
        /** 解析紧凑数字格式（支持 k/m/b 后缀、逗号分隔、∞） */
        function parseCompactNumber(token) {
            if (token == null) return null;
            const raw = String(token).trim().toLowerCase();
            if (!raw) return null;
            if (raw.includes("∞") || raw.includes("infinity")) return Infinity;
            const match = raw.match(/-?\d+(?:[.,]\d+)?(?:[kmb])?/i);
            if (!match) return null;
            let normalized = match[0].replace(/,/g, "");
            let unit = 1;
            if (normalized.endsWith("k")) { unit = 1e3; normalized = normalized.slice(0, -1); }
            else if (normalized.endsWith("m")) { unit = 1e6; normalized = normalized.slice(0, -1); }
            else if (normalized.endsWith("b")) { unit = 1e9; normalized = normalized.slice(0, -1); }
            const num = Number.parseFloat(normalized);
            if (!Number.isFinite(num)) return null;
            return num * unit;
        }
    
        /** 从文本中提取所有数字（返回数组） */
        function parseNumbers(text) {
            const raw = String(text ?? "").replace(/,/g, "");
            const parts = raw.match(/-?\d+(?:\.\d+)?(?:[kmb])?|∞/gi) || [];
            const nums = [];
            for (const p of parts) {
                const n = parseCompactNumber(p);
                if (n != null) nums.push(n);
            }
            return nums;
        }
    
        /** 解析库存显示文本中的数值（取第一个有限数） */
        function parseInventoryValue(text) {
            const nums = parseNumbers(text);
            for (const n of nums) { if (Number.isFinite(n)) return n; }
            return 0;
        }
    
        /** 解析「每次所需」数量（取末尾有限数） */
        function parseRequiredPerAction(text) {
            const nums = parseNumbers(text);
            if (!nums.length) return 0;
            for (let i = nums.length - 1; i >= 0; i -= 1) {
                if (Number.isFinite(nums[i])) return nums[i];
            }
            return 0;
        }
    
        /** 解析行动次数输入值（返回 { value, raw, infinite }） */
        function parseActionCountValue(text) {
            const raw = String(text ?? "").trim();
            if (!raw) return { value: 1, raw: "", infinite: false };
            const num = parseCompactNumber(raw);
            if (num === Infinity) return { value: 1, raw, infinite: true };
            if (!Number.isFinite(num) || num <= 0) return { value: 1, raw, infinite: false };
            return { value: num, raw, infinite: false };
        }
    
        function _readActionCountInScope(scope) {
            if (!scope || !(scope instanceof Element || scope instanceof Document)) return null;
            const containers = [...scope.querySelectorAll('[class*="SkillActionDetail_maxActionCountInput"]')].filter((el) => isVisible(el));
            for (const container of containers) {
                const input = container.querySelector('input[class*="Input_input"]');
                if (input && isVisible(input)) {
                    const parsed = parseActionCountValue(input.value || input.textContent || "");
                    if (parsed.infinite || (parsed.value >= 1 && parsed.value <= MAX_SANE_ACTION_COUNT)) return parsed;
                    if (parsed.value > MAX_SANE_ACTION_COUNT) warnSuspectOnce("actionCount-input", parsed.raw);
                }
                const fallback = parseNumbers(textWithoutInjected(container)).filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_SANE_ACTION_COUNT);
                if (fallback.length) return { value: Math.max(...fallback), raw: String(Math.max(...fallback)), infinite: false };
                const last = parseActionCountValue(input?.value || input?.textContent || "");
                if (last.raw && (last.infinite || last.value <= MAX_SANE_ACTION_COUNT)) return last;
                if (!last.infinite && last.value > MAX_SANE_ACTION_COUNT) warnSuspectOnce("actionCount-last", last.raw);
            }
            return null;
        }
    
        function _getActionCountScopes(modal) {
            const scopes = [];
            const push = (node) => {
                if (!node || scopes.includes(node)) return;
                scopes.push(node);
            };
            push(modal);
            push(modal?.closest?.('[class*="Modal_modalContainer"]'));
            push(modal?.closest?.('[class*="MainPanel_subPanelContainer"]'));
            push(modal?.parentElement);
            push(modal?.parentElement?.parentElement);
            return scopes;
        }
    
        /** 从当前面板读取行动次数 */
        function readActionCount(modal) {
            for (const scope of _getActionCountScopes(modal)) {
                const parsed = _readActionCountInScope(scope);
                if (parsed) return parsed;
            }
            return parseActionCountValue("1");
        }
    
        /** 格式化数量显示（整数不带小数，小数保留 2 位去尾零） */
        function formatQty(num) {
            const n = Number(num || 0);
            if (!Number.isFinite(n)) return "0";
            if (Math.abs(n - Math.round(n)) < 1e-8) return String(Math.round(n));
            return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
        }
    
        /** 从元素中提取 svg use href 属性 */
        function extractUseHref(root) {
            if (!root || !(root instanceof Element)) return "";
            const use = root.querySelector("svg use");
            if (!use) return "";
            return use.getAttribute("href") || use.getAttribute("xlink:href") || "";
        }
    
        /** 从元素中提取图标引用（多策略降级：use href → image href → data 属性） */
        function extractIconRef(root) {
            if (!root || !(root instanceof Element)) return "";
            const nodes = [
                root.querySelector("svg use"), root.querySelector("use"),
                root.querySelector("image[href], image[xlink\\:href]"),
                root.querySelector("[href*=\"#\"], [xlink\\:href*=\"#\"]")
            ];
            for (const node of nodes) {
                if (!node) continue;
                const href = node.getAttribute("href") || node.getAttribute("xlink:href") || "";
                if (href) return href;
            }
            const attrNode = root.matches?.('[data-item-id], [data-item-hrid], [data-hrid]')
                ? root : root.querySelector('[data-item-id], [data-item-hrid], [data-hrid]');
            if (attrNode) {
                return attrNode.getAttribute("data-item-id") || attrNode.getAttribute("data-item-hrid") || attrNode.getAttribute("data-hrid") || "";
            }
            return "";
        }
    
        /** 在多个升级物品容器中找到最佳候选（评分系统：图标、计数、非空状态） */
        function findBestUpgradeContainer(modal) {
            const candidates = [...modal.querySelectorAll(SEL.upgradeContainer)].filter((el) => isVisible(el));
            if (!candidates.length) return null;
            let best = candidates[0], bestScore = -Infinity;
            for (const el of candidates) {
                let score = 0;
                const txt = textWithoutInjected(el);
                const itemCore = el.querySelector(SEL.itemCore);
                const cls = classNameLower(itemCore || el);
                const iconRef = extractIconRef(itemCore || el);
                if (itemCore) score += 2;
                if (iconRef) score += 2;
                if (cls.includes("item_empty")) score -= 6;
                if (/没有选择升级物品|未选择升级物品|choose/i.test(txt)) score -= 5;
                if (el.querySelector('[class*="Item_count"], [class*="inventoryCount"]')) score += 1;
                if (score > bestScore) { bestScore = score; best = el; }
            }
            return best;
        }
    
        /** 在容器内找到最佳的数量显示元素（Item_count 优先） */
        function pickBestCountElement(container) {
            if (!container || !(container instanceof Element)) return null;
            const nodes = [...container.querySelectorAll('[class*="Item_count"], [class*="inventoryCount"], [class*="inputCount"]')].filter((el) => isVisible(el));
            if (!nodes.length) return null;
            let best = nodes[0], bestScore = -Infinity;
            for (const el of nodes) {
                let score = 0;
                const cls = classNameLower(el);
                const txt = textWithoutInjected(el);
                const nums = parseNumbers(txt).filter((n) => Number.isFinite(n));
                if (cls.includes("item_count")) score += 3;
                if (cls.includes("inventorycount")) score += 2;
                if (cls.includes("inputcount")) score -= 1;
                if (nums.length) score += 1;
                if (txt.length > 0 && txt.length < 26) score += 1;
                if (score > bestScore) { bestScore = score; best = el; }
            }
            return best;
        }
    
        /** 读取升级物品的「每次所需」数量 */
        function readUpgradeNeedPerAction(upgradeEl) {
            if (!upgradeEl || !(upgradeEl instanceof Element)) return 1;
            const candidates = [...upgradeEl.querySelectorAll('[class*="inputCount"], [class*="requiredCount"]')].filter((el) => isVisible(el));
            for (const el of candidates) {
                const n = parseRequiredPerAction(textWithoutInjected(el));
                if (Number.isFinite(n) && n > 0) return n;
            }
            return 1;
        }
    
        /**
         * 解析「库存/所需」格式的文本（如 "10/50"）
         * 兼容半角和全角斜杠（/、／）和等号（=、＝）
         * ★ 移除 toolkitActive 参数。当左侧无数值时（如 "/ 16"），
         *   不再将右侧视为总需求量，而是让调用者按单次消耗处理。
         *   修复强化面板输入格式被误解析为总量导致缺料永远为 0 的问题。
         */
        function parseStockNeedPair(text) {
            const raw = String(text ?? "");
            const slashIdx = raw.search(/[\/／]/);
            if (slashIdx < 0) return null;
            const beforeSlash = raw.slice(0, slashIdx);
            if (/[=＝]/.test(beforeSlash)) return null;
            const leftNums = parseNumbers(beforeSlash);
            const rightNums = parseNumbers(raw.slice(slashIdx + 1));
            if (!rightNums.length) return null;
            const right = rightNums[0];
            if (!Number.isFinite(right)) return null;
            if (leftNums.length) {
                const left = leftNums[leftNums.length - 1];
                if (!Number.isFinite(left)) return null;
                if (left < 0) return null;
                return { stock: left, total: right };
            }
            return null;
        }
    
        /** 有损总量的整数吸附重建:显示层可能把总量截断为 K/M/B(302,192 → "302K")。
         *  利用「每次需求必为整数」+「次数来自精确 input.value」反推:
         *  有损总量/N ≈ 整数 r → 吸附到 r,总量重建为 r×N。
         *  仅当右侧带 k/m/b 后缀且偏差 ≤2% 时吸附,否则保持原值。 */
        function _snapLossyNeed(needPerAction, actionCountValue, rightRaw) {
            if (!(actionCountValue > 0) || !Number.isFinite(needPerAction)) return null;
            if (!/\d\s*[kmb]/i.test(String(rightRaw || ""))) return null;   // 仅有损格式才重建
            const r = Math.round(needPerAction);
            if (r < 1) return null;
            if (Math.abs(needPerAction - r) > r * 0.02) return null;
            return r;
        }
    
        /** 综合解析所需量（优先尝试 stock/need 格式，回退到普通解析）
         *  游戏原生的「库存 / 所需」格式中，右侧是每次行动的消耗量；
         *  例如 0 / 8.9 应先四舍五入为每次 9，行动 50 次得到总需求 450。
         *  但 MWI_Toolkit 可能把 "1,434 / 4" 改写成 "␣/ 239K␣"：
         *  左侧库存被抹掉、右侧已经是整批总量。此无左值格式仍按总量处理，
         *  并在 K/M/B 有损显示时做整数吸附重建（见 _snapLossyNeed）。 */
        function resolveNeed(inputText, actionCountValue) {
            const raw = String(inputText ?? "");
            const slashIdx = raw.search(/[\/／]/);
            const rightRaw = slashIdx >= 0 ? raw.slice(slashIdx + 1) : "";
            const pair = parseStockNeedPair(inputText);
            if (pair) {
                const needPerAction = Math.round(pair.total);
                const totalNeeded = needPerAction * actionCountValue;
                return { needPerAction, totalNeeded, stockOverride: pair.stock, inferred: true };
            }
            if (slashIdx >= 0 && !/[=＝]/.test(raw.slice(0, slashIdx))) {
                let fallbackStock = null;
                const leftNums = parseNumbers(raw.slice(0, slashIdx));
                if (leftNums.length) {
                    const candidate = leftNums[leftNums.length - 1];
                    if (Number.isFinite(candidate) && candidate >= 0) fallbackStock = candidate;
                }
                const rightNums = parseNumbers(rightRaw);
                if (rightNums.length && Number.isFinite(rightNums[0]) && rightNums[0] >= 0) {
                    let totalNeeded = rightNums[0];
                    let needPerAction = actionCountValue > 0 ? totalNeeded / actionCountValue : totalNeeded;
                    const snapped = _snapLossyNeed(needPerAction, actionCountValue, rightRaw);
                    if (snapped != null) { needPerAction = snapped; totalNeeded = snapped * actionCountValue; }
                    return { needPerAction, totalNeeded, stockOverride: fallbackStock, inferred: true };
                }
                const needPerAction = parseRequiredPerAction(raw);
                return { needPerAction, totalNeeded: needPerAction * actionCountValue, stockOverride: fallbackStock, inferred: false };
            }
            let fallbackStock = null;
            if (slashIdx >= 0) {
                const leftNums = parseNumbers(String(inputText).slice(0, slashIdx));
                if (leftNums.length) {
                    const candidate = leftNums[leftNums.length - 1];
                    if (Number.isFinite(candidate) && candidate >= 0) fallbackStock = candidate;
                }
            }
            const needPerAction = parseRequiredPerAction(inputText);
            const totalNeeded = needPerAction * actionCountValue;
            return { needPerAction, totalNeeded, stockOverride: fallbackStock, inferred: false };
        }
    
        /** 从技能面板中提取升级物品的缺料信息（多候选评分选择） */
        function extractUpgradeFromModal(modal, actionCount) {
            const allContainers = [...modal.querySelectorAll(SEL.upgradeContainer)];
            const visible = allContainers.filter((el) => isVisible(el));
            const containers = (visible.length ? visible : allContainers).slice(0, 12);
            const upgradeMeta = { containerFound: containers.length > 0, hasSelected: false, href: "", countText: "", parseSource: "", candidateCount: containers.length };
            if (!containers.length) return { upgrade: null, upgradeMeta };
    
            let best = null;
            for (const el of containers) {
                const itemWrap = el.querySelector('[class*="Item_itemContainer"]');
                const itemCore = itemWrap?.querySelector(SEL.itemCore) || el.querySelector(SEL.itemCore) || itemWrap || el;
                const href = extractIconRef(itemCore) || extractUseHref(itemCore);
                const itemId = isLikelyItemRef(href) ? normalizeItemId(href) : "";
                const name = getItemName(itemCore, itemId || t("upgrade_item"));
                const countEl = pickBestCountElement(el);
                const countText = textWithoutInjected(countEl) || "";
                const containerText = textWithoutInjected(el);
                const currentStockRaw = parseInventoryValue(countText || containerText || "0");
                let needPerAction = readUpgradeNeedPerAction(el);
                let totalNeeded = needPerAction * actionCount.value;
                let currentStock = currentStockRaw;
                const upgResolve = resolveNeed(countText || containerText || "0", actionCount.value);
                if (upgResolve.inferred) {
                    needPerAction = upgResolve.needPerAction;
                    totalNeeded = upgResolve.totalNeeded;
                    if (upgResolve.stockOverride != null) currentStock = upgResolve.stockOverride;
                } else if (upgResolve.stockOverride != null) {
                    currentStock = upgResolve.stockOverride;
                }
                const totalNeededCeil = Math.ceil(totalNeeded - 1e-9);
                let missing = Math.max(0, totalNeededCeil - currentStock);
                // L2: 越界 = 解析被第三方注入污染 → 该候选按解析失败处理
                if (!rowLooksSane(currentStock, needPerAction)) {
                    warnSuspectOnce("upgrade-row", { name, countText });
                    needPerAction = 0; totalNeeded = 0; missing = 0;
                    currentStock = Math.min(Math.max(Number(currentStock) || 0, 0), MAX_SANE_STOCK);
                }
                const coreCls = classNameLower(itemCore);
                const hasWarning = /没有选择升级物品|未选择升级物品|choose/i.test(containerText);
                const hrefLower = String(href || "").toLowerCase();
                let score = 0;
                if (itemId) score += 10;
                if (isLikelyItemRef(href)) score += 2;
                if (countEl) score += 2;
                if (currentStock > 0) score += 1;
                if (coreCls.includes("item_empty")) score -= 8;
                if (hasWarning) score -= 4;
                if (hrefLower.includes("skills_sprite")) score -= 6;
                if (!itemId && !countEl) score -= 2;
                const candidate = { score, itemId, name, href, countText, parseSource: countEl ? classNameLower(countEl) : "", currentStock, needPerAction, totalNeeded, missing, missingRounded: missing, container: el, countEl, hasWarning };
                if (!best || candidate.score > best.score) best = candidate;
            }
            if (!best) return { upgrade: null, upgradeMeta };
            upgradeMeta.href = best.href || "";
            upgradeMeta.countText = best.countText || "";
            upgradeMeta.parseSource = best.parseSource || "";
            upgradeMeta.hasSelected = Boolean(best.itemId);
            if (!best.itemId) return { upgrade: null, upgradeMeta };
    
            const upgrade = {
                type: "upgrade", itemId: best.itemId, name: best.name, iconRef: best.href || "",
                currentStock: best.currentStock, needPerAction: best.needPerAction, totalNeeded: best.totalNeeded,
                missing: best.missing, missingRounded: best.missingRounded,
                canAddToCart: true, container: best.container || null, countEl: best.countEl
            };
            return { upgrade, upgradeMeta };
        }
    
        /** 从 svg href 提取规范化物品 ID（去除 #、item_ 前缀和 /items/ 路径） */
        function normalizeItemId(rawHref) {
            const href = String(rawHref || "").trim();
            if (!href) return "";
            if (href.includes("#")) { const after = href.split("#").pop(); return String(after || "").replace(/^item_/, ""); }
            if (href.startsWith("/items/")) return href.slice("/items/".length);
            return href.replace(/^#/, "").replace(/^item_/, "");
        }
    
        /** 规范化购物车物品 ID（统一去除 /items/ 和 # 前缀） */
        function normalizeCartItemId(itemId) {
            const raw = String(itemId || "").trim();
            if (!raw) return "";
            if (raw.startsWith("/items/")) return raw.slice("/items/".length);
            return raw.replace(/^#/, "");
        }
    
        /** 判断引用是否像有效的物品引用（含 items_sprite、/items/ 或 # 开头） */
        function isLikelyItemRef(rawRef) {
            const ref = String(rawRef || "").toLowerCase();
            if (!ref) return false;
            if (ref.includes("items_sprite")) return true;
            if (ref.includes("/items/")) return true;
            if (ref.startsWith("#") && !ref.includes("skills_")) return true;
            return false;
        }
    
        /** 获取物品名称（优先数据层 → SVG aria-label → DOM 文字 → 回退 ID） */
        function getItemName(itemRoot, fallbackId = "") {
            if (_dataLayer.ready && fallbackId) {
                const bareId = normalizeCartItemId(fallbackId);
                if (bareId) {
                    const hrid = `/items/${bareId}`;
                    const name = _dataLayer.hridToName(hrid);
                    if (name) return name;
                }
            }
            if (!itemRoot || !(itemRoot instanceof Element)) return fallbackId || t("unknown_item");
            const svgName = itemRoot.querySelector("svg[aria-label]")?.getAttribute("aria-label");
            if (svgName) return safeText(svgName, 120);
            const nameEl = itemRoot.querySelector('[class*="Item_name"], [class*="Item_label"]');
            if (nameEl) {
                const txt = safeText(nameEl.textContent, 120);
                if (txt) return txt;
            }
            if (fallbackId) return fallbackId;
            return t("unknown_item");
        }
    
        /** 根据当前语言重新解析购物车物品的显示名称 */
        function resolveCartDisplayName(row) {
            if (_dataLayer.ready && row.itemId) {
                const hrid = toItemHrid(row.itemId);
                if (hrid) {
                    const name = _dataLayer.hridToName(hrid);
                    if (name) return name;
                }
            }
            return row.name || row.itemId || t("unknown_item");
        }
    
        // ★ 多层降级获取 sprite base 路径
        //   优先级: 内存缓存 → Performance API → DOM 扫描 → localStorage 跨会话缓存
        //   解决购物车图标在早期渲染时因 DOM 中尚无 items_sprite 引用而丢失的问题
        const _spriteLS_KEY = "mwi_mm_sprite_base_v1";
        let _spriteBaseCache = "";
        let _spriteBaseResolved = false; // 标记是否已最终确定（非 localStorage 猜测）
    
        /** 设置并缓存 sprite 基础路径（变更时触发购物车重绘修复图标） */
        function _setSpriteBase(base, source) {
            if (!base || _spriteBaseCache === base) return;
            const old = _spriteBaseCache;
            _spriteBaseCache = base;
            _spriteBaseResolved = true;
            try { localStorage.setItem(_spriteLS_KEY, base); } catch { /* ignore */ }
            console.log(`[mwi-mm] sprite base 已确定（${source}）: ${base}`);
            // 如果之前为空或值发生变化（如游戏更新了 hash），触发购物车重绘修复图标
            if (old !== base) {   // 不再依赖旧抽屉存在
                setTimeout(() => Store.notify("cart"), 50);
            }
        }
    
        /** 层1: Performance API — 从浏览器资源加载记录中提取 */
        function _detectSpriteFromPerformance() {
            try {
                const entries = performance.getEntriesByType("resource");
                for (const entry of entries) {
                    if (entry.name && entry.name.includes("items_sprite") && entry.name.endsWith(".svg")) {
                        // entry.name 是完整 URL，提取相对路径
                        const url = new URL(entry.name);
                        return url.pathname; // 如 "/static/media/items_sprite.9c39e2ec.svg"
                    }
                }
            } catch { /* ignore */ }
            return "";
        }
    
        /** 层2: DOM 扫描 — 从页面中已渲染的 svg use 元素提取 */
        function _detectSpriteFromDOM() {
            const uses = document.querySelectorAll('svg use[href*="items_sprite"], svg use[xlink\\:href*="items_sprite"]');
            for (const use of uses) {
                const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
                if (href && href.includes("#")) return href.split("#")[0];
            }
            return "";
        }
    
        /** 层3: localStorage 跨会话缓存 — 上次成功的值 */
        function _detectSpriteFromStorage() {
            try {
                return localStorage.getItem(_spriteLS_KEY) || "";
            } catch { return ""; }
        }
    
        /** 多层降级检测 sprite 基础路径（Performance API → DOM 扫描 → localStorage） */
        function detectItemsSpriteBase() {
            // 已确认的缓存直接返回
            if (_spriteBaseCache && _spriteBaseResolved) return _spriteBaseCache;
    
            // 层1: Performance API（最早可用，游戏 JS 加载时就请求了 sprite）
            const fromPerf = _detectSpriteFromPerformance();
            if (fromPerf) { _setSpriteBase(fromPerf, "Performance API"); return _spriteBaseCache; }
    
            // 层2: DOM 扫描
            const fromDOM = _detectSpriteFromDOM();
            if (fromDOM) { _setSpriteBase(fromDOM, "DOM"); return _spriteBaseCache; }
    
            // 层3: localStorage（跨会话降级，可能 hash 过期但聊胜于无）
            if (!_spriteBaseCache) {
                const fromLS = _detectSpriteFromStorage();
                if (fromLS) {
                    _spriteBaseCache = fromLS; // 暂用，不标记 resolved
                    return _spriteBaseCache;
                }
            }
    
            return _spriteBaseCache;
        }
    
        /** 启动后异步探测 sprite base，确保尽早获取 */
        function _initSpriteBaseProbe() {
            // 立即尝试一次
            detectItemsSpriteBase();
            if (_spriteBaseResolved) return;
    
            // 未成功则定时重试（游戏加载较慢时 Performance API 可能还没有记录）
            let retries = 0;
            const timer = setInterval(() => {
                retries++;
                detectItemsSpriteBase();
                if (_spriteBaseResolved || retries > 30) { // 最多重试 30 次（约 15 秒）
                    clearInterval(timer);
                    if (!_spriteBaseResolved && _spriteBaseCache) {
                        // localStorage 值虽未验证，但已经是最好的了
                        _spriteBaseResolved = true;
                        console.log("[mwi-mm] sprite base 使用 localStorage 缓存（未验证）:", _spriteBaseCache);
                    }
                }
            }, 500);
        }
    
        /** 解析图标 href（已有包含 # 的直接返回，否则拼接 sprite base） */
        function resolveItemIconHref(row) {
            const raw = String(row?.iconRef || "").trim();
            if (raw && raw.includes("#")) return raw;
            let id = "";
            if (raw && raw.startsWith("/items/")) {
                id = raw.replace(/^\/items\//, "");
            } else {
                id = normalizeCartItemId(row?.itemId || "");
            }
            if (!id) return "";
            const base = detectItemsSpriteBase();
            if (base) return `${base}#${id}`;
            return `#${id}`;
        }
    
        /** 生成物品图标的 SVG HTML */
        function renderItemIconSvg(row) {
            const href = resolveItemIconHref(row);
            if (!href) return `<span class="mwi-mm-icon-fallback">?</span>`;
            const safeHref = escapeHtml(href);
            const title = escapeHtml(row?.name || row?.itemId || t("item"));
            return `<svg class="mwi-mm-item-icon" aria-label="${title}" viewBox="0 0 32 32"><use href="${safeHref}" xlink:href="${safeHref}"></use></svg>`;
        }
    
        /** 将 bareId 转换为 hrid 格式（如 “/items/xxx”） */
        function toItemHrid(itemId) {
            const id = normalizeCartItemId(itemId);
            if (!id) return "";
            return `/items/${id}`;
        }
    
        /** HTML 实体转义 */
        function escapeHtml(text) {
            return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
    
        /**
         * 解析 React Fiber 树寻找拥有 handleGoToMarketplace 方法的组件实例
         * 用于实现「一键直达市场」功能
         */
        function resolveMarketplaceHandlerHost() {
            if (_fiberHostCache && (Date.now() - _fiberHostCachedAt) < FIBER_CACHE_TTL) {
                const fn = _fiberHostCache.handleGoToMarketplace || _fiberHostCache.goToMarketplace || _fiberHostCache.openMarketplace;
                if (typeof fn === "function") return _fiberHostCache;
                _fiberHostCache = null; _fiberHostCachedAt = 0;
            }
            if (window.PGE?.core && (typeof window.PGE.core.handleGoToMarketplace === "function" || typeof window.PGE.core.goToMarketplace === "function" || typeof window.PGE.core.openMarketplace === "function")) {
                _fiberHostCache = window.PGE.core; _fiberHostCachedAt = Date.now(); return window.PGE.core;
            }
            const roots = [];
            const pushRoot = (node) => { if (!node || typeof node !== "object" || roots.includes(node)) return; roots.push(node); };
            const rootEl = document.getElementById("root");
            if (rootEl) {
                pushRoot(rootEl._reactRootContainer?.current);
                pushRoot(rootEl._reactRootContainer?._internalRoot?.current);
                for (const key of Object.getOwnPropertyNames(rootEl)) {
                    if (key.startsWith("__reactContainer") || key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance")) pushRoot(rootEl[key]);
                }
            }
            for (const key of Object.getOwnPropertyNames(document.body || {})) {
                if (key.startsWith("__reactContainer") || key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance")) pushRoot(document.body[key]);
            }
            if (!roots.length) return null;
            const seen = new Set();
            const stack = [...roots];
            let visited = 0;
            while (stack.length && visited < FIBER_MAX_DEPTH) {
                const fiber = stack.pop();
                if (!fiber || typeof fiber !== "object" || seen.has(fiber)) continue;
                seen.add(fiber); visited++;
                const stateNode = fiber.stateNode;
                if (stateNode && (typeof stateNode.handleGoToMarketplace === "function" || typeof stateNode.goToMarketplace === "function" || typeof stateNode.openMarketplace === "function")) {
                    _fiberHostCache = stateNode; _fiberHostCachedAt = Date.now(); return stateNode;
                }
                if (fiber.child) stack.push(fiber.child);
                if (fiber.sibling) stack.push(fiber.sibling);
            }
            return null;
        }
    
        /** 通过 React Fiber 内部方法打开市场页面（尝试多种参数组合） */
        function openMarketplaceByCore(itemId) {
            const hrid = toItemHrid(itemId);
            if (!hrid) return false;
            const host = resolveMarketplaceHandlerHost();
            if (!host) return false;
            const fn = host.handleGoToMarketplace || host.goToMarketplace || host.openMarketplace;
            if (typeof fn !== "function") return false;
            const argSets = [[hrid, 0], [hrid], [normalizeCartItemId(itemId), 0], [normalizeCartItemId(itemId)]];
            for (const args of argSets) {
                try { fn.call(host, ...args); return true; } catch (e) { /* next */ }
            }
            return false;
        }
    
        /** 判断 href 是否匹配指定物品 ID */
        function matchesItemIdFromHref(rawHref, itemId) {
            const href = String(rawHref || "").toLowerCase();
            const id = normalizeCartItemId(itemId).toLowerCase();
            if (!href || !id) return false;
            return href.includes(`#${id}`) || href.includes(`/items/${id}`) || href.endsWith(id);
        }
    
        /** 打开市场（通过 React 内部方法） */
        function openMarketplaceForItem(itemId) {
            return openMarketplaceByCore(itemId);
        }
    
        /** 找到当前可见的市场面板 */
        function findVisibleMarketplacePanel() {
            const panels = [...document.querySelectorAll('[class*="MarketplacePanel_marketplacePanel"]')];
            return panels.find((panel) => isVisible(panel)) || null;
        }
    
        /** 清除所有市场高亮标记 */
        function clearMarketTargetHighlight() {
            document.querySelectorAll(".mwi-mm-market-target").forEach((node) => {
                if (node instanceof Element) node.classList.remove("mwi-mm-market-target");
            });
        }
    
        /** 收集市场面板中的所有物品节点 */
        function collectMarketItemNodes(panel) {
            if (!panel) return [];
            const selectors = [`[class*="MarketplacePanel_marketItems"] ${SEL.itemCore}`, `[class*="MarketplacePanel_currentItem"] ${SEL.itemCore}`];
            const out = [], seen = new Set();
            for (const sel of selectors) {
                for (const node of panel.querySelectorAll(sel)) {
                    if (!(node instanceof Element) || !isVisible(node) || seen.has(node)) continue;
                    seen.add(node); out.push(node);
                }
            }
            return out;
        }
    
        /** 获取物品节点的高亮宿主元素 */
        function getMarketHighlightHost(itemNode) {
            return itemNode.closest('[class*="Item_itemContainer"]') || itemNode;
        }
    
        /** 获取购物车中所有有缺料的物品 ID 列表 */
        function getCartLocateIds() {
            const ids = [], seen = new Set();
            for (const row of STATE.cart.values()) {
                if (!row || Number(row.quantity || 0) <= 0) continue;
                const id = normalizeCartItemId(row.itemId);
                if (!id || seen.has(id)) continue;
                seen.add(id); ids.push(id);
            }
            return ids;
        }
    
        /** 在市场面板中定位并高亮购物车中的物品 */
        function locateCartItemsInMarketplace(options = {}) {
            const targetId = normalizeCartItemId(options.targetItemId || STATE.marketTargetItemId || "");
            const doScroll = Boolean(options.scroll);
            clearMarketTargetHighlight();
            const locateIds = getCartLocateIds();
            if (!locateIds.length) {
                STATE.marketPanelVisible = Boolean(findVisibleMarketplacePanel());
                STATE.marketMatchCount = 0; Store.notify("ui");
                return { ok: false, marketOpen: STATE.marketPanelVisible, found: 0, matchedTypes: 0, totalTypes: 0 };
            }
            const idSet = new Set(locateIds.map((x) => x.toLowerCase()));
            const panel = findVisibleMarketplacePanel();
            if (!panel) {
                STATE.marketPanelVisible = false; STATE.marketMatchCount = 0; Store.notify("ui");
                return { ok: false, marketOpen: false, found: 0, matchedTypes: 0, totalTypes: locateIds.length };
            }
            const nodes = collectMarketItemNodes(panel);
            const matches = [], matchedTypes = new Set(), firstHostById = new Map(), seenHost = new Set();
            for (const node of nodes) {
                const href = extractIconRef(node) || extractUseHref(node);
                if (!href) continue;
                let matchedId = "";
                for (const id of idSet) { if (matchesItemIdFromHref(href, id)) { matchedId = id; break; } }
                if (!matchedId) continue;
                const host = getMarketHighlightHost(node);
                if (seenHost.has(host)) continue;
                seenHost.add(host); host.classList.add("mwi-mm-market-target");
                matches.push(host); matchedTypes.add(matchedId);
                if (!firstHostById.has(matchedId)) firstHostById.set(matchedId, host);
            }
            STATE.marketPanelVisible = true; STATE.marketMatchCount = matchedTypes.size;
            if (doScroll && matches.length > 0) {
                const preferredHost = targetId ? firstHostById.get(targetId.toLowerCase()) : null;
                const scrollHost = preferredHost || matches[0];
                try { scrollHost.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); } catch (err) { scrollHost.scrollIntoView(); }
            }
            Store.notify("ui");
            return { ok: matchedTypes.size > 0, marketOpen: true, found: matches.length, matchedTypes: matchedTypes.size, totalTypes: locateIds.length };
        }
    
        /** 设置市场定位目标并执行定位 */
        function setMarketTarget(itemId, options = {}) {
            const targetId = normalizeCartItemId(itemId);
            STATE.marketTargetItemId = targetId;
            const result = STATE.locateEnabled ? locateCartItemsInMarketplace({ ...options, targetItemId: targetId }) : { ok: false, marketOpen: Boolean(findVisibleMarketplacePanel()), found: 0, matchedTypes: 0, totalTypes: getCartLocateIds().length, disabled: true };
            Store.notify("cart"); return result;
        }
    
        /** 清除市场定位目标 */
        function clearMarketTarget() {
            STATE.marketTargetItemId = ""; STATE.marketMatchCount = 0;
            STATE.marketPanelVisible = Boolean(findVisibleMarketplacePanel());
            clearMarketTargetHighlight(); Store.notify("cart");
        }
    
        /** 切换市场定位功能开关 */
        function setLocateEnabled(enabled) {
            STATE.locateEnabled = Boolean(enabled);
            if (!STATE.locateEnabled) { STATE.marketMatchCount = 0; clearMarketTargetHighlight(); Store.notify("cart"); Store.notify("ui"); return; }
            syncMarketLocator(); Store.notify("cart");
        }
    
        /** 同步市场定位状态（用于刷新时自动重新定位） */
        function syncMarketLocator() {
            if (!STATE.locateEnabled) { STATE.marketPanelVisible = Boolean(findVisibleMarketplacePanel()); STATE.marketMatchCount = 0; clearMarketTargetHighlight(); Store.notify("ui"); return; }
            locateCartItemsInMarketplace({ scroll: false, targetItemId: STATE.marketTargetItemId });
        }
    
        /** 判断物品是否为金币（库存同步时跳过） */
        function isCoinItem(itemId) {
            const id = String(itemId || "").toLowerCase();
            return id.includes("coin") || id.includes("gold");
        }
    
        let _invSnapshot = null;   // DOM 扫描库存快照缓存
        let _invSnapshotAt = 0;     // 缓存时间戳
    
        /** 扫描 DOM 获取库存快照（有 WS 时直接用 WS 数据，否则遍历背包面板） */
        function scanInventoryDOM(forceRefresh = false) {
            if (_wsInventory.ready) { const snapshot = _wsInventory.getSnapshot(); _invSnapshot = snapshot; _invSnapshotAt = Date.now(); return snapshot; }
            const now = Date.now();
            if (!forceRefresh && _invSnapshot && (now - _invSnapshotAt) < 200) return _invSnapshot;
            const result = new Map();
            const inventoryPanels = document.querySelectorAll('[class*="Inventory_inventory"]');
            if (!inventoryPanels.length) { _invSnapshot = result; _invSnapshotAt = now; return result; }
            for (const panel of inventoryPanels) {
                for (const container of panel.querySelectorAll('[class*="Item_itemContainer"]')) {
                    try {
                        const useEl = container.querySelector('svg use[href]');
                        if (!useEl) continue;
                        const href = useEl.getAttribute("href") || "";
                        const hashIdx = href.lastIndexOf("#");
                        if (hashIdx < 0) continue;
                        const rawId = href.slice(hashIdx + 1);
                        if (!rawId) continue;
                        const countEl = container.querySelector('[class*="Item_count"]');
                        const countText = countEl?.textContent?.trim() || "0";
                        const count = parseInt(countText.replace(/[,\s]/g, ""), 10) || 0;
                        if (count > 0) result.set(rawId, (result.get(rawId) || 0) + count);
                    } catch (err) { /* ignore */ }
                }
            }
            _invSnapshot = result; _invSnapshotAt = now; return result;
        }
    
        /** 获取指定物品的库存数量（WS 优先，回退 DOM） */
        function getInventoryCount(itemId) {
            const id = normalizeCartItemId(itemId);
            if (!id) return 0;
            if (_wsInventory.ready) return _wsInventory.getCount(id);
            const snapshot = scanInventoryDOM();
            return snapshot.get(id) || 0;
        }
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §07 业务流程 Biz
        //     有效库存与锁定 / 购齐通知 / 库存同步 / 持久化 / 购物车与计划 CRUD
        //     约束:改数据后只发通知不碰 DOM —— 已完成 Store.notify 接线
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 有效库存（扣除其他计划锁定量）──────────────────
        /** 获取有效库存（实际库存减去其他制作计划的锁定量） */
        function getEffectiveInventory(itemId, excludeRecipeHrid) {
            const raw = getInventoryCount(itemId);
            if (!STATE.craftingPlansEnabled || !STATE.craftingPlans.size) return raw;
            const bareId = normalizeCartItemId(itemId);
            // excludeRecipeHrid 可以是 string 或 Set<string>
            const isSet = excludeRecipeHrid instanceof Set;
            let locked = 0;
            for (const plan of STATE.craftingPlans.values()) {
                if (isSet ? excludeRecipeHrid.has(plan.recipeHrid) : plan.recipeHrid === excludeRecipeHrid) continue;
                if (plan.status === "completed") continue;
                locked += plan.materials[bareId] || 0;
            }
            return Math.max(0, raw - locked);
        }
    
        // ── 锁定明细（徽章和 summary 的锁定提示用）──────────
        /**
         * 获取物品被其他制作计划锁定的明细。
         * 与 getEffectiveInventory 的遍历逻辑对称，但返回锁定数据而非有效库存。
         * @returns {{ total: number, byPlan: Array<{name:string, qty:number}> }}
         */
        function getLockedDetails(itemId, excludeRecipeHrid) {
            const empty = { total: 0, byPlan: [] };
            if (!STATE.craftingPlansEnabled || !STATE.craftingPlans.size) return empty;
            const bareId = normalizeCartItemId(itemId);
            if (!bareId) return empty;
            const isSet = excludeRecipeHrid instanceof Set;
            const byPlan = [];
            let total = 0;
            for (const plan of STATE.craftingPlans.values()) {
                if (isSet ? excludeRecipeHrid.has(plan.recipeHrid) : plan.recipeHrid === excludeRecipeHrid) continue;
                if (plan.status === "completed") continue;
                const qty = plan.materials[bareId] || 0;
                if (qty <= 0) continue;
                total += qty;
                byPlan.push({ name: plan.recipeName || plan.recipeHrid, qty });
            }
            return { total, byPlan };
        }
    
        /** 重置所有购物车项的基线库存（用于重新校准同步） */
        function resetAllBaselines() {
            const snapshot = scanInventoryDOM(true);
            for (const row of STATE.cart.values()) {
                const id = normalizeCartItemId(row.itemId);
                row.baselineStock = snapshot.get(id) || 0;
            }
            saveCart();
        }
    
        /** 购物车面板是否处于打开状态 */
    
        // ── 采购完成 → 导航栏内联横幅（替代自动跳转，满足 1:1 人机对应） ──
        /** 当物品购齐被移出购物车时，通知导航栏显示内联完成横幅 */
        function _notifyNavItemFulfilled(removedNames, removedRows) {
            // ★ 记录已购齐物品(即使市场没开也要记，否则下次开市场时它们不会出现在导航条上)
            _purchaseNav.noteFulfilled(removedRows || []);
            if (!findVisibleMarketplacePanel()) return;
            // 找下一个待购物品
            const candidates = [...STATE.cart.values()]
                .filter(r => r.quantity > 0 && !isCoinItem(r.itemId))
                .sort((a, b) => {
                    if (a.starred && !b.starred) return -1;
                    if (!a.starred && b.starred) return 1;
                    return a.name.localeCompare(b.name, _getLocale());
                });
            _purchaseNav._onItemFulfilled(candidates[0] || null);
        }
    
        /**
         * 库存同步：将购物车缺料与实际库存变化对比
         * - 库存增加 → 减少缺料
         * - 库存减少 → 更新基线
         * - 常备量不足 → 自动回填
         */
        function syncCartWithInventory() {
            if (!STATE.inventorySyncEnabled || !STATE.cart.size) return;
            const snapshot = scanInventoryDOM(true);
            if (!snapshot.size) return;
            let changed = false;
            const toRemove = [];
            for (const [id, row] of STATE.cart) {
                if (isCoinItem(id)) continue;
                const currentStock = snapshot.get(normalizeCartItemId(id)) || 0;
                if (row.baselineStock == null) { row.baselineStock = currentStock; continue; }
                if (currentStock === row.baselineStock) continue;
                if (currentStock < row.baselineStock) { row.baselineStock = currentStock; continue; }
                const acquired = currentStock - row.baselineStock;
                row.baselineStock = currentStock;
                row.quantity = Math.max(0, row.quantity - acquired);
                changed = true;
                if (row.quantity <= 0) {
                    if (row.starred) row.quantity = 0;
                    else toRemove.push(id);
                }
            }
            const refilled = [];
            const nowTs = Date.now();
            for (const [id, row] of STATE.cart) {
                if (!row.starred || !row.threshold || row.threshold <= 0) continue;
                // ★ 用户手动改数量 5 分钟内不自动回填，避免覆盖
                if (row._manualOverrideUntil && nowTs < row._manualOverrideUntil) continue;
                const currentStock = snapshot.get(normalizeCartItemId(id)) || 0;
                if (currentStock < row.threshold) {
                    const newQty = row.threshold - currentStock;
                    if (newQty !== row.quantity) {
                        row.quantity = newQty; row.baselineStock = currentStock;
                        row._justRefilled = true; changed = true; refilled.push(resolveCartDisplayName(row));
                    }
                }
            }
            // ★ 先快照被移除的行(删除后就取不到了)，供导航条把已购齐物品留在原位显示
            const removedRows = toRemove.map(id => {
                const row = STATE.cart.get(id);
                if (!row) return null;
                return { itemId: row.itemId, name: resolveCartDisplayName(row), iconRef: row.iconRef || "" };
            }).filter(Boolean);
            const removedNames = removedRows.map(r => r.name);
            for (const id of toRemove) STATE.cart.delete(id);
            if (changed) {
                saveCart(); Store.notify("cart");
                if (toRemove.length) showToast(t("toast_auto_removed", toRemove.length), "info");
                if (refilled.length === 1) showToast(t("toast_refill_one", refilled[0]), "info");
                else if (refilled.length > 1) showToast(t("toast_refill_multi", refilled[0], refilled.length), "info");
                const activeCount = [...STATE.cart.values()].filter(r => r.quantity > 0).length;
                if (activeCount === 0 && STATE.autoCollapseEnabled) {
                    // 全部购齐且面板开着 → 自动收起
                    try { if (_newShell.isOpenUI()) { _newShell.collapseUI(); showToast(t("toast_all_fulfilled"), "success"); } } catch (err) { /* ignore */ }
                }
                if (toRemove.length) _notifyNavItemFulfilled(removedNames, removedRows);
            }
        }
    
        let _syncDebounceTimer = null;
        /** 触发库存同步（去抖） */
        function triggerInventorySync(delay = 50) {
            if (!STATE.inventorySyncEnabled) return;
            if (_syncDebounceTimer) return;
            _syncDebounceTimer = setTimeout(() => { _syncDebounceTimer = null; syncCartWithInventory(); }, delay);
        }
    
        /**
         * 判断当前是否在「当前行动」模式（而非配方列表）
         * ★ 接受 scopeModal 参数，将 tab 搜索限定在 modal 所属的面板容器内，
         *   避免其他技能面板的 tab 状态干扰当前面板的判断。
         */
        function isCurrentActionMode(scopeModal) {
            let searchRoot = document;
            if (scopeModal) {
                const container = scopeModal.closest('[class*="MainPanel_subPanelContainer"]')
                    || scopeModal.closest('[class*="MainPanel_mainPanel"]')
                    || scopeModal.parentElement;
                if (container) searchRoot = container;
            }
            const selectedTabs = [...searchRoot.querySelectorAll('button.Mui-selected[role="tab"], button[aria-selected="true"][role="tab"]')];
            for (const tab of selectedTabs) {
                if (!isVisible(tab)) continue;
                const text = safeText(tab.textContent || "", 40);
                if (/当前行动|current\s*action/i.test(text)) return true;
            }
            return false;
        }
    
        /** 判断弹窗是否包含原生行动次数输入框 */
        function hasNativeActionCountInput(modal) {
            if (!modal) return false;
            for (const scope of _getActionCountScopes(modal)) {
                const containers = [...scope.querySelectorAll('[class*="SkillActionDetail_maxActionCountInput"]')].filter((el) => isVisible(el));
                for (const container of containers) {
                    const input = container.querySelector('input[class*="Input_input"]');
                    if (input && isVisible(input)) return true;
                }
            }
            return false;
        }
    
        /** 等待游戏页面加载完成（检测 GamePage 存在且无加载遮罩） */
        function waitForGameReady() {
            return new Promise((resolve) => {
                function check() {
                    const gamePage = document.querySelector('[class*="GamePage_gamePage"], [class^="GamePage"]');
                    if (!gamePage) return false;
                    const loadingOverlay = document.querySelector('[class*="LoadingContainer"], [class*="ConnectionStatusBar_disconnected"], [class*="ConnectionStatus_connecting"]');
                    if (loadingOverlay && isVisible(loadingOverlay)) return false;
                    return true;
                }
                if (check()) { setTimeout(resolve, 1500); return; }
                let elapsed = 0;
                const interval = setInterval(() => {
                    elapsed += 500;
                    if (check() || elapsed >= 30000) { clearInterval(interval); setTimeout(resolve, 1500); }
                }, 500);
            });
        }
    
        /** 显示 FAB 悬浮按钮并恢复保存的位置 */
        // 注:showToast 是 UI 工具,物理位置在业务区(历史原因,勿在此区新增 UI 代码)
    
        /** 显示 Toast 提示消息（1.8s 后淡出） */
        function showToast(msg, tone = "info") {
            const box = document.createElement("div");
            box.className = `mwi-mm-toast mwi-mm-toast-${tone}`;
            box.textContent = msg;
            document.body.appendChild(box);
            setTimeout(() => { box.style.opacity = "0"; box.style.transform = "translateY(-8px)"; }, 1800);
            setTimeout(() => box.remove(), 2300);
        }
    
        // ── 持久化 ──────────────────────────────────────────────────
    
        /** 保存购物车数据到 localStorage */
        function saveCart() {
            try {
                const payload = { savedAt: nowIso(), items: [...STATE.cart.values()] };
                localStorage.setItem(SCRIPT.cartKey, JSON.stringify(payload));
            } catch (err) {
                if (err.name === "QuotaExceededError") { console.warn("[mwi-mm] localStorage 配额已满"); showToast("存储空间不足，清单可能未保存", "error"); }
                else console.warn("[mwi-mm] save cart failed", err);
            }
            // ★ 广播购物车变化事件给公共 API 订阅者
            try { _apiInternal.fire("cart:change", () => ({ items: _publicAPI.getCartItems() })); }
            catch (e) { /* never block save on broadcast failure */ }
        }
    
        /** 从 localStorage 加载购物车数据 */
        function loadCart() {
            try {
                const raw = localStorage.getItem(SCRIPT.cartKey);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                const items = Array.isArray(parsed?.items) ? parsed.items : [];
                for (const row of items) {
                    if (!row || !row.itemId) continue;
                    const itemId = normalizeCartItemId(row.itemId);
                    if (!itemId) continue;
                    const qty = Number(row.quantity || 0);
                    if (!Number.isFinite(qty) || qty < 0) continue;
                    if (qty <= 0 && !row.starred) continue;
                    STATE.cart.set(itemId, {
                        itemId, name: row.name || itemId, iconRef: row.iconRef || "",
                        quantity: qty, starred: Boolean(row.starred),
                        threshold: (typeof row.threshold === "number" && row.threshold > 0) ? row.threshold : null,
                        baselineStock: row.baselineStock ?? null, source: row.source || "unknown", updatedAt: row.updatedAt || nowIso()
                    });
                }
            } catch (err) { console.warn("[mwi-mm] load cart failed", err); }
        }
    
        /** 保存开关状态到 localStorage */
        function saveToggles() {
            // 表驱动序列化;字段与顺序由 SETTINGS_SCHEMA 决定(与旧版 一致)
            try {
                const out = {};
                for (const def of SETTINGS_SCHEMA) out[def.key] = STATE[def.key];
                localStorage.setItem(SCRIPT.togglesKey, JSON.stringify(out));
            } catch (err) { /* ignore */ }
            Store.notify("settings");   // 设置变更广播(设置页据此重绘)
        }
    
        /** 从 localStorage 加载开关状态 */
        function loadToggles() {
            // 表驱动读取;各 type 的校验语义与旧版 的逐字段写法 1:1 等价:
            //   bool     → typeof === "boolean" 才覆盖
            //   num      → typeof === "number" 且通过 validate 才覆盖(zScore 范围 / 暴饮袋 -1..20)
            //   shortcut → 对象且 code 为非空字符串才覆盖,并做字段归一化(与原结构校验一致)
            try {
                const raw = localStorage.getItem(SCRIPT.togglesKey);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                for (const def of SETTINGS_SCHEMA) {
                    const v = parsed[def.key];
                    if (def.type === "bool") {
                        if (typeof v === "boolean") STATE[def.key] = v;
                    } else if (def.type === "num") {
                        if (typeof v === "number" && (!def.validate || def.validate(v))) STATE[def.key] = v;
                    } else if (def.type === "enum") {
                        if (typeof v === "string" && def.values && def.values.includes(v)) STATE[def.key] = v;
                    } else if (def.type === "shortcut") {
                        if (v && typeof v === "object" && typeof v.code === "string" && v.code) {
                            // 显示名自愈 —— 录制器存过空白显示名(Space → " "),按 code 重建
                            let disp = String(v.display || "").trim();
                            if (!disp) {
                                if (v.code === "Space") disp = "Space";
                                else if (v.code.startsWith("Arrow")) disp = v.code.slice(5);
                                else if (v.code.startsWith("Key") && v.code.length === 4) disp = v.code.slice(3);
                                else disp = v.code;
                            }
                            STATE[def.key] = {
                                code: String(v.code),
                                display: disp,
                                ctrl: !!v.ctrl, shift: !!v.shift, alt: !!v.alt, meta: !!v.meta
                            };
                        }
                    }
                }
            } catch (err) { /* ignore */ }
        }
    
        // ── 制作计划持久化 ──────────────────────────────────
    
        /** 保存制作计划到 localStorage */
        function savePlans() {
            try {
                const arr = [...STATE.craftingPlans.values()];
                localStorage.setItem(SCRIPT.plansKey, JSON.stringify({ savedAt: nowIso(), plans: arr }));
            } catch (err) { /* ignore */ }
        }
    
        /** 从 localStorage 加载制作计划 */
        function loadPlans() {
            try {
                const raw = localStorage.getItem(SCRIPT.plansKey);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                const plans = Array.isArray(parsed?.plans) ? parsed.plans : [];
                for (const p of plans) {
                    if (!p || !p.recipeHrid) continue;
                    if (p.status === "completed") continue;
                    STATE.craftingPlans.set(p.recipeHrid, {
                        recipeHrid: p.recipeHrid,
                        recipeName: p.recipeName || p.recipeHrid,
                        craftCount: p.craftCount || 1,
                        materials: p.materials || {},
                        materialsPerAction: p.materialsPerAction || {},
                        status: p.status || "active",
                        craftedCount: p.craftedCount || 0,
                        // 快照进度字段（老版本存档无此字段 → 取空值，加载后不显示进度条，锁与手动完成不受影响）
                        outputItemId: p.outputItemId || "",
                        outputPerAction: p.outputPerAction || 1,
                        baselineOutput: (typeof p.baselineOutput === "number") ? p.baselineOutput : null,
                        createdAt: p.createdAt || nowIso(),
                        updatedAt: p.updatedAt || nowIso()
                    });
                }
            } catch (err) { console.warn("[mwi-mm] load plans failed", err); }
        }
    
        /** 创建或更新制作计划（记录配方所需材料及数量） */
        function createOrUpdatePlan(recipeHrid, recipeName, craftCount, allItems) {
            if (!recipeHrid) return;
            const materials = {};
            const materialsPerAction = {};
            for (const item of allItems) {
                const bareId = normalizeCartItemId(item.itemId);
                if (bareId && !isCoinItem(bareId)) {
                    materials[bareId] = item.totalNeeded;
                    materialsPerAction[bareId] = item.needPerAction || (craftCount > 0 ? item.totalNeeded / craftCount : item.totalNeeded);
                }
            }
            if (!Object.keys(materials).length) return;
            // 派生产出物信息：仅生产类配方有干净产出物；其余 outputItemId 留空 → 无进度条（锁不受影响）
            // 用可选链安全读取数据层（早期未就绪时自然得到空值，非吞错）
            const _action = _dataLayer?._actionMap?.[recipeHrid] || null;
            let outputItemId = "", outputPerAction = 1;
            if (_action && _action.function === "/action_functions/production" && _action.outputItems?.[0]) {
                outputItemId = String(_action.outputItems[0].itemHrid || "").replace(/^\/items\//, "");
                outputPerAction = _action.outputItems[0].count || 1;
            }
            const existing = STATE.craftingPlans.get(recipeHrid);
            if (existing) {
                existing.materials = materials;
                existing.materialsPerAction = materialsPerAction;
                existing.craftCount = craftCount;
                existing.craftedCount = 0;
                existing.status = "active";
                existing.updatedAt = nowIso();
                // 已有快照基线则保留（避免重新加购/改数量导致进度跳变）；
                // 缺失时（老版本计划或此前未取到产出信息）就地补建基线
                if (!existing.outputItemId || typeof existing.baselineOutput !== "number") {
                    existing.outputItemId = outputItemId;
                    existing.outputPerAction = outputPerAction;
                    existing.baselineOutput = outputItemId ? getInventoryCount(outputItemId) : null;
                }
            } else {
                STATE.craftingPlans.set(recipeHrid, {
                    recipeHrid, recipeName, craftCount, materials, materialsPerAction,
                    status: "active", craftedCount: 0,
                    outputItemId, outputPerAction,
                    baselineOutput: outputItemId ? getInventoryCount(outputItemId) : null,
                    createdAt: nowIso(), updatedAt: nowIso()
                });
            }
            savePlans();
            Store.notify("plans");
        }
    
        /** 更新计划制作数量并重算材料锁定 */
        function updatePlanCraftCount(recipeHrid, newCount) {
            const plan = STATE.craftingPlans.get(recipeHrid);
            if (!plan) return;
            const count = Math.max(1, Math.round(newCount) || 1);
            plan.craftCount = count;
            // 用 perAction 重算总锁定量
            if (plan.materialsPerAction) {
                for (const [bareId, perAction] of Object.entries(plan.materialsPerAction)) {
                    plan.materials[bareId] = Math.ceil(perAction * count - 1e-9);
                }
            }
            plan.updatedAt = nowIso();
            savePlans();
            Store.notify("plans");
            STATE.lastDataSignature = "";
            refreshNow();
        }
    
        /** 删除指定制作计划 */
        function removePlan(recipeHrid) {
            STATE.craftingPlans.delete(recipeHrid);
            savePlans();
            Store.notify("plans");
            STATE.lastDataSignature = "";
            refreshNow();
        }
    
        /**
         * 计算计划进度（半自动·快照法）。
         * 进度 = 当前产出物库存 − 建计划时的快照基线，钳制在 [0, 目标]。
         * 目标 = 计划次数 × 每次产出数。纯库存差值，离线重开仍准确。
         * 返回 null 表示无法计算（无产出物 / 无基线，如非生产类或老版本计划）→ 调用方不显示进度条。
         */
        function getPlanProgress(plan) {
            if (!plan || !plan.outputItemId) return null;
            if (typeof plan.baselineOutput !== "number") return null;
            const target = Math.max(1, Math.round((plan.craftCount || 1) * (plan.outputPerAction || 1)));
            const now = getInventoryCount(plan.outputItemId);
            const done = Math.max(0, Math.min(target, now - plan.baselineOutput));
            return { done, target, pct: target > 0 ? Math.round(done / target * 100) : 0 };
        }
    
        /** 清空所有制作计划 */
        function clearAllPlans() {
            STATE.craftingPlans.clear();
            savePlans();
            Store.notify("plans");
            STATE.lastDataSignature = "";
            refreshNow();
        }
    
        // ── 购物车操作 ────────────────────────────────────────────────
    
        /**
         * 添加物品到购物车的核心实现（不触发持久化/渲染）。
         * 单条插入返回 true，参数无效返回 false。
         * 用于内部批量写场景（API 数组写入、采购导航等）以减少重复 saveCart/通知。
         */
        function _addToCartCore(item) {
            if (!item || item.itemId == null) return false;
            const itemId = normalizeCartItemId(item.itemId);
            if (!itemId) return false;
            const qty = Number(item.quantity || 0);
            if (!Number.isFinite(qty) || qty <= 0) return false;
            const existing = STATE.cart.get(itemId);
            if (existing) {
                existing.quantity += qty; existing.updatedAt = nowIso();
                if (!existing.name && item.name) existing.name = item.name;
                if (item.iconRef) existing.iconRef = item.iconRef;
                if (item.source) existing.source = item.source;
            } else {
                STATE.cart.set(itemId, {
                    itemId,
                    name: item.name || itemId,
                    iconRef: item.iconRef || "",
                    quantity: qty,
                    starred: false,
                    threshold: null,
                    baselineStock: getInventoryCount(itemId),
                    source: item.source || "manual",
                    updatedAt: nowIso()
                });
            }
            return true;
        }
    
        /** 添加物品到购物车（已存在则累加数量） */
        function addToCart(item) {
            if (_addToCartCore(item)) {
                saveCart(); Store.notify("cart");
            }
        }
    
        /** 更新购物车物品数量（≤ 0 则删除或保留收藏） */
        function updateCartItemQty(itemId, newQty) {
            const id = normalizeCartItemId(itemId);
            if (!id) return;
            const row = STATE.cart.get(id);
            if (!row) return;
            const qty = Number(newQty);
            if (!Number.isFinite(qty) || qty <= 0) {
                if (row.starred) row.quantity = 0;
                else STATE.cart.delete(id);
            } else {
                row.quantity = qty;
                row.baselineStock = getInventoryCount(id);
                row.updatedAt = nowIso();
                // ★ 手动改过数量后 5 分钟内，自动回填不要覆盖用户的修改
                row._manualOverrideUntil = Date.now() + 5 * 60 * 1000;
            }
            saveCart(); Store.notify("cart");
        }
    
        /** 从购物车移除物品 */
        function removeCartItem(itemId) { STATE.cart.delete(normalizeCartItemId(itemId)); saveCart(); Store.notify("cart"); }
    
        /** 切换购物车物品的收藏状态 */
        function toggleCartItemStar(itemId) {
            const id = normalizeCartItemId(itemId);
            if (!id) return;
            const row = STATE.cart.get(id);
            if (!row) return;
            if (row.starred && row.threshold) row.threshold = null;
            row.starred = !row.starred;
            if (!row.starred && row.quantity <= 0) STATE.cart.delete(id);
            saveCart(); Store.notify("cart");
        }
    
        /** 清空整个购物车 */
        function clearCart() { STATE.cart.clear(); saveCart(); Store.notify("cart"); }
    
        /** 清除未收藏物品 */
        function clearNonStarred() {
            let removed = 0;
            for (const [id, row] of STATE.cart) { if (!row.starred) { STATE.cart.delete(id); removed++; } }
            saveCart(); Store.notify("cart"); return removed;
        }
    
        /** 设置物品常备量阈值（低于此值自动回填缺料） */
        function setCartItemThreshold(itemId, value) {
            const id = normalizeCartItemId(itemId);
            if (!id) return;
            const row = STATE.cart.get(id);
            if (!row) return;
            const val = Number(value);
            if (!Number.isFinite(val) || val <= 0) { row.threshold = null; }
            else {
                row.threshold = Math.ceil(val);
                if (!row.starred) row.starred = true;
                const currentStock = getInventoryCount(id);
                if (currentStock < row.threshold) { row.quantity = row.threshold - currentStock; row.baselineStock = currentStock; }
            }
            saveCart(); Store.notify("cart");
        }
    
        /** 清除物品常备量阈值 */
        function clearCartItemThreshold(itemId) { setCartItemThreshold(itemId, 0); }
    
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §07A Actions —— UI 操作入口清单
        //     纪律:未来的新 UI 只允许调用 Actions / Store / saveToggles 三者,
        //     不得直接触碰 §04–§08 的内部函数。函数声明提升,别名定义即生效。
        // ════════════════════════════════════════════════════════════════════════
        const Actions = {
            // 购物车
            addToCart, updateCartItemQty, removeCartItem, toggleCartItemStar,
            clearCart, clearNonStarred, setCartItemThreshold, clearCartItemThreshold,
            // 制作计划
            createOrUpdatePlan, updatePlanCraftCount, removePlan, clearAllPlans,
            // 市场定位与跳转
            // 注:个别别名(clearCartItemThreshold/resetAllBaselines/setMarketTarget/clearMarketTarget)
            // 当前无调用者,作为操作面完整性保留,供 UI 演进使用。
            openMarketplaceForItem, setMarketTarget, clearMarketTarget,
            setLocateEnabled, locateCartItemsInMarketplace,
            // 库存基线
            resetAllBaselines
        };
    
        // ════════════════════════════════════════════════════════════════════════
        // §08 面板检测与需求提取 Extract
        //     findActiveModal / 房屋面板 / 数据层路径与 DOM 回退双路径并存
        //     DOM 回退路径是数据层不可用时的备援,需长期保留
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 面板检测 ──────────────────────────────────────────────────
    
        // ★ 获取当前可见的主面板容器（非 hidden 的 subPanelContainer）
        //   游戏切换技能页面时不销毁旧面板，只是用 MainPanel_hidden 隐藏容器。
        /** 详情面板候选是否位于隐藏的主面板容器内(切页后残留在 DOM 的旧面板)。
         *  检测器搜索范围为全文档(弹窗等容器外顶层 UI 可见即检),仅排除此类隐藏旧面板。 */
        function _inHiddenMainContainer(node) {
            const c = node.closest?.('[class*="MainPanel_subPanelContainer"]');
            if (!c) return false;                       // 容器外(弹窗等顶层 UI)→ 不算隐藏
            const cls = c.className || "";
            if (cls.includes("hidden") || cls.includes("Hidden")) return true;
            return !isVisible(c);
        }
    
        function findActiveModal() {
            // 两遍扫描:先扫主面板容器之外的候选(弹窗层),再扫容器内的内联详情。
            const all = [...document.querySelectorAll(SEL.detailRoot)];
            const inMain = (n) => !!n.closest?.('[class*="MainPanel_subPanelContainer"]');
            const nodes = [...all.filter((n) => !inMain(n)), ...all.filter(inMain)];
            for (const node of nodes) {
                if (!isVisible(node)) continue;
                if (_inHiddenMainContainer(node)) continue;
                if (!node.querySelector(SEL.requirements)) continue;
                // 去掉 regularComponent 白名单门禁 —— 它是炼金/强化「在插件眼中不存在」
                //   (徽章+加购按钮一起消失)的根因。现在凡有需求容器的可见技能详情面板都纳入,
                //   语义在 extractRequirements 内由 actionDetail.function 区分。
                return node;
            }
            return null;
        }
    
        /** 查找当前可见的房屋建造面板（Modal 弹窗中） */
        function findActiveHousePanel() {
            // ★ 修复: 房屋面板在 Modal 弹窗中（Modal_modal → HousePanel_modalContent），
            //   不在 MainPanel_subPanelContainer 内，因此直接搜索 document。
            const nodes = [...document.querySelectorAll(SEL.houseRoot)];
            for (const node of nodes) {
                if (!isVisible(node)) continue;
                if (!node.querySelector(SEL.houseRequirements)) continue;
                return node;
            }
            return null;
        }
    
        // ★ Housing 面板签名缓存 — 数据未变时跳过 DOM 写入，减少 mutation 风暴
        let _lastHouseSignature = null;
    
        /** 根据面板标题 + 需求格子文本生成轻量签名 */
        function getHousingSignature(panel) {
            const name = panel.querySelector('[class*="HousePanel_header"]')?.textContent?.trim() || '';
            const costs = [...panel.querySelectorAll('[class*="HousePanel_itemRequirementCell"]')]
                .map(el => el.textContent.trim())
                .join('|');
            return name + '::' + costs;
        }
    
    
        // ── 数据层路径 — 从面板标题识别配方 ──────────────────
    
        /** 从技能面板中提取配方标题文字 */
        function _extractPanelTitle(modal) {
            for (const sel of [
                '[class*="SkillActionDetail_name"]',
                '[class*="SkillActionDetail_title"]',
                '[class*="SkillActionDetail_header"]'
            ]) {
                const el = modal.querySelector(sel);
                if (el && isVisible(el)) {
                    const text = textWithoutInjected(el).trim();
                    if (text && text.length > 0 && text.length < 80) return text;
                }
            }
            return "";
        }
    
        /**
         * 只保留真正的材料物品列。
         * 某些第三方插件会把「需要:445个」提示套用 Item_itemContainer 游戏类名，
         * 并作为 requirements 的直接子元素插入。仅凭类名会让材料列与库存/消耗列
         * 索引错位，造成无 ID、漏掉后续材料及数量套到错误物品。
         */
        function _pickRequirementItemRows(requirementsEl) {
            if (!requirementsEl) return [];
            const raw = [...requirementsEl.querySelectorAll(`:scope > ${SEL.requirementItems}`)];
            const gameRows = raw.filter(hasGameClass);
            const candidates = gameRows.length ? gameRows : raw;
            const identified = candidates.filter((row) => {
                const itemCore = row.querySelector(SEL.itemCore) || row;
                const href = extractIconRef(itemCore) || extractUseHref(itemCore);
                return isLikelyItemRef(href);
            });
            // 正常游戏材料列都带物品 SVG/HRID。只有完全无法识别时才 fail-open，
            // 保留旧 DOM 回退能力，避免游戏未来改版时整张清单消失。
            return identified.length ? identified : candidates;
        }
    
        /** 通过 SVG 图标匹配产出物品，反向查找对应的制作配方 */
        function _resolveActionBySvg(modal) {
            if (!_dataLayer._outputToAction) return null;
            const svgUses = [...modal.querySelectorAll("svg use")];
            const candidates = new Map();
            for (const use of svgUses) {
                const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
                if (!href.includes("items_sprite") || !href.includes("#")) continue;
                const bareId = href.split("#").pop();
                if (!bareId) continue;
                const itemHrid = `/items/${bareId}`;
                const action = _dataLayer._outputToAction.get(itemHrid);
                if (action && action.inputItems && action.inputItems.length > 0) {
                    candidates.set(action.hrid, action);
                }
            }
            if (candidates.size === 1) return [...candidates.values()][0];
            return null;
        }
    
        /**
         * 从数据层构建缺料信息（优先于 DOM 解析）
         * 白名单策略：仅当 regularComponent 存在时才使用数据层，
         * 避免在炼金/强化之类面板上误匹配。
         */
        function _buildRequirementsFromData(modal, trace, ctx) {
            // 配方识别优先用 React Fiber 读到的确定 actionHrid(ctx.actionHrid);
            //   拿不到 ctx 时才回退标题/SVG 启发式。无 ctx 且无 regularComponent → DOM 未就绪,放弃。
            const title = _extractPanelTitle(modal);   // 函数作用域:既供标题/SVG 回退,也供底部 _recipeName 显示名
            let actionEntry = (ctx && ctx.actionHrid) ? _dataLayer.resolveActionByHrid(ctx.actionHrid) : null;
            if (!actionEntry) {
                if (!ctx && !modal.querySelector('[class*="SkillActionDetail_regularComponent"]')) { if (trace) trace.push("无 ctx 且无 regularComponent(DOM 未就绪)"); return null; }
                actionEntry = title ? _dataLayer.resolveActionByTitle(title) : null;
                if (!actionEntry) actionEntry = _resolveActionBySvg(modal);
            }
            if (!actionEntry || !actionEntry.inputItems || !actionEntry.inputItems.length) { if (trace) trace.push("配方未解析(ctx=" + JSON.stringify(ctx && ctx.actionHrid) + ", 标题/SVG 回退" + (actionEntry ? "命中但无材料" : "未命中") + ")"); return null; }
    
            if (actionEntry.function !== "/action_functions/production") { if (trace) trace.push("非生产类配方: " + actionEntry.function); return null; }
    
            let actionCount = readActionCount(modal);
            const inCurrentAction = isCurrentActionMode(modal);
            const noNativeInput = !hasNativeActionCountInput(modal);
            const needManualCount = inCurrentAction && noNativeInput;
    
            if (needManualCount && STATE.manualActionCount > 0) {
                actionCount = { value: STATE.manualActionCount, raw: String(STATE.manualActionCount), infinite: false };
            }
    
            const requirementsEl = modal.querySelector(SEL.requirements);
            // 仅保留带游戏 CSS-Modules 类名的节点 — 防第三方仿冒类名的注入节点
            //       顶失败下方的行数交叉校验(校验失败会整体退到易污染的 DOM 解析路径)
            const requirementItems = _pickRequirementItemRows(requirementsEl);
            const inventoryEls = requirementsEl ? [...requirementsEl.querySelectorAll(`:scope > ${SEL.requirementInventory}`)].filter(hasGameClass) : [];
            const inputEls = requirementsEl ? [...requirementsEl.querySelectorAll(`:scope > ${SEL.requirementInput}`)].filter(hasGameClass) : [];
    
            if (requirementItems.length > 0 && requirementItems.length !== actionEntry.inputItems.length) {
                if (trace) trace.push("行数交叉校验失败: DOM " + requirementItems.length + " 行 vs 数据层 " + actionEntry.inputItems.length + " 项");
                return null;
            }
    
            // 交叉校验 — 确认 DOM 中的材料图标与数据层配方的材料一致
            if (requirementItems.length > 0) {
                const dataInputIds = new Set(actionEntry.inputItems.map(i => i.itemHrid.replace(/^\/items\//, "").toLowerCase()));
                let mismatch = false;
                let identified = 0;
                for (const itemWrap of requirementItems) {
                    const itemCore = itemWrap.querySelector(SEL.itemCore) || itemWrap;
                    const href = extractIconRef(itemCore) || extractUseHref(itemCore);
                    const domId = isLikelyItemRef(href) ? normalizeItemId(href).toLowerCase() : "";
                    if (domId) {
                        identified++;
                        if (!dataInputIds.has(domId)) { mismatch = true; break; }
                    }
                }
                if (mismatch) { if (trace) trace.push("材料图标交叉校验失败(DOM 图标不在数据层配方中)"); return null; }
                if (identified === 0) { if (trace) trace.push("材料图标全部无法识别(extractIconRef 失效?)"); return null; }
            }
    
            const artisanBuff = _dataLayer._getArtisanBuff(actionEntry.type);
            const recipeHrid = actionEntry.hrid || "";
    
            const requirements = actionEntry.inputItems.map((input, index) => {
                const bareId = input.itemHrid.replace(/^\/items\//, "");
                const name = _dataLayer.hridToName(input.itemHrid) || getItemName(requirementItems[index]?.querySelector(SEL.itemCore), bareId);
                // ★ 使用有效库存（扣除其他计划的锁定量）
                const currentStock = getEffectiveInventory(bareId, recipeHrid);
                // ★ 金币不参与 artisan/Z-score 偏移计算（工匠茶不减免金币）
                const coinItem = isCoinItem(bareId);
                const zVal = _zScoreCalc._effectiveZ(actionCount.value);
                let _zExpected, _zMargin, _zTotal, needPerAction;
                if (coinItem) {
                    const linear = Math.ceil(input.count * actionCount.value - 1e-9);
                    _zExpected = linear; _zMargin = 0; _zTotal = linear;
                    needPerAction = input.count;
                } else {
                    ({ expected: _zExpected, margin: _zMargin, total: _zTotal } = _zScoreCalc.calcMaterials(input.count, actionCount.value, artisanBuff, zVal));
                    needPerAction = input.count * (1 - artisanBuff);
                }
                const totalNeeded = _zExpected;
                const totalNeededCeil = _zTotal;
                const missing = Math.max(0, totalNeededCeil - currentStock);
    
                return {
                    type: "material", index, itemId: bareId, name, currentStock,
                    needPerAction, totalNeeded, missing, missingRounded: missing,
                    canAddToCart: true, iconRef: input.itemHrid,
                    _zExpected, _zMargin, _zTotal, _isCoin: coinItem,
                    // 被其他计划锁定的明细（金币不参与）
                    lockedByOtherPlans: coinItem ? { total: 0, byPlan: [] } : getLockedDetails(bareId, recipeHrid),
                    itemWrap: requirementItems[index] || null,
                    inventoryEl: inventoryEls[index] || null,
                    inputEl: inputEls[index] || null
                };
            });
    
            let upgrade = null;
            const upgradeMeta = { containerFound: false, hasSelected: false, href: "", countText: "", parseSource: "", candidateCount: 0 };
    
            if (STATE.includeUpgrade && actionEntry.upgradeItemHrid && actionEntry.upgradeItemHrid !== "") {
                const upgHrid = actionEntry.upgradeItemHrid;
                const upgBareId = upgHrid.replace(/^\/items\//, "");
                const upgName = _dataLayer.hridToName(upgHrid) || getItemName(null, upgBareId);
                let upgStock = getEffectiveInventory(upgBareId, recipeHrid);
                const upgNeedPerAction = 1;
                const upgTotalNeeded = upgNeedPerAction * actionCount.value;
                const upgTotalCeil = Math.ceil(upgTotalNeeded - 1e-9);
    
                const matchingReq = requirements.find(r => r.itemId === upgBareId);
                let effectiveStock = upgStock;
                if (matchingReq) effectiveStock = Math.max(0, upgStock - matchingReq.totalNeeded);
                const upgMissing = Math.max(0, upgTotalCeil - effectiveStock);
    
                const container = findBestUpgradeContainer(modal);
                const countEl = container ? pickBestCountElement(container) : null;
    
                upgrade = {
                    type: "upgrade", itemId: upgBareId, name: upgName, iconRef: upgHrid,
                    currentStock: upgStock, needPerAction: upgNeedPerAction, totalNeeded: upgTotalNeeded,
                    missing: upgMissing, missingRounded: upgMissing,
                    canAddToCart: true, container: container || null, countEl,
                    // 升级材料同样记录被其他计划锁定的明细
                    lockedByOtherPlans: getLockedDetails(upgBareId, recipeHrid)
                };
                upgradeMeta.containerFound = Boolean(container);
                upgradeMeta.hasSelected = true;
                upgradeMeta.href = upgHrid;
            }
    
            const all = upgrade ? [...requirements, upgrade] : requirements;
            const missingList = all.filter(x => {
                if (!x || x.missingRounded <= 0) return false;
                if (x.itemId) return !isCoinItem(x.itemId);
                return true;
            });
    
            return {
                actionCount, requirements, upgrade, upgradeMeta,
                totalMissingTypes: missingList.length,
                totalMissingQty: missingList.reduce((sum, r) => sum + r.missingRounded, 0),
                missingList, isCurrentAction: inCurrentAction, needManualCount,
                _dataLayerUsed: true,
                _artisanBuff: artisanBuff,
                _recipeHrid: recipeHrid,
                _recipeName: title || actionEntry.name || "",
                _isUpgradeChainRecipe: !!(actionEntry.upgradeItemHrid),
                _outputItemHrid: actionEntry.outputItems?.[0]?.itemHrid || ""
            };
        }
    
        /**
         * 从制作面板提取缺料数据（DOM 回退路径）
         * 优先尝试数据层解析，失败则通过 DOM 元素读取库存/需求。
         */
        let _lastExtractPath = "";    // 提取路径变化打点(数据层↔DOM 来回切换是重要线索)
        function _noteExtractPath(path) {
            if (path !== _lastExtractPath) { _lastExtractPath = path; _log.note("extract", "路径=" + path); }
        }
        function extractRequirements(modal) {
            // 统一入口。先用 React Fiber 读确定的 actionDetail.function 决定语义,
            //   再按类型分派。production → 数据层(精确,DOM 总量兜底);alchemy/enhancing → DOM
            //   每次消耗语义。全程 fail-open:有可见需求行就一定出数据,绝不返回 null 导致整盘清空。
            const ctx = resolveActionContext(modal);
            const fn = (ctx && ctx.fn) || _inferFunctionFromDom(modal);
    
            if (fn === "/action_functions/production" || fn === "") {
                _dataLayer.ensureReady();   // 数据层未就绪时懒重试(10s 节流;就绪后仅一次布尔判断)
                if (_dataLayer.ready) {
                    try {
                        const dataResult = _buildRequirementsFromData(modal, null, ctx);
                        if (dataResult) { _noteExtractPath("数据层"); return dataResult; }
                    } catch (e) {
                        console.error("[mwi-mm] _buildRequirementsFromData failed, falling back to DOM:", e);
                    }
                }
                _noteExtractPath(fn ? "生产DOM" : "未知DOM");
                return _extractByDom(modal, { perAction: false, kind: fn ? "production" : "generic" });
            }
    
            // 炼金/强化等非生产:斜杠右侧 = 每次消耗,总需 = 每次 × 次数
            const kind = fn === "/action_functions/alchemy" ? "alchemy"
                : fn === "/action_functions/enhancing" ? "enhancing" : "other";
            _noteExtractPath(kind + "DOM");
            return _extractByDom(modal, { perAction: true, kind });
        }
    
        /**
         * 从房屋建造面板提取缺料数据
         * 房屋建造始终为单次操作，无升级物品。
         */
        function extractHouseRequirements(panel) {
            const requirementsEl = panel.querySelector(SEL.houseRequirements);
            if (!requirementsEl) {
                return { actionCount: { value: 1, raw: "1", infinite: false }, requirements: [], upgrade: null, totalMissingTypes: 0, totalMissingQty: 0, missingList: [], isCurrentAction: false, needManualCount: false, isHousePanel: true };
            }
            const actionCount = { value: 1, raw: "1", infinite: false };
            const requirementItems = _pickRequirementItemRows(requirementsEl);
            const inventoryEls = [...requirementsEl.querySelectorAll(`:scope > ${SEL.houseInventory}`)].filter(hasGameClass);
            const inputEls = [...requirementsEl.querySelectorAll(`:scope > ${SEL.houseInput}`)].filter(hasGameClass);
    
            const requirements = requirementItems.map((itemWrap, index) => {
                const itemCore = itemWrap.querySelector(SEL.itemCore) || itemWrap;
                const itemHref = extractIconRef(itemCore) || extractUseHref(itemCore);
                const itemId = isLikelyItemRef(itemHref) ? normalizeItemId(itemHref) : "";
                const name = getItemName(itemCore, itemId);
                const inventoryEl = inventoryEls[index] || null;
                const inputEl = inputEls[index] || null;
                const inventoryText = textWithoutInjected(inventoryEl) || "0";
                const inputText = textWithoutInjected(inputEl) || "0";
    
                let currentStock;
                if (_wsInventory.ready && itemId) currentStock = _wsInventory.getCount(itemId);
                else currentStock = parseInventoryValue(inventoryText);
                let needPerAction = parseRequiredPerAction(inputText);
                // L2: 越界 = 解析被第三方注入污染 → 该行按解析失败处理
                if (!rowLooksSane(currentStock, needPerAction)) {
                    warnSuspectOnce("house-row", { name, inventoryText, inputText });
                    needPerAction = 0;
                    currentStock = Math.min(Math.max(Number(currentStock) || 0, 0), MAX_SANE_STOCK);
                }
                const totalNeeded = needPerAction;
                const totalNeededCeil = Math.ceil(totalNeeded - 1e-9);
                const missing = Math.max(0, totalNeededCeil - currentStock);
    
                return { type: "material", index, itemId, name, currentStock, needPerAction, totalNeeded, missing, missingRounded: missing, canAddToCart: Boolean(itemId), iconRef: itemHref || "", itemWrap, inventoryEl, inputEl };
            });
    
            const missingList = requirements.filter((x) => {
                if (!x || x.missingRounded <= 0) return false;
                if (x.itemId) return !isCoinItem(x.itemId);
                return true;
            });
    
            return { actionCount, requirements, upgrade: null, upgradeMeta: null, totalMissingTypes: missingList.length, totalMissingQty: missingList.reduce((sum, row) => sum + row.missingRounded, 0), missingList, isCurrentAction: false, needManualCount: false, isHousePanel: true };
        }
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §09 嵌入式渲染(封存区)
        //     面板徽章 / 链树子行 / 摘要面板 —— 借游戏样式嵌入,用户已确认满意
        //     本区只随主题令牌换肤,结构与逻辑不动
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 渲染逻辑 ──────────────────────────────────────────────────
    
        /** 从面板元素向上读 React Fiber 的 actionDetail(确定的 actionHrid/function)。
         *  探针证实三类面板(制作/炼金/强化)第 1 层 memoizedProps 即带 actionDetail,故只浅走几层。
         *  读不到时返回 null,由 _inferFunctionFromDom 用 DOM 类名兜底。 */
        function resolveActionContext(modal) {
            try {
                if (!modal) return null;
                const key = Object.keys(modal).find((k) => k.startsWith("__reactFiber$"))
                    || Reflect.ownKeys(modal).find((k) => typeof k === "string" && k.startsWith("__reactFiber$"));
                if (!key) return null;
                let f = modal[key], depth = 0;
                while (f && depth < 8) {
                    const p = f.memoizedProps;
                    if (p && typeof p === "object" && p.actionDetail && p.actionDetail.hrid) {
                        const ad = p.actionDetail;
                        return { actionHrid: ad.hrid, fn: ad.function || "", name: ad.name || "" };
                    }
                    f = f.return; depth++;
                }
            } catch (e) { /* Fiber 结构变化时静默回退 DOM 判定 */ }
            return null;
        }
    
        /** Fiber 读不到时,用 DOM 类名推断 action function(兜底,非主路径)。 */
        function _inferFunctionFromDom(modal) {
            if (modal.querySelector('[class*="SkillActionDetail_regularComponent"]')) return "/action_functions/production";
            if (modal.closest && modal.closest('[class*="AlchemyPanel"]')) return "/action_functions/alchemy";
            if (modal.closest && modal.closest('[class*="EnhancingPanel"], [class*="EnhancementPanel"], [class*="EnhancePanel"]')) return "/action_functions/enhancing";
            return "";   // 未知 → extractRequirements 归入生产分支(数据层通常仍能按标题/SVG 命中)
        }
    
        /** 非生产语义的所需量解析:斜杠右侧 = 每次消耗,总需 = 每次 × 次数(炼金/强化共用)。 */
        function _resolveNeedPerAction(inputText, actionCountValue) {
            const pair = parseStockNeedPair(inputText);
            if (pair) {
                const needPerAction = pair.total;
                return { needPerAction, totalNeeded: needPerAction * actionCountValue, stockOverride: pair.stock, inferred: true };
            }
            const needPerAction = parseRequiredPerAction(inputText);
            return { needPerAction, totalNeeded: needPerAction * actionCountValue, stockOverride: null, inferred: false };
        }
    
        /** 统一 DOM 提取器。opts.perAction=false → 斜杠右侧按「总需」(resolveNeed,制作/冲泡);
         *  =true → 斜杠右侧按「每次消耗」(炼金/强化)。逐行钳制可疑值(降级该行,绝不整盘 null)。
         *  防注入过滤若把行全过滤光则回退原始行(fail-open),确保有可见行就一定出数据。 */
        function _extractByDom(modal, opts) {
            const perAction = !!(opts && opts.perAction);
            const kind = (opts && opts.kind) || "generic";
            const requirementsEl = modal.querySelector(SEL.requirements);
            if (!requirementsEl) {
                return { actionCount: { value: 1, raw: "", infinite: false }, requirements: [], upgrade: null, upgradeMeta: null, totalMissingTypes: 0, totalMissingQty: 0, missingList: [], isCurrentAction: false, needManualCount: false, _recipeHrid: null, _recipeName: _extractPanelTitle(modal) || kind };
            }
    
            let actionCount = readActionCount(modal);
            const inCurrentAction = isCurrentActionMode(modal);
            const noNativeInput = !hasNativeActionCountInput(modal);
            const needManualCount = inCurrentAction && noNativeInput;
            if (needManualCount && STATE.manualActionCount > 0) {
                actionCount = { value: STATE.manualActionCount, raw: String(STATE.manualActionCount), infinite: false };
            }
    
            // 仅生产类用有效库存(扣其他计划锁定量);非生产不参与锁定
            let domRecipeHrid = "";
            if (!perAction && _dataLayer.ready) {
                const title = _extractPanelTitle(modal);
                const ae = title ? _dataLayer.resolveActionByTitle(title) : null;
                if (ae && ae.function === "/action_functions/production") domRecipeHrid = ae.hrid || "";
            }
    
            // 防注入:仅取带游戏 CSS-Modules 类名的行;若过滤后为空但原始有行 → 回退原始(fail-open)
            const pick = (sel) => {
                const raw = [...requirementsEl.querySelectorAll(`:scope > ${sel}`)];
                const filtered = raw.filter(hasGameClass);
                return (filtered.length === 0 && raw.length > 0) ? raw : filtered;
            };
            const requirementItems = _pickRequirementItemRows(requirementsEl);
            const inventoryEls = pick(SEL.requirementInventory);
            const inputEls = pick(SEL.requirementInput);
            const countVal = actionCount.infinite ? 1 : Math.max(1, actionCount.value || 1);
    
            const requirements = requirementItems.map((itemWrap, index) => {
                const itemCore = itemWrap.querySelector(SEL.itemCore) || itemWrap;
                const itemHref = extractIconRef(itemCore) || extractUseHref(itemCore);
                const itemId = isLikelyItemRef(itemHref) ? normalizeItemId(itemHref) : "";
                const name = getItemName(itemCore, itemId);
                const inventoryEl = inventoryEls[index] || null;
                const inputEl = inputEls[index] || null;
                const inventoryText = textWithoutInjected(inventoryEl) || "0";
                const inputText = textWithoutInjected(inputEl) || "0";
    
                const resolved = perAction ? _resolveNeedPerAction(inputText, countVal) : resolveNeed(inputText, actionCount.value);
                let needPerAction = resolved.needPerAction;
                let totalNeeded = resolved.totalNeeded;
                let currentStock;
                if (_wsInventory.ready && itemId) currentStock = (!perAction && domRecipeHrid) ? getEffectiveInventory(itemId, domRecipeHrid) : _wsInventory.getCount(itemId);
                else currentStock = parseInventoryValue(inventoryText);
                if (resolved.stockOverride != null && !_wsInventory.ready) currentStock = resolved.stockOverride;
    
                if (!rowLooksSane(currentStock, needPerAction) || !(totalNeeded <= MAX_SANE_STOCK)) {
                    warnSuspectOnce(kind + "-row", { name, inventoryText, inputText });
                    needPerAction = 0; totalNeeded = 0;
                    currentStock = Math.min(Math.max(Number(currentStock) || 0, 0), MAX_SANE_STOCK);
                }
                const totalNeededCeil = Math.ceil(totalNeeded - 1e-9);
                const missing = Math.max(0, totalNeededCeil - currentStock);
                return { type: "material", index, itemId, name, currentStock, needPerAction, totalNeeded, missing, missingRounded: missing, canAddToCart: Boolean(itemId), iconRef: itemHref || "", itemWrap, inventoryEl, inputEl };
            });
    
            // 升级件仅生产类面板有(炼金/强化无)
            let upgrade = null, upgradeMeta = null, effectiveUpgrade = null;
            if (!perAction) {
                const u = extractUpgradeFromModal(modal, actionCount);
                upgrade = u.upgrade; upgradeMeta = u.upgradeMeta;
                effectiveUpgrade = STATE.includeUpgrade ? upgrade : null;
                if (effectiveUpgrade && effectiveUpgrade.itemId) {
                    if (_wsInventory.ready) effectiveUpgrade.currentStock = _wsInventory.getCount(effectiveUpgrade.itemId);
                    const upgId = normalizeCartItemId(effectiveUpgrade.itemId);
                    const matchingReq = requirements.find((r) => normalizeCartItemId(r.itemId) === upgId);
                    const baseStock = matchingReq ? Math.max(0, matchingReq.currentStock - matchingReq.totalNeeded) : effectiveUpgrade.currentStock;
                    effectiveUpgrade.missing = Math.max(0, Math.ceil(effectiveUpgrade.totalNeeded - 1e-9) - baseStock);
                    effectiveUpgrade.missingRounded = effectiveUpgrade.missing;
                }
            }
    
            const all = effectiveUpgrade ? [...requirements, effectiveUpgrade] : requirements;
            const missingList = all.filter((x) => {
                if (!x || x.missingRounded <= 0) return false;
                if (x.itemId) return !isCoinItem(x.itemId);
                return true;
            });
            return { actionCount, requirements, upgrade, upgradeMeta, totalMissingTypes: missingList.length, totalMissingQty: missingList.reduce((sum, row) => sum + row.missingRounded, 0), missingList, isCurrentAction: inCurrentAction, needManualCount, _recipeHrid: domRecipeHrid || null, _recipeName: _extractPanelTitle(modal) || kind };
        }
    
        /** 生成数据签名（用于判断是否需要重绘） */
        function buildDataSignature(data) {
            if (!data) return "";
            const base = [`ac:${formatQty(data.actionCount?.value || 1)}`, `inf:${data.actionCount?.infinite ? 1 : 0}`, `ca:${data.isCurrentAction ? 1 : 0}`, `mc:${formatQty(STATE.manualActionCount)}`, `iu:${STATE.includeUpgrade ? 1 : 0}`, `dl:${data._dataLayerUsed ? 1 : 0}`, `pl:${STATE.craftingPlansEnabled ? STATE.craftingPlans.size : 0}`, `zi:${STATE.zScoreIndex}`, `zt:${STATE.zScoreThreshold}`, `gl:${STATE.guzzlingPouchLevel}`];
            const mats = (data.requirements || []).map((row) => [row.itemId || row.name || "", formatQty(row.currentStock || 0), formatQty(row.needPerAction || 0), formatQty(row.missingRounded || 0)].join(":"));
            base.push(`m:${mats.join("|")}`);
            if (data.upgrade) base.push(["u", data.upgrade.itemId || data.upgrade.name || "", formatQty(data.upgrade.currentStock || 0), formatQty(data.upgrade.needPerAction || 0), formatQty(data.upgrade.missingRounded || 0)].join(":"));
            else base.push("u:none");
            return base.join(";");
        }
    
        /** 清除弹窗中所有插件注入的徽章标记 */
        function clearInlineBadges(modal) {
            if (!modal) return;
            withObserverSuppressed(() => {
                modal.querySelectorAll("[data-mm-badge]").forEach((el) => { el.removeAttribute("data-mm-badge"); el.removeAttribute("data-mm-badge-type"); });
                modal.querySelectorAll(".mwi-mm-upgrade-badge, .mwi-mm-upgrade-inline").forEach((el) => el.remove());
            });
        }
    
        /** 徽章逐行完整性核对(「部分抹除」也会触发补绘):
         *  每个应有徽章的行(非金币、有挂点)其挂点须仍在文档中且带 data-mm-badge;
         *  升级件若容器存活则内联章须在。任一缺失或出错 → 返回 false,守卫放行全量补绘。 */
        let _badgesFailReason = "";   // _badgesIntact 最近一次判失败的原因(诊断用)
        function _badgesIntact(modal, data) {
            try {
                for (const r of (data && data.requirements) || []) {
                    if (!r.inputEl) continue;
                    if (r.itemId && isCoinItem(r.itemId)) continue;
                    if (!r.inputEl.isConnected) { _badgesFailReason = "挂点失联:" + (r.itemId || "?"); return false; }      // 元素被 React 重挂,旧章随元素丢失
                    if (!r.inputEl.hasAttribute("data-mm-badge")) { _badgesFailReason = "章被抹:" + (r.itemId || "?"); return false; }
                }
                if (STATE.includeUpgrade && data && data.upgrade && data.upgrade.container && data.upgrade.container.isConnected) {
                    if (!modal.querySelector(".mwi-mm-upgrade-inline, .mwi-mm-upgrade-badge")) { _badgesFailReason = "升级章缺失"; return false; }
                }
                return true;
            } catch (err) { _badgesFailReason = "核对异常:" + (err && err.message); return false; }
        }
    
        /** 在技能面板材料行上渲染缺料徽章（如「缺12」「✓」） */
        function renderInlineBadges(modal, data) {
            // 构造锁定 hover 文字（徽章共用）。byPlan 按量降序，列全。
            const buildLockedHover = (locked, includeTitle) => {
                if (!locked || !locked.total || !locked.byPlan?.length) return "";
                const sorted = [...locked.byPlan].sort((a, b) => b.qty - a.qty);
                const lines = sorted.map(p => t("locked_hover_line", p.name, formatQty(p.qty)));
                return (includeTitle ? t("locked_hover_title") + "\n" : "") + lines.join("\n");
            };
            withObserverSuppressed(() => {
                const activeEls = new Set();
                const zActive = _zScoreCalc._effectiveZ(data.actionCount?.value || 1) > 0 && data._artisanBuff > 0;
                for (const row of data.requirements) {
                    if (!row.inputEl) continue;
                    // 金币行跳过 badge（金币提醒已在摘要面板显示）
                    if (row._isCoin || isCoinItem(row.itemId)) { activeEls.add(row.inputEl); continue; }
                    let badgeText, badgeType;
                    if (row.missingRounded > 0) {
                        // 缺料 badge
                        if (zActive && row._zMargin > 0) {
                            const missingBase = Math.max(0, row._zExpected - row.currentStock);
                            badgeText = ` ${t("shortage_n", formatQty(missingBase))}⁺${formatQty(row._zMargin)}`;
                        } else {
                            badgeText = ` ${t("shortage_n", formatQty(row.missingRounded))}`;
                        }
                        badgeType = "missing";
                    } else {
                        // 余量 badge — 显示做完后还剩多少
                        const surplus = row.currentStock - Math.ceil((row._zTotal || row.totalNeeded) - 1e-9);
                        if (surplus > 0) {
                            badgeText = ` ${t("surplus_n", formatQty(surplus))}`;
                            badgeType = "surplus";
                        } else {
                            badgeText = ` ${t("surplus_n", "0")}`;
                            badgeType = "ok";
                        }
                    }
                    // 追加锁定后缀（🔒N）
                    const lockedTotal = row.lockedByOtherPlans?.total || 0;
                    if (lockedTotal > 0) {
                        badgeText += `（${t("locked_badge", formatQty(lockedTotal))}）`;
                    }
                    if (row.inputEl.getAttribute("data-mm-badge") !== badgeText) row.inputEl.setAttribute("data-mm-badge", badgeText);
                    if (row.inputEl.getAttribute("data-mm-badge-type") !== badgeType) row.inputEl.setAttribute("data-mm-badge-type", badgeType);
                    // hover：z-score 公式 + 锁定明细（按需合并）
                    const lockedHover = buildLockedHover(row.lockedByOtherPlans, true);
                    let hoverText = "";
                    if (zActive && row._zMargin > 0 && row.missingRounded > 0) {
                        hoverText = t("zscore_hover", row._zExpected, row._zMargin, row._zTotal);
                    }
                    if (lockedHover) hoverText = hoverText ? hoverText + "\n\n" + lockedHover : lockedHover;
                    if (hoverText) {
                        if (row.inputEl.getAttribute("title") !== hoverText) row.inputEl.setAttribute("title", hoverText);
                    } else {
                        if (row.inputEl.hasAttribute("title")) row.inputEl.removeAttribute("title");
                    }
                    activeEls.add(row.inputEl);
                }
                if (data.upgrade && STATE.includeUpgrade) {
                    const container = data.upgrade.container || data.upgrade.countEl?.closest(SEL.upgradeContainer) || modal.querySelector(SEL.upgradeContainer);
                    if (container) {
                        const upgIsMissing = data.upgrade.missingRounded > 0;
                        let newText, upgType;
                        if (upgIsMissing) {
                            newText = t("shortage_n", formatQty(data.upgrade.missingRounded));
                            upgType = "missing";
                        } else {
                            const upgSurplus = (data.upgrade.currentStock || 0) - Math.ceil((data.upgrade.totalNeeded || 0) - 1e-9);
                            newText = upgSurplus > 0 ? t("surplus_n", formatQty(upgSurplus)) : t("surplus_n", "0");
                            upgType = upgSurplus > 0 ? "surplus" : "ok";
                        }
                        // upgrade 行追加锁定后缀
                        const upgLockedTotal = data.upgrade.lockedByOtherPlans?.total || 0;
                        if (upgLockedTotal > 0) {
                            newText += `（${t("locked_badge", formatQty(upgLockedTotal))}）`;
                        }
                        let inline = container.querySelector(".mwi-mm-upgrade-inline");
                        if (!inline) {
                            inline = document.createElement("div");
                            inline.className = "mwi-mm-upgrade-inline";
                            const warning = container.querySelector('[class*="SkillActionDetail_warning"]');
                            if (warning && warning.parentElement === container) container.insertBefore(inline, warning);
                            else container.appendChild(inline);
                        }
                        if (inline.textContent !== newText) inline.textContent = newText;
                        const hadMissing = inline.classList.contains("is-missing");
                        const hadSurplus = inline.classList.contains("is-surplus");
                        if (upgType === "missing") { if (!hadMissing) { inline.classList.add("is-missing"); inline.classList.remove("is-ok", "is-surplus"); } }
                        else if (upgType === "surplus") { if (!hadSurplus) { inline.classList.add("is-surplus"); inline.classList.remove("is-missing", "is-ok"); } }
                        else { if (hadMissing || hadSurplus) { inline.classList.add("is-ok"); inline.classList.remove("is-missing", "is-surplus"); } }
                        // upgrade 的锁定 hover
                        const upgLockedHover = buildLockedHover(data.upgrade.lockedByOtherPlans, true);
                        if (upgLockedHover) {
                            if (inline.getAttribute("title") !== upgLockedHover) inline.setAttribute("title", upgLockedHover);
                        } else {
                            if (inline.hasAttribute("title")) inline.removeAttribute("title");
                        }
                        activeEls.add(inline);
                    }
                }
                modal.querySelectorAll("[data-mm-badge]").forEach((el) => { if (!activeEls.has(el)) { el.removeAttribute("data-mm-badge"); el.removeAttribute("data-mm-badge-type"); if (el.hasAttribute("title")) el.removeAttribute("title"); } });
                modal.querySelectorAll(".mwi-mm-upgrade-inline").forEach((el) => { if (!activeEls.has(el)) el.remove(); });
    
                // 清理旧的展开按钮（已改为自动链树）
                modal.querySelectorAll(".mwi-mm-chain-btn").forEach(el => el.remove());
            });
        }
    
        /**
         * 渲染配方链子树行（table 布局 + 展开/收起）
         */
        function renderChainSubRows(panel, data) {
            let container = panel.querySelector(".mwi-mm-chain-tree");
            if (!data._isUpgradeChainRecipe || !data._outputItemHrid) {
                if (container) container.remove();
                return;
            }
            if (!container) {
                container = document.createElement("div");
                container.className = "mwi-mm-chain-tree";
                const buttonsEl = panel.querySelector(".mwi-mm-summary-buttons");
                if (buttonsEl) panel.insertBefore(container, buttonsEl);
                else panel.appendChild(container);
                // 展开/收起按钮事件委托
                container.addEventListener("click", (e) => {
                    const toggle = e.target.closest(".mwi-mm-chain-toggle");
                    if (!toggle) return;
                    STATE.chainTreeOpen = !STATE.chainTreeOpen;
                    const body = container.querySelector(".mwi-mm-chain-body");
                    const arrow = container.querySelector(".mwi-mm-chain-arrow");
                    if (body) body.style.display = STATE.chainTreeOpen ? "" : "none";
                    if (arrow) arrow.textContent = STATE.chainTreeOpen ? "▼" : "▶";
                });
            }
            const steps = _recipeChain.getChainSteps(data._outputItemHrid, data.actionCount?.value || 1);
            if (!steps.length) { container.remove(); return; }
            // ★ 收集本链所有步骤的 action HRID，显示库存时排除自身链的锁定
            const chainExcludeSet = new Set();
            for (const step of steps) {
                const act = _dataLayer._outputToAction?.get(step.stepHrid);
                if (act?.hrid) chainExcludeSet.add(act.hrid);
            }
            const arrow = STATE.chainTreeOpen ? "▼" : "▶";
            const bodyDisplay = STATE.chainTreeOpen ? "" : "none";
            let html = `<div class="mwi-mm-chain-title"><span>${t("chain_title", steps.length)}</span><button class="mwi-mm-chain-toggle"><span class="mwi-mm-chain-arrow">${arrow}</span></button></div>`;
            html += `<table class="mwi-mm-chain-body" style="display:${bodyDisplay}">`;
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const isFirst = i === 0;
                const isLast = !step.upgradeFromHrid;
                const stepLabel = isFirst ? t("chain_current") : (isLast ? t("chain_tail") : t("chain_step_from"));
                html += `<tr class="mwi-mm-chain-step-head"><td colspan="3"><label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" class="mwi-mm-chain-step-cb" data-step-index="${i}" checked style="cursor:pointer">${escapeHtml(step.stepName)} <span class="mwi-mm-chain-upgrade">${stepLabel}</span> ×${step.craftRuns}</label></td></tr>`;
                for (const mat of step.materials) {
                    const bareId = mat.hrid.replace(/^\/items\//, "");
                    const stock = getEffectiveInventory(bareId, chainExcludeSet);
                    // ★ 扣除购物车已有量，展示真实可用库存
                    const cartRow = STATE.cart.get(bareId);
                    const cartReserved = cartRow ? Math.max(0, cartRow.quantity) : 0;
                    const availableStock = Math.max(0, stock - cartReserved);
                    const missing = Math.max(0, mat.qty - availableStock);
                    const surplus = missing === 0 ? availableStock - mat.qty : 0;
                    const cls = missing > 0 ? "is-missing" : (surplus > 0 ? "is-surplus" : "is-ok");
                    const statusText = missing > 0 ? t("shortage_n", formatQty(missing)) : t("surplus_n", formatQty(surplus));
                    html += `<tr class="mwi-mm-chain-row ${cls}"><td class="mwi-mm-chain-name">${escapeHtml(mat.name)}</td>` +
                        `<td class="mwi-mm-chain-qty">${formatQty(mat.qty)}</td>` +
                        `<td class="mwi-mm-chain-stock">(${statusText})</td></tr>`;
                }
            }
            html += `</table>`;
            container.innerHTML = html;
        }
    
        /** 确保弹窗底部存在摘要面板容器（不存在则创建） */
        function ensureSummaryPanel(modal) {
            let panel = modal.querySelector(".mwi-mm-summary-panel");
            if (panel) return panel;
            panel = document.createElement("div");
            panel.className = "mwi-mm-summary-panel";
            const actionContainer = modal.querySelector(SEL.actionContainer);
            if (actionContainer?.parentElement) actionContainer.parentElement.insertBefore(panel, actionContainer);
            else {
                const upgradeBtn = modal.querySelector(SEL.houseUpgradeBtn);
                if (upgradeBtn?.parentElement) upgradeBtn.parentElement.insertBefore(panel, upgradeBtn);
                else { const costsEl = modal.querySelector(SEL.houseCosts); if (costsEl?.nextSibling) costsEl.parentElement.insertBefore(panel, costsEl.nextSibling); else modal.appendChild(panel); }
            }
            return panel;
        }
    
        /** 从游戏 DOM 中探测按钮 CSS 类名（用于保持风格一致） */
        function detectGameButtonClass() {
            const btn = document.querySelector('button[class*="Button_button"]');
            if (!btn) return "";
            return [...btn.classList].filter((c) => c.startsWith("Button_button") || c.startsWith("Button_fullWidth")).join(" ");
        }
    
        /** 生成摘要面板的结构 key（用于判断是否需要重建 DOM） */
        function buildSummaryStructureKey(data) {
            // 增加 hl（has-locked）维度 — 有/无锁定切换时重建 DOM；纯数字变化走快路径
            let hasLocked = 0;
            for (const row of data.requirements || []) {
                if (row.lockedByOtherPlans?.total > 0) { hasLocked = 1; break; }
            }
            if (!hasLocked && data.upgrade && STATE.includeUpgrade && data.upgrade.lockedByOtherPlans?.total > 0) hasLocked = 1;
            return [`manual:${data.needManualCount ? 1 : 0}`, `iu:${STATE.includeUpgrade ? 1 : 0}`, `mt:${data.totalMissingTypes}`, `mq:${formatQty(data.totalMissingQty)}`, `plan:${!STATE.craftingPlansEnabled ? "off" : data._recipeHrid ? (STATE.craftingPlans.has(data._recipeHrid) ? "y" : "n") : "?"}`, `zi:${STATE.zScoreIndex}`, `zt:${STATE.zScoreThreshold}`, `hl:${hasLocked}`].join("##");
        }
    
        /** 渲染弹窗底部的摘要面板（显示缺料统计 + 「加入购物清单」按钮） */
        function renderSummaryPanel(modal, data) {
            const panel = ensureSummaryPanel(modal);
            const structKey = buildSummaryStructureKey(data);
            const prevStructKey = panel.dataset.structKey || "";
    
            // 聚合当前配方所有材料（含 upgrade）被其他计划锁定的明细
            const computeLockSummary = () => {
                const items = [];
                const pushIfLocked = (row) => {
                    if (!row) return;
                    const locked = row.lockedByOtherPlans;
                    if (!locked || !locked.total || !locked.byPlan?.length) return;
                    items.push({ name: row.name || row.itemId || "?", total: locked.total, byPlan: locked.byPlan });
                };
                for (const row of data.requirements || []) pushIfLocked(row);
                if (data.upgrade && STATE.includeUpgrade) pushIfLocked(data.upgrade);
                if (!items.length) return { hasLocked: false, tagText: "", hoverText: "" };
                const lines = [];
                for (const it of items) {
                    lines.push(t("summary_locked_hover_item", it.name, formatQty(it.total)));
                    const sorted = [...it.byPlan].sort((a, b) => b.qty - a.qty);
                    for (const p of sorted) lines.push(t("summary_locked_hover_sub", p.name, formatQty(p.qty)));
                }
                return {
                    hasLocked: true,
                    tagText: t("summary_locked_tag", items.length),
                    hoverText: t("locked_hover_title") + "\n" + lines.join("\n")
                };
            };
            const lockSummary = computeLockSummary();
    
            if (structKey === prevStructKey) {
                withObserverSuppressed(() => {
                    const statEl = panel.querySelector(".mwi-mm-summary-head .stat");
                    if (statEl) { const newStat = data.totalMissingTypes > 0 ? t("summary_missing", data.totalMissingTypes, formatQty(data.totalMissingQty)) : t("summary_sufficient"); if (statEl.textContent !== newStat) statEl.textContent = newStat; }
                    // lockTag 文字和 hover 跟数字变化同步
                    const lockTagEl = panel.querySelector("[data-mm-locktag]");
                    if (lockTagEl && lockSummary.hasLocked) {
                        if (lockTagEl.textContent !== lockSummary.tagText) lockTagEl.textContent = lockSummary.tagText;
                        if (lockTagEl.getAttribute("title") !== lockSummary.hoverText) lockTagEl.setAttribute("title", lockSummary.hoverText);
                    }
                    const manualInput = panel.querySelector(".mwi-mm-manual-input");
                    if (manualInput && document.activeElement !== manualInput) { const newVal = String(Math.max(1, STATE.manualActionCount)); if (manualInput.value !== newVal) manualInput.value = newVal; }
                });
                panel._latestData = data; return;
            }
    
            const gameBtnCls = detectGameButtonClass();
            const statText = data.totalMissingTypes > 0 ? t("summary_missing", data.totalMissingTypes, formatQty(data.totalMissingQty)) : t("summary_sufficient");
            const zLabel = _zScoreCalc._effectiveZ(data.actionCount?.value || 1) > 0 ? ` · ${t("zscore_tag", _zScoreCalc.activeLabel())}` : "";
            const sourceTag = data._dataLayerUsed
                ? ` <span style="font-size:9px;color:rgba(99,140,255,0.6);margin-left:4px;">${t("data_layer_tag")}${data._artisanBuff > 0 ? ` · ${t("artisan_tag", (data._artisanBuff * 100).toFixed(1))}${zLabel}` : ""}</span>`
                : '';
            const hasPlan = STATE.craftingPlansEnabled && data._recipeHrid && STATE.craftingPlans.has(data._recipeHrid);
            const planTag = hasPlan ? ` <span style="font-size:9px;color:rgba(96,165,250,0.7);margin-left:4px;display:inline-flex;align-items:center;gap:2px;vertical-align:middle;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>${t("has_plan_tag")}</span>` : '';
            // 锁定标签（琥珀色，和蓝色的数据层/已有计划区分；white-space:nowrap 防异常换行）
            const lockTagHtml = lockSummary.hasLocked
                ? ` <span data-mm-locktag="1" style="font-size:9px;color:rgba(240,180,41,0.8);margin-left:4px;white-space:nowrap;cursor:help;"></span>`
                : '';
            const manualCountHtml = data.needManualCount ? `<div class="mwi-mm-manual-count-row"><label class="mwi-mm-manual-label">${t("plan_count_label")}</label><input type="text" inputmode="numeric" pattern="[0-9]*" min="1" step="1" value="${Math.max(1, STATE.manualActionCount)}" class="mwi-mm-manual-input" /></div>` : "";
    
            withObserverSuppressed(() => {
                const prevInput = panel.querySelector(".mwi-mm-manual-input");
                if (prevInput && document.activeElement === prevInput) { STATE._manualInputFocused = true; STATE._manualInputSelStart = prevInput.selectionStart; STATE._manualInputSelEnd = prevInput.selectionEnd; }
                const hasCraftable = data._dataLayerUsed && data._isUpgradeChainRecipe;
                const chainBtn = hasCraftable ? `<button data-act="add-chain" class="${escapeHtml(gameBtnCls)}">${t("add_chain")}</button>` : "";
                // 「建计划」复选框：仅当功能开启且有真实配方时显示；默认不勾。
                //   同一配方跨重绘保留用户勾选；切换到不同配方时重置为不勾（避免误带上一个配方的勾选）。
                const planChkKey = data._recipeHrid || "";
                const showPlanChk = STATE.craftingPlansEnabled && !!planChkKey;
                if (showPlanChk) {
                    const prevChk = panel.querySelector("[data-mm-planchk]");
                    if (STATE._planChkKey !== planChkKey) { STATE._planChkKey = planChkKey; STATE._planChkOn = false; }
                    else if (prevChk) { STATE._planChkOn = prevChk.checked; }
                }
                const planChkHtml = showPlanChk
                    ? `<label class="mwi-mm-plan-chk" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;margin-left:8px;user-select:none;opacity:0.85;"><input type="checkbox" data-mm-planchk${STATE._planChkOn ? " checked" : ""} style="cursor:pointer;margin:0;">${t("create_plan_chk")}</label>`
                    : "";
                panel.innerHTML = `<div class="mwi-mm-summary-head"><div class="stat">${escapeHtml(statText)}${sourceTag}${planTag}${lockTagHtml}</div></div>${manualCountHtml}<div class="mwi-mm-summary-buttons"><button data-act="add" class="${escapeHtml(gameBtnCls)}">${t("add_to_cart")}</button>${chainBtn}${planChkHtml}</div>`;
                // innerHTML 后回填 lockTag 的文字和 title（用 setAttribute 确保换行符保留）
                if (lockSummary.hasLocked) {
                    const lockTagEl = panel.querySelector("[data-mm-locktag]");
                    if (lockTagEl) {
                        lockTagEl.textContent = lockSummary.tagText;
                        lockTagEl.setAttribute("title", lockSummary.hoverText);
                    }
                }
            });
    
            panel.dataset.structKey = structKey;
            panel._latestData = data;
    
            const manualInput = panel.querySelector(".mwi-mm-manual-input");
            if (manualInput) {
                let debounceTimer = null;
                manualInput.addEventListener("input", () => {
                    const val = parseInt(manualInput.value, 10);
                    STATE.manualActionCount = (Number.isFinite(val) && val > 0) ? val : 1;
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => { STATE.lastDataSignature = ""; refreshNow(); }, 180);
                });
                manualInput.addEventListener("keydown", (e) => e.stopPropagation());
                if (STATE._manualInputFocused) {
                    STATE._manualInputFocused = false; manualInput.focus();
                    try { manualInput.setSelectionRange(STATE._manualInputSelStart ?? manualInput.value.length, STATE._manualInputSelEnd ?? manualInput.value.length); } catch (e) { /* ignore */ }
                }
            }
    
            panel.querySelector('button[data-act="add"]')?.addEventListener("click", () => {
                const latestData = panel._latestData || data;
                let addedQty = 0, addedTypes = 0;
                const skipped = [];
                for (const row of latestData.missingList) {
                    if (!row.itemId) { skipped.push(row.name || t("unknown_item")); continue; }
                    addToCart({ itemId: row.itemId, name: row.name, iconRef: row.iconRef || "", quantity: row.missingRounded, source: row.type });
                    addedQty += row.missingRounded; addedTypes += 1;
                }
                // ★ 同时创建制作计划（仅在勾选「建计划」、功能开启、且有缺料时）
                const wantPlan = panel.querySelector("[data-mm-planchk]")?.checked;
                if (wantPlan && STATE.craftingPlansEnabled && latestData._recipeHrid && latestData.missingList.length > 0 && addedTypes > 0) {
                    const allItems = [...latestData.requirements];
                    if (latestData.upgrade && STATE.includeUpgrade) allItems.push(latestData.upgrade);
                    createOrUpdatePlan(latestData._recipeHrid, latestData._recipeName || latestData._recipeHrid, latestData.actionCount?.value || 1, allItems);
                }
                if (latestData.missingList.length === 0) showToast(t("toast_no_missing"), "info");
                else if (addedTypes <= 0) showToast(t("toast_no_id"), "error");
                else {
                    const msg = skipped.length ? t("toast_added_skipped", addedTypes, skipped.length) : t("toast_added", addedTypes, formatQty(addedQty));
                    showToast(msg, "success");
                }
                setAction(t("action_added_to_cart")); Store.notify("cart"); try { _newShell.openUI("cart"); } catch (err) { /* ignore */ }
            });
    
            // 「加入全链材料」按钮 — 升级链全步骤叶子材料汇总（复选框筛选；逐步计划）
            panel.querySelector('button[data-act="add-chain"]')?.addEventListener("click", () => {
                const latestData = panel._latestData || data;
                if (!latestData._dataLayerUsed || !latestData._outputItemHrid) return;
                // 收集勾选的步骤索引
                const chainTree = panel.querySelector(".mwi-mm-chain-tree");
                const checkedSet = new Set();
                if (chainTree) {
                    chainTree.querySelectorAll(".mwi-mm-chain-step-cb").forEach(cb => {
                        if (cb.checked) checkedSet.add(Number(cb.dataset.stepIndex));
                    });
                }
                // 获取全链步骤，只汇总勾选的步骤材料
                const steps = _recipeChain.getChainSteps(latestData._outputItemHrid, latestData.actionCount?.value || 1);
                const leafMap = new Map();
                // ★ 收集所有勾选步骤的 action HRID，用于排除自身链计划
                const chainExcludeSet = new Set();
                for (let i = 0; i < steps.length; i++) {
                    if (checkedSet.size > 0 && !checkedSet.has(i)) continue;
                    const stepAction = _dataLayer._outputToAction?.get(steps[i].stepHrid);
                    if (stepAction?.hrid) chainExcludeSet.add(stepAction.hrid);
                    for (const mat of steps[i].materials) {
                        leafMap.set(mat.hrid, (leafMap.get(mat.hrid) || 0) + mat.qty);
                    }
                }
                // toCartItems 排除本链所有步骤的计划，避免自身锁定导致误算
                const cartItems = _recipeChain.toCartItems(leafMap, chainExcludeSet);
                let addedQty = 0, addedTypes = 0;
                for (const item of cartItems) {
                    addToCart({ itemId: item.itemId, name: item.name, iconRef: item.iconRef, quantity: item.missing, source: "material" });
                    addedQty += item.missing;
                    addedTypes += 1;
                }
                // ★ 为每个勾选步骤创建独立制作计划（仅在勾选「建计划」时；路过产物也锁定各步库存）
                const wantPlan = panel.querySelector("[data-mm-planchk]")?.checked;
                if (wantPlan && STATE.craftingPlansEnabled) {
                    for (let i = 0; i < steps.length; i++) {
                        if (checkedSet.size > 0 && !checkedSet.has(i)) continue;
                        const step = steps[i];
                        const stepAction = _dataLayer._outputToAction?.get(step.stepHrid);
                        const stepRecipeHrid = stepAction?.hrid;
                        if (!stepRecipeHrid) continue;
                        const stepPlanItems = [];
                        for (const mat of step.materials) {
                            const bareId = mat.hrid.replace(/^\/items\//, "");
                            if (isCoinItem(bareId)) continue;
                            stepPlanItems.push({ itemId: bareId, totalNeeded: mat.qty });
                        }
                        if (stepPlanItems.length > 0 || STATE.craftingPlans.has(stepRecipeHrid)) {
                            createOrUpdatePlan(stepRecipeHrid, step.stepName, step.craftRuns, stepPlanItems);
                        }
                    }
                }
                if (addedTypes > 0) {
                    showToast(t("toast_chain_added", addedTypes, formatQty(addedQty)), "success");
                } else {
                    showToast(t("toast_no_missing"), "info");
                }
                setAction(t("action_added_to_cart")); Store.notify("cart"); try { _newShell.openUI("cart"); } catch (err) { /* ignore */ }
            });
        }
    
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §10A 双形态壳 UI(桌面侧栏 / 移动抽屉 · 支持热切换)
        //     内容:清单(图标/星标/阈值/数量步进与直填/删除/单价小计/合计/清空/定位)
        //           + 计划(产量步进/删除/清空) + 任务(生产任务进度) + 设置(Schema 渲染)。
        //     形态:matchMedia(760px) 选 rail/sheet,跨断点热切换;桌面=边缘热区+手柄+
        //           侧栏;移动=迷你条(锚定聊天输入框上方)+两档抽屉+键盘避让。
        //     纪律:写操作只经 §07A Actions 与 saveToggles;只读白名单:
        //       escapeHtml / formatQty / formatGold / resolveCartDisplayName /
        //       renderItemIconSvg / getInventoryCount / isVisible / isCoinItem /
        //       normalizeCartItemId / SETTINGS_SCHEMA / _themeProbe.tokens /
        //       _marketPrice.{ready,loading,getPrice,ensureData} /
        //       _questTracker.getProductionTasks。此外不得触碰 §04–§08 内部。
        //     旧浮窗:已物理删除,本壳为唯一界面(常驻;__shell 仅会话级挂卸调试)。
        // ════════════════════════════════════════════════════════════════════════
        const _newShell = {
            LS_KEY: "mwi_mm_shell_v1",
            host: null, root: null, els: {},
            _form: null,
            _ui: { open: false, pinned: false, handleY: 30, railW: 340 },   // 默认加宽
            _detent: "mini",
            _tab: "cart",                               // cart | plans | quests | set
            _mq: null, _mqHandler: null,
            _unsubs: [], _suppressClickUntil: 0, _vvHandler: null, _rsHandler: null,
            _holdLock: false, _holdTimer: null, _holdIv: null, _priceAsked: false,
            _sx(zh, en) { return _currentLang === "zh" ? zh : en; },
            _jumpHintDismissed() { try { return localStorage.getItem("mwi_mm_jump_hint_dismissed") === "1"; } catch (e) { return false; } },
            SVG: {
                cart: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6"/></svg>',
                pin: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 2.5l7 7-2 2-.9-.3-3.3 3.3.4 3.2-2 2-4.2-4.2L4 20l-1-1 4.5-4.5L3.3 10.3l2-2 3.2.4 3.3-3.3-.3-.9 2-2z"/></svg>',
                star: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>'
            },
    
            CSS: `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent;
      font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
    .ic { display: block; }
    button { font-family: inherit; border: none; background: none; cursor: pointer; color: inherit; }
    ::-webkit-scrollbar { width: 7px; }
    ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--mm2-textMut) 28%, transparent); border-radius: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    
    /* ── Tab:扁平分段 ── */
    .mm2-tabs { display: flex; gap: 2px; margin: 8px 12px 0; padding: 2px; flex: 0 0 auto;
      background: color-mix(in srgb, var(--mm2-text) 5%, transparent); border-radius: 7px; }
    .mm2-tabs button { flex: 1; padding: 7px 0; font-size: 12px; font-weight: 600;
      color: var(--mm2-textMut); border-radius: 5px; transition: color .12s, background-color .12s; }
    .mm2-tabs button:hover { color: var(--mm2-text); }
    .mm2-tabs button.on { color: #fff; background: var(--mm2-accent); }
    
    /* ── 列表与行 ── */
    .mm2-list { flex: 1 1 auto; min-height: 100px; overflow-y: auto; padding: 4px 12px 6px; }
    .mm2-prow { display: flex; align-items: center; gap: 9px; min-height: 50px; padding: 5px 2px;
      border-bottom: 1px solid color-mix(in srgb, var(--mm2-line) 40%, transparent); }
    .mm2-row { display: grid; grid-template-columns: 26px 44px minmax(0,1fr) auto auto; column-gap: 9px; row-gap: 2px;
      align-items: center; min-height: 56px; padding: 7px 2px;
      border-bottom: 1px solid color-mix(in srgb, var(--mm2-line) 40%, transparent); }
    .mm2-row:hover, .mm2-prow:hover { background: color-mix(in srgb, var(--mm2-text) 4%, transparent); }
    .mm2-row > .rstar { grid-column: 1; grid-row: 1 / span 2; }
    .mm2-row > .mm2-icon { grid-column: 2; grid-row: 1 / span 2; }
    .mm2-row > .meta { grid-column: 3; grid-row: 1; }
    .mm2-row > .mm2-step, .mm2-row > .mm2-done-tag { grid-column: 4; grid-row: 1; justify-self: end; }
    .mm2-row > .rdel { grid-column: 5; grid-row: 1; }
    .mm2-row > .sub { grid-column: 3 / 6; grid-row: 2; margin-top: 0; cursor: pointer; }
    .nm { font-size: 13.5px; font-weight: 600; color: var(--mm2-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { display: block; font-size: 11px; color: var(--mm2-textMut); margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub .th { text-decoration: underline dotted; text-underline-offset: 2px; cursor: pointer; }
    .sub .th:hover { color: var(--mm2-gold); }
    .sub .pr { color: color-mix(in srgb, var(--mm2-gold) 78%, var(--mm2-textMut)); }
    .mm2-row .meta, .mm2-prow .meta { flex: 1; min-width: 0; cursor: pointer; }
    .mm2-icon { width: 36px; height: 36px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      background: var(--mm2-cardBg); border-radius: 7px; cursor: pointer; }
    .mm2-row .mm2-icon { width: 42px; height: 42px; border-radius: 8px; justify-self: center; }
    .mm2-icon:hover { background: color-mix(in srgb, var(--mm2-cardBg) 88%, white); }
    .mwi-mm-item-icon { width: 27px; height: 27px; }
    .mm2-row .mwi-mm-item-icon { width: 32px; height: 32px; }
    .mwi-mm-icon-fallback { color: var(--mm2-textMut); font-weight: 700; font-size: 13px; }
    .mm2-row .rstar { width: 26px; height: 32px; display: flex; align-items: center; justify-content: center;
      color: color-mix(in srgb, var(--mm2-textMut) 32%, transparent); border-radius: 5px; transition: color .12s; }
    .mm2-row .rstar:hover { color: color-mix(in srgb, var(--mm2-gold) 70%, transparent); }
    .mm2-row .rstar.on { color: var(--mm2-gold); }
    .mm2-row .rstar .ic { width: 14px; height: 14px; }
    .mm2-row .rdel, .mm2-prow .rdel { flex: 0 0 auto; width: 26px; height: 32px; border-radius: 5px;
      color: color-mix(in srgb, var(--mm2-textMut) 55%, transparent); font-size: 15px; transition: color .12s, background-color .12s; }
    .mm2-row .rdel:hover, .mm2-prow .rdel:hover { color: #ff8d96; background: color-mix(in srgb, #e05a64 14%, transparent); }
    .mm2-row.done .nm { color: var(--mm2-textMut); text-decoration: line-through; font-weight: 500; }
    .mm2-done-tag { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: #3edd8b; padding: 3px 8px;
      background: color-mix(in srgb, #3edd8b 12%, transparent); border-radius: 5px; }
    .mm2-empty { color: var(--mm2-textMut); text-align: center; font-size: 12.5px; line-height: 1.7; padding: 26px 12px;
      background: color-mix(in srgb, var(--mm2-text) 4%, transparent); border-radius: 8px; margin: 12px 2px; }
    
    /* ── 数量步进:扁平槽 ── */
    .mm2-step { flex: 0 0 auto; display: flex; align-items: stretch; border-radius: 6px; overflow: hidden;
      background: color-mix(in srgb, var(--mm2-text) 6%, transparent); }
    .mm2-step button { width: 27px; font-size: 15px; color: var(--mm2-textMut); transition: color .12s, background-color .12s; }
    .mm2-step button:hover { color: var(--mm2-text); background: color-mix(in srgb, var(--mm2-text) 9%, transparent); }
    .mm2-step .qv { width: 56px; height: 30px; border: none; outline: none; text-align: center; background: transparent;
      color: var(--mm2-gold); font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums; font-family: inherit; }
    .mm2-step .qv:focus { background: color-mix(in srgb, var(--mm2-accent) 16%, transparent); }
    
    /* ── 任务 ── */
    .mm2-qrow { padding: 10px 4px; border-bottom: 1px solid color-mix(in srgb, var(--mm2-line) 40%, transparent); }
    .mm2-qrow .qh { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; font-weight: 600; color: var(--mm2-text); }
    .mm2-qrow .qh b { color: var(--mm2-gold); font-weight: 700; font-size: 11px; font-variant-numeric: tabular-nums; }
    .mm2-qbar { height: 4px; background: color-mix(in srgb, var(--mm2-text) 7%, transparent); border-radius: 2px; margin-top: 7px; overflow: hidden; }
    .mm2-qbar i { display: block; height: 100%; background: var(--mm2-accent); }
    
    /* ── 设置 ── */
    .mm2-srow { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 5px 4px;
      border-bottom: 1px solid color-mix(in srgb, var(--mm2-line) 32%, transparent); }
    .mm2-srow .sl { flex: 1; min-width: 0; font-size: 13px; color: var(--mm2-text); font-weight: 600; }
    .mm2-srow .sd { display: block; font-size: 10.5px; color: var(--mm2-textMut); font-weight: 400; margin-top: 2px; }
    .mm2-swt { flex: 0 0 auto; font-size: 10.5px; color: var(--mm2-textMut); min-width: 18px; text-align: right; }
    .mm2-swt.on { color: #3edd8b; font-weight: 700; }
    .mm2-sw { flex: 0 0 auto; width: 42px; height: 23px; border-radius: 99px; position: relative;
      background: color-mix(in srgb, var(--mm2-text) 10%, transparent); transition: background-color .15s; }
    .mm2-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 17px; height: 17px; border-radius: 50%;
      background: #fff; opacity: .5; transition: transform .15s, opacity .15s; }
    .mm2-sw.on { background: #29c274; }
    .mm2-sw.on::after { transform: translateX(19px); opacity: 1; }
    .mm2-sel { flex: 0 0 auto; font-size: 11.5px; color: var(--mm2-text); border: none; border-radius: 6px;
      padding: 6px 8px; background: color-mix(in srgb, var(--mm2-text) 7%, transparent); font-family: inherit; cursor: pointer; }
    .mm2-sel:hover { background: color-mix(in srgb, var(--mm2-text) 11%, transparent); }
    .mm2-sel option { background: var(--mm2-panelBg); color: var(--mm2-text); }
    .mm2-numin { flex: 0 0 auto; width: 76px; font-size: 12px; font-weight: 600; color: var(--mm2-text); text-align: center;
      border: 1px solid color-mix(in srgb, var(--mm2-text) 14%, transparent); border-radius: 6px;
      background: color-mix(in srgb, var(--mm2-text) 6%, transparent); padding: 6px 8px; outline: none;
      font-family: inherit; font-variant-numeric: tabular-nums; transition: border-color .12s, background-color .12s; }
    .mm2-numin:focus { border-color: var(--mm2-accent); background: color-mix(in srgb, var(--mm2-text) 9%, transparent); }
    .mm2-shint { font-size: 10px; color: var(--mm2-textMut); line-height: 1.7; padding: 12px 4px 4px; }
    .mm2-jhint { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--mm2-textMut);
      padding: 5px 4px 7px; border-bottom: 1px solid color-mix(in srgb, var(--mm2-line) 40%, transparent); }
    .mm2-jhint span { flex: 1 1 auto; min-width: 0; line-height: 1.5; }
    .mm2-jhint .jhint-x { flex: 0 0 auto; width: 18px; height: 18px; border-radius: 4px; font-size: 13px; line-height: 1;
      color: color-mix(in srgb, var(--mm2-textMut) 60%, transparent); transition: color .12s, background-color .12s; }
    .mm2-jhint .jhint-x:hover { color: var(--mm2-text); background: color-mix(in srgb, var(--mm2-text) 6%, transparent); }
    .mm2-kbd { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700;
      color: var(--mm2-gold); background: color-mix(in srgb, var(--mm2-text) 7%, transparent); }
    .mm2-mini { padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--mm2-textMut);
      background: color-mix(in srgb, var(--mm2-text) 7%, transparent); transition: color .12s, background-color .12s; }
    .mm2-mini:hover { color: var(--mm2-text); background: color-mix(in srgb, var(--mm2-text) 11%, transparent); }
    
    /* ── 头/脚 ── */
    .mm2-head { display: flex; align-items: center; gap: 8px; padding: 11px 14px 9px; flex: 0 0 auto; color: var(--mm2-text);
      border-bottom: 1px solid color-mix(in srgb, var(--mm2-line) 55%, transparent); }
    .mm2-head .t { font-size: 14px; font-weight: 700; letter-spacing: .2px; }
    .mm2-head .s { font-size: 10.5px; padding: 2px 7px; border-radius: 5px;
      background: color-mix(in srgb, var(--mm2-gold) 12%, transparent); color: color-mix(in srgb, var(--mm2-gold) 85%, white); }
    .mm2-head .s:empty { display: none; }
    .mm2-head .hb { margin-left: auto; display: flex; gap: 3px; }
    .mm2-head .hb button { width: 27px; height: 27px; display: flex; align-items: center; justify-content: center;
      color: var(--mm2-textMut); font-size: 14px; line-height: 1; border-radius: 5px; transition: color .12s, background-color .12s; }
    .mm2-head .hb button:hover { color: var(--mm2-text); background: color-mix(in srgb, var(--mm2-text) 9%, transparent); }
    .mm2-head .hb button .ic { width: 13px; height: 13px; }
    .mm2-head .hb button.pin.on { color: var(--mm2-gold); background: color-mix(in srgb, var(--mm2-gold) 13%, transparent); }
    .mm2-foot { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px;
      color: var(--mm2-textMut); border-top: 1px solid color-mix(in srgb, var(--mm2-line) 55%, transparent); }
    .mm2-foot .total { font-size: 10px; line-height: 1.35; }
    .mm2-foot .total b { display: block; font-size: 15px; color: var(--mm2-gold); font-weight: 700; font-variant-numeric: tabular-nums; }
    .mm2-foot .fbtn { margin-left: auto; padding: 9px 18px; border-radius: 6px; font-size: 12.5px; font-weight: 700;
      color: var(--mm2-text); background: color-mix(in srgb, var(--mm2-text) 8%, transparent); transition: color .12s, background-color .12s; }
    .mm2-foot .fbtn:hover { background: color-mix(in srgb, var(--mm2-text) 13%, transparent); }
    .mm2-foot .fbtn[data-act="clear"]:hover, .mm2-foot .fbtn[data-act="pclear"]:hover {
      color: #ff8d96; background: color-mix(in srgb, #e05a64 14%, transparent); }
    @media (pointer: coarse) {
      .mm2-row, .mm2-prow { min-height: 54px; }
      .mm2-step button { width: 33px; }
      .mm2-step .qv { height: 34px; }
      .mm2-head .hb button { width: 33px; height: 33px; }
      .mm2-foot .fbtn { padding: 11px 20px; }
    }
    
    /* ── 桌面:自适应高度悬浮卡 ── */
    /* ── 边缘热区:渐变带 + 箭头提示(带宽跟随 edgeZoneWidth) ── */
    .mm2-hotline { position: fixed; top: 0; right: 0; bottom: 0; width: 2px; pointer-events: none;
      background: linear-gradient(270deg, color-mix(in srgb, var(--mm2-accent) 34%, transparent), transparent);
      opacity: 0; transition: opacity .16s; }
    .mm2-hotline.on { opacity: 1; }
    .mm2-hzchip { position: absolute; top: 50%; right: 100%; margin-right: 8px; transform: translate(8px,-50%);
      color: var(--mm2-accent); font-size: 19px; font-weight: 800; line-height: 1;
      opacity: 0; transition: opacity .16s, transform .16s; }
    .mm2-hotline.on .mm2-hzchip { opacity: 1; transform: translate(0,-50%); }
    .mm2-handle { position: fixed; right: 0; width: 32px; height: 62px; cursor: pointer; user-select: none; touch-action: none;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      color: var(--mm2-text); border-radius: 9px 0 0 9px; background: var(--mm2-panelBg);
      box-shadow: -2px 2px 10px rgba(0,0,0,.3); opacity: .85; transition: opacity .15s; }
    .mm2-handle:hover { opacity: 1; }
    .mm2-handle.hidden { display: none; }
    .mm2-handle .ic { width: 16px; height: 16px; }
    /* ── 悬浮按钮待购提示:描金耳朵 + 脉冲点 ── */
    .mm2-handle.has-items { box-shadow: -2px 2px 10px rgba(0,0,0,.3), inset 2px 0 0 var(--mm2-gold); }
    .mm2-badge { position: absolute; top: 9px; right: 7px; width: 7px; height: 7px; border-radius: 50%;
      background: var(--mm2-gold); box-shadow: 0 0 0 2px var(--mm2-panelBg); }
    .mm2-badge.zero { display: none; }
    .mm2-badge::after { content: ""; position: absolute; inset: -3px; border-radius: 50%;
      border: 1.5px solid var(--mm2-gold); opacity: .6; animation: mm2BadgePulse 1.6s ease-out infinite; }
    @keyframes mm2BadgePulse { 0% { transform: scale(.7); opacity: .7 } 100% { transform: scale(1.9); opacity: 0 } }
    @media (prefers-reduced-motion: reduce) { .mm2-badge::after { animation: none; } }
    .mm2-rail { position: fixed; top: 56px; right: 10px; display: flex; flex-direction: column;
      max-height: calc(100vh - 96px); min-height: 320px;
      background: var(--mm2-panelBg); border-radius: 10px;
      box-shadow: 0 10px 32px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--mm2-line) 70%, transparent);
      transform: translateX(calc(100% + 16px)); transition: transform .2s ease; }
    .mm2-rail.open { transform: translateX(0); }
    .mm2-grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 7px; cursor: ew-resize; touch-action: none; border-radius: 10px 0 0 10px; }
    .mm2-grip:hover { background: color-mix(in srgb, var(--mm2-accent) 25%, transparent); }
    
    /* ── 移动 sheet ── */
    .mm2-sheet { position: fixed; left: 0; right: 0; bottom: 0; height: 52%;
      background: var(--mm2-panelBg); border-radius: 14px 14px 0 0;
      box-shadow: 0 -10px 32px rgba(0,0,0,.5);
      display: flex; flex-direction: column; transform: translateY(105%);
      transition: transform .22s ease, height .22s ease; }
    .mm2-sheet[data-detent="half"] { transform: translateY(0); height: 52%; }
    .mm2-sheet[data-detent="full"] { transform: translateY(0); height: 90%; }
    .mm2-grab { padding: 9px 0 4px; cursor: pointer; flex: 0 0 auto; }
    .mm2-grab i { display: block; width: 44px; height: 4px; border-radius: 2px;
      background: color-mix(in srgb, var(--mm2-textMut) 45%, transparent); margin: 0 auto; }
    `,
    
            // ── 生命周期与形态────────────────────────────────────────
            init() {
                try {
                    this._loadUI();
                    if (!this._mq) {
                        this._mq = matchMedia("(max-width: 760px)");
                        this._mqHandler = () => { try { this._switchForm(); } catch (err) { /* ignore */ } };
                        this._mq.addEventListener("change", this._mqHandler);
                    }
                    this._mountForm();
                } catch (err) { console.warn("[mwi-mm] §10A 挂载失败:", err); }
            },
            destroy() {
                this._teardownDom();
                if (this._mq && this._mqHandler) { try { this._mq.removeEventListener("change", this._mqHandler); } catch (e) { /* ignore */ } }
                this._mq = null; this._mqHandler = null; this._form = null;
            },
            _switchForm() {
                const want = this._mq.matches ? "sheet" : "rail";
                if (want === this._form) return;
                this._teardownDom();
                this._mountForm();
            },
            _mountForm() {
                this._form = this._mq.matches ? "sheet" : "rail";
                if (this._form === "rail") this._mountRail(); else this._mountSheet();
                console.info("[mwi-mm] §10A 已挂载形态:" + this._form);
            },
            _teardownDom() {
                for (const un of this._unsubs) { try { un(); } catch (e) { /* ignore */ } }
                this._unsubs = [];
                this._removeGlobalListeners();
                this._clearHold();
                if (this.host) { this.host.remove(); }
                this.host = null; this.root = null; this.els = {};
            },
            _makeHost(html) {
                const host = document.createElement("div");
                host.id = "mwi-mm2-host";
                host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147482198;";
                document.body.appendChild(host);
                this.host = host;
                this.root = host.attachShadow({ mode: "open" });
                this.root.innerHTML = `<style>${this.CSS}</style>` + html;
                this._applyTheme();
                this._unsubs.push(Store.subscribe("cart", () => { if (this._tab === "cart") this._renderCurrent(); else this._renderBadgesOnly(); }));
                this._unsubs.push(Store.subscribe("plans", () => { if (this._tab === "plans") this._renderCurrent(); }));
                this._unsubs.push(Store.subscribe("quests", () => { if (this._tab === "quests") this._renderCurrent(); }));
                this._unsubs.push(Store.subscribe("settings", () => { if (this._tab === "set") this._renderCurrent(); }));
            },
            _applyTheme() {
                if (!this.host) return;
                const tk = (_themeProbe && _themeProbe.tokens) || _themeProbe.STATIC;
                for (const key of _themeProbe.ORDER) this.host.style.setProperty("--mm2-" + key, tk[key]);
            },
    
            // ── 公共骨架(Tab + 列表 + 脚部)──────────────────────────────────────
            _contentHTML() {
                const tb = (id, zh, en) => `<button data-t="${id}"${this._tab === id ? ' class="on"' : ""}>${this._sx(zh, en)}</button>`;
                return `<nav class="mm2-tabs">${tb("cart", "清单", "Cart")}${tb("plans", "计划", "Plans")}${tb("quests", "任务", "Quests")}${tb("set", "设置", "Settings")}</nav>
    <div class="mm2-list"></div>
    <div class="mm2-foot"></div>`;
            },
            _bindContent() {
                this.root.querySelector(".mm2-tabs").addEventListener("click", (e) => {
                    const b = e.target.closest("button[data-t]");
                    if (!b) return;
                    this._tab = b.dataset.t;
                    this.root.querySelectorAll(".mm2-tabs button").forEach(x => x.classList.toggle("on", x === b));
                    this._renderCurrent();
                });
                // 列表事件委托
                const list = this.els.list;
                list.addEventListener("click", (e) => this._onListClick(e));
                list.addEventListener("change", (e) => this._onListChange(e));
                list.addEventListener("pointerdown", (e) => this._onListPointerDown(e));
                this.els.foot.addEventListener("click", (e) => this._onFootClick(e));
            },
    
            // ── 渲染调度 ─────────────────────────────────────────────────────────
            _renderCurrent() {
                if (!this.els.list) return;
                if (this._holdLock) return;                                  // 步进按住期间暂缓重绘
                const fe = this.root.activeElement;
                if (fe && fe.classList && (fe.classList.contains("qv") || fe.classList.contains("mm2-numin"))) {     // 数量/数字输入聚焦时暂缓
                    this._pendingRender = true;
                    return;
                }
                this._renderBadgesOnly();
                if (this._tab === "cart") this._renderCart();
                else if (this._tab === "plans") this._renderPlans();
                else if (this._tab === "quests") this._renderQuests();
                else this._renderSettings();
            },
            _renderBadgesOnly() {
                const rows = [...STATE.cart.values()];
                const active = rows.filter(r => r.quantity > 0).length;
                if (this.els.badge) {
                    this.els.badge.classList.toggle("zero", active === 0);   // 待购点不显数字,数量见展开后表头
                }
                if (this.els.handle) {
                    this.els.handle.classList.toggle("has-items", active > 0);
                }
                const countText = active > 0 ? this._sx(`缺 ${active} 项`, `${active} missing`) : this._sx("无缺料", "all set");
                if (this.els.headCount) this.els.headCount.textContent = countText;
            },
    
            // ── 清单 ─────────────────────────────────────────────────────────────
            _priceReady() { return STATE.priceEnabled && _marketPrice.ready; },
            _ensurePrices() {
                if (!STATE.priceEnabled || _marketPrice.ready || this._priceAsked) return;
                this._priceAsked = true;
                try { _marketPrice.ensureData().then(() => this._renderCurrent()); } catch (err) { /* ignore */ }
            },
            _rowHTML(id, r) {
                const done = r.starred && r.quantity <= 0;
                const name = escapeHtml(resolveCartDisplayName(r) || String(id));
                const stock = getInventoryCount(id);
                const sub = [this._sx("库存 ", "stock ") + formatQty(stock)];
                if (r.starred) {
                    const tv = r.threshold > 0 ? r.threshold : this._sx("未设", "off");
                    sub.push(`<span class="th" data-act="th">${this._sx("阈值 ", "min ")}${tv}</span>`);
                }
                if (this._priceReady() && !isCoinItem(id)) {
                    const p = _marketPrice.getPrice(id);
                    if (p > 0) sub.push(`<span class="pr">${formatGold(p)} · ${this._sx("计 ", "= ")}${formatGold(p * Math.max(0, Math.ceil(r.quantity)))}</span>`);
                }
                const mid = done
                    ? `<span class="mm2-done-tag">${this._sx("已购齐", "done")}</span>`
                    : `<span class="mm2-step"><button data-act="dec">−</button><input class="qv" type="text" inputmode="numeric" value="${Math.max(0, Math.round(r.quantity))}"><button data-act="inc">＋</button></span>`;
                return `<div class="mm2-row${done ? " done" : ""}" data-id="${escapeHtml(String(id))}">
    <button class="rstar${r.starred ? " on" : ""}" data-act="star" title="${this._sx("收藏:购齐后保留并监控阈值", "Star: keep & watch")}">${this.SVG.star}</button>
    <span class="mm2-icon" data-act="mkt">${renderItemIconSvg(r)}</span>
    <span class="meta" data-act="mkt"><span class="nm">${name}</span></span>
    ${mid}
    <button class="rdel" data-act="del" title="${this._sx("移除", "Remove")}">×</button>
    <span class="sub" data-act="mkt">${sub.join(" · ")}</span></div>`;
            },
            _renderCart() {
                this._ensurePrices();
                const rows = [...STATE.cart.entries()];
                const hint = (rows.length && !this._jumpHintDismissed())
                    ? `<div class="mm2-jhint"><span>${this._sx("点击物品或所在行即可跳转到市场", "Tap an item or its row to open it in the market")}</span><button class="jhint-x" data-act="jhintclose" title="${this._sx("不再提示", "Dismiss")}">×</button></div>`
                    : "";
                this.els.list.innerHTML = rows.length
                    ? hint + rows.map(([id, r]) => this._rowHTML(id, r)).join("")
                    : `<div class="mm2-empty">${this._sx("清单为空 — 在制作面板点「加入购物清单」", "Cart is empty")}</div>`;
                // 脚部:合计 + 清空 + 定位
                let totalHTML = "";
                if (!STATE.cartTotalEnabled) {
                    totalHTML = `<span class="total">${this._sx("共", "Total")} ${rows.length} ${this._sx("条", "items")}</span>`;
                } else if (this._priceReady()) {
                    let total = 0, unpriced = 0;
                    for (const [id, r] of rows) {
                        const q = Math.ceil(r.quantity || 0);
                        if (q <= 0 || isCoinItem(id)) continue;
                        const p = _marketPrice.getPrice(id);
                        if (p > 0) total += p * q; else unpriced++;
                    }
                    totalHTML = `<span class="total">${this._sx("补齐合计", "Total")}<b>${formatGold(total)}${unpriced > 0 ? `<small style="font-size:9px;color:var(--mm2-textMut)"> +${unpriced}${this._sx("项未估价", " unpriced")}</small>` : ""}</b></span>`;
                } else {
                    totalHTML = `<span class="total">${this._sx("共", "Total")} ${rows.length} ${this._sx("条", "items")}${STATE.priceEnabled ? `<b style="font-size:10px">${this._sx("价格加载中…", "loading prices…")}</b>` : ""}</span>`;
                }
                this.els.foot.innerHTML = `${totalHTML}
    <button class="fbtn" data-act="clear" title="${this._sx("清除未收藏项(收藏项保留)", "Clear non-starred")}">${this._sx("清空未收藏", "Clear")}</button>`;
            },
    
            // ── 计划 ─────────────────────────────────────────────────────────────
            _renderPlans() {
                const plans = [...STATE.craftingPlans.entries()];
                this.els.list.innerHTML = plans.length
                    ? plans.map(([hrid, p]) => {
                        const name = escapeHtml(p.recipeName || p.name || String(hrid).replace(/^\/actions\//, ""));
                        const cnt = Math.max(1, Math.round(p.craftCount || 1));
                        // 进度（快照法）：仅生产类且有基线的计划才有；否则不画进度条
                        const prog = getPlanProgress(p);
                        const progHtml = prog
                            ? `<div style="display:flex;align-items:center;gap:6px;width:100%;"><div class="mm2-qbar" style="flex:1;margin-top:0;"><i style="width:${prog.pct}%"></i></div><span style="font-size:10px;color:var(--mm2-textMut);white-space:nowrap;">${prog.done}/${prog.target}</span></div>`
                            : "";
                        // 锁定明细：列出该计划锁定的材料及数量
                        const matEntries = Object.entries(p.materials || {});
                        const matStr = matEntries.length
                            ? matEntries.map(([id, qty]) => `${escapeHtml(_dataLayer.hridToName("/items/" + id) || id)}×${formatQty(qty)}`).join("、")
                            : "—";
                        const lockedHtml = `<div style="font-size:10px;color:var(--mm2-textMut);line-height:1.4;width:100%;word-break:break-word;">${this._sx("锁定", "Locked")}: ${matStr}</div>`;
                        return `<div class="mm2-prow" data-hrid="${escapeHtml(String(hrid))}" style="flex-direction:column;align-items:stretch;gap:6px;">
    <div style="display:flex;align-items:center;gap:9px;width:100%;">
    <span class="meta"><span class="nm">${name}</span><span class="sub">${this._sx("计划次数", "actions")} ×${cnt}</span></span>
    <span class="mm2-step"><button data-act="pdec">−</button><input class="qv" type="text" inputmode="numeric" value="${cnt}"><button data-act="pinc">＋</button></span>
    <button class="rdel" data-act="pdone" title="${this._sx("完成并释放锁定", "Complete & release lock")}" style="width:auto;padding:0 9px;font-size:11px;color:var(--mm2-accent);">${this._sx("完成", "Done")}</button>
    <button class="rdel" data-act="pdel" title="${this._sx("删除计划", "Remove plan")}">×</button></div>
    ${progHtml}${lockedHtml}</div>`;
                    }).join("")
                    : `<div class="mm2-empty">${this._sx("暂无制作计划 — 在制作面板勾选「建计划」后加购", "No crafting plans")}</div>`;
                this.els.foot.innerHTML = `<span>${this._sx("计划", "plans")} ${plans.length}</span>
    <button class="fbtn" data-act="pclear">${this._sx("清空计划", "Clear plans")}</button>`;
            },
    
            // ── 任务 ─────────────────────────────────────────────────────────────
            _renderQuests() {
                if (!STATE.questPanelEnabled) {
                    this.els.list.innerHTML = `<div class="mm2-empty">${this._sx("任务追踪已在设置中关闭", "Quest tracking disabled in settings")}</div>`;
                    this.els.foot.innerHTML = "";
                    return;
                }
                let tasks = [];
                try { tasks = _questTracker.getProductionTasks() || []; } catch (err) { /* ignore */ }
                this.els.list.innerHTML = tasks.length
                    ? tasks.map(q => {
                        const pct = q.total > 0 ? Math.min(100, Math.round(q.done / q.total * 100)) : 0;
                        return `<div class="mm2-qrow"><div class="qh"><span>${escapeHtml(q.itemName || q.actionName)}</span><b>${q.done} / ${q.total}</b></div>
    <div class="mm2-qbar"><i style="width:${pct}%"></i></div></div>`;
                    }).join("")
                    : `<div class="mm2-empty">${this._sx("暂无进行中的生产任务(或数据层未就绪)", "No production quests")}</div>`;
                this.els.foot.innerHTML = `<span>${this._sx("生产任务", "tasks")} ${tasks.length}</span>`;
            },
    
            // ── 设置(由 §02B Schema 渲染)────────────────────────────────────────
            SET_LABELS: null,
            _setLabels() {
                if (this.SET_LABELS) return this.SET_LABELS;
                const L = (zh, en, dzh, den) => ({ l: this._sx(zh, en), d: this._sx(dzh || "", den || "") });
                this.SET_LABELS = {
                    locateEnabled: L("市场定位高亮", "Market locate", "在市场中脉冲标记清单物品", "Pulse-mark cart items"),
                    includeUpgrade: L("计算升级材料", "Include upgrade", "缺料计算包含升级物品", ""),
                    inventorySyncEnabled: L("库存同步购齐", "Inventory sync", "买入后自动划除清单", "Auto check-off on buy"),
                    autoCollapseEnabled: L("购齐自动收起", "Auto collapse", "全部购齐后收起面板", ""),
                    autoPrefillEnabled: L("市场数量预填", "Market prefill", "市场弹窗自动填缺料数量", ""),
                    purchaseNavEnabled: L("采购导航条", "Purchase nav", "市场顶部的待购物品导航", ""),
                    craftingPlansEnabled: L("制作计划功能", "Crafting plans", "", ""),
                    questPanelEnabled: L("任务追踪功能", "Quest tracking", "", ""),
                    priceEnabled: L("价格显示", "Prices", "清单行显示单价与小计", ""),
                    cartTotalEnabled: L("合计显示", "Cart total", "", ""),
                    edgeZoneWidth: L("边缘热区宽度", "Edge zone", "仅桌面;0 = 禁用热区只留手柄", "Desktop only; 0 = off"),
                    zScoreIndex: L("备料余量", "Material buffer", "多备料，减少工匠茶随机波动", "Buy extra to reduce artisan-tea variance"),
                    zScoreThreshold: L("补料起算行动次数", "Buffer threshold", "超过此次数才补料", "Buffer only above this count"),
                    guzzlingPouchLevel: L("暴饮袋等级", "Guzzling pouch level", "工匠茶浓缩倍率;自动 = 按已装备暴饮袋等级检测", "Tea concentration; auto = detect equipped pouch")
                };
                return this.SET_LABELS;
            },
            _renderSettings() {
                const labels = this._setLabels();
                let html = "";
                for (const def of SETTINGS_SCHEMA) {
                    const lab = labels[def.key];
                    if (!lab) continue;                                       // 高级项(zScore/暴饮袋/快捷键)暂不在此渲染
                    const left = `<span class="sl">${lab.l}${lab.d ? `<span class="sd">${lab.d}</span>` : ""}</span>`;
                    if (def.type === "bool") {
                        const on = Boolean(STATE[def.key]);
                        html += `<div class="mm2-srow">${left}<span class="mm2-swt${on ? " on" : ""}">${on ? this._sx("开", "on") : this._sx("关", "off")}</span><button class="mm2-sw${on ? " on" : ""}" data-set="${def.key}"></button></div>`;
                    } else if (def.key === "edgeZoneWidth") {
                        const opts = [0, 8, 10, 12, 16, 24].map(v =>
                            `<option value="${v}"${STATE.edgeZoneWidth === v ? " selected" : ""}>${v === 0 ? this._sx("禁用", "off") : v + "px"}</option>`).join("");
                        html += `<div class="mm2-srow">${left}<select class="mm2-sel" data-sel="edgeZoneWidth">${opts}</select></div>`;
                    } else if (def.key === "zScoreIndex") {
                        const opts = Z_OPTIONS.map((o, i) =>
                            `<option value="${i}"${STATE.zScoreIndex === i ? " selected" : ""}>${escapeHtml(this._sx(o.zh, o.en))}${o.pct ? "(" + o.pct + ")" : ""}</option>`).join("");
                        html += `<div class="mm2-srow">${left}<select class="mm2-sel" data-sel="zScoreIndex">${opts}</select></div>`;
                    } else if (def.key === "zScoreThreshold") {
                        const cur = Number(STATE.zScoreThreshold) || 10;
                        html += `<div class="mm2-srow">${left}<input class="mm2-numin" data-num="zScoreThreshold" type="text" inputmode="numeric" value="${cur}"></div>`;
                    } else if (def.key === "guzzlingPouchLevel") {
                        // -1 的真实语义是「自动检测」(起,经 WS 查已装备暴饮袋等级),
                        //       迁入新壳时被误标为「关」,导致用户以为自动检测被砍。逻辑从未改动。
                        let opts = `<option value="-1"${STATE.guzzlingPouchLevel === -1 ? " selected" : ""}>${this._sx("自动检测", "Auto")}</option>`;
                        for (let v = 0; v <= 20; v++) opts += `<option value="${v}"${STATE.guzzlingPouchLevel === v ? " selected" : ""}>Lv.${v}</option>`;
                        html += `<div class="mm2-srow">${left}<select class="mm2-sel" data-sel="guzzlingPouchLevel">${opts}</select></div>`;
                    }
                }
                // 下一项快捷键(录制式)
                {
                    const s = STATE.nextItemShortcut;
                    html += `<div class="mm2-srow"><span class="sl">${this._sx("下一项快捷键", "Next-item shortcut")}<span class="sd">${this._sx("采购导航:跳转下一个待购物品", "Purchase nav: jump to next item")}</span></span>
    ${s ? `<span class="mm2-kbd">${escapeHtml(s.display || s.code)}</span>` : `<span class="mm2-swt">${this._sx("未设", "off")}</span>`}
    <button class="mm2-mini" data-act="rec">${this._sx("录制", "Record")}</button>
    ${s ? `<button class="mm2-mini" data-act="recclear">${this._sx("清除", "Clear")}</button>` : ""}</div>`;
                }
                this.els.list.innerHTML = html;
                this.els.foot.innerHTML = `<span>${this._sx("设置即时生效并自动保存", "Saved automatically")}</span>`;
            },
    
            // ── 事件:列表委托 ───────────────────────────────────────────────────
            _onListClick(e) {
                const act = e.target.closest("[data-act]")?.dataset.act;
                // 设置开关 / 下拉
                const sw = e.target.closest(".mm2-sw");
                if (sw) {
                    const key = sw.dataset.set;
                    const next = !STATE[key];
                    if (key === "locateEnabled") { try { Actions.setLocateEnabled(next); } catch (err) { STATE[key] = next; } }
                    else STATE[key] = next;
                    saveToggles();
                    this._renderCurrent();
                    return;
                }
                if (!act) return;
                if (act === "jhintclose") {
                    try { localStorage.setItem("mwi_mm_jump_hint_dismissed", "1"); } catch (e) { /* ignore */ }
                    this._renderCart();
                    return;
                }
                const row = e.target.closest(".mm2-row");
                const prow = e.target.closest(".mm2-prow");
                const id = row?.dataset.id, hrid = prow?.dataset.hrid;
                try {
                    if (act === "star" && id) Actions.toggleCartItemStar(id);
                    else if (act === "del" && id) Actions.removeCartItem(id);
                    else if (act === "mkt" && id) {
                        Actions.openMarketplaceForItem(id);
                        if (this._form === "sheet") this._setDetent("mini");
                    }
                    else if (act === "th" && id) {
                        e.stopPropagation();
                        const cur = STATE.cart.get(id)?.threshold || 0;
                        const raw = prompt(this._sx("库存低于多少时重新提醒补货?(0=取消监控阈值)", "Restock threshold (0 = off):"), String(cur));
                        if (raw !== null) {
                            const v = Math.max(0, Math.round(Number(raw) || 0));
                            Actions.setCartItemThreshold(id, v);
                        }
                    }
                    else if (act === "pdone" && hrid) {
                        const _nm = STATE.craftingPlans.get(hrid)?.recipeName || hrid;
                        Actions.removePlan(hrid);
                        showToast(t("toast_plan_completed", _nm), "success");
                    }
                    else if (act === "pdel" && hrid) Actions.removePlan(hrid);
                    else if (act === "rec") {
                        e.stopPropagation();
                        const btn = e.target.closest("[data-act]");
                        btn.textContent = this._sx("按任意键…(Esc 取消)", "press a key… (Esc cancels)");
                        // 改调 §07 _shortcutManager.captureOnce 统一录制入口(白名单追加),
                        //       替代 在本区重写的简化录制器(丢了显示名特判/修饰键过滤/触发抑制)
                        _shortcutManager.captureOnce(() => this._renderCurrent());
                    }
                    else if (act === "recclear") { STATE.nextItemShortcut = null; saveToggles(); }
                } catch (err) { console.warn("[mwi-mm] §10A 操作失败:", act, err); }
            },
            _onListChange(e) {
                const input = e.target;
                if (!input.classList || !input.classList.contains("qv")) return;
                const v = Math.max(0, Math.round(Number(input.value) || 0));
                const row = input.closest(".mm2-row");
                const prow = input.closest(".mm2-prow");
                try {
                    if (row) Actions.updateCartItemQty(row.dataset.id, v);
                    else if (prow) Actions.updatePlanCraftCount(prow.dataset.hrid, Math.max(1, v));
                } catch (err) { console.warn("[mwi-mm] §10A 数量更新失败:", err); }
                if (this._pendingRender) { this._pendingRender = false; this._renderCurrent(); }
            },
            /** 步进按钮:点按 ±1,按住连发(400ms 后每 80ms 一次,2 秒后步长 ×10) */
            _onListPointerDown(e) {
                const btn = e.target.closest("[data-act]");
                if (!btn) return;
                const act = btn.dataset.act;
                if (!["dec", "inc", "pdec", "pinc"].includes(act)) return;
                e.preventDefault();
                const row = btn.closest(".mm2-row"), prow = btn.closest(".mm2-prow");
                const input = (row || prow)?.querySelector(".qv");
                if (!input) return;
                const dir = (act === "inc" || act === "pinc") ? 1 : -1;
                const isPlan = Boolean(prow);
                const floor = isPlan ? 1 : 0;
                let ticks = 0;
                const apply = () => {
                    ticks++;
                    const step = ticks > 25 ? 10 : 1;
                    const v = Math.max(floor, (Math.round(Number(input.value) || 0)) + dir * step);
                    input.value = String(v);
                };
                const commit = () => {
                    this._holdLock = false;
                    this._clearHold();
                    const v = Math.max(floor, Math.round(Number(input.value) || 0));
                    try {
                        if (row) Actions.updateCartItemQty(row.dataset.id, v);
                        else Actions.updatePlanCraftCount(prow.dataset.hrid, v);
                    } catch (err) { console.warn("[mwi-mm] §10A 步进提交失败:", err); }
                    window.removeEventListener("pointerup", commit);
                    window.removeEventListener("pointercancel", commit);
                };
                this._holdLock = true;                                       // 按住期间暂缓订阅重绘
                apply();
                this._holdTimer = setTimeout(() => { this._holdIv = setInterval(apply, 80); }, 400);
                window.addEventListener("pointerup", commit);
                window.addEventListener("pointercancel", commit);
            },
            _clearHold() {
                if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
                if (this._holdIv) { clearInterval(this._holdIv); this._holdIv = null; }
            },
            _onFootClick(e) {
                const act = e.target.closest("[data-act]")?.dataset.act;
                if (!act) return;
                try {
                    if (act === "clear") {
                        if (confirm(this._sx("清除全部未收藏的清单项?(收藏项保留)", "Clear all non-starred items?"))) Actions.clearNonStarred();
                    } else if (act === "pclear") {
                        if (confirm(this._sx("清空全部制作计划?", "Clear all crafting plans?"))) Actions.clearAllPlans();
                    }
                } catch (err) { console.warn("[mwi-mm] §10A 操作失败:", act, err); }
            },
            _selChange(e) {
                // 自由数字输入（如 补料起算行动次数）—— change 在失焦/回车时触发
                const numIn = e.target.closest("input[data-num]");
                if (numIn) {
                    const key = numIn.dataset.num;
                    if (key === "zScoreThreshold") {
                        const raw = String(numIn.value).trim();
                        let v = STATE.zScoreThreshold;                       // 空/非法 → 维持原值
                        if (raw !== "") {
                            const n = Number(raw);
                            if (Number.isFinite(n)) v = Math.max(1, Math.round(n));   // 0/负 → 下限1
                        }
                        STATE.zScoreThreshold = v;
                        numIn.value = String(v);                 // 回写,聚焦提交时显示也一致
                        saveToggles();
                        STATE.lastDataSignature = "";
                        try { refreshNow(); } catch (err) { /* ignore */ }
                    }
                    return;
                }
                const sel = e.target.closest("select[data-sel]");
                if (!sel) return;
                const key = sel.dataset.sel;
                if (key === "edgeZoneWidth") {
                    STATE.edgeZoneWidth = Number(sel.value) || 0;
                    saveToggles();
                } else if (key === "zScoreIndex") {
                    STATE.zScoreIndex = Math.max(0, Math.min(Z_OPTIONS.length - 1, Number(sel.value) || 0));
                    saveToggles();
                } else if (key === "zScoreThreshold") {
                    STATE.zScoreThreshold = Math.max(1, Math.round(Number(sel.value) || 10));
                    saveToggles();
                } else if (key === "guzzlingPouchLevel") {
                    STATE.guzzlingPouchLevel = Math.max(-1, Math.min(20, Number(sel.value)));
                    saveToggles();
                }
                // 影响缺料计算的设置改动后立即重算（否则要等看门狗下一拍）
                if (key === "zScoreIndex" || key === "zScoreThreshold" || key === "guzzlingPouchLevel") {
                    STATE.lastDataSignature = "";
                    try { refreshNow(); } catch (e) { /* ignore */ }
                }
            },
    
            /** 手柄通用:纵向拖动(handleY 两形态共享并持久化)+ 点击回调 */
            _attachHandleDrag(handleEl, onClick) {
                let dragMoved = false;
                handleEl.addEventListener("pointerdown", (e) => {
                    dragMoved = false;
                    const startY = e.clientY, startTop = this._ui.handleY;
                    const onMove = (ev) => {
                        const dy = ev.clientY - startY;
                        if (Math.abs(dy) > 4) dragMoved = true;
                        this._ui.handleY = Math.min(90, Math.max(5, startTop + (dy / window.innerHeight) * 100));
                        handleEl.style.top = this._ui.handleY + "%";
                    };
                    const onUp = () => {
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                        if (dragMoved) this._saveUI();
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                });
                handleEl.addEventListener("click", () => { if (!dragMoved) onClick(); });
            },
    
            // ════════ 桌面 rail ════════
            _mountRail() {
                this._makeHost(`
    <div class="mm2-hotline"><span class="mm2-hzchip">‹</span></div>
    <button class="mm2-handle" title="${this._sx("市场伴侣(可拖动)", "Market Mate (drag)")}">${this.SVG.cart}<span class="mm2-badge zero"></span></button>
    <aside class="mm2-rail" role="complementary">
      <div class="mm2-grip" title="${this._sx("拖动调整宽度", "Drag to resize")}"></div>
      <div class="mm2-head">
        <span class="t">${this._sx("市场伴侣", "Market Mate")}</span><span class="s"></span>
        <div class="hb">
          <button class="pin" title="${this._sx("固定(点外部不收起)", "Pin")}">${this.SVG.pin}</button>
          <button class="fold" title="${this._sx("收起 (Esc)", "Collapse (Esc)")}">»</button>
        </div>
      </div>
      ${this._contentHTML()}
    </aside>`);
                this.els = {
                    hotline: this.root.querySelector(".mm2-hotline"),
                    handle: this.root.querySelector(".mm2-handle"),
                    badge: this.root.querySelector(".mm2-badge"),
                    rail: this.root.querySelector(".mm2-rail"),
                    grip: this.root.querySelector(".mm2-grip"),
                    headCount: this.root.querySelector(".mm2-head .s"),
                    pin: this.root.querySelector(".mm2-head .pin"),
                    fold: this.root.querySelector(".mm2-head .fold"),
                    list: this.root.querySelector(".mm2-list"),
                    foot: this.root.querySelector(".mm2-foot"),
                    mbText: null
                };
                this._applyRailUI();
                this._renderCurrent();
                this._bindContent();
                this.root.addEventListener("change", (e) => this._selChange(e));
                this._bindRail();
            },
            _applyRailUI() {
                const u = this._ui;
                this.els.handle.style.top = u.handleY + "%";
                this.els.rail.style.width = u.railW + "px";
                this.els.rail.classList.toggle("open", u.open);
                this.els.handle.classList.toggle("hidden", u.open);
                this.els.pin.classList.toggle("on", u.pinned);
            },
            toggle() { this._ui.open ? this.close() : this.openRail(); },
            openRail() { if (this._form !== "rail") return; this._ui.open = true; this._applyRailUI(); },
            close() { if (this._form !== "rail") return; this._ui.open = false; this._applyRailUI(); },
            /** 跨形态打开界面,可指定 Tab(旧抽屉删除后的统一入口) */
            openUI(tab) {
                if (tab && ["cart", "plans", "quests", "set"].includes(tab)) this._tab = tab;
                if (this._form === "rail") { this._ui.open = true; this._applyRailUI(); }
                else if (this._form === "sheet") this._setDetent("half");
                try {
                    this.root.querySelectorAll(".mm2-tabs button").forEach(x => x.classList.toggle("on", x.dataset.t === this._tab));
                    this._renderCurrent();
                } catch (err) { /* ignore */ }
            },
            isOpenUI() { return this._form === "rail" ? this._ui.open : this._detent !== "mini"; },
            collapseUI() { if (this._form === "rail") this.close(); else if (this._form === "sheet") this._setDetent("mini"); },
            _bindRail() {
                this.els.fold.addEventListener("click", () => this.close());
                this.els.pin.addEventListener("click", () => { this._ui.pinned = !this._ui.pinned; this._applyRailUI(); this._saveUI(); });
                this._attachHandleDrag(this.els.handle, () => this.openRail());
                this.els.grip.addEventListener("pointerdown", (e) => {
                    e.preventDefault();
                    const startX = e.clientX, startW = this._ui.railW;
                    const onMove = (ev) => {
                        this._ui.railW = Math.min(560, Math.max(240, startW + (startX - ev.clientX)));
                        this.els.rail.style.width = this._ui.railW + "px";
                    };
                    const onUp = () => {
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                        this._saveUI();
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                });
                this._onDown = (e) => this._railPointerDown(e);
                this._onClickCap = (e) => {
                    if (Date.now() < this._suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
                };
                this._onMove = (e) => {
                    const W = STATE.edgeZoneWidth;
                    const on = !this._ui.open && W > 0 && e.clientX >= window.innerWidth - Math.max(W, 3);
                    if (on) {                                              // 热区带宽度跟随 edgeZoneWidth
                        const wpx = Math.max(W, 3) + "px";
                        if (this.els.hotline.style.width !== wpx) this.els.hotline.style.width = wpx;
                    }
                    this.els.hotline.classList.toggle("on", on);
                };
                this._onKey = (e) => { if (e.key === "Escape" && this._ui.open) this.close(); };
                document.addEventListener("pointerdown", this._onDown, true);
                document.addEventListener("click", this._onClickCap, true);
                document.addEventListener("pointermove", this._onMove, true);
                document.addEventListener("keydown", this._onKey, true);
            },
            _railPointerDown(e) {
                const path = e.composedPath ? e.composedPath() : [];
                if (this.host && path.includes(this.host)) return;
                const W = STATE.edgeZoneWidth;
                const inZone = W > 0 && e.clientX >= window.innerWidth - W;
                if (inZone && !this._isScrollbarHit(e)) {
                    e.stopPropagation(); e.preventDefault();
                    this._suppressClickUntil = Date.now() + 350;
                    this.toggle();
                    return;
                }
                if (this._ui.open && !this._ui.pinned) this.close();
            },
            _isScrollbarHit(e) {
                let el = e.target;
                for (let i = 0; i < 4 && el && el instanceof Element; i++, el = el.parentElement) {
                    if (el.scrollHeight > el.clientHeight + 1) {
                        const rect = el.getBoundingClientRect();
                        const sbLeft = rect.left + el.clientLeft + el.clientWidth;
                        if (el.offsetWidth - el.clientWidth >= 8 && e.clientX >= sbLeft) return true;
                    }
                }
                return false;
            },
    
            // ════════ 移动 sheet ════════
            _mountSheet() {
                this._detent = "mini";
                this._makeHost(`
    <button class="mm2-handle" title="${this._sx("市场伴侣(可拖动)", "Market Mate (drag)")}">${this.SVG.cart}<span class="mm2-badge zero"></span></button>
    <section class="mm2-sheet" data-detent="mini" role="complementary">
      <div class="mm2-grab"><i></i></div>
      <div class="mm2-head">
        <span class="t">${this._sx("市场伴侣", "Market Mate")}</span><span class="s"></span>
        <div class="hb"><button class="down" title="${this._sx("收起", "Minimize")}">×</button></div>
      </div>
      ${this._contentHTML()}
    </section>`);
                this.els = {
                    handle: this.root.querySelector(".mm2-handle"),
                    badge: this.root.querySelector(".mm2-badge"),
                    sheet: this.root.querySelector(".mm2-sheet"),
                    grab: this.root.querySelector(".mm2-grab"),
                    down: this.root.querySelector(".mm2-head .down"),
                    headCount: this.root.querySelector(".mm2-head .s"),
                    list: this.root.querySelector(".mm2-list"),
                    foot: this.root.querySelector(".mm2-foot"),
                    mbText: null
                };
                this.els.handle.style.top = this._ui.handleY + "%";
                this._renderCurrent();
                this._bindContent();
                this.root.addEventListener("change", (e) => this._selChange(e));
                this._bindSheet();
            },
            _setDetent(d) {
                this._detent = d;
                if (!this.els.sheet) return;
                this.els.sheet.dataset.detent = d;
                if (this.els.handle) this.els.handle.classList.toggle("hidden", d !== "mini");
            },
            _bindSheet() {
                this._attachHandleDrag(this.els.handle, () => this._setDetent("half"));
                this.els.grab.addEventListener("click", () => this._setDetent(this._detent === "half" ? "full" : "half"));
                this.els.down.addEventListener("click", () => this._setDetent("mini"));
                this._onDown = (e) => {
                    const path = e.composedPath ? e.composedPath() : [];
                    if (this.host && path.includes(this.host)) return;
                    if (this._detent !== "mini") this._setDetent("mini");
                };
                this._onKey = (e) => { if (e.key === "Escape" && this._detent !== "mini") this._setDetent("mini"); };
                document.addEventListener("pointerdown", this._onDown, true);
                document.addEventListener("keydown", this._onKey, true);
                // 键盘弹出(视口骤减)→ 收回手柄态,不与系统键盘抢底部
                if (window.visualViewport) {
                    let base = window.visualViewport.height;
                    this._vvHandler = () => {
                        const h = window.visualViewport.height;
                        if (h < base - 150 && this._detent !== "mini") this._setDetent("mini");
                        if (h > base) base = h;
                    };
                    window.visualViewport.addEventListener("resize", this._vvHandler);
                }
            },
            // ── 全局监听清理 / 持久化 ────────────────────────────────────────────
            _removeGlobalListeners() {
                if (this._onDown) document.removeEventListener("pointerdown", this._onDown, true);
                if (this._onClickCap) document.removeEventListener("click", this._onClickCap, true);
                if (this._onMove) document.removeEventListener("pointermove", this._onMove, true);
                if (this._onKey) document.removeEventListener("keydown", this._onKey, true);
                if (this._vvHandler && window.visualViewport) window.visualViewport.removeEventListener("resize", this._vvHandler);
                if (this._rsHandler) window.removeEventListener("resize", this._rsHandler);
                this._onDown = this._onClickCap = this._onMove = this._onKey = this._vvHandler = this._rsHandler = null;
            },
            _loadUI() {
                try {
                    const raw = localStorage.getItem(this.LS_KEY);
                    if (!raw) return;
                    const p = JSON.parse(raw);
                    if (typeof p.handleY === "number" && p.handleY >= 5 && p.handleY <= 90) this._ui.handleY = p.handleY;
                    if (typeof p.railW === "number" && p.railW >= 240 && p.railW <= 560) this._ui.railW = p.railW;
                    if (this._ui.railW === 312) this._ui.railW = 340;   // 旧默认值一次性升级(自定义值保留)
                    if (typeof p.pinned === "boolean") this._ui.pinned = p.pinned;
                } catch (err) { /* ignore */ }
            },
            _saveUI() {
                try {
                    localStorage.setItem(this.LS_KEY, JSON.stringify({
                        handleY: this._ui.handleY, railW: this._ui.railW, pinned: this._ui.pinned
                    }));
                } catch (err) { /* ignore */ }
            }
        };
    
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §10 旧浮窗 UI —— 已物理删除(FAB/抽屉/旧设置面板/旧计划与
        //     任务浮窗/三套拖拽),功能由 §10A 新壳完整承接。
        //     旧位置/尺寸 localStorage 键不再读取(未删除,可自行清理):
        //     mwi_missing_cart_fab_pos_v1 / mwi_missing_cart_drawer_pos_v1 /
        //     mwi_missing_cart_drawer_size_v2 / mwi_crafting_plans_pos_v1。
        //     §13 样式表中的旧选择器成为死规则,无副作用,后续随样式重构清理。
        // ════════════════════════════════════════════════════════════════════════
    
        // ════════════════════════════════════════════════════════════════════════
        // §11 刷新与守护 Guard
        //     refreshNow / scheduleRefresh / Observer×2 / 旧版 重挂看门狗
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 刷新逻辑 ──────────────────────────────────────────────────
    
        /**
         * 立即刷新：检测当前弹窗，提取缺料数据，更新 UI
         * ★ 增加强化面板重建冷却保护，防止面板清空期间误清数据
         */
        function refreshNow() {
            // 房屋弹窗为模态层级，优先检测；关闭后自然回退到技能面板
            let modal = findActiveHousePanel();
            let data = null;
    
            if (modal) {
                // Housing 签名缓存:仅当签名未变 且 摘要面板仍在 时跳过(面板可能被 React 重渲染抹掉)
                const hSig = getHousingSignature(modal);
                if (hSig && hSig === _lastHouseSignature && modal.querySelector(".mwi-mm-summary-panel")) {
                    syncMarketLocator();
                    return;
                }
                _lastHouseSignature = hSig;
                try {
                    data = extractHouseRequirements(modal);
                } catch (e) {
                    console.error("[mwi-mm] extractHouseRequirements failed:", e);
                    return;
                }
            } else {
                _lastHouseSignature = null;
                // findActiveModal 已去掉 regularComponent 门禁,统一覆盖 制作/炼金/强化;
                //   语义由 extractRequirements 内 resolveActionContext(Fiber) 按 actionDetail.function 分派。
                modal = findActiveModal();
                if (modal) {
                    try {
                        data = extractRequirements(modal);
                    } catch (e) {
                        console.error("[mwi-mm] extractRequirements failed:", e);
                        return;
                    }
                }
            }
    
            // ★ 修复 B: 强化面板重建冷却保护
            // 游戏在每次强化完成后会完全拆毁面板 DOM 并在 3-5 秒后重建。
            // 空白期间如果清除数据，会导致摘要面板/计划次数输入框丢失、badges 闪烁。
            // 策略: 面板从"有数据"变为"空/不存在"时进入 6 秒冷却期，保持旧数据不清除。
            const now = Date.now();
            const dataIsEmpty = !modal || !data || (data.requirements.length === 0 && !data.upgrade);
            const hadData = STATE.currentData && (STATE.currentData.requirements.length > 0 || STATE.currentData.upgrade);
    
            if (dataIsEmpty && hadData) {
                // 面板刚变空 — 设置冷却期
                if (!STATE.enhCooldownUntil || STATE.enhCooldownUntil < now) {
                    STATE.enhCooldownUntil = now + 6000;
                    STATE.lastNonEmptyModal = STATE.currentModal;
                    _log.note("refresh", "面板变空,入6s冷却(保留旧UI)");
                }
            }
    
            // 在冷却期内，面板为空时跳过刷新，保持旧数据
            if (dataIsEmpty && STATE.enhCooldownUntil && now < STATE.enhCooldownUntil) {
                return;
            }
    
            // 冷却期已过或面板已恢复 — 重置冷却状态
            if (!dataIsEmpty) {
                STATE.enhCooldownUntil = 0;
                STATE.lastNonEmptyModal = null;
            }
    
            // 弹窗确实已关闭（冷却期也过了）→ 清理状态
            if (!modal) {
                // 仅在确有注入残留时才执行清理与记录;无面板期间的空转直接返回(否则市场
                // 浏览等高频 mutation 会让本路径反复执行并刷出大量同义 log)。
                if (STATE.currentModal || STATE.currentData) {
                    _log.note("refresh", "面板离开,清理注入UI");
                    if (STATE.currentModal) clearInlineBadges(STATE.currentModal);
                    STATE.currentModal = null;
                    STATE.currentData = null;
                    STATE.lastDataSignature = "";
                }
                STATE.enhCooldownUntil = 0;
                syncMarketLocator();
                return;
            }
    
            // 签名未变 + 徽章已存在 → 跳过重绘
            const signature = buildDataSignature(data);
            const sameModal = STATE.currentModal === modal;
            if (sameModal && signature === STATE.lastDataSignature) {
                // 跳绘条件:签名未变 且 徽章逐行完整 且 摘要面板在;任一缺失 → 补绘
                const badgesOk = _badgesIntact(modal, data);
                const panelOk = !!modal.querySelector(".mwi-mm-summary-panel");
                if (badgesOk && panelOk) {
                    syncMarketLocator();
                    return;
                }
                _log.note("refresh", "签名同但完整性破缺,补绘 badges=" + badgesOk + (badgesOk ? "" : "(" + _badgesFailReason + ")") + " panel=" + panelOk);
            }
    
            // 切换弹窗时先清旧徽章
            if (STATE.currentModal && STATE.currentModal !== modal) { _log.note("refresh", "面板切换,全量重绘"); clearInlineBadges(STATE.currentModal); }
    
            STATE.currentModal = modal;
            STATE.currentData = data;
            STATE.lastDataSignature = signature;
    
            _log.note("refresh", "重绘(" + ((data.requirements && data.requirements.length) || 0) + "行)");
            let renderFailed = false;
            try {
                renderInlineBadges(modal, data);
            } catch (e) {
                renderFailed = true;
                console.error("[mwi-mm] renderInlineBadges failed:", e, { modal, reqCount: data.requirements?.length, hasInputEls: data.requirements?.some(r => r.inputEl) });
            }
            try {
                renderSummaryPanel(modal, data);
            } catch (e) {
                renderFailed = true;
                console.error("[mwi-mm] renderSummaryPanel failed:", e);
            }
            try {
                // 渲染展开的子配方树
                const summaryPanel = modal.querySelector(".mwi-mm-summary-panel");
                if (summaryPanel && data._dataLayerUsed) renderChainSubRows(summaryPanel, data);
            } catch (e) {
                console.error("[mwi-mm] renderChainSubRows failed:", e);
            }
    
            // 渲染失败时清除签名缓存，确保下次刷新会重试渲染
            if (renderFailed) STATE.lastDataSignature = "";
    
            if (data.totalMissingTypes > 0) setAction(t("action_calculated", data.totalMissingTypes, formatQty(data.totalMissingQty)));
            else setAction(t("action_sufficient"));
            syncMarketLocator();
        }
    
        /** 延迟刷新（自动去抖） */
        // 去抖封顶(maxWait):持续不断的 mutation 会一直重置去抖定时器,导致 refreshNow 永不执行(饿死)。
        //   记录本串去抖首次排程时刻,距今 ≥ REFRESH_MAXWAIT 仍被推迟则立即执行一拍,保证刷新不被饿死。
        const REFRESH_MAXWAIT = 250;
        let _refreshFirstReqAt = 0;     // 本串去抖首次排程时刻
        let _refreshCoalesced = 0;      // 本串去抖定时器被重置的次数
    
        function _doRefreshNow() {
            STATE.refreshTimer = null;
            const coalesced = _refreshCoalesced;
            _refreshCoalesced = 0;
            _refreshFirstReqAt = 0;
            // 合并次数异常高 → 几乎可断定遭遇 mutation 风暴(常见于与外部插件互相注入),记录以便定位
            if (coalesced >= 25) _log.note("refresh", "去抖合并 ×" + coalesced + " 触顶强制执行(疑似 mutation 风暴)");
            try {
                refreshNow();
            } catch (e) {
                console.error("[mwi-mm] refreshNow() uncaught error:", e);
            }
        }
    
        /** 延迟刷新（自动去抖，带 maxWait 封顶以防持续 mutation 把刷新饿死） */
        function scheduleRefresh(delay = 120) {
            // ★ 自愈 — 若主 observer 当前所挂节点已脱离文档，立即重挂(改挂 body 后此分支基本不触发，保留作保底)。
            if (STATE.gameRootObserved && !STATE.gameRootObserved.isConnected) ensureMainObserverAttached();
            const now = Date.now();
            if (STATE.refreshTimer) {
                clearTimeout(STATE.refreshTimer);
                _refreshCoalesced++;
                // maxWait 封顶:本串去抖已持续 ≥ REFRESH_MAXWAIT 仍未落地 → 立刻执行,打断饿死。
                if (now - _refreshFirstReqAt >= REFRESH_MAXWAIT) {
                    _doRefreshNow();
                    return;
                }
            } else {
                _refreshFirstReqAt = now;
            }
            STATE.refreshTimer = setTimeout(_doRefreshNow, delay);
        }
    
        // ── Observer ──────────────────────────────────────────────────
        //   监听 DOM 变化触发自动刷新，以及库存同步。
    
        /** 确保主 observer 挂在 document.body 上。幂等:已挂返回 false,发生(重)挂返回 true。
         *  监听 body 而非 GamePage 容器,以覆盖渲染在 GamePage 之外的市场/模态 portal;body 不会被 React
         *  替换,无需「死节点重挂」自愈。放宽范围的额外触发由 isPluginNode 过滤 + 去抖 + 签名早退吸收。 */
        function ensureMainObserverAttached() {
            if (!STATE.observer) return false;
            if (STATE.gameRootObserved === document.body && document.body.isConnected) return false;
            STATE.observer.disconnect();
            STATE.gameRootObserved = document.body;
            STATE.observer.observe(document.body, { childList: true, subtree: true });
            return true;
        }
    
        /** 设置全局 MutationObserver，过滤插件自身的 DOM 变更 */
        function setupObservers() {
            if (STATE.observer) STATE.observer.disconnect();
    
            STATE.observer = new MutationObserver((mutations) => {
                try {
                if (isObserverSuppressed()) return;
    
                /** 判断节点是否属于本插件（避免自触发） */
                const isPluginNode = (node) => {
                    if (!(node instanceof Element)) return false;
                    const nodeId = typeof node.id === "string" ? node.id : (node.id?.baseVal || "");
                    if (nodeId && nodeId.startsWith("mwi-mm-")) return true;
                    if (node.classList?.length && [...node.classList].some((cls) => cls.startsWith("mwi-mm-"))) return true;
                    if (node.closest?.(".mwi-mm-summary-panel")
                        || node.closest?.(".mwi-mm-toast")) return true;
                    return false;
                };
    
                const hasExternalMutation = mutations.some((m) => {
                    const target = m.target;
                    if (!(target instanceof Element)) return false;
                    if (isPluginNode(target)) return false;
                    if (m.type === "childList") {
                        const changed = [...m.addedNodes, ...m.removedNodes];
                        if (changed.length && changed.every((x) => isPluginNode(x))) return false;
                    }
                    return true;
                });
    
                if (hasExternalMutation) scheduleRefresh(90);
                } catch (e) {
                    console.error("[mwi-mm] MutationObserver callback error:", e);
                    scheduleRefresh(200);
                }
            });
    
            // ★ 初始挂到 document.body 作为保底（此时 GamePage 可能还没渲染）；
            //   去掉 characterData 监听 — 纯文本变化（如倒计时数字）不需要触发材料刷新。
            //   init() 在 waitForGameReady() 之后会调用 ensureMainObserverAttached() 把监听范围收窄到 GamePage，
            //   该函数后续在重连 / 标签页可见时还会自动重挂，避免 React 重挂容器后监听失效（旧版）。
            STATE.observer.observe(document.body, { childList: true, subtree: true });
    
            // 监听制作数量输入框的用户输入
            document.addEventListener("input", (event) => {
                const el = event.target;
                if (!(el instanceof Element) || !el.matches('input[class*="Input_input"]')) return;
                const c = el.closest('[class*="SkillActionDetail_maxActionCountInput"]');
                if (!c) return;
                if (isVisible(c)) scheduleRefresh(30);
            }, true);
    
            // 监听技能面板 / 房屋面板的点击
            document.addEventListener("click", (event) => {
                const el = event.target;
                if (!(el instanceof Element)) return;
                if (el.closest(SEL.detailRoot)
                    || el.closest('[class*="SkillAction_skillAction"]')
                    || el.closest(SEL.houseRoot)
                    || el.closest('[class*="HousePanel_"]')) {
                    scheduleRefresh(120);
                }
            }, true);
    
            // ★ 标签页重新可见时常伴随 WS 重连 / React 重挂 → 确保主 observer 仍挂在活动节点上。
            //   ensureMainObserverAttached 仅在节点确实变化时返回 true，稳态下切换标签页几乎零开销。
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible" && ensureMainObserverAttached()) scheduleRefresh(150);
            });
    
            setupInventorySyncObservers();
        }
    
        // ── 库存同步 Observer ─────────────────────────────────────────
        let _notifObserver = null;
        let _invPanelObserver = null;
        let _syncObserverRetryTimer = null;
    
        function setupInventorySyncObservers() {
            _tryAttachSyncObservers();
        }
    
        /** 尝试挂载通知区 / 背包面板的 MutationObserver，失败时自动重试 */
        function _tryAttachSyncObservers() {
            let attached = 0;
    
            // 通知区域（购买成功等提示）
            if (!_notifObserver) {
                const el = document.querySelector('[class*="GamePage_notifications"]');
                if (el) {
                    _notifObserver = new MutationObserver(() => triggerInventorySync(60));
                    _notifObserver.observe(el, { childList: true, subtree: true });
                    attached++;
                }
            } else { attached++; }
    
            // 背包面板
            if (!_invPanelObserver) {
                const el = document.querySelector('[class*="Inventory_inventory"]');
                if (el) {
                    _invPanelObserver = new MutationObserver(() => triggerInventorySync(50));
                    _invPanelObserver.observe(el, { childList: true, subtree: true, characterData: true });
                    attached++;
                }
            } else { attached++; }
    
            // 两个 observer 未全部挂载 → 设定重试
            if (attached < 2 && !_syncObserverRetryTimer) {
                let retries = 0;
                _syncObserverRetryTimer = setInterval(() => {
                    retries++;
                    _tryAttachSyncObservers();
                    if ((_notifObserver && _invPanelObserver) || retries > 30) {
                        clearInterval(_syncObserverRetryTimer);
                        _syncObserverRetryTimer = null;
                    }
                }, 1000);
            }
        }
    
        /** ★ 断线重连 / 重登（WS 推送 init_character_data）后，React 会重挂 GamePage、
         *  通知区与背包面板，使所有一次性挂载的监听器失效。此函数把它们重新挂到新节点并强制重绘一次，
         *  让被 React 清掉的徽章自动恢复，无需刷新页面。函数幂等，可安全重复调用。 */
        function _healObserversAfterRemount() {
            // 主 observer（徽章引擎）重挂到当前 GamePage 节点
            ensureMainObserverAttached();
            // 库存同步 observer 同样是一次性挂载，节点被替换后会失效 → 重置后重挂
            try { if (_notifObserver) _notifObserver.disconnect(); } catch (e) { /* ignore */ }
            try { if (_invPanelObserver) _invPanelObserver.disconnect(); } catch (e) { /* ignore */ }
            _notifObserver = null;
            _invPanelObserver = null;
            if (_syncObserverRetryTimer) { clearInterval(_syncObserverRetryTimer); _syncObserverRetryTimer = null; }
            _tryAttachSyncObservers();
            // 把被 React 清掉的徽章重新注入
            scheduleRefresh(120);
        }
    
        // ── ★ 重挂看门狗（不依赖 observer / WS / 可见性的最终兜底 + 控制台诊断） ──────────
        //   背景与根因：徽章与「加入购物清单」按钮是注入在游戏 React 子树（SkillActionDetail / HousePanel）内部的，
        //   React 一旦在「数据不变」时重渲染/重挂该子树（背包更新、动作进度跳动、旁组件重渲染、断线重连、
        //   或其它插件触发的协调崩溃等）就会把它们抹掉。而本插件的重注入由「游戏数据签名」缓存把守，
        //   数据没变时不会重绘 → UI 被抹掉后不恢复。叠加 把主 observer 收窄到会被 React 换掉的 GamePage
        //   容器，observer 一旦盯上死节点便彻底静默，必须刷新页面才恢复。
        //   看门狗用一个低频轮询彻底绕开上述所有信号：每 1s 主动把 observer 重新挂到当前 GamePage 容器，
        //   并在「面板开着、但我们的摘要面板缺失」时强制补注入，同时把这一事件显式打到控制台（而非静默）。
        //   开销极小（稳态下每轮仅几次只读 querySelector）。
        let _watchdogTimer = null;
        let _wdTicks = 0;             // 心跳计数(诊断 log:每 60 拍记 1 条,证明看门狗活着)
        let _uiLossEvents = 0;       // 累计「UI 丢失」事件数（用于让用户感知频率）
        let _consecutiveLoss = 0;    // 连续多少个 tick 仍未恢复（用于区分「正常被抹除→补注入」与「补注入失败」）
        let _wdLastMarketVisible = false;   // 上一拍市场面板是否可见(检测开/关翻转用)
    
        /** 把 UI 丢失/补注入失败显式记录到控制台，附带定位信息 */
        function _logUILoss(modal, reattached, reason) {
            const lossDesc = reason || "「加入购物清单」摘要面板缺失，";
            const hasBadge = !!modal.querySelector("[data-mm-badge], .mwi-mm-upgrade-inline");
            const observerAlive = !!(STATE.gameRootObserved && STATE.gameRootObserved.isConnected);
            let modalCls = "modal";
            try { modalCls = (String(modal.className || "").match(/(SkillActionDetail|HousePanel)\w*/) || [])[0] || "modal"; } catch (e) { /* ignore */ }
            if (_consecutiveLoss <= 1) {
                _uiLossEvents++;
                console.warn(
                    "[mwi-mm] ⚠ 注入 UI 丢失 #" + _uiLossEvents + "：游戏面板（" + modalCls + "）仍在，但" + lossDesc +
                    "判定为游戏 React 重渲染/重挂或第三方插件抹除。正在自动补注入。" +
                    " [徽章残留=" + hasBadge + " | observer容器存活=" + observerAlive + " | 本轮重挂observer=" + reattached + "]"
                );
            } else {
                // 已经补注入过、隔了 ≥1 个 tick（约 N 秒）仍缺失 → 重注入本身可能失败了，升级为 error
                console.error(
                    "[mwi-mm] ✗ 补注入后注入 UI 仍缺失：已连续检测约 " + _consecutiveLoss + "s（" + lossDesc.replace(/，$/, "") + "）。重注入可能失败，" +
                    "请把本条及上方相关报错（如 renderSummaryPanel/extractRequirements failed）反馈给作者。" +
                    " [面板=" + modalCls + " | 徽章残留=" + hasBadge + " | observer容器存活=" + observerAlive + "]"
                );
            }
        }
    
        function _watchdogTick() {
            _wdTicks++;
            if (_wdTicks % 60 === 0) _log.note("wd", "心跳 ×" + _wdTicks);
            try {
                // 1) 确保主 observer 仍挂在 body 上(幂等)
                const reattached = ensureMainObserverAttached();
    
                // 1.5) 市场弹窗在 GamePage 外的 portal 渲染,主 observer 看不到其开/关,也看不到市场内购买
                //      导致的库存(WS)变化 → 返回后徽章会停在旧值。检测市场面板可见性翻转,开/关即强刷一拍。
                const marketVisible = !!findVisibleMarketplacePanel();
                const marketChanged = marketVisible !== _wdLastMarketVisible;
                _wdLastMarketVisible = marketVisible;
                if (marketChanged) {
                    _log.note("wd", "市场面板" + (marketVisible ? "打开" : "关闭") + ",强制刷新(库存/徽章可能已变)");
                    STATE.lastDataSignature = ""; _lastHouseSignature = "";
                    scheduleRefresh(60);
                    return;
                }
    
                // 2) 强化重建冷却期内，面板本就该是空的（游戏在重建），交给 refreshNow 的冷却逻辑，不在此干预
                if (STATE.enhCooldownUntil && Date.now() < STATE.enhCooldownUntil) { _consecutiveLoss = 0; return; }
    
                // 2.5) 若已有一次刷新在队列中（observer / 点击 / 上一拍看门狗排的），说明快路径正在处理，
                //      本拍让路、不重复动作也不误报；待其落地后下一拍再据实判断。
                if (STATE.refreshTimer) return;
    
                // 3) 面板开着但「摘要面板」缺失 → 强制补注入。摘要面板是「我们是否已注入到此面板」的权威标记，
                //    findActiveModal/findActiveHousePanel 仅在确有材料区时才返回非空，故此判定可靠、不会误报。
                const modal = findActiveHousePanel() || findActiveModal();
                if (!modal) {
                    _consecutiveLoss = 0;
                    // 页面有可见详情却未被任何通道接住 → 记录被哪道门拒(同文案自动折叠 ×N)
                    for (const node of document.querySelectorAll(SEL.detailRoot)) {
                        if (!isVisible(node)) continue;
                        let why;
                        if (_inHiddenMainContainer(node)) why = "隐藏容器";
                        else if (!node.querySelector(SEL.requirements)) why = "无材料区";
                        else why = "有材料区却未返回(异常,请回报)";   // 已无 regularComponent 门禁,正常不应到此
                        _log.note("wd", "存在可见详情但被拒:" + why);
                        break;
                    }
                    return;
                }
                const hasPanel = !!modal.querySelector(".mwi-mm-summary-panel");
    
                // React 会复用 SkillActionDetail 容器,换配方后容器仍是同一元素而我们的注入还是旧配方的;
                // 用 Fiber 读当前面板真实 actionHrid 与已渲染的比对,不一致即判定过期 → 强制重绘(免疫 observer)。
                let recipeStale = false;
                try {
                    const liveHrid = (resolveActionContext(modal) || {}).actionHrid || null;
                    const renderedHrid = (STATE.currentData && STATE.currentData._recipeHrid) || null;
                    if (liveHrid && renderedHrid && liveHrid !== renderedHrid) recipeStale = true;
                } catch (e) { /* Fiber 读取失败时不阻断后续判定 */ }
    
                // 徽章保险:摘要面板在,但徽章数量少于上次提取的应有数量(非金币、有挂点的行) → 判定被部分抹除,强制补绘
                let badgeLossReason = null;
                if (hasPanel && STATE.currentData && STATE.currentModal === modal && !recipeStale) {
                    try {
                        const expected = (STATE.currentData.requirements || []).filter((r) => r.inputEl && !(r.itemId && isCoinItem(r.itemId))).length;
                        if (expected > 0) {
                            const actual = modal.querySelectorAll("[data-mm-badge]").length;
                            if (actual < expected) badgeLossReason = "缺料徽章短缺(应有 " + expected + " 枚,实存 " + actual + " 枚)，";
                        }
                    } catch (e) { /* ignore */ }
                }
    
                // UI 完好的充要条件:摘要面板在 且 面板身份一致 且 配方未漂移 且 无徽章缺失;任一不满足即强制重绘
                if (hasPanel && STATE.currentModal === modal && !recipeStale && !badgeLossReason) { _consecutiveLoss = 0; return; }
    
                // —— 检测到 UI 丢失/过期 ——
                _consecutiveLoss++;
                _logUILoss(modal, reattached, recipeStale ? "配方漂移(容器复用,徽章过期)" : (badgeLossReason || undefined));
                // 同时清掉技能 & 房屋两套签名缓存，确保 refreshNow 这次一定重绘，而非命中任一去重/签名早退
                STATE.lastDataSignature = "";
                _lastHouseSignature = "";
                scheduleRefresh(60);
            } catch (e) {
                console.error("[mwi-mm] watchdog tick error:", e);
            }
        }
        function startRemountWatchdog() {
            if (_watchdogTimer) return;            // 幂等：避免重复 setInterval 泄漏
            _watchdogTimer = setInterval(_watchdogTick, 1000);
            // 长会话保险:后台标签页定时器被节流,挂后台期间被抹的注入 UI 无人补;
            // 切回可见的瞬间清两套签名缓存并强制刷新一拍。
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState !== "visible") return;
                _log.note("vis", "切回可见,清签名强刷");
                try {
                    STATE.lastDataSignature = "";
                    _lastHouseSignature = null;
                    scheduleRefresh(80);
                } catch (e) { /* ignore */ }
            });
        }
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §12 周边功能 Periph
        //     _shortcutManager / _marketPrefill / _purchaseNav(采购导航,封存区)
        // ════════════════════════════════════════════════════════════════════════
    
        // ── Next item 快捷键管理器 ───────────────────────────
        //   作用域严格限定：只有当「物品购买完成且购物车还有下一个待购物品」事件
        //   触发后（即 _onItemFulfilled(nextItem) 入口被命中且
        //   nextItem 非空），快捷键才被「装填」（armed）；按下快捷键即等同于点击
        //   横幅上的「Next item ▶」按钮。bar 淡出后仍然有效，直到下列任一情况：
        //     1) 用户按下快捷键完成跳转；
        //     2) 用户点击横幅按钮完成跳转；
        //     3) 新一轮购齐事件触发（重新装填新目标）；
        //     4) 装填的目标物品已被外部移除/清空（触发时校验，回退安全）；
        //     5) 「全部购齐」事件（无下一项）→ 卸下。
        const _shortcutManager = {
            _armedNextItemId: null,    // 当前可触发的下一个物品 itemId（normalized）
            _captureMode: false,       // 是否处于录制快捷键状态(录制期抑制全局触发)
            _globalKeyHandler: null,   // 触发模式下的全局 keydown 监听器
            _inited: false,
    
            init() {
                if (this._inited) return;
                this._inited = true;
                // 自愈注册体系 —— 本监听器是全脚本唯一在 document-start 注册的
                //   window 事件监听器;页面启动期的文档重写(document.open 等)会按规范
                //   清空 window/document 全部监听器,早注册的死、晚注册的活(__key 实测:
                //   探针收键而管理器收键 ✗,与该机制完全吻合)。对策:幂等重挂 ×4 时机
                //   (立即 / DOMContentLoaded / 每次购齐装填 / 20s 周期),window+document
                //   双层冗余,事件打戳去重。语义与旧版 逐字节等价,只是注册不死。
                this._ensureListener();
                try { document.addEventListener("DOMContentLoaded", () => this._ensureListener(), { once: true }); } catch (err) { /* ignore */ }
                try { this._repinTimer = setInterval(() => this._ensureListener(), 20000); } catch (err) { /* ignore */ }
            },
    
            /** 幂等重挂(removeEventListener 同引用不存在时为无害空操作) */
            _repinCount: 0,
            _ensureListener() {
                try {
                    if (!this._globalKeyHandler) this._globalKeyHandler = (e) => this._onGlobalKey(e);
                    window.removeEventListener("keydown", this._globalKeyHandler, true);
                    window.addEventListener("keydown", this._globalKeyHandler, true);
                    if (!this._docKeyHandler) this._docKeyHandler = (e) => this._onGlobalKey(e);
                    document.removeEventListener("keydown", this._docKeyHandler, true);
                    document.addEventListener("keydown", this._docKeyHandler, true);
                    this._repinCount++;
                } catch (err) { /* ignore */ }
            },
    
            /** 装填快捷键目标（购齐事件入口调用） */
            arm(itemId) {
                this._ensureListener();   // 装填即重挂 —— 确保按键将至的时刻监听器必在
                const id = itemId ? normalizeCartItemId(itemId) : "";
                this._armedNextItemId = id || null;
                _log.note("key", "装填 " + (id || "(空)"));
            },
    
            /** 卸下快捷键 */
            disarm() {
                this._armedNextItemId = null;
            },
    
            /** 全局 keydown：触发已装填的快捷键 */
            _onGlobalKey(e) {
                this._lastKeySeenAt = Date.now();   // 心跳戳,__key 据此证明本监听器收到了按键
                if (e.__mwiMMKeySeen) return;       // 双层冗余去重,同一事件只处理一次
                try { e.__mwiMMKeySeen = true; } catch (err) { /* ignore */ }
                if (this._captureMode) return; // 捕获模式由独立 handler 处理
                if (!STATE.nextItemShortcut) return;
                if (!this._armedNextItemId) return;
    
                // 焦点在输入框/编辑器内 → 让游戏聊天等正常工作，不抢热键
                const ae = document.activeElement;
                if (ae && (
                    ae.tagName === "INPUT" ||
                    ae.tagName === "TEXTAREA" ||
                    ae.tagName === "SELECT" ||
                    ae.isContentEditable
                )) return;
    
                if (!this._matches(e, STATE.nextItemShortcut)) return;
                e.preventDefault();
                e.stopPropagation();
                this._fireNextItem();
            },
    
            /** 等同于点击横幅上的 "Next item ▶" 按钮 */
            _fireNextItem() {
                const id = this._armedNextItemId;
                if (!id) return;
    
                // 校验：装填的物品仍在购物车且还需购买
                // 旧版此处静默 disarm —— 装填目标在「装填→按键」间隙被购齐/移除时,
                //        快捷键就此哑火且无任何痕迹(实测 __key 五门全过却不跳的成因候选)。
                //        现改为:点亮日志 + 就地重选下一个待购物品自愈改跳。
                const row = STATE.cart.get(id);
                if (!row || row.quantity <= 0) {
                    let fallback = null;
                    try {
                        fallback = _purchaseNav._getCartItemsForNav().find(x => normalizeCartItemId(x.itemId) !== id) || null;
                    } catch (e) { /* ignore */ }
                    if (fallback) {
                        const fbId = normalizeCartItemId(fallback.itemId);
                        console.info("[mwi-mm] 快捷键:装填目标已过期(" + id + "),自愈改跳 " + fbId);
                        // fire-once 语义(与正常路径一致):跳转后由尾部统一 disarm,下次购齐事件重新装填
                        try { openMarketplaceForItem(fbId); } catch (e) { console.warn("[mwi-mm] 快捷键跳转失败:", e); }
                    } else {
                        console.info("[mwi-mm] 快捷键:装填目标已过期(" + id + ")且无其他待购物品,卸载");
                        this.disarm();
                        return;
                    }
                } else {
                    // 跳转到下一个物品市场(失败不再静默吞掉)
                    try { openMarketplaceForItem(id); } catch (e) { console.warn("[mwi-mm] 快捷键跳转失败:", e); }
                }
    
                this.disarm();
            },
    
            /** 进入捕获模式 */
            /** 把快捷键格式化为可读字符串 */
            format(s) {
                if (!s || !s.code) return "";
                const parts = [];
                if (s.ctrl) parts.push("Ctrl");
                if (s.shift) parts.push("Shift");
                if (s.alt) parts.push("Alt");
                if (s.meta) parts.push("Meta");
                parts.push(s.display || s.code);
                return parts.join("+");
            },
    
            /** 比较 keydown 事件是否匹配某个快捷键定义 */
            _matches(e, s) {
                if (!s) return false;
                return e.code === s.code
                    && e.ctrlKey === !!s.ctrl
                    && e.shiftKey === !!s.shift
                    && e.altKey === !!s.alt
                    && e.metaKey === !!s.meta;
            },
    
            /** 统一录制入口(供新壳调用,替代 在 §10A 内重写的简化录制器)。
             *  版丢了 旧版的三件录制语义,本方法逐一找回:
             *  ① Space/方向键的友好显示名(旧版 " ".toUpperCase() 仍是空格,按钮与横幅提示显示空白);
             *  ② 忽略单独按下的修饰键(旧版裸按 Ctrl 即被录制);
             *  ③ 录制期间置 _captureMode 抑制全局触发(旧版重录时会边录边跳市场)。
             *  Escape 取消;完成或取消后回调 onDone(shortcut|null)。 */
            captureOnce(onDone) {
                if (this._captureMode) return;
                this._captureMode = true;
                const finish = (shortcut) => {
                    this._captureMode = false;
                    window.removeEventListener("keydown", onKey, true);
                    try { if (typeof onDone === "function") onDone(shortcut); } catch (err) { /* ignore */ }
                };
                const onKey = (e) => {
                    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); return; }
                    if (/^(Control|Shift|Alt|Meta|OS)/.test(e.code)) return;   // 等待实义键
                    e.preventDefault(); e.stopPropagation();
                    let displayName;
                    if (e.code === "Space") displayName = "Space";
                    else if (e.code.startsWith("Arrow")) displayName = e.code.slice(5);
                    else if (e.key && e.key.length === 1 && e.key.trim()) displayName = e.key.toUpperCase();
                    else displayName = e.key || e.code;
                    const shortcut = {
                        code: e.code, display: displayName,
                        ctrl: !!e.ctrlKey, shift: !!e.shiftKey, alt: !!e.altKey, meta: !!e.metaKey
                    };
                    STATE.nextItemShortcut = shortcut;
                    saveToggles();
                    showToast(t("toast_shortcut_set", _shortcutManager.format(shortcut)), "success");
                    try { refreshBannerShortcutHint(); } catch (err) { /* ignore */ }   // 同步屏上横幅的快捷键提示
                    finish(shortcut);
                };
                // window 捕获阶段,与触发监听同层;_captureMode 抑制触发,确保录制独占
                window.addEventListener("keydown", onKey, true);
            }
        };
    
        function refreshBannerShortcutHint() {
            document.querySelectorAll(".mwi-mm-purchase-nav .mwi-mm-nav-shortcut-hint").forEach(hint => {
                const s = STATE.nextItemShortcut;
                if (s) {
                    hint.classList.remove("is-unset");
                    hint.textContent = "⌨ " + _shortcutManager.format(s);
                    hint.title = t("shortcut_hint_set_title");
                } else {
                    hint.classList.add("is-unset");
                    hint.textContent = "⌨ " + t("shortcut_hint_unset");
                    hint.title = t("shortcut_hint_unset_title");
                }
            });
        }
    
        /** 渲染横幅快捷键提示的 HTML 片段 */
        function _buildShortcutHintHtml() {
            const s = STATE.nextItemShortcut;
            if (s) {
                return `<span class="mwi-mm-nav-shortcut-hint" data-act="open-shortcut-settings" title="${escapeHtml(t("shortcut_hint_set_title"))}">⌨ ${escapeHtml(_shortcutManager.format(s))}</span>`;
            } else {
                return `<span class="mwi-mm-nav-shortcut-hint is-unset" data-act="open-shortcut-settings" title="${escapeHtml(t("shortcut_hint_unset_title"))}">⌨ ${escapeHtml(t("shortcut_hint_unset"))}</span>`;
            }
        }
    
        /** 横幅上点击「快捷键提示」时：打开抽屉 + 展开设置 + 滚到对应行 */
        function _openShortcutSettings() {
            try {
                _newShell.openUI("set");   // 打开新壳设置 Tab(快捷键录制行在其中)
            } catch (e) { /* ignore */ }
        }
    
        // ── 市场预填数量模块 ──────────────────────────────────
        const _marketPrefill = {
            _observer: null,
            _prefillDone: new WeakSet(),
            _scanTimer: null,
    
            /** 初始化预填模块 */
            init() {
                this._setupObserver();
                console.log("[mwi-mm] v" + SCRIPT.version + " 市场预填模块已初始化");
            },
    
            /** 监听 DOM 变化检测市场购买弹窗的出现 */
            _setupObserver() {
                if (this._observer) this._observer.disconnect();
                this._observer = new MutationObserver((mutations) => {
                    if (!STATE.autoPrefillEnabled) return;
                    let hasAddedElement = false;
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (!(node instanceof Element)) continue;
                            hasAddedElement = true;
                            break;
                        }
                        if (hasAddedElement) break;
                    }
                    // React 可能分多次挂载 modal、图标与 input。只检查 addedNode 的
                    // 子树会在 modal 外壳先出现时漏掉，因此等本轮渲染稳定后扫描页面。
                    if (hasAddedElement) this._scheduleScan();
                });
                this._observer.observe(document.body, { childList: true, subtree: true });
                this._scheduleScan();
            },
    
            /** 合并高频 mutation，在 React 完成本轮渲染后扫描现存购买弹窗 */
            _scheduleScan(delay = 80) {
                if (this._scanTimer) clearTimeout(this._scanTimer);
                this._scanTimer = setTimeout(() => {
                    this._scanTimer = null;
                    if (!STATE.autoPrefillEnabled) return;
                    document.querySelectorAll(MARKET_SEL.modalContent).forEach((modal) => {
                        if (!this._prefillDone.has(modal)) this._tryPrefill(modal);
                    });
                }, delay);
            },
    
            /** 尝试对购买弹窗执行预填（仅购买类型 + 购物车中有此物品时） */
            _tryPrefill(modal) {
                if (this._prefillDone.has(modal)) return;
                const headerEl = modal.querySelector(MARKET_SEL.header);
                const headerText = (headerEl?.textContent || "").trim();
                const isBuyModal = /立即购买|购买挂牌|购买订单|buy|purchase/i.test(headerText);
                if (!isBuyModal) return;
    
                const useEl = modal.querySelector(MARKET_SEL.itemIcon);
                const href = useEl?.getAttribute("href") || useEl?.getAttribute("xlink:href") || "";
                if (!href.includes("#")) return;
                const bareId = href.split("#").pop();
                if (!bareId) return;
    
                const cartItemId = normalizeCartItemId(bareId);
                const cartRow = STATE.cart.get(cartItemId);
                if (!cartRow || cartRow.quantity <= 0) return;
    
                const neededQty = Math.ceil(cartRow.quantity);
                const qtyInput = modal.querySelector(MARKET_SEL.quantityInput);
                if (!qtyInput) {
                    this._scheduleScan(120);
                    return;
                }
    
                const targetValue = String(neededQty);
                this._setReactInputValue(qtyInput, targetValue);
                this._prefillDone.add(modal);
                this._showPrefillHint(modal, cartRow.name || bareId, neededQty);
                console.log(`[mwi-mm] 已预填数量: ${cartRow.name} × ${neededQty}`);
    
                // React 受控输入偶尔会在同一轮渲染末尾把 DOM 值恢复成 1。
                // 短暂复核一次；不做持续锁定，避免妨碍玩家之后手动修改数量。
                setTimeout(() => {
                    if (!modal.isConnected || String(qtyInput.value) === targetValue) return;
                    this._setReactInputValue(qtyInput, targetValue);
                }, 120);
            },
    
            /** 通过原生 setter 设置 React 携带的 input 值（触发 input/change 事件） */
            _setReactInputValue(input, value) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                if (nativeInputValueSetter) nativeInputValueSetter.call(input, value);
                else input.value = value;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            },
    
            /** 在购买弹窗插入「已预填」提示 */
            _showPrefillHint(modal, itemName, qty) {
                const qtyContainer = modal.querySelector(MARKET_SEL.quantityContainer);
                if (!qtyContainer) return;
                if (qtyContainer.parentElement.querySelector(".mwi-mm-prefill-hint")) return;
                const hint = document.createElement("div");
                hint.className = "mwi-mm-prefill-hint";
                hint.innerHTML = `<span class="mwi-mm-prefill-tag">${t("prefill_tag")}</span> ${escapeHtml(itemName)} × <b>${formatQty(qty)}</b>`;
                const parentContainer = qtyContainer.closest('[class*="MarketplacePanel_inputContainer"]');
                if (parentContainer) parentContainer.insertBefore(hint, qtyContainer);
                else qtyContainer.parentElement.insertBefore(hint, qtyContainer);
            }
        };
    
        // ── 采购导航条模块 ────────────────────────────────────
        const _purchaseNav = {
            _injectedNav: null,
            _lastMarketPanel: null,
            _observer: null,
            _pollTimer: null,
            _debounceTimer: null,
            _inited: false,               // ★ 防止重复初始化
            _visHandler: null,            // ★ 页面隐藏时暂停轮询的句柄
            _sessionDone: new Map(),      // ★ 本次市场会话内已购齐的物品(itemId → {itemId,name,iconRef})
            _gameCls: null,               // ★ 运行时采集的游戏类名(带 webpack hash，每次构建都变)
    
            /** 记录已购齐物品：购齐后该行会被移出购物车，这里留一份快照，
             *  让它继续以「✓ 已购齐」的样子留在导航条原位(不重排、不误点)。 */
            noteFulfilled(rows) {
                for (const r of rows || []) {
                    if (!r || !r.itemId || isCoinItem(r.itemId)) continue;
                    this._sessionDone.set(normalizeCartItemId(r.itemId), r);
                }
            },
    
            /** 运行时取 misc 精灵图路径（文件名带 hash，不能硬编码）。
             *  ★ v2.3 修正：不再采集 Button_button/Button_buy 类名。
             *    原因：注入时若订单簿尚未渲染，Button_buy__xxx 在文档中还不存在 → 采集到空串 →
             *    按钮只剩 Button_button 的默认蓝(#4357af)，等买过一次触发重建后才变绿，颜色会跳。
             *    对渲染有强时序依赖的东西不能靠"当时文档里有没有"来决定，故按钮外观改为完全自持。 */
            _harvest() {
                const u = document.querySelector('svg use[href*="misc_sprite"]');
                this._gameCls = { misc: u ? (u.getAttribute("href") || "").split("#")[0] : "" };
                return this._gameCls;
            },
    
            /** 初始化采购导航模块 */
            init() {
                if (this._inited) return; // ★ 避免重复 setInterval 导致 timer 泄漏
                this._inited = true;
                this._setupObserver();
                this._startPolling();
                // ★ 页面不可见时暂停 2s 轮询，可见时恢复（省 CPU，不影响体验）
                this._visHandler = () => {
                    if (document.hidden) this._stopPolling();
                    else this._startPolling();
                };
                document.addEventListener("visibilitychange", this._visHandler);
                _marketDataCache.onChange(() => this._scheduleUpdate(80));
                _wsInventory.onChange(() => this._scheduleUpdate(200));
                console.log("[mwi-mm] v" + SCRIPT.version + " 采购导航条模块已初始化（含内联购齐横幅）");
            },
    
            /** ★ 启动轮询（已在运行则忽略） */
            _startPolling() {
                if (this._pollTimer) return;
                this._pollTimer = setInterval(() => this._poll(), 2000);
            },
    
            /** ★ 暂停轮询（可由 visibilitychange 触发） */
            _stopPolling() {
                if (this._pollTimer) {
                    clearInterval(this._pollTimer);
                    this._pollTimer = null;
                }
            },
    
            /** 监听 DOM 变化检测市场面板显示/隐藏 */
            _setupObserver() {
                if (this._observer) this._observer.disconnect();
                this._observer = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (!(node instanceof Element)) continue;
                            if (this._isMarketModalNode(node)) {
                                this._scheduleUpdate(30);
                                return;
                            }
                        }
                        for (const node of m.removedNodes) {
                            if (!(node instanceof Element)) continue;
                            if (this._isMarketModalNode(node)) {
                                this._cleanup();
                                return;
                            }
                        }
                        if (m.type === "attributes" && m.target instanceof Element) {
                            if (this._isMarketModalNode(m.target)) {
                                this._scheduleUpdate(30);
                                return;
                            }
                        }
                    }
                });
                this._observer.observe(document.body, { childList: true, subtree: false });
                const tryObserveMainPanel = () => {
                    const mainPanel = document.querySelector('[class*="MainPanel_mainPanel"]');
                    if (mainPanel) {
                        this._observer.observe(mainPanel, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
                        return true;
                    }
                    return false;
                };
                if (!tryObserveMainPanel()) {
                    let retries = 0;
                    const retryTimer = setInterval(() => {
                        retries++;
                        if (tryObserveMainPanel() || retries > 20) clearInterval(retryTimer);
                    }, 500);
                }
            },
    
            /** 判断节点是否为市场弹窗 */
            _isMarketModalNode(node) {
                if (!(node instanceof Element)) return false;
                const cls = node.className || "";
                if (typeof cls === "string") {
                    return cls.includes("marketplaceModal") || cls.includes("MarketplacePanel_marketplacePanel");
                }
                return false;
            },
    
            /** 延迟更新（去抖） */
            _scheduleUpdate(delay) {
                if (this._debounceTimer) clearTimeout(this._debounceTimer);
                this._debounceTimer = setTimeout(() => {
                    this._debounceTimer = null;
                    this._poll();
                }, delay);
            },
    
            /** 查找市场弹窗的父容器
             *  ★ 修复(游戏更新后导航条不可见)：旧实现用全文档 querySelector。
             *    新版 DOM 中市场弹窗祖先链为
             *      MainPanel_marketplaceModalContainer (position:fixed, 全屏 0,0 → 视口宽高)
             *        └ MainPanel_marketplaceModal      (弹窗本体)
             *            └ MainPanel_marketplaceModalContent
             *    子串选择器 [class*="MainPanel_marketplaceModal"] 三层全中，
             *    querySelector 取文档序第一个 → 拿到整屏 Container，
             *    _syncPosition 于是把 nav 定到 top = rect.bottom = 视口底边 → 屏幕外不可见
             *    （DOM 存在、无报错，故此前静默失败）。
             *    改为从「当前可见的市场面板」向上 closest：结构上保证是本面板的祖先。
             *    选择器用 "MainPanel_marketplaceModal__"(带双下划线)精确命中弹窗本体：
             *      本体      MainPanel_marketplaceModal__uObZ3        ← 命中
             *      内容层    MainPanel_marketplaceModalContent__xxx   ← 不含 "Modal__"，不命中
             *      整屏容器  MainPanel_marketplaceModalContainer__xxx ← 同上，不命中
             *    (取内容层会导致导航条比弹窗窄 2px、左移 1px) */
            _findModalContainer() {
                const panel = findVisibleMarketplacePanel();
                if (!panel) return null;
                const el = panel.closest('[class*="MainPanel_marketplaceModal__"]');
                if (el && isVisible(el)) return el;
                return null;
            },
    
            /** 轮询检测市场面板状态并注入/更新导航条 */
            _poll() {
                if (!STATE.purchaseNavEnabled) {
                    this._cleanup();
                    return;
                }
                const hasActiveItems = [...STATE.cart.values()].some(r => r.quantity > 0 && !isCoinItem(r.itemId));
                if (!hasActiveItems) {
                    this._cleanup();
                    return;
                }
    
                const marketPanel = findVisibleMarketplacePanel();
                if (!marketPanel) {
                    this._cleanup();
                    return;
                }
    
                if (this._injectedNav && document.body.contains(this._injectedNav) && this._lastMarketPanel === marketPanel) {
                    // ★ v2.3：面板没变 ≠ 内容没变。购物车数量改动、新增物品、切换当前浏览物品
                    //   都需要重画胶囊；旧版只在面板对象变化时重建，导致导航条内容滞留。
                    if (this._navSignature() !== this._lastSig) this._injectNav();
                    else this._syncPosition();
                    return;
                }
    
                this._lastMarketPanel = marketPanel;
                this._injectNav();
            },
    
            /** 清理导航条 DOM（市场关闭 / 无待购项时） */
            _cleanup() {
                if (this._injectedNav) {
                    this._injectedNav.remove();
                    this._injectedNav = null;
                }
                this._lastMarketPanel = null;
                this._sessionDone.clear();   // ★ 市场关了 → 已购齐记录归零，下次打开重新开始
                this._animatedDone.clear();
                this._lastSig = "";
            },
    
            /** 同步导航条位置（跟随市场面板）
             *  ★ 几何约束：游戏弹窗是 width:75rem/height:45rem + max-width/height:96% + 居中，
             *    因此弹窗底边到视口底边最多只有视口高的 2%。窗口偏矮或移动端时，
             *    弹窗下方根本放不下导航条(≈44px) → 若仍按 top=rect.bottom 定位，
             *    导航条会被推出视口(本次 bug 的同一种失败形态，且同样无声)。
             *    故此处显式钳制：放不下就翻到弹窗内侧底部，并留下日志。 */
            _navFlipLogged: false,
            _syncPosition() {
                if (!this._injectedNav) return;
                const container = this._findModalContainer();
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const nav = this._injectedNav;
                const h = nav.offsetHeight || 44;
                nav.style.left = rect.left + "px";
                nav.style.width = rect.width + "px";
                const below = window.innerHeight - rect.bottom;
                if (below >= h) {
                    nav.style.top = rect.bottom + "px";
                    nav.dataset.mmNavMode = "outside";
                    nav.classList.remove("is-inside");
                } else {
                    nav.style.top = Math.max(0, rect.bottom - h) + "px";
                    nav.dataset.mmNavMode = "inside";
                    nav.classList.add("is-inside");
                    if (!this._navFlipLogged) {
                        this._navFlipLogged = true;
                        console.info("[mwi-mm] 弹窗下方空间不足(" + Math.round(below) + "px < " + h + "px)，采购导航条翻至弹窗内侧底部");
                    }
                }
            },
    
            /** 导航条内容签名：行(id+数量+状态) + 当前浏览物品。变了才重画。 */
            _lastSig: "",
            _navSignature() {
                const cur = this._lastMarketPanel ? this._detectCurrentItem(this._lastMarketPanel) : "";
                const rows = this._getNavRows().map(r => normalizeCartItemId(r.itemId) + ":" + r.quantity + ":" + (r.done ? 1 : 0));
                return rows.join("|") + "#" + normalizeCartItemId(cur || "");
            },
    
            /** 组装导航条要显示的行：待购项 + 本会话已购齐项(留在原位) */
            _getNavRows() {
                const pending = this._getCartItemsForNav();          // 仅 quantity > 0，语义不变
                const pendingIds = new Set(pending.map(x => normalizeCartItemId(x.itemId)));
                const done = [];
                for (const [id, r] of this._sessionDone) {
                    if (pendingIds.has(id)) continue;                // 又被重新加回购物车 → 不算已购齐
                    done.push({ itemId: r.itemId, name: r.name, iconRef: r.iconRef, quantity: 0, done: true });
                }
                return [...pending.map(x => ({ ...x, done: false })), ...done];
            },
    
            /** 创建并注入采购导航条 DOM */
            _injectNav() {
                if (!STATE.purchaseNavEnabled) return;
    
                document.querySelectorAll(".mwi-mm-purchase-nav").forEach(el => el.remove());
    
                const cartItems = this._getCartItemsForNav();
                if (cartItems.length === 0) return;                  // 没有待购项 → 不注入(语义不变)
    
                const container = this._findModalContainer();
                if (!container) return;
    
                const rows = this._getNavRows();
                const G = this._harvest();
                const currentItemId = this._lastMarketPanel ? this._detectCurrentItem(this._lastMarketPanel) : "";
                const nav = document.createElement("div");
                nav.className = "mwi-mm-purchase-nav";
    
                // 下一个待购目标：优先取非当前项，否则取第一项
                const nextItem = cartItems.find(x => !currentItemId || normalizeCartItemId(x.itemId) !== normalizeCartItemId(currentItemId)) || cartItems[0];
    
                let html = `<div class="mwi-mm-nav-lead">${escapeHtml(t("nav_progress", cartItems.length, rows.length))}</div>`;
                html += `<div class="mwi-mm-nav-items">`;
                for (const item of rows) {
                    const isCurrent = !item.done && currentItemId && normalizeCartItemId(item.itemId) === normalizeCartItemId(currentItemId);
                    const safeHref = escapeHtml(resolveItemIconHref(item));
                    const nid = normalizeCartItemId(item.itemId);
                    let justDone = false;
                    if (item.done && !this._animatedDone.has(nid)) { justDone = true; this._animatedDone.add(nid); }
                    const cls = ["mwi-mm-nav-item", isCurrent ? "is-current" : "", item.done ? "is-done" : "", justDone ? "is-just-done" : ""].filter(Boolean).join(" ");
                    const qtyText = item.done ? t("nav_done_chip") : t("nav_short", formatQty(item.quantity));
                    html += `<div class="${cls}" data-nav-item-id="${escapeHtml(item.itemId)}" title="${escapeHtml(item.name)} · ${escapeHtml(qtyText)}">`;
                    html += `<div class="mwi-mm-nav-item-icon">${safeHref ? `<svg viewBox="0 0 32 32"><use href="${safeHref}" xlink:href="${safeHref}"></use></svg>` : `<span class="mwi-mm-nav-item-ph">?</span>`}</div>`;
                    html += `<div class="mwi-mm-nav-item-info"><div class="mwi-mm-nav-item-name">${escapeHtml(item.name)}</div>`;
                    html += `<div class="mwi-mm-nav-item-qty">${escapeHtml(qtyText)}</div>`;
                    html += `</div></div>`;
                }
                html += `</div>`;
    
                // 尾部：快捷键提示 + 「采购下一个」(套游戏原生按钮类，绿色)
                html += `<div class="mwi-mm-nav-tail">`;
                html += _buildShortcutHintHtml();   // ★ 复用横幅上那套(含未设置态/点击进设置)
                if (nextItem) {
                    const label = escapeHtml(t("nav_next_btn").replace(" ▶", ""));
                    const arrow = G.misc
                        ? `<svg viewBox="0 0 32 32"><use href="${escapeHtml(G.misc)}#up_arrow"></use></svg>`
                        : `<span class="mwi-mm-nav-next-arrow">▶</span>`;
                    html += `<button class="mwi-mm-nav-next-btn" data-next-item-id="${escapeHtml(nextItem.itemId)}">${label}${arrow}</button>`;
                }
                html += `</div>`;
                nav.innerHTML = html;
    
                nav.addEventListener("click", (e) => {
                    const nextEl = e.target.closest("[data-next-item-id]");
                    if (nextEl) {
                        const nid = nextEl.getAttribute("data-next-item-id");
                        if (nid) openMarketplaceForItem(nid);
                        return;
                    }
                    const hintEl = e.target.closest(".mwi-mm-nav-shortcut-hint");
                    if (hintEl) { e.preventDefault(); _openShortcutSettings(); return; }
                    const itemEl = e.target.closest("[data-nav-item-id]");
                    if (!itemEl || itemEl.classList.contains("is-done")) return;   // 已购齐项不可点
                    const itemId = itemEl.getAttribute("data-nav-item-id");
                    if (!itemId) return;
                    openMarketplaceForItem(itemId);
                    nav.querySelectorAll(".mwi-mm-nav-item").forEach(el => el.classList.remove("is-current"));
                    itemEl.classList.add("is-current");
                });
    
                document.body.appendChild(nav);
                this._injectedNav = nav;
                this._lastSig = this._navSignature();
                this._syncPosition();
            },
    
            /** 获取购物车中有缺料的物品列表（用于导航条显示） */
            _getCartItemsForNav() {
                const items = [];
                for (const [id, row] of STATE.cart) {
                    if (!row || !row.itemId || isCoinItem(id)) continue;
                    if (row.quantity <= 0) continue;
                    items.push({ itemId: row.itemId, name: resolveCartDisplayName(row), iconRef: row.iconRef || "", quantity: row.quantity });
                }
                items.sort((a, b) => a.name.localeCompare(b.name, _getLocale()));
                return items;
            },
    
            /** 检测当前市场页面显示的物品 ID */
            _detectCurrentItem(container) {
                const useEls = container.querySelectorAll('svg use[href*="items_sprite"]');
                for (const use of useEls) {
                    const href = use.getAttribute("href") || "";
                    if (href.includes("#") && !href.includes("coin")) return href.split("#").pop();
                }
                return "";
            },
    
            // ── 购齐事件（v2.3：取消内联横幅，改为胶囊原地划线淡出） ──────────
            _animatedDone: new Set(),     // 已播放过划线动画的 itemId，避免每次重建都重播
    
            /** 物品购齐时：装填/卸下快捷键 + 重建导航条（该胶囊原地变「已购齐」并播放动画） */
            _onItemFulfilled(nextItem) {
                if (!STATE.purchaseNavEnabled) return;
                // ★ 快捷键装填放在最前：即便后续渲染出问题，按键也已就位
                if (nextItem && nextItem.itemId) _shortcutManager.arm(nextItem.itemId);
                else _shortcutManager.disarm();
                this._injectNav();
            }
        };
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §13 样式注入
        //     43KB 单行 CSS —— 新 UI 落地时由分组件 CSS + Shadow DOM 取代
        // ════════════════════════════════════════════════════════════════════════
    
        // ── CSS ───────────────────────────────────────────────────────
    
        /** 注入插件所有 CSS 样式 */
        function injectStyles() {
            const style = document.createElement("style");
            style.textContent = `:root{--mm-surface-1:#08080e;--mm-surface-2:#0d0d14;--mm-surface-3:#12121a;--mm-surface-deep:#000005;--mm-surface-mask:#0d0d14;--mm-surface-icon:#1a1a22;--mm-surface-btn:#14141c;--mm-border-1:#1c1c26;--mm-border-2:#1e1e28;--mm-border-3:#1f1f29;--mm-border-4:#26262f;--mm-border-5:#272733;--mm-border-input:#1f1f2c;--mm-border-hover:#3a3a4a;--mm-border-star:#26262f;--mm-text-primary:#fff;--mm-text-body:rgba(255,255,255,.88);--mm-text-hover:#fff;--mm-text-muted:rgba(255,255,255,.72);--mm-text-muted-2:rgba(255,255,255,.72);--mm-text-muted-3:rgba(255,255,255,.65);--mm-text-weak:rgba(255,255,255,.55);--mm-text-weak-2:rgba(255,255,255,.48);--mm-text-dim:rgba(255,255,255,.36);--mm-text-dim-2:rgba(255,255,255,.32);--mm-text-faint:rgba(255,255,255,.24);--mm-text-faint-2:rgba(255,255,255,.26);--mm-accent-gold:#f0b429;--mm-accent-gold-bright:#fcd34d;--mm-accent-gold-warm:#f0b429;--mm-accent-star:#f0b429;--mm-accent-market:#f0b429;--mm-green:#34d399;--mm-green-soft:#86efac;--mm-green-btn:#a5d6a7;--mm-green-pick:#95d5b2;--mm-green-check:#22c55e;--mm-red-soft:#fca5a5;--mm-red-text:#fb7185;--mm-red-clear:#f3a3ad;--mm-red-btn:#e59b9b;--mm-blue:#93c5fd;--mm-blue-soft:#b9ccff;--mm-blue-soft-2:#b9d4ff;--mm-blue-bright:#60a5fa;--mm-blue-hover:#7cacf8;--mm-blue-deep:#3b82f6;--mm-blue-focus:#f0b429;--mm-blue-focus-2:#f0b429;--mm-blue-link:#60a5fa;--mm-blue-text:#fff;--mm-toast-err-text:#fecaca;--mm-toast-ok-text:#d1fae5;--mm-toast-text:rgba(255,255,255,.9);--mm-market-btn-bg:#0d2418;--mm-market-btn-hover:#143220;--mm-market-btn-border:#1e5a32;--mm-market-btn-border-hover:#277841;--mm-remove-btn-bg:#2a1317;--mm-remove-btn-hover:#3b1b1e;--mm-remove-btn-border:#6e2a30;--mm-remove-btn-border-hover:#933840;--mm-pick-btn-border:#2d6a4f;--mm-clear-btn-border:#8f3a44;--mm-w-02:rgba(255,255,255,.02);--mm-w-04:rgba(255,255,255,.04);--mm-w-06:rgba(255,255,255,.06);--mm-w-08:rgba(255,255,255,.08);--mm-w-10:rgba(255,255,255,.1);--mm-w-12:rgba(255,255,255,.12);--mm-w-15:rgba(255,255,255,.15);--mm-w-18:rgba(255,255,255,.18);--mm-w-22:rgba(255,255,255,.22);--mm-k-20:rgba(0,0,0,.2);--mm-k-30:rgba(0,0,0,.3);--mm-k-35:rgba(0,0,0,.35);--mm-k-45:rgba(0,0,0,.45);--mm-k-56:rgba(0,0,0,.56);--mm-k-60:rgba(0,0,0,.6);}[data-mm-badge]::after{content:attr(data-mm-badge);margin-left:6px;font-size:12px;font-weight:600;padding:1px 6px;border-radius:3px;display:inline-block;line-height:1.5;vertical-align:middle;white-space:nowrap}[data-mm-badge-type="missing"]::after{color:#e88e98;background:rgba(180,50,70,.18)}[data-mm-badge-type="ok"]::after{color:rgba(110,200,150,.8);background:rgba(40,120,80,.15)}[data-mm-badge-type="surplus"]::after{color:rgba(147,197,253,.75);background:rgba(59,130,246,.12)}.mwi-mm-upgrade-badge{margin-left:8px;font-size:12px;font-weight:600;padding:1px 6px;border-radius:3px;display:inline-block;line-height:1.5}.mwi-mm-upgrade-badge.is-missing{color:#e88e98;background:rgba(180,50,70,.18)}.mwi-mm-upgrade-badge.is-ok{color:rgba(110,200,150,.8);background:rgba(40,120,80,.15)}.mwi-mm-upgrade-inline{margin-top:4px;display:inline-block;font-size:12px;font-weight:600;padding:1px 6px;border-radius:3px;line-height:1.5;white-space:nowrap}.mwi-mm-upgrade-inline.is-missing{color:#e88e98;background:rgba(180,50,70,.18);border:none}.mwi-mm-upgrade-inline.is-ok{color:rgba(110,200,150,.8);background:rgba(40,120,80,.15);border:none}.mwi-mm-upgrade-inline.is-surplus{color:rgba(147,197,253,.75);background:rgba(59,130,246,.12);border:none}.mwi-mm-summary-panel{margin:6px 0 2px;padding:10px 2px 0;border-radius:0;background:transparent!important;border:none!important;border-top:1px solid rgba(255,255,255,.06)!important;color:inherit!important;font-size:13px;box-shadow:none}.mwi-mm-summary-head{display:flex;justify-content:center;align-items:center;margin-bottom:6px}.mwi-mm-summary-head .stat{color:rgba(255,255,255,.55)!important;font-size:12px;font-weight:500}.mwi-mm-manual-count-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 4px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px}.mwi-mm-manual-label{color:rgba(255,255,255,.7)!important;font-size:12px;font-weight:500;white-space:nowrap;flex-shrink:0}.mwi-mm-manual-input{width:90px;padding:3px 6px;border:1px solid rgba(255,255,255,.15);border-radius:4px;background:rgba(0,0,0,.3);color:#f8c86b;font-size:13px;font-weight:600;outline:none;transition:border-color .2s;-moz-appearance:textfield}.mwi-mm-manual-input::-webkit-inner-spin-button,.mwi-mm-manual-input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.mwi-mm-manual-input:focus{border-color:rgba(99,140,255,.6)}.mwi-mm-summary-buttons{margin-top:4px;display:flex;gap:8px}.mwi-mm-summary-buttons button{flex:1;cursor:pointer}.mwi-mm-chain-btn{position:absolute;right:-2px;top:-2px;width:16px;height:16px;border:1px solid rgba(99,140,255,.4);background:rgba(99,140,255,.12);color:#93c5fd;border-radius:3px;font-size:8px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:5;transition:all .15s}.mwi-mm-chain-btn:hover{background:rgba(99,140,255,.25);border-color:rgba(99,140,255,.6);color:#fff}.mwi-mm-chain-tree{margin:6px 0;padding:4px 0;border-top:1px dashed rgba(255,255,255,.06);border-bottom:1px dashed rgba(255,255,255,.06);font-size:12.5px;max-height:280px;overflow-y:auto;text-align:left}.mwi-mm-chain-title{font-size:12.5px;font-weight:600;color:#93c5fd;padding:2px 4px 4px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#1b1d24;z-index:1}.mwi-mm-chain-toggle{border:1px solid rgba(99,140,255,.3);background:rgba(99,140,255,.1);color:#93c5fd;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;transition:all .15s;line-height:1.4}.mwi-mm-chain-toggle:hover{background:rgba(99,140,255,.22);border-color:rgba(99,140,255,.5)}.mwi-mm-chain-body{width:100%;border-collapse:collapse;font-size:12.5px}.mwi-mm-chain-step-head td{padding:5px 4px 2px;font-weight:600;color:#c8cfde;font-size:12.5px}.mwi-mm-chain-row td{padding:2px 4px}.mwi-mm-chain-row td.mwi-mm-chain-name{padding-left:18px;color:#e4e6ee}.mwi-mm-chain-row td.mwi-mm-chain-qty{color:#f8c86b;font-weight:600;text-align:right;white-space:nowrap;width:50px;font-variant-numeric:tabular-nums}.mwi-mm-chain-row td.mwi-mm-chain-stock{text-align:right;white-space:nowrap;width:52px;font-size:11px;font-variant-numeric:tabular-nums}.mwi-mm-chain-row.is-missing td.mwi-mm-chain-stock{color:#e88e98}.mwi-mm-chain-row.is-ok td.mwi-mm-chain-stock{color:rgba(110,200,150,.7)}.mwi-mm-chain-row.is-surplus td.mwi-mm-chain-stock{color:rgba(147,197,253,.7)}.mwi-mm-chain-upgrade{font-size:10px;color:#fbbf24;background:rgba(251,191,36,.12);padding:1px 4px;border-radius:2px;margin-left:4px}.mwi-mm-item-icon{width:28px;height:28px}.mwi-mm-icon-fallback{color:var(--mm-text-dim-2);font-weight:700;font-size:13px}.mwi-mm-market-target{outline:2px solid rgba(245,158,11,.9);outline-offset:1px;box-shadow:0 0 0 2px rgba(245,158,11,.28);border-radius:8px;animation:mwi-mm-pulse 1.4s ease-in-out infinite}@keyframes mwi-mm-pulse{0%{box-shadow:0 0 0 1px rgba(245,158,11,.15)}50%{box-shadow:0 0 0 3px rgba(245,158,11,.45)}100%{box-shadow:0 0 0 1px rgba(245,158,11,.15)}}.mwi-mm-toast{position:fixed;top:12px;right:12px;z-index:2147483300;padding:10px 14px;border-radius:8px;border:1px solid rgba(71,85,105,.8);color:var(--mm-toast-text);background:rgba(15,23,42,.95);font-size:14px;transition:all .25s;box-shadow:0 10px 20px var(--mm-k-35)}.mwi-mm-toast-success{border-color:rgba(16,185,129,.85);color:var(--mm-toast-ok-text)}.mwi-mm-toast-error{border-color:rgba(239,68,68,.85);color:var(--mm-toast-err-text)}
    .mwi-mm-prefill-hint{display:flex;align-items:center;gap:5px;padding:2px 0;margin-bottom:2px;font-size:12px;color:#8a9aaa;line-height:1.4}.mwi-mm-prefill-hint b{color:var(--mm-accent-gold);font-weight:600}.mwi-mm-prefill-tag{flex-shrink:0;padding:0px 5px;border-radius:3px;background:rgba(52,211,153,.15);color:var(--mm-green);font-size:10px;font-weight:600}
    .mwi-mm-purchase-nav{position:fixed;z-index:802;box-sizing:border-box;display:flex;align-items:center;gap:var(--spacing-md);padding:var(--spacing-sm) var(--spacing-md);flex-wrap:wrap;font-family:Roboto,Helvetica,Arial,sans-serif;color:var(--color-text-dark-mode);background:var(--color-midnight-900);border:1px solid var(--color-neutral-200);border-top:1px solid var(--color-midnight-400);border-radius:0 0 var(--radius-sm) var(--radius-sm);box-shadow:0 0 .25rem .25rem hsla(0,0%,81.6%,.2823529412)}.mwi-mm-purchase-nav.is-inside{border-radius:var(--radius-sm) var(--radius-sm) 0 0;border-bottom:none;box-shadow:0 -4px 12px var(--mm-k-45)}.mwi-mm-nav-lead{flex:0 0 auto;padding-right:var(--spacing-md);border-right:1px solid var(--color-midnight-400);font-size:var(--font-size-sm);color:var(--color-space-300);white-space:nowrap}.mwi-mm-nav-tail{flex:0 0 auto;display:flex;align-items:center;gap:var(--spacing-sm);margin-left:auto}
    .mwi-mm-nav-items{flex:1 1 auto;min-width:0;display:flex;gap:var(--spacing-xs);overflow-x:auto;padding:2px 0;scrollbar-width:thin;scrollbar-color:var(--color-space-300) transparent}.mwi-mm-nav-items::-webkit-scrollbar{height:4px}.mwi-mm-nav-items::-webkit-scrollbar-thumb{background:var(--color-space-300);border-radius:var(--radius-sm)}.mwi-mm-nav-item{flex-shrink:0;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 6px;border-radius:var(--radius-sm);border:1px solid var(--color-midnight-400);background:var(--color-midnight-700);cursor:pointer;transition:background .15s,border-color .15s}.mwi-mm-nav-item:hover{background:var(--color-midnight-500);border-color:var(--color-space-600)}.mwi-mm-nav-item.is-current{background:var(--color-space-800);border-color:var(--color-space-400)}.mwi-mm-nav-item.is-current .mwi-mm-nav-item-name{color:var(--color-neutral-0)}.mwi-mm-nav-item.is-done{background:var(--color-midnight-800);border-color:var(--color-jade-600);opacity:.7;cursor:default}.mwi-mm-nav-item.is-done:hover{background:var(--color-midnight-800);border-color:var(--color-jade-600)}.mwi-mm-nav-item.is-done .mwi-mm-nav-item-name{color:var(--color-jade-200);position:relative}.mwi-mm-nav-item.is-done .mwi-mm-nav-item-name::after{content:"";position:absolute;left:0;top:50%;width:100%;height:1px;background:currentColor}.mwi-mm-nav-item.is-just-done .mwi-mm-nav-item-name::after{animation:mwi-mm-nav-strike .45s ease-out}.mwi-mm-nav-item.is-just-done{animation:mwi-mm-nav-fade .7s ease-out}@keyframes mwi-mm-nav-strike{from{width:0}to{width:100%}}@keyframes mwi-mm-nav-fade{0%{opacity:1;border-color:var(--color-market-buy);background:var(--color-jade-600-opacity-60)}100%{opacity:.7}}.mwi-mm-nav-item.is-done .mwi-mm-nav-item-qty{color:var(--color-market-buy)}.mwi-mm-nav-item.is-done .mwi-mm-nav-item-icon svg{filter:grayscale(.6)}.mwi-mm-nav-item-icon{width:var(--icon-size-small);height:var(--icon-size-small);flex-shrink:0;display:flex;align-items:center;justify-content:center}.mwi-mm-nav-item-icon svg{width:var(--icon-size-small);height:var(--icon-size-small)}.mwi-mm-nav-item-ph{font-size:11px;color:var(--color-neutral-600)}.mwi-mm-nav-item-info{min-width:0;display:flex;flex-direction:column;line-height:1.25}.mwi-mm-nav-item-name{font-size:var(--font-size-sm);color:var(--color-neutral-100);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:88px}.mwi-mm-nav-item-qty{font-size:var(--font-size-xs);color:var(--color-orange-500);font-variant-numeric:tabular-nums}
    /* 「采购下一个」按钮：颜色/hover 全由游戏 Button_button+Button_buy 提供，此处只约束尺寸 */
    .mwi-mm-nav-next-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:6px;height:var(--button-height-normal);padding:0 var(--spacing-lg);border:none;border-radius:var(--radius-sm);background:var(--color-space-600);color:var(--color-neutral-0);cursor:pointer;user-select:none;white-space:nowrap;line-height:1;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);transition:background .15s}
    /* 横幅上的快捷键提示 */
    .mwi-mm-nav-next-btn:hover{background:var(--color-space-500)}.mwi-mm-nav-next-btn:active{background:var(--color-space-700)}.mwi-mm-nav-next-btn svg{width:var(--icon-size-tiny);height:var(--icon-size-tiny);flex-shrink:0;fill:currentColor}.mwi-mm-nav-next-arrow{font-size:10px;line-height:1}
    .mwi-mm-nav-shortcut-hint{display:inline-flex;align-items:center;font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3px;color:var(--mm-text-weak);background:var(--mm-w-04);border:1px solid var(--mm-w-08);border-radius:4px;padding:1px 6px;margin:0 6px;cursor:pointer;user-select:none;transition:all .15s;white-space:nowrap}
    .mwi-mm-nav-shortcut-hint:hover{color:var(--mm-text-hover);background:var(--mm-w-08);border-color:var(--mm-w-18)}
    .mwi-mm-nav-shortcut-hint.is-unset{color:var(--mm-text-faint-2);font-family:inherit;font-style:italic}
    .mwi-mm-nav-shortcut-hint.is-unset:hover{color:var(--mm-blue);border-color:rgba(96,165,250,.3)}`;
            document.head.appendChild(style);
        }
    
    
        // ════════════════════════════════════════════════════════════════════════
        // §14 启动
        //     waitForBody / init —— 所有启动副作用的唯一入口
        // ════════════════════════════════════════════════════════════════════════
    
        // ── 启动 ─────────────────────────────────────────────────────
    
        /** 等待 document.body 可用 */
        // ── 接线:旧 UI 以订阅方式接收数据变更通知 ─────────────────────
        //    内核区(§03/§05/§06/§07)共 33 处渲染直调已替换为 Store.notify(主题);
        //    下列订阅与原直调 1:1 对应;notify 为同步执行,时序与原行为一致。
        //    箭头包装 = 延迟取引用,不依赖各渲染函数的定义形式与位置。
        //    旧浮窗已物理删除,旧渲染订阅随之移除;新壳(§10A)在挂载时自行订阅。
    
        function waitForBody() {
            return new Promise((resolve) => {
                if (document.body) { resolve(); return; }
                const timer = setInterval(() => { if (document.body) { clearInterval(timer); resolve(); } }, 50);
            });
        }
    
        /** 插件主入口：初始化所有子系统并等待游戏就绪 */
        async function init() {
            await waitForBody();
    
            // setupWSInterceptor() 已提前到 IIFE 顶层执行，此处不再调用
    
            _wsInventory.onChange(() => {
                triggerInventorySync(15);
                scheduleRefresh(150);
                // 库存变化 → 刷新计划页进度条（仅在计划页可见时实际重绘，无副作用）
                Store.notify("plans");
            });
    
            injectStyles();
            _initSpriteBaseProbe(); // ★ 尽早启动 sprite 路径探测
    
            loadCart();
            loadPlans();
            loadToggles();
            setupObservers();
    
    
            await waitForGameReady();
            try { _themeProbe.init(); } catch (err) { console.warn("[mwi-mm] theme init:", err); }   // 内置暗色令牌
            try { _newShell.init(); } catch (err) { console.warn("[mwi-mm] shell init:", err); }     // /3: 新壳(双形态)
    
    
            // ★ 游戏 DOM 就绪后，把主 observer 从 document.body 收窄到 GamePage 容器，
            //   避免被聊天/通知等高频无关 mutation 打扰，降低主线程开销。
            try {
                // observer 直接监听 document.body(见 ensureMainObserverAttached 注释)。
                //   市场弹窗等 portal UI 渲染在 GamePage 之外,收窄会漏掉其开/关 → 徽章冻结,故全程监听 body。
                ensureMainObserverAttached();
                console.log("[mwi-mm] observer 已挂载至 document.body（覆盖 GamePage 外的市场/模态 portal）");
            } catch (e) { console.warn("[mwi-mm] observer 挂载失败：", e); }
    
            // 周边子系统逐个隔离启动:单个抛错不阻断后续(看门狗是注入 UI 的最终兜底,必须启动)。
            for (const [name, start] of [
                ["市场预填", () => _marketPrefill.init()],
                ["采购导航", () => _purchaseNav.init()],
                ["快捷键", () => _shortcutManager.init()],
                ["看门狗", () => startRemountWatchdog()],
            ]) {
                try { start(); _log.note("init", name + " ✓"); } catch (err) { console.error("[mwi-mm] 子系统「" + name + "」启动失败(其余继续):", err); }
            }
    
            const dataReady = await waitForClientData();
            if (dataReady) {
                _dataLayer.init();
            } else {
                console.warn("[mwi-mm] 游戏数据未就绪（localStorage/WS/Mooket 均不可用），使用 DOM 回退");
            }
    
            const wsLabel = _wsInventory.ready ? t("ws_exact") : t("ws_waiting");
            const dlLabel = _dataLayer.ready ? t("dl_ok") : t("dl_fallback");
            const srcLabel = _capturedClientData ? (_capturedClientData._src || t("cache")) : t("dl_fallback");
            const plansLabel = STATE.craftingPlans.size > 0 ? t("plans_n", STATE.craftingPlans.size) : t("no_plans");
            setAction(t("action_startup", SCRIPT.version, wsLabel, dlLabel, plansLabel, srcLabel));
            scheduleRefresh(80);
    
            // ★ 公共 API 就绪信号（晚到的 'ready' 监听器也会立即触发）
            try { _apiInternal.markReady(); } catch (e) { console.error("[mwi-mm] markReady failed:", e); }
            _log.note("init", "init 完成");
        }
    
        init().catch((err) => {
            console.error("[mwi-mm] init failed", err);
        });
    })();
  });

  // ---------------------------------------------------------------------------
  // Module: 收益面板
  // Original: MWI Profit Panel.user.js v2026.04.29
  // Author: MengLan
  // License: MIT
  // Source: https://greasyfork.org/scripts/536724
  // WebSocket compatibility patches: 1
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("profit-panel", "收益面板", "idle", () => {
    (function () {
        'use strict';
    
        // 全局状态管理器
        class GlobalState {
          constructor() {
            const hostname = window.location.hostname;
            this._state = {
              initClientData_itemDetailMap: {},
              initClientData_actionDetailMap: {},
              initClientData_openableLootDropMap: {},
              initCharacterData_characterSkills: [],
              initCharacterData_actionTypeDrinkSlotsMap: {},
              initCharacterData_characterHouseRoomMap: {},
              initCharacterData_characterItems: [],
              initCharacterData_communityActionTypeBuffsMap: {},
              initCharacterData_consumableActionTypeBuffsMap: {},
              initCharacterData_houseActionTypeBuffsMap: {},
              initCharacterData_equipmentActionTypeBuffsMap: {},
              initCharacterData_achievementActionTypeBuffsMap: {},
              initCharacterData_personalActionTypeBuffsMap: {},
              initCharacterData_mooPassActionTypeBuffsMap: {},
              initCharacterData_noncombatStats: {},
              hasMarketItemUpdate: false,
              isZHInGameSetting: false,
              freshnessMarketJson: {},
              medianMarketJson: {},
              processingMap: {},
              en2ZhMap: {},
              lootLog: [],
              profitSettings: {},
              domainname: hostname.substring(hostname.lastIndexOf('.', hostname.lastIndexOf('.') - 1) + 1)
            };
            this._listeners = new Set();
            return new Proxy(this, {
              get(target, prop) {
                if (prop in target._state) {
                  return target._state[prop];
                }
                return target[prop];
              },
              set(target, prop, value) {
                if (prop in target._state) {
                  target._state[prop] = value;
                  target._notifyListeners(prop, value);
                  return true;
                }
                target[prop] = value;
                return true;
              }
            });
          }
          _notifyListeners(prop, value) {
            this._listeners.forEach(cb => cb(prop, value));
          }
          subscribe(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
          }
        }
        var globals = new GlobalState();
    
        var zhTranslation = {...{global:{gameName:"\u94f6\u6cb3\u5976\u725b\u653e\u7f6e"},modalProvider:{ok:"\u786e\u5b9a",cancel:"\u53d6\u6d88",yes:"\u786e\u5b9a",no:"\u53d6\u6d88"},actionsUtil:{itemNotAvailable:"[\u7269\u54c1\u4e0d\u53ef\u7528]",doingNothing:"\u65e0\u6240\u4e8b\u4e8b...",partySuffix:" (\u961f\u4f0d)"},characterItemsUtil:{mainHand:"\u4e3b\u624b",offHand:"\u526f\u624b",back:"\u80cc\u90e8",head:"\u5934\u90e8",charm:"\u62a4\u7b26",body:"\u8eab\u4f53",legs:"\u817f\u90e8",hands:"\u624b\u90e8",feet:"\u811a\u90e8",pouch:"\u888b\u5b50",neck:"\u9879\u94fe",earrings:"\u8033\u73af",ring:"\u6212\u6307",trinket:"\u9970\u54c1",milkingTool:"\u6324\u5976\u5de5\u5177",foragingTool:"\u91c7\u6458\u5de5\u5177",woodcuttingTool:"\u4f10\u6728\u5de5\u5177",cheesesmithingTool:"\u5976\u916a\u953b\u9020\u5de5\u5177",craftingTool:"\u5236\u4f5c\u5de5\u5177",tailoringTool:"\u7f1d\u7eab\u5de5\u5177",cookingTool:"\u70f9\u996a\u5de5\u5177",brewingTool:"\u51b2\u6ce1\u5de5\u5177",alchemyTool:"\u70bc\u91d1\u5de5\u5177",enhancingTool:"\u5f3a\u5316\u5de5\u5177"},combatStats:{primaryTraining:"\u4e3b\u4fee\u8bad\u7ec3",focusTraining:"\u9009\u4fee\u8bad\u7ec3",combatStyleHrids:"\u6218\u6597\u98ce\u683c",damageType:"\u4f24\u5bb3\u7c7b\u578b",attackInterval:"\u653b\u51fb\u95f4\u9694",autoAttackDamage:"\u81ea\u52a8\u653b\u51fb\u4f24\u5bb3",abilityDamage:"\u6280\u80fd\u4f24\u5bb3",attackSpeed:"\u653b\u51fb\u901f\u5ea6",castSpeed:"\u65bd\u6cd5\u901f\u5ea6",abilityHaste:"\u6280\u80fd\u6025\u901f",criticalRate:"\u66b4\u51fb\u7387",criticalDamage:"\u66b4\u51fb\u4f24\u5bb3",stabAccuracy:"\u523a\u51fb\u7cbe\u51c6\u5ea6",slashAccuracy:"\u65a9\u51fb\u7cbe\u51c6\u5ea6",smashAccuracy:"\u949d\u51fb\u7cbe\u51c6\u5ea6",rangedAccuracy:"\u8fdc\u7a0b\u7cbe\u51c6\u5ea6",magicAccuracy:"\u9b54\u6cd5\u7cbe\u51c6\u5ea6",stabDamage:"\u523a\u51fb\u4f24\u5bb3",slashDamage:"\u65a9\u51fb\u4f24\u5bb3",smashDamage:"\u949d\u51fb\u4f24\u5bb3",rangedDamage:"\u8fdc\u7a0b\u4f24\u5bb3",magicDamage:"\u9b54\u6cd5\u4f24\u5bb3",defensiveDamage:"\u9632\u5fa1\u4f24\u5bb3",taskDamage:"\u4efb\u52a1\u4f24\u5bb3",physicalAmplify:"\u7269\u7406\u589e\u5e45",waterAmplify:"\u6c34\u7cfb\u589e\u5e45",natureAmplify:"\u81ea\u7136\u7cfb\u589e\u5e45",fireAmplify:"\u706b\u7cfb\u589e\u5e45",healingAmplify:"\u6cbb\u7597\u589e\u5e45",armorPenetration:"\u62a4\u7532\u7a7f\u900f",waterPenetration:"\u6c34\u7cfb\u7a7f\u900f",naturePenetration:"\u81ea\u7136\u7cfb\u7a7f\u900f",firePenetration:"\u706b\u7cfb\u7a7f\u900f",physicalThorns:"\u7269\u7406\u8346\u68d8",elementalThorns:"\u5143\u7d20\u8346\u68d8",retaliation:"\u53cd\u4f24",maxHitpoints:"\u6700\u5927HP",maxManapoints:"\u6700\u5927MP",stabEvasion:"\u523a\u51fb\u95ea\u907f",slashEvasion:"\u65a9\u51fb\u95ea\u907f",smashEvasion:"\u949d\u51fb\u95ea\u907f",rangedEvasion:"\u8fdc\u7a0b\u95ea\u907f",magicEvasion:"\u9b54\u6cd5\u95ea\u907f",armor:"\u62a4\u7532",waterResistance:"\u6c34\u7cfb\u6297\u6027",natureResistance:"\u81ea\u7136\u7cfb\u6297\u6027",fireResistance:"\u706b\u7cfb\u6297\u6027",damageTaken:"\u627f\u53d7\u4f24\u5bb3",lifeSteal:"\u751f\u547d\u5077\u53d6",manaLeech:"\u6cd5\u529b\u5438\u53d6",tenacity:"\u97e7\u6027",threat:"\u5a01\u80c1",hpRegenPer10:"\u751f\u547d\u6062\u590d",mpRegenPer10:"\u6cd5\u529b\u6062\u590d",foodHaste:"\u98df\u7269\u6025\u901f",drinkConcentration:"\u996e\u6599\u6d53\u5ea6",combatDropRate:"\u6218\u6597\u6389\u843d\u7387",combatDropQuantity:"\u6218\u6597\u6389\u843d\u6570\u91cf",combatRareFind:"\u6218\u6597\u7a00\u6709\u53d1\u73b0",combatExperience:"\u6218\u6597\u7ecf\u9a8c",staminaExperience:"\u8010\u529b\u7ecf\u9a8c",intelligenceExperience:"\u667a\u529b\u7ecf\u9a8c",attackExperience:"\u653b\u51fb\u7ecf\u9a8c",defenseExperience:"\u9632\u5fa1\u7ecf\u9a8c",meleeExperience:"\u8fd1\u6218\u7ecf\u9a8c",rangedExperience:"\u8fdc\u7a0b\u7ecf\u9a8c",magicExperience:"\u9b54\u6cd5\u7ecf\u9a8c",foodSlots:"\u98df\u7269\u69fd\u4f4d",drinkSlots:"\u996e\u6599\u69fd\u4f4d",weaken:"\u524a\u5f31",fury:"\u72c2\u6012",parry:"\u683c\u6321",mayhem:"\u66b4\u4e71",pierce:"\u7a7f\u523a",curse:"\u8bc5\u5492",ripple:"\u6d9f\u6f2a",bloom:"\u7efd\u653e",blaze:"\u70bd\u7130"},noncombatStats:{skillingSpeed:"\u4e13\u4e1a\u901f\u5ea6",milkingSpeed:"\u6324\u5976\u901f\u5ea6",foragingSpeed:"\u91c7\u6458\u901f\u5ea6",woodcuttingSpeed:"\u4f10\u6728\u901f\u5ea6",cheesesmithingSpeed:"\u5976\u916a\u953b\u9020\u901f\u5ea6",craftingSpeed:"\u5236\u4f5c\u901f\u5ea6",tailoringSpeed:"\u7f1d\u7eab\u901f\u5ea6",cookingSpeed:"\u70f9\u996a\u901f\u5ea6",brewingSpeed:"\u51b2\u6ce1\u901f\u5ea6",alchemySpeed:"\u70bc\u91d1\u901f\u5ea6",enhancingSpeed:"\u5f3a\u5316\u901f\u5ea6",taskSpeed:"\u4efb\u52a1\u901f\u5ea6",skillingEfficiency:"\u4e13\u4e1a\u6548\u7387",milkingEfficiency:"\u6324\u5976\u6548\u7387",foragingEfficiency:"\u91c7\u6458\u6548\u7387",woodcuttingEfficiency:"\u4f10\u6728\u6548\u7387",cheesesmithingEfficiency:"\u5976\u916a\u953b\u9020\u6548\u7387",craftingEfficiency:"\u5236\u4f5c\u6548\u7387",tailoringEfficiency:"\u7f1d\u7eab\u6548\u7387",cookingEfficiency:"\u70f9\u996a\u6548\u7387",brewingEfficiency:"\u51b2\u6ce1\u6548\u7387",alchemyEfficiency:"\u70bc\u91d1\u6548\u7387",enhancingSuccess:"\u5f3a\u5316\u6210\u529f\u7387",gatheringQuantity:"\u91c7\u96c6\u6570\u91cf",drinkConcentration:"\u996e\u6599\u6d53\u5ea6",skillingEssenceFind:"\u4e13\u4e1a\u7cbe\u534e\u53d1\u73b0",skillingRareFind:"\u4e13\u4e1a\u7a00\u6709\u53d1\u73b0",milkingRareFind:"\u6324\u5976\u7a00\u6709\u53d1\u73b0",foragingRareFind:"\u91c7\u6458\u7a00\u6709\u53d1\u73b0",woodcuttingRareFind:"\u4f10\u6728\u7a00\u6709\u53d1\u73b0",cheesesmithingRareFind:"\u5976\u916a\u953b\u9020\u7a00\u6709\u53d1\u73b0",craftingRareFind:"\u5236\u4f5c\u7a00\u6709\u53d1\u73b0",tailoringRareFind:"\u7f1d\u7eab\u7a00\u6709\u53d1\u73b0",cookingRareFind:"\u70f9\u996a\u7a00\u6709\u53d1\u73b0",brewingRareFind:"\u51b2\u6ce1\u7a00\u6709\u53d1\u73b0",alchemyRareFind:"\u70bc\u91d1\u7a00\u6709\u53d1\u73b0",enhancingRareFind:"\u5f3a\u5316\u7a00\u6709\u53d1\u73b0",skillingExperience:"\u4e13\u4e1a\u7ecf\u9a8c",milkingExperience:"\u6324\u5976\u7ecf\u9a8c",foragingExperience:"\u91c7\u6458\u7ecf\u9a8c",woodcuttingExperience:"\u4f10\u6728\u7ecf\u9a8c",cheesesmithingExperience:"\u5976\u916a\u953b\u9020\u7ecf\u9a8c",craftingExperience:"\u5236\u4f5c\u7ecf\u9a8c",tailoringExperience:"\u7f1d\u7eab\u7ecf\u9a8c",cookingExperience:"\u70f9\u996a\u7ecf\u9a8c",brewingExperience:"\u51b2\u6ce1\u7ecf\u9a8c",alchemyExperience:"\u70bc\u91d1\u7ecf\u9a8c",enhancingExperience:"\u5f3a\u5316\u7ecf\u9a8c"},home:{nav:{home:"\u9996\u9875",news:"\u65b0\u95fb",patchNotes:"\u66f4\u65b0\u65e5\u5fd7",gameGuide:"\u6e38\u620f\u6307\u5357"},title:"$t(global.gameName) - \u591a\u4eba\u653e\u7f6e\u6e38\u620f - \u6536\u96c6\u3001\u5236\u4f5c\u3001\u6218\u6597\u3001\u4ea4\u6613\uff0c\u8fd8\u6709\u66f4\u591a\u7cbe\u5f69\uff01",subtitle:"\u591a\u4eba\u653e\u7f6eRPG",bannerText:"\u8e0f\u4e0a\u4e00\u6bb5\u7a7f\u8d8a$t(global.gameName)\u7684\u65c5\u7a0b\uff0c\u8fd9\u662f\u4e00\u6b3e\u72ec\u7279\u7684\u591a\u4eba\u653e\u7f6e\u6e38\u620f\u3002\u65e0\u8bba\u4f60\u559c\u6b22\u6536\u96c6\u8d44\u6e90\u3001\u5236\u4f5c\u7269\u54c1\uff0c\u8fd8\u662f\u53c2\u4e0e\u4e0e\u5916\u661f\u602a\u7269\u7684\u53f2\u8bd7\u6218\u6597\uff0c\u8fd9\u91cc\u90fd\u6709\u5c5e\u4e8e\u4f60\u7684\u4e50\u8da3\uff01\u4f60\u53ef\u4ee5\u6c89\u6d78\u5728\u6211\u4eec\u7e41\u8363\u7684\u793e\u533a\u4e2d\uff0c\u5728\u73a9\u5bb6\u9a71\u52a8\u7684\u5e02\u573a\u4e2d\u4ea4\u6613\u7269\u54c1\uff0c\u4e0e\u670b\u53cb\u7ec4\u5efa\u516c\u4f1a\u3001\u7545\u804a\u4ea4\u6d41\uff0c\u751a\u81f3\u51b2\u51fb\u6392\u884c\u699c\u5dc5\u5cf0\uff01",testServer:"\u6d4b\u8bd5\u670d\u52a1\u5668",activePlayerCount:"\u5f53\u524d\u6709 {{count}} \u540d\u6d3b\u8dc3\u73a9\u5bb6\uff01",showcases:{gatherAndCraft:{title:"\u6536\u96c6\u548c\u5236\u4f5c",text:"\u6324\u5976\u3001\u91c7\u96c6\u3001\u4f10\u6728\u3001\u5976\u916a\u953b\u9020\u3001\u5236\u4f5c\u3001\u7f1d\u7eab\u3001\u70f9\u996a\u3001\u51b2\u6ce1\u3001\u70bc\u91d1\u3001\u5f3a\u5316"},combat:{title:"\u6218\u6597",text:"\u591a\u79cd\u6218\u6597\u98ce\u683c\uff0c\u53ef\u5b9a\u4e49\u6d88\u8017\u54c1\u548c\u6280\u80fd\u7684\u81ea\u52a8\u4f7f\u7528\u3002\u5355\u4eba\u6216\u7ec4\u961f\u6218\u6597"},marketplace:{title:"\u5e02\u573a",text:"\u4e70\u5356\u8d44\u6e90\u3001\u6d88\u8017\u54c1\u3001\u88c5\u5907\u7b49\u7269\u54c1"},community:{title:"\u793e\u533a",text:"\u4e0e\u670b\u53cb\u7ec4\u961f\u804a\u5929\uff0c\u4e89\u593a\u6392\u884c\u699c\u7684\u4e00\u5e2d\u4e4b\u5730\uff01"}},footer:{termsOfUse:"\u4f7f\u7528\u6761\u6b3e",privacyPolicy:"\u9690\u79c1\u653f\u7b56",emailContact:"\u8054\u7cfb\u6211\u4eec"}},auth:{tabs:{playAsGuest:"\u6e38\u5ba2\u767b\u5f55",register:"\u6ce8\u518c",login:"\u767b\u5f55"},serverError:{title:"\u65e0\u6cd5\u8fde\u63a5\u5230\u670d\u52a1\u5668",message:"\u4f60\u5f53\u524d\u65e0\u6cd5\u8fde\u63a5\u5230\u6e38\u620f\u670d\u52a1\u5668\u3002\u8fd9\u53ef\u80fd\u662f\u7531\u4e8e\u6e38\u620f\u6b63\u5728\u66f4\u65b0\u3001\u670d\u52a1\u5668\u7ef4\u62a4\uff0c\u6216\u8005\u4f60\u548c\u670d\u52a1\u5668\u4e4b\u95f4\u5b58\u5728\u7f51\u7edc\u95ee\u9898\uff08\u4f8b\u5982\u9632\u706b\u5899\uff09\u3002\u8bf75-10\u5206\u949f\u540e\u5237\u65b0\u9875\u9762\u518d\u8bd5\u3002"},thirdPartyCookieMessage:{title:"\u767b\u5f55",message:"\u4f60\u7684\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u7b2c\u4e09\u65b9Cookie\uff0c\u8fd9\u662f\u5728iframe\u5185\u73a9\u6e38\u620f\u6240\u5fc5\u9700\u7684\u3002\u8bf7\u542f\u7528\u7b2c\u4e09\u65b9Cookie\u6216\u4ece<a href='https://www.milkywayidle.com' target='_blank'>www.milkywayidle.com</a>\u8fdb\u884c\u6e38\u620f\u3002"},welcomeBack:{title:"\u6b22\u8fce\u56de\u6765\uff01",logout:"\u9000\u51fa\u767b\u9646"},buttons:{enterGame:"\u8fdb\u5165\u6e38\u620f"},confirmationMessages:{guestWarning:"\u8b66\u544a: \u8bbf\u5ba2\u8d26\u6237\u53ea\u80fd\u901a\u8fc7\u8bbe\u7f6e\u4e2d\u7684\u8bbf\u5ba2\u5bc6\u7801\u518d\u6b21\u767b\u5f55\u3002",logoutConfirmation:"\u4f60\u786e\u5b9a\u8981\u9000\u51fa\u767b\u9646\u5417\uff1f"},shared:{agreeToRulesLabel:"\u6211\u540c\u610f<termsLink>\u300a\u4f7f\u7528\u6761\u6b3e\u300b</termsLink>\u3001<privacyPolicyLink>\u300a\u9690\u79c1\u653f\u7b56\u300b</privacyPolicyLink>\u3001\u548c<gameRulesLink>\u300a\u6e38\u620f\u89c4\u5219\u300b</gameRulesLink>",agreeToOneAccountLabel:"\u6211\u540c\u610f\u6211\u53ea\u53ef\u73a9\u4e00\u4e2a\u8d26\u6237",errors:{agreeToRulesError:"\u4f60\u5fc5\u987b\u540c\u610f\u6e38\u620f\u89c4\u5219",agreeToOneAccountError:"\u4f60\u5fc5\u987b\u540c\u610f\u53ea\u73a9\u4e00\u4e2a\u8d26\u6237",serverUnreachable:"\u670d\u52a1\u5668\u65e0\u6cd5\u8bbf\u95ee\u6216\u79bb\u7ebf",captchaBlockedError:"\u9a8c\u8bc1\u7801\u9a8c\u8bc1\u88ab\u6d4f\u89c8\u5668\u7684\u9690\u79c1\u8bbe\u7f6e\u963b\u6b62",captchaFailedError:"\u9a8c\u8bc1\u7801\u9a8c\u8bc1\u5931\u8d25",unexpectedError:"\u610f\u5916\u9519\u8bef"}}},playAsGuestForm:{title:"\u4ee5\u8bbf\u5ba2\u8eab\u4efd\u6e38\u73a9",info:"\u4f60\u7684\u4f1a\u8bdd\u5c06\u4fdd\u5b58\u5728\u6b64\u6d4f\u89c8\u5668\u4e2d\u3002\u8981\u8de8\u591a\u4e2a\u8bbe\u5907\u6e38\u73a9\uff0c\u4f60\u53ef\u4ee5\u5728\u6e38\u620f\u4e2d\u7684<b>\u8bbe\u7f6e</b>\u4e2d\u627e\u5230\u4f60\u7684<b>\u8bbf\u5ba2\u5bc6\u7801</b>\u6216\u8fdb\u884c\u5b8c\u6574<b>\u6ce8\u518c</b>\u3002",playButton:"\u6e38\u73a9"},registerForm:{title:"\u6ce8\u518c",emailLabel:"\u90ae\u7bb1",passwordLabel:"\u5bc6\u7801",passwordConfirmationLabel:"\u786e\u8ba4\u5bc6\u7801",registerButton:"\u6ce8\u518c",errors:{emailEmpty:"\u90ae\u7bb1\u4e0d\u80fd\u4e3a\u7a7a",invalidEmail:"\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1",passwordTooShort:"\u5bc6\u7801\u81f3\u5c11\u9700\u89816\u4e2a\u5b57\u7b26",passwordsDoNotMatch:"\u5bc6\u7801\u4e0d\u5339\u914d"}},loginForm:{back:"< \u8fd4\u56de",title:"\u767b\u5f55",titleSteam:"\u767b\u5f55$t(global.gameName)",emailOrNameLabel:"\u90ae\u7bb1\u6216\u7528\u6237\u540d",passwordLabel:"\u5bc6\u7801",loginButton:"\u767b\u5f55",forgotPassword:"\u5fd8\u8bb0\u5bc6\u7801",errors:{emailOrNameEmpty:"\u90ae\u7bb1/\u7528\u6237\u540d\u4e0d\u80fd\u4e3a\u7a7a",passwordEmpty:"\u5bc6\u7801\u4e0d\u80fd\u4e3a\u7a7a"}},forgotPassword:{title:"\u5fd8\u8bb0\u5bc6\u7801",infoMessage:"\u5982\u679c\u4f60\u7684\u5e10\u6237\u5df2\u4f7f\u7528\u6709\u6548\u7535\u5b50\u90ae\u4ef6\u6ce8\u518c\uff0c\u4f60\u5c06\u6536\u5230\u4e00\u5c01\u5305\u542b\u91cd\u7f6e\u8bf4\u660e\u7684\u5bc6\u7801\u91cd\u7f6e\u90ae\u4ef6\u3002(\u53ef\u80fd\u9700\u8981\u68c0\u67e5\u5783\u573e\u90ae\u4ef6\u6587\u4ef6\u5939)",emailLabel:"\u7535\u5b50\u90ae\u4ef6",resetPasswordButton:"\u91cd\u7f6e\u5bc6\u7801",backToLogin:"\u8fd4\u56de\u767b\u5f55",successMessage:"\u5982\u679c\u8be5\u7535\u5b50\u90ae\u4ef6\u5730\u5740\u4e0e\u5e10\u6237\u5173\u8054\uff0c\u5df2\u53d1\u9001\u7535\u5b50\u90ae\u4ef6\u3002",errors:{emailEmptyError:"\u7535\u5b50\u90ae\u4ef6\u4e0d\u80fd\u4e3a\u7a7a",invalidEmailError:"\u8bf7\u8f93\u5165\u6709\u6548\u7684\u7535\u5b50\u90ae\u4ef6"}},playFromKongregate:{title:"\u4eceKongregate\u73a9\u6e38\u620f",noAccountMessage:"\u4f60\u5fc5\u987b\u62e5\u6709\u4e00\u4e2aKongregate\u5e10\u6237\u624d\u80fd\u8fdb\u884c\u6e38\u620f\u3002",registerButton:"\u6ce8\u518c",signInInfo:"\u767b\u5f55$t(global.gameName)\u3002\u5982\u679c\u662f\u521d\u6b21\u6e38\u73a9\uff0c\u53ef\u521b\u5efa\u65b0\u5e10\u6237\uff01",signInButton:"\u4eceKongregate\u767b\u5f55"},loginWithSteam:{signInTitle:"\u4eceSteam\u767b\u5f55\u6e38\u620f",signInInfo:"\u4f7f\u7528\u4f60\u7684Steam\u5e10\u6237\u5f00\u59cb\u73a9$t(global.gameName)\uff01",signInButton:"\u4eceSteam\u767b\u5f55",linkAccountTitle:"\u5df2\u6709$t(global.gameName)\u5e10\u6237\uff1f",linkAccountInfo:"\u5982\u679c\u4f60\u4e4b\u524d\u73a9\u8fc7\u7f51\u9875\u7248$t(global.gameName)\uff0c\u53ef\u4ee5\u5c06\u73b0\u6709\u5e10\u6237\u4e0eSteam\u7ed1\u5b9a\u3002",linkAccountButton:"\u6709\uff0c\u7ed1\u5b9a\u6211\u7684\u5e10\u6237",createAccountButton:"\u6ca1\u6709\uff0c\u521b\u5efa\u65b0\u5e10\u6237",steamAuthTicketError:"\u65e0\u6cd5\u83b7\u53d6Steam\u8eab\u4efd\u9a8c\u8bc1\u7968\u636e\u3002\u8bf7\u91cd\u65b0\u542f\u52a8Steam\u5e76\u91cd\u8bd5\u3002"},characterSelectPage:{title:"\u9009\u62e9\u89d2\u8272 - $t(global.gameName)",header:"\u9009\u62e9\u89d2\u8272",loading:"\u6b63\u5728\u52a0\u8f7d\u89d2\u8272...",createCharacterModal:{title:"\u521b\u5efa\u89d2\u8272",nameLabel:"\u89d2\u8272\u540d\u79f0:",namePlaceholder:"\u89d2\u8272\u540d\u79f0(2-16\u4e2a\u5b57\u6bcd\u6216\u6570\u5b57)",gameModeLabel:"\u6e38\u620f\u6a21\u5f0f:",maxCharacter:"\u6700\u591a{{count}}\u4e2a\u89d2\u8272",maxCharacter_one:"\u6700\u591a{{count}}\u4e2a\u89d2\u8272",maxCharacter_other:"\u6700\u591a{{count}}\u4e2a\u89d2\u8272",submitButton:"\u521b\u5efa",errors:{nameLength:"\u5fc5\u987b\u4e3a2\u523016\u4e2a\u5b57\u7b26",nameInvalid:"\u4ec5\u5141\u8bb8\u5b57\u6bcd\u548c\u6570\u5b57"}},slots:{slot:"\u69fd\u4f4d{{slotNum}}",empty:"\u7a7a",online:"\u5728\u7ebf",lastOnline:"\u4e0a\u6b21\u5728\u7ebf: {{duration}}\u524d"},errors:{fetchCharacters:"\u65e0\u6cd5\u83b7\u53d6\u89d2\u8272\u4fe1\u606f\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",fetchGameModes:"\u65e0\u6cd5\u83b7\u53d6\u6e38\u620f\u6a21\u5f0f\u6570\u636e\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",serverUnreachable:"\u670d\u52a1\u5668\u4e0d\u53ef\u8fbe\u6216\u79bb\u7ebf",unexpectedError:"\u672a\u77e5\u9519\u8bef"}},gamePage:{disconnectedFromServer:"\u4e0e\u670d\u52a1\u5668\u65ad\u5f00\u8fde\u63a5...",bannedMessage:"\u4f60\u88ab\u5c01\u7981\u81f3 {{banExpireTime}}\u3002{{banReason}}",refresh:"\u5237\u65b0",attemptingToConnect:"\u6b63\u5728\u8fde\u63a5\u5230\u670d\u52a1\u5668...",loadingTitle:"\u52a0\u8f7d\u4e2d - $t(global.gameName)",disconnectedTitle:"\u5df2\u65ad\u5f00\u8fde\u63a5 - $t(global.gameName)",guestLogoutWarning:"\u8b66\u544a: \u8bbf\u5ba2\u5e10\u6237\u53ea\u80fd\u901a\u8fc7\u8bbe\u7f6e\u4e2d\u7684\u8bbf\u5ba2\u5bc6\u7801\u518d\u6b21\u767b\u5f55\u3002",logoutConfirmation:"\u4f60\u786e\u5b9a\u8981\u9000\u51fa\u767b\u9646\u5417\uff1f",refreshPrompt:" \u8bf7\u5237\u65b0\u3002",gameServerRestarted:"\u6e38\u620f\u670d\u52a1\u5668\u5df2\u91cd\u542f\u3002\u8bf7\u5237\u65b0\u9875\u9762\u3002",captchaRequired:"\u8bf7\u5b8c\u6210\u9a8c\u8bc1\u7801\u3002",captchaVerificationFailed:"\u9a8c\u8bc1\u7801\u9a8c\u8bc1\u5931\u8d25\u3002\u8bf7\u91cd\u8bd5\u3002",captchaFailed:"\u9a8c\u8bc1\u7801\u5931\u8d25\u3002\u8bf7\u91cd\u8bd5\u3002",captchaBlocked:"\u9a8c\u8bc1\u7801\u9a8c\u8bc1\u88ab\u6d4f\u89c8\u5668\u7684\u9690\u79c1\u8bbe\u7f6e\u963b\u6b62\u3002\u8bf7\u8c03\u6574\u6d4f\u89c8\u5668\u7684\u9690\u79c1\u8bbe\u7f6e\u5e76\u5237\u65b0\u9875\u9762\u3002"},header:{flee:"\u9003\u8dd1",stop:"\u505c\u6b62",loadoutWithName:"\u914d\u88c5: {{name}}",loadoutUnavailable:"\u914d\u88c5\u5305\u542b\u7f3a\u5931\u7269\u54c1",loadoutDeleted:"\u914d\u88c5\u5df2\u5220\u9664",totalExperience:"\u603b\u7ecf\u9a8c: {{totalExp}}",totalLevel:"\u603b\u7b49\u7ea7: {{totalLevel}}",activePlayers:"\u6d3b\u8dc3\u89d2\u8272: {{activePlayerCount}}",confirmRunAway:"\u4f60\u786e\u5b9a\u8981\u9003\u79bb\u6218\u6597\u5417\uff1f",newTutorialMessage:"\u65b0\u6559\u7a0b\u6d88\u606f",newMessage:"\u65b0\u6d88\u606f",newTutorialTask:"\u65b0\u6559\u7a0b\u4efb\u52a1",newTask:"\u65b0\u4efb\u52a1",progress:"\u8fdb\u5ea6: {{currentCount}} / {{goalCount}}",successRate:"\u6210\u529f\u7387: {{successRate}}",usingCatalyst:"\u4f7f\u7528\u50ac\u5316\u5242",targetEnhance:"\u76ee\u6807: +{{enhancingMaxLevel}}",protectEnhance:"\u4fdd\u62a4: +{{enhancingProtectionMinLevel}}",viewProfile:"\u67e5\u770b\u8d44\u6599",labyrinthPaused:"(\u5df2\u6682\u505c)"},actionProgressBar:{fighting:"\u6218\u6597\u4e2d",travelingToBattle:"\u524d\u5f80\u6218\u6597",travelingToRoom:"\u524d\u5f80\u623f\u95f4",automating:"\u81ea\u52a8\u5316\u4e2d..."},queuedActions:{loadout:"\u914d\u88c5: {{name}}",loadoutUnavailable:"\u914d\u88c5\u5305\u542b\u4e0d\u53ef\u7528\u7269\u54c1",loadoutDeleted:"\u914d\u88c5\u5df2\u5220\u9664",useItem:"\u4f7f\u7528: {{itemName}}",catalystUnavailable:"\u50ac\u5316\u5242: [\u7269\u54c1\u4e0d\u8db3]",targetLevel:"\u76ee\u6807\u7b49\u7ea7: +{{level}}",protectFromLevel:"\u4fdd\u62a4\u7b49\u7ea7: +{{level}}",repeat:"\u91cd\u590d",gather:"\u6536\u96c6",produce:"\u751f\u4ea7",fight:"\u6218\u6597",actionCountTimes:"{{action}} {{count}} \u6b21",queuedActionsHeader:"\u884c\u52a8\u961f\u5217",queuedActionsSlotCount:"\u884c\u52a8\u961f\u5217 ({{current}}/{{max}})",upgradeCapacity:"\u5347\u7ea7\u5bb9\u91cf",queuedActionsCount:"+{{count}} \u961f\u5217<br />\u4e2d\u7684\u884c\u52a8",remove:"\u79fb\u9664",moveActionToFrontConfirm:"\u73b0\u5728\u8fd0\u884c\u6b64\u884c\u52a8\u5417\uff1f\u5f53\u524d\u884c\u52a8\u5c06\u6682\u505c\uff0c\u5e76\u5728\u4e4b\u540e\u7ee7\u7eed\u3002",clearQueue:"\u6e05\u7a7a\u961f\u5217",clearQueueConfirm:"\u786e\u5b9a\u8981\u6e05\u7a7a\u6240\u6709\u6392\u961f\u4e2d\u7684\u884c\u52a8\u5417\uff1f"},navigationBar:{myStuff:"\u6211\u7684\u7269\u54c1",marketplace:"\u5e02\u573a",tasks:"\u4efb\u52a1",labyrinth:"\u8ff7\u5bab",combat:"\u6218\u6597",shop:"\u5546\u5e97",cowbellStore:"\u725b\u94c3\u5546\u5e97",lootTracker:"\u6389\u843d\u8bb0\u5f55",social:"\u793e\u4ea4",guild:"\u516c\u4f1a",leaderboard:"\u6392\u884c\u699c",moderator:"\u7ba1\u7406\u5458",settings:"\u8bbe\u7f6e",news:"\u65b0\u95fb",patchNotes:"\u66f4\u65b0\u65e5\u5fd7",gameGuide:"\u6e38\u620f\u6307\u5357",gameRules:"\u6e38\u620f\u89c4\u5219",wiki:"\u7ef4\u57fa\u767e\u79d1",discord:"Discord",testServer:"\u6d4b\u8bd5\u670d\u52a1\u5668",privacyPolicy:"\u9690\u79c1\u653f\u7b56",switchCharacter:"\u5207\u6362\u89d2\u8272",logout:"\u9000\u51fa\u767b\u9646",myStuffTooltip:"\u5e93\u5b58\u3001\u88c5\u5907\u3001\u80fd\u529b\u3001\u623f\u5c4b\u548c\u914d\u88c5\u3002",marketplaceTooltip:"\u73a9\u5bb6\u9a71\u52a8\u7684\u5e02\u573a\uff0c\u4f60\u53ef\u4ee5\u7528\u91d1\u5e01\u4e70\u5356\u7269\u54c1\u3002",tasksTooltip:"\u968f\u673a\u751f\u6210\u7684\u4efb\u52a1\uff0c\u5b8c\u6210\u540e\u53ef\u83b7\u5f97\u5956\u52b1\u3002",labyrinthTooltip:"\u7a7f\u8d8a\u591a\u5c42\u751f\u6d3b\u548c\u6218\u6597\u6311\u6218\u5173\u5361\uff0c\u83b7\u53d6\u72ec\u7279\u5956\u52b1\u3002",milkingTooltip:"\u54de\u54de\u54de\uff5e\uff5e\uff5e",foragingTooltip:"\u6210\u4e3a\u62fe\u8352\u5927\u5e08",woodcuttingTooltip:"We are \u4f10\u6728\u7d2f",cheesesmithingTooltip:"\u829d\u58eb\u5c31\u662f\u6253\u94c1",craftingTooltip:"\u5236\u4f5c\u6b66\u5668\u3001\u73e0\u5b9d\u7b49\u3002",tailoringTooltip:"\u5236\u4f5c\u8fdc\u7a0b\u548c\u9b54\u6cd5\u670d\u88c5\u3002",cookingTooltip:"\u5236\u4f5c\u5065\u5eb7\u98df\u7269\u7684\u827a\u672f\u3002",brewingTooltip:"\u5236\u4f5c\u7f8e\u5473\u996e\u54c1\u7684\u827a\u672f\u3002",alchemyTooltip:"\u83dc\u5c31\u591a\u70bc",enhancingTooltip:"+5\u9760\u52aa\u529b\uff0c+10\u9760\u8fd0\u6c14\uff0c+15\u662f\u5947\u8ff9\uff0c+20\u662f\u547d\u8fd0",combatTooltip:"\u4e0e\u602a\u7269\u6218\u6597\u3002\u4f60\u7684\u6218\u6597\u7b49\u7ea7\u4ee3\u8868\u4e86\u57fa\u4e8e\u5404\u4e2a\u6218\u6597\u6280\u80fd\u7b49\u7ea7\u7ec4\u5408\u7684\u7efc\u5408\u6218\u6597\u6548\u679c\u3002",shopTooltip:"\u4ece\u4f9b\u5e94\u5546\u5904\u8d2d\u4e70\u7269\u54c1\u3002",cowbellStoreTooltip:"\u8d2d\u4e70\u548c\u4f7f\u7528\u725b\u94c3\u3002",lootTrackerTooltip:"\u8bb0\u5f55\u4f60\u6700\u8fd1\u884c\u52a8\u83b7\u5f97\u7684\u7269\u54c1\u3002",achievements:"\u6210\u5c31",achievementsTooltip:"\u8ffd\u8e2a\u4f60\u7684\u6536\u85cf\u8bb0\u5f55\u3001\u602a\u7269\u56fe\u9274\u548c\u6210\u5c31\u3002",socialTooltip:"\u670b\u53cb\u3001\u63a8\u8350\u548c\u9ed1\u540d\u5355\u3002",guildTooltip:"\u52a0\u5165\u73a9\u5bb6\u793e\u533a\u3002",leaderboardTooltip:"\u663e\u793a\u6bcf\u4e2a\u4e13\u4e1a\u7684\u9876\u7ea7\u73a9\u5bb6\u3002",moderatorTooltip:"\u5927\u9524\u7528\u6237\u3002",settingsTooltip:"\u66f4\u65b0\u5e10\u6237\u4fe1\u606f\u548c\u5176\u4ed6\u8bbe\u7f6e\u3002",staminaTooltip:"\u6bcf\u7ea7+10\u751f\u547d\u4e0a\u9650\u3002",intelligenceTooltip:"\u6bcf\u7ea7+10\u6cd5\u529b\u4e0a\u9650\u3002",attackTooltip:"\u589e\u52a0\u4f60\u7684\u7cbe\u51c6\u5ea6\u3001\u57fa\u7840\u653b\u51fb\u901f\u5ea6\u548c\u65bd\u6cd5\u901f\u5ea6\u3002",defenseTooltip:"\u589e\u52a0\u4f60\u7684\u95ea\u907f\u3001\u62a4\u7532\u548c\u5143\u7d20\u6297\u6027\u3002",meleeTooltip:"\u589e\u52a0\u4f60\u7684\u8fd1\u6218\u4f24\u5bb3\u3002",rangedTooltip:"\u589e\u52a0\u4f60\u7684\u8fdc\u7a0b\u4f24\u5bb3\u3002\u8fdc\u7a0b\u653b\u51fb\u6709\u989d\u5916\u7684\u66b4\u51fb\u51e0\u7387\u3002",magicTooltip:"\u589e\u52a0\u4f60\u7684\u9b54\u6cd5\u4f24\u5bb3\u3002",activePlayers:"\u6d3b\u8dc3\u89d2\u8272: {{count}}",level:"\u7b49\u7ea7: {{count}}",totalExperience:"\u603b\u7ecf\u9a8c: {{count}}",xpToLevelUp:"\u5347\u7ea7\u6240\u9700\u7ecf\u9a8c: {{count}}"},marketplacePanel:{marketplace:"\u5e02\u573a",marketListings:"\u5546\u54c1\u5217\u8868",myListings:"\u6211\u7684\u6302\u724c",resources:"\u8d44\u6e90",consumables:"\u6d88\u8017\u54c1",books:"\u6280\u80fd\u4e66",labyrinth:"\u8ff7\u5bab",dungeonKeys:"\u5730\u4e0b\u57ce\u94a5\u5319",equipment:"\u88c5\u5907",accessories:"\u4f69\u9970",tools:"\u5de5\u5177",mustBeBetween0And20:"\u5fc5\u987b\u57280\u523020\u4e4b\u95f4",mustBeAtLeast1:"\u5fc5\u987b\u81f3\u5c11\u4e3a1",youDontHaveEnoughItems:"\u4f60\u6ca1\u6709\u8db3\u591f\u7684\u7269\u54c1",youCantAffordThisMany:"\u4f60\u4e70\u4e0d\u8d77\u8fd9\u4e48\u591a",mustBeAtLeastVendorPrice:"\u5fc5\u987b\u81f3\u5c11\u4e3a\u5546\u4eba\u4ef7\u683c",itemFilterPlaceholder:"\u7269\u54c1\u641c\u7d22",viewAllItems:"\u67e5\u770b\u6240\u6709\u7269\u54c1",viewAllEnhancementLevels:"\u67e5\u770b\u6240\u6709\u5f3a\u5316\u7b49\u7ea7",refresh:"\u5237\u65b0",sell:"\u51fa\u552e",buy:"\u8d2d\u4e70",sellNow:"\u7acb\u5373\u51fa\u552e",postSellOrder:"\u53d1\u5e03\u51fa\u552e\u8ba2\u5355",sellListing:"\u51fa\u552e\u6302\u724c",postSellListing:"\u53d1\u5e03\u51fa\u552e\u6302\u724c",buyNow:"\u7acb\u5373\u8d2d\u4e70",postBuyOrder:"\u53d1\u5e03\u8d2d\u4e70\u8ba2\u5355",buyListing:"\u8d2d\u4e70\u6302\u724c",postBuyListing:"\u53d1\u5e03\u8d2d\u4e70\u6302\u724c",max:"\u6700\u591a",all:"\u5168\u90e8",enhancementLevel:"\u5f3a\u5316\u7b49\u7ea7",quantityYouHave:"\u6570\u91cf (\u4f60\u6709: {{maxQuantity}})",quantityYouCanAfford:"\u6570\u91cf (\u4f60\u80fd\u8d1f\u62c5: {{maxQuantity}})",quantityAvailableAtPrice:"\u6570\u91cf (\u6b64\u4ef7\u683c\u53ef\u7528: {{marketQuantity}})",priceBestSellOffer:"\u4ef7\u683c (\u6700\u4f73\u51fa\u552e\u62a5\u4ef7: <bestPrice />)",priceBestBuyOffer:"\u4ef7\u683c (\u6700\u4f73\u8d2d\u4e70\u62a5\u4ef7: <bestPrice />)",youGetOrMore:"\u83b7\u5f97: {{totalValue}}<coin /> ({{taxRate}}\u7a0e)<br />(\u66f4\u591a\uff0c\u5982\u679c\u6709\u66f4\u597d\u7684\u62a5\u4ef7)",youPayOrLess:"\u652f\u4ed8: {{totalValue}}<coin /><br />(\u66f4\u5c11\uff0c\u5982\u679c\u6709\u66f4\u597d\u7684\u62a5\u4ef7)",sellRestricted:"\u51fa\u552e\u53d7\u9650",listingLimitReached:"\u5df2\u8fbe\u5230\u6302\u724c\u9650\u5236",newSellListing:"+ \u65b0\u51fa\u552e\u6302\u724c",newBuyListing:"+ \u65b0\u8d2d\u4e70\u6302\u724c",loading:"\u6b63\u5728\u52a0\u8f7d...",item:"\u7269\u54c1",bestAskPrice:"\u6700\u4f73\u51fa\u552e\u4ef7",bestBidPrice:"\u6700\u4f73\u6536\u8d2d\u4ef7",viewAll:"\u67e5\u770b\u5168\u90e8",nope:"\u6ca1\u6709...",quantity:"\u6570\u91cf",askPrice:"\u51fa\u552e\u4ef7",bidPrice:"\u6536\u8d2d\u4ef7",action:"\u64cd\u4f5c",upgradeCapacity:"\u5347\u7ea7\u5bb9\u91cf",collectAll:"\u5168\u90e8\u6536\u96c6 ({{claimableCount}})",status:"\u72b6\u6001",type:"\u7c7b\u578b",progress:"\u8fdb\u5ea6",price:"\u4ef7\u683c",taxTaken:"\u7a0e\u6536",collect:"\u6536\u96c6",chatLink:"\u804a\u5929\u94fe\u63a5",link:"\u94fe\u63a5",cancel:"\u53d6\u6d88",confirmCancelMarketListing:"\u4f60\u786e\u5b9a\u8981\u53d6\u6d88\u6b64\u6302\u724c\u5417\uff1f",active:"\u6709\u6548",filled:"\u5df2\u5b8c\u6210",cancelled:"\u5df2\u53d6\u6d88",expired:"\u5df2\u8fc7\u671f",listingsCount:"{{currentListings}} / {{listingCap}} \u6302\u724c",mispriceWarningLine1:"\u4f60\u7684\u6302\u724c\u4ef7\u683c\u4e0e\u5f53\u524d\u5e02\u573a\u4ef7\u683c\u76f8\u5dee\u8f83\u5927\u3002",mispriceWarningLine2:"\u786e\u5b9a\u4ee5\u5355\u4ef7 {{price}} \u91d1\u5e01{{action}} {{quantity}} {{itemName}}\u5417\uff1f"},marketListingLink:{buying:"\u8d2d\u4e70",selling:"\u51fa\u552e",price:"\u4ef7\u683c: <color>{{price}}</color>"},tasksPanel:{tasks:"\u4efb\u52a1",taskBoard:"\u4efb\u52a1\u680f",taskShop:"\u4efb\u52a1\u5546\u5e97",taskCooldownUpgrade:"-1\u5c0f\u65f6\u4efb\u52a1\u51b7\u5374",taskCooldownDescription:"\u6c38\u4e45\u51cf\u5c11\u4e00\u5c0f\u65f6\u4efb\u52a1\u7b49\u5f85\u65f6\u95f4\u3002",blockSlotUpgrade:"+1\u5c4f\u853d\u69fd\u4f4d",blockSlotDescription:"\u589e\u52a0\u4e00\u4e2a\u5c4f\u853d\u69fd\u4f4d\uff0c\u5141\u8bb8\u5c4f\u853d\u4e00\u79cd\u751f\u6d3b\u4e13\u4e1a\u7684\u65b0\u4efb\u52a1\u3002",combatBlockUpgrade:"\u89e3\u9501\u6218\u6597\u5c4f\u853d",combatBlockDescription:"\u5141\u8bb8\u5c4f\u853d\u6218\u6597\u4efb\u52a1\u3002\u4f60\u9700\u8981\u81f3\u5c11\u4e00\u4e2a\u53ef\u7528\u7684\u5c4f\u853d\u69fd\u4f4d\u624d\u80fd\u4f7f\u7528\u6b64\u529f\u80fd\u3002",tutorialIncomplete:"\u5b8c\u6210\u4f60\u7684\u6559\u7a0b\u4efb\u52a1\u4ee5\u89e3\u9501\u4efb\u52a1\u680f\u3002<br />\u4f60\u5f53\u524d\u7684\u4efb\u52a1\u53ef\u4ee5\u5728\u9875\u9762\u53f3\u4e0a\u89d2\u627e\u5230\u3002",purplesGift:"\u5c0f\u7d2b\u725b\u7684\u793c\u7269: {{unclaimedTaskPoints}} / {{claimCost}} \u4efb\u52a1\u79ef\u5206",claim:"\u9886\u53d6",unreadTasks:"\u4f60\u6709 {{count}} \u4e2a\u672a\u8bfb\u4efb\u52a1",unreadTasks_one:"\u4f60\u6709 {{count}} \u4e2a\u672a\u8bfb\u4efb\u52a1",unreadTasks_other:"\u4f60\u6709 {{count}} \u4e2a\u672a\u8bfb\u4efb\u52a1",read:"\u8bfb\u53d6",taskSlotCount:"{{taskCount}} / {{taskSlotCap}} \u4efb\u52a1",upgradeCapacity:"\u5347\u7ea7\u5bb9\u91cf",nextTask:"\u4e0b\u4e00\u4e2a\u4efb\u52a1: ",waitingForNextTask:"\u53d1\u653e\u4e2d...",blockedSkills:"\u5c4f\u853d\u4e13\u4e1a",buyTaskUpgrade:"\u8d2d\u4e70\u4efb\u52a1\u5347\u7ea7",buyTaskShopItem:"\u8d2d\u4e70\u4efb\u52a1\u5546\u5e97\u7269\u54c1",quantity:"\u6570\u91cf",youPay:"\u652f\u4ed8: {{totalCost}}",buy:"\u8d2d\u4e70",upgrades:"\u5347\u7ea7",items:"\u7269\u54c1",lifetimeTaskPoints:"\u7d2f\u8ba1\u4efb\u52a1\u79ef\u5206: {{totalTaskPoints}}",minimumQuantity:"\u6700\u5c0f\u6570\u91cf: 1",notEnoughItems:"\u4f60\u6ca1\u6709\u8db3\u591f\u7684{{itemName}}",limitDisplay:"\u4e0a\u9650: {{current}}/{{max}}",maxLevel:"\u6ee1\u7ea7"},labyrinthPanel:{labyrinth:"\u8ff7\u5bab",room:"\u623f\u95f4",labyrinthShop:"\u8ff7\u5bab\u5546\u5e97",instructions:"\u8ff7\u5bab\u7531\u591a\u5c42\u751f\u6d3b\u548c\u6218\u6597\u6311\u6218\u7ec4\u6210\u3002\u6bcf\u6b21\u8fdb\u5165\u6d88\u80171\u6b21\u5165\u573a\u6b21\u6570\u3002\u5165\u573a\u6b21\u6570\u6bcf2-3\u5929\u6062\u590d\u4e00\u6b21\uff0c\u53d6\u51b3\u4e8e\u51b7\u5374\u65f6\u95f4\u5347\u7ea7\u3002<ul><li><bold>\u63a8\u8350\uff1a</bold>\u603b\u7b49\u7ea71000+\uff0c\u4e14\u62e5\u6709\u8db3\u591f\u7684\u6280\u80fd\u548c\u4e0d\u540c\u7684\u6218\u6597\u98ce\u683c\u6765\u5c1d\u8bd5\u81f3\u5c11\u4e00\u534a\u7684\u623f\u95f4\u7c7b\u578b\uff0c\u624d\u80fd\u6709\u6548\u5730\u8fdb\u884c\u8ff7\u5bab\u63a2\u7d22\u3002</li><li><bold>\u697c\u5c42\u4e0e\u623f\u95f4\uff1a</bold>\u6bcf\u5c42\u662f\u4e00\u4e2a\u623f\u95f4\u7f51\u683c\u3002\u901a\u8fc7\u623f\u95f4\u53ef\u63ed\u793a\u76f8\u90bb\u623f\u95f4\uff0c\u627e\u5230\u697c\u5c42\u51fa\u53e3\u5373\u53ef\u524d\u8fdb\u3002\u968f\u7740\u697c\u5c42\u63a8\u8fdb\uff0c\u96be\u5ea6\u9010\u6e10\u589e\u52a0\u3002</li><li><bold>\u5bfb\u8def\uff1a</bold>\u70b9\u51fb\u623f\u95f4\u53ef\u89c4\u5212\u8def\u5f84\uff0c\u4f1a\u6309\u987a\u5e8f\u81ea\u52a8\u6311\u6218\u3002\u62d6\u52a8\u53ef\u4e00\u6b21\u9009\u62e9\u591a\u4e2a\u623f\u95f4\u3002</li><li><bold>\u623f\u95f4\u7c7b\u578b\uff1a</bold>\u751f\u6d3b\u623f\u95f4\u6311\u621810\u79cd\u751f\u6d3b\u4e13\u4e1a\u4e4b\u4e00\u3002\u6218\u6597\u623f\u95f4\u8ba9\u4f60\u5bf9\u629710\u79cd\u8ff7\u5bab\u602a\u7269\u4e4b\u4e00\u3002\u5b9d\u7bb1\u623f\u95f4\u63d0\u4f9b\u7269\u54c1\u5956\u52b1\u3002\u697c\u5c42\u51fa\u53e3\u63d0\u4f9b\u66f4\u591a\u5956\u52b1\u5e76\u89e3\u9501\u4e0b\u4e00\u5c42\u3002</li><li><bold>\u706b\u628a\uff1a</bold>\u6bcf\u8fdb\u5165\u4e00\u4e2a\u623f\u95f4\u6d88\u8017\u4e00\u6839\u706b\u628a\u3002\u901a\u8fc7\u5236\u4f5c\u751f\u4ea7\u3002</li><li><bold>\u6597\u7bf7\uff1a</bold>\u76f4\u63a5\u901a\u8fc7\u53ef\u89c1\u7684\u6311\u6218\u623f\u95f4\uff0c\u4f46\u4e0d\u4f1a\u83b7\u5f97\u7ecf\u9a8c\u6216\u5956\u52b1\u3002\u901a\u8fc7\u7f1d\u7eab\u751f\u4ea7\u3002</li><li><bold>\u63a2\u7167\u706f\uff1a</bold>\u63ed\u793a\u4e00\u7247\u533a\u57df\u5185\u7684\u9690\u85cf\u623f\u95f4\u3002\u901a\u8fc7\u5976\u916a\u953b\u9020\u751f\u4ea7\u3002</li><li><bold>\u8865\u7ed9\u7bb1\uff1a</bold>\u63d0\u4f9b\u6301\u7eed\u6574\u6b21\u63a2\u7d22\u7684\u589e\u76ca\u6548\u679c\u3002\u6bcf\u79cd\u8865\u7ed9\u7bb1\u5728\u8fdb\u5165\u65f6\u6d88\u8017\u4e00\u4e2a\u3002\u8336\u53f6\u7bb1\u548c\u5496\u5561\u7bb1\u901a\u8fc7\u51b2\u6ce1\u751f\u4ea7\uff0c\u98df\u7269\u7bb1\u901a\u8fc7\u70f9\u996a\u751f\u4ea7\u3002</li><li><bold>\u5956\u52b1\uff1a</bold>\u83b7\u5f97\u8ff7\u5bab\u4ee3\u5e01\u3001\u7d2b\u591a\u62c9\u4e4b\u76d2\u3001\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1\uff08\u7b2c6\u5c42\u4ee5\u4e0a\uff09\u53ca\u76f8\u5173\u4e13\u4e1a\u7684\u7ecf\u9a8c\u3002\u5956\u52b1\u968f\u697c\u5c42\u7b49\u7ea7\u589e\u52a0\u3002\u5728\u8ff7\u5bab\u5546\u5e97\u7528\u4ee3\u5e01\u8d2d\u4e70\u5347\u7ea7\u548c\u7269\u54c1\u3002</li><li><bold>\u81ea\u52a8\u5316\uff1a</bold>\u8bbe\u7f6e\u4e0d\u540c\u623f\u95f4\u7c7b\u578b\u7684\u81ea\u52a8\u88c5\u5907\u65b9\u6848\u548c\u8df3\u8fc7\u9608\u503c\u3002\u4ece\u5546\u5e97\u5347\u7ea7\u5b8c\u5168\u81ea\u52a8\u5316\u4ee5\u81ea\u52a8\u5bfb\u8def\u3002</li></ul>",noChallengeInProgress:"\u5f53\u524d\u6ca1\u6709\u623f\u95f4\u8fdb\u884c\u4e2d",upgrades:"\u5347\u7ea7",rewards:"\u5956\u52b1",shopPlaceholder:"\u5546\u5e97\u7269\u54c1\u5c06\u663e\u793a\u5728\u8fd9\u91cc",labyrinthPoints:"\u8ff7\u5bab\u79ef\u5206: {{totalLabyrinthPoints}}",startRoom:"\u8d77\u59cb\u623f\u95f4",descendRoom:"\u697c\u5c42\u51fa\u53e3",combatRoom:"\u6218\u6597\u623f\u95f4",skillingRoom:"\u751f\u6d3b\u623f\u95f4",treasureRoom:"\u5b9d\u85cf\u623f\u95f4",unknownRoom:"\u672a\u77e5\u623f\u95f4",unknownRoomType:"\u672a\u77e5\u623f\u95f4\u7c7b\u578b",fail:"\u5931\u8d25",entered:"\u8fdb\u5165\u8fc7",itemReward:"\u7269\u54c1",labyrinthBuff:"\u8ff7\u5bab\u589e\u76ca",personalBuff:"\u4e2a\u4eba\u589e\u76ca",entryTitle:"\u8fdb\u5165\u8ff7\u5bab",requirements:"\u8981\u6c42",noKeyRequired:"\u65e0\u9700\u94a5\u5319",supplies:"\u9053\u5177",torch:"\u706b\u628a",shroud:"\u6597\u7bf7",beacon:"\u63a2\u7167\u706f",teaCrate:"\u8336\u7bb1",coffeeCrate:"\u5496\u5561\u7bb1",foodCrate:"\u98df\u7269\u7bb1",enterLabyrinth:"\u8fdb\u5165\u8ff7\u5bab",entries:"\u5165\u573a\u5238: {{current}} / {{max}}",maxPath:"{{max}} \u6700\u957f\u8def\u5f84",nextEntry:"\u4e0b\u5f20\u5165\u573a\u5238: ",entryReady:"\u53d1\u653e\u4e2d...",cooldownRemaining:"\u51b7\u5374: \u5269\u4f59 {{time}}",crates:"\u8865\u7ed9\u7bb1",maxCount:"{{count}} \u4e0a\u9650",floorDisplay:"\u7b2c {{current}} \u5c42",treasureDisplay:"\u5b9d\u85cf: {{remaining}} / {{total}}",paused:"\u5df2\u6682\u505c",resume:"\u7ee7\u7eed",resumeNow:"\u7acb\u5373\u7ee7\u7eed",start:"\u5f00\u59cb",stop:"\u505c\u6b62",addToQueue:"\u6dfb\u52a0\u961f\u5217 #{{count}}",queueFull:"\u961f\u5217\u5df2\u6ee1",startNow:"\u7acb\u5373\u5f00\u59cb",clearQueue:"\u6e05\u7a7a\u961f\u5217",selectRoomToTravel:"\u9009\u62e9\u8981\u524d\u5f80\u7684\u623f\u95f4",progress:"\u8fdb\u5ea6: {{percent}}%",attempts:"\u5c1d\u8bd5\u6b21\u6570: {{count}}",levelDisplay:"Lv. {{level}}",use:"\u4f7f\u7528",cancel:"\u53d6\u6d88",noTorchesAvailable:"\u4f60\u6ca1\u6709\u66f4\u591a\u7684\u706b\u628a\u4e86\u3002",escape:"\u7ed3\u675f\u8ff7\u5bab",escapeConfirm:"\u786e\u5b9a\u8981\u9003\u51fa\u8ff7\u5bab\u5417\uff1f\u5f53\u524d\u7684\u8ff7\u5bab\u5c06\u4f1a\u7ed3\u675f\u3002",escapeConfirmTorches:"\u4f60\u771f\u7684\u786e\u5b9a\u5417\uff1f\u4f60\u8fd8\u6709{{count}}\u4e2a\u706b\u628a\uff0c\u53ef\u80fd\u8fd8\u80fd\u7ee7\u7eed\u63a2\u7d22\u3002",descendConfirm:"\u786e\u5b9a\u8981\u524d\u5f80\u4e0b\u4e00\u5c42\u5417\uff1f",advanceFloor:"\u524d\u5f80\u4e0b\u4e00\u5c42",nextFloor:"\u4e0b\u4e00\u5c42",info:"\u4fe1\u606f",upgrade:"\u5347\u7ea7",queue:"\u961f\u5217",stairsDown:"\u901a\u5f80\u4e0b\u4e00\u5c42\u7684\u697c\u68af",chooseOption:"\u9009\u62e9\u4e00\u4e2a\u9009\u9879:",levelBonus:"+{{bonus}} {{skillName}}\u7b49\u7ea7",boostPercent:"+{{percent}}% \u52a0\u6210",durationMins:"{{mins}} \u5206\u949f",rewardTokens:"+{{count}} \u4ee3\u5e01",rewardTorches:"+{{count}} \u706b\u628a",rewardShrouds:"+{{count}} \u6597\u7bf7",rewardBeacons:"+{{count}} \u63a2\u7167\u706f",levelsAndBuffs:"\u7b49\u7ea7\u4e0e\u589e\u76ca",buffedLevels:"\u589e\u76ca\u7b49\u7ea7",noSkillData:"\u65e0\u6280\u80fd\u6570\u636e",skillingBuffs:"\u751f\u6d3b\u589e\u76ca",combatBuffs:"\u6218\u6597\u589e\u76ca",otherBuffs:"\u5176\u4ed6\u589e\u76ca",labBuffs:"\u8ff7\u5bab\u589e\u76ca",crateBuffs:"\u8865\u7ed9\u7bb1\u589e\u76ca",noActiveLabBuffs:"\u65e0\u8ff7\u5bab\u589e\u76ca",noCrateBuffs:"\u65e0\u8865\u7ed9\u7bb1\u589e\u76ca",lootedItems:"\u5df2\u83b7\u53d6\u7269\u54c1",items:"\u7269\u54c1",pendingBuffs:"\u5f85\u9886\u53d6\u4e2a\u4eba\u589e\u76ca",noLootedItems:"\u6682\u65e0\u6218\u5229\u54c1",cooldownReduction:"-4\u5c0f\u65f6\u8ff7\u5bab\u51b7\u5374",cooldownReductionDescription:"\u6c38\u4e45\u51cf\u5c114\u5c0f\u65f6\u8ff7\u5bab\u51b7\u5374\u65f6\u95f4\u3002",torchCapacity:"+20\u706b\u628a\u5bb9\u91cf",torchCapacityDescription:"\u6c38\u4e45\u589e\u52a020\u4e2a\u8ff7\u5bab\u706b\u628a\u643a\u5e26\u4e0a\u9650\u3002",shroudCapacity:"+1\u6597\u7bf7\u5bb9\u91cf",shroudCapacityDescription:"\u6c38\u4e45\u589e\u52a01\u4e2a\u8ff7\u5bab\u6597\u7bf7\u643a\u5e26\u4e0a\u9650\u3002",beaconCapacity:"+1\u63a2\u7167\u706f\u5bb9\u91cf",beaconCapacityDescription:"\u6c38\u4e45\u589e\u52a01\u4e2a\u8ff7\u5bab\u63a2\u7167\u706f\u643a\u5e26\u4e0a\u9650\u3002",maxLevel:"\u6ee1\u7ea7",buyLabyrinthUpgrade:"\u8d2d\u4e70\u8ff7\u5bab\u5347\u7ea7",buyLabyrinthShopItem:"\u8d2d\u4e70\u8ff7\u5bab\u5546\u5e97\u7269\u54c1",youPay:"\u652f\u4ed8: {{totalCost}}",buy:"\u8d2d\u4e70",quantity:"\u6570\u91cf",minimumQuantity:"\u6700\u5c0f\u6570\u91cf: 1",notEnoughTokens:"\u8ff7\u5bab\u4ee3\u5e01\u4e0d\u8db3",limitDisplay:"\u4e0a\u9650: {{current}}/{{max}}",action:"\u884c\u52a8",working:"\u5de5\u4f5c\u4e2d",successRate:"\u6210\u529f\u7387:",progressPerAction:"\u6bcf\u6b21\u8fdb\u5ea6:",targetLevel:"\u76ee\u6807\u7b49\u7ea7:",currentLevel:"\u5f53\u524d\u7b49\u7ea7:",workPerAction:"\u6bcf\u6b21\u5de5\u4f5c\u91cf:",workPower:"\u5de5\u4f5c\u80fd\u529b:",workTime:"\u5de5\u4f5c\u65f6\u95f4:",workProgress:"\u5de5\u4f5c\u8fdb\u5ea6:",timeRemaining:"\u5269\u4f59\u65f6\u95f4:",timeLimit:"\u65f6\u95f4: ",effectiveLevel:"\u6709\u6548\u7b49\u7ea7:",efficiency:"\u6548\u7387:",doubleProgress:"\u53cc\u500d\u8fdb\u5ea6:",flee:"\u9003\u8dd1",fleeConfirm:"\u786e\u5b9a\u8981\u9003\u8dd1\u5417\uff1f\u8fdb\u5ea6\u5c06\u4f1a\u4e22\u5931\u3002",waitingForCombat:"\u7b49\u5f85\u6218\u6597\u5f00\u59cb...",enterWithLessTorchesConfirm:"\u4f60\u643a\u5e26\u4e86 {{current}} \u4e2a\u706b\u628a\uff0c\u800c\u975e\u6700\u5927\u503c {{max}} \u4e2a\u3002\u786e\u5b9a\u8981\u7ee7\u7eed\u5417\uff1f",mustBringTorches:"\u4f60\u5fc5\u987b\u643a\u5e26\u706b\u628a\u624d\u80fd\u8fdb\u5165\u8ff7\u5bab\u3002",enterWithoutMaxSupplies:"\u4f60\u7684\u9053\u5177\u548c\u8865\u7ed9\u7bb1\u672a\u8fbe\u643a\u5e26\u4e0a\u9650\u3002\u786e\u5b9a\u8981\u7ee7\u7eed\u5417\uff1f",automation:"\u81ea\u52a8\u5316",noLoadout:"\u65e0\u914d\u88c5",roomTypeHeader:"\u623f\u95f4\u7c7b\u578b",loadoutHeader:"\u914d\u88c5",skipThresholdHeader:"\u8df3\u8fc7\u5982\u679c\u9ad8\u51fa\u7b49\u7ea7",skipThresholdPrefix:"\u8df3\u8fc7\u623f\u95f4\u5982\u679c\u5b83\u9ad8\u51fa\u6211\u7684\u7b49\u7ea7 \u2265",maxAttemptsPerRoomLabel:"\u6bcf\u623f\u95f4\u6700\u591a\u5c1d\u8bd5\u6b21\u6570:",manualPathIgnoreSkipLabel:"\u624b\u52a8\u8def\u5f84\u5ffd\u7565\u8df3\u8fc7\u9608\u503c:",manualPathIgnoreSkipNo:"\u5426",manualPathIgnoreSkipYes:"\u662f",save:"\u4fdd\u5b58",edit:"\u7f16\u8f91",fullAutomation:"\u5b8c\u5168\u81ea\u52a8\u5316",fullAutoFloor:"\u5b8c\u5168\u81ea\u52a8\u5316\u5230\u5c42\u6570:",fullAutoDisabled:"\u7981\u7528",rushForExitFloor:"\u76f4\u5954\u51fa\u53e3\u5230\u5c42\u6570:",rushForExitDisabled:"\u7981\u7528",shroudAutoUse:"\u81ea\u52a8\u4f7f\u7528\u6597\u7bf7:",shroudNever:"\u4e0d\u4f7f\u7528",shroudWhenStuck:"\u5361\u4f4f\u65f6",perRoomSettings:"\u5355\u623f\u95f4\u8bbe\u7f6e",fullAutomationUpgrade:"+1\u5c42\u5b8c\u5168\u81ea\u52a8\u5316",fullAutomationDescription:"\u4e3a\u989d\u5916\u4e00\u5c42\u89e3\u9501\u5b8c\u5168\u81ea\u52a8\u5316\u529f\u80fd\u3002\u542f\u7528\u540e\uff0c\u623f\u95f4\u4f1a\u81ea\u52a8\u6dfb\u52a0\u5230\u8def\u5f84\u4e2d\u3002\u53ef\u7acb\u5373\u5230\u8fbe\u7684\u5956\u52b1\u623f\u95f4\u4f18\u5148\u5904\u7406\u3002\u5230\u8fbe\u697c\u5c42\u51fa\u53e3\u662f\u4e0b\u4e00\u4e2a\u4f18\u5148\u7ea7\u3002\u6700\u540e\u4f1a\u5b8c\u6210\u6240\u6709\u672a\u8df3\u8fc7\u7684\u5269\u4f59\u623f\u95f4\u3002",fullAutoLocked:"\u4ece\u8ff7\u5bab\u5546\u5e97\u89e3\u9501"},taskBlockSlot:{remove:"\u79fb\u9664",blockSlot:"\u69fd\u4f4d {{slotIndex}}"},randomTask:{back:"\u8fd4\u56de",confirmDiscard:"\u786e\u8ba4\u653e\u5f03",payCowbells:"\u652f\u4ed8 {{cowbellCost}}",payCoins:"\u652f\u4ed8 {{coinCost}}",reroll:"\u91cd\u7f6e",mooPassFreeReroll:"\u54de\u5361\u514d\u8d39\u91cd\u7f6e",go:"\u524d\u5f80",claimReward:"\u9886\u53d6\u5956\u52b1",progress:"\u8fdb\u5ea6: {{currentCount}} / {{goalCount}}",rewards:"\u5956\u52b1: ",defeat:"\u51fb\u8d25 - {{monsterName}}"},tutorialQuest:{purple:"\u5c0f\u7d2b\u725b",welcomeStartText:"\u6b22\u8fce\u6765\u5230$t(global.gameName)\u2014\u2014\u4e00\u4e2a\u62e5\u6709\u795e\u5947\u5976\u725b\u7684\u4e16\u754c\uff01<br /><br />\u6211\u662f\u5c0f\u7d2b\u725b\uff0c\u9996\u5e2d\u57f9\u8bad\u5b98\uff0c\u4e5f\u662f\u4f60\u7684\u5bfc\u6e38\uff01<br /><br />\u6211\u4f1a\u7528\u6a59\u8272\u7684\u95ea\u5149\u6765\u5f15\u5bfc\u4f60\u5b8c\u6210\u57f9\u8bad\u3002",welcomeButtonText:"\u55e8\uff0c\u5c0f\u7d2b\u725b\uff01",milkCowStartText:"\u8ba9\u6211\u5148\u5e26\u4f60\u770b\u770b\u6211\u4eec\u795e\u5947\u5976\u725b\u6700\u62ff\u624b\u7684\uff1a\u751f\u4ea7\u795e\u5947\u725b\u5976\uff01\u987a\u4fbf\u8bf4\u4e00\u4e0b\uff0c\u6211\u7684\u8868\u59b9\u6df1\u7d2b\u4e5f\u5728\u8fd9\u91cc\u5de5\u4f5c\u3002\u55e8\uff0c\u6df1\u7d2b\uff01<br /><br />\u9996\u5148\uff0c\u8bd5\u7740\u6536\u96c6\u4e00\u4e9b\u725b\u5976\u3002",milkCowCompleteText:"\u5e72\u5f97\u597d\uff01\u8fd9\u91cc\u6709\u4e00\u4e9b\u989d\u5916\u7684\u725b\u5976\u548c\u4e00\u628a\u5237\u5b50\u3002\u5237\u4e00\u5237\u5976\u725b\uff0c\u5b83\u4eec\u4f1a\u66f4\u5feb\u4e50\u66f4\u9ad8\u6548\u7684\u4ea7\u5976\uff01",smithCheeseStartText:"\u8ba9\u6211\u4eec\u7528\u725b\u5976\u5236\u4f5c\u4e00\u4e9b\u5976\u916a\uff01\u8fd9\u4e9b\u7279\u6b8a\u7684\u5976\u916a\u975e\u5e38\u8010\u7528\uff0c\u53ef\u4ee5\u901a\u8fc7\u5976\u916a\u953b\u9020\u505a\u6210\u8bb8\u591a\u6709\u7528\u7684\u4e1c\u897f\uff01",smithCheeseCompleteText:"\u592a\u597d\u4e86\uff01\u5e26\u4e0a\u4e00\u4e9b\u989d\u5916\u7684\u5976\u916a\u53bb\u5b8c\u6210\u4e0b\u4e00\u4e2a\u4efb\u52a1\u3002",smithSwordStartText:"\u5976\u916a\u662f\u5236\u4f5c\u5de5\u5177\u3001\u6b66\u5668\u548c\u76d4\u7532\u7684\u91cd\u8981\u8d44\u6e90\u3002\u8ba9\u6211\u6559\u4f60\u5982\u4f55\u5236\u4f5c\u5976\u916a\u5251\u5427\uff01\u6211\u77e5\u9053\u8fd9\u542c\u8d77\u6765\u53ef\u80fd\u6709\u70b9\u4e0d\u53ef\u601d\u8bae\uff0c\u4f46\u8bf7\u76f8\u4fe1\u6211\u3002",smithSwordCompleteText:"\u771f\u68d2\uff01\u968f\u7740\u4f60\u7684\u5347\u7ea7\uff0c\u4f60\u4e5f\u53ef\u4ee5\u4f7f\u7528\u66f4\u5f3a\u7684\u88c5\u5907\uff01\u8fd8\u53ef\u4ee5\u5236\u4f5c\u5de5\u5177\u6765\u63d0\u9ad8\u4f60\u7684\u6280\u827a\u3002",forageFarmlandStartText:"\u73b0\u5728\u8ba9\u6211\u4eec\u53bb\u5bfb\u627e\u66f4\u591a\u7684\u8d44\u6e90\u3002\u524d\u5f80\u7fe0\u91ce\u519c\u573a\uff0c\u770b\u770b\u4f60\u80fd\u6536\u96c6\u5230\u4ec0\u4e48\u7269\u54c1\uff01",forageFarmlandCompleteText:"\u597d\u5feb\uff01\u91c7\u6458\u4e3a\u4f60\u63d0\u4f9b\u4e86\u8bb8\u591a\u6280\u827a\u6240\u9700\u7684\u8d44\u6e90\uff0c\u5305\u62ec\u70f9\u996a\u3001\u51b2\u6ce1\u548c\u7f1d\u7eab\uff01",cookDonutStartText:"\u662f\u65f6\u5019\u5f00\u59cb\u70f9\u996a\u4e86\uff0c\u7528\u4e00\u4e9b\u9e21\u86cb\u3001\u5c0f\u9ea6\u548c\u7cd6\u505a\u4e00\u4e2a\u7f8e\u5473\u7684\u751c\u751c\u5708\u5427\u3002\u4ec0\u4e48\uff1f\u4f60\u4e0d\u4f1a\u505a\u996d\uff1f\u4f60\u53ef\u4ee5\u5b66\u561b\uff01\u6211\u542c\u8bf4\u5730\u7403\u4e0a\u8fd8\u6709\u53ea\u8001\u9f20\u4f1a\u505a\u996d\u5462\uff0c\u5982\u679c\u5b83\u80fd\u505a\u5230\uff0c\u4f60\u80af\u5b9a\u4e5f\u884c\uff01\u8bd5\u8bd5\u770b\uff01",cookDonutCompleteText:"\u592a\u68d2\u4e86\uff01\u98df\u7269\u53ef\u4ee5\u5728\u6218\u6597\u4e2d\u6cbb\u6108\u4f60\u3002\u5feb\u62ff\u7740\u8fd9\u4e00\u6253\u514d\u8d39\u7684\u751c\u751c\u5708\uff01",fightFlyStartText:"\u73b0\u5728\u6211\u60f3\u5e26\u4f60\u53bb\u6211\u4eec\u7684\u90bb\u8fd1\u661f\u7403\u4e4b\u4e00\u2014\u2014\u81ed\u81ed\u661f\u7403\uff01\u6211\u542c\u8bf4\u90a3\u91cc\u6709\u5f88\u591a\u4f1a\u54ac\u4eba\u7684\u82cd\u8747\uff01\u4f60\u6700\u597d\u5e26\u4e0a\u5251\u548c\u4e00\u4e9b\u751c\u751c\u5708\u3002\u6211\u4eec\u51fa\u53d1\u5427\uff01",fightFlyCompleteText:"\u4e0e\u602a\u517d\u6218\u6597\u53ef\u4ee5\u8d5a\u53d6\u91d1\u5e01\u3001\u8d44\u6e90\u3001\u6280\u80fd\u4e66\uff0c\u751a\u81f3\u7a00\u6709\u7269\u54c1\u3002<br /><br />\u5982\u679c\u4f60\u5728\u6218\u6597\u4e2d\u88ab\u51fb\u5012\uff0c\u4f60\u5c06\u5728150\u79d2\u540e\u6062\u590d\u5e76\u7ee7\u7eed\u6218\u6597\u3002",messageTipsStartText:"\u770b\u8d77\u6765\u65c5\u884c\u5feb\u7ed3\u675f\u4e86\u3002\u867d\u7136\u8fd8\u6709\u5f88\u591a\u4e1c\u897f\u53ef\u4ee5\u63a2\u7d22\uff0c\u4f46\u522b\u62c5\u5fc3\uff0c\u4f60\u4e0d\u4f1a\u5b64\u5355\uff01\u4e00\u65e6\u4f60\u518d\u5347\u7ea7\u4e00\u70b9\uff0c\u5c31\u53ef\u4ee5\u4e0e\u5176\u4ed6\u73a9\u5bb6\u804a\u5929\u6216\u83b7\u5f97\u5e2e\u52a9\uff01<br /><br />\u4f60\u4e5f\u53ef\u4ee5\u5728\u6211\u4eec\u7684\u73a9\u5bb6\u9a71\u52a8\u7684\u5e02\u573a\u4e2d\u4e70\u5356\u7269\u54c1\uff0c\u9664\u975e\u4f60\u5728\u73a9\u94c1\u725b\u6a21\u5f0f\u3002",messageTipsButtonText:"\u597d\u7684",messageTips2StartText:"\u5728\u6211\u8d70\u4e4b\u524d\uff0c\u8fd8\u6709\u4e00\u4e9b\u63d0\u793a\uff1a<br />- \u6e38\u620f\u6307\u5357\u53ef\u4ee5\u5728\u5de6\u4fa7\u5bfc\u822a\u83dc\u5355\u7684\u5e95\u90e8\u627e\u5230\u3002<br />- \u5373\u4f7f\u4f60\u5904\u4e8e\u79bb\u7ebf\u72b6\u6001\uff0c\u4f60\u4f9d\u7136\u80fd\u7ee7\u7eed\u83b7\u5f9710\u5c0f\u65f6\u79bb\u7ebf\u8fdb\u7a0b (\u53ef\u5347\u7ea7)\u3002<br />- \u7269\u54c1\u3001\u6280\u80fd\u3001\u4e13\u4e1a\u548c\u654c\u4eba\u53ef\u4ee5\u9f20\u6807\u60ac\u505c\uff08\u5728\u79fb\u52a8\u8bbe\u5907\u4e0a\u957f\u6309\uff09\u4ee5\u67e5\u770b\u66f4\u8be6\u7ec6\u4fe1\u606f\u3002<br /><br />\u597d\u7684\uff0c\u6211\u5f97\u8d70\u4e86\uff0c\u662f\u65f6\u5019\u5403\u6211\u7684\u7b2c\u4e8c\u987f\u5348\u9910\u4e86\uff0c\u6211\u53ef\u6709\u56db\u4e2a\u80c3\u8981\u586b\u9971\u5462\u3002\u5feb\u53bb\u63a2\u7d22\u4e16\u754c\u5427\uff01",messageTips2ButtonText:"\u518d\u89c1\uff0c\u5c0f\u7d2b\u725b\uff01"},questModal:{purple:"\u5c0f\u7d2b\u725b",task:"\u4efb\u52a1",tutorial:"\u6559\u7a0b",taskInfo:"\u4efb\u52a1: {{taskName}}",progress:"\u8fdb\u5ea6: {{currentCount}} / {{goalCount}}",rewardsLabel:"\u5956\u52b1: ",defeatMonster:"\u51fb\u8d25 - {{monsterName}}",ok:"\u786e\u5b9a",accept:"\u63a5\u53d7",go:"\u524d\u5f80",claimReward:"\u9886\u53d6\u5956\u52b1"},gatheringProductionSkillPanel:{consumables:"\u6d88\u8017\u54c1"},alchemyPanel:{currentAction:"\u5f53\u524d\u884c\u52a8",notAlchemizing:"\u6ca1\u6709\u884c\u52a8",consumables:"\u6d88\u8017\u54c1"},enhancingPanel:{currentActionTab:"\u5f53\u524d\u884c\u52a8",notEnhancing:"\u6ca1\u6709\u884c\u52a8",consumables:"\u6d88\u8017\u54c1"},combatPanel:{combatZones:"\u6218\u6597\u533a\u57df",findParty:"\u5bfb\u627e\u961f\u4f0d",myParty:"\u6211\u7684\u961f\u4f0d",battleCount:"\u4ea4\u6218 #{{battleId}}"},combatZones:{consumables:"\u6d88\u8017\u54c1",abilities:"\u6280\u80fd"},findParty:{selectZone:"\u9009\u62e9\u533a\u57df",refresh:"\u5237\u65b0",createParty:"\u521b\u5efa\u961f\u4f0d",profile:"\u4e2a\u4eba\u8d44\u6599",join:"\u52a0\u5165",combatZone:"\u6218\u6597\u533a\u57df",difficulty:"\u96be\u5ea6",fightTimes:"\u6218\u6597 {{times}} \u6b21",partyName:"{{name}}\u7684{{partyType}}",privateParty:"\u79c1\u4eba\u961f\u4f0d",party:"\u961f\u4f0d",levelRequirement:"\u7b49\u7ea7{{minLevel}}-{{maxLevel}}"},party:{noLoadout:"\u65e0\u914d\u88c5",selectZone:"\u9009\u62e9\u533a\u57df",fightTimesWithInputs:"\u6218\u6597 <inputs /> \u6b21",partyName:"{{name}}\u7684{{partyType}}",privateParty:"\u79c1\u4eba\u961f\u4f0d",publicParty:"\u516c\u5f00\u961f\u4f0d",autoKickCheckbox:"\u81ea\u52a8\u8e22\u51fa5\u5206\u949f\u5185\u672a\u5c31\u7eea\u7684\u961f\u5458",autoKickEnabled:"\u81ea\u52a8\u8e22\u51fa\u5df2\u542f\u7528",autoKickDisabled:"\u81ea\u52a8\u8e22\u51fa\u5df2\u7981\u7528",slot:"\u69fd\u4f4d {{number}}",role:"\u5b9a\u4f4d",minLevel:"\u6700\u4f4e\u7b49\u7ea7",maxLevel:"\u6700\u9ad8\u7b49\u7ea7",addSlot:"\u6dfb\u52a0\u69fd\u4f4d",combatZone:"\u6218\u6597\u533a\u57df",difficulty:"\u96be\u5ea6",leaveParty:"\u79bb\u5f00\u961f\u4f0d",confirmLeaveParty:"\u4f60\u786e\u5b9a\u8981\u79bb\u5f00\u961f\u4f0d\u5417\uff1f",disbandParty:"\u89e3\u6563\u961f\u4f0d",confirmDisbandParty:"\u4f60\u786e\u5b9a\u8981\u89e3\u6563\u961f\u4f0d\u5417\uff1f",confirmUnready:"\u4f60\u786e\u5b9a\u8981\u9003\u79bb\u961f\u4f0d\u6218\u6597\u5417\uff1f",editParty:"\u4fee\u6539\u961f\u4f0d",cancel:"\u53d6\u6d88",createParty:"\u521b\u5efa\u961f\u4f0d",save:"\u4fdd\u5b58",linkToChat:"\u94fe\u63a5\u5230\u804a\u5929\u9891\u9053",consumables:"\u6d88\u8017\u54c1",abilities:"\u6280\u80fd",profile:"\u4e2a\u4eba\u8d44\u6599",giveLeadership:"\u7ed9\u4e88\u9886\u5bfc\u6743",kick:"\u8e22\u51fa",ready:"\u51c6\u5907\u5c31\u7eea",unready:"\u672a\u5c31\u7eea",queueReady:"\u961f\u5217\u51c6\u5907\u5c31\u7eea"},partyRoles:{any_role:"\u4efb\u4f55\u5b9a\u4f4d",damage_dealer:"\u4f24\u5bb3\u8f93\u51fa",support:"\u8f85\u52a9",tank:"\u5766\u514b"},partyLink:{linkText:"\u961f\u4f0d: $t(actionNames.{{actionHrid}})"},battlePanel:{stats:"\u5c5e\u6027",battleInfo:"\u4ea4\u6218\u4fe1\u606f",confirmRunAway:"\u4f60\u786e\u5b9a\u8981\u9003\u79bb\u6218\u6597\u5417\uff1f",combatDuration:"\u6218\u6597\u65f6\u95f4: {{duration}}",battles:"\u4ea4\u6218: {{battleId}}",deaths:"\u6218\u8d25: {{deathCount}}",itemsLooted:"\u6218\u5229\u54c1: ",experienceGained:"\u83b7\u5f97\u7ecf\u9a8c: ",waveLabel:"\u6ce2\u6b21 {{currentWave}} / {{maxWaves}}",battleNumber:"\u4ea4\u6218 #{{battleId}}",combatRoom:"\u6218\u6597\u623f\u95f4",timeRemaining:"\u65f6\u95f4: ",consumables:"\u6d88\u8017\u54c1",abilities:"\u6280\u80fd",flee:"\u9003\u8dd1"},combatUnit:{respawn:"\u590d\u6d3b",autoAttack:"\u81ea\u52a8\u653b\u51fb",stunned:"\u7729\u6655",blindedSilenced:"\u5931\u660e/\u6c89\u9ed8",blinded:"\u5931\u660e",silenced:"\u6c89\u9ed8"},combatMonsterTooltip:{combatLevel:"\u6218\u6597\u7b49\u7ea7: {{level}}",experience:"\u7ecf\u9a8c: {{experience}}",drops:"\u6389\u843d:",rareDrops:"\u7a00\u6709\u6389\u843d:"},monsterWeaknesses:{"/monsters/shadow_archer":"\u5f31\u70b9\u4e3a\u523a\u51fb\u548c\u65a9\u51fb\u8fd1\u6218","/monsters/pyre_hunter":"\u5f31\u70b9\u4e3a\u65a9\u51fb\u548c\u949d\u51fb\u8fd1\u6218","/monsters/frost_sniper":"\u5f31\u70b9\u4e3a\u949d\u51fb\u548c\u523a\u51fb\u8fd1\u6218","/monsters/siren":"\u5f31\u70b9\u4e3a\u8fdc\u7a0b","/monsters/salamander":"\u5f31\u70b9\u4e3a\u8fdc\u7a0b","/monsters/dryad":"\u5f31\u70b9\u4e3a\u8fdc\u7a0b","/monsters/giant_scorpion":"\u5f31\u70b9\u4e3a\u6c34\u7cfb\u548c\u81ea\u7136\u9b54\u6cd5","/monsters/giant_mantis":"\u5f31\u70b9\u4e3a\u81ea\u7136\u548c\u706b\u7130\u9b54\u6cd5","/monsters/cyclops":"\u5f31\u70b9\u4e3a\u706b\u7130\u548c\u6c34\u7cfb\u9b54\u6cd5","/monsters/mimic":"\u5f31\u70b9\u4e3a\u8346\u68d8\u548c\u53cd\u51fb"},skillActionDetail:{levelRequirement:"Lv.{{level}}{{bonus}}",requires:"\u9700\u8981",upgradesFrom:"\u5347\u7ea7\u81ea",upgradeItemWarning:"\u6ca1\u6709\u9009\u62e9\u5347\u7ea7\u7269\u54c1",enhancementTransferAll:"\u8f6c\u79fb\u6240\u6709\u5f3a\u5316\u7b49\u7ea7\u3002",enhancementTransfer:"\u8f6c\u79fb70%\u7684\u5f3a\u5316\u7b49\u7ea7\u3002<br />\u5c0f\u6570\u6709\u673a\u4f1a\u591a\u52a01\u7ea7\u3002",costs:"\u8d39\u7528",outputs:"\u4ea7\u51fa",essenceDrops:"\u7cbe\u534e",rareDrops:"\u7a00\u6709",experience:"\u7ecf\u9a8c",duration:"\u6301\u7eed\u65f6\u95f4",successRate:"\u6210\u529f\u7387",travel:"\u65c5\u884c\u65f6\u95f4",bonuses:"\u52a0\u6210",alchemizeItem:"\u70bc\u91d1\u7269\u54c1",selectAlchemyItem:"\u9009\u62e9\u8981\u70bc\u91d1\u7684\u7269\u54c1",coinifyInfo:"<span>\u70b9\u91d1:</span> \u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u91d1\u5e01\u3002",decomposeInfo:"<span>\u5206\u89e3:</span> \u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u539f\u6750\u6599\u6216\u7cbe\u534e\u3002",transmuteInfo:"<span>\u8f6c\u5316:</span> \u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u968f\u673a\u76f8\u5173\u7269\u54c1\u3002",unrefineInfo:"<span>\u89e3\u7cbe\u70bc:</span> \u5c06\u7cbe\u70bc\u88c5\u5907\u8fd8\u539f\u4e3a\u57fa\u7840\u7248\u672c\u3002",invalidCoinifyItem:"\u6b64\u7269\u54c1\u65e0\u6cd5\u88ab\u70b9\u91d1",invalidDecomposeItem:"\u6b64\u7269\u54c1\u65e0\u6cd5\u88ab\u5206\u89e3",invalidTransmuteItem:"\u6b64\u7269\u54c1\u65e0\u6cd5\u88ab\u8f6c\u5316",invalidUnrefineItem:"\u6b64\u7269\u54c1\u65e0\u6cd5\u88ab\u89e3\u7cbe\u70bc",recommendedLevel:"\u63a8\u8350\u7b49\u7ea7 {{level}} <Icon />",bulkMultiplier:"\u6bcf\u6b21\u4f7f\u7528 {{multiplier}} \u4e2a\u7269\u54c1",catalyst:"\u50ac\u5316\u5242",consumedItem:"\u6d88\u8017\u7269\u54c1",notUsed:"\u4e0d\u4f7f\u7528",enhanceItem:"\u5f3a\u5316\u88c5\u5907",selectEnhancingItem:"\u9009\u62e9\u8981\u5f3a\u5316\u7684\u88c5\u5907",successInfo:"<span>\u6210\u529f</span>\u5c06\u4f7f\u7269\u54c1\u7684\u5f3a\u5316\u7b49\u7ea7\u589e\u52a01\u3002",failureInfo:"<span>\u5931\u8d25</span>\u9664\u975e\u4f7f\u7528\u4fdd\u62a4\u9053\u5177\uff0c\u5c06\u91cd\u7f6e\u5f3a\u5316\u7b49\u7ea7\u4e3a0\u3002",targetLevel:"\u76ee\u6807\u7b49\u7ea7",protection:"\u4fdd\u62a4",protectFromLevel:"\u4fdd\u62a4\u8d77\u59cb\u7b49\u7ea7",protectionMinLevelWarning:"\u5fc5\u987b\u22652\u624d\u6709\u6548",philosophersMirrorMinLevelWarning:"\u7269\u54c1\u5fc5\u987b\u81f3\u5c11+2",entryKey:"\u5165\u53e3\u94a5\u5319",reward:"\u5956\u52b1",bosses:"BOSS",bossFight:"BOSS<br />\u6bcf{{battlesPerBoss}}\u573a<br/>\u4ea4\u6218\u51fa\u73b0",monsters:"\u602a\u7269",difficulty:"\u96be\u5ea6",repeat:"\u91cd\u590d",gather:"\u91c7\u96c6",produce:"\u751f\u4ea7",fight:"\u6218\u6597",loadout:"\u914d\u88c5",noLoadout:"\u65e0\u914d\u88c5",confirmStartNow:"\u4f60\u786e\u5b9a\u8981\u66ff\u6362\u4f60\u7684\u884c\u52a8\u961f\u5217\u5417\uff1f",buttons:{start:"\u5f00\u59cb",startNow:"\u7acb\u5373\u5f00\u59cb",stop:"\u505c\u6b62",upgradeQueue:"\u5347\u7ea7\u884c\u52a8\u961f\u5217",addToQueue:"\u6dfb\u52a0\u5230\u961f\u5217 #{{count}}",findParty:"\u5bfb\u627e\u961f\u4f0d",queueFull:"\u961f\u5217\u5df2\u6ee1"}},shopPanel:{minQuantity:"\u6700\u5c0f\u6570\u91cf: 1",cannotAfford:"\u65e0\u6cd5\u652f\u4ed8",itemFilterPlaceholder:"\u7269\u54c1\u7b5b\u9009",youPay:"\u652f\u4ed8: {{count}} {{itemName}}",buyItem:"\u8d2d\u4e70\u7269\u54c1",quantity:"\u6570\u91cf",buy:"\u8d2d\u4e70",shop:"\u5546\u5e97"},cowbellStorePanel:{buyCowbells:"\u8d2d\u4e70\u725b\u94c3",mooPass:"\u54de\u5361",upgrades:"\u4fbf\u5229\u5347\u7ea7",chatIcons:"\u804a\u5929\u56fe\u6807",customChatIcon:"\u5b9a\u5236\u804a\u5929\u56fe\u6807",nameColors:"\u540d\u79f0\u989c\u8272",customNameColor:"\u5b9a\u5236\u540d\u79f0\u989c\u8272",avatars:"\u89d2\u8272\u5f62\u8c61",customAvatar:"\u5b9a\u5236\u89d2\u8272\u5f62\u8c61",avatarOutfits:"\u89d2\u8272\u670d\u88c5",customAvatarOutfit:"\u5b9a\u5236\u89d2\u8272\u670d\u88c5",communityBuffs:"\u793e\u533a\u589e\u76ca",nameChange:"\u66f4\u6539\u540d\u79f0",optIn:"\u52a0\u5165",optOut:"\u9000\u51fa",price:"\u4ef7\u683c: {{price}}",supporterPoints:"{{points}} \u652f\u6301\u8005\u79ef\u5206",minimumQuantity:"\u6700\u5c0f\u6570\u91cf: 1",notEnoughItems:"\u4f60\u6ca1\u6709\u8db3\u591f\u7684 {{itemName}}",minimumDuration:"\u6700\u77ed\u6301\u7eed\u65f6\u95f4: 10\u5206\u949f",notEnoughCowbells:"\u4f60\u6ca1\u6709\u8db3\u591f\u7684\u725b\u94c3",notEnoughSupporterPoints:"\u4f60\u6ca1\u6709\u8db3\u591f\u7684\u652f\u6301\u8005\u70b9\u6570",mustBeCharacters:"\u5fc5\u987b\u662f2-16\u4e2a\u5b57\u7b26",onlyAlphabetsNumbers:"\u53ea\u5141\u8bb8\u5b57\u6bcd\u548c\u6570\u5b57",notAvailable:"\u4e0d\u53ef\u7528",serverUnreachable:"\u670d\u52a1\u5668\u65e0\u6cd5\u8bbf\u95ee\u6216\u79bb\u7ebf",unexpectedError:"\u610f\u5916\u9519\u8bef",confirmChangeName:"\u786e\u8ba4\u66f4\u6539\u540d\u79f0\u4e3a: {{name}}",purchaseSuccessful:"\u8d2d\u4e70\u6210\u529f",thankYouSupport:"\u611f\u8c22\u4f60\u7684\u652f\u6301! \u8d2d\u4e70\u7684\u725b\u94c3\u6216\u54de\u5361\u5e94\u8be5\u4f1a\u5728\u6e38\u620f\u4e2d\u6388\u4e88\u4f60\u3002",purchaseNotice:"\u8d2d\u4e70\u901a\u77e5",purchaseAntiFraudMessage:"\u6e38\u620f\u5b89\u5168\u8981\u6c42\uff1a\u9996\u6b21\u8d2d\u4e70\u5c06\u89e6\u53d172\u5c0f\u65f6\u7981\u6b62\u51fa\u552e\u725b\u94c3\u888b\u7684\u5e02\u573a\u9650\u5236\uff0c\u81ea\u884c\u4f7f\u7528\u6ca1\u6709\u9650\u5236\u3002",waitForSteamOverlay:"\u7b49\u5f85Steam\u53e0\u52a0\u9875\u9762",steamOverlayMessage:"Steam\u53e0\u52a0\u9875\u9762\u5c06\u81ea\u52a8\u5f39\u51fa\uff0c\u4ee5\u7ee7\u7eed\u4f60\u7684\u8d2d\u4e70\u3002\u8fd9\u901a\u5e38\u9700\u8981\u51e0\u79d2\u949f\uff0c\u4f46\u5076\u5c14\u4e5f\u4f1a\u9700\u8981\u66f4\u957f\u65f6\u95f4\u3002\u4e4b\u540e\u4f60\u53ef\u4ee5\u5173\u95ed\u6b64\u6d88\u606f\u3002",continueToPurchase:"\u7ee7\u7eed\u8d2d\u4e70",continuePayment:"\u70b9\u51fb\u7ee7\u7eed\uff0c\u5728\u65b0\u7a97\u53e3\u4e2d\u6253\u5f00\u6211\u4eec\u7684\u652f\u4ed8\u5904\u7406\u5668\u3002",guestWarning:"\u6ce8\u610f: \u8fd9\u662f\u4e00\u4e2a\u8bbf\u5ba2\u8d26\u6237\u3002\u5efa\u8bae\u5728\u8bbe\u7f6e->\u8d26\u6237\u4e2d\u6ce8\u518c\u4ee5\u907f\u514d\u610f\u5916\u4e22\u5931\u8bbf\u95ee\u6743\u9650",continue:"\u7ee7\u7eed",mooPassPerks:"\u54de\u5361\u798f\u5229",buyConvenienceUpgrade:"\u8d2d\u4e70\u4fbf\u5229\u5347\u7ea7",quantity:"\u6570\u91cf",limit:"(\u9650\u5236: {{limit}})",buyLimit:"\u8d2d\u4e70\u9650\u5236: {{limit}}",afterPurchaseHoursofflineProgress:"\u8d2d\u4e70\u540e: {{limit}} \u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6",afterPurchaseMarketListings:"\u8d2d\u4e70\u540e: {{limit}} \u5e02\u573a\u6302\u724c",afterPurchaseActionQueues:"\u8d2d\u4e70\u540e: {{limit}} \u884c\u52a8\u961f\u5217",afterPurchaseLoadoutSlots:"\u8d2d\u4e70\u540e: {{limit}} \u914d\u88c5\u69fd\u4f4d",afterPurchaseTaskSlots:"\u8d2d\u4e70\u540e: {{limit}} \u4efb\u52a1\u69fd\u4f4d",afterPurchaseLabyrinthPathLength:"\u8d2d\u4e70\u540e: {{limit}} \u623f\u95f4\u8def\u5f84\u957f\u5ea6",buyChatIcon:"\u8d2d\u4e70\u804a\u5929\u56fe\u6807",buyNameColor:"\u8d2d\u4e70\u540d\u79f0\u989c\u8272",buyAvatar:"\u8d2d\u4e70\u89d2\u8272\u5f62\u8c61",buyAvatarOutfit:"\u8d2d\u4e70\u89d2\u8272\u670d\u88c5",preview:"\u9884\u89c8",unlock:"\u89e3\u9501",buyCommunityBuff:"\u8d2d\u4e70\u793e\u533a\u589e\u76ca",minute:"\u5206\u949f",minutesToAdd:"\u6dfb\u52a0\u5206\u949f\u6570",youPay:"\u652f\u4ed8: {{cost}}",buy:"\u8d2d\u4e70",cowbellStore:"\u725b\u94c3\u5546\u5e97",supporterPointsLabel:"\u652f\u6301\u8005\u79ef\u5206: {{points}}",famePointsLabel:"\u540d\u8a89\u79ef\u5206: {{points}}",buyCowbellsInfo:"\u4f60\u53ef\u4ee5\u8d2d\u4e70\u725b\u94c3\u6765\u652f\u6301\u6e38\u620f\u3002\u725b\u94c3\u53ef\u7528\u4e8e\u8d2d\u4e70\u4fbf\u5229\u5347\u7ea7\u3001\u804a\u5929\u56fe\u6807\u3001\u540d\u79f0\u989c\u8272\u3001\u89d2\u8272\u5f62\u8c61\u3001\u89d2\u8272\u670d\u88c5\u3001\u793e\u533a\u589e\u76ca\uff0c\u6216\u8005\u66f4\u6539\u4f60\u7684\u540d\u79f0\u3002",testServerFreeCowbellsSteam:"\u6d4b\u8bd5\u670d\u52a1\u5668: \u4f60\u53ef\u4ee5\u514d\u8d39\u83b7\u5f97\u725b\u94c3\u3002\u8fd9\u4f7f\u7528Steam\u7684\u6c99\u76d2\u652f\u4ed8\u6a21\u5f0f\uff0c\u4e0d\u4f1a\u5b9e\u9645\u6263\u6b3e\u3002",testServerFreeCowbellsStripe:"\u6d4b\u8bd5\u670d\u52a1\u5668: \u4f60\u53ef\u4ee5\u514d\u8d39\u83b7\u5f97\u725b\u94c3\uff0c\u8f93\u51654242-4242-4242-4242\u4f5c\u4e3a\u4fe1\u7528\u5361\uff0c\u5176\u5b83\u5b57\u6bb5\u968f\u610f\u8f93\u5165\u3002",buyCowbellsNote:"\u6ce8\u610f: \u8d2d\u4e70\u7684\u725b\u94c3\u5c06\u4f5c\u4e3a\u725b\u94c3\u888b (\u6bcf\u888b10\u4e2a) \u51fa\u73b0\u5728\u4f60\u7684[\u5e93\u5b58]\u4e2d\uff0c\u53ef\u4ee5\u5728\u5e02\u573a\u4e0a\u51fa\u552e\u7ed9\u5176\u4ed6\u73a9\u5bb6 ({{cowbellTaxRate}}\u91d1\u5e01\u7a0e)\u3002\u4e00\u65e6\u6253\u5f00\u5c31\u4e0d\u53ef\u51fa\u552e\u3002",selectCurrency:"\u9009\u62e9\u8d27\u5e01",mooPassInfo:"\u54de\u5361\u63d0\u4f9b\u591a\u79cd\u5b9e\u7528\u4f46\u4e0d\u5f71\u54cd\u4e3b\u8981\u4f53\u9a8c\u7684<PerksLink>\u798f\u5229</PerksLink>\u3002",characterMooPass:"\u89d2\u8272\u54de\u5361",accountMooPass:"\u8d26\u6237\u54de\u5361",increaseOfflineProgressLimit:"\u589e\u52a0\u79bb\u7ebf\u8fdb\u5ea6\u4e0a\u9650",increaseMarketListingLimit:"\u589e\u52a0\u5e02\u573a\u6302\u724c\u4e0a\u9650",increaseActionQueueLimit:"\u589e\u52a0\u884c\u52a8\u961f\u5217\u4e0a\u9650",increaseLoadoutSlotLimit:"\u589e\u52a0\u914d\u88c5\u69fd\u4f4d\u4e0a\u9650",increaseTaskSlotLimit:"\u589e\u52a0\u4efb\u52a1\u69fd\u4f4d\u4e0a\u9650",increaseLabyrinthRoomPathLimit:"\u589e\u52a0\u8ff7\u5bab\u8def\u5f84\u957f\u5ea6\u4e0a\u9650",freeMooPass:"14\u5929\u54de\u5361\u8d60\u9001",free:"\u514d\u8d39",confirmClaimFreeMooPass:"\u6fc0\u6d3b14\u5929\u514d\u8d39\u54de\u5361? \u8fd9\u662f\u4e00\u6b21\u6027\u8d60\u9001\u3002\u5982\u679c\u54de\u5361\u5df2\u7ecf\u6fc0\u6d3b\uff0c\u5c06\u5ef6\u957f14\u5929\u3002",mooPassWithCowbells:"7\u5929\u54de\u5361",buyMooPass:"\u8d2d\u4e70\u54de\u5361",totalMooPassDays:"\u83b7\u5f97: {{days}}\u5929\u54de\u5361",upgradeLimitsInfo:"\u5347\u7ea7\u4f1a\u6c38\u4e45\u589e\u52a0\u4e0a\u9650\u3002\u4f60\u5f53\u524d\u7684\u4e0a\u9650\u53ef\u4ee5\u5728[\u8bbe\u7f6e]\u4e2d\u67e5\u770b\u3002",seasonal:"\u8282\u65e5\u9650\u5b9a",ending:"\u5373\u5c06\u7ed3\u675f",unlocked:"\u5df2\u89e3\u9501",chatIconsInfo:"\u804a\u5929\u56fe\u6807\u663e\u793a\u5728\u4f60\u540d\u79f0\u524d\u9762\u3002\u89e3\u9501\u7684\u804a\u5929\u56fe\u6807\u53ef\u4ee5\u5728[\u8bbe\u7f6e]->[\u4e2a\u4eba\u8d44\u6599]\u4e2d\u66f4\u6539\u3002",customChatIconInfo:"\u4f60\u53ef\u4ee5\u82b1\u8d39 {{supporterPoints}} \u652f\u6301\u8005\u79ef\u5206\u548c {{cowbellCost}} \u725b\u94c3\u6765\u5b9a\u5236\u4e00\u4e2a\u804a\u5929\u56fe\u6807\u3002\u8bf7\u901a\u8fc7 Discord \u7684 #new-ticket \u9891\u9053\u63d0\u4ea4\u7533\u8bf7\u3002\u56fe\u6807\u5c06\u6839\u636e\u4f60\u63d0\u4f9b\u7684\u6982\u5ff5\u6216\u56fe\u7247\uff0c\u7531\u6211\u4eec\u7684\u8bbe\u8ba1\u5e08\u5236\u4f5c\uff0c\u786e\u4fdd\u7b26\u5408\u6e38\u620f\u7684\u98ce\u683c\u548c\u914d\u8272\u4e3b\u9898\u3002\u56fe\u6807\u4e0d\u5f97\u5305\u542b\u4efb\u4f55\u53d7\u7248\u6743\u4fdd\u62a4\u7684\u5185\u5bb9\u3002\u6388\u4e88\u56fe\u6807\u65f6\uff0c\u5c06\u4ece\u4f60\u9009\u62e9\u7684\u89d2\u8272\u4e2d\u6263\u9664\u652f\u6301\u8005\u70b9\u6570\u548c\u725b\u94c3\u8d39\u7528\u3002",nameColorsInfo:"\u70b9\u51fb\u4efb\u610f\u989c\u8272\u67e5\u770b\u9884\u89c8\u3002\u89e3\u9501\u7684\u989c\u8272\u53ef\u4ee5\u5728[\u8bbe\u7f6e]->[\u4e2a\u4eba\u8d44\u6599]\u4e2d\u66f4\u6539\u3002",customNameColorInfo:"\u4f60\u53ef\u4ee5\u82b1\u8d39 {{supporterPoints}} \u652f\u6301\u8005\u79ef\u5206\u548c {{cowbellCost}} \u725b\u94c3\u6765\u5b9a\u5236\u4e00\u4e2a\u540d\u79f0\u989c\u8272\u3002\u8bf7\u901a\u8fc7 Discord \u7684 #new-ticket \u9891\u9053\u63d0\u4ea4\u7533\u8bf7\u3002\u540d\u79f0\u989c\u8272\u53ef\u4ee5\u662f\u6e10\u53d8\u8272\uff0c\u5e76\u53ef\u9009\u62e9\u6dfb\u52a0\u5fae\u5f31\u7684\u53d1\u5149\u6548\u679c\u3002\u6388\u4e88\u540d\u79f0\u989c\u8272\u65f6\uff0c\u5c06\u4ece\u4f60\u9009\u62e9\u7684\u89d2\u8272\u4e2d\u6263\u9664\u652f\u6301\u8005\u70b9\u6570\u548c\u725b\u94c3\u8d39\u7528\u3002",avatarsInfo:"\u70b9\u51fb\u4efb\u610f\u89d2\u8272\u5f62\u8c61\u67e5\u770b\u9884\u89c8\u3002\u89e3\u9501\u7684\u89d2\u8272\u5f62\u8c61\u53ef\u4ee5\u5728[\u8bbe\u7f6e]->[\u4e2a\u4eba\u8d44\u6599]\u4e2d\u66f4\u6539\u3002",customAvatarInfo:"\u4f60\u53ef\u4ee5\u82b1\u8d39 {{supporterPoints}} \u652f\u6301\u8005\u79ef\u5206\u548c {{cowbellCost}} \u725b\u94c3\u6765\u5b9a\u5236\u4e00\u4e2a\u89d2\u8272\u5f62\u8c61\u3002\u8bf7\u901a\u8fc7 Discord \u7684 #new-ticket \u9891\u9053\u63d0\u4ea4\u7533\u8bf7\u3002\u89d2\u8272\u5f62\u8c61\u5c06\u6839\u636e\u4f60\u63d0\u4f9b\u7684\u6982\u5ff5\u6216\u56fe\u7247\uff0c\u7531\u6211\u4eec\u7684\u8bbe\u8ba1\u5e08\u5236\u4f5c\uff0c\u786e\u4fdd\u7b26\u5408\u6e38\u620f\u7684\u98ce\u683c\u548c\u914d\u8272\u4e3b\u9898\u3002\u89d2\u8272\u5f62\u8c61\u4e0d\u5f97\u5305\u542b\u4efb\u4f55\u53d7\u7248\u6743\u4fdd\u62a4\u7684\u5185\u5bb9\u3002\u6388\u4e88\u89d2\u8272\u5f62\u8c61\u65f6\uff0c\u5c06\u4ece\u4f60\u9009\u62e9\u7684\u89d2\u8272\u4e2d\u6263\u9664\u652f\u6301\u8005\u70b9\u6570\u548c\u725b\u94c3\u8d39\u7528\u3002",avatarOutfitsInfo:"\u70b9\u51fb\u4efb\u610f\u89d2\u8272\u670d\u88c5\u67e5\u770b\u9884\u89c8\u3002\u89e3\u9501\u7684\u89d2\u8272\u670d\u88c5\u53ef\u4ee5\u5728[\u8bbe\u7f6e]->[\u4e2a\u4eba\u8d44\u6599]\u4e2d\u66f4\u6539\u3002",customAvatarOutfitInfo:"\u4f60\u53ef\u4ee5\u82b1\u8d39 {{supporterPoints}} \u652f\u6301\u8005\u79ef\u5206\u548c {{cowbellCost}} \u725b\u94c3\u6765\u5b9a\u5236\u4e00\u4e2a\u89d2\u8272\u670d\u88c5\u3002\u8bf7\u901a\u8fc7 Discord \u7684 #new-ticket \u9891\u9053\u63d0\u4ea4\u7533\u8bf7\u3002\u89d2\u8272\u670d\u88c5\u5c06\u6839\u636e\u4f60\u63d0\u4f9b\u7684\u6982\u5ff5\u6216\u56fe\u7247\uff0c\u7531\u6211\u4eec\u7684\u8bbe\u8ba1\u5e08\u5236\u4f5c\uff0c\u786e\u4fdd\u7b26\u5408\u6e38\u620f\u7684\u98ce\u683c\u548c\u914d\u8272\u4e3b\u9898\u3002\u89d2\u8272\u670d\u88c5\u4e0d\u5f97\u5305\u542b\u4efb\u4f55\u53d7\u7248\u6743\u4fdd\u62a4\u7684\u5185\u5bb9\u3002\u6388\u4e88\u89d2\u8272\u670d\u88c5\u65f6\uff0c\u5c06\u4ece\u4f60\u9009\u62e9\u7684\u89d2\u8272\u4e2d\u6263\u9664\u652f\u6301\u8005\u70b9\u6570\u548c\u725b\u94c3\u8d39\u7528\u3002",communityBuffsInfo:"\u793e\u533a\u589e\u76ca\u4f7f\u670d\u52a1\u5668\u4e0a\u6240\u6709\u73a9\u5bb6\u90fd\u53d7\u76ca\u3002\u4f60\u53ef\u4ee5\u7528\u725b\u94c3\u6216\u652f\u6301\u8005\u79ef\u5206\u8d2d\u4e70\u3002\u6bcf\u82b1\u8d391\u4e2a\u725b\u94c3\u621610\u4e2a\u652f\u6301\u8005\u79ef\u5206\u5728\u793e\u533a\u589e\u76ca\u4e0a\uff0c\u4f60\u5c06\u83b7\u5f971\u4e2a\u540d\u8a89\u79ef\u5206\u3002\u540d\u8a89\u79ef\u5206\u5728\u6392\u884c\u699c\u4e0a\u6392\u540d\u3002",paymentMethod:"\u652f\u4ed8\u65b9\u5f0f",cowbells:"\u725b\u94c3",supporterPointsOption:"\u652f\u6301\u8005\u70b9\u6570",pointsShort:"\u70b9\u6570",fameLeaderboard:"\u540d\u8a89\u6392\u884c\u699c",currentName:"\u5f53\u524d\u540d\u79f0",newName:"\u65b0\u540d\u79f0",checkAvailability:"\u68c0\u67e5\u53ef\u7528\u6027",available:"\u53ef\u7528",cost:"\u8d39\u7528",changeName:"\u66f4\u6539\u540d\u79f0",addCreatorCode:"\u6dfb\u52a0\u521b\u4f5c\u8005\u4ee3\u7801",activeCreatorCode:"\u521b\u4f5c\u8005\u4ee3\u7801: {{code}} ({{creatorName}})",changeCreatorCode:"\u66f4\u6539",removeCreatorCode:"\u79fb\u9664",creatorCodeModalTitle:"\u6dfb\u52a0\u521b\u4f5c\u8005\u4ee3\u7801",creatorCodeModalDescription:"\u8f93\u5165\u521b\u4f5c\u8005\u4ee3\u7801\u4ee5\u652f\u6301\u4f60\u559c\u7231\u7684\u5185\u5bb9\u521b\u4f5c\u8005\u3002\u4f60\u7684\u771f\u5b9e\u8d27\u5e01\u8d2d\u4e70\u7684\u4e00\u90e8\u5206\u5c06\u5f52\u521b\u4f5c\u8005\u6240\u6709\u3002\u4ee3\u7801\u6709\u6548\u671f\u4e3a60\u5929\uff0c\u53ef\u968f\u65f6\u66f4\u6539\u3002",creatorCodeInputPlaceholder:"\u8f93\u5165\u521b\u4f5c\u8005\u4ee3\u7801",creatorCodeSave:"\u6dfb\u52a0",creatorCodeSaving:"\u6dfb\u52a0\u4e2d...",creatorCodePurchaseTitle:"\u8c22\u8c22\uff01",creatorCodePurchaseMessage:"\u8d2d\u4e70\u5b8c\u6210\uff01\u611f\u8c22\u652f\u6301 {{creatorName}} (\u4ee3\u7801: {{code}})"},paymentSuccessPage:{paymentSuccess:"\u652f\u4ed8\u6210\u529f",thankYouMessage:"\u611f\u8c22\u4f60\u7684\u8d2d\u4e70\uff01\u4f60\u53ef\u4ee5\u5173\u95ed\u6b64\u9875\u5e76\u8fd4\u56de\u6e38\u620f\u3002"},paymentCancelPage:{paymentCancelled:"\u652f\u4ed8\u5df2\u53d6\u6d88",closeTabMessage:"\u4f60\u53ef\u4ee5\u5173\u95ed\u6b64\u9875\u5e76\u8fd4\u56de\u6e38\u620f\u3002"},lootLogPanel:{lootTracker:"\u6389\u843d\u8bb0\u5f55",refresh:"\u5237\u65b0",startTime:"\u5f00\u59cb\u65f6\u95f4",duration:"\u6301\u7eed\u65f6\u95f4"},collection:{linkToChat:"\u94fe\u63a5\u5230\u804a\u5929"},achievementsPanel:{achievements:"\u6210\u5c31",collections:"\u6536\u85cf",bestiary:"\u602a\u7269\u56fe\u9274",achievementsTbd:"\u6210\u5c31 - \u656c\u8bf7\u671f\u5f85\uff01",bestiaryTbd:"\u602a\u7269\u56fe\u9274 - \u656c\u8bf7\u671f\u5f85\uff01",collectionPoints:"\u6536\u85cf\u79ef\u5206",bestiaryPoints:"\u56fe\u9274\u79ef\u5206",uniqueCollection:"\u72ec\u7279\u6536\u85cf",uniqueItems:"\u72ec\u7279\u7269\u54c1",monstersDefeated:"\u5df2\u51fb\u8d25\u602a\u7269",collected:"\u5df2\u6536\u96c6",defeated:"\u5df2\u51fb\u8d25",pointsEarned:"\u5df2\u83b7\u5f97\u79ef\u5206",enhancementSuccesses:"\u5f3a\u5316\u6210\u529f",enhancementLevel:"\u5f3a\u5316\u81f3 +{{level}}\uff1a{{count}}",tierLevel:"T{{level}} x{{count}}",showUncollected:"\u663e\u793a\u672a\u6536\u96c6\u7269\u54c1",showUndefeated:"\u663e\u793a\u672a\u51fb\u8d25\u602a\u7269",noItemsCollected:"\u8fd8\u6ca1\u6709\u6536\u96c6\u4efb\u4f55\u7269\u54c1\u3002\u5f00\u59cb\u91c7\u96c6\u3001\u5236\u4f5c\u6216\u6218\u6597\u6765\u5efa\u7acb\u4f60\u7684\u6536\u85cf\uff01",noMonstersDefeated:"\u8fd8\u6ca1\u6709\u51fb\u8d25\u4efb\u4f55\u602a\u7269\u3002\u8fdb\u5165\u6218\u6597\u5f00\u59cb\u5efa\u7acb\u4f60\u7684\u56fe\u9274\uff01",refresh:"\u5237\u65b0",milestone:"\u91cc\u7a0b\u7891",progress:"\u8fdb\u5ea6",claim:"\u9886\u53d6",completed:"\u5df2\u5b8c\u6210",showIncompleteOnly:"\u4ec5\u663e\u793a\u672a\u5b8c\u6210",loadingAchievements:"\u52a0\u8f7d\u6210\u5c31\u4e2d...",noAchievements:"\u6682\u65e0\u53ef\u7528\u6210\u5c31",noIncompleteAchievements:"\u6240\u6709\u6210\u5c31\u5df2\u5b8c\u6210\uff01\u5e72\u5f97\u597d\uff01",grantedOnSteam:"\u5df2\u5728Steam\u4e0a\u6388\u4e88",viewBuffs:"\u67e5\u770b\u589e\u76ca",achievementBuffs:"\u6210\u5c31\u589e\u76ca",noBuffsYet:"\u5b8c\u6210\u4e00\u4e2a\u7b49\u7ea7\u7684\u6240\u6709\u6210\u5c31\u5373\u53ef\u89e3\u9501\u589e\u76ca\uff01"},socialPanel:{friends:"\u670b\u53cb",referrals:"\u63a8\u8350",blockList:"\u9ed1\u540d\u5355",whisper:"\u79c1\u804a",profile:"\u8d44\u6599",confirmUnfriend:"\u786e\u8ba4\u53d6\u6d88\u597d\u53cb",unfriend:"\u53d6\u6d88\u597d\u53cb",activity:"\u6d3b\u52a8",status:"\u72b6\u6001",daysAgo:"{{days}}\u524d",online:"\u5728\u7ebf",hidden:"\u9690\u85cf",offline:"\u79bb\u7ebf",playerNamePlaceholder:"\u73a9\u5bb6\u540d\u79f0",addFriend:"\u6dfb\u52a0\u597d\u53cb",blockedPlayers:"\u5df2\u5c4f\u853d\u73a9\u5bb6",blockPlayer:"\u5c4f\u853d\u73a9\u5bb6",unblock:"\u53d6\u6d88\u5c4f\u853d",referralBonusFirstLevel:"\u63a8\u8350\u7684\u73a9\u5bb6\u8fbe\u5230\u4e86\u603b\u7b49\u7ea7 {{level}}",referralBonusPurchase:"\u63a8\u8350\u7684\u73a9\u5bb6\u8d2d\u4e70\u4e86\u725b\u94c3",reward:"\u5956\u52b1: {{quantity}}",claim:"\u9886\u53d6",referralInstructions:"\u5f53\u6709\u4eba\u4f7f\u7528\u4f60\u7684\u63a8\u8350\u94fe\u63a5\u6ce8\u518c\u65f6\uff0c\u4f60\u5c06\u6709\u8d44\u683c\u83b7\u5f97\u4ee5\u4e0b\u5956\u52b1:",referralInstructionBullets:"<ul><li>\u83b7\u5f97 {{firstLevelCowbells}}<cowbellIcon />\u5982\u679c\u63a8\u8350\u7684\u73a9\u5bb6\u8fbe\u5230\u603b\u7b49\u7ea7 {{firstTotalLevel}}\u3002</li><li>\u989d\u5916\u83b7\u5f97 {{secondLevelCowbells}}<cowbellIcon />\u5982\u679c\u73a9\u5bb6\u8fbe\u5230\u603b\u7b49\u7ea7 {{secondTotalLevel}}\u3002</li><li>\u73a9\u5bb6\u8d2d\u4e70\u7684\u4efb\u4f55\u725b\u94c3\u7684 {{purchaseCowbellPercent}}\u3002</li></ul>",referralLinkCopied:"\u94fe\u63a5\u5df2\u590d\u5236",copyLink:"\u590d\u5236\u94fe\u63a5",referralCount:"\u5230\u76ee\u524d\u4e3a\u6b62\uff0c\u5df2\u6709 <span>{{count}}</span> \u540d\u73a9\u5bb6\u901a\u8fc7\u4f60\u7684\u63a8\u8350\u94fe\u63a5\u6ce8\u518c",socialTitle:"\u793e\u4ea4"},guildPanel:{overview:"\u6982\u89c8",members:"\u6210\u5458",manage:"\u7ba1\u7406",nameLengthError:"\u540d\u79f0\u5fc5\u987b\u4e3a{{minLength}}-{{maxLength}}\u4e2a\u5b57\u7b26",nameContentError:"\u540d\u79f0\u53ea\u80fd\u5305\u542b\u5b57\u6bcd\u3001\u6570\u5b57\u548c\u5355\u4e2a\u7a7a\u683c",confirmDisband:"\u4f60\u786e\u5b9a\u8981\u89e3\u6563\u516c\u4f1a\u5417\uff1f",confirmLeave:"\u4f60\u786e\u5b9a\u8981\u79bb\u5f00\u516c\u4f1a\u5417\uff1f",guildInvitation:"\u516c\u4f1a\u9080\u8bf7:",invitedBy:"\u9080\u8bf7\u8005:",decline:"\u62d2\u7edd",join:"\u52a0\u5165",createGuildInstructions:"\u4f60\u53ef\u4ee5\u82b1\u8d395M\u91d1\u5e01\u521b\u5efa\u4e00\u4e2a\u516c\u4f1a\u3002\u516c\u4f1a\u76ee\u524d\u63d0\u4f9b\u4ee5\u4e0b\u529f\u80fd:",createGuildInfoBullets:"<ul><li>\u516c\u4f1a\u804a\u5929\u9891\u9053\u548c\u516c\u544a\u677f\u3002</li><li>\u5f53\u6210\u5458\u5728\u4efb\u4f55\u4e13\u4e1a\u83b7\u5f97\u7ecf\u9a8c\u65f6\u516c\u4f1a\u4e5f\u5c06\u83b7\u5f97\u7ecf\u9a8c\u5e76\u53ef\u5347\u7ea7\uff0c\u7ecf\u9a8c\u6bd4\u4f8b\u4e3a1:1000\u3002</li><li>{{defaultSlots}} \u4e2a\u6210\u5458\u69fd\u4f4d\uff0c\u6bcf{{levelsPerSlot}}\u7ea7\u516c\u4f1a\u7b49\u7ea7\u589e\u52a01\u4e2a\u989d\u5916\u69fd\u4f4d\u3002</li><li>\u53ef\u4ee5\u5206\u914d\u89d2\u8272: \u4f1a\u957f\u3001\u5c06\u519b\u3001\u5b98\u5458\u3001\u4f1a\u5458\u3002</li></ul>",cost5m:"\u8d39\u7528: 5,000,000",guildNamePlaceholder:"\u516c\u4f1a\u540d\u79f0",createGuild:"\u521b\u5efa\u516c\u4f1a",joinGuildInfo:"\u4f60\u4e5f\u53ef\u4ee5\u88ab\u9080\u8bf7\u52a0\u5165\u73b0\u6709\u516c\u4f1a\u3002\u4f7f\u7528\u62db\u52df\u804a\u5929\u9891\u9053\u5bfb\u627e\u8981\u52a0\u5165\u7684\u516c\u4f1a\u3002\u6536\u5230\u7684\u9080\u8bf7\u5c06\u663e\u793a\u5728\u4e0b\u65b9\u3002",save:"\u4fdd\u5b58",edit:"\u4fee\u6539",guildLevel:"\u516c\u4f1a\u7b49\u7ea7",guildExperience:"\u516c\u4f1a\u7ecf\u9a8c",expToLevelUp:"\u5347\u7ea7\u6240\u9700\u7ecf\u9a8c",guildMembers:"\u516c\u4f1a\u6210\u5458",whisper:"\u79c1\u804a",profile:"\u8d44\u6599",confirmGiveLead:"\u786e\u8ba4\u8f6c\u8ba9\u4f1a\u957f",giveLeadership:"\u8f6c\u8ba9\u4f1a\u957f",promote:"\u63d0\u5347",demote:"\u964d\u7ea7",cancelInvite:"\u53d6\u6d88\u9080\u8bf7",confirmKick:"\u786e\u8ba4\u8e22\u51fa",kick:"\u8e22\u51fa",playerNamePlaceholder:"\u73a9\u5bb6\u540d\u79f0",inviteToGuild:"\u9080\u8bf7\u52a0\u5165\u516c\u4f1a",membersHeader:"\u6210\u5458 ({{currentCount}}/{{maxCount}})",role:"\u804c\u4f4d",guildExp:"\u516c\u4f1a\u7ecf\u9a8c",activity:"\u6d3b\u52a8",status:"\u72b6\u6001",invited:"\u5df2\u9080\u8bf7",daysAgo:"{{days}}\u524d",online:"\u5728\u7ebf",hidden:"\u9690\u85cf",offline:"\u79bb\u7ebf",disbandInstructions:"\u5982\u679c\u6ca1\u6709\u5176\u4ed6\u6210\u5458\u6216\u9080\u8bf7\uff0c\u4f60\u53ef\u4ee5\u89e3\u6563\u516c\u4f1a\u3002",disbandGuild:"\u89e3\u6563\u516c\u4f1a",leaveInstructions:"\u4f60\u53ef\u4ee5\u79bb\u5f00\u516c\u4f1a\u3002\u79bb\u5f00\u516c\u4f1a\u6ca1\u6709\u4efb\u4f55\u60e9\u7f5a\u3002",leaveGuild:"\u79bb\u5f00\u516c\u4f1a",guild:"\u516c\u4f1a"},leaderboardPanel:{leaderboard:"\u6392\u884c\u699c",noPlayers:"\u6ca1\u6709\u73a9\u5bb6\u8fbe\u5230\u6b64\u6392\u884c\u699c\u7684\u6700\u4f4e\u6807\u51c6\u3002",updatesNote:"\u6bcf20\u5206\u949f\u66f4\u65b0\u4e00\u6b21",rank:"\u6392\u540d",name:"\u540d\u79f0",level:"\u7b49\u7ea7",experience:"\u7ecf\u9a8c",points:"\u79ef\u5206",taskPoints:"\u4efb\u52a1\u79ef\u5206",famePoints:"\u540d\u8a89\u79ef\u5206",collectionPoints:"\u6536\u85cf\u79ef\u5206",bestiaryPoints:"\u56fe\u9274\u79ef\u5206",labyrinthPoints:"\u8ff7\u5bab\u79ef\u5206",floor:"\u5c42\u6570",rooms:"\u623f\u95f4\u6570"},leaderboardTypeNames:{standard:"\u6807\u51c6",ironcow:"\u94c1\u725b",legacy_ironcow:"\u4f20\u7edf\u94c1\u725b",steam_standard:"\u6807\u51c6 (Steam)",steam_ironcow:"\u94c1\u725b (Steam)",guild:"\u516c\u4f1a"},leaderboardCategoryNames:{total_level:"\u603b\u7b49\u7ea7",milking:"\u6324\u5976",foraging:"\u91c7\u96c6",woodcutting:"\u4f10\u6728",cheesesmithing:"\u829d\u58eb\u953b\u9020",crafting:"\u5236\u4f5c",tailoring:"\u88c1\u7f1d",cooking:"\u70f9\u996a",brewing:"\u917f\u9020",alchemy:"\u70bc\u91d1",enhancing:"\u5f3a\u5316",stamina:"\u8010\u529b",intelligence:"\u667a\u529b",attack:"\u653b\u51fb",defense:"\u9632\u5fa1",melee:"\u8fd1\u6218",ranged:"\u8fdc\u7a0b",magic:"\u9b54\u6cd5",task_points:"\u4efb\u52a1\u79ef\u5206",labyrinth_points:"\u8ff7\u5bab\u79ef\u5206",labyrinth_depth:"\u8ff7\u5bab\u6df1\u5ea6",collection_points:"\u6536\u85cf\u79ef\u5206",bestiary_points:"\u56fe\u9274\u79ef\u5206",fame_points:"\u540d\u8a89\u79ef\u5206",guild:"\u516c\u4f1a"},moderatorPanel:{reportedFor:"\u88ab\u4e3e\u62a5: "},settingsPanel:{settings:"\u8bbe\u7f6e",profile:"\u4e2a\u4eba\u8d44\u6599",game:"\u6e38\u620f",account:"\u8d26\u6237",show:"\u663e\u793a",hide:"\u9690\u85cf",off:"\u5173\u95ed",enabled:"\u542f\u7528",disabled:"\u7981\u7528",on:"\u5f00",public:"\u516c\u5f00",friendsGuildmates:"\u597d\u53cb/\u516c\u4f1a\u6210\u5458",private:"\u9690\u85cf",partyMembersOnly:"\u4ec5\u9650\u961f\u5458",emailEmpty:"\u7535\u5b50\u90ae\u4ef6\u4e0d\u80fd\u4e3a\u7a7a",validEmail:"\u8bf7\u8f93\u5165\u6709\u6548\u7684\u7535\u5b50\u90ae\u4ef6",currentPassword:"\u8bf7\u8f93\u5165\u4f60\u7684\u5f53\u524d\u5bc6\u7801",passwordLength:"\u5bc6\u7801\u81f3\u5c11\u4e3a6\u4e2a\u5b57\u7b26",confirmPassword:"\u786e\u8ba4\u5bc6\u7801\u4e0d\u5339\u914d",noneOwned:"\u6ca1\u6709",unlock:"\u89e3\u9501",unlockMoreAvatars:"\u89e3\u9501\u66f4\u591a\u89d2\u8272\u5f62\u8c61",unlockMoreOutfits:"\u89e3\u9501\u66f4\u591a\u670d\u88c5",setSkillLevel:"\u66f4\u6539\u4e13\u4e1a\u7b49\u7ea7",selectSkill:"\u9009\u62e9\u4e13\u4e1a",setLevel:"\u66f4\u6539\u7b49\u7ea7",setSkillLevelRequirement:"\u4f60\u9700\u8981\u81f3\u5c11 {{chatMinLevel}} \u603b\u7b49\u7ea7\u624d\u80fd\u66f4\u6539\u4e13\u4e1a\u7b49\u7ea7",refillLabyrinthEntries:"\u8865\u5145\u8ff7\u5bab\u5165\u573a\u5238",refillEntries:"\u8865\u5145\u5165\u573a\u5238",refillEntriesCooldown:"(3\u5c0f\u65f6\u51b7\u5374)",refillEntriesReady:"\u53ef\u7528",preview:"\u9884\u89c8:",viewProfile:"\u67e5\u770b\u6211\u7684\u8d44\u6599",chatIcon:"\u804a\u5929\u56fe\u6807:",nameColor:"\u540d\u79f0\u989c\u8272:",avatar:"\u89d2\u8272\u5f62\u8c61:",avatarOutfit:"\u89d2\u8272\u670d\u88c5:",onlineStatus:"\u5728\u7ebf\u72b6\u6001:",equipment:"\u88c5\u5907:",deleteCharacter:"\u5220\u9664\u89d2\u8272",deleteCharacterTimeLimit:"\u521b\u5efa\u540e10\u5c0f\u65f6\u5185\u65e0\u6cd5\u5220\u9664",showDeletionInstructions:"\u663e\u793a\u5220\u9664\u8bf4\u660e",deleteCharacterInstructions:'\u6309\u7167\u8bf4\u660e\u6c38\u4e45\u5220\u9664\u6b64\u89d2\u8272 "{{name}}"\u3002\u5220\u9664\u540e\u65e0\u6cd5\u64a4\u9500\u3002\u4f60\u5fc5\u987b\u5148\u9000\u51fa\u961f\u4f0d\u548c\u516c\u4f1a\uff0c\u7136\u540e\u8f93\u5165\u89d2\u8272\u7684\u786e\u5207\u540d\u79f0\u4ee5\u786e\u8ba4\u5220\u9664\u3002',characterName:"\u89d2\u8272\u540d\u79f0:",deleteCharacterCaps:"\u5220\u9664\u89d2\u8272",gameMode:"\u6e38\u620f\u6a21\u5f0f:",mooPass:"\u54de\u5361:",inactive:"\u672a\u6fc0\u6d3b",offlineProgress:"\u79bb\u7ebf\u8fdb\u5ea6:",hours:"\u5c0f\u65f6",upgrade:"\u5347\u7ea7",marketListing:"\u5e02\u573a\u6302\u724c:",listings:"\u6302\u724c",actionQueue:"\u884c\u52a8\u961f\u5217:",actions:"\u884c\u52a8",loadoutSlot:"\u914d\u88c5\u69fd\u4f4d:",slots:"\u69fd\u4f4d",taskSlots:"\u4efb\u52a1\u69fd\u4f4d:",tasks:"\u4efb\u52a1",labyrinthRoomPath:"\u8ff7\u5bab\u8def\u5f84:",rooms:"\u623f\u95f4",startNowBehavior:"\u7acb\u5373\u5f00\u59cb\u6a21\u5f0f:",startNowReplaceQueue:"\u66ff\u6362\u961f\u5217",startNowInsertToFront:"\u63d2\u5165\u961f\u9996",displayLanguage:"\u663e\u793a\u8bed\u8a00:",generalChat:"\u82f1\u8bed\u804a\u5929:",nonEnglishChat:"\u975e\u82f1\u8bed\u804a\u5929:",ironcowChat:"\u94c1\u725b\u804a\u5929:",tradeChat:"\u4ea4\u6613\u804a\u5929:",recruitChat:"\u62db\u52df\u804a\u5929:",beginnerChat:"\u65b0\u624b\u804a\u5929:",communityBuffMessage:"\u793e\u533a\u589e\u76ca\u6d88\u606f:",profanityFilter:"\u5c4f\u853d\u4e0d\u826f\u8bed\u8a00:",chatURLWarning:"\u804a\u5929URL\u786e\u8ba4:",cssAnimation:"CSS\u52a8\u753b:",name:"\u540d\u79f0:",accountType:"\u8d26\u6237\u7c7b\u578b:",guest:"\u6e38\u5ba2",registeredUser:"\u6ce8\u518c\u7528\u6237",guestPassword:"\u6e38\u5ba2\u5bc6\u7801:",kongregateId:"Kongregate ID:",steamId:"Steam ID:",currentPasswordLabel:"\u5f53\u524d\u5bc6\u7801:",emailLabel:"\u7535\u5b50\u90ae\u4ef6:",newPassword:"\u65b0\u5bc6\u7801",confirmPasswordLabel:"\u786e\u8ba4\u5bc6\u7801",update:"\u66f4\u65b0",registerEmailPassword:"\u6ce8\u518c\u7535\u5b50\u90ae\u4ef6/\u5bc6\u7801",notifications:"\u901a\u77e5",notificationsLabel:"\u901a\u77e5:",notificationsUnsupported:"\u6b64\u6d4f\u89c8\u5668\u4e0d\u652f\u6301",enableNotifications:"\u542f\u7528\u901a\u77e5",disableNotifications:"\u505c\u7528\u901a\u77e5",whenToNotify:"\u4f55\u65f6\u901a\u77e5:",whenWindowInactive:"\u7a97\u53e3\u975e\u6d3b\u52a8\u65f6",always:"\u59cb\u7ec8",notifyIdle:"\u89d2\u8272\u95f2\u7f6e:",notifyWhisper:"\u6536\u5230\u79c1\u804a:",notifyMarketFilled:"\u5e02\u573a\u6302\u5355\u6210\u4ea4:",notifyAchievement:"\u6210\u5c31\u5b8c\u6210:",notifyParty:"\u961f\u4f0d\u5f00\u59cb/\u505c\u6b62:",notifySkillLevelUp:"\u6280\u80fd\u5347\u7ea7:"},browserNotifications:{idleTitle:"\u89d2\u8272\u95f2\u7f6e",idleBody:"\u884c\u52a8\u961f\u5217\u5df2\u7a7a\u3002",whisperTitle:"\u6536\u5230\u79c1\u804a",whisperBody:"\u6765\u81ea {{name}}: {{message}}",marketFilledTitle:"\u5e02\u573a\u6302\u5355\u6210\u4ea4",marketFilledBodySold:"\u5356\u51fa {{quantity}} {{itemName}}",marketFilledBodyBought:"\u4e70\u5165 {{quantity}} {{itemName}}",skillLevelUpTitle:"\u6280\u80fd\u5347\u7ea7",skillLevelUpBody:"{{skillName}} \u73b0\u5728 {{level}} \u7ea7!",achievementTitle:"\u6210\u5c31\u5b8c\u6210",partyStartedTitle:"\u961f\u4f0d\u6218\u6597\u5f00\u59cb",partyStartedBody:"\u4f60\u7684\u961f\u4f0d\u5f00\u59cb\u6218\u6597\u4e86\u3002",partyStoppedTitle:"\u961f\u4f0d\u6218\u6597\u505c\u6b62",partyStoppedBody:"\u4f60\u7684\u961f\u4f0d\u5df2\u505c\u6b62\u6218\u6597\u3002"},chat:{generalTip:"\u63d0\u793a: \u82f1\u8bed\u9891\u9053\u4ec5\u9650\u82f1\u8bed\u8fdb\u884c\u6e38\u620f\u8ba8\u8bba\u548c\u53cb\u597d\u4ea4\u6d41\u3002\u4e3a\u4fdd\u6301\u79ef\u6781\u548c\u76f8\u4e92\u5c0a\u91cd\u7684\u6c14\u6c1b\uff0c\u8bf7\u9075\u5b88<gameRulesLink>\u6e38\u620f\u89c4\u5219</gameRulesLink>\u3002",tradeTip:"\u63d0\u793a: \u8d38\u6613\u9891\u9053\u7528\u4e8e\u5ba3\u4f20\u7269\u54c1\u4ea4\u6613\u548c\u670d\u52a1\u3002\u8bf7\u4f7f\u7528\u79c1\u804a\u8fdb\u884c\u5bf9\u8bdd\u548c\u8c08\u5224\u3002",recruitTip:"\u63d0\u793a: \u62db\u52df\u9891\u9053\u7528\u4e8e\u5ba3\u4f20\u516c\u4f1a/\u961f\u4f0d\u62db\u52df\u548c\u5bfb\u627e\u52a0\u5165\u516c\u4f1a/\u961f\u4f0d\u7684\u73a9\u5bb6\u3002\u8bf7\u4f7f\u7528\u79c1\u804a\u8fdb\u884c\u5bf9\u8bdd\u3002",beginnerTip:"\u63d0\u793a: \u6b22\u8fce\u5728\u6b64\u63d0\u95ee\u6216\u4e0e\u5176\u4ed6\u73a9\u5bb6\u804a\u5929\u3002\u5b9e\u7528\u94fe\u63a5: <gameGuideLink>\u6e38\u620f\u6307\u5357</gameGuideLink>\u548c<gameRulesLink>\u6e38\u620f\u89c4\u5219</gameRulesLink>\u3002",whisperTip:'\u63d0\u793a: \u4f60\u53ef\u4ee5\u4f7f\u7528\u547d\u4ee4"/w [\u73a9\u5bb6\u540d] [\u6d88\u606f]"\u4e0e\u5176\u4ed6\u73a9\u5bb6\u79c1\u804a\uff0c\u6216\u70b9\u51fb\u73a9\u5bb6\u7684\u540d\u79f0\u5e76\u9009\u62e9\u79c1\u804a\u3002',useWhisperCommand:"\u4f7f\u7528 /w \u547d\u4ee4",needPlayerName:"\u9700\u8981\u73a9\u5bb6\u540d",emptyMessage:"\u6d88\u606f\u4e3a\u7a7a",invalidCommand:"\u65e0\u6548\u547d\u4ee4",useTradeChannel:"\u8bf7\u4f7f\u7528\u4ea4\u6613\u9891\u9053",useRecruitChannel:"\u8bf7\u4f7f\u7528\u62db\u52df\u9891\u9053",mutedMessage:"\u7981\u8a00\u81f3 {{muteExpireTime}}\u3002{{muteReason}}",generalChatRestriction:"\u4f60\u9700\u8981\u81f3\u5c11 {{generalChatMinLevel}} \u603b\u7b49\u7ea7\u6216 {{generalChatMinExp}} \u603b\u7ecf\u9a8c\u624d\u80fd\u4f7f\u7528\u82f1\u8bed\u804a\u5929",chatRestriction:"\u4f60\u9700\u8981\u81f3\u5c11 {{chatMinLevel}} \u603b\u7b49\u7ea7\u624d\u80fd\u804a\u5929",enterMessagePlaceholder:"\u8f93\u5165\u6d88\u606f...",sendButton:"\u53d1\u9001",reportChatMessage:"\u4e3e\u62a5\u804a\u5929\u6d88\u606f",reportInstructions:"\u4e3e\u62a5\u4e25\u91cd\u7684\u804a\u5929\u5e72\u6270\u6216\u8fdd\u89c4\u884c\u4e3a\u3002\u5bf9\u4e8e\u4e2a\u4eba\u95f4\u7684\u5c0f\u4e89\u6267\uff0c\u8bf7\u4f7f\u7528\u5c4f\u853d\u529f\u80fd\u3002",reportReason:"\u4e3e\u62a5\u539f\u56e0:",submitReport:"\u63d0\u4ea4\u4e3e\u62a5",reportType:{selectReason:"\u9009\u62e9\u4e3e\u62a5\u539f\u56e0",harassmentMe:"\u9a9a\u6270\u6211",harassmentOthers:"\u9a9a\u6270\u4ed6\u4eba",offensiveLanguage:"\u5192\u72af\u6027\u8bed\u8a00",illegalViolentSexual:"\u975e\u6cd5/\u66b4\u529b/\u6027\u5185\u5bb9",controversialTopics:"\u654f\u611f\u8bdd\u9898",excessiveDrama:"\u8fc7\u5ea6\u95f9\u4e8b/\u7eb7\u4e89",spam:"\u6076\u610f\u5237\u5c4f/\u5783\u573e\u4fe1\u606f",encouragingRuleBreaking:"\u9f13\u52b1\u8fdd\u53cd\u89c4\u5219",personalInformation:"\u6cc4\u9732\u4e2a\u4eba\u4fe1\u606f",wrongChannel:"\u9519\u8bef\u9891\u9053",cheating:"\u4f5c\u5f0a",underage:"\u672a\u6ee113\u5c81",inappropriateName:"\u4e0d\u5f53\u540d\u79f0",other:"\u5176\u4ed6"},reportTypeDescription:{harassmentMe:"\u9488\u5bf9\u6211\u7684\u4eba\u8eab\u653b\u51fb\u6216\u4e25\u91cd\u9a9a\u6270\u3002",harassmentOthers:"\u9488\u5bf9\u5176\u4ed6\u73a9\u5bb6\u7684\u4eba\u8eab\u653b\u51fb\u6216\u4e25\u91cd\u9a9a\u6270\u3002",offensiveLanguage:"\u4f7f\u7528\u5192\u72af\u6027\u6216\u4e0d\u5f53\u8bed\u8a00\u3002",illegalViolentSexual:"\u5305\u542b\u975e\u6cd5\u3001\u8fc7\u5ea6\u66b4\u529b\u6216\u6027\u5185\u5bb9\u7684\u6d88\u606f\u3001\u8ba8\u8bba\u6216\u94fe\u63a5\u3002",controversialTopics:"\u654f\u611f\u8bdd\u9898\uff0c\u5982\u653f\u6cbb\u3001\u5b97\u6559\u3001\u56fd\u9645\u51b2\u7a81\u3001\u6027\u522b\u8ba8\u8bba\u3001\u6027\u53d6\u5411\u3001\u7981\u8a00/\u5c01\u7981\u6295\u8bc9\u7b49\uff0c\u4ee5\u53ca\u5176\u4ed6\u5bb9\u6613\u5f15\u53d1\u7eb7\u4e89\u7684\u8bdd\u9898\u3002",excessiveDrama:"\u84c4\u610f\u5e26\u8282\u594f\u6216\u717d\u52a8\u6027\u8a00\u8bba\uff0c\u5e72\u6270\u804a\u5929\u79e9\u5e8f\u3002",spam:"\u4e00\u4e2a\u73a9\u5bb6\u9891\u7e41\u53d1\u9001\u91cd\u590d\u6216\u65e0\u610f\u4e49\u6d88\u606f\u6216\u7d22\u8981\u514d\u8d39\u7269\u54c1\u3002(\u591a\u540d\u73a9\u5bb6\u53d1\u9001\u7c7b\u4f3c\u6d88\u606f\u662f\u5141\u8bb8\u7684)",encouragingRuleBreaking:"\u9f13\u52b1\u6216\u8bef\u5bfc\u5176\u4ed6\u73a9\u5bb6\u8fdd\u53cd\u6e38\u620f\u89c4\u5219\u3002",personalInformation:"\u6cc4\u9732\u81ea\u5df1\u6216\u5176\u4ed6\u73a9\u5bb6\u672a\u516c\u5f00\u7684\u4e2a\u4eba\u8eab\u4efd\u4fe1\u606f\u3002",wrongChannel:"\u591a\u6b21\u5728\u9519\u8bef\u7684\u9891\u9053\u53d1\u9001\u6d88\u606f\u3002",cheating:"\u81ea\u79f0\u4f5c\u5f0a\u884c\u4e3a\uff0c\u5305\u62ec\u591a\u8d26\u53f7\u3001\u8d22\u5bcc\u8f6c\u79fb\u3001\u7ebf\u5916\u4ea4\u6613\u3001\u975e\u6cd5\u811a\u672c\u6216\u6f0f\u6d1e\u5229\u7528\u3002",underage:"\u81ea\u79f0\u672a\u6ee113\u5c81\u3002",inappropriateName:"\u4e0d\u5f53\u7684\u89d2\u8272\u540d\u79f0\u3002",other:"\u5176\u4ed6\u672a\u6db5\u76d6\u7684\u95ee\u9898\u3002"}},chatMessage:{whisper:"\u79c1\u804a",mention:"\u63d0\u53ca",profile:"\u73a9\u5bb6\u8d44\u6599",addFriend:"\u52a0\u597d\u53cb",confirmBlock:"\u786e\u8ba4\u5c4f\u853d",block:"\u5c4f\u853d",report:"\u4e3e\u62a5",modInspect:"\u7ba1\u7406\u5458\u68c0\u67e5",undeleteMsg:"\u6062\u590d\u6d88\u606f",deleteMsg:"\u5220\u9664\u6d88\u606f",warn:"\u8b66\u544a",mute:"\u7981\u8a00",moderator:"\u7ba1\u7406\u5458",privateModeratorTo:"(\u79c1\u5bc6) \u7ba1\u7406\u5458\u5bf9{{receiverName}}\u8bf4",toPlayer:"\u5bf9{{receiverName}}\u8bf4",messageDeleted:"\u6d88\u606f\u5df2\u5220\u9664"},characterName:{customIcon:"\u5b9a\u5236\u56fe\u6807"},textWithLinks:{externalLinkWarning:"\u4f60\u786e\u5b9a\u8981\u6253\u5f00\u5916\u90e8\u94fe\u63a5\u5417\uff1f"},characterManagement:{inventory:"\u5e93\u5b58",equipment:"\u88c5\u5907",abilities:"\u6280\u80fd",house:"\u623f\u5c4b",loadouts:"\u914d\u88c5"},inventory:{openedLootHeader:"\u6253\u5f00\u7684\u6218\u5229\u54c1",foundItemsLabel:"\u4f60\u627e\u5230\u4e86",grantedBuffsLabel:"\u83b7\u5f97\u589e\u76ca:",closeButton:"\u5173\u95ed",itemFilterPlaceholder:"\u7269\u54c1\u641c\u7d22"},equipmentPanel:{title:"\u88c5\u5907",viewStats:"\u67e5\u770b\u5c5e\u6027",combatStats:"\u6218\u6597\u5c5e\u6027",nonCombatStats:"\u751f\u6d3b\u5c5e\u6027"},abilitiesPanel:{title:"\u6280\u80fd",abilitySlotsLabel:"\u6280\u80fd\u69fd\u4f4d",learnedAbilitiesLabel:"\u5df2\u5b66\u6280\u80fd"},housePanel:{house:"\u623f\u5c4b",houseBuffs:"\u623f\u5c4b\u589e\u76ca",allSkills:"\u6240\u6709\u884c\u52a8",none:"\u65e0",notBuilt:"\u672a\u5efa\u9020",level:"{{level}} \u7ea7",max:"\u6700\u5927",constructionCosts:"\u5efa\u9020\u8d39\u7528",build:"\u5efa\u9020",viewBuffs:"\u67e5\u770b\u589e\u76ca",actionBuff:"{{action}}\u589e\u76ca",allSkillBuffs:"\u6240\u6709\u884c\u52a8\u589e\u76ca"},loadoutPanel:{allSkills:"\u6240\u6709\u884c\u52a8",newLoadout:"\u65b0\u914d\u88c5",createLoadout:"\u521b\u5efa\u914d\u88c5",loadoutCount:"{{count}} / {{max}} \u914d\u88c5",upgradeCapacity:"\u5347\u7ea7\u5bb9\u91cf",loadouts:"\u914d\u88c5",viewAllLoadouts:"\u67e5\u770b\u6240\u6709\u914d\u88c5",deleteLoadout:"\u5220\u9664\u914d\u88c5",confirmDeleteLoadout:"\u4f60\u786e\u5b9a\u8981\u5220\u9664\u6b64\u914d\u88c5\u5417\uff1f",name:"\u540d\u79f0",edit:"\u4fee\u6539",save:"\u4fdd\u5b58",setDefault:"\u8bbe\u4e3a{{actionTypeName}}\u7684\u9ed8\u8ba4\u914d\u88c5",suppressValidation:"\u7f3a\u5931\u7269\u54c1\u65f6\u4e0d\u8981\u63d0\u9192",useHighestEnhancement:"\u4f7f\u7528\u6700\u9ad8\u5f3a\u5316\u7b49\u7ea7",importCurrentSetup:"\u5bfc\u5165\u5f53\u524d\u914d\u7f6e",confirmImportCurrentSetup:"\u4f60\u786e\u5b9a\u8981\u5bfc\u5165\u4f60\u5f53\u524d\u914d\u7f6e\u5417\uff1f\u8fd9\u5c06\u8986\u76d6\u73b0\u6709\u7684\u914d\u88c5\u3002",equipLoadout:"\u88c5\u5907\u914d\u88c5",equipment:"\u88c5\u5907",abilities:"\u6280\u80fd",consumables:"\u6d88\u8017\u54c1"},offlineProgressModal:{welcomeBack:"\u6b22\u8fce\u56de\u6765\uff01",offlineDuration:"\u79bb\u7ebf\u65f6\u95f4",progressDuration:"\u8fdb\u5c55\u65f6\u95f4",upgrade:"\u5347\u7ea7",itemsGained:"\u83b7\u5f97\u7269\u54c1",experienceGained:"\u83b7\u5f97\u7ecf\u9a8c",itemsConsumed:"\u6d88\u8017\u7269\u54c1",close:"\u5173\u95ed"},sharableProfile:{overview:"\u6982\u89c8",skills:"\u4e13\u4e1a",equipment:"\u88c5\u5907",house:"\u623f\u5c4b",achieve:"\u6210\u5c31\u5b8c\u6210",guildRole:"{{guildName}} {{role}}",online:"\u5728\u7ebf",offline:"\u79bb\u7ebf",totalExperience:"\u603b\u7ecf\u9a8c: {{experience}}",totalLevel:"\u603b\u7b49\u7ea7: {{level}}",totalLevelLabel:"\u603b\u7b49\u7ea7",combatLevel:"\u6218\u6597\u7b49\u7ea7: {{level}}",combatLevelLabel:"\u6218\u6597\u7b49\u7ea7",age:"\u5e74\u9f84: {{age}}",ageLabel:"\u5e74\u9f84",level:"{{level}} \u7ea7",achievementsCompleted:"\u6210\u5c31",taskPoints:"\u4efb\u52a1\u79ef\u5206",labyrinthPoints:"\u8ff7\u5bab\u79ef\u5206",labyrinthHighestFloor:"\u6700\u9ad8\u5c42\u6570",labyrinthHighestFloorValue:"\u7b2c{{floor}}\u5c42 ({{rooms}}\u623f\u95f4)",collectionPoints:"\u6536\u85cf\u70b9\u6570",bestiaryPoints:"\u56fe\u9274\u70b9\u6570",famePoints:"\u540d\u8a89\u79ef\u5206",noCompletedAchievements:"\u6b64\u7b49\u7ea7\u672a\u5b8c\u6210\u4efb\u4f55\u6210\u5c31",close:"\u5173\u95ed"},skill:{level:"\u7b49\u7ea7: {{level}}",totalExperience:"\u603b\u7ecf\u9a8c: {{totalExperience}}",expToLevelUp:"\u5347\u7ea7\u6240\u9700\u7ecf\u9a8c: {{remainingExperience}}"},item:{all:"\u5168\u90e8",learn:"\u5b66\u4e60",levelNotMet:"(\u7b49\u7ea7\u672a\u8fbe\u5230)",cannotDuringCombat:"(\u6218\u6597\u4e2d\u65e0\u6cd5\u4f7f\u7528)",newAbility:"(\u65b0\u6280\u80fd)",gainXP:"(+{{count}} XP)",equip:"\u88c5\u5907",enhance:"\u5f3a\u5316",alchemize:"\u70bc\u91d1",openLoot:"\u6253\u5f00 {{count}} \u4e2a",openLootWithKeys:"\u6253\u5f00 {{count}} \u4e2a (\u94a5\u5319: {{keyCount}})",viewMarketplace:"\u524d\u5f80\u5e02\u573a",viewCowbellStore:"\u524d\u5f80\u725b\u94c3\u5546\u5e97",linkToChat:"\u94fe\u63a5\u5230\u804a\u5929\u9891\u9053",openItemDictionary:"\u6253\u5f00\u7269\u54c1\u8bcd\u5178",sellFor:"\u5356\u51fa {{count}} \u91d1\u5e01",confirmSellFor:"\u786e\u8ba4\u5356\u51fa {{count}} \u91d1\u5e01"},itemTooltipText:{amount:"\u6570\u91cf: {{amount}}",sellPrice:"\u5546\u4eba\u4ef7\u683c: {{price}}",openHotkeyHint:"\u6253\u5f00 - [\u53f3\u952e\u70b9\u51fb]",abilityBookType:"\u7c7b\u578b: \u6280\u80fd\u4e66",requiresLevel:"\u9700\u8981: {{level}} \u7ea7{{skill}}",abilityExpPerBook:"\u6bcf\u672c\u4e66\u6280\u80fd\u7ecf\u9a8c: {{exp}} ",learnHotkeyHint:"\u5b66\u4e60 - [\u53f3\u952e\u70b9\u51fb]",equipmentType:"\u7c7b\u578b: {{type}}",equipHotkeyHint:"\u88c5\u5907 - [\u53f3\u952e\u70b9\u51fb]",consumableType:"\u7c7b\u578b: \u6d88\u8017\u54c1",scrollType:"\u7c7b\u578b: \u5377\u8f74",usableIn:"\u53ef\u7528\u4e8e: ",cooldownInCombat:"\u51b7\u5374 (\u6218\u6597\u4e2d): {{seconds}}s",hpRestore:"HP\u6062\u590d: {{amount}}HP",mpRestore:"MP\u6062\u590d: {{amount}}MP",overDuration:"\u6301\u7eed {{duration}}"},equipmentStatsText:{weaken:"\u524a\u5f31: \u88ab\u654c\u4eba\u653b\u51fb\u65f6\uff0c\u964d\u4f4e\u654c\u4eba{{value}}\u4f24\u5bb3\uff0c\u6301\u7eed15\u79d2\uff0c\u6700\u591a\u53e0\u52a05\u6b21\u3002",fury:"\u72c2\u6012: \u547d\u4e2d\u654c\u4eba\u65f6\uff0c\u589e\u52a0{{value}}\u7cbe\u51c6\u5ea6\u548c\u4f24\u5bb3\uff0c\u6301\u7eed15\u79d2\uff0c\u6700\u591a\u53e0\u52a05\u6b21\u3002\u672a\u547d\u4e2d\u65f6\u5931\u53bb\u4e00\u534a\u53e0\u52a0\u5c42\u3002",parry:"\u683c\u6321: {{value}}\u51e0\u7387\u683c\u6321\u654c\u4eba\u7684\u653b\u51fb\uff0c\u907f\u514d\u4f24\u5bb3\u5e76\u7acb\u5373\u81ea\u52a8\u653b\u51fb\u4e00\u6b21\u3002\u53ef\u683c\u6321\u9488\u5bf9\u961f\u53cb\u7684\u653b\u51fb\u3002",mayhem:"\u66b4\u4e71: \u5728\u81ea\u52a8\u653b\u51fb\u672a\u547d\u4e2d\u65f6\uff0c\u6709{{value}}\u51e0\u7387\u81ea\u52a8\u653b\u51fb\u4e0b\u4e00\u4e2a\u654c\u4eba\uff0c\u53ef\u591a\u6b21\u8fde\u7eed\u89e6\u53d1\u3002",pierce:"\u7a7f\u900f: \u5728\u81ea\u52a8\u653b\u51fb\u547d\u4e2d\u540e\uff0c\u6709{{value}}\u51e0\u7387\u81ea\u52a8\u653b\u51fb\u4e0b\u4e00\u4e2a\u654c\u4eba\uff0c\u53ef\u591a\u6b21\u8fde\u7eed\u89e6\u53d1\u3002",curse:"\u8bc5\u5492: \u547d\u4e2d\u654c\u4eba\u65f6\uff0c\u4f7f\u5176\u53d7\u5230\u7684\u4f24\u5bb3\u589e\u52a0{{value}}\uff0c\u6301\u7eed15\u79d2\uff0c\u6700\u591a\u53e0\u52a05\u6b21\u3002",ripple:"\u6d9f\u6f2a: \u65bd\u653e\u6280\u80fd\u65f6\uff0c{{value}}\u51e0\u7387\u51cf\u5c11\u6240\u6709\u6280\u80fd\u51b7\u5374\u65f6\u95f42\u79d2\u5e76\u6062\u590d10MP\u3002",bloom:"\u7efd\u653e: \u65bd\u653e\u6280\u80fd\u65f6\uff0c{{value}}\u51e0\u7387\u6cbb\u7597HP%\u6700\u4f4e\u7684\u961f\u53cb10HP+15%\u9b54\u6cd5\u4f24\u5bb3\u3002",blaze:"\u70bd\u7130: \u65bd\u653e\u6280\u80fd\u65f6\uff0c{{value}}\u51e0\u7387\u653b\u51fb\u6240\u6709\u654c\u4eba30%\u9b54\u6cd5\u4f24\u5bb3\u3002"},itemSelector:{count:"\u6570\u91cf",remove:"\u79fb\u9664",itemFilterPlaceholder:"\u7269\u54c1\u641c\u7d22",cannotChangeWhileInCombat:"\u6218\u6597\u4e2d\u65e0\u6cd5\u66f4\u6539",noItemsAvailable:"\u6ca1\u6709\u53ef\u7528\u7269\u54c1"},consumableSlot:{requireBiggerPouch:"\u9700\u66f4\u5927<br />\u888b\u5b50",food:"\u98df\u7269",drink:"\u996e\u6599"},itemDictionary:{gatheredFrom:"\u91c7\u96c6\u81ea:",producedFrom:"\u751f\u4ea7\u81ea",producedFromCheesesmithing:"\u751f\u4ea7\u81ea\u5976\u916a\u953b\u9020:",producedFromCrafting:"\u751f\u4ea7\u81ea\u5236\u4f5c:",producedFromTailoring:"\u751f\u4ea7\u81ea\u7f1d\u7eab:",producedFromCooking:"\u751f\u4ea7\u81ea\u70f9\u996a:",producedFromBrewing:"\u751f\u4ea7\u81ea\u51b2\u6ce1:",producedFromAlchemy:"\u751f\u4ea7\u81ea\u70bc\u91d1:",producedFromEnhancing:"\u751f\u4ea7\u81ea\u5f3a\u5316:",rareDropFrom:"\u7a00\u6709\u6389\u843d\u6765\u81ea:",droppedByMonsters:"\u602a\u7269\u6389\u843d:",droppedByEliteMonsters:"\u7cbe\u82f1\u602a\u7269\u6389\u843d:",decomposedFrom:"\u5206\u89e3\u81ea(\u70bc\u91d1):",transmutedFrom:"\u8f6c\u5316\u81ea(\u70bc\u91d1):",decomposesInto:"\u5206\u89e3\u6210(\u70bc\u91d1):",transmutesInto:"\u8f6c\u5316\u6210(\u70bc\u91d1):",enhancingCost:"\u5f3a\u5316\u6210\u672c:",usedFor:"\u7528\u4e8e{{actionTypeName}}:",lootedFromContainer:"\u4ece\u5bb9\u5668\u4e2d\u83b7\u5f97:",openToLoot:"\u6253\u5f00\u53ef\u83b7\u5f97:",anyMilkingAction:"\u4efb\u4f55\u6324\u5976\u884c\u52a8\u3002",anyForagingAction:"\u4efb\u4f55\u91c7\u6458\u884c\u52a8\u3002",anyWoodcuttingAction:"\u4efb\u4f55\u4f10\u6728\u884c\u52a8\u3002",anyCheesesmithingAction:"\u4efb\u4f55\u5976\u916a\u953b\u9020\u884c\u52a8\u3002",anyCraftingAction:"\u4efb\u4f55\u5236\u4f5c\u884c\u52a8\u3002",anyTailoringAction:"\u4efb\u4f55\u7f1d\u7eab\u884c\u52a8\u3002",anyCookingAction:"\u4efb\u4f55\u70f9\u996a\u884c\u52a8\u3002",anyBrewingAction:"\u4efb\u4f55\u51b2\u6ce1\u884c\u52a8\u3002",anyAlchemyAction:"\u4efb\u4f55\u70bc\u91d1\u884c\u52a8\u3002",anyEnhancingAction:"\u4efb\u4f55\u5f3a\u5316\u884c\u52a8\u3002",anyLowLevelGathering:"\u4efb\u4f55\u4f4e\u7ea7\u91c7\u96c6\u884c\u52a8\u3002",anyMediumLevelGathering:"\u4efb\u4f55\u4e2d\u7ea7\u91c7\u96c6\u884c\u52a8\u3002",anyHighLevelGathering:"\u4efb\u4f55\u9ad8\u7ea7\u91c7\u96c6\u884c\u52a8\u3002",anyLowLevelProduction:"\u4efb\u4f55\u4f4e\u7ea7\u751f\u4ea7\u3001\u70bc\u91d1\u548c\u5f3a\u5316\u884c\u52a8\u3002",anyMediumLevelProduction:"\u4efb\u4f55\u4e2d\u7ea7\u751f\u4ea7\u3001\u70bc\u91d1\u548c\u5f3a\u5316\u884c\u52a8\u3002",anyHighLevelProduction:"\u4efb\u4f55\u9ad8\u7ea7\u751f\u4ea7\u3001\u70bc\u91d1\u548c\u5f3a\u5316\u884c\u52a8\u3002",almostAllMonstersDropCoins:"\u51e0\u4e4e\u6240\u6709\u602a\u7269\u90fd\u4f1a\u6389\u843d\u91d1\u5e01\u3002",anyLowLevelMonster:"\u4efb\u4f55\u4f4e\u7ea7\u602a\u7269\u5728\u666e\u901a\u6218\u6597\u4e2d\u3002",anyMediumLevelMonster:"\u4efb\u4f55\u4e2d\u7ea7\u602a\u7269\u5728\u666e\u901a\u6218\u6597\u4e2d\u3002",anyHighLevelMonster:"\u4efb\u4f55\u9ad8\u7ea7\u602a\u7269\u5728\u666e\u901a\u6218\u6597\u4e2d\u3002",recommendedLevel:"\u63a8\u8350\u7b49\u7ea7 {{level}} <Icon />"},ability:{level:"\u7b49\u7ea7: {{level}}",totalExperience:"\u603b\u7ecf\u9a8c: {{totalExperience}}",expToLevelUp:"\u5347\u7ea7\u6240\u9700\u7ecf\u9a8c: {{remainingExperience}}",linkToChat:"\u94fe\u63a5\u5230\u804a\u5929\u9891\u9053",lv:"Lv.{{level}}",ability:"\u6280\u80fd"},abilityTooltipText:{description:"\u63cf\u8ff0: {{description}}",cooldown:"\u51b7\u5374: {{duration}}",castTime:"\u65bd\u6cd5\u65f6\u95f4: {{duration}}",mpCost:"\u6cd5\u529b\u6d88\u8017: {{cost}} MP",effect:"\u6548\u679c: {{effectText}}",attacks:"\u653b\u51fb",heals:"\u6cbb\u7597",revivesAndHeals:"\u590d\u6d3b\u5e76\u6cbb\u7597",increases:"\u589e\u52a0",decreases:"\u51cf\u5c11",target:"\u76ee\u6807",self:"\u81ea\u5df1",enemy:"\u654c\u4eba",allEnemies:"\u6240\u6709\u654c\u4eba",allAllies:"\u6240\u6709\u961f\u53cb",lowestHpAlly:"HP\u6700\u4f4e\u7684\u961f\u53cb",deadAlly:"\u5df2\u9635\u4ea1\u7684\u961f\u53cb",possessive:{target:"\u76ee\u6807\u7684",self:"\u81ea\u5df1\u7684",enemy:"\u654c\u4eba\u7684",allEnemies:"\u6240\u6709\u654c\u4eba\u7684",allAllies:"\u6240\u6709\u961f\u53cb\u7684",lowestHpAlly:"HP\u6700\u4f4e\u7684\u961f\u53cb\u7684",deadAlly:"\u5df2\u9635\u4ea1\u7684\u961f\u53cb\u7684"},accuracyBonusText:"\u4ee5{{accuracyBonus}}\u603b\u7cbe\u51c6\u5ea6\uff0c",baseDamageFlat:"{{baseDamageFlat}}HP",baseDamageRatio:"{{baseDamageRatio}}",asDamageType:"{{damageType}}",takesDamageOverTime:"\u53d7\u6301\u7eed\u4f24\u5bb3",bleeds:"\u6d41\u8840",soaks:"\u6d78\u6e7f",poisons:"\u4e2d\u6bd2",burns:"\u71c3\u70e7",dotText:"\u4f7f\u76ee\u6807{{dotVerb}}{{dotDuration}}\uff0c\u518d\u9020\u6210\u539f\u653b\u51fb100%\u7684\u4f24\u5bb3\u3002",armorDamageText:"\u989d\u5916\u4f24\u5bb3\u7b49\u540c\u4e8e{{armorDamageRatio}}\u62a4\u7532\u3002",hpDrainText:"\u5438\u53d6{{hpDrainRatio}}\u7684\u4f24\u5bb3\u4f5c\u4e3aHP\u3002",pierceText:"{{pierceChance}}\u7a7f\u900f\u51e0\u7387\u3002",stunText:"{{stunChance}}\u51e0\u7387\u4f7f\u76ee\u6807\u6655\u7729{{stunDuration}}\u3002",blindText:"{{blindChance}}\u51e0\u7387\u4f7f\u76ee\u6807\u5931\u660e{{blindDuration}}\u3002",silenceText:"{{silenceChance}}\u51e0\u7387\u4f7f\u76ee\u6807\u6c89\u9ed8{{silenceDuration}}\u3002",damageHealReviveEffectText:"{{accuracyBonusText}}{{asDamageType}}{{effectType}}{{effectTarget}}{{baseDamageFlat}}{{maybePlus}}{{baseDamageRatio}}{{combatStyle}}\u4f24\u5bb3\u3002{{dotText}}{{armorDamageText}}{{hpDrainText}}{{pierceText}}{{stunText}}{{blindText}}{{silenceText}}",spendHpEffectText:"\u6d88\u8017\u5f53\u524dHP {{hpCost}}\u3002",buffEffectText:"{{increaseOrDecrease}}{{targetType}}{{buffName}}{{boostText}}\uff0c\u6301\u7eed{{duration}}\u3002"},abilitySlot:{specialAbility:"\u7279\u6b8a<br />\u6280\u80fd",ability:"\u6280\u80fd",unlockLevel:"{{level}}\u667a\u529b<br />\u89e3\u9501",remove:"\u79fb\u9664",cannotChangeInCombat:"\u6218\u6597\u4e2d\u65e0\u6cd5\u66f4\u6539",noAbilitiesAvailable:"\u6ca1\u6709\u53ef\u7528\u6280\u80fd"},combatTriggersSetting:{activateWhen:"\u4f7f\u7528\u6761\u4ef6:",activateOffCooldown:"\u51b7\u5374\u7ed3\u675f\u540e\u7acb\u5373\u4f7f\u7528",and:"\u5e76\u4e14",combatTriggers:"\u6218\u6597\u81ea\u52a8\u89e6\u53d1",selectTargetType:"\u9009\u62e9\u76ee\u6807\u7c7b\u578b",selectCondition:"\u9009\u62e9\u6761\u4ef6",select:"\u9009\u62e9",remove:"\u79fb\u9664",addCondition:"\u52a0\u6761\u4ef6",resetDefault:"\u91cd\u7f6e\u4e3a\u9ed8\u8ba4",save:"\u4fdd\u5b58",setting:"\u8bbe\u7f6e",triggerText:"{{dependency}}{{condition}} {{comparator}} {{value}}",cannotChangeInCombat:"\u6218\u6597\u4e2d\u65e0\u6cd5\u66f4\u6539"},buffText:{duration:"\u6301\u7eed\u65f6\u95f4",detail:"\u8be6\u60c5"},buffsTooltip:{bonuses:"\u52a0\u6210"},mooPass:{mooPass:"\u54de\u5361",durationLabel:"\u6301\u7eed\u65f6\u95f4: ",mooPassExpBuff:"+{{expBuff}} \u7ecf\u9a8c\u589e\u76ca (\u9650\u4e8e\u6807\u51c6\u89d2\u8272)",mooPassOfflineHourLimit:"+{{count}} \u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6\u4e0a\u9650",mooPassMarketListingLimit:"+{{count}} \u5e02\u573a\u6302\u724c\u4e0a\u9650",mooPassActionQueueLimit:"+{{count}} \u884c\u52a8\u961f\u5217\u4e0a\u9650",mooPassTaskSlotLimit:"+{{count}} \u4efb\u52a1\u69fd\u4f4d\u4e0a\u9650",mooPassFreeTaskRerolls:"+{{count}} \u6b21\u514d\u8d39\u4efb\u52a1\u91cd\u7f6e (\u6bcf\u4e2a\u4efb\u52a1)",mooPassLabyrinthPathLimit:"+{{count}} \u8ff7\u5bab\u8def\u5f84\u957f\u5ea6",mooPassLootTracker:"\u6700\u540e {{count}} \u4e2a\u884c\u52a8\u7684\u6389\u843d\u8bb0\u5f55",mooPassAvatarBorder:"\u91d1\u8272\u89d2\u8272\u8fb9\u6846"},personalBuffs:{title:"\u4e2a\u4eba\u589e\u76ca",duration:"\u6301\u7eed\u65f6\u95f4: "},communityBuff:{durationLabel:"\u6301\u7eed\u65f6\u95f4: ",durationDefault:"\u6301\u7eed\u65f6\u95f4: 1\u5206\u949f",minutesToNextLevel:"\u4e0b\u4e00\u7ea7\u6240\u9700\u5206\u949f\u6570: {{minutes}}",level:"\u7b49\u7ea7: {{level}}",max:" (\u6700\u5927)",usableIn:"\u53ef\u7528\u4e8e: ",contributor:"{{name}}: {{minutes}} \u5206\u949f",moreContributors:"(+{{count}} \u66f4\u591a\u8d21\u732e\u8005)"},systemChatMessage:{communityBuffAdded:"{{name}} \u6dfb\u52a0\u4e86{{minutes}}\u5206\u949f\u7684\u793e\u533a\u589e\u76ca: $t(communityBuffTypeNames.{{buffHrid}})!",characterLeveledUp:"{{name}} \u8fbe\u5230{{level}}$t(skillNames.{{skillHrid}})!",guildLeveledUp:"\u516c\u4f1a\u8fbe\u5230{{level}}\u7ea7!",guildNoticeUpdated:"{{name}} \u66f4\u65b0\u4e86\u516c\u4f1a\u516c\u544a\u4fe1\u606f\u3002",guildMemberPromoted:"{{name}} \u88ab {{actor}} \u63d0\u5347\u4e3a$t(guildCharacterRoleNames.{{role}})\u3002",guildMemberDemoted:"{{name}} \u88ab {{actor}} \u964d\u7ea7\u4e3a$t(guildCharacterRoleNames.{{role}})\u3002",guildMemberJoined:"{{name}} \u52a0\u5165\u4e86\u516c\u4f1a\uff01",guildMemberLeft:"{{name}} \u79bb\u5f00\u4e86\u516c\u4f1a\u3002",guildMemberKicked:"{{name}} \u88ab {{actor}} \u8e22\u51fa\u516c\u4f1a\u3002",partyMemberJoined:"{{name}} \u52a0\u5165\u4e86\u961f\u4f0d\u3002",partyMemberLeft:"{{name}} \u79bb\u5f00\u4e86\u961f\u4f0d\u3002",partyMemberKicked:"{{name}} \u88ab\u8e22\u51fa\u961f\u4f0d\u3002",partyMemberReady:"{{name}} \u5df2\u51c6\u5907\u597d\u3002",partyMemberNotReady:"{{name}} \u672a\u51c6\u5907\u597d\u3002",partyBattleStarted:"\u6218\u6597\u5f00\u59cb: $t(actionNames.{{actionHrid}})",partyBattleEnded:"\u6218\u6597\u7ed3\u675f: $t(actionNames.{{actionHrid}})",partyKeyCount:"\u94a5\u5319\u6570\u91cf: {{keyCountString}}",partyWaveFailed:"\u961f\u4f0d\u5728\u7b2c{{wave}}\u6ce2\u5931\u8d25\u3002"},infoNotification:{addedFriend:"\u5df2\u6dfb\u52a0\u597d\u53cb: {{0}}",removedFriend:"\u5df2\u5220\u9664\u597d\u53cb: {{0}}",blockedCharacter:"\u5df2\u5c4f\u853d\u89d2\u8272: {{0}}\n\u5728[\u793e\u4ea4]->[\u9ed1\u540d\u5355]\u53ef\u67e5\u770b",unblockedCharacter:"\u5df2\u53d6\u6d88\u5c4f\u853d\u89d2\u8272: {{0}}",chatReportSubmitted:"\u5df2\u63d0\u4ea4\u804a\u5929\u4e3e\u62a5",loadoutCreated:"\u5df2\u521b\u5efa\u914d\u88c5",loadoutUpdated:"\u5df2\u66f4\u65b0\u914d\u88c5",setupImportedToLoadout:"\u5df2\u5bfc\u5165\u5f53\u524d\u8bbe\u7f6e\u5230\u914d\u88c5",loadoutEquipped:"\u5df2\u88c5\u5907\u914d\u88c5",loadoutDeleted:"\u5df2\u5220\u9664\u914d\u88c5",boughtItem:"\u8d2d\u4e70\u4e86 {{0}} {{1}}",soldItem:"\u51fa\u552e\u4e86 {{0}} {{1}}",buyOrderCompleted:"\u8d2d\u4e70\u4e86 {{0}} \u4e2a{{1}}{{2}}\n\u82b1\u8d39 {{3}} \u91d1\u5e01",sellOrderCompleted:"\u51fa\u552e\u4e86 {{0}} \u4e2a{{1}}{{2}}\n\u83b7\u5f97 {{3}} \u91d1\u5e01",buyListingProgress:"\u8d2d\u4e70\u6302\u724c: {{0}}{{1}}\n\u8fdb\u5ea6: {{2}}/{{3}}",sellListingProgress:"\u51fa\u552e\u6302\u724c: {{0}}{{1}}\n\u8fdb\u5ea6: {{2}}/{{3}}",houseConstructed:"{{0}}\u7ea7{{1}}\u5df2\u5efa\u6210",steamCheckoutRequested:"\u5df2\u8bf7\u6c42STEAM\u7ed3\u8d26\u3002\u8bf7\u7a0d\u5019...",upgradePurchased:"\u5df2\u8d2d\u4e70\u5347\u7ea7: {{0}} (x{{1}})",chatIconUnlocked:"\u89e3\u9501\u804a\u5929\u56fe\u6807: {{0}}",nameColorUnlocked:"\u89e3\u9501\u540d\u79f0\u989c\u8272: {{0}}",avatarUnlocked:"\u89e3\u9501\u65b0\u89d2\u8272\u5f62\u8c61",avatarOutfitUnlocked:"\u89e3\u9501\u65b0\u89d2\u8272\u670d\u88c5",communityBuffAdded:"\u6dfb\u52a0\u4e86 {{0}} \u5206\u949f\u7684\u793e\u533a\u589e\u76ca: {{1}}",nameChanged:"\u540d\u79f0\u5df2\u66f4\u6539: {{0}}",guildCreated:"\u521b\u5efa\u4e86\u516c\u4f1a: {{0}}",guildDisbanded:"\u89e3\u6563\u4e86\u516c\u4f1a: {{0}}",guildLeft:"\u79bb\u5f00\u4e86\u516c\u4f1a: {{0}}",guildNoticeUpdated:"{{0}} \u66f4\u65b0\u4e86\u516c\u4f1a\u516c\u544a\u4fe1\u606f\u3002",guildPromotedTo:"\u4f60\u88ab\u63d0\u5347\u4e3a\u516c\u4f1a{{0}}",guildDemotedTo:"\u4f60\u88ab\u964d\u7ea7\u4e3a\u516c\u4f1a{{0}}",guildLeadershipPassed:"\u5c06\u4f1a\u957f\u6743\u79fb\u4ea4\u7ed9 {{0}}",guildMemberPromoted:"\u5c06 {{0}} \u63d0\u5347\u4e3a{{1}}",guildMemberDemoted:"\u5c06 {{0}} \u964d\u7ea7\u4e3a{{1}}",guildKicked:"\u88ab\u8e22\u51fa\u516c\u4f1a: {{0}}",kickedGuildMember:"\u5df2\u8e22\u51fa {{0}}",guildInvited:"\u9080\u8bf7\u52a0\u5165\u516c\u4f1a: {{0}}",guildInviteSent:"\u53d1\u9001\u4e86\u516c\u4f1a\u9080\u8bf7: {{0}}",guildInviteCanceled:"\u5df2\u53d6\u6d88\u516c\u4f1a\u9080\u8bf7: {{0}}",guildJoined:"\u52a0\u5165\u4e86\u516c\u4f1a: {{0}}",guildInviteDeclined:"\u62d2\u7edd\u4e86\u516c\u4f1a\u9080\u8bf7: {{0}}",partyCreated:"\u5df2\u521b\u5efa\u961f\u4f0d",characterLeveledUp:"\u4f60\u5df2\u8fbe\u5230 {{0}} {{1}}!",achievementCompleted:"\u6210\u5c31\u5df2\u5b8c\u6210\uff1a{{0}}",partyOptionsSaved:"\u961f\u4f0d\u9009\u9879\u5df2\u4fdd\u5b58",partyOpenForRecruiting:"\u961f\u4f0d\u6b63\u5728\u62db\u52df",partyLeadershipChanged:"\u961f\u957f\u6743\u8f6c\u79fb\u7ed9 {{0}}",partyJoined:"\u4f60\u5df2\u52a0\u5165\u961f\u4f0d",readyToBattle:"\u4f60\u5df2\u51c6\u5907\u597d\u6218\u6597",notReadyToBattle:"\u4f60\u672a\u51c6\u5907\u597d\u6218\u6597",partyDisbanded:"\u961f\u4f0d\u5df2\u89e3\u6563",partyLeft:"\u4f60\u5df2\u79bb\u5f00\u961f\u4f0d",partyKicked:"\u4f60\u88ab\u8e22\u51fa\u961f\u4f0d",partyMemberKicked:"\u5df2\u4ece\u961f\u4f0d\u8e22\u51fa {{0}}",referralJoined:"\u6709\u65b0\u73a9\u5bb6\u901a\u8fc7\u4f60\u7684\u63a8\u8350\u94fe\u63a5\u52a0\u5165\u4e86\u6e38\u620f\u3002\u611f\u8c22\u4f60\u7684\u5206\u4eab\uff01",newReferralBonus:"\u65b0\u63a8\u8350\u5956\u52b1\u5df2\u53d1\u653e\n\u5728[\u793e\u4ea4]->[\u63a8\u8350]\u9886\u53d6",cowbellPurchaseCompleted:"\u5df2\u8d2d\u4e70 {{0}} \u725b\u94c3",mooPassPurchaseCompleted:"\u5df2\u8d2d\u4e70 {{0}} \u5929\u54de\u5361",mooPassGranted:"\u5df2\u83b7\u5f97: {{0}} \u5929\u54de\u5361",updateSuccessful:"\u66f4\u65b0\u6210\u529f",creatorCodeSet:"\u521b\u4f5c\u8005\u4ee3\u7801\u5df2\u5e94\u7528: {{0}}",labyrinthShroudFailed:"\u6597\u7bf7\u5931\u8d25\uff01\u623f\u95f4\u7b49\u7ea7\u8d85\u51fa\u6597\u7bf7\u7684\u6709\u6548\u8303\u56f4\u3002"},errorNotification:{unexpectedError:"\u53d1\u751f\u610f\u5916\u9519\u8bef",characterBlockError:"\u7531\u4e8e\u89d2\u8272\u5c4f\u853d\u800c\u5931\u8d25",characterNameNotFound:"\u627e\u4e0d\u5230\u89d2\u8272\u540d\u79f0",cannotFriendSelf:"\u65e0\u6cd5\u6dfb\u52a0\u81ea\u5df1\u4e3a\u597d\u53cb",friendAlreadyExists:"\u597d\u53cb\u5df2\u5b58\u5728",friendLimitReached:"\u597d\u53cb\u4e0a\u9650\u5df2\u8fbe\u5230",characterWasNotFriend:"\u89d2\u8272\u4e0d\u662f\u597d\u53cb",cannotBlockSelf:"\u65e0\u6cd5\u5c4f\u853d\u81ea\u5df1",characterAlreadyBlocked:"\u89d2\u8272\u5df2\u88ab\u5c4f\u853d",blockLimitReached:"\u5c4f\u853d\u4e0a\u9650\u5df2\u8fbe\u5230",characterWasNotBlocked:"\u89d2\u8272\u672a\u88ab\u5c4f\u853d",requestSpamProtection:"\u8bf7\u52ff\u8fc7\u5feb\u53d1\u9001\u6e38\u620f\u6307\u4ee4",nonPublicModMessage:"\u65e0\u6cd5\u5411\u975e\u516c\u5171\u9891\u9053\u53d1\u9001\u7ba1\u7406\u5458\u6d88\u606f",nonPublicWarningMessage:"\u65e0\u6cd5\u5411\u975e\u516c\u5171\u9891\u9053\u53d1\u9001\u8b66\u544a\u6d88\u606f",chatSpamProtection:"\u8bf7\u52ff\u91cd\u590d\u6d88\u606f\u6216\u8fc7\u5feb\u53d1\u9001\u6d88\u606f",waitBetweenTradeMessages:"\u8bf7\u7b49\u5f855\u5206\u949f\u540e\u518d\u53d1\u9001\u4ea4\u6613\u6d88\u606f",waitBetweenRecruitMessages:"\u8bf7\u7b49\u5f855\u5206\u949f\u540e\u518d\u53d1\u9001\u62db\u52df\u6d88\u606f",chatReportAlreadyExists:"\u4f60\u5df2\u4e3e\u62a5\u6b64\u804a\u5929\u6d88\u606f",chatReportAlreadyResolved:"\u6b64\u6d88\u606f\u7684\u4e3e\u62a5\u5df2\u88ab\u5904\u7406",stopPartyBattleBeforeSolo:"\u4f60\u5fc5\u987b\u505c\u6b62\u56e2\u961f\u6218\u6597\u540e\u624d\u80fd\u5f00\u59cb\u5355\u4eba\u884c\u52a8",cannotEquipLoadoutForAction:"\u65e0\u6cd5\u88c5\u5907\u6b64\u884c\u52a8\u7684\u914d\u88c5",cannotEquipLoadoutInCombat:"\u65e0\u6cd5\u5728\u6218\u6597\u4e2d\u88c5\u5907\u914d\u88c5",orderNotFulfilled:"\u8ba2\u5355\u65e0\u6cd5\u5b8c\u6210",steamCheckoutError:"Steam \u7ed3\u8d26\u9519\u8bef",stripeCheckoutError:"Stripe \u7ed3\u8d26\u9519\u8bef",characterNameUnavailable:"\u89d2\u8272\u540d\u79f0\u4e0d\u53ef\u7528",guildNameUnavailable:"\u516c\u4f1a\u540d\u79f0\u4e0d\u53ef\u7528",characterAlreadyInGuild:"\u89d2\u8272\u5df2\u6709\u516c\u4f1a",characterAlreadyInvited:"\u89d2\u8272\u5df2\u88ab\u9080\u8bf7",alreadyInParty:"\u4f60\u5df2\u7ecf\u5728\u961f\u4f0d\u4e2d",characterNotInParty:"\u89d2\u8272\u4e0d\u5728\u961f\u4f0d\u4e2d",partyNoLongerRecruiting:"\u6b64\u961f\u4f0d\u4e0d\u518d\u62db\u52df",partyGameModeMismatch:"\u6b64\u961f\u4f0d\u4e0e\u4f60\u7684\u6e38\u620f\u6a21\u5f0f\u4e0d\u5339\u914d",partySlotUnavailable:"\u961f\u4f0d\u69fd\u4f4d\u5df2\u4e0d\u53ef\u7528",currentPasswordIncorrect:"\u5f53\u524d\u5bc6\u7801\u4e0d\u6b63\u786e",emailAlreadyRegistered:"\u6b64\u7535\u5b50\u90ae\u4ef6\u5730\u5740\u5df2\u5728\u53e6\u4e00\u4e2a\u8d26\u6237\u4e0a\u6ce8\u518c",invalidCreatorCode:"\u65e0\u6548\u7684\u521b\u4f5c\u8005\u4ee3\u7801\uff0c\u8bf7\u68c0\u67e5\u540e\u91cd\u8bd5\u3002"},guideTooltip:{milkingTitle:"\u6324\u5976",milkingContent:"\u8fd9\u4e9b\u795e\u5947\u5976\u725b\u7684\u725b\u5976\u6709\u591a\u79cd\u529f\u80fd\u3002\u5b83\u4eec\u53ef\u4ee5\u7528\u6765\u5236\u4f5c\u6d88\u8017\u54c1\uff0c\u6216\u8005\u505a\u6210\u7279\u6b8a\u5976\u916a\u4ee5\u5236\u4f5c\u88c5\u5907\u3002\n\u5976\u725b\u559c\u6b22\u88ab\u5237\u6bdb\u3002\u88c5\u5907\u5237\u5b50\u4f1a\u63d0\u5347\u4f60\u7684\u6324\u5976\u6548\u7387\u3002",foragingTitle:"\u91c7\u6458",foragingContent:"\u5728\u5404\u4e2a\u5730\u533a\u91c7\u6458\u65f6\uff0c\u4f60\u53ef\u4ee5\u627e\u5230\u8bb8\u591a\u4e0d\u540c\u7684\u8d44\u6e90\u3002\u8fd9\u4e9b\u8d44\u6e90\u53ef\u4ee5\u7528\u4e8e\u70f9\u996a\u548c\u51b2\u6ce1\u6d88\u8017\u54c1\u3002\n\u88c5\u5907\u526a\u5200\u4f1a\u63d0\u5347\u4f60\u7684\u91c7\u6458\u6548\u7387\u3002",woodcuttingTitle:"\u4f10\u6728",woodcuttingContent:"\u4f60\u53ef\u4ee5\u4ece\u4e0d\u540c\u7c7b\u578b\u7684\u6811\u6728\u4e2d\u83b7\u53d6\u6728\u6750\u3002\u6728\u6750\u7528\u4e8e\u5236\u4f5c\u5404\u79cd\u88c5\u5907\u3002\n\u88c5\u5907\u65a7\u5934\u4f1a\u63d0\u5347\u4f60\u7684\u4f10\u6728\u6548\u7387\u3002",cheesesmithingTitle:"\u5976\u916a\u953b\u9020",cheesesmithingContent:"\u7528\u725b\u5976\u5236\u4f5c\u7684\u786c\u8d28\u5976\u916a\u575a\u786c\u5982\u91d1\u5c5e\u3002\u4f60\u53ef\u4ee5\u5c06\u5b83\u4eec\u953b\u9020\u6210\u88c5\u5907\uff0c\u4e3a\u4f60\u7684\u6218\u6597\u6216\u6280\u827a\u8bad\u7ec3\u63d0\u4f9b\u52a0\u6210\u3002\n\u88c5\u5907\u53ef\u4ee5\u4ece\u4e00\u7ea7\u5347\u7ea7\u5230\u4e0b\u4e00\u7ea7\uff0c\u901a\u5e38\u9700\u8981\u8d8a\u6765\u8d8a\u591a\u7684\u5976\u916a\u3002\u8fd8\u6709\u4e00\u4e9b\u7279\u6b8a\u7684\u88c5\u5907\u53ef\u4ee5\u7528\u6218\u6597\u4e2d\u4ece\u602a\u7269\u8eab\u4e0a\u83b7\u5f97\u7684\u7269\u54c1\u6765\u5236\u4f5c\u3002\n\u88c5\u5907\u9524\u5b50\u4f1a\u63d0\u5347\u4f60\u7684\u5976\u916a\u953b\u9020\u6548\u7387\u3002",craftingTitle:"\u5236\u4f5c",craftingContent:"\u4f60\u53ef\u4ee5\u5236\u4f5c\u6b66\u5668\u3001\u526f\u624b\u88c5\u5907\u548c\u73e0\u5b9d\u3002\n\u88c5\u5907\u51ff\u5b50\u4f1a\u63d0\u5347\u4f60\u7684\u5236\u4f5c\u6548\u7387\u3002",tailoringTitle:"\u7f1d\u7eab",tailoringContent:"\u4f60\u53ef\u4ee5\u4f7f\u7528\u4ece\u6218\u6597\u548c\u91c7\u6458\u4e2d\u83b7\u5f97\u7684\u539f\u6750\u6599\u6765\u5236\u4f5c\u8fdc\u7a0b\u548c\u9b54\u6cd5\u670d\u88c5\u3002\n\u88c5\u5907\u9488\u4f1a\u63d0\u5347\u4f60\u7684\u7f1d\u7eab\u6548\u7387\u3002",cookingTitle:"\u70f9\u996a",cookingContent:"\u98df\u7269\u53ef\u4ee5\u7528\u6765\u6062\u590d\u4f60\u7684HP\u6216MP\u3002\u5b83\u4eec\u53ef\u4ee5\u968f\u8eab\u643a\u5e26\u5728\u6218\u6597\u4e2d\u4f7f\u7528\u3002\n\u88c5\u5907\u9505\u94f2\u4f1a\u63d0\u5347\u4f60\u7684\u70f9\u996a\u6548\u7387\u3002",brewingTitle:"\u51b2\u6ce1",brewingContent:"\u996e\u54c1\u53ef\u4ee5\u7ed9\u4f60\u63d0\u4f9b\u4e34\u65f6\u589e\u76ca\u6548\u679c\u3002\u5496\u5561\u53ef\u4ee5\u5728\u6218\u6597\u4e2d\u643a\u5e26\uff0c\u8336\u53ef\u4ee5\u5728\u8bad\u7ec3\u6280\u827a\u65f6\u4f7f\u7528\u3002\n\u88c5\u5907\u58f6\u4f1a\u63d0\u5347\u4f60\u7684\u51b2\u6ce1\u6548\u7387\u3002",alchemyTitle:"\u70bc\u91d1",alchemyContent:"\u70bc\u91d1\u8ba9\u4f60\u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u5176\u4ed6\u7269\u54c1\u3002\u6bcf\u79cd\u70bc\u91d1\u90fd\u6709\u4e0d\u540c\u7684\u6210\u529f\u7387\uff0c\u65e0\u8bba\u6210\u529f\u6216\u5931\u8d25\uff0c\u8f93\u5165\u7684\u7269\u54c1\u90fd\u4f1a\u88ab\u6d88\u8017\u3002\n\u70b9\u91d1: \u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u91d1\u5e01\u3002\u5206\u89e3: \u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u539f\u6750\u6599\u6216\u7cbe\u534e\u3002\u8f6c\u5316: \u5c06\u7269\u54c1\u8f6c\u6362\u4e3a\u968f\u673a\u76f8\u5173\u7269\u54c1\uff0c\u5728\u67d0\u4e9b\u60c5\u51b5\u4e0b\u80fd\u83b7\u5f97\u7684\u7279\u6b8a\u7269\u54c1\u3002\u89e3\u7cbe\u70bc: \u5c06\u7cbe\u70bc\u88c5\u5907\u8fd8\u539f\u4e3a\u57fa\u7840\u7248\u672c\uff0c\u5e76\u8fd4\u8fd8\u90e8\u5206\u7cbe\u70bc\u788e\u7247\u3002\n\u6bcf\u6b21\u8f6c\u5316\u90fd\u6709\u4e00\u4e2a\u57fa\u672c\u6210\u529f\u7387\u3002\u5982\u679c\u4f60\u7684\u70bc\u91d1\u7b49\u7ea7\u4f4e\u4e8e\u7269\u54c1\u7b49\u7ea7\uff0c\u6210\u529f\u7387\u4f1a\u964d\u4f4e\u3002\u50ac\u5316\u5242\u548c\u8336\u53ef\u4ee5\u7528\u6765\u63d0\u9ad8\u6210\u529f\u7387\u3002\n\u88c5\u5907\u84b8\u998f\u5668\u4f1a\u63d0\u5347\u4f60\u7684\u70bc\u91d1\u6548\u7387\u3002",enhancingTitle:"\u5f3a\u5316",enhancingContent:"\u5f3a\u5316\u53ef\u4ee5\u6c38\u4e45\u63d0\u5347\u4f60\u7684\u88c5\u5907\uff0c\u968f\u7740\u5f3a\u5316\u7b49\u7ea7\u7684\u63d0\u9ad8\uff0c\u88c5\u5907\u5c06\u83b7\u5f97\u66f4\u9ad8\u7684\u52a0\u6210\u3002\n\u6bcf\u6b21\u5c1d\u8bd5\u5f3a\u5316\u90fd\u9700\u8981\u6d88\u8017\u5c11\u91cf\u6750\u6599\u3002\u6210\u529f\u7387\u53d6\u51b3\u4e8e\u4f60\u7684\u5f3a\u5316\u7b49\u7ea7\u3001\u88c5\u5907\u7269\u54c1\u7684\u7b49\u7ea7\u548c\u8be5\u7269\u54c1\u5f53\u524d\u7684\u5f3a\u5316\u7b49\u7ea7\u3002\u4f60\u7684\u7b49\u7ea7\u6bcf\u8d85\u8fc7\u7269\u54c1\u63a8\u8350\u7b49\u7ea71\u7ea7\uff0c\u6210\u529f\u7387\u589e\u52a00.05%\u3002\u6210\u529f\u7684\u5f3a\u5316\u5c06\u4f7f\u7b49\u7ea7\u589e\u52a01\uff0c\u5931\u8d25\u4f1a\u5c06\u7b49\u7ea7\u91cd\u7f6e\u4e3a0\u3002\n\u4f60\u53ef\u4ee5\u9009\u62e9\u4f7f\u7528\u57fa\u7840\u88c5\u5907\u7684\u526f\u672c\u8fdb\u884c\u4fdd\u62a4\u3002\u5931\u8d25\u65f6\u4f7f\u7528\u4fdd\u62a4\u53ea\u4f1a\u5c06\u5f3a\u5316\u7b49\u7ea7\u964d\u4f4e1\uff0c\u4f46\u4f1a\u6d88\u80171\u4e2a\u4fdd\u62a4\u9053\u5177\u3002\n\u88c5\u5907\u5f3a\u5316\u5668\u4f1a\u63d0\u5347\u4f60\u7684\u5f3a\u5316\u6210\u529f\u7387\u3002",combatTitle:"\u6218\u6597",combatContent:"\u51fb\u8d25\u602a\u7269\u53ef\u83b7\u5f97\u7ecf\u9a8c\u548c\u7269\u54c1\u6389\u843d\u3002\n\u4f60\u7684\u6218\u6597\u5c5e\u6027\u57fa\u4e8e\u4f60\u7684\u6218\u6597\u7b49\u7ea7\u548c\u88c5\u5907\u52a0\u6210\u7684\u7ec4\u5408\u3002\n\u4f60\u53ef\u4ee5\u5e26\u98df\u7269\u6765\u6062\u590dHP\u6216MP\uff0c\u996e\u54c1\u53ef\u4ee5\u63d0\u4f9b\u589e\u76ca\u6548\u679c\uff0c\u8fd8\u53ef\u4ee5\u65bd\u653e\u5404\u79cd\u6280\u80fd\u3002\n\u4f60\u53ef\u4ee5\u901a\u8fc7\u4e0b\u65b9\u7684\u8bbe\u7f6e\u56fe\u6807\u6765\u66f4\u6539\u81ea\u52a8\u5316\u914d\u7f6e\u3002\n\u5982\u679c\u4f60\u5728\u6218\u6597\u4e2d\u88ab\u51fb\u8d25\uff0c\u4f60\u7684\u89d2\u8272\u5c06\u5728\u91cd\u751f\u5012\u8ba1\u65f6\u7ed3\u675f\u540e\u81ea\u52a8\u7ee7\u7eed\u6218\u6597\u3002",marketplaceTitle:"\u5e02\u573a",marketplaceContent:"\u5e02\u573a\u5141\u8bb8\u73a9\u5bb6\u4e3a\u4efb\u4f55\u53ef\u4ea4\u6613\u7269\u54c1\u521b\u5efa\u4e70\u5356\u6302\u724c\u3002\u4f60\u53ef\u4ee5\u70b9\u51fb\u4efb\u4f55\u5217\u51fa\u7684\u7269\u54c1\u67e5\u770b\u73b0\u6709\u6302\u724c\u6216\u521b\u5efa\u81ea\u5df1\u7684\u6302\u724c\u3002\n\u65b0\u6302\u724c\u5c06\u5c3d\u53ef\u80fd\u7531\u5e02\u573a\u4e0a\u6700\u5339\u914d\u7684\u4ef7\u683c\u6765\u6ee1\u8db3\u3002\u5982\u679c\u65e0\u6cd5\u7acb\u5373\u6ee1\u8db3\uff0c\u8be5\u6302\u724c\u5c06\u51fa\u73b0\u5728\u5e02\u573a\u4e0a\u3002\n\u4ea4\u6613\u6210\u529f\u65f6\uff0c\u5c06\u6536\u53d62%\u7684\u91d1\u5e01\u7a0e\uff0c\u6536\u5230\u7684\u7269\u54c1\u53ef\u4ee5\u4ece[\u6211\u7684\u6302\u724c]\u6807\u7b7e\u4e2d\u6536\u96c6\u3002\n\u51fa\u552e\u4ef7: \u5df2\u5b58\u5728\u7684\u51fa\u552e\u6302\u724c\u3002\n\u6536\u8d2d\u4ef7: \u5df2\u5b58\u5728\u7684\u8d2d\u4e70\u6302\u724c\u3002",combatStatsTitle:"\u6218\u6597\u5c5e\u6027",combatStatsContent:"\u653b\u51fb\u95f4\u9694: \u81ea\u52a8\u653b\u51fb\u7684\u901f\u5ea6\u3002\n\u6280\u80fd\u6025\u901f: \u51cf\u5c11\u6280\u80fd\u51b7\u5374\u65f6\u95f4\u3002\n\u7cbe\u51c6\u5ea6: \u589e\u52a0\u6210\u529f\u653b\u51fb\u7684\u51e0\u7387\u3002\n\u4f24\u5bb3: \u81ea\u52a8\u653b\u51fb\u4f24\u5bb3\u57281\u548c\u6700\u5927\u4f24\u5bb3\u4e4b\u95f4\u968f\u673a\u3002\n\u66b4\u51fb: \u603b\u662f\u9020\u6210\u6700\u5927\u4f24\u5bb3\u3002\u8fdc\u7a0b\u7c7b\u578b\u6709\u88ab\u52a8\u66b4\u51fb\u51e0\u7387\u3002\n\u4efb\u52a1\u4f24\u5bb3: \u5bf9\u88ab\u6307\u5b9a\u4e3a\u4efb\u52a1\u7684\u602a\u7269\u589e\u52a0\u4f24\u5bb3\u3002\n\u589e\u5e45: \u589e\u52a0\u8be5\u7c7b\u578b\u7684\u4f24\u5bb3\u3002\n\u95ea\u907f: \u589e\u52a0\u8eb2\u907f\u653b\u51fb\u7684\u51e0\u7387\u3002\n\u62a4\u7532: \u51cf\u5c11\u4e00\u5b9a\u6bd4\u4f8b\u7684\u7269\u7406\u4f24\u5bb3\u3002\n\u6297\u6027: \u51cf\u5c11\u4e00\u5b9a\u6bd4\u4f8b\u7684\u5143\u7d20\u4f24\u5bb3\u3002\n\u7a7f\u900f: \u5ffd\u7565\u4e00\u5b9a\u6bd4\u4f8b\u7684\u62a4\u7532/\u6297\u6027\u3002\n\u751f\u547d\u5077\u53d6: \u81ea\u52a8\u653b\u51fb\u65f6\u6062\u590d\u4e00\u5b9a\u6bd4\u4f8b\u7684HP\u3002\n\u6cd5\u529b\u5438\u53d6: \u81ea\u52a8\u653b\u51fb\u65f6\u5438\u53d6\u4e00\u5b9a\u6bd4\u4f8b\u7684MP\u3002\n\u8346\u68d8: \u88ab\u653b\u51fb\u65f6\uff0c\u5c06\u4e00\u5b9a\u6bd4\u4f8b\u7684\u9632\u5fa1\u4f24\u5bb3\u53cd\u5c04\u7ed9\u653b\u51fb\u8005\u3002\u6bcf\u4e2a\u62a4\u7532\u6216\u6297\u6027\u589e\u52a01%\u4f24\u5bb3\u3002\n\u53cd\u4f24: \u88ab\u653b\u51fb\u65f6\uff0c\u5c06(\u9632\u5fa1\u4f24\u5bb3+\u88ab\u653b\u51fb\u4f24\u5bb3)\u7684\u4e00\u5b9a\u6bd4\u4f8b\u4ee5\u949d\u51fb\u5f62\u5f0f\u53cd\u4f24\u653b\u51fb\u8005\u3002\n\u97e7\u6027: \u51cf\u5c11\u5931\u660e\u3001\u6c89\u9ed8\u6216\u7729\u6655\u7684\u51e0\u7387\u3002\n\u5a01\u80c1: \u589e\u52a0\u88ab\u602a\u7269\u653b\u51fb\u7684\u51e0\u7387\u3002\n\u6062\u590d: \u6bcf10\u79d2\u6062\u590d\u4e00\u5b9a\u6bd4\u4f8b\u7684\u6700\u5927HP/MP\u3002\n\u98df\u7269\u6025\u901f: \u51cf\u5c11\u98df\u7269\u51b7\u5374\u65f6\u95f4\u3002\n\u996e\u6599\u6d53\u5ea6: \u589e\u52a0\u996e\u6599\u6548\u679c\u3002\u51cf\u5c11\u6301\u7eed\u65f6\u95f4\u548c\u51b7\u5374\u65f6\u95f4\u3002",noncombatStatsTitle:"\u751f\u6d3b\u5c5e\u6027",noncombatStatsContent:"\u901f\u5ea6: \u589e\u52a0\u884c\u52a8\u901f\u5ea6\n\u4efb\u52a1\u901f\u5ea6: \u589e\u52a0\u4efb\u52a1\u4e2d\u7684\u884c\u52a8\u901f\u5ea6\u3002\n\u91c7\u96c6\u6570\u91cf: \u589e\u52a0\u91c7\u96c6\u6570\u91cf\n\u6548\u7387: \u7acb\u5373\u91cd\u590d\u884c\u52a8\u7684\u51e0\u7387\n\u4e13\u4e1a\u7cbe\u534e\u53d1\u73b0: \u589e\u52a0\u53d1\u73b0\u7cbe\u534e\u7684\u51e0\u7387\n\u4e13\u4e1a\u7a00\u6709\u53d1\u73b0: \u589e\u52a0\u7a00\u6709\u7269\u54c1\u6389\u843d\u7387\u3002",abilitiesTitle:"\u6280\u80fd",abilitiesContent:"\u6280\u80fd\u53ef\u4ee5\u4ece\u6280\u80fd\u4e66\u4e2d\u5b66\u4e60\u3002\u6280\u80fd\u4e66\u53ef\u4ee5\u4ece\u602a\u7269\u8eab\u4e0a\u83b7\u5f97\uff0c\u6216\u8005\u5728\u5e02\u573a\u4e0a\u4ece\u5176\u4ed6\u73a9\u5bb6\u90a3\u91cc\u8d2d\u4e70\u3002\n\u6280\u80fd\u53ef\u4ee5\u653e\u7f6e\u5728\u69fd\u4f4d\u4e2d\u7528\u4e8e\u6218\u6597\u3002\u968f\u7740\u667a\u529b\u7b49\u7ea7\u7684\u63d0\u5347\uff0c\u4f60\u5c06\u89e3\u9501\u66f4\u591a\u7684\u69fd\u4f4d\u3002\n\u968f\u7740\u7ecf\u9a8c\u7684\u83b7\u5f97\uff0c\u6280\u80fd\u4e5f\u4f1a\u5347\u7ea7\u3002\u6bcf\u6b21\u5728\u6218\u6597\u4e2d\u4f7f\u7528\u6280\u80fd\u65f6\u53ef\u4ee5\u83b7\u5f970.1\u70b9\u7ecf\u9a8c\uff0c\u4ece\u6d88\u8017\u91cd\u590d\u7684\u6280\u80fd\u4e66\u4e2d\u53ef\u4ee5\u83b7\u5f97\u66f4\u591a\u7ecf\u9a8c\u3002",houseTitle:"\u623f\u5c4b",houseContent:"\u4f60\u7684\u623f\u5c4b\u53ef\u4ee5\u5efa\u9020\u623f\u95f4\uff0c\u4e3a\u4f60\u63d0\u4f9b\u6c38\u4e45\u52a0\u6210\u3002\n\u6bcf\u4e2a\u623f\u95f4\u53ef\u4ee5\u5347\u7ea7\u5230\u6700\u9ad88\u7ea7\uff0c\u4f46\u5347\u7ea7\u6210\u672c\u9010\u6e10\u589e\u52a0\u3002",loadoutsTitle:"\u914d\u88c5",loadoutsContent:'\u914d\u88c5\u5141\u8bb8\u4f60\u4fdd\u5b58\u5f53\u524d\u7684\u88c5\u5907\u3001\u6d88\u8017\u54c1\u548c\u6280\u80fd\uff0c\u4ee5\u4fbf\u7a0d\u540e\u4e0e\u884c\u52a8\u4e00\u8d77\u81ea\u52a8\u52a0\u8f7d\u3002\u914d\u88c5\u53ef\u4ee5\u7ed1\u5b9a\u5230\u5355\u4e2a\u4e13\u4e1a\u6216"\u6240\u6709\u4e13\u4e1a"\u3002\u9009\u62e9"\u6240\u6709\u4e13\u4e1a"\u5c06\u53ea\u4fdd\u5b58\u88c5\u5907\u3002\n\u5c06\u914d\u88c5\u8bbe\u7f6e\u4e3a\u9ed8\u8ba4\u65f6\uff0c\u5728\u9009\u62e9\u4e0e\u914d\u88c5\u5173\u8054\u7684\u4e13\u4e1a\u4e2d\u7684\u4efb\u4f55\u884c\u52a8\u65f6\u4f1a\u81ea\u52a8\u9009\u62e9\u8be5\u914d\u88c5\u3002',enhancingProtectionTitle:"\u5f3a\u5316\u4fdd\u62a4",enhancingProtectionContent:"\u5f3a\u5316\u5931\u8d25\u65f6\u6d88\u8017\u4e00\u4e2a\u4fdd\u62a4\u9053\u5177\u4ee5\u786e\u4fdd\u53ea\u635f\u59311\u7ea7\u5f3a\u5316\uff0c\u800c\u4e0d\u662f\u91cd\u7f6e\u4e3a0\u7ea7\u3002\u8d24\u8005\u4e4b\u955c\u6bcf\u6b21\u4f7f\u7528\u90fd\u4f1a\u6d88\u8017\uff0c\u5e76\u4fdd\u8bc1\u6210\u529f\u3002",alchemyCatalystTitle:"\u70bc\u91d1\u50ac\u5316\u5242",alchemyCatalystContent:"\u50ac\u5316\u5242\u589e\u52a0\u6210\u529f\u7387\u3002\u4ec5\u5728\u6210\u529f\u65f6\u6d88\u8017\u4e00\u4e2a\u50ac\u5316\u5242\u3002",achievementsTitle:"\u6210\u5c31",achievementsContent:"\u6210\u5c31\uff1a\u6db5\u76d6\u6e38\u620f\u591a\u4e2a\u9886\u57df\u7684\u76ee\u6807\u3002\u5b8c\u6210\u4e00\u4e2a\u7b49\u7ea7\u7684\u6240\u6709\u6210\u5c31\u53ef\u4e3a\u89d2\u8272\u63d0\u4f9b\u589e\u76ca\u3002\n\u6536\u85cf\uff1a\u8ffd\u8e2a\u6240\u6709\u5728\u5e02\u573a\u548c\u6742\u8d27\u5546\u5e97\u4ee5\u5916\u83b7\u5f97\u7684\u7269\u54c1\u3002\n\u56fe\u9274\uff1a\u8ffd\u8e2a\u6240\u6709\u51fb\u8d25\u7684\u602a\u7269\u3002\u6bcf\u7ea7\u96be\u5ea6\u989d\u5916+1\u51fb\u8d25\u6b21\u6570\u3002\u961f\u4f0d\u6218\u6597\u6839\u636e\u961f\u4f0d\u89c4\u6a21\u83b7\u5f97\u90e8\u5206\u51fb\u8d25\u6b21\u6570\u3002\n\n\u6bcf\u79cd\u7269\u54c1/\u602a\u7269\u6839\u636e\u6536\u96c6/\u51fb\u8d25\u6570\u91cf\u83b7\u5f97\u79ef\u5206\uff081\u2192+1\u5206\uff0c10\u2192+2\u5206\uff0c100\u2192+3\u5206\uff0c\u7b49\uff09\u3002",labyrinthTitle:"\u8ff7\u5bab",labyrinthContent:"\u8ff7\u5bab\u7531\u591a\u5c42\u751f\u6d3b\u548c\u6218\u6597\u6311\u6218\u7ec4\u6210\u3002\n\u643a\u5e26\u706b\u628a\u3001\u6597\u7bf7\u3001\u63a2\u7167\u706f\u548c\u8865\u7ed9\u7bb1\u4f5c\u4e3a\u9053\u5177\u3002\n\u4ece\u5b9d\u7bb1\u623f\u95f4\u548c\u697c\u5c42\u51fa\u53e3\u83b7\u5f97\u8ff7\u5bab\u4ee3\u5e01\u3002\u5728\u8ff7\u5bab\u5546\u5e97\u7528\u4ee3\u5e01\u8d2d\u4e70\u5347\u7ea7\u548c\u5956\u52b1\u3002"},newsPanel:{news:"\u65b0\u95fb"},newsText:{17717184e5:{heading:"\u8ff7\u5bab\u53ca\u4f53\u9a8c\u4f18\u5316",content:'<div>\n\t\t\t\t\t\u8ff7\u5bab\u6765\u4e86\uff01\u6311\u6218\u96be\u5ea6\u9010\u5c42\u9012\u589e\u7684\u751f\u6d3b\u548c\u6218\u6597\u5173\u5361\u3002\u5728\u623f\u95f4\u7f51\u683c\u4e2d\u63a2\u7d22\u524d\u8fdb\uff0c\u643a\u5e26\u8865\u7ed9\uff0c\u8d5a\u53d6\u8ff7\u5bab\u4ee3\u5e01\u3001\u7d2b\u591a\u62c9\u4e4b\u76d2\u548c\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1\uff0c\u5728\u8ff7\u5bab\u5546\u5e97\u4e2d\u4f7f\u7528\u4ee3\u5e01\u8d2d\u4e70\u5347\u7ea7\u548c\u72ec\u7279\u7684\u65b0\u7269\u54c1\uff0c\u5305\u62ec\u751f\u6d3b\u62ab\u98ce\u3001\u9774\u5b50\u548c\u5377\u8f74\u3002\u8bbe\u7f6e\u6309\u623f\u95f4\u7c7b\u578b\u7684\u914d\u88c5\u548c\u5168\u81ea\u52a8\u5316\u6765\u4f18\u5316\u60a8\u7684\u63a2\u7d22\uff0c\u5e76\u5728\u8ff7\u5bab\u79ef\u5206\u6392\u884c\u699c\u4e0a\u7ade\u4e89\u3002\u67e5\u770b\u6e38\u620f\u5185\u7684\u6e38\u620f\u6307\u5357\u4e86\u89e3\u6240\u6709\u8be6\u60c5\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u672c\u6b21\u66f4\u65b0\u8fd8\u5e26\u6765\u4e86\u591a\u9879\u5e7f\u53d7\u671f\u5f85\u7684\u4f53\u9a8c\u4f18\u5316\u3002"\u7acb\u5373\u5f00\u59cb"\u73b0\u5728\u53ef\u4ee5\u9009\u62e9\u5c06\u64cd\u4f5c\u63d2\u5165\u5230\u64cd\u4f5c\u961f\u5217\u6700\u524d\u65b9\u800c\u975e\u66ff\u6362\u5f53\u524d\u961f\u5217\u3002\u961f\u4f0d\u51c6\u5907\u53ef\u4ee5\u5728\u5355\u4eba\u64cd\u4f5c\u540e\u6392\u961f\uff0c\u8ba9\u60a8\u65e0\u9700\u5728\u573a\u5373\u53ef\u81ea\u52a8\u8fd4\u56de\u961f\u4f0d\u6218\u6597\u3002\u6d4f\u89c8\u5668\u901a\u77e5\u73b0\u5df2\u652f\u6301Steam\u548c\u6d4f\u89c8\u5668\u73a9\u5bb6\uff0c\u65b9\u4fbf\u60a8\u63a5\u6536\u6e38\u620f\u5185\u4e8b\u4ef6\u901a\u77e5\uff08\u79fb\u52a8\u7aef\u6682\u4e0d\u652f\u6301\uff09\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u6700\u540e\uff0c\u6211\u4eec\u63a8\u51fa\u4e86\u521b\u4f5c\u8005\u4ee3\u7801\u8ba1\u5212\uff0c\u4e3a\u5408\u4f5c\u5185\u5bb9\u521b\u4f5c\u8005\u63d0\u4f9b\u6536\u5165\u5206\u6210\u3002\u5982\u679c\u60a8\u662f\u5185\u5bb9\u521b\u4f5c\u8005\u4e14\u6709\u5174\u8da3\u63a8\u5e7f\u672c\u6e38\u620f\uff0c\u8bf7\u53d1\u9001\u90ae\u4ef6\u81f3contact@milkywayidle.com\u6216\u5728Discord\u4e0a\u8054\u7cfb\u6211\u4eec\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u8be6\u60c5\u8bf7\u67e5\u770b\u66f4\u65b0\u65e5\u5fd7\u3002\n\t\t\t\t</div>'},17649792e5:{heading:"\u6210\u5c31\u3001\u6536\u85cf\u3001\u602a\u7269\u56fe\u9274\u7b49\u66f4\u591a\u5185\u5bb9\uff01",content:"<div>\n\t\t\t\t\t\u6211\u4eec\u5f88\u9ad8\u5174\u63a8\u51fa\u6700\u65b0\u529f\u80fd\uff0c\u8ba9\u60a8\u53ef\u4ee5\u901a\u8fc7\u5728\u6e38\u620f\u5404\u4e2a\u9886\u57df\u8fbe\u6210\u76ee\u6807\u6765\u83b7\u5f97\u6210\u5c31\u3002\u5b8c\u6210\u6574\u4e2a\u6210\u5c31\u9636\u5c42\u5c06\u83b7\u5f97\u6c38\u4e45\u589e\u76ca\uff0c\u7ed9\u60a8\u66f4\u591a\u8ffd\u6c42\u76ee\u6807\u7684\u52a8\u529b\u3002\u5728\u65b0\u7684\u6210\u5c31\u6807\u7b7e\u9875\u4e2d\u8ffd\u8e2a\u60a8\u7684\u8fdb\u5ea6\uff0c\u5e76\u5728\u4e2a\u4eba\u8d44\u6599\u4e0a\u5c55\u793a\u60a8\u7684\u6210\u5c31\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u9664\u4e86\u6210\u5c31\u7cfb\u7edf\uff0c\u6211\u4eec\u8fd8\u63a8\u51fa\u4e86\u6536\u85cf\u548c\u602a\u7269\u56fe\u9274\u529f\u80fd\u3002\u6536\u85cf\u529f\u80fd\u8ba9\u60a8\u8ffd\u8e2a\u6240\u6709\u83b7\u5f97\u8fc7\u7684\u7269\u54c1\uff0c\u8d5a\u53d6\u6536\u85cf\u70b9\u6570\uff0c\u5e76\u5728\u65b0\u7684\u6392\u884c\u699c\u4e0a\u7ade\u4e89\u3002\u602a\u7269\u56fe\u9274\u5219\u8bb0\u5f55\u60a8\u51fb\u8d25\u8fc7\u7684\u602a\u7269\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u6211\u4eec\u8fd8\u63a8\u51fa\u4e86\u8d24\u8005\u4e4b\u955c\uff0c\u4e00\u79cd\u65b0\u7684\u5f3a\u5316\u7269\u54c1\uff0c\u8ba9\u60a8\u5728\u9ad8\u5f3a\u5316\u7b49\u7ea7\u65f6\u66f4\u7a33\u5b9a\u5730\u5347\u7ea7\u88c5\u5907\u3002\u4f8b\u5982\uff0c\u4e00\u4e2a\u8d24\u8005\u4e4b\u955c\u914d\u5408+14\u7684\u7269\u54c1\u548c+13\u7684\u7269\u54c1\u5c06\u4fdd\u8bc1\u83b7\u5f97+15\u7684\u7269\u54c1\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u6700\u540e\uff0c\u6211\u4eec\u60f3\u544a\u77e5\u5927\u5bb6\uff0c\u5b9a\u5236\u88c5\u626e\u8bf7\u6c42\u5c06\u5728\u5e74\u5e95\u7ed3\u675f\u3002\u867d\u7136\u6211\u4eec\u5f88\u4eab\u53d7\u4e3a\u652f\u6301\u8005\u521b\u4f5c\u4e2a\u6027\u5316\u88c5\u626e\u7684\u8fc7\u7a0b\uff0c\u4f46\u8fd9\u5df2\u6210\u4e3a\u4e00\u9879\u5360\u7528\u5927\u91cf\u65f6\u95f4\u7684\u5de5\u4f5c\uff0c\u5f71\u54cd\u4e86\u5176\u4ed6\u5f00\u53d1\u5de5\u4f5c\u3002\u6211\u4eec\u5c06\u7ee7\u7eed\u63a5\u53d7\u8bf7\u6c42\u76f4\u5230\u5e74\u5e95\uff01\u652f\u6301\u8005\u70b9\u6570\u73b0\u5728\u53ef\u4ee5\u7528\u4e8e\u8d2d\u4e70\u793e\u533a\u589e\u76ca\uff0c\u66f4\u591a\u652f\u6301\u8005\u70b9\u6570\u7684\u7528\u9014\u6b63\u5728\u8ba1\u5212\u4e2d\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u8bbf\u95ee\u66f4\u65b0\u65e5\u5fd7\u4e86\u89e3\u66f4\u591a\u8be6\u60c5\u3002\n\t\t\t\t</div>"},1755558e6:{heading:"\u6218\u6597\u91cd\u505a\u3001\u62a4\u7b26\u548c\u7cbe\u70bc\u88c5\u5907",content:"<div>\n\t\t\t\t\t\u672c\u6b21\u66f4\u65b0\u5bf9\u6218\u6597\u7cfb\u7edf\u8fdb\u884c\u4e86\u91cd\u5927\u6539\u9769\uff0c\u540c\u65f6\u5f15\u5165\u4e86\u65b0\u7684\u529f\u80fd\uff0c\u5305\u62ec\u62a4\u7b26\u3001\u7cbe\u70bc\u7684\u5730\u7262\u88c5\u5907\uff0c\u4ee5\u53ca\u6269\u5c55\u7684\u6218\u6597\u96be\u5ea6\u5c42\u7ea7\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u5728\u957f\u671f\u7684\u6e38\u620f\u8fc7\u7a0b\u4e2d\uff0c\u6211\u4eec\u53d1\u73b0\u4e09\u79cd\u6218\u6597\u98ce\u683c\uff08\u8fd1\u6218\u3001\u8fdc\u7a0b\u548c\u9b54\u6cd5\uff09\u4e4b\u95f4\u5b58\u5728\u5e73\u8861\u6027\u95ee\u9898\u3002\u8fd9\u4e9b\u95ee\u9898\u4f7f\u5f97\u5728\u4e0d\u540c\u6218\u6597\u98ce\u683c\u548c\u4e0d\u540c\u8fdb\u5ea6\u9636\u6bb5\u4e4b\u95f4\u7ef4\u6301\u7ecf\u9a8c\u4e0e\u6536\u76ca\u5e73\u8861\u53d8\u5f97\u975e\u5e38\u56f0\u96be\u3002\u5176\u4e2d\u6700\u4e25\u91cd\u7684\u95ee\u9898\u5305\u62ec\uff1a\n\t\t\t\t\t<br />\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u4e13\u4e1a\u9700\u6c42\uff1a\u8fd1\u6218\u73a9\u5bb6\u9700\u8981\u989d\u5916\u7684\u653b\u51fb\u4e13\u4e1a\uff0c\u5bfc\u81f4\u7ecf\u9a8c\u5206\u914d\u548c\u589e\u76ca\u9053\u5177\u7684\u4f7f\u7528\u51fa\u73b0\u4e0d\u5e73\u8861\u3002</li>\n\t\t\t\t\t\t<li>\u9b54\u6cd5\u6280\u80fd\u589e\u957f\uff1a\u56e0\u4e3a\u9b54\u6cd5\u8f93\u51fa\u5168\u9760\u6280\u80fd\uff0c\u9b54\u6cd5\u4f24\u5bb3\u6280\u80fd\u6bcf\u7ea7\u7684DPS\u63d0\u5347\u5927\u7ea6\u662f\u5176\u4ed6\u98ce\u683c\u7684\u4e24\u500d\uff0c\u4f7f\u5f97\u5728\u6240\u6709\u8fdb\u5ea6\u9636\u6bb5\u4e2d\u5f88\u96be\u516c\u5e73\u5730\u5e73\u8861\u8f93\u51fa\u3002</li>\n\t\t\t\t\t\t<li>\u7ecf\u9a8c\u4e0d\u5e73\u8861\uff1a\u7ecf\u9a8c\u516c\u5f0f\u5728\u65e0\u610f\u4e2d\u504f\u5411\u67d0\u4e9b\u7b56\u7565\uff0c\u5373\u4f7fDPS\u76f8\u540c\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t<br />\n\t\t\t\t\t\u672c\u6b21\u91cd\u505a\u89e3\u51b3\u4e86\u8fd9\u4e9b\u4e0d\u5e73\u8861\uff0c\u5e76\u4e3a\u6218\u6597\u7684\u957f\u671f\u5e73\u8861\u5960\u5b9a\u4e86\u57fa\u7840\u3002\u4e3b\u8981\u6539\u52a8\u5305\u62ec\uff1a\n\t\t\t\t\t<br />\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u6240\u6709\u6218\u6597\u98ce\u683c\u73b0\u5728\u90fd\u9700\u8981\u4f9d\u9760\u653b\u51fb\u4e13\u4e1a\u6765\u63d0\u5347\u7cbe\u51c6\u5ea6\u3002\u73a9\u5bb6\u5c06\u7acb\u5373\u6839\u636e\u5176\u8fdc\u7a0b\u548c\u9b54\u6cd5\u7ecf\u9a8c\u768415%\u548c12%\u83b7\u5f97\u653b\u51fb\u7ecf\u9a8c\uff0c\u4ee5\u4f7f\u5176\u5177\u5907\u53ef\u884c\u6027\u3002\u653b\u51fb\u7ecf\u9a8c\u6bd4\u7387\u57fa\u4e8e\u6392\u884c\u699c\u6570\u636e\uff0c\u4ee5\u5141\u8bb8\u603b\u7ecf\u9a8c\u8d76\u4e0a\u8fd1\u6218\u3002</li>\n\t\t\t\t\t\t<li>\u9b54\u6cd5\u6280\u80fd\u7684\u6bcf\u7ea7\u4f24\u5bb3\u589e\u957f\u6bd4\u4f8b\u964d\u4f4e\u81f3\u6bcf\u7ea70.5%\u3002</li>\n\t\t\t\t\t\t<li>\u4e3a\u8fdc\u7a0b\u548c\u9b54\u6cd5\u88c5\u5907\u6dfb\u52a0\u4e86\u989d\u5916\u7684\u5956\u52b1\uff0c\u4ee5\u4fdd\u6301\u4e0e\u4e4b\u524d\u76f8\u4f3c\u7684\u4f24\u5bb3\u8f93\u51fa\u3002</li>\n\t\t\t\t\t\t<li>\u91cd\u76fe\u91cd\u505a\u5e76\u663e\u8457\u63d0\u9ad8\u4e86\u4f24\u5bb3\uff0c\u4ee5\u66f4\u63a5\u8fd1\u5176\u4ed6\u6218\u6597\u98ce\u683c\u7684\u8f93\u51fa\u3002</li>\n\t\t\t\t\t\t<li>\u5149\u73af\u7cfb\u7edf\u91cd\u505a\uff0c\u65b0\u589e\u57fa\u4e8e\u4e13\u4e1a\u7b49\u7ea7\u7684\u589e\u957f\u673a\u5236\uff0c\u5e76\u901a\u8fc7\u6280\u80fd\u4e66\u63d0\u4f9b\u4e00\u6b21\u6027\u7ecf\u9a8c\u9000\u6b3e\u3002</li>\n\t\t\t\t\t\t<li>\u65b0\u7684\u6218\u6597\u7ecf\u9a8c\u7cfb\u7edf\u4e0e\u51fb\u8d25\u7684\u602a\u7269\u76f8\u5173\u8054\uff0c\u62a4\u7b26\u5141\u8bb8\u4f60\u5c06\u8bad\u7ec3\u7ecf\u9a8c\u5206\u914d\u5230\u7279\u5b9a\u4e13\u4e1a\u4e0a\u3002</li>\n\t\t\t\t\t\t<li>\u961f\u4f0d\u7cfb\u7edf\u66f4\u65b0\uff1a\u7ecf\u9a8c\u5e73\u5747\u5206\u914d\uff0c\u7b49\u7ea7\u5dee\u5f02\u5927\u65f6\u7ecf\u9a8c\u548c\u6389\u843d\u51cf\u5c11\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t<br />\n\t\t\t\t\t\u968f\u7740\u6218\u6597\u91cd\u505a\uff0c\u6211\u4eec\u8fd8\u5f15\u5165\u4e86\u989d\u5916\u7684\u6218\u6597\u96be\u5ea6\u7b49\u7ea7\u3002\u6218\u6597\u533a\u57df\u96be\u5ea6\u73b0\u5728\u4eceT0\u5230T5\uff0c\u5e76\u4e14\u65b0\u7684\u62a4\u7b26\u53ef\u4ee5\u5728\u66f4\u9ad8\u96be\u5ea6\u7684\u533a\u57df\u4e2d\u627e\u5230\u3002T1\u548cT2\u5730\u7262\u4e5f\u5df2\u6dfb\u52a0\uff0c\u53ef\u4ee5\u83b7\u5f97\u7cbe\u70bc\u788e\u7247\u4ee5\u7cbe\u70bc\u4f60\u7684T95\u548c\u80cc\u90e8\u88c5\u5907\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u8bbf\u95ee\u66f4\u65b0\u65e5\u5fd7\u4ee5\u83b7\u53d6\u66f4\u591a\u8be6\u7ec6\u4fe1\u606f\u3002\n\t\t\t \t</div>"},17476092e5:{heading:"\u54de\u5361\u548c\u5176\u4ed6\u65b0\u95fb",content:"<div>\n\t\t\t\t\t\u54de\u5361\u4e0a\u7ebf\u5566\uff01\u8fd9\u662f\u4e00\u9879\u53ef\u9009\u7684\u4f1a\u5458\u7cfb\u7edf\uff0c\u80fd\u5e26\u6765\u4e00\u7cfb\u5217\u5b9e\u7528\u4f46\u5e76\u975e\u5fc5\u8981\u7684\u798f\u5229\uff01\n\t\t\t\t\t\u6240\u6709\u89d2\u8272\u90fd\u53ef\u4ee5\u514d\u8d39\u9886\u53d614\u5929\u54de\u5361\uff0c\u6b64\u5916\u6240\u6709\u73b0\u6709\u89d2\u8272\u8fd8\u989d\u5916\u83b7\u8d60\u4e8614\u5929\u4f7f\u7528\u65f6\u95f4\u3002\n\t\t\t\t\t\u60f3\u4e86\u89e3\u66f4\u591a\u8be6\u60c5\uff0c\u53ef\u4ee5\u67e5\u770b\u66f4\u65b0\u65e5\u5fd7\u6216\u76f4\u63a5\u524d\u5f80\u725b\u94c3\u5546\u5e97\u770b\u770b\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u52a0\u5165\u65b0\u7684\u4ed8\u8d39\u5185\u5bb9\uff0c\u6211\u4eec\u80fd\u7406\u89e3\u5927\u5bb6\u4f1a\u5173\u5fc3\u6e38\u620f\u672a\u6765\u7684\u65b9\u5411\uff0c\u5c24\u5176\u662f\u662f\u5426\u4f1a\u5f71\u54cd\u516c\u5e73\u6027\u3002\n\t\t\t\t\t\u6211\u4eec\u60f3\u518d\u6b21\u660e\u786e: \u6211\u4eec\u6ca1\u6709\u4efb\u4f55\u5f15\u5165\u5f3a\u5236\u6c2a\u91d1\u7684\u6253\u7b97\u3002\n\t\t\t\t\t\u54de\u5361\u7684\u8bbe\u8ba1\u7ecf\u8fc7\u4e86\u5927\u91cf\u73a9\u5bb6\u53cd\u9988\u7684\u53c2\u8003\uff0c\u76ee\u6807\u662f\u8ba9\u5b83\u5bf9\u4ed8\u8d39\u73a9\u5bb6\u548c\u514d\u8d39\u73a9\u5bb6\u90fd\u5b9e\u60e0\u53c8\u53cb\u597d\u3002\n\t\t\t\t\t\u5b83\u4e0d\u8bbe\u4efb\u4f55\u5185\u5bb9\u9650\u5236\uff0c\u4e0d\u4f1a\u5f71\u54cd\u6838\u5fc3\u73a9\u6cd5\u4f53\u9a8c\uff0c\u786e\u4fdd\u6240\u6709\u73a9\u5bb6\u90fd\u80fd\u516c\u5e73\u6e38\u620f\u3002\n\t\t\t\t\t\u540c\u65f6\uff0c\u54de\u5361\u4e3a\u6e38\u620f\u5f15\u5165\u4e86\u6301\u7eed\u4ef7\u503c\uff0c\u8ba9\u725b\u94c3\u7684\u9700\u6c42\u4e0d\u518d\u53ea\u4f9d\u8d56\u4e00\u6b21\u6027\u8d2d\u4e70\u7684\u4fbf\u5229\u529f\u80fd\u6216\u5916\u89c2\u9053\u5177\uff0c\n\t\t\t\t\t\u4ece\u800c\u6709\u52a9\u4e8e Milky Way Idle \u7684\u957f\u671f\u7a33\u5b9a\u53d1\u5c55\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u53e6\u5916\uff0c\u968f\u7740\u73a9\u5bb6\u4eba\u6570\u4e0d\u65ad\u4e0a\u5347\uff0c\u6211\u4eec\u7684\u7ba1\u7406\u56e2\u961f\u4e5f\u9762\u4e34\u4e86\u66f4\u5927\u7684\u6311\u6218\u3002\n\t\t\t\t\t\u76ee\u524d\u7684\u7ba1\u7406\u7cfb\u7edf\u4e3b\u8981\u4f9d\u8d56\u5fd7\u613f\u7ba1\u7406\u5458\u5728\u573a\u65f6\u4e3b\u52a8\u9605\u8bfb\u804a\u5929\u5185\u5bb9\u3002\n\t\t\t\t\t\u4f46\u6211\u4eec\u4e5f\u6536\u5230\u4e86\u4e00\u4e9b\u53cd\u9988\uff0c\u6709\u4eba\u89c9\u5f97\u7ba1\u7406\u8fc7\u4e8e\u4e25\u683c\uff0c\u4e5f\u6709\u4eba\u6307\u51fa\u7ba1\u7406\u5458\u4e0d\u5728\u7ebf\u65f6\u6709\u4e0d\u5f53\u8a00\u8bba\u88ab\u6f0f\u770b\u3002\n\t\t\t\t\t\u4e3a\u6b64\uff0c\u6211\u4eec\u6b63\u5728\u5f00\u53d1\u4e00\u4e2a\u66f4\u4f9d\u8d56\u73a9\u5bb6\u4e3e\u62a5\u7684\u65b0\u7cfb\u7edf\uff0c\n\t\t\t\t\t\u8ba9\u5927\u5bb6\u80fd\u66f4\u4e3b\u52a8\u53c2\u4e0e\u7ba1\u7406\u804a\u5929\u73af\u5883\u3002\n\t\t\t\t\t\u6bd4\u5982\uff0c\u5728\u7ba1\u7406\u5458\u4e0d\u5728\u7ebf\u65f6\uff0c\u82e5\u4e00\u6761\u6d88\u606f\u88ab\u8db3\u591f\u591a\u73a9\u5bb6\u4e3e\u62a5\uff0c\u5c31\u4f1a\u81ea\u52a8\u89e6\u53d1\u5904\u7406\u673a\u5236\u3002\n\t\t\t\t\t\u8fd9\u4e5f\u80fd\u51cf\u8f7b\u7ba1\u7406\u5458\u7684\u8d1f\u62c5\uff0c\u8ba9\u4ed6\u4eec\u4e13\u6ce8\u5904\u7406\u90a3\u4e9b\u5df2\u7ecf\u88ab\u793e\u533a\u6807\u8bb0\u51fa\u6765\u7684\u5185\u5bb9\u3002\n\t\t\t\t\t\u8fd9\u4e2a\u7cfb\u7edf\u9884\u8ba1\u4f1a\u5728\u63a5\u4e0b\u6765\u4e00\u5230\u4e24\u5468\u5185\u4e0a\u7ebf\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u6700\u540e\u518d\u6b21\u63d0\u9192\u5927\u5bb6\uff0c\u8bf7\u9075\u5b88\u5355\u8d26\u53f7\u89c4\u5219\u548c\u7981\u6b62\u901a\u8fc7\u5c0f\u53f7\u6216\u8d22\u5bcc\u8f6c\u79fb\u83b7\u53d6\u4e0d\u6b63\u5f53\u5229\u76ca\u7684\u89c4\u5b9a\u3002\n\t\t\t\t\t\u73b0\u5728\u6709\u5f88\u591a\u65b0\u73a9\u5bb6\u52a0\u5165\uff0c\u53ef\u80fd\u8fd8\u4e0d\u4e86\u89e3\u6211\u4eec\u5bf9\u4e8e\u5c0f\u53f7\u725f\u5229\u6216\u4ece\u91d1\u5546\u624b\u4e2d\u8d2d\u4e70\u91d1\u5e01\u7684\u6001\u5ea6\u3002\n\t\t\t\t\t\u6211\u4eec\u4f1a\u5b9a\u671f\u8fdb\u884c\u5c01\u53f7\u5904\u7406\u3002\u6bd4\u5982\u5728\u8fc7\u53bb\u51e0\u5468\u5185\uff0c\n\t\t\t\t\t\u6211\u4eec\u5bf9550\u591a\u4e2a\u4e3b\u8d26\u53f7\u548c\u6570\u5343\u4e2a\u5c0f\u53f7\u8fdb\u884c\u4e86\u6682\u65f6\u6216\u6c38\u4e45\u5c01\u7981\u3002\n\t\t\t\t\t\u88ab\u6682\u65f6\u5c01\u7981\u7684\u8d26\u53f7\u4e5f\u88ab\u79fb\u9664\u4e862\u52303\u500d\u7684\u4e0d\u6b63\u5f53\u91d1\u5e01\uff0c\u603b\u8ba1\u8d85\u8fc7120B\u91d1\u5e01\u3002\n\t\t\t\t\t\u4f5c\u5f0a\u98ce\u9669\u6781\u9ad8\uff0c\u6839\u672c\u4e0d\u503c\u5f97\u5192\u9669\u3002\u6211\u4eec\u4e5f\u4f1a\u6301\u7eed\u5347\u7ea7\u68c0\u6d4b\u7cfb\u7edf\uff0c\u4fdd\u969c\u516c\u5e73\u7684\u6e38\u620f\u73af\u5883\u3002\n\t\t\t\t</div>"},17449308e5:{heading:"\u5927\u578b\u66f4\u65b0 - \u6d77\u76d7\u57fa\u5730\u5730\u7262\u3001\u7b2c\u56db\u4e2a\u89d2\u8272\u69fd\u4f4d\u548c\u5b9a\u5236\u88c5\u9970\u54c1\u653f\u7b56\u66f4\u65b0",content:"<div>\n\t\t\t\t\t\u6d77\u76d7\u57fa\u5730\u5730\u7262\u73b0\u5df2\u5f00\u653e\u63a2\u7d22\uff01\u8fd9\u4e2a\u65b0\u5730\u7262\u6709\u5404\u79cd\u65b0\u7684T95\u6b66\u5668\u548c\u9632\u5177\uff0c\u4ee5\u53ca\u65b0\u7684\u6280\u80fd\u3002\u6211\u4eec\u8fd8\u5bf9\u73b0\u6709\u7269\u54c1\u548c\u6280\u80fd\u8fdb\u884c\u4e86\u4e00\u4e9b\u8c03\u6574\uff0c\u4ee5\u6539\u5584\u6e38\u620f\u5e73\u8861\u6027\u3002\u67e5\u770b\u5b8c\u6574\u7684\u66f4\u65b0\u65e5\u5fd7\u4ee5\u83b7\u53d6\u6240\u6709\u7ec6\u8282\uff01\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u53e6\u5916\uff0c\u6211\u4eec\u4e3a\u73a9\u5bb6\u6dfb\u52a0\u4e86\u4e00\u4e2a\u65b0\u7684\u7b2c\u56db\u4e2a\u89d2\u8272\u69fd\u4f4d\uff0c\u5141\u8bb8\u6bcf\u4e2a\u4eba\u6700\u591a\u62e5\u67091\u4e2a\u6807\u51c6\u89d2\u8272\u548c3\u4e2a\u94c1\u725b\u89d2\u8272\u3002\n\t\t\t\t\t<br />\n\t\t\t\t\t<br />\n\t\t\t\t\t\u6211\u4eec\u8fd8\u66f4\u65b0\u4e86\u6211\u4eec\u7684\u5b9a\u5236\u88c5\u9970\u54c1\u653f\u7b56\u548c\u5b9a\u4ef7\u3002\u867d\u7136\u8fd9\u4e2a\u529f\u80fd\u6700\u521d\u662f\u4f5c\u4e3a\u4e00\u4efd\u5c0f\u793c\u7269\uff0c\u7528\u6765\u8868\u8fbe\u6211\u4eec\u5bf9\u652f\u6301\u8005\u7684\u611f\u8c22\uff0c\u4f46\u968f\u7740\u73a9\u5bb6\u6570\u91cf\u7684\u5927\u5e45\u589e\u52a0\uff0c\u8fd9\u9879\u5de5\u4f5c\u5df2\u7ecf\u53d8\u5f97\u96be\u4ee5\u627f\u53d7\u3002\u8fc7\u53bb\u4e00\u4e2a\u6708\u6211\u4eec\u82b1\u4e86\u5927\u7ea6150\u5230200\u5c0f\u65f6\u5904\u7406\u4e86\u7ea6100\u4e2a\u8bf7\u6c42\uff0c\u6211\u4eec\u9700\u8981\u817e\u51fa\u66f4\u591a\u65f6\u95f4\u7528\u4e8e\u5176\u4ed6\u5f00\u53d1\u4efb\u52a1\u3002\u4ece5\u67081\u65e5\u8d77\uff0c\u7533\u8bf7\u81ea\u5b9a\u4e49\u5916\u89c2\u5c06\u9700\u8981\u6d88\u8017\u652f\u6301\u8005\u79ef\u5206\u548c\u725b\u94c3\u3002\u6240\u6709\u57284\u6708\u5e95\u524d\u63d0\u4ea4\u7684\u8bf7\u6c42\uff0c\u4ecd\u5c06\u6309\u7167\u4e4b\u524d\u7684\u652f\u6301\u8005\u79ef\u5206\u8981\u6c42\u8fdb\u884c\u5904\u7406\u3002\n\t\t\t\t</div>"},17348256e5:{heading:"\u6280\u827a\u62d3\u5c55\u7b2c\u4e8c\u90e8\u5206 - \u661f\u7a7a\u5de5\u5177\u548c\u6280\u827a\u670d\u88c5",content:"<div>\n\t\t\t\t\t\u6211\u4eec\u5f88\u9ad8\u5174\u5730\u63a8\u51fa\u6280\u827a\u62d3\u5c55\u7684\u7b2c\u4e8c\u90e8\u5206-\u661f\u7a7a\u5de5\u5177\u4e0e\u6280\u827a\u670d\u88c5\uff01\u5728\u4f7f\u7528\u795e\u5723\u5de5\u5177\u8fd9\u4e48\u957f\u7684\u65f6\u95f4\u4ee5\u6765\uff0c\u4e13\u7cbe\u7684\u73a9\u5bb6\u4eec\u7ec8\u4e8e\u53c8\u80fd\u83b7\u5f97\u8fdb\u4e00\u6b65\u7684\u88c5\u5907\u5347\u7ea7\u4e86\uff01\u8fd9\u4e9b\u65b0\u7269\u54c1\u5e76\u4e0d\u5bb9\u6613\u83b7\u5f97\uff0c\u4f46\u5bf9\u4e8e\u8db3\u591f\u52e4\u594b\uff08\u6216\u5bcc\u6709\uff09\u7684\u73a9\u5bb6\u6765\u8bf4\uff0c\u6210\u529f\u83b7\u53d6\u5b83\u4eec\u5c06\u5e26\u6765\u663e\u8457\u7684\u63d0\u5347\u3002\u6295\u8eab\u5176\u4e2d\uff0c\u5c06\u4f60\u7684\u6280\u827a\u63a8\u5411\u65b0\u4e00\u6ce2\u7684\u9ad8\u5cf0\u5427\uff01\n\t\t\t\t</div>"}},patchNotesPanel:{patchNotes:"\u66f4\u65b0\u65e5\u5fd7"},patchNotesText:{17730432e5:{heading:"\u5c0f\u578b\u66f4\u65b0 - \u4f53\u9a8c\u4f18\u5316\u548cBUG\u4fee\u590d",content:'<div>\n\t\t\t\t\t\u4f53\u9a8c\u4f18\u5316:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u5728\u81ea\u52a8\u5316\u8bbe\u7f6e\u4e2d\u6dfb\u52a0\u4e86"\u76f4\u5954\u51fa\u53e3\u5230\u5c42\u6570"\u9009\u9879\u3002</li>\n\t\t\t\t\t\t<li>\u5728\u81ea\u52a8\u5316\u8bbe\u7f6e\u4e2d\u6dfb\u52a0\u4e86"\u624b\u52a8\u5bfb\u8def\u65f6\u5ffd\u7565\u8df3\u8fc7\u9608\u503c"\u9009\u9879\u3002</li>\n\t\t\t\t\t\t<li>\u8ff7\u5bab\u6700\u5927\u5165\u573a\u6b21\u6570\u4ece3\u6b21\u589e\u52a0\u52305\u6b21\u3002</li>\n\t\t\t\t\t\t<li>\u706b\u628a\u5347\u7ea7\u4e0a\u9650\u63d0\u9ad8\u81f315\u7ea7\uff08\u6700\u591a400\u4e2a\uff09\u3002</li>\n\t\t\t\t\t\t<li>\u5b8c\u5168\u81ea\u52a8\u5316\u4e0a\u9650\u63d0\u9ad8\u81f312\u7ea7\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u754c\u9762:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u73b0\u5728\u53ef\u4ee5\u4ece\u5176\u4ed6\u9875\u9762\u4ee5\u5f39\u7a97\u5f62\u5f0f\u6253\u5f00\u5e02\u573a\u3002</li>\n\t\t\t\t\t\t<li>\u5370\u7ae0\u5df2\u91cd\u547d\u540d\u4e3a\u5377\u8f74\u3002</li>\n\t\t\t\t\t\t<li>\u5c06\u5377\u8f74\u79fb\u81f3\u7269\u54c1\u680f\u4e2d\u7684\u72ec\u7acb\u5206\u7c7b\uff0c\u5e76\u4f7f\u63d0\u793a\u4fe1\u606f\u66f4\u8be6\u7ec6\u3002</li>\n\t\t\t\t\t\t<li>\u8c03\u6574\u4e86\u9003\u79bb\u6309\u94ae\u5e03\u5c40\u5e76\u6dfb\u52a0\u4e86\u989d\u5916\u786e\u8ba4\u4ee5\u51cf\u5c11\u8bef\u64cd\u4f5c\u3002\u5982\u679c\u4ecd\u6709\u53ef\u80fd\u7ee7\u7eed\u63a8\u8fdb\uff08\u62e5\u6709\u706b\u628a\u3001\u53ef\u6e05\u9664\u7684\u623f\u95f4\u7b49\uff09\uff0c\u5c06\u663e\u793a\u786e\u8ba4\u5bf9\u8bdd\u6846\u3002</li>\n\t\t\t\t\t\t<li>\u5728\u9876\u90e8\u8fdb\u5ea6\u6761\u4e2d\u6dfb\u52a0\u4e86\u8ff7\u5bab\u8ba1\u65f6\u5668\u3002</li>\n\t\t\t\t\t\t<li>\u5728\u8ff7\u5bab\u4fe1\u606f\u4e2d\u6dfb\u52a0\u4e86\u589e\u76ca\u540e\u7684\u6218\u6597\u7b49\u7ea7\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5e73\u8861\u8c03\u6574:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u7f8e\u98df\u5377\u8f74\u7684\u52a0\u6210\u4ece16%\u6539\u4e3a10%\u3002\u73b0\u5728\u8fd8\u53ef\u4ee5\u5728\u8ff7\u5bab\u4e2d\u4e3a\u70f9\u996a/\u917f\u9020\u63d0\u4f9b\u53cc\u500d\u8fdb\u5ea6\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u88c5\u9970\u54c1:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u6dfb\u52a0\u4e86\u8ff7\u5bab\u602a\u7269\u7684\u804a\u5929\u56fe\u6807\u3002</li>\n\t\t\t\t\t\t<li>\u6dfb\u52a0\u4e86\u6d77\u5996\u5934\u50cf\u548c\u5957\u88c5\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u9519\u8bef\u4fee\u590d:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u5728\u8ddd\u79bb\u4e0b\u6b21\u5165\u573a\u4e0d\u52304\u5c0f\u65f6\u65f6\u8d2d\u4e70\u51b7\u5374\u5347\u7ea7\u540e\u672a\u80fd\u7acb\u5373\u6388\u4e88\u8ff7\u5bab\u5165\u573a\u8d44\u683c\u7684\u95ee\u9898\u3002</li>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u5728\u8ff7\u5bab\u5185\u6280\u80fd\u5347\u7ea7\u65f6\u804a\u5929\u5347\u7ea7\u6d88\u606f\u672a\u6b63\u786e\u663e\u793a\u7684\u95ee\u9898\u3002</li>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u79fb\u52a8\u7aef\u7269\u54c1\u63d0\u793a\u5728\u70b9\u51fb\u6253\u5f00\u7269\u54c1\u83dc\u5355\u65f6\u4e0d\u5fc5\u8981\u663e\u793a\u7684\u95ee\u9898\u3002</li>\n\t\t\t\t\t\t<li>\u8ff7\u5bab\u6280\u80fd\u623f\u95f4\u8ba1\u65f6\u5668\u73b0\u5728\u4f1a\u5728\u663e\u793a\u65f6\u6b63\u786e\u4e0e\u670d\u52a1\u5668\u65f6\u95f4\u540c\u6b65\u3002</li>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u4f7f\u7528\u906e\u853d\u53ef\u80fd\u5bfc\u81f4\u5e38\u89c4\u6218\u6597\u88ab\u4e2d\u65ad\u7684\u7f55\u89c1\u95ee\u9898\u3002</li>\n\t\t\t\t\t\t<li>\u4e2a\u4eba\u589e\u76ca\u5230\u671f\u73b0\u5728\u4f1a\u5b9e\u65f6\u66f4\u65b0\uff0c\u800c\u4e0d\u662f\u6709\u65f6\u4f1a\u6709\u77ed\u6682\u5ef6\u8fdf\u3002</li>\n\t\t\t\t\t\t<li>\u63a2\u8def\u8005\u9774\u5b50\u7684\u88c1\u7f1d\u7ecf\u9a8c\u503c\u73b0\u5728\u4e0e\u5176\u4ed6\u9774\u5b50\u4e00\u81f4\u3002</li>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u4e0e\u8ff7\u5bab\u5185\u5bb9\u76f8\u5173\u7684\u7ffb\u8bd1\u4e0d\u4e00\u81f4\u95ee\u9898\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>'},17718228e5:{heading:"\u70ed\u4fee\u590d",content:"<div>\n\t\t\t\t\t\u9519\u8bef\u4fee\u590d:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u6392\u961f\u961f\u4f0d\u51c6\u5907\u65f6\u672a\u6b63\u786e\u5305\u542b\u914d\u88c5\u7684\u95ee\u9898\u3002</li>\n\t\t\t\t\t\t<li>\u6b63\u786e\u79fb\u9664\u6218\u6597\u4e2d\u8fc7\u671f\u7684\u4e2a\u4eba\u589e\u76ca\u3002</li>\n\t\t\t\t\t\t<li>\u8865\u7ed9\u7bb1\u7684\u8d39\u7528\u548c\u7ecf\u9a8c\u503c\u83b7\u53d6\u901f\u7387\u8ba1\u7b97\u6709\u8bef\uff0c\u4e0e\u5176\u4ed6\u8ff7\u5bab\u8865\u7ed9\u54c1\u5b58\u5728\u663e\u8457\u5dee\u5f02\u3002\u98df\u7269\u7bb1\u7684\u8d39\u7528\u589e\u52a0\u4e866\u500d\uff0c\u8336\u7bb1\u548c\u5496\u5561\u7bb1\u589e\u52a0\u4e863.3\u500d\u3002\u73b0\u6709\u7269\u54c1\u5c06\u6309\u6bd4\u4f8b\u51cf\u5c11\u5e76\u5411\u4e0a\u53d6\u6574\uff0c\u4ee5\u4fdd\u6301\u76f8\u540c\u7684\u603b\u4ef7\u503c\u3002\u7ecf\u9a8c\u503c\u548c\u5236\u4f5c\u65f6\u95f4\u4e5f\u5df2\u8c03\u6574\uff0c\u4ee5\u5339\u914d\u5176\u4ed6\u8ff7\u5bab\u8865\u7ed9\u54c1\u7684\u7ecf\u9a8c\u503c\u901f\u7387\u3002\u8865\u7ed9\u7bb1\u7684\u5e02\u573a\u51fa\u552e\u6302\u5355\u5df2\u7acb\u5373\u8bbe\u7f6e\u4e3a\u8fc7\u671f\uff0c\u56e0\u4e3a\u5b83\u4eec\u7684\u5b9a\u4ef7\u4e0d\u518d\u6b63\u786e\uff0c\u672a\u9886\u53d6\u7684\u7269\u54c1\u4e5f\u6309\u76f8\u540c\u6bd4\u4f8b\u8c03\u6574\u3002</li>\n\t\t\t\t\t\t<li>\u65b0\u8d2d\u4e70\u7684\u54de\u5361\u73b0\u5728\u80fd\u6b63\u786e\u6388\u4e88+3\u8ff7\u5bab\u8def\u5f84\u957f\u5ea6\u3002</li>\n\t\t\t\t\t\t<li>\u6b63\u786e\u8ba1\u7b97\u8ff7\u5bab\u4e2d\u7684\u6709\u6548\u6218\u6597\u7b49\u7ea7\u3002\u6b64\u524d\u4f7f\u7528\u4e86\u4e00\u4e2a\u4e0e\u5b9e\u9645\u6218\u6597\u7b49\u7ea7\u7565\u6709\u4e0d\u540c\u7684\u9519\u8bef\u516c\u5f0f\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5e73\u8861\u8c03\u6574:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u964d\u4f4e\u4e86\u5b9d\u7bb1\u602a\u7684\u751f\u547d\u503c8%\u548c\u91cd\u51fb\u7684\u95ea\u907f\u738715%\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u754c\u9762:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u5728\u8ff7\u5bab\u602a\u7269\u7684\u63d0\u793a\u4fe1\u606f\u4e2d\u6dfb\u52a0\u4e86\u5f31\u70b9\u663e\u793a\u3002</li>\n\t\t\t\t\t\t<li>\u5728\u4e0b\u964d\u5230\u8ff7\u5bab\u4e0b\u4e00\u5c42\u65f6\u6dfb\u52a0\u4e86\u786e\u8ba4\u5bf9\u8bdd\u6846\uff0c\u4ee5\u907f\u514d\u8bef\u70b9\u3002</li>\n\t\t\t\t\t\t<li>\u5bf9\u8ff7\u5bab\u8bf4\u660e\u548c\u6e38\u620f\u6307\u5357\u8fdb\u884c\u4e86\u5c0f\u5e45\u6539\u8fdb\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>"},17717184e5:{heading:"\u5927\u578b\u66f4\u65b0 - \u8ff7\u5bab\u53ca\u4f53\u9a8c\u4f18\u5316",content:'<div>\n\t\t\t\t\t\u8ff7\u5bab\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u8ff7\u5bab\u7531\u591a\u5c42\u751f\u6d3b\u548c\u6218\u6597\u6311\u6218\u7ec4\u6210\uff0c\u96be\u5ea6\u9010\u5c42\u9012\u589e\u3002\u5728\u623f\u95f4\u7f51\u683c\u4e2d\u63a2\u7d22\u524d\u8fdb\uff0c\u6536\u96c6\u6218\u5229\u54c1\uff0c\u5e76\u5411\u66f4\u6df1\u5c42\u63a8\u8fdb\u3002\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\u6bcf\u5c42\u5305\u542b\u751f\u6d3b\u6311\u6218\u3001\u6218\u6597\u906d\u9047\u3001\u5b9d\u85cf\u623f\u95f4\u548c\u697c\u5c42\u51fa\u53e3\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u6bcf\u6b21\u8fdb\u5165\u53ef\u643a\u5e26\u9053\u5177\uff1a\u706b\u628a\u3001\u6597\u7bf7\u3001\u63a2\u7167\u706f\u548c\u8865\u7ed9\u7bb1\u3002\u6bcf\u79cd\u5747\u6709\u4e09\u4e2a\u7b49\u7ea7\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u83b7\u53d6\u8ff7\u5bab\u4ee3\u5e01\u3001\u7d2b\u591a\u62c9\u4e4b\u76d2\u548c\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1\u3002\u5956\u52b1\u968f\u697c\u5c42\u6df1\u5ea6\u589e\u52a0\u3002\u5728\u8ff7\u5bab\u5546\u5e97\u4e2d\u4f7f\u7528\u4ee3\u5e01\u8d2d\u4e70\u5347\u7ea7\u548c\u72ec\u7279\u7269\u54c1\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u7269\u54c1\u5956\u52b1\u5305\u62ec\uff1a4\u4ef6\u751f\u6d3b\u62ab\u98ce\u30013\u53cc\u9774\u5b50\uff0c\u4ee5\u53ca\u5377\u8f74\u2014\u2014\u4e00\u79cd\u65b0\u7c7b\u578b\u7684\u7269\u54c1\uff0c\u53ef\u63d0\u4f9b\u9650\u65f6\u4e2a\u4eba\u589e\u76ca\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u81ea\u52a8\u5316\u7cfb\u7edf\uff0c\u652f\u6301\u6309\u623f\u95f4\u7c7b\u578b\u8bbe\u7f6e\u914d\u88c5\u3001\u8df3\u8fc7\u9608\u503c\u548c\u5168\u81ea\u52a8\u5bfb\u8def\u3002</li>\n\t\t\t\t\t\t\t\t<li>4\u4e2a\u4e0e\u8ff7\u5bab\u76f8\u5173\u7684\u65b0\u6210\u5c31\u3002\u6210\u5c31\u9636\u5c42\u589e\u76ca\u5c06\u9700\u8981\u5b8c\u6210\u65b0\u589e\u7684\u6210\u5c31\uff0c\u4e0d\u8fc7\u5bf9\u4e8e\u5df2\u5b8c\u6210\u8be5\u9636\u5c42\u5176\u4f59\u6210\u5c31\u7684\u73a9\u5bb6\u6765\u8bf4\u5e94\u8be5\u4e0d\u4f1a\u592a\u96be\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u8ff7\u5bab\u602a\u7269\u548c\u7269\u54c1\u7684\u65b0\u6536\u85cf\u6761\u76ee\u548c\u602a\u7269\u56fe\u9274\u6761\u76ee\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u8ff7\u5bab\u79ef\u5206\u548c\u8ff7\u5bab\u6df1\u5ea6\u6392\u884c\u699c\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u8be6\u60c5\u8bf7\u67e5\u770b\u6e38\u620f\u6307\u5357\u3002</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u8282\u65e5:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u65b0\u6625\u8282\u65e5\u9650\u5b9a\u88c5\u626e\uff1a\u804a\u5929\u56fe\u6807\u3001\u5934\u50cf\u548c\u5934\u50cf\u88c5\u626e\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u4f53\u9a8c\u4f18\u5316:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u6d4f\u89c8\u5668\u901a\u77e5\u529f\u80fd\uff0c\u652f\u6301Steam\u548c\u6d4f\u89c8\u5668\u73a9\u5bb6\u63a5\u6536\u5404\u79cd\u6e38\u620f\u4e8b\u4ef6\u901a\u77e5\uff08\u79fb\u52a8\u7aef\u6682\u4e0d\u652f\u6301\uff09\u3002\u53ef\u5728\u8bbe\u7f6e\u4e2d\u914d\u7f6e\u3002</li>\n\t\t\t\t\t\t<li>\u5141\u8bb8"\u7acb\u5373\u5f00\u59cb"\u5c06\u64cd\u4f5c\u63d2\u5165\u5230\u64cd\u4f5c\u961f\u5217\u6700\u524d\u65b9\uff0c\u800c\u975e\u66ff\u6362\u5f53\u524d\u961f\u5217\u3002\u53ef\u5728\u8bbe\u7f6e -> \u6e38\u620f\u4e2d\u542f\u7528\u3002</li>\n\t\t\t\t\t\t<li>\u961f\u4f0d\u51c6\u5907\u73b0\u5728\u53ef\u4ee5\u5728\u5355\u4eba\u64cd\u4f5c\u540e\u6392\u961f\uff0c\u8ba9\u60a8\u65e0\u9700\u5728\u573a\u5373\u53ef\u81ea\u52a8\u8fd4\u56de\u961f\u4f0d\u6218\u6597\u3002</li>\n\t\t\t\t\t\t<li>\u9006\u7cbe\u70bc\u70bc\u91d1\u64cd\u4f5c\uff1a\u5c06\u7cbe\u70bc\u88c5\u5907\u8fd8\u539f\u4e3a\u57fa\u7840\u7248\u672c\uff0c\u4fdd\u7559\u5f3a\u5316\u7b49\u7ea7\u5e76\u8fd4\u8fd8\u4e00\u534a\u7684\u7cbe\u70bc\u788e\u7247\u3002</li>\n\t\t\t\t\t\t<li>\u961f\u4f0d\u6218\u6597\u7ecf\u9a8c\u60e9\u7f5a\u73b0\u5728\u9700\u8981\u81f3\u5c1110\u7ea7\u5dee\u8ddd\u624d\u4f1a\u751f\u6548\u3002\u8fd9\u9632\u6b62\u4e86\u4f4e\u7b49\u7ea7\u73a9\u5bb6\u7ec4\u961f\u65f6\u88ab\u4e0d\u5f53\u60e9\u7f5a\u3002</li>\n\t\t\t\t\t\t<li>\u589e\u52a0\u4e8610\u4e2a\u53ef\u8d2d\u4e70\u7684\u914d\u88c5\u680f\u4f4d\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u754c\u9762:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u7279\u6b8a\u804a\u5929\u56fe\u6807\u73b0\u5728\u4f1a\u5728\u5927\u591a\u6570\u663e\u793a\u89d2\u8272\u540d\u79f0\u7684\u4f4d\u7f6e\u663e\u793a\uff0c\u800c\u4e0d\u4ec5\u9650\u4e8e\u804a\u5929\u4e2d\u3002</li>\n\t\t\t\t\t\t<li>\u7efc\u5408\u9891\u9053\u4e2d\u7684\u5347\u7ea7\u6d88\u606f\u73b0\u5728\u4ec5\u5bf9150\u7ea7\u4ee5\u4e0a\u6216\u603b\u7b49\u7ea72000\u4ee5\u4e0a\u7684\u73a9\u5bb6\u663e\u793a\uff0c\u56e0\u4f4e\u7b49\u7ea7\u6d88\u606f\u8fc7\u4e8e\u9891\u7e41\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5176\u4ed6:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u521b\u4f5c\u8005\u4ee3\u7801\u8ba1\u5212\uff1a\u4e3a\u5408\u4f5c\u5185\u5bb9\u521b\u4f5c\u8005\u63d0\u4f9b\u6536\u5165\u5206\u6210\u3002\u5982\u679c\u60a8\u662f\u5185\u5bb9\u521b\u4f5c\u8005\u4e14\u6709\u5174\u8da3\u63a8\u5e7f\u672c\u6e38\u620f\uff0c\u8bf7\u53d1\u9001\u90ae\u4ef6\u81f3contact@milkywayidle.com\u6216\u5728Discord\u4e0a\u8054\u7cfb\u6211\u4eec\u3002</li>\n\t\t\t\t\t\t<li>\u6bcf\u5c0f\u65f6marketplace.json API\u6570\u636e\u73b0\u5728\u5305\u542b\u6210\u4ea4\u91cf\u548c\u5e73\u5747\u4ef7\u683c\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>'},17652528e5:{heading:"BUG\u4fee\u590d",content:"<div>\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u6b63\u786e\u8ba1\u7b97\u8fbe\u5230\u7279\u5b9a\u8282\u70b9\u65f6\u7684\u602a\u7269\u56fe\u9274\u70b9\u6570\u3002</li>\n                        <li>\u4fee\u590d\u79bb\u7ebf\u65f6\u5b8c\u6210\u6210\u5c31\u540e\u6210\u5c31\u589e\u76ca\u672a\u6b63\u786e\u6388\u4e88\u7684\u95ee\u9898\u3002</li>\n                        <li>\u4e3a\u62e5\u6709T90\u888b\u5b50\u7684\u94c1\u725b\u73a9\u5bb6\u8865\u5145\u8be5\u7269\u54c1\u6536\u85cf\uff0c\u56e0\u5148\u524d\u94c1\u725b\u6a21\u5f0f\u6570\u636e\u56de\u6eaf\u65f6\u9057\u6f0f\u3002</li>\n                        <li>\u4fee\u590d\u623f\u5c4b\u5efa\u9020\u6309\u94ae\u4f4d\u7f6e\u3002</li>\n                        <li>\u7ffb\u8bd1\u4e2a\u4eba\u8d44\u6599\u4e2d\u7684\u6210\u5c31\u7b49\u7ea7\u6807\u7b7e\u3002</li>\n                        <li>\u4fee\u590d\u4e00\u4e9b\u5176\u4ed6\u5c0f\u95ee\u9898\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>"},17649792e5:{heading:"\u5927\u578b\u66f4\u65b0 - \u6210\u5c31\u3001\u6536\u85cf\u3001\u602a\u7269\u56fe\u9274\u7b49\u66f4\u591a\u5185\u5bb9",content:"<div>\n\t\t\t\t\t\u529f\u80fd\u548c\u5185\u5bb9:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6210\u5c31:\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>73\u4e2a\u6210\u5c31\uff0c\u6db5\u76d66\u4e2a\u96be\u5ea6\u9636\u5c42\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u5b8c\u6210\u6bcf\u4e2a\u9636\u5c42\u53ef\u83b7\u5f97\u6c38\u4e45\u589e\u76ca\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u4f7f\u7528Steam\u5ba2\u6237\u7aef\u6e38\u73a9\u65f6\uff0c\u6210\u5c31\u4f1a\u4e0eSteam\u6210\u5c31\u540c\u6b65\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u5728\u5176\u4ed6\u73a9\u5bb6\u7684\u4e2a\u4eba\u8d44\u6599\u4e0a\u67e5\u770b\u4ed6\u4eec\u7684\u6210\u5c31\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u5927\u90e8\u5206\u6210\u5c31\u4e0d\u4f1a\u8ffd\u6eaf\uff0c\u9700\u8981\u91cd\u65b0\u83b7\u5f97\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u4ec5\u9650\u94c1\u725b\u6a21\u5f0f\uff1a\u5982\u679c\u60a8\u4e4b\u524d\u5df2\u83b7\u5f97\u76f8\u5173\u7269\u54c1\uff0c\u7cbe\u82f1\u548c\u51a0\u519b\u9636\u5c42\u7684\u7269\u54c1\u76f8\u5173\u6210\u5c31\u5c06\u4f1a\u8ffd\u6eaf\u3002</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6536\u85cf:\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\u8ffd\u8e2a\u60a8\u5728\u5192\u9669\u8fc7\u7a0b\u4e2d\u6536\u96c6\u7684\u6240\u6709\u7269\u54c1\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u6536\u96c6\u6bcf\u79cd\u7269\u54c11\u4e2a\u300110\u4e2a\u3001100\u4e2a\u30011000\u4e2a\u300110000\u4e2a\u7b49\u6570\u91cf\u53ef\u83b7\u5f97\u9012\u589e\u7684\u6536\u85cf\u70b9\u6570\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u6839\u636e\u6536\u85cf\u70b9\u6570\u83b7\u5f97\u91cc\u7a0b\u7891\u5956\u52b1\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u6536\u85cf\u8fdb\u5ea6\u663e\u793a\u5728\u6392\u884c\u699c\u4e0a\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u5728\u804a\u5929\u4e2d\u94fe\u63a5\u5206\u4eab\u5df2\u6536\u96c6\u7684\u7269\u54c1\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u4ece\u5e02\u573a\u548c\u6742\u8d27\u5546\u5e97\u8d2d\u4e70\u7684\u7269\u54c1\u4e0d\u8ba1\u5165\u6536\u85cf\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u5df2\u62e5\u6709\u7684\u4efb\u52a1\u5fbd\u7ae0\u548c\u80cc\u90e8\u88c5\u5907\u5c06\u8ffd\u6eaf\u6dfb\u52a0\u5230\u60a8\u7684\u6536\u85cf\u4e2d\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u4ec5\u9650\u94c1\u725b\u6a21\u5f0f\uff1a\u5df2\u62e5\u6709\u7684\u4e00\u4e9b\u7a00\u6709\u7269\u54c1\u5c06\u8ffd\u6eaf\u6dfb\u52a0\u5230\u60a8\u7684\u6536\u85cf\u4e2d\u3002</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u602a\u7269\u56fe\u9274:\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\u8ffd\u8e2a\u60a8\u51fb\u8d25\u7684\u6240\u6709\u602a\u7269\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u51fb\u8d25\u6bcf\u79cd\u602a\u72691\u53ea\u300110\u53ea\u3001100\u53ea\u30011000\u53ea\u300110000\u53ea\u7b49\u6570\u91cf\u53ef\u83b7\u5f97\u9012\u589e\u7684\u56fe\u9274\u70b9\u6570\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u6839\u636e\u56fe\u9274\u70b9\u6570\u83b7\u5f97\u91cc\u7a0b\u7891\u5956\u52b1\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u56fe\u9274\u8fdb\u5ea6\u663e\u793a\u5728\u6392\u884c\u699c\u4e0a\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u6bcf\u7ea7\u96be\u5ea6\u90fd\u4f1a\u989d\u5916+1\u51fb\u8d25\u6b21\u6570\u3002</li>\n\t\t\t\t\t\t\t\t<li>\u7ec4\u961f\u65f6\uff0c\u56fe\u9274\u8d21\u732e\u5c06\u5728\u961f\u4f0d\u6210\u5458\u4e4b\u95f4\u5206\u914d\u3002</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u8d24\u8005\u4e4b\u955c\uff1a\u5141\u8bb8\u5408\u5e76\u88c5\u5907\u8fdb\u884c100%\u6210\u529f\u7387\u7684\u5f3a\u5316\u3002\uff08\u4f8b\u5982\uff1a+13\u7269\u54c1 + +14\u7269\u54c1 + \u8d24\u8005\u4e4b\u955c -> +15\u7269\u54c1\uff09\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u793e\u533a\u589e\u76ca\u73b0\u5728\u53ef\u4ee5\u4f7f\u7528\u652f\u6301\u8005\u70b9\u6570\u8d2d\u4e70\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u4f53\u9a8c\u4f18\u5316:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u914d\u88c5\u73b0\u5728\u53ef\u4ee5\u76f4\u63a5\u7f16\u8f91\uff0c\u65e0\u9700\u91cd\u65b0\u521b\u5efa\u3002</li>\n\t\t\t\t\t\t<li>\u6218\u6597\u89e6\u53d1\u5668\u73b0\u5728\u53ef\u4ee5\u4fdd\u5b58\u5230\u914d\u88c5\u5e76\u968f\u914d\u88c5\u52a0\u8f7d\u3002</li>\n\t\t\t\t\t\t<li>\u70b9\u51fb\u53f3\u4e0a\u89d2\u7684\u5934\u50cf\u53ef\u6253\u5f00\u5feb\u6377\u83dc\u5355\uff0c\u65b9\u4fbf\u5bfc\u822a\u3002</li>\n\t\t\t\t\t\t<li>\u5e02\u573a\u5217\u8868\u73b0\u5728\u4f1a\u663e\u793a\u60a8\u6240\u6709\u7684\u6302\u5355\uff0c\u5373\u4f7f\u5b83\u4eec\u4e0d\u5728\u524d20\u540d\u5185\u3002</li>\n\t\t\t\t\t\t<li>\u6dfb\u52a0\u4e86\u5b9e\u65f6\u5e02\u573a\u4ef7\u683c\u8b66\u544a\uff0c\u5f53\u521b\u5efa\u7684\u6302\u5355\u4ef7\u683c\u660e\u663e\u9ad8\u4e8e\u4f30\u8ba1\u516c\u5e73\u4ef7\u683c\u65f6\u4f1a\u63d0\u9192\u3002\uff08\u5b9e\u9a8c\u6027\u529f\u80fd\uff09</li>\n\t\t\t\t\t\t<li>\u6dfb\u52a0\u4e86\u53d6\u6d88\u961f\u4f0d\u6218\u6597\u51c6\u5907\u7684\u4e8c\u6b21\u786e\u8ba4\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u9519\u8bef\u4fee\u590d:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u914d\u88c5\u9519\u8bef\u663e\u793a\u7f3a\u5931\u7269\u54c1\u7684\u89c6\u89c9\u95ee\u9898\u3002</li>\n\t\t\t\t\t\t<li>\u4fee\u590d\u4e86\u5404\u79cd\u672c\u5730\u5316\u548c\u7ffb\u8bd1\u95ee\u9898\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5176\u4ed6:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\u5b9a\u5236\u88c5\u626e\u8bf7\u6c42\u5c06\u5728\u5e74\u5e95\u540e\u4e0d\u518d\u63a5\u53d7\u3002</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>"},17603964e5:{heading:"\u5c0f\u578b\u66f4\u65b0 - \u4e07\u5723\u8282\u3001\u4f53\u9a8c\u4f18\u5316\u548c\u6742\u9879\u66f4\u65b0",content:"<div>\n\t\t\t\t\t\u529f\u80fd\u548c\u5185\u5bb9:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5728\u725b\u94c3\u5546\u5e97\u4e2d\u6dfb\u52a0\u4e86\u4e07\u5723\u8282\u88c5\u626e\u3002\u5b63\u8282\u6027\u88c5\u626e\u73b0\u5728\u4f1a\u663e\u793a\u5728\u5546\u5e97\u4e2d\u7684\u5269\u4f59\u65f6\u95f4\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5728\u725b\u94c3\u5546\u5e97\u4e2d\u6dfb\u52a0\u4e86\u65b0\u7684\u804a\u5929\u56fe\u6807\uff1a\u9e7f\u89d2\u5154\u3001\u9b54\u672f\u5e08\u3001\u79d8\u6cd5\u738b\u540e\u548c\u6301\u951a\u9ca8\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u589e\u52a0\u4e86\u53ef\u8d2d\u4e70\u7684\u914d\u88c5\u69fd\u6570\u91cf\uff0c\u5e76\u6dfb\u52a0\u4e86\u66f4\u591a\u4f4e\u4ef7\u9009\u9879\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u754c\u9762:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u54de\u5361\u56fe\u6807\u73b0\u5728\u4f1a\u663e\u793a\u5230\u671f\u524d\u7684\u5269\u4f59\u5929\u6570\u3002\u5f53\u5269\u4f59\u65f6\u95f4\u5c11\u4e8e1\u5929\u65f6\u5c06\u663e\u793a\u7ea2\u8272\u8fb9\u6846\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u9996\u6b21\u8bbf\u95ee\u5e02\u573a\u65f6\u7684\u4ea4\u6613\u89c4\u5219\u786e\u8ba4\u5f39\u7a97\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5bf9UI\u8fdb\u884c\u4e86\u5c0f\u5e45\u8c03\u6574\uff0c\u5305\u62ec\u6807\u7b7e\u8bbe\u8ba1\u548c\u5e03\u5c40\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u9a8c\u8bc1\u7801\u9a8c\u8bc1\uff0c\u53ef\u80fd\u4f1a\u5728\u8fde\u63a5\u6e38\u620f\u65f6\u5076\u5c14\u51fa\u73b0\uff0c\u4f5c\u4e3a\u53cd\u91d1\u5e01\u519c\u573a\u63aa\u65bd\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u4f53\u9a8c\u4f18\u5316:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u914d\u88c5\u73b0\u5728\u53ef\u4ee5\u81ea\u52a8\u88c5\u5907\u540c\u7c7b\u578b\u4e2d\u5f3a\u5316\u7b49\u7ea7\u6700\u9ad8\u7684\u7269\u54c1\u3002\u6b64\u9009\u9879\u9ed8\u8ba4\u542f\u7528\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5b9e\u4e60\u62a4\u7b26\u73b0\u5728\u7684\u51fa\u552e\u4ef7\u503c\u4e3a250,000\u91d1\u5e01\uff0c\u4f46\u4e0d\u80fd\u518d\u7528\u4e8e\u8d27\u5e01\u5316\u3002\u8fd9\u6837\u73a9\u5bb6\u53ef\u4ee5\u5728\u5f3a\u5316\u540e\u51fa\u552e\u591a\u4f59\u7684\u62a4\u7b26\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u9519\u8bef\u4fee\u590d:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4fee\u590d\u4e86\u79c1\u804a\u547d\u4ee4\u610f\u5916\u88ab\u6e05\u9664\u7684\u95ee\u9898\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4fee\u590d\u4e86\u5404\u79cd\u5176\u4ed6\u5c0f\u578b\u89c6\u89c9\u548c\u672c\u5730\u5316bug\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5176\u4ed6:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4ece\u725b\u94c3\u5546\u5e97\u4e2d\u79fb\u9664\u4e86\u5b88\u62a4\u5149\u73af\u5230\u5143\u7d20\u5149\u73af\u7684\u5151\u6362\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4e3a\u5373\u5c06\u63a8\u51fa\u7684\u6210\u5c31\u548c\u8ff7\u5bab\u529f\u80fd\u8fdb\u884c\u540e\u7aef\u51c6\u5907\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u51cf\u5c11\u4e86\u672c\u5730\u4fdd\u5b58\u7684\u6d4f\u89c8\u5668\u6570\u636e\u5927\u5c0f\uff0c\u5e76\u6dfb\u52a0\u4e86localStorage\u5df2\u6ee1\u68c0\u6d4b\uff08\u901a\u5e38\u7531\u6d4f\u89c8\u5668\u6269\u5c55\u5f15\u8d77\uff09\u3002\u5f53\u5b58\u50a8\u7a7a\u95f4\u8fbe\u523075%\u65f6\u5c06\u663e\u793a\u8b66\u544a\uff0c\u8fbe\u523095%\u65f6\u6e38\u620f\u5c06\u81ea\u52a8\u5220\u9664\u5927\u578b\u5b57\u6bb5\uff08\u8d85\u8fc71MB\uff09\u4ee5\u7ef4\u6301\u529f\u80fd\u6b63\u5e38\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6218\u6597\u6d88\u8017\u54c1\u548c\u6218\u6597\u89e6\u53d1\u5668\u6570\u636e\u73b0\u5728\u5305\u542b\u5728\u53ef\u5206\u4eab\u7684\u89d2\u8272\u8d44\u6599\u4e2d\uff0c\u7528\u4e8e\u5bfc\u51fa\u5230\u6218\u6597\u6a21\u62df\u5de5\u5177\u3002\u6b64\u6570\u636e\u4e0d\u4f1a\u5728\u8d44\u6599\u754c\u9762\u4e2d\u663e\u793a\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4f18\u5316\u4e86\u670d\u52a1\u5668\u91cd\u542f\u901f\u5ea6\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>"},17556444e5:{heading:"\u5feb\u901f\u4fee\u590d",content:"<div>\n\t\t\t\t\t\u9519\u8bef\u4fee\u590d:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4fee\u590d\u4e86\u5728\u7279\u5b9a\u60c5\u51b5\u4e0b\u6218\u6597\u4e2d\u6218\u6597\u7b49\u7ea7\u8ba1\u7b97\u9519\u8bef\u7684\u95ee\u9898\uff0c\u6709\u65f6\u5bfc\u81f4\u961f\u4f0d\u6210\u5458\u53d7\u5230\u9519\u8bef\u7684\u51cf\u76ca\u6548\u679c\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6539\u6b63\u4e86\u9b54\u672f\u5e08\u5e3d\uff08\u7cbe\uff09\u7684\u7b49\u7ea7\u8981\u6c42\uff0c\u4e3a110\u7ea7\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5e73\u8861\u8c03\u6574:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u964d\u4f4e\u4e86\u79d8\u6cd5\u4e3b\u6559\u7684\u9632\u5fa1\u4f24\u5bb3\uff0c\u56e0\u4e3a\u53cd\u51fb\u4f24\u5bb3\u4ecd\u7136\u8fc7\u9ad8\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u7cbe\u70bc\u88c5\u5907\u7684\u589e\u76ca\u7531 5% \u63d0\u5347\u81f3 8%\uff08\u80cc\u90e8\u88c5\u5907\u4e3a 16%\uff09\uff0c\u8ba9\u5176\u5bf9\u66f4\u591a\u73a9\u5bb6\u66f4\u5177\u6027\u4ef7\u6bd4\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>"},1755558e6:{heading:"\u5927\u578b\u66f4\u65b0 - \u6218\u6597\u91cd\u505a\u3001\u62a4\u7b26\u548c\u7cbe\u70bc\u88c5\u5907",content:"<div>\n\t\t\t\t\t\u6218\u6597\u91cd\u505a\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6240\u6709\u6218\u6597\u98ce\u683c\u73b0\u5728\u90fd\u9700\u8981\u4f9d\u9760\u653b\u51fb\u4e13\u4e1a\u6765\u63d0\u5347\u7cbe\u51c6\u5ea6\u3002\n\t\t\t\t\t\t\t\u73a9\u5bb6\u5c06\u7acb\u5373\u83b7\u5f97\u76f8\u5f53\u4e8e\u5176\u73b0\u6709\u8fdc\u7a0b\u7ecf\u9a8c\u768415%\u548c\u9b54\u6cd5\u7ecf\u9a8c\u768412%\u7684\u653b\u51fb\u7ecf\u9a8c\u3002\n\t\t\t\t\t\t\t\u6b64\u8c03\u6574\u57fa\u4e8e\u6392\u884c\u699c\u6570\u636e\uff0c\u4ee5\u786e\u4fdd\u4e09\u79cd\u6218\u6597\u98ce\u683c\u4e4b\u95f4\u7684\u603b\u7ecf\u9a8c\u53ef\u6bd4\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u8fdc\u7a0b\u4e13\u4e1a\u7684\u9b54\u6cd5\u95ea\u907f\u52a0\u6210\u548c\u9b54\u6cd5\u4e13\u4e1a\u7684\u6297\u6027\u52a0\u6210\u5df2\u88ab\u79fb\u81f3\u9632\u5fa1\u4e13\u4e1a\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u529b\u91cf\u66f4\u540d\u4e3a\u8fd1\u6218\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u541b\u738b\u4e4b\u5251\u73b0\u5728\u53ef\u4ee5\u4e3a\u961f\u53cb\u683c\u6321\u4f24\u5bb3\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u75ab\u75c5\u5c04\u51fb\u5df2\u88ab\u91cd\u65b0\u8bbe\u8ba1\u4e3a\u524a\u5f31\u62a4\u7532/\u6297\u6027\uff0c\u800c\u4e0d\u662fHP/MP\u6062\u590d\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u8fdc\u7a0b\u88c5\u5907\u5df2\u6dfb\u52a0\u66b4\u51fb\u7387\u548c\u5176\u4ed6\u589e\u76ca\uff0c\u4ee5\u5f25\u8865\u7cbe\u51c6\u5ea6\u635f\u5931\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u9b54\u6cd5\u4f24\u5bb3\u6280\u80fd\u73b0\u5728\u6bcf\u4e2a\u6280\u80fd\u7b49\u7ea7\u7684\u6210\u957f\u4e3a0.5%\uff0c\u800c\u4e0d\u662f1%\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6d9f\u6f2a\u4e09\u53c9\u621f\u73b0\u5728\u5728\u6d9f\u6f2a\u6fc0\u6d3b\u65f6\u6062\u590d10MP\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6280\u80fd\u4f24\u5bb3\u548c\u5176\u4ed6\u589e\u76ca\u5df2\u88ab\u6dfb\u52a0\u5230\u9b54\u6cd5\u88c5\u5907\u4e2d\uff0c\u4ee5\u5f25\u8865\u7cbe\u51c6\u5ea6\u635f\u5931\u548c\u6280\u80fd\u6210\u957f\u964d\u4f4e\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u91cd\u76fe\uff1a\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u91cd\u76fe\u5df2\u88ab\u91cd\u65b0\u8bbe\u8ba1\u5e76\u6dfb\u52a0\u4e86\u4e00\u4e2a\u65b0\u7684\u5c5e\u6027\uff0c\u9632\u5fa1\u4f24\u5bb3\uff0c\u663e\u8457\u63d0\u9ad8\u5176\u8f93\u51fa\u4f24\u5bb3\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u5c16\u523a\u5916\u58f3\u5df2\u88ab\u91cd\u65b0\u8bbe\u8ba1\u4e3a\u540c\u65f6\u5305\u542b\u7269\u7406\u548c\u5143\u7d20\u8346\u68d8\uff0c\u57fa\u4e8e\u9632\u5fa1\u4f24\u5bb3\u548c\u62a4\u7532/\u6297\u6027\u7684\u53cc\u91cd\u5c5e\u6027\u8fdb\u884c\u52a0\u6210\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u5965\u672f\u53cd\u5c04\u5df2\u88ab\u8f6c\u6362\u4e3a\u60e9\u6212\uff0c\u8d4b\u4e88\u53cd\u4f24\u589e\u76ca\uff0c\u5c06\u4e00\u5b9a\u6bd4\u4f8b\u7684\u5373\u5c06\u5230\u6765\u7684\u4f24\u5bb3\u53cd\u5c04\u4e3a\u949d\u51fb\u653b\u51fb\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u76fe\u51fb\u7684\u62a4\u7532\u52a0\u6210\u5df2\u4ece60%\u63d0\u9ad8\u523070%\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5149\u73af\uff1a\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u6c34\u548c\u706b\u5149\u73af\u5df2\u8f6c\u6362\u4e3a\u5143\u7d20\u5149\u73af\uff0c\u4e3a\u6240\u6709\u5143\u7d20\u63d0\u4f9b\u589e\u5e45\u52a0\u6210\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u81ea\u7136\u5149\u73af\u5df2\u8f6c\u6362\u4e3a\u5b88\u62a4\u5149\u73af\uff0c\u8d4b\u4e88\u6cbb\u7597\u589e\u5e45\u3001\u95ea\u907f\u3001\u62a4\u7532\u548c\u6297\u6027\u3002\u5b88\u62a4\u5149\u73af\u6682\u65f6\u53ef\u901a\u8fc7\u5546\u5e97\u6362\u6210\u5143\u7d20\u5149\u73af\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u57fa\u7840\u5149\u73af\u5c5e\u6027\u5df2\u88ab\u8c03\u6574\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u6bcf\u4e2a\u5149\u73af\u73b0\u5728\u8fd8\u4f1a\u6839\u636e\u65bd\u6cd5\u8005\u7684\u5bf9\u5e94\u6280\u80fd\u8fdb\u884c\u989d\u5916\u52a0\u6210:\n\t\t\t\t\t\t\t\t\t\u901f\u5ea6\u5149\u73af \u2192 \u653b\u51fb\uff0c\u5b88\u62a4\u5149\u73af \u2192 \u9632\u5fa1\uff0c\u7269\u7406\u5149\u73af \u2192 \u8fd1\u6218\uff0c\u66b4\u51fb\u5149\u73af \u2192 \u8fdc\u7a0b\uff0c\u5143\u7d20\u5149\u73af \u2192 \u9b54\u6cd5\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u84dd\u6280\u80fd\u7ecf\u9a8c\u5c06\u4ee5\u6bcf500\u70b9\u7ecf\u9a8c1\u672c\u4e66\u7684\u6bd4\u4f8b\u8f6c\u6362\u4e3a\u4e66\u7c4d\u3002\n\t\t\t\t\t\t\t\t\t\u4efb\u4f55\u4f4e\u4e8e500\u7684\u5269\u4f59\u7ecf\u9a8c\u5c06\u4fdd\u7559\u5728\u8be5\u6280\u80fd\u4e0a\u3002\n\t\t\t\t\t\t\t\t\t\u8fd9\u662f\u4e00\u9879\u4e00\u6b21\u6027\u7684\u8f6c\u6362\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u73b0\u5728\u6839\u636e\u51fb\u8d25\u7684\u602a\u7269\u56fa\u5b9a\u7ed9\u4e88\u6218\u6597\u7ecf\u9a8c\u503c\uff0c\u6218\u6597\u6301\u7eed\u65f6\u95f4\u8d8a\u957f\uff0c\u751f\u5b58\u7ecf\u9a8c\u5956\u52b1\u8d8a\u9ad8\u3002\n\t\t\t\t\t\t\t30%\u7684\u7ecf\u9a8c\u503c\u4f1a\u5206\u914d\u7ed9\u7531\u4f60\u7684\u6b66\u5668\u51b3\u5b9a\u7684\u4e3b\u8981\u8bad\u7ec3\u4e13\u4e1a\u3002\n\t\t\t\t\t\t\t\u5269\u4f59\u768470%\u7ecf\u9a8c\u53ef\u4ee5\u901a\u8fc7\u65b0\u7684\u62a4\u7b26\u88c5\u5907\u6765\u9009\u62e9\u5206\u914d\u3002\n\t\t\t\t\t\t\t\u8be5\u7cfb\u7edf\u5141\u8bb8\u73a9\u5bb6\u4f18\u5316\u4ed6\u4eec\u5728\u4e13\u4e1a\u4e0a\u7684\u7ecf\u9a8c\u5206\u914d\u3002\n\t\t\t\t\t\t\t\u7ecf\u9a8c\u503c\u6bd4\u7387\u7ecf\u8fc7\u5e73\u8861\uff0c\u73a9\u5bb6\u53ef\u4ee5\u5728\u4e3b\u8981\u4e13\u4e1a\u4e0a\u83b7\u5f97\u66f4\u591a\u7ecf\u9a8c\uff0c\u4f46\u603b\u4f53\u4e0a\u53ef\u80fd\u83b7\u5f97\u7684\u603b\u7ecf\u9a8c\u503c\u4f1a\u51cf\u5c11\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u602a\u7269\u4e0d\u518d\u5177\u6709\u57fa\u7840HP/MP\u6062\u590d\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u602a\u7269\u73b0\u5728\u6bcf\u8fc73\u5206\u949f\u4f1a\u83b7\u5f97\u66b4\u8d70\u589e\u76ca\uff0c\u589e\u52a010%\u7684\u7cbe\u51c6\u5ea6\u548c\u4f24\u5bb3\uff08\u6700\u591a\u53e0\u52a010\u6b21\uff09\u3002\n\t\t\t\t\t\t\tBOSS\u7684\u66b4\u8d70\u8ba1\u65f6\u4e3a10\u5206\u949f\uff0c\u800c\u975e3\u5206\u949f\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u90e8\u5206\u602a\u7269\u5c5e\u6027\u5df2\u8c03\u6574\u4ee5\u9002\u5e94\u4e0a\u8ff0\u6539\u52a8\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6218\u6597\u7b49\u7ea7\u516c\u5f0f\u5df2\u66f4\u65b0\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u7ec4\u961f\u6218\u6597\u7684\u7ecf\u9a8c\u73b0\u5728\u4f1a\u5728\u6240\u6709\u961f\u5458\u95f4\u5e73\u5747\u5206\u914d\uff0c\u4e0e\u9020\u6210\u4f24\u5bb3\u591a\u5c11\u65e0\u5173\u3002  \n\t\t\t\t\t\t\t\u82e5\u961f\u5458\u7684\u6218\u6597\u7b49\u7ea7\u540c\u65f6\u6ee1\u8db3\u6bd4\u961f\u4f0d\u6700\u9ad8\u8005\u4f4e\u81f3\u5c11 20% \u4ee5\u53ca\u76f8\u5dee\u81f3\u5c11 10 \u7ea7\uff0c\u5c06\u4f1a\u83b7\u5f97\u7ecf\u9a8c\u4e0e\u6389\u843d\u60e9\u7f5a\uff0c\u6bcf\u8d85\u8fc71%\u7684\u7b49\u7ea7\u5dee\u989d\u5916\u589e\u52a03%\u60e9\u7f5a\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6240\u6709\u6218\u6597\u98ce\u683c\u7684\u4f24\u5bb3\u548c\u7ecf\u9a8c\u83b7\u53d6\u901f\u7387\u5df2\u8fdb\u884c\u5e73\u8861\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u529f\u80fd\u548c\u5185\u5bb9:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6218\u6597\u533a\u57df\u73b0\u5728\u5177\u6709\u53ef\u9009\u7684\u96be\u5ea6\u7b49\u7ea7\uff0c\u4eceT0\u5230T5\u3002\n\t\t\t\t\t\t\tT0\u5bf9\u5e94\u4e8e\u4e4b\u524d\u7684\u666e\u901a\u533a\u57df\uff0c\u800cT2\u7565\u9ad8\u4e8e\u4e4b\u524d\u7684\u7cbe\u82f1\u533a\u57df\u3002\n\t\t\t\t\t\t\t\u66f4\u9ad8\u7684\u96be\u5ea6\u63d0\u4f9b\u989d\u5916\u7684\u7ecf\u9a8c\u3001\u589e\u52a0\u6389\u843d\u548c\u4e00\u4e9b\u72ec\u7279\u7684\u6389\u843d\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u62a4\u7b26:\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u62a4\u7b26\u662f\u4e00\u79cd\u65b0\u88c5\u5907\uff0c\u53ef\u4ee5\u88c5\u5907\u5728\u62a4\u7b26\u69fd\u4e2d\uff0c\u4e3a\u7279\u5b9a\u4e13\u4e1a\u63d0\u4f9b\u989d\u5916\u7ecf\u9a8c\u3002\n\t\t\t\t\t\t\t\t\t\u5b83\u4eec\u8fd8\u53ef\u4ee5\u7528\u4e8e\u5728\u6218\u6597\u4e2d\u5c06\u7ecf\u9a8c\u96c6\u4e2d\u5230\u8be5\u4e13\u4e1a\u4e0a\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u5b9e\u4e60\u62a4\u7b26\u53ef\u4ee5\u5728\u5546\u5e97\u4ee5250K\u8d2d\u4e70\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u66f4\u9ad8\u7b49\u7ea7\u7684\u751f\u6d3b\u62a4\u7b26\u53ef\u4ee5\u4f7f\u7528\u4e13\u4e1a\u7cbe\u534e\u5236\u4f5c\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u66f4\u9ad8\u7b49\u7ea7\u7684\u6218\u6597\u62a4\u7b26\u53ef\u4ee5\u4ece\u66f4\u9ad8\u7b49\u7ea7\u7684\u6218\u6597\u533a\u57df\u83b7\u5f97\u6389\u843d\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u62a4\u7b26\u53ef\u4ee5\u4f7f\u7528\u5236\u4f5c\u4e13\u4e1a\u5408\u5e76\u4e3a\u66f4\u9ad8\u7b49\u7ea7\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u62a4\u7b26\u53ef\u4ee5\u88ab\u5f3a\u5316\uff0c\u5e76\u50cf\u5176\u4ed6\u9996\u9970\u4e00\u6837\u63d0\u4f9b5\u500d\u7684\u6b63\u5e38\u5f3a\u5316\u5956\u52b1\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5730\u4e0b\u57ce\u73b0\u5728\u5177\u6709\u66f4\u9ad8\u7684\u96be\u5ea6\u7b49\u7ea7\uff0c\u6700\u9ad8\u53ef\u8fbeT2\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u7cbe\u70bc:\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\tT1\u548cT2\u5730\u4e0b\u57ce\u6389\u843d\u7cbe\u70bc\u5b9d\u7bb1\uff0c\u4f7f\u7528\u76f8\u540c\u7684\u5b9d\u7bb1\u94a5\u5319\u6253\u5f00\u4ee5\u83b7\u5f97\u7cbe\u70bc\u788e\u7247\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u7cbe\u70bc\u788e\u7247\u53ef\u7528\u4e8e\u5347\u7ea7\u6765\u81ea\u5404\u81ea\u5730\u4e0b\u57ce\u768495\u7ea7\u88c5\u5907\u548c\u80cc\u90e8\u88c5\u5907\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u7cbe\u70bc\u88c5\u5907\u63d0\u4f9b+5%\u7684\u989d\u5916\u5c5e\u6027\uff08\u80cc\u90e8\u88c5\u5907\u4e3a+10%\uff09\u5e76\u589e\u52a0\u6b66\u5668\u7279\u6b8a\u6548\u679c\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u7cbe\u70bc\u73b0\u6709\u7269\u54c1\u5c06\u8f6c\u79fb100%\u7684\u5f3a\u5316\u7b49\u7ea7\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5bf9+11\u53ca\u4ee5\u4e0a\u7684\u5f3a\u5316\u6bd4\u4f8b\u8fdb\u884c\u4e86\u9002\u5ea6\u63d0\u9ad8\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5df2\u6dfb\u52a0\u652f\u6301\u8005\u804a\u5929\u56fe\u6807\uff08\u4e0d\u540c\u7b49\u7ea7\u7684\u725b\u94c3\uff09\u5230\u725b\u94c3\u5546\u5e97\u3002\n\t\t\t\t\t\t\t\u5b83\u4eec\u53ef\u4ee5\u7528\u652f\u6301\u8005\u79ef\u5206\u8d2d\u4e70\uff0c\u5e76\u5c06\u663e\u793a\u4e3a\u7279\u6b8a\u7684\u7b2c\u4e8c\u4e2a\u56fe\u6807\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u57fa\u7840\u914d\u88c5\u69fd\u6570\u91cf\u4ece2\u589e\u52a0\u52303\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5176\u4ed6:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u5b98\u65b9\u5e02\u573a\u6570\u636e\u73b0\u5728\u6bcf\u5c0f\u65f6\u66f4\u65b0\uff0c\u800c\u4e0d\u662f\u6bcf6\u5c0f\u65f6\u66f4\u65b0\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>"},17492508e5:{heading:"\u4e2d\u578b\u66f4\u65b0 - \u804a\u5929\u4e3e\u62a5\u7cfb\u7edf\u548c\u4f53\u9a8c\u4f18\u5316",content:'<div>\n\t\t\t\t\t\u529f\u80fd\u548c\u5185\u5bb9:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u804a\u5929\u4e3e\u62a5\u7cfb\u7edf: \u73a9\u5bb6\u73b0\u5728\u53ef\u4ee5\u4e3e\u62a5\u804a\u5929\u4e2d\u7684\u8fdd\u89c4\u6d88\u606f\u3002\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u4e3e\u62a5\u5c06\u53d1\u9001\u7ed9\u7ba1\u7406\u5458\u8fdb\u884c\u5ba1\u6838\uff0c\u5e76\u53ef\u80fd\u91c7\u53d6\u76f8\u5e94\u5904\u7406\u63aa\u65bd\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u5982\u679c\u6d88\u606f\u6536\u5230\u8db3\u591f\u6570\u91cf\u7684\u4e3e\u62a5\uff0c\u7cfb\u7edf\u53ef\u80fd\u4f1a\u81ea\u52a8\u8fdb\u884c\u5904\u7406\u3002\u7ecf\u4eba\u5de5\u590d\u6838\u540e\uff0c\u76f8\u5173\u5904\u7f5a\u53ef\u80fd\u4f1a\u88ab\u8c03\u6574\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u53d1\u9001\u6b63\u786e\u7684\u4e3e\u62a5\u5c06\u589e\u52a0\u4f60\u672a\u6765\u4e3e\u62a5\u7684\u6743\u91cd\uff0c\u800c\u9519\u8bef\u7684\u4e3e\u62a5\u5c06\u663e\u8457\u964d\u4f4e\u6743\u91cd\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u73b0\u5728\u53ef\u4ee5\u5728\u8bbe\u7f6e\u4e2d\u5220\u9664\u89d2\u8272\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u7279\u6b8a\u56fe\u6807(\u8d21\u732e\u8005\u3001BUG\u53d1\u73b0\u8005\u7b49)\uff0c\u53ef\u4ee5\u6388\u4e88\u5bf9\u6e38\u620f\u6709\u8f83\u5927\u8d21\u732e\u7684\u73a9\u5bb6\u3002\u5b83\u4eec\u5c06\u663e\u793a\u4e3a\u7b2c\u4e8c\u4e2a\u56fe\u6807\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u4f53\u9a8c\u4f18\u5316:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u73b0\u5728\u53ef\u4ee5\u91cd\u65b0\u6392\u5e8f\u884c\u52a8\u961f\u5217\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u73b0\u5728\u53ef\u4ee5\u5728\u804a\u5929\u4e2d\u94fe\u63a5\u5e02\u573a\u6302\u724c\u3002\u8fd9\u5e94\u8be5\u6539\u5584\u4e0d\u540c\u8bed\u8a00\u7684\u4ea4\u6613\u9891\u9053\u4f53\u9a8c\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\t\u5176\u4ed6:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u5b98\u65b9\u5e02\u573a\u6570\u636e\uff0c\u53ef\u4ee5\u5728 <a href="https://www.milkywayidle.com/game_data/marketplace.json" target="_blank">https://www.milkywayidle.com/game_data/marketplace.json</a> \u8bbf\u95ee\u3002\n\t\t\t\t\t\t\t\u6b64\u6570\u636e\u6bcf6\u5c0f\u65f6\u66f4\u65b0\u4e00\u6b21(\u6709\u4e00\u5b9a\u7684\u968f\u673a\u6027\u548c\u5ef6\u8fdf\u4ee5\u9632\u6b62\u64cd\u7eb5)\uff0c\u5305\u542b\u6bcf\u4e2a\u7269\u54c1\u5f53\u65f6\u7684\u6700\u9ad8\u51fa\u4ef7\u548c\u6700\u4f4e\u8981\u4ef7\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u4ece\u804a\u5929\u4e2d\u79fb\u9664\u4e86 @mod \u547d\u4ee4\uff0c\u56e0\u4e3a\u5b83\u4e0d\u518d\u9700\u8981\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u670d\u52a1\u5668\u4f18\u5316\u4ee5\u6539\u5584\u540e\u7aef\u6027\u80fd\uff0c\u5e2e\u52a9\u652f\u6301\u66f4\u591a\u73a9\u5bb6\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</div>'},17476092e5:{heading:"\u4e2d\u578b\u66f4\u65b0 - \u54de\u5361\u548c\u5176\u4ed6\u6539\u8fdb",content:"<div>\n\t\t\t\t\t\u529f\u80fd\u548c\u5185\u5bb9:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u54de\u5361: \u53ef\u9009\u7684\u4f1a\u5458\u8d44\u683c\uff0c\u63d0\u4f9b\u8bb8\u591a\u6709\u7528\u4f46\u975e\u5fc5\u8981\u7684\u7279\u6743\u3002\n\t\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u53ef\u4ee5\u5728\u725b\u94c3\u5546\u5e97\u4f7f\u7528\u725b\u94c3\u6216\u73b0\u5b9e\u8d27\u5e01\u8d2d\u4e70\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u6240\u6709\u89d2\u8272\u53ef\u4ee5\u514d\u8d39\u9886\u53d614\u5929\u7684\u54de\u5361\u3002\u6240\u6709\u73b0\u6709\u89d2\u8272\u989d\u5916\u83b7\u5f9714\u5929\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t+5% \u7ecf\u9a8c\u589e\u76ca\u3002\u4ec5\u9650\u6807\u51c6\u89d2\u8272\uff0c\u4ee5\u5141\u8bb8\u94c1\u725b\u89d2\u8272\u4e0d\u53d7\u4ed8\u8d39\u5185\u5bb9\u7684\u663e\u8457\u5f71\u54cd\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t+10 \u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6\u9650\u5236\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t+6 \u5e02\u573a\u6302\u724c\u9650\u5236\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t+1 \u884c\u52a8\u961f\u5217\u9650\u5236\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t+8 \u4efb\u52a1\u69fd\u9650\u5236\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t+1 \u514d\u8d39\u4efb\u52a1\u91cd\u7f6e\uff08\u6bcf\u4e2a\u4efb\u52a1\uff09\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u6389\u843d\u8bb0\u5f55: \u8fc7\u53bb20\u6b21\u6d3b\u52a8\u7684\u6389\u843d\u8bb0\u5f55\u3002\u4f60\u53ef\u4ee5\u5728\u83dc\u5355\u4e2d\u7684\u725b\u94c3\u5546\u5e97\u4e0b\u65b9\u627e\u5230\u3002\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\t\u91d1\u8272\u89d2\u8272\u8fb9\u6846\n\t\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t</ol>\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t\tSteam:\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\u66f4\u65b0\u4e86Steam\u5ba2\u6237\u7aef\uff0c\u5e76\u5c06\u672c\u5730\u4fdd\u5b58\u6570\u636e\u79fb\u52a8\u5230\u66f4\u7a33\u5b9a\u7684\u6587\u4ef6\u4f4d\u7f6e\u3002\n\t\t\t\t\t\t\t\u66f4\u65b0\u540e\u7b2c\u4e00\u6b21\u6253\u5f00\u6e38\u620f\u53ef\u80fd\u9700\u8981\u91cd\u65b0\u767b\u5f55\u548c\u8bbe\u7f6e\u63d2\u4ef6\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n                    \u4f53\u9a8c\u4f18\u5316:\n                    <ol>\n                        <li>\n                            \u5e02\u573a\u5355\u7b14\u6302\u5355\u6700\u9ad8\u4ef7\u683c\u4ece10B\u63d0\u5347\u81f3100B\u3002\n                        </li>\n                        <li>\n                            \u5e02\u573a\u7f29\u5199\u683c\u5f0f\u7684\u4ef7\u683c\u5355\u4f4d (K,M,B,T) \u73b0\u5728\u4f1a\u6309\u5355\u4f4d\u663e\u793a\u4e0d\u540c\u989c\u8272\uff0c\u964d\u4f4e\u770b\u9519\u7684\u98ce\u9669\u3002\n                        </li>\n                        <li>\n                            \u65b0\u589e /r \u804a\u5929\u6307\u4ee4\u7528\u4e8e\u5feb\u901f\u56de\u590d\u6700\u540e\u4e00\u6761\u79c1\u804a\u3002\n                        </li>\n                        <li>\n                           \u5bf9\u91cd\u590d\u5237\u5c4f\u7684\u804a\u5929\u6d88\u606f\uff08\u5355\u4eba\u6216\u591a\u4eba\uff09\u542f\u7528\u66f4\u4e25\u683c\u7684\u4fdd\u62a4\u63aa\u65bd\u3002\n                        </li>\n                    </ol>\n                    \u6f0f\u6d1e\u4fee\u590d:\n                    <ol>\n                        <li>\n                            \u4fee\u590d\u5f3a\u5316\u7cbe\u534e\u6389\u843d\u7387\u6bd4\u663e\u793a\u503c\u4f4e33%\u7684\u95ee\u9898\uff08\u6b64\u524d\u4ec5\u66f4\u65b0\u4e86\u5ba2\u6237\u7aef\u4f46\u9057\u6f0f\u540e\u7aef\uff09\u3002\n                        </li>\n                        <li>\n                            \u4fee\u590d\u91cd\u65b0\u8fdb\u5165\u6e38\u620f\u65f6\u672a\u8bfb\u79c1\u804a\u8ba1\u6570\u4e0d\u663e\u793a\u7684\u95ee\u9898\u3002\n                        </li>\n                        <li>\n                            \u4fee\u590d\u5976\u916a\u953b\u9020\u7c7b\u80f8\u7532\u7684\u81ea\u52a8\u653b\u51fb\u4f24\u5bb3\u52a0\u6210\u6570\u503c\uff0c\u73b0\u4e0e\u817f\u7532\u4e00\u81f4\uff08\u7279\u6b8a\u88c5\u5907\u4e0d\u53d7\u5f71\u54cd\uff09\u3002\n                        </li>\n                        <li>\n                            \u4fee\u6b63\u4e2d\u6587\u961f\u4f0d\u804a\u5929\u94fe\u63a5\u7684\u7ffb\u8bd1\u9519\u8bef\u3002\n                        </li>\n                        <li>\n                            \u79fb\u52a8\u7aef\u6392\u884c\u699c\u6807\u7b7e\u73b0\u652f\u6301\u6362\u884c\u663e\u793a\uff0c\u907f\u514d Steam \u6392\u884c\u699c\u5bfc\u81f4\u754c\u9762\u6ea2\u51fa\u3002\n                        </li>\n                    </ol>\n                    \u5176\u4ed6:\n                    <ol>\n                        <li>\n                            \u79fb\u9664\u9650\u65f6\u5468\u5e74\u5c0f\u7d2b\u725b\u53ca\u539f\u7248\u6770\u745e\u804a\u5929\u56fe\u6807\u3002\n                        </li>\n                        <li>\n                            \u5730\u4e0b\u57ce\u5546\u5e97\u4e2d\u79fb\u9664\u68d5\u8272/\u767d\u8272\u94a5\u5319\u788e\u7247\u5151\u6362 (\u539f\u672c\u5c31\u662f\u4e34\u65f6\u529f\u80fd)\u3002\n                        </li>\n                        <li>\n                            \u5e02\u573a\u7a0e\u7387\u73b0\u5728\u6539\u4e3a\u5411\u4e0a\u53d6\u6574 (\u539f\u4e3a\u5411\u4e0b\u53d6\u6574)\uff0c\u4ee5\u51cf\u5c11\u4f4e\u4ef7\u7269\u54c1\u7684\u5784\u65ad\u4ea4\u6613\u3002\n                        </li>\n                    </ol>\n\t\t\t\t</div>"},17449308e5:{heading:"\u91cd\u8981\u66f4\u65b0 - \u6d77\u76d7\u57fa\u5730\u5730\u7262\u548c\u66f4\u591a\u5185\u5bb9",content:'<div>\n\t\t\t\t\u529f\u80fd\u548c\u5185\u5bb9:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6d77\u76d7\u57fa\u5730:\n\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u65b0T95\u9b54\u6cd5\u6b66\u5668: \u6d9f\u6f2a\u4e09\u53c9\u621f\u3001\u7efd\u653e\u4e09\u53c9\u621f\u3001\u70bd\u7130\u4e09\u53c9\u621f\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u65b0T95\u62a4\u7532: \u951a\u5b9a\u80f8\u7532/\u817f\u7532\u3001\u6012\u6d9b\u80f8\u7532/\u817f\u7532\u3001\u514b\u62c9\u80af\u76ae\u8863/\u76ae\u88e4\u3001\u63a0\u593a\u8005\u5934\u76d4\u3001\u795e\u5c04\u62a4\u8155\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u65b0\u6280\u80fd: \u76fe\u51fb(\u4e5f\u6dfb\u52a0\u5230\u5947\u5e7b\u6d1e\u7a74)\u3001\u788e\u88c2\u51b2\u51fb\u3001\u751f\u547d\u5438\u53d6\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u65b0\u70bc\u91d1\u914d\u65b9\u3002\u6240\u6709\u5730\u7262\u6280\u80fd\u4e66\u8f6c\u5316\u7684\u6210\u529f\u7387\u5df2\u7edf\u4e00\u4e3a50%\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t</ol>\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u72c2\u6012\u957f\u67aa: \u65b0\u589eT95\u957f\u67aa\uff0c\u6dfb\u52a0\u5230\u79d8\u6cd5\u5821\u5792\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4f7f\u7528\u751f\u4ea7\u6280\u80fd\u5347\u7ea7\u88c5\u5907\u65f6\uff0c\u73b0\u5728\u5c06\u4fdd\u755970%\u7684\u5f3a\u5316\u7b49\u7ea7\u3002\u4e00\u4e9bT95\u88c5\u5907\u914d\u65b9\u5df2\u8c03\u6574\u4e3a\u4ece\u8f83\u4f4e\u7ea7\u522b\u7684\u53d8\u4f53\u5347\u7ea7\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u65b0\u589e\u7b2c\u56db\u4e2a\u89d2\u8272\u69fd\u4f4d\u3002\u4f60\u6700\u591a\u53ea\u80fd\u62e5\u67093\u4e2a\u94c1\u725b\u89d2\u8272\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u65b0\u589eSTEAM\u6392\u884c\u699c\uff0c\u9002\u7528\u4e8e\u5728STEAM\u53d1\u5e03\u540e\u521b\u5efa\u7684\u89d2\u8272\uff0c\u5e76\u4e0eSTEAM\u5173\u8054\u3002\u4ec5\u5728\u7b26\u5408\u6761\u4ef6\u7684\u89d2\u8272\u4e0a\u53ef\u89c1\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u516c\u4f1a\u6210\u5458\u69fd\u4f4d\u4ece25+level/4\u589e\u52a0\u523030+level/3\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u88c5\u9970\u54c1:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u8282\u65e5\u9650\u5b9a(\u53d1\u5e03\u4e24\u5e74\u7eaa\u5ff5\u65e5): \u5468\u5e74\u5c0f\u7d2b\u725b\uff0c\u539f\u7248\u6770\u745e\u804a\u5929\u56fe\u6807\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6839\u636e\u5c0f\u90e8\u5206\u5730\u7262BOSS\u6dfb\u52a0\u4e86\u65b0\u7684\u804a\u5929\u56fe\u6807\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6dfb\u52a0\u4e862\u4e2a\u6d77\u76d7\u57fa\u5730\u4e3b\u9898\u5934\u50cf\u548c\u670d\u88c5\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5b9a\u5236\u88c5\u9970\u54c1\u7684\u8981\u6c42\u66f4\u6539\u4e3a\u9700\u8981\u82b1\u8d39\u652f\u6301\u8005\u79ef\u5206\u548c\u725b\u94c3\u3002\n\t\t\t\t\t\t\u7531\u4e8e\u73a9\u5bb6\u4eba\u6570\u7684\u5de8\u5927\u589e\u52a0\uff0c\u6211\u4eec\u65e0\u6cd5\u7ee7\u7eed\u652f\u6301\u5b9a\u5236\u88c5\u9970\u54c1\u4f5c\u4e3a\u793c\u7269\u3002\n\t\t\t\t\t\t\u65b0\u7684\u5b9a\u4ef7\u5c06\u4e8e5\u67081\u65e5\u751f\u6548\u30024\u6708\u5e95\u4e4b\u524d\u53d1\u8d77\u7684\u4efb\u4f55\u8bf7\u6c42\u5c06\u6839\u636e\u4e4b\u524d\u7684\u652f\u6301\u8005\u79ef\u5206\u8981\u6c42\u8fdb\u884c\u5904\u7406\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u5e73\u8861:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u8c03\u6574\u4e86\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319\u548c\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319\u7684\u914d\u65b9\uff0c\u4f7f\u5176\u68d5\u8272\u548c\u767d\u8272\u94a5\u5319\u788e\u7247\u4e92\u6362\u3002\n\t\t\t\t\t\t\u8fd9\u9632\u6b62\u4e86\u79d8\u6cd5\u5821\u5792\u548c\u6d77\u76d7\u57fa\u5730\u5171\u4eab3/4\u7684\u94a5\u5319\u788e\u7247\u3002\n\t\t\t\t\t\t\u4f60\u53ef\u4ee5\u5728\u5730\u7262\u5546\u5e97\u4e34\u65f6\u81ea\u7531\u4ea4\u6362\u68d5\u8272\u548c\u767d\u8272\u94a5\u5319\u788e\u7247\uff0c\u76f4\u5230\u4e0b\u4e00\u4e2a\u6e38\u620f\u66f4\u65b0\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6240\u6709\u8fd1\u6218\u62a4\u7532\u589e\u52a0\u4e86\u81ea\u52a8\u653b\u51fb\u4f24\u5bb3\uff0c\u4ee5\u4f7f\u8fd1\u6218\u4f24\u5bb3\u66f4\u63a5\u8fd1\u5176\u4ed6\u7c7b\u578b\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u589e\u52a0\u4e86\u91cd\u76fe\u7684\u51c6\u786e\u6027\u548c\u4f24\u5bb3\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5728\u5de8\u50cf\u80f8\u7532/\u817f\u7532\u4e0a\u6dfb\u52a0\u4e86\u8fd1\u6218\u51c6\u786e\u6027\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u81f4\u6b8b\u65a9: \u91cd\u65b0\u8bbe\u8ba1\u4e3a\u5bf9\u6240\u6709\u654c\u4eba\u9020\u6210\u4f24\u5bb3\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u8840\u5203\u65a9: \u4f24\u5bb3\u6301\u7eed\u65f6\u95f4\u4ece15\u79d2\u51cf\u5c11\u52309\u79d2\u3002\u53d7\u5230\u7684\u4f24\u5bb3\u51cf\u76ca\u4ece0%\u589e\u52a0\u52308%\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u51b0\u971c\u7206\u88c2: \u95ea\u907f\u51cf\u76ca\u4ece15%\u964d\u4f4e\u523010%\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u706b\u7130\u98ce\u66b4: \u4f24\u5bb3\u6301\u7eed\u65f6\u95f4\u4ece10\u79d2\u51cf\u5c11\u52306\u79d2\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u70df\u7206\u706d\u5f71: \u51c6\u786e\u6027\u51cf\u76ca\u4ece20%\u964d\u4f4e\u523015%\u3002\u95ea\u907f\u51cf\u76ca\u4ece0%\u589e\u52a0\u523015%\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u9b54\u50cf\u6d1e\u7a74: \u602a\u7269\u9632\u5fa1\u7b49\u7ea7\u964d\u4f4e10-20\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u66ae\u5149\u4e4b\u5730: \u602a\u7269\u706b\u7cfb\u6027\u964d\u4f4e20\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\tUI:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u4e00\u4e2a\u65b0\u8bbe\u7f6e\u6765\u9690\u85cf\u82f1\u8bed\u804a\u5929\u7cfb\u7edf\u6d88\u606f\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u961f\u4f0d\u94fe\u63a5\u4e0d\u53ef\u53d1\u5728\u82f1\u8bed\u3001\u4ea4\u6613\u548c\u65b0\u624b\u804a\u5929\u4e2d\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5bf9\u4e00\u4e9b\u4e0d\u9002\u5408\u8bef\u70b9\u51fb\u7684\u6309\u94ae\u6dfb\u52a0\u4e86\u53cc\u91cd\u786e\u8ba4\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5728\u516c\u4f1a\u548c\u597d\u53cb\u5217\u8868\u4e2d\u6dfb\u52a0\u4e86\u4e0d\u6d3b\u8dc3\u5929\u6570\u8ba1\u6570\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u66f4\u6539\u4e86\u70bc\u91d1\u548c\u5f3a\u5316\u7684"\u5f00\u59cb"\u6309\u94ae\u6587\u672c\uff0c\u4f7f\u5176\u66f4\u660e\u663e\u5730\u663e\u793a\u6240\u6267\u884c\u7684\u884c\u52a8\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\tBUG\u4fee\u590d:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5f53\u4f60\u5728\u7269\u54c1\u4e0a\u67093\u4e2a\u672a\u5b8c\u6210\u7684\u6302\u724c\u65f6\uff0c\u4e0d\u8981\u963b\u6b62\u521b\u5efa\u5373\u65f6\u5e02\u573a\u8ba2\u5355\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4fee\u590d\u53ef\u80fd\u5bfc\u81f4\u5c11\u6570\u73a9\u5bb6\u7684\u5728\u670d\u52a1\u5668\u91cd\u542f\u540e\u505c\u6b62\u884c\u52a8\u7684\u95ee\u9898\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4fee\u590d\u4e86\u53ef\u80fd\u5bfc\u81f4\u670d\u52a1\u5668\u5d29\u6e83\u7684\u7f55\u89c1\u9519\u8bef\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u5176\u4ed6:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5c4f\u853d\u89d2\u8272\u5c06\u963b\u6b62\u52a0\u5165\u961f\u4f0d(\u57fa\u4e8e\u961f\u957f)\u548c\u516c\u4f1a\u9080\u8bf7\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u670d\u52a1\u5668\u548c\u5ba2\u6237\u7aef\u4f18\u5316\uff0c\u4ee5\u52a0\u5feb\u670d\u52a1\u5668\u91cd\u542f\u3001\u4efb\u52a1\u751f\u6210\u3001\u6eda\u52a8\u6027\u80fd\u7b49\u901f\u5ea6\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u4e00\u4e2a\u529f\u80fd\uff0c\u5141\u8bb8ADMIN\u53d1\u5e03\u516c\u544a\u680f\u4ee5\u4f20\u8fbe\u91cd\u8981\u6d88\u606f\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u7ffb\u8bd1\u6539\u8fdb\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t</div>'},17419068e5:{heading:"\u5c0f\u578b\u66f4\u65b0 - \u53cd\u6b3a\u8bc8\u63aa\u65bd\u548cBUG\u4fee\u590d",content:"<div>\n\t\t\t\t\u53cd\u6b3a\u8bc8:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u7531\u4e8e\u6709\u51e0\u6b21\u76d7\u7528\u4fe1\u7528\u5361\u8d2d\u4e70\u725b\u94c3\u7684\u53d1\u751f\uff0c\u6dfb\u52a0\u4e86\u53cd\u6b3a\u8bc8\u63aa\u65bd\uff0c\u73a9\u5bb6\u9996\u6b21\u8d2d\u4e70\u725b\u94c3\u53ef\u80fd\u4f1a\u89e6\u53d172\u5c0f\u65f6\u7684\u9650\u5236\uff0c\u7981\u6b62\u5728\u5e02\u573a\u4e0a\u51fa\u552e\u725b\u94c3\u888b\u3002\u8d2d\u4e70\u524d\u4f1a\u6536\u5230\u901a\u77e5\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\tBUG\u4fee\u590d:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4fee\u590d\u4e86\u5728\u6781\u5c11\u6570\u60c5\u51b5\u4e0b\uff0c\u73a9\u5bb6\u53ef\u80fd\u4f1a\u5361\u5728\u4e0d\u5b58\u5728\u7684\u961f\u4f0d\u6218\u6597\u884c\u52a8\u4e2d\u7684\u95ee\u9898\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4fee\u590d\u4e86\u4e00\u4e9b\u7269\u54c1\u540d\u79f0\u548c\u76f8\u5e94\u64cd\u4f5c\u4e4b\u95f4\u7684\u7ffb\u8bd1\u4e0d\u4e00\u81f4\u95ee\u9898\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u5176\u4ed6:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u540e\u53f0\u66f4\u6539\u4ee5\u63d0\u9ad8\u6570\u636e\u5e93\u8fde\u63a5\u7a33\u5b9a\u6027\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t</div>"},17409132e5:{heading:"\u91cd\u8981\u66f4\u65b0 - \u4e2d\u56fd\u7ffb\u8bd1\u548c\u4e3aSTEAM\u53d1\u5e03\u7684\u6700\u540e\u51c6\u5907",content:"<div>\n\t\t\t\tUI:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6dfb\u52a0\u4e86\u4e2d\u6587\u7ffb\u8bd1\u3002\n\t\t\t\t\t\t<ol>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u8bed\u8a00\u5c06\u6839\u636e\u4f60\u7684\u6d4f\u89c8\u5668\u8bed\u8a00\u81ea\u52a8\u9009\u62e9\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u73a9\u5bb6\u4e5f\u53ef\u4ee5\u5728[\u8bbe\u7f6e]->[\u6e38\u620f]\u6216\u4e3b\u9875\u4e0a\u624b\u52a8\u66f4\u6539\u663e\u793a\u8bed\u8a00\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u4e00\u4e9b\u9879\u76ee\u5c1a\u672a\u7ffb\u8bd1\uff0c\u5305\u62ec\u5927\u90e8\u5206\u65b0\u95fb\u548c\u66f4\u65b0\u65e5\u5fd7\uff0c\u4f7f\u7528\u6761\u6b3e\u548c\u9690\u79c1\u653f\u7b56\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t\t\u5982\u679c\u4f60\u53d1\u73b0\u4efb\u4f55\u7ffb\u8bd1\u95ee\u9898\u6216\u663e\u793a\u6587\u672c\u9519\u8bef\uff0c\u8bf7\u5728Discord\u7684#bug-reports\u9891\u9053\u4e2d\u62a5\u544a\u3002\n\t\t\t\t\t\t\t</li>\n\t\t\t\t\t\t</ol>\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5df2\u66f4\u65b0\u5f39\u7a97\uff0c\u4f7f\u5176\u5728\u6e38\u620f\u5c4f\u5e55\u4e0a\u5c45\u4e2d\u663e\u793a\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u5176\u4ed6:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4ece\u725b\u94c3\u5546\u5e97\u79fb\u9664\u4e86\u6625\u8282\u8282\u65e5\u9650\u5b9a\u88c5\u9970\u7269\u54c1\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5bf9STEAM\u96c6\u6210\u8fdb\u884c\u4e86\u66f4\u591a\u7684\u8c03\u6574\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u9690\u79c1\u653f\u7b56\u5df2\u66f4\u65b0\uff0c\u5305\u62ec\u4f7f\u7528\u5206\u6790\u548c\u8425\u9500cookie\u7684\u6761\u6b3e\u3002\u8fd9\u4f7f\u6211\u4eec\u80fd\u591f\u5728\u5176\u4ed6\u5e73\u53f0\u4e0a\u4e3a\u300a\u94f6\u6cb3\u5976\u725b\u653e\u7f6e\u300b\u8fd0\u884c\u5e7f\u544a\u65f6\u4f18\u5316\u8425\u9500\u6d3b\u52a8\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t</div>"},17378856e5:{heading:"\u5c0f\u578b\u66f4\u65b0",content:"<div>\n\t\t\t\t\u6625\u8282:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6625\u8282\u804a\u5929\u56fe\u6807\u3001\u89d2\u8272\u5f62\u8c61\u548c\u670d\u88c5\u5728\u725b\u94c3\u5546\u5e97\u4e2d\u51fa\u552e\uff0c\u6301\u7eed\u5230\u81f3\u5c113\u5468\u540e\u7684\u66f4\u65b0\u3002\u6d3b\u52a8\u7ed3\u675f\u540e\uff0c\u4f60\u4ecd\u7136\u53ef\u4ee5\u7ee7\u7eed\u4f7f\u7528\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u7528\u6237\u754c\u9762:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6bcf25\u7ea7\u4e13\u4e1a\u7b49\u7ea7\uff0c\u4ece100\u7ea7\u5f00\u59cb\uff0c\u53d1\u9001\u7cfb\u7edf\u6d88\u606f\uff0c\u800c\u4e0d\u4ec5\u4ec5\u662f100\u7ea7\u548c125\u7ea7\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u4fee\u590d:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6392\u884c\u699c\u516c\u4f1a\u540d\u79f0\u5e94\u8be5\u662f\u4e0d\u53ef\u70b9\u51fb\u7684\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6539\u8fdb\u804a\u5929\u6d88\u606fURL\u94fe\u63a5\u89e3\u6790\uff0c\u4f7f\u5176\u66f4\u51c6\u786e\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4fee\u590d\u4e86\u6570\u636e\u5e93\u5728\u7ef4\u62a4\u671f\u95f4\u8131\u673a\uff0c\u73a9\u5bb6\u4f1a\u88ab\u767b\u51fa\u7684\u95ee\u9898\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u4fee\u590d\u4e86\u4e00\u4e9b\u7f55\u89c1\u60c5\u51b5\u4e0b\u5bfc\u81f4\u73a9\u5bb6\u6218\u6597\u5728\u79bb\u7ebf\u8fdb\u5ea6\u7528\u5c3d\u540e\u672a\u6b63\u786e\u505c\u6b62\u7684\u95ee\u9898\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t\t\u5176\u4ed6:\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u6dfb\u52a0\u4e86@mod\u548c@mods\u804a\u5929\u547d\u4ee4\uff0c\u7528\u4e8e\u7d27\u6025\u60c5\u51b5\u901a\u77e5\u7ba1\u7406\u5458\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t\u5728\u540e\u53f0\u5b9e\u65bd\u4e86\u8eab\u4efd\u9a8c\u8bc1\u548c\u652f\u4ed8\u66f4\u6539\uff0c\u4ee5\u652f\u6301\u5373\u5c06\u53d1\u5e03\u7684STEAM\u7248\u672c\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t</div>"}},gameGuidePanel:{gameGuide:"\u6e38\u620f\u6307\u5357"},gameGuideContent:{faq:"\u5e38\u89c1\u95ee\u9898",faqContent:'<heading>\u5e38\u89c4\u95ee\u9898</heading>\n\t\t\t<question>\u95ee: \u79bb\u7ebf\u8fdb\u5ea6\u5982\u4f55\u8fd0\u4f5c?</question>\n\t\t\t<answer>\u7b54: \u5373\u4f7f\u4f60\u5904\u4e8e\u79bb\u7ebf\u72b6\u6001\uff0c\u4f60\u7684\u89d2\u8272\u4e5f\u4f1a\u7ee7\u7eed\u53d6\u5f97\u8fdb\u5c55\u3002\u9ed8\u8ba4\u60c5\u51b5\u4e0b\uff0c\u65e0\u8bba\u4f55\u65f6\u5173\u95ed\u6d4f\u89c8\u5668\u6216\u79bb\u7ebf\uff0c\u4f60\u90fd\u53ef\u4ee5\u83b7\u5f97\u957f\u8fbe10\u5c0f\u65f6\u7684\u79bb\u7ebf\u8fdb\u5ea6\u3002\u4f60\u8fd8\u53ef\u4ee5\u901a\u8fc7\u725b\u94c3\u5546\u5e97\u63d0\u4f9b\u7684\u4fbf\u5229\u5347\u7ea7\u6765\u5ef6\u957f\u79bb\u7ebf\u65f6\u95f4\u3002</answer>\n\t\t\t<question>\u95ee: \u6211\u53ef\u4ee5\u4ece\u5176\u4ed6\u8bbe\u5907\u767b\u5f55\u5417?</question>\n\t\t\t<answer>\u7b54: \u5982\u679c\u4f60\u5df2\u6ce8\u518c\u5e10\u6237\uff0c\u53ef\u4ee5\u4f7f\u7528\u7535\u5b50\u90ae\u4ef6\u548c\u5bc6\u7801\u4ece\u4efb\u4f55\u8bbe\u5907\u767b\u5f55\u3002\u5982\u679c\u4f60\u4ee5\u6e38\u5ba2\u8eab\u4efd\u73a9\u6e38\u620f\uff0c\u53ef\u4ee5\u5728[\u8bbe\u7f6e]\u4e2d\u627e\u5230\u4f60\u7684\u6e38\u5ba2\u5bc6\u7801\uff0c\u7136\u540e\u7528\u4f60\u7684\u7528\u6237\u540d\u767b\u5f55\u3002</answer>\n\t\t\t<question>\u95ee: \u6211\u53ef\u4ee5\u5728\u6ca1\u6709\u4e92\u8054\u7f51\u8fde\u63a5\u7684\u60c5\u51b5\u4e0b\u73a9\u6e38\u620f\u5417?</question>\n\t\t\t<answer>\u7b54: \u4e0d\u53ef\u4ee5\uff0c\u4f60\u5fc5\u987b\u8fde\u63a5\u5230\u4e92\u8054\u7f51\u624d\u80fd\u73a9\u6e38\u620f\u3002\u4e0d\u8fc7\uff0c\u9ed8\u8ba4\u60c5\u51b5\u4e0b\uff0c\u4f60\u4ecd\u53ef\u4ee5\u83b7\u5f97\u79bb\u7ebf\u8fdb\u5ea6\uff0c\u6700\u957f\u53ef\u8fbe10\u5c0f\u65f6\u3002\u5982\u679c\u4f60\u4e0d\u60f3\u4e0e\u5176\u4ed6\u73a9\u5bb6\u4e92\u52a8\uff0c\u53ef\u4ee5\u5173\u95ed\u804a\u5929\u9891\u9053\u5e76\u9009\u62e9\u4e0d\u4f7f\u7528\u5e02\u573a\u3002</answer>\n\t\t\t<question>\u95ee: \u6211\u53ef\u4ee5\u66f4\u6539\u6211\u7684\u89d2\u8272\u540d\u79f0\u5417?</question>\n\t\t\t<answer>\u7b54: \u53ef\u4ee5\u3002\u8bf7\u524d\u5f80[\u725b\u94c3\u5546\u5e97]\uff0c\u70b9\u51fb[\u66f4\u6539\u540d\u79f0]\u6765\u66f4\u6539\u4f60\u7684\u540d\u79f0\u3002\u8fd9\u9700\u8981500\u4e2a\u725b\u94c3\u3002</answer>\n\t\t\t<question>\u95ee: \u5982\u4f55\u83b7\u5f97\u804a\u5929\u56fe\u6807\u6216\u540d\u79f0\u989c\u8272?</question>\n\t\t\t<answer>\u7b54: \u53ef\u4ee5\u4f7f\u7528\u725b\u94c3\u4ece[\u725b\u94c3\u5546\u5e97]\u8d2d\u4e70\u804a\u5929\u56fe\u6807\u6216\u540d\u79f0\u989c\u8272\u3002\u4f60\u53ef\u4ee5\u5728[\u8bbe\u7f6e]\u4e2d\u66f4\u6539\u663e\u793a\u7684\u56fe\u6807\u548c\u540d\u79f0\u989c\u8272\u3002</answer>\n\t\t\t<question>\u95ee: \u5982\u4f55\u5411\u5176\u4ed6\u73a9\u5bb6\u53d1\u9001\u7ad9\u5185\u79c1\u4fe1?</question>\n\t\t\t<answer>\u7b54: \u8981\u5411\u5176\u4ed6\u73a9\u5bb6\u53d1\u9001\u79c1\u4eba\u4fe1\u606f\uff0c\u8bf7\u70b9\u51fb\u8be5\u73a9\u5bb6\u4fe1\u606f\u524d\u65b9\u7684\u540d\u79f0\u5e76\u70b9\u51fb[\u79c1\u804a]\u3002\u4f60\u4e5f\u53ef\u4ee5\u4f7f\u7528\u804a\u5929\u547d\u4ee4"/w \u73a9\u5bb6\u540d\u79f0 \u804a\u5929\u5185\u5bb9"\u3002</answer>\n\t\t\t<question>\u95ee: \u5982\u4f55\u5c4f\u853d\u5176\u4ed6\u73a9\u5bb6?</question>\n\t\t\t<answer>\u7b54: \u8981\u5c4f\u853d\u4e00\u540d\u73a9\u5bb6\u5e76\u505c\u6b62\u6536\u5230\u5176\u4efb\u4f55\u4fe1\u606f\uff0c\u8bf7\u70b9\u51fb\u8be5\u73a9\u5bb6\u4fe1\u606f\u524d\u65b9\u7684\u540d\u79f0\u5e76\u9009\u62e9[\u5c4f\u853d]\u3002\u4f60\u4e5f\u53ef\u4ee5\u4f7f\u7528\u804a\u5929\u547d\u4ee4"/block \u73a9\u5bb6\u540d\u79f0"\u3002\u4f60\u53ef\u4ee5\u5728[\u793e\u4ea4]\u83dc\u5355\u4e2d\u627e\u5230\u4f60\u7684\u9ed1\u540d\u5355\uff0c\u7136\u540e\u4ece\u5217\u8868\u89e3\u9664\u5bf9\u73a9\u5bb6\u7684\u5c4f\u853d\u3002</answer>\n\t\t\t<heading>\u6e38\u620f\u73a9\u6cd5</heading>\n\t\t\t<question>\u95ee: \u4ec0\u4e48\u662f\u884c\u52a8\u961f\u5217?</question>\n\t\t\t<answer>\u7b54: \u884c\u52a8\u961f\u5217\u5141\u8bb8\u4f60\u4e3a\u89d2\u8272\u8bbe\u7f6e\u4e00\u8fde\u4e32\u81ea\u52a8\u6267\u884c\u7684\u884c\u52a8\u3002\u8981\u4f7f\u7528\u5b83\uff0c\u8bf7\u70b9\u51fb[\u6dfb\u52a0\u5230\u961f\u5217]\u6309\u94ae\uff0c\u800c\u4e0d\u662f[\u5f00\u59cb]\u6309\u94ae\u3002\u961f\u5217\u69fd\u4f4d\u53ef\u4ee5\u4ece\u725b\u94c3\u5546\u5e97\u89e3\u9501\u6216\u5347\u7ea7\u3002</answer>\n\t\t\t<question>\u95ee: \u4ec0\u4e48\u662f\u725b\u94c3\uff0c\u5982\u4f55\u83b7\u5f97\u66f4\u591a\u7684\u725b\u94c3?</question>\n\t\t\t<answer>\n\t\t\t\t\u7b54: \u725b\u94c3\u662f\u6e38\u620f\u4e2d\u7684\u9ad8\u7ea7\u8d27\u5e01\u3002\u73a9\u5bb6\u53ef\u4ee5\u7528\u725b\u94c3\u8d2d\u4e70\u4fbf\u5229\u5347\u7ea7\u3001\u5916\u89c2\u88c5\u626e\u3001\u793e\u533aBUFF\u548c\u540d\u79f0\u66f4\u6539\u3002\u83b7\u5f97\u725b\u94c3\u6709\u4e09\u79cd\u65b9\u6cd5:\n\t\t\t\t<ul>\n\t\t\t\t\t<li>\u5b8c\u6210\u6559\u7a0b: \u53ef\u4ee5\u83b7\u5f9780\u4e2a\u725b\u94c3\u4f5c\u4e3a\u5956\u52b1\u3002</li>\n\t\t\t\t\t<li>\u7a00\u6709\u6389\u843d: \u5728\u6280\u827a\u8bad\u7ec3\u6216\u4e0e\u654c\u4eba\u6218\u6597\u65f6\uff0c\u6709\u673a\u4f1a\u4ece\u7a00\u6709\u6218\u5229\u54c1\u7bb1\u4e2d\u83b7\u5f97\u725b\u94c3\u3002</li>\n\t\t\t\t\t<li>\u4ece\u725b\u94c3\u5546\u5e97\u8d2d\u4e70: \u4f60\u53ef\u4ee5\u5728\u725b\u94c3\u5546\u5e97\u4e2d\u5145\u503c\u8d2d\u4e70\u725b\u94c3\u6765\u652f\u6301\u6e38\u620f\u3002</li>\n\t\t\t\t\t<li>\u4ece\u5e02\u573a\u8d2d\u4e70: \u4f60\u53ef\u4ee5\u5728\u5e02\u573a\u4e0a\u7528\u91d1\u5e01\u5411\u5176\u4ed6\u73a9\u5bb6\u8d2d\u4e70\u53ef\u4ea4\u6613\u7684\u725b\u94c3\u888b"\u3002</li>\n\t\t\t\t</ul>\n\t\t\t</answer>\n\t\t\t<question>\u95ee: \u4ec0\u4e48\u662f\u7a00\u6709\u6389\u843d?</question>\n\t\t\t<answer>\n\t\t\t\t\u7b54: \u7a00\u6709\u6389\u843d\u662f\u5728\u6e38\u620f\u4e2d\u53c2\u4e0e\u4e0d\u540c\u884c\u52a8\u65f6\u53ef\u4ee5\u83b7\u5f97\u7684\u6218\u5229\u54c1:\n\t\t\t\t<ul>\n\t\t\t\t\t<li>\u91c7\u96c6\u4e13\u4e1a: \u53ef\u4ee5\u83b7\u5f97\u5305\u542b\u661f\u661f\u788e\u7247\u7684\u9668\u77f3\u8231\u3002</li>\n\t\t\t\t\t<li>\u751f\u4ea7\u4e13\u4e1a\u3001\u70bc\u91d1\u548c\u5f3a\u5316: \u53ef\u4ee5\u83b7\u5f97\u5de5\u5320\u5323\uff0c\u91cc\u9762\u6709\u4fdd\u62a4\u788e\u7247\u548c\u5b9d\u77f3\u3002</li>\n\t\t\t\t\t<li>\u6218\u6597:\u53ef\u4ee5\u83b7\u5f97\u88c5\u6709\u5b9d\u77f3\u7684\u5b9d\u7bb1\u3002</li>\n\t\t\t\t</ul>\n\t\t\t\t\u6240\u6709\u7bb1\u5b50\u4e2d\u90fd\u4f1a\u6709\u91d1\u5e01\uff0c\u5076\u5c14\u8fd8\u4f1a\u6709\u725b\u94c3\u3002\u5b8c\u6210\u66f4\u9ad8\u7ea7\u7684\u6280\u827a\u6216\u5bf9\u6218\u66f4\u9ad8\u7ea7\u7684\u654c\u4eba\uff0c\u53ef\u83b7\u5f97\u66f4\u5927\u7684\u5b9d\u7bb1\u3002\n\t\t\t</answer>\n\t\t\t<question>\u95ee: \u5b9d\u77f3\u6709\u4ec0\u4e48\u7528?</question>\n\t\t\t<answer>\u7b54: \u5b9d\u77f3\u53ef\u4ee5\u7528\u6765\u5236\u4f5c\u4e0d\u540c\u7684\u9996\u9970\uff0c\u8fd9\u4e9b\u9996\u9970\u4f1a\u5e26\u6765\u4e00\u4e9b\u52a0\u6210\u3002\u6b64\u5916\uff0c\u8fd8\u53ef\u4ee5\u4f7f\u7528"\u5236\u4f5c"\u4e13\u4e1a\u5c06\u5b9d\u77f3\u7c89\u788e\u6210\u5c0f\u5757\uff0c\u7528\u6765\u51b2\u6ce1\u66f4\u9ad8\u6548\u7684\u5496\u5561\u548c\u8336\u3002\u5b9d\u77f3\u53ef\u4ee5\u4ece\u6218\u6597\u4e2d\u83b7\u53d6\u7684\u5b9d\u7bb1\u91cc\u627e\u5230\u3002</answer>\n\t\t\t<question>\u95ee: \u4ece\u54ea\u91cc\u83b7\u5f97\u8336\u53f6?</question>\n\t\t\t<answer>\u7b54: \u5728\u6218\u6597\u4e2d\u51fb\u8d25\u602a\u517d\u53ef\u4ee5\u83b7\u5f97\u8336\u53f6\u3002\u5728\u67e5\u770b\u6218\u6597\u533a\u57df\u65f6\uff0c\u4f60\u53ef\u4ee5\u5c06\u9f20\u6807\u60ac\u505c\u5728\u602a\u517d\u8eab\u4e0a(\u5728\u624b\u673a\u4e0a\u957f\u6309)\uff0c\u67e5\u770b\u5176\u6389\u843d\u7684\u7269\u54c1\u3002\u8336\u53f6\u662f\u6ce1\u8336\u7684\u5fc5\u5907\u6750\u6599\uff0c\u53ef\u4ee5\u4e3a\u751f\u6d3b\u4e13\u4e1a\u52a0\u6210\u3002</answer>\n\t\t\t<question>\u95ee: \u4ec0\u4e48\u662f\u7cbe\u534e?</question>\n\t\t\t<answer>\u7b54: \u7cbe\u534e\u53ef\u4ee5\u7528\u4e8e\u5f3a\u5316\u7279\u6b8a\u88c5\u5907\u3002\u6bcf\u4e2a\u6218\u6597\u533a\u57df\u7684\u602a\u517d\u90fd\u4f1a\u6389\u843d\u4e0d\u540c\u7c7b\u578b\u7684\u7cbe\u534e\u3002</answer>\n\t\t\t<br />',gathering:"\u91c7\u96c6\u7c7b\u4e13\u4e1a",gatheringContent:"<heading>\u6324\u5976</heading>\n\t\t\t<text>\n\t\t\t\t\u7ed9\u795e\u5947\u7684\u5976\u725b\u6324\u5976\u53ef\u4ee5\u83b7\u5f97\u4e0d\u540c\u79cd\u7c7b\u7684\u725b\u5976\uff0c\u8fd9\u4e9b\u725b\u5976\u6709\u591a\u79cd\u7528\u9014:\n\t\t\t\t<ul>\n\t\t\t\t\t<li>\u5976\u916a\u5236\u4f5c:\u725b\u5976\u53ef\u4ee5\u53d8\u6210\u5976\u916a\uff0c\u7136\u540e\u7528\u6765\u5236\u4f5c\u8fd1\u6218\u88c5\u5907\u6216\u4e13\u4e1a\u5de5\u5177\u3002</li>\n\t\t\t\t\t<li>\u70f9\u996a:\u725b\u5976\u662f\u8bb8\u591a\u98df\u8c31\u4e2d\u4e0d\u53ef\u6216\u7f3a\u7684\u539f\u6599\u3002</li>\n\t\t\t\t\t<li>\u51b2\u6ce1:\u725b\u5976\u4e5f\u7528\u4e8e\u5c11\u6570\u7684\u5496\u5561\u548c\u8336\u914d\u65b9\u3002</li>\n\t\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u901a\u8fc7\u88c5\u5907\u5237\u5b50\u6765\u5e2e\u52a9\u5976\u725b\u66f4\u5feb\u5730\u751f\u4ea7\u725b\u5976\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u91c7\u6458</heading>\n\t\t\t<text>\u91c7\u6458\u53ef\u4ee5\u8ba9\u4f60\u5728\u4e0d\u540c\u7684\u533a\u57df\u91c7\u6458\u4e0d\u540c\u7684\u8d44\u6e90\u3002\u4f60\u53ef\u4ee5\u5728\u67d0\u4e2a\u533a\u57df\u91c7\u6458\u7279\u5b9a\u7684\u7269\u54c1\uff0c\u4e5f\u53ef\u4ee5\u5728\u6574\u4e2a\u533a\u57df\u91c7\u6458\uff0c\u4ee5\u83b7\u5f97\u5404\u79cd\u7269\u54c1\u3002</text>\n\t\t\t<text>\n\t\t\t\t\u91c7\u6458\u7684\u8d44\u6e90\u53ef\u7528\u4e8e:\n\t\t\t\t<ul>\n\t\t\t\t\t<li>\u70f9\u996a: \u9e21\u86cb\u3001\u5c0f\u9ea6\u3001\u7cd6\u3001\u8393\u679c\u548c\u6c34\u679c\u662f\u8bb8\u591a\u98df\u8c31\u4e2d\u5fc5\u4e0d\u53ef\u5c11\u7684\u914d\u6599\u3002</li>\n\t\t\t\t\t<li>\u51b2\u6ce1: \u8393\u679c\u3001\u6c34\u679c\u548c\u5496\u5561\u8c46\u53ef\u7528\u4e8e\u51b2\u6ce1\u5496\u5561\u548c\u8336\u3002</li>\n\t\t\t\t\t<li>\u7f1d\u7eab: \u4e9a\u9ebb\u3001\u7af9\u5b50\u3001\u8695\u8327\u548c\u5176\u4ed6\u6750\u6599\u53ef\u4ee5\u52a0\u5de5\u6210\u5e03\u6599\uff0c\u5236\u4f5c\u9b54\u6cd5\u670d\u9970\u3002</li>\n\t\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<text>\u88c5\u5907\u526a\u5b50\u53ef\u4ee5\u63d0\u9ad8\u91c7\u6458\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u4f10\u6728</heading>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u780d\u4f10\u4e0d\u540c\u79cd\u7c7b\u6811\u6728\u7684\u539f\u6728\u3002</text>\n\t\t\t<text>\n\t\t\t\t\u539f\u6728\u53ef\u7528\u4e8e:\n\t\t\t\t<ul>\n\t\t\t\t\t<li>\u5976\u916a\u953b\u9020: \u539f\u6728\u662f\u5236\u4f5c\u4e00\u4e9b\u8fd1\u6218\u6b66\u5668\u548c\u4e13\u4e1a\u5de5\u5177\u7684\u539f\u6599\u3002</li>\n\t\t\t\t\t<li>\u5236\u4f5c: \u539f\u6728\u53ef\u4ee5\u52a0\u5de5\u6210\u6728\u6750\uff0c\u7528\u4e8e\u5236\u4f5c\u8fdc\u7a0b\u6b66\u5668\u548c\u9b54\u6cd5\u6b66\u5668\u3002</li>\n\t\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<text>\u88c5\u5907\u65a7\u5934\u53ef\u4ee5\u63d0\u9ad8\u4f10\u6728\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u7b49\u7ea7\u52a0\u6210</heading>\n\t\t\t<text>\u4f60\u7684\u7b49\u7ea7\u6bcf\u8d85\u8fc7\u884c\u52a8\u7684\u7b49\u7ea7\u8981\u6c421\u7ea7\uff0c\u5c31\u4f1a\u83b7\u5f971%\u7684\u6548\u7387\u52a0\u6210\u3002</text>\n\t\t\t<br />",production:"\u751f\u4ea7\u7c7b\u4e13\u4e1a",productionContent:"<heading>\u5976\u916a\u953b\u9020</heading>\n\t\t\t<text>\u5976\u916a\u953b\u9020\u662f\u5236\u9020\u8fd1\u6218\u88c5\u5907\u548c\u5de5\u5177\u7684\u4e13\u4e1a\u3002</text>\n\t\t\t<text>\u725b\u5976\u88ab\u52a0\u5de5\u6210\u4e0d\u540c\u7b49\u7ea7\u7684\u5976\u916a\u3002\u7136\u540e\u5236\u4f5c\u6210\u88c5\u5907(\u6709\u65f6\u4e0e\u5176\u4ed6\u8d44\u6e90\u7ed3\u5408\u4f7f\u7528)\u3002\u968f\u7740\u7b49\u7ea7\u7684\u63d0\u9ad8\uff0c\u88c5\u5907\u53ef\u4ee5\u5347\u7ea7\u5230\u66f4\u9ad8\u7684\u7b49\u7ea7\u3002</text>\n\t\t\t<text>\u88c5\u5907\u9524\u5b50\u53ef\u4ee5\u63d0\u9ad8\u5976\u916a\u5236\u4f5c\u7684\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u5236\u4f5c</heading>\n\t\t\t<text>\u5236\u4f5c\u53ef\u4ee5\u4ea7\u51fa\u591a\u79cd\u7269\u54c1\uff0c\u5305\u62ec\u8fdc\u7a0b\u6b66\u5668\u3001\u9b54\u6cd5\u6b66\u5668\u3001\u73e0\u5b9d\u548c\u5176\u4ed6\u7279\u6b8a\u8d44\u6e90\u3002</text>\n\t\t\t<text>\u539f\u6728\u53ef\u4ee5\u52a0\u5de5\u6210\u4e0d\u540c\u7b49\u7ea7\u7684\u6728\u6750\uff0c\u7136\u540e\u7528\u6765\u5236\u4f5c\u8fdc\u7a0b\u6b66\u5668\u548c\u9b54\u6cd5\u6b66\u5668\u3002</text>\n\t\t\t<text>\u9996\u9970\u53ef\u4ee5\u7528\u661f\u661f\u788e\u7247\u548c\u5b9d\u77f3\u5236\u4f5c\uff0c\u8fd9\u4e9b\u90fd\u662f\u91c7\u96c6\u6216\u6218\u6597\u4e2d\u53d1\u73b0\u7684\u7a00\u6709\u7269\u54c1\u3002</text>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u901a\u8fc7\u88c5\u5907\u51ff\u5b50\u6765\u63d0\u9ad8\u5236\u4f5c\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u7f1d\u7eab</heading>\n\t\t\t<text>\u7f1d\u7eab\u53ef\u4ee5\u5236\u4f5c\u5404\u79cd\u9b54\u6cd5\u670d\u9970\u548c\u888b\u5b50\u3002</text>\n\t\t\t<text>\u4e9a\u9ebb\u3001\u7af9\u5b50\u548c\u8695\u8327\u7b49\u91c7\u6458\u5f97\u6765\u7684\u539f\u6750\u6599\u53ef\u4ee5\u52a0\u5de5\u6210\u5e03\u6599\u3002\u4e0e\u602a\u517d\u6218\u6597\u83b7\u5f97\u7684\u517d\u76ae\u4e5f\u53ef\u4ee5\u52a0\u5de5\u6210\u76ae\u9769\u3002</text>\n\t\t\t<text>\u5e03\u6599\u4e3b\u8981\u7528\u4e8e\u5236\u4f5c\u9b54\u6cd5\u670d\u9970\uff0c\u5982\u888d\u670d\u548c\u5e3d\u5b50\uff0c\u800c\u76ae\u9769\u5219\u7528\u4e8e\u5236\u4f5c\u8fdc\u7a0b\u670d\u9970\uff0c\u5982\u76ae\u8863\u548c\u76ae\u9774\u3002</text>\n\t\t\t<text>\u9664\u4e86\u670d\u9970\uff0c\u4f60\u8fd8\u53ef\u4ee5\u5236\u4f5c\u888b\u5b50\uff0c\u589e\u52a0\u6218\u6597\u4e2d\u7684\u6700\u5927HP\u548cMP\u3002\u888b\u5b50\u8fd8\u80fd\u4e3a\u6280\u827a\u548c\u6218\u6597\u63d0\u4f9b\u989d\u5916\u7684\u6d88\u8017\u54c1\u69fd\u4f4d\u3002</text>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u901a\u8fc7\u88c5\u5907\u9488\u6765\u63d0\u9ad8\u7f1d\u7eab\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u70f9\u996a</heading>\n\t\t\t<text>\u70f9\u996a\u4ea7\u751f\u7684\u98df\u7269\u53ef\u5728\u6218\u6597\u4e2d\u4f7f\u7528\u3002</text>\n\t\t\t<text>\u751c\u751c\u5708\u548c\u86cb\u7cd5\u53ef\u4ee5\u6062\u590dHP\uff0c\u8f6f\u7cd6\u548c\u9178\u5976\u53ef\u4ee5\u6062\u590dMP\u3002</text>\n\t\t\t<text>\u88c5\u5907\u9505\u94f2\u53ef\u4ee5\u63d0\u9ad8\u70f9\u996a\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u51b2\u6ce1</heading>\n\t\t\t<text>\u51b2\u6ce1\u996e\u6599\u53ef\u5728\u77ed\u65f6\u95f4\u5185\u63d0\u4f9b\u589e\u76ca\u6548\u679c\u3002</text>\n\t\t\t<text>\u5728\u6218\u6597\u4e2d\u996e\u7528\u5496\u5561\u53ef\u4ee5\u63d0\u5347\u6218\u6597\u76f8\u5173\u5c5e\u6027\uff0c\u800c\u996e\u7528\u8336\u5219\u53ef\u4ee5\u63d0\u9ad8\u751f\u6d3b\u4e13\u4e1a\u3002</text>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u901a\u8fc7\u88c5\u5907\u4e00\u4e2a\u58f6\u6765\u63d0\u9ad8\u51b2\u6ce1\u901f\u5ea6\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u7b49\u7ea7\u52a0\u6210</heading>\n\t\t\t<text>\u4f60\u7684\u7b49\u7ea7\u6bcf\u8d85\u8fc7\u884c\u52a8\u7684\u7b49\u7ea7\u8981\u6c421\u7ea7\uff0c\u5c31\u4f1a\u83b7\u5f971%\u7684\u6548\u7387\u52a0\u6210\u3002</text>\n\t\t\t<br />",alchemy:"\u70bc\u91d1",alchemyContent:'<heading>\u70bc\u91d1</heading>\n\t\t\t<text>\u70bc\u91d1\u5141\u8bb8\u4f60\u4f7f\u7528\u70b9\u91d1\u3001\u5206\u89e3\u3001\u8f6c\u5316\u6216\u89e3\u7cbe\u70bc\u5c06\u7269\u54c1\u53d8\u4e3a\u5176\u4ed6\u7269\u54c1\u3002\u6bcf\u79cd\u884c\u52a8\u90fd\u6709\u4e0d\u540c\u7684\u6210\u529f\u7387\uff0c\u65e0\u8bba\u6210\u529f\u4e0e\u5426\uff0c\u6295\u5165\u7684\u7269\u54c1\u548c\u91d1\u5e01\u6210\u672c\u90fd\u4f1a\u88ab\u6d88\u8017\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u70b9\u91d1</heading>\n\t\t\t<text>\u70b9\u91d1\u53ef\u4ee5\u5c06\u7269\u54c1\u8f6c\u5316\u4e3a\u91d1\u5e01\u3002\u83b7\u5f97\u7684\u91d1\u5e01\u6570\u91cf\u662f\u7269\u54c1\u552e\u4ef7\u76845\u500d\u3002\u57fa\u672c\u6210\u529f\u7387\u4e3a70%\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u5206\u89e3</heading>\n\t\t\t<text>\u5206\u89e3\u53ef\u4ee5\u5c06\u7269\u54c1\u5206\u89e3\u6210\u539f\u6750\u6599\u6216\u7cbe\u534e\u3002\u88c5\u5907\u53ef\u4ee5\u5206\u89e3\u6210\u539f\u6750\u6599\uff0c\u975e\u88c5\u5907\u7269\u54c1\u53ef\u4ee5\u5206\u89e3\u6210\u6280\u827a\u7cbe\u534e\u3002\u5206\u89e3\u5f3a\u5316\u88c5\u5907\u53ef\u4ee5\u83b7\u5f97\u989d\u5916\u7684\u5f3a\u5316\u7cbe\u534e\uff0c\u5f3a\u5316\u7b49\u7ea7\u8d8a\u9ad8\uff0c\u6570\u91cf\u8d8a\u591a\u3002\u57fa\u672c\u6210\u529f\u7387\u4e3a60%\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u8f6c\u5316</heading>\n\t\t\t<text>\u8f6c\u5316\u53ef\u4ee5\u5c06\u7269\u54c1\u8f6c\u5316\u4e3a\u5176\u4ed6\u76f8\u5173\u7269\u54c1\u6216\u7a00\u6709\u72ec\u7279\u7269\u54c1\uff0c\u5982\u8d24\u8005\u4e4b\u77f3\u3002\u57fa\u672c\u6210\u529f\u7387\u56e0\u88ab\u8f6c\u5316\u7684\u7269\u54c1\u800c\u5f02\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u89e3\u7cbe\u70bc</heading>\n\t\t\t<text>\u89e3\u7cbe\u70bc\u53ef\u4ee5\u5c06\u7cbe\u70bc\u88c5\u5907\u8fd8\u539f\u4e3a\u57fa\u7840\u7248\u672c\u3002\u5f3a\u5316\u7b49\u7ea7\u4f1a\u4fdd\u7559\uff0c\u5e76\u8fd4\u8fd8\u90e8\u5206\u7cbe\u70bc\u788e\u7247\u3002\u57fa\u672c\u6210\u529f\u7387\u4e3a100%\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u6210\u529f\u7387</heading>\n\t\t\t<text>\u57fa\u7840\u6210\u529f\u7387\u53d6\u51b3\u4e8e\u70bc\u91d1\u884c\u52a8\u548c\u88ab\u70bc\u91d1\u7684\u7279\u5b9a\u7269\u54c1\u3002\u5982\u679c\u4f60\u7684\u70bc\u91d1\u4e13\u4e1a\u7b49\u7ea7\u4f4e\u4e8e\u7269\u54c1\u7684\u7b49\u7ea7\uff0c\u6210\u529f\u7387\u5c31\u4f1a\u53d7\u5230\u5f71\u54cd\u3002\u4f7f\u7528\u50ac\u5316\u5242\u548c\u50ac\u5316\u8336\u53ef\u4ee5\u63d0\u9ad8\u6210\u529f\u7387\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u50ac\u5316\u5242</heading>\n\t\t\t<text>\u50ac\u5316\u5242\u662f\u53ef\u4ee5\u7528\u6765\u63d0\u9ad8\u70bc\u91d1\u6210\u529f\u7387\u7684\u7279\u6b8a\u7269\u54c1\u3002\u53ea\u6709\u5728\u6210\u529f\u65f6\u624d\u4f1a\u6d88\u8017\u4e00\u4e2a\u50ac\u5316\u5242\u3002\u666e\u901a\u50ac\u5316\u5242\u53ef\u4ee5\u4f7f\u7528\u4e13\u4e1a\u7cbe\u534e\u5236\u4f5c\u3002\u81f3\u9ad8\u50ac\u5316\u5242\u53ef\u901a\u8fc7\u8f6c\u5316\u666e\u901a\u50ac\u5316\u5242\u83b7\u5f97\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u70bc\u91d1\u6548\u7387</heading>\n\t\t\t<text>\u4f60\u7684\u7b49\u7ea7\u6bcf\u8d85\u8fc7\u7269\u54c1\u5efa\u8bae\u7b49\u7ea71\u7ea7\uff0c\u5c31\u4f1a\u83b7\u5f971%\u7684\u6548\u7387\u52a0\u6210\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u70bc\u91d1\u8bf4\u660e</heading>\n\t\t\t<text>\u4ee5\u4e0b\u662f\u70bc\u91d1\u7684\u6b65\u9aa4:</text>\n\t\t\t<ol>\n\t\t\t\t<li>\u9009\u62e9\u8981\u70bc\u91d1\u7684\u7269\u54c1;</li>\n\t\t\t\t<li>\u9009\u62e9\u8981\u8fdb\u884c\u7684\u70bc\u91d1\u884c\u52a8;</li>\n\t\t\t\t<li>\u51b3\u5b9a\u662f\u5426\u4f7f\u7528\u50ac\u5316\u5242\u3002\u5982\u679c\u4f7f\u7528\uff0c\u8bf7\u9009\u62e9\u50ac\u5316\u5242\u3002</li>\n\t\t\t\t<li>\u70b9\u51fb"\u5f00\u59cb"\u6309\u94ae\uff0c\u5c31\u4f1a\u5f00\u59cb\u70bc\u91d1\u3002</li>\n\t\t\t</ol>\n\t\t\t<br />',enhancing:"\u5f3a\u5316",enhancingContent:'<heading>\u5f3a\u5316</heading>\n\t\t\t<text>\u5f3a\u5316\u662f\u589e\u52a0\u4efb\u4f55\u88c5\u5907(\u5982\u76d4\u7532\u3001\u6b66\u5668\u3001\u5de5\u5177\u3001\u888b\u5b50\u6216\u9996\u9970)\u5c5e\u6027\u7684\u8fc7\u7a0b\u3002\u5f53\u4f60\u6210\u529f\u5f3a\u5316\u4e00\u4ef6\u88c5\u5907\u65f6\uff0c\u5176\u5f3a\u5316\u7b49\u7ea7\u4f1a\u589e\u52a0 1\u3002\u4f46\u662f\uff0c\u5982\u679c\u5f3a\u5316\u5931\u8d25\uff0c\u7b49\u7ea7\u4f1a\u91cd\u7f6e\u4e3a 0\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u5f3a\u5316\u6210\u529f\u7387</heading>\n\t\t\t<text>\u5f3a\u5316\u7684\u6210\u529f\u7387\u53d6\u51b3\u4e8e\u51e0\u4e2a\u56e0\u7d20\uff0c\u5305\u62ec\u4f60\u7684\u5f3a\u5316\u7b49\u7ea7\u3001\u88c5\u5907\u7684\u7b49\u7ea7\u4ee5\u53ca\u8be5\u88c5\u5907\u5f53\u524d\u7684\u5f3a\u5316\u7b49\u7ea7\u3002\u4e00\u822c\u6765\u8bf4\uff0c\u88c5\u5907\u7684\u7b49\u7ea7\u548c\u5f3a\u5316\u7b49\u7ea7\u8d8a\u9ad8\uff0c\u6210\u529f\u7387\u5c31\u8d8a\u4f4e\u3002\u88c5\u5907\u5f3a\u5316\u5668\u53ef\u4ee5\u63d0\u9ad8\u6210\u529f\u7387\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u4fdd\u62a4</heading>\n\t\t\t<text>\u4fdd\u62a4\u673a\u5236\u662f\u4e00\u4e2a\u5141\u8bb8\u73a9\u5bb6\u4f7f\u7528\u57fa\u7840\u88c5\u5907\u526f\u672c\u3001\u4fdd\u62a4\u4e4b\u955c\u6216\u5236\u4f5c\u7ec4\u4ef6(\u4ec5\u9002\u7528\u4e8e\u7279\u6b8a\u88c5\u5907)\u4e3a\u6bcf\u6b21\u5f3a\u5316\u63d0\u4f9b\u4fdd\u62a4\u7684\u529f\u80fd\u3002\u5982\u679c\u5f3a\u5316\u5931\u8d25\uff0c\u88c5\u5907\u7684\u7b49\u7ea7\u53ea\u4f1a\u964d\u4f4e1\u7ea7\uff0c\u4f46\u4f1a\u6d88\u80171\u4ef6\u4fdd\u62a4\u9053\u5177\u3002\u8fd9\u5bf9\u6bd5\u4e1a\u9636\u6bb5\u7684\u73a9\u5bb6\u6765\u8bf4\u662f\u8fbe\u5230\u9ad8\u5f3a\u5316\u7b49\u7ea7\u7684\u4e00\u79cd\u7ecf\u6d4e\u6709\u6548\u7684\u65b9\u6cd5\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u63d0\u5347\u901f\u5ea6</heading>\n\t\t\t<text>\u4f60\u7684\u7b49\u7ea7\u6bcf\u8d85\u8fc7\u88c5\u5907\u63a8\u8350\u7b49\u7ea71\u7ea7\uff0c\u5c31\u4f1a\u83b7\u5f971%\u7684\u884c\u52a8\u901f\u5ea6\u52a0\u6210\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u8bf4\u660e</heading>\n\t\t\t<text>\u4ee5\u4e0b\u662f\u5f3a\u5316\u88c5\u5907\u7684\u6b65\u9aa4:</text>\n\t\t\t<ol>\n\t\t\t\t<li>\u9009\u62e9\u8981\u5f3a\u5316\u7684\u88c5\u5907\u3002</li>\n\t\t\t\t<li>\u8bbe\u5b9a\u76ee\u6807\u5f3a\u5316\u7b49\u7ea7\u3002\u73b0\u5b9e\u4e00\u70b9\uff0c\u8003\u8651\u4ee5\u4f60\u76ee\u524d\u7684\u8d44\u6e90\u80fd\u8fbe\u5230\u4ec0\u4e48\u6c34\u5e73\u3002</li>\n\t\t\t\t<li>\u51b3\u5b9a\u662f\u5426\u4f7f\u7528\u4fdd\u62a4\u3002\u5982\u679c\u4f7f\u7528\uff0c\u5219\u9009\u62e9\u4fdd\u62a4\u9053\u5177\u548c\u4f7f\u7528\u4fdd\u62a4\u7684\u6700\u4f4e\u5f3a\u5316\u7b49\u7ea7\u3002\u4e00\u822c\u6765\u8bf4\uff0c\u5f3a\u5316\u7269\u54c1\u7684\u7b49\u7ea7\u8d8a\u9ad8\uff0c\u4f7f\u7528\u4fdd\u62a4\u7684\u6027\u4ef7\u6bd4\u5c31\u8d8a\u9ad8\u3002</li>\n\t\t\t\t<li>\u70b9\u51fb"\u5f00\u59cb"\u6309\u94ae\uff0c\u4f60\u5c06\u7ee7\u7eed\u5f3a\u5316\uff0c\u76f4\u5230\u8fbe\u5230\u76ee\u6807\u7b49\u7ea7\u6216\u6750\u6599\u8017\u5c3d\u3002</li>\n\t\t\t</ol>\n\t\t\t<br />\n\t\t\t<heading>\u5f3a\u5316\u52a0\u6210</heading>\n\t\t\t<text>\u5f3a\u5316\u88c5\u5907\u7684\u52a0\u6210\u5c5e\u6027\u6309\u57fa\u7840\u5c5e\u6027\u7684\u4e00\u5b9a\u767e\u5206\u6bd4\u589e\u52a0\u3002\u6bcf\u4e2a\u5f3a\u5316\u7b49\u7ea7\u7684\u603b\u52a0\u6210\u5982\u4e0b:\n\t\t\t<br />\n\t\t\t+1: 2.0%\n\t\t\t<br />\n\t\t\t+2: 4.2%\n\t\t\t<br />\n\t\t\t+3: 6.6%\n\t\t\t<br />\n\t\t\t+4: 9.2%\n\t\t\t<br />\n\t\t\t+5: 12.0%\n\t\t\t<br />\n\t\t\t+6: 15.0%\n\t\t\t<br />\n\t\t\t+7: 18.2%\n\t\t\t<br />\n\t\t\t+8: 21.6%\n\t\t\t<br />\n\t\t\t+9: 25.2%\n\t\t\t<br />\n\t\t\t+10: 29.0%\n\t\t\t<br />\n\t\t\t+11: 33.4%\n\t\t\t<br />\n\t\t\t+12: 38.4%\n\t\t\t<br />\n\t\t\t+13: 44.0%\n\t\t\t<br />\n\t\t\t+14: 50.2%\n\t\t\t<br />\n\t\t\t+15: 57.0%\n\t\t\t<br />\n\t\t\t+16: 64.4%\n\t\t\t<br />\n\t\t\t+17: 72.4%\n\t\t\t<br />\n\t\t\t+18: 81.0%\n\t\t\t<br />\n\t\t\t+19: 90.2%\n\t\t\t<br />\n\t\t\t+20: 100%\n\t\t\t</text>\n\t\t\t<text>\u4f5c\u4e3a\u4f8b\u5916\uff0c\u4f69\u9970\u3001\u80cc\u90e8\u88c5\u5907\u548c\u9970\u54c1\u69fd\u4f4d\u7684\u5f3a\u5316\u53ef\u83b7\u5f97\u6b63\u5e38\u52a0\u6210\u76845\u500d\u3002\u4f8b\u5982\uff0c\u4f69\u9970\u7684+1\u5f3a\u5316\u4e3a10%\u7684\u52a0\u6210\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u5f3a\u5316\u57fa\u7840\u6210\u529f\u7387</heading>\n\t\t\t<text>\n\t\t\t+1: 50%\n\t\t\t<br />\n\t\t\t+2: 45%\n\t\t\t<br />\n\t\t\t+3: 45%\n\t\t\t<br />\n\t\t\t+4: 40%\n\t\t\t<br />\n\t\t\t+5: 40%\n\t\t\t<br />\n\t\t\t+6: 40%\n\t\t\t<br />\n\t\t\t+7: 35%\n\t\t\t<br />\n\t\t\t+8: 35%\n\t\t\t<br />\n\t\t\t+9: 35%\n\t\t\t<br />\n\t\t\t+10: 35%\n\t\t\t<br />\n\t\t\t+11: 30%\n\t\t\t<br />\n\t\t\t+12: 30%\n\t\t\t<br />\n\t\t\t+13: 30%\n\t\t\t<br />\n\t\t\t+14: 30%\n\t\t\t<br />\n\t\t\t+15: 30%\n\t\t\t<br />\n\t\t\t+16: 30%\n\t\t\t<br />\n\t\t\t+17: 30%\n\t\t\t<br />\n\t\t\t+18: 30%\n\t\t\t<br />\n\t\t\t+19: 30%\n\t\t\t<br />\n\t\t\t+20: 30%\n\t\t\t</text>\n\t\t\t<br />',combat:"\u6218\u6597",combatContent:"<heading>\u6218\u6597</heading>\n\t\t\t<text>\u4e0e\u602a\u517d\u6218\u6597\u53ef\u4ee5\u83b7\u5f97\u91d1\u5e01\u3001\u8336\u53f6\u3001\u517d\u76ae\u3001\u7cbe\u534e\u3001\u6280\u80fd\u4e66\u3001\u5b9d\u77f3\u3001\u7279\u6b8a\u7269\u54c1\u4ee5\u53ca\u5404\u79cd\u5e38\u89c1\u8d44\u6e90\u3002\u5728\u4e0d\u540c\u7684\u6218\u6597\u533a\u57df\u4f1a\u6709\u4e0d\u540c\u96be\u5ea6\u7684\u654c\u4eba\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u88c5\u5907</heading>\n\t\t\t<text>\u7a7f\u6234\u88c5\u5907\u53ef\u4ee5\u63d0\u9ad8\u6218\u6597\u4e2d\u7684\u5c5e\u6027\u3002\u4f60\u53ef\u4ee5\u76f4\u63a5\u4ece\u5e93\u5b58\u4e2d\u88c5\u5907\u7269\u54c1\uff0c\u4e5f\u53ef\u4ee5\u70b9\u51fb\u5e93\u5b58\u65c1\u8fb9[\u88c5\u5907]\u4e2d\u7684\u88c5\u5907\u69fd\u4f4d\u6765\u88c5\u5907\u7269\u54c1\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u6d88\u8017\u54c1</heading>\n\t\t\t<text>\u6d88\u8017\u98df\u7269\u53ef\u4ee5\u6062\u590dHP\u6216MP\u3002\u996e\u6599\u53ef\u4ee5\u5728\u4e00\u5b9a\u65f6\u95f4\u5185\u63d0\u4f9b\u589e\u76ca\u6548\u679c\u3002\u5347\u7ea7\u888b\u5b50\u5728\u53ef\u4ee5\u8ba9\u4f60\u5728\u6218\u6597\u4e2d\u643a\u5e26\u66f4\u591a\u7684\u98df\u7269\u548c\u996e\u6599\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u6280\u80fd</heading>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u5b66\u4e60\u6280\u80fd\u4e66\uff0c\u5e76\u5728\u6218\u6597\u4e2d\u6d88\u8017MP\u6765\u4f7f\u7528\u6280\u80fd\u3002\u8981\u89e3\u9501\u65b0\u7684\u6280\u80fd\uff0c\u5fc5\u987b\u4ece\u6280\u80fd\u4e66\u4e2d\u5b66\u4e60\u3002\u6280\u80fd\u4f1a\u968f\u7740\u7b49\u7ea7\u7684\u63d0\u5347\u800c\u589e\u5f3a\u3002\u6bcf\u6b21\u5728\u6218\u6597\u4e2d\u4f7f\u7528\u6280\u80fd\u90fd\u4f1a\u83b7\u5f970.1\u7684\u7ecf\u9a8c\u3002\u4f60\u8fd8\u53ef\u4ee5\u901a\u8fc7\u6d88\u8017\u91cd\u590d\u7684\u6280\u80fd\u4e66\u6765\u83b7\u5f97\u5927\u91cf\u7ecf\u9a8c\u3002</text>\n\t\t\t<text>\u5728\u6218\u6597\u4e2d\u4f7f\u7528\u591a\u4e2a\u53ef\u7528\u7684\u6280\u80fd\u65f6\uff0c\u5b83\u4eec\u5c06\u6309\u7167\u4f60\u7684\u8bbe\u7f6e\u4ece\u5de6\u5230\u53f3\u7684\u987a\u5e8f\u65bd\u653e\u3002</text>\n\t\t\t<text>\u4f60\u7684\u667a\u529b\u7b49\u7ea7\u51b3\u5b9a\u4e86\u4f60\u53ef\u4ee5\u643a\u5e26\u591a\u5c11\u79cd\u6280\u80fd\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u89e6\u53d1\u5668</heading>\n\t\t\t<text>\u6d88\u8017\u54c1\u548c\u6280\u80fd\u90fd\u6709\u9ed8\u8ba4\u8bbe\u7f6e\uff0c\u7528\u4e8e\u51b3\u5b9a\u4ed6\u4eec\u4f55\u65f6\u4f1a\u81ea\u52a8\u4f7f\u7528\u3002\u8fd9\u4e9b\u8bbe\u7f6e\u88ab\u79f0\u4e3a\u89e6\u53d1\u5668\uff0c\u53ef\u4ee5\u5728\u8fdb\u5165\u6218\u6597\u524d\u70b9\u51fb\u6280\u80fd\u4e0b\u65b9\u7684[\u9f7f\u8f6e\u56fe\u6807]\u8fdb\u884c\u4fee\u6539\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u51fb\u8d25\u548c\u91cd\u751f</heading>\n\t\t\t<text>\u5728\u6218\u6597\u4e2d\u88ab\u51fb\u8d25\u540e\uff0c\u4f60\u7684\u89d2\u8272\u9700\u8981\u7b49\u5f85\u91cd\u751f\u5012\u8ba1\u65f6\u7ed3\u675f\uff0c\u624d\u80fd\u590d\u6d3b\u5e76\u81ea\u52a8\u91cd\u65b0\u5f00\u59cb\u6218\u6597\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u56e2\u961f\u6218\u6597</heading>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u521b\u5efa\u6216\u52a0\u5165\u4e00\u4e2a\u961f\u4f0d\uff0c\u4e00\u8d77\u5728\u6709\u591a\u4e2a\u602a\u7269\u7684\u533a\u57df\u6218\u6597\u3002\u5f53\u6240\u6709\u961f\u5458\u90fd\u6309\u4e0b[\u51c6\u5907\u5c31\u7eea]\u952e\u540e\uff0c\u961f\u4f0d\u5c06\u81ea\u52a8\u524d\u5f80\u6218\u6597\u5730\u70b9\u3002\u602a\u7269\u4f1a\u968f\u673a\u653b\u51fb\u4efb\u4f55\u4e00\u540d\u961f\u5458\uff0c\u800c\u5a01\u80c1\u503c\u8f83\u9ad8\u7684\u961f\u5458\u4f1a\u66f4\u9891\u7e41\u5730\u6210\u4e3a\u653b\u51fb\u76ee\u6807\u3002\u602a\u7269\u7684\u7ecf\u9a8c\u548c\u6389\u843d\u5c06\u5e73\u5747\u5206\u914d\u7ed9\u6240\u6709\u73a9\u5bb6\u3002\u6218\u6597\u7b49\u7ea7\u540c\u65f6\u6ee1\u8db3\u6bd4\u6700\u9ad8\u7b49\u7ea7\u73a9\u5bb6\u4f4e20%\u4ee5\u4e0a\u4ee5\u53ca\u76f8\u5dee\u81f3\u5c1110\u7ea7\u7684\u73a9\u5bb6\u5c06\u83b7\u5f97\u8f83\u5c11\u7684\u7ecf\u9a8c\u548c\u6389\u843d\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u5730\u4e0b\u57ce</heading>\n\t\t\t<text>\u5730\u4e0b\u57ce\u7531\u591a\u6ce2\u66f4\u9ad8\u7ea7\u7684\u7cbe\u82f1\u602a\u7269\u548c\u72ec\u7279\u7684\u5730\u4e0b\u57ceboss\u7ec4\u6210\u3002\u73a9\u5bb6\u53ef\u4ee5\u4f7f\u7528\u5730\u4e0b\u57ce\u94a5\u5319\u8fdb\u5165\u5730\u4e0b\u57ce\uff0c\u8fd9\u4e9b\u94a5\u5319\u53ef\u4ee5\u4ece\u5e38\u89c4\u6218\u6597\u533a\u57df\u7684boss\u8eab\u4e0a\u627e\u5230\u94a5\u5319\u788e\u7247\u540e\u5236\u4f5c\u3002</text>\n\t\t\t<text>\u4e00\u4e2a\u5730\u4e0b\u57ce\u961f\u4f0d\u4e2d\u6700\u591a\u53ef\u6709\u4e94\u540d\u73a9\u5bb6\u3002\u6bcf\u4e2a\u4eba\u90fd\u5fc5\u987b\u6709\u4e00\u628a\u94a5\u5319\uff0c\u5728\u51fb\u8d25\u6700\u7ec8boss\u540e\u6d88\u8017\u94a5\u5319\u4f1a\u83b7\u5f97\u5730\u4e0b\u57ce\u5b9d\u7bb1\u3002\u5982\u679c\u4f60\u4ee5\u8f83\u5c11\u7684\u73a9\u5bb6\u5b8c\u6210\u4e86\u4e00\u4e2a\u5730\u4e0b\u57ce\uff0c\u5c31\u6709\u673a\u4f1a\u4ee5\u591a\u4ed8\u51fa\u4e00\u4e2a\u94a5\u5319\u4e3a\u4ee3\u4ef7\u5f97\u5230\u4e00\u4e2a\u989d\u5916\u7684\u5b9d\u7bb1\u3002\u5982\u679c\u5730\u4e0b\u57ce\u6ca1\u6709\u5b8c\u6210\uff0c\u4f60\u5c06\u4fdd\u7559\u4f60\u7684\u5730\u4e0b\u57ce\u94a5\u5319\u3002</text>\n\t\t\t<text>\u5728\u5730\u4e0b\u57ce\u4e2d\u88ab\u51fb\u8d25\u4e0d\u4f1a\u89e6\u53d1\u91cd\u751f\u5012\u8ba1\u65f6\uff0c\u53ea\u80fd\u7b49\u961f\u5458\u590d\u6d3b\u4f60\u3002\u5982\u679c\u6240\u6709\u6210\u5458\u90fd\u88ab\u51fb\u8d25\u4e86\uff0c\u5730\u4e0b\u57ce\u4efb\u52a1\u5c06\u88ab\u89c6\u4e3a\u5931\u8d25\uff0c\u4f60\u4eec\u5c06\u4ece\u7b2c1\u6ce2\u91cd\u65b0\u5f00\u59cb\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u6218\u6597\u4e13\u4e1a</heading>\n\t\t\t<text>\u4f60\u6709 7 \u4e2a\u53ef\u4ee5\u5347\u7ea7\u7684\u6218\u6597\u4e13\u4e1a:</text>\n\t\t\t<ul>\n\t\t\t<li>\u8010\u529b: \u6bcf\u5347\u4e00\u7ea7\uff0c\u6700\u5927HP\u589e\u52a010\u3002</li>\n\t\t\t<li>\u667a\u529b: \u6bcf\u5347\u4e00\u7ea7\uff0c\u6700\u5927MP\u589e\u52a010\u3002</li>\n\t\t\t<li>\u653b\u51fb: \u63d0\u9ad8\u4f60\u7684\u7cbe\u51c6\u5ea6\u3001\u653b\u51fb\u901f\u5ea6\u548c\u65bd\u6cd5\u901f\u5ea6\u3002</li>\n\t\t\t<li>\u9632\u5fa1: \u63d0\u9ad8\u4f60\u7684\u95ea\u907f\u3001\u62a4\u7532\u3001\u5143\u7d20\u6297\u6027\u548c\u9632\u5fa1\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u8fd1\u6218: \u63d0\u9ad8\u4f60\u7684\u8fd1\u6218\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u8fdc\u7a0b: \u63d0\u9ad8\u4f60\u7684\u8fdc\u7a0b\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u9b54\u6cd5: \u63d0\u9ad8\u4f60\u7684\u9b54\u6cd5\u4f24\u5bb3\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u72b6\u6001\u6548\u679c</heading>\n\t\t\t<text>\u6709\u4e9b\u72b6\u6001\u6548\u679c\u4f1a\u6682\u65f6\u963b\u6b62\u4f60\u91c7\u53d6\u67d0\u4e9b\u884c\u52a8:</text>\n\t\t\t<ul>\n\t\t\t<li>\u5931\u660e: \u7981\u6b62\u4f7f\u7528\u81ea\u52a8\u653b\u51fb\u3002</li>\n\t\t\t<li>\u6c89\u9ed8: \u7981\u6b62\u4f7f\u7528\u6280\u80fd\u3002</li>\n\t\t\t<li>\u7729\u6655: \u7981\u6b62\u4f7f\u7528\u81ea\u52a8\u653b\u51fb\u3001\u6280\u80fd\u548c\u6d88\u8017\u54c1\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u5c5e\u6027</heading>\n\t\t\t<text>\u4f60\u8fd8\u6709\u6b21\u8981\u6218\u6597\u5c5e\u6027\uff0c\u53d7\u4f60\u7684\u6218\u6597\u7b49\u7ea7\u3001\u88c5\u5907\u548c\u589e\u76ca\u5f71\u54cd:</text>\n\t\t\t<ul>\n\t\t\t<li>\u6218\u6597\u98ce\u683c: \u6bcf\u79cd\u653b\u51fb\u90fd\u6709\u7279\u5b9a\u7684\u7c7b\u578b - \u523a\u51fb\u3001\u65a9\u51fb\u3001\u949d\u51fb\u3001\u8fdc\u7a0b\u6216\u9b54\u6cd5\u3002</li>\n\t\t\t<li>\u4f24\u5bb3\u7c7b\u578b: \u6bcf\u6b21\u653b\u51fb\u90fd\u4f1a\u9020\u6210\u7279\u5b9a\u7c7b\u578b\u7684\u4f24\u5bb3 - \u7269\u7406\u3001\u6c34\u7cfb\u3001\u81ea\u7136\u7cfb\u6216\u706b\u7cfb\u3002</li>\n\t\t\t<li>\u653b\u51fb\u95f4\u9694: \u81ea\u52a8\u653b\u51fb\u7684\u901f\u5ea6\u3002</li>\n\t\t\t<li>\u6280\u80fd\u6025\u901f: \u51cf\u5c11\u6280\u80fd\u51b7\u5374\u65f6\u95f4\u3002</li>\n\t\t\t<li>\u7cbe\u786e\u5ea6: \u589e\u52a0\u51fb\u4e2d\u7684\u51e0\u7387\u3002</li>\n\t\t\t<li>\u4f24\u5bb3: \u51fb\u4e2d\u65f6\u7684\u6700\u5927\u4f24\u5bb3\u3002\u81ea\u52a8\u653b\u51fb\u4f24\u5bb3\u57281\u548c\u6700\u5927\u4f24\u5bb3\u4e4b\u95f4\u968f\u673a\u3002</li>\n\t\t\t<li>\u66b4\u51fb: \u66b4\u51fb\u603b\u662f\u4f1a\u9020\u6210\u6700\u5927\u4f24\u5bb3\u3002\u8fdc\u7a0b\u6218\u6597\u98ce\u683c\u5177\u6709\u57fa\u7840\u7684\u66b4\u51fb\u51e0\u7387\u3002</li>\n\t\t\t<li>\u589e\u5e45: \u589e\u52a0\u9020\u6210\u7684\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u8d2f\u7a7f: \u653b\u51fb\u65f6\u5ffd\u7565\u654c\u4eba\u4e00\u5b9a\u6bd4\u4f8b\u7684\u62a4\u7532\u6216\u6297\u6027\u3002</li>\n\t\t\t<li>\u95ea\u907f: \u589e\u52a0\u95ea\u907f\u653b\u51fb\u7684\u51e0\u7387\u3002</li>\n\t\t\t<li>\u62a4\u7532: \u51cf\u8f7b\u4e00\u5b9a\u6bd4\u4f8b\u7684\u7269\u7406\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u6297\u6027: \u51cf\u8f7b\u4e00\u5b9a\u6bd4\u4f8b\u7684\u6c34\u7cfb\u3001\u81ea\u7136\u7cfb\u6216\u706b\u7cfb\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u751f\u547d\u7a83\u53d6: \u6839\u636e\u4f60\u81ea\u52a8\u653b\u51fb\u9020\u6210\u4f24\u5bb3\u7684\u767e\u5206\u6bd4\u6062\u590dHP\u3002</li>\n\t\t\t<li>\u6cd5\u529b\u6c72\u53d6: \u6839\u636e\u4f60\u81ea\u52a8\u653b\u51fb\u9020\u6210\u4f24\u5bb3\u7684\u767e\u5206\u6bd4\u6062\u590dMP\u3002</li>\n\t\t\t<li>\u8346\u68d8: \u88ab\u653b\u51fb\u65f6\uff0c\u5c06\u4e00\u5b9a\u6bd4\u4f8b\u7684\u9632\u5fa1\u4f24\u5bb3\u53cd\u5c04\u7ed9\u653b\u51fb\u8005\u3002\u6bcf\u4e2a\u62a4\u7532\u6216\u6297\u6027(\u4e0e\u653b\u51fb\u7c7b\u578b\u76f8\u5bf9\u5e94)\u589e\u52a01%\u4f24\u5bb3\u3002</li>\n\t\t\t<li>\u53cd\u4f24: \u88ab\u653b\u51fb\u65f6\uff0c\u5c06(\u9632\u5fa1\u4f24\u5bb3+\u88ab\u653b\u51fb\u4f24\u5bb3)\u7684\u4e00\u5b9a\u6bd4\u4f8b\u4ee5\u949d\u51fb\u5f62\u5f0f\u53cd\u4f24\u653b\u51fb\u8005\u3002</li>\n\t\t\t<li>\u97e7\u6027: \u964d\u4f4e\u5931\u660e\u3001\u6c89\u9ed8\u6216\u7729\u6655\u7684\u51e0\u7387\u3002</li>\n\t\t\t<li>\u5a01\u80c1: \u589e\u52a0\u88ab\u602a\u7269\u653b\u51fb\u7684\u51e0\u7387\u3002</li>\n\t\t\t<li>HP/MP\u6062\u590d: \u6bcf10\u79d2\u6062\u590d\u4e00\u5b9a\u767e\u5206\u6bd4\u7684\u6700\u5927HP/MP\u3002</li>\n\t\t\t<li>\u98df\u7269\u6025\u901f: \u51cf\u5c11\u98df\u7269\u51b7\u5374\u65f6\u95f4\u3002</li>\n\t\t\t<li>\u996e\u6599\u6d53\u7f29: \u589e\u52a0\u996e\u6599\u6548\u679c\u3002\u7f29\u77ed\u6301\u7eed\u65f6\u95f4\u548c\u51b7\u5374\u65f6\u95f4\u3002</li>\n\t\t\t<li>\u6218\u6597\u6389\u843d\u7387: \u63d0\u9ad8\u5e38\u89c4\u7269\u54c1\u7684\u6389\u843d\u7387(\u4e0d\u8d85\u8fc7100%)\u3002</li>\n\t\t\t<li>\u6218\u6597\u6389\u843d\u6570\u91cf: \u589e\u52a0\u5e38\u89c4\u7269\u54c1\u7684\u6389\u843d\u6570\u91cf\u3002</li>\n\t\t\t<li>\u6218\u6597\u7a00\u6709\u53d1\u73b0: \u589e\u52a0\u7a00\u6709\u7269\u54c1\u7684\u6389\u843d\u7387\u3002</li>\n\t\t\t<li>\u4e3b\u4fee\u8bad\u7ec3: 30%\u7684\u6218\u6597\u7ecf\u9a8c\u4f1a\u5206\u914d\u7ed9\u4e3b\u4fee\u8bad\u7ec3\u4e13\u4e1a\uff0c\u8fd9\u53d6\u51b3\u4e8e\u4f60\u7684\u6b66\u5668\u3002</li>\n\t\t\t<li>\u9009\u4fee\u8bad\u7ec3: 70%\u7684\u6218\u6597\u7ecf\u9a8c\u4f1a\u5206\u914d\u7ed9\u4e13\u6ce8\u8bad\u7ec3\u4e13\u4e1a\uff0c\u8fd9\u53d6\u51b3\u4e8e\u4f60\u7684\u62a4\u7b26\u3002</li>\n\t\t\t<li>\u6218\u6597\u7b49\u7ea7: \u4ec5\u7528\u4e8e\u663e\u793a\uff0c\u4ee3\u8868\u57fa\u4e8e\u6218\u6597\u4e13\u4e1a\u7b49\u7ea7\u7684\u7efc\u5408\u6218\u6597\u529b\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u516c\u5f0f</heading>\n\t\t\t<text>\u5bf9\u4e8e\u90a3\u4e9b\u559c\u6b22\u6570\u5b66\u7684\u4eba\uff0c\u4e0b\u9762\u662f\u6b21\u8981\u6218\u6597\u5c5e\u6027\u7684\u8ba1\u7b97\u516c\u5f0f:</text>\n\t\t\t<ul>\n\t\t\t<li>\u6700\u5927HP = 10 * (10 + \u8010\u529b)</li>\n\t\t\t<li>\u6700\u5927MP = 10 * (10 + \u667a\u529b)</li>\n\t\t\t<li>\u653b\u51fb\u95f4\u9694 = \u57fa\u7840\u95f4\u9694 / (1 + (\u653b\u51fb / 2000)) / (1 + \u653b\u51fb\u901f\u5ea6\u52a0\u6210)</li>\n\t\t\t<li>\u65bd\u6cd5\u65f6\u95f4 = \u57fa\u7840\u65bd\u6cd5\u65f6\u95f4 / (1 + (\u653b\u51fb / 2000) + \u65bd\u6cd5\u901f\u5ea6)</li>\n\t\t\t<li>\u80fd\u529b\u51b7\u5374\u65f6\u95f4 = \u57fa\u7840\u51b7\u5374\u65f6\u95f4 * 100 / (100 + \u6280\u80fd\u6025\u901f)</li>\n\t\t\t<li>\u7cbe\u786e\u5ea6 = (10 + \u653b\u51fb) * (1 + \u52a0\u6210\u767e\u5206\u6bd4)</li>\n\t\t\t<li>\u4f24\u5bb3 = (10 + [\u8fd1\u6218|\u8fdc\u7a0b|\u9b54\u6cd5|\u9632\u5fa1]) * (1 + \u52a0\u6210\u767e\u5206\u6bd4)</li>\n\t\t\t<li>\u91cd\u76fe\u949d\u51fb\u4f24\u5bb3 = \u949d\u51fb\u4f24\u5bb3 + \u9632\u5fa1\u4f24\u5bb3</li>\n\t\t\t<li>\u8346\u68d8\u4f24\u5bb3 = \u9632\u5fa1\u4f24\u5bb3 * (1 + [\u62a4\u7532|\u6297\u6027] / 100) * \u8346\u68d8%</li>\n\t\t\t<li>\u53cd\u4f24\u4f24\u5bb3 = (\u9632\u5fa1\u4f24\u5bb3 + MIN(\u653b\u51fb\u8005\u672a\u51cf\u514d\u4f24\u5bb3, 5 * \u9632\u5fa1\u4f24\u5bb3)) * \u53cd\u4f24%</li>\n\t\t\t<li>\u547d\u4e2d\u7387 = (\u6211\u7684\u7cbe\u51c6\u5ea6 ^ 1.4) / (\u6211\u7684\u7cbe\u51c6\u5ea6 ^ 1.4 + \u654c\u4eba\u95ea\u907f ^ 1.4)</li>\n\t\t\t<li>\u8fdc\u7a0b\u66b4\u51fb\u52a0\u6210\u7387 = 0.3 * \u547d\u4e2d\u51e0\u7387</li>\n\t\t\t<li>\u95ea\u907f = (10 + \u9632\u5fa1) * (1 + \u52a0\u6210\u767e\u5206\u6bd4)</li>\n\t\t\t<li>\u62a4\u7532 = 0.2 * \u9632\u5fa1 + \u52a0\u6210</li>\n\t\t\t<li>\u53d7\u5230\u7684\u7269\u7406\u4f24\u5bb3\u767e\u5206\u6bd4 = 100 / (100 + \u62a4\u7532)<br />\u5982\u679c\u62a4\u7532\u4e3a\u8d1f\u503c\uff0c\u5219 = (100 - \u62a4\u7532) / 100</li>\n\t\t\t<li>\u6297\u6027 = 0.2 * \u9632\u5fa1 + \u52a0\u6210</li>\n\t\t\t<li>\u53d7\u5230\u7684\u5143\u7d20\u4f24\u5bb3\u767e\u5206\u6bd4 = 100 / (100 + \u6297\u6027)<br />\u5982\u679c\u6297\u6027\u4e3a\u8d1f\u503c\uff0c\u5219 = (100 - \u6297\u6027) / 100</li>\n\t\t\t<li>\u5931\u660e/\u6c89\u9ed8/\u7729\u6655\u51e0\u7387 = \u57fa\u7840\u51e0\u7387 * 100 / (100 + \u97e7\u6027)</li>\n\t\t\t<li>\u88ab\u602a\u7269\u9501\u5b9a\u51e0\u7387 = \u6211\u7684\u5a01\u80c1/(\u56e2\u961f\u603b\u5a01\u80c1)</li>\n\t\t\t<li>\u6218\u6597\u7b49\u7ea7 = 0.1 * (\u8010\u529b + \u667a\u529b + \u653b\u51fb + \u9632\u5fa1 + MAX(\u8fd1\u6218, \u8fdc\u7a0b, \u9b54\u6cd5)) + 0.5 * MAX(\u653b\u51fb, \u9632\u5fa1, \u8fd1\u6218, \u8fdc\u7a0b, \u9b54\u6cd5)</li>\n\t\t\t</ul>\n\t\t\t<br />",labyrinth:"\u8ff7\u5bab",labyrinthContent:'<heading>\u8ff7\u5bab</heading>\n\t\t\t<text>\u8ff7\u5bab\u7531\u591a\u5c42\u751f\u6d3b\u548c\u6218\u6597\u6311\u6218\u7ec4\u6210\u3002\u6bcf\u6b21\u63a2\u7d22\u4f1a\u7ecf\u5386\u96be\u5ea6\u9012\u589e\u7684\u697c\u5c42\uff0c\u6bcf\u5c42\u7531\u4e00\u4e2a\u623f\u95f4\u7f51\u683c\u7ec4\u6210\u3002\u901a\u8fc7\u623f\u95f4\u6765\u63a8\u8fdb\u8fdb\u5ea6\u3001\u6536\u96c6\u6218\u5229\u54c1\u5e76\u524d\u5f80\u66f4\u6df1\u7684\u697c\u5c42\u3002</text>\n\t\t\t<text>\u63a8\u8350\uff1a\u603b\u7b49\u7ea71000+\uff0c\u4e14\u62e5\u6709\u8db3\u591f\u7684\u6280\u80fd\u548c\u4e0d\u540c\u7684\u6218\u6597\u98ce\u683c\u6765\u5c1d\u8bd5\u81f3\u5c11\u4e00\u534a\u7684\u623f\u95f4\u7c7b\u578b\uff0c\u624d\u80fd\u6709\u6548\u5730\u8fdb\u884c\u8ff7\u5bab\u63a2\u7d22\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u5165\u573a\u6b21\u6570\u4e0e\u51b7\u5374</heading>\n\t\t\t<text>\u6700\u591a\u53ef\u6301\u67093\u6b21\u5165\u573a\u6b21\u6570\u3002\u5165\u573a\u6b21\u6570\u6309\u51b7\u5374\u65f6\u95f4\u9010\u4e00\u6062\u590d\uff08\u57fa\u784072\u5c0f\u65f6\uff0c\u53ef\u901a\u8fc7\u5347\u7ea7\u7f29\u77ed\u81f348\u5c0f\u65f6\uff09\u3002\u6bcf\u6b21\u63a2\u7d22\u6d88\u80171\u6b21\u5165\u573a\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u697c\u5c42\u4e0e\u7f51\u683c</heading>\n\t\t\t<text>\u6bcf\u5c42\u662f\u4e00\u4e2a\u623f\u95f4\u7f51\u683c\u3002\u7f51\u683c\u5927\u5c0f\u968f\u697c\u5c42\u6df1\u5ea6\u589e\u957f\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u7b2c1\u5c42\uff1a4x4\u7f51\u683c</li>\n\t\t\t<li>\u7b2c2\u5c42\uff1a5x5\u7f51\u683c</li>\n\t\t\t<li>\u7b2c3\u5c42\uff1a6x6\u7f51\u683c</li>\n\t\t\t<li>\u7b2c4\u5c42\uff1a7x7\u7f51\u683c</li>\n\t\t\t<li>\u7b2c5\u5c42\u53ca\u4ee5\u4e0a\uff1a8x8\u7f51\u683c</li>\n\t\t\t</ul>\n\t\t\t<text>\u4ece\u5de6\u4e0a\u89d2\u5f00\u59cb\uff0c\u697c\u5c42\u51fa\u53e3\u5728\u53f3\u4e0b\u89d2\u3002\u623f\u95f4\u7b49\u7ea7\u57fa\u4e8e\u697c\u5c42\uff1a\u4ece20-40\u5f00\u59cb\uff0c\u6bcf\u5c42\u589e\u52a020\u7ea7\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u623f\u95f4\u7c7b\u578b</heading>\n\t\t\t<text>\n\t\t\t<ul>\n\t\t\t<li>\u8d77\u59cb\u623f\u95f4\uff1a\u6bcf\u5c42\u7684\u8d77\u59cb\u4f4d\u7f6e\u3002</li>\n\t\t\t<li>\u751f\u6d3b\u623f\u95f4\uff1a\u6311\u621810\u79cd\u975e\u6218\u6597\u6280\u80fd\u4e4b\u4e00\u3002\u7ea6\u4e00\u534a\u7684\u6311\u6218\u623f\u95f4\u662f\u751f\u6d3b\u623f\u95f4\u3002</li>\n\t\t\t<li>\u6218\u6597\u623f\u95f4\uff1a\u4e0e\u8ff7\u5bab\u602a\u7269\u7684\u5355\u4eba\u6218\u6597\u3002\u7ea6\u4e00\u534a\u7684\u6311\u6218\u623f\u95f4\u662f\u6218\u6597\u623f\u95f4\u3002</li>\n\t\t\t<li>\u5b9d\u7bb1\u623f\u95f4\uff1a\u63d0\u4f9b\u989d\u5916\u7684\u8ff7\u5bab\u4ee3\u5e01\u548c\u6218\u5229\u54c1\u3002\u5b9d\u7bb1\u623f\u95f4\u6570\u91cf\u7b49\u4e8e\u697c\u5c42\u6570\uff08\u4e0a\u96506\u4e2a\uff09\u3002</li>\n\t\t\t<li>\u697c\u5c42\u51fa\u53e3\uff1a\u63d0\u4f9b\u66f4\u591a\u5956\u52b1\u3002\u89e3\u9501\u4e0b\u4e00\u5c42\u3002</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<br />\n\t\t\t<heading>\u9053\u5177</heading>\n\t\t\t<text>\u6bcf\u6b21\u63a2\u7d22\u643a\u5e26\u9053\u5177\u3002\u9053\u5177\u4e0a\u9650\u53ef\u4ece\u8ff7\u5bab\u5546\u5e97\u5347\u7ea7\u3002</text>\n\t\t\t<ul>\n\t\t\t<li>\u706b\u628a\uff1a\u6bcf\u8fdb\u5165\u4e00\u4e2a\u623f\u95f4\u6d88\u8017\u4e00\u6839\u3002\u9ad8\u7b49\u7ea7\u706b\u628a\u6709\u6982\u7387\u4fdd\u7559\uff08\u57fa\u7840\uff1a0%\uff0c\u9ad8\u7ea7\uff1a10%\uff0c\u4e13\u5bb6\uff1a20%\uff09\u3002\u6ca1\u6709\u706b\u628a\u65e0\u6cd5\u8fdb\u5165\u623f\u95f4\u3002\u901a\u8fc7\u5236\u4f5c\u751f\u4ea7\u3002</li>\n\t\t\t<li>\u6597\u7bf7\uff1a\u76f4\u63a5\u901a\u8fc7\u53ef\u89c1\u7684\u6311\u6218\u623f\u95f4\uff0c\u4f46\u4e0d\u4f1a\u83b7\u5f97\u7ecf\u9a8c\u6216\u5956\u52b1\u3002\u57fa\u7840\u6597\u7bf7\u9002\u7528\u4e8e50\u7ea7\u4ee5\u4e0b\uff0c\u9ad8\u7ea7\u9002\u7528\u4e8e100\u7ea7\u4ee5\u4e0b\uff0c\u4e13\u5bb6\u65e0\u7b49\u7ea7\u9650\u5236\u3002\u6597\u7bf7\u5728\u8d85\u8fc7\u7b49\u7ea7\u4e0a\u9650\u65f6\u6bcf\u7ea7\u67092%\u5931\u8d25\u7387\u3002\u901a\u8fc7\u7f1d\u7eab\u751f\u4ea7\u3002</li>\n\t\t\t<li>\u63a2\u7167\u706f\uff1a\u63ed\u793a\u4e00\u7247\u533a\u57df\u5185\u7684\u9690\u85cf\u623f\u95f4\u3002\u57fa\u7840\u6700\u591a\u63ed\u793a5\u4e2a\u623f\u95f4\uff0c\u9ad8\u7ea7\u6700\u591a9\u4e2a\uff0c\u4e13\u5bb6\u6700\u591a13\u4e2a\u3002\u901a\u8fc7\u5976\u916a\u953b\u9020\u751f\u4ea7\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u8865\u7ed9\u7bb1</heading>\n\t\t\t<text>\u6bcf\u79cd\u8865\u7ed9\u7bb1\u5728\u8fdb\u5165\u65f6\u6d88\u8017\u4e00\u4e2a\uff0c\u589e\u76ca\u6301\u7eed\u6574\u6b21\u63a2\u7d22\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u8336\u53f6\u7bb1\uff1a\u589e\u5f3a\u6240\u6709\u751f\u6d3b\u4e13\u4e1a\u3002\u52063\u4e2a\u7b49\u7ea7\uff08\u57fa\u7840\u3001\u9ad8\u7ea7\u3001\u4e13\u5bb6\uff09\u3002\u901a\u8fc7\u51b2\u6ce1\u751f\u4ea7\u3002</li>\n\t\t\t<li>\u5496\u5561\u7bb1\uff1a\u589e\u5f3a\u6240\u6709\u6218\u6597\u4e13\u4e1a\u3002\u52063\u4e2a\u7b49\u7ea7\u3002\u901a\u8fc7\u51b2\u6ce1\u751f\u4ea7\u3002</li>\n\t\t\t<li>\u98df\u7269\u7bb1\uff1a\u589e\u52a0\u751f\u547d\u548c\u9b54\u529b\u56de\u590d\u3002\u52063\u4e2a\u7b49\u7ea7\u3002\u901a\u8fc7\u70f9\u996a\u751f\u4ea7\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u751f\u6d3b\u623f\u95f4</heading>\n\t\t\t<text>\u751f\u6d3b\u623f\u95f4\u67092\u5206\u949f\u65f6\u95f4\u9650\u5236\uff0c\u6bcf\u6b21\u884c\u52a810\u79d2\uff08\u57fa\u7840\uff0c\u901f\u5ea6\u52a0\u6210\u524d\uff09\u3002\u5f3a\u5316\u623f\u95f4\u57fa\u7840\u884c\u52a8\u65f6\u95f4\u4e3a8\u79d2\u3002\u5fc5\u987b\u586b\u6ee1\u8fdb\u5ea6\u6761\u624d\u80fd\u901a\u8fc7\u623f\u95f4\u3002</text>\n\t\t\t<ul>\n\t\t\t<li>\u6210\u529f\u7387\uff1a\u57fa\u784080%\uff0c\u6bcf\u4f4e\u4e8e\u623f\u95f41\u7ea7\u4e58\u4ee5-1%\uff0c\u6bcf\u9ad8\u4e8e1\u7ea7\u4e58\u4ee5+0.5%\u3002\u4e13\u4e1a\u7b49\u7ea7\u52a0\u6210\u3001\u8336\u53f6\u7bb1\u589e\u76ca\u548c\u5176\u4ed6\u52a0\u6210\u53ef\u63d0\u9ad8\u6709\u6548\u7b49\u7ea7\u3002</li>\n\t\t\t<li>\u53cc\u500d\u8fdb\u5ea6\u6982\u7387\uff1a\u6210\u529f\u65f6\u6709\u6982\u7387\u4f7f\u8fdb\u5ea6\u7ffb\u500d\u3002\u7b49\u4e8e\u8865\u7ed9\u7bb1\u589e\u76ca + \u91c7\u96c6\u52a0\u6210\uff08\u6324\u5976\u3001\u4f10\u6728\u3001\u91c7\u6458\uff09 + \u7f8e\u98df\u52a0\u6210\uff08\u70f9\u996a\u3001\u917f\u9020\uff09\u3002</li>\n\t\t\t<li>\u8fdb\u5ea6\uff1a\u57fa\u4e8e\u5de5\u4f5c\u529b\uff0c\u5373\u6709\u6548\u6280\u80fd\u7b49\u7ea7 x\uff081 + \u6548\u7387\uff09\u3002</li>\n\t\t\t<li>\u5f3a\u5316\u623f\u95f4\u7279\u6b8a\uff1a\u6bcf\u6b21\u6210\u529f+1\u5f3a\u5316\u7b49\u7ea7\uff0c\u5931\u8d25-1\u7b49\u7ea7\u3002\u5fc5\u987b\u8fbe\u5230\u76ee\u6807\u5f3a\u5316\u7b49\u7ea7\u624d\u80fd\u901a\u8fc7\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u6218\u6597\u623f\u95f4</heading>\n\t\t\t<text>\u6218\u6597\u623f\u95f4\u662f2\u5206\u949f\u65f6\u95f4\u9650\u5236\u7684\u5355\u4eba\u6218\u6597\u3002\u5bf9\u6297\u4e00\u53ea\u6839\u636e\u623f\u95f4\u7b49\u7ea7\u7f29\u653e\u7684\u8ff7\u5bab\u602a\u7269\u3002</text>\n\t\t\t<ul>\n\t\t\t<li>\u6697\u5f71\u5f13\u624b\uff1a\u8fdc\u7a0b\u653b\u51fb\uff0c\u9020\u6210\u7269\u7406\u4f24\u5bb3\u3002\u5f31\u70b9\u4e3a\u523a\u51fb\u548c\u65a9\u51fb\u8fd1\u6218\u3002</li>\n\t\t\t<li>\u70c8\u7130\u730e\u624b\uff1a\u8fdc\u7a0b\u653b\u51fb\uff0c\u9020\u6210\u706b\u7130\u4f24\u5bb3\u3002\u5f31\u70b9\u4e3a\u65a9\u51fb\u548c\u949d\u51fb\u8fd1\u6218\u3002</li>\n\t\t\t<li>\u971c\u51bb\u72d9\u51fb\u624b\uff1a\u8fdc\u7a0b\u653b\u51fb\uff0c\u9020\u6210\u6c34\u7cfb\u4f24\u5bb3\u3002\u5f31\u70b9\u4e3a\u949d\u51fb\u548c\u523a\u51fb\u8fd1\u6218\u3002</li>\n\t\t\t<li>\u6d77\u5996\uff1a\u9b54\u6cd5\u653b\u51fb\uff0c\u9020\u6210\u6c34\u7cfb\u4f24\u5bb3\u3002\u5f31\u70b9\u4e3a\u8fdc\u7a0b\u3002</li>\n\t\t\t<li>\u877e\u8788\uff1a\u8fd1\u6218\u653b\u51fb\uff0c\u9020\u6210\u706b\u7130\u4f24\u5bb3\u3002\u5f31\u70b9\u4e3a\u8fdc\u7a0b\u3002</li>\n\t\t\t<li>\u6811\u7cbe\uff1a\u9b54\u6cd5\u653b\u51fb\uff0c\u9020\u6210\u81ea\u7136\u4f24\u5bb3\u3002\u5f31\u70b9\u4e3a\u8fdc\u7a0b\u3002</li>\n\t\t\t<li>\u5de8\u874e\uff1a\u8fd1\u6218\u523a\u51fb\u653b\u51fb\u3002\u5f31\u70b9\u4e3a\u6c34\u7cfb\u548c\u81ea\u7136\u9b54\u6cd5\u3002</li>\n\t\t\t<li>\u5de8\u87b3\u8782\uff1a\u8fd1\u6218\u65a9\u51fb\u653b\u51fb\u3002\u5f31\u70b9\u4e3a\u81ea\u7136\u548c\u706b\u7130\u9b54\u6cd5\u3002</li>\n\t\t\t<li>\u72ec\u773c\u5de8\u4eba\uff1a\u8fd1\u6218\u949d\u51fb\u653b\u51fb\u3002\u5f31\u70b9\u4e3a\u706b\u7130\u548c\u6c34\u7cfb\u9b54\u6cd5\u3002</li>\n\t\t\t<li>\u5b9d\u7bb1\u602a\uff1a\u8fd1\u6218\u523a\u51fb\u653b\u51fb\uff0c\u653b\u51fb\u901f\u5ea6\u6781\u5feb\u3002\u5f31\u70b9\u4e3a\u8346\u68d8\u548c\u53cd\u51fb\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u5956\u52b1</heading>\n\t\t\t<text>\u5956\u52b1\u968f\u697c\u5c42\u7b49\u7ea7\u589e\u52a0\u3002\u5728\u8ff7\u5bab\u5546\u5e97\u7528\u4ee3\u5e01\u8d2d\u4e70\u5347\u7ea7\u548c\u7269\u54c1\u3002</text>\n\t\t\t<ul>\n\t\t\t<li>\u7ecf\u9a8c\uff1a\u901a\u8fc7\u6311\u6218\u623f\u95f4\u53ef\u83b7\u5f97\u76f8\u5173\u4e13\u4e1a\u7684\u7ecf\u9a8c\u3002</li>\n\t\t\t<li>\u8ff7\u5bab\u4ee3\u5e01\uff1a\u4ece\u6311\u6218\u623f\u95f4\u3001\u5b9d\u7bb1\u623f\u95f4\u548c\u697c\u5c42\u51fa\u53e3\u83b7\u5f97\u3002</li>\n\t\t\t<li>\u7d2b\u591a\u62c9\u4e4b\u76d2\uff1a\u4ece\u6311\u6218\u623f\u95f4\u3001\u5b9d\u7bb1\u623f\u95f4\u548c\u697c\u5c42\u51fa\u53e3\u83b7\u5f97\u3002</li>\n\t\t\t<li>\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1\uff1a\u4ece\u697c\u5c42\u51fa\u53e3\u83b7\u5f97\uff08\u7b2c6\u5c42\u4ee5\u4e0a\uff09\u3002</li>\n\t\t\t<li>\u8ff7\u5bab\u7cbe\u534e\uff1a\u6765\u81ea\u7d2b\u591a\u62c9\u4e4b\u76d2\u3002\u7528\u4e8e\u5f3a\u5316\u8ff7\u5bab\u88c5\u5907\u3002</li>\n\t\t\t<li>\u5377\u8f74\uff1a\u6765\u81ea\u7d2b\u591a\u62c9\u4e4b\u76d2\u3002\u63d0\u4f9b\u9650\u65f6\u4e2a\u4eba\u589e\u76ca\u3002</li>\n\t\t\t<li>\u78c1\u77f3\uff1a\u6765\u81ea\u7d2b\u591a\u62c9\u4e4b\u76d2\u3002\u7528\u4e8e\u5236\u4f5c95\u7ea7\u9774\u5b50\u3002</li>\n\t\t\t<li>\u751f\u6d3b\u62ab\u98ce\uff1a\u6765\u81ea\u7d2b\u591a\u62c9\u4e4b\u76d2\u3002</li>\n\t\t\t<li>\u8ff7\u5bab\u7cbe\u70bc\u788e\u7247\uff1a\u6765\u81ea\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1\u3002\u7528\u4e8e\u7cbe\u70bc\u8ff7\u5bab\u62ab\u98ce\u548c\u9774\u5b50\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u8ff7\u5bab\u5546\u5e97</heading>\n\t\t\t<text>\u5728\u5546\u5e97\u6d88\u8d39\u8ff7\u5bab\u4ee3\u5e01\u3002\u53ef\u7528\u5347\u7ea7\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u51b7\u5374\u7f29\u51cf\uff1a\u6bcf\u7ea7-4\u5c0f\u65f6\uff08\u6700\u591a6\u7ea7\uff0c\u5c0672\u5c0f\u65f6\u57fa\u7840\u51b7\u5374\u7f29\u51cf\u81f348\u5c0f\u65f6\uff09\u3002</li>\n\t\t\t<li>\u706b\u628a\u5bb9\u91cf\uff1a\u6bcf\u7ea7+20\uff08\u6700\u591a15\u7ea7\uff09\u3002</li>\n\t\t\t<li>\u6597\u7bf7\u5bb9\u91cf\uff1a\u6bcf\u7ea7+1\uff08\u6700\u591a8\u7ea7\uff09\u3002</li>\n\t\t\t<li>\u63a2\u7167\u706f\u5bb9\u91cf\uff1a\u6bcf\u7ea7+1\uff08\u6700\u591a10\u7ea7\uff09\u3002</li>\n\t\t\t<li>\u5b8c\u5168\u81ea\u52a8\u5316\uff1a\u6bcf\u7ea7+1\u5c42\uff08\u6700\u591a10\u7ea7\uff09\u3002</li>\n\t\t\t</ul>\n\t\t\t<text>\u5546\u5e97\u7269\u54c1\u5305\u62ec\u7cbe\u534e\u3001\u5377\u8f74\u3001\u78c1\u77f3\u3001\u62ab\u98ce\u548c\u7cbe\u70bc\u788e\u7247\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u81ea\u52a8\u5316</heading>\n\t\t\t<text>\u81ea\u52a8\u5316\u6807\u7b7e\u5141\u8bb8\u914d\u7f6e\u5404\u623f\u95f4\u7c7b\u578b\u7684\u914d\u88c5\u3001\u8df3\u8fc7\u9608\u503c\u548c\u5b8c\u5168\u81ea\u52a8\u5316\u3002</text>\n\t\t\t<ul>\n\t\t\t<li>\u5404\u623f\u95f4\u914d\u88c5\uff1a\u4e3a\u6bcf\u79cd\u623f\u95f4\u7c7b\u578b\uff0810\u79cd\u751f\u6d3b + 10\u79cd\u6218\u6597\uff09\u6307\u5b9a\u914d\u88c5\u3002\u8fdb\u5165\u8be5\u623f\u95f4\u7c7b\u578b\u65f6\u81ea\u52a8\u88c5\u5907\u5bf9\u5e94\u914d\u88c5\u3002</li>\n\t\t\t<li>\u8df3\u8fc7\u9608\u503c\uff1a\u4e3a\u6bcf\u79cd\u623f\u95f4\u7c7b\u578b\u8bbe\u7f6e\u7b49\u7ea7\u9608\u503c\u3002\u5f53\uff08\u623f\u95f4\u7b49\u7ea7 - \u4f60\u7684\u6709\u6548\u7b49\u7ea7\uff09\u2265 \u9608\u503c\u65f6\uff0c\u8be5\u623f\u95f4\u4f1a\u88ab\u81ea\u52a8\u8df3\u8fc7\u3002</li>\n\t\t\t<li>\u6bcf\u623f\u95f4\u6700\u5927\u5c1d\u8bd5\u6b21\u6570\uff1a\u8bbe\u7f6e\u7cfb\u7edf\u5c1d\u8bd5\u67d0\u4e2a\u623f\u95f4\u7684\u6b21\u6570\uff0c\u8d85\u8fc7\u540e\u8be5\u623f\u95f4\u4f1a\u88ab\u8df3\u8fc7\u3002</li>\n\t\t\t<li>\u5b8c\u5168\u81ea\u52a8\u5316\uff1a\u9700\u4ece\u8ff7\u5bab\u5546\u5e97\u89e3\u9501\uff08\u6bcf\u7ea7+1\u5c42\uff09\u3002\u542f\u7528\u540e\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u9010\u4e2a\u5c06\u623f\u95f4\u6dfb\u52a0\u5230\u8def\u5f84\u4e2d\u3002\u4f18\u5148\u987a\u5e8f\uff1a\u53ef\u76f4\u63a5\u5230\u8fbe\u7684\u5956\u52b1\u623f\u95f4\u4f18\u5148\uff0c\u7136\u540e\u662f\u697c\u5c42\u51fa\u53e3\uff0c\u6700\u540e\u662f\u5269\u4f59\u672a\u8df3\u8fc7\u7684\u623f\u95f4\u3002\u5b8c\u6210\u6240\u6709\u53ef\u901a\u8fc7\u7684\u623f\u95f4\u540e\uff0c\u81ea\u52a8\u8fdb\u5165\u4e0b\u4e00\u5c42\u5e76\u91cd\u590d\u3002</li>\n\t\t\t<li>\u6597\u7bf7\u81ea\u52a8\u4f7f\u7528\uff1a\u542f\u7528\u5b8c\u5168\u81ea\u52a8\u5316\u65f6\uff0c\u6597\u7bf7\u53ef\u8bbe\u7f6e\u4e3a"\u5361\u4f4f\u65f6\u4f7f\u7528"\u6216"\u4e0d\u4f7f\u7528"\uff08\u9ed8\u8ba4\uff09\u3002"\u5361\u4f4f\u65f6\u4f7f\u7528"\u4f1a\u5728\u6ca1\u6709\u901a\u5f80\u697c\u5c42\u51fa\u53e3\u7684\u8def\u5f84\u65f6\u81ea\u52a8\u4f7f\u7528\u6597\u7bf7\uff0c\u8fd9\u5305\u62ec\u88ab\u81ea\u52a8\u8df3\u8fc7\u6216\u5931\u8d25\u6b21\u6570\u8fc7\u591a\u7684\u623f\u95f4\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<heading>\u8ff7\u5bab\u79ef\u5206</heading>\n\t\t\t<text>\u6bcf\u901a\u8fc7\u4e00\u4e2a\u623f\u95f4\u83b7\u5f97\u7b49\u4e8e\u5f53\u524d\u697c\u5c42\u6570\u7684\u79ef\u5206\u3002\u79ef\u5206\u5728\u6240\u6709\u63a2\u7d22\u4e2d\u7d2f\u79ef\uff0c\u5e76\u5728\u6392\u884c\u699c\u4e0a\u8ffd\u8e2a\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u516c\u5f0f</heading>\n\t\t\t<text>\u673a\u5236\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u7f51\u683c\u5927\u5c0f = MIN(3 + \u697c\u5c42, 8)</li>\n\t\t\t<li>\u5de5\u4f5c\u529b = \u6709\u6548\u7b49\u7ea7 * (1 + \u6548\u7387)</li>\n\t\t\t<li>\u751f\u6d3b\u6210\u529f\u7387 = 0.80 * (1 + \u7b49\u7ea7\u52a0\u6210 + \u589e\u76ca)\uff0c\u5176\u4e2d\u7b49\u7ea7\u52a0\u6210\u4e3a\u6bcf\u4f4e\u4e8e\u623f\u95f4\u7b49\u7ea7\u4e00\u7ea7 -0.01\uff0c\u6216\u6bcf\u9ad8\u4e8e\u4e00\u7ea7 +0.005</li>\n\t\t\t<li>\u602a\u7269\u7b49\u7ea7 = \u623f\u95f4\u7b49\u7ea7</li>\n\t\t\t<li>\u602a\u7269\u62a4\u7532\u6297\u6027 = \u57fa\u7840\u62a4\u7532\u6297\u6027 * (\u623f\u95f4\u7b49\u7ea7 / 100)</li>\n\t\t\t<li>\u53cc\u500d\u8fdb\u5ea6\u6982\u7387 = \u8865\u7ed9\u7bb1\u589e\u76ca + \u91c7\u96c6\u52a0\u6210\uff08\u6324\u5976\u3001\u4f10\u6728\u3001\u91c7\u6458\uff09 + \u7f8e\u98df\u52a0\u6210\uff08\u70f9\u996a\u3001\u917f\u9020\uff09</li>\n\t\t\t<li>\u7ecf\u9a8c = \u623f\u95f4\u7b49\u7ea7 * 50</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<text>\u6311\u6218\u623f\u95f4\u5956\u52b1\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u4ee3\u5e01\uff1aMIN(\u697c\u5c42 * 5%, 50%)\u6982\u7387\u6389\u843d1\u4e2a\u4ee3\u5e01\u3002</li>\n\t\t\t<li>\u7d2b\u591a\u62c9\u4e4b\u76d2\uff1aMIN(\u697c\u5c42 * 1%, 10%)\u6982\u7387\u6389\u843d1\u4e2a\u76d2\u5b50\u3002\u751f\u6d3b\u623f\u95f4\u6389\u843d\u751f\u6d3b\u76d2\u5b50\uff1b\u6218\u6597\u623f\u95f4\u6389\u843d\u6218\u6597\u76d2\u5b50\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<text>\u5b9d\u7bb1\u623f\u95f4\u5956\u52b1\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u4ee3\u5e01\uff1a100%\u6982\u7387\u3002\u6570\u91cf = MIN(\u697c\u5c42, 10)\u3002</li>\n\t\t\t<li>\u7d2b\u591a\u62c9\u4e4b\u76d2\uff1aMIN(\u697c\u5c42 * 5%, 50%)\u6982\u7387\u6389\u843d\u6bcf\u79cd\u54041\u4e2a\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />\n\t\t\t<text>\u697c\u5c42\u51fa\u53e3\u5956\u52b1\uff1a</text>\n\t\t\t<ul>\n\t\t\t<li>\u4ee3\u5e01\uff1a100%\u6982\u7387\u3002\u6570\u91cf = 5 * \u697c\u5c42\u3002</li>\n\t\t\t<li>\u7d2b\u591a\u62c9\u4e4b\u76d2\uff1a100%\u6982\u7387\uff0c\u4e24\u79cd\u7c7b\u578b\uff08\u7b2c4\u5c42\u4ee5\u4e0a\uff09\u3002\u6bcf\u79cd\u5e73\u5747\u6570\u91cf = (\u697c\u5c42 - 3) / 2\u3002</li>\n\t\t\t<li>\u7cbe\u70bc\u5b9d\u7bb1\uff1a100%\u6982\u7387\uff08\u7b2c6\u5c42\u4ee5\u4e0a\uff09\u3002\u5e73\u5747\u6570\u91cf = (\u697c\u5c42 - 4) / 2\u3002</li>\n\t\t\t</ul>\n\t\t\t<br />',tasks:"\u4efb\u52a1",tasksContent:'<heading>\u4efb\u52a1\u529f\u80fd</heading>\n\t\t\t<text>\u5b8c\u6210\u6559\u7a0b\u540e\uff0c\u4f60\u5c06\u89e3\u9501\u6b64\u529f\u80fd\u3002\u4efb\u52a1\u680f\u4f1a\u968f\u673a\u751f\u6210\u4e0d\u540c\u4e13\u4e1a\u957f\u77ed\u4e0d\u4e00\u7684\u4efb\u52a1\uff0c\u5b8c\u6210\u8fd9\u4e9b\u4efb\u52a1\u5c31\u4f1a\u83b7\u5f97\u5956\u52b1\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u4efb\u52a1\u680f</heading>\n\t\t\t<text>\n\t\t\t<ul>\n\t\t\t\t<li>\u9891\u7387: \u4efb\u52a1\u4f1a\u5b9a\u671f\u5206\u914d\uff0c\u4ece\u6bcf8\u5c0f\u65f6\u4e00\u6b21\u5f00\u59cb\u3002\u5347\u7ea7\u53ef\u4ee5\u5c06\u95f4\u9694\u65f6\u95f4\u7f29\u77ed\u81f3\u6700\u4f4e4\u5c0f\u65f6\u3002</li>\n\t\t\t\t<li>\u79cd\u7c7b: \u4efb\u52a1\u53ef\u80fd\u6d89\u53ca\u91c7\u96c6/\u751f\u4ea7\u4e13\u4e1a\u6216\u51fb\u8d25\u602a\u7269\u3002\u751f\u6210\u7684\u4efb\u52a1\u4f1a\u7a0d\u5fae\u4f18\u5148\u8003\u8651\u73a9\u5bb6\u7b49\u7ea7\u8f83\u9ad8\u7684\u4e13\u4e1a\u3002</li>\n\t\t\t\t<li>\u91cd\u7f6e: \u4f60\u53ef\u4ee5\u4f7f\u7528\u91d1\u5e01\u6216\u725b\u94c3\u91cd\u65b0\u9009\u62e9\u4efb\u52a1\u3002\u6bcf\u6b21\u91cd\u65b0\u9009\u62e9\u7684\u8d39\u7528\u4f1a\u7ffb\u500d(\u6709\u4e0a\u9650)\u3002</li>\n\t\t\t\t<li>\u5bb9\u91cf: \u4efb\u52a1\u6ca1\u6709\u671f\u9650\uff0c\u4f46\u6709\u4efb\u52a1\u69fd\u4f4d\u53ea\u67098\u4e2a\u3002\u4f60\u53ef\u4ee5\u5728\u725b\u94c3\u5546\u5e97\u4e2d\u5347\u7ea7\uff0c\u589e\u52a0\u4efb\u52a1\u69fd\u4f4d\u3002</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<br />\n\t\t\t<heading>\u5956\u52b1</heading>\n\t\t\t<text>\n\t\t\t<ul>\n\t\t\t\t<li>\u5b8c\u6210\u4efb\u52a1\u53ef\u83b7\u5f97\u91d1\u5e01\u548c\u4efb\u52a1\u4ee3\u5e01\u3002\u6bcf\u83b7\u5f97\u4e00\u4e2a\u4efb\u52a1\u4ee3\u5e01\u8fd8\u4f1a\u79ef\u7d2f\u4e00\u4e2a\u4efb\u52a1\u70b9\u6570\u3002</li>\n\t\t\t\t<li>\u7d2f\u79ef50\u4e2a\u4efb\u52a1\u70b9\u6570\u5c31\u53ef\u4ee5\u9886\u53d6"\u5c0f\u7d2b\u725b\u7684\u793c\u7269"\uff0c\u6253\u5f00\u540e\u53ef\u4ee5\u83b7\u5f97\u91d1\u5e01\u3001\u4efb\u52a1\u4ee3\u5e01\u3001\u4efb\u52a1\u6c34\u6676\u548c\u5404\u79cd\u6218\u5229\u54c1\u3002</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<br />\n\t\t\t<heading>\u4efb\u52a1\u5546\u5e97</heading>\n\t\t\t<text>\u4efb\u52a1\u4ee3\u5e01\u53ef\u5728\u4efb\u52a1\u5546\u5e97\u4e2d\u7528\u4e8e\u8d2d\u4e70\u6c38\u4e45\u5347\u7ea7\u6216\u7269\u54c1\uff0c\u5305\u62ec:\n\t\t\t<ul>\n\t\t\t\t<li>\u4efb\u52a1\u51b7\u5374:\u51cf\u5c11\u4efb\u52a1\u4e4b\u95f4\u7684\u51b7\u5374\u65f6\u95f4\u3002</li>\n\t\t\t\t<li>\u5c4f\u853d\u69fd\u4f4d:\u5141\u8bb8\u5c4f\u853d\u88ab\u5206\u914d\u7279\u5b9a\u4e13\u4e1a\u7684\u4efb\u52a1\u3002\u6218\u6597\u5c4f\u853d\u9700\u8981\u989d\u5916\u4ed8\u8d39\u89e3\u9501\u3002</li>\n\t\t\t\t<li>\u4efb\u52a1\u6c34\u6676:\u7528\u4e8e\u5236\u4f5c\u6216\u5347\u7ea7\u4efb\u52a1\u5fbd\u7ae0\u3002\u4efb\u52a1\u5fbd\u7ae0\u53ef\u5728\u6267\u884c\u4efb\u52a1\u65f6\u63d0\u4f9b\u5927\u91cf\u901f\u5ea6\u6216\u4f24\u5bb3\u52a0\u6210\u3002</li>\n\t\t\t\t<li>\u6218\u5229\u54c1\u7bb1:\u5927\u9668\u77f3\u8231\u3001\u5927\u5de5\u5320\u5323\u548c\u5927\u5b9d\u7bb1\u3002</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<br />',achievements:"\u6210\u5c31",achievementsContent:"<heading>\u6210\u5c31</heading>\n\t\t\t<text>\u6210\u5c31\u662f\u6db5\u76d6\u6e38\u620f\u591a\u4e2a\u9886\u57df\u7684\u76ee\u6807\u3002\u5b83\u4eec\u6309\u7b49\u7ea7\u5212\u5206\uff1a\u521d\u5b66\u8005\u3001\u65b0\u624b\u3001\u4e13\u5bb6\u3001\u8001\u624b\u3001\u7cbe\u82f1\u548c\u51a0\u519b\u3002\u5b8c\u6210\u4e00\u4e2a\u7b49\u7ea7\u7684\u6240\u6709\u6210\u5c31\u53ef\u4e3a\u89d2\u8272\u63d0\u4f9b\u589e\u76ca\u3002</text>\n\t\t\t<text>\u7b49\u7ea7\u589e\u76ca\uff1a\n\t\t\t<ul>\n\t\t\t\t<li>\u521d\u5b66\u8005\uff1a+2% \u91c7\u96c6</li>\n\t\t\t\t<li>\u65b0\u624b\uff1a+2% \u667a\u6167</li>\n\t\t\t\t<li>\u4e13\u5bb6\uff1a+2% \u6548\u7387</li>\n\t\t\t\t<li>\u8001\u624b\uff1a+2% \u7a00\u6709\u53d1\u73b0</li>\n\t\t\t\t<li>\u7cbe\u82f1\uff1a+2% \u6218\u6597\u4f24\u5bb3</li>\n\t\t\t\t<li>\u51a0\u519b\uff1a+0.2% \u5f3a\u5316\u6210\u529f\u7387</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<text>\u6ce8\u610f\uff1a\u5982\u679c\u968f\u91cd\u5927\u65b0\u6e38\u620f\u5185\u5bb9\u6dfb\u52a0\u4e86\u65b0\u6210\u5c31\uff0c\u9700\u8981\u91cd\u65b0\u5b8c\u6210\u624d\u80fd\u4fdd\u6301\u589e\u76ca\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u6536\u85cf</heading>\n\t\t\t<text>\u6536\u85cf\u8ffd\u8e2a\u4f60\u5728\u5e02\u573a\u548c\u6742\u8d27\u5546\u5e97\u4ee5\u5916\u83b7\u5f97\u7684\u6240\u6709\u72ec\u7279\u7269\u54c1\u3002\u5b83\u8fd8\u8ffd\u8e2a\u6bcf\u79cd\u7269\u54c1\u7684\u6210\u529f\u5f3a\u5316\u6b21\u6570\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u56fe\u9274</heading>\n\t\t\t<text>\u56fe\u9274\u8ffd\u8e2a\u4f60\u51fb\u8d25\u7684\u6240\u6709\u602a\u7269\u3002\u5b83\u8fd8\u8ffd\u8e2a\u6bcf\u79cd\u602a\u7269\u4e0d\u540c\u96be\u5ea6\u7b49\u7ea7\u7684\u51fb\u8d25\u6b21\u6570\uff08T0\u3001T1\u3001T2\u7b49\uff09\u3002</text>\n\t\t\t<text>\u6bcf\u7ea7\u96be\u5ea6\u989d\u5916+1\u51fb\u8d25\u6b21\u6570\u3002</text>\n\t\t\t<text>\u5728\u961f\u4f0d\u4e2d\u6218\u6597\u65f6\uff0c\u4f60\u6839\u636e\u961f\u4f0d\u89c4\u6a21\u83b7\u5f97\u90e8\u5206\u79ef\u5206\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u79ef\u5206</heading>\n\t\t\t<text>\u6536\u85cf\u548c\u56fe\u9274\u90fd\u6839\u636e\u6bcf\u79cd\u7269\u54c1/\u602a\u7269\u7684\u6536\u96c6/\u51fb\u8d25\u6570\u91cf\u83b7\u5f97\u79ef\u5206\uff1a</text>\n\t\t\t<text>\n\t\t\t<ul>\n\t\t\t\t<li>1 \u2192 +1\u5206</li>\n\t\t\t\t<li>10 \u2192 +2\u5206</li>\n\t\t\t\t<li>100 \u2192 +3\u5206</li>\n\t\t\t\t<li>1,000 \u2192 +4\u5206</li>\n\t\t\t\t<li>\u4f9d\u6b64\u7c7b\u63a8...</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<text>\u8fbe\u5230\u79ef\u5206\u91cc\u7a0b\u7891\u53ef\u89e3\u9501\u5956\u52b1\u3002</text>\n\t\t\t<br />",guild:"\u516c\u4f1a",guildContent:"<heading>\u516c\u4f1a</heading>\n\t\t\t<text>\u901a\u8fc7\u5bfc\u822a\u83dc\u5355\u4e2d\u7684[\u516c\u4f1a]\u529f\u80fd\u53d1\u73b0\u516c\u4f1a\u3002\u516c\u4f1a\u7531\u559c\u6b22\u4e00\u8d77\u6e38\u620f\u7684\u73a9\u5bb6\u7ec4\u6210\u3002\u867d\u7136\u516c\u4f1a\u76ee\u524d\u4e3b\u8981\u4f5c\u4e3a\u793e\u4ea4\u4e2d\u5fc3\uff0c\u4f46\u672a\u6765\u63a8\u51fa\u7684\u6269\u5c55\u53ef\u80fd\u4f1a\u5f15\u5165\u66f4\u591a\u4ee5\u56e2\u961f\u4e3a\u5bfc\u5411\u7684\u6d3b\u52a8\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u521b\u5efa\u516c\u4f1a</heading>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u6295\u5165500\u4e07\u91d1\u5e01\u5e76\u9009\u62e9\u4e00\u4e2a\u72ec\u7279\u7684\u516c\u4f1a\u540d\u79f0\uff0c\u5c31\u53ef\u4ee5\u521b\u5efa\u81ea\u5df1\u7684\u516c\u4f1a\u3002\u4f5c\u4e3a\u516c\u4f1a\u7684\u521b\u5efa\u8005\uff0c\u4f60\u5c06\u81ea\u52a8\u6210\u4e3a\u516c\u4f1a\u4f1a\u957f\uff0c\u5728\u516c\u4f1a\u4e2d\u62e5\u6709\u6700\u9ad8\u6743\u529b\u3002\u4e4b\u540e\uff0c\u4f60\u53ef\u4ee5\u9080\u8bf7\u5176\u4ed6\u73a9\u5bb6\u52a0\u5165\u4f60\u7684\u516c\u4f1a\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u52a0\u5165\u516c\u4f1a</heading>\n\t\t\t<text>\u4f60\u53ef\u4ee5\u88ab\u9080\u8bf7\u52a0\u5165\u73b0\u6709\u7684\u516c\u4f1a\u3002\u4f60\u53ef\u4ee5\u5728\u62db\u52df\u804a\u5929\u9891\u9053\u5bfb\u627e\u6b63\u5728\u62db\u4eba\u7684\u516c\u4f1a\uff0c\u516c\u4f1a\u4f1a\u5728\u8be5\u9891\u9053\u79ef\u6781\u5bfb\u627e\u65b0\u6210\u5458\u3002\u4f60\u53ef\u4ee5\u5728\u516c\u4f1a\u9875\u9762\u4e0a\u67e5\u770b\u4f60\u6536\u5230\u7684\u9080\u8bf7\u3002</text>\n\t\t\t<br />\n\t\t\t<heading>\u516c\u4f1a\u529f\u80fd</heading>\n\t\t\t<text>\u516c\u4f1a\u6709\u51e0\u4e2a\u4e3b\u8981\u529f\u80fd:\n\t\t\t<ul>\n\t\t\t\t<li>\u516c\u4f1a\u804a\u5929\u9891\u9053: \u4e00\u4e2a\u79c1\u4eba\u7684\u3001\u81ea\u6211\u7ba1\u7406\u7684\u7a7a\u95f4\uff0c\u4f9b\u516c\u4f1a\u6210\u5458\u8054\u7cfb\u548c\u4ea4\u8c08\u3002</li>\n\t\t\t\t<li>\u516c\u4f1a\u516c\u544a\u680f: \u4e00\u4e2a\u53ef\u7531\u4f1a\u957f\u6216\u5c06\u519b\u7f16\u8f91\u7684\u516c\u544a\u677f\uff0c\u7528\u4e8e\u901a\u77e5\u6240\u6709\u6210\u5458\u3002</li>\n\t\t\t\t<li>\u516c\u4f1a\u7b49\u7ea7: \u968f\u7740\u6210\u5458\u5728\u5404\u79cd\u4e13\u4e1a\u83b7\u5f97\u7ecf\u9a8c\uff0c\u516c\u4f1a\u4f1a\u4ee51:1000\u7684\u6bd4\u4f8b\u79ef\u7d2f\u516c\u4f1a\u7ecf\u9a8c\uff0c\u4ece\u800c\u63d0\u5347\u516c\u4f1a\u7b49\u7ea7\u3002\u6839\u636e\u516c\u4f1a\u7b49\u7ea7\u548c\u7ecf\u9a8c\u6500\u5347\u6392\u884c\u699c\u3002</li>\n\t\t\t\t<li>\u6210\u5458\u540d\u989d: \u516c\u4f1a\u521d\u59cb\u65f6\u6709 {{defaultGuildMemberCount}} \u4e2a\u4f1a\u5458\u540d\u989d\uff0c\u6bcf\u63d0\u5347 {{guildLevelsPerMaxMember}} \u4e2a\u516c\u4f1a\u7b49\u7ea7\u53ef\u589e\u52a0 1 \u4e2a\u540d\u989d\u3002</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<br />\n\t\t\t<heading>\u6210\u5458\u89d2\u8272</heading>\n\t\t\t<text>\u516c\u4f1a\u5177\u6709\u4e0d\u540c\u7684\u89d2\u8272\u548c\u6743\u9650\u3002\u8f83\u9ad8\u7b49\u7ea7\u7684\u89d2\u8272\u81ea\u52a8\u5177\u6709\u4efb\u4f55\u8f83\u4f4e\u7ea7\u89d2\u8272\u7684\u6743\u9650:\n\t\t\t<ul>\n\t\t\t\t<li>\u4f1a\u957f\n\t\t\t\t\t<ul>\n\t\t\t\t\t\t<li>\u53ef\u5c06\u9886\u5bfc\u6743\u4f20\u7ed9\u53e6\u4e00\u4f4d\u6210\u5458\u3002</li>\n\t\t\t\t\t\t<li>\u5f53\u516c\u4f1a\u7a7a\u65e0\u4e00\u4eba\u65f6\uff0c\u6709\u6743\u89e3\u6563\u516c\u4f1a\u3002</li>\n\t\t\t\t\t</ul>\n\t\t\t\t</li>\n\t\t\t\t<li>\u5c06\u519b\n\t\t\t\t\t<ul>\n\t\t\t\t\t\t<li>\u6709\u6743\u63d0\u5347\u6216\u964d\u7ea7\u4efb\u4f55\u4f4e\u7ea7\u6210\u5458\u3002</li>\n\t\t\t\t\t\t<li>\u53ef\u7f16\u8f91\u516c\u4f1a\u516c\u544a\u680f\u3002</li>\n\t\t\t\t\t</ul>\n\t\t\t\t</li>\n\t\t\t\t<li>\u5b98\u5458\n\t\t\t\t\t<ul>\n\t\t\t\t\t\t<li>\u53ef\u9080\u8bf7\u65b0\u6210\u5458\u52a0\u5165\u516c\u4f1a\u3002</li>\n\t\t\t\t\t\t<li>\u53ef\u5c06\u4f4e\u7ea7\u522b\u6210\u5458\u8e22\u51fa\u516c\u4f1a\u3002</li>\n\t\t\t\t\t</ul>\n\t\t\t\t</li>\n\t\t\t\t<li>\u4f1a\u5458\n\t\t\t\t\t<ul>\n\t\t\t\t\t\t<li>\u53ef\u4ee5\u67e5\u770b\u516c\u4f1a\u6982\u51b5\u3002</li>\n\t\t\t\t\t\t<li>\u53ef\u4ee5\u67e5\u770b\u516c\u4f1a\u804a\u5929\u9891\u9053\u5e76\u8fdb\u884c\u4ea4\u8c08\u3002</li>\n\t\t\t\t\t</ul>\n\t\t\t\t</li>\n\t\t\t\t<li>\u5df2\u9080\u8bf7\n\t\t\t\t\t<ul>\n\t\t\t\t\t\t<li>\u5728\u63a5\u53d7\u516c\u4f1a\u9080\u8bf7\u4e4b\u524d\u6ca1\u6709\u8bbf\u95ee\u6743\u9650</li>\n\t\t\t\t\t</ul>\n\t\t\t\t</li>\n\t\t\t</ul>\n\t\t\t</text>\n\t\t\t<br />",chatCommands:"\u804a\u5929\u547d\u4ee4",chatCommandsContent:"<heading>\u804a\u5929\u547d\u4ee4</heading>\n\t\t\t<text>\n\t\t\t\t<chatCommand>/w [\u540d\u79f0] [\u4fe1\u606f]</chatCommand> - \u4e0e\u5176\u4ed6\u73a9\u5bb6\u79c1\u804a<br />\n\t\t\t\t<chatCommand>/r</chatCommand> - \u56de\u590d\u6700\u540e\u4e00\u6761\u79c1\u804a<br />\n\t\t\t\t<chatCommand>/profile [\u540d\u79f0]</chatCommand> - \u67e5\u770b\u73a9\u5bb6\u8d44\u6599<br />\n\t\t\t\t<chatCommand>/friend [\u540d\u79f0]</chatCommand> - \u6dfb\u52a0\u597d\u53cb<br />\n\t\t\t\t<chatCommand>/block [\u540d\u79f0]</chatCommand> - \u5c4f\u853d\u73a9\u5bb6<br />\n\t\t\t</text>\n\t\t\t<br />",experienceTable:"\u7ecf\u9a8c\u8868"},gameRulesPanel:{gameRules:"\u6e38\u620f\u89c4\u5219"},gameRulesText:{content:"<div>\n\t\t\t\t\u94f6\u6cb3\u5976\u725b\u653e\u7f6e\u7684\u89c4\u5219\u65e8\u5728\u786e\u4fdd\u6240\u6709\u73a9\u5bb6\u90fd\u80fd\u83b7\u5f97\u6109\u5feb\u3001\u516c\u5e73\u7684\u6e38\u620f\u4f53\u9a8c\u3002\n\t\t\t\t\u8fdd\u53cd\u89c4\u5219\u5c06\u6839\u636e\u8fdd\u89c4\u884c\u4e3a\u7684\u7c7b\u578b\u548c\u4e25\u91cd\u7a0b\u5ea6\u53d7\u5230\u76f8\u5e94\u7684\u5904\u7f5a\uff0c\u5305\u62ec\u8b66\u544a\u3001\u7981\u8a00\u3001\u7269\u54c1\u79fb\u9664\u3001\u4ea4\u6613\u7981\u6b62\u6216\u8d26\u6237\u5c01\u7981\u3002\n\t\t\t\t<br /><br />\n\t\t\t</div>\n\t\t\t<olMain>\n\t\t\t\t<li><b>\u5e10\u53f7</b>\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u4ec5\u9650\u4e00\u4e2a\u8d26\u6237: </b>\n\t\t\t\t\t\t\t\u6bcf\u4e2a\u4eba\u53ea\u80fd\u4f7f\u7528\u4e00\u4e2a\u8d26\u6237\u8fdb\u884c\u6e38\u620f\u3002\u6e38\u5ba2\u4e5f\u88ab\u89c6\u4e3a\u8d26\u6237\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u4e0d\u5f97\u5171\u4eab\u8d26\u6237: </b>\n\t\t\t\t\t\t\t\u4e0d\u5f97\u4e0e\u5176\u4ed6\u73a9\u5bb6\u5171\u4eab\u8d26\u6237\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u4e0d\u5f97\u4f7f\u7528\u4e0d\u6070\u5f53\u7684\u540d\u79f0: </b>\n\t\t\t\t\t\t\t\u540d\u79f0\u4e0d\u5f97\u5177\u6709\u5192\u72af\u6027\u3001\u8272\u60c5\u3001\u5192\u5145\u4ed6\u4eba\u6216\u4f7f\u7528\u77e5\u540d\u73b0\u5b9e\u4eba\u7269\u7684\u540d\u5b57\u3002\u4e0d\u9002\u5f53\u7684\u540d\u79f0\u53ef\u5bfc\u81f4\u7981\u8a00\u548c\u5f3a\u5236\u66f4\u540d\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u4ec5\u965013\u5c81\u4ee5\u4e0a\u73a9\u5bb6: </b>\n\t\t\t\t\t\t\t\u6839\u636e\u7f8e\u56fdCOPPA\u300a\u513f\u7ae5\u5728\u7ebf\u9690\u79c1\u4fdd\u62a4\u6cd5\u6848\u300b\u89c4\u5b9a\uff0c\u4f60\u5fc5\u987b\u5e74\u6ee1 13 \u5468\u5c81\u624d\u80fd\u6ce8\u518c\u548c\u6e38\u620f\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</li>\n\t\t\t\t<li><b>\u4ea4\u6613</b>\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u771f\u5b9e\u4e16\u754c\u4ea4\u6613/\u4ea4\u53c9\u4ea4\u6613: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u5728\u94f6\u6cb3\u5976\u725b\u653e\u7f6e\u4e2d\u4ea4\u6613\u7269\u54c1\u6216\u670d\u52a1\u4ee5\u6362\u53d6\u6e38\u620f\u5916\u7684\u4efb\u4f55\u4e1c\u897f\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u8d22\u5bcc\u8f6c\u79fb: </b>\n\t\t\t\t\t\t\t\u4e0d\u5f97\u5411\u4efb\u4f55\u73a9\u5bb6\u8f93\u9001\u8d22\u4ea7\u3002\u73a9\u5bb6\u63a5\u53d7\u7684\u6240\u6709\u793c\u7269\u603b\u4ef7\u503c\u4e0d\u5f97\u8d85\u8fc7 10M \u91d1\u5e01\u3002\u8d85\u8fc7\u8be5\u9650\u5236\u7684\u8d22\u5bcc\u8f6c\u79fb\u884c\u4e3a\uff0c\u65e0\u8bba\u662f\u5426\u6545\u610f\uff0c\u5747\u4f1a\u88ab\u89c6\u4e3a\u8fdd\u89c4\u884c\u4e3a\u3002\u975e\u6545\u610f\u7684\u8f6c\u79fb (\u4f8b\u5982\uff1a\u5728\u5e02\u573a\u4e0a\u5076\u7136\u8d2d\u4e70\u5230\u8d85\u4f4e\u4ef7\u7684\u7269\u54c1) \u4f1a\u88ab\u79fb\u9664\u76f8\u5173\u6536\u76ca\u3002\u6545\u610f\u7684\u8f6c\u79fb\u5c06\u6839\u636e\u4e25\u91cd\u7a0b\u5ea6\u53d7\u5230\u989d\u5916\u5904\u7f5a\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u6b3a\u8bc8: </b>\n\t\t\t\t\t\t\t\u4e0d\u5f97\u4f7f\u7528\u6b3a\u9a97\u6216\u6572\u8bc8\u624b\u6bb5\u4ece\u5176\u4ed6\u73a9\u5bb6\u5904\u83b7\u5f97\u7269\u54c1\u3002\u5982\u6709\u8db3\u591f\u8bc1\u636e\uff0c\u6211\u4eec\u5c06\u5bf9\u6b3a\u8bc8\u8005\u91c7\u53d6\u884c\u52a8\u3002\u4f46\u56e0\u6b3a\u8bc8\u800c\u4e22\u5931\u7684\u7269\u54c1\u5c06\u4e0d\u4e88\u9000\u8fd8\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u57287\u5929\u5185\u507f\u8fd8\u8d37\u6b3e: </b>\n\t\t\t\t\t\t\t\u8d37\u6b3e\u98ce\u9669\u81ea\u8d1f\u30027\u5929\u5185\u672a\u507f\u8fd8\u7684\u8d37\u6b3e\u5c06\u88ab\u89c6\u4e3a\u8d22\u5bcc\u8f6c\u79fb/\u6b3a\u8bc8\u884c\u4e3a\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</li>\n\t\t\t\t<li><b>\u804a\u5929</b>\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u8bf7\u76f8\u4e92\u5c0a\u91cd\uff0c\u53cb\u5584\u4ea4\u6d41: </b>\n\t\t\t\t\t\t\t\u804a\u5929\u89c4\u5219\u7684\u7b2c\u4e00\u6761\u5c31\u662f\u5c0a\u91cd\u5176\u4ed6\u73a9\u5bb6\u3002\u6211\u4eec\u7684\u76ee\u6807\u662f\u521b\u5efa\u4e00\u4e2a\u4eba\u4eba\u90fd\u80fd\u4eab\u53d7\u7684\u53cb\u597d\u793e\u533a\u7a7a\u95f4\u3002\n\t\t\t\t\t\t\t\u8bf7\u907f\u514d\u6545\u610f\u4e0e\u4ed6\u4eba\u5bf9\u7acb\u6216\u9a9a\u6270\u4ed6\u4eba\u3002\n\t\t\t\t\t\t\t\u867d\u7136\u5076\u5c14\u4f7f\u7528\u810f\u8bdd\u5e76\u4e0d\u8fdd\u53cd\u89c4\u5b9a\uff0c\u4f46\u8bf7\u4e0d\u8981\u8fc7\u5ea6\u4f7f\u7528\u810f\u8bdd\uff0c\u5c24\u5176\u662f\u9488\u5bf9\u5176\u4ed6\u73a9\u5bb6\u65f6\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u82f1\u8bed\u804a\u5929\u9891\u9053\u4ec5\u9650\u82f1\u8bed: </b>\n\t\t\t\t\t\t\t\u8bf7\u5728\u82f1\u8bed\u804a\u5929\u9891\u9053\u4f7f\u7528\u82f1\u8bed\u3002\u5176\u4ed6\u9891\u9053\u53ef\u4f7f\u7528\u4e0d\u540c\u8bed\u8a00\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u6b67\u89c6: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u4f7f\u7528\u9488\u5bf9\u4efb\u4f55\u4e2a\u4eba\u6216\u7fa4\u4f53\u7684\u6c61\u8a00\u79fd\u8bed\u3001\u4fda\u8bed\u6216\u4efb\u4f55\u653b\u51fb\u6027\u8bdd\u8bed\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u975e\u6cd5\u6216\u8272\u60c5\u8bdd\u9898: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u8ba8\u8bba\u975e\u6cd5\u6216\u8272\u60c5\u8bdd\u9898\u3002\u7981\u6b62\u53d1\u9001\u975e\u6cd5\u6d3b\u52a8\u6216\u8272\u60c5\u8bdd\u9898\u7684\u5916\u90e8\u94fe\u63a5\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u907f\u514d\u654f\u611f\u8bdd\u9898\u6216\u95f9\u5267: </b>\n\t\t\t\t\t\t\t\u8bf7\u907f\u514d\u8ba8\u8bba\u5bb9\u6613\u5f15\u53d1\u4e89\u8bae\u6216\u95f9\u5267\u7684\u654f\u611f\u8bdd\u9898\u3002\n\t\t\t\t\t\t\t\u8fd9\u5305\u62ec\u4f46\u4e0d\u9650\u4e8e\u653f\u6cbb\u3001\u5b97\u6559\u3001\u56fd\u9645\u51b2\u7a81\u3001\u6027\u522b\u8ba8\u8bba\u3001\u6027\u53d6\u5411\u3001\n\t\t\t\t\t\t\t\u7981\u8a00/\u5c01\u7981\u6295\u8bc9\uff0c\u4ee5\u53ca\u5176\u4ed6\u5bb9\u6613\u5f15\u53d1\u7eb7\u4e89\u7684\u8bdd\u9898\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u6076\u610f\u5237\u5c4f: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u5728\u804a\u5929\u4e2d\u53d1\u9001\u5927\u91cf\u4e0d\u5fc5\u8981\u7684\u5783\u573e\u4fe1\u606f\u3001\u8fc7\u5ea6\u4f7f\u7528\u5927\u5199\u5b57\u6bcd\u3001\u6216\u5411\u4ed6\u4eba\u4e5e\u8ba8\u514d\u8d39\u7269\u54c1\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u8bf7\u52ff\u9f13\u52b1\u4ed6\u4eba\u8fdd\u53cd\u89c4\u5219: </b>\n\t\t\t\t\t\t\t\u4e0d\u8981\u8bef\u5bfc\u6216\u6002\u607f\u5176\u4ed6\u73a9\u5bb6\u8fdd\u53cd\u6e38\u620f\u89c4\u5219\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u4e0d\u8981\u6cc4\u9732\u4e2a\u4eba\u4fe1\u606f: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u62ab\u9732\u53ef\u8bc6\u522b\u7684\u4e2a\u4eba\u4fe1\u606f\uff0c\u5305\u62ec\u4f46\u4e0d\u9650\u4e8e\u4f60\u7684\u5168\u540d\u3001\u5730\u5740\u3001\u7535\u8bdd\u53f7\u7801\u548c\u7535\u5b50\u90ae\u4ef6\u3002\n\t\t\t\t\t\t\t\u6b64\u5916\uff0c\u8bf7\u52ff\u62ab\u9732\u5176\u4ed6\u73a9\u5bb6\u672a\u516c\u5f00\u7684\u4efb\u4f55\u4e2a\u4eba\u4fe1\u606f\uff0c\u5982\u59d3\u540d\u3001\u5e74\u9f84\u6216\u6240\u5728\u5730\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u6240\u6709\u5e7f\u544a\u5fc5\u987b\u5728\u9002\u5f53\u7684\u6e20\u9053\u53d1\u5e03: </b>\n\t\t\t\t\t\t\t\u6240\u6709\u8d2d\u4e70\u3001\u51fa\u552e\u6216\u670d\u52a1\u8bf7\u6c42\u5e94\u5728\u4ea4\u6613\u9891\u9053\u4e2d\u8fdb\u884c\u3002\u516c\u4f1a/\u961f\u4f0d\u62db\u52df\u6216\u5bfb\u6c42\u52a0\u5165\u516c\u4f1a/\u961f\u4f0d\u7684\u8bf7\u6c42\u5e94\u5728\u62db\u52df\u9891\u9053\u63d0\u51fa\u3002\n\t\t\t\t\t\t\t\u5141\u8bb8\u5728\u5927\u591a\u804a\u5929\u9891\u9053\u4e2d\u8be2\u95ee\u4ef7\u683c\u3002\u7981\u6b62\u9080\u8bf7/\u63a8\u8350\u94fe\u63a5\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u542c\u4ece<modIcon />\u7ba1\u7406\u5458\u5b89\u6392: </b>\n\t\t\t\t\t\t\t\u4e3a\u4e86\u4fdd\u6301\u826f\u597d\u7684\u804a\u5929\u73af\u5883\uff0c\u7ba1\u7406\u5458\u4f1a\u5bf9\u5404\u804a\u5929\u9891\u9053\u8fdb\u884c\u7ba1\u7406\u3002\n\t\t\t\t\t\t\t\u8bf7\u914d\u5408\u5e76\u5c0a\u91cd\u4ed6\u4eec\u7684\u8981\u6c42\u3002\u5982\u679c\u5bf9\u7ba1\u7406\u5458\u6709\u4efb\u4f55\u4e89\u6267\u6216\u6295\u8bc9\uff0c\u8bf7\u901a\u8fc7Discord\u7533\u8bc9\u6216\u53d1\u9001\u7535\u5b50\u90ae\u4ef6\u81f3contact@milkywayidle.com\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</li>\n\t\t\t\t<li><b>\u673a\u5668\u4eba\u3001\u811a\u672c\u548c\u6269\u5c55</b>\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u7981\u6b62\u673a\u5668\u4eba: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u4f7f\u7528\u4efb\u4f55\u81ea\u52a8\u5316\u7a0b\u5e8f\u4ee3\u66ff\u4f60\u64cd\u4f5c\u6e38\u620f\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u811a\u672c\u548c\u6269\u5c55: </b>\n\t\t\t\t\t\t\t\u4efb\u4f55\u811a\u672c\u6216\u6269\u5c55\u7a0b\u5e8f\u90fd\u4e0d\u5f97\u4e3a\u73a9\u5bb6\u6267\u884c\u4efb\u4f55\u64cd\u4f5c(\u5411\u670d\u52a1\u5668\u53d1\u9001\u4efb\u4f55\u8bf7\u6c42)\uff0c\n\t\t\t\t\t\t\t\u4ec5\u9650\u4f7f\u7528\u4e8e\u663e\u793a\u4fe1\u606f\u6216\u6539\u8fdb\u7528\u6237\u754c\u9762 (\u4f8b\u5982: \u663e\u793a\u6218\u6597\u6458\u8981\u3001\u8ddf\u8e2a\u6389\u843d\u3001\u5c06\u6309\u94ae\u79fb\u52a8\u5230\u4e0d\u540c\u4f4d\u7f6e)\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</li>\n\t\t\t\t<li><b>\u9519\u8bef\u548c\u6f0f\u6d1e</b>\n\t\t\t\t\t<ol>\n\t\t\t\t\t\t<li>\n\t\t\t\t\t\t\t<b>\u4e0d\u5f97\u6ee5\u7528\u6f0f\u6d1e: </b>\n\t\t\t\t\t\t\t\u8bf7\u52ff\u6ee5\u7528\u6e38\u620f\u9519\u8bef\u6216\u6f0f\u6d1e\u6765\u4e3a\u81ea\u5df1\u8c0b\u5229\u3002\u8bf7\u901a\u8fc7Discord\u544a\u8bc9\u6211\u4eec\uff0c\u8c22\u8c22\u3002\n\t\t\t\t\t\t</li>\n\t\t\t\t\t</ol>\n\t\t\t\t</li>\n\t\t\t</olMain>\n\t\t\t<br />"},tradingRulesModal:{title:"\u4ea4\u6613\u89c4\u5219\u534f\u8bae",introduction:"\u5728\u4f7f\u7528\u5e02\u573a\u4e4b\u524d\uff0c\u4f60\u5fc5\u987b\u9605\u8bfb\u5e76\u63a5\u53d7\u4ee5\u4e0b\u4ea4\u6613\u89c4\u5219\uff1a",tradingRulesContent:"<div>\n\t\t\t\t<ol>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t<b>\u7981\u6b62\u771f\u5b9e\u4e16\u754c\u4ea4\u6613/\u4ea4\u53c9\u4ea4\u6613: </b>\n\t\t\t\t\t\t\u8bf7\u52ff\u5728\u94f6\u6cb3\u5976\u725b\u653e\u7f6e\u4e2d\u4ea4\u6613\u7269\u54c1\u6216\u670d\u52a1\u4ee5\u6362\u53d6\u6e38\u620f\u5916\u7684\u4efb\u4f55\u4e1c\u897f\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t<b>\u7981\u6b62\u8d22\u5bcc\u8f6c\u79fb: </b>\n\t\t\t\t\t\t\u4e0d\u5f97\u5411\u4efb\u4f55\u73a9\u5bb6\u8f93\u9001\u8d22\u4ea7\u3002\u73a9\u5bb6\u63a5\u53d7\u7684\u6240\u6709\u793c\u7269\u603b\u4ef7\u503c\u4e0d\u5f97\u8d85\u8fc7 10M \u91d1\u5e01\u3002\u8d85\u8fc7\u8be5\u9650\u5236\u7684\u8d22\u5bcc\u8f6c\u79fb\u884c\u4e3a\uff0c\u65e0\u8bba\u662f\u5426\u6545\u610f\uff0c\u5747\u4f1a\u88ab\u89c6\u4e3a\u8fdd\u89c4\u884c\u4e3a\u3002\u975e\u6545\u610f\u7684\u8f6c\u79fb (\u4f8b\u5982\uff1a\u5728\u5e02\u573a\u4e0a\u5076\u7136\u8d2d\u4e70\u5230\u8d85\u4f4e\u4ef7\u7684\u7269\u54c1) \u4f1a\u88ab\u79fb\u9664\u76f8\u5173\u6536\u76ca\u3002\u6545\u610f\u7684\u8f6c\u79fb\u5c06\u6839\u636e\u4e25\u91cd\u7a0b\u5ea6\u53d7\u5230\u989d\u5916\u5904\u7f5a\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t<b>\u7981\u6b62\u6b3a\u8bc8: </b>\n\t\t\t\t\t\t\u4e0d\u5f97\u4f7f\u7528\u6b3a\u9a97\u6216\u6572\u8bc8\u624b\u6bb5\u4ece\u5176\u4ed6\u73a9\u5bb6\u5904\u83b7\u5f97\u7269\u54c1\u3002\u5982\u6709\u8db3\u591f\u8bc1\u636e\uff0c\u6211\u4eec\u5c06\u5bf9\u6b3a\u8bc8\u8005\u91c7\u53d6\u884c\u52a8\u3002\u4f46\u56e0\u6b3a\u8bc8\u800c\u4e22\u5931\u7684\u7269\u54c1\u5c06\u4e0d\u4e88\u9000\u8fd8\u3002\n\t\t\t\t\t</li>\n\t\t\t\t\t<li>\n\t\t\t\t\t\t<b>\u57287\u5929\u5185\u507f\u8fd8\u8d37\u6b3e: </b>\n\t\t\t\t\t\t\u8d37\u6b3e\u98ce\u9669\u81ea\u8d1f\u30027\u5929\u5185\u672a\u507f\u8fd8\u7684\u8d37\u6b3e\u5c06\u88ab\u89c6\u4e3a\u8d22\u5bcc\u8f6c\u79fb/\u6b3a\u8bc8\u884c\u4e3a\u3002\n\t\t\t\t\t</li>\n\t\t\t\t</ol>\n\t\t\t</div>",acceptButton:"\u6211\u63a5\u53d7\u4ea4\u6613\u89c4\u5219"},localStorageWarning:{title:"\u26a0\ufe0f \u672c\u5730\u5b58\u50a8\u7a7a\u95f4\u5373\u5c06\u6ee1",percentageUsed:"\u5df2\u4f7f\u7528{{percentage}}%",usageInfo:"{{used}} / {{total}}",warningMessage:"\u4f60\u7684\u672c\u5730\u5b58\u50a8\u5df2\u4f7f\u7528{{percentage}}%\u3002\u8fd9\u53ef\u80fd\u662f\u7531\u67d0\u4e2a\u6e38\u620f\u63d2\u4ef6\u5b58\u50a8\u8fc7\u591a\u6570\u636e\u9020\u6210\u7684\u3002",whatYouCanDo:"\u4f60\u53ef\u4ee5\u91c7\u53d6\u4ee5\u4e0b\u63aa\u65bd\uff1a",tip1:"\u6682\u65f6\u7981\u7528\u53ef\u80fd\u5b58\u50a8\u8fc7\u591a\u6570\u636e\u7684\u6e38\u620f\u63d2\u4ef6",tip2:"\u6e05\u9664\u4e0b\u65b9\u5217\u51fa\u7684\u5927\u578b\u63d2\u4ef6\u6570\u636e",tip3:"\u8981\u6c42\u63d2\u4ef6\u4f5c\u8005\u66f4\u65b0\u5e76\u5b58\u50a8\u66f4\u5c11\u7684\u6570\u636e",largeItemsTitle:"\u975e\u6e38\u620f\u672c\u4f53\u6570\u636e\uff08\u5927\u4e8e50KB\uff09\uff1a",deleteButton:"\u5220\u9664",deleteConfirm:"\u4f60\u786e\u5b9a\u8981\u5220\u9664'{{key}}'\u5417\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u6d88\u3002",deleteSuccess:"\u6210\u529f\u5220\u9664'{{key}}'",deleteError:"\u5220\u9664'{{key}}'\u5931\u8d25\uff1a{{error}}",closeButton:"\u6211\u660e\u767d\u4e86"},aprilFools:{foolStoneItemName:"\u611a\u8005\u4e4b\u77f3",foolStoneDescription:"\u611a\u4eba\u8282\u5feb\u4e50\uff01"}},...{gameModeNames:{standard:"\u6807\u51c6",ironcow:"\u94c1\u725b",legacy_ironcow:"\u4f20\u7edf\u94c1\u725b"},gameModeDescriptions:{standard:"\u6807\u51c6\u6e38\u620f\u6a21\u5f0f\u9002\u5408\u5927\u591a\u6570\u73a9\u5bb6\uff0c\u6ca1\u6709\u529f\u80fd\u9650\u5236\u3002",ironcow:"\u94c1\u725b\u6e38\u620f\u6a21\u5f0f\u9002\u5408\u559c\u6b22\u81ea\u529b\u66f4\u751f\u7684\u73a9\u5bb6\u3002\u4f60\u4e0d\u80fd\u4f7f\u7528\u5e02\u573a\u4e0e\u5176\u4ed6\u73a9\u5bb6\u4ea4\u6613(\u4f8b\u5916: \u5141\u8bb8\u8d2d\u4e70\u725b\u94c3)\u3002",legacy_ironcow:""},skillNames:{"/skills/total_level":"\u603b\u7b49\u7ea7","/skills/milking":"\u6324\u5976","/skills/foraging":"\u91c7\u6458","/skills/woodcutting":"\u4f10\u6728","/skills/cheesesmithing":"\u5976\u916a\u953b\u9020","/skills/crafting":"\u5236\u4f5c","/skills/tailoring":"\u7f1d\u7eab","/skills/cooking":"\u70f9\u996a","/skills/brewing":"\u51b2\u6ce1","/skills/alchemy":"\u70bc\u91d1","/skills/enhancing":"\u5f3a\u5316","/skills/stamina":"\u8010\u529b","/skills/intelligence":"\u667a\u529b","/skills/attack":"\u653b\u51fb","/skills/defense":"\u9632\u5fa1","/skills/melee":"\u8fd1\u6218","/skills/ranged":"\u8fdc\u7a0b","/skills/magic":"\u9b54\u6cd5"},abilityNames:{"/abilities/poke":"\u7834\u80c6\u4e4b\u523a","/abilities/impale":"\u900f\u9aa8\u4e4b\u523a","/abilities/puncture":"\u7834\u7532\u4e4b\u523a","/abilities/penetrating_strike":"\u8d2f\u5fc3\u4e4b\u523a","/abilities/scratch":"\u722a\u5f71\u65a9","/abilities/cleave":"\u5206\u88c2\u65a9","/abilities/maim":"\u8840\u5203\u65a9","/abilities/crippling_slash":"\u81f4\u6b8b\u65a9","/abilities/smack":"\u91cd\u78be","/abilities/sweep":"\u91cd\u626b","/abilities/stunning_blow":"\u91cd\u9524","/abilities/fracturing_impact":"\u788e\u88c2\u51b2\u51fb","/abilities/shield_bash":"\u76fe\u51fb","/abilities/quick_shot":"\u5feb\u901f\u5c04\u51fb","/abilities/aqua_arrow":"\u6d41\u6c34\u7bad","/abilities/flame_arrow":"\u70c8\u7130\u7bad","/abilities/rain_of_arrows":"\u7bad\u96e8","/abilities/silencing_shot":"\u6c89\u9ed8\u4e4b\u7bad","/abilities/steady_shot":"\u7a33\u5b9a\u5c04\u51fb","/abilities/pestilent_shot":"\u75ab\u75c5\u5c04\u51fb","/abilities/penetrating_shot":"\u8d2f\u7a7f\u5c04\u51fb","/abilities/water_strike":"\u6d41\u6c34\u51b2\u51fb","/abilities/ice_spear":"\u51b0\u67aa\u672f","/abilities/frost_surge":"\u51b0\u971c\u7206\u88c2","/abilities/mana_spring":"\u6cd5\u529b\u55b7\u6cc9","/abilities/entangle":"\u7f20\u7ed5","/abilities/toxic_pollen":"\u5267\u6bd2\u7c89\u5c18","/abilities/natures_veil":"\u81ea\u7136\u83cc\u5e55","/abilities/life_drain":"\u751f\u547d\u5438\u53d6","/abilities/fireball":"\u706b\u7403","/abilities/flame_blast":"\u7194\u5ca9\u7206\u88c2","/abilities/firestorm":"\u706b\u7130\u98ce\u66b4","/abilities/smoke_burst":"\u70df\u7206\u706d\u5f71","/abilities/minor_heal":"\u521d\u7ea7\u81ea\u6108\u672f","/abilities/heal":"\u81ea\u6108\u672f","/abilities/quick_aid":"\u5feb\u901f\u6cbb\u7597\u672f","/abilities/rejuvenate":"\u7fa4\u4f53\u6cbb\u7597\u672f","/abilities/taunt":"\u5632\u8bbd","/abilities/provoke":"\u6311\u8845","/abilities/toughness":"\u575a\u97e7","/abilities/elusiveness":"\u95ea\u907f","/abilities/precision":"\u7cbe\u786e","/abilities/berserk":"\u72c2\u66b4","/abilities/frenzy":"\u72c2\u901f","/abilities/elemental_affinity":"\u5143\u7d20\u589e\u5e45","/abilities/spike_shell":"\u5c16\u523a\u9632\u62a4","/abilities/retribution":"\u60e9\u6212","/abilities/vampirism":"\u5438\u8840","/abilities/revive":"\u590d\u6d3b","/abilities/insanity":"\u75af\u72c2","/abilities/invincible":"\u65e0\u654c","/abilities/speed_aura":"\u901f\u5ea6\u5149\u73af","/abilities/guardian_aura":"\u5b88\u62a4\u5149\u73af","/abilities/fierce_aura":"\u7269\u7406\u5149\u73af","/abilities/critical_aura":"\u66b4\u51fb\u5149\u73af","/abilities/mystic_aura":"\u5143\u7d20\u5149\u73af","/abilities/promote":"\u664b\u5347"},abilityDescriptions:{"/abilities/poke":"\u6233\u5411\u76ee\u6807\u654c\u4eba","/abilities/impale":"\u523a\u7a7f\u76ee\u6807\u654c\u4eba","/abilities/puncture":"\u51fb\u7834\u76ee\u6807\u654c\u4eba\u7684\u62a4\u7532\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u4e34\u65f6\u964d\u4f4e\u5176\u62a4\u7532","/abilities/penetrating_strike":"\u523a\u5411\u76ee\u6807\u654c\u4eba\uff0c\u5982\u679c\u547d\u4e2d\uff0c\u5219\u8d2f\u7a7f\u5e76\u523a\u5411\u4e0b\u4e00\u4e2a\u654c\u4eba","/abilities/scratch":"\u6293\u4f24\u76ee\u6807\u654c\u4eba","/abilities/cleave":"\u5288\u780d\u6240\u6709\u654c\u4eba","/abilities/maim":"\u5212\u4f24\u76ee\u6807\u654c\u4eba\uff0c\u5e76\u4f7f\u5176\u6d41\u8840","/abilities/crippling_slash":"\u65a9\u51fb\u6240\u6709\u654c\u4eba\uff0c\u5e76\u51cf\u5c11\u5176\u4f24\u5bb3","/abilities/smack":"\u731b\u51fb\u76ee\u6807\u654c\u4eba","/abilities/sweep":"\u5bf9\u6240\u6709\u654c\u4eba\u8fdb\u884c\u6a2a\u626b\u653b\u51fb","/abilities/stunning_blow":"\u91cd\u9524\u76ee\u6807\u654c\u4eba\uff0c\u5e76\u6709\u51e0\u7387\u4f7f\u5176\u7729\u6655","/abilities/fracturing_impact":"\u5bf9\u6240\u6709\u654c\u4eba\u9020\u6210\u4f24\u5bb3\uff0c\u5e76\u589e\u52a0\u5176\u6240\u53d7\u4f24\u5bb3","/abilities/shield_bash":"\u76fe\u51fb\u76ee\u6807\u654c\u4eba","/abilities/quick_shot":"\u5bf9\u76ee\u6807\u654c\u4eba\u8fdb\u884c\u5feb\u901f\u5c04\u51fb","/abilities/aqua_arrow":"\u5411\u76ee\u6807\u654c\u4eba\u5c04\u51fa\u6c34\u7bad","/abilities/flame_arrow":"\u5411\u76ee\u6807\u654c\u4eba\u5c04\u51fa\u706b\u7130\u7bad","/abilities/rain_of_arrows":"\u5411\u6240\u6709\u654c\u4eba\u5c04\u51fa\u7bad\u96e8","/abilities/silencing_shot":"\u5bf9\u76ee\u6807\u654c\u4eba\u5c04\u51fb\uff0c\u5e76\u4f7f\u5176\u6c89\u9ed8","/abilities/steady_shot":"\u4ee5\u6781\u9ad8\u7684\u7cbe\u51c6\u5bf9\u76ee\u6807\u654c\u4eba\u8fdb\u884c\u5c04\u51fb","/abilities/pestilent_shot":"\u5bf9\u76ee\u6807\u654c\u4eba\u5c04\u51fb\uff0c\u5e76\u51cf\u5c11\u62a4\u7532\u548c\u9b54\u6297","/abilities/penetrating_shot":"\u5c04\u51fb\u76ee\u6807\u654c\u4eba\uff0c\u5982\u679c\u547d\u4e2d\uff0c\u5219\u8d2f\u7a7f\u5e76\u5c04\u5411\u4e0b\u4e00\u4e2a\u654c\u4eba","/abilities/water_strike":"\u5bf9\u76ee\u6807\u654c\u4eba\u4f7f\u7528\u6d41\u6c34\u51b2\u51fb","/abilities/ice_spear":"\u5bf9\u76ee\u6807\u654c\u4eba\u6295\u63b7\u51b0\u77db\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u964d\u4f4e\u5176\u653b\u51fb\u901f\u5ea6","/abilities/frost_surge":"\u5bf9\u6240\u6709\u654c\u4eba\u65bd\u653e\u51b0\u971c\u7206\u88c2,\u9020\u6210\u4f24\u5bb3\u5e76\u51cf\u5c11\u95ea\u907f","/abilities/mana_spring":"\u5bf9\u6240\u6709\u654c\u4eba\u91ca\u653e\u6cd5\u529b\u55b7\u6cc9\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u589e\u52a0\u53cb\u65b9MP\u6062\u590d","/abilities/entangle":"\u7f20\u7ed5\u76ee\u6807\u654c\u4eba\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u6709\u51e0\u7387\u4f7f\u5176\u7729\u6655","/abilities/toxic_pollen":"\u5bf9\u6240\u6709\u654c\u4eba\u65bd\u653e\u5267\u6bd2\u7c89\u5c18\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u51cf\u5c11\u62a4\u7532\u548c\u9b54\u6297","/abilities/natures_veil":"\u7ed9\u6240\u6709\u654c\u4eba\u8499\u4e0a\u4e00\u5c42\u83cc\u5e55\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u6709\u51e0\u7387\u4f7f\u5176\u5931\u660e","/abilities/life_drain":"\u5438\u53d6\u76ee\u6807\u654c\u4eba\u7684\u751f\u547d\u529b\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u6cbb\u7597\u81ea\u5df1","/abilities/fireball":"\u5bf9\u76ee\u6807\u654c\u4eba\u65bd\u653e\u706b\u7403","/abilities/flame_blast":"\u5bf9\u6240\u6709\u654c\u4eba\u65bd\u653e\u7194\u5ca9\u7206\u88c2","/abilities/firestorm":"\u5bf9\u6240\u6709\u654c\u4eba\u65bd\u653e\u706b\u7130\u98ce\u66b4","/abilities/smoke_burst":"\u5bf9\u76ee\u6807\u654c\u4eba\u91ca\u653e\u70df\u7206\u706d\u5f71\uff0c\u9020\u6210\u4f24\u5bb3\u5e76\u51cf\u5c11\u7cbe\u51c6","/abilities/minor_heal":"\u5bf9\u81ea\u5df1\u65bd\u653e\u521d\u7ea7\u6cbb\u7597\u672f","/abilities/heal":"\u5bf9\u81ea\u5df1\u65bd\u653e\u6cbb\u7597\u672f","/abilities/quick_aid":"\u5bf9HP%\u6700\u4f4e\u7684\u961f\u53cb\u65bd\u653e\u6cbb\u7597\u672f","/abilities/rejuvenate":"\u6cbb\u7597\u6240\u6709\u961f\u53cb","/abilities/taunt":"\u5927\u5e45\u589e\u52a0\u5a01\u80c1\u7b49\u7ea7","/abilities/provoke":"\u6781\u5927\u5730\u589e\u52a0\u5a01\u80c1\u7b49\u7ea7","/abilities/toughness":"\u4e34\u65f6\u5927\u5e45\u589e\u52a0\u62a4\u7532\u548c\u6297\u6027","/abilities/elusiveness":"\u4e34\u65f6\u5927\u5e45\u589e\u52a0\u95ea\u907f","/abilities/precision":"\u4e34\u65f6\u5927\u5e45\u589e\u52a0\u7cbe\u51c6","/abilities/berserk":"\u4e34\u65f6\u5927\u5e45\u589e\u52a0\u7269\u7406\u4f24\u5bb3","/abilities/frenzy":"\u4e34\u65f6\u5927\u5e45\u589e\u52a0\u653b\u51fb\u901f\u5ea6","/abilities/elemental_affinity":"\u4e34\u65f6\u5927\u5e45\u589e\u52a0\u5143\u7d20\u4f24\u5bb3","/abilities/spike_shell":"\u4e34\u65f6\u83b7\u5f97\u7269\u7406\u548c\u5143\u7d20\u8346\u68d8","/abilities/retribution":"\u4e34\u65f6\u83b7\u5f97\u53cd\u4f24\u5f3a\u5ea6","/abilities/vampirism":"\u4e34\u65f6\u83b7\u5f97\u751f\u547d\u5077\u53d6","/abilities/revive":"\u590d\u6d3b\u4e00\u4f4d\u6b7b\u4ea1\u7684\u961f\u53cb","/abilities/insanity":"\u4ee5HP\u4e3a\u4ee3\u4ef7\uff0c\u4e34\u65f6\u589e\u52a0\u4f24\u5bb3\u3001\u653b\u51fb\u901f\u5ea6\u548c\u65bd\u6cd5\u901f\u5ea6","/abilities/invincible":"\u4e34\u65f6\u6781\u5927\u589e\u52a0\u62a4\u7532\u3001\u6297\u6027\u548c\u97e7\u6027","/abilities/speed_aura":"\u589e\u52a0\u6240\u6709\u961f\u53cb\u7684\u653b\u51fb\u901f\u5ea6\u548c\u65bd\u6cd5\u901f\u5ea6\uff0c\u6548\u679c\u968f\u65bd\u6cd5\u8005\u7684\u653b\u51fb\u6bcf\u7ea7\u589e\u52a0(0.005x)","/abilities/guardian_aura":"\u589e\u52a0\u6240\u6709\u961f\u53cb\u7684\u6cbb\u7597\u589e\u5e45\u3001\u95ea\u907f\u3001\u62a4\u7532\u548c\u6297\u6027\uff0c\u6548\u679c\u968f\u65bd\u6cd5\u8005\u7684\u9632\u5fa1\u6bcf\u7ea7\u589e\u52a0(0.005x)","/abilities/fierce_aura":"\u589e\u52a0\u6240\u6709\u961f\u53cb\u7684\u7269\u7406\u589e\u5e45\uff0c\u6548\u679c\u968f\u65bd\u6cd5\u8005\u7684\u8fd1\u6218\u6bcf\u7ea7\u589e\u52a0(0.005x)","/abilities/critical_aura":"\u589e\u52a0\u6240\u6709\u961f\u53cb\u7684\u66b4\u51fb\u7387\u548c\u66b4\u51fb\u4f24\u5bb3\uff0c\u6548\u679c\u968f\u65bd\u6cd5\u8005\u7684\u8fdc\u7a0b\u6bcf\u7ea7\u589e\u52a0(0.005x)","/abilities/mystic_aura":"\u589e\u52a0\u6240\u6709\u961f\u53cb\u7684\u5143\u7d20\u589e\u5e45\uff0c\u6548\u679c\u968f\u65bd\u6cd5\u8005\u7684\u9b54\u6cd5\u6bcf\u7ea7\u589e\u52a0(0.005x)","/abilities/promote":"\u664b\u5347\u4e00\u4e2a\u5c0f\u5175"},itemNames:{"/items/coin":"\u91d1\u5e01","/items/task_token":"\u4efb\u52a1\u4ee3\u5e01","/items/labyrinth_token":"\u8ff7\u5bab\u4ee3\u5e01","/items/chimerical_token":"\u5947\u5e7b\u4ee3\u5e01","/items/sinister_token":"\u9634\u68ee\u4ee3\u5e01","/items/enchanted_token":"\u79d8\u6cd5\u4ee3\u5e01","/items/pirate_token":"\u6d77\u76d7\u4ee3\u5e01","/items/cowbell":"\u725b\u94c3","/items/bag_of_10_cowbells":"\u725b\u94c3\u888b (10\u4e2a)","/items/purples_gift":"\u5c0f\u7d2b\u725b\u7684\u793c\u7269","/items/small_meteorite_cache":"\u5c0f\u9668\u77f3\u8231","/items/medium_meteorite_cache":"\u4e2d\u9668\u77f3\u8231","/items/large_meteorite_cache":"\u5927\u9668\u77f3\u8231","/items/small_artisans_crate":"\u5c0f\u5de5\u5320\u5323","/items/medium_artisans_crate":"\u4e2d\u5de5\u5320\u5323","/items/large_artisans_crate":"\u5927\u5de5\u5320\u5323","/items/small_treasure_chest":"\u5c0f\u5b9d\u7bb1","/items/medium_treasure_chest":"\u4e2d\u5b9d\u7bb1","/items/large_treasure_chest":"\u5927\u5b9d\u7bb1","/items/chimerical_chest":"\u5947\u5e7b\u5b9d\u7bb1","/items/chimerical_refinement_chest":"\u5947\u5e7b\u7cbe\u70bc\u5b9d\u7bb1","/items/sinister_chest":"\u9634\u68ee\u5b9d\u7bb1","/items/sinister_refinement_chest":"\u9634\u68ee\u7cbe\u70bc\u5b9d\u7bb1","/items/enchanted_chest":"\u79d8\u6cd5\u5b9d\u7bb1","/items/enchanted_refinement_chest":"\u79d8\u6cd5\u7cbe\u70bc\u5b9d\u7bb1","/items/pirate_chest":"\u6d77\u76d7\u5b9d\u7bb1","/items/pirate_refinement_chest":"\u6d77\u76d7\u7cbe\u70bc\u5b9d\u7bb1","/items/purdoras_box_skilling":"\u7d2b\u591a\u62c9\u4e4b\u76d2\uff08\u751f\u6d3b\uff09","/items/purdoras_box_combat":"\u7d2b\u591a\u62c9\u4e4b\u76d2\uff08\u6218\u6597\uff09","/items/labyrinth_refinement_chest":"\u8ff7\u5bab\u7cbe\u70bc\u5b9d\u7bb1","/items/seal_of_gathering":"\u91c7\u96c6\u5377\u8f74","/items/seal_of_gourmet":"\u7f8e\u98df\u5377\u8f74","/items/seal_of_processing":"\u52a0\u5de5\u5377\u8f74","/items/seal_of_efficiency":"\u6548\u7387\u5377\u8f74","/items/seal_of_action_speed":"\u884c\u52a8\u901f\u5ea6\u5377\u8f74","/items/seal_of_combat_drop":"\u6218\u6597\u6389\u843d\u5377\u8f74","/items/seal_of_attack_speed":"\u653b\u51fb\u901f\u5ea6\u5377\u8f74","/items/seal_of_cast_speed":"\u65bd\u6cd5\u901f\u5ea6\u5377\u8f74","/items/seal_of_damage":"\u4f24\u5bb3\u5377\u8f74","/items/seal_of_critical_rate":"\u66b4\u51fb\u7387\u5377\u8f74","/items/seal_of_wisdom":"\u7ecf\u9a8c\u5377\u8f74","/items/seal_of_rare_find":"\u7a00\u6709\u53d1\u73b0\u5377\u8f74","/items/blue_key_fragment":"\u84dd\u8272\u94a5\u5319\u788e\u7247","/items/green_key_fragment":"\u7eff\u8272\u94a5\u5319\u788e\u7247","/items/purple_key_fragment":"\u7d2b\u8272\u94a5\u5319\u788e\u7247","/items/white_key_fragment":"\u767d\u8272\u94a5\u5319\u788e\u7247","/items/orange_key_fragment":"\u6a59\u8272\u94a5\u5319\u788e\u7247","/items/brown_key_fragment":"\u68d5\u8272\u94a5\u5319\u788e\u7247","/items/stone_key_fragment":"\u77f3\u5934\u94a5\u5319\u788e\u7247","/items/dark_key_fragment":"\u9ed1\u6697\u94a5\u5319\u788e\u7247","/items/burning_key_fragment":"\u71c3\u70e7\u94a5\u5319\u788e\u7247","/items/chimerical_entry_key":"\u5947\u5e7b\u94a5\u5319","/items/chimerical_chest_key":"\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319","/items/sinister_entry_key":"\u9634\u68ee\u94a5\u5319","/items/sinister_chest_key":"\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319","/items/enchanted_entry_key":"\u79d8\u6cd5\u94a5\u5319","/items/enchanted_chest_key":"\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319","/items/pirate_entry_key":"\u6d77\u76d7\u94a5\u5319","/items/pirate_chest_key":"\u6d77\u76d7\u5b9d\u7bb1\u94a5\u5319","/items/donut":"\u751c\u751c\u5708","/items/blueberry_donut":"\u84dd\u8393\u751c\u751c\u5708","/items/blackberry_donut":"\u9ed1\u8393\u751c\u751c\u5708","/items/strawberry_donut":"\u8349\u8393\u751c\u751c\u5708","/items/mooberry_donut":"\u54de\u8393\u751c\u751c\u5708","/items/marsberry_donut":"\u706b\u661f\u8393\u751c\u751c\u5708","/items/spaceberry_donut":"\u592a\u7a7a\u8393\u751c\u751c\u5708","/items/cupcake":"\u7eb8\u676f\u86cb\u7cd5","/items/blueberry_cake":"\u84dd\u8393\u86cb\u7cd5","/items/blackberry_cake":"\u9ed1\u8393\u86cb\u7cd5","/items/strawberry_cake":"\u8349\u8393\u86cb\u7cd5","/items/mooberry_cake":"\u54de\u8393\u86cb\u7cd5","/items/marsberry_cake":"\u706b\u661f\u8393\u86cb\u7cd5","/items/spaceberry_cake":"\u592a\u7a7a\u8393\u86cb\u7cd5","/items/gummy":"\u8f6f\u7cd6","/items/apple_gummy":"\u82f9\u679c\u8f6f\u7cd6","/items/orange_gummy":"\u6a59\u5b50\u8f6f\u7cd6","/items/plum_gummy":"\u674e\u5b50\u8f6f\u7cd6","/items/peach_gummy":"\u6843\u5b50\u8f6f\u7cd6","/items/dragon_fruit_gummy":"\u706b\u9f99\u679c\u8f6f\u7cd6","/items/star_fruit_gummy":"\u6768\u6843\u8f6f\u7cd6","/items/yogurt":"\u9178\u5976","/items/apple_yogurt":"\u82f9\u679c\u9178\u5976","/items/orange_yogurt":"\u6a59\u5b50\u9178\u5976","/items/plum_yogurt":"\u674e\u5b50\u9178\u5976","/items/peach_yogurt":"\u6843\u5b50\u9178\u5976","/items/dragon_fruit_yogurt":"\u706b\u9f99\u679c\u9178\u5976","/items/star_fruit_yogurt":"\u6768\u6843\u9178\u5976","/items/milking_tea":"\u6324\u5976\u8336","/items/foraging_tea":"\u91c7\u6458\u8336","/items/woodcutting_tea":"\u4f10\u6728\u8336","/items/cooking_tea":"\u70f9\u996a\u8336","/items/brewing_tea":"\u51b2\u6ce1\u8336","/items/alchemy_tea":"\u70bc\u91d1\u8336","/items/enhancing_tea":"\u5f3a\u5316\u8336","/items/cheesesmithing_tea":"\u5976\u916a\u953b\u9020\u8336","/items/crafting_tea":"\u5236\u4f5c\u8336","/items/tailoring_tea":"\u7f1d\u7eab\u8336","/items/super_milking_tea":"\u8d85\u7ea7\u6324\u5976\u8336","/items/super_foraging_tea":"\u8d85\u7ea7\u91c7\u6458\u8336","/items/super_woodcutting_tea":"\u8d85\u7ea7\u4f10\u6728\u8336","/items/super_cooking_tea":"\u8d85\u7ea7\u70f9\u996a\u8336","/items/super_brewing_tea":"\u8d85\u7ea7\u51b2\u6ce1\u8336","/items/super_alchemy_tea":"\u8d85\u7ea7\u70bc\u91d1\u8336","/items/super_enhancing_tea":"\u8d85\u7ea7\u5f3a\u5316\u8336","/items/super_cheesesmithing_tea":"\u8d85\u7ea7\u5976\u916a\u953b\u9020\u8336","/items/super_crafting_tea":"\u8d85\u7ea7\u5236\u4f5c\u8336","/items/super_tailoring_tea":"\u8d85\u7ea7\u7f1d\u7eab\u8336","/items/ultra_milking_tea":"\u7a76\u6781\u6324\u5976\u8336","/items/ultra_foraging_tea":"\u7a76\u6781\u91c7\u6458\u8336","/items/ultra_woodcutting_tea":"\u7a76\u6781\u4f10\u6728\u8336","/items/ultra_cooking_tea":"\u7a76\u6781\u70f9\u996a\u8336","/items/ultra_brewing_tea":"\u7a76\u6781\u51b2\u6ce1\u8336","/items/ultra_alchemy_tea":"\u7a76\u6781\u70bc\u91d1\u8336","/items/ultra_enhancing_tea":"\u7a76\u6781\u5f3a\u5316\u8336","/items/ultra_cheesesmithing_tea":"\u7a76\u6781\u5976\u916a\u953b\u9020\u8336","/items/ultra_crafting_tea":"\u7a76\u6781\u5236\u4f5c\u8336","/items/ultra_tailoring_tea":"\u7a76\u6781\u7f1d\u7eab\u8336","/items/gathering_tea":"\u91c7\u96c6\u8336","/items/gourmet_tea":"\u7f8e\u98df\u8336","/items/wisdom_tea":"\u7ecf\u9a8c\u8336","/items/processing_tea":"\u52a0\u5de5\u8336","/items/efficiency_tea":"\u6548\u7387\u8336","/items/artisan_tea":"\u5de5\u5320\u8336","/items/catalytic_tea":"\u50ac\u5316\u8336","/items/blessed_tea":"\u798f\u6c14\u8336","/items/stamina_coffee":"\u8010\u529b\u5496\u5561","/items/intelligence_coffee":"\u667a\u529b\u5496\u5561","/items/defense_coffee":"\u9632\u5fa1\u5496\u5561","/items/attack_coffee":"\u653b\u51fb\u5496\u5561","/items/melee_coffee":"\u8fd1\u6218\u5496\u5561","/items/ranged_coffee":"\u8fdc\u7a0b\u5496\u5561","/items/magic_coffee":"\u9b54\u6cd5\u5496\u5561","/items/super_stamina_coffee":"\u8d85\u7ea7\u8010\u529b\u5496\u5561","/items/super_intelligence_coffee":"\u8d85\u7ea7\u667a\u529b\u5496\u5561","/items/super_defense_coffee":"\u8d85\u7ea7\u9632\u5fa1\u5496\u5561","/items/super_attack_coffee":"\u8d85\u7ea7\u653b\u51fb\u5496\u5561","/items/super_melee_coffee":"\u8d85\u7ea7\u8fd1\u6218\u5496\u5561","/items/super_ranged_coffee":"\u8d85\u7ea7\u8fdc\u7a0b\u5496\u5561","/items/super_magic_coffee":"\u8d85\u7ea7\u9b54\u6cd5\u5496\u5561","/items/ultra_stamina_coffee":"\u7a76\u6781\u8010\u529b\u5496\u5561","/items/ultra_intelligence_coffee":"\u7a76\u6781\u667a\u529b\u5496\u5561","/items/ultra_defense_coffee":"\u7a76\u6781\u9632\u5fa1\u5496\u5561","/items/ultra_attack_coffee":"\u7a76\u6781\u653b\u51fb\u5496\u5561","/items/ultra_melee_coffee":"\u7a76\u6781\u8fd1\u6218\u5496\u5561","/items/ultra_ranged_coffee":"\u7a76\u6781\u8fdc\u7a0b\u5496\u5561","/items/ultra_magic_coffee":"\u7a76\u6781\u9b54\u6cd5\u5496\u5561","/items/wisdom_coffee":"\u7ecf\u9a8c\u5496\u5561","/items/lucky_coffee":"\u5e78\u8fd0\u5496\u5561","/items/swiftness_coffee":"\u8fc5\u6377\u5496\u5561","/items/channeling_coffee":"\u541f\u5531\u5496\u5561","/items/critical_coffee":"\u66b4\u51fb\u5496\u5561","/items/poke":"\u7834\u80c6\u4e4b\u523a","/items/impale":"\u900f\u9aa8\u4e4b\u523a","/items/puncture":"\u7834\u7532\u4e4b\u523a","/items/penetrating_strike":"\u8d2f\u5fc3\u4e4b\u523a","/items/scratch":"\u722a\u5f71\u65a9","/items/cleave":"\u5206\u88c2\u65a9","/items/maim":"\u8840\u5203\u65a9","/items/crippling_slash":"\u81f4\u6b8b\u65a9","/items/smack":"\u91cd\u78be","/items/sweep":"\u91cd\u626b","/items/stunning_blow":"\u91cd\u9524","/items/fracturing_impact":"\u788e\u88c2\u51b2\u51fb","/items/shield_bash":"\u76fe\u51fb","/items/quick_shot":"\u5feb\u901f\u5c04\u51fb","/items/aqua_arrow":"\u6d41\u6c34\u7bad","/items/flame_arrow":"\u70c8\u7130\u7bad","/items/rain_of_arrows":"\u7bad\u96e8","/items/silencing_shot":"\u6c89\u9ed8\u4e4b\u7bad","/items/steady_shot":"\u7a33\u5b9a\u5c04\u51fb","/items/pestilent_shot":"\u75ab\u75c5\u5c04\u51fb","/items/penetrating_shot":"\u8d2f\u7a7f\u5c04\u51fb","/items/water_strike":"\u6d41\u6c34\u51b2\u51fb","/items/ice_spear":"\u51b0\u67aa\u672f","/items/frost_surge":"\u51b0\u971c\u7206\u88c2","/items/mana_spring":"\u6cd5\u529b\u55b7\u6cc9","/items/entangle":"\u7f20\u7ed5","/items/toxic_pollen":"\u5267\u6bd2\u7c89\u5c18","/items/natures_veil":"\u81ea\u7136\u83cc\u5e55","/items/life_drain":"\u751f\u547d\u5438\u53d6","/items/fireball":"\u706b\u7403","/items/flame_blast":"\u7194\u5ca9\u7206\u88c2","/items/firestorm":"\u706b\u7130\u98ce\u66b4","/items/smoke_burst":"\u70df\u7206\u706d\u5f71","/items/minor_heal":"\u521d\u7ea7\u81ea\u6108\u672f","/items/heal":"\u81ea\u6108\u672f","/items/quick_aid":"\u5feb\u901f\u6cbb\u7597\u672f","/items/rejuvenate":"\u7fa4\u4f53\u6cbb\u7597\u672f","/items/taunt":"\u5632\u8bbd","/items/provoke":"\u6311\u8845","/items/toughness":"\u575a\u97e7","/items/elusiveness":"\u95ea\u907f","/items/precision":"\u7cbe\u786e","/items/berserk":"\u72c2\u66b4","/items/elemental_affinity":"\u5143\u7d20\u589e\u5e45","/items/frenzy":"\u72c2\u901f","/items/spike_shell":"\u5c16\u523a\u9632\u62a4","/items/retribution":"\u60e9\u6212","/items/vampirism":"\u5438\u8840","/items/revive":"\u590d\u6d3b","/items/insanity":"\u75af\u72c2","/items/invincible":"\u65e0\u654c","/items/speed_aura":"\u901f\u5ea6\u5149\u73af","/items/guardian_aura":"\u5b88\u62a4\u5149\u73af","/items/fierce_aura":"\u7269\u7406\u5149\u73af","/items/critical_aura":"\u66b4\u51fb\u5149\u73af","/items/mystic_aura":"\u5143\u7d20\u5149\u73af","/items/gobo_stabber":"\u54e5\u5e03\u6797\u957f\u5251","/items/gobo_slasher":"\u54e5\u5e03\u6797\u5173\u5200","/items/gobo_smasher":"\u54e5\u5e03\u6797\u72fc\u7259\u68d2","/items/spiked_bulwark":"\u5c16\u523a\u91cd\u76fe","/items/werewolf_slasher":"\u72fc\u4eba\u5173\u5200","/items/griffin_bulwark":"\u72ee\u9e6b\u91cd\u76fe","/items/griffin_bulwark_refined":"\u72ee\u9e6b\u91cd\u76fe\uff08\u7cbe\uff09","/items/gobo_shooter":"\u54e5\u5e03\u6797\u5f39\u5f13","/items/vampiric_bow":"\u5438\u8840\u5f13","/items/cursed_bow":"\u5492\u6028\u4e4b\u5f13","/items/cursed_bow_refined":"\u5492\u6028\u4e4b\u5f13\uff08\u7cbe\uff09","/items/gobo_boomstick":"\u54e5\u5e03\u6797\u706b\u68cd","/items/cheese_bulwark":"\u5976\u916a\u91cd\u76fe","/items/verdant_bulwark":"\u7fe0\u7eff\u91cd\u76fe","/items/azure_bulwark":"\u851a\u84dd\u91cd\u76fe","/items/burble_bulwark":"\u6df1\u7d2b\u91cd\u76fe","/items/crimson_bulwark":"\u7edb\u7ea2\u91cd\u76fe","/items/rainbow_bulwark":"\u5f69\u8679\u91cd\u76fe","/items/holy_bulwark":"\u795e\u5723\u91cd\u76fe","/items/wooden_bow":"\u6728\u5f13","/items/birch_bow":"\u6866\u6728\u5f13","/items/cedar_bow":"\u96ea\u677e\u5f13","/items/purpleheart_bow":"\u7d2b\u5fc3\u5f13","/items/ginkgo_bow":"\u94f6\u674f\u5f13","/items/redwood_bow":"\u7ea2\u6749\u5f13","/items/arcane_bow":"\u795e\u79d8\u5f13","/items/stalactite_spear":"\u77f3\u949f\u957f\u67aa","/items/granite_bludgeon":"\u82b1\u5c97\u5ca9\u5927\u68d2","/items/furious_spear":"\u72c2\u6012\u957f\u67aa","/items/furious_spear_refined":"\u72c2\u6012\u957f\u67aa\uff08\u7cbe\uff09","/items/regal_sword":"\u541b\u738b\u4e4b\u5251","/items/regal_sword_refined":"\u541b\u738b\u4e4b\u5251\uff08\u7cbe\uff09","/items/chaotic_flail":"\u6df7\u6c8c\u8fde\u67b7","/items/chaotic_flail_refined":"\u6df7\u6c8c\u8fde\u67b7\uff08\u7cbe\uff09","/items/soul_hunter_crossbow":"\u7075\u9b42\u730e\u624b\u5f29","/items/sundering_crossbow":"\u88c2\u7a7a\u4e4b\u5f29","/items/sundering_crossbow_refined":"\u88c2\u7a7a\u4e4b\u5f29\uff08\u7cbe\uff09","/items/frost_staff":"\u51b0\u971c\u6cd5\u6756","/items/infernal_battlestaff":"\u70bc\u72f1\u6cd5\u6756","/items/jackalope_staff":"\u9e7f\u89d2\u5154\u4e4b\u6756","/items/rippling_trident":"\u6d9f\u6f2a\u4e09\u53c9\u621f","/items/rippling_trident_refined":"\u6d9f\u6f2a\u4e09\u53c9\u621f\uff08\u7cbe\uff09","/items/blooming_trident":"\u7efd\u653e\u4e09\u53c9\u621f","/items/blooming_trident_refined":"\u7efd\u653e\u4e09\u53c9\u621f\uff08\u7cbe\uff09","/items/blazing_trident":"\u70bd\u7130\u4e09\u53c9\u621f","/items/blazing_trident_refined":"\u70bd\u7130\u4e09\u53c9\u621f\uff08\u7cbe\uff09","/items/cheese_sword":"\u5976\u916a\u5251","/items/verdant_sword":"\u7fe0\u7eff\u5251","/items/azure_sword":"\u851a\u84dd\u5251","/items/burble_sword":"\u6df1\u7d2b\u5251","/items/crimson_sword":"\u7edb\u7ea2\u5251","/items/rainbow_sword":"\u5f69\u8679\u5251","/items/holy_sword":"\u795e\u5723\u5251","/items/cheese_spear":"\u5976\u916a\u957f\u67aa","/items/verdant_spear":"\u7fe0\u7eff\u957f\u67aa","/items/azure_spear":"\u851a\u84dd\u957f\u67aa","/items/burble_spear":"\u6df1\u7d2b\u957f\u67aa","/items/crimson_spear":"\u7edb\u7ea2\u957f\u67aa","/items/rainbow_spear":"\u5f69\u8679\u957f\u67aa","/items/holy_spear":"\u795e\u5723\u957f\u67aa","/items/cheese_mace":"\u5976\u916a\u9489\u5934\u9524","/items/verdant_mace":"\u7fe0\u7eff\u9489\u5934\u9524","/items/azure_mace":"\u851a\u84dd\u9489\u5934\u9524","/items/burble_mace":"\u6df1\u7d2b\u9489\u5934\u9524","/items/crimson_mace":"\u7edb\u7ea2\u9489\u5934\u9524","/items/rainbow_mace":"\u5f69\u8679\u9489\u5934\u9524","/items/holy_mace":"\u795e\u5723\u9489\u5934\u9524","/items/wooden_crossbow":"\u6728\u5f29","/items/birch_crossbow":"\u6866\u6728\u5f29","/items/cedar_crossbow":"\u96ea\u677e\u5f29","/items/purpleheart_crossbow":"\u7d2b\u5fc3\u5f29","/items/ginkgo_crossbow":"\u94f6\u674f\u5f29","/items/redwood_crossbow":"\u7ea2\u6749\u5f29","/items/arcane_crossbow":"\u795e\u79d8\u5f29","/items/wooden_water_staff":"\u6728\u5236\u6c34\u6cd5\u6756","/items/birch_water_staff":"\u6866\u6728\u6c34\u6cd5\u6756","/items/cedar_water_staff":"\u96ea\u677e\u6c34\u6cd5\u6756","/items/purpleheart_water_staff":"\u7d2b\u5fc3\u6c34\u6cd5\u6756","/items/ginkgo_water_staff":"\u94f6\u674f\u6c34\u6cd5\u6756","/items/redwood_water_staff":"\u7ea2\u6749\u6c34\u6cd5\u6756","/items/arcane_water_staff":"\u795e\u79d8\u6c34\u6cd5\u6756","/items/wooden_nature_staff":"\u6728\u5236\u81ea\u7136\u6cd5\u6756","/items/birch_nature_staff":"\u6866\u6728\u81ea\u7136\u6cd5\u6756","/items/cedar_nature_staff":"\u96ea\u677e\u81ea\u7136\u6cd5\u6756","/items/purpleheart_nature_staff":"\u7d2b\u5fc3\u81ea\u7136\u6cd5\u6756","/items/ginkgo_nature_staff":"\u94f6\u674f\u81ea\u7136\u6cd5\u6756","/items/redwood_nature_staff":"\u7ea2\u6749\u81ea\u7136\u6cd5\u6756","/items/arcane_nature_staff":"\u795e\u79d8\u81ea\u7136\u6cd5\u6756","/items/wooden_fire_staff":"\u6728\u5236\u706b\u6cd5\u6756","/items/birch_fire_staff":"\u6866\u6728\u706b\u6cd5\u6756","/items/cedar_fire_staff":"\u96ea\u677e\u706b\u6cd5\u6756","/items/purpleheart_fire_staff":"\u7d2b\u5fc3\u706b\u6cd5\u6756","/items/ginkgo_fire_staff":"\u94f6\u674f\u706b\u6cd5\u6756","/items/redwood_fire_staff":"\u7ea2\u6749\u706b\u6cd5\u6756","/items/arcane_fire_staff":"\u795e\u79d8\u706b\u6cd5\u6756","/items/eye_watch":"\u638c\u4e0a\u76d1\u5de5","/items/snake_fang_dirk":"\u86c7\u7259\u77ed\u5251","/items/vision_shield":"\u89c6\u89c9\u76fe","/items/gobo_defender":"\u54e5\u5e03\u6797\u9632\u5fa1\u8005","/items/vampire_fang_dirk":"\u5438\u8840\u9b3c\u77ed\u5251","/items/knights_aegis":"\u9a91\u58eb\u76fe","/items/knights_aegis_refined":"\u9a91\u58eb\u76fe\uff08\u7cbe\uff09","/items/treant_shield":"\u6811\u4eba\u76fe","/items/manticore_shield":"\u874e\u72ee\u76fe","/items/tome_of_healing":"\u6cbb\u7597\u4e4b\u4e66","/items/tome_of_the_elements":"\u5143\u7d20\u4e4b\u4e66","/items/watchful_relic":"\u8b66\u6212\u9057\u7269","/items/bishops_codex":"\u4e3b\u6559\u6cd5\u5178","/items/bishops_codex_refined":"\u4e3b\u6559\u6cd5\u5178\uff08\u7cbe\uff09","/items/cheese_buckler":"\u5976\u916a\u5706\u76fe","/items/verdant_buckler":"\u7fe0\u7eff\u5706\u76fe","/items/azure_buckler":"\u851a\u84dd\u5706\u76fe","/items/burble_buckler":"\u6df1\u7d2b\u5706\u76fe","/items/crimson_buckler":"\u7edb\u7ea2\u5706\u76fe","/items/rainbow_buckler":"\u5f69\u8679\u5706\u76fe","/items/holy_buckler":"\u795e\u5723\u5706\u76fe","/items/wooden_shield":"\u6728\u76fe","/items/birch_shield":"\u6866\u6728\u76fe","/items/cedar_shield":"\u96ea\u677e\u76fe","/items/purpleheart_shield":"\u7d2b\u5fc3\u76fe","/items/ginkgo_shield":"\u94f6\u674f\u76fe","/items/redwood_shield":"\u7ea2\u6749\u76fe","/items/arcane_shield":"\u795e\u79d8\u76fe","/items/gatherer_cape":"\u91c7\u96c6\u8005\u62ab\u98ce","/items/gatherer_cape_refined":"\u91c7\u96c6\u8005\u62ab\u98ce\uff08\u7cbe\uff09","/items/artificer_cape":"\u5de5\u5320\u62ab\u98ce","/items/artificer_cape_refined":"\u5de5\u5320\u62ab\u98ce\uff08\u7cbe\uff09","/items/culinary_cape":"\u53a8\u5e08\u62ab\u98ce","/items/culinary_cape_refined":"\u53a8\u5e08\u62ab\u98ce\uff08\u7cbe\uff09","/items/chance_cape":"\u673a\u7f18\u62ab\u98ce","/items/chance_cape_refined":"\u673a\u7f18\u62ab\u98ce\uff08\u7cbe\uff09","/items/sinister_cape":"\u9634\u68ee\u62ab\u98ce","/items/sinister_cape_refined":"\u9634\u68ee\u62ab\u98ce\uff08\u7cbe\uff09","/items/chimerical_quiver":"\u5947\u5e7b\u7bad\u888b","/items/chimerical_quiver_refined":"\u5947\u5e7b\u7bad\u888b\uff08\u7cbe\uff09","/items/enchanted_cloak":"\u79d8\u6cd5\u62ab\u98ce","/items/enchanted_cloak_refined":"\u79d8\u6cd5\u62ab\u98ce\uff08\u7cbe\uff09","/items/red_culinary_hat":"\u7ea2\u8272\u53a8\u5e08\u5e3d","/items/snail_shell_helmet":"\u8717\u725b\u58f3\u5934\u76d4","/items/vision_helmet":"\u89c6\u89c9\u5934\u76d4","/items/fluffy_red_hat":"\u84ec\u677e\u7ea2\u5e3d\u5b50","/items/corsair_helmet":"\u63a0\u593a\u8005\u5934\u76d4","/items/corsair_helmet_refined":"\u63a0\u593a\u8005\u5934\u76d4\uff08\u7cbe\uff09","/items/acrobatic_hood":"\u6742\u6280\u5e08\u515c\u5e3d","/items/acrobatic_hood_refined":"\u6742\u6280\u5e08\u515c\u5e3d\uff08\u7cbe\uff09","/items/magicians_hat":"\u9b54\u672f\u5e08\u5e3d","/items/magicians_hat_refined":"\u9b54\u672f\u5e08\u5e3d\uff08\u7cbe\uff09","/items/cheese_helmet":"\u5976\u916a\u5934\u76d4","/items/verdant_helmet":"\u7fe0\u7eff\u5934\u76d4","/items/azure_helmet":"\u851a\u84dd\u5934\u76d4","/items/burble_helmet":"\u6df1\u7d2b\u5934\u76d4","/items/crimson_helmet":"\u7edb\u7ea2\u5934\u76d4","/items/rainbow_helmet":"\u5f69\u8679\u5934\u76d4","/items/holy_helmet":"\u795e\u5723\u5934\u76d4","/items/rough_hood":"\u7c97\u7cd9\u515c\u5e3d","/items/reptile_hood":"\u722c\u884c\u52a8\u7269\u515c\u5e3d","/items/gobo_hood":"\u54e5\u5e03\u6797\u515c\u5e3d","/items/beast_hood":"\u91ce\u517d\u515c\u5e3d","/items/umbral_hood":"\u6697\u5f71\u515c\u5e3d","/items/cotton_hat":"\u68c9\u5e3d","/items/linen_hat":"\u4e9a\u9ebb\u5e3d","/items/bamboo_hat":"\u7af9\u5e3d","/items/silk_hat":"\u4e1d\u5e3d","/items/radiant_hat":"\u5149\u8f89\u5e3d","/items/dairyhands_top":"\u6324\u5976\u5de5\u4e0a\u8863","/items/foragers_top":"\u91c7\u6458\u8005\u4e0a\u8863","/items/lumberjacks_top":"\u4f10\u6728\u5de5\u4e0a\u8863","/items/cheesemakers_top":"\u5976\u916a\u5e08\u4e0a\u8863","/items/crafters_top":"\u5de5\u5320\u4e0a\u8863","/items/tailors_top":"\u88c1\u7f1d\u4e0a\u8863","/items/chefs_top":"\u53a8\u5e08\u4e0a\u8863","/items/brewers_top":"\u996e\u54c1\u5e08\u4e0a\u8863","/items/alchemists_top":"\u70bc\u91d1\u5e08\u4e0a\u8863","/items/enhancers_top":"\u5f3a\u5316\u5e08\u4e0a\u8863","/items/gator_vest":"\u9cc4\u9c7c\u9a6c\u7532","/items/turtle_shell_body":"\u9f9f\u58f3\u80f8\u7532","/items/colossus_plate_body":"\u5de8\u50cf\u80f8\u7532","/items/demonic_plate_body":"\u6076\u9b54\u80f8\u7532","/items/anchorbound_plate_body":"\u951a\u5b9a\u80f8\u7532","/items/anchorbound_plate_body_refined":"\u951a\u5b9a\u80f8\u7532\uff08\u7cbe\uff09","/items/maelstrom_plate_body":"\u6012\u6d9b\u80f8\u7532","/items/maelstrom_plate_body_refined":"\u6012\u6d9b\u80f8\u7532\uff08\u7cbe\uff09","/items/marine_tunic":"\u6d77\u6d0b\u76ae\u8863","/items/revenant_tunic":"\u4ea1\u7075\u76ae\u8863","/items/griffin_tunic":"\u72ee\u9e6b\u76ae\u8863","/items/kraken_tunic":"\u514b\u62c9\u80af\u76ae\u8863","/items/kraken_tunic_refined":"\u514b\u62c9\u80af\u76ae\u8863\uff08\u7cbe\uff09","/items/icy_robe_top":"\u51b0\u971c\u888d\u670d","/items/flaming_robe_top":"\u70c8\u7130\u888d\u670d","/items/luna_robe_top":"\u6708\u795e\u888d\u670d","/items/royal_water_robe_top":"\u7687\u5bb6\u6c34\u7cfb\u888d\u670d","/items/royal_water_robe_top_refined":"\u7687\u5bb6\u6c34\u7cfb\u888d\u670d\uff08\u7cbe\uff09","/items/royal_nature_robe_top":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d","/items/royal_nature_robe_top_refined":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d\uff08\u7cbe\uff09","/items/royal_fire_robe_top":"\u7687\u5bb6\u706b\u7cfb\u888d\u670d","/items/royal_fire_robe_top_refined":"\u7687\u5bb6\u706b\u7cfb\u888d\u670d\uff08\u7cbe\uff09","/items/cheese_plate_body":"\u5976\u916a\u80f8\u7532","/items/verdant_plate_body":"\u7fe0\u7eff\u80f8\u7532","/items/azure_plate_body":"\u851a\u84dd\u80f8\u7532","/items/burble_plate_body":"\u6df1\u7d2b\u80f8\u7532","/items/crimson_plate_body":"\u7edb\u7ea2\u80f8\u7532","/items/rainbow_plate_body":"\u5f69\u8679\u80f8\u7532","/items/holy_plate_body":"\u795e\u5723\u80f8\u7532","/items/rough_tunic":"\u7c97\u7cd9\u76ae\u8863","/items/reptile_tunic":"\u722c\u884c\u52a8\u7269\u76ae\u8863","/items/gobo_tunic":"\u54e5\u5e03\u6797\u76ae\u8863","/items/beast_tunic":"\u91ce\u517d\u76ae\u8863","/items/umbral_tunic":"\u6697\u5f71\u76ae\u8863","/items/cotton_robe_top":"\u68c9\u888d\u670d","/items/linen_robe_top":"\u4e9a\u9ebb\u888d\u670d","/items/bamboo_robe_top":"\u7af9\u888d\u670d","/items/silk_robe_top":"\u4e1d\u7ef8\u888d\u670d","/items/radiant_robe_top":"\u5149\u8f89\u888d\u670d","/items/dairyhands_bottoms":"\u6324\u5976\u5de5\u4e0b\u88c5","/items/foragers_bottoms":"\u91c7\u6458\u8005\u4e0b\u88c5","/items/lumberjacks_bottoms":"\u4f10\u6728\u5de5\u4e0b\u88c5","/items/cheesemakers_bottoms":"\u5976\u916a\u5e08\u4e0b\u88c5","/items/crafters_bottoms":"\u5de5\u5320\u4e0b\u88c5","/items/tailors_bottoms":"\u88c1\u7f1d\u4e0b\u88c5","/items/chefs_bottoms":"\u53a8\u5e08\u4e0b\u88c5","/items/brewers_bottoms":"\u996e\u54c1\u5e08\u4e0b\u88c5","/items/alchemists_bottoms":"\u70bc\u91d1\u5e08\u4e0b\u88c5","/items/enhancers_bottoms":"\u5f3a\u5316\u5e08\u4e0b\u88c5","/items/turtle_shell_legs":"\u9f9f\u58f3\u817f\u7532","/items/colossus_plate_legs":"\u5de8\u50cf\u817f\u7532","/items/demonic_plate_legs":"\u6076\u9b54\u817f\u7532","/items/anchorbound_plate_legs":"\u951a\u5b9a\u817f\u7532","/items/anchorbound_plate_legs_refined":"\u951a\u5b9a\u817f\u7532\uff08\u7cbe\uff09","/items/maelstrom_plate_legs":"\u6012\u6d9b\u817f\u7532","/items/maelstrom_plate_legs_refined":"\u6012\u6d9b\u817f\u7532\uff08\u7cbe\uff09","/items/marine_chaps":"\u822a\u6d77\u76ae\u88e4","/items/revenant_chaps":"\u4ea1\u7075\u76ae\u88e4","/items/griffin_chaps":"\u72ee\u9e6b\u76ae\u88e4","/items/kraken_chaps":"\u514b\u62c9\u80af\u76ae\u88e4","/items/kraken_chaps_refined":"\u514b\u62c9\u80af\u76ae\u88e4\uff08\u7cbe\uff09","/items/icy_robe_bottoms":"\u51b0\u971c\u888d\u88d9","/items/flaming_robe_bottoms":"\u70c8\u7130\u888d\u88d9","/items/luna_robe_bottoms":"\u6708\u795e\u888d\u88d9","/items/royal_water_robe_bottoms":"\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9","/items/royal_water_robe_bottoms_refined":"\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9\uff08\u7cbe\uff09","/items/royal_nature_robe_bottoms":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9","/items/royal_nature_robe_bottoms_refined":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9\uff08\u7cbe\uff09","/items/royal_fire_robe_bottoms":"\u7687\u5bb6\u706b\u7cfb\u888d\u88d9","/items/royal_fire_robe_bottoms_refined":"\u7687\u5bb6\u706b\u7cfb\u888d\u88d9\uff08\u7cbe\uff09","/items/cheese_plate_legs":"\u5976\u916a\u817f\u7532","/items/verdant_plate_legs":"\u7fe0\u7eff\u817f\u7532","/items/azure_plate_legs":"\u851a\u84dd\u817f\u7532","/items/burble_plate_legs":"\u6df1\u7d2b\u817f\u7532","/items/crimson_plate_legs":"\u7edb\u7ea2\u817f\u7532","/items/rainbow_plate_legs":"\u5f69\u8679\u817f\u7532","/items/holy_plate_legs":"\u795e\u5723\u817f\u7532","/items/rough_chaps":"\u7c97\u7cd9\u76ae\u88e4","/items/reptile_chaps":"\u722c\u884c\u52a8\u7269\u76ae\u88e4","/items/gobo_chaps":"\u54e5\u5e03\u6797\u76ae\u88e4","/items/beast_chaps":"\u91ce\u517d\u76ae\u88e4","/items/umbral_chaps":"\u6697\u5f71\u76ae\u88e4","/items/cotton_robe_bottoms":"\u68c9\u888d\u88d9","/items/linen_robe_bottoms":"\u4e9a\u9ebb\u888d\u88d9","/items/bamboo_robe_bottoms":"\u7af9\u888d\u88d9","/items/silk_robe_bottoms":"\u4e1d\u7ef8\u888d\u88d9","/items/radiant_robe_bottoms":"\u5149\u8f89\u888d\u88d9","/items/enchanted_gloves":"\u9644\u9b54\u624b\u5957","/items/pincer_gloves":"\u87f9\u94b3\u624b\u5957","/items/panda_gloves":"\u718a\u732b\u624b\u5957","/items/magnetic_gloves":"\u78c1\u529b\u624b\u5957","/items/dodocamel_gauntlets":"\u6e21\u6e21\u9a7c\u62a4\u624b","/items/dodocamel_gauntlets_refined":"\u6e21\u6e21\u9a7c\u62a4\u624b\uff08\u7cbe\uff09","/items/sighted_bracers":"\u7784\u51c6\u62a4\u8155","/items/marksman_bracers":"\u795e\u5c04\u62a4\u8155","/items/marksman_bracers_refined":"\u795e\u5c04\u62a4\u8155\uff08\u7cbe\uff09","/items/chrono_gloves":"\u65f6\u7a7a\u624b\u5957","/items/cheese_gauntlets":"\u5976\u916a\u62a4\u624b","/items/verdant_gauntlets":"\u7fe0\u7eff\u62a4\u624b","/items/azure_gauntlets":"\u851a\u84dd\u62a4\u624b","/items/burble_gauntlets":"\u6df1\u7d2b\u62a4\u624b","/items/crimson_gauntlets":"\u7edb\u7ea2\u62a4\u624b","/items/rainbow_gauntlets":"\u5f69\u8679\u62a4\u624b","/items/holy_gauntlets":"\u795e\u5723\u62a4\u624b","/items/rough_bracers":"\u7c97\u7cd9\u62a4\u8155","/items/reptile_bracers":"\u722c\u884c\u52a8\u7269\u62a4\u8155","/items/gobo_bracers":"\u54e5\u5e03\u6797\u62a4\u8155","/items/beast_bracers":"\u91ce\u517d\u62a4\u8155","/items/umbral_bracers":"\u6697\u5f71\u62a4\u8155","/items/cotton_gloves":"\u68c9\u624b\u5957","/items/linen_gloves":"\u4e9a\u9ebb\u624b\u5957","/items/bamboo_gloves":"\u7af9\u624b\u5957","/items/silk_gloves":"\u4e1d\u624b\u5957","/items/radiant_gloves":"\u5149\u8f89\u624b\u5957","/items/collectors_boots":"\u6536\u85cf\u5bb6\u9774","/items/shoebill_shoes":"\u9cb8\u5934\u9e73\u978b","/items/black_bear_shoes":"\u9ed1\u718a\u978b","/items/grizzly_bear_shoes":"\u68d5\u718a\u978b","/items/polar_bear_shoes":"\u5317\u6781\u718a\u978b","/items/pathbreaker_boots":"\u5f00\u8def\u8005\u9774","/items/pathbreaker_boots_refined":"\u5f00\u8def\u8005\u9774\uff08\u7cbe\uff09","/items/centaur_boots":"\u534a\u4eba\u9a6c\u9774","/items/pathfinder_boots":"\u63a2\u8def\u8005\u9774","/items/pathfinder_boots_refined":"\u63a2\u8def\u8005\u9774\uff08\u7cbe\uff09","/items/sorcerer_boots":"\u5deb\u5e08\u9774","/items/pathseeker_boots":"\u5bfb\u8def\u8005\u9774","/items/pathseeker_boots_refined":"\u5bfb\u8def\u8005\u9774\uff08\u7cbe\uff09","/items/cheese_boots":"\u5976\u916a\u9774","/items/verdant_boots":"\u7fe0\u7eff\u9774","/items/azure_boots":"\u851a\u84dd\u9774","/items/burble_boots":"\u6df1\u7d2b\u9774","/items/crimson_boots":"\u7edb\u7ea2\u9774","/items/rainbow_boots":"\u5f69\u8679\u9774","/items/holy_boots":"\u795e\u5723\u9774","/items/rough_boots":"\u7c97\u7cd9\u9774","/items/reptile_boots":"\u722c\u884c\u52a8\u7269\u9774","/items/gobo_boots":"\u54e5\u5e03\u6797\u9774","/items/beast_boots":"\u91ce\u517d\u9774","/items/umbral_boots":"\u6697\u5f71\u9774","/items/cotton_boots":"\u68c9\u9774","/items/linen_boots":"\u4e9a\u9ebb\u9774","/items/bamboo_boots":"\u7af9\u9774","/items/silk_boots":"\u4e1d\u9774","/items/radiant_boots":"\u5149\u8f89\u9774","/items/small_pouch":"\u5c0f\u888b\u5b50","/items/medium_pouch":"\u4e2d\u888b\u5b50","/items/large_pouch":"\u5927\u888b\u5b50","/items/giant_pouch":"\u5de8\u5927\u888b\u5b50","/items/gluttonous_pouch":"\u8d2a\u98df\u4e4b\u888b","/items/guzzling_pouch":"\u66b4\u996e\u4e4b\u56ca","/items/necklace_of_efficiency":"\u6548\u7387\u9879\u94fe","/items/fighter_necklace":"\u6218\u58eb\u9879\u94fe","/items/ranger_necklace":"\u5c04\u624b\u9879\u94fe","/items/wizard_necklace":"\u5deb\u5e08\u9879\u94fe","/items/necklace_of_wisdom":"\u7ecf\u9a8c\u9879\u94fe","/items/necklace_of_speed":"\u901f\u5ea6\u9879\u94fe","/items/philosophers_necklace":"\u8d24\u8005\u9879\u94fe","/items/earrings_of_gathering":"\u91c7\u96c6\u8033\u73af","/items/earrings_of_essence_find":"\u7cbe\u534e\u53d1\u73b0\u8033\u73af","/items/earrings_of_armor":"\u62a4\u7532\u8033\u73af","/items/earrings_of_regeneration":"\u6062\u590d\u8033\u73af","/items/earrings_of_resistance":"\u6297\u6027\u8033\u73af","/items/earrings_of_rare_find":"\u7a00\u6709\u53d1\u73b0\u8033\u73af","/items/earrings_of_critical_strike":"\u66b4\u51fb\u8033\u73af","/items/philosophers_earrings":"\u8d24\u8005\u8033\u73af","/items/ring_of_gathering":"\u91c7\u96c6\u6212\u6307","/items/ring_of_essence_find":"\u7cbe\u534e\u53d1\u73b0\u6212\u6307","/items/ring_of_armor":"\u62a4\u7532\u6212\u6307","/items/ring_of_regeneration":"\u6062\u590d\u6212\u6307","/items/ring_of_resistance":"\u6297\u6027\u6212\u6307","/items/ring_of_rare_find":"\u7a00\u6709\u53d1\u73b0\u6212\u6307","/items/ring_of_critical_strike":"\u66b4\u51fb\u6212\u6307","/items/philosophers_ring":"\u8d24\u8005\u6212\u6307","/items/trainee_milking_charm":"\u5b9e\u4e60\u6324\u5976\u62a4\u7b26","/items/basic_milking_charm":"\u57fa\u7840\u6324\u5976\u62a4\u7b26","/items/advanced_milking_charm":"\u9ad8\u7ea7\u6324\u5976\u62a4\u7b26","/items/expert_milking_charm":"\u4e13\u5bb6\u6324\u5976\u62a4\u7b26","/items/master_milking_charm":"\u5927\u5e08\u6324\u5976\u62a4\u7b26","/items/grandmaster_milking_charm":"\u5b97\u5e08\u6324\u5976\u62a4\u7b26","/items/trainee_foraging_charm":"\u5b9e\u4e60\u91c7\u6458\u62a4\u7b26","/items/basic_foraging_charm":"\u57fa\u7840\u91c7\u6458\u62a4\u7b26","/items/advanced_foraging_charm":"\u9ad8\u7ea7\u91c7\u6458\u62a4\u7b26","/items/expert_foraging_charm":"\u4e13\u5bb6\u91c7\u6458\u62a4\u7b26","/items/master_foraging_charm":"\u5927\u5e08\u91c7\u6458\u62a4\u7b26","/items/grandmaster_foraging_charm":"\u5b97\u5e08\u91c7\u6458\u62a4\u7b26","/items/trainee_woodcutting_charm":"\u5b9e\u4e60\u4f10\u6728\u62a4\u7b26","/items/basic_woodcutting_charm":"\u57fa\u7840\u4f10\u6728\u62a4\u7b26","/items/advanced_woodcutting_charm":"\u9ad8\u7ea7\u4f10\u6728\u62a4\u7b26","/items/expert_woodcutting_charm":"\u4e13\u5bb6\u4f10\u6728\u62a4\u7b26","/items/master_woodcutting_charm":"\u5927\u5e08\u4f10\u6728\u62a4\u7b26","/items/grandmaster_woodcutting_charm":"\u5b97\u5e08\u4f10\u6728\u62a4\u7b26","/items/trainee_cheesesmithing_charm":"\u5b9e\u4e60\u5976\u916a\u953b\u9020\u62a4\u7b26","/items/basic_cheesesmithing_charm":"\u57fa\u7840\u5976\u916a\u953b\u9020\u62a4\u7b26","/items/advanced_cheesesmithing_charm":"\u9ad8\u7ea7\u5976\u916a\u953b\u9020\u62a4\u7b26","/items/expert_cheesesmithing_charm":"\u4e13\u5bb6\u5976\u916a\u953b\u9020\u62a4\u7b26","/items/master_cheesesmithing_charm":"\u5927\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26","/items/grandmaster_cheesesmithing_charm":"\u5b97\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26","/items/trainee_crafting_charm":"\u5b9e\u4e60\u5236\u4f5c\u62a4\u7b26","/items/basic_crafting_charm":"\u57fa\u7840\u5236\u4f5c\u62a4\u7b26","/items/advanced_crafting_charm":"\u9ad8\u7ea7\u5236\u4f5c\u62a4\u7b26","/items/expert_crafting_charm":"\u4e13\u5bb6\u5236\u4f5c\u62a4\u7b26","/items/master_crafting_charm":"\u5927\u5e08\u5236\u4f5c\u62a4\u7b26","/items/grandmaster_crafting_charm":"\u5b97\u5e08\u5236\u4f5c\u62a4\u7b26","/items/trainee_tailoring_charm":"\u5b9e\u4e60\u7f1d\u7eab\u62a4\u7b26","/items/basic_tailoring_charm":"\u57fa\u7840\u7f1d\u7eab\u62a4\u7b26","/items/advanced_tailoring_charm":"\u9ad8\u7ea7\u7f1d\u7eab\u62a4\u7b26","/items/expert_tailoring_charm":"\u4e13\u5bb6\u7f1d\u7eab\u62a4\u7b26","/items/master_tailoring_charm":"\u5927\u5e08\u7f1d\u7eab\u62a4\u7b26","/items/grandmaster_tailoring_charm":"\u5b97\u5e08\u7f1d\u7eab\u62a4\u7b26","/items/trainee_cooking_charm":"\u5b9e\u4e60\u70f9\u996a\u62a4\u7b26","/items/basic_cooking_charm":"\u57fa\u7840\u70f9\u996a\u62a4\u7b26","/items/advanced_cooking_charm":"\u9ad8\u7ea7\u70f9\u996a\u62a4\u7b26","/items/expert_cooking_charm":"\u4e13\u5bb6\u70f9\u996a\u62a4\u7b26","/items/master_cooking_charm":"\u5927\u5e08\u70f9\u996a\u62a4\u7b26","/items/grandmaster_cooking_charm":"\u5b97\u5e08\u70f9\u996a\u62a4\u7b26","/items/trainee_brewing_charm":"\u5b9e\u4e60\u51b2\u6ce1\u62a4\u7b26","/items/basic_brewing_charm":"\u57fa\u7840\u51b2\u6ce1\u62a4\u7b26","/items/advanced_brewing_charm":"\u9ad8\u7ea7\u51b2\u6ce1\u62a4\u7b26","/items/expert_brewing_charm":"\u4e13\u5bb6\u51b2\u6ce1\u62a4\u7b26","/items/master_brewing_charm":"\u5927\u5e08\u51b2\u6ce1\u62a4\u7b26","/items/grandmaster_brewing_charm":"\u5b97\u5e08\u51b2\u6ce1\u62a4\u7b26","/items/trainee_alchemy_charm":"\u5b9e\u4e60\u70bc\u91d1\u62a4\u7b26","/items/basic_alchemy_charm":"\u57fa\u7840\u70bc\u91d1\u62a4\u7b26","/items/advanced_alchemy_charm":"\u9ad8\u7ea7\u70bc\u91d1\u62a4\u7b26","/items/expert_alchemy_charm":"\u4e13\u5bb6\u70bc\u91d1\u62a4\u7b26","/items/master_alchemy_charm":"\u5927\u5e08\u70bc\u91d1\u62a4\u7b26","/items/grandmaster_alchemy_charm":"\u5b97\u5e08\u70bc\u91d1\u62a4\u7b26","/items/trainee_enhancing_charm":"\u5b9e\u4e60\u5f3a\u5316\u62a4\u7b26","/items/basic_enhancing_charm":"\u57fa\u7840\u5f3a\u5316\u62a4\u7b26","/items/advanced_enhancing_charm":"\u9ad8\u7ea7\u5f3a\u5316\u62a4\u7b26","/items/expert_enhancing_charm":"\u4e13\u5bb6\u5f3a\u5316\u62a4\u7b26","/items/master_enhancing_charm":"\u5927\u5e08\u5f3a\u5316\u62a4\u7b26","/items/grandmaster_enhancing_charm":"\u5b97\u5e08\u5f3a\u5316\u62a4\u7b26","/items/trainee_stamina_charm":"\u5b9e\u4e60\u8010\u529b\u62a4\u7b26","/items/basic_stamina_charm":"\u57fa\u7840\u8010\u529b\u62a4\u7b26","/items/advanced_stamina_charm":"\u9ad8\u7ea7\u8010\u529b\u62a4\u7b26","/items/expert_stamina_charm":"\u4e13\u5bb6\u8010\u529b\u62a4\u7b26","/items/master_stamina_charm":"\u5927\u5e08\u8010\u529b\u62a4\u7b26","/items/grandmaster_stamina_charm":"\u5b97\u5e08\u8010\u529b\u62a4\u7b26","/items/trainee_intelligence_charm":"\u5b9e\u4e60\u667a\u529b\u62a4\u7b26","/items/basic_intelligence_charm":"\u57fa\u7840\u667a\u529b\u62a4\u7b26","/items/advanced_intelligence_charm":"\u9ad8\u7ea7\u667a\u529b\u62a4\u7b26","/items/expert_intelligence_charm":"\u4e13\u5bb6\u667a\u529b\u62a4\u7b26","/items/master_intelligence_charm":"\u5927\u5e08\u667a\u529b\u62a4\u7b26","/items/grandmaster_intelligence_charm":"\u5b97\u5e08\u667a\u529b\u62a4\u7b26","/items/trainee_attack_charm":"\u5b9e\u4e60\u653b\u51fb\u62a4\u7b26","/items/basic_attack_charm":"\u57fa\u7840\u653b\u51fb\u62a4\u7b26","/items/advanced_attack_charm":"\u9ad8\u7ea7\u653b\u51fb\u62a4\u7b26","/items/expert_attack_charm":"\u4e13\u5bb6\u653b\u51fb\u62a4\u7b26","/items/master_attack_charm":"\u5927\u5e08\u653b\u51fb\u62a4\u7b26","/items/grandmaster_attack_charm":"\u5b97\u5e08\u653b\u51fb\u62a4\u7b26","/items/trainee_defense_charm":"\u5b9e\u4e60\u9632\u5fa1\u62a4\u7b26","/items/basic_defense_charm":"\u57fa\u7840\u9632\u5fa1\u62a4\u7b26","/items/advanced_defense_charm":"\u9ad8\u7ea7\u9632\u5fa1\u62a4\u7b26","/items/expert_defense_charm":"\u4e13\u5bb6\u9632\u5fa1\u62a4\u7b26","/items/master_defense_charm":"\u5927\u5e08\u9632\u5fa1\u62a4\u7b26","/items/grandmaster_defense_charm":"\u5b97\u5e08\u9632\u5fa1\u62a4\u7b26","/items/trainee_melee_charm":"\u5b9e\u4e60\u8fd1\u6218\u62a4\u7b26","/items/basic_melee_charm":"\u57fa\u7840\u8fd1\u6218\u62a4\u7b26","/items/advanced_melee_charm":"\u9ad8\u7ea7\u8fd1\u6218\u62a4\u7b26","/items/expert_melee_charm":"\u4e13\u5bb6\u8fd1\u6218\u62a4\u7b26","/items/master_melee_charm":"\u5927\u5e08\u8fd1\u6218\u62a4\u7b26","/items/grandmaster_melee_charm":"\u5b97\u5e08\u8fd1\u6218\u62a4\u7b26","/items/trainee_ranged_charm":"\u5b9e\u4e60\u8fdc\u7a0b\u62a4\u7b26","/items/basic_ranged_charm":"\u57fa\u7840\u8fdc\u7a0b\u62a4\u7b26","/items/advanced_ranged_charm":"\u9ad8\u7ea7\u8fdc\u7a0b\u62a4\u7b26","/items/expert_ranged_charm":"\u4e13\u5bb6\u8fdc\u7a0b\u62a4\u7b26","/items/master_ranged_charm":"\u5927\u5e08\u8fdc\u7a0b\u62a4\u7b26","/items/grandmaster_ranged_charm":"\u5b97\u5e08\u8fdc\u7a0b\u62a4\u7b26","/items/trainee_magic_charm":"\u5b9e\u4e60\u9b54\u6cd5\u62a4\u7b26","/items/basic_magic_charm":"\u57fa\u7840\u9b54\u6cd5\u62a4\u7b26","/items/advanced_magic_charm":"\u9ad8\u7ea7\u9b54\u6cd5\u62a4\u7b26","/items/expert_magic_charm":"\u4e13\u5bb6\u9b54\u6cd5\u62a4\u7b26","/items/master_magic_charm":"\u5927\u5e08\u9b54\u6cd5\u62a4\u7b26","/items/grandmaster_magic_charm":"\u5b97\u5e08\u9b54\u6cd5\u62a4\u7b26","/items/basic_task_badge":"\u57fa\u7840\u4efb\u52a1\u5fbd\u7ae0","/items/advanced_task_badge":"\u9ad8\u7ea7\u4efb\u52a1\u5fbd\u7ae0","/items/expert_task_badge":"\u4e13\u5bb6\u4efb\u52a1\u5fbd\u7ae0","/items/celestial_brush":"\u661f\u7a7a\u5237\u5b50","/items/cheese_brush":"\u5976\u916a\u5237\u5b50","/items/verdant_brush":"\u7fe0\u7eff\u5237\u5b50","/items/azure_brush":"\u851a\u84dd\u5237\u5b50","/items/burble_brush":"\u6df1\u7d2b\u5237\u5b50","/items/crimson_brush":"\u7edb\u7ea2\u5237\u5b50","/items/rainbow_brush":"\u5f69\u8679\u5237\u5b50","/items/holy_brush":"\u795e\u5723\u5237\u5b50","/items/celestial_shears":"\u661f\u7a7a\u526a\u5200","/items/cheese_shears":"\u5976\u916a\u526a\u5200","/items/verdant_shears":"\u7fe0\u7eff\u526a\u5200","/items/azure_shears":"\u851a\u84dd\u526a\u5200","/items/burble_shears":"\u6df1\u7d2b\u526a\u5200","/items/crimson_shears":"\u7edb\u7ea2\u526a\u5200","/items/rainbow_shears":"\u5f69\u8679\u526a\u5200","/items/holy_shears":"\u795e\u5723\u526a\u5200","/items/celestial_hatchet":"\u661f\u7a7a\u65a7\u5934","/items/cheese_hatchet":"\u5976\u916a\u65a7\u5934","/items/verdant_hatchet":"\u7fe0\u7eff\u65a7\u5934","/items/azure_hatchet":"\u851a\u84dd\u65a7\u5934","/items/burble_hatchet":"\u6df1\u7d2b\u65a7\u5934","/items/crimson_hatchet":"\u7edb\u7ea2\u65a7\u5934","/items/rainbow_hatchet":"\u5f69\u8679\u65a7\u5934","/items/holy_hatchet":"\u795e\u5723\u65a7\u5934","/items/celestial_hammer":"\u661f\u7a7a\u9524\u5b50","/items/cheese_hammer":"\u5976\u916a\u9524\u5b50","/items/verdant_hammer":"\u7fe0\u7eff\u9524\u5b50","/items/azure_hammer":"\u851a\u84dd\u9524\u5b50","/items/burble_hammer":"\u6df1\u7d2b\u9524\u5b50","/items/crimson_hammer":"\u7edb\u7ea2\u9524\u5b50","/items/rainbow_hammer":"\u5f69\u8679\u9524\u5b50","/items/holy_hammer":"\u795e\u5723\u9524\u5b50","/items/celestial_chisel":"\u661f\u7a7a\u51ff\u5b50","/items/cheese_chisel":"\u5976\u916a\u51ff\u5b50","/items/verdant_chisel":"\u7fe0\u7eff\u51ff\u5b50","/items/azure_chisel":"\u851a\u84dd\u51ff\u5b50","/items/burble_chisel":"\u6df1\u7d2b\u51ff\u5b50","/items/crimson_chisel":"\u7edb\u7ea2\u51ff\u5b50","/items/rainbow_chisel":"\u5f69\u8679\u51ff\u5b50","/items/holy_chisel":"\u795e\u5723\u51ff\u5b50","/items/celestial_needle":"\u661f\u7a7a\u9488","/items/cheese_needle":"\u5976\u916a\u9488","/items/verdant_needle":"\u7fe0\u7eff\u9488","/items/azure_needle":"\u851a\u84dd\u9488","/items/burble_needle":"\u6df1\u7d2b\u9488","/items/crimson_needle":"\u7edb\u7ea2\u9488","/items/rainbow_needle":"\u5f69\u8679\u9488","/items/holy_needle":"\u795e\u5723\u9488","/items/celestial_spatula":"\u661f\u7a7a\u9505\u94f2","/items/cheese_spatula":"\u5976\u916a\u9505\u94f2","/items/verdant_spatula":"\u7fe0\u7eff\u9505\u94f2","/items/azure_spatula":"\u851a\u84dd\u9505\u94f2","/items/burble_spatula":"\u6df1\u7d2b\u9505\u94f2","/items/crimson_spatula":"\u7edb\u7ea2\u9505\u94f2","/items/rainbow_spatula":"\u5f69\u8679\u9505\u94f2","/items/holy_spatula":"\u795e\u5723\u9505\u94f2","/items/celestial_pot":"\u661f\u7a7a\u58f6","/items/cheese_pot":"\u5976\u916a\u58f6","/items/verdant_pot":"\u7fe0\u7eff\u58f6","/items/azure_pot":"\u851a\u84dd\u58f6","/items/burble_pot":"\u6df1\u7d2b\u58f6","/items/crimson_pot":"\u7edb\u7ea2\u58f6","/items/rainbow_pot":"\u5f69\u8679\u58f6","/items/holy_pot":"\u795e\u5723\u58f6","/items/celestial_alembic":"\u661f\u7a7a\u84b8\u998f\u5668","/items/cheese_alembic":"\u5976\u916a\u84b8\u998f\u5668","/items/verdant_alembic":"\u7fe0\u7eff\u84b8\u998f\u5668","/items/azure_alembic":"\u851a\u84dd\u84b8\u998f\u5668","/items/burble_alembic":"\u6df1\u7d2b\u84b8\u998f\u5668","/items/crimson_alembic":"\u7edb\u7ea2\u84b8\u998f\u5668","/items/rainbow_alembic":"\u5f69\u8679\u84b8\u998f\u5668","/items/holy_alembic":"\u795e\u5723\u84b8\u998f\u5668","/items/celestial_enhancer":"\u661f\u7a7a\u5f3a\u5316\u5668","/items/cheese_enhancer":"\u5976\u916a\u5f3a\u5316\u5668","/items/verdant_enhancer":"\u7fe0\u7eff\u5f3a\u5316\u5668","/items/azure_enhancer":"\u851a\u84dd\u5f3a\u5316\u5668","/items/burble_enhancer":"\u6df1\u7d2b\u5f3a\u5316\u5668","/items/crimson_enhancer":"\u7edb\u7ea2\u5f3a\u5316\u5668","/items/rainbow_enhancer":"\u5f69\u8679\u5f3a\u5316\u5668","/items/holy_enhancer":"\u795e\u5723\u5f3a\u5316\u5668","/items/milk":"\u725b\u5976","/items/verdant_milk":"\u7fe0\u7eff\u725b\u5976","/items/azure_milk":"\u851a\u84dd\u725b\u5976","/items/burble_milk":"\u6df1\u7d2b\u725b\u5976","/items/crimson_milk":"\u7edb\u7ea2\u725b\u5976","/items/rainbow_milk":"\u5f69\u8679\u725b\u5976","/items/holy_milk":"\u795e\u5723\u725b\u5976","/items/cheese":"\u5976\u916a","/items/verdant_cheese":"\u7fe0\u7eff\u5976\u916a","/items/azure_cheese":"\u851a\u84dd\u5976\u916a","/items/burble_cheese":"\u6df1\u7d2b\u5976\u916a","/items/crimson_cheese":"\u7edb\u7ea2\u5976\u916a","/items/rainbow_cheese":"\u5f69\u8679\u5976\u916a","/items/holy_cheese":"\u795e\u5723\u5976\u916a","/items/log":"\u539f\u6728","/items/birch_log":"\u767d\u6866\u539f\u6728","/items/cedar_log":"\u96ea\u677e\u539f\u6728","/items/purpleheart_log":"\u7d2b\u5fc3\u539f\u6728","/items/ginkgo_log":"\u94f6\u674f\u539f\u6728","/items/redwood_log":"\u7ea2\u6749\u539f\u6728","/items/arcane_log":"\u795e\u79d8\u539f\u6728","/items/lumber":"\u6728\u677f","/items/birch_lumber":"\u767d\u6866\u6728\u677f","/items/cedar_lumber":"\u96ea\u677e\u6728\u677f","/items/purpleheart_lumber":"\u7d2b\u5fc3\u6728\u677f","/items/ginkgo_lumber":"\u94f6\u674f\u6728\u677f","/items/redwood_lumber":"\u7ea2\u6749\u6728\u677f","/items/arcane_lumber":"\u795e\u79d8\u6728\u677f","/items/rough_hide":"\u7c97\u7cd9\u517d\u76ae","/items/reptile_hide":"\u722c\u884c\u52a8\u7269\u76ae","/items/gobo_hide":"\u54e5\u5e03\u6797\u76ae","/items/beast_hide":"\u91ce\u517d\u76ae","/items/umbral_hide":"\u6697\u5f71\u76ae","/items/rough_leather":"\u7c97\u7cd9\u76ae\u9769","/items/reptile_leather":"\u722c\u884c\u52a8\u7269\u76ae\u9769","/items/gobo_leather":"\u54e5\u5e03\u6797\u76ae\u9769","/items/beast_leather":"\u91ce\u517d\u76ae\u9769","/items/umbral_leather":"\u6697\u5f71\u76ae\u9769","/items/cotton":"\u68c9\u82b1","/items/flax":"\u4e9a\u9ebb","/items/bamboo_branch":"\u7af9\u5b50","/items/cocoon":"\u8695\u8327","/items/radiant_fiber":"\u5149\u8f89\u7ea4\u7ef4","/items/cotton_fabric":"\u68c9\u82b1\u5e03\u6599","/items/linen_fabric":"\u4e9a\u9ebb\u5e03\u6599","/items/bamboo_fabric":"\u7af9\u5b50\u5e03\u6599","/items/silk_fabric":"\u4e1d\u7ef8","/items/radiant_fabric":"\u5149\u8f89\u5e03\u6599","/items/egg":"\u9e21\u86cb","/items/wheat":"\u5c0f\u9ea6","/items/sugar":"\u7cd6","/items/blueberry":"\u84dd\u8393","/items/blackberry":"\u9ed1\u8393","/items/strawberry":"\u8349\u8393","/items/mooberry":"\u54de\u8393","/items/marsberry":"\u706b\u661f\u8393","/items/spaceberry":"\u592a\u7a7a\u8393","/items/apple":"\u82f9\u679c","/items/orange":"\u6a59\u5b50","/items/plum":"\u674e\u5b50","/items/peach":"\u6843\u5b50","/items/dragon_fruit":"\u706b\u9f99\u679c","/items/star_fruit":"\u6768\u6843","/items/arabica_coffee_bean":"\u4f4e\u7ea7\u5496\u5561\u8c46","/items/robusta_coffee_bean":"\u4e2d\u7ea7\u5496\u5561\u8c46","/items/liberica_coffee_bean":"\u9ad8\u7ea7\u5496\u5561\u8c46","/items/excelsa_coffee_bean":"\u7279\u7ea7\u5496\u5561\u8c46","/items/fieriosa_coffee_bean":"\u706b\u5c71\u5496\u5561\u8c46","/items/spacia_coffee_bean":"\u592a\u7a7a\u5496\u5561\u8c46","/items/green_tea_leaf":"\u7eff\u8336\u53f6","/items/black_tea_leaf":"\u9ed1\u8336\u53f6","/items/burble_tea_leaf":"\u7d2b\u8336\u53f6","/items/moolong_tea_leaf":"\u54de\u9f99\u8336\u53f6","/items/red_tea_leaf":"\u7ea2\u8336\u53f6","/items/emp_tea_leaf":"\u865a\u7a7a\u8336\u53f6","/items/catalyst_of_coinification":"\u70b9\u91d1\u50ac\u5316\u5242","/items/catalyst_of_decomposition":"\u5206\u89e3\u50ac\u5316\u5242","/items/catalyst_of_transmutation":"\u8f6c\u5316\u50ac\u5316\u5242","/items/prime_catalyst":"\u81f3\u9ad8\u50ac\u5316\u5242","/items/snake_fang":"\u86c7\u7259","/items/shoebill_feather":"\u9cb8\u5934\u9e73\u7fbd\u6bdb","/items/snail_shell":"\u8717\u725b\u58f3","/items/crab_pincer":"\u87f9\u94b3","/items/turtle_shell":"\u4e4c\u9f9f\u58f3","/items/marine_scale":"\u6d77\u6d0b\u9cde\u7247","/items/treant_bark":"\u6811\u76ae","/items/centaur_hoof":"\u534a\u4eba\u9a6c\u8e44","/items/luna_wing":"\u6708\u795e\u7ffc","/items/gobo_rag":"\u54e5\u5e03\u6797\u62b9\u5e03","/items/goggles":"\u62a4\u76ee\u955c","/items/magnifying_glass":"\u653e\u5927\u955c","/items/eye_of_the_watcher":"\u89c2\u5bdf\u8005\u4e4b\u773c","/items/icy_cloth":"\u51b0\u971c\u7ec7\u7269","/items/flaming_cloth":"\u70c8\u7130\u7ec7\u7269","/items/sorcerers_sole":"\u9b54\u6cd5\u5e08\u978b\u5e95","/items/chrono_sphere":"\u65f6\u7a7a\u7403","/items/frost_sphere":"\u51b0\u971c\u7403","/items/panda_fluff":"\u718a\u732b\u7ed2","/items/black_bear_fluff":"\u9ed1\u718a\u7ed2","/items/grizzly_bear_fluff":"\u68d5\u718a\u7ed2","/items/polar_bear_fluff":"\u5317\u6781\u718a\u7ed2","/items/red_panda_fluff":"\u5c0f\u718a\u732b\u7ed2","/items/magnet":"\u78c1\u94c1","/items/stalactite_shard":"\u949f\u4e73\u77f3\u788e\u7247","/items/living_granite":"\u82b1\u5c97\u5ca9","/items/colossus_core":"\u5de8\u50cf\u6838\u5fc3","/items/vampire_fang":"\u5438\u8840\u9b3c\u4e4b\u7259","/items/werewolf_claw":"\u72fc\u4eba\u4e4b\u722a","/items/revenant_anima":"\u4ea1\u8005\u4e4b\u9b42","/items/soul_fragment":"\u7075\u9b42\u788e\u7247","/items/infernal_ember":"\u5730\u72f1\u4f59\u70ec","/items/demonic_core":"\u6076\u9b54\u6838\u5fc3","/items/griffin_leather":"\u72ee\u9e6b\u4e4b\u76ae","/items/manticore_sting":"\u874e\u72ee\u4e4b\u523a","/items/jackalope_antler":"\u9e7f\u89d2\u5154\u4e4b\u89d2","/items/dodocamel_plume":"\u6e21\u6e21\u9a7c\u4e4b\u7fce","/items/griffin_talon":"\u72ee\u9e6b\u4e4b\u722a","/items/chimerical_refinement_shard":"\u5947\u5e7b\u7cbe\u70bc\u788e\u7247","/items/acrobats_ribbon":"\u6742\u6280\u5e08\u5f69\u5e26","/items/magicians_cloth":"\u9b54\u672f\u5e08\u7ec7\u7269","/items/chaotic_chain":"\u6df7\u6c8c\u9501\u94fe","/items/cursed_ball":"\u8bc5\u5492\u4e4b\u7403","/items/sinister_refinement_shard":"\u9634\u68ee\u7cbe\u70bc\u788e\u7247","/items/royal_cloth":"\u7687\u5bb6\u7ec7\u7269","/items/knights_ingot":"\u9a91\u58eb\u4e4b\u952d","/items/bishops_scroll":"\u4e3b\u6559\u5377\u8f74","/items/regal_jewel":"\u541b\u738b\u5b9d\u77f3","/items/sundering_jewel":"\u88c2\u7a7a\u5b9d\u77f3","/items/enchanted_refinement_shard":"\u79d8\u6cd5\u7cbe\u70bc\u788e\u7247","/items/marksman_brooch":"\u795e\u5c04\u80f8\u9488","/items/corsair_crest":"\u63a0\u593a\u8005\u5fbd\u7ae0","/items/damaged_anchor":"\u7834\u635f\u8239\u951a","/items/maelstrom_plating":"\u6012\u6d9b\u7532\u7247","/items/kraken_leather":"\u514b\u62c9\u80af\u76ae\u9769","/items/kraken_fang":"\u514b\u62c9\u80af\u4e4b\u7259","/items/pirate_refinement_shard":"\u6d77\u76d7\u7cbe\u70bc\u788e\u7247","/items/pathbreaker_lodestone":"\u5f00\u8def\u8005\u78c1\u77f3","/items/pathfinder_lodestone":"\u63a2\u8def\u8005\u78c1\u77f3","/items/pathseeker_lodestone":"\u5bfb\u8def\u8005\u78c1\u77f3","/items/labyrinth_refinement_shard":"\u8ff7\u5bab\u7cbe\u70bc\u788e\u7247","/items/butter_of_proficiency":"\u7cbe\u901a\u4e4b\u6cb9","/items/thread_of_expertise":"\u4e13\u7cbe\u4e4b\u7ebf","/items/branch_of_insight":"\u6d1e\u5bdf\u4e4b\u679d","/items/gluttonous_energy":"\u8d2a\u98df\u80fd\u91cf","/items/guzzling_energy":"\u66b4\u996e\u80fd\u91cf","/items/milking_essence":"\u6324\u5976\u7cbe\u534e","/items/foraging_essence":"\u91c7\u6458\u7cbe\u534e","/items/woodcutting_essence":"\u4f10\u6728\u7cbe\u534e","/items/cheesesmithing_essence":"\u5976\u916a\u953b\u9020\u7cbe\u534e","/items/crafting_essence":"\u5236\u4f5c\u7cbe\u534e","/items/tailoring_essence":"\u7f1d\u7eab\u7cbe\u534e","/items/cooking_essence":"\u70f9\u996a\u7cbe\u534e","/items/brewing_essence":"\u51b2\u6ce1\u7cbe\u534e","/items/alchemy_essence":"\u70bc\u91d1\u7cbe\u534e","/items/enhancing_essence":"\u5f3a\u5316\u7cbe\u534e","/items/swamp_essence":"\u6cbc\u6cfd\u7cbe\u534e","/items/aqua_essence":"\u6d77\u6d0b\u7cbe\u534e","/items/jungle_essence":"\u4e1b\u6797\u7cbe\u534e","/items/gobo_essence":"\u54e5\u5e03\u6797\u7cbe\u534e","/items/eyessence":"\u773c\u7cbe\u534e","/items/sorcerer_essence":"\u6cd5\u5e08\u7cbe\u534e","/items/bear_essence":"\u718a\u718a\u7cbe\u534e","/items/golem_essence":"\u9b54\u50cf\u7cbe\u534e","/items/twilight_essence":"\u66ae\u5149\u7cbe\u534e","/items/abyssal_essence":"\u5730\u72f1\u7cbe\u534e","/items/chimerical_essence":"\u5947\u5e7b\u7cbe\u534e","/items/sinister_essence":"\u9634\u68ee\u7cbe\u534e","/items/enchanted_essence":"\u79d8\u6cd5\u7cbe\u534e","/items/pirate_essence":"\u6d77\u76d7\u7cbe\u534e","/items/labyrinth_essence":"\u8ff7\u5bab\u7cbe\u534e","/items/task_crystal":"\u4efb\u52a1\u6c34\u6676","/items/star_fragment":"\u661f\u5149\u788e\u7247","/items/pearl":"\u73cd\u73e0","/items/amber":"\u7425\u73c0","/items/garnet":"\u77f3\u69b4\u77f3","/items/jade":"\u7fe1\u7fe0","/items/amethyst":"\u7d2b\u6c34\u6676","/items/moonstone":"\u6708\u4eae\u77f3","/items/sunstone":"\u592a\u9633\u77f3","/items/philosophers_stone":"\u8d24\u8005\u4e4b\u77f3","/items/crushed_pearl":"\u73cd\u73e0\u788e\u7247","/items/crushed_amber":"\u7425\u73c0\u788e\u7247","/items/crushed_garnet":"\u77f3\u69b4\u77f3\u788e\u7247","/items/crushed_jade":"\u7fe1\u7fe0\u788e\u7247","/items/crushed_amethyst":"\u7d2b\u6c34\u6676\u788e\u7247","/items/crushed_moonstone":"\u6708\u4eae\u77f3\u788e\u7247","/items/crushed_sunstone":"\u592a\u9633\u77f3\u788e\u7247","/items/crushed_philosophers_stone":"\u8d24\u8005\u4e4b\u77f3\u788e\u7247","/items/shard_of_protection":"\u4fdd\u62a4\u788e\u7247","/items/mirror_of_protection":"\u4fdd\u62a4\u4e4b\u955c","/items/philosophers_mirror":"\u8d24\u8005\u4e4b\u955c","/items/basic_torch":"\u57fa\u7840\u706b\u628a","/items/advanced_torch":"\u8fdb\u9636\u706b\u628a","/items/expert_torch":"\u4e13\u5bb6\u706b\u628a","/items/basic_shroud":"\u57fa\u7840\u6597\u7bf7","/items/advanced_shroud":"\u8fdb\u9636\u6597\u7bf7","/items/expert_shroud":"\u4e13\u5bb6\u6597\u7bf7","/items/basic_beacon":"\u57fa\u7840\u63a2\u7167\u706f","/items/advanced_beacon":"\u8fdb\u9636\u63a2\u7167\u706f","/items/expert_beacon":"\u4e13\u5bb6\u63a2\u7167\u706f","/items/basic_food_crate":"\u57fa\u7840\u98df\u7269\u7bb1","/items/advanced_food_crate":"\u8fdb\u9636\u98df\u7269\u7bb1","/items/expert_food_crate":"\u4e13\u5bb6\u98df\u7269\u7bb1","/items/basic_tea_crate":"\u57fa\u7840\u8336\u53f6\u7bb1","/items/advanced_tea_crate":"\u8fdb\u9636\u8336\u53f6\u7bb1","/items/expert_tea_crate":"\u4e13\u5bb6\u8336\u53f6\u7bb1","/items/basic_coffee_crate":"\u57fa\u7840\u5496\u5561\u7bb1","/items/advanced_coffee_crate":"\u8fdb\u9636\u5496\u5561\u7bb1","/items/expert_coffee_crate":"\u4e13\u5bb6\u5496\u5561\u7bb1"},itemDescriptions:{"/items/coin":"\u57fa\u7840\u8d27\u5e01","/items/task_token":"\u4efb\u52a1\u4ee3\u5e01\u3002\u53ef\u5728\u4efb\u52a1\u5546\u5e97\u4e2d\u4f7f\u7528\u8fd9\u4e9b\u4ee3\u5e01","/items/labyrinth_token":"\u5b8c\u6210\u8ff7\u5bab\u697c\u5c42\u83b7\u5f97\u7684\u8d27\u5e01\u3002\u53ef\u5728\u8ff7\u5bab\u5546\u5e97\u4e2d\u4f7f\u7528","/items/chimerical_token":"\u6765\u81ea\u3010\u5947\u5e7b\u6d1e\u7a74\u3011\u7684\u5730\u4e0b\u57ce\u4ee3\u5e01\u3002\u53ef\u4ee5\u5728\u5730\u4e0b\u57ce\u5546\u5e97\u91cc\u6d88\u8d39","/items/sinister_token":"\u6765\u81ea\u3010\u9634\u68ee\u9a6c\u620f\u56e2\u3011\u7684\u5730\u4e0b\u57ce\u4ee3\u5e01\u3002\u53ef\u4ee5\u5728\u5730\u4e0b\u57ce\u5546\u5e97\u91cc\u6d88\u8d39","/items/enchanted_token":"\u6765\u81ea\u3010\u79d8\u6cd5\u8981\u585e\u3011\u7684\u5730\u4e0b\u57ce\u4ee3\u5e01\u3002\u53ef\u4ee5\u5728\u5730\u4e0b\u57ce\u5546\u5e97\u91cc\u6d88\u8d39","/items/pirate_token":"\u6765\u81ea\u3010\u6d77\u76d7\u57fa\u5730\u3011\u7684\u5730\u4e0b\u57ce\u4ee3\u5e01\u3002\u53ef\u4ee5\u5728\u5730\u4e0b\u57ce\u5546\u5e97\u91cc\u6d88\u8d39","/items/cowbell":"\u9ad8\u7ea7\u8d27\u5e01\u3002\u53ef\u5728\u725b\u94c3\u5546\u5e97\u8d2d\u4e70\u6216\u4f7f\u7528\u8fd9\u4e9b\u8d27\u5e01","/items/bag_of_10_cowbells":"\u53ef\u4ea4\u6613\u7684\u4e00\u888b\u725b\u94c3\uff0c\u6bcf\u888b\u5305\u542b10\u4e2a\u725b\u94c3\u3002\u53ea\u80fd\u6574\u888b\u4ea4\u6613\uff0c\u4e00\u65e6\u6253\u5f00\u5c06\u65e0\u6cd5\u51fa\u552e","/items/purples_gift":"\u83b7\u5f97\u4efb\u52a1\u79ef\u5206\u540e\u5c0f\u7d2b\u725b\u8d60\u9001\u7684\u793c\u7269\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/small_meteorite_cache":"\u5728\u91c7\u96c6\u65f6\u53ef\u4ee5\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/medium_meteorite_cache":"\u5728\u91c7\u96c6\u65f6\u53ef\u4ee5\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/large_meteorite_cache":"\u5728\u91c7\u96c6\u65f6\u53ef\u4ee5\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/small_artisans_crate":"\u5728\u751f\u4ea7\u65f6\u53ef\u4ee5\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/medium_artisans_crate":"\u5728\u751f\u4ea7\u65f6\u53ef\u4ee5\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/large_artisans_crate":"\u5728\u751f\u4ea7\u65f6\u53ef\u4ee5\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/small_treasure_chest":"\u53ef\u4ee5\u4ece\u602a\u7269\u8eab\u4e0a\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/medium_treasure_chest":"\u53ef\u4ee5\u4ece\u602a\u7269\u8eab\u4e0a\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/large_treasure_chest":"\u53ef\u4ee5\u4ece\u602a\u7269\u8eab\u4e0a\u627e\u5230\uff0c\u770b\u8d77\u6765\u91cc\u9762\u88c5\u7740\u7269\u54c1\uff01","/items/chimerical_chest":"\u653b\u514b\u3010\u5947\u5e7b\u6d1e\u7a74\u3011\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/chimerical_refinement_chest":"\u653b\u514b\u3010\u5947\u5e7b\u6d1e\u7a74\u3011(T1+) \u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/sinister_chest":"\u653b\u514b\u3010\u9634\u68ee\u9a6c\u620f\u56e2\u3011\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/sinister_refinement_chest":"\u653b\u514b\u3010\u9634\u68ee\u9a6c\u620f\u56e2\u3011(T1+)\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/enchanted_chest":"\u653b\u514b\u3010\u79d8\u6cd5\u8981\u585e\u3011\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/enchanted_refinement_chest":"\u653b\u514b\u3010\u79d8\u6cd5\u8981\u585e\u3011(T1+)\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/pirate_chest":"\u653b\u514b\u3010\u6d77\u76d7\u57fa\u5730\u3011\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u6d77\u76d7\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/pirate_refinement_chest":"\u653b\u514b\u3010\u6d77\u76d7\u57fa\u5730\u3011(T1+)\u540e\u7684\u5956\u52b1\uff0c\u53ef\u4ee5\u7528\u3010\u6d77\u76d7\u5b9d\u7bb1\u94a5\u5319\u3011\u6253\u5f00","/items/purdoras_box_skilling":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u5305\u542b\u751f\u6d3b\u76f8\u5173\u5956\u52b1\u3002","/items/purdoras_box_combat":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u5305\u542b\u6218\u6597\u76f8\u5173\u5956\u52b1\u3002","/items/labyrinth_refinement_chest":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u5305\u542b\u7cbe\u70bc\u6750\u6599\u3002","/items/seal_of_gathering":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_gourmet":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_processing":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_efficiency":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_action_speed":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_combat_drop":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_attack_speed":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_cast_speed":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_damage":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_critical_rate":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_wisdom":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/seal_of_rare_find":"\u4ece\u8ff7\u5bab\u83b7\u5f97\u3002\u6253\u5f00\u540e\u83b7\u5f9730\u5206\u949f\u589e\u76ca\u3002","/items/blue_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/green_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/purple_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/white_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/orange_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/brown_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/stone_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/dark_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/burning_key_fragment":"\u770b\u8d77\u6765\u662f\u67d0\u79cd\u94a5\u5319\u7684\u788e\u7247\uff0c\u7528\u6765\u5236\u4f5c\u5730\u4e0b\u57ce\u94a5\u5319","/items/chimerical_entry_key":"\u5141\u8bb8\u8fdb\u5165\u5730\u4e0b\u57ce\u3010\u5947\u5e7b\u6d1e\u7a74\u30111\u6b21","/items/chimerical_chest_key":"\u5f00\u542f\u4e00\u4e2a\u5947\u5e7b\u5b9d\u7bb1","/items/sinister_entry_key":"\u5141\u8bb8\u8fdb\u5165\u5730\u4e0b\u57ce\u3010\u9634\u68ee\u9a6c\u620f\u56e2\u30111\u6b21","/items/sinister_chest_key":"\u5f00\u542f\u4e00\u4e2a\u9634\u68ee\u5b9d\u7bb1","/items/enchanted_entry_key":"\u5141\u8bb8\u8fdb\u5165\u5730\u4e0b\u57ce\u3010\u79d8\u6cd5\u8981\u585e\u30111\u6b21","/items/enchanted_chest_key":"\u5f00\u542f\u4e00\u4e2a\u79d8\u6cd5\u5b9d\u7bb1","/items/pirate_entry_key":"\u5141\u8bb8\u8fdb\u5165\u5730\u4e0b\u57ce\u3010\u6d77\u76d7\u57fa\u5730\u30111\u6b21","/items/pirate_chest_key":"\u5f00\u542f\u4e00\u4e2a\u6d77\u76d7\u5b9d\u7bb1","/items/donut":"","/items/blueberry_donut":"","/items/blackberry_donut":"","/items/strawberry_donut":"","/items/mooberry_donut":"","/items/marsberry_donut":"","/items/spaceberry_donut":"","/items/cupcake":"","/items/blueberry_cake":"","/items/blackberry_cake":"","/items/strawberry_cake":"","/items/mooberry_cake":"","/items/marsberry_cake":"","/items/spaceberry_cake":"","/items/gummy":"","/items/apple_gummy":"","/items/orange_gummy":"","/items/plum_gummy":"","/items/peach_gummy":"","/items/dragon_fruit_gummy":"","/items/star_fruit_gummy":"","/items/yogurt":"","/items/apple_yogurt":"","/items/orange_yogurt":"","/items/plum_yogurt":"","/items/peach_yogurt":"","/items/dragon_fruit_yogurt":"","/items/star_fruit_yogurt":"","/items/milking_tea":"","/items/foraging_tea":"","/items/woodcutting_tea":"","/items/cooking_tea":"","/items/brewing_tea":"","/items/alchemy_tea":"","/items/enhancing_tea":"","/items/cheesesmithing_tea":"","/items/crafting_tea":"","/items/tailoring_tea":"","/items/super_milking_tea":"","/items/super_foraging_tea":"","/items/super_woodcutting_tea":"","/items/super_cooking_tea":"","/items/super_brewing_tea":"","/items/super_alchemy_tea":"","/items/super_enhancing_tea":"","/items/super_cheesesmithing_tea":"","/items/super_crafting_tea":"","/items/super_tailoring_tea":"","/items/ultra_milking_tea":"","/items/ultra_foraging_tea":"","/items/ultra_woodcutting_tea":"","/items/ultra_cooking_tea":"","/items/ultra_brewing_tea":"","/items/ultra_alchemy_tea":"","/items/ultra_enhancing_tea":"","/items/ultra_cheesesmithing_tea":"","/items/ultra_crafting_tea":"","/items/ultra_tailoring_tea":"","/items/gathering_tea":"","/items/gourmet_tea":"","/items/wisdom_tea":"","/items/processing_tea":"","/items/efficiency_tea":"","/items/artisan_tea":"","/items/catalytic_tea":"","/items/blessed_tea":"","/items/stamina_coffee":"","/items/intelligence_coffee":"","/items/defense_coffee":"","/items/attack_coffee":"","/items/melee_coffee":"","/items/ranged_coffee":"","/items/magic_coffee":"","/items/super_stamina_coffee":"","/items/super_intelligence_coffee":"","/items/super_defense_coffee":"","/items/super_attack_coffee":"","/items/super_melee_coffee":"","/items/super_ranged_coffee":"","/items/super_magic_coffee":"","/items/ultra_stamina_coffee":"","/items/ultra_intelligence_coffee":"","/items/ultra_defense_coffee":"","/items/ultra_attack_coffee":"","/items/ultra_melee_coffee":"","/items/ultra_ranged_coffee":"","/items/ultra_magic_coffee":"","/items/wisdom_coffee":"","/items/lucky_coffee":"","/items/swiftness_coffee":"","/items/channeling_coffee":"","/items/critical_coffee":"","/items/poke":"","/items/impale":"","/items/puncture":"","/items/penetrating_strike":"","/items/scratch":"","/items/cleave":"","/items/maim":"","/items/crippling_slash":"","/items/smack":"","/items/sweep":"","/items/stunning_blow":"","/items/fracturing_impact":"","/items/shield_bash":"","/items/quick_shot":"","/items/aqua_arrow":"","/items/flame_arrow":"","/items/rain_of_arrows":"","/items/silencing_shot":"","/items/steady_shot":"","/items/pestilent_shot":"","/items/penetrating_shot":"","/items/water_strike":"","/items/ice_spear":"","/items/frost_surge":"","/items/mana_spring":"","/items/entangle":"","/items/toxic_pollen":"","/items/natures_veil":"","/items/life_drain":"","/items/fireball":"","/items/flame_blast":"","/items/firestorm":"","/items/smoke_burst":"","/items/minor_heal":"","/items/heal":"","/items/quick_aid":"","/items/rejuvenate":"","/items/taunt":"","/items/provoke":"","/items/toughness":"","/items/elusiveness":"","/items/precision":"","/items/berserk":"","/items/elemental_affinity":"","/items/frenzy":"","/items/spike_shell":"","/items/retribution":"","/items/vampirism":"","/items/revive":"","/items/insanity":"","/items/invincible":"","/items/speed_aura":"","/items/guardian_aura":"","/items/fierce_aura":"","/items/critical_aura":"","/items/mystic_aura":"","/items/gobo_stabber":"","/items/gobo_slasher":"","/items/gobo_smasher":"","/items/spiked_bulwark":"","/items/werewolf_slasher":"","/items/griffin_bulwark":"","/items/griffin_bulwark_refined":"","/items/gobo_shooter":"","/items/vampiric_bow":"","/items/cursed_bow":"","/items/cursed_bow_refined":"","/items/gobo_boomstick":"","/items/cheese_bulwark":"","/items/verdant_bulwark":"","/items/azure_bulwark":"","/items/burble_bulwark":"","/items/crimson_bulwark":"","/items/rainbow_bulwark":"","/items/holy_bulwark":"","/items/wooden_bow":"","/items/birch_bow":"","/items/cedar_bow":"","/items/purpleheart_bow":"","/items/ginkgo_bow":"","/items/redwood_bow":"","/items/arcane_bow":"","/items/stalactite_spear":"","/items/granite_bludgeon":"","/items/furious_spear":"","/items/furious_spear_refined":"","/items/regal_sword":"","/items/regal_sword_refined":"","/items/chaotic_flail":"","/items/chaotic_flail_refined":"","/items/soul_hunter_crossbow":"","/items/sundering_crossbow":"","/items/sundering_crossbow_refined":"","/items/frost_staff":"","/items/infernal_battlestaff":"","/items/jackalope_staff":"","/items/rippling_trident":"","/items/rippling_trident_refined":"","/items/blooming_trident":"","/items/blooming_trident_refined":"","/items/blazing_trident":"","/items/blazing_trident_refined":"","/items/cheese_sword":"","/items/verdant_sword":"","/items/azure_sword":"","/items/burble_sword":"","/items/crimson_sword":"","/items/rainbow_sword":"","/items/holy_sword":"","/items/cheese_spear":"","/items/verdant_spear":"","/items/azure_spear":"","/items/burble_spear":"","/items/crimson_spear":"","/items/rainbow_spear":"","/items/holy_spear":"","/items/cheese_mace":"","/items/verdant_mace":"","/items/azure_mace":"","/items/burble_mace":"","/items/crimson_mace":"","/items/rainbow_mace":"","/items/holy_mace":"","/items/wooden_crossbow":"","/items/birch_crossbow":"","/items/cedar_crossbow":"","/items/purpleheart_crossbow":"","/items/ginkgo_crossbow":"","/items/redwood_crossbow":"","/items/arcane_crossbow":"","/items/wooden_water_staff":"","/items/birch_water_staff":"","/items/cedar_water_staff":"","/items/purpleheart_water_staff":"","/items/ginkgo_water_staff":"","/items/redwood_water_staff":"","/items/arcane_water_staff":"","/items/wooden_nature_staff":"","/items/birch_nature_staff":"","/items/cedar_nature_staff":"","/items/purpleheart_nature_staff":"","/items/ginkgo_nature_staff":"","/items/redwood_nature_staff":"","/items/arcane_nature_staff":"","/items/wooden_fire_staff":"","/items/birch_fire_staff":"","/items/cedar_fire_staff":"","/items/purpleheart_fire_staff":"","/items/ginkgo_fire_staff":"","/items/redwood_fire_staff":"","/items/arcane_fire_staff":"","/items/eye_watch":"","/items/snake_fang_dirk":"","/items/vision_shield":"","/items/gobo_defender":"","/items/vampire_fang_dirk":"","/items/knights_aegis":"","/items/knights_aegis_refined":"","/items/treant_shield":"","/items/manticore_shield":"","/items/tome_of_healing":"","/items/tome_of_the_elements":"","/items/watchful_relic":"","/items/bishops_codex":"","/items/bishops_codex_refined":"","/items/cheese_buckler":"","/items/verdant_buckler":"","/items/azure_buckler":"","/items/burble_buckler":"","/items/crimson_buckler":"","/items/rainbow_buckler":"","/items/holy_buckler":"","/items/wooden_shield":"","/items/birch_shield":"","/items/cedar_shield":"","/items/purpleheart_shield":"","/items/ginkgo_shield":"","/items/redwood_shield":"","/items/arcane_shield":"","/items/gatherer_cape":"","/items/gatherer_cape_refined":"","/items/artificer_cape":"","/items/artificer_cape_refined":"","/items/culinary_cape":"","/items/culinary_cape_refined":"","/items/chance_cape":"","/items/chance_cape_refined":"","/items/sinister_cape":"","/items/sinister_cape_refined":"","/items/chimerical_quiver":"","/items/chimerical_quiver_refined":"","/items/enchanted_cloak":"","/items/enchanted_cloak_refined":"","/items/red_culinary_hat":"","/items/snail_shell_helmet":"","/items/vision_helmet":"","/items/fluffy_red_hat":"","/items/corsair_helmet":"","/items/corsair_helmet_refined":"","/items/acrobatic_hood":"","/items/acrobatic_hood_refined":"","/items/magicians_hat":"","/items/magicians_hat_refined":"","/items/cheese_helmet":"","/items/verdant_helmet":"","/items/azure_helmet":"","/items/burble_helmet":"","/items/crimson_helmet":"","/items/rainbow_helmet":"","/items/holy_helmet":"","/items/rough_hood":"","/items/reptile_hood":"","/items/gobo_hood":"","/items/beast_hood":"","/items/umbral_hood":"","/items/cotton_hat":"","/items/linen_hat":"","/items/bamboo_hat":"","/items/silk_hat":"","/items/radiant_hat":"","/items/dairyhands_top":"","/items/foragers_top":"","/items/lumberjacks_top":"","/items/cheesemakers_top":"","/items/crafters_top":"","/items/tailors_top":"","/items/chefs_top":"","/items/brewers_top":"","/items/alchemists_top":"","/items/enhancers_top":"","/items/gator_vest":"","/items/turtle_shell_body":"","/items/colossus_plate_body":"","/items/demonic_plate_body":"","/items/anchorbound_plate_body":"","/items/anchorbound_plate_body_refined":"","/items/maelstrom_plate_body":"","/items/maelstrom_plate_body_refined":"","/items/marine_tunic":"","/items/revenant_tunic":"","/items/griffin_tunic":"","/items/kraken_tunic":"","/items/kraken_tunic_refined":"","/items/icy_robe_top":"","/items/flaming_robe_top":"","/items/luna_robe_top":"","/items/royal_water_robe_top":"","/items/royal_water_robe_top_refined":"","/items/royal_nature_robe_top":"","/items/royal_nature_robe_top_refined":"","/items/royal_fire_robe_top":"","/items/royal_fire_robe_top_refined":"","/items/cheese_plate_body":"","/items/verdant_plate_body":"","/items/azure_plate_body":"","/items/burble_plate_body":"","/items/crimson_plate_body":"","/items/rainbow_plate_body":"","/items/holy_plate_body":"","/items/rough_tunic":"","/items/reptile_tunic":"","/items/gobo_tunic":"","/items/beast_tunic":"","/items/umbral_tunic":"","/items/cotton_robe_top":"","/items/linen_robe_top":"","/items/bamboo_robe_top":"","/items/silk_robe_top":"","/items/radiant_robe_top":"","/items/dairyhands_bottoms":"","/items/foragers_bottoms":"","/items/lumberjacks_bottoms":"","/items/cheesemakers_bottoms":"","/items/crafters_bottoms":"","/items/tailors_bottoms":"","/items/chefs_bottoms":"","/items/brewers_bottoms":"","/items/alchemists_bottoms":"","/items/enhancers_bottoms":"","/items/turtle_shell_legs":"","/items/colossus_plate_legs":"","/items/demonic_plate_legs":"","/items/anchorbound_plate_legs":"","/items/anchorbound_plate_legs_refined":"","/items/maelstrom_plate_legs":"","/items/maelstrom_plate_legs_refined":"","/items/marine_chaps":"","/items/revenant_chaps":"","/items/griffin_chaps":"","/items/kraken_chaps":"","/items/kraken_chaps_refined":"","/items/icy_robe_bottoms":"","/items/flaming_robe_bottoms":"","/items/luna_robe_bottoms":"","/items/royal_water_robe_bottoms":"","/items/royal_water_robe_bottoms_refined":"","/items/royal_nature_robe_bottoms":"","/items/royal_nature_robe_bottoms_refined":"","/items/royal_fire_robe_bottoms":"","/items/royal_fire_robe_bottoms_refined":"","/items/cheese_plate_legs":"","/items/verdant_plate_legs":"","/items/azure_plate_legs":"","/items/burble_plate_legs":"","/items/crimson_plate_legs":"","/items/rainbow_plate_legs":"","/items/holy_plate_legs":"","/items/rough_chaps":"","/items/reptile_chaps":"","/items/gobo_chaps":"","/items/beast_chaps":"","/items/umbral_chaps":"","/items/cotton_robe_bottoms":"","/items/linen_robe_bottoms":"","/items/bamboo_robe_bottoms":"","/items/silk_robe_bottoms":"","/items/radiant_robe_bottoms":"","/items/enchanted_gloves":"","/items/pincer_gloves":"","/items/panda_gloves":"","/items/magnetic_gloves":"","/items/dodocamel_gauntlets":"","/items/dodocamel_gauntlets_refined":"","/items/sighted_bracers":"","/items/marksman_bracers":"","/items/marksman_bracers_refined":"","/items/chrono_gloves":"","/items/cheese_gauntlets":"","/items/verdant_gauntlets":"","/items/azure_gauntlets":"","/items/burble_gauntlets":"","/items/crimson_gauntlets":"","/items/rainbow_gauntlets":"","/items/holy_gauntlets":"","/items/rough_bracers":"","/items/reptile_bracers":"","/items/gobo_bracers":"","/items/beast_bracers":"","/items/umbral_bracers":"","/items/cotton_gloves":"","/items/linen_gloves":"","/items/bamboo_gloves":"","/items/silk_gloves":"","/items/radiant_gloves":"","/items/collectors_boots":"","/items/shoebill_shoes":"","/items/black_bear_shoes":"","/items/grizzly_bear_shoes":"","/items/polar_bear_shoes":"","/items/pathbreaker_boots":"","/items/pathbreaker_boots_refined":"","/items/centaur_boots":"","/items/pathfinder_boots":"","/items/pathfinder_boots_refined":"","/items/sorcerer_boots":"","/items/pathseeker_boots":"","/items/pathseeker_boots_refined":"","/items/cheese_boots":"","/items/verdant_boots":"","/items/azure_boots":"","/items/burble_boots":"","/items/crimson_boots":"","/items/rainbow_boots":"","/items/holy_boots":"","/items/rough_boots":"","/items/reptile_boots":"","/items/gobo_boots":"","/items/beast_boots":"","/items/umbral_boots":"","/items/cotton_boots":"","/items/linen_boots":"","/items/bamboo_boots":"","/items/silk_boots":"","/items/radiant_boots":"","/items/small_pouch":"","/items/medium_pouch":"","/items/large_pouch":"","/items/giant_pouch":"","/items/gluttonous_pouch":"","/items/guzzling_pouch":"","/items/necklace_of_efficiency":"","/items/fighter_necklace":"","/items/ranger_necklace":"","/items/wizard_necklace":"","/items/necklace_of_wisdom":"","/items/necklace_of_speed":"","/items/philosophers_necklace":"","/items/earrings_of_gathering":"","/items/earrings_of_essence_find":"","/items/earrings_of_armor":"","/items/earrings_of_regeneration":"","/items/earrings_of_resistance":"","/items/earrings_of_rare_find":"","/items/earrings_of_critical_strike":"","/items/philosophers_earrings":"","/items/ring_of_gathering":"","/items/ring_of_essence_find":"","/items/ring_of_armor":"","/items/ring_of_regeneration":"","/items/ring_of_resistance":"","/items/ring_of_rare_find":"","/items/ring_of_critical_strike":"","/items/philosophers_ring":"","/items/trainee_milking_charm":"","/items/basic_milking_charm":"","/items/advanced_milking_charm":"","/items/expert_milking_charm":"","/items/master_milking_charm":"","/items/grandmaster_milking_charm":"","/items/trainee_foraging_charm":"","/items/basic_foraging_charm":"","/items/advanced_foraging_charm":"","/items/expert_foraging_charm":"","/items/master_foraging_charm":"","/items/grandmaster_foraging_charm":"","/items/trainee_woodcutting_charm":"","/items/basic_woodcutting_charm":"","/items/advanced_woodcutting_charm":"","/items/expert_woodcutting_charm":"","/items/master_woodcutting_charm":"","/items/grandmaster_woodcutting_charm":"","/items/trainee_cheesesmithing_charm":"","/items/basic_cheesesmithing_charm":"","/items/advanced_cheesesmithing_charm":"","/items/expert_cheesesmithing_charm":"","/items/master_cheesesmithing_charm":"","/items/grandmaster_cheesesmithing_charm":"","/items/trainee_crafting_charm":"","/items/basic_crafting_charm":"","/items/advanced_crafting_charm":"","/items/expert_crafting_charm":"","/items/master_crafting_charm":"","/items/grandmaster_crafting_charm":"","/items/trainee_tailoring_charm":"","/items/basic_tailoring_charm":"","/items/advanced_tailoring_charm":"","/items/expert_tailoring_charm":"","/items/master_tailoring_charm":"","/items/grandmaster_tailoring_charm":"","/items/trainee_cooking_charm":"","/items/basic_cooking_charm":"","/items/advanced_cooking_charm":"","/items/expert_cooking_charm":"","/items/master_cooking_charm":"","/items/grandmaster_cooking_charm":"","/items/trainee_brewing_charm":"","/items/basic_brewing_charm":"","/items/advanced_brewing_charm":"","/items/expert_brewing_charm":"","/items/master_brewing_charm":"","/items/grandmaster_brewing_charm":"","/items/trainee_alchemy_charm":"","/items/basic_alchemy_charm":"","/items/advanced_alchemy_charm":"","/items/expert_alchemy_charm":"","/items/master_alchemy_charm":"","/items/grandmaster_alchemy_charm":"","/items/trainee_enhancing_charm":"","/items/basic_enhancing_charm":"","/items/advanced_enhancing_charm":"","/items/expert_enhancing_charm":"","/items/master_enhancing_charm":"","/items/grandmaster_enhancing_charm":"","/items/trainee_stamina_charm":"","/items/basic_stamina_charm":"","/items/advanced_stamina_charm":"","/items/expert_stamina_charm":"","/items/master_stamina_charm":"","/items/grandmaster_stamina_charm":"","/items/trainee_intelligence_charm":"","/items/basic_intelligence_charm":"","/items/advanced_intelligence_charm":"","/items/expert_intelligence_charm":"","/items/master_intelligence_charm":"","/items/grandmaster_intelligence_charm":"","/items/trainee_attack_charm":"","/items/basic_attack_charm":"","/items/advanced_attack_charm":"","/items/expert_attack_charm":"","/items/master_attack_charm":"","/items/grandmaster_attack_charm":"","/items/trainee_defense_charm":"","/items/basic_defense_charm":"","/items/advanced_defense_charm":"","/items/expert_defense_charm":"","/items/master_defense_charm":"","/items/grandmaster_defense_charm":"","/items/trainee_melee_charm":"","/items/basic_melee_charm":"","/items/advanced_melee_charm":"","/items/expert_melee_charm":"","/items/master_melee_charm":"","/items/grandmaster_melee_charm":"","/items/trainee_ranged_charm":"","/items/basic_ranged_charm":"","/items/advanced_ranged_charm":"","/items/expert_ranged_charm":"","/items/master_ranged_charm":"","/items/grandmaster_ranged_charm":"","/items/trainee_magic_charm":"","/items/basic_magic_charm":"","/items/advanced_magic_charm":"","/items/expert_magic_charm":"","/items/master_magic_charm":"","/items/grandmaster_magic_charm":"","/items/basic_task_badge":"","/items/advanced_task_badge":"","/items/expert_task_badge":"","/items/celestial_brush":"","/items/cheese_brush":"","/items/verdant_brush":"","/items/azure_brush":"","/items/burble_brush":"","/items/crimson_brush":"","/items/rainbow_brush":"","/items/holy_brush":"","/items/celestial_shears":"","/items/cheese_shears":"","/items/verdant_shears":"","/items/azure_shears":"","/items/burble_shears":"","/items/crimson_shears":"","/items/rainbow_shears":"","/items/holy_shears":"","/items/celestial_hatchet":"","/items/cheese_hatchet":"","/items/verdant_hatchet":"","/items/azure_hatchet":"","/items/burble_hatchet":"","/items/crimson_hatchet":"","/items/rainbow_hatchet":"","/items/holy_hatchet":"","/items/celestial_hammer":"","/items/cheese_hammer":"","/items/verdant_hammer":"","/items/azure_hammer":"","/items/burble_hammer":"","/items/crimson_hammer":"","/items/rainbow_hammer":"","/items/holy_hammer":"","/items/celestial_chisel":"","/items/cheese_chisel":"","/items/verdant_chisel":"","/items/azure_chisel":"","/items/burble_chisel":"","/items/crimson_chisel":"","/items/rainbow_chisel":"","/items/holy_chisel":"","/items/celestial_needle":"","/items/cheese_needle":"","/items/verdant_needle":"","/items/azure_needle":"","/items/burble_needle":"","/items/crimson_needle":"","/items/rainbow_needle":"","/items/holy_needle":"","/items/celestial_spatula":"","/items/cheese_spatula":"","/items/verdant_spatula":"","/items/azure_spatula":"","/items/burble_spatula":"","/items/crimson_spatula":"","/items/rainbow_spatula":"","/items/holy_spatula":"","/items/celestial_pot":"","/items/cheese_pot":"","/items/verdant_pot":"","/items/azure_pot":"","/items/burble_pot":"","/items/crimson_pot":"","/items/rainbow_pot":"","/items/holy_pot":"","/items/celestial_alembic":"","/items/cheese_alembic":"","/items/verdant_alembic":"","/items/azure_alembic":"","/items/burble_alembic":"","/items/crimson_alembic":"","/items/rainbow_alembic":"","/items/holy_alembic":"","/items/celestial_enhancer":"","/items/cheese_enhancer":"","/items/verdant_enhancer":"","/items/azure_enhancer":"","/items/burble_enhancer":"","/items/crimson_enhancer":"","/items/rainbow_enhancer":"","/items/holy_enhancer":"","/items/milk":"\u54de","/items/verdant_milk":"\u54de\u54de","/items/azure_milk":"\u54de\u54de\u54de","/items/burble_milk":"\u54de\u54de\u54de\u54de","/items/crimson_milk":"\u54de\u54de\u54de\u54de\u54de","/items/rainbow_milk":"\u54de\u54de\u54de\u54de\u54de\u54de","/items/holy_milk":"\u54de\u54de\u54de\u54de\u54de\u54de\u54de","/items/cheese":"","/items/verdant_cheese":"","/items/azure_cheese":"","/items/burble_cheese":"","/items/crimson_cheese":"","/items/rainbow_cheese":"","/items/holy_cheese":"","/items/log":"","/items/birch_log":"","/items/cedar_log":"","/items/purpleheart_log":"","/items/ginkgo_log":"","/items/redwood_log":"","/items/arcane_log":"","/items/lumber":"","/items/birch_lumber":"","/items/cedar_lumber":"","/items/purpleheart_lumber":"","/items/ginkgo_lumber":"","/items/redwood_lumber":"","/items/arcane_lumber":"","/items/rough_hide":"","/items/reptile_hide":"","/items/gobo_hide":"","/items/beast_hide":"","/items/umbral_hide":"","/items/rough_leather":"","/items/reptile_leather":"","/items/gobo_leather":"","/items/beast_leather":"","/items/umbral_leather":"","/items/cotton":"","/items/flax":"","/items/bamboo_branch":"","/items/cocoon":"","/items/radiant_fiber":"","/items/cotton_fabric":"","/items/linen_fabric":"","/items/bamboo_fabric":"","/items/silk_fabric":"","/items/radiant_fabric":"","/items/egg":"","/items/wheat":"","/items/sugar":"","/items/blueberry":"","/items/blackberry":"","/items/strawberry":"","/items/mooberry":"","/items/marsberry":"","/items/spaceberry":"","/items/apple":"","/items/orange":"","/items/plum":"","/items/peach":"","/items/dragon_fruit":"","/items/star_fruit":"","/items/arabica_coffee_bean":"","/items/robusta_coffee_bean":"","/items/liberica_coffee_bean":"","/items/excelsa_coffee_bean":"","/items/fieriosa_coffee_bean":"","/items/spacia_coffee_bean":"","/items/green_tea_leaf":"","/items/black_tea_leaf":"","/items/burble_tea_leaf":"","/items/moolong_tea_leaf":"","/items/red_tea_leaf":"","/items/emp_tea_leaf":"","/items/catalyst_of_coinification":"\u5728\u70bc\u91d1\u65f6\u4f7f\u7528\uff0c\u53ef\u63d0\u9ad815%\u7684\u70b9\u91d1\u6210\u529f\u7387 (\u4e58\u6cd5)\u3002\u6210\u529f\u65f6\u6d88\u8017\u4e00\u4e2a\u50ac\u5316\u5242\u3002","/items/catalyst_of_decomposition":"\u5728\u70bc\u91d1\u65f6\u4f7f\u7528\uff0c\u53ef\u5c06\u5206\u89e3\u6210\u529f\u7387\u63d0\u9ad8 15% (\u4e58\u6cd5)\u3002\u6210\u529f\u65f6\u6d88\u8017\u4e00\u4e2a\u50ac\u5316\u5242\u3002","/items/catalyst_of_transmutation":"\u5728\u70bc\u91d1\u65f6\u4f7f\u7528\uff0c\u53ef\u5c06\u8f6c\u5316\u6210\u529f\u7387\u63d0\u9ad8 15% (\u4e58\u6cd5)\u3002\u6210\u529f\u65f6\u6d88\u8017\u4e00\u4e2a\u50ac\u5316\u5242\u3002","/items/prime_catalyst":"\u5728\u70bc\u91d1\u65f6\u4f7f\u7528\uff0c\u53ef\u5c06\u4efb\u4f55\u884c\u52a8\u7684\u6210\u529f\u7387\u63d0\u9ad8 25% (\u4e58\u6cd5)\u3002\u6210\u529f\u65f6\u6d88\u8017\u4e00\u4e2a\u50ac\u5316\u5242\u3002","/items/snake_fang":"\u7528\u4e8e\u953b\u9020\u86c7\u7259\u77ed\u5251\u7684\u6750\u6599","/items/shoebill_feather":"\u7528\u4e8e\u7f1d\u7eab\u9cb8\u5934\u9e73\u978b\u7684\u6750\u6599","/items/snail_shell":"\u7528\u4e8e\u953b\u9020\u8717\u725b\u58f3\u5934\u76d4\u7684\u6750\u6599","/items/crab_pincer":"\u7528\u4e8e\u953b\u9020\u87f9\u94b3\u624b\u5957\u7684\u6750\u6599","/items/turtle_shell":"\u7528\u4e8e\u953b\u9020\u9f9f\u58f3\u80f8\u7532\u6216\u817f\u7532\u7684\u6750\u6599","/items/marine_scale":"\u7528\u4e8e\u7f1d\u7eab\u6d77\u6d0b\u76ae\u8863\u6216\u76ae\u88e4\u7684\u6750\u6599","/items/treant_bark":"\u7528\u4e8e\u5236\u4f5c\u6811\u4eba\u76fe\u7684\u6750\u6599","/items/centaur_hoof":"\u7528\u4e8e\u7f1d\u7eab\u534a\u4eba\u9a6c\u9774\u7684\u6750\u6599","/items/luna_wing":"\u7528\u4e8e\u7f1d\u7eab\u6708\u795e\u888d\u670d\u6216\u888d\u88d9\u7684\u6750\u6599","/items/gobo_rag":"\u7528\u4e8e\u7f1d\u7eab\u6536\u85cf\u5bb6\u9774\u7684\u6750\u6599","/items/goggles":"\u7528\u4e8e\u953b\u9020\u89c6\u89c9\u5934\u76d4\u7684\u6750\u6599","/items/magnifying_glass":"\u7528\u4e8e\u953b\u9020\u89c6\u89c9\u76fe\u6216\u7f1d\u7eab\u7784\u51c6\u62a4\u8155\u7684\u6750\u6599","/items/eye_of_the_watcher":"\u7528\u4e8e\u5236\u4f5c\u638c\u4e0a\u76d1\u5de5\u6216\u8b66\u6212\u9057\u7269\u7684\u6750\u6599","/items/icy_cloth":"\u7528\u4e8e\u7f1d\u7eab\u51b0\u971c\u888d\u670d\u6216\u888d\u88d9\u7684\u6750\u6599","/items/flaming_cloth":"\u7528\u4e8e\u7f1d\u7eab\u70c8\u7130\u888d\u670d\u6216\u888d\u88d9\u7684\u6750\u6599","/items/sorcerers_sole":"\u7528\u4e8e\u7f1d\u7eab\u9b54\u6cd5\u5e08\u9774\u7684\u6750\u6599","/items/chrono_sphere":"\u7528\u4e8e\u7f1d\u7eab\u9644\u9b54\u624b\u5957\u6216\u65f6\u7a7a\u624b\u5957\u7684\u6750\u6599","/items/frost_sphere":"\u7528\u4e8e\u5236\u4f5c\u51b0\u971c\u6cd5\u6756\u7684\u6750\u6599","/items/panda_fluff":"\u7528\u4e8e\u953b\u9020\u718a\u732b\u624b\u5957\u7684\u6750\u6599","/items/black_bear_fluff":"\u7528\u4e8e\u953b\u9020\u9ed1\u718a\u978b\u7684\u6750\u6599","/items/grizzly_bear_fluff":"\u7528\u4e8e\u953b\u9020\u68d5\u718a\u978b\u7684\u6750\u6599","/items/polar_bear_fluff":"\u7528\u4e8e\u953b\u9020\u5317\u6781\u718a\u978b\u7684\u6750\u6599","/items/red_panda_fluff":"\u7528\u4e8e\u7f1d\u7eab\u7ea2\u8272\u53a8\u5e08\u5e3d\u6216\u84ec\u677e\u7ea2\u5e3d\u7684\u6750\u6599","/items/magnet":"\u7528\u4e8e\u953b\u9020\u78c1\u529b\u624b\u5957\u7684\u6750\u6599","/items/stalactite_shard":"\u7528\u4e8e\u953b\u9020\u77f3\u949f\u957f\u67aa\u6216\u5c16\u523a\u91cd\u76fe\u7684\u6750\u6599","/items/living_granite":"\u7528\u4e8e\u953b\u9020\u82b1\u5c97\u5ca9\u5927\u68d2\u6216\u5c16\u523a\u91cd\u76fe\u7684\u6750\u6599","/items/colossus_core":"\u7528\u4e8e\u953b\u9020\u5de8\u50cf\u80f8\u7532\u6216\u817f\u7532\u7684\u6750\u6599","/items/vampire_fang":"\u7528\u4e8e\u953b\u9020\u5438\u8840\u9b3c\u77ed\u5251\u6216\u5236\u4f5c\u5438\u8840\u5f13\u7684\u6750\u6599","/items/werewolf_claw":"\u7528\u4e8e\u953b\u9020\u72fc\u4eba\u5173\u5200\u6216\u5236\u4f5c\u5438\u8840\u5f13\u7684\u6750\u6599","/items/revenant_anima":"\u7528\u4e8e\u7f1d\u7eab\u4ea1\u7075\u76ae\u8863\u6216\u76ae\u88e4\u7684\u6750\u6599","/items/soul_fragment":"\u7528\u4e8e\u5236\u4f5c\u7075\u9b42\u730e\u624b\u5f29\u7684\u6750\u6599","/items/infernal_ember":"\u7528\u4e8e\u5236\u4f5c\u70bc\u72f1\u6cd5\u6756\u7684\u6750\u6599","/items/demonic_core":"\u7528\u4e8e\u953b\u9020\u6076\u9b54\u80f8\u7532\u6216\u817f\u7532\u7684\u6750\u6599","/items/griffin_leather":"\u7528\u4e8e\u953b\u9020\u72ee\u9e6b\u91cd\u76fe\u8ddf\u7f1d\u7eab\u72ee\u9e6b\u76ae\u8863\u6216\u76ae\u88e4\u7684\u6750\u6599","/items/manticore_sting":"\u7528\u4e8e\u5236\u4f5c\u874e\u72ee\u76fe\u7684\u6750\u6599","/items/jackalope_antler":"\u7528\u4e8e\u5236\u4f5c\u9e7f\u89d2\u5154\u4e4b\u6756\u7684\u6750\u6599","/items/dodocamel_plume":"\u7528\u4e8e\u953b\u9020\u6e21\u6e21\u9a7c\u62a4\u624b\u7684\u6750\u6599","/items/griffin_talon":"\u7528\u4e8e\u953b\u9020\u72ee\u9e6b\u91cd\u76fe\u7684\u6750\u6599","/items/chimerical_refinement_shard":"\u7528\u4e8e\u5347\u7ea7\u3010\u5947\u5e7b\u6d1e\u7a74\u301195\u7ea7\u88c5\u5907\u548c\u5947\u5e7b\u7bad\u888b\u7684\u6750\u6599","/items/acrobats_ribbon":"\u7528\u4e8e\u7f1d\u7eab\u6742\u6280\u5e08\u515c\u5e3d\u7684\u6750\u6599","/items/magicians_cloth":"\u7528\u4e8e\u7f1d\u7eab\u9b54\u672f\u5e08\u5e3d\u7684\u6750\u6599","/items/chaotic_chain":"\u7528\u4e8e\u953b\u9020\u6df7\u6c8c\u8fde\u67b7\u7684\u6750\u6599","/items/cursed_ball":"\u7528\u4e8e\u5236\u4f5c\u5492\u6028\u4e4b\u5f13\u7684\u6750\u6599","/items/sinister_refinement_shard":"\u7528\u4e8e\u5347\u7ea7\u3010\u9634\u68ee\u9a6c\u620f\u56e2\u301195\u7ea7\u88c5\u5907\u548c\u9634\u68ee\u62ab\u98ce\u7684\u6750\u6599","/items/royal_cloth":"\u7528\u4e8e\u7f1d\u7eab\u7687\u5bb6\u888d\u670d\u548c\u7687\u5bb6\u888d\u88d9\u7684\u6750\u6599","/items/knights_ingot":"\u7528\u4e8e\u953b\u9020\u9a91\u58eb\u4e4b\u76fe\u7684\u6750\u6599","/items/bishops_scroll":"\u7528\u4e8e\u5236\u4f5c\u4e3b\u6559\u4e4b\u4e66\u7684\u6750\u6599","/items/regal_jewel":"\u7528\u4e8e\u953b\u9020\u541b\u738b\u4e4b\u5251\u548c\u72c2\u6012\u957f\u67aa\u7684\u6750\u6599","/items/sundering_jewel":"\u7528\u4e8e\u5236\u4f5c\u88c2\u7a7a\u4e4b\u5f29\u548c\u953b\u9020\u72c2\u6012\u957f\u67aa\u7684\u6750\u6599","/items/enchanted_refinement_shard":"\u7528\u4e8e\u5347\u7ea7\u3010\u79d8\u6cd5\u8981\u585e\u301195\u7ea7\u88c5\u5907\u548c\u79d8\u6cd5\u62ab\u98ce\u7684\u6750\u6599","/items/marksman_brooch":"\u7528\u4e8e\u7f1d\u7eab\u795e\u5c04\u62a4\u8155\u7684\u6750\u6599","/items/corsair_crest":"\u7528\u4e8e\u953b\u9020\u63a0\u593a\u8005\u5934\u76d4\u7684\u6750\u6599","/items/damaged_anchor":"\u7528\u4e8e\u953b\u9020\u951a\u5b9a\u80f8\u7532\u6216\u817f\u7532\u7684\u6750\u6599","/items/maelstrom_plating":"\u7528\u4e8e\u953b\u9020\u6012\u6d9b\u80f8\u7532\u6216\u817f\u7532\u7684\u6750\u6599","/items/kraken_leather":"\u7528\u4e8e\u7f1d\u7eab\u514b\u62c9\u80af\u76ae\u8863\u6216\u76ae\u88e4\u7684\u6750\u6599","/items/kraken_fang":"\u7528\u4e8e\u5236\u4f5c\u6d9f\u6f2a\u3001\u7efd\u653e\u6216\u70bd\u7130\u4e09\u53c9\u621f\u7684\u6750\u6599","/items/pirate_refinement_shard":"\u7528\u4e8e\u5347\u7ea7\u3010\u6d77\u76d7\u57fa\u5730\u301195\u7ea7\u88c5\u5907\u7684\u6750\u6599","/items/pathbreaker_lodestone":"\u7528\u4e8e\u953b\u9020\u5f00\u8def\u8005\u9774\u7684\u6750\u6599","/items/pathfinder_lodestone":"\u7528\u4e8e\u7f1d\u7eab\u63a2\u8def\u8005\u9774\u7684\u6750\u6599","/items/pathseeker_lodestone":"\u7528\u4e8e\u7f1d\u7eab\u5bfb\u8def\u8005\u9774\u7684\u6750\u6599","/items/labyrinth_refinement_shard":"\u7528\u4e8e\u5347\u7ea7\u3010\u8ff7\u5bab\u3011\u62ab\u98ce\u548c\u9774\u5b50\u7684\u6750\u6599","/items/butter_of_proficiency":"\u7528\u4e8e\u5236\u4f5c\u7279\u6b8a\u4e13\u4e1a\u5de5\u5177\u548c\u670d\u88c5\u7684\u6750\u6599","/items/thread_of_expertise":"\u7528\u4e8e\u5236\u4f5c\u7279\u6b8a\u4e13\u4e1a\u670d\u88c5\u7684\u6750\u6599","/items/branch_of_insight":"\u7528\u4e8e\u5236\u4f5c\u7279\u6b8a\u4e13\u4e1a\u5de5\u5177\u548c\u670d\u88c5\u7684\u6750\u6599","/items/gluttonous_energy":"\u7528\u4e8e\u7f1d\u7eab\u8d2a\u98df\u4e4b\u888b","/items/guzzling_energy":"\u7528\u4e8e\u7f1d\u7eab\u66b4\u996e\u4e4b\u56ca","/items/milking_essence":"\u7528\u4e8e\u51b2\u6ce1\u5976\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/foraging_essence":"\u7528\u4e8e\u51b2\u6ce1\u91c7\u6458\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/woodcutting_essence":"\u7528\u4e8e\u51b2\u6ce1\u4f10\u6728\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/cheesesmithing_essence":"\u7528\u4e8e\u51b2\u6ce1\u5976\u916a\u953b\u9020\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/crafting_essence":"\u7528\u4e8e\u51b2\u6ce1\u5236\u4f5c\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/tailoring_essence":"\u7528\u4e8e\u51b2\u6ce1\u7f1d\u7eab\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/cooking_essence":"\u7528\u4e8e\u51b2\u6ce1\u70f9\u996a\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/brewing_essence":"\u7528\u4e8e\u51b2\u6ce1\u51b2\u6ce1\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/alchemy_essence":"\u7528\u4e8e\u51b2\u6ce1\u70bc\u91d1\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/enhancing_essence":"\u7528\u4e8e\u51b2\u6ce1\u5f3a\u5316\u8336\u548c\u5236\u4f5c\u70bc\u91d1\u50ac\u5316\u5242","/items/swamp_essence":"\u7528\u4e8e\u5f3a\u5316\u6cbc\u6cfd\u661f\u7403\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/aqua_essence":"\u7528\u4e8e\u5f3a\u5316\u6d77\u6d0b\u661f\u7403\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/jungle_essence":"\u7528\u4e8e\u5f3a\u5316\u4e1b\u6797\u661f\u7403\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/gobo_essence":"\u7528\u4e8e\u5f3a\u5316\u54e5\u5e03\u6797\u661f\u7403\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/eyessence":"\u7528\u4e8e\u5f3a\u5316\u773c\u7403\u661f\u7403\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/sorcerer_essence":"\u7528\u4e8e\u5f3a\u5316\u5deb\u5e08\u4e4b\u5854\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/bear_essence":"\u7528\u4e8e\u5f3a\u5316\u718a\u718a\u661f\u7403\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/golem_essence":"\u7528\u4e8e\u5f3a\u5316\u9b54\u50cf\u6d1e\u7a74\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/twilight_essence":"\u7528\u4e8e\u5f3a\u5316\u66ae\u5149\u4e4b\u57ce\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/abyssal_essence":"\u7528\u4e8e\u5f3a\u5316\u5730\u72f1\u6df1\u6e0a\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/chimerical_essence":"\u7528\u4e8e\u5f3a\u5316\u5947\u5e7b\u6d1e\u7a74\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/sinister_essence":"\u7528\u4e8e\u5f3a\u5316\u9634\u68ee\u9a6c\u620f\u56e2\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/enchanted_essence":"\u7528\u4e8e\u5f3a\u5316\u79d8\u6cd5\u8981\u585e\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/pirate_essence":"\u7528\u4e8e\u5f3a\u5316\u6d77\u76d7\u57fa\u5730\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/labyrinth_essence":"\u7528\u4e8e\u5f3a\u5316\u8ff7\u5bab\u7279\u6b8a\u88c5\u5907\u7684\u6750\u6599","/items/task_crystal":"\u5c0f\u7d2b\u725b\u7ed9\u7684\u6c34\u6676\uff0c\u53ef\u4ee5\u7528\u6765\u5236\u4f5c\u7279\u6b8a\u7684\u9970\u54c1\u3002","/items/star_fragment":"\u5728\u9668\u77f3\u8231\u91cc\u53d1\u73b0\u7684\u788e\u7247\uff0c\u53ef\u4ee5\u7528\u6765\u5236\u4f5c\u73e0\u5b9d\u3002","/items/pearl":"\u4e00\u79cd\u95ea\u4eae\u7684\u5b9d\u77f3\uff0c\u901a\u5e38\u5728\u5b9d\u7bb1\u4e2d\u627e\u5230","/items/amber":"\u4e00\u79cd\u95ea\u4eae\u7684\u5b9d\u77f3\uff0c\u901a\u5e38\u5728\u5b9d\u7bb1\u4e2d\u627e\u5230","/items/garnet":"\u4e00\u79cd\u95ea\u4eae\u7684\u5b9d\u77f3\uff0c\u901a\u5e38\u5728\u5b9d\u7bb1\u4e2d\u627e\u5230","/items/jade":"\u4e00\u79cd\u95ea\u4eae\u7684\u5b9d\u77f3\uff0c\u901a\u5e38\u5728\u5b9d\u7bb1\u4e2d\u627e\u5230","/items/amethyst":"\u4e00\u79cd\u95ea\u4eae\u7684\u5b9d\u77f3\uff0c\u901a\u5e38\u5728\u5b9d\u7bb1\u4e2d\u627e\u5230","/items/moonstone":"\u4e00\u79cd\u95ea\u4eae\u7684\u5b9d\u77f3\uff0c\u901a\u5e38\u5728\u5b9d\u7bb1\u4e2d\u627e\u5230","/items/sunstone":"\u4e00\u79cd\u95ea\u4eae\u7684\u592a\u9633\u5f62\u72b6\u7684\u5b9d\u77f3","/items/philosophers_stone":"\u4f20\u8bf4\u4e2d\u62e5\u6709\u65e0\u7a77\u529b\u91cf\u7684\u77f3\u5934","/items/crushed_pearl":"\u66fe\u7ecf\u662f\u4e00\u7c92\u73cd\u73e0","/items/crushed_amber":"\u66fe\u7ecf\u662f\u4e00\u5757\u7425\u73c0","/items/crushed_garnet":"\u66fe\u7ecf\u662f\u4e00\u9897\u77f3\u69b4\u77f3","/items/crushed_jade":"\u66fe\u7ecf\u662f\u4e00\u5757\u7fe1\u7fe0","/items/crushed_amethyst":"\u66fe\u7ecf\u662f\u4e00\u9897\u7d2b\u6c34\u6676","/items/crushed_moonstone":"\u66fe\u7ecf\u662f\u4e00\u679a\u6708\u4eae\u77f3","/items/crushed_sunstone":"\u66fe\u7ecf\u662f\u4e00\u679a\u592a\u9633\u77f3","/items/crushed_philosophers_stone":"\u66fe\u7ecf\u662f\u4e00\u5757\u8d24\u8005\u4e4b\u77f3","/items/shard_of_protection":"\u4ece\u5de5\u5320\u5323\u4e2d\u83b7\u5f97\uff0c\u7528\u4e8e\u5408\u6210\u4fdd\u62a4\u4e4b\u955c","/items/mirror_of_protection":"\u4e00\u79cd\u7a00\u6709\u795e\u5668\uff0c\u53ef\u5728\u5f3a\u5316\u65f6\u4f5c\u4e3a\u4efb\u4f55\u4fdd\u62a4\u88c5\u5907\u7684\u526f\u672c","/items/philosophers_mirror":"\u4e00\u79cd\u795e\u79d8\u7684\u5f3a\u5316\u795e\u5668\u3002\u5f53\u7528\u4f5c\u4fdd\u62a4\u7269\u54c1\u65f6\uff0c\u5f3a\u5316\u5c06\u4fdd\u8bc1\u6210\u529f\uff0c\u5e76\u4e14\u5f3a\u5316\u6210\u672c\u5c06\u53d8\u4e3a\u57fa\u7840\u7269\u54c1\u7684\u526f\u672c\uff0c\u7b49\u7ea7\u4f4e\u4e8e\u4e3b\u7269\u54c1\u4e00\u7ea7\u5f3a\u5316\u7b49\u7ea7\u3002","/items/basic_torch":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\u3002\u8fdb\u5165\u623f\u95f4\u65f6\u6d88\u8017\u3002\u65e0\u4fdd\u7559\u51e0\u7387\u3002","/items/advanced_torch":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\u3002\u8fdb\u5165\u623f\u95f4\u65f6\u6d88\u8017\u300210%\u4fdd\u7559\u51e0\u7387\u3002","/items/expert_torch":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\u3002\u8fdb\u5165\u623f\u95f4\u65f6\u6d88\u8017\u300220%\u4fdd\u7559\u51e0\u7387\u3002","/items/basic_shroud":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\uff0c\u53ef\u7acb\u5373\u6e05\u9664\u4e00\u4e2a\u623f\u95f4\u3002\u7b49\u7ea7\u8d85\u8fc750\u65f6\u6bcf\u7ea7\u67092%\u5931\u8d25\u51e0\u7387\u3002","/items/advanced_shroud":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\uff0c\u53ef\u7acb\u5373\u6e05\u9664\u4e00\u4e2a\u623f\u95f4\u3002\u7b49\u7ea7\u8d85\u8fc7100\u65f6\u6bcf\u7ea7\u67092%\u5931\u8d25\u51e0\u7387\u3002","/items/expert_shroud":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\uff0c\u53ef\u7acb\u5373\u6e05\u9664\u4e00\u4e2a\u623f\u95f4\u3002\u65e0\u5931\u8d25\u51e0\u7387\u3002","/items/basic_beacon":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\uff0c\u63ed\u793a\u5c0f\u8303\u56f4\u533a\u57df\u7684\u623f\u95f4\uff085\u4e2a\u623f\u95f4\uff09\u3002","/items/advanced_beacon":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\uff0c\u63ed\u793a\u4e2d\u7b49\u8303\u56f4\u533a\u57df\u7684\u623f\u95f4\uff089\u4e2a\u623f\u95f4\uff09\u3002","/items/expert_beacon":"\u5728\u8ff7\u5bab\u4e2d\u4f7f\u7528\uff0c\u63ed\u793a\u5927\u8303\u56f4\u533a\u57df\u7684\u623f\u95f4\uff0813\u4e2a\u623f\u95f4\uff09\u3002","/items/basic_food_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+2% HP/MP\u56de\u590d\u3002","/items/advanced_food_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+4% HP/MP\u56de\u590d\u3002","/items/expert_food_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+6% HP/MP\u56de\u590d\u3002","/items/basic_tea_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+5\u6280\u80fd\u7b49\u7ea7\u3001+5%\u6548\u7387\u3001+2%\u6210\u529f\u7387\u3001+2%\u53cc\u500d\u8fdb\u5ea6\u3001+5%\u6280\u80fd\u7ecf\u9a8c\u3002","/items/advanced_tea_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+10\u6280\u80fd\u7b49\u7ea7\u3001+10%\u6548\u7387\u3001+4%\u6210\u529f\u7387\u3001+4%\u53cc\u500d\u8fdb\u5ea6\u3001+10%\u6280\u80fd\u7ecf\u9a8c\u3002","/items/expert_tea_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+15\u6280\u80fd\u7b49\u7ea7\u3001+15%\u6548\u7387\u3001+6%\u6210\u529f\u7387\u3001+6%\u53cc\u500d\u8fdb\u5ea6\u3001+15%\u6280\u80fd\u7ecf\u9a8c\u3002","/items/basic_coffee_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+5\u6218\u6597\u7b49\u7ea7\u3001+5%\u653b\u51fb\u901f\u5ea6\u3001+5%\u65bd\u6cd5\u901f\u5ea6\u3001+5%\u6218\u6597\u7ecf\u9a8c\u3002","/items/advanced_coffee_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+10\u6218\u6597\u7b49\u7ea7\u3001+10%\u653b\u51fb\u901f\u5ea6\u3001+10%\u65bd\u6cd5\u901f\u5ea6\u3001+3%\u66b4\u51fb\u7387\u3001+5%\u66b4\u51fb\u4f24\u5bb3\u3001+10%\u6218\u6597\u7ecf\u9a8c\u3002","/items/expert_coffee_crate":"\u8fdb\u5165\u8ff7\u5bab\u65f6\u6d88\u8017\u3002\u4e3a\u672c\u6b21\u63a2\u7d22\u63d0\u4f9b+15\u6218\u6597\u7b49\u7ea7\u3001+15%\u653b\u51fb\u901f\u5ea6\u3001+15%\u65bd\u6cd5\u901f\u5ea6\u3001+6%\u66b4\u51fb\u7387\u3001+10%\u66b4\u51fb\u4f24\u5bb3\u3001+15%\u6218\u6597\u7ecf\u9a8c\u3002"},itemCategoryNames:{"/item_categories/currency":"\u8d27\u5e01","/item_categories/loot":"\u6218\u5229\u54c1","/item_categories/scroll":"\u5377\u8f74","/item_categories/labyrinth":"\u8ff7\u5bab","/item_categories/dungeon_key":"\u5730\u4e0b\u57ce\u94a5\u5319","/item_categories/food":"\u98df\u7269","/item_categories/drink":"\u996e\u6599","/item_categories/ability_book":"\u6280\u80fd\u4e66","/item_categories/equipment":"\u88c5\u5907","/item_categories/resource":"\u8d44\u6e90"},itemCategoryPluralNames:{"/item_categories/currency":"\u8d27\u5e01","/item_categories/loot":"\u6218\u5229\u54c1","/item_categories/scroll":"\u5377\u8f74","/item_categories/labyrinth":"\u8ff7\u5bab","/item_categories/dungeon_key":"\u5730\u4e0b\u57ce\u94a5\u5319","/item_categories/food":"\u98df\u7269","/item_categories/drink":"\u996e\u6599","/item_categories/ability_book":"\u6280\u80fd\u4e66","/item_categories/equipment":"\u88c5\u5907","/item_categories/resource":"\u8d44\u6e90"},equipmentTypeNames:{"/equipment_types/two_hand":"\u53cc\u624b","/equipment_types/main_hand":"\u4e3b\u624b","/equipment_types/off_hand":"\u526f\u624b","/equipment_types/back":"\u80cc\u90e8","/equipment_types/head":"\u5934\u90e8","/equipment_types/body":"\u8eab\u4f53","/equipment_types/legs":"\u817f\u90e8","/equipment_types/hands":"\u624b\u90e8","/equipment_types/feet":"\u811a\u90e8","/equipment_types/pouch":"\u888b\u5b50","/equipment_types/neck":"\u9879\u94fe","/equipment_types/earrings":"\u8033\u73af","/equipment_types/ring":"\u6212\u6307","/equipment_types/charm":"\u62a4\u7b26","/equipment_types/trinket":"\u9970\u54c1","/equipment_types/milking_tool":"\u6324\u5976\u5de5\u5177","/equipment_types/foraging_tool":"\u91c7\u6458\u5de5\u5177","/equipment_types/woodcutting_tool":"\u4f10\u6728\u5de5\u5177","/equipment_types/cheesesmithing_tool":"\u5976\u916a\u953b\u9020\u5de5\u5177","/equipment_types/crafting_tool":"\u5236\u4f5c\u5de5\u5177","/equipment_types/tailoring_tool":"\u7f1d\u7eab\u5de5\u5177","/equipment_types/cooking_tool":"\u70f9\u996a\u5de5\u5177","/equipment_types/brewing_tool":"\u51b2\u6ce1\u5de5\u5177","/equipment_types/alchemy_tool":"\u70bc\u91d1\u5de5\u5177","/equipment_types/enhancing_tool":"\u5f3a\u5316\u5de5\u5177"},combatStyleNames:{"/combat_styles/stab":"\u523a\u51fb","/combat_styles/slash":"\u65a9\u51fb","/combat_styles/smash":"\u949d\u51fb","/combat_styles/ranged":"\u8fdc\u7a0b","/combat_styles/magic":"\u9b54\u6cd5","/combat_styles/heal":"\u6cbb\u7597"},damageTypeNames:{"/damage_types/physical":"\u7269\u7406","/damage_types/water":"\u6c34\u7cfb","/damage_types/nature":"\u81ea\u7136\u7cfb","/damage_types/fire":"\u706b\u7cfb"},monsterNames:{"/monsters/abyssal_imp":"\u6df1\u6e0a\u5c0f\u9b3c","/monsters/acrobat":"\u6742\u6280\u5e08","/monsters/anchor_shark":"\u6301\u951a\u9ca8","/monsters/aquahorse":"\u6c34\u9a6c","/monsters/black_bear":"\u9ed1\u718a","/monsters/gobo_boomy":"\u8f70\u8f70","/monsters/brine_marksman":"\u6d77\u76d0\u5c04\u624b","/monsters/butterjerry":"\u8776\u9f20","/monsters/captain_fishhook":"\u9c7c\u94a9\u8239\u957f","/monsters/centaur_archer":"\u534a\u4eba\u9a6c\u5f13\u7bad\u624b","/monsters/cyclops":"\u72ec\u773c\u5de8\u4eba","/monsters/chronofrost_sorcerer":"\u971c\u65f6\u5deb\u5e08","/monsters/dryad":"\u6811\u7cbe","/monsters/crystal_colossus":"\u6c34\u6676\u5de8\u50cf","/monsters/frost_sniper":"\u971c\u51bb\u72d9\u51fb\u624b","/monsters/demonic_overlord":"\u6076\u9b54\u9738\u4e3b","/monsters/deranged_jester":"\u5c0f\u4e11\u7687","/monsters/dodocamel":"\u6e21\u6e21\u9a7c","/monsters/dusk_revenant":"\u9ec4\u660f\u4ea1\u7075","/monsters/elementalist":"\u5143\u7d20\u6cd5\u5e08","/monsters/enchanted_bishop":"\u79d8\u6cd5\u4e3b\u6559","/monsters/enchanted_king":"\u79d8\u6cd5\u56fd\u738b","/monsters/enchanted_knight":"\u79d8\u6cd5\u9a91\u58eb","/monsters/enchanted_pawn":"\u79d8\u6cd5\u58eb\u5175","/monsters/enchanted_queen":"\u79d8\u6cd5\u738b\u540e","/monsters/enchanted_rook":"\u79d8\u6cd5\u5821\u5792","/monsters/eye":"\u72ec\u773c","/monsters/eyes":"\u53e0\u773c","/monsters/flame_sorcerer":"\u706b\u7130\u5deb\u5e08","/monsters/fly":"\u82cd\u8747","/monsters/frog":"\u9752\u86d9","/monsters/sea_snail":"\u8717\u725b","/monsters/giant_shoebill":"\u9cb8\u5934\u9e73","/monsters/gobo_chieftain":"\u54e5\u5e03\u6797\u914b\u957f","/monsters/granite_golem":"\u82b1\u5c97\u9b54\u50cf","/monsters/griffin":"\u72ee\u9e6b","/monsters/grizzly_bear":"\u68d5\u718a","/monsters/gummy_bear":"\u8f6f\u7cd6\u718a","/monsters/crab":"\u8783\u87f9","/monsters/ice_sorcerer":"\u51b0\u971c\u5deb\u5e08","/monsters/infernal_warlock":"\u5730\u72f1\u672f\u58eb","/monsters/jackalope":"\u9e7f\u89d2\u5154","/monsters/rat":"\u6770\u745e","/monsters/juggler":"\u6742\u800d\u8005","/monsters/jungle_sprite":"\u4e1b\u6797\u7cbe\u7075","/monsters/giant_mantis":"\u5de8\u87b3\u8782","/monsters/luna_empress":"\u6708\u795e\u4e4b\u8776","/monsters/magician":"\u9b54\u672f\u5e08","/monsters/magnetic_golem":"\u78c1\u529b\u9b54\u50cf","/monsters/manticore":"\u72ee\u874e\u517d","/monsters/marine_huntress":"\u6d77\u6d0b\u730e\u624b","/monsters/giant_scorpion":"\u5de8\u874e","/monsters/mimic":"\u5b9d\u7bb1\u602a","/monsters/myconid":"\u8611\u83c7\u4eba","/monsters/nom_nom":"\u54ac\u54ac\u9c7c","/monsters/novice_sorcerer":"\u65b0\u624b\u5deb\u5e08","/monsters/panda":"\u718a\u732b","/monsters/polar_bear":"\u5317\u6781\u718a","/monsters/porcupine":"\u8c6a\u732a","/monsters/rabid_rabbit":"\u75af\u9b54\u5154","/monsters/red_panda":"\u5c0f\u718a\u732b","/monsters/alligator":"\u590f\u6d1b\u514b","/monsters/gobo_shooty":"\u54bb\u54bb","/monsters/skunk":"\u81ed\u9f2c","/monsters/gobo_slashy":"\u780d\u780d","/monsters/slimy":"\u53f2\u83b1\u59c6","/monsters/gobo_smashy":"\u9524\u9524","/monsters/soul_hunter":"\u7075\u9b42\u730e\u624b","/monsters/squawker":"\u9e66\u9e49","/monsters/gobo_stabby":"\u523a\u523a","/monsters/stalactite_golem":"\u949f\u4e73\u77f3\u9b54\u50cf","/monsters/pyre_hunter":"\u706b\u7130\u730e\u624b","/monsters/swampy":"\u6cbc\u6cfd\u866b","/monsters/the_kraken":"\u514b\u62c9\u80af","/monsters/the_watcher":"\u89c2\u5bdf\u8005","/monsters/snake":"\u86c7","/monsters/tidal_conjuror":"\u6f6e\u6c50\u53ec\u5524\u5e08","/monsters/salamander":"\u706b\u8725\u8734","/monsters/shadow_archer":"\u6697\u5f71\u5f13\u624b","/monsters/treant":"\u6811\u4eba","/monsters/turtle":"\u5fcd\u8005\u9f9f","/monsters/vampire":"\u5438\u8840\u9b3c","/monsters/veyes":"\u590d\u773c","/monsters/siren":"\u6d77\u5996","/monsters/werewolf":"\u72fc\u4eba","/monsters/zombie":"\u50f5\u5c38","/monsters/zombie_bear":"\u50f5\u5c38\u718a"},combatTriggerDependencyNames:{"/combat_trigger_dependencies/all_allies":"\u6240\u6709\u961f\u53cb\u7684","/combat_trigger_dependencies/all_enemies":"\u6240\u6709\u654c\u4eba\u7684","/combat_trigger_dependencies/self":"\u6211\u7684","/combat_trigger_dependencies/targeted_enemy":"\u76ee\u6807\u654c\u4eba\u7684"},combatTriggerConditionNames:{"/combat_trigger_conditions/number_of_active_units":"\u5b58\u6d3b\u6570","/combat_trigger_conditions/number_of_dead_units":"\u6b7b\u4ea1\u6570","/combat_trigger_conditions/attack_coffee":"\u653b\u51fb\u5496\u5561","/combat_trigger_conditions/berserk":"\u72c2\u66b4","/combat_trigger_conditions/blind_status":"\u5931\u660e\u72b6\u6001","/combat_trigger_conditions/channeling_coffee":"\u541f\u5531\u5496\u5561","/combat_trigger_conditions/crippling_slash":"\u81f4\u6b8b\u65a9\u51cf\u76ca","/combat_trigger_conditions/critical_aura":"\u81f4\u547d\u5149\u73af","/combat_trigger_conditions/critical_coffee":"\u66b4\u51fb\u5496\u5561","/combat_trigger_conditions/current_hp":"\u5f53\u524dHP","/combat_trigger_conditions/current_mp":"\u5f53\u524dMP","/combat_trigger_conditions/curse":"\u8bc5\u5492","/combat_trigger_conditions/defense_coffee":"\u9632\u5fa1\u5496\u5561","/combat_trigger_conditions/elemental_affinity":"\u5143\u7d20\u589e\u5e45","/combat_trigger_conditions/elusiveness":"\u95ea\u907f","/combat_trigger_conditions/enrage":"\u66b4\u8d70","/combat_trigger_conditions/fierce_aura":"\u7269\u7406\u5149\u73af","/combat_trigger_conditions/fracturing_impact":"\u788e\u88c2\u51b2\u51fb\u51cf\u76ca","/combat_trigger_conditions/frenzy":"\u72c2\u901f","/combat_trigger_conditions/frost_surge":"\u51b0\u971c\u7206\u88c2\u51cf\u76ca","/combat_trigger_conditions/fury":"\u72c2\u6012","/combat_trigger_conditions/guardian_aura":"\u5b88\u62a4\u5149\u73af","/combat_trigger_conditions/ice_spear":"\u51b0\u67aa\u51cf\u76ca","/combat_trigger_conditions/insanity":"\u75af\u72c2","/combat_trigger_conditions/intelligence_coffee":"\u667a\u529b\u5496\u5561","/combat_trigger_conditions/invincible":"\u65e0\u654c\u5149\u73af","/combat_trigger_conditions/lowest_hp_percentage":"\u6700\u4f4eHP%","/combat_trigger_conditions/lucky_coffee":"\u5e78\u8fd0\u5496\u5561","/combat_trigger_conditions/magic_coffee":"\u9b54\u6cd5\u5496\u5561","/combat_trigger_conditions/maim":"\u8840\u5203\u65a9\u51cf\u76ca","/combat_trigger_conditions/mana_spring":"\u6cd5\u529b\u55b7\u6cc9","/combat_trigger_conditions/melee_coffee":"\u8fd1\u6218\u5496\u5561","/combat_trigger_conditions/missing_hp":"\u7f3a\u5931HP","/combat_trigger_conditions/missing_mp":"\u7f3a\u5931MP","/combat_trigger_conditions/mystic_aura":"\u5143\u7d20\u5149\u73af","/combat_trigger_conditions/pestilent_shot":"\u75ab\u75c5\u5c04\u51fb\u51cf\u76ca","/combat_trigger_conditions/precision":"\u7cbe\u786e","/combat_trigger_conditions/provoke":"\u6311\u8845","/combat_trigger_conditions/puncture":"\u7834\u7532\u4e4b\u523a\u51cf\u76ca","/combat_trigger_conditions/ranged_coffee":"\u8fdc\u7a0b\u5496\u5561","/combat_trigger_conditions/retribution":"\u60e9\u6212","/combat_trigger_conditions/silence_status":"\u6c89\u9ed8\u72b6\u6001","/combat_trigger_conditions/smoke_burst":"\u70df\u7206\u706d\u5f71\u51cf\u76ca","/combat_trigger_conditions/speed_aura":"\u901f\u5ea6\u5149\u73af","/combat_trigger_conditions/spike_shell":"\u5c16\u523a\u9632\u62a4","/combat_trigger_conditions/stamina_coffee":"\u8010\u529b\u5496\u5561","/combat_trigger_conditions/stun_status":"\u7729\u6655\u72b6\u6001","/combat_trigger_conditions/swiftness_coffee":"\u8fc5\u6377\u5496\u5561","/combat_trigger_conditions/taunt":"\u5632\u8bbd","/combat_trigger_conditions/toughness":"\u575a\u97e7","/combat_trigger_conditions/toxic_pollen":"\u5267\u6bd2\u7c89\u5c18\u51cf\u76ca","/combat_trigger_conditions/vampirism":"\u5438\u8840","/combat_trigger_conditions/weaken":"\u865a\u5f31\u72b6\u6001","/combat_trigger_conditions/wisdom_coffee":"\u7ecf\u9a8c\u5496\u5561"},combatTriggerComparatorNames:{"/combat_trigger_comparators/less_than_equal":"<=","/combat_trigger_comparators/greater_than_equal":">=","/combat_trigger_comparators/is_active":"\u5df2\u751f\u6548","/combat_trigger_comparators/is_inactive":"\u672a\u751f\u6548"},shopCategoryNames:{"/shop_categories/dungeon":"\u5730\u4e0b\u57ce","/shop_categories/general":"\u6742\u8d27","/shop_categories/tester":"\u6d4b\u8bd5"},actionNames:{"/actions/milking/cow":"\u5976\u725b","/actions/milking/verdant_cow":"\u7fe0\u7eff\u5976\u725b","/actions/milking/azure_cow":"\u851a\u84dd\u5976\u725b","/actions/milking/burble_cow":"\u6df1\u7d2b\u5976\u725b","/actions/milking/crimson_cow":"\u7edb\u7ea2\u5976\u725b","/actions/milking/unicow":"\u5f69\u8679\u5976\u725b","/actions/milking/holy_cow":"\u795e\u5723\u5976\u725b","/actions/foraging/egg":"\u9e21\u86cb","/actions/foraging/wheat":"\u5c0f\u9ea6","/actions/foraging/sugar":"\u7cd6","/actions/foraging/cotton":"\u68c9\u82b1","/actions/foraging/farmland":"\u7fe0\u91ce\u519c\u573a","/actions/foraging/blueberry":"\u84dd\u8393","/actions/foraging/apple":"\u82f9\u679c","/actions/foraging/arabica_coffee_bean":"\u4f4e\u7ea7\u5496\u5561\u8c46","/actions/foraging/flax":"\u4e9a\u9ebb","/actions/foraging/shimmering_lake":"\u6ce2\u5149\u6e56\u6cca","/actions/foraging/blackberry":"\u9ed1\u8393","/actions/foraging/orange":"\u6a59\u5b50","/actions/foraging/robusta_coffee_bean":"\u4e2d\u7ea7\u5496\u5561\u8c46","/actions/foraging/misty_forest":"\u8ff7\u96fe\u68ee\u6797","/actions/foraging/strawberry":"\u8349\u8393","/actions/foraging/plum":"\u674e\u5b50","/actions/foraging/liberica_coffee_bean":"\u9ad8\u7ea7\u5496\u5561\u8c46","/actions/foraging/bamboo_branch":"\u7af9\u5b50","/actions/foraging/burble_beach":"\u6df1\u7d2b\u6c99\u6ee9","/actions/foraging/mooberry":"\u54de\u8393","/actions/foraging/peach":"\u6843\u5b50","/actions/foraging/excelsa_coffee_bean":"\u7279\u7ea7\u5496\u5561\u8c46","/actions/foraging/cocoon":"\u8695\u8327","/actions/foraging/silly_cow_valley":"\u50bb\u725b\u5c71\u8c37","/actions/foraging/marsberry":"\u706b\u661f\u8393","/actions/foraging/dragon_fruit":"\u706b\u9f99\u679c","/actions/foraging/fieriosa_coffee_bean":"\u706b\u5c71\u5496\u5561\u8c46","/actions/foraging/olympus_mons":"\u5965\u6797\u5339\u65af\u5c71","/actions/foraging/spaceberry":"\u592a\u7a7a\u8393","/actions/foraging/star_fruit":"\u6768\u6843","/actions/foraging/spacia_coffee_bean":"\u592a\u7a7a\u5496\u5561\u8c46","/actions/foraging/radiant_fiber":"\u5149\u8f89\u7ea4\u7ef4","/actions/foraging/asteroid_belt":"\u5c0f\u884c\u661f\u5e26","/actions/woodcutting/tree":"\u6811","/actions/woodcutting/birch_tree":"\u6866\u6811","/actions/woodcutting/cedar_tree":"\u96ea\u677e\u6811","/actions/woodcutting/purpleheart_tree":"\u7d2b\u5fc3\u6811","/actions/woodcutting/ginkgo_tree":"\u94f6\u674f\u6811","/actions/woodcutting/redwood_tree":"\u7ea2\u6749\u6811","/actions/woodcutting/arcane_tree":"\u5965\u79d8\u6811","/actions/cheesesmithing/cheese":"\u5976\u916a","/actions/cheesesmithing/cheese_boots":"\u5976\u916a\u9774","/actions/cheesesmithing/cheese_gauntlets":"\u5976\u916a\u62a4\u624b","/actions/cheesesmithing/cheese_sword":"\u5976\u916a\u5251","/actions/cheesesmithing/cheese_brush":"\u5976\u916a\u5237\u5b50","/actions/cheesesmithing/cheese_shears":"\u5976\u916a\u526a\u5200","/actions/cheesesmithing/cheese_hatchet":"\u5976\u916a\u65a7\u5934","/actions/cheesesmithing/cheese_spear":"\u5976\u916a\u957f\u67aa","/actions/cheesesmithing/cheese_hammer":"\u5976\u916a\u9524\u5b50","/actions/cheesesmithing/cheese_chisel":"\u5976\u916a\u51ff\u5b50","/actions/cheesesmithing/cheese_needle":"\u5976\u916a\u9488","/actions/cheesesmithing/cheese_spatula":"\u5976\u916a\u9505\u94f2","/actions/cheesesmithing/cheese_pot":"\u5976\u916a\u58f6","/actions/cheesesmithing/cheese_mace":"\u5976\u916a\u9489\u5934\u9524","/actions/cheesesmithing/cheese_alembic":"\u5976\u916a\u84b8\u998f\u5668","/actions/cheesesmithing/cheese_enhancer":"\u5976\u916a\u5f3a\u5316\u5668","/actions/cheesesmithing/cheese_helmet":"\u5976\u916a\u5934\u76d4","/actions/cheesesmithing/cheese_buckler":"\u5976\u916a\u5706\u76fe","/actions/cheesesmithing/cheese_bulwark":"\u5976\u916a\u91cd\u76fe","/actions/cheesesmithing/cheese_plate_legs":"\u5976\u916a\u817f\u7532","/actions/cheesesmithing/cheese_plate_body":"\u5976\u916a\u80f8\u7532","/actions/cheesesmithing/verdant_cheese":"\u7fe0\u7eff\u5976\u916a","/actions/cheesesmithing/verdant_boots":"\u7fe0\u7eff\u9774","/actions/cheesesmithing/verdant_gauntlets":"\u7fe0\u7eff\u62a4\u624b","/actions/cheesesmithing/verdant_sword":"\u7fe0\u7eff\u5251","/actions/cheesesmithing/verdant_brush":"\u7fe0\u7eff\u5237\u5b50","/actions/cheesesmithing/verdant_shears":"\u7fe0\u7eff\u526a\u5200","/actions/cheesesmithing/verdant_hatchet":"\u7fe0\u7eff\u65a7\u5934","/actions/cheesesmithing/verdant_spear":"\u7fe0\u7eff\u957f\u67aa","/actions/cheesesmithing/verdant_hammer":"\u7fe0\u7eff\u9524\u5b50","/actions/cheesesmithing/verdant_chisel":"\u7fe0\u7eff\u51ff\u5b50","/actions/cheesesmithing/verdant_needle":"\u7fe0\u7eff\u9488","/actions/cheesesmithing/verdant_spatula":"\u7fe0\u7eff\u9505\u94f2","/actions/cheesesmithing/verdant_pot":"\u7fe0\u7eff\u58f6","/actions/cheesesmithing/verdant_mace":"\u7fe0\u7eff\u9489\u5934\u9524","/actions/cheesesmithing/snake_fang_dirk":"\u86c7\u7259\u77ed\u5251","/actions/cheesesmithing/verdant_alembic":"\u7fe0\u7eff\u84b8\u998f\u5668","/actions/cheesesmithing/verdant_enhancer":"\u7fe0\u7eff\u5f3a\u5316\u5668","/actions/cheesesmithing/verdant_helmet":"\u7fe0\u7eff\u5934\u76d4","/actions/cheesesmithing/verdant_buckler":"\u7fe0\u7eff\u5706\u76fe","/actions/cheesesmithing/verdant_bulwark":"\u7fe0\u7eff\u91cd\u76fe","/actions/cheesesmithing/verdant_plate_legs":"\u7fe0\u7eff\u817f\u7532","/actions/cheesesmithing/verdant_plate_body":"\u7fe0\u7eff\u80f8\u7532","/actions/cheesesmithing/azure_cheese":"\u851a\u84dd\u5976\u916a","/actions/cheesesmithing/azure_boots":"\u851a\u84dd\u9774","/actions/cheesesmithing/basic_beacon":"\u57fa\u7840\u63a2\u7167\u706f","/actions/cheesesmithing/azure_gauntlets":"\u851a\u84dd\u62a4\u624b","/actions/cheesesmithing/azure_sword":"\u851a\u84dd\u5251","/actions/cheesesmithing/azure_brush":"\u851a\u84dd\u5237\u5b50","/actions/cheesesmithing/azure_shears":"\u851a\u84dd\u526a\u5200","/actions/cheesesmithing/azure_hatchet":"\u851a\u84dd\u65a7\u5934","/actions/cheesesmithing/azure_spear":"\u851a\u84dd\u957f\u67aa","/actions/cheesesmithing/azure_hammer":"\u851a\u84dd\u9524\u5b50","/actions/cheesesmithing/azure_chisel":"\u851a\u84dd\u51ff\u5b50","/actions/cheesesmithing/azure_needle":"\u851a\u84dd\u9488","/actions/cheesesmithing/azure_spatula":"\u851a\u84dd\u9505\u94f2","/actions/cheesesmithing/azure_pot":"\u851a\u84dd\u58f6","/actions/cheesesmithing/azure_mace":"\u851a\u84dd\u9489\u5934\u9524","/actions/cheesesmithing/pincer_gloves":"\u87f9\u94b3\u624b\u5957","/actions/cheesesmithing/azure_alembic":"\u851a\u84dd\u84b8\u998f\u5668","/actions/cheesesmithing/azure_enhancer":"\u851a\u84dd\u5f3a\u5316\u5668","/actions/cheesesmithing/azure_helmet":"\u851a\u84dd\u5934\u76d4","/actions/cheesesmithing/azure_buckler":"\u851a\u84dd\u5706\u76fe","/actions/cheesesmithing/azure_bulwark":"\u851a\u84dd\u91cd\u76fe","/actions/cheesesmithing/azure_plate_legs":"\u851a\u84dd\u817f\u7532","/actions/cheesesmithing/snail_shell_helmet":"\u8717\u725b\u58f3\u5934\u76d4","/actions/cheesesmithing/azure_plate_body":"\u851a\u84dd\u80f8\u7532","/actions/cheesesmithing/turtle_shell_legs":"\u9f9f\u58f3\u817f\u7532","/actions/cheesesmithing/turtle_shell_body":"\u9f9f\u58f3\u80f8\u7532","/actions/cheesesmithing/burble_cheese":"\u6df1\u7d2b\u5976\u916a","/actions/cheesesmithing/burble_boots":"\u6df1\u7d2b\u9774","/actions/cheesesmithing/burble_gauntlets":"\u6df1\u7d2b\u62a4\u624b","/actions/cheesesmithing/burble_sword":"\u6df1\u7d2b\u5251","/actions/cheesesmithing/burble_brush":"\u6df1\u7d2b\u5237\u5b50","/actions/cheesesmithing/burble_shears":"\u6df1\u7d2b\u526a\u5200","/actions/cheesesmithing/burble_hatchet":"\u6df1\u7d2b\u65a7\u5934","/actions/cheesesmithing/burble_spear":"\u6df1\u7d2b\u957f\u67aa","/actions/cheesesmithing/burble_hammer":"\u6df1\u7d2b\u9524\u5b50","/actions/cheesesmithing/burble_chisel":"\u6df1\u7d2b\u51ff\u5b50","/actions/cheesesmithing/burble_needle":"\u6df1\u7d2b\u9488","/actions/cheesesmithing/burble_spatula":"\u6df1\u7d2b\u9505\u94f2","/actions/cheesesmithing/burble_pot":"\u6df1\u7d2b\u58f6","/actions/cheesesmithing/burble_mace":"\u6df1\u7d2b\u9489\u5934\u9524","/actions/cheesesmithing/burble_alembic":"\u6df1\u7d2b\u84b8\u998f\u5668","/actions/cheesesmithing/burble_enhancer":"\u6df1\u7d2b\u5f3a\u5316\u5668","/actions/cheesesmithing/burble_helmet":"\u6df1\u7d2b\u5934\u76d4","/actions/cheesesmithing/burble_buckler":"\u6df1\u7d2b\u5706\u76fe","/actions/cheesesmithing/burble_bulwark":"\u6df1\u7d2b\u91cd\u76fe","/actions/cheesesmithing/burble_plate_legs":"\u6df1\u7d2b\u817f\u7532","/actions/cheesesmithing/burble_plate_body":"\u6df1\u7d2b\u80f8\u7532","/actions/cheesesmithing/crimson_cheese":"\u7edb\u7ea2\u5976\u916a","/actions/cheesesmithing/crimson_boots":"\u7edb\u7ea2\u9774","/actions/cheesesmithing/advanced_beacon":"\u8fdb\u9636\u63a2\u7167\u706f","/actions/cheesesmithing/crimson_gauntlets":"\u7edb\u7ea2\u62a4\u624b","/actions/cheesesmithing/crimson_sword":"\u7edb\u7ea2\u5251","/actions/cheesesmithing/crimson_brush":"\u7edb\u7ea2\u5237\u5b50","/actions/cheesesmithing/crimson_shears":"\u7edb\u7ea2\u526a\u5200","/actions/cheesesmithing/crimson_hatchet":"\u7edb\u7ea2\u65a7\u5934","/actions/cheesesmithing/crimson_spear":"\u7edb\u7ea2\u957f\u67aa","/actions/cheesesmithing/crimson_hammer":"\u7edb\u7ea2\u9524\u5b50","/actions/cheesesmithing/crimson_chisel":"\u7edb\u7ea2\u51ff\u5b50","/actions/cheesesmithing/crimson_needle":"\u7edb\u7ea2\u9488","/actions/cheesesmithing/crimson_spatula":"\u7edb\u7ea2\u9505\u94f2","/actions/cheesesmithing/crimson_pot":"\u7edb\u7ea2\u58f6","/actions/cheesesmithing/crimson_mace":"\u7edb\u7ea2\u9489\u5934\u9524","/actions/cheesesmithing/crimson_alembic":"\u7edb\u7ea2\u84b8\u998f\u5668","/actions/cheesesmithing/crimson_enhancer":"\u7edb\u7ea2\u5f3a\u5316\u5668","/actions/cheesesmithing/crimson_helmet":"\u7edb\u7ea2\u5934\u76d4","/actions/cheesesmithing/crimson_buckler":"\u7edb\u7ea2\u5706\u76fe","/actions/cheesesmithing/crimson_bulwark":"\u7edb\u7ea2\u91cd\u76fe","/actions/cheesesmithing/crimson_plate_legs":"\u7edb\u7ea2\u817f\u7532","/actions/cheesesmithing/vision_helmet":"\u89c6\u89c9\u5934\u76d4","/actions/cheesesmithing/vision_shield":"\u89c6\u89c9\u76fe","/actions/cheesesmithing/crimson_plate_body":"\u7edb\u7ea2\u80f8\u7532","/actions/cheesesmithing/rainbow_cheese":"\u5f69\u8679\u5976\u916a","/actions/cheesesmithing/rainbow_boots":"\u5f69\u8679\u9774","/actions/cheesesmithing/black_bear_shoes":"\u9ed1\u718a\u978b","/actions/cheesesmithing/grizzly_bear_shoes":"\u68d5\u718a\u978b","/actions/cheesesmithing/polar_bear_shoes":"\u5317\u6781\u718a\u978b","/actions/cheesesmithing/rainbow_gauntlets":"\u5f69\u8679\u62a4\u624b","/actions/cheesesmithing/rainbow_sword":"\u5f69\u8679\u5251","/actions/cheesesmithing/panda_gloves":"\u718a\u732b\u624b\u5957","/actions/cheesesmithing/rainbow_brush":"\u5f69\u8679\u5237\u5b50","/actions/cheesesmithing/rainbow_shears":"\u5f69\u8679\u526a\u5200","/actions/cheesesmithing/rainbow_hatchet":"\u5f69\u8679\u65a7\u5934","/actions/cheesesmithing/rainbow_spear":"\u5f69\u8679\u957f\u67aa","/actions/cheesesmithing/rainbow_hammer":"\u5f69\u8679\u9524\u5b50","/actions/cheesesmithing/rainbow_chisel":"\u5f69\u8679\u51ff\u5b50","/actions/cheesesmithing/rainbow_needle":"\u5f69\u8679\u9488","/actions/cheesesmithing/rainbow_spatula":"\u5f69\u8679\u9505\u94f2","/actions/cheesesmithing/rainbow_pot":"\u5f69\u8679\u58f6","/actions/cheesesmithing/rainbow_mace":"\u5f69\u8679\u9489\u5934\u9524","/actions/cheesesmithing/rainbow_alembic":"\u5f69\u8679\u84b8\u998f\u5668","/actions/cheesesmithing/rainbow_enhancer":"\u5f69\u8679\u5f3a\u5316\u5668","/actions/cheesesmithing/rainbow_helmet":"\u5f69\u8679\u5934\u76d4","/actions/cheesesmithing/rainbow_buckler":"\u5f69\u8679\u5706\u76fe","/actions/cheesesmithing/rainbow_bulwark":"\u5f69\u8679\u91cd\u76fe","/actions/cheesesmithing/rainbow_plate_legs":"\u5f69\u8679\u817f\u7532","/actions/cheesesmithing/rainbow_plate_body":"\u5f69\u8679\u80f8\u7532","/actions/cheesesmithing/holy_cheese":"\u795e\u5723\u5976\u916a","/actions/cheesesmithing/holy_boots":"\u795e\u5723\u9774","/actions/cheesesmithing/expert_beacon":"\u4e13\u5bb6\u63a2\u7167\u706f","/actions/cheesesmithing/holy_gauntlets":"\u795e\u5723\u62a4\u624b","/actions/cheesesmithing/holy_sword":"\u795e\u5723\u5251","/actions/cheesesmithing/holy_brush":"\u795e\u5723\u5237\u5b50","/actions/cheesesmithing/holy_shears":"\u795e\u5723\u526a\u5200","/actions/cheesesmithing/holy_hatchet":"\u795e\u5723\u65a7\u5934","/actions/cheesesmithing/holy_spear":"\u795e\u5723\u957f\u67aa","/actions/cheesesmithing/holy_hammer":"\u795e\u5723\u9524\u5b50","/actions/cheesesmithing/holy_chisel":"\u795e\u5723\u51ff\u5b50","/actions/cheesesmithing/holy_needle":"\u795e\u5723\u9488","/actions/cheesesmithing/holy_spatula":"\u795e\u5723\u9505\u94f2","/actions/cheesesmithing/holy_pot":"\u795e\u5723\u58f6","/actions/cheesesmithing/holy_mace":"\u795e\u5723\u9489\u5934\u9524","/actions/cheesesmithing/magnetic_gloves":"\u78c1\u529b\u624b\u5957","/actions/cheesesmithing/stalactite_spear":"\u77f3\u949f\u957f\u67aa","/actions/cheesesmithing/granite_bludgeon":"\u82b1\u5c97\u5ca9\u5927\u68d2","/actions/cheesesmithing/vampire_fang_dirk":"\u5438\u8840\u9b3c\u77ed\u5251","/actions/cheesesmithing/werewolf_slasher":"\u72fc\u4eba\u5173\u5200","/actions/cheesesmithing/holy_alembic":"\u795e\u5723\u84b8\u998f\u5668","/actions/cheesesmithing/holy_enhancer":"\u795e\u5723\u5f3a\u5316\u5668","/actions/cheesesmithing/holy_helmet":"\u795e\u5723\u5934\u76d4","/actions/cheesesmithing/holy_buckler":"\u795e\u5723\u5706\u76fe","/actions/cheesesmithing/holy_bulwark":"\u795e\u5723\u91cd\u76fe","/actions/cheesesmithing/holy_plate_legs":"\u795e\u5723\u817f\u7532","/actions/cheesesmithing/holy_plate_body":"\u795e\u5723\u80f8\u7532","/actions/cheesesmithing/celestial_brush":"\u661f\u7a7a\u5237\u5b50","/actions/cheesesmithing/celestial_shears":"\u661f\u7a7a\u526a\u5200","/actions/cheesesmithing/celestial_hatchet":"\u661f\u7a7a\u65a7\u5934","/actions/cheesesmithing/celestial_hammer":"\u661f\u7a7a\u9524\u5b50","/actions/cheesesmithing/celestial_chisel":"\u661f\u7a7a\u51ff\u5b50","/actions/cheesesmithing/celestial_needle":"\u661f\u7a7a\u9488","/actions/cheesesmithing/celestial_spatula":"\u661f\u7a7a\u9505\u94f2","/actions/cheesesmithing/celestial_pot":"\u661f\u7a7a\u58f6","/actions/cheesesmithing/celestial_alembic":"\u661f\u7a7a\u84b8\u998f\u5668","/actions/cheesesmithing/celestial_enhancer":"\u661f\u7a7a\u5f3a\u5316\u5668","/actions/cheesesmithing/colossus_plate_body":"\u5de8\u50cf\u80f8\u7532","/actions/cheesesmithing/colossus_plate_legs":"\u5de8\u50cf\u817f\u7532","/actions/cheesesmithing/demonic_plate_body":"\u6076\u9b54\u80f8\u7532","/actions/cheesesmithing/demonic_plate_legs":"\u6076\u9b54\u817f\u7532","/actions/cheesesmithing/spiked_bulwark":"\u5c16\u523a\u91cd\u76fe","/actions/cheesesmithing/pathbreaker_boots":"\u5f00\u8def\u8005\u9774","/actions/cheesesmithing/dodocamel_gauntlets":"\u6e21\u6e21\u9a7c\u62a4\u624b","/actions/cheesesmithing/corsair_helmet":"\u63a0\u593a\u8005\u5934\u76d4","/actions/cheesesmithing/knights_aegis":"\u9a91\u58eb\u76fe","/actions/cheesesmithing/anchorbound_plate_legs":"\u951a\u5b9a\u817f\u7532","/actions/cheesesmithing/maelstrom_plate_legs":"\u6012\u6d9b\u817f\u7532","/actions/cheesesmithing/griffin_bulwark":"\u72ee\u9e6b\u91cd\u76fe","/actions/cheesesmithing/furious_spear":"\u72c2\u6012\u957f\u67aa","/actions/cheesesmithing/chaotic_flail":"\u6df7\u6c8c\u8fde\u67b7","/actions/cheesesmithing/regal_sword":"\u541b\u738b\u4e4b\u5251","/actions/cheesesmithing/anchorbound_plate_body":"\u951a\u5b9a\u80f8\u7532","/actions/cheesesmithing/maelstrom_plate_body":"\u6012\u6d9b\u80f8\u7532","/actions/cheesesmithing/pathbreaker_boots_refined":"\u5f00\u8def\u8005\u9774\uff08\u7cbe\uff09","/actions/cheesesmithing/dodocamel_gauntlets_refined":"\u6e21\u6e21\u9a7c\u62a4\u624b\uff08\u7cbe\uff09","/actions/cheesesmithing/corsair_helmet_refined":"\u63a0\u593a\u8005\u5934\u76d4\uff08\u7cbe\uff09","/actions/cheesesmithing/knights_aegis_refined":"\u9a91\u58eb\u76fe\uff08\u7cbe\uff09","/actions/cheesesmithing/anchorbound_plate_legs_refined":"\u951a\u5b9a\u817f\u7532\uff08\u7cbe\uff09","/actions/cheesesmithing/maelstrom_plate_legs_refined":"\u6012\u6d9b\u817f\u7532\uff08\u7cbe\uff09","/actions/cheesesmithing/griffin_bulwark_refined":"\u72ee\u9e6b\u91cd\u76fe\uff08\u7cbe\uff09","/actions/cheesesmithing/furious_spear_refined":"\u72c2\u6012\u957f\u67aa\uff08\u7cbe\uff09","/actions/cheesesmithing/chaotic_flail_refined":"\u6df7\u6c8c\u8fde\u67b7\uff08\u7cbe\uff09","/actions/cheesesmithing/regal_sword_refined":"\u541b\u738b\u4e4b\u5251\uff08\u7cbe\uff09","/actions/cheesesmithing/anchorbound_plate_body_refined":"\u951a\u5b9a\u80f8\u7532\uff08\u7cbe\uff09","/actions/cheesesmithing/maelstrom_plate_body_refined":"\u6012\u6d9b\u80f8\u7532\uff08\u7cbe\uff09","/actions/crafting/lumber":"\u6728\u677f","/actions/crafting/wooden_crossbow":"\u6728\u5f29","/actions/crafting/wooden_water_staff":"\u6728\u5236\u6c34\u6cd5\u6756","/actions/crafting/basic_task_badge":"\u57fa\u7840\u4efb\u52a1\u5fbd\u7ae0","/actions/crafting/advanced_task_badge":"\u9ad8\u7ea7\u4efb\u52a1\u5fbd\u7ae0","/actions/crafting/expert_task_badge":"\u4e13\u5bb6\u4efb\u52a1\u5fbd\u7ae0","/actions/crafting/wooden_shield":"\u6728\u76fe","/actions/crafting/wooden_nature_staff":"\u6728\u5236\u81ea\u7136\u6cd5\u6756","/actions/crafting/wooden_bow":"\u6728\u5f13","/actions/crafting/wooden_fire_staff":"\u6728\u5236\u706b\u6cd5\u6756","/actions/crafting/birch_lumber":"\u767d\u6866\u6728\u677f","/actions/crafting/birch_crossbow":"\u6866\u6728\u5f29","/actions/crafting/birch_water_staff":"\u6866\u6728\u6c34\u6cd5\u6756","/actions/crafting/crushed_pearl":"\u73cd\u73e0\u788e\u7247","/actions/crafting/birch_shield":"\u6866\u6728\u76fe","/actions/crafting/birch_nature_staff":"\u6866\u6728\u81ea\u7136\u6cd5\u6756","/actions/crafting/birch_bow":"\u6866\u6728\u5f13","/actions/crafting/ring_of_gathering":"\u91c7\u96c6\u6212\u6307","/actions/crafting/birch_fire_staff":"\u6866\u6728\u706b\u6cd5\u6756","/actions/crafting/earrings_of_gathering":"\u91c7\u96c6\u8033\u73af","/actions/crafting/cedar_lumber":"\u96ea\u677e\u6728\u677f","/actions/crafting/cedar_crossbow":"\u96ea\u677e\u5f29","/actions/crafting/cedar_water_staff":"\u96ea\u677e\u6c34\u6cd5\u6756","/actions/crafting/basic_milking_charm":"\u57fa\u7840\u6324\u5976\u62a4\u7b26","/actions/crafting/basic_foraging_charm":"\u57fa\u7840\u91c7\u6458\u62a4\u7b26","/actions/crafting/basic_woodcutting_charm":"\u57fa\u7840\u4f10\u6728\u62a4\u7b26","/actions/crafting/basic_cheesesmithing_charm":"\u57fa\u7840\u5976\u916a\u953b\u9020\u62a4\u7b26","/actions/crafting/basic_crafting_charm":"\u57fa\u7840\u5236\u4f5c\u62a4\u7b26","/actions/crafting/basic_tailoring_charm":"\u57fa\u7840\u7f1d\u7eab\u62a4\u7b26","/actions/crafting/basic_cooking_charm":"\u57fa\u7840\u70f9\u996a\u62a4\u7b26","/actions/crafting/basic_brewing_charm":"\u57fa\u7840\u51b2\u6ce1\u62a4\u7b26","/actions/crafting/basic_alchemy_charm":"\u57fa\u7840\u70bc\u91d1\u62a4\u7b26","/actions/crafting/basic_enhancing_charm":"\u57fa\u7840\u5f3a\u5316\u62a4\u7b26","/actions/crafting/basic_torch":"\u57fa\u7840\u706b\u628a","/actions/crafting/cedar_shield":"\u96ea\u677e\u76fe","/actions/crafting/cedar_nature_staff":"\u96ea\u677e\u81ea\u7136\u6cd5\u6756","/actions/crafting/cedar_bow":"\u96ea\u677e\u5f13","/actions/crafting/crushed_amber":"\u7425\u73c0\u788e\u7247","/actions/crafting/cedar_fire_staff":"\u96ea\u677e\u706b\u6cd5\u6756","/actions/crafting/ring_of_essence_find":"\u7cbe\u534e\u53d1\u73b0\u6212\u6307","/actions/crafting/earrings_of_essence_find":"\u7cbe\u534e\u53d1\u73b0\u8033\u73af","/actions/crafting/necklace_of_efficiency":"\u6548\u7387\u9879\u94fe","/actions/crafting/purpleheart_lumber":"\u7d2b\u5fc3\u6728\u677f","/actions/crafting/purpleheart_crossbow":"\u7d2b\u5fc3\u5f29","/actions/crafting/purpleheart_water_staff":"\u7d2b\u5fc3\u6c34\u6cd5\u6756","/actions/crafting/purpleheart_shield":"\u7d2b\u5fc3\u76fe","/actions/crafting/purpleheart_nature_staff":"\u7d2b\u5fc3\u81ea\u7136\u6cd5\u6756","/actions/crafting/purpleheart_bow":"\u7d2b\u5fc3\u5f13","/actions/crafting/advanced_milking_charm":"\u9ad8\u7ea7\u6324\u5976\u62a4\u7b26","/actions/crafting/advanced_foraging_charm":"\u9ad8\u7ea7\u91c7\u6458\u62a4\u7b26","/actions/crafting/advanced_woodcutting_charm":"\u9ad8\u7ea7\u4f10\u6728\u62a4\u7b26","/actions/crafting/advanced_cheesesmithing_charm":"\u9ad8\u7ea7\u5976\u916a\u953b\u9020\u62a4\u7b26","/actions/crafting/advanced_crafting_charm":"\u9ad8\u7ea7\u5236\u4f5c\u62a4\u7b26","/actions/crafting/advanced_tailoring_charm":"\u9ad8\u7ea7\u7f1d\u7eab\u62a4\u7b26","/actions/crafting/advanced_cooking_charm":"\u9ad8\u7ea7\u70f9\u996a\u62a4\u7b26","/actions/crafting/advanced_brewing_charm":"\u9ad8\u7ea7\u51b2\u6ce1\u62a4\u7b26","/actions/crafting/advanced_alchemy_charm":"\u9ad8\u7ea7\u70bc\u91d1\u62a4\u7b26","/actions/crafting/advanced_enhancing_charm":"\u9ad8\u7ea7\u5f3a\u5316\u62a4\u7b26","/actions/crafting/advanced_stamina_charm":"\u9ad8\u7ea7\u8010\u529b\u62a4\u7b26","/actions/crafting/advanced_intelligence_charm":"\u9ad8\u7ea7\u667a\u529b\u62a4\u7b26","/actions/crafting/advanced_attack_charm":"\u9ad8\u7ea7\u653b\u51fb\u62a4\u7b26","/actions/crafting/advanced_defense_charm":"\u9ad8\u7ea7\u9632\u5fa1\u62a4\u7b26","/actions/crafting/advanced_melee_charm":"\u9ad8\u7ea7\u8fd1\u6218\u62a4\u7b26","/actions/crafting/advanced_ranged_charm":"\u9ad8\u7ea7\u8fdc\u7a0b\u62a4\u7b26","/actions/crafting/advanced_magic_charm":"\u9ad8\u7ea7\u9b54\u6cd5\u62a4\u7b26","/actions/crafting/crushed_garnet":"\u77f3\u69b4\u77f3\u788e\u7247","/actions/crafting/crushed_jade":"\u7fe1\u7fe0\u788e\u7247","/actions/crafting/crushed_amethyst":"\u7d2b\u6c34\u6676\u788e\u7247","/actions/crafting/catalyst_of_coinification":"\u70b9\u91d1\u50ac\u5316\u5242","/actions/crafting/treant_shield":"\u6811\u4eba\u76fe","/actions/crafting/purpleheart_fire_staff":"\u7d2b\u5fc3\u706b\u6cd5\u6756","/actions/crafting/ring_of_regeneration":"\u6062\u590d\u6212\u6307","/actions/crafting/earrings_of_regeneration":"\u6062\u590d\u8033\u73af","/actions/crafting/fighter_necklace":"\u6218\u58eb\u9879\u94fe","/actions/crafting/ginkgo_lumber":"\u94f6\u674f\u6728\u677f","/actions/crafting/ginkgo_crossbow":"\u94f6\u674f\u5f29","/actions/crafting/ginkgo_water_staff":"\u94f6\u674f\u6c34\u6cd5\u6756","/actions/crafting/ring_of_armor":"\u62a4\u7532\u6212\u6307","/actions/crafting/catalyst_of_decomposition":"\u5206\u89e3\u50ac\u5316\u5242","/actions/crafting/advanced_torch":"\u8fdb\u9636\u706b\u628a","/actions/crafting/ginkgo_shield":"\u94f6\u674f\u76fe","/actions/crafting/earrings_of_armor":"\u62a4\u7532\u8033\u73af","/actions/crafting/ginkgo_nature_staff":"\u94f6\u674f\u81ea\u7136\u6cd5\u6756","/actions/crafting/ranger_necklace":"\u5c04\u624b\u9879\u94fe","/actions/crafting/ginkgo_bow":"\u94f6\u674f\u5f13","/actions/crafting/ring_of_resistance":"\u6297\u6027\u6212\u6307","/actions/crafting/crushed_moonstone":"\u6708\u4eae\u77f3\u788e\u7247","/actions/crafting/ginkgo_fire_staff":"\u94f6\u674f\u706b\u6cd5\u6756","/actions/crafting/earrings_of_resistance":"\u6297\u6027\u8033\u73af","/actions/crafting/wizard_necklace":"\u5deb\u5e08\u9879\u94fe","/actions/crafting/ring_of_rare_find":"\u7a00\u6709\u53d1\u73b0\u6212\u6307","/actions/crafting/expert_milking_charm":"\u4e13\u5bb6\u6324\u5976\u62a4\u7b26","/actions/crafting/expert_foraging_charm":"\u4e13\u5bb6\u91c7\u6458\u62a4\u7b26","/actions/crafting/expert_woodcutting_charm":"\u4e13\u5bb6\u4f10\u6728\u62a4\u7b26","/actions/crafting/expert_cheesesmithing_charm":"\u4e13\u5bb6\u5976\u916a\u953b\u9020\u62a4\u7b26","/actions/crafting/expert_crafting_charm":"\u4e13\u5bb6\u5236\u4f5c\u62a4\u7b26","/actions/crafting/expert_tailoring_charm":"\u4e13\u5bb6\u7f1d\u7eab\u62a4\u7b26","/actions/crafting/expert_cooking_charm":"\u4e13\u5bb6\u70f9\u996a\u62a4\u7b26","/actions/crafting/expert_brewing_charm":"\u4e13\u5bb6\u51b2\u6ce1\u62a4\u7b26","/actions/crafting/expert_alchemy_charm":"\u4e13\u5bb6\u70bc\u91d1\u62a4\u7b26","/actions/crafting/expert_enhancing_charm":"\u4e13\u5bb6\u5f3a\u5316\u62a4\u7b26","/actions/crafting/expert_stamina_charm":"\u4e13\u5bb6\u8010\u529b\u62a4\u7b26","/actions/crafting/expert_intelligence_charm":"\u4e13\u5bb6\u667a\u529b\u62a4\u7b26","/actions/crafting/expert_attack_charm":"\u4e13\u5bb6\u653b\u51fb\u62a4\u7b26","/actions/crafting/expert_defense_charm":"\u4e13\u5bb6\u9632\u5fa1\u62a4\u7b26","/actions/crafting/expert_melee_charm":"\u4e13\u5bb6\u8fd1\u6218\u62a4\u7b26","/actions/crafting/expert_ranged_charm":"\u4e13\u5bb6\u8fdc\u7a0b\u62a4\u7b26","/actions/crafting/expert_magic_charm":"\u4e13\u5bb6\u9b54\u6cd5\u62a4\u7b26","/actions/crafting/catalyst_of_transmutation":"\u8f6c\u5316\u50ac\u5316\u5242","/actions/crafting/earrings_of_rare_find":"\u7a00\u6709\u53d1\u73b0\u8033\u73af","/actions/crafting/necklace_of_wisdom":"\u7ecf\u9a8c\u9879\u94fe","/actions/crafting/redwood_lumber":"\u7ea2\u6749\u6728\u677f","/actions/crafting/redwood_crossbow":"\u7ea2\u6749\u5f29","/actions/crafting/redwood_water_staff":"\u7ea2\u6749\u6c34\u6cd5\u6756","/actions/crafting/redwood_shield":"\u7ea2\u6749\u76fe","/actions/crafting/redwood_nature_staff":"\u7ea2\u6749\u81ea\u7136\u6cd5\u6756","/actions/crafting/redwood_bow":"\u7ea2\u6749\u5f13","/actions/crafting/crushed_sunstone":"\u592a\u9633\u77f3\u788e\u7247","/actions/crafting/chimerical_entry_key":"\u5947\u5e7b\u94a5\u5319","/actions/crafting/chimerical_chest_key":"\u5947\u5e7b\u5b9d\u7bb1\u94a5\u5319","/actions/crafting/eye_watch":"\u638c\u4e0a\u76d1\u5de5","/actions/crafting/watchful_relic":"\u8b66\u6212\u9057\u7269","/actions/crafting/redwood_fire_staff":"\u7ea2\u6749\u706b\u6cd5\u6756","/actions/crafting/ring_of_critical_strike":"\u66b4\u51fb\u6212\u6307","/actions/crafting/mirror_of_protection":"\u4fdd\u62a4\u4e4b\u955c","/actions/crafting/earrings_of_critical_strike":"\u66b4\u51fb\u8033\u73af","/actions/crafting/necklace_of_speed":"\u901f\u5ea6\u9879\u94fe","/actions/crafting/arcane_lumber":"\u795e\u79d8\u6728\u677f","/actions/crafting/arcane_crossbow":"\u795e\u79d8\u5f29","/actions/crafting/arcane_water_staff":"\u795e\u79d8\u6c34\u6cd5\u6756","/actions/crafting/master_milking_charm":"\u5927\u5e08\u6324\u5976\u62a4\u7b26","/actions/crafting/master_foraging_charm":"\u5927\u5e08\u91c7\u6458\u62a4\u7b26","/actions/crafting/master_woodcutting_charm":"\u5927\u5e08\u4f10\u6728\u62a4\u7b26","/actions/crafting/master_cheesesmithing_charm":"\u5927\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26","/actions/crafting/master_crafting_charm":"\u5927\u5e08\u5236\u4f5c\u62a4\u7b26","/actions/crafting/master_tailoring_charm":"\u5927\u5e08\u7f1d\u7eab\u62a4\u7b26","/actions/crafting/master_cooking_charm":"\u5927\u5e08\u70f9\u996a\u62a4\u7b26","/actions/crafting/master_brewing_charm":"\u5927\u5e08\u51b2\u6ce1\u62a4\u7b26","/actions/crafting/master_alchemy_charm":"\u5927\u5e08\u70bc\u91d1\u62a4\u7b26","/actions/crafting/master_enhancing_charm":"\u5927\u5e08\u5f3a\u5316\u62a4\u7b26","/actions/crafting/master_stamina_charm":"\u5927\u5e08\u8010\u529b\u62a4\u7b26","/actions/crafting/master_intelligence_charm":"\u5927\u5e08\u667a\u529b\u62a4\u7b26","/actions/crafting/master_attack_charm":"\u5927\u5e08\u653b\u51fb\u62a4\u7b26","/actions/crafting/master_defense_charm":"\u5927\u5e08\u9632\u5fa1\u62a4\u7b26","/actions/crafting/master_melee_charm":"\u5927\u5e08\u8fd1\u6218\u62a4\u7b26","/actions/crafting/master_ranged_charm":"\u5927\u5e08\u8fdc\u7a0b\u62a4\u7b26","/actions/crafting/master_magic_charm":"\u5927\u5e08\u9b54\u6cd5\u62a4\u7b26","/actions/crafting/sinister_entry_key":"\u9634\u68ee\u94a5\u5319","/actions/crafting/sinister_chest_key":"\u9634\u68ee\u5b9d\u7bb1\u94a5\u5319","/actions/crafting/expert_torch":"\u4e13\u5bb6\u706b\u628a","/actions/crafting/arcane_shield":"\u795e\u79d8\u76fe","/actions/crafting/arcane_nature_staff":"\u795e\u79d8\u81ea\u7136\u6cd5\u6756","/actions/crafting/manticore_shield":"\u874e\u72ee\u76fe","/actions/crafting/arcane_bow":"\u795e\u79d8\u5f13","/actions/crafting/enchanted_entry_key":"\u79d8\u6cd5\u94a5\u5319","/actions/crafting/enchanted_chest_key":"\u79d8\u6cd5\u5b9d\u7bb1\u94a5\u5319","/actions/crafting/pirate_entry_key":"\u6d77\u76d7\u94a5\u5319","/actions/crafting/pirate_chest_key":"\u6d77\u76d7\u5b9d\u7bb1\u94a5\u5319","/actions/crafting/arcane_fire_staff":"\u795e\u79d8\u706b\u6cd5\u6756","/actions/crafting/vampiric_bow":"\u5438\u8840\u5f13","/actions/crafting/soul_hunter_crossbow":"\u7075\u9b42\u730e\u624b\u5f29","/actions/crafting/frost_staff":"\u51b0\u971c\u6cd5\u6756","/actions/crafting/infernal_battlestaff":"\u70bc\u72f1\u6cd5\u6756","/actions/crafting/jackalope_staff":"\u9e7f\u89d2\u5154\u4e4b\u6756","/actions/crafting/philosophers_ring":"\u8d24\u8005\u6212\u6307","/actions/crafting/crushed_philosophers_stone":"\u8d24\u8005\u4e4b\u77f3\u788e\u7247","/actions/crafting/philosophers_earrings":"\u8d24\u8005\u8033\u73af","/actions/crafting/philosophers_necklace":"\u8d24\u8005\u9879\u94fe","/actions/crafting/bishops_codex":"\u4e3b\u6559\u6cd5\u5178","/actions/crafting/cursed_bow":"\u5492\u6028\u4e4b\u5f13","/actions/crafting/sundering_crossbow":"\u88c2\u7a7a\u4e4b\u5f29","/actions/crafting/rippling_trident":"\u6d9f\u6f2a\u4e09\u53c9\u621f","/actions/crafting/blooming_trident":"\u7efd\u653e\u4e09\u53c9\u621f","/actions/crafting/blazing_trident":"\u70bd\u7130\u4e09\u53c9\u621f","/actions/crafting/grandmaster_milking_charm":"\u5b97\u5e08\u6324\u5976\u62a4\u7b26","/actions/crafting/grandmaster_foraging_charm":"\u5b97\u5e08\u91c7\u6458\u62a4\u7b26","/actions/crafting/grandmaster_woodcutting_charm":"\u5b97\u5e08\u4f10\u6728\u62a4\u7b26","/actions/crafting/grandmaster_cheesesmithing_charm":"\u5b97\u5e08\u5976\u916a\u953b\u9020\u62a4\u7b26","/actions/crafting/grandmaster_crafting_charm":"\u5b97\u5e08\u5236\u4f5c\u62a4\u7b26","/actions/crafting/grandmaster_tailoring_charm":"\u5b97\u5e08\u7f1d\u7eab\u62a4\u7b26","/actions/crafting/grandmaster_cooking_charm":"\u5b97\u5e08\u70f9\u996a\u62a4\u7b26","/actions/crafting/grandmaster_brewing_charm":"\u5b97\u5e08\u51b2\u6ce1\u62a4\u7b26","/actions/crafting/grandmaster_alchemy_charm":"\u5b97\u5e08\u70bc\u91d1\u62a4\u7b26","/actions/crafting/grandmaster_enhancing_charm":"\u5b97\u5e08\u5f3a\u5316\u62a4\u7b26","/actions/crafting/grandmaster_stamina_charm":"\u5b97\u5e08\u8010\u529b\u62a4\u7b26","/actions/crafting/grandmaster_intelligence_charm":"\u5b97\u5e08\u667a\u529b\u62a4\u7b26","/actions/crafting/grandmaster_attack_charm":"\u5b97\u5e08\u653b\u51fb\u62a4\u7b26","/actions/crafting/grandmaster_defense_charm":"\u5b97\u5e08\u9632\u5fa1\u62a4\u7b26","/actions/crafting/grandmaster_melee_charm":"\u5b97\u5e08\u8fd1\u6218\u62a4\u7b26","/actions/crafting/grandmaster_ranged_charm":"\u5b97\u5e08\u8fdc\u7a0b\u62a4\u7b26","/actions/crafting/grandmaster_magic_charm":"\u5b97\u5e08\u9b54\u6cd5\u62a4\u7b26","/actions/crafting/philosophers_mirror":"\u8d24\u8005\u4e4b\u955c","/actions/crafting/bishops_codex_refined":"\u4e3b\u6559\u6cd5\u5178\uff08\u7cbe\uff09","/actions/crafting/cursed_bow_refined":"\u5492\u6028\u4e4b\u5f13\uff08\u7cbe\uff09","/actions/crafting/sundering_crossbow_refined":"\u88c2\u7a7a\u4e4b\u5f29\uff08\u7cbe\uff09","/actions/crafting/rippling_trident_refined":"\u6d9f\u6f2a\u4e09\u53c9\u621f\uff08\u7cbe\uff09","/actions/crafting/blooming_trident_refined":"\u7efd\u653e\u4e09\u53c9\u621f\uff08\u7cbe\uff09","/actions/crafting/blazing_trident_refined":"\u70bd\u7130\u4e09\u53c9\u621f\uff08\u7cbe\uff09","/actions/tailoring/rough_leather":"\u7c97\u7cd9\u76ae\u9769","/actions/tailoring/cotton_fabric":"\u68c9\u82b1\u5e03\u6599","/actions/tailoring/rough_boots":"\u7c97\u7cd9\u9774","/actions/tailoring/cotton_boots":"\u68c9\u9774","/actions/tailoring/rough_bracers":"\u7c97\u7cd9\u62a4\u8155","/actions/tailoring/cotton_gloves":"\u68c9\u624b\u5957","/actions/tailoring/small_pouch":"\u5c0f\u888b\u5b50","/actions/tailoring/rough_hood":"\u7c97\u7cd9\u515c\u5e3d","/actions/tailoring/cotton_hat":"\u68c9\u5e3d","/actions/tailoring/rough_chaps":"\u7c97\u7cd9\u76ae\u88e4","/actions/tailoring/cotton_robe_bottoms":"\u68c9\u888d\u88d9","/actions/tailoring/rough_tunic":"\u7c97\u7cd9\u76ae\u8863","/actions/tailoring/cotton_robe_top":"\u68c9\u888d\u670d","/actions/tailoring/reptile_leather":"\u722c\u884c\u52a8\u7269\u76ae\u9769","/actions/tailoring/linen_fabric":"\u4e9a\u9ebb\u5e03\u6599","/actions/tailoring/reptile_boots":"\u722c\u884c\u52a8\u7269\u9774","/actions/tailoring/linen_boots":"\u4e9a\u9ebb\u9774","/actions/tailoring/reptile_bracers":"\u722c\u884c\u52a8\u7269\u62a4\u8155","/actions/tailoring/linen_gloves":"\u4e9a\u9ebb\u624b\u5957","/actions/tailoring/basic_shroud":"\u57fa\u7840\u6597\u7bf7","/actions/tailoring/reptile_hood":"\u722c\u884c\u52a8\u7269\u515c\u5e3d","/actions/tailoring/linen_hat":"\u4e9a\u9ebb\u5e3d","/actions/tailoring/reptile_chaps":"\u722c\u884c\u52a8\u7269\u76ae\u88e4","/actions/tailoring/linen_robe_bottoms":"\u4e9a\u9ebb\u888d\u88d9","/actions/tailoring/medium_pouch":"\u4e2d\u888b\u5b50","/actions/tailoring/reptile_tunic":"\u722c\u884c\u52a8\u7269\u76ae\u8863","/actions/tailoring/linen_robe_top":"\u4e9a\u9ebb\u888d\u670d","/actions/tailoring/shoebill_shoes":"\u9cb8\u5934\u9e73\u978b","/actions/tailoring/gobo_leather":"\u54e5\u5e03\u6797\u76ae\u9769","/actions/tailoring/bamboo_fabric":"\u7af9\u5b50\u5e03\u6599","/actions/tailoring/gobo_boots":"\u54e5\u5e03\u6797\u9774","/actions/tailoring/bamboo_boots":"\u7af9\u9774","/actions/tailoring/gobo_bracers":"\u54e5\u5e03\u6797\u62a4\u8155","/actions/tailoring/bamboo_gloves":"\u7af9\u624b\u5957","/actions/tailoring/gobo_hood":"\u54e5\u5e03\u6797\u515c\u5e3d","/actions/tailoring/bamboo_hat":"\u7af9\u5e3d","/actions/tailoring/gobo_chaps":"\u54e5\u5e03\u6797\u76ae\u88e4","/actions/tailoring/bamboo_robe_bottoms":"\u7af9\u888d\u88d9","/actions/tailoring/large_pouch":"\u5927\u888b\u5b50","/actions/tailoring/gobo_tunic":"\u54e5\u5e03\u6797\u76ae\u8863","/actions/tailoring/bamboo_robe_top":"\u7af9\u888d\u670d","/actions/tailoring/marine_tunic":"\u6d77\u6d0b\u76ae\u8863","/actions/tailoring/marine_chaps":"\u822a\u6d77\u76ae\u88e4","/actions/tailoring/icy_robe_top":"\u51b0\u971c\u888d\u670d","/actions/tailoring/icy_robe_bottoms":"\u51b0\u971c\u888d\u88d9","/actions/tailoring/flaming_robe_top":"\u70c8\u7130\u888d\u670d","/actions/tailoring/flaming_robe_bottoms":"\u70c8\u7130\u888d\u88d9","/actions/tailoring/advanced_shroud":"\u8fdb\u9636\u6597\u7bf7","/actions/tailoring/beast_leather":"\u91ce\u517d\u76ae\u9769","/actions/tailoring/silk_fabric":"\u4e1d\u7ef8","/actions/tailoring/beast_boots":"\u91ce\u517d\u9774","/actions/tailoring/silk_boots":"\u4e1d\u9774","/actions/tailoring/beast_bracers":"\u91ce\u517d\u62a4\u8155","/actions/tailoring/silk_gloves":"\u4e1d\u624b\u5957","/actions/tailoring/collectors_boots":"\u6536\u85cf\u5bb6\u9774","/actions/tailoring/sighted_bracers":"\u7784\u51c6\u62a4\u8155","/actions/tailoring/beast_hood":"\u91ce\u517d\u515c\u5e3d","/actions/tailoring/silk_hat":"\u4e1d\u5e3d","/actions/tailoring/beast_chaps":"\u91ce\u517d\u76ae\u88e4","/actions/tailoring/silk_robe_bottoms":"\u4e1d\u7ef8\u888d\u88d9","/actions/tailoring/centaur_boots":"\u534a\u4eba\u9a6c\u9774","/actions/tailoring/sorcerer_boots":"\u5deb\u5e08\u9774","/actions/tailoring/giant_pouch":"\u5de8\u5927\u888b\u5b50","/actions/tailoring/beast_tunic":"\u91ce\u517d\u76ae\u8863","/actions/tailoring/silk_robe_top":"\u4e1d\u7ef8\u888d\u670d","/actions/tailoring/red_culinary_hat":"\u7ea2\u8272\u53a8\u5e08\u5e3d","/actions/tailoring/luna_robe_top":"\u6708\u795e\u888d\u670d","/actions/tailoring/luna_robe_bottoms":"\u6708\u795e\u888d\u88d9","/actions/tailoring/umbral_leather":"\u6697\u5f71\u76ae\u9769","/actions/tailoring/radiant_fabric":"\u5149\u8f89\u5e03\u6599","/actions/tailoring/umbral_boots":"\u6697\u5f71\u9774","/actions/tailoring/radiant_boots":"\u5149\u8f89\u9774","/actions/tailoring/umbral_bracers":"\u6697\u5f71\u62a4\u8155","/actions/tailoring/radiant_gloves":"\u5149\u8f89\u624b\u5957","/actions/tailoring/enchanted_gloves":"\u9644\u9b54\u624b\u5957","/actions/tailoring/fluffy_red_hat":"\u84ec\u677e\u7ea2\u5e3d\u5b50","/actions/tailoring/chrono_gloves":"\u65f6\u7a7a\u624b\u5957","/actions/tailoring/expert_shroud":"\u4e13\u5bb6\u6597\u7bf7","/actions/tailoring/umbral_hood":"\u6697\u5f71\u515c\u5e3d","/actions/tailoring/radiant_hat":"\u5149\u8f89\u5e3d","/actions/tailoring/umbral_chaps":"\u6697\u5f71\u76ae\u88e4","/actions/tailoring/radiant_robe_bottoms":"\u5149\u8f89\u888d\u88d9","/actions/tailoring/umbral_tunic":"\u6697\u5f71\u76ae\u8863","/actions/tailoring/radiant_robe_top":"\u5149\u8f89\u888d\u670d","/actions/tailoring/revenant_chaps":"\u4ea1\u7075\u76ae\u88e4","/actions/tailoring/griffin_chaps":"\u72ee\u9e6b\u76ae\u88e4","/actions/tailoring/dairyhands_top":"\u6324\u5976\u5de5\u4e0a\u8863","/actions/tailoring/dairyhands_bottoms":"\u6324\u5976\u5de5\u4e0b\u88c5","/actions/tailoring/foragers_top":"\u91c7\u6458\u8005\u4e0a\u8863","/actions/tailoring/foragers_bottoms":"\u91c7\u6458\u8005\u4e0b\u88c5","/actions/tailoring/lumberjacks_top":"\u4f10\u6728\u5de5\u4e0a\u8863","/actions/tailoring/lumberjacks_bottoms":"\u4f10\u6728\u5de5\u4e0b\u88c5","/actions/tailoring/cheesemakers_top":"\u5976\u916a\u5e08\u4e0a\u8863","/actions/tailoring/cheesemakers_bottoms":"\u5976\u916a\u5e08\u4e0b\u88c5","/actions/tailoring/crafters_top":"\u5de5\u5320\u4e0a\u8863","/actions/tailoring/crafters_bottoms":"\u5de5\u5320\u4e0b\u88c5","/actions/tailoring/tailors_top":"\u88c1\u7f1d\u4e0a\u8863","/actions/tailoring/tailors_bottoms":"\u88c1\u7f1d\u4e0b\u88c5","/actions/tailoring/chefs_top":"\u53a8\u5e08\u4e0a\u8863","/actions/tailoring/chefs_bottoms":"\u53a8\u5e08\u4e0b\u88c5","/actions/tailoring/brewers_top":"\u996e\u54c1\u5e08\u4e0a\u8863","/actions/tailoring/brewers_bottoms":"\u996e\u54c1\u5e08\u4e0b\u88c5","/actions/tailoring/alchemists_top":"\u70bc\u91d1\u5e08\u4e0a\u8863","/actions/tailoring/alchemists_bottoms":"\u70bc\u91d1\u5e08\u4e0b\u88c5","/actions/tailoring/enhancers_top":"\u5f3a\u5316\u5e08\u4e0a\u8863","/actions/tailoring/enhancers_bottoms":"\u5f3a\u5316\u5e08\u4e0b\u88c5","/actions/tailoring/revenant_tunic":"\u4ea1\u7075\u76ae\u8863","/actions/tailoring/griffin_tunic":"\u72ee\u9e6b\u76ae\u8863","/actions/tailoring/gluttonous_pouch":"\u8d2a\u98df\u4e4b\u888b","/actions/tailoring/guzzling_pouch":"\u66b4\u996e\u4e4b\u56ca","/actions/tailoring/pathfinder_boots":"\u63a2\u8def\u8005\u9774","/actions/tailoring/pathseeker_boots":"\u5bfb\u8def\u8005\u9774","/actions/tailoring/marksman_bracers":"\u795e\u5c04\u62a4\u8155","/actions/tailoring/acrobatic_hood":"\u6742\u6280\u5e08\u515c\u5e3d","/actions/tailoring/magicians_hat":"\u9b54\u672f\u5e08\u5e3d","/actions/tailoring/kraken_chaps":"\u514b\u62c9\u80af\u76ae\u88e4","/actions/tailoring/royal_water_robe_bottoms":"\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9","/actions/tailoring/royal_nature_robe_bottoms":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9","/actions/tailoring/royal_fire_robe_bottoms":"\u7687\u5bb6\u706b\u7cfb\u888d\u88d9","/actions/tailoring/kraken_tunic":"\u514b\u62c9\u80af\u76ae\u8863","/actions/tailoring/royal_water_robe_top":"\u7687\u5bb6\u6c34\u7cfb\u888d\u670d","/actions/tailoring/royal_nature_robe_top":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d","/actions/tailoring/royal_fire_robe_top":"\u7687\u5bb6\u706b\u7cfb\u888d\u670d","/actions/tailoring/gatherer_cape_refined":"\u91c7\u96c6\u8005\u62ab\u98ce\uff08\u7cbe\uff09","/actions/tailoring/artificer_cape_refined":"\u5de5\u5320\u62ab\u98ce\uff08\u7cbe\uff09","/actions/tailoring/culinary_cape_refined":"\u53a8\u5e08\u62ab\u98ce\uff08\u7cbe\uff09","/actions/tailoring/chance_cape_refined":"\u673a\u7f18\u62ab\u98ce\uff08\u7cbe\uff09","/actions/tailoring/chimerical_quiver_refined":"\u5947\u5e7b\u7bad\u888b\uff08\u7cbe\uff09","/actions/tailoring/sinister_cape_refined":"\u9634\u68ee\u62ab\u98ce\uff08\u7cbe\uff09","/actions/tailoring/enchanted_cloak_refined":"\u79d8\u6cd5\u62ab\u98ce\uff08\u7cbe\uff09","/actions/tailoring/pathfinder_boots_refined":"\u63a2\u8def\u8005\u9774\uff08\u7cbe\uff09","/actions/tailoring/pathseeker_boots_refined":"\u5bfb\u8def\u8005\u9774\uff08\u7cbe\uff09","/actions/tailoring/marksman_bracers_refined":"\u795e\u5c04\u62a4\u8155\uff08\u7cbe\uff09","/actions/tailoring/acrobatic_hood_refined":"\u6742\u6280\u5e08\u515c\u5e3d\uff08\u7cbe\uff09","/actions/tailoring/magicians_hat_refined":"\u9b54\u672f\u5e08\u5e3d\uff08\u7cbe\uff09","/actions/tailoring/kraken_chaps_refined":"\u514b\u62c9\u80af\u76ae\u88e4\uff08\u7cbe\uff09","/actions/tailoring/royal_water_robe_bottoms_refined":"\u7687\u5bb6\u6c34\u7cfb\u888d\u88d9\uff08\u7cbe\uff09","/actions/tailoring/royal_nature_robe_bottoms_refined":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u88d9\uff08\u7cbe\uff09","/actions/tailoring/royal_fire_robe_bottoms_refined":"\u7687\u5bb6\u706b\u7cfb\u888d\u88d9\uff08\u7cbe\uff09","/actions/tailoring/kraken_tunic_refined":"\u514b\u62c9\u80af\u76ae\u8863\uff08\u7cbe\uff09","/actions/tailoring/royal_water_robe_top_refined":"\u7687\u5bb6\u6c34\u7cfb\u888d\u670d\uff08\u7cbe\uff09","/actions/tailoring/royal_nature_robe_top_refined":"\u7687\u5bb6\u81ea\u7136\u7cfb\u888d\u670d\uff08\u7cbe\uff09","/actions/tailoring/royal_fire_robe_top_refined":"\u7687\u5bb6\u706b\u7cfb\u888d\u670d\uff08\u7cbe\uff09","/actions/cooking/donut":"\u751c\u751c\u5708","/actions/cooking/cupcake":"\u7eb8\u676f\u86cb\u7cd5","/actions/cooking/gummy":"\u8f6f\u7cd6","/actions/cooking/yogurt":"\u9178\u5976","/actions/cooking/blueberry_donut":"\u84dd\u8393\u751c\u751c\u5708","/actions/cooking/blueberry_cake":"\u84dd\u8393\u86cb\u7cd5","/actions/cooking/apple_gummy":"\u82f9\u679c\u8f6f\u7cd6","/actions/cooking/apple_yogurt":"\u82f9\u679c\u9178\u5976","/actions/cooking/blackberry_donut":"\u9ed1\u8393\u751c\u751c\u5708","/actions/cooking/blackberry_cake":"\u9ed1\u8393\u86cb\u7cd5","/actions/cooking/orange_gummy":"\u6a59\u5b50\u8f6f\u7cd6","/actions/cooking/orange_yogurt":"\u6a59\u5b50\u9178\u5976","/actions/cooking/basic_food_crate":"\u57fa\u7840\u98df\u7269\u7bb1","/actions/cooking/strawberry_donut":"\u8349\u8393\u751c\u751c\u5708","/actions/cooking/strawberry_cake":"\u8349\u8393\u86cb\u7cd5","/actions/cooking/plum_gummy":"\u674e\u5b50\u8f6f\u7cd6","/actions/cooking/plum_yogurt":"\u674e\u5b50\u9178\u5976","/actions/cooking/mooberry_donut":"\u54de\u8393\u751c\u751c\u5708","/actions/cooking/mooberry_cake":"\u54de\u8393\u86cb\u7cd5","/actions/cooking/peach_gummy":"\u6843\u5b50\u8f6f\u7cd6","/actions/cooking/peach_yogurt":"\u6843\u5b50\u9178\u5976","/actions/cooking/advanced_food_crate":"\u8fdb\u9636\u98df\u7269\u7bb1","/actions/cooking/marsberry_donut":"\u706b\u661f\u8393\u751c\u751c\u5708","/actions/cooking/marsberry_cake":"\u706b\u661f\u8393\u86cb\u7cd5","/actions/cooking/dragon_fruit_gummy":"\u706b\u9f99\u679c\u8f6f\u7cd6","/actions/cooking/dragon_fruit_yogurt":"\u706b\u9f99\u679c\u9178\u5976","/actions/cooking/spaceberry_donut":"\u592a\u7a7a\u8393\u751c\u751c\u5708","/actions/cooking/spaceberry_cake":"\u592a\u7a7a\u8393\u86cb\u7cd5","/actions/cooking/star_fruit_gummy":"\u6768\u6843\u8f6f\u7cd6","/actions/cooking/star_fruit_yogurt":"\u6768\u6843\u9178\u5976","/actions/cooking/expert_food_crate":"\u4e13\u5bb6\u98df\u7269\u7bb1","/actions/brewing/milking_tea":"\u6324\u5976\u8336","/actions/brewing/stamina_coffee":"\u8010\u529b\u5496\u5561","/actions/brewing/foraging_tea":"\u91c7\u6458\u8336","/actions/brewing/intelligence_coffee":"\u667a\u529b\u5496\u5561","/actions/brewing/gathering_tea":"\u91c7\u96c6\u8336","/actions/brewing/woodcutting_tea":"\u4f10\u6728\u8336","/actions/brewing/cooking_tea":"\u70f9\u996a\u8336","/actions/brewing/defense_coffee":"\u9632\u5fa1\u5496\u5561","/actions/brewing/brewing_tea":"\u51b2\u6ce1\u8336","/actions/brewing/attack_coffee":"\u653b\u51fb\u5496\u5561","/actions/brewing/gourmet_tea":"\u7f8e\u98df\u8336","/actions/brewing/alchemy_tea":"\u70bc\u91d1\u8336","/actions/brewing/enhancing_tea":"\u5f3a\u5316\u8336","/actions/brewing/cheesesmithing_tea":"\u5976\u916a\u953b\u9020\u8336","/actions/brewing/melee_coffee":"\u8fd1\u6218\u5496\u5561","/actions/brewing/basic_tea_crate":"\u57fa\u7840\u8336\u53f6\u7bb1","/actions/brewing/basic_coffee_crate":"\u57fa\u7840\u5496\u5561\u7bb1","/actions/brewing/crafting_tea":"\u5236\u4f5c\u8336","/actions/brewing/ranged_coffee":"\u8fdc\u7a0b\u5496\u5561","/actions/brewing/wisdom_tea":"\u7ecf\u9a8c\u8336","/actions/brewing/wisdom_coffee":"\u7ecf\u9a8c\u5496\u5561","/actions/brewing/tailoring_tea":"\u7f1d\u7eab\u8336","/actions/brewing/magic_coffee":"\u9b54\u6cd5\u5496\u5561","/actions/brewing/super_milking_tea":"\u8d85\u7ea7\u6324\u5976\u8336","/actions/brewing/super_stamina_coffee":"\u8d85\u7ea7\u8010\u529b\u5496\u5561","/actions/brewing/super_foraging_tea":"\u8d85\u7ea7\u91c7\u6458\u8336","/actions/brewing/super_intelligence_coffee":"\u8d85\u7ea7\u667a\u529b\u5496\u5561","/actions/brewing/processing_tea":"\u52a0\u5de5\u8336","/actions/brewing/lucky_coffee":"\u5e78\u8fd0\u5496\u5561","/actions/brewing/super_woodcutting_tea":"\u8d85\u7ea7\u4f10\u6728\u8336","/actions/brewing/super_cooking_tea":"\u8d85\u7ea7\u70f9\u996a\u8336","/actions/brewing/super_defense_coffee":"\u8d85\u7ea7\u9632\u5fa1\u5496\u5561","/actions/brewing/advanced_tea_crate":"\u8fdb\u9636\u8336\u53f6\u7bb1","/actions/brewing/advanced_coffee_crate":"\u8fdb\u9636\u5496\u5561\u7bb1","/actions/brewing/super_brewing_tea":"\u8d85\u7ea7\u51b2\u6ce1\u8336","/actions/brewing/ultra_milking_tea":"\u7a76\u6781\u6324\u5976\u8336","/actions/brewing/super_attack_coffee":"\u8d85\u7ea7\u653b\u51fb\u5496\u5561","/actions/brewing/ultra_stamina_coffee":"\u7a76\u6781\u8010\u529b\u5496\u5561","/actions/brewing/efficiency_tea":"\u6548\u7387\u8336","/actions/brewing/swiftness_coffee":"\u8fc5\u6377\u5496\u5561","/actions/brewing/super_alchemy_tea":"\u8d85\u7ea7\u70bc\u91d1\u8336","/actions/brewing/super_enhancing_tea":"\u8d85\u7ea7\u5f3a\u5316\u8336","/actions/brewing/ultra_foraging_tea":"\u7a76\u6781\u91c7\u6458\u8336","/actions/brewing/ultra_intelligence_coffee":"\u7a76\u6781\u667a\u529b\u5496\u5561","/actions/brewing/channeling_coffee":"\u541f\u5531\u5496\u5561","/actions/brewing/super_cheesesmithing_tea":"\u8d85\u7ea7\u5976\u916a\u953b\u9020\u8336","/actions/brewing/ultra_woodcutting_tea":"\u7a76\u6781\u4f10\u6728\u8336","/actions/brewing/super_melee_coffee":"\u8d85\u7ea7\u8fd1\u6218\u5496\u5561","/actions/brewing/artisan_tea":"\u5de5\u5320\u8336","/actions/brewing/super_crafting_tea":"\u8d85\u7ea7\u5236\u4f5c\u8336","/actions/brewing/ultra_cooking_tea":"\u7a76\u6781\u70f9\u996a\u8336","/actions/brewing/super_ranged_coffee":"\u8d85\u7ea7\u8fdc\u7a0b\u5496\u5561","/actions/brewing/ultra_defense_coffee":"\u7a76\u6781\u9632\u5fa1\u5496\u5561","/actions/brewing/catalytic_tea":"\u50ac\u5316\u8336","/actions/brewing/critical_coffee":"\u66b4\u51fb\u5496\u5561","/actions/brewing/super_tailoring_tea":"\u8d85\u7ea7\u7f1d\u7eab\u8336","/actions/brewing/ultra_brewing_tea":"\u7a76\u6781\u51b2\u6ce1\u8336","/actions/brewing/super_magic_coffee":"\u8d85\u7ea7\u9b54\u6cd5\u5496\u5561","/actions/brewing/ultra_attack_coffee":"\u7a76\u6781\u653b\u51fb\u5496\u5561","/actions/brewing/blessed_tea":"\u798f\u6c14\u8336","/actions/brewing/ultra_alchemy_tea":"\u7a76\u6781\u70bc\u91d1\u8336","/actions/brewing/ultra_enhancing_tea":"\u7a76\u6781\u5f3a\u5316\u8336","/actions/brewing/expert_tea_crate":"\u4e13\u5bb6\u8336\u53f6\u7bb1","/actions/brewing/expert_coffee_crate":"\u4e13\u5bb6\u5496\u5561\u7bb1","/actions/brewing/ultra_cheesesmithing_tea":"\u7a76\u6781\u5976\u916a\u953b\u9020\u8336","/actions/brewing/ultra_melee_coffee":"\u7a76\u6781\u8fd1\u6218\u5496\u5561","/actions/brewing/ultra_crafting_tea":"\u7a76\u6781\u5236\u4f5c\u8336","/actions/brewing/ultra_ranged_coffee":"\u7a76\u6781\u8fdc\u7a0b\u5496\u5561","/actions/brewing/ultra_tailoring_tea":"\u7a76\u6781\u7f1d\u7eab\u8336","/actions/brewing/ultra_magic_coffee":"\u7a76\u6781\u9b54\u6cd5\u5496\u5561","/actions/alchemy/coinify":"\u70b9\u91d1","/actions/alchemy/transmute":"\u8f6c\u5316","/actions/alchemy/decompose":"\u5206\u89e3","/actions/alchemy/unrefine":"\u89e3\u7cbe\u70bc","/actions/enhancing/enhance":"\u5f3a\u5316","/actions/combat/fly":"\u82cd\u8747","/actions/combat/rat":"\u6770\u745e","/actions/combat/skunk":"\u81ed\u9f2c","/actions/combat/porcupine":"\u8c6a\u732a","/actions/combat/slimy":"\u53f2\u83b1\u59c6","/actions/combat/smelly_planet":"\u81ed\u81ed\u661f\u7403","/actions/combat/frog":"\u9752\u86d9","/actions/combat/snake":"\u86c7","/actions/combat/swampy":"\u6cbc\u6cfd\u866b","/actions/combat/alligator":"\u590f\u6d1b\u514b","/actions/combat/swamp_planet":"\u6cbc\u6cfd\u661f\u7403","/actions/combat/sea_snail":"\u8717\u725b","/actions/combat/crab":"\u8783\u87f9","/actions/combat/aquahorse":"\u6c34\u9a6c","/actions/combat/nom_nom":"\u54ac\u54ac\u9c7c","/actions/combat/turtle":"\u5fcd\u8005\u9f9f","/actions/combat/aqua_planet":"\u6d77\u6d0b\u661f\u7403","/actions/combat/jungle_sprite":"\u4e1b\u6797\u7cbe\u7075","/actions/combat/myconid":"\u8611\u83c7\u4eba","/actions/combat/treant":"\u6811\u4eba","/actions/combat/centaur_archer":"\u534a\u4eba\u9a6c\u5f13\u7bad\u624b","/actions/combat/jungle_planet":"\u4e1b\u6797\u661f\u7403","/actions/combat/gobo_stabby":"\u523a\u523a","/actions/combat/gobo_slashy":"\u780d\u780d","/actions/combat/gobo_smashy":"\u9524\u9524","/actions/combat/gobo_shooty":"\u54bb\u54bb","/actions/combat/gobo_boomy":"\u8f70\u8f70","/actions/combat/gobo_planet":"\u54e5\u5e03\u6797\u661f\u7403","/actions/combat/eye":"\u72ec\u773c","/actions/combat/eyes":"\u53e0\u773c","/actions/combat/veyes":"\u590d\u773c","/actions/combat/planet_of_the_eyes":"\u773c\u7403\u661f\u7403","/actions/combat/novice_sorcerer":"\u65b0\u624b\u5deb\u5e08","/actions/combat/ice_sorcerer":"\u51b0\u971c\u5deb\u5e08","/actions/combat/flame_sorcerer":"\u706b\u7130\u5deb\u5e08","/actions/combat/elementalist":"\u5143\u7d20\u6cd5\u5e08","/actions/combat/sorcerers_tower":"\u5deb\u5e08\u4e4b\u5854","/actions/combat/gummy_bear":"\u8f6f\u7cd6\u718a","/actions/combat/panda":"\u718a\u732b","/actions/combat/black_bear":"\u9ed1\u718a","/actions/combat/grizzly_bear":"\u68d5\u718a","/actions/combat/polar_bear":"\u5317\u6781\u718a","/actions/combat/bear_with_it":"\u718a\u718a\u661f\u7403","/actions/combat/magnetic_golem":"\u78c1\u529b\u9b54\u50cf","/actions/combat/stalactite_golem":"\u949f\u4e73\u77f3\u9b54\u50cf","/actions/combat/granite_golem":"\u82b1\u5c97\u5ca9\u9b54\u50cf","/actions/combat/golem_cave":"\u9b54\u50cf\u6d1e\u7a74","/actions/combat/zombie":"\u50f5\u5c38","/actions/combat/vampire":"\u5438\u8840\u9b3c","/actions/combat/werewolf":"\u72fc\u4eba","/actions/combat/twilight_zone":"\u66ae\u5149\u4e4b\u5730","/actions/combat/abyssal_imp":"\u6df1\u6e0a\u5c0f\u9b3c","/actions/combat/soul_hunter":"\u7075\u9b42\u730e\u624b","/actions/combat/infernal_warlock":"\u5730\u72f1\u672f\u58eb","/actions/combat/infernal_abyss":"\u5730\u72f1\u6df1\u6e0a","/actions/combat/chimerical_den":"\u5947\u5e7b\u6d1e\u7a74","/actions/combat/sinister_circus":"\u9634\u68ee\u9a6c\u620f\u56e2","/actions/combat/enchanted_fortress":"\u79d8\u6cd5\u8981\u585e","/actions/combat/pirate_cove":"\u6d77\u76d7\u57fa\u5730","/actions/labyrinth/explore":"\u63a2\u7d22\u8ff7\u5bab","/actions/special/party_ready":"\u961f\u4f0d\u51c6\u5907\u5c31\u7eea"},actionTypeNames:{"/action_types/milking":"\u6324\u5976","/action_types/foraging":"\u91c7\u6458","/action_types/woodcutting":"\u4f10\u6728","/action_types/cheesesmithing":"\u5976\u916a\u953b\u9020","/action_types/crafting":"\u5236\u4f5c","/action_types/tailoring":"\u7f1d\u7eab","/action_types/cooking":"\u70f9\u996a","/action_types/brewing":"\u51b2\u6ce1","/action_types/alchemy":"\u70bc\u91d1","/action_types/enhancing":"\u5f3a\u5316","/action_types/combat":"\u6218\u6597","/action_types/labyrinth":"\u8ff7\u5bab","/action_types/special":"\u7279\u6b8a"},actionCategoryNames:{"/action_categories/milking/cows":"\u5976\u725b","/action_categories/foraging/farmland":"\u7fe0\u91ce\u519c\u573a","/action_categories/foraging/shimmering_lake":"\u6ce2\u5149\u6e56\u6cca","/action_categories/foraging/misty_forest":"\u8ff7\u96fe\u68ee\u6797","/action_categories/foraging/burble_beach":"\u6df1\u7d2b\u6c99\u6ee9","/action_categories/foraging/silly_cow_valley":"\u50bb\u725b\u5c71\u8c37","/action_categories/foraging/olympus_mons":"\u5965\u6797\u5339\u65af\u5c71","/action_categories/foraging/asteroid_belt":"\u5c0f\u884c\u661f\u5e26","/action_categories/woodcutting/trees":"\u6811","/action_categories/cheesesmithing/material":"\u6750\u6599","/action_categories/cheesesmithing/tool":"\u5de5\u5177","/action_categories/cheesesmithing/main_hand":"\u4e3b\u624b","/action_categories/cheesesmithing/two_hand":"\u53cc\u624b","/action_categories/cheesesmithing/off_hand":"\u526f\u624b","/action_categories/cheesesmithing/feet":"\u811a\u90e8","/action_categories/cheesesmithing/hands":"\u624b\u90e8","/action_categories/cheesesmithing/head":"\u5934\u90e8","/action_categories/cheesesmithing/legs":"\u817f\u90e8","/action_categories/cheesesmithing/body":"\u8eab\u4f53","/action_categories/cheesesmithing/labyrinth":"\u8ff7\u5bab","/action_categories/crafting/lumber":"\u6728\u677f","/action_categories/crafting/crossbow":"\u5f29","/action_categories/crafting/bow":"\u5f13","/action_categories/crafting/staff":"\u6cd5\u6756","/action_categories/crafting/off_hand":"\u526f\u624b","/action_categories/crafting/ring":"\u6212\u6307","/action_categories/crafting/earrings":"\u8033\u73af","/action_categories/crafting/neck":"\u9879\u94fe","/action_categories/crafting/charm":"\u62a4\u7b26","/action_categories/crafting/trinket":"\u9970\u54c1","/action_categories/crafting/special":"\u7279\u6b8a","/action_categories/crafting/labyrinth":"\u8ff7\u5bab","/action_categories/crafting/dungeon_keys":"\u5730\u4e0b\u57ce\u94a5\u5319","/action_categories/tailoring/material":"\u6750\u6599","/action_categories/tailoring/feet":"\u811a\u90e8","/action_categories/tailoring/hands":"\u624b\u90e8","/action_categories/tailoring/head":"\u5934\u90e8","/action_categories/tailoring/legs":"\u817f\u90e8","/action_categories/tailoring/body":"\u8eab\u4f53","/action_categories/tailoring/pouch":"\u888b\u5b50","/action_categories/tailoring/back":"\u80cc\u90e8","/action_categories/tailoring/labyrinth":"\u8ff7\u5bab","/action_categories/cooking/instant_heal":"\u5373\u65f6\u56de\u8840","/action_categories/cooking/heal_over_time":"\u6301\u7eed\u56de\u8840","/action_categories/cooking/instant_mana":"\u5373\u65f6\u56de\u84dd","/action_categories/cooking/mana_over_time":"\u6301\u7eed\u56de\u84dd","/action_categories/cooking/labyrinth":"\u8ff7\u5bab","/action_categories/brewing/tea":"\u8336","/action_categories/brewing/coffee":"\u5496\u5561","/action_categories/brewing/labyrinth":"\u8ff7\u5bab","/action_categories/alchemy/alchemy":"\u70bc\u91d1","/action_categories/enhancing/enhance":"\u5f3a\u5316","/action_categories/combat/smelly_planet":"\u81ed\u81ed\u661f\u7403","/action_categories/combat/swamp_planet":"\u6cbc\u6cfd\u661f\u7403","/action_categories/combat/aqua_planet":"\u6d77\u6d0b\u661f\u7403","/action_categories/combat/jungle_planet":"\u4e1b\u6797\u661f\u7403","/action_categories/combat/gobo_planet":"\u54e5\u5e03\u6797\u661f\u7403","/action_categories/combat/planet_of_the_eyes":"\u773c\u7403\u661f\u7403","/action_categories/combat/sorcerers_tower":"\u5deb\u5e08\u4e4b\u5854","/action_categories/combat/bear_with_it":"\u718a\u718a\u661f\u7403","/action_categories/combat/golem_cave":"\u9b54\u50cf\u6d1e\u7a74","/action_categories/combat/twilight_zone":"\u66ae\u5149\u4e4b\u5730","/action_categories/combat/infernal_abyss":"\u5730\u72f1\u6df1\u6e0a","/action_categories/combat/dungeons":"\u5730\u4e0b\u57ce","/action_categories/labyrinth/explore":"\u8ff7\u5bab"},buffTypeNames:{"/buff_types/gathering":"\u91c7\u96c6\u6570\u91cf","/buff_types/efficiency":"\u6548\u7387","/buff_types/alchemy_success":"\u70bc\u91d1\u6210\u529f\u7387","/buff_types/enhancing_success":"\u5f3a\u5316\u6210\u529f\u7387","/buff_types/action_speed":"\u884c\u52a8\u901f\u5ea6","/buff_types/task_action_speed":"\u4efb\u52a1\u884c\u52a8\u901f\u5ea6","/buff_types/milking_level":"\u6324\u5976\u7b49\u7ea7","/buff_types/foraging_level":"\u91c7\u6458\u7b49\u7ea7","/buff_types/woodcutting_level":"\u4f10\u6728\u7b49\u7ea7","/buff_types/cheesesmithing_level":"\u5976\u916a\u953b\u9020\u7b49\u7ea7","/buff_types/crafting_level":"\u5236\u4f5c\u7b49\u7ea7","/buff_types/tailoring_level":"\u7f1d\u7eab\u7b49\u7ea7","/buff_types/cooking_level":"\u70f9\u996a\u7b49\u7ea7","/buff_types/brewing_level":"\u51b2\u6ce1\u7b49\u7ea7","/buff_types/alchemy_level":"\u70bc\u91d1\u7b49\u7ea7","/buff_types/enhancing_level":"\u5f3a\u5316\u7b49\u7ea7","/buff_types/gourmet":"\u7f8e\u98df","/buff_types/wisdom":"\u7ecf\u9a8c","/buff_types/processing":"\u52a0\u5de5","/buff_types/artisan":"\u5de5\u5320","/buff_types/blessed":"\u798f\u6c14","/buff_types/action_level":"\u884c\u52a8\u6240\u9700\u7b49\u7ea7","/buff_types/essence_find":"\u7cbe\u534e\u53d1\u73b0","/buff_types/rare_find":"\u7a00\u6709\u53d1\u73b0","/buff_types/stamina_level":"\u8010\u529b\u7b49\u7ea7","/buff_types/intelligence_level":"\u667a\u529b\u7b49\u7ea7","/buff_types/defense_level":"\u9632\u5fa1\u7b49\u7ea7","/buff_types/attack_level":"\u653b\u51fb\u7b49\u7ea7","/buff_types/melee_level":"\u8fd1\u6218\u7b49\u7ea7","/buff_types/ranged_level":"\u8fdc\u7a0b\u7b49\u7ea7","/buff_types/magic_level":"\u9b54\u6cd5\u7b49\u7ea7","/buff_types/attack_speed":"\u653b\u51fb\u901f\u5ea6","/buff_types/cast_speed":"\u65bd\u6cd5\u901f\u5ea6","/buff_types/critical_rate":"\u66b4\u51fb\u7387","/buff_types/critical_damage":"\u66b4\u51fb\u4f24\u5bb3","/buff_types/accuracy":"\u7cbe\u51c6","/buff_types/damage":"\u4f24\u5bb3","/buff_types/physical_amplify":"\u7269\u7406\u589e\u5e45","/buff_types/water_amplify":"\u6c34\u7cfb\u589e\u5e45","/buff_types/nature_amplify":"\u81ea\u7136\u7cfb\u589e\u5e45","/buff_types/fire_amplify":"\u706b\u7cfb\u589e\u5e45","/buff_types/healing_amplify":"\u6cbb\u7597\u589e\u5e45","/buff_types/evasion":"\u95ea\u907f","/buff_types/armor":"\u62a4\u7532","/buff_types/water_resistance":"\u6c34\u7cfb\u6297\u6027","/buff_types/nature_resistance":"\u81ea\u7136\u7cfb\u6297\u6027","/buff_types/fire_resistance":"\u706b\u7cfb\u6297\u6027","/buff_types/damage_taken":"\u6240\u53d7\u4f24\u5bb3","/buff_types/life_steal":"\u751f\u547d\u7a83\u53d6","/buff_types/mana_leech":"\u6cd5\u529b\u5438\u53d6","/buff_types/physical_thorns":"\u7269\u7406\u8346\u68d8","/buff_types/elemental_thorns":"\u5143\u7d20\u8346\u68d8","/buff_types/retaliation":"\u53cd\u4f24\u5f3a\u5ea6","/buff_types/tenacity":"\u97e7\u6027","/buff_types/hp_regen":"HP\u6062\u590d","/buff_types/mp_regen":"MP\u6062\u590d","/buff_types/threat":"\u5a01\u80c1","/buff_types/combat_drop_rate":"\u6218\u6597\u6389\u843d\u7387","/buff_types/combat_drop_quantity":"\u6218\u6597\u6389\u843d\u6570\u91cf","/buff_types/success_rate":"\u6210\u529f\u7387","/buff_types/labyrinth_double_progress":"\u53cc\u500d\u8fdb\u5ea6","/buff_types/skilling_experience":"\u6280\u80fd\u7ecf\u9a8c","/buff_types/combat_experience":"\u6218\u6597\u7ecf\u9a8c"},buffTypeDescriptions:{"/buff_types/gathering":"\u589e\u52a0\u91c7\u96c6\u6570\u91cf","/buff_types/efficiency":"\u7acb\u5373\u91cd\u590d\u884c\u52a8\u7684\u51e0\u7387","/buff_types/alchemy_success":"\u70bc\u91d1\u6210\u529f\u7387\u7684\u4e58\u6cd5\u52a0\u6210","/buff_types/enhancing_success":"\u5f3a\u5316\u6210\u529f\u7387\u7684\u4e58\u6cd5\u52a0\u6210","/buff_types/action_speed":"\u51cf\u5c11\u884c\u52a8\u6240\u9700\u65f6\u95f4","/buff_types/task_action_speed":"\u51cf\u5c11\u4efb\u52a1\u884c\u52a8\u6240\u9700\u65f6\u95f4","/buff_types/milking_level":"\u589e\u76ca\u6324\u5976\u7b49\u7ea7","/buff_types/foraging_level":"\u589e\u76ca\u91c7\u6458\u7b49\u7ea7","/buff_types/woodcutting_level":"\u589e\u76ca\u4f10\u6728\u7b49\u7ea7","/buff_types/cheesesmithing_level":"\u589e\u76ca\u5976\u916a\u953b\u9020\u7b49\u7ea7","/buff_types/crafting_level":"\u589e\u76ca\u5236\u4f5c\u7b49\u7ea7","/buff_types/tailoring_level":"\u589e\u76ca\u7f1d\u7eab\u7b49\u7ea7","/buff_types/cooking_level":"\u589e\u76ca\u70f9\u996a\u7b49\u7ea7","/buff_types/brewing_level":"\u589e\u76ca\u51b2\u6ce1\u7b49\u7ea7","/buff_types/alchemy_level":"\u589e\u76ca\u70bc\u91d1\u7b49\u7ea7","/buff_types/enhancing_level":"\u589e\u76ca\u5f3a\u5316\u7b49\u7ea7","/buff_types/gourmet":"\u6709\u673a\u4f1a\u514d\u8d39\u83b7\u5f97\u4e00\u4e2a\u989d\u5916\u7269\u54c1","/buff_types/wisdom":"\u589e\u52a0\u83b7\u5f97\u7ecf\u9a8c","/buff_types/processing":"\u6709\u673a\u4f1a\u7acb\u5373\u5c06\u539f\u6750\u6599\u8f6c\u5316\u6210\u4ea7\u54c1 (\u5976\u916a\u3001\u5e03\u6599\u3001\u548c\u6728\u6750)","/buff_types/artisan":"\u51cf\u5c11\u751f\u4ea7\u8fc7\u7a0b\u4e2d\u6240\u9700\u6750\u6599","/buff_types/blessed":"\u6709\u673a\u4f1a\u5728\u5f3a\u5316\u6210\u529f\u65f6\u83b7\u5f97+2\u800c\u4e0d\u662f+1","/buff_types/action_level":"\u589e\u52a0\u884c\u52a8\u6240\u9700\u7b49\u7ea7","/buff_types/essence_find":"\u589e\u52a0\u7cbe\u534e\u7684\u6389\u843d\u7387","/buff_types/rare_find":"\u589e\u52a0\u7a00\u6709\u7269\u54c1\u7684\u6389\u843d\u7387","/buff_types/stamina_level":"\u589e\u76ca\u8010\u529b\u7b49\u7ea7","/buff_types/intelligence_level":"\u589e\u76ca\u667a\u529b\u7b49\u7ea7","/buff_types/defense_level":"\u589e\u76ca\u9632\u5fa1\u7b49\u7ea7","/buff_types/attack_level":"\u589e\u76ca\u653b\u51fb\u7b49\u7ea7","/buff_types/melee_level":"\u589e\u76ca\u8fd1\u6218\u7b49\u7ea7","/buff_types/ranged_level":"\u589e\u76ca\u8fdc\u7a0b\u7b49\u7ea7","/buff_types/magic_level":"\u589e\u76ca\u9b54\u6cd5\u7b49\u7ea7","/buff_types/attack_speed":"\u589e\u52a0\u81ea\u52a8\u653b\u51fb\u901f\u5ea6","/buff_types/cast_speed":"\u589e\u52a0\u65bd\u6cd5\u901f\u5ea6","/buff_types/critical_rate":"\u589e\u52a0\u66b4\u51fb\u7387","/buff_types/critical_damage":"\u589e\u52a0\u66b4\u51fb\u4f24\u5bb3","/buff_types/accuracy":"\u589e\u52a0\u7cbe\u51c6\u5ea6","/buff_types/damage":"\u589e\u52a0\u4f24\u5bb3","/buff_types/physical_amplify":"\u589e\u52a0\u7269\u7406\u4f24\u5bb3","/buff_types/water_amplify":"\u589e\u52a0\u6c34\u7cfb\u4f24\u5bb3","/buff_types/nature_amplify":"\u589e\u52a0\u81ea\u7136\u7cfb\u4f24\u5bb3","/buff_types/fire_amplify":"\u589e\u52a0\u706b\u7cfb\u4f24\u5bb3","/buff_types/healing_amplify":"\u589e\u52a0\u6cbb\u7597\u91cf","/buff_types/evasion":"\u589e\u52a0\u95ea\u907f\u7387","/buff_types/armor":"\u51cf\u5c11\u6240\u53d7\u7269\u7406\u4f24\u5bb3","/buff_types/water_resistance":"\u51cf\u5c11\u6240\u53d7\u6c34\u7cfb\u4f24\u5bb3","/buff_types/nature_resistance":"\u51cf\u5c11\u6240\u53d7\u81ea\u7136\u7cfb\u4f24\u5bb3","/buff_types/fire_resistance":"\u51cf\u5c11\u6240\u53d7\u706b\u7cfb\u4f24\u5bb3","/buff_types/damage_taken":"\u589e\u52a0\u6240\u53d7\u4f24\u5bb3","/buff_types/life_steal":"\u81ea\u52a8\u653b\u51fb\u65f6\u83b7\u5f97\u751f\u547d\u7a83\u53d6","/buff_types/mana_leech":"\u81ea\u52a8\u653b\u51fb\u65f6\u83b7\u5f97\u6cd5\u529b\u5438\u53d6","/buff_types/physical_thorns":"\u53d7\u5230\u7269\u7406\u653b\u51fb\u65f6\uff0c\u5bf9\u653b\u51fb\u8005\u9020\u6210\u57fa\u4e8e\u4f60\u62a4\u7532\u7684\u4e00\u5b9a\u7269\u7406\u4f24\u5bb3","/buff_types/elemental_thorns":"\u53d7\u5230\u5143\u7d20\u653b\u51fb\u65f6\uff0c\u5bf9\u653b\u51fb\u8005\u9020\u6210\u57fa\u4e8e\u4f60\u6297\u6027\u7684\u4e00\u5b9a\u5143\u7d20\u4f24\u5bb3","/buff_types/retaliation":"\u5c06\u653b\u51fb\u539f\u59cb\u4f24\u5bb3\u7684\u4e00\u5b9a\u6bd4\u4f8b\u4ee5\u949d\u51fb\u5f62\u5f0f\u53cd\u4f24\u653b\u51fb\u8005","/buff_types/tenacity":"\u964d\u4f4e\u5931\u660e\u3001\u6c89\u9ed8\u6216\u7729\u6655\u7684\u51e0\u7387","/buff_types/hp_regen":"\u589e\u52a0HP\u6062\u590d","/buff_types/mp_regen":"\u589e\u52a0MP\u6062\u590d","/buff_types/threat":"\u589e\u52a0\u6218\u6597\u4e2d\u88ab\u653b\u51fb\u7684\u51e0\u7387","/buff_types/combat_drop_rate":"\u589e\u52a0\u6218\u6597\u6218\u5229\u54c1\u7684\u6389\u843d\u7387","/buff_types/combat_drop_quantity":"\u589e\u52a0\u6218\u6597\u6218\u5229\u54c1\u6570\u91cf","/buff_types/success_rate":"\u589e\u52a0\u6210\u529f\u7387","/buff_types/labyrinth_double_progress":"\u8ff7\u5bab\u6280\u80fd\u623f\u95f4\u53cc\u500d\u8fdb\u5ea6\u7684\u51e0\u7387","/buff_types/skilling_experience":"\u589e\u52a0\u6280\u80fd\u83b7\u5f97\u7684\u7ecf\u9a8c","/buff_types/combat_experience":"\u589e\u52a0\u6218\u6597\u83b7\u5f97\u7684\u7ecf\u9a8c"},buffTypeDebuffDescriptions:{"/buff_types/gathering":"\u51cf\u5c11\u91c7\u96c6\u6570\u91cf","/buff_types/efficiency":"\u964d\u4f4e\u7acb\u5373\u91cd\u590d\u884c\u52a8\u7684\u53ef\u80fd\u6027","/buff_types/alchemy_success":"\u70bc\u91d1\u6210\u529f\u7387\u7684\u4e58\u6cd5\u51cf\u76ca","/buff_types/enhancing_success":"\u5f3a\u5316\u6210\u529f\u7387\u7684\u4e58\u6cd5\u51cf\u76ca","/buff_types/action_speed":"\u589e\u52a0\u884c\u52a8\u6240\u9700\u65f6\u95f4","/buff_types/task_action_speed":"\u589e\u52a0\u4efb\u52a1\u884c\u52a8\u6240\u9700\u65f6\u95f4","/buff_types/milking_level":"\u964d\u4f4e\u6324\u5976\u7b49\u7ea7","/buff_types/foraging_level":"\u964d\u4f4e\u91c7\u96c6\u7b49\u7ea7","/buff_types/woodcutting_level":"\u964d\u4f4e\u4f10\u6728\u7b49\u7ea7","/buff_types/cheesesmithing_level":"\u964d\u4f4e\u5976\u916a\u953b\u9020\u7b49\u7ea7","/buff_types/crafting_level":"\u964d\u4f4e\u5236\u4f5c\u7b49\u7ea7","/buff_types/tailoring_level":"\u964d\u4f4e\u88c1\u7f1d\u7b49\u7ea7","/buff_types/cooking_level":"\u964d\u4f4e\u70f9\u996a\u7b49\u7ea7","/buff_types/brewing_level":"\u964d\u4f4e\u917f\u9020\u7b49\u7ea7","/buff_types/alchemy_level":"\u964d\u4f4e\u70bc\u91d1\u7b49\u7ea7","/buff_types/enhancing_level":"\u964d\u4f4e\u5f3a\u5316\u7b49\u7ea7","/buff_types/gourmet":"\u964d\u4f4e\u514d\u8d39\u989d\u5916\u4ea7\u51fa\u7269\u54c1\u7684\u51e0\u7387","/buff_types/wisdom":"\u51cf\u5c11\u83b7\u5f97\u7684\u7ecf\u9a8c","/buff_types/processing":"\u964d\u4f4e\u5c06\u91c7\u96c6\u8d44\u6e90\u8f6c\u5316\u4e3a\u52a0\u5de5\u6750\u6599\uff08\u5976\u916a\u3001\u5e03\u6599\u548c\u6728\u6750\uff09\u7684\u51e0\u7387","/buff_types/artisan":"\u589e\u52a0\u751f\u4ea7\u6240\u9700\u6750\u6599","/buff_types/blessed":"\u964d\u4f4e\u5f3a\u5316\u6210\u529f\u65f6\u83b7\u5f97+2\u800c\u975e+1\u7684\u51e0\u7387","/buff_types/action_level":"\u964d\u4f4e\u884c\u52a8\u6240\u9700\u7b49\u7ea7","/buff_types/essence_find":"\u51cf\u5c11\u7cbe\u534e\u6389\u843d\u7387","/buff_types/rare_find":"\u51cf\u5c11\u7a00\u6709\u7269\u54c1\u6389\u843d\u7387","/buff_types/stamina_level":"\u964d\u4f4e\u4f53\u529b\u7b49\u7ea7","/buff_types/intelligence_level":"\u964d\u4f4e\u667a\u529b\u7b49\u7ea7","/buff_types/defense_level":"\u964d\u4f4e\u9632\u5fa1\u7b49\u7ea7","/buff_types/attack_level":"\u964d\u4f4e\u653b\u51fb\u7b49\u7ea7","/buff_types/melee_level":"\u964d\u4f4e\u8fd1\u6218\u7b49\u7ea7","/buff_types/ranged_level":"\u964d\u4f4e\u8fdc\u7a0b\u7b49\u7ea7","/buff_types/magic_level":"\u964d\u4f4e\u9b54\u6cd5\u7b49\u7ea7","/buff_types/attack_speed":"\u51cf\u5c11\u81ea\u52a8\u653b\u51fb\u901f\u5ea6","/buff_types/cast_speed":"\u51cf\u5c11\u6280\u80fd\u65bd\u653e\u901f\u5ea6","/buff_types/critical_rate":"\u51cf\u5c11\u66b4\u51fb\u7387","/buff_types/critical_damage":"\u51cf\u5c11\u66b4\u51fb\u4f24\u5bb3","/buff_types/accuracy":"\u51cf\u5c11\u547d\u4e2d\u7387","/buff_types/damage":"\u51cf\u5c11\u4f24\u5bb3","/buff_types/physical_amplify":"\u51cf\u5c11\u7269\u7406\u4f24\u5bb3","/buff_types/water_amplify":"\u51cf\u5c11\u6c34\u7cfb\u4f24\u5bb3","/buff_types/nature_amplify":"\u51cf\u5c11\u81ea\u7136\u4f24\u5bb3","/buff_types/fire_amplify":"\u51cf\u5c11\u706b\u7130\u4f24\u5bb3","/buff_types/healing_amplify":"\u51cf\u5c11\u6cbb\u7597\u91cf","/buff_types/evasion":"\u51cf\u5c11\u95ea\u907f\u7387","/buff_types/armor":"\u589e\u52a0\u53d7\u5230\u7684\u7269\u7406\u4f24\u5bb3","/buff_types/water_resistance":"\u589e\u52a0\u53d7\u5230\u7684\u6c34\u7cfb\u4f24\u5bb3","/buff_types/nature_resistance":"\u589e\u52a0\u53d7\u5230\u7684\u81ea\u7136\u4f24\u5bb3","/buff_types/fire_resistance":"\u589e\u52a0\u53d7\u5230\u7684\u706b\u7130\u4f24\u5bb3","/buff_types/damage_taken":"\u51cf\u5c11\u53d7\u5230\u7684\u4f24\u5bb3","/buff_types/life_steal":"\u51cf\u5c11\u751f\u547d\u5077\u53d6","/buff_types/mana_leech":"\u51cf\u5c11\u6cd5\u529b\u6c72\u53d6","/buff_types/physical_thorns":"\u51cf\u5c11\u7269\u7406\u53cd\u4f24","/buff_types/elemental_thorns":"\u51cf\u5c11\u5143\u7d20\u53cd\u4f24","/buff_types/retaliation":"\u51cf\u5c11\u53cd\u51fb","/buff_types/tenacity":"\u589e\u52a0\u88ab\u81f4\u76f2\u3001\u6c89\u9ed8\u6216\u7729\u6655\u7684\u51e0\u7387","/buff_types/hp_regen":"\u51cf\u5c11HP\u6062\u590d","/buff_types/mp_regen":"\u51cf\u5c11MP\u6062\u590d","/buff_types/threat":"\u51cf\u5c11\u6218\u6597\u4e2d\u88ab\u653b\u51fb\u7684\u51e0\u7387","/buff_types/combat_drop_rate":"\u51cf\u5c11\u6218\u6597\u6218\u5229\u54c1\u6389\u843d\u7387","/buff_types/combat_drop_quantity":"\u51cf\u5c11\u6218\u6597\u6218\u5229\u54c1\u6570\u91cf","/buff_types/success_rate":"\u51cf\u5c11\u6210\u529f\u7387","/buff_types/labyrinth_double_progress":"\u51cf\u5c11\u53cc\u500d\u8fdb\u5ea6\u7684\u51e0\u7387","/buff_types/skilling_experience":"\u51cf\u5c11\u6280\u80fd\u83b7\u5f97\u7684\u7ecf\u9a8c","/buff_types/combat_experience":"\u51cf\u5c11\u6218\u6597\u83b7\u5f97\u7684\u7ecf\u9a8c"},houseRoomNames:{"/house_rooms/dairy_barn":"\u5976\u725b\u68da","/house_rooms/garden":"\u82b1\u56ed","/house_rooms/log_shed":"\u6728\u68da","/house_rooms/forge":"\u953b\u9020\u53f0","/house_rooms/workshop":"\u5de5\u4f5c\u95f4","/house_rooms/sewing_parlor":"\u7f1d\u7eab\u5ba4","/house_rooms/kitchen":"\u53a8\u623f","/house_rooms/brewery":"\u51b2\u6ce1\u574a","/house_rooms/laboratory":"\u5b9e\u9a8c\u5ba4","/house_rooms/observatory":"\u5929\u6587\u53f0","/house_rooms/dining_room":"\u9910\u5385","/house_rooms/library":"\u56fe\u4e66\u9986","/house_rooms/dojo":"\u9053\u573a","/house_rooms/armory":"\u519b\u68b0\u5e93","/house_rooms/gym":"\u5065\u8eab\u623f","/house_rooms/archery_range":"\u5c04\u7bad\u573a","/house_rooms/mystical_study":"\u795e\u79d8\u7814\u7a76\u5ba4"},purchaseBundleNames:{"/purchase_bundles/cowbells_500":"500\u4e2a\u725b\u94c3","/purchase_bundles/cowbells_1050":"1050\u4e2a\u725b\u94c3","/purchase_bundles/cowbells_2700":"2700\u4e2a\u725b\u94c3","/purchase_bundles/cowbells_5500":"5500\u4e2a\u725b\u94c3","/purchase_bundles/cowbells_11500":"11500\u4e2a\u725b\u94c3","/purchase_bundles/moo_pass_standard_30":"30\u5929\u54de\u5361(\u6807\u51c6)","/purchase_bundles/moo_pass_standard_90":"90\u5929\u54de\u5361(\u6807\u51c6)","/purchase_bundles/moo_pass_standard_365":"1\u5e74\u54de\u5361(\u6807\u51c6)","/purchase_bundles/moo_pass_ironcow_30":"30\u5929\u54de\u5361(\u94c1\u725b)","/purchase_bundles/moo_pass_ironcow_90":"90\u5929\u54de\u5361(\u94c1\u725b)","/purchase_bundles/moo_pass_ironcow_365":"1\u5e74\u54de\u5361(\u94c1\u725b)","/purchase_bundles/moo_pass_account_30":"30\u5929\u54de\u5361(\u6240\u6709\u89d2\u8272)","/purchase_bundles/moo_pass_account_90":"90\u5929\u54de\u5361(\u6240\u6709\u89d2\u8272)","/purchase_bundles/moo_pass_account_365":"1\u5e74\u54de\u5361(\u6240\u6709\u89d2\u8272)"},buyableUpgradeNames:{"/buyable_upgrades/offline_hour_cap_1":"+1\u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6","/buyable_upgrades/offline_hour_cap_2":"+1\u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6","/buyable_upgrades/offline_hour_cap_3":"+1\u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6","/buyable_upgrades/offline_hour_cap_4":"+1\u5c0f\u65f6\u79bb\u7ebf\u8fdb\u5ea6","/buyable_upgrades/market_listing_cap_1":"+1\u5e02\u573a\u6302\u724c","/buyable_upgrades/market_listing_cap_2":"+1\u5e02\u573a\u6302\u724c","/buyable_upgrades/market_listing_cap_3":"+1\u5e02\u573a\u6302\u724c","/buyable_upgrades/market_listing_cap_4":"+1\u5e02\u573a\u6302\u724c","/buyable_upgrades/market_listing_cap_5":"+1\u5e02\u573a\u6302\u724c","/buyable_upgrades/action_queue_cap_1":"+1\u884c\u52a8\u961f\u5217","/buyable_upgrades/action_queue_cap_2":"+1\u884c\u52a8\u961f\u5217","/buyable_upgrades/action_queue_cap_3":"+1\u884c\u52a8\u961f\u5217","/buyable_upgrades/action_queue_cap_4":"+1\u884c\u52a8\u961f\u5217","/buyable_upgrades/loadout_slot_cap_1":"+1\u914d\u88c5\u69fd\u4f4d","/buyable_upgrades/loadout_slot_cap_2":"+1\u914d\u88c5\u69fd\u4f4d","/buyable_upgrades/loadout_slot_cap_3":"+1\u914d\u88c5\u69fd\u4f4d","/buyable_upgrades/loadout_slot_cap_4":"+1\u914d\u88c5\u69fd\u4f4d","/buyable_upgrades/task_slot_cap_1":"+1\u4efb\u52a1\u69fd\u4f4d","/buyable_upgrades/task_slot_cap_2":"+1\u4efb\u52a1\u69fd\u4f4d","/buyable_upgrades/task_slot_cap_3":"+1\u4efb\u52a1\u69fd\u4f4d","/buyable_upgrades/task_slot_cap_4":"+1\u4efb\u52a1\u69fd\u4f4d","/buyable_upgrades/labyrinth_path_cap_1":"+1\u8ff7\u5bab\u8def\u5f84\u957f\u5ea6","/buyable_upgrades/labyrinth_path_cap_2":"+1\u8ff7\u5bab\u8def\u5f84\u957f\u5ea6","/buyable_upgrades/labyrinth_path_cap_3":"+1\u8ff7\u5bab\u8def\u5f84\u957f\u5ea6","/buyable_upgrades/labyrinth_path_cap_4":"+1\u8ff7\u5bab\u8def\u5f84\u957f\u5ea6"},chatIconNames:{"/chat_icons/admin":"Admin","/chat_icons/cco":"CCO","/chat_icons/community_manager":"\u793e\u533a\u7ecf\u7406","/chat_icons/super_moderator":"\u8d85\u7ea7\u7ba1\u7406\u5458","/chat_icons/moderator":"\u7ba1\u7406\u5458","/chat_icons/bug_finder":"BUG\u53d1\u73b0\u8005","/chat_icons/super_bug_finder":"\u8d85\u7ea7BUG\u53d1\u73b0\u8005","/chat_icons/contributor":"\u8d21\u732e\u8005","/chat_icons/super_contributor":"\u8d85\u7ea7\u8d21\u732e\u8005","/chat_icons/supporter":"\u652f\u6301\u8005","/chat_icons/verdant_supporter":"\u7fe0\u7eff\u652f\u6301\u8005","/chat_icons/azure_supporter":"\u851a\u84dd\u652f\u6301\u8005","/chat_icons/burble_supporter":"\u6df1\u7d2b\u652f\u6301\u8005","/chat_icons/crimson_supporter":"\u7edb\u7ea2\u652f\u6301\u8005","/chat_icons/rainbow_supporter":"\u5f69\u8679\u652f\u6301\u8005","/chat_icons/holy_supporter":"\u795e\u5723\u652f\u6301\u8005","/chat_icons/beta_bunny":"\u6d4b\u8bd5\u5154","/chat_icons/halloween_ghost":"\u545c\u545c\u545c~~","/chat_icons/jack_o_lantern":"\u6770\u514b\u706f\u7b3c","/chat_icons/santa_hat":"\u5723\u8bde\u5e3d","/chat_icons/snowman":"\u96ea\u4eba","/chat_icons/spring_festival_lantern":"\u6625\u8282\u706f\u7b3c","/chat_icons/get_rich":"\u606d\u559c\u53d1\u8d22\uff01","/chat_icons/anniversary_purple":"\u5468\u5e74\u5c0f\u7d2b\u725b","/chat_icons/og_jerry":"\u539f\u7248\u6770\u745e","/chat_icons/milking":"\u6324\u5976","/chat_icons/foraging":"\u91c7\u6458","/chat_icons/woodcutting":"\u4f10\u6728","/chat_icons/cheesesmithing":"\u5976\u916a\u953b\u9020","/chat_icons/crafting":"\u5236\u4f5c","/chat_icons/tailoring":"\u7f1d\u7eab","/chat_icons/cooking":"\u70f9\u996a","/chat_icons/brewing":"\u51b2\u6ce1","/chat_icons/alchemy":"\u70bc\u91d1","/chat_icons/enhancing":"\u5f3a\u5316","/chat_icons/combat":"\u6218\u6597","/chat_icons/stamina":"\u8010\u529b","/chat_icons/intelligence":"\u667a\u529b","/chat_icons/attack":"\u653b\u51fb","/chat_icons/melee":"\u8fd1\u6218","/chat_icons/defense":"\u9632\u5fa1","/chat_icons/ranged":"\u8fdc\u7a0b","/chat_icons/magic":"\u9b54\u6cd5","/chat_icons/marketplace":"\u5e02\u573a","/chat_icons/tasks":"\u4efb\u52a1","/chat_icons/blueberry":"\u84dd\u8393","/chat_icons/blackberry":"\u9ed1\u8393","/chat_icons/strawberry":"\u8349\u8393","/chat_icons/mooberry":"\u54de\u8393","/chat_icons/marsberry":"\u706b\u661f\u8393","/chat_icons/spaceberry":"\u592a\u7a7a\u8393","/chat_icons/apple":"\u82f9\u679c","/chat_icons/orange":"\u6a59\u5b50","/chat_icons/plum":"\u674e\u5b50","/chat_icons/peach":"\u6843\u5b50","/chat_icons/dragon_fruit":"\u706b\u9f99\u679c","/chat_icons/star_fruit":"\u6768\u6843","/chat_icons/egg":"\u9e21\u86cb","/chat_icons/bamboo":"\u7af9\u5b50","/chat_icons/cheese":"\u5976\u916a","/chat_icons/cupcake":"\u7eb8\u676f\u86cb\u7cd5","/chat_icons/clover":"\u5e78\u8fd0\u8349","/chat_icons/tea":"\u8336","/chat_icons/coffee":"\u5496\u5561","/chat_icons/task_crystal":"\u4efb\u52a1\u6c34\u6676","/chat_icons/star_fragment":"\u661f\u5149\u788e\u7247","/chat_icons/pearl":"\u73cd\u73e0","/chat_icons/amber":"\u7425\u73c0","/chat_icons/garnet":"\u77f3\u69b4\u77f3","/chat_icons/jade":"\u7fe1\u7fe0","/chat_icons/amethyst":"\u7d2b\u6c34\u6676","/chat_icons/moonstone":"\u6708\u4eae\u77f3","/chat_icons/sunstone":"\u592a\u9633\u77f3","/chat_icons/philosophers_stone":"\u8d24\u8005\u4e4b\u77f3","/chat_icons/sword":"\u5251","/chat_icons/spear":"\u67aa","/chat_icons/mace":"\u9489\u5934\u9524","/chat_icons/bulwark":"\u91cd\u76fe","/chat_icons/bow":"\u5f13","/chat_icons/crossbow":"\u5f29","/chat_icons/staff":"\u6cd5\u6756","/chat_icons/book":"\u4e66\u7c4d","/chat_icons/mages_hat":"\u6cd5\u5e08\u5e3d","/chat_icons/panda_paw":"\u718a\u732b\u722a","/chat_icons/fly":"\u82cd\u8747","/chat_icons/rat":"\u6770\u745e","/chat_icons/skunk":"\u81ed\u9f2c","/chat_icons/porcupine":"\u8c6a\u732a","/chat_icons/slimy":"\u53f2\u83b1\u59c6","/chat_icons/frog":"\u9752\u86d9","/chat_icons/snake":"\u86c7","/chat_icons/swampy":"\u6cbc\u6cfd\u866b","/chat_icons/alligator":"\u590f\u6d1b\u514b","/chat_icons/giant_shoebill":"\u9cb8\u5934\u9e73","/chat_icons/sea_snail":"\u8717\u725b","/chat_icons/crab":"\u8783\u87f9","/chat_icons/aquahorse":"\u6c34\u9a6c","/chat_icons/nom_nom":"\u54ac\u54ac\u9c7c","/chat_icons/turtle":"\u5fcd\u8005\u9f9f","/chat_icons/marine_huntress":"\u6d77\u6d0b\u730e\u624b","/chat_icons/jungle_sprite":"\u4e1b\u6797\u7cbe\u7075","/chat_icons/myconid":"\u8611\u83c7\u4eba","/chat_icons/treant":"\u6811\u4eba","/chat_icons/centaur_archer":"\u534a\u4eba\u9a6c\u5f13\u7bad\u624b","/chat_icons/luna_empress":"\u6708\u795e\u4e4b\u8776","/chat_icons/eyes":"\u53e0\u773c","/chat_icons/the_watcher":"\u89c2\u5bdf\u8005","/chat_icons/ice_sorcerer":"\u51b0\u971c\u5deb\u5e08","/chat_icons/flame_sorcerer":"\u706b\u7130\u5deb\u5e08","/chat_icons/elementalist":"\u5143\u7d20\u6cd5\u5e08","/chat_icons/chronofrost_sorcerer":"\u971c\u65f6\u5deb\u5e08","/chat_icons/gummy_bear":"\u8f6f\u7cd6\u718a","/chat_icons/panda":"\u718a\u732b","/chat_icons/black_bear":"\u9ed1\u718a","/chat_icons/grizzly_bear":"\u68d5\u718a","/chat_icons/polar_bear":"\u5317\u6781\u718a","/chat_icons/red_panda":"\u5c0f\u718a\u732b","/chat_icons/zombie":"\u50f5\u5c38","/chat_icons/vampire":"\u5438\u8840\u9b3c","/chat_icons/werewolf":"\u72fc\u4eba","/chat_icons/dusk_revenant":"\u9ec4\u660f\u4ea1\u7075","/chat_icons/abyssal_imp":"\u6df1\u6e0a\u5c0f\u9b3c","/chat_icons/soul_hunter":"\u7075\u9b42\u730e\u624b","/chat_icons/infernal_warlock":"\u5730\u72f1\u672f\u58eb","/chat_icons/demonic_overlord":"\u6076\u9b54\u9738\u4e3b","/chat_icons/butterjerry":"\u8776\u9f20","/chat_icons/jackalope":"\u9e7f\u89d2\u5154","/chat_icons/rabid_rabbit":"\u75af\u9b54\u5154","/chat_icons/magician":"\u9b54\u672f\u5e08","/chat_icons/enchanted_bishop":"\u79d8\u6cd5\u4e3b\u6559","/chat_icons/enchanted_knight":"\u79d8\u6cd5\u9a91\u58eb","/chat_icons/enchanted_queen":"\u79d8\u6cd5\u738b\u540e","/chat_icons/squawker":"\u9e66\u9e49","/chat_icons/anchor_shark":"\u6301\u951a\u9ca8","/chat_icons/shadow_archer":"\u6697\u5f71\u5f13\u624b","/chat_icons/pyre_hunter":"\u706b\u7130\u730e\u624b","/chat_icons/frost_sniper":"\u971c\u51bb\u72d9\u51fb\u624b","/chat_icons/siren":"\u6d77\u5996","/chat_icons/salamander":"\u706b\u8725\u8734","/chat_icons/dryad":"\u6811\u7cbe","/chat_icons/giant_scorpion":"\u5de8\u874e","/chat_icons/giant_mantis":"\u5de8\u87b3\u8782","/chat_icons/cyclops":"\u72ec\u773c\u5de8\u4eba","/chat_icons/mimic":"\u5b9d\u7bb1\u602a","/chat_icons/iron_cow":"\u94c1\u725b","/chat_icons/cow":"\u5976\u725b","/chat_icons/verdant_cow":"\u7fe0\u7eff\u5976\u725b","/chat_icons/azure_cow":"\u851a\u84dd\u5976\u725b","/chat_icons/burble_cow":"\u6df1\u7d2b\u5976\u725b","/chat_icons/crimson_cow":"\u7edb\u7ea2\u5976\u725b","/chat_icons/unicow":"\u5f69\u8679\u5976\u725b","/chat_icons/holy_cow":"\u795e\u5723\u5976\u725b","/chat_icons/duckling":"\u5c0f\u9e2d","/chat_icons/whale":"\u9cb8\u9c7c","/chat_icons/golden_coin":"\u91d1\u5e01","/chat_icons/golden_marketplace":"\u91d1\u8272\u5e02\u573a","/chat_icons/golden_egg":"\u91d1\u86cb","/chat_icons/golden_berry":"\u91d1\u8272\u8393\u679c","/chat_icons/golden_apple":"\u91d1\u8272\u82f9\u679c","/chat_icons/golden_donut":"\u91d1\u8272\u751c\u751c\u5708","/chat_icons/golden_cupcake":"\u91d1\u8272\u7eb8\u676f\u86cb\u7cd5","/chat_icons/golden_clover":"\u91d1\u8272\u5e78\u8fd0\u8349","/chat_icons/golden_biceps":"\u91d1\u8272\u4e8c\u5934\u808c","/chat_icons/golden_frog":"\u91d1\u8272\u9752\u86d9","/chat_icons/golden_piggy":"\u91d1\u8272\u5c0f\u732a","/chat_icons/golden_duckling":"\u91d1\u8272\u5c0f\u9e2d","/chat_icons/golden_whale":"\u91d1\u8272\u9cb8\u9c7c"},nameColorNames:{"/name_colors/burble":"\u7d2b\u8272","/name_colors/blue":"\u84dd\u8272","/name_colors/green":"\u7eff\u8272","/name_colors/yellow":"\u9ec4\u8272","/name_colors/coral":"\u73ca\u745a","/name_colors/pink":"\u7c89\u8272","/name_colors/fancy_burble":"\u534e\u4e3d\u7d2b\u8272","/name_colors/fancy_blue":"\u534e\u4e3d\u84dd\u8272","/name_colors/fancy_green":"\u534e\u4e3d\u7eff\u8272","/name_colors/fancy_yellow":"\u534e\u4e3d\u9ec4\u8272","/name_colors/fancy_coral":"\u534e\u4e3d\u73ca\u745a","/name_colors/fancy_pink":"\u534e\u4e3d\u7c89\u8272","/name_colors/iron":"\u94c1\u8272","/name_colors/rainbow":"\u5f69\u8679\u8272","/name_colors/golden":"\u91d1\u8272"},communityBuffTypeNames:{"/community_buff_types/experience":"\u7ecf\u9a8c","/community_buff_types/gathering_quantity":"\u91c7\u96c6\u6570\u91cf","/community_buff_types/production_efficiency":"\u751f\u4ea7\u6548\u7387","/community_buff_types/enhancing_speed":"\u5f3a\u5316\u901f\u5ea6","/community_buff_types/combat_drop_quantity":"\u6218\u6597\u6389\u843d\u6570\u91cf"},chatChannelTypeNames:{"/chat_channel_types/general":"\u82f1\u8bed","/chat_channel_types/chinese":"\u4e2d\u6587","/chat_channel_types/french":"Fran\xe7ais","/chat_channel_types/german":"Deutsch","/chat_channel_types/spanish":"Espa\xf1ol","/chat_channel_types/portuguese":"Portugu\xeas","/chat_channel_types/russian":"\u0420\u0443\u0441\u0441\u043a\u0438\u0439","/chat_channel_types/hebrew":"\u05e2\u05d1\u05e8\u05d9\u05ea","/chat_channel_types/arabic":"\u0627\u0644\u0639\u0631\u0628\u064a\u0629","/chat_channel_types/hindi":"\u0939\u093f\u0902\u0926\u0940","/chat_channel_types/japanese":"\u65e5\u672c\u8a9e","/chat_channel_types/korean":"\ud55c\uad6d\uc5b4","/chat_channel_types/vietnamese":"Ti\u1ebfng Vi\u1ec7t","/chat_channel_types/ironcow":"\u94c1\u725b","/chat_channel_types/trade":"\u4ea4\u6613","/chat_channel_types/recruit":"\u62db\u52df","/chat_channel_types/beginner":"\u65b0\u624b","/chat_channel_types/guild":"\u516c\u4f1a","/chat_channel_types/party":"\u961f\u4f0d","/chat_channel_types/moderator":"\u7ba1\u7406\u5458","/chat_channel_types/whisper":"\u79c1\u804a"},guildCharacterRoleNames:{leader:"\u4f1a\u957f",general:"\u5c06\u519b",officer:"\u5b98\u5458",member:"\u4f1a\u5458"},leaderboardTypeNames:{standard:"\u6807\u51c6",ironcow:"\u94c1\u725b",legacy_ironcow:"\u4f20\u7edf\u94c1\u725b",steam_standard:"\u6807\u51c6 (Steam)",steam_ironcow:"\u94c1\u725b (Steam)",guild:"\u516c\u4f1a"},leaderboardCategoryNames:{total_level:"\u603b\u7b49\u7ea7",milking:"\u6324\u5976",foraging:"\u91c7\u6458",woodcutting:"\u4f10\u6728",cheesesmithing:"\u5976\u916a\u953b\u9020",crafting:"\u5236\u4f5c",tailoring:"\u7f1d\u7eab",cooking:"\u70f9\u996a",brewing:"\u51b2\u6ce1",alchemy:"\u70bc\u91d1",enhancing:"\u5f3a\u5316",stamina:"\u8010\u529b",intelligence:"\u667a\u529b",attack:"\u653b\u51fb",defense:"\u9632\u5fa1",melee:"\u8fd1\u6218",ranged:"\u8fdc\u7a0b",magic:"\u9b54\u6cd5",task_points:"\u4efb\u52a1\u79ef\u5206",labyrinth_points:"\u8ff7\u5bab\u79ef\u5206",labyrinth_depth:"\u8ff7\u5bab\u6df1\u5ea6",collection_points:"\u6536\u85cf\u79ef\u5206",bestiary_points:"\u56fe\u9274\u79ef\u5206",fame_points:"\u540d\u671b\u79ef\u5206",guild:"\u516c\u4f1a"},achievementNames:{"/achievements/gather_milk":"\u7b2c\u4e00\u74f6\u5976","/achievements/craft_wooden_bow":"\u5f13\u7bad\u5320","/achievements/cook_apple_gummy":"\u751c\u98df\u7231\u597d\u8005","/achievements/complete_tutorial":"\u6bd5\u4e1a\u751f","/achievements/defeat_jerry":"\u6770\u745e\u6740\u624b","/achievements/total_level_100":"\u521d\u7ea7\u5192\u9669\u5bb6","/achievements/cheesesmith_azure_tool":"\u851a\u84dd\u5320\u4eba","/achievements/tailor_medium_pouch":"\u888b\u5b50\u5236\u4f5c\u8005","/achievements/brew_gourmet_tea":"\u8336\u827a\u7231\u597d\u8005","/achievements/enhance_to_3":"\u5f3a\u5316\u5e08 I","/achievements/learn_ability":"\u89c9\u9192\u8005","/achievements/defeat_shoebill":"\u9cb8\u5934\u9e73\u6740\u624b","/achievements/defeat_marine_huntress":"\u6d77\u6d0b\u730e\u624b","/achievements/collection_points_100":"\u6536\u85cf\u5bb6 I","/achievements/bestiary_points_20":"\u730e\u4eba I","/achievements/task_tokens_10":"\u4efb\u52a1\u8fbe\u4eba","/achievements/total_level_250":"\u65b0\u624b\u5192\u9669\u5bb6","/achievements/craft_jewelry":"\u73e0\u5b9d\u5320","/achievements/cook_peach_yogurt":"\u4e73\u5236\u54c1\u53a8\u5e08","/achievements/decompose_bamboo_gloves":"\u5206\u89e3\u5927\u5e08","/achievements/enhance_to_6":"\u5f3a\u5316\u5e08 II","/achievements/equip_ginkgo_weapon":"\u94f6\u674f\u6218\u58eb","/achievements/defeat_luna_empress":"\u6708\u795e\u5f81\u670d\u8005","/achievements/defeat_gobo_chieftain":"\u54e5\u5e03\u6797\u5f81\u670d\u8005","/achievements/defeat_the_watcher":"\u89c2\u5bdf\u8005\u514b\u661f","/achievements/buy_trainee_charm":"\u62a4\u7b26\u52a0\u6301","/achievements/collection_points_200":"\u6536\u85cf\u5bb6 II","/achievements/bestiary_points_40":"\u730e\u4eba II","/achievements/build_room_level_1":"\u623f\u4e3b I","/achievements/total_level_500":"\u719f\u7ec3\u5192\u9669\u5bb6","/achievements/labyrinth_floor_2":"\u8ff7\u5bab\u63a2\u9669\u5bb6 I","/achievements/woodcut_arcane_tree":"\u5965\u79d8\u4f10\u6728\u5de5","/achievements/tailor_umbral_tunic":"\u6697\u5f71\u88c1\u7f1d","/achievements/cook_spaceberry_cake":"\u751c\u70b9\u5e08","/achievements/coinify_coins_1m":"\u70b9\u77f3\u6210\u91d1","/achievements/enhance_to_10":"\u5f3a\u5316\u5e08 III","/achievements/learn_special_ability":"\u6280\u80fd\u5927\u5e08","/achievements/defeat_jerry_t5":"\u7ec8\u6781\u6770\u745e\u6740\u624b","/achievements/defeat_chronofrost_sorcerer":"\u971c\u65f6\u6740\u624b","/achievements/defeat_red_panda":"\u5c0f\u718a\u732b\u9a6f\u670d\u8005","/achievements/collection_points_500":"\u6536\u85cf\u5bb6 III","/achievements/bestiary_points_100":"\u730e\u4eba III","/achievements/build_room_level_3":"\u623f\u4e3b II","/achievements/total_level_1000":"\u8001\u7ec3\u5192\u9669\u5bb6","/achievements/labyrinth_floor_4":"\u8ff7\u5bab\u63a2\u9669\u5bb6 II","/achievements/collect_butter_of_proficiency":"\u7cbe\u901a\u4e4b\u6cb9","/achievements/collect_branch_of_insight":"\u6d1e\u5bdf\u4e4b\u679d","/achievements/collect_thread_of_expertise":"\u4e13\u7cbe\u4e4b\u7ebf","/achievements/brew_ultra_magic_coffee":"\u7a76\u6781\u51b2\u6ce1\u5e08","/achievements/enhance_level_80_to_10":"\u5f3a\u5316\u5e08 IV","/achievements/craft_dungeon_equipment":"\u5730\u4e0b\u57ce\u953b\u9020\u5e08","/achievements/defeat_crystal_colossus":"\u6c34\u6676\u7834\u574f\u8005","/achievements/defeat_dusk_revenant":"\u4ea1\u7075\u730e\u624b","/achievements/clear_chimerical_den":"\u5947\u5e7b\u730e\u624b","/achievements/clear_sinister_circus":"\u9a6c\u620f\u56e2\u56e2\u957f","/achievements/collection_points_1000":"\u6536\u85cf\u5bb6 IV","/achievements/bestiary_points_200":"\u730e\u4eba IV","/achievements/equip_expert_task_badge":"\u4efb\u52a1\u5927\u5e08","/achievements/build_room_level_6":"\u623f\u4e3b III","/achievements/total_level_1500":"\u7cbe\u82f1\u5192\u9669\u5bb6","/achievements/labyrinth_floor_6":"\u8ff7\u5bab\u63a2\u9669\u5bb6 III","/achievements/craft_celestial_tool_or_outfit":"\u661f\u7a7a\u5de5\u5320","/achievements/tailor_gluttonous_or_guzzling_pouch":"\u96f6\u98df\u4e13\u5bb6","/achievements/craft_master_charm":"\u5927\u5e08\u62a4\u7b26\u5320","/achievements/transmute_philosophers_stone":"\u8d24\u8005","/achievements/refine_dungeon_equipment":"\u5730\u4e0b\u57ce\u7cbe\u70bc\u5e08","/achievements/enhance_level_90_to_10":"\u5f3a\u5316\u5e08 V","/achievements/defeat_demonic_overlord_t1":"\u9738\u4e3b\u4e4b\u672b\u65e5","/achievements/defeat_stalactite_golem_t5":"\u77f3\u50cf\u7834\u574f\u8005","/achievements/clear_enchanted_fortress":"\u8981\u585e\u5f81\u670d\u8005","/achievements/clear_pirate_cove":"\u6d77\u76d7\u514b\u661f","/achievements/clear_t1_dungeon_10_times":"\u5730\u4e0b\u57ce\u7cbe\u82f1","/achievements/collection_points_2000":"\u6536\u85cf\u5bb6 V","/achievements/bestiary_points_400":"\u730e\u4eba V","/achievements/build_room_level_8":"\u623f\u4e3b IV","/achievements/total_level_1800":"\u51a0\u519b\u5192\u9669\u5bb6","/achievements/labyrinth_floor_8":"\u8ff7\u5bab\u63a2\u9669\u5bb6 IV"},achievementDescriptions:{"/achievements/gather_milk":"\u4ece\u5976\u725b\u91c7\u96c61\u4e2a\u725b\u5976","/achievements/craft_wooden_bow":"\u7528\u5236\u4f5c\u6280\u80fd\u5236\u4f5c\u6728\u5f13","/achievements/cook_apple_gummy":"\u7528\u70f9\u996a\u6280\u80fd\u5236\u4f5c\u82f9\u679c\u8f6f\u7cd6","/achievements/complete_tutorial":"\u5b8c\u6210\u6559\u7a0b","/achievements/defeat_jerry":"\u72ec\u81ea\u51fb\u8d25\u6770\u745e","/achievements/total_level_100":"\u603b\u7b49\u7ea7\u8fbe\u5230100","/achievements/cheesesmith_azure_tool":"\u7528\u5976\u916a\u953b\u9020\u5236\u4f5c\u4efb\u610f\u851a\u84dd\u5de5\u5177","/achievements/tailor_medium_pouch":"\u7f1d\u7eab\u4e2d\u578b\u888b\u5b50","/achievements/brew_gourmet_tea":"\u51b2\u6ce1\u7f8e\u98df\u8336","/achievements/enhance_to_3":"\u6210\u529f\u5c06\u4efb\u610f\u88c5\u5907\u5f3a\u5316\u5230+3","/achievements/learn_ability":"\u5b66\u4e60\u6218\u6597\u6280\u80fd","/achievements/defeat_shoebill":"\u72ec\u81ea\u51fb\u8d25\u9cb8\u5934\u9e73","/achievements/defeat_marine_huntress":"\u72ec\u81ea\u51fb\u8d25\u6d77\u6d0b\u730e\u624b","/achievements/collection_points_100":"\u83b7\u5f97100\u70b9\u6536\u85cf\u79ef\u5206","/achievements/bestiary_points_20":"\u83b7\u5f9720\u70b9\u56fe\u9274\u79ef\u5206","/achievements/task_tokens_10":"\u603b\u5171\u8d5a\u53d610\u70b9\u4efb\u52a1\u79ef\u5206","/achievements/total_level_250":"\u603b\u7b49\u7ea7\u8fbe\u5230250","/achievements/craft_jewelry":"\u5236\u4f5c\u4efb\u610f\u9996\u9970","/achievements/cook_peach_yogurt":"\u70f9\u996a\u6843\u5b50\u9178\u5976","/achievements/decompose_bamboo_gloves":"\u6210\u529f\u5206\u89e3\u7af9\u624b\u5957","/achievements/enhance_to_6":"\u6210\u529f\u5c06\u4efb\u610f\u88c5\u5907\u5f3a\u5316\u5230+6","/achievements/equip_ginkgo_weapon":"\u88c5\u5907\u4efb\u610f\u94f6\u674f\u6b66\u5668\uff08\u6cd5\u6756\u3001\u5f13\u6216\u5f29\uff09","/achievements/defeat_luna_empress":"\u72ec\u81ea\u51fb\u8d25\u6708\u795e\u4e4b\u8776","/achievements/defeat_gobo_chieftain":"\u72ec\u81ea\u51fb\u8d25\u54e5\u5e03\u6797\u914b\u957f","/achievements/defeat_the_watcher":"\u72ec\u81ea\u51fb\u8d25\u89c2\u5bdf\u8005","/achievements/buy_trainee_charm":"\u4ece\u5546\u5e97\u8d2d\u4e70\u5b9e\u4e60\u62a4\u7b26","/achievements/collection_points_200":"\u83b7\u5f97200\u70b9\u6536\u85cf\u79ef\u5206","/achievements/bestiary_points_40":"\u83b7\u5f9740\u70b9\u56fe\u9274\u79ef\u5206","/achievements/build_room_level_1":"\u5728\u623f\u5c4b\u4e2d\u5efa\u90201\u7ea7\u623f\u95f4","/achievements/total_level_500":"\u603b\u7b49\u7ea7\u8fbe\u5230500","/achievements/labyrinth_floor_2":"\u5230\u8fbe\u8ff7\u5bab\u7b2c2\u5c42","/achievements/woodcut_arcane_tree":"\u780d\u4f10\u5965\u79d8\u6811","/achievements/tailor_umbral_tunic":"\u7f1d\u7eab\u6697\u5f71\u76ae\u8863","/achievements/cook_spaceberry_cake":"\u70f9\u996a\u592a\u7a7a\u8393\u86cb\u7cd5","/achievements/coinify_coins_1m":"\u901a\u8fc7\u70b9\u91d1\u83b7\u53d6100\u4e07\u91d1\u5e01","/achievements/enhance_to_10":"\u6210\u529f\u5c06\u4efb\u610f\u88c5\u5907\u5f3a\u5316\u5230+10","/achievements/learn_special_ability":"\u5b66\u4e60\u7279\u6b8a\u6280\u80fd","/achievements/defeat_jerry_t5":"\u72ec\u81ea\u51fb\u8d25T5\u6770\u745e","/achievements/defeat_chronofrost_sorcerer":"\u72ec\u81ea\u51fb\u8d25\u971c\u65f6\u5deb\u5e08","/achievements/defeat_red_panda":"\u72ec\u81ea\u51fb\u8d25\u5c0f\u718a\u732b","/achievements/collection_points_500":"\u83b7\u5f97500\u70b9\u6536\u85cf\u79ef\u5206","/achievements/bestiary_points_100":"\u83b7\u5f97100\u70b9\u56fe\u9274\u79ef\u5206","/achievements/build_room_level_3":"\u4e3a\u623f\u5c4b\u5efa\u90203\u7ea7\u623f\u95f4","/achievements/total_level_1000":"\u603b\u7b49\u7ea7\u8fbe\u52301000","/achievements/labyrinth_floor_4":"\u5230\u8fbe\u8ff7\u5bab\u7b2c4\u5c42","/achievements/collect_butter_of_proficiency":"\u4ece\u6324\u5976\u6216\u5976\u916a\u953b\u9020\u83b7\u5f97\u7cbe\u901a\u4e4b\u6cb9","/achievements/collect_branch_of_insight":"\u4ece\u4f10\u6728\u6216\u5236\u4f5c\u83b7\u5f97\u6d1e\u5bdf\u4e4b\u679d","/achievements/collect_thread_of_expertise":"\u4ece\u91c7\u6458\u6216\u7f1d\u7eab\u83b7\u5f97\u4e13\u7cbe\u4e4b\u7ebf","/achievements/brew_ultra_magic_coffee":"\u51b2\u6ce1\u7a76\u6781\u9b54\u6cd5\u5496\u5561","/achievements/enhance_level_80_to_10":"\u6210\u529f\u5c06\u7b49\u7ea780+\u7684\u88c5\u5907\u5f3a\u5316\u5230+10","/achievements/craft_dungeon_equipment":"\u7528\u539f\u6750\u6599\u5236\u6210\u4efb\u610f\u5730\u4e0b\u57ce\u88c5\u5907","/achievements/defeat_crystal_colossus":"\u72ec\u81ea\u51fb\u8d25\u6c34\u6676\u5de8\u50cf","/achievements/defeat_dusk_revenant":"\u72ec\u81ea\u51fb\u8d25\u9ec4\u660f\u4ea1\u7075","/achievements/clear_chimerical_den":"\u901a\u5173\u5947\u5e7b\u6d1e\u7a74\u5730\u4e0b\u57ce","/achievements/clear_sinister_circus":"\u901a\u5173\u9634\u68ee\u9a6c\u620f\u56e2\u5730\u4e0b\u57ce","/achievements/collection_points_1000":"\u83b7\u5f971000\u70b9\u6536\u85cf\u79ef\u5206","/achievements/bestiary_points_200":"\u83b7\u5f97200\u70b9\u56fe\u9274\u79ef\u5206","/achievements/equip_expert_task_badge":"\u88c5\u5907\u4e13\u5bb6\u4efb\u52a1\u5fbd\u7ae0","/achievements/build_room_level_6":"\u4e3a\u623f\u5c4b\u5efa\u90206\u7ea7\u623f\u95f4","/achievements/total_level_1500":"\u603b\u7b49\u7ea7\u8fbe\u52301500","/achievements/labyrinth_floor_6":"\u5230\u8fbe\u8ff7\u5bab\u7b2c6\u5c42","/achievements/craft_celestial_tool_or_outfit":"\u5236\u4f5c\u4efb\u610f\u661f\u7a7a\u5de5\u5177\u621690\u7ea7\u751f\u6d3b\u4e0a\u8863\u6216\u4e0b\u88c5","/achievements/tailor_gluttonous_or_guzzling_pouch":"\u7f1d\u7eab\u8d2a\u98df\u4e4b\u888b\u6216\u66b4\u996e\u4e4b\u56ca","/achievements/craft_master_charm":"\u5236\u4f5c\u4efb\u610f\u5927\u5e08\u62a4\u7b26","/achievements/transmute_philosophers_stone":"\u901a\u8fc7\u8f6c\u5316\u83b7\u5f97\u8d24\u8005\u4e4b\u77f3","/achievements/refine_dungeon_equipment":"\u7cbe\u70bc\u4efb\u610f\u5730\u4e0b\u57ce\u88c5\u5907","/achievements/enhance_level_90_to_10":"\u6210\u529f\u5c06\u7b49\u7ea790+\u7684\u88c5\u5907\u5f3a\u5316\u5230+10","/achievements/defeat_demonic_overlord_t1":"\u72ec\u81ea\u51fb\u8d25\u6076\u9b54\u9738\u4e3b\uff08T1\uff09","/achievements/defeat_stalactite_golem_t5":"\u72ec\u81ea\u51fb\u8d25\u949f\u4e73\u77f3\u9b54\u50cf\uff08T5\uff09","/achievements/clear_enchanted_fortress":"\u901a\u5173\u79d8\u6cd5\u8981\u585e\u5730\u4e0b\u57ce","/achievements/clear_pirate_cove":"\u901a\u5173\u6d77\u76d7\u57fa\u5730\u5730\u4e0b\u57ce","/achievements/clear_t1_dungeon_10_times":"\u901a\u5173\u4efb\u610fT1\u6216\u66f4\u9ad8\u5730\u4e0b\u57ce10\u6b21","/achievements/collection_points_2000":"\u83b7\u5f972000\u70b9\u6536\u85cf\u79ef\u5206","/achievements/bestiary_points_400":"\u83b7\u5f97400\u70b9\u56fe\u9274\u79ef\u5206","/achievements/build_room_level_8":"\u5728\u623f\u5c4b\u4e2d\u5efa\u90208\u7ea7\u623f\u95f4","/achievements/total_level_1800":"\u603b\u7b49\u7ea7\u8fbe\u52301800","/achievements/labyrinth_floor_8":"\u5230\u8fbe\u8ff7\u5bab\u7b2c8\u5c42"},achievementTierNames:{"/achievement_tiers/beginner":"\u521d\u5b66\u8005","/achievement_tiers/novice":"\u65b0\u624b","/achievement_tiers/adept":"\u719f\u7ec3\u8005","/achievement_tiers/veteran":"\u8001\u624b","/achievement_tiers/elite":"\u7cbe\u82f1","/achievement_tiers/champion":"\u51a0\u519b"}}};
    
        function getItemName(itemHrid) {
          if (globals.isZHInGameSetting) return ZHitemNames[itemHrid];else return globals.initClientData_itemDetailMap[itemHrid].name;
        }
        function getActionName(actionHrid) {
          if (globals.isZHInGameSetting) return ZHActionNames[actionHrid];else return globals.initClientData_actionDetailMap[actionHrid].name;
        }
        function getItemValuation(hrid, marketJson) {
          const item = globals.initClientData_itemDetailMap[hrid];
          if (!item) {
            console.log(`${hrid} can't found the item detail`);
            return {
              bid: 0,
              ask: 0
            };
          }
          if (item?.isTradable) {
            const ret = {
              ...marketJson.market[item.name]
            };
            if (ret.bid == -1 && ret.ask == -1) ret.ask = ret.bid = 1e9;else if (ret.bid == -1 || ret.ask == -1) ret.ask = ret.bid = Math.max(ret.ask, ret.bid);
            if (globals.medianMarketJson?.market) {
              const median = globals.medianMarketJson.market[item.name];
              ret.medianAsk = median?.ask ?? 0;
              ret.medianBid = median?.bid ?? 0;
            }
            return ret;
          } else if (item?.isOpenable) {
            const openedItems = globals.initClientData_openableLootDropMap[hrid];
            const valuation = {
              bid: 0,
              ask: 0,
              medianAsk: 0,
              medianBid: 0
            };
            for (const openedItem of openedItems) {
              const openedValuation = getItemValuation(openedItem.itemHrid, marketJson);
              valuation.bid += openedItem.dropRate * (openedItem.minCount + openedItem.maxCount) / 2 * openedValuation.bid;
              valuation.ask += openedItem.dropRate * (openedItem.minCount + openedItem.maxCount) / 2 * openedValuation.ask;
              valuation.medianBid += openedItem.dropRate * (openedItem.minCount + openedItem.maxCount) / 2 * (openedValuation?.medianBid ?? 0);
              valuation.medianAsk += openedItem.dropRate * (openedItem.minCount + openedItem.maxCount) / 2 * (openedValuation?.medianAsk ?? 0);
            }
            return valuation;
          } else if (hrid === "/items/coin") return {
            ask: 1,
            bid: 1,
            medianAsk: 1,
            medianBid: 1
          };else if (hrid === "/items/cowbell") {
            const pack = getItemValuation("/items/bag_of_10_cowbells", marketJson);
            return {
              ask: pack.ask / 10,
              bid: pack.bid / 10,
              medianAsk: (pack?.medianAsk ?? 0) / 10,
              medianBid: (pack?.medianBid ?? 0) / 10
            };
          } else return {
            ask: item.sellPrice,
            bid: item.sellPrice,
            medianAsk: item.sellPrice,
            medianBid: item.sellPrice
          };
        }
        function getDropTableInfomation(dropTable, marketJson, teaBuffs = {
          processing: 0
        }) {
          const valuationResult = {
            ask: 0,
            bid: 0
          };
          const dropItems = [];
          for (const drop of dropTable) {
            const valuation = getItemValuation(drop.itemHrid, marketJson);
            let dropCount = (drop.minCount + drop.maxCount) / 2 * drop.dropRate;
            if (globals.processingMap && teaBuffs.processing) {
              const processingAction = globals.processingMap[drop.itemHrid];
              if (processingAction) {
                // Add processed production
                const outputItemHrid = processingAction.outputItems[0].itemHrid;
                const valuation = getItemValuation(outputItemHrid, marketJson);
                const outputCount = teaBuffs.processing / 100 * drop.dropRate;
                valuationResult.ask += valuation.ask * outputCount;
                valuationResult.bid += valuation.bid * outputCount;
                dropItems.push({
                  name: getItemName(outputItemHrid),
                  ...valuation,
                  count: outputCount
                });
    
                // Reduce processed inputItem
                dropCount -= outputCount * processingAction.inputItems[0].count;
              }
            }
            valuationResult.ask += valuation.ask * dropCount;
            valuationResult.bid += valuation.bid * dropCount;
            dropItems.push({
              itemHrid: drop.itemHrid,
              name: getItemName(drop.itemHrid),
              ...valuation,
              count: dropCount
            });
          }
          return {
            ...valuationResult,
            dropItems
          };
        }
        function getSvg(iconId) {
          if (globals.initClientData_itemDetailMap[`/items/${iconId}`]) return `items_sprite.9c39e2ec.svg#${iconId}`;
          return `actions_sprite.e6388cbc.svg#${iconId}`;
        }
        function formatNumber(val) {
          let number = Number(val);
          const abs = Math.abs(number);
          if (abs < 10) return Number(Math.trunc(number * 1000) / 1000);else if (abs < 1000) return Number(Math.trunc(number * 10) / 10);else if (abs < 1e5) return Math.trunc(number);else if (abs < 1e6) return `${Number(Math.trunc(number / 100) / 10)}k`;else if (abs < 1e9) return `${Number(Math.trunc(number / 1e4) / 100)}M`;else if (abs < 1e12) return `${Number(Math.trunc(number / 1e7) / 100)}B`;else return `${Math.trunc(number / 1e12)}T`;
        }
        function getSign(val) {
          if (val > 0) return '↑';else if (val < 0) return '↓';
          return '';
        }
        function getDuration(date) {
          return formatDuration(Date.now() - date.getTime());
        }
        function formatDuration(diffMs) {
          const diffSeconds = Math.floor(diffMs / 1000);
          if (diffSeconds < 60) return `${diffSeconds}${t('秒前', 's ago')}`;
          const diffMinutes = Math.floor(diffSeconds / 60);
          if (diffMinutes < 60) return `${diffMinutes}${t('分钟前', 'm ago')}`;
          const diffHours = Math.floor(diffMinutes / 60);
          return `${diffHours}${t('小时', 'h')} ${diffMinutes - diffHours * 60}${t('分钟前', 'm ago')}`;
        }
        function getMwiObj$1() {
          try {
            if (mwi) return mwi;
            return null;
          } catch (e) {
            return null;
          }
        }
    
        // 完整的物品名称翻译
        const ZHitemNames = zhTranslation.itemNames;
    
        // 完整的动作名称翻译
        const ZHActionNames = zhTranslation.actionNames;
        const processingCategory = {
          "/action_types/cheesesmithing": ["/action_categories/cheesesmithing/material"],
          "/action_types/crafting": ["/action_categories/crafting/lumber", "/action_categories/crafting/special"],
          "/action_types/tailoring": ["/action_categories/tailoring/material"]
        };
        const ZHActionTypeNames = {
          milking: "\u6324\u5976",
          foraging: "\u91c7\u6458",
          woodcutting: "\u4f10\u6728",
          cheesesmithing: "\u5976\u916a\u953b\u9020",
          crafting: "\u5236\u4f5c",
          tailoring: "\u7f1d\u7eab",
          cooking: "\u70f9\u996a",
          brewing: "\u51b2\u6ce1"
        };
        function getActionTypeName(actionType) {
          if (globals.isZHInGameSetting) {
            return ZHActionTypeNames[actionType] || actionType;
          }
          return actionType;
        }
        const OneSecond = 1000;
        const OneMinute = 60 * OneSecond;
        const OneHour = 60 * OneMinute;
        const TimeSpan = {
          TEN_SECONDS: 10 * OneSecond,
          FIVE_MINUTES: 5 * OneMinute,
          HALF_HOURS: 30 * OneMinute,
          ONE_HOURS: OneHour,
          FOUR_HOURS: 4 * OneHour
        };
    
        /**
         * 将秒数格式化为可读时间
         * @param {number} seconds - 秒数
         * @returns {string} - 格式化后的时间字符串，如 "1d 3h" 或 "30m"
         */
        function timeReadable(seconds) {
          if (isNaN(seconds) || seconds === Infinity || seconds <= 0) {
            return "-";
          }
          const days = Math.floor(seconds / 86400);
          const hrs = Math.floor(seconds % 86400 / 3600);
          const mins = Math.floor(seconds % 3600 / 60);
          if (days > 0) {
            return `${days}d ${hrs}h`;
          } else if (hrs > 0) {
            return `${hrs}h ${mins}m`;
          } else {
            return `${mins}m`;
          }
        }
    
        /**
         * 获取当前技能的实时数据
         * 优先使用 getMwiObj() 获取实时数据，如果失败则使用 globals
         * @param {string} skillHrid - 技能 HRID，如 "/skills/foraging"
         * @returns {Object|null} - 技能对象或 null
         */
        function getCurrentSkill(skillHrid) {
          // 优先从游戏对象获取实时数据
          const mwiObj = getMwiObj$1();
          if (mwiObj?.game?.state?.characterSkillMap) {
            const skill = [...mwiObj.game.state.characterSkillMap.values()].find(s => s.skillHrid === skillHrid);
            if (skill) return skill;
          }
          // 回退到 globals 数据
          return globals.initCharacterData_characterSkills.find(s => s.skillHrid === skillHrid);
        }
    
        /**
         * 翻译函数
         * @param {string} zh - 中文文本
         * @param {string} en - 英文文本
         * @returns {string} - 根据游戏设置返回对应语言文本
         */
        function t(zh, en) {
          return globals.isZHInGameSetting ? zh : en;
        }
    
        const officialConfig = {
          cacheKey: "officialMarketDataCache",
          targetUrls: ["https://www.milkywayidle.com/game_data/marketplace.json", "https://www.milkywayidlecn.com/game_data/marketplace.json"],
          dataTransfer: data => {
            data.market = data.marketData;
            delete data.marketData;
            data.time = data.timestamp;
            delete data.timestamp;
          },
          dataRefreshInterval: TimeSpan.FOUR_HOURS
        };
        const mooketConfig = {
          cacheKey: "mooketMarketDataCache",
          targetUrls: ["https://mooket.qi-e.top/market/api.json"],
          dataTransfer: data => {
            data.market = data.marketData;
            delete data.marketData;
            data.time = data.timestamp;
            delete data.timestamp;
          },
          dataRefreshInterval: TimeSpan.HALF_HOURS
        };
        class MWIApiMarketJson {
          constructor(config) {
            this.dataRefreshInterval = config.dataRefreshInterval || TimeSpan.ONE_HOURS;
            this.cacheMaxAge = TimeSpan.FIVE_MINUTES;
            this.retryInterval = TimeSpan.TEN_SECONDS;
            this.refreshTimer = null;
            this.data = null;
            this.cacheKey = config.cacheKey;
            this.targetUrls = config.targetUrls;
            this.dataTransfer = config.dataTransfer;
            this.fetchMarketJson();
            return new Proxy(this, {
              get(target, prop) {
                if (target.data) return target.data[prop];
                return null;
              },
              set(target, prop, value) {
                // Cant be set outside
                return true;
              }
            });
          }
          clearRefreshTimer() {
            if (this.refreshTimer) {
              clearTimeout(this.refreshTimer);
              this.refreshTimer = null;
            }
          }
          schedualNextRefresh({
            data,
            timestamp
          }) {
            if (data) {
              this.data = data;
              dispatchEvent(new CustomEvent(this.cacheKey, {
                detail: data
              }));
              globals.hasMarketItemUpdate = true; // 主动刷新数据
            }
            const now = Date.now();
            const cacheAge = now - timestamp;
            const dataAge = data?.time ? now - new Date(data.time * 1000).getTime() : this.dataRefreshInterval;
            const nextRefreshTime = data ? Math.max(this.dataRefreshInterval - dataAge, this.cacheMaxAge - cacheAge, this.retryInterval) : this.retryInterval;
            this.clearRefreshTimer();
            this.refreshTimer = setTimeout(async () => {
              this.clearRefreshTimer();
              await this.fetchMarketJson();
            }, nextRefreshTime);
          }
          fetchMarketJson() {
            // 检查缓存
            const cachedData = localStorage.getItem(this.cacheKey);
            if (cachedData) {
              try {
                const {
                  data,
                  timestamp
                } = JSON.parse(cachedData);
                const now = Date.now();
                const cacheAge = now - timestamp;
                const dataAge = data?.time ? now - new Date(data.time * 1000).getTime() : this.dataRefreshInterval;
    
                // 如果数据未过期（1小时内）或 缓存足够新（5分钟内）
                if (dataAge < this.dataRefreshInterval || cacheAge < this.cacheMaxAge) {
                  this.schedualNextRefresh({
                    data,
                    timestamp
                  });
                  return data;
                }
              } catch (e) {
                console.error('Failed to parse cache:', e);
              }
            }
            return new Promise(resolve => {
              const urls = this.targetUrls;
              let currentIndex = 0;
              const tryNextUrl = () => {
                if (currentIndex >= urls.length) {
                  // 所有URL尝试失败，返回缓存或null
                  if (cachedData) {
                    try {
                      const {
                        data
                      } = JSON.parse(cachedData);
                      resolve(data);
                    } catch (e) {
                      resolve(null);
                    }
                  } else {
                    resolve(null);
                  }
                  return;
                }
                try {
                  GM_xmlhttpRequest({
                    method: "GET",
                    url: urls[currentIndex],
                    onload: response => {
                      try {
                        let data = JSON.parse(response.responseText);
                        if (this.dataTransfer) this.dataTransfer(data);
                        if (!data?.market) {
                          throw new Error('Invalid market data structure');
                        }
    
                        // 更新缓存
                        localStorage.setItem(this.cacheKey, JSON.stringify({
                          data,
                          timestamp: Date.now()
                        }));
                        resolve(data);
                      } catch (e) {
                        console.error('Failed to parse market data:', e);
                        currentIndex++;
                        tryNextUrl();
                      }
                    },
                    onerror: function (error) {
                      console.error(`Failed to fetch market data from ${urls[currentIndex]}:`, error);
                      currentIndex++;
                      tryNextUrl();
                    }
                  });
                } catch (error) {
                  console.error('Request setup failed:', error);
                  currentIndex++;
                  tryNextUrl();
                }
              };
              tryNextUrl();
            }).then(data => {
              this.schedualNextRefresh({
                data,
                timestamp: Date.now()
              });
              return data;
            });
          }
        }
        class MooketMarketRealtime {
          constructor(updateCallback) {
            this.mwi = getMwiObj$1();
            this.updateCallback = updateCallback;
            addEventListener('MWICoreItemPriceUpdated', e => {
              console.log({
                detail: e.detail
              });
              const price = this.parseRealtimePrice(e.detail);
              if (price) {
                this.updateCallback(price);
              }
            });
          }
          parseRealtimePrice({
            priceObj,
            itemHridLevel
          }) {
            if (!itemHridLevel) return;
            const [itemHrid, level] = itemHridLevel.split(":");
            if (level !== "0") return;
            const item = globals.initClientData_itemDetailMap[itemHrid];
            return {
              name: item.name,
              ask: priceObj.ask,
              bid: priceObj.bid,
              time: priceObj.time
            };
          }
        }
        const DataSourceKey = {
          Official: "Official",
          MooketApi: "MooketApi",
          Mooket: "Mooket",
          User: "User",
          Init: "Init"
        };
    
        // MedianMarketCache - 管理历史市场数据快照
        class MedianMarketCache {
          constructor() {
            this.cacheKey = "medianMarketSnapshotCache";
            this.data = null;
            this.loadFromCache();
            return new Proxy(this, {
              get(target, prop) {
                // 优先返回目标对象自身的方法和属性
                if (prop in target && typeof target[prop] === 'function') {
                  return target[prop].bind(target);
                }
                if (prop === 'market') {
                  return target.data || {};
                }
                if (target.data && prop in target.data) {
                  return target.data[prop];
                }
                return target[prop];
              },
              set(target, prop, value) {
                // 不允许外部直接设置
                return true;
              }
            });
          }
          loadFromCache() {
            try {
              const cached = localStorage.getItem(this.cacheKey);
              if (cached) {
                this.data = JSON.parse(cached);
                console.log('[MedianMarketCache] 从缓存加载历史数据');
              }
            } catch (e) {
              console.error('[MedianMarketCache] 加载缓存失败:', e);
            }
          }
          update(currentMarketData) {
            try {
              // 深拷贝当前市场数据作为新的历史快照
              this.data = JSON.parse(JSON.stringify(currentMarketData));
              // 持久化到 localStorage
              localStorage.setItem(this.cacheKey, JSON.stringify(this.data));
              console.log('[MedianMarketCache] 更新历史数据快照');
            } catch (e) {
              console.error('[MedianMarketCache] 更新快照失败:', e);
            }
          }
          setDefault(defaultMarketData) {
            // 仅在首次初始化且没有缓存数据时使用
            if (!this.data && defaultMarketData) {
              this.data = JSON.parse(JSON.stringify(defaultMarketData));
              localStorage.setItem(this.cacheKey, JSON.stringify(this.data));
              console.log('[MedianMarketCache] 设置默认历史数据');
            }
          }
        }
        class UnifyMarketData {
          constructor(itemDetailMap) {
            this.market = {};
            this.name2Hrid = {};
            this.statMap = {
              src: {},
              oldestItem: {},
              newestItem: {}
            };
            this.time = Date.now() / 1000;
            this.initMarketData(itemDetailMap);
            if (globals.profitSettings.dataSourceKeys.includes(DataSourceKey.Official)) {
              addEventListener(officialConfig.cacheKey, e => this.updateDataFromOfficialStyle(e.detail, DataSourceKey.Official));
              this.officialMarketJson = new MWIApiMarketJson(officialConfig);
            }
            if (globals.profitSettings.dataSourceKeys.includes(DataSourceKey.MooketApi)) {
              addEventListener(mooketConfig.cacheKey, e => this.updateDataFromOfficialStyle(e.detail, DataSourceKey.MooketApi));
              this.mooketMarketJson = new MWIApiMarketJson(mooketConfig);
            }
            if (globals.profitSettings.dataSourceKeys.includes(DataSourceKey.Mooket)) {
              this.mooketRealtime = new MooketMarketRealtime(item => this.updateRealtimePrice(item));
            }
          }
          initMarketData(itemDetailMap) {
            for (const [hrid, item] of Object.entries(itemDetailMap)) {
              if (item?.isTradable) {
                this.market[item.name] = {
                  ask: item.sellPrice,
                  bid: item.sellPrice,
                  time: 0,
                  src: DataSourceKey.Init
                };
                this.name2Hrid[item.name] = hrid;
              }
            }
            this.mergeFromCache();
            this.postUpdate();
          }
          updateDataFromOfficialStyle(marketJson, src) {
            // 在更新新数据前，先保存当前数据作为历史快照
            if (globals.medianMarketJson?.update) {
              globals.medianMarketJson.update(this.market);
            }
            const time = marketJson.time;
            for (const [name, item] of Object.entries(this.market)) {
              if (item.time > time) continue;
              const hrid = this.name2Hrid[name];
              const newPrice = marketJson?.market[hrid];
              if (!newPrice || !newPrice["0"]) continue;
              const level0 = newPrice["0"];
              Object.assign(item, {
                ask: level0.a,
                bid: level0.b,
                src,
                time
              });
            }
            this.postUpdate();
          }
          updateRealtimePrice(item) {
            const targetItem = this.market[item.name];
            if (targetItem?.time < item?.time) {
              Object.assign(targetItem, {
                ask: item.ask,
                bid: item.bid,
                src: DataSourceKey.Mooket,
                time: item.time
              });
              this.postUpdate();
            }
          }
          updateDataFromMarket(marketItemOrderBooks) {
            const itemHrid = marketItemOrderBooks?.itemHrid;
            if (itemHrid) {
              const item = globals.initClientData_itemDetailMap[itemHrid];
              const orderBook = marketItemOrderBooks?.orderBooks[0];
              const ask = orderBook?.asks?.length > 0 ? orderBook.asks[0].price : item.sellPrice;
              const bid = orderBook?.bids?.length > 0 ? orderBook.bids[0].price : item.sellPrice;
              const targetItem = this.market[item.name];
              Object.assign(targetItem, {
                ask,
                bid,
                src: DataSourceKey.User,
                time: Date.now() / 1000
              });
              this.postUpdate();
            }
          }
          postUpdate() {
            const newStas = {};
            let oldestItem = {
              name: "",
              time: Date.now() / 1000
            };
            let newestItem = {
              name: "",
              time: 0
            };
            let total = 0;
            for (const [name, item] of Object.entries(this.market)) {
              if (!newStas[item.src]) newStas[item.src] = 0;
              newStas[item.src]++;
              if (item.time < oldestItem.time) oldestItem = {
                name,
                time: item.time
              };
              if (item.time > newestItem.time) newestItem = {
                name,
                time: item.time
              };
              ++total;
            }
            this.time = oldestItem.time;
            Object.assign(this.statMap, {
              src: {
                ...newStas,
                total
              },
              oldestItem,
              newestItem
            });
            this.dumpToCache();
            globals.hasMarketItemUpdate = true;
          }
          mergeFromCache() {
            const cacheMarket = JSON.parse(GM_getValue('UnifyMarketData', '{}'));
            for (const [name, item] of Object.entries(this.market)) if (cacheMarket[name]) {
              const {
                ask,
                bid,
                src,
                time
              } = cacheMarket[name];
              if (DataSourceKey[src]) {
                Object.assign(item, {
                  ask,
                  bid,
                  src,
                  time
                });
              }
            }
          }
          dumpToCache() {
            GM_setValue('UnifyMarketData', JSON.stringify(this.market));
          }
          stat() {
            const dataSrcArr = [];
            for (const [k, val] of Object.entries(DataSourceKey)) {
              if (this.statMap.src[val]) {
                dataSrcArr.push(`${val} (${formatNumber(this.statMap.src[val] * 100 / this.statMap.src.total)}%)`);
              }
            }
            const oldestItemName = globals.isZHInGameSetting ? globals.en2ZhMap[this.statMap.oldestItem.name] : this.statMap.oldestItem.name;
            const newestItemName = globals.isZHInGameSetting ? globals.en2ZhMap[this.statMap.newestItem.name] : this.statMap.newestItem.name;
            const oldestStr = `${oldestItemName}(${getDuration(new Date(this.statMap.oldestItem.time * 1000))})`;
            `${newestItemName}(${getDuration(new Date(this.statMap.newestItem.time * 1000))})`;
            return `${t('最旧', 'Oldest')}: ${oldestStr} ${t('数据来源', 'Data Source')}: [${dataSrcArr.join(',')}]`;
          }
        }
        async function preFetchData() {
          // 初始化历史数据缓存
          globals.medianMarketJson = new MedianMarketCache();
    
          // 初始化统一市场数据
          globals.freshnessMarketJson = new UnifyMarketData(globals.initClientData_itemDetailMap);
    
          // 如果是第一次运行（没有历史缓存），使用初始市场数据作为默认值
          if (globals.medianMarketJson?.setDefault) {
            globals.medianMarketJson.setDefault(globals.freshnessMarketJson.market);
          }
        }
    
        class Buff {
          constructor() {
            this.artisan = 0; // "Reduces required materials during production"
            this.action_speed = 0; // "Decreases time cost for the action"
            this.alchemy_success = 0; // "Multiplicative bonus to success rate while alchemizing"
            this.blessed = 0; // "Chance to gain +2 instead of +1 on enhancing success"
            this.combat_drop_quantity = 0; // "Increases quantity of combat loot",
            this.efficiency = 0; // "Chance of repeating the action instantly"
            this.essence_find = 0; // "Increases drop rate of essences"
            this.enhancing_success = 0; // "Multiplicative bonus to success rate while enhancing",
            this.gathering = 0; // "Increases gathering quantity"
            this.wisdom = 0; // "Increases experience gained"
            this.processing = 0; // "Chance to instantly convert gathered resource into processed material"
            this.rare_find = 0; // "Increases rare item drop rate"
          }
          static fromBuffs(buffs) {
            const buff = new Buff();
            if (!buffs) return buff;
            for (const {
              typeHrid,
              flatBoost
            } of buffs) {
              switch (typeHrid) {
                case "/buff_types/artisan":
                  buff.artisan += flatBoost * 100;
                  break;
                case "/buff_types/action_level":
                  buff.efficiency -= flatBoost;
                  break;
                case "/buff_types/action_speed":
                  buff.action_speed += flatBoost * 100;
                  break;
                case "/buff_types/alchemy_success":
                  buff.alchemy_success += flatBoost * 100;
                  break;
                case "/buff_types/blessed":
                  buff.blessed += flatBoost * 100;
                  break;
                case "/buff_types/combat_drop_quantity":
                  buff.combat_drop_quantity += flatBoost * 100;
                  break;
                case "/buff_types/essence_find":
                  buff.essence_find += flatBoost * 100;
                  break;
                case "/buff_types/efficiency":
                  buff.efficiency += flatBoost * 100;
                  break;
                case "/buff_types/enhancing_success":
                  buff.enhancing_success += flatBoost * 100;
                  break;
                case "/buff_types/gathering":
                case "/buff_types/gourmet":
                  buff.gathering += flatBoost * 100;
                  break;
                case "/buff_types/wisdom":
                  buff.wisdom += flatBoost * 100;
                  break;
                case "/buff_types/processing":
                  buff.processing += flatBoost * 100;
                  break;
                case "/buff_types/rare_find":
                  buff.rare_find += flatBoost * 100;
                  break;
                default:
                  if (typeHrid.endsWith("_level")) buff.efficiency += flatBoost;else console.error(`unhandled buff type - ${typeHrid}`);
                  break;
              }
            }
            return buff;
          }
        }
        class BuffsProvider {
          constructor() {
            // 缓存所有buff数据
            this.buffCache = {
              community: new Map(),
              tea: new Map(),
              equipment: new Map(),
              house: new Map(),
              achievement: new Map(),
              personal: new Map(),
              mooPass: new Map()
            };
    
            // 订阅全局数据变化
            globals.subscribe((key, value) => {
              if (key === 'initCharacterData_communityActionTypeBuffsMap') this.updateBuffCache('community', value);else if (key === 'initCharacterData_consumableActionTypeBuffsMap') this.updateBuffCache('tea', value);else if (key === 'initCharacterData_equipmentActionTypeBuffsMap') this.updateBuffCache('equipment', value);else if (key === 'initCharacterData_houseActionTypeBuffsMap') this.updateBuffCache('house', value);else if (key === 'initCharacterData_achievementActionTypeBuffsMap') this.updateBuffCache('achievement', value);else if (key === 'initCharacterData_personalActionTypeBuffsMap') this.updateBuffCache('personal', value);else if (key === 'initCharacterData_mooPassActionTypeBuffsMap') this.updateBuffCache('mooPass', value);
            });
            this.updateBuffCache('community', globals.initCharacterData_communityActionTypeBuffsMap);
            this.updateBuffCache('tea', globals.initCharacterData_consumableActionTypeBuffsMap);
            this.updateBuffCache('equipment', globals.initCharacterData_equipmentActionTypeBuffsMap);
            this.updateBuffCache('house', globals.initCharacterData_houseActionTypeBuffsMap);
            this.updateBuffCache('achievement', globals.initCharacterData_achievementActionTypeBuffsMap);
            this.updateBuffCache('personal', globals.initCharacterData_personalActionTypeBuffsMap);
            this.updateBuffCache('mooPass', globals.initCharacterData_mooPassActionTypeBuffsMap);
          }
          updateBuffCache(type, data) {
            this.clearCache(type);
            for (const [actionType, buffs] of Object.entries(data)) {
              this.buffCache[type].set(actionType, Buff.fromBuffs(buffs));
            }
          }
          clearCache(type) {
            if (this.buffCache[type]) {
              this.buffCache[type].clear();
            }
          }
          getCommunityBuff(actionTypeHrid) {
            return this.buffCache.community.get(actionTypeHrid) || new Buff();
          }
          getTeaBuffs(actionTypeHrid) {
            return this.buffCache.tea.get(actionTypeHrid) || new Buff();
          }
          getHouseBuff(actionTypeHrid) {
            return this.buffCache.house.get(actionTypeHrid) || new Buff();
          }
          getEquipmentBuff(actionTypeHrid) {
            return this.buffCache.equipment.get(actionTypeHrid) || new Buff();
          }
          getAchievementBuff(actionTypeHrid) {
            return this.buffCache.achievement.get(actionTypeHrid) || new Buff();
          }
          getPersonalBuff(actionTypeHrid) {
            return this.buffCache.personal.get(actionTypeHrid) || new Buff();
          }
          getMooPassBuff(actionTypeHrid) {
            return this.buffCache.mooPass.get(actionTypeHrid) || new Buff();
          }
        }
    
        // "community_buffs_updated" === e.type ? this.handleMessageCommunityBuffsUpdated(e)
        var buffs = new BuffsProvider();
    
        function ProfitCaculation(action, marketJson) {
          const isProduction = action.inputItems?.length > 0;
          const actionHrid = action.hrid;
          const buyMode = globals.profitSettings.materialPriceMode || 'bid';
          const sellMode = globals.profitSettings.productPriceMode || 'ask';
    
          // 茶(饮品)效率和支出计算
          const teaBuffs = buffs.getTeaBuffs(action.type);
          const drinkConcentration = globals.initCharacterData_noncombatStats?.drinkConcentration || 0;
          const drinksPerHour = 12 * (1 + drinkConcentration);
          const drinksConsumedHourAskPrice = {
            ask: 0,
            bid: 0
          };
          const drinksList = globals.initCharacterData_actionTypeDrinkSlotsMap[action.type];
          const drinkItems = [];
          for (const drink of drinksList) {
            if (!drink?.itemHrid) continue;
            const valuation = getItemValuation(drink.itemHrid, marketJson);
            drinksConsumedHourAskPrice.ask += (valuation?.ask ?? 0) * drinksPerHour;
            drinksConsumedHourAskPrice.bid += (valuation?.bid ?? 0) * drinksPerHour;
            drinkItems.push({
              ...valuation,
              name: getItemName(drink.itemHrid),
              countPerHour: drinksPerHour
            });
          }
          const communityBuff = buffs.getCommunityBuff(action.type);
          const achievementBuff = buffs.getAchievementBuff(action.type);
          const personalBuff = buffs.getPersonalBuff(action.type);
          const mooPassBuff = buffs.getMooPassBuff(action.type);
    
          // 原料支出计算
          let inputItems = [];
          const totalResourcesPricePerAction = {
            ask: 0,
            bid: 0
          };
          if (isProduction) {
            inputItems = JSON.parse(JSON.stringify(action.inputItems));
            for (const item of inputItems) {
              item.name = getItemName(item.itemHrid);
              Object.assign(item, getItemValuation(item.itemHrid, marketJson));
              // 茶减少原料消耗
              item.count *= 1 - teaBuffs.artisan / 100;
              totalResourcesPricePerAction.ask += item.ask * item.count;
              totalResourcesPricePerAction.bid += item.bid * item.count;
            }
    
            // 上级物品作为原料
            if (action.upgradeItemHrid) {
              const valuation = getItemValuation(action.upgradeItemHrid, marketJson);
              totalResourcesPricePerAction.ask += valuation?.ask;
              totalResourcesPricePerAction.bid += valuation?.bid;
              const upgradedItem = {
                name: getItemName(action.upgradeItemHrid),
                ...valuation,
                count: 1
              };
              inputItems.push(upgradedItem);
            }
          }
    
          // 等级碾压提高效率（人物等级不及最低要求等级时，按最低要求等级计算）
          const requiredLevel = action.levelRequirement.level;
          let currentLevel = requiredLevel;
          for (const skill of globals.initCharacterData_characterSkills) {
            if (skill.skillHrid === action.levelRequirement.skillHrid) {
              currentLevel = skill.level;
              break;
            }
          }
          const levelEffBuff = Math.max(currentLevel - requiredLevel, 0);
          // 房子效率
          const houseBuff = buffs.getHouseBuff(action.type);
          // 特殊装备效率
          const equipmentBuff = buffs.getEquipmentBuff(action.type);
          // 总效率，影响动作数
          const totalEffBuff = levelEffBuff + houseBuff.efficiency + teaBuffs.efficiency + equipmentBuff.efficiency + communityBuff.efficiency + achievementBuff.efficiency + personalBuff.efficiency;
    
          // 每小时动作数（包含工具缩减动作时间）
          const baseTimePerActionSec = action.baseTimeCost / 1000000000;
          // 游戏机制：动作时间最低只能到3秒
          const actualTimePerActionSec = Math.max(3, baseTimePerActionSec / (1 + equipmentBuff.action_speed / 100));
          const actionPerHour = 3600 / actualTimePerActionSec * (1 + totalEffBuff / 100);
    
          // 总 Wisdom Buff 计算（用于经验值）
          const totalWisdomBuff = (teaBuffs.wisdom || 0) + (communityBuff.wisdom || 0) + (equipmentBuff.wisdom || 0) + (houseBuff.wisdom || 0) + (achievementBuff.wisdom || 0) + (personalBuff.wisdom || 0) + (mooPassBuff.wisdom || 0);
    
          // 经验值计算
          const baseExpGain = action.experienceGain?.value || 0;
          const expPerAction = Math.round((1 + totalWisdomBuff / 100) * baseExpGain * 10) / 10;
          const expPerHour = expPerAction * actionPerHour;
    
          // 每小时支出
          const expendPerHour = totalResourcesPricePerAction[buyMode] * actionPerHour + drinksConsumedHourAskPrice[buyMode];
          const outputItems = [];
          // 基础产出
          let basicOutputValuationPerAction = {
            ask: 0,
            bid: 0
          };
          if (isProduction) {
            for (const output of action.outputItems) {
              const valuation = getItemValuation(output.itemHrid, marketJson);
              basicOutputValuationPerAction.ask += valuation.ask * output.count;
              basicOutputValuationPerAction.bid += valuation.bid * output.count;
              outputItems.push({
                name: getItemName(output.itemHrid),
                ...valuation,
                count: output.count
              });
            }
          } else {
            basicOutputValuationPerAction = getDropTableInfomation(action.dropTable, marketJson, teaBuffs);
            outputItems.push(...basicOutputValuationPerAction.dropItems);
          }
    
          // 茶产量额外增益
          const quantityBuf = (100 + teaBuffs.gathering + communityBuff.gathering + achievementBuff.gathering + personalBuff.gathering) / 100;
          basicOutputValuationPerAction.ask *= quantityBuf;
          basicOutputValuationPerAction.bid *= quantityBuf;
          outputItems.forEach(item => item.count *= quantityBuf);
    
          // 精华掉落
          const essenceOutputValuationPerAction = Array.isArray(action?.essenceDropTable) ? getDropTableInfomation(action.essenceDropTable, marketJson) : {
            ask: 0,
            bid: 0
          };
          if (essenceOutputValuationPerAction.dropItems) {
            const quantityBuf = (100 + equipmentBuff.essence_find) / 100;
            essenceOutputValuationPerAction.ask *= quantityBuf;
            essenceOutputValuationPerAction.bid *= quantityBuf;
            essenceOutputValuationPerAction.dropItems.forEach(item => item.count *= quantityBuf);
            outputItems.push(...essenceOutputValuationPerAction.dropItems);
          }
    
          // 稀有掉落
          const rareOutputValuationPerAction = Array.isArray(action?.rareDropTable) ? getDropTableInfomation(action.rareDropTable, marketJson) : {
            ask: 0,
            bid: 0
          };
          if (rareOutputValuationPerAction.dropItems) {
            const quantityBuf = (100 + houseBuff.rare_find + equipmentBuff.rare_find + achievementBuff.rare_find + personalBuff.rare_find) / 100;
            rareOutputValuationPerAction.ask *= quantityBuf;
            rareOutputValuationPerAction.bid *= quantityBuf;
            rareOutputValuationPerAction.dropItems.forEach(item => item.count *= quantityBuf);
            outputItems.push(...rareOutputValuationPerAction.dropItems);
          }
    
          // 每小时产出
          const ask = basicOutputValuationPerAction.ask + essenceOutputValuationPerAction.ask + rareOutputValuationPerAction.ask;
          const bid = basicOutputValuationPerAction.bid + essenceOutputValuationPerAction.bid + rareOutputValuationPerAction.bid;
          const outputPerHour = {
            ask: ask * actionPerHour * 0.98,
            bid: bid * actionPerHour * 0.98
          };
          inputItems.forEach(item => item.countPerHour = item.count * actionPerHour);
          drinkItems.forEach(item => item.count = item.countPerHour / actionPerHour);
          inputItems.push(...drinkItems);
          outputItems.forEach(item => item.countPerHour = item.count * actionPerHour);
    
          // 每小时利润
          const profitPerHour = outputPerHour[sellMode] - expendPerHour;
          const profitPerDay = profitPerHour * 24;
          return {
            actionNames: getActionName(action.hrid),
            actionHrid,
            skillHrid: action.levelRequirement.skillHrid,
            inputItems,
            outputItems,
            actionPerHour,
            expendPerHour,
            outputPerHour,
            profitPerHour,
            baseTimePerActionSec,
            levelEffBuff,
            teaBuffs,
            communityBuff,
            houseBuff,
            equipmentBuff,
            achievementBuff,
            personalBuff,
            mooPassBuff,
            expPerAction,
            expPerHour,
            profitPerDay,
            ProfitMargin: 100 * profitPerHour / expendPerHour
          };
        }
    
        function GenerateDom(marketJson) {
          if (!marketJson?.market) throw new Error("Market data unavailable");
          const actionTypes = globals.profitSettings.actionCategories;
          const actionTypesHtml = [];
          for (const actionType of actionTypes) {
            const actions = [];
            Object.keys(globals.initClientData_actionDetailMap).filter(key => key.indexOf(`/actions/${actionType}/`) !== -1).forEach(key => actions.push(globals.initClientData_actionDetailMap[key]));
            const actionsHtmlResult = [];
            for (const action of actions) {
              if (processingCategory[action.type]) {
                const categorys = processingCategory[action.type];
                if (action?.category && categorys.indexOf(action.category) === -1) continue;
              }
              const levelEngouth = globals.initCharacterData_characterSkills.some(skill => skill.skillHrid === action.levelRequirement.skillHrid && skill.level >= action.levelRequirement.level);
              const iconId = action.hrid.replace(`/actions/${actionType}/`, '');
              const result = ProfitCaculation(action, marketJson);
              const actionHtml = `
                    <div class="Item_itemContainer__x7kH1" style="position: relative;">
                        <div>
                            <div class="Item_item__2De2O Item_clickable__3viV6 Profit-pannel" style="${levelEngouth ? "" : "background-color: var(--color-midnight-800);"}" data-tooltip="${JSON.stringify(result).replace(/"/g, '&quot;')}">
                                <div class="Item_iconContainer__5z7j4"><svg role="img" aria-label="${action.name}"
                                        class="Icon_icon__2LtL_" width="100%" height="100%">
                                        <use href="/static/media/${getSvg(iconId)}"></use>
                                    </svg></div>
                                
                                <div id="script_stack_price" style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left;">${formatNumber(result.profitPerDay)}</div>
                                <div class="Item_count__1HVvv">${result.ProfitMargin.toFixed(0)}%</div>
                            </div>
                        </div>
                    </div>
                `;
              actionsHtmlResult.push({
                profitPerHour: result.profitPerHour,
                actionHtml
              });
            }
            const actionHtml = [];
            actionsHtmlResult.sort((l, r) => r.profitPerHour - l.profitPerHour).forEach(v => actionHtml.push(v.actionHtml));
            const actionTypeHtml = `
                <div>
                    <div class="Inventory_itemGrid__20YAH">
                        <div class="Inventory_label__XEOAx" >
                            <span class="Inventory_categoryButton__35s1x">${getActionTypeName(actionType)}</span>
                        </div>
                        ${actionHtml.join('\n')}
                    </div>
                </div>
            `;
            actionTypesHtml.push(actionTypeHtml);
          }
          const innerHtml = actionTypesHtml.join('\n');
          return innerHtml;
        }
    
        function createTooltip() {
          const tooltip = document.createElement('div');
          tooltip.id = 'profit-tooltip';
          tooltip.setAttribute('role', 'tooltip');
          tooltip.className = 'MuiPopper-root MuiTooltip-popper css-55b9xc';
          tooltip.style.position = 'absolute';
          tooltip.style.zIndex = '9999';
          tooltip.style.display = 'none';
          tooltip.style.pointerEvents = 'none';
          tooltip.style.margin = '0px';
          tooltip.style.inset = "0px auto auto 0px";
          const tooltipInner = document.createElement('div');
          tooltipInner.className = 'MuiTooltip-tooltip MuiTooltip-tooltipPlacementTop css-1spb1s5';
          tooltipInner.style.minWidth = "340px";
          const tooltipContent = document.createElement('div');
          tooltipContent.className = 'ItemTooltipText_itemTooltipText__zFq3A';
          tooltipInner.appendChild(tooltipContent);
          tooltip.appendChild(tooltipInner);
          document.body.appendChild(tooltip);
          setupTooltipEvents(tooltip, tooltipContent);
          return {
            container: tooltip,
            content: tooltipContent
          };
        }
        function generateDiffInfo(item, type) {
          const medianType = type == "ask" ? "medianAsk" : "medianBid";
          if (!item[type] || !item[medianType]) {
            console.log(item);
            return "";
          }
          const diff = item[type] - item[medianType];
          if (diff == 0) return "(-)";
          const sign = diff > 0 ? "↑" : "↓";
          const num = formatNumber(Math.abs(diff));
          return ` (${sign}${num})`;
        }
        function setupTooltipEvents(tooltip, tooltipContent) {
          let tooltipTimer = null;
          document.addEventListener('mouseover', e => {
            const itemContainer = e.target.closest('.Item_item__2De2O.Profit-pannel');
            if (!itemContainer) {
              tooltip.style.display = 'none';
              return;
            }
            const tooltipData = itemContainer.dataset.tooltip;
            if (!tooltipData) return;
            try {
              const data = JSON.parse(tooltipData);
              tooltipContent.innerHTML = formatTooltipContent(data);
              tooltip.style.display = 'block';
    
              // 计算并设置位置
              const rect = itemContainer.getBoundingClientRect();
              const xPos = Math.max(0, rect.left - tooltip.offsetWidth);
              const yPos = Math.max(0, rect.bottom - tooltip.offsetHeight);
              tooltip.style.transform = `translate(${xPos}px, ${yPos}px)`;
              tooltip.setAttribute('data-popper-placement', 'left');
              if (tooltipTimer) clearTimeout(tooltipTimer);
            } catch (e) {
              console.error('Failed to parse tooltip data:', e);
            }
          });
          document.addEventListener('mouseout', e => {
            if (!e.relatedTarget || !e.relatedTarget.closest('.Item_item__2De2O.Profit-pannel')) {
              tooltipTimer = setTimeout(() => {
                tooltip.style.display = 'none';
              }, 0);
            }
          });
        }
        function formatPercent(percent) {
          const result = percent ? `+${formatNumber(percent)}%` : "-";
          return result;
        }
    
        // 获取经验表
        function getExpTable() {
          const initCD = localStorage.getItem("initClientData");
          if (!initCD) return null;
          try {
            const decomCD = JSON.parse(LZString.decompressFromUTF16(initCD));
            return decomCD.levelExperienceTable;
          } catch (e) {
            return null;
          }
        }
    
        /**
         * 计算到目标等级需要的时间和动作数
         * @param {Object} data - 包含 expPerHour, expPerAction
         * @param {number} targetLvl - 目标等级
         * @param {Object} expTable - 经验表
         * @param {Object} currentSkill - 当前技能数据
         * @returns {Object|null} - { numOfActions, timeSec } 或 null
         */
        function calculateNeedToLevel(data, targetLvl, expTable, currentSkill) {
          if (!expTable || !currentSkill || !data.expPerHour || data.expPerHour <= 0) {
            return null;
          }
          const currentExp = currentSkill.experience;
          const currentLevel = currentSkill.level;
          if (targetLvl <= currentLevel) {
            return null;
          }
          const targetTotalExp = expTable[targetLvl];
          if (!targetTotalExp || targetTotalExp <= currentExp) {
            return null;
          }
          const remainingExpTotal = targetTotalExp - currentExp;
          const totalTimeSec = remainingExpTotal / data.expPerHour * 3600;
          const totalActions = Math.ceil(remainingExpTotal / data.expPerAction);
          return {
            numOfActions: totalActions,
            timeSec: totalTimeSec
          };
        }
        function formatTooltipContent(data) {
          let totalInputAsk = 0,
            totalInputBid = 0;
          let totalInputMedianAsk = 0,
            totalInputMedianBid = 0;
          const inputTableHtmls = [];
          for (const input of data.inputItems) {
            totalInputAsk += input.ask * input.count;
            totalInputBid += input.bid * input.count;
            totalInputMedianAsk += (input.medianAsk ?? 0) * input.count;
            totalInputMedianBid += (input.medianBid ?? 0) * input.count;
            const tableHtml = `
                        <tr>
                            <td style="text-align: left;">${input.name}</td>
                            <td style="text-align: right;">${formatNumber(input.count)}</td>
                            <td style="text-align: right;">${formatNumber(input.ask)}</td>
                            <td style="text-align: left;">${generateDiffInfo(input, "ask")}</td>
                            <td style="text-align: right;">${formatNumber(input.bid)}</td>
                            <td style="text-align: left;">${generateDiffInfo(input, "bid")}</td>
                            <td style="text-align: right;">${formatNumber(input.countPerHour)}</td>
                        </tr>
                    `;
            inputTableHtmls.push(tableHtml);
          }
          let totalOuputAsk = 0,
            totalOuputBid = 0;
          let totalOutputMedianAsk = 0,
            totalOutputMedianBid = 0;
          const onputTableHtmls = [];
          for (const output of data.outputItems) {
            totalOuputAsk += output.ask * output.count;
            totalOuputBid += output.bid * output.count;
            totalOutputMedianAsk += (output.medianAsk ?? 0) * output.count;
            totalOutputMedianBid += (output.medianBid ?? 0) * output.count;
            const tableHtml = `
                        <tr>
                            <td style="text-align: left;">${output.name}</td>
                            <td style="text-align: right;">${formatNumber(output.count)}</td>
                            <td style="text-align: right;">${formatNumber(output.ask)}</td>
                            <td style="text-align: left;">${generateDiffInfo(output, "ask")}</td>
                            <td style="text-align: right;">${formatNumber(output.bid)}</td>
                            <td style="text-align: left;">${generateDiffInfo(output, "bid")}</td>
                            <td style="text-align: right;">${formatNumber(output.countPerHour)}</td>
                        </tr>
                    `;
            onputTableHtmls.push(tableHtml);
          }
    
          // 格式化tooltip内容
          const content = `
            <div class="ItemTooltipText_name__2JAHA"><span>${data.actionNames}</span></div>
    
                <div style="color: #804600; font-size: 10px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <tbody>
                            <tr style="border-bottom: 1px solid #804600;">
                                <th style="text-align: left;">${t('原料', 'Material')}</th>
                                <th style="text-align: center;">${t('数量', 'Qty')}</th>
                                <th style="text-align: right;">${t('出售价', 'Ask')}</th>
                                <th style="text-align: left;"></th>
                                <th style="text-align: right;">${t('收购价', 'Bid')}</th>
                                <th style="text-align: left;"></th>
                                <th style="text-align: right;">${t('数量/小时', 'Qty/h')}</th>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: left;"><b>${t('合计', 'Total')}</b></td>
                                <td style="text-align: right;"><b>/</b></td>
                                <td style="text-align: right;"><b>${formatNumber(totalInputAsk)}</b></td>
                                <th style="text-align: left;">${generateDiffInfo({
        ask: totalInputAsk,
        medianAsk: totalInputMedianAsk
      }, "ask")}</th>
                                <td style="text-align: right;"><b>${formatNumber(totalInputBid)}</b></td>
                                <th style="text-align: left;">${generateDiffInfo({
        bid: totalInputBid,
        medianBid: totalInputMedianBid
      }, "bid")}</th>
                                <td style="text-align: right;"><b>/</b></td>
                            </tr>
                            ${inputTableHtmls.join('\n')}
                        </tbody>
                    </table>
                </div>
                <div><strong>${t('每小时支出', 'Hourly Expenditure')}:</strong> ${formatNumber(data.expendPerHour)}</div>
                <div style="color: #804600; font-size: 10px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <tbody>
                            <tr style="border-bottom: 1px solid #804600;">
                                <th style="text-align: left;">${t('产出', 'Output')}</th>
                                <th style="text-align: center;">${t('数量', 'Qty')}</th>
                                <th style="text-align: right;">${t('出售价', 'Ask')}</th>
                                <th style="text-align: left;"></th>
                                <th style="text-align: right;">${t('收购价', 'Bid')}</th>
                                <th style="text-align: left;"></th>
                                <th style="text-align: right;">${t('数量/小时', 'Qty/h')}</th>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: left;"><b>${t('合计', 'Total')}</b></td>
                                <td style="text-align: right;"><b>/</b></td>
                                <td style="text-align: right;"><b>${formatNumber(totalOuputAsk)}</b></td>
                                <th style="text-align: left;">${generateDiffInfo({
        ask: totalOuputAsk,
        medianAsk: totalOutputMedianAsk
      }, "ask")}</th>
                                <td style="text-align: right;"><b>${formatNumber(totalOuputBid)}</b></td>
                                <th style="text-align: left;">${generateDiffInfo({
        bid: totalOuputBid,
        medianBid: totalOutputMedianBid
      }, "bid")}</th>
                                <td style="text-align: right;"><b>/</b></td>
                            </tr>
                            ${onputTableHtmls.join('\n')}
                        </tbody>
                    </table>
                </div>
                <div><strong>${t('每小时收入', 'Hourly Income')}(${t('税后', 'after tax')}):</strong> ${formatNumber(data.outputPerHour.bid)}</div>
                <div style="color: #804600; font-size: 10px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <tbody>
                            <tr style="border-bottom: 1px solid #804600;">
                                <th style="text-align: right;">${t('类型', 'Type')}</th>
                                <th style="text-align: right;">${t('速度', 'Speed')}</th>
                                <th style="text-align: right;">${t('效率', 'Eff.')}</th>
                                <th style="text-align: right;">${t('数量', 'Qty')}</th>
                                <th style="text-align: right;">${t('精华', 'Ess.')}</th>
                                <th style="text-align: right;">${t('稀有', 'Rare')}</th>
                                <th style="text-align: right;">${t('经验', 'Exp')}</th>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('社区', 'Community')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.communityBuff.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.communityBuff.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.communityBuff.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.communityBuff.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.communityBuff.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.communityBuff.wisdom)} </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('茶', 'Tea')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.teaBuffs.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.teaBuffs.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.teaBuffs.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.teaBuffs.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.teaBuffs.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.teaBuffs.wisdom)} </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('装备', 'Equipment')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.equipmentBuff.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.equipmentBuff.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.equipmentBuff.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.equipmentBuff.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.equipmentBuff.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.equipmentBuff.wisdom)} </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('等级', 'Level')}</b></td>
                                <td style="text-align: right;"><b> - </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.levelEffBuff)} </b></td>
                                <td style="text-align: right;"><b> - </b></td>
                                <td style="text-align: right;"><b> - </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('房子', 'House')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.houseBuff.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.houseBuff.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.houseBuff.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.houseBuff.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.houseBuff.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.houseBuff.wisdom)} </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('成就', 'Achievement')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.achievementBuff.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.achievementBuff.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.achievementBuff.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.achievementBuff.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.achievementBuff.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.achievementBuff.wisdom)} </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('卷轴', 'Scroll')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.personalBuff.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.personalBuff.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.personalBuff.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.personalBuff.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.personalBuff.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.personalBuff.wisdom)} </b></td>
                            </tr>
                            <tr style="border-bottom: 1px solid #804600;">
                                <td style="text-align: right;"><b>${t('MooPass', 'MooPass')}</b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.mooPassBuff.action_speed)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.mooPassBuff.efficiency)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.mooPassBuff.gathering)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.mooPassBuff.essence_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.mooPassBuff.rare_find)} </b></td>
                                <td style="text-align: right;"><b> ${formatPercent(data.mooPassBuff.wisdom)} </b></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div>${t('每小时动作', 'Actions/h')}: ${data.actionPerHour.toFixed(2)}${t('次', '')}</div>
                <div>${t('茶减少消耗', 'Tea Reduction')}: ${data.teaBuffs.artisan.toFixed(2)}%</div>
                <div><strong>${t('单次经验值', 'Exp/Action')}:</strong> ${formatNumber(data.expPerAction)}</div>
                <div><strong>${t('每小时经验值', 'Exp/h')}:</strong> ${formatNumber(data.expPerHour)}</div>
                <div><strong>${t('每小时利润', 'Hourly Profit')}(${t('税后', 'after tax')}):</strong> ${formatNumber(data.profitPerHour)}</div>
                ${(() => {
        const displayCount = globals.profitSettings?.levelUpDisplayCount || 3;
        const currentSkill = getCurrentSkill(data.skillHrid);
        const currentLevel = currentSkill?.level || 0;
        const expTable = getExpTable();
        if (currentLevel <= 0 || displayCount <= 0) {
          return '';
        }
        let levelUpHtml = `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #804600;">
                        <div style="font-weight: bold; margin-bottom: 4px;">${t('升级预估', 'Level Up Est.')} (${currentLevel}${t('级', 'lv')} → ${currentLevel + displayCount}${t('级', 'lv')}):</div>
                        <div style="color: #666;">`;
        for (let i = 1; i <= displayCount; i++) {
          const targetLevel = currentLevel + i;
          const result = calculateNeedToLevel(data, targetLevel, expTable, currentSkill);
          if (result) {
            levelUpHtml += `<div>${t('到', 'to')}${targetLevel}${t('级', 'lv')}: ${timeReadable(result.timeSec)} (${formatNumber(result.numOfActions)}${t('次', '次')})</div>`;
          } else {
            levelUpHtml += `<div>${t('到', 'to')}${targetLevel}${t('级', 'lv')}: -</div>`;
          }
        }
        levelUpHtml += `</div></div>`;
        return levelUpHtml;
      })()}
            `;
          return content;
        }
    
        let initialized = false;
    
        // 获取当前交易模式的标识
        function getCurrentTradingMode() {
          const settings = globals.profitSettings;
          return `${settings.materialPriceMode}-${settings.productPriceMode}`;
        }
    
        // 设置交易模式
        function setTradingMode(materialMode, productMode) {
          const settings = globals.profitSettings;
          globals.profitSettings = {
            ...settings,
            materialPriceMode: materialMode,
            productPriceMode: productMode
          };
        }
    
        // 生成交易模式按钮组HTML
        function generateTradingModeButtons() {
          const currentMode = getCurrentTradingMode();
          const modes = [{
            key: 'ask-bid',
            label: t('高买低卖', 'High Buy/Low Sell'),
            material: 'ask',
            product: 'bid'
          }, {
            key: 'ask-ask',
            label: t('高买高卖', 'High Buy/High Sell'),
            material: 'ask',
            product: 'ask'
          }, {
            key: 'bid-ask',
            label: t('低买高卖', 'Low Buy/High Sell'),
            material: 'bid',
            product: 'ask'
          }, {
            key: 'bid-bid',
            label: t('低买低卖', 'Low Buy/Low Sell'),
            material: 'bid',
            product: 'bid'
          }];
          return modes.map(mode => `
            <label class="trading-mode-option" style="
                display: flex; 
                align-items: center; 
                margin-right: 6px; 
                padding: 3px 6px; 
                cursor: pointer; 
                font-size: 0.72em;
                border-radius: 3px;
                background: ${currentMode === mode.key ? '#007bff' : '#f8f9fa'};
                color: ${currentMode === mode.key ? 'white' : '#333'};
                border: 1px solid ${currentMode === mode.key ? '#007bff' : '#dee2e6'};
                transition: all 0.2s ease;
            ">
                <input type="radio" name="tradingMode" value="${mode.key}" ${currentMode === mode.key ? 'checked' : ''} 
                       style="display: none;" data-material="${mode.material}" data-product="${mode.product}">
                <span style="white-space: nowrap;">${mode.label}</span>
            </label>
        `).join('');
        }
        async function waitForPannels() {
          if (!globals.freshnessMarketJson?.market) {
            setTimeout(waitForPannels, 1000);
            return;
          }
          const rightPanelContainers = document.querySelectorAll("div.CharacterManagement_tabsComponentContainer__3oI5G");
          const leftPanelContainers = document.querySelectorAll("div.GamePage_middlePanel__ubts7 .MuiTabs-root");
          const targetNodes = [...rightPanelContainers, ...leftPanelContainers];
          targetNodes.forEach(container => {
            if (container.querySelector('.MuiButtonBase-root.MuiTab-root.MuiTab-textColorPrimary.css-1q2h7u5.income-tab')) return;
    
            // 添加标签按钮和面板容器
            const tabsContainer = container.querySelector('div.MuiTabs-flexContainer');
            const tabPanelsContainer = container.querySelector('div.TabsComponent_tabPanelsContainer__26mzo') || container.querySelector('div.MuiTabPanel-root');
            if (!tabsContainer || !tabPanelsContainer) return;
            const newTabButton = document.createElement('button');
            newTabButton.className = 'MuiButtonBase-root MuiTab-root MuiTab-textColorPrimary css-1q2h7u5 income-tab';
            newTabButton.innerHTML = `<span class="MuiBadge-root TabsComponent_badge__1Du26 css-1rzb3uu">${t('收益', 'Profit')}<span class="MuiBadge-badge MuiBadge-standard MuiBadge-invisible MuiBadge-anchorOriginTopRight MuiBadge-anchorOriginTopRightRectangular MuiBadge-overlapRectangular MuiBadge-colorWarning css-dpce5z"></span></span><span class="MuiTouchRipple-root css-w0pj6f"></span>`;
            newTabButton.classList.add('income-tab');
            tabsContainer.appendChild(newTabButton);
    
            // 创建收益面板
            const newPanel = document.createElement('div');
            newPanel.className = 'TabPanel_tabPanel__tXMJF TabPanel_hidden__26UM3 income-panel';
            newPanel.innerHTML = `
                <div class="Inventory_inventory__17CH2 profit-pannel">
                <h1 class="HousePanel_title__2fQ1U" style="position: relative; width: fit-content; margin: 4px auto 8px; font-size: 18px; font-weight: 600;">
                    <div>${t('生产收益详情', 'Production Profit Details')}</div>
                    <div class="HousePanel_guideTooltipContainer__1lAt1 profit-settings-btn" style="position: absolute; left: 100%; top: 0; margin-top: 1px; margin-left: 12px; cursor: pointer;">
                        <div class="GuideTooltip_guideTooltip__1tVq-" style="cursor: pointer">
                            <svg role="img" aria-label="Guide" class="Icon_icon__2LtL_" width="100%" height="100%">
                                <use href="/static/media/misc_sprite.118a8ff2.svg#settings"></use>
                            </svg>
                        </div>
                    </div>
                </h1>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 10px 8px; flex-wrap: wrap;">
                        <span style="color: green; font-size: 0.8em; margin-bottom: 4px;">${t('数据更新于', 'Data updated')}: ${formatDuration(Date.now() - globals.freshnessMarketJson.time * 1000)}</span>
                        <div id="tradingModeContainer" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                            ${generateTradingModeButtons()}
                        </div>
                    </div>
                    <div class="Inventory_items__6SXv0 script_buildScore_added script_invSort_added">
                    ${GenerateDom(globals.freshnessMarketJson)}
                    </div>
                </div>
            `;
            tabPanelsContainer.appendChild(newPanel);
            container.dataset.processed = "true";
            setupTabSwitching(newTabButton, newPanel, tabPanelsContainer, container);
            if (!initialized) {
              createTooltip();
              setupClickActions();
              setInterval(() => refreshProfitPanel(), 1000);
              initialized = true;
            }
          });
          setTimeout(waitForPannels, 1000);
        }
        function setupTabSwitching(newTabButton, newPanel, tabPanelsContainer, container) {
          newTabButton.addEventListener('click', () => {
            container.querySelectorAll('.MuiTab-root').forEach(btn => btn.classList.remove('Mui-selected'));
            newTabButton.classList.add('Mui-selected');
            tabPanelsContainer.querySelectorAll('.TabPanel_tabPanel__tXMJF').forEach(panel => {
              panel.classList.add('TabPanel_hidden__26UM3');
            });
            newPanel.classList.remove('TabPanel_hidden__26UM3');
          });
          container.querySelectorAll('.MuiTab-root:not(.income-tab)').forEach(btn => {
            btn.addEventListener('click', () => {
              newPanel.classList.add('TabPanel_hidden__26UM3');
              newTabButton.classList.remove('Mui-selected');
    
              // 添加选中状态并显示原标签面板
              btn.classList.add('Mui-selected');
              const tabIndex = Array.from(btn.parentNode.children).filter(el => !el.classList.contains('income-tab')).indexOf(btn);
              tabPanelsContainer.querySelectorAll('.TabPanel_tabPanel__tXMJF:not(.income-panel)').forEach((panel, index) => {
                panel.classList.toggle('TabPanel_hidden__26UM3', index !== tabIndex);
              });
            });
          });
        }
        function setupClickActions() {
          document.addEventListener('click', e => {
            // 处理交易模式按钮点击 (包括label和radio)
            const tradingModeLabel = e.target.closest('.trading-mode-option');
            if (tradingModeLabel) {
              const radio = tradingModeLabel.querySelector('input[type="radio"]');
              if (radio) {
                const materialMode = radio.dataset.material;
                const productMode = radio.dataset.product;
                setTradingMode(materialMode, productMode);
                refreshProfitPanel(true);
    
                // 更新所有按钮的样式
                document.querySelectorAll('.trading-mode-option').forEach(label => {
                  const labelRadio = label.querySelector('input[type="radio"]');
                  const isSelected = labelRadio === radio;
                  label.style.background = isSelected ? '#007bff' : '#f8f9fa';
                  label.style.color = isSelected ? 'white' : '#333';
                  label.style.borderColor = isSelected ? '#007bff' : '#dee2e6';
                  labelRadio.checked = isSelected;
                });
              }
              return;
            }
            const settingsBtn = e.target.closest('.profit-settings-btn');
            if (settingsBtn) {
              unsafeWindow["MWIProfitPanel_showSettingsModal"]?.();
              return;
            }
            const itemContainer = e.target.closest('.Item_item__2De2O.Profit-pannel');
            if (!itemContainer) return;
            const tooltipData = itemContainer.dataset.tooltip;
            if (!tooltipData) return;
            try {
              const data = JSON.parse(tooltipData);
              if (data?.actionHrid && getMwiObj$1()?.game?.handleGoToAction) {
                getMwiObj$1().game.handleGoToAction(data.actionHrid);
              }
            } catch (e) {
              console.error('Click action error:', e);
            }
          });
        }
        function refreshProfitPanel(force = false) {
          if (!globals.freshnessMarketJson?.market) return;
          const inventoryPanels = document.querySelectorAll('.Inventory_inventory__17CH2.profit-pannel');
          inventoryPanels.forEach(panel => {
            const timeSpan = panel.querySelector('span');
            if (timeSpan) {
              timeSpan.textContent = globals.freshnessMarketJson.stat();
              // timeSpan.textContent = `数据更新于：${getDuration(new Date(globals.freshnessMarketJson.time * 1000))}，收益刷新于：${getDuration(profitRefreshTime)}，mooket${mooketStatus()}，${getMwiObj()?.coreMarket ? "支持" : "不支持"}实时价格`;
            }
    
            // 更新交易模式按钮状态
            const tradingModeContainer = panel.querySelector('#tradingModeContainer');
            if (tradingModeContainer) {
              const currentMode = getCurrentTradingMode();
              const labels = tradingModeContainer.querySelectorAll('.trading-mode-option');
              labels.forEach(label => {
                const radio = label.querySelector('input[type="radio"]');
                const isSelected = radio.value === currentMode;
                label.style.background = isSelected ? '#007bff' : '#f8f9fa';
                label.style.color = isSelected ? 'white' : '#333';
                label.style.borderColor = isSelected ? '#007bff' : '#dee2e6';
                radio.checked = isSelected;
              });
            }
            if (force || globals.hasMarketItemUpdate) {
              const itemsContainer = panel.querySelector('.Inventory_items__6SXv0');
              if (itemsContainer) {
                itemsContainer.innerHTML = GenerateDom(globals.freshnessMarketJson);
                globals.hasMarketItemUpdate = false;
              }
            }
          });
        }
    
        const supportActionType = ["/action_types/milking", "/action_types/foraging", "/action_types/woodcutting", "/action_types/cheesesmithing", "/action_types/crafting", "/action_types/tailoring", "/action_types/cooking", "/action_types/brewing"
        // "/action_types/alchemy",
        // "/action_types/enhancing",
        // "/action_types/combat",
        ];
        function LostTrackerExpectEstimate() {
          setTimeout(() => {
            const lootLogList = document.querySelectorAll('.LootLogPanel_actionLoots__3oTid .LootLogPanel_actionLoot__32gl_');
            if (!lootLogList.length || !Array.isArray(globals.lootLog)) return;
            let totalDuration = 0,
              totalProfit = 0,
              totalExcessProfit = 0,
              totalExpectedProfit = 0;
            const lootLogData = [...globals.lootLog].reverse();
            lootLogList.forEach((lootElem, idx) => {
              const logData = lootLogData[idx];
              if (!logData) return;
    
              // 获取action数据
              const action = globals.initClientData_actionDetailMap[logData.actionHrid];
              if (!action) return;
              if (supportActionType.indexOf(action.type) === -1) return;
    
              // 计算预期收益
              const expected = ProfitCaculation(action, globals.medianMarketJson);
    
              // 计算实际收益
              let actualIncome = 0;
              Object.entries(logData.drops).forEach(([itemHash, count]) => {
                const itemHrid = itemHash.split("::")[0];
                const valuation = getItemValuation(itemHrid, globals.medianMarketJson);
                actualIncome += (valuation?.bid || 0) * count;
              });
              actualIncome *= 0.98;
    
              // 计算持续时间（小时）
              const startTime = new Date(logData.startTime);
              const endTime = new Date(logData.endTime);
              const durationHours = (endTime - startTime) / (1000 * 60 * 60);
              const durationDays = durationHours / 24;
    
              // 计算预期收益
              const expectedIncome = expected.outputPerHour.bid * durationHours;
              const outcome = expected.expendPerHour * durationHours;
              const profit = actualIncome - outcome;
              const expectedProfit = expectedIncome - outcome;
              const excessProfit = actualIncome - expectedIncome;
              const excessPercent = (excessProfit / expectedProfit * 100).toFixed(2);
              totalDuration += endTime - startTime;
              totalProfit += profit;
              totalExcessProfit += excessProfit;
              totalExpectedProfit += expectedProfit;
    
              // 生成显示元素
    
              const sign = getSign(excessProfit);
              const content = `${t('支出', 'Expense')}: ${formatNumber(outcome)} ${t('收入', 'Revenue')}: ${formatNumber(actualIncome)} ${t('预期盈利', 'Expected Profit')}: ${formatNumber(expectedProfit)} (${formatNumber(expectedProfit / durationDays)}/${t('天', 'd')}) ${t('实现盈利', 'Actual Profit')}: ${formatNumber(profit)} (${formatNumber(profit / durationDays)}/${t('天', 'd')}, ${sign}${Math.abs(excessPercent)}%)`;
              const colorIntensity = Math.min(Math.abs(excessPercent) / 20, 1) * 0.3 + 0.7;
              const color = excessProfit >= 0 ? `rgb(${Math.floor(255 * colorIntensity)}, 0, 0)` // 红色表示高于预期
              : `rgb(0, ${Math.floor(255 * colorIntensity)}, 0)`; // 绿色表示低于预期
              const span = document.createElement('span');
              span.className = 'mwi-profit-stats';
              span.style.marginLeft = '8px';
              span.style.color = color;
              span.textContent = content;
    
              // 添加到动作名称后面
              const actionNameSpan = lootElem.querySelector('span:not(.loot-log-index)');
              if (actionNameSpan) {
                const targetSpans = lootElem.querySelectorAll('span.mwi-profit-stats');
                Array.from(targetSpans).forEach(span => {
                  span.parentNode.removeChild(span);
                });
                actionNameSpan.appendChild(span);
              }
            });
            totalDuration /= 24 * 60 * 60 * 1000;
            const excessPercent = (totalExcessProfit / totalExpectedProfit * 100).toFixed(2);
            const content = `${t('统计时长', 'Duration')}: ${totalDuration.toFixed(2)}${t('天', 'd')} ${t('净利润', 'Net Profit')}: ${formatNumber(totalProfit)} (${formatNumber(totalProfit / totalDuration)}/${t('天', 'd')}) ${t('较预期', 'vs Expected')}: ${formatNumber(totalExcessProfit / totalDuration)}/${t('天', 'd')} (${excessPercent}%)`;
            const colorIntensity = Math.min(Math.abs(excessPercent) / 20, 1) * 0.2 + 0.8;
            const color = excessPercent >= 0 ? `rgb(${Math.floor(255 * colorIntensity)}, 0, 0)` // 红色表示高于预期
            : `rgb(0, ${Math.floor(255 * colorIntensity)}, 0)`; // 绿色表示低于预期
            const summarySpan = document.createElement('span');
            summarySpan.className = 'mwi-profit-stats';
            summarySpan.style.marginLeft = '8px';
            summarySpan.style.color = color;
            summarySpan.textContent = content;
    
            // 添加到顶部按钮行
            const buttonContainer = document.querySelector('.LootLogPanel_lootLogPanel__2013X div');
            if (buttonContainer) {
              const targetSpans = buttonContainer.querySelectorAll('span.mwi-profit-stats');
              Array.from(targetSpans).forEach(span => {
                span.parentNode.removeChild(span);
              });
              buttonContainer.appendChild(summarySpan);
            }
          }, 200);
        }
    
        // 验证设置（从原 settingsPanel.js 保留）
        function validateProfitSettings(settings) {
          const validCategories = ['milking', 'foraging', 'woodcutting', 'cheesesmithing', 'crafting', 'tailoring', 'cooking', 'brewing'];
          const validDataSources = ['Official', 'MooketApi', 'Mooket'];
    
          // 验证 price modes
          if (!['ask', 'bid'].includes(settings.materialPriceMode)) {
            settings.materialPriceMode = 'ask';
          }
          if (!['ask', 'bid'].includes(settings.productPriceMode)) {
            settings.productPriceMode = 'bid';
          }
    
          // 验证 dataSourceKeys
          if (!Array.isArray(settings.dataSourceKeys)) {
            settings.dataSourceKeys = validDataSources;
          } else {
            settings.dataSourceKeys = settings.dataSourceKeys.filter(src => validDataSources.includes(src));
            if (settings.dataSourceKeys.length === 0) {
              settings.dataSourceKeys = validDataSources;
            }
          }
    
          // 验证 actionCategories
          if (!Array.isArray(settings.actionCategories)) {
            settings.actionCategories = validCategories;
          } else {
            settings.actionCategories = settings.actionCategories.filter(cat => validCategories.includes(cat));
            if (settings.actionCategories.length === 0) {
              settings.actionCategories = validCategories;
            }
          }
    
          // 验证 levelUpDisplayCount (1-10)
          if (typeof settings.levelUpDisplayCount !== 'number' || settings.levelUpDisplayCount < 1 || settings.levelUpDisplayCount > 10) {
            settings.levelUpDisplayCount = 3;
          }
          return settings;
        }
    
        // 初始化油猴菜单
        function initSettingsMenu() {
          if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand("⚙️ 设置", showSettingsModal);
          }
    
          // 订阅设置变更
          globals.subscribe((key, value) => {
            if (key === "profitSettings") {
              refreshProfitPanel(true);
              GM_setValue("profitSettings", JSON.stringify(value));
            }
          });
        }
    
        // 显示设置 Modal
        function showSettingsModal() {
          if (document.getElementById('mwi-profit-settings-overlay')) {
            return;
          }
          const settings = globals.profitSettings;
    
          // 创建遮罩层
          const overlay = document.createElement('div');
          overlay.id = 'mwi-profit-settings-overlay';
          overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 100000;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
    
          // 创建对话框
          const dialog = document.createElement('div');
          dialog.id = 'mwi-profit-settings-dialog';
          dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.3);
            z-index: 100001;
            min-width: 400px;
            max-height: 80vh;
            overflow-y: auto;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
          dialog.innerHTML = `
            <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #333;">${t('收益设置', 'Profit Settings')}</h3>
    
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 14px; color: #333; font-weight: 500;">${t('原料进货方式', 'Material Price Mode')}</label>
                <select id="mwi-material-price-mode" style="
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    background: white;
                    color: #333;
                    cursor: pointer;
                ">
                    <option value="ask" ${settings.materialPriceMode === 'ask' ? 'selected' : ''}>${t('高买', 'High Ask')}</option>
                    <option value="bid" ${settings.materialPriceMode === 'bid' ? 'selected' : ''}>${t('低买', 'Low Bid')}</option>
                </select>
            </div>
    
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 14px; color: #333; font-weight: 500;">${t('产品出货方式', 'Product Price Mode')}</label>
                <select id="mwi-product-price-mode" style="
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    background: white;
                    color: #333;
                    cursor: pointer;
                ">
                    <option value="ask" ${settings.productPriceMode === 'ask' ? 'selected' : ''}>${t('高卖', 'High Ask')}</option>
                    <option value="bid" ${settings.productPriceMode === 'bid' ? 'selected' : ''}>${t('低卖', 'Low Bid')}</option>
                </select>
            </div>
    
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 10px; font-size: 14px; color: #333; font-weight: 500;">${t('显示的动作分类', 'Action Categories')}</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    ${renderCheckbox('mwi-cat-milking', 'milking', getActionTypeName('milking'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-foraging', 'foraging', getActionTypeName('foraging'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-woodcutting', 'woodcutting', getActionTypeName('woodcutting'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-cheesesmithing', 'cheesesmithing', getActionTypeName('cheesesmithing'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-crafting', 'crafting', getActionTypeName('crafting'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-tailoring', 'tailoring', getActionTypeName('tailoring'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-cooking', 'cooking', getActionTypeName('cooking'), settings.actionCategories)}
                    ${renderCheckbox('mwi-cat-brewing', 'brewing', getActionTypeName('brewing'), settings.actionCategories)}
                </div>
            </div>
    
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 10px; font-size: 14px; color: #333; font-weight: 500;">${t('数据来源', 'Data Source')} (${t('暂时不生效', 'currently inactive')})</label>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${renderCheckbox('mwi-src-official', 'Official', t('官方市场', 'Official Market'), settings.dataSourceKeys)}
                    ${renderCheckbox('mwi-src-mooketapi', 'MooketApi', t('Mooket API', 'Mooket API'), settings.dataSourceKeys)}
                    ${renderCheckbox('mwi-src-mooket', 'Mooket', t('Mooket实时', 'Mooket Realtime'), settings.dataSourceKeys)}
                </div>
            </div>
    
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 6px; font-size: 14px; color: #333; font-weight: 500;">${t('升级预估显示级数', 'Level Up Display Count')}</label>
                <select id="mwi-level-up-display-count" style="
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    background: white;
                    color: #333;
                    cursor: pointer;
                ">
                    <option value="1" ${settings.levelUpDisplayCount === 1 ? 'selected' : ''}>1${t('级', 'lv')}</option>
                    <option value="2" ${settings.levelUpDisplayCount === 2 ? 'selected' : ''}>2${t('级', 'lv')}</option>
                    <option value="3" ${settings.levelUpDisplayCount === 3 ? 'selected' : ''}>3${t('级', 'lv')}</option>
                    <option value="4" ${settings.levelUpDisplayCount === 4 ? 'selected' : ''}>4${t('级', 'lv')}</option>
                    <option value="5" ${settings.levelUpDisplayCount === 5 ? 'selected' : ''}>5${t('级', 'lv')}</option>
                    <option value="6" ${settings.levelUpDisplayCount === 6 ? 'selected' : ''}>6${t('级', 'lv')}</option>
                    <option value="7" ${settings.levelUpDisplayCount === 7 ? 'selected' : ''}>7${t('级', 'lv')}</option>
                    <option value="8" ${settings.levelUpDisplayCount === 8 ? 'selected' : ''}>8${t('级', 'lv')}</option>
                    <option value="9" ${settings.levelUpDisplayCount === 9 ? 'selected' : ''}>9${t('级', 'lv')}</option>
                    <option value="10" ${settings.levelUpDisplayCount === 10 ? 'selected' : ''}>10${t('级', 'lv')}</option>
                </select>
            </div>
    
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="mwi-settings-cancel" style="
                    padding: 8px 20px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    color: #333;
                ">${t('取消', 'Cancel')}</button>
                <button id="mwi-settings-save" style="
                    padding: 8px 20px;
                    border: none;
                    background: #007bff;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">${t('保存', 'Save')}</button>
            </div>
        `;
          document.body.appendChild(overlay);
          document.body.appendChild(dialog);
    
          // 触发动画
          requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            dialog.style.opacity = '1';
          });
    
          // 绑定事件
          setupModalEventListeners(overlay, dialog);
        }
    
        // 渲染复选框辅助函数
        function renderCheckbox(id, value, label, checkedArray) {
          const checked = checkedArray.includes(value) ? 'checked' : '';
          return `
            <label style="display: flex; align-items: center; font-size: 14px; cursor: pointer; color: #333;">
                <input type="checkbox" id="${id}" value="${value}" ${checked} style="margin-right: 8px; cursor: pointer;">
                ${label}
            </label>
        `;
        }
    
        // 设置 Modal 事件监听
        function setupModalEventListeners(overlay, dialog) {
          // 点击遮罩层关闭
          overlay.addEventListener('click', () => closeModal(overlay, dialog));
    
          // ESC 键关闭
          const escHandler = e => {
            if (e.key === 'Escape') {
              closeModal(overlay, dialog);
              document.removeEventListener('keydown', escHandler);
            }
          };
          document.addEventListener('keydown', escHandler);
    
          // 取消按钮
          document.getElementById('mwi-settings-cancel').addEventListener('click', () => {
            closeModal(overlay, dialog);
            document.removeEventListener('keydown', escHandler);
          });
    
          // 保存按钮
          document.getElementById('mwi-settings-save').addEventListener('click', () => {
            // 收集设置值
            const materialPriceMode = document.getElementById('mwi-material-price-mode').value;
            const productPriceMode = document.getElementById('mwi-product-price-mode').value;
            const actionCategories = [];
            const catCheckboxes = [{
              id: 'mwi-cat-milking',
              value: 'milking'
            }, {
              id: 'mwi-cat-foraging',
              value: 'foraging'
            }, {
              id: 'mwi-cat-woodcutting',
              value: 'woodcutting'
            }, {
              id: 'mwi-cat-cheesesmithing',
              value: 'cheesesmithing'
            }, {
              id: 'mwi-cat-crafting',
              value: 'crafting'
            }, {
              id: 'mwi-cat-tailoring',
              value: 'tailoring'
            }, {
              id: 'mwi-cat-cooking',
              value: 'cooking'
            }, {
              id: 'mwi-cat-brewing',
              value: 'brewing'
            }];
            catCheckboxes.forEach(({
              id,
              value
            }) => {
              if (document.getElementById(id).checked) {
                actionCategories.push(value);
              }
            });
            const dataSourceKeys = [];
            const srcCheckboxes = [{
              id: 'mwi-src-official',
              value: 'Official'
            }, {
              id: 'mwi-src-mooketapi',
              value: 'MooketApi'
            }, {
              id: 'mwi-src-mooket',
              value: 'Mooket'
            }];
            srcCheckboxes.forEach(({
              id,
              value
            }) => {
              if (document.getElementById(id).checked) {
                dataSourceKeys.push(value);
              }
            });
            const newSettings = {
              materialPriceMode,
              productPriceMode,
              actionCategories,
              dataSourceKeys,
              levelUpDisplayCount: parseInt(document.getElementById('mwi-level-up-display-count').value, 10)
            };
            globals.profitSettings = validateProfitSettings(newSettings);
            closeModal(overlay, dialog);
            document.removeEventListener('keydown', escHandler);
          });
        }
    
        // 关闭 Modal
        function closeModal(overlay, dialog) {
          overlay.style.opacity = '0';
          dialog.style.opacity = '0';
    
          // 动画结束后移除 DOM
          setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            if (dialog.parentNode) dialog.remove();
          }, 200);
        }
        unsafeWindow["MWIProfitPanel_showSettingsModal"] = showSettingsModal;
    
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
            if (socket.url.indexOf("api." + globals.domainname + "/ws") <= -1 && socket.url.indexOf("api-test." + globals.domainname + "/ws") <= -1) {
              return oriGet.call(this);
            }
            const message = oriGet.call(this);
            Object.defineProperty(this, "data", { value: message, configurable: true }); // Anti-loop
    
            return handleMessage(message);
          }
        }
        function handleMessage(message) {
          try {
            let obj = JSON.parse(message);
            if (obj) {
              if (obj.type === "init_character_data") {
                globals.initCharacterData_characterSkills = obj.characterSkills;
                globals.initCharacterData_actionTypeDrinkSlotsMap = obj.actionTypeDrinkSlotsMap;
                globals.initCharacterData_characterHouseRoomMap = obj.characterHouseRoomMap;
                globals.initCharacterData_characterItems = obj.characterItems;
                globals.initCharacterData_communityActionTypeBuffsMap = obj.communityActionTypeBuffsMap;
                globals.initCharacterData_consumableActionTypeBuffsMap = obj.consumableActionTypeBuffsMap;
                globals.initCharacterData_houseActionTypeBuffsMap = obj.houseActionTypeBuffsMap;
                globals.initCharacterData_equipmentActionTypeBuffsMap = obj.equipmentActionTypeBuffsMap;
                globals.initCharacterData_achievementActionTypeBuffsMap = obj.achievementActionTypeBuffsMap;
                globals.initCharacterData_personalActionTypeBuffsMap = obj.personalActionTypeBuffsMap;
                globals.initCharacterData_mooPassActionTypeBuffsMap = obj.mooPassActionTypeBuffsMap;
                globals.initCharacterData_noncombatStats = obj.noncombatStats;
                waitForPannels();
              } else if (obj.type === "init_client_data") {
                globals.initClientData_actionDetailMap = obj.actionDetailMap;
                globals.initClientData_itemDetailMap = obj.itemDetailMap;
                globals.initClientData_openableLootDropMap = obj.openableLootDropMap;
              } else if (obj.type === "market_item_order_books_updated") {
                globals.hasMarketItemUpdate = true;
                globals.freshnessMarketJson.updateDataFromMarket(obj?.marketItemOrderBooks);
                console.log({
                  hasMarketItemUpdate: globals.hasMarketItemUpdate,
                  obj
                });
              } else if (obj.type === "loot_log_updated") {
                globals.lootLog = obj.lootLog;
                LostTrackerExpectEstimate();
              } else if (obj.type === "skills_updated") {
                setTimeout(() => {
                  if (getMwiObj()?.game?.state?.characterSkillMap) {
                    globals.initCharacterData_characterSkills = [...getMwiObj()?.game?.state.characterSkillMap.values()];
                    refreshProfitPanel(true);
                  } else console.error(obj);
                }, 100);
              } else if (obj.type === "community_buffs_updated") {
                globals.initCharacterData_communityActionTypeBuffsMap = obj.communityActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "consumable_buffs_updated") {
                globals.initCharacterData_consumableActionTypeBuffsMap = obj.consumableActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "equipment_buffs_updated") {
                globals.initCharacterData_equipmentActionTypeBuffsMap = obj.equipmentActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "house_rooms_updated") {
                globals.initCharacterData_houseActionTypeBuffsMap = obj.houseActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "achievements_updated") {
                globals.initCharacterData_achievementActionTypeBuffsMap = obj.achievementActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "personal_buffs_updated") {
                globals.initCharacterData_personalActionTypeBuffsMap = obj.personalActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "moo_pass_buffs_updated") {
                globals.initCharacterData_mooPassActionTypeBuffsMap = obj.mooPassActionTypeBuffsMap;
                refreshProfitPanel(true);
              } else if (obj.type === "action_completed") {
                // 更新技能经验数据
                if (obj.endCharacterSkills) {
                  for (const updatedSkill of obj.endCharacterSkills) {
                    const index = globals.initCharacterData_characterSkills.findIndex(s => s.skillHrid === updatedSkill.skillHrid);
                    if (index !== -1) {
                      globals.initCharacterData_characterSkills[index] = updatedSkill;
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error(err);
          }
          return message;
        }
        globals.subscribe((key, value) => {
          if (key === "initClientData_actionDetailMap") {
            const processingMap = {};
            for (const [actionHrid, actionDetail] of Object.entries(value)) {
              const categorys = processingCategory[actionDetail.type];
              if (categorys && categorys.indexOf(actionDetail.category) !== -1) {
                const inputHrid = actionDetail.inputItems[0].itemHrid;
                processingMap[inputHrid] = actionDetail;
              }
            }
            globals.processingMap = processingMap;
          }
          if (key === "initClientData_itemDetailMap") {
            const en2ZhMap = {};
            for (const [hrid, item] of Object.entries(value)) {
              const en = item.name;
              const zh = ZHitemNames[hrid];
              en2ZhMap[en] = zh;
            }
            globals.en2ZhMap = en2ZhMap;
          }
        });
        const profitSettings = validateProfitSettings(JSON.parse(GM_getValue('profitSettings', JSON.stringify({
          materialPriceMode: 'ask',
          productPriceMode: 'bid',
          dataSourceKeys: ['Official', 'MooketApi', 'Mooket'],
          actionCategories: ['milking', 'foraging', 'woodcutting', 'cheesesmithing', 'crafting', 'tailoring', 'cooking', 'brewing']
        }))));
        globals.profitSettings = profitSettings;
        globals.isZHInGameSetting = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh"); // 获取游戏内设置语言
    
        const initCD = localStorage.getItem("initClientData");
        if (initCD) {
          const decomCD = LZString.decompressFromUTF16(initCD);
          const obj = JSON.parse(decomCD);
          globals.initClientData_actionDetailMap = obj.actionDetailMap;
          globals.initClientData_itemDetailMap = obj.itemDetailMap;
          globals.initClientData_openableLootDropMap = obj.openableLootDropMap;
        }
        unsafeWindow["MWIProfitPanel_Globals"] = globals;
        hookWS();
        preFetchData();
        initSettingsMenu();
        GM_addStyle(GM_getResourceText("bootstrapCSS"));
    
    })();
  });

})();
