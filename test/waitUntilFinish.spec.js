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
sinon.spy(Waiter.prototype, '_finishOnTimeout');
sinon.spy(Waiter.prototype, '_checkTimeout');

const statePath = path.resolve(os.tmpdir(), 'state.json');
const writeDate = (date = Date.now()) => {
    console.log(new Date(date));
    fs.writeFileSync(statePath, JSON.stringify({ lastLogsDate: date }));
};


describe('waitUntilFinish script test', () => {
    beforeEach(() => {
        writeDate();
        Waiter.prototype._finishOnTimeout.resetHistory();
        Waiter.prototype._checkTimeout.resetHistory();
    });

    it('should finish immediately if now - lastLogsDate > timeout', async () => {
        writeDate(Date.now() - 2000);
        await Waiter.wait(1000, statePath);
        expect(Waiter.prototype._finishOnTimeout).to.have.been.calledOnce;
        expect(Waiter.prototype._checkTimeout).to.have.been.calledOnce;
    });

    it('should wait until now - lastLogsDate > timeout', async () => {
        await Waiter.wait(1000, statePath);
        expect(Waiter.prototype._finishOnTimeout.getCalls().length).to.be.approximately(11, 1);
        expect(Waiter.prototype._checkTimeout.getCalls().length).to.be.approximately(11, 1);
    });

    it('should wait until now - lastLogsDate > timeout in case when lastLogsDate was updated', async () => {
        const promise = Waiter.wait(1000, statePath);
        await Q.delay(500);
        writeDate();
        await promise;
        expect(Waiter.prototype._finishOnTimeout.getCalls().length).to.be.approximately(15, 1);
        expect(Waiter.prototype._checkTimeout.getCalls().length).to.be.approximately(15, 1);
    });
});
