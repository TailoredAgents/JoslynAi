from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable

from src.metrics import metrics as global_metrics
from src.state import WorkerState


class _Handler(BaseHTTPRequestHandler):
    state: WorkerState
    metrics_supplier: Callable[[], dict]

    # Silence default logging to stderr; operational logs use JSON elsewhere
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            summary = self.state.health()
            body = json.dumps(
                {
                    **summary.as_dict(),
                    "state": self.state.snapshot(),
                }
            ).encode("utf-8")
            self.send_response(200 if summary.ok else 503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/metrics":
            metrics_snapshot = self.metrics_supplier()
            body = json.dumps(metrics_snapshot).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(404)
        self.end_headers()


def start_health_server(state: WorkerState, *, port: int | None = None) -> None:
    actual_port = port or int(os.getenv("PORT", "9090"))
    handler = type(
        "HealthHandler",
        (_Handler,),
        {
            "state": state,
            "metrics_supplier": staticmethod(global_metrics.snapshot),
        },
    )
    server = HTTPServer(("0.0.0.0", actual_port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Health server listening on :{actual_port}")
