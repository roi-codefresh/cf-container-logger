'use strict';

const path   = require('path');
const cflogs = require('cf-logs');

const loggerOptions = {
    filePath: path.join(__dirname, '../logs', 'logs.log'),
    console: process.env.LOG_TO_CONSOLE || false
};
cflogs.init(loggerOptions);

const Logger = require('./logger');

const logger = new Logger({
    loggerId: process.env.LOGGER_ID,
    taskLoggerConfig: JSON.parse(process.env.TASK_LOGGER_CONFIG),
    findExistingContainers: process.env.LISTEN_ON_EXISTING,
    logSizeLimit: process.env.LOG_SIZE_LIMIT ? (parseInt(process.env.LOG_SIZE_LIMIT) * 1000000) : undefined,
});

logger.validate();
logger.start();
