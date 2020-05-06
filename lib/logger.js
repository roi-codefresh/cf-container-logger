'use strict';

const fs                      = require('fs');
const { EventEmitter }        = require('events');
const _                       = require('lodash');
const Q                       = require('q');
const Docker                  = require('dockerode');
const DockerEvents            = require('docker-events');
const CFError                 = require('cf-errors');
const logger                  = require('cf-logs').Logger('codefresh:containerLogger');
const ContainerStatus         = require('./enums').ContainerStatus;
const LoggerStrategy          = require('./enums').LoggerStrategy;
const ContainerHandlingStatus = require('./enums').ContainerHandlingStatus;
const ContainerLogger         = require('./ContainerLogger');
const { TaskLogger }          = require('@codefresh-io/task-logger');
const express                 = require('express');

const initialState = { pid: process.pid, status: 'init', lastLogsDate: new Date() , failedHealthChecks: [] , restartCounter: 0, containers: {} };
class Logger {

    constructor({
        loggerId,
        taskLoggerConfig,
        findExistingContainers,
        logSizeLimit,
        buildFinishedPromise,
        showProgress,
    }) {
        this.taskLoggerConfig       = taskLoggerConfig;
        this.loggerId               = loggerId;
        this.findExistingContainers = findExistingContainers === 'true';
        this.logSizeLimit           = logSizeLimit;
        this.containerLoggers       = [];
        this.logSize                = 0;
        this.taskLogger             = undefined;
        this.buildFinishedPromise = buildFinishedPromise || Q.resolve();
        this.finishedContainers = 0;
        this.finishedContainersEmitter = new EventEmitter();
        this.showProgress = showProgress;

        let dockerSockPath;
        if (fs.existsSync('/var/run/codefresh/docker.sock')) {
            dockerSockPath = '/var/run/codefresh/docker.sock';
            //console.log('Using /var/run/codefresh/docker.sock');
        } else {
            dockerSockPath = '/var/run/docker.sock';
            //console.log('Using /var/run/docker.sock');
        }

        this.docker                 = new Docker({
            socketPath: dockerSockPath,
        });
        this._readState();
        this._handleBuildFinished();
        this._updateStateInterval = setInterval(this._updateStateFile.bind(this), 1000);
    }

    /**
     * validates the passed params of the constructor
     * @returns {*}
     */
    validate() {
        if (!this.taskLoggerConfig) {
            return this._error(new CFError('taskLogger configuration is missing'));
        }
        if (!this.loggerId) {
            return this._error(new CFError('logger id is missing'));
        }
    }

    /**
     * main entry point.
     * will attach it self to all created containers that their ids in their labels equals loggerId
     * will attach it self to all existing containers if requested
     * the container label should be 'io.codefresh.loggerId'
     */
    start() {

        logger.info(`Logging container created for logger id: ${this.loggerId}`);

        TaskLogger(this.taskLoggerConfig.task, this.taskLoggerConfig.opts)
            .then((taskLogger) => {
                this.taskLogger = taskLogger;
                taskLogger.on('error', (err) => {
                    logger.error(err.stack);
                });
                taskLogger.startHealthCheck();
                if (taskLogger.onHealthCheckReported) {
                    taskLogger.onHealthCheckReported((status) => {
                        if (status.status === 'failed') {
                            this.state.failedHealthChecks.push(status);
                            this.state.status = 'failed';
                        }else {
                            this.state.healthCheckStatus = status; 
                        }
                        
                        this._writeNewState();
                    });
                }
                taskLogger.on('flush', () => {
                    this._updateMissingLogs();
                    this._updateLastLoggingDate();
                });
                this.state.logsStatus = this.taskLogger.getStatus();
                logger.info(`taskLogger successfully created`);
                
                this._listenForNewContainers();

                this.state.status = 'ready';
                this._writeNewState();

                if (this.findExistingContainers) {
                    this._listenForExistingContainers();
                }
            })
            .catch((err) => {
                this._error(new CFError({
                    cause: err,
                    message: `Failed to create taskLogger`
                }));
                return;
            });

        this._listenForEngineUpdates();
    }

    _readState() {
        const filePath = `${__dirname}/state.json`;
        if (fs.existsSync(filePath)) {
            this.state = _.omit(JSON.parse(fs.readFileSync(filePath, 'utf8'), ['containers', 'pid']));
            this.state.containers = {};
            this.state.pid = process.pid;
            let restartCounter =  _.get(this.state, 'restartCounter', 0);
             restartCounter++;
             this.state.restartCounter = restartCounter;
        }else {
            this.state =  initialState;
        }
    }
    /**
     * will print the error and exit the process
     * @param err
     */
    _error(err) {
        logger.error(err.toString());
        process.exit(1);
    }

    /**
     * will write updates about the attached containers and initial state to a file for future read from isReady.sh script
     * @param disableLog
     */
    _writeNewState(disableLog = false) {
        const filePath     = `${__dirname}/state.json`;
        const currentState = JSON.stringify(this.state);
        fs.writeFile(filePath, currentState, (err) => {
            if (err) {
                const error = new CFError({
                    cause: err,
                    message: 'failed to write state to file'
                });
                logger.error(error.toString());
            } else if (!disableLog) {
                logger.info(`State: ${currentState} updated and written to file: ${filePath}`);
            }
        }); 
    }

    logLimitExceeded() {
        // TODO in the future when we allow a workflow to use multuple dinds, this will not be correct
        // we need to get the total size of logs from all dinds
        return this.logSizeLimit && this._getTotalLogSize() > this.logSizeLimit;
    }

    _getTotalLogSize() {
        return _.reduce(this.containerLoggers, (sum, containerLogger) => {
            return sum + containerLogger.logSize;
        }, 0);
    }

    /**
     * receives a container and decides if to start listening on it
     * @param loggerId
     * @param docker
     * @param newContainer
     */
    async _handleContainer(container) { // jshint ignore:line
        const containerId                   = container.Id || container.id;
        const containerStatus               = container.Status || container.status;
        const receivedLoggerId              = _.get(container, 'Labels', _.get(container, 'Actor.Attributes'))['io.codefresh.logger.id'];
        const runCreationLogic              = _.get(container, 'Labels', _.get(container, 'Actor.Attributes'))['io.codefresh.runCreationLogic'];
        const stepName                      = _.get(container, 'Labels', _.get(container, 'Actor.Attributes'))['io.codefresh.logger.stepName'];
        const receivedLogSizeLimit = _.get(container,
            'Labels',
            _.get(container, 'Actor.Attributes'))['io.codefresh.logger.logSizeLimit'];
        const loggerStrategy                = _.get(container, 'Labels', _.get(container, 'Actor.Attributes'))['io.codefresh.logger.strategy'];

        if (!containerId) {
            logger.error(`Not handling container because id is missing`);
            return;
        }

        // Validate that we are not already listening on the container
        if (this._containerHandled(containerId)) {
            logger.info(`Not handling container: ${containerId}, status: '${containerStatus}' because this container was already handled previously`);
            return;
        }

        if (!containerStatus) {
            logger.error(`Not handling container: ${containerId}, because this container status is missing`);
            return;
        }

        if (receivedLoggerId !== this.loggerId) {
            logger.info(`Not handling new container: ${containerId}. loggerId label: ${receivedLoggerId}`);
            return;
        }

        if (!stepName) {
            logger.error(`Container: ${containerId} does not contain a stepName label`);
            return;
        }

        if (!loggerStrategy) {
            logger.error(`Container: ${containerId} does not contain a loggerStrategy label`);
            return;
        }

        if (LoggerStrategy.ALL.indexOf(loggerStrategy) === -1) {
            logger.error(`Container: ${containerId}, loggerStrategy: '${loggerStrategy}' is not supported`);
            return;
        }

        // in case the strategy is LOGS, this means we need to wait for the container to actually start running
        if (containerStatus === ContainerStatus.CREATE && loggerStrategy === LoggerStrategy.LOGS) {
            logger.info(`Not handling container: ${containerId} on '${containerStatus}' status because logging strategy is: ${LoggerStrategy.LOGS} which needs to wait for 'start' status`);
            return;
        }


        this.state.containers[containerId] = { status: ContainerHandlingStatus.INITIALIZING };
        logger.info(`Handling container: ${containerId}, status: '${containerStatus}'`);
        const stepLogger = this.taskLogger.create(stepName, undefined, runCreationLogic);
        logger.info(`Brought step logger for container: ${containerId}`);


        const logSizeLimit = receivedLogSizeLimit ? (parseInt(receivedLogSizeLimit) * 1000000) : undefined;

        const containerInterface = this.docker.getContainer(containerId);
        const containerLogger    = new ContainerLogger({
            containerId,
            containerInterface,
            stepLogger,
            logSizeLimit,
            isWorkflowLogSizeExceeded: this.logLimitExceeded.bind(this),
            loggerStrategy
        });
        this.containerLoggers.push(containerLogger);
        containerLogger.on('message.logged', this._updateTotalLogSize.bind(this));
        containerLogger.once('end', this._handleContainerStreamEnd.bind(this));

        containerLogger.start()
            .done(() => {
                this.state.containers[containerId] = { status: ContainerHandlingStatus.LISTENING };
                this._writeNewState();
            }, (err) => {
                const error = new CFError({
                    cause: err,
                    message: `Failed to start logging for container:${containerId}`,
                    containerId
                });
                logger.error(error.toString());
            });
    }

    _updateMissingLogs() {
        const resolvedCalls = _.get(this, 'state.logsStatus.resolvedCalls', 0);
        const writeCalls = _.get(this, 'state.logsStatus.writeCalls', 0);
        const rejectedCalls = _.get(this, 'state.logsStatus.rejectedCalls', 0);

        _.set(this, 'state.logsStatus.missingLogs', writeCalls - resolvedCalls - rejectedCalls);
    }

    _updateTotalLogSize() {
        this.logSize = this._getTotalLogSize();
        this.taskLogger.setLogSize(this.logSize);
    }

    _updateLastLoggingDate() {
        this.state.lastLogsDate = new Date();
    }

    _updateStateFile() {
        if (this.state.status === 'done') {
            clearInterval(this._updateStateInterval);
        } else {
            this._writeNewState(true);

            if (this.showProgress) {
                logger.debug(`logger progress update: ${JSON.stringify(this.state.logsStatus)}`);
            }
        }
    }

    /**
     * Will check if a container was already handled (no matter what the handling status is)
     * @param containerId
     * @private
     */
    _containerHandled(containerId) {
        return this.state.containers[containerId];
    }

    /**
     * will listen for all new containers
     */
    _listenForNewContainers() {
        const emitter = new DockerEvents({
            docker: this.docker
        });
        emitter.start();
        emitter.on('create', this._handleContainer.bind(this));
        emitter.on('start', this._handleContainer.bind(this));

        logger.info(`Started listening for new containers`);
    }

    /**
     * will listen on all existing containers
     */
    _listenForExistingContainers() {
        logger.info(`Finding existing containers to listen on`);
        this.docker.listContainers((err, containers) => {
            if (err) {
                this._error(new CFError({
                    cause: err,
                    message: `Query of existing containers failed`
                }));
            } else {
                _.forEach(containers, this._handleContainer.bind(this));
            }
        });
    }

    _listenForEngineUpdates() {
        const app = express();
        this._app = app;
        const port = process.env.PORT || 8080;
        const host = process.env.HOST || 'localhost';

        app.use(require('body-parser').json());

        app.post('/secrets', (req, res) => {
            try {
                const secret = req.body;
                logger.info(`got request to add new mask: ${JSON.stringify(secret)}`);

                // secret must have { key, value } structure
                this.taskLogger.addNewMask(secret);
                res.status(201).end('secret added');
            } catch (err) {
                logger.info(`could not create new mask due to error: ${err}`);
                res.status(400).end(err);
            }
        });

        app.listen(port, host, () => {
            logger.info(`listening for engine updates on ${host}:${port}`);
        });
    }

    _handleContainerStreamEnd() {
        this.finishedContainers++;
        this.finishedContainersEmitter.emit('end');
    }

    // do not call before build is finished
    _awaitAllStreamsClosed() {
        const deferred = Q.defer();
        this._checkAllStreamsClosed(deferred);
        this.finishedContainersEmitter.on('end', this._checkAllStreamsClosed.bind(this, deferred));
        return deferred.promise;
    }

    _checkAllStreamsClosed(deferred) {
        if (this.finishedContainers === this.containerLoggers.length) {
            deferred.resolve();
        }
    }

    _handleBuildFinished() {
        this.buildFinishedPromise
            .then(() => {
                logger.info('=== build is finished ===');
                return this._awaitAllStreamsClosed();
            })
            .then(() => {
                logger.info('=== all streams have been closed ===');
                return this.taskLogger.awaitLogsFlushed();
            })
            .then(() => {
                logger.info('=== All logs flushed. Container logger finished. ===');
                this.state.logsStatus = this.taskLogger.getStatus();
                this.state.status = 'done';
                this._writeNewState();
            });
    }
}

module.exports = Logger;
