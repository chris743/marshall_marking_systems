# Print & Apply — Developer Guide

## Overview

Print & Apply is an automated label printing system. Network scanners read barcodes on a production line, the system matches the scanned code to a configured label, and a printer prints the corresponding label automatically.

**Core flow:**
```
Scanner reads barcode
  → TCP data arrives at server
  → Code is parsed and matched to a Group config
  → ZPL label is generated from template + product data
  → ZPL is sent to the group's assigned printer
  → Event is logged
```

---

## Architecture

```
┌─────────────┐   TCP     ┌──────────────────────────┐   TCP    ┌─────────┐
│  Barcode     │ ───────── │  Node.js Server          │ ──────── │  Zebra/ │
│  Scanner     │  :9xxx    │  (scannerConnectionMgr)  │  :9100   │  SATO   │
└─────────────┘           │                          │          │ Printer │
                          │  server.js                │          └─────────┘
                          │    ├─ parseScannerData()  │
                          │    ├─ processScan()       │
                          │    └─ sendZPL()           │
                          │                          │
                          │  Express API (:3000)      │
                          │    ├─ /api/groups          │
                          │    ├─ /api/scanners        │
                          │    ├─ /api/scan            │
                          │    └─ /api/printers        │
                          └──────────────────────────┘
                                     │
                          ┌──────────┴──────────┐
                          │  SQL Server          │
                          │  labeling_groups     │
                          │  labeling_scanners   │
                          │  labeling_group_*    │
                          └─────────────────────┘
```

---

## Data Model

### Conceptual Hierarchy

```
Group
├── printer_id          → Which printer prints for this group
├── Scanners            → Which scanners trigger this group (many-to-many)
└── Location Codes      → What codes this group responds to
    └── Config          → Template + product + print settings per code
```

### Database Tables

**`labeling_groups`** — A named configuration group tied to one printer.

| Column      | Type             | Notes                          |
|-------------|------------------|--------------------------------|
| id          | UNIQUEIDENTIFIER | PK, DEFAULT NEWID()            |
| name        | NVARCHAR(100)    | Display name                   |
| description | NVARCHAR(500)    | Optional                       |
| printer_id  | VARCHAR(50)      | References printerStore ID     |
| enabled     | BIT              | Soft enable/disable            |
| created_at  | DATETIME2        | Auto-set                       |
| updated_at  | DATETIME2        | Auto-updated via trigger        |

**`labeling_group_scanners`** — Junction table: which scanners trigger which groups.

| Column     | Type             | Notes                                    |
|------------|------------------|------------------------------------------|
| id         | UNIQUEIDENTIFIER | PK                                       |
| group_id   | UNIQUEIDENTIFIER | FK → labeling_groups (CASCADE)           |
| scanner_id | UNIQUEIDENTIFIER | FK → labeling_scanners (CASCADE)         |
|            |                  | UNIQUE(group_id, scanner_id)             |

**`labeling_location_codes`** — The codes scanners read (e.g., `A-01`, `DEFAULT`).

| Column      | Type             | Notes                          |
|-------------|------------------|--------------------------------|
| id          | UNIQUEIDENTIFIER | PK                             |
| code        | VARCHAR(50)      | UNIQUE, e.g. `A-01`, `DEFAULT` |
| description | NVARCHAR(200)    | Optional                       |
| enabled     | BIT              | Soft enable/disable            |

**`labeling_group_configs`** — One config per group + code combination. Defines what label to print when a code is scanned.

| Column           | Type             | Notes                                     |
|------------------|------------------|-------------------------------------------|
| id               | UNIQUEIDENTIFIER | PK                                        |
| group_id         | UNIQUEIDENTIFIER | FK → labeling_groups (CASCADE)            |
| location_code_id | UNIQUEIDENTIFIER | FK → labeling_location_codes              |
| template_id      | UNIQUEIDENTIFIER | FK → labeling_templates (SET NULL)        |
| product_id       | UNIQUEIDENTIFIER | FK → product view                         |
| copies           | INT              | Default 1                                 |
| lot_number       | VARCHAR(100)     |                                           |
| pack_date_format | VARCHAR(20)      | `YYMMDD`, `MM/DD/YY`, etc.               |
| pack_date_offset | INT              | Days offset from today                    |
| variable_values  | NVARCHAR(MAX)    | JSON object of custom template variables  |
| enabled          | BIT              |                                           |
|                  |                  | UNIQUE(group_id, location_code_id)        |

**`labeling_scanners`** — Physical scanner devices.

| Column            | Type             | Notes                                |
|-------------------|------------------|--------------------------------------|
| id                | UNIQUEIDENTIFIER | PK                                   |
| name              | NVARCHAR(100)    |                                      |
| connection_type   | VARCHAR(20)      | `serial`, `network`, `usb`           |
| connection_string | NVARCHAR(255)    | `192.168.1.50:9004` or `COM3`        |
| enabled           | BIT              |                                      |

**`labeling_scan_events`** — Audit log of every scan.

| Column             | Type             | Notes                                       |
|--------------------|------------------|---------------------------------------------|
| id                 | UNIQUEIDENTIFIER | PK                                          |
| scanner_id         | UNIQUEIDENTIFIER | FK → labeling_scanners                      |
| license_plate_code | VARCHAR(50)      | The scanned code                            |
| scanned_at         | DATETIME2        | DEFAULT GETDATE()                           |
| labels_printed     | INT              |                                             |
| status             | VARCHAR(20)      | `success`, `partial`, `failed`, `no_config` |

### Entity Relationship

```
labeling_scanners ─────┐
                       │ many-to-many via
                       ▼ labeling_group_scanners
labeling_groups ───────┤
   │                   │
   │ printer_id ──── printers.json (in-memory store)
   │
   └── labeling_group_configs
          │         │
          │         └── labeling_location_codes
          │
          ├── labeling_templates (elements, dimensions)
          └── VW_LABELING_PRODUCTS (product data)
```

---

## Backend Services

### server.js — Startup & Event Wiring

The entry point wires together the scanner connection manager and the scan processor.

```
1. Express app starts on PORT (default 3000), bound to 0.0.0.0
2. initializeScanners() queries all enabled scanners, calls scannerManager.initializeAll()
3. scannerManager.on('data') listener:
   a. parseScannerData(rawData) → extracts the code
   b. processScan(scannerId, code) → matches config, generates ZPL, sends to printer
4. Graceful shutdown on SIGINT/SIGTERM calls scannerManager.shutdown()
```

### scannerConnectionManager.js — TCP Scanner Connections

Singleton `EventEmitter` managing persistent TCP connections to network barcode scanners.

**Key behaviors:**
- Parses `connection_string` as `host:port`
- TCP keepalive with 10-second interval
- Auto-reconnects on disconnect (exponential backoff, max 5 attempts)
- Health check loop every 3 seconds
- Buffers incoming data, splits by newline, emits complete lines

**Events emitted:**
| Event          | Args                           | When                        |
|----------------|--------------------------------|-----------------------------|
| `connected`    | (scannerId, scanner)           | TCP connection established  |
| `data`         | (scannerId, line, scanner)     | Complete line received      |
| `disconnected` | (scannerId, scanner)           | Connection lost             |
| `error`        | (scannerId, error, scanner)    | TCP error                   |

**API:**
| Method                        | Purpose                                  |
|-------------------------------|------------------------------------------|
| `connect(scanner)`            | Open TCP connection, returns Promise      |
| `disconnect(scannerId)`       | Close connection                          |
| `initializeAll(scanners[])`   | Connect to all enabled network scanners   |
| `refreshScanner(scanner)`     | Reconnect if config changed               |
| `testConnection(scanner)`     | One-shot 5-second test                    |
| `getStatus()`                 | All scanner statuses                      |
| `shutdown()`                  | Disconnect all, stop health check         |

### scanProcessor.js — Scan Processing Pipeline

**`parseScannerData(data)`**

Extracts the barcode value from raw scanner data.

```
Input format:  {{prefix}}star;{{type}};{{code}}stop;
Example:       0000star;QR Code;A-01stop;
Extracted:     A-01

Fallback:      star;{{code}}stop;
```

**`processScan(scannerId, licensePlateCode)`**

The main pipeline. Steps:

1. **Query configs** — Joins through the group model:
   ```sql
   labeling_group_scanners  (match scanner_id)
   → labeling_groups         (enabled check)
   → labeling_group_configs  (enabled check)
   → labeling_location_codes (match code, enabled check)
   → labeling_templates      (get ZPL elements)
   → products view           (get product data)
   ```

2. **Fallback** — If no exact code match, retries with `'DEFAULT'`

3. **For each matching config:**
   - Parse template `elements` JSON
   - Substitute product variables (`{{product.gtin}}`, `{{date.YYMMDD}}`, etc.)
   - Generate ZPL via `generateZPLFromElements()`
   - Look up printer from `printerStore` using `g.printer_id`
   - Send ZPL to printer via `sendZPL(ip, zpl, {driver})`

4. **Log event** to `labeling_scan_events`

**Return shape:**
```js
{
  success: true,
  labels_printed: 3,
  results: [
    { group: "Line 1", printer: "printer-01", copies: 3, status: "success" },
    { group: "Line 2", status: "skipped", reason: "No printer assigned" }
  ],
  event_id: "uuid"
}
```

### printerStore.js — Printer Registry

In-memory store backed by `printers.json` file. Printers are NOT in the database.

```js
getPrinters()        // Returns { [id]: { id, name, ip, driver, port, ... } }
getPrinter(id)       // Single printer by ID
setPrinter(id, data) // Create or update
deletePrinter(id)    // Remove
```

**Printer object:**
```js
{ id: "printer-01", name: "Line 1 Zebra", ip: "192.168.1.100", driver: "zebra" }
```

### printerService.js — ZPL Transmission

Sends ZPL to printers over TCP port 9100.

```js
sendZPL(ip, zpl, { driver, timeout })   // Send ZPL string, returns Promise
checkPrinterStatus(ip, driver)           // {online, reachable}
getPeelSensorStatus(ip, driver)          // Peel sensor query
getPrinterExtendedStatus(ip, driver)     // ~HQES query (paper, ribbon, etc.)
```

Driver-specific behavior:
- **Zebra**: Wait 1 second after send, then close
- **SATO**: Close immediately (expects connection reset)

### ZPL Generation (src/services/zpl/)

**`generateZPLFromElements(elements, width, height, copies)`**

Converts a template's `elements` array into a ZPL string:

```
^XA                      ← Start label
^PW812                   ← Label width in dots
^LL406                   ← Label height in dots
^CI28                    ← UTF-8 character set
^PQ3,0,0,N              ← Print quantity (copies)
... element commands ...
^XZ                      ← End label
```

**Element types:**
| Type              | ZPL Command | Notes                                  |
|-------------------|-------------|----------------------------------------|
| `text`            | `^A0N`      | Font, size, position                   |
| `barcode-gs1-128` | `^BC`       | GS1-128 with FNC1 prefix               |
| `barcode-upc`     | `^BU`       | UPC-A with auto check digit            |
| `barcode-ean`     | `^BE`       | EAN-13 with auto check digit           |
| `barcode-gs1-databar` | `^BR`   | GS1 DataBar (omnidirectional, stacked) |
| `voicepick`       | Custom      | Black box with large/small white text  |
| `datebox`         | `^GB` + `^A0N` | Box with centered text             |
| `box`             | `^GB`       | Rectangle                              |
| `line`            | `^GB`       | Line (height as thickness)             |
| `image`           | `^GFA`      | Monochrome hex bitmap                  |

**`substituteProductVars(text, config)`**

Replaces template placeholders:
```
{{product.description}}  → Product description
{{product.gtin}}         → GTIN barcode
{{date.YYMMDD}}          → Formatted date with offset
{{voice_pick}}           → CRC16-based voice pick code
{{custom.myvar}}         → Custom variable from variable_values
{{variable|fallback}}    → Uses fallback if variable is empty
```

---

## API Endpoints

### Groups

| Method | Endpoint                               | Body / Params                              |
|--------|----------------------------------------|--------------------------------------------|
| GET    | `/api/groups`                          | → `{groups[]}` with `scanner_count`, `code_count` |
| GET    | `/api/groups/:id`                      | → `{group{...configs[], scanners[]}}`      |
| POST   | `/api/groups`                          | `{name, description, printer_id}`          |
| PUT    | `/api/groups/:id`                      | `{name, description, enabled, printer_id}` |
| DELETE | `/api/groups/:id`                      | Cascades configs + scanner assignments     |

### Group Configs

| Method | Endpoint                               | Body                                                       |
|--------|----------------------------------------|------------------------------------------------------------|
| GET    | `/api/groups/:groupId/configs`         | → `{configs[]}` with template + product + code joined      |
| POST   | `/api/group-configs`                   | `{group_id, location_code_id, template_id, product_id, copies, lot_number, pack_date_format, pack_date_offset, variable_values}` — upserts by `group_id + location_code_id` |
| DELETE | `/api/group-configs/:id`               |                                                            |

### Group Scanners

| Method | Endpoint                                       | Body              |
|--------|-------------------------------------------------|-------------------|
| GET    | `/api/groups/:groupId/scanners`                | → `{scanners[]}`  |
| POST   | `/api/groups/:groupId/scanners`                | `{scanner_id}`    |
| DELETE | `/api/groups/:groupId/scanners/:scannerId`     |                   |

### Location Codes

| Method | Endpoint                     | Body                    |
|--------|------------------------------|-------------------------|
| GET    | `/api/location-codes`        | → `{codes[]}` with `usage_count` |
| POST   | `/api/location-codes`        | `{code, description}`   |
| PUT    | `/api/location-codes/:id`    | `{code, description, enabled}` |
| DELETE | `/api/location-codes/:id`    | Blocked if in use       |

### Scanners

| Method | Endpoint                        | Notes                              |
|--------|---------------------------------|------------------------------------|
| GET    | `/api/scanners`                 | List all                           |
| POST   | `/api/scanners`                 | `{name, connection_type, connection_string}` |
| PUT    | `/api/scanners/:id`             | Update config                      |
| DELETE | `/api/scanners/:id`             |                                    |
| POST   | `/api/scanners/:id/connect`     | Open TCP connection                |
| POST   | `/api/scanners/:id/disconnect`  | Close TCP connection               |
| POST   | `/api/scanners/:id/test`        | One-shot connection test           |
| GET    | `/api/scanners/status`          | All connection statuses            |

### Scan Events

| Method | Endpoint           | Notes                                              |
|--------|--------------------|----------------------------------------------------|
| POST   | `/api/scan`        | `{scanner_id, license_plate_code}` → triggers print |
| GET    | `/api/scan-events` | `?scanner_id=&limit=100&offset=0`                  |

---

## Frontend

### Routes

| Path         | Component          | Purpose                          |
|--------------|--------------------|----------------------------------|
| `/`          | StationConfig      | Print & Apply configuration (home) |
| `/scanners`  | ScannerManagement  | Scanner CRUD + connections       |
| `/printers`  | PrinterManagement  | Printer CRUD                     |
| `/designer`  | LabelDesigner      | Template editor                  |
| `/print`     | PrintWorkflow      | Manual print jobs                |

### StationConfig.js — Main Configuration UI

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ [Group Icon] Station Configuration  [Theme] [↻] [+]  │
├────────────┬─────────────────────────────────────────┤
│ GROUPS     │  Group: Line 1        [Enabled] [✎] [✕] │
│            │  Optional description                    │
│ ▼ Line 1   │  Printer: [▼ Select printer]            │
│   + Add Code│                                         │
│   ■ A-01   │  🔍 Assigned Scanners (2) [+ Assign]    │
│   ■ B-02   │  [Scanner 1 ✕] [Scanner 2 ✕]            │
│   ■ DEFAULT│                                         │
│            │  Code: A-01                              │
│ ▶ Line 2   │  ┌─────────────────────────────────┐    │
│            │  │  LabelConfigPanel (compact)      │    │
│            │  │  - Template selector              │    │
│            │  │  - Product search                 │    │
│            │  │  - Variables, copies, dates       │    │
│            │  │  - Label preview                  │    │
│            │  │  [Save Configuration]             │    │
│            │  └─────────────────────────────────┘    │
└────────────┴─────────────────────────────────────────┘
```

**Left panel (280px):** Groups expand to show their location codes. Click a code to configure it.

**Right panel:** When a group is selected, shows:
- **(A)** Group header — name, enabled toggle, edit/delete, printer dropdown
- **(B)** Assigned scanners — chip list with add/remove
- **(C)** Code config — `LabelConfigPanel` in compact mode with Save button (only when a code is selected)

### useGroupAPI.js — Data Hook

All API calls for the groups feature. Returns state + methods:

```js
const {
  groups,           // Group[]
  locationCodes,    // LocationCode[]
  loading,          // boolean
  error,            // string | null

  // Groups
  fetchGroups, createGroup, updateGroup, deleteGroup,

  // Configs
  fetchGroupConfigs, saveGroupConfig, deleteGroupConfig,

  // Scanners
  fetchGroupScanners, assignScanner, unassignScanner, fetchAllScanners,

  // Location Codes
  fetchLocationCodes, createLocationCode, deleteLocationCode,

  // Printers
  fetchPrinters,
} = useGroupAPI();
```

### LabelConfigPanel — Reusable Config Editor

Accepts a config object and renders template selection, product search, variable fields, and print settings.

**Props:**
```js
{
  config: {
    template_id,     // UUID string
    product,         // { id, description, gtin, ... } or null
    copies,          // number
    lot_number,      // string
    pack_date_format, // 'YYMMDD' | 'MM/DD/YY' | ...
    pack_date_offset, // number (days from today)
    variable_values,  // { [key]: string }
  },
  onConfigChange,   // (newConfig) => void
  showCopies,       // boolean
  compact,          // boolean — horizontal layout for StationConfig
  actionButton,     // ReactNode — custom button (Save, Print, etc.)
  disabled,         // boolean
}
```

Used in StationConfig with `compact={true}` and a "Save Configuration" action button.

---

## Configuration Walkthrough

### Setting Up a New Line

1. **Create scanners** (`/scanners` page) — add the network scanner with its IP:port
2. **Connect scanner** — click Connect, verify status goes green
3. **Create a group** (`/` StationConfig) — give it a name, select the printer
4. **Assign scanners** — click "Assign Scanner" on the group, pick scanners from the list
5. **Add location codes** — expand the group, click "Add Code", type or select codes
6. **Configure each code** — click a code, select template + product, set copies, save

### How a Scan Triggers Printing

```
1. Scanner hardware reads barcode "A-01"
2. Raw TCP data arrives: "0000star;QR Code;A-01stop;"
3. scannerConnectionManager emits 'data' event
4. server.js listener calls parseScannerData() → "A-01"
5. processScan(scannerId, "A-01"):
   a. Query: scanner → group_scanners → groups → configs WHERE code = "A-01"
   b. If no match, retry with code = "DEFAULT"
   c. For each config found:
      - Merge template elements with product data
      - Generate ZPL string
      - Send to group's printer via TCP :9100
   d. Log to labeling_scan_events
6. Console logs: "[Scanner Line1] Printed 1 label(s) for code: A-01"
```

### The DEFAULT Fallback

If a scanned code has no exact config match, the system looks for a config with the location code `DEFAULT`. This lets you set up a catch-all label that prints for any unrecognized code.

---

## Key Patterns

| Pattern               | Details                                                    |
|-----------------------|------------------------------------------------------------|
| IDs                   | All UUIDs, generated with `crypto.randomUUID()`            |
| SQL parameterization  | Always use `pool.request().input()` — never string concat  |
| Products table        | Always reference via `PRODUCTS_TABLE` constant (it's a view) |
| Printers              | Stored in `printers.json`, not the database                |
| JSON in DB            | `variable_values` and template `elements` are JSON strings |
| Soft delete           | `enabled` BIT column, records are disabled not deleted     |
| Updated_at triggers   | SQL triggers auto-update `updated_at` on every `UPDATE`    |
| Config upsert         | `POST /api/group-configs` inserts or updates by `group_id + location_code_id` |
| Variable syntax       | `{{product.field}}`, `{{date.FORMAT}}`, `{{custom.key}}`, `{{var\|fallback}}` |

---

## File Reference

### Backend

| File                                    | Purpose                                  |
|-----------------------------------------|------------------------------------------|
| `server.js`                             | Entry point, scanner event wiring        |
| `src/routes/groups.js`                  | Group CRUD                               |
| `src/routes/groupConfigs.js`            | Group config CRUD (per code)             |
| `src/routes/groupScanners.js`           | Scanner ↔ group assignments              |
| `src/routes/locationCodes.js`           | Location code CRUD                       |
| `src/routes/scanners.js`               | Scanner CRUD + connect/disconnect        |
| `src/routes/scanEvents.js`             | POST /scan + event history               |
| `src/routes/index.js`                  | Route mounting                           |
| `src/services/scanProcessor.js`        | Parse scans, match configs, trigger prints |
| `src/services/scannerConnectionManager.js` | TCP connections to scanners          |
| `src/services/printerService.js`       | TCP send ZPL to printers                 |
| `src/services/printerStore.js`         | In-memory printer registry (JSON file)   |
| `src/services/zpl/`                    | ZPL generation, variable substitution    |
| `scripts/setup-groups.sql`             | Database migration for groups tables     |

### Frontend

| File                                        | Purpose                             |
|---------------------------------------------|-------------------------------------|
| `frontend/src/App.js`                       | Routes (`/` → StationConfig)        |
| `frontend/src/components/StationConfig.js`  | Main Print & Apply config UI        |
| `frontend/src/components/LabelConfigPanel.js` | Reusable label config editor      |
| `frontend/src/hooks/useGroupAPI.js`         | API hook for groups feature         |
| `frontend/src/components/ScannerManagement.js` | Scanner CRUD + connection UI     |
