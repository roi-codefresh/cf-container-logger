'use strict';

const Q         = require('q');
const chai      = require('chai');
const expect    = chai.expect;
const sinon     = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const ContainerLogger = require('../lib/ContainerLogger');
const LoggerStrategy  = require('../lib/enums').LoggerStrategy;

describe('Container Logger tests', () => {

    describe('start', () => {

        describe('positive', () => {

            it('should separate the stdout from stderr', (done) => {
                const containerInspect   = {
                    Config: {
                        Tty: true
                    }
                };
                let receivedEvent;
                const stream             = {
                    on: (event, callback) => {
                        if (event !== 'end') {
                            receivedEvent = event;
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
                        expect(options.stdout ^ options.stderr).to.be.trusty; // jshint ignore:line
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
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger                 = new ContainerLogger({
                    containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy
                });
                containerLogger._logMessageToFirebase = sinon.spy();
                containerLogger.start()
                    .then(() => {
                        expect(containerLogger._logMessageToFirebase).to.have.been.calledWith('message', false); // jshint ignore:line
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
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const firebaseMetricsLogSize = {};
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger                 = new ContainerLogger({
                    containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogSize, loggerStrategy
                });
                containerLogger._logMessageToFirebase = sinon.spy();
                containerLogger.start()
                    .then(() => {
                        expect(receivedStdoutEvent).to.equal('data');
                        expect(containerLogger._logMessageToFirebase).to.have.been.calledOnce; // jshint ignore:line
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
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogs, loggerStrategy, isWorkflowLogSizeExceeded
            });
            containerLogger._logMessageToFirebase('message');
            expect(pushSpy).to.have.been.calledOnce; // jshint ignore:line
            expect(pushSpy).to.have.been.calledWith('message'); // jshint ignore:line
            expect(setSpy).to.have.been.calledOnce; // jshint ignore:line
        });

        it('should log error to firebase with red decoration', () => {

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
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId, containerInterface, firebaseLogger, firebaseLastUpdate, firebaseMetricsLogs, loggerStrategy, isWorkflowLogSizeExceeded
            });
            containerLogger._logMessageToFirebase('message', true);
            expect(pushSpy).to.have.been.calledOnce; // jshint ignore:line
            expect(pushSpy).to.have.been.calledWith('\x1B[31mmessage\x1B[0m'); // jshint ignore:line
            expect(setSpy).to.have.been.calledOnce; // jshint ignore:line
        });

        it('should not log message to firebase in case limit of step reached', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 10001;
            containerLogger.logExceededLimitsNotified = true;
            containerLogger._logMessageToFirebase('message');
            expect(pushSpy).to.not.have.been.called; // jshint ignore:line
        });

        it('should not log message to firebase in case limit of workflow reached and step not yet', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return true;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger.logExceededLimitsNotified = true;
            containerLogger._logMessageToFirebase('message');
            expect(pushSpy).to.not.have.been.called; // jshint ignore:line
        });

        it('should print warning message to user in case of reaching the limit of step', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 10001;
            containerLogger._logMessageToFirebase('message');
            expect(pushSpy).to.have.been.calledWith(`\x1B[01;93mLog size exceeded for this step.\nThe step will continue to execute until it finished but new logs will not be stored.\x1B[0m\r\n`); // jshint ignore:line
        });

        it('should print warning message to user in case of reaching the limit of workflow', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return true;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger._logMessageToFirebase('message');
            expect(pushSpy).to.have.been.calledWith(`\x1B[01;93mLog size exceeded for the workflow.\nThe step will continue to execute until it finished but new logs will not be stored.\x1B[0m\r\n`); // jshint ignore:line
        });

        it('should not print the warning message more than once', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return true;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger._logMessageToFirebase('message');
            containerLogger._logMessageToFirebase('message');
            expect(pushSpy).to.have.been.calledOnce; // jshint ignore:line
        });

        it('should print error messages even if reached the limit', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 10001;
            containerLogger._logMessageToFirebase('message');
            containerLogger._logMessageToFirebase('message', true);
            expect(pushSpy).to.have.been.calledTwice; // jshint ignore:line
        });

        it('should emit an event each time a log is registered', () => {
            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger.logSize = 900;
            containerLogger.emit = sinon.spy(containerLogger.emit);
            containerLogger._logMessageToFirebase('message');
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
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger._logMessageToFirebase('message');
            expect(containerLogger.logSize).to.equal(7);
        });

        it('total log size should be updated in firebase', () => {

            const containerId        = 'containerId';
            const containerInterface = {};

            const pushSpy            = sinon.spy();
            const setSpy             = sinon.spy();
            const setLogsSizeSpy     = sinon.spy();
            const firebaseLogger     = {
                push: pushSpy
            };
            const firebaseLastUpdate = {
                set: setSpy
            };
            const firebaseMetricsLogs = {
                child: sinon.spy(() => {
                    return {
                        set: setLogsSizeSpy
                    };
                })
            };
            const loggerStrategy     = LoggerStrategy.LOGS;
            const logSizeLimit           = 1000;
            const isWorkflowLogSizeExceeded = sinon.spy(() => {
                return false;
            });

            const containerLogger = new ContainerLogger({
                containerId,
                containerInterface,
                firebaseLogger,
                firebaseLastUpdate,
                firebaseMetricsLogs,
                loggerStrategy,
                logSizeLimit,
                isWorkflowLogSizeExceeded
            });
            containerLogger._logMessageToFirebase('message');
            expect(setLogsSizeSpy).to.have.been.calledWith(7);
        });
    });


});
