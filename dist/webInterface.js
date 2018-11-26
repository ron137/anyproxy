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
var DEFAULT_WEB_PORT = 8002; // port for web interface
var express = require('express'), url = require('url'), bodyParser = require('body-parser'), fs = require('fs'), path = require('path'), events = require('events'), qrCode = require('qrcode-npm'), util = require('./util'), certMgr = require('./certMgr'), wsServer = require('./wsServer'), juicer = require('juicer'), ip = require('ip'), compress = require('compression');
var packageJson = require('../package.json');
var MAX_CONTENT_SIZE = 1024 * 2000; // 2000kb
/**
 *
 *
 * @class webInterface
 * @extends {events.EventEmitter}
 */
var webInterface = /** @class */ (function (_super) {
    __extends(webInterface, _super);
    /**
     * Creates an instance of webInterface.
     *
     * @param {object} config
     * @param {number} config.webPort
     * @param {object} recorder
     *
     * @memberOf webInterface
     */
    function webInterface(config, recorder) {
        var _this = this;
        if (!recorder) {
            throw new Error('recorder is required for web interface');
        }
        _this = _super.call(this) || this;
        var self = _this;
        self.webPort = config.webPort || DEFAULT_WEB_PORT;
        self.recorder = recorder;
        self.config = config || {};
        self.app = _this.getServer();
        self.server = null;
        self.wsServer = null;
        return _this;
    }
    /**
     * get the express server
     */
    webInterface.prototype.getServer = function () {
        var self = this;
        var recorder = self.recorder;
        var ipAddress = ip.address(), 
        // userRule = proxyInstance.proxyRule,
        webBasePath = 'web';
        var ruleSummary = '';
        var customMenu = [];
        try {
            ruleSummary = ''; //userRule.summary();
            customMenu = ''; // userRule._getCustomMenu();
        }
        catch (e) { }
        var myAbsAddress = 'http://' + ipAddress + ':' + self.webPort + '/', staticDir = path.join(__dirname, '../', webBasePath);
        var app = express();
        app.use(compress()); //invoke gzip
        app.use(function (req, res, next) {
            res.setHeader('note', 'THIS IS A REQUEST FROM ANYPROXY WEB INTERFACE');
            return next();
        });
        app.use(bodyParser.json());
        app.get('/latestLog', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            recorder.getRecords(null, 10000, function (err, docs) {
                if (err) {
                    res.end(err.toString());
                }
                else {
                    res.json(docs);
                }
            });
        });
        app.get('/downloadBody', function (req, res) {
            var query = req.query;
            recorder.getDecodedBody(query.id, function (err, result) {
                if (err || !result || !result.content) {
                    res.json({});
                }
                else if (result.mime) {
                    if (query.raw === 'true') {
                        //TODO : cache query result
                        res.type(result.mime).end(result.content);
                    }
                    else if (query.download === 'true') {
                        res.setHeader('Content-disposition', "attachment; filename=" + result.fileName);
                        res.setHeader('Content-type', result.mime);
                        res.end(result.content);
                    }
                }
                else {
                    res.json({});
                }
            });
        });
        app.get('/fetchBody', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            var query = req.query;
            if (query && query.id) {
                recorder.getDecodedBody(query.id, function (err, result) {
                    // 返回下载信息
                    var _resDownload = function (isDownload) {
                        isDownload = typeof isDownload === 'boolean' ? isDownload : true;
                        res.json({
                            id: query.id,
                            type: result.type,
                            method: result.meethod,
                            fileName: result.fileName,
                            ref: "/downloadBody?id=" + query.id + "&download=" + isDownload + "&raw=" + !isDownload
                        });
                    };
                    // 返回内容
                    var _resContent = function () {
                        if (util.getByteSize(result.content || '') > MAX_CONTENT_SIZE) {
                            _resDownload(true);
                            return;
                        }
                        res.json({
                            id: query.id,
                            type: result.type,
                            method: result.method,
                            resBody: result.content
                        });
                    };
                    if (err || !result) {
                        res.json({});
                    }
                    else if (result.statusCode === 200 && result.mime) {
                        if (result.type === 'json' ||
                            result.mime.indexOf('text') === 0 ||
                            // deal with 'application/x-javascript' and 'application/javascript'
                            result.mime.indexOf('javascript') > -1) {
                            _resContent();
                        }
                        else if (result.type === 'image') {
                            _resDownload(false);
                        }
                        else {
                            _resDownload(true);
                        }
                    }
                    else {
                        _resContent();
                    }
                });
            }
            else {
                res.end({});
            }
        });
        app.get('/fetchReqBody', function (req, res) {
            var query = req.query;
            if (query && query.id) {
                recorder.getSingleRecord(query.id, function (err, doc) {
                    if (err || !doc[0]) {
                        console.error(err);
                        res.end('');
                        return;
                    }
                    res.setHeader('Content-disposition', "attachment; filename=request_" + query.id + "_body.txt");
                    res.setHeader('Content-type', 'text/plain');
                    res.end(doc[0].reqBody);
                });
            }
            else {
                res.end('');
            }
        });
        app.get('/fetchWsMessages', function (req, res) {
            var query = req.query;
            if (query && query.id) {
                recorder.getDecodedWsMessage(query.id, function (err, messages) {
                    if (err) {
                        console.error(err);
                        res.json([]);
                        return;
                    }
                    res.json(messages);
                });
            }
            else {
                res.json([]);
            }
        });
        app.get('/fetchCrtFile', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            var _crtFilePath = certMgr.getRootCAFilePath();
            if (_crtFilePath) {
                res.setHeader('Content-Type', 'application/x-x509-ca-cert');
                res.setHeader('Content-Disposition', 'attachment; filename="rootCA.crt"');
                res.end(fs.readFileSync(_crtFilePath, { encoding: null }));
            }
            else {
                res.setHeader('Content-Type', 'text/html');
                res.end('can not file rootCA ,plase use <strong>anyproxy --root</strong> to generate one');
            }
        });
        //make qr code
        app.get('/qr', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            var qr = qrCode.qrcode(4, 'M'), targetUrl = myAbsAddress;
            qr.addData(targetUrl);
            qr.make();
            var qrImageTag = qr.createImgTag(4);
            var resDom = '<a href="__url"> __img <br> click or scan qr code to start client </a>'.replace(/__url/, targetUrl).replace(/__img/, qrImageTag);
            res.setHeader('Content-Type', 'text/html');
            res.end(resDom);
        });
        app.get('/api/getQrCode', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            var qr = qrCode.qrcode(4, 'M'), targetUrl = myAbsAddress + 'fetchCrtFile';
            qr.addData(targetUrl);
            qr.make();
            var qrImageTag = qr.createImgTag(4);
            // resDom = '<a href="__url"> __img <br> click or scan qr code to download rootCA.crt </a>'.replace(/__url/,targetUrl).replace(/__img/,qrImageTag);
            // res.setHeader("Content-Type", "text/html");
            // res.end(resDom);
            var isRootCAFileExists = certMgr.isRootCAFileExists();
            res.json({
                status: 'success',
                url: targetUrl,
                isRootCAFileExists: isRootCAFileExists,
                qrImgDom: qrImageTag
            });
        });
        // response init data
        app.get('/api/getInitData', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            var rootCAExists = certMgr.isRootCAFileExists();
            var rootDirPath = certMgr.getRootDirPath();
            var interceptFlag = false; //proxyInstance.getInterceptFlag(); TODO
            var globalProxyFlag = false; // TODO: proxyInstance.getGlobalProxyFlag();
            res.json({
                status: 'success',
                rootCAExists: rootCAExists,
                rootCADirPath: rootDirPath,
                currentInterceptFlag: interceptFlag,
                currentGlobalProxyFlag: globalProxyFlag,
                ruleSummary: ruleSummary || '',
                ipAddress: util.getAllIpAddress(),
                port: '',
                appVersion: packageJson.version
            });
        });
        app.post('/api/generateRootCA', function (req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            var rootExists = certMgr.isRootCAFileExists();
            if (!rootExists) {
                certMgr.generateRootCA(function () {
                    res.json({
                        status: 'success',
                        code: 'done'
                    });
                });
            }
            else {
                res.json({
                    status: 'success',
                    code: 'root_ca_exists'
                });
            }
        });
        app.use(function (req, res, next) {
            var indexTpl = fs.readFileSync(path.join(staticDir, '/index.html'), { encoding: 'utf8' }), opt = {
                rule: ruleSummary || '',
                customMenu: customMenu || [],
                ipAddress: ipAddress || '127.0.0.1'
            };
            if (url.parse(req.url).pathname === '/') {
                res.setHeader('Content-Type', 'text/html');
                res.end(juicer(indexTpl, opt));
            }
            else {
                next();
            }
        });
        app.use(express.static(staticDir));
        return app;
    };
    webInterface.prototype.start = function () {
        var self = this;
        return new Promise(function (resolve, reject) {
            self.server = self.app.listen(self.webPort);
            self.wsServer = new wsServer({
                server: self.server
            }, self.recorder);
            self.wsServer.start();
            resolve();
        });
    };
    webInterface.prototype.close = function () {
        this.server && this.server.close();
        this.wsServer && this.wsServer.closeAll();
        this.server = null;
        this.wsServer = null;
        this.proxyInstance = null;
    };
    return webInterface;
}(events.EventEmitter));
module.exports = webInterface;
