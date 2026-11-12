#!/usr/bin/env python3
"""Assemble qa_mockups/bench-30-slots.html: QA › Bench with 30 slots on dummy data.

Inputs in this folder were taken from the running admin:
  admin.css         apps/admin production build stylesheet (vite build)
  geist*.woff2      the admin's fonts, inlined so the file works offline
  shell.html        the real sidebar and header, with <!--MAIN--> where the page goes
  page-header.html  the Bench page header (title, Slots / Single board, station picker)
  panel.html        the slot panel toolbar
  below.html        the station, hardware and recent-jobs panels under the grid
  app.js            renders the slots with the same classes as the React components
Run: python3 qa_mockups/bench-slots/build.py
"""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "bench-30-slots.html"

read = lambda name: (HERE / name).read_text()
font = lambda name: "data:font/woff2;base64," + base64.b64encode((HERE / name).read_bytes()).decode()

css = read("admin.css")
css = re.sub(r"url\(/assets/geist-latin-wght-normal-[^)]+\)", f"url({font('geist.woff2')})", css)
css = re.sub(r"url\(/assets/geist-mono-latin-wght-normal-[^)]+\)", f"url({font('geist-mono.woff2')})", css)
# Other scripts' subsets are not needed for this page.
css = re.sub(r"@font-face\{[^}]*url\(/assets/[^}]*\}", "", css)

anonymise = lambda html: (
    html.replace("QA slots E2E", "Bench operator")
    .replace("qa-slots-e2e@stepwhere.local", "QA")
    .replace(">QE<", ">BO<")
    .replace("Bench 1 (simulated 30 slots)", "Bench 1")
    .replace("BENCH-PC-SIM", "BENCH-PC-01")
)

panel = read("panel.html")
toolbar = re.search(r'<div class="flex flex-wrap items-center gap-2">.*?</div>', panel, re.S).group(0)
# The demo flashes the QA build.
toolbar = toolbar.replace(
    '<span class="rounded-xs px-1 text-2xs font-medium uppercase bg-info-wash text-info">Prod</span><span class="font-mono text-xs">stepwhere.ino.bin</span>',
    '<span class="rounded-xs px-1 text-2xs font-medium uppercase bg-caution-wash text-caution">QA</span><span class="font-mono text-xs">qa-0.2.0 · stepwhere.qa.bin</span>',
)
toolbar = toolbar.replace("Flash  slots", "Flash slots").replace(
    "Flash all needs slots with their own ST-LINK. Flash a shared ST-LINK from its slot.",
    "Flashing several slots at once needs an ST-LINK for each. With a shared ST-LINK, flash from the slot it is clipped onto.",
)
# The last button is "Run tests on N idle"; give it an id so the demo can update and handle it.
toolbar = re.sub(r'(<button)((?:(?!<button).)*?Run tests on)', r'\1 id="demo-run-idle"\2', toolbar, count=1, flags=re.S)
legend = panel[panel.index('<div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">'):panel.rindex("</div></section>")]

main = f"""
{anonymise(read("page-header.html"))}
<div class="grid gap-4">
  <section class="min-w-0 overflow-hidden rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)]">
    <div class="p-4 grid gap-4">
      {toolbar}
      <div id="demo-counts" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3"></div>
      <div id="demo-needs"></div>
      <div id="demo-grid" class="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2"></div>
      {legend}
    </div>
  </section>
  {anonymise(read("below.html"))}
</div>
"""

html = f"""<!doctype html>
<html lang="en" class="dark qa-calm" style="color-scheme: dark; background: #07070a">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Stepwhere Admin · QA Bench, 30 slots (demo)</title>
<style>{css}</style>
<style>
  /* Demo only: the page is static, so links and the station picker do nothing. */
  a[href] {{ cursor: default; }}
  .demo-note {{ position: fixed; bottom: 12px; right: 12px; z-index: 60; }}
</style>
</head>
<body>
{anonymise(read("shell.html")).replace("<!--MAIN-->", main)}
<div class="demo-note rounded-md bg-overlay px-3 py-2 text-xs text-ink-3 shadow-overlay">Demo data · hover a card, click it, press Start or Retry</div>
<script>{read("app.js")}</script>
</body>
</html>
"""

OUT.write_text(html)
print(f"wrote {OUT} ({len(html) // 1024} KB)")
