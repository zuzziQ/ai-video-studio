// Session token for the Studio API (ROADMAP M33). studio/server.mjs writes it into the main page as <meta name="avs-token">;
// loaded before every other editor script, this adds it to each same-origin /api request (fetch + XMLHttpRequest).
// Media elements and links cannot send headers: build their /api URLs with avsUrl(url), which adds ?avs_token=.
(() => {
  const T = document.querySelector('meta[name="avs-token"]')?.content || '';
  const own = u => { try { const x = new URL(u, location.href); return x.origin === location.origin && x.pathname.startsWith('/api/'); } catch { return false; } };

  // S18 M129: mã tab dự án (?p=<12 hex> trên thanh địa chỉ) đi kèm mọi /api request qua X-AVS-Project, nên mỗi cửa sổ / tab sửa
  // đúng dự án của nó. Server mở dự án khác trong một request (trang chủ, Cùng bộ, Video mới xong) → trả X-AVS-Opened: mã mới,
  // ghi lên thanh địa chỉ để lần tải lại kế tiếp mở đúng dự án đó.
  const okId = v => /^[a-f0-9]{12}$/.test(String(v || ''));
  let PID = new URLSearchParams(location.search).get('p'); if (!okId(PID)) PID = '';
  window.avsProject = {
    get id() { return PID; },
    set(id) {
      if (!okId(id) || id === PID) return;
      PID = id;
      const x = new URL(location.href); x.searchParams.set('p', id);
      history.replaceState(history.state, '', x.pathname + x.search + x.hash);
    },
    url(id) { const x = new URL(location.href); if (okId(id)) x.searchParams.set('p', id); else x.searchParams.delete('p'); return x.pathname + x.search; },
  };
  const opened = r => { const o = r.headers?.get?.('X-AVS-Opened'); if (okId(o)) window.avsProject.set(o); return r; };
  const fetch0 = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!own(url)) return fetch0(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-AVS-Token', T);
    if (PID) headers.set('X-AVS-Project', PID);
    return fetch0(input, { ...init, headers }).then(opened);
  };

  const open0 = XMLHttpRequest.prototype.open, send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) { this._avsOwn = own(url); return open0.call(this, method, url, ...rest); };
  XMLHttpRequest.prototype.send = function (b) { if (this._avsOwn) { this.setRequestHeader('X-AVS-Token', T); if (PID) this.setRequestHeader('X-AVS-Project', PID); } return send0.call(this, b); };

  window.avsUrl = u => {
    if (!u || !own(u)) return u;
    const x = new URL(u, location.href); x.searchParams.set('avs_token', T);
    return x.pathname + x.search + x.hash;
  };
})();
