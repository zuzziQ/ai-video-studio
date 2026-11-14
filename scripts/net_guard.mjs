// Outbound fetch guard for URLs that come from the browser or from search results (b-roll stock download).
// Only http(s) to public addresses: loopback, private, link-local, CGNAT, multicast and reserved ranges are refused.
// The address is checked when the socket connects (the request's own DNS lookup), so a host that answers a public IP
// to a first lookup and 127.0.0.1 to the next (DNS rebinding) is still refused; every redirect hop is checked again.
// 198.18.0.0/15 is NOT blocked: Clash/Surge/VPN "fake-ip" modes resolve every public host into it.
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const fail = msg => Object.assign(new Error(msg), { status: 400 });
const v4 = ip => ip.split('.').map(Number);
function blockedV4(ip) {
  const [a, b, c] = v4(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224 // this-net, private, loopback, multicast + reserved
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 169 && b === 254) // link-local (cloud metadata)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0); // IETF protocol assignments
}
// last 32 bits of an IPv6 address written as two hex groups → dotted IPv4
const tail4 = (h, l) => { const x = parseInt(h, 16), y = parseInt(l, 16); return `${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`; };
export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return blockedV4(ip);
  const s = String(ip).toLowerCase().replace(/^\[|\]$/g, '');
  if (!net.isIPv6(s)) return true;
  // IPv4 carried inside IPv6: mapped ::ffff:a.b.c.d, compatible ::a.b.c.d, NAT64 64:ff9b::a.b.c.d — judge the IPv4 part
  let m = s.match(/^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return blockedV4(m[1]);
  m = s.match(/^(?:::ffff:|::|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) return blockedV4(tail4(m[1], m[2]));
  m = s.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(:|$)/); // 6to4 embeds the IPv4 in groups 2–3
  if (m) return blockedV4(tail4(m[1], m[2]));
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^2001:db8:/.test(s);
}

export async function assertPublicUrl(raw, { lookup = dns.lookup } = {}) {
  let u;
  try { u = new URL(String(raw ?? '')); } catch { throw fail('URL không hợp lệ'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw fail('Chỉ tải được URL http(s)');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map(a => a.address);
  if (!addrs.length) throw fail(`Không phân giải được ${host}`);
  if (addrs.some(isBlockedIp)) throw fail('Không tải từ địa chỉ nội bộ hoặc localhost');
  return u;
}

// One HTTP(S) request whose socket may only connect to addresses that pass isBlockedIp (checked in the request's lookup,
// i.e. the IP actually dialled). Returns a WHATWG Response; no redirect following here.
function pinnedRequest(u, init, lookup) {
  const guardLookup = (hostname, opts, cb) => {
    lookup(hostname, { all: true, verbatim: true }).then(list => {
      const bad = list.find(a => isBlockedIp(a.address));
      if (!list.length || bad) return cb(fail('Không tải từ địa chỉ nội bộ hoặc localhost'));
      if (opts?.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    }, e => cb(e));
  };
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((ok, bad) => {
    const req = mod.request(u, { method: init.method || 'GET', headers: init.headers || {}, signal: init.signal, lookup: guardLookup }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return ok(new Response(null, { status: res.statusCode, headers: { location: res.headers.location || '' } })); }
      const parts = [];
      res.on('data', c => parts.push(c)); res.on('error', bad);
      res.on('end', () => {
        const nobody = res.statusCode === 204 || res.statusCode === 304;
        ok(new Response(nobody ? null : Buffer.concat(parts), { status: res.statusCode, headers: { 'content-type': res.headers['content-type'] || '' } }));
      });
    });
    req.on('error', bad); req.end();
  });
}

// fetch-like GET with redirects followed by hand so every hop is checked again.
export async function safeFetch(raw, init = {}, { maxRedirects = 5, lookup = dns.lookup, fetchImpl } = {}) {
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = await assertPublicUrl(url, { lookup });
    const r = fetchImpl ? await fetchImpl(u, { ...init, redirect: 'manual' }) : await pinnedRequest(u, init, lookup);
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { await r.body?.cancel(); url = new URL(r.headers.get('location'), u).href; continue; }
    return r;
  }
  throw fail('Quá nhiều lần chuyển hướng');
}
