"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var url = require('url'), https = require('https'), color = require('colorful'), Buffer = require('buffer').Buffer, util = require('../util'), Stream = require('stream'), logUtil = require('../log'), CommonReadableStream = require('./CommonReadableStream'), co = require('co');
var requestErrorHandler = require('./requestErrorHandler');
var DEFAULT_CHUNK_COLLECT_THRESHOLD = 20 * 1024 * 1024; // about 20 mb
// to fix issue with TLS cache, refer to: https://github.com/nodejs/node/issues/8368
https.globalAgent.maxCachedSessions = 0;
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
/*
* get error response for exception scenarios
*/
function getErrorResponse(error, fullUrl) {
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
}
var UserReqHandler = /** @class */ (function () {
    function UserReqHandler(ctx, userRule, recorder) {
        this.userRule = userRule;
        this.recorder = recorder;
        this.reqHandlerCtx = ctx;
    }
    UserReqHandler.prototype.handler = function (req, userRes) {
        /*
        note
          req.url is wired
          in http  server: http://www.example.com/a/b/c
          in https server: /a/b/c
        */
        var _this = this;
        var host = req.headers.host;
        var protocol = (!!req.connection.encrypted && !(/^http:/).test(req.url)) ? 'https' : 'http';
        var fullUrl = protocol === 'http' ? req.url : (protocol + '://' + host + req.url);
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
            if (_this.recorder) {
                resourceInfo = {
                    host: host,
                    method: req.method,
                    path: path,
                    protocol: protocol,
                    url: protocol + '://' + host + path,
                    req: req,
                    startTime: new Date().getTime()
                };
                resourceInfoId = _this.recorder.appendRecord(resourceInfo);
            }
            try {
                resourceInfo.reqBody = reqData.toString(); //TODO: deal reqBody in webInterface.js
                _this.recorder && _this.recorder.updateRecord(resourceInfoId, resourceInfo);
            }
            catch (e) { }
        })
            // invoke rule before sending request
            .then(co.wrap(function () {
            var userModifiedInfo, finalReqDetail;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.userRule.beforeSendRequest(Object.assign({}, requestDetail))];
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
                                dangerouslyIgnoreUnauthorized: this.reqHandlerCtx.dangerouslyIgnoreUnauthorized,
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
                    case 2: return [4 /*yield*/, this.userRule.beforeSendResponse(Object.assign({}, requestDetail), Object.assign({}, responseData))];
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
                        return [4 /*yield*/, this.userRule.onError(Object.assign({}, requestDetail), error)];
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
            _this.recorder && _this.recorder.updateRecord(resourceInfoId, resourceInfo);
        })
            .catch(function (e) {
            logUtil.printLog(color.green('Send final response failed:' + e.message), logUtil.T_ERR);
        });
    };
    return UserReqHandler;
}());
exports.default = UserReqHandler;
