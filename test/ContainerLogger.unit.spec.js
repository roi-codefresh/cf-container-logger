'use strict';

const Q         = require('q');
const chai      = require('chai');
const expect    = chai.expect;
const sinon     = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const ContainerLogger = require('../lib/ContainerLogger');
const LoggerStrategy  = require('../lib/enums').LoggerStrategy;
const { EventEmitter } = require('events');
const { Writable, Readable, PassThrough } = require('stream');

describe('Container Logger tests', () => {

    describe('start', () => {

        describe('positive', () => {

            it('should handle a send message from stderr as error', (done) => {
                const containerInspect = {
                    Config: {
                        Tty: true
                    }
                };

                let receivedStdoutEvent, receivedStderrEvent;
                const stdoutStream = {
                    on: (event, callback) => {
                        if (event !== 'end') {
                            receivedStdoutEvent = event;
                            callback('message');
                        }
                    }
                };
                const stderrStream = {
                    on: (event, callback) => {
                        if (event !== 'end') {
                            receivedStderrEvent = event;
                            callback('error');
                        }
                    }
                };

                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(null, containerInspect);
                    },
                    logs: (options, callback) => {
                        if (options.stdout) {
                            callback(null, stdoutStream);
                        } else {
                            callback(null, stderrStream);
                        }
                    }
                };
                const stepLogger = {
                    write: sinon.spy()
                };
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger                 = new ContainerLogger({
                    containerId, containerInterface, stepLogger, loggerStrategy
                });
                containerLogger._logMessage = sinon.spy();
                containerLogger.start()
                    .then(() => {
                        expect(containerLogger._logMessage).to.have.been.calledWith('message', false); // jshint ignore:line
                    })
                    .done(done, done);
            });

            it('should handle a received message on data stream event in case tty is true', (done) => {
                const containerInspect = {
                    Config: {
                        Tty: true
                    }
                };

                let receivedStdoutEvent, receivedStderrEvent;
                const stdoutStream = {
                    on: (event, callback) => {
                        if (event !== 'end') {
                            receivedStdoutEvent = event;
                            callback('message');
                        }
                    }
                };
                const stderrStream = {
                    on: (event, callback) => {
                        if (event !== 'end') {
                            receivedStderrEvent = event;
                            callback('message');
                        }
                    }
                };

                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(null, containerInspect);
                    },
                    logs: (options, callback) => {
                        if (options.stdout) {
                            callback(null, stdoutStream);
                        } else {
                            callback(null, stderrStream);
                        }
                    }
                };
                const stepLogger = {
                    write: sinon.spy()
                };
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger                 = new ContainerLogger({
                    containerId, containerInterface, stepLogger, loggerStrategy
                });
                containerLogger._logMessage = sinon.spy();
                containerLogger.start()
                    .then(() => {
                        expect(receivedStdoutEvent).to.equal('data');
                        expect(containerLogger._logMessage).to.have.been.calledOnce; // jshint ignore:line
                    })
                    .done(done, done);
            });

            it('should handle a received message on readable stream event in case tty is false',
                (done) => {
                    const containerInspect = {
                        Config: {
                            Tty: false
                        }
                    };
                    const stream           = {
                        on: (event, callback) => {
                            if (event === 'end') {
                                callback();
                            }
                        }
                    };

                    const containerId        = 'containerId';
                    const containerInterface = {
                        inspect: (callback) => {
                            callback(null, containerInspect);
                        },
                        logs: (options, callback) => {
                            callback(null, stream);
                        }
                    };
                    const firebaseLogger     = {};
                    const firebaseLastUpdate = {};
                    const firebaseMetricsLogSize = {};
                    const loggerStrategy     = LoggerStrategy.LOGS;

                    const containerLogger                 = new ContainerLogger({
                        containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogSize, loggerStrategy
                    });
                    containerLogger._logMessageToFirebase = sinon.spy();
                    containerLogger.start()
                        .done(done, done);
                });

        });

        describe('negative', () => {

            it('should fail in case the provided strategy is not supported', (done) => {
                const containerInspect   = {
                    Config: {
                        Tty: true
                    }
                };
                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(null, containerInspect);
                    }
                };
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const firebaseMetricsLogSize = {};
                const loggerStrategy     = 'non-existing-strategy';

                const containerLogger = new ContainerLogger({
                    containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogSize, loggerStrategy
                });
                containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        expect(err.toString())
                            .to
                            .contain('Strategy: non-existing-strategy is not supported');
                    })
                    .done(done, done);
            });

            it('should fail in case inspect of the container failes', (done) => {
                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(new Error('inspect error'));
                    }
                };
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger = new ContainerLogger({
                    containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy
                });
                containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        expect(err.toString()).to.contain('inspect error');
                    })
                    .done(done, done);
            });

            it('should fail in case strategy is attach and attach failed', (done) => {
                const containerInspect   = {
                    Config: {
                        Tty: true
                    }
                };
                let receivedAttachOptions = [];
                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(null, containerInspect);
                    },
                    attach: (options, callback) => {
                        receivedAttachOptions.push(options);
                        callback(new Error('attach error'));
                    }
                };
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const firebaseMetricsLogSize = {};
                const loggerStrategy     = LoggerStrategy.ATTACH;

                const containerLogger = new ContainerLogger({
                    containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogSize, loggerStrategy
                });
                containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        receivedAttachOptions.forEach((options) => {
                            expect(options.stdout ^ options.stderr).to.equal(1);
                            expect(options.stream).to.equal(true);
                            expect(options.tty).to.equal(true);
                        });
                        expect(err.toString()).to.contain('attach error');
                    })
                    .done(done, done);
            });

            it('should fail in case strategy is logs and logs failed', (done) => {
                const containerInspect   = {
                    Config: {
                        Tty: true
                    }
                };
                let receivedLogsOptions = [];
                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(null, containerInspect);
                    },
                    logs: (options, callback) => {
                        receivedLogsOptions.push(options);
                        callback(new Error('logs error'));
                    }
                };
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const firebaseMetricsLogSize = {};
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger = new ContainerLogger({
                    containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogSize, loggerStrategy
                });
                containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        receivedLogsOptions.forEach((options) => {
                            expect(options.follow).to.equal(1);
                        });
                        expect(err.toString()).to.contain('logs error');
                    })
                    .done(done, done);
            });

        });

    });

    describe('_logMessageToFirebase', () => {

        it('should log message to firebase', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });
            const stepLogger = {
                write: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId, containerInterface, stepLogger, loggerStrategy, isWorkflowLogSizeExceeded
            });
            containerLogger._logMessage('message');
            expect(stepLogger.write).to.have.been.calledOnce; // jshint ignore:line
            expect(stepLogger.write).to.have.been.calledWith('message'); // jshint ignore:line
        });

        it('should log error to firebase with red decoration', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const stepLogger = {
                write: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId, containerInterface, stepLogger, loggerStrategy, isWorkflowLogSizeExceeded
            });
            containerLogger._logMessage('message', true);
            expect(stepLogger.write).to.have.been.calledOnce; // jshint ignore:line
            expect(stepLogger.write).to.have.been.calledWith('\x1B[31mmessage\x1B[0m'); // jshint ignore:line
        });

        it('should not log message to firebase in case limit of step reached', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const stepLogger = {
                write: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 10001;
            containerLogger.logExceededLimitsNotified = true;
            containerLogger._logMessage('message');
            expect(stepLogger.write).to.not.have.been.called; // jshint ignore:line
        });

        it('should not log message to firebase in case limit of workflow reached and step not yet', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return true;
            });

            const stepLogger = {
                write: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger.logExceededLimitsNotified = true;
            containerLogger._logMessage('message');
            expect(stepLogger.write).to.not.have.been.called; // jshint ignore:line
        });

        it('should print warning message to user in case of reaching the limit of step', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 10001;
            containerLogger._logMessage('message');
            expect(stepLogger.write).to.have.been.calledWith(`\x1B[01;93mLog size exceeded for this step.\nThe step will continue to execute until it finished but new logs will not be stored.\x1B[0m\r\n`); // jshint ignore:line
        });

        it('should print warning message to user in case of reaching the limit of workflow', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return true;
            });

            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger._logMessage('message');
            expect(stepLogger.write).to.have.been.calledWith(`\x1B[01;93mLog size exceeded for the workflow.\nThe step will continue to execute until it finished but new logs will not be stored.\x1B[0m\r\n`); // jshint ignore:line
        });

        it('should not print the warning message more than once', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return true;
            });

            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger._logMessage('message');
            containerLogger._logMessage('message');
            expect(stepLogger.write).to.have.been.calledOnce; // jshint ignore:line
        });

        it('should print error messages even if reached the limit', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });
            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 10001;
            containerLogger._logMessage('message');
            containerLogger._logMessage('message', true);
            expect(stepLogger.write).to.have.been.calledTwice; // jshint ignore:line
        });

        it('should emit an event each time a log is registered', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger.emit = sinon.spy(containerLogger.emit);
            containerLogger._logMessage('message');
            expect(containerLogger.emit).to.have.been.calledOnce; // jshint ignore:line
        });

    });

    describe('log size', () => {
        it('log size should stay 0 in case of not passing logSizeLimit param', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: sinon.spy()
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;

            const containerLogger = new ContainerLogger({
                containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogs, loggerStrategy
            });
            expect(containerLogger.logSize).to.equal(0);
        });

        it('log size should be 0 before any messages', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: sinon.spy()
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;

            const containerLogger = new ContainerLogger({
                containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogs, loggerStrategy, logSizeLimit
            });
            expect(containerLogger.logSize).to.equal(0);
        });

        it('log size should increase after adding a message', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger._logMessage('message');
            expect(containerLogger.logSize).to.equal(7);
        });

        it('total log size should be updated in firebase', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const stepLogger = {
                write: sinon.spy(),
                setLogSize: sinon.spy()
            };

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger._logMessage('message');
            expect(stepLogger.setLogSize).to.have.been.calledWith(7);
        });
    });

    describe('end event', () => {
        it('should emit "end" event - tty', async () => {
            const containerInspect = {
                Config: {
                    Tty: true
                }
            };

            const stdoutStream = new EventEmitter();
            const stderrStream = new EventEmitter();

            const containerId = 'containerId';
            const containerInterface = {
                inspect: (callback) => {
                    callback(null, containerInspect);
                },
                attach: (options, callback) => {
                    if (options.stdout) {
                        callback(null, stdoutStream);
                    } else {
                        callback(null, stderrStream);
                    }
                }
            };
            const stepLogger = {
                write: sinon.spy()
            };
            const loggerStrategy = LoggerStrategy.ATTACH;

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy
            });
            let endEventCalled = false;
            containerLogger.once('end', () => { endEventCalled = true; });
            containerLogger._logMessage = sinon.spy();
            await containerLogger.start();
            
            expect(containerLogger.handledStreams).to.be.equal(2);
            expect(containerLogger.finishedStreams).to.be.equal(0);
            expect(endEventCalled).to.be.false;
            stdoutStream.emit('end');
            expect(endEventCalled).to.be.false;
            expect(containerLogger.finishedStreams).to.be.equal(1);
            stderrStream.emit('end');
            expect(endEventCalled).to.be.true;
            expect(containerLogger.finishedStreams).to.be.equal(2);
        });

        it('should emit "end" event - non tty', async () => {
            const containerInspect = {
                Config: {
                    Tty: false
                }
            };

            const stdoutStream = new EventEmitter();

            const containerId = 'containerId';
            const containerInterface = {
                inspect: (callback) => {
                    callback(null, containerInspect);
                },
                attach: (opt, callback) => {
                    callback(null, stdoutStream);
                }
            };
            const stepLogger = {
                write: sinon.spy()
            };
            const loggerStrategy = LoggerStrategy.ATTACH;

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy
            });
            let endEventCalled = false;
            containerLogger.once('end', () => { endEventCalled = true; });
            containerLogger._logMessage = sinon.spy();
            await containerLogger.start();
            
            expect(containerLogger.handledStreams).to.be.equal(1);
            expect(containerLogger.finishedStreams).to.be.equal(0);
            expect(endEventCalled).to.be.false;
            stdoutStream.emit('end');
            expect(endEventCalled).to.be.true;
            expect(containerLogger.finishedStreams).to.be.equal(1);
        });

        it('should emit "end" event - writable stream', async () => {
            const containerInspect = {
                Config: {
                    Tty: true
                }
            };

            class FakeReadableStream extends Readable {
                constructor() {
                    super();
                    this.readCalled = false;
                }

                _read() {
                    if (!this.readCalled) {
                        this.readCalled = true;
                        this.push('check');
                    } else {
                        return this.push(null); // end stream
                    }
                }
            }

            const stdoutStream = sinon.spy(new FakeReadableStream('stdout'));
            const stderrStream = sinon.spy(new FakeReadableStream('stderr'));

            const containerId = 'containerId';
            const containerInterface = {
                inspect: (callback) => {
                    callback(null, containerInspect);
                },
                attach: (options, callback) => {
                    if (options.stdout) {
                        callback(null, stdoutStream);
                    } else {
                        callback(null, stderrStream);
                    }
                }
            };

            let finishedStreams = 0;
            let writableSpy;
            const transformSpies = [];

            const stepLogger = {
                writeStream: sinon.spy(() => {
                    const writable = sinon.spy(new Writable({
                        write(chunk, encoding, cb) {
                            cb(null); // continue
                        }
                    }));
                    writableSpy = writable;
                    return writable;
                }),
                stepNameTransformStream: () => {
                    const transform = sinon.spy(new PassThrough());
                    transform.once('end', () => { finishedStreams += 1; });
                    transformSpies.push(transform);
                    return transform;
                },
                opts: {
                    logsRateLimitConfig: {} // use stream
                }
            };
            const loggerStrategy = LoggerStrategy.ATTACH;

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                stepLogger,
                loggerStrategy
            });
            let endCalled = false;
            containerLogger.once('end', () => { endCalled = true; });
            containerLogger._logMessage = sinon.spy();
            await containerLogger.start();
            await Q.delay(20); // incase the piping is not finished
            
            expect(stepLogger.writeStream).to.have.been.calledOnce;
            expect(containerLogger.handledStreams).to.be.equal(2);
            expect(transformSpies[0].pipe).to.have.been.calledOnceWith(writableSpy, { end: false });
            expect(transformSpies[1].pipe).to.have.been.calledOnceWith(writableSpy, { end: false });
            expect(transformSpies[0].once).to.have.been.calledWith('end');
            expect(transformSpies[1].once).to.have.been.calledWith('end');
            expect(finishedStreams).to.be.equal(2);
            expect(endCalled).to.be.true;
        });
    });
});
