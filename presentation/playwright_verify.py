from __future__ import annotations
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
ART = ROOT / "artifacts"
ART.mkdir(exist_ok=True)
URL = "http://127.0.0.1:4173/lesson/1?present=1&selftest=1#P1-01"
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    for width, height, filename in [
        (1920, 1080, "desktop-1920x1080.png"),
        (1440, 900, None),
        (760, 900, None),
        (390, 844, "mobile-390x844.png"),
    ]:
        page = browser.new_page(viewport={"width": width, "height": height})
        errors = []
        page.on("console", lambda msg, errors=errors: errors.append(f"console:{msg.type}:{msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc, errors=errors: errors.append(f"pageerror:{exc}"))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(500)
        status = page.locator("body").get_attribute("data-selftest")
        payload = json.loads(page.locator("#selftest-results").inner_text()) if page.locator("#selftest-results").count() else {}
        if filename:
            page.screenshot(path=str(ART / filename), full_page=False)
        results.append({"viewport": f"{width}x{height}", "status": status, "selftest": payload, "runtimeErrors": errors, "screenshot": f"artifacts/{filename}" if filename else None})
        page.close()
    browser.close()
report = {"status": "pass" if all(r["status"] == "pass" and not r["runtimeErrors"] for r in results) else "fail", "engine": "Playwright Chromium 151", "results": results}
(ART / "browser-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report["status"] == "pass" else 1)
