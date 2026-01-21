const net = require('net');
const { PRINTER_PORT, PRINTER_TIMEOUT } = require('../config/constants');

// Send ZPL to printer via TCP/IP
function sendZPL(ip, zpl, timeout = PRINTER_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let responseData = '';

    client.setTimeout(timeout);

    client.connect(PRINTER_PORT, ip, () => {
      console.log(`Connected to printer at ${ip}:${PRINTER_PORT}`);
      client.write(zpl);
    });

    client.on('data', (data) => {
      responseData += data.toString();
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Connection timeout'));
    });

    client.on('end', () => {
      resolve(responseData);
    });

    client.on('close', () => {
      if (!client.destroyed) {
        resolve(responseData);
      }
    });

    client.on('error', (err) => {
      reject(err);
    });

    // Auto-close after sending
    setTimeout(() => {
      if (!client.destroyed) {
        client.end();
      }
    }, 1000);
  });
}

// Check printer status via TCP/IP
async function checkPrinterStatus(ip) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = 3000;
    let connected = false;

    client.setTimeout(timeout);

    client.connect(PRINTER_PORT, ip, () => {
      connected = true;
      console.log(`✓ Printer at ${ip} is online`);
      client.destroy();
      resolve({ online: true, reachable: true });
    });

    client.on('timeout', () => {
      client.destroy();
      console.log(`✗ Printer at ${ip} timed out`);
      resolve({ online: false, reachable: false, error: 'Connection timeout' });
    });

    client.on('error', (err) => {
      console.log(`✗ Printer at ${ip} error: ${err.message}`);
      if (!connected) {
        client.destroy();
        resolve({ online: false, reachable: false, error: err.message });
      }
    });

    client.on('close', () => {
      if (!connected) {
        resolve({ online: false, reachable: false, error: 'Connection closed' });
      }
    });
  });
}

// Get peel sensor status using SGD command
async function getPeelSensorStatus(ip) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let responseData = '';

    client.setTimeout(2000);

    client.connect(PRINTER_PORT, ip, () => {
      client.write('! U1 getvar "sensor.peeler"\r\n');
    });

    client.on('data', (data) => {
      responseData += data.toString();
    });

    client.on('timeout', () => {
      client.destroy();
      resolve({ error: 'timeout', rawResponse: responseData });
    });

    client.on('error', (err) => {
      client.destroy();
      resolve({ error: err.message, rawResponse: responseData });
    });

    setTimeout(() => {
      if (!client.destroyed) {
        client.destroy();

        const trimmed = responseData.trim();
        console.log(`[PEEL SENSOR] Raw response: "${trimmed}"`);

        const value = trimmed.replace(/"/g, '').toLowerCase();
        const labelTaken = value === 'clear';
        const labelAtPeelPosition = value === 'present';

        resolve({
          rawResponse: responseData,
          sensorValue: value,
          labelTaken: labelTaken,
          labelAtPeelPosition: labelAtPeelPosition,
          online: true
        });
      }
    }, 500);
  });
}

// Get printer status by sending ~HQES command
async function getPrinterExtendedStatus(ip) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let responseData = '';

    client.setTimeout(3000);

    client.connect(PRINTER_PORT, ip, () => {
      client.write('~HQES\r\n');
    });

    client.on('data', (data) => {
      responseData += data.toString();
    });

    client.on('timeout', () => {
      client.destroy();
      resolve({ error: 'timeout', rawResponse: responseData });
    });

    client.on('error', (err) => {
      client.destroy();
      resolve({ error: err.message, rawResponse: responseData });
    });

    setTimeout(() => {
      if (!client.destroyed) {
        client.destroy();

        const values = responseData.trim().split(',');
        const paperOut = values[1] === '1';
        const paused = values[2] === '1';
        const ribbonOut = values[7] === '1';
        const labelAtPeelPosition = paused || values[2] === '1';
        const labelTaken = !labelAtPeelPosition;

        resolve({
          rawResponse: responseData,
          values: values,
          paperOut: paperOut,
          paused: paused,
          ribbonOut: ribbonOut,
          labelAtPeelPosition: labelAtPeelPosition,
          labelTaken: labelTaken,
          online: true
        });
      }
    }, 500);
  });
}

module.exports = {
  sendZPL,
  checkPrinterStatus,
  getPeelSensorStatus,
  getPrinterExtendedStatus
};
