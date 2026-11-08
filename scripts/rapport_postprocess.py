#!/usr/bin/env python3
"""Post-traitement du rapport VOLTRIX v2.0 (règles toc.md) :
- pied de page de la section sommaire : PAGE \\* ROMAN
- pied de page de la section corps : PAGE \\* arabic
- suppression des <w:pgNumType/> vides émis par docx-js
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

path = Path(sys.argv[1])
tmp = path.with_suffix(".tmp.docx")

with zipfile.ZipFile(path, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

# 1. document.xml : retirer les pgNumType vides + repérer l'ordre des sections
doc = data["word/document.xml"].decode("utf-8")
before = doc.count("<w:pgNumType/>")
doc = doc.replace("<w:pgNumType/>", "")
print(f"pgNumType vides supprimés : {before}")

# Identifier les références de pied de page dans l'ordre d'apparition des sections
# (sectPr du sommaire apparaît avant celui du corps)
footer_refs = re.findall(r'<w:footerReference[^>]*r:id="(rId\d+)"', doc)
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
id_to_file = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))
ordered_files = [id_to_file[r] for r in footer_refs if r in id_to_file]
# Dédoublonne en conservant l'ordre
seen = set()
ordered_files = [f for f in ordered_files if not (f in seen or seen.add(f))]
print("Pieds de page (ordre sections) :", ordered_files)

# 2. Premiers pieds = section(s) sommaire -> ROMAN ; derniers = corps -> arabic
if ordered_files:
    for i, fname in enumerate(ordered_files):
        key = f"word/{fname}"
        xml = data[key].decode("utf-8")
        fmt = "ROMAN" if i < len(ordered_files) - 1 else "arabic"
        xml2, n = re.subn(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
            xml,
        )
        data[key] = xml2.encode("utf-8")
        print(f"{fname} : {n} champ(s) PAGE -> \\* {fmt}")

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, path)
print("Post-traitement terminé :", path)
