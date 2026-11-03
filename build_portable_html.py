# -*- coding: utf-8 -*-
"""
Generador del archivo único autoejecutable (Offline + Online):
  Cisco_WiFi_Analyzer_Portable.html

IMPORTANTE:
- NO modifica ningún archivo de la app actual en localhost:8060
  (app.py, csv_analyzer.py, templates/index.html, static/app.js).
- Embebe Tailwind CSS, Chart.js 4.4.1, Font Awesome 6.5.1 + Webfonts WOFF2 en Base64,
  el motor analítico completo en JavaScript (portable_engine.js), la interfaz (static/app.js)
  y la semilla comprimida GZIP+Base64 de los CSVs actuales.
"""

import base64
import gzip
import json
import os
import re
import ssl
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VENDOR_CACHE_DIR = os.path.join(BASE_DIR, ".portable_vendor_cache")
OUTPUT_HTML_PATH = os.path.join(BASE_DIR, "Cisco_WiFi_Analyzer_Portable.html")

INDEX_HTML_PATH = os.path.join(BASE_DIR, "templates", "index.html")
APP_JS_PATH = os.path.join(BASE_DIR, "static", "app.js")
ENGINE_JS_PATH = os.path.join(BASE_DIR, "portable_engine.js")
LOADED_CACHE_PATH = os.path.join(BASE_DIR, ".loaded_files_cache.json")

VENDOR_ASSETS = {
    "tailwindcss.js": "https://cdn.tailwindcss.com",
    "chart.umd.min.js": "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
    "fa-all.min.css": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
    "fa-solid-900.woff2": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2",
    "fa-regular-400.woff2": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-regular-400.woff2",
    "fa-brands-400.woff2": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-brands-400.woff2",
}


def fetch_or_cache_bytes(filename: str, url: str) -> bytes:
    os.makedirs(VENDOR_CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(VENDOR_CACHE_DIR, filename)
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        with open(cache_path, "rb") as f:
            return f.read()

    print(f"Descargando recurso vendor para modo offline: {filename} ...")
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        },
    )
    with urllib.request.urlopen(req, context=ctx, timeout=45) as resp:
        data = resp.read()

    with open(cache_path, "wb") as f:
        f.write(data)
    return data


def build_offline_fontawesome_css() -> str:
    css_text = fetch_or_cache_bytes("fa-all.min.css", VENDOR_ASSETS["fa-all.min.css"]).decode("utf-8", errors="replace")

    fonts_map = {
        "fa-solid-900": fetch_or_cache_bytes("fa-solid-900.woff2", VENDOR_ASSETS["fa-solid-900.woff2"]),
        "fa-regular-400": fetch_or_cache_bytes("fa-regular-400.woff2", VENDOR_ASSETS["fa-regular-400.woff2"]),
        "fa-brands-400": fetch_or_cache_bytes("fa-brands-400.woff2", VENDOR_ASSETS["fa-brands-400.woff2"]),
    }

    for font_base, font_bytes in fonts_map.items():
        b64 = base64.b64encode(font_bytes).decode("ascii")
        data_uri = f"data:font/woff2;base64,{b64}"
        # Reemplazar src completo woff2 + ttf por únicamente data URI woff2 (0 peticiones de red offline)
        pattern_pair = (
            r'url\(\.\./webfonts/'
            + re.escape(font_base)
            + r'\.woff2\)\s*format\(["\']woff2["\']\)\s*,\s*url\(\.\./webfonts/'
            + re.escape(font_base)
            + r'\.ttf\)\s*format\(["\']truetype["\']\)'
        )
        replacement = f'url("{data_uri}") format("woff2")'
        css_text = re.sub(pattern_pair, lambda _m, rep=replacement: rep, css_text)
        css_text = css_text.replace(f"../webfonts/{font_base}.woff2", data_uri)

    # Limpiar cualquier otro webfonts residual (ej. fa-v4compatibility no usado) por seguridad
    css_text = re.sub(r'@font-face\{font-family:["\']Font Awesome 6 Compatibility["\'][^}]+\}', "", css_text)
    css_text = re.sub(r',\s*url\(\.\./webfonts/[^)]+\.ttf\)\s*format\(["\']truetype["\']\)', "", css_text)
    return css_text


def safe_inline_js(js_code: str) -> str:
    # Evitar que el parser HTML cierre prematuramente <script> si aparece literal </script
    return re.sub(r"</(script)", r"<\\/\1", js_code, flags=re.IGNORECASE)


def build_seed_gzip_b64() -> tuple[str, int, int]:
    if not os.path.exists(LOADED_CACHE_PATH):
        return "", 0, 0

    with open(LOADED_CACHE_PATH, "r", encoding="utf-8") as f:
        cache_obj = json.load(f)

    loaded_files = cache_obj.get("loaded_files", [])
    clients = cache_obj.get("clients", [])
    compact_payload = json.dumps(
        {"loaded_files": loaded_files, "clients": clients},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")

    gz_bytes = gzip.compress(compact_payload, compresslevel=9)
    b64_str = base64.b64encode(gz_bytes).decode("ascii")
    return b64_str, len(loaded_files), len(clients)


def main() -> None:
    import sys

    embed_seed = "--with-seed" in sys.argv

    with open(INDEX_HTML_PATH, "r", encoding="utf-8") as f:
        html = f.read()
    with open(ENGINE_JS_PATH, "r", encoding="utf-8") as f:
        engine_js = f.read()
    with open(APP_JS_PATH, "r", encoding="utf-8") as f:
        app_js = f.read()

    tailwind_js = fetch_or_cache_bytes("tailwindcss.js", VENDOR_ASSETS["tailwindcss.js"]).decode("utf-8", errors="replace")
    chart_js = fetch_or_cache_bytes("chart.umd.min.js", VENDOR_ASSETS["chart.umd.min.js"]).decode("utf-8", errors="replace")
    fa_css = build_offline_fontawesome_css()

    if embed_seed:
        seed_b64, seed_files_cnt, seed_rows_cnt = build_seed_gzip_b64()
    else:
        seed_b64, seed_files_cnt, seed_rows_cnt = "", 0, 0

    # 1. Reemplazar los 3 CDNs externos por versiones inline 100% offline/online
    cdn_tailwind_tag = '<script src="https://cdn.tailwindcss.com"></script>'
    cdn_chart_tag = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'
    cdn_fa_tag = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />'

    if cdn_tailwind_tag not in html or cdn_chart_tag not in html or cdn_fa_tag not in html:
        raise RuntimeError("No se encontraron las etiquetas CDN esperadas en templates/index.html")

    html = html.replace(cdn_tailwind_tag, f"<script>/* Tailwind CSS Standalone Inline */\n{safe_inline_js(tailwind_js)}\n</script>", 1)
    html = html.replace(cdn_chart_tag, f"<script>/* Chart.js 4.4.1 Inline */\n{safe_inline_js(chart_js)}\n</script>", 1)
    html = html.replace(cdn_fa_tag, f"<style>/* Font Awesome 6.5.1 + Webfonts Inline */\n{fa_css}\n</style>", 1)

    # 2. Distinguir visualmente el título y añadir insignia discreta de Modo Portable Offline/Online
    html = html.replace(
        "<title>Cisco Wireless 3-in-1 Suite: Correlación + Clientes & Usuarios + Inventario APs</title>",
        "<title>Cisco Wi-Fi Clientes — Edición Portable (100% Offline / Online)</title>",
        1,
    )

    badge_target = (
        '<span id="active-day-mode-indicator" class="hidden sm:inline-block text-[10px] '
        'font-semibold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">\n'
        "              TOTAL ACUMULADO\n"
        "            </span>"
    )
    portable_badge = (
        badge_target
        + '\n            <span class="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 '
        'rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40" '
        'title="Archivo HTML autónomo: funciona sin internet, sin Python y guarda tus CSVs en el navegador de este PC">'
        '<i class="fa-solid fa-box-archive text-[9px]"></i> PORTABLE OFFLINE/ONLINE</span>'
    )
    if badge_target in html:
        html = html.replace(badge_target, portable_badge, 1)

    # 3. Reemplazar <script src="/static/app.js?v=..."></script> por Semilla + Motor Portable + app.js + Puente XHR
    script_pattern = re.compile(r'<script\s+src="/static/app\.js[^"]*"></script>')
    if not script_pattern.search(html):
        raise RuntimeError("No se encontró <script src=\"/static/app.js...\"> en templates/index.html")

    inline_bundle = (
        f'<script>\nwindow.__PORTABLE_SEED_GZIP_B64__ = "{seed_b64}";\n</script>\n'
        f"<script>\n/* Cisco Portable Analytics Engine (1:1 con Python csv_analyzer.py + app.py) */\n"
        f"{safe_inline_js(engine_js)}\n</script>\n"
        f"<script>\n/* Frontend UI App */\n{safe_inline_js(app_js)}\n</script>\n"
        "<script>\n"
        "if (typeof window !== 'undefined' && window.__PORTABLE_POST_JSON__) {\n"
        "  postJsonWithProgress = window.__PORTABLE_POST_JSON__;\n"
        "}\n"
        "</script>"
    )
    html = script_pattern.sub(lambda _m: inline_bundle, html, count=1)

    with open(OUTPUT_HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    size_mb = os.path.getsize(OUTPUT_HTML_PATH) / (1024.0 * 1024.0)
    print(f"OK -> Generado: {OUTPUT_HTML_PATH}")
    print(f"Tamaño total: {size_mb:.2f} MB | Archivos semilla: {seed_files_cnt} | Sesiones semilla: {seed_rows_cnt}")


if __name__ == "__main__":
    main()
