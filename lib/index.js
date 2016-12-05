'use strict';

const path   = require('path');
const cflogs = require('cf-logs');

const loggerOptions = {
    filePath: path.join(__dirname, '../logs', 'logs.log'),
    console: process.env.LOG_TO_CONSOLE || false
};
cflogs.init(loggerOptions);

const Logger = require('./logger');


const logger = new Logger(process.env.LOGGER_ID, process.env.FIREBASE_AUTH_URL, process.env.FIREBASE_SECRET, process.env.LISTEN_ON_EXISTING);

logger.validate();
logger.start();
