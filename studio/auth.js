// Session token for the Studio API (ROADMAP M33). studio/server.mjs writes it into the main page as <meta name="avs-token">;
// loaded before every other editor script, this adds it to each same-origin /api request (fetch + XMLHttpRequest).
// Media elements and links cannot send headers: build their /api URLs with avsUrl(url), which adds ?avs_token=.
(() => {
  const T = document.querySelector('meta[name="avs-token"]')?.content || '';
  const own = u => { try { const x = new URL(u, location.href); return x.origin === location.origin && x.pathname.startsWith('/api/'); } catch { return false; } };

  const fetch0 = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!own(url)) return fetch0(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-AVS-Token', T);
    return fetch0(input, { ...init, headers });
  };

  const open0 = XMLHttpRequest.prototype.open, send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) { this._avsOwn = own(url); return open0.call(this, method, url, ...rest); };
  XMLHttpRequest.prototype.send = function (b) { if (this._avsOwn) this.setRequestHeader('X-AVS-Token', T); return send0.call(this, b); };

  window.avsUrl = u => {
    if (!u || !own(u)) return u;
    const x = new URL(u, location.href); x.searchParams.set('avs_token', T);
    return x.pathname + x.search + x.hash;
  };
})();
