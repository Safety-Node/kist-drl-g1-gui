"""Local dev mock of the workstation GUIBackground WebSocket (REQ-41).

Broadcasts, at ~15 fps, a JSON status (text) + a small JPEG (binary) so the
renderer can be developed/verified WITHOUT the workstation. ROS-free.

Run:
    pip install websockets pillow      # pillow optional (placeholder frame if absent)
    python tools/mock_publisher.py
Then open the renderer:
    python3 -m http.server 8080        # in the repo root
    # browser: http://localhost:8080/?ws=ws://localhost:8081
"""

import asyncio
import io
import json
import math

import websockets

_clients = set()


def _make_jpeg(i: int) -> bytes:
    """A moving blob on a dark background (Pillow); tiny fallback if Pillow absent."""
    try:
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (640, 360), (18, 22, 28))
        d = ImageDraw.Draw(img)
        x = int(320 + 220 * math.sin(i / 12.0))
        d.ellipse([x - 34, 150, x + 34, 218], fill=(60, 150, 255))
        d.text((12, 12), f"mock frame {i}", fill=(200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return buf.getvalue()
    except Exception:
        # Renderer shows NO SIGNAL if this is undecodable — that's fine for a smoke test.
        return b"\xff\xd8\xff\xe0mock\xff\xd9"


async def _handler(ws):
    _clients.add(ws)
    print(f"client connected ({len(_clients)})")
    try:
        async for _ in ws:
            pass
    finally:
        _clients.discard(ws)


async def _pump():
    states = ["idle", "active", "active", "success"]
    i = 0
    while True:
        i += 1
        status = {
            "scenario": "move_test",
            "subtask": {"name": "go_fridge", "i": 1, "n": 4},
            "state": states[(i // 30) % len(states)],
            "estop": (i % 200) > 185,
        }
        text = json.dumps(status, ensure_ascii=False)
        frame = _make_jpeg(i)
        for ws in list(_clients):
            try:
                await ws.send(text)
                await ws.send(frame)
            except Exception:
                _clients.discard(ws)
        await asyncio.sleep(1 / 15)


async def main():
    async with websockets.serve(_handler, "0.0.0.0", 8081):
        print("mock publisher on ws://0.0.0.0:8081")
        await _pump()


if __name__ == "__main__":
    asyncio.run(main())
