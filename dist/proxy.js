'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var http = require('http'), https = require('https'), async = require('async'), color = require('colorful'), certMgr = require('./certMgr'), Recorder = require('./recorder'), logUtil = require('./log'), util = require('./util'), events = require('events'), co = require('co'), WebInterface = require('./webInterface'), wsServerMgr = require('./wsServerMgr'), ThrottleGroup = require('stream-throttle').ThrottleGroup;
// const memwatch = require('memwatch-next');
// setInterval(() => {
//   console.log(process.memoryUsage());
//   const rss = Math.ceil(process.memoryUsage().rss / 1000 / 1000);
//   console.log('Program is using ' + rss + ' mb of Heap.');
// }, 1000);
// memwatch.on('stats', (info) => {
//   console.log('gc !!');
//   console.log(process.memoryUsage());
//   const rss = Math.ceil(process.memoryUsage().rss / 1000 / 1000);
//   console.log('GC !! Program is using ' + rss + ' mb of Heap.');
//   // var heapUsed = Math.ceil(process.memoryUsage().heapUsed / 1000);
//   // console.log("Program is using " + heapUsed + " kb of Heap.");
//   // console.log(info);
// });
var T_TYPE_HTTP = 'http', T_TYPE_HTTPS = 'https', DEFAULT_TYPE = T_TYPE_HTTP;
var PROXY_STATUS_INIT = 'INIT';
var PROXY_STATUS_READY = 'READY';
var PROXY_STATUS_CLOSED = 'CLOSED';
/**
 *
 * @class ProxyCore
 * @extends {events.EventEmitter}
 */
var ProxyCore = /** @class */ (function (_super) {
    __extends(ProxyCore, _super);
    /**
     * Creates an instance of ProxyCore.
     *
     * @param {object} config - configs
     * @param {number} config.port - port of the proxy server
     * @param {object} [config.rule=null] - rule module to use
     * @param {string} [config.type=http] - type of the proxy server, could be 'http' or 'https'
     * @param {strign} [config.hostname=localhost] - host name of the proxy server, required when this is an https proxy
     * @param {number} [config.throttle] - speed limit in kb/s
     * @param {boolean} [config.forceProxyHttps=false] - if proxy all https requests
     * @param {boolean} [config.silent=false] - if keep the console silent
     * @param {boolean} [config.dangerouslyIgnoreUnauthorized=false] - if ignore unauthorized server response
     * @param {object} [config.recorder] - recorder to use
     * @param {boolean} [config.wsIntercept] - whether intercept websocket
     *
     * @memberOf ProxyCore
     */
    function ProxyCore(config) {
        var _this = _super.call(this) || this;
        config = config || {};
        _this.status = PROXY_STATUS_INIT;
        _this.proxyPort = config.port;
        _this.proxyType = /https/i.test(config.type || DEFAULT_TYPE) ? T_TYPE_HTTPS : T_TYPE_HTTP;
        _this.proxyHostName = config.hostname || 'localhost';
        _this.recorder = config.recorder;
        if (parseInt(process.versions.node.split('.')[0], 10) < 4) {
            throw new Error('node.js >= v4.x is required for anyproxy');
        }
        else if (config.forceProxyHttps && !certMgr.ifRootCAFileExists()) {
            logUtil.printLog('You can run `anyproxy-ca` to generate one root CA and then re-run this command');
            throw new Error('root CA not found. Please run `anyproxy-ca` to generate one first.');
        }
        else if (_this.proxyType === T_TYPE_HTTPS && !config.hostname) {
            throw new Error('hostname is required in https proxy');
        }
        // else if (!_this.proxyPort) {
        //     throw new Error('proxy port is required');
        }
        else if (!_this.recorder) {
            throw new Error('recorder is required');
        }
        else if (config.forceProxyHttps && config.rule && config.rule.beforeDealHttpsRequest) {
            logUtil.printLog('both "-i(--intercept)" and rule.beforeDealHttpsRequest are specified, the "-i" option will be ignored.', logUtil.T_WARN);
            config.forceProxyHttps = false;
        }
        _this.httpProxyServer = null;
        _this.requestHandler = null;
        // copy the rule to keep the original proxyRule independent
        _this.proxyRule = config.rule || {};
        if (config.silent) {
            logUtil.setPrintStatus(false);
        }
        if (config.throttle) {
            logUtil.printLog('throttle :' + config.throttle + 'kb/s');
            var rate = parseInt(config.throttle, 10);
            if (rate < 1) {
                throw new Error('Invalid throttle rate value, should be positive integer');
            }
            global._throttle = new ThrottleGroup({ rate: 1024 * rate }); // rate - byte/sec
        }
        // init recorder
        _this.recorder = config.recorder;
        // init request handler
        var RequestHandler = util.freshRequire('./requestHandler');
        _this.requestHandler = new RequestHandler({
            wsIntercept: config.wsIntercept,
            httpServerPort: config.port,
            forceProxyHttps: !!config.forceProxyHttps,
            dangerouslyIgnoreUnauthorized: !!config.dangerouslyIgnoreUnauthorized
        }, _this.proxyRule, _this.recorder);
        return _this;
    }
    /**
    * manage all created socket
    * for each new socket, we put them to a map;
    * if the socket is closed itself, we remove it from the map
    * when the `close` method is called, we'll close the sockes before the server closed
    *
    * @param {Socket} the http socket that is creating
    * @returns undefined
    * @memberOf ProxyCore
    */
    ProxyCore.prototype.handleExistConnections = function (socket) {
        var self = this;
        self.socketIndex++;
        var key = "socketIndex_" + self.socketIndex;
        self.socketPool[key] = socket;
        // if the socket is closed already, removed it from pool
        socket.on('close', function () {
            delete self.socketPool[key];
        });
    };
    /**
     * start the proxy server
     *
     * @returns ProxyCore
     *
     * @memberOf ProxyCore
     */
    ProxyCore.prototype.start = function () {
        var _this = this;
        var self = this;
        self.socketIndex = 0;
        self.socketPool = {};
        if (self.status !== PROXY_STATUS_INIT) {
            throw new Error('server status is not PROXY_STATUS_INIT, can not run start()');
        }
        async.series([
            //creat proxy server
            function (callback) {
                if (self.proxyType === T_TYPE_HTTPS) {
                    certMgr.getCertificate(self.proxyHostName, function (err, keyContent, crtContent) {
                        if (err) {
                            callback(err);
                        }
                        else {
                            self.httpProxyServer = https.createServer({
                                key: keyContent,
                                cert: crtContent
                            }, self.requestHandler.userRequestHandler);
                            callback(null);
                        }
                    });
                }
                else {
                    self.httpProxyServer = http.createServer(self.requestHandler.userRequestHandler);
                    callback(null);
                }
            },
            //handle CONNECT request for https over http
            function (callback) {
                self.httpProxyServer.on('connect', self.requestHandler.connectReqHandler);
                callback(null);
            },
            function (callback) {
                // wsServerMgr.getWsServer({
                //     server: self.httpProxyServer,
                //     connHandler: self.requestHandler.wsHandler
                // });
                // remember all sockets, so we can destory them when call the method 'close';
                self.httpProxyServer.on('connection', function (socket) {
                    self.handleExistConnections.call(self, socket);
                });
                callback(null);
            },
            //start proxy server
            function (callback) {
                if (self.proxyPort) {
                   self.httpProxyServer.listen(self.proxyPort);
                }
                callback(null);
            },
        ], 
        //final callback
        function (err, result) {
            if (!err) {
                var tipText = (self.proxyType === T_TYPE_HTTP ? 'Http' : 'Https') + ' proxy started on port ' + self.proxyPort;
                logUtil.printLog(color.green(tipText));
                if (self.webServerInstance) {
                    var webTip = 'web interface started on port ' + self.webServerInstance.webPort;
                    logUtil.printLog(color.green(webTip));
                }
                var ruleSummaryString_1 = '';
                var ruleSummary_1 = _this.proxyRule.summary;
                if (ruleSummary_1) {
                    co(function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!(typeof ruleSummary_1 === 'string')) return [3 /*break*/, 1];
                                    ruleSummaryString_1 = ruleSummary_1;
                                    return [3 /*break*/, 3];
                                case 1: return [4 /*yield*/, ruleSummary_1()];
                                case 2:
                                    ruleSummaryString_1 = _a.sent();
                                    _a.label = 3;
                                case 3:
                                    logUtil.printLog(color.green("Active rule is: " + ruleSummaryString_1));
                                    return [2 /*return*/];
                            }
                        });
                    });
                }
                self.status = PROXY_STATUS_READY;
                self.emit('ready');
            }
            else {
                var tipText = 'err when start proxy server :(';
                logUtil.printLog(color.red(tipText), logUtil.T_ERR);
                logUtil.printLog(err, logUtil.T_ERR);
                self.emit('error', {
                    error: err
                });
            }
        });
        return self;
    };
    /**
     * close the proxy server
     *
     * @returns ProxyCore
     *
     * @memberOf ProxyCore
     */
    ProxyCore.prototype.close = function () {
        var _this = this;
        // clear recorder cache
        return new Promise(function (resolve) {
            if (_this.httpProxyServer) {
                // destroy conns & cltSockets when closing proxy server
                for (var _i = 0, _a = _this.requestHandler.conns; _i < _a.length; _i++) {
                    var connItem = _a[_i];
                    var key = connItem[0];
                    var conn = connItem[1];
                    logUtil.printLog("destorying https connection : " + key);
                    conn.end();
                }
                for (var _b = 0, _c = _this.requestHandler.cltSockets; _b < _c.length; _b++) {
                    var cltSocketItem = _c[_b];
                    var key = cltSocketItem[0];
                    var cltSocket = cltSocketItem[1];
                    logUtil.printLog("endding https cltSocket : " + key);
                    cltSocket.end();
                }
                if (_this.socketPool) {
                    for (var key in _this.socketPool) {
                        _this.socketPool[key].destroy();
                    }
                }
                _this.httpProxyServer.close(function (error) {
                    if (error) {
                        console.error(error);
                        logUtil.printLog("proxy server close FAILED : " + error.message, logUtil.T_ERR);
                    }
                    else {
                        _this.httpProxyServer = null;
                        _this.status = PROXY_STATUS_CLOSED;
                        logUtil.printLog("proxy server closed at " + _this.proxyHostName + ":" + _this.proxyPort);
                    }
                    resolve(error);
                });
            }
            else {
                resolve();
            }
        });
    };
    return ProxyCore;
}(events.EventEmitter));
/**
 * start proxy server as well as recorder and webInterface
 */
var ProxyServer = /** @class */ (function (_super) {
    __extends(ProxyServer, _super);
    /**
     *
     * @param {object} config - config
     * @param {object} [config.webInterface] - config of the web interface
     * @param {boolean} [config.webInterface.enable=false] - if web interface is enabled
     * @param {number} [config.webInterface.webPort=8002] - http port of the web interface
     */
    function ProxyServer(config) {
        var _this = this;
        // prepare a recorder
        var recorder = new Recorder();
        var configForCore = Object.assign({
            recorder: recorder,
        }, config);
        _this = _super.call(this, configForCore) || this;
        _this.proxyWebinterfaceConfig = config.webInterface;
        _this.recorder = recorder;
        _this.webServerInstance = null;
        return _this;
    }
    ProxyServer.prototype.start = function () {
        var _this = this;
        // start web interface if neeeded
        if (this.proxyWebinterfaceConfig && this.proxyWebinterfaceConfig.enable) {
            this.webServerInstance = new WebInterface(this.proxyWebinterfaceConfig, this.recorder);
            // start web server
            this.webServerInstance.start().then(function () {
                // start proxy core
                _super.prototype.start.call(_this);
            })
                .catch(function (e) {
                _this.emit('error', e);
            });
        }
        else {
            _super.prototype.start.call(this);
        }
    };
    ProxyServer.prototype.close = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _super.prototype.close.call(_this)
                .then(function (error) {
                if (error) {
                    resolve(error);
                }
            });
            if (_this.recorder) {
                logUtil.printLog('clearing cache file...');
                _this.recorder.clear();
            }
            var tmpWebServer = _this.webServerInstance;
            _this.recorder = null;
            _this.webServerInstance = null;
            if (tmpWebServer) {
                logUtil.printLog('closing webserver...');
                tmpWebServer.close(function (error) {
                    if (error) {
                        console.error(error);
                        logUtil.printLog("proxy web server close FAILED: " + error.message, logUtil.T_ERR);
                    }
                    else {
                        logUtil.printLog("proxy web server closed at " + _this.proxyHostName + " : " + _this.webPort);
                    }
                    resolve(error);
                });
            }
            else {
                resolve(null);
            }
        });
    };
    return ProxyServer;
}(ProxyCore));
module.exports.ProxyCore = ProxyCore;
module.exports.ProxyServer = ProxyServer;
module.exports.ProxyRecorder = Recorder;
module.exports.ProxyWebServer = WebInterface;
module.exports.utils = {
    systemProxyMgr: require('./systemProxyMgr'),
    certMgr: certMgr,
    getAnyProxyPath: util.getAnyProxyPath
};
