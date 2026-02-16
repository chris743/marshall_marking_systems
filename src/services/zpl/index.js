/**
 * ZPL Generation Module
 * Main exports for ZPL label generation
 */

const { generateZPLFromElements } = require('./elements');
const { substituteProductVars } = require('./variables');

module.exports = {
  generateZPLFromElements,
  substituteProductVars
};
