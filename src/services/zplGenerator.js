const { Jimp } = require('jimp');

// ========== CRC16 Table for Voice Pick Code ==========
const crc16Table = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
    }
    table[i] = crc;
  }
  return table;
})();

function calculateCRC16(str) {
  let crc = 0;
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i) & 0xFF;
    crc = (crc >> 8) ^ crc16Table[(crc ^ byte) & 0xFF];
  }
  return crc;
}

// Generate Voice Pick Code from GTIN, Lot Number, and Pack Date
// Returns format: "XX-XX"
function generateVoicePickCode(gtin, lotNumber, packDate = '') {
  const combined = `${gtin || ''}${lotNumber || ''}${packDate || ''}`.toUpperCase();
  const crc = calculateCRC16(combined);
  const code = crc.toString().padStart(4, '0').slice(-4);
  return `${code.slice(0, 2)}-${code.slice(2)}`;
}

// Helper function to format dates in various formats with optional day offset
function formatDate(packDate) {
  if (!packDate) return () => '';

  // Parse the base date - handle various input formats
  let baseDateObj;
  if (packDate.includes('/')) {
    // MM/DD/YY or MM/DD/YYYY format
    const parts = packDate.split('/');
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    baseDateObj = new Date(year, month, day);
  } else if (packDate.includes('-')) {
    // YYYY-MM-DD or similar
    baseDateObj = new Date(packDate);
  } else {
    // Try direct parse
    baseDateObj = new Date(packDate);
  }

  if (isNaN(baseDateObj.getTime())) {
    // Return a function that just returns the original packDate for any format
    return () => packDate;
  }

  // Return a formatter function that accepts format and optional offset
  return (format, offsetDays = 0) => {
    // Apply day offset if specified
    const dateObj = new Date(baseDateObj);
    if (offsetDays !== 0) {
      dateObj.setDate(dateObj.getDate() + offsetDays);
    }

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yy = String(dateObj.getFullYear()).slice(-2);
    const yyyy = String(dateObj.getFullYear());
    const mmm = months[dateObj.getMonth()];

    // Calculate Julian day (day of year)
    const startOfYear = new Date(dateObj.getFullYear(), 0, 0);
    const diff = dateObj - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const julian = String(Math.floor(diff / oneDay)).padStart(3, '0');

    // Format mapping
    const formats = {
      'MMMDD': `${mmm}${dd}`,
      'DDMMM': `${dd}${mmm}`,
      'MMMDDYY': `${mmm}${dd}${yy}`,
      'DDMMMYY': `${dd}${mmm}${yy}`,
      'MMDDYY': `${mm}${dd}${yy}`,
      'DDMMYY': `${dd}${mm}${yy}`,
      'YYMMDD': `${yy}${mm}${dd}`,
      'MM/DD/YY': `${mm}/${dd}/${yy}`,
      'DD/MM/YY': `${dd}/${mm}/${yy}`,
      'MM-DD-YY': `${mm}-${dd}-${yy}`,
      'YYYY-MM-DD': `${yyyy}-${mm}-${dd}`,
      'julian': julian,
      'YYDDD': `${yy}${julian}`,
      'YYYYDDD': `${yyyy}${julian}`,
      'month': mm,
      'day': dd,
      'year': yyyy,
      'year2': yy,
      'MMM': mmm,
      'raw': packDate
    };

    return formats[format] || packDate;
  };
}

// Helper function to substitute product variables
// Dynamically handles any product field - no hardcoding required
// Supports fallback syntax: {{variable|fallback}}
function substituteProductVars(text, configData) {
  if (!text) return text;
  let result = text;

  // Replace product variables dynamically with fallback support
  // Supports: {{product.field}} or {{product.field|fallback}}
  result = result.replace(/\{\{product\.(\w+)(?:\|([^}]*))?\}\}/g, (match, field, fallback) => {
    // Try multiple possible locations for the field
    let value = configData[field];                           // Direct field (e.g., gtin)
    if (value === undefined) value = configData[`product_${field}`];  // Prefixed (e.g., product_description)
    if (value === undefined && configData.product) value = configData.product[field];  // Nested object

    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    // Use fallback if provided
    return fallback !== undefined ? fallback : '';
  });

  // Replace date format variables with fallback support
  // Supports: {{date.FORMAT}}, {{date.FORMAT(offset)}}, {{date.FORMAT|fallback}}, {{date.FORMAT(offset)|fallback}}
  const getDateFormat = formatDate(configData.pack_date);
  result = result.replace(/\{\{date\.(\w+(?:[-/]\w+)*)(?:\(([+-]?\d+)\))?(?:\|([^}]*))?\}\}/g, (match, format, offset, fallback) => {
    const offsetDays = offset ? parseInt(offset, 10) : 0;
    const formatted = getDateFormat(format, offsetDays);
    if (formatted) return formatted;
    return fallback !== undefined ? fallback : '';
  });

  // Replace lot_number with fallback support
  result = result.replace(/\{\{lot_number(?:\|([^}]*))?\}\}/g, (match, fallback) => {
    if (configData.lot_number) return configData.lot_number;
    return fallback !== undefined ? fallback : '';
  });

  // Replace pack_date with fallback support (for backwards compatibility)
  result = result.replace(/\{\{pack_date(?:\|([^}]*))?\}\}/g, (match, fallback) => {
    if (configData.pack_date) return configData.pack_date;
    return fallback !== undefined ? fallback : '';
  });

  // Calculate the formatted pack date for voice pick code
  // Uses pack_date_format and pack_date_offset from config
  const voicePickPackDate = (() => {
    const format = configData.pack_date_format || 'YYMMDD';
    const offset = parseInt(configData.pack_date_offset, 10) || 0;

    // Use today's date as base (pack_date in config may be display formatted)
    const dateObj = new Date();
    if (offset !== 0) {
      dateObj.setDate(dateObj.getDate() + offset);
    }

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yy = String(dateObj.getFullYear()).slice(-2);
    const yyyy = String(dateObj.getFullYear());
    const mmm = months[dateObj.getMonth()];

    // Calculate Julian day
    const startOfYear = new Date(dateObj.getFullYear(), 0, 0);
    const diff = dateObj - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const julian = String(Math.floor(diff / oneDay)).padStart(3, '0');

    const formats = {
      'MMMDD': `${mmm}${dd}`,
      'DDMMM': `${dd}${mmm}`,
      'MMMDDYY': `${mmm}${dd}${yy}`,
      'DDMMMYY': `${dd}${mmm}${yy}`,
      'MMDDYY': `${mm}${dd}${yy}`,
      'DDMMYY': `${dd}${mm}${yy}`,
      'YYMMDD': `${yy}${mm}${dd}`,
      'MM/DD/YY': `${mm}/${dd}/${yy}`,
      'DD/MM/YY': `${dd}/${mm}/${yy}`,
      'MM-DD-YY': `${mm}-${dd}-${yy}`,
      'YYYY-MM-DD': `${yyyy}-${mm}-${dd}`,
      'julian': julian,
      'YYDDD': `${yy}${julian}`,
      'YYYYDDD': `${yyyy}${julian}`,
    };

    return formats[format] || `${yy}${mm}${dd}`;
  })();

  // Generate voice pick code using CRC16 algorithm (matches frontend)
  // Format: "XX-XX" (4 digits from CRC16 hash of GTIN + Lot + Formatted Date)
  const voicePickCode = generateVoicePickCode(
    configData.gtin || '',
    configData.lot_number || '',
    voicePickPackDate
  );
  result = result.replace(/\{\{voice_pick(?:\|([^}]*))?\}\}/g, (match, fallback) => {
    if (voicePickCode && voicePickCode !== '00-00') return voicePickCode;
    return fallback !== undefined ? fallback : voicePickCode;
  });

  // Replace custom variables with fallback support
  const variableValues = configData.variable_values ?
    (typeof configData.variable_values === 'string' ? JSON.parse(configData.variable_values) : configData.variable_values)
    : {};

  // Match custom variables with optional fallback
  result = result.replace(/\{\{custom\.(\w+)(?:\|([^}]*))?\}\}/g, (match, key, fallback) => {
    const value = variableValues[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    return fallback !== undefined ? fallback : '';
  });

  return result;
}

// Convert base64 image to ZPL ^GF graphic field format
// Returns: { hexData, bytesPerRow, totalBytes } or null if conversion fails
async function imageToZPL(base64Data, targetWidth, targetHeight) {
  try {
    // Extract the actual base64 data (remove data URL prefix if present)
    const base64Match = base64Data.match(/^data:image\/\w+;base64,(.+)$/);
    const rawBase64 = base64Match ? base64Match[1] : base64Data;

    // Decode base64 to buffer
    const buffer = Buffer.from(rawBase64, 'base64');

    // Read image with jimp 1.x
    const image = await Jimp.read(buffer);

    // Resize to target dimensions (jimp 1.x API uses object)
    image.resize({ w: targetWidth, h: targetHeight });

    // Convert to grayscale (jimp 1.x uses greyscale)
    image.greyscale();

    // Calculate bytes per row (must be byte-aligned, 8 pixels per byte)
    const bytesPerRow = Math.ceil(targetWidth / 8);
    const totalBytes = bytesPerRow * targetHeight;

    // Get bitmap data directly (jimp 1.x)
    const { data, width } = image.bitmap;

    // Convert to 1-bit monochrome and build hex string
    let hexData = '';

    for (let y = 0; y < targetHeight; y++) {
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteIdx * 8 + bit;
          if (x < targetWidth) {
            // Get pixel from bitmap data (RGBA format, 4 bytes per pixel)
            const pixelIdx = (y * width + x) * 4;
            const gray = data[pixelIdx]; // R channel (already grayscale, so r=g=b)

            // Threshold: dark pixels (< 128) = black = 1, light pixels = white = 0
            // In ZPL ^GF, 1 = print (black), 0 = no print (white)
            if (gray < 128) {
              byte |= (1 << (7 - bit));
            }
          }
        }
        // Convert byte to 2-character hex string
        hexData += byte.toString(16).padStart(2, '0').toUpperCase();
      }
    }

    return { hexData, bytesPerRow, totalBytes };
  } catch (error) {
    console.error('Image to ZPL conversion failed:', error.message, error.stack);
    return null;
  }
}

// Generate ZPL from elements (async to support image conversion)
async function generateZPLFromElements(elements, labelWidth, labelHeight) {
  let zpl = `^XA\n^PW${labelWidth}\n^LL${labelHeight}\n^CI28\n`;

  for (const el of elements.filter(el => el.visible !== false)) {
    const x = Math.round(el.x || 0);
    const y = Math.round(el.y || 0);

    switch (el.type) {
      case 'text':
        zpl += `^FO${x},${y}\n^A0N,${el.fontSize || 24},${el.fontSize || 24}\n^FD${el.text || ''}^FS\n`;
        break;
      case 'barcode-gs1-128':
        const barcodeData = (el.data || '').replace(/[()]/g, '');
        zpl += `^FO${x},${y}\n^BY${el.moduleWidth || 3}\n^BCN,${el.height || 80},${el.showText ? 'Y' : 'N'},N,N\n`;
        zpl += `^FD>;>8${barcodeData}^FS\n`;
        break;
      case 'barcode-upc':
        zpl += `^FO${x},${y}\n^BUN,${el.height || 70},${el.showText ? 'Y' : 'N'},N,N\n^FD${el.data || ''}^FS\n`;
        break;
      case 'barcode-ean':
        zpl += `^FO${x},${y}\n^BEN,${el.height || 70},${el.showText ? 'Y' : 'N'},N\n^FD${el.data || ''}^FS\n`;
        break;
      case 'voicepick':
        zpl += `^FO${x},${y}\n^GB${(el.width || 100) + 20},${(el.height || 50) + 10},2^FS\n`;
        zpl += `^FO${x + 10},${y + 5}\n^A0N,${el.fontSize || 36},${el.fontSize || 36}\n^FD${el.text || ''}^FS\n`;
        break;
      case 'datebox':
        zpl += `^FO${x},${y}\n^GB${el.width || 80},${el.height || 40},2^FS\n`;
        zpl += `^FO${x + 5},${y + 10}\n^A0N,${el.fontSize || 18},${el.fontSize || 18}\n^FD${el.text || ''}^FS\n`;
        break;
      case 'box':
        zpl += `^FO${x},${y}\n^GB${el.width || 100},${el.height || 50},${el.borderWidth || 2}^FS\n`;
        break;
      case 'line':
        zpl += `^FO${x},${y}\n^GB${el.width || 200},${el.height || 2},${el.height || 2}^FS\n`;
        break;
      case 'image':
        if (el.imageData) {
          console.log(`Processing image element: ${el.width}x${el.height}, imageData length: ${el.imageData.length}`);
          const imgZpl = await imageToZPL(el.imageData, el.width || 100, el.height || 100);
          if (imgZpl) {
            console.log(`Image converted to ZPL: ${imgZpl.totalBytes} bytes, ${imgZpl.bytesPerRow} bytes/row`);
            // ^GFA = ASCII hex format, totalBytes, totalBytes, bytesPerRow
            zpl += `^FO${x},${y}\n`;
            zpl += `^GFA,${imgZpl.totalBytes},${imgZpl.totalBytes},${imgZpl.bytesPerRow},\n`;
            zpl += `${imgZpl.hexData}^FS\n`;
          } else {
            console.log('Image conversion returned null');
          }
        } else {
          console.log('Image element has no imageData');
        }
        break;
    }
  }

  zpl += `^XZ`;
  return zpl;
}

module.exports = {
  substituteProductVars,
  generateZPLFromElements
};
