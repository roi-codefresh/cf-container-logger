const EventEmitter   = require('events');
const Q              = require('q');
const logger         = require('cf-logs').Logger('codefresh:containerLogger');
const CFError        = require('cf-errors');
const { Transform } = require('stream');
const { LoggerStrategy } = require('./enums');

class ContainerLogger extends EventEmitter {

    constructor({
        containerId,
        containerInterface,
        stepLogger,
        logSizeLimit,
        isWorkflowLogSizeExceeded, // eslint-disable-line
        loggerStrategy
    }) {
        super();
        this.containerId               = containerId;
        this.containerInterface        = containerInterface;
        this.stepLogger                = stepLogger;
        this.loggerStrategy            = loggerStrategy;
        this.tty                       = false;
        this.logSizeLimit              = logSizeLimit;
        this.logSize                   = 0;
        this.isWorkflowLogSizeExceeded = isWorkflowLogSizeExceeded;
        this.stepFinished              = false;
        this.finishedStreams = 0;
        this.handledStreams = 0;
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
            .then(([stdout, stderr]) => {
                logger.info(`Attached stream to container: ${this.containerId}`);

                // Listening on the stream needs to be performed different depending if a tty is attached or not
                // See documentation of the docker api here: https://docs.docker.com/engine/reference/api/docker_remote_api_v1.24/#/attach-to-a-container
                if (this.tty) {

                    stdout.on('end', () => {
                        this.stepFinished = true;
                        logger.info(`stdout end event was fired for container: ${this.containerId}`);
                    });

                    if (this.stepLogger.opts && this.stepLogger.opts.logsRateLimitConfig) {
                        logger.info(`Found logger rate limit configuration, using streams api`);
                        this._streamTty(stdout, stderr);
                        return;
                    }

                    this._registerToTtyStreams(stdout, stderr);
                } else {
                    this._handleNonTtyStream(stdout, false);
                }
            }, (err) => {
                return Q.reject(new CFError({
                    cause: err,
                    message: `Failed to handle container:${this.containerId}`
                }));
            });
    }

    _getAttachStrategyStream() {
        return Q.all([
            Q.ninvoke(this.containerInterface, 'attach', {
                stream: true,
                stdout: true,
                stderr: false,
                tty: true
            }),
            Q.ninvoke(this.containerInterface, 'attach', {
                stream: true,
                stdout: false,
                stderr: true,
                tty: true
            })
        ]);
    }

    _getLogsStrategyStream() {
        return Q.all([
            Q.ninvoke(this.containerInterface, 'logs', {
                follow: 1,
                stdout: 1,
                stderr: 1
            })
        ]);
    }

    _streamTty(stdout, stderr) {
        logger.info(`Piping stdout and stderr step streams`);

        const stepLoggerWritableStream = this.stepLogger.writeStream();
        stepLoggerWritableStream.on('error', (err) => logger.error(`stepLoggerWritableStream: ${err}`));

        // Attention(!) all streams piped to step logger writable stream must be a new streams(!) in order to avoid message piping twice to writable stream.
        // { end = false } on the stepLoggerWritableStream because there is only one instance of it for all the steps.
        this.handledStreams++;
        stdout
            .pipe(this._logSizeLimitStream())
            .pipe(this.stepLogger.createMaskingStream())
            .pipe(this.stepLogger.stepNameTransformStream().once('end', this._handleFinished.bind(this)))
            .pipe(stepLoggerWritableStream, { end: false });

        if (!stderr) {
            return;
        }

        this.handledStreams++;
        stderr
            .pipe(this._logSizeLimitStream())
            .pipe(this._errorTransformerStream())
            .pipe(this.stepLogger.createMaskingStream())
            .pipe(this.stepLogger.stepNameTransformStream().once('end', this._handleFinished.bind(this)))
            .pipe(stepLoggerWritableStream, { end: false });

        stderr.once('end', () => {
            this.stepFinished = true;
            logger.info(`stderr end event was fired for container: ${this.containerId}`);
        });
    }

    _registerToTtyStreams(stdout, stderr) {
        this._handleTtyStream(stdout, false);

        if (stderr) {
            stderr.once('end', () => {
                this.stepFinished = true;
                logger.info(`stderr end event was fired for container: ${this.containerId}`);
            });
            this._handleTtyStream(stderr, true);
        }
    }

    _handleTtyStream(stream, isError) {
        this.handledStreams++;
        stream.on('end', this._handleFinished.bind(this));
        stream.on('data', (chunk) => {
            this._logMessage(Buffer.from(chunk).toString('utf-8'), isError);
        });
        logger.info(`Listening on stream 'data' event for container: ${this.containerId}`);
    }

    _handleNonTtyStream(stream, isError) {
        this.handledStreams++;
        stream.on('readable', () => {
            let header = stream.read(8);
            while (header !== null) {
                const payload = stream.read(header.readUInt32BE(4));
                if (payload === null) {
                    break;
                }
                this._logMessage(Buffer.from(payload).toString('utf8'), isError);
                header = stream.read(8);
            }
        });
        stream.on('end', this._handleFinished.bind(this));
        logger.info(`Listening on stream 'readable' event for container: ${this.containerId}`);
    }

    _stepLogSizeExceeded() {
        return this.logSize > this.logSizeLimit;
    }

    _logMessage(message, isError) {
        if (this.logSizeLimit && (this._stepLogSizeExceeded() || this.isWorkflowLogSizeExceeded()) && !isError) {
            if (!this.logExceededLimitsNotified) {
                this.logExceededLimitsNotified = true;
                message = `\x1B[01;93mLog size exceeded for ${this._stepLogSizeExceeded()
                    ? 'this step'
                    : 'the workflow'}.\nThe step will continue to execute until it finished but new logs will not be stored.\x1B[0m\r\n`;
            } else {
                return;
            }
        }

        if (isError) {
            message = `\x1B[31m${message}\x1B[0m`;
        }

        this.stepLogger.write(message);

        if (this.logSizeLimit) {
            this.logSize += Buffer.byteLength(message);
            this.stepLogger.setLogSize(this.logSize);
        }
        this.emit('message.logged');
    }

    _errorTransformerStream() {
        return new Transform({
            transform: (data, encoding, done) => {
                const message = `\x1B[31m${data.toString('utf8')}\x1B[0m`;
                done(null, Buffer.from(message));
            }
        });
    }

    _logSizeLimitStream() {
        return new Transform({
            transform: (data, encoding, done) => {
                if (this.logSizeLimit && (this._stepLogSizeExceeded() || this.isWorkflowLogSizeExceeded())) {
                    if (!this.logExceededLimitsNotified) {
                        this.logExceededLimitsNotified = true;
                        const message = `\x1B[01;93mLog size exceeded for ${this._stepLogSizeExceeded()
                            ? 'this step'
                            : 'the workflow'}.\nThe step will continue to execute until it finished but new logs will not be stored.\x1B[0m\r\n`;
                        done(null, Buffer.from(message));
                        return;
                    }

                    done(null, Buffer.alloc(0));  // discard chunk
                    return;
                }

                if (this.logSizeLimit) {
                    this.logSize += Buffer.byteLength(data);
                    this.stepLogger.setLogSize(this.logSize);
                }

                this.emit('message.logged');
                done(null, data);
            }
        });
    }

    _handleFinished() {
        this.finishedStreams++;

        if (this.finishedStreams === this.handledStreams) {
            // the emission of this event reflects the ending of all streams handled by this container logger
            this.emit('end');
        }
    }
}

module.exports = ContainerLogger;
