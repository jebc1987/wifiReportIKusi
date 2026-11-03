"""
Analizador de Inventario, Salud de Radios RF e Infraestructura de Access Points Cisco
(Exportación de Dispositivos AP de Cisco Catalyst Center / WLC).
"""

import csv
import io
import re
from collections import defaultdict
from csv_analyzer import parse_float, clean_str, infer_floor_from_ap_or_location


def parse_uptime_days(uptime_str):
    if not uptime_str or uptime_str == "--":
        return 0.0
    days = 0.0
    m_d = re.search(r"(\d+)\s*day", uptime_str, re.I)
    if m_d:
        days += float(m_d.group(1))
    m_h = re.search(r"(\d+)\s*hour", uptime_str, re.I)
    if m_h:
        days += float(m_h.group(1)) / 24.0
    m_m = re.search(r"(\d+)\s*min", uptime_str, re.I)
    if m_m:
        days += float(m_m.group(1)) / 1440.0
    return round(days, 1)


def classify_ap_uptime_bucket(days):
    if days <= 0:
        return "Sin dato"
    if days < 5:
        return "< 5 días (Reinicio Reciente)"
    if days < 15:
        return "5 - 15 días"
    return ">= 15 días (Estable)"


def normalize_ap_row(raw, idx):
    ap_name = clean_str(raw.get("Device Name"), f"AP-{idx}")
    loc = clean_str(raw.get("Location"), "Sin Ubicación")
    floor = infer_floor_from_ap_or_location(ap_name, loc)

    total_clients = int(parse_float(raw.get("Client Count"), 0) or 0)
    r0_clients = int(parse_float(raw.get("Radio 0 Client Count"), 0) or 0)
    r1_clients = int(parse_float(raw.get("Radio 1 Client Count"), 0) or 0)
    r2_clients = int(parse_float(raw.get("Radio 2 Client Count"), 0) or 0)

    r0_band = clean_str(raw.get("Radio 0 Band"), "2.4 GHz")
    r1_band = clean_str(raw.get("Radio 1 Band"), "5 GHz")
    r2_band = clean_str(raw.get("Radio 2 Band"), "6 GHz")

    r0_int = parse_float(raw.get("Radio 0 Interference"))
    r1_int = parse_float(raw.get("Radio 1 Interference"))
    r0_util = parse_float(raw.get("Radio 0 Utilization"))
    r1_util = parse_float(raw.get("Radio 1 Utilization"))
    r0_noise = parse_float(raw.get("Radio 0 Noise"))
    r1_noise = parse_float(raw.get("Radio 1 Noise"))
    r0_aq = parse_float(raw.get("Radio 0 Air Quality"))
    r1_aq = parse_float(raw.get("Radio 1 Air Quality"))

    link_speed_str = clean_str(raw.get("Link 0 Speed"), "--")
    link_speed_mbps = int(parse_float(link_speed_str, 0) or 0)

    cpu_pct = parse_float(raw.get("CPU Utilization"), 0.0)
    mem_pct = parse_float(raw.get("Memory Utilization"), 0.0)
    issue_count = int(parse_float(raw.get("Issue Type Count"), 0) or 0)
    raw_health = parse_float(raw.get("Overall Health"), None)
    overall_health = int(raw_health) if raw_health is not None else None

    if overall_health is None:
        health_bucket = "Sin Health (--)"
    elif overall_health >= 8:
        health_bucket = "10/10 (Óptimo)"
    elif overall_health >= 5:
        health_bucket = "6 - 7 / 10 (Regular)"
    else:
        health_bucket = "1 / 10 (Crítico)"

    # Detectar anomalías de infraestructura y RF en el AP
    ap_alerts = []
    if overall_health is not None and overall_health <= 1:
        ap_alerts.append(f"Overall Health Crítico ({overall_health}/10)")
    elif overall_health is not None and overall_health < 10:
        ap_alerts.append(f"Overall Health Degradado ({overall_health}/10)")
    elif overall_health is None:
        ap_alerts.append("Overall Health sin telemetría (--)")

    if link_speed_mbps > 0 and link_speed_mbps <= 100:
        ap_alerts.append(f"Enlace Ethernet degradado ({link_speed_mbps} Mbps)")
    elif link_speed_mbps == 5000:
        ap_alerts.append("Enlace Multigigabit a 5 Gbps (vs 10 Gbps estándar)")
    if r1_util is not None and r1_util >= 50:
        ap_alerts.append(f"Canal 5 GHz saturado (Utilización {int(r1_util)}%)")
    if r0_util is not None and r0_util >= 55:
        ap_alerts.append(f"Canal {r0_band} saturado (Utilización {int(r0_util)}%)")
    if r1_int is not None and r1_int >= 15:
        ap_alerts.append(f"Interferencia 5 GHz alta ({int(r1_int)}%)")
    if r0_int is not None and r0_int >= 50:
        ap_alerts.append(f"Interferencia {r0_band} crítica ({int(r0_int)}%)")
    if total_clients >= 35:
        ap_alerts.append(f"Sobrecarga de clientes ({total_clients} asociados)")
    if cpu_pct == 0 and mem_pct == 0 and total_clients > 0:
        ap_alerts.append("Anomalía Telemetría (CPU/Mem 0% con clientes activos)")
    if issue_count > 0:
        ap_alerts.append(f"{issue_count} Issue(s) reportados en Catalyst Center")

    return {
        "id": idx,
        "ap_name": ap_name,
        "state": clean_str(raw.get("Communication State"), "UP"),
        "model": clean_str(raw.get("Model"), "CW9176I"),
        "os_version": clean_str(raw.get("OS Version")),
        "ip": clean_str(raw.get("IP Address")),
        "wlc": clean_str(raw.get("WLC")),
        "health": overall_health,
        "health_bucket": health_bucket,
        "issue_count": issue_count,
        "location": loc,
        "floor": floor,
        "base_radio_mac": clean_str(raw.get("Base Radio MAC")),
        "ap_mode": clean_str(raw.get("AP Mode")),
        "total_clients": total_clients,
        "r0_clients": r0_clients,
        "r1_clients": r1_clients,
        "r2_clients": r2_clients,
        "r0_band": r0_band,
        "r1_band": r1_band,
        "r2_band": r2_band,
        "dual_5ghz": r0_band == "5 GHz" and r1_band == "5 GHz",
        "r0_interference": r0_int,
        "r1_interference": r1_int,
        "r0_utilization": r0_util,
        "r1_utilization": r1_util,
        "r0_noise": r0_noise,
        "r1_noise": r1_noise,
        "r0_air_quality": r0_aq,
        "r1_air_quality": r1_aq,
        "link_name": clean_str(raw.get("Link 0 Name")),
        "link_speed_str": link_speed_str,
        "link_speed_mbps": link_speed_mbps,
        "cpu_pct": cpu_pct,
        "mem_pct": mem_pct,
        "uptime": clean_str(raw.get("Uptime")),
        "uptime_days": parse_uptime_days(clean_str(raw.get("Uptime"))),
        "uptime_bucket": classify_ap_uptime_bucket(parse_uptime_days(clean_str(raw.get("Uptime")))),
        "switch_name": clean_str(raw.get("Connected Device")),
        "last_disconnect": clean_str(raw.get("Last Disconnect Time")),
        "alerts": ap_alerts,
        "alert_count": len(ap_alerts),
    }


def parse_ap_inventory_csv(text_content):
    if text_content.startswith("\ufeff"):
        text_content = text_content.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text_content))
    rows = []
    for idx, raw in enumerate(reader, start=1):
        if not any(raw.values()):
            continue
        rows.append(normalize_ap_row(raw, idx))
    return rows


def compute_ap_inventory_analytics(ap_rows, client_rows=None):
    total_aps = len(ap_rows)
    if total_aps == 0:
        return {"total_aps": 0}

    # Cruzar cuántos clientes existen en el CSV 1 para cada AP
    csv1_by_ap = defaultdict(list)
    for c in (client_rows or []):
        csv1_by_ap[c.get("ap_name", "Sin AP")].append(c)

    for a in ap_rows:
        c_list = csv1_by_ap.get(a["ap_name"], [])
        a["csv1_clients_count"] = len(c_list)
        c_rets = [c["retries"] for c in c_list if c.get("retries") is not None]
        a["csv1_avg_retries"] = round(sum(c_rets) / len(c_rets), 1) if c_rets else None
        a["csv1_high_retries"] = sum(1 for c in c_list if (c.get("retries") or 0) >= 25)

    total_clients = sum(a["total_clients"] for a in ap_rows)
    r0_clients = sum(a["r0_clients"] for a in ap_rows)
    r1_clients = sum(a["r1_clients"] for a in ap_rows)
    r2_clients = sum(a["r2_clients"] for a in ap_rows)

    r1_utils = [a["r1_utilization"] for a in ap_rows if a["r1_utilization"] is not None]
    r0_utils = [a["r0_utilization"] for a in ap_rows if a["r0_utilization"] is not None]
    r1_ints = [a["r1_interference"] for a in ap_rows if a["r1_interference"] is not None]
    r0_ints = [a["r0_interference"] for a in ap_rows if a["r0_interference"] is not None]
    cpus = [a["cpu_pct"] for a in ap_rows if a["cpu_pct"] is not None]
    healths = [a["health"] for a in ap_rows if a["health"] is not None]

    avg = lambda lst: round(sum(lst) / len(lst), 1) if lst else 0.0

    high_util_5g = [a for a in ap_rows if (a["r1_utilization"] or 0) >= 50]
    high_int_5g = [a for a in ap_rows if (a["r1_interference"] or 0) >= 15]
    degraded_links = [a for a in ap_rows if 0 < a["link_speed_mbps"] < 10000]
    fast_eth_links = [a for a in ap_rows if 0 < a["link_speed_mbps"] <= 100]
    dual_5g_aps = [a for a in ap_rows if a["dual_5ghz"]]
    aps_with_issues = [a for a in ap_rows if a["issue_count"] > 0]
    low_health_aps = [a for a in ap_rows if a["health"] is None or a["health"] < 10]
    critical_health_aps = [a for a in ap_rows if a["health"] is not None and a["health"] <= 1]
    regular_health_aps = [a for a in ap_rows if a["health"] is not None and 2 <= a["health"] < 10]

    health_buckets = {
        "10/10 (Óptimo)": 0,
        "6 - 7 / 10 (Regular)": 0,
        "1 / 10 (Crítico)": 0,
        "Sin Health (--)": 0,
    }
    for a in ap_rows:
        hb = a.get("health_bucket", "10/10 (Óptimo)")
        if hb in health_buckets:
            health_buckets[hb] += 1

    # Agrupación por Piso / Ubicación
    floor_groups = defaultdict(list)
    for a in ap_rows:
        floor_groups[a["floor"]].append(a)

    floor_summary = []
    for floor_name, f_aps in floor_groups.items():
        f_r1_u = [x["r1_utilization"] for x in f_aps if x["r1_utilization"] is not None]
        f_r1_i = [x["r1_interference"] for x in f_aps if x["r1_interference"] is not None]
        f_hlth = [x["health"] for x in f_aps if x["health"] is not None]
        floor_summary.append({
            "floor": floor_name,
            "ap_count": len(f_aps),
            "client_count": sum(x["total_clients"] for x in f_aps),
            "csv1_client_count": sum(x.get("csv1_clients_count", 0) for x in f_aps),
            "avg_health": avg(f_hlth),
            "low_health_count": sum(1 for x in f_aps if x["health"] is None or x["health"] < 10),
            "avg_5g_util": avg(f_r1_u),
            "max_5g_util": max(f_r1_u) if f_r1_u else 0,
            "avg_5g_int": avg(f_r1_i),
            "switch_names": sorted(list(set(x["switch_name"] for x in f_aps if x["switch_name"] != "--"))),
            "issues_sum": sum(x["issue_count"] for x in f_aps),
        })
    floor_summary.sort(key=lambda x: x["client_count"], reverse=True)

    # Series Temporales de APs: Eventos de Última Desconexión (Last Disconnect Time), Uptime y Overall Health por Tiempo
    disconnect_events_map = defaultdict(list)
    uptime_groups_map = {
        "< 5 días (Reinicio Reciente)": [],
        "5 - 15 días": [],
        ">= 15 días (Estable)": [],
    }
    uptime_buckets = {
        "< 5 días (Reinicio Reciente)": 0,
        "5 - 15 días": 0,
        ">= 15 días (Estable)": 0,
    }
    for a in ap_rows:
        dt = a.get("last_disconnect", "--")
        if dt and dt != "--":
            disconnect_events_map[dt].append(a)
        ub = a.get("uptime_bucket", ">= 15 días (Estable)")
        if ub in uptime_buckets:
            uptime_buckets[ub] += 1
            uptime_groups_map[ub].append(a)

    disconnect_timeline = []
    for k, v in sorted(disconnect_events_map.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
        v_hlth = [x["health"] for x in v if x.get("health") is not None]
        disconnect_timeline.append({
            "timestamp": k,
            "ap_count": len(v),
            "avg_health": avg(v_hlth) if v_hlth else 10.0,
            "low_health_count": sum(1 for x in v if x.get("health") is None or x.get("health") < 10),
            "aps": [f"{x['ap_name']} (Health {x['health'] if x.get('health') is not None else '--'}/10)" for x in v[:8]],
        })

    uptime_health_timeline = []
    for ub_label, ub_aps in uptime_groups_map.items():
        u_hlth = [x["health"] for x in ub_aps if x.get("health") is not None]
        uptime_health_timeline.append({
            "bucket": ub_label,
            "ap_count": len(ub_aps),
            "avg_health": avg(u_hlth) if u_hlth else 10.0,
            "low_health_count": sum(1 for x in ub_aps if x.get("health") is None or x.get("health") < 10),
        })

    # Hallazgos expertos interactivos sobre el inventario de APs
    insights = []
    if low_health_aps:
        sorted_low_h = sorted(low_health_aps, key=lambda x: (x["health"] if x["health"] is not None else 0, -x["total_clients"]))
        insights.append({
            "severity": "critical" if critical_health_aps else "warning",
            "action_type": "health_low",
            "action_value": "health_low",
            "title": f"{len(low_health_aps)} APs con Overall Health Degradado ({len(critical_health_aps)} en 1/10 Crítico, {len(regular_health_aps)} en 6-7/10) • Clic para filtrar",
            "desc": "El puntaje Overall Health de Catalyst Center evalúa salud de radio, interferencia, CPU/memoria y conectividad WLC. Haz clic en esta tarjeta para listar solo estos APs en la tabla, o haz clic directo en un AP abajo para ver sus clientes.",
            "affected": [f"{a['ap_name']} ({a['floor']}: Health {a['health'] if a['health'] is not None else '--'}/10)" for a in sorted_low_h[:10]],
            "affected_aps": [
                {
                    "ap_name": a["ap_name"],
                    "label": f"{a['ap_name']} ({a['floor']} • Health: {a['health'] if a['health'] is not None else '--'}/10 • {a.get('csv1_clients_count', 0) or a['total_clients']} clientes)",
                }
                for a in sorted_low_h[:10]
            ],
        })
    if fast_eth_links:
        insights.append({
            "severity": "critical",
            "action_type": "link_100m",
            "action_value": "link_100m",
            "title": f"{len(fast_eth_links)} AP(s) CW9176I negociando puerto Ethernet a solo 100 Mbps (Clic para filtrar AP)",
            "desc": "Un AP Wi-Fi 7 / 6E (CW9176I) conectado a 100 Mbps sufre un cuello de botella físico severo en el cableado o puerto de switch. Haz clic aquí para aislar este AP en la tabla y luego haz clic en el AP para ver sus clientes.",
            "affected": [f"{a['ap_name']} ({a['floor']} en switch {a['switch_name']} @ {a['link_speed_str']})" for a in fast_eth_links],
            "affected_aps": [
                {
                    "ap_name": a["ap_name"],
                    "label": f"{a['ap_name']} ({a['floor']} @ {a['link_speed_str']}, {a.get('csv1_clients_count', 0) or a['total_clients']} clientes)",
                }
                for a in fast_eth_links
            ],
        })
    if high_util_5g:
        sorted_high_util = sorted(high_util_5g, key=lambda x: x["r1_utilization"], reverse=True)
        insights.append({
            "severity": "warning",
            "action_type": "util_5g_50",
            "action_value": "util_5g_50",
            "title": f"{len(high_util_5g)} APs con Utilización de Canal en 5 GHz >= 50% (Clic aquí para mostrar estos APs)",
            "desc": "Superar el 50% de Channel Utilization en 5 GHz degrada llamadas de voz/video y dispara las retransmisiones L2. Haz clic en esta tarjeta para listar solo estos APs en la tabla inferior, o haz clic directo en un AP abajo para ir a sus clientes.",
            "affected": [f"{a['ap_name']} ({a['floor']}: {int(a['r1_utilization'])}% util, {a['total_clients']} clientes)" for a in sorted_high_util[:8]],
            "affected_aps": [
                {
                    "ap_name": a["ap_name"],
                    "label": f"{a['ap_name']} ({a['floor']}: {int(a['r1_utilization'])}% util • {a.get('csv1_clients_count', 0) or a['total_clients']} clientes)",
                }
                for a in sorted_high_util[:8]
            ],
        })

    return {
        "total_aps": total_aps,
        "kpis": {
            "total_aps": total_aps,
            "total_clients_building": total_clients,
            "r0_clients": r0_clients,
            "r1_clients": r1_clients,
            "r2_clients": r2_clients,
            "avg_health": avg(healths),
            "low_health_count": len(low_health_aps),
            "critical_health_count": len(critical_health_aps),
            "regular_health_count": len(regular_health_aps),
            "avg_5g_util": avg(r1_utils),
            "avg_24g_util": avg(r0_utils),
            "avg_5g_int": avg(r1_ints),
            "avg_24g_int": avg(r0_ints),
            "avg_cpu": avg(cpus),
            "high_util_5g_count": len(high_util_5g),
            "high_int_5g_count": len(high_int_5g),
            "degraded_links_count": len(degraded_links),
            "fast_eth_count": len(fast_eth_links),
            "dual_5g_count": len(dual_5g_aps),
            "aps_with_issues_count": len(aps_with_issues),
        },
        "health_distribution": health_buckets,
        "floor_summary": floor_summary,
        "time_analytics": {
            "disconnect_timeline": disconnect_timeline,
            "uptime_buckets": uptime_buckets,
            "uptime_health_timeline": uptime_health_timeline,
        },
        "insights": insights,
        "aps": sorted(ap_rows, key=lambda x: (x["r1_utilization"] or 0, x["total_clients"]), reverse=True),
    }
