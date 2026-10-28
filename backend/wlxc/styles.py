"""Deck themes. Presets are open to everyone; a custom accent colour is a paid feature."""
from __future__ import annotations

import re


def _s(id, name, description, bg, bgAlt, ink, muted, accent, head, body):
    return {"id": id, "name": name, "description": description, "bg": bg, "bgAlt": bgAlt, "ink": ink, "muted": muted,
            "accent": accent, "headFont": head, "bodyFont": body}


STYLES = {
    "clean": _s("clean", "Clean", "Light, calm and blue. Works for anything.", "FFFFFF", "F8FAFC", "1F2937", "6B7280", "2F7BFF", "Calibri", "Calibri"),
    "midnight": _s("midnight", "Midnight", "Dark background, bright accent. Easy on the eyes in a dim room.", "0F172A", "0B1020", "E5E7EB", "94A3B8", "60A5FA", "Calibri", "Calibri"),
    "academic": _s("academic", "Academic", "Warm paper tones and a serif headline, like a textbook.", "FBF8F1", "F3EEDF", "2B2B2B", "6B645A", "8B1E3F", "Georgia", "Georgia"),
    "sunrise": _s("sunrise", "Sunrise", "Warm and friendly with an orange accent.", "FFFBF5", "FFF1E0", "3B2A1E", "8A6F5A", "EA580C", "Trebuchet MS", "Calibri"),
    "forest": _s("forest", "Forest", "Fresh greens. Good for biology and earth science.", "FFFFFF", "F0FDF4", "14301F", "5B7A66", "15803D", "Calibri", "Calibri"),
    "mono": _s("mono", "Mono", "Black and white, no decoration. Prints well.", "FFFFFF", "FFFFFF", "111827", "6B7280", "111827", "Arial", "Arial"),
}
STYLE_IDS = list(STYLES)

_COLOURS = [
    (r"\b(red|crimson|maroon)\b", "DC2626"), (r"\b(orange|amber)\b", "EA580C"), (r"\b(yellow|gold)\b", "CA8A04"),
    (r"\b(green|emerald|teal)\b", "15803D"), (r"\b(blue|navy|cyan)\b", "2563EB"), (r"\b(purple|violet|indigo)\b", "7C3AED"),
    (r"\b(pink|magenta|rose)\b", "DB2777"),
]


def infer_style(text: str) -> dict:
    """Reads a style request written in plain words ("dark minimal deck with orange accents") into a preset and accent."""
    t = text.lower()
    style = None
    if re.search(r"\b(dark|midnight|night|black background)\b", t): style = "midnight"
    elif re.search(r"\b(academic|serif|formal|textbook|scholarly|journal)\b", t): style = "academic"
    elif re.search(r"\b(playful|fun|friendly|warm|colou?rful|sunrise)\b", t): style = "sunrise"
    elif re.search(r"\b(nature|biology|forest|eco|earth)\b", t): style = "forest"
    elif re.search(r"\b(minimal|monochrome|mono|black and white|print)\b", t): style = "mono"
    accent = next((c for rx, c in _COLOURS if re.search(rx, t, re.I)), None)
    return {"style": style, "accent": accent}


_HEX = re.compile(r"^#?([0-9a-f]{6})$", re.I)


def parse_hex(s: str | None) -> str | None:
    return s.strip().replace("#", "").upper() if s and _HEX.match(s.strip()) else None


def resolve_style(style: str | None = None, accent: str | None = None, instructions: str = "", allow_custom_accent: bool = False) -> dict:
    """Final theme for a run. An explicit choice wins; 'auto' reads the instructions; otherwise Clean."""
    guess = infer_style(instructions or "") if (not style or style == "auto") else {}
    key = style if style and style != "auto" else (guess.get("style") or "clean")
    base = STYLES.get(key, STYLES["clean"])
    acc = (parse_hex(accent) or guess.get("accent")) if allow_custom_accent else None
    return {**base, "accent": acc} if acc else base


def mix(a: str, b: str, t: float) -> str:
    """Blend two colours; used to draw a faint watermark that suits both light and dark themes."""
    def c(i):
        x, y = int(a[i:i + 2], 16), int(b[i:i + 2], 16)
        return format(round(x + (y - x) * t), "02x")
    return (c(0) + c(2) + c(4)).upper()
