#!/usr/bin/env python3
"""
Generate golden reference vectors from the *actual* Python/PIL implementation,
so the TypeScript port can be tested for bit-exact parity.

Output: app/test/fixtures/reference.json

Run:  .venv/bin/python tools/gen_reference.py
"""
import base64
import json
import os
import struct
import sys

from PIL import Image, ImageOps, ImageEnhance

# Import the reference implementation under test.
from nelko_p21_print import crc16, load_image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "test", "fixtures", "reference.json")

# Images that are already 284x96 so PIL's thumbnail() is a no-op and the
# pipeline parity is isolated from resize aspect-rounding.
IMAGES = [
    os.path.join(ROOT, "test-template.png"),
    os.path.join(ROOT, "output_labels", "label_1.png"),
    os.path.join(ROOT, "output_labels", "label_10.png"),
]


def hexs(b: bytes) -> str:
    return b.hex()


def gray_bytes(im: Image.Image) -> str:
    assert im.mode == "L"
    return hexs(im.tobytes())


def stage_dump(path: str) -> dict:
    """Replicate load_image() step by step, capturing each intermediate."""
    original = Image.open(path)
    rgba = original.convert("RGBA")

    g = ImageOps.grayscale(original)
    after_gray = g.copy()

    g = ImageOps.autocontrast(g)
    after_autocontrast = g.copy()

    g = ImageEnhance.Contrast(g).enhance(2)
    after_contrast = g.copy()

    if g.width > g.height:
        g = g.rotate(90, expand=True)
    after_rotate = g.copy()

    g.thumbnail((96, 284), Image.Resampling.NEAREST)
    after_resize = g.copy()

    one = g.convert("1", dither=Image.Dither.FLOYDSTEINBERG)
    dithered_packed = one.tobytes()
    dithered_l = one.convert("L").tobytes()  # 0/255 per pixel

    # Final output exactly as load_image() produces it (incl. padding).
    final = load_image(path)
    # Sanity: our manual replication must match the library function.
    manual = dithered_packed
    if len(manual) < 3408:
        manual = manual.ljust(3408, b"\xff")
    assert manual == final, f"manual replication != load_image for {path}"

    return {
        "name": os.path.basename(path),
        "width": rgba.width,
        "height": rgba.height,
        "rgba": hexs(rgba.tobytes()),
        "gray": gray_bytes(after_gray),
        "autocontrast": gray_bytes(after_autocontrast),
        "contrast": gray_bytes(after_contrast),
        "rotated": {
            "width": after_rotate.width,
            "height": after_rotate.height,
            "data": gray_bytes(after_rotate),
        },
        "resized": {
            "width": after_resize.width,
            "height": after_resize.height,
            "data": gray_bytes(after_resize),
        },
        "dithered_l": hexs(dithered_l),
        "final": hexs(final),
    }


def crc_vectors() -> list:
    samples = [b"", b"\x00", b"123456789", b"SIZE 14.0 mm,40.0 mm\r\n"]
    return [{"data": hexs(s), "crc": hexs(crc16(s))} for s in samples]


def config_vector() -> dict:
    body = bytes([0x00, 0xCB, 0x00, 0x00, 0x03, 0x04, 0x02, 0x04, 0x02, 0x01])
    raw = b"CONFIG " + body + b"\r\n"
    dpi, h1, h2, h3, f1, f2, f3, timeout, beep = struct.unpack(">hBBBBBBB?", body)
    return {
        "raw": hexs(raw),
        "dpiResolution": dpi,
        "hardwareVersion": f"{h1}.{h2}.{h3}",
        "secondFirmwareVersion": f"{f1}.{f2}.{f3}",
        "timeout": timeout,
        "beep": 1 if beep else 0,
    }


def battery_vectors() -> list:
    out = []
    for level_byte, charging in [(0x99, 0x00), (0x55, 0x01), (0x07, 0x00)]:
        raw = b"BATTERY " + bytes([level_byte, charging]) + b"\r\n"
        level = ((level_byte >> 4) & 0x0F) * 10 + (level_byte & 0x0F)
        out.append(
            {"raw": hexs(raw), "level": level, "charging": bool(charging)}
        )
    return out


def status_vectors() -> list:
    out = []
    # readiness, len, u, u, color, u3, border, paper, u, u, u, length, maxw, width
    cases = [
        [0, 12, 0, 0, 3, 0, 2, 1, 0, 0, 0, 40, 50, 14],  # ready, 14x40 white gapped
        [0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  # ready, no RFID tag
        [32, 12, 0, 0, 5, 0, 0, 0, 0, 0, 0, 40, 50, 12],  # busy, blue 12x40
    ]
    for data14 in cases:
        body = bytes(data14)
        raw = body + crc16(body)
        out.append(
            {
                "raw": hexs(raw),
                "readiness": data14[0],
                "labelColor": data14[4],
                "paperType": data14[7],
                "labelLengthMm": data14[11],
                "maximumLabelWidthMm": data14[12],
                "labelWidthMm": data14[13],
                "borderRadius": data14[6],
                "noRfidTag": data14[13] == 0 and data14[11] == 0,
            }
        )
    return out


def main() -> None:
    data = {
        "crc16": crc_vectors(),
        "config": config_vector(),
        "battery": battery_vectors(),
        "status": status_vectors(),
        "images": [stage_dump(p) for p in IMAGES],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f)
    size_kb = os.path.getsize(OUT) / 1024
    print(f"Wrote {OUT} ({size_kb:.0f} KB)")
    print(f"Images: {[i['name'] for i in data['images']]}")


if __name__ == "__main__":
    main()
