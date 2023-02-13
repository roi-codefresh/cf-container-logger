const ContainerStatus = {
    CREATE: 'create'
};
const LoggerStrategy = {
    ATTACH: 'attach',
    LOGS: 'logs',
    ALL: ['attach', 'logs']
};
const ContainerHandlingStatus = {
    INITIALIZING: 'initializing',
    LISTENING: 'listening',
    WAITING_FOR_START: 'waitingForStart',
    FINISHED: 'finished',
};

const BuildFinishedSignalFilename = 'build_finished';

module.exports = {
    ContainerStatus,
    LoggerStrategy,
    ContainerHandlingStatus,
    BuildFinishedSignalFilename,
};
