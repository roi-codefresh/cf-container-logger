/* jshint ignore:start */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const Q = require('q');

const chai       = require('chai');
const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');
chai.use(sinonChai);

const Waiter = require('../lib/waitUntilFinish');
sinon.spy(Waiter.prototype, '_checkFinished');
const originalProcessKill = process.kill;
process.kill = pid => pid;
sinon.spy(process, 'kill');

const statePath = path.resolve(os.tmpdir(), 'state.json');
const writeDate = (date = Date.now(), status, pid = 1111) => {
    console.log(new Date(date));
    fs.writeFileSync(statePath, JSON.stringify({ pid, status, lastLogsDate: date }));
};


describe('waitUntilFinish script test', function () {
    this.timeout(8000);

    beforeEach(() => {
        writeDate();
        Waiter.prototype._checkFinished.resetHistory();
        process.kill.resetHistory();
    });

    after(() => {
        process.kill = originalProcessKill;
    });

    it('should finish immediately if now - status is done when starting', async () => {
        writeDate(undefined, 'done');
        await Waiter.wait(statePath);
        expect(Waiter.prototype._checkFinished).to.have.been.calledOnce;
    });

    it('should send SIGUSR2 to container logger process', async () => {
        writeDate(undefined, 'done', 1111);
        await Waiter.wait(statePath);
        expect(process.kill).to.have.been.calledOnceWith(1111, 'SIGUSR2');
    });

    it('should watch file and finish if status is set to done', async () => {
        writeDate(Date.now() - 2000, 'ready');
        const waitPromise = Waiter.wait(statePath);
        await Q.delay(300);
        writeDate(Date.now(), 'ready');
        await Q.delay(300);
        writeDate(Date.now(), 'done');
        await waitPromise;
        expect(Waiter.prototype._checkFinished.getCalls()).to.have.lengthOf(3);        
    });
});
