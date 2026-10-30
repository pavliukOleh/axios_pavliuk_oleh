'use strict';

import utils from '../utils.js';
import buildURL from '../helpers/buildURL.js';
import InterceptorManager from './InterceptorManager.js';
import dispatchRequest from './dispatchRequest.js';
import mergeConfig from './mergeConfig.js';
import buildFullPath from './buildFullPath.js';
import methodList from './methodList.js';
import validator from '../helpers/validator.js';
import AxiosHeaders from './AxiosHeaders.js';
import transitionalDefaults from '../defaults/transitional.js';
import { getCauseStackIndex } from './AxiosError.js';

const validators = validator.validators;
const transitionalBoolean = validators.transitional(validators.boolean);

// Recognize header maps without consuming objects intended as literal values.
// AxiosHeaders from other builds share a brand and header-container interface,
// but not constructor identity. A tag and toJSON alone can describe a literal.
const isHeadersBucket = (value) => {
  if (value == null || utils.isPlainObject(value) || value instanceof AxiosHeaders) {
    return true;
  }

  try {
    return (
      utils.isObject(value) &&
      utils.getSafeProp(value, Symbol.toStringTag) === 'AxiosHeaders' &&
      [
        'toJSON',
        'set',
        'get',
        'has',
        'delete',
        'clear',
        'normalize',
        'concat',
        'toString',
        Symbol.iterator,
      ].every((method) => utils.isFunction(utils.getSafeProp(value, method)))
    );
  } catch (e) {
    // A failed optional brand probe must not prevent literal header serialization.
    return false;
  }
};

// Flatten header defaults without consuming literal method-named headers.
const flattenHeaders = (headers, method) => {
  const commonHeaders = utils.getSafeProp(headers, 'common');
  const methodHeaders = utils.getSafeProp(headers, method);
  const contextHeaders =
    headers &&
    utils.merge(
      isHeadersBucket(commonHeaders) ? commonHeaders : undefined,
      isHeadersBucket(methodHeaders) ? methodHeaders : undefined
    );

  headers &&
    utils.forEach(methodList.concat('common'), (headerMethod) => {
      if (isHeadersBucket(utils.getSafeProp(headers, headerMethod))) {
        delete headers[headerMethod];
      }
    });

  return AxiosHeaders.concat(contextHeaders, headers);
};

const transitionalOptionsSchema = {
  silentJSONParsing: transitionalBoolean,
  forcedJSONParsing: transitionalBoolean,
  clarifyTimeoutError: transitionalBoolean,
  legacyInterceptorReqResOrdering: transitionalBoolean,
  advertiseZstdAcceptEncoding: transitionalBoolean,
  validateStatusUndefinedResolves: transitionalBoolean,
  encodeBasicAuthUsername: transitionalBoolean,
};

const paramsSerializerSchema = {
  encode: validators.function,
  serialize: validators.function,
};

const normalizeParamsSerializer = (config) => {
  const { paramsSerializer } = config;

  if (paramsSerializer == null) {
    return;
  }

  if (utils.isFunction(paramsSerializer)) {
    config.paramsSerializer = {
      serialize: paramsSerializer,
    };
  } else {
    validator.assertOptions(paramsSerializer, paramsSerializerSchema, true);
  }
};

const validateRequestOptions = (config) => {
  if (config.transitional !== undefined) {
    validator.assertOptions(config.transitional, transitionalOptionsSchema, false);
  }

  normalizeParamsSerializer(config);

  if (config.allowAbsoluteUrls === undefined) {
    config.allowAbsoluteUrls = true;
  }

  validator.assertOptions(
    config,
    {
      baseUrl: validators.spelling('baseURL'),
      withXsrfToken: validators.spelling('withXSRFToken'),
    },
    true
  );
};

const isSkippedByRunWhen = (interceptor, config) =>
  typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false;

const usesLegacyInterceptorOrdering = (config) =>
  (config.transitional || transitionalDefaults).legacyInterceptorReqResOrdering;

// slice off the Error: ... line
const stripFirstLine = (rawStack) => {
  if (typeof rawStack !== 'string') {
    return '';
  }

  const firstNewlineIndex = rawStack.indexOf('\n');

  return firstNewlineIndex === -1 ? '' : rawStack.slice(firstNewlineIndex + 1);
};

// Match a common suffix after the 2 top frames when available,
// otherwise compare the full reconstructed stack.
const getDuplicateCheckSuffix = (callerFrames) => {
  const firstNewlineIndex = callerFrames.indexOf('\n');
  const secondNewlineIndex =
    firstNewlineIndex === -1 ? -1 : callerFrames.indexOf('\n', firstNewlineIndex + 1);

  return secondNewlineIndex === -1 ? callerFrames : callerFrames.slice(secondNewlineIndex + 1);
};

// `AxiosError.from()` may have already inlined the wrapped error's
// stack under a `Caused by:` marker. Keep the reconstructed caller
// frames ahead of that marker so stack-only reporters do not read
// them as part of the low-level cause.
const appendCallerFrames = (err, callerFrames) => {
  if (!err.stack) {
    err.stack = callerFrames;
    return;
  }

  if (!callerFrames) {
    return;
  }

  const currentStack = String(err.stack);
  const causeIndex = getCauseStackIndex(err, currentStack);
  const stackHead = causeIndex === -1 ? currentStack : currentStack.slice(0, causeIndex);
  const causeSection = causeIndex === -1 ? '' : currentStack.slice(causeIndex);

  if (!stackHead.endsWith(getDuplicateCheckSuffix(callerFrames))) {
    err.stack = stackHead + '\n' + callerFrames + causeSection;
  }
};

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Axios} A new instance of Axios
 */
class Axios {
  constructor(instanceConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager(),
    };
  }

  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(configOrUrl, config) {
    try {
      return await this._request(configOrUrl, config);
    } catch (err) {
      if (err instanceof Error) {
        try {
          let callerStackCarrier = {};

          Error.captureStackTrace
            ? Error.captureStackTrace(callerStackCarrier)
            : (callerStackCarrier = new Error());

          appendCallerFrames(err, stripFirstLine(callerStackCarrier.stack));
        } catch (e) {
          // Ignore failures from custom stack hooks or un-writable stack properties.
        }
      }

      throw err;
    }
  }

  _request(configOrUrl, config) {
    /*eslint no-param-reassign:0*/
    // Allow for axios('example/url'[, config]) a la fetch API
    if (typeof configOrUrl === 'string') {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }

    config = mergeConfig(this.defaults, config);

    validateRequestOptions(config);

    // Set config.method
    config.method = (
      utils.getSafeProp(config, 'method') ||
      utils.getSafeProp(this.defaults, 'method') ||
      'get'
    ).toLowerCase();

    config.headers = flattenHeaders(config.headers, config.method);

    // filter out skipped interceptors
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      if (isSkippedByRunWhen(interceptor, config)) {
        return;
      }

      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

      if (usesLegacyInterceptorOrdering(config)) {
        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      } else {
        requestInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      }
    });

    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });

    let promise;
    let i = 0;
    let len;

    if (!synchronousRequestInterceptors) {
      const chain = [dispatchRequest.bind(this), undefined];
      chain.unshift(...requestInterceptorChain);
      chain.push(...responseInterceptorChain);
      len = chain.length;

      promise = Promise.resolve(config);

      while (i < len) {
        promise = promise.then(chain[i++], chain[i++]);
      }

      return promise;
    }

    len = requestInterceptorChain.length;

    let newConfig = config;

    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];
      try {
        newConfig = onFulfilled ? onFulfilled(newConfig) : newConfig;
      } catch (error) {
        if (!onRejected) {
          promise = Promise.reject(error);
          break;
        }

        try {
          const rejectedResult = onRejected.call(this, error);

          if (utils.isThenable(rejectedResult)) {
            promise = Promise.resolve(rejectedResult).then(() =>
              dispatchRequest.call(this, newConfig)
            );
          }
        } catch (rejectedError) {
          promise = Promise.reject(rejectedError);
        }

        break;
      }
    }

    if (!promise) {
      try {
        promise = dispatchRequest.call(this, newConfig);
      } catch (error) {
        promise = Promise.reject(error);
      }
    }

    i = 0;
    len = responseInterceptorChain.length;

    while (i < len) {
      promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
    }

    return promise;
  }

  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls, config);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
}

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = async function (url, config) {
    return this.request(
      mergeConfig(config || {}, {
        method,
        url,
        data: config && utils.hasOwnProp(config, 'data') ? config.data : undefined,
      })
    );
  };
});

utils.forEach(['post', 'put', 'patch', 'query'], function forEachMethodWithData(method) {
  function generateHTTPMethod(isForm) {
    return async function httpMethod(url, data, config) {
      return this.request(
        mergeConfig(config || {}, {
          method,
          headers: isForm
            ? {
                'Content-Type': 'multipart/form-data',
              }
            : {},
          url,
          data,
        })
      );
    };
  }

  Axios.prototype[method] = generateHTTPMethod();

  // QUERY is a safe/idempotent read method; multipart form bodies don't fit
  // its semantics, so no queryForm shorthand is generated.
  if (method !== 'query') {
    Axios.prototype[method + 'Form'] = generateHTTPMethod(true);
  }
});

export default Axios;
