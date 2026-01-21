require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// Mount all API routes
app.use('/api', routes);

module.exports = app;
