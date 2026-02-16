/**
 * Date Formatting Utilities
 * Supports various date formats for label printing
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Parse a date string into a Date object
 * Handles various input formats: MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  let dateObj;
  if (dateStr.includes('/')) {
    // MM/DD/YY or MM/DD/YYYY format
    const parts = dateStr.split('/');
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    dateObj = new Date(year, month, day);
  } else if (dateStr.includes('-')) {
    // YYYY-MM-DD or similar
    dateObj = new Date(dateStr);
  } else {
    // Try direct parse
    dateObj = new Date(dateStr);
  }

  return isNaN(dateObj.getTime()) ? null : dateObj;
}

/**
 * Calculate Julian day (day of year) for a date
 * @param {Date} dateObj - Date object
 * @returns {string} Julian day padded to 3 digits
 */
function getJulianDay(dateObj) {
  const startOfYear = new Date(dateObj.getFullYear(), 0, 0);
  const diff = dateObj - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  return String(Math.floor(diff / oneDay)).padStart(3, '0');
}

/**
 * Format a date according to the specified format
 * @param {Date} dateObj - Date object to format
 * @param {string} format - Format string
 * @returns {string} Formatted date
 */
function formatDateObj(dateObj, format) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const yy = String(dateObj.getFullYear()).slice(-2);
  const yyyy = String(dateObj.getFullYear());
  const mmm = MONTHS[dateObj.getMonth()];
  const julian = getJulianDay(dateObj);

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
  };

  return formats[format] || null;
}

/**
 * Create a date formatter function for a given pack date
 * Returns a function that accepts format and optional offset
 * @param {string} packDate - Base pack date string
 * @returns {Function} Formatter function (format, offsetDays) => string
 */
function formatDate(packDate) {
  if (!packDate) return () => '';

  const baseDateObj = parseDate(packDate);
  if (!baseDateObj) {
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

    // Handle special 'raw' format
    if (format === 'raw') return packDate;

    const formatted = formatDateObj(dateObj, format);
    return formatted !== null ? formatted : packDate;
  };
}

/**
 * Format a date for voice pick code calculation
 * Uses today's date with optional offset
 * @param {string} format - Date format string
 * @param {number} offset - Day offset from today
 * @returns {string} Formatted date string
 */
function formatVoicePickDate(format, offset = 0) {
  const dateObj = new Date();
  if (offset !== 0) {
    dateObj.setDate(dateObj.getDate() + offset);
  }

  const formatted = formatDateObj(dateObj, format);
  if (formatted !== null) return formatted;

  // Default fallback: YYMMDD
  const yy = String(dateObj.getFullYear()).slice(-2);
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

module.exports = {
  formatDate,
  formatVoicePickDate,
  parseDate,
  formatDateObj,
  MONTHS
};
