const path = require('path');

// Driver-specific port mapping
const DRIVER_PORTS = {
  zebra: 6101,
  sato: 9100
};

module.exports = {
  PORT: process.env.PORT || 3000,
  PRINTER_PORT: 6101,
  DRIVER_PORTS,
  PRINTER_TIMEOUT: 5000,
  PRINTERS_FILE: path.join(__dirname, '../../printers.json'),

  // Configurable products table/view - can be overridden via env variable
  PRODUCTS_TABLE: process.env.PRODUCTS_TABLE || 'VW_LABELING_PRODUCTS'
};
