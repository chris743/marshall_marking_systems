/**
 * Variable Substitution for ZPL Templates
 * Handles {{product.*}}, {{date.*}}, {{voice_pick}}, {{custom.*}}, etc.
 */

const { addBarcodeCheckDigit } = require('./checkDigits');
const { generateVoicePickCode } = require('./voicePick');
const { formatDate, formatVoicePickDate } = require('./dateFormat');

/**
 * Substitute product variables in text
 * Dynamically handles any product field - no hardcoding required
 * Supports fallback syntax: {{variable|fallback}}
 * @param {string} text - Text with variable placeholders
 * @param {Object} configData - Configuration data with product fields
 * @returns {string} Text with variables substituted
 */
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
  const packDateFormat = configData.pack_date_format || 'YYMMDD';
  const packDateOffset = parseInt(configData.pack_date_offset, 10) || 0;
  const voicePickPackDate = formatVoicePickDate(packDateFormat, packDateOffset);

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

module.exports = {
  substituteProductVars
};
