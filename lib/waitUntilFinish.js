
const fs = require('fs');
const path = require('path');
const Q = require('q');

class Waiter {

    constructor(timeout, filepath, lastLogsDate) {
        this.timeout = timeout;
        this.filepath = filepath;
        this.lastLogsDate = lastLogsDate;
        this.finished = false;
    }

    _stateListener() {
        const state = JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
        this.lastLogsDate = state.lastLogsDate;
    }


    _finishOnTimeout() {
        const diff = Date.now() - this.lastLogsDate;

        const date = new Date(this.lastLogsDate);
        console.log('Last logs date:', date);
        console.log('Current date:', new Date());

        if (diff > this.timeout) {
            console.log(`Logs haven't been written for the last ${this.timeout} millis. Finishing waiter...`);
            this._unwatchState();
            this.finished = true;
            this.deferred.resolve();
        }
    }

    _checkTimeout() {
        this._finishOnTimeout();
        if (!this.finished) {
            setTimeout(this._checkTimeout.bind(this), 100);
        }
    }

    run() {
        this.deferred = Q.defer();
        console.log(`Logs waiting timeout: ${this.timeout} millis`);
        this._checkTimeout();
        this._watchState();

        return this.deferred.promise;
    }

    _watchState() {
        fs.watchFile(this.filepath, { persistent: false, interval: 100 }, this._stateListener.bind(this));
    }

    _unwatchState() {
        fs.unwatchFile(this.filepath);
    }

    static wait(timeout, filepath) {
        const state = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        return new Waiter(timeout, filepath, state.lastLogsDate).run();
    }
}

if (require.main === module) {
    const timeout = Number.parseInt(process.argv[process.argv.length - 1]);
    const filepath = path.resolve(__dirname, 'state.json');
    Waiter.wait(timeout, filepath);
} else {
    module.exports = Waiter;
}
