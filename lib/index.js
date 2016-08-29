'use strict';
var Docker   = require('dockerode');
var fs       = require('fs');
var Q        = require('q');
var Firebase = require('firebase');
var logger   = require('cf-logs').Logger("codefresh:containerLogger");
var monitor  = require('cf-monitor');
var domain   = require('domain');
var CFError  = require('cf-errors');

var log = function () {
    var deferred = Q.defer();

    var dockerNode      = {
        ip: process.env.DOCKER_IP,
        port: process.env.DOCKER_PORT,
        certPath: process.env.DOCKER_CERT_PATH
    };
    var containerId     = process.env.CONTAINER_ID;
    var firebaseStepUrl = process.env.FIREBASE_STEP_URL;
    var firebaseSecret  = process.env.FIREBASE_SECRET;

    if (!dockerNode.ip) {
        return Q.reject(new CFError("docker node ip is missing"));
    }
    if (!dockerNode.port) {
        return Q.reject(new CFError("docker node port is missing"));
    }
    if (!dockerNode.certPath) {
        return Q.reject(new CFError("docker nod cert path is missing"));
    }
    if (!containerId) {
        return Q.reject(new CFError("container id is missing"));
    }
    if (!firebaseStepUrl) {
        return Q.reject(new CFError("firebase step url is missing"));
    }
    if (!firebaseSecret) {
        return Q.reject(new CFError("firebase secret is missing"));
    }
    monitor.addCustomParameter("dockerNode", dockerNode);
    monitor.addCustomParameter("containerId", containerId);
    monitor.addCustomParameter("firebaseStepUrl", firebaseStepUrl);

    var docker     = new Docker({
        host: dockerNode.ip,
        port: dockerNode.port,
        protocol: dockerNode.protocol || 'https',
        ca: fs.readFileSync(dockerNode.certPath + "/ca.pem"),
        cert: fs.readFileSync(dockerNode.certPath + "/cert.pem"),
        key: fs.readFileSync(dockerNode.certPath + "/key.pem")
    });
    var stepLogger = new Firebase(firebaseStepUrl);
    stepLogger.authWithCustomToken(firebaseSecret, (err) => {
        if (err) {
            return deferred.resolve(new CFError({
                cause: err,
                message: `Failed to authenticate to firebase`
            }));
        }
        logger.info("Authenticated to firebase step url");

        var container = docker.getContainer(containerId);
        Q.ninvoke(container, 'attach', {
                stream: true,
                stdout: true,
                stderr: true,
                tty: true
            })
            .done((stream) => {
                logger.info("Attached stream to container");
                logger.info("Starting stream 'data' event");
                stream.on('data', function (chunk) {
                    var buf     = new Buffer(chunk);
                    var message = buf.toString('utf8');
                    stepLogger.child("logs").push(message);
                    stepLogger.child("lastUpdate").set(new Date().getTime());
                });
            }, (err) => {
                return Q.reject(new CFError({
                    cause: err,
                    message: `Failed to get a stream to container:${containerId}`,
                    containerId: containerId
                }));
            });

        Q.ninvoke(container, 'wait')
            .then((exitStatus) => {
                logger.info(`Container:${containerId} finished its execution with status:${exitStatus.StatusCode}`);
                deferred.resolve();
            });
    });

    return deferred.promise;
};

monitor.createBackgroundTransaction("containerLogger", "containerLogger", () => {
    var d = domain.create();
    d.on('error', (err) => {
        logger.error(err.stack);
        monitor.noticeError(err);
        monitor.endTransaction();
        logger.info("Exiting");
        process.exit(1);
    });
    d.run(() => {
        log()
            .catch((err) => {
                logger.error(err.stack);
                monitor.noticeError(err);
                return Q.reject(err);
            })
            .finally(() => {
                logger.info("Exiting");
                monitor.endTransaction();
            })
            .done(() => {
                process.exit();
            }, () => {
                process.exit(1);
            });
    });

})();
