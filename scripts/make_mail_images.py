#!/usr/bin/env python3
"""Draws the header picture used at the top of each kind of email into public/mail/. Needs Pillow (pip install pillow).
Run again after changing the wording or colours; emails link to https://<your site>/mail/<name>.png."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "mail"
W, H = 1120, 400

# name: (headline, subline, colour A, colour B, glyph)
BANNERS = {
    "welcome": ("Welcome to WorkLab XC", "Your syllabus, turned into lessons you can follow", "#2f7bff", "#7c4dff", "book"),
    "update": ("What's new", "Fresh improvements to how you learn", "#12a150", "#2f7bff", "spark"),
    "renewal": ("Keep your Beta going", "Your plan is about to end. Renew in a minute", "#e58a00", "#e5484d", "clock"),
    "expired": ("We miss you in the classroom", "Come back to unlimited 3D lessons", "#7c4dff", "#d46bff", "cube"),
    "upgrade": ("Go further with Beta", "The 3D classroom, no ads, from Rs. 99 a month", "#2f7bff", "#12a150", "cube"),
    "support": ("We are on it", "Your question reached our team", "#2f7bff", "#00a3a3", "chat"),
    "session": ("Your support session", "A time that works for you, with a real person", "#7c4dff", "#2f7bff", "clock"),
    "receipt": ("Thank you", "Your payment went through", "#12a150", "#00a3a3", "check"),
    "security": ("Keeping your account safe", "A quick action on your WorkLab XC account", "#38405a", "#2f7bff", "shield"),
}


def font(size: int, bold: bool = False):
    for name in (("segoeuib.ttf" if bold else "segoeui.ttf"), ("arialbd.ttf" if bold else "arial.ttf"), "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def hexrgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(a, b) -> Image.Image:
    ca, cb = hexrgb(a), hexrgb(b)
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        for x in range(W):
            t = (x / W * 0.7 + y / H * 0.3)
            px[x, y] = tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))
    return img


def glyph(d: ImageDraw.ImageDraw, kind: str, cx: int, cy: int):
    white, soft = (255, 255, 255), (255, 255, 255, 70)
    d.ellipse([cx - 120, cy - 120, cx + 120, cy + 120], fill=soft)
    if kind == "book":
        d.rounded_rectangle([cx - 70, cy - 52, cx - 4, cy + 56], 10, fill=white)
        d.rounded_rectangle([cx + 4, cy - 52, cx + 70, cy + 56], 10, fill=white)
        for i in range(4):
            d.line([cx - 56, cy - 28 + i * 22, cx - 18, cy - 28 + i * 22], fill=(47, 123, 255), width=5)
            d.line([cx + 18, cy - 28 + i * 22, cx + 56, cy - 28 + i * 22], fill=(47, 123, 255), width=5)
    elif kind == "spark":
        pts = []
        for i in range(16):
            r = 78 if i % 2 == 0 else 26
            a = math.pi / 8 * i - math.pi / 2
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        d.polygon(pts, fill=white)
    elif kind == "clock":
        d.ellipse([cx - 64, cy - 64, cx + 64, cy + 64], outline=white, width=10)
        d.line([cx, cy, cx, cy - 40], fill=white, width=9)
        d.line([cx, cy, cx + 30, cy + 14], fill=white, width=9)
    elif kind == "cube":
        top = [(cx, cy - 66), (cx + 60, cy - 32), (cx, cy + 2), (cx - 60, cy - 32)]
        left = [(cx - 60, cy - 32), (cx, cy + 2), (cx, cy + 70), (cx - 60, cy + 36)]
        right = [(cx + 60, cy - 32), (cx, cy + 2), (cx, cy + 70), (cx + 60, cy + 36)]
        d.polygon(top, fill=white)
        d.polygon(left, fill=(235, 240, 255))
        d.polygon(right, fill=(200, 212, 255))
    elif kind == "chat":
        d.rounded_rectangle([cx - 74, cy - 54, cx + 74, cy + 36], 22, fill=white)
        d.polygon([(cx - 30, cy + 34), (cx - 44, cy + 70), (cx + 4, cy + 34)], fill=white)
        for i in (-34, 0, 34):
            d.ellipse([cx + i - 9, cy - 20, cx + i + 9, cy - 2], fill=(47, 123, 255))
    elif kind == "check":
        d.ellipse([cx - 66, cy - 66, cx + 66, cy + 66], fill=white)
        d.line([cx - 30, cy + 2, cx - 6, cy + 28, cx + 36, cy - 26], fill=(18, 161, 80), width=14, joint="curve")
    elif kind == "shield":
        d.polygon([(cx, cy - 72), (cx + 62, cy - 46), (cx + 56, cy + 24), (cx, cy + 74), (cx - 56, cy + 24), (cx - 62, cy - 46)], fill=white)
        d.line([cx - 24, cy + 2, cx - 6, cy + 22, cx + 28, cy - 22], fill=(47, 123, 255), width=12, joint="curve")


def make(name: str, spec):
    head, sub, a, b, g = spec
    img = gradient(a, b).convert("RGBA")
    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(over, "RGBA")
    for i, r in enumerate((260, 180, 110)):  # soft rings in the corner
        d.ellipse([W - 150 - r, -90 - r, W - 150 + r, -90 + r], outline=(255, 255, 255, 40 + i * 14), width=3)
    glyph(d, g, W - 230, H // 2 + 6)
    d.text((64, 64), "WorkLab XC", font=font(30, True), fill=(255, 255, 255, 235))
    # headline wraps to two lines at most
    f = font(60, True)
    words, lines, cur = head.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) > 640 and cur:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    y = 150
    for ln in lines[:2]:
        d.text((64, y), ln, font=f, fill=(255, 255, 255, 255))
        y += 72
    d.text((64, y + 10), sub, font=font(26), fill=(255, 255, 255, 220))
    out = Image.alpha_composite(img, over).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    out.save(OUT / f"{name}.png", optimize=True)


if __name__ == "__main__":
    for n, s in BANNERS.items():
        make(n, s)
        print("wrote", OUT / f"{n}.png")
