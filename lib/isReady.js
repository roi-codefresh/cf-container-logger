const { readFileSync } = require('fs');
const _ = require('lodash');
const { ContainerHandlingStatus } = require('./enums');

function isContainerReady(state, containerId) {
    console.log(`checking if container ${containerId} is ready`);
    const containerState = _.get(state, `containers[${containerId}]`, {});
    const isReady = [
        ContainerHandlingStatus.LISTENING,
        ContainerHandlingStatus.WAITING_FOR_START,
        ContainerHandlingStatus.FINISHED,
    ].includes(containerState.status);
    console.log(`container ${containerId} is: ${isReady ? 'READY' : 'NOT READY'}`);
    return isReady;
}

function isContainerLoggerReady(state) {
    console.log(`checking if container logger is ready`);
    const isReady = state.status === 'ready';
    console.log(`container logger is: ${isReady ? 'READY' : 'NOT READY'}`);
    return isReady;
}

(() => {
    const containerId = process.argv[2];
    const state = JSON.parse(readFileSync('./lib/state.json').toString('utf-8'));
    let isReady = false;
    if (containerId) {
        isReady = isContainerReady(state, containerId);
    } else {
        isReady = isContainerLoggerReady(state);
    }

    process.exit(isReady ? 0 : 1);
})();
