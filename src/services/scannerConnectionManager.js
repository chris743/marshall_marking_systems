const net = require('net');
const EventEmitter = require('events');

class ScannerConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // scannerId -> { socket, status, lastActivity, errorCount, config, reconnectTimer }
    this.reconnectDelay = 5000; // 5 seconds
    this.maxErrorCount = 10; // Stop reconnecting after this many consecutive errors
    this.healthCheckInterval = 3000; // Check connection health every 3 seconds
    this.healthCheckTimer = null;

    // Start health check loop
    this.startHealthCheck();
  }

  /**
   * Start periodic health check for all connections
   */
  startHealthCheck() {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.checkAllConnections();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health check loop
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Check health of all connections
   */
  checkAllConnections() {
    for (const [scannerId, conn] of this.connections) {
      if (conn.status === 'connected' && conn.socket) {
        // Check if socket is destroyed
        if (conn.socket.destroyed) {
          console.log(`Scanner ${conn.config?.name || scannerId} socket is destroyed`);
          this.handleDisconnection(scannerId, 'Socket destroyed');
          continue;
        }

        // Check if socket is still writable (indicates connection is alive)
        if (!conn.socket.writable) {
          console.log(`Scanner ${conn.config?.name || scannerId} socket is not writable`);
          this.handleDisconnection(scannerId, 'Socket not writable');
          continue;
        }

        // Check if socket is still readable
        if (!conn.socket.readable) {
          console.log(`Scanner ${conn.config?.name || scannerId} socket is not readable`);
          this.handleDisconnection(scannerId, 'Socket not readable');
          continue;
        }

        // Check pending status - if socket has pending data but isn't connecting, might be stuck
        if (conn.socket.pending && !conn.socket.connecting) {
          console.log(`Scanner ${conn.config?.name || scannerId} socket is in pending state`);
          this.handleDisconnection(scannerId, 'Socket pending');
          continue;
        }
      }
    }
  }

  /**
   * Handle detected disconnection
   */
  handleDisconnection(scannerId, reason) {
    const conn = this.connections.get(scannerId);
    if (!conn || conn.status === 'disconnecting' || conn.status === 'disconnected') return;

    console.log(`Detected disconnection for scanner ${conn.config?.name || scannerId}: ${reason}`);

    // Clean up the socket
    if (conn.socket) {
      conn.socket.removeAllListeners();
      conn.socket.destroy();
    }

    this.updateStatus(scannerId, 'disconnected', reason);
    this.emit('disconnected', scannerId, conn.config);
    this.scheduleReconnect(scannerId);
  }

  /**
   * Get status for all managed scanners
   */
  getStatus() {
    const statuses = {};
    for (const [id, conn] of this.connections) {
      statuses[id] = {
        status: conn.status,
        connected: conn.status === 'connected',
        lastActivity: conn.lastActivity,
        lastError: conn.lastError,
        errorCount: conn.errorCount,
        connectionString: conn.config?.connection_string || null
      };
    }
    return statuses;
  }

  /**
   * Get status for a specific scanner
   */
  getScannerStatus(scannerId) {
    const conn = this.connections.get(scannerId);
    if (!conn) {
      return {
        status: 'not_managed',
        connected: false,
        lastActivity: null,
        lastError: null,
        errorCount: 0
      };
    }
    return {
      status: conn.status,
      connected: conn.status === 'connected',
      lastActivity: conn.lastActivity,
      lastError: conn.lastError,
      errorCount: conn.errorCount,
      connectionString: conn.config?.connection_string || null
    };
  }

  /**
   * Connect to a scanner via TCP
   */
  async connect(scanner) {
    // Only handle network connections
    if (scanner.connection_type !== 'network') {
      console.log(`Scanner ${scanner.name} is not a network scanner (type: ${scanner.connection_type})`);
      return false;
    }

    if (!scanner.connection_string) {
      console.log(`Scanner ${scanner.name} has no connection string`);
      return false;
    }

    // Parse connection string (host:port)
    const parts = scanner.connection_string.split(':');
    if (parts.length !== 2) {
      console.log(`Scanner ${scanner.name} has invalid connection string: ${scanner.connection_string}`);
      return false;
    }

    const host = parts[0];
    const port = parseInt(parts[1], 10);

    if (isNaN(port)) {
      console.log(`Scanner ${scanner.name} has invalid port: ${parts[1]}`);
      return false;
    }

    // Check if already connected
    const existing = this.connections.get(scanner.id);
    if (existing && existing.status === 'connected') {
      console.log(`Scanner ${scanner.name} is already connected`);
      return true;
    }

    // Clean up existing connection if any
    if (existing) {
      this.cleanupConnection(scanner.id);
    }

    console.log(`Connecting to scanner ${scanner.name} at ${host}:${port}...`);

    const socket = new net.Socket();
    const now = new Date();

    // Store connection info
    this.connections.set(scanner.id, {
      socket,
      status: 'connecting',
      lastActivity: now,
      lastError: null,
      errorCount: existing?.errorCount || 0,
      config: scanner,
      reconnectTimer: null,
      dataBuffer: '' // Buffer for partial data
    });

    // Set socket timeout (30 seconds for connection)
    socket.setTimeout(30000);

    return new Promise((resolve) => {
      socket.connect(port, host, () => {
        console.log(`Connected to scanner ${scanner.name}`);
        this.updateStatus(scanner.id, 'connected');
        this.updateActivity(scanner.id);

        // Enable TCP keepalive with 10 second initial delay
        socket.setKeepAlive(true, 10000);

        // Set a shorter socket timeout for detecting dead connections
        socket.setTimeout(30000); // 30 second idle timeout

        this.emit('connected', scanner.id, scanner);
        resolve(true);
      });

      socket.on('data', (data) => {
        const conn = this.connections.get(scanner.id);
        if (!conn) return;

        this.updateActivity(scanner.id);

        // Buffer data and split by newlines/carriage returns
        conn.dataBuffer += data.toString();
        const lines = conn.dataBuffer.split(/[\r\n]+/);

        // Keep the last incomplete line in the buffer
        conn.dataBuffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            console.log(`Scanner ${scanner.name} received: ${trimmed}`);
            this.emit('data', scanner.id, trimmed, scanner);
          }
        }
      });

      socket.on('error', (err) => {
        console.error(`Scanner ${scanner.name} error: ${err.message}`);
        this.updateStatus(scanner.id, 'error', err.message);
        this.emit('error', scanner.id, err, scanner);
        resolve(false);
      });

      socket.on('close', (hadError) => {
        console.log(`Scanner ${scanner.name} connection closed${hadError ? ' (with error)' : ''}`);
        const conn = this.connections.get(scanner.id);
        if (conn && conn.status !== 'disconnecting') {
          this.updateStatus(scanner.id, 'disconnected');
          this.scheduleReconnect(scanner.id);
        }
        this.emit('disconnected', scanner.id, scanner);
      });

      // Handle FIN packet from remote (graceful close)
      socket.on('end', () => {
        console.log(`Scanner ${scanner.name} received FIN (remote closed connection)`);
        const conn = this.connections.get(scanner.id);
        if (conn && conn.status !== 'disconnecting') {
          this.handleDisconnection(scanner.id, 'Remote closed connection');
        }
      });

      socket.on('timeout', () => {
        const conn = this.connections.get(scanner.id);
        // If already connected, this is an idle timeout - might indicate dead connection
        if (conn && conn.status === 'connected') {
          console.log(`Scanner ${scanner.name} idle timeout - checking connection...`);
          // Don't destroy immediately, let the health check handle it
          // But mark as potentially problematic
        } else {
          // Initial connection timeout
          console.log(`Scanner ${scanner.name} connection timeout`);
          socket.destroy();
          this.updateStatus(scanner.id, 'error', 'Connection timeout');
          resolve(false);
        }
      });
    });
  }

  /**
   * Disconnect from a scanner
   */
  disconnect(scannerId) {
    const conn = this.connections.get(scannerId);
    if (!conn) {
      return false;
    }

    console.log(`Disconnecting from scanner ${conn.config?.name || scannerId}...`);

    // Mark as intentionally disconnecting to prevent auto-reconnect
    conn.status = 'disconnecting';

    // Clear any pending reconnect
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }

    // Destroy socket
    if (conn.socket) {
      conn.socket.destroy();
    }

    // Update status
    this.updateStatus(scannerId, 'disconnected');
    return true;
  }

  /**
   * Clean up a connection (remove from map)
   */
  cleanupConnection(scannerId) {
    const conn = this.connections.get(scannerId);
    if (!conn) return;

    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
    }

    if (conn.socket) {
      conn.socket.removeAllListeners();
      conn.socket.destroy();
    }

    this.connections.delete(scannerId);
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect(scannerId) {
    const conn = this.connections.get(scannerId);
    if (!conn) return;

    // Don't reconnect if disabled or too many errors
    if (!conn.config?.enabled) {
      console.log(`Scanner ${conn.config?.name || scannerId} is disabled, not reconnecting`);
      return;
    }

    if (conn.errorCount >= this.maxErrorCount) {
      console.log(`Scanner ${conn.config?.name || scannerId} exceeded max error count (${this.maxErrorCount}), not reconnecting`);
      return;
    }

    // Don't schedule if already pending
    if (conn.reconnectTimer) {
      return;
    }

    const delay = this.reconnectDelay * Math.min(conn.errorCount + 1, 5); // Exponential backoff, max 5x
    console.log(`Scheduling reconnect for scanner ${conn.config?.name || scannerId} in ${delay}ms`);

    conn.reconnectTimer = setTimeout(async () => {
      conn.reconnectTimer = null;
      const currentConn = this.connections.get(scannerId);
      if (currentConn && currentConn.config?.enabled && currentConn.status !== 'connected') {
        await this.connect(currentConn.config);
      }
    }, delay);
  }

  /**
   * Update scanner status
   */
  updateStatus(scannerId, status, errorMessage = null) {
    const conn = this.connections.get(scannerId);
    if (!conn) return;

    conn.status = status;

    if (errorMessage) {
      conn.lastError = errorMessage;
      conn.errorCount++;
    } else if (status === 'connected') {
      // Reset error count on successful connection
      conn.errorCount = 0;
      conn.lastError = null;
    }
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(scannerId) {
    const conn = this.connections.get(scannerId);
    if (conn) {
      conn.lastActivity = new Date();
    }
  }

  /**
   * Initialize connections to all enabled scanners
   */
  async initializeAll(scanners) {
    console.log(`Initializing ${scanners.length} scanner(s)...`);

    const networkScanners = scanners.filter(s =>
      s.enabled && s.connection_type === 'network' && s.connection_string
    );

    console.log(`Found ${networkScanners.length} enabled network scanner(s)`);

    for (const scanner of networkScanners) {
      await this.connect(scanner);
    }

    return networkScanners.length;
  }

  /**
   * Refresh scanner config and reconnect if needed
   */
  async refreshScanner(scanner) {
    const conn = this.connections.get(scanner.id);

    // If scanner is now disabled, disconnect
    if (!scanner.enabled) {
      if (conn) {
        this.disconnect(scanner.id);
      }
      return;
    }

    // If connection type changed to non-network, disconnect
    if (scanner.connection_type !== 'network') {
      if (conn) {
        this.disconnect(scanner.id);
      }
      return;
    }

    // If connection string changed or not connected, reconnect
    if (!conn || conn.config?.connection_string !== scanner.connection_string) {
      if (conn) {
        this.disconnect(scanner.id);
      }
      await this.connect(scanner);
    }
  }

  /**
   * Test connection to a scanner (one-shot)
   */
  async testConnection(scanner) {
    if (scanner.connection_type !== 'network' || !scanner.connection_string) {
      return { success: false, error: 'Not a network scanner or no connection string' };
    }

    const parts = scanner.connection_string.split(':');
    if (parts.length !== 2) {
      return { success: false, error: 'Invalid connection string format (expected host:port)' };
    }

    const host = parts[0];
    const port = parseInt(parts[1], 10);

    if (isNaN(port)) {
      return { success: false, error: 'Invalid port number' };
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ success: false, error: 'Connection timeout (5s)' });
      }, 5000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ success: true, message: `Successfully connected to ${host}:${port}` });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Shutdown all connections
   */
  shutdown() {
    console.log('Shutting down scanner connection manager...');

    // Stop health check
    this.stopHealthCheck();

    for (const [id] of this.connections) {
      this.disconnect(id);
    }
    this.connections.clear();
  }
}

// Export singleton instance
module.exports = new ScannerConnectionManager();
