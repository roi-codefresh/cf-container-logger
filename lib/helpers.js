const Q = require('q');
const { stat } = require('fs/promises');
const path = require('path');
const logger = require('cf-logs').Logger('codefresh:containerLogger');
const { BuildFinishedSignalFilename } = require('./enums');

const checkFileInterval = 1000;

function _watchForBuildFinishedSignal(deferred) {
    setTimeout(async () => {
        let fileExists = false;
        try {
            fileExists = await stat(path.resolve(__dirname, BuildFinishedSignalFilename));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error(`Failed to check if file: '${BuildFinishedSignalFilename}' exists because: ${error.toString()}`);
            }
        }

        if (fileExists) {
            console.log(`FOUND FILE '${BuildFinishedSignalFilename}' --- engine signaling build is finished`);
            return deferred.resolve();
        }

        return _watchForBuildFinishedSignal(deferred);
    }, checkFileInterval);
}

function watchForBuildFinishedSignal() {
    const deferred = Q.defer();

    _watchForBuildFinishedSignal(deferred);

    return deferred.promise;
}

module.exports = {
    watchForBuildFinishedSignal,
};
