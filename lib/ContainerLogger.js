'use strict';

const Q              = require('q');
const logger         = require('cf-logs').Logger('codefresh:containerLogger');
const CFError        = require('cf-errors');
const LoggerStrategy = require('./enums').LoggerStrategy;

class ContainerLogger {

    constructor(containerId, containerInterface, firebaseLogger, loggerStrategy) {
        this.containerId        = containerId;
        this.containerInterface = containerInterface;
        this.firebaseLogger     = firebaseLogger;
        this.loggerStrategy     = loggerStrategy;
        this.tty                = false;
    }

    start() {
        return Q.ninvoke(this.containerInterface, 'inspect')
            .then((inspectedContainer) => {
                this.tty = inspectedContainer.Config.Tty;
                if (this.loggerStrategy === LoggerStrategy.ATTACH) {
                    return this._getAttachStrategyStream();
                } else if (this.loggerStrategy === LoggerStrategy.LOGS) {
                    return this._getLogsStrategyStream();
                } else {
                    return Q.reject(new CFError(`Strategy: ${this.loggerStrategy} is not supported`));
                }
            })
            .then((stream) => {
                logger.info(`Attached stream to container: ${this.containerId}`);
                // Listening on the stream needs to be performed different depending if a tty is attached or not
                // See documentation of the docker api here: https://docs.docker.com/engine/reference/api/docker_remote_api_v1.24/#/attach-to-a-container
                if (this.tty) {
                    this._handleTtyStream(stream);
                } else {
                    this._handleNonTtyStream(stream);
                }

                stream.on('end', () => {
                    logger.info(`stream end event was fired for container: ${this.containerId}`);
                });
            }, (err) => {
                return Q.reject(new CFError({
                    cause: err,
                    message: `Failed to handle container:${this.containerId}`
                }));
            });
    }

    _getAttachStrategyStream() {
        return Q.ninvoke(this.containerInterface, 'attach', {
            stream: true,
            stdout: true,
            stderr: true,
            tty: true
        });
    }

    _getLogsStrategyStream() {
        return Q.ninvoke(this.containerInterface, 'logs', {
            follow: 1,
            stdout: 1,
            stderr: 1
        });
    }

    _handleTtyStream(stream) {
        stream.on('data', (chunk) => {
            const buf     = new Buffer(chunk);
            const message = buf.toString('utf8');
            this._logMessageToFirebase(message);
        });
        logger.info(`Listening on stream 'data' event for container: ${this.containerId}`);
    }

    _handleNonTtyStream(stream) {
        stream.on('readable', () => {
            let header = stream.read(8);
            while (header !== null) {
                const payload = stream.read(header.readUInt32BE(4));
                if (payload === null) {
                    break;
                }
                this._logMessageToFirebase(new Buffer(payload).toString('utf8'));
                header = stream.read(8);
            }
        });
        logger.info(`Listening on stream 'readable' event for container: ${this.containerId}`);
    }

    _logMessageToFirebase(message) {
        this.firebaseLogger.child('logs').push(message);
        this.firebaseLogger.child('lastUpdate').set(new Date().getTime());
    }

}

module.exports = ContainerLogger;
