globalThis.monorepoPackagePath = "";globalThis.openNextDebug = false;globalThis.openNextVersion = "4.1.16";globalThis.nextVersion = "15.5.29";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod3) => function __require2() {
  try {
    return mod3 || (0, cb[__getOwnPropNames(cb)[0]])((mod3 = { exports: {} }).exports, mod3), mod3.exports;
  } catch (e) {
    throw mod3 = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod3, secondTarget) => (__copyProps(target, mod3, "default"), secondTarget && __copyProps(secondTarget, mod3, "default"));
var __toESM = (mod3, isNodeMode, target) => (target = mod3 != null ? __create(__getProtoOf(mod3)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod3 || !mod3.__esModule ? __defProp(target, "default", { value: mod3, enumerable: true }) : target,
  mod3
));
var __toCommonJS = (mod3) => __copyProps(__defProp({}, "__esModule", { value: true }), mod3);

// node_modules/@opennextjs/aws/dist/utils/error.js
function isOpenNextError(e) {
  try {
    return "__openNextInternal" in e;
  } catch {
    return false;
  }
}
var IgnorableError, FatalError;
var init_error = __esm({
  "node_modules/@opennextjs/aws/dist/utils/error.js"() {
    IgnorableError = class extends Error {
      __openNextInternal = true;
      canIgnore = true;
      logLevel = 0;
      constructor(message) {
        super(message);
        this.name = "IgnorableError";
      }
    };
    FatalError = class extends Error {
      __openNextInternal = true;
      canIgnore = false;
      logLevel = 2;
      constructor(message) {
        super(message);
        this.name = "FatalError";
      }
    };
  }
});

// node_modules/@opennextjs/aws/dist/adapters/logger.js
function debug(...args) {
  if (globalThis.openNextDebug) {
    console.log(...args);
  }
}
function warn(...args) {
  console.warn(...args);
}
function error(...args) {
  if (args.some((arg) => isDownplayedErrorLog(arg))) {
    return debug(...args);
  }
  if (args.some((arg) => isOpenNextError(arg))) {
    const error2 = args.find((arg) => isOpenNextError(arg));
    if (error2.logLevel < getOpenNextErrorLogLevel()) {
      return;
    }
    if (error2.logLevel === 0) {
      return console.log(...args.map((arg) => isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg));
    }
    if (error2.logLevel === 1) {
      return warn(...args.map((arg) => isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg));
    }
    return console.error(...args);
  }
  console.error(...args);
}
function getOpenNextErrorLogLevel() {
  const strLevel = process.env.OPEN_NEXT_ERROR_LOG_LEVEL ?? "1";
  switch (strLevel.toLowerCase()) {
    case "debug":
    case "0":
      return 0;
    case "error":
    case "2":
      return 2;
    default:
      return 1;
  }
}
var DOWNPLAYED_ERROR_LOGS, isDownplayedErrorLog;
var init_logger = __esm({
  "node_modules/@opennextjs/aws/dist/adapters/logger.js"() {
    init_error();
    DOWNPLAYED_ERROR_LOGS = [
      {
        clientName: "S3Client",
        commandName: "GetObjectCommand",
        errorName: "NoSuchKey"
      }
    ];
    isDownplayedErrorLog = (errorLog) => DOWNPLAYED_ERROR_LOGS.some((downplayedInput) => downplayedInput.clientName === errorLog?.clientName && downplayedInput.commandName === errorLog?.commandName && (downplayedInput.errorName === errorLog?.error?.name || downplayedInput.errorName === errorLog?.error?.Code));
  }
});

// node_modules/@opennextjs/aws/dist/http/util.js
function parseSetCookieHeader(cookies) {
  if (!cookies) {
    return [];
  }
  if (typeof cookies === "string") {
    return cookies.split(/(?<!Expires=\w+),/i).map((c) => c.trim());
  }
  return cookies;
}
function getQueryFromIterator(it) {
  const query = {};
  for (const [key, value] of it) {
    if (key in query) {
      if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
    } else {
      query[key] = value;
    }
  }
  return query;
}
var parseHeaders, convertHeader;
var init_util = __esm({
  "node_modules/@opennextjs/aws/dist/http/util.js"() {
    init_logger();
    parseHeaders = (headers) => {
      const result = {};
      if (!headers) {
        return result;
      }
      for (const [key, value] of Object.entries(headers)) {
        if (value === void 0) {
          continue;
        }
        const keyLower = key.toLowerCase();
        if (keyLower === "location" && Array.isArray(value)) {
          if (value.length === 1 || value[0] === value[1]) {
            result[keyLower] = value[0];
          } else {
            warn("Multiple different values for Location header found. Using the last one");
            result[keyLower] = value[value.length - 1];
          }
          continue;
        }
        result[keyLower] = convertHeader(value);
      }
      return result;
    };
    convertHeader = (header) => {
      if (typeof header === "string") {
        return header;
      }
      if (Array.isArray(header)) {
        return header.join(",");
      }
      return String(header);
    };
  }
});

// node-built-in-modules:node:module
var node_module_exports = {};
import * as node_module_star from "node:module";
var init_node_module = __esm({
  "node-built-in-modules:node:module"() {
    __reExport(node_module_exports, node_module_star);
  }
});

// node_modules/@opennextjs/aws/dist/utils/stream.js
import { ReadableStream as ReadableStream2 } from "node:stream/web";
function emptyReadableStream() {
  if (process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true") {
    return new ReadableStream2({
      pull(controller) {
        maybeSomethingBuffer ??= Buffer.from("SOMETHING");
        controller.enqueue(maybeSomethingBuffer);
        controller.close();
      }
    }, { highWaterMark: 0 });
  }
  return new ReadableStream2({
    start(controller) {
      controller.close();
    }
  });
}
var maybeSomethingBuffer;
var init_stream = __esm({
  "node_modules/@opennextjs/aws/dist/utils/stream.js"() {
  }
});

// node_modules/@opennextjs/aws/dist/overrides/converters/utils.js
function getQueryFromSearchParams(searchParams) {
  return getQueryFromIterator(searchParams.entries());
}
var init_utils = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/converters/utils.js"() {
    init_util();
  }
});

// node_modules/cookie/dist/index.js
var require_dist = __commonJS({
  "node_modules/cookie/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseCookie = parseCookie;
    exports.parse = parseCookie;
    exports.stringifyCookie = stringifyCookie;
    exports.stringifySetCookie = stringifySetCookie;
    exports.serialize = stringifySetCookie;
    exports.parseSetCookie = parseSetCookie;
    exports.stringifySetCookie = stringifySetCookie;
    exports.serialize = stringifySetCookie;
    var cookieNameRegExp = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;
    var cookieValueRegExp = /^[\u0021-\u003A\u003C-\u007E]*$/;
    var domainValueRegExp = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    var pathValueRegExp = /^[\u0020-\u003A\u003D-\u007E]*$/;
    var maxAgeRegExp = /^-?\d+$/;
    var __toString = Object.prototype.toString;
    var NullObject = /* @__PURE__ */ (() => {
      const C = function() {
      };
      C.prototype = /* @__PURE__ */ Object.create(null);
      return C;
    })();
    function parseCookie(str, options) {
      const obj = new NullObject();
      const len = str.length;
      if (len < 2)
        return obj;
      const dec = options?.decode || decode;
      let index = 0;
      do {
        const eqIdx = eqIndex(str, index, len);
        if (eqIdx === -1)
          break;
        const endIdx = endIndex(str, index, len);
        if (eqIdx > endIdx) {
          index = str.lastIndexOf(";", eqIdx - 1) + 1;
          continue;
        }
        const key = valueSlice(str, index, eqIdx);
        if (obj[key] === void 0) {
          obj[key] = dec(valueSlice(str, eqIdx + 1, endIdx));
        }
        index = endIdx + 1;
      } while (index < len);
      return obj;
    }
    function stringifyCookie(cookie, options) {
      const enc = options?.encode || encodeURIComponent;
      const cookieStrings = [];
      for (const name of Object.keys(cookie)) {
        const val = cookie[name];
        if (val === void 0)
          continue;
        if (!cookieNameRegExp.test(name)) {
          throw new TypeError(`cookie name is invalid: ${name}`);
        }
        const value = enc(val);
        if (!cookieValueRegExp.test(value)) {
          throw new TypeError(`cookie val is invalid: ${val}`);
        }
        cookieStrings.push(`${name}=${value}`);
      }
      return cookieStrings.join("; ");
    }
    function stringifySetCookie(_name, _val, _opts) {
      const cookie = typeof _name === "object" ? _name : { ..._opts, name: _name, value: String(_val) };
      const options = typeof _val === "object" ? _val : _opts;
      const enc = options?.encode || encodeURIComponent;
      if (!cookieNameRegExp.test(cookie.name)) {
        throw new TypeError(`argument name is invalid: ${cookie.name}`);
      }
      const value = cookie.value ? enc(cookie.value) : "";
      if (!cookieValueRegExp.test(value)) {
        throw new TypeError(`argument val is invalid: ${cookie.value}`);
      }
      let str = cookie.name + "=" + value;
      if (cookie.maxAge !== void 0) {
        if (!Number.isInteger(cookie.maxAge)) {
          throw new TypeError(`option maxAge is invalid: ${cookie.maxAge}`);
        }
        str += "; Max-Age=" + cookie.maxAge;
      }
      if (cookie.domain) {
        if (!domainValueRegExp.test(cookie.domain)) {
          throw new TypeError(`option domain is invalid: ${cookie.domain}`);
        }
        str += "; Domain=" + cookie.domain;
      }
      if (cookie.path) {
        if (!pathValueRegExp.test(cookie.path)) {
          throw new TypeError(`option path is invalid: ${cookie.path}`);
        }
        str += "; Path=" + cookie.path;
      }
      if (cookie.expires) {
        if (!isDate(cookie.expires) || !Number.isFinite(cookie.expires.valueOf())) {
          throw new TypeError(`option expires is invalid: ${cookie.expires}`);
        }
        str += "; Expires=" + cookie.expires.toUTCString();
      }
      if (cookie.httpOnly) {
        str += "; HttpOnly";
      }
      if (cookie.secure) {
        str += "; Secure";
      }
      if (cookie.partitioned) {
        str += "; Partitioned";
      }
      if (cookie.priority) {
        const priority = typeof cookie.priority === "string" ? cookie.priority.toLowerCase() : void 0;
        switch (priority) {
          case "low":
            str += "; Priority=Low";
            break;
          case "medium":
            str += "; Priority=Medium";
            break;
          case "high":
            str += "; Priority=High";
            break;
          default:
            throw new TypeError(`option priority is invalid: ${cookie.priority}`);
        }
      }
      if (cookie.sameSite) {
        const sameSite = typeof cookie.sameSite === "string" ? cookie.sameSite.toLowerCase() : cookie.sameSite;
        switch (sameSite) {
          case true:
          case "strict":
            str += "; SameSite=Strict";
            break;
          case "lax":
            str += "; SameSite=Lax";
            break;
          case "none":
            str += "; SameSite=None";
            break;
          default:
            throw new TypeError(`option sameSite is invalid: ${cookie.sameSite}`);
        }
      }
      return str;
    }
    function parseSetCookie(str, options) {
      const dec = options?.decode || decode;
      const len = str.length;
      const endIdx = endIndex(str, 0, len);
      const eqIdx = eqIndex(str, 0, endIdx);
      const setCookie = eqIdx === -1 ? { name: "", value: dec(valueSlice(str, 0, endIdx)) } : {
        name: valueSlice(str, 0, eqIdx),
        value: dec(valueSlice(str, eqIdx + 1, endIdx))
      };
      let index = endIdx + 1;
      while (index < len) {
        const endIdx2 = endIndex(str, index, len);
        const eqIdx2 = eqIndex(str, index, endIdx2);
        const attr = eqIdx2 === -1 ? valueSlice(str, index, endIdx2) : valueSlice(str, index, eqIdx2);
        const val = eqIdx2 === -1 ? void 0 : valueSlice(str, eqIdx2 + 1, endIdx2);
        switch (attr.toLowerCase()) {
          case "httponly":
            setCookie.httpOnly = true;
            break;
          case "secure":
            setCookie.secure = true;
            break;
          case "partitioned":
            setCookie.partitioned = true;
            break;
          case "domain":
            setCookie.domain = val;
            break;
          case "path":
            setCookie.path = val;
            break;
          case "max-age":
            if (val && maxAgeRegExp.test(val))
              setCookie.maxAge = Number(val);
            break;
          case "expires":
            if (!val)
              break;
            const date = new Date(val);
            if (Number.isFinite(date.valueOf()))
              setCookie.expires = date;
            break;
          case "priority":
            if (!val)
              break;
            const priority = val.toLowerCase();
            if (priority === "low" || priority === "medium" || priority === "high") {
              setCookie.priority = priority;
            }
            break;
          case "samesite":
            if (!val)
              break;
            const sameSite = val.toLowerCase();
            if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
              setCookie.sameSite = sameSite;
            }
            break;
        }
        index = endIdx2 + 1;
      }
      return setCookie;
    }
    function endIndex(str, min, len) {
      const index = str.indexOf(";", min);
      return index === -1 ? len : index;
    }
    function eqIndex(str, min, max) {
      const index = str.indexOf("=", min);
      return index < max ? index : -1;
    }
    function valueSlice(str, min, max) {
      let start = min;
      let end = max;
      do {
        const code = str.charCodeAt(start);
        if (code !== 32 && code !== 9)
          break;
      } while (++start < end);
      while (end > start) {
        const code = str.charCodeAt(end - 1);
        if (code !== 32 && code !== 9)
          break;
        end--;
      }
      return str.slice(start, end);
    }
    function decode(str) {
      if (str.indexOf("%") === -1)
        return str;
      try {
        return decodeURIComponent(str);
      } catch (e) {
        return str;
      }
    }
    function isDate(val) {
      return __toString.call(val) === "[object Date]";
    }
  }
});

// node_modules/@opennextjs/aws/dist/overrides/converters/edge.js
var edge_exports = {};
__export(edge_exports, {
  default: () => edge_default
});
import { Buffer as Buffer2 } from "node:buffer";
var import_cookie, NULL_BODY_STATUSES, converter, edge_default;
var init_edge = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/converters/edge.js"() {
    import_cookie = __toESM(require_dist(), 1);
    init_util();
    init_utils();
    NULL_BODY_STATUSES = /* @__PURE__ */ new Set([101, 103, 204, 205, 304]);
    converter = {
      convertFrom: async (event) => {
        const url = new URL(event.url);
        const searchParams = url.searchParams;
        const query = getQueryFromSearchParams(searchParams);
        const headers = {};
        event.headers.forEach((value, key) => {
          headers[key] = value;
        });
        const rawPath = url.pathname;
        const method = event.method;
        const shouldHaveBody = method !== "GET" && method !== "HEAD";
        const body = shouldHaveBody ? Buffer2.from(await event.arrayBuffer()) : void 0;
        const cookieHeader = event.headers.get("cookie");
        const cookies = cookieHeader ? import_cookie.default.parse(cookieHeader) : {};
        return {
          type: "core",
          method,
          rawPath,
          url: event.url,
          body,
          headers,
          remoteAddress: event.headers.get("x-forwarded-for") ?? "::1",
          query,
          cookies
        };
      },
      convertTo: async (result) => {
        if ("internalEvent" in result) {
          const request = new Request(result.internalEvent.url, {
            body: result.internalEvent.body,
            method: result.internalEvent.method,
            headers: {
              ...result.internalEvent.headers,
              "x-forwarded-host": result.internalEvent.headers.host
            }
          });
          if (globalThis.__dangerous_ON_edge_converter_returns_request === true) {
            return request;
          }
          const cfCache = (result.isISR || result.internalEvent.rawPath.startsWith("/_next/image")) && process.env.DISABLE_CACHE !== "true" ? { cacheEverything: true } : {};
          return fetch(request, {
            // This is a hack to make sure that the response is cached by Cloudflare
            // See https://developers.cloudflare.com/workers/examples/cache-using-fetch/#caching-html-resources
            // @ts-expect-error - This is a Cloudflare specific option
            cf: cfCache
          });
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(result.headers)) {
          if (key === "set-cookie" && typeof value === "string") {
            const cookies = parseSetCookieHeader(value);
            for (const cookie of cookies) {
              headers.append(key, cookie);
            }
            continue;
          }
          if (Array.isArray(value)) {
            for (const v of value) {
              headers.append(key, v);
            }
          } else {
            headers.set(key, value);
          }
        }
        const body = NULL_BODY_STATUSES.has(result.statusCode) ? null : result.body;
        return new Response(body, {
          status: result.statusCode,
          headers
        });
      },
      name: "edge"
    };
    edge_default = converter;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/wrappers/cloudflare-node.js
var cloudflare_node_exports = {};
__export(cloudflare_node_exports, {
  default: () => cloudflare_node_default
});
import { Writable } from "node:stream";
var NULL_BODY_STATUSES2, handler, cloudflare_node_default;
var init_cloudflare_node = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/wrappers/cloudflare-node.js"() {
    NULL_BODY_STATUSES2 = /* @__PURE__ */ new Set([101, 204, 205, 304]);
    handler = async (handler3, converter2) => async (request, env, ctx, abortSignal) => {
      globalThis.process = process;
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") {
          process.env[key] = value;
        }
      }
      const internalEvent = await converter2.convertFrom(request);
      const url = new URL(request.url);
      const { promise: promiseResponse, resolve: resolveResponse } = Promise.withResolvers();
      const streamCreator = {
        writeHeaders(prelude) {
          const { statusCode, cookies, headers } = prelude;
          const responseHeaders = new Headers(headers);
          for (const cookie of cookies) {
            responseHeaders.append("Set-Cookie", cookie);
          }
          if (url.hostname === "localhost") {
            responseHeaders.set("Content-Encoding", "identity");
          }
          if (NULL_BODY_STATUSES2.has(statusCode)) {
            const response2 = new Response(null, {
              status: statusCode,
              headers: responseHeaders
            });
            resolveResponse(response2);
            return new Writable({
              write(chunk, encoding, callback) {
                callback();
              }
            });
          }
          let controller;
          const readable = new ReadableStream({
            start(c) {
              controller = c;
            }
          });
          const response = new Response(readable, {
            status: statusCode,
            headers: responseHeaders
          });
          resolveResponse(response);
          return new Writable({
            write(chunk, encoding, callback) {
              try {
                controller.enqueue(chunk);
              } catch (e) {
                return callback(e);
              }
              callback();
            },
            final(callback) {
              controller.close();
              callback();
            },
            destroy(error2, callback) {
              if (error2) {
                controller.error(error2);
              } else {
                try {
                  controller.close();
                } catch {
                }
              }
              callback(error2);
            }
          });
        },
        // This is for passing along the original abort signal from the initial Request you retrieve in your worker
        // Ensures that the response we pass to NextServer is aborted if the request is aborted
        // By doing this `request.signal.onabort` will work in route handlers
        abortSignal,
        // There is no need to retain the chunks that were pushed to the response stream.
        retainChunks: false
      };
      ctx.waitUntil(handler3(internalEvent, {
        streamCreator,
        waitUntil: ctx.waitUntil.bind(ctx)
      }));
      return promiseResponse;
    };
    cloudflare_node_default = {
      wrapper: handler,
      name: "cloudflare-node",
      supportStreaming: true
    };
  }
});

// node_modules/@opennextjs/aws/dist/overrides/tagCache/dummy.js
var dummy_exports = {};
__export(dummy_exports, {
  default: () => dummy_default
});
var dummyTagCache, dummy_default;
var init_dummy = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/tagCache/dummy.js"() {
    dummyTagCache = {
      name: "dummy",
      mode: "original",
      getByPath: async () => {
        return [];
      },
      getByTag: async () => {
        return [];
      },
      getLastModified: async (_, lastModified) => {
        return lastModified ?? Date.now();
      },
      writeTags: async () => {
        return;
      },
      isStale: async (_path) => {
        return false;
      }
    };
    dummy_default = dummyTagCache;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/queue/dummy.js
var dummy_exports2 = {};
__export(dummy_exports2, {
  default: () => dummy_default2
});
var dummyQueue, dummy_default2;
var init_dummy2 = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/queue/dummy.js"() {
    init_error();
    dummyQueue = {
      name: "dummy",
      send: async () => {
        throw new FatalError("Dummy queue is not implemented");
      }
    };
    dummy_default2 = dummyQueue;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/incrementalCache/dummy.js
var dummy_exports3 = {};
__export(dummy_exports3, {
  default: () => dummy_default3
});
var dummyIncrementalCache, dummy_default3;
var init_dummy3 = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/incrementalCache/dummy.js"() {
    init_error();
    dummyIncrementalCache = {
      name: "dummy",
      get: async () => {
        throw new IgnorableError('"Dummy" cache does not cache anything');
      },
      set: async () => {
        throw new IgnorableError('"Dummy" cache does not cache anything');
      },
      delete: async () => {
        throw new IgnorableError('"Dummy" cache does not cache anything');
      }
    };
    dummy_default3 = dummyIncrementalCache;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/assetResolver/dummy.js
var dummy_exports4 = {};
__export(dummy_exports4, {
  default: () => dummy_default4
});
var resolver, dummy_default4;
var init_dummy4 = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/assetResolver/dummy.js"() {
    resolver = {
      name: "dummy"
    };
    dummy_default4 = resolver;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/proxyExternalRequest/fetch.js
var fetch_exports = {};
__export(fetch_exports, {
  default: () => fetch_default
});
var fetchProxy, fetch_default;
var init_fetch = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/proxyExternalRequest/fetch.js"() {
    init_stream();
    fetchProxy = {
      name: "fetch-proxy",
      // @ts-ignore
      proxy: async (internalEvent) => {
        const { url, headers: eventHeaders, method, body } = internalEvent;
        const headers = Object.fromEntries(Object.entries(eventHeaders).filter(([key]) => !["cf-connecting-ip", "x-forwarded-host"].includes(key.toLowerCase())));
        if (eventHeaders.host) {
          headers["x-forwarded-host"] = eventHeaders.host;
        }
        const response = await fetch(url, {
          method,
          headers,
          body
        });
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
          const cur = responseHeaders[key];
          if (cur === void 0) {
            responseHeaders[key] = value;
          } else if (Array.isArray(cur)) {
            cur.push(value);
          } else {
            responseHeaders[key] = [cur, value];
          }
        });
        return {
          type: "core",
          headers: responseHeaders,
          statusCode: response.status,
          isBase64Encoded: true,
          body: response.body ?? emptyReadableStream()
        };
      }
    };
    fetch_default = fetchProxy;
  }
});

// node_modules/@opennextjs/aws/dist/overrides/cdnInvalidation/dummy.js
var dummy_exports5 = {};
__export(dummy_exports5, {
  default: () => dummy_default5
});
var dummy_default5;
var init_dummy5 = __esm({
  "node_modules/@opennextjs/aws/dist/overrides/cdnInvalidation/dummy.js"() {
    dummy_default5 = {
      name: "dummy",
      invalidatePaths: (_) => {
        return Promise.resolve();
      }
    };
  }
});

// node_modules/@opennextjs/aws/dist/core/createMainHandler.js
init_logger();

// node_modules/@opennextjs/aws/dist/adapters/util.js
function setNodeEnv() {
  const processEnv = process.env;
  processEnv.NODE_ENV = process.env.NODE_ENV ?? "production";
}
function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

// node_modules/@opennextjs/aws/dist/core/requestHandler.js
import { AsyncLocalStorage } from "node:async_hooks";

// node_modules/@opennextjs/aws/dist/http/openNextResponse.js
init_logger();
import { Transform } from "node:stream";

// node_modules/@opennextjs/aws/dist/utils/cacheHeaders.js
var CACHE_CONTROL_HEADER = "cache-control";
var NEXTJS_CACHE_HEADER = "x-nextjs-cache";
var ISR_HEADER = "x-isr";
var NO_STORE_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";
function fixCacheControlForError(headers, statusCode) {
  if (process.env.OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS === "true") {
    return;
  }
  if (statusCode === 404 || statusCode === 500) {
    headers[CACHE_CONTROL_HEADER] = NO_STORE_CACHE_CONTROL;
  }
}

// node_modules/@opennextjs/aws/dist/http/openNextResponse.js
init_util();
var SET_COOKIE_HEADER = "set-cookie";
var CANNOT_BE_USED = "This cannot be used in OpenNext";
var OpenNextNodeResponse = class extends Transform {
  fixHeadersFn;
  onEnd;
  streamCreator;
  initialHeaders;
  statusCode;
  statusMessage = "";
  headers = {};
  headersSent = false;
  _chunks = [];
  headersAlreadyFixed = false;
  _cookies = [];
  responseStream;
  bodyLength = 0;
  // To comply with the ServerResponse interface :
  strictContentLength = false;
  assignSocket(_socket) {
    throw new Error(CANNOT_BE_USED);
  }
  detachSocket(_socket) {
    throw new Error(CANNOT_BE_USED);
  }
  // We might have to revisit those 3 in the future
  writeContinue(_callback) {
    throw new Error(CANNOT_BE_USED);
  }
  writeEarlyHints(_hints, _callback) {
    throw new Error(CANNOT_BE_USED);
  }
  writeProcessing() {
    throw new Error(CANNOT_BE_USED);
  }
  /**
   * This is a dummy request object to comply with the ServerResponse interface
   * It will never be defined
   */
  req;
  chunkedEncoding = false;
  shouldKeepAlive = true;
  useChunkedEncodingByDefault = true;
  sendDate = false;
  connection = null;
  socket = null;
  setTimeout(_msecs, _callback) {
    throw new Error(CANNOT_BE_USED);
  }
  addTrailers(_headers) {
    throw new Error(CANNOT_BE_USED);
  }
  constructor(fixHeadersFn, onEnd, streamCreator, initialHeaders, statusCode) {
    super();
    this.fixHeadersFn = fixHeadersFn;
    this.onEnd = onEnd;
    this.streamCreator = streamCreator;
    this.initialHeaders = initialHeaders;
    if (statusCode && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
      this.statusCode = statusCode;
    }
    streamCreator?.abortSignal?.addEventListener("abort", () => {
      this.destroy();
    });
  }
  // Necessary for next 12
  // We might have to implement all the methods here
  get originalResponse() {
    return this;
  }
  get finished() {
    return this.responseStream ? this.responseStream?.writableFinished : this.writableFinished;
  }
  setHeader(name, value) {
    const key = name.toLowerCase();
    if (key === SET_COOKIE_HEADER) {
      if (Array.isArray(value)) {
        this._cookies = value;
      } else {
        this._cookies = [value];
      }
    }
    this.headers[key] = value;
    return this;
  }
  removeHeader(name) {
    const key = name.toLowerCase();
    if (key === SET_COOKIE_HEADER) {
      this._cookies = [];
    } else {
      delete this.headers[key];
    }
    return this;
  }
  hasHeader(name) {
    const key = name.toLowerCase();
    if (key === SET_COOKIE_HEADER) {
      return this._cookies.length > 0;
    }
    return this.headers[key] !== void 0;
  }
  getHeaders() {
    return this.headers;
  }
  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }
  getHeaderNames() {
    return Object.keys(this.headers);
  }
  // Only used directly in next@14+
  flushHeaders() {
    this.headersSent = true;
    const mergeHeadersPriority = globalThis.__openNextAls?.getStore()?.mergeHeadersPriority ?? "middleware";
    if (this.initialHeaders) {
      this.headers = mergeHeadersPriority === "middleware" ? {
        ...this.headers,
        ...this.initialHeaders
      } : {
        ...this.initialHeaders,
        ...this.headers
      };
      const initialCookies = parseSetCookieHeader(this.initialHeaders[SET_COOKIE_HEADER]?.toString());
      this._cookies = mergeHeadersPriority === "middleware" ? [...this._cookies, ...initialCookies] : [...initialCookies, ...this._cookies];
    }
    this.fixHeaders(this.headers);
    this.fixHeadersForError();
    this.headers[SET_COOKIE_HEADER] = this._cookies;
    const parsedHeaders = parseHeaders(this.headers);
    delete parsedHeaders[SET_COOKIE_HEADER];
    if (this.streamCreator) {
      this.responseStream = this.streamCreator?.writeHeaders({
        statusCode: this.statusCode ?? 200,
        cookies: this._cookies,
        headers: parsedHeaders
      });
      this.pipe(this.responseStream);
    }
  }
  appendHeader(name, value) {
    const key = name.toLowerCase();
    if (!this.hasHeader(key)) {
      return this.setHeader(key, value);
    }
    const existingHeader = this.getHeader(key);
    const toAppend = Array.isArray(value) ? value : [value];
    const newValue = Array.isArray(existingHeader) ? [...existingHeader, ...toAppend] : [existingHeader, ...toAppend];
    return this.setHeader(key, newValue);
  }
  writeHead(statusCode, statusMessage, headers) {
    let _headers = headers;
    let _statusMessage;
    if (typeof statusMessage === "string") {
      _statusMessage = statusMessage;
    } else {
      _headers = statusMessage;
    }
    const finalHeaders = this.headers;
    if (_headers) {
      if (Array.isArray(_headers)) {
        for (let i = 0; i < _headers.length; i += 2) {
          finalHeaders[_headers[i]] = _headers[i + 1];
        }
      } else {
        for (const key of Object.keys(_headers)) {
          finalHeaders[key] = _headers[key];
        }
      }
    }
    this.statusCode = statusCode;
    if (headers) {
      this.headers = finalHeaders;
    }
    this.flushHeaders();
    return this;
  }
  /**
   * OpenNext specific method
   */
  fixHeaders(headers) {
    if (this.headersAlreadyFixed) {
      return;
    }
    this.fixHeadersFn(headers);
    this.headersAlreadyFixed = true;
  }
  getFixedHeaders() {
    this.fixHeaders(this.headers);
    this.fixHeadersForError();
    this.headers[SET_COOKIE_HEADER] = this._cookies;
    return this.headers;
  }
  getBody() {
    return Buffer.concat(this._chunks);
  }
  _internalWrite(chunk, encoding) {
    const buffer = encoding === "buffer" ? chunk : Buffer.from(chunk, encoding);
    this.bodyLength += buffer.length;
    if (this.streamCreator?.retainChunks !== false) {
      this._chunks.push(buffer);
    }
    this.push(buffer);
    this.streamCreator?.onWrite?.();
  }
  _transform(chunk, encoding, callback) {
    if (!this.headersSent) {
      this.flushHeaders();
    }
    this._internalWrite(chunk, encoding);
    callback();
  }
  _flush(callback) {
    if (!this.headersSent) {
      this.flushHeaders();
    }
    globalThis.__openNextAls?.getStore()?.pendingPromiseRunner.add(this.onEnd(this.headers));
    this.streamCreator?.onFinish?.(this.bodyLength);
    if (this.bodyLength === 0 && // We use an env variable here because not all aws account have the same behavior
    // On some aws accounts the response will hang if the body is empty
    // We are modifying the response body here, this is not a good practice
    process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true") {
      debug('Force writing "SOMETHING" to the response body');
      this.push("SOMETHING");
    }
    callback();
  }
  /**
   * New method in Node 18.15+
   * There are probably not used right now in Next.js, but better be safe than sorry
   */
  setHeaders(headers) {
    headers.forEach((value, key) => {
      this.setHeader(key, Array.isArray(value) ? value : value.toString());
    });
    return this;
  }
  /**
   * Next specific methods
   * On earlier versions of next.js, those methods are mandatory to make everything work
   */
  get sent() {
    return this.finished || this.headersSent;
  }
  getHeaderValues(name) {
    const values = this.getHeader(name);
    if (values === void 0)
      return void 0;
    return (Array.isArray(values) ? values : [values]).map((value) => value.toString());
  }
  send() {
    for (const chunk of this._chunks) {
      this.write(chunk);
    }
    this.end();
  }
  body(value) {
    this.write(value);
    return this;
  }
  onClose(callback) {
    this.on("close", callback);
  }
  redirect(destination, statusCode) {
    this.setHeader("Location", destination);
    this.statusCode = statusCode;
    if (statusCode === 308) {
      this.setHeader("Refresh", `0;url=${destination}`);
    }
    return this;
  }
  // For some reason, next returns the 500 error page with some cache-control headers
  // We need to fix that
  fixHeadersForError() {
    fixCacheControlForError(this.headers, this.statusCode);
  }
};

// node_modules/@opennextjs/aws/dist/http/request.js
import http from "node:http";
var IncomingMessage = class extends http.IncomingMessage {
  constructor({ method, url, headers, body, remoteAddress }) {
    super({
      encrypted: true,
      readable: false,
      remoteAddress,
      address: () => ({ port: 443 }),
      end: Function.prototype,
      destroy: Function.prototype
    });
    if (body) {
      headers["content-length"] ??= String(Buffer.byteLength(body));
    }
    Object.assign(this, {
      ip: remoteAddress,
      complete: true,
      httpVersion: "1.1",
      httpVersionMajor: "1",
      httpVersionMinor: "1",
      method,
      headers,
      body,
      url
    });
    this._read = () => {
      this.push(body);
      this.push(null);
    };
  }
};

// node_modules/@opennextjs/aws/dist/utils/promise.js
init_logger();

// node_modules/@opennextjs/aws/dist/utils/requestCache.js
var RequestCache = class {
  _caches = /* @__PURE__ */ new Map();
  /**
   * Returns the Map registered under `key`.
   * If no Map exists yet for that key, a new empty Map is created, stored, and returned.
   * Repeated calls with the same key always return the **same** Map instance.
   */
  getOrCreate(key) {
    let cache = this._caches.get(key);
    if (!cache) {
      cache = /* @__PURE__ */ new Map();
      this._caches.set(key, cache);
    }
    return cache;
  }
};

// node_modules/@opennextjs/aws/dist/utils/promise.js
var DetachedPromise = class {
  resolve;
  reject;
  promise;
  constructor() {
    let resolve;
    let reject;
    this.promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.resolve = resolve;
    this.reject = reject;
  }
};
var DetachedPromiseRunner = class {
  promises = [];
  /**
   * Create a deferred promise tracked by this runner.
   *
   * @returns The tracked promise and its resolve/reject functions.
   */
  withResolvers() {
    const detachedPromise = new DetachedPromise();
    this.add(detachedPromise.promise);
    return detachedPromise;
  }
  /**
   * Track background work and handle failures immediately.
   *
   * @param promise Work to await, including work registered during an active drain.
   * @returns Nothing; failures are logged rather than propagated.
   */
  add(promise) {
    this.promises.push(promise.then(() => {
    }, error));
  }
  /**
   * Drain tracked work, including additions made while earlier work is pending.
   *
   * Work started after the drain has settled still needs a new runtime waitUntil.
   * @returns Resolves when all work registered during this drain has settled.
   */
  async await() {
    debug(`Awaiting ${this.promises.length} detached promises`);
    let awaited = 0;
    while (awaited < this.promises.length) {
      const batch = this.promises.slice(awaited);
      awaited = this.promises.length;
      await Promise.all(batch);
    }
  }
};
async function awaitAllDetachedPromise() {
  const store = globalThis.__openNextAls.getStore();
  const promisesToAwait = store?.pendingPromiseRunner.await() ?? Promise.resolve();
  if (store?.waitUntil) {
    store.waitUntil(promisesToAwait);
    return;
  }
  await promisesToAwait;
}
function provideNextAfterProvider() {
  const NEXT_REQUEST_CONTEXT_SYMBOL = /* @__PURE__ */ Symbol.for("@next/request-context");
  const VERCEL_REQUEST_CONTEXT_SYMBOL = /* @__PURE__ */ Symbol.for("@vercel/request-context");
  const nextAfterContext = {
    get: () => {
      const store = globalThis.__openNextAls.getStore();
      return {
        waitUntil: store?.waitUntil ?? ((promise) => store?.pendingPromiseRunner.add(promise))
      };
    }
  };
  globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] = nextAfterContext;
  if (process.env.EMULATE_VERCEL_REQUEST_CONTEXT) {
    globalThis[VERCEL_REQUEST_CONTEXT_SYMBOL] = nextAfterContext;
  }
}
function runWithOpenNextRequestContext({ isISRRevalidation, waitUntil, requestId = Math.random().toString(36) }, fn) {
  return globalThis.__openNextAls.run({
    requestId,
    pendingPromiseRunner: new DetachedPromiseRunner(),
    isISRRevalidation,
    waitUntil,
    writtenTags: /* @__PURE__ */ new Set(),
    requestCache: new RequestCache()
  }, async () => {
    provideNextAfterProvider();
    let result;
    try {
      result = await fn();
    } finally {
      await awaitAllDetachedPromise();
    }
    return result;
  });
}

// node_modules/@opennextjs/aws/dist/utils/semver.js
function compareSemver(v1, operator, v2) {
  let versionDiff = 0;
  if (v1 === "latest") {
    versionDiff = 1;
  } else {
    if (/^[^\d]/.test(v1)) {
      v1 = v1.substring(1);
    }
    if (/^[^\d]/.test(v2)) {
      v2 = v2.substring(1);
    }
    const [major1, minor1 = 0, patch1 = 0] = v1.split(".").map(Number);
    const [major2, minor2 = 0, patch2 = 0] = v2.split(".").map(Number);
    if (Number.isNaN(major1) || Number.isNaN(major2)) {
      throw new Error("The major version is required.");
    }
    if (major1 !== major2) {
      versionDiff = major1 - major2;
    } else if (minor1 !== minor2) {
      versionDiff = minor1 - minor2;
    } else if (patch1 !== patch2) {
      versionDiff = patch1 - patch2;
    }
  }
  switch (operator) {
    case "=":
      return versionDiff === 0;
    case ">=":
      return versionDiff >= 0;
    case "<=":
      return versionDiff <= 0;
    case ">":
      return versionDiff > 0;
    case "<":
      return versionDiff < 0;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

// node_modules/@opennextjs/aws/dist/adapters/config/index.js
init_logger();
import path from "node:path";
globalThis.__dirname ??= "";
var NEXT_DIR = path.join(__dirname, ".next");
var OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
debug({ NEXT_DIR, OPEN_NEXT_DIR });
var NextConfig = { "env": {}, "webpack": null, "eslint": { "ignoreDuringBuilds": false }, "typescript": { "ignoreBuildErrors": false, "tsconfigPath": "tsconfig.json" }, "typedRoutes": false, "distDir": ".next", "cleanDistDir": true, "assetPrefix": "", "cacheMaxMemorySize": 52428800, "configOrigin": "next.config.ts", "useFileSystemPublicRoutes": true, "generateEtags": true, "pageExtensions": ["tsx", "ts", "jsx", "js"], "poweredByHeader": false, "compress": true, "images": { "deviceSizes": [640, 750, 828, 1080, 1200, 1920, 2048, 3840], "imageSizes": [16, 32, 48, 64, 96, 128, 256, 384], "path": "/_next/image", "loader": "default", "loaderFile": "", "domains": [], "disableStaticImages": false, "minimumCacheTTL": 60, "formats": ["image/avif", "image/webp"], "maximumResponseBody": 5e7, "dangerouslyAllowSVG": false, "contentSecurityPolicy": "script-src 'none'; frame-src 'none'; sandbox;", "contentDispositionType": "attachment", "remotePatterns": [{ "protocol": "https", "hostname": "*.supabase.co" }, { "protocol": "https", "hostname": "images.unsplash.com" }], "unoptimized": false }, "devIndicators": { "position": "bottom-left" }, "onDemandEntries": { "maxInactiveAge": 6e4, "pagesBufferLength": 5 }, "amp": { "canonicalBase": "" }, "basePath": "", "sassOptions": {}, "trailingSlash": false, "i18n": null, "productionBrowserSourceMaps": false, "excludeDefaultMomentLocales": true, "serverRuntimeConfig": {}, "publicRuntimeConfig": {}, "reactProductionProfiling": false, "reactStrictMode": null, "reactMaxHeadersLength": 6e3, "httpAgentOptions": { "keepAlive": true }, "logging": {}, "compiler": {}, "expireTime": 31536e3, "staticPageGenerationTimeout": 60, "output": "standalone", "modularizeImports": { "@mui/icons-material": { "transform": "@mui/icons-material/{{member}}" }, "lodash": { "transform": "lodash/{{member}}" } }, "outputFileTracingRoot": "/home/sir/Desktop/onlinebar-main", "experimental": { "useSkewCookie": false, "cacheLife": { "default": { "stale": 300, "revalidate": 900, "expire": 4294967294 }, "seconds": { "stale": 30, "revalidate": 1, "expire": 60 }, "minutes": { "stale": 300, "revalidate": 60, "expire": 3600 }, "hours": { "stale": 300, "revalidate": 3600, "expire": 86400 }, "days": { "stale": 300, "revalidate": 86400, "expire": 604800 }, "weeks": { "stale": 300, "revalidate": 604800, "expire": 2592e3 }, "max": { "stale": 300, "revalidate": 2592e3, "expire": 4294967294 } }, "cacheHandlers": {}, "cssChunking": true, "multiZoneDraftMode": false, "appNavFailHandling": false, "prerenderEarlyExit": true, "serverMinification": true, "serverSourceMaps": false, "linkNoTouchStart": false, "caseSensitiveRoutes": false, "clientSegmentCache": false, "clientParamParsing": false, "dynamicOnHover": false, "preloadEntriesOnStart": true, "clientRouterFilter": true, "clientRouterFilterRedirects": false, "fetchCacheKeyPrefix": "", "middlewarePrefetch": "flexible", "optimisticClientCache": true, "manualClientBasePath": false, "cpus": 7, "memoryBasedWorkersCount": false, "imgOptConcurrency": null, "imgOptTimeoutInSeconds": 7, "imgOptMaxInputPixels": 268402689, "imgOptSequentialRead": null, "isrFlushToDisk": true, "workerThreads": false, "optimizeCss": false, "nextScriptWorkers": false, "scrollRestoration": false, "externalDir": false, "disableOptimizedLoading": false, "gzipSize": true, "craCompat": false, "esmExternals": true, "fullySpecified": false, "swcTraceProfiling": false, "forceSwcTransforms": false, "largePageDataBytes": 128e3, "typedEnv": false, "parallelServerCompiles": false, "parallelServerBuildTraces": false, "ppr": false, "authInterrupts": false, "webpackMemoryOptimizations": false, "optimizeServerReact": true, "viewTransition": false, "routerBFCache": false, "removeUncaughtErrorAndRejectionListeners": false, "validateRSCRequestHeaders": false, "staleTimes": { "dynamic": 0, "static": 300 }, "serverComponentsHmrCache": true, "staticGenerationMaxConcurrency": 8, "staticGenerationMinPagesPerWorker": 25, "cacheComponents": false, "inlineCss": false, "useCache": false, "globalNotFound": false, "devtoolSegmentExplorer": true, "browserDebugInfoInTerminal": false, "optimizeRouterScrolling": false, "middlewareClientMaxBodySize": 10485760, "optimizePackageImports": ["lucide-react", "date-fns", "lodash-es", "ramda", "antd", "react-bootstrap", "ahooks", "@ant-design/icons", "@headlessui/react", "@headlessui-float/react", "@heroicons/react/20/solid", "@heroicons/react/24/solid", "@heroicons/react/24/outline", "@visx/visx", "@tremor/react", "rxjs", "@mui/material", "@mui/icons-material", "recharts", "react-use", "effect", "@effect/schema", "@effect/platform", "@effect/platform-node", "@effect/platform-browser", "@effect/platform-bun", "@effect/sql", "@effect/sql-mssql", "@effect/sql-mysql2", "@effect/sql-pg", "@effect/sql-sqlite-node", "@effect/sql-sqlite-bun", "@effect/sql-sqlite-wasm", "@effect/sql-sqlite-react-native", "@effect/rpc", "@effect/rpc-http", "@effect/typeclass", "@effect/experimental", "@effect/opentelemetry", "@material-ui/core", "@material-ui/icons", "@tabler/icons-react", "mui-core", "react-icons/ai", "react-icons/bi", "react-icons/bs", "react-icons/cg", "react-icons/ci", "react-icons/di", "react-icons/fa", "react-icons/fa6", "react-icons/fc", "react-icons/fi", "react-icons/gi", "react-icons/go", "react-icons/gr", "react-icons/hi", "react-icons/hi2", "react-icons/im", "react-icons/io", "react-icons/io5", "react-icons/lia", "react-icons/lib", "react-icons/lu", "react-icons/md", "react-icons/pi", "react-icons/ri", "react-icons/rx", "react-icons/si", "react-icons/sl", "react-icons/tb", "react-icons/tfi", "react-icons/ti", "react-icons/vsc", "react-icons/wi"], "trustHostHeader": false, "isExperimentalCompile": false }, "htmlLimitedBots": "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight", "bundlePagesRouterDependencies": false, "configFileName": "next.config.ts", "turbopack": { "root": "/home/sir/Desktop/onlinebar-main" } };
var BuildId = "mzuYdRSx6_uM9dHUNkRU3";
var HtmlPages = ["/404"];
var RoutesManifest = { "basePath": "", "rewrites": { "beforeFiles": [], "afterFiles": [], "fallback": [] }, "redirects": [{ "source": "/:path+/", "destination": "/:path+", "internal": true, "statusCode": 308, "regex": "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$" }], "routes": { "static": [{ "page": "/", "regex": "^/(?:/)?$", "routeKeys": {}, "namedRegex": "^/(?:/)?$" }, { "page": "/_not-found", "regex": "^/_not\\-found(?:/)?$", "routeKeys": {}, "namedRegex": "^/_not\\-found(?:/)?$" }, { "page": "/about", "regex": "^/about(?:/)?$", "routeKeys": {}, "namedRegex": "^/about(?:/)?$" }, { "page": "/accessibility", "regex": "^/accessibility(?:/)?$", "routeKeys": {}, "namedRegex": "^/accessibility(?:/)?$" }, { "page": "/admin", "regex": "^/admin(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin(?:/)?$" }, { "page": "/admin/abandoned", "regex": "^/admin/abandoned(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/abandoned(?:/)?$" }, { "page": "/admin/affiliates", "regex": "^/admin/affiliates(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/affiliates(?:/)?$" }, { "page": "/admin/analytics", "regex": "^/admin/analytics(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/analytics(?:/)?$" }, { "page": "/admin/analytics/images", "regex": "^/admin/analytics/images(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/analytics/images(?:/)?$" }, { "page": "/admin/analytics/intelligence", "regex": "^/admin/analytics/intelligence(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/analytics/intelligence(?:/)?$" }, { "page": "/admin/audit", "regex": "^/admin/audit(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/audit(?:/)?$" }, { "page": "/admin/behavior", "regex": "^/admin/behavior(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/behavior(?:/)?$" }, { "page": "/admin/behavior/funnels", "regex": "^/admin/behavior/funnels(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/behavior/funnels(?:/)?$" }, { "page": "/admin/behavior/live", "regex": "^/admin/behavior/live(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/behavior/live(?:/)?$" }, { "page": "/admin/behavior/radar", "regex": "^/admin/behavior/radar(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/behavior/radar(?:/)?$" }, { "page": "/admin/behavior/sessions", "regex": "^/admin/behavior/sessions(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/behavior/sessions(?:/)?$" }, { "page": "/admin/bites", "regex": "^/admin/bites(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/bites(?:/)?$" }, { "page": "/admin/blog", "regex": "^/admin/blog(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/blog(?:/)?$" }, { "page": "/admin/broadcast", "regex": "^/admin/broadcast(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/broadcast(?:/)?$" }, { "page": "/admin/buzz", "regex": "^/admin/buzz(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/buzz(?:/)?$" }, { "page": "/admin/buzz/command", "regex": "^/admin/buzz/command(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/buzz/command(?:/)?$" }, { "page": "/admin/communications/automation", "regex": "^/admin/communications/automation(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/communications/automation(?:/)?$" }, { "page": "/admin/communications/command", "regex": "^/admin/communications/command(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/communications/command(?:/)?$" }, { "page": "/admin/communications/email", "regex": "^/admin/communications/email(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/communications/email(?:/)?$" }, { "page": "/admin/communications/popups", "regex": "^/admin/communications/popups(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/communications/popups(?:/)?$" }, { "page": "/admin/communications/sms", "regex": "^/admin/communications/sms(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/communications/sms(?:/)?$" }, { "page": "/admin/communications/whatsapp", "regex": "^/admin/communications/whatsapp(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/communications/whatsapp(?:/)?$" }, { "page": "/admin/content", "regex": "^/admin/content(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/content(?:/)?$" }, { "page": "/admin/coupons", "regex": "^/admin/coupons(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/coupons(?:/)?$" }, { "page": "/admin/customer-intelligence", "regex": "^/admin/customer\\-intelligence(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/customer\\-intelligence(?:/)?$" }, { "page": "/admin/customers", "regex": "^/admin/customers(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/customers(?:/)?$" }, { "page": "/admin/delivery", "regex": "^/admin/delivery(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/delivery(?:/)?$" }, { "page": "/admin/demand", "regex": "^/admin/demand(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/demand(?:/)?$" }, { "page": "/admin/dispatch", "regex": "^/admin/dispatch(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/dispatch(?:/)?$" }, { "page": "/admin/experience/mobile-widgets", "regex": "^/admin/experience/mobile\\-widgets(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/experience/mobile\\-widgets(?:/)?$" }, { "page": "/admin/experience/widgets", "regex": "^/admin/experience/widgets(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/experience/widgets(?:/)?$" }, { "page": "/admin/finance", "regex": "^/admin/finance(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/finance(?:/)?$" }, { "page": "/admin/forge", "regex": "^/admin/forge(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/forge(?:/)?$" }, { "page": "/admin/gamification", "regex": "^/admin/gamification(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/gamification(?:/)?$" }, { "page": "/admin/growth/accounts", "regex": "^/admin/growth/accounts(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/growth/accounts(?:/)?$" }, { "page": "/admin/growth/autopilot", "regex": "^/admin/growth/autopilot(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/growth/autopilot(?:/)?$" }, { "page": "/admin/growth/calendar", "regex": "^/admin/growth/calendar(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/growth/calendar(?:/)?$" }, { "page": "/admin/growth/camera", "regex": "^/admin/growth/camera(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/growth/camera(?:/)?$" }, { "page": "/admin/growth/content", "regex": "^/admin/growth/content(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/growth/content(?:/)?$" }, { "page": "/admin/halloween-intelligence", "regex": "^/admin/halloween\\-intelligence(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/halloween\\-intelligence(?:/)?$" }, { "page": "/admin/inventory/beverages", "regex": "^/admin/inventory/beverages(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/inventory/beverages(?:/)?$" }, { "page": "/admin/inventory/dossiers", "regex": "^/admin/inventory/dossiers(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/inventory/dossiers(?:/)?$" }, { "page": "/admin/kitchen", "regex": "^/admin/kitchen(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/kitchen(?:/)?$" }, { "page": "/admin/launch", "regex": "^/admin/launch(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/launch(?:/)?$" }, { "page": "/admin/login", "regex": "^/admin/login(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/login(?:/)?$" }, { "page": "/admin/market", "regex": "^/admin/market(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/market(?:/)?$" }, { "page": "/admin/marketing", "regex": "^/admin/marketing(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing(?:/)?$" }, { "page": "/admin/marketing/ab-testing", "regex": "^/admin/marketing/ab\\-testing(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/ab\\-testing(?:/)?$" }, { "page": "/admin/marketing/abandoned", "regex": "^/admin/marketing/abandoned(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/abandoned(?:/)?$" }, { "page": "/admin/marketing/ai-agency", "regex": "^/admin/marketing/ai\\-agency(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/ai\\-agency(?:/)?$" }, { "page": "/admin/marketing/audiences", "regex": "^/admin/marketing/audiences(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/audiences(?:/)?$" }, { "page": "/admin/marketing/automation", "regex": "^/admin/marketing/automation(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/automation(?:/)?$" }, { "page": "/admin/marketing/create", "regex": "^/admin/marketing/create(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/create(?:/)?$" }, { "page": "/admin/marketing/experiments", "regex": "^/admin/marketing/experiments(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/experiments(?:/)?$" }, { "page": "/admin/marketing/list", "regex": "^/admin/marketing/list(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/list(?:/)?$" }, { "page": "/admin/marketing/stories", "regex": "^/admin/marketing/stories(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/marketing/stories(?:/)?$" }, { "page": "/admin/media", "regex": "^/admin/media(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/media(?:/)?$" }, { "page": "/admin/merchants", "regex": "^/admin/merchants(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/merchants(?:/)?$" }, { "page": "/admin/messages", "regex": "^/admin/messages(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/messages(?:/)?$" }, { "page": "/admin/munchies", "regex": "^/admin/munchies(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/munchies(?:/)?$" }, { "page": "/admin/operations", "regex": "^/admin/operations(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/operations(?:/)?$" }, { "page": "/admin/operations/hubs", "regex": "^/admin/operations/hubs(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/operations/hubs(?:/)?$" }, { "page": "/admin/operations/sourcing", "regex": "^/admin/operations/sourcing(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/operations/sourcing(?:/)?$" }, { "page": "/admin/operations/suppliers", "regex": "^/admin/operations/suppliers(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/operations/suppliers(?:/)?$" }, { "page": "/admin/operations/tasks", "regex": "^/admin/operations/tasks(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/operations/tasks(?:/)?$" }, { "page": "/admin/operations/vendors", "regex": "^/admin/operations/vendors(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/operations/vendors(?:/)?$" }, { "page": "/admin/orders", "regex": "^/admin/orders(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/orders(?:/)?$" }, { "page": "/admin/payouts", "regex": "^/admin/payouts(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/payouts(?:/)?$" }, { "page": "/admin/pulse", "regex": "^/admin/pulse(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/pulse(?:/)?$" }, { "page": "/admin/ratings", "regex": "^/admin/ratings(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ratings(?:/)?$" }, { "page": "/admin/reports", "regex": "^/admin/reports(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/reports(?:/)?$" }, { "page": "/admin/reviews", "regex": "^/admin/reviews(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/reviews(?:/)?$" }, { "page": "/admin/security", "regex": "^/admin/security(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/security(?:/)?$" }, { "page": "/admin/settings", "regex": "^/admin/settings(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/settings(?:/)?$" }, { "page": "/admin/souvenirs", "regex": "^/admin/souvenirs(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/souvenirs(?:/)?$" }, { "page": "/admin/spin-campaign", "regex": "^/admin/spin\\-campaign(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/spin\\-campaign(?:/)?$" }, { "page": "/admin/staff", "regex": "^/admin/staff(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/staff(?:/)?$" }, { "page": "/admin/subscribers", "regex": "^/admin/subscribers(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/subscribers(?:/)?$" }, { "page": "/admin/support", "regex": "^/admin/support(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/support(?:/)?$" }, { "page": "/admin/support/vip-relay", "regex": "^/admin/support/vip\\-relay(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/support/vip\\-relay(?:/)?$" }, { "page": "/admin/ticketing", "regex": "^/admin/ticketing(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ticketing(?:/)?$" }, { "page": "/admin/ticketing/email-preview", "regex": "^/admin/ticketing/email\\-preview(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ticketing/email\\-preview(?:/)?$" }, { "page": "/admin/ticketing/live", "regex": "^/admin/ticketing/live(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ticketing/live(?:/)?$" }, { "page": "/admin/ticketing/sales", "regex": "^/admin/ticketing/sales(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ticketing/sales(?:/)?$" }, { "page": "/admin/ticketing/security", "regex": "^/admin/ticketing/security(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ticketing/security(?:/)?$" }, { "page": "/admin/ticketing/staff", "regex": "^/admin/ticketing/staff(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/ticketing/staff(?:/)?$" }, { "page": "/admin/traceability", "regex": "^/admin/traceability(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/traceability(?:/)?$" }, { "page": "/admin/upload", "regex": "^/admin/upload(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/upload(?:/)?$" }, { "page": "/admin/vault", "regex": "^/admin/vault(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/vault(?:/)?$" }, { "page": "/admin/waitlist", "regex": "^/admin/waitlist(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/waitlist(?:/)?$" }, { "page": "/admin/waitlist/invitations", "regex": "^/admin/waitlist/invitations(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/waitlist/invitations(?:/)?$" }, { "page": "/admin/warranty", "regex": "^/admin/warranty(?:/)?$", "routeKeys": {}, "namedRegex": "^/admin/warranty(?:/)?$" }, { "page": "/affiliate", "regex": "^/affiliate(?:/)?$", "routeKeys": {}, "namedRegex": "^/affiliate(?:/)?$" }, { "page": "/affiliate/agreement", "regex": "^/affiliate/agreement(?:/)?$", "routeKeys": {}, "namedRegex": "^/affiliate/agreement(?:/)?$" }, { "page": "/affiliate/dashboard", "regex": "^/affiliate/dashboard(?:/)?$", "routeKeys": {}, "namedRegex": "^/affiliate/dashboard(?:/)?$" }, { "page": "/affiliate/register", "regex": "^/affiliate/register(?:/)?$", "routeKeys": {}, "namedRegex": "^/affiliate/register(?:/)?$" }, { "page": "/auth", "regex": "^/auth(?:/)?$", "routeKeys": {}, "namedRegex": "^/auth(?:/)?$" }, { "page": "/auth/callback", "regex": "^/auth/callback(?:/)?$", "routeKeys": {}, "namedRegex": "^/auth/callback(?:/)?$" }, { "page": "/beverages", "regex": "^/beverages(?:/)?$", "routeKeys": {}, "namedRegex": "^/beverages(?:/)?$" }, { "page": "/bites", "regex": "^/bites(?:/)?$", "routeKeys": {}, "namedRegex": "^/bites(?:/)?$" }, { "page": "/blog", "regex": "^/blog(?:/)?$", "routeKeys": {}, "namedRegex": "^/blog(?:/)?$" }, { "page": "/blog/category/knowledge-base", "regex": "^/blog/category/knowledge\\-base(?:/)?$", "routeKeys": {}, "namedRegex": "^/blog/category/knowledge\\-base(?:/)?$" }, { "page": "/build-my-night", "regex": "^/build\\-my\\-night(?:/)?$", "routeKeys": {}, "namedRegex": "^/build\\-my\\-night(?:/)?$" }, { "page": "/build-the-night", "regex": "^/build\\-the\\-night(?:/)?$", "routeKeys": {}, "namedRegex": "^/build\\-the\\-night(?:/)?$" }, { "page": "/buzz", "regex": "^/buzz(?:/)?$", "routeKeys": {}, "namedRegex": "^/buzz(?:/)?$" }, { "page": "/card-games", "regex": "^/card\\-games(?:/)?$", "routeKeys": {}, "namedRegex": "^/card\\-games(?:/)?$" }, { "page": "/cart", "regex": "^/cart(?:/)?$", "routeKeys": {}, "namedRegex": "^/cart(?:/)?$" }, { "page": "/checkout", "regex": "^/checkout(?:/)?$", "routeKeys": {}, "namedRegex": "^/checkout(?:/)?$" }, { "page": "/checkout/success", "regex": "^/checkout/success(?:/)?$", "routeKeys": {}, "namedRegex": "^/checkout/success(?:/)?$" }, { "page": "/concierge", "regex": "^/concierge(?:/)?$", "routeKeys": {}, "namedRegex": "^/concierge(?:/)?$" }, { "page": "/contact", "regex": "^/contact(?:/)?$", "routeKeys": {}, "namedRegex": "^/contact(?:/)?$" }, { "page": "/cookies", "regex": "^/cookies(?:/)?$", "routeKeys": {}, "namedRegex": "^/cookies(?:/)?$" }, { "page": "/corporate", "regex": "^/corporate(?:/)?$", "routeKeys": {}, "namedRegex": "^/corporate(?:/)?$" }, { "page": "/delivery", "regex": "^/delivery(?:/)?$", "routeKeys": {}, "namedRegex": "^/delivery(?:/)?$" }, { "page": "/extras", "regex": "^/extras(?:/)?$", "routeKeys": {}, "namedRegex": "^/extras(?:/)?$" }, { "page": "/gifting", "regex": "^/gifting(?:/)?$", "routeKeys": {}, "namedRegex": "^/gifting(?:/)?$" }, { "page": "/google_merchant.xml", "regex": "^/google_merchant\\.xml(?:/)?$", "routeKeys": {}, "namedRegex": "^/google_merchant\\.xml(?:/)?$" }, { "page": "/guides/how-much-alcohol-for-a-party", "regex": "^/guides/how\\-much\\-alcohol\\-for\\-a\\-party(?:/)?$", "routeKeys": {}, "namedRegex": "^/guides/how\\-much\\-alcohol\\-for\\-a\\-party(?:/)?$" }, { "page": "/halloween", "regex": "^/halloween(?:/)?$", "routeKeys": {}, "namedRegex": "^/halloween(?:/)?$" }, { "page": "/launch-countdown", "regex": "^/launch\\-countdown(?:/)?$", "routeKeys": {}, "namedRegex": "^/launch\\-countdown(?:/)?$" }, { "page": "/lord", "regex": "^/lord(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord(?:/)?$" }, { "page": "/lord/abandoned", "regex": "^/lord/abandoned(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/abandoned(?:/)?$" }, { "page": "/lord/affiliates", "regex": "^/lord/affiliates(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/affiliates(?:/)?$" }, { "page": "/lord/analytics", "regex": "^/lord/analytics(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/analytics(?:/)?$" }, { "page": "/lord/analytics/images", "regex": "^/lord/analytics/images(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/analytics/images(?:/)?$" }, { "page": "/lord/analytics/intelligence", "regex": "^/lord/analytics/intelligence(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/analytics/intelligence(?:/)?$" }, { "page": "/lord/audit", "regex": "^/lord/audit(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/audit(?:/)?$" }, { "page": "/lord/behavior", "regex": "^/lord/behavior(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/behavior(?:/)?$" }, { "page": "/lord/behavior/funnels", "regex": "^/lord/behavior/funnels(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/behavior/funnels(?:/)?$" }, { "page": "/lord/behavior/live", "regex": "^/lord/behavior/live(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/behavior/live(?:/)?$" }, { "page": "/lord/behavior/radar", "regex": "^/lord/behavior/radar(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/behavior/radar(?:/)?$" }, { "page": "/lord/behavior/sessions", "regex": "^/lord/behavior/sessions(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/behavior/sessions(?:/)?$" }, { "page": "/lord/bites", "regex": "^/lord/bites(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/bites(?:/)?$" }, { "page": "/lord/blog", "regex": "^/lord/blog(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/blog(?:/)?$" }, { "page": "/lord/broadcast", "regex": "^/lord/broadcast(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/broadcast(?:/)?$" }, { "page": "/lord/buzz", "regex": "^/lord/buzz(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/buzz(?:/)?$" }, { "page": "/lord/buzz/campaigns", "regex": "^/lord/buzz/campaigns(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/buzz/campaigns(?:/)?$" }, { "page": "/lord/buzz/command", "regex": "^/lord/buzz/command(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/buzz/command(?:/)?$" }, { "page": "/lord/buzz/create", "regex": "^/lord/buzz/create(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/buzz/create(?:/)?$" }, { "page": "/lord/communications/automation", "regex": "^/lord/communications/automation(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/communications/automation(?:/)?$" }, { "page": "/lord/communications/command", "regex": "^/lord/communications/command(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/communications/command(?:/)?$" }, { "page": "/lord/communications/email", "regex": "^/lord/communications/email(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/communications/email(?:/)?$" }, { "page": "/lord/communications/popups", "regex": "^/lord/communications/popups(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/communications/popups(?:/)?$" }, { "page": "/lord/communications/sms", "regex": "^/lord/communications/sms(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/communications/sms(?:/)?$" }, { "page": "/lord/communications/whatsapp", "regex": "^/lord/communications/whatsapp(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/communications/whatsapp(?:/)?$" }, { "page": "/lord/concierge-trainer", "regex": "^/lord/concierge\\-trainer(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/concierge\\-trainer(?:/)?$" }, { "page": "/lord/content", "regex": "^/lord/content(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/content(?:/)?$" }, { "page": "/lord/coupons", "regex": "^/lord/coupons(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/coupons(?:/)?$" }, { "page": "/lord/customer-intelligence", "regex": "^/lord/customer\\-intelligence(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/customer\\-intelligence(?:/)?$" }, { "page": "/lord/customers", "regex": "^/lord/customers(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/customers(?:/)?$" }, { "page": "/lord/delivery", "regex": "^/lord/delivery(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/delivery(?:/)?$" }, { "page": "/lord/delivery/scorecard", "regex": "^/lord/delivery/scorecard(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/delivery/scorecard(?:/)?$" }, { "page": "/lord/delivery-zones", "regex": "^/lord/delivery\\-zones(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/delivery\\-zones(?:/)?$" }, { "page": "/lord/demand", "regex": "^/lord/demand(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/demand(?:/)?$" }, { "page": "/lord/dispatch", "regex": "^/lord/dispatch(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/dispatch(?:/)?$" }, { "page": "/lord/engraving-production", "regex": "^/lord/engraving\\-production(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/engraving\\-production(?:/)?$" }, { "page": "/lord/experience/mobile-widgets", "regex": "^/lord/experience/mobile\\-widgets(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/experience/mobile\\-widgets(?:/)?$" }, { "page": "/lord/experience/widgets", "regex": "^/lord/experience/widgets(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/experience/widgets(?:/)?$" }, { "page": "/lord/finance", "regex": "^/lord/finance(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/finance(?:/)?$" }, { "page": "/lord/forge", "regex": "^/lord/forge(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/forge(?:/)?$" }, { "page": "/lord/gamification", "regex": "^/lord/gamification(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/gamification(?:/)?$" }, { "page": "/lord/growth/accounts", "regex": "^/lord/growth/accounts(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/growth/accounts(?:/)?$" }, { "page": "/lord/growth/autopilot", "regex": "^/lord/growth/autopilot(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/growth/autopilot(?:/)?$" }, { "page": "/lord/growth/calendar", "regex": "^/lord/growth/calendar(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/growth/calendar(?:/)?$" }, { "page": "/lord/growth/camera", "regex": "^/lord/growth/camera(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/growth/camera(?:/)?$" }, { "page": "/lord/growth/content", "regex": "^/lord/growth/content(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/growth/content(?:/)?$" }, { "page": "/lord/halloween-intelligence", "regex": "^/lord/halloween\\-intelligence(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/halloween\\-intelligence(?:/)?$" }, { "page": "/lord/inventory/beverages", "regex": "^/lord/inventory/beverages(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/inventory/beverages(?:/)?$" }, { "page": "/lord/inventory/dossiers", "regex": "^/lord/inventory/dossiers(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/inventory/dossiers(?:/)?$" }, { "page": "/lord/kitchen", "regex": "^/lord/kitchen(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/kitchen(?:/)?$" }, { "page": "/lord/launch", "regex": "^/lord/launch(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/launch(?:/)?$" }, { "page": "/lord/leads", "regex": "^/lord/leads(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/leads(?:/)?$" }, { "page": "/lord/login", "regex": "^/lord/login(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/login(?:/)?$" }, { "page": "/lord/market", "regex": "^/lord/market(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/market(?:/)?$" }, { "page": "/lord/marketing", "regex": "^/lord/marketing(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing(?:/)?$" }, { "page": "/lord/marketing/ab-testing", "regex": "^/lord/marketing/ab\\-testing(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/ab\\-testing(?:/)?$" }, { "page": "/lord/marketing/abandoned", "regex": "^/lord/marketing/abandoned(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/abandoned(?:/)?$" }, { "page": "/lord/marketing/ai-agency", "regex": "^/lord/marketing/ai\\-agency(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/ai\\-agency(?:/)?$" }, { "page": "/lord/marketing/audiences", "regex": "^/lord/marketing/audiences(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/audiences(?:/)?$" }, { "page": "/lord/marketing/automation", "regex": "^/lord/marketing/automation(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/automation(?:/)?$" }, { "page": "/lord/marketing/create", "regex": "^/lord/marketing/create(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/create(?:/)?$" }, { "page": "/lord/marketing/experiments", "regex": "^/lord/marketing/experiments(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/experiments(?:/)?$" }, { "page": "/lord/marketing/list", "regex": "^/lord/marketing/list(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/list(?:/)?$" }, { "page": "/lord/marketing/stories", "regex": "^/lord/marketing/stories(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/marketing/stories(?:/)?$" }, { "page": "/lord/media", "regex": "^/lord/media(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/media(?:/)?$" }, { "page": "/lord/merchants", "regex": "^/lord/merchants(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/merchants(?:/)?$" }, { "page": "/lord/messages", "regex": "^/lord/messages(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/messages(?:/)?$" }, { "page": "/lord/munchies", "regex": "^/lord/munchies(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/munchies(?:/)?$" }, { "page": "/lord/operations", "regex": "^/lord/operations(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/operations(?:/)?$" }, { "page": "/lord/operations/hubs", "regex": "^/lord/operations/hubs(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/operations/hubs(?:/)?$" }, { "page": "/lord/operations/sourcing", "regex": "^/lord/operations/sourcing(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/operations/sourcing(?:/)?$" }, { "page": "/lord/operations/suppliers", "regex": "^/lord/operations/suppliers(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/operations/suppliers(?:/)?$" }, { "page": "/lord/operations/tasks", "regex": "^/lord/operations/tasks(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/operations/tasks(?:/)?$" }, { "page": "/lord/operations/vendors", "regex": "^/lord/operations/vendors(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/operations/vendors(?:/)?$" }, { "page": "/lord/orders", "regex": "^/lord/orders(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/orders(?:/)?$" }, { "page": "/lord/payouts", "regex": "^/lord/payouts(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/payouts(?:/)?$" }, { "page": "/lord/pulse", "regex": "^/lord/pulse(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/pulse(?:/)?$" }, { "page": "/lord/ratings", "regex": "^/lord/ratings(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ratings(?:/)?$" }, { "page": "/lord/reports", "regex": "^/lord/reports(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/reports(?:/)?$" }, { "page": "/lord/reviews", "regex": "^/lord/reviews(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/reviews(?:/)?$" }, { "page": "/lord/riders", "regex": "^/lord/riders(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/riders(?:/)?$" }, { "page": "/lord/security", "regex": "^/lord/security(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/security(?:/)?$" }, { "page": "/lord/settings", "regex": "^/lord/settings(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/settings(?:/)?$" }, { "page": "/lord/souvenirs", "regex": "^/lord/souvenirs(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/souvenirs(?:/)?$" }, { "page": "/lord/spin-campaign", "regex": "^/lord/spin\\-campaign(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/spin\\-campaign(?:/)?$" }, { "page": "/lord/staff", "regex": "^/lord/staff(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/staff(?:/)?$" }, { "page": "/lord/subscribers", "regex": "^/lord/subscribers(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/subscribers(?:/)?$" }, { "page": "/lord/support", "regex": "^/lord/support(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/support(?:/)?$" }, { "page": "/lord/support/view", "regex": "^/lord/support/view(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/support/view(?:/)?$" }, { "page": "/lord/support/vip-relay", "regex": "^/lord/support/vip\\-relay(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/support/vip\\-relay(?:/)?$" }, { "page": "/lord/ticketing", "regex": "^/lord/ticketing(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing(?:/)?$" }, { "page": "/lord/ticketing/email-preview", "regex": "^/lord/ticketing/email\\-preview(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/email\\-preview(?:/)?$" }, { "page": "/lord/ticketing/insights", "regex": "^/lord/ticketing/insights(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/insights(?:/)?$" }, { "page": "/lord/ticketing/live", "regex": "^/lord/ticketing/live(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/live(?:/)?$" }, { "page": "/lord/ticketing/sales", "regex": "^/lord/ticketing/sales(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/sales(?:/)?$" }, { "page": "/lord/ticketing/security", "regex": "^/lord/ticketing/security(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/security(?:/)?$" }, { "page": "/lord/ticketing/staff", "regex": "^/lord/ticketing/staff(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/staff(?:/)?$" }, { "page": "/lord/ticketing/transfers", "regex": "^/lord/ticketing/transfers(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/ticketing/transfers(?:/)?$" }, { "page": "/lord/traceability", "regex": "^/lord/traceability(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/traceability(?:/)?$" }, { "page": "/lord/upload", "regex": "^/lord/upload(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/upload(?:/)?$" }, { "page": "/lord/vault", "regex": "^/lord/vault(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/vault(?:/)?$" }, { "page": "/lord/vendor-onboarding", "regex": "^/lord/vendor\\-onboarding(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/vendor\\-onboarding(?:/)?$" }, { "page": "/lord/waitlist", "regex": "^/lord/waitlist(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/waitlist(?:/)?$" }, { "page": "/lord/waitlist/invitations", "regex": "^/lord/waitlist/invitations(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/waitlist/invitations(?:/)?$" }, { "page": "/lord/warranty", "regex": "^/lord/warranty(?:/)?$", "routeKeys": {}, "namedRegex": "^/lord/warranty(?:/)?$" }, { "page": "/market", "regex": "^/market(?:/)?$", "routeKeys": {}, "namedRegex": "^/market(?:/)?$" }, { "page": "/merchant/business", "regex": "^/merchant/business(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/business(?:/)?$" }, { "page": "/merchant/dashboard", "regex": "^/merchant/dashboard(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/dashboard(?:/)?$" }, { "page": "/merchant/documents", "regex": "^/merchant/documents(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/documents(?:/)?$" }, { "page": "/merchant/halloween", "regex": "^/merchant/halloween(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/halloween(?:/)?$" }, { "page": "/merchant/liquor-onboarding", "regex": "^/merchant/liquor\\-onboarding(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/liquor\\-onboarding(?:/)?$" }, { "page": "/merchant/network", "regex": "^/merchant/network(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/network(?:/)?$" }, { "page": "/merchant/onboarding", "regex": "^/merchant/onboarding(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/onboarding(?:/)?$" }, { "page": "/merchant/portal/login", "regex": "^/merchant/portal/login(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/portal/login(?:/)?$" }, { "page": "/merchant/portal/register", "regex": "^/merchant/portal/register(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/portal/register(?:/)?$" }, { "page": "/merchant/register", "regex": "^/merchant/register(?:/)?$", "routeKeys": {}, "namedRegex": "^/merchant/register(?:/)?$" }, { "page": "/newsletter/unsubscribe", "regex": "^/newsletter/unsubscribe(?:/)?$", "routeKeys": {}, "namedRegex": "^/newsletter/unsubscribe(?:/)?$" }, { "page": "/onboarding", "regex": "^/onboarding(?:/)?$", "routeKeys": {}, "namedRegex": "^/onboarding(?:/)?$" }, { "page": "/privacy", "regex": "^/privacy(?:/)?$", "routeKeys": {}, "namedRegex": "^/privacy(?:/)?$" }, { "page": "/profile", "regex": "^/profile(?:/)?$", "routeKeys": {}, "namedRegex": "^/profile(?:/)?$" }, { "page": "/profile/crews", "regex": "^/profile/crews(?:/)?$", "routeKeys": {}, "namedRegex": "^/profile/crews(?:/)?$" }, { "page": "/returns", "regex": "^/returns(?:/)?$", "routeKeys": {}, "namedRegex": "^/returns(?:/)?$" }, { "page": "/rewards", "regex": "^/rewards(?:/)?$", "routeKeys": {}, "namedRegex": "^/rewards(?:/)?$" }, { "page": "/rider", "regex": "^/rider(?:/)?$", "routeKeys": {}, "namedRegex": "^/rider(?:/)?$" }, { "page": "/rider/dashboard", "regex": "^/rider/dashboard(?:/)?$", "routeKeys": {}, "namedRegex": "^/rider/dashboard(?:/)?$" }, { "page": "/rider/login", "regex": "^/rider/login(?:/)?$", "routeKeys": {}, "namedRegex": "^/rider/login(?:/)?$" }, { "page": "/rider/onboarding", "regex": "^/rider/onboarding(?:/)?$", "routeKeys": {}, "namedRegex": "^/rider/onboarding(?:/)?$" }, { "page": "/scanner", "regex": "^/scanner(?:/)?$", "routeKeys": {}, "namedRegex": "^/scanner(?:/)?$" }, { "page": "/shipping", "regex": "^/shipping(?:/)?$", "routeKeys": {}, "namedRegex": "^/shipping(?:/)?$" }, { "page": "/shop", "regex": "^/shop(?:/)?$", "routeKeys": {}, "namedRegex": "^/shop(?:/)?$" }, { "page": "/shop/snacks", "regex": "^/shop/snacks(?:/)?$", "routeKeys": {}, "namedRegex": "^/shop/snacks(?:/)?$" }, { "page": "/sitemap.xml", "regex": "^/sitemap\\.xml(?:/)?$", "routeKeys": {}, "namedRegex": "^/sitemap\\.xml(?:/)?$" }, { "page": "/souvenirs", "regex": "^/souvenirs(?:/)?$", "routeKeys": {}, "namedRegex": "^/souvenirs(?:/)?$" }, { "page": "/spin", "regex": "^/spin(?:/)?$", "routeKeys": {}, "namedRegex": "^/spin(?:/)?$" }, { "page": "/supplier", "regex": "^/supplier(?:/)?$", "routeKeys": {}, "namedRegex": "^/supplier(?:/)?$" }, { "page": "/supplier/dashboard", "regex": "^/supplier/dashboard(?:/)?$", "routeKeys": {}, "namedRegex": "^/supplier/dashboard(?:/)?$" }, { "page": "/supplier/inventory", "regex": "^/supplier/inventory(?:/)?$", "routeKeys": {}, "namedRegex": "^/supplier/inventory(?:/)?$" }, { "page": "/supplier/propose", "regex": "^/supplier/propose(?:/)?$", "routeKeys": {}, "namedRegex": "^/supplier/propose(?:/)?$" }, { "page": "/supplier/settlements", "regex": "^/supplier/settlements(?:/)?$", "routeKeys": {}, "namedRegex": "^/supplier/settlements(?:/)?$" }, { "page": "/terms", "regex": "^/terms(?:/)?$", "routeKeys": {}, "namedRegex": "^/terms(?:/)?$" }, { "page": "/tickets", "regex": "^/tickets(?:/)?$", "routeKeys": {}, "namedRegex": "^/tickets(?:/)?$" }, { "page": "/tickets/confirmation", "regex": "^/tickets/confirmation(?:/)?$", "routeKeys": {}, "namedRegex": "^/tickets/confirmation(?:/)?$" }, { "page": "/track", "regex": "^/track(?:/)?$", "routeKeys": {}, "namedRegex": "^/track(?:/)?$" }, { "page": "/vendor", "regex": "^/vendor(?:/)?$", "routeKeys": {}, "namedRegex": "^/vendor(?:/)?$" }, { "page": "/venue/dashboard", "regex": "^/venue/dashboard(?:/)?$", "routeKeys": {}, "namedRegex": "^/venue/dashboard(?:/)?$" }, { "page": "/warranty", "regex": "^/warranty(?:/)?$", "routeKeys": {}, "namedRegex": "^/warranty(?:/)?$" }, { "page": "/wishlist", "regex": "^/wishlist(?:/)?$", "routeKeys": {}, "namedRegex": "^/wishlist(?:/)?$" }], "dynamic": [{ "page": "/admin/customers/[phone]", "regex": "^/admin/customers/([^/]+?)(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/admin/customers/(?<nxtPphone>[^/]+?)(?:/)?$" }, { "page": "/admin/customers/[phone]/360", "regex": "^/admin/customers/([^/]+?)/360(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/admin/customers/(?<nxtPphone>[^/]+?)/360(?:/)?$" }, { "page": "/admin/forge/[id]", "regex": "^/admin/forge/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/admin/forge/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/admin/inventory/dossiers/edit/[id]", "regex": "^/admin/inventory/dossiers/edit/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/admin/inventory/dossiers/edit/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/admin/merchants/[id]", "regex": "^/admin/merchants/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/admin/merchants/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/admin/riders/[id]", "regex": "^/admin/riders/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/admin/riders/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/admin/staff/[id]", "regex": "^/admin/staff/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/admin/staff/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/api/admin/customers/[phone]/crm", "regex": "^/api/admin/customers/([^/]+?)/crm(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/api/admin/customers/(?<nxtPphone>[^/]+?)/crm(?:/)?$" }, { "page": "/api/admin/customers/[phone]/loyalty", "regex": "^/api/admin/customers/([^/]+?)/loyalty(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/api/admin/customers/(?<nxtPphone>[^/]+?)/loyalty(?:/)?$" }, { "page": "/api/admin/customers/[phone]/profile", "regex": "^/api/admin/customers/([^/]+?)/profile(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/api/admin/customers/(?<nxtPphone>[^/]+?)/profile(?:/)?$" }, { "page": "/api/admin/engraving-jobs/[id]/svg", "regex": "^/api/admin/engraving\\-jobs/([^/]+?)/svg(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/api/admin/engraving\\-jobs/(?<nxtPid>[^/]+?)/svg(?:/)?$" }, { "page": "/api/admin/merchant-store/[id]", "regex": "^/api/admin/merchant\\-store/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/api/admin/merchant\\-store/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/api/admin/riders/[id]", "regex": "^/api/admin/riders/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/api/admin/riders/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/api/buzz/[id]", "regex": "^/api/buzz/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/api/buzz/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/api/mpesa/orders/webhook/[token]", "regex": "^/api/mpesa/orders/webhook/([^/]+?)(?:/)?$", "routeKeys": { "nxtPtoken": "nxtPtoken" }, "namedRegex": "^/api/mpesa/orders/webhook/(?<nxtPtoken>[^/]+?)(?:/)?$" }, { "page": "/api/mpesa/rider-delivery-callback/[token]", "regex": "^/api/mpesa/rider\\-delivery\\-callback/([^/]+?)(?:/)?$", "routeKeys": { "nxtPtoken": "nxtPtoken" }, "namedRegex": "^/api/mpesa/rider\\-delivery\\-callback/(?<nxtPtoken>[^/]+?)(?:/)?$" }, { "page": "/blog/[slug]", "regex": "^/blog/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/blog/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/buzz/[slug]", "regex": "^/buzz/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/buzz/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/dispatch/[id]", "regex": "^/dispatch/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/dispatch/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/lord/customers/[phone]", "regex": "^/lord/customers/([^/]+?)(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/lord/customers/(?<nxtPphone>[^/]+?)(?:/)?$" }, { "page": "/lord/customers/[phone]/360", "regex": "^/lord/customers/([^/]+?)/360(?:/)?$", "routeKeys": { "nxtPphone": "nxtPphone" }, "namedRegex": "^/lord/customers/(?<nxtPphone>[^/]+?)/360(?:/)?$" }, { "page": "/lord/forge/[id]", "regex": "^/lord/forge/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/lord/forge/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/lord/inventory/dossiers/edit/[id]", "regex": "^/lord/inventory/dossiers/edit/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/lord/inventory/dossiers/edit/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/lord/merchants/[id]", "regex": "^/lord/merchants/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/lord/merchants/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/lord/riders/[id]", "regex": "^/lord/riders/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/lord/riders/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/lord/staff/[id]", "regex": "^/lord/staff/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/lord/staff/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/market/category/[slug]", "regex": "^/market/category/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/market/category/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/market/product/[slug]", "regex": "^/market/product/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/market/product/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/market/store/[slug]", "regex": "^/market/store/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/market/store/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/product/[productId]", "regex": "^/product/([^/]+?)(?:/)?$", "routeKeys": { "nxtPproductId": "nxtPproductId" }, "namedRegex": "^/product/(?<nxtPproductId>[^/]+?)(?:/)?$" }, { "page": "/shop/category/[slug]", "regex": "^/shop/category/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/shop/category/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/shop/[id]", "regex": "^/shop/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/shop/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/tickets/[slug]", "regex": "^/tickets/([^/]+?)(?:/)?$", "routeKeys": { "nxtPslug": "nxtPslug" }, "namedRegex": "^/tickets/(?<nxtPslug>[^/]+?)(?:/)?$" }, { "page": "/venue/[id]", "regex": "^/venue/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/venue/(?<nxtPid>[^/]+?)(?:/)?$" }, { "page": "/verify/[id]", "regex": "^/verify/([^/]+?)(?:/)?$", "routeKeys": { "nxtPid": "nxtPid" }, "namedRegex": "^/verify/(?<nxtPid>[^/]+?)(?:/)?$" }], "data": { "static": [], "dynamic": [] } }, "locales": [] };
var PrerenderManifest = { "version": 4, "routes": { "/_not-found": { "initialStatus": 404, "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/_not-found", "dataRoute": "/_not-found.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/api/buzz/discovery": { "initialHeaders": { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60", "content-type": "application/json", "x-next-cache-tags": "_N_T_/layout,_N_T_/api/layout,_N_T_/api/buzz/layout,_N_T_/api/buzz/discovery/layout,_N_T_/api/buzz/discovery/route,_N_T_/api/buzz/discovery" }, "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": 30, "initialExpireSeconds": 31536e3, "srcRoute": "/api/buzz/discovery", "dataRoute": null, "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/bites": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/bites", "dataRoute": "/bites.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/blog/category/knowledge-base": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/blog/category/knowledge-base", "dataRoute": "/blog/category/knowledge-base.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/blog": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/blog", "dataRoute": "/blog.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/build-my-night": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/build-my-night", "dataRoute": "/build-my-night.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/about": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/about", "dataRoute": "/about.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/buzz": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/buzz", "dataRoute": "/buzz.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/cart": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/cart", "dataRoute": "/cart.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/accessibility": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/accessibility", "dataRoute": "/accessibility.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/cookies": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/cookies", "dataRoute": "/cookies.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/beverages": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/beverages", "dataRoute": "/beverages.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/checkout": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/checkout", "dataRoute": "/checkout.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/corporate": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/corporate", "dataRoute": "/corporate.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/extras": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/extras", "dataRoute": "/extras.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/gifting": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/gifting", "dataRoute": "/gifting.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/onboarding": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/onboarding", "dataRoute": "/onboarding.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/profile/crews": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/profile/crews", "dataRoute": "/profile/crews.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/returns": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/returns", "dataRoute": "/returns.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/privacy": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/privacy", "dataRoute": "/privacy.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/rewards": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/rewards", "dataRoute": "/rewards.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/rider/login": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/rider/login", "dataRoute": "/rider/login.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/rider/onboarding": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/rider/onboarding", "dataRoute": "/rider/onboarding.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/rider/dashboard": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/rider/dashboard", "dataRoute": "/rider/dashboard.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/shipping": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/shipping", "dataRoute": "/shipping.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/scanner": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/scanner", "dataRoute": "/scanner.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/shop": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/shop", "dataRoute": "/shop.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/shop/snacks": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/shop/snacks", "dataRoute": "/shop/snacks.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/souvenirs": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/souvenirs", "dataRoute": "/souvenirs.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/spin": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/spin", "dataRoute": "/spin.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/checkout/success": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/checkout/success", "dataRoute": "/checkout/success.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/terms": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/terms", "dataRoute": "/terms.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/track": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/track", "dataRoute": "/track.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/venue/dashboard": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/venue/dashboard", "dataRoute": "/venue/dashboard.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/wishlist": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/wishlist", "dataRoute": "/wishlist.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/warranty": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/warranty", "dataRoute": "/warranty.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/profile": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/profile", "dataRoute": "/profile.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/halloween": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/halloween", "dataRoute": "/halloween.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/guides/how-much-alcohol-for-a-party": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/guides/how-much-alcohol-for-a-party", "dataRoute": "/guides/how-much-alcohol-for-a-party.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": 300, "initialExpireSeconds": 31536e3, "srcRoute": "/", "dataRoute": "/index.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/rider": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/rider", "dataRoute": "/rider.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/vendor": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/vendor", "dataRoute": "/vendor.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/halloween": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/halloween", "dataRoute": "/merchant/halloween.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/documents": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/documents", "dataRoute": "/merchant/documents.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/business": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/business", "dataRoute": "/merchant/business.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/onboarding": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/onboarding", "dataRoute": "/merchant/onboarding.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/affiliate/dashboard": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/affiliate/dashboard", "dataRoute": "/affiliate/dashboard.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/affiliate": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/affiliate", "dataRoute": "/affiliate.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/affiliate/register": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/affiliate/register", "dataRoute": "/affiliate/register.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/affiliate/agreement": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/affiliate/agreement", "dataRoute": "/affiliate/agreement.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/admin/login": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/admin/login", "dataRoute": "/admin/login.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/network": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/network", "dataRoute": "/merchant/network.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/lord/login": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/lord/login", "dataRoute": "/lord/login.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/card-games": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/card-games", "dataRoute": "/card-games.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/contact": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/contact", "dataRoute": "/contact.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/market": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/market", "dataRoute": "/market.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/register": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/register", "dataRoute": "/merchant/register.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/portal/login": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/portal/login", "dataRoute": "/merchant/portal/login.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/portal/register": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/portal/register", "dataRoute": "/merchant/portal/register.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] }, "/merchant/dashboard": { "experimentalBypassFor": [{ "type": "header", "key": "next-action" }, { "type": "header", "key": "content-type", "value": "multipart/form-data;.*" }], "initialRevalidateSeconds": false, "srcRoute": "/merchant/dashboard", "dataRoute": "/merchant/dashboard.rsc", "allowHeader": ["host", "x-matched-path", "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-next-revalidated-tags", "x-next-revalidate-tag-token"] } }, "dynamicRoutes": {}, "notFoundRoutes": [], "preview": { "previewModeId": "53954edc9771abda13f99487bdbff6bc", "previewModeSigningKey": "b97441eb9057b74e60fe2abfaaabff616ed3ebc278dd18c42d5a95ddd23768c8", "previewModeEncryptionKey": "598f233973c6fb1c9eb6519ef891d8ac4fda60d5c17c72f386d280e4ada2bd7b" } };
var MiddlewareManifest = { "version": 3, "middleware": { "/": { "files": ["server/edge-runtime-webpack.js", "server/middleware.js"], "name": "middleware", "page": "/", "matchers": [{ "regexp": "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!_next\\/static|_next\\/image|favicon.ico).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$", "originalSource": "/((?!_next/static|_next/image|favicon.ico).*)" }], "wasm": [], "assets": [], "env": { "__NEXT_BUILD_ID": "mzuYdRSx6_uM9dHUNkRU3", "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY": "fmeZkyjLZ7u17gAuzIge7hwcWbJEmm1YiQ8iwrG+1lE=", "__NEXT_PREVIEW_MODE_ID": "53954edc9771abda13f99487bdbff6bc", "__NEXT_PREVIEW_MODE_SIGNING_KEY": "b97441eb9057b74e60fe2abfaaabff616ed3ebc278dd18c42d5a95ddd23768c8", "__NEXT_PREVIEW_MODE_ENCRYPTION_KEY": "598f233973c6fb1c9eb6519ef891d8ac4fda60d5c17c72f386d280e4ada2bd7b" } } }, "functions": {}, "sortedMiddleware": ["/"] };
var AppPathsManifest = { "/_not-found/page": "app/_not-found/page.js", "/api/admin/broadcast/route": "app/api/admin/broadcast/route.js", "/api/admin/generate-description/route": "app/api/admin/generate-description/route.js", "/api/admin/intelligence/pulse/route": "app/api/admin/intelligence/pulse/route.js", "/api/admin/integrations/verify/route": "app/api/admin/integrations/verify/route.js", "/api/admin/logout/route": "app/api/admin/logout/route.js", "/api/admin/notify-admin/route": "app/api/admin/notify-admin/route.js", "/api/admin/notify-customer/route": "app/api/admin/notify-customer/route.js", "/api/admin/payout-worker/route": "app/api/admin/payout-worker/route.js", "/api/admin/products/autofill/route": "app/api/admin/products/autofill/route.js", "/api/admin/pulse/route": "app/api/admin/pulse/route.js", "/api/admin/recover-carts/route": "app/api/admin/recover-carts/route.js", "/api/admin/social/publish/route": "app/api/admin/social/publish/route.js", "/api/admin/vendor-pricing/route": "app/api/admin/vendor-pricing/route.js", "/api/dispatch/calculate/route": "app/api/dispatch/calculate/route.js", "/api/health/route": "app/api/health/route.js", "/api/location/resolve/route": "app/api/location/resolve/route.js", "/api/marketing/unsubscribe/route": "app/api/marketing/unsubscribe/route.js", "/api/mobile/widget-config/route": "app/api/mobile/widget-config/route.js", "/api/newsletter/subscribe/route": "app/api/newsletter/subscribe/route.js", "/api/paystack/webhook/route": "app/api/paystack/webhook/route.js", "/api/rider/auth/verify/route": "app/api/rider/auth/verify/route.js", "/api/rider/auth/otp/route": "app/api/rider/auth/otp/route.js", "/api/support/ai-concierge/route": "app/api/support/ai-concierge/route.js", "/api/webhooks/whatsapp/route": "app/api/webhooks/whatsapp/route.js", "/auth/callback/route": "app/auth/callback/route.js", "/api/admin/ai/verify/route": "app/api/admin/ai/verify/route.js", "/api/admin/affiliate-payouts/route": "app/api/admin/affiliate-payouts/route.js", "/api/admin/analytics/dashboard/route": "app/api/admin/analytics/dashboard/route.js", "/api/admin/affiliates/route": "app/api/admin/affiliates/route.js", "/api/admin/analytics/heatmap/route": "app/api/admin/analytics/heatmap/route.js", "/api/admin/ask-ob/route": "app/api/admin/ask-ob/route.js", "/api/admin/autopilot-rules/route": "app/api/admin/autopilot-rules/route.js", "/api/admin/audit-logs/route": "app/api/admin/audit-logs/route.js", "/api/admin/behavior-metrics/route": "app/api/admin/behavior-metrics/route.js", "/api/admin/behavior/sessions/route": "app/api/admin/behavior/sessions/route.js", "/api/admin/bites/route": "app/api/admin/bites/route.js", "/api/admin/customer-location-map/route": "app/api/admin/customer-location-map/route.js", "/api/admin/concierge/route": "app/api/admin/concierge/route.js", "/api/admin/connection-health/route": "app/api/admin/connection-health/route.js", "/api/admin/customer-intelligence/route": "app/api/admin/customer-intelligence/route.js", "/api/admin/behavior/live/route": "app/api/admin/behavior/live/route.js", "/api/admin/customer-messaging/test/route": "app/api/admin/customer-messaging/test/route.js", "/api/admin/customer-messaging/route": "app/api/admin/customer-messaging/route.js", "/api/admin/customers/route": "app/api/admin/customers/route.js", "/api/admin/customers/[phone]/loyalty/route": "app/api/admin/customers/[phone]/loyalty/route.js", "/api/admin/dashboard-data/route": "app/api/admin/dashboard-data/route.js", "/api/admin/delivery/route": "app/api/admin/delivery/route.js", "/api/admin/delivery/route/route": "app/api/admin/delivery/route/route.js", "/api/admin/customers/[phone]/crm/route": "app/api/admin/customers/[phone]/crm/route.js", "/api/admin/delivery-areas/route": "app/api/admin/delivery-areas/route.js", "/api/admin/demand-intelligence/route": "app/api/admin/demand-intelligence/route.js", "/api/admin/customers/[phone]/profile/route": "app/api/admin/customers/[phone]/profile/route.js", "/api/admin/delivery/vendor-scorecard/route": "app/api/admin/delivery/vendor-scorecard/route.js", "/api/admin/engraving-jobs/[id]/svg/route": "app/api/admin/engraving-jobs/[id]/svg/route.js", "/api/admin/dispatch/riders/route": "app/api/admin/dispatch/riders/route.js", "/api/admin/finance-data/route": "app/api/admin/finance-data/route.js", "/api/admin/email-center/route": "app/api/admin/email-center/route.js", "/api/admin/food-addons/route": "app/api/admin/food-addons/route.js", "/api/admin/engraving-jobs/route": "app/api/admin/engraving-jobs/route.js", "/api/admin/food-image/route": "app/api/admin/food-image/route.js", "/api/admin/governance/route": "app/api/admin/governance/route.js", "/api/admin/instagram/callback/route": "app/api/admin/instagram/callback/route.js", "/api/admin/instagram/disconnect/route": "app/api/admin/instagram/disconnect/route.js", "/api/admin/instagram/connect/route": "app/api/admin/instagram/connect/route.js", "/api/admin/gamification/route": "app/api/admin/gamification/route.js", "/api/admin/halloween-intelligence/route": "app/api/admin/halloween-intelligence/route.js", "/api/admin/integrations/daraja/route": "app/api/admin/integrations/daraja/route.js", "/api/admin/instagram/status/route": "app/api/admin/instagram/status/route.js", "/api/admin/intelligence/stalled-riders/route": "app/api/admin/intelligence/stalled-riders/route.js", "/api/admin/intelligence/funnel/route": "app/api/admin/intelligence/funnel/route.js", "/api/admin/intelligence/commander-brief/route": "app/api/admin/intelligence/commander-brief/route.js", "/api/admin/launch-ops/route": "app/api/admin/launch-ops/route.js", "/api/admin/kitchen/orders/route": "app/api/admin/kitchen/orders/route.js", "/api/admin/launch-readiness/route": "app/api/admin/launch-readiness/route.js", "/api/admin/leads/route": "app/api/admin/leads/route.js", "/api/admin/loyalty/order/route": "app/api/admin/loyalty/order/route.js", "/api/admin/market/applications/route": "app/api/admin/market/applications/route.js", "/api/admin/dispatch/route": "app/api/admin/dispatch/route.js", "/api/admin/market/campaign/route": "app/api/admin/market/campaign/route.js", "/api/admin/market/merchants/route": "app/api/admin/market/merchants/route.js", "/api/admin/market/orders/route": "app/api/admin/market/orders/route.js", "/api/admin/market/offers/route": "app/api/admin/market/offers/route.js", "/api/admin/market/products/route": "app/api/admin/market/products/route.js", "/api/admin/login/route": "app/api/admin/login/route.js", "/api/admin/market/reports/route": "app/api/admin/market/reports/route.js", "/api/admin/merchant-catalog-prices/route": "app/api/admin/merchant-catalog-prices/route.js", "/api/admin/merchant-document-requirements/route": "app/api/admin/merchant-document-requirements/route.js", "/api/admin/messages/route": "app/api/admin/messages/route.js", "/api/admin/merchant-onboarding-controls/route": "app/api/admin/merchant-onboarding-controls/route.js", "/api/admin/merchant-applications/route": "app/api/admin/merchant-applications/route.js", "/api/admin/newsletter-subscribers/route": "app/api/admin/newsletter-subscribers/route.js", "/api/admin/operating-brain/route": "app/api/admin/operating-brain/route.js", "/api/admin/mobile-widgets/route": "app/api/admin/mobile-widgets/route.js", "/api/admin/merchant-store/[id]/route": "app/api/admin/merchant-store/[id]/route.js", "/api/admin/operations/tasks/route": "app/api/admin/operations/tasks/route.js", "/api/admin/popups/route": "app/api/admin/popups/route.js", "/api/admin/product-image/route": "app/api/admin/product-image/route.js", "/api/admin/public-launch-gate/route": "app/api/admin/public-launch-gate/route.js", "/api/admin/security-logs/route": "app/api/admin/security-logs/route.js", "/api/admin/riders/[id]/route": "app/api/admin/riders/[id]/route.js", "/api/admin/orders/route": "app/api/admin/orders/route.js", "/api/admin/operations/flow/route": "app/api/admin/operations/flow/route.js", "/api/admin/settings/route": "app/api/admin/settings/route.js", "/api/admin/products/route": "app/api/admin/products/route.js", "/api/admin/support-view/customer-session/route": "app/api/admin/support-view/customer-session/route.js", "/api/admin/ticketing/email-preview/route": "app/api/admin/ticketing/email-preview/route.js", "/api/admin/system-lockdown/route": "app/api/admin/system-lockdown/route.js", "/api/admin/spin-campaign/route": "app/api/admin/spin-campaign/route.js", "/api/admin/staff/route": "app/api/admin/staff/route.js", "/api/admin/ticketing/insights/route": "app/api/admin/ticketing/insights/route.js", "/api/admin/system-pulse/route": "app/api/admin/system-pulse/route.js", "/api/admin/ticketing/email-settings/route": "app/api/admin/ticketing/email-settings/route.js", "/api/admin/ticketing/live/route": "app/api/admin/ticketing/live/route.js", "/api/admin/support-view/route": "app/api/admin/support-view/route.js", "/api/admin/ticketing/mfa/route": "app/api/admin/ticketing/mfa/route.js", "/api/admin/ticketing/sales/route": "app/api/admin/ticketing/sales/route.js", "/api/admin/ticketing/promotions/route": "app/api/admin/ticketing/promotions/route.js", "/api/admin/ticketing/transfers/access/route": "app/api/admin/ticketing/transfers/access/route.js", "/api/admin/ticketing/sales/email-preview/route": "app/api/admin/ticketing/sales/email-preview/route.js", "/api/admin/ticketing/security/route": "app/api/admin/ticketing/security/route.js", "/api/admin/ticketing/staff/route": "app/api/admin/ticketing/staff/route.js", "/api/admin/ticketing/route": "app/api/admin/ticketing/route.js", "/api/admin/ticketing/transfers/route": "app/api/admin/ticketing/transfers/route.js", "/api/admin/vendor-onboarding/route": "app/api/admin/vendor-onboarding/route.js", "/api/admin/waitlist-fit-studio/route": "app/api/admin/waitlist-fit-studio/route.js", "/api/affiliate/invitations/route": "app/api/affiliate/invitations/route.js", "/api/affiliate/invitations/accept/route": "app/api/affiliate/invitations/accept/route.js", "/api/affiliate/route": "app/api/affiliate/route.js", "/api/affiliate/payouts/route": "app/api/affiliate/payouts/route.js", "/api/analytics/track/route": "app/api/analytics/track/route.js", "/api/catalog/products/route": "app/api/catalog/products/route.js", "/api/checkout/marketing-consent/route": "app/api/checkout/marketing-consent/route.js", "/api/admin/traceability/route": "app/api/admin/traceability/route.js", "/api/admin/waitlist-site/route": "app/api/admin/waitlist-site/route.js", "/api/app-install/access/route": "app/api/app-install/access/route.js", "/api/customer/abandoned-cart/route": "app/api/customer/abandoned-cart/route.js", "/api/admin/waitlist/route": "app/api/admin/waitlist/route.js", "/api/customer-announcements/route": "app/api/customer-announcements/route.js", "/api/concierge/route": "app/api/concierge/route.js", "/api/customer/location-share/route": "app/api/customer/location-share/route.js", "/api/customer/notification-preferences/route": "app/api/customer/notification-preferences/route.js", "/api/customer/order-complaints/route": "app/api/customer/order-complaints/route.js", "/api/buzz/discovery/route": "app/api/buzz/discovery/route.js", "/api/buzz/[id]/route": "app/api/buzz/[id]/route.js", "/api/checkout/orders/route": "app/api/checkout/orders/route.js", "/api/internal/merchant-alerts/dispatch/route": "app/api/internal/merchant-alerts/dispatch/route.js", "/api/location/catalog/route": "app/api/location/catalog/route.js", "/api/delivery/track/route": "app/api/delivery/track/route.js", "/api/loyalty/config/route": "app/api/loyalty/config/route.js", "/api/market/catalog/route": "app/api/market/catalog/route.js", "/api/market/merchant-catalog/route": "app/api/market/merchant-catalog/route.js", "/api/market/merchant-application/route": "app/api/market/merchant-application/route.js", "/api/market/merchant-products/route": "app/api/market/merchant-products/route.js", "/api/market/merchant-offers/route": "app/api/market/merchant-offers/route.js", "/api/location/route": "app/api/location/route.js", "/api/market/offers/route": "app/api/market/offers/route.js", "/api/market/merchant-stock-offers/route": "app/api/market/merchant-stock-offers/route.js", "/api/member/achievement/route": "app/api/member/achievement/route.js", "/api/member/gamification/route": "app/api/member/gamification/route.js", "/api/member/loyalty/route": "app/api/member/loyalty/route.js", "/api/member/reward-review/route": "app/api/member/reward-review/route.js", "/api/member/referrals/route": "app/api/member/referrals/route.js", "/api/merchant-applications/onboarding-events/route": "app/api/merchant-applications/onboarding-events/route.js", "/api/merchant-applications/documents/route": "app/api/merchant-applications/documents/route.js", "/api/merchant-onboarding-invite/route": "app/api/merchant-onboarding-invite/route.js", "/api/merchant-onboarding-draft/route": "app/api/merchant-onboarding-draft/route.js", "/api/merchant/food-orders/route": "app/api/merchant/food-orders/route.js", "/api/merchant/preferences/route": "app/api/merchant/preferences/route.js", "/api/merchant/business/branches/route": "app/api/merchant/business/branches/route.js", "/api/merchant/alerts/route": "app/api/merchant/alerts/route.js", "/api/merchant/riders/route": "app/api/merchant/riders/route.js", "/api/merchant/scorecard/route": "app/api/merchant/scorecard/route.js", "/api/orders/status/route": "app/api/orders/status/route.js", "/api/merchant-applications/route": "app/api/merchant-applications/route.js", "/api/mpesa/rider-delivery-callback/[token]/route": "app/api/mpesa/rider-delivery-callback/[token]/route.js", "/api/merchant/network/route": "app/api/merchant/network/route.js", "/api/mpesa/orders/webhook/[token]/route": "app/api/mpesa/orders/webhook/[token]/route.js", "/api/profile/checkout-details/route": "app/api/profile/checkout-details/route.js", "/api/paystack/verify-order/route": "app/api/paystack/verify-order/route.js", "/api/public-launch-gate/route": "app/api/public-launch-gate/route.js", "/api/push/config/route": "app/api/push/config/route.js", "/api/profile/workspaces/route": "app/api/profile/workspaces/route.js", "/api/ready/route": "app/api/ready/route.js", "/api/payhero/orders/webhook/route": "app/api/payhero/orders/webhook/route.js", "/api/payhero/ticketing/webhook/route": "app/api/payhero/ticketing/webhook/route.js", "/api/push/test/route": "app/api/push/test/route.js", "/api/push/subscriptions/route": "app/api/push/subscriptions/route.js", "/api/rider/alerts/route": "app/api/rider/alerts/route.js", "/api/reviews/route": "app/api/reviews/route.js", "/api/rider/delivery-issue/route": "app/api/rider/delivery-issue/route.js", "/api/rider/delivery-status/route": "app/api/rider/delivery-status/route.js", "/api/rider/handover/route": "app/api/rider/handover/route.js", "/api/rider/arriving/route": "app/api/rider/arriving/route.js", "/api/rider/merchant-invites/route": "app/api/rider/merchant-invites/route.js", "/api/rider/delivery-payment/route": "app/api/rider/delivery-payment/route.js", "/api/rider/onboarding/progress/route": "app/api/rider/onboarding/progress/route.js", "/api/rider/missions/route": "app/api/rider/missions/route.js", "/api/rider/offers/respond/route": "app/api/rider/offers/respond/route.js", "/api/rider/pickup-arrived/route": "app/api/rider/pickup-arrived/route.js", "/api/rider/pin/route": "app/api/rider/pin/route.js", "/api/rider/preferences/route": "app/api/rider/preferences/route.js", "/api/rider/onboarding/verification/route": "app/api/rider/onboarding/verification/route.js", "/api/settings/route": "app/api/settings/route.js", "/api/rider/session/route": "app/api/rider/session/route.js", "/api/rider/session/account/route": "app/api/rider/session/account/route.js", "/api/rider/status/route": "app/api/rider/status/route.js", "/api/rider/sync-location/route": "app/api/rider/sync-location/route.js", "/api/rider/profile/route": "app/api/rider/profile/route.js", "/api/support/messages/route": "app/api/support/messages/route.js", "/api/support/contact/route": "app/api/support/contact/route.js", "/api/spin-campaign/route": "app/api/spin-campaign/route.js", "/api/ticketing/email/route": "app/api/ticketing/email/route.js", "/api/ticketing/message/route": "app/api/ticketing/message/route.js", "/api/ticketing/theme/route": "app/api/ticketing/theme/route.js", "/api/ticketing/checkout/route": "app/api/ticketing/checkout/route.js", "/api/ticketing/promotions/validate/route": "app/api/ticketing/promotions/validate/route.js", "/api/ticketing/wallet/route": "app/api/ticketing/wallet/route.js", "/api/webhooks/twilio/merchant-alert/confirm/route": "app/api/webhooks/twilio/merchant-alert/confirm/route.js", "/api/webhooks/jmsurf-mail/route": "app/api/webhooks/jmsurf-mail/route.js", "/api/webhooks/twilio/merchant-alert/voice/route": "app/api/webhooks/twilio/merchant-alert/voice/route.js", "/api/webhooks/twilio/merchant-alert/status/route": "app/api/webhooks/twilio/merchant-alert/status/route.js", "/api/ticketing/scanner/route": "app/api/ticketing/scanner/route.js", "/google_merchant.xml/route": "app/google_merchant.xml/route.js", "/sitemap.xml/route": "app/sitemap.xml/route.js", "/about/page": "app/about/page.js", "/accessibility/page": "app/accessibility/page.js", "/beverages/page": "app/beverages/page.js", "/bites/page": "app/bites/page.js", "/blog/[slug]/page": "app/blog/[slug]/page.js", "/blog/category/knowledge-base/page": "app/blog/category/knowledge-base/page.js", "/blog/page": "app/blog/page.js", "/buzz/[slug]/page": "app/buzz/[slug]/page.js", "/build-my-night/page": "app/build-my-night/page.js", "/buzz/page": "app/buzz/page.js", "/cart/page": "app/cart/page.js", "/checkout/page": "app/checkout/page.js", "/checkout/success/page": "app/checkout/success/page.js", "/cookies/page": "app/cookies/page.js", "/corporate/page": "app/corporate/page.js", "/dispatch/[id]/page": "app/dispatch/[id]/page.js", "/extras/page": "app/extras/page.js", "/gifting/page": "app/gifting/page.js", "/halloween/page": "app/halloween/page.js", "/onboarding/page": "app/onboarding/page.js", "/newsletter/unsubscribe/page": "app/newsletter/unsubscribe/page.js", "/returns/page": "app/returns/page.js", "/rewards/page": "app/rewards/page.js", "/profile/page": "app/profile/page.js", "/rider/dashboard/page": "app/rider/dashboard/page.js", "/rider/login/page": "app/rider/login/page.js", "/rider/onboarding/page": "app/rider/onboarding/page.js", "/scanner/page": "app/scanner/page.js", "/shipping/page": "app/shipping/page.js", "/shop/category/[slug]/page": "app/shop/category/[slug]/page.js", "/profile/crews/page": "app/profile/crews/page.js", "/shop/[id]/page": "app/shop/[id]/page.js", "/shop/snacks/page": "app/shop/snacks/page.js", "/shop/page": "app/shop/page.js", "/souvenirs/page": "app/souvenirs/page.js", "/spin/page": "app/spin/page.js", "/privacy/page": "app/privacy/page.js", "/terms/page": "app/terms/page.js", "/product/[productId]/page": "app/product/[productId]/page.js", "/track/page": "app/track/page.js", "/verify/[id]/page": "app/verify/[id]/page.js", "/venue/[id]/page": "app/venue/[id]/page.js", "/venue/dashboard/page": "app/venue/dashboard/page.js", "/warranty/page": "app/warranty/page.js", "/wishlist/page": "app/wishlist/page.js", "/auth/page": "app/auth/page.js", "/build-the-night/page": "app/build-the-night/page.js", "/launch-countdown/page": "app/launch-countdown/page.js", "/concierge/page": "app/concierge/page.js", "/page": "app/page.js", "/rider/page": "app/rider/page.js", "/guides/how-much-alcohol-for-a-party/page": "app/guides/how-much-alcohol-for-a-party/page.js", "/delivery/page": "app/delivery/page.js", "/vendor/page": "app/vendor/page.js", "/merchant/business/page": "app/merchant/business/page.js", "/merchant/documents/page": "app/merchant/documents/page.js", "/merchant/halloween/page": "app/merchant/halloween/page.js", "/merchant/liquor-onboarding/page": "app/merchant/liquor-onboarding/page.js", "/merchant/onboarding/page": "app/merchant/onboarding/page.js", "/merchant/network/page": "app/merchant/network/page.js", "/affiliate/dashboard/page": "app/affiliate/dashboard/page.js", "/affiliate/page": "app/affiliate/page.js", "/affiliate/register/page": "app/affiliate/register/page.js", "/affiliate/agreement/page": "app/affiliate/agreement/page.js", "/admin/login/page": "app/admin/login/page.js", "/lord/login/page": "app/lord/login/page.js", "/contact/page": "app/contact/page.js", "/card-games/page": "app/card-games/page.js", "/market/category/[slug]/page": "app/market/category/[slug]/page.js", "/market/page": "app/market/page.js", "/market/product/[slug]/page": "app/market/product/[slug]/page.js", "/market/store/[slug]/page": "app/market/store/[slug]/page.js", "/supplier/dashboard/page": "app/supplier/dashboard/page.js", "/supplier/page": "app/supplier/page.js", "/supplier/inventory/page": "app/supplier/inventory/page.js", "/supplier/propose/page": "app/supplier/propose/page.js", "/supplier/settlements/page": "app/supplier/settlements/page.js", "/tickets/confirmation/page": "app/tickets/confirmation/page.js", "/tickets/[slug]/page": "app/tickets/[slug]/page.js", "/tickets/page": "app/tickets/page.js", "/admin/(dashboard)/abandoned/page": "app/admin/(dashboard)/abandoned/page.js", "/admin/(dashboard)/affiliates/page": "app/admin/(dashboard)/affiliates/page.js", "/admin/(dashboard)/analytics/images/page": "app/admin/(dashboard)/analytics/images/page.js", "/admin/(dashboard)/analytics/page": "app/admin/(dashboard)/analytics/page.js", "/admin/(dashboard)/analytics/intelligence/page": "app/admin/(dashboard)/analytics/intelligence/page.js", "/admin/(dashboard)/audit/page": "app/admin/(dashboard)/audit/page.js", "/admin/(dashboard)/behavior/funnels/page": "app/admin/(dashboard)/behavior/funnels/page.js", "/admin/(dashboard)/behavior/live/page": "app/admin/(dashboard)/behavior/live/page.js", "/admin/(dashboard)/behavior/page": "app/admin/(dashboard)/behavior/page.js", "/admin/(dashboard)/behavior/radar/page": "app/admin/(dashboard)/behavior/radar/page.js", "/admin/(dashboard)/behavior/sessions/page": "app/admin/(dashboard)/behavior/sessions/page.js", "/admin/(dashboard)/bites/page": "app/admin/(dashboard)/bites/page.js", "/admin/(dashboard)/blog/page": "app/admin/(dashboard)/blog/page.js", "/admin/(dashboard)/broadcast/page": "app/admin/(dashboard)/broadcast/page.js", "/admin/(dashboard)/buzz/command/page": "app/admin/(dashboard)/buzz/command/page.js", "/admin/(dashboard)/buzz/page": "app/admin/(dashboard)/buzz/page.js", "/admin/(dashboard)/communications/command/page": "app/admin/(dashboard)/communications/command/page.js", "/admin/(dashboard)/communications/automation/page": "app/admin/(dashboard)/communications/automation/page.js", "/admin/(dashboard)/communications/email/page": "app/admin/(dashboard)/communications/email/page.js", "/admin/(dashboard)/communications/popups/page": "app/admin/(dashboard)/communications/popups/page.js", "/admin/(dashboard)/communications/sms/page": "app/admin/(dashboard)/communications/sms/page.js", "/admin/(dashboard)/communications/whatsapp/page": "app/admin/(dashboard)/communications/whatsapp/page.js", "/admin/(dashboard)/content/page": "app/admin/(dashboard)/content/page.js", "/admin/(dashboard)/coupons/page": "app/admin/(dashboard)/coupons/page.js", "/admin/(dashboard)/customer-intelligence/page": "app/admin/(dashboard)/customer-intelligence/page.js", "/admin/(dashboard)/customers/[phone]/360/page": "app/admin/(dashboard)/customers/[phone]/360/page.js", "/admin/(dashboard)/customers/[phone]/page": "app/admin/(dashboard)/customers/[phone]/page.js", "/admin/(dashboard)/customers/page": "app/admin/(dashboard)/customers/page.js", "/admin/(dashboard)/delivery/page": "app/admin/(dashboard)/delivery/page.js", "/admin/(dashboard)/demand/page": "app/admin/(dashboard)/demand/page.js", "/admin/(dashboard)/dispatch/page": "app/admin/(dashboard)/dispatch/page.js", "/admin/(dashboard)/experience/mobile-widgets/page": "app/admin/(dashboard)/experience/mobile-widgets/page.js", "/admin/(dashboard)/experience/widgets/page": "app/admin/(dashboard)/experience/widgets/page.js", "/admin/(dashboard)/finance/page": "app/admin/(dashboard)/finance/page.js", "/admin/(dashboard)/forge/[id]/page": "app/admin/(dashboard)/forge/[id]/page.js", "/admin/(dashboard)/forge/page": "app/admin/(dashboard)/forge/page.js", "/admin/(dashboard)/gamification/page": "app/admin/(dashboard)/gamification/page.js", "/admin/(dashboard)/growth/accounts/page": "app/admin/(dashboard)/growth/accounts/page.js", "/admin/(dashboard)/growth/autopilot/page": "app/admin/(dashboard)/growth/autopilot/page.js", "/admin/(dashboard)/growth/calendar/page": "app/admin/(dashboard)/growth/calendar/page.js", "/admin/(dashboard)/growth/camera/page": "app/admin/(dashboard)/growth/camera/page.js", "/admin/(dashboard)/growth/content/page": "app/admin/(dashboard)/growth/content/page.js", "/admin/(dashboard)/halloween-intelligence/page": "app/admin/(dashboard)/halloween-intelligence/page.js", "/admin/(dashboard)/inventory/beverages/page": "app/admin/(dashboard)/inventory/beverages/page.js", "/admin/(dashboard)/inventory/dossiers/edit/[id]/page": "app/admin/(dashboard)/inventory/dossiers/edit/[id]/page.js", "/admin/(dashboard)/inventory/dossiers/page": "app/admin/(dashboard)/inventory/dossiers/page.js", "/admin/(dashboard)/kitchen/page": "app/admin/(dashboard)/kitchen/page.js", "/admin/(dashboard)/launch/page": "app/admin/(dashboard)/launch/page.js", "/admin/(dashboard)/market/page": "app/admin/(dashboard)/market/page.js", "/admin/(dashboard)/marketing/ab-testing/page": "app/admin/(dashboard)/marketing/ab-testing/page.js", "/admin/(dashboard)/marketing/abandoned/page": "app/admin/(dashboard)/marketing/abandoned/page.js", "/admin/(dashboard)/marketing/ai-agency/page": "app/admin/(dashboard)/marketing/ai-agency/page.js", "/admin/(dashboard)/marketing/audiences/page": "app/admin/(dashboard)/marketing/audiences/page.js", "/admin/(dashboard)/marketing/automation/page": "app/admin/(dashboard)/marketing/automation/page.js", "/admin/(dashboard)/marketing/create/page": "app/admin/(dashboard)/marketing/create/page.js", "/admin/(dashboard)/marketing/experiments/page": "app/admin/(dashboard)/marketing/experiments/page.js", "/admin/(dashboard)/marketing/list/page": "app/admin/(dashboard)/marketing/list/page.js", "/admin/(dashboard)/marketing/page": "app/admin/(dashboard)/marketing/page.js", "/admin/(dashboard)/marketing/stories/page": "app/admin/(dashboard)/marketing/stories/page.js", "/admin/(dashboard)/media/page": "app/admin/(dashboard)/media/page.js", "/admin/(dashboard)/merchants/[id]/page": "app/admin/(dashboard)/merchants/[id]/page.js", "/admin/(dashboard)/merchants/page": "app/admin/(dashboard)/merchants/page.js", "/admin/(dashboard)/messages/page": "app/admin/(dashboard)/messages/page.js", "/admin/(dashboard)/munchies/page": "app/admin/(dashboard)/munchies/page.js", "/admin/(dashboard)/operations/hubs/page": "app/admin/(dashboard)/operations/hubs/page.js", "/admin/(dashboard)/operations/page": "app/admin/(dashboard)/operations/page.js", "/admin/(dashboard)/operations/sourcing/page": "app/admin/(dashboard)/operations/sourcing/page.js", "/admin/(dashboard)/operations/suppliers/page": "app/admin/(dashboard)/operations/suppliers/page.js", "/admin/(dashboard)/operations/tasks/page": "app/admin/(dashboard)/operations/tasks/page.js", "/admin/(dashboard)/operations/vendors/page": "app/admin/(dashboard)/operations/vendors/page.js", "/admin/(dashboard)/orders/page": "app/admin/(dashboard)/orders/page.js", "/admin/(dashboard)/page": "app/admin/(dashboard)/page.js", "/admin/(dashboard)/payouts/page": "app/admin/(dashboard)/payouts/page.js", "/admin/(dashboard)/pulse/page": "app/admin/(dashboard)/pulse/page.js", "/admin/(dashboard)/ratings/page": "app/admin/(dashboard)/ratings/page.js", "/admin/(dashboard)/reports/page": "app/admin/(dashboard)/reports/page.js", "/admin/(dashboard)/reviews/page": "app/admin/(dashboard)/reviews/page.js", "/admin/(dashboard)/riders/[id]/page": "app/admin/(dashboard)/riders/[id]/page.js", "/admin/(dashboard)/security/page": "app/admin/(dashboard)/security/page.js", "/admin/(dashboard)/spin-campaign/page": "app/admin/(dashboard)/spin-campaign/page.js", "/admin/(dashboard)/souvenirs/page": "app/admin/(dashboard)/souvenirs/page.js", "/admin/(dashboard)/settings/page": "app/admin/(dashboard)/settings/page.js", "/admin/(dashboard)/staff/[id]/page": "app/admin/(dashboard)/staff/[id]/page.js", "/admin/(dashboard)/staff/page": "app/admin/(dashboard)/staff/page.js", "/admin/(dashboard)/subscribers/page": "app/admin/(dashboard)/subscribers/page.js", "/admin/(dashboard)/support/page": "app/admin/(dashboard)/support/page.js", "/admin/(dashboard)/support/vip-relay/page": "app/admin/(dashboard)/support/vip-relay/page.js", "/admin/(dashboard)/traceability/page": "app/admin/(dashboard)/traceability/page.js", "/admin/(dashboard)/upload/page": "app/admin/(dashboard)/upload/page.js", "/admin/(dashboard)/vault/page": "app/admin/(dashboard)/vault/page.js", "/admin/(dashboard)/waitlist/invitations/page": "app/admin/(dashboard)/waitlist/invitations/page.js", "/admin/(dashboard)/warranty/page": "app/admin/(dashboard)/warranty/page.js", "/admin/(dashboard)/waitlist/page": "app/admin/(dashboard)/waitlist/page.js", "/lord/(dashboard)/abandoned/page": "app/lord/(dashboard)/abandoned/page.js", "/lord/(dashboard)/affiliates/page": "app/lord/(dashboard)/affiliates/page.js", "/lord/(dashboard)/analytics/images/page": "app/lord/(dashboard)/analytics/images/page.js", "/lord/(dashboard)/analytics/intelligence/page": "app/lord/(dashboard)/analytics/intelligence/page.js", "/lord/(dashboard)/analytics/page": "app/lord/(dashboard)/analytics/page.js", "/lord/(dashboard)/behavior/funnels/page": "app/lord/(dashboard)/behavior/funnels/page.js", "/lord/(dashboard)/audit/page": "app/lord/(dashboard)/audit/page.js", "/lord/(dashboard)/behavior/live/page": "app/lord/(dashboard)/behavior/live/page.js", "/lord/(dashboard)/behavior/page": "app/lord/(dashboard)/behavior/page.js", "/lord/(dashboard)/behavior/radar/page": "app/lord/(dashboard)/behavior/radar/page.js", "/lord/(dashboard)/behavior/sessions/page": "app/lord/(dashboard)/behavior/sessions/page.js", "/lord/(dashboard)/bites/page": "app/lord/(dashboard)/bites/page.js", "/lord/(dashboard)/blog/page": "app/lord/(dashboard)/blog/page.js", "/lord/(dashboard)/broadcast/page": "app/lord/(dashboard)/broadcast/page.js", "/lord/(dashboard)/buzz/campaigns/page": "app/lord/(dashboard)/buzz/campaigns/page.js", "/lord/(dashboard)/buzz/command/page": "app/lord/(dashboard)/buzz/command/page.js", "/lord/(dashboard)/buzz/create/page": "app/lord/(dashboard)/buzz/create/page.js", "/lord/(dashboard)/buzz/page": "app/lord/(dashboard)/buzz/page.js", "/lord/(dashboard)/communications/automation/page": "app/lord/(dashboard)/communications/automation/page.js", "/lord/(dashboard)/communications/command/page": "app/lord/(dashboard)/communications/command/page.js", "/lord/(dashboard)/communications/email/page": "app/lord/(dashboard)/communications/email/page.js", "/lord/(dashboard)/communications/popups/page": "app/lord/(dashboard)/communications/popups/page.js", "/lord/(dashboard)/communications/sms/page": "app/lord/(dashboard)/communications/sms/page.js", "/lord/(dashboard)/communications/whatsapp/page": "app/lord/(dashboard)/communications/whatsapp/page.js", "/lord/(dashboard)/concierge-trainer/page": "app/lord/(dashboard)/concierge-trainer/page.js", "/lord/(dashboard)/content/page": "app/lord/(dashboard)/content/page.js", "/lord/(dashboard)/coupons/page": "app/lord/(dashboard)/coupons/page.js", "/lord/(dashboard)/customer-intelligence/page": "app/lord/(dashboard)/customer-intelligence/page.js", "/lord/(dashboard)/customers/[phone]/360/page": "app/lord/(dashboard)/customers/[phone]/360/page.js", "/lord/(dashboard)/customers/[phone]/page": "app/lord/(dashboard)/customers/[phone]/page.js", "/lord/(dashboard)/customers/page": "app/lord/(dashboard)/customers/page.js", "/lord/(dashboard)/delivery-zones/page": "app/lord/(dashboard)/delivery-zones/page.js", "/lord/(dashboard)/delivery/page": "app/lord/(dashboard)/delivery/page.js", "/lord/(dashboard)/delivery/scorecard/page": "app/lord/(dashboard)/delivery/scorecard/page.js", "/lord/(dashboard)/demand/page": "app/lord/(dashboard)/demand/page.js", "/lord/(dashboard)/dispatch/page": "app/lord/(dashboard)/dispatch/page.js", "/lord/(dashboard)/engraving-production/page": "app/lord/(dashboard)/engraving-production/page.js", "/lord/(dashboard)/experience/mobile-widgets/page": "app/lord/(dashboard)/experience/mobile-widgets/page.js", "/lord/(dashboard)/experience/widgets/page": "app/lord/(dashboard)/experience/widgets/page.js", "/lord/(dashboard)/finance/page": "app/lord/(dashboard)/finance/page.js", "/lord/(dashboard)/forge/[id]/page": "app/lord/(dashboard)/forge/[id]/page.js", "/lord/(dashboard)/forge/page": "app/lord/(dashboard)/forge/page.js", "/lord/(dashboard)/gamification/page": "app/lord/(dashboard)/gamification/page.js", "/lord/(dashboard)/growth/accounts/page": "app/lord/(dashboard)/growth/accounts/page.js", "/lord/(dashboard)/growth/autopilot/page": "app/lord/(dashboard)/growth/autopilot/page.js", "/lord/(dashboard)/growth/calendar/page": "app/lord/(dashboard)/growth/calendar/page.js", "/lord/(dashboard)/growth/camera/page": "app/lord/(dashboard)/growth/camera/page.js", "/lord/(dashboard)/growth/content/page": "app/lord/(dashboard)/growth/content/page.js", "/lord/(dashboard)/halloween-intelligence/page": "app/lord/(dashboard)/halloween-intelligence/page.js", "/lord/(dashboard)/inventory/beverages/page": "app/lord/(dashboard)/inventory/beverages/page.js", "/lord/(dashboard)/inventory/dossiers/edit/[id]/page": "app/lord/(dashboard)/inventory/dossiers/edit/[id]/page.js", "/lord/(dashboard)/inventory/dossiers/page": "app/lord/(dashboard)/inventory/dossiers/page.js", "/lord/(dashboard)/kitchen/page": "app/lord/(dashboard)/kitchen/page.js", "/lord/(dashboard)/launch/page": "app/lord/(dashboard)/launch/page.js", "/lord/(dashboard)/leads/page": "app/lord/(dashboard)/leads/page.js", "/lord/(dashboard)/marketing/ab-testing/page": "app/lord/(dashboard)/marketing/ab-testing/page.js", "/lord/(dashboard)/market/page": "app/lord/(dashboard)/market/page.js", "/lord/(dashboard)/marketing/ai-agency/page": "app/lord/(dashboard)/marketing/ai-agency/page.js", "/lord/(dashboard)/marketing/audiences/page": "app/lord/(dashboard)/marketing/audiences/page.js", "/lord/(dashboard)/marketing/abandoned/page": "app/lord/(dashboard)/marketing/abandoned/page.js", "/lord/(dashboard)/marketing/automation/page": "app/lord/(dashboard)/marketing/automation/page.js", "/lord/(dashboard)/marketing/create/page": "app/lord/(dashboard)/marketing/create/page.js", "/lord/(dashboard)/marketing/list/page": "app/lord/(dashboard)/marketing/list/page.js", "/lord/(dashboard)/marketing/experiments/page": "app/lord/(dashboard)/marketing/experiments/page.js", "/lord/(dashboard)/marketing/page": "app/lord/(dashboard)/marketing/page.js", "/lord/(dashboard)/marketing/stories/page": "app/lord/(dashboard)/marketing/stories/page.js", "/lord/(dashboard)/media/page": "app/lord/(dashboard)/media/page.js", "/lord/(dashboard)/merchants/[id]/page": "app/lord/(dashboard)/merchants/[id]/page.js", "/lord/(dashboard)/merchants/page": "app/lord/(dashboard)/merchants/page.js", "/lord/(dashboard)/messages/page": "app/lord/(dashboard)/messages/page.js", "/lord/(dashboard)/operations/hubs/page": "app/lord/(dashboard)/operations/hubs/page.js", "/lord/(dashboard)/munchies/page": "app/lord/(dashboard)/munchies/page.js", "/lord/(dashboard)/operations/page": "app/lord/(dashboard)/operations/page.js", "/lord/(dashboard)/operations/suppliers/page": "app/lord/(dashboard)/operations/suppliers/page.js", "/lord/(dashboard)/operations/sourcing/page": "app/lord/(dashboard)/operations/sourcing/page.js", "/lord/(dashboard)/operations/tasks/page": "app/lord/(dashboard)/operations/tasks/page.js", "/lord/(dashboard)/operations/vendors/page": "app/lord/(dashboard)/operations/vendors/page.js", "/lord/(dashboard)/orders/page": "app/lord/(dashboard)/orders/page.js", "/lord/(dashboard)/payouts/page": "app/lord/(dashboard)/payouts/page.js", "/lord/(dashboard)/page": "app/lord/(dashboard)/page.js", "/lord/(dashboard)/pulse/page": "app/lord/(dashboard)/pulse/page.js", "/lord/(dashboard)/reports/page": "app/lord/(dashboard)/reports/page.js", "/lord/(dashboard)/ratings/page": "app/lord/(dashboard)/ratings/page.js", "/lord/(dashboard)/reviews/page": "app/lord/(dashboard)/reviews/page.js", "/lord/(dashboard)/riders/[id]/page": "app/lord/(dashboard)/riders/[id]/page.js", "/lord/(dashboard)/riders/page": "app/lord/(dashboard)/riders/page.js", "/lord/(dashboard)/spin-campaign/page": "app/lord/(dashboard)/spin-campaign/page.js", "/lord/(dashboard)/security/page": "app/lord/(dashboard)/security/page.js", "/lord/(dashboard)/souvenirs/page": "app/lord/(dashboard)/souvenirs/page.js", "/lord/(dashboard)/settings/page": "app/lord/(dashboard)/settings/page.js", "/lord/(dashboard)/staff/[id]/page": "app/lord/(dashboard)/staff/[id]/page.js", "/lord/(dashboard)/subscribers/page": "app/lord/(dashboard)/subscribers/page.js", "/lord/(dashboard)/staff/page": "app/lord/(dashboard)/staff/page.js", "/lord/(dashboard)/support/page": "app/lord/(dashboard)/support/page.js", "/lord/(dashboard)/support/view/page": "app/lord/(dashboard)/support/view/page.js", "/lord/(dashboard)/support/vip-relay/page": "app/lord/(dashboard)/support/vip-relay/page.js", "/lord/(dashboard)/traceability/page": "app/lord/(dashboard)/traceability/page.js", "/lord/(dashboard)/upload/page": "app/lord/(dashboard)/upload/page.js", "/lord/(dashboard)/vault/page": "app/lord/(dashboard)/vault/page.js", "/lord/(dashboard)/vendor-onboarding/page": "app/lord/(dashboard)/vendor-onboarding/page.js", "/lord/(dashboard)/waitlist/invitations/page": "app/lord/(dashboard)/waitlist/invitations/page.js", "/lord/(dashboard)/warranty/page": "app/lord/(dashboard)/warranty/page.js", "/lord/(dashboard)/waitlist/page": "app/lord/(dashboard)/waitlist/page.js", "/merchant/dashboard/page": "app/merchant/dashboard/page.js", "/merchant/portal/login/page": "app/merchant/portal/login/page.js", "/merchant/portal/register/page": "app/merchant/portal/register/page.js", "/merchant/register/page": "app/merchant/register/page.js", "/admin/(dashboard)/ticketing/live/page": "app/admin/(dashboard)/ticketing/live/page.js", "/admin/(dashboard)/ticketing/sales/page": "app/admin/(dashboard)/ticketing/sales/page.js", "/admin/(dashboard)/ticketing/page": "app/admin/(dashboard)/ticketing/page.js", "/admin/(dashboard)/ticketing/security/page": "app/admin/(dashboard)/ticketing/security/page.js", "/admin/(dashboard)/ticketing/staff/page": "app/admin/(dashboard)/ticketing/staff/page.js", "/lord/(dashboard)/ticketing/insights/page": "app/lord/(dashboard)/ticketing/insights/page.js", "/lord/(dashboard)/ticketing/sales/page": "app/lord/(dashboard)/ticketing/sales/page.js", "/lord/(dashboard)/ticketing/page": "app/lord/(dashboard)/ticketing/page.js", "/lord/(dashboard)/ticketing/live/page": "app/lord/(dashboard)/ticketing/live/page.js", "/lord/(dashboard)/ticketing/security/page": "app/lord/(dashboard)/ticketing/security/page.js", "/lord/(dashboard)/ticketing/staff/page": "app/lord/(dashboard)/ticketing/staff/page.js", "/lord/(dashboard)/ticketing/transfers/page": "app/lord/(dashboard)/ticketing/transfers/page.js", "/admin/(dashboard)/ticketing/email-preview/page": "app/admin/(dashboard)/ticketing/email-preview/page.js", "/lord/(dashboard)/ticketing/email-preview/page": "app/lord/(dashboard)/ticketing/email-preview/page.js" };
var AppPathRoutesManifest = { "/_not-found/page": "/_not-found", "/api/admin/broadcast/route": "/api/admin/broadcast", "/api/admin/generate-description/route": "/api/admin/generate-description", "/api/admin/intelligence/pulse/route": "/api/admin/intelligence/pulse", "/api/admin/integrations/verify/route": "/api/admin/integrations/verify", "/api/admin/logout/route": "/api/admin/logout", "/api/admin/notify-admin/route": "/api/admin/notify-admin", "/api/admin/notify-customer/route": "/api/admin/notify-customer", "/api/admin/payout-worker/route": "/api/admin/payout-worker", "/api/admin/products/autofill/route": "/api/admin/products/autofill", "/api/admin/pulse/route": "/api/admin/pulse", "/api/admin/recover-carts/route": "/api/admin/recover-carts", "/api/admin/social/publish/route": "/api/admin/social/publish", "/api/admin/vendor-pricing/route": "/api/admin/vendor-pricing", "/api/dispatch/calculate/route": "/api/dispatch/calculate", "/api/health/route": "/api/health", "/api/location/resolve/route": "/api/location/resolve", "/api/marketing/unsubscribe/route": "/api/marketing/unsubscribe", "/api/mobile/widget-config/route": "/api/mobile/widget-config", "/api/newsletter/subscribe/route": "/api/newsletter/subscribe", "/api/paystack/webhook/route": "/api/paystack/webhook", "/api/rider/auth/verify/route": "/api/rider/auth/verify", "/api/rider/auth/otp/route": "/api/rider/auth/otp", "/api/support/ai-concierge/route": "/api/support/ai-concierge", "/api/webhooks/whatsapp/route": "/api/webhooks/whatsapp", "/auth/callback/route": "/auth/callback", "/api/admin/ai/verify/route": "/api/admin/ai/verify", "/api/admin/affiliate-payouts/route": "/api/admin/affiliate-payouts", "/api/admin/analytics/dashboard/route": "/api/admin/analytics/dashboard", "/api/admin/affiliates/route": "/api/admin/affiliates", "/api/admin/analytics/heatmap/route": "/api/admin/analytics/heatmap", "/api/admin/ask-ob/route": "/api/admin/ask-ob", "/api/admin/autopilot-rules/route": "/api/admin/autopilot-rules", "/api/admin/audit-logs/route": "/api/admin/audit-logs", "/api/admin/behavior-metrics/route": "/api/admin/behavior-metrics", "/api/admin/behavior/sessions/route": "/api/admin/behavior/sessions", "/api/admin/bites/route": "/api/admin/bites", "/api/admin/customer-location-map/route": "/api/admin/customer-location-map", "/api/admin/concierge/route": "/api/admin/concierge", "/api/admin/connection-health/route": "/api/admin/connection-health", "/api/admin/customer-intelligence/route": "/api/admin/customer-intelligence", "/api/admin/behavior/live/route": "/api/admin/behavior/live", "/api/admin/customer-messaging/test/route": "/api/admin/customer-messaging/test", "/api/admin/customer-messaging/route": "/api/admin/customer-messaging", "/api/admin/customers/route": "/api/admin/customers", "/api/admin/customers/[phone]/loyalty/route": "/api/admin/customers/[phone]/loyalty", "/api/admin/dashboard-data/route": "/api/admin/dashboard-data", "/api/admin/delivery/route": "/api/admin/delivery", "/api/admin/delivery/route/route": "/api/admin/delivery/route", "/api/admin/customers/[phone]/crm/route": "/api/admin/customers/[phone]/crm", "/api/admin/delivery-areas/route": "/api/admin/delivery-areas", "/api/admin/demand-intelligence/route": "/api/admin/demand-intelligence", "/api/admin/customers/[phone]/profile/route": "/api/admin/customers/[phone]/profile", "/api/admin/delivery/vendor-scorecard/route": "/api/admin/delivery/vendor-scorecard", "/api/admin/engraving-jobs/[id]/svg/route": "/api/admin/engraving-jobs/[id]/svg", "/api/admin/dispatch/riders/route": "/api/admin/dispatch/riders", "/api/admin/finance-data/route": "/api/admin/finance-data", "/api/admin/email-center/route": "/api/admin/email-center", "/api/admin/food-addons/route": "/api/admin/food-addons", "/api/admin/engraving-jobs/route": "/api/admin/engraving-jobs", "/api/admin/food-image/route": "/api/admin/food-image", "/api/admin/governance/route": "/api/admin/governance", "/api/admin/instagram/callback/route": "/api/admin/instagram/callback", "/api/admin/instagram/disconnect/route": "/api/admin/instagram/disconnect", "/api/admin/instagram/connect/route": "/api/admin/instagram/connect", "/api/admin/gamification/route": "/api/admin/gamification", "/api/admin/halloween-intelligence/route": "/api/admin/halloween-intelligence", "/api/admin/integrations/daraja/route": "/api/admin/integrations/daraja", "/api/admin/instagram/status/route": "/api/admin/instagram/status", "/api/admin/intelligence/stalled-riders/route": "/api/admin/intelligence/stalled-riders", "/api/admin/intelligence/funnel/route": "/api/admin/intelligence/funnel", "/api/admin/intelligence/commander-brief/route": "/api/admin/intelligence/commander-brief", "/api/admin/launch-ops/route": "/api/admin/launch-ops", "/api/admin/kitchen/orders/route": "/api/admin/kitchen/orders", "/api/admin/launch-readiness/route": "/api/admin/launch-readiness", "/api/admin/leads/route": "/api/admin/leads", "/api/admin/loyalty/order/route": "/api/admin/loyalty/order", "/api/admin/market/applications/route": "/api/admin/market/applications", "/api/admin/dispatch/route": "/api/admin/dispatch", "/api/admin/market/campaign/route": "/api/admin/market/campaign", "/api/admin/market/merchants/route": "/api/admin/market/merchants", "/api/admin/market/orders/route": "/api/admin/market/orders", "/api/admin/market/offers/route": "/api/admin/market/offers", "/api/admin/market/products/route": "/api/admin/market/products", "/api/admin/login/route": "/api/admin/login", "/api/admin/market/reports/route": "/api/admin/market/reports", "/api/admin/merchant-catalog-prices/route": "/api/admin/merchant-catalog-prices", "/api/admin/merchant-document-requirements/route": "/api/admin/merchant-document-requirements", "/api/admin/messages/route": "/api/admin/messages", "/api/admin/merchant-onboarding-controls/route": "/api/admin/merchant-onboarding-controls", "/api/admin/merchant-applications/route": "/api/admin/merchant-applications", "/api/admin/newsletter-subscribers/route": "/api/admin/newsletter-subscribers", "/api/admin/operating-brain/route": "/api/admin/operating-brain", "/api/admin/mobile-widgets/route": "/api/admin/mobile-widgets", "/api/admin/merchant-store/[id]/route": "/api/admin/merchant-store/[id]", "/api/admin/operations/tasks/route": "/api/admin/operations/tasks", "/api/admin/popups/route": "/api/admin/popups", "/api/admin/product-image/route": "/api/admin/product-image", "/api/admin/public-launch-gate/route": "/api/admin/public-launch-gate", "/api/admin/security-logs/route": "/api/admin/security-logs", "/api/admin/riders/[id]/route": "/api/admin/riders/[id]", "/api/admin/orders/route": "/api/admin/orders", "/api/admin/operations/flow/route": "/api/admin/operations/flow", "/api/admin/settings/route": "/api/admin/settings", "/api/admin/products/route": "/api/admin/products", "/api/admin/support-view/customer-session/route": "/api/admin/support-view/customer-session", "/api/admin/ticketing/email-preview/route": "/api/admin/ticketing/email-preview", "/api/admin/system-lockdown/route": "/api/admin/system-lockdown", "/api/admin/spin-campaign/route": "/api/admin/spin-campaign", "/api/admin/staff/route": "/api/admin/staff", "/api/admin/ticketing/insights/route": "/api/admin/ticketing/insights", "/api/admin/system-pulse/route": "/api/admin/system-pulse", "/api/admin/ticketing/email-settings/route": "/api/admin/ticketing/email-settings", "/api/admin/ticketing/live/route": "/api/admin/ticketing/live", "/api/admin/support-view/route": "/api/admin/support-view", "/api/admin/ticketing/mfa/route": "/api/admin/ticketing/mfa", "/api/admin/ticketing/sales/route": "/api/admin/ticketing/sales", "/api/admin/ticketing/promotions/route": "/api/admin/ticketing/promotions", "/api/admin/ticketing/transfers/access/route": "/api/admin/ticketing/transfers/access", "/api/admin/ticketing/sales/email-preview/route": "/api/admin/ticketing/sales/email-preview", "/api/admin/ticketing/security/route": "/api/admin/ticketing/security", "/api/admin/ticketing/staff/route": "/api/admin/ticketing/staff", "/api/admin/ticketing/route": "/api/admin/ticketing", "/api/admin/ticketing/transfers/route": "/api/admin/ticketing/transfers", "/api/admin/vendor-onboarding/route": "/api/admin/vendor-onboarding", "/api/admin/waitlist-fit-studio/route": "/api/admin/waitlist-fit-studio", "/api/affiliate/invitations/route": "/api/affiliate/invitations", "/api/affiliate/invitations/accept/route": "/api/affiliate/invitations/accept", "/api/affiliate/route": "/api/affiliate", "/api/affiliate/payouts/route": "/api/affiliate/payouts", "/api/analytics/track/route": "/api/analytics/track", "/api/catalog/products/route": "/api/catalog/products", "/api/checkout/marketing-consent/route": "/api/checkout/marketing-consent", "/api/admin/traceability/route": "/api/admin/traceability", "/api/admin/waitlist-site/route": "/api/admin/waitlist-site", "/api/app-install/access/route": "/api/app-install/access", "/api/customer/abandoned-cart/route": "/api/customer/abandoned-cart", "/api/admin/waitlist/route": "/api/admin/waitlist", "/api/customer-announcements/route": "/api/customer-announcements", "/api/concierge/route": "/api/concierge", "/api/customer/location-share/route": "/api/customer/location-share", "/api/customer/notification-preferences/route": "/api/customer/notification-preferences", "/api/customer/order-complaints/route": "/api/customer/order-complaints", "/api/buzz/discovery/route": "/api/buzz/discovery", "/api/buzz/[id]/route": "/api/buzz/[id]", "/api/checkout/orders/route": "/api/checkout/orders", "/api/internal/merchant-alerts/dispatch/route": "/api/internal/merchant-alerts/dispatch", "/api/location/catalog/route": "/api/location/catalog", "/api/delivery/track/route": "/api/delivery/track", "/api/loyalty/config/route": "/api/loyalty/config", "/api/market/catalog/route": "/api/market/catalog", "/api/market/merchant-catalog/route": "/api/market/merchant-catalog", "/api/market/merchant-application/route": "/api/market/merchant-application", "/api/market/merchant-products/route": "/api/market/merchant-products", "/api/market/merchant-offers/route": "/api/market/merchant-offers", "/api/location/route": "/api/location", "/api/market/offers/route": "/api/market/offers", "/api/market/merchant-stock-offers/route": "/api/market/merchant-stock-offers", "/api/member/achievement/route": "/api/member/achievement", "/api/member/gamification/route": "/api/member/gamification", "/api/member/loyalty/route": "/api/member/loyalty", "/api/member/reward-review/route": "/api/member/reward-review", "/api/member/referrals/route": "/api/member/referrals", "/api/merchant-applications/onboarding-events/route": "/api/merchant-applications/onboarding-events", "/api/merchant-applications/documents/route": "/api/merchant-applications/documents", "/api/merchant-onboarding-invite/route": "/api/merchant-onboarding-invite", "/api/merchant-onboarding-draft/route": "/api/merchant-onboarding-draft", "/api/merchant/food-orders/route": "/api/merchant/food-orders", "/api/merchant/preferences/route": "/api/merchant/preferences", "/api/merchant/business/branches/route": "/api/merchant/business/branches", "/api/merchant/alerts/route": "/api/merchant/alerts", "/api/merchant/riders/route": "/api/merchant/riders", "/api/merchant/scorecard/route": "/api/merchant/scorecard", "/api/orders/status/route": "/api/orders/status", "/api/merchant-applications/route": "/api/merchant-applications", "/api/mpesa/rider-delivery-callback/[token]/route": "/api/mpesa/rider-delivery-callback/[token]", "/api/merchant/network/route": "/api/merchant/network", "/api/mpesa/orders/webhook/[token]/route": "/api/mpesa/orders/webhook/[token]", "/api/profile/checkout-details/route": "/api/profile/checkout-details", "/api/paystack/verify-order/route": "/api/paystack/verify-order", "/api/public-launch-gate/route": "/api/public-launch-gate", "/api/push/config/route": "/api/push/config", "/api/profile/workspaces/route": "/api/profile/workspaces", "/api/ready/route": "/api/ready", "/api/payhero/orders/webhook/route": "/api/payhero/orders/webhook", "/api/payhero/ticketing/webhook/route": "/api/payhero/ticketing/webhook", "/api/push/test/route": "/api/push/test", "/api/push/subscriptions/route": "/api/push/subscriptions", "/api/rider/alerts/route": "/api/rider/alerts", "/api/reviews/route": "/api/reviews", "/api/rider/delivery-issue/route": "/api/rider/delivery-issue", "/api/rider/delivery-status/route": "/api/rider/delivery-status", "/api/rider/handover/route": "/api/rider/handover", "/api/rider/arriving/route": "/api/rider/arriving", "/api/rider/merchant-invites/route": "/api/rider/merchant-invites", "/api/rider/delivery-payment/route": "/api/rider/delivery-payment", "/api/rider/onboarding/progress/route": "/api/rider/onboarding/progress", "/api/rider/missions/route": "/api/rider/missions", "/api/rider/offers/respond/route": "/api/rider/offers/respond", "/api/rider/pickup-arrived/route": "/api/rider/pickup-arrived", "/api/rider/pin/route": "/api/rider/pin", "/api/rider/preferences/route": "/api/rider/preferences", "/api/rider/onboarding/verification/route": "/api/rider/onboarding/verification", "/api/settings/route": "/api/settings", "/api/rider/session/route": "/api/rider/session", "/api/rider/session/account/route": "/api/rider/session/account", "/api/rider/status/route": "/api/rider/status", "/api/rider/sync-location/route": "/api/rider/sync-location", "/api/rider/profile/route": "/api/rider/profile", "/api/support/messages/route": "/api/support/messages", "/api/support/contact/route": "/api/support/contact", "/api/spin-campaign/route": "/api/spin-campaign", "/api/ticketing/email/route": "/api/ticketing/email", "/api/ticketing/message/route": "/api/ticketing/message", "/api/ticketing/theme/route": "/api/ticketing/theme", "/api/ticketing/checkout/route": "/api/ticketing/checkout", "/api/ticketing/promotions/validate/route": "/api/ticketing/promotions/validate", "/api/ticketing/wallet/route": "/api/ticketing/wallet", "/api/webhooks/twilio/merchant-alert/confirm/route": "/api/webhooks/twilio/merchant-alert/confirm", "/api/webhooks/jmsurf-mail/route": "/api/webhooks/jmsurf-mail", "/api/webhooks/twilio/merchant-alert/voice/route": "/api/webhooks/twilio/merchant-alert/voice", "/api/webhooks/twilio/merchant-alert/status/route": "/api/webhooks/twilio/merchant-alert/status", "/api/ticketing/scanner/route": "/api/ticketing/scanner", "/google_merchant.xml/route": "/google_merchant.xml", "/sitemap.xml/route": "/sitemap.xml", "/about/page": "/about", "/accessibility/page": "/accessibility", "/beverages/page": "/beverages", "/bites/page": "/bites", "/blog/[slug]/page": "/blog/[slug]", "/blog/category/knowledge-base/page": "/blog/category/knowledge-base", "/blog/page": "/blog", "/buzz/[slug]/page": "/buzz/[slug]", "/build-my-night/page": "/build-my-night", "/buzz/page": "/buzz", "/cart/page": "/cart", "/checkout/page": "/checkout", "/checkout/success/page": "/checkout/success", "/cookies/page": "/cookies", "/corporate/page": "/corporate", "/dispatch/[id]/page": "/dispatch/[id]", "/extras/page": "/extras", "/gifting/page": "/gifting", "/halloween/page": "/halloween", "/onboarding/page": "/onboarding", "/newsletter/unsubscribe/page": "/newsletter/unsubscribe", "/returns/page": "/returns", "/rewards/page": "/rewards", "/profile/page": "/profile", "/rider/dashboard/page": "/rider/dashboard", "/rider/login/page": "/rider/login", "/rider/onboarding/page": "/rider/onboarding", "/scanner/page": "/scanner", "/shipping/page": "/shipping", "/shop/category/[slug]/page": "/shop/category/[slug]", "/profile/crews/page": "/profile/crews", "/shop/[id]/page": "/shop/[id]", "/shop/snacks/page": "/shop/snacks", "/shop/page": "/shop", "/souvenirs/page": "/souvenirs", "/spin/page": "/spin", "/privacy/page": "/privacy", "/terms/page": "/terms", "/product/[productId]/page": "/product/[productId]", "/track/page": "/track", "/verify/[id]/page": "/verify/[id]", "/venue/[id]/page": "/venue/[id]", "/venue/dashboard/page": "/venue/dashboard", "/warranty/page": "/warranty", "/wishlist/page": "/wishlist", "/auth/page": "/auth", "/build-the-night/page": "/build-the-night", "/launch-countdown/page": "/launch-countdown", "/concierge/page": "/concierge", "/page": "/", "/rider/page": "/rider", "/guides/how-much-alcohol-for-a-party/page": "/guides/how-much-alcohol-for-a-party", "/delivery/page": "/delivery", "/vendor/page": "/vendor", "/merchant/business/page": "/merchant/business", "/merchant/documents/page": "/merchant/documents", "/merchant/halloween/page": "/merchant/halloween", "/merchant/liquor-onboarding/page": "/merchant/liquor-onboarding", "/merchant/onboarding/page": "/merchant/onboarding", "/merchant/network/page": "/merchant/network", "/affiliate/dashboard/page": "/affiliate/dashboard", "/affiliate/page": "/affiliate", "/affiliate/register/page": "/affiliate/register", "/affiliate/agreement/page": "/affiliate/agreement", "/admin/login/page": "/admin/login", "/lord/login/page": "/lord/login", "/contact/page": "/contact", "/card-games/page": "/card-games", "/market/category/[slug]/page": "/market/category/[slug]", "/market/page": "/market", "/market/product/[slug]/page": "/market/product/[slug]", "/market/store/[slug]/page": "/market/store/[slug]", "/supplier/dashboard/page": "/supplier/dashboard", "/supplier/page": "/supplier", "/supplier/inventory/page": "/supplier/inventory", "/supplier/propose/page": "/supplier/propose", "/supplier/settlements/page": "/supplier/settlements", "/tickets/confirmation/page": "/tickets/confirmation", "/tickets/[slug]/page": "/tickets/[slug]", "/tickets/page": "/tickets", "/admin/(dashboard)/abandoned/page": "/admin/abandoned", "/admin/(dashboard)/affiliates/page": "/admin/affiliates", "/admin/(dashboard)/analytics/images/page": "/admin/analytics/images", "/admin/(dashboard)/analytics/page": "/admin/analytics", "/admin/(dashboard)/analytics/intelligence/page": "/admin/analytics/intelligence", "/admin/(dashboard)/audit/page": "/admin/audit", "/admin/(dashboard)/behavior/funnels/page": "/admin/behavior/funnels", "/admin/(dashboard)/behavior/live/page": "/admin/behavior/live", "/admin/(dashboard)/behavior/page": "/admin/behavior", "/admin/(dashboard)/behavior/radar/page": "/admin/behavior/radar", "/admin/(dashboard)/behavior/sessions/page": "/admin/behavior/sessions", "/admin/(dashboard)/bites/page": "/admin/bites", "/admin/(dashboard)/blog/page": "/admin/blog", "/admin/(dashboard)/broadcast/page": "/admin/broadcast", "/admin/(dashboard)/buzz/command/page": "/admin/buzz/command", "/admin/(dashboard)/buzz/page": "/admin/buzz", "/admin/(dashboard)/communications/command/page": "/admin/communications/command", "/admin/(dashboard)/communications/automation/page": "/admin/communications/automation", "/admin/(dashboard)/communications/email/page": "/admin/communications/email", "/admin/(dashboard)/communications/popups/page": "/admin/communications/popups", "/admin/(dashboard)/communications/sms/page": "/admin/communications/sms", "/admin/(dashboard)/communications/whatsapp/page": "/admin/communications/whatsapp", "/admin/(dashboard)/content/page": "/admin/content", "/admin/(dashboard)/coupons/page": "/admin/coupons", "/admin/(dashboard)/customer-intelligence/page": "/admin/customer-intelligence", "/admin/(dashboard)/customers/[phone]/360/page": "/admin/customers/[phone]/360", "/admin/(dashboard)/customers/[phone]/page": "/admin/customers/[phone]", "/admin/(dashboard)/customers/page": "/admin/customers", "/admin/(dashboard)/delivery/page": "/admin/delivery", "/admin/(dashboard)/demand/page": "/admin/demand", "/admin/(dashboard)/dispatch/page": "/admin/dispatch", "/admin/(dashboard)/experience/mobile-widgets/page": "/admin/experience/mobile-widgets", "/admin/(dashboard)/experience/widgets/page": "/admin/experience/widgets", "/admin/(dashboard)/finance/page": "/admin/finance", "/admin/(dashboard)/forge/[id]/page": "/admin/forge/[id]", "/admin/(dashboard)/forge/page": "/admin/forge", "/admin/(dashboard)/gamification/page": "/admin/gamification", "/admin/(dashboard)/growth/accounts/page": "/admin/growth/accounts", "/admin/(dashboard)/growth/autopilot/page": "/admin/growth/autopilot", "/admin/(dashboard)/growth/calendar/page": "/admin/growth/calendar", "/admin/(dashboard)/growth/camera/page": "/admin/growth/camera", "/admin/(dashboard)/growth/content/page": "/admin/growth/content", "/admin/(dashboard)/halloween-intelligence/page": "/admin/halloween-intelligence", "/admin/(dashboard)/inventory/beverages/page": "/admin/inventory/beverages", "/admin/(dashboard)/inventory/dossiers/edit/[id]/page": "/admin/inventory/dossiers/edit/[id]", "/admin/(dashboard)/inventory/dossiers/page": "/admin/inventory/dossiers", "/admin/(dashboard)/kitchen/page": "/admin/kitchen", "/admin/(dashboard)/launch/page": "/admin/launch", "/admin/(dashboard)/market/page": "/admin/market", "/admin/(dashboard)/marketing/ab-testing/page": "/admin/marketing/ab-testing", "/admin/(dashboard)/marketing/abandoned/page": "/admin/marketing/abandoned", "/admin/(dashboard)/marketing/ai-agency/page": "/admin/marketing/ai-agency", "/admin/(dashboard)/marketing/audiences/page": "/admin/marketing/audiences", "/admin/(dashboard)/marketing/automation/page": "/admin/marketing/automation", "/admin/(dashboard)/marketing/create/page": "/admin/marketing/create", "/admin/(dashboard)/marketing/experiments/page": "/admin/marketing/experiments", "/admin/(dashboard)/marketing/list/page": "/admin/marketing/list", "/admin/(dashboard)/marketing/page": "/admin/marketing", "/admin/(dashboard)/marketing/stories/page": "/admin/marketing/stories", "/admin/(dashboard)/media/page": "/admin/media", "/admin/(dashboard)/merchants/[id]/page": "/admin/merchants/[id]", "/admin/(dashboard)/merchants/page": "/admin/merchants", "/admin/(dashboard)/messages/page": "/admin/messages", "/admin/(dashboard)/munchies/page": "/admin/munchies", "/admin/(dashboard)/operations/hubs/page": "/admin/operations/hubs", "/admin/(dashboard)/operations/page": "/admin/operations", "/admin/(dashboard)/operations/sourcing/page": "/admin/operations/sourcing", "/admin/(dashboard)/operations/suppliers/page": "/admin/operations/suppliers", "/admin/(dashboard)/operations/tasks/page": "/admin/operations/tasks", "/admin/(dashboard)/operations/vendors/page": "/admin/operations/vendors", "/admin/(dashboard)/orders/page": "/admin/orders", "/admin/(dashboard)/page": "/admin", "/admin/(dashboard)/payouts/page": "/admin/payouts", "/admin/(dashboard)/pulse/page": "/admin/pulse", "/admin/(dashboard)/ratings/page": "/admin/ratings", "/admin/(dashboard)/reports/page": "/admin/reports", "/admin/(dashboard)/reviews/page": "/admin/reviews", "/admin/(dashboard)/riders/[id]/page": "/admin/riders/[id]", "/admin/(dashboard)/security/page": "/admin/security", "/admin/(dashboard)/spin-campaign/page": "/admin/spin-campaign", "/admin/(dashboard)/souvenirs/page": "/admin/souvenirs", "/admin/(dashboard)/settings/page": "/admin/settings", "/admin/(dashboard)/staff/[id]/page": "/admin/staff/[id]", "/admin/(dashboard)/staff/page": "/admin/staff", "/admin/(dashboard)/subscribers/page": "/admin/subscribers", "/admin/(dashboard)/support/page": "/admin/support", "/admin/(dashboard)/support/vip-relay/page": "/admin/support/vip-relay", "/admin/(dashboard)/traceability/page": "/admin/traceability", "/admin/(dashboard)/upload/page": "/admin/upload", "/admin/(dashboard)/vault/page": "/admin/vault", "/admin/(dashboard)/waitlist/invitations/page": "/admin/waitlist/invitations", "/admin/(dashboard)/warranty/page": "/admin/warranty", "/admin/(dashboard)/waitlist/page": "/admin/waitlist", "/lord/(dashboard)/abandoned/page": "/lord/abandoned", "/lord/(dashboard)/affiliates/page": "/lord/affiliates", "/lord/(dashboard)/analytics/images/page": "/lord/analytics/images", "/lord/(dashboard)/analytics/intelligence/page": "/lord/analytics/intelligence", "/lord/(dashboard)/analytics/page": "/lord/analytics", "/lord/(dashboard)/behavior/funnels/page": "/lord/behavior/funnels", "/lord/(dashboard)/audit/page": "/lord/audit", "/lord/(dashboard)/behavior/live/page": "/lord/behavior/live", "/lord/(dashboard)/behavior/page": "/lord/behavior", "/lord/(dashboard)/behavior/radar/page": "/lord/behavior/radar", "/lord/(dashboard)/behavior/sessions/page": "/lord/behavior/sessions", "/lord/(dashboard)/bites/page": "/lord/bites", "/lord/(dashboard)/blog/page": "/lord/blog", "/lord/(dashboard)/broadcast/page": "/lord/broadcast", "/lord/(dashboard)/buzz/campaigns/page": "/lord/buzz/campaigns", "/lord/(dashboard)/buzz/command/page": "/lord/buzz/command", "/lord/(dashboard)/buzz/create/page": "/lord/buzz/create", "/lord/(dashboard)/buzz/page": "/lord/buzz", "/lord/(dashboard)/communications/automation/page": "/lord/communications/automation", "/lord/(dashboard)/communications/command/page": "/lord/communications/command", "/lord/(dashboard)/communications/email/page": "/lord/communications/email", "/lord/(dashboard)/communications/popups/page": "/lord/communications/popups", "/lord/(dashboard)/communications/sms/page": "/lord/communications/sms", "/lord/(dashboard)/communications/whatsapp/page": "/lord/communications/whatsapp", "/lord/(dashboard)/concierge-trainer/page": "/lord/concierge-trainer", "/lord/(dashboard)/content/page": "/lord/content", "/lord/(dashboard)/coupons/page": "/lord/coupons", "/lord/(dashboard)/customer-intelligence/page": "/lord/customer-intelligence", "/lord/(dashboard)/customers/[phone]/360/page": "/lord/customers/[phone]/360", "/lord/(dashboard)/customers/[phone]/page": "/lord/customers/[phone]", "/lord/(dashboard)/customers/page": "/lord/customers", "/lord/(dashboard)/delivery-zones/page": "/lord/delivery-zones", "/lord/(dashboard)/delivery/page": "/lord/delivery", "/lord/(dashboard)/delivery/scorecard/page": "/lord/delivery/scorecard", "/lord/(dashboard)/demand/page": "/lord/demand", "/lord/(dashboard)/dispatch/page": "/lord/dispatch", "/lord/(dashboard)/engraving-production/page": "/lord/engraving-production", "/lord/(dashboard)/experience/mobile-widgets/page": "/lord/experience/mobile-widgets", "/lord/(dashboard)/experience/widgets/page": "/lord/experience/widgets", "/lord/(dashboard)/finance/page": "/lord/finance", "/lord/(dashboard)/forge/[id]/page": "/lord/forge/[id]", "/lord/(dashboard)/forge/page": "/lord/forge", "/lord/(dashboard)/gamification/page": "/lord/gamification", "/lord/(dashboard)/growth/accounts/page": "/lord/growth/accounts", "/lord/(dashboard)/growth/autopilot/page": "/lord/growth/autopilot", "/lord/(dashboard)/growth/calendar/page": "/lord/growth/calendar", "/lord/(dashboard)/growth/camera/page": "/lord/growth/camera", "/lord/(dashboard)/growth/content/page": "/lord/growth/content", "/lord/(dashboard)/halloween-intelligence/page": "/lord/halloween-intelligence", "/lord/(dashboard)/inventory/beverages/page": "/lord/inventory/beverages", "/lord/(dashboard)/inventory/dossiers/edit/[id]/page": "/lord/inventory/dossiers/edit/[id]", "/lord/(dashboard)/inventory/dossiers/page": "/lord/inventory/dossiers", "/lord/(dashboard)/kitchen/page": "/lord/kitchen", "/lord/(dashboard)/launch/page": "/lord/launch", "/lord/(dashboard)/leads/page": "/lord/leads", "/lord/(dashboard)/marketing/ab-testing/page": "/lord/marketing/ab-testing", "/lord/(dashboard)/market/page": "/lord/market", "/lord/(dashboard)/marketing/ai-agency/page": "/lord/marketing/ai-agency", "/lord/(dashboard)/marketing/audiences/page": "/lord/marketing/audiences", "/lord/(dashboard)/marketing/abandoned/page": "/lord/marketing/abandoned", "/lord/(dashboard)/marketing/automation/page": "/lord/marketing/automation", "/lord/(dashboard)/marketing/create/page": "/lord/marketing/create", "/lord/(dashboard)/marketing/list/page": "/lord/marketing/list", "/lord/(dashboard)/marketing/experiments/page": "/lord/marketing/experiments", "/lord/(dashboard)/marketing/page": "/lord/marketing", "/lord/(dashboard)/marketing/stories/page": "/lord/marketing/stories", "/lord/(dashboard)/media/page": "/lord/media", "/lord/(dashboard)/merchants/[id]/page": "/lord/merchants/[id]", "/lord/(dashboard)/merchants/page": "/lord/merchants", "/lord/(dashboard)/messages/page": "/lord/messages", "/lord/(dashboard)/operations/hubs/page": "/lord/operations/hubs", "/lord/(dashboard)/munchies/page": "/lord/munchies", "/lord/(dashboard)/operations/page": "/lord/operations", "/lord/(dashboard)/operations/suppliers/page": "/lord/operations/suppliers", "/lord/(dashboard)/operations/sourcing/page": "/lord/operations/sourcing", "/lord/(dashboard)/operations/tasks/page": "/lord/operations/tasks", "/lord/(dashboard)/operations/vendors/page": "/lord/operations/vendors", "/lord/(dashboard)/orders/page": "/lord/orders", "/lord/(dashboard)/payouts/page": "/lord/payouts", "/lord/(dashboard)/page": "/lord", "/lord/(dashboard)/pulse/page": "/lord/pulse", "/lord/(dashboard)/reports/page": "/lord/reports", "/lord/(dashboard)/ratings/page": "/lord/ratings", "/lord/(dashboard)/reviews/page": "/lord/reviews", "/lord/(dashboard)/riders/[id]/page": "/lord/riders/[id]", "/lord/(dashboard)/riders/page": "/lord/riders", "/lord/(dashboard)/spin-campaign/page": "/lord/spin-campaign", "/lord/(dashboard)/security/page": "/lord/security", "/lord/(dashboard)/souvenirs/page": "/lord/souvenirs", "/lord/(dashboard)/settings/page": "/lord/settings", "/lord/(dashboard)/staff/[id]/page": "/lord/staff/[id]", "/lord/(dashboard)/subscribers/page": "/lord/subscribers", "/lord/(dashboard)/staff/page": "/lord/staff", "/lord/(dashboard)/support/page": "/lord/support", "/lord/(dashboard)/support/view/page": "/lord/support/view", "/lord/(dashboard)/support/vip-relay/page": "/lord/support/vip-relay", "/lord/(dashboard)/traceability/page": "/lord/traceability", "/lord/(dashboard)/upload/page": "/lord/upload", "/lord/(dashboard)/vault/page": "/lord/vault", "/lord/(dashboard)/vendor-onboarding/page": "/lord/vendor-onboarding", "/lord/(dashboard)/waitlist/invitations/page": "/lord/waitlist/invitations", "/lord/(dashboard)/warranty/page": "/lord/warranty", "/lord/(dashboard)/waitlist/page": "/lord/waitlist", "/merchant/dashboard/page": "/merchant/dashboard", "/merchant/portal/login/page": "/merchant/portal/login", "/merchant/portal/register/page": "/merchant/portal/register", "/merchant/register/page": "/merchant/register", "/admin/(dashboard)/ticketing/live/page": "/admin/ticketing/live", "/admin/(dashboard)/ticketing/sales/page": "/admin/ticketing/sales", "/admin/(dashboard)/ticketing/page": "/admin/ticketing", "/admin/(dashboard)/ticketing/security/page": "/admin/ticketing/security", "/admin/(dashboard)/ticketing/staff/page": "/admin/ticketing/staff", "/lord/(dashboard)/ticketing/insights/page": "/lord/ticketing/insights", "/lord/(dashboard)/ticketing/sales/page": "/lord/ticketing/sales", "/lord/(dashboard)/ticketing/page": "/lord/ticketing", "/lord/(dashboard)/ticketing/live/page": "/lord/ticketing/live", "/lord/(dashboard)/ticketing/security/page": "/lord/ticketing/security", "/lord/(dashboard)/ticketing/staff/page": "/lord/ticketing/staff", "/lord/(dashboard)/ticketing/transfers/page": "/lord/ticketing/transfers", "/admin/(dashboard)/ticketing/email-preview/page": "/admin/ticketing/email-preview", "/lord/(dashboard)/ticketing/email-preview/page": "/lord/ticketing/email-preview" };
var FunctionsConfigManifest = { "version": 1, "functions": { "/api/admin/connection-health": { "maxDuration": 20 }, "/api/admin/email-center": {}, "/api/admin/product-image": {}, "/api/concierge": { "maxDuration": 12 }, "/api/internal/merchant-alerts/dispatch": {}, "/api/market/merchant-stock-offers": {}, "/api/merchant/alerts": {}, "/api/merchant/riders": {}, "/api/mpesa/orders/webhook/[token]": {}, "/api/payhero/orders/webhook": {}, "/api/rider/alerts": {}, "/api/webhooks/twilio/merchant-alert/confirm": {}, "/api/webhooks/twilio/merchant-alert/status": {}, "/api/webhooks/twilio/merchant-alert/voice": {} } };
var PagesManifest = { "/_app": "pages/_app.js", "/_error": "pages/_error.js", "/_document": "pages/_document.js", "/404": "pages/404.html" };
process.env.NEXT_BUILD_ID = BuildId;
process.env.OPEN_NEXT_BUILD_ID = "mzuYdRSx6_uM9dHUNkRU3";
process.env.NEXT_PREVIEW_MODE_ID = PrerenderManifest?.preview?.previewModeId;

// node_modules/@opennextjs/aws/dist/core/requestHandler.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/patchAsyncStorage.js
var mod = (init_node_module(), __toCommonJS(node_module_exports));
var resolveFilename = mod._resolveFilename;

// node_modules/@opennextjs/aws/dist/core/routeMatchMetadata.js
import path2 from "node:path";

// node_modules/@opennextjs/aws/dist/utils/routeCacheKey.js
function normalizeAppPath(entry) {
  const pathname = entry.split("/").reduce((acc, segment, index, segments) => {
    if (!segment)
      return acc;
    if (segment.startsWith("(") && segment.endsWith(")"))
      return acc;
    if (segment.startsWith("@"))
      return acc;
    if ((segment === "page" || segment === "route") && index === segments.length - 1) {
      return acc;
    }
    return `${acc}/${segment}`;
  }, "");
  return pathname === "" ? "/" : pathname;
}
function compareAppPaths(a, b) {
  const aHasSlot = a.includes("/@");
  const bHasSlot = b.includes("/@");
  if (aHasSlot && !bHasSlot)
    return -1;
  if (!aHasSlot && bHasSlot)
    return 1;
  return a.localeCompare(b);
}
function selectAppPageEntry(route, appPaths) {
  let entry;
  for (const appPath of appPaths) {
    if (normalizeAppPath(appPath).replace(/%5F/g, "_") !== route)
      continue;
    if (entry === void 0 || compareAppPaths(entry, appPath) < 0) {
      entry = appPath;
    }
  }
  return entry;
}
function normalizeLocalePath(pathname, locales) {
  const segment = pathname.split("/", 2)[1]?.toLowerCase();
  const locale = locales?.find((l) => l.toLowerCase() === segment);
  if (!locale) {
    return pathname;
  }
  return pathname.slice(locale.length + 1) || "/";
}

// node_modules/@opennextjs/aws/dist/core/routeMatchMetadata.js
var DYNAMIC_SEGMENT_REGEX = /\[{1,2}(\.\.\.)?([^\]]+)\]{1,2}$/;
function getRouteMatchMetadata(route, pathname) {
  const definition = getRouteDefinition(route);
  const params = definition ? getRouteParams(route, normalizePathname(pathname)) : null;
  return {
    match: definition && params !== null ? { definition, params } : void 0
  };
}
function getRouteDefinition(route) {
  const appPaths = Object.keys(AppPathRoutesManifest).filter((appPath) => AppPathRoutesManifest[appPath] === route);
  const appPages = appPaths.filter((appPath) => appPath.endsWith("/page"));
  const appPage = selectAppPageEntry(route, appPages);
  if (appPage) {
    return {
      kind: "APP_PAGE",
      pathname: route,
      page: appPage,
      filename: getFilename(AppPathsManifest[appPage]),
      appPaths: appPages
    };
  }
  const appRoute = appPaths.find((appPath) => appPath.endsWith("/route"));
  if (appRoute) {
    return {
      kind: "APP_ROUTE",
      pathname: route,
      page: appRoute,
      filename: getFilename(AppPathsManifest[appRoute])
    };
  }
  if (PagesManifest[route]) {
    return {
      kind: route === "/api" || route.startsWith("/api/") ? "PAGES_API" : "PAGES",
      pathname: route,
      page: route,
      filename: getFilename(PagesManifest[route])
    };
  }
  return void 0;
}
function getFilename(manifestPath) {
  return manifestPath ? path2.join(NEXT_DIR, "server", manifestPath) : "";
}
function normalizePathname(pathname) {
  const basePath = NextConfig.basePath;
  let normalized = pathname;
  if (basePath && (normalized === basePath || normalized.startsWith(`${basePath}/`))) {
    normalized = normalized.slice(basePath.length) || "/";
  }
  normalized = normalizeLocalePath(normalized, NextConfig.i18n?.locales);
  return normalized !== "/" && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
function getRouteParams(route, pathname) {
  const dynamicRoute = RoutesManifest.routes.dynamic.find(({ page }) => page === route);
  if (!dynamicRoute) {
    return pathname === route ? void 0 : null;
  }
  const result = new RegExp(dynamicRoute.regex).exec(pathname);
  if (!result) {
    return null;
  }
  const params = {};
  let group = 1;
  for (const segment of route.split("/")) {
    const dynamicSegment = DYNAMIC_SEGMENT_REGEX.exec(segment);
    if (!dynamicSegment) {
      continue;
    }
    const [, isCatchAll, name] = dynamicSegment;
    const value = result[group++];
    if (value !== void 0) {
      params[name] = isCatchAll ? value.split("/").map(decodeURIComponent) : decodeURIComponent(value);
    }
  }
  return params;
}

// node_modules/@opennextjs/aws/dist/core/routing/util.js
import crypto from "node:crypto";
init_util();
init_logger();
import { ReadableStream as ReadableStream3 } from "node:stream/web";

// node_modules/@opennextjs/aws/dist/utils/binary.js
var commonBinaryMimeTypes = /* @__PURE__ */ new Set([
  "application/octet-stream",
  // Docs
  "application/epub+zip",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.amazon.ebook",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Fonts
  "font/otf",
  "font/woff",
  "font/woff2",
  // Images
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/vnd.microsoft.icon",
  "image/webp",
  // Audio
  "audio/3gpp",
  "audio/aac",
  "audio/basic",
  "audio/flac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wavaudio/webm",
  "audio/x-aiff",
  "audio/x-midi",
  "audio/x-wav",
  // Video
  "video/3gpp",
  "video/mp2t",
  "video/mpeg",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  // Archives
  "application/java-archive",
  "application/vnd.apple.installer+xml",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-gzip",
  "application/x-java-archive",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip",
  "application/zip",
  // Serialized data
  "application/x-protobuf"
]);
function isBinaryContentType(contentType) {
  if (!contentType)
    return false;
  const value = contentType.split(";")[0];
  return commonBinaryMimeTypes.has(value);
}

// node_modules/@opennextjs/aws/dist/core/routing/i18n/index.js
init_stream();
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/i18n/accept-header.js
function parse(raw, preferences, options) {
  const lowers = /* @__PURE__ */ new Map();
  const header = raw.replace(/[ \t]/g, "");
  if (preferences) {
    let pos = 0;
    for (const preference of preferences) {
      const lower = preference.toLowerCase();
      lowers.set(lower, { orig: preference, pos: pos++ });
      if (options.prefixMatch) {
        const parts2 = lower.split("-");
        while (parts2.pop(), parts2.length > 0) {
          const joined = parts2.join("-");
          if (!lowers.has(joined)) {
            lowers.set(joined, { orig: preference, pos: pos++ });
          }
        }
      }
    }
  }
  const parts = header.split(",");
  const selections = [];
  const map = /* @__PURE__ */ new Set();
  for (let i = 0; i < parts.length; ++i) {
    const part = parts[i];
    if (!part) {
      continue;
    }
    const params = part.split(";");
    if (params.length > 2) {
      throw new Error(`Invalid ${options.type} header`);
    }
    const token = params[0].toLowerCase();
    if (!token) {
      throw new Error(`Invalid ${options.type} header`);
    }
    const selection = { token, pos: i, q: 1 };
    if (preferences && lowers.has(token)) {
      selection.pref = lowers.get(token).pos;
    }
    map.add(selection.token);
    if (params.length === 2) {
      const q = params[1];
      const [key, value] = q.split("=");
      if (!value || key !== "q" && key !== "Q") {
        throw new Error(`Invalid ${options.type} header`);
      }
      const score = Number.parseFloat(value);
      if (score === 0) {
        continue;
      }
      if (Number.isFinite(score) && score <= 1 && score >= 1e-3) {
        selection.q = score;
      }
    }
    selections.push(selection);
  }
  selections.sort((a, b) => {
    if (b.q !== a.q) {
      return b.q - a.q;
    }
    if (b.pref !== a.pref) {
      if (a.pref === void 0) {
        return 1;
      }
      if (b.pref === void 0) {
        return -1;
      }
      return a.pref - b.pref;
    }
    return a.pos - b.pos;
  });
  const values = selections.map((selection) => selection.token);
  if (!preferences || !preferences.length) {
    return values;
  }
  const preferred = [];
  for (const selection of values) {
    if (selection === "*") {
      for (const [preference, value] of lowers) {
        if (!map.has(preference)) {
          preferred.push(value.orig);
        }
      }
    } else {
      const lower = selection.toLowerCase();
      if (lowers.has(lower)) {
        preferred.push(lowers.get(lower).orig);
      }
    }
  }
  return preferred;
}
function acceptLanguage(header = "", preferences) {
  return parse(header, preferences, {
    type: "accept-language",
    prefixMatch: true
  })[0] || void 0;
}

// node_modules/@opennextjs/aws/dist/core/routing/i18n/index.js
function isLocalizedPath(path3) {
  return NextConfig.i18n?.locales.includes(path3.split("/")[1].toLowerCase()) ?? false;
}
function getLocaleFromCookie(cookies) {
  const i18n = NextConfig.i18n;
  const nextLocale = cookies.NEXT_LOCALE?.toLowerCase();
  return nextLocale ? i18n?.locales.find((locale) => nextLocale === locale.toLowerCase()) : void 0;
}
function detectDomainLocale({ hostname, detectedLocale }) {
  const i18n = NextConfig.i18n;
  const domains = i18n?.domains;
  if (!domains) {
    return;
  }
  const lowercasedLocale = detectedLocale?.toLowerCase();
  for (const domain of domains) {
    const domainHostname = domain.domain.split(":", 1)[0].toLowerCase();
    if (hostname === domainHostname || lowercasedLocale === domain.defaultLocale.toLowerCase() || domain.locales?.some((locale) => lowercasedLocale === locale.toLowerCase())) {
      return domain;
    }
  }
}
function detectLocale(internalEvent, i18n) {
  const domainLocale = detectDomainLocale({
    hostname: internalEvent.headers.host
  });
  if (i18n.localeDetection === false) {
    return domainLocale?.defaultLocale ?? i18n.defaultLocale;
  }
  const cookiesLocale = getLocaleFromCookie(internalEvent.cookies);
  const preferredLocale = acceptLanguage(internalEvent.headers["accept-language"], i18n?.locales);
  debug({
    cookiesLocale,
    preferredLocale,
    defaultLocale: i18n.defaultLocale,
    domainLocale
  });
  return domainLocale?.defaultLocale ?? cookiesLocale ?? preferredLocale ?? i18n.defaultLocale;
}
function localizePath(internalEvent) {
  const i18n = NextConfig.i18n;
  if (!i18n) {
    return internalEvent.rawPath;
  }
  if (isLocalizedPath(internalEvent.rawPath)) {
    return internalEvent.rawPath;
  }
  const detectedLocale = detectLocale(internalEvent, i18n);
  return `/${detectedLocale}${internalEvent.rawPath}`;
}

// node_modules/@opennextjs/aws/dist/core/routing/queue.js
function generateShardId(rawPath, maxConcurrency, prefix) {
  let a = cyrb128(rawPath);
  let t = a += 1831565813;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  const randomFloat = ((t ^ t >>> 14) >>> 0) / 4294967296;
  const randomInt = Math.floor(randomFloat * maxConcurrency);
  return `${prefix}-${randomInt}`;
}
function generateMessageGroupId(rawPath) {
  const maxConcurrency = Number.parseInt(process.env.MAX_REVALIDATE_CONCURRENCY ?? "10");
  return generateShardId(rawPath, maxConcurrency, "revalidate");
}
function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ h1 >>> 18, 597399067);
  h2 = Math.imul(h4 ^ h2 >>> 22, 2869860233);
  h3 = Math.imul(h1 ^ h3 >>> 17, 951274213);
  h4 = Math.imul(h2 ^ h4 >>> 19, 2716044179);
  h1 ^= h2 ^ h3 ^ h4, h2 ^= h1, h3 ^= h1, h4 ^= h1;
  return h1 >>> 0;
}

// node_modules/@opennextjs/aws/dist/core/routing/util.js
function constructNextUrl(baseUrl, path3) {
  const nextBasePath = NextConfig.basePath ?? "";
  const url = new URL(`${nextBasePath}${path3}`, baseUrl);
  return url.href;
}
function convertRes(res) {
  const statusCode = res.statusCode || 200;
  const headers = parseHeaders(res.getFixedHeaders());
  const isBase64Encoded = isBinaryContentType(headers["content-type"]) || !!headers["content-encoding"];
  const body = new ReadableStream3({
    pull(controller) {
      if (!res._chunks || res._chunks.length === 0) {
        controller.close();
        return;
      }
      controller.enqueue(res._chunks.shift());
    }
  });
  return {
    type: "core",
    statusCode,
    headers,
    body,
    isBase64Encoded
  };
}
function convertToQuery(querystring) {
  if (!querystring)
    return {};
  const query = new URLSearchParams(querystring);
  const queryObject = {};
  for (const key of query.keys()) {
    const queries = query.getAll(key);
    queryObject[key] = queries.length > 1 ? queries : queries[0];
  }
  return queryObject;
}
function getMiddlewareMatch(middlewareManifest2, functionsManifest) {
  if (functionsManifest?.functions?.["/_middleware"]) {
    return functionsManifest.functions["/_middleware"].matchers?.map(({ regexp }) => new RegExp(regexp)) ?? [/.*/];
  }
  const rootMiddleware = middlewareManifest2.middleware["/"];
  if (!rootMiddleware?.matchers)
    return [];
  return rootMiddleware.matchers.map(({ regexp }) => new RegExp(regexp));
}
function fixCacheHeaderForHtmlPages(internalEvent, headers) {
  if (internalEvent.rawPath === "/404" || internalEvent.rawPath === "/500") {
    fixCacheControlForError(headers, internalEvent.rawPath === "/404" ? 404 : 500);
    return;
  }
  const localizedPath = localizePath(internalEvent);
  if (HtmlPages.includes(localizedPath) && !internalEvent.headers["x-middleware-prefetch"]) {
    headers[CACHE_CONTROL_HEADER] = "public, max-age=0, s-maxage=31536000, must-revalidate";
  }
}
function fixSWRCacheHeader(headers) {
  let cacheControl = headers[CACHE_CONTROL_HEADER];
  if (!cacheControl)
    return;
  if (Array.isArray(cacheControl)) {
    cacheControl = cacheControl.join(",");
  }
  if (typeof cacheControl !== "string")
    return;
  headers[CACHE_CONTROL_HEADER] = cacheControl.replace(/\bstale-while-revalidate(?!=)/, "stale-while-revalidate=2592000");
}
function addOpenNextHeader(headers) {
  if (NextConfig.poweredByHeader) {
    headers["X-OpenNext"] = "1";
  }
  if (globalThis.openNextDebug) {
    headers["X-OpenNext-Version"] = globalThis.openNextVersion;
  }
  if (process.env.OPEN_NEXT_REQUEST_ID_HEADER || globalThis.openNextDebug) {
    headers["X-OpenNext-RequestId"] = globalThis.__openNextAls.getStore()?.requestId;
  }
}
async function revalidateIfRequired(host, rawPath, headers, req) {
  if (headers[NEXTJS_CACHE_HEADER] === "STALE") {
    const internalMeta = req?.[/* @__PURE__ */ Symbol.for("NextInternalRequestMeta")];
    const revalidateUrl = internalMeta?._nextDidRewrite ? rawPath.startsWith("/_next/data/") ? `/_next/data/${BuildId}${internalMeta?._nextRewroteUrl}.json` : internalMeta?._nextRewroteUrl : rawPath;
    try {
      const hash = (str) => crypto.createHash("md5").update(str).digest("hex");
      const store = globalThis.__openNextAls.getStore();
      const lastModified = store?.lastModified ?? 0;
      const eTag = `${headers.etag ?? headers.ETag ?? ""}`;
      await globalThis.queue.send({
        MessageBody: {
          host,
          url: revalidateUrl,
          eTag,
          // The time of the entry, so that the queue can skip it when it was revalidated since
          lastModified: store?.entryLastModified ?? lastModified
        },
        MessageDeduplicationId: hash(`${rawPath}-${lastModified}-${eTag}`),
        MessageGroupId: generateMessageGroupId(rawPath)
      });
    } catch (e) {
      error(`Failed to revalidate stale page ${rawPath}`, e);
    }
  }
}
function fixISRHeaders(headers) {
  const sMaxAgeRegex = /s-maxage=(\d+)/;
  const match = headers[CACHE_CONTROL_HEADER]?.match(sMaxAgeRegex);
  const sMaxAge = match ? Number.parseInt(match[1]) : void 0;
  if (!sMaxAge) {
    return;
  }
  if (headers[NEXTJS_CACHE_HEADER] === "REVALIDATED") {
    headers[CACHE_CONTROL_HEADER] = NO_STORE_CACHE_CONTROL;
    return;
  }
  const _lastModified = globalThis.__openNextAls.getStore()?.lastModified ?? 0;
  if (headers[NEXTJS_CACHE_HEADER] === "HIT" && _lastModified > 0) {
    debug("cache-control", headers[CACHE_CONTROL_HEADER], _lastModified, Date.now());
    if (sMaxAge && sMaxAge !== 31536e3) {
      const age = Math.round((Date.now() - _lastModified) / 1e3);
      const remainingTtl = Math.max(sMaxAge - age, 1);
      headers[CACHE_CONTROL_HEADER] = `s-maxage=${remainingTtl}, stale-while-revalidate=2592000`;
    }
  }
  if (headers[NEXTJS_CACHE_HEADER] !== "STALE")
    return;
  headers[CACHE_CONTROL_HEADER] = "s-maxage=2, stale-while-revalidate=2592000";
}
function createServerResponse(routingResult, headers, responseStream) {
  const internalEvent = routingResult.internalEvent;
  return new OpenNextNodeResponse((_headers) => {
    fixCacheHeaderForHtmlPages(internalEvent, _headers);
    fixSWRCacheHeader(_headers);
    addOpenNextHeader(_headers);
    fixISRHeaders(_headers);
  }, async (_headers) => {
    await revalidateIfRequired(internalEvent.headers.host, internalEvent.rawPath, _headers);
    await invalidateCDNOnRequest(routingResult, _headers);
  }, responseStream, headers, routingResult.rewriteStatusCode);
}
async function invalidateCDNOnRequest(params, headers) {
  const { internalEvent, resolvedRoutes, initialURL } = params;
  const initialPath = new URL(initialURL).pathname;
  const isIsrRevalidation = internalEvent.headers[ISR_HEADER] === "1";
  if (!isIsrRevalidation && headers[NEXTJS_CACHE_HEADER] === "REVALIDATED") {
    await globalThis.cdnInvalidationHandler.invalidatePaths([
      {
        initialPath,
        rawPath: internalEvent.rawPath,
        resolvedRoutes
      }
    ]);
  }
}

// node_modules/@opennextjs/aws/dist/core/routingHandler.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/cacheInterceptor.js
init_stream();

// node_modules/@opennextjs/aws/dist/utils/cache.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/cacheInterceptor.js
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/routeMatcher.js
var optionalLocalePrefixRegex = `^/(?:${RoutesManifest.locales.map((locale) => `${locale}/?`).join("|")})?`;
var optionalBasepathPrefixRegex = RoutesManifest.basePath ? `^${RoutesManifest.basePath}/?` : "^/";
var optionalPrefix = optionalLocalePrefixRegex.replace("^/", optionalBasepathPrefixRegex);
function routeMatcher(routeDefinitions) {
  const regexp = routeDefinitions.map((route) => ({
    page: route.page,
    regexp: new RegExp(route.regex.replace("^/", optionalPrefix))
  }));
  const appPathsSet = /* @__PURE__ */ new Set();
  const routePathsSet = /* @__PURE__ */ new Set();
  for (const [k, v] of Object.entries(AppPathRoutesManifest)) {
    if (k.endsWith("page")) {
      appPathsSet.add(v);
    } else if (k.endsWith("route")) {
      routePathsSet.add(v);
    }
  }
  return function matchRoute(path3) {
    const foundRoutes = regexp.filter((route) => route.regexp.test(path3));
    return foundRoutes.map((foundRoute) => {
      let routeType = "page";
      if (appPathsSet.has(foundRoute.page)) {
        routeType = "app";
      } else if (routePathsSet.has(foundRoute.page)) {
        routeType = "route";
      }
      return {
        route: foundRoute.page,
        type: routeType
      };
    });
  };
}
var staticRouteMatcher = routeMatcher([
  ...RoutesManifest.routes.static,
  ...getStaticAPIRoutes()
]);
var dynamicRouteMatcher = routeMatcher(RoutesManifest.routes.dynamic);
function getStaticAPIRoutes() {
  const createRouteDefinition = (route) => ({
    page: route,
    regex: `^${route}(?:/)?$`
  });
  const dynamicRoutePages = new Set(RoutesManifest.routes.dynamic.map(({ page }) => page));
  const pagesStaticAPIRoutes = Object.keys(PagesManifest).filter((route) => route.startsWith("/api/") && !dynamicRoutePages.has(route)).map(createRouteDefinition);
  const appPathsStaticAPIRoutes = Object.values(AppPathRoutesManifest).filter((route) => (route.startsWith("/api/") || route === "/api") && !dynamicRoutePages.has(route)).map(createRouteDefinition);
  return [...pagesStaticAPIRoutes, ...appPathsStaticAPIRoutes];
}

// node_modules/@opennextjs/aws/dist/core/routing/cacheInterceptor.js
var CACHE_ONE_YEAR = 60 * 60 * 24 * 365;
var CACHE_ONE_MONTH = 60 * 60 * 24 * 30;

// node_modules/@opennextjs/aws/dist/core/routing/matcher.js
init_stream();
init_logger();

// node_modules/@opennextjs/aws/dist/core/routing/middleware.js
init_util();
init_stream();
init_utils();
var middlewareManifest = MiddlewareManifest;
var functionsConfigManifest = FunctionsConfigManifest;
var middleMatch = getMiddlewareMatch(middlewareManifest, functionsConfigManifest);

// node_modules/@opennextjs/aws/dist/core/routingHandler.js
var MIDDLEWARE_HEADER_PREFIX = "x-middleware-response-";
var MIDDLEWARE_HEADER_PREFIX_LEN = MIDDLEWARE_HEADER_PREFIX.length;
var INTERNAL_HEADER_PREFIX = "x-opennext-";
var NEXT_CONFIG_HEADER_PREFIX = `${INTERNAL_HEADER_PREFIX}next-config-response-`;
var NEXT_CONFIG_HEADER_PREFIX_LEN = NEXT_CONFIG_HEADER_PREFIX.length;
var INTERNAL_HEADER_INITIAL_URL = `${INTERNAL_HEADER_PREFIX}initial-url`;
var INTERNAL_HEADER_LOCALE = `${INTERNAL_HEADER_PREFIX}locale`;
var INTERNAL_HEADER_RESOLVED_ROUTES = `${INTERNAL_HEADER_PREFIX}resolved-routes`;
var INTERNAL_HEADER_REWRITE_STATUS_CODE = `${INTERNAL_HEADER_PREFIX}rewrite-status-code`;
var INTERNAL_EVENT_REQUEST_ID = `${INTERNAL_HEADER_PREFIX}request-id`;

// node_modules/@opennextjs/aws/dist/core/util.js
init_logger();
import NextServer from "next/dist/server/next-server.js";

// node_modules/@opennextjs/aws/dist/core/require-hooks.js
init_logger();
var mod2 = (init_node_module(), __toCommonJS(node_module_exports));
var resolveFilename2 = mod2._resolveFilename;

// node_modules/@opennextjs/aws/dist/core/revalidate.js
init_logger();
var REMOTE_REVALIDATE_TIMEOUT_MS = 3e4;
function resolveRoute(urlPath) {
  const pathname = urlPath.split(/[?#]/)[0];
  return staticRouteMatcher(pathname)[0] ?? dynamicRouteMatcher(pathname)[0];
}
function getRouteTemplates(route) {
  if (route.type === "page") {
    return [`pages${route.route === "/" ? "/index" : route.route}`];
  }
  return Object.entries(AppPathRoutesManifest).filter(([, path3]) => path3 === route.route).map(([appPath]) => `app${appPath}`);
}
function isServedByCurrentFunction(route) {
  const functions = globalThis.openNextConfig?.functions ?? {};
  if (!route || Object.keys(functions).length === 0) {
    return true;
  }
  const templates = getRouteTemplates(route);
  const owner = Object.entries(functions).find(([, fn]) => fn.routes?.some((r) => templates.includes(r)))?.[0];
  return owner === (globalThis.fnName || void 0);
}
async function revalidateRemote({ urlPath, headers, revalidateHeaders, opts }) {
  const host = globalThis.__openNextAls.getStore()?.host;
  if (!host) {
    throw new Error(`Unable to revalidate ${urlPath}: unknown host`);
  }
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers ?? revalidateHeaders ?? {})) {
    if (value === void 0)
      continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      requestHeaders.append(key, v);
    }
  }
  const url = `https://${host}${urlPath}`;
  debug("Revalidating page served by another function", { url });
  const res = await globalThis.internalFetch(url, {
    method: "HEAD",
    headers: requestHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(REMOTE_REVALIDATE_TIMEOUT_MS)
  });
  if (res.headers.get(NEXTJS_CACHE_HEADER)?.toUpperCase() !== "REVALIDATED" && res.status !== 200 && !(res.status === 404 && opts.unstable_onlyGenerated)) {
    throw new Error(`Invalid response ${res.status}`);
  }
}
function createRevalidate(revalidateInProcess) {
  return async (args) => {
    const route = resolveRoute(args.urlPath);
    if (!isServedByCurrentFunction(route)) {
      return revalidateRemote(args);
    }
    const store = globalThis.__openNextAls.getStore();
    const renderInProcess = () => revalidateInProcess(args);
    await (store ? globalThis.__openNextAls.run({
      ...store,
      lastModified: void 0,
      entryLastModified: void 0,
      writtenTags: /* @__PURE__ */ new Set(),
      requestCache: new RequestCache()
    }, renderInProcess) : renderInProcess());
    const path3 = args.urlPath.split(/[?#]/)[0];
    try {
      await globalThis.cdnInvalidationHandler?.invalidatePaths([
        {
          initialPath: path3,
          rawPath: path3,
          resolvedRoutes: route ? [route] : [{ route: path3, type: "page" }]
        }
      ]);
    } catch (e) {
      error(`Failed to invalidate ${path3} in the CDN`, e);
    }
  };
}

// node_modules/@opennextjs/aws/dist/core/util.js
var cacheHandlerPath = __require.resolve("./cache.cjs");
var composableCacheHandlerPath = __require.resolve("./composable-cache.cjs");
var nextServer = new NextServer.default({
  conf: {
    ...NextConfig,
    // Next.js compression should be disabled because of a bug in the bundled
    // `compression` package — https://github.com/vercel/next.js/issues/11669
    compress: false,
    // By default, Next.js uses local disk to store ISR cache. We will use
    // our own cache handler to store the cache on S3.
    //#override stableIncrementalCache
    cacheHandler: cacheHandlerPath,
    cacheMaxMemorySize: 0,
    // We need to disable memory cache
    //#endOverride
    // Next.js 16 promoted `cacheHandlers` out of `experimental` to a top-level
    // config key. At runtime `route-module.js#loadCustomCacheHandlers` reads
    // `nextConfig.cacheHandlers` (top-level) — the nested `experimental` copy
    // below is ignored on Next >= 16, so the composable ("use cache") handler
    // must also be registered here or Next falls back to its in-memory default
    // and composable entries never reach the incremental cache override.
    // Older Next versions ignore this unknown top-level key and read the
    // `experimental` copy instead; setting both is safe across versions.
    //#override topLevelComposableCache
    cacheHandlers: {
      default: composableCacheHandlerPath
    },
    //#endOverride
    experimental: {
      ...NextConfig.experimental,
      // This uses the request.headers.host as the URL
      // https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next-server.ts#L1749-L1754
      //#override trustHostHeader
      trustHostHeader: true,
      //#endOverride
      //#override composableCache
      cacheHandlers: {
        default: composableCacheHandlerPath
      }
      //#endOverride
    }
  },
  customServer: false,
  dev: false,
  dir: __dirname
});
if (typeof nextServer.revalidate === "function") {
  nextServer.revalidate = createRevalidate(nextServer.revalidate.bind(nextServer));
}
var routesLoaded = false;
globalThis.__next_route_preloader = async (stage) => {
  if (routesLoaded) {
    return;
  }
  const thisFunction = globalThis.fnName ? globalThis.openNextConfig.functions[globalThis.fnName] : globalThis.openNextConfig.default;
  const routePreloadingBehavior = thisFunction?.routePreloadingBehavior ?? "none";
  if (routePreloadingBehavior === "none") {
    routesLoaded = true;
    return;
  }
  if (!("unstable_preloadEntries" in nextServer)) {
    debug("The current version of Next.js does not support route preloading. Skipping route preloading.");
    routesLoaded = true;
    return;
  }
  if (stage === "waitUntil" && routePreloadingBehavior === "withWaitUntil") {
    const waitUntil = globalThis.__openNextAls.getStore()?.waitUntil;
    if (!waitUntil) {
      error("You've tried to use the 'withWaitUntil' route preloading behavior, but the 'waitUntil' function is not available.");
      routesLoaded = true;
      return;
    }
    debug("Preloading entries with waitUntil");
    waitUntil?.(nextServer.unstable_preloadEntries());
    routesLoaded = true;
  } else if (stage === "start" && routePreloadingBehavior === "onStart" || stage === "warmerEvent" && routePreloadingBehavior === "onWarmerEvent" || stage === "onDemand") {
    const startTimestamp = Date.now();
    debug("Preloading entries");
    await nextServer.unstable_preloadEntries();
    debug("Preloading entries took", Date.now() - startTimestamp, "ms");
    routesLoaded = true;
  }
};
var requestHandler = (metadata) => "getRequestHandlerWithMetadata" in nextServer ? nextServer.getRequestHandlerWithMetadata(metadata) : nextServer.getRequestHandler();

// node_modules/@opennextjs/aws/dist/core/requestHandler.js
globalThis.__openNextAls = new AsyncLocalStorage();
function splitRoutingHeaders(eventHeaders) {
  const requestHeaders = {};
  const middlewareHeaders = {};
  const nextConfigHeaders = {};
  for (const [key, value] of Object.entries(eventHeaders)) {
    if (key.startsWith(MIDDLEWARE_HEADER_PREFIX)) {
      middlewareHeaders[key.slice(MIDDLEWARE_HEADER_PREFIX_LEN)] = value;
    } else if (key.startsWith(NEXT_CONFIG_HEADER_PREFIX)) {
      nextConfigHeaders[key.slice(NEXT_CONFIG_HEADER_PREFIX_LEN)] = value;
    } else {
      requestHeaders[key] = value;
    }
  }
  return {
    requestHeaders: { ...requestHeaders, ...middlewareHeaders },
    // The routing already dropped the `next.config` headers that must not take precedence.
    responseHeaders: { ...middlewareHeaders, ...nextConfigHeaders }
  };
}
async function openNextHandler(internalEvent, options) {
  const initialHeaders = internalEvent.headers;
  const requestId = globalThis.openNextConfig.middleware?.external ? internalEvent.headers[INTERNAL_EVENT_REQUEST_ID] : Math.random().toString(36);
  return runWithOpenNextRequestContext({
    isISRRevalidation: initialHeaders[ISR_HEADER] === "1",
    waitUntil: options?.waitUntil,
    requestId
  }, async () => {
    await globalThis.__next_route_preloader("waitUntil");
    if (initialHeaders["x-forwarded-host"]) {
      initialHeaders.host = initialHeaders["x-forwarded-host"];
    }
    const requestStore = globalThis.__openNextAls.getStore();
    if (requestStore) {
      requestStore.host = initialHeaders.host;
    }
    debug("internalEvent", internalEvent);
    const internalHeaders = {
      initialPath: initialHeaders[INTERNAL_HEADER_INITIAL_URL] ?? internalEvent.rawPath,
      resolvedRoutes: initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES] ? JSON.parse(initialHeaders[INTERNAL_HEADER_RESOLVED_ROUTES]) : [],
      rewriteStatusCode: Number.parseInt(initialHeaders[INTERNAL_HEADER_REWRITE_STATUS_CODE])
    };
    let routingResult = {
      internalEvent,
      isExternalRewrite: false,
      origin: false,
      isISR: false,
      initialURL: internalEvent.url,
      ...internalHeaders
    };
    let requestHeaders = {};
    let overwrittenResponseHeaders = {};
    if (!("type" in routingResult)) {
      const split = splitRoutingHeaders(routingResult.internalEvent.headers);
      requestHeaders = split.requestHeaders;
      overwrittenResponseHeaders = split.responseHeaders;
      routingResult = {
        ...routingResult,
        internalEvent: {
          ...routingResult.internalEvent,
          headers: requestHeaders
        }
      };
    }
    if ("isExternalRewrite" in routingResult && routingResult.isExternalRewrite === true) {
      try {
        routingResult = await globalThis.proxyExternalRequest.proxy(routingResult.internalEvent);
      } catch (e) {
        error("External request failed.", e);
        routingResult = {
          internalEvent: {
            type: "core",
            rawPath: "/500",
            method: "GET",
            headers: {},
            url: constructNextUrl(internalEvent.url, "/500"),
            query: {},
            cookies: {},
            remoteAddress: ""
          },
          // On error we need to rewrite to the 500 page which is an internal rewrite
          isExternalRewrite: false,
          isISR: false,
          origin: false,
          initialURL: internalEvent.url,
          resolvedRoutes: [{ route: "/500", type: "page" }]
        };
      }
    }
    if ("type" in routingResult) {
      if (options?.streamCreator) {
        const response = createServerResponse({
          internalEvent,
          isExternalRewrite: false,
          isISR: false,
          resolvedRoutes: [],
          origin: false,
          initialURL: internalEvent.url
        }, routingResult.headers, options.streamCreator);
        response.statusCode = routingResult.statusCode;
        response.flushHeaders();
        const [bodyToConsume, bodyToReturn] = routingResult.body.tee();
        for await (const chunk of bodyToConsume) {
          response.write(chunk);
        }
        response.end();
        routingResult.body = bodyToReturn;
      }
      return routingResult;
    }
    const preprocessedEvent = routingResult.internalEvent;
    debug("preprocessedEvent", preprocessedEvent);
    const { search, pathname, hash } = new URL(preprocessedEvent.url);
    const reqProps = {
      method: preprocessedEvent.method,
      url: `${pathname}${search}${hash}`,
      //WORKAROUND: We pass this header to the serverless function to mimic a prefetch request which will not trigger revalidation since we handle revalidation differently
      // There is 3 way we can handle revalidation:
      // 1. We could just let the revalidation go as normal, but due to race conditions the revalidation will be unreliable
      // 2. We could alter the lastModified time of our cache to make next believe that the cache is fresh, but this could cause issues with stale data since the cdn will cache the stale data as if it was fresh
      // 3. OUR CHOICE: We could pass a purpose prefetch header to the serverless function to make next believe that the request is a prefetch request and not trigger revalidation (This could potentially break in the future if next changes the behavior of prefetch requests)
      headers: {
        ...requestHeaders
      },
      body: preprocessedEvent.body,
      remoteAddress: preprocessedEvent.remoteAddress
    };
    const mergeHeadersPriority = globalThis.openNextConfig.dangerous?.headersAndCookiesPriority ? globalThis.openNextConfig.dangerous.headersAndCookiesPriority(preprocessedEvent) : "middleware";
    const store = globalThis.__openNextAls.getStore();
    if (store) {
      store.mergeHeadersPriority = mergeHeadersPriority;
    }
    const req = new IncomingMessage(reqProps);
    const res = createServerResponse(routingResult, overwrittenResponseHeaders, options?.streamCreator);
    await processRequest(req, res, routingResult);
    const { statusCode, headers: responseHeaders, isBase64Encoded, body } = convertRes(res);
    const internalResult = {
      type: internalEvent.type,
      statusCode,
      headers: responseHeaders,
      body,
      isBase64Encoded
    };
    return internalResult;
  });
}
async function processRequest(req, res, routingResult) {
  delete req.body;
  const initialURL = new URL(
    // We always assume that only the routing layer can set this header.
    routingResult.internalEvent.headers[INTERNAL_HEADER_INITIAL_URL] ?? routingResult.initialURL
  );
  let invokeStatus;
  if (routingResult.internalEvent.rawPath === "/500") {
    invokeStatus = 500;
  } else if (routingResult.internalEvent.rawPath === "/404") {
    invokeStatus = 404;
  }
  const requestMetadata = {
    isNextDataReq: routingResult.internalEvent.query.__nextDataReq === "1",
    initURL: routingResult.initialURL,
    initQuery: convertToQuery(initialURL.search),
    initProtocol: initialURL.protocol,
    defaultLocale: NextConfig.i18n?.defaultLocale,
    locale: routingResult.locale,
    middlewareInvoke: false,
    // By setting invokePath and invokeQuery we can bypass some of the routing logic in Next.js
    invokePath: routingResult.internalEvent.rawPath,
    invokeQuery: routingResult.internalEvent.query,
    // invokeStatus is only used for error pages
    invokeStatus
  };
  try {
    req.url = initialURL.pathname + initialURL.search;
    await requestHandler(requestMetadata)(req, res);
  } catch (e) {
    if (e.constructor.name === "NoFallbackError") {
      await handleNoFallbackError(req, res, routingResult, requestMetadata);
    } else {
      error("NextJS request failed.", e);
      await tryRenderError("500", res, routingResult.internalEvent);
    }
  }
}
var MAX_RENDER_ATTEMPTS = 6;
async function handleNoFallbackError(req, res, routingResult, metadata, index = 1) {
  if (index >= MAX_RENDER_ATTEMPTS) {
    await tryRenderError("500", res, routingResult.internalEvent);
    return;
  }
  if (index >= routingResult.resolvedRoutes.length) {
    await tryRenderError("404", res, routingResult.internalEvent);
    return;
  }
  const route = routingResult.resolvedRoutes[index].route;
  try {
    let routeMatchMetadata = {};
    if (compareSemver(globalThis.nextVersion, ">=", "16.4.0")) {
      try {
        routeMatchMetadata = getRouteMatchMetadata(route, routingResult.internalEvent.rawPath);
      } catch (e) {
        if (!(e instanceof URIError)) {
          throw e;
        }
        await tryRenderError("400", res, routingResult.internalEvent);
        return;
      }
    }
    await requestHandler({
      ...routingResult,
      invokeOutput: route,
      ...metadata,
      // Must come after `metadata` to override the stale `match` of the previous attempt.
      ...routeMatchMetadata
    })(req, res);
  } catch (e) {
    if (e.constructor.name === "NoFallbackError") {
      await handleNoFallbackError(req, res, routingResult, metadata, index + 1);
    } else {
      error("NextJS request failed.", e);
      await tryRenderError("500", res, routingResult.internalEvent);
    }
  }
}
async function tryRenderError(type, res, internalEvent) {
  try {
    const _req = new IncomingMessage({
      method: "GET",
      url: `/${type}`,
      headers: internalEvent.headers,
      body: internalEvent.body,
      remoteAddress: internalEvent.remoteAddress
    });
    const requestMetadata = {
      // By setting invokePath and invokeQuery we can bypass some of the routing logic in Next.js
      invokePath: `/${type}`,
      invokeStatus: Number(type),
      middlewareInvoke: false
    };
    await requestHandler(requestMetadata)(_req, res);
  } catch (e) {
    error("NextJS request failed.", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      message: "Server failed to respond.",
      details: e
    }, null, 2));
  }
}

// node_modules/@opennextjs/aws/dist/core/resolve.js
async function resolveConverter(converter2) {
  if (typeof converter2 === "function") {
    return converter2();
  }
  const m_1 = await Promise.resolve().then(() => (init_edge(), edge_exports));
  return m_1.default;
}
async function resolveWrapper(wrapper) {
  if (typeof wrapper === "function") {
    return wrapper();
  }
  const m_1 = await Promise.resolve().then(() => (init_cloudflare_node(), cloudflare_node_exports));
  return m_1.default;
}
async function resolveTagCache(tagCache) {
  if (typeof tagCache === "function") {
    return tagCache();
  }
  const m_1 = await Promise.resolve().then(() => (init_dummy(), dummy_exports));
  return m_1.default;
}
async function resolveQueue(queue) {
  if (typeof queue === "function") {
    return queue();
  }
  const m_1 = await Promise.resolve().then(() => (init_dummy2(), dummy_exports2));
  return m_1.default;
}
async function resolveIncrementalCache(incrementalCache) {
  if (typeof incrementalCache === "function") {
    return incrementalCache();
  }
  const m_1 = await Promise.resolve().then(() => (init_dummy3(), dummy_exports3));
  return m_1.default;
}
async function resolveAssetResolver(assetResolver) {
  if (typeof assetResolver === "function") {
    return assetResolver();
  }
  const m_1 = await Promise.resolve().then(() => (init_dummy4(), dummy_exports4));
  return m_1.default;
}
async function resolveProxyRequest(proxyRequest) {
  if (typeof proxyRequest === "function") {
    return proxyRequest();
  }
  const m_1 = await Promise.resolve().then(() => (init_fetch(), fetch_exports));
  return m_1.default;
}
async function resolveCdnInvalidation(cdnInvalidation) {
  if (typeof cdnInvalidation === "function") {
    return cdnInvalidation();
  }
  const m_1 = await Promise.resolve().then(() => (init_dummy5(), dummy_exports5));
  return m_1.default;
}

// node_modules/@opennextjs/aws/dist/core/createMainHandler.js
async function createMainHandler() {
  const config = await import("./open-next.config.mjs").then((m) => m.default);
  const thisFunction = globalThis.fnName ? config.functions[globalThis.fnName] : config.default;
  globalThis.serverId = generateUniqueId();
  globalThis.openNextConfig = config;
  await globalThis.__next_route_preloader("start");
  globalThis.queue = await resolveQueue(thisFunction.override?.queue);
  globalThis.incrementalCache = await resolveIncrementalCache(thisFunction.override?.incrementalCache);
  globalThis.tagCache = await resolveTagCache(thisFunction.override?.tagCache);
  if (config.middleware?.external !== true) {
    globalThis.assetResolver = await resolveAssetResolver(globalThis.openNextConfig.middleware?.assetResolver);
  }
  globalThis.proxyExternalRequest = await resolveProxyRequest(thisFunction.override?.proxyExternalRequest);
  globalThis.cdnInvalidationHandler = await resolveCdnInvalidation(thisFunction.override?.cdnInvalidation);
  const converter2 = await resolveConverter(thisFunction.override?.converter);
  const { wrapper, name } = await resolveWrapper(thisFunction.override?.wrapper);
  debug("Using wrapper", name);
  return wrapper(openNextHandler, converter2);
}

// node_modules/@opennextjs/aws/dist/adapters/server-adapter.js
setNodeEnv();
setNextjsServerWorkingDirectory();
globalThis.internalFetch = fetch;
var handler2 = await createMainHandler();
function setNextjsServerWorkingDirectory() {
  process.chdir(__dirname);
}
export {
  handler2 as handler
};
