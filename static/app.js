let charts = {};
let currentData = null;
let filtersInitialized = false;
let chartCompareDaysMode = false;
let compareDayA = "";
let compareDayB = "";
let apFailuresCompareView = "by_day";
let floorAlertsCompareView = "by_day";
let showAlertChartUsers = true;
let showAlertChartPct = false;
let showAlertChartTraffic = true;
let compareAlertMetric = "issues"; // "issues" | "users" | "traffic"
let authFloorMetricFilter = "auth";
let excludePsLatency = true;
let topClientsChartMetric = "auto"; // "auto" | "count" | "severity"
let deviceAlertGroupMode = "model"; // "model" | "vendor" | "os"

function setTopClientsChartMetric(mode) {
  topClientsChartMetric = mode || "auto";
  if (currentData) renderClientProblemFocus(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function setDeviceAlertGroupMode(mode) {
  deviceAlertGroupMode = mode || "model";
  if (currentData) renderClientProblemFocus(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function quickFilterAlertClientsTable(term) {
  const inp = document.getElementById("alert-related-clients-search");
  if (!inp) return;
  const cleanTerm = String(term || "").trim();
  const prev = inp.value.trim();
  inp.value = prev && prev.toLowerCase() === cleanTerm.toLowerCase() ? "" : cleanTerm;
  filterAlertRelatedClientsInstant(inp.value);
  const box = document.getElementById("alert-related-clients-box");
  if (box) {
    box.open = true;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function toggleExcludePsLatency(checked) {
  excludePsLatency = Boolean(checked);
  document.querySelectorAll(".chk-exclude-ps-latency").forEach((el) => {
    el.checked = excludePsLatency;
  });
  fetchData();
}

function syncPsLatencyCheckboxUi(data) {
  if (data && typeof data.exclude_ps_latency === "boolean") {
    excludePsLatency = data.exclude_ps_latency;
  }
  const fpCnt = data?.ps_latency_fp_count ?? 0;
  const bd = data?.fp_breakdown || {};
  const tipText = `Falsos positivos omitidos -> Latencia Power-Save: ${bd.latency ?? 0} • Retries desc./PS/dupl.: ${bd.retries ?? 0} • Auth históricos/desc.: ${bd.auth ?? 0} • DHCP históricos/backoff 4s: ${bd.dhcp ?? 0} • Roaming históricos/ascensor: ${bd.roam ?? 0}. Desmarca para volver al conteo crudo.`;
  document.querySelectorAll(".chk-exclude-ps-latency").forEach((el) => {
    el.checked = excludePsLatency;
    if (el.parentElement) el.parentElement.title = tipText;
  });
  document.querySelectorAll(".lbl-exclude-ps-latency").forEach((el) => {
    el.innerHTML = excludePsLatency
      ? `Omitir falsos positivos (Power-Save / Desc. / Históricos) <span class="px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-200 border border-teal-500/40 text-[10px] font-extrabold">${fpCnt} omitidos</span>`
      : `Omitir falsos positivos (Power-Save / Desc. / Históricos) <span class="px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-200 border border-amber-400/50 text-[10px] font-extrabold">Desactivado (+${fpCnt} incluidos)</span>`;
  });
}

function toggleAlertChartLayer(layer) {
  if (layer === "users") showAlertChartUsers = !showAlertChartUsers;
  if (layer === "pct") showAlertChartPct = !showAlertChartPct;
  if (layer === "traffic") showAlertChartTraffic = !showAlertChartTraffic;
  if (currentData) {
    renderClientProblemFocus(currentData);
    renderBusyApsSection(currentData);
  }
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function setCompareAlertMetric(metric) {
  compareAlertMetric = metric || "issues";
  floorAlertsCompareView = "by_day";
  apFailuresCompareView = "by_day";
  if (currentData) renderClientProblemFocus(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}
let busyApsMetricFilter = "all";
let busyApsCorrMetricFilter = "all";

function setApFailuresCompareView(mode) {
  apFailuresCompareView = mode === "by_alert" ? "by_alert" : "by_day";
  if (currentData) renderClientProblemFocus(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function setFloorAlertsCompareView(mode) {
  floorAlertsCompareView = mode === "by_alert" ? "by_alert" : "by_day";
  if (currentData) renderClientProblemFocus(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function setAuthFloorMetricFilter(mode) {
  authFloorMetricFilter = mode || "auth";
  if (currentData) renderAuthAnalyticsSection(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function setBusyApsMetricFilter(mode) {
  busyApsMetricFilter = mode || "all";
  if (currentData) renderBusyApsSection(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function setBusyApsCorrMetricFilter(mode) {
  busyApsCorrMetricFilter = mode || "auth";
  if (currentData) renderBusyApsSection(currentData);
  if (activeSpotlightCard) requestAnimationFrame(() => refreshActiveSpotlightChart());
}

function swapCompareDays() {
  if (!currentData) return;
  const [dA, dB] = ensureValidComparePair(currentData);
  if (!dA || !dB || dA === dB) return;
  applyTwoDayComparison(dB, dA);
}

const DAY_PALETTE = [
  // Día 1 (Familia AZUL PURO): Barra Azul Rey | Recta Azul Eléctrico (#00b0ff) | Punteada Azul Hielo (#bae6fd)
  {
    bar: "rgba(37, 99, 235, 0.84)",
    barSoft: "rgba(37, 99, 235, 0.42)",
    border: "#3b82f6",
    borderSoft: "rgba(96, 165, 250, 0.78)",
    line: "#00b0ff",
    line2: "#bae6fd",
    pt1: "circle",
    pt1Border: "#ffffff",
    pt2: "rect",
    pt2Border: "#bae6fd",
  },
  // Día 2 (Familia VERDE PURO): Barra Verde Hoja | Recta Verde Brillante (#00e676) | Punteada Verde Lima Claro (#bef264)
  {
    bar: "rgba(22, 163, 74, 0.84)",
    barSoft: "rgba(22, 163, 74, 0.42)",
    border: "#22c55e",
    borderSoft: "rgba(74, 222, 128, 0.78)",
    line: "#00e676",
    line2: "#bef264",
    pt1: "triangle",
    pt1Border: "#ffffff",
    pt2: "rectRot",
    pt2Border: "#bef264",
  },
  {
    bar: "rgba(147, 51, 234, 0.82)",
    barSoft: "rgba(147, 51, 234, 0.40)",
    border: "#c084fc",
    borderSoft: "rgba(192, 132, 252, 0.75)",
    line: "#c084fc",
    line2: "#f3e8ff",
    pt1: "circle",
    pt1Border: "#ffffff",
    pt2: "rect",
    pt2Border: "#f3e8ff",
  },
  {
    bar: "rgba(217, 119, 6, 0.82)",
    barSoft: "rgba(217, 119, 6, 0.40)",
    border: "#fbbf24",
    borderSoft: "rgba(251, 191, 36, 0.75)",
    line: "#fbbf24",
    line2: "#fef08a",
    pt1: "triangle",
    pt1Border: "#ffffff",
    pt2: "rectRot",
    pt2Border: "#fef08a",
  },
];

function createLegendSwatchCanvas(ds, isHidden) {
  const c = document.createElement("canvas");
  c.width = 34;
  c.height = 14;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.globalAlpha = isHidden ? 0.35 : 1;

  if (ds.type === "line") {
    const color = ds.borderColor || "#38bdf8";
    const isDotted = Array.isArray(ds.borderDash) && ds.borderDash.length > 0;
    ctx.save();
    ctx.strokeStyle = color;
    if (isDotted) {
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.setLineDash([1.5, 6.2]);
      ctx.beginPath();
      ctx.moveTo(2, 7);
      ctx.lineTo(32, 7);
      ctx.stroke();
    } else {
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(1, 7);
      ctx.lineTo(33, 7);
      ctx.stroke();
    }
    ctx.restore();

    // Marcador central: relleno para rectas, hueco (#0f172a) para punteadas
    const pt = ds.pointStyle || "circle";
    const ptFill = ds.pointBackgroundColor || color;
    const ptBorder = ds.pointBorderColor || "#ffffff";
    ctx.save();
    ctx.fillStyle = ptFill;
    ctx.strokeStyle = ptBorder;
    ctx.lineWidth = isDotted ? 2 : 1.3;
    ctx.beginPath();
    if (pt === "triangle") {
      ctx.moveTo(17, 2);
      ctx.lineTo(21.8, 11);
      ctx.lineTo(12.2, 11);
      ctx.closePath();
    } else if (pt === "rect") {
      ctx.rect(13.2, 3.2, 7.6, 7.6);
    } else if (pt === "rectRot") {
      ctx.moveTo(17, 1.8);
      ctx.lineTo(22.2, 7);
      ctx.lineTo(17, 12.2);
      ctx.lineTo(11.8, 7);
      ctx.closePath();
    } else {
      ctx.arc(17, 7, 4.1, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else {
    // Barra redondeada bien diferenciada (Azul Día 1 vs Verde Día 2)
    const fill = typeof ds.backgroundColor === "string" ? ds.backgroundColor : "rgba(37,99,235,0.6)";
    const stroke = typeof ds.borderColor === "string" ? ds.borderColor : fill;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(6, 2, 22, 10, 2.5);
    } else {
      ctx.rect(6, 2, 22, 10);
    }
    ctx.fill();
    ctx.stroke();
  }
  return c;
}

function buildComboLegendOptions(fontSize = 9.5) {
  return {
    labels: {
      color: "#e2e8f0",
      font: { size: fontSize, weight: "600" },
      usePointStyle: true,
      boxWidth: 34,
      boxHeight: 14,
      padding: 12,
      generateLabels: (chart) => {
        const base = Chart.defaults.plugins.legend.labels.generateLabels(chart);
        return base.map((item) => {
          const ds = chart.data.datasets[item.datasetIndex] || {};
          return {
            ...item,
            pointStyle: createLegendSwatchCanvas(ds, item.hidden),
          };
        });
      },
    },
  };
}

function ensureValidComparePair(data) {
  const daysArr = (data?.daily_comparison?.days || data?.by_day_breakdown || []).map((d) => d.day_label);
  if (daysArr.length < 2) return ["", ""];

  const activeDay = data?.active_day_filter || document.getElementById("filter-day-label")?.value || "ALL";
  if (activeDay !== "ALL" && activeDay.includes(",")) {
    const parts = activeDay
      .split(",")
      .map((s) => s.trim())
      .filter((s) => daysArr.includes(s));
    if (parts.length === 2 && parts[0] !== parts[1]) {
      compareDayA = parts[0];
      compareDayB = parts[1];
      return [compareDayA, compareDayB];
    }
  }

  if (!daysArr.includes(compareDayA) || !daysArr.includes(compareDayB) || compareDayA === compareDayB) {
    compareDayA = daysArr[daysArr.length - 2];
    compareDayB = daysArr[daysArr.length - 1];
  }
  return [compareDayA, compareDayB];
}

function applyTwoDayComparison(dA, dB) {
  if (!dA || !dB || dA === dB) return;
  compareDayA = dA;
  compareDayB = dB;
  chartCompareDaysMode = true;
  setDayFilterValue(`${dA},${dB}`);
  fetchData();
}

function onSelectCompareDay(slot, chosenDay) {
  const daysArr = (currentData?.daily_comparison?.days || currentData?.by_day_breakdown || []).map((d) => d.day_label);
  if (daysArr.length < 2 || !chosenDay) return;
  let [dA, dB] = ensureValidComparePair(currentData);

  if (slot === "A") {
    const prevA = dA;
    dA = chosenDay;
    if (dB === dA) {
      dB = prevA && prevA !== dA ? prevA : daysArr.find((d) => d !== dA) || dB;
    }
  } else {
    const prevB = dB;
    dB = chosenDay;
    if (dA === dB) {
      dA = prevB && prevB !== dB ? prevB : daysArr.find((d) => d !== dB) || dA;
    }
  }
  applyTwoDayComparison(dA, dB);
}

let lastSelectedSingleDay = "";

function activateSingleDayMode() {
  const daysArr = (currentData?.daily_comparison?.days || currentData?.by_day_breakdown || []).map(
    (d) => d.day_label
  );
  if (!daysArr.length) return;
  const chosen =
    lastSelectedSingleDay && daysArr.includes(lastSelectedSingleDay)
      ? lastSelectedSingleDay
      : daysArr[daysArr.length - 1];
  filterByDayLabel(chosen);
}

function activateTwoDayComparison() {
  const [dA, dB] = ensureValidComparePair(currentData);
  if (!dA || !dB || dA === dB) return;
  applyTwoDayComparison(dA, dB);
}

function toggleChartCompareDaysMode(enableCompare) {
  if (enableCompare) {
    activateTwoDayComparison();
    return;
  }
  filterByDayLabel("ALL");
}

function getComparisonDays(data) {
  const allBreakdowns = data?.by_day_breakdown || [];
  if (allBreakdowns.length < 2) return [];
  const activeDay = data?.active_day_filter || document.getElementById("filter-day-label")?.value || "ALL";

  // Solo comparar cuando el filtro activo tiene exactamente 2 días ("Día1,Día2").
  // Si está en "ALL" (Acumulado Total) o en 1 solo día, no dividir en comparación.
  if (activeDay === "ALL" || !activeDay.includes(",")) return [];

  const parts = activeDay
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 2 || parts[0] === parts[1]) return [];

  const mapByDay = new Map(allBreakdowns.map((d) => [d.day_label, d]));
  const objA = mapByDay.get(parts[0]);
  const objB = mapByDay.get(parts[1]);
  if (objA && objB) {
    compareDayA = parts[0];
    compareDayB = parts[1];
    return [objA, objB];
  }
  return [];
}

const ALARM_CHART_SPECS = {
  "Retransmisiones Altas (>=25%)": {
    short: "Retries >= 25%",
    floorAlertKey: "retries",
    apField: "high_retry_clients",
    autoFloorMode: "retries",
    color: "rgba(244, 63, 94, 0.72)",
    border: "#fb7185",
    formatMetric: (o) => `Retries Promedio: ${o?.avg_retries ?? 0}%`,
  },
  "Auth 802.1X: Red / ISE (>=6s)": {
    short: "Auth ISE / Red >= 6s",
    floorAlertKey: "auth_slow",
    apField: "slow_auth_clients",
    autoFloorMode: "auth",
    color: "rgba(168, 85, 247, 0.75)",
    border: "#c084fc",
    formatMetric: (o) => `Demora Auth ISE/Red Prom: ${o?.avg_auth_ms ?? 0} ms`,
  },
  "Auth 802.1X: Espera Suplicante (>=6s)": {
    short: "Espera Suplicante >= 6s",
    floorAlertKey: "auth_supplicant",
    apField: "supplicant_auth_clients",
    autoFloorMode: "auth",
    color: "rgba(236, 72, 153, 0.75)",
    border: "#f472b6",
    formatMetric: (o) => `Espera Suplicante Prom: ${o?.avg_auth_ms ?? 0} ms`,
  },
  "Asociación Lenta (>2s)": {
    short: "Asociación > 2s",
    floorAlertKey: "assoc_slow",
    apField: "slow_assoc_clients",
    autoFloorMode: "assoc",
    color: "rgba(16, 185, 129, 0.72)",
    border: "#34d399",
    formatMetric: (o) => `Demora Asociación Prom: ${o?.avg_assoc_ms ?? 0} ms`,
  },
  "DHCP Lento (>2s)": {
    short: "DHCP > 2s",
    floorAlertKey: "dhcp_slow",
    apField: "slow_dhcp_clients",
    autoFloorMode: "dhcp",
    color: "rgba(14, 165, 233, 0.72)",
    border: "#38bdf8",
    formatMetric: (o) => `Demora DHCP Prom: ${o?.avg_dhcp_ms ?? 0} ms`,
  },
  "Roaming Lento (>3s)": {
    short: "Roaming > 3s",
    floorAlertKey: "roam_slow",
    apField: "slow_roam_clients",
    autoFloorMode: "roam",
    color: "rgba(99, 102, 241, 0.72)",
    border: "#818cf8",
    formatMetric: (o) => `Demora Roaming Prom: ${o?.avg_roam_ms ?? 0} ms`,
  },
  "Latencia QoS Alta (Voz/Datos)": {
    short: "Latencia Voz/Datos",
    floorAlertKey: "latency",
    apField: "high_latency_clients",
    autoFloorMode: "latency",
    color: "rgba(245, 158, 11, 0.72)",
    border: "#fbbf24",
    formatMetric: (o) => `Latencia Datos Prom: ${o?.avg_be_lat ?? 0} ms`,
  },
  "Señal RF Débil / Sticky": {
    short: "Señal Débil <-79dBm",
    floorAlertKey: "rf_signal",
    apField: "sticky_clients",
    autoFloorMode: "rf",
    color: "rgba(20, 184, 166, 0.72)",
    border: "#2dd4bf",
    formatMetric: (o) => `Señal RSSI Prom: ${o?.avg_rssi ?? 0} dBm`,
  },
};

function getActiveAlarmSpec(data) {
  const cat =
    data?.active_alert_cat ||
    document.getElementById("filter-alert-cat")?.value ||
    "ALL";
  if (!cat || cat === "ALL") return null;
  return ALARM_CHART_SPECS[cat] ? { fullCat: cat, ...ALARM_CHART_SPECS[cat] } : null;
}

function getSubComparisonDays(data, compDays) {
  if (!compDays || compDays.length < 2) return [];
  if (!data?.has_issue_subfilter || !Array.isArray(data?.issue_filtered_by_day)) {
    return compDays;
  }
  const subMap = new Map(data.issue_filtered_by_day.map((d) => [d.day_label, d]));
  return compDays.map(
    (d) =>
      subMap.get(d.day_label) || {
        day_label: d.day_label,
        total_clients: 0,
        unique_users: 0,
        issue_clients_count: 0,
        alert_categories_summary: {},
        ap_summary: [],
        ap_failure_ranking: [],
        floor_client_summary: [],
        auth_by_os: [],
        os_dist: {},
        retries_bucket: {},
      }
  );
}

function buildFloorByDaySeries(compDays, fallbackFloors) {
  if (!compDays || compDays.length < 2) {
    return (fallbackFloors || []).map((f) => ({
      ...f,
      displayLabel: f.floor,
    }));
  }
  const floorNames = [];
  const seen = new Set();
  compDays.forEach((d) => {
    (d.floor_client_summary || []).forEach((f) => {
      if (!seen.has(f.floor)) {
        seen.add(f.floor);
        floorNames.push(f.floor);
      }
    });
  });
  const items = [];
  floorNames.forEach((flName) => {
    compDays.forEach((d) => {
      const fObj = (d.floor_client_summary || []).find((x) => x.floor === flName);
      if (fObj) {
        items.push({
          ...fObj,
          day_label: d.day_label,
          displayLabel: `${flName} (${d.day_label})`,
        });
      }
    });
  });
  return items;
}

let activeSpotlightCard = null;
let spotlightPlaceholder = null;
let registeredChartCards = [];

function initChartSpotlight() {
  const canvases = document.querySelectorAll("canvas[id^='chart-']");
  canvases.forEach((canvas) => {
    const canvasWrap = canvas.parentElement;
    if (!canvasWrap || canvasWrap.classList.contains("hidden")) return;
    const card = canvasWrap.parentElement;
    if (!card || card.id === "chart-spotlight-slot") return;

    if (!registeredChartCards.includes(card)) {
      registeredChartCards.push(card);
    }
    if (card.dataset.zoomBound === "1") return;
    card.dataset.zoomBound = "1";
    card.classList.add("chart-zoomable-card");

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className =
      "btn-expand-chart shrink-0 w-6 h-5 rounded bg-slate-800/90 hover:bg-sky-500/30 text-sky-300 border border-sky-500/35 text-[10px] font-bold flex items-center justify-center";
    expandBtn.title = "Ampliar gráfica";
    expandBtn.innerHTML = `<i class="fa-solid fa-expand text-[10px]"></i>`;

    const firstEl = card.firstElementChild;
    if (firstEl && firstEl !== canvasWrap) {
      if (firstEl.tagName === "DIV") {
        if (firstEl.children.length >= 2) {
          const rightSide = firstEl.lastElementChild;
          const rightGroup = document.createElement("div");
          rightGroup.className = "flex items-center gap-1 ml-auto";
          firstEl.insertBefore(rightGroup, rightSide);
          rightGroup.appendChild(rightSide);
          rightGroup.appendChild(expandBtn);
        } else {
          expandBtn.classList.add("ml-auto");
          firstEl.appendChild(expandBtn);
        }
      } else if (firstEl.tagName === "H4") {
        const headerWrap = document.createElement("div");
        headerWrap.className = "flex items-start justify-between gap-2 mb-1";
        firstEl.classList.remove("mb-1", "mb-2");
        card.insertBefore(headerWrap, firstEl);
        headerWrap.appendChild(firstEl);
        headerWrap.appendChild(expandBtn);
      }
    }

    card.addEventListener(
      "click",
      (evt) => {
        if (activeSpotlightCard === card) return;
        if (evt.target.closest("button:not(.btn-expand-chart), select, input, a, label")) {
          return;
        }
        evt.stopPropagation();
        evt.preventDefault();
        openChartSpotlight(card);
      },
      true
    );
  });
}

function applySpotlightChartFonts(chart, enlarge) {
  if (!chart || !chart.options) return;
  if (enlarge) {
    if (!chart._origSpotlightFonts) {
      const legLabels = chart.options.plugins?.legend?.labels || {};
      const scalesSnap = {};
      Object.entries(chart.options.scales || {}).forEach(([k, sc]) => {
        scalesSnap[k] = {
          tickSize: sc?.ticks?.font?.size,
          titleSize: sc?.title?.font?.size,
        };
      });
      chart._origSpotlightFonts = {
        legendSize: legLabels.font?.size,
        legendBoxWidth: legLabels.boxWidth,
        scales: scalesSnap,
      };
    }
    if (chart.options.plugins?.legend?.labels) {
      chart.options.plugins.legend.labels.font = {
        ...(chart.options.plugins.legend.labels.font || {}),
        size: 12.5,
      };
      if (chart.options.plugins.legend.labels.boxWidth) {
        chart.options.plugins.legend.labels.boxWidth = Math.max(
          chart._origSpotlightFonts.legendBoxWidth || 14,
          14
        );
      }
    }
    Object.values(chart.options.scales || {}).forEach((sc) => {
      if (!sc) return;
      sc.ticks = sc.ticks || {};
      sc.ticks.font = { ...(sc.ticks.font || {}), size: 12 };
      if (sc.title) {
        sc.title.font = { ...(sc.title.font || {}), size: 12.5 };
      }
    });
  } else if (chart._origSpotlightFonts) {
    const snap = chart._origSpotlightFonts;
    if (chart.options.plugins?.legend?.labels) {
      if (snap.legendSize !== undefined) {
        chart.options.plugins.legend.labels.font = {
          ...(chart.options.plugins.legend.labels.font || {}),
          size: snap.legendSize,
        };
      }
      if (snap.legendBoxWidth !== undefined) {
        chart.options.plugins.legend.labels.boxWidth = snap.legendBoxWidth;
      }
    }
    Object.entries(snap.scales || {}).forEach(([k, sSnap]) => {
      const sc = chart.options.scales?.[k];
      if (!sc) return;
      if (sc.ticks && sSnap.tickSize !== undefined) {
        sc.ticks.font = { ...(sc.ticks.font || {}), size: sSnap.tickSize };
      }
      if (sc.title && sSnap.titleSize !== undefined) {
        sc.title.font = { ...(sc.title.font || {}), size: sSnap.titleSize };
      }
    });
    delete chart._origSpotlightFonts;
  }
}

function refreshActiveSpotlightChart() {
  if (!activeSpotlightCard) return;
  const canvas = activeSpotlightCard.querySelector("canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const chart = Chart.getChart(canvas);
  if (!chart) return;
  applySpotlightChartFonts(chart, true);
  chart.resize();
  chart.update("none");
}

function restoreSpotlightCardOnly() {
  if (!activeSpotlightCard) return;
  const card = activeSpotlightCard;
  const canvas = card.querySelector("canvas");
  const canvasWrap = canvas ? canvas.parentElement : null;
  if (canvasWrap) {
    canvasWrap.style.height = card._origWrapHeight || "";
    canvasWrap.style.minHeight = card._origWrapMinHeight || "";
  }
  const h4 = card.querySelector("h4");
  if (h4 && card._bumpedTitle) {
    h4.classList.remove("text-base", "sm:text-lg");
    h4.classList.add("text-xs");
    card._bumpedTitle = false;
  }
  if (spotlightPlaceholder && spotlightPlaceholder.parentNode) {
    spotlightPlaceholder.parentNode.insertBefore(card, spotlightPlaceholder);
    spotlightPlaceholder.remove();
  }
  spotlightPlaceholder = null;
  activeSpotlightCard = null;

  if (canvas && typeof Chart !== "undefined") {
    const chart = Chart.getChart(canvas);
    if (chart) {
      applySpotlightChartFonts(chart, false);
      requestAnimationFrame(() => {
        chart.resize();
        chart.update("none");
      });
    }
  }
}

function openChartSpotlight(card) {
  const overlay = document.getElementById("chart-spotlight-overlay");
  const slot = document.getElementById("chart-spotlight-slot");
  if (!overlay || !slot || !card) return;

  if (activeSpotlightCard && activeSpotlightCard !== card) {
    restoreSpotlightCardOnly();
  } else if (activeSpotlightCard === card) {
    return;
  }

  const canvas = card.querySelector("canvas");
  const canvasWrap = canvas ? canvas.parentElement : null;
  if (!canvas || !canvasWrap) return;

  const spanClasses = [...card.classList].filter((c) => c.includes("col-span-"));
  spotlightPlaceholder = document.createElement("div");
  spotlightPlaceholder.className = [
    ...spanClasses,
    "rounded-xl border border-dashed border-sky-500/30 bg-slate-900/30",
  ].join(" ");
  spotlightPlaceholder.style.height = `${card.offsetHeight}px`;
  card.parentNode.insertBefore(spotlightPlaceholder, card);

  card._origWrapHeight = canvasWrap.style.height || "";
  card._origWrapMinHeight = canvasWrap.style.minHeight || "";
  canvasWrap.style.height = "68vh";
  canvasWrap.style.minHeight = "420px";

  const h4 = card.querySelector("h4");
  if (h4 && h4.classList.contains("text-xs")) {
    h4.classList.remove("text-xs");
    h4.classList.add("text-base", "sm:text-lg");
    card._bumpedTitle = true;
  }

  slot.appendChild(card);
  activeSpotlightCard = card;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    refreshActiveSpotlightChart();
  });
}

function closeChartSpotlight() {
  restoreSpotlightCardOnly();
  const overlay = document.getElementById("chart-spotlight-overlay");
  if (overlay) overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

function stepSpotlightChart(delta) {
  if (!activeSpotlightCard) return;
  const visibleCards = registeredChartCards.filter((c) => {
    if (c === activeSpotlightCard) return true;
    return c.offsetParent !== null;
  });
  if (visibleCards.length <= 1) return;
  const idx = visibleCards.indexOf(activeSpotlightCard);
  if (idx === -1) return;
  const nextIdx = (idx + delta + visibleCards.length) % visibleCards.length;
  openChartSpotlight(visibleCards[nextIdx]);
}

function downloadSpotlightChartPng() {
  if (!activeSpotlightCard) return;
  const canvas = activeSpotlightCard.querySelector("canvas");
  if (!canvas) return;
  const rawTitle = (activeSpotlightCard.querySelector("h4")?.innerText || "Grafica_Cisco_WiFi").trim();

  const pad = 28;
  const headerH = 52;
  const out = document.createElement("canvas");
  out.width = canvas.width + pad * 2;
  out.height = canvas.height + headerH + pad;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 18px Inter, system-ui, sans-serif";
  ctx.fillText(rawTitle, pad, 34);
  ctx.drawImage(canvas, pad, headerH);

  const safeName = rawTitle
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const link = document.createElement("a");
  link.download = `${safeName || "grafica_wifi"}.png`;
  link.href = out.toDataURL("image/png");
  link.click();
}

document.addEventListener("keydown", (evt) => {
  if (!activeSpotlightCard) return;
  if (evt.key === "Escape") {
    evt.preventDefault();
    closeChartSpotlight();
  } else if (evt.key === "ArrowLeft") {
    evt.preventDefault();
    stepSpotlightChart(-1);
  } else if (evt.key === "ArrowRight") {
    evt.preventDefault();
    stepSpotlightChart(1);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setupDashboards();
  setupFilterListeners();
  setupUploads();
  initChartSpotlight();
  fetchData();
});

function setupDashboards() {
  const buttons = document.querySelectorAll(".dash-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchDashboard(btn.dataset.dash);
    });
  });
}

function switchDashboard(dashId) {
  if (activeSpotlightCard) closeChartSpotlight();
  document.querySelectorAll(".dash-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.dash === dashId);
  });
  document.querySelectorAll(".dash-panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== dashId);
  });
}

function syncRetryChips(val) {
  document.querySelectorAll(".retry-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.retryChip === val);
  });
}

function quickFilterRetries(rangeCode) {
  switchDashboard("dash-clients");
  const sel = document.getElementById("filter-retry-range");
  if (sel) sel.value = rangeCode;
  document.getElementById("filter-retries").value = "";
  document.getElementById("filter-max-retries").value = "";
  syncRetryChips(rangeCode);
  fetchData().then(() => {
    const sec = document.getElementById("clients-table-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function quickFilterByFloor(floorName) {
  switchDashboard("dash-clients");
  const cFloor = document.getElementById("filter-client-floor");
  if (cFloor) cFloor.value = floorName;
  fetchData();
}

function quickFilterByAp(apName) {
  switchDashboard("dash-clients");
  // Limpiar piso o rangos previos para asegurar que se traigan TODOS los clientes de ese AP
  document.getElementById("filter-client-floor").value = "ALL";
  document.getElementById("filter-retry-range").value = "ALL";
  document.getElementById("filter-rf").value = "ALL";
  document.getElementById("filter-protocol").value = "ALL";
  document.getElementById("filter-os").value = "ALL";
  document.getElementById("filter-status").value = "ALL";
  document.getElementById("filter-retries").value = "";
  document.getElementById("filter-max-retries").value = "";
  document.getElementById("filter-issues").checked = false;
  const hsEl = document.getElementById("filter-hour-slot");
  if (hsEl) hsEl.value = "ALL";
  const sbEl = document.getElementById("filter-session-bucket");
  if (sbEl) sbEl.value = "ALL";
  updateTimeFilterBadges();
  syncRetryChips("ALL");

  const apSel = document.getElementById("filter-ap");
  if (apSel && [...apSel.options].some((o) => o.value === apName)) {
    apSel.value = apName;
    document.getElementById("filter-q").value = "";
  } else {
    if (apSel) apSel.value = "ALL";
    document.getElementById("filter-q").value = apName;
  }
  fetchData().then(() => {
    const sec = document.getElementById("clients-table-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function quickFilterApInventory(conditionCode) {
  switchDashboard("dash-ap-inventory");
  const condSel = document.getElementById("filter-ap-condition");
  if (condSel) {
    condSel.value = conditionCode || "ALL";
  }
  const hbEl = document.getElementById("filter-ap-health-bucket");
  if (hbEl) hbEl.value = "ALL";
  const dtEl = document.getElementById("filter-disconnect-ts");
  if (dtEl) dtEl.value = "ALL";
  const ubEl = document.getElementById("filter-uptime-bucket");
  if (ubEl) ubEl.value = "ALL";
  updateTimeFilterBadges();
  fetchData().then(() => {
    const sec = document.getElementById("ap-inv-table-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function clearClientTimeFilters() {
  const hsEl = document.getElementById("filter-hour-slot");
  if (hsEl) hsEl.value = "ALL";
  const sbEl = document.getElementById("filter-session-bucket");
  if (sbEl) sbEl.value = "ALL";
  updateTimeFilterBadges();
  fetchData();
}

function clearApTimeFilters() {
  const hbEl = document.getElementById("filter-ap-health-bucket");
  if (hbEl) hbEl.value = "ALL";
  const dtEl = document.getElementById("filter-disconnect-ts");
  if (dtEl) dtEl.value = "ALL";
  const ubEl = document.getElementById("filter-uptime-bucket");
  if (ubEl) ubEl.value = "ALL";
  updateTimeFilterBadges();
  fetchData();
}

function updateTimeFilterBadges() {
  const hs = document.getElementById("filter-hour-slot")?.value || "ALL";
  const sb = document.getElementById("filter-session-bucket")?.value || "ALL";
  const cBadge = document.getElementById("active-time-filter-badge");
  const cText = document.getElementById("active-time-filter-text");
  if (cBadge && cText) {
    const parts = [];
    if (hs !== "ALL") parts.push(`Hora: ${hs}`);
    if (sb !== "ALL") parts.push(`Sesión: ${sb}`);
    if (parts.length > 0) {
      cText.textContent = parts.join(" • ");
      cBadge.classList.remove("hidden");
      cBadge.classList.add("flex");
    } else {
      cBadge.classList.add("hidden");
      cBadge.classList.remove("flex");
    }
  }

  const hb = document.getElementById("filter-ap-health-bucket")?.value || "ALL";
  const dt = document.getElementById("filter-disconnect-ts")?.value || "ALL";
  const ub = document.getElementById("filter-uptime-bucket")?.value || "ALL";
  const apBadge = document.getElementById("active-ap-time-badge");
  const apText = document.getElementById("active-ap-time-text");
  if (apBadge && apText) {
    const parts = [];
    if (hb !== "ALL") parts.push(`Overall Health: ${hb}`);
    if (dt !== "ALL") parts.push(`Desconexión: ${dt}`);
    if (ub !== "ALL") parts.push(`Uptime: ${ub}`);
    if (parts.length > 0) {
      apText.textContent = parts.join(" • ");
      apBadge.classList.remove("hidden");
      apBadge.classList.add("flex");
    } else {
      apBadge.classList.add("hidden");
      apBadge.classList.remove("flex");
    }
  }
}

function formatApHealthBadge(healthVal) {
  if (healthVal === null || healthVal === undefined || healthVal === "--") {
    return `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold">-- Sin Health</span>`;
  }
  const h = Number(healthVal);
  if (h >= 8) {
    return `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold"><i class="fa-solid fa-heart-pulse mr-1"></i>${h}/10 Óptimo</span>`;
  }
  if (h >= 5) {
    return `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${h}/10 Regular</span>`;
  }
  return `<span class="px-2 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/50 text-[11px] font-extrabold"><i class="fa-solid fa-heart-crack mr-1"></i>${h}/10 Crítico</span>`;
}

function quickFilterByUser(userId) {
  switchDashboard("dash-clients");
  document.getElementById("filter-q").value = userId;
  fetchData().then(() => {
    const sec = document.getElementById("clients-table-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function filterByAlertCategory(catName) {
  switchDashboard("dash-clients");
  selectHierarchyIssueType(catName || "ALL");
}

function clearAlertCategoryFilter() {
  filterByAlertCategory("ALL");
}

function filterByAlarmTag(tagVal) {
  switchDashboard("dash-clients");
  const atEl = document.getElementById("filter-alarm-tag");
  if (atEl) atEl.value = tagVal || "ALL";
  const badge = document.getElementById("active-alarm-tag-badge");
  const txt = document.getElementById("active-alarm-tag-text");
  if (badge && txt) {
    if (tagVal && tagVal !== "ALL") {
      txt.textContent = `Tag Alarma: ${tagVal}`;
      badge.classList.remove("hidden");
      badge.classList.add("flex");
    } else {
      badge.classList.add("hidden");
      badge.classList.remove("flex");
    }
  }
  fetchData().then(() => {
    const sec = document.getElementById("clients-table-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function clearAlarmTagFilter() {
  filterByAlarmTag("ALL");
}

function handleInsightAction(actionType, actionVal) {
  switchDashboard("dash-clients");
  if (actionType === "retry_range") {
    quickFilterRetries(actionVal);
    return;
  }
  if (actionType === "ap_focus") {
    quickFilterByAp(actionVal);
    return;
  }
  if (actionType === "alert_cat") {
    filterByAlertCategory(actionVal);
    return;
  }
  if (actionType === "rf_quality") {
    document.getElementById("filter-rf").value = actionVal;
  } else if (actionType === "status") {
    document.getElementById("filter-status").value = actionVal;
  } else if (actionType === "slow_onb") {
    document.getElementById("filter-issues").checked = true;
  } else if (actionType === "wifi6e") {
    document.getElementById("filter-q").value = "";
  }
  fetchData().then(() => {
    const sec = document.getElementById("clients-table-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setupFilterListeners() {
  const ids = [
    "filter-q",
    "filter-day-label",
    "filter-client-floor",
    "filter-ap",
    "filter-retry-range",
    "filter-rf",
    "filter-protocol",
    "filter-os",
    "filter-status",
    "filter-retries",
    "filter-max-retries",
    "filter-issues",
    "filter-exclude-disconnected",
    "filter-ap-q",
    "filter-floor",
    "filter-switch",
    "filter-ap-condition",
    "filter-ap-alerts",
  ];
  let debounceTimer = null;
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === "INPUT" && (el.type === "text" || el.type === "number") ? "input" : "change";
    el.addEventListener(evt, () => {
      if (id === "filter-retry-range") {
        syncRetryChips(el.value);
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchData(), 160);
    });
  });

  // Listener para el filtro de Piso en Correlación (sincroniza clientes y APs)
  const corrFloor = document.getElementById("corr-filter-floor");
  if (corrFloor) {
    corrFloor.addEventListener("change", () => {
      const val = corrFloor.value;
      document.getElementById("filter-client-floor").value = val;
      document.getElementById("filter-floor").value = val;
      fetchData();
    });
  }

  // Listeners para los chips rápidos de Rango de Retransmisiones
  document.querySelectorAll(".retry-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const code = chip.dataset.retryChip;
      document.getElementById("filter-retry-range").value = code;
      document.getElementById("filter-retries").value = "";
      document.getElementById("filter-max-retries").value = "";
      syncRetryChips(code);
      fetchData();
    });
  });

  document.getElementById("btn-reset-filters").addEventListener("click", () => {
    document.getElementById("filter-q").value = "";
    const corpEl = document.getElementById("filter-corp");
    if (corpEl) corpEl.value = "ALL";
    document.getElementById("filter-client-floor").value = "ALL";
    document.getElementById("filter-ap").value = "ALL";
    document.getElementById("filter-retry-range").value = "ALL";
    document.getElementById("filter-rf").value = "ALL";
    document.getElementById("filter-protocol").value = "ALL";
    document.getElementById("filter-os").value = "ALL";
    document.getElementById("filter-status").value = "ALL";
    document.getElementById("filter-retries").value = "";
    document.getElementById("filter-max-retries").value = "";
    document.getElementById("filter-issues").checked = false;
    const exDisc = document.getElementById("filter-exclude-disconnected");
    if (exDisc) exDisc.checked = false;
    document.getElementById("filter-ap-q").value = "";
    document.getElementById("filter-floor").value = "ALL";
    document.getElementById("filter-switch").value = "ALL";
    const apCond = document.getElementById("filter-ap-condition");
    if (apCond) apCond.value = "ALL";
    document.getElementById("filter-ap-alerts").checked = false;
    const hbEl = document.getElementById("filter-ap-health-bucket");
    if (hbEl) hbEl.value = "ALL";
    const hsEl = document.getElementById("filter-hour-slot");
    if (hsEl) hsEl.value = "ALL";
    const sbEl = document.getElementById("filter-session-bucket");
    if (sbEl) sbEl.value = "ALL";
    const dtEl = document.getElementById("filter-disconnect-ts");
    if (dtEl) dtEl.value = "ALL";
    const ubEl = document.getElementById("filter-uptime-bucket");
    if (ubEl) ubEl.value = "ALL";
    const acEl = document.getElementById("filter-alert-cat");
    if (acEl) acEl.value = "ALL";
    const acSel = document.getElementById("filter-alert-cat-select");
    if (acSel) acSel.value = "ALL";
    selectedHierarchyIssueType = "ALL";
    authFloorMetricFilter = "auth";
    const acBadge = document.getElementById("active-alert-cat-badge");
    if (acBadge) {
      acBadge.classList.add("hidden");
      acBadge.classList.remove("flex");
    }
    const atEl = document.getElementById("filter-alarm-tag");
    if (atEl) atEl.value = "ALL";
    const atBadge = document.getElementById("active-alarm-tag-badge");
    if (atBadge) {
      atBadge.classList.add("hidden");
      atBadge.classList.remove("flex");
    }
    const sfEl = document.getElementById("filter-source-file");
    if (sfEl) sfEl.value = "ALL";
    const dlEl = document.getElementById("filter-day-label");
    if (dlEl) dlEl.value = "ALL";
    updateTimeFilterBadges();
    if (corrFloor) corrFloor.value = "ALL";
    syncRetryChips("ALL");
    fetchData();
  });

  document.getElementById("modal-close").addEventListener("click", () => {
    document.getElementById("client-modal").classList.add("hidden");
    document.getElementById("client-modal").classList.remove("flex");
  });
}

function showCsvStatusPanel(title, subtitle, pct, state = "loading") {
  const panel = document.getElementById("csv-upload-status-panel");
  const iconEl = document.getElementById("csv-status-icon");
  const titleEl = document.getElementById("csv-status-title");
  const subEl = document.getElementById("csv-status-subtitle");
  const pctEl = document.getElementById("csv-progress-pct");
  const barEl = document.getElementById("csv-progress-bar");
  if (!panel) return;

  panel.classList.remove("hidden");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;

  if (iconEl) {
    if (state === "loading") {
      iconEl.className = "w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300 text-sm";
      iconEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
      panel.className = "glass rounded-xl p-4 border border-sky-500/50 shadow-lg transition-all";
    } else if (state === "done") {
      iconEl.className = "w-8 h-8 rounded-lg bg-emerald-500/25 border border-emerald-500/50 flex items-center justify-center text-emerald-300 text-base";
      iconEl.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
      panel.className = "glass rounded-xl p-4 border border-emerald-500/60 bg-emerald-950/20 shadow-lg transition-all";
    } else if (state === "cleared") {
      iconEl.className = "w-8 h-8 rounded-lg bg-rose-500/25 border border-rose-500/50 flex items-center justify-center text-rose-300 text-base";
      iconEl.innerHTML = `<i class="fa-solid fa-broom"></i>`;
      panel.className = "glass rounded-xl p-4 border border-rose-500/60 bg-rose-950/20 shadow-lg transition-all";
    }
  }
}

function hideCsvStatusPanel() {
  const panel = document.getElementById("csv-upload-status-panel");
  if (panel) panel.classList.add("hidden");
}

function readFilesWithProgress(fileList, customDaysMap, onProgress) {
  const files = Array.from(fileList);
  const totalFiles = files.length;
  const results = [];

  return files.reduce((promiseChain, file, index) => {
    return promiseChain.then(
      () =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onprogress = (ev) => {
            if (ev.lengthComputable) {
              const fileRatio = ev.loaded / ev.total;
              const overallRatio = (index + fileRatio) / totalFiles;
              onProgress(overallRatio, index + 1, totalFiles, file.name);
            }
          };
          reader.onload = (ev) => {
            const chosenDay = customDaysMap && customDaysMap[index] ? customDaysMap[index] : "";
            results.push({
              filename: file.name,
              day_label: chosenDay,
              content: ev.target.result,
            });
            onProgress((index + 1) / totalFiles, index + 1, totalFiles, file.name);
            resolve();
          };
          reader.onerror = (err) => reject(err);
          reader.readAsText(file);
        })
    );
  }, Promise.resolve()).then(() => results);
}

function postJsonWithProgress(url, payloadObj, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onUploadProgress) {
        onUploadProgress(ev.loaded / ev.total);
      }
    };
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `Error HTTP ${xhr.status}`));
        }
      } catch (e) {
        reject(new Error("Respuesta inválida del servidor"));
      }
    };
    xhr.onerror = () => reject(new Error("Error de conexión con el servidor local"));
    xhr.send(JSON.stringify(payloadObj));
  });
}

let pendingUploadState = null;
const calendarStateByIdx = {};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS_SHORT_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function parseYmdParts(ymdStr) {
  const m = String(ymdStr || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return {
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10) - 1,
      day: parseInt(m[3], 10),
      ymd: `${m[1]}-${m[2]}-${m[3]}`,
    };
  }
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { year: y, month: now.getMonth(), day: now.getDate(), ymd: `${y}-${mo}-${d}` };
}

function buildVisualCalendarHtml(idx) {
  const st = calendarStateByIdx[idx];
  if (!st) return "";
  const { viewYear, viewMonth, selectedYmd } = st;
  const firstDayDate = new Date(viewYear, viewMonth, 1);
  // Lunes = 0 ... Domingo = 6
  const startOffset = (firstDayDate.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const headerCells = WEEKDAYS_SHORT_ES.map(
    (w) => `<div class="text-center text-[10px] font-bold text-slate-400 py-1">${w}</div>`
  ).join("");

  let dayCells = "";
  for (let i = 0; i < startOffset; i++) {
    dayCells += `<div class="h-8"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const cellYmd = `${viewYear}-${mm}-${dd}`;
    const isSelected = cellYmd === selectedYmd;

    dayCells += `
      <button type="button"
        onclick="selectCalendarDate(${idx}, '${cellYmd}')"
        class="h-8 rounded-lg text-xs font-bold transition flex items-center justify-center ${
          isSelected
            ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-300 scale-105"
            : "bg-slate-800/80 hover:bg-teal-500/30 text-slate-200 hover:text-emerald-200 border border-slate-700/60"
        }">
        ${d}
      </button>`;
  }

  return `
    <div class="bg-slate-950/90 border border-emerald-500/40 rounded-xl p-3 shadow-inner">
      <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
        <button type="button" onclick="shiftCalendarMonth(${idx}, -1)" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition" title="Mes anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="text-xs font-extrabold text-emerald-300 tracking-wide flex items-center gap-1.5">
          <i class="fa-regular fa-calendar"></i>
          <span>${MONTH_NAMES_ES[viewMonth]} ${viewYear}</span>
        </div>
        <button type="button" onclick="shiftCalendarMonth(${idx}, 1)" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition" title="Mes siguiente">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <div class="grid grid-cols-7 gap-1 mb-1">
        ${headerCells}
      </div>
      <div class="grid grid-cols-7 gap-1">
        ${dayCells}
      </div>
    </div>`;
}

function shiftCalendarMonth(idx, delta) {
  const st = calendarStateByIdx[idx];
  if (!st) return;
  let newMonth = st.viewMonth + delta;
  let newYear = st.viewYear;
  if (newMonth < 0) {
    newMonth = 11;
    newYear -= 1;
  } else if (newMonth > 11) {
    newMonth = 0;
    newYear += 1;
  }
  st.viewMonth = newMonth;
  st.viewYear = newYear;
  const calContainer = document.getElementById(`visual-cal-container-${idx}`);
  if (calContainer) calContainer.innerHTML = buildVisualCalendarHtml(idx);
}

function selectCalendarDate(idx, ymdStr) {
  const parts = parseYmdParts(ymdStr);
  calendarStateByIdx[idx] = {
    viewYear: parts.year,
    viewMonth: parts.month,
    selectedYmd: parts.ymd,
  };
  const calContainer = document.getElementById(`visual-cal-container-${idx}`);
  if (calContainer) calContainer.innerHTML = buildVisualCalendarHtml(idx);

  const dateInput = document.getElementById(`day-date-input-${idx}`);
  if (dateInput) dateInput.value = parts.ymd;

  const textInput = document.getElementById(`day-text-input-${idx}`);
  if (textInput) textInput.value = parts.ymd;

  const badgeEl = document.getElementById(`selected-day-badge-${idx}`);
  if (badgeEl) badgeEl.textContent = parts.ymd;
}

function renderFileCalendarCards(items) {
  const listEl = document.getElementById("day-picker-files-list") || document.getElementById("day-modal-files-list");
  if (!listEl) return;

  listEl.innerHTML = items
    .map((f, idx) => {
      const defDate = f.initialDay || inferDateFromCsvContentOrFilename(f.content, f.filename);
      const parts = parseYmdParts(defDate);
      calendarStateByIdx[idx] = {
        viewYear: parts.year,
        viewMonth: parts.month,
        selectedYmd: parts.ymd,
      };
      const kbInfo = f.content ? `${((f.content.length || 0) / 1024).toFixed(1)} KB leídos` : "Archivo cargado";

      return `
      <div class="p-4 rounded-xl bg-slate-900/95 border border-emerald-500/40 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div class="text-xs font-bold text-emerald-300 flex items-center gap-2">
            <i class="fa-solid fa-file-csv text-base"></i>
            <span>${f.filename}</span>
            <span class="text-[10px] text-slate-400 font-mono">(${kbInfo})</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-slate-400">Día seleccionado:</span>
            <span id="selected-day-badge-${idx}" class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-extrabold font-mono">${parts.ymd}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <!-- Calendario Visual Interactivo -->
          <div id="visual-cal-container-${idx}" class="md:col-span-7">
            ${buildVisualCalendarHtml(idx)}
          </div>

          <!-- Controles rápidos y Etiqueta -->
          <div class="md:col-span-5 space-y-3">
            <div>
              <label class="block text-[11px] text-teal-300 font-semibold mb-1">
                <i class="fa-solid fa-calendar-day mr-1"></i>Fecha exacta (YYYY-MM-DD):
              </label>
              <input type="date" id="day-date-input-${idx}" value="${parts.ymd}"
                onchange="selectCalendarDate(${idx}, this.value)"
                class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-teal-500/50 text-xs text-white font-mono cursor-pointer" />
            </div>

            <div>
              <label class="block text-[11px] text-amber-300 font-semibold mb-1">
                <i class="fa-solid fa-tag mr-1"></i>Etiqueta para las Gráficas por Día:
              </label>
              <input type="text" id="day-text-input-${idx}" value="${f.initialDay || parts.ymd}"
                placeholder="Ej: 2026-10-21 o Día 1 - 20MHz"
                class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-amber-500/50 text-xs text-white font-bold" />
              <p class="text-[10px] text-slate-400 mt-1">
                Al hacer clic en cualquier número del calendario de la izquierda se coloca la fecha automáticamente aquí.
              </p>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function inferDateFromCsvContentOrFilename(content, fname) {
  // 1. Buscar fecha YYYY-MM-DD en nombre de archivo
  const mFile = String(fname || "").match(/(\d{4}-\d{2}-\d{2})/);
  if (mFile) return mFile[1];

  // 2. Buscar fecha tipo "Wed Oct 21 2026" dentro de las primeras líneas del CSV
  const head = String(content || "").slice(0, 4000);
  const monthMap = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const mEng = head.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (mEng) {
    const mon = monthMap[mEng[1].toUpperCase()];
    if (mon) {
      const day = String(parseInt(mEng[2], 10)).padStart(2, "0");
      return `${mEng[3]}-${mon}-${day}`;
    }
  }

  const today = new Date();
  return today.toISOString().slice(0, 10);
}

async function prepareFilesAndOpenDayModal(fileList, mode, inputEl) {
  if (!fileList || fileList.length === 0) return;
  const totalSelected = fileList.length;

  try {
    showCsvStatusPanel(
      `Leyendo ${totalSelected} archivo(s) CSV seleccionado(s)...`,
      "Extrayendo contenido y abriendo calendario para elegir el día...",
      20,
      "loading"
    );

    const filesPayload = await readFilesWithProgress(fileList, null, (ratio, idx, total, fname) => {
      const pct = 10 + ratio * 35; // 10% -> 45%
      showCsvStatusPanel(
        `Leyendo archivo ${idx} de ${total}: ${fname}`,
        "Preparando calendario para asignación de Día...",
        pct,
        "loading"
      );
    });

    if (inputEl) inputEl.value = "";

    pendingUploadState = { type: "upload", filesPayload, mode };
    renderFileCalendarCards(filesPayload);

    showCsvStatusPanel(
      `Selecciona el Día en el Calendario emergente`,
      "Haz clic en el día del calendario y pulsa 'Confirmar Día y Cargar CSV(s)'.",
      45,
      "loading"
    );

    const modal = document.getElementById("day-picker-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  } catch (err) {
    showCsvStatusPanel("Error al leer el archivo CSV", err.message, 100, "cleared");
  }
}

function closeDayPickerModal() {
  const modal = document.getElementById("day-picker-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  pendingUploadState = null;
  hideCsvStatusPanel();
}

async function submitPreparedFilesWithDays(filesPayload, mode) {
  if (!filesPayload || filesPayload.length === 0) return;
  const totalSelected = filesPayload.length;

  try {
    showCsvStatusPanel(
      `2/3 Procesando ${totalSelected} archivo(s) CSV en el analizador...`,
      "Normalizando las 57 columnas de Cisco Catalyst Center (Pisos, APs, Auth 802.1X, Alarmas y Días)...",
      55,
      "loading"
    );

    const data = await postJsonWithProgress("/api/upload", { mode, files: filesPayload }, (upRatio) => {
      const pct = 55 + upRatio * 35; // 55% -> 90%
      showCsvStatusPanel(
        `2/3 Enviando y analizando ${totalSelected} archivo(s) CSV...`,
        "Calculando comparativa por Día, Piso, AP, Tags de Alarma Concurrentes y Tráfico...",
        pct,
        "loading"
      );
    });

    showCsvStatusPanel(
      "3/3 Actualizando gráficas y comparativa por días...",
      "Renderizando visualizaciones interactivas...",
      95,
      "loading"
    );

    const sfEl = document.getElementById("filter-source-file");
    if (sfEl) sfEl.value = "ALL";
    const dlEl = document.getElementById("filter-day-label");
    if (dlEl) dlEl.value = "ALL";
    filtersInitialized = false;
    renderAll(data);

    const namesStr = filesPayload.map((f) => `${f.filename} [Día: ${f.day_label || "Auto"}]`).join(", ");
    showCsvStatusPanel(
      `¡Carga finalizada con éxito! (${totalSelected} archivo${totalSelected > 1 ? "s" : ""} procesado${totalSelected > 1 ? "s" : ""})`,
      `Cargado: ${namesStr} • Total acumulado en el dashboard: ${data.unfiltered_total || 0} sesiones de clientes listas para comparar.`,
      100,
      "done"
    );
  } catch (err) {
    showCsvStatusPanel(
      "Error al procesar el archivo CSV",
      err.message || "Verifica el formato del archivo CSV.",
      100,
      "cleared"
    );
  }
}

function setupUploads() {
  // 1. Subida Multi-CSV Clientes (Modo Acumular / Append) -> Lee archivo y abre Modal de Selección de Día
  const appendInput = document.getElementById("csv-upload");
  if (appendInput) {
    appendInput.addEventListener("change", async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        await prepareFilesAndOpenDayModal(e.target.files, "append", e.target);
      }
    });
  }

  // 2. Subida Multi-CSV Clientes (Modo Reemplazar / Replace) -> Lee archivo y abre Modal de Selección de Día
  const replaceInput = document.getElementById("csv-upload-replace");
  if (replaceInput) {
    replaceInput.addEventListener("change", async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        await prepareFilesAndOpenDayModal(e.target.files, "replace", e.target);
      }
    });
  }

  const confirmBtn = document.getElementById("btn-confirm-day-upload");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      if (!pendingUploadState) return;

      if (pendingUploadState.type === "rename") {
        const { filename } = pendingUploadState;
        const txtInput = document.getElementById("day-text-input-0");
        const dateInput = document.getElementById("day-date-input-0");
        const newDay = (txtInput?.value || dateInput?.value || "").trim();
        const modal = document.getElementById("day-picker-modal");
        if (modal) {
          modal.classList.add("hidden");
          modal.classList.remove("flex");
        }
        pendingUploadState = null;
        if (!newDay) return;
        const res = await fetch("/api/remove-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename_day", filename, day_label: newDay }),
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        const dlEl = document.getElementById("filter-day-label");
        if (dlEl) dlEl.value = "ALL";
        filtersInitialized = false;
        renderAll(data);
        showCsvStatusPanel(
          `Día actualizado en el calendario para ${filename}`,
          `Ahora está asignado al Día: "${newDay}". Gráficas comparativas por día actualizadas.`,
          100,
          "done"
        );
        return;
      }

      const { filesPayload, mode } = pendingUploadState;
      filesPayload.forEach((fObj, idx) => {
        const txtInput = document.getElementById(`day-text-input-${idx}`);
        const dateInput = document.getElementById(`day-date-input-${idx}`);
        fObj.day_label = (txtInput?.value || dateInput?.value || fObj.day_label || "").trim();
      });
      const modal = document.getElementById("day-picker-modal");
      if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
      }
      pendingUploadState = null;
      await submitPreparedFilesWithDays(filesPayload, mode);
    });
  }

  // 3. Subida CSV Inventario APs (Opcional / Oculto)
  const apInput = document.getElementById("ap-csv-upload");
  if (apInput) {
    apInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const res = await fetch("/api/upload-ap-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content: ev.target.result }),
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        filtersInitialized = false;
        renderAll(data);
      };
      reader.readAsText(file);
    });
  }
}

function filterBySourceFile(filename) {
  const sfEl = document.getElementById("filter-source-file");
  if (sfEl) sfEl.value = filename || "ALL";
  fetchData();
}

async function clearAllCsvData() {
  showCsvStatusPanel(
    "Limpiando todos los archivos CSV cargados...",
    "Vaciando sesiones de clientes y reiniciando gráficas...",
    40,
    "loading"
  );
  try {
    const res = await fetch("/api/remove-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_all" }),
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
    const sfEl = document.getElementById("filter-source-file");
    if (sfEl) sfEl.value = "ALL";
    const dlEl = document.getElementById("filter-day-label");
    if (dlEl) dlEl.value = "ALL";
    filtersInitialized = false;
    renderAll(data);
  } finally {
    showCsvStatusPanel(
      "¡Datos borrados correctamente! (0 archivos CSV en memoria)",
      "Todos los CSV fueron eliminados. Usa '+ Subir / Acumular CSV' o 'Reemplazar' para cargar tu data.",
      100,
      "cleared"
    );
  }
}

async function removeLoadedCsv(filename, evt) {
  if (evt) evt.stopPropagation();
  const res = await fetch("/api/remove-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove", filename }),
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  const sfEl = document.getElementById("filter-source-file");
  if (sfEl && sfEl.value === filename) sfEl.value = "ALL";
  filtersInitialized = false;
  renderAll(data);
  showCsvStatusPanel(
    `Archivo eliminado: ${filename}`,
    `Quedan ${(data.loaded_files || []).length} archivo(s) CSV activos (${data.unfiltered_total || 0} sesiones en total).`,
    100,
    (data.unfiltered_total || 0) > 0 ? "done" : "cleared"
  );
}

async function resetDefaultCsv() {
  showCsvStatusPanel("Restaurando archivo CSV de ejemplo...", "Cargando datos_clientes_cisco.csv...", 50, "loading");
  const res = await fetch("/api/remove-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset" }),
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  const sfEl = document.getElementById("filter-source-file");
  if (sfEl) sfEl.value = "ALL";
  filtersInitialized = false;
  renderAll(data);
  showCsvStatusPanel(
    "¡CSV Base restaurado con éxito!",
    `Se cargó datos_clientes_cisco.csv con ${data.unfiltered_total || 0} sesiones de clientes.`,
    100,
    "done"
  );
}

function setDayFilterValue(val) {
  const dlEl = document.getElementById("filter-day-label");
  if (!dlEl) return;
  const target = val || "ALL";
  if (![...dlEl.options].some((o) => o.value === target)) {
    const opt = document.createElement("option");
    opt.value = target;
    opt.textContent = `📅 Días: ${target}`;
    dlEl.appendChild(opt);
  }
  dlEl.value = target;
}

function filterByDayLabel(dayLabel) {
  const target = dayLabel || "ALL";
  if (target !== "ALL" && !target.includes(",")) {
    lastSelectedSingleDay = target;
    chartCompareDaysMode = false;
  } else if (target === "ALL") {
    chartCompareDaysMode = false;
  } else {
    chartCompareDaysMode = true;
  }
  setDayFilterValue(target);
  fetchData();
}

function filterByCorpMode(mode) {
  const el = document.getElementById("filter-corp");
  if (el) el.value = mode || "ALL";
  fetchData();
}

function toggleDayCheckbox(dayLabel, evt) {
  if (evt) evt.stopPropagation();
  const dlEl = document.getElementById("filter-day-label");
  const currentVal = dlEl?.value || "ALL";
  const allDays = (currentData?.daily_comparison?.days || []).map((d) => d.day_label);

  let selectedArr = [];
  if (currentVal === "ALL") {
    // Al marcar una casilla estando en "Todos los Días", iniciar selección con ese primer día
    selectedArr = [dayLabel];
  } else {
    selectedArr = currentVal
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectedArr.includes(dayLabel)) {
      selectedArr = selectedArr.filter((d) => d !== dayLabel);
    } else {
      // Permitir máximo 2 días seleccionados para comparación limpia lado a lado
      if (selectedArr.length >= 2) {
        selectedArr = [selectedArr[selectedArr.length - 1], dayLabel];
      } else {
        selectedArr.push(dayLabel);
      }
    }
  }

  if (selectedArr.length === 0) {
    if (allDays.length > 2) chartCompareDaysMode = false;
    setDayFilterValue("ALL");
  } else {
    const ordered = allDays.filter((d) => selectedArr.includes(d));
    if (ordered.length === 2) {
      compareDayA = ordered[0];
      compareDayB = ordered[1];
      chartCompareDaysMode = true;
    }
    setDayFilterValue(ordered.join(","));
  }
  fetchData();
}

async function promptRenameDay(filename, currentDay, evt) {
  if (evt) evt.stopPropagation();
  pendingUploadState = { type: "rename", filename };
  renderFileCalendarCards([{ filename, initialDay: currentDay || "", content: "" }]);
  const modal = document.getElementById("day-picker-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function renderLoadedCsvChips(data) {
  const container = document.getElementById("loaded-csv-chips");
  if (!container) return;
  const loadedFiles = data.loaded_files || [];
  const activeSf = document.getElementById("filter-source-file")?.value || "ALL";

  if (loadedFiles.length === 0) {
    container.innerHTML = `<span class="px-3 py-1 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2">
      <i class="fa-solid fa-folder-minus"></i> Sin archivos CSV cargados (0 sesiones) — Sube uno o varios archivos CSV arriba
    </span>`;
    return;
  }

  const allChip = `<button type="button" onclick="filterBySourceFile('ALL')" class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
    activeSf === "ALL"
      ? "bg-emerald-600 text-white border-emerald-400 shadow"
      : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
  }">
    <i class="fa-solid fa-database"></i>
    <span>Todos Acumulados (${data.unfiltered_total || 0} filas)</span>
  </button>`;

  const fileChips = loadedFiles
    .map((f) => {
      const isSel = activeSf === f.filename;
      const safeName = f.filename.replace(/'/g, "\\'");
      const safeDay = (f.day_label || "").replace(/'/g, "\\'");
      return `<div onclick="filterBySourceFile('${safeName}')" class="cursor-pointer px-2.5 py-1 rounded-lg text-xs font-medium border transition flex items-center gap-2 ${
        isSel
          ? "bg-sky-600 text-white border-sky-300 shadow"
          : "bg-slate-900 hover:bg-slate-800 text-emerald-200 border-emerald-500/30"
      }">
        <i class="fa-solid fa-file-csv text-emerald-400"></i>
        <span>${f.filename}</span>
        <span class="px-1.5 py-0.5 rounded bg-teal-950/90 text-teal-300 border border-teal-500/30 font-semibold text-[10px]">
          <i class="fa-solid fa-calendar-day mr-0.5"></i>${f.day_label || "Auto"}
        </span>
        <span class="px-1.5 py-0.2 rounded bg-slate-950/80 text-amber-300 font-bold text-[10px]">${f.count}</span>
        <button type="button" onclick="promptRenameDay('${safeName}', '${safeDay}', event)" title="Cambiar Día de este CSV" class="text-amber-300 hover:text-white ml-0.5">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" onclick="removeLoadedCsv('${safeName}', event)" title="Quitar este archivo CSV" class="text-slate-400 hover:text-rose-400 font-bold ml-0.5">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
    })
    .join("");

  container.innerHTML = allChip + fileChips;
}

async function fetchData() {
  if (activeSpotlightCard) closeChartSpotlight();
  const params = new URLSearchParams({
    q: document.getElementById("filter-q").value,
    source_file: document.getElementById("filter-source-file")?.value || "ALL",
    day_label: document.getElementById("filter-day-label")?.value || "ALL",
    corp_filter: document.getElementById("filter-corp")?.value || "ALL",
    client_floor: document.getElementById("filter-client-floor").value,
    ap: document.getElementById("filter-ap").value,
    retry_range: document.getElementById("filter-retry-range").value,
    rf_quality: document.getElementById("filter-rf").value,
    protocol: document.getElementById("filter-protocol").value,
    os: document.getElementById("filter-os").value,
    status: document.getElementById("filter-status").value,
    min_retries: document.getElementById("filter-retries").value,
    max_retries: document.getElementById("filter-max-retries").value,
    only_issues: document.getElementById("filter-issues").checked ? "true" : "false",
    exclude_disconnected: document.getElementById("filter-exclude-disconnected")?.checked ? "true" : "false",
    exclude_ps_latency: excludePsLatency ? "true" : "false",
    hour_slot: document.getElementById("filter-hour-slot")?.value || "ALL",
    session_bucket: document.getElementById("filter-session-bucket")?.value || "ALL",
    alert_cat: document.getElementById("filter-alert-cat")?.value || "ALL",
    alarm_tag: document.getElementById("filter-alarm-tag")?.value || "ALL",
    ap_q: document.getElementById("filter-ap-q").value,
    floor: document.getElementById("filter-floor").value,
    switch: document.getElementById("filter-switch").value,
    ap_condition: document.getElementById("filter-ap-condition")
      ? document.getElementById("filter-ap-condition").value
      : "ALL",
    only_ap_alerts: document.getElementById("filter-ap-alerts").checked ? "true" : "false",
    ap_health_bucket: document.getElementById("filter-ap-health-bucket")?.value || "ALL",
    disconnect_ts: document.getElementById("filter-disconnect-ts")?.value || "ALL",
    uptime_bucket: document.getElementById("filter-uptime-bucket")?.value || "ALL",
  });
  const res = await fetch(`/api/data?${params.toString()}`);
  const data = await res.json();
  renderAll(data);
}

function populateSelect(id, items, defaultLabel) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = `<option value="ALL">${defaultLabel}</option>`;
  (items || []).forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    sel.appendChild(opt);
  });
  if ([...sel.options].some((o) => o.value === currentVal)) {
    sel.value = currentVal;
  }
}

function renderAll(data) {
  currentData = data;
  syncPsLatencyCheckboxUi(data);
  document.getElementById("active-filename").textContent = data.filename || "datos_clientes_cisco.csv";
  document.getElementById("active-count").textContent = data.total_records || 0;
  document.getElementById("total-count").textContent = data.unfiltered_total || 0;
  renderLoadedCsvChips(data);

  if (data.ap_inventory) {
    document.getElementById("active-ap-filename").textContent = data.ap_inventory.filename || "datos_inventario_aps_cisco.csv";
    document.getElementById("active-ap-count").textContent = data.ap_inventory.total_aps || 0;
    document.getElementById("total-ap-count").textContent = data.ap_inventory.unfiltered_total || 0;
  }

  if (!filtersInitialized && data.filter_options) {
    populateSelect("filter-ap", data.filter_options.aps, "Todos los APs");
    populateSelect("filter-client-floor", data.filter_options.floors, "Todos los Pisos");
    populateSelect("corr-filter-floor", data.filter_options.floors, "Todos los Pisos del Edificio");
    populateSelect("filter-rf", data.filter_options.rf_qualities, "Todas las calidades");
    populateSelect("filter-protocol", data.filter_options.protocols, "Proto");
    populateSelect("filter-os", data.filter_options.oses, "SO");
    populateSelect("filter-floor", data.filter_options.floors, "Todos los Pisos");
    populateSelect("filter-switch", data.filter_options.switches, "Todos los Switches");
    filtersInitialized = true;
  }

  // Render Dashboard Principal: Clientes & Usuarios CSV (optimizado sin renderizar pestañas ni gráficas ocultas)
  renderKPIs(data.kpis || {
    total_clients: 0,
    unique_users: 0,
    connected_pct: 0,
    not_connected_count: 0,
    unique_aps: 0,
    unique_floors: 0,
    avg_health: 0,
    total_usage_fmt: "0 B",
    total_tx_fmt: "0 B",
    total_rx_fmt: "0 B",
    avg_rssi: 0,
    avg_snr: 0,
    sticky_count: 0,
    avg_retries: 0,
    high_retry_count: 0,
    avg_onboarding_ms: 0,
    avg_auth_ms: 0,
    avg_voice_lat: 0,
  });
  renderDailyComparisonSection(data);
  renderBusyApsSection(data);
  renderHierarchyExplorer(data);
  renderClientProblemFocus(data);
  renderAuthAnalyticsSection(data);
  renderTrafficAnalyticsSection(data);
  if (data.total_records) {
    renderCharts(data);
    renderUsersSummaryTable(data.user_summary || []);
    clientTableDisplayLimit = 150;
    renderClientTable(data.clients || []);
  } else {
    ["retries", "timeHourly", "time15m", "sessionDuration"].forEach((k) =>
      destroyChart(k)
    );
    document.getElementById("table-users-summary").innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-400">Sin datos cargados o sin coincidencias para los filtros seleccionados.</td></tr>`;
    document.getElementById("table-clients-body").innerHTML = `<tr><td colspan="11" class="py-6 text-center text-slate-400">Sin datos cargados o sin coincidencias para los filtros seleccionados.</td></tr>`;
  }
  initChartSpotlight();
}

function renderCorrelation(corr) {
  if (!corr || !corr.active) return;

  const kpiCards = [
    {
      title: "Clientes Cruzados con AP en CSV 2",
      val: `${corr.matched_clients_count} / ${corr.total_clients_evaluated} Clientes`,
      desc: "Sesiones de clientes vinculadas con métricas RF, Switch y Piso del AP",
      color: "border-emerald-500/40 text-emerald-300",
      onclick: "",
    },
    {
      title: "APs Cruzados (CSV 1 ↔ CSV 2)",
      val: `${corr.matched_inv_aps_count} APs en Ambos`,
      desc: `${corr.matched_aps_count} APs totales evaluados en la matriz unificada`,
      color: "border-sky-500/40 text-sky-300",
      onclick: "",
    },
    {
      title: "Shadow APs (Fuera de CSV 2)",
      val: `${corr.shadow_aps_count} APs (${corr.shadow_clients_count} clientes)`,
      desc: "APs con usuarios activos en CSV 1 que no aparecen en el inventario CSV 2",
      color: "border-amber-500/40 text-amber-300",
      onclick: "",
    },
    {
      title: "Clientes Wi-Fi 6E en 5 GHz",
      val: `${corr.wifi6e_capable_count} Dispositivos`,
      desc: "Equipos compatibles con 6 GHz operando en 5 GHz (haz clic para ver Retries)",
      color: "border-indigo-500/40 text-indigo-300 cursor-pointer clickable-card",
      onclick: "quickFilterRetries('25-100')",
    },
  ];

  document.getElementById("corr-kpis").innerHTML = kpiCards
    .map(
      (c) => `
    <div ${c.onclick ? `onclick="${c.onclick}"` : ""} class="glass rounded-xl p-4 border transition ${c.color}">
      <div class="text-xs text-slate-400">${c.title}</div>
      <div class="text-xl font-bold text-white my-1">${c.val}</div>
      <div class="text-[11px] text-slate-400">${c.desc}</div>
    </div>`
    )
    .join("");

  const styles = {
    critical: "border-rose-500/40 bg-rose-950/20 text-rose-300",
    warning: "border-amber-500/40 bg-amber-950/20 text-amber-300",
    info: "border-indigo-500/40 bg-indigo-950/20 text-indigo-300",
  };
  document.getElementById("corr-insights").innerHTML = (corr.diagnostic_cross_insights || [])
    .map(
      (ins) => `
    <div class="p-3.5 rounded-xl border ${styles[ins.severity] || styles.info} space-y-1">
      <div class="text-xs font-bold flex items-center gap-1.5">
        <i class="fa-solid fa-bolt"></i> ${ins.title}
      </div>
      <p class="text-[11px] text-slate-300 leading-relaxed">${ins.desc}</p>
    </div>`
    )
    .join("");

  // Gráfico y Tabla: Interferencia AP vs Clientes con Retransmisiones
  const intAps = (corr.ap_int_vs_retries || []).slice(0, 12);
  destroyChart("corrIntRetries");
  const canvasInt = document.getElementById("chart-corr-int-retries");
  if (canvasInt && intAps.length) {
    charts.corrIntRetries = new Chart(canvasInt, {
      type: "bar",
      data: {
        labels: intAps.map((a) => `${a.ap_name} (${a.floor})`),
        datasets: [
          {
            label: "Interferencia 5GHz AP (%)",
            data: intAps.map((a) => a.r1_5g_int || 0),
            backgroundColor: "#a855f7",
            borderRadius: 4,
          },
          {
            label: "Retries Prom. Clientes (%)",
            data: intAps.map((a) => a.avg_client_retries || 0),
            backgroundColor: "#f43f5e",
            borderRadius: 4,
          },
          {
            label: "Clientes con Retries >= 20%",
            data: intAps.map((a) => a.high_retry_20_count || 0),
            backgroundColor: "#f59e0b",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const apObj = intAps[idx];
            if (apObj) quickFilterByAp(apObj.ap_name);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        },
      },
    });
  }

  const tbodyInt = document.getElementById("table-int-vs-retries");
  if (tbodyInt) {
    tbodyInt.innerHTML = (corr.client_int_vs_retries || [])
      .map((c) => {
        const int5g = c.ap_5g_int !== null && c.ap_5g_int !== undefined ? `${c.ap_5g_int}%` : "No en CSV2";
        const int24g = c.ap_24g_int !== null && c.ap_24g_int !== undefined ? `${c.ap_24g_int}%` : "--";
        const util5g = c.ap_5g_util !== null && c.ap_5g_util !== undefined ? `${c.ap_5g_util}%` : "--";
        return `
        <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="quickFilterByUser('${c.user_id}')">
          <td class="py-1.5 px-2">
            <div class="font-bold text-white">${c.user_id}</div>
            <div class="text-[10px] text-slate-400 font-mono">${c.mac} (${c.os})</div>
          </td>
          <td class="py-1.5 px-2">
            <div class="font-semibold text-sky-400">${c.ap_name}</div>
            <div class="text-[10px] text-emerald-300">${c.floor}</div>
          </td>
          <td class="py-1.5 px-2 text-center font-bold ${c.client_retries >= 30 ? "text-rose-400" : "text-amber-300"}">${c.client_retries}%</td>
          <td class="py-1.5 px-2 text-center text-emerald-300">${c.client_rssi} dBm <span class="text-slate-400 text-[10px]">(${c.client_snr} dB)</span></td>
          <td class="py-1.5 px-2 text-center">
            <span class="${(c.ap_5g_int || 0) >= 12 ? "text-purple-300 font-bold" : "text-slate-300"}">5G: ${int5g}</span>
            <span class="text-slate-500 text-[10px]"> / 2.4G: ${int24g}</span>
          </td>
          <td class="py-1.5 px-2 text-center ${(c.ap_5g_util || 0) >= 40 ? "text-rose-400 font-bold" : "text-slate-300"}">${util5g}</td>
          <td class="py-1.5 px-2 text-[11px] text-indigo-200">${c.cause}</td>
        </tr>`;
      })
      .join("");
  }

  // Tabla 1: Matriz de Correlación por Piso
  const tbodyFloors = document.getElementById("table-corr-floors");
  if (tbodyFloors) {
    tbodyFloors.innerHTML = (corr.floor_correlation || [])
      .map((f) => {
        const shadowBadge =
          f.shadow_aps_count > 0
            ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">${f.shadow_aps_count} (${f.shadow_aps_list.join(", ")})</span>`
            : `<span class="text-slate-500">0</span>`;
        return `
        <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="quickFilterByFloor('${f.floor}')">
          <td class="py-2 px-2.5 font-bold text-emerald-300"><i class="fa-solid fa-building mr-1 text-slate-400"></i> ${f.floor}</td>
          <td class="py-2 px-2.5 text-center font-semibold text-sky-300">${f.inv_aps} APs</td>
          <td class="py-2 px-2.5 text-center font-semibold text-emerald-300">${f.csv1_aps} APs</td>
          <td class="py-2 px-2.5 text-center text-[11px]">${shadowBadge}</td>
          <td class="py-2 px-2.5 text-center">
            <span class="text-sky-300 font-bold">Inv: ${f.inv_clients}</span> /
            <span class="text-emerald-300 font-bold">CSV1: ${f.csv1_clients}</span>
          </td>
          <td class="py-2 px-2.5 text-center ${(f.avg_5g_util || 0) >= 40 ? "text-rose-400 font-bold" : "text-slate-200"}">${f.avg_5g_util}%</td>
          <td class="py-2 px-2.5 text-center text-purple-300">${f.avg_5g_int}%</td>
          <td class="py-2 px-2.5 text-center ${(f.avg_client_retries || 0) >= 15 ? "text-amber-300 font-bold" : "text-slate-200"}">${f.avg_client_retries}%</td>
          <td class="py-2 px-2.5 text-center font-bold ${f.high_retry_25 > 0 ? "text-rose-400" : "text-slate-500"}">${f.high_retry_25}</td>
          <td class="py-2 px-2.5 text-center text-indigo-300 font-semibold">${f.wifi6e_capable}</td>
        </tr>`;
      })
      .join("");
  }

  // Tabla 2: APs Correlacionados en las 2 fuentes
  document.getElementById("table-corr-aps").innerHTML = (corr.correlated_aps || [])
    .map((a) => {
      const srcBadges = (a.sources || [])
        .map((s) => `<span class="inline-block px-1.5 py-0.5 mr-1 mb-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-[10px]">${s}</span>`)
        .join("");
      const util5g = a.r1_5g_util !== null && a.r1_5g_util !== undefined ? `${a.r1_5g_util}%` : "No en CSV2";
      const util24g = a.r0_24g_util !== null && a.r0_24g_util !== undefined ? `${a.r0_24g_util}%` : "--";
      return `
      <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="quickFilterByAp('${a.ap_name}')">
        <td class="py-2 px-2.5">
          <div class="font-bold text-sky-400 flex items-center gap-1.5">
            <span>${a.ap_name}</span>
            ${a.ap_health !== undefined && a.ap_health !== null ? formatApHealthBadge(a.ap_health) : ""}
          </div>
          <div class="text-[10px] text-emerald-300 font-semibold mt-0.5">${a.floor} <span class="text-slate-400 font-normal">• ${a.model}</span></div>
        </td>
        <td class="py-2 px-2.5">
          <div class="font-mono text-slate-200 text-[11px]">${a.switch_name}</div>
          <div class="text-[10px] text-emerald-400">${a.link_speed}</div>
        </td>
        <td class="py-2 px-2.5 font-mono text-[11px]">
          <div class="text-slate-200">${a.ap_ip}</div>
          <div class="text-slate-400">${a.base_radio_mac}</div>
        </td>
        <td class="py-2 px-2.5 text-center">
          <span class="text-sky-300 font-bold">Inv: ${a.inv_clients ?? "--"}</span> /
          <span class="text-emerald-300 font-bold">CSV1: ${a.csv_session_clients}</span>
        </td>
        <td class="py-2 px-2.5 text-center">
          <span class="${(a.r1_5g_util || 0) >= 45 ? "text-rose-400 font-bold" : "text-white"}">5G: ${util5g}</span>
          <span class="text-slate-400 text-[10px]"> / 2.4G: ${util24g}</span>
        </td>
        <td class="py-2 px-2.5 text-center">
          <span class="text-amber-300">${a.r1_5g_int !== null && a.r1_5g_int !== undefined ? a.r1_5g_int + "%" : "--"}</span>
          <span class="text-slate-400 text-[10px]"> / ${a.r1_5g_noise !== null && a.r1_5g_noise !== undefined ? a.r1_5g_noise + " dBm" : "--"}</span>
        </td>
        <td class="py-2 px-2.5 text-center">
          <span class="${a.csv_avg_retries >= 18 ? "text-rose-400 font-bold" : "text-slate-200"}">${a.csv_avg_retries}%</span>
          <span class="text-[10px] text-rose-300"> (${a.high_retry_25_count} >=25%)</span>
        </td>
        <td class="py-2 px-2.5 text-center font-semibold text-indigo-300">${a.wifi6e_clients || 0}</td>
        <td class="py-2 px-2.5">${srcBadges}</td>
      </tr>`;
    })
    .join("");

  // Tabla 3: Clientes Correlacionados
  document.getElementById("table-corr-clients").innerHTML = (corr.correlated_clients || [])
    .slice(0, 250)
    .map((c) => {
      const stBadge = `<span class="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 text-[10px] font-semibold">${c.protocol || "--"} (${c.capability || "--"})</span>`;

      return `
      <tr class="hover:bg-slate-800/60 transition">
        <td class="py-2.5 px-2.5">
          <div class="font-bold text-white">${c.user_id}</div>
          <div class="text-[10px] text-slate-400">${c.hostname} • ${c.os}</div>
        </td>
        <td class="py-2.5 px-2.5 font-mono text-[11px]">
          <div class="text-slate-200">${c.mac}</div>
          <div class="text-slate-400">${c.ipv4}</div>
        </td>
        <td class="py-2.5 px-2.5">
          <div class="font-semibold text-sky-400">${c.ap_name}</div>
          <div class="text-[10px] text-emerald-300 font-semibold">${c.floor} ${c.ap_health !== undefined && c.ap_health !== null ? `<span class="text-slate-300">(AP Health: ${c.ap_health}/10)</span>` : ""}</div>
        </td>
        <td class="py-2.5 px-2.5">
          <div class="text-[11px] font-mono text-slate-200">${c.switch_name}</div>
          <div class="text-[10px] text-slate-400">${c.link_speed}</div>
        </td>
        <td class="py-2.5 px-2.5 text-center">
          <span class="${(c.ap_5g_util || 0) >= 45 ? "text-rose-400 font-bold" : "text-slate-200"}">${c.ap_5g_util !== null && c.ap_5g_util !== undefined ? c.ap_5g_util + "% util" : "No en CSV2"}</span>
          <div class="text-[10px] text-purple-300">Int: ${c.ap_5g_int !== null && c.ap_5g_int !== undefined ? c.ap_5g_int + "%" : "--"}</div>
        </td>
        <td class="py-2.5 px-2.5 text-center">${stBadge}</td>
        <td class="py-2.5 px-2.5 text-center">
          <span class="text-emerald-300 font-semibold">${c.csv_rssi ?? "--"} dBm</span>
          <span class="text-slate-400 text-[10px]">(${c.csv_snr ?? "--"} dB)</span>
        </td>
        <td class="py-2.5 px-2.5 text-center">
          <span class="${(c.csv_retries || 0) >= 25 ? "text-rose-400 font-bold text-sm" : "text-slate-200"}">${c.csv_retries ?? 0}%</span>
        </td>
        <td class="py-2.5 px-2.5 text-[11px] text-indigo-200">${c.cross_verdict}</td>
        <td class="py-2.5 px-2.5 text-right">
          <button onclick="quickFilterByUser('${c.user_id}')" class="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[11px] border border-emerald-500/40">
            Ver Cliente
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderApInventoryDashboard(apInv) {
  const k = apInv.kpis || {
    total_aps: 0,
    aps_with_issues_count: 0,
    total_clients_building: 0,
    r1_clients: 0,
    r0_clients: 0,
    r2_clients: 0,
    avg_health: 10,
    low_health_count: 0,
    critical_health_count: 0,
    regular_health_count: 0,
    avg_5g_util: 0,
    high_util_5g_count: 0,
    avg_5g_int: 0,
    avg_24g_int: 0,
    fast_eth_count: 0,
    degraded_links_count: 0,
    dual_5g_count: 0,
    avg_cpu: 0,
  };

  const apBadge = document.getElementById("ap-inv-table-badge");
  if (apBadge) {
    apBadge.textContent = `Mostrando ${apInv.total_aps || 0} de ${apInv.unfiltered_total || 0} APs`;
  }

  const cards = [
    {
      label: "Total APs Inventariados",
      value: `${k.total_aps} APs`,
      sub: `Modelo Cisco CW9176I (${k.aps_with_issues_count} con issues) • Clic para todos`,
      icon: "fa-tower-broadcast",
      color: "text-sky-400",
      onclick: "quickFilterApInventory('ALL')",
    },
    {
      label: "Overall Health APs (Clic)",
      value: `${k.avg_health ?? 10}/10 Prom`,
      sub: `${k.critical_health_count || 0} en 1/10 Crítico • ${k.low_health_count || 0} < 10 • Clic aquí`,
      icon: "fa-heart-pulse",
      color: (k.low_health_count || 0) > 0 ? "text-rose-400" : "text-emerald-400",
      onclick: "quickFilterApInventory('health_low')",
      highlight: (k.low_health_count || 0) > 0,
    },
    {
      label: "Clientes en Edificio (CSV 2)",
      value: `${k.total_clients_building} Clientes`,
      sub: `5GHz: ${k.r1_clients} | 2.4GHz: ${k.r0_clients} | 6GHz: ${k.r2_clients}`,
      icon: "fa-users",
      color: "text-emerald-400",
      onclick: "quickFilterApInventory('overload_35')",
    },
    {
      label: "Utilización Canal 5 GHz (Clic)",
      value: `${k.avg_5g_util}% Prom`,
      sub: `${k.high_util_5g_count} APs críticos (>= 50% util) • Clic para ver APs`,
      icon: "fa-gauge-high",
      color: k.high_util_5g_count > 0 ? "text-amber-400" : "text-sky-400",
      onclick: "quickFilterApInventory('util_5g_50')",
      highlight: k.high_util_5g_count > 0,
    },
    {
      label: "Interferencia RF Promedio (Clic)",
      value: `5G: ${k.avg_5g_int}%`,
      sub: `Interferencia 2.4 GHz Prom: ${k.avg_24g_int}% • Clic >= 15%`,
      icon: "fa-wave-square",
      color: "text-purple-400",
      onclick: "quickFilterApInventory('int_5g_15')",
    },
    {
      label: "Enlaces Ethernet Switch (Clic)",
      value: `${k.fast_eth_count} en 100Mbps`,
      sub: `${k.degraded_links_count} APs < 10 Gbps • Clic para filtrar`,
      icon: "fa-ethernet",
      color: k.fast_eth_count > 0 ? "text-rose-400" : "text-emerald-400",
      onclick: "quickFilterApInventory('link_100m')",
      highlight: k.fast_eth_count > 0,
    },
  ];

  document.getElementById("ap-inv-kpis").innerHTML = cards
    .map(
      (c) => `
    <div ${c.onclick ? `onclick="${c.onclick}"` : ""} class="glass rounded-xl p-4 flex flex-col justify-between transition ${
        c.onclick ? "cursor-pointer clickable-card" : ""
      } ${c.highlight ? "border border-amber-500/40 bg-amber-950/15" : ""}">
      <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span class="${c.highlight ? "text-amber-300 font-semibold" : ""}">${c.label}</span>
        <i class="fa-solid ${c.icon} ${c.color}"></i>
      </div>
      <div class="text-xl font-bold text-white my-0.5">${c.value}</div>
      <div class="text-[11px] ${c.highlight ? "text-amber-200 font-medium" : "text-slate-400"}">${c.sub}</div>
    </div>`
    )
    .join("");

  const styles = {
    critical: "border-rose-500/40 bg-rose-950/20 text-rose-300",
    warning: "border-amber-500/40 bg-amber-950/20 text-amber-300",
    info: "border-sky-500/40 bg-sky-950/20 text-sky-300",
  };
  document.getElementById("ap-inv-insights").innerHTML = (apInv.insights || [])
    .map((ins) => {
      const apPills =
        ins.affected_aps && ins.affected_aps.length
          ? `<div class="pt-2 flex flex-wrap gap-1.5">
              ${ins.affected_aps
                .map(
                  (apObj) =>
                    `<button type="button" onclick="event.stopPropagation(); quickFilterByAp('${apObj.ap_name}')" class="px-2 py-1 rounded-md bg-slate-900/90 hover:bg-emerald-600/40 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-medium transition flex items-center gap-1" title="Clic para ver los clientes de ${apObj.ap_name}">
                      <i class="fa-solid fa-users-viewfinder"></i> ${apObj.label}
                    </button>`
                )
                .join("")}
            </div>`
          : `<div class="text-[11px] text-slate-400 pt-1">${(ins.affected || []).join(" • ")}</div>`;

      return `
      <div onclick="quickFilterApInventory('${ins.action_value || "ALL"}')" class="p-3.5 rounded-xl border ${
        styles[ins.severity] || styles.info
      } space-y-1.5 cursor-pointer clickable-card transition">
        <div class="text-xs font-bold flex items-center justify-between gap-2">
          <span><i class="fa-solid fa-circle-exclamation mr-1"></i> ${ins.title}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white shrink-0"><i class="fa-solid fa-filter"></i> Filtrar APs</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">${ins.desc}</p>
        ${apPills}
      </div>`;
    })
    .join("");

  // Gráficos Dashboard 3
  // 1. NUEVA GRÁFICA: Clientes por AP (Inventario CSV 2 vs Sesiones CSV 1) + Overall Health del AP
  const topClientAps = [...(apInv.aps || [])]
    .sort((a, b) => (b.total_clients || 0) - (a.total_clients || 0) || (b.csv1_clients_count || 0) - (a.csv1_clients_count || 0))
    .slice(0, 14);
  const apInvClientsCanvas = document.getElementById("chart-ap-inv-clients");
  if (apInvClientsCanvas) {
    destroyChart("apInvClients");
    charts.apInvClients = new Chart(apInvClientsCanvas, {
      type: "bar",
      data: {
        labels: topClientAps.map((a) => `${a.ap_name} (${a.floor})`),
        datasets: [
          {
            label: "Clientes en AP (CSV 2 Inv.)",
            data: topClientAps.map((a) => a.total_clients || 0),
            backgroundColor: "#10b981",
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            label: "Sesiones Clientes (CSV 1)",
            data: topClientAps.map((a) => a.csv1_clients_count || 0),
            backgroundColor: "#0ea5e9",
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Overall Health AP (1-10)",
            data: topClientAps.map((a) => a.health ?? 0),
            borderColor: "#f43f5e",
            backgroundColor: "#f43f5e",
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 4,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const apObj = topClientAps[idx];
            if (apObj) quickFilterByAp(apObj.ap_name);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
          y: {
            position: "left",
            title: { display: true, text: "Clientes", color: "#10b981", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          y1: {
            position: "right",
            min: 0,
            max: 10,
            title: { display: true, text: "Overall Health (1-10)", color: "#f43f5e", font: { size: 10 } },
            ticks: { color: "#f43f5e" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  const floors = apInv.floor_summary || [];
  destroyChart("apFloors");
  charts.apFloors = new Chart(document.getElementById("chart-ap-floors"), {
    type: "bar",
    data: {
      labels: floors.map((f) => f.floor),
      datasets: [
        {
          label: "Clientes Totales",
          data: floors.map((f) => f.client_count),
          backgroundColor: "#0ea5e9",
          borderRadius: 4,
          yAxisID: "y",
        },
        {
          label: "Utilización 5GHz Prom (%)",
          data: floors.map((f) => f.avg_5g_util),
          backgroundColor: "#f59e0b",
          borderRadius: 4,
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Overall Health Prom (1-10)",
          data: floors.map((f) => f.avg_health ?? 10),
          borderColor: "#10b981",
          backgroundColor: "#10b981",
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const fl = floors[idx]?.floor;
          if (fl) {
            document.getElementById("filter-floor").value = fl;
            fetchData();
          }
        }
      },
      plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
        y: { position: "left", ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        y1: {
          position: "right",
          min: 0,
          max: 10,
          title: { display: true, text: "Health (1-10)", color: "#10b981", font: { size: 10 } },
          ticks: { color: "#10b981" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });

  const topUtil5g = [...(apInv.aps || [])]
    .filter((a) => a.r1_utilization !== null)
    .sort((a, b) => b.r1_utilization - a.r1_utilization)
    .slice(0, 12);
  destroyChart("apUtil5g");
  charts.apUtil5g = new Chart(document.getElementById("chart-ap-util5g"), {
    type: "bar",
    data: {
      labels: topUtil5g.map((a) => `${a.ap_name} (${a.floor})`),
      datasets: [
        {
          label: "Utilización Canal 5 GHz (%)",
          data: topUtil5g.map((a) => a.r1_utilization),
          backgroundColor: topUtil5g.map((a) => (a.r1_utilization >= 50 ? "#f43f5e" : "#38bdf8")),
          borderRadius: 4,
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Overall Health AP (1-10)",
          data: topUtil5g.map((a) => a.health ?? 0),
          borderColor: "#10b981",
          backgroundColor: "#10b981",
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const apObj = topUtil5g[idx];
          if (apObj) quickFilterByAp(apObj.ap_name);
        }
      },
      plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
        y: { position: "left", ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        y1: {
          position: "right",
          min: 0,
          max: 10,
          ticks: { color: "#10b981" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });

  const topInt = [...(apInv.aps || [])]
    .filter((a) => a.r1_interference !== null)
    .sort((a, b) => b.r1_interference - a.r1_interference)
    .slice(0, 12);
  destroyChart("apInterference");
  charts.apInterference = new Chart(document.getElementById("chart-ap-interference"), {
    type: "bar",
    data: {
      labels: topInt.map((a) => `${a.ap_name} (${a.floor})`),
      datasets: [
        {
          label: "Interferencia 5 GHz (%)",
          data: topInt.map((a) => a.r1_interference),
          backgroundColor: "#a855f7",
          borderRadius: 4,
        },
        {
          label: "Interferencia 2.4 GHz (%)",
          data: topInt.map((a) => a.r0_interference || 0),
          backgroundColor: "#64748b",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const apObj = topInt[idx];
          if (apObj) quickFilterByAp(apObj.ap_name);
        }
      },
      plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
      },
    },
  });

  // Gráfica de Overall Health de los APs (CSV 2)
  const healthDist = apInv.health_distribution || {};
  const healthLabels = Object.keys(healthDist);
  const healthCanvas = document.getElementById("chart-ap-health");
  if (healthCanvas) {
    destroyChart("apHealth");
    charts.apHealth = new Chart(healthCanvas, {
      type: "bar",
      data: {
        labels: healthLabels,
        datasets: [
          {
            label: "Cantidad de APs (Clic para filtrar)",
            data: Object.values(healthDist),
            backgroundColor: ["#10b981", "#f59e0b", "#f43f5e", "#64748b"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const bucket = healthLabels[idx];
            if (bucket) {
              document.getElementById("filter-ap-health-bucket").value = bucket;
              updateTimeFilterBadges();
              fetchData().then(() => {
                const sec = document.getElementById("ap-inv-table-section");
                if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          }
        },
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { ticks: { color: "#cbd5e1", font: { size: 10 } } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        },
      },
    });
  }

  // Gráficas por Tiempo de APs (Last Disconnect Time + Overall Health por Tiempo)
  const apTime = apInv.time_analytics || {};
  const discTimeline = apTime.disconnect_timeline || [];
  const discCanvas = document.getElementById("chart-ap-disconnects");
  if (discCanvas) {
    destroyChart("apDisconnects");
    charts.apDisconnects = new Chart(discCanvas, {
      type: "bar",
      data: {
        labels: discTimeline.map((d) => d.timestamp),
        datasets: [
          {
            label: "APs desconectados en esa fecha/hora",
            data: discTimeline.map((d) => d.ap_count),
            backgroundColor: discTimeline.map((d) => (d.ap_count >= 10 ? "#f43f5e" : "#38bdf8")),
            borderRadius: 5,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Overall Health Prom (1-10)",
            data: discTimeline.map((d) => d.avg_health ?? 10),
            borderColor: "#10b981",
            backgroundColor: "#10b981",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 4,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const ts = discTimeline[idx]?.timestamp;
            if (ts) {
              document.getElementById("filter-disconnect-ts").value = ts;
              updateTimeFilterBadges();
              fetchData().then(() => {
                const sec = document.getElementById("ap-inv-table-section");
                if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          }
        },
        plugins: {
          legend: { labels: { color: "#cbd5e1", font: { size: 10 } } },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const item = discTimeline[ctx.dataIndex];
                return item && item.aps ? `APs: ${item.aps.slice(0, 4).join(", ")}` : "";
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
          y: {
            position: "left",
            title: { display: true, text: "APs", color: "#38bdf8", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          y1: {
            position: "right",
            min: 0,
            max: 10,
            title: { display: true, text: "Health (1-10)", color: "#10b981", font: { size: 10 } },
            ticks: { color: "#10b981" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  const upTimeline = apTime.uptime_health_timeline || [];
  const upBuckets = apTime.uptime_buckets || {};
  const upLabels = upTimeline.length ? upTimeline.map((u) => u.bucket) : Object.keys(upBuckets);
  const upCounts = upTimeline.length ? upTimeline.map((u) => u.ap_count) : Object.values(upBuckets);
  const upHealths = upTimeline.length ? upTimeline.map((u) => u.avg_health ?? 10) : upLabels.map(() => 10);
  const upCanvas = document.getElementById("chart-ap-uptime");
  if (upCanvas) {
    destroyChart("apUptime");
    charts.apUptime = new Chart(upCanvas, {
      type: "bar",
      data: {
        labels: upLabels,
        datasets: [
          {
            label: "APs por Uptime",
            data: upCounts,
            backgroundColor: ["#f43f5e", "#f59e0b", "#10b981"],
            borderRadius: 5,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Overall Health Prom (1-10)",
            data: upHealths,
            borderColor: "#38bdf8",
            backgroundColor: "#38bdf8",
            borderWidth: 2,
            pointRadius: 4,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const bucket = upLabels[idx];
            if (bucket) {
              document.getElementById("filter-uptime-bucket").value = bucket;
              updateTimeFilterBadges();
              fetchData().then(() => {
                const sec = document.getElementById("ap-inv-table-section");
                if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          }
        },
        plugins: {
          legend: { labels: { color: "#cbd5e1", font: { size: 10 } } },
        },
        scales: {
          x: { ticks: { color: "#cbd5e1", font: { size: 10 } } },
          y: { position: "left", ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y1: {
            position: "right",
            min: 0,
            max: 10,
            title: { display: true, text: "Health (1-10)", color: "#38bdf8", font: { size: 10 } },
            ticks: { color: "#38bdf8" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Tabla completa de APs CW9176I con Correlación Directa a Clientes
  const tbodyAp = document.getElementById("table-ap-inv-body");
  if (!apInv.aps || !apInv.aps.length) {
    tbodyAp.innerHTML = `<tr><td colspan="11" class="py-6 text-center text-slate-400">No hay Access Points que coincidan con el filtro actual.</td></tr>`;
    return;
  }

  tbodyAp.innerHTML = (apInv.aps || [])
    .map((a) => {
      const linkColor =
        a.link_speed_mbps <= 100
          ? "text-rose-400 font-bold"
          : a.link_speed_mbps === 5000
          ? "text-amber-300 font-semibold"
          : "text-emerald-400";
      const alertBadges =
        a.alerts && a.alerts.length
          ? a.alerts.map((al) => `<span class="inline-block px-1.5 py-0.5 mr-1 mb-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">${al}</span>`).join("")
          : `<span class="text-emerald-400 text-[11px]"><i class="fa-solid fa-check"></i> Óptimo</span>`;

      const csv1Cnt = a.csv1_clients_count || 0;
      const csv1Ret =
        a.csv1_avg_retries !== null && a.csv1_avg_retries !== undefined
          ? `<span class="${a.csv1_avg_retries >= 18 ? "text-rose-400 font-bold" : "text-slate-200"}">${a.csv1_avg_retries}% prom</span>
             <div class="text-[10px] text-rose-300">${a.csv1_high_retries || 0} >= 25%</div>`
          : `<span class="text-slate-500 text-[11px]">Sin sesiones en CSV 1</span>`;

      return `
      <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="quickFilterByAp('${a.ap_name}')">
        <td class="py-2 px-2.5">
          <div class="font-bold text-sky-400 flex items-center gap-1.5">
            <span>${a.ap_name}</span>
            <i class="fa-solid fa-arrow-up-right-from-square text-[10px] text-emerald-400" title="Clic para ver los clientes de este AP"></i>
          </div>
          <div class="text-[10px] text-slate-400">${a.model} (CPU: ${a.cpu_pct}% | Mem: ${a.mem_pct}%)</div>
        </td>
        <td class="py-2 px-2.5 text-center">${formatApHealthBadge(a.health)}</td>
        <td class="py-2 px-2.5 text-emerald-300 font-semibold">${a.floor}</td>
        <td class="py-2 px-2.5 font-mono text-[11px]">
          <div class="text-slate-200">${a.ip}</div>
          <div class="text-slate-400">${a.base_radio_mac}</div>
        </td>
        <td class="py-2 px-2.5">
          <div class="font-mono text-slate-200 text-[11px]">${a.switch_name}</div>
          <div class="text-[10px] ${linkColor}">${a.link_name}: ${a.link_speed_str}</div>
        </td>
        <td class="py-2 px-2.5 text-center">
          <div>
            <span class="font-bold text-sky-300 text-xs">Inv: ${a.total_clients}</span> /
            <span class="font-bold ${csv1Cnt > 0 ? "text-emerald-300" : "text-slate-500"} text-xs">CSV1: ${csv1Cnt}</span>
          </div>
          <div class="text-[10px] text-slate-400">5G: ${a.r1_clients} | 2.4G: ${a.r0_clients}</div>
        </td>
        <td class="py-2 px-2.5 text-center">
          <span class="${(a.r1_utilization || 0) >= 50 ? "text-rose-400 font-bold text-sm" : "text-slate-200"}">5G: ${a.r1_utilization ?? "--"}%</span>
          <div class="text-[10px] text-slate-400">${a.r0_band}: ${a.r0_utilization ?? "--"}%</div>
        </td>
        <td class="py-2 px-2.5 text-center">
          <span class="${(a.r1_interference || 0) >= 15 ? "text-amber-300 font-bold" : "text-slate-200"}">5G: ${a.r1_interference ?? "--"}%</span>
          <div class="text-[10px] text-slate-400">Ruido: ${a.r1_noise ?? "--"} dBm</div>
        </td>
        <td class="py-2 px-2.5 text-center">${csv1Ret}</td>
        <td class="py-2 px-2.5">${alertBadges}</td>
        <td class="py-2 px-2.5 text-right">
          <button type="button" onclick="event.stopPropagation(); quickFilterByAp('${a.ap_name}')" class="px-2.5 py-1.5 rounded-lg ${
        csv1Cnt > 0
          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
      } text-[11px] font-semibold transition inline-flex items-center gap-1.5">
            <i class="fa-solid fa-users-viewfinder"></i> Ver Clientes (${csv1Cnt})
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderKPIs(k) {
  const cards = [
    {
      label: "Usuarios y Sesiones (Día / Total)",
      value: `${k.unique_users || 0} <span class="text-xs font-normal text-slate-400">usu. (${k.total_clients || 0} ses.)</span>`,
      sub: `🏢 Corp (COL-): <strong>${k.corp_users ?? 0}u</strong> (${k.corp_clients ?? 0}s) | 📱 Ext: <strong>${k.ext_users ?? 0}u</strong> (${k.ext_clients ?? 0}s)<br/><span class="text-[10px] text-slate-400">Piso #1: ${k.busiest_floor_name || "--"} (${k.busiest_floor_users || 0}u / ${k.busiest_floor_clients || 0}s)</span>`,
      icon: "fa-users",
      color: "text-emerald-400",
      onclick: k.busiest_floor_name && k.busiest_floor_name !== "--" ? `quickFilterByFloor('${k.busiest_floor_name}')` : "",
    },
    {
      label: "AP con Más Usuarios en el Día",
      value: `${k.busiest_ap_name || "--"} <span class="text-xs font-normal text-emerald-300">(${k.busiest_ap_floor || "--"})</span>`,
      sub: `${k.busiest_ap_users || 0} usuarios (${k.busiest_ap_clients || 0} ses.) • Total: ${k.unique_aps || 0} APs`,
      icon: "fa-tower-broadcast",
      color: "text-sky-400",
      onclick: k.busiest_ap_name && k.busiest_ap_name !== "--" ? `quickFilterByAp('${k.busiest_ap_name}')` : "",
    },
    {
      label: "Tráfico Total Cursado",
      value: k.total_usage_fmt,
      sub: `Tx: ${k.total_tx_fmt} | Rx: ${k.total_rx_fmt}`,
      icon: "fa-arrow-right-arrow-left",
      color: "text-indigo-400",
      onclick: "",
    },
    {
      label: "Calidad RF Promedio",
      value: `${k.avg_rssi} dBm`,
      sub: `SNR Prom: ${k.avg_snr} dB | Señal < -79dBm: ${k.sticky_count} (Clic)`,
      icon: "fa-signal",
      color: "text-teal-400",
      onclick: "handleInsightAction('rf_quality', 'Crítica (< -79 dBm / Sticky)')",
    },
    {
      label: "Retransmisiones (Clic para Filtrar)",
      value: `${k.avg_retries}%`,
      sub: `${k.high_retry_count} clientes críticos (>= 25%) • Clic aquí`,
      icon: "fa-rotate-right",
      color: k.avg_retries >= 20 || k.high_retry_count > 0 ? "text-rose-400" : "text-sky-400",
      onclick: "quickFilterRetries('25-100')",
      highlight: true,
    },
    {
      label: "Autenticación 802.1X & Onboarding",
      value: `${(k.avg_auth_ms / 1000).toFixed(2)} s <span class="text-xs font-normal text-amber-300">(Auth)</span>`,
      sub: `ISE/Red: ${k.slow_auth_count || 0} • Suplicante: ${k.slow_auth_supp_count || 0} • Onb: ${(k.avg_onboarding_ms / 1000).toFixed(1)}s`,
      icon: "fa-key",
      color: "text-amber-400",
      onclick: "filterByAlertCategory('Auth 802.1X: Red / ISE (>=6s)')",
    },
  ];

  document.getElementById("kpi-cards").innerHTML = cards
    .map(
      (c) => `
    <div ${c.onclick ? `onclick="${c.onclick}"` : ""} class="glass rounded-xl p-4 flex flex-col justify-between transition ${
        c.onclick ? "cursor-pointer clickable-card" : ""
      } ${c.highlight ? "border border-rose-500/40 bg-rose-950/15" : ""}">
      <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span class="${c.highlight ? "text-rose-300 font-semibold" : ""}">${c.label}</span>
        <i class="fa-solid ${c.icon} ${c.color}"></i>
      </div>
      <div class="text-xl font-bold text-white my-0.5">${c.value}</div>
      <div class="text-[11px] ${c.highlight ? "text-rose-300 font-medium" : "text-slate-400"}">${c.sub}</div>
    </div>`
    )
    .join("");
}

function renderInsights(insights) {
  const container = document.getElementById("insights-container");
  if (!insights.length) {
    container.innerHTML = `<div class="text-xs text-emerald-400 p-3">Sin anomalías críticas detectadas para los filtros actuales.</div>`;
    return;
  }
  const styles = {
    critical: "border-rose-500/40 bg-rose-950/20 text-rose-300",
    warning: "border-amber-500/40 bg-amber-950/20 text-amber-300",
    info: "border-sky-500/40 bg-sky-950/20 text-sky-300",
  };
  container.innerHTML = insights
    .map(
      (ins) => `
    <div onclick="handleInsightAction('${ins.action_type || ""}', '${ins.action_value || ""}')" class="p-3.5 rounded-xl border ${
        styles[ins.severity] || styles.info
      } space-y-1.5 cursor-pointer clickable-card transition">
      <div class="text-xs font-bold flex items-center justify-between gap-2">
        <span><i class="fa-solid fa-circle-exclamation mr-1"></i> ${ins.title}</span>
        <span class="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white"><i class="fa-solid fa-filter"></i> Filtrar</span>
      </div>
      <p class="text-[11px] text-slate-300 leading-relaxed">${ins.desc}</p>
      <div class="text-[11px] text-slate-400 pt-1">
        <span class="font-semibold text-slate-200">Afectados:</span> ${(ins.affected || []).join(" • ")}
      </div>
    </div>`
    )
    .join("");
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function formatFloorChartLabel(flName, totalCount = 0) {
  const s = String(flName || "");
  if (totalCount <= 8) return s;
  return s
    .replace(/^Sótano\s*1.*$/i, "Sót. 1")
    .replace(/^Sótano\s*2.*$/i, "Sót. 2")
    .replace(/^Mezzanine$/i, "Mezz.");
}

function renderClientProblemFocus(data) {
  const k = data.kpis || {};
  const floorSum = data.floor_client_summary || [];
  const apRank = data.ap_failure_ranking || [];
  const alertTotals = data.alert_categories_summary || {};

  // Encontrar la alerta de diagnóstico #1
  const alertEntries = Object.entries(alertTotals).sort((a, b) => b[1] - a[1]);
  const topAlertName = alertEntries[0] && alertEntries[0][1] > 0 ? alertEntries[0][0] : "Sin alertas";
  const topAlertCount = alertEntries[0] ? alertEntries[0][1] : 0;

  // Calcular cuánto mejoraría el piso si se optimizan los Top 3 APs con más fallos
  const top3ApIssues = apRank.slice(0, 3).reduce((acc, a) => acc + (a.issue_clients || 0), 0);
  const currentHealthRate = k.total_clients ? +(100 - (k.issue_clients_pct || 0)).toFixed(1) : 100;
  const projectedHealthRate = k.total_clients
    ? Math.min(100, +(((k.healthy_clients_count || 0) + top3ApIssues) * 100.0 / k.total_clients).toFixed(1))
    : 100;

  const focusContainer = document.getElementById("client-focus-cards");
  if (focusContainer) {
    const cards = [
      {
        title: "Piso con Más Problemas (CSV 1)",
        val: `${k.worst_floor_name || "--"}`,
        sub: `${k.worst_floor_issues || 0} de ${k.worst_floor_total || 0} clientes con alertas (${k.worst_floor_pct || 0}% afectación)`,
        color: "border-rose-500/40 bg-rose-950/20 text-rose-300",
        icon: "fa-building-circle-exclamation",
        onclick: k.worst_floor_name && k.worst_floor_name !== "--" ? `quickFilterByFloor('${k.worst_floor_name}')` : "",
      },
      {
        title: "AP donde Más Fallan los Clientes",
        val: `${k.worst_ap_name || "--"} (${k.worst_ap_floor || "--"})`,
        sub: `${k.worst_ap_issues || 0}/${k.worst_ap_total || 0} clientes (${k.worst_ap_pct || 0}%) • #1: ${k.worst_ap_cause || "--"}`,
        color: "border-amber-500/40 bg-amber-950/20 text-amber-300",
        icon: "fa-tower-observation",
        onclick: k.worst_ap_name && k.worst_ap_name !== "--" ? `quickFilterByAp('${k.worst_ap_name}')` : "",
      },
      {
        title: "Alerta de Diagnóstico #1 en Clientes",
        val: `${topAlertCount} Clientes`,
        sub: `${topAlertName} (Clic para aislar estos clientes)`,
        color: "border-purple-500/40 bg-purple-950/20 text-purple-300",
        icon: "fa-bell",
        onclick: topAlertCount > 0 ? `filterByAlertCategory('${topAlertName}')` : "",
      },
      {
        title: "Indicador de Mejora (Baseline vs Meta)",
        val: `${currentHealthRate}% → ${projectedHealthRate}% Sanos`,
        sub: `Optimizar Top 3 APs recupera +${top3ApIssues} clientes a estado óptimo`,
        color: "border-emerald-500/40 bg-emerald-950/20 text-emerald-300",
        icon: "fa-chart-line",
        onclick: "",
      },
    ];

    focusContainer.innerHTML = cards
      .map(
        (c) => `
      <div ${c.onclick ? `onclick="${c.onclick}"` : ""} class="p-3.5 rounded-xl border ${c.color} ${
          c.onclick ? "cursor-pointer clickable-card" : ""
        } transition flex flex-col justify-between">
        <div class="flex items-center justify-between text-[11px] opacity-90 mb-1">
          <span class="font-semibold uppercase">${c.title}</span>
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div class="text-lg font-extrabold text-white my-0.5">${c.val}</div>
        <div class="text-[11px] text-slate-300">${c.sub}</div>
      </div>`
      )
      .join("");
  }

  const compDays = getComparisonDays(data);
  const subCompDays = getSubComparisonDays(data, compDays);
  const isTwoDayFloorCompare = compDays.length >= 2;
  const alarmSpec = getActiveAlarmSpec(data);
  const hasIssueSub = !!data.has_issue_subfilter;

  const getFloorTotalUsers = (f) => (f ? f.unique_users ?? f.total_clients ?? 0 : 0);
  const getFloorIssueCount = (f) => {
    if (!f) return 0;
    if (alarmSpec) {
      return (
        f.alerts_users_breakdown?.[alarmSpec.floorAlertKey] ??
        f.alerts_breakdown?.[alarmSpec.floorAlertKey] ??
        0
      );
    }
    return f.issue_users ?? f.issue_clients ?? 0;
  };
  const getFloorIssuePct = (f) => {
    if (!f) return 0;
    const totU = getFloorTotalUsers(f);
    if (!totU) return 0;
    return Math.round((getFloorIssueCount(f) / totU) * 1000) / 10;
  };

  // Mostrar TODOS los pisos ordenados de mayor a menor afectación (sin recortar pisos)
  const topFloors = [...floorSum]
    .filter((f) => f && f.floor && f.floor !== "--")
    .sort(
      (a, b) =>
        getFloorIssueCount(b) - getFloorIssueCount(a) ||
        getFloorTotalUsers(b) - getFloorTotalUsers(a)
    );
  const dayFloorMaps = compDays.map((d) => new Map((d.floor_client_summary || []).map((f) => [f.floor, f])));
  const subDayFloorMaps = subCompDays.map((d) => new Map((d.floor_client_summary || []).map((f) => [f.floor, f])));
  const subFloorMap = new Map(
    ((hasIssueSub ? data.issue_filtered?.floor_client_summary : null) || floorSum).map((f) => [f.floor, f])
  );

  // =========================================================================
  // RESUMEN 50% / 50%: (1) TOP PISOS CON ESA ALERTA vs (2) TOP APs CON ESA ALERTA
  // Incluye Usuarios reales en Piso/AP + % Fallo (━━) + Tráfico en GB (•••)
  // =========================================================================
  const toGb = (mb) => Math.round(((mb || 0) / 1024) * 100) / 100;

  const layerToggleContainer = document.getElementById("alert-charts-layer-toggles");
  if (layerToggleContainer) {
    if (isTwoDayFloorCompare) {
      const mBtn = (key, icon, txt, activeCls) => `
        <button type="button" onclick="setCompareAlertMetric('${key}')" class="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border transition flex items-center gap-1 ${
          compareAlertMetric === key && floorAlertsCompareView !== "by_alert"
            ? activeCls
            : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
        }">
          <i class="fa-solid ${icon} text-[9px]"></i>
          <span>${txt}</span>
        </button>`;
      layerToggleContainer.innerHTML = `
        <span class="text-[10px] font-bold uppercase text-teal-300 mr-0.5">Comparar en barras:</span>
        ${mBtn("issues", "fa-triangle-exclamation", `${alarmSpec ? alarmSpec.short : "Fallas"} + %`, "bg-rose-500/25 text-rose-200 border-rose-400 shadow")}
        ${mBtn("users", "fa-users", "Usuarios + %", "bg-sky-500/25 text-sky-200 border-sky-400 shadow")}
        ${mBtn("traffic", "fa-hard-drive", "Tráfico (GB)", "bg-amber-500/25 text-amber-200 border-amber-400 shadow")}
        ${
          compareAlertMetric !== "traffic" && floorAlertsCompareView !== "by_alert"
            ? `<button type="button" onclick="toggleAlertChartLayer('traffic')" class="ml-1 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border transition flex items-center gap-1 ${
                showAlertChartTraffic
                  ? "bg-cyan-500/25 text-cyan-200 border-cyan-400 shadow"
                  : "bg-slate-900 text-slate-500 border-slate-700 hover:text-white"
              }" title="Mostrar / ocultar líneas brillantes de Tráfico (GB) para Día 1 (Azul Brillante) y Día 2 (Verde Brillante)">
                <i class="fa-solid ${showAlertChartTraffic ? "fa-check" : "fa-eye-slash"} text-[9px]"></i>
                <span>📦 Líneas Tráfico GB (Azul / Verde)</span>
              </button>`
            : ""
        }
      `;
    } else {
      layerToggleContainer.innerHTML = `
        <span class="text-[10px] font-bold uppercase text-slate-400 mr-0.5">Capas visibles:</span>
        <button type="button" onclick="toggleAlertChartLayer('users')" class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold border transition flex items-center gap-1 ${
          showAlertChartUsers
            ? "bg-sky-500/25 text-sky-200 border-sky-400 shadow"
            : "bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300"
        }" title="Mostrar / ocultar cantidad total de Usuarios del Piso y AP">
          <i class="fa-solid ${showAlertChartUsers ? "fa-check" : "fa-eye-slash"} text-[9px]"></i>
          <span>👥 Usuarios</span>
        </button>
        <button type="button" onclick="toggleAlertChartLayer('traffic')" class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold border transition flex items-center gap-1 ${
          showAlertChartTraffic
            ? "bg-amber-500/25 text-amber-200 border-amber-400 shadow"
            : "bg-slate-900 text-slate-500 border-slate-700 hover:text-white"
        }" title="Mostrar / ocultar línea punteada de Tráfico Total en GB">
          <i class="fa-solid ${showAlertChartTraffic ? "fa-check" : "fa-eye-slash"} text-[9px]"></i>
          <span>📦 Tráfico (GB) •••</span>
        </button>
      `;
    }
  }

  // Plugin de etiquetas numéricas sobre barras, % dentro de la barra y halo de contraste para líneas brillantes
  const alertBarValuePlugin = {
    id: "alertBarValuePlugin",
    beforeDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (ds && ds.type === "line") {
        chart.ctx.save();
        chart.ctx.shadowColor = "rgba(2, 6, 23, 0.95)";
        chart.ctx.shadowBlur = 6;
        chart.ctx.shadowOffsetX = 0;
        chart.ctx.shadowOffsetY = 1;
      }
    },
    afterDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (ds && ds.type === "line") {
        chart.ctx.restore();
      }
    },
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const isLarge = (chart.height || 0) > 360;
      const topFontPx = isLarge ? 10.5 : 9.5;
      const baseInFontPx = isLarge ? 10.5 : 8.5;
      ctx.save();
      chart.data.datasets.forEach((ds, dsIdx) => {
        if (!ds.barBadgeFmt && !ds.barInnerPctFmt) return;
        const meta = chart.getDatasetMeta(dsIdx);
        if (!meta || meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const barHeight = Math.max(0, (bar.base || 0) - (bar.y || 0));
          const barW = bar.width || 36;
          const isNarrowBar = !isLarge && barW < 21;
          let innerTxt = ds.barInnerPctFmt ? ds.barInnerPctFmt(i) : "";
          if (isNarrowBar && barW < 18 && innerTxt.endsWith("%") && innerTxt.includes(".")) {
            const numPct = parseFloat(innerTxt);
            if (!Number.isNaN(numPct) && numPct >= 10) {
              innerTxt = `${Math.round(numPct)}%`;
            }
          }
          let pillTopY = bar.y || 0;

          if (innerTxt) {
            const availW = isNarrowBar ? Math.max(14, barW + 1) : Math.max(22, barW + 2);
            let fontPx = isNarrowBar ? 6.8 : baseInFontPx;
            ctx.font = `800 ${fontPx}px Inter, system-ui, sans-serif`;
            let tw = ctx.measureText(innerTxt).width;
            if (tw + 4 > availW && !isLarge) {
              fontPx = isNarrowBar ? 6.2 : 7.5;
              ctx.font = `800 ${fontPx}px Inter, system-ui, sans-serif`;
              tw = ctx.measureText(innerTxt).width;
            }
            const padX = isLarge ? 4.5 : isNarrowBar ? 1.5 : 2.5;
            const pillW = Math.min(availW + (isNarrowBar ? 2 : 4), tw + padX * 2);
            const pillH = fontPx + (isLarge ? 5 : isNarrowBar ? 2.8 : 3.5);
            const rx = bar.x - pillW / 2;
            // Si la barra es alta (como Piso 8), centrar dentro; si es bajita, apoyar justo sobre la base de la barra
            const ry =
              barHeight >= pillH + 3
                ? bar.y + (barHeight - pillH) / 2
                : (bar.base || 0) - pillH - 1.5;
            pillTopY = ry;

            ctx.fillStyle = "rgba(15, 23, 42, 0.84)";
            ctx.strokeStyle = typeof ds.borderColor === "string" ? ds.borderColor : "rgba(251, 113, 133, 0.65)";
            ctx.lineWidth = barHeight < pillH + 3 ? 1 : 0.6;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(rx, ry, pillW, pillH, 3);
            } else {
              ctx.rect(rx, ry, pillW, pillH);
            }
            ctx.fill();
            ctx.stroke();

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(innerTxt, bar.x, ry + pillH / 2 + 0.5);
          }

          if (ds.barBadgeFmt) {
            const topTxt = ds.barBadgeFmt(i);
            if (topTxt) {
              const badgeFontPx = isNarrowBar
                ? 8.2
                : ds.isFailBar
                ? isLarge
                  ? 11.5
                  : 10.5
                : topFontPx;
              ctx.font = `800 ${badgeFontPx}px Inter, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "bottom";
              const topY = Math.max(12, innerTxt ? Math.min(bar.y - 2.5, pillTopY - 2) : bar.y - 3);
              ctx.lineJoin = "round";
              ctx.lineWidth = 3.2;
              ctx.strokeStyle = "rgba(2, 6, 23, 0.95)";
              ctx.strokeText(topTxt, bar.x, topY);
              ctx.fillStyle = ds.barBadgeColor || "#ffffff";
              ctx.fillText(topTxt, bar.x, topY);
            }
          }
        });
      });
      ctx.restore();
    },
  };

  const alertCategoryMap = [
    { key: "retries", apField: "high_retry_clients", label: "Retries >=25%", fullCat: "Retransmisiones Altas (>=25%)", color: "#f43f5e" },
    { key: "auth_slow", apField: "slow_auth_clients", label: "Auth ISE/Red >=6s", fullCat: "Auth 802.1X: Red / ISE (>=6s)", color: "#a855f7" },
    { key: "auth_supplicant", apField: "supplicant_auth_clients", label: "Espera Suplicante >=6s", fullCat: "Auth 802.1X: Espera Suplicante (>=6s)", color: "#ec4899" },
    { key: "assoc_slow", apField: "slow_assoc_clients", label: "Asociación >2s", fullCat: "Asociación Lenta (>2s)", color: "#10b981" },
    { key: "dhcp_slow", apField: "slow_dhcp_clients", label: "DHCP >2s", fullCat: "DHCP Lento (>2s)", color: "#38bdf8" },
    { key: "roam_slow", apField: "slow_roam_clients", label: "Roaming >3s", fullCat: "Roaming Lento (>3s)", color: "#6366f1" },
    { key: "latency", apField: "high_latency_clients", label: "Latencia Voz/Datos", fullCat: "Latencia QoS Alta (Voz/Datos)", color: "#f59e0b" },
    { key: "rf_signal", apField: "sticky_clients", label: "Señal Débil <-79dBm", fullCat: "Señal RF Débil / Sticky", color: "#14b8a6" },
  ];

  // Destruir instancias previas
  ["clientFloorProblems", "clientApFailures"].forEach(destroyChart);

  const issueLabelShort = alarmSpec ? alarmSpec.short : "Con Fallas";
  const showFloorStackedAlerts = !alarmSpec && floorAlertsCompareView === "by_alert";
  const showApStackedAlerts = !alarmSpec && apFailuresCompareView === "by_alert";

  const buildCompareCardButtons = (isApCard) => {
    const isStacked = isApCard ? showApStackedAlerts : showFloorStackedAlerts;
    const setStackFn = isApCard ? "setApFailuresCompareView" : "setFloorAlertsCompareView";
    const mkMetric = (k, lbl) => `
      <button type="button" onclick="setCompareAlertMetric('${k}')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
        !isStacked && compareAlertMetric === k
          ? "bg-sky-500/30 text-sky-200 border-sky-400"
          : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
      }">${lbl}</button>`;
    const stackBtn = !alarmSpec
      ? `<button type="button" onclick="${setStackFn}('by_alert')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
          isStacked
            ? "bg-rose-500/30 text-rose-200 border-rose-400"
            : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
        }" title="Desglosar por tipo de alerta">Tipos Alerta</button>`
      : "";
    return `${mkMetric("issues", alarmSpec ? alarmSpec.short : "Fallas (%)")}${mkMetric("users", "Usuarios")}${mkMetric("traffic", "GB")}${stackBtn}`;
  };

  const buildFloorToggleHtml = () => {
    if (isTwoDayFloorCompare) return buildCompareCardButtons(false);
    if (alarmSpec) {
      return `<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-400/50 text-[10px] font-extrabold"><i class="fa-solid fa-bolt mr-1"></i>${alarmSpec.short}</span>`;
    }
    return `
      <button type="button" onclick="setFloorAlertsCompareView('by_day')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
        floorAlertsCompareView === "by_day"
          ? "bg-sky-500/30 text-sky-200 border-sky-400"
          : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
      }">Fallas + Usuarios</button>
      <button type="button" onclick="setFloorAlertsCompareView('by_alert')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
        floorAlertsCompareView === "by_alert"
          ? "bg-rose-500/30 text-rose-200 border-rose-400"
          : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
      }" title="Desglosar por tipo de alerta (haz clic en un color para filtrar esa alerta)">Tipos de Alerta</button>
    `;
  };

  const buildApToggleHtml = () => {
    if (isTwoDayFloorCompare) return buildCompareCardButtons(true);
    if (alarmSpec) {
      return `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/50 text-[10px] font-extrabold"><i class="fa-solid fa-bolt mr-1"></i>${alarmSpec.short}</span>`;
    }
    return `
      <button type="button" onclick="setApFailuresCompareView('by_day')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
        apFailuresCompareView === "by_day"
          ? "bg-sky-500/30 text-sky-200 border-sky-400"
          : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
      }">Fallas + Usuarios</button>
      <button type="button" onclick="setApFailuresCompareView('by_alert')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
        apFailuresCompareView === "by_alert"
          ? "bg-amber-500/30 text-amber-200 border-amber-400"
          : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
      }" title="Desglosar por tipo de alerta (haz clic en un color para filtrar esa alerta)">Tipos de Alerta</button>
    `;
  };

  const floorToggleEl = document.getElementById("floor-alerts-mode-toggle");
  if (floorToggleEl) floorToggleEl.innerHTML = buildFloorToggleHtml();
  const apToggleEl = document.getElementById("ap-failures-mode-toggle");
  if (apToggleEl) apToggleEl.innerHTML = buildApToggleHtml();

  // Si hay un Piso específico seleccionado arriba (#filter-client-floor), ocultar "1. Top Pisos"
  // y expandir "Top APs" al 100% del ancho para mostrar únicamente los APs de ese piso.
  const selectedFloorFilter = document.getElementById("filter-client-floor")?.value || "ALL";
  const isSingleFloorSelected = Boolean(selectedFloorFilter && selectedFloorFilter !== "ALL");
  const floorCardEl = document.getElementById("card-client-floor-problems");
  const alertGridEl = document.getElementById("alert-charts-single-grid");
  const sectionHeadingEl = document.getElementById("alert-charts-section-heading");
  if (floorCardEl) {
    if (isSingleFloorSelected) {
      if (typeof activeSpotlightCard !== "undefined" && activeSpotlightCard === floorCardEl) {
        closeChartSpotlight();
      }
      floorCardEl.classList.add("hidden");
    } else {
      floorCardEl.classList.remove("hidden");
    }
  }
  if (alertGridEl) {
    alertGridEl.classList.toggle("lg:grid-cols-2", !isSingleFloorSelected);
    alertGridEl.classList.toggle("lg:grid-cols-1", isSingleFloorSelected);
  }
  if (sectionHeadingEl) {
    sectionHeadingEl.innerHTML = isSingleFloorSelected
      ? `<i class="fa-solid fa-chart-column"></i> Gráfica por Tipo de Alerta: Top APs en ${selectedFloorFilter} (Usuarios, Fallas y Tráfico GB)`
      : `<i class="fa-solid fa-chart-column"></i> Gráficas por Tipo de Alerta: Todos los Pisos vs. Top APs (Usuarios, Fallas y Tráfico GB)`;
  }

  // Renderizador reutilizable con el diseño limpio de 1 día para Top Pisos
  const mountCleanFloorChart = ({
    canvasEl,
    chartKey,
    floorItems,
    getFloor,
    getSubFloor,
    getOtherDayFloor,
    otherDayLabel,
    sharedScales,
  }) => {
    if (!canvasEl) return;
    let floorDatasets = [];
    const resolvedFloors = floorItems.map(
      (f) =>
        getFloor(f) || {
          floor: f.floor,
          unique_users: 0,
          total_clients: 0,
          healthy_clients: 0,
          issue_clients: 0,
          failure_rate_pct: 0,
          usage_mb: 0,
          usage_fmt: "0 B",
          alerts_breakdown: {},
        }
    );

    if (showFloorStackedAlerts) {
      floorDatasets = alertCategoryMap.map((ac) => ({
        label: ac.label,
        fullCat: ac.fullCat,
        data: resolvedFloors.map(
          (fl) => fl.alerts_users_breakdown?.[ac.key] ?? fl.alerts_breakdown?.[ac.key] ?? 0
        ),
        backgroundColor: ac.color,
        borderRadius: 3,
        stack: "total",
      }));
    } else {
      const fUsersArr = resolvedFloors.map((fl) => getFloorTotalUsers(fl));
      const fFailArr = resolvedFloors.map((fl) => getFloorIssueCount(fl));
      const fPctsArr = resolvedFloors.map((fl) => getFloorIssuePct(fl));

      if (showAlertChartPct) {
        floorDatasets.push({
          type: "line",
          isPctLine: true,
          label: alarmSpec ? `% Usuarios con ${alarmSpec.short}` : "% Usuarios con Falla",
          data: fPctsArr,
          borderColor: "#00b0ff",
          backgroundColor: "#00b0ff",
          pointBackgroundColor: "#00b0ff",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.6,
          pointStyle: "circle",
          borderWidth: 3,
          borderDash: [],
          pointRadius: 4.6,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y1",
          order: 0,
        });
      }
      if (showAlertChartTraffic) {
        floorDatasets.push({
          type: "line",
          isTrafficLine: true,
          label: "Tráfico Total (GB)",
          data: resolvedFloors.map((fl) => toGb(fl.usage_mb)),
          borderColor: "#facc15",
          backgroundColor: "#facc15",
          pointBackgroundColor: "#0f172a",
          pointBorderColor: "#facc15",
          pointBorderWidth: 2.2,
          pointStyle: "rect",
          borderWidth: 3.3,
          borderDash: [2, 8],
          borderCapStyle: "round",
          pointRadius: 5,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y2",
          order: 1,
        });
      }
      if (showAlertChartUsers) {
        floorDatasets.push({
          isUsersBar: true,
          label: "Usuarios en Piso",
          data: fUsersArr,
          backgroundColor: "rgba(56, 189, 248, 0.30)",
          borderColor: "rgba(56, 189, 248, 0.80)",
          borderWidth: 1.1,
          borderRadius: 5,
          barBadgeColor: "#7dd3fc",
          barBadgeFmt: (i) => (fUsersArr[i] > 0 ? `${fUsersArr[i]}u` : ""),
          yAxisID: "y",
          order: 2,
        });
      }
      floorDatasets.push({
        isFailBar: true,
        label: alarmSpec ? `Usuarios con ${alarmSpec.short}` : "Usuarios con Fallas",
        data: fFailArr,
        backgroundColor: alarmSpec ? alarmSpec.color : "rgba(244, 63, 94, 0.78)",
        borderColor: alarmSpec ? alarmSpec.border : "#fb7185",
        borderWidth: 1.2,
        borderRadius: 5,
        barBadgeColor: "#fff1f2",
        barBadgeFmt: (i) => (fFailArr[i] > 0 ? `${fFailArr[i]}u` : ""),
        barInnerPctFmt: (i) => (fFailArr[i] > 0 ? `${fPctsArr[i]}%` : ""),
        yAxisID: "y",
        order: 2,
      });
    }

    const floorXLabels = resolvedFloors.map((fl) =>
      formatFloorChartLabel(fl.floor, resolvedFloors.length)
    );
    const manyFloors1D = resolvedFloors.length > 9;

    charts[chartKey] = new Chart(canvasEl, {
      type: "bar",
      plugins: showFloorStackedAlerts ? [] : [alertBarValuePlugin],
      data: {
        labels: floorXLabels,
        datasets: floorDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: true },
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const first = elements[0];
            const ds = floorDatasets[first.datasetIndex];
            if (showFloorStackedAlerts && ds?.fullCat) {
              selectHierarchyIssueType(ds.fullCat);
              return;
            }
            const item = floorItems[first.index];
            if (item?.floor) quickFilterByFloor(item.floor);
          }
        },
        plugins: {
          legend: !showFloorStackedAlerts
            ? buildComboLegendOptions(9.5)
            : {
                labels: { color: "#cbd5e1", font: { size: 9 }, boxWidth: 9 },
              },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items?.length) return "";
                const fl = resolvedFloors[items[0].dataIndex];
                return fl ? `${fl.floor}` : "";
              },
              label: (ctx) => {
                const ds = ctx.dataset || {};
                const v = ctx.parsed.y;
                if (ds.isTrafficLine) return ` ${ds.label}: ${v} GB`;
                if (ds.isPctLine) return ` ${ds.label}: ${v}%`;
                if (ds.isUsersBar) return ` ${ds.label}: ${v}u`;
                if (ds.isFailBar) {
                  const flObj = resolvedFloors[ctx.dataIndex];
                  const totU = getFloorTotalUsers(flObj);
                  const pct = getFloorIssuePct(flObj);
                  return ` ${ds.label}: ${v}u de ${totU}u (${pct}%)`;
                }
                return ` ${ds.label}: ${v}u`;
              },
              afterBody: (items) => {
                if (!items || !items.length) return [];
                const ds = items[0].dataset || {};
                if (!ds.isFailBar || !alarmSpec?.formatMetric) return [];
                const idx = items[0].dataIndex;
                const flObj = resolvedFloors[idx];
                const rawItem = floorItems[idx];
                const subFl = (getSubFloor && rawItem ? getSubFloor(rawItem) : null) || flObj;
                return subFl ? [`• ${alarmSpec.formatMetric(subFl)}`] : [];
              },
            },
          },
        },
        scales: showFloorStackedAlerts
          ? {
              x: {
                stacked: true,
                ticks: {
                  color: "#e2e8f0",
                  font: { size: manyFloors1D ? 8.5 : 10 },
                  maxRotation: manyFloors1D ? 32 : 0,
                  minRotation: manyFloors1D ? 28 : 0,
                  autoSkip: false,
                },
              },
              y: {
                stacked: true,
                min: 0,
                max: sharedScales ? sharedScales.yMax : undefined,
                ticks: { color: "#94a3b8" },
                grid: { color: "#1e293b" },
              },
            }
          : {
              x: {
                ticks: {
                  color: "#e2e8f0",
                  font: { size: manyFloors1D ? 8.5 : 10, weight: "600" },
                  maxRotation: manyFloors1D ? 32 : 0,
                  minRotation: manyFloors1D ? 28 : 0,
                  autoSkip: false,
                },
              },
              y: {
                position: "left",
                min: 0,
                max: sharedScales ? sharedScales.yMax : undefined,
                grace: sharedScales ? undefined : "16%",
                title: {
                  display: true,
                  text: showAlertChartUsers ? `Usuarios / ${issueLabelShort}` : issueLabelShort,
                  color: "#38bdf8",
                  font: { size: 10 },
                },
                ticks: { color: "#94a3b8" },
                grid: { color: "#1e293b" },
              },
              y1: {
                display: showAlertChartPct,
                position: "right",
                min: 0,
                max: sharedScales ? sharedScales.y1Max : alarmSpec ? undefined : 100,
                title: {
                  display: true,
                  text: `${alarmSpec ? `% ${alarmSpec.short}` : "% Fallo"} ━━`,
                  color: "#38bdf8",
                  font: { size: 9.5, weight: "bold" },
                },
                ticks: { color: "#93c5fd", font: { size: 9 } },
                grid: { drawOnChartArea: false },
              },
              y2: {
                display: showAlertChartTraffic,
                position: "right",
                min: 0,
                max: sharedScales ? sharedScales.y2Max : undefined,
                title: {
                  display: true,
                  text: "Tráfico (GB) •••",
                  color: "#facc15",
                  font: { size: 9.5, weight: "bold" },
                },
                ticks: { color: "#fde047", font: { size: 9 } },
                grid: { drawOnChartArea: false },
              },
            },
      },
    });
  };

  // Renderizador reutilizable con el diseño limpio de 1 día para Top APs
  const getApTotalUsers = (a) => (a ? a.unique_users ?? a.client_count ?? 0 : 0);
  const getApIssueCount = (a) => {
    if (!a) return 0;
    if (alarmSpec) {
      return (
        a.alerts_users_breakdown?.[alarmSpec.floorAlertKey] ??
        a[alarmSpec.apField] ??
        0
      );
    }
    return a.issue_users ?? a.issue_clients ?? 0;
  };
  const getApIssuePct = (a) => {
    if (!a) return 0;
    const totU = getApTotalUsers(a);
    if (!totU) return 0;
    return Math.round((getApIssueCount(a) / totU) * 1000) / 10;
  };

  const mountCleanApChart = ({
    canvasEl,
    chartKey,
    apItems,
    getAp,
    getSubAp,
    getOtherDayAp,
    otherDayLabel,
    sharedScales,
  }) => {
    if (!canvasEl) return;
    let apDatasets = [];
    const resolvedAps = apItems.map(
      (a) =>
        getAp(a) || {
          ap_name: a.ap_name,
          floor: a.floor || "--",
          unique_users: 0,
          client_count: 0,
          healthy_clients: 0,
          issue_clients: 0,
          failure_rate_pct: 0,
          usage_mb: 0,
          usage_fmt: "0 B",
        }
    );

    if (showApStackedAlerts) {
      apDatasets = alertCategoryMap.map((cat) => ({
        label: cat.label,
        fullCat: cat.fullCat,
        data: resolvedAps.map(
          (ap) => ap.alerts_users_breakdown?.[cat.key] ?? ap[cat.apField] ?? 0
        ),
        backgroundColor: cat.color,
        borderRadius: 3,
        stack: "total",
      }));
    } else {
      const aUsersArr = resolvedAps.map((ap) => getApTotalUsers(ap));
      const aFailArr = resolvedAps.map((ap) => getApIssueCount(ap));
      const aPctsArr = resolvedAps.map((ap) => getApIssuePct(ap));

      if (showAlertChartPct) {
        apDatasets.push({
          type: "line",
          isPctLine: true,
          label: alarmSpec ? `% Usuarios con ${alarmSpec.short}` : "% Usuarios con Falla",
          data: aPctsArr,
          borderColor: "#00b0ff",
          backgroundColor: "#00b0ff",
          pointBackgroundColor: "#00b0ff",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.6,
          pointStyle: "circle",
          borderWidth: 3,
          borderDash: [],
          pointRadius: 4.6,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y1",
          order: 0,
        });
      }
      if (showAlertChartTraffic) {
        apDatasets.push({
          type: "line",
          isTrafficLine: true,
          label: "Tráfico Total (GB)",
          data: resolvedAps.map((ap) => toGb(ap.usage_mb)),
          borderColor: "#facc15",
          backgroundColor: "#facc15",
          pointBackgroundColor: "#0f172a",
          pointBorderColor: "#facc15",
          pointBorderWidth: 2.2,
          pointStyle: "rect",
          borderWidth: 3.3,
          borderDash: [2, 8],
          borderCapStyle: "round",
          pointRadius: 5,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y2",
          order: 1,
        });
      }
      if (showAlertChartUsers) {
        apDatasets.push({
          isUsersBar: true,
          label: "Usuarios en AP",
          data: aUsersArr,
          backgroundColor: "rgba(56, 189, 248, 0.30)",
          borderColor: "rgba(56, 189, 248, 0.80)",
          borderWidth: 1.1,
          borderRadius: 5,
          barBadgeColor: "#7dd3fc",
          barBadgeFmt: (i) => (aUsersArr[i] > 0 ? `${aUsersArr[i]}u` : ""),
          yAxisID: "y",
          order: 2,
        });
      }
      apDatasets.push({
        isFailBar: true,
        label: alarmSpec ? `Usuarios con ${alarmSpec.short}` : "Usuarios con Fallas",
        data: aFailArr,
        backgroundColor: alarmSpec ? alarmSpec.color : "rgba(244, 63, 94, 0.78)",
        borderColor: alarmSpec ? alarmSpec.border : "#fb7185",
        borderWidth: 1.2,
        borderRadius: 5,
        barBadgeColor: "#fff1f2",
        barBadgeFmt: (i) => (aFailArr[i] > 0 ? `${aFailArr[i]}u` : ""),
        barInnerPctFmt: (i) => (aFailArr[i] > 0 ? `${aPctsArr[i]}%` : ""),
        yAxisID: "y",
        order: 2,
      });
    }

    const apXLabels = resolvedAps.map((ap, i) => {
      if (isSingleFloorSelected) return ap.ap_name;
      const flName = ap.floor || apItems[i]?.floor || "--";
      return [ap.ap_name, flName];
    });

    charts[chartKey] = new Chart(canvasEl, {
      type: "bar",
      plugins: showApStackedAlerts ? [] : [alertBarValuePlugin],
      data: {
        labels: apXLabels,
        datasets: apDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: true },
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const first = elements[0];
            const ds = apDatasets[first.datasetIndex];
            if (showApStackedAlerts && ds?.fullCat) {
              selectHierarchyIssueType(ds.fullCat);
              return;
            }
            const apObj = apItems[first.index];
            if (apObj?.ap_name) quickFilterByAp(apObj.ap_name);
          }
        },
        plugins: {
          legend: !showApStackedAlerts
            ? buildComboLegendOptions(9.5)
            : {
                labels: { color: "#cbd5e1", font: { size: 9 }, boxWidth: 9 },
              },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items?.length) return "";
                const ap = resolvedAps[items[0].dataIndex];
                return ap ? `${ap.ap_name} (${ap.floor || "--"})` : "";
              },
              label: (ctx) => {
                const ds = ctx.dataset || {};
                const v = ctx.parsed.y;
                if (ds.isTrafficLine) return ` ${ds.label}: ${v} GB`;
                if (ds.isPctLine) return ` ${ds.label}: ${v}%`;
                if (ds.isUsersBar) return ` ${ds.label}: ${v}u`;
                if (ds.isFailBar) {
                  const apObj = resolvedAps[ctx.dataIndex];
                  const totU = getApTotalUsers(apObj);
                  const pct = getApIssuePct(apObj);
                  return ` ${ds.label}: ${v}u de ${totU}u (${pct}%)`;
                }
                return ` ${ds.label}: ${v}u`;
              },
              afterBody: (items) => {
                if (!items || !items.length) return [];
                const ds = items[0].dataset || {};
                if (!ds.isFailBar || !alarmSpec?.formatMetric) return [];
                const idx = items[0].dataIndex;
                const apObj = resolvedAps[idx];
                const rawItem = apItems[idx];
                const subAp = (getSubAp && rawItem ? getSubAp(rawItem) : null) || apObj;
                return subAp ? [`• ${alarmSpec.formatMetric(subAp)}`] : [];
              },
            },
          },
        },
        scales: showApStackedAlerts
          ? {
              x: { stacked: true, ticks: { color: "#e2e8f0", font: { size: 9 }, maxRotation: 0, minRotation: 0, autoSkip: false } },
              y: {
                stacked: true,
                min: 0,
                max: sharedScales ? sharedScales.yMax : undefined,
                ticks: { color: "#94a3b8" },
                grid: { color: "#1e293b" },
              },
            }
          : {
              x: { ticks: { color: "#e2e8f0", font: { size: 9, weight: "600" }, maxRotation: 0, minRotation: 0, autoSkip: false } },
              y: {
                position: "left",
                min: 0,
                max: sharedScales ? sharedScales.yMax : undefined,
                grace: sharedScales ? undefined : "16%",
                title: {
                  display: true,
                  text: showAlertChartUsers ? `Usuarios / ${issueLabelShort}` : issueLabelShort,
                  color: "#38bdf8",
                  font: { size: 10 },
                },
                ticks: { color: "#94a3b8" },
                grid: { color: "#1e293b" },
              },
              y1: {
                display: showAlertChartPct,
                position: "right",
                min: 0,
                max: sharedScales ? sharedScales.y1Max : alarmSpec ? undefined : 100,
                title: {
                  display: true,
                  text: `${alarmSpec ? `% ${alarmSpec.short}` : "% Fallo"} ━━`,
                  color: "#38bdf8",
                  font: { size: 9.5, weight: "bold" },
                },
                ticks: { color: "#93c5fd", font: { size: 9 } },
                grid: { drawOnChartArea: false },
              },
              y2: {
                display: showAlertChartTraffic,
                position: "right",
                min: 0,
                max: sharedScales ? sharedScales.y2Max : undefined,
                title: {
                  display: true,
                  text: "Tráfico (GB) •••",
                  color: "#facc15",
                  font: { size: 9.5, weight: "bold" },
                },
                ticks: { color: "#fde047", font: { size: 9 } },
                grid: { drawOnChartArea: false },
              },
            },
      },
    });
  };

  if (isTwoDayFloorCompare) {
    // =========================================================================
    // MODO UNIFICADO LIMPIO (COMPARAR 2 DÍAS):
    // Solo 2 gráficas (1. Top Pisos | 2. Top APs), Top 7 barras anchas (Azul vs Verde),
    // CERO líneas cruzadas encima, conteo limpio arriba y % dentro de cada barra.
    // =========================================================================
    const d0 = compDays[0];
    const d1 = compDays[1];
    const d0FloorMap = dayFloorMaps[0];
    const d1FloorMap = dayFloorMaps[1];
    const subD0FloorMap = subDayFloorMaps[0];
    const subD1FloorMap = subDayFloorMaps[1];

    const getDayTotalIssueUsers = (dObj) => {
      if (!alarmSpec) return dObj.issue_users_count ?? dObj.issue_clients_count ?? 0;
      if (dObj.alert_users_summary && dObj.alert_users_summary[alarmSpec.fullCat] !== undefined) {
        return dObj.alert_users_summary[alarmSpec.fullCat];
      }
      return (dObj.floor_client_summary || []).reduce((acc, f) => acc + getFloorIssueCount(f), 0);
    };
    const buildDayLegendLabel = (idx, dObj) => {
      const u = dObj.unique_users || dObj.total_clients || 0;
      const issU = getDayTotalIssueUsers(dObj);
      const pct = u ? Math.round((issU / u) * 1000) / 10 : 0;
      return `Día ${idx + 1} (${dObj.day_label}): ${issU}u/${u}u (${pct}%)`;
    };
    const TRAFFIC_LINE_BRIGHT = [
      { color: "#00e5ff", pt: "circle", radius: 4.5, hoverRadius: 6.5 }, // Día 1: Azul Brillante (Eléctrico)
      { color: "#39ff7a", pt: "triangle", radius: 5.2, hoverRadius: 7.0 }, // Día 2: Verde Brillante (Neón)
    ];

    const yAxisMetricTitle =
      compareAlertMetric === "users"
        ? "Usuarios Reales (Día 1 vs Día 2)"
        : compareAlertMetric === "traffic"
        ? "Tráfico Total GB (Día 1 vs Día 2)"
        : `${issueLabelShort} (Día 1 vs Día 2)`;

    // ---------------- 1. TODOS LOS PISOS UNIFICADO (AZUL vs VERDE + LÍNEAS TRÁFICO BRILLANTES) ----------------
    const floorNamesSet = new Set([
      ...(floorSum || []).map((f) => f.floor),
      ...(d0.floor_client_summary || []).map((f) => f.floor),
      ...(d1.floor_client_summary || []).map((f) => f.floor),
    ]);
    const compareTopFloors = [...floorNamesSet]
      .filter((flName) => flName && flName !== "--")
      .map((flName) => {
        const f0 = d0FloorMap?.get(flName);
        const f1 = d1FloorMap?.get(flName);
        return {
          floor: flName,
          sumIssues: getFloorIssueCount(f0) + getFloorIssueCount(f1),
          sumUsers: getFloorTotalUsers(f0) + getFloorTotalUsers(f1),
        };
      })
      .sort((a, b) => b.sumIssues - a.sumIssues || b.sumUsers - a.sumUsers);

    const titleFloorProbEl = document.getElementById("title-client-floor-problems");
    if (titleFloorProbEl) {
      titleFloorProbEl.textContent = alarmSpec
        ? `1. Pisos con ${alarmSpec.short} (${d0.day_label} vs ${d1.day_label})`
        : `1. Pisos con Fallas (${d0.day_label} vs ${d1.day_label})`;
    }

    const showFloorCompareTrafficLines =
      !showFloorStackedAlerts && compareAlertMetric !== "traffic" && showAlertChartTraffic;

    const floorProbCanvas = isSingleFloorSelected
      ? null
      : document.getElementById("chart-client-floor-problems");
    if (floorProbCanvas) {
      let floorDatasets = [];
      if (showFloorStackedAlerts) {
        compDays.slice(0, 2).forEach((d, dIdx) => {
          const fMap = dayFloorMaps[dIdx];
          alertCategoryMap.forEach((ac) => {
            floorDatasets.push({
              label: `${ac.label} (${d.day_label})`,
              fullCat: ac.fullCat,
              dayIdx: dIdx,
              dayLabel: d.day_label,
              data: compareTopFloors.map(
                (f) =>
                  fMap?.get(f.floor)?.alerts_users_breakdown?.[ac.key] ??
                  fMap?.get(f.floor)?.alerts_breakdown?.[ac.key] ??
                  0
              ),
              backgroundColor: ac.color,
              borderColor: dIdx === 1 ? "#ffffff" : "transparent",
              borderWidth: dIdx === 1 ? 1 : 0,
              stack: d.day_label,
            });
          });
        });
      } else {
        const floorGbByDay = [];
        compDays.slice(0, 2).forEach((d, dIdx) => {
          const fMap = dayFloorMaps[dIdx];
          const countsArr = compareTopFloors.map((f) => getFloorIssueCount(fMap?.get(f.floor)));
          const usersArr = compareTopFloors.map((f) => getFloorTotalUsers(fMap?.get(f.floor)));
          const pctsArr = compareTopFloors.map((f) => getFloorIssuePct(fMap?.get(f.floor)));
          const gbArr = compareTopFloors.map((f) => toGb(fMap?.get(f.floor)?.usage_mb));
          floorGbByDay.push({ day: d, gbArr });

          const dataArr =
            compareAlertMetric === "users"
              ? usersArr
              : compareAlertMetric === "traffic"
              ? gbArr
              : countsArr;

          floorDatasets.push({
            label: buildDayLegendLabel(dIdx, d),
            dayIdx: dIdx,
            dayLabel: d.day_label,
            data: dataArr,
            backgroundColor: dIdx === 0 ? "rgba(37, 99, 235, 0.72)" : "rgba(21, 128, 61, 0.76)",
            borderColor: dIdx === 0 ? "#3b82f6" : "#22c55e",
            borderWidth: 1.4,
            borderRadius: 6,
            categoryPercentage: 0.78,
            barPercentage: 0.88,
            order: 2,
            yAxisID: "y",
            barBadgeColor: dIdx === 0 ? "#93c5fd" : "#86efac",
            skipFallbackMerge: compareAlertMetric === "traffic",
            barBadgeFmt: (i) => {
              if (compareAlertMetric === "users") return usersArr[i] > 0 ? `${usersArr[i]}u` : "";
              if (compareAlertMetric === "traffic") {
                const g = gbArr[i] || 0;
                if (g <= 0) return "";
                return `${g >= 100 ? Math.round(g) : g.toFixed(1)}G`;
              }
              return countsArr[i] > 0 ? `${countsArr[i]}u` : "";
            },
            barInnerPctFmt: (i) => {
              if (compareAlertMetric === "traffic") return usersArr[i] > 0 ? `${usersArr[i]}u` : "";
              if (compareAlertMetric === "users") return usersArr[i] > 0 ? `${pctsArr[i]}%` : "";
              return countsArr[i] > 0 ? `${pctsArr[i]}%` : "";
            },
          });
        });

        if (showFloorCompareTrafficLines) {
          floorGbByDay.forEach(({ day, gbArr }, dIdx) => {
            const st = TRAFFIC_LINE_BRIGHT[dIdx];
            floorDatasets.push({
              type: "line",
              isTrafficLine: true,
              label: `Tráfico Día ${dIdx + 1} (${day.day_label}) GB`,
              dayIdx: dIdx,
              dayLabel: day.day_label,
              data: gbArr,
              yAxisID: "yGb",
              borderColor: st.color,
              backgroundColor: st.color,
              borderWidth: 2.8,
              pointStyle: st.pt,
              pointBackgroundColor: st.color,
              pointBorderColor: "#ffffff",
              pointBorderWidth: 1.8,
              pointRadius: st.radius,
              pointHoverRadius: st.hoverRadius,
              pointHitRadius: 12,
              tension: 0.25,
              order: 0,
            });
          });
        }
      }

      const floorXLabels = compareTopFloors.map((f) =>
        formatFloorChartLabel(f.floor, compareTopFloors.length)
      );
      const manyFloors2D = compareTopFloors.length > 9;

      charts.clientFloorProblems = new Chart(floorProbCanvas, {
        type: "bar",
        plugins: showFloorStackedAlerts ? [] : [alertBarValuePlugin],
        data: { labels: floorXLabels, datasets: floorDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: true },
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const first = elements[0];
              const ds = floorDatasets[first.datasetIndex];
              if (showFloorStackedAlerts && ds?.fullCat) {
                selectHierarchyIssueType(ds.fullCat);
                return;
              }
              const item = compareTopFloors[first.index];
              if (item?.floor) quickFilterByFloor(item.floor);
            }
          },
          plugins: {
            legend: !showFloorStackedAlerts
              ? buildComboLegendOptions(9.5)
              : {
                  labels: {
                    color: "#cbd5e1",
                    font: { size: 9 },
                    boxWidth: 9,
                    filter: (item) => item.datasetIndex < alertCategoryMap.length,
                    generateLabels: (chart) =>
                      Chart.defaults.plugins.legend.labels.generateLabels(chart).map((b) => ({
                        ...b,
                        text: b.text.replace(` (${d0.day_label})`, ""),
                      })),
                  },
                },
            tooltip: {
              callbacks: {
                title: (items) => {
                  if (!items?.length) return "";
                  const fl = compareTopFloors[items[0].dataIndex];
                  const ds = items[0].dataset || {};
                  return fl ? `${fl.floor}${ds.dayLabel ? ` — ${ds.dayLabel}` : ""}` : "";
                },
                label: (ctx) => {
                  const ds = ctx.dataset || {};
                  const v = ctx.parsed.y;
                  if (ds.isTrafficLine || compareAlertMetric === "traffic") {
                    return ` ${ds.label}: ${v} GB`;
                  }
                  if (showFloorStackedAlerts) return ` ${ds.label}: ${v}u`;
                  const fMap = dayFloorMaps[ds.dayIdx];
                  const flName = compareTopFloors[ctx.dataIndex]?.floor;
                  const fObj = fMap?.get(flName);
                  const totU = getFloorTotalUsers(fObj);
                  const pct = getFloorIssuePct(fObj);
                  return compareAlertMetric === "users"
                    ? ` Usuarios totales: ${v}u (${pct}% con falla)`
                    : ` Usuarios con falla: ${v}u de ${totU}u (${pct}%)`;
                },
                afterBody: (items) => {
                  if (!items?.length) return [];
                  const ds = items[0].dataset || {};
                  if (ds.isTrafficLine || compareAlertMetric === "traffic" || !alarmSpec?.formatMetric) return [];
                  const flName = compareTopFloors[items[0].dataIndex]?.floor;
                  if (!flName) return [];
                  const subMap = ds.dayIdx === 0 ? subD0FloorMap : subD1FloorMap;
                  const baseMap = ds.dayIdx === 0 ? d0FloorMap : d1FloorMap;
                  const sf = subMap?.get(flName) || baseMap?.get(flName);
                  return sf ? [`• ${alarmSpec.formatMetric(sf)}`] : [];
                },
              },
            },
          },
          scales: showFloorStackedAlerts
            ? {
                x: {
                  stacked: true,
                  ticks: {
                    color: "#cbd5e1",
                    font: { size: manyFloors2D ? 8.5 : 9.5 },
                    maxRotation: manyFloors2D ? 32 : 0,
                    minRotation: manyFloors2D ? 28 : 0,
                    autoSkip: false,
                  },
                },
                y: { stacked: true, beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
              }
            : {
                x: {
                  ticks: {
                    color: "#cbd5e1",
                    font: { size: manyFloors2D ? 8.5 : 9.5, weight: "600" },
                    maxRotation: manyFloors2D ? 32 : 0,
                    minRotation: manyFloors2D ? 28 : 0,
                    autoSkip: false,
                  },
                },
                y: {
                  position: "left",
                  beginAtZero: true,
                  grace: "18%",
                  title: { display: true, text: yAxisMetricTitle, color: "#38bdf8", font: { size: 10, weight: "bold" } },
                  ticks: { color: "#94a3b8" },
                  grid: { color: "#1e293b" },
                },
                ...(showFloorCompareTrafficLines
                  ? {
                      yGb: {
                        position: "right",
                        beginAtZero: true,
                        grace: "18%",
                        title: {
                          display: true,
                          text: "Tráfico (GB)",
                          color: "#00e5ff",
                          font: { size: 10, weight: "bold" },
                        },
                        ticks: {
                          color: "#cbd5e1",
                          font: { size: 9 },
                          callback: (v) => `${v}G`,
                        },
                        grid: { drawOnChartArea: false },
                      },
                    }
                  : {}),
              },
        },
      });
    }

    // ---------------- 2. TOP 7 APs UNIFICADO (AZUL vs VERDE) ----------------
    const d0ApMap = new Map((d0.ap_summary || []).map((a) => [a.ap_name, a]));
    const d1ApMap = new Map((d1.ap_summary || []).map((a) => [a.ap_name, a]));
    const subD0ApMap = new Map((subCompDays[0]?.ap_summary || []).map((a) => [a.ap_name, a]));
    const subD1ApMap = new Map((subCompDays[1]?.ap_summary || []).map((a) => [a.ap_name, a]));

    const apNamesSet = new Set(
      [...(d0.ap_summary || []).map((a) => a.ap_name), ...(d1.ap_summary || []).map((a) => a.ap_name)].filter(
        (name) => name && name !== "Sin AP"
      )
    );
    const compareTopAps = [...apNamesSet]
      .map((apName) => {
        const a0 = d0ApMap.get(apName);
        const a1 = d1ApMap.get(apName);
        return {
          ap_name: apName,
          floor: a0?.floor || a1?.floor || "--",
          sumSelectedIssues: getApIssueCount(a0) + getApIssueCount(a1),
          sumAllIssues: (a0?.issue_clients || 0) + (a1?.issue_clients || 0),
          sumClients: (a0?.client_count || 0) + (a1?.client_count || 0),
        };
      })
      .sort(
        (a, b) =>
          b.sumSelectedIssues - a.sumSelectedIssues ||
          b.sumAllIssues - a.sumAllIssues ||
          b.sumClients - a.sumClients
      )
      .slice(0, isSingleFloorSelected ? 10 : 7);

    const titleApFailEl = document.getElementById("title-client-ap-failures");
    if (titleApFailEl) {
      const apTitlePrefix = isSingleFloorSelected ? "Top APs" : "2. Top APs";
      const floorSuffix = isSingleFloorSelected ? ` — ${selectedFloorFilter}` : "";
      titleApFailEl.textContent = alarmSpec
        ? `${apTitlePrefix} con ${alarmSpec.short}${floorSuffix} (${d0.day_label} vs ${d1.day_label})`
        : `${apTitlePrefix} con Fallas${floorSuffix} (${d0.day_label} vs ${d1.day_label})`;
    }

    const showApCompareTrafficLines =
      !showApStackedAlerts && compareAlertMetric !== "traffic" && showAlertChartTraffic;

    const apFailCanvas = document.getElementById("chart-client-ap-failures");
    if (apFailCanvas) {
      let apDatasets = [];
      const apDayMaps = [d0ApMap, d1ApMap];
      if (showApStackedAlerts) {
        compDays.slice(0, 2).forEach((d, dIdx) => {
          const dMap = apDayMaps[dIdx];
          alertCategoryMap.forEach((cat) => {
            apDatasets.push({
              label: `${cat.label} (${d.day_label})`,
              fullCat: cat.fullCat,
              dayIdx: dIdx,
              dayLabel: d.day_label,
              data: compareTopAps.map(
                (a) =>
                  dMap.get(a.ap_name)?.alerts_users_breakdown?.[cat.key] ??
                  dMap.get(a.ap_name)?.[cat.apField] ??
                  0
              ),
              backgroundColor: cat.color,
              borderColor: dIdx === 1 ? "#ffffff" : "transparent",
              borderWidth: dIdx === 1 ? 1 : 0,
              stack: d.day_label,
            });
          });
        });
      } else {
        const apGbByDay = [];
        compDays.slice(0, 2).forEach((d, dIdx) => {
          const dMap = apDayMaps[dIdx];
          const countsArr = compareTopAps.map((a) => getApIssueCount(dMap.get(a.ap_name)));
          const usersArr = compareTopAps.map((a) => getApTotalUsers(dMap.get(a.ap_name)));
          const pctsArr = compareTopAps.map((a) => getApIssuePct(dMap.get(a.ap_name)));
          const gbArr = compareTopAps.map((a) => toGb(dMap.get(a.ap_name)?.usage_mb));
          apGbByDay.push({ day: d, gbArr });

          const dataArr =
            compareAlertMetric === "users"
              ? usersArr
              : compareAlertMetric === "traffic"
              ? gbArr
              : countsArr;

          apDatasets.push({
            label: buildDayLegendLabel(dIdx, d),
            dayIdx: dIdx,
            dayLabel: d.day_label,
            data: dataArr,
            backgroundColor: dIdx === 0 ? "rgba(37, 99, 235, 0.72)" : "rgba(21, 128, 61, 0.76)",
            borderColor: dIdx === 0 ? "#3b82f6" : "#22c55e",
            borderWidth: 1.4,
            borderRadius: 6,
            categoryPercentage: 0.78,
            barPercentage: 0.88,
            order: 2,
            yAxisID: "y",
            barBadgeColor: dIdx === 0 ? "#93c5fd" : "#86efac",
            skipFallbackMerge: compareAlertMetric === "traffic",
            barBadgeFmt: (i) => {
              if (compareAlertMetric === "users") return usersArr[i] > 0 ? `${usersArr[i]}u` : "";
              if (compareAlertMetric === "traffic") {
                const g = gbArr[i] || 0;
                if (g <= 0) return "";
                return `${g >= 100 ? Math.round(g) : g.toFixed(1)}G`;
              }
              return countsArr[i] > 0 ? `${countsArr[i]}u` : "";
            },
            barInnerPctFmt: (i) => {
              if (compareAlertMetric === "traffic") return usersArr[i] > 0 ? `${usersArr[i]}u` : "";
              if (compareAlertMetric === "users") return usersArr[i] > 0 ? `${pctsArr[i]}%` : "";
              return countsArr[i] > 0 ? `${pctsArr[i]}%` : "";
            },
          });
        });

        if (showApCompareTrafficLines) {
          apGbByDay.forEach(({ day, gbArr }, dIdx) => {
            const st = TRAFFIC_LINE_BRIGHT[dIdx];
            apDatasets.push({
              type: "line",
              isTrafficLine: true,
              label: `Tráfico Día ${dIdx + 1} (${day.day_label}) GB`,
              dayIdx: dIdx,
              dayLabel: day.day_label,
              data: gbArr,
              yAxisID: "yGb",
              borderColor: st.color,
              backgroundColor: st.color,
              borderWidth: 2.8,
              pointStyle: st.pt,
              pointBackgroundColor: st.color,
              pointBorderColor: "#ffffff",
              pointBorderWidth: 1.8,
              pointRadius: st.radius,
              pointHoverRadius: st.hoverRadius,
              pointHitRadius: 12,
              tension: 0.25,
              order: 0,
            });
          });
        }
      }

      const apXLabels = compareTopAps.map((a) =>
        isSingleFloorSelected ? a.ap_name : [a.ap_name, a.floor || "--"]
      );

      charts.clientApFailures = new Chart(apFailCanvas, {
        type: "bar",
        plugins: showApStackedAlerts ? [] : [alertBarValuePlugin],
        data: { labels: apXLabels, datasets: apDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: true },
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const first = elements[0];
              const ds = apDatasets[first.datasetIndex];
              if (showApStackedAlerts && ds?.fullCat) {
                selectHierarchyIssueType(ds.fullCat);
                return;
              }
              const apObj = compareTopAps[first.index];
              if (apObj?.ap_name) quickFilterByAp(apObj.ap_name);
            }
          },
          plugins: {
            legend: !showApStackedAlerts
              ? buildComboLegendOptions(9.5)
              : {
                  labels: {
                    color: "#cbd5e1",
                    font: { size: 9 },
                    boxWidth: 9,
                    filter: (item) => item.datasetIndex < alertCategoryMap.length,
                    generateLabels: (chart) =>
                      Chart.defaults.plugins.legend.labels.generateLabels(chart).map((b) => ({
                        ...b,
                        text: b.text.replace(` (${d0.day_label})`, ""),
                      })),
                  },
                },
            tooltip: {
              callbacks: {
                title: (items) => {
                  if (!items?.length) return "";
                  const ap = compareTopAps[items[0].dataIndex];
                  const ds = items[0].dataset || {};
                  return ap ? `${ap.ap_name} (${ap.floor})${ds.dayLabel ? ` — ${ds.dayLabel}` : ""}` : "";
                },
                label: (ctx) => {
                  const ds = ctx.dataset || {};
                  const v = ctx.parsed.y;
                  if (ds.isTrafficLine || compareAlertMetric === "traffic") {
                    return ` ${ds.label}: ${v} GB`;
                  }
                  if (showApStackedAlerts) return ` ${ds.label}: ${v}u`;
                  const dMap = apDayMaps[ds.dayIdx];
                  const apName = compareTopAps[ctx.dataIndex]?.ap_name;
                  const aObj = dMap?.get(apName);
                  const totU = getApTotalUsers(aObj);
                  const pct = getApIssuePct(aObj);
                  return compareAlertMetric === "users"
                    ? ` Usuarios totales: ${v}u (${pct}% con falla)`
                    : ` Usuarios con falla: ${v}u de ${totU}u (${pct}%)`;
                },
                afterBody: (items) => {
                  if (!items?.length) return [];
                  const ds = items[0].dataset || {};
                  if (ds.isTrafficLine || compareAlertMetric === "traffic" || !alarmSpec?.formatMetric) return [];
                  const apItem = compareTopAps[items[0].dataIndex];
                  if (!apItem) return [];
                  const subMap = ds.dayIdx === 0 ? subD0ApMap : subD1ApMap;
                  const baseMap = ds.dayIdx === 0 ? d0ApMap : d1ApMap;
                  const sa = subMap?.get(apItem.ap_name) || baseMap?.get(apItem.ap_name);
                  return sa ? [`• ${alarmSpec.formatMetric(sa)}`] : [];
                },
              },
            },
          },
          scales: showApStackedAlerts
            ? {
                x: { stacked: true, ticks: { color: "#cbd5e1", font: { size: 9 }, maxRotation: 0 } },
                y: { stacked: true, beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
              }
            : {
                x: { ticks: { color: "#cbd5e1", font: { size: 9 }, maxRotation: 0, minRotation: 0 } },
                y: {
                  position: "left",
                  beginAtZero: true,
                  grace: "18%",
                  title: { display: true, text: yAxisMetricTitle, color: "#38bdf8", font: { size: 10, weight: "bold" } },
                  ticks: { color: "#94a3b8" },
                  grid: { color: "#1e293b" },
                },
                ...(showApCompareTrafficLines
                  ? {
                      yGb: {
                        position: "right",
                        beginAtZero: true,
                        grace: "18%",
                        title: {
                          display: true,
                          text: "Tráfico (GB)",
                          color: "#00e5ff",
                          font: { size: 10, weight: "bold" },
                        },
                        ticks: {
                          color: "#cbd5e1",
                          font: { size: 9 },
                          callback: (v) => `${v}G`,
                        },
                        grid: { drawOnChartArea: false },
                      },
                    }
                  : {}),
              },
        },
      });
    }
  } else {
    // =========================================================================
    // MODO 1 DÍA ESPECÍFICO / ACUMULADO TOTAL: (1) Top Pisos | (2) Top APs
    // =========================================================================
    if (!isSingleFloorSelected) {
      const titleFloorProbEl = document.getElementById("title-client-floor-problems");
      if (titleFloorProbEl) {
        titleFloorProbEl.textContent = alarmSpec
          ? `1. Pisos con ${alarmSpec.short}`
          : "1. Pisos con Fallas";
      }
      mountCleanFloorChart({
        canvasEl: document.getElementById("chart-client-floor-problems"),
        chartKey: "clientFloorProblems",
        floorItems: topFloors,
        getFloor: (f) => f,
        getSubFloor: (f) => subFloorMap.get(f.floor),
        getOtherDayFloor: null,
        otherDayLabel: "",
        sharedScales: null,
      });
    }

    const allCandidateAps = (data.ap_summary || apRank).filter((a) => a.ap_name && a.ap_name !== "Sin AP");
    const topFailAps = (alarmSpec ? [...allCandidateAps] : [...apRank])
      .sort(
        (a, b) =>
          getApIssueCount(b) - getApIssueCount(a) ||
          getApTotalUsers(b) - getApTotalUsers(a)
      )
      .slice(0, isSingleFloorSelected ? 12 : 8);
    const subApMap = new Map(
      ((hasIssueSub ? data.issue_filtered?.ap_summary : null) || topFailAps).map((a) => [a.ap_name, a])
    );

    const titleApFailEl = document.getElementById("title-client-ap-failures");
    if (titleApFailEl) {
      const apTitlePrefix = isSingleFloorSelected ? "Top APs" : "2. Top APs";
      const floorSuffix = isSingleFloorSelected ? ` — ${selectedFloorFilter}` : "";
      titleApFailEl.textContent = alarmSpec
        ? `${apTitlePrefix} con ${alarmSpec.short}${floorSuffix}`
        : `${apTitlePrefix} con Fallas${floorSuffix}`;
    }
    mountCleanApChart({
      canvasEl: document.getElementById("chart-client-ap-failures"),
      chartKey: "clientApFailures",
      apItems: topFailAps,
      getAp: (a) => a,
      getSubAp: (a) => subApMap.get(a.ap_name),
      getOtherDayAp: null,
      otherDayLabel: "",
      sharedScales: null,
    });
  }

  // =========================================================================
  // 5. FALLAS POR TIPO DE DISPOSITIVO / MODELO — Sincronizado con Alerta Activa
  // =========================================================================
  const devModelsCanvas = document.getElementById("chart-alert-device-models");
  destroyChart("alertDeviceModels");
  if (devModelsCanvas) {
    const dimFieldMap = {
      model: "device_model_summary",
      vendor: "device_vendor_summary",
      os: "device_os_summary",
    };
    const dimField = dimFieldMap[deviceAlertGroupMode] || "device_model_summary";
    const devToggleEl = document.getElementById("device-models-chart-mode-toggle");
    if (devToggleEl) {
      const dBtn = (key, txt) => `
        <button type="button" onclick="setDeviceAlertGroupMode('${key}')" class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold border transition ${
          deviceAlertGroupMode === key
            ? "bg-sky-500/25 text-sky-200 border-sky-400 shadow"
            : "bg-slate-950 text-slate-400 border-slate-700 hover:text-white"
        }">${txt}</button>`;
      devToggleEl.innerHTML = `${dBtn("model", "Modelo / Tipo")}${dBtn("vendor", "Fabricante")}${dBtn("os", "SO")}`;
    }

    const titleDevEl = document.getElementById("title-alert-device-models");
    if (titleDevEl) {
      const dimNoun =
        deviceAlertGroupMode === "vendor"
          ? "Fabricantes"
          : deviceAlertGroupMode === "os"
          ? "Sistemas Operativos"
          : "Tipo de Dispositivo / Modelo";
      titleDevEl.textContent = alarmSpec
        ? `5. Fallas por ${dimNoun} (${alarmSpec.short})`
        : `5. Fallas por ${dimNoun}`;
    }

    const getDimTotalUsers = (d) => (d ? d.unique_users ?? d.total_clients ?? 0 : 0);
    const getDimIssueCount = (d) => {
      if (!d) return 0;
      if (alarmSpec) {
        return d.alerts_users_breakdown?.[alarmSpec.floorAlertKey] ?? 0;
      }
      return d.issue_users ?? d.issue_clients ?? 0;
    };
    const getDimIssuePct = (d) => {
      const totU = getDimTotalUsers(d);
      if (!totU) return 0;
      return Math.round((getDimIssueCount(d) / totU) * 1000) / 10;
    };

    const rawDimList = data[dimField] || [];
    const subDimMap = new Map(
      ((hasIssueSub ? data.issue_filtered?.[dimField] : null) || rawDimList).map((x) => [x.name, x])
    );

    if (isTwoDayFloorCompare && compDays.length >= 2) {
      const d0 = compDays[0];
      const d1 = compDays[1];
      const d0Map = new Map((d0[dimField] || []).map((x) => [x.name, x]));
      const d1Map = new Map((d1[dimField] || []).map((x) => [x.name, x]));
      const allNames = Array.from(new Set([...d0Map.keys(), ...d1Map.keys()]));
      const topCompareDims = allNames
        .map((nm) => {
          const o0 = d0Map.get(nm);
          const o1 = d1Map.get(nm);
          return {
            name: nm,
            short_name: o0?.short_name || o1?.short_name || nm,
            score: getDimIssueCount(o0) + getDimIssueCount(o1),
            totScore: getDimTotalUsers(o0) + getDimTotalUsers(o1),
          };
        })
        .sort((a, b) => b.score - a.score || b.totScore - a.totScore)
        .slice(0, 8);

      const cmpDatasets = [d0, d1].map((dObj, idx) => {
        const pal = DAY_PALETTE[idx % DAY_PALETTE.length];
        const mp = idx === 0 ? d0Map : d1Map;
        const vals = topCompareDims.map((it) => {
          const o = mp.get(it.name);
          if (compareAlertMetric === "users") return getDimTotalUsers(o);
          if (compareAlertMetric === "traffic") return toGb(o?.usage_mb);
          return getDimIssueCount(o);
        });
        const pcts = topCompareDims.map((it) => getDimIssuePct(mp.get(it.name)));
        return {
          isFailBar: compareAlertMetric !== "users",
          dayIdx: idx,
          dayLabel: dObj.day_label,
          label: `${dObj.day_label}`,
          data: vals,
          backgroundColor: pal.bar,
          borderColor: pal.border,
          borderWidth: 1.2,
          borderRadius: 5,
          barBadgeColor: "#fff1f2",
          barBadgeFmt: (i) =>
            vals[i] > 0 ? (compareAlertMetric === "traffic" ? `${vals[i]}G` : `${vals[i]}u`) : "",
          barInnerPctFmt: (i) =>
            compareAlertMetric !== "traffic" && vals[i] > 0 ? `${pcts[i]}%` : "",
          yAxisID: "y",
          order: 2,
        };
      });

      charts.alertDeviceModels = new Chart(devModelsCanvas, {
        type: "bar",
        plugins: [alertBarValuePlugin],
        data: {
          labels: topCompareDims.map((it) => it.short_name),
          datasets: cmpDatasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: true },
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const it = topCompareDims[elements[0].index];
              if (it?.name) quickFilterAlertClientsTable(it.name);
            }
          },
          plugins: {
            legend: buildComboLegendOptions(9.5),
            tooltip: {
              callbacks: {
                title: (items) => {
                  if (!items?.length) return "";
                  const it = topCompareDims[items[0].dataIndex];
                  const ds = items[0].dataset || {};
                  return it ? `${it.name} — ${ds.dayLabel || ""}` : "";
                },
                label: (ctx) => {
                  const ds = ctx.dataset || {};
                  const it = topCompareDims[ctx.dataIndex];
                  const mp = ds.dayIdx === 0 ? d0Map : d1Map;
                  const o = mp.get(it?.name);
                  if (compareAlertMetric === "traffic") return ` Tráfico: ${ctx.parsed.y} GB`;
                  const totU = getDimTotalUsers(o);
                  const pct = getDimIssuePct(o);
                  return compareAlertMetric === "users"
                    ? ` Usuarios totales: ${ctx.parsed.y}u (${pct}% con falla)`
                    : ` Usuarios con falla: ${ctx.parsed.y}u de ${totU}u (${pct}%)`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: "#e2e8f0", font: { size: 9.5, weight: "600" }, maxRotation: 0, minRotation: 0, autoSkip: false } },
            y: {
              beginAtZero: true,
              grace: "18%",
              ticks: { color: "#94a3b8" },
              grid: { color: "#1e293b" },
            },
          },
        },
      });
    } else {
      const topDims = [...rawDimList]
        .filter((d) => getDimTotalUsers(d) > 0)
        .sort((a, b) => getDimIssueCount(b) - getDimIssueCount(a) || getDimTotalUsers(b) - getDimTotalUsers(a))
        .slice(0, 8);

      const dUsersArr = topDims.map((d) => getDimTotalUsers(d));
      const dFailArr = topDims.map((d) => getDimIssueCount(d));
      const dPctsArr = topDims.map((d) => getDimIssuePct(d));
      const dimDatasets = [];

      if (showAlertChartTraffic && topDims.length > 0) {
        dimDatasets.push({
          type: "line",
          isTrafficLine: true,
          label: "Tráfico Total (GB)",
          data: topDims.map((d) => toGb(d.usage_mb)),
          borderColor: "#facc15",
          backgroundColor: "#facc15",
          pointBackgroundColor: "#0f172a",
          pointBorderColor: "#facc15",
          pointBorderWidth: 2.2,
          pointStyle: "rect",
          borderWidth: 3.3,
          borderDash: [2, 8],
          borderCapStyle: "round",
          pointRadius: 5,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y2",
          order: 1,
        });
      }
      if (showAlertChartUsers) {
        dimDatasets.push({
          isUsersBar: true,
          label: "Usuarios del Modelo",
          data: dUsersArr,
          backgroundColor: "rgba(56, 189, 248, 0.30)",
          borderColor: "rgba(56, 189, 248, 0.80)",
          borderWidth: 1.1,
          borderRadius: 5,
          barBadgeColor: "#7dd3fc",
          barBadgeFmt: (i) => (dUsersArr[i] > 0 ? `${dUsersArr[i]}u` : ""),
          yAxisID: "y",
          order: 2,
        });
      }
      dimDatasets.push({
        isFailBar: true,
        label: alarmSpec ? `Usuarios con ${alarmSpec.short}` : "Usuarios con Fallas",
        data: dFailArr,
        backgroundColor: alarmSpec ? alarmSpec.color : "rgba(244, 63, 94, 0.78)",
        borderColor: alarmSpec ? alarmSpec.border : "#fb7185",
        borderWidth: 1.2,
        borderRadius: 5,
        barBadgeColor: "#fff1f2",
        barBadgeFmt: (i) => (dFailArr[i] > 0 ? `${dFailArr[i]}u` : ""),
        barInnerPctFmt: (i) => (dFailArr[i] > 0 ? `${dPctsArr[i]}%` : ""),
        yAxisID: "y",
        order: 2,
      });

      charts.alertDeviceModels = new Chart(devModelsCanvas, {
        type: "bar",
        plugins: [alertBarValuePlugin],
        data: {
          labels: topDims.map((d) => d.short_name || d.name),
          datasets: dimDatasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: true },
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const item = topDims[elements[0].index];
              if (item?.name) quickFilterAlertClientsTable(item.name);
            }
          },
          plugins: {
            legend: buildComboLegendOptions(9.5),
            tooltip: {
              callbacks: {
                title: (items) => {
                  if (!items?.length) return "";
                  const d = topDims[items[0].dataIndex];
                  return d ? `${d.name}` : "";
                },
                label: (ctx) => {
                  const ds = ctx.dataset || {};
                  const v = ctx.parsed.y;
                  if (ds.isTrafficLine) return ` ${ds.label}: ${v} GB`;
                  if (ds.isUsersBar) return ` ${ds.label}: ${v}u`;
                  const dObj = topDims[ctx.dataIndex];
                  const totU = getDimTotalUsers(dObj);
                  const pct = getDimIssuePct(dObj);
                  return ` ${ds.label}: ${v}u de ${totU}u (${pct}%)`;
                },
                afterBody: (items) => {
                  if (!items?.length) return [];
                  const ds = items[0].dataset || {};
                  if (!ds.isFailBar) return [];
                  const dObj = topDims[items[0].dataIndex];
                  if (!dObj) return [];
                  const subObj = subDimMap.get(dObj.name) || dObj;
                  const extra = [];
                  if (dObj.top_floor && dObj.top_floor !== "--") {
                    extra.push(`• Piso con más fallas: ${dObj.top_floor}`);
                  }
                  if (alarmSpec?.formatMetric && subObj) {
                    extra.push(`• ${alarmSpec.formatMetric(subObj)}`);
                  }
                  return extra;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "#e2e8f0", font: { size: 9.5, weight: "600" }, maxRotation: 0, minRotation: 0, autoSkip: false },
            },
            y: {
              position: "left",
              min: 0,
              grace: "16%",
              title: {
                display: true,
                text: showAlertChartUsers ? `Usuarios / ${alarmSpec ? alarmSpec.short : "Con Fallas"}` : alarmSpec ? alarmSpec.short : "Con Fallas",
                color: "#38bdf8",
                font: { size: 10 },
              },
              ticks: { color: "#94a3b8" },
              grid: { color: "#1e293b" },
            },
            y2: {
              display: showAlertChartTraffic && topDims.length > 0,
              position: "right",
              min: 0,
              title: {
                display: true,
                text: "Tráfico (GB) •••",
                color: "#facc15",
                font: { size: 9.5, weight: "bold" },
              },
              ticks: { color: "#fde047", font: { size: 9 } },
              grid: { drawOnChartArea: false },
            },
          },
        },
      });
    }
  }

  // Renderizar Tabla de Clientes Relacionados con las Fallas directamente debajo de las 6 gráficas
  renderAlertRelatedClientsTable(data);

  // TABLA: Ranking de APs y Pisos según Fallos de Clientes
  const tbodyFail = document.getElementById("table-client-ap-failures");
  if (tbodyFail) {
    tbodyFail.innerHTML = apRank
      .map((a, idx) => {
        const failBadge =
          a.failure_rate_pct >= 50
            ? `<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">${a.issue_clients} (${a.failure_rate_pct}%)</span>`
            : a.failure_rate_pct >= 25
            ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">${a.issue_clients} (${a.failure_rate_pct}%)</span>`
            : `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${a.issue_clients} (${a.failure_rate_pct}%)</span>`;

        return `
        <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="quickFilterByAp('${a.ap_name}')">
          <td class="py-2 px-2.5 font-bold text-sky-400">#${idx + 1} ${a.ap_name}</td>
          <td class="py-2 px-2.5 font-semibold text-emerald-300">${a.floor}</td>
          <td class="py-2 px-2.5 text-center font-bold text-white">${a.client_count} <span class="text-[10px] text-sky-300">(${a.unique_users || a.client_count} usu.)</span></td>
          <td class="py-2 px-2.5 text-center font-semibold text-emerald-400">${a.healthy_clients}</td>
          <td class="py-2 px-2.5 text-center">${failBadge}</td>
          <td class="py-2 px-2.5 text-center ${a.high_retry_clients > 0 ? "text-rose-400 font-bold" : "text-slate-500"}">${a.high_retry_clients} <span class="text-[10px] text-slate-400">(${a.avg_retries}% prom)</span></td>
          <td class="py-2 px-2.5 text-center ${(a.slow_auth_clients || 0) > 0 ? "text-purple-300 font-bold" : "text-slate-500"}">${a.slow_auth_clients || 0} <span class="text-[10px] text-slate-400">(${a.avg_auth_ms}ms)</span></td>
          <td class="py-2 px-2.5 text-center ${a.slow_onb_clients > 0 ? "text-indigo-300 font-bold" : "text-slate-500"}">${a.slow_onb_clients}</td>
          <td class="py-2 px-2.5 text-center ${a.high_latency_clients > 0 ? "text-amber-300 font-bold" : "text-slate-500"}">${a.high_latency_clients} <span class="text-[10px] text-slate-400">(${a.avg_be_lat}ms)</span></td>
          <td class="py-2 px-2.5 text-[11px] text-slate-200">${a.top_failure_cause}</td>
          <td class="py-2 px-2.5 text-right">
            <button type="button" onclick="event.stopPropagation(); quickFilterByAp('${a.ap_name}')" class="px-2 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 text-[10px] font-semibold">
              Aislar AP
            </button>
          </td>
        </tr>`;
      })
      .join("");
  }
}

let alertRelatedClientsLimit = 80;

function filterAlertRelatedClientsInstant(val) {
  alertRelatedClientsLimit = 80;
  const clearBtn = document.getElementById("btn-clear-alert-clients-search");
  if (clearBtn) clearBtn.classList.toggle("hidden", !val || !val.trim());
  if (currentData) renderAlertRelatedClientsTable(currentData);
}

function clearAlertRelatedClientsSearch() {
  const inp = document.getElementById("alert-related-clients-search");
  if (inp) inp.value = "";
  const clearBtn = document.getElementById("btn-clear-alert-clients-search");
  if (clearBtn) clearBtn.classList.add("hidden");
  alertRelatedClientsLimit = 80;
  if (currentData) renderAlertRelatedClientsTable(currentData);
}

function showMoreAlertRelatedClients(step) {
  if (!currentData) return;
  if (step === "ALL") {
    alertRelatedClientsLimit = 999999;
  } else {
    alertRelatedClientsLimit += step || 150;
  }
  renderAlertRelatedClientsTable(currentData);
}

function filterIssuesForCategory(issuesArr, fullCat) {
  const list = Array.isArray(issuesArr) ? issuesArr : [];
  if (!fullCat || fullCat === "ALL") return list;
  const rxMap = {
    "Retransmisiones Altas (>=25%)": /^Retransmisiones/i,
    "Auth 802.1X: Red / ISE (>=6s)": /^Auth ISE\/Red/i,
    "Auth 802.1X: Espera Suplicante (>=6s)": /^Espera Suplicante/i,
    "Asociación Lenta (>2s)": /^Asociaci[óo]n/i,
    "DHCP Lento (>2s)": /^DHCP/i,
    "Roaming Lento (>3s)": /^Roaming/i,
    "Latencia QoS Alta (Voz/Datos)": /^Latencia/i,
    "Señal RF Débil / Sticky": /^Se[ñn]al/i,
  };
  const rx = rxMap[fullCat];
  return rx ? list.filter((iss) => rx.test(String(iss || "").trim())) : list;
}

function getFocusedClientMetricSpec(c, fullCat) {
  if (!fullCat || fullCat === "ALL") return null;
  if (fullCat === "Latencia QoS Alta (Voz/Datos)") {
    const parts = [];
    if (c.voice_lat !== null && c.voice_lat !== undefined && c.voice_lat > 100) {
      parts.push(`<span class="text-amber-300 font-extrabold">Voz: ${Math.round(c.voice_lat)} ms</span>`);
    }
    if (c.be_lat !== null && c.be_lat !== undefined && c.be_lat > 150) {
      parts.push(`<span class="text-amber-300 font-extrabold">Datos: ${Math.round(c.be_lat)} ms</span>`);
    }
    if (c.video_lat !== null && c.video_lat !== undefined && c.video_lat > 100) {
      parts.push(`<span class="text-amber-300 font-extrabold">Video: ${Math.round(c.video_lat)} ms</span>`);
    }
    if (!parts.length) {
      parts.push(
        `<span class="text-slate-300">Voz: ${c.voice_lat ?? "--"} ms • Datos: ${c.be_lat ?? "--"} ms</span>`
      );
    }
    return {
      header: "Valor Latencia (ms)",
      badgeBorder: "bg-amber-500/20 text-amber-200 border-amber-500/40",
      valueHtml: parts.join(' <span class="text-slate-500">•</span> '),
    };
  }
  if (fullCat === "Retransmisiones Altas (>=25%)") {
    return {
      header: "Valor Retries (%)",
      badgeBorder: "bg-rose-500/20 text-rose-200 border-rose-500/40",
      valueHtml: `<span class="${(c.retries || 0) >= 25 ? "text-rose-400 font-extrabold" : "text-slate-300"}">${c.retries ?? 0}%</span>`,
    };
  }
  if (fullCat === "Auth 802.1X: Red / ISE (>=6s)") {
    const ms = c.auth_ms;
    const srv = c.auth_server && c.auth_server !== "--" ? ` <span class="text-slate-400 font-normal">• ISE ${c.auth_server}</span>` : "";
    return {
      header: "Demora Auth ISE / Red",
      badgeBorder: "bg-purple-500/20 text-purple-200 border-purple-500/40",
      valueHtml: `<span class="${(ms || 0) >= 6000 ? "text-purple-300 font-extrabold" : "text-slate-300"}">${
        ms !== null && ms !== undefined ? `${Math.round(ms)} ms (${(ms / 1000).toFixed(1)}s)` : "--"
      }${srv}</span>`,
    };
  }
  if (fullCat === "Auth 802.1X: Espera Suplicante (>=6s)") {
    const ms = c.auth_ms;
    return {
      header: "Espera Suplicante Cliente",
      badgeBorder: "bg-pink-500/20 text-pink-200 border-pink-500/40",
      valueHtml: `<span class="${(ms || 0) >= 6000 ? "text-pink-300 font-extrabold" : "text-slate-300"}">${
        ms !== null && ms !== undefined ? `${Math.round(ms)} ms (${(ms / 1000).toFixed(1)}s)` : "--"
      }</span>`,
    };
  }
  if (fullCat === "Asociación Lenta (>2s)") {
    const ms = c.assoc_ms;
    return {
      header: "Valor Asociación",
      badgeBorder: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
      valueHtml: `<span class="${(ms || 0) > 2000 ? "text-emerald-300 font-extrabold" : "text-slate-300"}">${
        ms !== null && ms !== undefined ? `${Math.round(ms)} ms (${(ms / 1000).toFixed(1)}s)` : "--"
      }</span>`,
    };
  }
  if (fullCat === "DHCP Lento (>2s)") {
    const ms = c.dhcp_ms;
    return {
      header: "Valor DHCP",
      badgeBorder: "bg-sky-500/20 text-sky-200 border-sky-500/40",
      valueHtml: `<span class="${(ms || 0) > 2000 ? "text-sky-300 font-extrabold" : "text-slate-300"}">${
        ms !== null && ms !== undefined ? `${Math.round(ms)} ms (${(ms / 1000).toFixed(1)}s)` : "--"
      }</span>`,
    };
  }
  if (fullCat === "Roaming Lento (>3s)") {
    const ms = c.roam_ms;
    return {
      header: "Valor Roaming",
      badgeBorder: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
      valueHtml: `<span class="${(ms || 0) > 3000 ? "text-indigo-300 font-extrabold" : "text-slate-300"}">${
        ms !== null && ms !== undefined ? `${Math.round(ms)} ms (${(ms / 1000).toFixed(1)}s)` : "--"
      }</span>`,
    };
  }
  if (fullCat === "Señal RF Débil / Sticky") {
    return {
      header: "Valor Señal RF",
      badgeBorder: "bg-teal-500/20 text-teal-200 border-teal-500/40",
      valueHtml: `<span class="${c.rssi !== null && c.rssi < -79 ? "text-teal-300 font-extrabold" : "text-slate-300"}">${
        c.rssi !== null && c.rssi !== undefined ? `${c.rssi} dBm` : "--"
      }${c.snr !== null && c.snr !== undefined ? ` <span class="text-slate-400 font-normal">• SNR ${c.snr} dB</span>` : ""}</span>`,
    };
  }
  return null;
}

function renderAlertRelatedClientsTable(data) {
  const tbody = document.getElementById("table-alert-related-clients");
  if (!tbody) return;

  const alarmSpec = getActiveAlarmSpec(data);
  const activeFullCat = alarmSpec?.fullCat || "ALL";
  const isFocusedCat = activeFullCat !== "ALL";
  const showFocusedRssi = isFocusedCat && activeFullCat !== "Señal RF Débil / Sticky";
  const theadTr = document.getElementById("thead-alert-related-clients");
  if (theadTr) {
    if (isFocusedCat) {
      const hdrSpec = getFocusedClientMetricSpec({}, activeFullCat);
      theadTr.innerHTML = `
        <th class="py-2 px-2.5">Usuario / Hostname</th>
        <th class="py-2 px-2.5">MAC / IPv4</th>
        <th class="py-2 px-2.5">AP Asociado / Piso</th>
        <th class="py-2 px-2.5 text-center">Día / Banda</th>
        ${showFocusedRssi ? `<th class="py-2 px-2.5 text-center">RSSI / SNR</th>` : ""}
        <th class="py-2 px-2.5 text-center text-amber-300">${hdrSpec ? hdrSpec.header : "Valor Medido"}</th>
        <th class="py-2 px-2.5">Falla Seleccionada</th>
      `;
    } else {
      theadTr.innerHTML = `
        <th class="py-2 px-2.5">Usuario / Hostname</th>
        <th class="py-2 px-2.5">MAC / IPv4</th>
        <th class="py-2 px-2.5">AP Asociado / Piso</th>
        <th class="py-2 px-2.5 text-center">Día / Banda</th>
        <th class="py-2 px-2.5 text-center">RSSI / SNR</th>
        <th class="py-2 px-2.5 text-center text-rose-300">Retries %</th>
        <th class="py-2 px-2.5 text-center text-amber-300">Tiempos (Asoc | Auth | DHCP | Roam)</th>
        <th class="py-2 px-2.5 text-center">Latencia / Tráfico</th>
        <th class="py-2 px-2.5">Fallas Detectadas</th>
      `;
    }
  }

  const selectedFloor = document.getElementById("filter-client-floor")?.value || "ALL";
  const selectedAp = document.getElementById("filter-ap")?.value || "ALL";
  const q = (document.getElementById("alert-related-clients-search")?.value || "").trim().toLowerCase();

  // Conservar el índice original dentro de data.clients para abrir el modal de 57 variables con showClientModal(origIdx)
  let issueEntries = (data.clients || [])
    .map((c, origIdx) => ({ c, origIdx }))
    .filter(({ c }) => {
      if (isFocusedCat) return (c.issue_categories || []).includes(activeFullCat);
      return (c.issue_count || 0) > 0 || (c.issues && c.issues.length > 0);
    });

  if (q) {
    issueEntries = issueEntries.filter(({ c }) => {
      const hay = `${c.user_id || ""} ${c.hostname || ""} ${c.device_model || ""} ${c.device_type || ""} ${c.vendor_clean || ""} ${c.vendor || ""} ${c.os || ""} ${c.mac || ""} ${c.ipv4 || ""} ${c.ap_name || ""} ${c.floor || ""} ${(c.issues || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // Ordenar por mayor criticidad según la alerta activa
  const alertKey = alarmSpec?.floorAlertKey || "all";
  issueEntries.sort((a, b) => {
    const ca = a.c;
    const cb = b.c;
    if (alertKey === "retries") return (cb.retries || 0) - (ca.retries || 0);
    if (alertKey === "auth_slow" || alertKey === "auth_supplicant") return (cb.auth_ms || 0) - (ca.auth_ms || 0);
    if (alertKey === "dhcp_slow") return (cb.dhcp_ms || 0) - (ca.dhcp_ms || 0);
    if (alertKey === "roam_slow") return (cb.roam_ms || 0) - (ca.roam_ms || 0);
    if (alertKey === "assoc_slow") return (cb.assoc_ms || 0) - (ca.assoc_ms || 0);
    if (alertKey === "latency") {
      return Math.max(cb.voice_lat || 0, cb.be_lat || 0) - Math.max(ca.voice_lat || 0, ca.be_lat || 0);
    }
    if (alertKey === "rf_signal") return (ca.rssi ?? 0) - (cb.rssi ?? 0);
    return (
      (cb.issue_count || 0) - (ca.issue_count || 0) ||
      (cb.retries || 0) - (ca.retries || 0) ||
      (cb.auth_ms || 0) - (ca.auth_ms || 0)
    );
  });

  // Calcular usuarios únicos con la misma llave exacta del backend
  const uniqueUserSet = new Set(
    issueEntries.map(({ c }) => {
      const uid = String(c.user_id || "").trim();
      if (uid && uid !== "--") return uid;
      const mac = String(c.mac || "").trim();
      return mac && mac !== "--" ? `mac:${mac}` : `idx:${c.id || Math.random()}`;
    })
  );

  const titleEl = document.getElementById("title-alert-related-clients");
  if (titleEl) {
    const scopeParts = [];
    if (alarmSpec) scopeParts.push(alarmSpec.short);
    else scopeParts.push("Todas las Fallas");
    if (selectedFloor !== "ALL") scopeParts.push(selectedFloor);
    if (selectedAp !== "ALL") scopeParts.push(selectedAp);
    titleEl.textContent = `Clientes Relacionados con Fallas (${scopeParts.join(" • ")})`;
  }

  const badgeEl = document.getElementById("badge-alert-related-clients");
  if (badgeEl) {
    badgeEl.textContent = `${uniqueUserSet.size} usuarios únicos • ${issueEntries.length} sesiones con falla`;
  }

  const colCount = isFocusedCat ? (showFocusedRssi ? 7 : 6) : 9;
  if (!issueEntries.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="py-6 text-center text-slate-400">No hay clientes con fallas para los filtros actuales${q ? ` ("${q}")` : ""}.</td></tr>`;
    return;
  }

  const visible = issueEntries.slice(0, alertRelatedClientsLimit);
  const remaining = issueEntries.length - visible.length;

  const rowsHtml = visible
    .map(({ c, origIdx }) => {
      const isCorp = c.is_corporate || String(c.hostname || "").toUpperCase().startsWith("COL-");
      const shownIssues = filterIssuesForCategory(c.issues, activeFullCat);
      const mSpec = isFocusedCat ? getFocusedClientMetricSpec(c, activeFullCat) : null;
      const badgeCls = mSpec ? mSpec.badgeBorder : "bg-rose-500/15 text-rose-200 border-rose-500/30";
      const issueBadges = shownIssues
        .map(
          (iss) =>
            `<span class="inline-block px-1.5 py-0.5 mr-1 mb-0.5 rounded border ${badgeCls} text-[10px] font-semibold">${iss}</span>`
        )
        .join("");

      const commonLeftCols = `
        <td class="py-2 px-2.5">
          <div class="font-bold text-white flex flex-wrap items-center gap-1.5">
            <span>${c.user_id}</span>
            ${
              isCorp
                ? `<span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">🏢 Corp</span>`
                : `<span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">📱 Ext</span>`
            }
          </div>
          <div class="text-[10px] text-slate-400">${c.hostname} • ${
        c.device_model && !c.device_model.includes("Sin Modelo")
          ? c.device_model
          : c.os && c.os !== "--"
          ? `${c.os}${c.device_model ? ` (${c.device_model_short || "s/Mod"})` : ""}`
          : c.device_type
      }</div>
        </td>
        <td class="py-2 px-2.5 font-mono text-[11px] whitespace-nowrap">
          <div class="text-slate-200">${c.mac}</div>
          <div class="text-slate-400 text-[10px]">${c.ipv4}</div>
        </td>
        <td class="py-2 px-2.5 whitespace-nowrap">
          <button type="button" onclick="event.stopPropagation(); quickFilterByAp('${c.ap_name}')" class="font-bold text-sky-400 hover:underline text-left">${c.ap_name}</button>
          <div class="text-[10px] text-emerald-300 font-semibold">${c.floor}</div>
        </td>
        <td class="py-2 px-2.5 text-center whitespace-nowrap">
          <div class="text-[10px] font-bold text-teal-300">${c.day_label || "--"}</div>
          <div class="text-[10px] text-slate-400">${c.band || "--"} • ${c.protocol || "--"}</div>
        </td>`;

      const rssiCell = `<td class="py-2 px-2.5 text-center whitespace-nowrap">
          <span class="${c.rssi !== null && c.rssi < -79 ? "text-rose-400 font-bold" : c.rssi !== null && c.rssi < -67 ? "text-amber-300 font-semibold" : "text-slate-200"}">${c.rssi !== null ? `${c.rssi} dBm` : "--"}</span>
          <span class="text-slate-400 text-[10px]">${c.snr !== null ? `/ ${c.snr} dB` : ""}</span>
        </td>`;

      if (isFocusedCat && mSpec) {
        return `<tr class="hover:bg-slate-800/65 transition cursor-pointer" onclick="showClientModal(${origIdx})">
          ${commonLeftCols}
          ${showFocusedRssi ? rssiCell : ""}
          <td class="py-2 px-2.5 text-center font-mono text-xs whitespace-nowrap">${mSpec.valueHtml}</td>
          <td class="py-2 px-2.5">${issueBadges}</td>
        </tr>`;
      }

      const retVal = c.retries ?? 0;
      const retCls =
        retVal > 30
          ? "text-rose-400 font-extrabold"
          : retVal >= 25
          ? "text-orange-400 font-bold"
          : retVal >= 20
          ? "text-amber-300 font-semibold"
          : "text-slate-300";

      return `<tr class="hover:bg-slate-800/65 transition cursor-pointer" onclick="showClientModal(${origIdx})">
        ${commonLeftCols}
        <td class="py-2 px-2.5 text-center whitespace-nowrap">
          <span class="${c.rssi !== null && c.rssi < -79 ? "text-rose-400 font-bold" : "text-slate-200"}">${c.rssi !== null ? `${c.rssi} dBm` : "--"}</span>
          <span class="text-slate-400 text-[10px]">${c.snr !== null ? `/ ${c.snr} dB` : ""}</span>
        </td>
        <td class="py-2 px-2.5 text-center whitespace-nowrap ${retCls}">${retVal}%</td>
        <td class="py-2 px-2.5 text-center font-mono text-[10px] whitespace-nowrap">
          <span class="${(c.assoc_ms || 0) > 2000 ? "text-emerald-300 font-bold" : "text-slate-300"}">Asoc:${c.assoc_ms ?? "--"}ms</span> |
          <span class="${(c.auth_ms || 0) >= 6000 ? "text-amber-300 font-bold" : "text-slate-300"}">Auth:${c.auth_ms ?? "--"}ms</span> |
          <span class="${(c.dhcp_ms || 0) > 2000 ? "text-sky-300 font-bold" : "text-slate-300"}">DHCP:${c.dhcp_ms ?? "--"}ms</span> |
          <span class="${(c.roam_ms || 0) > 3000 ? "text-purple-300 font-bold" : "text-slate-300"}">Roam:${c.roam_ms ?? "--"}ms</span>
        </td>
        <td class="py-2 px-2.5 text-center font-mono text-[10px] whitespace-nowrap">
          <div class="${(c.voice_lat || 0) > 100 || (c.be_lat || 0) > 150 ? "text-amber-300 font-bold" : "text-slate-300"}">V:${c.voice_lat ?? "--"}ms / D:${c.be_lat ?? "--"}ms</div>
          <div class="text-indigo-300 font-semibold">${c.usage_fmt || "0 B"}</div>
        </td>
        <td class="py-2 px-2.5">${issueBadges}</td>
      </tr>`;
    })
    .join("");

  const loadMoreRow =
    remaining > 0
      ? `<tr class="bg-slate-950/95">
          <td colspan="${colCount}" class="py-2.5 text-center">
            <div class="flex flex-wrap items-center justify-center gap-2.5">
              <span class="text-[11px] text-slate-300">Mostrando <strong>${visible.length}</strong> de <strong>${issueEntries.length}</strong> sesiones con falla</span>
              <button type="button" onclick="showMoreAlertRelatedClients(150)" class="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition">
                <i class="fa-solid fa-plus mr-1"></i>Mostrar 150 más (${remaining} restantes)
              </button>
              <button type="button" onclick="showMoreAlertRelatedClients('ALL')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs transition">
                Mostrar todas (${issueEntries.length})
              </button>
            </div>
          </td>
        </tr>`
      : "";

  tbody.innerHTML = rowsHtml + loadMoreRow;
}

function renderCharts(data) {
  // Gráfico 6: Retransmisiones por Rango con Clic Interactivo, Comparativa por Día y Adaptación por Alarma
  const alarmSpec = getActiveAlarmSpec(data);
  const useSubDist = Boolean(data.has_issue_subfilter && data.issue_filtered?.distributions?.retries_bucket);
  const retDist = useSubDist
    ? data.issue_filtered.distributions.retries_bucket
    : data.distributions?.retries_bucket || {};
  const allRetLabels = Object.keys(retDist);
  const retLabels =
    alarmSpec?.floorAlertKey === "retries"
      ? allRetLabels.filter((lbl) => lbl === "25-30% (Alto)" || lbl === "> 30% (Crítico)")
      : allRetLabels;
  const bucketToCode = {
    "0-10% (Óptimo)": "0-10",
    "11-20% (Normal)": "11-20",
    "21-24% (Elevado)": "21-24",
    "25-30% (Alto)": "25-30",
    "> 30% (Crítico)": "31-100",
  };
  const bucketColors = {
    "0-10% (Óptimo)": "#10b981",
    "11-20% (Normal)": "#38bdf8",
    "21-24% (Elevado)": "#f59e0b",
    "25-30% (Alto)": "#f97316",
    "> 30% (Crítico)": "#ef4444",
  };
  const compDays = getComparisonDays(data);
  const subCompDays = getSubComparisonDays(data, compDays);
  const activeRetDays = data.has_issue_subfilter && subCompDays.length >= 2 ? subCompDays : compDays;

  const retTitleEl = document.getElementById("title-retries");
  if (retTitleEl) {
    if (alarmSpec?.floorAlertKey === "retries") {
      retTitleEl.textContent = "6. Desglose Crítico de Retries >= 25% (25-30% vs >30%)";
    } else if (alarmSpec) {
      retTitleEl.textContent = `6. Distribución de Retries (%) en ${alarmSpec.short}`;
    } else {
      retTitleEl.textContent = "6. Distribución de Retransmisiones (Retries %)";
    }
  }

  destroyChart("retries");
  const retCanvas = document.getElementById("chart-retries");
  if (retCanvas) {
    charts.retries = new Chart(retCanvas, {
      type: "bar",
      data: {
        labels: retLabels,
        datasets:
          activeRetDays.length >= 2
            ? activeRetDays.map((d, idx) => {
                const pal = DAY_PALETTE[idx % DAY_PALETTE.length];
                return {
                  label: d.day_label,
                  data: retLabels.map((lbl) => d.retries_bucket?.[lbl] || 0),
                  backgroundColor: pal.bar,
                  borderColor: pal.border,
                  borderWidth: 1,
                  borderRadius: 5,
                };
              })
            : [
                {
                  label: alarmSpec
                    ? `Clientes con ${alarmSpec.short}`
                    : "Clientes (Haz clic para filtrar rango)",
                  data: retLabels.map((lbl) => retDist[lbl] || 0),
                  backgroundColor: retLabels.map((lbl) => bucketColors[lbl] || "#ef4444"),
                  borderRadius: 6,
                },
              ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const label = retLabels[idx];
            const code = bucketToCode[label];
            if (code) quickFilterRetries(code);
          }
        },
        plugins: { legend: { display: activeRetDays.length >= 2, labels: { color: "#cbd5e1", font: { size: 9 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        },
      },
    });
  }

  // =========================================================================
  // GRÁFICAS POR TIEMPO (CLIENTES CSV 1: Hora, Bloques 15m y Duración Sesión)
  // =========================================================================
  const timeData = data.time_analytics || {};
  const hourly = timeData.hourly || [];
  const hourlyCanvas = document.getElementById("chart-time-hourly");
  if (hourlyCanvas) {
    destroyChart("timeHourly");
    charts.timeHourly = new Chart(hourlyCanvas, {
      type: "bar",
      data: {
        labels: hourly.map((h) => h.hour),
        datasets: [
          {
            label: "Clientes Conectados",
            data: hourly.map((h) => h.client_count),
            backgroundColor: "#6366f1",
            borderRadius: 5,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "% Retries Promedio",
            data: hourly.map((h) => h.avg_retries),
            borderColor: "#f43f5e",
            backgroundColor: "#f43f5e",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            yAxisID: "y1",
          },
          {
            type: "line",
            label: "Overall Health AP Prom (1-10)",
            data: hourly.map((h) => h.avg_ap_health ?? 10),
            borderColor: "#10b981",
            backgroundColor: "#10b981",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const hr = hourly[idx]?.hour;
            if (hr) {
              document.getElementById("filter-hour-slot").value = hr;
              updateTimeFilterBadges();
              fetchData().then(() => {
                const sec = document.getElementById("clients-table-section");
                if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          }
        },
        plugins: {
          legend: { labels: { color: "#cbd5e1", font: { size: 10 } } },
        },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
          y: {
            position: "left",
            title: { display: true, text: "Clientes", color: "#94a3b8", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          y1: {
            position: "right",
            title: { display: true, text: "Retries % / Health (1-10)", color: "#f43f5e", font: { size: 10 } },
            ticks: { color: "#f43f5e" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  const slot15 = timeData.slot15m || [];
  const slot15Canvas = document.getElementById("chart-time-15m");
  if (slot15Canvas) {
    destroyChart("time15m");
    charts.time15m = new Chart(slot15Canvas, {
      type: "line",
      data: {
        labels: slot15.map((s) => s.slot),
        datasets: [
          {
            label: "Ráfaga de Clientes (cada 15m)",
            data: slot15.map((s) => s.client_count),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            yAxisID: "y",
          },
          {
            label: "Overall Health AP (1-10)",
            data: slot15.map((s) => s.avg_ap_health ?? 10),
            borderColor: "#38bdf8",
            backgroundColor: "#38bdf8",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 2,
            yAxisID: "y1",
          },
          {
            label: "Onboarding Prom (s)",
            data: slot15.map((s) => s.avg_onboarding_s),
            borderColor: "#f59e0b",
            backgroundColor: "#f59e0b",
            borderDash: [4, 4],
            tension: 0.3,
            pointRadius: 2,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cbd5e1", font: { size: 10 } } },
        },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 9 } } },
          y: {
            position: "left",
            ticks: { color: "#10b981" },
            grid: { color: "#1e293b" },
          },
          y1: {
            position: "right",
            ticks: { color: "#f59e0b" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  const sessBuckets = timeData.session_buckets || {};
  const sessLabels = Object.keys(sessBuckets);
  const sessCanvas = document.getElementById("chart-session-duration");
  if (sessCanvas) {
    destroyChart("sessionDuration");
    charts.sessionDuration = new Chart(sessCanvas, {
      type: "bar",
      data: {
        labels: sessLabels,
        datasets: [
          {
            label: "Clientes por Duración de Sesión",
            data: Object.values(sessBuckets),
            backgroundColor: ["#38bdf8", "#6366f1", "#10b981", "#14b8a6", "#ef4444"],
            borderRadius: 5,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const bucket = sessLabels[idx];
            if (bucket) {
              document.getElementById("filter-session-bucket").value = bucket;
              updateTimeFilterBadges();
              fetchData().then(() => {
                const sec = document.getElementById("clients-table-section");
                if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          }
        },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#cbd5e1", font: { size: 10 } } },
        },
      },
    });
  }
}

let clientTableDisplayLimit = 150;
let clientSearchDebounceTimer = null;

function filterClientTableInstant(rawQuery) {
  const q = (rawQuery || "").trim().toLowerCase();
  const clearBtn = document.getElementById("btn-clear-clients-search");
  if (clearBtn) {
    if (q) clearBtn.classList.remove("hidden");
    else clearBtn.classList.add("hidden");
  }
  if (!currentData) return;
  if (clientSearchDebounceTimer) clearTimeout(clientSearchDebounceTimer);
  clientSearchDebounceTimer = setTimeout(() => {
    clientTableDisplayLimit = 150;
    renderUsersSummaryTable(currentData.user_summary || []);
    renderClientTable(currentData.clients || []);
  }, 120);
}

function showMoreClientRows(step) {
  if (!currentData) return;
  if (step === "ALL") {
    clientTableDisplayLimit = 999999;
  } else {
    clientTableDisplayLimit += step || 300;
  }
  renderClientTable(currentData.clients || []);
}

function clearClientTableSearch() {
  const inp = document.getElementById("clients-table-search");
  if (inp) inp.value = "";
  const clearBtn = document.getElementById("btn-clear-clients-search");
  if (clearBtn) clearBtn.classList.add("hidden");
  clientTableDisplayLimit = 150;
  if (currentData) {
    renderUsersSummaryTable(currentData.user_summary || []);
    renderClientTable(currentData.clients || []);
  }
}

function renderUsersSummaryTable(users) {
  const tbody = document.getElementById("table-users-summary");
  if (!tbody) return;
  const q = (document.getElementById("clients-table-search")?.value || "").trim().toLowerCase();
  const filteredUsers = q
    ? users.filter((u) => {
        const hay = [
          u.user_id,
          ...(u.hostnames || []),
          ...(u.macs || []),
          ...(u.devices || []),
          ...(u.aps || []),
          ...(u.floors || []),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : users;

  tbody.innerHTML = filteredUsers
    .slice(0, 60)
    .map((u) => {
      return `
      <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="quickFilterByUser('${u.user_id}')">
        <td class="py-1.5 px-2.5 font-bold text-white">${u.user_id}</td>
        <td class="py-1.5 px-2.5 text-center">
          <span class="px-2 py-0.5 rounded ${u.device_count > 1 ? "bg-indigo-500/20 text-indigo-300 font-bold" : "bg-slate-800 text-slate-300"}">${u.device_count}</span>
        </td>
        <td class="py-1.5 px-2.5 text-slate-300">${(u.devices || []).join(", ")}</td>
        <td class="py-1.5 px-2.5">
          <span class="text-sky-400 font-semibold">${(u.aps || []).join(", ")}</span>
          <span class="text-emerald-300 text-[10px] ml-1">(${(u.floors || []).join(", ")})</span>
        </td>
        <td class="py-1.5 px-2.5 text-center text-emerald-300">${u.avg_rssi} dBm</td>
        <td class="py-1.5 px-2.5 text-center">
          <span class="${(u.max_retries || 0) >= 25 ? "text-rose-400 font-bold" : "text-slate-200"}">${u.avg_retries}% / Máx: ${u.max_retries ?? 0}%</span>
        </td>
        <td class="py-1.5 px-2.5 text-right font-mono text-slate-200">${u.usage_fmt}</td>
      </tr>`;
    })
    .join("");
}

function renderClientTable(clients) {
  const tbody = document.getElementById("table-clients-body");
  if (!tbody) return;
  const q = (document.getElementById("clients-table-search")?.value || "").trim().toLowerCase();

  const indexedClients = (clients || []).map((c, origIdx) => ({ c, origIdx }));
  const matching = q
    ? indexedClients.filter(({ c }) => {
        const hay = `${c.user_id || ""} ${c.hostname || ""} ${c.mac || ""} ${c.ipv4 || ""} ${c.ap_name || ""} ${c.floor || ""} ${c.device_type || ""}`.toLowerCase();
        return hay.includes(q);
      })
    : indexedClients;

  const badgeEl = document.getElementById("clients-table-badge");
  if (badgeEl) {
    const totalBase = currentData?.unfiltered_total || clients.length;
    badgeEl.textContent = q
      ? `Coincidencias: ${matching.length} de ${clients.length} sesiones (Total: ${totalBase})`
      : `Mostrando ${clients.length} de ${totalBase} sesiones`;
  }

  if (!matching.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="py-6 text-center text-slate-400">No se encontraron sesiones para "${q}".</td></tr>`;
    return;
  }

  const visibleRows = matching.slice(0, clientTableDisplayLimit);
  const remaining = matching.length - visibleRows.length;

  const rowsHtml = visibleRows
    .map(({ c, origIdx }) => {
      const statusBadge = `<div class="text-[10px] font-bold text-teal-300"><i class="fa-solid fa-calendar-day mr-0.5"></i>${c.day_label || "--"}</div>
        <div class="text-[10px] text-slate-400">${c.ssid || "--"} • ${c.band || "--"}</div>`;

      const issueBadges =
        c.issues && c.issues.length
          ? c.issues.map((i) => `<span class="inline-block px-1.5 py-0.5 mr-1 mb-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">${i}</span>`).join("")
          : `<span class="text-emerald-400 text-[11px]"><i class="fa-solid fa-check"></i> Saludable</span>`;

      const retClass =
        (c.retries || 0) > 30
          ? "text-rose-400 font-extrabold text-sm"
          : (c.retries || 0) >= 25
          ? "text-orange-400 font-bold"
          : (c.retries || 0) >= 20
          ? "text-amber-300 font-semibold"
          : "text-slate-200";

      return `
      <tr class="hover:bg-slate-800/60 transition cursor-pointer" onclick="showClientModal(${origIdx})">
        <td class="py-2 px-2.5">
          <div class="font-bold text-white flex flex-wrap items-center gap-1.5">
            <span>${c.user_id}</span>
            <span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-[10px] font-semibold">${c.device_type && c.device_type !== "--" ? c.device_type : c.os}</span>
            ${
              c.is_corporate || String(c.hostname || "").toUpperCase().startsWith("COL-")
                ? `<span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">🏢 Corp (COL-)</span>`
                : `<span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">📱 Externo</span>`
            }
          </div>
          <div class="text-[11px] text-slate-400">${c.hostname}</div>
        </td>
        <td class="py-2 px-2.5 font-mono text-[11px]">
          <div class="text-slate-200">${c.mac}</div>
          <div class="text-slate-400">${c.ipv4}</div>
        </td>
        <td class="py-2 px-2.5">
          <div class="text-slate-200">${c.device_type}</div>
          <div class="text-[11px] text-slate-400">${c.os} • ${c.endpoint_type}</div>
        </td>
        <td class="py-2 px-2.5">
          <div class="font-semibold text-sky-400">${c.ap_name}</div>
          <div class="text-[10px] text-emerald-300 font-semibold">${c.floor}</div>
        </td>
        <td class="py-2 px-2.5 text-center">${statusBadge}</td>
        <td class="py-2 px-2.5 text-center">
          <span class="${c.rssi !== null && c.rssi < -79 ? "text-rose-400 font-bold" : "text-slate-200"}">${c.rssi !== null ? `${c.rssi} dBm` : "--"}</span>
          <span class="text-slate-400 text-[11px]">${c.snr !== null ? `/ ${c.snr} dB` : ""}</span>
        </td>
        <td class="py-2 px-2.5 text-center">
          <div class="text-slate-200">${c.protocol} <span class="text-[10px] text-indigo-300">(${c.capability})</span></div>
          <div class="text-[11px] text-slate-400">${c.data_rate} Mbps</div>
        </td>
        <td class="py-2 px-2.5 text-center ${retClass}">${c.retries ?? 0}%</td>
        <td class="py-2 px-2.5 text-right font-mono text-slate-200">${c.usage_fmt}</td>
        <td class="py-2 px-2.5 text-center text-[11px] text-slate-300 font-mono">
          <div>Asoc: <strong>${c.assoc_ms ?? "--"}ms</strong> | Auth: <strong class="${(c.auth_ms || 0) >= 6000 ? "text-amber-300" : "text-slate-200"}">${c.auth_ms ?? "--"}ms</strong> | DHCP: <strong class="${(c.dhcp_ms || 0) > 2000 ? "text-sky-300" : "text-slate-200"}">${c.dhcp_ms ?? "--"}ms</strong></div>
          <div class="text-[10px] ${(c.roam_ms || 0) > 3000 ? "text-rose-300 font-bold" : "text-slate-400"}">Roam: ${c.roam_ms !== null && c.roam_ms !== undefined ? c.roam_ms + " ms" : "--"} | <span class="${(c.voice_lat || 0) > 100 || (c.be_lat || 0) > 150 ? "text-amber-300 font-bold" : "text-slate-400"}">Lat Voz:${c.voice_lat ?? "--"}ms / Datos:${c.be_lat ?? "--"}ms</span></div>
        </td>
        <td class="py-2 px-2.5">${issueBadges}</td>
      </tr>`;
    })
    .join("");

  const loadMoreRow =
    remaining > 0
      ? `<tr class="bg-slate-900/95">
          <td colspan="11" class="py-3 text-center">
            <div class="flex flex-wrap items-center justify-center gap-3">
              <span class="text-xs text-slate-300">Mostrando <strong>${visibleRows.length}</strong> de <strong>${matching.length}</strong> sesiones (para máxima fluidez del navegador)</span>
              <button type="button" onclick="showMoreClientRows(300)" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition">
                <i class="fa-solid fa-plus mr-1"></i>Mostrar 300 más (${remaining} restantes)
              </button>
              <button type="button" onclick="showMoreClientRows('ALL')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs transition">
                Mostrar todas (${matching.length})
              </button>
            </div>
          </td>
        </tr>`
      : "";

  tbody.innerHTML = rowsHtml + loadMoreRow;
}

function showClientModal(idx) {
  const c = currentData.clients[idx];
  if (!c) return;
  document.getElementById("modal-title").textContent = `Cliente ${c.user_id} (${c.mac}) — ${c.ap_name} (${c.floor})`;
  const fields = [
    ["Usuario / Identifier", `${c.user_id} (${c.identifier})`],
    ["Hostname", c.hostname],
    ["Dirección MAC", c.mac],
    ["IPv4 / IPv6", `${c.ipv4} / ${c.ipv6}`],
    ["Dispositivo / Vendor", `${c.device_type} (${c.vendor})`],
    ["Sistema Operativo", `${c.os} (${c.endpoint_type})`],
    ["Access Point / Modo", `${c.ap_name} (${c.ap_mode}) — ${c.floor}`],
    ["IP / MAC Radio AP", `${c.ap_ip} / ${c.ap_mac}`],
    ["WLC / AP Group", `${c.wlc_name} (${c.ap_group})`],
    ["Ubicación Completa", c.location],
    ["Health (Global / Onb / Conn)", `Global: ${c.health ?? "--"}/10 | Onb: ${c.onboarding_health ?? "--"} | Conn: ${c.connected_health ?? "--"}`],
    ["Trust Score / Tracked", `Trust: ${c.trust_score} | Tracked: ${c.tracked}`],
    ["SSID / Auth Type / VLAN", `${c.ssid} (${c.auth_type}) VLAN ${c.vlan} / VNID ${c.vnid}`],
    ["RSSI (Actual / Prom) & SNR", `RSSI: ${c.rssi ?? "--"} / ${c.avg_rssi ?? "--"} dBm | SNR: ${c.snr ?? "--"} / ${c.avg_snr ?? "--"} dB`],
    ["Protocolo / Capacidad / Rate", `${c.protocol} (Cap: ${c.capability}) @ ${c.data_rate} Mbps (${c.band})`],
    ["Retransmisiones L2", `${c.retries ?? 0}% (${c.retry_bucket})`],
    ["Datos Transmitidos (Total/Tx/Rx)", `Total: ${c.usage_fmt} | Tx: ${c.tx_fmt} | Rx: ${c.rx_fmt}`],
    ["Tiempos Assoc / Auth 802.1X", `Assoc: ${c.assoc_ms ?? "--"} ms | Auth: ${c.auth_ms ?? "--"} ms (Srv: ${c.auth_server})`],
    ["Tiempos DHCP / Roam / Onb", `DHCP: ${c.dhcp_ms ?? "--"} ms | Roam: ${c.roam_ms ?? "--"} ms | Onb: ${c.onboarding_ms ?? "--"} ms`],
    ["Latencias WMM (Voz/Vid/BE/BG)", `Voz: ${c.voice_lat ?? "--"}ms | Vid: ${c.video_lat ?? "--"}ms | BE: ${c.be_lat ?? "--"}ms | BG: ${c.bg_lat ?? "--"}ms`],
    ["Tags Alarmas Concurrentes", (c.alarm_tags || []).length ? c.alarm_tags.join(" • ") : "Ninguna alarma activa"],
  ];
  document.getElementById("modal-body").innerHTML = fields
    .map(
      ([k, v]) => `
    <div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
      <div class="text-[10px] text-slate-400 uppercase">${k}</div>
      <div class="text-xs font-semibold text-white mt-0.5 break-words">${v}</div>
    </div>`
    )
    .join("");
  const modal = document.getElementById("client-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// ============================================================================
// NUEVAS SECCIONES OPERATIVAS DEL CSV DE CLIENTES (57 VARIABLES)
// ============================================================================

function renderConcurrentAlarmsSection(data) {
  const ca = data.concurrent_alarms || {};
  const tagCounts = ca.tag_counts || [];
  const buckets = ca.concurrency_buckets || {};
  const combos = ca.top_combinations || [];
  const activeTag = document.getElementById("filter-alarm-tag")?.value || "ALL";

  // 1. Chips interactivos de todos los Tags de Alarma
  const chipsContainer = document.getElementById("alarm-tags-chips");
  if (chipsContainer) {
    const allBtn = `<button type="button" onclick="filterByAlarmTag('ALL')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
      activeTag === "ALL"
        ? "bg-purple-600 text-white border-purple-400 shadow"
        : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
    }">Todos (${data.total_records || 0})</button>`;

    const tagBtns = tagCounts
      .map((t) => {
        const isSel = activeTag === t.tag;
        const safeTag = t.tag.replace(/'/g, "\\'");
        return `<button type="button" onclick="filterByAlarmTag('${safeTag}')" class="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition flex items-center gap-1.5 ${
          isSel
            ? "bg-purple-600 text-white border-purple-300 shadow"
            : "bg-purple-950/40 hover:bg-purple-900/50 text-purple-200 border-purple-500/30"
        }">
          <i class="fa-solid fa-tag text-[10px] text-purple-400"></i>
          <span>${t.tag}</span>
          <span class="px-1.5 py-0.2 rounded bg-slate-900/90 text-amber-300 font-bold text-[10px]">${t.count} (${t.pct}%)</span>
        </button>`;
      })
      .join("");

    chipsContainer.innerHTML = allBtn + tagBtns;
  }

  // 2. Gráfica de Frecuencia por Tag Individual
  const tagCanvas = document.getElementById("chart-alarm-tags");
  if (tagCanvas) {
    destroyChart("alarmTags");
    const topTags = tagCounts.slice(0, 10);
    charts.alarmTags = new Chart(tagCanvas, {
      type: "bar",
      data: {
        labels: topTags.map((t) => t.tag),
        datasets: [
          {
            label: "Clientes con este Tag de Alarma",
            data: topTags.map((t) => t.count),
            backgroundColor: [
              "#a855f7",
              "#f43f5e",
              "#f59e0b",
              "#0ea5e9",
              "#ec4899",
              "#6366f1",
              "#14b8a6",
              "#eab308",
              "#ef4444",
              "#8b5cf6",
            ],
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            if (topTags[idx]) filterByAlarmTag(topTags[idx].tag);
          }
        },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#e2e8f0", font: { size: 10 } } },
        },
      },
    });
  }

  // 3. Gráfica de Concurrencia (0, 1, 2, 3+ alarmas simultáneas)
  const concCanvas = document.getElementById("chart-alarm-concurrency");
  if (concCanvas) {
    destroyChart("alarmConcurrency");
    const bLabels = Object.keys(buckets);
    const bVals = Object.values(buckets);
    charts.alarmConcurrency = new Chart(concCanvas, {
      type: "doughnut",
      data: {
        labels: bLabels,
        datasets: [
          {
            data: bVals,
            backgroundColor: ["#10b981", "#0ea5e9", "#f59e0b", "#f43f5e"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#cbd5e1", font: { size: 10 } } },
        },
      },
    });
  }

  // 4. Tabla de Combinaciones de Alarmas Concurrentes
  const comboTbody = document.getElementById("table-concurrent-combos");
  if (comboTbody) {
    if (!combos.length) {
      comboTbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400">Sin combinaciones concurrentes para el filtro actual.</td></tr>`;
    } else {
      comboTbody.innerHTML = combos
        .map((c) => {
          const safeCombo = c.combo.replace(/'/g, "\\'");
          return `<tr class="hover:bg-slate-800/60 cursor-pointer transition" onclick="filterByAlarmTag('${safeCombo}')">
            <td class="py-1.5 px-2">
              <div class="font-semibold text-purple-300 text-[11px]">${c.combo}</div>
              <div class="text-[10px] text-slate-400">Ej: ${(c.sample_users || []).slice(0, 3).join(", ")}</div>
            </td>
            <td class="py-1.5 px-2 text-center">
              <span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[11px]">${c.count} (${c.pct}%)</span>
            </td>
            <td class="py-1.5 px-2 text-[10px] text-slate-300">
              <div class="text-emerald-300 font-semibold">${(c.sample_floors || []).join(", ")}</div>
              <div class="text-sky-400">${(c.sample_aps || []).join(", ")}</div>
            </td>
          </tr>`;
        })
        .join("");
    }
  }
}

function renderAuthAnalyticsSection(data) {
  const auth = data.auth_analytics || {};
  const kpis = data.kpis || {};
  const byFloor = auth.by_floor || [];
  const byAp = auth.by_ap || [];
  const byOs = auth.by_os || [];
  const byServer = auth.by_server || [];
  const slowest = auth.slowest_clients || [];

  const worstAuthFloor = byFloor[0] || {};
  const worstAuthAp = byAp[0] || {};
  const mainServer = byServer[0] || {};

  const cardsEl = document.getElementById("auth-kpi-cards");
  if (cardsEl) {
    cardsEl.innerHTML = `
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/40">
        <div class="text-[10px] font-bold uppercase text-amber-300">3 Procesos de Conexión (Promedios)</div>
        <div class="text-sm font-extrabold text-white mt-1">Asoc: ${kpis.avg_assoc_ms || 0} ms | Auth: ${kpis.avg_auth_ms || 0} ms | DHCP: ${kpis.avg_dhcp_ms || 0} ms</div>
        <div class="text-[11px] text-slate-300 mt-1">Auth >= 6s: <strong class="text-amber-300">${auth.slow_auth_3s_count || 0}</strong> | Asoc/DHCP/Roam Lento: <strong class="text-rose-300">${auth.slow_onb_10s_count || 0}</strong></div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-rose-500/40 cursor-pointer clickable-card transition" onclick="quickFilterByFloor('${worstAuthFloor.floor || "ALL"}')">
        <div class="text-[10px] font-bold uppercase text-rose-300">Piso donde más demora Auth 802.1X</div>
        <div class="text-base font-extrabold text-white mt-1">${worstAuthFloor.floor || "--"}</div>
        <div class="text-[11px] text-slate-300 mt-1">Prom Auth: <strong class="text-amber-300">${worstAuthFloor.avg_auth_ms || 0} ms</strong> | DHCP: <strong class="text-sky-300">${worstAuthFloor.avg_dhcp_ms || 0} ms</strong></div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-orange-500/40 cursor-pointer clickable-card transition" onclick="quickFilterByAp('${worstAuthAp.ap_name || "ALL"}')">
        <div class="text-[10px] font-bold uppercase text-orange-300">AP donde más demora Auth 802.1X</div>
        <div class="text-base font-extrabold text-white mt-1">${worstAuthAp.ap_name || "--"} <span class="text-xs font-normal text-emerald-300">(${worstAuthAp.floor || ""})</span></div>
        <div class="text-[11px] text-slate-300 mt-1">Prom Auth: <strong class="text-amber-300">${worstAuthAp.avg_auth_ms || 0} ms</strong> | Roam: <strong class="text-rose-300">${worstAuthAp.avg_roam_ms || 0} ms</strong></div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-sky-500/40">
        <div class="text-[10px] font-bold uppercase text-sky-300">Servidor ISE / RADIUS, DHCP y Roaming</div>
        <div class="text-base font-extrabold text-white mt-1">${mainServer.server || "--"}</div>
        <div class="text-[11px] text-slate-300 mt-1">DHCP Prom: <strong class="text-sky-300">${kpis.avg_dhcp_ms || 0} ms</strong> | Roaming Prom: <strong class="text-emerald-300">${kpis.avg_roam_ms || 0} ms</strong></div>
      </div>
    `;
  }

  const alarmSpec = getActiveAlarmSpec(data);
  const compDays = getComparisonDays(data);
  const subCompDays = getSubComparisonDays(data, compDays);
  const useSubData = Boolean(data.has_issue_subfilter && data.issue_filtered);

  // Cuando hay alarma activa, ordenar Pisos por esa alarma para alinear Gráficas 1, 2 y 4 (todos los pisos)
  let topAuthFloors = [...byFloor];
  if (alarmSpec) {
    const baseFloors = data.floor_client_summary || [];
    const subFloorsMap = new Map(
      (data.issue_filtered?.floor_client_summary || []).map((f) => [f.floor, f])
    );
    const dayFloorMapsBase = compDays.map(
      (d) => new Map((d.floor_client_summary || []).map((f) => [f.floor, f]))
    );
    const rankedFloors = [...baseFloors]
      .sort((a, b) => {
        if (compDays.length >= 2) {
          const sumA = dayFloorMapsBase.reduce(
            (acc, m) => acc + (m.get(a.floor)?.alerts_breakdown?.[alarmSpec.floorAlertKey] || 0),
            0
          );
          const sumB = dayFloorMapsBase.reduce(
            (acc, m) => acc + (m.get(b.floor)?.alerts_breakdown?.[alarmSpec.floorAlertKey] || 0),
            0
          );
          if (sumB !== sumA) return sumB - sumA;
        }
        const ca = a.alerts_breakdown?.[alarmSpec.floorAlertKey] || 0;
        const cb = b.alerts_breakdown?.[alarmSpec.floorAlertKey] || 0;
        if (cb !== ca) return cb - ca;
        return (b.issue_clients || 0) - (a.issue_clients || 0);
      });

    // Usar promedios de los clientes afectados por la alarma en cada piso (si existen), con respaldo al piso base
    topAuthFloors = rankedFloors.map((bf) => subFloorsMap.get(bf.floor) || bf);
  }

  const metricCfgs = {
    auth: { field: "avg_auth_ms", label: "Auth 802.1X ms", title: "Demora Auth 802.1X por Piso (ms)" },
    dhcp: { field: "avg_dhcp_ms", label: "DHCP ms", title: "Demora DHCP por Piso (ms)" },
    roam: { field: "avg_roam_ms", label: "Roaming ms", title: "Demora Roaming por Piso (ms)" },
    assoc: { field: "avg_assoc_ms", label: "Asociación ms", title: "Demora Asociación por Piso (ms)" },
    retries: { field: "avg_retries", label: "Retries Prom (%)", title: "Promedio de Retries (%) por Piso" },
    latency: { field: "avg_be_lat", label: "Latencia Datos (ms)", title: "Latencia Datos QoS por Piso (ms)" },
    rf: { field: "avg_rssi", label: "Señal RSSI (dBm)", title: "Nivel de Señal RSSI Promedio por Piso (dBm)" },
  };
  const activeMCfg = metricCfgs[authFloorMetricFilter] || metricCfgs.auth;

  const authFloorTitleEl = document.getElementById("title-auth-floor");
  if (authFloorTitleEl) {
    if (compDays.length >= 2 || alarmSpec) {
      authFloorTitleEl.textContent = alarmSpec
        ? `4. ${activeMCfg.title} (${alarmSpec.short})`
        : `4. ${activeMCfg.title}`;
    } else {
      authFloorTitleEl.textContent = "4. Tiempos por Piso: Asoc, Auth 802.1X, DHCP y Roaming (ms)";
    }
  }

  const authFloorToggleEl = document.getElementById("auth-floor-mode-toggle");
  if (authFloorToggleEl) {
    if (compDays.length >= 2 || alarmSpec) {
      const mBtns = [
        { id: "auth", label: "Auth" },
        { id: "dhcp", label: "DHCP" },
        { id: "roam", label: "Roam" },
        { id: "assoc", label: "Asoc" },
      ];
      if (alarmSpec?.autoFloorMode === "retries" || authFloorMetricFilter === "retries") {
        mBtns.unshift({ id: "retries", label: "Retries %" });
      } else if (alarmSpec?.autoFloorMode === "latency" || authFloorMetricFilter === "latency") {
        mBtns.unshift({ id: "latency", label: "Latencia" });
      } else if (alarmSpec?.autoFloorMode === "rf" || authFloorMetricFilter === "rf") {
        mBtns.unshift({ id: "rf", label: "RSSI dBm" });
      }
      authFloorToggleEl.innerHTML = mBtns
        .map(
          (b) =>
            `<button type="button" onclick="setAuthFloorMetricFilter('${b.id}')" class="px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
              authFloorMetricFilter === b.id
                ? "bg-amber-500/30 text-amber-200 border-amber-400"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
            }">${b.label}</button>`
        )
        .join("");
    } else {
      authFloorToggleEl.innerHTML = "";
    }
  }

  // Gráfica 4: Los Procesos de Conexión / Métrica Activa por Piso (Azul Día 1 vs Verde Día 2 en modo comparación)
  const floorCanvas = document.getElementById("chart-auth-floor");
  if (floorCanvas) {
    destroyChart("authFloor");
    let authFloorDatasets = [];
    const activeFloorDays = useSubData && subCompDays.length >= 2 ? subCompDays : compDays;
    const dayAuthMaps = activeFloorDays.map(
      (d) => new Map((d.floor_client_summary || []).map((f) => [f.floor, f]))
    );

    if (compDays.length >= 2) {
      activeFloorDays.forEach((d, dIdx) => {
        const pal = DAY_PALETTE[dIdx % DAY_PALETTE.length];
        const fMap = dayAuthMaps[dIdx];
        authFloorDatasets.push({
          label: `${activeMCfg.label} (${d.day_label})`,
          dayIdx: dIdx,
          dayLabel: d.day_label,
          data: topAuthFloors.map((f) => fMap.get(f.floor)?.[activeMCfg.field] || 0),
          backgroundColor: pal.bar,
          borderColor: pal.border,
          borderWidth: 1,
          borderRadius: 4,
        });
      });
    } else if (alarmSpec && ["retries", "latency", "rf"].includes(authFloorMetricFilter)) {
      const singleBarColors = {
        retries: "#f43f5e",
        latency: "#f59e0b",
        rf: "#14b8a6",
      };
      authFloorDatasets = [
        {
          label: `${activeMCfg.label} (${alarmSpec.short})`,
          data: topAuthFloors.map((f) => f[activeMCfg.field] || 0),
          backgroundColor: singleBarColors[authFloorMetricFilter] || "#f59e0b",
          borderRadius: 4,
        },
      ];
    } else {
      authFloorDatasets = [
        {
          label: "Auth 802.1X Prom (ms)",
          data: topAuthFloors.map((f) => f.avg_auth_ms || 0),
          backgroundColor: "#f59e0b",
          borderRadius: 4,
        },
        {
          label: "DHCP Response Prom (ms)",
          data: topAuthFloors.map((f) => f.avg_dhcp_ms || 0),
          backgroundColor: "#0ea5e9",
          borderRadius: 4,
        },
        {
          label: "Roaming Prom (ms)",
          data: topAuthFloors.map((f) => f.avg_roam_ms || 0),
          backgroundColor: "#f43f5e",
          borderRadius: 4,
        },
        {
          label: "Asociación Prom (ms)",
          data: topAuthFloors.map((f) => f.avg_assoc_ms || 0),
          backgroundColor: "#10b981",
          borderRadius: 4,
        },
      ];
    }

    charts.authFloor = new Chart(floorCanvas, {
      type: "bar",
      data: {
        labels: topAuthFloors.map((f) => f.floor),
        datasets: authFloorDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const fObj = topAuthFloors[elements[0].index];
            if (fObj?.floor) quickFilterByFloor(fObj.floor);
          }
        },
        plugins: {
          legend: { labels: { color: "#cbd5e1", font: { size: 9.5 } } },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                if (compDays.length < 2 || !items || !items.length) return [];
                const first = items[0];
                const ds = authFloorDatasets[first.datasetIndex];
                const fObj = topAuthFloors[first.dataIndex];
                if (!ds || ds.dayIdx === undefined || !fObj) return [];
                const df = dayAuthMaps[ds.dayIdx]?.get(fObj.floor);
                if (!df) return [`Sin sesiones con ${alarmSpec ? alarmSpec.short : "datos"} en ${ds.dayLabel}`];
                return [
                  `• Sesiones (${alarmSpec ? alarmSpec.short : "Piso"}): ${df.total_clients || 0}`,
                  `• Retries Prom: ${df.avg_retries || 0}%`,
                  `• Auth 802.1X: ${df.avg_auth_ms || 0} ms`,
                  `• DHCP: ${df.avg_dhcp_ms || 0} ms`,
                  `• Roaming: ${df.avg_roam_ms || 0} ms`,
                  `• Asociación: ${df.avg_assoc_ms || 0} ms`,
                ];
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: "#cbd5e1", font: { size: 9.5 } } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        },
      },
    });
  }

  // Gráfica 2: Top APs por Auth 802.1X, DHCP y Roaming
  const apCanvas = document.getElementById("chart-auth-ap");
  if (apCanvas) {
    destroyChart("authAp");
    const topAuthAps = byAp.slice(0, 12);
    charts.authAp = new Chart(apCanvas, {
      type: "bar",
      data: {
        labels: topAuthAps.map((a) => `${a.ap_name} (${a.floor})`),
        datasets: [
          {
            label: "Auth 802.1X Prom (ms)",
            data: topAuthAps.map((a) => a.avg_auth_ms),
            backgroundColor: "#f59e0b",
            borderRadius: 4,
          },
          {
            label: "DHCP Prom (ms)",
            data: topAuthAps.map((a) => a.avg_dhcp_ms),
            backgroundColor: "#0ea5e9",
            borderRadius: 4,
          },
          {
            label: "Roaming Prom (ms)",
            data: topAuthAps.map((a) => a.avg_roam_ms),
            backgroundColor: "#ef4444",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const aObj = topAuthAps[elements[0].index];
            if (aObj) quickFilterByAp(aObj.ap_name);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 9 } } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        },
      },
    });
  }

  // Gráfica 5: Sistema Operativo (Demora Auth 802.1X o Clientes con la Alarma Seleccionada)
  const osCanvas = document.getElementById("chart-auth-os");
  if (osCanvas) {
    destroyChart("authOs");
    const authOsTitleEl = document.getElementById("title-auth-os");
    const showAlarmOsCount = Boolean(alarmSpec && alarmSpec.autoFloorMode !== "auth");

    if (showAlarmOsCount) {
      if (authOsTitleEl) {
        authOsTitleEl.textContent = `5. Clientes con ${alarmSpec.short} por Sistema Operativo`;
      }
      const subOsDist = data.issue_filtered?.distributions?.os || {};
      const osEntries = Object.entries(subOsDist)
        .filter(([, cnt]) => cnt > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([osName, cnt]) => ({ os: osName, client_count: cnt }));
      const activeOsDays = useSubData && subCompDays.length >= 2 ? subCompDays : compDays;

      charts.authOs = new Chart(osCanvas, {
        type: "bar",
        data: {
          labels: osEntries.map((o) =>
            activeOsDays.length >= 2 ? o.os : `${o.os} (${o.client_count})`
          ),
          datasets:
            activeOsDays.length >= 2
              ? activeOsDays.map((d, idx) => {
                  const pal = DAY_PALETTE[idx % DAY_PALETTE.length];
                  return {
                    label: `${alarmSpec.short} (${d.day_label})`,
                    data: osEntries.map((o) => d.os_dist?.[o.os] || 0),
                    backgroundColor: pal.bar,
                    borderColor: pal.border,
                    borderWidth: 1,
                    borderRadius: 4,
                  };
                })
              : [
                  {
                    label: `Sesiones con ${alarmSpec.short}`,
                    data: osEntries.map((o) => o.client_count),
                    backgroundColor: "#38bdf8",
                    borderRadius: 4,
                  },
                ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const oObj = osEntries[elements[0].index];
              if (oObj) {
                document.getElementById("filter-os").value = oObj.os;
                fetchData();
              }
            }
          },
          plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
          scales: {
            x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
            y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          },
        },
      });
    } else {
      if (authOsTitleEl) {
        authOsTitleEl.textContent = alarmSpec
          ? `5. Demora Auth 802.1X por SO (${alarmSpec.short})`
          : "5. Demora Auth 802.1X por Sistema Operativo (ms)";
      }
      const osSource =
        useSubData && data.issue_filtered?.auth_analytics?.by_os?.length
          ? data.issue_filtered.auth_analytics.by_os
          : byOs;
      const topOs = osSource.slice(0, 8);
      const activeAuthOsDays = useSubData && subCompDays.length >= 2 ? subCompDays : compDays;

      charts.authOs = new Chart(osCanvas, {
        type: "bar",
        data: {
          labels: topOs.map((o) => `${o.os} (${o.client_count})`),
          datasets:
            activeAuthOsDays.length >= 2
              ? activeAuthOsDays.map((d, idx) => {
                  const pal = DAY_PALETTE[idx % DAY_PALETTE.length];
                  const osMap = new Map((d.auth_by_os || []).map((o) => [o.os, o]));
                  return {
                    label: `Auth ms (${d.day_label})`,
                    data: topOs.map((o) => osMap.get(o.os)?.avg_auth_ms || 0),
                    backgroundColor: pal.bar,
                    borderColor: pal.border,
                    borderWidth: 1,
                    borderRadius: 4,
                  };
                })
              : [
                  {
                    label: "Auth 802.1X Prom (ms)",
                    data: topOs.map((o) => o.avg_auth_ms),
                    backgroundColor: "#38bdf8",
                    borderRadius: 4,
                  },
                ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const oObj = topOs[elements[0].index];
              if (oObj) {
                document.getElementById("filter-os").value = oObj.os;
                fetchData();
              }
            }
          },
          plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
          scales: {
            x: { ticks: { color: "#94a3b8", font: { size: 10 } } },
            y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          },
        },
      });
    }
  }

  // Tabla de Top 20 Clientes donde más se demora la Autenticación / DHCP / Roaming
  const slowTbody = document.getElementById("table-slow-auth-clients");
  if (slowTbody) {
    if (!slowest.length) {
      slowTbody.innerHTML = `<tr><td colspan="9" class="py-4 text-center text-slate-400">Sin registros con tiempos de autenticación medidos.</td></tr>`;
    } else {
      slowTbody.innerHTML = slowest
        .map(
          (c) => `
        <tr class="hover:bg-slate-800/60 cursor-pointer transition" onclick="quickFilterByUser('${c.user_id}')">
          <td class="py-1.5 px-2.5">
            <div class="font-bold text-white">${c.user_id}</div>
            <div class="text-[10px] text-slate-400">${c.hostname}</div>
          </td>
          <td class="py-1.5 px-2.5">
            <div class="text-slate-200">${c.device_type}</div>
            <div class="text-[10px] text-slate-400">${c.os}</div>
          </td>
          <td class="py-1.5 px-2.5">
            <div class="font-semibold text-sky-400">${c.ap_name}</div>
            <div class="text-[10px] text-emerald-300 font-semibold">${c.floor}</div>
          </td>
          <td class="py-1.5 px-2.5">
            <div class="text-slate-200">${c.auth_type}</div>
            <div class="text-[10px] text-indigo-300">ISE: ${c.auth_server}</div>
          </td>
          <td class="py-1.5 px-2.5 text-center font-mono text-slate-300">${c.assoc_ms ?? "--"} ms</td>
          <td class="py-1.5 px-2.5 text-center font-mono font-bold ${(c.auth_ms || 0) >= 6000 ? "text-amber-300" : "text-slate-200"}">${c.auth_ms ?? "--"} ms</td>
          <td class="py-1.5 px-2.5 text-center font-mono ${(c.dhcp_ms || 0) > 2000 ? "text-sky-300 font-bold" : "text-slate-300"}">${c.dhcp_ms ?? "--"} ms</td>
          <td class="py-1.5 px-2.5 text-center font-mono ${(c.roam_ms || 0) > 3000 ? "text-rose-400 font-bold" : "text-slate-300"}">${c.roam_ms ?? "--"} ms</td>
          <td class="py-1.5 px-2.5 text-[10px] text-slate-400">${c.last_auth_time}</td>
        </tr>`
        )
        .join("");
    }
  }
}

function renderTrafficAnalyticsSection(data) {
  const tr = data.traffic_analytics || {};
  const byFloor = tr.by_floor || [];
  const byAp = tr.by_ap || [];
  const topClients = tr.top_clients || [];
  const compDays = getComparisonDays(data);

  const totalUsageMb = tr.total_usage_mb || 0;
  const f1 = byFloor[0] || {};
  const a1 = byAp[0] || {};
  const c1 = topClients[0] || {};

  const f1Pct = totalUsageMb > 0 ? (((f1.usage_mb || 0) / totalUsageMb) * 100).toFixed(1) : "0.0";
  const a1Pct = totalUsageMb > 0 ? (((a1.usage_mb || 0) / totalUsageMb) * 100).toFixed(1) : "0.0";
  const c1Pct = totalUsageMb > 0 ? (((c1.usage_mb || 0) / totalUsageMb) * 100).toFixed(1) : "0.0";

  const dayTotalSub =
    compDays.length >= 2
      ? `<div class="mt-1 pt-1 border-t border-slate-800 flex flex-wrap gap-1.5 text-[10px]">${compDays
          .map(
            (d) =>
              `<span class="px-1.5 py-0.2 rounded bg-sky-950/80 text-sky-200 border border-sky-500/30">📅 ${d.day_label}: <strong>${(((d.traffic_total_mb || 0) / 1024)).toFixed(2)} GB</strong></span>`
          )
          .join("")}</div>`
      : "";

  const cardsEl = document.getElementById("traffic-kpi-cards");
  if (cardsEl) {
    cardsEl.innerHTML = `
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-sky-500/40">
        <div class="text-[10px] font-bold uppercase text-sky-300">Tráfico Total Acumulado (Usage 24h)</div>
        <div class="text-base font-extrabold text-white mt-1">${tr.total_usage_fmt || "0 B"}</div>
        <div class="text-[11px] text-slate-300 mt-1" title="En el CSV de Catalyst Center, Usage (B) es el acumulado 24h y Tx/Rx Data (B) es solo el último corte WLC">Último corte WLC Tx: <strong class="text-indigo-300">${tr.total_tx_fmt || "0 B"}</strong> | Rx: <strong class="text-emerald-300">${tr.total_rx_fmt || "0 B"}</strong></div>
        ${dayTotalSub}
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 cursor-pointer clickable-card transition" onclick="quickFilterByFloor('${f1.floor || "ALL"}')">
        <div class="text-[10px] font-bold uppercase text-emerald-300">Piso #1 en Datos Transmitidos</div>
        <div class="text-base font-extrabold text-white mt-1">${f1.floor || "--"} (${f1.usage_fmt || "0 B"})</div>
        <div class="text-[11px] text-slate-300 mt-1"><strong class="text-emerald-300">${f1Pct}% del total</strong> • ${f1.unique_users || f1.total_clients || 0} usu. (${f1.total_clients || 0} ses.)</div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-indigo-500/40 cursor-pointer clickable-card transition" onclick="quickFilterByAp('${a1.ap_name || "ALL"}')">
        <div class="text-[10px] font-bold uppercase text-indigo-300">AP #1 en Datos Transmitidos</div>
        <div class="text-base font-extrabold text-white mt-1">${a1.ap_name || "--"} (${a1.usage_fmt || "0 B"})</div>
        <div class="text-[11px] text-slate-300 mt-1">${a1.floor || ""} • <strong class="text-indigo-300">${a1Pct}% del total</strong> (${a1.unique_users || a1.client_count || 0} usu. / ${a1.client_count || 0} ses.)</div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/40 cursor-pointer clickable-card transition" onclick="quickFilterByUser('${c1.user_id || ""}')">
        <div class="text-[10px] font-bold uppercase text-purple-300">Cliente #1 en Datos Transmitidos</div>
        <div class="text-base font-extrabold text-white mt-1">${c1.user_id || "--"} (${c1.usage_fmt || "0 B"})</div>
        <div class="text-[11px] text-slate-300 mt-1">${c1.ap_name || ""} (${c1.floor || ""}) • <strong class="text-purple-300">${c1Pct}% del total</strong> (${c1.device_type || "--"})</div>
      </div>
    `;
  }

  const topTrafficFloors = [...byFloor].filter((f) => f && f.floor && f.floor !== "--");

  // Gráfica 1: Tráfico Total Acumulado por Piso (GB — Azul Día 1 vs Verde Día 2 al comparar días)
  const floorCanvas = document.getElementById("chart-traffic-floor");
  if (floorCanvas) {
    destroyChart("trafficFloor");
    charts.trafficFloor = new Chart(floorCanvas, {
      type: "bar",
      data: {
        labels: topTrafficFloors.map((f) => f.floor),
        datasets:
          compDays.length >= 2
            ? compDays.map((d, dIdx) => {
                const pal = DAY_PALETTE[dIdx % DAY_PALETTE.length];
                const fMap = new Map((d.floor_client_summary || []).map((f) => [f.floor, f]));
                return {
                  label: `Tráfico GB (${d.day_label})`,
                  data: topTrafficFloors.map((f) => Math.round((((fMap.get(f.floor)?.usage_mb || 0) / 1024)) * 100) / 100),
                  backgroundColor: pal.bar,
                  borderColor: pal.border,
                  borderWidth: 1,
                  borderRadius: 4,
                };
              })
            : [
                {
                  label: "Tráfico Total Usage (GB)",
                  data: topTrafficFloors.map((f) => Math.round(((f.usage_mb || 0) / 1024) * 100) / 100),
                  backgroundColor: "#10b981",
                  borderRadius: 4,
                },
              ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const fObj = topTrafficFloors[elements[0].index];
            if (fObj?.floor) quickFilterByFloor(fObj.floor);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 9.5 } } } },
        scales: {
          x: { ticks: { color: "#cbd5e1", font: { size: 9.5 } } },
          y: {
            title: { display: true, text: "GB Acumulados", color: "#10b981", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
        },
      },
    });
  }

  // Gráfica 2: Top 12 APs con más Datos Transmitidos (GB — con Comparativa por Día)
  const apCanvas = document.getElementById("chart-traffic-ap");
  if (apCanvas) {
    destroyChart("trafficAp");
    const topAps = byAp.slice(0, 12);
    charts.trafficAp = new Chart(apCanvas, {
      type: "bar",
      data: {
        labels: topAps.map((a) => `${a.ap_name} (${a.floor})`),
        datasets:
          compDays.length >= 2
            ? compDays.map((d, idx) => {
                const pal = DAY_PALETTE[idx % DAY_PALETTE.length];
                const apMap = new Map((d.ap_summary || []).map((a) => [a.ap_name, a]));
                return {
                  label: `Tráfico GB (${d.day_label})`,
                  data: topAps.map((a) => Math.round((((apMap.get(a.ap_name)?.usage_mb || 0) / 1024)) * 100) / 100),
                  backgroundColor: pal.bar,
                  borderColor: pal.border,
                  borderWidth: 1,
                  borderRadius: 4,
                };
              })
            : [
                {
                  label: "Tráfico Total Usage (GB)",
                  data: topAps.map((a) => Math.round(((a.usage_mb || 0) / 1024) * 100) / 100),
                  backgroundColor: "#0ea5e9",
                  borderRadius: 4,
                },
              ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const aObj = topAps[elements[0].index];
            if (aObj) quickFilterByAp(aObj.ap_name);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 9 } } },
          y: {
            title: { display: true, text: "GB Acumulados", color: "#0ea5e9", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
        },
      },
    });
  }

  // Gráfica 3: Top 12 Clientes con más Datos Transmitidos (GB — con Comparativa por Día)
  const clCanvas = document.getElementById("chart-traffic-clients");
  if (clCanvas) {
    destroyChart("trafficClients");
    // Si hay comparativa por días, agrupar usuarios únicos por mayor tráfico total para comparar su consumo entre días
    const uniqueTopUsers = [];
    const seenUsers = new Set();
    for (const c of topClients) {
      const uid = c.user_id || "--";
      if (!seenUsers.has(uid)) {
        seenUsers.add(uid);
        uniqueTopUsers.push(c);
      }
      if (uniqueTopUsers.length >= 12) break;
    }
    const top12 = compDays.length >= 2 ? uniqueTopUsers : topClients.slice(0, 12);

    charts.trafficClients = new Chart(clCanvas, {
      type: "bar",
      data: {
        labels: top12.map((c) => `${c.user_id} (${c.floor})`),
        datasets:
          compDays.length >= 2
            ? compDays.map((d, idx) => {
                const pal = DAY_PALETTE[idx % DAY_PALETTE.length];
                const uMap = d.user_traffic_map || {};
                return {
                  label: `Tráfico GB (${d.day_label})`,
                  data: top12.map((c) => Math.round((((uMap[c.user_id] || 0) / 1024)) * 100) / 100),
                  backgroundColor: pal.bar,
                  borderColor: pal.border,
                  borderWidth: 1,
                  borderRadius: 4,
                };
              })
            : [
                {
                  label: "Tráfico Total Usage (GB)",
                  data: top12.map((c) => Math.round(((c.usage_mb || 0) / 1024) * 100) / 100),
                  backgroundColor: "#a855f7",
                  borderRadius: 4,
                },
              ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const cObj = top12[elements[0].index];
            if (cObj) quickFilterByUser(cObj.user_id);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 9 } } },
          y: {
            title: { display: true, text: "GB Acumulados", color: "#a855f7", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
        },
      },
    });
  }

  // Tabla de Top 15 Clientes con Más Datos Transmitidos
  const trTbody = document.getElementById("table-traffic-ranking");
  if (trTbody) {
    trTbody.innerHTML = topClients
      .slice(0, 15)
      .map((c, i) => {
        const dayBreakHtml =
          compDays.length >= 2
            ? `<div class="text-[10px] text-teal-300 mt-0.5">${compDays
                .map((d) => {
                  const mb = d.user_traffic_map?.[c.user_id] || 0;
                  return `${d.day_label}: <strong>${(mb / 1024).toFixed(2)} GB</strong>`;
                })
                .join(" | ")}</div>`
            : "";
        return `
      <tr class="hover:bg-slate-800/60 cursor-pointer transition" onclick="quickFilterByUser('${c.user_id}')">
        <td class="py-1.5 px-2.5 font-bold text-white">
          <div>#${i + 1} ${c.user_id} <span class="px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-500/40 text-[9px] ml-1">📅 ${c.day_label || "--"}</span></div>
          ${dayBreakHtml}
        </td>
        <td class="py-1.5 px-2.5">
          <div class="text-slate-200">${c.hostname}</div>
          <div class="text-[10px] text-slate-400">${c.device_type} • ${c.os}</div>
        </td>
        <td class="py-1.5 px-2.5">
          <div class="text-sky-400 font-semibold">${c.ap_name}</div>
          <div class="text-[10px] text-emerald-300 font-semibold">${c.floor}</div>
        </td>
        <td class="py-1.5 px-2.5 text-right font-mono font-bold text-sky-300">${c.usage_fmt}</td>
        <td class="py-1.5 px-2.5 text-right font-mono text-indigo-300">${c.tx_fmt}</td>
        <td class="py-1.5 px-2.5 text-right font-mono text-emerald-300">${c.rx_fmt}</td>
        <td class="py-1.5 px-2.5 text-center text-slate-200">${c.data_rate} Mbps (${c.protocol})</td>
        <td class="py-1.5 px-2.5 text-center font-bold ${(c.retries || 0) >= 25 ? "text-rose-400" : "text-slate-300"}">${c.retries ?? 0}%</td>
      </tr>`;
      })
      .join("");
  }
}

function renderPerformanceAndUsersSection(data) {
  const perf = data.performance_analytics || {};
  const topRetry = perf.top_retry_clients || [];
  const drBuckets = perf.data_rate_buckets || {};
  const mostAffected = perf.most_affected_clients || [];

  // Gráfica 1: Top 15 Usuarios Más Afectados por Retransmisiones (Retries % vs RSSI)
  const retryUsersCanvas = document.getElementById("chart-top-retry-users");
  if (retryUsersCanvas) {
    destroyChart("topRetryUsers");
    charts.topRetryUsers = new Chart(retryUsersCanvas, {
      type: "bar",
      data: {
        labels: topRetry.map((c) => `${c.user_id} (${c.ap_name})`),
        datasets: [
          {
            label: "Retransmisiones L2 (%)",
            data: topRetry.map((c) => c.retries || 0),
            backgroundColor: topRetry.map((c) => ((c.retries || 0) > 30 ? "#f43f5e" : "#f59e0b")),
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Señal RSSI (dBm)",
            data: topRetry.map((c) => c.rssi || -90),
            borderColor: "#38bdf8",
            backgroundColor: "#38bdf8",
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const cObj = topRetry[elements[0].index];
            if (cObj) quickFilterByUser(cObj.user_id);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { size: 9 } } },
          y: {
            position: "left",
            title: { display: true, text: "Retries (%)", color: "#f43f5e", font: { size: 10 } },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          y1: {
            position: "right",
            title: { display: true, text: "RSSI (dBm)", color: "#38bdf8", font: { size: 10 } },
            ticks: { color: "#38bdf8" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Gráfica 2: Distribución de Velocidad Data Rate (Mbps)
  const drCanvas = document.getElementById("chart-data-rate-dist");
  if (drCanvas) {
    destroyChart("dataRateDist");
    charts.dataRateDist = new Chart(drCanvas, {
      type: "doughnut",
      data: {
        labels: Object.keys(drBuckets),
        datasets: [
          {
            data: Object.values(drBuckets),
            backgroundColor: ["#f43f5e", "#f59e0b", "#0ea5e9", "#10b981"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#cbd5e1", font: { size: 10 } } },
        },
      },
    });
  }

  // Tabla de Top 20 Usuarios Más Afectados (Multi-Alarma)
  const affTbody = document.getElementById("table-most-affected-users");
  if (affTbody) {
    if (!mostAffected.length) {
      affTbody.innerHTML = `<tr><td colspan="8" class="py-4 text-center text-slate-400">Sin clientes afectados con los filtros actuales.</td></tr>`;
    } else {
      affTbody.innerHTML = mostAffected
        .map((c) => {
          const tagBadges = (c.alarm_tags || [])
            .map(
              (t) =>
                `<span class="inline-block px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[10px] mr-1 mb-1">${t}</span>`
            )
            .join("");
          return `<tr class="hover:bg-slate-800/60 cursor-pointer transition" onclick="quickFilterByUser('${c.user_id}')">
            <td class="py-1.5 px-2.5">
              <div class="font-bold text-white">${c.user_id}</div>
              <div class="text-[10px] text-slate-400">${c.hostname} • ${c.os}</div>
            </td>
            <td class="py-1.5 px-2.5">
              <div class="text-sky-400 font-semibold">${c.ap_name}</div>
              <div class="text-[10px] text-emerald-300 font-semibold">${c.floor}</div>
            </td>
            <td class="py-1.5 px-2.5 text-center font-bold ${(c.retries || 0) >= 25 ? "text-rose-400" : "text-amber-300"}">${c.retries ?? 0}%</td>
            <td class="py-1.5 px-2.5 text-center text-slate-200">${c.rssi ?? "--"} dBm / ${c.snr ?? "--"} dB</td>
            <td class="py-1.5 px-2.5 text-center text-slate-200">${c.data_rate} Mbps</td>
            <td class="py-1.5 px-2.5 text-center text-[11px] text-slate-300">Auth: ${c.auth_ms ?? "--"}ms / Onb: ${c.onboarding_ms ?? "--"}ms</td>
            <td class="py-1.5 px-2.5 text-center text-[11px] text-slate-300">Voz: ${c.voice_lat ?? "--"}ms / Datos: ${c.be_lat ?? "--"}ms</td>
            <td class="py-1.5 px-2.5">${tagBadges}</td>
          </tr>`;
        })
        .join("");
    }
  }
}

let selectedHierarchyIssueType = "ALL";
let cachedUnfilteredAlertTotals = null;

function selectHierarchyIssueType(catName) {
  selectedHierarchyIssueType = catName || "ALL";
  authFloorMetricFilter = ALARM_CHART_SPECS[selectedHierarchyIssueType]?.autoFloorMode || "auth";
  const acHidden = document.getElementById("filter-alert-cat");
  if (acHidden) acHidden.value = selectedHierarchyIssueType;
  const acSel = document.getElementById("filter-alert-cat-select");
  if (acSel) acSel.value = selectedHierarchyIssueType;

  const badge = document.getElementById("active-alert-cat-badge");
  const txt = document.getElementById("active-alert-cat-text");
  if (badge && txt) {
    if (selectedHierarchyIssueType !== "ALL") {
      txt.textContent = `Falla: ${selectedHierarchyIssueType}`;
      badge.classList.remove("hidden");
      badge.classList.add("flex");
    } else {
      badge.classList.add("hidden");
      badge.classList.remove("flex");
    }
  }
  fetchData();
}

function resetToGeneralView() {
  selectedHierarchyIssueType = "ALL";
  authFloorMetricFilter = "auth";
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal("filter-q", "");
  setVal("filter-client-floor", "ALL");
  setVal("filter-ap", "ALL");
  setVal("filter-alert-cat", "ALL");
  setVal("filter-alert-cat-select", "ALL");
  setVal("filter-alarm-tag", "ALL");
  setVal("filter-retry-range", "ALL");
  setVal("filter-rf", "ALL");
  setVal("filter-protocol", "ALL");
  setVal("filter-os", "ALL");
  setVal("filter-status", "ALL");
  setVal("filter-retries", "");
  setVal("filter-max-retries", "");
  setVal("corr-filter-floor", "ALL");
  setVal("filter-floor", "ALL");

  const issChk = document.getElementById("filter-issues");
  if (issChk) issChk.checked = false;

  const badge = document.getElementById("active-alert-cat-badge");
  if (badge) {
    badge.classList.add("hidden");
    badge.classList.remove("flex");
  }
  const tagBadge = document.getElementById("active-alarm-tag-badge");
  if (tagBadge) {
    tagBadge.classList.add("hidden");
    tagBadge.classList.remove("flex");
  }
  syncRetryChips("ALL");
  fetchData();
}

function toggleAllHierarchyNodes(expand) {
  const container = document.getElementById("hierarchy-tree-container");
  if (!container) return;
  container.querySelectorAll("details").forEach((det) => {
    det.open = !!expand;
  });
}

function renderHierarchyExplorer(data) {
  const container = document.getElementById("hierarchy-tree-container");
  if (!container || !data) return;

  const activeFloor = document.getElementById("filter-client-floor")?.value || "ALL";
  const activeAp = document.getElementById("filter-ap")?.value || "ALL";
  const activeQ = (document.getElementById("filter-q")?.value || "").trim();
  const activeRetryRange = document.getElementById("filter-retry-range")?.value || "ALL";
  const activeAlertCat = document.getElementById("filter-alert-cat")?.value || "ALL";
  selectedHierarchyIssueType = activeAlertCat;

  const acSel = document.getElementById("filter-alert-cat-select");
  if (acSel && acSel.value !== activeAlertCat) {
    acSel.value = activeAlertCat;
  }

  // Usar siempre los conteos de línea base (sin recortar clientes sanos ni otras categorías)
  const refAlerts = data.baseline_alert_categories || data.alert_categories_summary || {};
  const baselineIssueClientsCount = data.baseline_issue_clients_count ?? data.kpis?.issue_clients_count ?? 0;

  // Mostrar / ocultar botón y banner de "Volver al General"
  const hasAnyFilter =
    activeFloor !== "ALL" ||
    activeAp !== "ALL" ||
    activeAlertCat !== "ALL" ||
    activeRetryRange !== "ALL" ||
    activeQ !== "";

  const backBtn = document.getElementById("btn-hier-back-general");
  if (backBtn) {
    if (hasAnyFilter) {
      backBtn.classList.remove("hidden");
      backBtn.classList.add("flex");
    } else {
      backBtn.classList.add("hidden");
      backBtn.classList.remove("flex");
    }
  }

  const bannerEl = document.getElementById("hier-active-filter-banner");
  if (bannerEl) {
    if (hasAnyFilter) {
      const tags = [];
      if (activeFloor !== "ALL") {
        tags.push(`<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-building"></i> Piso: ${activeFloor}
          <button type="button" onclick="quickFilterByFloor('ALL')" class="hover:text-white ml-1" title="Quitar filtro de Piso"><i class="fa-solid fa-xmark"></i></button>
        </span>`);
      }
      if (activeAp !== "ALL") {
        tags.push(`<span class="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-200 border border-sky-500/40 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-tower-broadcast"></i> AP: ${activeAp}
          <button type="button" onclick="document.getElementById('filter-ap').value='ALL'; fetchData();" class="hover:text-white ml-1" title="Quitar filtro de AP"><i class="fa-solid fa-xmark"></i></button>
        </span>`);
      }
      if (activeAlertCat !== "ALL") {
        tags.push(`<span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/40 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-bolt"></i> Tipo de Falla: ${activeAlertCat}
          <button type="button" onclick="selectHierarchyIssueType('ALL')" class="hover:text-white ml-1" title="Ver todas las fallas"><i class="fa-solid fa-xmark"></i></button>
        </span>`);
      }
      if (activeRetryRange !== "ALL") {
        tags.push(`<span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/40 font-bold flex items-center gap-1.5">
          Retries: ${activeRetryRange}%
        </span>`);
      }
      if (activeQ) {
        tags.push(`<span class="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 font-bold flex items-center gap-1.5">
          Búsqueda: "${activeQ}"
        </span>`);
      }

      bannerEl.className = "p-3 rounded-xl bg-amber-500/15 border border-amber-400/50 flex flex-wrap items-center justify-between gap-2 text-xs";
      bannerEl.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-extrabold text-amber-300 flex items-center gap-1.5">
            <i class="fa-solid fa-filter-circle-xmark"></i> Vista Filtrada Activa:
          </span>
          ${tags.join("")}
        </div>
        <button type="button" onclick="resetToGeneralView()" class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow transition flex items-center gap-1.5">
          <i class="fa-solid fa-arrow-left"></i> Volver al General (Ver Todos los Pisos y APs)
        </button>
      `;
    } else {
      bannerEl.className = "hidden";
      bannerEl.innerHTML = "";
    }
  }

  // Renderizar barra de chips por Tipo de Falla (#hier-issue-type-chips)
  const issueTypesConfig = [
    {
      cat: "ALL",
      short: "Todas las Fallas",
      icon: "fa-layer-group",
      count: baselineIssueClientsCount,
      activeCls: "bg-emerald-600 text-white border-emerald-300 shadow font-extrabold",
      idleCls: "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700",
    },
    {
      cat: "Retransmisiones Altas (>=25%)",
      short: "Retries >= 25%",
      icon: "fa-rotate-right",
      count: refAlerts["Retransmisiones Altas (>=25%)"] ?? 0,
      activeCls: "bg-rose-600 text-white border-rose-300 shadow font-extrabold ring-2 ring-rose-300",
      idleCls: "bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-500/40",
    },
    {
      cat: "Auth 802.1X: Red / ISE (>=6s)",
      short: "Auth ISE / Red >= 6s",
      icon: "fa-server",
      count: refAlerts["Auth 802.1X: Red / ISE (>=6s)"] ?? 0,
      activeCls: "bg-purple-600 text-white border-purple-300 shadow font-extrabold ring-2 ring-purple-300",
      idleCls: "bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 border-purple-500/40",
    },
    {
      cat: "Auth 802.1X: Espera Suplicante (>=6s)",
      short: "Espera Suplicante >= 6s",
      icon: "fa-laptop",
      count: refAlerts["Auth 802.1X: Espera Suplicante (>=6s)"] ?? 0,
      activeCls: "bg-pink-600 text-white border-pink-300 shadow font-extrabold ring-2 ring-pink-300",
      idleCls: "bg-pink-950/70 hover:bg-pink-900/80 text-pink-200 border-pink-500/40",
    },
    {
      cat: "Asociación Lenta (>2s)",
      short: "Asociación > 2s",
      icon: "fa-link",
      count: refAlerts["Asociación Lenta (>2s)"] ?? 0,
      activeCls: "bg-emerald-600 text-white border-emerald-300 shadow font-extrabold ring-2 ring-emerald-300",
      idleCls: "bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border-emerald-500/40",
    },
    {
      cat: "DHCP Lento (>2s)",
      short: "DHCP > 2s",
      icon: "fa-network-wired",
      count: refAlerts["DHCP Lento (>2s)"] ?? 0,
      activeCls: "bg-sky-600 text-white border-sky-300 shadow font-extrabold ring-2 ring-sky-300",
      idleCls: "bg-sky-950/70 hover:bg-sky-900/80 text-sky-200 border-sky-500/40",
    },
    {
      cat: "Roaming Lento (>3s)",
      short: "Roaming > 3s",
      icon: "fa-route",
      count: refAlerts["Roaming Lento (>3s)"] ?? 0,
      activeCls: "bg-indigo-600 text-white border-indigo-300 shadow font-extrabold ring-2 ring-indigo-300",
      idleCls: "bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 border-indigo-500/40",
    },
    {
      cat: "Latencia QoS Alta (Voz/Datos)",
      short: "Latencia Voz / Datos",
      icon: "fa-wave-square",
      count: refAlerts["Latencia QoS Alta (Voz/Datos)"] ?? 0,
      activeCls: "bg-amber-500 text-slate-950 border-amber-200 shadow font-extrabold ring-2 ring-amber-300",
      idleCls: "bg-amber-950/70 hover:bg-amber-900/80 text-amber-200 border-amber-500/40",
    },
    {
      cat: "Señal RF Débil / Sticky",
      short: "Señal Débil (< -79 dBm)",
      icon: "fa-signal",
      count: refAlerts["Señal RF Débil / Sticky"] ?? 0,
      activeCls: "bg-teal-500 text-slate-950 border-teal-200 shadow font-extrabold ring-2 ring-teal-300",
      idleCls: "bg-teal-950/70 hover:bg-teal-900/80 text-teal-200 border-teal-500/40",
    },
  ];

  const compDays = getComparisonDays(data);

  const chipsHtml = issueTypesConfig
    .map((it) => {
      const isSel = activeAlertCat === it.cat;
      const nextCat = isSel && it.cat !== "ALL" ? "ALL" : it.cat;
      let badgeHtml = `<span class="px-1.5 py-0.2 rounded bg-black/30 text-[10px] font-bold">${it.count}</span>`;
      if (compDays.length >= 2) {
        const cntA =
          it.cat === "ALL"
            ? compDays[0].issue_clients_count ?? 0
            : compDays[0].alert_categories_summary?.[it.cat] ?? 0;
        const cntB =
          it.cat === "ALL"
            ? compDays[1].issue_clients_count ?? 0
            : compDays[1].alert_categories_summary?.[it.cat] ?? 0;
        badgeHtml = `<span class="px-1.5 py-0.2 rounded bg-slate-950/75 border border-white/10 text-[10px] font-bold inline-flex items-center gap-1" title="${compDays[0].day_label}: ${cntA} | ${compDays[1].day_label}: ${cntB}">
          <span class="text-sky-300">🟦 ${cntA}</span>
          <span class="text-slate-500">|</span>
          <span class="text-emerald-300">🟩 ${cntB}</span>
        </span>`;
      }
      return `<button type="button" onclick="selectHierarchyIssueType('${nextCat}')" class="px-2.5 py-1 rounded-lg text-[11px] border transition flex items-center gap-1.5 ${
        isSel ? it.activeCls : it.idleCls
      }">
        <i class="fa-solid ${it.icon} text-[10px]"></i>
        <span>${it.short}</span>
        ${badgeHtml}
      </button>`;
    })
    .join("");

  const chipsContainer = document.getElementById("hier-issue-type-chips");
  if (chipsContainer) {
    chipsContainer.innerHTML = chipsHtml;
  }
  document.querySelectorAll(".section-issue-type-chips").forEach((el) => {
    el.innerHTML = chipsHtml;
  });

  const onlyIssues = document.getElementById("hier-only-issues")?.checked ?? true;
  const allClients = data.clients || [];
  const floorList = data.baseline_floor_summary || data.floor_client_summary || [];
  const apList = data.baseline_ap_summary || data.ap_summary || [];

  // Función auxiliar para obtener el conteo de la falla seleccionada en un Piso
  const getFloorMetricCount = (fl) => {
    const bd = fl.alerts_breakdown || {};
    if (activeAlertCat === "Retransmisiones Altas (>=25%)") return bd.retries || 0;
    if (activeAlertCat === "Auth 802.1X: Red / ISE (>=6s)") return bd.auth_slow || 0;
    if (activeAlertCat === "Auth 802.1X: Espera Suplicante (>=6s)") return bd.auth_supplicant || 0;
    if (activeAlertCat === "Asociación Lenta (>2s)") return bd.assoc_slow || 0;
    if (activeAlertCat === "DHCP Lento (>2s)") return bd.dhcp_slow || 0;
    if (activeAlertCat === "Roaming Lento (>3s)") return bd.roam_slow || 0;
    if (activeAlertCat === "Latencia QoS Alta (Voz/Datos)") return bd.latency || 0;
    if (activeAlertCat === "Señal RF Débil / Sticky") return bd.rf_signal || 0;
    return fl.issue_clients || 0;
  };

  // Función auxiliar para obtener el conteo de la falla seleccionada en un AP
  const getApMetricCount = (ap) => {
    if (activeAlertCat === "Retransmisiones Altas (>=25%)") return ap.high_retry_clients || 0;
    if (activeAlertCat === "Auth 802.1X: Red / ISE (>=6s)") return ap.slow_auth_clients || 0;
    if (activeAlertCat === "Auth 802.1X: Espera Suplicante (>=6s)") return ap.supplicant_auth_clients || 0;
    if (activeAlertCat === "Asociación Lenta (>2s)") return ap.slow_assoc_clients || 0;
    if (activeAlertCat === "DHCP Lento (>2s)") return ap.slow_dhcp_clients || 0;
    if (activeAlertCat === "Roaming Lento (>3s)") return ap.slow_roam_clients || 0;
    if (activeAlertCat === "Latencia QoS Alta (Voz/Datos)") return ap.high_latency_clients || 0;
    if (activeAlertCat === "Señal RF Débil / Sticky") return ap.sticky_clients || 0;
    return ap.issue_clients || 0;
  };

  const sortClientsByMetric = (arr) =>
    [...arr].sort((a, b) => {
      if (activeAlertCat === "Retransmisiones Altas (>=25%)") return (b.retries || 0) - (a.retries || 0);
      if (
        activeAlertCat === "Auth 802.1X: Red / ISE (>=6s)" ||
        activeAlertCat === "Auth 802.1X: Espera Suplicante (>=6s)"
      ) {
        return (b.auth_ms || 0) - (a.auth_ms || 0);
      }
      if (activeAlertCat === "Asociación Lenta (>2s)") return (b.assoc_ms || 0) - (a.assoc_ms || 0);
      if (activeAlertCat === "DHCP Lento (>2s)") return (b.dhcp_ms || 0) - (a.dhcp_ms || 0);
      if (activeAlertCat === "Roaming Lento (>3s)") return (b.roam_ms || 0) - (a.roam_ms || 0);
      if (activeAlertCat === "Latencia QoS Alta (Voz/Datos)") {
        return (
          Math.max(b.be_lat || 0, b.voice_lat || 0, b.video_lat || 0) -
          Math.max(a.be_lat || 0, a.voice_lat || 0, a.video_lat || 0)
        );
      }
      if (activeAlertCat === "Señal RF Débil / Sticky") return (a.rssi ?? 0) - (b.rssi ?? 0);
      return (
        (b.issue_count || 0) - (a.issue_count || 0) ||
        (b.retries || 0) - (a.retries || 0) ||
        (b.auth_ms || 0) - (a.auth_ms || 0)
      );
    });

  // Constructor reutilizable para renderizar un árbol Piso ➔ AP ➔ Cliente (sea en Mitad Izquierda/Derecha o en 1 solo cuadro Acumulado)
  const buildTreeBranchHtml = (branchFloors, branchAps, branchClients, opts = {}) => {
    const {
      isSplit = false,
      accent = "emerald",
      peerFloorMap = null,
      peerApMap = null,
      peerShortDay = "",
      includeFloorsSet = null,
      includeApsSet = null,
    } = opts;

    const sortedFloors = [...branchFloors].sort(
      (a, b) =>
        getFloorMetricCount(b) - getFloorMetricCount(a) ||
        (b.issue_clients || 0) - (a.issue_clients || 0) ||
        (b.avg_retries || 0) - (a.avg_retries || 0) ||
        (b.total_clients || 0) - (a.total_clients || 0)
    );

    const visibleFloors = onlyIssues
      ? sortedFloors.filter(
          (f) => getFloorMetricCount(f) > 0 || (includeFloorsSet && includeFloorsSet.has(f.floor))
        )
      : sortedFloors;

    if (!visibleFloors.length) {
      return `<div class="p-5 text-center text-slate-400 text-xs space-y-2">
        <div>No hay pisos con fallas para el filtro seleccionado.</div>
        ${
          hasAnyFilter
            ? `<button type="button" onclick="resetToGeneralView()" class="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs">
                <i class="fa-solid fa-arrow-left mr-1"></i>Volver al General
              </button>`
            : ""
        }
      </div>`;
    }

    const clientsByAp = new Map();
    for (let i = 0; i < branchClients.length; i++) {
      const c = branchClients[i];
      if (activeAlertCat !== "ALL" && !(c.issue_categories || []).includes(activeAlertCat)) continue;
      if (onlyIssues && !(c.issue_count > 0 || (c.alarm_tags && c.alarm_tags.length > 0))) continue;
      let list = clientsByAp.get(c.ap_name);
      if (!list) {
        list = [];
        clientsByAp.set(c.ap_name, list);
      }
      list.push(c);
    }

    const floorBorderCls =
      accent === "sky"
        ? "border-sky-500/35 hover:border-sky-400/60"
        : "border-emerald-500/35 hover:border-emerald-400/60";
    const floorTitlePillCls =
      accent === "sky"
        ? "bg-sky-500/20 text-sky-200 border-sky-400/40"
        : "bg-emerald-500/20 text-emerald-200 border-emerald-400/40";

    return visibleFloors
      .map((fl, fIdx) => {
        const apsInFloor = branchAps
          .filter(
            (a) =>
              a.floor === fl.floor &&
              (onlyIssues
                ? getApMetricCount(a) > 0 || (includeApsSet && includeApsSet.has(a.ap_name))
                : true)
          )
          .sort(
            (a, b) =>
              getApMetricCount(b) - getApMetricCount(a) ||
              (b.issue_clients || 0) - (a.issue_clients || 0) ||
              (b.avg_retries || 0) - (a.avg_retries || 0) ||
              (b.client_count || 0) - (a.client_count || 0)
          );

        const bd = fl.alerts_breakdown || {};
        const isFloorFiltered = activeFloor === fl.floor;
        const floorMetricCount = getFloorMetricCount(fl);
        const floorMetricPct =
          fl.total_clients > 0 ? Math.round((floorMetricCount * 1000) / fl.total_clients) / 10 : 0;

        let peerFloorHint = "";
        if (isSplit && peerFloorMap) {
          const pFl = peerFloorMap.get(fl.floor);
          const pCnt = pFl ? getFloorMetricCount(pFl) : 0;
          const diff = floorMetricCount - pCnt;
          if (diff > 0) {
            peerFloorHint = `<span class="px-1.5 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-500/40 text-[10px] font-bold" title="Tiene ${diff} fallas más que en ${peerShortDay}">▲ +${diff} vs ${peerShortDay}</span>`;
          } else if (diff < 0) {
            peerFloorHint = `<span class="px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold" title="Tiene ${Math.abs(diff)} fallas menos que en ${peerShortDay}">▼ ${diff} vs ${peerShortDay}</span>`;
          } else {
            peerFloorHint = `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold">= Igual (${pCnt})</span>`;
          }
        }

        const floorHtmlAps = apsInFloor
          .map((ap, aIdx) => {
            const isApFiltered = activeAp === ap.ap_name;
            const apClients = sortClientsByMetric(clientsByAp.get(ap.ap_name) || []);
            const apMetricCount = getApMetricCount(ap);
            const apMetricPct =
              ap.client_count > 0 ? Math.round((apMetricCount * 1000) / ap.client_count) / 10 : 0;

            let peerApHint = "";
            if (isSplit && peerApMap) {
              const pAp = peerApMap.get(ap.ap_name);
              const pCnt = pAp ? getApMetricCount(pAp) : 0;
              const diff = apMetricCount - pCnt;
              if (diff > 0) {
                peerApHint = `<span class="px-1.5 py-0.2 rounded bg-rose-950/90 text-rose-300 border border-rose-500/35 text-[9px] font-bold">▲ +${diff} vs ${peerShortDay}</span>`;
              } else if (diff < 0) {
                peerApHint = `<span class="px-1.5 py-0.2 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/35 text-[9px] font-bold">▼ ${diff} vs ${peerShortDay}</span>`;
              } else {
                peerApHint = `<span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px]">= ${pCnt}</span>`;
              }
            }

            const isFocusedHierCat = activeAlertCat !== "ALL";
            const showHierRssi = isFocusedHierCat && activeAlertCat !== "Señal RF Débil / Sticky";
            const hierHdrSpec = isFocusedHierCat ? getFocusedClientMetricSpec({}, activeAlertCat) : null;

            const userRows = apClients
              .map((c) => {
                const shownIssues = filterIssuesForCategory(c.issues, activeAlertCat);
                const mSpec = isFocusedHierCat ? getFocusedClientMetricSpec(c, activeAlertCat) : null;
                const badgeCls = mSpec ? mSpec.badgeBorder : "bg-rose-500/20 text-rose-200 border-rose-500/30";
                const tagsHtml =
                  shownIssues && shownIssues.length
                    ? shownIssues
                        .map(
                          (iss) =>
                            `<span class="inline-block px-1.5 py-0.5 rounded border ${badgeCls} text-[10px] font-semibold mr-1 mb-0.5">${iss}</span>`
                        )
                        .join("")
                    : `<span class="text-emerald-400 text-[10px]"><i class="fa-solid fa-check"></i> Saludable</span>`;

                const devLabel = c.device_type && c.device_type !== "--" ? c.device_type : c.os;
                const userCell = `<td class="py-1.5 px-2">
                    <div class="font-bold text-white flex flex-wrap items-center gap-1">
                      ${
                        !isSplit
                          ? `<span class="px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-500/40 text-[9px] font-bold">📅 ${c.day_label || "--"}</span>`
                          : ""
                      }
                      <i class="fa-solid fa-user text-[10px] text-sky-400"></i>
                      <span>${c.user_id}</span>
                      <span class="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-[9px] font-semibold">${devLabel}</span>
                      ${
                        c.is_corporate || String(c.hostname || "").toUpperCase().startsWith("COL-")
                          ? `<span class="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">Corp</span>`
                          : `<span class="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">Ext</span>`
                      }
                    </div>
                    <div class="text-[10px] text-slate-400">${c.hostname} • ${c.mac}</div>
                  </td>`;

                if (isFocusedHierCat && mSpec) {
                  const hierRssiCell = showHierRssi
                    ? `<td class="py-1.5 px-2 text-center font-mono text-[11px] whitespace-nowrap">
                        <span class="${c.rssi !== null && c.rssi < -79 ? "text-rose-400 font-bold" : c.rssi !== null && c.rssi < -67 ? "text-amber-300 font-semibold" : "text-slate-200"}">${c.rssi !== null ? `${c.rssi} dBm` : "--"}</span>
                        <span class="text-slate-400 text-[10px]">${c.snr !== null ? `/ ${c.snr}dB` : ""}</span>
                      </td>`
                    : "";
                  return `<tr class="hover:bg-slate-800/70 cursor-pointer transition" onclick="quickFilterByUser('${c.user_id}')">
                    ${userCell}
                    ${hierRssiCell}
                    <td class="py-1.5 px-2 text-center font-mono text-xs whitespace-nowrap">${mSpec.valueHtml}</td>
                    <td class="py-1.5 px-2">${tagsHtml}</td>
                  </tr>`;
                }

                return `<tr class="hover:bg-slate-800/70 cursor-pointer transition" onclick="quickFilterByUser('${c.user_id}')">
                  ${userCell}
                  <td class="py-1.5 px-2 text-center font-bold ${(c.retries || 0) >= 25 ? "text-rose-400" : "text-slate-200"}">${c.retries ?? 0}%</td>
                  <td class="py-1.5 px-2 text-center font-mono text-[10px]">
                    <div>
                      <span class="${(c.assoc_ms || 0) > 2000 ? "text-emerald-300 font-bold" : "text-slate-300"}">Asoc:${c.assoc_ms ?? "--"}</span> |
                      <span class="${(c.auth_ms || 0) >= 6000 ? "text-amber-300 font-bold" : "text-slate-200"}">Auth:${c.auth_ms ?? "--"}</span> |
                      <span class="${(c.dhcp_ms || 0) > 2000 ? "text-sky-300 font-bold" : "text-slate-300"}">DHCP:${c.dhcp_ms ?? "--"}</span>
                    </div>
                    <div class="text-slate-400">Roam:${c.roam_ms !== null && c.roam_ms !== undefined ? `${c.roam_ms}ms` : "--"} • Lat V:${c.voice_lat ?? "--"}/D:${c.be_lat ?? "--"}ms • RSSI:${c.rssi !== null ? `${c.rssi}dBm` : "--"}</div>
                  </td>
                  <td class="py-1.5 px-2">${tagsHtml}</td>
                </tr>`;
              })
              .join("");

            const apFilterBtn = isApFiltered
              ? `<button type="button" onclick="event.stopPropagation(); resetToGeneralView()" class="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[10px] shadow">
                  <i class="fa-solid fa-arrow-left"></i> General
                </button>`
              : `<button type="button" onclick="event.stopPropagation(); quickFilterByAp('${ap.ap_name}')" class="px-2 py-0.5 rounded bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-500/40 text-[10px] font-bold">
                  Filtrar AP
                </button>`;

            const apStatusPill =
              apMetricCount > 0
                ? `<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-[10px]">
                    ${apMetricCount} fallas / ${ap.client_count} ses. (${apMetricPct}%)
                  </span>`
                : `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                    ✅ 0 fallas / ${ap.client_count} ses.
                  </span>`;

            const apBreakdownPillsHtml = isFocusedHierCat
              ? (() => {
                  if (activeAlertCat === "Retransmisiones Altas (>=25%)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-rose-600 text-white font-extrabold">Retries >= 25%: <strong>${ap.high_retry_clients || 0}</strong> (Prom AP: ${ap.avg_retries || 0}%)</span>`;
                  }
                  if (activeAlertCat === "Auth 802.1X: Red / ISE (>=6s)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-purple-600 text-white font-extrabold">Auth ISE/Red >= 6s: <strong>${ap.slow_auth_clients || 0}</strong> (Prom AP: ${ap.avg_auth_ms || 0} ms)</span>`;
                  }
                  if (activeAlertCat === "Auth 802.1X: Espera Suplicante (>=6s)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-pink-600 text-white font-extrabold">Espera Suplicante >= 6s: <strong>${ap.supplicant_auth_clients || 0}</strong> (Prom AP: ${ap.avg_auth_ms || 0} ms)</span>`;
                  }
                  if (activeAlertCat === "Asociación Lenta (>2s)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-emerald-600 text-white font-extrabold">Asociación > 2s: <strong>${ap.slow_assoc_clients || 0}</strong> (Prom AP: ${ap.avg_assoc_ms || 0} ms)</span>`;
                  }
                  if (activeAlertCat === "DHCP Lento (>2s)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-sky-600 text-white font-extrabold">DHCP > 2s: <strong>${ap.slow_dhcp_clients || 0}</strong> (Prom AP: ${ap.avg_dhcp_ms || 0} ms)</span>`;
                  }
                  if (activeAlertCat === "Roaming Lento (>3s)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-indigo-600 text-white font-extrabold">Roaming > 3s: <strong>${ap.slow_roam_clients || 0}</strong> (Prom AP: ${ap.avg_roam_ms || 0} ms)</span>`;
                  }
                  if (activeAlertCat === "Latencia QoS Alta (Voz/Datos)") {
                    return `<span class="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-extrabold">Latencia Voz/Datos: <strong>${ap.high_latency_clients || 0}</strong> (Prom Voz: ${ap.avg_voice_lat || 0} ms • Datos: ${ap.avg_be_lat || 0} ms)</span>`;
                  }
                  if (activeAlertCat === "Señal RF Débil / Sticky") {
                    return `<span class="px-1.5 py-0.2 rounded bg-teal-500 text-slate-950 font-extrabold">Señal Débil: <strong>${ap.sticky_clients || 0}</strong> (RSSI Prom: ${ap.avg_rssi || 0} dBm)</span>`;
                  }
                  return "";
                })()
              : `<span class="px-1.5 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-500/30">Ret: <strong>${ap.high_retry_clients || 0}</strong> (${ap.avg_retries || 0}%)</span>
                 <span class="px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30">ISE/Red: <strong>${ap.slow_auth_clients || 0}</strong></span>
                 <span class="px-1.5 py-0.2 rounded bg-pink-950/80 text-pink-300 border border-pink-500/30">Supl: <strong>${ap.supplicant_auth_clients || 0}</strong></span>
                 <span class="px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">Asoc: <strong>${ap.slow_assoc_clients || 0}</strong></span>
                 <span class="px-1.5 py-0.2 rounded bg-sky-950/80 text-sky-300 border border-sky-500/30">DHCP: <strong>${ap.slow_dhcp_clients || 0}</strong></span>
                 <span class="px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">Roam: <strong>${ap.slow_roam_clients || 0}</strong></span>
                 <span class="px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">Lat: <strong>${ap.high_latency_clients || 0}</strong></span>
                 <span class="px-1.5 py-0.2 rounded bg-teal-950/80 text-teal-300 border border-teal-500/30">RF: <strong>${ap.sticky_clients || 0}</strong></span>`;

            const tableTheadHtml = isFocusedHierCat
              ? `<tr class="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                   <th class="py-1 px-2">Usuario / Equipo</th>
                   ${showHierRssi ? `<th class="py-1 px-2 text-center">RSSI / SNR</th>` : ""}
                   <th class="py-1 px-2 text-center text-amber-300">${hierHdrSpec ? hierHdrSpec.header : "Valor Medido"}</th>
                   <th class="py-1 px-2">Falla Seleccionada</th>
                 </tr>`
              : `<tr class="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                   <th class="py-1 px-2">Usuario / Equipo</th>
                   <th class="py-1 px-2 text-center">Retries</th>
                   <th class="py-1 px-2 text-center">Tiempos (ms) / Latencia / Señal</th>
                   <th class="py-1 px-2">Fallas</th>
                 </tr>`;

            return `
            <details data-sync-key="ap::${fl.floor}::${ap.ap_name}" class="group bg-slate-950/85 rounded-xl border border-slate-800/90 overflow-hidden" ${isApFiltered ? "open" : ""}>
              <summary class="cursor-pointer px-3 py-2 hover:bg-slate-900/90 transition space-y-1.5 select-none">
                <div class="flex flex-wrap items-center justify-between gap-1.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <i class="fa-solid fa-chevron-right text-[10px] text-slate-400 group-open:rotate-90 transition-transform"></i>
                    <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold text-[11px]">
                      <i class="fa-solid fa-tower-broadcast mr-1"></i>#${aIdx + 1} ${ap.ap_name}
                    </span>
                    ${apStatusPill}
                    ${peerApHint}
                  </div>
                  ${apFilterBtn}
                </div>
                <div class="flex flex-wrap items-center gap-1 text-[10px] pl-4">
                  ${apBreakdownPillsHtml}
                </div>
              </summary>
              <div class="p-2.5 border-t border-slate-800/80 bg-slate-950/60 overflow-x-auto">
                ${
                  userRows
                    ? `<table class="w-full text-left border-collapse text-xs">
                        <thead>${tableTheadHtml}</thead>
                        <tbody class="divide-y divide-slate-900">${userRows}</tbody>
                      </table>`
                    : `<div class="text-[11px] text-emerald-300 py-1.5 px-2">✅ Sin clientes con esta falla en este AP durante este día.</div>`
                }
              </div>
            </details>`;
          })
          .join("");

        const floorFilterBtn = isFloorFiltered
          ? `<button type="button" onclick="event.stopPropagation(); resetToGeneralView()" class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[10px] shadow flex items-center gap-1">
              <i class="fa-solid fa-arrow-left"></i> Volver
            </button>`
          : `<button type="button" onclick="event.stopPropagation(); quickFilterByFloor('${fl.floor}')" class="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[10px] font-bold">
              Filtrar Piso
            </button>`;

        const floorStatusPill =
          floorMetricCount > 0
            ? `<span class="px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-500/50 font-extrabold text-[11px]">
                ${floorMetricCount} con falla / ${fl.total_clients} ses. (${floorMetricPct}%)
              </span>`
            : `<span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-extrabold text-[11px]">
                ✅ 0 fallas / ${fl.total_clients} ses. (0%)
              </span>`;

        const floorBreakdownPillsHtml =
          activeAlertCat !== "ALL"
            ? (() => {
                if (activeAlertCat === "Retransmisiones Altas (>=25%)") {
                  return `<span class="px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold">Retries >= 25%: <strong>${bd.retries || 0}</strong> (Prom Piso: ${fl.avg_retries || 0}%)</span>`;
                }
                if (activeAlertCat === "Auth 802.1X: Red / ISE (>=6s)") {
                  return `<span class="px-2 py-0.5 rounded bg-purple-600 text-white font-extrabold">Auth ISE/Red >= 6s: <strong>${bd.auth_slow || 0}</strong> (Prom Piso: ${fl.avg_auth_ms || 0} ms)</span>`;
                }
                if (activeAlertCat === "Auth 802.1X: Espera Suplicante (>=6s)") {
                  return `<span class="px-2 py-0.5 rounded bg-pink-600 text-white font-extrabold">Espera Suplicante >= 6s: <strong>${bd.auth_supplicant || 0}</strong> (Prom Piso: ${fl.avg_auth_ms || 0} ms)</span>`;
                }
                if (activeAlertCat === "Asociación Lenta (>2s)") {
                  return `<span class="px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold">Asociación > 2s: <strong>${bd.assoc_slow || 0}</strong> (Prom Piso: ${fl.avg_assoc_ms || 0} ms)</span>`;
                }
                if (activeAlertCat === "DHCP Lento (>2s)") {
                  return `<span class="px-2 py-0.5 rounded bg-sky-600 text-white font-extrabold">DHCP > 2s: <strong>${bd.dhcp_slow || 0}</strong> (Prom Piso: ${fl.avg_dhcp_ms || 0} ms)</span>`;
                }
                if (activeAlertCat === "Roaming Lento (>3s)") {
                  return `<span class="px-2 py-0.5 rounded bg-indigo-600 text-white font-extrabold">Roaming > 3s: <strong>${bd.roam_slow || 0}</strong> (Prom Piso: ${fl.avg_roam_ms || 0} ms)</span>`;
                }
                if (activeAlertCat === "Latencia QoS Alta (Voz/Datos)") {
                  return `<span class="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold">Latencia Voz/Datos: <strong>${bd.latency || 0}</strong> (Prom Voz: ${fl.avg_voice_lat || 0} ms • Datos: ${fl.avg_be_lat || 0} ms)</span>`;
                }
                if (activeAlertCat === "Señal RF Débil / Sticky") {
                  return `<span class="px-2 py-0.5 rounded bg-teal-500 text-slate-950 font-extrabold">Señal Débil: <strong>${bd.rf_signal || 0}</strong> (RSSI Prom: ${fl.avg_rssi || 0} dBm)</span>`;
                }
                return "";
              })()
            : `<button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Retransmisiones Altas (>=25%)')" class="px-1.5 py-0.5 rounded transition bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/30">Ret >=25%: <strong>${bd.retries || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Auth 802.1X: Red / ISE (>=6s)')" class="px-1.5 py-0.5 rounded transition bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-500/30">ISE/Red: <strong>${bd.auth_slow || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Auth 802.1X: Espera Suplicante (>=6s)')" class="px-1.5 py-0.5 rounded transition bg-pink-950/80 hover:bg-pink-900 text-pink-300 border border-pink-500/30">Suplicante: <strong>${bd.auth_supplicant || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Asociación Lenta (>2s)')" class="px-1.5 py-0.5 rounded transition bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30">Asoc: <strong>${bd.assoc_slow || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('DHCP Lento (>2s)')" class="px-1.5 py-0.5 rounded transition bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-500/30">DHCP: <strong>${bd.dhcp_slow || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Roaming Lento (>3s)')" class="px-1.5 py-0.5 rounded transition bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/30">Roam: <strong>${bd.roam_slow || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Latencia QoS Alta (Voz/Datos)')" class="px-1.5 py-0.5 rounded transition bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/30">Latencia: <strong>${bd.latency || 0}</strong></button>
               <button type="button" onclick="event.stopPropagation(); selectHierarchyIssueType('Señal RF Débil / Sticky')" class="px-1.5 py-0.5 rounded transition bg-teal-950/80 hover:bg-teal-900 text-teal-300 border border-teal-500/30">Señal: <strong>${bd.rf_signal || 0}</strong></button>`;

        return `
        <details data-sync-key="floor::${fl.floor}" class="group bg-slate-900/90 rounded-xl border ${floorBorderCls} overflow-hidden shadow-sm transition" ${isFloorFiltered || activeAp !== "ALL" ? "open" : ""}>
          <summary class="cursor-pointer px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800/90 transition space-y-1.5 select-none">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <i class="fa-solid fa-chevron-right text-xs text-slate-400 group-open:rotate-90 transition-transform"></i>
                <span class="px-2 py-0.5 rounded-lg border font-extrabold text-xs ${floorTitlePillCls}">
                  <i class="fa-solid fa-building mr-1"></i>Top #${fIdx + 1} — ${fl.floor}
                </span>
                ${floorStatusPill}
                ${peerFloorHint}
                <span class="text-[11px] text-slate-400">${fl.unique_users || fl.total_clients} usu. • ${fl.aps_count || apsInFloor.length} APs</span>
              </div>
              ${floorFilterBtn}
            </div>
            <div class="flex flex-wrap items-center gap-1 text-[10px] pl-4">
              ${floorBreakdownPillsHtml}
            </div>
          </summary>
          <div class="p-2.5 space-y-2 border-t border-slate-800 bg-slate-900/50">
            <div class="text-[11px] font-bold text-sky-300 flex items-center justify-between gap-2 px-1">
              <span><i class="fa-solid fa-sitemap mr-1"></i>APs en ${fl.floor} (${apsInFloor.length} mostrados):</span>
              ${
                isFloorFiltered
                  ? `<button type="button" onclick="resetToGeneralView()" class="text-[10px] text-amber-300 hover:text-amber-200 underline font-extrabold"><i class="fa-solid fa-arrow-left mr-1"></i>Todos los Pisos</button>`
                  : ""
              }
            </div>
            ${floorHtmlAps || `<div class="text-xs text-slate-400 p-2">Sin APs con fallas en este piso.</div>`}
          </div>
        </details>`;
      })
      .join("");
  };

  if (compDays.length >= 2) {
    // MODO COMPARACIÓN LADO A LADO: 50% Izquierda = Día 1 | 50% Derecha = Día 2
    const dayA = compDays[0];
    const dayB = compDays[1];
    const floorsA = dayA.floor_client_summary || [];
    const floorsB = dayB.floor_client_summary || [];
    const apsA = dayA.ap_summary || [];
    const apsB = dayB.ap_summary || [];
    const clientsA = allClients.filter((c) => c.day_label === dayA.day_label);
    const clientsB = allClients.filter((c) => c.day_label === dayB.day_label);

    const floorMapA = new Map(floorsA.map((f) => [f.floor, f]));
    const floorMapB = new Map(floorsB.map((f) => [f.floor, f]));
    const apMapA = new Map(apsA.map((a) => [a.ap_name, a]));
    const apMapB = new Map(apsB.map((a) => [a.ap_name, a]));

    const floorsWithIssuesUnion = new Set([
      ...floorsA.filter((f) => getFloorMetricCount(f) > 0).map((f) => f.floor),
      ...floorsB.filter((f) => getFloorMetricCount(f) > 0).map((f) => f.floor),
    ]);
    const apsWithIssuesUnion = new Set([
      ...apsA.filter((a) => getApMetricCount(a) > 0).map((a) => a.ap_name),
      ...apsB.filter((a) => getApMetricCount(a) > 0).map((a) => a.ap_name),
    ]);

    const dayAIssues =
      activeAlertCat === "ALL"
        ? dayA.issue_clients_count ?? 0
        : dayA.alert_categories_summary?.[activeAlertCat] ?? 0;
    const dayBIssues =
      activeAlertCat === "ALL"
        ? dayB.issue_clients_count ?? 0
        : dayB.alert_categories_summary?.[activeAlertCat] ?? 0;
    const dayAPct = dayA.total_clients > 0 ? Math.round((dayAIssues * 1000) / dayA.total_clients) / 10 : 0;
    const dayBPct = dayB.total_clients > 0 ? Math.round((dayBIssues * 1000) / dayB.total_clients) / 10 : 0;

    const leftTreeHtml = buildTreeBranchHtml(floorsA, apsA, clientsA, {
      isSplit: true,
      accent: "sky",
      peerFloorMap: floorMapB,
      peerApMap: apMapB,
      peerShortDay: dayB.day_label.slice(-5),
      includeFloorsSet: floorsWithIssuesUnion,
      includeApsSet: apsWithIssuesUnion,
    });

    const rightTreeHtml = buildTreeBranchHtml(floorsB, apsB, clientsB, {
      isSplit: true,
      accent: "emerald",
      peerFloorMap: floorMapA,
      peerApMap: apMapA,
      peerShortDay: dayA.day_label.slice(-5),
      includeFloorsSet: floorsWithIssuesUnion,
      includeApsSet: apsWithIssuesUnion,
    });

    container.className = "grid grid-cols-1 md:grid-cols-2 gap-3 items-start";
    container.innerHTML = `
      <!-- MITAD IZQUIERDA: DÍA 1 -->
      <div class="min-w-0 rounded-xl border-2 border-sky-400/60 bg-slate-950/75 overflow-hidden shadow-lg">
        <div class="bg-sky-950/80 border-b border-sky-400/40 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg bg-sky-500 text-slate-950 font-extrabold text-xs shadow">
              🟦 DÍA 1: ${dayA.day_label}
            </span>
            <span class="text-xs text-sky-100 font-bold">
              ${dayA.unique_users || dayA.total_clients} usu. <span class="text-sky-300/80 font-normal">(${dayA.total_clients} ses.)</span>
            </span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-400/50 text-xs font-extrabold">
            ${dayAIssues} con falla (${dayAPct}%)
          </span>
        </div>
        <div class="hier-half-scroll p-2.5 space-y-2 max-h-[540px] overflow-y-auto">
          ${leftTreeHtml}
        </div>
      </div>

      <!-- MITAD DERECHA: DÍA 2 -->
      <div class="min-w-0 rounded-xl border-2 border-emerald-400/60 bg-slate-950/75 overflow-hidden shadow-lg">
        <div class="bg-emerald-950/80 border-b border-emerald-400/40 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950 font-extrabold text-xs shadow">
              🟩 DÍA 2: ${dayB.day_label}
            </span>
            <span class="text-xs text-emerald-100 font-bold">
              ${dayB.unique_users || dayB.total_clients} usu. <span class="text-emerald-300/80 font-normal">(${dayB.total_clients} ses.)</span>
            </span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-400/50 text-xs font-extrabold">
            ${dayBIssues} con falla (${dayBPct}%)
          </span>
        </div>
        <div class="hier-half-scroll p-2.5 space-y-2 max-h-[540px] overflow-y-auto">
          ${rightTreeHtml}
        </div>
      </div>
    `;

    // Sincronizar apertura/cierre de un mismo Piso o AP entre Mitad Izquierda y Mitad Derecha
    let syncingDetails = false;
    container.querySelectorAll("details[data-sync-key]").forEach((det) => {
      det.addEventListener("toggle", () => {
        if (syncingDetails) return;
        const key = det.getAttribute("data-sync-key");
        if (!key) return;
        syncingDetails = true;
        container.querySelectorAll("details[data-sync-key]").forEach((peer) => {
          if (peer !== det && peer.getAttribute("data-sync-key") === key) {
            peer.open = det.open;
            if (det.open) {
              const scrollBox = peer.closest(".hier-half-scroll");
              if (scrollBox) {
                const targetTop = peer.offsetTop - scrollBox.offsetTop - 8;
                scrollBox.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
              }
            }
          }
        });
        setTimeout(() => {
          syncingDetails = false;
        }, 50);
      });
    });
    return;
  }

  // MODO UNIFICADO (ACUMULADO O 1 SOLO DÍA): 1 solo cuadro de ancho completo
  const unifiedTreeHtml = buildTreeBranchHtml(floorList, apList, allClients, {
    isSplit: false,
    accent: "emerald",
  });
  container.className = "space-y-2 max-h-[560px] overflow-y-auto pr-1";
  container.innerHTML = unifiedTreeHtml;
}

function renderBusyApsSection(data) {
  ["busyAps", "busyFloors", "busyApsCorrelation", "busyFloorsCorrelation"].forEach(destroyChart);

  const selectedFloorFilter = document.getElementById("filter-client-floor")?.value || "ALL";
  const isSingleFloorSelected = Boolean(selectedFloorFilter && selectedFloorFilter !== "ALL");
  const compDays = getComparisonDays(data);
  const isTwoDay = compDays.length >= 2;
  const toGb = (mb) => Math.round(((mb || 0) / 1024) * 100) / 100;

  // Si se selecciona un Piso específico, ocultar "Tiempos Promedio por Piso" y expandir "Por AP" al 100%
  const floorCorrCardEl = document.getElementById("card-busy-floors-correlation");
  const avgTimesGridEl = document.getElementById("avg-times-charts-grid");
  if (floorCorrCardEl) {
    if (isSingleFloorSelected) {
      if (typeof activeSpotlightCard !== "undefined" && activeSpotlightCard === floorCorrCardEl) {
        closeChartSpotlight();
      }
      floorCorrCardEl.classList.add("hidden");
    } else {
      floorCorrCardEl.classList.remove("hidden");
    }
  }
  if (avgTimesGridEl) {
    avgTimesGridEl.classList.toggle("lg:grid-cols-2", !isSingleFloorSelected);
    avgTimesGridEl.classList.toggle("lg:grid-cols-1", isSingleFloorSelected);
  }

  const METRIC_SPECS = {
    auth: { field: "avg_auth_ms", label: "Auth 802.1X (ms)", short: "Auth 802.1X", color: "rgba(245, 158, 11, 0.78)", border: "#fbbf24" },
    dhcp: { field: "avg_dhcp_ms", label: "DHCP (ms)", short: "DHCP", color: "rgba(56, 189, 248, 0.78)", border: "#38bdf8" },
    roam: { field: "avg_roam_ms", label: "Roaming (ms)", short: "Roaming", color: "rgba(168, 85, 247, 0.78)", border: "#c084fc" },
    assoc: { field: "avg_assoc_ms", label: "Asociación (ms)", short: "Asociación", color: "rgba(16, 185, 129, 0.78)", border: "#34d399" },
  };
  // En Comparar 2 Días, si estaba en "all", usar "auth" por defecto (barras limpias Azul vs Verde) y dejar "stacked" como opción
  const effectiveMetric = isTwoDay && busyApsCorrMetricFilter === "all" ? "auth" : busyApsCorrMetricFilter;
  const activeSpec = METRIC_SPECS[effectiveMetric] || null;
  const isStackedTwoDay = isTwoDay && effectiveMetric === "stacked";

  // Botones de proceso en las cabeceras de ambas tarjetas
  const corrToggleEls = document.querySelectorAll(".busy-aps-corr-metric-toggle, #busy-aps-corr-metric-toggle");
  if (corrToggleEls.length) {
    const btnItems = isTwoDay
      ? [
          { id: "auth", label: "Auth 802.1X" },
          { id: "dhcp", label: "DHCP" },
          { id: "roam", label: "Roaming" },
          { id: "assoc", label: "Asoc" },
          { id: "stacked", label: "Apilado" },
        ]
      : [
          { id: "all", label: "Todos" },
          { id: "auth", label: "Auth 802.1X" },
          { id: "dhcp", label: "DHCP" },
          { id: "roam", label: "Roaming" },
          { id: "assoc", label: "Asoc" },
        ];
    const corrHtml = btnItems
      .map(
        (b) =>
          `<button type="button" onclick="setBusyApsCorrMetricFilter('${b.id}')" class="px-2 py-0.5 rounded text-[10px] font-bold border transition ${
            effectiveMetric === b.id
              ? b.id === "all" || b.id === "stacked"
                ? "bg-amber-500/30 text-amber-200 border-amber-400"
                : "bg-sky-500/30 text-sky-200 border-sky-400"
              : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
          }">${b.label}</button>`
      )
      .join("");
    corrToggleEls.forEach((el) => {
      el.innerHTML = corrHtml;
    });
  }

  // Plugin ligero para badges de ms sobre barras y halo oscuro en líneas de tráfico
  const avgTimesBarPlugin = {
    id: "avgTimesBarPlugin",
    beforeDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (ds && ds.type === "line") {
        chart.ctx.save();
        chart.ctx.shadowColor = "rgba(2, 6, 23, 0.95)";
        chart.ctx.shadowBlur = 6;
        chart.ctx.shadowOffsetY = 1;
      }
    },
    afterDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (ds && ds.type === "line") chart.ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const isLarge = (chart.height || 0) > 360;
      ctx.save();
      chart.data.datasets.forEach((ds, dsIdx) => {
        if (!ds.barBadgeFmt) return;
        const meta = chart.getDatasetMeta(dsIdx);
        if (!meta || meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const txt = ds.barBadgeFmt(i);
          if (!txt) return;
          const narrowAvgBar = !isLarge && (bar.width || 36) < 20;
          ctx.font = `bold ${isLarge ? 10 : narrowAvgBar ? 7.8 : 9}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = ds.barBadgeColor || "#fde68a";
          ctx.fillText(txt, bar.x, Math.max(11, bar.y - 3));
        });
      });
      ctx.restore();
    },
  };

  const TRAFFIC_BRIGHT = [
    { color: "#00e5ff", pt: "circle", radius: 4.5, hoverRadius: 6.5 },
    { color: "#39ff7a", pt: "triangle", radius: 5.2, hoverRadius: 7.0 },
  ];

  const fmtMsBadge = (v) => {
    if (!v || v <= 0) return "";
    return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
  };

  // Títulos dinámicos
  const titleFlEl = document.getElementById("title-busy-floors-correlation");
  if (titleFlEl) {
    const mTxt = activeSpec ? activeSpec.short : "Auth, DHCP, Roam";
    titleFlEl.textContent = isTwoDay
      ? `3. Tiempos Promedio (${mTxt}) por Piso (${compDays[0].day_label} vs ${compDays[1].day_label})`
      : `3. Tiempos Promedio por Piso (${mTxt} ms)`;
  }
  const titleApEl = document.getElementById("title-busy-aps-correlation");
  if (titleApEl) {
    const mTxt = activeSpec ? activeSpec.short : "Auth, DHCP, Roam";
    const prefix = isSingleFloorSelected ? "Tiempos Promedio por AP" : "4. Tiempos Promedio por AP";
    const flSuffix = isSingleFloorSelected ? ` — ${selectedFloorFilter}` : "";
    titleApEl.textContent = isTwoDay
      ? `${prefix}${flSuffix} (${mTxt}: ${compDays[0].day_label} vs ${compDays[1].day_label})`
      : `${prefix}${flSuffix} (${mTxt} ms)`;
  }

  // ---------------- 1. GRÁFICA TIEMPOS PROMEDIO POR PISO (TODOS LOS PISOS) ----------------
  const cFlCorr = isSingleFloorSelected ? null : document.getElementById("chart-busy-floors-correlation");
  if (cFlCorr) {
    const sortFloorKey = (f) =>
      activeSpec
        ? f?.[activeSpec.field] || 0
        : (f?.avg_auth_ms || 0) + (f?.avg_dhcp_ms || 0) + (f?.avg_roam_ms || 0);

    let topFloors;
    if (isTwoDay) {
      const d0MapTmp = new Map((compDays[0].floor_client_summary || []).map((f) => [f.floor, f]));
      const d1MapTmp = new Map((compDays[1].floor_client_summary || []).map((f) => [f.floor, f]));
      const baseMapTmp = new Map((data.floor_client_summary || []).map((f) => [f.floor, f]));
      const allFlNames = new Set([
        ...baseMapTmp.keys(),
        ...d0MapTmp.keys(),
        ...d1MapTmp.keys(),
      ]);
      topFloors = [...allFlNames]
        .filter((flName) => flName && flName !== "--")
        .map((flName) => {
          const fBase = baseMapTmp.get(flName);
          const f0 = d0MapTmp.get(flName);
          const f1 = d1MapTmp.get(flName);
          return (
            fBase ||
            f0 ||
            f1 || { floor: flName, unique_users: 0 }
          );
        })
        .sort((a, b) => {
          const scoreA = sortFloorKey(d0MapTmp.get(a.floor)) + sortFloorKey(d1MapTmp.get(a.floor));
          const scoreB = sortFloorKey(d0MapTmp.get(b.floor)) + sortFloorKey(d1MapTmp.get(b.floor));
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (b.unique_users || 0) - (a.unique_users || 0);
        });
    } else {
      const rawFloors = [...(data.floor_client_summary || [])].filter(
        (f) => f && f.floor && f.floor !== "--"
      );
      topFloors = rawFloors.sort(
        (a, b) => sortFloorKey(b) - sortFloorKey(a) || (b.unique_users || 0) - (a.unique_users || 0)
      );
    }

    let flDatasets = [];
    if (isTwoDay) {
      const d0 = compDays[0];
      const d1 = compDays[1];
      const dayMaps = [
        new Map((d0.floor_client_summary || []).map((f) => [f.floor, f])),
        new Map((d1.floor_client_summary || []).map((f) => [f.floor, f])),
      ];
      if (isStackedTwoDay) {
        [d0, d1].forEach((d, dIdx) => {
          ["auth", "dhcp", "roam"].forEach((k) => {
            const sp = METRIC_SPECS[k];
            flDatasets.push({
              label: `${sp.short} (${d.day_label})`,
              data: topFloors.map((f) => dayMaps[dIdx].get(f.floor)?.[sp.field] || 0),
              backgroundColor: sp.color,
              borderColor: dIdx === 1 ? "#ffffff" : "transparent",
              borderWidth: dIdx === 1 ? 1 : 0,
              stack: d.day_label,
              yAxisID: "y",
              order: 2,
            });
          });
        });
      } else {
        const sp = activeSpec || METRIC_SPECS.auth;
        [d0, d1].forEach((d, dIdx) => {
          const vals = topFloors.map((f) => dayMaps[dIdx].get(f.floor)?.[sp.field] || 0);
          flDatasets.push({
            label: `Día ${dIdx + 1} (${d.day_label}) • ${sp.short}`,
            data: vals,
            backgroundColor: dIdx === 0 ? "rgba(37, 99, 235, 0.72)" : "rgba(21, 128, 61, 0.76)",
            borderColor: dIdx === 0 ? "#3b82f6" : "#22c55e",
            borderWidth: 1.4,
            borderRadius: 6,
            categoryPercentage: 0.78,
            barPercentage: 0.88,
            yAxisID: "y",
            order: 2,
            barBadgeColor: dIdx === 0 ? "#93c5fd" : "#86efac",
            barBadgeFmt: (i) => fmtMsBadge(vals[i]),
          });
        });
        if (showAlertChartTraffic) {
          [d0, d1].forEach((d, dIdx) => {
            const st = TRAFFIC_BRIGHT[dIdx];
            flDatasets.push({
              type: "line",
              isTrafficLine: true,
              label: `Tráfico Día ${dIdx + 1} (${d.day_label}) GB`,
              data: topFloors.map((f) => toGb(dayMaps[dIdx].get(f.floor)?.usage_mb)),
              yAxisID: "y1",
              borderColor: st.color,
              backgroundColor: st.color,
              borderWidth: 2.8,
              pointStyle: st.pt,
              pointBackgroundColor: st.color,
              pointBorderColor: "#ffffff",
              pointBorderWidth: 1.8,
              pointRadius: st.radius,
              pointHoverRadius: st.hoverRadius,
              pointHitRadius: 12,
              tension: 0.25,
              order: 0,
            });
          });
        }
      }
    } else {
      if (showAlertChartTraffic) {
        flDatasets.push({
          type: "line",
          isTrafficLine: true,
          label: "Tráfico Total (GB)",
          data: topFloors.map((f) => toGb(f.usage_mb)),
          borderColor: "#facc15",
          backgroundColor: "#facc15",
          pointBackgroundColor: "#0f172a",
          pointBorderColor: "#facc15",
          pointBorderWidth: 2.2,
          pointStyle: "rect",
          borderWidth: 3.2,
          borderDash: [2, 8],
          borderCapStyle: "round",
          pointRadius: 5,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y1",
          order: 0,
        });
      }
      if (activeSpec) {
        const vals = topFloors.map((f) => f[activeSpec.field] || 0);
        flDatasets.push({
          label: activeSpec.label,
          data: vals,
          backgroundColor: "rgba(56, 189, 248, 0.30)",
          borderColor: "rgba(56, 189, 248, 0.80)",
          borderWidth: 1.1,
          borderRadius: 5,
          yAxisID: "y",
          order: 2,
          barBadgeColor: "#7dd3fc",
          barBadgeFmt: (i) => fmtMsBadge(vals[i]),
        });
      } else {
        ["auth", "dhcp", "roam"].forEach((k) => {
          const sp = METRIC_SPECS[k];
          flDatasets.push({
            label: sp.label,
            data: topFloors.map((f) => f[sp.field] || 0),
            backgroundColor: sp.color,
            borderColor: sp.border,
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          });
        });
      }
    }

    const showFlTrafficAxis = !isStackedTwoDay && showAlertChartTraffic;
    const manyAvgFloors = topFloors.length > 9;
    charts.busyFloorsCorrelation = new Chart(cFlCorr, {
      type: "bar",
      plugins: isStackedTwoDay ? [] : [avgTimesBarPlugin],
      data: {
        labels: topFloors.map((f) => formatFloorChartLabel(f.floor, topFloors.length)),
        datasets: flDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: true },
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const flObj = topFloors[elements[0].index];
            if (flObj?.floor) quickFilterByFloor(flObj.floor);
          }
        },
        plugins: {
          legend: buildComboLegendOptions(9.5),
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items?.length) return "";
                const flObj = topFloors[items[0].dataIndex];
                return flObj ? flObj.floor : "";
              },
              label: (ctx) => {
                const ds = ctx.dataset || {};
                const v = ctx.parsed.y;
                return ds.isTrafficLine ? ` ${ds.label}: ${v} GB` : ` ${ds.label}: ${v} ms`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: isStackedTwoDay,
            ticks: {
              color: "#e2e8f0",
              font: { size: manyAvgFloors ? 8.5 : 9.5, weight: "600" },
              maxRotation: manyAvgFloors ? 32 : 0,
              minRotation: manyAvgFloors ? 28 : 0,
              autoSkip: false,
            },
          },
          y: {
            stacked: isStackedTwoDay,
            position: "left",
            beginAtZero: true,
            grace: "16%",
            title: {
              display: true,
              text: "Tiempo Promedio (ms)",
              color: activeSpec || isTwoDay ? "#38bdf8" : "#fbbf24",
              font: { size: 10, weight: "bold" },
            },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          ...(showFlTrafficAxis
            ? {
                y1: {
                  position: "right",
                  beginAtZero: true,
                  grace: "18%",
                  title: {
                    display: true,
                    text: isTwoDay ? "Tráfico (GB)" : "Tráfico (GB) •••",
                    color: isTwoDay ? "#00e5ff" : "#facc15",
                    font: { size: 10, weight: "bold" },
                  },
                  ticks: {
                    color: isTwoDay ? "#cbd5e1" : "#fde047",
                    font: { size: 9 },
                    callback: (v) => `${v}G`,
                  },
                  grid: { drawOnChartArea: false },
                },
              }
            : {}),
        },
      },
    });
  }

  // ---------------- 2. GRÁFICA TIEMPOS PROMEDIO POR AP ----------------
  const cApCorr = document.getElementById("chart-busy-aps-correlation");
  if (cApCorr) {
    const rawAps = (data.ap_summary || []).filter((a) => a.ap_name && a.ap_name !== "Sin AP");
    const sortApKey = (a) =>
      activeSpec
        ? a[activeSpec.field] || 0
        : (a.avg_auth_ms || 0) + (a.avg_dhcp_ms || 0) + (a.avg_roam_ms || 0);
    const maxAps = isTwoDay ? (isSingleFloorSelected ? 10 : 7) : isSingleFloorSelected ? 12 : 8;
    const topAps = [...rawAps]
      .sort((a, b) => sortApKey(b) - sortApKey(a) || (b.unique_users || 0) - (a.unique_users || 0))
      .slice(0, maxAps);

    let apDatasets = [];
    if (isTwoDay) {
      const d0 = compDays[0];
      const d1 = compDays[1];
      const dayApMaps = [
        new Map((d0.ap_summary || []).map((a) => [a.ap_name, a])),
        new Map((d1.ap_summary || []).map((a) => [a.ap_name, a])),
      ];
      if (isStackedTwoDay) {
        [d0, d1].forEach((d, dIdx) => {
          ["auth", "dhcp", "roam"].forEach((k) => {
            const sp = METRIC_SPECS[k];
            apDatasets.push({
              label: `${sp.short} (${d.day_label})`,
              data: topAps.map((a) => dayApMaps[dIdx].get(a.ap_name)?.[sp.field] || 0),
              backgroundColor: sp.color,
              borderColor: dIdx === 1 ? "#ffffff" : "transparent",
              borderWidth: dIdx === 1 ? 1 : 0,
              stack: d.day_label,
              yAxisID: "y",
              order: 2,
            });
          });
        });
      } else {
        const sp = activeSpec || METRIC_SPECS.auth;
        [d0, d1].forEach((d, dIdx) => {
          const vals = topAps.map((a) => dayApMaps[dIdx].get(a.ap_name)?.[sp.field] || 0);
          apDatasets.push({
            label: `Día ${dIdx + 1} (${d.day_label}) • ${sp.short}`,
            data: vals,
            backgroundColor: dIdx === 0 ? "rgba(37, 99, 235, 0.72)" : "rgba(21, 128, 61, 0.76)",
            borderColor: dIdx === 0 ? "#3b82f6" : "#22c55e",
            borderWidth: 1.4,
            borderRadius: 6,
            categoryPercentage: 0.78,
            barPercentage: 0.88,
            yAxisID: "y",
            order: 2,
            barBadgeColor: dIdx === 0 ? "#93c5fd" : "#86efac",
            barBadgeFmt: (i) => fmtMsBadge(vals[i]),
          });
        });
        if (showAlertChartTraffic) {
          [d0, d1].forEach((d, dIdx) => {
            const st = TRAFFIC_BRIGHT[dIdx];
            apDatasets.push({
              type: "line",
              isTrafficLine: true,
              label: `Tráfico Día ${dIdx + 1} (${d.day_label}) GB`,
              data: topAps.map((a) => toGb(dayApMaps[dIdx].get(a.ap_name)?.usage_mb)),
              yAxisID: "y1",
              borderColor: st.color,
              backgroundColor: st.color,
              borderWidth: 2.8,
              pointStyle: st.pt,
              pointBackgroundColor: st.color,
              pointBorderColor: "#ffffff",
              pointBorderWidth: 1.8,
              pointRadius: st.radius,
              pointHoverRadius: st.hoverRadius,
              pointHitRadius: 12,
              tension: 0.25,
              order: 0,
            });
          });
        }
      }
    } else {
      if (showAlertChartTraffic) {
        apDatasets.push({
          type: "line",
          isTrafficLine: true,
          label: "Tráfico Total (GB)",
          data: topAps.map((a) => toGb(a.usage_mb)),
          borderColor: "#facc15",
          backgroundColor: "#facc15",
          pointBackgroundColor: "#0f172a",
          pointBorderColor: "#facc15",
          pointBorderWidth: 2.2,
          pointStyle: "rect",
          borderWidth: 3.2,
          borderDash: [2, 8],
          borderCapStyle: "round",
          pointRadius: 5,
          pointHitRadius: 12,
          tension: 0,
          yAxisID: "y1",
          order: 0,
        });
      }
      if (activeSpec) {
        const vals = topAps.map((a) => a[activeSpec.field] || 0);
        apDatasets.push({
          label: activeSpec.label,
          data: vals,
          backgroundColor: "rgba(56, 189, 248, 0.30)",
          borderColor: "rgba(56, 189, 248, 0.80)",
          borderWidth: 1.1,
          borderRadius: 5,
          yAxisID: "y",
          order: 2,
          barBadgeColor: "#7dd3fc",
          barBadgeFmt: (i) => fmtMsBadge(vals[i]),
        });
      } else {
        ["auth", "dhcp", "roam"].forEach((k) => {
          const sp = METRIC_SPECS[k];
          apDatasets.push({
            label: sp.label,
            data: topAps.map((a) => a[sp.field] || 0),
            backgroundColor: sp.color,
            borderColor: sp.border,
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          });
        });
      }
    }

    const apXLabels = topAps.map((a) => (isSingleFloorSelected ? a.ap_name : [a.ap_name, a.floor || "--"]));
    const showApTrafficAxis = !isStackedTwoDay && showAlertChartTraffic;

    charts.busyApsCorrelation = new Chart(cApCorr, {
      type: "bar",
      plugins: isStackedTwoDay ? [] : [avgTimesBarPlugin],
      data: {
        labels: apXLabels,
        datasets: apDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: true },
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const apObj = topAps[elements[0].index];
            if (apObj?.ap_name) quickFilterByAp(apObj.ap_name);
          }
        },
        plugins: {
          legend: buildComboLegendOptions(9.5),
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items?.length) return "";
                const a = topAps[items[0].dataIndex];
                return a ? `${a.ap_name} (${a.floor})` : "";
              },
              label: (ctx) => {
                const ds = ctx.dataset || {};
                const v = ctx.parsed.y;
                return ds.isTrafficLine ? ` ${ds.label}: ${v} GB` : ` ${ds.label}: ${v} ms`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: isStackedTwoDay,
            ticks: { color: "#e2e8f0", font: { size: 8.5, weight: "600" }, maxRotation: 0, minRotation: 0, autoSkip: false },
          },
          y: {
            stacked: isStackedTwoDay,
            position: "left",
            beginAtZero: true,
            grace: "16%",
            title: {
              display: true,
              text: "Tiempo Promedio (ms)",
              color: activeSpec || isTwoDay ? "#38bdf8" : "#fbbf24",
              font: { size: 10, weight: "bold" },
            },
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          ...(showApTrafficAxis
            ? {
                y1: {
                  position: "right",
                  beginAtZero: true,
                  grace: "18%",
                  title: {
                    display: true,
                    text: isTwoDay ? "Tráfico (GB)" : "Tráfico (GB) •••",
                    color: isTwoDay ? "#00e5ff" : "#facc15",
                    font: { size: 10, weight: "bold" },
                  },
                  ticks: {
                    color: isTwoDay ? "#cbd5e1" : "#fde047",
                    font: { size: 9 },
                    callback: (v) => `${v}G`,
                  },
                  grid: { drawOnChartArea: false },
                },
              }
            : {}),
        },
      },
    });
  }
}

function renderDailyComparisonSection(data) {
  const dc = data.daily_comparison || {};
  const days = dc.days || [];
  const tot = dc.total_summary || {
    day_label: "TOTAL ACUMULADO",
    total_clients: data.unfiltered_total || 0,
    healthy_clients: 0,
    issue_clients: 0,
    failure_rate_pct: 0,
    avg_retries: 0,
    high_retry_clients: 0,
    avg_auth_ms: 0,
    avg_onboarding_ms: 0,
    multi_alarm_clients: 0,
    usage_mb: 0,
    usage_fmt: "0 B",
    tx_fmt: "0 B",
    rx_fmt: "0 B",
    worst_floor: "--",
    worst_ap: "--",
  };
  const deltas = dc.deltas || null;
  const activeDay = data.active_day_filter || document.getElementById("filter-day-label")?.value || "ALL";
  if (activeDay !== "ALL" && !activeDay.includes(",")) {
    lastSelectedSingleDay = activeDay;
  }
  const activeDaySet =
    activeDay === "ALL"
      ? new Set(days.map((d) => d.day_label))
      : new Set(
          activeDay
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        );

  // 0. Sincronizar el Select desplegable #filter-day-label con Total + cada Día cargado
  const daySel = document.getElementById("filter-day-label");
  if (daySel) {
    daySel.innerHTML = `<option value="ALL">📊 TOTAL ACUMULADO (${tot.total_clients} ses. en ${days.length} día${days.length === 1 ? "" : "s"})</option>`;
    days.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.day_label;
      opt.textContent = `📅 ${d.day_label} (${d.total_clients} ses. • ${d.failure_rate_pct}% fallo)`;
      daySel.appendChild(opt);
    });
    if (activeDay !== "ALL" && ![...daySel.options].some((o) => o.value === activeDay)) {
      const multiOpt = document.createElement("option");
      multiOpt.value = activeDay;
      multiOpt.textContent = `📅 Días seleccionados: ${activeDay}`;
      daySel.appendChild(multiOpt);
    }
    if ([...daySel.options].some((o) => o.value === activeDay)) {
      daySel.value = activeDay;
    } else {
      daySel.value = "ALL";
    }
  }

  // Indicador de modo activo (Día específico vs Total Acumulado)
  const modeInd = document.getElementById("active-day-mode-indicator");
  if (modeInd) {
    if (activeDay === "ALL") {
      modeInd.className = "hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
      modeInd.innerHTML = `<i class="fa-solid fa-layer-group"></i><span>TOTAL (${days.length}d)</span>`;
    } else {
      modeInd.className = "inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/50";
      modeInd.innerHTML = `<i class="fa-solid fa-calendar-day"></i><span>Día(s): ${activeDay}</span>
        <button type="button" onclick="filterByDayLabel('ALL')" class="px-1.5 py-0.2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold">Total</button>`;
    }
  }

  // 1. Selector de Modo Exclusivo (1 solo botón iluminado + controles únicamente del modo activo)
  const totalLoadedDays = days.length;
  const [selDayA, selDayB] = ensureValidComparePair(data);
  const activeCompDays = getComparisonDays(data);
  const isComparingDays = activeCompDays.length === 2;
  const isSingleDayMode = !isComparingDays && activeDay !== "ALL" && !activeDay.includes(",");
  const isTotalMode = !isComparingDays && !isSingleDayMode;

  const idleTabCls =
    "bg-transparent hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border-transparent font-medium";

  const tabTotalBtn = `<button type="button" onclick="filterByDayLabel('ALL')" class="px-2.5 py-1 rounded-lg text-[11px] border transition flex items-center gap-1.5 ${
    isTotalMode
      ? "bg-emerald-600 text-white border-emerald-300 shadow-md ring-2 ring-emerald-400/50 font-extrabold"
      : idleTabCls
  }" title="Ver la suma acumulada de los ${totalLoadedDays} días cargados">
    <i class="${isTotalMode ? "fa-solid fa-circle-check text-white" : "fa-regular fa-circle opacity-60"} text-[10px]"></i>
    <span>Acumulado Total</span>
  </button>`;

  const tabSingleBtn =
    totalLoadedDays >= 1
      ? `<button type="button" onclick="activateSingleDayMode()" class="px-2.5 py-1 rounded-lg text-[11px] border transition flex items-center gap-1.5 ${
          isSingleDayMode
            ? "bg-amber-500 text-slate-950 border-amber-200 shadow-md ring-2 ring-amber-300/60 font-extrabold"
            : idleTabCls
        }" title="Filtrar todo el tablero para analizar 1 día específico">
          <i class="${isSingleDayMode ? "fa-solid fa-circle-check text-slate-950" : "fa-regular fa-circle opacity-60"} text-[10px]"></i>
          <span>1 Día Específico</span>
        </button>`
      : "";

  const tabCompareBtn =
    totalLoadedDays >= 2
      ? `<button type="button" onclick="activateTwoDayComparison()" class="px-2.5 py-1 rounded-lg text-[11px] border transition flex items-center gap-1.5 ${
          isComparingDays
            ? "bg-sky-500 text-slate-950 border-sky-200 shadow-md ring-2 ring-sky-300/60 font-extrabold"
            : idleTabCls
        }" title="Comparar mitad izquierda (Día 1 Azul) vs mitad derecha (Día 2 Verde)">
          <i class="${isComparingDays ? "fa-solid fa-circle-check text-slate-950" : "fa-regular fa-circle opacity-60"} text-[10px]"></i>
          <span>Comparar 2 Días</span>
        </button>`
      : "";

  let activeModeContextHtml = "";
  if (isTotalMode) {
    activeModeContextHtml = `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/75 border border-emerald-500/45 text-[11px] text-emerald-200 font-bold">
      <i class="fa-solid fa-layer-group text-emerald-400 text-[10px]"></i>
      <span>Viendo Total: <strong>${tot.total_clients}</strong> sesiones (${totalLoadedDays} día${totalLoadedDays === 1 ? "" : "s"} sumados)</span>
    </div>`;
  } else if (isSingleDayMode) {
    activeModeContextHtml = `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/80 border-2 border-amber-400/80 shadow text-[11px]">
      <span class="font-bold text-amber-300"><i class="fa-solid fa-calendar-day mr-1"></i>Viendo Día:</span>
      <select onchange="if(this.value) filterByDayLabel(this.value)" class="bg-slate-900 px-2 py-0.5 rounded border border-amber-400/60 text-[11px] font-extrabold text-white focus:outline-none cursor-pointer">
        ${days
          .map(
            (d) =>
              `<option value="${d.day_label.replace(/"/g, "&quot;")}" class="bg-slate-900 text-white" ${
                activeDay === d.day_label ? "selected" : ""
              }>${d.day_label} (${d.total_clients} ses.)</option>`
          )
          .join("")}
      </select>
    </div>`;
  } else if (isComparingDays) {
    activeModeContextHtml = `<div class="inline-flex flex-wrap items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950/95 border-2 border-sky-400/75 shadow">
      <span class="text-[10px] font-extrabold uppercase text-sky-300 px-1"><i class="fa-solid fa-scale-balanced mr-1"></i>Comparando:</span>
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/90 border border-blue-400/70" title="Día 1 (Mitad Izquierda / Azul)">
        <span class="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block"></span>
        <span class="text-[10px] font-bold text-sky-300">Izq • Día 1:</span>
        <select onchange="onSelectCompareDay('A', this.value)" class="bg-transparent text-[11px] font-extrabold text-white focus:outline-none cursor-pointer">
          ${days
            .map(
              (d) =>
                `<option value="${d.day_label.replace(/"/g, "&quot;")}" class="bg-slate-900 text-sky-200" ${
                  d.day_label === selDayA ? "selected" : ""
                }>${d.day_label}</option>`
            )
            .join("")}
        </select>
      </span>
      <button type="button" onclick="swapCompareDays()" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-extrabold border border-slate-600" title="Intercambiar Día 1 ⇄ Día 2">⇄</button>
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-400/70" title="Día 2 (Mitad Derecha / Verde)">
        <span class="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
        <span class="text-[10px] font-bold text-emerald-300">Der • Día 2:</span>
        <select onchange="onSelectCompareDay('B', this.value)" class="bg-transparent text-[11px] font-extrabold text-white focus:outline-none cursor-pointer">
          ${days
            .map(
              (d) =>
                `<option value="${d.day_label.replace(/"/g, "&quot;")}" class="bg-slate-900 text-emerald-200" ${
                  d.day_label === selDayB ? "selected" : ""
                }>${d.day_label}</option>`
            )
            .join("")}
        </select>
      </span>
    </div>`;
  }

  const combinedDayChipsHtml = `<div class="inline-flex flex-wrap items-center gap-2">
    <div class="inline-flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-700/90 shadow-inner">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1.5">Modo:</span>
      ${tabTotalBtn}
      ${tabSingleBtn}
      ${tabCompareBtn}
    </div>
    ${activeModeContextHtml}
  </div>`;

  const chipsEl = document.getElementById("day-filter-chips");
  if (chipsEl) chipsEl.innerHTML = combinedDayChipsHtml;

  const topChipsEl = document.getElementById("top-day-total-chips");
  if (topChipsEl) topChipsEl.innerHTML = combinedDayChipsHtml;

  document.querySelectorAll(".section-day-filter-chips").forEach((el) => {
    el.innerHTML = combinedDayChipsHtml;
  });

  // 1b. Selector sincronizado: Todo vs Dispositivo Corporativo (COL-) vs Dispositivo Externo
  const activeCorp = (data.active_corp_filter || document.getElementById("filter-corp")?.value || "ALL").toUpperCase();
  const cb = data.corp_breakdown || {
    all_clients: tot.total_clients || 0,
    all_users: tot.unique_users || 0,
    corp_clients: tot.corp_clients || 0,
    corp_users: tot.corp_users || 0,
    ext_clients: tot.ext_clients || 0,
    ext_users: tot.ext_users || 0,
  };
  const corpChipsHtml = `
    <div class="inline-flex flex-wrap items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-indigo-500/40">
      <span class="text-[10px] font-bold text-indigo-300 px-1.5"><i class="fa-solid fa-laptop-code mr-1"></i>Dispositivo:</span>
      <button type="button" onclick="filterByCorpMode('ALL')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
        activeCorp === "ALL"
          ? "bg-indigo-600 text-white border-indigo-300 shadow"
          : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
      }" title="Mostrar todos los dispositivos (Corporativos COL- y Externos)">
        <span>🌐 Todo</span>
        <span class="text-[10px] opacity-90">(${cb.all_users}u / ${cb.all_clients}s)</span>
      </button>
      <button type="button" onclick="filterByCorpMode('CORP')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
        activeCorp === "CORP"
          ? "bg-emerald-600 text-white border-emerald-300 shadow ring-1 ring-emerald-200"
          : "bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40"
      }" title="Filtrar todas las estadísticas solo para Dispositivos Corporativos (Hostname empieza por COL-)">
        <span>🏢 Corporativo (COL-)</span>
        <span class="text-[10px] opacity-90">(${cb.corp_users}u / ${cb.corp_clients}s)</span>
      </button>
      <button type="button" onclick="filterByCorpMode('EXT')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
        activeCorp === "EXT"
          ? "bg-amber-500 text-slate-950 border-amber-200 shadow font-extrabold ring-1 ring-amber-200"
          : "bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-500/40"
      }" title="Filtrar todas las estadísticas solo para Dispositivos Externos / Personales (Hostname NO empieza por COL-)">
        <span>📱 Externo</span>
        <span class="text-[10px] opacity-90">(${cb.ext_users}u / ${cb.ext_clients}s)</span>
      </button>
    </div>
  `;
  document.querySelectorAll(".corp-filter-chips").forEach((el) => {
    el.innerHTML = corpChipsHtml;
  });

  document.querySelectorAll(".day-compare-mode-toggle").forEach((el) => {
    el.innerHTML = "";
  });

  // En Sección 1 (Resumen por Día vs. Total Acumulado) siempre mostrar todos los días cargados
  const chartDays = days;
  const effectiveDeltas = deltas;

  // 2. Banner de Variación / Mejora entre los 2 Días comparados (o Primero vs Último) + Indicador de Piso / AP activo
  const activeFloor = document.getElementById("filter-client-floor")?.value || "ALL";
  const activeAp = document.getElementById("filter-ap")?.value || "ALL";
  const scopeBadgeHtml =
    activeFloor !== "ALL" || activeAp !== "ALL"
      ? `<span class="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 font-bold text-xs flex items-center gap-2">
          <i class="fa-solid fa-building text-amber-300"></i>
          <span>Mostrando solo: ${activeFloor !== "ALL" ? activeFloor : ""}${activeAp !== "ALL" ? ` (${activeAp})` : ""}</span>
          <button type="button" onclick="resetToGeneralView()" class="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[10px] ml-1">Ver Todos los Pisos</button>
        </span>`
      : "";

  const deltaEl = document.getElementById("daily-delta-banner");
  if (deltaEl) {
    if (effectiveDeltas) {
      const failImproved = effectiveDeltas.delta_failure_pct <= 0;
      const retImproved = effectiveDeltas.delta_retries <= 0;
      deltaEl.innerHTML = `<div class="flex flex-wrap items-center gap-2">
        ${scopeBadgeHtml}
        <div class="px-3 py-1.5 rounded-xl bg-slate-900/90 border ${
          failImproved ? "border-emerald-500/50 text-emerald-300" : "border-rose-500/50 text-rose-300"
        } flex flex-wrap items-center gap-3">
          <span class="font-bold"><i class="fa-solid fa-code-compare mr-1"></i>${effectiveDeltas.first_day} → ${effectiveDeltas.last_day}:</span>
          <span>% Fallo: <strong>${effectiveDeltas.delta_failure_pct > 0 ? "+" : ""}${effectiveDeltas.delta_failure_pct}%</strong></span>
          <span>Retries Prom: <strong class="${retImproved ? "text-emerald-300" : "text-rose-300"}">${effectiveDeltas.delta_retries > 0 ? "+" : ""}${effectiveDeltas.delta_retries}%</strong></span>
          <span>Auth 802.1X: <strong>${effectiveDeltas.delta_auth_ms > 0 ? "+" : ""}${effectiveDeltas.delta_auth_ms} ms</strong></span>
        </div>
      </div>`;
    } else {
      deltaEl.innerHTML = `<div class="flex flex-wrap items-center gap-2">
        ${scopeBadgeHtml}
        <span class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-400 text-[11px]">
          <i class="fa-solid fa-circle-info text-teal-400 mr-1"></i>Sube 2 o más archivos CSV de distintos días con <strong>+ Agregar / Acumular CSV(s)</strong> para ver la variación automática día contra día.
        </span>
      </div>`;
    }
  }

  // 3. Gráfica 1: Clientes Sanos vs Desglose Multicolor de Tipos de Fallos por Día + % Tasa de Fallo
  const c1 = document.getElementById("chart-daily-failures");
  if (c1) {
    destroyChart("dailyFailures");
    const dayFallbackCounts = {};
    (data.clients || currentData?.clients || []).forEach((c) => {
      const dl = c.day_label || "Sin Día";
      if (!dayFallbackCounts[dl]) {
        dayFallbackCounts[dl] = { retries: 0, auth: 0, auth_supp: 0, assoc: 0, dhcp: 0, roam: 0, lat: 0, rf: 0 };
      }
      const cats = c.issue_categories || [];
      if (cats.includes("Retransmisiones Altas (>=25%)")) dayFallbackCounts[dl].retries++;
      if (cats.includes("Auth 802.1X: Red / ISE (>=6s)")) dayFallbackCounts[dl].auth++;
      if (cats.includes("Auth 802.1X: Espera Suplicante (>=6s)")) dayFallbackCounts[dl].auth_supp++;
      if (cats.includes("Asociación Lenta (>2s)")) dayFallbackCounts[dl].assoc++;
      if (cats.includes("DHCP Lento (>2s)")) dayFallbackCounts[dl].dhcp++;
      if (cats.includes("Roaming Lento (>3s)")) dayFallbackCounts[dl].roam++;
      if (cats.includes("Latencia QoS Alta (Voz/Datos)")) dayFallbackCounts[dl].lat++;
      if (cats.includes("Señal RF Débil / Sticky")) dayFallbackCounts[dl].rf++;
    });

    const pctOfDay = (d, count) => (d.total_clients ? Math.round(((count || 0) / d.total_clients) * 1000) / 10 : 0);

    charts.dailyFailures = new Chart(c1, {
      type: "bar",
      data: {
        labels: chartDays.map((d) => d.day_label),
        datasets: [
          {
            label: "% Sanos",
            data: chartDays.map((d) => Math.round((100 - (d.failure_rate_pct || 0)) * 10) / 10),
            rawCounts: chartDays.map((d) => d.healthy_clients || 0),
            backgroundColor: "rgba(16, 185, 129, 0.85)",
            borderRadius: 4,
            stack: "healthy",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Retries (>=25%)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_retries ?? dayFallbackCounts[d.day_label]?.retries ?? d.high_retry_clients ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_retries ?? dayFallbackCounts[d.day_label]?.retries ?? d.high_retry_clients ?? 0),
            backgroundColor: "rgba(244, 63, 94, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Auth ISE/Red (>=6s)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_auth ?? dayFallbackCounts[d.day_label]?.auth ?? d.slow_auth_clients ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_auth ?? dayFallbackCounts[d.day_label]?.auth ?? d.slow_auth_clients ?? 0),
            backgroundColor: "rgba(168, 85, 247, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Espera Suplicante (>=6s)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_auth_supp ?? dayFallbackCounts[d.day_label]?.auth_supp ?? d.supplicant_auth_clients ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_auth_supp ?? dayFallbackCounts[d.day_label]?.auth_supp ?? d.supplicant_auth_clients ?? 0),
            backgroundColor: "rgba(236, 72, 153, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% DHCP (>2s)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_dhcp ?? dayFallbackCounts[d.day_label]?.dhcp ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_dhcp ?? dayFallbackCounts[d.day_label]?.dhcp ?? 0),
            backgroundColor: "rgba(234, 179, 8, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Roaming (>3s)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_roam ?? dayFallbackCounts[d.day_label]?.roam ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_roam ?? dayFallbackCounts[d.day_label]?.roam ?? 0),
            backgroundColor: "rgba(99, 102, 241, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Asoc. (>2s)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_assoc ?? dayFallbackCounts[d.day_label]?.assoc ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_assoc ?? dayFallbackCounts[d.day_label]?.assoc ?? 0),
            backgroundColor: "rgba(6, 182, 212, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Latencia QoS",
            data: chartDays.map((d) => pctOfDay(d, d.fail_latency ?? dayFallbackCounts[d.day_label]?.lat ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_latency ?? dayFallbackCounts[d.day_label]?.lat ?? 0),
            backgroundColor: "rgba(168, 85, 247, 0.9)",
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Señal (<-79dBm)",
            data: chartDays.map((d) => pctOfDay(d, d.fail_rf ?? dayFallbackCounts[d.day_label]?.rf ?? 0)),
            rawCounts: chartDays.map((d) => d.fail_rf ?? dayFallbackCounts[d.day_label]?.rf ?? 0),
            backgroundColor: "rgba(236, 72, 153, 0.9)",
            borderRadius: 4,
            stack: "issues",
            yAxisID: "y",
            order: 2,
          },
          {
            type: "line",
            label: "% Tasa de Fallo",
            data: chartDays.map((d) => d.failure_rate_pct),
            rawCounts: chartDays.map((d) => d.issue_clients || 0),
            borderColor: "#38bdf8",
            backgroundColor: "#38bdf8",
            pointBackgroundColor: "#38bdf8",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 1.5,
            borderWidth: 2.5,
            pointRadius: 5,
            yAxisID: "y",
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const dObj = chartDays[elements[0].index];
            if (dObj) filterByDayLabel(dObj.day_label);
          }
        },
        plugins: {
          legend: { labels: { color: "#cbd5e1", font: { size: 9 }, boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = ctx.dataset.rawCounts?.[ctx.dataIndex];
                const dTot = chartDays[ctx.dataIndex]?.total_clients || 0;
                return raw !== undefined
                  ? `${ctx.dataset.label}: ${ctx.parsed.y}% (${raw} de ${dTot} ses.)`
                  : `${ctx.dataset.label}: ${ctx.parsed.y}%`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: "#e2e8f0", font: { size: 10 } } },
          y: { stacked: true, position: "left", min: 0, max: 100, ticks: { color: "#10b981", callback: (v) => `${v}%` }, grid: { color: "#1e293b" } },
        },
      },
    });
  }

  // Badges superiores con % de Salud Total comparado con la cantidad de Usuarios y Sesiones
  const totHealthPct = Math.round((100 - (tot.failure_rate_pct || 0)) * 10) / 10;
  const totRfHealthPct = Math.round((100 - (tot.high_retry_pct || 0)) * 10) / 10;
  const totUsersCount = tot.unique_users || tot.total_clients || 0;
  const healthBadgeEl = document.getElementById("badge-daily-health-total");
  if (healthBadgeEl) {
    healthBadgeEl.innerHTML = `Salud Total: <strong>${totHealthPct}%</strong> (${tot.healthy_clients || 0}/${tot.total_clients || 0} ses. • ${totUsersCount} usu.)`;
  }
  const retriesBadgeEl = document.getElementById("badge-daily-retries-health-total");
  if (retriesBadgeEl) {
    retriesBadgeEl.innerHTML = `Total Retries >=25%: <strong>${tot.high_retry_pct || 0}%</strong> (${tot.high_retry_clients || 0} de ${tot.total_clients || 0} ses. • ${totUsersCount} usu.)`;
  }

  // 4. Gráfica 2: Barra de Usuarios + % Fallas Retries (>=25% respecto al total) + Retries Prom (%) + Tráfico Total (GB)
  const c2 = document.getElementById("chart-daily-retries");
  if (c2) {
    destroyChart("dailyRetries");
    const maxRetPct = Math.max(
      ...chartDays.map((d) => Math.max(d.high_retry_pct || 0, d.avg_retries || 0)),
      10
    );
    const y1Max = Math.min(100, Math.max(20, Math.ceil(maxRetPct * 1.85)));

    charts.dailyRetries = new Chart(c2, {
      type: "bar",
      data: {
        labels: chartDays.map((d) => d.day_label),
        datasets: [
          {
            label: "Usuarios del Día",
            data: chartDays.map((d) => d.unique_users || d.total_clients),
            backgroundColor: "rgba(14, 165, 233, 0.78)",
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            label: "% Fallas Retries (>=25%)",
            data: chartDays.map((d) => d.high_retry_pct || 0),
            rawRetryCounts: chartDays.map((d) => d.high_retry_clients || 0),
            backgroundColor: "rgba(244, 63, 94, 0.85)",
            borderColor: "#f43f5e",
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: "y1",
            order: 2,
          },
          {
            type: "line",
            label: "Retries Promedio (%)",
            data: chartDays.map((d) => d.avg_retries),
            borderColor: "#38bdf8",
            backgroundColor: "#38bdf8",
            pointBackgroundColor: "#38bdf8",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            borderWidth: 3,
            pointRadius: 5,
            yAxisID: "y1",
            order: 0,
          },
          {
            type: "line",
            label: "Tráfico Total (GB)",
            data: chartDays.map((d) => Math.round(((d.usage_mb || 0) / 1024) * 100) / 100),
            borderColor: "#f59e0b",
            backgroundColor: "#f59e0b",
            pointBackgroundColor: "#f59e0b",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            borderWidth: 2.5,
            pointRadius: 5,
            yAxisID: "y2",
            order: 0,
          },
        ],
      },
      plugins: [
        {
          id: "dailyRetriesBarLabels",
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = "bold 10px Inter, sans-serif";
            ctx.textAlign = "center";
            // Etiqueta sobre Barra Azul (Usuarios)
            const metaUsers = chart.getDatasetMeta(0);
            metaUsers.data.forEach((bar, i) => {
              const val = chart.data.datasets[0].data[i];
              if (val > 0) {
                ctx.fillStyle = "#7dd3fc";
                ctx.fillText(`${val} usu.`, bar.x, Math.max(12, bar.y - 5));
              }
            });
            // Etiqueta sobre Barra Roja (% Fallas Retries >=25%)
            const metaRet = chart.getDatasetMeta(1);
            metaRet.data.forEach((bar, i) => {
              const pctVal = chart.data.datasets[1].data[i];
              const cntVal = chart.data.datasets[1].rawRetryCounts?.[i] ?? "";
              if (pctVal > 0) {
                ctx.fillStyle = "#fda4af";
                ctx.fillText(`${pctVal}% (${cntVal})`, bar.x, Math.max(12, bar.y - 5));
              }
            });
            ctx.restore();
          },
        },
      ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const dObj = chartDays[elements[0].index];
            if (dObj) filterByDayLabel(dObj.day_label);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 9 }, boxWidth: 10 } } },
        scales: {
          x: { ticks: { color: "#e2e8f0", font: { size: 10 } } },
          y: { position: "left", grace: "15%", ticks: { color: "#38bdf8" }, grid: { color: "#1e293b" } },
          y1: { position: "right", min: 0, max: y1Max, ticks: { color: "#f43f5e", callback: (v) => `${v}%` }, grid: { drawOnChartArea: false } },
          y2: { position: "right", grace: "15%", ticks: { color: "#f59e0b" }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  // 5. Gráfica 3: Auth 802.1X Promedio (ms) y Tráfico Total (MB) por Día
  const c3 = document.getElementById("chart-daily-auth-traffic");
  if (c3) {
    destroyChart("dailyAuthTraffic");
    charts.dailyAuthTraffic = new Chart(c3, {
      type: "bar",
      data: {
        labels: chartDays.map((d) => d.day_label),
        datasets: [
          {
            label: "Auth 802.1X Prom (ms)",
            data: chartDays.map((d) => d.avg_auth_ms),
            backgroundColor: "rgba(245, 158, 11, 0.8)",
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            label: "DHCP Prom (ms)",
            data: chartDays.map((d) => d.avg_dhcp_ms || 0),
            backgroundColor: "rgba(14, 165, 233, 0.8)",
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            label: "Roaming Prom (ms)",
            data: chartDays.map((d) => d.avg_roam_ms || 0),
            backgroundColor: "rgba(99, 102, 241, 0.8)",
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            type: "line",
            label: "Datos Transmitidos (MB)",
            data: chartDays.map((d) => d.usage_mb),
            borderColor: "#14b8a6",
            backgroundColor: "#14b8a6",
            pointBackgroundColor: "#14b8a6",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 1.5,
            borderWidth: 2.5,
            pointRadius: 5,
            yAxisID: "y1",
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const dObj = chartDays[elements[0].index];
            if (dObj) filterByDayLabel(dObj.day_label);
          }
        },
        plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: "#e2e8f0", font: { size: 10 } } },
          y: { position: "left", ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y1: { position: "right", ticks: { color: "#14b8a6" }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  // 6. Tabla Comparativa Día a Día + Fila de TOTAL ACUMULADO
  const tbody = document.getElementById("table-daily-comparison");
  if (tbody) {
    if (!days.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="py-4 text-center text-slate-400">Sin datos cargados para comparar por día.</td></tr>`;
    } else {
      const dayRowsHtml = days
        .map((d) => {
          const safeDay = d.day_label.replace(/'/g, "\\'");
          const isCurrent = activeDay !== "ALL" && activeDaySet.has(d.day_label);
          return `<tr class="hover:bg-slate-800/60 cursor-pointer transition ${
            isCurrent ? "bg-teal-950/40 ring-1 ring-teal-400/60" : ""
          }" onclick="filterByDayLabel('${safeDay}')" title="Clic para filtrar todo el dashboard por el día ${d.day_label}">
            <td class="py-2 px-2.5 font-bold text-teal-300">
              <i class="fa-solid fa-calendar-day mr-1"></i>${d.day_label}
              ${isCurrent ? `<span class="ml-1 px-1.5 py-0.2 rounded bg-teal-500 text-slate-950 text-[9px] font-extrabold">${activeDaySet.size === 2 ? "COMPARANDO" : "ACTIVO"}</span>` : ""}
            </td>
            <td class="py-2 px-2.5 text-[11px] text-slate-300">${(d.source_files || []).join(", ") || "--"}</td>
            <td class="py-2 px-2.5 text-center">
              <div class="font-bold text-sky-300">${d.unique_users || d.total_clients} usu. <span class="text-slate-300 font-normal">(${d.total_clients} ses.)</span></div>
              <div class="text-[10px] text-slate-400">🏢 Corp: <strong class="text-emerald-300">${d.corp_users ?? 0}u</strong> (${d.corp_clients ?? 0}s) | 📱 Ext: <strong class="text-amber-300">${d.ext_users ?? 0}u</strong> (${d.ext_clients ?? 0}s)</div>
            </td>
            <td class="py-2 px-2.5 text-center">
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                ${d.healthy_clients} (${Math.round((100 - (d.failure_rate_pct || 0)) * 10) / 10}% Salud)
              </span>
            </td>
            <td class="py-2 px-2.5 text-center">
              <span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[11px]">
                ${d.issue_clients} (${d.failure_rate_pct}%)
              </span>
            </td>
            <td class="py-2 px-2.5 text-center text-slate-200">
              <div>
                <span class="font-bold text-amber-300">${d.avg_retries}% prom</span>
                <span class="text-[10px] text-rose-300 ml-1">(${d.high_retry_clients} >=25% • ${d.high_retry_pct || 0}%)</span>
              </div>
              <div class="text-[10px] text-emerald-300 font-semibold">
                Salud RF: ${Math.round((100 - (d.high_retry_pct || 0)) * 10) / 10}% de ${d.unique_users || d.total_clients} usu.
              </div>
            </td>
            <td class="py-2 px-2.5 text-center font-mono text-[11px] text-slate-200">
              Asoc: ${d.avg_assoc_ms ?? 0}ms | Auth: <strong class="text-amber-300">${d.avg_auth_ms}ms</strong> | DHCP: ${d.avg_dhcp_ms ?? 0}ms
            </td>
            <td class="py-2 px-2.5 text-right font-mono text-sky-300">
              <div class="font-bold">${d.usage_fmt}</div>
              <div class="text-[10px] text-slate-400">Tx: ${d.tx_fmt} / Rx: ${d.rx_fmt}</div>
            </td>
            <td class="py-2 px-2.5 text-[11px]">
              <div class="text-sky-300 font-bold"><i class="fa-solid fa-tower-broadcast mr-1"></i>${d.busiest_ap || "--"} (${d.busiest_ap_users || d.busiest_ap_clients || 0} usu.)</div>
              <div class="text-emerald-300 text-[10px]">${d.busiest_floor || "--"} (${d.busiest_floor_clients || 0} ses.)</div>
            </td>
            <td class="py-2 px-2.5 text-[11px]">
              <div class="text-rose-300 font-semibold">${d.worst_floor}</div>
              <div class="text-amber-300">${d.worst_ap}</div>
            </td>
          </tr>`;
        })
        .join("");

      const isTotalActive = activeDay === "ALL";
      const totalRowHtml = `<tr class="bg-emerald-950/35 hover:bg-emerald-900/45 border-t-2 border-emerald-500/60 cursor-pointer transition" onclick="filterByDayLabel('ALL')" title="Clic para ver el TOTAL ACUMULADO de todos los días">
        <td class="py-2.5 px-2.5 font-extrabold text-emerald-300">
          <i class="fa-solid fa-layer-group mr-1"></i>TOTAL ACUMULADO (${days.length} día${days.length === 1 ? "" : "s"})
          ${isTotalActive ? `<span class="ml-1 px-1.5 py-0.2 rounded bg-emerald-400 text-slate-950 text-[9px] font-extrabold">ACTIVO</span>` : ""}
        </td>
        <td class="py-2.5 px-2.5 text-[11px] text-emerald-200 font-semibold">${(tot.source_files || []).length} archivo(s) CSV</td>
        <td class="py-2.5 px-2.5 text-center">
          <div class="font-extrabold text-sky-300 text-xs">${tot.unique_users || tot.total_clients} usu. <span class="text-white font-bold">(${tot.total_clients} ses.)</span></div>
          <div class="text-[10px] text-slate-200">🏢 Corp: <strong class="text-emerald-300">${tot.corp_users ?? 0}u</strong> (${tot.corp_clients ?? 0}s) | 📱 Ext: <strong class="text-amber-300">${tot.ext_users ?? 0}u</strong> (${tot.ext_clients ?? 0}s)</div>
        </td>
        <td class="py-2.5 px-2.5 text-center">
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400/50 font-extrabold text-[11px]">
            ${tot.healthy_clients} (${totHealthPct}% Salud)
          </span>
        </td>
        <td class="py-2.5 px-2.5 text-center">
          <span class="px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/50 font-extrabold text-[11px]">
            ${tot.issue_clients} (${tot.failure_rate_pct}%)
          </span>
        </td>
        <td class="py-2.5 px-2.5 text-center text-slate-100">
          <div>
            <span class="font-extrabold text-amber-300">${tot.avg_retries}% prom</span>
            <span class="text-[10px] text-rose-300 ml-1">(${tot.high_retry_clients} >=25% • ${tot.high_retry_pct || 0}%)</span>
          </div>
          <div class="text-[10px] text-emerald-300 font-extrabold">
            Salud RF: ${totRfHealthPct}% (${totUsersCount} usu.)
          </div>
        </td>
        <td class="py-2.5 px-2.5 text-center font-mono text-[11px] text-slate-100">
          Asoc: ${tot.avg_assoc_ms ?? 0}ms | Auth: <strong class="text-amber-300">${tot.avg_auth_ms}ms</strong> | DHCP: ${tot.avg_dhcp_ms ?? 0}ms
        </td>
        <td class="py-2.5 px-2.5 text-right font-mono text-emerald-300">
          <div class="font-extrabold">${tot.usage_fmt}</div>
          <div class="text-[10px] text-slate-300">Tx: ${tot.tx_fmt} / Rx: ${tot.rx_fmt}</div>
        </td>
        <td class="py-2.5 px-2.5 text-[11px]">
          <div class="text-sky-300 font-bold"><i class="fa-solid fa-tower-broadcast mr-1"></i>${tot.busiest_ap || "--"} (${tot.busiest_ap_users || tot.busiest_ap_clients || 0} usu.)</div>
          <div class="text-emerald-300 text-[10px]">${tot.busiest_floor || "--"} (${tot.busiest_floor_clients || 0} ses.)</div>
        </td>
        <td class="py-2.5 px-2.5 text-[11px]">
          <div class="text-rose-300 font-bold">${tot.worst_floor}</div>
          <div class="text-amber-300 font-semibold">${tot.worst_ap}</div>
        </td>
      </tr>`;

      tbody.innerHTML = dayRowsHtml + totalRowHtml;
    }
  }
}
