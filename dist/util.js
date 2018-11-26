'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// (function (): void {
// const fs = require('fs'),
//   path = require('path'),
//   mime = require('mime-types'),
//   color = require('colorful'),
//   crypto = require('crypto'),
//   Buffer = require('buffer').Buffer,
//   logUtil = require('./log');
var fs = require("fs");
var path = require("path");
var mime = require("mime-types");
var color = require("colorful");
var buffer_1 = require("buffer");
var child_process_1 = require("child_process");
var logUtil = require("./log");
var networkInterfaces = require('os').networkInterfaces();
// {"Content-Encoding":"gzip"} --> {"content-encoding":"gzip"}
function lower_keys(obj) {
    for (var key in obj) {
        var val = obj[key];
        delete obj[key];
        obj[key.toLowerCase()] = val;
    }
    return obj;
}
;
function merge(baseObj, extendObj) {
    for (var key in extendObj) {
        baseObj[key] = extendObj[key];
    }
    return baseObj;
}
;
function getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
}
function getAnyProxyHome() {
    var home = path.join(getUserHome(), '/.anyproxy/');
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }
    return home;
}
function getAnyProxyPath(pathName) {
    var home = getAnyProxyHome();
    var targetPath = path.join(home, pathName);
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath);
    }
    return targetPath;
}
/**
 * 简易字符串render替换
 */
function simpleRender(str, object, regexp) {
    return String(str).replace(regexp || (/\{\{([^{}]+)\}\}/g), function (match, name) {
        if (match.charAt(0) === '\\') {
            return match.slice(1);
        }
        return (object[name] != null) ? object[name] : '';
    });
}
;
/**
 * 读取指定目录下的子目录
 */
function filewalker(root, cb) {
    root = root || process.cwd();
    var ret = {
        directory: [],
        file: []
    };
    fs.readdir(root, function (err, list) {
        if (list && list.length) {
            list.map(function (item) {
                var fullPath = path.join(root, item), stat = fs.lstatSync(fullPath);
                if (stat.isFile()) {
                    ret.file.push({
                        name: item,
                        fullPath: fullPath
                    });
                }
                else if (stat.isDirectory()) {
                    ret.directory.push({
                        name: item,
                        fullPath: fullPath
                    });
                }
            });
        }
        cb && cb.apply(null, [null, ret]);
    });
}
;
/*
* 获取文件所对应的content-type以及content-length等信息
* 比如在useLocalResponse的时候会使用到
*/
function contentType(filepath) {
    return mime.contentType(path.extname(filepath)) || '';
}
;
/*
* 读取file的大小，以byte为单位
*/
function contentLength(filepath) {
    try {
        var stat = fs.statSync(filepath);
        return stat.size;
    }
    catch (e) {
        logUtil.printLog(color.red('\nfailed to ready local file : ' + filepath));
        logUtil.printLog(color.red(e));
        return 0;
    }
}
;
/*
* remove the cache before requiring, the path SHOULD BE RELATIVE TO UTIL.JS
*/
function freshRequire(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
;
/*
* format the date string
* @param date Date or timestamp
* @param formatter YYYYMMDDHHmmss
*/
function formatDate(date, formatter) {
    var finalDate;
    if (typeof date !== 'object') {
        finalDate = new Date(date);
    }
    else {
        finalDate = date;
    }
    var transform = function (value) {
        return value < 10 ? '0' + value : value;
    };
    return formatter.replace(/^YYYY|MM|DD|hh|mm|ss/g, function (match) {
        switch (match) {
            case 'YYYY':
                return transform(finalDate.getFullYear());
            case 'MM':
                return transform(finalDate.getMonth() + 1);
            case 'mm':
                return transform(finalDate.getMinutes());
            case 'DD':
                return transform(finalDate.getDate());
            case 'hh':
                return transform(finalDate.getHours());
            case 'ss':
                return transform(finalDate.getSeconds());
            default:
                return '';
        }
    });
}
;
/**
* get headers(Object) from rawHeaders(Array)
* @param rawHeaders  [key, value, key2, value2, ...]

*/
function getHeaderFromRawHeaders(rawHeaders) {
    var headerObj = {};
    var _handleSetCookieHeader = function (key, value) {
        if (headerObj[key].constructor === Array) {
            headerObj[key].push(value);
        }
        else {
            headerObj[key] = [headerObj[key], value];
        }
    };
    if (!!rawHeaders) {
        for (var i = 0; i < rawHeaders.length; i += 2) {
            var key = rawHeaders[i];
            var value = rawHeaders[i + 1];
            if (typeof value === 'string') {
                value = value.replace(/\0+$/g, ''); // 去除 \u0000的null字符串
            }
            if (!headerObj[key]) {
                headerObj[key] = value;
            }
            else {
                // headers with same fields could be combined with comma. Ref: https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.2
                // set-cookie should NOT be combined. Ref: https://tools.ietf.org/html/rfc6265
                if (key.toLowerCase() === 'set-cookie') {
                    _handleSetCookieHeader(key, value);
                }
                else {
                    headerObj[key] = headerObj[key] + ',' + value;
                }
            }
        }
    }
    return headerObj;
}
;
function getAllIpAddress() {
    var allIp = [];
    Object.keys(networkInterfaces).map(function (nic) {
        networkInterfaces[nic].filter(function (detail) {
            if (detail.family.toLowerCase() === 'ipv4') {
                allIp.push(detail.address);
            }
        });
    });
    return allIp.length ? allIp : ['127.0.0.1'];
}
;
function deleteFolderContentsRecursive(dirPath, ifClearFolderItself) {
    if (!dirPath.trim() || dirPath === '/') {
        throw new Error('can_not_delete_this_dir');
    }
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(function (file) {
            var curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderContentsRecursive(curPath, true);
            }
            else { // delete all files
                fs.unlinkSync(curPath);
            }
        });
        if (ifClearFolderItself) {
            try {
                // ref: https://github.com/shelljs/shelljs/issues/49
                var start = Date.now();
                while (true) {
                    try {
                        fs.rmdirSync(dirPath);
                        break;
                    }
                    catch (er) {
                        if (process.platform === 'win32' && (er.code === 'ENOTEMPTY' || er.code === 'EBUSY' || er.code === 'EPERM')) {
                            // Retry on windows, sometimes it takes a little time before all the files in the directory are gone
                            if (Date.now() - start > 1000)
                                throw er;
                        }
                        else if (er.code === 'ENOENT') {
                            break;
                        }
                        else {
                            throw er;
                        }
                    }
                }
            }
            catch (e) {
                throw new Error('could not remove directory (code ' + e.code + '): ' + dirPath);
            }
        }
    }
}
function getFreePort() {
    return new Promise(function (resolve, reject) {
        var server = require('net').createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, function () {
            var port = server.address().port;
            server.close(function () {
                resolve(port);
            });
        });
    });
}
function collectErrorLog(error) {
    if (error && error.code && error.toString()) {
        return error.toString();
    }
    else {
        var result = [error, error.stack].join('\n');
        try {
            var errorString = error.toString();
            if (errorString.indexOf('You may only yield a function') >= 0) {
                result = 'Function is not yieldable. Did you forget to provide a generator or promise in rule file ? \nFAQ http://anyproxy.io/4.x/#faq';
            }
        }
        catch (e) { }
        return result;
    }
}
function isFunc(source) {
    return source && Object.prototype.toString.call(source) === '[object Function]';
}
;
/**
* @param {object} content
* @returns the size of the content
*/
function getByteSize(content) {
    return buffer_1.Buffer.byteLength(content);
}
;
/*
* identify whether the
*/
function isIpDomain(domain) {
    if (!domain) {
        return false;
    }
    var ipReg = /^\d+?\.\d+?\.\d+?\.\d+?$/;
    return ipReg.test(domain);
}
;
function execScriptSync(cmd) {
    var stdout, status = 0;
    try {
        stdout = child_process_1.execSync(cmd);
    }
    catch (err) {
        stdout = err.stdout;
        status = err.status;
    }
    return {
        stdout: stdout.toString(),
        status: status
    };
}
;
function guideToHomePage() {
    logUtil.info('Refer to http://anyproxy.io for more detail');
}
;
var Util = {
    lower_keys: lower_keys,
    merge: merge,
    getUserHome: getUserHome,
    contentType: contentType,
    getAnyProxyPath: getAnyProxyPath,
    getAnyProxyHome: getAnyProxyHome,
    simpleRender: simpleRender,
    filewalker: filewalker,
    contentLength: contentLength,
    freshRequire: freshRequire,
    getHeaderFromRawHeaders: getHeaderFromRawHeaders,
    getAllIpAddress: getAllIpAddress,
    getFreePort: getFreePort,
    collectErrorLog: collectErrorLog,
    isFunc: isFunc,
    isIpDomain: isIpDomain,
    getByteSize: getByteSize,
    deleteFolderContentsRecursive: deleteFolderContentsRecursive,
    execScriptSync: execScriptSync,
    guideToHomePage: guideToHomePage,
    formatDate: formatDate
};
exports.default = Util;
module.exports = Util;
