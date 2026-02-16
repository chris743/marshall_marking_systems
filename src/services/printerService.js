const net = require('net');
const { PRINTER_PORT, DRIVER_PORTS, PRINTER_TIMEOUT } = require('../config/constants');

// Get the correct port for a printer driver
function getPortForDriver(driver) {
  return DRIVER_PORTS[driver] || PRINTER_PORT;
}

// Send ZPL to printer via TCP/IP
function sendZPL(ip, zpl, options = {}) {
  const { timeout = PRINTER_TIMEOUT, driver = 'zebra' } = options;
  const port = getPortForDriver(driver);

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let responseData = '';
    let writeDone = false;
    let settled = false;

    const settle = (fn, value) => {
      if (!settled) {
        settled = true;
        fn(value);
      }
    };

    client.setTimeout(timeout);

    client.connect(port, ip, () => {
      console.log(`Connected to printer at ${ip}:${port} (driver: ${driver})`);
      client.write(zpl, () => {
        writeDone = true;
        // For SATO: data is sent, resolve immediately since SATO may reset connection
        if (driver === 'sato') {
          client.end();
        }
      });
    });

    client.on('data', (data) => {
      responseData += data.toString();
    });

    client.on('timeout', () => {
      client.destroy();
      settle(reject, new Error('Connection timeout'));
    });

    client.on('end', () => {
      settle(resolve, responseData);
    });

    client.on('close', () => {
      // If write completed, treat close as success regardless of how it closed
      if (writeDone) {
        settle(resolve, responseData);
      }
    });

    client.on('error', (err) => {
      // SATO resets connection after receiving data - treat ECONNRESET as success if data was sent
      if (writeDone && err.code === 'ECONNRESET') {
        console.log(`Printer at ${ip} reset connection after data sent (normal for SATO) - treating as success`);
        settle(resolve, responseData);
        return;
      }
      client.destroy();
      settle(reject, err);
    });

    // Auto-close after sending (Zebra needs this, SATO handled above)
    if (driver !== 'sato') {
      setTimeout(() => {
        if (!client.destroyed) {
          client.end();
        }
      }, 1000);
    }
  });
}

// Check printer status via TCP/IP
async function checkPrinterStatus(ip, driver = 'zebra') {
  const port = getPortForDriver(driver);

  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = 3000;
    let connected = false;

    client.setTimeout(timeout);

    client.connect(port, ip, () => {
      connected = true;
      console.log(`✓ Printer at ${ip}:${port} is online`);
      client.destroy();
      resolve({ online: true, reachable: true });
    });

    client.on('timeout', () => {
      client.destroy();
      console.log(`✗ Printer at ${ip}:${port} timed out`);
      resolve({ online: false, reachable: false, error: 'Connection timeout' });
    });

    client.on('error', (err) => {
      console.log(`✗ Printer at ${ip}:${port} error: ${err.message}`);
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
async function getPeelSensorStatus(ip, driver = 'zebra') {
  const port = getPortForDriver(driver);

  return new Promise((resolve) => {
    const client = new net.Socket();
    let responseData = '';

    client.setTimeout(2000);

    client.connect(port, ip, () => {
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
async function getPrinterExtendedStatus(ip, driver = 'zebra') {
  const port = getPortForDriver(driver);

  return new Promise((resolve) => {
    const client = new net.Socket();
    let responseData = '';

    client.setTimeout(3000);

    client.connect(port, ip, () => {
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
