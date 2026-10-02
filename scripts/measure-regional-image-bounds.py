#!/usr/bin/env python3
"""Measure display bounds without rewriting source pixels. Requires Pillow.

Usage: python3 scripts/measure-regional-image-bounds.py [catalogue.json]
Run after importing product photos; the measured metadata is checked into the
catalogue so browsers and normal builds do not need Pillow or pixel scanning.
"""
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ALPHA_THRESHOLD = 64


def rectangle(box):
    left, top, right, bottom = box
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def measure(path):
    original = path.read_bytes()
    with Image.open(path) as image:
        # Palette PNGs store alpha in tRNS, not a named A band. Decode first.
        alpha = image.convert("RGBA").getchannel("A")
        if alpha.getextrema()[0] == 255:
            return None
        full = alpha.getbbox()
        body = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0).getbbox()
        if not full or not body:
            return None
        # Keep antialiasing around the body, but omit distant faint shadows.
        # This is explicitly a display crop, not a claim about nonzero pixels.
        padding = max(2, round((body[3] - body[1]) * 0.01))
        padded = (max(0, body[0] - padding), max(0, body[1] - padding),
                  min(image.width, body[2] + padding), min(image.height, body[3] + padding))
        return {"width": image.width, "height": image.height,
                "bounds": rectangle(padded), "fullAlphaBounds": rectangle(full),
                "bodyAlphaBounds": rectangle(body), "alphaThreshold": ALPHA_THRESHOLD,
                "paddingPixels": padding, "sourceMode": image.mode,
                "method": "decoded_alpha_body_with_padding",
                "originalSha256": hashlib.sha256(original).hexdigest(),
                "note": "Display framing excludes faint remote shadows; original image bytes are unchanged."}


def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data/regional.json"
    catalog = json.loads(target.read_text())
    reviewed_path = ROOT / "public/data-sources/regional/image-display-bounds.json"
    reviewed = json.loads(reviewed_path.read_text())["images"] if reviewed_path.exists() else {}
    measured = 0
    for beer in catalog["beers"]:
        asset = beer.get("image", "")
        if not asset.startswith("/images/") or ".." in Path(asset).parts:
            raise ValueError(f"Expected local image: {beer['id']}")
        path = ROOT / "public" / asset.lstrip("/")
        if asset in reviewed:
            bounds = reviewed[asset]
            if bounds["originalSha256"] != hashlib.sha256(path.read_bytes()).hexdigest():
                raise ValueError(f"Reviewed image changed; recheck product framing: {asset}")
            beer["imageContentBounds"] = bounds
            continue
        existing = beer.get("imageContentBounds") or {}
        if existing.get("method") == "visually_reviewed_product_bounds":
            if existing.get("originalSha256") != hashlib.sha256(path.read_bytes()).hexdigest():
                raise ValueError(f"Manually framed image changed: {asset}")
            continue
        bounds = measure(path)
        if bounds:
            beer["imageContentBounds"] = bounds
            measured += 1
    target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"measuredTransparentImages": measured, "records": len(catalog["beers"])}))


if __name__ == "__main__":
    main()
