import csv
from datetime import datetime
import io
import re
from collections import defaultdict

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_DNA_TS_RE = re.compile(
    r"^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})"
)


def _dna_ts_to_epoch(ts_str):
    if not ts_str or ts_str == "--":
        return None
    m = _DNA_TS_RE.match(str(ts_str).strip())
    if not m:
        return None
    mon = _MONTH_MAP.get(m.group(1).lower())
    if not mon:
        return None
    try:
        dt = datetime(
            int(m.group(3)), mon, int(m.group(2)),
            int(m.group(4)), int(m.group(5)), int(m.group(6)),
        )
        return dt.timestamp()
    except ValueError:
        return None


def _dna_ts_gap_hours(ts_event, ts_seen):
    e1 = _dna_ts_to_epoch(ts_event)
    e2 = _dna_ts_to_epoch(ts_seen)
    if e1 is None or e2 is None:
        return 0.0
    return (e2 - e1) / 3600.0


def parse_float(val, default=None):
    if val is None:
        return default
    s = str(val).strip()
    if not s or s in ("--", "NA", "N/A", "null", "None"):
        return default
    m = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", s)
    if not m:
        return default
    try:
        return float(m.group(0))
    except ValueError:
        return default


def clean_str(val, default="--"):
    if val is None:
        return default
    s = str(val).strip()
    if not s or s in ("--", "NA", "N/A", "null", "None"):
        return default
    return s


def format_bytes(b):
    if b is None or b <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    val = float(b)
    while val >= 1024 and i < len(units) - 1:
        val /= 1024.0
        i += 1
    return f"{val:.2f} {units[i]}"


def infer_floor_from_ap_or_location(ap_name, location_str="--"):
    """
    Extrae el Piso desde el acrónimo del AP (ej. APDGP0305 -> Piso 3, APDGP0906 -> Piso 9,
    APDGMEZ -> Mezzanine, APDGSOT1 -> Sótano 1) o desde la columna Location.
    """
    ap_up = str(ap_name or "").upper()
    m = re.search(r"APDGP(\d{2})", ap_up)
    if m:
        return f"Piso {int(m.group(1))}"
    m2 = re.search(r"APDGP(\d)(?!\d)", ap_up)
    if m2:
        return f"Piso {int(m2.group(1))}"
    if "MEZ" in ap_up:
        return "Mezzanine"
    if "SOT2" in ap_up:
        return "Sótano 2"
    if "SOT1" in ap_up or "SEGF" in ap_up:
        return "Sótano 1 (CGA)"
    if "AUD" in ap_up:
        return "Auditorio"

    if location_str and location_str != "--" and "/" in str(location_str):
        last_part = str(location_str).split("/")[-1].strip()
        if last_part and last_part != "--":
            return last_part
    return location_str if (location_str and location_str != "--") else "Piso No Especificado"


def classify_retry_bucket(ret):
    r = ret or 0.0
    if r <= 10:
        return "0-10% (Óptimo)"
    if r <= 20:
        return "11-20% (Normal)"
    if r <= 24:
        return "21-24% (Elevado)"
    if r <= 30:
        return "25-30% (Alto)"
    return "> 30% (Crítico)"


def classify_session_bucket(session_min):
    m = session_min or 0.0
    if m < 15:
        return "< 15 min (Reciente)"
    if m < 60:
        return "15 - 60 min"
    if m < 180:
        return "1 - 3 horas"
    if m < 360:
        return "3 - 6 horas"
    return "> 6 horas (Larga)"


MONTH_MAP = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
}


def extract_date_from_ts(ts_str):
    """Extrae YYYY-MM-DD de cadenas como 'Wed Oct 21 2026 11:18:00 GMT-0500'."""
    if not ts_str or ts_str == "--":
        return None
    s = str(ts_str)
    m_iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", s)
    if m_iso:
        return f"{m_iso.group(1)}-{m_iso.group(2)}-{m_iso.group(3)}"
    m_eng = re.search(r"\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b", s)
    if m_eng:
        mon = MONTH_MAP.get(m_eng.group(1).upper())
        if mon:
            day = int(m_eng.group(2))
            year = m_eng.group(3)
            return f"{year}-{mon}-{day:02d}"
    return None


def extract_hour_and_15m(ts_str):
    """Extrae HH:00 y HH:MM (redondeado a 15m) de cadenas como 'Tue Oct 20 2026 09:34:17 GMT-0500'."""
    if not ts_str or ts_str == "--":
        return "--", "--"
    m = re.search(r"\b(\d{2}):(\d{2}):\d{2}\b", str(ts_str))
    if m:
        hh = int(m.group(1))
        mm = int(m.group(2))
        q = (mm // 15) * 15
        return f"{hh:02d}:00", f"{hh:02d}:{q:02d}"
    return "--", "--"


def is_corporate_hostname(hostname):
    """Determina si el dispositivo es Corporativo cuando el Hostname empieza por COL-."""
    return str(hostname or "").strip().upper().startswith("COL-")


def is_powersave_latency_fp(status, os_str, device_type, hostname, rssi, retries, be_lat, voice_lat, health):
    """
    Detecta falsos positivos de Latencia QoS causados por ahorro de batería (802.11 Power-Save /
    Deep Sleep en móviles / Modern Standby con aire limpio) o sesiones ya desconectadas (walk-away).
    """
    if str(status or "").strip().upper() == "DISCONNECTED":
        return True
    os_s = str(os_str or "").lower()
    dev_s = str(device_type or "").lower()
    host_s = str(hostname or "").lower()
    is_mobile = any(
        k in os_s or k in dev_s or k in host_s
        for k in ("ios", "iphone", "ipad", "android", "apple-device")
    )
    ret = retries or 0.0
    # 1. Móvil en bolsillo/reposo: buena señal (>= -67 dBm), pocos retries (< 20%) y cola Datos normal (<= 150 ms)
    if is_mobile and (rssi is not None and rssi >= -67) and ret < 20 and (be_lat is None or be_lat <= 150):
        return True
    # 2. Aire limpio sin contención (RSSI >= -67 dBm y Retries < 15%) con Health alto en DNA (>= 8):
    # retención en buffer AP por Power-Save / Modern Standby, no por congestión ni mala cobertura RF.
    if (rssi is not None and rssi >= -67) and ret < 15 and (health is None or health >= 8):
        return True
    return False


def normalize_device_model(device_type, vendor, os_str, endpoint_type):
    """Normaliza el Tipo de Dispositivo / Modelo de Cisco DNA para gráficas limpias y legibles."""
    dt = clean_str(device_type, "")
    os_val = clean_str(os_str, "")
    ep_val = clean_str(endpoint_type, "")
    if dt and dt.upper() not in ("UNKNOWN", "NA", "N/A", "NONE", "--"):
        # Limpiar sufijos extensos de código de chasis (ej: Type 21H5 21H6) conservando el modelo real
        full = re.sub(r"\s+Type\s+[A-Z0-9]{4}(?:\s+[A-Z0-9]{4})*$", "", dt, flags=re.IGNORECASE).strip()
        full = re.sub(r"^(Lenovo|Dell|HP)-Workstation\s+", r"\1 ", full, flags=re.IGNORECASE)
        full = re.sub(r"^Samsung-Phone\s+", "Samsung ", full, flags=re.IGNORECASE)
        full = re.sub(r"^Cloud-Network-Technolgy-Device$", "Cloud-Network (NIC PC)", full, flags=re.IGNORECASE)
        full = re.sub(r"^liteon-device$", "Lite-On (NIC PC)", full, flags=re.IGNORECASE)
        full = re.sub(r"^Intel-Device$", "Intel-Device (NIC PC)", full, flags=re.IGNORECASE)
        full = full.replace("Apple-iPhone", "Apple iPhone").replace("Apple-MacBook", "Apple MacBook").replace("Apple-iPad", "Apple iPad").replace("Apple-Device", "Apple Device").replace("Redmi-Smartphone", "Redmi Smartphone")
        full = re.sub(r"\bthinkpad\b", "ThinkPad", full, flags=re.IGNORECASE)
        full = re.sub(r"\biphone\b", "iPhone", full, flags=re.IGNORECASE)
        full = re.sub(r"\bipad\b", "iPad", full, flags=re.IGNORECASE)
        full = re.sub(r"\bmacbook\b", "MacBook", full, flags=re.IGNORECASE)
        full = re.sub(r"^lenovo\b", "Lenovo", full, flags=re.IGNORECASE)
        full = re.sub(r"^dell\b", "Dell", full, flags=re.IGNORECASE)
        full = re.sub(r"^samsung\b", "Samsung", full, flags=re.IGNORECASE)

        short = full
        short = re.sub(r"^Lenovo ThinkPad\s+", "ThinkPad ", short, flags=re.IGNORECASE)
        short = re.sub(r"^Cloud-Network \(NIC PC\)$", "Cloud-Net (NIC)", short)
        short = re.sub(r"^Intel-Device \(NIC PC\)$", "Intel-Device", short)
        if len(short) > 19:
            short = short[:18].rstrip() + "…"
        return full, short

    os_l = os_val.lower()
    ep_l = ep_val.lower()
    if "windows" in os_l or "workstation" in ep_l:
        return "PC Windows (Sin Modelo DNA)", "PC Win (s/Modelo)"
    if "android" in os_l:
        return "Móvil Android (Sin Modelo DNA)", "Android (s/Modelo)"
    if "ios" in os_l or "mac" in os_l:
        return "Apple iOS/Mac (Sin Modelo DNA)", "Apple (s/Modelo)"
    if "linux" in os_l:
        return "Linux / IoT (Sin Modelo DNA)", "Linux (s/Modelo)"
    return "Sin Modelo Identificado", "Sin Modelo"


def normalize_vendor_name(vendor, os_str=""):
    """Normaliza el fabricante de hardware reportado por OUI / Cisco DNA."""
    v = clean_str(vendor, "")
    if not v or v.upper() in ("UNKNOWN", "NA", "N/A", "--"):
        os_l = str(os_str or "").lower()
        if "android" in os_l:
            return "MAC Aleatoria (Android)", "MAC Rand (And)"
        if "ios" in os_l:
            return "MAC Aleatoria (iOS)", "MAC Rand (iOS)"
        return "Sin Fabricante (MAC Privada)", "MAC Privada"
    vl = v.lower()
    if "apple" in vl:
        return "Apple Inc.", "Apple"
    if "lenovo" in vl:
        return "Lenovo", "Lenovo"
    if "intel" in vl:
        return "Intel Corp. (NIC)", "Intel (NIC)"
    if "universal global scientific" in vl:
        return "USI (NIC Corporativa)", "USI (NIC)"
    if "cloud network" in vl or "hon hai" in vl or "foxconn" in vl:
        return "Cloud Network / Foxconn", "Cloud Net"
    if "samsung" in vl:
        return "Samsung", "Samsung"
    if "dell" in vl:
        return "Dell Inc.", "Dell"
    if vl.startswith("hp") or "hewlett" in vl:
        return "HP Inc.", "HP"
    if "lite-on" in vl or "liteon" in vl:
        return "Lite-On (NIC)", "Lite-On"
    if "redmi" in vl or "xiaomi" in vl:
        return "Xiaomi / Redmi", "Xiaomi/Redmi"
    if "motorola" in vl:
        return "Motorola", "Motorola"
    if "huawei" in vl:
        return "Huawei", "Huawei"
    if "honor" in vl:
        return "Honor", "Honor"
    if "realtek" in vl:
        return "Realtek (NIC)", "Realtek"
    if "mediatek" in vl:
        return "MediaTek (NIC)", "MediaTek"
    short = v.split(",")[0].split(" Co.")[0].split(" Inc")[0].split(" Corp")[0].strip()
    if len(short) > 17:
        short = short[:16].rstrip() + "…"
    return v, short


def normalize_row(raw, idx, exclude_ps_latency=True):
    """Normaliza una fila del CSV de Clientes de Cisco Catalyst Center / WLC."""
    usage_b = parse_float(raw.get("Usage (B)"), 0.0)
    tx_b = parse_float(raw.get("Tx Data (B)"), 0.0)
    rx_b = parse_float(raw.get("Rx Data (B)"), 0.0)
    if usage_b == 0.0 and (tx_b + rx_b) > 0:
        usage_b = tx_b + rx_b

    rssi = parse_float(raw.get("RSSI (dBm)"))
    avg_rssi = parse_float(raw.get("Avg RSSI (dBm)"))
    if rssi is not None and (rssi >= 0 or rssi <= -120):
        rssi = None
    if avg_rssi is not None and (avg_rssi >= 0 or avg_rssi <= -120):
        avg_rssi = None
    if rssi is None and avg_rssi is not None:
        rssi = avg_rssi
    elif avg_rssi is None and rssi is not None:
        avg_rssi = rssi

    snr = parse_float(raw.get("SNR (dB)"))
    avg_snr = parse_float(raw.get("Avg SNR (dB)"))
    if snr is not None and snr <= 0:
        snr = None
    if avg_snr is not None and avg_snr <= 0:
        avg_snr = None
    if snr is None and avg_snr is not None:
        snr = avg_snr
    elif avg_snr is None and snr is not None:
        avg_snr = snr

    retries = parse_float(raw.get("Retries (%)"), 0.0)
    health = parse_float(raw.get("Health"))
    onb_health = parse_float(raw.get("Onboarding Health"))
    conn_health = parse_float(raw.get("Connected Health"))
    data_rate = parse_float(raw.get("Data Rate (Mbps)"), 0.0)

    onb_time = parse_float(raw.get("Onboarding Time (ms)"))
    assoc_time = parse_float(raw.get("Association Time (ms)"))
    auth_time = parse_float(raw.get("Authentication Time (ms)"))
    dhcp_time = parse_float(raw.get("DHCP Response Time (ms)"))
    roam_time = parse_float(raw.get("Roaming Time (ms)"))
    session_ms = parse_float(raw.get("Session Duration (ms)"), 0.0)
    session_min = round(session_ms / 60000.0, 1) if session_ms else 0.0

    voice_lat = parse_float(raw.get("Avg Voice Latency"))
    video_lat = parse_float(raw.get("Avg Video Latency"))
    be_lat = parse_float(raw.get("Avg Best Effort Latency"))
    bg_lat = parse_float(raw.get("Avg Background Latency"))

    user_id = clean_str(raw.get("User ID"))
    identifier = clean_str(raw.get("Identifier"))
    if user_id == "--" and identifier != "--":
        user_id = identifier

    ap_name = clean_str(raw.get("AP Name"), "Sin AP")
    location = clean_str(raw.get("Location"))
    floor = infer_floor_from_ap_or_location(ap_name, location)

    band_raw = clean_str(raw.get("Band (GHz)"))
    if band_raw != "--":
        band = f"{band_raw} GHz" if "GHz" not in band_raw else band_raw
    else:
        band = "Desconocida"

    if rssi is None:
        rf_quality = "Sin señal (N/A)"
    elif rssi >= -60:
        rf_quality = "Excelente (>= -60 dBm)"
    elif rssi >= -67:
        rf_quality = "Buena (-61 a -67 dBm)"
    elif rssi >= -79:
        rf_quality = "Regular (-68 a -79 dBm)"
    else:
        rf_quality = "Crítica (< -79 dBm / Sticky)"

    last_onb_str = clean_str(raw.get("Last Onboarded"))
    last_assoc_str = clean_str(raw.get("Last Associated"))
    last_seen_str = clean_str(raw.get("Last Seen"))
    ts_ref = last_onb_str if last_onb_str != "--" else (last_assoc_str if last_assoc_str != "--" else last_seen_str)
    hour_slot, slot_15m = extract_hour_and_15m(ts_ref)
    session_bucket = classify_session_bucket(session_min)
    retry_bucket = classify_retry_bucket(retries)

    # Detección de anomalías operativas reales (IGNORANDO Connection Status y descartando SNR=0 / RSSI=0 falsos):
    # Enfoque en Retransmisiones, Autenticación 802.1X, Onboarding/DHCP/Roaming, Latencia WMM y Señal Débil (< -79 dBm).
    issues = []
    issue_categories = []
    alarm_tags = []
    status = clean_str(raw.get("Connection Status"), "UNKNOWN")

    # 1. Retransmisiones L2 (Retries %)
    if retries is not None and retries >= 25:
        issues.append(f"Retransmisiones críticas ({int(retries)}%)")
        issue_categories.append("Retransmisiones Altas (>=25%)")
        alarm_tags.append("Retries >= 25%")
    elif retries is not None and retries >= 20:
        alarm_tags.append("Retries Elevados (20-24%)")

    # 2. Demora en Autenticación 802.1X (Authentication Time ms) >= 6000 ms (6s)
    if auth_time is not None and auth_time >= 6000:
        issues.append(f"Auth ISE/Red ({auth_time/1000:.1f}s)")
        alarm_tags.append("Auth ISE/Red >= 6s")
        issue_categories.append("Auth 802.1X: Red / ISE (>=6s)")

    # 3. Procesos separados: Asociación (> 2000 ms), DHCP (> 2000 ms) y Roaming lento (> 3000 ms) como 3 categorías independientes
    onb_net_ms = round(max(0.0, onb_time - (auth_time or 0.0)), 1) if onb_time is not None else None
    if assoc_time is not None and assoc_time > 2000:
        issues.append(f"Asociación lenta ({int(assoc_time)} ms)")
        alarm_tags.append("Asociación > 2s")
        issue_categories.append("Asociación Lenta (>2s)")
    if dhcp_time is not None and dhcp_time > 2000:
        issues.append(f"DHCP lento ({int(dhcp_time)} ms / {dhcp_time/1000:.1f}s)")
        alarm_tags.append("DHCP > 2s")
        issue_categories.append("DHCP Lento (>2s)")
    if roam_time is not None and roam_time > 3000:
        issues.append(f"Roaming lento ({int(roam_time)} ms / {roam_time/1000:.1f}s)")
        alarm_tags.append("Roaming > 3s")
        issue_categories.append("Roaming Lento (>3s)")

    # 4. Latencia QoS WMM (Voz, Video, Datos Best Effort) con detección de falso positivo por Power-Save / Desconexión
    hostname_val = clean_str(raw.get("Hostname"))
    dev_type_val = clean_str(raw.get("Device Type"))
    os_val = clean_str(raw.get("OS"))
    has_raw_lat = (
        (voice_lat is not None and voice_lat > 100)
        or (be_lat is not None and be_lat > 150)
        or (video_lat is not None and video_lat > 100)
    )
    is_ps_fp = bool(
        has_raw_lat
        and is_powersave_latency_fp(
            status, os_val, dev_type_val, hostname_val, rssi, retries, be_lat, voice_lat, health
        )
    )
    if has_raw_lat and not (exclude_ps_latency and is_ps_fp):
        if voice_lat is not None and voice_lat > 100:
            issues.append(f"Latencia Voz alta ({int(voice_lat)} ms)")
            alarm_tags.append("Latencia Voz > 100ms")
        if be_lat is not None and be_lat > 150:
            issues.append(f"Latencia Datos alta ({int(be_lat)} ms)")
            alarm_tags.append("Latencia Datos > 150ms")
        if video_lat is not None and video_lat > 100:
            issues.append(f"Latencia Video alta ({int(video_lat)} ms)")
            alarm_tags.append("Latencia Video > 100ms")
        issue_categories.append("Latencia QoS Alta (Voz/Datos)")

    # 5. Calidad RF Débil / Sticky Client (Solo cuando existe lectura real y es peor que -79 dBm, ej: -80 dBm)
    if rssi is not None and rssi < -79:
        issues.append(f"Señal débil ({int(rssi)} dBm)")
        alarm_tags.append("RSSI Débil (< -79 dBm)")
        issue_categories.append("Señal RF Débil / Sticky")

    if data_rate and 0 < data_rate < 72:
        alarm_tags.append("Data Rate Bajo (< 72 Mbps)")

    rssi_delta = round(abs(rssi - avg_rssi), 1) if (rssi is not None and avg_rssi is not None) else 0.0
    if rssi_delta >= 6:
        alarm_tags.append("Fluctuación RF (>= 6 dB)")

    concurrent_combo = " + ".join(sorted(issue_categories)) if len(issue_categories) >= 2 else (issue_categories[0] if len(issue_categories) == 1 else "Sin Alertas Críticas")
    tag_combo = " + ".join(alarm_tags[:3]) if len(alarm_tags) >= 2 else (alarm_tags[0] if len(alarm_tags) == 1 else "Sin Tags")

    is_corp = is_corporate_hostname(hostname_val)
    raw_vendor = clean_str(raw.get("Hardware Manufacturer"))
    ep_type_val = clean_str(raw.get("Endpoint Type"))
    dev_model_full, dev_model_short = normalize_device_model(dev_type_val, raw_vendor, os_val, ep_type_val)
    vend_full, vend_short = normalize_vendor_name(raw_vendor, os_val)

    return {
        "id": idx,
        "identifier": identifier,
        "hostname": hostname_val,
        "is_corporate": is_corp,
        "is_ps_latency_fp": is_ps_fp,
        "corp_category": "Corporativo (COL-)" if is_corp else "Externo",
        "user_id": user_id,
        "mac": clean_str(raw.get("MAC Address")),
        "ipv4": clean_str(raw.get("IPv4 Address")),
        "ipv6": clean_str(raw.get("IPv6 Address")),
        "device_type": dev_type_val,
        "device_model": dev_model_full,
        "device_model_short": dev_model_short,
        "vendor": raw_vendor,
        "vendor_clean": vend_full,
        "vendor_short": vend_short,
        "os": os_val,
        "endpoint_type": ep_type_val,
        "health": health,
        "trust_score": clean_str(raw.get("Trust Score")),
        "tracked": clean_str(raw.get("Tracked")),
        "onboarding_health": onb_health,
        "connected_health": conn_health,
        "usage_b": usage_b,
        "usage_mb": round(usage_b / (1024.0 * 1024.0), 2),
        "usage_fmt": format_bytes(usage_b),
        "tx_b": tx_b,
        "tx_mb": round(tx_b / (1024.0 * 1024.0), 2),
        "tx_fmt": format_bytes(tx_b),
        "rx_b": rx_b,
        "rx_mb": round(rx_b / (1024.0 * 1024.0), 2),
        "rx_fmt": format_bytes(rx_b),
        "ap_name": ap_name,
        "ap_mode": clean_str(raw.get("AP Mode")),
        "ap_ip": clean_str(raw.get("AP IP Address")),
        "ap_mac": clean_str(raw.get("AP Base Radio MAC")),
        "ap_group": clean_str(raw.get("AP Group")),
        "wlc_name": clean_str(raw.get("WLC Name")),
        "status": status,
        "band": band,
        "rssi": rssi,
        "avg_rssi": avg_rssi,
        "rssi_delta": rssi_delta,
        "snr": snr,
        "avg_snr": avg_snr,
        "rf_quality": rf_quality,
        "location": location,
        "floor": floor,
        "last_seen": last_seen_str,
        "last_onboarded": last_onb_str,
        "last_associated": last_assoc_str,
        "last_auth_time": clean_str(raw.get("Last Auth Time")),
        "last_dhcp_request": clean_str(raw.get("Last DHCP Request")),
        "hour_slot": hour_slot,
        "slot_15m": slot_15m,
        "session_bucket": session_bucket,
        "retry_bucket": retry_bucket,
        "ssid": clean_str(raw.get("SSID")),
        "auth_type": clean_str(raw.get("Auth Type")),
        "vlan": clean_str(raw.get("VLAN ID")),
        "vnid": clean_str(raw.get("VNID")),
        "bridge_vnet": clean_str(raw.get("Bridge-Network Virtual Network")),
        "auth_server": clean_str(raw.get("Authentication Server")),
        "dhcp_server": clean_str(raw.get("DHCP Server")),
        "onboarding_ms": onb_time,
        "onb_net_ms": onb_net_ms,
        "assoc_ms": assoc_time,
        "auth_ms": auth_time,
        "dhcp_ms": dhcp_time,
        "roam_ms": roam_time,
        "session_ms": session_ms,
        "session_min": session_min,
        "data_rate": data_rate,
        "protocol": clean_str(raw.get("Association")),
        "capability": clean_str(raw.get("Capability")),
        "retries": retries,
        "voice_lat": voice_lat,
        "video_lat": video_lat,
        "be_lat": be_lat,
        "bg_lat": bg_lat,
        "issues": issues,
        "issue_categories": issue_categories,
        "issue_count": len(issues),
        "alarm_tags": alarm_tags,
        "alarm_tags_count": len(alarm_tags),
        "concurrent_combo": concurrent_combo,
        "tag_combo": tag_combo,
    }


def recompute_row_issues(r, exclude_ps_latency=True):
    """Recalcula issues, issue_categories y alarm_tags para una fila existente con las reglas vigentes (Roaming > 3000 ms, filtro opcional de Power-Save en Latencia, sin SNR=0/RSSI=0 falsos, Señal débil < -79 dBm)."""
    issues = []
    issue_categories = []
    alarm_tags = []

    retries = r.get("retries")
    auth_time = r.get("auth_ms")
    onb_time = r.get("onboarding_ms")
    dhcp_time = r.get("dhcp_ms")
    roam_time = r.get("roam_ms")
    voice_lat = r.get("voice_lat")
    be_lat = r.get("be_lat")
    video_lat = r.get("video_lat")

    rssi = r.get("rssi")
    avg_rssi = r.get("avg_rssi")
    if rssi is not None and (rssi >= 0 or rssi <= -120):
        rssi = None
    if avg_rssi is not None and (avg_rssi >= 0 or avg_rssi <= -120):
        avg_rssi = None
    if rssi is None and avg_rssi is not None:
        rssi = avg_rssi
    elif avg_rssi is None and rssi is not None:
        avg_rssi = rssi
    r["rssi"] = rssi
    r["avg_rssi"] = avg_rssi

    snr = r.get("snr")
    avg_snr = r.get("avg_snr")
    if snr is not None and snr <= 0:
        snr = None
    if avg_snr is not None and avg_snr <= 0:
        avg_snr = None
    if snr is None and avg_snr is not None:
        snr = avg_snr
    elif avg_snr is None and snr is not None:
        avg_snr = snr
    r["snr"] = snr
    r["avg_snr"] = avg_snr

    if rssi is None:
        r["rf_quality"] = "Sin señal (N/A)"
    elif rssi >= -60:
        r["rf_quality"] = "Excelente (>= -60 dBm)"
    elif rssi >= -67:
        r["rf_quality"] = "Buena (-61 a -67 dBm)"
    elif rssi >= -79:
        r["rf_quality"] = "Regular (-68 a -79 dBm)"
    else:
        r["rf_quality"] = "Crítica (< -79 dBm / Sticky)"

    data_rate = r.get("data_rate") or 0.0
    rssi_delta = round(abs(rssi - avg_rssi), 1) if (rssi is not None and avg_rssi is not None) else 0.0
    r["rssi_delta"] = rssi_delta

    if retries is not None and retries >= 25:
        issues.append(f"Retransmisiones críticas ({int(retries)}%)")
        issue_categories.append("Retransmisiones Altas (>=25%)")
        alarm_tags.append("Retries >= 25%")
    elif retries is not None and retries >= 20:
        alarm_tags.append("Retries Elevados (20-24%)")

    if auth_time is not None and auth_time >= 6000:
        issues.append(f"Auth ISE/Red ({auth_time/1000:.1f}s)")
        alarm_tags.append("Auth ISE/Red >= 6s")
        issue_categories.append("Auth 802.1X: Red / ISE (>=6s)")

    assoc_time = r.get("assoc_ms")
    onb_net_ms = round(max(0.0, onb_time - (auth_time or 0.0)), 1) if onb_time is not None else None
    r["onb_net_ms"] = onb_net_ms

    if assoc_time is not None and assoc_time > 2000:
        issues.append(f"Asociación lenta ({int(assoc_time)} ms)")
        alarm_tags.append("Asociación > 2s")
        issue_categories.append("Asociación Lenta (>2s)")
    if dhcp_time is not None and dhcp_time > 2000:
        issues.append(f"DHCP lento ({int(dhcp_time)} ms / {dhcp_time/1000:.1f}s)")
        alarm_tags.append("DHCP > 2s")
        issue_categories.append("DHCP Lento (>2s)")
    if roam_time is not None and roam_time > 3000:
        issues.append(f"Roaming lento ({int(roam_time)} ms / {roam_time/1000:.1f}s)")
        alarm_tags.append("Roaming > 3s")
        issue_categories.append("Roaming Lento (>3s)")

    has_raw_lat = (
        (voice_lat is not None and voice_lat > 100)
        or (be_lat is not None and be_lat > 150)
        or (video_lat is not None and video_lat > 100)
    )
    is_ps_fp = bool(
        has_raw_lat
        and is_powersave_latency_fp(
            r.get("status"),
            r.get("os"),
            r.get("device_type"),
            r.get("hostname"),
            rssi,
            retries,
            be_lat,
            voice_lat,
            r.get("health"),
        )
    )
    r["is_ps_latency_fp"] = is_ps_fp
    if has_raw_lat and not (exclude_ps_latency and is_ps_fp):
        if voice_lat is not None and voice_lat > 100:
            issues.append(f"Latencia Voz alta ({int(voice_lat)} ms)")
            alarm_tags.append("Latencia Voz > 100ms")
        if be_lat is not None and be_lat > 150:
            issues.append(f"Latencia Datos alta ({int(be_lat)} ms)")
            alarm_tags.append("Latencia Datos > 150ms")
        if video_lat is not None and video_lat > 100:
            issues.append(f"Latencia Video alta ({int(video_lat)} ms)")
            alarm_tags.append("Latencia Video > 100ms")
        issue_categories.append("Latencia QoS Alta (Voz/Datos)")

    if rssi is not None and rssi < -79:
        issues.append(f"Señal débil ({int(rssi)} dBm)")
        alarm_tags.append("RSSI Débil (< -79 dBm)")
        issue_categories.append("Señal RF Débil / Sticky")

    if data_rate and 0 < data_rate < 72:
        alarm_tags.append("Data Rate Bajo (< 72 Mbps)")
    if rssi_delta >= 6:
        alarm_tags.append("Fluctuación RF (>= 6 dB)")

    is_corp = is_corporate_hostname(r.get("hostname"))
    r["is_corporate"] = is_corp
    r["corp_category"] = "Corporativo (COL-)" if is_corp else "Externo"
    dev_m_full, dev_m_short = normalize_device_model(
        r.get("device_type"), r.get("vendor"), r.get("os"), r.get("endpoint_type")
    )
    vend_full, vend_short = normalize_vendor_name(r.get("vendor"), r.get("os"))
    r["device_model"] = dev_m_full
    r["device_model_short"] = dev_m_short
    r["vendor_clean"] = vend_full
    r["vendor_short"] = vend_short
    r["issues"] = issues
    r["issue_categories"] = issue_categories
    r["issue_count"] = len(issues)
    r["alarm_tags"] = alarm_tags
    r["alarm_tags_count"] = len(alarm_tags)
    r["concurrent_combo"] = " + ".join(sorted(issue_categories)) if len(issue_categories) >= 2 else (issue_categories[0] if len(issue_categories) == 1 else "Sin Alertas Críticas")
    r["tag_combo"] = " + ".join(alarm_tags[:3]) if len(alarm_tags) >= 2 else (alarm_tags[0] if len(alarm_tags) == 1 else "Sin Tags")
    return r


def apply_onboarding_fp_and_auth_split(rows, exclude_fp=True):
    """
    Depura falsos positivos de Retries / Onboarding / Roaming (eventos históricos congelados entre capturas, >12h,
    DISCONNECTED, micro-tráfico/null-data PS en Retries, backoff único OS 2-5s en DHCP y "roaming de ascensor/tapa cerrada" >10s)
    y separa Autenticación 802.1X (>=6s) en:
      1) Auth 802.1X: Red / ISE (>=6s) -> ráfagas ISE 15m, ráfagas en AP, mala RF o Onboarding Health < 4
      2) Auth 802.1X: Espera Suplicante (>=6s) -> demora aislada del cliente OS con aire e ISE sanos
    """
    seen_retry_evts = set()
    seen_auth_evts = set()
    seen_dhcp_evts = set()
    seen_roam_evts = set()

    for r in rows:
        is_disc = str(r.get("status") or "").strip().upper() == "DISCONNECTED"
        mac = str(r.get("mac") or "").strip()
        last_seen = r.get("last_seen") or "--"
        rssi = r.get("rssi")
        ret = r.get("retries")
        ret_val = ret or 0.0
        good_rf = (rssi is not None and rssi >= -67) and ret_val < 20

        if ret is not None and ret >= 25:
            usage_b = r.get("usage_b") or 0
            rt_key = f"{mac}|{last_seen}|{ret}|{usage_b}"
            is_dup_rt = rt_key in seen_retry_evts
            seen_retry_evts.add(rt_key)
            is_micro_traffic = bool(usage_b < 262144 and rssi is not None and rssi >= -67)
            os_l = str(r.get("os") or "").lower()
            dr = r.get("data_rate") or 0.0
            is_mob_ps_null = bool(
                ("android" in os_l or "ios" in os_l or "iphone" in os_l or "ipad" in os_l)
                and ret >= 80
                and rssi is not None
                and rssi >= -55
                and dr >= 130
            )
            r["is_retry_fp"] = bool(is_disc or is_dup_rt or is_micro_traffic or is_mob_ps_null)
        else:
            r["is_retry_fp"] = False

        auth_ms = r.get("auth_ms")
        if auth_ms is not None and auth_ms >= 6000:
            last_onb = r.get("last_onboarded") or "--"
            a_key = f"{mac}|{last_onb}|{auth_ms}"
            is_dup_a = last_onb != "--" and a_key in seen_auth_evts
            if last_onb != "--":
                seen_auth_evts.add(a_key)
            is_stale_a = _dna_ts_gap_hours(last_onb, last_seen) > 12.0
            r["is_auth_fp"] = bool(is_disc or is_dup_a or is_stale_a)
        else:
            r["is_auth_fp"] = False

        dhcp_ms = r.get("dhcp_ms")
        if dhcp_ms is not None and dhcp_ms > 2000:
            last_dhcp = r.get("last_dhcp_request") or "--"
            d_key = f"{mac}|{last_dhcp}|{dhcp_ms}"
            is_dup_d = last_dhcp != "--" and d_key in seen_dhcp_evts
            if last_dhcp != "--":
                seen_dhcp_evts.add(d_key)
            is_stale_d = _dna_ts_gap_hours(last_dhcp, last_seen) > 12.0
            is_backoff = bool(good_rf and r.get("onboarding_health") == 4 and dhcp_ms <= 5000)
            r["is_dhcp_fp"] = bool(is_disc or is_dup_d or is_stale_d or is_backoff)
        else:
            r["is_dhcp_fp"] = False

        roam_ms = r.get("roam_ms")
        if roam_ms is not None and roam_ms > 3000:
            last_assoc = r.get("last_associated") or "--"
            last_onb = r.get("last_onboarded") or "--"
            rm_key = f"{mac}|{last_assoc}|{roam_ms}"
            is_dup_rm = rm_key in seen_roam_evts
            seen_roam_evts.add(rm_key)
            is_stale_rm = (
                _dna_ts_gap_hours(last_assoc, last_seen) > 12.0
                or _dna_ts_gap_hours(last_onb, last_seen) > 12.0
            )
            onb_dest_sum = (r.get("assoc_ms") or 0.0) + (auth_ms or 0.0) + (dhcp_ms or 0.0)
            is_lid_walk = bool(
                roam_ms > 10000
                and 0 < onb_dest_sum < 4000
                and good_rf
                and r.get("onboarding_health") == 4
            )
            r["is_roam_fp"] = bool(is_disc or is_dup_rm or is_stale_rm or is_lid_walk)
        else:
            r["is_roam_fp"] = False

    # Contar ráfagas simultáneas sobre eventos activos (no congelados/desconectados)
    ap_auth_cnt = defaultdict(int)
    slot_ise_cnt = defaultdict(int)
    for r in rows:
        if (r.get("auth_ms") or 0) >= 6000 and not r.get("is_auth_fp"):
            dl = r.get("day_label") or ""
            ap_auth_cnt[(dl, r.get("ap_name") or "")] += 1
            sl = r.get("slot_15m") or "--"
            srv = r.get("auth_server") or "--"
            if sl != "--" and srv != "--":
                slot_ise_cnt[(dl, sl, srv)] += 1

    AUTH_CATS = {
        "Autenticación 802.1X Lenta (>=6s)",
        "Auth 802.1X: Red / ISE (>=6s)",
        "Auth 802.1X: Espera Suplicante (>=6s)",
    }

    for r in rows:
        base_issues = [
            iss for iss in r.get("issues", [])
            if not iss.startswith("Retransmisiones ")
            and not iss.startswith("Auth ")
            and not iss.startswith("Espera Suplicante")
            and not iss.startswith("DHCP lento")
            and not iss.startswith("Roaming lento")
        ]
        base_cats = [
            cat for cat in r.get("issue_categories", [])
            if cat not in AUTH_CATS
            and cat not in ("Retransmisiones Altas (>=25%)", "DHCP Lento (>2s)", "Roaming Lento (>3s)")
        ]
        base_tags = [
            tg for tg in r.get("alarm_tags", [])
            if not tg.startswith("Auth ") and tg not in ("Retries >= 25%", "DHCP > 2s", "Roaming > 3s")
        ]

        ret_v = r.get("retries")
        if ret_v is not None and ret_v >= 25 and not (exclude_fp and r.get("is_retry_fp")):
            base_issues.append(f"Retransmisiones críticas ({int(ret_v)}%)")
            base_cats.append("Retransmisiones Altas (>=25%)")
            base_tags.append("Retries >= 25%")

        auth_ms = r.get("auth_ms")
        if auth_ms is not None and auth_ms >= 6000 and not (exclude_fp and r.get("is_auth_fp")):
            dl = r.get("day_label") or ""
            sl = r.get("slot_15m") or "--"
            srv = r.get("auth_server") or "--"
            slot_burst = sl != "--" and srv != "--" and slot_ise_cnt.get((dl, sl, srv), 0) >= 5
            ap_cluster = ap_auth_cnt.get((dl, r.get("ap_name") or ""), 0) >= 3
            onb_h = r.get("onboarding_health")
            low_onb = onb_h is not None and onb_h < 4
            rssi = r.get("rssi")
            ret = r.get("retries") or 0.0
            bad_rf = (rssi is None or rssi < -67) or ret >= 20

            if slot_burst or ap_cluster or low_onb or bad_rf:
                reason = (
                    "ráfaga ISE"
                    if slot_burst
                    else "ráfaga AP"
                    if ap_cluster
                    else f"Onb Health {int(onb_h)}"
                    if low_onb
                    else "pérdida RF"
                )
                base_issues.append(f"Auth ISE/Red ({auth_ms/1000:.1f}s • {reason})")
                base_cats.append("Auth 802.1X: Red / ISE (>=6s)")
                base_tags.append("Auth ISE/Red >= 6s")
                r["auth_delay_origin"] = "ISE_NET"
            else:
                base_issues.append(f"Espera Suplicante ({auth_ms/1000:.1f}s • cliente)")
                base_cats.append("Auth 802.1X: Espera Suplicante (>=6s)")
                base_tags.append("Auth Suplicante >= 6s")
                r["auth_delay_origin"] = "SUPPLICANT"
        else:
            r["auth_delay_origin"] = "NONE"

        dhcp_ms = r.get("dhcp_ms")
        if dhcp_ms is not None and dhcp_ms > 2000 and not (exclude_fp and r.get("is_dhcp_fp")):
            base_issues.append(f"DHCP lento ({int(dhcp_ms)} ms / {dhcp_ms/1000:.1f}s)")
            base_cats.append("DHCP Lento (>2s)")
            base_tags.append("DHCP > 2s")

        roam_ms = r.get("roam_ms")
        if roam_ms is not None and roam_ms > 3000 and not (exclude_fp and r.get("is_roam_fp")):
            base_issues.append(f"Roaming lento ({int(roam_ms)} ms / {roam_ms/1000:.1f}s)")
            base_cats.append("Roaming Lento (>3s)")
            base_tags.append("Roaming > 3s")

        r["is_any_fp"] = bool(
            r.get("is_ps_latency_fp")
            or r.get("is_retry_fp")
            or r.get("is_auth_fp")
            or r.get("is_dhcp_fp")
            or r.get("is_roam_fp")
        )
        r["issues"] = base_issues
        r["issue_categories"] = base_cats
        r["issue_count"] = len(base_issues)
        r["alarm_tags"] = base_tags
        r["alarm_tags_count"] = len(base_tags)
        r["concurrent_combo"] = (
            " + ".join(sorted(base_cats))
            if len(base_cats) >= 2
            else (base_cats[0] if len(base_cats) == 1 else "Sin Alertas Críticas")
        )
        r["tag_combo"] = (
            " + ".join(base_tags[:3])
            if len(base_tags) >= 2
            else (base_tags[0] if len(base_tags) == 1 else "Sin Tags")
        )
    return rows


def parse_csv_content(text_content, source_file="datos_clientes_cisco.csv", day_label=None, start_id=1, exclude_ps_latency=True):
    if text_content.startswith("\ufeff"):
        text_content = text_content.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text_content))
    rows = []
    curr_id = start_id
    for raw in reader:
        if not any(raw.values()):
            continue
        r = normalize_row(raw, curr_id, exclude_ps_latency=exclude_ps_latency)
        r["source_file"] = source_file
        auto_dt = extract_date_from_ts(r.get("last_seen")) or extract_date_from_ts(r.get("last_onboarded")) or extract_date_from_ts(r.get("last_associated"))
        r["auto_date"] = auto_dt or "Sin Fecha"
        r["day_label"] = (day_label.strip() if day_label and str(day_label).strip() else None) or auto_dt or source_file
        rows.append(r)
        curr_id += 1
    apply_onboarding_fp_and_auth_split(rows, exclude_fp=exclude_ps_latency)
    return rows


def compute_analytics(rows, include_daily=True):
    total = len(rows)
    if total == 0:
        return {"total_records": 0}

    connected = [r for r in rows if r["status"] == "CONNECTED"]
    not_connected = [r for r in rows if r["status"] != "CONNECTED"]

    health_vals = [r["health"] for r in rows if r["health"] is not None]
    rssi_vals = [r["rssi"] for r in rows if r["rssi"] is not None]
    snr_vals = [r["snr"] for r in rows if r["snr"] is not None]
    retry_vals = [r["retries"] for r in rows if r["retries"] is not None and r["retries"] > 0]
    rate_vals = [r["data_rate"] for r in rows if r["data_rate"] and r["data_rate"] > 0]
    onb_vals = [r["onb_net_ms"] for r in rows if r.get("onb_net_ms") is not None]
    assoc_vals = [r["assoc_ms"] for r in rows if r.get("assoc_ms") is not None]
    auth_vals = [r["auth_ms"] for r in rows if r["auth_ms"] is not None]
    dhcp_vals = [r["dhcp_ms"] for r in rows if r["dhcp_ms"] is not None]
    roam_vals = [r["roam_ms"] for r in rows if r["roam_ms"] is not None]
    voice_vals = [r["voice_lat"] for r in rows if r["voice_lat"] is not None]
    be_vals = [r["be_lat"] for r in rows if r["be_lat"] is not None]

    total_usage = sum(r["usage_b"] for r in rows)
    total_tx = sum(r["tx_b"] for r in rows)
    total_rx = sum(r["rx_b"] for r in rows)

    avg = lambda lst: round(sum(lst) / len(lst), 1) if lst else 0.0

    sticky_clients = [r for r in rows if "Señal RF Débil / Sticky" in r.get("issue_categories", [])]
    high_retry_clients = [r for r in rows if "Retransmisiones Altas (>=25%)" in r.get("issue_categories", [])]
    low_health_clients = [r for r in rows if r["health"] is not None and r["health"] < 7]
    slow_onb_clients = [r for r in rows if "Onboarding / DHCP / Roaming Lento" in r.get("issue_categories", [])]
    high_lat_clients = [r for r in rows if "Latencia QoS Alta (Voz/Datos)" in r.get("issue_categories", [])]
    clients_with_any_issue = [r for r in rows if r["issue_count"] > 0]

    def _uid_key(c):
        uid = c.get("user_id")
        if uid and uid != "--":
            return uid
        mac = c.get("mac")
        if mac and mac != "--":
            return f"mac:{mac}"
        return f"row:{c.get('id')}"

    unique_aps = set(r["ap_name"] for r in rows if r["ap_name"] != "Sin AP")
    unique_floors = set(r["floor"] for r in rows if r.get("floor") and r["floor"] != "--")
    unique_users = set(_uid_key(r) for r in rows)
    issue_unique_users = set(_uid_key(r) for r in clients_with_any_issue)

    # 1. Análisis Detallado por Access Point (con desglose exacto de tipos de fallo)
    ap_groups = defaultdict(list)
    for r in rows:
        ap_groups[r["ap_name"]].append(r)

    ap_summary = []
    for ap_name, clients in ap_groups.items():
        c_rssi = [c["rssi"] for c in clients if c["rssi"] is not None]
        c_snr = [c["snr"] for c in clients if c["snr"] is not None]
        c_ret = [c["retries"] for c in clients if c["retries"] is not None and c["retries"] > 0]
        c_health = [c["health"] for c in clients if c["health"] is not None]
        c_voice = [c["voice_lat"] for c in clients if c["voice_lat"] is not None]
        c_be = [c["be_lat"] for c in clients if c["be_lat"] is not None]
        c_auth = [c["auth_ms"] for c in clients if c["auth_ms"] is not None]
        c_assoc = [c["assoc_ms"] for c in clients if c.get("assoc_ms") is not None]
        c_onb = [c["onb_net_ms"] for c in clients if c.get("onb_net_ms") is not None]
        c_dhcp = [c["dhcp_ms"] for c in clients if c["dhcp_ms"] is not None]
        c_roam = [c["roam_ms"] for c in clients if c["roam_ms"] is not None]
        c_rate = [c["data_rate"] for c in clients if c["data_rate"] and c["data_rate"] > 0]
        c_usage = sum(c["usage_b"] for c in clients)
        c_tx = sum(c["tx_b"] for c in clients)
        c_rx = sum(c["rx_b"] for c in clients)

        c_issues = sum(1 for c in clients if c["issue_count"] > 0)
        c_healthy = len(clients) - c_issues
        c_fail_pct = round((c_issues / len(clients)) * 100, 1) if clients else 0.0

        f_retries = sum(1 for c in clients if "Retransmisiones Altas (>=25%)" in c["issue_categories"])
        f_auth = sum(1 for c in clients if "Auth 802.1X: Red / ISE (>=6s)" in c["issue_categories"])
        f_auth_supp = sum(1 for c in clients if "Auth 802.1X: Espera Suplicante (>=6s)" in c["issue_categories"])
        f_assoc = sum(1 for c in clients if "Asociación Lenta (>2s)" in c["issue_categories"])
        f_dhcp = sum(1 for c in clients if "DHCP Lento (>2s)" in c["issue_categories"])
        f_roam = sum(1 for c in clients if "Roaming Lento (>3s)" in c["issue_categories"])
        f_onb = f_assoc + f_dhcp + f_roam
        f_latency = sum(1 for c in clients if "Latencia QoS Alta (Voz/Datos)" in c["issue_categories"])
        f_rf = sum(1 for c in clients if "Señal RF Débil / Sticky" in c["issue_categories"])

        cause_counts = [
            ("Retransmisiones (>=25%)", f_retries),
            ("Auth ISE/Red (>=6s)", f_auth),
            ("Espera Suplicante (>=6s)", f_auth_supp),
            ("Asociación Lenta (>2s)", f_assoc),
            ("DHCP Lento (>2s)", f_dhcp),
            ("Roaming Lento (>3s)", f_roam),
            ("Latencia Voz/Datos", f_latency),
            ("Señal Débil / Sticky", f_rf),
        ]
        cause_counts.sort(key=lambda x: x[1], reverse=True)
        top_cause = f"{cause_counts[0][0]} ({cause_counts[0][1]})" if cause_counts[0][1] > 0 else "Ninguno (100% Sanos)"

        ap_unique_users = len(set(_uid_key(c) for c in clients))
        ap_issue_users = len(set(_uid_key(c) for c in clients if c["issue_count"] > 0))
        ap_healthy_users = ap_unique_users - ap_issue_users
        ap_user_fail_pct = round((ap_issue_users / ap_unique_users) * 100.0, 1) if ap_unique_users else 0.0
        ap_alerts_users = {
            "retries": len(set(_uid_key(c) for c in clients if "Retransmisiones Altas (>=25%)" in c["issue_categories"])),
            "auth_slow": len(set(_uid_key(c) for c in clients if "Auth 802.1X: Red / ISE (>=6s)" in c["issue_categories"])),
            "auth_supplicant": len(set(_uid_key(c) for c in clients if "Auth 802.1X: Espera Suplicante (>=6s)" in c["issue_categories"])),
            "assoc_slow": len(set(_uid_key(c) for c in clients if "Asociación Lenta (>2s)" in c["issue_categories"])),
            "dhcp_slow": len(set(_uid_key(c) for c in clients if "DHCP Lento (>2s)" in c["issue_categories"])),
            "roam_slow": len(set(_uid_key(c) for c in clients if "Roaming Lento (>3s)" in c["issue_categories"])),
            "latency": len(set(_uid_key(c) for c in clients if "Latencia QoS Alta (Voz/Datos)" in c["issue_categories"])),
            "rf_signal": len(set(_uid_key(c) for c in clients if "Señal RF Débil / Sticky" in c["issue_categories"])),
        }
        ap_corp_rows = [c for c in clients if is_corporate_hostname(c.get("hostname"))]
        ap_ext_rows = [c for c in clients if not is_corporate_hostname(c.get("hostname"))]
        ap_corp_users = len(set(_uid_key(c) for c in ap_corp_rows))
        ap_ext_users = len(set(_uid_key(c) for c in ap_ext_rows))
        pct_of_total = round((len(clients) / total) * 100.0, 1) if total else 0.0

        risk_score = 0
        if len(clients) >= 25:
            risk_score += 25
        elif len(clients) >= 15:
            risk_score += 10
        if avg(c_ret) >= 20:
            risk_score += 35
        elif avg(c_ret) >= 14:
            risk_score += 15
        if avg(c_auth) >= 6000:
            risk_score += 25
        elif f_auth >= 3:
            risk_score += 15
        if c_fail_pct >= 50:
            risk_score += 20
        if c_be and avg(c_be) > 60:
            risk_score += 15

        ap_summary.append({
            "ap_name": ap_name,
            "floor": clients[0]["floor"],
            "ap_health": clients[0].get("ap_health"),
            "ap_ip": clients[0]["ap_ip"],
            "ap_mac": clients[0]["ap_mac"],
            "location": clients[0]["location"],
            "client_count": len(clients),
            "unique_users": ap_unique_users,
            "issue_users": ap_issue_users,
            "healthy_users": ap_healthy_users,
            "user_failure_rate_pct": ap_user_fail_pct,
            "alerts_users_breakdown": ap_alerts_users,
            "corp_clients": len(ap_corp_rows),
            "corp_users": ap_corp_users,
            "ext_clients": len(ap_ext_rows),
            "ext_users": ap_ext_users,
            "pct_of_total": pct_of_total,
            "connected_count": sum(1 for c in clients if c["status"] == "CONNECTED"),
            "healthy_clients": c_healthy,
            "issue_clients": c_issues,
            "failure_rate_pct": c_fail_pct,
            "usage_b": c_usage,
            "usage_mb": round(c_usage / (1024.0 * 1024.0), 2),
            "usage_fmt": format_bytes(c_usage),
            "tx_b": c_tx,
            "tx_mb": round(c_tx / (1024.0 * 1024.0), 2),
            "tx_fmt": format_bytes(c_tx),
            "rx_b": c_rx,
            "rx_mb": round(c_rx / (1024.0 * 1024.0), 2),
            "rx_fmt": format_bytes(c_rx),
            "avg_rssi": avg(c_rssi),
            "avg_snr": avg(c_snr),
            "avg_retries": avg(c_ret),
            "avg_health": avg(c_health),
            "avg_voice_lat": avg(c_voice),
            "avg_be_lat": avg(c_be),
            "avg_auth_ms": avg(c_auth),
            "max_auth_ms": round(max(c_auth), 0) if c_auth else 0.0,
            "avg_assoc_ms": avg(c_assoc),
            "avg_onboarding_ms": avg(c_onb),
            "max_onboarding_ms": round(max(c_onb), 0) if c_onb else 0.0,
            "avg_dhcp_ms": avg(c_dhcp),
            "avg_roam_ms": avg(c_roam),
            "avg_data_rate": avg(c_rate),
            "high_retry_clients": f_retries,
            "slow_auth_clients": f_auth,
            "supplicant_auth_clients": f_auth_supp,
            "slow_assoc_clients": f_assoc,
            "slow_dhcp_clients": f_dhcp,
            "slow_roam_clients": f_roam,
            "high_latency_clients": f_latency,
            "slow_onb_clients": f_onb,
            "failed_conn_clients": f_auth,
            "sticky_clients": f_rf,
            "top_failure_cause": top_cause,
            "risk_score": min(100, risk_score),
        })

    ap_failure_ranking = sorted(
        [a for a in ap_summary if a["ap_name"] != "Sin AP"],
        key=lambda x: (x["issue_clients"], x["high_retry_clients"], x["slow_auth_clients"], x["avg_retries"]),
        reverse=True,
    )
    ap_summary.sort(key=lambda x: (x["client_count"], x["unique_users"], x["usage_b"]), reverse=True)

    # 2. Análisis por Piso de los Clientes (Dónde hay más usuarios, más problemas y desglose de alertas por piso)
    floor_groups = defaultdict(list)
    for r in rows:
        floor_groups[r["floor"]].append(r)

    floor_client_summary = []
    for floor_name, f_clients in floor_groups.items():
        f_total = len(f_clients)
        f_unique_users = len(set(_uid_key(c) for c in f_clients))
        f_issue_users = len(set(_uid_key(c) for c in f_clients if c["issue_count"] > 0))
        f_healthy_users = f_unique_users - f_issue_users
        f_user_fail_pct = round((f_issue_users / f_unique_users) * 100.0, 1) if f_unique_users else 0.0
        f_alerts_users = {
            "retries": len(set(_uid_key(c) for c in f_clients if "Retransmisiones Altas (>=25%)" in c["issue_categories"])),
            "auth_slow": len(set(_uid_key(c) for c in f_clients if "Auth 802.1X: Red / ISE (>=6s)" in c["issue_categories"])),
            "auth_supplicant": len(set(_uid_key(c) for c in f_clients if "Auth 802.1X: Espera Suplicante (>=6s)" in c["issue_categories"])),
            "assoc_slow": len(set(_uid_key(c) for c in f_clients if "Asociación Lenta (>2s)" in c["issue_categories"])),
            "dhcp_slow": len(set(_uid_key(c) for c in f_clients if "DHCP Lento (>2s)" in c["issue_categories"])),
            "roam_slow": len(set(_uid_key(c) for c in f_clients if "Roaming Lento (>3s)" in c["issue_categories"])),
            "latency": len(set(_uid_key(c) for c in f_clients if "Latencia QoS Alta (Voz/Datos)" in c["issue_categories"])),
            "rf_signal": len(set(_uid_key(c) for c in f_clients if "Señal RF Débil / Sticky" in c["issue_categories"])),
        }
        f_corp_rows = [c for c in f_clients if is_corporate_hostname(c.get("hostname"))]
        f_ext_rows = [c for c in f_clients if not is_corporate_hostname(c.get("hostname"))]
        f_corp_users = len(set(_uid_key(c) for c in f_corp_rows))
        f_ext_users = len(set(_uid_key(c) for c in f_ext_rows))
        f_issues = sum(1 for c in f_clients if c["issue_count"] > 0)
        f_healthy = f_total - f_issues
        f_fail_pct = round((f_issues / f_total) * 100, 1) if f_total else 0.0

        f_ret = sum(1 for c in f_clients if "Retransmisiones Altas (>=25%)" in c["issue_categories"])
        f_auth = sum(1 for c in f_clients if "Auth 802.1X: Red / ISE (>=6s)" in c["issue_categories"])
        f_auth_supp = sum(1 for c in f_clients if "Auth 802.1X: Espera Suplicante (>=6s)" in c["issue_categories"])
        f_assoc = sum(1 for c in f_clients if "Asociación Lenta (>2s)" in c["issue_categories"])
        f_dhcp = sum(1 for c in f_clients if "DHCP Lento (>2s)" in c["issue_categories"])
        f_roam = sum(1 for c in f_clients if "Roaming Lento (>3s)" in c["issue_categories"])
        f_onb = f_assoc + f_dhcp + f_roam
        f_lat = sum(1 for c in f_clients if "Latencia QoS Alta (Voz/Datos)" in c["issue_categories"])
        f_rf = sum(1 for c in f_clients if "Señal RF Débil / Sticky" in c["issue_categories"])

        aps_in_floor_fail = [a for a in ap_failure_ranking if a["floor"] == floor_name]
        worst_ap_in_floor = aps_in_floor_fail[0]["ap_name"] if aps_in_floor_fail else "--"
        worst_ap_issues = aps_in_floor_fail[0]["issue_clients"] if aps_in_floor_fail else 0
        worst_ap_total = aps_in_floor_fail[0]["client_count"] if aps_in_floor_fail else 0

        aps_in_floor_busy = [a for a in ap_summary if a["floor"] == floor_name and a["ap_name"] != "Sin AP"]
        busiest_ap_in_floor = aps_in_floor_busy[0]["ap_name"] if aps_in_floor_busy else "--"
        busiest_ap_clients = aps_in_floor_busy[0]["client_count"] if aps_in_floor_busy else 0
        busiest_ap_users = aps_in_floor_busy[0]["unique_users"] if aps_in_floor_busy else 0

        f_rets_vals = [c["retries"] for c in f_clients if c["retries"] is not None and c["retries"] > 0]
        f_rssi_vals = [c["rssi"] for c in f_clients if c["rssi"] is not None]
        f_voice_vals = [c["voice_lat"] for c in f_clients if c["voice_lat"] is not None]
        f_be_vals = [c["be_lat"] for c in f_clients if c["be_lat"] is not None]
        f_auth_vals = [c["auth_ms"] for c in f_clients if c["auth_ms"] is not None]
        f_assoc_vals = [c["assoc_ms"] for c in f_clients if c.get("assoc_ms") is not None]
        f_onb_vals = [c["onb_net_ms"] for c in f_clients if c.get("onb_net_ms") is not None]
        f_dhcp_vals = [c["dhcp_ms"] for c in f_clients if c["dhcp_ms"] is not None]
        f_roam_vals = [c["roam_ms"] for c in f_clients if c["roam_ms"] is not None]
        f_usage_b = sum(c["usage_b"] for c in f_clients)
        f_tx_b = sum(c["tx_b"] for c in f_clients)
        f_rx_b = sum(c["rx_b"] for c in f_clients)

        floor_client_summary.append({
            "floor": floor_name,
            "total_clients": f_total,
            "unique_users": f_unique_users,
            "issue_users": f_issue_users,
            "healthy_users": f_healthy_users,
            "user_failure_rate_pct": f_user_fail_pct,
            "alerts_users_breakdown": f_alerts_users,
            "corp_clients": len(f_corp_rows),
            "corp_users": f_corp_users,
            "ext_clients": len(f_ext_rows),
            "ext_users": f_ext_users,
            "healthy_clients": f_healthy,
            "issue_clients": f_issues,
            "failure_rate_pct": f_fail_pct,
            "health_rate_pct": round(100.0 - f_fail_pct, 1),
            "aps_count": len(set(c["ap_name"] for c in f_clients if c["ap_name"] != "Sin AP")),
            "busiest_ap": busiest_ap_in_floor,
            "busiest_ap_clients": busiest_ap_clients,
            "busiest_ap_users": busiest_ap_users,
            "worst_ap": worst_ap_in_floor,
            "worst_ap_issues": worst_ap_issues,
            "worst_ap_total": worst_ap_total,
            "avg_retries": avg(f_rets_vals),
            "avg_rssi": avg(f_rssi_vals),
            "avg_voice_lat": avg(f_voice_vals),
            "avg_be_lat": avg(f_be_vals),
            "avg_auth_ms": avg(f_auth_vals),
            "max_auth_ms": round(max(f_auth_vals), 0) if f_auth_vals else 0.0,
            "avg_assoc_ms": avg(f_assoc_vals),
            "avg_onboarding_ms": avg(f_onb_vals),
            "max_onboarding_ms": round(max(f_onb_vals), 0) if f_onb_vals else 0.0,
            "avg_dhcp_ms": avg(f_dhcp_vals),
            "avg_roam_ms": avg(f_roam_vals),
            "usage_b": f_usage_b,
            "usage_mb": round(f_usage_b / (1024.0 * 1024.0), 2),
            "usage_fmt": format_bytes(f_usage_b),
            "tx_b": f_tx_b,
            "tx_mb": round(f_tx_b / (1024.0 * 1024.0), 2),
            "tx_fmt": format_bytes(f_tx_b),
            "rx_b": f_rx_b,
            "rx_mb": round(f_rx_b / (1024.0 * 1024.0), 2),
            "rx_fmt": format_bytes(f_rx_b),
            "alerts_breakdown": {
                "retries": f_ret,
                "auth_slow": f_auth,
                "auth_supplicant": f_auth_supp,
                "assoc_slow": f_assoc,
                "dhcp_slow": f_dhcp,
                "roam_slow": f_roam,
                "onboarding": f_onb,
                "latency": f_lat,
                "connection": f_auth + f_auth_supp,
                "rf_signal": f_rf,
            },
            "total_alerts": f_ret + f_auth + f_auth_supp + f_assoc + f_dhcp + f_roam + f_lat + f_rf,
        })

    floor_client_summary.sort(key=lambda x: (x["issue_clients"], x["total_clients"]), reverse=True)

    # Resumen por Tipo de Dispositivo / Modelo, Fabricante y Sistema Operativo con desglose exacto por alerta
    def _build_dim_alert_summary(label_fn, short_fn):
        groups = defaultdict(list)
        canon_labels = {}
        shorts = {}
        for r in rows:
            raw_lbl = label_fn(r)
            k_norm = raw_lbl.strip().lower()
            if k_norm not in canon_labels:
                canon_labels[k_norm] = raw_lbl
            lbl = canon_labels[k_norm]
            groups[lbl].append(r)
            if lbl not in shorts:
                shorts[lbl] = short_fn(r, lbl)
        out = []
        for g_name, g_clients in groups.items():
            g_tot = len(g_clients)
            g_u_users = len(set(_uid_key(c) for c in g_clients))
            g_i_users = len(set(_uid_key(c) for c in g_clients if c["issue_count"] > 0))
            g_u_pct = round((g_i_users / g_u_users) * 100.0, 1) if g_u_users else 0.0
            g_alerts_u = {
                "retries": len(set(_uid_key(c) for c in g_clients if "Retransmisiones Altas (>=25%)" in c["issue_categories"])),
                "auth_slow": len(set(_uid_key(c) for c in g_clients if "Auth 802.1X: Red / ISE (>=6s)" in c["issue_categories"])),
                "auth_supplicant": len(set(_uid_key(c) for c in g_clients if "Auth 802.1X: Espera Suplicante (>=6s)" in c["issue_categories"])),
                "assoc_slow": len(set(_uid_key(c) for c in g_clients if "Asociación Lenta (>2s)" in c["issue_categories"])),
                "dhcp_slow": len(set(_uid_key(c) for c in g_clients if "DHCP Lento (>2s)" in c["issue_categories"])),
                "roam_slow": len(set(_uid_key(c) for c in g_clients if "Roaming Lento (>3s)" in c["issue_categories"])),
                "latency": len(set(_uid_key(c) for c in g_clients if "Latencia QoS Alta (Voz/Datos)" in c["issue_categories"])),
                "rf_signal": len(set(_uid_key(c) for c in g_clients if "Señal RF Débil / Sticky" in c["issue_categories"])),
            }
            g_issues = sum(1 for c in g_clients if c["issue_count"] > 0)
            g_rets = [c["retries"] for c in g_clients if c["retries"] is not None and c["retries"] > 0]
            g_rssi = [c["rssi"] for c in g_clients if c["rssi"] is not None]
            g_be = [c["be_lat"] for c in g_clients if c["be_lat"] is not None]
            g_auth = [c["auth_ms"] for c in g_clients if c["auth_ms"] is not None]
            g_assoc = [c["assoc_ms"] for c in g_clients if c.get("assoc_ms") is not None]
            g_dhcp = [c["dhcp_ms"] for c in g_clients if c["dhcp_ms"] is not None]
            g_roam = [c["roam_ms"] for c in g_clients if c["roam_ms"] is not None]
            g_usage_b = sum(c["usage_b"] for c in g_clients)
            # Piso principal donde más fallan estos equipos
            fl_fail_counts = defaultdict(int)
            for c in g_clients:
                if c["issue_count"] > 0 and c.get("floor") and c["floor"] != "--":
                    fl_fail_counts[c["floor"]] += 1
            top_fl = max(fl_fail_counts.items(), key=lambda x: x[1])[0] if fl_fail_counts else "--"
            out.append({
                "name": g_name,
                "short_name": shorts.get(g_name, g_name),
                "total_clients": g_tot,
                "unique_users": g_u_users,
                "issue_users": g_i_users,
                "issue_clients": g_issues,
                "user_failure_rate_pct": g_u_pct,
                "alerts_users_breakdown": g_alerts_u,
                "top_floor": top_fl,
                "avg_retries": avg(g_rets),
                "avg_rssi": avg(g_rssi),
                "avg_be_lat": avg(g_be),
                "avg_auth_ms": avg(g_auth),
                "avg_assoc_ms": avg(g_assoc),
                "avg_dhcp_ms": avg(g_dhcp),
                "avg_roam_ms": avg(g_roam),
                "usage_b": g_usage_b,
                "usage_mb": round(g_usage_b / (1024.0 * 1024.0), 2),
                "usage_fmt": format_bytes(g_usage_b),
            })
        out.sort(key=lambda x: (x["issue_users"], x["unique_users"]), reverse=True)
        return out

    device_model_summary = _build_dim_alert_summary(
        lambda r: r.get("device_model") or normalize_device_model(r.get("device_type"), r.get("vendor"), r.get("os"), r.get("endpoint_type"))[0],
        lambda r, lbl: r.get("device_model_short") or (lbl[:18] + "…" if len(lbl) > 19 else lbl),
    )
    device_vendor_summary = _build_dim_alert_summary(
        lambda r: r.get("vendor_clean") or normalize_vendor_name(r.get("vendor"), r.get("os"))[0],
        lambda r, lbl: r.get("vendor_short") or (lbl[:16] + "…" if len(lbl) > 17 else lbl),
    )
    device_os_summary = _build_dim_alert_summary(
        lambda r: r.get("os") if r.get("os") and r.get("os") != "--" else "SO Desconocido",
        lambda r, lbl: lbl.replace(" Enterprise LTSC", " LTSC").replace(" Enterprise", " Ent."),
    )

    # Totales globales por categoría de alerta de diagnóstico (con Auth ISE/Red vs Suplicante, Asociación, DHCP y Roaming separados)
    alert_categories_summary = {
        "Retransmisiones Altas (>=25%)": sum(f["alerts_breakdown"]["retries"] for f in floor_client_summary),
        "Auth 802.1X: Red / ISE (>=6s)": sum(f["alerts_breakdown"]["auth_slow"] for f in floor_client_summary),
        "Auth 802.1X: Espera Suplicante (>=6s)": sum(f["alerts_breakdown"]["auth_supplicant"] for f in floor_client_summary),
        "Asociación Lenta (>2s)": sum(f["alerts_breakdown"]["assoc_slow"] for f in floor_client_summary),
        "DHCP Lento (>2s)": sum(f["alerts_breakdown"]["dhcp_slow"] for f in floor_client_summary),
        "Roaming Lento (>3s)": sum(f["alerts_breakdown"]["roam_slow"] for f in floor_client_summary),
        "Latencia QoS Alta (Voz/Datos)": sum(f["alerts_breakdown"]["latency"] for f in floor_client_summary),
        "Señal RF Débil / Sticky": sum(f["alerts_breakdown"]["rf_signal"] for f in floor_client_summary),
    }

    alert_users_summary = {
        cat_name: len(set(_uid_key(r) for r in rows if cat_name in r.get("issue_categories", [])))
        for cat_name in alert_categories_summary.keys()
    }

    worst_floor = floor_client_summary[0] if floor_client_summary else None
    worst_ap = ap_failure_ranking[0] if ap_failure_ranking else None
    busiest_ap = ap_summary[0] if ap_summary else None
    floors_by_users = sorted(floor_client_summary, key=lambda x: (x["total_clients"], x["unique_users"]), reverse=True)
    busiest_floor = floors_by_users[0] if floors_by_users else None

    kpis = {
        "total_clients": total,
        "connected_count": len(connected),
        "not_connected_count": len(not_connected),
        "connected_pct": round(len(connected) * 100.0 / total, 1),
        "healthy_clients_count": total - len(clients_with_any_issue),
        "issue_clients_count": len(clients_with_any_issue),
        "issue_clients_pct": round(len(clients_with_any_issue) * 100.0 / total, 1),
        "unique_aps": len(unique_aps),
        "unique_floors": len(unique_floors),
        "unique_users": len(unique_users),
        "issue_users_count": len(issue_unique_users),
        "issue_users_pct": round(len(issue_unique_users) * 100.0 / len(unique_users), 1) if unique_users else 0.0,
        "corp_clients": sum(1 for r in rows if is_corporate_hostname(r.get("hostname"))),
        "corp_users": len(set(r["user_id"] for r in rows if is_corporate_hostname(r.get("hostname")) and r["user_id"] != "--")),
        "ext_clients": sum(1 for r in rows if not is_corporate_hostname(r.get("hostname"))),
        "ext_users": len(set(r["user_id"] for r in rows if not is_corporate_hostname(r.get("hostname")) and r["user_id"] != "--")),
        "total_usage_b": total_usage,
        "total_usage_fmt": format_bytes(total_usage),
        "total_tx_fmt": format_bytes(total_tx),
        "total_rx_fmt": format_bytes(total_rx),
        "avg_health": avg(health_vals),
        "avg_rssi": avg(rssi_vals),
        "avg_snr": avg(snr_vals),
        "avg_retries": avg(retry_vals),
        "avg_data_rate": avg(rate_vals),
        "avg_onboarding_ms": avg(onb_vals),
        "avg_assoc_ms": avg(assoc_vals),
        "avg_auth_ms": avg(auth_vals),
        "avg_dhcp_ms": avg(dhcp_vals),
        "avg_roam_ms": avg(roam_vals),
        "avg_voice_lat": avg(voice_vals),
        "avg_be_lat": avg(be_vals),
        "sticky_count": len(sticky_clients),
        "high_retry_count": len(high_retry_clients),
        "slow_auth_count": sum(1 for r in rows if "Auth 802.1X: Red / ISE (>=6s)" in r.get("issue_categories", [])),
        "slow_auth_supp_count": sum(1 for r in rows if "Auth 802.1X: Espera Suplicante (>=6s)" in r.get("issue_categories", [])),
        "high_lat_count": len(high_lat_clients),
        "low_health_count": len(low_health_clients),
        "slow_onb_count": len(slow_onb_clients),
        "busiest_ap_name": busiest_ap["ap_name"] if busiest_ap else "--",
        "busiest_ap_floor": busiest_ap["floor"] if busiest_ap else "--",
        "busiest_ap_clients": busiest_ap["client_count"] if busiest_ap else 0,
        "busiest_ap_users": busiest_ap["unique_users"] if busiest_ap else 0,
        "busiest_ap_retries": busiest_ap["avg_retries"] if busiest_ap else 0.0,
        "busiest_ap_auth_ms": busiest_ap["avg_auth_ms"] if busiest_ap else 0.0,
        "busiest_floor_name": busiest_floor["floor"] if busiest_floor else "--",
        "busiest_floor_clients": busiest_floor["total_clients"] if busiest_floor else 0,
        "busiest_floor_users": busiest_floor["unique_users"] if busiest_floor else 0,
        "worst_floor_name": worst_floor["floor"] if worst_floor else "--",
        "worst_floor_issues": worst_floor["issue_clients"] if worst_floor else 0,
        "worst_floor_total": worst_floor["total_clients"] if worst_floor else 0,
        "worst_floor_pct": worst_floor["failure_rate_pct"] if worst_floor else 0.0,
        "worst_ap_name": worst_ap["ap_name"] if worst_ap else "--",
        "worst_ap_floor": worst_ap["floor"] if worst_ap else "--",
        "worst_ap_issues": worst_ap["issue_clients"] if worst_ap else 0,
        "worst_ap_total": worst_ap["client_count"] if worst_ap else 0,
        "worst_ap_pct": worst_ap["failure_rate_pct"] if worst_ap else 0.0,
        "worst_ap_cause": worst_ap["top_failure_cause"] if worst_ap else "--",
    }

    # 3. Análisis por Usuario
    user_groups = defaultdict(list)
    for r in rows:
        user_groups[r["user_id"]].append(r)

    user_summary = []
    for uid, u_clients in user_groups.items():
        u_usage = sum(c["usage_b"] for c in u_clients)
        u_aps = sorted(list(set(c["ap_name"] for c in u_clients)))
        u_floors = sorted(list(set(c["floor"] for c in u_clients)))
        u_devs = sorted(list(set(c["device_type"] for c in u_clients)))
        u_rssi = [c["rssi"] for c in u_clients if c["rssi"] is not None]
        u_ret = [c["retries"] for c in u_clients if c["retries"] is not None]
        u_health = [c["health"] for c in u_clients if c["health"] is not None]
        u_onb = [c["onboarding_ms"] for c in u_clients if c["onboarding_ms"] is not None]

        user_summary.append({
            "user_id": uid,
            "device_count": len(u_clients),
            "devices": u_devs,
            "macs": [c["mac"] for c in u_clients],
            "hostnames": [c["hostname"] for c in u_clients if c["hostname"] != "--"],
            "aps": u_aps,
            "floors": u_floors,
            "usage_b": u_usage,
            "usage_fmt": format_bytes(u_usage),
            "avg_rssi": avg(u_rssi),
            "avg_retries": avg(u_ret),
            "max_retries": max(u_ret) if u_ret else 0.0,
            "min_health": min(u_health) if u_health else None,
            "max_onboarding_ms": max(u_onb) if u_onb else None,
            "issue_count": sum(c["issue_count"] for c in u_clients),
            "statuses": list(set(c["status"] for c in u_clients)),
        })

    user_summary.sort(key=lambda x: (x["usage_b"], x["device_count"]), reverse=True)

    # 4. Series Temporales (Por Hora, cada 15 min y Duración de Sesión)
    hourly_map = defaultdict(list)
    slot15_map = defaultdict(list)
    session_buckets = {
        "< 15 min (Reciente)": 0,
        "15 - 60 min": 0,
        "1 - 3 horas": 0,
        "3 - 6 horas": 0,
        "> 6 horas (Larga)": 0,
    }
    for r in rows:
        if r["hour_slot"] != "--":
            hourly_map[r["hour_slot"]].append(r)
        if r["slot_15m"] != "--":
            slot15_map[r["slot_15m"]].append(r)
        sb = r["session_bucket"]
        if sb in session_buckets:
            session_buckets[sb] += 1

    hourly_series = []
    for hr in sorted(hourly_map.keys()):
        h_rows = hourly_map[hr]
        h_ret = [x["retries"] for x in h_rows if x["retries"] is not None]
        h_aph = [x["ap_health"] for x in h_rows if x.get("ap_health") is not None]
        hourly_series.append({
            "hour": hr,
            "client_count": len(h_rows),
            "avg_retries": avg(h_ret),
            "avg_ap_health": avg(h_aph) if h_aph else 10.0,
        })

    slot15_series = []
    for sl in sorted(slot15_map.keys()):
        s_rows = slot15_map[sl]
        s_onb = [x["onboarding_ms"] / 1000.0 for x in s_rows if x["onboarding_ms"] is not None]
        s_aph = [x["ap_health"] for x in s_rows if x.get("ap_health") is not None]
        slot15_series.append({
            "slot": sl,
            "client_count": len(s_rows),
            "avg_onboarding_s": avg(s_onb),
            "avg_ap_health": avg(s_aph) if s_aph else 10.0,
        })

    def count_dist(key):
        d = defaultdict(int)
        for r in rows:
            d[r[key]] += 1
        return dict(sorted(d.items(), key=lambda x: x[1], reverse=True))

    retry_buckets = {
        "0-10% (Óptimo)": 0,
        "11-20% (Normal)": 0,
        "21-24% (Elevado)": 0,
        "25-30% (Alto)": 0,
        "> 30% (Crítico)": 0,
    }
    for r in rows:
        rb = r["retry_bucket"]
        if rb in retry_buckets:
            retry_buckets[rb] += 1

    slow_auth_clients = [r for r in rows if "Auth 802.1X: Red / ISE (>=6s)" in r.get("issue_categories", [])]
    insights = []
    if ap_summary:
        top_busy = ap_summary[:3]
        insights.append({
            "severity": "info",
            "action_type": "ap_focus",
            "action_value": top_busy[0]["ap_name"],
            "title": f"APs con Mayor Número de Usuarios en el Día: {', '.join(a['ap_name'] for a in top_busy)}",
            "desc": "Estos Access Points concentran la mayor densidad de usuarios y sesiones conectadas. Haz clic para inspeccionar el AP con más usuarios.",
            "affected": [f"{a['ap_name']} ({a['floor']}): {a['unique_users']} usuarios ({a['client_count']} ses. • Retries: {a['avg_retries']}% • Auth: {a['avg_auth_ms']}ms)" for a in top_busy],
        })
    if ap_failure_ranking:
        top3 = ap_failure_ranking[:3]
        insights.append({
            "severity": "critical",
            "action_type": "ap_focus",
            "action_value": top3[0]["ap_name"],
            "title": f"APs con más clientes afectados (Retries / Auth 802.1X): {', '.join(a['ap_name'] for a in top3)}",
            "desc": "Estos 3 APs concentran la mayor cantidad de clientes con Retransmisiones >= 25%, Autenticación 802.1X lenta (>=6s) o Latencia alta. Haz clic para filtrar.",
            "affected": [f"{a['ap_name']} ({a['floor']}): {a['issue_clients']}/{a['client_count']} clientes ({a['failure_rate_pct']}%) — Principal: {a['top_failure_cause']}" for a in top3],
        })
    if high_retry_clients:
        insights.append({
            "severity": "warning",
            "action_type": "retry_range",
            "action_value": "25-100",
            "title": f"{len(high_retry_clients)} Clientes con Retransmisiones L2 >= 25% (Clic para aislar)",
            "desc": "Alta contención de Airtime / Interferencia Co-Canal. Úsalo como línea base (Baseline) para medir cuánto mejora día a día.",
            "affected": [f"{c['user_id']} en {c['ap_name']} ({int(c['retries'])}%)" for c in sorted(high_retry_clients, key=lambda x: x['retries'], reverse=True)[:6]],
        })
    if slow_auth_clients:
        insights.append({
            "severity": "warning",
            "action_type": "alert_cat",
            "action_value": "Auth 802.1X: Red / ISE (>=6s)",
            "title": f"{len(slow_auth_clients)} Clientes con Demora Real de Red / ISE en Auth 802.1X >= 6s (Clic para aislar)",
            "desc": "Clientes donde el intercambio EAP/RADIUS presenta ráfagas simultáneas en ISE/AP, pérdida RF o degradación de Onboarding Health.",
            "affected": [f"{c['user_id']} en {c['ap_name']} ({int(c['auth_ms'])} ms)" for c in sorted(slow_auth_clients, key=lambda x: x['auth_ms'], reverse=True)[:6]],
        })

    # 5. Análisis de TAGS DE ALARMAS CONCURRENTES (Frecuencia por Tag y Combinaciones Simultáneas)
    tag_counts_map = defaultdict(int)
    concurrency_buckets = {
        "0 Alarmas (Sano)": 0,
        "1 Alarma": 0,
        "2 Alarmas Concurrentes": 0,
        "3+ Alarmas Concurrentes": 0,
    }
    combo_map = defaultdict(list)

    for r in rows:
        tags = r.get("alarm_tags", [])
        tc = len(tags)
        if tc == 0:
            concurrency_buckets["0 Alarmas (Sano)"] += 1
        elif tc == 1:
            concurrency_buckets["1 Alarma"] += 1
        elif tc == 2:
            concurrency_buckets["2 Alarmas Concurrentes"] += 1
        else:
            concurrency_buckets["3+ Alarmas Concurrentes"] += 1

        for t in tags:
            tag_counts_map[t] += 1

        if tc >= 2:
            combo_key = " + ".join(sorted(tags[:3]))
            combo_map[combo_key].append(r)

    sorted_tags = [
        {"tag": k, "count": v, "pct": round((v / total) * 100.0, 1)}
        for k, v in sorted(tag_counts_map.items(), key=lambda x: x[1], reverse=True)
    ]

    top_combinations = []
    for c_key, c_rows in sorted(combo_map.items(), key=lambda x: len(x[1]), reverse=True)[:12]:
        sample_aps = sorted(list(set(x["ap_name"] for x in c_rows)))[:3]
        sample_floors = sorted(list(set(x["floor"] for x in c_rows)))[:3]
        sample_users = [x["user_id"] for x in c_rows[:4]]
        first_tag = c_key.split(" + ")[0]
        top_combinations.append({
            "combo": c_key,
            "first_tag": first_tag,
            "count": len(c_rows),
            "pct": round((len(c_rows) / total) * 100.0, 1),
            "sample_aps": sample_aps,
            "sample_floors": sample_floors,
            "sample_users": sample_users,
        })

    concurrent_alarms = {
        "tag_counts": sorted_tags,
        "concurrency_buckets": concurrency_buckets,
        "top_combinations": top_combinations,
        "multi_alarm_clients_count": concurrency_buckets["2 Alarmas Concurrentes"] + concurrency_buckets["3+ Alarmas Concurrentes"],
    }

    # 6. Análisis de AUTENTICACIÓN Y TIEMPOS DE CONEXIÓN (¿Dónde se demora más?)
    auth_by_floor = sorted(
        [f for f in floor_client_summary if f["avg_onboarding_ms"] > 0 or f["avg_auth_ms"] > 0],
        key=lambda x: (x["avg_auth_ms"], x["avg_onboarding_ms"]),
        reverse=True,
    )

    auth_by_ap = sorted(
        [a for a in ap_summary if a["ap_name"] != "Sin AP" and (a["avg_auth_ms"] > 0 or a["avg_onboarding_ms"] > 0)],
        key=lambda x: (x["avg_auth_ms"], x["avg_onboarding_ms"], x["client_count"]),
        reverse=True,
    )[:15]

    server_groups = defaultdict(list)
    os_auth_groups = defaultdict(list)
    for r in rows:
        srv = r["auth_server"] if r["auth_server"] != "--" else "Sin Auth Server (Caché/Roam)"
        server_groups[srv].append(r)
        os_auth_groups[r["os"]].append(r)

    auth_by_server = []
    for srv, s_rows in server_groups.items():
        s_auth = [x["auth_ms"] for x in s_rows if x["auth_ms"] is not None]
        s_onb = [x["onboarding_ms"] for x in s_rows if x["onboarding_ms"] is not None]
        s_dhcp = [x["dhcp_ms"] for x in s_rows if x["dhcp_ms"] is not None]
        auth_by_server.append({
            "server": srv,
            "client_count": len(s_rows),
            "avg_auth_ms": avg(s_auth),
            "max_auth_ms": round(max(s_auth), 0) if s_auth else 0.0,
            "avg_onboarding_ms": avg(s_onb),
            "avg_dhcp_ms": avg(s_dhcp),
            "slow_auth_count": sum(1 for x in s_rows if (x["auth_ms"] or 0) >= 6000),
        })
    auth_by_server.sort(key=lambda x: (x["avg_auth_ms"], x["client_count"]), reverse=True)

    auth_by_os = []
    for os_name, o_rows in os_auth_groups.items():
        o_auth = [x["auth_ms"] for x in o_rows if x["auth_ms"] is not None]
        o_onb = [x["onboarding_ms"] for x in o_rows if x["onboarding_ms"] is not None]
        if o_auth or o_onb:
            auth_by_os.append({
                "os": os_name,
                "client_count": len(o_rows),
                "avg_auth_ms": avg(o_auth),
                "max_auth_ms": round(max(o_auth), 0) if o_auth else 0.0,
                "avg_onboarding_ms": avg(o_onb),
            })
    auth_by_os.sort(key=lambda x: x["avg_auth_ms"], reverse=True)

    slowest_auth_clients = sorted(
        [r for r in rows if (r["auth_ms"] is not None and r["auth_ms"] > 0) or (r["onboarding_ms"] is not None and r["onboarding_ms"] > 0)],
        key=lambda x: ((x["auth_ms"] or 0), (x["onboarding_ms"] or 0)),
        reverse=True,
    )[:20]

    auth_analytics = {
        "by_floor": auth_by_floor,
        "by_ap": auth_by_ap,
        "by_server": auth_by_server,
        "by_os": auth_by_os,
        "slowest_clients": slowest_auth_clients,
        "slow_auth_3s_count": sum(1 for r in rows if (r["auth_ms"] or 0) >= 6000),
        "slow_auth_5s_count": sum(1 for r in rows if (r["auth_ms"] or 0) >= 6000),
        "slow_onb_5s_count": sum(1 for r in rows if (r["onboarding_ms"] or 0) >= 5000),
        "slow_onb_10s_count": len(slow_onb_clients),
    }

    # 7. Análisis de TRÁFICO DE DATOS TRANSMITIDOS (Por Cliente, Por AP y Por Piso)
    traffic_by_floor = sorted(
        floor_client_summary,
        key=lambda x: x["usage_b"],
        reverse=True,
    )
    traffic_by_ap = sorted(
        [a for a in ap_summary if a["ap_name"] != "Sin AP"],
        key=lambda x: x["usage_b"],
        reverse=True,
    )[:15]
    top_traffic_clients = sorted(
        rows,
        key=lambda x: x["usage_b"],
        reverse=True,
    )[:20]

    traffic_analytics = {
        "total_usage_fmt": format_bytes(total_usage),
        "total_tx_fmt": format_bytes(total_tx),
        "total_rx_fmt": format_bytes(total_rx),
        "total_usage_mb": round(total_usage / (1024.0 * 1024.0), 2),
        "total_tx_mb": round(total_tx / (1024.0 * 1024.0), 2),
        "total_rx_mb": round(total_rx / (1024.0 * 1024.0), 2),
        "by_floor": traffic_by_floor,
        "by_ap": traffic_by_ap,
        "top_clients": top_traffic_clients,
    }

    # 8. Análisis de RENDIMIENTO Y USUARIOS MÁS AFECTADOS
    data_rate_buckets = {
        "< 72 Mbps (Bajo)": 0,
        "72 - 149 Mbps (Medio)": 0,
        "150 - 249 Mbps (Bueno)": 0,
        ">= 250 Mbps (Óptimo Wi-Fi 6)": 0,
    }
    for r in rows:
        dr = r["data_rate"] or 0.0
        if dr < 72:
            data_rate_buckets["< 72 Mbps (Bajo)"] += 1
        elif dr < 150:
            data_rate_buckets["72 - 149 Mbps (Medio)"] += 1
        elif dr < 250:
            data_rate_buckets["150 - 249 Mbps (Bueno)"] += 1
        else:
            data_rate_buckets[">= 250 Mbps (Óptimo Wi-Fi 6)"] += 1

    top_retry_clients = sorted(
        rows,
        key=lambda x: (x["retries"] or 0, x["alarm_tags_count"], x["usage_b"]),
        reverse=True,
    )[:15]

    most_affected_clients = sorted(
        [r for r in rows if r["alarm_tags_count"] > 0 or r["issue_count"] > 0],
        key=lambda x: (x["alarm_tags_count"], x["issue_count"], x["retries"] or 0, x["onboarding_ms"] or 0),
        reverse=True,
    )[:20]

    performance_analytics = {
        "data_rate_buckets": data_rate_buckets,
        "top_retry_clients": top_retry_clients,
        "most_affected_clients": most_affected_clients,
    }

    # 9. Comparativa por DÍAS (Evolución Diaria de Fallos, Retries, Autenticación y Tráfico + Resumen TOTAL)
    daily_comparison = compute_daily_comparison(rows) if include_daily else {}

    return {
        "total_records": total,
        "kpis": kpis,
        "ap_summary": ap_summary,
        "ap_failure_ranking": ap_failure_ranking,
        "floor_client_summary": floor_client_summary,
        "device_model_summary": device_model_summary,
        "device_vendor_summary": device_vendor_summary,
        "device_os_summary": device_os_summary,
        "alert_categories_summary": alert_categories_summary,
        "alert_users_summary": alert_users_summary,
        "concurrent_alarms": concurrent_alarms,
        "auth_analytics": auth_analytics,
        "traffic_analytics": traffic_analytics,
        "performance_analytics": performance_analytics,
        "daily_comparison": daily_comparison,
        "user_summary": user_summary,
        "time_analytics": {
            "hourly": hourly_series,
            "slot15m": slot15_series,
            "session_buckets": session_buckets,
        },
        "distributions": {
            "band": count_dist("band"),
            "protocol": count_dist("protocol"),
            "capability": count_dist("capability"),
            "rf_quality": count_dist("rf_quality"),
            "device_type": count_dist("device_type"),
            "os": count_dist("os"),
            "status": count_dist("status"),
            "ssid": count_dist("ssid"),
            "floor": count_dist("floor"),
            "retries_bucket": retry_buckets,
            "data_rate_bucket": data_rate_buckets,
        },
        "insights": insights,
        "clients": rows,
    }


def _summarize_day_group(label, d_rows):
    def avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0.0

    d_total = len(d_rows)
    d_issues = sum(1 for c in d_rows if c["issue_count"] > 0)
    d_healthy = d_total - d_issues
    d_fail_pct = round((d_issues / d_total) * 100.0, 1) if d_total else 0.0

    d_rets = [c["retries"] for c in d_rows if c["retries"] is not None and c["retries"] > 0]
    d_rssi = [c["rssi"] for c in d_rows if c["rssi"] is not None]
    d_auth = [c["auth_ms"] for c in d_rows if c["auth_ms"] is not None]
    d_assoc = [c["assoc_ms"] for c in d_rows if c.get("assoc_ms") is not None]
    d_onb = [c["onb_net_ms"] for c in d_rows if c.get("onb_net_ms") is not None]
    d_dhcp = [c["dhcp_ms"] for c in d_rows if c.get("dhcp_ms") is not None]
    d_roam = [c["roam_ms"] for c in d_rows if c.get("roam_ms") is not None]
    d_voice = [c["voice_lat"] for c in d_rows if c["voice_lat"] is not None]
    d_be = [c["be_lat"] for c in d_rows if c["be_lat"] is not None]
    d_usage = sum(c["usage_b"] for c in d_rows)
    d_tx = sum(c["tx_b"] for c in d_rows)
    d_rx = sum(c["rx_b"] for c in d_rows)

    d_high_ret = sum(1 for c in d_rows if "Retransmisiones Altas (>=25%)" in c.get("issue_categories", []))
    d_multi_alarm = sum(1 for c in d_rows if c.get("alarm_tags_count", 0) >= 2)
    d_slow_auth = sum(1 for c in d_rows if "Auth 802.1X: Red / ISE (>=6s)" in c.get("issue_categories", []))
    d_supp_auth = sum(1 for c in d_rows if "Auth 802.1X: Espera Suplicante (>=6s)" in c.get("issue_categories", []))
    d_slow_assoc = sum(1 for c in d_rows if "Asociación Lenta (>2s)" in c.get("issue_categories", []))
    d_slow_dhcp = sum(1 for c in d_rows if "DHCP Lento (>2s)" in c.get("issue_categories", []))
    d_slow_roam = sum(1 for c in d_rows if "Roaming Lento (>3s)" in c.get("issue_categories", []))
    d_high_lat = sum(1 for c in d_rows if "Latencia QoS Alta (Voz/Datos)" in c.get("issue_categories", []))
    d_weak_rf = sum(1 for c in d_rows if "Señal RF Débil / Sticky" in c.get("issue_categories", []))

    d_floor_counts = defaultdict(int)
    d_ap_counts = defaultdict(int)
    d_busy_ap_counts = defaultdict(int)
    d_busy_ap_users = defaultdict(set)
    d_busy_floor_counts = defaultdict(int)
    for c in d_rows:
        if c["ap_name"] != "Sin AP":
            d_busy_ap_counts[c["ap_name"]] += 1
            if c["user_id"] != "--":
                d_busy_ap_users[c["ap_name"]].add(c["user_id"])
        if c["floor"] != "--":
            d_busy_floor_counts[c["floor"]] += 1
        if c["issue_count"] > 0:
            d_floor_counts[c["floor"]] += 1
            d_ap_counts[c["ap_name"]] += 1
    top_f = max(d_floor_counts.items(), key=lambda x: x[1])[0] if d_floor_counts else "--"
    top_a = max(d_ap_counts.items(), key=lambda x: x[1])[0] if d_ap_counts else "--"

    busiest_ap_name = max(d_busy_ap_counts.items(), key=lambda x: x[1])[0] if d_busy_ap_counts else "--"
    busiest_ap_ses = d_busy_ap_counts[busiest_ap_name] if busiest_ap_name != "--" else 0
    busiest_ap_usr = len(d_busy_ap_users[busiest_ap_name]) if busiest_ap_name != "--" else 0
    busiest_floor_name = max(d_busy_floor_counts.items(), key=lambda x: x[1])[0] if d_busy_floor_counts else "--"
    busiest_floor_ses = d_busy_floor_counts[busiest_floor_name] if busiest_floor_name != "--" else 0
    d_unique_users = len(set(c["user_id"] for c in d_rows if c["user_id"] != "--"))
    d_corp_rows = [c for c in d_rows if is_corporate_hostname(c.get("hostname"))]
    d_ext_rows = [c for c in d_rows if not is_corporate_hostname(c.get("hostname"))]
    d_corp_users = len(set(c["user_id"] for c in d_corp_rows if c["user_id"] != "--"))
    d_ext_users = len(set(c["user_id"] for c in d_ext_rows if c["user_id"] != "--"))

    return {
        "day_label": label,
        "source_files": sorted(list(set(c.get("source_file", "") for c in d_rows if c.get("source_file")))),
        "total_clients": d_total,
        "unique_users": d_unique_users,
        "corp_clients": len(d_corp_rows),
        "corp_users": d_corp_users,
        "ext_clients": len(d_ext_rows),
        "ext_users": d_ext_users,
        "healthy_clients": d_healthy,
        "issue_clients": d_issues,
        "failure_rate_pct": d_fail_pct,
        "avg_retries": avg(d_rets),
        "high_retry_clients": d_high_ret,
        "high_retry_pct": round((d_high_ret / d_total) * 100.0, 1) if d_total else 0.0,
        "avg_rssi": avg(d_rssi),
        "avg_auth_ms": avg(d_auth),
        "avg_assoc_ms": avg(d_assoc),
        "avg_dhcp_ms": avg(d_dhcp),
        "avg_roam_ms": avg(d_roam),
        "avg_onboarding_ms": avg(d_onb),
        "slow_auth_clients": d_slow_auth,
        "supplicant_auth_clients": d_supp_auth,
        "fail_retries": d_high_ret,
        "fail_auth": d_slow_auth,
        "fail_auth_supp": d_supp_auth,
        "fail_assoc": d_slow_assoc,
        "fail_dhcp": d_slow_dhcp,
        "fail_roam": d_slow_roam,
        "fail_latency": d_high_lat,
        "fail_rf": d_weak_rf,
        "avg_voice_lat": avg(d_voice),
        "avg_be_lat": avg(d_be),
        "multi_alarm_clients": d_multi_alarm,
        "usage_b": d_usage,
        "usage_mb": round(d_usage / (1024.0 * 1024.0), 2),
        "usage_fmt": format_bytes(d_usage),
        "tx_mb": round(d_tx / (1024.0 * 1024.0), 2),
        "tx_fmt": format_bytes(d_tx),
        "rx_mb": round(d_rx / (1024.0 * 1024.0), 2),
        "rx_fmt": format_bytes(d_rx),
        "busiest_ap": busiest_ap_name,
        "busiest_ap_clients": busiest_ap_ses,
        "busiest_ap_users": busiest_ap_usr,
        "busiest_floor": busiest_floor_name,
        "busiest_floor_clients": busiest_floor_ses,
        "worst_floor": top_f,
        "worst_ap": top_a,
    }


def compute_daily_comparison(rows):
    day_groups = defaultdict(list)
    for r in rows:
        dl = r.get("day_label") or r.get("auto_date") or "Día 1"
        day_groups[dl].append(r)

    days_list = [_summarize_day_group(dl, day_groups[dl]) for dl in sorted(day_groups.keys())]
    total_summary = _summarize_day_group("TOTAL ACUMULADO", rows)
    total_summary["days_count"] = len(days_list)

    day_deltas = None
    if len(days_list) >= 2:
        first_d = days_list[0]
        last_d = days_list[-1]
        day_deltas = {
            "first_day": first_d["day_label"],
            "last_day": last_d["day_label"],
            "delta_failure_pct": round(last_d["failure_rate_pct"] - first_d["failure_rate_pct"], 1),
            "delta_retries": round(last_d["avg_retries"] - first_d["avg_retries"], 1),
            "delta_high_retry_pct": round(last_d["high_retry_pct"] - first_d["high_retry_pct"], 1),
            "delta_auth_ms": round(last_d["avg_auth_ms"] - first_d["avg_auth_ms"], 1),
            "delta_onboarding_ms": round(last_d["avg_onboarding_ms"] - first_d["avg_onboarding_ms"], 1),
        }

    return {
        "days": days_list,
        "total_summary": total_summary,
        "deltas": day_deltas,
    }


def filter_rows(rows, params):
    filtered = rows

    q = (params.get("q") or "").strip().lower()
    if q:
        filtered = [
            r for r in filtered
            if q in r["user_id"].lower()
            or q in r["hostname"].lower()
            or q in r["mac"].lower()
            or q in r["ipv4"].lower()
            or q in r["ap_name"].lower()
            or q in r["floor"].lower()
            or q in r["device_type"].lower()
            or q in r["os"].lower()
            or any(q in cat.lower() for cat in r.get("issue_categories", []))
            or any(q in tag.lower() for tag in r.get("alarm_tags", []))
        ]

    source_file = params.get("source_file")
    if source_file and source_file != "ALL":
        filtered = [r for r in filtered if r.get("source_file") == source_file]

    day_label = params.get("day_label")
    if day_label and day_label != "ALL":
        day_set = {d.strip() for d in str(day_label).split(",") if d.strip()}
        if day_set:
            filtered = [r for r in filtered if r.get("day_label") in day_set]

    corp_filter = (params.get("corp_filter") or "").strip().upper()
    if corp_filter == "CORP":
        filtered = [r for r in filtered if is_corporate_hostname(r.get("hostname"))]
    elif corp_filter == "EXT":
        filtered = [r for r in filtered if not is_corporate_hostname(r.get("hostname"))]

    client_floor = params.get("client_floor")
    if client_floor and client_floor != "ALL":
        filtered = [r for r in filtered if r["floor"] == client_floor]

    ap = params.get("ap")
    if ap and ap != "ALL":
        filtered = [r for r in filtered if r["ap_name"] == ap]

    retry_range = params.get("retry_range")
    if retry_range and retry_range != "ALL":
        parts = retry_range.split("-")
        if len(parts) == 2:
            lo, hi = float(parts[0]), float(parts[1])
            filtered = [r for r in filtered if lo <= (r["retries"] or 0) <= hi]

    band = params.get("band")
    if band and band != "ALL":
        filtered = [r for r in filtered if r["band"] == band]

    protocol = params.get("protocol")
    if protocol and protocol != "ALL":
        filtered = [r for r in filtered if r["protocol"] == protocol]

    status = params.get("status")
    if status and status != "ALL":
        filtered = [r for r in filtered if r["status"] == status]

    exclude_disconnected = params.get("exclude_disconnected")
    if exclude_disconnected == "true":
        filtered = [r for r in filtered if r.get("status") != "DISCONNECTED"]

    os_filter = params.get("os")
    if os_filter and os_filter != "ALL":
        filtered = [r for r in filtered if r["os"] == os_filter]

    rf_quality = params.get("rf_quality")
    if rf_quality and rf_quality != "ALL":
        filtered = [r for r in filtered if r["rf_quality"] == rf_quality]

    hour_slot = params.get("hour_slot")
    if hour_slot and hour_slot != "ALL":
        filtered = [r for r in filtered if r.get("hour_slot") == hour_slot]

    session_bucket = params.get("session_bucket")
    if session_bucket and session_bucket != "ALL":
        filtered = [r for r in filtered if r.get("session_bucket") == session_bucket]

    alert_cat = params.get("alert_cat")
    if alert_cat and alert_cat != "ALL":
        filtered = [r for r in filtered if alert_cat in r.get("issue_categories", [])]

    alarm_tag = params.get("alarm_tag")
    if alarm_tag and alarm_tag != "ALL":
        if " + " in alarm_tag:
            req_tags = [t.strip() for t in alarm_tag.split(" + ") if t.strip()]
            filtered = [r for r in filtered if all(rt in r.get("alarm_tags", []) for rt in req_tags)]
        else:
            filtered = [r for r in filtered if alarm_tag in r.get("alarm_tags", [])]

    only_issues = params.get("only_issues")
    if only_issues == "true":
        filtered = [r for r in filtered if r["issue_count"] > 0]

    min_retries = parse_float(params.get("min_retries"))
    if min_retries is not None and min_retries > 0:
        filtered = [r for r in filtered if (r["retries"] or 0) >= min_retries]

    max_retries = parse_float(params.get("max_retries"))
    if max_retries is not None and max_retries >= 0:
        filtered = [r for r in filtered if (r["retries"] or 0) <= max_retries]

    return filtered
