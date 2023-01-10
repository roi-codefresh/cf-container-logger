const fs = require('fs');
const path = require('path');
const Q = require('q');
const { BuildFinishedSignalFilename } = require('./enums');

class Waiter {

    constructor(filepath, state) {
        this.filepath = filepath;
        this.state = state;
        this.finished = false;
    }

    _stateListener() {
        Waiter._retryGetState(this.filepath, 1, 5)
            .then((state) => {
                this.state = state;
                this._checkFinished();
            })
            .catch(() => {
                console.error('cannot update state');
            });
    }

    _checkFinished() {
        if (this.state.status === 'done') {
            console.log(`Task logger has flushed all logs. Finishing waiter...`);
            this._unwatchState();
            this.finished = true;
            clearInterval(this.sigInterval);
            this.deferred.resolve();
        }
    }

    run() {
        this.deferred = Q.defer();
        this.sigInterval = setInterval(this._signalBuildFinished.bind(this), 10000);
        this._signalBuildFinished();
        this._watchState();
        this._stateListener();

        return this.deferred.promise;
    }

    _signalBuildFinished() {
        console.log(`Creating file '${BuildFinishedSignalFilename}' to signal that build is finished`);
        fs.writeFileSync(path.resolve(__dirname, BuildFinishedSignalFilename), 'build is finished');
    }

    _watchState() {
        fs.watchFile(this.filepath, { persistent: false, interval: 100 }, this._stateListener.bind(this));
    }

    _unwatchState() {
        fs.unwatchFile(this.filepath);
    }

    static _retryGetState(filePath, tryNum, maxTries) {
        let fileContents;
        try {
            fileContents = fs.readFileSync(filePath, 'utf8');
            return Q.resolve(JSON.parse(fileContents));
        } catch (err) {
            console.error(`failed to parse json: "${fileContents}" cause: ${err}`);
            if (tryNum < maxTries) {
                return Q.delay(500).then(() => {
                    return Waiter._retryGetState(filePath, tryNum + 1, maxTries);
                });
            }
            return Q.reject(err);
        }
    }

    static wait(filepath) {
        return Waiter._retryGetState(filepath, 1, 5)
            .then((state) => {
                return new Waiter(filepath, state).run();
            });
    }
}

if (require.main === module) {
    const filepath = path.resolve(__dirname, 'state.json');
    Waiter.wait(filepath);
} else {
    module.exports = Waiter;
}
