#!/usr/bin/env python3
"""
Nelko P21 print-server.

One process that BOTH serves the built web app and bridges a WebSocket to the
printer's Bluetooth Classic (RFCOMM/SPP) socket — so a desktop/homelab Docker
container needs no separate "bridge" script. Run it wherever the printer is in
Bluetooth range; open the served page and print.

Routes:
    GET  /              -> static SPA from dist/ (vite build, base './')
    GET  /api/health    -> {"bt": bool, "mac": str|null, "connected": bool}
    WS   /bt            -> raw byte pipe to the printer (only when BT enabled)

The printer accepts a single RFCOMM connection at a time, so the server holds
ONE persistent socket and reuses it across WebSocket sessions. A new client
supersedes the previous one; the socket is dropped only on printer EOF/error or
after an idle period. This avoids the "[Errno 16] Device or resource busy" loop
caused by reconnecting while a prior link is still being torn down.

Environment:
    PORT        listen port              (default 8080)
    HOST        bind address             (default 0.0.0.0)
    BT          on|off                   (default on)
    P21_MAC     printer MAC address      (auto-detected from BlueZ if unset)
    STATIC_DIR  path to the built dist/  (default ../app/dist next to this file)
"""
import asyncio
import errno
import os
import socket
import subprocess
import sys
from pathlib import Path

from aiohttp import WSMsgType, web

SPP_CHANNEL = 1
EBUSY_RETRIES = 6
IDLE_CLOSE_S = 120
# Client close code meaning "really disconnect the printer" (vs a transient
# WebSocket drop such as a page refresh, where we keep the socket for reuse).
RELEASE_CODE = 4001
HERE = Path(__file__).resolve().parent
DEFAULT_STATIC = HERE.parent / "app" / "dist"


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "on", "yes")


def find_p21() -> str | None:
    """Resolve the printer MAC: explicit env, then BlueZ (bluetoothctl), then a
    scan of the BlueZ state dir (mount /var/lib/bluetooth read-only)."""
    mac = os.environ.get("P21_MAC")
    if mac:
        return mac.strip()

    try:
        out = subprocess.run(
            ["bluetoothctl", "devices"], capture_output=True, text=True, timeout=3
        ).stdout
        for line in out.splitlines():
            parts = line.split()
            if (
                len(parts) >= 3
                and parts[0] == "Device"
                and parts[1].count(":") == 5
                and "P21" in line
            ):
                return parts[1]
    except Exception:
        pass

    try:
        for info in Path("/var/lib/bluetooth").glob("*/*/info"):
            text = info.read_text(errors="ignore")
            if "Name=P21" in text or "Alias=P21" in text:
                return info.parent.name
    except Exception:
        pass

    return None


def drain(sock: socket.socket) -> None:
    """Discard bytes left in the socket buffer by a previous session, so a new
    client never reads a stale response."""
    try:
        sock.setblocking(False)
        while sock.recv(4096):
            pass
    except (BlockingIOError, OSError):
        pass


async def pipe(ws: web.WebSocketResponse, bt: socket.socket) -> bool:
    """Pump bytes both ways until either side ends. Returns True if the printer
    side closed/errored (so the caller should drop the socket)."""
    loop = asyncio.get_running_loop()
    bt_gone = False

    async def bt_to_ws() -> None:
        nonlocal bt_gone
        while True:
            try:
                data = await loop.sock_recv(bt, 4096)
            except OSError:
                bt_gone = True
                return
            if not data:
                bt_gone = True
                return
            await ws.send_bytes(data)

    async def ws_to_bt() -> None:
        nonlocal bt_gone
        async for msg in ws:
            try:
                if msg.type == WSMsgType.BINARY:
                    await loop.sock_sendall(bt, msg.data)
                elif msg.type == WSMsgType.TEXT:
                    await loop.sock_sendall(bt, msg.data.encode())
                else:
                    return
            except OSError:
                bt_gone = True
                return

    tasks = [asyncio.create_task(bt_to_ws()), asyncio.create_task(ws_to_bt())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    return bt_gone


class Bridge:
    """Owns one persistent RFCOMM socket to the printer and serialises clients."""

    def __init__(self, mac: str) -> None:
        self.mac = mac
        self.sock: socket.socket | None = None
        self.active_ws: web.WebSocketResponse | None = None
        self.pipe_task: asyncio.Task | None = None
        self.idle_task: asyncio.Task | None = None
        self._connect_lock = asyncio.Lock()

    async def connect(self) -> socket.socket:
        """Return a live socket, reusing the existing one or (re)connecting with
        backoff while the channel is momentarily busy."""
        async with self._connect_lock:
            self.cancel_idle()
            if self.sock is not None:
                return self.sock
            loop = asyncio.get_running_loop()
            delay = 0.4
            last: Exception | None = None
            for attempt in range(EBUSY_RETRIES):
                s = socket.socket(
                    socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM
                )
                s.settimeout(12)
                try:
                    await loop.run_in_executor(None, s.connect, (self.mac, SPP_CHANNEL))
                except OSError as exc:
                    s.close()
                    last = exc
                    busy = exc.errno in (errno.EBUSY, errno.ECONNREFUSED, errno.EHOSTDOWN)
                    if busy and attempt < EBUSY_RETRIES - 1:
                        print(f"Bluetooth busy ({exc}); retrying in {delay:.1f}s…", flush=True)
                        await asyncio.sleep(delay)
                        delay = min(delay * 1.7, 3.0)
                        continue
                    raise
                s.setblocking(False)
                self.sock = s
                print(f"Bluetooth connected to {self.mac}.", flush=True)
                return s
            assert last is not None
            raise last

    def drop(self) -> None:
        self.cancel_idle()
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    async def supersede(self) -> None:
        """Close any current client and wait for its pipe to finish, so only one
        pipe ever touches the shared socket."""
        ws, task = self.active_ws, self.pipe_task
        if ws is not None and not ws.closed:
            print("Superseding previous WS client.", flush=True)
            try:
                await ws.close(code=1001, message=b"superseded")
            except Exception:
                pass
        if task is not None:
            try:
                await task
            except Exception:
                pass

    def schedule_idle(self) -> None:
        self.cancel_idle()
        self.idle_task = asyncio.create_task(self._idle())

    def cancel_idle(self) -> None:
        if self.idle_task is not None:
            self.idle_task.cancel()
            self.idle_task = None

    async def _idle(self) -> None:
        try:
            await asyncio.sleep(IDLE_CLOSE_S)
        except asyncio.CancelledError:
            return
        if self.active_ws is None:
            self.drop()
            print("Idle: closed Bluetooth socket.", flush=True)


async def health(request: web.Request) -> web.Response:
    bridge: Bridge | None = request.app["bridge"]
    return web.json_response(
        {
            "bt": bridge is not None,
            "mac": bridge.mac if bridge else None,
            "connected": bool(bridge and bridge.sock is not None),
        }
    )


async def ws_bt(request: web.Request) -> web.StreamResponse:
    bridge: Bridge | None = request.app["bridge"]
    if bridge is None:
        return web.Response(status=503, text="Bluetooth not available")

    # One client at a time on the shared socket.
    await bridge.supersede()

    try:
        sock = await bridge.connect()
    except Exception as exc:  # noqa: BLE001
        print(f"Bluetooth connect failed: {exc}", file=sys.stderr, flush=True)
        return web.Response(status=503, text=f"Bluetooth connect failed: {exc}")

    drain(sock)

    ws = web.WebSocketResponse(max_msg_size=0, heartbeat=20)
    await ws.prepare(request)
    bridge.active_ws = ws
    print("WS client attached; piping bytes.", flush=True)

    async def run() -> None:
        if await pipe(ws, sock):
            print("Printer closed the link; dropping socket.", flush=True)
            bridge.drop()

    task = asyncio.create_task(run())
    bridge.pipe_task = task
    try:
        await task
    finally:
        if bridge.active_ws is ws:
            bridge.active_ws = None
        if bridge.pipe_task is task:
            bridge.pipe_task = None
        if ws.close_code == RELEASE_CODE:
            print("Client released; closing Bluetooth socket.", flush=True)
            bridge.drop()
        elif bridge.active_ws is None and bridge.sock is not None:
            bridge.schedule_idle()
    return ws


async def static_handler(request: web.Request) -> web.StreamResponse:
    """Serve a built asset if it exists, else fall back to index.html (SPA)."""
    base: Path = request.app["static"]
    rel = request.match_info.get("path", "")
    target = (base / rel).resolve()
    if (target == base or base in target.parents) and target.is_file():
        return web.FileResponse(target)
    index = base / "index.html"
    if index.is_file():
        return web.FileResponse(index)
    return web.Response(status=404, text="Web app not built (dist/ missing)")


def build_app() -> web.Application:
    app = web.Application()
    bt_enabled = env_bool("BT", True)
    mac = find_p21() if bt_enabled else None
    app["bridge"] = Bridge(mac) if (bt_enabled and mac) else None
    app["static"] = Path(os.environ.get("STATIC_DIR", DEFAULT_STATIC)).resolve()

    app.router.add_get("/api/health", health)
    app.router.add_get("/bt", ws_bt)
    app.router.add_get("/{path:.*}", static_handler)

    async def _shutdown(app: web.Application) -> None:
        if app["bridge"] is not None:
            app["bridge"].drop()

    app.on_cleanup.append(_shutdown)
    return app


def main() -> None:
    app = build_app()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8080"))
    bridge: Bridge | None = app["bridge"]
    print(
        f"Nelko print-server: http://{host}:{port}"
        f"  bt={bridge is not None} mac={bridge.mac if bridge else None}"
        f" static={app['static']}",
        flush=True,
    )
    web.run_app(app, host=host, port=port, print=None)


if __name__ == "__main__":
    main()
