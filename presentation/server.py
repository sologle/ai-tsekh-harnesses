#!/usr/bin/env python3
"""Small no-dependency server with SPA route fallback for the presentation."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
APP_ROUTES = {"/", "/lesson/1", "/lesson/2", "/lesson/3", "/lesson/4", "/sources", "/matrix"}


class PresentationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802 - stdlib API
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in APP_ROUTES:
            self.path = "/index.html"
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve the AI-harnesses presentation")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), PresentationHandler)
    print(f"Presentation: http://{args.host}:{args.port}")
    print("Presenter mode: add ?present=1")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
