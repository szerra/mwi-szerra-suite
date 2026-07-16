# MWI Szerra 插件整合包

把常用的 MWI Tampermonkey 插件整理成三個可獨立更新的套件。公會管理、私人上傳設定與裝置資料完全不在此儲存庫中。

## 安裝

- [安裝戰鬥資訊包](https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Combat-Suite.user.js)
- [安裝市場工具包](https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Market-Suite.user.js)
- [安裝角色資訊包](https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/MWI-Szerra-Character-Suite.user.js)

Tampermonkey 會依各檔案的 `@updateURL` 自動檢查此儲存庫的最新版。每個套件的子功能也能從 Tampermonkey 的腳本選單逐項開關，切換後頁面會重新載入。

## 套件內容

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

備份內唯一的純外觀插件是「娘化怪物換皮」，因此不另外建立外觀整合包，讓它維持獨立即可。戰鬥技能特效雖然有視覺效果，但會讀取實際戰鬥事件，因此歸在戰鬥資訊包。

## 安裝後要停用的舊腳本

先確認三個整合包正常，再停用以下舊腳本：

- `[银河奶牛]显示战斗升级所需时间`
- `[MWI] Realtime Import Of Battle Simulation`
- `[银河奶牛]康康运气_修复`
- `MWI Battle HUD`
- `MWI 戰鬥技能特效`
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
- `MWITools 繁體中文修正版`
- `[银河奶牛]食用工具`
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
```

建置工具只匯入白名單中的 `.user.js` 程式碼，不讀取 `.storage.json`。

