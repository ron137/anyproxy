'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var color = require("colorful");
var util_1 = require("./util");
var ifPrint = true;
var logLevel = 0;
var LogLevelMap;
(function (LogLevelMap) {
    LogLevelMap[LogLevelMap["tip"] = 0] = "tip";
    LogLevelMap[LogLevelMap["system_error"] = 1] = "system_error";
    LogLevelMap[LogLevelMap["error"] = 1] = "error";
    LogLevelMap[LogLevelMap["rule_error"] = 2] = "rule_error";
    LogLevelMap[LogLevelMap["warn"] = 3] = "warn";
    LogLevelMap[LogLevelMap["debug"] = 4] = "debug";
})(LogLevelMap || (LogLevelMap = {}));
;
function setPrintStatus(status) {
    ifPrint = !!status;
}
function setLogLevel(level) {
    logLevel = parseInt(level, 10);
}
function printLog(content, type) {
    if (!ifPrint) {
        return;
    }
    var timeString = util_1.default.formatDate(new Date(), 'YYYY-MM-DD hh:mm:ss');
    switch (type) {
        case LogLevelMap.tip: {
            if (logLevel > 0) {
                return;
            }
            console.log(color.cyan("[AnyProxy Log][" + timeString + "]: " + content));
            break;
        }
        case LogLevelMap.system_error: {
            if (logLevel > 1) {
                return;
            }
            console.error(color.red("[AnyProxy ERROR][" + timeString + "]: " + content));
            break;
        }
        case LogLevelMap.rule_error: {
            if (logLevel > 2) {
                return;
            }
            console.error(color.red("[AnyProxy RULE_ERROR][" + timeString + "]: " + content));
            break;
        }
        case LogLevelMap.warn: {
            if (logLevel > 3) {
                return;
            }
            console.error(color.magenta("[AnyProxy WARN][" + timeString + "]: " + content));
            break;
        }
        case LogLevelMap.debug: {
            console.log(color.cyan("[AnyProxy Log][" + timeString + "]: " + content));
            return;
        }
        default: {
            console.log(color.cyan("[AnyProxy Log][" + timeString + "]: " + content));
            break;
        }
    }
}
module.exports.printLog = printLog;
function debug(content) {
    printLog(content, LogLevelMap.debug);
}
;
function info(content) {
    printLog(content, LogLevelMap.tip);
}
;
function warn(content) {
    printLog(content, LogLevelMap.warn);
}
;
function error(content) {
    printLog(content, LogLevelMap.system_error);
}
;
function ruleError(content) {
    printLog(content, LogLevelMap.rule_error);
}
;
module.exports.setPrintStatus = setPrintStatus;
module.exports.setLogLevel = setLogLevel;
module.exports.T_TIP = LogLevelMap.tip;
module.exports.T_ERR = LogLevelMap.system_error;
module.exports.T_RULE_ERROR = LogLevelMap.rule_error;
module.exports.T_WARN = LogLevelMap.warn;
module.exports.T_DEBUG = LogLevelMap.debug;
var LogUtil = {
    setPrintStatus: setPrintStatus,
    setLogLevel: setLogLevel,
    printLog: printLog,
    debug: debug,
    info: info,
    warn: warn,
    error: error,
    ruleError: ruleError,
    T_TIP: LogLevelMap.tip,
    T_ERR: LogLevelMap.error,
    T_RULE_ERROR: LogLevelMap.rule_error,
    T_WARN: LogLevelMap.warn,
    T_DEBUG: LogLevelMap.debug
};
exports.default = LogUtil;
module.exports = LogUtil;
