// ==UserScript==
// @name         MWI 工會資料與試煉配置
// @name:zh-TW   MWI 工會資料與試煉配置
// @name:en      MWI Guild Data & Trial Configuration
// @namespace    https://www.milkywayidle.com/
// @version      0.8.48.23
// @description  公會成員資料自動上傳、桌面模擬結果接收、試煉發布、通知與錯誤名單。
// @description:zh-TW 公會成員資料自動上傳、桌面模擬結果接收、試煉發布、通知與錯誤名單。
// @description:en Upload guild data, receive desktop simulation results, publish trials, notify members, and show roster errors.
// @author       Codex
// @license      MIT
// @homepageURL  https://gist.github.com/szerra/de1476ae18f2cee78066e3bbb678dc35
// @downloadURL  https://github.com/szerra/mwi-szerra-suite/releases/latest/download/mwi-guild-data-bridge.user.js
// @updateURL    https://github.com/szerra/mwi-szerra-suite/releases/latest/download/mwi-guild-data-bridge.meta.js
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      raw.githubusercontent.com
// ==/UserScript==
(()=>{var Fr=["adminPublishNotice","adminPublishTrialSelectionNotice","adminPublish","adminReplacePublishedPlans","adminUnpublish","adminBatchUnpublish","adminSavePlan","adminDeletePlan","adminSavePrivateNote","adminSaveMemberRole","adminSaveMemberGroup","adminSaveMemberGroups","adminReportTrialRoster","adminSavePublicProfileData"];function zr(){let $="",re=0,Le,pe=()=>{Le={characterId:$,completed:!1,inFlight:!1,readComplete:!1,uploadFailures:0}};return pe(),Object.freeze({activate(ee){let be=String(ee||"");return be===$?!1:($=be,re+=1,pe(),!0)},capture:()=>Object.freeze({characterId:$,generation:re}),isCurrent:ee=>!!(ee&&ee.characterId&&ee.characterId===$&&ee.generation===re),startup:()=>Le})}function Gr({context:$,calculateScore:re,buildSnapshot:Le,request:pe,getToken:ee,saveToken:be,savePreferences:oe,device:_e}){return Object.freeze({async upload(O){if(!$.isCurrent(O))return null;let we=await re();if(!$.isCurrent(O))return null;let le=Le();if(String(le.character?.id||"")!==O.characterId)return null;le.action="uploadPlayerData",le.memberToken=ee(O.characterId);let Ie=await pe(le);return Ie.memberToken&&be(O.characterId,String(Ie.memberToken)),oe(le),{snapshot:le,buildScore:we,response:Ie}},async readConfiguration(O){return $.isCurrent(O)?pe({action:"myConfig",characterId:O.characterId,memberToken:ee(O.characterId),..._e()}):null}})}function Ur({request:$,getAdminToken:re,flattenPlan:Le,planName:pe,updateSavedPlan:ee,updatePublishedPlans:be}){return Object.freeze({async saveForPublication(oe,_e,O,we){let Ie={...O==="life"?{skillSlots:[],skillHrids:[],abilitySlots:[],abilityHrids:[],abilityTriggers:{}}:Le(_e),planId:`bridge-publication:${oe}:${O}`,characterId:oe,planType:O,type:O,name:pe(O),trialHrid:we,equipmentSlots:{},equipment:{},selectedEquipment:{},omitEquipmentRecommendation:!0},wt=await $({action:"adminSavePlan",adminToken:re(),characterId:oe,plan:Ie}),Qt=wt?.plan||Ie;return ee(oe,Qt,wt?.savedAt||""),Qt},async saveLifeTrialSelection(oe,_e){return this.saveForPublication(oe,null,"life",_e)},async replace(oe,_e,O,we){let le=await $({action:"adminReplacePublishedPlans",adminToken:re(),characterId:oe,lifePlanId:_e,battlePlanId:O,currentWeeklyTrials:we});return be(oe,_e,O,le||{}),le}})}(function(){"use strict";let $="0.8.48.23",re="https://script.google.com/macros/s/AKfycbz8CXNEcp9eROPm_8Nli8W9QFE2qi-ZBGYFSpf6i2Wb38n-sigGjtnalz39r_pFIvMVNw/exec",Le="https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/standalone/mwi-guild-data-bridge.meta.js",pe="https://github.com/szerra/mwi-szerra-suite/releases/latest/download/mwi-guild-data-bridge.user.js",ee="mwi-guild-data-bridge:update-last-check",be="mwi-guild-data-bridge:update-snooze",we="mwi-guild-data-bridge:api-url",le="mwi-guild-data-bridge:confirmed:",Ie="mwi-guild-data-bridge:member-token:",wt="mwi-guild-data-bridge:device-id",Qt="mwi-guild-data-bridge:config-ack:",jr="mwi-guild-data-bridge:notice-ack:",Wr="mwi-guild-data-bridge:trial-time-ack:",Vr="mwi-guild-data-bridge:trial-selection-notice-ack:",sn="mwi-guild-data-bridge:admin-session",cn="mwi-guild-data-bridge:admin-talent-analysis",dn="mwi-guild-data-bridge:admin-aura-selections",Je="mwi-guild-data-bridge:trial-drafts:v1",mn="mwi-guild-data-bridge-local-trial-plans",Ye=Object.freeze(["1","2","3","4","5"]),Kr=Object.freeze(["/guild_buildings/dining_room","/guild_buildings/library","/guild_buildings/dojo","/guild_buildings/armory","/guild_buildings/gym","/guild_buildings/archery_range","/guild_buildings/mystical_study"]),lc=Object.freeze(["/guild_shrines/force","/guild_shrines/tempo","/guild_shrines/spirit","/guild_shrines/rarity","/guild_shrines/scholar"]),Zt=Object.freeze(["force","tempo","spirit","rarity","scholar"]),un=2,yt=2,Jr="mwi-guild-data-bridge-admin-cache",Xe="snapshots",Gi="mwi-guild-data-bridge:open-button-position",ei="__MWI_GUILD_DATA_BRIDGE_HOOK__",Ui="mwi-guild-data-bridge-host",Yr="mwi-guild-trial-planner-host",pn="mwi-guild-trial-highlight-style",Qe="mwi-guild-trial-mismatch-banner",Ze="mwi-guild-trial-roster-error-badge",et="mwi-guild-trial-roster-error-badges",ye="mwi-guild-trial-roster-list-button",St="mwi-guild-trial-roster-list-dialog",fn="mwi-guild-admin-upload-badge-style",$e="mwi-guild-admin-upload-badge",vt="mwi-guild-admin-upload-summary",ji=2e4,xt=18e4,Xr=6e4,Qr=15e3,gn=15e3,Wi=5e3,Zr=5e3,eo=6e4,me=5,P=typeof unsafeWindow<"u"?unsafeWindow:window,At="__MWI_GUILD_DATA_BRIDGE_RUNTIME__",Vi=[],Ki=P[At];if(Ki&&typeof Ki.dispose=="function")try{Ki.dispose()}catch{}let Oe={version:$,disposed:!1,dispose(){if(!Oe.disposed){for(Oe.disposed=!0;Vi.length;){let e=Vi.pop();try{e()}catch{}}if(P[At]===Oe)try{delete P[At]}catch{P[At]=null}}}};P[At]=Oe;function qe(e){return typeof e=="function"&&Vi.push(e),e}function Se(e,t,i,a){return e.addEventListener(t,i,a),qe(()=>e.removeEventListener(t,i,a)),i}function ti(e,t){let i=window.setInterval(e,t);return qe(()=>window.clearInterval(i)),i}function Ne(e,t){let i=window.setTimeout(e,t);return qe(()=>window.clearTimeout(i)),i}function se(e){let t=Number(e);return Number.isFinite(t)&&t>=0?Math.floor(t):null}function to(e=""){let t=String(e||"").trim().toLowerCase();return t==="zh"||t.startsWith("zh-")?"zh-TW":"en"}let K=to(navigator.language||(Array.isArray(navigator.languages)?navigator.languages[0]:"")||document.documentElement.lang||"en"),Fe=K==="zh-TW"?"zh-TW":"en-US";Oe.locale=K;let hn=Object.freeze([["MWI 工會資料與試煉配置","MWI Guild Data & Trial Configuration"],["公會資料插件內建 Talent Market 計算","Built-in Talent Market calculation"],["公會資料插件內建","Built into Guild Data"],["工會資料","Guild Data"],["我的配置","My Configuration"],["資料來源","Data Source"],["公會","Guild"],["只供試煉模擬；修改後只自動暫存於這台電腦，不會上傳到試算表","For trial simulation only; changes are auto-saved on this computer and are never uploaded to the spreadsheet"],["正式方案只保留一套生活方案與一套戰鬥方案，不會被模擬方案覆蓋","Only one life loadout and one combat loadout are kept; simulation loadouts do not overwrite them"],["正式方案與模擬專用方案分開儲存","Published and simulation-only loadouts are stored separately"],["全部條件都成立時才會施放；沒有條件時，魔力足夠且冷卻完成就會依技能順序施放。","The skill is cast only when all conditions are met. With no conditions, it is cast in skill order when MP and cooldown allow."],["選兩項以上就是交集榜；全能榜依「達標項數 → 最低項 → 平均」排序。","Selecting two or more uses an intersection ranking. All-round ranking uses Qualified Count → Weakest Skill → Average."],["由高到低排序；再點一次回到原始順序","Sort high to low; click again to restore the original order"],["放在一起；再點一次回到原始順序","Group identical values; click again to restore the original order"],["本週尚未發布你的生活或戰鬥方案。","No life or combat loadout has been published for you this week."],["請在目前開啟的試煉畫面選擇管理員指定的生活與戰鬥試煉。","Choose the life and combat trials assigned by the administrator on the open Trials screen."],["管理員已更新公會試煉時間。","The administrator updated the guild trial time."],["管理員發布了一則公會公告。","The administrator published a guild announcement."],["插件有新版本","Plugin Update Available"],["建議立即更新，避免公會資料與通知功能不相容。","Update now to keep guild data and notifications compatible."],["目前版本：","Current version: "],["最新版本：","Latest version: "],["前往更新","Update Now"],["稍後提醒","Remind Me Later"],["下次試煉時間：管理員尚未設定","Next trial time: not set by the administrator"],["下次試煉：管理員尚未設定","Next trial: not set by the administrator"],["房屋或成就本次未讀取；仍可上傳，雲端既有資料會保留","Houses or achievements were not read this time; you can still upload and existing cloud data will be kept"],["房屋與成就：本次未完整讀取，已保留雲端既有資料","Houses and achievements: incomplete this time; existing cloud data was kept"],["角色與技能已讀取，正在等待倉庫及身上裝備資料…","Character and skills loaded; waiting for inventory and equipped items…"],["倉庫及身上裝備資料尚未完整讀取，請重新整理遊戲後再試","Inventory and equipped items are not fully loaded. Reload the game and try again."],["尚未找到角色資料；請確認遊戲已載入完成，必要時重新整理頁面。","Character data was not found. Wait for the game to finish loading, then reload if needed."],["等待完整的遊戲角色資料…","Waiting for complete game character data…"],["等待遊戲角色資料…","Waiting for game character data…"],["等待遊戲裝備資料…","Waiting for game equipment data…"],["尚未讀取角色資料。","Character data has not been loaded."],["角色資料尚未完整讀取","Character data is not fully loaded"],["房屋與成就：已更新","Houses and achievements: updated"],["上傳成功：已更新","Upload succeeded: updated"],["上傳成功：已建立","Upload succeeded: created"],["上傳完成","Upload complete"],["正在上傳玩家資料…","Uploading player data…"],["自動重新讀取尚未完成","Automatic reload is not complete"],["自動上傳失敗","Automatic upload failed"],["秒後重新讀取","seconds before reloading again"],["秒後重新上傳","seconds before uploading again"],["正在上傳房屋與成就…","Uploading houses and achievements…"],["重新讀取目前角色資料","Reload current character data"],["已重新讀取目前角色資料。","Current character data was reloaded."],["自動讀取裝備與技能","Read equipment and skills automatically"],["我的指定方案","My Assigned Loadouts"],["目前沒有已發布的配置。","There is no published configuration."],["試煉時間已更新","Trial Time Updated"],["試煉選擇通知","Trial Selection Notice"],["請選擇本週公會試煉","Choose This Week’s Guild Trials"],["公會公告","Guild Announcement"],["公會通知","Guild Notice"],["我知道了","Got It"],["查看試煉","View Trials"],["請查看並選擇管理員指定的生活與戰鬥試煉。","Review and choose the life and combat trials assigned by the administrator."],["人才分析","Talent Analysis"],["試煉人才分析","Trial Talent Analysis"],["收起人才分析","Hide Talent Analysis"],["重新整理全部資料","Refresh All Data"],["重新下載全部資料","Download All Data Again"],["上傳分組設定（不含方案1～5）","Upload Group Settings (Excludes Plans 1–5)"],["下載分組設定（保留本機方案1～5）","Download Group Settings (Keep Local Plans 1–5)"],["匯出本機方案1～5","Export Local Plans 1–5"],["匯入本機方案1～5","Import Local Plans 1–5"],["同步全部設定中…","Syncing all settings…"],["全選有資料會員","Select All Members With Data"],["取消全選","Clear Selection"],["勾選符合者","Select Matching Members"],["套用本週生活試煉","Use This Week’s Life Trials"],["先點選技能，或使用上方快速榜單。","Select skills first, or use a quick ranking above."],["先點選技能，或使用「本週生活試煉／生活全能榜」快速建立排名。","Select skills first, or use “This Week’s Life Trials / Life All-round Ranking” to create a ranking."],["套用勾選名單","Apply Selected Roster"],["發布公會通知","Publish Guild Notice"],["發布通知","Publish Notice"],["發布指定方案","Publish Assigned Loadout"],["正在發布指定方案…","Publishing assigned loadout…"],["試煉模擬","Trial Simulator"],["會員方案管理","Member Loadout Manager"],["方案管理","Loadout Manager"],["下一位成員","Next Member"],["關閉會員方案","Close Member Loadout"],["搜尋角色名稱、定位或備註","Search character name, role, or note"],["管理員登入","Administrator Login"],["管理員已登入（永久有效，直到主動登出或更換密碼）","Administrator signed in (valid until sign-out or password change)"],["尚未登入管理員。","Administrator is not signed in."],["尚未登入","Not signed in"],["請輸入管理員共用密碼。","Enter the shared administrator password."],["正在驗證管理員密碼…","Verifying administrator password…"],["登入","Sign In"],["登出","Sign Out"],["管理員","Administrator"],["管理員資料狀態","Administrator Data Status"],["本機資料：尚未下載","Local data: not downloaded"],["本機資料：","Local data: "],["由本機載入","Loaded locally"],["剛下載並覆蓋","Just downloaded and replaced"],["上傳資料","Upload Data"],["重新讀取","Reload"],["設定 Google Apps Script 網址","Set Google Apps Script URL"],["清除目前角色的個人讀取碼","Clear this character’s personal access code"],["顯示本機裝置代碼","Show Local Device Code"],["重設工會資料按鈕位置","Reset Guild Data button position"],["貼上部署後、以 /exec 結尾的 Web App 網址：","Paste the deployed Web App URL ending in /exec:"],["網址格式不正確，必須是 script.google.com/macros/s/.../exec","Invalid URL. It must match script.google.com/macros/s/.../exec"],["已儲存 API 網址，請重新整理遊戲頁面。","API URL saved. Reload the game page."],["本機裝置代碼：","Local device code: "],["裝置名稱：","Device name: "],["公會名單","Guild Roster"],["選擇玩家","Select Player"],["調整裝備與技能","Adjust Equipment & Skills"],["修改只存在此插件","Changes exist only in this plugin"],["請先選擇一位玩家","Select a player first"],["還原公會配裝","Restore Guild Loadout"],["雙組與兩隻試煉王","Two Teams & Two Trial Bosses"],["兩組試煉王","Trial Bosses for Both Teams"],["每人限一組","One team per player"],["指定試煉王","Assign Trial Boss"],["目前人數加成","Current Party Bonus"],["套用後 T1 總 HP","T1 Total HP After Scaling"],["基礎總 HP","Base Total HP"],["重新讀取公會資料","Reload Guild Data"],["重置所有分組","Reset All Teams"],["尚未讀取公會快照","Guild snapshot not loaded"],["請先讀取公會資料","Load guild data first"],["公會快照沒有這位玩家的裝備資料。","The guild snapshot has no equipment data for this player."],["找不到公會快照；請先在公會資料工具的管理頁下載一次本機資料","Guild snapshot not found. Download local data once from the Guild Data administrator page."],["公會快照：","Guild snapshot: "],["裝備（依遊戲位置排列；點選可更換）","Equipment (game slot order; click to replace)"],["生活工具（依遊戲順序排列）","Life Tools (game order)"],["生活工具（參考；戰鬥方案不會儲存）","Life Tools (reference only; not saved in combat loadouts)"],["指定生活技能（點已選技能可更換）","Assigned Life Skills (click a selected skill to replace it)"],["指定戰鬥技能（點已選技能可更換）","Assigned Combat Skills (click a selected skill to replace it)"],["指定戰鬥技能（第一格為光環／特殊技能；點擊可更換）","Assigned Combat Skills (Skill 1 is an aura / special ability; click to replace)"],["戰鬥試煉方案的第一格光環會同步到外面；模擬方案可各自修改","The formal combat loadout syncs Skill 1 to the roster; simulation loadouts remain independent"],["指定生活技能","Assigned Life Skills"],["指定戰鬥技能","Assigned Combat Skills"],["生活技能等級","Life Skill Levels"],["戰鬥技能等級","Combat Skill Levels"],["光環與復活等級","Aura & Revive Levels"],["光環與復活","Auras & Revive"],["裝備技能分數","Equipment & Skill Score"],["戰鬥等級","Combat Level"],["管理員備註","Admin Note"],["永久管理員備註；只供管理員查看，不會發布給會員","Permanent admin note; visible only to administrators and never published to members"],["備註（不會發布給會員）","Note (not published to members)"],["給會員看的簡短備註","Short note shown to the member"],["角色定位","Role"],["生活試煉","Life Trial"],["戰鬥試煉","Combat Trial"],["生活指定","Life Assignment"],["戰鬥指定","Combat Assignment"],["更新時間","Updated"],["未選擇光環","No aura selected"],["未選擇技能","No skill selected"],["未選擇生活試煉","No life trial selected"],["未選擇戰鬥試煉","No combat trial selected"],["尚未選擇技能","No skills selected"],["尚未儲存","Not saved"],["尚未上傳","Not uploaded"],["已儲存","Saved"],["已發布","Published"],["已上傳","Uploaded"],["已下載全部會員資料並覆蓋本機快取。","All member data was downloaded and replaced in the local cache."],["本機沒有完整資料，請先按「重新整理全部資料」","Local data is incomplete. Click “Refresh All Data” first."],["正在重新下載全部會員裝備、技能與方案…","Downloading all member equipment, skills, and loadouts again…"],["正在讀取本機會員資料…","Reading local member data…"],["正在讀取我的配置…","Loading my configuration…"],["正在讀取會員裝備與技能…","Loading member equipment and skills…"],["正在整理成員上傳分數，並計算尚未上傳分數的舊資料…","Preparing member scores and calculating older data without uploaded scores…"],["正在處理…","Processing…"],["正在儲存…","Saving…"],["正在發布…","Publishing…"],["正在取消發布…","Unpublishing…"],["正在發布通知…","Publishing notice…"],["正在套用勾選名單…","Applying selected roster…"],["全部設定上傳完成","All settings uploaded"],["全部裝備：","All equipment: "],["目前身上：","Currently equipped: "],["已學技能：","Learned skills: "],["有資料會員：","Members with data: "],["全部設定上傳失敗。","Failed to upload all settings."],["全部設定下載失敗。","Failed to download all settings."],["目前沒有可上傳的會員設定。","There are no member settings to upload."],["目前沒有可接收通知的已上傳會員。","There are no uploaded members who can receive a notice."],["目前沒有符合人才分析條件的會員。","No members match the talent analysis filters."],["沒有符合條件的會員。","No members match the filters."],["請先勾選至少一位會員，或選擇全部會員。","Select at least one member or choose all members."],["請先輸入通知內容。","Enter the notice content first."],["請先選擇至少一套生活或戰鬥方案。","Select at least one life or combat loadout first."],["請按「重新整理全部資料」下載最新會員裝備、技能與方案。","Click “Refresh All Data” to download the latest member equipment, skills, and loadouts."],["目前方案尚未儲存，請先儲存後再發布。","This loadout is not saved yet. Save it before publishing."],["目前有尚未儲存的方案修改，確定要放棄嗎？","This loadout has unsaved changes. Discard them?"],["方案正在儲存，請稍候完成後再關閉。","The loadout is being saved. Wait for it to finish before closing."],["目前沒有下一位可開啟的成員","There is no next member to open"],["生活方案","Life Loadout"],["戰鬥方案","Combat Loadout"],["生活試煉方案","Life Trial Loadout"],["戰鬥試煉方案","Combat Trial Loadout"],["正式方案","Published Loadout"],["模擬專用方案","Simulation-only Loadout"],["模擬方案","Simulation Loadout"],["新增生活技能","Add Life Skill"],["新增戰鬥技能","Add Combat Skill"],["新增條件","Add Condition"],["清空條件","Clear Conditions"],["條件數值","Condition Value"],["預設條件","Default Condition"],["自訂條件","Custom Condition"],["施放條件","Cast Conditions"],["設定這個技能的施放條件","Set cast conditions for this skill"],["目前沒有施放條件。","There are no cast conditions."],["移除這個條件","Remove this condition"],["移除這個技能","Remove this skill"],["移除這個槽位","Clear this slot"],["更換或移除","Replace or Remove"],["沒有可選裝備","No equipment available"],["這位會員目前沒有可選技能資料。","This member has no selectable skill data."],["這位會員目前沒有可選的光環／特殊技能資料。","This member has no selectable aura or special-skill data."],["這位會員尚未上傳資料，無法建立方案。","This member has not uploaded data, so a loadout cannot be created."],["生活全能榜","Life All-round Ranking"],["戰鬥全能榜","Combat All-round Ranking"],["弱項優先","Weakest Skill First"],["達標項數優先","Qualified Count First"],["平均等級優先","Average Level First"],["最高單項優先","Highest Skill First"],["裝備技能分數優先","Equipment & Skill Score First"],["全部技能都達標（AND）","All Skills Meet Threshold (AND)"],["任一技能達標（OR）","Any Skill Meets Threshold (OR)"],["不限等級，全部排名（推薦）","No Level Filter, Rank Everyone (Recommended)"],["不限更新時間","Any Update Time"],["勾選全部排名","Select All Ranked Members"],["套用條件","Apply Filters"],["清除技能","Clear Skills"],["排名方式","Ranking Method"],["資料新鮮度","Data Freshness"],["最低裝備技能分數","Minimum Equipment & Skill Score"],["0 表示不限制","0 means no limit"],["統計參考門檻","Reference Threshold"],["篩選條件","Filters"],["排名","Rank"],["名次","Rank"],["達標","Qualified"],["弱項","Weakest"],["平均","Average"],["全部達標","All Qualified"],["任一達標","Any Qualified"],["分數不限","Any Score"],["24 小時內","Within 24 Hours"],["3 天內","Within 3 Days"],["7 天內","Within 7 Days"],["14 天內","Within 14 Days"],["恢復遊戲預設","Restore Game Default"],["回到預設順序","Restore Default Order"],["未分組","Unassigned"],["分組 1 還沒有人","Team 1 has no players"],["分組 2 還沒有人","Team 2 has no players"],["分組 1 對戰","Team 1 vs."],["分組 2 對戰","Team 2 vs."],["加入分組 1","Add to Team 1"],["加入分組 2","Add to Team 2"],["從分組 1 移除","Remove from Team 1"],["從分組 2 移除","Remove from Team 2"],["模擬分組 1（60 分鐘）","Simulate Team 1 (60 Minutes)"],["模擬分組 2（60 分鐘）","Simulate Team 2 (60 Minutes)"],["請等待目前的模擬完成後再重置分組。","Wait for the current simulation to finish before resetting teams."],["請先把玩家加入分組 1","Add players to Team 1 first"],["請先選擇試煉王","Select a trial boss first"],["已自動保存","Auto-saved"],["修改會自動保存","Changes are auto-saved"],["裝備已保存","Equipment saved"],["技能已保存","Skill saved"],["技能 1（光環／特殊）","Skill 1 (Aura / Special)"],["— 空白 —","— Empty —"],["請選擇","Select"],["選擇裝備或技能","Choose Equipment or Skill"],["關閉選擇清單","Close Selection List"],["未指定","Not Assigned"],["關閉","Close"],["取消","Cancel"],["移除","Remove"],["儲存","Save"],["選擇","Select"],["設定","Settings"],["更新","Updated"],["角色 ID","Character ID"],["角色","Character"],["玩家","Player"],["成員","Member"],["會員","Member"],["裝置名稱","Device Name"],["裝置","Device"],["頁面狀態","Page Status"],["生活技能","Life Skills"],["戰鬥技能","Combat Skills"],["角色技能","Abilities"],["生活裝備／工具","Life Equipment / Tools"],["裝備","Equipment"],["技能","Skills"],["光環","Aura"],["分組","Team"],["生活","Life"],["戰鬥","Combat"],["試煉","Trials"],["坦","Tank"],["補","Healer"],["槍","Spear"],["劍","Sword"],["錘","Hammer"],["水法","Water Mage"],["自然法","Nature Mage"],["火法","Fire Mage"],["弩","Crossbow"],["弓","Bow"],["速度光環","Speed Aura"],["守護光環","Guardian Aura"],["物理光環","Fierce Aura"],["暴擊光環","Critical Aura"],["元素光環","Mystic Aura"],["復活","Revive"],["瘋狂","Insanity"],["無敵","Invincible"],["獾","Badger"],["變色龍","Chameleon"],["水母","Jellyfish"],["刺蝟","Hedgehog"],["蟲群","Swarm"],["試煉獾","Trial Badger"],["試煉變色龍","Trial Chameleon"],["試煉水母","Trial Jellyfish"],["試煉刺蝟","Trial Hedgehog"],["試煉蟲群","Trial Swarm"],["背部","Back"],["頭部","Head"],["飾品","Trinket"],["項鍊","Neck"],["主手","Main Hand"],["雙手","Two-Handed"],["副手","Off Hand"],["身體","Body"],["耳環","Earrings"],["手部","Hands"],["腿部","Legs"],["袋子","Pouch"],["戒指","Ring"],["腳部","Feet"],["護符","Charm"],["瀏覽器不支援本機資料庫。","This browser does not support the local database."],["此瀏覽器不支援 IndexedDB","This browser does not support IndexedDB"],["無法開啟管理員本機資料庫。","Unable to open the administrator’s local database."],["無法讀取管理員本機資料。","Unable to read the administrator’s local data."],["無法覆蓋管理員本機資料。","Unable to replace the administrator’s local data."],["管理員本機資料寫入已取消。","Writing administrator local data was canceled."],["本機會員資料格式不正確。","The local member data format is invalid."],["本機資料儲存失敗；目前畫面仍可使用。","Local data could not be saved; the current screen can still be used."],["本機暫存失敗","Local cache failed"],["已暫存於這台電腦","Cached on this computer"],["公開資料格式不正確，未上傳。","The public data format is invalid and was not uploaded."],["公開資料的公會 ID 與目前公會不符，未上傳。","The guild ID in the public data does not match the current guild, so it was not uploaded."],["公開資料未包含完整房屋與成就，未上傳。","The public data does not contain complete house and achievement data, so it was not uploaded."],["公開房屋資料無法辨識，未上傳。","Public house data could not be recognized and was not uploaded."],["公開成就資料無法辨識，未上傳。","Public achievement data could not be recognized and was not uploaded."],["公開資料上傳失敗。","Failed to upload public data."],["不在目前公會名單，未上傳。","Not in the current guild roster; not uploaded."],["互相矛盾，未上傳。","The data conflicts and was not uploaded."],["已清除本機讀取碼。再次上傳時可能會被視為新裝置；若已超過兩台，需由管理者在「裝置管理」分頁核准。","The local access code was cleared. The next upload may be treated as a new device; if two devices are already registered, an administrator must approve it on the Device Management tab."],["市場價格讀取失敗","Failed to load market prices"],["市場價格格式不正確。","The market price format is invalid."],["管理員端即時市場計算","Administrator live market calculation"],["成員上傳的內建 Talent Market 分數","Member-uploaded built-in Talent Market score"],["內建 Talent Market 分數尚未計算完成。","The built-in Talent Market score is not ready."],["分數資料完整。","Score data is complete."],["分數已寫入本機快照。","The score was written to the local snapshot."],["分數已顯示，但本機快照寫入失敗。","The score is displayed, but writing it to the local snapshot failed."],["管理員端分數計算失敗。","Administrator score calculation failed."],["加入複合排名條件","Add Combined Ranking Condition"],["尚未讀到本週生活試煉；請先開啟遊戲的公會試煉頁。","This week’s life trials have not been read. Open the guild Trials tab in the game first."],["已切換為生活全能榜：達標項數、最低項、平均依序排名。","Switched to Life All-round Ranking: qualified count, weakest skill, then average."],["已切換為戰鬥全能榜：達標項數、最低項、平均依序排名。","Switched to Combat All-round Ranking: qualified count, weakest skill, then average."],["平均優先","Average First"],["只排名","Rank Only"],["候選母數：","Candidate pool: "],["已有裝備技能分數：","Members with equipment & skill scores: "],["項達標：","qualified skills: "],["至少","At least"],["沒有符合目前條件的會員。可降低門檻，或把篩選改成「任一達標／只排名」。","No members match the current filters. Lower the threshold or change the filter to “Any Qualified / Rank Only”."],["使用上方按鈕全選有資料會員","Use the button above to select all members with data"],["永久保存於試算表，只供管理員查看","Stored permanently in the spreadsheet and visible only to administrators"],["後端未回傳管理員權限。","The backend did not return administrator permission."],["管理員登入失敗。","Administrator sign-in failed."],["目前會員方案尚未儲存，請先儲存或放棄修改後再重新整理全部資料。","The open member loadout has unsaved changes. Save or discard them before refreshing all data."],["本機尚無資料，正在第一次下載全部會員資料…","No local data exists; downloading all member data for the first time…"],["後端回傳的完整會員資料格式不正確。","The complete member data returned by the backend is invalid."],["已從本機快取開啟會員資料；需要最新內容時請按「重新整理全部資料」。","Member data was opened from the local cache. Click “Refresh All Data” when you need the latest data."],["無法讀取會員資料。","Unable to load member data."],["✓ 有資料","✓ Has data"],["－ 無資料","— No data"],["已永久儲存","Permanently saved"],["管理員備註儲存失敗。","Failed to save the admin note."],["分組儲存失敗。","Failed to save the team."],["全部設定上傳完成：已保存","All settings uploaded and saved"],["的試煉分組"," trial team"],["角色定位儲存失敗。","Failed to save the role."],["無光環資料","No aura data"],["目前沒有可選的光環資料","No selectable aura data is available"],["使用的光環","Assigned Aura"],["已清除光環選擇。","The aura selection was cleared."],["已勾選會員","Selected members"],["全部有資料會員","All members with data"],["輸入要通知會員的內容（最多 2000 字）","Enter the notice text (maximum 2,000 characters)"],["確定發布這則通知給","Publish this notice to "],["通知已發布給","Notice published to "],["通知發布失敗。","Failed to publish the notice."],["尚未上傳資料，無法發布","Data has not been uploaded; publishing is unavailable"],["本機沒有這位會員的完整資料","Complete local data is unavailable for this member"],["成員上傳","Member upload"],["成員本機計分","Member local score"],["管理員市場計分","Administrator market score"],["擁有裝備：","Owned equipment: "],["目前身上：","Currently equipped: "],["房屋","Houses"],["（資料不完整或使用保守估值）","(incomplete data or conservative estimate)"],["裝備技能分數：計算中","Equipment & Skill Score: calculating"],["裝備技能分數：尚無可計算資料","Equipment & Skill Score: no calculable data"],["已把","Sent "],["位分組會員與各自目前選用的模擬方案送到試煉模擬。"," grouped members and their selected simulation loadouts to the trial simulator."],["已開啟試煉模擬；目前尚未設定分組 1／2。","The trial simulator is open; Teams 1 and 2 are not configured yet."],["無法開啟試煉模擬。","Unable to open the trial simulator."],["編輯方案","Edit Loadout"],["尚未讀取本週","This week’s "],["試煉，請先讓遊戲載入公會試煉資料。"," trial has not been loaded. Let the game load guild trial data first."],["試煉不在本週清單內，請改選本週試煉。","This trial is not in the current week’s list. Select a current trial."],["目前未裝備","Not equipped"],["點此選擇","Click to select"],["此格僅供參考，不會儲存進目前方案","This slot is for reference only and is not saved in the current loadout"],["這位會員沒有此槽位可選裝備","This member has no selectable equipment for this slot"],["點選套用","Click to apply"],["舊草稿裝備","Equipment from an old draft"],["選擇第一格光環或特殊技能","Choose an aura or special skill for Skill 1"],["選擇第一格光環／特殊技能","Choose an aura / special skill for Skill 1"],["格戰鬥技能"," combat skill"],["點此更換或移除","Click to replace or remove"],["模擬專用","Simulation only"],["已儲存；開啟試煉模擬時會使用這一槽。","Saved; this slot will be used when opening the trial simulator."],["已載入；目前為模擬器選用槽","Loaded; currently selected by the simulator"],["尚未儲存；修改後會自動建立","Not saved; it will be created automatically after a change"],["正在儲存","Saving"],["並儲存到雲端"," and saved to the cloud"],["無法儲存方案。","Unable to save the loadout."],["已發布本次生活／戰鬥指定方案。","This life / combat assignment was published."],["發布失敗。","Publishing failed."],["目前開啟的會員方案尚未儲存，請先儲存後再批次發布。","The open member loadout is not saved. Save it before batch publishing."],["確定套用這次勾選名單？","Apply the selected roster?"],["已勾選且有選試煉","Selected with an assigned trial"],["已勾選但兩項都未選","Selected with neither trial assigned"],["未勾選","Not selected"],["有多套雲端方案，請先刪除不使用的方案或保留目前已發布方案","Multiple cloud loadouts exist. Delete unused loadouts or keep the currently published one."],["已選戰鬥試煉，但尚未在方案管理儲存戰鬥裝備方案","A combat trial is selected, but no combat equipment loadout is saved in Loadout Manager."],["取消發布失敗。","Failed to unpublish."],["已取消發布。","Unpublished."],["通知發送失敗","Failed to send the notice"],["試煉選擇通知發布失敗","Failed to publish the trial selection notice"],["伺服器可能已完成操作，但目前無法確認結果；請先重新整理管理員資料，避免重複發布。","The server may have completed the operation, but the result cannot be confirmed. Refresh administrator data before trying again to avoid duplicate publishing."],["工會資料服務連線逾時。","The Guild Data service timed out."],["會員資料讀取逾時，請稍候再試。","Member data timed out. Try again later."],["無法連線到工會資料服務。","Unable to connect to the Guild Data service."],["無法確認上傳結果，請稍後再試。","Unable to confirm the upload result. Try again later."],["未知會員","Unknown Member"],["未知裝備","Unknown Equipment"],["未知","Unknown"],["擠奶","Milking"],["採集","Foraging"],["伐木","Woodcutting"],["乳酪鍛造","Cheesesmithing"],["製作","Crafting"],["縫紉","Tailoring"],["烹飪","Cooking"],["沖泡","Brewing"],["煉金","Alchemy"],["強化","Enhancing"],["攻擊","Attack"],["防禦","Defense"],["近戰","Melee"],["遠程","Ranged"],["魔法","Magic"]]),io=new Map(hn),ao=Object.freeze([...hn].filter(([e])=>e.length>=2).sort((e,t)=>t[0].length-e[0].length)),bn=new WeakSet;function G(e){let t=String(e??"");if(K!=="en"||!t)return t;let i=t.match(/^\s*/)?.[0]||"",a=t.match(/\s*$/)?.[0]||"",n=t.slice(i.length,t.length-a.length);if(!n||!/[\u3400-\u9fff]/u.test(n))return t;let r=io.get(n);if(r)return`${i}${r}${a}`;let l=n;return ao.forEach(([s,c])=>{l.includes(s)&&(l=l.split(s).join(c))}),l=l.replace(/^已選\s*(\d+)\s*[／/]\s*(\d+)\s*人$/,"Selected $1 / $2 members").replace(/^已選\s*(\d+)\s*人$/,"Selected $1 members").replace(/(\d[\d,]*(?:\.\d+)?)\s*位會員/g,"$1 members").replace(/(\d[\d,]*(?:\.\d+)?)\s*位成員/g,"$1 members").replace(/(\d[\d,]*(?:\.\d+)?)\s*位玩家/g,"$1 players").replace(/(\d[\d,]*(?:\.\d+)?)\s*人/g,"$1 members").replace(/(\d[\d,]*(?:\.\d+)?)\s*項/g,"$1 items").replace(/(\d[\d,]*(?:\.\d+)?)\s*種/g,"$1 types").replace(/^第\s*(\d+)\s*層/,"Layer $1").replace(/(\d+)\s*層/g,"$1 layers").replace(/(\d+)\s*秒/g,"$1 sec").replace(/(\d+)\s*分鐘/g,"$1 min").replace(/(\d+)\s*小時/g,"$1 hr").replace(/(\d+)\s*天/g,"$1 days").replace(/，/g,", ").replace(/。/g,".").replace(/；/g,"; ").replace(/：/g,": ").replace(/（/g," (").replace(/）/g,")").replace(/｜/g," | ").replace(/／/g," / ").replace(/\s{2,}/g," ").trim(),`${i}${l}${a}`}function tt(e){return window.alert(G(e))}function kt(e){return window.confirm(G(e))}function no(e,t){return window.prompt(G(e),t)}function Ji(e){return!!e?.closest?.('[data-i18n-ignore="true"], .mwi-member-note-cell, .mwi-talent-note-input, .mwi-member-cell.name, td.name, [data-role="character-name"], [data-role="guild-name"], .mwi-trial-player-note, .mwi-trial-group-person small, .mwi-trial-player strong, .mwi-trial-group-person strong, [data-role="player-name"]')}function Yi(e){if(K!=="en"||!e)return;let t=n=>{if(n.nodeType===Node.TEXT_NODE){let r=n.parentElement;if(!r||Ji(r))return;let l=G(n.nodeValue);l!==n.nodeValue&&(n.nodeValue=l);return}!(n instanceof Element)||Ji(n)||["aria-label","placeholder","title"].forEach(r=>{if(!n.hasAttribute(r))return;let l=n.getAttribute(r),s=G(l);s!==l&&n.setAttribute(r,s)})};if(e.nodeType===Node.TEXT_NODE){let n=e.parentElement;if(!n||Ji(n))return;let r=G(e.nodeValue);r!==e.nodeValue&&(e.nodeValue=r);return}if(!(e instanceof Element)&&!(e instanceof ShadowRoot))return;t(e);let i=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT),a=i.nextNode();for(;a;)t(a),a=i.nextNode()}function Xi(e){if(K!=="en"||!e||(Yi(e),bn.has(e)))return;bn.add(e);let t=new MutationObserver(i=>{i.forEach(a=>{a.addedNodes.forEach(Yi),a.type==="attributes"&&a.target instanceof Element&&Yi(a.target)})});t.observe(e,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["aria-label","placeholder","title"]}),qe(()=>t.disconnect())}function ro(){if(K!=="en")return;let e=[Ui];e.forEach(a=>{Xi(document.getElementById(a)?.shadowRoot)});let i=new MutationObserver(a=>{a.forEach(n=>{n.addedNodes.forEach(r=>{r instanceof Element&&(e.includes(r.id)&&Xi(r.shadowRoot),e.forEach(l=>{Xi(r.querySelector?.(`#${l}`)?.shadowRoot)}))})})});i.observe(document.documentElement,{subtree:!0,childList:!0}),qe(()=>i.disconnect())}ro();let J="__mwiBuildScore",oo="mwi_buildscore_updated",_n=3600*1e3,wn=1,lo=new Set(Fr),so=Object.freeze(["dining_room","library","dojo","gym","armory","archery_range","mystical_study"]),yn=Object.freeze({enhancingLevel:125,laboratoryLevel:6,enhancerBonus:5.42,teaEnhancing:!1,teaSuperEnhancing:!1,teaUltraEnhancing:!0,teaBlessed:!0,priceAskBidRatio:1}),g=Object.freeze({LIFE:"life",BATTLE:"battle"}),Sn=Object.freeze(["/item_locations/milking_tool","/item_locations/foraging_tool","/item_locations/woodcutting_tool","/item_locations/cheesesmithing_tool","/item_locations/crafting_tool","/item_locations/tailoring_tool","/item_locations/cooking_tool","/item_locations/brewing_tool","/item_locations/alchemy_tool","/item_locations/enhancing_tool"]),co=new Set(Sn),Tt=new Set(["/item_locations/neck","/item_locations/earrings","/item_locations/ring","/item_locations/charm"]),mo=Object.freeze([{visualSlot:"back",label:"背部",slotHrids:["/item_locations/back"]},{visualSlot:"head",label:"頭部",slotHrids:["/item_locations/head"]},{visualSlot:"trinket",label:"飾品",slotHrids:["/item_locations/trinket"]},{visualSlot:"weapon",label:"武器",slotHrids:["/item_locations/two_hand","/item_locations/main_hand"]},{visualSlot:"body",label:"身體",slotHrids:["/item_locations/body"]},{visualSlot:"offhand",label:"副手",slotHrids:["/item_locations/off_hand"]},{visualSlot:"hands",label:"手部",slotHrids:["/item_locations/hands"]},{visualSlot:"legs",label:"腿部",slotHrids:["/item_locations/legs"]},{visualSlot:"pouch",label:"袋子",slotHrids:["/item_locations/pouch"]},{visualSlot:"feet",label:"腳部",slotHrids:["/item_locations/feet"]}]),ii=Object.freeze({"/item_locations/back":"背部","/item_locations/head":"頭部","/item_locations/trinket":"飾品","/item_locations/neck":"項鍊","/item_locations/main_hand":"主手","/item_locations/two_hand":"雙手武器","/item_locations/off_hand":"副手","/item_locations/body":"身體","/item_locations/earrings":"耳環","/item_locations/hands":"手部","/item_locations/legs":"腿部","/item_locations/pouch":"袋子","/item_locations/ring":"戒指","/item_locations/feet":"腳部","/item_locations/charm":"護符","/item_locations/milking_tool":"擠奶工具","/item_locations/foraging_tool":"採集工具","/item_locations/woodcutting_tool":"伐木工具","/item_locations/cheesesmithing_tool":"乳酪鍛造工具","/item_locations/crafting_tool":"製作工具","/item_locations/tailoring_tool":"縫紉工具","/item_locations/cooking_tool":"烹飪工具","/item_locations/brewing_tool":"沖泡工具","/item_locations/alchemy_tool":"煉金工具","/item_locations/enhancing_tool":"強化工具"}),ai=[["/guild_skilling/milking","擠奶"],["/guild_skilling/foraging","採集"],["/guild_skilling/woodcutting","伐木"],["/guild_skilling/cheesesmithing","乳酪鍛造"],["/guild_skilling/crafting","製作"],["/guild_skilling/tailoring","縫紉"],["/guild_skilling/cooking","烹飪"],["/guild_skilling/brewing","沖泡"],["/guild_skilling/alchemy","煉金"],["/guild_skilling/enhancing","強化"]],ni=[["/guild_combat/badger","獾"],["/guild_combat/chameleon","變色龍"],["/guild_combat/jellyfish","水母"],["/guild_combat/hedgehog","刺蝟"],["/guild_combat/swarm","蟲群"]],ve=[{hrid:"/skills/milking",key:"milking",name:"擠奶"},{hrid:"/skills/foraging",key:"foraging",name:"採集"},{hrid:"/skills/woodcutting",key:"woodcutting",name:"伐木"},{hrid:"/skills/cheesesmithing",key:"cheesesmithing",name:"乳酪鍛造"},{hrid:"/skills/crafting",key:"crafting",name:"製作"},{hrid:"/skills/tailoring",key:"tailoring",name:"縫紉"},{hrid:"/skills/cooking",key:"cooking",name:"烹飪"},{hrid:"/skills/brewing",key:"brewing",name:"沖泡"},{hrid:"/skills/alchemy",key:"alchemy",name:"煉金"},{hrid:"/skills/enhancing",key:"enhancing",name:"強化"}],Me=[{hrid:"/skills/attack",key:"attack",name:"攻擊"},{hrid:"/skills/defense",key:"defense",name:"防禦"},{hrid:"/skills/melee",key:"melee",name:"近戰"},{hrid:"/skills/ranged",key:"ranged",name:"遠程"},{hrid:"/skills/magic",key:"magic",name:"魔法"}],uo=Object.freeze({stamina:"/skills/stamina",intelligence:"/skills/intelligence",attack:"/skills/attack",defense:"/skills/defense",melee:"/skills/melee",ranged:"/skills/ranged",magic:"/skills/magic"}),Be=[{hrid:"/abilities/speed_aura",key:"speedAura",name:"速度光環"},{hrid:"/abilities/guardian_aura",key:"guardianAura",name:"守護光環"},{hrid:"/abilities/fierce_aura",key:"fierceAura",name:"物理光環"},{hrid:"/abilities/critical_aura",key:"criticalAura",name:"暴擊光環"},{hrid:"/abilities/mystic_aura",key:"mysticAura",name:"元素光環"},{hrid:"/abilities/revive",key:"revive",name:"復活"},{hrid:"/abilities/insanity",key:"insanity",name:"瘋狂"}],ri=Object.freeze(["/abilities/speed_aura","/abilities/guardian_aura","/abilities/fierce_aura","/abilities/critical_aura","/abilities/mystic_aura","/abilities/revive","/abilities/insanity"]).map(e=>Be.find(t=>t.hrid===e)).filter(Boolean),vn=Object.freeze(["/abilities/fierce_aura","/abilities/critical_aura","/abilities/speed_aura","/abilities/mystic_aura","/abilities/revive","/abilities/insanity","/abilities/guardian_aura","/abilities/invincible"]),it=new Set(vn),po=0,fo=Object.freeze([{hrid:"/combat_trigger_dependencies/self",name:"自己",isSingleTarget:!0,isMultiTarget:!1,sortIndex:1},{hrid:"/combat_trigger_dependencies/targeted_enemy",name:"目標敵人",isSingleTarget:!0,isMultiTarget:!1,sortIndex:2},{hrid:"/combat_trigger_dependencies/all_enemies",name:"所有敵人",isSingleTarget:!1,isMultiTarget:!0,sortIndex:3},{hrid:"/combat_trigger_dependencies/all_allies",name:"所有隊友",isSingleTarget:!1,isMultiTarget:!0,sortIndex:4}]),Qi=Object.freeze([{hrid:"/combat_trigger_comparators/greater_than_equal",name:"大於或等於",allowValue:!0,sortIndex:1},{hrid:"/combat_trigger_comparators/less_than_equal",name:"小於或等於",allowValue:!0,sortIndex:2},{hrid:"/combat_trigger_comparators/is_active",name:"啟用中",allowValue:!1,sortIndex:3},{hrid:"/combat_trigger_comparators/is_inactive",name:"未啟用",allowValue:!1,sortIndex:4}]),xn=Object.freeze([["current_hp","目前生命值",!0,!0,["greater_than_equal","less_than_equal"]],["missing_hp","已損失生命值",!0,!0,["greater_than_equal","less_than_equal"]],["current_mp","目前魔力值",!0,!0,["greater_than_equal","less_than_equal"]],["missing_mp","已損失魔力值",!0,!0,["greater_than_equal","less_than_equal"]],["number_of_active_units","存活單位數",!1,!0,["greater_than_equal","less_than_equal"]],["number_of_dead_units","死亡單位數",!1,!0,["greater_than_equal","less_than_equal"]],["lowest_hp_percentage","最低生命百分比",!1,!0,["greater_than_equal","less_than_equal"]],["stun_status","暈眩狀態",!0,!1,["is_active","is_inactive"]],["blind_status","致盲狀態",!0,!1,["is_active","is_inactive"]],["silence_status","沉默狀態",!0,!1,["is_active","is_inactive"]]].map(([e,t,i,a,n],r)=>({hrid:`/combat_trigger_conditions/${e}`,name:t,isSingleTarget:i,isMultiTarget:a,allowedComparatorHrids:n.map(l=>`/combat_trigger_comparators/${l}`),sortIndex:r+1}))),go=Object.freeze({"/combat_trigger_conditions/number_of_active_units":"存活單位數","/combat_trigger_conditions/number_of_dead_units":"死亡單位數","/combat_trigger_conditions/lowest_hp_percentage":"最低生命值百分比","/combat_trigger_conditions/missing_hp":"已損失生命值","/combat_trigger_conditions/current_hp":"目前生命值","/combat_trigger_conditions/missing_mp":"已消耗魔力","/combat_trigger_conditions/current_mp":"目前魔力","/combat_trigger_conditions/weaken":"虛弱","/combat_trigger_conditions/fury":"狂怒","/combat_trigger_conditions/curse":"詛咒","/combat_trigger_conditions/enrage":"激怒","/combat_trigger_conditions/blind_status":"致盲狀態","/combat_trigger_conditions/silence_status":"沉默狀態","/combat_trigger_conditions/stun_status":"暈眩狀態"}),Zi=Object.freeze(["坦","補","槍","劍","錘","水法","自然法","火法","弩","弓","生活"]),ea=Object.freeze(["1","2"]),Ct=Object.freeze([...ve.map(e=>({key:`levels.life.${e.key}`,statKey:e.key,hrid:e.hrid,label:e.name,group:"life",groupLabel:"生活技能"})),...Me.map(e=>({key:`levels.combat.${e.key}`,statKey:e.key,hrid:e.hrid,label:e.name,group:"combat",groupLabel:"戰鬥技能"})),...Be.map(e=>({key:`levels.abilities.${e.key}`,statKey:e.key,hrid:e.hrid,label:e.name,group:"ability",groupLabel:"光環與復活"}))]),ta=new Map(Ct.map(e=>[e.key,e])),ia=Object.freeze({"/abilities/aqua_arrow":"流水箭","/abilities/berserk":"狂暴","/abilities/cleave":"分裂斬","/abilities/crippling_slash":"致殘斬","/abilities/critical_aura":"暴擊光環","/abilities/elemental_affinity":"元素增幅","/abilities/elusiveness":"閃避","/abilities/entangle":"纏繞","/abilities/fierce_aura":"物理光環","/abilities/fireball":"火球","/abilities/firestorm":"火焰風暴","/abilities/flame_arrow":"烈焰箭","/abilities/flame_blast":"熔岩爆裂","/abilities/fracturing_impact":"碎裂衝擊","/abilities/frenzy":"狂速","/abilities/frost_surge":"冰霜爆裂","/abilities/guardian_aura":"守護光環","/abilities/heal":"自愈術","/abilities/ice_spear":"冰槍術","/abilities/impale":"透骨之刺","/abilities/insanity":"瘋狂","/abilities/invincible":"無敵","/abilities/life_drain":"生命吸取","/abilities/maim":"血刃斬","/abilities/mana_spring":"法力噴泉","/abilities/minor_heal":"初級自愈術","/abilities/mystic_aura":"元素光環","/abilities/natures_veil":"自然菌幕","/abilities/penetrating_shot":"貫穿射擊","/abilities/penetrating_strike":"貫心之刺","/abilities/pestilent_shot":"疫病射擊","/abilities/poke":"破膽之刺","/abilities/precision":"精確","/abilities/promote":"晉升","/abilities/provoke":"挑釁","/abilities/puncture":"破甲之刺","/abilities/quick_aid":"快速治療術","/abilities/quick_shot":"快速射擊","/abilities/rain_of_arrows":"箭雨","/abilities/rejuvenate":"群體治療術","/abilities/retribution":"懲戒","/abilities/revive":"復活","/abilities/scratch":"爪影斬","/abilities/shield_bash":"盾擊","/abilities/silencing_shot":"沉默之箭","/abilities/smack":"重碾","/abilities/smoke_burst":"煙爆滅影","/abilities/speed_aura":"速度光環","/abilities/spike_shell":"尖刺防護","/abilities/steady_shot":"穩定射擊","/abilities/stunning_blow":"重錘","/abilities/sweep":"重掃","/abilities/taunt":"嘲諷","/abilities/toughness":"堅韌","/abilities/toxic_pollen":"劇毒粉塵","/abilities/vampirism":"吸血","/abilities/water_strike":"流水衝擊","/guild_combat/badger":"試煉獾","/guild_combat/chameleon":"試煉變色龍","/guild_combat/hedgehog":"試煉刺蝟","/guild_combat/jellyfish":"試煉水母","/guild_combat/swarm":"試煉蟲群","/items/abyssal_essence":"地獄精華","/items/acrobatic_hood":"雜技師兜帽","/items/acrobatic_hood_refined":"雜技師兜帽 ★","/items/acrobats_ribbon":"雜技師綵帶","/items/advanced_alchemy_charm":"高階煉金護符","/items/advanced_attack_charm":"高階攻擊護符","/items/advanced_beacon":"進階探照燈","/items/advanced_brewing_charm":"高階沖泡護符","/items/advanced_cheesesmithing_charm":"高階乳酪鍛造護符","/items/advanced_coffee_crate":"進階咖啡箱","/items/advanced_cooking_charm":"高階烹飪護符","/items/advanced_crafting_charm":"高階製作護符","/items/advanced_defense_charm":"高階防禦護符","/items/advanced_enhancing_charm":"高階強化護符","/items/advanced_food_crate":"進階食物箱","/items/advanced_foraging_charm":"高階採摘護符","/items/advanced_intelligence_charm":"高階智力護符","/items/advanced_magic_charm":"高階魔法護符","/items/advanced_melee_charm":"高階近戰護符","/items/advanced_milking_charm":"高階擠奶護符","/items/advanced_ranged_charm":"高階遠程護符","/items/advanced_shroud":"進階斗篷","/items/advanced_stamina_charm":"高階耐力護符","/items/advanced_tailoring_charm":"高階縫紉護符","/items/advanced_task_badge":"高階任務徽章","/items/advanced_tea_crate":"進階茶葉箱","/items/advanced_torch":"進階火把","/items/advanced_woodcutting_charm":"高階伐木護符","/items/alchemists_bottoms":"煉金師下裝","/items/alchemists_top":"煉金師上衣","/items/alchemy_essence":"煉金精華","/items/alchemy_tea":"煉金茶","/items/amber":"琥珀","/items/amethyst":"紫水晶","/items/anchorbound_plate_body":"錨定胸甲","/items/anchorbound_plate_body_refined":"錨定胸甲 ★","/items/anchorbound_plate_legs":"錨定腿甲","/items/anchorbound_plate_legs_refined":"錨定腿甲 ★","/items/apple":"蘋果","/items/apple_gummy":"蘋果軟糖","/items/apple_yogurt":"蘋果優格","/items/aqua_arrow":"流水箭","/items/aqua_essence":"海洋精華","/items/arabica_coffee_bean":"低階咖啡豆","/items/arcane_bow":"神秘弓","/items/arcane_crossbow":"神秘弩","/items/arcane_fire_staff":"神秘火法杖","/items/arcane_log":"神秘原木","/items/arcane_lumber":"神秘木板","/items/arcane_nature_staff":"神秘自然法杖","/items/arcane_shield":"神秘盾","/items/arcane_water_staff":"神秘水法杖","/items/artificer_cape":"工匠披風","/items/artificer_cape_refined":"工匠披風 ★","/items/artisan_tea":"工匠茶","/items/attack_coffee":"攻擊咖啡","/items/azure_alembic":"蔚藍蒸餾器","/items/azure_boots":"蔚藍靴","/items/azure_brush":"蔚藍刷子","/items/azure_buckler":"蔚藍圓盾","/items/azure_bulwark":"蔚藍重盾","/items/azure_cheese":"蔚藍乳酪","/items/azure_chisel":"蔚藍鑿子","/items/azure_enhancer":"蔚藍強化器","/items/azure_gauntlets":"蔚藍護手","/items/azure_hammer":"蔚藍錘子","/items/azure_hatchet":"蔚藍斧頭","/items/azure_helmet":"蔚藍頭盔","/items/azure_mace":"蔚藍釘頭錘","/items/azure_milk":"蔚藍牛奶","/items/azure_needle":"蔚藍針","/items/azure_plate_body":"蔚藍胸甲","/items/azure_plate_legs":"蔚藍腿甲","/items/azure_pot":"蔚藍壺","/items/azure_shears":"蔚藍剪刀","/items/azure_spatula":"蔚藍鍋鏟","/items/azure_spear":"蔚藍長槍","/items/azure_sword":"蔚藍劍","/items/bag_of_10_cowbells":"牛鈴袋 (10個)","/items/bamboo_boots":"竹靴","/items/bamboo_branch":"竹子","/items/bamboo_fabric":"竹子布料","/items/bamboo_gloves":"竹手套","/items/bamboo_hat":"竹帽","/items/bamboo_robe_bottoms":"竹袍裙","/items/bamboo_robe_top":"竹袍服","/items/basic_alchemy_charm":"基礎煉金護符","/items/basic_attack_charm":"基礎攻擊護符","/items/basic_beacon":"基礎探照燈","/items/basic_brewing_charm":"基礎沖泡護符","/items/basic_cheesesmithing_charm":"基礎乳酪鍛造護符","/items/basic_coffee_crate":"基礎咖啡箱","/items/basic_cooking_charm":"基礎烹飪護符","/items/basic_crafting_charm":"基礎製作護符","/items/basic_defense_charm":"基礎防禦護符","/items/basic_enhancing_charm":"基礎強化護符","/items/basic_food_crate":"基礎食物箱","/items/basic_foraging_charm":"基礎採摘護符","/items/basic_intelligence_charm":"基礎智力護符","/items/basic_magic_charm":"基礎魔法護符","/items/basic_melee_charm":"基礎近戰護符","/items/basic_milking_charm":"基礎擠奶護符","/items/basic_ranged_charm":"基礎遠程護符","/items/basic_shroud":"基礎斗篷","/items/basic_stamina_charm":"基礎耐力護符","/items/basic_tailoring_charm":"基礎縫紉護符","/items/basic_task_badge":"基礎任務徽章","/items/basic_tea_crate":"基礎茶葉箱","/items/basic_torch":"基礎火把","/items/basic_woodcutting_charm":"基礎伐木護符","/items/bear_essence":"熊熊精華","/items/beast_boots":"野獸靴","/items/beast_bracers":"野獸護腕","/items/beast_chaps":"野獸皮褲","/items/beast_hide":"野獸皮","/items/beast_hood":"野獸兜帽","/items/beast_leather":"野獸皮革","/items/beast_tunic":"野獸皮衣","/items/berserk":"狂暴","/items/birch_bow":"樺木弓","/items/birch_crossbow":"樺木弩","/items/birch_fire_staff":"樺木火法杖","/items/birch_log":"白樺原木","/items/birch_lumber":"白樺木板","/items/birch_nature_staff":"樺木自然法杖","/items/birch_shield":"樺木盾","/items/birch_water_staff":"樺木水法杖","/items/bishops_codex":"主教法典","/items/bishops_codex_refined":"主教法典 ★","/items/bishops_scroll":"主教卷軸","/items/black_bear_fluff":"黑熊絨","/items/black_bear_shoes":"黑熊鞋","/items/black_tea_leaf":"黑茶葉","/items/blackberry":"黑莓","/items/blackberry_cake":"黑莓蛋糕","/items/blackberry_donut":"黑莓甜甜圈","/items/blazing_trident":"熾焰三叉戟","/items/blazing_trident_refined":"熾焰三叉戟 ★","/items/blessed_tea":"福氣茶","/items/blooming_trident":"綻放三叉戟","/items/blooming_trident_refined":"綻放三叉戟 ★","/items/blue_guild_credit":"藍色公會信用點","/items/blue_key_fragment":"藍色鑰匙碎片","/items/blueberry":"藍莓","/items/blueberry_cake":"藍莓蛋糕","/items/blueberry_donut":"藍莓甜甜圈","/items/branch_of_insight":"洞察之枝","/items/brewers_bottoms":"飲品師下裝","/items/brewers_top":"飲品師上衣","/items/brewing_essence":"沖泡精華","/items/brewing_tea":"沖泡茶","/items/brown_guild_credit":"棕色公會信用點","/items/brown_key_fragment":"棕色鑰匙碎片","/items/burble_alembic":"深紫蒸餾器","/items/burble_boots":"深紫靴","/items/burble_brush":"深紫刷子","/items/burble_buckler":"深紫圓盾","/items/burble_bulwark":"深紫重盾","/items/burble_cheese":"深紫乳酪","/items/burble_chisel":"深紫鑿子","/items/burble_enhancer":"深紫強化器","/items/burble_gauntlets":"深紫護手","/items/burble_hammer":"深紫錘子","/items/burble_hatchet":"深紫斧頭","/items/burble_helmet":"深紫頭盔","/items/burble_mace":"深紫釘頭錘","/items/burble_milk":"深紫牛奶","/items/burble_needle":"深紫針","/items/burble_plate_body":"深紫胸甲","/items/burble_plate_legs":"深紫腿甲","/items/burble_pot":"深紫壺","/items/burble_shears":"深紫剪刀","/items/burble_spatula":"深紫鍋鏟","/items/burble_spear":"深紫長槍","/items/burble_sword":"深紫劍","/items/burble_tea_leaf":"紫茶葉","/items/burning_key_fragment":"燃燒鑰匙碎片","/items/butter_of_proficiency":"精通之油","/items/catalyst_of_coinification":"點金催化劑","/items/catalyst_of_decomposition":"分解催化劑","/items/catalyst_of_transmutation":"轉化催化劑","/items/catalytic_tea":"催化茶","/items/cedar_bow":"雪松弓","/items/cedar_crossbow":"雪松弩","/items/cedar_fire_staff":"雪松火法杖","/items/cedar_log":"雪松原木","/items/cedar_lumber":"雪松木板","/items/cedar_nature_staff":"雪松自然法杖","/items/cedar_shield":"雪松盾","/items/cedar_water_staff":"雪松水法杖","/items/celestial_alembic":"星空蒸餾器","/items/celestial_brush":"星空刷子","/items/celestial_chisel":"星空鑿子","/items/celestial_enhancer":"星空強化器","/items/celestial_hammer":"星空錘子","/items/celestial_hatchet":"星空斧頭","/items/celestial_needle":"星空針","/items/celestial_pot":"星空壺","/items/celestial_shears":"星空剪刀","/items/celestial_spatula":"星空鍋鏟","/items/centaur_boots":"半人馬靴","/items/centaur_hoof":"半人馬蹄","/items/chance_cape":"機緣披風","/items/chance_cape_refined":"機緣披風 ★","/items/channeling_coffee":"吟唱咖啡","/items/chaotic_chain":"混沌鎖鏈","/items/chaotic_flail":"混沌連枷","/items/chaotic_flail_refined":"混沌連枷 ★","/items/cheese":"乳酪","/items/cheese_alembic":"乳酪蒸餾器","/items/cheese_boots":"乳酪靴","/items/cheese_brush":"乳酪刷子","/items/cheese_buckler":"乳酪圓盾","/items/cheese_bulwark":"乳酪重盾","/items/cheese_chisel":"乳酪鑿子","/items/cheese_enhancer":"乳酪強化器","/items/cheese_gauntlets":"乳酪護手","/items/cheese_hammer":"乳酪錘子","/items/cheese_hatchet":"乳酪斧頭","/items/cheese_helmet":"乳酪頭盔","/items/cheese_mace":"乳酪釘頭錘","/items/cheese_needle":"乳酪針","/items/cheese_plate_body":"乳酪胸甲","/items/cheese_plate_legs":"乳酪腿甲","/items/cheese_pot":"乳酪壺","/items/cheese_shears":"乳酪剪刀","/items/cheese_spatula":"乳酪鍋鏟","/items/cheese_spear":"乳酪長槍","/items/cheese_sword":"乳酪劍","/items/cheesemakers_bottoms":"乳酪師下裝","/items/cheesemakers_top":"乳酪師上衣","/items/cheesesmithing_essence":"乳酪鍛造精華","/items/cheesesmithing_tea":"乳酪鍛造茶","/items/chefs_bottoms":"廚師下裝","/items/chefs_top":"廚師上衣","/items/chimerical_chest":"奇幻寶箱","/items/chimerical_chest_key":"奇幻寶箱鑰匙","/items/chimerical_entry_key":"奇幻鑰匙","/items/chimerical_essence":"奇幻精華","/items/chimerical_quiver":"奇幻箭袋","/items/chimerical_quiver_refined":"奇幻箭袋 ★","/items/chimerical_refinement_chest":"奇幻精煉寶箱","/items/chimerical_refinement_shard":"奇幻精煉碎片","/items/chimerical_token":"奇幻代幣","/items/chrono_gloves":"時空手套","/items/chrono_sphere":"時空球","/items/cleave":"分裂斬","/items/cocoon":"蠶繭","/items/coin":"金幣","/items/collectors_boots":"收藏家靴","/items/colossus_core":"巨像核心","/items/colossus_plate_body":"巨像胸甲","/items/colossus_plate_legs":"巨像腿甲","/items/cooking_essence":"烹飪精華","/items/cooking_tea":"烹飪茶","/items/corsair_crest":"掠奪者徽章","/items/corsair_helmet":"掠奪者頭盔","/items/corsair_helmet_refined":"掠奪者頭盔 ★","/items/cotton":"棉花","/items/cotton_boots":"棉靴","/items/cotton_fabric":"棉花布料","/items/cotton_gloves":"棉手套","/items/cotton_hat":"棉帽","/items/cotton_robe_bottoms":"棉袍裙","/items/cotton_robe_top":"棉袍服","/items/cowbell":"牛鈴","/items/crab_pincer":"蟹鉗","/items/crafters_bottoms":"工匠下裝","/items/crafters_top":"工匠上衣","/items/crafting_essence":"製作精華","/items/crafting_tea":"製作茶","/items/crimson_alembic":"絳紅蒸餾器","/items/crimson_boots":"絳紅靴","/items/crimson_brush":"絳紅刷子","/items/crimson_buckler":"絳紅圓盾","/items/crimson_bulwark":"絳紅重盾","/items/crimson_cheese":"絳紅乳酪","/items/crimson_chisel":"絳紅鑿子","/items/crimson_enhancer":"絳紅強化器","/items/crimson_gauntlets":"絳紅護手","/items/crimson_hammer":"絳紅錘子","/items/crimson_hatchet":"絳紅斧頭","/items/crimson_helmet":"絳紅頭盔","/items/crimson_mace":"絳紅釘頭錘","/items/crimson_milk":"絳紅牛奶","/items/crimson_needle":"絳紅針","/items/crimson_plate_body":"絳紅胸甲","/items/crimson_plate_legs":"絳紅腿甲","/items/crimson_pot":"絳紅壺","/items/crimson_shears":"絳紅剪刀","/items/crimson_spatula":"絳紅鍋鏟","/items/crimson_spear":"絳紅長槍","/items/crimson_sword":"絳紅劍","/items/crippling_slash":"致殘斬","/items/critical_aura":"暴擊光環","/items/critical_coffee":"暴擊咖啡","/items/crushed_amber":"琥珀碎片","/items/crushed_amethyst":"紫水晶碎片","/items/crushed_garnet":"石榴石碎片","/items/crushed_jade":"翡翠碎片","/items/crushed_moonstone":"月亮石碎片","/items/crushed_pearl":"珍珠碎片","/items/crushed_philosophers_stone":"賢者之石碎片","/items/crushed_sunstone":"太陽石碎片","/items/culinary_cape":"廚師披風","/items/culinary_cape_refined":"廚師披風 ★","/items/cupcake":"紙杯蛋糕","/items/cursed_ball":"詛咒之球","/items/cursed_bow":"咒怨之弓","/items/cursed_bow_refined":"咒怨之弓 ★","/items/dairyhands_bottoms":"擠奶工下裝","/items/dairyhands_top":"擠奶工上衣","/items/damaged_anchor":"破損船錨","/items/dark_key_fragment":"黑暗鑰匙碎片","/items/defense_coffee":"防禦咖啡","/items/demonic_core":"惡魔核心","/items/demonic_plate_body":"惡魔胸甲","/items/demonic_plate_legs":"惡魔腿甲","/items/dodocamel_gauntlets":"渡渡駝護手","/items/dodocamel_gauntlets_refined":"渡渡駝護手 ★","/items/dodocamel_plume":"渡渡駝之翎","/items/donut":"甜甜圈","/items/dragon_fruit":"火龍果","/items/dragon_fruit_gummy":"火龍果軟糖","/items/dragon_fruit_yogurt":"火龍果優格","/items/earrings_of_armor":"護甲耳環","/items/earrings_of_critical_strike":"暴擊耳環","/items/earrings_of_essence_find":"精華發現耳環","/items/earrings_of_gathering":"採集耳環","/items/earrings_of_rare_find":"稀有發現耳環","/items/earrings_of_regeneration":"恢復耳環","/items/earrings_of_resistance":"抗性耳環","/items/efficiency_tea":"效率茶","/items/egg":"雞蛋","/items/elemental_affinity":"元素增幅","/items/elusiveness":"閃避","/items/emp_tea_leaf":"虛空茶葉","/items/enchanted_chest":"秘法寶箱","/items/enchanted_chest_key":"秘法寶箱鑰匙","/items/enchanted_cloak":"秘法披風","/items/enchanted_cloak_refined":"秘法披風 ★","/items/enchanted_entry_key":"秘法鑰匙","/items/enchanted_essence":"秘法精華","/items/enchanted_gloves":"附魔手套","/items/enchanted_refinement_chest":"秘法精煉寶箱","/items/enchanted_refinement_shard":"秘法精煉碎片","/items/enchanted_token":"秘法代幣","/items/enhancers_bottoms":"強化師下裝","/items/enhancers_top":"強化師上衣","/items/enhancing_essence":"強化精華","/items/enhancing_tea":"強化茶","/items/entangle":"纏繞","/items/excelsa_coffee_bean":"特級咖啡豆","/items/expert_alchemy_charm":"專家煉金護符","/items/expert_attack_charm":"專家攻擊護符","/items/expert_beacon":"專家探照燈","/items/expert_brewing_charm":"專家沖泡護符","/items/expert_cheesesmithing_charm":"專家乳酪鍛造護符","/items/expert_coffee_crate":"專家咖啡箱","/items/expert_cooking_charm":"專家烹飪護符","/items/expert_crafting_charm":"專家制作護符","/items/expert_defense_charm":"專家防禦護符","/items/expert_enhancing_charm":"專家強化護符","/items/expert_food_crate":"專家食物箱","/items/expert_foraging_charm":"專家採摘護符","/items/expert_intelligence_charm":"專家智力護符","/items/expert_magic_charm":"專家魔法護符","/items/expert_melee_charm":"專家近戰護符","/items/expert_milking_charm":"專家擠奶護符","/items/expert_ranged_charm":"專家遠程護符","/items/expert_shroud":"專家斗篷","/items/expert_stamina_charm":"專家耐力護符","/items/expert_tailoring_charm":"專家縫紉護符","/items/expert_task_badge":"專家任務徽章","/items/expert_tea_crate":"專家茶葉箱","/items/expert_torch":"專家火把","/items/expert_woodcutting_charm":"專家伐木護符","/items/eye_of_the_watcher":"觀察者之眼","/items/eye_watch":"掌上監工","/items/eyessence":"眼精華","/items/fierce_aura":"物理光環","/items/fieriosa_coffee_bean":"火山咖啡豆","/items/fighter_necklace":"戰士項鍊","/items/fireball":"火球","/items/firestorm":"火焰風暴","/items/flame_arrow":"烈焰箭","/items/flame_blast":"熔岩爆裂","/items/flaming_cloth":"烈焰織物","/items/flaming_robe_bottoms":"烈焰袍裙","/items/flaming_robe_top":"烈焰袍服","/items/flax":"亞麻","/items/fluffy_red_hat":"蓬鬆紅帽子","/items/foragers_bottoms":"採摘者下裝","/items/foragers_top":"採摘者上衣","/items/foraging_essence":"採摘精華","/items/foraging_tea":"採摘茶","/items/fracturing_impact":"碎裂衝擊","/items/frenzy":"狂速","/items/frost_sphere":"冰霜球","/items/frost_staff":"冰霜法杖","/items/frost_surge":"冰霜爆裂","/items/furious_spear":"狂怒長槍","/items/furious_spear_refined":"狂怒長槍 ★","/items/garnet":"石榴石","/items/gatherer_cape":"採集者披風","/items/gatherer_cape_refined":"採集者披風 ★","/items/gathering_tea":"採集茶","/items/gator_vest":"鱷魚馬甲","/items/giant_pouch":"巨大袋子","/items/ginkgo_bow":"銀杏弓","/items/ginkgo_crossbow":"銀杏弩","/items/ginkgo_fire_staff":"銀杏火法杖","/items/ginkgo_log":"銀杏原木","/items/ginkgo_lumber":"銀杏木板","/items/ginkgo_nature_staff":"銀杏自然法杖","/items/ginkgo_shield":"銀杏盾","/items/ginkgo_water_staff":"銀杏水法杖","/items/gluttonous_energy":"貪食能量","/items/gluttonous_pouch":"貪食之袋","/items/gobo_boomstick":"哥布林火棍","/items/gobo_boots":"哥布林靴","/items/gobo_bracers":"哥布林護腕","/items/gobo_chaps":"哥布林皮褲","/items/gobo_defender":"哥布林防禦者","/items/gobo_essence":"哥布林精華","/items/gobo_hide":"哥布林皮","/items/gobo_hood":"哥布林兜帽","/items/gobo_leather":"哥布林皮革","/items/gobo_rag":"哥布林抹布","/items/gobo_shooter":"哥布林彈弓","/items/gobo_slasher":"哥布林關刀","/items/gobo_smasher":"哥布林狼牙棒","/items/gobo_stabber":"哥布林長劍","/items/gobo_tunic":"哥布林皮衣","/items/goggles":"護目鏡","/items/gold_guild_credit":"金色公會信用點","/items/golem_essence":"魔像精華","/items/gourmet_tea":"美食茶","/items/grandmaster_alchemy_charm":"宗師煉金護符","/items/grandmaster_attack_charm":"宗師攻擊護符","/items/grandmaster_brewing_charm":"宗師沖泡護符","/items/grandmaster_cheesesmithing_charm":"宗師乳酪鍛造護符","/items/grandmaster_cooking_charm":"宗師烹飪護符","/items/grandmaster_crafting_charm":"宗師製作護符","/items/grandmaster_defense_charm":"宗師防禦護符","/items/grandmaster_enhancing_charm":"宗師強化護符","/items/grandmaster_foraging_charm":"宗師採摘護符","/items/grandmaster_intelligence_charm":"宗師智力護符","/items/grandmaster_magic_charm":"宗師魔法護符","/items/grandmaster_melee_charm":"宗師近戰護符","/items/grandmaster_milking_charm":"宗師擠奶護符","/items/grandmaster_ranged_charm":"宗師遠程護符","/items/grandmaster_stamina_charm":"宗師耐力護符","/items/grandmaster_tailoring_charm":"宗師縫紉護符","/items/grandmaster_woodcutting_charm":"宗師伐木護符","/items/granite_bludgeon":"花崗岩大棒","/items/green_guild_credit":"綠色公會信用點","/items/green_key_fragment":"綠色鑰匙碎片","/items/green_tea_leaf":"綠茶葉","/items/griffin_bulwark":"獅鷲重盾","/items/griffin_bulwark_refined":"獅鷲重盾 ★","/items/griffin_chaps":"獅鷲皮褲","/items/griffin_leather":"獅鷲之皮","/items/griffin_talon":"獅鷲之爪","/items/griffin_tunic":"獅鷲皮衣","/items/grizzly_bear_fluff":"棕熊絨","/items/grizzly_bear_shoes":"棕熊鞋","/items/guardian_aura":"守護光環","/items/guild_token":"公會代幣","/items/gummy":"軟糖","/items/guzzling_energy":"暴飲能量","/items/guzzling_pouch":"暴飲之囊","/items/heal":"自愈術","/items/holy_alembic":"神聖蒸餾器","/items/holy_boots":"神聖靴","/items/holy_brush":"神聖刷子","/items/holy_buckler":"神聖圓盾","/items/holy_bulwark":"神聖重盾","/items/holy_cheese":"神聖乳酪","/items/holy_chisel":"神聖鑿子","/items/holy_enhancer":"神聖強化器","/items/holy_gauntlets":"神聖護手","/items/holy_hammer":"神聖錘子","/items/holy_hatchet":"神聖斧頭","/items/holy_helmet":"神聖頭盔","/items/holy_mace":"神聖釘頭錘","/items/holy_milk":"神聖牛奶","/items/holy_needle":"神聖針","/items/holy_plate_body":"神聖胸甲","/items/holy_plate_legs":"神聖腿甲","/items/holy_pot":"神聖壺","/items/holy_shears":"神聖剪刀","/items/holy_spatula":"神聖鍋鏟","/items/holy_spear":"神聖長槍","/items/holy_sword":"神聖劍","/items/ice_spear":"冰槍術","/items/icy_cloth":"冰霜織物","/items/icy_robe_bottoms":"冰霜袍裙","/items/icy_robe_top":"冰霜袍服","/items/impale":"透骨之刺","/items/infernal_battlestaff":"煉獄法杖","/items/infernal_ember":"地獄餘燼","/items/insanity":"瘋狂","/items/intelligence_coffee":"智力咖啡","/items/invincible":"無敵","/items/jackalope_antler":"鹿角兔之角","/items/jackalope_staff":"鹿角兔之杖","/items/jade":"翡翠","/items/jungle_essence":"叢林精華","/items/knights_aegis":"騎士盾","/items/knights_aegis_refined":"騎士盾 ★","/items/knights_ingot":"騎士之錠","/items/kraken_chaps":"克拉肯皮褲","/items/kraken_chaps_refined":"克拉肯皮褲 ★","/items/kraken_fang":"克拉肯之牙","/items/kraken_leather":"克拉肯皮革","/items/kraken_tunic":"克拉肯皮衣","/items/kraken_tunic_refined":"克拉肯皮衣 ★","/items/labyrinth_essence":"迷宮精華","/items/labyrinth_refinement_chest":"迷宮精煉寶箱","/items/labyrinth_refinement_shard":"迷宮精煉碎片","/items/labyrinth_token":"迷宮代幣","/items/large_artisans_crate":"大工匠匣","/items/large_meteorite_cache":"大隕石艙","/items/large_pouch":"大袋子","/items/large_treasure_chest":"大寶箱","/items/liberica_coffee_bean":"高階咖啡豆","/items/life_drain":"生命吸取","/items/linen_boots":"亞麻靴","/items/linen_fabric":"亞麻布料","/items/linen_gloves":"亞麻手套","/items/linen_hat":"亞麻帽","/items/linen_robe_bottoms":"亞麻袍裙","/items/linen_robe_top":"亞麻袍服","/items/living_granite":"花崗岩","/items/log":"原木","/items/lucky_coffee":"幸運咖啡","/items/lumber":"木板","/items/lumberjacks_bottoms":"伐木工下裝","/items/lumberjacks_top":"伐木工上衣","/items/luna_robe_bottoms":"月神袍裙","/items/luna_robe_top":"月神袍服","/items/luna_wing":"月神翼","/items/maelstrom_plate_body":"怒濤胸甲","/items/maelstrom_plate_body_refined":"怒濤胸甲 ★","/items/maelstrom_plate_legs":"怒濤腿甲","/items/maelstrom_plate_legs_refined":"怒濤腿甲 ★","/items/maelstrom_plating":"怒濤甲片","/items/magic_coffee":"魔法咖啡","/items/magicians_cloth":"魔術師織物","/items/magicians_hat":"魔術師帽","/items/magicians_hat_refined":"魔術師帽 ★","/items/magnet":"磁鐵","/items/magnetic_gloves":"磁力手套","/items/magnifying_glass":"放大鏡","/items/maim":"血刃斬","/items/mana_spring":"法力噴泉","/items/manticore_shield":"蠍獅盾","/items/manticore_sting":"蠍獅之刺","/items/marine_chaps":"航海皮褲","/items/marine_scale":"海洋鱗片","/items/marine_tunic":"海洋皮衣","/items/marksman_bracers":"神射護腕","/items/marksman_bracers_refined":"神射護腕 ★","/items/marksman_brooch":"神射胸針","/items/marsberry":"火星莓","/items/marsberry_cake":"火星莓蛋糕","/items/marsberry_donut":"火星莓甜甜圈","/items/master_alchemy_charm":"大師煉金護符","/items/master_attack_charm":"大師攻擊護符","/items/master_brewing_charm":"大師沖泡護符","/items/master_cheesesmithing_charm":"大師乳酪鍛造護符","/items/master_cooking_charm":"大師烹飪護符","/items/master_crafting_charm":"大師製作護符","/items/master_defense_charm":"大師防禦護符","/items/master_enhancing_charm":"大師強化護符","/items/master_foraging_charm":"大師採摘護符","/items/master_intelligence_charm":"大師智力護符","/items/master_magic_charm":"大師魔法護符","/items/master_melee_charm":"大師近戰護符","/items/master_milking_charm":"大師擠奶護符","/items/master_ranged_charm":"大師遠程護符","/items/master_stamina_charm":"大師耐力護符","/items/master_tailoring_charm":"大師縫紉護符","/items/master_woodcutting_charm":"大師伐木護符","/items/medium_artisans_crate":"中工匠匣","/items/medium_meteorite_cache":"中隕石艙","/items/medium_pouch":"中袋子","/items/medium_treasure_chest":"中寶箱","/items/melee_coffee":"近戰咖啡","/items/milk":"牛奶","/items/milking_essence":"擠奶精華","/items/milking_tea":"擠奶茶","/items/minor_heal":"初級自愈術","/items/mirror_of_protection":"保護之鏡","/items/mooberry":"哞莓","/items/mooberry_cake":"哞莓蛋糕","/items/mooberry_donut":"哞莓甜甜圈","/items/moolong_tea_leaf":"哞龍茶葉","/items/moonstone":"月亮石","/items/mystic_aura":"元素光環","/items/natures_veil":"自然菌幕","/items/necklace_of_efficiency":"效率項鍊","/items/necklace_of_speed":"速度項鍊","/items/necklace_of_wisdom":"經驗項鍊","/items/orange":"橙子","/items/orange_gummy":"橙子軟糖","/items/orange_key_fragment":"橙色鑰匙碎片","/items/orange_yogurt":"橙子優格","/items/panda_fluff":"熊貓絨","/items/panda_gloves":"熊貓手套","/items/pathbreaker_boots":"開路者靴","/items/pathbreaker_boots_refined":"開路者靴 ★","/items/pathbreaker_lodestone":"開路者磁石","/items/pathfinder_boots":"探路者靴","/items/pathfinder_boots_refined":"探路者靴 ★","/items/pathfinder_lodestone":"探路者磁石","/items/pathseeker_boots":"尋路者靴","/items/pathseeker_boots_refined":"尋路者靴 ★","/items/pathseeker_lodestone":"尋路者磁石","/items/peach":"桃子","/items/peach_gummy":"桃子軟糖","/items/peach_yogurt":"桃子優格","/items/pearl":"珍珠","/items/penetrating_shot":"貫穿射擊","/items/penetrating_strike":"貫心之刺","/items/pestilent_shot":"疫病射擊","/items/philosophers_earrings":"賢者耳環","/items/philosophers_mirror":"賢者之鏡","/items/philosophers_necklace":"賢者項鍊","/items/philosophers_ring":"賢者戒指","/items/philosophers_stone":"賢者之石","/items/pincer_gloves":"蟹鉗手套","/items/pirate_chest":"海盜寶箱","/items/pirate_chest_key":"海盜寶箱鑰匙","/items/pirate_entry_key":"海盜鑰匙","/items/pirate_essence":"海盜精華","/items/pirate_refinement_chest":"海盜精煉寶箱","/items/pirate_refinement_shard":"海盜精煉碎片","/items/pirate_token":"海盜代幣","/items/plum":"李子","/items/plum_gummy":"李子軟糖","/items/plum_yogurt":"李子優格","/items/poke":"破膽之刺","/items/polar_bear_fluff":"北極熊絨","/items/polar_bear_shoes":"北極熊鞋","/items/precision":"精確","/items/prime_catalyst":"至高催化劑","/items/processing_tea":"加工茶","/items/provoke":"挑釁","/items/puncture":"破甲之刺","/items/purdoras_box_combat":"紫多拉之盒（戰鬥）","/items/purdoras_box_skilling":"紫多拉之盒（生活）","/items/purple_guild_credit":"紫色公會信用點","/items/purple_key_fragment":"紫色鑰匙碎片","/items/purpleheart_bow":"紫心弓","/items/purpleheart_crossbow":"紫心弩","/items/purpleheart_fire_staff":"紫心火法杖","/items/purpleheart_log":"紫心原木","/items/purpleheart_lumber":"紫心木板","/items/purpleheart_nature_staff":"紫心自然法杖","/items/purpleheart_shield":"紫心盾","/items/purpleheart_water_staff":"紫心水法杖","/items/purples_gift":"小紫牛的禮物","/items/quick_aid":"快速治療術","/items/quick_shot":"快速射擊","/items/radiant_boots":"光輝靴","/items/radiant_fabric":"光輝布料","/items/radiant_fiber":"光輝纖維","/items/radiant_gloves":"光輝手套","/items/radiant_hat":"光輝帽","/items/radiant_robe_bottoms":"光輝袍裙","/items/radiant_robe_top":"光輝袍服","/items/rain_of_arrows":"箭雨","/items/rainbow_alembic":"彩虹蒸餾器","/items/rainbow_boots":"彩虹靴","/items/rainbow_brush":"彩虹刷子","/items/rainbow_buckler":"彩虹圓盾","/items/rainbow_bulwark":"彩虹重盾","/items/rainbow_cheese":"彩虹乳酪","/items/rainbow_chisel":"彩虹鑿子","/items/rainbow_enhancer":"彩虹強化器","/items/rainbow_gauntlets":"彩虹護手","/items/rainbow_hammer":"彩虹錘子","/items/rainbow_hatchet":"彩虹斧頭","/items/rainbow_helmet":"彩虹頭盔","/items/rainbow_mace":"彩虹釘頭錘","/items/rainbow_milk":"彩虹牛奶","/items/rainbow_needle":"彩虹針","/items/rainbow_plate_body":"彩虹胸甲","/items/rainbow_plate_legs":"彩虹腿甲","/items/rainbow_pot":"彩虹壺","/items/rainbow_shears":"彩虹剪刀","/items/rainbow_spatula":"彩虹鍋鏟","/items/rainbow_spear":"彩虹長槍","/items/rainbow_sword":"彩虹劍","/items/ranged_coffee":"遠程咖啡","/items/ranger_necklace":"射手項鍊","/items/red_culinary_hat":"紅色廚師帽","/items/red_guild_credit":"紅色公會信用點","/items/red_panda_fluff":"小熊貓絨","/items/red_tea_leaf":"紅茶葉","/items/redwood_bow":"紅杉弓","/items/redwood_crossbow":"紅杉弩","/items/redwood_fire_staff":"紅杉火法杖","/items/redwood_log":"紅杉原木","/items/redwood_lumber":"紅杉木板","/items/redwood_nature_staff":"紅杉自然法杖","/items/redwood_shield":"紅杉盾","/items/redwood_water_staff":"紅杉水法杖","/items/regal_jewel":"君王寶石","/items/regal_sword":"君王之劍","/items/regal_sword_refined":"君王之劍 ★","/items/rejuvenate":"群體治療術","/items/reptile_boots":"爬行動物靴","/items/reptile_bracers":"爬行動物護腕","/items/reptile_chaps":"爬行動物皮褲","/items/reptile_hide":"爬行動物皮","/items/reptile_hood":"爬行動物兜帽","/items/reptile_leather":"爬行動物皮革","/items/reptile_tunic":"爬行動物皮衣","/items/retribution":"懲戒","/items/revenant_anima":"亡者之魂","/items/revenant_chaps":"亡靈皮褲","/items/revenant_tunic":"亡靈皮衣","/items/revive":"復活","/items/ring_of_armor":"護甲戒指","/items/ring_of_critical_strike":"暴擊戒指","/items/ring_of_essence_find":"精華發現戒指","/items/ring_of_gathering":"採集戒指","/items/ring_of_rare_find":"稀有發現戒指","/items/ring_of_regeneration":"恢復戒指","/items/ring_of_resistance":"抗性戒指","/items/rippling_trident":"漣漪三叉戟","/items/rippling_trident_refined":"漣漪三叉戟 ★","/items/robusta_coffee_bean":"中級咖啡豆","/items/rough_boots":"粗糙靴","/items/rough_bracers":"粗糙護腕","/items/rough_chaps":"粗糙皮褲","/items/rough_hide":"粗糙獸皮","/items/rough_hood":"粗糙兜帽","/items/rough_leather":"粗糙皮革","/items/rough_tunic":"粗糙皮衣","/items/royal_cloth":"皇家織物","/items/royal_fire_robe_bottoms":"皇家火系袍裙","/items/royal_fire_robe_bottoms_refined":"皇家火系袍裙 ★","/items/royal_fire_robe_top":"皇家火系袍服","/items/royal_fire_robe_top_refined":"皇家火系袍服 ★","/items/royal_nature_robe_bottoms":"皇家自然系袍裙","/items/royal_nature_robe_bottoms_refined":"皇家自然系袍裙 ★","/items/royal_nature_robe_top":"皇家自然系袍服","/items/royal_nature_robe_top_refined":"皇家自然系袍服 ★","/items/royal_water_robe_bottoms":"皇家水系袍裙","/items/royal_water_robe_bottoms_refined":"皇家水系袍裙 ★","/items/royal_water_robe_top":"皇家水系袍服","/items/royal_water_robe_top_refined":"皇家水系袍服 ★","/items/scratch":"爪影斬","/items/seal_of_action_speed":"行動速度卷軸","/items/seal_of_attack_speed":"攻擊速度卷軸","/items/seal_of_cast_speed":"施法速度卷軸","/items/seal_of_combat_drop":"戰鬥掉落卷軸","/items/seal_of_critical_rate":"暴擊率卷軸","/items/seal_of_damage":"傷害卷軸","/items/seal_of_efficiency":"效率卷軸","/items/seal_of_gathering":"採集卷軸","/items/seal_of_gourmet":"美食卷軸","/items/seal_of_processing":"加工卷軸","/items/seal_of_rare_find":"稀有發現卷軸","/items/seal_of_wisdom":"經驗卷軸","/items/shard_of_protection":"保護碎片","/items/shield_bash":"盾擊","/items/shoebill_feather":"鯨頭鸛羽毛","/items/shoebill_shoes":"鯨頭鸛鞋","/items/sighted_bracers":"瞄準護腕","/items/silencing_shot":"沉默之箭","/items/silk_boots":"絲靴","/items/silk_fabric":"絲綢","/items/silk_gloves":"絲手套","/items/silk_hat":"絲帽","/items/silk_robe_bottoms":"絲綢袍裙","/items/silk_robe_top":"絲綢袍服","/items/silver_guild_credit":"銀色公會信用點","/items/sinister_cape":"陰森披風","/items/sinister_cape_refined":"陰森披風 ★","/items/sinister_chest":"陰森寶箱","/items/sinister_chest_key":"陰森寶箱鑰匙","/items/sinister_entry_key":"陰森鑰匙","/items/sinister_essence":"陰森精華","/items/sinister_refinement_chest":"陰森精煉寶箱","/items/sinister_refinement_shard":"陰森精煉碎片","/items/sinister_token":"陰森代幣","/items/smack":"重碾","/items/small_artisans_crate":"小工匠匣","/items/small_meteorite_cache":"小隕石艙","/items/small_pouch":"小袋子","/items/small_treasure_chest":"小寶箱","/items/smoke_burst":"煙爆滅影","/items/snail_shell":"蝸牛殼","/items/snail_shell_helmet":"蝸牛殼頭盔","/items/snake_fang":"蛇牙","/items/snake_fang_dirk":"蛇牙短劍","/items/sorcerer_boots":"巫師靴","/items/sorcerer_essence":"法師精華","/items/sorcerers_sole":"魔法師鞋底","/items/soul_fragment":"靈魂碎片","/items/soul_hunter_crossbow":"靈魂獵手弩","/items/spaceberry":"太空莓","/items/spaceberry_cake":"太空莓蛋糕","/items/spaceberry_donut":"太空莓甜甜圈","/items/spacia_coffee_bean":"太空咖啡豆","/items/speed_aura":"速度光環","/items/spike_shell":"尖刺防護","/items/spiked_bulwark":"尖刺重盾","/items/stalactite_shard":"鐘乳石碎片","/items/stalactite_spear":"石鍾長槍","/items/stamina_coffee":"耐力咖啡","/items/star_fragment":"星光碎片","/items/star_fruit":"楊桃","/items/star_fruit_gummy":"楊桃軟糖","/items/star_fruit_yogurt":"楊桃優格","/items/steady_shot":"穩定射擊","/items/stone_key_fragment":"石頭鑰匙碎片","/items/strawberry":"草莓","/items/strawberry_cake":"草莓蛋糕","/items/strawberry_donut":"草莓甜甜圈","/items/stunning_blow":"重錘","/items/sugar":"糖","/items/sundering_crossbow":"裂空之弩","/items/sundering_crossbow_refined":"裂空之弩 ★","/items/sundering_jewel":"裂空寶石","/items/sunstone":"太陽石","/items/super_alchemy_tea":"超級煉金茶","/items/super_attack_coffee":"超級攻擊咖啡","/items/super_brewing_tea":"超級沖泡茶","/items/super_cheesesmithing_tea":"超級乳酪鍛造茶","/items/super_cooking_tea":"超級烹飪茶","/items/super_crafting_tea":"超級製作茶","/items/super_defense_coffee":"超級防禦咖啡","/items/super_enhancing_tea":"超級強化茶","/items/super_foraging_tea":"超級採摘茶","/items/super_intelligence_coffee":"超級智力咖啡","/items/super_magic_coffee":"超級魔法咖啡","/items/super_melee_coffee":"超級近戰咖啡","/items/super_milking_tea":"超級擠奶茶","/items/super_ranged_coffee":"超級遠程咖啡","/items/super_stamina_coffee":"超級耐力咖啡","/items/super_tailoring_tea":"超級縫紉茶","/items/super_woodcutting_tea":"超級伐木茶","/items/swamp_essence":"沼澤精華","/items/sweep":"重掃","/items/swiftness_coffee":"迅捷咖啡","/items/tailoring_essence":"縫紉精華","/items/tailoring_tea":"縫紉茶","/items/tailors_bottoms":"裁縫下裝","/items/tailors_top":"裁縫上衣","/items/task_crystal":"任務水晶","/items/task_token":"任務代幣","/items/taunt":"嘲諷","/items/thread_of_expertise":"專精之線","/items/tome_of_healing":"治療之書","/items/tome_of_the_elements":"元素之書","/items/toughness":"堅韌","/items/toxic_pollen":"劇毒粉塵","/items/trainee_alchemy_charm":"實習煉金護符","/items/trainee_attack_charm":"實習攻擊護符","/items/trainee_brewing_charm":"實習沖泡護符","/items/trainee_cheesesmithing_charm":"實習乳酪鍛造護符","/items/trainee_cooking_charm":"實習烹飪護符","/items/trainee_crafting_charm":"實習製作護符","/items/trainee_defense_charm":"實習防禦護符","/items/trainee_enhancing_charm":"實習強化護符","/items/trainee_foraging_charm":"實習採摘護符","/items/trainee_intelligence_charm":"實習智力護符","/items/trainee_magic_charm":"實習魔法護符","/items/trainee_melee_charm":"實習近戰護符","/items/trainee_milking_charm":"實習擠奶護符","/items/trainee_ranged_charm":"實習遠程護符","/items/trainee_stamina_charm":"實習耐力護符","/items/trainee_tailoring_charm":"實習縫紉護符","/items/trainee_woodcutting_charm":"實習伐木護符","/items/treant_bark":"樹皮","/items/treant_shield":"樹人盾","/items/turtle_shell":"烏龜殼","/items/turtle_shell_body":"龜殼胸甲","/items/turtle_shell_legs":"龜殼腿甲","/items/twilight_essence":"暮光精華","/items/ultra_alchemy_tea":"究極煉金茶","/items/ultra_attack_coffee":"究極攻擊咖啡","/items/ultra_brewing_tea":"究極沖泡茶","/items/ultra_cheesesmithing_tea":"究極乳酪鍛造茶","/items/ultra_cooking_tea":"究極烹飪茶","/items/ultra_crafting_tea":"究極製作茶","/items/ultra_defense_coffee":"究極防禦咖啡","/items/ultra_enhancing_tea":"究極強化茶","/items/ultra_foraging_tea":"究極採摘茶","/items/ultra_intelligence_coffee":"究極智力咖啡","/items/ultra_magic_coffee":"究極魔法咖啡","/items/ultra_melee_coffee":"究極近戰咖啡","/items/ultra_milking_tea":"究極擠奶茶","/items/ultra_ranged_coffee":"究極遠程咖啡","/items/ultra_stamina_coffee":"究極耐力咖啡","/items/ultra_tailoring_tea":"究極縫紉茶","/items/ultra_woodcutting_tea":"究極伐木茶","/items/umbral_boots":"暗影靴","/items/umbral_bracers":"暗影護腕","/items/umbral_chaps":"暗影皮褲","/items/umbral_hide":"暗影皮","/items/umbral_hood":"暗影兜帽","/items/umbral_leather":"暗影皮革","/items/umbral_tunic":"暗影皮衣","/items/vampire_fang":"吸血鬼之牙","/items/vampire_fang_dirk":"吸血鬼短劍","/items/vampiric_bow":"吸血弓","/items/vampirism":"吸血","/items/verdant_alembic":"翠綠蒸餾器","/items/verdant_boots":"翠綠靴","/items/verdant_brush":"翠綠刷子","/items/verdant_buckler":"翠綠圓盾","/items/verdant_bulwark":"翠綠重盾","/items/verdant_cheese":"翠綠乳酪","/items/verdant_chisel":"翠綠鑿子","/items/verdant_enhancer":"翠綠強化器","/items/verdant_gauntlets":"翠綠護手","/items/verdant_hammer":"翠綠錘子","/items/verdant_hatchet":"翠綠斧頭","/items/verdant_helmet":"翠綠頭盔","/items/verdant_mace":"翠綠釘頭錘","/items/verdant_milk":"翠綠牛奶","/items/verdant_needle":"翠綠針","/items/verdant_plate_body":"翠綠胸甲","/items/verdant_plate_legs":"翠綠腿甲","/items/verdant_pot":"翠綠壺","/items/verdant_shears":"翠綠剪刀","/items/verdant_spatula":"翠綠鍋鏟","/items/verdant_spear":"翠綠長槍","/items/verdant_sword":"翠綠劍","/items/vision_helmet":"視覺頭盔","/items/vision_shield":"視覺盾","/items/watchful_relic":"警戒遺物","/items/water_strike":"流水衝擊","/items/werewolf_claw":"狼人之爪","/items/werewolf_slasher":"狼人關刀","/items/wheat":"小麥","/items/white_guild_credit":"白色公會信用點","/items/white_key_fragment":"白色鑰匙碎片","/items/wisdom_coffee":"經驗咖啡","/items/wisdom_tea":"經驗茶","/items/wizard_necklace":"巫師項鍊","/items/woodcutting_essence":"伐木精華","/items/woodcutting_tea":"伐木茶","/items/wooden_bow":"木弓","/items/wooden_crossbow":"木弩","/items/wooden_fire_staff":"木製火法杖","/items/wooden_nature_staff":"木製自然法杖","/items/wooden_shield":"木盾","/items/wooden_water_staff":"木製水法杖","/items/yogurt":"優格","/skills/alchemy":"煉金","/skills/attack":"攻擊","/skills/brewing":"沖泡","/skills/cheesesmithing":"乳酪鍛造","/skills/cooking":"烹飪","/skills/crafting":"製作","/skills/defense":"防禦","/skills/enhancing":"強化","/skills/foraging":"採摘","/skills/intelligence":"智力","/skills/magic":"魔法","/skills/melee":"近戰","/skills/milking":"擠奶","/skills/ranged":"遠程","/skills/stamina":"耐力","/skills/tailoring":"縫紉","/skills/total_level":"總等級","/skills/woodcutting":"伐木"});function ho(e,t=""){let i=String(t||"").trim();if(i&&!/[\u3400-\u9fff]/u.test(i))return i;let a=String(e||"").split("/").filter(Boolean).pop()||"",n=a.endsWith("_refined");return`${(n?a.slice(0,-8):a).split("_").filter(Boolean).map(s=>s==="hp"||s==="mp"?s.toUpperCase():`${s.charAt(0).toUpperCase()}${s.slice(1)}`).join(" ")||"Unknown"}${n?" ★":""}`}function U(e,t=""){let i=String(e||"");return K==="en"?ho(i,t):String(ia[i]||t||i.split("/").pop()||"未知")}let bo=[j("bow","弓","咒怨之弓","Cursed Bow",95,"/items/cursed_bow","弓"),j("bow","弓","咒怨之弓 ★","Cursed Bow ★",110,"/items/cursed_bow_refined","弓"),j("crossbow","弩","裂空之弩","Sundering Crossbow",95,"/items/sundering_crossbow","驽"),j("crossbow","弩","裂空之弩 ★","Sundering Crossbow ★",110,"/items/sundering_crossbow_refined","驽"),j("sword","劍","君王之劍","Regal Sword",95,"/items/regal_sword","劍"),j("sword","劍","君王之劍 ★","Regal Sword ★",110,"/items/regal_sword_refined","劍"),j("spear","槍","狂怒長槍","Furious Spear",95,"/items/furious_spear","槍"),j("spear","槍","狂怒長槍 ★","Furious Spear ★",110,"/items/furious_spear_refined","槍"),j("flail","槌系","混沌連枷","Chaotic Flail",95,"/items/chaotic_flail","錘"),j("flail","槌系","混沌連枷 ★","Chaotic Flail ★",110,"/items/chaotic_flail_refined","錘"),j("water_trident","水三叉戟","漣漪三叉戟","Rippling Trident",95,"/items/rippling_trident","水"),j("water_trident","水三叉戟","漣漪三叉戟 ★","Rippling Trident ★",110,"/items/rippling_trident_refined","水"),j("nature_trident","自然三叉戟","綻放三叉戟","Blooming Trident",95,"/items/blooming_trident","自"),j("nature_trident","自然三叉戟","綻放三叉戟 ★","Blooming Trident ★",110,"/items/blooming_trident_refined","自"),j("fire_trident","火三叉戟","熾焰三叉戟","Blazing Trident",95,"/items/blazing_trident","火"),j("fire_trident","火三叉戟","熾焰三叉戟 ★","Blazing Trident ★",110,"/items/blazing_trident_refined","火"),j("bulwark","重盾武器","獅鷲重盾","Griffin Bulwark",95,"/items/griffin_bulwark","盾"),j("bulwark","重盾武器","獅鷲重盾 ★","Griffin Bulwark ★",110,"/items/griffin_bulwark_refined","盾")],o={character:null,guild:null,pendingGuild:null,guildBuildingLevels:{},guildBuildingLevelsReady:!1,guildBuffLevelMap:{},guildCombatBuffLevels:{},guildCombatBuffLevelsReady:!1,lifeSkillLevels:new Map,combatSkillLevels:new Map,auraLevels:new Map,allSkills:new Map,allAbilities:new Map,characterItems:new Map,characterHouses:new Map,characterAchievements:new Map,achievementActionTypeBuffsMap:{},characterHousesReady:!1,characterAchievementsReady:!1,achievementActionTypeBuffsReady:!1,equippedAbilityHrids:new Set,itemDetailMap:{},abilityDetailMap:{},combatTriggerDependencyDetailMap:{},combatTriggerConditionDetailMap:{},combatTriggerComparatorDetailMap:{},skillDetailMap:{},equipmentTypeDetailMap:{},actionDetailMap:{},houseRoomDetailMap:{},levelExperienceTable:null,itemSpriteUrl:"",abilitySpriteUrl:"",skillSpriteUrl:"",guildRoster:[],guildRosterReady:!1,guildMemberIdByName:new Map,sharedProfileUploadSignatures:new Map,sharedProfileUploadInFlight:new Set,guildWeeklyTrials:{life:[],battle:[]},guildWeeklyTrialRegistrations:{life:[],battle:[]},guildTrialScheduleHourOffset:null,trialRegistrationsReady:!1,buildScore:{value:null,updatedAt:"",source:""},localBuildScore:null,localBuildScoreInputSignature:"",latestConfigResponse:null,lastReportedTrialSignature:"",trialRosterCaptureSignatures:new Map,trialRosterCaptureInFlight:new Set,source:"",updatedAt:null,loadedSavedCharacterId:null,requestInFlight:!1,configPollInFlight:!1,trialReportInFlight:!1,activeAlertSignature:"",admin:{token:"",expiresAt:"",members:[],selectedCharacterId:"",selectedPlanId:"",preservedTypeDrafts:null,memberDetail:null,memberDetailCache:new Map,localSnapshotGeneratedAt:"",localSnapshotSource:"",localSnapshotBackendVersion:"",lastDesktopStagingImportCount:0,sortKey:"",sortDescending:!1,groupSyncInFlight:!1,talent:{visible:!0,selectedKeys:new Set,threshold:100,minBuildScore:0,matchMode:"none",sortMode:"balanced",freshnessDays:0},selectedMemberIds:new Set,auraSelections:new Map,batchPublishing:!1,noticePublishing:!1,trialSelectionNoticePublishing:!1,directPublishing:!1,loading:!1,scoreInputsLoading:!1,scoreInputsLoadedAt:"",marketUpdatedAt:""}},m=null,aa=!1,oi="",An=0,Et=null,D=zr(),na=Gr({context:D,calculateScore:()=>Yo(""),buildSnapshot:vs,request:q,getToken:_t,saveToken:(e,t)=>GM_setValue(on(e),t),savePreferences:ec,device:()=>({deviceId:Yt(),deviceLabel:Xt()})}),ra=Ur({request:q,getAdminToken:Q,flattenPlan:Rt,planName:de,updateSavedPlan:In,updatePublishedPlans:Nn}),He=D.startup(),ie=null,oa=!1,li=null,at=null,si=null,nt=null,ci=null,ze=0,xe=new Map;qe(()=>{Et&&window.clearInterval(Et),li&&window.clearTimeout(li),si&&window.clearTimeout(si),at&&at.disconnect(),nt&&nt.disconnect();let e=P[ei];e&&e.listener===sa&&(e.listener=null)});function kn(){return new Promise((e,t)=>{if(!window.indexedDB){t(new Error("瀏覽器不支援本機資料庫。"));return}let i=window.indexedDB.open(Jr,yt);i.onupgradeneeded=()=>{let a=i.result;a.objectStoreNames.contains(Xe)||a.createObjectStore(Xe,{keyPath:"key"})},i.onsuccess=()=>e(i.result),i.onerror=()=>t(i.error||new Error("無法開啟管理員本機資料庫。"))})}function Tn(){return String(Fi()||re)}async function _o(){let e=await kn();try{return await new Promise((t,i)=>{let n=e.transaction(Xe,"readonly").objectStore(Xe).get(Tn());n.onsuccess=()=>t(n.result||null),n.onerror=()=>i(n.error||new Error("無法讀取管理員本機資料。"))})}finally{e.close()}}async function Cn(e){let t=await kn();try{await new Promise((i,a)=>{let n=t.transaction(Xe,"readwrite");n.objectStore(Xe).put({key:Tn(),cacheSchemaVersion:yt,backendVersion:String(e&&e.backendVersion||""),generatedAt:String(e&&e.generatedAt||new Date().toISOString()),scoreCalculatedAt:String(e&&e.scoreCalculatedAt||""),marketUpdatedAt:String(e&&e.marketUpdatedAt||""),guildBuildingLevelsUpdatedAt:String(e&&e.guildBuildingLevelsUpdatedAt||""),guildBuildingLevels:Bn(e&&e.guildBuildingLevels),members:Array.isArray(e&&e.members)?e.members:[],details:Array.isArray(e&&e.details)?e.details:[]}),n.oncomplete=()=>i(),n.onerror=()=>a(n.error||new Error("無法覆蓋管理員本機資料。")),n.onabort=()=>a(n.error||new Error("管理員本機資料寫入已取消。"))})}finally{t.close()}}function En(e){return!!(e&&Array.isArray(e.members)&&Array.isArray(e.details)&&e.generatedAt)}function Ln(e){return!!(En(e)&&Number(e.cacheSchemaVersion)===yt)}function di(){if(!m||!m.adminCacheStatus)return;let e=String(o.admin.localSnapshotGeneratedAt||"");if(!e){m.adminCacheStatus.textContent="本機資料：尚未下載";return}let t=o.admin.localSnapshotSource==="download"?"剛下載並覆蓋":"由本機載入";m.adminCacheStatus.textContent=["本機資料："+ln(e),String(o.admin.memberDetailCache.size)+" 位有完整資料",t].join("｜")}function wo(e,t){let i=t&&typeof t=="object"?t:{},a=i.snapshot&&typeof i.snapshot=="object"?i.snapshot:i.member?.snapshot&&typeof i.member.snapshot=="object"?i.member.snapshot:{},n=a.profile&&typeof a.profile=="object"?a.profile:{},r=[e&&e.combatLevel,e&&e.levels&&e.levels.combatLevel,i.combatLevel,i.summary&&i.summary.combatLevel,i.member&&i.member.combatLevel,a.combatLevel,n.combatLevel];for(let s of r){let c=Number(s);if(Number.isFinite(c)&&c>=0)return Number(c.toFixed(2))}let l=Dt(i.skills,a.skills,i.member?.snapshot?.skills);return Yn(l)}function yo(e,t="local"){if(!Ln(e))throw new Error("本機會員資料格式不正確。");o.admin.members=rr(e.members),o.guildBuildingLevelsReady||ma(e.guildBuildingLevels),o.admin.members.some(n=>Object.prototype.hasOwnProperty.call(n||{},"selectedAuraHrid"))&&(o.admin.auraSelections=new Map(o.admin.members.map(n=>[A(n),vi(n&&n.selectedAuraHrid)]).filter(([n,r])=>n&&r)),er()),o.admin.memberDetailCache=new Map,e.details.forEach(n=>{let r=String(n&&(n.characterId||n.summary?.characterId||n.member?.characterId)||"");r&&o.admin.memberDetailCache.set(r,n)}),o.admin.members.forEach(n=>{n.combatLevel=wo(n,o.admin.memberDetailCache.get(A(n)))}),o.admin.localSnapshotGeneratedAt=String(e.generatedAt||""),o.admin.localSnapshotSource=t,o.admin.localSnapshotBackendVersion=String(e.backendVersion||""),o.admin.scoreInputsLoadedAt=String(e.scoreCalculatedAt||""),o.admin.marketUpdatedAt=String(e.marketUpdatedAt||"");let a=new Set(o.admin.members.filter(te).map(A).filter(Boolean));o.admin.selectedMemberIds=new Set([...o.admin.selectedMemberIds].filter(n=>a.has(n))),H(),je(0),di()}function So(e){let t=dt(),i=new Set(o.admin.members.filter(te).map(A).filter(Boolean)),a=0;(Array.isArray(e&&e.members)?e.members:[]).forEach(n=>{let r=A(n),l=De(n&&n.battleDraft),s=l&&l.slots&&l.slots[l.activeSlot];!r||!i.has(r)||!s||!String(s.note||"").startsWith("DESKTOP_STAGING ")||(Object.values(l.slots).forEach(c=>{!c||typeof c!="object"||(c.equipment={},c.equipmentSlots={},c.selectedEquipment={})}),t.members[r]=l,a+=1)}),a&&(t.schemaVersion=2,t.updatedAt=new Date().toISOString(),P.localStorage.setItem(Je,JSON.stringify(t))),o.admin.lastDesktopStagingImportCount=a}function vo(){let e=o.admin.members.map(i=>({...i})),t=[...o.admin.memberDetailCache.values()].map(i=>({...i}));return{cacheSchemaVersion:yt,backendVersion:o.admin.localSnapshotBackendVersion,generatedAt:o.admin.localSnapshotGeneratedAt||new Date().toISOString(),scoreCalculatedAt:o.admin.scoreInputsLoadedAt,marketUpdatedAt:o.admin.marketUpdatedAt,guildBuildingLevelsUpdatedAt:o.guildBuildingLevelsReady?new Date().toISOString():"",guildBuildingLevels:o.guildBuildingLevelsReady?{...o.guildBuildingLevels}:{},members:e,details:t}}async function ce(){if(!o.admin.members.length||!o.admin.localSnapshotGeneratedAt)return!1;try{return await Cn(vo()),di(),!0}catch{return m&&m.adminCacheStatus&&(m.adminCacheStatus.textContent="本機資料儲存失敗；目前畫面仍可使用。"),!1}}function X(e){return o.admin.memberDetailCache.get(String(e||""))||null}function fe(e,t){let i=String(e||"");!i||!t||o.admin.memberDetailCache.set(i,{...t,characterId:i})}function In(e,t,i=""){let a=X(e);if(!a||!t)return;let n=String(t.planId||t.id||"");if(!n)return;let r=Array.isArray(a.plans)?a.plans:[],l=r.find(u=>String(u&&(u.planId||u.id)||"")===n),s=Ve(t.planType||t.type||l?.planType||l?.type),c={...l||{},...t,planId:n,characterId:String(e||""),type:s,planType:s,name:de(s),updatedAt:String(i||t.updatedAt||new Date().toISOString())},d=r.filter(u=>String(u&&(u.planId||u.id)||"")!==n);d.push(c),fe(e,{...a,plans:d})}function Nn(e,t,i,a={}){a.action==="adminReplacePublishedPlans"&&la(e);let n=X(e);if(n){let l={...n.published||{}};t&&a.published?.life&&(l.life=a.published.life),i&&a.published?.battle&&(l.battle=a.published.battle),fe(e,{...n,published:l,publishedLifePlanId:String(t||n.publishedLifePlanId||""),publishedBattlePlanId:String(i||n.publishedBattlePlanId||"")})}let r=o.admin.members.find(l=>A(l)===String(e));r&&(r.published=r.published||{},t&&(r.published.life={enabled:!0,planId:String(t),publishedAt:String(a.publishedAt||""),stale:!1}),i&&(r.published.battle={enabled:!0,planId:String(i),publishedAt:String(a.publishedAt||""),stale:!1}))}function la(e){let t=X(e);t&&fe(e,{...t,publishedLifePlanId:"",publishedBattlePlanId:"",published:{...t.published||{},life:null,battle:null}});let i=o.admin.members.find(a=>A(a)===String(e));i&&(i.published={...i.published||{},life:{enabled:!1,planId:"",stale:!1},battle:{enabled:!1,planId:"",stale:!1}})}xo(),Ao(),Ko(),Qo(()=>{let e=()=>{document.getElementById(Yr)?.remove()};e(),Ne(e,1e3),Ne(e,5e3),ol(),rl(),Ll()});function j(e,t,i,a,n,r,l){return{typeKey:e,typeName:t,nameZh:i,nameEn:a,requiredLevel:n,hrid:r,elementLabel:l}}function xo(){typeof GM_registerMenuCommand=="function"&&(GM_registerMenuCommand(G("設定 Google Apps Script 網址"),()=>{let e=String(GM_getValue(we,"")||re),t=no("貼上部署後、以 /exec 結尾的 Web App 網址：",e);if(t===null)return;let i=t.trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(i)){tt("網址格式不正確，必須是 script.google.com/macros/s/.../exec");return}GM_setValue(we,i),tt("已儲存 API 網址，請重新整理遊戲頁面。")}),GM_registerMenuCommand(G("清除目前角色的個人讀取碼"),()=>{if(!o.character){tt("尚未讀取角色資料。");return}GM_setValue(on(),""),Pi(),tt("已清除本機讀取碼。再次上傳時可能會被視為新裝置；若已超過兩台，需由管理者在「裝置管理」分頁核准。")}),GM_registerMenuCommand(G("顯示本機裝置代碼"),()=>{tt(`本機裝置代碼：${$r(Yt())}
裝置名稱：${Xt()}`)}),GM_registerMenuCommand(G("重設工會資料按鈕位置"),()=>{GM_setValue(Gi,null),Xa()}))}function Ao(){let e=P[ei];if(e&&e.nativeWebSocket){e.listener=sa;return}let t=P.WebSocket,i={nativeWebSocket:t,listener:sa};function a(n,r){let l=r===void 0?new t(n):new t(n,r);return l.addEventListener("message",s=>{let c=P[ei];c&&typeof c.listener=="function"&&c.listener(s.data)}),l}a.prototype=t.prototype,Object.setPrototypeOf(a,t);try{Object.defineProperty(a,"name",{value:"WebSocket"})}catch{}P[ei]=i,P.WebSocket=a}function sa(e){if(typeof e=="string"){ca(e);return}if(e&&typeof e.text=="function"){e.text().then(ca).catch(()=>{});return}if(e instanceof ArrayBuffer)try{ca(new TextDecoder().decode(e))}catch{}}function ca(e){if(typeof e!="string"||!ko(e))return;let t;try{t=JSON.parse(e)}catch{return}Bo(t,"WebSocket")}function ko(e){return e.includes('"init_client_data"')||e.includes('"init_character_data"')||e.includes('"skills_updated"')||e.includes('"abilities_updated"')||e.includes('"items_updated"')||e.includes('"action_completed"')||e.includes('"character_updated"')||e.includes('"guild_characters_updated"')||e.includes('"guild_updated"')||e.includes('"guildBuildingLevelMap"')||e.includes('"guildBuildingLevelDict"')||e.includes('"guildCombatBuffLevels"')||e.includes('"guildCombatBuffLevelMap"')||e.includes('"guildBuffLevelMap"')||e.includes('"guildShrineLevelMap"')||e.includes('"effectiveGuildShrineLevelMap"')||e.includes('"guildWeeklyTrialSet"')||e.includes('"guildTrialScheduleHourOffset"')||e.includes('"characterHouseRoomMap"')||e.includes('"characterAchievements"')||e.includes('"achievementActionTypeBuffsMap"')||e.includes('"achievements_updated"')||e.includes('"profile_shared"')||e.includes('"endCharacterItems"')}function Mn(e,t){let i=[...new Set(e.map(a=>String(a??"").trim()).filter(Boolean))];if(!i.length)throw new Error(`公開資料缺少${t}，未上傳。`);if(i.length!==1)throw new Error(`公開資料的${t}互相矛盾，未上傳。`);return i[0]}function To(e){let t=e&&e.sharableCharacter||{},i=Array.isArray(e&&e.characterSkills)?e.characterSkills[0]||{}:{};return Mn([e&&e.characterId,e&&e.characterID,t.id,t.characterId,t.characterID,i.characterId,i.characterID],"角色 ID")}function Co(e){let t=e&&e.sharableCharacter||{},i=e&&e.guild||{},a=[e&&e.guildId,e&&e.guildID,i.id,i.guildId,i.guildID,t.guildId,t.guildID].map(n=>String(n??"").trim()).filter(Boolean);return a.length?Mn(a,"公會 ID"):""}function Eo(e){if(!e||typeof e!="object")return[];let t=new Map;return(Array.isArray(e)?e.map(a=>[a&&(a.houseRoomHrid||a.hrid),a]):Object.entries(e)).forEach(([a,n])=>{if(!n||typeof n!="object")return;let r=String(n.houseRoomHrid||n.hrid||a||"").trim(),l=se(n.level);!r||l===null||t.set(r,{houseRoomHrid:r,level:l})}),[...t.values()].sort((a,n)=>a.houseRoomHrid.localeCompare(n.houseRoomHrid))}function Lo(e){if(!e||typeof e!="object")return[];let t=new Map;return(Array.isArray(e)?e.map(a=>[a&&(a.achievementHrid||a.hrid),a]):Object.entries(e)).forEach(([a,n])=>{let r=String(n&&typeof n=="object"?n.achievementHrid||n.hrid||a||"":a||"").trim();r&&t.set(r,{achievementHrid:r,isCompleted:n&&typeof n=="object"?!!(n.isCompleted??n.completed):!!n})}),[...t.values()].sort((a,n)=>a.achievementHrid.localeCompare(n.achievementHrid))}function Io(e){let t=e&&typeof e=="object"?e:{},i=t.sharableCharacter&&typeof t.sharableCharacter=="object"?t.sharableCharacter:{},a=t.character&&typeof t.character=="object"?t.character:{},n=[t.guildBuffLevelMap,i.guildBuffLevelMap,a.guildBuffLevelMap].find(r=>r&&typeof r=="object");return n?Hn(n):null}async function No(e,t,i,a){let n=X(e);if(!n)return!1;let r=n.snapshot&&typeof n.snapshot=="object"?n.snapshot:{},l=r.profile&&typeof r.profile=="object"?r.profile:{},s=l.optionalDataStatus&&typeof l.optionalDataStatus=="object"?l.optionalDataStatus:{},c=t.profile&&typeof t.profile=="object"?t.profile:{...l,houses:i,achievements:a,optionalDataStatus:{...s,houses:!0,achievements:!0}},d=String(t.savedAt||new Date().toISOString()),u={...n,snapshot:{...r,profile:c,updatedAt:d}};return fe(e,u),o.admin.memberDetail&&A(o.admin.memberDetail.summary||o.admin.memberDetail.member||o.admin.memberDetail)===e&&(o.admin.memberDetail=u),o.admin.members.length&&(o.admin.localSnapshotGeneratedAt=d,await ce()),!0}async function Mo(e){try{let t=e&&e.profile;if(!t||typeof t!="object")throw new Error("公開資料格式不正確，未上傳。");let i=To(t),a=o.guildRoster.find(b=>A(b)===i);if(!a)throw new Error(`角色 ID ${i} 不在目前公會名單，未上傳。`);let n=Co(t),r=String(o.guild&&o.guild.id||"");if(n&&r&&n!==r)throw new Error("公開資料的公會 ID 與目前公會不符，未上傳。");if(!Object.prototype.hasOwnProperty.call(t,"characterHouseRoomMap")||!Object.prototype.hasOwnProperty.call(t,"characterAchievements"))throw new Error("公開資料未包含完整房屋與成就，未上傳。");let l=t.characterHouseRoomMap,s=t.characterAchievements,c=Eo(l),d=Lo(s),u=Io(t),f=u!==null,p=f?Rn(u):{},_=f?Object.fromEntries(Zt.map(b=>[b,p[b]||0])):{};if(Object.keys(l||{}).length&&!c.length)throw new Error("公開房屋資料無法辨識，未上傳。");if(Object.keys(s||{}).length&&!d.length)throw new Error("公開成就資料無法辨識，未上傳。");if(!V()){k(`已核對 ${B(a)} 的角色 ID；登入管理員後重新開啟即可上傳。`,!0);return}let h=JSON.stringify({characterId:i,houses:c,achievements:d,guildBuffLevelMap:u,guildCombatBuffLevels:_});if(o.sharedProfileUploadSignatures.get(i)===h||o.sharedProfileUploadInFlight.has(i))return;o.sharedProfileUploadInFlight.add(i),k(`已核對 ${B(a)}（${i}），正在上傳房屋與成就…`);try{let b=await q({action:"adminSavePublicProfileData",adminToken:Q(),characterId:i,characterName:B(a),guildId:r||n,houses:c,achievements:d,...f?{guildBuffLevelMap:u,guildCombatBuffLevels:_}:{},capturedAt:new Date().toISOString(),scriptVersion:$});o.sharedProfileUploadSignatures.set(i,h),await No(i,b,c,d);let y=d.filter(x=>x.isCompleted).length;H(),k(`已上傳 ${B(a)}：${c.length} 間房屋、${y} 項已完成成就。`)}finally{o.sharedProfileUploadInFlight.delete(i)}}catch(t){k(t&&t.message?t.message:"公開資料上傳失敗。",!0)}}function Bo(e,t){if(!e||typeof e!="object")return;if(e.type==="profile_shared"){Mo(e);return}let i=!1;e.type==="init_client_data"?i=$n(e)||i:e.type==="init_character_data"?(i=da(e.character)||i,i=mi(e.guild)||i,o.lifeSkillLevels.clear(),o.combatSkillLevels.clear(),o.auraLevels.clear(),o.allSkills.clear(),o.allAbilities.clear(),o.characterItems.clear(),i=ga(e.characterSkills)||i,i=ha(e.characterSkills)||i,i=ba(e.characterAbilities)||i,i=_a(e.characterSkills,!0)||i,i=wa(e.characterAbilities,!0)||i,i=Sa(e.characterItems,!0)||i,i=On(e.characterHouseRoomMap||e.character?.characterHouseRoomMap,!0)||i,i=va(e.characterAchievements||e.character?.characterAchievements,!0)||i,i=Fn(e.achievementActionTypeBuffsMap||e.character?.achievementActionTypeBuffsMap,!0)||i,i=ya(e.combatUnit)||i):e.type==="character_updated"?(i=da(e.character)||i,i=mi(e.guild)||i):e.type==="guild_characters_updated"&&(i=Ro(e)||i),i=mi(e.guild)||i,i=ma(e.guildBuildingLevelMap||e.guildBuildingLevelDict||e.guild?.guildBuildingLevelMap||e.guild?.guildBuildingLevelDict)||i,i=Dn(e.guildBuffLevelMap,e.characterGuildBuffMap,e.characterGuildBuffDict,e.characterGuildBuffLevelMap,e.characterGuildBuffLevelDict,e.guildCombatBuffLevels,e.guildCombatBuffLevelMap,e.guildShrineLevelMap,e.effectiveGuildShrineLevelMap,e.character?.guildBuffLevelMap,e.character?.guildCombatBuffLevels,e.character?.guildCombatBuffLevelMap,e.character?.guildShrineLevelMap,e.character?.effectiveGuildShrineLevelMap)||i,i=fa(e.guildWeeklyTrialSet)||i,i=Cr(e.guildTrialScheduleHourOffset)||i,Array.isArray(e.endCharacterSkills)&&(i=ga(e.endCharacterSkills)||i,i=ha(e.endCharacterSkills)||i,i=_a(e.endCharacterSkills)||i),Array.isArray(e.endCharacterAbilities)&&(i=ba(e.endCharacterAbilities)||i,i=wa(e.endCharacterAbilities)||i),Array.isArray(e.endCharacterItems)&&(i=Sa(e.endCharacterItems)||i),e.characterHouseRoomMap&&(i=On(e.characterHouseRoomMap)||i),e.characterAchievements&&(i=va(e.characterAchievements)||i),e.endCharacterAchievements&&(i=va(e.endCharacterAchievements)||i),e.achievementActionTypeBuffsMap&&(i=Fn(e.achievementActionTypeBuffsMap)||i),e.combatUnit&&(i=ya(e.combatUnit)||i),i&&(o.source=t,o.updatedAt=new Date,gt())}function da(e){if(!e||e.id===void 0||!e.name)return!1;let t=String(e.id),i=!o.character||String(o.character.id)!==t;i&&(o.guild=null,o.pendingGuild=null,o.guildRoster=[],o.guildMemberIdByName.clear(),o.sharedProfileUploadSignatures.clear(),o.sharedProfileUploadInFlight.clear(),o.lifeSkillLevels.clear(),o.combatSkillLevels.clear(),o.auraLevels.clear(),o.allSkills.clear(),o.allAbilities.clear(),o.characterItems.clear(),o.characterHouses.clear(),o.characterAchievements.clear(),o.achievementActionTypeBuffsMap={},o.characterHousesReady=!1,o.characterAchievementsReady=!1,o.achievementActionTypeBuffsReady=!1,o.guildBuildingLevels={},o.guildBuildingLevelsReady=!1,o.guildBuffLevelMap={},o.guildCombatBuffLevels={},o.guildCombatBuffLevelsReady=!1,o.equippedAbilityHrids.clear(),o.loadedSavedCharacterId=null,o.activeAlertSignature="",o.guildWeeklyTrials={life:[],battle:[]},o.guildWeeklyTrialRegistrations={life:[],battle:[]},o.guildRosterReady=!1,o.guildTrialScheduleHourOffset=null,o.trialRegistrationsReady=!1,o.latestConfigResponse=null,o.lastReportedTrialSignature="",o.trialRosterCaptureSignatures.clear(),o.trialRosterCaptureInFlight.clear(),o.localBuildScore=null,o.localBuildScoreInputSignature="",m&&m.shadow.querySelector('[data-role="config-alert"]')?.remove(),Ps());let a=i||!o.character||o.character.name!==e.name;return o.character={id:t,name:String(e.name)},D.activate(t)&&(He=D.startup(),jt(gn)),a}function Bn(e){if(!e||typeof e!="object")return{};let t=new Set(Kr),i={};return(Array.isArray(e)?e.map(n=>[n?.guildBuildingHrid||n?.buildingHrid||n?.hrid,n]):Object.entries(e)).forEach(([n,r])=>{let l=String(r&&typeof r=="object"&&(r.guildBuildingHrid||r.buildingHrid||r.hrid)||n);if(!t.has(l))return;let s=Math.max(0,Math.min(20,Math.floor(Number(r&&typeof r=="object"?r.level??r.currentLevel??r.value:r)||0)));i[l]=s}),i}function Ho(e){if(!e||typeof e!="object")return{};let t=new Set(Zt),i={};return(Array.isArray(e)?e.map(n=>[n?.guildBuffHrid||n?.guildShrineHrid||n?.shrineHrid||n?.guildBuildingHrid||n?.buildingHrid||n?.hrid,n]):Object.entries(e)).forEach(([n,r])=>{let l=String(r&&typeof r=="object"&&(r.guildBuffHrid||r.guildShrineHrid||r.shrineHrid||r.guildBuildingHrid||r.buildingHrid||r.hrid)||n),s=l;if(l.startsWith("/guild_buffs/")){let d=l.split("/").filter(Boolean).pop();if(!d.endsWith("_combat"))return;s=d.slice(0,-7)}else l.startsWith("/guild_shrines/")&&(s=l.split("/").filter(Boolean).pop());if(!t.has(s))return;let c=Math.max(0,Math.min(20,Math.floor(Number(r&&typeof r=="object"?r.level??r.currentLevel??r.value:r)||0)));i[s]=c}),Object.keys(i).length?Object.fromEntries(Zt.map(n=>[n,i[n]||0])):{}}function Hn(e){if(!e||typeof e!="object")return{};let t=Array.isArray(e)?e.map(a=>[a?.guildBuffHrid||a?.hrid,a]):Object.entries(e),i={};return t.forEach(([a,n])=>{let r=String(n&&typeof n=="object"?n.guildBuffHrid||n.hrid||a||"":a||"");r.startsWith("/guild_buffs/")&&(i[r]=Math.max(0,Math.min(20,Math.floor(Number(n&&typeof n=="object"?n.level??n.currentLevel??n.value:n)||0))))}),i}function Rn(...e){for(let t of e){let i=Ho(t);if(Object.keys(i).length)return i}return{}}function ma(e){let t=Bn(e);if(!Object.keys(t).length)return!1;let i=o.guildBuildingLevelsReady,a=JSON.stringify(t)!==JSON.stringify(o.guildBuildingLevels);return o.guildBuildingLevels=t,o.guildBuildingLevelsReady=!0,a||!i}function Dn(...e){let t=e.some(s=>s&&typeof s=="object"),i=Rn(...e);if(!Object.keys(i).length&&!t)return!1;let a=Object.fromEntries(Zt.map(s=>[s,i[s]||0])),n=o.guildCombatBuffLevelsReady,r=JSON.stringify(a)!==JSON.stringify(o.guildCombatBuffLevels);o.guildCombatBuffLevels=a,o.guildCombatBuffLevelsReady=!0;let l=e.map(Hn).find(s=>Object.keys(s).length>0);return o.guildBuffLevelMap=l||{},r||!n}function mi(e){if(!e||e.id===void 0||!e.name)return!1;let t={id:String(e.id),name:String(e.name),currentWeekStartAt:e.currentWeekStartAt||"",currentTrialsData:e.currentTrialsData||""};return o.pendingGuild=t,pa()?(o.pendingGuild=null,ua(t)):!1}function ua(e){let t=!!(o.guild&&o.guild.currentWeekStartAt!==e.currentWeekStartAt),i=!o.guild||o.guild.id!==e.id||o.guild.name!==e.name||o.guild.currentWeekStartAt!==e.currentWeekStartAt||JSON.stringify(o.guild.currentTrialsData)!==JSON.stringify(e.currentTrialsData);return o.guild=e,t&&(o.lastReportedTrialSignature="",o.trialRosterCaptureSignatures.clear(),o.trialRosterCaptureInFlight.clear()),i&&window.setTimeout(ht,400),i}function Ro(e){let t=e&&e.guildSharableCharacterMap||{},i=e&&e.guildCharacterMap||{},a=[...new Set([...Object.keys(t),...Object.keys(i)])],n=[],r=new Map,l=String(o.character&&o.character.id||""),s="";if(a.forEach((p,_)=>{let h=t[p]||{},b=i[p]||{},y=String(h.name||h.characterName||b.name||b.characterName||"").trim();if(!y)return;let x=String(p);n.push({characterId:x,characterName:y,rosterOrder:_+1,guildRole:b.role||b.guildRole||"",guildStatus:b.status==null?"":String(b.status),signupWeekStartAt:b.signupWeekStartAt||"",signedUpSkillingTrialHrid:ui(b.signedUpSkillingTrialHrid,"life"),signedUpCombatTrialHrid:ui(b.signedUpCombatTrialHrid,"battle"),uploaded:!1}),r.set(y,x),x===l&&b.guildID!=null&&(s=String(b.guildID))}),!n.length)return!1;let c=o.guildRosterReady,d=JSON.stringify(n)!==JSON.stringify(o.guildRoster);o.guildRoster=n,o.guildRosterReady=!0,o.guildMemberIdByName=r;let u=pa(),f=!1;if(!u)f=!!(o.guild||o.pendingGuild),o.guild=null,o.pendingGuild=null;else if(o.pendingGuild){let p=o.pendingGuild;o.pendingGuild=null,f=ua(p)||f}else!o.guild&&s&&(f=ua({id:s,name:"",currentWeekStartAt:"",currentTrialsData:""})||f);return V()&&o.admin.members.length&&(o.admin.members=rr(o.admin.members),H()),je(50),Oi(),(d||!c)&&window.setTimeout(ht,400),d||f}function pa(){let e=String(o.character&&o.character.id||"");return!!(e&&o.guildRosterReady&&Array.isArray(o.guildRoster)&&o.guildRoster.some(t=>String(t&&t.characterId||"")===e))}function Pn(){return!!(o.guild&&o.guild.id&&pa())}function ui(e,t){let i=String(e||"").trim().toLowerCase(),a=/^\/guild_(skilling|combat)\/[a-z0-9_]+$/.exec(i);if(!a)return"";let n=a[1]==="skilling"?"life":"battle";return!t||n===t?i:""}function Do(){if(!o.guildRosterReady||!o.guild||!o.guild.id||!o.guildRoster.length)return null;let e=o.guildRoster.map(t=>({characterId:String(t.characterId||""),characterName:String(t.characterName||"").trim(),status:String(t.guildStatus||""),signupWeekStartAt:t.signupWeekStartAt||"",lifeTrialHrid:ui(t.signedUpSkillingTrialHrid,"life"),battleTrialHrid:ui(t.signedUpCombatTrialHrid,"battle")})).filter(t=>t.characterId&&t.characterName).sort((t,i)=>t.characterId.localeCompare(i.characterId));return e.length?{guildId:String(o.guild.id),weekStartAt:o.guild.currentWeekStartAt||"",availableLife:o.guildWeeklyTrials.life.slice(),availableBattle:o.guildWeeklyTrials.battle.slice(),members:e}:null}function fa(e){if(!e||typeof e!="object")return!1;let t=ae(e.skillHrids||e.life,"life"),i=ae(e.combatHrids||e.battle,"battle");if(!t.length&&!i.length)return!1;let a=JSON.stringify({life:t,battle:i}),n=JSON.stringify(o.guildWeeklyTrials);return a===n?!1:(o.guildWeeklyTrials={life:t,battle:i},o.admin.memberDetail&&m&&m.adminMemberOverlay&&!m.adminMemberOverlay.hidden&&!Gt()&&Ti(),window.setTimeout(ht,400),!0)}function ae(e,t){let i=Array.isArray(e)?e:[];return[...new Set(i.map(a=>{let n=String(a||"").trim().toLowerCase(),r=/^\/guild_(skilling|combat)\/[a-z0-9_]+$/.exec(n);if(!r)return"";let l=r[1]==="skilling"?"life":"battle";return!t||l===t?n:""}).filter(Boolean))].sort()}function ga(e){if(!Array.isArray(e))return!1;let t=!1;for(let i of e){if(!i||!ve.some(n=>n.hrid===i.skillHrid))continue;let a=se(i.level);a!==null&&o.lifeSkillLevels.get(i.skillHrid)!==a&&(o.lifeSkillLevels.set(i.skillHrid,a),t=!0)}return t}function ha(e){if(!Array.isArray(e))return!1;let t=!1;for(let i of e){if(!i||!Me.some(n=>n.hrid===i.skillHrid))continue;let a=se(i.level);a!==null&&o.combatSkillLevels.get(i.skillHrid)!==a&&(o.combatSkillLevels.set(i.skillHrid,a),t=!0)}return t}function ba(e){if(!Array.isArray(e))return!1;let t=!1;for(let i of e){if(!i||!Be.some(n=>n.hrid===i.abilityHrid))continue;let a=se(i.level);a!==null&&o.auraLevels.get(i.abilityHrid)!==a&&(o.auraLevels.set(i.abilityHrid,a),t=!0)}return t}function $n(e){let t=!1;for(let[i,a]of[[["itemDetailMap","itemDetailDict"],"itemDetailMap"],[["abilityDetailMap","abilityDetailDict"],"abilityDetailMap"],[["combatTriggerDependencyDetailMap","combatTriggerDependencyDetailDict"],"combatTriggerDependencyDetailMap"],[["combatTriggerConditionDetailMap","combatTriggerConditionDetailDict"],"combatTriggerConditionDetailMap"],[["combatTriggerComparatorDetailMap","combatTriggerComparatorDetailDict"],"combatTriggerComparatorDetailMap"],[["skillDetailMap","skillDetailDict"],"skillDetailMap"],[["equipmentTypeDetailMap","equipmentTypeDetailDict"],"equipmentTypeDetailMap"],[["actionDetailMap","actionDetailDict"],"actionDetailMap"],[["houseRoomDetailMap","houseRoomDetailDict"],"houseRoomDetailMap"]]){let n=i.map(l=>e&&e[l]).filter(l=>l&&typeof l=="object"),r=n.find(l=>Qa(l)>0)||n[0];r&&typeof r=="object"&&r!==o[a]&&(o[a]=r,t=!0)}return e&&e.levelExperienceTable&&e.levelExperienceTable!==o.levelExperienceTable&&(o.levelExperienceTable=e.levelExperienceTable,t=!0),zn(),t}function _a(e,t=!1){if(!Array.isArray(e))return!1;t&&o.allSkills.clear();let i=t;for(let a of e){let n=String(a&&a.skillHrid||"").trim(),r=se(a&&a.level);if(!n||r===null)continue;let l={skillHrid:n,level:r,experience:Math.max(0,Number(a&&a.experience)||0)},s=o.allSkills.get(n);(!s||s.level!==r||s.experience!==l.experience)&&(o.allSkills.set(n,l),i=!0)}return i}function wa(e,t=!1){if(!Array.isArray(e))return!1;t&&o.allAbilities.clear();let i=t;for(let a of e){let n=String(a&&a.abilityHrid||"").trim(),r=se(a&&a.level);if(!n||r===null)continue;let l={abilityHrid:n,level:r},s=o.allAbilities.get(n);(!s||s.level!==r)&&(o.allAbilities.set(n,l),i=!0)}return i}function ya(e){let t=Array.isArray(e&&e.combatAbilities)?e.combatAbilities:[],i=new Set(t.map(n=>String(n&&n.abilityHrid||"").trim()).filter(Boolean)),a=i.size!==o.equippedAbilityHrids.size||[...i].some(n=>!o.equippedAbilityHrids.has(n));return a&&(o.equippedAbilityHrids=i),a}function Sa(e,t=!1){if(!Array.isArray(e))return!1;t&&o.characterItems.clear();let i=t;for(let a of e){if(!a||typeof a!="object")continue;let n=String(a.itemHrid||"").trim(),r=String(a.itemLocationHrid||"/item_locations/inventory").trim(),l=se(a.enhancementLevel)||0,s=String(a.hash||[o.character?o.character.id:"",r,n,l].join("::"));if(!n||!s)continue;let c=Number(a.count);if(Number.isFinite(c)&&c<=0){o.characterItems.delete(s)&&(i=!0);continue}let d={hash:s,itemHrid:n,itemLocationHrid:r,enhancementLevel:l,count:Number.isFinite(c)?Math.floor(c):1},u=o.characterItems.get(s);(!u||JSON.stringify(u)!==JSON.stringify(d))&&(o.characterItems.set(s,d),i=!0)}return i}function On(e,t=!1){if(!e||typeof e!="object")return!1;let i=!o.characterHousesReady;o.characterHousesReady=!0;let a=Array.isArray(e)?e.map(r=>[r&&r.houseRoomHrid,r]):Object.entries(e);t&&o.characterHouses.clear();let n=t||i;return a.forEach(([r,l])=>{if(!l||typeof l!="object")return;let s=String(l.houseRoomHrid||l.hrid||r||"").trim(),c=se(l.level);if(!s||c===null)return;let d={houseRoomHrid:s,level:c},u=o.characterHouses.get(s);(!u||u.level!==c)&&(o.characterHouses.set(s,d),n=!0)}),n}function qn(){return[...o.characterHouses.values()].map(e=>({houseRoomHrid:String(e.houseRoomHrid||""),level:Number(e.level)||0})).filter(e=>e.houseRoomHrid).sort((e,t)=>e.houseRoomHrid.localeCompare(t.houseRoomHrid))}function va(e,t=!1){if(!e||typeof e!="object")return!1;let i=!o.characterAchievementsReady;o.characterAchievementsReady=!0;let a=Array.isArray(e)?e.map(r=>[r&&(r.achievementHrid||r.hrid),r]):Object.entries(e);t&&o.characterAchievements.clear();let n=t||i;return a.forEach(([r,l])=>{let s=String(l&&(l.achievementHrid||l.hrid)||r||"").trim();if(!s)return;let c=typeof l=="object"?!!(l.isCompleted??l.completed):!!l,d={achievementHrid:s,isCompleted:c},u=o.characterAchievements.get(s);(!u||u.isCompleted!==c)&&(o.characterAchievements.set(s,d),n=!0)}),n}function Po(){return[...o.characterAchievements.values()].map(e=>({achievementHrid:String(e.achievementHrid||""),isCompleted:!!e.isCompleted})).filter(e=>e.achievementHrid).sort((e,t)=>e.achievementHrid.localeCompare(t.achievementHrid))}function Fn(e,t=!1){if(!e||typeof e!="object")return!1;let i=!o.achievementActionTypeBuffsReady;o.achievementActionTypeBuffsReady=!0;let a;try{a=JSON.parse(JSON.stringify(e))}catch{return!1}let n=i||JSON.stringify(o.achievementActionTypeBuffsMap)!==JSON.stringify(a);return(n||t)&&(o.achievementActionTypeBuffsMap=a),n}function $o(){let e=o.achievementActionTypeBuffsMap["/action_types/combat"]||o.achievementActionTypeBuffsMap.combat||[];return(Array.isArray(e)?e:e&&typeof e=="object"?Object.values(e):[]).filter(i=>i&&i.typeHrid).map(i=>({uniqueHrid:String(i.uniqueHrid||""),typeHrid:String(i.typeHrid||""),ratioBoost:Number(i.ratioBoost)||0,ratioBoostLevelBonus:Number(i.ratioBoostLevelBonus)||0,flatBoost:Number(i.flatBoost)||0,flatBoostLevelBonus:Number(i.flatBoostLevelBonus)||0,duration:Number(i.duration)||0,multiplierForSkillHrid:String(i.multiplierForSkillHrid||""),multiplierPerSkillLevel:Number(i.multiplierPerSkillLevel)||0}))}function zn(){let e=[...document.querySelectorAll("svg use")].map(i=>i.getAttribute("href")||i.getAttribute("xlink:href")||"").filter(Boolean),t=i=>{let a=e.find(n=>n.includes(i));return a?String(a).split("#")[0]:""};o.itemSpriteUrl=o.itemSpriteUrl||t("items_sprite"),o.abilitySpriteUrl=o.abilitySpriteUrl||t("abilities_sprite")||o.itemSpriteUrl,o.skillSpriteUrl=o.skillSpriteUrl||t("skills_sprite")}function xa(e){return W(o.itemDetailMap,e)}function Gn(e,t=""){let i=xa(e),a=i&&i.equipmentDetail&&i.equipmentDetail.type,n=a?W(o.equipmentTypeDetailMap,a):null;return n&&n.itemLocationHrid?String(n.itemLocationHrid):t&&t!=="/item_locations/inventory"?t:""}function Aa(){let e=new Map;for(let t of o.characterItems.values()){let i=xa(t.itemHrid);if(!i||!i.equipmentDetail)continue;let a=Gn(t.itemHrid,t.itemLocationHrid);if(!a)continue;let n=`${t.itemHrid}::${t.enhancementLevel}`,r=e.get(n)||{variantKey:n,itemHrid:t.itemHrid,name:U(t.itemHrid,i.name||t.itemHrid.split("/").pop()),itemLevel:se(i.itemLevel)||0,enhancementLevel:t.enhancementLevel,slotHrid:a,equipmentType:String(i.equipmentDetail.type||""),levelRequirements:Array.isArray(i.equipmentDetail.levelRequirements)?i.equipmentDetail.levelRequirements.map(l=>({skillHrid:String(l&&l.skillHrid||""),level:se(l&&l.level)||0})):[],count:0,equippedCount:0};r.count+=Math.max(0,Number(t.count)||0),t.itemLocationHrid!=="/item_locations/inventory"&&(r.equippedCount+=Math.max(0,Number(t.count)||0)),e.set(n,r)}return[...e.values()].sort((t,i)=>t.slotHrid.localeCompare(i.slotHrid)||i.itemLevel-t.itemLevel||i.enhancementLevel-t.enhancementLevel||t.name.localeCompare(i.name,"zh-TW"))}function Lt(e){if(e==null||e==="")return null;let t=Number(e);return!Number.isFinite(t)||t<=0?null:Math.round(t*10)/10}function Ge(e,t=""){if(e==null||e==="")return null;let i=e&&typeof e=="object"?e:null,a=Lt(i?i.value??i.total??i.score??i.buildScore:e);return a===null?null:{value:a,updatedAt:String(i&&(i.updatedAt||i.calculatedAt||i.marketUpdatedAt)||""),source:String(i&&i.source||t||""),house:i&&Number.isFinite(Number(i.house))?Number(i.house):null,ability:i&&Number.isFinite(Number(i.ability))?Number(i.ability):null,equipment:i&&Number.isFinite(Number(i.equipment))?Number(i.equipment):null,complete:i&&i.complete!==void 0?!!i.complete:!0,marketUpdatedAt:String(i&&i.marketUpdatedAt||"")}}function pi(e){let t=e&&typeof e=="object"?e:{},i=[t.adminCalculatedBuildScore,t.buildScore,t[J],t.lifeSkills?.[J],t.levels?.life?.[J],t.profile?.buildScore,t.profile?.lifeSkills?.[J],t.snapshot?.buildScore,t.snapshot?.lifeSkills?.[J],t.snapshot?.profile?.buildScore,t.snapshot?.profile?.lifeSkills?.[J],t.member?.buildScore,t.member?.adminCalculatedBuildScore,t.member?.snapshot?.profile?.lifeSkills?.[J]];for(let a of i){let n=Ge(a);if(n)return n}return null}function rt(e,t=!0){let i=Lt(e);if(i===null)return"—";let a=i.toLocaleString(Fe,{minimumFractionDigits:Number.isInteger(i)?0:1,maximumFractionDigits:1});return t?`${a} 分`:a}function ot(e,t){return e&&e.marketData&&e.marketData[t]||null}function It(e,t=.5){if(!e||!e[0])return 0;let i=Number(e[0].a)||0,a=Number(e[0].b)||0;return i>0&&a<0&&(a=i),a>0&&i<0&&(i=a),i*t+a*(1-t)}function Un(e){if(!e||!e.marketData)return null;for(let t of["/items/coin","/items/task_token","/items/cowbell","/items/small_treasure_chest","/items/medium_treasure_chest","/items/large_treasure_chest","/items/basic_task_badge","/items/advanced_task_badge","/items/expert_task_badge"])e.marketData[t]={0:{a:t==="/items/coin"?1:0,b:t==="/items/coin"?1:0}};return e}async function jn(e=!1){let t=Date.now();if(!e&&ci&&t-ze<_n)return ci;try{let n=Number(localStorage.getItem("MWITools_marketAPI_timestamp"))||0,r=localStorage.getItem("MWITools_marketAPI_json");if(!e&&r&&t-n<_n){let l=Un(JSON.parse(r));if(l)return ci=l,ze=n,l}}catch{}let i=await fetch("/game_data/marketplace.json",{method:"GET",cache:"no-store",credentials:"same-origin"});if(!i.ok)throw new Error(`市場價格讀取失敗（HTTP ${i.status}）。`);let a=Un(await i.json());if(!a)throw new Error("市場價格格式不正確。");ci=a,ze=t,xe.clear();try{localStorage.setItem("MWITools_marketAPI_timestamp",String(t)),localStorage.setItem("MWITools_marketAPI_json",JSON.stringify(a))}catch{}return a}function Wn(e,t){let i=t.length,a=e.map((n,r)=>[...n.map(Number),Number(t[r])||0]);for(let n=0;n<i;n+=1){let r=n;for(let s=n+1;s<i;s+=1)Math.abs(a[s][n])>Math.abs(a[r][n])&&(r=s);if(Math.abs(a[r][n])<1e-12)return null;r!==n&&([a[r],a[n]]=[a[n],a[r]]);let l=a[n][n];for(let s=n;s<=i;s+=1)a[n][s]/=l;for(let s=0;s<i;s+=1){if(s===n)continue;let c=a[s][n];if(!(Math.abs(c)<1e-15))for(let d=n;d<=i;d+=1)a[s][d]-=c*a[n][d]}}return a.map(n=>n[i])}function Oo(e,t,i){let a=Math.max(1,Math.min(20,Math.floor(Number(t)||0))),n=[50,45,45,40,40,40,35,35,35,35,30,30,30,30,30,30,30,30,30,30],r=Number(W(o.itemDetailMap,e)?.itemLevel)||1,l=yn,s=l.enhancingLevel+(l.teaEnhancing?3:0)+(l.teaSuperEnhancing?6:0)+(l.teaUltraEnhancing?8:0),c=s>=r?1+(.05*(s+l.laboratoryLevel-r)+l.enhancerBonus)/100:1-.5*(1-s/r)+(.05*l.laboratoryLevel+l.enhancerBonus)/100,d=Array.from({length:a},(h,b)=>Array.from({length:a},(y,x)=>b===x?1:0)),u=Array(a).fill(1),f=Array(a).fill(0);for(let h=0;h<a;h+=1){let b=n[h]/100*c,y=1-b,x=h>=i?h-1:0;(l.teaBlessed?[[h+2,b*.01],[h+1,b*.99],[x,y]]:[[h+1,b],[x,y]]).forEach(([v,T])=>{v>=0&&v<a&&(d[h][v]-=T)}),h>=i&&(f[h]=y)}let p=Wn(d,u),_=Wn(d,f);return{actions:p?p[0]:0,protectCount:_?_[0]:0}}function fi(e,t){return It(ot(t,e),yn.priceAskBidRatio)}function Vn(e){let t=String(e||"").replace("Milk","Cow").replace("Log","Tree").replace("Cowing","Milking").replace("Rainbow Cow","Unicow").replace("Collector's Boots","Collectors Boots").replace("Knight's Aegis","Knights Aegis"),i=ft(o.actionDetailMap).find(a=>a&&a.name===t);return i?String(i.hrid||""):""}function qo(e,t){let i=Vn(e),a=W(o.actionDetailMap,i);if(!a)return-1;let n=0;return(Array.isArray(a.inputItems)?a.inputItems:[]).forEach(r=>{n+=fi(r.itemHrid,t)*(Number(r.count)||0)}),n*=.9,a.upgradeItemHrid&&(n+=fi(a.upgradeItemHrid,t)),n}function Nt(e,t){let i=W(o.itemDetailMap,e);if(!i)return 0;let a=qo(i.name,t),n=ot(t,e),r=Number(n?.[0]?.a)||0,l=Number(n?.[0]?.b)||0;return r>0?l>0?r/l>1.3?Math.max(l,a):r:a>0&&r/a>1.3?a:Math.max(r,a):l>0?Math.max(l,a):a>0?a:0}function Fo(e,t){let i=W(o.itemDetailMap,e);if(!i)return null;let a=Nt(e,t),n=i.protectionItemHrids?[e,"/items/mirror_of_protection",...i.protectionItemHrids]:[e,"/items/mirror_of_protection"],r=Nt(n[0],t);n.slice(1).forEach(s=>{let c=Nt(s,t);c>0&&(r<=0||c<r)&&(r=c)});let l=0;return(Array.isArray(i.enhancementCosts)?i.enhancementCosts:[]).forEach(s=>{let c=String(s.itemHrid||"").startsWith("/items/trainee_")?25e4:Nt(s.itemHrid,t);l+=c*(Number(s.count)||0)}),{baseCost:a,minProtectCost:r,perActionCost:l}}function Kn(e,t,i){let a=`standard|${ze}|${e}|${t}`;if(xe.has(a))return xe.get(a);let n=Fo(e,i);if(!n)return null;let r=null;for(let l=2;l<=t;l+=1){let s=Oo(e,t,l),c=n.baseCost+n.minProtectCost*s.protectCount+n.perActionCost*s.actions;(!r||c<r.totalCost)&&(r={protectAt:l,totalCost:c})}return xe.set(a,r),r}function zo(e,t,i){let a=Math.max(0,Math.min(20,Math.floor(Number(t)||0))),n=`phi|${ze}|${e}|${a}`;if(xe.has(n))return xe.get(n);let r=Kn(e,a,i);if(!r||a<=3)return xe.set(n,r),r;let l=fi("/items/philosophers_mirror",i);if(l<=0)return xe.set(n,r),r;let s=e.includes("_refined"),c=s?e.replace("_refined",""):e,d={};for(let p=9;p<a;p+=1)d[p]=Kn(c,p,i);let u=0;if(s){let p=W(o.itemDetailMap,e),_=W(o.actionDetailMap,Vn(p&&p.name));(Array.isArray(_&&_.inputItems)?_.inputItems:[]).forEach(h=>{u+=fi(h.itemHrid,i)*(Number(h.count)||0)})}let f=[0,1,1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,1597,2584,4181];for(let p=10;p<a;p+=1){if(!d[p]||!d[p-1])continue;let _=f[a-p+1],h=f[a-p],b=_+h-1,y=_*d[p].totalCost+h*d[p-1].totalCost+l*b+u;y<r.totalCost&&(r={protectAt:p,totalCost:y})}return xe.set(n,r),r}function Go(e,t){let i=0;return(Array.isArray(e)?e:[]).forEach(a=>{let n=String(a&&a.houseRoomHrid||"");if(!so.some(s=>n.includes(s)))return;let r=W(o.houseRoomDetailMap,n),l=Math.max(0,Math.floor(Number(a.level)||0));for(let s=1;s<=l;s+=1){let c=W(r&&r.upgradeCostsMap,s);(Array.isArray(c)?c:[]).forEach(d=>{i+=(Number(d.count)||0)*It(ot(t,d.itemHrid))})}}),i/1e6}function Uo(e,t){let i=new Set(["poke","scratch","smack","quick_shot","water_strike","fireball","entangle","minor_heal"]),a=0;return(Array.isArray(e)?e:[]).forEach(n=>{let r=String(n&&n.abilityHrid||"");if(!r)return;let l=Math.max(0,Math.floor(Number(n.level)||0)),s=Number(W(o.levelExperienceTable,l))||0,c=r.split("/").pop(),d=i.has(c)?50:500,u=Number((s/d+1).toFixed(1));a+=u*It(ot(t,r.replace("/abilities/","/items/")))}),a/1e6}function jo(e,t){let i=0,a=!0,n=[];return(Array.isArray(e)?e:[]).forEach(r=>{let l=String(r&&(r.itemHrid||r.hrid)||""),s=Math.max(0,Number(r&&(r.equippedCount??r.count))||0);if(!l||s<=0)return;let c=Math.max(0,Math.floor(Number(r.enhancementLevel)||0));if(c>1){let u=zo(l,c,t);if(u&&Number(u.totalCost)>0){i+=s*Math.round(u.totalCost);return}let f=Nt(l,t)||It(ot(t,l));f>0&&(i+=s*f),a=!1,n.push({itemHrid:l,enhancementLevel:c,reason:"enhancement-cost-unavailable"});return}let d=It(ot(t,l));d>0?i+=s*d:(a=!1,n.push({itemHrid:l,enhancementLevel:c,reason:"market-price-unavailable"}))}),{value:i/1e6,complete:a,missingItems:n}}function Jn(e,t){let i=Go(e.houses,t),a=Uo(e.abilities,t),n=jo(e.equipment,t),r=n.value,l=i+a+r;return{value:Number(l.toFixed(1)),total:Number(l.toFixed(1)),house:Number(i.toFixed(1)),ability:Number(a.toFixed(1)),equipment:Number(r.toFixed(1)),complete:!!e.hasHouseData&&n.complete,missingItems:n.missingItems,updatedAt:new Date().toISOString(),marketUpdatedAt:new Date(ze||Date.now()).toISOString(),source:"管理員端即時市場計算"}}function Wo(){return[...o.admin.memberDetailCache.entries()].map(([e,t])=>{let i=t&&t.snapshot&&typeof t.snapshot=="object"?t.snapshot:t||{},a=i.profile&&typeof i.profile=="object"?i.profile:{},n=Array.isArray(i.equipment)?i.equipment:Array.isArray(t&&t.equipment)?t.equipment:[],r=Array.isArray(i.abilities)?i.abilities:Array.isArray(t&&t.abilities)?t.abilities:[],l=n.map(d=>{let u=Math.max(0,Number(d&&d.equippedCount)||0),f=String(d&&(d.itemHrid||d.hrid)||"");return!f||u<=0?null:{itemHrid:f,enhancementLevel:Math.max(0,Math.floor(Number(d&&d.enhancementLevel)||0)),equippedCount:u}}).filter(Boolean),s=r.map(d=>{if(!d||!d.equipped)return null;let u=String(d.abilityHrid||d.hrid||"");return u?{abilityHrid:u,level:Math.max(0,Math.floor(Number(d.level)||0))}:null}).filter(Boolean),c=Number(a.scoreInputVersion)>=wn&&Array.isArray(a.houses);return{characterId:String(e||""),revision:String(i.revision||""),updatedAt:String(i.updatedAt||""),scoreInputVersion:Math.max(0,Number(a.scoreInputVersion)||0),hasHouseData:c,houses:c?a.houses:[],equipment:l,abilities:s}}).filter(e=>e.characterId&&(e.equipment.length||e.abilities.length||e.hasHouseData))}function Vo(e,t){let i=t&&typeof t=="object"?t:{},a=i.snapshot&&typeof i.snapshot=="object"?i.snapshot:i.member?.snapshot&&typeof i.member.snapshot=="object"?i.member.snapshot:{},n=a.profile&&typeof a.profile=="object"?a.profile:i.profile&&typeof i.profile=="object"?i.profile:{},r=[n.buildScore,n.lifeSkills?.[J],a.buildScore,a.lifeSkills?.[J],i.buildScore,i.lifeSkills?.[J],e&&e.buildScore];for(let l of r){let s=Ge(l);if(s)return{...s,total:s.value,source:s.source||"成員上傳的內建 Talent Market 分數"}}return null}async function cc(e=!1){if(!V()||o.admin.scoreInputsLoading||!o.admin.members.length)return;o.admin.scoreInputsLoading=!0;let t=new Map(o.admin.members.map(a=>[A(a),a])),i=new Map;o.admin.members.forEach(a=>{let n=A(a),r=Vo(a,X(n));r&&!e?(i.set(n,r),a.adminCalculatedBuildScore={...r}):a.adminCalculatedBuildScore=null}),H();try{k("正在整理成員上傳分數，並計算尚未上傳分數的舊資料…");let a=Wo(),n=a.filter(f=>e||!i.has(String(f.characterId||""))),r=n.length?await jn(e):null,l=0,s=0,c=0;for(let f=0;f<a.length;f+=1){let p=a[f]||{},_=t.get(String(p.characterId||""));if(!_)continue;let h=i.get(String(p.characterId||"")),b=h||Jn(p,r);_.adminCalculatedBuildScore=b;let y=X(p.characterId);y&&fe(p.characterId,{...y,adminCalculatedBuildScore:{...b}}),b.complete||(c+=1),h?s+=1:l+=1,f%4===3&&await new Promise(x=>requestAnimationFrame(x))}o.admin.scoreInputsLoadedAt=new Date().toISOString(),n.length&&(o.admin.marketUpdatedAt=new Date(ze||Date.now()).toISOString());let d=t.get(o.admin.selectedCharacterId);d&&o.admin.memberDetail&&(o.admin.memberDetail.adminCalculatedBuildScore=d.adminCalculatedBuildScore,Ti()),H();let u=await ce();k(["已採用 "+s+" 位成員上傳分數"+(l?"，另以目前市場計算 "+l+" 位舊資料。":"。"),c?c+" 位資料仍有缺少項目，重新上傳後請按「重新整理全部資料」。":"分數資料完整。",u?"分數已寫入本機快照。":"分數已顯示，但本機快照寫入失敗。"].join(" "))}catch(a){k(a&&a.message?a.message:"管理員端分數計算失敗。",!0)}finally{o.admin.scoreInputsLoading=!1,H()}}function ka(e,t="",i=!0){let a=Lt(e);if(a===null)return!1;let n=o.buildScore.value!==a||o.buildScore.source!==String(t||"");return o.buildScore.value=a,o.buildScore.updatedAt=new Date().toISOString(),o.buildScore.source=String(t||"MWI Talent Market"),n&&i&&m&&gt(),n}function Ta(e=!1){try{let t=P&&P.MWI_INTEGRATED;if(!t||typeof t.getData!="function")return!1;let i=t.getData(),a=Ge(i&&i.buildScore,"MWI Szerra 角色資訊包／Talent Market");return a?ka(a.value,a.source,e):!1}catch{return!1}}function Ko(){try{Se(P,oo,e=>{let t=e&&e.detail||{},i=Ge(t.buildScore??t,"MWI Szerra 角色資訊包／Talent Market");i&&ka(i.value,i.source,!0)})}catch{}ti(()=>Ta(!0),1e4),Ne(()=>Ta(!0),1500)}function Jo(){return{hasHouseData:!0,houses:qn(),equipment:Aa().filter(e=>Number(e.equippedCount)>0).map(e=>({itemHrid:String(e.itemHrid||""),enhancementLevel:Math.max(0,Math.floor(Number(e.enhancementLevel)||0)),equippedCount:Math.max(0,Number(e.equippedCount)||0)})),abilities:[...o.allAbilities.values()].filter(e=>o.equippedAbilityHrids.has(e.abilityHrid)).map(e=>({abilityHrid:String(e.abilityHrid||""),level:Math.max(0,Math.floor(Number(e.level)||0))}))}}async function Yo(e){let t=D.capture(),i=await jn(!1);if(!D.isCurrent(t))throw new Error("角色已切換，略過先前角色的分數計算。");let a=Jn(Jo(),i);if(!a||Lt(a.value)===null)throw new Error("內建 Talent Market 分數尚未計算完成。");return a.source="公會資料插件內建 Talent Market 計算",a.inputSignature=String(e||""),o.localBuildScore=a,o.localBuildScoreInputSignature=String(e||""),ka(a.value,a.source,!0),a}function Xo(e){let t=se(e&&e.level);if(t===null)return null;let i=e&&Object.prototype.hasOwnProperty.call(e,"experience"),a=Number(e&&e.experience),n=Number(W(o.levelExperienceTable,t)),r=Number(W(o.levelExperienceTable,t+1));if(!i||!Number.isFinite(a)||!Number.isFinite(n)||!Number.isFinite(r)||r<=n)return t;let l=Math.min(1,Math.max(0,(a-n)/(r-n)));return t+l}function Yn(e){let t=Array.isArray(e)?e:[],i=new Map(t.map(s=>[String(s&&(s.skillHrid||s.hrid)||""),s])),a={};for(let[s,c]of Object.entries(uo)){let d=Xo(i.get(c));if(d===null)return null;a[s]=d}let n=Math.max(a.melee,a.ranged,a.magic),r=Math.max(a.attack,a.defense,a.melee,a.ranged,a.magic),l=.1*(a.stamina+a.intelligence+a.attack+a.defense+n)+.5*r;return Number(l.toFixed(2))}function Qo(e){document.readyState==="loading"?Se(document,"DOMContentLoaded",e,{once:!0}):e()}function Zo(e,t){let i=l=>String(l||"").trim().split(".").map(s=>Number.parseInt(s,10)||0),a=i(e),n=i(t),r=Math.max(a.length,n.length);for(let l=0;l<r;l+=1){let s=(a[l]||0)-(n[l]||0);if(s)return s>0?1:-1}return 0}function el(e){let t=String(e||"").match(/^[ \t]*\/\/[ \t]*@version[ \t]+([^\s]+)/m);return t?String(t[1]||"").trim():""}function tl(){try{let e=GM_getValue(be,""),t=e&&typeof e=="object"?e:JSON.parse(e||"{}");return{version:String(t&&t.version||""),until:Number(t&&t.until)||0}}catch{return{version:"",until:0}}}function il(e){try{GM_setValue(be,JSON.stringify({version:String(e||""),until:Date.now()+216e5}))}catch{}}function al(){return new Promise((e,t)=>{GM_xmlhttpRequest({method:"GET",url:`${Le}?t=${Math.floor(Date.now()/6e4)}`,timeout:ji,headers:{"Cache-Control":"no-cache"},onload(i){let a=Number(i&&i.status)||0;if(a<200||a>=300){t(new Error(`Update metadata HTTP ${a}`));return}let n=el(i&&i.responseText);if(!n){t(new Error("Update metadata has no version"));return}e(n)},onerror(){t(new Error("Update metadata request failed"))},ontimeout(){t(new Error("Update metadata request timed out"))}})})}function nl(e){if(!m||!m.shadow)return;let t=m.shadow.querySelector('[data-role="plugin-update-notice"]');t&&t.remove();let i=document.createElement("section");i.className="mwi-plugin-update-notice",i.dataset.role="plugin-update-notice",i.setAttribute("role","dialog"),i.setAttribute("aria-modal","false"),i.setAttribute("aria-label",G("插件有新版本"));let a=document.createElement("strong");a.className="mwi-plugin-update-title",a.textContent=G("插件有新版本");let n=document.createElement("div");n.className="mwi-plugin-update-message",n.textContent=G("建議立即更新，避免公會資料與通知功能不相容。");let r=document.createElement("div");r.className="mwi-plugin-update-versions",r.textContent=`${G("目前版本：")}${$}　${G("最新版本：")}${e}`;let l=document.createElement("div");l.className="mwi-plugin-update-actions";let s=document.createElement("button");s.type="button",s.className="mwi-button",s.textContent=G("稍後提醒"),s.addEventListener("click",()=>{il(e),oi="",i.remove()});let c=document.createElement("button");c.type="button",c.className="mwi-button primary",c.textContent=G("前往更新"),c.addEventListener("click",()=>{oi="",i.remove();let d=P.open(pe,"_blank");if(d)try{d.opener=null}catch{}else P.location.assign(pe)}),l.append(s,c),i.append(a,n,r,l),m.shadow.appendChild(i),oi=e}async function Xn(e=!1){if(aa)return;let t=Date.now(),i=Number(GM_getValue(ee,0))||0;if(!(!e&&t-i<36e5)){aa=!0;try{let a=await al();if(GM_setValue(ee,t),Zo(a,$)<=0||oi===a)return;let n=tl();if(n.version===a&&n.until>t)return;nl(a)}catch{}finally{aa=!1}}}function rl(){Ne(Xn,5e3),ti(Xn,36e5)}function ol(){let e=document.getElementById(Ui);e&&e.remove();let t=document.createElement("div");t.id=Ui,document.documentElement.appendChild(t),qe(()=>{t.isConnected&&t.remove()});let i=t.attachShadow({mode:"open"});i.innerHTML=ll(),m={host:t,shadow:i,openButton:i.querySelector('[data-role="open"]'),modal:i.querySelector('[data-role="modal"]'),closeButton:i.querySelector('[data-role="close"]'),refreshButton:i.querySelector('[data-role="refresh"]'),confirmButton:i.querySelector('[data-role="confirm"]'),copyButton:i.querySelector('[data-role="copy"]'),adminButton:i.querySelector('[data-role="admin-open"]'),equipmentSummary:i.querySelector('[data-role="equipment-summary"]'),statusDot:i.querySelector('[data-role="status-dot"]'),statusText:i.querySelector('[data-role="status-text"]'),characterName:i.querySelector('[data-role="character-name"]'),guildName:i.querySelector('[data-role="guild-name"]'),source:i.querySelector('[data-role="source"]'),updatedAt:i.querySelector('[data-role="updated-at"]'),savedMessage:i.querySelector('[data-role="saved-message"]'),skillGrid:i.querySelector('[data-role="skills"]'),combatGrid:i.querySelector('[data-role="combat-skills"]'),auraGrid:i.querySelector('[data-role="auras"]'),resultPanel:i.querySelector('[data-role="result-panel"]'),adminPanel:i.querySelector('[data-role="admin-panel"]'),adminLoginPanel:i.querySelector('[data-role="admin-login-panel"]'),adminPassword:i.querySelector('[data-role="admin-password"]'),adminLoginButton:i.querySelector('[data-role="admin-login"]'),adminLogoutButton:i.querySelector('[data-role="admin-logout"]'),adminWorkspace:i.querySelector('[data-role="admin-workspace"]'),adminStatus:i.querySelector('[data-role="admin-status"]'),adminSearch:i.querySelector('[data-role="admin-search"]'),adminSelectAll:i.querySelector('[data-role="admin-select-all"]'),adminClearSelection:i.querySelector('[data-role="admin-clear-selection"]'),adminSelectionCount:i.querySelector('[data-role="admin-selection-count"]'),adminNoticeOpen:i.querySelector('[data-role="admin-notice-open"]'),adminBatchPublish:i.querySelector('[data-role="admin-batch-publish"]'),adminMemberList:i.querySelector('[data-role="admin-member-list"]'),adminRefreshButton:i.querySelector('[data-role="admin-refresh"]'),adminCacheStatus:i.querySelector('[data-role="admin-cache-status"]')},Ca(m.skillGrid,ve,"skill"),Ca(m.combatGrid,Me,"combat"),Ca(m.auraGrid,Be,"aura"),ul(),kl(),V()&&window.setTimeout(()=>bi(),250),sl(),gt(),bs(),_s(),As(),ks()}function ll(){return`
            <style>
                :host { all: initial; }
                *, *::before, *::after { box-sizing: border-box; }
                [hidden] { display: none !important; }
                .mwi-open {
                    position: fixed;
                    top: 14px;
                    right: 270px;
                    z-index: 2147483000;
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    padding: 9px 12px;
                    border: 1px solid #9b8148;
                    border-radius: 8px;
                    background: linear-gradient(180deg, #3a3022, #241e17);
                    color: #f4e7bf;
                    font: 600 14px/1.2 Arial, "Microsoft JhengHei", sans-serif;
                    box-shadow: 0 3px 12px rgba(0, 0, 0, .45);
                    cursor: grab;
                    touch-action: none;
                    user-select: none;
                }
                .mwi-open.dragging { cursor: grabbing; filter: brightness(1.12); }
                .mwi-open:hover { filter: brightness(1.12); }
                .mwi-status-dot {
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                    background: #b75c54;
                    box-shadow: 0 0 0 2px rgba(183, 92, 84, .18);
                }
                .mwi-status-dot.ready {
                    background: #62bc7a;
                    box-shadow: 0 0 0 2px rgba(98, 188, 122, .18);
                }
                .mwi-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 2147483001;
                    display: grid;
                    place-items: center;
                    padding: 4px;
                    overflow: hidden;
                    overscroll-behavior: contain;
                    background: rgba(8, 9, 12, .72);
                    font-family: Arial, "Microsoft JhengHei", sans-serif;
                }
                .mwi-modal {
                    display: flex;
                    flex-direction: column;
                    width: min(1600px, calc(100vw - 16px));
                    max-height: calc(100vh - 12px);
                    max-height: calc(100dvh - 12px);
                    min-height: 0;
                    overflow: hidden;
                    border: 1px solid #8d784b;
                    border-radius: 12px;
                    background: #17191f;
                    color: #e8e8ea;
                    box-shadow: 0 16px 60px rgba(0, 0, 0, .65);
                }
                .mwi-header {
                    flex: 0 0 auto;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 8px 12px;
                    border-bottom: 1px solid #3a3d46;
                    background: #20232b;
                }
                .mwi-title { margin: 0; color: #f2d990; font-size: 16px; }
                .mwi-close {
                    width: 28px;
                    height: 28px;
                    border: 1px solid #545866;
                    border-radius: 7px;
                    background: #2c3039;
                    color: #fff;
                    font-size: 18px;
                    cursor: pointer;
                }
                .mwi-content {
                    flex: 1 1 auto;
                    min-height: 0;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 7px;
                    padding: 8px 10px 10px;
                    overflow-x: hidden;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    scrollbar-gutter: stable;
                    touch-action: pan-y;
                    -webkit-overflow-scrolling: touch;
                }
                .mwi-status-line {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    grid-column: 1 / -1;
                    margin: 0;
                    color: #c9cbd1;
                    font-size: 12px;
                }
                .mwi-info-grid {
                    grid-column: 1 / -1;
                    display: grid;
                    grid-template-columns: repeat(4, 62px minmax(0, 1fr));
                    gap: 4px 7px;
                    padding: 7px 8px;
                    border: 1px solid #343844;
                    border-radius: 8px;
                    background: #1d2027;
                    font-size: 12px;
                }
                .mwi-label { color: #9fa4b0; }
                .mwi-value { min-width: 0; overflow-wrap: anywhere; color: #f0f1f3; }
                .mwi-section {
                    margin: 0;
                    padding: 7px;
                    border: 1px solid #343844;
                    border-radius: 8px;
                    background: #1a1d24;
                }
                .mwi-section h3 {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin: 0 0 5px;
                    color: #e7cf91;
                    font-size: 13px;
                }
                .mwi-level-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 4px;
                }
                .mwi-combat .mwi-level-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                .mwi-level-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 7px;
                    padding: 4px 7px;
                    border: 1px solid #343844;
                    border-radius: 7px;
                    background: #1d2027;
                    font-size: 12px;
                }
                .mwi-level-name { color: #c9cbd0; }
                .mwi-level-value { color: #8ed29f; font-weight: 700; }
                .mwi-select {
                    width: 100%;
                    min-height: 32px;
                    padding: 5px 7px;
                    border: 1px solid #656b78;
                    border-radius: 7px;
                    background: #242832;
                    color: #f3f3f4;
                    font: 12px Arial, "Microsoft JhengHei", sans-serif;
                }
                .mwi-select:focus { outline: 2px solid #6f96c8; outline-offset: 1px; }
                .mwi-weapon-list { display: grid; gap: 4px; }
                .mwi-weapon-row { display: flex; align-items: center; gap: 5px; }
                .mwi-weapon-row .mwi-select { flex: 1; min-width: 0; }
                .mwi-equipment-summary {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 4px;
                    color: #c9cbd0;
                    font-size: 11px;
                }
                .mwi-equipment-summary > span {
                    padding: 5px 7px;
                    border: 1px solid #343844;
                    border-radius: 7px;
                    background: #1d2027;
                }
                .mwi-icon-button {
                    flex: 0 0 auto;
                    width: 29px;
                    height: 29px;
                    padding: 0;
                    border: 1px solid #656b78;
                    border-radius: 7px;
                    background: #2b303a;
                    color: #f2d990;
                    font: 700 18px/1 Arial, sans-serif;
                    cursor: pointer;
                }
                .mwi-icon-button.remove { color: #e9a09a; font-size: 16px; }
                .mwi-saved {
                    grid-column: 1 / -1;
                    min-height: 20px;
                    margin: 0;
                    color: #80c894;
                    font-size: 13px;
                }
                .mwi-actions {
                    grid-column: 1 / -1;
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    gap: 9px;
                    margin: 0;
                }
                .mwi-button {
                    min-height: 32px;
                    padding: 6px 10px;
                    border: 1px solid #5b6170;
                    border-radius: 7px;
                    background: #2b303a;
                    color: #f0f0f2;
                    font: 600 12px Arial, "Microsoft JhengHei", sans-serif;
                    cursor: pointer;
                }
                .mwi-button:hover:not(:disabled) { filter: brightness(1.15); }
                .mwi-button.primary { border-color: #7a9b68; background: #36533b; }
                .mwi-button.secondary { border-color: #557da3; background: #2b4661; }
                .mwi-button:disabled { opacity: .45; cursor: not-allowed; }
                .mwi-result-panel {
                    grid-column: 1 / -1;
                    margin: 0;
                    padding: 8px;
                    border: 1px solid #3e4655;
                    border-radius: 8px;
                    background: #1b2029;
                    color: #d9dde5;
                    font-size: 12px;
                    line-height: 1.35;
                }
                .mwi-admin-panel {
                    grid-column: 1 / -1;
                    padding: 8px;
                    border: 1px solid #66512b;
                    border-radius: 9px;
                    background: #181c25;
                }
                .mwi-admin-login {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    flex-wrap: wrap;
                }
                .mwi-admin-input {
                    min-width: 150px;
                    min-height: 32px;
                    padding: 5px 8px;
                    border: 1px solid #5b6170;
                    border-radius: 7px;
                    background: #242832;
                    color: #fff;
                }
                .mwi-admin-status { flex: 1; color: #e7cf91; font-size: 12px; }
                .mwi-admin-cache-status {
                    flex: 1 0 100%;
                    color: #9fb3c8;
                    font-size: 11px;
                }
                .mwi-admin-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                    margin-bottom: 7px;
                }
                .mwi-admin-sort-controls {
                    display: none;
                }
                .mwi-talent-panel {
                    display: grid;
                    gap: 8px;
                    margin: 0 0 7px;
                    padding: 9px;
                    border: 1px solid #49627b;
                    border-radius: 9px;
                    background: #19222d;
                }
                .mwi-talent-heading {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .mwi-talent-title {
                    display: grid;
                    gap: 2px;
                    color: #e9d18d;
                    font-size: 13px;
                }
                .mwi-talent-title small {
                    color: #9eabba;
                    font-size: 10px;
                    font-weight: 400;
                    line-height: 1.35;
                }
                .mwi-talent-summary {
                    color: #a9c9eb;
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                    text-align: right;
                }
                .mwi-talent-controls {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(125px, 1fr));
                    gap: 6px;
                }
                .mwi-talent-field {
                    display: grid;
                    gap: 3px;
                    color: #9fa8b7;
                    font-size: 10px;
                }
                .mwi-talent-control {
                    width: 100%;
                    min-width: 0;
                    min-height: 31px;
                    padding: 4px 7px;
                    border: 1px solid #59687a;
                    border-radius: 7px;
                    background: #242c38;
                    color: #f1f3f7;
                    font: 12px Arial, "Microsoft JhengHei", sans-serif;
                }
                .mwi-talent-quick-actions {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    flex-wrap: wrap;
                }
                .mwi-talent-quick-actions .mwi-button:last-child {
                    margin-left: auto;
                }
                .mwi-talent-skill-groups {
                    display: grid;
                    gap: 6px;
                }
                .mwi-talent-skill-group {
                    display: grid;
                    grid-template-columns: 78px minmax(0, 1fr);
                    align-items: start;
                    gap: 6px;
                }
                .mwi-talent-skill-group-title {
                    padding-top: 5px;
                    color: #aeb7c5;
                    font-size: 10px;
                    font-weight: 700;
                }
                .mwi-talent-skill-list {
                    display: flex;
                    gap: 4px;
                    flex-wrap: wrap;
                }
                .mwi-talent-skill-button {
                    min-height: 27px;
                    padding: 4px 8px;
                    border: 1px solid #4c586a;
                    border-radius: 999px;
                    background: #252d39;
                    color: #bac3d0;
                    font: 600 11px Arial, "Microsoft JhengHei", sans-serif;
                    cursor: pointer;
                }
                .mwi-talent-skill-button:hover { filter: brightness(1.16); }
                .mwi-talent-skill-button.active {
                    border-color: #d1ae55;
                    background: #4e4326;
                    color: #ffe399;
                    box-shadow: inset 0 0 0 1px rgba(255, 227, 153, .2);
                }
                .mwi-talent-skill-button[data-group="life"].active {
                    border-color: #4fa47d;
                    background: #25493c;
                    color: #9becbd;
                }
                .mwi-talent-skill-button[data-group="combat"].active {
                    border-color: #5e92c5;
                    background: #263f5b;
                    color: #a9d5ff;
                }
                .mwi-talent-skill-button[data-group="ability"].active {
                    border-color: #8b6bb4;
                    background: #3a2d4e;
                    color: #d9b9ff;
                }
                .mwi-talent-stats {
                    display: flex;
                    gap: 5px;
                    flex-wrap: wrap;
                    min-height: 25px;
                }
                .mwi-talent-stat {
                    padding: 4px 7px;
                    border: 1px solid #3f4c5c;
                    border-radius: 999px;
                    background: #202936;
                    color: #cbd4df;
                    font-size: 10px;
                    font-variant-numeric: tabular-nums;
                }
                .mwi-talent-stat.strong {
                    border-color: #7a6840;
                    color: #ffe09a;
                }
                .mwi-talent-results {
                    max-height: 390px;
                    overflow: auto;
                    border: 1px solid #3b4655;
                    border-radius: 8px;
                    background: #151b23;
                }
                .mwi-talent-empty {
                    padding: 18px;
                    color: #99a3b1;
                    font-size: 12px;
                    text-align: center;
                }
                .mwi-talent-table {
                    width: max-content;
                    min-width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    color: #e4e8ee;
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                }
                .mwi-talent-table th,
                .mwi-talent-table td {
                    min-width: 62px;
                    height: 34px;
                    padding: 4px 7px;
                    border-right: 1px solid #303846;
                    border-bottom: 1px solid #303846;
                    text-align: center;
                    white-space: nowrap;
                }
                .mwi-talent-table th {
                    position: sticky;
                    top: 0;
                    z-index: 3;
                    background: #303948;
                    color: #dce2ec;
                    font-weight: 700;
                }
                .mwi-talent-table th.name,
                .mwi-talent-table td.name {
                    min-width: 145px;
                    text-align: left;
                }
                .mwi-talent-table th.note,
                .mwi-talent-table td.note {
                    min-width: 180px;
                    padding: 3px 5px;
                    text-align: left;
                }
                .mwi-talent-table th.role,
                .mwi-talent-table td.role {
                    min-width: 88px;
                    padding: 3px 5px;
                }
                .mwi-talent-table tbody tr { cursor: pointer; }
                .mwi-talent-table tbody tr:hover td { background: #263244; }
                .mwi-talent-table td.name { color: #f2f4f7; font-weight: 700; }
                .mwi-talent-table td.qualified { color: #91d9a5; font-weight: 700; }
                .mwi-talent-table td.below { color: #e9b07e; }
                .mwi-talent-table td.missing { color: #858d99; }
                .mwi-talent-table td.metric { color: #acd4ff; font-weight: 700; }
                .mwi-talent-table td.updated { color: #9ba9ba; font-size: 10px; }
                .mwi-talent-check {
                    width: 16px;
                    height: 16px;
                    margin: 0;
                    accent-color: #6f9f77;
                    cursor: pointer;
                }
                .mwi-admin-batch-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                    margin: 0 0 7px;
                    padding: 7px;
                    border: 1px solid #3f4d63;
                    border-radius: 8px;
                    background: #202633;
                }
                .mwi-admin-selection-count {
                    min-width: 84px;
                    color: #b8c7dc;
                    font-size: 12px;
                    font-variant-numeric: tabular-nums;
                }
                .mwi-admin-batch-toolbar .mwi-button.primary {
                    margin-left: auto;
                }
                .mwi-admin-notice-overlay {
                    position: fixed !important;
                    inset: 0 !important;
                    z-index: 2147483647 !important;
                    display: grid !important;
                    place-items: center;
                    width: 100vw;
                    height: 100vh;
                    height: 100dvh;
                    max-width: none;
                    max-height: none;
                    margin: 0;
                    padding: 8px;
                    border: 0;
                    background: rgba(5, 7, 11, .88);
                    color: #e8e8ea;
                    font-family: Arial, "Microsoft JhengHei", sans-serif;
                }
                .mwi-admin-notice-overlay::backdrop {
                    background: transparent;
                }
                .mwi-admin-notice-overlay .mwi-choice-dialog {
                    width: min(760px, calc(100vw - 22px));
                    max-height: min(82vh, 720px);
                    max-height: min(82dvh, 720px);
                }
                .mwi-admin-notice-content {
                    display: grid;
                    gap: 10px;
                    padding: 14px;
                }
                .mwi-admin-notice-targets {
                    display: grid;
                    gap: 7px;
                    padding: 10px;
                    border: 1px solid #414a59;
                    border-radius: 8px;
                    background: #20242d;
                    color: #d8dde7;
                    font-size: 13px;
                }
                .mwi-admin-notice-targets label {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    cursor: pointer;
                }
                .mwi-admin-notice-textarea {
                    width: 100%;
                    min-height: 170px;
                    resize: vertical;
                    padding: 10px;
                    border: 1px solid #596171;
                    border-radius: 8px;
                    background: #181c24;
                    color: #fff;
                    font: 14px/1.5 Arial, "Microsoft JhengHei", sans-serif;
                }
                .mwi-admin-notice-actions {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .mwi-sort-button {
                    width: 100%;
                    min-width: 0;
                    min-height: 34px;
                    padding: 4px 3px;
                    border: 0;
                    border-right: 1px solid #4c5362;
                    border-radius: 0;
                    background: #303747;
                    color: #cbd0da;
                    cursor: pointer;
                    font-size: 11px;
                    line-height: 1.15;
                    white-space: normal;
                }
                .mwi-sort-button:hover { background: #3a4356; }
                .mwi-sort-button.active { background: #514728; color: #ffe49a; }
                .mwi-admin-layout {
                    min-height: 300px;
                }
                .mwi-local-manager-only { display: none !important; }
                .mwi-admin-members {
                    max-height: 520px;
                    overflow: auto;
                    border: 1px solid #343844;
                    border-radius: 8px;
                    background: #151820;
                }
                .mwi-member-table {
                    --mwi-member-table-columns:
                        38px 150px 180px 64px 92px 168px 128px 118px 82px 96px
                        repeat(22, 68px) 132px;
                    width: max-content;
                    min-width: 100%;
                }
                .mwi-member-table.mwi-publish-table {
                    --mwi-member-table-columns: 38px minmax(150px, 1fr) 180px 180px 180px 116px;
                    width: 100%;
                }
                .mwi-publish-table .mwi-member-row {
                    cursor: default;
                }
                .mwi-publish-table .mwi-member-table-header > :nth-child(n),
                .mwi-publish-table .mwi-member-row > :nth-child(n) {
                    position: static;
                    left: auto;
                    box-shadow: none;
                }
                .mwi-member-table-header,
                .mwi-member-row {
                    display: grid;
                    grid-template-columns: var(--mwi-member-table-columns);
                    width: max-content;
                    min-width: 100%;
                }
                .mwi-member-table-header {
                    position: sticky;
                    top: 0;
                    z-index: 8;
                    min-height: 34px;
                    border-bottom: 1px solid #566074;
                    background: #303747;
                }
                .mwi-member-header-label {
                    display: flex;
                    align-items: center;
                    padding: 4px 7px;
                    border-right: 1px solid #4c5362;
                    background: #303747;
                    color: #d7dce6;
                    font-size: 11px;
                    font-weight: 700;
                }
                .mwi-member-row {
                    align-items: stretch;
                    padding: 0;
                    border: 0;
                    border-bottom: 1px solid #2d323d;
                    background: transparent;
                    color: #e7e9ed;
                    text-align: left;
                    cursor: pointer;
                }
                .mwi-member-row:hover, .mwi-member-row.active { background: #293142; }
                .mwi-member-row.missing { cursor: default; opacity: .68; }
                .mwi-member-select-cell {
                    display: grid;
                    place-items: center;
                    min-height: 34px;
                    border-right: 1px solid #2d323d;
                }
                .mwi-member-select-cell input {
                    width: 16px;
                    height: 16px;
                    margin: 0;
                    accent-color: #6f9f77;
                    cursor: pointer;
                }
                .mwi-member-select-cell input:disabled { cursor: default; }
                .mwi-member-cell {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                    min-height: 34px;
                    padding: 4px 7px;
                    border-right: 1px solid #2d323d;
                    color: #c8cfdb;
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .mwi-member-cell.score {
                    color: #ffd878;
                    font-weight: 700;
                }
                .mwi-member-cell.combat-level {
                    justify-content: center;
                    color: #ffb08f;
                    font-weight: 700;
                }
                .mwi-member-cell.name { color: #f1f3f7; font-weight: 700; }
                .mwi-member-note-cell {
                    padding: 3px 5px;
                }
                .mwi-member-note-input,
                .mwi-talent-note-input {
                    width: 100%;
                    min-width: 0;
                    border: 1px solid #485267;
                    border-radius: 4px;
                    background: #171b23;
                    color: #f1dda0;
                    font: inherit;
                    line-height: 1.35;
                }
                .mwi-member-note-input {
                    height: 27px;
                    padding: 3px 6px;
                }
                .mwi-talent-note-input {
                    min-width: 150px;
                    padding: 4px 6px;
                }
                .mwi-member-note-input:focus,
                .mwi-talent-note-input:focus {
                    border-color: #d0b15e;
                    outline: 1px solid rgba(208, 177, 94, .35);
                }
                .mwi-member-note-input.saving,
                .mwi-talent-note-input.saving,
                .mwi-member-group-select.saving,
                .mwi-talent-group-select.saving,
                .mwi-member-role-select.saving,
                .mwi-talent-role-select.saving {
                    opacity: .65;
                }
                .mwi-member-cell.order { justify-content: center; color: #b9c1cf; }
                .mwi-member-group-cell,
                .mwi-member-role-cell {
                    padding: 3px 5px;
                }
                .mwi-member-group-select,
                .mwi-talent-group-select,
                .mwi-member-role-select,
                .mwi-talent-role-select {
                    width: 100%;
                    min-width: 0;
                    height: 27px;
                    padding: 2px 5px;
                    border: 1px solid #5b755f;
                    border-radius: 4px;
                    background: #171b23;
                    color: #bce8c2;
                    font: inherit;
                    cursor: pointer;
                }
                .mwi-talent-role-select {
                    min-width: 78px;
                }
                .mwi-talent-group-select {
                    min-width: 54px;
                }
                .mwi-member-group-select,
                .mwi-talent-group-select {
                    border-color: #6d6b8d;
                    color: #d7d4ff;
                }
                .mwi-member-group-select:focus,
                .mwi-talent-group-select:focus,
                .mwi-member-role-select:focus,
                .mwi-talent-role-select:focus {
                    border-color: #7fc28a;
                    outline: 1px solid rgba(127, 194, 138, .35);
                }
                .mwi-member-group-select:disabled,
                .mwi-talent-group-select:disabled,
                .mwi-member-role-select:disabled,
                .mwi-talent-role-select:disabled {
                    color: #8991a0;
                    cursor: default;
                }
                .mwi-member-aura-cell {
                    padding: 3px 5px;
                }
                .mwi-member-aura-select {
                    width: 100%;
                    min-width: 0;
                    height: 27px;
                    padding: 2px 5px;
                    border: 1px solid #665d86;
                    border-radius: 4px;
                    background: #171b23;
                    color: #e3caff;
                    font: inherit;
                    cursor: pointer;
                }
                .mwi-member-aura-select:focus {
                    border-color: #bc94ef;
                    outline: 1px solid rgba(188, 148, 239, .35);
                }
                .mwi-member-aura-select:disabled {
                    color: #8991a0;
                    cursor: default;
                }
                .mwi-member-trial-cell {
                    padding: 3px 5px;
                }
                .mwi-member-trial-select {
                    width: 100%;
                    min-width: 0;
                    height: 27px;
                    padding: 2px 5px;
                    border: 1px solid #55769b;
                    border-radius: 4px;
                    background: #171b23;
                    color: #b9d9ff;
                    font: inherit;
                    cursor: pointer;
                }
                .mwi-member-trial-select.battle {
                    border-color: #8c5e58;
                    color: #ffc2b8;
                }
                .mwi-member-trial-select:focus {
                    border-color: #82b7ef;
                    outline: 1px solid rgba(130, 183, 239, .35);
                }
                .mwi-member-trial-select:disabled {
                    color: #8991a0;
                    cursor: default;
                }
                .mwi-member-cell.updated { color: #9dc9ff; }
                .mwi-member-cell.life { justify-content: center; color: #86d69b; font-weight: 700; }
                .mwi-member-cell.combat { justify-content: center; color: #8fc7ff; font-weight: 700; }
                .mwi-member-cell.ability { justify-content: center; color: #d7b2ff; font-weight: 700; }
                .mwi-member-table-header > :first-child,
                .mwi-member-row > :first-child {
                    position: sticky;
                    left: 0;
                    z-index: 5;
                    background: #1c212b;
                }
                .mwi-member-table-header > :nth-child(2),
                .mwi-member-row > :nth-child(2) {
                    position: sticky;
                    left: 38px;
                    z-index: 5;
                    background: #1c212b;
                }
                .mwi-member-table-header > :nth-child(3),
                .mwi-member-row > :nth-child(3) {
                    position: sticky;
                    left: 188px;
                    z-index: 5;
                    background: #1c212b;
                }
                .mwi-member-table-header > :nth-child(4),
                .mwi-member-row > :nth-child(4) {
                    position: sticky;
                    left: 368px;
                    z-index: 5;
                    background: #1c212b;
                }
                .mwi-member-table-header > :nth-child(5),
                .mwi-member-row > :nth-child(5) {
                    position: sticky;
                    left: 432px;
                    z-index: 5;
                    background: #1c212b;
                }
                .mwi-member-table-header > :nth-child(6),
                .mwi-member-row > :nth-child(6) {
                    position: sticky;
                    left: 524px;
                    z-index: 5;
                    box-shadow: 2px 0 0 #3b4250;
                    background: #1c212b;
                }
                .mwi-member-table-header > :first-child,
                .mwi-member-table-header > :nth-child(2),
                .mwi-member-table-header > :nth-child(3),
                .mwi-member-table-header > :nth-child(4),
                .mwi-member-table-header > :nth-child(5),
                .mwi-member-table-header > :nth-child(6) {
                    z-index: 10;
                    background: #303747;
                }
                .mwi-member-row:hover > :first-child,
                .mwi-member-row:hover > :nth-child(2),
                .mwi-member-row:hover > :nth-child(3),
                .mwi-member-row:hover > :nth-child(4),
                .mwi-member-row:hover > :nth-child(5),
                .mwi-member-row:hover > :nth-child(6),
                .mwi-member-row.active > :first-child,
                .mwi-member-row.active > :nth-child(2),
                .mwi-member-row.active > :nth-child(3),
                .mwi-member-row.active > :nth-child(4),
                .mwi-member-row.active > :nth-child(5),
                .mwi-member-row.active > :nth-child(6) { background: #293142; }
                .mwi-member-uploaded { color: #83d397; }
                .mwi-member-missing { color: #e5a5a0; }
                .mwi-admin-detail {
                    padding: 8px;
                    background: #151820;
                }
                .mwi-admin-member-overlay,
                .mwi-choice-overlay {
                    position: absolute;
                    inset: 0;
                    z-index: 100;
                    display: grid;
                    place-items: center;
                    padding: 8px;
                    overflow: hidden;
                    background: rgba(5, 7, 11, .86);
                    font-family: Arial, "Microsoft JhengHei", sans-serif;
                }
                .mwi-choice-overlay { z-index: 110; background: rgba(5, 7, 11, .76); }
                .mwi-admin-member-dialog,
                .mwi-choice-dialog {
                    display: flex;
                    flex-direction: column;
                    width: min(1480px, calc(100vw - 18px));
                    max-height: calc(100vh - 18px);
                    max-height: calc(100dvh - 18px);
                    min-height: 0;
                    overflow: hidden;
                    border: 1px solid #8d784b;
                    border-radius: 12px;
                    background: #151820;
                    color: #e8e8ea;
                    box-shadow: 0 18px 70px rgba(0, 0, 0, .76);
                }
                .mwi-choice-dialog {
                    width: min(760px, calc(100vw - 22px));
                    max-height: min(82vh, 720px);
                    max-height: min(82dvh, 720px);
                    border-color: #687da8;
                }
                .mwi-admin-member-dialog .mwi-admin-detail {
                    flex: 1 1 auto;
                    min-height: 0;
                    max-height: none;
                    overflow-x: hidden;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    touch-action: pan-y;
                    -webkit-overflow-scrolling: touch;
                }
                .mwi-choice-list {
                    flex: 1 1 auto;
                    min-height: 0;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
                    align-content: start;
                    gap: 7px;
                    padding: 10px;
                    overflow-x: hidden;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    touch-action: pan-y;
                    -webkit-overflow-scrolling: touch;
                }
                .mwi-choice-empty {
                    grid-column: 1 / -1;
                    padding: 24px;
                    color: #9ba3b1;
                    text-align: center;
                }
                .mwi-member-summary-strip { margin: 0; }
                .mwi-member-profile-layout {
                    display: grid;
                    grid-template-columns: minmax(290px, 330px) minmax(0, 1fr);
                    align-items: start;
                    gap: 9px;
                    margin-top: 5px;
                }
                .mwi-profile-levels {
                    display: grid;
                    gap: 7px;
                    min-width: 0;
                }
                .mwi-profile-level-section,
                .mwi-plan-workspace {
                    min-width: 0;
                    padding: 8px;
                    border: 1px solid #3d4554;
                    border-radius: 9px;
                    background: #191e27;
                }
                .mwi-profile-level-section h3 {
                    margin: 0 0 5px;
                    color: #e5c978;
                    font-size: 12px;
                }
                .mwi-profile-level-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 4px;
                }
                .mwi-profile-level-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                    min-width: 0;
                    padding: 5px 7px;
                    border: 1px solid #353d4b;
                    border-radius: 7px;
                    background: #202632;
                    color: #cbd1dc;
                    font-size: 11px;
                }
                .mwi-profile-level-row strong { color: #91d3a3; font-size: 12px; }
                .mwi-draft-toolbar {
                    display: grid;
                    grid-template-columns: minmax(170px, 1fr) minmax(150px, .75fr) auto auto;
                    align-items: center;
                    gap: 5px;
                    margin-bottom: 5px;
                }
                .mwi-draft-toolbar.mwi-sidebar-plan-controls {
                    grid-template-columns: minmax(0, 1fr);
                    align-items: stretch;
                    margin: 0;
                    padding: 8px;
                    border: 1px solid #3d4554;
                    border-radius: 9px;
                    background: #191e27;
                }
                .mwi-sidebar-plan-controls > .mwi-button { justify-self: start; }
                .mwi-profile-levels .mwi-member-summary-strip {
                    grid-template-columns: minmax(0, 1fr);
                }
                .mwi-draft-toolbar-label {
                    display: block;
                    margin-bottom: 3px;
                    color: #9fa8b7;
                    font-size: 10px;
                }
                .mwi-workbench-host { min-width: 0; }
                .mwi-plan-card.workbench { margin-top: 0; }
                .mwi-plan-card.workbench .mwi-plan-head {
                    grid-template-columns: auto minmax(130px, 1fr);
                }
                .mwi-icon-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(66px, 1fr));
                    gap: 5px;
                    margin: 5px 0 10px;
                }
                .mwi-icon-card {
                    min-height: 67px;
                    padding: 4px;
                    border: 1px solid #444c5d;
                    border-radius: 8px;
                    background: #202632;
                    color: #e7e9ed;
                    text-align: center;
                    font-size: 10px;
                    overflow: hidden;
                }
                .mwi-icon-card svg { display: block; width: 34px; height: 34px; margin: 0 auto 2px; }
                .mwi-icon-card .level { color: #f3cf75; font-weight: 700; }
                .mwi-plan-card {
                    margin-top: 8px;
                    padding: 8px;
                    border: 1px solid #4a5364;
                    border-radius: 8px;
                    background: #1d2330;
                }
                .mwi-plan-card.life { border-color: #3c806a; }
                .mwi-plan-card.battle { border-color: #8c5548; }
                .mwi-plan-card.published { box-shadow: inset 0 0 0 1px #d9b85f; }
                .mwi-plan-head {
                    display: grid;
                    grid-template-columns: auto minmax(120px, 1fr) minmax(150px, 1fr) auto;
                    align-items: center;
                    gap: 5px;
                }
                .mwi-plan-type {
                    display: inline-flex;
                    align-items: center;
                    min-height: 32px;
                    padding: 4px 9px;
                    border: 1px solid #5b6170;
                    border-radius: 7px;
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .mwi-plan-type.life { border-color: #4d997f; background: #25473d; }
                .mwi-plan-type.battle { border-color: #a26354; background: #4d2f2a; }
                .mwi-plan-section-title {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    margin: 9px 0 4px;
                    color: #c9d1df;
                    font-size: 12px;
                    font-weight: 700;
                }
                .mwi-game-equipment-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(78px, 104px));
                    grid-template-areas:
                        "back head trinket"
                        "weapon body offhand"
                        "hands legs pouch"
                        ". feet .";
                    justify-content: start;
                    gap: 7px;
                    margin-top: 7px;
                }
                .mwi-slot-field[data-visual-slot="back"] { grid-area: back; }
                .mwi-slot-field[data-visual-slot="head"] { grid-area: head; }
                .mwi-slot-field[data-visual-slot="trinket"] { grid-area: trinket; }
                .mwi-slot-field[data-visual-slot="weapon"] { grid-area: weapon; }
                .mwi-slot-field[data-visual-slot="body"] { grid-area: body; }
                .mwi-slot-field[data-visual-slot="offhand"] { grid-area: offhand; }
                .mwi-slot-field[data-visual-slot="hands"] { grid-area: hands; }
                .mwi-slot-field[data-visual-slot="legs"] { grid-area: legs; }
                .mwi-slot-field[data-visual-slot="pouch"] { grid-area: pouch; }
                .mwi-slot-field[data-visual-slot="feet"] { grid-area: feet; }
                .mwi-tool-slot-scroll,
                .mwi-skill-slot-scroll {
                    max-width: 100%;
                    overflow-x: auto;
                    overscroll-behavior-x: contain;
                }
                .mwi-tool-slot-grid {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(78px, 100px));
                    justify-content: start;
                    gap: 7px;
                    min-width: 418px;
                    padding-bottom: 2px;
                }
                .mwi-slot-field { min-width: 0; }
                .mwi-slot-field > label {
                    display: block;
                    margin-bottom: 3px;
                    overflow: hidden;
                    color: #9fa8b7;
                    font-size: 10px;
                    text-align: center;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .mwi-slot-select-source,
                .mwi-plan-skill-state { display: none !important; }
                .mwi-equipment-slot,
                .mwi-selected-skill,
                .mwi-add-skill,
                .mwi-choice-card {
                    position: relative;
                    width: 100%;
                    min-height: 88px;
                    padding: 5px;
                    border: 1px solid #56617a;
                    border-radius: 8px;
                    background: #252c3a;
                    color: #edf0f5;
                    text-align: center;
                    cursor: pointer;
                    overflow: hidden;
                }
                .mwi-equipment-slot:hover:not(:disabled),
                .mwi-selected-skill:hover:not(:disabled),
                .mwi-add-skill:hover:not(:disabled),
                .mwi-choice-card:hover { filter: brightness(1.16); }
                .mwi-equipment-slot:disabled { opacity: .44; cursor: not-allowed; }
                .mwi-equipment-slot.reference:disabled { opacity: .82; cursor: default; }
                .mwi-equipment-slot.empty { border-style: dashed; color: #8f98a8; }
                .mwi-equipment-slot.missing { border-color: #b55e5e; background: #3d252b; }
                .mwi-equipment-slot svg,
                .mwi-selected-skill svg,
                .mwi-choice-card svg {
                    display: block;
                    width: 44px;
                    height: 44px;
                    margin: 0 auto 2px;
                }
                .mwi-slot-level {
                    position: absolute;
                    top: 3px;
                    right: 5px;
                    color: #f3c75f;
                    font-size: 11px;
                    font-weight: 700;
                    text-shadow: 0 1px 2px #000;
                }
                .mwi-slot-name {
                    display: block;
                    overflow: hidden;
                    font-size: 10px;
                    line-height: 1.2;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .mwi-slot-meta {
                    display: block;
                    margin-top: 2px;
                    color: #9fc7a8;
                    font-size: 9px;
                }
                .mwi-skill-slot-grid {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(78px, 100px));
                    justify-content: start;
                    gap: 7px;
                    min-width: 418px;
                }
                .mwi-skill-slot-wrap {
                    position: relative;
                    min-width: 0;
                }
                .mwi-skill-slot-wrap .mwi-selected-skill {
                    min-height: 96px;
                    padding-bottom: 25px;
                }
                .mwi-skill-trigger-button {
                    position: absolute;
                    right: 5px;
                    bottom: 4px;
                    left: 5px;
                    height: 19px;
                    padding: 0 4px;
                    border: 1px solid #7a6a3c;
                    border-radius: 4px;
                    background: rgba(25, 29, 38, .94);
                    color: #f0cc69;
                    font-size: 9px;
                    line-height: 17px;
                    cursor: pointer;
                }
                .mwi-skill-trigger-button.custom {
                    border-color: #5c9a72;
                    color: #9fe3b5;
                }
                .mwi-choice-list.mwi-trigger-editor {
                    display: block;
                    padding: 10px;
                }
                .mwi-trigger-help {
                    margin-bottom: 8px;
                    color: #b8c0d0;
                    font-size: 12px;
                    line-height: 1.5;
                }
                .mwi-trigger-toolbar {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 9px;
                }
                .mwi-trigger-rows {
                    display: grid;
                    gap: 7px;
                }
                .mwi-trigger-row {
                    display: grid;
                    grid-template-columns:
                        minmax(120px, .9fr)
                        minmax(170px, 1.4fr)
                        minmax(120px, .8fr)
                        minmax(80px, .45fr)
                        auto;
                    gap: 6px;
                    align-items: center;
                    padding: 7px;
                    border: 1px solid #4f596e;
                    border-radius: 7px;
                    background: #202632;
                }
                .mwi-trigger-row select,
                .mwi-trigger-row input {
                    width: 100%;
                    min-width: 0;
                    height: 32px;
                    padding: 4px 7px;
                    border: 1px solid #59657d;
                    border-radius: 5px;
                    background: #2b3241;
                    color: #eef1f6;
                }
                .mwi-trigger-row input:disabled {
                    opacity: .42;
                }
                .mwi-trigger-remove {
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    border: 1px solid #9a5a5a;
                    border-radius: 5px;
                    background: #4a2529;
                    color: #ffd3d3;
                    cursor: pointer;
                }
                .mwi-trigger-empty {
                    padding: 14px;
                    border: 1px dashed #586277;
                    border-radius: 7px;
                    color: #aeb7c7;
                    text-align: center;
                }
                .mwi-selected-skill,
                .mwi-add-skill { min-height: 84px; }
                .mwi-add-skill {
                    border-style: dashed;
                    color: #8fa8d8;
                    font-size: 28px;
                    line-height: 70px;
                }
                .mwi-choice-card {
                    min-height: 112px;
                    border-color: #4a566f;
                }
                .mwi-choice-card.selected {
                    border-color: #d9b85f;
                    box-shadow: inset 0 0 0 1px #d9b85f;
                }
                .mwi-choice-card.remove {
                    border-style: dashed;
                    border-color: #a96565;
                    color: #f0adad;
                    font-size: 13px;
                    font-weight: 700;
                }
                .mwi-plan-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    justify-content: flex-end;
                    margin-top: 8px;
                }
                .mwi-plan-local-status {
                    color: #93c9a4;
                    font-size: 11px;
                }
                .mwi-ability-picker {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 4px;
                    margin-top: 7px;
                }
                .mwi-ability-choice {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px;
                    border: 1px solid #3c4555;
                    border-radius: 6px;
                    font-size: 10px;
                }
                .mwi-publish-bar {
                    display: grid;
                    grid-template-columns: 1fr 1fr auto auto;
                    gap: 5px;
                    margin-top: 9px;
                    padding-top: 8px;
                    border-top: 1px solid #3b4351;
                }
                .mwi-publish-status {
                    grid-column: 1 / -1;
                    min-height: 16px;
                    color: #d8c783;
                    font-size: 11px;
                }
                .mwi-publish-status.error { color: #efa09a; }
                .mwi-result-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 6px 12px;
                    margin-bottom: 8px;
                }
                .mwi-result-title { margin: 0; color: #f2d990; font-size: 16px; }
                .mwi-result-week { color: #9fa9ba; font-size: 11px; }
                .mwi-trial-time {
                    padding: 5px 8px;
                    border: 1px solid #7b6840;
                    border-radius: 7px;
                    background: #2b261c;
                    color: #ffe6a1;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .mwi-assignment {
                    margin-top: 5px;
                    padding: 6px 8px;
                    border-left: 3px solid #6f96c8;
                    border-radius: 5px;
                    background: #232a36;
                }
                .mwi-assignment strong { color: #91d2a3; }
                .mwi-assignment.mwi-member-plan-life { border-left-color: #55c799; }
                .mwi-assignment.mwi-member-plan-battle { border-left-color: #df785e; }
                .mwi-member-plan-summary {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 5px 10px;
                    margin-top: 4px;
                }
                .mwi-member-plan-trial {
                    padding: 3px 7px;
                    border: 1px solid #8a7141;
                    border-radius: 999px;
                    background: #30291c;
                    color: #ffe099;
                    font-weight: 700;
                }
                .mwi-member-plan-label {
                    margin: 7px 0 3px;
                    color: #b9c1cf;
                    font-size: 11px;
                    font-weight: 700;
                }
                .mwi-member-plan-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
                    gap: 4px;
                }
                .mwi-member-plan-item {
                    min-width: 0;
                    padding: 4px;
                    border: 1px solid #454e60;
                    border-radius: 7px;
                    background: #1d2330;
                    color: #e7e9ed;
                    text-align: center;
                    font-size: 10px;
                }
                .mwi-member-plan-item svg {
                    display: block;
                    width: 32px;
                    height: 32px;
                    margin: 0 auto 2px;
                }
                .mwi-member-plan-item .level { color: #f3cf75; font-weight: 700; }
                .mwi-config-alert {
                    position: fixed;
                    display: flex;
                    flex-direction: column;
                    right: 12px;
                    bottom: 12px;
                    z-index: 2147483647;
                    width: min(360px, calc(100vw - 24px));
                    max-height: min(340px, calc(50vh - 24px));
                    max-height: min(340px, calc(50dvh - 24px));
                    overflow: hidden;
                    margin: 0;
                    padding: 0;
                    border: 1px solid #596575;
                    border-radius: 8px;
                    background: #232933;
                    color: #e7e9ed;
                    font-family: Arial, "Microsoft JhengHei", sans-serif;
                    box-shadow: 0 3px 12px rgba(0, 0, 0, .25);
                }
                .mwi-config-alert, .mwi-config-alert * {
                    animation: none !important;
                    transition: none !important;
                }
                .mwi-config-alert-card { display: flex; flex-direction: column; min-height: 0; padding: 14px; overflow-wrap: anywhere; }
                .mwi-config-alert-content { min-height: 0; overflow: auto; }
                .mwi-config-alert-card h2 { margin: 0 0 8px; color: #d1dce8; font-size: 16px; }
                .mwi-config-alert-card p { margin: 6px 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
                .mwi-config-alert-actions {
                    display: flex;
                    flex-shrink: 0;
                    justify-content: flex-end;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 12px;
                }
                .mwi-config-alert-actions .mwi-button { font-size: 13px; }
                .mwi-plugin-update-notice {
                    position: fixed;
                    top: 72px;
                    right: 18px;
                    z-index: 2147483646;
                    width: min(390px, calc(100vw - 24px));
                    padding: 14px;
                    border: 2px solid #e2b85f;
                    border-radius: 12px;
                    background: linear-gradient(180deg, #2d313c, #20242d);
                    color: #f4f0e7;
                    font: 13px/1.45 Arial, "Microsoft JhengHei", sans-serif;
                    box-shadow: 0 8px 30px rgba(0, 0, 0, .62), 0 0 18px rgba(226, 184, 95, .28);
                }
                .mwi-plugin-update-title {
                    display: block;
                    margin-bottom: 6px;
                    color: #ffd87b;
                    font-size: 17px;
                }
                .mwi-plugin-update-message { color: #e6e9ef; }
                .mwi-plugin-update-versions {
                    margin-top: 7px;
                    color: #aeb9ca;
                    font-size: 12px;
                }
                .mwi-plugin-update-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 12px;
                }
                @media (max-width: 900px) {
                    .mwi-talent-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    .mwi-member-profile-layout { grid-template-columns: 1fr; }
                    .mwi-draft-toolbar { grid-template-columns: 1fr 1fr; }
                    .mwi-draft-toolbar > :first-child,
                    .mwi-draft-toolbar > :nth-child(2) { min-width: 0; }
                    .mwi-plan-card.workbench .mwi-plan-head { grid-template-columns: 1fr; }
                }
                @media (max-width: 620px) {
                    .mwi-plugin-update-notice {
                        top: 58px;
                        right: 8px;
                        width: calc(100vw - 16px);
                    }
                    .mwi-talent-controls { grid-template-columns: 1fr 1fr; }
                    .mwi-talent-skill-group { grid-template-columns: 1fr; gap: 2px; }
                    .mwi-talent-skill-group-title { padding-top: 0; }
                    .mwi-talent-quick-actions .mwi-button:last-child { margin-left: 0; }
                    .mwi-modal {
                        width: calc(100vw - 6px);
                        max-height: calc(100vh - 6px);
                        max-height: calc(100dvh - 6px);
                    }
                    .mwi-header { padding: 6px 8px; }
                    .mwi-title { font-size: 14px; }
                    .mwi-content { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 6px; gap: 5px; }
                    .mwi-level-grid { grid-template-columns: 1fr; }
                    .mwi-combat { grid-column: 1 / -1; }
                    .mwi-combat .mwi-level-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                    .mwi-weapon-section { grid-column: 1 / -1; }
                    .mwi-info-grid { grid-template-columns: repeat(2, 48px minmax(0, 1fr)); font-size: 11px; }
                    .mwi-level-row { padding: 3px 5px; font-size: 11px; }
                    .mwi-admin-members { max-height: 340px; }
                    .mwi-admin-member-overlay, .mwi-choice-overlay { padding: 3px; }
                    .mwi-admin-member-dialog {
                        width: calc(100vw - 6px);
                        max-height: calc(100dvh - 6px);
                    }
                    .mwi-choice-dialog {
                        width: calc(100vw - 8px);
                        max-height: calc(100dvh - 12px);
                    }
                    .mwi-choice-list { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 6px; gap: 5px; }
                    .mwi-trigger-row {
                        grid-template-columns: 1fr 1fr;
                    }
                    .mwi-trigger-row .mwi-trigger-value { grid-column: 1 / 2; }
                    .mwi-trigger-row .mwi-trigger-remove { grid-column: 2 / 3; justify-self: end; }
                    .mwi-member-profile-layout { grid-template-columns: 1fr; }
                    .mwi-draft-toolbar { grid-template-columns: 1fr 1fr; }
                    .mwi-draft-toolbar > :first-child,
                    .mwi-draft-toolbar > :nth-child(2) { min-width: 0; }
                    .mwi-game-equipment-grid {
                        grid-template-columns: repeat(3, minmax(72px, 1fr));
                    }
                    .mwi-plan-head, .mwi-publish-bar { grid-template-columns: 1fr; }
                    .mwi-plan-card.workbench .mwi-plan-head { grid-template-columns: 1fr; }
                    .mwi-plan-type { justify-content: center; }
                }
            </style>
            <button class="mwi-open" type="button" data-role="open">
                <span class="mwi-status-dot" data-role="status-dot"></span>
                <span>工會資料</span>
            </button>
            <div class="mwi-backdrop" data-role="modal" role="dialog" aria-modal="true" aria-label="MWI 工會資料與試煉配置" hidden>
                <section class="mwi-modal">
                    <header class="mwi-header">
                        <h2 class="mwi-title">MWI 工會資料與試煉配置</h2>
                        <button class="mwi-close" type="button" data-role="close" aria-label="關閉">×</button>
                    </header>
                    <main class="mwi-content">
                        <div class="mwi-status-line">
                            <span class="mwi-status-dot" data-role="status-dot"></span>
                            <span data-role="status-text">等待遊戲角色資料…</span>
                        </div>
                        <div class="mwi-info-grid">
                            <span class="mwi-label">角色</span><span class="mwi-value" data-role="character-name">—</span>
                            <span class="mwi-label">公會</span><span class="mwi-value" data-role="guild-name">—</span>
                            <span class="mwi-label">資料來源</span><span class="mwi-value" data-role="source">—</span>
                            <span class="mwi-label">更新時間</span><span class="mwi-value" data-role="updated-at">—</span>
                        </div>
                        <section class="mwi-section mwi-life mwi-local-manager-only">
                            <h3>生活技能等級</h3>
                            <div class="mwi-level-grid" data-role="skills"></div>
                        </section>
                        <section class="mwi-section mwi-aura mwi-local-manager-only">
                            <h3>光環與復活等級</h3>
                            <div class="mwi-level-grid" data-role="auras"></div>
                        </section>
                        <section class="mwi-section mwi-combat mwi-local-manager-only">
                            <h3>戰鬥技能等級</h3>
                            <div class="mwi-level-grid" data-role="combat-skills"></div>
                        </section>
                        <section class="mwi-section mwi-weapon-section mwi-local-manager-only">
                            <h3><span>自動讀取裝備與技能</span></h3>
                            <div class="mwi-equipment-summary" data-role="equipment-summary">
                                <span>等待遊戲裝備資料…</span>
                            </div>
                        </section>
                        <div class="mwi-saved" data-role="saved-message" aria-live="polite"></div>
                        <section class="mwi-result-panel" data-role="result-panel" hidden></section>
                        <section class="mwi-admin-panel" data-role="admin-panel" hidden>
                            <div class="mwi-admin-login" data-role="admin-login-panel">
                                <input class="mwi-admin-input" data-role="admin-password" type="password" name="mwi-guild-admin-secret" autocomplete="new-password" data-form-type="other" data-lpignore="true" data-1p-ignore="true" placeholder="管理員共用密碼">
                                <button class="mwi-button primary" type="button" data-role="admin-login">管理員登入</button>
                                <span class="mwi-admin-status" data-role="admin-status">尚未登入</span>
                            </div>
                            <div data-role="admin-workspace" hidden>
                                <div class="mwi-admin-toolbar">
                                    <input class="mwi-admin-input" data-role="admin-search" type="search" placeholder="搜尋角色名稱或備註">
                                    <button class="mwi-button" type="button" data-role="admin-refresh">重新整理全部資料</button>
                                    <button class="mwi-button" type="button" data-role="admin-logout">登出</button>
                                    <span class="mwi-admin-status" data-role="admin-status"></span>
                                    <span class="mwi-admin-cache-status" data-role="admin-cache-status">本機資料：尚未下載</span>
                                </div>
                                <div class="mwi-admin-batch-toolbar">
                                    <button class="mwi-button" type="button" data-role="admin-select-all">全選有資料會員</button>
                                    <button class="mwi-button" type="button" data-role="admin-clear-selection">取消全選</button>
                                    <span class="mwi-admin-selection-count" data-role="admin-selection-count">已選 0 人</span>
                                    <button class="mwi-button secondary" type="button" data-role="admin-notice-open">發布通知</button>
                                    <button class="mwi-button primary" type="button" data-role="admin-batch-publish" disabled>套用勾選名單</button>
                                </div>
                                <div class="mwi-admin-layout">
                                    <div class="mwi-admin-members" data-role="admin-member-list"></div>
                                </div>
                            </div>
                        </section>
                        <div class="mwi-actions">
                            <button class="mwi-button" type="button" data-role="refresh">重新讀取</button>
                            <button class="mwi-button secondary" type="button" data-role="copy" disabled>我的配置</button>
                            <button class="mwi-button secondary" type="button" data-role="admin-open">管理員</button>
                            <button class="mwi-button primary" type="button" data-role="confirm" disabled>上傳資料</button>
                        </div>
                    </main>
                </section>
            </div>
        `}function Ca(e,t,i){let a=document.createDocumentFragment();for(let n of t){let r=document.createElement("div");r.className="mwi-level-row";let l=document.createElement("span");l.className="mwi-level-name",l.textContent=n.name;let s=document.createElement("span");s.className="mwi-level-value",s.dataset.levelKind=i,s.dataset.hrid=n.hrid,s.textContent="—",r.append(l,s),a.appendChild(r)}e.appendChild(a)}function sl(){m.openButton.addEventListener("click",()=>{oa||(pt("頁面狀態"),m.modal.hidden=!1,gt())}),m.openButton.addEventListener("pointerdown",gs),Se(window,"pointermove",hs,{passive:!1}),Se(window,"pointerup",Lr),Se(window,"pointercancel",Lr),m.closeButton.addEventListener("click",Ya),m.modal.addEventListener("click",e=>{e.target===m.modal&&Ya()}),m.modal.addEventListener("wheel",e=>{e.stopPropagation()},{passive:!0}),m.modal.addEventListener("touchmove",e=>{e.stopPropagation()},{passive:!0}),m.refreshButton.addEventListener("click",()=>{let e=pt("頁面狀態");m.savedMessage.textContent=e?"已重新讀取目前角色資料。":"尚未找到角色資料；請確認遊戲已載入完成，必要時重新整理頁面。",gt()}),m.confirmButton.addEventListener("click",Nr),m.copyButton.addEventListener("click",xs),m.adminButton.addEventListener("click",()=>{m.adminPanel.hidden=!m.adminPanel.hidden,m.adminPanel.hidden||requestAnimationFrame(()=>{m.adminPanel.scrollIntoView({block:"start",behavior:"smooth"})}),!m.adminPanel.hidden&&V()&&bi()}),m.adminLoginButton.addEventListener("click",ar),m.adminPassword.addEventListener("keydown",e=>{e.key==="Enter"&&ar()}),m.adminLogoutButton.addEventListener("click",nr),m.adminRefreshButton.addEventListener("click",()=>{bi({force:!0})}),m.adminSearch.addEventListener("input",H),m.adminSelectAll.addEventListener("click",$l),m.adminClearSelection.addEventListener("click",Ol),m.adminNoticeOpen.addEventListener("click",ql),m.adminBatchPublish.addEventListener("click",us),Se(document,"keydown",e=>{if(e.key!=="Escape"||!m||m.modal.hidden)return;let t=m.shadow.querySelector('[data-role="admin-notice-overlay"]');if(t){o.admin.noticePublishing||(t.open&&t.close(),t.remove());return}if(m.choiceOverlay&&!m.choiceOverlay.hidden){ge();return}if(m.adminMemberOverlay&&!m.adminMemberOverlay.hidden){Tr();return}Ya()}),Se(window,"resize",Xa,{passive:!0})}function dc(){!m||!m.adminSortControls||m.adminSortControls.replaceChildren()}function cl(e){let t=Number(e);return Number.isFinite(t)?Math.min(999,Math.max(0,Math.floor(t))):100}function dl(e){let t=Number(e);return Number.isFinite(t)?Math.min(99999999,Math.max(0,Math.floor(t))):0}function Qn(e){return["all","any","none"].includes(String(e))?String(e):"none"}function Zn(e){return["balanced","allround","average","highest","buildScore"].includes(String(e))?String(e):"balanced"}function ml(e){let t=Number(e);return[0,1,3,7,14].includes(t)?t:0}function mc(){let e=null;try{e=GM_getValue(cn,null),typeof e=="string"&&e&&(e=JSON.parse(e))}catch{e=null}if(!e||typeof e!="object")return;let t=Array.isArray(e.selectedKeys)?e.selectedKeys.filter(a=>ta.has(String(a))):[];o.admin.talent.visible=e.visible!==!1,o.admin.talent.selectedKeys=new Set(t.map(String)),o.admin.talent.threshold=cl(e.threshold),o.admin.talent.minBuildScore=dl(e.minBuildScore);let i=Number(e.preferencesVersion)||0;o.admin.talent.matchMode=i>=un?Qn(e.matchMode):"none",o.admin.talent.sortMode=Zn(e.sortMode),o.admin.talent.freshnessDays=ml(e.freshnessDays)}function gi(){let e=o.admin.talent;GM_setValue(cn,{preferencesVersion:un,visible:e.visible,selectedKeys:[...e.selectedKeys],threshold:e.threshold,minBuildScore:e.minBuildScore,matchMode:e.matchMode,sortMode:e.sortMode,freshnessDays:e.freshnessDays})}function ul(){let e=null;try{e=GM_getValue(dn,null),typeof e=="string"&&e&&(e=JSON.parse(e))}catch{e=null}let t=e&&typeof e=="object"?e.selections&&typeof e.selections=="object"?e.selections:e:{},i=new Set(ri.map(a=>a.hrid));o.admin.auraSelections=new Map(Object.entries(t).map(([a,n])=>[String(a||""),String(n||"")]).filter(([a,n])=>a&&i.has(n)))}function er(){GM_setValue(dn,{version:1,selections:Object.fromEntries(o.admin.auraSelections)})}function uc(){if(!(!m||!m.adminTalentSkillList)){m.adminTalentSkillList.replaceChildren();for(let[e,t]of[["life","生活技能"],["combat","戰鬥技能"],["ability","光環與復活"]]){let i=document.createElement("div");i.className="mwi-talent-skill-group";let a=document.createElement("span");a.className="mwi-talent-skill-group-title",a.textContent=t;let n=document.createElement("div");n.className="mwi-talent-skill-list",Ct.filter(r=>r.group===e).forEach(r=>{let l=document.createElement("button");l.type="button",l.className="mwi-talent-skill-button",l.dataset.talentKey=r.key,l.dataset.group=r.group,l.textContent=r.label,l.title=`將${r.label}加入複合排名條件`,l.addEventListener("click",()=>{o.admin.talent.selectedKeys.has(r.key)?o.admin.talent.selectedKeys.delete(r.key):o.admin.talent.selectedKeys.add(r.key),gi(),hi()}),n.appendChild(l)}),i.append(a,n),m.adminTalentSkillList.appendChild(i)}}}function hi(){if(!m||!m.adminTalentPanel)return;let e=o.admin.talent;m.adminTalentPanel.hidden=!e.visible,m.adminTalentToggle.textContent=e.visible?"收起人才分析":"人才分析",m.adminTalentThreshold.value=String(e.threshold),m.adminTalentMinBuildScore.value=String(e.minBuildScore),m.adminTalentMatchMode.value=e.matchMode,m.adminTalentSortMode.value=e.sortMode,m.adminTalentFreshness.value=String(e.freshnessDays),m.adminTalentSkillList.querySelectorAll("[data-talent-key]").forEach(t=>{t.classList.toggle("active",e.selectedKeys.has(String(t.dataset.talentKey||"")))}),Sl()}function pc(){o.admin.talent.visible=!o.admin.talent.visible,gi(),hi()}function Ea(e,t={}){o.admin.talent.selectedKeys=new Set(e.map(String).filter(i=>ta.has(i))),t.matchMode&&(o.admin.talent.matchMode=Qn(t.matchMode)),t.sortMode&&(o.admin.talent.sortMode=Zn(t.sortMode)),o.admin.talent.visible=!0,gi(),hi()}function fc(){let e=ae(o.guildWeeklyTrials.life,"life").map(t=>`levels.life.${String(t).split("/").pop()}`).filter(t=>ta.has(t));if(!e.length){k("尚未讀到本週生活試煉；請先開啟遊戲的公會試煉頁。",!0);return}Ea(e,{matchMode:"none",sortMode:"balanced"}),k(`已套用本週 ${e.length} 項生活試煉；不限制等級，全部會員按弱項優先排名。`)}function gc(){Ea(Ct.filter(e=>e.group==="life").map(e=>e.key),{matchMode:"none",sortMode:"allround"}),k("已切換為生活全能榜：達標項數、最低項、平均依序排名。")}function hc(){Ea(Ct.filter(e=>e.group==="combat").map(e=>e.key),{matchMode:"none",sortMode:"allround"}),k("已切換為戰鬥全能榜：達標項數、最低項、平均依序排名。")}function bc(){o.admin.talent.selectedKeys.clear(),gi(),hi()}function pl(){return Ct.filter(e=>o.admin.talent.selectedKeys.has(e.key))}function fl(e){let t=o.admin.talent.freshnessDays;if(!t)return!0;let i=new Date(Na(e)||"").getTime();return Number.isFinite(i)?Date.now()-i<=t*24*60*60*1e3:!1}function gl(e,t){let i=_i(e,t.key);if(i==null||i==="")return null;let a=Number(i);return Number.isFinite(a)?a:null}function hl(e,t,i){let a=o.admin.talent.threshold,n=o.admin.talent.minBuildScore,r=cr(e,"buildScore.value"),l=i.map(h=>({definition:h,value:gl(e,h)})),s=l.map(h=>h.value).filter(h=>Number.isFinite(h)),c=l.filter(h=>Number.isFinite(h.value)&&h.value>=a).length,d=s.length?Math.min(...s):null,u=s.length?Math.max(...s):null,f=s.length?s.reduce((h,b)=>h+b,0)/s.length:null,p=!1;i.length?o.admin.talent.matchMode==="all"?p=c===i.length&&s.length===i.length:o.admin.talent.matchMode==="any"?p=c>0:p=s.length>0:(n>0||o.admin.talent.sortMode==="buildScore")&&(p=Number.isFinite(r));let _=n<=0||Number.isFinite(r)&&r>=n;return p=p&&_,{member:e,index:t,values:l,finiteCount:s.length,missingCount:i.length-s.length,qualifiedCount:c,minimum:d,maximum:u,average:f,buildScore:r,buildScoreMatches:_,matches:p}}function ne(e,t){let i=e==null||!Number.isFinite(e),a=t==null||!Number.isFinite(t);return i!==a?i?1:-1:i?0:t-e}function bl(e,t){let i=o.admin.talent.sortMode,n=(i==="buildScore"?[ne(e.buildScore,t.buildScore),ne(e.minimum,t.minimum),ne(e.average,t.average)]:i==="average"?[ne(e.average,t.average),ne(e.minimum,t.minimum),t.qualifiedCount-e.qualifiedCount]:i==="highest"?[ne(e.maximum,t.maximum),ne(e.average,t.average),ne(e.minimum,t.minimum)]:i==="allround"?[t.qualifiedCount-e.qualifiedCount,e.missingCount-t.missingCount,ne(e.minimum,t.minimum),ne(e.average,t.average)]:[ne(e.minimum,t.minimum),ne(e.average,t.average),t.qualifiedCount-e.qualifiedCount,ne(e.maximum,t.maximum)]).find(r=>r!==0);return n!==void 0?n:lt(e.member,e.index)-lt(t.member,t.index)}function tr(){let e=pl(),t=String(m&&m.adminSearch&&m.adminSearch.value||"").trim().toLowerCase(),i=o.admin.members.map((n,r)=>({member:n,index:r})).filter(({member:n})=>te(n)).filter(({member:n})=>fl(n)).filter(({member:n})=>!t||B(n).toLowerCase().includes(t)||A(n).toLowerCase().includes(t)||Mt(n).toLowerCase().includes(t)).map(({member:n,index:r})=>hl(n,r,e)),a=i.filter(n=>n.matches);return a.sort(bl),{definitions:e,baseEntries:i,matchedEntries:a}}function _l(){return{balanced:"弱項優先",allround:"達標項數優先",average:"平均優先",highest:"最高單項優先",buildScore:"裝備技能分數優先"}[o.admin.talent.sortMode]||"弱項優先"}function wl(){return{all:"全部達標",any:"任一達標",none:"只排名"}[o.admin.talent.matchMode]||"只排名"}function La(e){return Number.isFinite(e)?Number.isInteger(e)?String(e):e.toFixed(1):"—"}function yl(e){let t=new Date(e||"");return Number.isNaN(t.getTime())?"—":t.toLocaleString(Fe,{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:!1})}function Ue(e,t=!1){if(!m||!m.adminTalentStats)return;let i=document.createElement("span");i.className=`mwi-talent-stat${t?" strong":""}`,i.textContent=e,m.adminTalentStats.appendChild(i)}function Sl(){if(!m||!m.adminTalentResults||!m.adminTalentSummary)return;let e=o.admin.talent;if(m.adminTalentPanel.hidden=!e.visible,m.adminTalentToggle.textContent=e.visible?"收起人才分析":"人才分析",!e.visible)return;let t=tr(),{definitions:i,baseEntries:a,matchedEntries:n}=t;m.adminTalentStats.replaceChildren(),m.adminTalentResults.replaceChildren(),m.adminTalentSelectResults._mwiCharacterIds=n.map(b=>A(b.member)).filter(Boolean),m.adminTalentSelectResults.disabled=!n.length||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing,m.adminTalentSelectResults.textContent=n.length?`${o.admin.talent.matchMode==="none"?"勾選全部排名":"勾選符合者"}（${n.length}）`:"勾選符合者";let r=!i.length&&(e.minBuildScore>0||e.sortMode==="buildScore");if(!i.length&&!r){m.adminTalentSummary.textContent="尚未選擇技能",Ue(`有資料會員：${o.admin.members.filter(te).length} 人`);let b=document.createElement("div");b.className="mwi-talent-empty",b.textContent="先點選技能，或使用「本週生活試煉／生活全能榜」快速建立排名。",m.adminTalentResults.appendChild(b);return}let l=e.threshold,s=a.filter(b=>b.qualifiedCount===i.length&&b.finiteCount===i.length).length,c=Math.ceil(i.length/2),d=a.filter(b=>b.qualifiedCount>=c).length;m.adminTalentSummary.textContent=[i.length?`已選 ${i.length} 項`:"僅依裝備技能分數",i.length?`門檻 Lv.${l}`:"",e.minBuildScore>0?`分數 ≥ ${rt(e.minBuildScore)}`:"分數不限",`${wl()}：${n.length}／${a.length} 人`,`排序：${_l()}`].filter(Boolean).join("｜"),Ue(`候選母數：${a.length} 人`);let u=a.filter(b=>Number.isFinite(b.buildScore)).length;if(Ue(`已有裝備技能分數：${u} 人`),e.minBuildScore>0){let b=a.filter(y=>Number.isFinite(y.buildScore)&&y.buildScore>=e.minBuildScore).length;Ue(`分數 ≥ ${rt(e.minBuildScore)}：${b} 人`,!0)}if(i.forEach(b=>{let y=a.filter(x=>{let E=x.values.find(v=>v.definition.key===b.key)?.value;return Number.isFinite(E)&&E>=l}).length;Ue(`${b.label} ≥ ${l}：${y} 人`)}),i.length&&Ue(`全部 ${i.length} 項達標：${s} 人`,!0),i.length>=4&&Ue(`至少 ${c} 項達標：${d} 人`),!n.length){let b=document.createElement("div");b.className="mwi-talent-empty",b.textContent="沒有符合目前條件的會員。可降低門檻，或把篩選改成「任一達標／只排名」。",m.adminTalentResults.appendChild(b);return}let f=document.createElement("table");f.className="mwi-talent-table";let p=document.createElement("thead"),_=document.createElement("tr");[{label:"名次",className:""},{label:"選",className:""},{label:"角色",className:"name"},{label:"管理員備註",className:"note"},{label:"分組",className:"group"},{label:"角色定位",className:"role"}].forEach(({label:b,className:y})=>{let x=document.createElement("th");x.textContent=b,y&&(x.className=y),_.appendChild(x)}),i.forEach(b=>{let y=document.createElement("th");y.textContent=b.label,y.title=`${b.groupLabel}｜門檻 Lv.${l}`,_.appendChild(y)}),["裝備技能分數","達標","弱項","平均","更新"].forEach(b=>{let y=document.createElement("th");y.textContent=b,_.appendChild(y)}),p.appendChild(_);let h=document.createElement("tbody");n.forEach((b,y)=>{let x=A(b.member),E=document.createElement("tr");E.tabIndex=0,E.setAttribute("role","button"),E.title=`開啟 ${B(b.member)} 的方案管理`;let v=document.createElement("td");v.textContent=String(y+1),v.className="metric";let T=document.createElement("td"),S=document.createElement("input");S.type="checkbox",S.className="mwi-talent-check",S.checked=o.admin.selectedMemberIds.has(x),S.disabled=o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing,S.setAttribute("aria-label",`選取 ${B(b.member)}`),S.addEventListener("click",w=>w.stopPropagation()),S.addEventListener("change",()=>{dr(x,S.checked),H()}),T.appendChild(S);let C=document.createElement("td");C.className="name",C.textContent=B(b.member);let I=document.createElement("td");I.className="note",I.appendChild(or(b.member,"talent"));let N=document.createElement("td");N.className="group",N.appendChild(lr(b.member,"talent"));let M=document.createElement("td");M.className="role",M.appendChild(sr(b.member,"talent")),E.append(v,T,C,I,N,M),b.values.forEach(({value:w})=>{let z=document.createElement("td");z.textContent=La(w),z.className=Number.isFinite(w)?w>=l?"qualified":"below":"missing",E.appendChild(z)});let R=document.createElement("td");R.className=Number.isFinite(b.buildScore)?b.buildScoreMatches?"qualified":"below":"missing",R.textContent=Pl(b.member);let L=document.createElement("td");L.className="metric",L.textContent=`${b.qualifiedCount}/${i.length}`;let F=document.createElement("td");F.className="metric",F.textContent=La(b.minimum);let he=document.createElement("td");he.className="metric",he.textContent=La(b.average);let Ee=document.createElement("td");Ee.className="updated",Ee.textContent=yl(Na(b.member)),E.append(R,L,F,he,Ee),E.addEventListener("click",()=>We(x)),E.addEventListener("keydown",w=>{w.target===E&&(w.key==="Enter"||w.key===" ")&&(w.preventDefault(),We(x))}),h.appendChild(E)}),f.append(p,h),m.adminTalentResults.appendChild(f)}function _c(){let t=tr().matchedEntries.map(i=>A(i.member)).filter(Boolean);if(!t.length){k("目前沒有符合人才分析條件的會員。",!0);return}o.admin.selectedMemberIds=new Set(t),H(),k(`已勾選人才分析結果中的 ${t.length} 位會員。`)}function vl(){return[{key:"selectedLifeTrialHrid",label:"生活試煉",kind:"lifeTrialChoice"},{key:"selectedBattleTrialHrid",label:"戰鬥試煉",kind:"battleTrialChoice"},{key:"updatedAt",label:"資料狀態"}]}function xl(e){let t=document.createElement("button");t.type="button",t.className="mwi-sort-button",t.dataset.sortKey=e.key;let i=e.key?o.admin.sortKey===e.key&&o.admin.sortDescending:!o.admin.sortKey;t.classList.toggle("active",i);let a=["memberGroup","memberRole","selectedAura","selectedLifeTrialHrid","selectedBattleTrialHrid"].includes(e.key);return t.textContent=i&&e.key?`${e.label} ${a?"●":"↓"}`:e.label,t.title=e.key?a?`點一下把相同${e.label}放在一起；再點一次回到原始順序`:`點一下依${e.label}由高到低排序；再點一次回到原始順序`:"回到預設順序",t.addEventListener("click",()=>{!e.key||o.admin.sortKey===e.key&&o.admin.sortDescending?(o.admin.sortKey="",o.admin.sortDescending=!1):(o.admin.sortKey=e.key,o.admin.sortDescending=!0),H(),m&&m.adminMemberList&&(m.adminMemberList.scrollTop=0)}),t}function Al(e){let t=document.createElement("div");t.className="mwi-member-table-header";let i=document.createElement("div");i.className="mwi-member-header-label mwi-member-select-cell",i.textContent="選",i.title="使用上方按鈕全選有資料會員";let a=document.createElement("div");a.className="mwi-member-header-label",a.textContent="角色";let n=document.createElement("div");return n.className="mwi-member-header-label",n.textContent="管理員備註",n.title="永久管理員備註；只供管理員查看，不會發布給會員",t.append(i,a,n),e.forEach(r=>{t.appendChild(xl(r))}),t}function k(e,t=!1){m&&m.shadow.querySelectorAll('[data-role="admin-status"]').forEach(i=>{i.textContent=e||"",i.style.color=t?"#f0a19a":"#e7cf91"})}function kl(){let e=null;try{e=GM_getValue(sn,null),typeof e=="string"&&e&&(e=JSON.parse(e))}catch{e=null}e&&e.token&&(o.admin.token=String(e.token),o.admin.expiresAt=""),Ia()}function ir(){GM_setValue(sn,o.admin.token?{token:o.admin.token}:null)}function V(){return!!o.admin.token}function Ia(){if(!m)return;let e=V();m.adminLoginPanel.hidden=e,m.adminWorkspace.hidden=!e,k(e?"管理員已登入（永久有效，直到主動登出或更換密碼）":"尚未登入"),je(0),di()}async function ar(){let e=String(m.adminPassword.value||"");if(!e){k("請輸入管理員共用密碼。",!0);return}try{k("正在驗證管理員密碼…");let t=await q({action:"adminLogin",password:e,deviceId:Yt(),deviceLabel:Xt()}),i=String(t.adminToken||t.sessionToken||"");if(!i)throw new Error("後端未回傳管理員權限。");o.admin.token=i,o.admin.expiresAt="",m.adminPassword.value="",ir(),Ia(),await bi()}catch(t){k(t&&t.message?t.message:"管理員登入失敗。",!0)}}async function nr(){let e=o.admin.token;o.admin.token="",o.admin.expiresAt="",o.admin.members=[],o.admin.selectedCharacterId="",o.admin.selectedPlanId="",o.admin.preservedTypeDrafts=null,o.admin.memberDetail=null,o.admin.memberDetailCache=new Map,o.admin.localSnapshotGeneratedAt="",o.admin.localSnapshotSource="",o.admin.localSnapshotBackendVersion="",o.admin.selectedMemberIds.clear(),o.admin.batchPublishing=!1,o.admin.noticePublishing=!1,o.admin.trialSelectionNoticePublishing=!1,o.admin.directPublishing=!1,o.admin.scoreInputsLoading=!1,o.admin.scoreInputsLoadedAt="",o.admin.marketUpdatedAt="",ir(),Ia(),H(),Tr(!0),e&&q({action:"adminLogout",adminToken:e}).catch(()=>{})}function Q(){if(!V())throw nr(),new Error("尚未登入管理員。");return o.admin.token}async function bi(e={}){let t=!!(e&&e.force);if(!(!V()||o.admin.loading)){o.admin.loading=!0,m&&m.adminRefreshButton&&(m.adminRefreshButton.disabled=!0),Z();try{let i=null,a="local";if(!t){k("正在讀取本機會員資料…");try{let n=await _o();Ln(n)&&(i=n)}catch{}}if(!i){a="download",k(t?"正在重新下載全部會員裝備、技能與方案…":"本機尚無資料，正在第一次下載全部會員資料…");let n=await q({action:"adminSnapshotAll",adminToken:Q()});if(!En(n))throw new Error("後端回傳的完整會員資料格式不正確。");i={...n,cacheSchemaVersion:yt};try{await Cn(i)}catch{}}yo(i,a),a==="download"&&So(i),k(a==="download"?`已下載全部會員資料並覆蓋本機快取。${Number(o.admin.lastDesktopStagingImportCount)?` 已套用 ${Number(o.admin.lastDesktopStagingImportCount)} 位桌面模擬冠軍技能方案；裝備不會匯入。`:""}`:"已從本機快取開啟會員資料；需要最新內容時請按「重新整理全部資料」。")}catch(i){k(i&&i.message?i.message:"無法讀取會員資料。",!0)}finally{o.admin.loading=!1,m&&m.adminRefreshButton&&(m.adminRefreshButton.disabled=!1),Z(),di()}}}function _i(e,t){if(!t)return null;let i=n=>n.split(".").reduce((r,l)=>r&&typeof r=="object"?r[l]:void 0,e),a=[t];if(t==="updatedAt")a.push("uploadedAt","snapshot.updatedAt","snapshot.confirmedAt");else if(t==="buildScore.value"){if(Object.prototype.hasOwnProperty.call(e,"adminCalculatedBuildScore"))return Lt(e.adminCalculatedBuildScore&&e.adminCalculatedBuildScore.value);let n=pi(e);if(n)return n.value;a.push(`lifeSkills.${J}.value`,`levels.life.${J}.value`,`profile.lifeSkills.${J}.value`,`snapshot.lifeSkills.${J}.value`,`snapshot.profile.lifeSkills.${J}.value`)}else if(t.startsWith("levels.life.")){let n=t.slice(12);a.push(`lifeSkills.${n}`,`snapshot.lifeSkills.${n}`)}else if(t.startsWith("levels.combat.")){let n=t.slice(14);a.push(`combatSkills.${n}`,`snapshot.combatSkills.${n}`)}else if(t.startsWith("levels.abilities.")){let n=t.slice(17);a.push(`auras.${n}`,`snapshot.auras.${n}`)}for(let n of a){let r=i(n);if(r!=null)return r}}function A(e){return String(e&&(e.characterId||e.id||e.snapshot?.character?.id)||"")}function B(e){return String(e&&(e.characterName||e.name||e.snapshot?.character?.name)||"未知會員")}function te(e){if(!e||e._rosterOnly||e.uploaded===!1)return!1;let t=e.snapshot&&typeof e.snapshot=="object"?e.snapshot:{};return t.available===!1?!1:!!(e.updatedAt||e.uploadedAt||e.hasData||e.snapshotAvailable||t.available||t.updatedAt||t.confirmedAt||e.uploaded===!0)}function rr(e){let t=(Array.isArray(e)?e:[]).filter(r=>r&&!r._rosterOnly);if(!o.guildRoster.length)return t.map(r=>({...r,adminCalculatedBuildScore:pi(r)}));let i=new Map(o.guildRoster.map(r=>[A(r),r])),a=new Set,n=t.map((r,l)=>{let s=A(r),c=i.get(s)||{};return s&&a.add(s),{...c,...r,originalOrder:Number(r.originalOrder||r.uploadOrder)||l+1,uploaded:te({...r,uploaded:r.uploaded??!0}),adminCalculatedBuildScore:pi(r)}});return o.guildRoster.forEach(r=>{let l=A(r);!l||a.has(l)||n.push({...r,_rosterOnly:!0,uploaded:!1,originalOrder:n.length+1})}),n}function Tl(){if(document.getElementById(fn))return;let e=document.createElement("style");e.id=fn,e.textContent=`
            .${$e} {
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                margin-left: 7px;
                padding: 1px 6px;
                border: 1px solid transparent;
                border-radius: 999px;
                font: 700 11px/16px Arial, "Microsoft JhengHei", sans-serif;
                white-space: nowrap;
            }
            .${$e}[data-state="yes"] {
                color: #8ff0a4;
                border-color: rgba(80, 200, 110, .55);
                background: rgba(50, 170, 80, .14);
            }
            .${$e}[data-state="no"] {
                color: #c2c7d1;
                border-color: rgba(160, 170, 190, .35);
                background: rgba(120, 130, 150, .10);
            }
            #${vt} {
                margin-left: 8px;
                color: #8ff0a4;
                font: 600 11px Arial, "Microsoft JhengHei", sans-serif;
                white-space: nowrap;
            }
        `,(document.head||document.documentElement).appendChild(e)}function Cl(){document.querySelectorAll(`.${$e}`).forEach(e=>e.remove()),document.getElementById(vt)?.remove()}function je(e=80){window.clearTimeout(si),si=window.setTimeout(El,Number(e)||0)}function El(){if(!V()||!o.admin.members.length){Cl();return}Tl();let e=document.querySelector('[class*="GuildPanel_membersTable"]');if(!e)return;let t=new Map(o.admin.members.map(n=>[A(n),n])),i=new Set(o.admin.members.filter(te).map(A).filter(Boolean));e.querySelectorAll("tbody tr").forEach(n=>{let r=n.querySelector("[data-name]");if(!r)return;let l=String(r.getAttribute("data-name")||r.textContent||"").trim(),s=o.guildMemberIdByName.get(l)||A(o.admin.members.find(f=>B(f)===l));if(!s||!t.has(s))return;let c=r.closest('[class*="CharacterName_characterName"]')||r.parentElement;if(!c)return;let d=c.querySelector(`.${$e}`);d||(d=document.createElement("span"),d.className=$e,c.appendChild(d));let u=i.has(s);d.dataset.state=u?"yes":"no",d.dataset.characterId=s,d.textContent=u?"✓ 有資料":"－ 無資料",d.title="管理員資料狀態"});let a=e.querySelector("thead th");if(a){let n=document.getElementById(vt);n||(n=document.createElement("span"),n.id=vt,a.appendChild(n)),n.textContent=`已上傳：${i.size} 人`}}function Ll(){nt&&nt.disconnect(),nt=new MutationObserver(e=>{e.some(i=>[...i.addedNodes,...i.removedNodes].some(a=>a instanceof Element&&!a.classList.contains($e)&&a.id!==vt&&(a.matches('[class*="GuildPanel_"]')||!!a.querySelector('[class*="GuildPanel_"]'))))&&je(100)}),document.body&&nt.observe(document.body,{childList:!0,subtree:!0}),Se(document,"click",e=>{let t=e.target&&e.target.closest?e.target.closest('button, [role="tab"]'):null,i=String(t&&t.textContent||"").trim();["成員","成员","Members"].includes(i)&&(je(150),window.setTimeout(()=>je(0),650))},!0),je(500)}function lt(e,t){let i=Number(e.originalOrder??e.uploadOrder);return Number.isFinite(i)&&i>0?i:t+1}function Na(e){let t=e&&e.snapshot&&typeof e.snapshot=="object"?e.snapshot:{};return e&&(e.updatedAt||e.uploadedAt||t.updatedAt||t.confirmedAt)}function Mt(e){return String(e&&e.privateNote||"").trim()}function Ma(e,t){let i=String(e||""),a=String(t||"").trim();o.admin.members.forEach(r=>{A(r)===i&&(r.privateNote=a)}),o.admin.memberDetail&&[o.admin.memberDetail,o.admin.memberDetail.member,o.admin.memberDetail.summary].filter(Boolean).forEach(r=>{(!A(r)||A(r)===i)&&(r.privateNote=a)});let n=X(i);if(n){let r={...n.summary||n.member||{}};r.privateNote=a,fe(i,{...n,summary:r})}}async function Il(e,t){if(!V()||!e||!t||t.dataset.saving==="true")return;let i=A(e),a=Mt(e),n=String(t.value||"").trim().slice(0,500);if(t.value=n,!(!i||n===a)){t.dataset.saving="true",t.classList.add("saving"),t.disabled=!0,Ma(i,n);try{let r=await q({action:"adminSavePrivateNote",adminToken:Q(),characterId:i,privateNote:n}),l=String(r.privateNote??n).trim();Ma(i,l),await ce(),k(l?`已永久儲存 ${B(e)} 的管理員備註。`:`已清除 ${B(e)} 的管理員備註。`),H()}catch(r){Ma(i,a),t.isConnected&&(t.value=a),k(r&&r.message?r.message:"管理員備註儲存失敗。",!0)}finally{t.isConnected&&(t.dataset.saving="false",t.classList.remove("saving"),t.disabled=!1)}}}function or(e,t="member"){let i=document.createElement("input");return i.type="text",i.className=t==="talent"?"mwi-talent-note-input":"mwi-member-note-input",i.maxLength=500,i.placeholder="管理員備註",i.value=Mt(e),i.title="永久管理員備註；只供管理員查看，不會發布給會員",i.setAttribute("aria-label",`${B(e)} 的管理員備註`),i.addEventListener("click",a=>a.stopPropagation()),i.addEventListener("pointerdown",a=>a.stopPropagation()),i.addEventListener("keydown",a=>{a.stopPropagation(),a.key==="Enter"?(a.preventDefault(),i.blur()):a.key==="Escape"&&(i.value=Mt(e),i.blur())}),i.addEventListener("change",()=>Il(e,i)),i}function Nl(e){let t=document.createElement("span");return t.className="mwi-member-cell mwi-member-note-cell",t.appendChild(or(e)),t}function wi(e){let t=String(e||"").trim();return ea.includes(t)?t:""}function st(e){return wi(e&&e.memberGroup)}function yi(e,t){let i=String(e||""),a=wi(t);o.admin.members.forEach(r=>{A(r)===i&&(r.memberGroup=a)}),o.admin.memberDetail&&[o.admin.memberDetail,o.admin.memberDetail.member,o.admin.memberDetail.summary].filter(Boolean).forEach(r=>{(!A(r)||A(r)===i)&&(r.memberGroup=a)});let n=X(i);if(n){let r={...n.summary||n.member||{}};r.memberGroup=a,fe(i,{...n,summary:r})}}async function Ml(e,t){if(!V()||!e||!t||t.dataset.saving==="true")return;let i=A(e),a=st(e),n=wi(t.value);if(t.value=n,!(!i||n===a)){t.dataset.saving="true",t.classList.add("saving"),t.disabled=!0,yi(i,n);try{let r=await q({action:"adminSaveMemberGroup",adminToken:Q(),characterId:i,memberGroup:n}),l=wi(r.memberGroup??n);yi(i,l),await ce(),k(l?`已將 ${B(e)} 分到第 ${l} 組。`:`已清除 ${B(e)} 的分組。`),H()}catch(r){yi(i,a),t.isConnected&&(t.value=a),k(r&&r.message?r.message:"分組儲存失敗。",!0)}finally{t.isConnected&&(t.dataset.saving="false",t.classList.remove("saving"),t.disabled=!1)}}}async function wc(){if(!V()||o.admin.groupSyncInFlight)return;let e=m&&m.adminMemberDetail?m.adminMemberDetail.querySelector(".mwi-plan-card.workbench"):null;e&&mt(e);let t=o.admin.members.map(i=>{let a=A(i),n=vi(o.admin.auraSelections.get(a));return i.selectedAuraHrid=n,{characterId:a,memberGroup:st(i),memberRole:ct(i),selectedAuraHrid:n,selectedLifeTrialHrid:ue(i,g.LIFE),selectedBattleTrialHrid:ue(i,g.BATTLE)}}).filter(i=>i.characterId);if(!t.length){k("目前沒有可上傳的會員設定。",!0);return}o.admin.groupSyncInFlight=!0,Z(),k(`正在把 ${t.length} 位會員的分組設定上傳到試算表；本機方案1／2／3／4／5不會上傳…`);try{let i=await q({action:"adminSaveMemberGroups",adminToken:Q(),groups:t}),a=Number(i&&i.savedCount),n=Number(i&&i.missingCount);await ce(),k(`分組設定上傳完成：已保存 ${Number.isFinite(a)?a:t.length} 位${Number.isFinite(n)&&n>0?`，另有 ${n} 位在玩家資料中找不到`:""}。本機方案1／2／3／4／5未上傳。`)}catch(i){k(i&&i.message?i.message:"全部設定上傳失敗。",!0)}finally{o.admin.groupSyncInFlight=!1,Z()}}async function yc(){if(!(!V()||o.admin.groupSyncInFlight)){o.admin.groupSyncInFlight=!0,Z(),k("正在從試算表下載分組設定；本機方案1／2／3／4／5會完整保留…");try{let e=await q({action:"adminMembers",adminToken:Q()}),t=Array.isArray(e&&e.members)?e.members:[],i=new Map(t.map(n=>[A(n),{memberGroup:st(n),memberRole:ct(n),selectedAuraHrid:vi(n&&n.selectedAuraHrid),selectedLifeTrialHrid:Bt(n&&n.selectedLifeTrialHrid,g.LIFE),selectedBattleTrialHrid:Bt(n&&n.selectedBattleTrialHrid,g.BATTLE)}])),a=0;o.admin.members.forEach(n=>{let r=A(n);if(!i.has(r))return;let l=i.get(r);yi(r,l.memberGroup),Ai(r,l.memberRole),xi(r,l.selectedAuraHrid),Ba(r,g.LIFE,l.selectedLifeTrialHrid),Ba(r,g.BATTLE,l.selectedBattleTrialHrid),a+=1}),await ce(),H(),k(`已從試算表下載 ${a} 位會員分組設定；本機方案1／2／3／4／5沒有被覆蓋。`)}catch(e){k(e&&e.message?e.message:"全部設定下載失敗。",!0)}finally{o.admin.groupSyncInFlight=!1,Z()}}}function lr(e,t="member"){let i=document.createElement("select");i.className=t==="talent"?"mwi-talent-group-select":"mwi-member-group-select",i.dataset.role="admin-member-group-select";let a=document.createElement("option");return a.value="",a.textContent="未分組",i.appendChild(a),ea.forEach(n=>{let r=document.createElement("option");r.value=n,r.textContent=n,i.appendChild(r)}),i.value=st(e),i.title=`設定 ${B(e)} 的試煉分組`,i.setAttribute("aria-label",`${B(e)} 的試煉分組`),i.addEventListener("click",n=>n.stopPropagation()),i.addEventListener("pointerdown",n=>n.stopPropagation()),i.addEventListener("keydown",n=>n.stopPropagation()),i.addEventListener("change",()=>Ml(e,i)),i}function Sc(e){let t=document.createElement("span");return t.className="mwi-member-cell mwi-member-group-cell",t.appendChild(lr(e)),t}function Si(e){let t=String(e||"").trim();return Zi.includes(t)?t:""}function ct(e){return Si(e&&e.memberRole)}function vi(e){let t=String(e||"").trim();return ri.some(i=>i.hrid===t)?t:""}function xi(e,t){let i=String(e||""),a=vi(t);if(!i)return;a?o.admin.auraSelections.set(i,a):o.admin.auraSelections.delete(i),o.admin.members.forEach(r=>{A(r)===i&&(r.selectedAuraHrid=a)}),o.admin.memberDetail&&[o.admin.memberDetail,o.admin.memberDetail.member,o.admin.memberDetail.summary].filter(Boolean).forEach(r=>{(!A(r)||A(r)===i)&&(r.selectedAuraHrid=a)});let n=X(i);if(n){let r={...n.summary||n.member||{}};r.selectedAuraHrid=a,fe(i,{...n,summary:r})}m.shadow.querySelectorAll('select[data-role="admin-member-aura-select"][data-character-id]').forEach(r=>{String(r.dataset.characterId||"")===i&&(r.value=a)}),er()}function Bt(e,t){let i=String(e||"").trim().toLowerCase();return(t===g.BATTLE?ni:ai).some(([n])=>n===i)?i:""}function ue(e,t){return Bt(e&&(t===g.BATTLE?e.selectedBattleTrialHrid:e.selectedLifeTrialHrid),t)}function Ba(e,t,i){let a=String(e||""),n=t===g.BATTLE?"selectedBattleTrialHrid":"selectedLifeTrialHrid",r=Bt(i,t);if(!a)return;o.admin.members.forEach(s=>{A(s)===a&&(s[n]=r)}),o.admin.memberDetail&&[o.admin.memberDetail,o.admin.memberDetail.member,o.admin.memberDetail.summary].filter(Boolean).forEach(s=>{(!A(s)||A(s)===a)&&(s[n]=r)});let l=X(a);if(l){let s={...l.summary||l.member||{}};s[n]=r,fe(a,{...l,summary:s})}}function Bl(e){let t=e===g.BATTLE?"battle":"life",i=e===g.BATTLE?ni:ai,a=new Map(i),n=ae(o.guildWeeklyTrials[t],t);return(n.length?n:i.map(([l])=>l)).map(l=>({hrid:l,name:U(l,a.get(l)||l)}))}function vc(e,t){let i=document.createElement("span");i.className="mwi-member-cell mwi-member-trial-cell";let a=document.createElement("select");a.className=`mwi-member-trial-select ${t===g.BATTLE?"battle":"life"}`;let n=A(e),r=B(e),l=t===g.BATTLE?"戰鬥試煉":"生活試煉",s=ue(e,t),c=Bl(t),d=document.createElement("option");if(d.value="",d.textContent=`未選${l}`,a.appendChild(d),c.forEach(u=>{let f=document.createElement("option");f.value=u.hrid,f.textContent=u.name,a.appendChild(f)}),s&&!c.some(u=>u.hrid===s)){let u=document.createElement("option");u.value=s,u.textContent=`${Te(s)}（非本週）`,u.disabled=!0,a.appendChild(u)}return a.value=s,a.disabled=o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing,a.title=`選擇 ${r} 要發布的${l}`,a.setAttribute("aria-label",`${r} 的${l}`),a.addEventListener("click",u=>u.stopPropagation()),a.addEventListener("pointerdown",u=>u.stopPropagation()),a.addEventListener("keydown",u=>u.stopPropagation()),a.addEventListener("change",async()=>{let u=Bt(a.value,t);Ba(n,t,u),await ce(),k(u?`${r} 的${l}已選為「${Te(u)}」。`:`${r} 已清除${l}選擇。`);let f=t===g.BATTLE?"selectedBattleTrialHrid":"selectedLifeTrialHrid";o.admin.sortKey===f&&H()}),i.appendChild(a),i}function Ai(e,t){let i=String(e||""),a=Si(t);o.admin.members.forEach(r=>{A(r)===i&&(r.memberRole=a)}),o.admin.memberDetail&&[o.admin.memberDetail,o.admin.memberDetail.member,o.admin.memberDetail.summary].filter(Boolean).forEach(r=>{(!A(r)||A(r)===i)&&(r.memberRole=a)});let n=X(i);if(n){let r={...n.summary||n.member||{}};r.memberRole=a,fe(i,{...n,summary:r})}}async function Hl(e,t){if(!V()||!e||!t||t.dataset.saving==="true")return;let i=A(e),a=ct(e),n=Si(t.value);if(t.value=n,!(!i||n===a)){t.dataset.saving="true",t.classList.add("saving"),t.disabled=!0,Ai(i,n);try{let r=await q({action:"adminSaveMemberRole",adminToken:Q(),characterId:i,memberRole:n}),l=Si(r.memberRole??n);Ai(i,l),await ce(),k(l?`已將 ${B(e)} 設為「${l}」。`:`已清除 ${B(e)} 的角色定位。`),H()}catch(r){Ai(i,a),t.isConnected&&(t.value=a),k(r&&r.message?r.message:"角色定位儲存失敗。",!0)}finally{t.isConnected&&(t.dataset.saving="false",t.classList.remove("saving"),t.disabled=!1)}}}function sr(e,t="member"){let i=document.createElement("select");i.className=t==="talent"?"mwi-talent-role-select":"mwi-member-role-select",i.dataset.role="admin-member-role-select";let a=document.createElement("option");return a.value="",a.textContent="未設定",i.appendChild(a),Zi.forEach(n=>{let r=document.createElement("option");r.value=n,r.textContent=n,i.appendChild(r)}),i.value=ct(e),i.title=`設定 ${B(e)} 的角色定位`,i.setAttribute("aria-label",`${B(e)} 的角色定位`),i.addEventListener("click",n=>n.stopPropagation()),i.addEventListener("pointerdown",n=>n.stopPropagation()),i.addEventListener("keydown",n=>n.stopPropagation()),i.addEventListener("change",()=>Hl(e,i)),i}function xc(e){let t=document.createElement("span");return t.className="mwi-member-cell mwi-member-role-cell",t.appendChild(sr(e)),t}function Rl(e,t){let a={fierceAura:"physicalAura",mysticAura:"elementalAura"}[t.key]||t.key,n=X(A(e)),r=n&&(n.snapshot||n.member?.snapshot),l=[e,n,n&&n.summary,n&&n.player,n&&n.member,r,r&&r.profile,n&&n.profile].filter(d=>d&&typeof d=="object"),s=[],c=d=>{let u=se(d);u!==null&&s.push(u)};return c(_i(e,`levels.abilities.${t.key}`)),c(_i(e,`levels.abilities.${a}`)),l.forEach(d=>{c(d.levels?.abilities?.[t.key]),c(d.levels?.abilities?.[a]),c(d.auras?.[t.key]),c(d.auras?.[a]);for(let u of[d.abilities,d.skills])Array.isArray(u)&&u.forEach(f=>{String(f&&(f.abilityHrid||f.skillHrid||f.hrid)||"")===t.hrid&&c(f.level??f.abilityLevel??f.skillLevel)})}),s.length?Math.max(...s):0}function Dl(e){return ri.map(t=>({...t,level:Rl(e,t)})).filter(t=>t.level>0)}function Ac(e){let t=document.createElement("span");t.className="mwi-member-cell mwi-member-aura-cell";let i=document.createElement("select");i.className="mwi-member-aura-select",i.dataset.role="admin-member-aura-select";let a=A(e);i.dataset.characterId=a;let n=B(e),r=te(e)?Dl(e):[],l=String(o.admin.auraSelections.get(a)||""),s=document.createElement("option");return s.value="",s.textContent=r.length?"未選擇光環":"無光環資料",i.appendChild(s),r.forEach(c=>{let d=document.createElement("option");d.value=c.hrid,d.textContent=`${c.name}（Lv.${c.level}）`,i.appendChild(d)}),i.value=r.some(c=>c.hrid===l)?l:"",i.disabled=!r.length,i.title=i.disabled?`${n} 目前沒有可選的光環資料`:`選擇 ${n} 使用的光環`,i.setAttribute("aria-label",`${n} 的光環`),i.addEventListener("click",c=>c.stopPropagation()),i.addEventListener("pointerdown",c=>c.stopPropagation()),i.addEventListener("keydown",c=>c.stopPropagation()),i.addEventListener("change",()=>{let c=String(i.value||"");xi(a,c);let d=r.find(u=>u.hrid===c);k(d?`${n} 已選擇 ${d.name}（Lv.${d.level}）。`:`${n} 已清除光環選擇。`),o.admin.sortKey==="selectedAura"&&H()}),t.appendChild(i),t}function ki(e,t){let i=document.createElement("span");return i.className=`mwi-member-cell ${t||""}`.trim(),i.textContent=String(e??"—"),i.title=i.textContent,i}function cr(e,t){if(t==="memberGroup"){let n=st(e),r=ea.indexOf(n);return r<0?null:r}if(t==="memberRole"){let n=ct(e),r=Zi.indexOf(n);return r<0?null:r}if(t==="selectedAura"){let n=String(o.admin.auraSelections.get(A(e))||""),r=ri.findIndex(l=>l.hrid===n);return r<0?null:r}if(t==="selectedLifeTrialHrid"||t==="selectedBattleTrialHrid"){let n=t==="selectedBattleTrialHrid"?g.BATTLE:g.LIFE,r=ue(e,n),s=(n===g.BATTLE?ni:ai).findIndex(([c])=>c===r);return s<0?null:s}if(!te(e))return null;let i=_i(e,t);if(i==null||i==="")return null;let a=t==="updatedAt"?new Date(i).getTime():Number(i);return Number.isFinite(a)?a:null}function Pl(e){let t=Ge(e&&e.adminCalculatedBuildScore);if(!t)return o.admin.scoreInputsLoading?"計算中":"—";let i=rt(t.value);return t.complete?i:`${i}*`}function kc(e){let t=Number(e&&e.combatLevel);return Number.isFinite(t)&&t>=0?t.toFixed(2):"—"}function Z(){if(!m)return;let e=o.admin.selectedMemberIds.size,t=o.admin.members.filter(te).length;if(m.adminSelectionCount&&(m.adminSelectionCount.textContent=`已選 ${e}／${t} 人`),m.adminBatchPublish&&(m.adminBatchPublish.disabled=!e||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing,m.adminBatchPublish.textContent=o.admin.batchPublishing?"正在套用勾選名單…":`套用勾選名單（${e} 人）`),m.adminSelectAll&&(m.adminSelectAll.disabled=!t||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing),m.adminClearSelection&&(m.adminClearSelection.disabled=!e||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing),m.adminNoticeOpen&&(m.adminNoticeOpen.disabled=!t||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing),m.adminTalentSelectResults){let i=Array.isArray(m.adminTalentSelectResults._mwiCharacterIds)?m.adminTalentSelectResults._mwiCharacterIds.length:0;m.adminTalentSelectResults.disabled=!i||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing}m.adminGroupUploadButton&&(m.adminGroupUploadButton.disabled=o.admin.groupSyncInFlight||o.admin.loading,m.adminGroupUploadButton.textContent=o.admin.groupSyncInFlight?"同步分組設定中…":"上傳分組設定（不含方案1～5）"),m.adminGroupDownloadButton&&(m.adminGroupDownloadButton.disabled=o.admin.groupSyncInFlight||o.admin.loading,m.adminGroupDownloadButton.textContent=o.admin.groupSyncInFlight?"同步分組設定中…":"下載分組設定（保留本機方案1～5）"),m.adminTrialDraftExportButton&&(m.adminTrialDraftExportButton.disabled=o.admin.groupSyncInFlight||o.admin.loading||!o.admin.members.length),m.adminTrialDraftImportButton&&(m.adminTrialDraftImportButton.disabled=o.admin.groupSyncInFlight||o.admin.loading||!o.admin.members.length)}function $l(){o.admin.selectedMemberIds=new Set(o.admin.members.filter(te).map(A).filter(Boolean)),H()}function Ol(){o.admin.selectedMemberIds.clear(),H()}function dr(e,t){let i=String(e||"");i&&(t?o.admin.selectedMemberIds.add(i):o.admin.selectedMemberIds.delete(i),Z())}function ql(){m.shadow.querySelector('[data-role="admin-notice-overlay"]')?.remove();let e=o.admin.members.filter(te);if(!e.length){k("目前沒有可接收通知的已上傳會員。",!0);return}let t=new Set(e.map(A).filter(Boolean)),i=[...o.admin.selectedMemberIds].filter(S=>t.has(String(S))),a=document.createElement("dialog");a.className="mwi-admin-notice-overlay",a.dataset.role="admin-notice-overlay";let n=document.createElement("section");n.className="mwi-choice-dialog",n.setAttribute("role","dialog"),n.setAttribute("aria-modal","true"),n.setAttribute("aria-label","發布公會通知");let r=document.createElement("header");r.className="mwi-header";let l=document.createElement("h2");l.className="mwi-title",l.textContent="發布公會通知";let s=document.createElement("button");s.type="button",s.className="mwi-close",s.setAttribute("aria-label","關閉發布通知"),s.textContent="×",r.append(l,s);let c=document.createElement("div");c.className="mwi-admin-notice-content";let d=document.createElement("div");d.className="mwi-admin-notice-targets";let u=document.createElement("label"),f=document.createElement("input");f.type="radio",f.name="mwi-admin-notice-target",f.value="selected",f.disabled=!i.length,f.checked=!!i.length,u.append(f,document.createTextNode(`已勾選會員（${i.length} 人）`));let p=document.createElement("label"),_=document.createElement("input");_.type="radio",_.name="mwi-admin-notice-target",_.value="all",_.checked=!i.length,p.append(_,document.createTextNode(`全部有資料會員（${e.length} 人）`)),d.append(u,p);let h=document.createElement("textarea");h.className="mwi-admin-notice-textarea",h.maxLength=2e3,h.placeholder="輸入要通知會員的內容（最多 2000 字）";let b=document.createElement("span");b.className="mwi-publish-status",b.setAttribute("aria-live","polite");let y=document.createElement("div");y.className="mwi-admin-notice-actions";let x=document.createElement("button");x.type="button",x.className="mwi-button",x.textContent="取消";let E=document.createElement("button");E.type="button",E.className="mwi-button primary",E.textContent="發布通知",y.append(b,x,E),c.append(d,h,y),n.append(r,c),a.appendChild(n),m.shadow.appendChild(a);let v=()=>{a.open&&a.close(),a.remove()},T=()=>{o.admin.noticePublishing||v()};s.addEventListener("click",T),x.addEventListener("click",T),a.addEventListener("cancel",S=>{S.preventDefault(),T()}),a.addEventListener("click",S=>{S.target===a&&T()}),E.addEventListener("click",async()=>{if(o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.batchPublishing||o.admin.directPublishing)return;let S=String(h.value||"").trim(),C=_.checked,I=C?[...t]:i.slice();if(!S){b.textContent="請先輸入通知內容。",b.classList.add("error"),h.focus();return}if(!I.length){b.textContent="請先勾選至少一位會員，或選擇全部會員。",b.classList.add("error");return}let N=C?`全部 ${I.length} 位有資料會員`:`已勾選的 ${I.length} 位會員`;if(kt(`確定發布這則通知給${N}？`)){o.admin.noticePublishing=!0,Z(),E.disabled=!0,x.disabled=!0,s.disabled=!0,h.disabled=!0,f.disabled=!0,_.disabled=!0,b.classList.remove("error"),b.textContent="正在發布通知…";try{let M=await q({action:"adminPublishNotice",adminToken:Q(),characterIds:I,title:"公會通知",content:S}),R=String(o.character&&o.character.id||"");R&&I.includes(R)&&await Ke();let L=Number(M.publishedCount);k(`通知已發布給 ${Number.isFinite(L)?Math.max(0,L):I.length} 位會員。`),v()}catch(M){b.textContent=M&&M.message?M.message:"通知發布失敗。",b.classList.add("error")}finally{o.admin.noticePublishing=!1,Z(),E.disabled=!1,x.disabled=!1,s.disabled=!1,h.disabled=!1,f.disabled=!i.length,_.disabled=!1}}}),a.showModal(),h.focus()}function mr(){let e=String(m.adminSearch&&m.adminSearch.value||"").trim().toLowerCase(),t=o.admin.members.map((i,a)=>({member:i,index:a}));if(e&&(t=t.filter(({member:i})=>B(i).toLowerCase().includes(e)||A(i).toLowerCase().includes(e)||Mt(i).toLowerCase().includes(e)||st(i).includes(e)||ct(i).toLowerCase().includes(e))),o.admin.sortKey&&o.admin.sortDescending){let i=o.admin.sortKey;t=t.map(a=>({...a,sortValue:cr(a.member,i)})),t.sort((a,n)=>{let r=a.sortValue===null,l=n.sortValue===null;return r!==l?r?1:-1:!r&&a.sortValue!==n.sortValue?["memberGroup","memberRole","selectedAura","selectedLifeTrialHrid","selectedBattleTrialHrid"].includes(i)?a.sortValue-n.sortValue:n.sortValue-a.sortValue:lt(a.member,a.index)-lt(n.member,n.index)})}else t.sort((i,a)=>lt(i.member,i.index)-lt(a.member,a.index));return t}function H(){if(!m||!m.adminMemberList)return;let e=mr();if(m.adminMemberList.replaceChildren(),!e.length){m.adminMemberList.textContent="沒有符合條件的會員。",Z();return}let t=vl(),i=document.createElement("div");i.className="mwi-member-table mwi-publish-table",i.appendChild(Al(t)),e.forEach(({member:a,index:n})=>{let r=A(a),l=B(a),s=te(a),c=document.createElement("div");c.className="mwi-member-row",c.classList.toggle("active",r===o.admin.selectedCharacterId),c.classList.toggle("missing",!s);let d=document.createElement("label");d.className="mwi-member-select-cell",d.title=s?`選取 ${l}`:"尚未上傳資料，無法發布";let u=document.createElement("input");u.type="checkbox",u.checked=s&&o.admin.selectedMemberIds.has(r),u.disabled=!s||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing,u.setAttribute("aria-label",`選取 ${l}`),u.addEventListener("change",()=>{dr(r,u.checked)}),u.addEventListener("click",_=>_.stopPropagation()),d.addEventListener("click",_=>_.stopPropagation()),d.appendChild(u),c.append(d,ki(l,"name"),Nl(a),ki(Te(ue(a,g.LIFE)),"life"),ki(Te(ue(a,g.BATTLE)),"combat"));let f=Na(a),p=ki(s?f?ln(f):"有資料":"尚未上傳",`updated ${s?"mwi-member-uploaded":"mwi-member-missing"}`);c.appendChild(p),s||(c.title="這位會員尚未上傳資料，無法建立方案。"),i.appendChild(c)}),m.adminMemberList.appendChild(i),Z()}async function We(e){if(!e)return;let t=String(e);o.admin.selectedCharacterId!==t&&(o.admin.selectedPlanId="",o.admin.preservedTypeDrafts=null),o.admin.selectedCharacterId=t,H(),m.adminMemberOverlay.hidden=!1;let i=X(t);if(!i){m.adminMemberTitle.textContent="本機沒有這位會員的完整資料",m.adminMemberDetail.textContent="請按「重新整理全部資料」下載最新會員裝備、技能與方案。";return}let a=o.admin.members.find(n=>A(n)===t);o.admin.memberDetail={...i,summary:a||i.summary||i.member||{},adminCalculatedBuildScore:a?a.adminCalculatedBuildScore:null},Ti()}function ur(){let e=String(o.admin.selectedCharacterId||""),t=mr().map(({member:n})=>n).filter(n=>te(n)&&!!X(A(n)));if(t.length<2)return"";let i=t.findIndex(n=>A(n)===e),a=i>=0?(i+1)%t.length:0;return A(t[a])}async function Fl(){let e=ur();if(!e){k("目前沒有下一位可開啟的成員",!0);return}Ja()&&(ge(),await We(e))}function Ht(e,t,i){let a=document.createElement("span"),n=e==="item"?o.itemSpriteUrl:e==="ability"?o.abilitySpriteUrl:o.skillSpriteUrl,r=String(t||"").split("/").pop();if(n&&r){let l=document.createElementNS("http://www.w3.org/2000/svg","svg");l.setAttribute("viewBox","0 0 40 40");let s=document.createElementNS("http://www.w3.org/2000/svg","use");s.setAttribute("href",`${n}#${r}`),l.appendChild(s),a.appendChild(l)}else a.textContent="◇",a.style.cssText="display:block;font-size:28px;line-height:34px;color:#8fa8d8;";return i&&(a.title=i),a}function Tc(e,t){let i=document.createElement("div");i.className="mwi-icon-card";let a=String(t.itemHrid||t.abilityHrid||t.skillHrid||""),n=e==="ability"&&t.combatActionHrid?t.combatActionHrid:a,r=U(a,t.name||a.split("/").pop());i.appendChild(Ht(e,n,r));let l=document.createElement("div");l.textContent=r;let s=document.createElement("div");return s.className="level",e==="item"?s.textContent=`${t.itemLevel?`${t.itemLevel}級 `:""}${t.enhancementLevel?`+${t.enhancementLevel} `:""}×${t.count||1}${t.equippedCount?"｜身上":""}`:s.textContent=`Lv.${Number(t.level)||0}`,i.append(l,s),i}function Ve(e){let t=String(e||"").trim().toLowerCase();return["battle","combat","combat_trial"].includes(t)?g.BATTLE:g.LIFE}function de(e){return Ve(e)===g.BATTLE?"戰鬥方案":"生活方案"}function pr(e){let t=Date.parse(String(e&&(e.updatedAt||e.savedAt||e.createdAt||e.publishedAt)||""));return Number.isFinite(t)?t:0}function fr(e,t,i=""){let a=Ve(t),n=(Array.isArray(e)?e:[]).filter(c=>c&&Ve(c.planType||c.type)===a);if(!n.length)return null;let r=String(i||""),s=(r?n.find(c=>String(c.planId||c.id||"")===r):null)||[...n].sort((c,d)=>pr(d)-pr(c)||String(d.planId||d.id||"").localeCompare(String(c.planId||c.id||"")))[0];return s?{...s,planType:a,type:a,name:de(a)}:null}function Ha(e,t=""){let i=Array.isArray(e)?e:e&&typeof e=="object"?Object.values(e):[],a=new Set;return i.forEach(n=>{if(typeof n=="string"){(!t||n.startsWith(`/${t}`))&&a.add(n);return}if(!n||typeof n!="object")return;let r=String(t==="abilities"?n.abilityHrid||n.skillHrid||n.hrid||"":n.skillHrid||n.abilityHrid||n.hrid||"");r&&(!t||r.startsWith(`/${t}/`))&&a.add(r)}),[...a]}function Rt(e){let t=e&&typeof e=="object"?e:{},a={...t.config&&typeof t.config=="object"?t.config:{},...t};return delete a.config,a.planType=Ve(a.planType||a.type),a.planId=String(a.planId||a.id||""),a.name=String(a.name||a.planName||(a.planType===g.BATTLE?"戰鬥方案":"生活方案")),a.trialHrid=String(a.trialHrid||a.trial?.hrid||a.recommendedTrialHrid||""),a.equipment=a.equipment||a.equipmentSlots||a.selectedEquipment||{},a.skillHrids=Ha(a.skillHrids||a.skillSlots||a.selectedSkills,"skills"),a.abilitySlots=Re(a.abilitySlots||a.abilityHrids||a.selectedAbilities||a.skillSlots),a.abilityHrids=a.abilitySlots.filter(Boolean),a}function Dt(...e){return e.find(t=>Array.isArray(t))||[]}function Ra(...e){for(let t of e){if(t===""||t===null||t===void 0)continue;let i=Number(t);if(Number.isFinite(i))return Math.max(0,Math.floor(i))}return null}function gr(e,t){let i=new Map;return e.forEach(a=>{if(!a||typeof a!="object")return;let n=String(t.map(r=>a[r]).find(Boolean)||"");n&&i.set(n,{...i.get(n)||{},...a})}),[...i.values()]}function Da(e){let t=e&&typeof e=="object"?e:{},i=t.snapshot&&typeof t.snapshot=="object"?t.snapshot:t.member?.snapshot&&typeof t.member.snapshot=="object"?t.member.snapshot:{},a=t.summary||t.player||t.member||{},n=i.profile&&typeof i.profile=="object"?i.profile:t.profile&&typeof t.profile=="object"?t.profile:{},r={...a,characterId:String(a.characterId||a.id||n.character?.id||i.character?.id||""),characterName:String(a.characterName||a.name||n.character?.name||i.character?.name||"")},l=Dt(t.equipment,t.items,i.equipment,i.items).map(w=>{let z=String(w&&(w.itemHrid||w.hrid||w.item?.itemHrid||w.item?.hrid)||""),zi=String(w&&(w.slotHrid||w.slot||w.itemLocationHrid||w.location)||"");return{...w||{},itemHrid:z,hrid:String(w&&w.hrid||z),itemKey:String(w&&w.itemKey||`${z}::${Number(w&&w.enhancementLevel)||0}`),slotHrid:zi,name:U(z,w&&w.name||z.split("/").pop())}}).filter(w=>w.itemHrid&&w.slotHrid),s=Dt(t.skills,i.skills),c=Dt(t.abilities,i.abilities),d=s.filter(w=>w&&(String(w.type||"").toLowerCase()==="ability"||!!w.abilityHrid)),u=gr(s.filter(w=>!d.includes(w)),["skillHrid","hrid"]).map(w=>({...w,skillHrid:String(w.skillHrid||w.hrid||""),name:U(w.skillHrid||w.hrid,w.name)})),f=gr([...c,...d],["abilityHrid","skillHrid","hrid"]).map(w=>({...w,abilityHrid:String(w.abilityHrid||w.skillHrid||w.hrid||""),name:U(w.abilityHrid||w.skillHrid||w.hrid,w.name)})),p=new Map(u.map(w=>[w.skillHrid,w])),_=new Map(f.map(w=>[w.abilityHrid,w])),h=a.levels&&typeof a.levels=="object"?a.levels:{},b=t.levels&&typeof t.levels=="object"?t.levels:{},y={};ve.forEach(w=>{y[w.key]=Ra(h.life?.[w.key],b.life?.[w.key],n.lifeSkills?.[w.key],t.lifeSkills?.[w.key],i.lifeSkills?.[w.key],p.get(w.hrid)?.level)});let x={};Me.forEach(w=>{x[w.key]=Ra(h.combat?.[w.key],b.combat?.[w.key],n.combatSkills?.[w.key],t.combatSkills?.[w.key],i.combatSkills?.[w.key],p.get(w.hrid)?.level)});let E={fierceAura:"physicalAura",mysticAura:"elementalAura"},v={};Be.forEach(w=>{let z=E[w.key]||w.key;v[w.key]=Ra(h.abilities?.[w.key],h.abilities?.[z],b.abilities?.[w.key],b.abilities?.[z],n.auras?.[w.key],n.auras?.[z],t.auras?.[w.key],t.auras?.[z],i.auras?.[w.key],i.auras?.[z],_.get(w.hrid)?.level)}),v.physicalAura=v.fierceAura,v.elementalAura=v.mysticAura;let S=Dt(t.plans,t.draftPlans,t.planDrafts,i.plans).map(Rt),C=t.publishedPlans||t.published||{},I=C&&typeof C=="object"?C.life||C.lifePlan:null,N=C&&typeof C=="object"?C.battle||C.battlePlan||C.combat:null,M=String(t&&(t.publishedLifePlanId||t.published?.lifePlanId||t.activePlans?.life||I?.planId||I?.id)||""),R=String(t&&(t.publishedBattlePlanId||t.published?.battlePlanId||t.activePlans?.battle||N?.planId||N?.id)||""),L=[fr(S,g.LIFE,M),fr(S,g.BATTLE,R)].filter(Boolean),F=n.guildWeeklyTrials||i.guildWeeklyTrials||{},he=[t.equippedAbilityHrids,i.equippedAbilityHrids].find(w=>Array.isArray(w)),Ee=he?he.map(w=>String(w&&(w.abilityHrid||w.hrid)||w||"")).filter(Boolean):f.filter(w=>!!w.equipped).sort((w,z)=>(Number(w.order)||0)-(Number(z.order)||0)).map(w=>w.abilityHrid);return{member:r,profile:n,buildScore:Object.prototype.hasOwnProperty.call(t,"adminCalculatedBuildScore")?Ge(t.adminCalculatedBuildScore):pi(t),levels:{life:y,combat:x,abilities:v},equipment:l,skills:u,abilities:f,equippedAbilityHrids:Ee,plans:L,allPlans:S,publishedLifePlanId:M,publishedBattlePlanId:R,availableTrials:t.availableTrials||i.availableTrials||{life:F.availableLife||F.life||[],battle:F.availableBattle||F.battle||[]}}}function Ti(){if(!m||!o.admin.memberDetail)return;let e=Da(o.admin.memberDetail),t=e.member,i=String(t.characterId||t.id||o.admin.selectedCharacterId),a=String(t.characterName||t.name||"未知會員");m.adminMemberTitle.textContent=`${a}｜方案管理`,m.adminMemberDetail.replaceChildren();let n=document.createElement("div");n.className="mwi-equipment-summary mwi-member-summary-strip";let r=e.equipment.filter(u=>Number(u.equippedCount)>0).length,l=e.buildScore&&(String(e.buildScore.source||"").includes("公會資料插件內建")||String(e.buildScore.source||"").includes("成員上傳"))?"成員本機計分":"管理員市場計分";[`擁有裝備：${e.equipment.length} 種`,`目前身上：${r} 種`,`角色技能：${e.skills.length} 項`,`戰鬥技能：${e.abilities.length} 項`,e.buildScore?[`${l}：${rt(e.buildScore.value)}`,`裝備 ${Number(e.buildScore.equipment||0).toFixed(1)}`,`技能 ${Number(e.buildScore.ability||0).toFixed(1)}`,`房屋 ${Number(e.buildScore.house||0).toFixed(1)}`,e.buildScore.complete?"":"（資料不完整或使用保守估值）"].filter(Boolean).join("｜"):o.admin.scoreInputsLoading?"裝備技能分數：計算中":"裝備技能分數：尚無可計算資料",`生活方案：${e.plans.some(u=>u.planType===g.LIFE)?"已儲存":"尚未儲存"}`,`戰鬥方案：${e.plans.some(u=>u.planType===g.BATTLE)?"已儲存":"尚未儲存"}`,`模擬方案：${jl(i)}/${Ye.length} 已儲存`].forEach(u=>{let f=document.createElement("span");f.textContent=u,n.appendChild(f)});let s=document.createElement("div");s.className="mwi-member-profile-layout";let c=zl(e),d=Kl(e);c.append(d._mwiSidebarControls,n),s.append(c,d),m.adminMemberDetail.appendChild(s)}function Pa(e,t,i){let a=document.createElement("section");a.className="mwi-profile-level-section";let n=document.createElement("h3");n.textContent=e;let r=document.createElement("div");return r.className="mwi-profile-level-grid",t.forEach(l=>{let s=document.createElement("div");s.className="mwi-profile-level-row";let c=document.createElement("span");c.textContent=l.name;let d=document.createElement("strong"),u=i&&i[l.key];d.textContent=u!=null&&Number.isFinite(Number(u))?String(Number(u)):"—",s.append(c,d),r.appendChild(s)}),a.append(n,r),a}function zl(e){let t=document.createElement("div");return t.className="mwi-profile-levels",t.append(Pa("生活技能等級",ve,e.levels.life),Pa("戰鬥技能等級",Me,e.levels.combat),Pa("光環與復活等級",Be,e.levels.abilities)),t}function Pt(e){let t=[],i=new Set;Ha(e,"abilities").forEach(r=>{!r||i.has(r)||(i.add(r),t.push(r))});let a=t.filter(r=>!it.has(r)).slice(0,me-1),n=t.find(r=>it.has(r))||"";return n?[n,...a]:a}function Re(e){let t=Pt(e),i=t.find(n=>it.has(n))||"",a=t.filter(n=>!it.has(n)).slice(0,me-1);for(;a.length<me-1;)a.push("");return[i,...a]}function Gl(e){if(!e||typeof e!="object"||Array.isArray(e))return null;let t=String(e.dependencyHrid||"").trim(),i=String(e.conditionHrid||"").trim(),a=String(e.comparatorHrid||"").trim();if(!t.startsWith("/combat_trigger_dependencies/")||!i.startsWith("/combat_trigger_conditions/")||!a.startsWith("/combat_trigger_comparators/"))return null;let n=Number(e.value);return{dependencyHrid:t.slice(0,200),conditionHrid:i.slice(0,200),comparatorHrid:a.slice(0,200),value:Number.isFinite(n)?Math.max(-1e9,Math.min(1e9,n)):0}}function $t(e){return Array.isArray(e)?e.slice(0,12).map(Gl).filter(Boolean):[]}function Ot(e,t=null){if(!e||typeof e!="object"||Array.isArray(e))return{};let i=Array.isArray(t)?new Set(t.filter(Boolean)):null,a={};return Object.keys(e).slice(0,me).forEach(n=>{let r=String(n||"").trim();!r.startsWith("/abilities/")||i&&!i.has(r)||!Array.isArray(e[n])||(a[r]=$t(e[n]))}),a}function hr(e){let t=W(o.abilityDetailMap,e);return $t(t&&t.defaultCombatTriggers)}function dt(){try{let e=P.localStorage.getItem(Je),t=e?JSON.parse(e):null,i=t&&t.members&&typeof t.members=="object"&&!Array.isArray(t.members)?t.members:{},a={};return Object.entries(i).forEach(([n,r])=>{let l=De(r);l&&(a[String(n)]=l)}),{schemaVersion:2,updatedAt:String(t&&t.updatedAt||""),members:a}}catch{return{schemaVersion:2,members:{}}}}function br(){return new Map(o.admin.members.map(e=>[A(e),e]).filter(([e])=>!!e))}function Ci(e){let t=De(e);return t?Ye.filter(i=>!!t.slots[i]).length:0}async function _r(e){let t=P.crypto||window.crypto;if(!t||!t.subtle||typeof TextEncoder!="function")return"";let i=new TextEncoder().encode(String(e||"")),a=await t.subtle.digest("SHA-256",i);return Array.from(new Uint8Array(a)).map(n=>n.toString(16).padStart(2,"0")).join("")}async function Ul(){let e=br();if(!e.size)throw new Error("尚未讀取正式公會名單，無法匯出本機方案。");let t=m&&m.adminMemberDetail?m.adminMemberDetail.querySelector(".mwi-plan-card.workbench"):null;t&&mt(t);let i=dt(),a=new Date().toISOString(),n=[...e.entries()].sort(([l],[s])=>l.localeCompare(s)).map(([l,s])=>({characterId:l,memberName:B(s),draft:De(i.members[l])})),r={kind:mn,schemaVersion:1,pluginVersion:$,generatedAt:a,source:{type:"LOCAL_PLUGIN_STORAGE",readAt:a,storageKey:Je},rosterMemberCount:e.size,memberPlanCount:n.filter(l=>Ci(l.draft)>0).length,savedPlanCount:n.reduce((l,s)=>l+Ci(s.draft),0),rows:n};return{...r,contentSha256:await _r(JSON.stringify(r))}}async function Cc(){if(V())try{let e=await Ul(),t=new Blob([`${JSON.stringify(e,null,2)}
`],{type:"application/json;charset=utf-8"}),i=URL.createObjectURL(t),a=document.createElement("a");a.href=i,a.download=`mwi-guild-local-plans-${e.generatedAt.replace(/[:.]/g,"-")}.json`,a.hidden=!0,document.body.appendChild(a),a.click(),a.remove(),window.setTimeout(()=>URL.revokeObjectURL(i),1e3),k(`已匯出本機方案1／2／3／4／5：${e.memberPlanCount} 位、${e.savedPlanCount} 套。`)}catch(e){k(e&&e.message?e.message:"匯出本機方案失敗。",!0)}}async function Ec(e){if(!V())return;let t=e&&e.currentTarget,i=t&&t.files&&t.files[0];if(i)try{if(i.size>10485760)throw new Error("本機方案備份超過 10 MB，已拒絕匯入。");let a=JSON.parse(await i.text());if(!a||a.kind!==mn||Number(a.schemaVersion)!==1||!Array.isArray(a.rows))throw new Error("這不是插件匯出的本機方案1～5備份檔。");if(a.contentSha256){let{contentSha256:f,...p}=a,_=await _r(JSON.stringify(p));if(_&&_!==String(f))throw new Error("本機方案備份雜湊不符，檔案可能已損壞或被修改。")}let n=br();if(!n.size)throw new Error("尚未讀取正式公會名單，無法匯入本機方案。");let r=new Map,l=0;if(a.rows.forEach(f=>{let p=String(f&&f.characterId||"").trim(),_=De(f&&(f.draft||f.battleDraft));if(!(!p||!_||!Ci(_))){if(!n.has(p)){l+=1;return}r.set(p,_)}}),!r.size)throw new Error("備份檔中沒有目前正式公會名單可使用的方案。");let s=[...r.values()].reduce((f,p)=>f+Ci(p),0);if(!kt(`將匯入 ${r.size} 位、${s} 套本機方案；相同角色的方案1～5會覆蓋，其他本機角色方案會保留。確定繼續嗎？`)){k("已取消匯入本機方案。");return}let d=dt();r.forEach((f,p)=>{d.members[p]=f});let u=new Date().toISOString();d.schemaVersion=2,d.updatedAt=u,P.localStorage.setItem(Je,JSON.stringify(d)),H(),o.admin.memberDetail&&Ti(),k(`已匯入 ${r.size} 位、${s} 套本機方案。${l?`另有 ${l} 位非目前公會名單角色已忽略。`:""}`)}catch(a){k(a&&a.message?a.message:"匯入本機方案失敗。",!0)}finally{t&&(t.value="")}}function Ae(e){let t=String(e||"");return Ye.includes(t)?t:"1"}function Y(e){return`模擬方案${Ae(e)}`}function Ei(e){return`simulation-${Ae(e)}`}function $a(e){let t=/^simulation-([12345])$/.exec(String(e||""));return t?Ae(t[1]):""}function Oa(e="1"){return{schemaVersion:2,activeSlot:Ae(e),slots:{},updatedAt:""}}function wr(e){if(!e||typeof e!="object"||Array.isArray(e))return null;let t=e.equipment&&typeof e.equipment=="object"&&!Array.isArray(e.equipment)?e.equipment:{},a=(Array.isArray(e.abilitySlots)?e.abilitySlots:Array.isArray(e.abilityHrids)?e.abilityHrids:[]).slice(0,me).map(r=>String(typeof r=="string"?r:r&&(r.hrid||r.abilityHrid||r.skillHrid)||"").trim());for(;a.length<me;)a.push("");let n=Re(a);return{schemaVersion:1,planType:g.BATTLE,name:String(e.name||de(g.BATTLE)).trim().slice(0,80),trialHrid:String(e.trialHrid||"").trim().slice(0,200),note:String(e.note||"").trim().slice(0,500),equipment:JSON.parse(JSON.stringify(t)),abilitySlots:n,abilityHrids:n.filter(Boolean),abilityTriggers:Ot(e.abilityTriggers||e.triggerMap,n),savedAt:String(e.savedAt||new Date().toISOString())}}function De(e){if(!e||typeof e!="object"||Array.isArray(e))return null;let t=Oa(e.activeSlot),i=e.slots&&typeof e.slots=="object"&&!Array.isArray(e.slots)?e.slots:null;if(i)Ye.forEach(a=>{let n=wr(i[a]);n&&(t.slots[a]={...n,name:Y(a)})});else{let a=wr(e);a&&(t.activeSlot="1",t.slots[1]={...a,name:Y("1")})}return t.updatedAt=String(e.updatedAt||Object.values(t.slots).map(a=>String(a.savedAt||"")).sort().pop()||""),t}function qa(e){let t=dt().members[String(e||"")];return De(t)}function Li(e,t=""){let i=qa(e);if(!i)return null;let a=Ae(t||i.activeSlot),n=i.slots[a];if(!n)return null;let r=Re(n.abilitySlots||n.abilityHrids);return{...n,planId:"",planType:g.BATTLE,name:Y(a),equipment:n.equipment&&typeof n.equipment=="object"?n.equipment:{},abilitySlots:r,abilityHrids:r.filter(Boolean),abilityTriggers:Ot(n.abilityTriggers||n.triggerMap,r),_localTrialDraft:!0,_simulationSlot:a}}function jl(e){let t=qa(e);return t?Ye.filter(i=>!!t.slots[i]).length:0}function Wl(e,t){let i=String(e||"");if(!i)return!1;try{let a=Ae(t),n=dt(),r=De(n.members[i])||Oa(a);if(r.activeSlot===a&&n.members[i])return!0;let l=new Date().toISOString();return r.activeSlot=a,r.updatedAt=l,n.schemaVersion=2,n.updatedAt=l,n.members[i]=r,P.localStorage.setItem(Je,JSON.stringify(n)),!0}catch{return!1}}function Vl(e,t=""){let i=e&&e.querySelector('[data-role="local-trial-draft-status"]');if(!i)return;let a=t?new Date(t):new Date,n=Ae(e.dataset.simulationSlot);i.textContent=`${Y(n)}已暫存於這台電腦 ${a.toLocaleTimeString(Fe,{hour:"2-digit",minute:"2-digit"})}`}function mt(e){if(!e||e.dataset.planType!==g.BATTLE||!e.classList.contains("workbench")||!e.dataset.simulationSlot)return!1;let t=String(o.admin.selectedCharacterId||"");if(!t)return!1;try{let i=Ae(e.dataset.simulationSlot),a=Ka(e),n=new Date().toISOString(),r=dt(),l=De(r.members[t])||Oa(i);return r.schemaVersion=2,r.updatedAt=n,l.activeSlot=i,l.updatedAt=n,l.slots[i]={planType:g.BATTLE,name:Y(i),trialHrid:String(a.trialHrid||""),note:String(a.note||""),equipment:a.equipment||{},abilitySlots:Re(a.abilitySlots||a.abilityHrids),abilityHrids:Pt(a.abilitySlots||a.abilityHrids),abilityTriggers:Ot(a.abilityTriggers,a.abilitySlots||a.abilityHrids),savedAt:n},r.members[t]=l,P.localStorage.setItem(Je,JSON.stringify(r)),Vl(e,n),!0}catch{let a=e.querySelector('[data-role="local-trial-draft-status"]');return a&&(a.textContent="本機暫存失敗"),!1}}function Fa(e,t){let i={};return Mi(Yl(e,t).filter(a=>Number(a.equippedCount)>0)).forEach(a=>{let n=String(a.slotHrid||"");!n||i[n]||(i[n]={slotHrid:n,itemKey:String(a.itemKey||""),itemHrid:String(a.itemHrid||a.hrid||""),enhancementLevel:Number(a.enhancementLevel)||0})}),i["/item_locations/two_hand"]&&(delete i["/item_locations/main_hand"],delete i["/item_locations/off_hand"]),{planId:"",planType:t,name:de(t),trialHrid:"",note:"",equipment:i,skillHrids:[],abilitySlots:t===g.BATTLE?Re(e.equippedAbilityHrids):[],abilityHrids:t===g.BATTLE?Pt(e.equippedAbilityHrids):[],abilityTriggers:{}}}function Kl(e){let t=document.createElement("section");t.className="mwi-plan-workspace";let i=document.createElement("div");i.className="mwi-draft-toolbar mwi-sidebar-plan-controls";let a=document.createElement("label"),n=document.createElement("span");n.className="mwi-draft-toolbar-label",n.textContent="編輯方案";let r=document.createElement("select");r.className="mwi-select",r.dataset.role="workbench-type";let l=document.createElement("optgroup");l.label="正式方案";for(let[v,T]of[[g.LIFE,"生活試煉方案"],[g.BATTLE,"戰鬥試煉方案"]]){let S=document.createElement("option");S.value=v,S.textContent=T,l.appendChild(S)}let s=document.createElement("optgroup");s.label="模擬專用方案",Ye.forEach(v=>{let T=document.createElement("option");T.value=Ei(v),T.textContent=Y(v),s.appendChild(T)}),r.append(l,s),a.append(n,r);let c=document.createElement("span");c.className="mwi-plan-local-status",c.textContent="正式方案與模擬專用方案分開儲存",i.append(a,c);let d=document.createElement("div");d.className="mwi-workbench-host",t.appendChild(d),t._mwiSidebarControls=i,t._mwiTypeDrafts=Object.create(null);let u=o.admin.preservedTypeDrafts;u&&u.characterId===o.admin.selectedCharacterId&&u.drafts&&Object.entries(u.drafts).forEach(([v,T])=>{t._mwiTypeDrafts[v]=T}),o.admin.preservedTypeDrafts=null;let f=()=>d.querySelector(".mwi-plan-card"),p=v=>e.plans.find(T=>T.planType===v)||null,_=v=>{let T=p(g.BATTLE)||Fa(e,g.BATTLE);return{...Rt(T),planId:"",planType:g.BATTLE,name:Y(v),_simulationSlot:v}},h=v=>{let T=$a(v);c.textContent=T?`${Y(T)}只供試煉模擬；修改後只自動暫存於這台電腦，不會上傳到試算表`:"正式方案只保留一套生活方案與一套戰鬥方案，不會被模擬方案覆蓋"},b=(v,T="")=>{let S=$a(T)||String(v&&v._simulationSlot||""),C=S?Ei(S):v&&v.planType===g.LIFE?g.LIFE:g.BATTLE,N=S?{...Rt(v),planId:"",planType:g.BATTLE,name:Y(S),_simulationSlot:S}:v,M=!!(!S&&v&&(v._workbenchDirty||N._workbenchDirty||za(N)||Ga(N))),R=String(N.planId||"");o.admin.selectedPlanId=S?"":R,r.value=C,h(C),d.replaceChildren();let L=ss(N,e,d,{workbench:!0,simulationSlot:S,planMode:C});if(L.dataset.dirty=M?"true":"false",S){let F=Li(o.admin.selectedCharacterId,S);Wl(o.admin.selectedCharacterId,S),(!F||N._workbenchDirty)&&mt(L)}};t._mwiRenderPlan=b,r.addEventListener("change",()=>{let v=f()?.dataset.planMode||g.BATTLE,T=r.value;if(T===v)return;let S=f();if(S){let N=Ka(S);N._workbenchDirty=S.dataset.dirty==="true",t._mwiTypeDrafts[v]=N,S.dataset.simulationSlot&&mt(S)}let C=$a(T),I=C?Li(o.admin.selectedCharacterId,C)||t._mwiTypeDrafts[T]||_(C):t._mwiTypeDrafts[T]||p(T)||Fa(e,T);b(I,T)});let y=e.plans.find(v=>String(v.planId||"")===o.admin.selectedPlanId),x=qa(o.admin.selectedCharacterId),E=x&&x.slots[x.activeSlot]?x.activeSlot:"";if(y)b(y,y.planType);else if(E)b(Li(o.admin.selectedCharacterId,E),Ei(E));else{let v=p(g.BATTLE)||Fa(e,g.BATTLE);b(v,g.BATTLE)}return t}function yr(){return{availableLife:ae(o.guildWeeklyTrials.life,"life"),availableBattle:ae(o.guildWeeklyTrials.battle,"battle")}}function Jl(e,t){let i=e===g.BATTLE?"battle":"life",a=String(t||"").trim().toLowerCase();return ae(o.guildWeeklyTrials[i],i).includes(a)}function Ii(e,t){let i=e===g.BATTLE?"戰鬥":"生活",a=e===g.BATTLE?o.guildWeeklyTrials.battle:o.guildWeeklyTrials.life;if(!Array.isArray(a)||!a.length)throw new Error(`尚未讀取本週${i}試煉，請先讓遊戲載入公會試煉資料。`);if(!Jl(e,t))throw new Error(`這套方案指定的${i}試煉不在本週清單內，請改選本週試煉。`)}function Ni(e){let t=e&&(e.equipment||e.equipmentSlots||e.selectedEquipment);return Array.isArray(t)?t.reduce((i,a)=>{let n=String(a&&(a.slotHrid||a.slot||a.itemLocationHrid)||"");return n&&(i[n]={...a,slotHrid:n,itemHrid:String(a.itemHrid||a.hrid||a.item?.itemHrid||a.item?.hrid||"")}),i},{}):!t||typeof t!="object"?{}:Object.entries(t).reduce((i,[a,n])=>(typeof n=="string"?i[a]={slotHrid:a,itemHrid:n,enhancementLevel:0}:n&&typeof n=="object"&&(i[a]={...n,slotHrid:String(n.slotHrid||n.slot||a),itemHrid:String(n.itemHrid||n.hrid||n.item?.itemHrid||n.item?.hrid||"")}),i),{})}function za(e){return Object.values(Ni(e)).some(t=>Tt.has(String(t&&(t.slotHrid||t.slot)||"")))}function Ga(e){let i=Ve(e&&(e.planType||e.type))===g.BATTLE?e&&e.abilityHrids:e&&e.skillHrids;return Array.isArray(i)&&i.length>me}function Yl(e,t){return e.equipment.filter(i=>{let a=String(i.slotHrid||i.itemLocationHrid||"");return!a||Tt.has(a)?!1:t===g.BATTLE?!co.has(a):!0})}function qt(e){if(!e)return"";let t=String(e.slotHrid||e.itemLocationHrid||""),i=String(e.itemKey||`${e.itemHrid||e.hrid||""}::${Number(e.enhancementLevel)||0}`);return`${t}::${i}`}function Lc(e,t){return Number.isFinite(Sr(e,t))}function Xl(e){return String(e||"").replace(/_refined$/,"")}function Sr(e,t){if(!e||!t)return Number.POSITIVE_INFINITY;let i=String(e.slotHrid||e.itemLocationHrid||""),a=String(t.slotHrid||t.itemLocationHrid||"");if(i&&a&&i!==a)return Number.POSITIVE_INFINITY;if(t.itemKey&&e.itemKey&&String(t.itemKey)===String(e.itemKey))return 0;let n=String(e.itemHrid||e.hrid||""),r=String(t.itemHrid||t.hrid||"");return!n||!r?Number.POSITIVE_INFINITY:n===r?1:!r.endsWith("_refined")&&n.endsWith("_refined")&&Xl(n)===r?2:Number.POSITIVE_INFINITY}function Ql(e,t){let i=e.map(s=>({entry:s,kind:Sr(s,t)})).filter(({kind:s})=>Number.isFinite(s));if(!i.length)return null;let a=Math.min(...i.map(({kind:s})=>s)),n=i.filter(({kind:s})=>s===a),r=Number(t?.enhancementLevel)||0,l=n.some(({entry:s})=>(Number(s.enhancementLevel)||0)>=r);return n.sort((s,c)=>{let d=Number(s.entry.enhancementLevel)||0,u=Number(c.entry.enhancementLevel)||0,f=l?d>=r?d-r:Number.MAX_SAFE_INTEGER:Math.abs(d-r),p=l?u>=r?u-r:Number.MAX_SAFE_INTEGER:Math.abs(u-r);return f-p||u-d||String(s.entry.itemKey||"").localeCompare(String(c.entry.itemKey||""))}),n[0]}function Mi(e){return[...e].sort((t,i)=>(Number(i.equippedCount)||0)-(Number(t.equippedCount)||0)||(Number(i.itemLevel||i.level)||0)-(Number(t.itemLevel||t.level)||0)||(Number(i.enhancementLevel)||0)-(Number(t.enhancementLevel)||0)||String(t.name||t.itemHrid).localeCompare(String(i.name||i.itemHrid),"zh-TW"))}function Zl(e){try{let t=JSON.parse(e.dataset.candidateSlotHrids||"[]");if(Array.isArray(t)&&t.length)return t.map(i=>String(i)).filter(Boolean)}catch{}return[String(e.dataset.slotHrid||"")].filter(Boolean)}function es(e,t){for(let i of t)if(e[i])return e[i];return null}function ts(e,t){return Mi(e.equipment.filter(i=>t.includes(String(i.slotHrid||i.itemLocationHrid||""))&&Number(i.equippedCount)>0))[0]||null}function is(e,t){return!0}function vr(e,t,i=!1){let a=document.createElement("option");a.value=i?`missing:${e.dataset.slotHrid}:${qt(t)}`:qt(t);let n=U(t.itemHrid||t.hrid,t.name||t.itemHrid||"未知裝備");return a.textContent=n,a.dataset.itemKey=String(t.itemKey||""),a.dataset.itemHrid=String(t.itemHrid||t.hrid||""),a.dataset.itemName=n,a.dataset.itemLevel=String(Number(t.itemLevel||t.level)||0),a.dataset.enhancementLevel=String(Number(t.enhancementLevel)||0),a.dataset.count=String(Number(t.count||t.quantity)||1),a.dataset.equippedCount=String(Number(t.equippedCount)||0),a.dataset.slotHrid=String(t.slotHrid||t.itemLocationHrid||e.dataset.slotHrid||""),a.dataset.missing=i?"true":"false",e.appendChild(a),a}function as(e){let t=e&&e._mwiSlotButton;if(!t)return;let i=e.dataset.planInclude==="false",a=e.selectedOptions&&e.selectedOptions[0],n=!!(a&&a.value),r=[...e.options].some(y=>y.value&&y.dataset.missing!=="true");if(t.replaceChildren(),t.classList.toggle("empty",!n),t.classList.toggle("missing",!!(n&&a.dataset.missing==="true")),t.disabled=!!(e.disabled||!n&&!r),!n){let y=document.createElement("span");y.textContent=i?"—":"+",y.style.cssText="display:block;font-size:30px;line-height:48px;color:#8fa8d8;";let x=document.createElement("span");x.className="mwi-slot-name",x.textContent=i?"目前未裝備":r?"點此選擇":"沒有可選裝備",t.append(y,x),t.title=i?"此格僅供參考，不會儲存進目前方案":r?`選擇${e.dataset.slotLabel||ii[e.dataset.slotHrid]||"裝備"}`:"這位會員沒有此槽位可選裝備";return}let l=String(a.dataset.itemHrid||""),s=String(a.dataset.itemName||l||"未知裝備"),c=Number(a.dataset.itemLevel)||0,d=Number(a.dataset.enhancementLevel)||0,u=Number(a.dataset.count)||1,f=Number(a.dataset.equippedCount)||0,p=e.dataset.autoRebound==="true";t.appendChild(Ht("item",l,s));let _=document.createElement("span");_.className="mwi-slot-level",_.textContent=`${d?`+${d} `:""}${c||""}`.trim();let h=document.createElement("span");h.className="mwi-slot-name",h.textContent=s;let b=document.createElement("span");b.className="mwi-slot-meta",b.textContent=a.dataset.missing==="true"?"目前已找不到":`${p?"已自動對應｜":""}${f?`身上 ${f}｜`:""}持有 ${u}`,t.append(_,h,b),t.title=`${s}${d?` +${d}`:""}`}function xr(e){e.querySelectorAll("select[data-slot-hrid]").forEach(as)}function ke(e){e&&(e.dataset.dirty="true",mt(e)&&(e.dataset.dirty="false"))}function ge(){!m||!m.choiceOverlay||(m.choiceOverlay.hidden=!0,m.choiceTitle.textContent="選擇",m.choiceList.classList.remove("mwi-trigger-editor"),m.choiceList.replaceChildren())}function Ar(e,t,i=!1){let a=document.createElement("button");a.type="button",a.className="mwi-choice-card",a.classList.toggle("selected",i);let n=String(e==="item"?t.itemHrid||t.hrid||"":e==="ability"?t.combatActionHrid||t.abilityHrid||t.hrid||"":t.skillHrid||t.hrid||""),r=U(e==="item"?t.itemHrid||t.hrid:e==="ability"?t.abilityHrid||t.hrid:t.skillHrid||t.hrid,t.name||t.itemHrid||t.abilityHrid||t.skillHrid||"未知");a.appendChild(Ht(e,n,r));let l=document.createElement("span");if(l.className="mwi-slot-level",e==="item"){let d=Number(t.enhancementLevel)||0,u=Number(t.itemLevel||t.level)||0;l.textContent=`${d?`+${d} `:""}${u||""}`.trim()}else l.textContent=`Lv.${Number(t.level)||0}`;let s=document.createElement("span");s.className="mwi-slot-name",s.textContent=r;let c=document.createElement("span");if(c.className="mwi-slot-meta",e==="item"){let d=Number(t.equippedCount)||0;c.textContent=`${d?`身上 ${d}｜`:""}持有 ${Number(t.count||t.quantity)||1}`}else c.textContent=i?"目前已選":"點選套用";return a.append(l,s,c),a}function ns(e,t,i){let a=String(t.dataset.slotHrid||""),n=Zl(t),r=Mi(i.filter(s=>n.includes(String(s.slotHrid||s.itemLocationHrid||""))));m.choiceTitle.textContent=`選擇${t.dataset.slotLabel||ii[a]||"裝備"}`,m.choiceList.replaceChildren();let l=document.createElement("button");if(l.type="button",l.className="mwi-choice-card remove",l.textContent=`移除
這個槽位`,l.style.whiteSpace="pre-line",l.addEventListener("click",()=>{t.value="",t.dataset.autoRebound="false",Ri(e,t.dataset.visualSlot||a),ke(e),ge()}),m.choiceList.appendChild(l),r.forEach(s=>{let c=Ar("item",s,t.value===qt(s));c.addEventListener("click",()=>{t.value=qt(s),t.dataset.autoRebound="false",Ri(e,t.dataset.visualSlot||a),ke(e),ge()}),m.choiceList.appendChild(c)}),!r.length){let s=document.createElement("div");s.className="mwi-choice-empty",s.textContent="這位會員目前沒有此槽位可選裝備；仍可按「移除」清空舊草稿。",m.choiceList.appendChild(s)}m.choiceOverlay.hidden=!1}function kr({card:e,grid:t,detail:i,visualSlot:a,labelText:n,slotHrids:r,availableEquipment:l,selectedEquipment:s,planInclude:c=!0}){let d=document.createElement("div");d.className="mwi-slot-field",d.dataset.visualSlot=a;let u=document.createElement("label");u.textContent=n;let f=document.createElement("select");f.className="mwi-slot-select-source",f.dataset.slotHrid=String(r[0]||""),f.dataset.candidateSlotHrids=JSON.stringify(r),f.dataset.visualSlot=a,f.dataset.slotLabel=n,f.dataset.planInclude=c?"true":"false";let p=document.createElement("option");p.value="",p.textContent=c?"未指定":"此方案不使用",f.appendChild(p);let _=l.filter(y=>r.includes(String(y.slotHrid||y.itemLocationHrid||"")));_.forEach(y=>vr(f,y));let h=c?es(s,r):ts(i,r);if(h){let y=Ql(_,h);if(y)f.value=qt(y.entry),f.dataset.autoRebound=y.kind>0?"true":"false";else{let x={...h,slotHrid:String(h.slotHrid||r[0]||""),itemHrid:String(h.itemHrid||h.hrid||""),name:String(h.name||h.itemHrid||h.hrid||"舊草稿裝備")},E=vr(f,x,!0);f.value=E.value}}f.disabled=!c,c&&f.addEventListener("change",()=>{f.dataset.autoRebound="false",Ri(e,a),ke(e)});let b=document.createElement("button");return b.type="button",b.className="mwi-equipment-slot",b.classList.toggle("reference",!c),f._mwiSlotButton=b,c&&b.addEventListener("click",()=>ns(e,f,l)),d.append(u,f,b),t.appendChild(d),f}function ut(e,t){let i=t===g.BATTLE?"abilityHrid":"skillHrid";return[...e.querySelectorAll(`[data-${i.replace(/[A-Z]/g,a=>`-${a.toLowerCase()}`)}]:checked`)].map(a=>String(a.dataset[i]||"")).filter(Boolean)}function Bi(e,t,i){let a=e.querySelector('[data-role="plan-skill-state"]');if(!a)return;let n=t===g.BATTLE?"abilityHrid":"skillHrid",r=new Set;a.replaceChildren(),i.forEach(l=>{let s=String(l||"");if(!s||r.has(s))return;r.add(s);let c=document.createElement("input");c.type="checkbox",c.checked=!0,c.dataset[n]=s,a.appendChild(c)})}function Pe(e,t){return String(t===g.BATTLE?e.abilityHrid||e.hrid||"":e.skillHrid||e.hrid||"")}function Hi(e,t,i=[]){let a=new Map;return[...ft(e),...t].forEach(n=>{let r=String(n&&n.hrid||"").trim();r&&a.set(r,{...n,hrid:r})}),i.forEach(n=>{let r=String(n||"").trim();!r||a.has(r)||a.set(r,{hrid:r,name:r.split("/").pop().replaceAll("_"," "),isSingleTarget:!0,isMultiTarget:!0,allowedComparatorHrids:Qi.map(l=>l.hrid),sortIndex:999})}),[...a.values()].sort((n,r)=>(Number(n.sortIndex)||999)-(Number(r.sortIndex)||999)||String(n.name||n.hrid).localeCompare(String(r.name||r.hrid)))}function Ua(){return Hi(o.combatTriggerDependencyDetailMap,fo)}function ja(e,t=[]){let i=t.map(l=>l.conditionHrid);ft(o.abilityDetailMap).forEach(l=>{(Array.isArray(l&&l.defaultCombatTriggers)?l.defaultCombatTriggers:[]).forEach(s=>i.push(s.conditionHrid))});let a=Ua().find(l=>l.hrid===e),n=!!(a&&a.isSingleTarget),r=!!(a&&a.isMultiTarget);return Hi(o.combatTriggerConditionDetailMap,xn,i).filter(l=>!n&&!r||n&&l.isSingleTarget!==!1||r&&l.isMultiTarget!==!1)}function Ft(e){let t=Hi(o.combatTriggerConditionDetailMap,xn,[e]).find(a=>a.hrid===e),i=new Set(Array.isArray(t&&t.allowedComparatorHrids)?t.allowedComparatorHrids:Qi.map(a=>a.hrid));return Hi(o.combatTriggerComparatorDetailMap,Qi).filter(a=>i.has(a.hrid))}function rs(e){let t=go[e.hrid];if(t)return t;let i="/combat_trigger_conditions/";if(e.hrid.startsWith(i)){let a=e.hrid.slice(i.length),n=ia[`/abilities/${a}`]||ia[`/items/${a}`];if(n)return String(n)}return U(e.hrid,e.name||e.hrid.split("/").pop().replaceAll("_"," "))}function Wa(e,t,i){return e.replaceChildren(),t.forEach(a=>{let n=document.createElement("option");n.value=a.hrid,n.textContent=rs(a),e.appendChild(n)}),e.value=t.some(a=>a.hrid===i)?i:String(t[0]&&t[0].hrid||""),e.value}function os(e=[]){let t=Ua(),i=String(t[0]&&t[0].hrid||""),a=ja(i,e),n=String(a[0]&&a[0].hrid||""),r=Ft(n);return{dependencyHrid:i,conditionHrid:n,comparatorHrid:String(r[0]&&r[0].hrid||""),value:1}}function ls(e,t,i){if(!m||!m.choiceOverlay||!i)return;e._mwiAbilityTriggers||(e._mwiAbilityTriggers={});let a=Object.prototype.hasOwnProperty.call(e._mwiAbilityTriggers,i),n=$t(a?e._mwiAbilityTriggers[i]:hr(i)),r=t.abilities.find(h=>Pe(h,g.BATTLE)===i);m.choiceTitle.textContent=`${U(i,r&&r.name||i.split("/").pop())}－施放條件`,m.choiceList.classList.add("mwi-trigger-editor"),m.choiceList.replaceChildren();let l=document.createElement("div");l.className="mwi-trigger-help",l.textContent="全部條件都成立時才會施放；沒有條件時，魔力足夠且冷卻完成就會依技能順序施放。";let s=document.createElement("div");s.className="mwi-trigger-toolbar";let c=document.createElement("div");c.className="mwi-trigger-rows";let d=()=>{if(c.replaceChildren(),!n.length){let h=document.createElement("div");h.className="mwi-trigger-empty",h.textContent="目前沒有施放條件。",c.appendChild(h);return}n.forEach((h,b)=>{let y=document.createElement("div");y.className="mwi-trigger-row";let x=document.createElement("select"),E=document.createElement("select"),v=document.createElement("select"),T=document.createElement("input"),S=document.createElement("button");h.dependencyHrid=Wa(x,Ua(),h.dependencyHrid),h.conditionHrid=Wa(E,ja(h.dependencyHrid,n),h.conditionHrid),h.comparatorHrid=Wa(v,Ft(h.conditionHrid),h.comparatorHrid);let C=Ft(h.conditionHrid).find(I=>I.hrid===h.comparatorHrid);T.type="number",T.className="mwi-trigger-value",T.value=String(Number(h.value)||0),T.disabled=C&&C.allowValue===!1,T.title="條件數值",S.type="button",S.className="mwi-trigger-remove",S.textContent="×",S.title="移除這個條件",x.addEventListener("change",()=>{h.dependencyHrid=x.value;let I=ja(h.dependencyHrid,n);h.conditionHrid=String(I[0]&&I[0].hrid||"");let N=Ft(h.conditionHrid);h.comparatorHrid=String(N[0]&&N[0].hrid||""),d()}),E.addEventListener("change",()=>{h.conditionHrid=E.value;let I=Ft(h.conditionHrid);h.comparatorHrid=String(I[0]&&I[0].hrid||""),d()}),v.addEventListener("change",()=>{h.comparatorHrid=v.value,d()}),T.addEventListener("input",()=>{h.value=Number(T.value)||0}),S.addEventListener("click",()=>{n.splice(b,1),d()}),y.append(x,E,v,T,S),c.appendChild(y)})},u=document.createElement("button");u.type="button",u.className="mwi-button secondary",u.textContent="新增條件",u.addEventListener("click",()=>{n.push(os(n)),d()});let f=document.createElement("button");f.type="button",f.className="mwi-button secondary",f.textContent="清空條件",f.addEventListener("click",()=>{n=[],d()});let p=document.createElement("button");p.type="button",p.className="mwi-button secondary",p.textContent="恢復遊戲預設",p.addEventListener("click",()=>{delete e._mwiAbilityTriggers[i],ke(e),zt(e,t,g.BATTLE),ge()});let _=document.createElement("button");_.type="button",_.className="mwi-button primary",_.textContent="套用條件",_.addEventListener("click",()=>{e._mwiAbilityTriggers[i]=$t(n),ke(e),zt(e,t,g.BATTLE),ge()}),s.append(u,f,p,_),m.choiceList.append(l,s,c),d(),m.choiceOverlay.hidden=!1}function zt(e,t,i){let a=e.querySelector('[data-role="plan-skill-grid"]');if(!a)return;let n=i===g.BATTLE?"ability":"skill",r=i===g.BATTLE?t.abilities:t.skills,l=new Map(r.map(u=>[Pe(u,i),u])),s=i===g.BATTLE?Pt(ut(e,i)):ut(e,i),c=i===g.BATTLE?Re(s):s;if(Bi(e,i,i===g.BATTLE?c.filter(Boolean):c),a.replaceChildren(),c.forEach((u,f)=>{if(!u){let v=document.createElement("button");v.type="button",v.className="mwi-add-skill",v.textContent="+",v.title=i===g.BATTLE?`選擇第 ${f+1} 格戰鬥技能`:"新增生活技能",v.disabled=!r.length,v.addEventListener("click",()=>Va(e,t,i,f)),a.appendChild(v);return}let p=l.get(u)||{[i===g.BATTLE?"abilityHrid":"skillHrid"]:u,name:U(u),level:0},_=U(u,p.name),h=document.createElement("div");h.className="mwi-skill-slot-wrap";let b=document.createElement("button");b.type="button",b.className="mwi-selected-skill";let y=n==="ability"?String(p.combatActionHrid||u):u;b.appendChild(Ht(n,y,_));let x=document.createElement("span");x.className="mwi-slot-level",x.textContent=`Lv.${Number(p.level)||0}`;let E=document.createElement("span");if(E.className="mwi-slot-name",E.textContent=_,b.append(x,E),b.title="點此更換或移除",b.addEventListener("click",()=>Va(e,t,i,f)),h.appendChild(b),i===g.BATTLE){let v=document.createElement("button"),T=!!(e._mwiAbilityTriggers&&Object.prototype.hasOwnProperty.call(e._mwiAbilityTriggers,u)),S=T?$t(e._mwiAbilityTriggers[u]).length:hr(u).length;v.type="button",v.className=`mwi-skill-trigger-button${T?" custom":""}`,v.textContent=T?`自訂條件 ${S}`:`預設條件 ${S}`,v.title="設定這個技能的施放條件",v.addEventListener("click",()=>ls(e,t,u)),h.appendChild(v)}a.appendChild(h)}),i===g.BATTLE)return;let d=document.createElement("button");d.type="button",d.className="mwi-add-skill",d.textContent="+",d.title=i===g.BATTLE?"新增戰鬥技能":"新增生活技能",d.disabled=!r.length,d.hidden=s.length>=me,d.addEventListener("click",()=>Va(e,t,i,s.length)),a.appendChild(d)}function Va(e,t,i,a=0){let n=i===g.BATTLE?"ability":"skill",r=i===g.BATTLE?t.abilities:t.skills,l=i===g.BATTLE?Re(ut(e,i)):ut(e,i),s=Math.min(Math.max(Number(a)||0,0),me-1),c=String(l[s]||""),d=new Set(l.filter(Boolean)),u=i===g.BATTLE&&s===po,f=[...r].filter(p=>{let _=Pe(p,i);return _?i!==g.BATTLE?!0:u?it.has(_):!it.has(_):!1});if(u){let p=new Map(vn.map((_,h)=>[_,h]));f.sort((_,h)=>p.get(Pe(_,i))-p.get(Pe(h,i)))}else f.sort((p,_)=>(d.has(Pe(_,i))?1:0)-(d.has(Pe(p,i))?1:0)||(Number(_.level)||0)-(Number(p.level)||0)||String(p.name||"").localeCompare(String(_.name||""),"zh-TW"));if(m.choiceTitle.textContent=u?"選擇第一格光環／特殊技能":`${c?"更換或移除":"選擇"}${i===g.BATTLE?`第 ${s+1} 格戰鬥技能`:"生活技能"}`,m.choiceList.replaceChildren(),c){let p=document.createElement("button");p.type="button",p.className="mwi-choice-card remove",p.textContent=`移除
這個技能`,p.style.whiteSpace="pre-line",p.addEventListener("click",()=>{i===g.BATTLE&&e._mwiAbilityTriggers&&delete e._mwiAbilityTriggers[c],l[s]="",Bi(e,i,l.filter(Boolean)),u&&!e.dataset.simulationSlot&&xi(o.admin.selectedCharacterId,""),ke(e),zt(e,t,i),ge()}),m.choiceList.appendChild(p)}if(f.forEach(p=>{let _=Pe(p,i);if(!_)return;let h=Ar(n,p,d.has(_));h.addEventListener("click",()=>{let b=[...l];i===g.BATTLE&&c&&c!==_&&e._mwiAbilityTriggers&&delete e._mwiAbilityTriggers[c];let y=b.indexOf(_);y>=0&&y!==s&&(b[y]=""),b[s]=_,Bi(e,i,b.filter(Boolean)),u&&!e.dataset.simulationSlot&&xi(o.admin.selectedCharacterId,_),ke(e),zt(e,t,i),ge()}),m.choiceList.appendChild(h)}),!f.length){let p=document.createElement("div");p.className="mwi-choice-empty",p.textContent=u?"這位會員目前沒有可選的光環／特殊技能資料。":"這位會員目前沒有可選技能資料。",m.choiceList.appendChild(p)}m.choiceOverlay.hidden=!1}function ss(e,t,i=m.adminMemberDetail,a={}){let n=e.planType===g.BATTLE||e.type===g.BATTLE?g.BATTLE:g.LIFE,r=a.simulationSlot?Ae(a.simulationSlot):"",l=!!r,s=String(e.planId||e.id||""),c=document.createElement("section");c.className=`mwi-plan-card ${n}`,c.classList.toggle("workbench",!!a.workbench),c.classList.toggle("simulation-plan",l),c.dataset.planId=s,c.dataset.planType=n,c.dataset.planMode=String(a.planMode||(l?Ei(r):n)),c.dataset.simulationSlot=r,c.dataset.dirty="false",c.dataset.pendingPlanId=String(e._pendingPlanId||""),c._mwiAbilityTriggers=n===g.BATTLE?Ot(e.abilityTriggers||e.triggerMap,e.abilitySlots||e.abilityHrids||e.skillSlots):{};let d=s&&(n===g.LIFE&&s===t.publishedLifePlanId||n===g.BATTLE&&s===t.publishedBattlePlanId);c.classList.toggle("published",!!d);let u=document.createElement("div");u.className="mwi-plan-head";let f=document.createElement("span");f.className=`mwi-plan-type ${n}`,f.textContent=l?`模擬專用｜${Y(r)}`:`${n===g.BATTLE?"戰鬥方案":"生活方案"}${d?"｜已發布":""}`;let p=document.createElement("input");p.type="hidden",p.dataset.field="name",p.value=l?Y(r):de(n),u.append(f,p),c.appendChild(u);let _=document.createElement("input");_.className="mwi-admin-input",_.dataset.field="note",_.placeholder=l?`${Y(r)}備註（不會發布給會員）`:"給會員看的簡短備註",_.value=String(e.note||""),_.style.cssText="width:100%;margin-top:5px;",c.appendChild(_),[p,_].forEach(L=>{L.addEventListener("input",()=>ke(c)),L.addEventListener("change",()=>ke(c))});let h=document.createElement("div");h.className="mwi-plan-section-title",h.textContent="裝備（依遊戲位置排列；點選可更換）",c.appendChild(h);let b=Mi(t.equipment.filter(L=>{let F=String(L.slotHrid||L.itemLocationHrid||"");return F&&!Tt.has(F)})),y=Ni(e),x=document.createElement("div");x.className="mwi-game-equipment-grid",mo.forEach(L=>{kr({card:c,grid:x,detail:t,visualSlot:L.visualSlot,labelText:L.label,slotHrids:L.slotHrids,availableEquipment:b,selectedEquipment:y,planInclude:is(n,L.visualSlot)})}),c.appendChild(x);let E=document.createElement("div");E.className="mwi-plan-section-title",E.textContent=n===g.BATTLE?"指定戰鬥技能（第一格為光環／特殊技能；點擊可更換）":"指定生活技能（點已選技能可更換）",c.appendChild(E);let v=document.createElement("div");v.className="mwi-plan-skill-state",v.dataset.role="plan-skill-state",c.appendChild(v),Bi(c,n,n===g.BATTLE?Pt(e.abilitySlots||e.abilityHrids||e.skillSlots):Ha(e.skillHrids||e.skillSlots||e.selectedSkills,"skills").slice(0,me));let T=document.createElement("div");T.className="mwi-skill-slot-grid",T.dataset.role="plan-skill-grid";let S=document.createElement("div");S.className="mwi-skill-slot-scroll",S.appendChild(T),c.appendChild(S),zt(c,t,n);let C=document.createElement("div");C.className="mwi-plan-section-title",C.textContent=n===g.LIFE?"生活工具（依遊戲順序排列）":"生活工具（參考；戰鬥方案不會儲存）",c.appendChild(C);let I=document.createElement("div");I.className="mwi-tool-slot-scroll";let N=document.createElement("div");N.className="mwi-tool-slot-grid",Sn.forEach(L=>{kr({card:c,grid:N,detail:t,visualSlot:L.split("/").pop(),labelText:ii[L]||"工具",slotHrids:[L],availableEquipment:b,selectedEquipment:y,planInclude:n===g.LIFE})}),I.appendChild(N),c.appendChild(I);let M=document.createElement("button");M.type="button",M.className="mwi-button primary",M.textContent=l?`儲存${Y(r)}`:s?`更新${de(n)}`:`儲存${de(n)}`,M.addEventListener("click",()=>{if(!l){cs(c);return}mt(c)&&(c.dataset.dirty="false",k(`${Y(r)}已儲存；開啟試煉模擬時會使用這一槽。`))});let R=document.createElement("div");if(R.className="mwi-plan-actions",R.appendChild(M),a.workbench){let L=document.createElement("button");L.type="button",L.className="mwi-button secondary",L.textContent="下一位成員",L.disabled=!ur(),L.addEventListener("click",Fl),R.appendChild(L)}if(a.workbench&&l){let L=document.createElement("span");L.dataset.role="local-trial-draft-status",L.className="mwi-plan-local-status",L.textContent=e._localTrialDraft?`${Y(r)}已載入；目前為模擬器選用槽`:`尚未儲存；修改後會自動建立${Y(r)}`,R.appendChild(L)}return c.appendChild(R),i.appendChild(c),Ri(c,""),c.dataset.dirty="false",c}function Ri(e,t){let i=e.querySelector('select[data-visual-slot="weapon"]'),a=e.querySelector('select[data-visual-slot="offhand"]');if(!i){xr(e);return}let n=i.selectedOptions&&i.selectedOptions[0],r=i.value&&n?String(n.dataset.slotHrid||""):"";(!t||t==="weapon")&&r==="/item_locations/two_hand"?a&&(a.value=""):t==="offhand"&&a&&a.value&&r==="/item_locations/two_hand"&&(i.value="");let l=i.selectedOptions&&i.selectedOptions[0],s=!!(i.value&&l&&l.dataset.slotHrid==="/item_locations/two_hand");a&&(a.disabled=a.dataset.planInclude!=="true"||s),xr(e)}function Ka(e){let t={};e.querySelectorAll("select[data-slot-hrid]").forEach(n=>{if(n.dataset.planInclude==="false"||!n.value)return;let r=n.selectedOptions&&n.selectedOptions[0];if(!r||!r.dataset.itemHrid)return;let l=String(r.dataset.slotHrid||n.dataset.slotHrid||"");!l||Tt.has(l)||(t[l]={slotHrid:l,itemKey:String(r.dataset.itemKey||""),itemHrid:String(r.dataset.itemHrid||""),enhancementLevel:Number(r.dataset.enhancementLevel)||0})});let i=o.admin.members.find(n=>A(n)===String(o.admin.selectedCharacterId||"")),a={planId:String(e.dataset.planId||""),_pendingPlanId:String(e.dataset.pendingPlanId||""),planType:e.dataset.planType,name:String(e.querySelector('[data-field="name"]').value||"").trim(),trialHrid:ue(i,e.dataset.planType),note:String(e.querySelector('[data-field="note"]').value||"").trim(),equipment:t};return e.dataset.planType===g.BATTLE?(a.abilitySlots=Re(ut(e,g.BATTLE)),a.abilityHrids=a.abilitySlots.filter(Boolean),a.abilityTriggers=Ot(e._mwiAbilityTriggers,a.abilitySlots)):a.skillHrids=ut(e,g.LIFE),a}async function cs(e){if(!e||e.dataset.saving==="true")return;let t=Ka(e),a=Da(o.admin.memberDetail).plans.find(d=>d.planType===t.planType);t.name=de(t.planType),!t.planId&&a&&(t.planId=String(a.planId||a.id||"")),t.planId||(t.planId=t._pendingPlanId||nn(),e.dataset.pendingPlanId=t.planId),delete t._pendingPlanId;let n=e.closest(".mwi-plan-workspace"),r=n?[...n.querySelectorAll("button, input, select, textarea"),...n._mwiSidebarControls?n._mwiSidebarControls.querySelectorAll("button, input, select, textarea"):[]]:[],l=r.map(d=>d.disabled),s=e.querySelector(".mwi-plan-actions .mwi-button.primary"),c=s?s.textContent:"";e.dataset.saving="true",n&&(n.dataset.saving="true"),r.forEach(d=>{d.disabled=!0}),s&&(s.textContent="正在儲存…");try{k(`正在儲存${de(t.planType)}…`);let d=await q({action:"adminSavePlan",adminToken:Q(),characterId:o.admin.selectedCharacterId,plan:t}),u=String(d&&d.plan&&d.plan.planId||t.planId||"");o.admin.selectedPlanId=u,e.dataset.planId=u,e.dataset.pendingPlanId="",e.dataset.dirty="false",n&&n._mwiTypeDrafts&&delete n._mwiTypeDrafts[t.planType];let f={};n&&n._mwiTypeDrafts&&Object.entries(n._mwiTypeDrafts).forEach(([p,_])=>{p!==t.planType&&_&&_._workbenchDirty&&(f[p]=_)}),o.admin.preservedTypeDrafts=Object.keys(f).length?{characterId:o.admin.selectedCharacterId,drafts:f}:null,In(o.admin.selectedCharacterId,d&&d.plan||t,d&&d.savedAt||""),await ce(),await We(o.admin.selectedCharacterId),k(`已更新${de(t.planType)}並儲存到雲端；其他方案均保留。`)}catch(d){k(d&&d.message?d.message:"無法儲存方案。",!0)}finally{e.isConnected&&(e.dataset.saving="false",n&&(n.dataset.saving="false"),r.forEach((d,u)=>{d.disabled=l[u]}),s&&(s.textContent=c))}}async function Ic(e,t,i,a=null,n=null){let r=(s,c=!1)=>{k(s,c),typeof a=="function"&&a(s,c)};if(Gt()){r("目前方案尚未儲存，請先儲存後再發布。",!0);return}if(!t&&!i){r("請先選擇至少一套生活或戰鬥方案。",!0);return}if(o.admin.directPublishing||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing)return;let l=!1;try{let s=yr(),c=o.admin.memberDetail&&String(o.admin.selectedCharacterId)===String(e)?o.admin.memberDetail.plans||[]:[];for(let[u,f]of[[t,g.LIFE],[i,g.BATTLE]]){if(!u)continue;let p=c.find(_=>String(_.planId||_.id||"")===String(u));p?Ii(f,p.trialHrid):(f===g.LIFE?s.availableLife.length:s.availableBattle.length)||Ii(f,"")}r("正在發布指定方案…"),o.admin.directPublishing=!0,l=!0,Z(),Di(n,!0,"正在發布…");let d=await q({action:"adminPublish",adminToken:Q(),characterId:e,lifePlanId:t,battlePlanId:i,currentWeeklyTrials:s});Nn(e,t,i,d||{}),await ce(),await We(e),String(e)===String(o.character&&o.character.id||"")&&await Ke(),r("已發布本次生活／戰鬥指定方案。")}catch(s){r(s&&s.message?s.message:"發布失敗。",!0)}finally{l&&(o.admin.directPublishing=!1,Z(),Di(n,!1,"發布指定方案"))}}function Di(e,t,i){!e||typeof e!="object"||(["publish","unpublish","life","battle"].forEach(a=>{let n=e[a];n&&n.isConnected&&(n.disabled=!!t)}),e.publish&&e.publish.isConnected&&(e.publish.textContent=i||"發布指定方案"))}function ds(e,t,i=""){let a=t===g.LIFE?e.publishedLifePlanId:e.publishedBattlePlanId,n=e.plans.filter(d=>String(d.planType||d.type)===t),l=n.find(d=>String(d.planId||d.id||"")===String(a||""))||n[0]||null;if(t===g.BATTLE){let d=Li(i);if(!d)return{plan:null,planId:"",ambiguous:!1,reason:"missingSimulationPlan"};if(za(d)||Ga(d))return{plan:null,planId:"",ambiguous:!1,reason:"invalidSimulationPlan"};let u=String(l&&(l.planId||l.id)||"");return{plan:{...d,planId:u,planType:g.BATTLE,type:g.BATTLE,name:de(g.BATTLE)},planId:u,ambiguous:!1,simulationSlot:String(d._simulationSlot||"")}}let s=n.filter(d=>!za(d)&&!Ga(d)),c=s.find(d=>String(d.planId||d.id||"")===String(a||""));return c?{plan:c,planId:String(c.planId||c.id||""),ambiguous:!1}:s.length?{plan:s[0],planId:String(s[0].planId||s[0].id||""),ambiguous:!1}:{plan:null,planId:"",ambiguous:!1,availableCount:0}}async function ms(e,t,i,a){return ra.saveForPublication(e,t,i,a)}async function us(){if(o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing||o.admin.directPublishing)return;if(Gt()){k("目前開啟的會員方案尚未儲存，請先儲存後再批次發布。",!0);return}let e=o.admin.members.filter(te),t=e.map(A).filter(Boolean),i=new Set([...o.admin.selectedMemberIds].map(String).filter(h=>t.includes(h))),a=t.filter(h=>i.has(h)),n=e.filter(h=>!i.has(A(h))),r=e.filter(h=>i.has(A(h))&&!ue(h,g.LIFE)&&!ue(h,g.BATTLE)),l=a.filter(h=>!r.some(b=>A(b)===h)),s=r,c=s.map(A).filter(Boolean);if(!kt(`確定套用這次勾選名單？

已勾選且有選試煉 ${l.length} 人：發布試煉與方案並通知。
生活只通知要選哪個試煉，不需要生活裝備或技能方案。戰鬥技能與條件使用每位會員目前啟用的模擬方案；裝備推薦一律略過。
已勾選但兩項都未選 ${r.length} 人：清除舊發布。
未勾選 ${n.length} 人：不做任何變更。`))return;o.admin.batchPublishing=!0,H();let d=[],u=[],f=[],p=[],_="";try{for(let S=0;S<l.length;S+=1){let C=l[S],I=o.admin.members.find(M=>A(M)===C),N=B(I||{})||"未知會員";k(`正在發布 ${S+1}／${l.length}：${N}…`);try{let M=ue(I,g.LIFE),R=ue(I,g.BATTLE);M&&Ii(g.LIFE,M),R&&Ii(g.BATTLE,R);let L=null;if(R){let zi=X(C);if(!zi)throw new Error("本機沒有完整資料，請先按「重新整理全部資料」");L=Da(zi)}let F=R?ds(L,g.BATTLE,C):{plan:null,planId:"",ambiguous:!1};if(F.ambiguous)throw new Error("戰鬥有多套雲端方案，請先刪除不使用的方案或保留目前已發布方案");if(R&&!F.plan)throw new Error(F.reason==="invalidSimulationPlan"?"目前啟用的模擬方案不符合發布規則，請先修正並儲存":"已選戰鬥試煉，但尚未儲存目前啟用的模擬方案");let he=M?await ra.saveLifeTrialSelection(C,M):null,Ee=F.plan?await ms(C,F.plan,g.BATTLE,R):null,w=String(he&&(he.planId||he.id)||""),z=String(Ee&&(Ee.planId||Ee.id)||"");await ra.replace(C,w,z,yr()),d.push({characterId:C,memberName:N})}catch(M){u.push({characterId:C,memberName:N,reason:M&&M.message?M.message:"發布失敗"})}}if(c.length){k(`正在清除 ${c.length} 位已勾選但未指定試煉會員的舊發布與通知…`);try{let S=await q({action:"adminBatchUnpublish",adminToken:Q(),characterIds:c}),C=new Set(Array.isArray(S?.clearedCharacterIds)?S.clearedCharacterIds.map(String):[]);s.forEach(I=>{let N=A(I);la(N),C.has(N)&&f.push({characterId:N,memberName:B(I)||"未知會員"})})}catch(S){p.push({affectedCount:c.length,memberName:`未指定的 ${c.length} 位會員`,reason:S&&S.message?S.message:"整批清除舊發布失敗"})}}if(d.length){k(`正在發送試煉選擇通知給 ${d.length} 位已勾選會員…`);try{await q({action:"adminPublishTrialSelectionNotice",adminToken:Q(),characterIds:d.map(S=>S.characterId)})}catch(S){_=S&&S.message?S.message:"試煉選擇通知發布失敗"}}(d.length||f.length)&&await ce();let h=String(o.character&&o.character.id||""),b=[...d,...f];b.some(S=>S.characterId===h)&&await Ke();let x=new Set(b.map(S=>S.characterId));o.admin.selectedCharacterId&&x.has(o.admin.selectedCharacterId)&&await We(o.admin.selectedCharacterId);let E=u.length+p.reduce((S,C)=>S+Math.max(1,Number(C.affectedCount)||1),0),v=d.length?_?"通知發送失敗":`通知已發送給 ${d.length} 人`:"沒有可通知會員",T=`勾選名單套用完成：已發布 ${d.length} 人，已清除 ${f.length} 人，失敗 ${E} 人；${v}。`;if(k(T,!!(E||_)),E||_){let S=[...u.map(C=>`${C.memberName}（發布）：${C.reason}`),...p.map(C=>`${C.memberName}（清除）：${C.reason}`),_?`通知：${_}`:""].filter(Boolean);tt(`${T}

${S.join(`
`)}`)}}finally{o.admin.batchPublishing=!1,H()}}async function Nc(e,t=null){if(Gt()){k("目前方案尚未儲存，請先儲存或放棄修改後再取消發布。",!0);return}if(!(o.admin.directPublishing||o.admin.batchPublishing||o.admin.noticePublishing||o.admin.trialSelectionNoticePublishing)&&kt("確定取消這位會員目前的生活與戰鬥指定方案？")){o.admin.directPublishing=!0,Z(),Di(t,!0,"正在處理…");try{k("正在取消發布…"),await q({action:"adminUnpublish",adminToken:Q(),characterId:e}),la(e),await ce(),await We(e),k("已取消發布。")}catch(i){k(i&&i.message?i.message:"取消發布失敗。",!0)}finally{o.admin.directPublishing=!1,Z(),Di(t,!1,"發布指定方案")}}}function Gt(){return!1}function Ja(){let e=m&&m.adminMemberDetail?m.adminMemberDetail.querySelector(".mwi-plan-workspace"):null;return e&&e.dataset.saving==="true"?(k("方案正在儲存，請稍候完成後再關閉。",!0),!1):!Gt()||kt("目前有尚未儲存的方案修改，確定要放棄嗎？")}function Tr(e=!1){if(m)return e!==!0&&!Ja()?!1:(ge(),m.adminMemberOverlay&&(m.adminMemberOverlay.hidden=!0),m.adminMemberTitle&&(m.adminMemberTitle.textContent="會員方案管理"),m.adminMemberDetail&&(m.adminMemberDetail.textContent="瀏覽器端不提供會員方案編輯。"),o.admin.selectedCharacterId="",o.admin.selectedPlanId="",o.admin.preservedTypeDrafts=null,o.admin.memberDetail=null,H(),!0)}function Cr(e){if(e==null||e==="")return!1;let t=Number(e);return!Number.isInteger(t)||t<=0||t>=168||o.guildTrialScheduleHourOffset===t?!1:(o.guildTrialScheduleHourOffset=t,o.lastReportedTrialSignature="",window.setTimeout(ht,400),!0)}function ps(e=Date.now()){let t=Number(o.guildTrialScheduleHourOffset);if(!Number.isInteger(t)||t<=0||t>=168)return"";let i=new Date(e),a=Date.UTC(i.getUTCFullYear(),i.getUTCMonth(),i.getUTCDate()),n=(i.getUTCDay()-5+7)%7,l=a-n*24*60*60*1e3+t*60*60*1e3,s=fs(),d=Er(s.skilling)&&Er(s.combat)||l>e?l:l+10080*60*1e3;return new Date(d).toISOString()}function fs(){let e=o.guild&&o.guild.currentTrialsData;if(typeof e=="string")try{e=JSON.parse(e)}catch{e={}}return e=e&&typeof e=="object"?e:{},{skilling:e.skilling||{},combat:e.combat||{}}}function Er(e){let t=String(e&&e.status||"").toLowerCase();return!t||t==="scheduled"}function Ya(e=!1){return e!==!0&&!Ja()?!1:(ge(),m.adminMemberOverlay&&(m.adminMemberOverlay.hidden=!0),o.admin.selectedCharacterId="",o.admin.selectedPlanId="",o.admin.preservedTypeDrafts=null,o.admin.memberDetail=null,H(),m.modal.hidden=!0,!0)}function gs(e){if(e.pointerType==="mouse"&&e.button!==0)return;let t=m.openButton.getBoundingClientRect();ie={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,left:t.left,top:t.top,moved:!1},m.openButton.setPointerCapture?.(e.pointerId)}function hs(e){if(!ie||e.pointerId!==ie.pointerId)return;let t=e.clientX-ie.startX,i=e.clientY-ie.startY;!ie.moved&&Math.hypot(t,i)<4||(e.preventDefault(),ie.moved=!0,m.openButton.classList.add("dragging"),Ut(ie.left+t,ie.top+i))}function Lr(e){if(!ie||e.pointerId!==ie.pointerId)return;let t=ie.moved;if(ie=null,m.openButton.classList.remove("dragging"),t){let i=m.openButton.getBoundingClientRect();GM_setValue(Gi,{left:i.left,top:i.top}),oa=!0,window.setTimeout(()=>{oa=!1},0)}}function Ut(e,t){let i=m.openButton.getBoundingClientRect(),a=Math.max(8,window.innerWidth-i.width-8),n=Math.max(8,window.innerHeight-i.height-8);m.openButton.style.left=`${Math.round(Math.min(Math.max(8,e),a))}px`,m.openButton.style.top=`${Math.round(Math.min(Math.max(8,t),n))}px`,m.openButton.style.right="auto",m.openButton.style.bottom="auto"}function Xa(){if(!m||!m.openButton)return;let e=m.openButton,t=GM_getValue(Gi,null);if(t&&Number.isFinite(Number(t.left))&&Number.isFinite(Number(t.top))){Ut(Number(t.left),Number(t.top));return}if(window.innerWidth<=620){let c=e.getBoundingClientRect();Ut(window.innerWidth-c.width-10,window.innerHeight-c.height-10);return}let i=document.querySelector('[class*="Header_characterInfo__"]')||document.querySelector('[class*="Header_rightHeader__"]')||document.querySelector('[class*="Header_info__"]');if(!i){let c=e.getBoundingClientRect();Ut(window.innerWidth-c.width-270,14);return}let a=i.getBoundingClientRect(),n=e.getBoundingClientRect(),r=Math.min(a.height||0,64),l=Math.max(8,a.left-n.width-10),s=Math.max(8,a.top+Math.max(0,(r-n.height)/2));Ut(l,s)}function bs(){pt("頁面狀態"),!Wt()&&(Et=ti(()=>{An+=1,pt("頁面狀態"),(Wt()||An>=20)&&(window.clearInterval(Et),Et=null)},1e3))}function _s(){jt(gn)}function jt(e){Oe.disposed||He.completed||Ne(ys,Math.max(0,Number(e)||0))}function ws(){let e=Math.min(He.uploadFailures,4);return Math.min(Zr*2**e,eo)}async function ys(){if(Oe.disposed||He.completed||He.inFlight)return;if(o.requestInFlight){jt(Wi);return}let e=He;e.inFlight=!0;try{if(!e.readComplete){let n=pt("開啟遊戲 15 秒自動重新讀取");if(e!==He)return;if(!n||!Ir()){m&&(m.savedMessage.textContent=`自動重新讀取尚未完成，${Math.round(Wi/1e3)} 秒後重新讀取。`),jt(Wi);return}e.readComplete=!0}let t=D.capture(),i=await Nr({startup:!0});if(e!==He||!D.isCurrent(t))return;if(i){e.completed=!0,e.uploadFailures=0;return}let a=ws();e.uploadFailures+=1,m&&(m.savedMessage.textContent=`自動上傳失敗，${Math.round(a/1e3)} 秒後重新上傳。`),jt(a)}finally{e.inFlight=!1}}function pt(e){let t=document.querySelector("#root"),i=t&&t._reactRootContainer,a=i&&(i.current||i._internalRoot&&i._internalRoot.current);if(!a)return!1;let n=[a],r=new Set,l=0;for(;n.length&&l<12e3;){let s=n.pop();if(!s||r.has(s))continue;r.add(s),l+=1;let c=s.stateNode&&s.stateNode.state;if(c&&c.character&&c.characterSkillMap&&c.characterAbilityMap){let d=ft(c.characterSkillMap),u=ft(c.characterAbilityMap),f=ft(c.characterItemMap),p=da(c.character);return p=mi(c.guild||c.characterGuild)||p,p=ma(c.guildBuildingLevelMap||c.guildBuildingLevelDict)||p,p=Dn(c.guildBuffLevelMap,c.characterGuildBuffMap,c.characterGuildBuffDict,c.characterGuildBuffLevelMap,c.characterGuildBuffLevelDict,c.guildCombatBuffLevels,c.guildCombatBuffLevelMap,c.guildShrineLevelMap,c.effectiveGuildShrineLevelMap,c.character?.guildBuffLevelMap,c.character?.guildCombatBuffLevels,c.character?.guildCombatBuffLevelMap,c.character?.guildShrineLevelMap,c.character?.effectiveGuildShrineLevelMap)||p,p=ga(d)||p,p=ha(d)||p,p=ba(u)||p,p=_a(d,!0)||p,p=wa(u,!0)||p,f.length&&(p=Sa(f,!0)||p),p=ya(c.combatUnit)||p,p=$n(c)||p,p=fa(c.guildWeeklyTrialSet)||p,p=Cr(c.guildTrialScheduleHourOffset)||p,(p||!o.source)&&(o.source=e,o.updatedAt=new Date),gt(),!0}s.child&&n.push(s.child),s.sibling&&n.push(s.sibling)}return!1}function ft(e){if(!e)return[];if(Array.isArray(e))return e.slice();if(typeof e.values!="function")return typeof e=="object"?Object.values(e):[];try{return Array.from(e.values())}catch{return[]}}function Qa(e){return e?typeof e.size=="number"?e.size:Array.isArray(e)?e.length:typeof e=="object"?Object.keys(e).length:0:0}function W(e,t){return!e||!t?null:typeof e.get=="function"?e.get(t)||null:e[t]||null}function gt(){if(!m)return;Ta(!1),zn();let e=Za(),t=Wt(),i=e&&t,a=Aa();m.shadow.querySelectorAll('[data-role="status-dot"]').forEach(r=>r.classList.toggle("ready",i)),m.statusText.textContent=i?`角色、${o.allSkills.size} 項等級、${o.allAbilities.size} 項技能與 ${a.length} 種裝備已讀取`:e?"角色與技能已讀取，正在等待倉庫及身上裝備資料…":"等待完整的遊戲角色資料…",m.characterName.textContent=o.character?`${o.character.name}（${o.character.id}）`:"—",m.guildName.textContent=o.guild?`${o.guild.name}（${o.guild.id}）`:"—",m.source.textContent=o.source||"—",m.updatedAt.textContent=o.updatedAt?o.updatedAt.toLocaleString(Fe,{hour12:!1}):"—";for(let r of ve){let l=m.shadow.querySelector(`[data-level-kind="skill"][data-hrid="${r.hrid}"]`);l&&(l.textContent=o.lifeSkillLevels.has(r.hrid)?String(o.lifeSkillLevels.get(r.hrid)):"—")}for(let r of Me){let l=m.shadow.querySelector(`[data-level-kind="combat"][data-hrid="${r.hrid}"]`);l&&(l.textContent=o.combatSkillLevels.has(r.hrid)?String(o.combatSkillLevels.get(r.hrid)):"—")}for(let r of Be){let l=m.shadow.querySelector(`[data-level-kind="aura"][data-hrid="${r.hrid}"]`);l&&(l.textContent=o.auraLevels.has(r.hrid)?String(o.auraLevels.get(r.hrid)):"0")}if(m.equipmentSummary){m.equipmentSummary.replaceChildren();let r=a.filter(l=>l.equippedCount>0).length;for(let l of[`全部裝備：${a.length} 種`,`目前身上：${r} 種`,`已學技能：${o.allAbilities.size} 項`,`裝備技能分數：${rt(o.localBuildScore?.value??o.buildScore.value)}`]){let s=document.createElement("span");s.textContent=l,m.equipmentSummary.appendChild(s)}}Pi(),Xa()}function Za(){return!!o.character&&ve.every(e=>o.lifeSkillLevels.has(e.hrid))&&Me.every(e=>o.combatSkillLevels.has(e.hrid))&&o.allSkills.size>0&&o.allAbilities.size>0}function Wt(){return o.characterItems.size>0&&Qa(o.itemDetailMap)>0&&Qa(o.equipmentTypeDetailMap)>0}function Ir(){return Za()&&Wt()}function Pi(){if(!m)return;let e=Pn(),t=Ir()&&e,i=!!o.character&&!!_t()&&Jt();m.confirmButton.disabled=!t||o.requestInFlight||!Jt(),m.confirmButton.title=e?!o.characterHousesReady||!o.characterAchievementsReady?"房屋或成就本次未讀取；仍可上傳，雲端既有資料會保留":"":"目前角色尚未確認在公會名單內，禁止上傳",m.copyButton.disabled=!i||o.requestInFlight}function Ss(e){let t=new Map(bo.map(a=>[a.hrid,a])),i=new Set;return e.map(a=>{let n=t.get(a.itemHrid);return!n||i.has(a.itemHrid)?null:(i.add(a.itemHrid),{...n})}).filter(Boolean)}function vs(e={}){if(!Za())throw new Error("角色資料尚未完整讀取");if(!Wt())throw new Error("倉庫及身上裝備資料尚未完整讀取，請重新整理遊戲後再試");let t=Aa(),i=Ss(t),a={};for(let d of ve)a[d.key]=o.lifeSkillLevels.get(d.hrid);let r=e.includeBuildScore!==!1?Ge(o.localBuildScore):null;r&&(a[J]={...r,total:r.value,missingItems:Array.isArray(o.localBuildScore?.missingItems)?o.localBuildScore.missingItems:[]});let l={};for(let d of Me)l[d.key]=o.combatSkillLevels.get(d.hrid);let s={};for(let d of Be)s[d.key]=o.auraLevels.get(d.hrid)||0;let c={schemaVersion:1,dataVersion:9,scoreInputVersion:wn,scriptVersion:$,deviceId:Yt(),deviceLabel:Xt(),confirmedAt:new Date().toISOString(),character:{id:o.character.id,name:o.character.name},guild:o.guild?{id:o.guild.id,name:o.guild.name}:{id:"",name:""},lifeSkills:a,combatSkills:l,combatLevel:Yn([...o.allSkills.values()]),auras:s,optionalDataStatus:{houses:o.characterHousesReady,achievements:o.characterAchievementsReady,achievementCombatBuffs:o.achievementActionTypeBuffsReady,guildBuildings:o.guildBuildingLevelsReady,guildCombatBuffs:o.guildCombatBuffLevelsReady,guildCombatBuffsStatus:o.guildCombatBuffLevelsReady?"complete":"missing"},guildBuildingLevels:o.guildBuildingLevelsReady?{...o.guildBuildingLevels}:void 0,guildBuffLevelMap:o.guildCombatBuffLevelsReady?{...o.guildBuffLevelMap}:void 0,guildCombatBuffLevels:o.guildCombatBuffLevelsReady?{...o.guildCombatBuffLevels}:void 0,guildShrineLevelMap:o.guildCombatBuffLevelsReady?{...o.guildCombatBuffLevels}:void 0,effectiveGuildShrineLevelMap:o.guildCombatBuffLevelsReady?{...o.guildCombatBuffLevels}:void 0,houses:o.characterHousesReady?qn():void 0,achievements:o.characterAchievementsReady?Po():void 0,achievementCombatBuffs:o.achievementActionTypeBuffsReady?$o():void 0,equipment:t.map(d=>({...d})),skills:[...o.allSkills.values()].map(d=>{let u=W(o.skillDetailMap,d.skillHrid);return{...d,name:U(d.skillHrid,u&&u.name||d.skillHrid.split("/").pop())}}),abilities:[...o.allAbilities.values()].map(d=>{let u=W(o.abilityDetailMap,d.abilityHrid);return{...d,name:U(d.abilityHrid,u&&u.name||d.abilityHrid.split("/").pop()),isSpecialAbility:!!(u&&u.isSpecialAbility),combatActionHrid:String(u&&u.combatActionHrid||d.abilityHrid),equipped:o.equippedAbilityHrids.has(d.abilityHrid)}}),equippedAbilityHrids:[...o.equippedAbilityHrids],weapons:i,guildWeeklyTrials:o.trialRegistrationsReady?{life:o.guildWeeklyTrialRegistrations.life.slice(),battle:o.guildWeeklyTrialRegistrations.battle.slice(),availableLife:o.guildWeeklyTrials.life.slice(),availableBattle:o.guildWeeklyTrials.battle.slice(),reportMode:"registered"}:null,weapon:i.length?{...i[0]}:null};return r&&(c.buildScore={...r,total:r.value,missingItems:Array.isArray(o.localBuildScore?.missingItems)?o.localBuildScore.missingItems:[]}),c}async function Nr(e={}){if(o.requestInFlight)return!1;if(!Pn())return m&&(m.savedMessage.textContent="目前角色不在已確認的公會名單內，未上傳。",Pi()),!1;let t=D.capture();qi(!0,"正在上傳玩家資料…");try{let i=await na.upload(t);if(!i||!D.isCurrent(t))return!1;let{buildScore:a,snapshot:n,response:r}=i;return m&&(m.savedMessage.textContent=r.updated?`上傳成功：已更新 ${n.character.name} 的資料。`:`上傳成功：已建立 ${n.character.name} 的資料。`,Zs("上傳完成",[`角色：${n.character.name}`,`角色 ID：${n.character.id}`,`裝置：${r.deviceCode||$r(n.deviceId)}（${n.deviceLabel}）`,`裝備：${n.equipment.length} 種｜角色技能：${n.skills.length} 項｜戰鬥技能：${n.abilities.length} 項`,n.optionalDataStatus.houses&&n.optionalDataStatus.achievements?"房屋與成就：已更新":"房屋與成就：本次未完整讀取，已保留雲端既有資料",`內建 Talent Market 分數：${rt(a.value)}`])),Ne(()=>{D.isCurrent(t)&&Ke()},1e3),!0}catch(i){return m&&D.isCurrent(t)&&(m.savedMessage.textContent=i&&i.message?i.message:"無法上傳資料。"),!1}finally{qi(!1)}}async function ht(){if(!o.character||!_t()||!Jt()||o.trialReportInFlight)return;let e=o.trialRegistrationsReady,t=e?o.guildWeeklyTrialRegistrations.life.slice():[],i=e?o.guildWeeklyTrialRegistrations.battle.slice():[],a=o.guildWeeklyTrials.life.slice(),n=o.guildWeeklyTrials.battle.slice(),r=Do(),l=ps();if(!l&&!e&&!t.length&&!i.length&&!a.length&&!n.length&&!r)return;let s=JSON.stringify({characterId:o.character.id,nextTrialAt:l,guildTrialScheduleHourOffset:o.guildTrialScheduleHourOffset,scheduleOnly:!e,life:t,battle:i,availableLife:a,availableBattle:n,guildTrialRosterSnapshot:r,reportMode:"registered"});if(s===o.lastReportedTrialSignature)return;let c=D.capture();o.trialReportInFlight=!0;try{let d=await q({action:"reportTrialIds",characterId:c.characterId,memberToken:_t(c.characterId),deviceId:Yt(),deviceLabel:Xt(),nextTrialAt:l,guildTrialScheduleHourOffset:o.guildTrialScheduleHourOffset,scheduleOnly:!e,guildTrialRosterSnapshot:r,guildWeeklyTrials:{life:t,battle:i,availableLife:a,availableBattle:n,reportMode:"registered"}});if(!D.isCurrent(c))return;o.lastReportedTrialSignature=s,d&&d.trialRosterAudit&&(o.latestConfigResponse={...o.latestConfigResponse||{},trialRosterAudit:d.trialRosterAudit},Oi())}catch{}finally{o.trialReportInFlight=!1}}async function xs(){if(o.requestInFlight)return;let e;try{Vs(),e=D.capture(),qi(!0,"正在讀取我的配置…");let t=await na.readConfiguration(e);if(!D.isCurrent(e)||!Rr(t,e))return;let i=$i(t);Qs("我的指定方案",t.weekKey,i,{nextTrialAt:t.nextTrialAt}),an(t),m.savedMessage.textContent=i.length?`已讀取 ${i.length} 筆本週指定方案。`:"本週尚未發布你的生活或戰鬥方案。"}catch(t){m&&(!e||D.isCurrent(e))&&(m.savedMessage.textContent=t&&t.message?t.message:"無法讀取配置。")}finally{qi(!1)}}function As(){Ne(Ke,Qr),ti(Ke,Xr),Se(document,"visibilitychange",()=>{document.visibilityState==="visible"&&Ke()})}function ks(){if(!document.getElementById(pn)){let e=document.createElement("style");e.id=pn,e.textContent=`
                .mwi-guild-trial-assigned {
                    position: relative !important;
                    outline: 4px solid #a2b6d0 !important;
                    outline-offset: -4px !important;
                    height: auto !important;
                    grid-auto-rows: minmax(26px, auto) !important;
                    box-shadow: none !important;
                    transform: none !important;
                    filter: none !important;
                    animation: none !important;
                    transition: none !important;
                    z-index: 20 !important;
                }
                .mwi-guild-trial-assigned-life {
                    outline-color: #73d7b0 !important;
                    background-color: #29443f !important;
                }
                .mwi-guild-trial-assigned-battle {
                    outline-color: #ebc15d !important;
                    background-color: #4b4030 !important;
                }
                .mwi-guild-trial-assignment-badge {
                    position: static !important;
                    grid-area: 2 / 1 !important;
                    margin: 0 4px 4px !important;
                    padding: 4px 2px !important;
                    border: 0 !important;
                    border-radius: 3px !important;
                    background: #a2b6d0 !important;
                    color: #182536 !important;
                    font: 800 12px/1.2 Arial, "Microsoft JhengHei", sans-serif !important;
                    text-align: center !important;
                    text-shadow: none !important;
                    box-shadow: none !important;
                    white-space: normal !important;
                    overflow-wrap: anywhere !important;
                    animation: none !important;
                    transition: none !important;
                    pointer-events: none !important;
                }
                .mwi-guild-trial-assignment-badge.life {
                    background: #73d7b0 !important;
                    color: #102920 !important;
                }
                .mwi-guild-trial-assignment-badge.battle {
                    background: #ebc15d !important;
                    color: #342609 !important;
                }
                #${Qe} {
                    position: fixed !important;
                    top: 72px !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    z-index: 2147483600 !important;
                    width: min(760px, calc(100vw - 24px)) !important;
                    padding: 12px 16px !important;
                    border: 4px solid #fff !important;
                    border-radius: 12px !important;
                    background: #b91c1c !important;
                    color: #fff !important;
                    text-align: center !important;
                    font: 900 16px/1.4 Arial, "Microsoft JhengHei", sans-serif !important;
                    box-shadow: 0 0 30px rgba(255, 0, 0, .85) !important;
                }
                .${et} {
                    display: flex !important;
                    align-items: center !important;
                    flex: 0 0 auto !important;
                    gap: 4px !important;
                }
                .${Ze} {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-sizing: border-box !important;
                    min-width: 20px !important;
                    height: 20px !important;
                    padding: 0 5px !important;
                    border: 1px solid rgba(255, 255, 255, .72) !important;
                    border-radius: 999px !important;
                    background: #e53935 !important;
                    color: #fff !important;
                    font: 700 13px/18px Roboto, Arial, "Microsoft JhengHei", sans-serif !important;
                    text-shadow: 0 1px 1px rgba(0, 0, 0, .45) !important;
                    box-shadow: 0 0 6px rgba(229, 57, 53, .8) !important;
                    white-space: nowrap !important;
                    pointer-events: none !important;
                }
                .${ye} {
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 5px !important;
                    min-height: 28px !important;
                    margin-left: 8px !important;
                    padding: 3px 9px !important;
                    border: 1px solid #ef6a61 !important;
                    border-radius: 6px !important;
                    background: rgba(139, 29, 29, .78) !important;
                    color: #fff !important;
                    font: 700 12px/1.2 Arial, "Microsoft JhengHei", sans-serif !important;
                    text-shadow: 0 1px 1px rgba(0, 0, 0, .55) !important;
                    cursor: pointer !important;
                }
                .${ye}:hover,
                .${ye}:focus-visible {
                    background: rgba(185, 28, 28, .96) !important;
                    outline: 2px solid #ffd0cc !important;
                    outline-offset: 1px !important;
                }
                .mwi-guild-trial-roster-list-count {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 18px !important;
                    height: 18px !important;
                    padding: 0 4px !important;
                    border-radius: 999px !important;
                    background: #ef4444 !important;
                    color: #fff !important;
                    font-size: 11px !important;
                }
                #${St} {
                    position: fixed !important;
                    inset: 50% auto auto 50% !important;
                    transform: translate(-50%, -50%) !important;
                    z-index: 2147483646 !important;
                    box-sizing: border-box !important;
                    width: min(720px, calc(100vw - 24px)) !important;
                    max-height: min(78vh, 760px) !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: 1px solid #ef6a61 !important;
                    border-radius: 10px !important;
                    background: #202633 !important;
                    color: #f7f8fb !important;
                    box-shadow: 0 22px 70px rgba(0, 0, 0, .72) !important;
                    font: 14px/1.45 Arial, "Microsoft JhengHei", sans-serif !important;
                }
                #${St}::backdrop {
                    background: rgba(4, 7, 13, .72) !important;
                    backdrop-filter: blur(2px) !important;
                }
                .mwi-guild-trial-roster-list-header {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                    gap: 12px !important;
                    padding: 12px 14px !important;
                    border-bottom: 1px solid #465066 !important;
                }
                .mwi-guild-trial-roster-list-header strong {
                    color: #ffd86a !important;
                    font-size: 17px !important;
                }
                .mwi-guild-trial-roster-list-close {
                    width: 30px !important;
                    height: 30px !important;
                    padding: 0 !important;
                    border: 1px solid #67738b !important;
                    border-radius: 6px !important;
                    background: #30394a !important;
                    color: #fff !important;
                    font-size: 20px !important;
                    line-height: 26px !important;
                    cursor: pointer !important;
                }
                .mwi-guild-trial-roster-list-meta {
                    padding: 9px 14px !important;
                    color: #aeb9cf !important;
                    font-size: 12px !important;
                }
                .mwi-guild-trial-roster-list-rows {
                    display: grid !important;
                    gap: 7px !important;
                    max-height: calc(min(78vh, 760px) - 104px) !important;
                    margin: 0 !important;
                    padding: 0 14px 14px !important;
                    overflow: auto !important;
                    list-style: none !important;
                }
                .mwi-guild-trial-roster-list-row {
                    display: grid !important;
                    grid-template-columns: minmax(110px, 1fr) auto minmax(180px, 2fr) !important;
                    align-items: center !important;
                    gap: 9px !important;
                    padding: 8px 10px !important;
                    border: 1px solid #48536a !important;
                    border-radius: 7px !important;
                    background: #2a3242 !important;
                }
                .mwi-guild-trial-roster-list-name {
                    overflow-wrap: anywhere !important;
                    color: #fff !important;
                    font-weight: 800 !important;
                }
                .mwi-guild-trial-roster-list-type {
                    padding: 2px 6px !important;
                    border-radius: 999px !important;
                    background: #46516a !important;
                    color: #dfe7ff !important;
                    font-size: 11px !important;
                    white-space: nowrap !important;
                }
                .mwi-guild-trial-roster-list-reason {
                    color: #ffb4ae !important;
                    overflow-wrap: anywhere !important;
                }
                @media (max-width: 560px) {
                    .${ye} {
                        min-height: 24px !important;
                        margin-left: 5px !important;
                        padding: 2px 6px !important;
                        font-size: 11px !important;
                    }
                    .mwi-guild-trial-roster-list-row {
                        grid-template-columns: 1fr auto !important;
                    }
                    .mwi-guild-trial-roster-list-reason {
                        grid-column: 1 / -1 !important;
                    }
                }
            `,(document.head||document.documentElement).appendChild(e)}at&&at.disconnect(),at=new MutationObserver(e=>{e.some(i=>[...i.addedNodes,...i.removedNodes].some(n=>n.nodeType===1&&!Ts(n)))&&Vt()}),document.body&&at.observe(document.body,{childList:!0,subtree:!0}),Vt()}function Ts(e){return e.id===Qe||e.id===St||e.classList?.contains("mwi-guild-trial-assignment-badge")||e.classList?.contains(Ze)||e.classList?.contains(et)||e.classList?.contains(ye)}function Vt(){window.clearTimeout(li),li=window.setTimeout(Rs,120)}function Cs(){let e=()=>{let t=[...document.querySelectorAll('[role="tab"]')].find(i=>{let a=String(i.textContent||"").replace(/\s+/g,"").toLowerCase();return a.startsWith("試煉")||a.startsWith("guildtrial")||a.startsWith("trial")});return t?(t.click(),Vt(),!0):!1};if(!e()){let t=document.querySelector('[role="img"][aria-label="navigationBar.guild"], svg[aria-label="navigationBar.guild"], img[alt="navigationBar.guild"]'),i=t&&(t.closest('[class*="NavigationBar_navigationLink__"]')||t.closest('button, a, [role="button"]')||t.parentElement);i&&i.click()}[120,350,800,1500,2500].forEach(t=>{window.setTimeout(e,t)})}function Es(e){if(!e||typeof e!="object")return[];let t=[],i=(r,l="")=>{if(!r||r===!0)return;let s=typeof r=="string"?{planId:r}:r;if(!s||typeof s!="object")return;let c=Rt({...s,planType:l||s.planType||s.type});!c.planId&&!c.trialHrid&&!Object.keys(Ni(c)).length&&!c.skillHrids.length&&!c.abilityHrids.length||t.push(c)};[e.publishedPlans,e.player&&e.player.publishedPlans,e.member&&e.member.publishedPlans,e.published&&typeof e.published=="object"?e.published:null].filter(Boolean).forEach(r=>{if(Array.isArray(r)){r.forEach(l=>i(l));return}!r||typeof r!="object"||(i(r.life||r.lifePlan||r.skilling,g.LIFE),i(r.battle||r.battlePlan||r.combat,g.BATTLE))}),i(e.publishedLifePlan||e.lifePlan,g.LIFE),i(e.publishedBattlePlan||e.battlePlan,g.BATTLE);let n=new Map;return t.forEach(r=>{let l=`${r.planType}:${r.planId||r.trialHrid||r.name}`;n.set(l,r)}),[...n.values()]}function Te(e){let t=new Map([...ai,...ni]),i=String(e||"");return U(i,t.get(i)||i.split("/").pop()||"未指定")}function $i(e){let t=Array.isArray(e&&e.assignments)?e.assignments:[],i=t.filter(n=>n&&n.kind==="notice"),a=Es(e);return a.length?[...i,...a.map(n=>({...n,kind:"plan",trialType:n.planType,group:n.name,trialName:String(n.trialName||Te(n.trialHrid))}))]:t}function en(e){return(Array.isArray(e)?e:[]).filter(t=>t&&t.kind!=="notice"&&/^\/guild_(skilling|combat)\/[a-z0-9_]+$/i.test(String(t.trialHrid||"")))}function Ce(e){let t=String(e||"").replace(/[\u200B-\u200D\uFEFF]/g,"").trim();try{t=t.normalize("NFKC")}catch{}return t.replace(/\s+/g," ")}function Ls(){let e=document.querySelector('[class*="GuildPanel_signupModal__"]');if(!e)return null;let t=Ce(e.querySelector('[class*="GuildPanel_name__"]')?.textContent);if(!t)return null;let i=[...document.querySelectorAll('[class*="GuildPanel_trialTile__"]')],a=i.find(_=>Ce(_.querySelector('[class*="GuildPanel_tileName__"]')?.textContent)===t),n=a?tn(a):"",r=n.startsWith("/guild_combat/")?g.BATTLE:n.startsWith("/guild_skilling/")?g.LIFE:"";if(!n||!r)return null;let s=[...e.querySelectorAll('[class*="GuildPanel_label__"]')].find(_=>{let h=Ce(_.textContent).toLowerCase();return h==="報名"||h==="signups"||h==="registration"}),d=(s&&s.nextElementSibling?String(s.nextElementSibling.textContent||""):"").match(/(\d+)\s*\/\s*\d+/);if(!d)return null;let u=Number(d[1]),f=[...new Set([...e.querySelectorAll('[class*="GuildPanel_memberName__"]')].map(_=>Ce(_.textContent)).filter(Boolean))];if(f.length!==u)return null;let p=i.map(tn).filter(_=>r===g.BATTLE?_.startsWith("/guild_combat/"):_.startsWith("/guild_skilling/"));return{trialHrid:n,trialType:r,characterNames:f,registeredCount:u,availableTrialHrids:p}}async function Is(){if(!V()||!Jt())return;let e=Ls();if(!e)return;let t=JSON.stringify({trialHrid:e.trialHrid,characterNames:e.characterNames.slice().sort((i,a)=>i.localeCompare(a)),availableTrialHrids:e.availableTrialHrids.slice().sort()});if(!(o.trialRosterCaptureSignatures.get(e.trialHrid)===t||o.trialRosterCaptureInFlight.has(t))){o.trialRosterCaptureInFlight.add(t);try{let i=await q({action:"adminReportTrialRoster",adminToken:Q(),trialHrid:e.trialHrid,characterNames:e.characterNames,registeredCount:e.registeredCount,availableTrialHrids:e.availableTrialHrids});o.trialRosterCaptureSignatures.set(e.trialHrid,t),i&&i.trialRosterAudit&&(o.latestConfigResponse={...o.latestConfigResponse||{},trialRosterAudit:i.trialRosterAudit},Oi())}catch(i){k(i&&i.message?`試煉名單核對失敗：${i.message}`:"試煉名單核對失敗。",!0)}finally{o.trialRosterCaptureInFlight.delete(t)}}}function Ns(e,t=o.character,i=o.latestConfigResponse){let a=String(t&&t.id||"").trim(),n=Ce(t&&t.name).toLowerCase();if(!a&&!n)return 0;let r={};if(en($i(i)).forEach(s=>{let c=String(s&&s.trialHrid||"").trim().toLowerCase(),d=c.startsWith("/guild_combat/")?g.BATTLE:c.startsWith("/guild_skilling/")?g.LIFE:"";d&&!r[d]&&(r[d]=c)}),!r[g.LIFE]&&!r[g.BATTLE])return 0;let l=null;if(o.trialRegistrationsReady)l={[g.LIFE]:ae(o.guildWeeklyTrialRegistrations&&o.guildWeeklyTrialRegistrations.life,g.LIFE),[g.BATTLE]:ae(o.guildWeeklyTrialRegistrations&&o.guildWeeklyTrialRegistrations.battle,g.BATTLE)};else if(o.guildRosterReady&&Array.isArray(o.guildRoster)){let s=o.guildRoster.find(c=>{let d=String(c&&c.characterId||"").trim(),u=Ce(c&&c.characterName).toLowerCase();return a?d===a:!!(n&&u===n)});s&&(l={[g.LIFE]:ae([s.signedUpSkillingTrialHrid],g.LIFE),[g.BATTLE]:ae([s.signedUpCombatTrialHrid],g.BATTLE)})}return l?[g.LIFE,g.BATTLE].reduce((s,c)=>{let d=r[c];return d?s+(l[c].includes(d)?0:1):s},0):0}function Mr(){document.querySelectorAll(`.${Ze}`).forEach(e=>e.remove()),document.querySelectorAll(`.${et}`).forEach(e=>e.remove())}function Br(e){let t=Array.isArray(e&&e.wrongSelections)?e.wrongSelections:[],i=new Map;return t.forEach(a=>{if(!a||!a.characterName)return;let n=String(a.type||"");if(n!==g.LIFE&&n!==g.BATTLE)return;let r={characterId:String(a.characterId||"").trim(),characterName:Ce(a.characterName),type:n,reason:String(a.reason||"wrongTrial"),expectedTrialHrid:String(a.expectedTrialHrid||"").trim().toLowerCase(),actualTrialHrid:String(a.actualTrialHrid||"").trim().toLowerCase()},l=[r.characterId||r.characterName.toLowerCase(),r.type,r.reason,r.expectedTrialHrid,r.actualTrialHrid].join("|");i.set(l,r)}),[...i.values()].sort((a,n)=>a.characterName.localeCompare(n.characterName,Fe)||a.type.localeCompare(n.type)||a.reason.localeCompare(n.reason))}function Hr(e){return new Set((Array.isArray(e)?e:[]).map(t=>String(t&&t.characterId||"").trim()||Ce(t&&t.characterName).toLowerCase()).filter(Boolean)).size}function Ms(e){let t=e.expectedTrialHrid?Te(e.expectedTrialHrid):"",i=e.actualTrialHrid?Te(e.actualTrialHrid):"";return K==="en"?e.reason==="notRegistered"?`Not signed up; assigned to ${t||"another trial"}`:e.reason==="notAssigned"?`Not assigned by an admin; signed up for ${i||"a trial"}`:e.reason==="unknownMember"?`Not found in guild data; signed up for ${i||"a trial"}`:`Selected ${i||"another trial"}; assigned to ${t||"another trial"}`:e.reason==="notRegistered"?`尚未報名，應選 ${t||"指定試煉"}`:e.reason==="notAssigned"?`管理員未指定，卻選了 ${i||"其他試煉"}`:e.reason==="unknownMember"?`公會資料找不到此成員，已選 ${i||"其他試煉"}`:`選了 ${i||"其他試煉"}，應選 ${t||"指定試煉"}`}function bt(){let e=document.getElementById(St);e&&(e.open&&typeof e.close=="function"&&e.close(),e.remove())}function Bs(){bt();let e=o.latestConfigResponse&&o.latestConfigResponse.trialRosterAudit,t=Br(e);if(!t.length)return;let i=document.createElement("dialog");i.id=St,i.setAttribute("aria-label",K==="en"?"Incorrect trial selections":"試煉錯誤名單");let a=document.createElement("div");a.className="mwi-guild-trial-roster-list-header";let n=document.createElement("strong"),r=Hr(t);n.textContent=K==="en"?`Incorrect trial selections (${r} players)`:`試煉錯誤名單（${r} 人）`;let l=document.createElement("button");l.type="button",l.className="mwi-guild-trial-roster-list-close",l.textContent="×",l.title=K==="en"?"Close":"關閉",l.addEventListener("click",bt),a.append(n,l);let s=document.createElement("div");s.className="mwi-guild-trial-roster-list-meta";let c=e&&e.updatedAt?ln(e.updatedAt):"";s.textContent=K==="en"?`${t.length} issues${c?` · Updated ${c}`:""}`:`共 ${t.length} 項錯誤${c?` · 更新時間 ${c}`:""}`;let d=document.createElement("ul");d.className="mwi-guild-trial-roster-list-rows",t.forEach(u=>{let f=document.createElement("li");f.className="mwi-guild-trial-roster-list-row";let p=document.createElement("span");p.className="mwi-guild-trial-roster-list-name",p.textContent=u.characterName;let _=document.createElement("span");_.className="mwi-guild-trial-roster-list-type",_.textContent=K==="en"?u.type===g.BATTLE?"Combat":"Skilling":u.type===g.BATTLE?"戰鬥":"生活";let h=document.createElement("span");h.className="mwi-guild-trial-roster-list-reason",h.textContent=Ms(u),f.append(p,_,h),d.appendChild(f)}),i.append(a,s,d),i.addEventListener("cancel",u=>{u.preventDefault(),bt()}),i.addEventListener("click",u=>{u.target===i&&bt()}),document.body.appendChild(i),typeof i.showModal=="function"?i.showModal():i.setAttribute("open",""),l.focus()}function Hs(e){let t=Br(e),a=[...document.querySelectorAll('[class*="GuildPanel_title__"]')].find(c=>{let d=Ce(c.firstElementChild&&c.firstElementChild.textContent).toLowerCase();return d==="公會"||d==="公会"||d==="guild"});if(document.querySelectorAll(`.${ye}`).forEach(c=>{(!a||c.parentElement!==a)&&c.remove()}),!a||!t.length){bt();return}let n=a.querySelector(`:scope > .${ye}`);n||(n=document.createElement("button"),n.type="button",n.className=ye,n.addEventListener("click",Bs),a.appendChild(n));let r=Hr(t);if(n.dataset.memberCount===String(r))return;n.dataset.memberCount=String(r),n.replaceChildren();let l=document.createElement("span");l.textContent=K==="en"?"Error list":"錯誤名單";let s=document.createElement("span");s.className="mwi-guild-trial-roster-list-count",s.textContent=String(r),n.append(l,s),n.title=K==="en"?`View ${r} players with incorrect trial selections`:`查看 ${r} 位試煉選擇錯誤的成員`}function Oi(){let e=o.latestConfigResponse&&o.latestConfigResponse.trialRosterAudit;Hs(e);let t=Ns(e);if(!t){Mr();return}let i=document.querySelector('[role="img"][aria-label="navigationBar.guild"], svg[aria-label="navigationBar.guild"], img[alt="navigationBar.guild"]'),a=i&&(i.closest('[class*="NavigationBar_nav__"]')||i.parentElement);if(!a)return;let n=a.querySelector(':scope > [class*="NavigationBar_badges__"]');n||(n=a.querySelector(`:scope > .${et}`)),n||(n=document.createElement("div"),n.className=et,a.appendChild(n)),document.querySelectorAll(`.${Ze}`).forEach(s=>{s.parentElement!==n&&s.remove()}),document.querySelectorAll(`.${et}`).forEach(s=>{s!==n&&s.remove()});let r=n.querySelector(`:scope > .${Ze}`);r||(r=document.createElement("span"),r.className=Ze,r.setAttribute("role","status"),n.appendChild(r)),r.textContent=String(t);let l=K==="en"?`${t} of your trial selections are missing or incorrect`:`你有 ${t} 個試煉尚未報名或報名錯誤`;r.setAttribute("aria-label",l),r.title=l}function Rs(){let e=en($i(o.latestConfigResponse)),t=new Map(e.map(l=>[String(l.trialHrid).toLowerCase(),l])),i=[...document.querySelectorAll('[class*="GuildPanel_trialTile__"]')],a=[],n=[];if(i.forEach(l=>{let s=tn(l);s&&a.push(s),s&&Ds(l)&&n.push(s);let c=s?t.get(s):null,d=c&&(c.trialType===g.BATTLE||String(c.trialHrid||"").startsWith("/guild_combat/"))?g.BATTLE:g.LIFE;if(l.classList.toggle("mwi-guild-trial-assigned",!!c),l.classList.toggle("mwi-guild-trial-assigned-life",!!c&&d===g.LIFE),l.classList.toggle("mwi-guild-trial-assigned-battle",!!c&&d===g.BATTLE),c){l.dataset.mwiGuildTrialAssignment=s;let u=l.querySelector(":scope > .mwi-guild-trial-assignment-badge");u||(u=document.createElement("div"),u.className="mwi-guild-trial-assignment-badge",l.appendChild(u)),u.classList.toggle("life",d===g.LIFE),u.classList.toggle("battle",d===g.BATTLE);let f=G(d===g.BATTLE?"戰鬥指定":"生活指定");u.textContent=`★ ${f}`,u.title=`${f}：${c.trialName||c.group||"請選這個"}`,u.setAttribute("aria-label",u.title)}else delete l.dataset.mwiGuildTrialAssignment,l.querySelector(":scope > .mwi-guild-trial-assignment-badge")?.remove()}),a.length){fa({skillHrids:a.filter(d=>d.startsWith("/guild_skilling/")),combatHrids:a.filter(d=>d.startsWith("/guild_combat/"))});let l={life:ae(n.filter(d=>d.startsWith("/guild_skilling/")),"life"),battle:ae(n.filter(d=>d.startsWith("/guild_combat/")),"battle")},s=JSON.stringify(l)!==JSON.stringify(o.guildWeeklyTrialRegistrations),c=!o.trialRegistrationsReady;o.trialRegistrationsReady=!0,(s||c)&&(o.guildWeeklyTrialRegistrations=l,window.setTimeout(ht,200))}let r=i.length?[...t.keys()].filter(l=>!a.includes(l)):[];if(r.length){let l=document.getElementById(Qe);l||(l=document.createElement("div"),l.id=Qe,document.body.appendChild(l)),l.textContent=`⚠ 公會發布的試煉不在本週選項：${r.join("、")}。請先不要選並通知管理員。`}else document.getElementById(Qe)?.remove();Oi(),Is()}function Ds(e){return[...e.classList].some(t=>t.startsWith("GuildPanel_trialTileMine__"))}function tn(e){let t=[...e.querySelectorAll("use")].map(i=>i.getAttribute("href")||i.getAttribute("xlink:href")||"").filter(Boolean);for(let i of t){let a=String(i).split("#").pop().toLowerCase();if(a.startsWith("trial_"))return`/guild_combat/${a.slice(6)}`;if(ve.some(n=>n.key===a))return`/guild_skilling/${a}`}return""}function Ps(){document.querySelectorAll(".mwi-guild-trial-assigned").forEach(e=>{e.classList.remove("mwi-guild-trial-assigned","mwi-guild-trial-assigned-life","mwi-guild-trial-assigned-battle"),delete e.dataset.mwiGuildTrialAssignment,e.querySelector(":scope > .mwi-guild-trial-assignment-badge")?.remove()}),document.getElementById(Qe)?.remove(),Mr(),document.querySelectorAll(`.${ye}`).forEach(e=>e.remove()),bt()}async function Ke(){if(document.visibilityState!=="visible"||!o.character||!_t()||!Jt()||o.requestInFlight||o.configPollInFlight)return;let e=D.capture();o.configPollInFlight=!0;try{let t=await na.readConfiguration(e);if(!D.isCurrent(e)||!Rr(t,e))return;an(t)}catch{}finally{o.configPollInFlight=!1}}function Rr(e,t=D.capture()){return!D.isCurrent(t)||(pt("頁面狀態"),!D.isCurrent(t))?!1:(o.latestConfigResponse=e&&typeof e=="object"?e:null,Vt(),Ne(()=>{D.isCurrent(t)&&ht()},250),!0)}function $s(){return`${Qt}${o.character?o.character.id:"unknown"}`}function Os(){return`${jr}${o.character?o.character.id:"unknown"}`}function qs(){return`${Wr}${o.character?o.character.id:"unknown"}`}function Fs(){return`${Vr}${o.character?o.character.id:"unknown"}`}function zs(e){let t=e&&e.notice&&e.notice.enabled?e.notice:null;return t?String(t.revision||t.publishedAt||JSON.stringify({title:String(t.title||""),content:String(t.content||"")})):""}function Gs(e){return!e||typeof e!="object"?"":String(e.trialTimeRevision||e.trialTimePublishedAt||e.nextTrialAt||"")}function Us(e){let t=e&&e.trialSelectionNotice&&e.trialSelectionNotice.enabled?e.trialSelectionNotice:null;return t?String(t.revision||t.publishedAt||JSON.stringify({title:String(t.title||""),content:String(t.content||"")})):""}function an(e){if(!o.character||o.activeAlertSignature)return!1;let t=String(GM_getValue($s(),"")||""),i=qs(),a=Gs(e),n=GM_getValue(i,null),r=Os(),l=zs(e),s=GM_getValue(r,null),c=Fs(),d=Us(e),u=GM_getValue(c,null);n===null&&t&&GM_setValue(i,a),s===null&&t&&GM_setValue(r,l);let p=[{type:"trialSelection",storageKey:c,signature:d,acknowledged:u},{type:"notice",storageKey:r,signature:l,acknowledged:s===null&&t?l:s},{type:"trialTime",storageKey:i,signature:a,acknowledged:n===null&&t?a:n}].find(_=>_.signature&&String(_.acknowledged||"")!==_.signature);return p?(o.activeAlertSignature=`${p.type}:${p.signature}`,Ws(e,p.storageKey,p.signature,{type:p.type}),!0):!1}function js(e){return en($i(e)).map(t=>`${String(t.trialHrid).startsWith("/guild_skilling/")?"生活試煉":"戰鬥試煉"}：請選擇「${Te(t.trialHrid)}」`).join(`
`)}function Ws(e,t,i,a={}){let n=m.shadow.querySelector('[data-role="config-alert"]');n&&(n.open&&n.close(),n.remove());let r=document.createElement("section");r.className="mwi-config-alert",r.dataset.role="config-alert",r.setAttribute("role","region"),r.setAttribute("aria-live","polite");let l=String(a.type||"trialTime"),s=l==="notice"?e&&e.notice:l==="trialSelection"?e&&e.trialSelectionNotice:null;r.setAttribute("aria-label",l==="trialSelection"?"試煉選擇通知":l==="notice"?"公會公告":"試煉時間已更新");let c=document.createElement("div");c.className="mwi-config-alert-card";let d=document.createElement("div");d.className="mwi-config-alert-content";let u=document.createElement("h2");u.textContent=s&&s.title?s.title:l==="trialSelection"?"請選擇本週公會試煉":l==="notice"?"公會通知":"試煉時間已更新";let f=document.createElement("p");f.textContent=e.nextTrialAt?`下次試煉：${qr(e.nextTrialAt)}`:"下次試煉時間：管理員尚未設定";let p=document.createElement("p");p.textContent=s?s.content||(l==="trialSelection"?"請查看並選擇管理員指定的生活與戰鬥試煉。":"管理員發布了一則公會公告。"):"管理員已更新公會試煉時間。",s&&s.title&&(u.dataset.i18nIgnore="true"),s&&s.content&&(p.dataset.i18nIgnore="true");let _=document.createElement("button");if(_.type="button",_.className="mwi-button secondary",_.textContent="我知道了",_.addEventListener("click",()=>{GM_setValue(t,i),o.activeAlertSignature="",r.remove(),window.setTimeout(()=>{an(o.latestConfigResponse)},50)}),d.append(u,p),l==="trialSelection"){let b=js(e);if(b){let y=document.createElement("p");y.textContent=b,y.style.whiteSpace="pre-wrap",d.appendChild(y)}}(l==="trialTime"||l==="trialSelection")&&d.appendChild(f);let h=document.createElement("div");if(h.className="mwi-config-alert-actions",l==="trialSelection"||l==="trialTime"){let b=document.createElement("button");b.type="button",b.className="mwi-button secondary",b.textContent="查看試煉",b.addEventListener("click",()=>{Cs(),Vt()}),h.appendChild(b)}h.appendChild(_),c.append(d,h),r.appendChild(c),m.shadow.appendChild(r)}function Vs(){if(!o.character)throw new Error("尚未讀取角色資料。");if(!_t())throw new Error("尚未取得個人讀取碼，請先上傳一次資料。")}function qi(e,t){o.requestInFlight=!!e,t&&m&&(m.savedMessage.textContent=t),Pi()}function q(e){let t=String(e&&e.action||"");if(t==="myConfig"||t==="ping")return Dr(e);if(t==="uploadPlayerData"||t==="reportTrialIds"){let i=nn(),a={...e,requestId:i};return Kt(a).catch(n=>{if(n&&n.isApiResponse)throw n;return Ks(i,n)})}if(lo.has(t)){let i=String(e.requestId||nn()),a={...e,requestId:i};return Kt(a,xt).catch(async n=>{if(n&&n.isApiResponse)throw n;await rn(700);try{return await Kt(a,xt)}catch(r){if(r&&r.isApiResponse)throw r;return Js(i,a.adminToken,t,r||n)}})}return Kt(e,xt)}function Kt(e,t=ji){return Pr({method:"POST",url:Fi(),data:JSON.stringify(e),timeoutMs:t})}function Dr(e){let t=new URL(Fi());for(let[i,a]of Object.entries(e||{}))a!=null&&a!==""&&t.searchParams.set(i,String(a));return Pr({method:"GET",url:t.toString()})}function Pr({method:e,url:t,data:i,timeoutMs:a=ji}){return new Promise((n,r)=>{GM_xmlhttpRequest({method:e,url:t,headers:e==="POST"?{"Content-Type":"text/plain;charset=UTF-8"}:void 0,data:i,timeout:a,onload(l){let s;try{s=JSON.parse(l.responseText||"{}")}catch{let d=new Error(`伺服器回傳無效資料（HTTP ${l.status}）。`);d.apiStatus=Number(l.status)||0,r(d);return}if(l.status<200||l.status>=300||!s.ok){let c=new Error(s.error||`伺服器回傳 HTTP ${l.status}。`);c.apiStatus=Number(l.status)||0,c.isApiResponse=!0,r(c);return}n(s)},onerror(){r(new Error("無法連線到工會資料服務。"))},ontimeout(){r(new Error(a===xt?"會員資料讀取逾時，請稍候再試。":"工會資料服務連線逾時。"))}})})}async function Ks(e,t){for(let i=0;i<5;i+=1){await rn(350*(i+1));try{let a=await Dr({action:"uploadResult",requestId:e});if(!a.pending)return a}catch(a){if(a&&a.isApiResponse)throw a}}throw t||new Error("無法確認上傳結果，請稍後再試。")}async function Js(e,t,i,a){for(let r=0;r<5;r+=1){await rn(450*(r+1));try{let l=await Kt({action:"adminActionResult",adminToken:t,requestId:e,originalAction:i},xt);if(!l.pending)return l}catch(l){if(l&&l.isApiResponse)throw l}}let n=new Error("伺服器可能已完成操作，但目前無法確認結果；請先重新整理管理員資料，避免重複發布。");throw n.cause=a,n}function nn(){return typeof crypto<"u"&&typeof crypto.randomUUID=="function"?crypto.randomUUID():`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`}function rn(e){return new Promise(t=>window.setTimeout(t,e))}function Fi(){let t=String(GM_getValue(we,"")||"").trim()||re;if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(t))throw new Error("尚未設定 Google Apps Script Web App 網址。");return t}function Jt(){try{return Fi(),!0}catch{return!1}}function on(e=o.character?.id){return`${Ie}${e||"unknown"}`}function _t(e=o.character?.id){return e?String(GM_getValue(on(e),"")||""):""}function Yt(){let e=String(GM_getValue(wt,"")||"").trim();if(e)return e;let t="";if(globalThis.crypto&&typeof globalThis.crypto.randomUUID=="function")t=globalThis.crypto.randomUUID();else if(globalThis.crypto&&typeof globalThis.crypto.getRandomValues=="function"){let i=new Uint8Array(16);globalThis.crypto.getRandomValues(i),t=[...i].map(a=>a.toString(16).padStart(2,"0")).join("")}else t=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;return GM_setValue(wt,t),t}function $r(e){return String(e||"").replace(/[^a-z0-9]/gi,"").toUpperCase().slice(-8)||"UNKNOWN"}function Xt(){let e=navigator.userAgent||"",t=navigator.userAgentData&&navigator.userAgentData.platform?navigator.userAgentData.platform:navigator.platform||"",i=/Edg\//.test(e)?"Edge":/Firefox\//.test(e)?"Firefox":/CriOS\//.test(e)||/Chrome\//.test(e)?"Chrome":/Safari\//.test(e)?"Safari":"瀏覽器";return`${/iPhone/i.test(e)?"iPhone":/iPad/i.test(e)?"iPad":/Android/i.test(e)?"Android":/Windows/i.test(t)||/Windows/i.test(e)?"Windows":/Mac/i.test(t)||/Macintosh/i.test(e)?"Mac":"裝置"} ${i}`}function Ys(e){return Object.values(Ni(e)).map(t=>{let i=String(t.itemHrid||t.hrid||""),a=xa(i)||{},n=String(t.slotHrid||t.slot||Gn(i,"")||"");return{...t,itemHrid:i,slotHrid:n,name:U(i,t.name||a.name||i.split("/").pop()||"未知裝備"),itemLevel:Number(t.itemLevel||a.itemLevel)||0,enhancementLevel:Number(t.enhancementLevel)||0}}).filter(t=>t.itemHrid&&!Tt.has(t.slotHrid))}function Xs(e,t){let i=t==="ability",a=Array.isArray(i?e.abilities:e.skills)?i?e.abilities:e.skills:[],n=(Array.isArray(e.skillSlots)?e.skillSlots:[]).filter(s=>{let c=typeof s=="string"?s:String(s&&(s.abilityHrid||s.skillHrid||s.hrid)||"");return i?c.startsWith("/abilities/"):c.startsWith("/skills/")}),r=[...a,...n,...i?e.abilityHrids:e.skillHrids];!i&&!r.length&&String(e.trialHrid||"").startsWith("/guild_skilling/")&&r.push(String(e.trialHrid).replace("/guild_skilling/","/skills/"));let l=new Map;return r.forEach(s=>{let c=typeof s=="string"?{[i?"abilityHrid":"skillHrid"]:s}:s;if(!c||typeof c!="object")return;let d=String(i?c.abilityHrid||c.skillHrid||c.hrid||"":c.skillHrid||c.abilityHrid||c.hrid||"");if(!d)return;let u=W(i?o.abilityDetailMap:o.skillDetailMap,d),f=i?o.allAbilities.get(d)?.level:o.allSkills.get(d)?.level;l.set(d,{...c,[i?"abilityHrid":"skillHrid"]:d,name:U(d,c.name||u?.name||d.split("/").pop()),level:Number(c.level??f)||0,combatActionHrid:String(c.combatActionHrid||u?.combatActionHrid||d)})}),[...l.values()].slice(0,me)}function Or(e,t,i,a){if(!i.length)return;let n=document.createElement("div");n.className="mwi-member-plan-label",n.textContent=t;let r=document.createElement("div");r.className="mwi-member-plan-grid",i.forEach(l=>{let s=document.createElement("div");s.className="mwi-member-plan-item";let c=String(l.itemHrid||l.abilityHrid||l.skillHrid||""),d=a==="ability"?String(l.combatActionHrid||c):c,u=U(c,l.name);s.appendChild(Ht(a,d,u));let f=document.createElement("div");f.textContent=u;let p=document.createElement("div");if(p.className="level",a==="item"){let _=ii[l.slotHrid]||String(l.slotHrid||"").split("/").pop()||"裝備";p.textContent=`${_}${l.enhancementLevel?`｜+${l.enhancementLevel}`:""}`}else p.textContent=`Lv.${Number(l.level)||0}`;s.append(f,p),r.appendChild(s)}),e.append(n,r)}function Qs(e,t,i,a={}){m.resultPanel.replaceChildren(),m.resultPanel.hidden=!1;let n=document.createElement("div");n.className="mwi-result-head";let r=document.createElement("h3");r.className="mwi-result-title",r.textContent=e;let l=document.createElement("span");if(l.className="mwi-result-week",l.textContent=`週次：${t||"未知"}`,n.append(r,l),Object.prototype.hasOwnProperty.call(a,"nextTrialAt")){let s=document.createElement("span");s.className="mwi-trial-time",s.textContent=a.nextTrialAt?`下次試煉：${qr(a.nextTrialAt)}`:"下次試煉：管理員尚未設定",n.appendChild(s)}if(m.resultPanel.appendChild(n),!i.length){let s=document.createElement("div");s.textContent="目前沒有已發布的配置。",m.resultPanel.appendChild(s);return}for(let s of i){let c=document.createElement("div");if(c.className="mwi-assignment",s.kind==="notice"){let y=document.createElement("strong");y.textContent=`📢 ${s.skillName||"公會公告"}`;let x=document.createElement("div");x.textContent=s.note||"",x.style.whiteSpace="pre-wrap",c.append(y,x),m.resultPanel.appendChild(c);continue}if(s.kind==="plan"){let y=Ve(s.planType||s.trialType);c.classList.add(y===g.BATTLE?"mwi-member-plan-battle":"mwi-member-plan-life");let x=document.createElement("strong");x.textContent=y===g.LIFE?"生活試煉選擇":`戰鬥指定方案：${s.name||s.group||"未命名方案"}`;let E=document.createElement("div");E.className="mwi-member-plan-summary";let v=document.createElement("span");if(v.className="mwi-member-plan-trial",v.textContent=`${y===g.BATTLE?"戰鬥試煉":"生活試煉"}：${s.trialName||Te(s.trialHrid)}`,E.appendChild(v),s.note){let C=document.createElement("span");C.textContent=`備註：${s.note}`,E.appendChild(C)}if(c.append(x,E),y===g.LIFE){m.resultPanel.appendChild(c);continue}let T=Ys(s);Or(c,y===g.BATTLE?"整套戰鬥裝備（含武器）":"生活裝備／工具",T,"item");let S=Xs(s,y===g.BATTLE?"ability":"skill");Or(c,y===g.BATTLE?"指定戰鬥技能":"指定生活技能",S,y===g.BATTLE?"ability":"skill"),m.resultPanel.appendChild(c);continue}let d=s.characterName?`${s.characterName}｜`:"",u=s.trialType==="battle"?"戰鬥試煉":"生活試煉",f=s.skillName||s.skillHrid||"未指定技能",p=Number(s.level)>0?` Lv.${s.level}`:"",_=s.note?`｜${s.note}`:"",h=document.createElement("strong");h.textContent=`${d}${u}｜${s.group||"未命名分組"}`;let b=document.createElement("div");if(b.textContent=`${f}${p}${_}`,c.append(h,b),s.trialHrid){let y=document.createElement("div");y.textContent=`試煉 ID：${s.trialHrid}`,y.style.cssText="margin-top:3px;color:#f3c969;font:600 11px/1.3 monospace;word-break:break-all;",c.appendChild(y)}m.resultPanel.appendChild(c)}}function Zs(e,t){m.resultPanel.replaceChildren(),m.resultPanel.hidden=!1;let i=document.createElement("h3");i.className="mwi-result-title",i.textContent=e,m.resultPanel.appendChild(i);for(let a of t){let n=document.createElement("div");n.textContent=a,m.resultPanel.appendChild(n)}}function ec(e){let t={confirmedAt:e.confirmedAt,scriptVersion:$},i=tc(e.character?.id),a=JSON.stringify(t);try{localStorage.setItem(i,a)}catch{try{localStorage.removeItem(i),localStorage.setItem(i,a)}catch{}}}function tc(e=o.character?.id){return`${le}${e||"unknown"}`}function ln(e){let t=new Date(e);return Number.isNaN(t.getTime())?String(e):t.toLocaleString(Fe,{hour12:!1})}function qr(e){let t=new Date(e);return Number.isNaN(t.getTime())?String(e||""):t.toLocaleString(Fe,{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hour12:!1})}})();})();
