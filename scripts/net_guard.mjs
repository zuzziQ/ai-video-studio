// Outbound fetch guard for URLs that come from the browser or from search results (b-roll stock download).
// Only http(s) to public addresses: loopback, private, link-local, CGNAT, multicast and reserved ranges are refused
// after DNS resolution, and every redirect hop is checked again (a public host could redirect to 127.0.0.1).
import dns from 'node:dns/promises';
import net from 'node:net';

const v4 = ip => ip.split('.').map(Number);
function blockedV4(ip) {
  const [a, b] = v4(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224 // this-net, private, loopback, multicast + reserved
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 169 && b === 254) // link-local (cloud metadata)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && v4(ip)[2] === 0) // IETF protocol assignments
    || (a === 198 && (b === 18 || b === 19)); // benchmarking
}
export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return blockedV4(ip);
  if (!net.isIPv6(ip)) return true;
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blockedV4(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) { // ::ffff:7f00:1 form
    const [h, l] = s.slice(7).split(':').map(x => parseInt(x, 16));
    return blockedV4(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`);
  }
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^64:ff9b:/.test(s) || /^2001:db8:/.test(s);
}

export async function assertPublicUrl(raw, { lookup = dns.lookup } = {}) {
  let u;
  try { u = new URL(String(raw ?? '')); } catch { throw Object.assign(new Error('URL không hợp lệ'), { status: 400 }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Object.assign(new Error('Chỉ tải được URL http(s)'), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map(a => a.address);
  if (!addrs.length) throw Object.assign(new Error(`Không phân giải được ${host}`), { status: 400 });
  if (addrs.some(isBlockedIp)) throw Object.assign(new Error('Không tải từ địa chỉ nội bộ hoặc localhost'), { status: 400 });
  return u;
}

// fetch() with redirects followed by hand so every hop goes through assertPublicUrl.
export async function safeFetch(raw, init = {}, { maxRedirects = 5, lookup, fetchImpl = fetch } = {}) {
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = await assertPublicUrl(url, { lookup });
    const r = await fetchImpl(u, { ...init, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), u).href; continue; }
    return r;
  }
  throw Object.assign(new Error('Quá nhiều lần chuyển hướng'), { status: 400 });
}
