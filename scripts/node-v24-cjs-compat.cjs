const Module = require('module');
const origResolve = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
  try {
    return origResolve.apply(this, arguments);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      try {
        return origResolve.call(this, request + '/index.js', parent, isMain, options);
      } catch (e1) {}
      try {
        return origResolve.call(this, request + '.js', parent, isMain, options);
      } catch (e2) {}
    }
    throw err;
  }
};
