# 📡 Cisco Wireless Client & AP Analyzer (Dual Edition: Servidor Local + HTML Portable)

Plataforma analítica interactiva para el diagnóstico avanzado de sesiones inalámbricas exportadas desde **Cisco Catalyst Center (DNA Center)** (reportes de **57 columnas** de *Assurance → Clients*).

Este repositorio incluye y mantiene en **paridad funcional 1:1** **dos ediciones complementarias** para adaptarse tanto a estaciones de ingeniería como a cualquier equipo sin herramientas instaladas:

1. 🖥️ **Versión 1 — Servidor Local Python (`http://localhost:8060`):** Backend multihilo ligero en Python estándar (cero dependencias `pip`) con persistencia automática en disco local.
2. 📦 **Versión 2 — Edición Portable en 1 Solo Archivo (`Cisco_WiFi_Analyzer_Portable.html`):** Aplicación autónoma **100% Offline y Online** que se abre con doble clic en cualquier navegador (Edge, Chrome, Firefox) sin instalar Python ni requerir conexión a internet.

---

## 📊 Comparativa Rápida entre Ambas Versiones

| Característica | 🖥️ Versión 1: Servidor Local (`localhost:8060`) | 📦 Versión 2: HTML Portable (`Cisco_WiFi_Analyzer_Portable.html`) |
| :--- | :--- | :--- |
| **Requisitos en el PC** | Python 3.8+ (solo librería estándar, **sin `pip install`**) | **Ninguno** — Solo un navegador moderno (Edge / Chrome / Firefox) |
| **Conexión a Internet** | Requiere internet inicial para CDNs visuales (Tailwind / Chart.js / FontAwesome) | **No requiere internet (100% Offline u Online)** — Librerías e íconos embebidos en Base64 |
| **Cómo se ejecuta** | Doble clic en `iniciar_analizador_ap.bat` o `python app.py` | **Doble clic directo** sobre `Cisco_WiFi_Analyzer_Portable.html` (`file:///...`) |
| **Dónde procesa los datos** | En el proceso local de Python (`csv_analyzer.py` + `app.py`) | En memoria del navegador vía motor JS integrado (`portable_engine.js`) |
| **Dónde guarda los CSV cargados** | En disco dentro de `.loaded_files_cache.json` | En la base de datos local del navegador de cada PC (`IndexedDB`) |
| **Estado inicial al abrir** | Vacío (o restaura tu última sesión guardada en caché local) | **Limpio (0 CSVs / 0 sesiones)** listo para cargar archivos en cualquier PC |
| **Privacidad de los datos** | 100% local en tu máquina (`127.0.0.1`) | 100% local en el navegador del PC (nada se envía a servidores externos) |
| **Ideal para...** | Uso diario continuo con datasets masivos acumulados en tu equipo principal | Compartir por Teams, correo o USB a otros ingenieros, sedes o PCs restringidos |

---

## 🚀 CASO 1: Uso de la Edición Portable (`Cisco_WiFi_Analyzer_Portable.html`)

Diseñada para ejecutarse en **cualquier computador** (incluso en redes aisladas sin salida a internet y sin permisos de administrador).

### 1. Ejecución inmediata
1. Copia únicamente el archivo **`Cisco_WiFi_Analyzer_Portable.html`** (`~2.39 MB`) a cualquier carpeta, memoria USB, recurso compartido o envíalo por Teams/correo.
2. Haz **doble clic** sobre `Cisco_WiFi_Analyzer_Portable.html` para abrirlo en Microsoft Edge, Google Chrome o Mozilla Firefox.
3. La interfaz abrirá en limpio (**`0 / 0 sesiones`**) mostrando la insignia **`PORTABLE OFFLINE/ONLINE`** en la barra superior.

### 2. Carga, acumulación y persistencia de archivos CSV
- **`+ Subir / Acumular CSV`:** Selecciona uno o varios CSV exportados de Cisco Catalyst Center. Se abrirá un **calendario interactivo** (que detecta automáticamente la fecha del CSV) para etiquetar el día correspondiente (ej. `2026-10-27`) y acumularlo para comparativas multi-día.
- **`Reemplazar`:** Sustituye todos los archivos actuales por una nueva selección de CSVs.
- **`Borrar CSVs`:** Limpia por completo las sesiones almacenadas en ese navegador.
- **Memoria persistente por PC (`IndexedDB`):** Todos los CSVs que subas quedan guardados automáticamente en la base `IndexedDB` local del navegador (`CiscoWiFiAnalyzerPortableDB_v1`). Si cierras la pestaña o reinicias el PC y vuelves a abrir el archivo HTML, tus reportes seguirán ahí.

### 3. ¿Cómo regenerar el archivo Portable si modificas el código?
Si realizas mejoras en `templates/index.html`, `static/app.js` o `portable_engine.js`, puedes reconstruir el HTML autónomo ejecutando:

```powershell
cd cisco-ap-analyzer
python build_portable_html.py
```

- **Por defecto (Recomendado):** Genera `Cisco_WiFi_Analyzer_Portable.html` **sin datos precargados (`0 CSVs`)**, limpio y seguro para compartir o versionar.
- **Opcional con datos embebidos:** Si deseas generar una copia especial que ya incluya comprimidos (`GZIP + Base64`) los CSV que tengas cargados en tu caché local para entregar un reporte pre-poblado:
  ```powershell
  python build_portable_html.py --with-seed
  ```
  *(Nota: No subas a repositorios públicos un HTML generado con `--with-seed` si contiene datos corporativos reales).*

---

## 🖥️ CASO 2: Uso de la Edición Servidor Local Python (`localhost:8060`)

Diseñada para trabajo continuo de ingeniería sobre `http://localhost:8060` usando Python nativo sin necesidad de entornos virtuales complejos ni paquetes externos.

### 1. Requisitos previos
- **Python 3.8 o superior** instalado en Windows, Linux o macOS.
- **Cero dependencias externas:** Utiliza exclusivamente módulos nativos de Python (`http.server`, `csv`, `json`, `gzip`, `re`, `urllib.parse`). No necesitas ejecutar `pip install`.

### 2. Cómo iniciar el servidor
#### Opción A — Inicio rápido en Windows (1 clic)
Haz doble clic sobre el archivo **`iniciar_analizador_ap.bat`**. Este script inicia el servidor y abre automáticamente tu navegador en `http://localhost:8060`.

#### Opción B — Desde terminal (PowerShell / CMD / Bash)
```powershell
cd cisco-ap-analyzer
python app.py
```
Verás en consola:
```text
Servidor Analizador Cisco AP + Clientes iniciado en http://localhost:8060
```
Abre **`http://localhost:8060`** en tu navegador.

### 3. Persistencia y caché en servidor local
- Cada vez que subes, acumulas, renombras un día o eliminas un CSV desde la interfaz web, `app.py` guarda automáticamente el estado procesado en **`.loaded_files_cache.json`**.
- Al reiniciar `python app.py`, el servidor restaura instantáneamente todos tus días acumulados en memoria sin tener que volver a subir los CSVs.
- Endpoints internos expuestos localmente:
  - `GET /` → Interfaz principal (`templates/index.html`)
  - `GET /api/data` → Motor de consultas, filtros combinados, KPIs y desgloses multi-día (con compresión `gzip` automática)
  - `POST /api/upload` → Carga/acumulación (`append`) o reemplazo (`replace`) de múltiples CSVs con asignación de fecha
  - `POST /api/remove-csv` → Eliminación individual, vaciado total (`clear_all`) o cambio de etiqueta de día (`rename_day`)

---

## 📥 Formato del CSV Requerido (Cisco Catalyst Center)

Ambas ediciones leen directamente el archivo CSV estándar exportado desde **Cisco Catalyst Center (antes DNA Center)**:
1. Ingresa a **Cisco Catalyst Center → Assurance → Health → Client** (o vista de tabla de clientes).
2. Exporta la tabla en formato **CSV** (contiene hasta **57 columnas**, incluyendo `Host Name`, `User ID`, `MAC Address`, `IPv4 Address`, `Device Type`, `OS Type`, `Connected Network Device Name`, `Location`, `Health`, `RSSI (dBm)`, `SNR (dB)`, `Link Speed (Mbps)`, `Retries (%)`, `Usage (MB)`, `Tx (MB)`, `Rx (MB)`, `Onboarding Time (ms)`, `Association Time (ms)`, `Authentication Time (ms)`, `DHCP Time (ms)`, `Roaming Time (ms)`, `Voice Latency (ms)`, `Best Effort Latency (ms)`, `Connection Status`, `Last Seen`, entre otras).
3. Sube uno o múltiples archivos diarios con el botón **`+ Subir / Acumular CSV`**.

---

## 🧠 Motor de Diagnóstico Inteligente y Depuración de Falsos Positivos

Tanto el motor Python (`csv_analyzer.py`) como el motor Portable JS (`portable_engine.js`) aplican exactamente las mismas reglas de ingeniería RF/802.1X para separar **fallas reales de infraestructura** frente a comportamientos normales de ahorro de energía o del dispositivo cliente:

### 1. Separación Inteligente de Autenticación 802.1X (`>= 6,000 ms`)
Cuando un cliente registra `Authentication Time >= 6s`, el motor evalúa el contexto temporal y de radiofrecuencia para clasificarlo en dos categorías independientes:
- 🔴 **`Auth 802.1X: Red / ISE (>=6s)`:** Demora atribuible a red, WLC o servidor RADIUS/ISE cuando se cumple al menos una evidencia objetiva:
  - **Ráfaga ISE/RADIUS:** 3 o más clientes demorándose simultáneamente en la misma ventana de 5 minutos.
  - **Clúster por AP:** 2 o más clientes con demora de autenticación en el mismo Access Point.
  - **Degradación de Onboarding Health:** puntaje `< 7/10` en Catalyst Center.
  - **Degradación RF durante el intercambio EAP:** `RSSI < -72 dBm` o `SNR < 20 dB`.
- 🟣 **`Auth 802.1X: Espera Suplicante (>=6s)`:** Casos aislados con señal RF sana (`RSSI >= -72 dBm`) y sin congestión en ISE ni en el AP, causados por espera de credenciales de Windows/AD, desbloqueo de pantalla, PIN/Hello o reanudación desde suspensión del equipo cliente.

### 2. Depuración Automática de Falsos Positivos (Reversible en UI)
La casilla superior **"Descartar falsos positivos..."** viene activa por defecto (y puede desmarcarse en vivo en cualquier momento para auditar los datos crudos):
- **Latencia QoS por Power-Save (WMM U-APSD):** Descarta picos aparentes de latencia (`> 80 ms` Voz / `> 100 ms` Datos) en clientes que están en reposo/ahorro de energía con radiofrecuencia sana (`RSSI >= -67 dBm`, `SNR >= 25 dB` y `Retries < 20%`).
- **Retransmisiones L2 Artificiales (`>= 25%`):** Excluye clientes `DISCONNECTED`, duplicados exactos de snapshot, sesiones residuales con micro-tráfico (`< 256 KB` donde unas pocas tramas de gestión inflan el porcentaje) y smartphones en doze/sleep con `RSSI >= -55 dBm` y `Data Rate >= 130 Mbps`.
- **Onboarding / Auth / DHCP Históricos o Residuales:** Descarta métricas congeladas de clientes desconectados, sesiones continuas de más de 12 horas cuyo contador inicial de onboarding ya no representa el estado actual, y renovaciones aisladas de cliente sin afectación en el AP.
- **Roaming de Traslado Físico (`> 3s`):** Descarta falsos roamings lentos (`> 10s`) cuando el usuario cerró la tapa del portátil o se desplazó entre pisos/ascensor pero el AP destino completó el nuevo onboarding en `< 4s`.
- **Huella Anti-Duplicados de CSV:** Al cargar o acumular archivos, calcula una huella determinística (`MAC + Last Seen + Usage + AP`) que evita duplicar sesiones si subes por error el mismo reporte dos veces con distinto nombre.

---

## 🧭 Módulos Principales del Dashboard

1. **Sección 1 — Resumen Ejecutivo y Comparativa por Días:**
   - KPIs globales de sesiones, usuarios únicos, equipos corporativos vs externos (`COL...`), tasa de afectación y consumo total.
   - Comparativa evolutiva Día a Día o **Modo Comparación Lado a Lado (Día A vs Día B)** con deltas automáticos.
   - Ranking de APs con mayor densidad de usuarios conectados.
2. **Sección 2 — Jerarquía Interactiva de Fallas (`Alerta ➔ Piso ➔ AP ➔ Dispositivo/Cliente`):**
   - Tarjetas de categorías SLA clicables con conteo de sesiones y usuarios únicos.
   - Desglose visual por Piso, Top Access Points afectados, Fabricantes/Modelos/SO y gráficas ampliables a pantalla completa (**Spotlight + descarga PNG**).
3. **Sección 3 — Análisis de Tráfico y Consumo (`Usage / Tx / Rx`):**
   - Distribución de volumen de datos por Piso, Access Point y Top 20 sesiones consumidoras de ancho de banda.
4. **Sección 4 — Tabla General Detallada de Sesiones + Inspector de 57 Variables:**
   - Tabla general **independiente** del filtro de alerta de la Sección 2 para consultar siempre el universo completo de sesiones del día/piso/alcance activo.
   - Resumen desplegable agrupado por **Usuario Corporativo Multi-Dispositivo**.
   - Buscador instantáneo por `User ID`, `Hostname`, `MAC`, `IPv4` o `AP` y modal de inspección completa al hacer clic sobre cualquier fila.

---

## 📁 Estructura del Repositorio

```text
cisco-ap-analyzer/
├── app.py                              # Servidor HTTP local multihilo (Versión 1: localhost:8060)
├── csv_analyzer.py                     # Motor analítico Python (57 cols, KPIs, falsos positivos, Auth ISE/Suplicante)
├── ap_inventory_analyzer.py            # Analizador complementario de inventario de Access Points
├── correlator.py                       # Motor de cruce Clientes ↔ Estado de APs
├── iniciar_analizador_ap.bat           # Lanzador de 1 clic en Windows para localhost:8060
├── templates/
│   └── index.html                      # Interfaz principal del dashboard
├── static/
│   └── app.js                          # Lógica visual interactiva, gráficas Chart.js, filtros y modales
├── portable_engine.js                  # Motor analítico completo en JS + persistencia IndexedDB (paridad 1:1 con Python)
├── build_portable_html.py              # Compilador que empaqueta todo en el archivo único offline/online
├── Cisco_WiFi_Analyzer_Portable.html   # 📦 Aplicación Portable lista para usar con doble clic (0 CSVs precargados)
├── .gitignore                          # Reglas de privacidad (excluye *.csv, *.pcap y cachés locales)
└── README.md                           # Documentación técnica de ambas ediciones
```

---

## 🔒 Privacidad y Seguridad en Git / GitHub

El archivo **`.gitignore`** de este repositorio está configurado para **bloquear automáticamente** la subida de información sensible de red:
- Ignora todos los reportes **`*.csv`** y capturas **`*.pcap` / `*.pcapng`**.
- Ignora la caché de sesiones local **`.loaded_files_cache.json`**.
- El ejecutable **`Cisco_WiFi_Analyzer_Portable.html`** incluido en el repositorio se compila limpio (**0 archivos / 0 sesiones**), garantizando que no contenga identificadores de usuarios, direcciones MAC, direcciones IP ni nombres de equipos corporativos.
