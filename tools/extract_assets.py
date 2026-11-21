"""One-off: pull the base64 JPEGs out of the old self-contained build into assets/.

Order of appearance in shadows_of_the_citadel_animated.html:
  7 defender portraits, card back, 4 quest cards, board background.
"""
import base64
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = root / "legacy" / "shadows_of_the_citadel_animated.html"
out = root / "assets"
out.mkdir(exist_ok=True)

names = [
    "defender-veyra", "defender-harren", "defender-elira", "defender-berserker",
    "defender-mage", "defender-cavalry", "defender-shield",
    "card-back",
    "quest-pass", "quest-banner", "quest-blade", "quest-walls",
    "board",
]

text = src.read_text(encoding="utf-8")
blobs = re.findall(r"data:image/jpeg;base64,([A-Za-z0-9+/=]+)", text)
if len(blobs) != len(names):
    sys.exit(f"expected {len(names)} images, found {len(blobs)}")

for name, blob in zip(names, blobs):
    data = base64.b64decode(blob)
    (out / f"{name}.jpg").write_bytes(data)
    print(f"{name}.jpg  {len(data) // 1024} KB")
