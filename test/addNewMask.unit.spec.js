/* jshint ignore:start */

'use strict';
const Q = require('q');

const chai       = require('chai');
const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');
const proxyquire = require('proxyquire').noCallThru();
chai.use(sinonChai);

const originalProcessExit = process.exit;

describe('addNewMask', () => {
    before(() => {
        process.exit = sinon.spy();
    });

    beforeEach(() => {
        process.exit.resetHistory();
    });

    after(() => {
        process.exit = originalProcessExit;
    });

    describe('positive', () => {
        it('should send a request to add a secret', async () => {
            const rpSpy = sinon.spy(() => Q.resolve({ statusCode: 201 }));
            const addNewMask = proxyquire('../lib/addNewMask', {
                'request-promise': rpSpy
            });

            process.env.PORT = 1337;
            process.env.HOST = '127.0.0.1';
    
            const secret = {
                key: '123',
                value: 'ABC',
            };

            addNewMask(secret);
    
            expect(rpSpy).to.have.been.calledOnceWith({
                uri: `http://127.0.0.1:1337/secrets`,
                method: 'POST',
                json: true,
                body: secret,
                resolveWithFullResponse: true,
            });
            await Q.delay(10);
            expect(process.exit).to.have.been.calledOnceWith(0);
        });
    });

    describe('negative', () => {
        it('should send a request to add a secret', async () => {
            const rpSpy = sinon.spy(() => Q.reject('could not send request'));
            const addNewMask = proxyquire('../lib/addNewMask', {
                'request-promise': rpSpy
            });

            process.env.PORT = 1337;
            process.env.HOST = '127.0.0.1';
    
            const secret = {
                key: '123',
                value: 'ABC',
            };

            addNewMask(secret);
            await Q.delay(10);
            expect(process.exit).to.have.been.calledOnceWith(1);
        });
    });
});

