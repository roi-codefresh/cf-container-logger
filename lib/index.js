const path = require('path');
const cflogs = require('cf-logs');
const Q = require('q');

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

const buildFinishedPromise = Q.defer();

const taskLoggerConfig = JSON.parse(process.env.TASK_LOGGER_CONFIG);

const logger = new Logger({
    loggerId: process.env.LOGGER_ID,
    taskLoggerConfig,
    findExistingContainers: process.env.LISTEN_ON_EXISTING,
    logSizeLimit: process.env.LOG_SIZE_LIMIT ? (parseInt(process.env.LOG_SIZE_LIMIT, 10) * 1000000) : undefined,
    buildFinishedPromise: buildFinishedPromise.promise,
    showProgress: process.env.SHOW_PROGRESS === 'true',
});

logger.validate();
logger.start();

process.on('SIGUSR2', () => {
    console.log('GOT SIGUSR2 --- engine signaling build is finished');
    buildFinishedPromise.resolve();
});

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
