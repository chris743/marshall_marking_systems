const fs = require('fs');
const { PRINTERS_FILE } = require('../config/constants');

// In-memory printer storage
let printers = {};

function loadPrinters() {
  try {
    if (fs.existsSync(PRINTERS_FILE)) {
      const data = fs.readFileSync(PRINTERS_FILE, 'utf8');
      printers = JSON.parse(data);
      console.log(`Loaded ${Object.keys(printers).length} printers from storage`);
    }
  } catch (error) {
    console.error('Error loading printers:', error.message);
    printers = {};
  }
}

function savePrinters() {
  try {
    const jsonData = JSON.stringify(printers, null, 2);
    fs.writeFileSync(PRINTERS_FILE, jsonData);
    console.log(`→ Saved ${Object.keys(printers).length} printers to ${PRINTERS_FILE}`);
  } catch (error) {
    console.error('✗ Error saving printers:', error.message);
  }
}

function getPrinters() {
  return printers;
}

function getPrinter(id) {
  return printers[id];
}

function setPrinter(id, data) {
  printers[id] = data;
}

function deletePrinter(id) {
  delete printers[id];
}

// Load printers on module initialization
loadPrinters();

module.exports = {
  getPrinters,
  getPrinter,
  setPrinter,
  deletePrinter,
  savePrinters,
  loadPrinters
};
