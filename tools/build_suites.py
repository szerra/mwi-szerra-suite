from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor"
DIST = ROOT / "dist"
REPO_URL = "https://github.com/szerra/mwi-szerra-suite"
RAW_BASE = "https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


@dataclass(frozen=True)
class Module:
    module_id: str
    label: str
    vendor_name: str
    original_name: str
    source_url: str
    author: str
    version: str
    license_name: str
    phase: str = "idle"


@dataclass(frozen=True)
class Pack:
    pack_id: str
    output_name: str
    display_name: str
    description: str
    version: str
    license_name: str
    metadata: tuple[str, ...]
    modules: tuple[Module, ...]


COMBAT_MODULES = (
    Module(
        "combat-vfx",
        "戰鬥技能特效",
        "combat-vfx.user.js",
        "MWI 戰鬥技能特效.user.js",
        "https://github.com/szerra/mwi-combat-vfx",
        "Local build for gzerr",
        "0.1.12",
        "MIT",
        "start",
    ),
    Module(
        "level-time",
        "戰鬥升級所需時間",
        "combat-level-time.user.js",
        "[银河奶牛]显示战斗升级所需时间.user.js",
        "https://greasyfork.org/scripts/556360",
        "DOUBAO-DiamondMoo",
        "1.4",
        "MIT",
    ),
    Module(
        "realtime-simulator",
        "戰鬥模擬即時匯入",
        "realtime-simulator.user.js",
        "[MWI] Realtime Import Of Battle Simulation.user.js",
        "https://greasyfork.org/scripts/539672",
        "Yannis",
        "0.3.6",
        "CC-BY-NC-SA-4.0",
    ),
    Module(
        "luck-stats",
        "掉落與運氣統計",
        "luck-stats.user.js",
        "[银河奶牛]康康运气_修复.user.js",
        "https://greasyfork.org/scripts/546427",
        "Weierstras@www.milkywayidle.com",
        "0.1.34",
        "MIT",
    ),
    Module(
        "battle-hud",
        "戰鬥 HUD",
        "battle-hud.user.js",
        "MWI Battle HUD.user.js",
        "https://greasyfork.org/scripts/582499",
        "mortymorty",
        "0.3.17",
        "MIT",
    ),
)


MARKET_MODULES = (
    Module(
        "market-mate",
        "市場伴侶",
        "market-mate.user.js",
        "MWI 市场伴侣.user.js",
        "https://greasyfork.org/scripts/567386",
        "ColaCola",
        "2.3.0",
        "MIT",
        "start",
    ),
    Module(
        "profit-panel",
        "收益面板",
        "profit-panel.user.js",
        "MWI Profit Panel.user.js",
        "https://greasyfork.org/scripts/536724",
        "MengLan",
        "2026.04.29",
        "MIT",
    ),
)


CHARACTER_MODULES = (
    Module(
        "equipment-sync",
        "裝備資料同步",
        "equipment-sync.user.js",
        "[银河奶牛]装备数据同步.user.js",
        "https://greasyfork.org/scripts/574037",
        "Sunrishe",
        "1.2.7",
        "MIT",
        "body",
    ),
    Module(
        "talent-market",
        "Talent Market",
        "talent-market.user.js",
        "[MWI]Talent Market.user.js",
        "https://greasyfork.org/scripts/559347",
        "SHIIN",
        "1.5.6",
        "CC-BY-NC-SA-4.0",
    ),
    Module(
        "character-card",
        "角色名片",
        "character-card.user.js",
        "MWI角色名片插件.user.js",
        "https://greasyfork.org/scripts/543862",
        "Windoge",
        "1.7.0",
        "MIT",
    ),
    Module(
        "skill-requirements",
        "技能需求提示",
        "skill-requirements.user.js",
        "MWI QoL 技能需求.user.js",
        "https://greasyfork.org/scripts/532227",
        "GodofTheFallen, AlexZaw",
        "1.2.0",
        "MIT",
    ),
)


PACKS = (
    Pack(
        "combat",
        "MWI-Szerra-Combat-Suite.user.js",
        "MWI Szerra 戰鬥資訊包",
        "整合戰鬥 HUD、升級時間、模擬器匯入、掉落統計與戰鬥特效；可從 Tampermonkey 選單逐項開關。",
    "1.0.5",
        "CC-BY-NC-SA-4.0",
        (
            "// @match        https://www.milkywayidle.com/*",
            "// @match        https://test.milkywayidle.com/*",
            "// @match        https://www.milkywayidlecn.com/*",
            "// @match        https://test.milkywayidlecn.com/*",
            "// @match        https://*/MWICombatSimulatorTest/*",
            "// @run-at       document-start",
            "// @grant        GM_addStyle",
            "// @grant        GM_xmlhttpRequest",
            "// @grant        GM_getValue",
            "// @grant        GM_setValue",
            "// @grant        GM_registerMenuCommand",
            "// @connect      textdb.online",
            "// @connect      raw.githubusercontent.com",
            "// @require      https://cdnjs.cloudflare.com/ajax/libs/blueimp-md5/2.19.0/js/md5.min.js",
            "// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js",
            "// @require      https://cdn.jsdelivr.net/npm/ml-fft@1.3.5/dist/ml-fft.min.js",
            "// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js",
        ),
        COMBAT_MODULES,
    ),
    Pack(
        "market",
        "MWI-Szerra-Market-Suite.user.js",
        "MWI Szerra 市場工具包",
        "整合材料購物清單、市場高亮與收益面板；價格歷史由獨立的 mooket II 提供。",
        "1.0.0",
        "MIT",
        (
            "// @match        https://www.milkywayidle.com/*",
            "// @match        https://milkywayidle.com/*",
            "// @match        https://test.milkywayidle.com/*",
            "// @match        https://www.milkywayidlecn.com/*",
            "// @match        https://milkywayidlecn.com/*",
            "// @match        https://test.milkywayidlecn.com/*",
            "// @run-at       document-start",
            "// @grant        GM_addStyle",
            "// @grant        GM_getResourceText",
            "// @grant        GM_xmlhttpRequest",
            "// @grant        GM_setValue",
            "// @grant        GM_getValue",
            "// @grant        GM_registerMenuCommand",
            "// @grant        unsafeWindow",
            "// @connect      raw.githubusercontent.com",
            "// @connect      ghproxy.net",
            "// @connect      mooket.qi-e.top",
            "// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js",
            "// @resource     bootstrapCSS https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
        ),
        MARKET_MODULES,
    ),
    Pack(
        "character",
        "MWI-Szerra-Character-Suite.user.js",
        "MWI Szerra 角色資訊包",
        "整合 Talent Market、裝備同步、角色名片與技能需求提示；可從 Tampermonkey 選單逐項開關。",
        "1.0.0",
        "CC-BY-NC-SA-4.0",
        (
            "// @match        https://www.milkywayidle.com/*",
            "// @match        https://www.milkywayidlecn.com/*",
            "// @match        https://test.milkywayidle.com/*",
            "// @match        https://test.milkywayidlecn.com/*",
            "// @match        https://papiyas.chat/*",
            "// @match        https://shykai.github.io/MWICombatSimulatorTest/*",
            "// @match        https://amvoidguy.github.io/MWICombatSimulatorTest/*",
            "// @match        https://milkonomy.pages.dev/*",
            "// @match        https://hyhfish.github.io/milkonomy/*",
            "// @run-at       document-start",
            "// @grant        GM_addStyle",
            "// @grant        GM_getValue",
            "// @grant        GM_setValue",
            "// @grant        GM_info",
            "// @grant        GM_xmlhttpRequest",
            "// @grant        GM_getResourceText",
            "// @grant        GM_setClipboard",
            "// @grant        GM_addValueChangeListener",
            "// @grant        GM_registerMenuCommand",
            "// @grant        unsafeWindow",
            "// @connect      papiyas.chat",
            "// @connect      tupian.li",
            "// @connect      www.milkywayidle.com",
            "// @connect      www.milkywayidlecn.com",
            "// @require      https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js",
            "// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.js",
            "// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
            "// @resource     cardStyles https://papiyas.chat/static/js/mwi-card-styles.css?v=1.5.2",
        ),
        CHARACTER_MODULES,
    ),
)


METADATA_RE = re.compile(
    r"^\ufeff?\s*// ==UserScript==.*?// ==/UserScript==\s*",
    flags=re.DOTALL,
)

ANTI_LOOP_RE = re.compile(
    r"Object\.defineProperty\(this,\s*(?P<q>[\"'])data(?P=q),\s*"
    r"\{\s*value\s*:\s*message\s*\}\s*\)",
    flags=re.DOTALL,
)

DATA_DEFINE_RE = re.compile(
    r"Object\.defineProperty\(this,\s*(?P<q>[\"'])data(?P=q),\s*"
    r"\{(?P<body>.*?)\}\s*\)",
    flags=re.DOTALL,
)


def strip_metadata(text: str, source: Path) -> str:
    cleaned, count = METADATA_RE.subn("", text, count=1)
    if count != 1:
        raise RuntimeError(f"Cannot locate userscript metadata in {source}")
    return cleaned.strip() + "\n"


def patch_websocket_anti_loop(text: str) -> tuple[str, int]:
    replacement = 'Object.defineProperty(this, "data", { value: message, configurable: true })'
    patched, count = ANTI_LOOP_RE.subn(replacement, text)
    return patched, count


def validate_data_definitions(text: str, source: Path) -> None:
    for match in DATA_DEFINE_RE.finditer(text):
        body = match.group("body")
        if "value" in body and "configurable" not in body:
            line = text.count("\n", 0, match.start()) + 1
            raise RuntimeError(
                f"Unsafe MessageEvent.data instance definition remains in {source}:{line}"
            )


def import_vendor(source_root: Path) -> None:
    VENDOR.mkdir(parents=True, exist_ok=True)
    for pack in PACKS:
        for module in pack.modules:
            source = source_root / module.original_name
            target = VENDOR / module.vendor_name
            if not source.is_file():
                raise FileNotFoundError(source)
            shutil.copy2(source, target)
            print(f"Imported {source.name} -> vendor/{target.name}")


def metadata_header(pack: Pack) -> str:
    lines = [
        "// ==UserScript==",
        f"// @name         {pack.display_name}",
        "// @namespace    https://github.com/szerra/mwi-szerra-suite",
        f"// @version      {pack.version}",
        f"// @description  {pack.description}",
        "// @author       Szerra integration; see THIRD_PARTY_NOTICES.md",
        f"// @license      {pack.license_name}",
        "// @icon         https://www.milkywayidle.com/favicon.svg",
        f"// @homepageURL  {REPO_URL}",
        f"// @supportURL   {REPO_URL}/issues",
        f"// @updateURL    {RAW_BASE}/{pack.output_name}",
        f"// @downloadURL  {RAW_BASE}/{pack.output_name}",
        *pack.metadata,
        "// ==/UserScript==",
        "",
    ]
    return "\n".join(lines)


def runtime_prelude(pack: Pack) -> str:
    module_defaults = ",\n".join(
        f'      "{module.module_id}": true' for module in pack.modules
    )
    menu_items = ",\n".join(
        f'      {{ id: "{module.module_id}", label: "{module.label}" }}'
        for module in pack.modules
    )
    return f'''(() => {{
  "use strict";

  const __MWISzerraSuite = (() => {{
    const packId = "{pack.pack_id}";
    const storageKey = `mwi.szerra.suite.${{packId}}.modules.v1`;
    const defaults = {{
{module_defaults}
    }};
    const menuItems = [
{menu_items}
    ];
    let saved = {{}};
    try {{
      saved = GM_getValue(storageKey, {{}}) || {{}};
    }} catch (error) {{
      console.warn(`[MWI Szerra ${{packId}}] 無法讀取模組設定`, error);
    }}
    const state = {{ ...defaults, ...saved }};

    function save() {{
      try {{
        GM_setValue(storageKey, state);
      }} catch (error) {{
        console.warn(`[MWI Szerra ${{packId}}] 無法儲存模組設定`, error);
      }}
    }}

    function registerMenus() {{
      if (typeof GM_registerMenuCommand !== "function") return;
      for (const item of menuItems) {{
        const enabled = state[item.id] !== false;
        const label = `${{enabled ? "✅" : "⛔"}} ${{item.label}}（點擊${{enabled ? "停用" : "啟用"}}）`;
        GM_registerMenuCommand(label, () => {{
          state[item.id] = !enabled;
          save();
          window.location.reload();
        }});
      }}
    }}

    function execute(id, label, factory) {{
      try {{
        factory();
        console.info(`[MWI Szerra ${{packId}}] 已啟動：${{label}}`);
      }} catch (error) {{
        console.error(`[MWI Szerra ${{packId}}] 模組啟動失敗：${{label}}`, error);
      }}
    }}

    function whenBodyReady(callback) {{
      if (document.body) {{
        callback();
        return;
      }}
      const observer = new MutationObserver(() => {{
        if (!document.body) return;
        observer.disconnect();
        callback();
      }});
      observer.observe(document.documentElement || document, {{ childList: true, subtree: true }});
    }}

    function whenIdle(callback) {{
      if (document.readyState === "loading") {{
        document.addEventListener("DOMContentLoaded", callback, {{ once: true }});
      }} else {{
        setTimeout(callback, 0);
      }}
    }}

    function run(id, label, phase, factory) {{
      if (state[id] === false) {{
        console.info(`[MWI Szerra ${{packId}}] 已停用：${{label}}`);
        return;
      }}
      const callback = () => execute(id, label, factory);
      if (phase === "start") callback();
      else if (phase === "body") whenBodyReady(callback);
      else whenIdle(callback);
    }}

    registerMenus();
    return {{ run }};
  }})();

'''


def module_block(module: Module) -> str:
    source = VENDOR / module.vendor_name
    text = source.read_text(encoding="utf-8-sig")
    body = strip_metadata(text, source)
    body, patch_count = patch_websocket_anti_loop(body)
    validate_data_definitions(body, source)
    indented = "\n".join("    " + line for line in body.rstrip().splitlines())
    return f'''  // ---------------------------------------------------------------------------
  // Module: {module.label}
  // Original: {module.original_name} v{module.version}
  // Author: {module.author}
  // License: {module.license_name}
  // Source: {module.source_url}
  // WebSocket compatibility patches: {patch_count}
  // ---------------------------------------------------------------------------
  __MWISzerraSuite.run("{module.module_id}", "{module.label}", "{module.phase}", () => {{
{indented}
  }});

'''


def build_pack(pack: Pack) -> Path:
    for module in pack.modules:
        source = VENDOR / module.vendor_name
        if not source.is_file():
            raise FileNotFoundError(
                f"Missing {source}. Run with --import-from <Tampermonkey scripts folder>."
            )
    output = metadata_header(pack) + runtime_prelude(pack)
    output += "".join(module_block(module) for module in pack.modules)
    output += "})();\n"
    DIST.mkdir(parents=True, exist_ok=True)
    target = DIST / pack.output_name
    target.write_text(output, encoding="utf-8", newline="\n")
    print(f"Built dist/{target.name} ({target.stat().st_size:,} bytes)")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MWI Szerra userscript suites")
    parser.add_argument(
        "--import-from",
        type=Path,
        help="Folder containing the exported Tampermonkey .user.js source files",
    )
    args = parser.parse_args()
    if args.import_from:
        import_vendor(args.import_from.resolve())
    for pack in PACKS:
        build_pack(pack)


if __name__ == "__main__":
    main()
