/**
 * ZPL Element Rendering
 * Generates ZPL commands for each element type
 */

const { addBarcodeCheckDigit } = require('./checkDigits');
const { imageToZPL } = require('./images');

/**
 * Generate ZPL from elements (async to support image conversion)
 * @param {Array} elements - Array of label elements
 * @param {number} labelWidth - Label width in dots
 * @param {number} labelHeight - Label height in dots
 * @param {number} quantity - Number of copies to print
 * @returns {Promise<string>} ZPL command string
 */
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
  generateZPLFromElements
};
