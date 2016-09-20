'use strict';

var logger = require('./logger');
logger(process.env.LOGGER_ID, process.env.FIREBASE_AUTH_URL, process.env.FIREBASE_SECRET);