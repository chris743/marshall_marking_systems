/**
 * GS1/EAN/UPC Check Digit Utilities
 * Standard algorithm for barcode check digit calculation
 */

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

module.exports = {
  calculateCheckDigit,
  addBarcodeCheckDigit
};
