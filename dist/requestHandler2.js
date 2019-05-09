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
var http = require('http'), https = require('https'), net = require('net'), url = require('url'), zlib = require('zlib'), color = require('colorful'), Buffer = require('buffer').Buffer, util = require('./util'), Stream = require('stream'), logUtil = require('./log'), co = require('co'), WebSocket = require('ws'), HttpsServerMgr = require('./httpsServerMgr'), brotliTorb = require('brotli'), Readable = require('stream').Readable;
var requestErrorHandler = require('./requestErrorHandler');
// to fix issue with TLS cache, refer to: https://github.com/nodejs/node/issues/8368
https.globalAgent.maxCachedSessions = 0;
var DEFAULT_CHUNK_COLLECT_THRESHOLD = 20 * 1024 * 1024; // about 20 mb
var CommonReadableStream = /** @class */ (function (_super) {
    __extends(CommonReadableStream, _super);
    function CommonReadableStream(config) {
        return _super.call(this, {
            highWaterMark: DEFAULT_CHUNK_COLLECT_THRESHOLD * 5
        }) || this;
    }
    CommonReadableStream.prototype._read = function (size) {
    };
    return CommonReadableStream;
}(Readable));
/*
* get error response for exception scenarios
*/
var getErrorResponse = function (error, fullUrl) {
    // default error response
    var errorResponse = {
        statusCode: 500,
        header: {
            'Content-Type': 'text/html; charset=utf-8',
            'Proxy-Error': true,
            'Proxy-Error-Message': error ? JSON.stringify(error) : 'null'
        },
        body: requestErrorHandler.getErrorContent(error, fullUrl)
    };
    return errorResponse;
};
/**
 * fetch remote response
 *
 * @param {string} protocol
 * @param {object} options options of http.request
 * @param {buffer} reqData request body
 * @param {object} config
 * @param {boolean} config.dangerouslyIgnoreUnauthorized
 * @param {boolean} config.chunkSizeThreshold
 * @returns
 */
function fetchRemoteResponse(protocol, options, reqData, config) {
    reqData = reqData || '';
    return new Promise(function (resolve, reject) {
        delete options.headers['content-length']; // will reset the content-length after rule
        delete options.headers['Content-Length'];
        delete options.headers['Transfer-Encoding'];
        delete options.headers['transfer-encoding'];
        if (config.dangerouslyIgnoreUnauthorized) {
            options.rejectUnauthorized = false;
        }
        if (!config.chunkSizeThreshold) {
            throw new Error('chunkSizeThreshold is required');
        }
        //send request
        var proxyReq = (/https/i.test(protocol) ? https : http).request(options, function (res) {
            res.headers = util.getHeaderFromRawHeaders(res.rawHeaders);
            //deal response header
            var statusCode = res.statusCode;
            var resHeader = res.headers;
            var resDataChunks = []; // array of data chunks or stream
            var rawResChunks = []; // the original response chunks
            var resDataStream = null;
            var resSize = 0;
            var finishCollecting = function () {
                new Promise(function (fulfill, rejectParsing) {
                    if (resDataStream) {
                        fulfill(resDataStream);
                    }
                    else {
                        var serverResData = Buffer.concat(resDataChunks);
                        var originContentLen = util.getByteSize(serverResData);
                        // remove gzip related header, and ungzip the content
                        // note there are other compression types like deflate
                        var contentEncoding_1 = resHeader['content-encoding'] || resHeader['Content-Encoding'];
                        var ifServerGzipped = /gzip/i.test(contentEncoding_1);
                        var isServerDeflated = /deflate/i.test(contentEncoding_1);
                        var isBrotlied = /br/i.test(contentEncoding_1);
                        /**
                         * when the content is unzipped, update the header content
                         */
                        var refactContentEncoding = function () {
                            if (contentEncoding_1) {
                                resHeader['x-anyproxy-origin-content-encoding'] = contentEncoding_1;
                                delete resHeader['content-encoding'];
                                delete resHeader['Content-Encoding'];
                            }
                        };
                        // set origin content length into header
                        resHeader['x-anyproxy-origin-content-length'] = originContentLen;
                        // only do unzip when there is res data
                        if (ifServerGzipped && originContentLen) {
                            refactContentEncoding();
                            zlib.gunzip(serverResData, function (err, buff) {
                                if (err) {
                                    rejectParsing(err);
                                }
                                else {
                                    fulfill(buff);
                                }
                            });
                        }
                        else if (isServerDeflated && originContentLen) {
                            refactContentEncoding();
                            zlib.inflateRaw(serverResData, function (err, buff) {
                                if (err) {
                                    rejectParsing(err);
                                }
                                else {
                                    fulfill(buff);
                                }
                            });
                        }
                        else if (isBrotlied && originContentLen) {
                            refactContentEncoding();
                            try {
                                // an Unit8Array returned by decompression
                                var result = brotliTorb.decompress(serverResData);
                                fulfill(Buffer.from(result));
                            }
                            catch (e) {
                                rejectParsing(e);
                            }
                        }
                        else {
                            fulfill(serverResData);
                        }
                    }
                }).then(function (serverResData) {
                    resolve({
                        statusCode: statusCode,
                        header: resHeader,
                        body: serverResData,
                        rawBody: rawResChunks,
                        _res: res,
                    });
                }).catch(function (e) {
                    reject(e);
                });
            };
            //deal response data
            res.on('data', function (chunk) {
                rawResChunks.push(chunk);
                if (resDataStream) { // stream mode
                    resDataStream.push(chunk);
                }
                else { // dataChunks
                    resSize += chunk.length;
                    resDataChunks.push(chunk);
                    // stop collecting, convert to stream mode
                    if (resSize >= config.chunkSizeThreshold) {
                        resDataStream = new CommonReadableStream();
                        while (resDataChunks.length) {
                            resDataStream.push(resDataChunks.shift());
                        }
                        resDataChunks = null;
                        finishCollecting();
                    }
                }
            });
            res.on('end', function () {
                if (resDataStream) {
                    resDataStream.push(null); // indicate the stream is end
                }
                else {
                    finishCollecting();
                }
            });
            res.on('error', function (error) {
                logUtil.printLog('error happend in response:' + error, logUtil.T_ERR);
                reject(error);
            });
        });
        proxyReq.on('error', reject);
        proxyReq.end(reqData);
    });
}
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
 * get a request handler for http/https server
 *
 * @param {RequestHandler} reqHandlerCtx
 * @param {object} userRule
 * @param {Recorder} recorder
 * @returns
 */
function getUserReqHandler(userRule, recorder) {
    var reqHandlerCtx = this;
    return function (req, userRes) {
        /*
        note
          req.url is wired
          in http  server: http://www.example.com/a/b/c
          in https server: /a/b/c
        */
        var host = req.headers.host;
        var protocol = (!!req.connection.encrypted && !(/^http:/).test(req.url)) ? 'https' : 'http';
        var fullUrl = (protocol === 'http' || (/^https:/).test(req.url)) ? req.url : (protocol + '://' + host + req.url);
        var urlPattern = url.parse(fullUrl);
        var path = urlPattern.path;
        var chunkSizeThreshold = DEFAULT_CHUNK_COLLECT_THRESHOLD;
        var resourceInfo = null;
        var resourceInfoId = -1;
        var reqData;
        var requestDetail;
        // refer to https://github.com/alibaba/anyproxy/issues/103
        // construct the original headers as the reqheaders
        req.headers = util.getHeaderFromRawHeaders(req.rawHeaders);
        logUtil.printLog(color.green("received request to: " + req.method + " " + host + path));
        /**
         * fetch complete req data
         */
        var fetchReqData = function () { return new Promise(function (resolve) {
            var postData = [];
            req.on('data', function (chunk) {
                postData.push(chunk);
            });
            req.on('end', function () {
                reqData = Buffer.concat(postData);
                resolve();
            });
        }); };
        /**
         * prepare detailed request info
         */
        var prepareRequestDetail = function () {
            var options = {
                hostname: urlPattern.hostname || req.headers.host,
                port: urlPattern.port || req.port || (/https/.test(protocol) ? 443 : 80),
                path: path,
                method: req.method,
                headers: req.headers
            };
            requestDetail = {
                requestOptions: options,
                protocol: protocol,
                url: fullUrl,
                requestData: reqData,
                _req: req
            };
            return Promise.resolve();
        };
        /**
        * send response to client
        *
        * @param {object} finalResponseData
        * @param {number} finalResponseData.statusCode
        * @param {object} finalResponseData.header
        * @param {buffer|string} finalResponseData.body
        */
        var sendFinalResponse = function (finalResponseData) {
            var responseInfo = finalResponseData.response;
            var resHeader = responseInfo.header;
            var responseBody = responseInfo.body || '';
            var transferEncoding = resHeader['transfer-encoding'] || resHeader['Transfer-Encoding'] || '';
            var contentLength = resHeader['content-length'] || resHeader['Content-Length'];
            var connection = resHeader.Connection || resHeader.connection;
            if (contentLength) {
                delete resHeader['content-length'];
                delete resHeader['Content-Length'];
            }
            // set proxy-connection
            if (connection) {
                resHeader['x-anyproxy-origin-connection'] = connection;
                delete resHeader.connection;
                delete resHeader.Connection;
            }
            if (!responseInfo) {
                throw new Error('failed to get response info');
            }
            else if (!responseInfo.statusCode) {
                throw new Error('failed to get response status code');
            }
            else if (!responseInfo.header) {
                throw new Error('filed to get response header');
            }
            // if there is no transfer-encoding, set the content-length
            if (!global._throttle
                && transferEncoding !== 'chunked'
                && !(responseBody instanceof CommonReadableStream)) {
                resHeader['Content-Length'] = util.getByteSize(responseBody);
            }
            userRes.writeHead(responseInfo.statusCode, resHeader);
            if (global._throttle) {
                if (responseBody instanceof CommonReadableStream) {
                    responseBody.pipe(global._throttle.throttle()).pipe(userRes);
                }
                else {
                    var thrStream = new Stream();
                    thrStream.pipe(global._throttle.throttle()).pipe(userRes);
                    thrStream.emit('data', responseBody);
                    thrStream.emit('end');
                }
            }
            else {
                if (responseBody instanceof CommonReadableStream) {
                    responseBody.pipe(userRes);
                }
                else {
                    userRes.end(responseBody);
                }
            }
            return responseInfo;
        };
        // fetch complete request data
        co(fetchReqData)
            .then(prepareRequestDetail)
            .then(function () {
            // record request info
            if (recorder) {
                resourceInfo = {
                    host: host,
                    method: req.method,
                    path: path,
                    protocol: protocol,
                    url: protocol + '://' + host + path,
                    req: req,
                    startTime: new Date().getTime()
                };
                resourceInfoId = recorder.appendRecord(resourceInfo);
            }
            try {
                resourceInfo.reqBody = reqData.toString(); //TODO: deal reqBody in webInterface.js
                recorder && recorder.updateRecord(resourceInfoId, resourceInfo);
            }
            catch (e) { }
        })
            // invoke rule before sending request
            .then(co.wrap(function () {
            var userModifiedInfo, finalReqDetail;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, userRule.beforeSendRequest(Object.assign({}, requestDetail))];
                    case 1:
                        userModifiedInfo = (_a.sent()) || {};
                        finalReqDetail = {};
                        ['protocol', 'requestOptions', 'requestData', 'response'].map(function (key) {
                            finalReqDetail[key] = userModifiedInfo[key] || requestDetail[key];
                        });
                        return [2 /*return*/, finalReqDetail];
                }
            });
        }))
            // route user config
            .then(co.wrap(function (userConfig) {
            var remoteResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!userConfig.response) return [3 /*break*/, 1];
                        // user-assigned local response
                        userConfig._directlyPassToRespond = true;
                        return [2 /*return*/, userConfig];
                    case 1:
                        if (!userConfig.requestOptions) return [3 /*break*/, 3];
                        return [4 /*yield*/, fetchRemoteResponse(userConfig.protocol, userConfig.requestOptions, userConfig.requestData, {
                                dangerouslyIgnoreUnauthorized: reqHandlerCtx.dangerouslyIgnoreUnauthorized,
                                chunkSizeThreshold: chunkSizeThreshold,
                            })];
                    case 2:
                        remoteResponse = _a.sent();
                        return [2 /*return*/, {
                                response: {
                                    statusCode: remoteResponse.statusCode,
                                    header: remoteResponse.header,
                                    body: remoteResponse.body,
                                    rawBody: remoteResponse.rawBody
                                },
                                _res: remoteResponse._res,
                            }];
                    case 3: throw new Error('lost response or requestOptions, failed to continue');
                }
            });
        }))
            // invoke rule before responding to client
            .then(co.wrap(function (responseData) {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!responseData._directlyPassToRespond) return [3 /*break*/, 1];
                        return [2 /*return*/, responseData];
                    case 1:
                        if (!(responseData.response.body && responseData.response.body instanceof CommonReadableStream)) return [3 /*break*/, 2];
                        return [2 /*return*/, responseData];
                    case 2: return [4 /*yield*/, userRule.beforeSendResponse(Object.assign({}, requestDetail), Object.assign({}, responseData))];
                    case 3: 
                    // TODO: err etimeout
                    return [2 /*return*/, (_a.sent()) || responseData];
                }
            });
        }))
            .catch(co.wrap(function (error) {
            var errorResponse, userResponse, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logUtil.printLog(util.collectErrorLog(error), logUtil.T_ERR);
                        errorResponse = getErrorResponse(error, fullUrl);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, userRule.onError(Object.assign({}, requestDetail), error)];
                    case 2:
                        userResponse = _a.sent();
                        if (userResponse && userResponse.response && userResponse.response.header) {
                            errorResponse = userResponse.response;
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, {
                            response: errorResponse
                        }];
                }
            });
        }))
            .then(sendFinalResponse)
            //update record info
            .then(function (responseInfo) {
            resourceInfo.endTime = new Date().getTime();
            resourceInfo.res = {
                statusCode: responseInfo.statusCode,
                headers: responseInfo.header,
            };
            resourceInfo.statusCode = responseInfo.statusCode;
            resourceInfo.resHeader = responseInfo.header;
            resourceInfo.resBody = responseInfo.body instanceof CommonReadableStream ? '(big stream)' : (responseInfo.body || '');
            resourceInfo.length = resourceInfo.resBody.length;
            // console.info('===> resbody in record', resourceInfo);
            recorder && recorder.updateRecord(resourceInfoId, resourceInfo);
        })
            .catch(function (e) {
            logUtil.printLog(color.green('Send final response failed:' + e.message), logUtil.T_ERR);
        });
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
        var proxyAuthHeader = req.headers['proxy-authorization'] || req.headers['Proxy-Authorization']
        if (!proxyAuthHeader) { // here you can add check for any username/password, I just check that this header must exist!
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
                return httpsServerMgr.getSharedHttpsServer(host, proxyAuthHeader).then(serverInfo => ({ host: serverInfo.host, port: serverInfo.port }));
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
            var e_2, errorHeader;
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
                        e_2 = _a.sent();
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
        reqHandlerCtx.userRequestHandler = getUserReqHandler.apply(reqHandlerCtx, [userRule, recorder]);
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
