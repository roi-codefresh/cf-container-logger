'use strict';

const path   = require('path');
const cflogs = require('cf-logs');

const loggerOptions = {
    filePath: path.join(__dirname, '../logs', 'logs.log'),
    console: process.env.LOG_TO_CONSOLE || false,
    consoleOptions: {
        timestamp() {
            return new Date().toISOString();
        }
    }
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

process.on('beforeExit', (code) => {
    console.log(`beforeExit: ${code}`);
    logger.state.beforeExitCode = code;
    logger._writeNewState();
});
process.on('exit', (code) => {
    console.log(`exit: ${code}`);
    logger.state.exitCode = code;
    logger._writeNewState();
});

process.on('uncaughtException', (error) => {
    console.log(`uncaughtException: ${error}`);
    logger.state.uncaughtException = error;
    logger._writeNewState();
});

process.on('unhandledRejection', (reason) => {
    console.log(`unhandledRejection: ${reason}`);
    logger.state.unhandledRejection = reason;
    logger._writeNewState();
});