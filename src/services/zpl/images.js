/**
 * Image to ZPL Conversion
 * Converts base64 images to ZPL ^GF graphic field format
 */

const { Jimp } = require('jimp');

/**
 * Convert base64 image to ZPL ^GF graphic field format
 * @param {string} base64Data - Base64 encoded image (with or without data URL prefix)
 * @param {number} targetWidth - Target width in dots
 * @param {number} targetHeight - Target height in dots
 * @returns {Promise<{hexData: string, bytesPerRow: number, totalBytes: number}|null>}
 */
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

module.exports = {
  imageToZPL
};
