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
var EasyCert = require('node-easy-cert');
var co = require('co');
var os = require('os');
var inquirer = require('inquirer');
var util = require('./util');
var logUtil = require('./log');
var options = {
    rootDirPath: util.getAnyProxyPath('certificates'),
    inMemory: false,
    defaultCertAttrs: [
        { name: 'countryName', value: 'CN' },
        { name: 'organizationName', value: 'AnyProxy' },
        { shortName: 'ST', value: 'SH' },
        { shortName: 'OU', value: 'AnyProxy SSL Proxy' }
    ]
};
var easyCert = new EasyCert(options);
var crtMgr = util.merge({}, easyCert);
// rename function
crtMgr.ifRootCAFileExists = easyCert.isRootCAFileExists;
crtMgr.generateRootCA = function (cb) {
    doGenerate(false);
    // set default common name of the cert
    function doGenerate(overwrite) {
        var rootOptions = {
            commonName: 'AnyProxy',
            overwrite: !!overwrite
        };
        easyCert.generateRootCA(rootOptions, function (error, keyPath, crtPath) {
            cb(error, keyPath, crtPath);
        });
    }
};
crtMgr.getCAStatus = function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, co(function () {
                var result, ifExist, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            result = {
                                exist: false,
                            };
                            ifExist = easyCert.isRootCAFileExists();
                            if (!!ifExist) return [3 /*break*/, 1];
                            return [2 /*return*/, result];
                        case 1:
                            result.exist = true;
                            if (!!/^win/.test(process.platform)) return [3 /*break*/, 3];
                            _a = result;
                            return [4 /*yield*/, easyCert.ifRootCATrusted];
                        case 2:
                            _a.trusted = _b.sent();
                            _b.label = 3;
                        case 3: return [2 /*return*/, result];
                    }
                });
            })];
    });
};
/**
 * trust the root ca by command
 */
crtMgr.trustRootCA = function () {
    var platform, rootCAPath, trustInquiry, answer, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                platform = os.platform();
                rootCAPath = crtMgr.getRootCAFilePath();
                trustInquiry = [
                    {
                        type: 'list',
                        name: 'trustCA',
                        message: 'The rootCA is not trusted yet, install it to the trust store now?',
                        choices: ['Yes', "No, I'll do it myself"]
                    }
                ];
                if (!(platform === 'darwin')) return [3 /*break*/, 2];
                return [4 /*yield*/, inquirer.prompt(trustInquiry)];
            case 1:
                answer = _a.sent();
                if (answer.trustCA === 'Yes') {
                    logUtil.info('About to trust the root CA, this may requires your password');
                    result = util.execScriptSync("sudo security add-trusted-cert -d -k /Library/Keychains/System.keychain " + rootCAPath);
                    if (result.status === 0) {
                        logUtil.info('Root CA install, you are ready to intercept the https now');
                    }
                    else {
                        console.error(result);
                        logUtil.info('Failed to trust the root CA, please trust it manually');
                        util.guideToHomePage();
                    }
                }
                else {
                    logUtil.info('Please trust the root CA manually so https interception works');
                    util.guideToHomePage();
                }
                _a.label = 2;
            case 2:
                if (/^win/.test(process.platform)) {
                    logUtil.info('You can install the root CA manually.');
                }
                logUtil.info('The root CA file path is: ' + crtMgr.getRootCAFilePath());
                return [2 /*return*/];
        }
    });
};
module.exports = crtMgr;
