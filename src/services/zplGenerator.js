const { Jimp } = require('jimp');

// ========== CRC-16 for PTI Voice Pick Code ==========
// Hardcoded table from working Lua implementation
const crc16Table = [
  0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241,
  0xc601, 0x06c0, 0x0780, 0xc741, 0x0500, 0xc5c1, 0xc481, 0x0440,
  0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40,
  0x0a00, 0xcac1, 0xcb81, 0x0b40, 0xc901, 0x09c0, 0x0880, 0xc841,
  0xd801, 0x18c0, 0x1980, 0xd941, 0x1b00, 0xdbc1, 0xda81, 0x1a40,
  0x1e00, 0xdec1, 0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41,
  0x1400, 0xd4c1, 0xd581, 0x1540, 0xd701, 0x17c0, 0x1680, 0xd641,
  0xd201, 0x12c0, 0x1380, 0xd341, 0x1100, 0xd1c1, 0xd081, 0x1040,
  0xf001, 0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1, 0xf281, 0x3240,
  0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0, 0x3480, 0xf441,
  0x3c00, 0xfcc1, 0xfd81, 0x3d40, 0xff01, 0x3fc0, 0x3e80, 0xfe41,
  0xfa01, 0x3ac0, 0x3b80, 0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840,
  0x2800, 0xe8c1, 0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41,
  0xee01, 0x2ec0, 0x2f80, 0xef41, 0x2d00, 0xedc1, 0xec81, 0x2c40,
  0xe401, 0x24c0, 0x2580, 0xe541, 0x2700, 0xe7c1, 0xe681, 0x2640,
  0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0, 0x2080, 0xe041,
  0xa001, 0x60c0, 0x6180, 0xa141, 0x6300, 0xa3c1, 0xa281, 0x6240,
  0x6600, 0xa6c1, 0xa781, 0x6740, 0xa501, 0x65c0, 0x6480, 0xa441,
  0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41,
  0xaa01, 0x6ac0, 0x6b80, 0xab41, 0x6900, 0xa9c1, 0xa881, 0x6840,
  0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41,
  0xbe01, 0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40,
  0xb401, 0x74c0, 0x7580, 0xb541, 0x7700, 0xb7c1, 0xb681, 0x7640,
  0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041,
  0x5000, 0x90c1, 0x9181, 0x5140, 0x9301, 0x53c0, 0x5280, 0x9241,
  0x9601, 0x56c0, 0x5780, 0x9741, 0x5500, 0x95c1, 0x9481, 0x5440,
  0x9c01, 0x5cc0, 0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40,
  0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901, 0x59c0, 0x5880, 0x9841,
  0x8801, 0x48c0, 0x4980, 0x8941, 0x4b00, 0x8bc1, 0x8a81, 0x4a40,
  0x4e00, 0x8ec1, 0x8f81, 0x4f40, 0x8d01, 0x4dc0, 0x4c80, 0x8c41,
  0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680, 0x8641,
  0x8201, 0x42c0, 0x4380, 0x8341, 0x4100, 0x81c1, 0x8081, 0x4040,
];

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

// ========== Check Digit Calculation for UPC/EAN/GTIN ==========
/**
 * Calculate check digit using GS1/EAN/UPC standard algorithm
 * Works for any length - calculates check digit for the input
 * @param {string} digits - The digits without check digit
 * @returns {string} The check digit (single character)
 */
function calculateCheckDigit(digits) {
  const nums = digits.replace(/\D/g, '').split('').map(Number);
  if (nums.length === 0) return '';

  // GS1 standard: from right to left, odd positions * 3, even positions * 1
  let sum = 0;
  const len = nums.length;
  for (let i = 0; i < len; i++) {
    const multiplier = (len - i) % 2 === 0 ? 1 : 3;
    sum += nums[i] * multiplier;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

/**
 * Auto-detect barcode type and add check digit if needed
 * Handles UPC-A (11->12), EAN-13 (12->13), GTIN-14 (13->14)
 * @param {string} code - Barcode digits
 * @returns {string} Barcode with check digit
 */
function addBarcodeCheckDigit(code) {
  if (!code) return code;
  const digits = String(code).replace(/\D/g, '');
  // If it's a standard length with check digit, return as-is
  if (digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14) {
    return digits;
  }
  // Add check digit for lengths without
  if (digits.length === 7) return digits + calculateCheckDigit(digits); // EAN-8
  if (digits.length === 11) return digits + calculateCheckDigit(digits); // UPC-A
  if (digits.length === 12) return digits + calculateCheckDigit(digits); // EAN-13
  if (digits.length === 13) return digits + calculateCheckDigit(digits); // GTIN-14
  return code; // Return original if unknown format
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
  // Special fields with _check suffix add check digit: {{product.gtin_check}}, {{product.external_upc_check}}
  result = result.replace(/\{\{product\.(\w+)(?:\|([^}]*))?\}\}/g, (match, field, fallback) => {
    // Handle _check suffix for barcode check digit calculation
    if (field.endsWith('_check')) {
      const baseField = field.replace(/_check$/, '');
      // Try multiple possible locations for the base field
      let value = configData[baseField];
      if (value === undefined) value = configData[`product_${baseField}`];
      if (value === undefined && configData.product) value = configData.product[baseField];

      if (value !== undefined && value !== null && value !== '') {
        return addBarcodeCheckDigit(String(value));
      }
      return fallback !== undefined ? fallback : '';
    }

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
// quantity parameter adds ^PQ command for bulk printing
async function generateZPLFromElements(elements, labelWidth, labelHeight, quantity = 1) {
  let zpl = `^XA\n^PW${labelWidth}\n^LL${labelHeight}\n^CI28\n`;

  // Add print quantity command if more than 1 copy
  if (quantity > 1) {
    zpl += `^PQ${quantity},0,0,N\n`; // qty, pause, replicates, override
  }

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
        // Add check digit if needed (11 digits -> 12)
        // ^BU params: orientation, height, interpretation line, interp above (N), print check digit (Y)
        const upcData = addBarcodeCheckDigit(el.data || '');
        zpl += `^FO${x},${y}\n^BUN,${el.height || 70},${el.showText ? 'Y' : 'N'},N,Y\n^FD${upcData}^FS\n`;
        break;
      case 'barcode-ean':
        // Add check digit if needed (12 digits -> 13)
        // ^BE params: orientation, height, interpretation line, interp above (N), print check digit (Y)
        const eanData = addBarcodeCheckDigit(el.data || '');
        zpl += `^FO${x},${y}\n^BEN,${el.height || 70},${el.showText ? 'Y' : 'N'},N,Y\n^FD${eanData}^FS\n`;
        break;
      case 'voicepick': {
        // Voice pick code format: "XX-XX" - first pair large, second pair small, inverted colors, no dash
        const voiceCode = el.text || '';
        const parts = voiceCode.split('-');
        const firstPair = parts[0] || '00';
        const secondPair = parts[1] || '00';

        const boxWidth = el.width || 100;
        const boxHeight = el.height || 50;
        const largeFontSize = el.fontSize || 36;
        const smallFontSize = Math.round(largeFontSize * 0.6);

        // Draw filled black box (inverted background)
        zpl += `^FO${x},${y}\n`;
        zpl += `^GB${boxWidth},${boxHeight},${boxHeight},B^FS\n`;

        // Calculate positions - font width is approx 0.6x height for ZPL default font
        const largeCharWidth = Math.round(largeFontSize * 0.6);
        const smallCharWidth = Math.round(smallFontSize * 0.6);
        const gap = 4;
        const totalWidth = (largeCharWidth * 2) + gap + (smallCharWidth * 2);
        const startX = x + Math.round((boxWidth - totalWidth) / 2);
        const largeY = y + Math.round((boxHeight - largeFontSize) / 2);
        const smallY = y + Math.round((boxHeight - smallFontSize) / 2);

        // First pair - large white text (field reverse)
        zpl += `^FO${startX},${largeY}\n`;
        zpl += `^FR^A0N,${largeFontSize},${largeFontSize}\n`;
        zpl += `^FD${firstPair}^FS\n`;

        // Second pair - small white text
        const secondX = startX + (largeCharWidth * 2) + gap;
        zpl += `^FO${secondX},${smallY}\n`;
        zpl += `^FR^A0N,${smallFontSize},${smallFontSize}\n`;
        zpl += `^FD${secondPair}^FS\n`;
        break;
      }
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
