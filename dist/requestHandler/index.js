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
var net = require('net'), color = require('colorful'), util = require('../util'), logUtil = require('../log'), co = require('co'), WebSocket = require('ws'), CommonReadableStream = require('./CommonReadableStream'), HttpsServerMgr = require('../httpsServerMgr');
var UserReqHandler = require('./UserReqHandler').default;
/**
* get request info from the ws client, includes:
 host
 port
 path
 protocol  ws/wss

 @param @required wsClient the ws client of WebSocket
*
*/
function getWsReqInfo(wsReq) {
    var headers = wsReq.headers || {};
    var host = headers.host;
    var hostName = host.split(':')[0];
    var port = host.split(':')[1];
    // TODO 如果是windows机器，url是不是全路径？需要对其过滤，取出
    var path = wsReq.url || '/';
    var isEncript = true && wsReq.connection && wsReq.connection.encrypted;
    /**
     * construct the request headers based on original connection,
     * but delete the `sec-websocket-*` headers as they are already consumed by AnyProxy
     */
    var getNoWsHeaders = function () {
        var originHeaders = Object.assign({}, headers);
        var originHeaderKeys = Object.keys(originHeaders);
        originHeaderKeys.forEach(function (key) {
            // if the key matchs 'sec-websocket', delete it
            if (/sec-websocket/ig.test(key)) {
                delete originHeaders[key];
            }
        });
        delete originHeaders.connection;
        delete originHeaders.upgrade;
        return originHeaders;
    };
    return {
        headers: headers,
        noWsHeaders: getNoWsHeaders(),
        hostName: hostName,
        port: port,
        path: path,
        protocol: isEncript ? 'wss' : 'ws'
    };
}
/**
 * get a handler for CONNECT request
 *
 * @param {RequestHandler} reqHandlerCtx
 * @param {object} userRule
 * @param {Recorder} recorder
 * @param {object} httpsServerMgr
 * @returns
 */
function getConnectReqHandler(userRule, recorder, httpsServerMgr) {
    var reqHandlerCtx = this;
    reqHandlerCtx.conns = new Map();
    reqHandlerCtx.cltSockets = new Map();
    return function (req, cltSocket, head) {
        if (!req.headers['proxy-authorization']) { // here you can add check for any username/password, I just check that this header must exist!
          cltSocket.write([
            'HTTP/1.1 407 Proxy Authentication Required',
            'Proxy-Authenticate: Basic',
            'Proxy-Connection: close',
          ].join('\r\n'))
          cltSocket.end('\r\n\r\n')  // empty body
          return
        }
        cltSocket._connectHeaders = req.headers;
        var host = req.url.split(':')[0], targetPort = req.url.split(':')[1];
        var shouldIntercept;
        var interceptWsRequest = false;
        var requestDetail;
        var resourceInfo = null;
        var resourceInfoId = -1;
        var requestStream = new CommonReadableStream();
        /*
          1. write HTTP/1.1 200 to client
          2. get request data
          3. tell if it is a websocket request
          4.1 if (websocket || do_not_intercept) --> pipe to target server
          4.2 else --> pipe to local server and do man-in-the-middle attack
        */
        co(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // determine whether to use the man-in-the-middle server
                        logUtil.printLog(color.green('received https CONNECT request ' + host));
                        requestDetail = {
                            host: req.url,
                            _req: req
                        };
                        return [4 /*yield*/, userRule.beforeDealHttpsRequest(requestDetail)];
                    case 1:
                        // the return value in default rule is null
                        // so if the value is null, will take it as final value
                        shouldIntercept = _a.sent();
                        // otherwise, will take the passed in option
                        if (shouldIntercept === null) {
                            shouldIntercept = reqHandlerCtx.forceProxyHttps;
                        }
                        return [2 /*return*/];
                }
            });
        })
            .then(function () {
            return new Promise(function (resolve) {
                // mark socket connection as established, to detect the request protocol
                cltSocket.write('HTTP/' + req.httpVersion + ' 200 OK\r\n\r\n', 'UTF-8', resolve);
            });
        })
            .then(function () {
            return new Promise(function (resolve, reject) {
                var resolved = false;
                cltSocket.on('data', function (chunk) {
                    requestStream.push(chunk);
                    if (!resolved) {
                        resolved = true;
                        try {
                            var chunkString = chunk.toString();
                            if (chunkString.indexOf('GET ') === 0) {
                                shouldIntercept = false; // websocket, do not intercept
                                // if there is '/do-not-proxy' in the request, do not intercept the websocket
                                // to avoid AnyProxy itself be proxied
                                if (reqHandlerCtx.wsIntercept && chunkString.indexOf('GET /do-not-proxy') !== 0) {
                                    interceptWsRequest = true;
                                }
                            }
                        }
                        catch (e) {
                            console.error(e);
                        }
                        resolve();
                    }
                });
                cltSocket.on('end', function () {
                    requestStream.push(null);
                });
            });
        })
            .then(function (result) {
            // log and recorder
            if (shouldIntercept) {
                logUtil.printLog('will forward to local https server');
            }
            else {
                logUtil.printLog('will bypass the man-in-the-middle proxy');
            }
            //record
            if (recorder) {
                resourceInfo = {
                    host: host,
                    method: req.method,
                    path: '',
                    url: 'https://' + host,
                    req: req,
                    startTime: new Date().getTime()
                };
                resourceInfoId = recorder.appendRecord(resourceInfo);
            }
        })
            .then(function () {
            // determine the request target
            if (!shouldIntercept) {
                // server info from the original request
                var originServer = {
                    host: host,
                    port: (targetPort === 80) ? 443 : targetPort
                };
                var localHttpServer = {
                    host: 'localhost',
                    port: reqHandlerCtx.httpServerPort
                };
                // for ws request, redirect them to local ws server
                return interceptWsRequest ? localHttpServer : originServer;
            }
            else {
                return httpsServerMgr.getSharedHttpsServer(host).then(function (serverInfo) { return ({ host: serverInfo.host, port: serverInfo.port }); });
            }
        })
            .then(function (serverInfo) {
            if (!serverInfo.port || !serverInfo.host) {
                throw new Error('failed to get https server info');
            }
            return new Promise(function (resolve, reject) {
                var conn = net.connect(serverInfo.port, serverInfo.host, function () {
                    //throttle for direct-foward https
                    if (global._throttle && !shouldIntercept) {
                        requestStream.pipe(conn);
                        conn.pipe(global._throttle.throttle()).pipe(cltSocket);
                    }
                    else {
                        requestStream.pipe(conn);
                        conn.pipe(cltSocket);
                    }
                    resolve();
                });
                conn.on('error', function (e) {
                    reject(e);
                });
                reqHandlerCtx.conns.set(serverInfo.host + ':' + serverInfo.port, conn);
                reqHandlerCtx.cltSockets.set(serverInfo.host + ':' + serverInfo.port, cltSocket);
            });
        })
            .then(function () {
            if (recorder) {
                resourceInfo.endTime = new Date().getTime();
                resourceInfo.statusCode = '200';
                resourceInfo.resHeader = {};
                resourceInfo.resBody = '';
                resourceInfo.length = 0;
                recorder && recorder.updateRecord(resourceInfoId, resourceInfo);
            }
        })
            .catch(co.wrap(function (error) {
            var e_1, errorHeader;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logUtil.printLog(util.collectErrorLog(error), logUtil.T_ERR);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, userRule.onConnectError(requestDetail, error)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        try {
                            errorHeader = 'Proxy-Error: true\r\n';
                            errorHeader += 'Proxy-Error-Message: ' + (error || 'null') + '\r\n';
                            errorHeader += 'Content-Type: text/html\r\n';
                            cltSocket.write('HTTP/1.1 502\r\n' + errorHeader + '\r\n\r\n');
                        }
                        catch (e) { }
                        return [2 /*return*/];
                }
            });
        }));
    };
}
/**
* get a websocket event handler
  @param @required {object} wsClient
*/
function getWsHandler(userRule, recorder, wsClient, wsReq) {
    var self = this;
    try {
        var resourceInfoId_1 = -1;
        var resourceInfo_1 = {
            wsMessages: [] // all ws messages go through AnyProxy
        };
        var clientMsgQueue_1 = [];
        var serverInfo = getWsReqInfo(wsReq);
        var wsUrl = serverInfo.protocol + "://" + serverInfo.hostName + ":" + serverInfo.port + serverInfo.path;
        var proxyWs_1 = new WebSocket(wsUrl, '', {
            rejectUnauthorized: !self.dangerouslyIgnoreUnauthorized,
            headers: serverInfo.noWsHeaders
        });
        if (recorder) {
            Object.assign(resourceInfo_1, {
                host: serverInfo.hostName,
                method: 'WebSocket',
                path: serverInfo.path,
                url: wsUrl,
                req: wsReq,
                startTime: new Date().getTime()
            });
            resourceInfoId_1 = recorder.appendRecord(resourceInfo_1);
        }
        /**
        * store the messages before the proxy ws is ready
        */
        var sendProxyMessage_1 = function (event) {
            var message = event.data;
            if (proxyWs_1.readyState === 1) {
                // if there still are msg queue consuming, keep it going
                if (clientMsgQueue_1.length > 0) {
                    clientMsgQueue_1.push(message);
                }
                else {
                    proxyWs_1.send(message);
                }
            }
            else {
                clientMsgQueue_1.push(message);
            }
        };
        /**
        * consume the message in queue when the proxy ws is not ready yet
        * will handle them from the first one-by-one
        */
        var consumeMsgQueue_1 = function () {
            while (clientMsgQueue_1.length > 0) {
                var message = clientMsgQueue_1.shift();
                proxyWs_1.send(message);
            }
        };
        /**
        * When the source ws is closed, we need to close the target websocket.
        * If the source ws is normally closed, that is, the code is reserved, we need to transfrom them
        */
        var getCloseFromOriginEvent_1 = function (event) {
            var code = event.code || '';
            var reason = event.reason || '';
            var targetCode = '';
            var targetReason = '';
            if (code >= 1004 && code <= 1006) {
                targetCode = 1000; // normal closure
                targetReason = "Normally closed. The origin ws is closed at code: " + code + " and reason: " + reason;
            }
            else {
                targetCode = code;
                targetReason = reason;
            }
            return {
                code: targetCode,
                reason: targetReason
            };
        };
        /**
        * consruct a message Record from message event
        * @param @required {event} messageEvent the event from websockt.onmessage
        * @param @required {boolean} isToServer whether the message is to or from server
        *
        */
        var recordMessage_1 = function (messageEvent, isToServer) {
            var message = {
                time: Date.now(),
                message: messageEvent.data,
                isToServer: isToServer
            };
            // resourceInfo.wsMessages.push(message);
            recorder && recorder.updateRecordWsMessage(resourceInfoId_1, message);
        };
        proxyWs_1.onopen = function () {
            consumeMsgQueue_1();
        };
        // this event is fired when the connection is build and headers is returned
        proxyWs_1.on('upgrade', function (response) {
            resourceInfo_1.endTime = new Date().getTime();
            var headers = response.headers;
            resourceInfo_1.res = {
                statusCode: response.statusCode,
                headers: headers,
            };
            resourceInfo_1.statusCode = response.statusCode;
            resourceInfo_1.resHeader = headers;
            resourceInfo_1.resBody = '';
            resourceInfo_1.length = resourceInfo_1.resBody.length;
            recorder && recorder.updateRecord(resourceInfoId_1, resourceInfo_1);
        });
        proxyWs_1.onerror = function (e) {
            // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes
            wsClient.close(1001, e.message);
            proxyWs_1.close(1001);
        };
        proxyWs_1.onmessage = function (event) {
            recordMessage_1(event, false);
            wsClient.readyState === 1 && wsClient.send(event.data);
        };
        proxyWs_1.onclose = function (event) {
            logUtil.debug("proxy ws closed with code: " + event.code + " and reason: " + event.reason);
            var targetCloseInfo = getCloseFromOriginEvent_1(event);
            wsClient.readyState !== 3 && wsClient.close(targetCloseInfo.code, targetCloseInfo.reason);
        };
        wsClient.onmessage = function (event) {
            recordMessage_1(event, true);
            sendProxyMessage_1(event);
        };
        wsClient.onclose = function (event) {
            logUtil.debug("original ws closed with code: " + event.code + " and reason: " + event.reason);
            var targetCloseInfo = getCloseFromOriginEvent_1(event);
            proxyWs_1.readyState !== 3 && proxyWs_1.close(targetCloseInfo.code, targetCloseInfo.reason);
        };
    }
    catch (e) {
        logUtil.debug('WebSocket Proxy Error:' + e.message);
        logUtil.debug(e.stack);
        console.error(e);
    }
}
var RequestHandler = /** @class */ (function () {
    /**
     * Creates an instance of RequestHandler.
     *
     * @param {object} config
     * @param {boolean} config.forceProxyHttps proxy all https requests
     * @param {boolean} config.dangerouslyIgnoreUnauthorized
       @param {number} config.httpServerPort  the http port AnyProxy do the proxy
     * @param {object} rule
     * @param {Recorder} recorder
     *
     * @memberOf RequestHandler
     */
    function RequestHandler(config, rule, recorder) {
        var reqHandlerCtx = this;
        this.forceProxyHttps = false;
        this.dangerouslyIgnoreUnauthorized = false;
        this.httpServerPort = '';
        this.wsIntercept = false;
        if (config.forceProxyHttps) {
            this.forceProxyHttps = true;
        }
        if (config.dangerouslyIgnoreUnauthorized) {
            this.dangerouslyIgnoreUnauthorized = true;
        }
        if (config.wsIntercept) {
            this.wsIntercept = config.wsIntercept;
        }
        this.httpServerPort = config.httpServerPort;
        var default_rule = util.freshRequire('./rule_default');
        var userRule = util.merge(default_rule, rule);
        var userReqHandler = new UserReqHandler(reqHandlerCtx, userRule, recorder);
        reqHandlerCtx.userRequestHandler = userReqHandler.handler.bind(reqHandlerCtx);
        reqHandlerCtx.wsHandler = getWsHandler.bind(this, userRule, recorder);
        reqHandlerCtx.httpsServerMgr = new HttpsServerMgr({
            handler: reqHandlerCtx.userRequestHandler,
            wsHandler: reqHandlerCtx.wsHandler // websocket
        });
        this.connectReqHandler = getConnectReqHandler.apply(reqHandlerCtx, [userRule, recorder, reqHandlerCtx.httpsServerMgr]);
    }
    return RequestHandler;
}());
module.exports = RequestHandler;
