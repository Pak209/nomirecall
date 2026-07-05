const assert = require('node:assert/strict');
const test = require('node:test');

const {
  cleanTikTokCanonicalUrl,
  enrichTikTokUrl,
  extractTikTokVideoId,
  fallbackTikTokMetadata,
  isTikTokUrl,
} = require('../src/tiktok');

test('detects supported TikTok hosts', () => {
  assert.equal(isTikTokUrl('https://www.tiktok.com/@nomi/video/1234567890123456789'), true);
  assert.equal(isTikTokUrl('vm.tiktok.com/ZMabc123'), true);
  assert.equal(isTikTokUrl('https://vt.tiktok.com/ZMabc123/'), true);
  assert.equal(isTikTokUrl('https://example.com/@nomi/video/123'), false);
});

test('extracts TikTok video IDs from canonical, player, and embed HTML values', () => {
  assert.equal(extractTikTokVideoId('https://www.tiktok.com/@nomi/video/1234567890123456789'), '1234567890123456789');
  assert.equal(extractTikTokVideoId('https://www.tiktok.com/player/v1/1234567890123456789?controls=1'), '1234567890123456789');
  assert.equal(extractTikTokVideoId('<blockquote cite="https://www.tiktok.com/@nomi/video/1234567890123456789"></blockquote>'), '1234567890123456789');
});

test('cleans canonical TikTok URLs without storing tracking query strings', () => {
  assert.equal(
    cleanTikTokCanonicalUrl('https://www.tiktok.com/@nomi/video/1234567890123456789?is_from_webapp=1&sender_device=pc'),
    'https://www.tiktok.com/@nomi/video/1234567890123456789',
  );
});

test('enrichTikTokUrl resolves short and mobile share links and creates official player URL', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (options.method === 'HEAD') {
      return {
        ok: true,
        url: 'https://www.tiktok.com/@nomi/video/1234567890123456789?share_app_id=1233',
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          title: 'Useful memory idea',
          author_name: 'Nomi Creator',
          author_url: 'https://www.tiktok.com/@nomi',
          thumbnail_url: 'https://p16-sign.tiktokcdn-us.com/example.jpeg',
          provider_name: 'TikTok',
          provider_url: 'https://www.tiktok.com',
          html: '<blockquote cite="https://www.tiktok.com/@nomi/video/1234567890123456789"></blockquote>',
        };
      },
    };
  };

  const result = await enrichTikTokUrl('https://www.tiktok.com/t/ZMabc123/', { fetchImpl });

  assert.equal(result.platformVideoId, '1234567890123456789');
  assert.equal(result.canonicalUrl, 'https://www.tiktok.com/@nomi/video/1234567890123456789');
  assert.equal(result.playerUrl, 'https://www.tiktok.com/player/v1/1234567890123456789?music_info=1&description=1&controls=1');
  assert.match(result.memoryText, /Useful memory idea/);
  assert.equal(calls[0].method, 'HEAD');
  assert.match(calls[1].url, /^https:\/\/www\.tiktok\.com\/oembed\?/);
});

test('fallback TikTok metadata keeps save path available without video rehosting', () => {
  const fallback = fallbackTikTokMetadata('https://www.tiktok.com/@nomi/video/1234567890123456789?share=1');
  assert.equal(fallback.source, 'tiktok');
  assert.equal(fallback.sourceType, 'video');
  assert.equal(fallback.platformVideoId, '1234567890123456789');
  assert.equal(fallback.playerUrl, 'https://www.tiktok.com/player/v1/1234567890123456789?music_info=1&description=1&controls=1');
  assert.equal(fallback.unavailable, true);
  assert.equal(fallback.embedHtml, undefined);
});
