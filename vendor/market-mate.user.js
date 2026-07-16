// ==UserScript==
// @name         MWI 市场伴侣
// @name:en      MWI Market Mate
// @name:zh-CN   MWI 市场伴侣
// @namespace    https://milkywayidle.com/
// @version      2.3.0
// @description  制作页/房屋材料自动计算、缺料显示、购物清单、市场高亮。WS精确库存+独立数据层。双语支持(EN/ZH)。
// @description:en  Crafting/housing material auto-calc, shortage display, shopping list, market highlight. WS inventory + data layer. Bilingual (EN/ZH).
// @description:zh-CN  制作页/房屋材料自动计算、缺料显示、购物清单、市场高亮。WS精确库存+独立数据层。双语支持(EN/ZH)。
// @author       ColaCola
// @license      MIT
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @icon         https://www.milkywayidle.com/favicon.svg
// @grant        none
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/567386/MWI%20%E5%B8%82%E5%9C%BA%E4%BC%B4%E4%BE%A3.user.js
// @updateURL https://update.greasyfork.org/scripts/567386/MWI%20%E5%B8%82%E5%9C%BA%E4%BC%B4%E4%BE%A3.meta.js
// ==/UserScript==

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
        check("防注入·斜杠右侧=总量+有损吸附(MWI_Toolkit)", () => {
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
     *  关键修复:斜杠右侧的数字一律是「总需求量」,绝不能再乘 actionCount。
     *  MWI_Toolkit 会把游戏的 inputCount 文本 "1,434 / 4" 直接改写成 "␣/ 239K␣"
     *  (左侧库存被抹掉),旧逻辑落入 parseRequiredPerAction×actionCount 分支,
     *  把总量又乘了一次次数 → 平方爆炸(截图 5.7e10 = 239K×239,432)。
     *  右侧总量为有损格式时做整数吸附重建(见 _snapLossyNeed)。 */
    function resolveNeed(inputText, actionCountValue) {
        const raw = String(inputText ?? "");
        const slashIdx = raw.search(/[\/／]/);
        const rightRaw = slashIdx >= 0 ? raw.slice(slashIdx + 1) : "";
        const pair = parseStockNeedPair(inputText);
        if (pair) {
            let totalNeeded = pair.total;
            let needPerAction = actionCountValue > 0 ? totalNeeded / actionCountValue : totalNeeded;
            const snapped = _snapLossyNeed(needPerAction, actionCountValue, rightRaw);
            if (snapped != null) { needPerAction = snapped; totalNeeded = snapped * actionCountValue; }
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
        const requirementItems = requirementsEl ? [...requirementsEl.querySelectorAll(`:scope > ${SEL.requirementItems}`)].filter(hasGameClass) : [];
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
        const requirementItems = [...requirementsEl.querySelectorAll(`:scope > ${SEL.requirementItems}`)].filter(hasGameClass);   // 防注入,见 §06 防御块
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
        const requirementItems = pick(SEL.requirementItems);
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
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (!(node instanceof Element)) continue;
                        const modal = node.matches?.(MARKET_SEL.modalContent) ? node : node.querySelector?.(MARKET_SEL.modalContent);
                        if (modal && !this._prefillDone.has(modal)) {
                            setTimeout(() => this._tryPrefill(modal), 200);
                        }
                    }
                }
            });
            this._observer.observe(document.body, { childList: true, subtree: true });
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
            if (!qtyInput) return;

            this._setReactInputValue(qtyInput, String(neededQty));
            this._prefillDone.add(modal);
            this._showPrefillHint(modal, cartRow.name || bareId, neededQty);
            console.log(`[mwi-mm] 已预填数量: ${cartRow.name} × ${neededQty}`);
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
