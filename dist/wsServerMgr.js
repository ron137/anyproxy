/**
* manage the websocket server
*
*/
var ws = require('ws');
var logUtil = require('./log.js');
var WsServer = ws.Server;
/**
* get a new websocket server based on the server
* @param @required {object} config
                   {string} config.server
                   {handler} config.handler
*/
function getWsServer(config) {
    var wss = new WsServer({
        server: config.server
    });
    wss.on('connection', config.connHandler);
    wss.on('headers', function (headers) {
        headers.push('x-anyproxy-websocket:true');
    });
    wss.on('error', function (e) {
        logUtil.error("error in websocket proxy: " + e.message + ",\r\n " + e.stack);
        console.error('error happened in proxy websocket:', e);
    });
    wss.on('close', function (e) {
        console.error('==> closing the ws server');
    });
    return wss;
}
module.exports.getWsServer = getWsServer;
