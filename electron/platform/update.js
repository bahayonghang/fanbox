'use strict';

const DEFAULT_UPSTREAM_REPO = 'alchaincyf/fanbox';
const DEFAULT_RELEASE_REPO = 'bahayonghang/fanbox';
const USER_AGENT = 'fanbox-app';

function cmpVer(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function versionParts(v) {
  const m = String(v || '').match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!m) return [0, 0, 0];
  return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0];
}

function versionText(tag) {
  return String(tag || '').replace(/^v/i, '');
}

function normalizeRepo(value, fallback, opts = {}) {
  if (value === undefined || value === null) return fallback;
  let s = String(value).trim();
  if (!s) return opts.emptyDisables ? null : fallback;
  s = s
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/releases\/?.*$/i, '')
    .replace(/^\/+|\/+$/g, '');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) ? s : fallback;
}

function repoFromEnv(env = {}, key, fallback, opts = {}) {
  return normalizeRepo(env[key], fallback, opts);
}

function apiUrl(repo) {
  return `https://api.github.com/repos/${repo}/releases/latest`;
}

function releasePage(repo) {
  return `https://github.com/${repo}/releases/latest`;
}

function fetcher(opts = {}) {
  if (typeof opts.fetch === 'function') return opts.fetch;
  if (opts.net && typeof opts.net.fetch === 'function') return opts.net.fetch.bind(opts.net);
  throw new Error('missing fetch');
}

async function fetchLatestFromApi(repo, opts = {}) {
  const runFetch = fetcher(opts);
  const res = await runFetch(apiUrl(repo), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
  });
  if (!res || !res.ok) return null;
  const rel = await res.json();
  if (!rel || !rel.tag_name) return null;
  return {
    repo,
    tag: rel.tag_name,
    version: versionText(rel.tag_name),
    url: rel.html_url || releasePage(repo),
    assets: Array.isArray(rel.assets) ? rel.assets : [],
  };
}

async function fetchLatestFromRedirect(repo, opts = {}) {
  const runFetch = fetcher(opts);
  const res = await runFetch(releasePage(repo), { headers: { 'User-Agent': USER_AGENT } });
  const m = String(res && res.url || '').match(/\/releases\/tag\/([^/?#]+)/);
  if (!m) return null;
  const tag = decodeURIComponent(m[1]);
  return {
    repo,
    tag,
    version: versionText(tag),
    url: res.url,
    assets: null,
  };
}

async function fetchLatestGithubRelease(repo, opts = {}) {
  try {
    const api = await fetchLatestFromApi(repo, opts);
    if (api) return api;
  } catch { /* fall back to releases/latest redirect */ }
  try {
    return await fetchLatestFromRedirect(repo, opts);
  } catch {
    return null;
  }
}

function selectWindowsAsset(assets) {
  if (!Array.isArray(assets)) return null;
  const candidates = assets
    .map((asset, index) => {
      const name = String(asset && asset.name || '');
      const url = String(asset && asset.browser_download_url || '');
      const ext = (name || url).toLowerCase().match(/\.(exe|zip)(?:$|[?#])/);
      if (!ext || !url) return null;
      const score = ext[1] === 'exe' ? 2 : 1;
      return { asset, index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0] ? candidates[0].asset : null;
}

async function checkUpstream(opts = {}) {
  const repo = repoFromEnv(opts.env || process.env, 'FANBOX_UPSTREAM_REPO', DEFAULT_UPSTREAM_REPO);
  const latest = await fetchLatestGithubRelease(repo, opts);
  if (!latest) return null;
  return { kind: 'source', repo, tag: latest.tag, version: latest.version, url: latest.url };
}

async function checkRelease(opts = {}) {
  const repo = repoFromEnv(opts.env || process.env, 'FANBOX_RELEASE_REPO', DEFAULT_RELEASE_REPO, { emptyDisables: true });
  if (!repo) return null;
  let latest = null;
  try { latest = await fetchLatestFromApi(repo, opts); } catch { latest = null; }
  if (!latest) return null;
  const asset = selectWindowsAsset(latest.assets);
  if (!asset) return null;
  return {
    kind: 'release',
    repo,
    tag: latest.tag,
    version: latest.version,
    url: asset.browser_download_url,
    assetName: asset.name || null,
    pageUrl: latest.url,
  };
}

async function checkUpdates(opts = {}) {
  const platform = opts.platform || process.platform;
  const currentVersion = opts.currentVersion || '0.0.0';
  const upstreamPromise = checkUpstream(opts);
  const releasePromise = platform === 'win32' ? checkRelease(opts) : Promise.resolve(null);
  const [latestUpstream, latestRelease] = await Promise.all([upstreamPromise, releasePromise]);
  const upstream = latestUpstream && cmpVer(latestUpstream.tag, currentVersion) > 0 ? latestUpstream : null;
  const release = latestRelease && cmpVer(latestRelease.tag, currentVersion) > 0 ? latestRelease : null;
  const primary = platform === 'win32' ? (release || upstream) : upstream;
  return {
    checked: !!latestUpstream || !!latestRelease,
    latestUpstream,
    latestRelease,
    upstream,
    release,
    primary,
  };
}

module.exports = {
  checkUpstream,
  checkRelease,
  checkUpdates,
  cmpVer,
  _test: {
    normalizeRepo,
    repoFromEnv,
    apiUrl,
    releasePage,
    selectWindowsAsset,
    versionParts,
  },
};
