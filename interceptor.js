/**
 * Runs in the page's MAIN world.
 * Overrides window.fetch and XMLHttpRequest to intercept matching requests
 * and return mock responses. Communicates with content.js via postMessage.
 */
(function () {
  'use strict';

  if (window.__MOCK_MASTER_INSTALLED__) return;
  window.__MOCK_MASTER_INSTALLED__ = true;

  const _origFetch = window.fetch ? window.fetch.bind(window) : null;
  const _OrigXHR = window.XMLHttpRequest;

  let _msgId = 0;
  const _pending = new Map();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.type !== '__MOCK_MASTER_RESP__') return;
    const resolve = _pending.get(d.id);
    if (resolve) {
      _pending.delete(d.id);
      resolve(d.mock || null);
    }
  });

  function getMock(url, method) {
    return new Promise((resolve) => {
      const id = ++_msgId;
      _pending.set(id, resolve);
      // Timeout: pass-through if content script doesn't respond in 1.5s
      setTimeout(() => {
        if (_pending.has(id)) { _pending.delete(id); resolve(null); }
      }, 1500);
      window.postMessage({ type: '__MOCK_MASTER_REQ__', id, url, method }, '*');
    });
  }

  const sleep = (ms) => new Promise((r) => (ms > 0 ? setTimeout(r, ms) : r()));

  // ── Console log when a request is overridden ────────────────────────────
  const METHOD_COLOR = {
    GET: '#10b981', POST: '#f59e0b', PUT: '#3b82f6',
    DELETE: '#ef4444', PATCH: '#8b5cf6', HEAD: '#06b6d4', OPTIONS: '#9ca3af',
  };

  function logMockOverride(url, method) {
    const color = METHOD_COLOR[method] || '#9ca3af';
    console.log(
      `%c API Mock %c ${method} %c ${url} %c — response is being mocked`,
      'background:#f59e0b;color:#1a1d27;padding:1px 6px;border-radius:3px;font-weight:700;font-size:11px',
      `background:${color};color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;font-size:11px`,
      'color:#e2e8f0;font-size:11px',
      'color:#64748b;font-size:11px',
    );
  }

  function parseHeadersStr(str) {
    const out = {};
    if (!str) return out;
    str.split('\n').forEach((line) => {
      const colon = line.indexOf(':');
      if (colon > 0) {
        out[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }
    });
    return out;
  }

  const STATUS_TEXT = {
    200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently',
    302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized',
    403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
    409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
  };

  // ── Override fetch ──────────────────────────────────────────────────────────
  if (_origFetch) {
    window.fetch = async function (input, init) {
      init = init || {};
      const url = input instanceof Request ? input.url : String(input);
      const method = (
        init.method ||
        (input instanceof Request ? input.method : 'GET') ||
        'GET'
      ).toUpperCase();

      const mock = await getMock(url, method);
      if (mock) {
        logMockOverride(url, method);
        await sleep(mock.delay || 0);
        const hdrs = new Headers({
          'Content-Type': 'application/json',
          ...parseHeadersStr(mock.responseHeaders),
        });
        return new Response(mock.responseBody || '{}', {
          status: mock.statusCode || 200,
          statusText: STATUS_TEXT[mock.statusCode] || 'OK',
          headers: hdrs,
        });
      }
      return _origFetch(input, init);
    };
  }

  // ── Override XMLHttpRequest ─────────────────────────────────────────────────
  window.XMLHttpRequest = class MockXHR extends EventTarget {
    constructor() {
      super();
      this._r = new _OrigXHR();
      this._method = 'GET';
      this._url = '';
      this._mocked = false;

      // Mirrored XHR state
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.responseText = '';
      this.response = '';
      this.responseURL = '';
      this._responseType = '';
      this._timeout = 0;
      this._withCredentials = false;

      // Event handler properties
      this.onreadystatechange = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
      this.ontimeout = null;
      this.onabort = null;
      this.onprogress = null;
      this.onloadstart = null;

      // Forward real XHR events when not mocked
      const forward = (evt, e) => {
        if (this._mocked) return;
        if (evt === 'readystatechange') {
          this.readyState = this._r.readyState;
          try { this.status = this._r.status; } catch (_) {}
          try { this.statusText = this._r.statusText; } catch (_) {}
          if (this._r.readyState === 4) {
            try { this.responseText = this._r.responseText; } catch (_) {}
            try { this.response = this._r.response; } catch (_) {}
            try { this.responseURL = this._r.responseURL; } catch (_) {}
          }
        }
        const cb = this['on' + evt];
        if (cb) cb(e);
        this.dispatchEvent(new Event(evt));
      };

      ['readystatechange', 'load', 'loadend', 'error', 'timeout', 'abort', 'progress', 'loadstart']
        .forEach((evt) => this._r.addEventListener(evt, (e) => forward(evt, e)));
    }

    open(method, url, asyncFlag, user, pass) {
      this._method = (method || 'GET').toUpperCase();
      this._url = url;
      this._r.open(method, url, asyncFlag !== false, user, pass);
    }

    async send(body) {
      const mock = await getMock(this._url, this._method);
      if (mock) {
        this._mocked = true;
        logMockOverride(this._url, this._method);
        await sleep(mock.delay || 0);

        this.readyState = 4;
        this.status = mock.statusCode || 200;
        this.statusText = STATUS_TEXT[mock.statusCode] || 'OK';
        this.responseText = mock.responseBody || '';
        this.response = this.responseText;
        this.responseURL = this._url;

        if (this.onreadystatechange) this.onreadystatechange();
        this.dispatchEvent(new Event('readystatechange'));

        const le = new ProgressEvent('load');
        if (this.onload) this.onload(le);
        this.dispatchEvent(le);

        const lde = new ProgressEvent('loadend');
        if (this.onloadend) this.onloadend(lde);
        this.dispatchEvent(lde);
      } else {
        this._r.send(body);
      }
    }

    setRequestHeader(name, value) { this._r.setRequestHeader(name, value); }
    getResponseHeader(name) { return this._mocked ? null : this._r.getResponseHeader(name); }
    getAllResponseHeaders() { return this._mocked ? '' : this._r.getAllResponseHeaders(); }
    abort() { if (!this._mocked) this._r.abort(); }
    get upload() { return this._r.upload; }

    get responseType() { return this._responseType; }
    set responseType(v) { this._responseType = v; try { this._r.responseType = v; } catch (_) {} }

    get timeout() { return this._timeout; }
    set timeout(v) { this._timeout = v; this._r.timeout = v; }

    get withCredentials() { return this._withCredentials; }
    set withCredentials(v) { this._withCredentials = v; this._r.withCredentials = v; }
  };
})();
