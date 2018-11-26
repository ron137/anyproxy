/**
* a util to set and get all configuable constant
*
*/
(function () {
    var path = require('path');
    var USER_HOME = process.env.HOME || process.env.USERPROFILE;
    var DEFAULT_ANYPROXY_HOME = path.join(USER_HOME, '/.anyproxy/');
    /**
    * return AnyProxy's home path
    */
    module.exports.getAnyProxyHome = function () {
        var ENV_ANYPROXY_HOME = process.env.ANYPROXY_HOME || '';
        return ENV_ANYPROXY_HOME || DEFAULT_ANYPROXY_HOME;
    };
})();
