'use strict';
/*
* handle all request error here,
*
*/
var pug = require('pug');
var path = require('path');
var error502PugFn = pug.compileFile(path.join(__dirname, '../resource/502.pug'));
var certPugFn = pug.compileFile(path.join(__dirname, '../resource/cert_error.pug'));
/**
* get error content for certification issues
*/
function getCertErrorContent(error, fullUrl) {
    var content;
    var title = 'The connection is not private. ';
    var explain = 'There are error with the certfication of the site.';
    switch (error.code) {
        case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY': {
            explain = 'The certfication of the site you are visiting is not issued by a known agency, '
                + 'It usually happenes when the cert is a self-signed one.</br>'
                + 'If you know and trust the site, you can run AnyProxy with option <strong>-ignore-unauthorized-ssl</strong> to continue.';
            break;
        }
        default: {
            explain = '';
            break;
        }
    }
    try {
        content = certPugFn({
            title: title,
            explain: explain,
            code: error.code
        });
    }
    catch (parseErro) {
        content = error.stack;
    }
    return content;
}
/*
* get the default error content
*/
function getDefaultErrorCotent(error, fullUrl) {
    var content;
    try {
        content = error502PugFn({
            error: error,
            url: fullUrl,
            errorStack: error.stack.split(/\n/)
        });
    }
    catch (parseErro) {
        content = error.stack;
    }
    return content;
}
/*
* get mapped error content for each error
*/
module.exports.getErrorContent = function (error, fullUrl) {
    var content = '';
    error = error || {};
    switch (error.code) {
        case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY': {
            content = getCertErrorContent(error, fullUrl);
            break;
        }
        default: {
            content = getDefaultErrorCotent(error, fullUrl);
            break;
        }
    }
    return content;
};
