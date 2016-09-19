'use strict';
var Docker       = require('dockerode');
var DockerEvents = require('docker-events');
var Q            = require('q');
var Firebase     = require('firebase');
var logger       = require('cf-logs').Logger("codefresh:containerLogger");
var CFError      = require('cf-errors');
var _            = require('lodash');

var error = (err) => {
    logger.error(err.toString());
    process.exit(1);
};

var log = function () {

    var loggerId        = process.env.LOGGER_ID;
    var firebaseAuthUrl = process.env.FIREBASE_AUTH_URL;
    var firebaseSecret  = process.env.FIREBASE_SECRET;

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
        }
        logger.info(`Authenticated to firebase url: ${firebaseAuthUrl}`);

        var emitter = new DockerEvents({
            docker: docker
        });
        emitter.start();
        emitter.on("create", function (newContainer) {
            let receivedLoggerId    = _.get(newContainer, "Actor.Attributes.loggerId");
            let receivedFirebaseUrl = _.get(newContainer, "Actor.Attributes.firebaseUrl");
            let containerId         = newContainer.id;
            let containerLogger;

            if (receivedLoggerId === loggerId) {
                logger.info(`Handling new container: ${containerId}`);
                if (!receivedFirebaseUrl) {
                    logger.warn(`Container: ${containerId} does contain a firebaseUrl label. skipping.`);
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
                        logger.info("Listening on stream 'data' event");
                        stream.on('end', function () {
                            logger.info(`stream end event was fired for container: ${containerId}`);
                        });
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
    });

};

module.exports = log;