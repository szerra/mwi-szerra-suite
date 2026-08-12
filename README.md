# MWI Szerra 插件與獨立戰鬥外觀包

目前建議使用原作者的各個插件，讓它們各自更新；本儲存庫只繼續維護無法由原作者版本取代的戰鬥技能特效與角色圖片更換。公會管理、私人上傳設定與裝置資料完全不在此儲存庫中。

## 安裝

- [安裝戰鬥外觀與角色圖庫](https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/standalone/MWI-Szerra-Combat-Appearance.user.js)
- [安裝食用工具（隊伍順序修正版）](https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Edible-Tools-TW.user.js)
- [安裝 Profit Panel II（封包相容修正版）](https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/standalone/MWI-Profit-Panel-II-compat.user.js)

Tampermonkey 會依各檔案的 `@updateURL` 自動檢查此儲存庫的最新版。舊的三個 Szerra 整合包仍保留供已安裝者使用，但不再列為建議架構。

食用工具修正版與 Profit Panel II 相容修正版改用各自的 `WeakMap` 快取 WebSocket 訊息，不再重複定義 `MessageEvent.data`。這可避免與原作者 `MWITools` 同時啟用時出現 `Cannot redefine property: data`，讓裝備分數等需要角色初始化資料的功能正常載入。Profit Panel II 相容修正版與 Profit Panel II 原版不可同時啟用。

## 建議架構

- 啟用「MWI 戰鬥外觀與角色圖庫」：只負責技能特效與自己／隊友的角色圖片。
- 其他市場、角色資訊、戰鬥統計功能改裝原作者插件，避免每次作者更新都要重新打包整套。
- 神龕模擬器改用模擬器儲存庫提供的獨立橋接器。
- 公會資料插件保持原樣；本外觀包不會讀寫它的資料或設定。

## 戰鬥外觀包內容

- 現在使用的戰鬥技能特效，包括遊戲設定內的特效開關。
- 可保存多張圖片，分別指定自己與最多四位隊友。
- 沿用原「MWI 自訂角色圖庫」的腳本識別與 IndexedDB 圖片庫；安裝本包可保留原本的圖片資料與角色指派。
- 不包含 DPS、HPS、市場、模擬器、公會資料或任何原作者工具功能。

## 舊整合包（不再建議新裝）

### 戰鬥資訊包

- 戰鬥技能特效
- 戰鬥升級所需時間
- 戰鬥模擬即時匯入
- 掉落與運氣統計
- Battle HUD

「牛牛戰鬥Buff顯示」沒有納入，因為它與新版戰鬥技能特效的光環、狀態顯示重複。「MWI-Hit-Tracker-Canvas」也沒有納入，並維持停用。

### 市場工具包

- MWI 市場伴侶
- MWI Profit Panel

價格歷史功能繼續由獨立的 `mooket II` 提供；舊的 `MWI Price History Viewer Modified` 不納入，避免同一市場頁重複繪圖與重複請求。

### 角色資訊包

- Talent Market
- 裝備資料同步
- MWI 角色名片
- MWI QoL 技能需求

### 外觀

「娘化怪物換皮」仍維持獨立；新的戰鬥外觀包只更換玩家隊伍圖片，不會覆蓋怪物換皮。

### 食用工具獨立修正版

保留原版 `Edible Tools／[银河奶牛]食用工具` 的全部功能，只修正多人戰鬥消耗品視窗的玩家順序。安裝後請停用原版 `Edible Tools`，避免同時出現兩組按鈕。

## 改用新架構後要停用

先確認原作者插件與新的戰鬥外觀包正常，再停用：

- `MWI Szerra 戰鬥資訊包`
- `MWI Szerra 市場工具包`
- `MWI Szerra 角色資訊包`
- 舊的獨立 `MWI 戰鬥技能特效`（功能已在外觀包內）
- 舊的獨立 `MWI 自訂角色圖庫`（安裝外觀包時應由同識別腳本接續更新）

以下原作者腳本不再由新外觀包取代，是否啟用請依需求決定：

- `[银河奶牛]显示战斗升级所需时间`
- `[MWI] Realtime Import Of Battle Simulation`
- `[银河奶牛]康康运气_修复`
- `MWI Battle HUD`
- `牛牛战斗Buff显示`
- `MWI 市场伴侣`
- `MWI Profit Panel`
- `MWI Price History Viewer Modified - 银河牛牛商城中物品价格走势小助手`
- `[MWI]Talent Market`
- `[银河奶牛]装备数据同步`
- `MWI角色名片插件`
- `MWI QoL 技能需求`
- `MWI-Hit-Tracker-Canvas`（原本已停用，繼續停用）

## 繼續保持獨立並啟用

- 所有公會管理、公會上傳與公會明細插件
- `mooket II`
- 原作者的 `MWITools`
- `MWI 食用工具（隊伍順序修正版）`
- `Ranged Way Idle`
- `Sunny's MWI 增强`
- `银河奶牛放置-辅助增强（性能优化版）`
- `迷宫胜率计算器`
- `娘化怪物换皮`
- 其他非 MWI 或用途單一的獨立腳本

## 隱私與安全邊界

- 儲存庫不包含 Tampermonkey 的 `.storage.json`、裝置碼、試算表網址、Apps Script 網址或公會私人設定。
- 公會管理相關原始碼沒有被複製進整合包。
- 功能來源、作者與授權請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 重新建置

```powershell
python .\tools\build_suites.py --import-from "C:\path\to\tampermonkey\scripts"
node .\tools\build_standalone_appearance.mjs
```

建置工具只匯入白名單中的 `.user.js` 程式碼，不讀取 `.storage.json`。
