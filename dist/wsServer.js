'use strict';
//websocket server manager
var WebSocketServer = require('ws').Server;
var logUtil = require('./log');
function resToMsg(msg, recorder, cb) {
    var result = {}, jsonData;
    try {
        jsonData = JSON.parse(msg);
    }
    catch (e) {
        result = {
            type: 'error',
            error: 'failed to parse your request : ' + e.toString()
        };
        cb && cb(result);
        return;
    }
    if (jsonData.reqRef) {
        result.reqRef = jsonData.reqRef;
    }
    if (jsonData.type === 'reqBody' && jsonData.id) {
        result.type = 'body';
        recorder.getBody(jsonData.id, function (err, data) {
            if (err) {
                result.content = {
                    id: null,
                    body: null,
                    error: err.toString()
                };
            }
            else {
                result.content = {
                    id: jsonData.id,
                    body: data.toString()
                };
            }
            cb && cb(result);
        });
    }
    else { // more req handler here
        return null;
    }
}
//config.server
var wsServer = /** @class */ (function () {
    function wsServer(config, recorder) {
        if (!recorder) {
            throw new Error('proxy recorder is required');
        }
        else if (!config || !config.server) {
            throw new Error('config.server is required');
        }
        var self = this;
        self.config = config;
        self.recorder = recorder;
    }
    wsServer.prototype.start = function () {
        var self = this;
        var config = self.config;
        var recorder = self.recorder;
        return new Promise(function (resolve, reject) {
            //web socket interface
            var wss = new WebSocketServer({
                server: config.server,
                clientTracking: true,
            });
            resolve();
            // the queue of the messages to be delivered
            var messageQueue = [];
            // the flat to indicate wheter to broadcast the record
            var broadcastFlag = true;
            setInterval(function () {
                broadcastFlag = true;
                sendMultipleMessage();
            }, 50);
            function sendMultipleMessage(data) {
                // if the flag goes to be true, and there are records to send
                if (broadcastFlag && messageQueue.length > 0) {
                    wss && wss.broadcast({
                        type: 'updateMultiple',
                        content: messageQueue
                    });
                    messageQueue = [];
                    broadcastFlag = false;
                }
                else {
                    data && messageQueue.push(data);
                }
            }
            wss.broadcast = function (data) {
                if (typeof data === 'object') {
                    try {
                        data = JSON.stringify(data);
                    }
                    catch (e) {
                        console.error('==> errorr when do broadcast ', e, data);
                    }
                }
                for (var _i = 0, _a = wss.clients; _i < _a.length; _i++) {
                    var client = _a[_i];
                    try {
                        client.send(data);
                    }
                    catch (e) {
                        logUtil.printLog('websocket failed to send data, ' + e, logUtil.T_ERR);
                    }
                }
            };
            wss.on('connection', function (ws) {
                ws.on('message', function (msg) {
                    resToMsg(msg, recorder, function (res) {
                        res && ws.send(JSON.stringify(res));
                    });
                });
                ws.on('error', function (e) {
                    console.error('error in ws:', e);
                });
            });
            wss.on('error', function (e) {
                logUtil.printLog('websocket error, ' + e, logUtil.T_ERR);
            });
            wss.on('close', function () { });
            recorder.on('update', function (data) {
                try {
                    sendMultipleMessage(data);
                }
                catch (e) {
                    console.log('ws error');
                    console.log(e);
                }
            });
            recorder.on('updateLatestWsMsg', function (data) {
                try {
                    // console.info('==> update latestMsg ', data);
                    wss && wss.broadcast({
                        type: 'updateLatestWsMsg',
                        content: data
                    });
                }
                catch (e) {
                    logUtil.error(e.message);
                    logUtil.error(e.stack);
                    console.error(e);
                }
            });
            self.wss = wss;
        });
    };
    wsServer.prototype.closeAll = function () {
        var self = this;
        return new Promise(function (resolve, reject) {
            self.wss.close(function (e) {
                if (e) {
                    reject(e);
                }
                else {
                    resolve();
                }
            });
        });
    };
    return wsServer;
}());
module.exports = wsServer;
