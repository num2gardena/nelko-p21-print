#!/usr/bin/env python3
"""
Local WebSocket <-> Bluetooth Classic (RFCOMM/SPP) bridge for the Nelko P21.

Holds one persistent native Bluetooth socket to the printer (no rfcomm, no root)
and exposes it to the web app as a WebSocket byte pipe. The browser app's
"Bluetooth bridge" transport connects to ws://127.0.0.1:8765.

Usage:
    uv run python tools/bt_bridge.py [MAC] [--host H] [--port P]

If MAC is omitted, the paired device named "P21" is auto-detected.
"""
import argparse
import asyncio
import socket
import subprocess
import sys

import websockets

SPP_CHANNEL = 1


def find_p21() -> str | None:
    try:
        result = subprocess.run(
            ["bluetoothctl", "devices"], capture_output=True, text=True, timeout=3
        )
        for line in result.stdout.splitlines():
            if "P21" in line:
                parts = line.split()
                if len(parts) >= 2 and parts[0] == "Device" and parts[1].count(":") == 5:
                    return parts[1]
    except Exception:
        pass
    return None


async def pipe(ws, bt: socket.socket, loop: asyncio.AbstractEventLoop) -> None:
    async def bt_to_ws() -> None:
        while True:
            data = await loop.sock_recv(bt, 4096)
            if not data:
                break
            await ws.send(data)

    async def ws_to_bt() -> None:
        async for message in ws:
            if isinstance(message, str):
                message = message.encode()
            await loop.sock_sendall(bt, message)

    tasks = [asyncio.create_task(bt_to_ws()), asyncio.create_task(ws_to_bt())]
    _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()


def make_handler(mac: str):
    async def handler(ws) -> None:
        loop = asyncio.get_running_loop()
        bt = socket.socket(
            socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM
        )
        bt.settimeout(10)
        print(f"WS client connected; connecting to {mac}…", flush=True)
        try:
            await loop.run_in_executor(None, bt.connect, (mac, SPP_CHANNEL))
        except Exception as e:  # noqa: BLE001
            print(f"Bluetooth connect failed: {e}", file=sys.stderr, flush=True)
            await ws.close(code=1011, reason=str(e))
            bt.close()
            return
        bt.setblocking(False)
        print("Bluetooth connected; piping bytes.", flush=True)
        try:
            await pipe(ws, bt, loop)
        finally:
            bt.close()
            print("Bluetooth socket closed.", flush=True)

    return handler


async def main() -> None:
    parser = argparse.ArgumentParser(description="Nelko P21 WebSocket<->Bluetooth bridge")
    parser.add_argument("mac", nargs="?", help="Printer MAC (auto-detects P21 if omitted)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    mac = args.mac or find_p21()
    if not mac:
        print("No MAC provided and no paired 'P21' found.", file=sys.stderr)
        sys.exit(1)

    print(f"Bridge listening on ws://{args.host}:{args.port}  ->  {mac}", flush=True)
    async with websockets.serve(make_handler(mac), args.host, args.port):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
