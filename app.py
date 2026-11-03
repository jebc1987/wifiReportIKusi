import gzip
import json
import os
import re
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from csv_analyzer import (
    parse_csv_content,
    compute_analytics,
    compute_daily_comparison,
    filter_rows,
    recompute_row_issues,
    apply_onboarding_fp_and_auth_split,
    is_corporate_hostname,
)
from ap_inventory_analyzer import parse_ap_inventory_csv, compute_ap_inventory_analytics
from correlator import correlate_clients_and_aps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = os.path.join(BASE_DIR, "datos_clientes_cisco.csv")
DEFAULT_AP_CSV = os.path.join(BASE_DIR, "datos_inventario_aps_cisco.csv")
CACHE_FILE = os.path.join(BASE_DIR, ".loaded_files_cache.json")

CURRENT_STATE = {
    "filename": "datos_clientes_cisco.csv",
    "loaded_files": [],  # [{"filename": str, "rows": list}]
    "rows": [],
    "filter_options": {},
    "ap_inv_filename": "datos_inventario_aps_cisco.csv",
    "ap_inv_rows": [],
    "exclude_ps_latency": True,
}


def build_by_day_breakdown(rows_list):
    by_day_rows = {}
    for r in rows_list:
        dl = r.get("day_label") or "Sin Día"
        by_day_rows.setdefault(dl, []).append(r)
    breakdown = []
    for dl in sorted(by_day_rows.keys()):
        d_rows = by_day_rows[dl]
        d_an = compute_analytics(d_rows, include_daily=False)
        user_tr_map = {}
        for r in d_rows:
            uid = r.get("user_id") or "--"
            user_tr_map[uid] = round(user_tr_map.get(uid, 0.0) + (r.get("usage_mb") or 0.0), 2)
        breakdown.append({
            "day_label": dl,
            "total_clients": d_an.get("kpis", {}).get("total_clients", 0),
            "unique_users": d_an.get("kpis", {}).get("unique_users", 0),
            "issue_clients_count": d_an.get("kpis", {}).get("issue_clients_count", 0),
            "issue_users_count": d_an.get("kpis", {}).get("issue_users_count", 0),
            "issue_users_pct": d_an.get("kpis", {}).get("issue_users_pct", 0),
            "alert_categories_summary": d_an.get("alert_categories_summary", {}),
            "alert_users_summary": d_an.get("alert_users_summary", {}),
            "ap_summary": d_an.get("ap_summary", []),
            "ap_failure_ranking": d_an.get("ap_failure_ranking", []),
            "floor_client_summary": d_an.get("floor_client_summary", []),
            "device_model_summary": d_an.get("device_model_summary", []),
            "device_vendor_summary": d_an.get("device_vendor_summary", []),
            "device_os_summary": d_an.get("device_os_summary", []),
            "auth_by_os": d_an.get("auth_analytics", {}).get("by_os", []),
            "os_dist": d_an.get("distributions", {}).get("os", {}),
            "retries_bucket": d_an.get("distributions", {}).get("retries_bucket", {}),
            "traffic_total_fmt": d_an.get("traffic_analytics", {}).get("total_usage_fmt", "0 B"),
            "traffic_total_mb": d_an.get("traffic_analytics", {}).get("total_usage_mb", 0),
            "user_traffic_map": user_tr_map,
        })
    return breakdown


def _rows_content_fingerprint(rows):
    """Huella determinística de sesiones para evitar cargar dos veces exactamente el mismo CSV."""
    if not rows:
        return ""
    sample = sorted(
        f"{r.get('mac')}|{r.get('last_seen')}|{r.get('usage_b')}|{r.get('ap_name')}"
        for r in rows
    )
    return f"{len(rows)}::{hash(tuple(sample))}"


def rebuild_combined_rows():
    ap_health_map = {a["ap_name"]: a.get("health") for a in CURRENT_STATE.get("ap_inv_rows", [])}
    all_rows = []
    idx = 1
    for fobj in CURRENT_STATE["loaded_files"]:
        for r in fobj["rows"]:
            r["id"] = idx
            r["ap_health"] = ap_health_map.get(r.get("ap_name"))
            all_rows.append(r)
            idx += 1
    apply_onboarding_fp_and_auth_split(all_rows, exclude_fp=CURRENT_STATE.get("exclude_ps_latency", True))
    CURRENT_STATE["rows"] = all_rows
    if not CURRENT_STATE["loaded_files"]:
        CURRENT_STATE["filename"] = "Sin archivos"
    elif len(CURRENT_STATE["loaded_files"]) == 1:
        CURRENT_STATE["filename"] = CURRENT_STATE["loaded_files"][0]["filename"]
    else:
        CURRENT_STATE["filename"] = f"{len(CURRENT_STATE['loaded_files'])} archivos CSV acumulados"
    CURRENT_STATE["filter_options"] = build_filter_options(
        CURRENT_STATE["rows"], CURRENT_STATE["ap_inv_rows"]
    )
    # Precalcular en memoria daily_comparison y resúmenes por día para respuesta instantánea
    CURRENT_STATE["cached_daily_comparison"] = compute_daily_comparison(all_rows)
    total_an = compute_analytics(all_rows, include_daily=False)
    day_summaries = {
        "ALL": {
            "ap_summary": total_an.get("ap_summary", []),
            "floor_client_summary": total_an.get("floor_client_summary", []),
        }
    }
    by_day_rows = {}
    for r in all_rows:
        dl = r.get("day_label") or "Sin Día"
        by_day_rows.setdefault(dl, []).append(r)
    for dl, d_rows in by_day_rows.items():
        d_an = compute_analytics(d_rows, include_daily=False)
        day_summaries[dl] = {
            "ap_summary": d_an.get("ap_summary", []),
            "floor_client_summary": d_an.get("floor_client_summary", []),
        }
    CURRENT_STATE["cached_day_summaries"] = day_summaries
    CURRENT_STATE["cached_by_day_breakdown"] = build_by_day_breakdown(all_rows)


def sort_floor_key(floor_str):
    """Ordena pisos lógicamente: Sótano 2, Sótano 1, Auditorio, Piso 1, Mezzanine, Piso 2 ... Piso 12."""
    s = (floor_str or "").lower()
    if "sótano 2" in s or "sotano 2" in s:
        return (-2, s)
    if "sótano 1" in s or "sotano 1" in s:
        return (-1, s)
    if "auditorio" in s:
        return (0, s)
    if "mezzanine" in s:
        return (1.5, s)
    m = re.search(r"piso\s*(\d+)", s)
    if m:
        return (float(m.group(1)), s)
    return (99, s)


def build_filter_options(rows, ap_inv_rows=None):
    def unique_sorted(lst, key):
        vals = set(r[key] for r in lst if r.get(key) and r[key] != "--")
        return sorted(vals)

    ap_inv_rows = ap_inv_rows or []
    client_floors = set(r["floor"] for r in rows if r.get("floor") and r["floor"] != "--")
    ap_floors = set(a["floor"] for a in ap_inv_rows if a.get("floor") and a["floor"] != "--")
    all_floors = sorted(client_floors | ap_floors, key=sort_floor_key)

    return {
        "source_files": [f["filename"] for f in CURRENT_STATE.get("loaded_files", [])],
        "days": unique_sorted(rows, "day_label"),
        "aps": unique_sorted(rows, "ap_name"),
        "client_floors": sorted(client_floors, key=sort_floor_key),
        "floors": all_floors,
        "bands": unique_sorted(rows, "band"),
        "protocols": unique_sorted(rows, "protocol"),
        "capabilities": unique_sorted(rows, "capability"),
        "statuses": unique_sorted(rows, "status"),
        "oses": unique_sorted(rows, "os"),
        "endpoints": unique_sorted(rows, "endpoint_type"),
        "switches": unique_sorted(ap_inv_rows, "switch_name"),
        "rf_qualities": [
            "Excelente (>= -60 dBm)",
            "Buena (-61 a -67 dBm)",
            "Regular (-68 a -79 dBm)",
            "Crítica (< -79 dBm / Sticky)",
            "Sin señal (N/A)",
        ],
        "retry_ranges": [
            {"code": "0-10", "label": "0% - 10% (Óptimo)"},
            {"code": "11-20", "label": "11% - 20% (Normal)"},
            {"code": "21-24", "label": "21% - 24% (Elevado)"},
            {"code": "25-30", "label": "25% - 30% (Alto)"},
            {"code": "31-100", "label": "> 30% (Crítico)"},
            {"code": "20-100", "label": ">= 20% (Todos con contención)"},
            {"code": "25-100", "label": ">= 25% (Todos en alerta SLA)"},
        ],
    }


def save_cache():
    try:
        data = {
            "loaded_files": [
                {"filename": f["filename"], "day_label": f.get("day_label"), "count": len(f["rows"])}
                for f in CURRENT_STATE.get("loaded_files", [])
            ],
            "clients": CURRENT_STATE.get("rows", []),
        }
        with open(CACHE_FILE, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False)
    except Exception:
        pass


def load_initial_files(ignore_cache=False):
    CURRENT_STATE["loaded_files"] = []
    if not ignore_cache and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as fp:
                cached = json.load(fp)
            c_files = cached.get("loaded_files", [])
            c_rows = cached.get("clients", [])
            if c_files and c_rows:
                excl_ps = CURRENT_STATE.get("exclude_ps_latency", True)
                rows_by_file = {}
                for r in c_rows:
                    recompute_row_issues(r, exclude_ps_latency=excl_ps)
                    sf = r.get("source_file") or c_files[0]["filename"]
                    rows_by_file.setdefault(sf, []).append(r)
                seen_cache_sigs = set()
                for fmeta in c_files:
                    fname = fmeta["filename"]
                    frows = rows_by_file.get(fname, [])
                    if frows:
                        sig = _rows_content_fingerprint(frows)
                        if sig and sig in seen_cache_sigs:
                            continue
                        seen_cache_sigs.add(sig)
                        CURRENT_STATE["loaded_files"].append({
                            "filename": fname,
                            "day_label": fmeta.get("day_label") or frows[0].get("day_label") or fname,
                            "rows": frows,
                        })
        except Exception:
            CURRENT_STATE["loaded_files"] = []

    if not CURRENT_STATE["loaded_files"] and os.path.exists(DEFAULT_CSV):
        with open(DEFAULT_CSV, "r", encoding="utf-8", errors="replace") as f:
            rows = parse_csv_content(
                f.read(),
                source_file="datos_clientes_cisco.csv",
                exclude_ps_latency=CURRENT_STATE.get("exclude_ps_latency", True),
            )
            inferred_day = rows[0].get("day_label", "2026-10-21") if rows else "2026-10-21"
            CURRENT_STATE["loaded_files"].append({
                "filename": "datos_clientes_cisco.csv",
                "day_label": inferred_day,
                "rows": rows,
            })
    if os.path.exists(DEFAULT_AP_CSV):
        with open(DEFAULT_AP_CSV, "r", encoding="utf-8", errors="replace") as f:
            CURRENT_STATE["ap_inv_rows"] = parse_ap_inventory_csv(f.read())

    rebuild_combined_rows()
    save_cache()


def filter_ap_inv_rows(ap_rows, params):
    filtered = ap_rows
    q = (params.get("ap_q") or "").strip().lower()
    if q:
        filtered = [
            a for a in filtered
            if q in a["ap_name"].lower()
            or q in a["ip"].lower()
            or q in a["base_radio_mac"].lower()
            or q in a["floor"].lower()
            or q in a["switch_name"].lower()
        ]
    floor = params.get("floor") or params.get("global_floor")
    if floor and floor != "ALL":
        filtered = [a for a in filtered if a["floor"] == floor]
    sw = params.get("switch")
    if sw and sw != "ALL":
        filtered = [a for a in filtered if a["switch_name"] == sw]
    only_ap_alerts = params.get("only_ap_alerts")
    if only_ap_alerts == "true":
        filtered = [a for a in filtered if a["alert_count"] > 0]

    ap_condition = params.get("ap_condition")
    if ap_condition == "util_5g_50":
        filtered = [a for a in filtered if (a.get("r1_utilization") or 0) >= 50]
    elif ap_condition == "int_5g_15":
        filtered = [a for a in filtered if (a.get("r1_interference") or 0) >= 15]
    elif ap_condition == "link_100m":
        filtered = [a for a in filtered if 0 < (a.get("link_speed_mbps") or 0) <= 100]
    elif ap_condition == "link_degraded":
        filtered = [a for a in filtered if 0 < (a.get("link_speed_mbps") or 0) < 10000]
    elif ap_condition == "has_issues":
        filtered = [a for a in filtered if (a.get("issue_count") or 0) > 0]
    elif ap_condition == "overload_35":
        filtered = [a for a in filtered if (a.get("total_clients") or 0) >= 35]
    elif ap_condition == "health_low":
        filtered = [a for a in filtered if a.get("health") is None or a.get("health") < 10]
    elif ap_condition == "health_crit":
        filtered = [a for a in filtered if a.get("health") is not None and a.get("health") <= 1]
    elif ap_condition == "health_mid":
        filtered = [a for a in filtered if a.get("health") is not None and 2 <= a.get("health") < 10]
    elif ap_condition == "health_10":
        filtered = [a for a in filtered if a.get("health") == 10]

    ap_health_bucket = params.get("ap_health_bucket")
    if ap_health_bucket and ap_health_bucket != "ALL":
        filtered = [a for a in filtered if a.get("health_bucket") == ap_health_bucket]

    disconnect_ts = params.get("disconnect_ts")
    if disconnect_ts and disconnect_ts != "ALL":
        filtered = [a for a in filtered if a.get("last_disconnect") == disconnect_ts]

    uptime_bucket = params.get("uptime_bucket")
    if uptime_bucket and uptime_bucket != "ALL":
        filtered = [a for a in filtered if a.get("uptime_bucket") == uptime_bucket]

    return filtered


def build_unified_response(filtered_client_rows, filtered_ap_inv_rows=None, params=None):
    # Calcular línea base del Día/Piso/AP seleccionado (todos los clientes reales del día sin recortar
    # cuando se selecciona un botón de Tipo de Falla / Alarma en la Sección 2)
    issue_filter_keys = ("alert_cat", "alarm_tag", "only_issues", "retry_range", "min_retries", "max_retries")
    has_issue_subfilter = bool(
        params and any(params.get(k) not in (None, "", "ALL", "false") for k in issue_filter_keys)
    )
    if has_issue_subfilter:
        params_baseline = {k: v for k, v in (params or {}).items() if k not in issue_filter_keys}
        baseline_rows = filter_rows(CURRENT_STATE["rows"], params_baseline)
        analytics = compute_analytics(baseline_rows, include_daily=False)
    else:
        baseline_rows = filtered_client_rows
        analytics = compute_analytics(filtered_client_rows, include_daily=False)

    analytics["baseline_floor_summary"] = analytics.get("floor_client_summary", [])
    analytics["baseline_ap_summary"] = analytics.get("ap_summary", [])
    analytics["baseline_alert_categories"] = analytics.get("alert_categories_summary", {})
    analytics["baseline_issue_clients_count"] = analytics.get("kpis", {}).get("issue_clients_count", 0)
    analytics["baseline_total_clients"] = analytics.get("kpis", {}).get("total_clients", 0)

    # En Sección 3 (Top APs y Pisos con más usuarios), usar baseline_ap_summary / baseline_floor_summary
    # para que respete el Día y el Piso seleccionados, sin recortarse cuando se filtra un tipo de alarma
    analytics["day_ap_summary"] = analytics.get("ap_summary", [])
    analytics["day_floor_summary"] = analytics.get("floor_client_summary", [])

    # En Sección 1 (Resumen por Día vs Total Acumulado):
    # Si se seleccionó un Piso, AP, SO, etc., calcular la comparativa diaria filtrada por ese Piso/AP
    # (excluyendo únicamente day_label y los filtros de tipo de falla para mostrar todos los días de ese Piso).
    params_for_daily = {
        k: v
        for k, v in (params or {}).items()
        if k not in ("day_label", "source_file", "exclude_ps_latency") and k not in issue_filter_keys and v not in (None, "", "ALL", "false")
    }
    if not params_for_daily:
        analytics["daily_comparison"] = CURRENT_STATE.get("cached_daily_comparison") or compute_daily_comparison(CURRENT_STATE["rows"])
        analytics["by_day_breakdown"] = CURRENT_STATE.get("cached_by_day_breakdown") or build_by_day_breakdown(CURRENT_STATE["rows"])
    else:
        rows_for_daily = filter_rows(CURRENT_STATE["rows"], params_for_daily)
        analytics["daily_comparison"] = compute_daily_comparison(rows_for_daily)
        analytics["by_day_breakdown"] = build_by_day_breakdown(rows_for_daily)

    analytics["active_day_filter"] = (params or {}).get("day_label") or "ALL"
    analytics["active_floor_filter"] = (params or {}).get("client_floor") or "ALL"
    analytics["active_ap_filter"] = (params or {}).get("ap") or "ALL"
    analytics["active_corp_filter"] = ((params or {}).get("corp_filter") or "ALL").upper()
    analytics["active_alert_cat"] = (params or {}).get("alert_cat") or "ALL"
    analytics["has_issue_subfilter"] = has_issue_subfilter
    analytics["exclude_ps_latency"] = CURRENT_STATE.get("exclude_ps_latency", True)
    fp_lat = sum(1 for r in baseline_rows if r.get("is_ps_latency_fp"))
    fp_ret = sum(1 for r in baseline_rows if r.get("is_retry_fp"))
    fp_auth = sum(1 for r in baseline_rows if r.get("is_auth_fp"))
    fp_dhcp = sum(1 for r in baseline_rows if r.get("is_dhcp_fp"))
    fp_roam = sum(1 for r in baseline_rows if r.get("is_roam_fp"))
    analytics["ps_latency_fp_count"] = sum(1 for r in baseline_rows if r.get("is_any_fp"))
    analytics["fp_breakdown"] = {
        "latency": fp_lat,
        "retries": fp_ret,
        "auth": fp_auth,
        "dhcp": fp_dhcp,
        "roam": fp_roam,
    }

    # Resumen filtrado por la alarma activa para que las 6 gráficas de la Sección 2 se adapten
    # exactamente al Tipo de Falla / Alarma seleccionado sin perder los denominadores de línea base.
    if has_issue_subfilter:
        sub_an = compute_analytics(filtered_client_rows, include_daily=False)
        params_sub_daily = {
            k: v
            for k, v in (params or {}).items()
            if k not in ("day_label", "source_file") and v not in (None, "", "ALL", "false")
        }
        rows_sub_daily = filter_rows(CURRENT_STATE["rows"], params_sub_daily)
        analytics["issue_filtered"] = {
            "total_records": len(filtered_client_rows),
            "floor_client_summary": sub_an.get("floor_client_summary", []),
            "device_model_summary": sub_an.get("device_model_summary", []),
            "device_vendor_summary": sub_an.get("device_vendor_summary", []),
            "device_os_summary": sub_an.get("device_os_summary", []),
            "ap_summary": sub_an.get("ap_summary", []),
            "ap_failure_ranking": sub_an.get("ap_failure_ranking", []),
            "auth_analytics": sub_an.get("auth_analytics", {}),
            "distributions": sub_an.get("distributions", {}),
            "alert_categories_summary": sub_an.get("alert_categories_summary", {}),
        }
        analytics["issue_filtered_by_day"] = build_by_day_breakdown(rows_sub_daily)
    else:
        analytics["issue_filtered"] = None
        analytics["issue_filtered_by_day"] = None

    # Conteos de Todo vs Corporativo (COL-) vs Externo para el Día/Piso/AP seleccionado (sin recortar por corp_filter)
    params_no_corp = {
        k: v
        for k, v in (params or {}).items()
        if k not in ("corp_filter",) and k not in issue_filter_keys
    }
    scope_rows = filter_rows(CURRENT_STATE["rows"], params_no_corp) if params_no_corp else CURRENT_STATE["rows"]
    c_rows_corp = [r for r in scope_rows if is_corporate_hostname(r.get("hostname"))]
    c_rows_ext = [r for r in scope_rows if not is_corporate_hostname(r.get("hostname"))]
    analytics["corp_breakdown"] = {
        "all_clients": len(scope_rows),
        "all_users": len(set(r["user_id"] for r in scope_rows if r.get("user_id") and r["user_id"] != "--")),
        "corp_clients": len(c_rows_corp),
        "corp_users": len(set(r["user_id"] for r in c_rows_corp if r.get("user_id") and r["user_id"] != "--")),
        "ext_clients": len(c_rows_ext),
        "ext_users": len(set(r["user_id"] for r in c_rows_ext if r.get("user_id") and r["user_id"] != "--")),
    }
    analytics["filename"] = CURRENT_STATE["filename"]
    analytics["loaded_files"] = [
        {
            "filename": f["filename"],
            "day_label": f.get("day_label") or (f["rows"][0].get("day_label") if f["rows"] else f["filename"]),
            "count": len(f["rows"]),
        }
        for f in CURRENT_STATE.get("loaded_files", [])
    ]
    analytics["unfiltered_total"] = len(CURRENT_STATE["rows"])
    analytics["filter_options"] = CURRENT_STATE["filter_options"]
    analytics["ap_inventory"] = {"filename": CURRENT_STATE["ap_inv_filename"], "total_aps": 0, "unfiltered_total": 0}
    analytics["correlation"] = {}
    return analytics


class UnifiedAnalyzerHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        raw_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        accept_enc = self.headers.get("Accept-Encoding", "")
        if "gzip" in accept_enc and len(raw_bytes) > 1024:
            body = gzip.compress(raw_bytes, compresslevel=1)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw_bytes)

    def _send_file(self, filepath, content_type):
        if not os.path.exists(filepath):
            self.send_error(404, "Archivo no encontrado")
            return
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            self._send_file(
                os.path.join(BASE_DIR, "templates", "index.html"),
                "text/html; charset=utf-8",
            )
        elif path == "/static/app.js":
            self._send_file(
                os.path.join(BASE_DIR, "static", "app.js"),
                "application/javascript; charset=utf-8",
            )
        elif path == "/api/data":
            qs = urllib.parse.parse_qs(parsed.query)
            params = {k: v[0] for k, v in qs.items()}
            if "exclude_ps_latency" in params:
                req_excl = str(params["exclude_ps_latency"]).lower() != "false"
                if req_excl != CURRENT_STATE.get("exclude_ps_latency", True):
                    CURRENT_STATE["exclude_ps_latency"] = req_excl
                    for fobj in CURRENT_STATE.get("loaded_files", []):
                        for r in fobj.get("rows", []):
                            recompute_row_issues(r, exclude_ps_latency=req_excl)
                    rebuild_combined_rows()
            filtered_clients = filter_rows(CURRENT_STATE["rows"], params)
            filtered_aps = filter_ap_inv_rows(CURRENT_STATE["ap_inv_rows"], params)
            self._send_json(build_unified_response(filtered_clients, filtered_aps, params))
        else:
            self.send_error(404, "Ruta no encontrada")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)

        if parsed.path == "/api/upload":
            try:
                payload = json.loads(raw_body.decode("utf-8", errors="replace"))
                mode = payload.get("mode", "append")  # "append" o "replace"
                files_list = payload.get("files")
                if not files_list:
                    files_list = [{
                        "filename": payload.get("filename", "clientes.csv"),
                        "content": payload.get("content", ""),
                    }]

                new_file_entries = []
                existing_names = {f["filename"] for f in CURRENT_STATE["loaded_files"]} if mode == "append" else set()
                existing_sigs = (
                    {_rows_content_fingerprint(f["rows"]) for f in CURRENT_STATE["loaded_files"]}
                    if mode == "append"
                    else set()
                )
                skipped_duplicates = 0

                for item in files_list:
                    base_name = item.get("filename", "clientes.csv")
                    user_day = (item.get("day_label") or "").strip()
                    csv_text = item.get("content", "")
                    final_name = base_name
                    counter = 2
                    while final_name in existing_names:
                        name_part, ext_part = os.path.splitext(base_name)
                        final_name = f"{name_part} ({counter}){ext_part}"
                        counter += 1
                    parsed_rows = parse_csv_content(
                        csv_text,
                        source_file=final_name,
                        day_label=user_day or None,
                        exclude_ps_latency=CURRENT_STATE.get("exclude_ps_latency", True),
                    )
                    if parsed_rows:
                        sig = _rows_content_fingerprint(parsed_rows)
                        if sig and sig in existing_sigs:
                            skipped_duplicates += 1
                            continue
                        existing_sigs.add(sig)
                        existing_names.add(final_name)
                        effective_day = user_day or parsed_rows[0].get("day_label") or final_name
                        new_file_entries.append({
                            "filename": final_name,
                            "day_label": effective_day,
                            "rows": parsed_rows,
                        })

                if not new_file_entries and skipped_duplicates == 0:
                    self._send_json({"error": "Ninguno de los archivos CSV seleccionados contiene registros válidos de clientes."}, 400)
                    return

                if mode == "replace":
                    CURRENT_STATE["loaded_files"] = new_file_entries
                else:
                    CURRENT_STATE["loaded_files"].extend(new_file_entries)

                rebuild_combined_rows()
                save_cache()
                self._send_json(build_unified_response(CURRENT_STATE["rows"], CURRENT_STATE["ap_inv_rows"]))
            except Exception as e:
                self._send_json({"error": f"Error procesando CSV(s) de Clientes: {str(e)}"}, 500)

        elif parsed.path == "/api/remove-csv":
            try:
                payload = json.loads(raw_body.decode("utf-8", errors="replace"))
                action = payload.get("action", "remove")
                target_file = payload.get("filename")
                if action == "clear_all":
                    CURRENT_STATE["loaded_files"] = []
                    rebuild_combined_rows()
                    save_cache()
                elif action == "reset":
                    load_initial_files(ignore_cache=True)
                    save_cache()
                elif action == "rename_day" and target_file:
                    new_day = (payload.get("day_label") or "").strip()
                    if new_day:
                        for f in CURRENT_STATE["loaded_files"]:
                            if f["filename"] == target_file:
                                f["day_label"] = new_day
                                for r in f["rows"]:
                                    r["day_label"] = new_day
                        rebuild_combined_rows()
                        save_cache()
                elif target_file:
                    CURRENT_STATE["loaded_files"] = [
                        f for f in CURRENT_STATE["loaded_files"] if f["filename"] != target_file
                    ]
                    rebuild_combined_rows()
                    save_cache()
                self._send_json(build_unified_response(CURRENT_STATE["rows"], CURRENT_STATE["ap_inv_rows"]))
            except Exception as e:
                self._send_json({"error": f"Error al gestionar archivos CSV: {str(e)}"}, 500)

        elif parsed.path == "/api/upload-ap-csv":
            try:
                payload = json.loads(raw_body.decode("utf-8", errors="replace"))
                filename = payload.get("filename", "inventario_aps.csv")
                csv_text = payload.get("content", "")
                ap_rows = parse_ap_inventory_csv(csv_text)
                if not ap_rows:
                    self._send_json({"error": "El CSV de APs no contiene registros válidos."}, 400)
                    return
                CURRENT_STATE["ap_inv_filename"] = filename
                CURRENT_STATE["ap_inv_rows"] = ap_rows
                CURRENT_STATE["filter_options"] = build_filter_options(CURRENT_STATE["rows"], ap_rows)
                self._send_json(build_unified_response(CURRENT_STATE["rows"], ap_rows))
            except Exception as e:
                self._send_json({"error": f"Error procesando CSV APs: {str(e)}"}, 500)
        else:
            self.send_error(404, "Ruta POST no encontrada")

    def log_message(self, format, *args):
        pass


def run_server(port=8060):
    load_initial_files()
    server = ThreadingHTTPServer(("127.0.0.1", port), UnifiedAnalyzerHandler)
    print("=" * 76)
    print("  SUITE 3 DASHBOARDS: CORRELACIÓN + CLIENTES CSV + INVENTARIO APs")
    print(f"  1) CSV Clientes: {CURRENT_STATE['filename']} ({len(CURRENT_STATE['rows'])} sesiones)")
    print(f"  2) CSV APs RF:   {CURRENT_STATE['ap_inv_filename']} ({len(CURRENT_STATE['ap_inv_rows'])} APs CW9176I)")
    print(f"  URL Local:       http://localhost:{port}")
    print("=" * 76)
    server.serve_forever()


if __name__ == "__main__":
    run_server(8060)
