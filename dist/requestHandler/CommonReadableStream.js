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
var Readable = require('stream').Readable;
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
module.exports = CommonReadableStream;
