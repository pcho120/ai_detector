/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/pend";
exports.ids = ["vendor-chunks/pend"];
exports.modules = {

/***/ "(rsc)/./node_modules/pend/index.js":
/*!************************************!*\
  !*** ./node_modules/pend/index.js ***!
  \************************************/
/***/ ((module) => {

eval("module.exports = Pend;\n\nfunction Pend() {\n  this.pending = 0;\n  this.max = Infinity;\n  this.listeners = [];\n  this.waiting = [];\n  this.error = null;\n}\n\nPend.prototype.go = function(fn) {\n  if (this.pending < this.max) {\n    pendGo(this, fn);\n  } else {\n    this.waiting.push(fn);\n  }\n};\n\nPend.prototype.wait = function(cb) {\n  if (this.pending === 0) {\n    cb(this.error);\n  } else {\n    this.listeners.push(cb);\n  }\n};\n\nPend.prototype.hold = function() {\n  return pendHold(this);\n};\n\nfunction pendHold(self) {\n  self.pending += 1;\n  var called = false;\n  return onCb;\n  function onCb(err) {\n    if (called) throw new Error(\"callback called twice\");\n    called = true;\n    self.error = self.error || err;\n    self.pending -= 1;\n    if (self.waiting.length > 0 && self.pending < self.max) {\n      pendGo(self, self.waiting.shift());\n    } else if (self.pending === 0) {\n      var listeners = self.listeners;\n      self.listeners = [];\n      listeners.forEach(cbListener);\n    }\n  }\n  function cbListener(listener) {\n    listener(self.error);\n  }\n}\n\nfunction pendGo(self, fn) {\n  fn(pendHold(self));\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvcGVuZC9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0o7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLElBQUk7QUFDSjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsiL2hvbWUvcGF1bC9kZXYvcGVyc29uYWwvcHJvamVjdHMvYWlfZGV0ZWN0b3Ivbm9kZV9tb2R1bGVzL3BlbmQvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsibW9kdWxlLmV4cG9ydHMgPSBQZW5kO1xuXG5mdW5jdGlvbiBQZW5kKCkge1xuICB0aGlzLnBlbmRpbmcgPSAwO1xuICB0aGlzLm1heCA9IEluZmluaXR5O1xuICB0aGlzLmxpc3RlbmVycyA9IFtdO1xuICB0aGlzLndhaXRpbmcgPSBbXTtcbiAgdGhpcy5lcnJvciA9IG51bGw7XG59XG5cblBlbmQucHJvdG90eXBlLmdvID0gZnVuY3Rpb24oZm4pIHtcbiAgaWYgKHRoaXMucGVuZGluZyA8IHRoaXMubWF4KSB7XG4gICAgcGVuZEdvKHRoaXMsIGZuKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLndhaXRpbmcucHVzaChmbik7XG4gIH1cbn07XG5cblBlbmQucHJvdG90eXBlLndhaXQgPSBmdW5jdGlvbihjYikge1xuICBpZiAodGhpcy5wZW5kaW5nID09PSAwKSB7XG4gICAgY2IodGhpcy5lcnJvcik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5saXN0ZW5lcnMucHVzaChjYik7XG4gIH1cbn07XG5cblBlbmQucHJvdG90eXBlLmhvbGQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHBlbmRIb2xkKHRoaXMpO1xufTtcblxuZnVuY3Rpb24gcGVuZEhvbGQoc2VsZikge1xuICBzZWxmLnBlbmRpbmcgKz0gMTtcbiAgdmFyIGNhbGxlZCA9IGZhbHNlO1xuICByZXR1cm4gb25DYjtcbiAgZnVuY3Rpb24gb25DYihlcnIpIHtcbiAgICBpZiAoY2FsbGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJjYWxsYmFjayBjYWxsZWQgdHdpY2VcIik7XG4gICAgY2FsbGVkID0gdHJ1ZTtcbiAgICBzZWxmLmVycm9yID0gc2VsZi5lcnJvciB8fCBlcnI7XG4gICAgc2VsZi5wZW5kaW5nIC09IDE7XG4gICAgaWYgKHNlbGYud2FpdGluZy5sZW5ndGggPiAwICYmIHNlbGYucGVuZGluZyA8IHNlbGYubWF4KSB7XG4gICAgICBwZW5kR28oc2VsZiwgc2VsZi53YWl0aW5nLnNoaWZ0KCkpO1xuICAgIH0gZWxzZSBpZiAoc2VsZi5wZW5kaW5nID09PSAwKSB7XG4gICAgICB2YXIgbGlzdGVuZXJzID0gc2VsZi5saXN0ZW5lcnM7XG4gICAgICBzZWxmLmxpc3RlbmVycyA9IFtdO1xuICAgICAgbGlzdGVuZXJzLmZvckVhY2goY2JMaXN0ZW5lcik7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIGNiTGlzdGVuZXIobGlzdGVuZXIpIHtcbiAgICBsaXN0ZW5lcihzZWxmLmVycm9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwZW5kR28oc2VsZiwgZm4pIHtcbiAgZm4ocGVuZEhvbGQoc2VsZikpO1xufVxuIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6WzBdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/pend/index.js\n");

/***/ })

};
;