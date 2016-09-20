'use strict';
var Docker       = require('dockerode');
var DockerEvents = require('docker-events');
var fs           = require('fs');
var Q            = require('q');
var Firebase     = require('firebase');
var logger       = require('cf-logs').Logger("codefresh:containerLogger");
var CFError      = require('cf-errors');
var _            = require('lodash');

/**
 * will print the error and exit the process
 * @param err
 */
var error = (err) => {
    logger.error(err.toString());
    process.exit(1);
};

/**
 * will write updates about the attached containers and initial state to a file for future read from isReady.sh script
 * @param state
 */
var writeNewState = (state) => {
    var filePath     = __dirname + "/state.json";
    var currentState = JSON.stringify(state);
    fs.writeFile(filePath, currentState, (err) => {
        if (err) {
            var error = new CFError({
                cause: err,
                message: 'failed to write state to file'
            });
            logger.error(error.toString());
        }
        else {
            logger.info(`State: ${currentState} updated and written to file: ${filePath}`);
        }
    });
};

/**
 * main entry point. will attach it self too all created containers that have the same id as the first param in their labels
 * the container label should be 'io.codefresh.loggerId'
 * the path to write the containers logs will be passed through 'io.codefresh.firebaseUrl' label
 * @param loggerId
 * @param firebaseAuthUrl
 * @param firebaseSecret
 */
var log = (loggerId, firebaseAuthUrl, firebaseSecret) => {

    var state = {status: 'init'};

    if (!firebaseAuthUrl) {
        return error(new CFError("firebase auth url is missing"));
    }
    if (!firebaseSecret) {
        return error(new CFError("firebase secret is missing"));
    }
    if (!loggerId) {
        return error(new CFError("logger id is missing"));
    }

    logger.info(`Logging container created for logger id: ${loggerId}`);

    var docker = new Docker();

    var authRef = new Firebase(firebaseAuthUrl);
    authRef.authWithCustomToken(firebaseSecret, (err) => {
        if (err) {
            error(new CFError({
                cause: err,
                message: `Failed to authenticate to firebase url ${firebaseAuthUrl}`
            }));
            return;
        }
        logger.info(`Authenticated to firebase url: ${firebaseAuthUrl}`);

        var emitter = new DockerEvents({
            docker: docker
        });
        emitter.start();
        emitter.on("create", function (newContainer) {
            let receivedLoggerId    = _.get(newContainer, "Actor.Attributes")["io.codefresh.loggerId"];
            let receivedFirebaseUrl = _.get(newContainer, "Actor.Attributes")["io.codefresh.firebaseUrl"];
            let containerId         = newContainer.id;
            let containerLogger;

            if (receivedLoggerId === loggerId) {
                logger.info(`Handling new container: ${containerId}`);
                if (!receivedFirebaseUrl) {
                    logger.warn(`Container: ${containerId} does contain a firebaseUrl label. skipping`);
                    return;
                }
                try {
                    containerLogger = new Firebase(receivedFirebaseUrl);
                }
                catch (err) {
                    var error = new CFError({
                        cause: err,
                        message: `Failed to create a new firebase ref`
                    });
                    logger.error(error.toString());
                    return;
                }

                var container = docker.getContainer(containerId);
                Q.ninvoke(container, 'attach', {
                        stream: true,
                        stdout: true,
                        stderr: true,
                        tty: true
                    })
                    .done((stream) => {
                        logger.info(`Attached stream to container: ${containerId}`);
                        stream.on('data', function (chunk) {
                            var buf     = new Buffer(chunk);
                            var message = buf.toString('utf8');
                            containerLogger.child("logs").push(message);
                            containerLogger.child("lastUpdate").set(new Date().getTime());
                        });
                        logger.info(`Listening on stream 'data' event for container: ${containerId}`);
                        stream.on('end', function () {
                            logger.info(`stream end event was fired for container: ${containerId}`);
                        });
                        state[containerId] = {status: "created"};
                        writeNewState(state);
                    }, (err) => {
                        var error = new CFError({
                            cause: err,
                            message: `Failed to get a stream to container:${containerId}`,
                            containerId: containerId
                        });
                        logger.error(error.toString());
                    });
            }
            else {
                logger.info(`Not handling new container: ${containerId}. loggerId label: ${receivedLoggerId}`);
            }
        });

        logger.info(`Started listening for new containers`);
        state.status = "ready";
        writeNewState(state);
    });

};

module.exports = log;