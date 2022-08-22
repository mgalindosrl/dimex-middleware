const {
    APP_NAME,
    NODE_ENV
} = require('../config/config')

const opts = {
    logDirectory: './logs',
    fileNamePattern: APP_NAME + '_<DATE>.log',
    dateFormat: 'YYYY_MM_DD'
};

const log = require('simple-node-logger').createRollingFileLogger(opts);

if (NODE_ENV == 'development') {
    log.setLevel('debug');
} else {
    log.setLevel('info');
}

var All = (text) => {
    log.all(text);
}

var Trace = (text) => {
    log.trace(text);
}

var Debug = (text) => {
    log.debug(text);
    console.log(text);
}

var Info = (text) => {
    log.info(text);
    console.log(text);
}

var Warn = (text) => {
    log.warn(text);
}

var Error = (text) => {
    log.error(text);
    console.log(text);
}

var Fatal = (text) => {
    log.fatal(text);
}

module.exports = {
    All: All,
    Trace: Trace,
    Debug: Debug,
    Info: Info,
    Warn: Warn,
    Error: Error,
    Fatal: Fatal
}