# Printer Manager API - Developer Guide

A full-stack application for managing Zebra ZT411 label printers with a web-based WYSIWYG label design system.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express.js 5 |
| Frontend | React 19, React Router DOM 7 |
| UI | Material-UI 7, Emotion CSS-in-JS |
| Database | SQL Server 2019 (mssql driver) |
| Printer Communication | TCP/IP sockets on port 6101, ZPL language |

---

## Project Structure

```
printer_manager_api/
├── server.js                    # Entry point (starts server)
├── sqlServerClient.js           # SQL Server connection pool
├── printers.json                # Persisted printer state (JSON file)
├── package.json                 # Backend dependencies
├── .env                         # Environment config
│
├── src/
│   ├── app.js                   # Express app setup, middleware
│   ├── config/
│   │   └── constants.js         # PRINTER_PORT, PRINTER_TIMEOUT, etc.
│   ├── services/
│   │   ├── printerService.js    # TCP communication (sendZPL, status)
│   │   ├── printerStore.js      # In-memory printer state + JSON persistence
│   │   └── zplGenerator.js      # ZPL generation helpers
│   ├── middleware/
│   │   └── dbCheck.js           # Database check middleware
│   └── routes/
│       ├── index.js             # Route aggregator
│       ├── health.js            # /api/health
│       ├── printers.js          # /api/printers CRUD
│       ├── print.js             # /api/printers/:id/print/*
│       ├── products.js          # /api/products
│       ├── templates.js         # /api/templates
│       ├── variables.js         # /api/variables, /api/templates/:id/variables
│       ├── printerConfigs.js    # /api/printer-configs
│       ├── scanners.js          # /api/scanners
│       ├── scanLocations.js     # /api/scanners/:id/locations
│       ├── licensePlates.js     # /api/license-plates
│       └── scanEvents.js        # /api/scan, /api/scan-events
│
├── scripts/
│   ├── setup-sqlserver.sql      # Database schema
│   └── import-products.py       # Product CSV import
│
└── frontend/
    └── src/
        ├── App.js               # Route definitions
        ├── index.js             # React entry point
        ├── theme.js             # MUI dark theme
        │
        ├── components/
        │   ├── LabelDesigner.js      # WYSIWYG label editor
        │   ├── PrinterManagement.js  # Printer CRUD & status
        │   ├── PrintWorkflow.js      # Production printing UI
        │   ├── StationConfig.js      # Scanner configuration
        │   ├── Canvas.js             # Interactive design canvas
        │   ├── Toolbar.js            # Action buttons
        │   ├── Sidebar.js            # Navigation
        │   ├── PropertiesPanel.js    # Element properties
        │   ├── ElementPropertiesModal.js
        │   └── ProductSelector.js    # Autocomplete picker
        │
        ├── hooks/
        │   ├── usePrinterAPI.js      # Printer operations
        │   ├── useTemplates.js       # Template CRUD
        │   ├── useProducts.js        # Product queries
        │   ├── useVariables.js       # Template variables
        │   └── usePrinterConfig.js   # Printer config persistence
        │
        └── utils/
            ├── zpl.js           # ZPL code generation
            ├── pti.js           # PTI standards (voice codes, GTIN)
            └── barcodes.js      # Barcode encoding
```

---

## Backend Architecture

### Entry Point: `server.js`

Minimal entry point that starts the Express server:

```javascript
const app = require('./src/app');
const { PORT } = require('./src/config/constants');
app.listen(PORT, () => { /* startup logs */ });
```

### App Setup: `src/app.js`

Configures Express middleware and mounts all routes:

```javascript
app.use(cors());
app.use(express.json());
app.use('/api', routes);  // All routes under /api
```

### Services

| File | Purpose |
|------|---------|
| `printerStore.js` | In-memory printer state + JSON persistence |
| `printerService.js` | TCP communication (sendZPL, checkStatus, getPeelSensor) |
| `zplGenerator.js` | ZPL generation and variable substitution |

### Route Files

| File | Endpoints |
|------|-----------|
| `health.js` | `/api/health` |
| `printers.js` | `/api/printers` CRUD, status, peel sensor |
| `print.js` | `/api/printers/:id/print/*` (single, raw, bulk, continuous) |
| `products.js` | `/api/products` list, search, get |
| `templates.js` | `/api/templates` CRUD |
| `variables.js` | `/api/templates/:id/variables`, `/api/variables/:id` |
| `printerConfigs.js` | `/api/printer-configs` |
| `scanners.js` | `/api/scanners` CRUD |
| `scanLocations.js` | `/api/scanners/:id/locations`, `/api/locations/:id` |
| `licensePlates.js` | `/api/license-plates`, `/api/license-plate-configs` |
| `scanEvents.js` | `/api/scan`, `/api/scan-events` |

### Database Connection: `sqlServerClient.js`

```javascript
const config = {
  server: process.env.SQL_SERVER,      // RDGW-CF
  database: process.env.SQL_DATABASE,  // DM02
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  pool: { min: 0, max: 10 }
};
```

### Printer State Management

Printers are stored in-memory and persisted to `printers.json`:

```javascript
// In-memory structure
let printers = {
  "printer-uuid": {
    id: "printer-uuid",
    name: "ZT411-Test",
    ipAddress: "192.168.126.32",
    port: 6101,
    continuousPrintJob: null  // Active job state
  }
};
```

### TCP Printer Communication

All printer communication uses raw TCP sockets:

```javascript
const net = require('net');

// Send ZPL to printer
const client = new net.Socket();
client.connect(6101, printerIp, () => {
  client.write(zplCode);
  client.end();
});
```

### Peel Sensor (SGD Commands)

```javascript
// Query peel sensor status
client.write('! U1 getvar "sensor.peeler"\r\n');
// Returns: "clear" (label taken) or "present" (label waiting)
```

---

## Frontend Architecture

### Routes (`App.js`)

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | LabelDesigner | WYSIWYG label editor |
| `/printers` | PrinterManagement | Printer CRUD & status |
| `/print` | PrintWorkflow | Production printing |
| `/stations` | StationConfig | Scanner setup |

### Key Components

#### LabelDesigner.js
The main design interface. Manages:
- Canvas element state (text, barcodes, images)
- Template load/save
- Product preview with variable substitution
- ZPL generation and printing

Key state:
```javascript
const [elements, setElements] = useState([]);
const [selectedElement, setSelectedElement] = useState(null);
const [labelWidth, setLabelWidth] = useState(812);   // 4" at 203 DPI
const [labelHeight, setLabelHeight] = useState(406); // 2" at 203 DPI
```

#### Canvas.js
Interactive SVG canvas for visual editing:
- Drag-to-move elements
- Double-click to edit
- Grid overlay at 203 DPI scale

#### PrintWorkflow.js
Production printing workflow:
- Printer selection (sidebar list)
- Template selection with preview
- Product autocomplete
- Variable input fields
- Single/continuous print buttons

### Custom Hooks

All API communication goes through hooks:

```javascript
// usePrinterAPI.js
const { printers, printLabel, checkStatus, startContinuousPrint } = usePrinterAPI();

// useTemplates.js
const { templates, createTemplate, updateTemplate } = useTemplates();

// useProducts.js
const { products, searchProducts } = useProducts();

// usePrinterConfig.js
const { config, saveConfig } = usePrinterConfig(printerId);
```

### ZPL Generation (`utils/zpl.js`)

Converts canvas elements to ZPL code:

```javascript
import { generateZPL } from './utils/zpl';

const zpl = generateZPL(elements, labelWidth, labelHeight);
// Returns: ^XA...^XZ ZPL string
```

Handles:
- Text elements (`^FO`, `^A`, `^FD`)
- Barcodes (GS1-128, DataBar, UPC, EAN)
- FNC1 encoding for GS1 compliance
- Variable substitution (`{{product.gtin}}`)

### PTI Standards (`utils/pti.js`)

```javascript
import { generateVoicePickCode, formatGTIN14 } from './utils/pti';

// Voice pick code: XX-XX format
const vpc = generateVoicePickCode(gtin, lotNumber, packDate);

// Format GTIN-14 from components
const gtin = formatGTIN14(companyPrefix, itemReference, indicatorDigit);
```

---

## Database Schema

### Tables (prefix: `labeling_`)

#### labeling_products
```sql
id              UNIQUEIDENTIFIER PRIMARY KEY
product_idx     INT
product_seq     INT
inactive        BIT
description     NVARCHAR(500)
company_prefix  VARCHAR(20)
item_reference  VARCHAR(20)
indicator_digit VARCHAR(1)
gtin            VARCHAR(14)        -- Indexed
external_upc    VARCHAR(20)
external_plu    VARCHAR(20)
company_name    NVARCHAR(255)
created_at      DATETIME2
updated_at      DATETIME2
```

#### labeling_templates
```sql
id              UNIQUEIDENTIFIER PRIMARY KEY
name            NVARCHAR(100)
description     NVARCHAR(500)
elements        NVARCHAR(MAX)      -- JSON array of canvas elements
label_width     INT DEFAULT 812
label_height    INT DEFAULT 406
is_default      BIT DEFAULT 0
created_at      DATETIME2
updated_at      DATETIME2
```

#### labeling_variables
```sql
id              UNIQUEIDENTIFIER PRIMARY KEY
template_id     UNIQUEIDENTIFIER   -- FK to templates
key             VARCHAR(50)        -- Variable name
label           NVARCHAR(100)      -- Display label
default_value   NVARCHAR(255)
field_type      VARCHAR(20)        -- 'text', 'select', 'date'
options         NVARCHAR(MAX)      -- JSON for select options
required        BIT DEFAULT 0
sort_order      INT DEFAULT 0
```

#### labeling_printer_configs
```sql
id              UNIQUEIDENTIFIER PRIMARY KEY
printer_id      VARCHAR(100) UNIQUE
template_id     UNIQUEIDENTIFIER
product_id      UNIQUEIDENTIFIER
lot_number      VARCHAR(50)
pack_date       VARCHAR(50)
variable_values NVARCHAR(MAX)      -- JSON object
created_at      DATETIME2
updated_at      DATETIME2
```

---

## API Reference

### Printers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/printers` | List all printers |
| POST | `/api/printers` | Add printer `{name, ipAddress}` |
| GET | `/api/printers/:id` | Get printer details |
| PUT | `/api/printers/:id` | Update printer |
| DELETE | `/api/printers/:id` | Remove printer |
| GET | `/api/printers/:id/status` | Check online/offline |
| GET | `/api/printers/:id/peel-sensor` | Get sensor status |

### Print Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/printers/:id/print` | Print JSON `{zpl, copies}` |
| POST | `/api/printers/:id/print/raw` | Print raw ZPL (text/plain) |
| POST | `/api/printers/:id/print/continuous` | Start continuous `{zpl, totalLabels}` |
| POST | `/api/printers/:id/print/continuous/stop` | Stop continuous |
| GET | `/api/printers/:id/print/continuous/status` | Job status |

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List templates |
| POST | `/api/templates` | Create `{name, elements, width, height}` |
| GET | `/api/templates/:id` | Get template (parses JSON) |
| PUT | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List `?page=1&limit=50&search=` |
| GET | `/api/products/search` | Autocomplete `?q=&limit=10` |
| GET | `/api/products/:id` | Get product |

### Printer Configs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/printer-configs` | All configs |
| GET | `/api/printer-configs/:printerId` | Get config |
| POST | `/api/printer-configs` | Save config |
| DELETE | `/api/printer-configs/:printerId` | Clear config |

---

## Common Development Tasks

### Adding a New API Endpoint

1. Create or edit a route file in `src/routes/`
2. Add the route handler:

```javascript
// src/routes/myResource.js
const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');

router.use(requireDb);  // Optional: require DB connection

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT ...');
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

3. Register the route in `src/routes/index.js`:

```javascript
const myResourceRoutes = require('./myResource');
router.use('/my-resource', myResourceRoutes);
```

### Adding a New React Component

1. Create file in `frontend/src/components/NewComponent.js`
2. Add route in `App.js`:

```javascript
import NewComponent from './components/NewComponent';

<Route path="/new-path" element={<NewComponent />} />
```

### Adding a New Element Type to Canvas

1. Update `LabelDesigner.js` - add to element creation menu
2. Update `Canvas.js` - add rendering logic
3. Update `utils/zpl.js` - add ZPL generation for the element

### Modifying ZPL Output

Edit `frontend/src/utils/zpl.js`:

```javascript
// Text elements
if (element.type === 'text') {
  zpl += `^FO${x},${y}`;
  zpl += `^A0N,${fontSize},${fontSize}`;
  zpl += `^FD${content}^FS`;
}

// Barcodes
if (element.type === 'barcode') {
  // ^BY (module width, ratio, height)
  // ^BC (orientation, height, print interpretation)
  zpl += `^FO${x},${y}^BY2,3,${height}^BCN,${height},Y,N,N^FD${data}^FS`;
}
```

### Adding a Database Table

1. Add CREATE TABLE to `scripts/setup-sqlserver.sql`
2. Run the SQL against your database
3. Create a new route file in `src/routes/` for the resource
4. Register it in `src/routes/index.js`

### Configuring the Products Table/View

The products data source is configurable via environment variable:

```bash
# In .env file
PRODUCTS_TABLE=VW_LABELING_PRODUCTS   # Default
PRODUCTS_TABLE=my_custom_products_view  # Or use your own
```

The system dynamically reads all columns from the configured table/view - no code changes needed when adding new columns.

### Using Product Variables in Labels

Product variables are resolved dynamically. Any column in your products table can be used:

```
{{product.gtin}}           # Standard field
{{product.description}}    # Standard field
{{product.commodity}}      # Custom field
{{product.my_custom_col}}  # Any column from your table
```

The system checks for the field in the product object automatically - no hardcoding required.

### Date Formatting Variables

Date variables use the `{{date.FORMAT}}` syntax where FORMAT specifies the output format:

```
{{date.MMMDD}}      # JAN15
{{date.DDMMM}}      # 15JAN
{{date.MMMDDYY}}    # JAN1526
{{date.DDMMMYY}}    # 15JAN26
{{date.MMDDYY}}     # 011526
{{date.DDMMYY}}     # 150126
{{date.YYMMDD}}     # 260115
{{date.MM/DD/YY}}   # 01/15/26
{{date.DD/MM/YY}}   # 15/01/26
{{date.MM-DD-YY}}   # 01-15-26
{{date.YYYY-MM-DD}} # 2026-01-15
{{date.julian}}     # 015 (day of year)
{{date.YYDDD}}      # 26015 (2-digit year + julian)
{{date.YYYYDDD}}    # 2026015 (4-digit year + julian)
{{date.month}}      # 01
{{date.day}}        # 15
{{date.year}}       # 2026
{{date.year2}}      # 26
{{date.MMM}}        # JAN
{{date.raw}}        # Original pack_date value
```

#### Date Offset (Shifting Days)

Add an offset in parentheses to shift the date forward or backward:

```
{{date.YYMMDD(-3)}}    # 3 days in the past
{{date.YYMMDD(+7)}}    # 7 days in the future
{{date.MMMDD(-1)}}     # Yesterday
{{date.julian(+30)}}   # Julian date 30 days from now
```

Use cases:
- **Best by dates**: `{{date.MMDDYY(+90)}}` for 90-day shelf life
- **Production dates**: `{{date.YYMMDD(-1)}}` if labeling day after production
- **Expiration**: `{{date.YYYY-MM-DD(+365)}}` for 1-year expiration

The system parses dates in multiple formats: `MM/DD/YY`, `MM/DD/YYYY`, `YYYY-MM-DD`, or standard parseable formats.

### Other System Variables

```
{{lot_number}}      # Current lot number
{{pack_date}}       # Raw pack date (backwards compatible)
{{voice_pick}}      # Auto-generated voice pick code
{{custom.varname}}  # Custom template variables
```

### Variable Fallback Defaults

All variables support a fallback value using the pipe `|` syntax. If the variable has no value, the fallback is used:

```
{{product.gtin|00000000000000}}     # Use default GTIN if product has none
{{lot_number|NO LOT}}               # Display "NO LOT" if lot_number is empty
{{date.MMDDYY|NO DATE}}             # Fallback if date can't be parsed
{{custom.batch|BATCH-001}}          # Default for missing custom variable
{{product.commodity|GENERAL}}       # Fallback for missing product field
```

Fallbacks work with all variable types including date offsets:
```
{{date.YYMMDD(+90)|EXPIRY TBD}}     # 90 days ahead, or fallback text
```

### Interactive Variable Editor

When editing label elements, double-click to open the properties modal. If the element contains variables, an interactive Variable Editor appears with:

- **Date Variables**: Format dropdown with all available formats, offset slider (-365 to +365 days), quick preset buttons
- **All Variables**: Fallback default text field
- **Live Preview**: Shows the exact variable syntax being generated

The Variable Editor automatically detects variables in text/barcode fields and provides appropriate controls for each type.

---

## Environment Setup

### Prerequisites
- Node.js 18+
- SQL Server 2019+ (or access to RDGW-CF)
- Network access to Zebra printers

### Install & Run

```bash
# Backend
npm install
npm start                # Starts on port 3000

# Frontend (separate terminal)
cd frontend
npm install
npm start                # Starts on port 3001 (proxied to 3000)
```

### Environment Variables (`.env`)

```
SQL_SERVER=RDGW-CF
SQL_DATABASE=DM02
SQL_USER=powerbi
SQL_PASSWORD=your_password
PORT=3000
```

---

## Continuous Printing Flow

The system uses a 2-label queue strategy:

1. **Start**: Queue 2 labels (1 presented + 1 buffered in printer)
2. **Poll**: Check peel sensor every 200ms
3. **Replenish**: When sensor = "clear", send next label
4. **Repeat**: Until `totalLabels` reached or stopped

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Label 1   │────▶│   Label 2   │────▶│   Label 3   │
│ (presented) │     │ (buffered)  │     │  (queued)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
  Peel sensor
  "clear" → send next
  "present" → wait
```

---

## Label Dimensions

Default: 4" x 2" at 203 DPI
- Width: 812 dots (4 inches × 203 DPI)
- Height: 406 dots (2 inches × 203 DPI)

Coordinate system:
- Origin (0,0) is top-left
- X increases to the right
- Y increases downward

---

## Troubleshooting

### Printer not responding
- Check TCP connectivity: `telnet <ip> 6101`
- Verify printer is in ZPL mode (not EPL)
- Check printer's configured port (usually 6101 or 9100)

### Peel sensor issues
- SGD command: `! U1 getvar "sensor.peeler"`
- Expected responses: "clear" or "present"
- Check printer has peel option installed

### ZPL not rendering correctly
- Use Labelary viewer: http://labelary.com/viewer.html
- Check element coordinates are within label bounds
- Verify barcode data meets symbology requirements

### Database connection errors
- Verify SQL Server is accessible
- Check credentials in `.env`
- Ensure `labeling_*` tables exist (run setup script)
