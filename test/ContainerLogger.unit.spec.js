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

            it('should separate the stdout from stderr', () => {
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
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger                 = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                containerLogger._logMessageToFirebase = sinon.spy();
                return containerLogger.start();
            });
            
            it('should handle a send message from stderr as error', () => {
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

                const containerLogger                 = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                containerLogger._logMessageToFirebase = sinon.spy();
                return containerLogger.start()
                    .then(() => {
                        expect(containerLogger._logMessageToFirebase).to.have.been.calledWith('message', false); // jshint ignore:line
                        expect(containerLogger._logMessageToFirebase).to.have.been.calledWith('error', true); // jshint ignore:line
                    });
            });

            it('should handle a received message on data stream event in case tty is true', () => {
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
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger                 = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                containerLogger._logMessageToFirebase = sinon.spy();
                return containerLogger.start()
                    .then(() => {
                        expect(receivedStdoutEvent).to.equal('data');
                        expect(receivedStderrEvent).to.equal('data');
                        expect(containerLogger._logMessageToFirebase).to.have.been.calledTwice; // jshint ignore:line
                    });
            });

            it('should handle a received message on readable stream event in case tty is false',
                () => {
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
                    const loggerStrategy     = LoggerStrategy.LOGS;

                    const containerLogger                 = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                    containerLogger._logMessageToFirebase = sinon.spy();
                    return containerLogger.start();
                });

        });

        describe('negative', () => {

            it('should fail in case the provided strategy is not supported', () => {
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
                const loggerStrategy     = 'non-existing-strategy';

                const containerLogger = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                return containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        expect(err.toString())
                            .to
                            .contain('Strategy: non-existing-strategy is not supported');
                    });
            });

            it('should fail in case inspect of the container failes', () => {
                const containerId        = 'containerId';
                const containerInterface = {
                    inspect: (callback) => {
                        callback(new Error('inspect error'));
                    }
                };
                const firebaseLogger     = {};
                const firebaseLastUpdate = {};
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                return containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        expect(err.toString()).to.contain('inspect error');
                    });
            });

            it('should fail in case strategy is attach and attach failed', () => {
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
                const loggerStrategy     = LoggerStrategy.ATTACH;

                const containerLogger = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                return containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        receivedAttachOptions.forEach((options) => {
                            expect(options.stdout ^ options.stderr).to.equal(1);
                            expect(options.stream).to.equal(true);
                            expect(options.tty).to.equal(true);
                        });
                        expect(err.toString()).to.contain('attach error');
                    });
            });

            it('should fail in case strategy is logs and logs failed', () => {
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
                const loggerStrategy     = LoggerStrategy.LOGS;

                const containerLogger = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
                return containerLogger.start()
                    .then(() => {
                        return Q.reject(new Error('should have failed'));
                    }, (err) => {
                        receivedLogsOptions.forEach((options) => {
                            expect(options.stdout ^ options.stderr).to.equal(1);
                            expect(options.follow).to.equal(1);
                        });
                        expect(err.toString()).to.contain('logs error');
                    });
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
            const loggerStrategy     = LoggerStrategy.LOGS;

            const containerLogger = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
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
            const loggerStrategy     = LoggerStrategy.LOGS;

            const containerLogger = new ContainerLogger(containerId, containerInterface, firebaseLogger, firebaseLastUpdate, loggerStrategy);
            containerLogger._logMessageToFirebase('message', true);
            expect(pushSpy).to.have.been.calledOnce; // jshint ignore:line
            expect(pushSpy).to.have.been.calledWith('\x1B[31mmessage\x1B[0m'); // jshint ignore:line
            expect(setSpy).to.have.been.calledOnce; // jshint ignore:line
        });

    });


});
