#!/usr/bin/env python3
"""Assemble qa_mockups/index.html from the Night Trail reference and the QA sources.

The stylesheet and icon sprite are copied from apps/admin/design/design-system.html
at build time, so the mockups always match the current design system.
Run: python3 qa_mockups/build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
REF = ROOT.parent / "apps/admin/design/design-system.html"

ref = REF.read_text()
style = re.search(r"<style>.*?</style>", ref, re.S).group(0)
sprite = re.search(r'<svg class="sprite".*?</svg>\s*(?=\n)', ref, re.S).group(0)

# Icons the QA screens need that the reference sprite does not have (24px grid, stroke only).
EXTRA = {
    "i-help": '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.6-2.4 2.1-2.4 3.6M12 17h.01"/>',
    "i-gauge": '<path d="M4.5 18a8.5 8.5 0 1 1 15 0"/><path d="m12 13.5 3.5-4"/>',
    "i-cpu": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
    "i-wrench": '<path d="M14.5 6.5a4 4 0 0 0 5 5l-8.2 8.2a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 0-2-2Z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
    "i-list": '<path d="m4 7 1.5 1.5L8 6M4 17l1.5 1.5L8 16M11 7.5h9M11 12h9M11 17h9"/>',
    "i-zap": '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
    "i-server": '<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/>',
    "i-truck": '<path d="M3 6.5h11v10H3zM14 10h3.5l3 3.2v3.3H14"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    "i-factory": '<path d="M3.5 20V10l5 3.2V10l5 3.2V6.5L20.5 4v16Z"/><path d="M7.5 17h1M12 17h1M16.5 17h1"/>',
    "i-scan": '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8.5 8v8M12 8v8M15.5 8v8"/>',
    "i-arrow-ur": '<path d="M7.5 16.5 16.5 7.5M9 7.5h7.5V15"/>',
    "i-arrow-r": '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
    "i-shoe": '<path d="M3.5 15.5V8.5a1 1 0 0 1 1.4-.9l2.6 1.2c.9.4 2 .1 2.5-.8L11 6l2 4.3c1.4 2.9 4.2 4 7 4.6.5.1.9.6.9 1.1V17a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-1.5Z"/><path d="M3.5 15.5h18"/>',
    "i-play": '<path d="M8 5.5v13l10-6.5-10-6.5Z"/>',
    "i-printer": '<path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
    "i-usb": '<path d="M12 21v-4.5M9 3v4M15 3v4M7 7h10v5a4.5 4.5 0 0 1-4.5 4.5h-1A4.5 4.5 0 0 1 7 12V7Z"/>',
    "i-terminal": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
    "i-hand": '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.6 16a1.5 1.5 0 0 1 2.3-2L8 16"/>',
    "i-wifi": '<path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a7.5 7.5 0 0 1 11 0M9.5 16a3 3 0 0 1 5 0"/><circle cx="12" cy="19" r=".6"/>',
    "i-tag": '<path d="M12.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v7.5l8.6 8.6a1.5 1.5 0 0 0 2.1 0l6.3-6.3a1.5 1.5 0 0 0 0-2.1Z"/><circle cx="8.2" cy="8.2" r="1.3"/>',
    "i-upload": '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    "i-git": '<circle cx="6.5" cy="6" r="2"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="8" r="2"/><path d="M6.5 8v8M17.5 10a6 6 0 0 1-6 6H8.5"/>',
}
extra = '<svg class="sprite" aria-hidden="true" focusable="false">' + "".join(
    f'<symbol id="{k}" viewBox="0 0 24 24">{v}</symbol>' for k, v in EXTRA.items()
) + "</svg>"

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Stepwhere Admin · Production QA mockups (Night Trail)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" />
<!-- Night Trail stylesheet, copied from apps/admin/design/design-system.html -->
{style}
<style>
{(ROOT / "src/qa.css").read_text()}
</style>
</head>
<body>
{sprite}
{extra}
<div id="root"></div>
<script>
{(ROOT / "src/app.js").read_text()}
</script>
</body>
</html>
"""
(ROOT / "index.html").write_text(html)
print(f"wrote {ROOT / 'index.html'} ({len(html) // 1024} KB)")
