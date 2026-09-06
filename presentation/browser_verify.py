#!/usr/bin/env python3
"""Run the real browser acceptance pass with an installed Chromium-family browser.

No Python or Node packages are required. The page's internal self-test exercises all
34 final reveal states, deep links, reset, source drawer, keyboard navigation and
horizontal overflow. Chromium produces the required desktop/mobile PNG captures.
"""

from __future__ import annotations

import json
import shutil
import socket
import struct
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
BROWSER_NAMES = ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome")


def find_browser() -> str:
    for name in BROWSER_NAMES:
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError(f"No Chromium browser found in PATH ({', '.join(BROWSER_NAMES)})")


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_server(port: int, timeout: float = 8.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket() as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise RuntimeError("Presentation server did not become ready")


def chrome_base(browser: str, width: int, height: int) -> list[str]:
    return [
        browser,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=10000",
        f"--window-size={width},{height}",
    ]


def run_browser(command: list[str], timeout: int = 35) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=False)


def png_size(path: Path) -> tuple[int, int]:
    raw = path.read_bytes()[:24]
    if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"Not a PNG: {path}")
    return struct.unpack(">II", raw[16:24])


def self_test(browser: str, origin: str, width: int, height: int) -> dict:
    url = f"{origin}/lesson/1?present=1&selftest=1#P1-01"
    result = run_browser(chrome_base(browser, width, height) + ["--dump-dom", url])
    if result.returncode != 0:
        raise RuntimeError(f"Chromium self-test failed ({width}x{height}): {result.stderr[-1200:]}")
    if 'data-selftest="pass"' not in result.stdout:
        marker = "selftest-results"
        excerpt = result.stdout[result.stdout.find(marker) - 300:result.stdout.find(marker) + 1500] if marker in result.stdout else result.stdout[-1500:]
        raise RuntimeError(f"Browser assertions failed ({width}x{height}): {excerpt}")
    return {"viewport": f"{width}x{height}", "status": "pass", "domBytes": len(result.stdout.encode())}


def screenshot(browser: str, origin: str, path: Path, width: int, height: int, route: str) -> dict:
    url = f"{origin}{route}"
    result = run_browser(chrome_base(browser, width, height) + [f"--screenshot={path}", url])
    if result.returncode != 0 or not path.is_file():
        raise RuntimeError(f"Screenshot failed ({width}x{height}): {result.stderr[-1200:]}")
    actual = png_size(path)
    if actual != (width, height):
        raise RuntimeError(f"Screenshot dimension mismatch for {path.name}: expected {(width, height)}, got {actual}")
    return {"path": str(path.relative_to(ROOT)), "width": actual[0], "height": actual[1], "bytes": path.stat().st_size}


def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    structural = subprocess.run([sys.executable, str(ROOT / "verify.py")], cwd=ROOT, text=True, capture_output=True, check=False)
    if structural.returncode:
        print(structural.stdout, end="")
        print(structural.stderr, end="", file=sys.stderr)
        return structural.returncode

    try:
        browser = find_browser()
    except RuntimeError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2

    port = free_port()
    origin = f"http://127.0.0.1:{port}"
    server = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        wait_for_server(port)
        report = {
            "status": "pass",
            "browser": browser,
            "origin": origin,
            "structural": structural.stdout.strip().splitlines(),
            "selfTests": [self_test(browser, origin, 1920, 1080), self_test(browser, origin, 390, 844)],
            "screenshots": [
                screenshot(browser, origin, ARTIFACTS / "desktop-1920x1080.png", 1920, 1080, "/lesson/1?present=1&reveal=5#P1-02"),
                screenshot(browser, origin, ARTIFACTS / "mobile-390x844.png", 390, 844, "/lesson/4?reveal=8#P4-09"),
            ],
            "routes": ["/", "/lesson/1", "/lesson/2", "/lesson/3", "/lesson/4", "/sources"],
            "checked": ["34 final reveal states", "keyboard", "deep link", "reset", "source drawer", "runtime errors", "horizontal overflow", "PNG dimensions"],
        }
        report_path = ARTIFACTS / "browser-verification.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(structural.stdout, end="")
        print(f"PASS: browser self-test at 1920x1080 and 390x844 using {browser}")
        for shot in report["screenshots"]:
            print(f"PASS: {shot['path']} ({shot['width']}x{shot['height']}, {shot['bytes']} bytes)")
        print(f"PASS: {report_path.relative_to(ROOT)}")
        return 0
    except Exception as exc:  # noqa: BLE001 - acceptance runner reports the blocker
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    raise SystemExit(main())
