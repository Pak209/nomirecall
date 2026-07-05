function normalizeInputUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function isTikTokHost(host = '') {
  const normalized = String(host || '').toLowerCase();
  return normalized === 'tiktok.com'
    || normalized.endsWith('.tiktok.com')
    || normalized === 'vm.tiktok.com'
    || normalized === 'vt.tiktok.com';
}

function isShortTikTokHost(host = '') {
  const normalized = String(host || '').toLowerCase();
  return normalized === 'vm.tiktok.com' || normalized === 'vt.tiktok.com';
}

function shouldResolveTikTokRedirect(url) {
  const parsed = normalizeInputUrl(url);
  if (!parsed || !isTikTokHost(parsed.hostname)) return false;
  if (isShortTikTokHost(parsed.hostname)) return true;
  if (extractTikTokVideoId(parsed.toString())) return false;
  return parsed.pathname.split('/').filter(Boolean).length > 0;
}

function isTikTokUrl(value = '') {
  const parsed = normalizeInputUrl(value);
  return Boolean(parsed && isTikTokHost(parsed.hostname));
}

function extractTikTokVideoId(value = '') {
  const text = String(value || '');
  const directMatch = text.match(/tiktok\.com\/@[^/\s?#]+\/video\/(\d+)/i);
  if (directMatch) return directMatch[1];

  const embedMatch = text.match(/(?:\/embed\/v2\/|\/player\/v1\/)(\d+)/i);
  if (embedMatch) return embedMatch[1];

  const canonicalIdMatch = text.match(/"embed_product_id"\s*:\s*"(\d+)"/i);
  if (canonicalIdMatch) return canonicalIdMatch[1];

  return null;
}

async function resolveTikTokRedirect(url, options = {}) {
  const parsed = normalizeInputUrl(url);
  if (!parsed || !shouldResolveTikTokRedirect(parsed.toString())) return parsed?.toString() || url;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (!fetchImpl) return parsed.toString();

  try {
    const response = await fetchImpl(parsed.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': options.userAgent || 'NomiTikTokEnricher/1.0',
      },
    });
    return response?.url || parsed.toString();
  } catch {
    try {
      const response = await fetchImpl(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': options.userAgent || 'NomiTikTokEnricher/1.0',
        },
      });
      return response?.url || parsed.toString();
    } catch {
      return parsed.toString();
    }
  }
}

function cleanTikTokCanonicalUrl(url) {
  const parsed = normalizeInputUrl(url);
  if (!parsed) return null;
  if (!isTikTokHost(parsed.hostname)) return null;
  const videoId = extractTikTokVideoId(parsed.toString());
  if (!videoId) return parsed.toString();

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const usernameIndex = pathParts.findIndex((part) => part.startsWith('@'));
  const username = usernameIndex >= 0 ? pathParts[usernameIndex] : null;
  if (!username) return parsed.toString();
  return `https://www.tiktok.com/${username}/video/${videoId}`;
}

function tiktokMemoryText(enriched = {}) {
  return [
    enriched.title ? `TikTok caption: ${enriched.title}` : null,
    enriched.author_name ? `Creator: ${enriched.author_name}` : null,
    enriched.canonicalUrl ? `TikTok URL: ${enriched.canonicalUrl}` : enriched.originalUrl ? `TikTok URL: ${enriched.originalUrl}` : null,
  ].filter(Boolean).join('\n');
}

function fallbackTikTokMetadata(url, options = {}) {
  const parsed = normalizeInputUrl(url);
  const originalUrl = parsed?.toString() || String(url || '').trim();
  const canonicalUrl = cleanTikTokCanonicalUrl(options.canonicalUrl || originalUrl) || options.canonicalUrl || originalUrl;
  const videoId = extractTikTokVideoId(canonicalUrl) || extractTikTokVideoId(originalUrl);

  return {
    source: 'tiktok',
    sourceType: 'video',
    originalUrl,
    canonicalUrl,
    platformVideoId: videoId,
    title: options.title || 'TikTok video',
    author_name: options.author_name,
    author_url: options.author_url,
    thumbnail_url: options.thumbnail_url,
    provider_name: 'TikTok',
    provider_url: 'https://www.tiktok.com',
    html: undefined,
    embedHtml: undefined,
    playerUrl: videoId ? `https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1&controls=1` : undefined,
    transcriptStatus: 'unavailable',
    unavailable: true,
    memoryText: tiktokMemoryText({
      title: options.title || 'TikTok video',
      author_name: options.author_name,
      canonicalUrl,
      originalUrl,
    }) || `TikTok URL: ${canonicalUrl || originalUrl}`,
  };
}

async function enrichTikTokUrl(url, options = {}) {
  const parsed = normalizeInputUrl(url);
  if (!parsed || !isTikTokHost(parsed.hostname)) {
    const error = new Error('Paste a valid TikTok URL.');
    error.code = 'invalid_tiktok_url';
    throw error;
  }

  const fetchImpl = options.fetchImpl || global.fetch;
  if (!fetchImpl) {
    const error = new Error('Fetch is not available in this runtime.');
    error.code = 'fetch_unavailable';
    throw error;
  }

  const originalUrl = parsed.toString();
  const resolvedUrl = await resolveTikTokRedirect(originalUrl, { ...options, fetchImpl });
  const canonicalUrl = cleanTikTokCanonicalUrl(resolvedUrl) || cleanTikTokCanonicalUrl(originalUrl) || resolvedUrl;
  const oEmbedUrl = new URL('https://www.tiktok.com/oembed');
  oEmbedUrl.searchParams.set('url', canonicalUrl);

  const response = await fetchImpl(oEmbedUrl.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': options.userAgent || 'NomiTikTokEnricher/1.0',
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const error = new Error(payload?.error || payload?.message || 'TikTok did not return metadata for this video.');
    error.code = 'tiktok_oembed_failed';
    error.status = response.status;
    throw error;
  }

  const videoId = extractTikTokVideoId(canonicalUrl)
    || extractTikTokVideoId(payload.html)
    || extractTikTokVideoId(payload.thumbnail_url);
  if (!videoId) {
    const error = new Error('TikTok metadata did not include a video ID.');
    error.code = 'tiktok_video_id_missing';
    throw error;
  }

  const finalCanonicalUrl = cleanTikTokCanonicalUrl(canonicalUrl) || canonicalUrl;
  return {
    source: 'tiktok',
    sourceType: 'video',
    originalUrl,
    canonicalUrl: finalCanonicalUrl,
    platformVideoId: videoId,
    title: payload.title || 'TikTok video',
    author_name: payload.author_name,
    author_url: payload.author_url,
    thumbnail_url: payload.thumbnail_url,
    provider_name: payload.provider_name || 'TikTok',
    provider_url: payload.provider_url || 'https://www.tiktok.com',
    html: payload.html,
    embedHtml: payload.html,
    playerUrl: `https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1&controls=1`,
    transcriptStatus: 'unavailable',
    memoryText: tiktokMemoryText({
      title: payload.title,
      author_name: payload.author_name,
      canonicalUrl: finalCanonicalUrl,
      originalUrl,
    }),
  };
}

module.exports = {
  cleanTikTokCanonicalUrl,
  enrichTikTokUrl,
  extractTikTokVideoId,
  isTikTokUrl,
  resolveTikTokRedirect,
  tiktokMemoryText,
  fallbackTikTokMetadata,
};
