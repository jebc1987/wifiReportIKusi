/**
 * MOTOR PORTABLE 100% CLIENT-SIDE (Equivalente exacto de csv_analyzer.py + app.py)
 * Permite ejecutar el Dashboard Cisco Wi-Fi Clientes como un único archivo .html local
 * (file:///) en cualquier PC, con o sin internet, conservando carga/acumulación de CSVs,
 * descarte inteligente de falsos positivos, separación Auth ISE/Red vs Suplicante e IndexedDB.
 */
(function () {
  "use strict";

  const MONTH_NUM_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const MONTH_STR_MAP = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const DNA_TS_RE = /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/;

  function dnaTsToEpochSec(tsStr) {
    if (!tsStr || tsStr === "--") return null;
    const m = DNA_TS_RE.exec(String(tsStr).trim());
    if (!m) return null;
    const mon = MONTH_NUM_MAP[m[1].toLowerCase()];
    if (mon === undefined) return null;
    const dt = new Date(
      parseInt(m[3], 10),
      mon,
      parseInt(m[2], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      parseInt(m[6], 10)
    );
    const ms = dt.getTime();
    return Number.isNaN(ms) ? null : ms / 1000.0;
  }

  function dnaTsGapHours(tsEvent, tsSeen) {
    const e1 = dnaTsToEpochSec(tsEvent);
    const e2 = dnaTsToEpochSec(tsSeen);
    if (e1 === null || e2 === null) return 0.0;
    return (e2 - e1) / 3600.0;
  }

  function roundN(val, decimals) {
    if (!val || Number.isNaN(val)) return 0.0;
    const f = Math.pow(10, decimals);
    return Math.round(val * f) / f;
  }

  function avg(arr) {
    if (!arr || !arr.length) return 0.0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return roundN(s / arr.length, 1);
  }

  function parseFloatVal(val, defVal = null) {
    if (val === null || val === undefined) return defVal;
    if (typeof val === "number") return Number.isFinite(val) ? val : defVal;
    const s = String(val).trim();
    if (!s || s === "--" || s === "NA" || s === "N/A" || s === "null" || s === "None") {
      return defVal;
    }
    const m = s.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    if (!m) return defVal;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : defVal;
  }

  function cleanStr(val, defVal = "--") {
    if (val === null || val === undefined) return defVal;
    const s = String(val).trim();
    if (!s || s === "--" || s === "NA" || s === "N/A" || s === "null" || s === "None") {
      return defVal;
    }
    return s;
  }

  function formatBytes(b) {
    if (b === null || b === undefined || b <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = Number(b);
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024.0;
      i++;
    }
    return `${val.toFixed(2)} ${units[i]}`;
  }

  function inferFloorFromApOrLocation(apName, locationStr = "--") {
    const apUp = String(apName || "").toUpperCase();
    const m = apUp.match(/APDGP(\d{2})/);
    if (m) return `Piso ${parseInt(m[1], 10)}`;
    const m2 = apUp.match(/APDGP(\d)(?!\d)/);
    if (m2) return `Piso ${parseInt(m2[1], 10)}`;
    if (apUp.includes("MEZ")) return "Mezzanine";
    if (apUp.includes("SOT2")) return "Sótano 2";
    if (apUp.includes("SOT1") || apUp.includes("SEGF")) return "Sótano 1 (CGA)";
    if (apUp.includes("AUD")) return "Auditorio";

    if (locationStr && locationStr !== "--" && String(locationStr).includes("/")) {
      const parts = String(locationStr).split("/");
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart && lastPart !== "--") return lastPart;
    }
    return locationStr && locationStr !== "--" ? locationStr : "Piso No Especificado";
  }

  function classifyRetryBucket(ret) {
    const r = ret || 0.0;
    if (r <= 10) return "0-10% (Óptimo)";
    if (r <= 20) return "11-20% (Normal)";
    if (r <= 24) return "21-24% (Elevado)";
    if (r <= 30) return "25-30% (Alto)";
    return "> 30% (Crítico)";
  }

  function classifySessionBucket(sessionMin) {
    const m = sessionMin || 0.0;
    if (m < 15) return "< 15 min (Reciente)";
    if (m < 60) return "15 - 60 min";
    if (m < 180) return "1 - 3 horas";
    if (m < 360) return "3 - 6 horas";
    return "> 6 horas (Larga)";
  }

  function extractDateFromTs(tsStr) {
    if (!tsStr || tsStr === "--") return null;
    const s = String(tsStr);
    const mIso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
    const mEng = s.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
    if (mEng) {
      const mon = MONTH_STR_MAP[mEng[1].toUpperCase()];
      if (mon) {
        const day = String(parseInt(mEng[2], 10)).padStart(2, "0");
        return `${mEng[3]}-${mon}-${day}`;
      }
    }
    return null;
  }

  function extractHourAnd15m(tsStr) {
    if (!tsStr || tsStr === "--") return ["--", "--"];
    const m = String(tsStr).match(/\b(\d{2}):(\d{2}):\d{2}\b/);
    if (m) {
      const hh = String(parseInt(m[1], 10)).padStart(2, "0");
      const mm = parseInt(m[2], 10);
      const q = String(Math.floor(mm / 15) * 15).padStart(2, "0");
      return [`${hh}:00`, `${hh}:${q}`];
    }
    return ["--", "--"];
  }

  function isCorporateHostname(hostname) {
    return String(hostname || "").trim().toUpperCase().startsWith("COL-");
  }

  function isPowersaveLatencyFp(status, osStr, deviceType, hostname, rssi, retries, beLat, voiceLat, health) {
    if (String(status || "").trim().toUpperCase() === "DISCONNECTED") return true;
    const osS = String(osStr || "").toLowerCase();
    const devS = String(deviceType || "").toLowerCase();
    const hostS = String(hostname || "").toLowerCase();
    const keys = ["ios", "iphone", "ipad", "android", "apple-device"];
    const isMobile = keys.some((k) => osS.includes(k) || devS.includes(k) || hostS.includes(k));
    const ret = retries || 0.0;
    if (isMobile && rssi !== null && rssi !== undefined && rssi >= -67 && ret < 20 && (beLat === null || beLat === undefined || beLat <= 150)) {
      return true;
    }
    if (rssi !== null && rssi !== undefined && rssi >= -67 && ret < 15 && (health === null || health === undefined || health >= 8)) {
      return true;
    }
    return false;
  }

  function normalizeDeviceModel(deviceType, vendor, osStr, endpointType) {
    const dt = cleanStr(deviceType, "");
    const osVal = cleanStr(osStr, "");
    const epVal = cleanStr(endpointType, "");
    if (dt && !["UNKNOWN", "NA", "N/A", "NONE", "--"].includes(dt.toUpperCase())) {
      let full = dt.replace(/\s+Type\s+[A-Z0-9]{4}(?:\s+[A-Z0-9]{4})*$/i, "").trim();
      full = full.replace(/^(Lenovo|Dell|HP)-Workstation\s+/i, "$1 ");
      full = full.replace(/^Samsung-Phone\s+/i, "Samsung ");
      full = full.replace(/^Cloud-Network-Technolgy-Device$/i, "Cloud-Network (NIC PC)");
      full = full.replace(/^liteon-device$/i, "Lite-On (NIC PC)");
      full = full.replace(/^Intel-Device$/i, "Intel-Device (NIC PC)");
      full = full
        .replace(/Apple-iPhone/g, "Apple iPhone")
        .replace(/Apple-MacBook/g, "Apple MacBook")
        .replace(/Apple-iPad/g, "Apple iPad")
        .replace(/Apple-Device/g, "Apple Device")
        .replace(/Redmi-Smartphone/g, "Redmi Smartphone");
      full = full.replace(/\bthinkpad\b/gi, "ThinkPad");
      full = full.replace(/\biphone\b/gi, "iPhone");
      full = full.replace(/\bipad\b/gi, "iPad");
      full = full.replace(/\bmacbook\b/gi, "MacBook");
      full = full.replace(/^lenovo\b/i, "Lenovo");
      full = full.replace(/^dell\b/i, "Dell");
      full = full.replace(/^samsung\b/i, "Samsung");

      let short = full;
      short = short.replace(/^Lenovo ThinkPad\s+/i, "ThinkPad ");
      short = short.replace(/^Cloud-Network \(NIC PC\)$/, "Cloud-Net (NIC)");
      short = short.replace(/^Intel-Device \(NIC PC\)$/, "Intel-Device");
      if (short.length > 19) short = short.slice(0, 18).trimEnd() + "…";
      return [full, short];
    }
    const osL = osVal.toLowerCase();
    const epL = epVal.toLowerCase();
    if (osL.includes("windows") || epL.includes("workstation")) {
      return ["PC Windows (Sin Modelo DNA)", "PC Win (s/Modelo)"];
    }
    if (osL.includes("android")) {
      return ["Móvil Android (Sin Modelo DNA)", "Android (s/Modelo)"];
    }
    if (osL.includes("ios") || osL.includes("mac")) {
      return ["Apple iOS/Mac (Sin Modelo DNA)", "Apple (s/Modelo)"];
    }
    if (osL.includes("linux")) {
      return ["Linux / IoT (Sin Modelo DNA)", "Linux (s/Modelo)"];
    }
    return ["Sin Modelo Identificado", "Sin Modelo"];
  }

  function normalizeVendorName(vendor, osStr = "") {
    const v = cleanStr(vendor, "");
    if (!v || ["UNKNOWN", "NA", "N/A", "--"].includes(v.toUpperCase())) {
      const osL = String(osStr || "").toLowerCase();
      if (osL.includes("android")) return ["MAC Aleatoria (Android)", "MAC Rand (And)"];
      if (osL.includes("ios")) return ["MAC Aleatoria (iOS)", "MAC Rand (iOS)"];
      return ["Sin Fabricante (MAC Privada)", "MAC Privada"];
    }
    const vl = v.toLowerCase();
    if (vl.includes("apple")) return ["Apple Inc.", "Apple"];
    if (vl.includes("lenovo")) return ["Lenovo", "Lenovo"];
    if (vl.includes("intel")) return ["Intel Corp. (NIC)", "Intel (NIC)"];
    if (vl.includes("universal global scientific")) return ["USI (NIC Corporativa)", "USI (NIC)"];
    if (vl.includes("cloud network") || vl.includes("hon hai") || vl.includes("foxconn")) return ["Cloud Network / Foxconn", "Cloud Net"];
    if (vl.includes("samsung")) return ["Samsung", "Samsung"];
    if (vl.includes("dell")) return ["Dell Inc.", "Dell"];
    if (vl.startsWith("hp") || vl.includes("hewlett")) return ["HP Inc.", "HP"];
    if (vl.includes("lite-on") || vl.includes("liteon")) return ["Lite-On (NIC)", "Lite-On"];
    if (vl.includes("redmi") || vl.includes("xiaomi")) return ["Xiaomi / Redmi", "Xiaomi/Redmi"];
    if (vl.includes("motorola")) return ["Motorola", "Motorola"];
    if (vl.includes("huawei")) return ["Huawei", "Huawei"];
    if (vl.includes("honor")) return ["Honor", "Honor"];
    if (vl.includes("realtek")) return ["Realtek (NIC)", "Realtek"];
    if (vl.includes("mediatek")) return ["MediaTek (NIC)", "MediaTek"];
    let short = v.split(",")[0].split(" Co.")[0].split(" Inc")[0].split(" Corp")[0].trim();
    if (short.length > 17) short = short.slice(0, 16).trimEnd() + "…";
    return [v, short];
  }

  // Parser RFC 4180 rápido para archivos CSV de Catalyst Center
  function parseCsvToDicts(text) {
    let content = text || "";
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    const rows = [];
    let cur = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < content.length && content[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && i + 1 < content.length && content[i + 1] === "\n") i++;
        row.push(cur);
        cur = "";
        if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
          rows.push(row);
        }
        row = [];
      } else {
        cur += ch;
      }
    }
    if (cur.length > 0 || row.length > 0) {
      row.push(cur);
      if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
        rows.push(row);
      }
    }
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    const out = [];
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const vals = rows[rIdx];
      let hasAny = false;
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        const v = c < vals.length ? vals[c] : "";
        if (v && v.trim() !== "") hasAny = true;
        obj[headers[c]] = v;
      }
      if (hasAny) out.push(obj);
    }
    return out;
  }

  function normalizeRow(raw, idx, excludePsLatency = true) {
    let usageB = parseFloatVal(raw["Usage (B)"], 0.0);
    const txB = parseFloatVal(raw["Tx Data (B)"], 0.0);
    const rxB = parseFloatVal(raw["Rx Data (B)"], 0.0);
    if (usageB === 0.0 && txB + rxB > 0) usageB = txB + rxB;

    let rssi = parseFloatVal(raw["RSSI (dBm)"]);
    let avgRssi = parseFloatVal(raw["Avg RSSI (dBm)"]);
    if (rssi !== null && (rssi >= 0 || rssi <= -120)) rssi = null;
    if (avgRssi !== null && (avgRssi >= 0 || avgRssi <= -120)) avgRssi = null;
    if (rssi === null && avgRssi !== null) rssi = avgRssi;
    else if (avgRssi === null && rssi !== null) avgRssi = rssi;

    let snr = parseFloatVal(raw["SNR (dB)"]);
    let avgSnr = parseFloatVal(raw["Avg SNR (dB)"]);
    if (snr !== null && snr <= 0) snr = null;
    if (avgSnr !== null && avgSnr <= 0) avgSnr = null;
    if (snr === null && avgSnr !== null) snr = avgSnr;
    else if (avgSnr === null && snr !== null) avgSnr = snr;

    const retries = parseFloatVal(raw["Retries (%)"], 0.0);
    const health = parseFloatVal(raw["Health"]);
    const onbHealth = parseFloatVal(raw["Onboarding Health"]);
    const connHealth = parseFloatVal(raw["Connected Health"]);
    const dataRate = parseFloatVal(raw["Data Rate (Mbps)"], 0.0);

    const onbTime = parseFloatVal(raw["Onboarding Time (ms)"]);
    const assocTime = parseFloatVal(raw["Association Time (ms)"]);
    const authTime = parseFloatVal(raw["Authentication Time (ms)"]);
    const dhcpTime = parseFloatVal(raw["DHCP Response Time (ms)"]);
    const roamTime = parseFloatVal(raw["Roaming Time (ms)"]);
    const sessionMs = parseFloatVal(raw["Session Duration (ms)"], 0.0);
    const sessionMin = sessionMs ? roundN(sessionMs / 60000.0, 1) : 0.0;

    const voiceLat = parseFloatVal(raw["Avg Voice Latency"]);
    const videoLat = parseFloatVal(raw["Avg Video Latency"]);
    const beLat = parseFloatVal(raw["Avg Best Effort Latency"]);
    const bgLat = parseFloatVal(raw["Avg Background Latency"]);

    let userId = cleanStr(raw["User ID"]);
    const identifier = cleanStr(raw["Identifier"]);
    if (userId === "--" && identifier !== "--") userId = identifier;

    const apName = cleanStr(raw["AP Name"], "Sin AP");
    const location = cleanStr(raw["Location"]);
    const floor = inferFloorFromApOrLocation(apName, location);

    const bandRaw = cleanStr(raw["Band (GHz)"]);
    const band = bandRaw !== "--" ? (bandRaw.includes("GHz") ? bandRaw : `${bandRaw} GHz`) : "Desconocida";

    let rfQuality = "Sin señal (N/A)";
    if (rssi !== null) {
      if (rssi >= -60) rfQuality = "Excelente (>= -60 dBm)";
      else if (rssi >= -67) rfQuality = "Buena (-61 a -67 dBm)";
      else if (rssi >= -79) rfQuality = "Regular (-68 a -79 dBm)";
      else rfQuality = "Crítica (< -79 dBm / Sticky)";
    }

    const lastOnbStr = cleanStr(raw["Last Onboarded"]);
    const lastAssocStr = cleanStr(raw["Last Associated"]);
    const lastSeenStr = cleanStr(raw["Last Seen"]);
    const tsRef = lastOnbStr !== "--" ? lastOnbStr : lastAssocStr !== "--" ? lastAssocStr : lastSeenStr;
    const [hourSlot, slot15m] = extractHourAnd15m(tsRef);
    const sessionBucket = classifySessionBucket(sessionMin);
    const retryBucket = classifyRetryBucket(retries);

    const issues = [];
    const issueCategories = [];
    const alarmTags = [];
    const status = cleanStr(raw["Connection Status"], "UNKNOWN");

    if (retries !== null && retries >= 25) {
      issues.push(`Retransmisiones críticas (${Math.trunc(retries)}%)`);
      issueCategories.push("Retransmisiones Altas (>=25%)");
      alarmTags.push("Retries >= 25%");
    } else if (retries !== null && retries >= 20) {
      alarmTags.push("Retries Elevados (20-24%)");
    }

    if (authTime !== null && authTime >= 6000) {
      issues.push(`Auth ISE/Red (${(authTime / 1000).toFixed(1)}s)`);
      alarmTags.push("Auth ISE/Red >= 6s");
      issueCategories.push("Auth 802.1X: Red / ISE (>=6s)");
    }

    const onbNetMs = onbTime !== null ? roundN(Math.max(0.0, onbTime - (authTime || 0.0)), 1) : null;
    if (assocTime !== null && assocTime > 2000) {
      issues.push(`Asociación lenta (${Math.trunc(assocTime)} ms)`);
      alarmTags.push("Asociación > 2s");
      issueCategories.push("Asociación Lenta (>2s)");
    }
    if (dhcpTime !== null && dhcpTime > 2000) {
      issues.push(`DHCP lento (${Math.trunc(dhcpTime)} ms / ${(dhcpTime / 1000).toFixed(1)}s)`);
      alarmTags.push("DHCP > 2s");
      issueCategories.push("DHCP Lento (>2s)");
    }
    if (roamTime !== null && roamTime > 3000) {
      issues.push(`Roaming lento (${Math.trunc(roamTime)} ms / ${(roamTime / 1000).toFixed(1)}s)`);
      alarmTags.push("Roaming > 3s");
      issueCategories.push("Roaming Lento (>3s)");
    }

    const hostnameVal = cleanStr(raw["Hostname"]);
    const devTypeVal = cleanStr(raw["Device Type"]);
    const osVal = cleanStr(raw["OS"]);
    const hasRawLat =
      (voiceLat !== null && voiceLat > 100) ||
      (beLat !== null && beLat > 150) ||
      (videoLat !== null && videoLat > 100);
    const isPsFp = Boolean(
      hasRawLat &&
        isPowersaveLatencyFp(status, osVal, devTypeVal, hostnameVal, rssi, retries, beLat, voiceLat, health)
    );
    if (hasRawLat && !(excludePsLatency && isPsFp)) {
      if (voiceLat !== null && voiceLat > 100) {
        issues.push(`Latencia Voz alta (${Math.trunc(voiceLat)} ms)`);
        alarmTags.push("Latencia Voz > 100ms");
      }
      if (beLat !== null && beLat > 150) {
        issues.push(`Latencia Datos alta (${Math.trunc(beLat)} ms)`);
        alarmTags.push("Latencia Datos > 150ms");
      }
      if (videoLat !== null && videoLat > 100) {
        issues.push(`Latencia Video alta (${Math.trunc(videoLat)} ms)`);
        alarmTags.push("Latencia Video > 100ms");
      }
      issueCategories.push("Latencia QoS Alta (Voz/Datos)");
    }

    if (rssi !== null && rssi < -79) {
      issues.push(`Señal débil (${Math.trunc(rssi)} dBm)`);
      alarmTags.push("RSSI Débil (< -79 dBm)");
      issueCategories.push("Señal RF Débil / Sticky");
    }
    if (dataRate && dataRate > 0 && dataRate < 72) alarmTags.push("Data Rate Bajo (< 72 Mbps)");
    const rssiDelta = rssi !== null && avgRssi !== null ? roundN(Math.abs(rssi - avgRssi), 1) : 0.0;
    if (rssiDelta >= 6) alarmTags.push("Fluctuación RF (>= 6 dB)");

    const concurrentCombo =
      issueCategories.length >= 2
        ? [...issueCategories].sort().join(" + ")
        : issueCategories.length === 1
        ? issueCategories[0]
        : "Sin Alertas Críticas";
    const tagCombo =
      alarmTags.length >= 2
        ? alarmTags.slice(0, 3).join(" + ")
        : alarmTags.length === 1
        ? alarmTags[0]
        : "Sin Tags";

    const isCorp = isCorporateHostname(hostnameVal);
    const rawVendor = cleanStr(raw["Hardware Manufacturer"]);
    const epTypeVal = cleanStr(raw["Endpoint Type"]);
    const [devModelFull, devModelShort] = normalizeDeviceModel(devTypeVal, rawVendor, osVal, epTypeVal);
    const [vendFull, vendShort] = normalizeVendorName(rawVendor, osVal);

    return {
      id: idx,
      identifier,
      hostname: hostnameVal,
      is_corporate: isCorp,
      is_ps_latency_fp: isPsFp,
      corp_category: isCorp ? "Corporativo (COL-)" : "Externo",
      user_id: userId,
      mac: cleanStr(raw["MAC Address"]),
      ipv4: cleanStr(raw["IPv4 Address"]),
      ipv6: cleanStr(raw["IPv6 Address"]),
      device_type: devTypeVal,
      device_model: devModelFull,
      device_model_short: devModelShort,
      vendor: rawVendor,
      vendor_clean: vendFull,
      vendor_short: vendShort,
      os: osVal,
      endpoint_type: epTypeVal,
      health,
      trust_score: cleanStr(raw["Trust Score"]),
      tracked: cleanStr(raw["Tracked"]),
      onboarding_health: onbHealth,
      connected_health: connHealth,
      usage_b: usageB,
      usage_mb: roundN(usageB / (1024.0 * 1024.0), 2),
      usage_fmt: formatBytes(usageB),
      tx_b: txB,
      tx_mb: roundN(txB / (1024.0 * 1024.0), 2),
      tx_fmt: formatBytes(txB),
      rx_b: rxB,
      rx_mb: roundN(rxB / (1024.0 * 1024.0), 2),
      rx_fmt: formatBytes(rxB),
      ap_name: apName,
      ap_mode: cleanStr(raw["AP Mode"]),
      ap_ip: cleanStr(raw["AP IP Address"]),
      ap_mac: cleanStr(raw["AP Base Radio MAC"]),
      ap_group: cleanStr(raw["AP Group"]),
      wlc_name: cleanStr(raw["WLC Name"]),
      status,
      band,
      rssi,
      avg_rssi: avgRssi,
      rssi_delta: rssiDelta,
      snr,
      avg_snr: avgSnr,
      rf_quality: rfQuality,
      location,
      floor,
      last_seen: lastSeenStr,
      last_onboarded: lastOnbStr,
      last_associated: lastAssocStr,
      last_auth_time: cleanStr(raw["Last Auth Time"]),
      last_dhcp_request: cleanStr(raw["Last DHCP Request"]),
      hour_slot: hourSlot,
      slot_15m: slot15m,
      session_bucket: sessionBucket,
      retry_bucket: retryBucket,
      ssid: cleanStr(raw["SSID"]),
      auth_type: cleanStr(raw["Auth Type"]),
      vlan: cleanStr(raw["VLAN ID"]),
      vnid: cleanStr(raw["VNID"]),
      bridge_vnet: cleanStr(raw["Bridge-Network Virtual Network"]),
      auth_server: cleanStr(raw["Authentication Server"]),
      dhcp_server: cleanStr(raw["DHCP Server"]),
      onboarding_ms: onbTime,
      onb_net_ms: onbNetMs,
      assoc_ms: assocTime,
      auth_ms: authTime,
      dhcp_ms: dhcpTime,
      roam_ms: roamTime,
      session_ms: sessionMs,
      session_min: sessionMin,
      data_rate: dataRate,
      protocol: cleanStr(raw["Association"]),
      capability: cleanStr(raw["Capability"]),
      retries,
      voice_lat: voiceLat,
      video_lat: videoLat,
      be_lat: beLat,
      bg_lat: bgLat,
      issues,
      issue_categories: issueCategories,
      issue_count: issues.length,
      alarm_tags: alarmTags,
      alarm_tags_count: alarmTags.length,
      concurrent_combo: concurrentCombo,
      tag_combo: tagCombo,
    };
  }

  function recomputeRowIssues(r, excludePsLatency = true) {
    const issues = [];
    const issueCategories = [];
    const alarmTags = [];

    const retries = r.retries;
    const authTime = r.auth_ms;
    const onbTime = r.onboarding_ms;
    const dhcpTime = r.dhcp_ms;
    const roamTime = r.roam_ms;
    const voiceLat = r.voice_lat;
    const beLat = r.be_lat;
    const videoLat = r.video_lat;

    let rssi = r.rssi;
    let avgRssi = r.avg_rssi;
    if (rssi !== null && rssi !== undefined && (rssi >= 0 || rssi <= -120)) rssi = null;
    if (avgRssi !== null && avgRssi !== undefined && (avgRssi >= 0 || avgRssi <= -120)) avgRssi = null;
    if (rssi === null && avgRssi !== null) rssi = avgRssi;
    else if (avgRssi === null && rssi !== null) avgRssi = rssi;
    r.rssi = rssi ?? null;
    r.avg_rssi = avgRssi ?? null;

    let snr = r.snr;
    let avgSnr = r.avg_snr;
    if (snr !== null && snr !== undefined && snr <= 0) snr = null;
    if (avgSnr !== null && avgSnr !== undefined && avgSnr <= 0) avgSnr = null;
    if (snr === null && avgSnr !== null) snr = avgSnr;
    else if (avgSnr === null && snr !== null) avgSnr = snr;
    r.snr = snr ?? null;
    r.avg_snr = avgSnr ?? null;

    if (r.rssi === null) r.rf_quality = "Sin señal (N/A)";
    else if (r.rssi >= -60) r.rf_quality = "Excelente (>= -60 dBm)";
    else if (r.rssi >= -67) r.rf_quality = "Buena (-61 a -67 dBm)";
    else if (r.rssi >= -79) r.rf_quality = "Regular (-68 a -79 dBm)";
    else r.rf_quality = "Crítica (< -79 dBm / Sticky)";

    const dataRate = r.data_rate || 0.0;
    const rssiDelta = r.rssi !== null && r.avg_rssi !== null ? roundN(Math.abs(r.rssi - r.avg_rssi), 1) : 0.0;
    r.rssi_delta = rssiDelta;

    if (retries !== null && retries !== undefined && retries >= 25) {
      issues.push(`Retransmisiones críticas (${Math.trunc(retries)}%)`);
      issueCategories.push("Retransmisiones Altas (>=25%)");
      alarmTags.push("Retries >= 25%");
    } else if (retries !== null && retries !== undefined && retries >= 20) {
      alarmTags.push("Retries Elevados (20-24%)");
    }

    if (authTime !== null && authTime !== undefined && authTime >= 6000) {
      issues.push(`Auth ISE/Red (${(authTime / 1000).toFixed(1)}s)`);
      alarmTags.push("Auth ISE/Red >= 6s");
      issueCategories.push("Auth 802.1X: Red / ISE (>=6s)");
    }

    const assocTime = r.assoc_ms;
    r.onb_net_ms = onbTime !== null && onbTime !== undefined ? roundN(Math.max(0.0, onbTime - (authTime || 0.0)), 1) : null;
    if (assocTime !== null && assocTime !== undefined && assocTime > 2000) {
      issues.push(`Asociación lenta (${Math.trunc(assocTime)} ms)`);
      alarmTags.push("Asociación > 2s");
      issueCategories.push("Asociación Lenta (>2s)");
    }
    if (dhcpTime !== null && dhcpTime !== undefined && dhcpTime > 2000) {
      issues.push(`DHCP lento (${Math.trunc(dhcpTime)} ms / ${(dhcpTime / 1000).toFixed(1)}s)`);
      alarmTags.push("DHCP > 2s");
      issueCategories.push("DHCP Lento (>2s)");
    }
    if (roamTime !== null && roamTime !== undefined && roamTime > 3000) {
      issues.push(`Roaming lento (${Math.trunc(roamTime)} ms / ${(roamTime / 1000).toFixed(1)}s)`);
      alarmTags.push("Roaming > 3s");
      issueCategories.push("Roaming Lento (>3s)");
    }

    const hasRawLat =
      (voiceLat !== null && voiceLat !== undefined && voiceLat > 100) ||
      (beLat !== null && beLat !== undefined && beLat > 150) ||
      (videoLat !== null && videoLat !== undefined && videoLat > 100);
    const isPsFp = Boolean(
      hasRawLat &&
        isPowersaveLatencyFp(r.status, r.os, r.device_type, r.hostname, r.rssi, retries, beLat, voiceLat, r.health)
    );
    r.is_ps_latency_fp = isPsFp;
    if (hasRawLat && !(excludePsLatency && isPsFp)) {
      if (voiceLat !== null && voiceLat !== undefined && voiceLat > 100) {
        issues.push(`Latencia Voz alta (${Math.trunc(voiceLat)} ms)`);
        alarmTags.push("Latencia Voz > 100ms");
      }
      if (beLat !== null && beLat !== undefined && beLat > 150) {
        issues.push(`Latencia Datos alta (${Math.trunc(beLat)} ms)`);
        alarmTags.push("Latencia Datos > 150ms");
      }
      if (videoLat !== null && videoLat !== undefined && videoLat > 100) {
        issues.push(`Latencia Video alta (${Math.trunc(videoLat)} ms)`);
        alarmTags.push("Latencia Video > 100ms");
      }
      issueCategories.push("Latencia QoS Alta (Voz/Datos)");
    }

    if (r.rssi !== null && r.rssi < -79) {
      issues.push(`Señal débil (${Math.trunc(r.rssi)} dBm)`);
      alarmTags.push("RSSI Débil (< -79 dBm)");
      issueCategories.push("Señal RF Débil / Sticky");
    }
    if (dataRate > 0 && dataRate < 72) alarmTags.push("Data Rate Bajo (< 72 Mbps)");
    if (rssiDelta >= 6) alarmTags.push("Fluctuación RF (>= 6 dB)");

    r.is_corporate = isCorporateHostname(r.hostname);
    r.corp_category = r.is_corporate ? "Corporativo (COL-)" : "Externo";
    const [dmFull, dmShort] = normalizeDeviceModel(r.device_type, r.vendor, r.os, r.endpoint_type);
    const [vnFull, vnShort] = normalizeVendorName(r.vendor, r.os);
    r.device_model = dmFull;
    r.device_model_short = dmShort;
    r.vendor_clean = vnFull;
    r.vendor_short = vnShort;

    r.issues = issues;
    r.issue_categories = issueCategories;
    r.issue_count = issues.length;
    r.alarm_tags = alarmTags;
    r.alarm_tags_count = alarmTags.length;
    r.concurrent_combo =
      issueCategories.length >= 2
        ? [...issueCategories].sort().join(" + ")
        : issueCategories.length === 1
        ? issueCategories[0]
        : "Sin Alertas Críticas";
    r.tag_combo =
      alarmTags.length >= 2
        ? alarmTags.slice(0, 3).join(" + ")
        : alarmTags.length === 1
        ? alarmTags[0]
        : "Sin Tags";
    return r;
  }

  function applyOnboardingFpAndAuthSplit(rows, excludeFp = true) {
    const seenRetryEvts = new Set();
    const seenAuthEvts = new Set();
    const seenDhcpEvts = new Set();
    const seenRoamEvts = new Set();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const isDisc = String(r.status || "").trim().toUpperCase() === "DISCONNECTED";
      const mac = String(r.mac || "").trim();
      const lastSeen = r.last_seen || "--";
      const rssi = r.rssi;
      const ret = r.retries;
      const retVal = ret || 0.0;
      const goodRf = rssi !== null && rssi !== undefined && rssi >= -67 && retVal < 20;

      if (ret !== null && ret !== undefined && ret >= 25) {
        const usageB = r.usage_b || 0;
        const rtKey = `${mac}|${lastSeen}|${ret}|${usageB}`;
        const isDupRt = seenRetryEvts.has(rtKey);
        seenRetryEvts.add(rtKey);
        const isMicroTraffic = Boolean(usageB < 262144 && rssi !== null && rssi !== undefined && rssi >= -67);
        const osL = String(r.os || "").toLowerCase();
        const dr = r.data_rate || 0.0;
        const isMobPsNull = Boolean(
          (osL.includes("android") || osL.includes("ios") || osL.includes("iphone") || osL.includes("ipad")) &&
            ret >= 80 &&
            rssi !== null &&
            rssi !== undefined &&
            rssi >= -55 &&
            dr >= 130
        );
        r.is_retry_fp = Boolean(isDisc || isDupRt || isMicroTraffic || isMobPsNull);
      } else {
        r.is_retry_fp = false;
      }

      const authMs = r.auth_ms;
      if (authMs !== null && authMs !== undefined && authMs >= 6000) {
        const lastOnb = r.last_onboarded || "--";
        const aKey = `${mac}|${lastOnb}|${authMs}`;
        const isDupA = lastOnb !== "--" && seenAuthEvts.has(aKey);
        if (lastOnb !== "--") seenAuthEvts.add(aKey);
        const isStaleA = dnaTsGapHours(lastOnb, lastSeen) > 12.0;
        r.is_auth_fp = Boolean(isDisc || isDupA || isStaleA);
      } else {
        r.is_auth_fp = false;
      }

      const dhcpMs = r.dhcp_ms;
      if (dhcpMs !== null && dhcpMs !== undefined && dhcpMs > 2000) {
        const lastDhcp = r.last_dhcp_request || "--";
        const dKey = `${mac}|${lastDhcp}|${dhcpMs}`;
        const isDupD = lastDhcp !== "--" && seenDhcpEvts.has(dKey);
        if (lastDhcp !== "--") seenDhcpEvts.add(dKey);
        const isStaleD = dnaTsGapHours(lastDhcp, lastSeen) > 12.0;
        const isBackoff = Boolean(goodRf && r.onboarding_health === 4 && dhcpMs <= 5000);
        r.is_dhcp_fp = Boolean(isDisc || isDupD || isStaleD || isBackoff);
      } else {
        r.is_dhcp_fp = false;
      }

      const roamMs = r.roam_ms;
      if (roamMs !== null && roamMs !== undefined && roamMs > 3000) {
        const lastAssoc = r.last_associated || "--";
        const lastOnb = r.last_onboarded || "--";
        const rmKey = `${mac}|${lastAssoc}|${roamMs}`;
        const isDupRm = seenRoamEvts.has(rmKey);
        seenRoamEvts.add(rmKey);
        const isStaleRm =
          dnaTsGapHours(lastAssoc, lastSeen) > 12.0 || dnaTsGapHours(lastOnb, lastSeen) > 12.0;
        const onbDestSum = (r.assoc_ms || 0.0) + (authMs || 0.0) + (dhcpMs || 0.0);
        const isLidWalk = Boolean(
          roamMs > 10000 && onbDestSum > 0 && onbDestSum < 4000 && goodRf && r.onboarding_health === 4
        );
        r.is_roam_fp = Boolean(isDisc || isDupRm || isStaleRm || isLidWalk);
      } else {
        r.is_roam_fp = false;
      }
    }

    const apAuthCnt = new Map();
    const slotIseCnt = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if ((r.auth_ms || 0) >= 6000 && !r.is_auth_fp) {
        const dl = r.day_label || "";
        const ak = `${dl}||${r.ap_name || ""}`;
        apAuthCnt.set(ak, (apAuthCnt.get(ak) || 0) + 1);
        const sl = r.slot_15m || "--";
        const srv = r.auth_server || "--";
        if (sl !== "--" && srv !== "--") {
          const sk = `${dl}||${sl}||${srv}`;
          slotIseCnt.set(sk, (slotIseCnt.get(sk) || 0) + 1);
        }
      }
    }

    const AUTH_CATS = new Set([
      "Autenticación 802.1X Lenta (>=6s)",
      "Auth 802.1X: Red / ISE (>=6s)",
      "Auth 802.1X: Espera Suplicante (>=6s)",
    ]);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const baseIssues = (r.issues || []).filter(
        (iss) =>
          !iss.startsWith("Retransmisiones ") &&
          !iss.startsWith("Auth ") &&
          !iss.startsWith("Espera Suplicante") &&
          !iss.startsWith("DHCP lento") &&
          !iss.startsWith("Roaming lento")
      );
      const baseCats = (r.issue_categories || []).filter(
        (cat) =>
          !AUTH_CATS.has(cat) &&
          cat !== "Retransmisiones Altas (>=25%)" &&
          cat !== "DHCP Lento (>2s)" &&
          cat !== "Roaming Lento (>3s)"
      );
      const baseTags = (r.alarm_tags || []).filter(
        (tg) =>
          !tg.startsWith("Auth ") &&
          tg !== "Retries >= 25%" &&
          tg !== "DHCP > 2s" &&
          tg !== "Roaming > 3s"
      );

      const retV = r.retries;
      if (retV !== null && retV !== undefined && retV >= 25 && !(excludeFp && r.is_retry_fp)) {
        baseIssues.push(`Retransmisiones críticas (${Math.trunc(retV)}%)`);
        baseCats.push("Retransmisiones Altas (>=25%)");
        baseTags.push("Retries >= 25%");
      }

      const authMs = r.auth_ms;
      if (authMs !== null && authMs !== undefined && authMs >= 6000 && !(excludeFp && r.is_auth_fp)) {
        const dl = r.day_label || "";
        const sl = r.slot_15m || "--";
        const srv = r.auth_server || "--";
        const slotBurst = sl !== "--" && srv !== "--" && (slotIseCnt.get(`${dl}||${sl}||${srv}`) || 0) >= 5;
        const apCluster = (apAuthCnt.get(`${dl}||${r.ap_name || ""}`) || 0) >= 3;
        const onbH = r.onboarding_health;
        const lowOnb = onbH !== null && onbH !== undefined && onbH < 4;
        const rssi = r.rssi;
        const ret = r.retries || 0.0;
        const badRf = rssi === null || rssi === undefined || rssi < -67 || ret >= 20;

        if (slotBurst || apCluster || lowOnb || badRf) {
          const reason = slotBurst
            ? "ráfaga ISE"
            : apCluster
            ? "ráfaga AP"
            : lowOnb
            ? `Onb Health ${Math.trunc(onbH)}`
            : "pérdida RF";
          baseIssues.push(`Auth ISE/Red (${(authMs / 1000).toFixed(1)}s • ${reason})`);
          baseCats.push("Auth 802.1X: Red / ISE (>=6s)");
          baseTags.push("Auth ISE/Red >= 6s");
          r.auth_delay_origin = "ISE_NET";
        } else {
          baseIssues.push(`Espera Suplicante (${(authMs / 1000).toFixed(1)}s • cliente)`);
          baseCats.push("Auth 802.1X: Espera Suplicante (>=6s)");
          baseTags.push("Auth Suplicante >= 6s");
          r.auth_delay_origin = "SUPPLICANT";
        }
      } else {
        r.auth_delay_origin = "NONE";
      }

      const dhcpMs = r.dhcp_ms;
      if (dhcpMs !== null && dhcpMs !== undefined && dhcpMs > 2000 && !(excludeFp && r.is_dhcp_fp)) {
        baseIssues.push(`DHCP lento (${Math.trunc(dhcpMs)} ms / ${(dhcpMs / 1000).toFixed(1)}s)`);
        baseCats.push("DHCP Lento (>2s)");
        baseTags.push("DHCP > 2s");
      }

      const roamMs = r.roam_ms;
      if (roamMs !== null && roamMs !== undefined && roamMs > 3000 && !(excludeFp && r.is_roam_fp)) {
        baseIssues.push(`Roaming lento (${Math.trunc(roamMs)} ms / ${(roamMs / 1000).toFixed(1)}s)`);
        baseCats.push("Roaming Lento (>3s)");
        baseTags.push("Roaming > 3s");
      }

      r.is_any_fp = Boolean(
        r.is_ps_latency_fp || r.is_retry_fp || r.is_auth_fp || r.is_dhcp_fp || r.is_roam_fp
      );
      r.issues = baseIssues;
      r.issue_categories = baseCats;
      r.issue_count = baseIssues.length;
      r.alarm_tags = baseTags;
      r.alarm_tags_count = baseTags.length;
      r.concurrent_combo =
        baseCats.length >= 2
          ? [...baseCats].sort().join(" + ")
          : baseCats.length === 1
          ? baseCats[0]
          : "Sin Alertas Críticas";
      r.tag_combo =
        baseTags.length >= 2
          ? baseTags.slice(0, 3).join(" + ")
          : baseTags.length === 1
          ? baseTags[0]
          : "Sin Tags";
    }
    return rows;
  }

  function parseCsvContent(textContent, sourceFile = "datos_clientes_cisco.csv", dayLabel = null, startId = 1, excludePsLatency = true) {
    const rawList = parseCsvToDicts(textContent);
    const rows = [];
    let currId = startId;
    const explicitDay = dayLabel && String(dayLabel).trim() ? String(dayLabel).trim() : null;
    for (let i = 0; i < rawList.length; i++) {
      const r = normalizeRow(rawList[i], currId, excludePsLatency);
      r.source_file = sourceFile;
      const autoDt =
        extractDateFromTs(r.last_seen) ||
        extractDateFromTs(r.last_onboarded) ||
        extractDateFromTs(r.last_associated);
      r.auto_date = autoDt || "Sin Fecha";
      r.day_label = explicitDay || autoDt || sourceFile;
      rows.push(r);
      currId++;
    }
    applyOnboardingFpAndAuthSplit(rows, excludePsLatency);
    return rows;
  }

  function uidKey(c) {
    const uid = c.user_id;
    if (uid && uid !== "--") return uid;
    const mac = c.mac;
    if (mac && mac !== "--") return `mac:${mac}`;
    return `row:${c.id}`;
  }

  function summarizeDayGroup(label, dRows) {
    const dTotal = dRows.length;
    let dIssues = 0;
    const dRets = [], dRssi = [], dAuth = [], dAssoc = [], dOnb = [], dDhcp = [], dRoam = [], dVoice = [], dBe = [];
    let dUsage = 0, dTx = 0, dRx = 0;
    let dHighRet = 0, dMultiAlarm = 0, dSlowAuth = 0, dSuppAuth = 0, dSlowAssoc = 0, dSlowDhcp = 0, dSlowRoam = 0, dHighLat = 0, dWeakRf = 0;

    const dFloorCounts = new Map();
    const dApCounts = new Map();
    const dBusyApCounts = new Map();
    const dBusyApUsers = new Map();
    const dBusyFloorCounts = new Map();
    const srcFilesSet = new Set();
    const uUsersSet = new Set();
    const corpUsersSet = new Set();
    const extUsersSet = new Set();
    let corpClientsCnt = 0;
    let extClientsCnt = 0;

    for (let i = 0; i < dRows.length; i++) {
      const c = dRows[i];
      if (c.source_file) srcFilesSet.add(c.source_file);
      if (c.issue_count > 0) dIssues++;
      if (c.retries !== null && c.retries !== undefined && c.retries > 0) dRets.push(c.retries);
      if (c.rssi !== null && c.rssi !== undefined) dRssi.push(c.rssi);
      if (c.auth_ms !== null && c.auth_ms !== undefined) dAuth.push(c.auth_ms);
      if (c.assoc_ms !== null && c.assoc_ms !== undefined) dAssoc.push(c.assoc_ms);
      if (c.onb_net_ms !== null && c.onb_net_ms !== undefined) dOnb.push(c.onb_net_ms);
      if (c.dhcp_ms !== null && c.dhcp_ms !== undefined) dDhcp.push(c.dhcp_ms);
      if (c.roam_ms !== null && c.roam_ms !== undefined) dRoam.push(c.roam_ms);
      if (c.voice_lat !== null && c.voice_lat !== undefined) dVoice.push(c.voice_lat);
      if (c.be_lat !== null && c.be_lat !== undefined) dBe.push(c.be_lat);
      dUsage += c.usage_b || 0;
      dTx += c.tx_b || 0;
      dRx += c.rx_b || 0;

      const cats = c.issue_categories || [];
      if (cats.includes("Retransmisiones Altas (>=25%)")) dHighRet++;
      if ((c.alarm_tags_count || 0) >= 2) dMultiAlarm++;
      if (cats.includes("Auth 802.1X: Red / ISE (>=6s)")) dSlowAuth++;
      if (cats.includes("Auth 802.1X: Espera Suplicante (>=6s)")) dSuppAuth++;
      if (cats.includes("Asociación Lenta (>2s)")) dSlowAssoc++;
      if (cats.includes("DHCP Lento (>2s)")) dSlowDhcp++;
      if (cats.includes("Roaming Lento (>3s)")) dSlowRoam++;
      if (cats.includes("Latencia QoS Alta (Voz/Datos)")) dHighLat++;
      if (cats.includes("Señal RF Débil / Sticky")) dWeakRf++;

      if (c.ap_name !== "Sin AP") {
        dBusyApCounts.set(c.ap_name, (dBusyApCounts.get(c.ap_name) || 0) + 1);
        if (c.user_id !== "--") {
          if (!dBusyApUsers.has(c.ap_name)) dBusyApUsers.set(c.ap_name, new Set());
          dBusyApUsers.get(c.ap_name).add(c.user_id);
        }
      }
      if (c.floor !== "--") dBusyFloorCounts.set(c.floor, (dBusyFloorCounts.get(c.floor) || 0) + 1);
      if (c.issue_count > 0) {
        dFloorCounts.set(c.floor, (dFloorCounts.get(c.floor) || 0) + 1);
        dApCounts.set(c.ap_name, (dApCounts.get(c.ap_name) || 0) + 1);
      }
      if (c.user_id !== "--") uUsersSet.add(c.user_id);
      if (isCorporateHostname(c.hostname)) {
        corpClientsCnt++;
        if (c.user_id !== "--") corpUsersSet.add(c.user_id);
      } else {
        extClientsCnt++;
        if (c.user_id !== "--") extUsersSet.add(c.user_id);
      }
    }

    const maxKey = (mp) => {
      let bestK = "--", bestV = -1;
      for (const [k, v] of mp.entries()) {
        if (v > bestV) { bestV = v; bestK = k; }
      }
      return bestK;
    };

    const topF = maxKey(dFloorCounts);
    const topA = maxKey(dApCounts);
    const busiestApName = maxKey(dBusyApCounts);
    const busiestApSes = busiestApName !== "--" ? dBusyApCounts.get(busiestApName) || 0 : 0;
    const busiestApUsr = busiestApName !== "--" && dBusyApUsers.has(busiestApName) ? dBusyApUsers.get(busiestApName).size : 0;
    const busiestFloorName = maxKey(dBusyFloorCounts);
    const busiestFloorSes = busiestFloorName !== "--" ? dBusyFloorCounts.get(busiestFloorName) || 0 : 0;
    const dHealthy = dTotal - dIssues;
    const dFailPct = dTotal ? roundN((dIssues / dTotal) * 100.0, 1) : 0.0;

    return {
      day_label: label,
      source_files: Array.from(srcFilesSet).sort(),
      total_clients: dTotal,
      unique_users: uUsersSet.size,
      corp_clients: corpClientsCnt,
      corp_users: corpUsersSet.size,
      ext_clients: extClientsCnt,
      ext_users: extUsersSet.size,
      healthy_clients: dHealthy,
      issue_clients: dIssues,
      failure_rate_pct: dFailPct,
      avg_retries: avg(dRets),
      high_retry_clients: dHighRet,
      high_retry_pct: dTotal ? roundN((dHighRet / dTotal) * 100.0, 1) : 0.0,
      avg_rssi: avg(dRssi),
      avg_auth_ms: avg(dAuth),
      avg_assoc_ms: avg(dAssoc),
      avg_dhcp_ms: avg(dDhcp),
      avg_roam_ms: avg(dRoam),
      avg_onboarding_ms: avg(dOnb),
      slow_auth_clients: dSlowAuth,
      supplicant_auth_clients: dSuppAuth,
      fail_retries: dHighRet,
      fail_auth: dSlowAuth,
      fail_auth_supp: dSuppAuth,
      fail_assoc: dSlowAssoc,
      fail_dhcp: dSlowDhcp,
      fail_roam: dSlowRoam,
      fail_latency: dHighLat,
      fail_rf: dWeakRf,
      avg_voice_lat: avg(dVoice),
      avg_be_lat: avg(dBe),
      multi_alarm_clients: dMultiAlarm,
      usage_b: dUsage,
      usage_mb: roundN(dUsage / (1024.0 * 1024.0), 2),
      usage_fmt: formatBytes(dUsage),
      tx_mb: roundN(dTx / (1024.0 * 1024.0), 2),
      tx_fmt: formatBytes(dTx),
      rx_mb: roundN(dRx / (1024.0 * 1024.0), 2),
      rx_fmt: formatBytes(dRx),
      busiest_ap: busiestApName,
      busiest_ap_clients: busiestApSes,
      busiest_ap_users: busiestApUsr,
      busiest_floor: busiestFloorName,
      busiest_floor_clients: busiestFloorSes,
      worst_floor: topF,
      worst_ap: topA,
    };
  }

  function computeDailyComparison(rows) {
    const dayGroups = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dl = r.day_label || r.auto_date || "Día 1";
      if (!dayGroups.has(dl)) dayGroups.set(dl, []);
      dayGroups.get(dl).push(r);
    }
    const sortedKeys = Array.from(dayGroups.keys()).sort();
    const daysList = sortedKeys.map((dl) => summarizeDayGroup(dl, dayGroups.get(dl)));
    const totalSummary = summarizeDayGroup("TOTAL ACUMULADO", rows);
    totalSummary.days_count = daysList.length;

    let dayDeltas = null;
    if (daysList.length >= 2) {
      const firstD = daysList[0];
      const lastD = daysList[daysList.length - 1];
      dayDeltas = {
        first_day: firstD.day_label,
        last_day: lastD.day_label,
        delta_failure_pct: roundN(lastD.failure_rate_pct - firstD.failure_rate_pct, 1),
        delta_retries: roundN(lastD.avg_retries - firstD.avg_retries, 1),
        delta_high_retry_pct: roundN(lastD.high_retry_pct - firstD.high_retry_pct, 1),
        delta_auth_ms: roundN(lastD.avg_auth_ms - firstD.avg_auth_ms, 1),
        delta_onboarding_ms: roundN(lastD.avg_onboarding_ms - firstD.avg_onboarding_ms, 1),
      };
    }
    return {
      days: daysList,
      total_summary: totalSummary,
      deltas: dayDeltas,
    };
  }

  function computeAnalytics(rows, includeDaily = true) {
    const total = rows.length;
    if (total === 0) return { total_records: 0 };

    const connected = [], notConnected = [];
    const healthVals = [], rssiVals = [], snrVals = [], retryVals = [], rateVals = [];
    const onbVals = [], assocVals = [], authVals = [], dhcpVals = [], roamVals = [], voiceVals = [], beVals = [];
    let totalUsage = 0, totalTx = 0, totalRx = 0;

    const stickyClients = [], highRetryClients = [], lowHealthClients = [], slowOnbClients = [], highLatClients = [], clientsWithAnyIssue = [];
    const uniqueAps = new Set(), uniqueFloors = new Set(), uniqueUsers = new Set(), issueUniqueUsers = new Set();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === "CONNECTED") connected.push(r);
      else notConnected.push(r);

      if (r.health !== null && r.health !== undefined) healthVals.push(r.health);
      if (r.rssi !== null && r.rssi !== undefined) rssiVals.push(r.rssi);
      if (r.snr !== null && r.snr !== undefined) snrVals.push(r.snr);
      if (r.retries !== null && r.retries !== undefined && r.retries > 0) retryVals.push(r.retries);
      if (r.data_rate && r.data_rate > 0) rateVals.push(r.data_rate);
      if (r.onb_net_ms !== null && r.onb_net_ms !== undefined) onbVals.push(r.onb_net_ms);
      if (r.assoc_ms !== null && r.assoc_ms !== undefined) assocVals.push(r.assoc_ms);
      if (r.auth_ms !== null && r.auth_ms !== undefined) authVals.push(r.auth_ms);
      if (r.dhcp_ms !== null && r.dhcp_ms !== undefined) dhcpVals.push(r.dhcp_ms);
      if (r.roam_ms !== null && r.roam_ms !== undefined) roamVals.push(r.roam_ms);
      if (r.voice_lat !== null && r.voice_lat !== undefined) voiceVals.push(r.voice_lat);
      if (r.be_lat !== null && r.be_lat !== undefined) beVals.push(r.be_lat);

      totalUsage += r.usage_b || 0;
      totalTx += r.tx_b || 0;
      totalRx += r.rx_b || 0;

      const cats = r.issue_categories || [];
      if (cats.includes("Señal RF Débil / Sticky")) stickyClients.push(r);
      if (cats.includes("Retransmisiones Altas (>=25%)")) highRetryClients.push(r);
      if (r.health !== null && r.health !== undefined && r.health < 7) lowHealthClients.push(r);
      if (cats.includes("Onboarding / DHCP / Roaming Lento")) slowOnbClients.push(r);
      if (cats.includes("Latencia QoS Alta (Voz/Datos)")) highLatClients.push(r);

      const uk = uidKey(r);
      uniqueUsers.add(uk);
      if (r.ap_name !== "Sin AP") uniqueAps.add(r.ap_name);
      if (r.floor && r.floor !== "--") uniqueFloors.add(r.floor);
      if (r.issue_count > 0) {
        clientsWithAnyIssue.push(r);
        issueUniqueUsers.add(uk);
      }
    }

    // 1. AP Summary
    const apGroups = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!apGroups.has(r.ap_name)) apGroups.set(r.ap_name, []);
      apGroups.get(r.ap_name).push(r);
    }

    const apSummary = [];
    for (const [apName, clients] of apGroups.entries()) {
      const cRssi = [], cSnr = [], cRet = [], cHealth = [], cVoice = [], cBe = [], cAuth = [], cAssoc = [], cOnb = [], cDhcp = [], cRoam = [], cRate = [];
      let cUsage = 0, cTx = 0, cRx = 0, cIssues = 0;
      let fRetries = 0, fAuth = 0, fAuthSupp = 0, fAssoc = 0, fDhcp = 0, fRoam = 0, fLatency = 0, fRf = 0;
      const uAll = new Set(), uIss = new Set(), uCorp = new Set(), uExt = new Set();
      const uByAlert = {
        retries: new Set(), auth_slow: new Set(), auth_supplicant: new Set(),
        assoc_slow: new Set(), dhcp_slow: new Set(), roam_slow: new Set(),
        latency: new Set(), rf_signal: new Set(),
      };
      let corpCnt = 0, extCnt = 0, connCnt = 0;

      for (let i = 0; i < clients.length; i++) {
        const c = clients[i];
        if (c.rssi !== null && c.rssi !== undefined) cRssi.push(c.rssi);
        if (c.snr !== null && c.snr !== undefined) cSnr.push(c.snr);
        if (c.retries !== null && c.retries !== undefined && c.retries > 0) cRet.push(c.retries);
        if (c.health !== null && c.health !== undefined) cHealth.push(c.health);
        if (c.voice_lat !== null && c.voice_lat !== undefined) cVoice.push(c.voice_lat);
        if (c.be_lat !== null && c.be_lat !== undefined) cBe.push(c.be_lat);
        if (c.auth_ms !== null && c.auth_ms !== undefined) cAuth.push(c.auth_ms);
        if (c.assoc_ms !== null && c.assoc_ms !== undefined) cAssoc.push(c.assoc_ms);
        if (c.onb_net_ms !== null && c.onb_net_ms !== undefined) cOnb.push(c.onb_net_ms);
        if (c.dhcp_ms !== null && c.dhcp_ms !== undefined) cDhcp.push(c.dhcp_ms);
        if (c.roam_ms !== null && c.roam_ms !== undefined) cRoam.push(c.roam_ms);
        if (c.data_rate && c.data_rate > 0) cRate.push(c.data_rate);
        cUsage += c.usage_b || 0;
        cTx += c.tx_b || 0;
        cRx += c.rx_b || 0;
        if (c.status === "CONNECTED") connCnt++;

        const uk = uidKey(c);
        uAll.add(uk);
        if (c.issue_count > 0) { cIssues++; uIss.add(uk); }
        if (isCorporateHostname(c.hostname)) { corpCnt++; uCorp.add(uk); }
        else { extCnt++; uExt.add(uk); }

        const cats = c.issue_categories || [];
        if (cats.includes("Retransmisiones Altas (>=25%)")) { fRetries++; uByAlert.retries.add(uk); }
        if (cats.includes("Auth 802.1X: Red / ISE (>=6s)")) { fAuth++; uByAlert.auth_slow.add(uk); }
        if (cats.includes("Auth 802.1X: Espera Suplicante (>=6s)")) { fAuthSupp++; uByAlert.auth_supplicant.add(uk); }
        if (cats.includes("Asociación Lenta (>2s)")) { fAssoc++; uByAlert.assoc_slow.add(uk); }
        if (cats.includes("DHCP Lento (>2s)")) { fDhcp++; uByAlert.dhcp_slow.add(uk); }
        if (cats.includes("Roaming Lento (>3s)")) { fRoam++; uByAlert.roam_slow.add(uk); }
        if (cats.includes("Latencia QoS Alta (Voz/Datos)")) { fLatency++; uByAlert.latency.add(uk); }
        if (cats.includes("Señal RF Débil / Sticky")) { fRf++; uByAlert.rf_signal.add(uk); }
      }

      const fOnb = fAssoc + fDhcp + fRoam;
      const causeCounts = [
        ["Retransmisiones (>=25%)", fRetries],
        ["Auth ISE/Red (>=6s)", fAuth],
        ["Espera Suplicante (>=6s)", fAuthSupp],
        ["Asociación Lenta (>2s)", fAssoc],
        ["DHCP Lento (>2s)", fDhcp],
        ["Roaming Lento (>3s)", fRoam],
        ["Latencia Voz/Datos", fLatency],
        ["Señal Débil / Sticky", fRf],
      ].sort((a, b) => b[1] - a[1]);
      const topCause = causeCounts[0][1] > 0 ? `${causeCounts[0][0]} (${causeCounts[0][1]})` : "Ninguno (100% Sanos)";

      const cHealthy = clients.length - cIssues;
      const cFailPct = clients.length ? roundN((cIssues / clients.length) * 100.0, 1) : 0.0;
      const apUniqueUsers = uAll.size;
      const apIssueUsers = uIss.size;
      const apUserFailPct = apUniqueUsers ? roundN((apIssueUsers / apUniqueUsers) * 100.0, 1) : 0.0;

      let riskScore = 0;
      if (clients.length >= 25) riskScore += 25;
      else if (clients.length >= 15) riskScore += 10;
      if (avg(cRet) >= 20) riskScore += 35;
      else if (avg(cRet) >= 14) riskScore += 15;
      if (avg(cAuth) >= 6000) riskScore += 25;
      else if (fAuth >= 3) riskScore += 15;
      if (cFailPct >= 50) riskScore += 20;
      if (cBe.length && avg(cBe) > 60) riskScore += 15;

      apSummary.push({
        ap_name: apName,
        floor: clients[0].floor,
        ap_health: clients[0].ap_health ?? null,
        ap_ip: clients[0].ap_ip,
        ap_mac: clients[0].ap_mac,
        location: clients[0].location,
        client_count: clients.length,
        unique_users: apUniqueUsers,
        issue_users: apIssueUsers,
        healthy_users: apUniqueUsers - apIssueUsers,
        user_failure_rate_pct: apUserFailPct,
        alerts_users_breakdown: {
          retries: uByAlert.retries.size,
          auth_slow: uByAlert.auth_slow.size,
          auth_supplicant: uByAlert.auth_supplicant.size,
          assoc_slow: uByAlert.assoc_slow.size,
          dhcp_slow: uByAlert.dhcp_slow.size,
          roam_slow: uByAlert.roam_slow.size,
          latency: uByAlert.latency.size,
          rf_signal: uByAlert.rf_signal.size,
        },
        corp_clients: corpCnt,
        corp_users: uCorp.size,
        ext_clients: extCnt,
        ext_users: uExt.size,
        pct_of_total: total ? roundN((clients.length / total) * 100.0, 1) : 0.0,
        connected_count: connCnt,
        healthy_clients: cHealthy,
        issue_clients: cIssues,
        failure_rate_pct: cFailPct,
        usage_b: cUsage,
        usage_mb: roundN(cUsage / (1024.0 * 1024.0), 2),
        usage_fmt: formatBytes(cUsage),
        tx_b: cTx,
        tx_mb: roundN(cTx / (1024.0 * 1024.0), 2),
        tx_fmt: formatBytes(cTx),
        rx_b: cRx,
        rx_mb: roundN(cRx / (1024.0 * 1024.0), 2),
        rx_fmt: formatBytes(cRx),
        avg_rssi: avg(cRssi),
        avg_snr: avg(cSnr),
        avg_retries: avg(cRet),
        avg_health: avg(cHealth),
        avg_voice_lat: avg(cVoice),
        avg_be_lat: avg(cBe),
        avg_auth_ms: avg(cAuth),
        max_auth_ms: cAuth.length ? Math.round(Math.max(...cAuth)) : 0.0,
        avg_assoc_ms: avg(cAssoc),
        avg_onboarding_ms: avg(cOnb),
        max_onboarding_ms: cOnb.length ? Math.round(Math.max(...cOnb)) : 0.0,
        avg_dhcp_ms: avg(cDhcp),
        avg_roam_ms: avg(cRoam),
        avg_data_rate: avg(cRate),
        high_retry_clients: fRetries,
        slow_auth_clients: fAuth,
        supplicant_auth_clients: fAuthSupp,
        slow_assoc_clients: fAssoc,
        slow_dhcp_clients: fDhcp,
        slow_roam_clients: fRoam,
        high_latency_clients: fLatency,
        slow_onb_clients: fOnb,
        failed_conn_clients: fAuth,
        sticky_clients: fRf,
        top_failure_cause: topCause,
        risk_score: Math.min(100, riskScore),
      });
    }

    const apFailureRanking = apSummary
      .filter((a) => a.ap_name !== "Sin AP")
      .sort(
        (a, b) =>
          b.issue_clients - a.issue_clients ||
          b.high_retry_clients - a.high_retry_clients ||
          b.slow_auth_clients - a.slow_auth_clients ||
          b.avg_retries - a.avg_retries
      );
    apSummary.sort(
      (a, b) =>
        b.client_count - a.client_count ||
        b.unique_users - a.unique_users ||
        b.usage_b - a.usage_b
    );

    // 2. Floor Client Summary
    const floorGroups = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!floorGroups.has(r.floor)) floorGroups.set(r.floor, []);
      floorGroups.get(r.floor).push(r);
    }

    const floorClientSummary = [];
    for (const [floorName, fClients] of floorGroups.entries()) {
      const fTotal = fClients.length;
      const uAll = new Set(), uIss = new Set(), uCorp = new Set(), uExt = new Set(), apsSet = new Set();
      const uByAlert = {
        retries: new Set(), auth_slow: new Set(), auth_supplicant: new Set(),
        assoc_slow: new Set(), dhcp_slow: new Set(), roam_slow: new Set(),
        latency: new Set(), rf_signal: new Set(),
      };
      let fIssues = 0, corpCnt = 0, extCnt = 0;
      let fRet = 0, fAuth = 0, fAuthSupp = 0, fAssoc = 0, fDhcp = 0, fRoam = 0, fLat = 0, fRf = 0;
      const fRetsVals = [], fRssiVals = [], fVoiceVals = [], fBeVals = [], fAuthVals = [], fAssocVals = [], fOnbVals = [], fDhcpVals = [], fRoamVals = [];
      let fUsageB = 0, fTxB = 0, fRxB = 0;

      for (let i = 0; i < fClients.length; i++) {
        const c = fClients[i];
        const uk = uidKey(c);
        uAll.add(uk);
        if (c.ap_name !== "Sin AP") apsSet.add(c.ap_name);
        if (c.issue_count > 0) { fIssues++; uIss.add(uk); }
        if (isCorporateHostname(c.hostname)) { corpCnt++; uCorp.add(uk); }
        else { extCnt++; uExt.add(uk); }

        const cats = c.issue_categories || [];
        if (cats.includes("Retransmisiones Altas (>=25%)")) { fRet++; uByAlert.retries.add(uk); }
        if (cats.includes("Auth 802.1X: Red / ISE (>=6s)")) { fAuth++; uByAlert.auth_slow.add(uk); }
        if (cats.includes("Auth 802.1X: Espera Suplicante (>=6s)")) { fAuthSupp++; uByAlert.auth_supplicant.add(uk); }
        if (cats.includes("Asociación Lenta (>2s)")) { fAssoc++; uByAlert.assoc_slow.add(uk); }
        if (cats.includes("DHCP Lento (>2s)")) { fDhcp++; uByAlert.dhcp_slow.add(uk); }
        if (cats.includes("Roaming Lento (>3s)")) { fRoam++; uByAlert.roam_slow.add(uk); }
        if (cats.includes("Latencia QoS Alta (Voz/Datos)")) { fLat++; uByAlert.latency.add(uk); }
        if (cats.includes("Señal RF Débil / Sticky")) { fRf++; uByAlert.rf_signal.add(uk); }

        if (c.retries !== null && c.retries !== undefined && c.retries > 0) fRetsVals.push(c.retries);
        if (c.rssi !== null && c.rssi !== undefined) fRssiVals.push(c.rssi);
        if (c.voice_lat !== null && c.voice_lat !== undefined) fVoiceVals.push(c.voice_lat);
        if (c.be_lat !== null && c.be_lat !== undefined) fBeVals.push(c.be_lat);
        if (c.auth_ms !== null && c.auth_ms !== undefined) fAuthVals.push(c.auth_ms);
        if (c.assoc_ms !== null && c.assoc_ms !== undefined) fAssocVals.push(c.assoc_ms);
        if (c.onb_net_ms !== null && c.onb_net_ms !== undefined) fOnbVals.push(c.onb_net_ms);
        if (c.dhcp_ms !== null && c.dhcp_ms !== undefined) fDhcpVals.push(c.dhcp_ms);
        if (c.roam_ms !== null && c.roam_ms !== undefined) fRoamVals.push(c.roam_ms);
        fUsageB += c.usage_b || 0;
        fTxB += c.tx_b || 0;
        fRxB += c.rx_b || 0;
      }

      const fOnb = fAssoc + fDhcp + fRoam;
      const apsInFloorFail = apFailureRanking.filter((a) => a.floor === floorName);
      const apsInFloorBusy = apSummary.filter((a) => a.floor === floorName && a.ap_name !== "Sin AP");
      const fFailPct = fTotal ? roundN((fIssues / fTotal) * 100.0, 1) : 0.0;
      const fUniqueUsers = uAll.size;
      const fIssueUsers = uIss.size;

      floorClientSummary.push({
        floor: floorName,
        total_clients: fTotal,
        unique_users: fUniqueUsers,
        issue_users: fIssueUsers,
        healthy_users: fUniqueUsers - fIssueUsers,
        user_failure_rate_pct: fUniqueUsers ? roundN((fIssueUsers / fUniqueUsers) * 100.0, 1) : 0.0,
        alerts_users_breakdown: {
          retries: uByAlert.retries.size,
          auth_slow: uByAlert.auth_slow.size,
          auth_supplicant: uByAlert.auth_supplicant.size,
          assoc_slow: uByAlert.assoc_slow.size,
          dhcp_slow: uByAlert.dhcp_slow.size,
          roam_slow: uByAlert.roam_slow.size,
          latency: uByAlert.latency.size,
          rf_signal: uByAlert.rf_signal.size,
        },
        corp_clients: corpCnt,
        corp_users: uCorp.size,
        ext_clients: extCnt,
        ext_users: uExt.size,
        healthy_clients: fTotal - fIssues,
        issue_clients: fIssues,
        failure_rate_pct: fFailPct,
        health_rate_pct: roundN(100.0 - fFailPct, 1),
        aps_count: apsSet.size,
        busiest_ap: apsInFloorBusy[0] ? apsInFloorBusy[0].ap_name : "--",
        busiest_ap_clients: apsInFloorBusy[0] ? apsInFloorBusy[0].client_count : 0,
        busiest_ap_users: apsInFloorBusy[0] ? apsInFloorBusy[0].unique_users : 0,
        worst_ap: apsInFloorFail[0] ? apsInFloorFail[0].ap_name : "--",
        worst_ap_issues: apsInFloorFail[0] ? apsInFloorFail[0].issue_clients : 0,
        worst_ap_total: apsInFloorFail[0] ? apsInFloorFail[0].client_count : 0,
        avg_retries: avg(fRetsVals),
        avg_rssi: avg(fRssiVals),
        avg_voice_lat: avg(fVoiceVals),
        avg_be_lat: avg(fBeVals),
        avg_auth_ms: avg(fAuthVals),
        max_auth_ms: fAuthVals.length ? Math.round(Math.max(...fAuthVals)) : 0.0,
        avg_assoc_ms: avg(fAssocVals),
        avg_onboarding_ms: avg(fOnbVals),
        max_onboarding_ms: fOnbVals.length ? Math.round(Math.max(...fOnbVals)) : 0.0,
        avg_dhcp_ms: avg(fDhcpVals),
        avg_roam_ms: avg(fRoamVals),
        usage_b: fUsageB,
        usage_mb: roundN(fUsageB / (1024.0 * 1024.0), 2),
        usage_fmt: formatBytes(fUsageB),
        tx_b: fTxB,
        tx_mb: roundN(fTxB / (1024.0 * 1024.0), 2),
        tx_fmt: formatBytes(fTxB),
        rx_b: fRxB,
        rx_mb: roundN(fRxB / (1024.0 * 1024.0), 2),
        rx_fmt: formatBytes(fRxB),
        alerts_breakdown: {
          retries: fRet,
          auth_slow: fAuth,
          auth_supplicant: fAuthSupp,
          assoc_slow: fAssoc,
          dhcp_slow: fDhcp,
          roam_slow: fRoam,
          onboarding: fOnb,
          latency: fLat,
          connection: fAuth + fAuthSupp,
          rf_signal: fRf,
        },
        total_alerts: fRet + fAuth + fAuthSupp + fAssoc + fDhcp + fRoam + fLat + fRf,
      });
    }
    floorClientSummary.sort((a, b) => b.issue_clients - a.issue_clients || b.total_clients - a.total_clients);

    // 2B. Device Model / Vendor / OS Summaries
    function buildDimAlertSummary(labelFn, shortFn) {
      const groups = new Map();
      const canonLabels = new Map();
      const shorts = new Map();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rawLbl = labelFn(r);
        const kNorm = rawLbl.trim().toLowerCase();
        if (!canonLabels.has(kNorm)) canonLabels.set(kNorm, rawLbl);
        const lbl = canonLabels.get(kNorm);
        if (!groups.has(lbl)) groups.set(lbl, []);
        groups.get(lbl).push(r);
        if (!shorts.has(lbl)) shorts.set(lbl, shortFn(r, lbl));
      }
      const out = [];
      for (const [gName, gClients] of groups.entries()) {
        const uAll = new Set(), uIss = new Set();
        const uByAlert = {
          retries: new Set(), auth_slow: new Set(), auth_supplicant: new Set(),
          assoc_slow: new Set(), dhcp_slow: new Set(), roam_slow: new Set(),
          latency: new Set(), rf_signal: new Set(),
        };
        let gIssues = 0, gUsageB = 0;
        const gRets = [], gRssi = [], gBe = [], gAuth = [], gAssoc = [], gDhcp = [], gRoam = [];
        const flFailCounts = new Map();

        for (let i = 0; i < gClients.length; i++) {
          const c = gClients[i];
          const uk = uidKey(c);
          uAll.add(uk);
          if (c.issue_count > 0) {
            gIssues++;
            uIss.add(uk);
            if (c.floor && c.floor !== "--") {
              flFailCounts.set(c.floor, (flFailCounts.get(c.floor) || 0) + 1);
            }
          }
          const cats = c.issue_categories || [];
          if (cats.includes("Retransmisiones Altas (>=25%)")) uByAlert.retries.add(uk);
          if (cats.includes("Auth 802.1X: Red / ISE (>=6s)")) uByAlert.auth_slow.add(uk);
          if (cats.includes("Auth 802.1X: Espera Suplicante (>=6s)")) uByAlert.auth_supplicant.add(uk);
          if (cats.includes("Asociación Lenta (>2s)")) uByAlert.assoc_slow.add(uk);
          if (cats.includes("DHCP Lento (>2s)")) uByAlert.dhcp_slow.add(uk);
          if (cats.includes("Roaming Lento (>3s)")) uByAlert.roam_slow.add(uk);
          if (cats.includes("Latencia QoS Alta (Voz/Datos)")) uByAlert.latency.add(uk);
          if (cats.includes("Señal RF Débil / Sticky")) uByAlert.rf_signal.add(uk);

          if (c.retries !== null && c.retries !== undefined && c.retries > 0) gRets.push(c.retries);
          if (c.rssi !== null && c.rssi !== undefined) gRssi.push(c.rssi);
          if (c.be_lat !== null && c.be_lat !== undefined) gBe.push(c.be_lat);
          if (c.auth_ms !== null && c.auth_ms !== undefined) gAuth.push(c.auth_ms);
          if (c.assoc_ms !== null && c.assoc_ms !== undefined) gAssoc.push(c.assoc_ms);
          if (c.dhcp_ms !== null && c.dhcp_ms !== undefined) gDhcp.push(c.dhcp_ms);
          if (c.roam_ms !== null && c.roam_ms !== undefined) gRoam.push(c.roam_ms);
          gUsageB += c.usage_b || 0;
        }
        let topFl = "--", bestFv = -1;
        for (const [fk, fv] of flFailCounts.entries()) {
          if (fv > bestFv) { bestFv = fv; topFl = fk; }
        }
        out.push({
          name: gName,
          short_name: shorts.get(gName) || gName,
          total_clients: gClients.length,
          unique_users: uAll.size,
          issue_users: uIss.size,
          issue_clients: gIssues,
          user_failure_rate_pct: uAll.size ? roundN((uIss.size / uAll.size) * 100.0, 1) : 0.0,
          alerts_users_breakdown: {
            retries: uByAlert.retries.size,
            auth_slow: uByAlert.auth_slow.size,
            auth_supplicant: uByAlert.auth_supplicant.size,
            assoc_slow: uByAlert.assoc_slow.size,
            dhcp_slow: uByAlert.dhcp_slow.size,
            roam_slow: uByAlert.roam_slow.size,
            latency: uByAlert.latency.size,
            rf_signal: uByAlert.rf_signal.size,
          },
          top_floor: topFl,
          avg_retries: avg(gRets),
          avg_rssi: avg(gRssi),
          avg_be_lat: avg(gBe),
          avg_auth_ms: avg(gAuth),
          avg_assoc_ms: avg(gAssoc),
          avg_dhcp_ms: avg(gDhcp),
          avg_roam_ms: avg(gRoam),
          usage_b: gUsageB,
          usage_mb: roundN(gUsageB / (1024.0 * 1024.0), 2),
          usage_fmt: formatBytes(gUsageB),
        });
      }
      out.sort((a, b) => b.issue_users - a.issue_users || b.unique_users - a.unique_users);
      return out;
    }

    const deviceModelSummary = buildDimAlertSummary(
      (r) => r.device_model || normalizeDeviceModel(r.device_type, r.vendor, r.os, r.endpoint_type)[0],
      (r, lbl) => r.device_model_short || (lbl.length > 19 ? lbl.slice(0, 18) + "…" : lbl)
    );
    const deviceVendorSummary = buildDimAlertSummary(
      (r) => r.vendor_clean || normalizeVendorName(r.vendor, r.os)[0],
      (r, lbl) => r.vendor_short || (lbl.length > 17 ? lbl.slice(0, 16) + "…" : lbl)
    );
    const deviceOsSummary = buildDimAlertSummary(
      (r) => (r.os && r.os !== "--" ? r.os : "SO Desconocido"),
      (r, lbl) => lbl.replace(" Enterprise LTSC", " LTSC").replace(" Enterprise", " Ent.")
    );

    const sumAlert = (k) => floorClientSummary.reduce((acc, f) => acc + (f.alerts_breakdown[k] || 0), 0);
    const alertCategoriesSummary = {
      "Retransmisiones Altas (>=25%)": sumAlert("retries"),
      "Auth 802.1X: Red / ISE (>=6s)": sumAlert("auth_slow"),
      "Auth 802.1X: Espera Suplicante (>=6s)": sumAlert("auth_supplicant"),
      "Asociación Lenta (>2s)": sumAlert("assoc_slow"),
      "DHCP Lento (>2s)": sumAlert("dhcp_slow"),
      "Roaming Lento (>3s)": sumAlert("roam_slow"),
      "Latencia QoS Alta (Voz/Datos)": sumAlert("latency"),
      "Señal RF Débil / Sticky": sumAlert("rf_signal"),
    };

    const alertUsersSummary = {};
    for (const catName of Object.keys(alertCategoriesSummary)) {
      const s = new Set();
      for (let i = 0; i < rows.length; i++) {
        if ((rows[i].issue_categories || []).includes(catName)) s.add(uidKey(rows[i]));
      }
      alertUsersSummary[catName] = s.size;
    }

    const worstFloor = floorClientSummary[0] || null;
    const worstAp = apFailureRanking[0] || null;
    const busiestAp = apSummary[0] || null;
    const floorsByUsers = [...floorClientSummary].sort(
      (a, b) => b.total_clients - a.total_clients || b.unique_users - a.unique_users
    );
    const busiestFloor = floorsByUsers[0] || null;

    let corpClientsTotal = 0, extClientsTotal = 0;
    const corpUsersSet = new Set(), extUsersSet = new Set();
    let slowAuthIseCnt = 0, slowAuthSuppCnt = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (isCorporateHostname(r.hostname)) {
        corpClientsTotal++;
        if (r.user_id !== "--") corpUsersSet.add(r.user_id);
      } else {
        extClientsTotal++;
        if (r.user_id !== "--") extUsersSet.add(r.user_id);
      }
      const cats = r.issue_categories || [];
      if (cats.includes("Auth 802.1X: Red / ISE (>=6s)")) slowAuthIseCnt++;
      if (cats.includes("Auth 802.1X: Espera Suplicante (>=6s)")) slowAuthSuppCnt++;
    }

    const kpis = {
      total_clients: total,
      connected_count: connected.length,
      not_connected_count: notConnected.length,
      connected_pct: roundN((connected.length * 100.0) / total, 1),
      healthy_clients_count: total - clientsWithAnyIssue.length,
      issue_clients_count: clientsWithAnyIssue.length,
      issue_clients_pct: roundN((clientsWithAnyIssue.length * 100.0) / total, 1),
      unique_aps: uniqueAps.size,
      unique_floors: uniqueFloors.size,
      unique_users: uniqueUsers.size,
      issue_users_count: issueUniqueUsers.size,
      issue_users_pct: uniqueUsers.size ? roundN((issueUniqueUsers.size * 100.0) / uniqueUsers.size, 1) : 0.0,
      corp_clients: corpClientsTotal,
      corp_users: corpUsersSet.size,
      ext_clients: extClientsTotal,
      ext_users: extUsersSet.size,
      total_usage_b: totalUsage,
      total_usage_fmt: formatBytes(totalUsage),
      total_tx_fmt: formatBytes(totalTx),
      total_rx_fmt: formatBytes(totalRx),
      avg_health: avg(healthVals),
      avg_rssi: avg(rssiVals),
      avg_snr: avg(snrVals),
      avg_retries: avg(retryVals),
      avg_data_rate: avg(rateVals),
      avg_onboarding_ms: avg(onbVals),
      avg_assoc_ms: avg(assocVals),
      avg_auth_ms: avg(authVals),
      avg_dhcp_ms: avg(dhcpVals),
      avg_roam_ms: avg(roamVals),
      avg_voice_lat: avg(voiceVals),
      avg_be_lat: avg(beVals),
      sticky_count: stickyClients.length,
      high_retry_count: highRetryClients.length,
      slow_auth_count: slowAuthIseCnt,
      slow_auth_supp_count: slowAuthSuppCnt,
      high_lat_count: highLatClients.length,
      low_health_count: lowHealthClients.length,
      slow_onb_count: slowOnbClients.length,
      busiest_ap_name: busiestAp ? busiestAp.ap_name : "--",
      busiest_ap_floor: busiestAp ? busiestAp.floor : "--",
      busiest_ap_clients: busiestAp ? busiestAp.client_count : 0,
      busiest_ap_users: busiestAp ? busiestAp.unique_users : 0,
      busiest_ap_retries: busiestAp ? busiestAp.avg_retries : 0.0,
      busiest_ap_auth_ms: busiestAp ? busiestAp.avg_auth_ms : 0.0,
      busiest_floor_name: busiestFloor ? busiestFloor.floor : "--",
      busiest_floor_clients: busiestFloor ? busiestFloor.total_clients : 0,
      busiest_floor_users: busiestFloor ? busiestFloor.unique_users : 0,
      worst_floor_name: worstFloor ? worstFloor.floor : "--",
      worst_floor_issues: worstFloor ? worstFloor.issue_clients : 0,
      worst_floor_total: worstFloor ? worstFloor.total_clients : 0,
      worst_floor_pct: worstFloor ? worstFloor.failure_rate_pct : 0.0,
      worst_ap_name: worstAp ? worstAp.ap_name : "--",
      worst_ap_floor: worstAp ? worstAp.floor : "--",
      worst_ap_issues: worstAp ? worstAp.issue_clients : 0,
      worst_ap_total: worstAp ? worstAp.client_count : 0,
      worst_ap_pct: worstAp ? worstAp.failure_rate_pct : 0.0,
      worst_ap_cause: worstAp ? worstAp.top_failure_cause : "--",
    };

    // 3. User Summary
    const userGroups = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!userGroups.has(r.user_id)) userGroups.set(r.user_id, []);
      userGroups.get(r.user_id).push(r);
    }
    const userSummary = [];
    for (const [uid, uClients] of userGroups.entries()) {
      let uUsage = 0, issSum = 0;
      const uAps = new Set(), uFloors = new Set(), uDevs = new Set(), uStat = new Set();
      const uMacs = [], uHosts = [], uRssi = [], uRet = [], uHealth = [], uOnb = [];
      for (let i = 0; i < uClients.length; i++) {
        const c = uClients[i];
        uUsage += c.usage_b || 0;
        issSum += c.issue_count || 0;
        uAps.add(c.ap_name);
        uFloors.add(c.floor);
        uDevs.add(c.device_type);
        uStat.add(c.status);
        uMacs.push(c.mac);
        if (c.hostname !== "--") uHosts.push(c.hostname);
        if (c.rssi !== null && c.rssi !== undefined) uRssi.push(c.rssi);
        if (c.retries !== null && c.retries !== undefined) uRet.push(c.retries);
        if (c.health !== null && c.health !== undefined) uHealth.push(c.health);
        if (c.onboarding_ms !== null && c.onboarding_ms !== undefined) uOnb.push(c.onboarding_ms);
      }
      userSummary.push({
        user_id: uid,
        device_count: uClients.length,
        devices: Array.from(uDevs).sort(),
        macs: uMacs,
        hostnames: uHosts,
        aps: Array.from(uAps).sort(),
        floors: Array.from(uFloors).sort(),
        usage_b: uUsage,
        usage_fmt: formatBytes(uUsage),
        avg_rssi: avg(uRssi),
        avg_retries: avg(uRet),
        max_retries: uRet.length ? Math.max(...uRet) : 0.0,
        min_health: uHealth.length ? Math.min(...uHealth) : null,
        max_onboarding_ms: uOnb.length ? Math.max(...uOnb) : null,
        issue_count: issSum,
        statuses: Array.from(uStat),
      });
    }
    userSummary.sort((a, b) => b.usage_b - a.usage_b || b.device_count - a.device_count);

    // 4. Time Analytics & Distributions
    const hourlyMap = new Map(), slot15Map = new Map();
    const sessionBuckets = {
      "< 15 min (Reciente)": 0,
      "15 - 60 min": 0,
      "1 - 3 horas": 0,
      "3 - 6 horas": 0,
      "> 6 horas (Larga)": 0,
    };
    const retryBuckets = {
      "0-10% (Óptimo)": 0,
      "11-20% (Normal)": 0,
      "21-24% (Elevado)": 0,
      "25-30% (Alto)": 0,
      "> 30% (Crítico)": 0,
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.hour_slot !== "--") {
        if (!hourlyMap.has(r.hour_slot)) hourlyMap.set(r.hour_slot, []);
        hourlyMap.get(r.hour_slot).push(r);
      }
      if (r.slot_15m !== "--") {
        if (!slot15Map.has(r.slot_15m)) slot15Map.set(r.slot_15m, []);
        slot15Map.get(r.slot_15m).push(r);
      }
      if (sessionBuckets[r.session_bucket] !== undefined) sessionBuckets[r.session_bucket]++;
      if (retryBuckets[r.retry_bucket] !== undefined) retryBuckets[r.retry_bucket]++;
    }

    const hourlySeries = Array.from(hourlyMap.keys()).sort().map((hr) => {
      const hRows = hourlyMap.get(hr);
      const hRet = hRows.filter((x) => x.retries !== null && x.retries !== undefined).map((x) => x.retries);
      const hAph = hRows.filter((x) => x.ap_health !== null && x.ap_health !== undefined).map((x) => x.ap_health);
      return {
        hour: hr,
        client_count: hRows.length,
        avg_retries: avg(hRet),
        avg_ap_health: hAph.length ? avg(hAph) : 10.0,
      };
    });
    const slot15Series = Array.from(slot15Map.keys()).sort().map((sl) => {
      const sRows = slot15Map.get(sl);
      const sOnb = sRows.filter((x) => x.onboarding_ms !== null && x.onboarding_ms !== undefined).map((x) => x.onboarding_ms / 1000.0);
      const sAph = sRows.filter((x) => x.ap_health !== null && x.ap_health !== undefined).map((x) => x.ap_health);
      return {
        slot: sl,
        client_count: sRows.length,
        avg_onboarding_s: avg(sOnb),
        avg_ap_health: sAph.length ? avg(sAph) : 10.0,
      };
    });

    function countDist(key) {
      const mp = new Map();
      for (let i = 0; i < rows.length; i++) {
        const k = rows[i][key];
        mp.set(k, (mp.get(k) || 0) + 1);
      }
      return Object.fromEntries(Array.from(mp.entries()).sort((a, b) => b[1] - a[1]));
    }

    const slowAuthClients = rows.filter((r) => (r.issue_categories || []).includes("Auth 802.1X: Red / ISE (>=6s)"));
    const insights = [];
    if (apSummary.length) {
      const topBusy = apSummary.slice(0, 3);
      insights.push({
        severity: "info",
        action_type: "ap_focus",
        action_value: topBusy[0].ap_name,
        title: `APs con Mayor Número de Usuarios en el Día: ${topBusy.map((a) => a.ap_name).join(", ")}`,
        desc: "Estos Access Points concentran la mayor densidad de usuarios y sesiones conectadas. Haz clic para inspeccionar el AP con más usuarios.",
        affected: topBusy.map((a) => `${a.ap_name} (${a.floor}): ${a.unique_users} usuarios (${a.client_count} ses. • Retries: ${a.avg_retries}% • Auth: ${a.avg_auth_ms}ms)`),
      });
    }
    if (apFailureRanking.length) {
      const top3 = apFailureRanking.slice(0, 3);
      insights.push({
        severity: "critical",
        action_type: "ap_focus",
        action_value: top3[0].ap_name,
        title: `APs con más clientes afectados (Retries / Auth 802.1X): ${top3.map((a) => a.ap_name).join(", ")}`,
        desc: "Estos 3 APs concentran la mayor cantidad de clientes con Retransmisiones >= 25%, Autenticación 802.1X lenta (>=6s) o Latencia alta. Haz clic para filtrar.",
        affected: top3.map((a) => `${a.ap_name} (${a.floor}): ${a.issue_clients}/${a.client_count} clientes (${a.failure_rate_pct}%) — Principal: ${a.top_failure_cause}`),
      });
    }
    if (highRetryClients.length) {
      insights.push({
        severity: "warning",
        action_type: "retry_range",
        action_value: "25-100",
        title: `${highRetryClients.length} Clientes con Retransmisiones L2 >= 25% (Clic para aislar)`,
        desc: "Alta contención de Airtime / Interferencia Co-Canal. Úsalo como línea base (Baseline) para medir cuánto mejora día a día.",
        affected: [...highRetryClients].sort((a, b) => b.retries - a.retries).slice(0, 6).map((c) => `${c.user_id} en ${c.ap_name} (${Math.trunc(c.retries)}%)`),
      });
    }
    if (slowAuthClients.length) {
      insights.push({
        severity: "warning",
        action_type: "alert_cat",
        action_value: "Auth 802.1X: Red / ISE (>=6s)",
        title: `${slowAuthClients.length} Clientes con Demora Real de Red / ISE en Auth 802.1X >= 6s (Clic para aislar)`,
        desc: "Clientes donde el intercambio EAP/RADIUS presenta ráfagas simultáneas en ISE/AP, pérdida RF o degradación de Onboarding Health.",
        affected: [...slowAuthClients].sort((a, b) => b.auth_ms - a.auth_ms).slice(0, 6).map((c) => `${c.user_id} en ${c.ap_name} (${Math.trunc(c.auth_ms)} ms)`),
      });
    }

    // 5. Concurrent Alarms
    const tagCountsMap = new Map();
    const concurrencyBuckets = {
      "0 Alarmas (Sano)": 0,
      "1 Alarma": 0,
      "2 Alarmas Concurrentes": 0,
      "3+ Alarmas Concurrentes": 0,
    };
    const comboMap = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const tags = r.alarm_tags || [];
      const tc = tags.length;
      if (tc === 0) concurrencyBuckets["0 Alarmas (Sano)"]++;
      else if (tc === 1) concurrencyBuckets["1 Alarma"]++;
      else if (tc === 2) concurrencyBuckets["2 Alarmas Concurrentes"]++;
      else concurrencyBuckets["3+ Alarmas Concurrentes"]++;

      for (let t = 0; t < tc; t++) tagCountsMap.set(tags[t], (tagCountsMap.get(tags[t]) || 0) + 1);
      if (tc >= 2) {
        const ck = [...tags.slice(0, 3)].sort().join(" + ");
        if (!comboMap.has(ck)) comboMap.set(ck, []);
        comboMap.get(ck).push(r);
      }
    }
    const sortedTags = Array.from(tagCountsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ tag: k, count: v, pct: roundN((v / total) * 100.0, 1) }));
    const topCombinations = Array.from(comboMap.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .map(([cKey, cRows]) => ({
        combo: cKey,
        first_tag: cKey.split(" + ")[0],
        count: cRows.length,
        pct: roundN((cRows.length / total) * 100.0, 1),
        sample_aps: Array.from(new Set(cRows.map((x) => x.ap_name))).sort().slice(0, 3),
        sample_floors: Array.from(new Set(cRows.map((x) => x.floor))).sort().slice(0, 3),
        sample_users: cRows.slice(0, 4).map((x) => x.user_id),
      }));

    // 6. Auth Analytics
    const authByFloor = floorClientSummary
      .filter((f) => f.avg_onboarding_ms > 0 || f.avg_auth_ms > 0)
      .sort((a, b) => b.avg_auth_ms - a.avg_auth_ms || b.avg_onboarding_ms - a.avg_onboarding_ms);
    const authByAp = apSummary
      .filter((a) => a.ap_name !== "Sin AP" && (a.avg_auth_ms > 0 || a.avg_onboarding_ms > 0))
      .sort((a, b) => b.avg_auth_ms - a.avg_auth_ms || b.avg_onboarding_ms - a.avg_onboarding_ms || b.client_count - a.client_count)
      .slice(0, 15);
    const serverGroups = new Map(), osAuthGroups = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const srv = r.auth_server !== "--" ? r.auth_server : "Sin Auth Server (Caché/Roam)";
      if (!serverGroups.has(srv)) serverGroups.set(srv, []);
      serverGroups.get(srv).push(r);
      if (!osAuthGroups.has(r.os)) osAuthGroups.set(r.os, []);
      osAuthGroups.get(r.os).push(r);
    }
    const authByServer = Array.from(serverGroups.entries()).map(([srv, sRows]) => {
      const sAuth = sRows.filter((x) => x.auth_ms !== null && x.auth_ms !== undefined).map((x) => x.auth_ms);
      const sOnb = sRows.filter((x) => x.onboarding_ms !== null && x.onboarding_ms !== undefined).map((x) => x.onboarding_ms);
      const sDhcp = sRows.filter((x) => x.dhcp_ms !== null && x.dhcp_ms !== undefined).map((x) => x.dhcp_ms);
      return {
        server: srv,
        client_count: sRows.length,
        avg_auth_ms: avg(sAuth),
        max_auth_ms: sAuth.length ? Math.round(Math.max(...sAuth)) : 0.0,
        avg_onboarding_ms: avg(sOnb),
        avg_dhcp_ms: avg(sDhcp),
        slow_auth_count: sRows.filter((x) => (x.auth_ms || 0) >= 6000).length,
      };
    }).sort((a, b) => b.avg_auth_ms - a.avg_auth_ms || b.client_count - a.client_count);

    const authByOs = [];
    for (const [osName, oRows] of osAuthGroups.entries()) {
      const oAuth = oRows.filter((x) => x.auth_ms !== null && x.auth_ms !== undefined).map((x) => x.auth_ms);
      const oOnb = oRows.filter((x) => x.onboarding_ms !== null && x.onboarding_ms !== undefined).map((x) => x.onboarding_ms);
      if (oAuth.length || oOnb.length) {
        authByOs.push({
          os: osName,
          client_count: oRows.length,
          avg_auth_ms: avg(oAuth),
          max_auth_ms: oAuth.length ? Math.round(Math.max(...oAuth)) : 0.0,
          avg_onboarding_ms: avg(oOnb),
        });
      }
    }
    authByOs.sort((a, b) => b.avg_auth_ms - a.avg_auth_ms);

    const slowestAuthClients = rows
      .filter((r) => (r.auth_ms !== null && r.auth_ms > 0) || (r.onboarding_ms !== null && r.onboarding_ms > 0))
      .sort((a, b) => (b.auth_ms || 0) - (a.auth_ms || 0) || (b.onboarding_ms || 0) - (a.onboarding_ms || 0))
      .slice(0, 20);

    const slowRaw6s = rows.filter((r) => (r.auth_ms || 0) >= 6000).length;
    const authAnalytics = {
      by_floor: authByFloor,
      by_ap: authByAp,
      by_server: authByServer,
      by_os: authByOs,
      slowest_clients: slowestAuthClients,
      slow_auth_3s_count: slowRaw6s,
      slow_auth_5s_count: slowRaw6s,
      slow_onb_5s_count: rows.filter((r) => (r.onboarding_ms || 0) >= 5000).length,
      slow_onb_10s_count: slowOnbClients.length,
    };

    // 7. Traffic Analytics
    const trafficAnalytics = {
      total_usage_fmt: formatBytes(totalUsage),
      total_tx_fmt: formatBytes(totalTx),
      total_rx_fmt: formatBytes(totalRx),
      total_usage_mb: roundN(totalUsage / (1024.0 * 1024.0), 2),
      total_tx_mb: roundN(totalTx / (1024.0 * 1024.0), 2),
      total_rx_mb: roundN(totalRx / (1024.0 * 1024.0), 2),
      by_floor: [...floorClientSummary].sort((a, b) => b.usage_b - a.usage_b),
      by_ap: apSummary.filter((a) => a.ap_name !== "Sin AP").sort((a, b) => b.usage_b - a.usage_b).slice(0, 15),
      top_clients: [...rows].sort((a, b) => b.usage_b - a.usage_b).slice(0, 20),
    };

    // 8. Performance Analytics
    const dataRateBuckets = {
      "< 72 Mbps (Bajo)": 0,
      "72 - 149 Mbps (Medio)": 0,
      "150 - 249 Mbps (Bueno)": 0,
      ">= 250 Mbps (Óptimo Wi-Fi 6)": 0,
    };
    for (let i = 0; i < rows.length; i++) {
      const dr = rows[i].data_rate || 0.0;
      if (dr < 72) dataRateBuckets["< 72 Mbps (Bajo)"]++;
      else if (dr < 150) dataRateBuckets["72 - 149 Mbps (Medio)"]++;
      else if (dr < 250) dataRateBuckets["150 - 249 Mbps (Bueno)"]++;
      else dataRateBuckets[">= 250 Mbps (Óptimo Wi-Fi 6)"]++;
    }

    const performanceAnalytics = {
      data_rate_buckets: dataRateBuckets,
      top_retry_clients: [...rows]
        .sort((a, b) => (b.retries || 0) - (a.retries || 0) || b.alarm_tags_count - a.alarm_tags_count || b.usage_b - a.usage_b)
        .slice(0, 15),
      most_affected_clients: rows
        .filter((r) => r.alarm_tags_count > 0 || r.issue_count > 0)
        .sort((a, b) => b.alarm_tags_count - a.alarm_tags_count || b.issue_count - a.issue_count || (b.retries || 0) - (a.retries || 0) || (b.onboarding_ms || 0) - (a.onboarding_ms || 0))
        .slice(0, 20),
    };

    const dailyComparison = includeDaily ? computeDailyComparison(rows) : {};

    return {
      total_records: total,
      kpis,
      ap_summary: apSummary,
      ap_failure_ranking: apFailureRanking,
      floor_client_summary: floorClientSummary,
      device_model_summary: deviceModelSummary,
      device_vendor_summary: deviceVendorSummary,
      device_os_summary: deviceOsSummary,
      alert_categories_summary: alertCategoriesSummary,
      alert_users_summary: alertUsersSummary,
      concurrent_alarms: {
        tag_counts: sortedTags,
        concurrency_buckets: concurrencyBuckets,
        top_combinations: topCombinations,
        multi_alarm_clients_count: concurrencyBuckets["2 Alarmas Concurrentes"] + concurrencyBuckets["3+ Alarmas Concurrentes"],
      },
      auth_analytics: authAnalytics,
      traffic_analytics: trafficAnalytics,
      performance_analytics: performanceAnalytics,
      daily_comparison: dailyComparison,
      user_summary: userSummary,
      time_analytics: {
        hourly: hourlySeries,
        slot15m: slot15Series,
        session_buckets: sessionBuckets,
      },
      distributions: {
        band: countDist("band"),
        protocol: countDist("protocol"),
        capability: countDist("capability"),
        rf_quality: countDist("rf_quality"),
        device_type: countDist("device_type"),
        os: countDist("os"),
        status: countDist("status"),
        ssid: countDist("ssid"),
        floor: countDist("floor"),
        retries_bucket: retryBuckets,
        data_rate_bucket: dataRateBuckets,
      },
      insights,
      clients: rows,
    };
  }

  function filterRows(rows, params) {
    let filtered = rows;
    if (!params) return filtered;

    const q = String(params.q || "").trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (r) =>
          (r.user_id || "").toLowerCase().includes(q) ||
          (r.hostname || "").toLowerCase().includes(q) ||
          (r.mac || "").toLowerCase().includes(q) ||
          (r.ipv4 || "").toLowerCase().includes(q) ||
          (r.ap_name || "").toLowerCase().includes(q) ||
          (r.floor || "").toLowerCase().includes(q) ||
          (r.device_type || "").toLowerCase().includes(q) ||
          (r.os || "").toLowerCase().includes(q) ||
          (r.issue_categories || []).some((cat) => cat.toLowerCase().includes(q)) ||
          (r.alarm_tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }

    if (params.source_file && params.source_file !== "ALL") {
      filtered = filtered.filter((r) => r.source_file === params.source_file);
    }
    if (params.day_label && params.day_label !== "ALL") {
      const daySet = new Set(String(params.day_label).split(",").map((d) => d.trim()).filter(Boolean));
      if (daySet.size) filtered = filtered.filter((r) => daySet.has(r.day_label));
    }
    const corpFilter = String(params.corp_filter || "").trim().toUpperCase();
    if (corpFilter === "CORP") filtered = filtered.filter((r) => isCorporateHostname(r.hostname));
    else if (corpFilter === "EXT") filtered = filtered.filter((r) => !isCorporateHostname(r.hostname));

    if (params.client_floor && params.client_floor !== "ALL") {
      filtered = filtered.filter((r) => r.floor === params.client_floor);
    }
    if (params.ap && params.ap !== "ALL") {
      filtered = filtered.filter((r) => r.ap_name === params.ap);
    }
    if (params.retry_range && params.retry_range !== "ALL") {
      const parts = String(params.retry_range).split("-");
      if (parts.length === 2) {
        const lo = parseFloat(parts[0]), hi = parseFloat(parts[1]);
        filtered = filtered.filter((r) => (r.retries || 0) >= lo && (r.retries || 0) <= hi);
      }
    }
    if (params.band && params.band !== "ALL") filtered = filtered.filter((r) => r.band === params.band);
    if (params.protocol && params.protocol !== "ALL") filtered = filtered.filter((r) => r.protocol === params.protocol);
    if (params.status && params.status !== "ALL") filtered = filtered.filter((r) => r.status === params.status);
    if (params.exclude_disconnected === "true") filtered = filtered.filter((r) => r.status !== "DISCONNECTED");
    if (params.os && params.os !== "ALL") filtered = filtered.filter((r) => r.os === params.os);
    if (params.rf_quality && params.rf_quality !== "ALL") filtered = filtered.filter((r) => r.rf_quality === params.rf_quality);
    if (params.hour_slot && params.hour_slot !== "ALL") filtered = filtered.filter((r) => r.hour_slot === params.hour_slot);
    if (params.session_bucket && params.session_bucket !== "ALL") filtered = filtered.filter((r) => r.session_bucket === params.session_bucket);
    if (params.alert_cat && params.alert_cat !== "ALL") {
      filtered = filtered.filter((r) => (r.issue_categories || []).includes(params.alert_cat));
    }
    if (params.alarm_tag && params.alarm_tag !== "ALL") {
      if (params.alarm_tag.includes(" + ")) {
        const reqTags = params.alarm_tag.split(" + ").map((t) => t.trim()).filter(Boolean);
        filtered = filtered.filter((r) => reqTags.every((rt) => (r.alarm_tags || []).includes(rt)));
      } else {
        filtered = filtered.filter((r) => (r.alarm_tags || []).includes(params.alarm_tag));
      }
    }
    if (params.only_issues === "true") filtered = filtered.filter((r) => r.issue_count > 0);
    const minRet = parseFloatVal(params.min_retries);
    if (minRet !== null && minRet > 0) filtered = filtered.filter((r) => (r.retries || 0) >= minRet);
    const maxRet = parseFloatVal(params.max_retries);
    if (maxRet !== null && maxRet >= 0) filtered = filtered.filter((r) => (r.retries || 0) <= maxRet);

    return filtered;
  }

  // ============================================================================
  // ESTADO EN MEMORIA + CACHÉ LOCAL (IndexedDB) + SEMILLA EMBEBIDA (GZIP Base64)
  // ============================================================================
  const STATE = {
    filename: "Sin archivos",
    loaded_files: [],
    rows: [],
    filter_options: {},
    ap_inv_filename: "datos_inventario_aps_cisco.csv",
    ap_inv_rows: [],
    exclude_ps_latency: true,
    cached_daily_comparison: null,
    cached_by_day_breakdown: null,
    seed_files_backup: [],
  };

  function sortFloorKey(floorStr) {
    const s = String(floorStr || "").toLowerCase();
    if (s.includes("sótano 2") || s.includes("sotano 2")) return [-2, s];
    if (s.includes("sótano 1") || s.includes("sotano 1")) return [-1, s];
    if (s.includes("auditorio")) return [0, s];
    if (s.includes("mezzanine")) return [1.5, s];
    const m = s.match(/piso\s*(\d+)/);
    if (m) return [parseFloat(m[1]), s];
    return [99, s];
  }

  function sortFloorsList(arr) {
    return [...arr].sort((a, b) => {
      const ka = sortFloorKey(a), kb = sortFloorKey(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return ka[1].localeCompare(kb[1]);
    });
  }

  function buildFilterOptions(rows, apInvRows = []) {
    const uniqueSorted = (lst, key) => {
      const s = new Set();
      for (let i = 0; i < lst.length; i++) {
        const v = lst[i][key];
        if (v && v !== "--") s.add(v);
      }
      return Array.from(s).sort();
    };
    const clientFloors = new Set();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].floor && rows[i].floor !== "--") clientFloors.add(rows[i].floor);
    }
    const apFloors = new Set();
    for (let i = 0; i < apInvRows.length; i++) {
      if (apInvRows[i].floor && apInvRows[i].floor !== "--") apFloors.add(apInvRows[i].floor);
    }
    const allFloors = sortFloorsList(Array.from(new Set([...clientFloors, ...apFloors])));
    return {
      source_files: STATE.loaded_files.map((f) => f.filename),
      days: uniqueSorted(rows, "day_label"),
      aps: uniqueSorted(rows, "ap_name"),
      client_floors: sortFloorsList(Array.from(clientFloors)),
      floors: allFloors,
      bands: uniqueSorted(rows, "band"),
      protocols: uniqueSorted(rows, "protocol"),
      capabilities: uniqueSorted(rows, "capability"),
      statuses: uniqueSorted(rows, "status"),
      oses: uniqueSorted(rows, "os"),
      endpoints: uniqueSorted(rows, "endpoint_type"),
      switches: uniqueSorted(apInvRows, "switch_name"),
      rf_qualities: [
        "Excelente (>= -60 dBm)",
        "Buena (-61 a -67 dBm)",
        "Regular (-68 a -79 dBm)",
        "Crítica (< -79 dBm / Sticky)",
        "Sin señal (N/A)",
      ],
      retry_ranges: [
        { code: "0-10", label: "0% - 10% (Óptimo)" },
        { code: "11-20", label: "11% - 20% (Normal)" },
        { code: "21-24", label: "21% - 24% (Elevado)" },
        { code: "25-30", label: "25% - 30% (Alto)" },
        { code: "31-100", label: "> 30% (Crítico)" },
        { code: "20-100", label: ">= 20% (Todos con contención)" },
        { code: "25-100", label: ">= 25% (Todos en alerta SLA)" },
      ],
    };
  }

  function rowsContentFingerprint(rows) {
    if (!rows || !rows.length) return "";
    const sample = rows
      .map((r) => `${r.mac}|${r.last_seen}|${r.usage_b}|${r.ap_name}`)
      .sort();
    // FNV-1a 32-bit hash determinístico
    let h = 0x811c9dc5;
    for (let i = 0; i < sample.length; i++) {
      const s = sample[i];
      for (let j = 0; j < s.length; j++) {
        h ^= s.charCodeAt(j);
        h = Math.imul(h, 0x01000193);
      }
    }
    return `${rows.length}::${h >>> 0}`;
  }

  function buildByDayBreakdown(rowsList) {
    const byDayRows = new Map();
    for (let i = 0; i < rowsList.length; i++) {
      const r = rowsList[i];
      const dl = r.day_label || "Sin Día";
      if (!byDayRows.has(dl)) byDayRows.set(dl, []);
      byDayRows.get(dl).push(r);
    }
    const breakdown = [];
    for (const dl of Array.from(byDayRows.keys()).sort()) {
      const dRows = byDayRows.get(dl);
      const dAn = computeAnalytics(dRows, false);
      const userTrMap = {};
      for (let i = 0; i < dRows.length; i++) {
        const uid = dRows[i].user_id || "--";
        userTrMap[uid] = roundN((userTrMap[uid] || 0.0) + (dRows[i].usage_mb || 0.0), 2);
      }
      breakdown.push({
        day_label: dl,
        total_clients: dAn.kpis?.total_clients || 0,
        unique_users: dAn.kpis?.unique_users || 0,
        issue_clients_count: dAn.kpis?.issue_clients_count || 0,
        issue_users_count: dAn.kpis?.issue_users_count || 0,
        issue_users_pct: dAn.kpis?.issue_users_pct || 0,
        alert_categories_summary: dAn.alert_categories_summary || {},
        alert_users_summary: dAn.alert_users_summary || {},
        ap_summary: dAn.ap_summary || [],
        ap_failure_ranking: dAn.ap_failure_ranking || [],
        floor_client_summary: dAn.floor_client_summary || [],
        device_model_summary: dAn.device_model_summary || [],
        device_vendor_summary: dAn.device_vendor_summary || [],
        device_os_summary: dAn.device_os_summary || [],
        auth_by_os: dAn.auth_analytics?.by_os || [],
        os_dist: dAn.distributions?.os || {},
        retries_bucket: dAn.distributions?.retries_bucket || {},
        traffic_total_fmt: dAn.traffic_analytics?.total_usage_fmt || "0 B",
        traffic_total_mb: dAn.traffic_analytics?.total_usage_mb || 0,
        user_traffic_map: userTrMap,
      });
    }
    return breakdown;
  }

  function rebuildCombinedRows() {
    const apHealthMap = new Map();
    for (let i = 0; i < STATE.ap_inv_rows.length; i++) {
      apHealthMap.set(STATE.ap_inv_rows[i].ap_name, STATE.ap_inv_rows[i].health);
    }
    const allRows = [];
    let idx = 1;
    for (let f = 0; f < STATE.loaded_files.length; f++) {
      const fRows = STATE.loaded_files[f].rows || [];
      for (let i = 0; i < fRows.length; i++) {
        const r = fRows[i];
        r.id = idx++;
        r.ap_health = apHealthMap.has(r.ap_name) ? apHealthMap.get(r.ap_name) : null;
        allRows.push(r);
      }
    }
    applyOnboardingFpAndAuthSplit(allRows, STATE.exclude_ps_latency);
    STATE.rows = allRows;
    if (!STATE.loaded_files.length) STATE.filename = "Sin archivos";
    else if (STATE.loaded_files.length === 1) STATE.filename = STATE.loaded_files[0].filename;
    else STATE.filename = `${STATE.loaded_files.length} archivos CSV acumulados`;

    STATE.filter_options = buildFilterOptions(STATE.rows, STATE.ap_inv_rows);
    STATE.cached_daily_comparison = computeDailyComparison(allRows);
    STATE.cached_by_day_breakdown = buildByDayBreakdown(allRows);
  }

  function buildUnifiedResponse(filteredClientRows, params = {}) {
    const issueFilterKeys = new Set(["alert_cat", "alarm_tag", "only_issues", "retry_range", "min_retries", "max_retries"]);
    const hasIssueSubfilter = Boolean(
      params &&
        Array.from(issueFilterKeys).some(
          (k) => params[k] !== undefined && params[k] !== null && params[k] !== "" && params[k] !== "ALL" && params[k] !== "false"
        )
    );

    let baselineRows;
    let analytics;
    if (hasIssueSubfilter) {
      const paramsBaseline = {};
      for (const [k, v] of Object.entries(params || {})) {
        if (!issueFilterKeys.has(k)) paramsBaseline[k] = v;
      }
      baselineRows = filterRows(STATE.rows, paramsBaseline);
      analytics = computeAnalytics(baselineRows, false);
    } else {
      baselineRows = filteredClientRows;
      analytics = computeAnalytics(filteredClientRows, false);
    }

    analytics.baseline_floor_summary = analytics.floor_client_summary || [];
    analytics.baseline_ap_summary = analytics.ap_summary || [];
    analytics.baseline_alert_categories = analytics.alert_categories_summary || {};
    analytics.baseline_issue_clients_count = analytics.kpis?.issue_clients_count || 0;
    analytics.baseline_total_clients = analytics.kpis?.total_clients || 0;
    analytics.day_ap_summary = analytics.ap_summary || [];
    analytics.day_floor_summary = analytics.floor_client_summary || [];

    const paramsForDaily = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (k !== "day_label" && k !== "source_file" && k !== "exclude_ps_latency" && !issueFilterKeys.has(k)) {
        if (v !== undefined && v !== null && v !== "" && v !== "ALL" && v !== "false") {
          paramsForDaily[k] = v;
        }
      }
    }
    if (Object.keys(paramsForDaily).length === 0) {
      analytics.daily_comparison = STATE.cached_daily_comparison || computeDailyComparison(STATE.rows);
      analytics.by_day_breakdown = STATE.cached_by_day_breakdown || buildByDayBreakdown(STATE.rows);
    } else {
      const rowsForDaily = filterRows(STATE.rows, paramsForDaily);
      analytics.daily_comparison = computeDailyComparison(rowsForDaily);
      analytics.by_day_breakdown = buildByDayBreakdown(rowsForDaily);
    }

    analytics.active_day_filter = params?.day_label || "ALL";
    analytics.active_floor_filter = params?.client_floor || "ALL";
    analytics.active_ap_filter = params?.ap || "ALL";
    analytics.active_corp_filter = String(params?.corp_filter || "ALL").toUpperCase();
    analytics.active_alert_cat = params?.alert_cat || "ALL";
    analytics.has_issue_subfilter = hasIssueSubfilter;
    analytics.exclude_ps_latency = STATE.exclude_ps_latency;

    let fpLat = 0, fpRet = 0, fpAuth = 0, fpDhcp = 0, fpRoam = 0, fpAny = 0;
    for (let i = 0; i < baselineRows.length; i++) {
      const r = baselineRows[i];
      if (r.is_ps_latency_fp) fpLat++;
      if (r.is_retry_fp) fpRet++;
      if (r.is_auth_fp) fpAuth++;
      if (r.is_dhcp_fp) fpDhcp++;
      if (r.is_roam_fp) fpRoam++;
      if (r.is_any_fp) fpAny++;
    }
    analytics.ps_latency_fp_count = fpAny;
    analytics.fp_breakdown = { latency: fpLat, retries: fpRet, auth: fpAuth, dhcp: fpDhcp, roam: fpRoam };

    if (hasIssueSubfilter) {
      const subAn = computeAnalytics(filteredClientRows, false);
      const paramsSubDaily = {};
      for (const [k, v] of Object.entries(params || {})) {
        if (k !== "day_label" && k !== "source_file" && v !== undefined && v !== null && v !== "" && v !== "ALL" && v !== "false") {
          paramsSubDaily[k] = v;
        }
      }
      const rowsSubDaily = filterRows(STATE.rows, paramsSubDaily);
      analytics.issue_filtered = {
        total_records: filteredClientRows.length,
        floor_client_summary: subAn.floor_client_summary || [],
        device_model_summary: subAn.device_model_summary || [],
        device_vendor_summary: subAn.device_vendor_summary || [],
        device_os_summary: subAn.device_os_summary || [],
        ap_summary: subAn.ap_summary || [],
        ap_failure_ranking: subAn.ap_failure_ranking || [],
        auth_analytics: subAn.auth_analytics || {},
        distributions: subAn.distributions || {},
        alert_categories_summary: subAn.alert_categories_summary || {},
      };
      analytics.issue_filtered_by_day = buildByDayBreakdown(rowsSubDaily);
    } else {
      analytics.issue_filtered = null;
      analytics.issue_filtered_by_day = null;
    }

    const paramsNoCorp = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (k !== "corp_filter" && !issueFilterKeys.has(k)) paramsNoCorp[k] = v;
    }
    const scopeRows = Object.keys(paramsNoCorp).length ? filterRows(STATE.rows, paramsNoCorp) : STATE.rows;
    const allUSet = new Set(), corpUSet = new Set(), extUSet = new Set();
    let corpCnt = 0, extCnt = 0;
    for (let i = 0; i < scopeRows.length; i++) {
      const r = scopeRows[i];
      if (r.user_id && r.user_id !== "--") allUSet.add(r.user_id);
      if (isCorporateHostname(r.hostname)) {
        corpCnt++;
        if (r.user_id && r.user_id !== "--") corpUSet.add(r.user_id);
      } else {
        extCnt++;
        if (r.user_id && r.user_id !== "--") extUSet.add(r.user_id);
      }
    }
    analytics.corp_breakdown = {
      all_clients: scopeRows.length,
      all_users: allUSet.size,
      corp_clients: corpCnt,
      corp_users: corpUSet.size,
      ext_clients: extCnt,
      ext_users: extUSet.size,
    };

    analytics.filename = STATE.filename;
    analytics.loaded_files = STATE.loaded_files.map((f) => ({
      filename: f.filename,
      day_label: f.day_label || (f.rows[0]?.day_label || f.filename),
      count: f.rows.length,
    }));
    analytics.unfiltered_total = STATE.rows.length;
    analytics.filter_options = STATE.filter_options;
    analytics.ap_inventory = { filename: STATE.ap_inv_filename, total_aps: 0, unfiltered_total: 0 };
    analytics.correlation = {};
    return analytics;
  }

  // Persistencia IndexedDB en el navegador de cualquier PC
  const IDB_NAME = "CiscoWiFiAnalyzerPortableDB_v1";
  const IDB_STORE = "csv_state";

  function openIdb() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function saveStateToIdb() {
    const db = await openIdb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(
        {
          saved_at: Date.now(),
          loaded_files: STATE.loaded_files.map((f) => ({
            filename: f.filename,
            day_label: f.day_label,
            rows: f.rows,
          })),
        },
        "active_workspace"
      );
    } catch (_) {}
  }

  async function loadStateFromIdb() {
    const db = await openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get("active_workspace");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function decodeGzipBase64Json(b64Str) {
    if (!b64Str) return null;
    const binStr = atob(b64Str);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    if (typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }
    return null;
  }

  function hydrateLoadedFilesFromCacheObj(cachedObj) {
    const cFiles = cachedObj?.loaded_files || [];
    const cRows = cachedObj?.clients || [];
    const outFiles = [];
    if (cFiles.length && cRows.length) {
      const rowsByFile = new Map();
      for (let i = 0; i < cRows.length; i++) {
        const r = recomputeRowIssues({ ...cRows[i] }, STATE.exclude_ps_latency);
        const sf = r.source_file || cFiles[0].filename;
        if (!rowsByFile.has(sf)) rowsByFile.set(sf, []);
        rowsByFile.get(sf).push(r);
      }
      const seenSigs = new Set();
      for (let i = 0; i < cFiles.length; i++) {
        const fname = cFiles[i].filename;
        const frows = rowsByFile.get(fname) || [];
        if (frows.length) {
          const sig = rowsContentFingerprint(frows);
          if (sig && seenSigs.has(sig)) continue;
          seenSigs.add(sig);
          outFiles.push({
            filename: fname,
            day_label: cFiles[i].day_label || frows[0].day_label || fname,
            rows: frows,
          });
        }
      }
    }
    return outFiles;
  }

  let initPromise = null;
  function ensurePortableInitialized() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      // 1. Preparar respaldo embebido (los CSVs actuales comprimidos dentro del HTML)
      if (typeof window !== "undefined" && typeof window.__PORTABLE_SEED_GZIP_B64__ === "string" && window.__PORTABLE_SEED_GZIP_B64__.length > 0) {
        try {
          const seedObj = await decodeGzipBase64Json(window.__PORTABLE_SEED_GZIP_B64__);
          if (seedObj) {
            STATE.seed_files_backup = hydrateLoadedFilesFromCacheObj(seedObj);
          }
        } catch (err) {
          console.warn("No se pudo descomprimir semilla embebida:", err);
        }
      }

      // 2. Revisar si este PC ya guardó cambios/nuevos CSVs en IndexedDB
      const idbSaved = await loadStateFromIdb();
      if (idbSaved && Array.isArray(idbSaved.loaded_files)) {
        const seenSigs = new Set();
        STATE.loaded_files = [];
        for (const f of idbSaved.loaded_files) {
          if (f.rows && f.rows.length) {
            const cloned = f.rows.map((r) => recomputeRowIssues({ ...r }, STATE.exclude_ps_latency));
            const sig = rowsContentFingerprint(cloned);
            if (sig && seenSigs.has(sig)) continue;
            seenSigs.add(sig);
            STATE.loaded_files.push({
              filename: f.filename,
              day_label: f.day_label || cloned[0].day_label || f.filename,
              rows: cloned,
            });
          }
        }
      } else if (STATE.seed_files_backup.length) {
        STATE.loaded_files = STATE.seed_files_backup.map((f) => ({
          filename: f.filename,
          day_label: f.day_label,
          rows: f.rows.map((r) => ({ ...r })),
        }));
      }

      rebuildCombinedRows();
    })();
    return initPromise;
  }

  // Controladores equivalentes a GET /api/data, POST /api/upload y POST /api/remove-csv
  async function handleGetData(paramsObj) {
    await ensurePortableInitialized();
    if (paramsObj && paramsObj.exclude_ps_latency !== undefined) {
      const reqExcl = String(paramsObj.exclude_ps_latency).toLowerCase() !== "false";
      if (reqExcl !== STATE.exclude_ps_latency) {
        STATE.exclude_ps_latency = reqExcl;
        for (const fobj of STATE.loaded_files) {
          for (const r of fobj.rows) recomputeRowIssues(r, reqExcl);
        }
        rebuildCombinedRows();
      }
    }
    const filteredClients = filterRows(STATE.rows, paramsObj || {});
    return buildUnifiedResponse(filteredClients, paramsObj || {});
  }

  async function handleUpload(payload) {
    await ensurePortableInitialized();
    const mode = payload?.mode || "append";
    let filesList = payload?.files;
    if (!filesList || !filesList.length) {
      filesList = [{ filename: payload?.filename || "clientes.csv", content: payload?.content || "" }];
    }

    const newFileEntries = [];
    const existingNames = mode === "append" ? new Set(STATE.loaded_files.map((f) => f.filename)) : new Set();
    const existingSigs = mode === "append" ? new Set(STATE.loaded_files.map((f) => rowsContentFingerprint(f.rows))) : new Set();
    let skippedDuplicates = 0;

    for (const item of filesList) {
      const baseName = item.filename || "clientes.csv";
      const userDay = String(item.day_label || "").trim();
      const csvText = item.content || "";
      let finalName = baseName;
      let counter = 2;
      while (existingNames.has(finalName)) {
        const dotIdx = baseName.lastIndexOf(".");
        const namePart = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName;
        const extPart = dotIdx > 0 ? baseName.slice(dotIdx) : "";
        finalName = `${namePart} (${counter})${extPart}`;
        counter++;
      }
      const parsedRows = parseCsvContent(csvText, finalName, userDay || null, 1, STATE.exclude_ps_latency);
      if (parsedRows.length > 0) {
        const sig = rowsContentFingerprint(parsedRows);
        if (sig && existingSigs.has(sig)) {
          skippedDuplicates++;
          continue;
        }
        existingSigs.add(sig);
        existingNames.add(finalName);
        const effectiveDay = userDay || parsedRows[0].day_label || finalName;
        newFileEntries.push({
          filename: finalName,
          day_label: effectiveDay,
          rows: parsedRows,
        });
      }
    }

    if (!newFileEntries.length && skippedDuplicates === 0) {
      return { error: "Ninguno de los archivos CSV seleccionados contiene registros válidos de clientes." };
    }

    if (mode === "replace") STATE.loaded_files = newFileEntries;
    else STATE.loaded_files.push(...newFileEntries);

    rebuildCombinedRows();
    await saveStateToIdb();
    return buildUnifiedResponse(STATE.rows, {});
  }

  async function handleRemoveCsv(payload) {
    await ensurePortableInitialized();
    const action = payload?.action || "remove";
    const targetFile = payload?.filename;

    if (action === "clear_all") {
      STATE.loaded_files = [];
      rebuildCombinedRows();
      await saveStateToIdb();
    } else if (action === "reset") {
      STATE.loaded_files = STATE.seed_files_backup.map((f) => ({
        filename: f.filename,
        day_label: f.day_label,
        rows: f.rows.map((r) => recomputeRowIssues({ ...r }, STATE.exclude_ps_latency)),
      }));
      rebuildCombinedRows();
      await saveStateToIdb();
    } else if (action === "rename_day" && targetFile) {
      const newDay = String(payload?.day_label || "").trim();
      if (newDay) {
        for (const f of STATE.loaded_files) {
          if (f.filename === targetFile) {
            f.day_label = newDay;
            for (const r of f.rows) r.day_label = newDay;
          }
        }
        rebuildCombinedRows();
        await saveStateToIdb();
      }
    } else if (targetFile) {
      STATE.loaded_files = STATE.loaded_files.filter((f) => f.filename !== targetFile);
      rebuildCombinedRows();
      await saveStateToIdb();
    }
    return buildUnifiedResponse(STATE.rows, {});
  }

  // Exponer API para pruebas Node y activar interceptor local en el navegador
  const PortableEngine = {
    parseCsvContent,
    computeAnalytics,
    computeDailyComparison,
    filterRows,
    applyOnboardingFpAndAuthSplit,
    recomputeRowIssues,
    handleGetData,
    handleUpload,
    handleRemoveCsv,
    _hydrateForTest(cacheObj) {
      STATE.loaded_files = hydrateLoadedFilesFromCacheObj(cacheObj);
      rebuildCombinedRows();
      return buildUnifiedResponse(STATE.rows, {});
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PortableEngine;
  }

  if (typeof window !== "undefined") {
    window.__CISCO_PORTABLE_ENGINE__ = PortableEngine;
    const origFetch = window.fetch ? window.fetch.bind(window) : null;

    window.fetch = async function (input, init) {
      const urlStr = typeof input === "string" ? input : input?.url || "";
      if (urlStr.startsWith("/api/data")) {
        const qIdx = urlStr.indexOf("?");
        const qs = qIdx >= 0 ? urlStr.slice(qIdx + 1) : "";
        const sp = new URLSearchParams(qs);
        const paramsObj = {};
        for (const [k, v] of sp.entries()) paramsObj[k] = v;
        const result = await handleGetData(paramsObj);
        return {
          ok: true,
          status: 200,
          json: async () => result,
          text: async () => JSON.stringify(result),
        };
      }
      if (urlStr.startsWith("/api/remove-csv")) {
        const bodyObj = init?.body ? JSON.parse(init.body) : {};
        const result = await handleRemoveCsv(bodyObj);
        return {
          ok: !result.error,
          status: result.error ? 400 : 200,
          json: async () => result,
          text: async () => JSON.stringify(result),
        };
      }
      if (urlStr.startsWith("/api/upload-ap-csv")) {
        const result = await handleGetData({});
        return {
          ok: true,
          status: 200,
          json: async () => result,
          text: async () => JSON.stringify(result),
        };
      }
      if (urlStr.startsWith("/api/upload")) {
        const bodyObj = init?.body ? JSON.parse(init.body) : {};
        const result = await handleUpload(bodyObj);
        return {
          ok: !result.error,
          status: result.error ? 400 : 200,
          json: async () => result,
          text: async () => JSON.stringify(result),
        };
      }
      if (origFetch) return origFetch(input, init);
      throw new Error("Recurso externo no disponible offline: " + urlStr);
    };

    // Sobrescribir postJsonWithProgress tras cargar app.js para que /api/upload funcione en file:///
    window.__PORTABLE_POST_JSON__ = async function (url, payloadObj, onUploadProgress) {
      if (onUploadProgress) onUploadProgress(0.6);
      if (url.startsWith("/api/upload")) {
        const res = await handleUpload(payloadObj);
        if (onUploadProgress) onUploadProgress(1.0);
        if (res && res.error) throw new Error(res.error);
        return res;
      }
      if (url.startsWith("/api/remove-csv")) {
        const res = await handleRemoveCsv(payloadObj);
        if (onUploadProgress) onUploadProgress(1.0);
        if (res && res.error) throw new Error(res.error);
        return res;
      }
      throw new Error("Ruta no soportada en modo portable: " + url);
    };
  }
})();
