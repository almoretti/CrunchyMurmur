"""Build deterministic app/tray raster assets from the canonical brand geometry."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MASTER_SIZE = 1024
SCALE = MASTER_SIZE / 256
TOP = (59, 122, 103, 255)       # Mediterranean green, lifted for icon contrast
BOTTOM = (23, 61, 51, 255)      # Deep Mediterranean green
IVORY = (250, 248, 243, 255)


def scaled(value):
    return round(value * SCALE)


def build_master():
    mask = Image.new("L", (MASTER_SIZE, MASTER_SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, MASTER_SIZE - 1, MASTER_SIZE - 1),
        radius=scaled(68),
        fill=255,
    )

    gradient = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE))
    pixels = gradient.load()
    for y in range(MASTER_SIZE):
        amount = y / (MASTER_SIZE - 1)
        colour = tuple(round(TOP[channel] * (1 - amount) + BOTTOM[channel] * amount) for channel in range(4))
        for x in range(MASTER_SIZE):
            pixels[x, y] = colour
    gradient.putalpha(mask)

    draw = ImageDraw.Draw(gradient)
    for x, y, width, height in (
        (57, 107, 18, 42),
        (88, 89, 18, 78),
        (119, 63, 18, 130),
        (150, 89, 18, 78),
        (181, 107, 18, 42),
    ):
        box = (scaled(x), scaled(y), scaled(x + width), scaled(y + height))
        draw.rounded_rectangle(box, radius=scaled(width / 2), fill=IVORY)
    return gradient


def main():
    master = build_master()
    master.save(ASSETS / "brand-mark.png", optimize=True)
    master.resize((64, 64), Image.Resampling.LANCZOS).save(ASSETS / "tray-palette.png", optimize=True)
    icon = master.resize((256, 256), Image.Resampling.LANCZOS)
    icon.save(
        ASSETS / "icon-palette.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("Built brand-mark.png, tray-palette.png, and icon-palette.ico")


if __name__ == "__main__":
    main()
