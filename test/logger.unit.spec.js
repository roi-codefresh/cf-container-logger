'use strict';

const Q          = require('q');
const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');
const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');
chai.use(sinonChai);
const ContainerStatus = require('../lib/enums').ContainerStatus;
const LoggerStrategy  = require('../lib/enums').LoggerStrategy;


describe('Logger tests', () => {

    let processExit;

    before(() => {
        processExit = process.exit;
    });

    after(() => {
        process.exit = processExit;
    });

    describe('start', () => {

        describe('positive', () => {

            it('should start and not listen for existing container in case findExistingContainers param is false', () => {

                const authWithCustomTokenSpy = sinon.spy((secret, callback) => { // jshint ignore:line
                    expect(secret).to.equal('firebaseSecret');
                    callback();
                });

                const Logger = proxyquire('../lib/logger', {
                    'firebase': function (authUrl) {
                        expect(authUrl).to.equal('firebaseAuthUrl');
                        return {
                            authWithCustomToken: authWithCustomTokenSpy,
                            child(child) {
                                if (child === 'logs') {
                                    return {
                                        push: sinon.spy()
                                    };
                                } else if (child === 'lastUpdate') {
                                    return {
                                        set: sinon.spy()
                                    };
                                }
                            }
                        };
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;

                const logger                          = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                logger._listenForNewContainers      = sinon.spy();
                logger._writeNewState               = sinon.spy();
                logger._listenForExistingContainers = sinon.spy();
                logger.start();
                expect(logger._listenForNewContainers).to.have.been.calledOnce; // jshint ignore:line
                expect(logger._writeNewState).to.have.been.calledOnce; // jshint ignore:line
                expect(logger._listenForExistingContainers).to.not.have.been.called; // jshint ignore:line

            });

            it('should start and listen for existing container in case findExistingContainers param is "true"', () => {

                const authWithCustomTokenSpy = sinon.spy((secret, callback) => { // jshint ignore:line
                    expect(secret).to.equal('firebaseSecret');
                    callback();
                });

                const Logger = proxyquire('../lib/logger', {
                    'firebase': function (authUrl) {
                        expect(authUrl).to.equal('firebaseAuthUrl');
                        return {
                            authWithCustomToken: authWithCustomTokenSpy,
                            child(child) {
                                if (child === 'logs') {
                                    return {
                                        push: sinon.spy()
                                    };
                                } else if (child === 'lastUpdate') {
                                    return {
                                        set: sinon.spy()
                                    };
                                }
                            }
                        };
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = 'true';

                const logger                          = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                logger._listenForNewContainers      = sinon.spy();
                logger._writeNewState               = sinon.spy();
                logger._listenForExistingContainers = sinon.spy();
                logger.start();
                expect(logger._listenForNewContainers).to.have.been.calledOnce; // jshint ignore:line
                expect(logger._writeNewState).to.have.been.calledOnce; // jshint ignore:line
                expect(logger._listenForExistingContainers).to.have.been.calledOnce; // jshint ignore:line

            });

        });

        describe('negative', () => {

            it('should call process exit in case authentication against firebase failed', (done) => {
                const processExitSpy = sinon.spy((exitCode) => {
                    expect(exitCode).to.equal(1);
                    done();
                });
                process.exit         = processExitSpy;

                const authWithCustomTokenSpy = sinon.spy((secret, callback) => { // jshint ignore:line
                    expect(secret).to.equal('firebaseSecret');
                    callback(new Error('firebase failure'));
                });

                const Logger = proxyquire('../lib/logger', {
                    'firebase': function (authUrl) {
                        expect(authUrl).to.equal('firebaseAuthUrl');
                        return {
                            authWithCustomToken: authWithCustomTokenSpy,
                            child(child) {
                                if (child === 'logs') {
                                    return {
                                        push: sinon.spy()
                                    };
                                } else if (child === 'lastUpdate') {
                                    return {
                                        set: sinon.spy()
                                    };
                                }
                            }
                        };
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;

                const logger = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                logger.start();

            });

        });

    });

    describe('_listenForExistingContainers', () => {

        describe('positive', () => {

            it('should call handlerContainer according to the amount of containers returned', (done) => {
                const listContainersSpy = sinon.spy((callback) => {
                    callback(null, [{}, {}]);
                });

                const Logger = proxyquire('../lib/logger', {
                    'dockerode': function () {
                        return {
                            listContainers: listContainersSpy
                        };
                    }
                });

                const logger            = new Logger();
                logger._handleContainer = sinon.spy();
                logger._listenForExistingContainers();
                setTimeout(() => {
                    expect(logger._handleContainer).to.have.callCount(2);
                    done();
                }, 10);

            });

            it('should not call handleContainer in case of no returned containers', (done) => {
                const listContainersSpy = sinon.spy((callback) => {
                    callback(null, []);
                });

                const Logger = proxyquire('../lib/logger', {
                    'dockerode': function () {
                        return {
                            listContainers: listContainersSpy
                        };
                    }
                });

                const logger            = new Logger();
                logger._handleContainer = sinon.spy();
                logger._listenForExistingContainers();
                setTimeout(() => {
                    expect(logger._handleContainer).to.have.callCount(0);
                    done();
                }, 10);

            });

        });

        describe('negative', () => {

            it('should call _error in case of an error from getting the containers', (done) => {
                const listContainersSpy = sinon.spy((callback) => {
                    callback(new Error('getting containers error'));
                });

                const Logger = proxyquire('../lib/logger', {
                    'dockerode': function () {
                        return {
                            listContainers: listContainersSpy
                        };
                    }
                });

                const logger  = new Logger();
                logger._error = sinon.spy((err) => {
                    expect(err.toString()).to.equal('Error: Query of existing containers failed; caused by Error: getting containers error');
                });
                logger._listenForExistingContainers();
                setTimeout(() => {
                    expect(logger._error).to.have.been.calledOnce; // jshint ignore:line
                    done();
                }, 10);

            });

        });

    });

    describe('_listenForNewContainers', () => {

        it('should call handleContainer in case of an create event', () => {
            const startSpy = sinon.spy();
            const onSpy    = sinon.spy();
            const Logger = proxyquire('../lib/logger', {
                'docker-events': function () {
                    return {
                        start: startSpy,
                        on: onSpy
                    };
                },
                'dockerode': function () {
                    return {};
                }
            });

            const logger = new Logger();
            logger._listenForNewContainers();
            expect(startSpy).to.have.been.calledOnce; // jshint ignore:line
            expect(onSpy.callCount).to.equal(2); // jshint ignore:line
        });

    });

    describe('_writeNewState', () => {

        it('should print a log message if write to file succeeded', () => {
            const writeFileSpy = sinon.spy((filePath, currentState, callback) => {
                callback();
            });

            const Logger = proxyquire('../lib/logger', {
                'fs': {
                    writeFile: writeFileSpy
                }
            });

            const logger = new Logger();
            logger._writeNewState();
            expect(writeFileSpy).to.have.been.calledOnce; // jshint ignore:line
        });

        it('should print an error in case of a write error', () => {
            const writeFileSpy = sinon.spy((filePath, currentState, callback) => {
                callback(new Error('write error'));
            });

            const Logger = proxyquire('../lib/logger', {
                'fs': {
                    writeFile: writeFileSpy
                }
            });

            const logger = new Logger();
            logger._writeNewState();
            expect(writeFileSpy).to.have.been.calledOnce; // jshint ignore:line
        });

    });

    describe('validate', () => {

        it('should call process exit in case firebase authentication url was not provided', () => {
            const Logger = proxyquire('../lib/logger', {});

            const loggerId               = 'loggerId';
            const firebaseAuthUrl        = 'firebaseAuthUrl';
            const firebaseSecret         = 'firebaseSecret';
            const findExistingContainers = false;
            const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
            logger.validate();

        });

        it('should call process exit in case firebase authentication url was not provided', (done) => {
            const processExitSpy = sinon.spy((exitCode) => {
                expect(exitCode).to.equal(1);
                done();
            });
            process.exit         = processExitSpy;

            const Logger = proxyquire('../lib/logger', {});

            const loggerId               = 'loggerId';
            const firebaseAuthUrl        = '';
            const firebaseSecret         = 'firebaseSecret';
            const findExistingContainers = false;
            const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
            logger.validate();

        });

        it('should call process exit in case firebase secret was not provided', (done) => {
            const processExitSpy = sinon.spy((exitCode) => {
                expect(exitCode).to.equal(1);
                done();
            });
            process.exit         = processExitSpy;

            const Logger = proxyquire('../lib/logger', {});

            const loggerId               = 'loggerId';
            const firebaseAuthUrl        = 'firebaseAuthUrl';
            const firebaseSecret         = '';
            const findExistingContainers = false;
            const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
            logger.validate();

        });

        it('should call process exit in case firebase secret was not provided', (done) => {
            const processExitSpy = sinon.spy((exitCode) => {
                expect(exitCode).to.equal(1);
                done();
            });
            process.exit         = processExitSpy;

            const Logger = proxyquire('../lib/logger', {});

            const loggerId               = '';
            const firebaseAuthUrl        = 'firebaseAuthUrl';
            const firebaseSecret         = 'firebaseSecret';
            const findExistingContainers = false;
            const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
            logger.validate();

        });


    });

    describe('handle', () => {

        describe('handle container', () => {

            describe('handle', () => {

                describe('positive', () => {

                    it('valid process', (done) => {
                        const startSpy = sinon.spy(() => {
                            return Q.resolve();
                        });
                        const infoSpy  = sinon.spy();
                        const errorSpy = sinon.spy();
                        const Logger = proxyquire('../lib/logger', {
                            'cf-logs': {
                                Logger: () => {
                                    return {
                                        info: infoSpy,
                                        error: errorSpy
                                    };

                                }
                            },
                            'firebase': function () {
                                return {};
                            },
                            './ContainerLogger': function () {
                                return {
                                    start: startSpy
                                };
                            }
                        });

                        const loggerId               = 'loggerId';
                        const firebaseAuthUrl        = 'firebaseAuthUrl';
                        const firebaseSecret         = 'firebaseSecret';
                        const findExistingContainers = false;
                        const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                        logger._writeNewState = sinon.spy();
                        const container              = {
                            Id: 'containerId',
                            Status: ContainerStatus.CREATE,
                            Labels: {
                                'io.codefresh.loggerId': 'loggerId',
                                'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                                'io.codefresh.loggerStrategy': LoggerStrategy.ATTACH
                            }
                        };
                        logger._handleContainer(container);
                        expect(startSpy).to.have.been.calledOnce; // jshint ignore:line

                        setTimeout(() => {
                            expect(logger._writeNewState).to.have.been.calledOnce; // jshint ignore:line
                            done();
                        }, 10);
                    });

                });

                describe('should print an error in case firebase ref fails', () => {

                    it('error while create firebase ref', () => {
                        const startSpy = sinon.spy(() => {
                            return Q.resolve();
                        });
                        const infoSpy  = sinon.spy();
                        const errorSpy = sinon.spy();
                        const Logger = proxyquire('../lib/logger', {
                            'cf-logs': {
                                Logger: () => {
                                    return {
                                        info: infoSpy,
                                        error: errorSpy
                                    };

                                }
                            },
                            'firebase': function () {
                                throw new Error('firebase error');
                            },
                            './ContainerLogger': function () {
                                return {
                                    start: startSpy
                                };
                            }
                        });

                        const loggerId               = 'loggerId';
                        const firebaseAuthUrl        = 'firebaseAuthUrl';
                        const firebaseSecret         = 'firebaseSecret';
                        const findExistingContainers = false;
                        const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                        logger._writeNewState = sinon.spy();
                        const container              = {
                            Id: 'containerId',
                            Status: ContainerStatus.CREATE,
                            Labels: {
                                'io.codefresh.loggerId': 'loggerId',
                                'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                                'io.codefresh.loggerStrategy': LoggerStrategy.ATTACH
                            }
                        };
                        logger._handleContainer(container);
                        expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                        expect(errorSpy).to.have.been.calledWith('Error: Failed to create a new firebase ref; caused by Error: firebase error'); // jshint ignore:line

                    });

                    it('error while starting the container logger instance', (done) => {
                        const startSpy = sinon.spy(() => {
                            return Q.reject(new Error('ContainerLogger error'));
                        });
                        const infoSpy  = sinon.spy();
                        const errorSpy = sinon.spy();
                        const Logger = proxyquire('../lib/logger', {
                            'cf-logs': {
                                Logger: () => {
                                    return {
                                        info: infoSpy,
                                        error: errorSpy
                                    };

                                }
                            },
                            'firebase': function () {
                                return {};
                            },
                            './ContainerLogger': function () {
                                return {
                                    start: startSpy
                                };
                            }
                        });

                        const loggerId               = 'loggerId';
                        const firebaseAuthUrl        = 'firebaseAuthUrl';
                        const firebaseSecret         = 'firebaseSecret';
                        const findExistingContainers = false;
                        const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                        logger._writeNewState = sinon.spy();
                        const container              = {
                            Id: 'containerId',
                            Status: ContainerStatus.CREATE,
                            Labels: {
                                'io.codefresh.loggerId': 'loggerId',
                                'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                                'io.codefresh.loggerStrategy': LoggerStrategy.ATTACH
                            }
                        };
                        logger._handleContainer(container);

                        setTimeout(() => {
                            expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                            expect(errorSpy).to.have.been.calledWith('Error: Failed to start logging for container:containerId; caused by Error: ContainerLogger error'); // jshint ignore:line
                            done();
                        }, 10);

                    });

                });

            });

        });

        describe('do not handle container because it does not need handling', () => {

            it('was previously handled', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Status: 'start',
                    Labels: {
                        'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                        'io.codefresh.loggerStrategy': LoggerStrategy.LOGS
                    }
                };
                logger._containerHandled   = sinon.spy(() => {
                    return true;
                });
                logger._handleContainer(container);

                expect(infoSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(infoSpy)
                    .to
                    .have
                    .been
                    .calledWith('Not handling container: containerId, status: \'start\' because this container was already handled previously');

            });

            it('no loggerId', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Status: ContainerStatus.CREATE,
                    Labels: {
                        'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                        'io.codefresh.loggerStrategy': LoggerStrategy.LOGS
                    }
                };
                logger._handleContainer(container);
                expect(infoSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(infoSpy).to.have.been.calledWith('Not handling new container: containerId. loggerId label: undefined');

            });
        });

        describe('do not handle container because of missing details (error)', () => {

            it('no containerId', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Status: ContainerStatus.CREATE,
                    Labels: {
                        'io.codefresh.loggerId': 'loggerId',
                        'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                        'io.codefresh.loggerStrategy': LoggerStrategy.LOGS
                    }
                };
                logger._handleContainer(container);
                expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(errorSpy).to.have.been.calledWith('Not handling container because id is missing');

            });

            it('no container status', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Labels: {
                        'io.codefresh.loggerId': 'loggerId',
                        'io.codefresh.loggerFirebaseUrl': 'firebaseUrl',
                        'io.codefresh.loggerStrategy': LoggerStrategy.LOGS
                    }
                };
                logger._handleContainer(container);
                expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(errorSpy).to.have.been.calledWith('Not handling container: containerId, because this container status is missing');

            });

            it('logger id provided but not firebase url', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Status: ContainerStatus.CREATE,
                    Labels: {
                        'io.codefresh.loggerId': 'loggerId',
                        'io.codefresh.loggerStrategy': LoggerStrategy.LOGS
                    }
                };
                logger._handleContainer(container);
                expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(errorSpy).to.have.been.calledWith('Container: containerId does contain a firebaseUrl label');

            });

            it('no strategy provided', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Status: ContainerStatus.CREATE,
                    Labels: {
                        'io.codefresh.loggerId': 'loggerId',
                        'io.codefresh.loggerFirebaseUrl': 'loggerFirebaseUrl'
                    }
                };
                logger._handleContainer(container);
                expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(errorSpy).to.have.been.calledWith('Container: containerId does contain a loggerStrategy label');

            });

            it('provided strategy does not exist', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Status: ContainerStatus.CREATE,
                    Labels: {
                        'io.codefresh.loggerId': 'loggerId',
                        'io.codefresh.loggerFirebaseUrl': 'loggerFirebaseUrl',
                        'io.codefresh.loggerStrategy': 'non-existing-strategy'
                    }
                };
                logger._handleContainer(container);
                expect(errorSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(errorSpy).to.have.been.calledWith('Container: containerId, loggerStrategy: \'non-existing-strategy\' is not supported');

            });

            it('container status is create and strategy is logs', () => {
                const infoSpy  = sinon.spy();
                const errorSpy = sinon.spy();
                const Logger = proxyquire('../lib/logger', {
                    'cf-logs': {
                        Logger: () => {
                            return {
                                info: infoSpy,
                                error: errorSpy
                            };

                        }
                    }
                });

                const loggerId               = 'loggerId';
                const firebaseAuthUrl        = 'firebaseAuthUrl';
                const firebaseSecret         = 'firebaseSecret';
                const findExistingContainers = false;
                const logger                 = new Logger(loggerId, firebaseAuthUrl, firebaseSecret, findExistingContainers);
                const container              = {
                    Id: 'containerId',
                    Status: ContainerStatus.CREATE,
                    Labels: {
                        'io.codefresh.loggerId': 'loggerId',
                        'io.codefresh.loggerFirebaseUrl': 'loggerFirebaseUrl',
                        'io.codefresh.loggerStrategy': LoggerStrategy.LOGS
                    }
                };
                logger._handleContainer(container);
                expect(infoSpy).to.have.been.calledOnce; // jshint ignore:line
                expect(infoSpy)
                    .to
                    .have
                    .been
                    .calledWith(
                        'Not handling container: containerId on \'create\' status because logging strategy is: logs which needs to wait for \'start\' status');

            });

        });

    });

});
