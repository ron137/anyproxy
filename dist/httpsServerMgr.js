'use strict';
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
//manage https servers
var async = require('async'), https = require('https'), tls = require('tls'), crypto = require('crypto'), color = require('colorful'), certMgr = require('./certMgr'), logUtil = require('./log'), util = require('./util'), wsServerMgr = require('./wsServerMgr'), co = require('co'), constants = require('constants'), asyncTask = require('async-task-mgr');
var createSecureContext = tls.createSecureContext || crypto.createSecureContext;
//using sni to avoid multiple ports
function SNIPrepareCert(serverName, SNICallback) {
    var keyContent, crtContent, ctx;
    async.series([
        function (callback) {
            certMgr.getCertificate(serverName, function (err, key, crt) {
                if (err) {
                    callback(err);
                }
                else {
                    keyContent = key;
                    crtContent = crt;
                    callback();
                }
            });
        },
        function (callback) {
            try {
                ctx = createSecureContext({
                    key: keyContent,
                    cert: crtContent
                });
                callback();
            }
            catch (e) {
                callback(e);
            }
        }
    ], function (err) {
        if (!err) {
            var tipText = 'proxy server for __NAME established'.replace('__NAME', serverName);
            logUtil.printLog(color.yellow(color.bold('[internal https]')) + color.yellow(tipText));
            SNICallback(null, ctx);
        }
        else {
            logUtil.printLog('err occurred when prepare certs for SNI - ' + err, logUtil.T_ERR);
            logUtil.printLog('err occurred when prepare certs for SNI - ' + err.stack, logUtil.T_ERR);
        }
    });
}
//config.port - port to start https server
//config.handler - request handler
/**
 * Create an https server
 *
 * @param {object} config
 * @param {number} config.port
 * @param {function} config.handler
 */
function createHttpsServer(config) {
    if (!config || !config.port || !config.handler) {
        throw (new Error('please assign a port'));
    }
    return new Promise(function (resolve) {
        certMgr.getCertificate('anyproxy_internal_https_server', function (err, keyContent, crtContent) {
            var server = https.createServer({
                secureOptions: constants.SSL_OP_NO_SSLv3 || constants.SSL_OP_NO_TLSv1,
                SNICallback: SNIPrepareCert,
                key: keyContent,
                cert: crtContent
            }, config.handler).listen(config.port);
            resolve(server);
        });
    });
}
/**
* create an https server that serving on IP address
* @param @required {object} config
* @param @required {string} config.ip the IP address of the server
* @param @required {number} config.port the port to listen on
* @param @required {function} handler the handler of each connect
*/
function createIPHttpsServer(config) {
    if (!config || !config.port || !config.handler) {
        throw (new Error('please assign a port'));
    }
    if (!config.ip) {
        throw (new Error('please assign an IP to create the https server'));
    }
    return new Promise(function (resolve) {
        certMgr.getCertificate(config.ip, function (err, keyContent, crtContent) {
            var server = https.createServer({
                secureOptions: constants.SSL_OP_NO_SSLv3 || constants.SSL_OP_NO_TLSv1,
                key: keyContent,
                cert: crtContent
            }, config.handler).listen(config.port);
            resolve(server);
        });
    });
}
/**
 *
 *
 * @class httpsServerMgr
 * @param {object} config
 * @param {function} config.handler handler to deal https request
 *
 */
var httpsServerMgr = /** @class */ (function () {
    function httpsServerMgr(config) {
        if (!config || !config.handler) {
            throw new Error('handler is required');
        }
        this.instanceDefaultHost = '127.0.0.1';
        this.httpsAsyncTask = new asyncTask();
        this.handler = config.handler;
        this.wsHandler = config.wsHandler;
    }
    httpsServerMgr.prototype.getSharedHttpsServer = function (hostname, proxyAuth) {
        // ip address will have a unique name
        var finalHost = util.isIpDomain(hostname) ? hostname : this.instanceDefaultHost;
        var self = this;
        function prepareServer(callback) {
            var instancePort;
            co(util.getFreePort)
                .then(co.wrap(function (port) {
                var httpsServer, result;
                var handler = function(req, res){
                    req.proxyAuth = proxyAuth;
                    self.handler(req, res);
                };

                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            instancePort = port;
                            httpsServer = null;
                            if (!util.isIpDomain(hostname)) return [3 /*break*/, 2];
                            return [4 /*yield*/, createIPHttpsServer({
                                    ip: hostname,
                                    port: port,
                                    handler: handler
                                })];
                        case 1:
                            httpsServer = _a.sent();
                            return [3 /*break*/, 4];
                        case 2: return [4 /*yield*/, createHttpsServer({
                                port: port,
                                handler: handler
                            })];
                        case 3:
                            httpsServer = _a.sent();
                            _a.label = 4;
                        case 4:
                            wsServerMgr.getWsServer({
                                server: httpsServer,
                                connHandler: self.wsHandler
                            });
                            httpsServer.on('upgrade', function (req, cltSocket, head) {
                                logUtil.debug('will let WebSocket server to handle the upgrade event');
                            });
                            result = {
                                host: finalHost,
                                port: instancePort,
                            };
                            callback(null, result);
                            return [2 /*return*/, result];
                    }
                });
            }))
                .catch(function (e) {
                callback(e);
            });
        }
        return new Promise(function (resolve, reject) {
            // each ip address will gain a unit task name,
            // while the domain address will share a common task name
            self.httpsAsyncTask.addTask("createHttpsServer-" + proxyAuth + '-' + finalHost, prepareServer, function (error, serverInfo) {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(serverInfo);
                }
            });
        });
    };
    return httpsServerMgr;
}());
module.exports = httpsServerMgr;
