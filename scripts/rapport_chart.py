#!/usr/bin/env python3
"""Graphique du rapport VOLTRIX v2.0 — backtest par niveau de fiabilité."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

for f in ["/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf"]:
    try:
        fm.fontManager.addfont(f)
    except Exception:
        pass
plt.rcParams["font.sans-serif"] = ["Noto Sans SC", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

ACCENT = "#529286"  # palette DS-1
TEXT = "#22313F"

fig, ax = plt.subplots(figsize=(10, 5.2), constrained_layout=True)

categories = ["Bonne fiabilité\n(38 combats)", "Moyenne fiabilité\n(8 combats)", "Global\n(46 combats)"]
values = [68, 88, 72]
colors = [ACCENT, "#7FB3A8", "#2C5E54"]

bars = ax.bar(categories, values, color=colors, width=0.55, edgecolor="white", linewidth=1.2)
for bar, val in zip(bars, values):
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{val} %",
            ha="center", va="bottom", fontsize=14, fontweight="bold", color=TEXT)
# annotations « corrects/analysés » à l'intérieur des barres :
# blanc sur barres foncées, texte sombre sur la barre claire (contraste)
inbar = [("26/38", "white"), ("7/8", TEXT), ("33/46", "white")]
for bar, (label, color) in zip(bars, inbar):
    ax.text(bar.get_x() + bar.get_width() / 2, 46, label,
            ha="center", va="center", fontsize=11, fontweight="bold", color=color)

ax.set_title("Backtest du modèle voltrix-mma-v1 — taux de réussite par niveau de fiabilité",
             fontsize=14, pad=14, color=TEXT)
ax.set_ylabel("Favoris du modèle confirmés (%)", fontsize=12, color=TEXT)
ax.set_ylim(0, 100)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", alpha=0.3, color="#BECFCC")
ax.tick_params(colors=TEXT, labelsize=12)

fig.savefig("/home/z/my-project/scripts/rapport_backtest.png", dpi=160)
print("OK")
