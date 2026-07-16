from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

EXPECTED = {
    "MWI-Szerra-Combat-Suite.user.js": {
        "modules": 5,
        "license": "CC-BY-NC-SA-4.0",
    },
    "MWI-Szerra-Market-Suite.user.js": {
        "modules": 2,
        "license": "MIT",
    },
    "MWI-Szerra-Character-Suite.user.js": {
        "modules": 4,
        "license": "CC-BY-NC-SA-4.0",
    },
    "MWI-Edible-Tools-TW.user.js": {
        "modules": 0,
        "license": "CC-BY-NC-SA-4.0",
    },
}

FORBIDDEN = (
    "script.google.com",
    "docs.google.com",
    "1-wh0tK3",
    "233068",
    "Galactic Matador",
    "MWI 工會資料與試煉配置",
    "[GM 專用] MWI 公會上傳狀態",
)

DATA_DEFINE_RE = re.compile(
    r"Object\.defineProperty\(this,\s*(?P<q>[\"'])data(?P=q),\s*"
    r"\{(?P<body>.*?)\}\s*\)",
    flags=re.DOTALL,
)


def metadata(text: str) -> str:
    match = re.search(
        r"// ==UserScript==(?P<body>.*?)// ==/UserScript==",
        text,
        flags=re.DOTALL,
    )
    if not match:
        raise AssertionError("missing userscript metadata")
    return match.group("body")


def values(meta: str, key: str) -> list[str]:
    return re.findall(rf"^// @{re.escape(key)}\s+(.+?)\s*$", meta, flags=re.MULTILINE)


def validate_file(path: Path, expected: dict[str, object]) -> None:
    text = path.read_text(encoding="utf-8")
    meta = metadata(text)

    module_count = text.count("  // Module: ")
    assert module_count == expected["modules"], (
        f"{path.name}: expected {expected['modules']} modules, got {module_count}"
    )

    licenses = values(meta, "license")
    assert licenses == [expected["license"]], f"{path.name}: wrong license {licenses}"

    expected_raw = (
        "https://raw.githubusercontent.com/szerra/mwi-szerra-suite/main/dist/"
        + path.name
    )
    assert values(meta, "updateURL") == [expected_raw], f"{path.name}: wrong update URL"
    assert values(meta, "downloadURL") == [expected_raw], f"{path.name}: wrong download URL"

    for key in ("grant", "require", "resource", "connect", "match"):
        entries = values(meta, key)
        assert len(entries) == len(set(entries)), f"{path.name}: duplicate @{key} entries"

    assert "GM_registerMenuCommand" in values(meta, "grant"), (
        f"{path.name}: missing module-menu grant"
    )

    for token in FORBIDDEN:
        assert token not in text, f"{path.name}: private token found: {token}"

    for match in DATA_DEFINE_RE.finditer(text):
        body = match.group("body")
        if "value" in body:
            assert "configurable" in body, (
                f"{path.name}: non-configurable MessageEvent.data definition remains"
            )

    print(f"PASS {path.name}: {module_count} modules")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    for name, expected in EXPECTED.items():
        path = DIST / name
        assert path.is_file(), f"missing {path}"
        validate_file(path, expected)
    unexpected = {p.name for p in DIST.glob("*.user.js")} - set(EXPECTED)
    assert not unexpected, f"unexpected suite files: {sorted(unexpected)}"
    print("All suite validations passed.")


if __name__ == "__main__":
    main()
