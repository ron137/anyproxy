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
//start recording and share a list when required
var Datastore = require('nedb'), path = require('path'), fs = require('fs'), logUtil = require('./log'), events = require('events'), iconv = require('iconv-lite'), fastJson = require('fast-json-stringify'), proxyUtil = require('./util');
var wsMessageStingify = fastJson({
    title: 'ws message stringify',
    type: 'object',
    properties: {
        time: {
            type: 'integer'
        },
        message: {
            type: 'string'
        },
        isToServer: {
            type: 'boolean'
        }
    }
});
var BODY_FILE_PRFIX = 'res_body_';
var WS_MESSAGE_FILE_PRFIX = 'ws_message_';
var CACHE_DIR_PREFIX = 'cache_r';
function getCacheDir() {
    var rand = Math.floor(Math.random() * 1000000), cachePath = path.join(proxyUtil.getAnyProxyPath('cache'), './' + CACHE_DIR_PREFIX + rand);
    fs.mkdirSync(cachePath);
    return cachePath;
}
function normalizeInfo(id, info) {
    var singleRecord = {};
    //general
    singleRecord._id = id;
    singleRecord.id = id;
    singleRecord.url = info.url;
    singleRecord.host = info.host;
    singleRecord.path = info.path;
    singleRecord.method = info.method;
    //req
    singleRecord.reqHeader = info.req.headers;
    singleRecord.startTime = info.startTime;
    singleRecord.reqBody = info.reqBody || '';
    singleRecord.protocol = info.protocol || '';
    //res
    if (info.endTime) {
        singleRecord.statusCode = info.statusCode;
        singleRecord.endTime = info.endTime;
        singleRecord.resHeader = info.resHeader;
        singleRecord.length = info.length;
        var contentType = info.resHeader['content-type'] || info.resHeader['Content-Type'];
        if (contentType) {
            singleRecord.mime = contentType.split(';')[0];
        }
        else {
            singleRecord.mime = '';
        }
        singleRecord.duration = info.endTime - info.startTime;
    }
    else {
        singleRecord.statusCode = '';
        singleRecord.endTime = '';
        singleRecord.resHeader = '';
        singleRecord.length = '';
        singleRecord.mime = '';
        singleRecord.duration = '';
    }
    return singleRecord;
}
var Recorder = /** @class */ (function (_super) {
    __extends(Recorder, _super);
    function Recorder(config) {
        var _this = _super.call(this, config) || this;
        _this.globalId = 1;
        _this.cachePath = getCacheDir();
        _this.db = new Datastore();
        _this.db.persistence.setAutocompactionInterval(5001);
        _this.recordBodyMap = []; // id - body
        return _this;
    }
    Recorder.prototype.emitUpdate = function (id, info) {
        var self = this;
        if (info) {
            self.emit('update', info);
        }
        else {
            self.getSingleRecord(id, function (err, doc) {
                if (!err && !!doc && !!doc[0]) {
                    self.emit('update', doc[0]);
                }
            });
        }
    };
    Recorder.prototype.emitUpdateLatestWsMessage = function (id, message) {
        this.emit('updateLatestWsMsg', message);
    };
    Recorder.prototype.updateRecord = function (id, info) {
        if (id < 0)
            return;
        var self = this;
        var db = self.db;
        var finalInfo = normalizeInfo(id, info);
        db.update({ _id: id }, finalInfo);
        self.updateRecordBody(id, info);
        self.emitUpdate(id, finalInfo);
    };
    /**
    * This method shall be called at each time there are new message
    *
    */
    Recorder.prototype.updateRecordWsMessage = function (id, message) {
        var cachePath = this.cachePath;
        if (id < 0)
            return;
        try {
            var recordWsMessageFile = path.join(cachePath, WS_MESSAGE_FILE_PRFIX + id);
            fs.appendFile(recordWsMessageFile, wsMessageStingify(message) + ',', function () { });
        }
        catch (e) {
            console.error(e);
            logUtil.error(e.message + e.stack);
        }
        this.emitUpdateLatestWsMessage(id, {
            id: id,
            message: message
        });
    };
    Recorder.prototype.updateExtInfo = function (id, extInfo) {
        var self = this;
        var db = self.db;
        db.update({ _id: id }, { $set: { ext: extInfo } }, {}, function (err, nums) {
            if (!err) {
                self.emitUpdate(id);
            }
        });
    };
    Recorder.prototype.appendRecord = function (info) {
        if (info.req.headers.anyproxy_web_req) { //TODO request from web interface
            return -1;
        }
        var self = this;
        var db = self.db;
        var thisId = self.globalId++;
        var finalInfo = normalizeInfo(thisId, info);
        db.insert(finalInfo);
        self.updateRecordBody(thisId, info);
        self.emitUpdate(thisId, finalInfo);
        return thisId;
    };
    Recorder.prototype.updateRecordBody = function (id, info) {
        var self = this;
        var cachePath = self.cachePath;
        if (id === -1)
            return;
        if (!id || typeof info.resBody === 'undefined')
            return;
        //add to body map
        //ignore image data
        var bodyFile = path.join(cachePath, BODY_FILE_PRFIX + id);
        fs.writeFile(bodyFile, info.resBody, function () { });
    };
    /**
    * get body and websocket file
    *
    */
    Recorder.prototype.getBody = function (id, cb) {
        var self = this;
        var cachePath = self.cachePath;
        if (id < 0) {
            cb && cb('');
        }
        var bodyFile = path.join(cachePath, BODY_FILE_PRFIX + id);
        fs.access(bodyFile, fs.F_OK || fs.R_OK, function (err) {
            if (err) {
                cb && cb(err);
            }
            else {
                fs.readFile(bodyFile, cb);
            }
        });
    };
    Recorder.prototype.getDecodedBody = function (id, cb) {
        var self = this;
        var result = {
            method: '',
            type: 'unknown',
            mime: '',
            content: ''
        };
        self.getSingleRecord(id, function (err, doc) {
            //check whether this record exists
            if (!doc || !doc[0]) {
                cb(new Error('failed to find record for this id'));
                return;
            }
            // also put the `method` back, so the client can decide whether to load ws messages
            result.method = doc[0].method;
            self.getBody(id, function (error, bodyContent) {
                if (error) {
                    cb(error);
                }
                else if (!bodyContent) {
                    cb(null, result);
                }
                else {
                    var record = doc[0], resHeader = record.resHeader || {};
                    try {
                        var headerStr = JSON.stringify(resHeader), charsetMatch = headerStr.match(/charset='?([a-zA-Z0-9-]+)'?/), contentType = resHeader && (resHeader['content-type'] || resHeader['Content-Type']);
                        if (charsetMatch && charsetMatch.length) {
                            var currentCharset = charsetMatch[1].toLowerCase();
                            if (currentCharset !== 'utf-8' && iconv.encodingExists(currentCharset)) {
                                bodyContent = iconv.decode(bodyContent, currentCharset);
                            }
                            result.mime = contentType;
                            result.content = bodyContent.toString();
                            result.type = contentType && /application\/json/i.test(contentType) ? 'json' : 'text';
                        }
                        else if (contentType && /image/i.test(contentType)) {
                            result.type = 'image';
                            result.mime = contentType;
                            result.content = bodyContent;
                        }
                        else {
                            result.type = contentType;
                            result.mime = contentType;
                            result.content = bodyContent.toString();
                        }
                        result.fileName = path.basename(record.path);
                        result.statusCode = record.statusCode;
                    }
                    catch (e) {
                        console.error(e);
                    }
                    cb(null, result);
                }
            });
        });
    };
    /**
    * get decoded WebSoket messages
    *
    */
    Recorder.prototype.getDecodedWsMessage = function (id, cb) {
        var self = this;
        var cachePath = self.cachePath;
        if (id < 0) {
            cb && cb([]);
        }
        var wsMessageFile = path.join(cachePath, WS_MESSAGE_FILE_PRFIX + id);
        fs.access(wsMessageFile, fs.F_OK || fs.R_OK, function (err) {
            if (err) {
                cb && cb(err);
            }
            else {
                fs.readFile(wsMessageFile, 'utf8', function (error, content) {
                    if (error) {
                        cb && cb(err);
                    }
                    try {
                        // remove the last dash "," if it has, since it's redundant
                        // and also add brackets to make it a complete JSON structure
                        content = "[" + content.replace(/,$/, '') + "]";
                        var messages = JSON.parse(content);
                        cb(null, messages);
                    }
                    catch (e) {
                        console.error(e);
                        logUtil.error(e.message + e.stack);
                        cb(e);
                    }
                });
            }
        });
    };
    Recorder.prototype.getSingleRecord = function (id, cb) {
        var self = this;
        var db = self.db;
        db.find({ _id: parseInt(id, 10) }, cb);
    };
    Recorder.prototype.getSummaryList = function (cb) {
        var self = this;
        var db = self.db;
        db.find({}, cb);
    };
    Recorder.prototype.getRecords = function (idStart, limit, cb) {
        var self = this;
        var db = self.db;
        limit = limit || 10;
        idStart = typeof idStart === 'number' ? idStart : (self.globalId - limit);
        db.find({ _id: { $gte: parseInt(idStart, 10) } })
            .sort({ _id: 1 })
            .limit(limit)
            .exec(cb);
    };
    Recorder.prototype.clear = function () {
        var self = this;
        proxyUtil.deleteFolderContentsRecursive(self.cachePath, true);
    };
    return Recorder;
}(events.EventEmitter));
module.exports = Recorder;
