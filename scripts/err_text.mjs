// Short, user-facing reason from a child process's output (stderr/log), for toasts and API errors.
// - A Python traceback → its LAST line ("ModuleNotFoundError: No module named 'numpy'"), not the first frame ("import numpy as np");
//   a missing module becomes a hint to re-run the installer.
// - Absolute machine paths are replaced by "…" (no user name / folder layout in API responses); URLs are kept.
// - Never the command line or a Node stack (callers log those to the server console instead).
// Drive paths (C:\…, C:/…) but not URL schemes ("https://": a letter before ':' and '//' after it), UNC (\\host\share),
// and POSIX home / temp folders (not the path part of a URL).
const PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])[^\s'"<>|]*|\\\\[^\s'"<>|]+|(?<![\w.:/])\/(?:Users|home|tmp|var|private|opt|mnt|Volumes)\/[^\s'"<>|]*/g;

export function scrubPaths(s) { return String(s ?? '').replace(PATH, '…'); }

export function shortErr(text, fallback = 'lỗi không rõ', max = 180) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !/^at\s/.test(l) && !/^(Traceback|File ")/.test(l) && !/^\^+$/.test(l) && !/^Node\.js v\d/.test(l) && !/^@@ /.test(l));
  const mod = /ModuleNotFoundError: No module named '([\w.]+)'/.exec(String(text ?? ''))?.[1];
  if (mod) return `Thiếu thư viện Python "${mod.split('.')[0]}" — chạy lại bộ cài (install.cmd / install.sh)`;
  // An exception line ("ValueError: …", "Error: …") or a line that starts with "LỖI"/"lỗi" — not any progress line mentioning "lỗi".
  const errLine = [...lines].reverse().find(l => /^[A-Z][A-Za-z]*(Error|Exception)\b|^Error\b/.test(l) || /^(LỖI|lỗi)(?=[\s:])|^error:/i.test(l));
  const pick = errLine || lines[lines.length - 1] || fallback;
  const out = scrubPaths(pick);
  return out.length > max ? out.slice(0, max - 1) + '…' : out;
}
