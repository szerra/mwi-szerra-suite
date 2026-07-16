// ==UserScript==
// @name         MWI Battle HUD
// @name:zh-CN   MWI Battle HUD
// @namespace    http://tampermonkey.net/
// @version      0.3.17
// @description  A compact top-docked HUD for real-time combat information.
// @description:zh-CN 贴合页面顶部的实时战斗信息 HUD
// @author       mortymorty
// @license      MIT
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @icon         https://www.milkywayidle.com/favicon.svg
// @connect      www.milkywayidle.com
// @connect      raw.githubusercontent.com
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// @downloadURL https://update.greasyfork.org/scripts/582499/MWI%20Battle%20HUD.user.js
// @updateURL https://update.greasyfork.org/scripts/582499/MWI%20Battle%20HUD.meta.js
// ==/UserScript==

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
                Object.defineProperty(this, 'data', { value: message });
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
