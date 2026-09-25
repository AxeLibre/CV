"""
CV A4 aux couleurs du portfolio : génère tools/cv/cv.html puis le PDF (Edge headless).

    python tools/cv/build_cv.py

Le QR code (vers le portfolio) est lu dans tools/cv/qr.svg.
"""
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SITE = "https://axelibre.github.io/CV/"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT_PDF = os.path.join(HERE, "CV_Axel_LASALVIA_2026.pdf")

logo_d = re.search(r'd="([^"]*)"', open(os.path.join(ROOT, "src", "components", "Logo.astro"), encoding="utf-8").read()).group(1)
qr = open(os.path.join(HERE, "qr.svg"), encoding="utf-8").read()
css = open(os.path.join(HERE, "cv.css"), encoding="utf-8").read()
body = open(os.path.join(HERE, "cv.body.html"), encoding="utf-8").read()

html = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>CV Axel LASALVIA — Technicien d'Assistance Informatique</title>
<meta name="author" content="Axel LASALVIA">
<style>{css}</style>
</head>
<body>
{body.replace("{{LOGO}}", logo_d).replace("{{QR}}", qr).replace("{{SITE}}", SITE)}
</body>
</html>"""

html_path = os.path.join(HERE, "cv.html")
open(html_path, "w", encoding="utf-8").write(html)

if __name__ == "__main__":
    url = "file:///" + html_path.replace("\\", "/")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--virtual-time-budget=4000", f"--print-to-pdf={OUT_PDF}", url], check=True)
    print("PDF :", OUT_PDF)
