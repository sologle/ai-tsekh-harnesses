#!/usr/bin/env python3
"""Structural verification for the presentation implementation."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "presentation.json"
MODULE_ROOT = ROOT.parents[1]
EXPECTED = {
    *(f"P1-{n:02d}" for n in range(1, 9)),
    *(f"P2-{n:02d}" for n in range(1, 9)),
    *(f"P3-{n:02d}" for n in range(1, 10)),
    *(f"P4-{n:02d}" for n in range(1, 10)),
}
SCENE_MAX = {1: 19, 2: 18, 3: 29, 4: 28}
errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


for required in ("index.html", "styles.css", "app.js", "server.py", "browser_verify.py", "README.md"):
    if not (ROOT / required).is_file():
        fail(f"missing file: {required}")

try:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
except Exception as exc:  # noqa: BLE001 - validator should aggregate load failure
    print(f"FAIL: cannot load {DATA}: {exc}")
    sys.exit(1)

sources = payload.get("sources", {})
screens = [screen for lesson in payload.get("lessons", []) for screen in lesson.get("screens", [])]
ids = [screen.get("id") for screen in screens]
covered_flows = {lesson: set() for lesson in SCENE_MAX}
if len(ids) != len(set(ids)):
    fail("duplicate screen IDs")
if set(ids) != EXPECTED:
    fail(f"screen ID contract mismatch: missing={sorted(EXPECTED - set(ids))}, extra={sorted(set(ids) - EXPECTED)}")
if len(payload.get("lessons", [])) != 4:
    fail("expected four lessons")

for screen in screens:
    sid = screen.get("id", "<unknown>")
    for field in ("lesson", "title", "micro", "lead", "component", "content", "reveals", "sources", "sceneRefs", "presenterNotes", "fallbackAssets", "freshness"):
        if field not in screen or screen[field] in (None, "", []):
            fail(f"{sid}: missing {field}")
    title = screen.get("title", "")
    if len(title.split()) < 3:
        fail(f"{sid}: title looks like a topic label: {title!r}")
    if not screen.get("sources"):
        fail(f"{sid}: no sources")
    for source_id in screen.get("sources", []):
        if source_id not in sources:
            fail(f"{sid}: unknown source {source_id}")
    if not screen.get("fallbackAssets"):
        fail(f"{sid}: no deterministic fallback")
    for ref in screen.get("sceneRefs", []):
        match = re.fullmatch(r"L([1-4])-F(\d{2})", ref)
        if not match:
            fail(f"{sid}: invalid scene ref {ref}")
            continue
        lesson, flow = map(int, match.groups())
        if lesson != screen.get("lesson") or not 1 <= flow <= SCENE_MAX[lesson]:
            fail(f"{sid}: scene ref outside lesson flow: {ref}")
            continue
        covered_flows[lesson].add(flow)
        script_path = MODULE_ROOT / "production" / f"lesson-{lesson:02d}" / "script.md"
        if not script_path.is_file() or f"· {flow} |" not in script_path.read_text(encoding="utf-8"):
            fail(f"{sid}: scene ref not found in source script: {ref}")
    notes = screen.get("presenterNotes", {})
    for key in ("cue", "next", "fallback", "risk"):
        if not notes.get(key):
            fail(f"{sid}: incomplete presenterNotes.{key}")

for lesson, maximum in SCENE_MAX.items():
    expected_flows = set(range(1, maximum + 1))
    if covered_flows[lesson] != expected_flows:
        fail(f"lesson {lesson}: scene coverage mismatch; missing={sorted(expected_flows - covered_flows[lesson])}")

for source_id, source in sources.items():
    for field in ("title", "url", "checkedAt", "claim", "confidence", "kind"):
        if not source.get(field):
            fail(f"{source_id}: missing {field}")
    url = source.get("url", "")
    if url.startswith("http") and urlparse(url).scheme not in {"http", "https"}:
        fail(f"{source_id}: bad URL")

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = (ROOT / "app.js").read_text(encoding="utf-8") if (ROOT / "app.js").exists() else ""
css = (ROOT / "styles.css").read_text(encoding="utf-8") if (ROOT / "styles.css").exists() else ""
for route in ("/lesson/1", "/lesson/2", "/lesson/3", "/lesson/4", "/sources"):
    if route not in html and route not in js:
        fail(f"route not represented: {route}")
for key in ("ArrowRight", "PageDown", "ArrowUp", "PageUp", "Home", "End"):
    if key not in js:
        fail(f"keyboard binding absent: {key}")
if "prefers-reduced-motion" not in css:
    fail("reduced motion CSS absent")
if "overflow-x: hidden" not in css:
    fail("page-level overflow guard absent")
if re.search(r"https?://[^\"']+\.(?:js|css)", html + js, re.I):
    fail("runtime CDN dependency detected")

if errors:
    print(f"FAIL: {len(errors)} issue(s)")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print(f"PASS: {len(screens)} screens, {len(sources)} sources, 4 lessons")
print("PASS: routes, keyboard contract, scene refs, fallbacks, reduced motion, offline assets")
