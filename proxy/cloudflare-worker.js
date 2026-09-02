/**
 * Proxy TTS per ElevenLabs (Cloudflare Worker).
 *
 * A cosa serve: tenere la chiave ElevenLabs fuori dal repository e fuori dal
 * browser. Il gioco NON usa questo endpoint: lo usa solo lo script offline
 * tools/generate-audio.mjs, in fase di generazione degli audio. Se il gioco
 * finisce su GitHub Pages, nel codice pubblico non c'e' nessuna chiave.
 *
 * Deploy (una volta sola):
 *   npm create cloudflare@latest tts-proxy
 *   # sostituisci src/index.js con questo file
 *   npx wrangler secret put ELEVENLABS_API_KEY
 *   npx wrangler secret put PROXY_TOKEN
 *   npx wrangler deploy
 *
 * Poi nel file .env locale del gioco:
 *   TTS_PROXY_URL=https://tts-proxy.<tuo-account>.workers.dev/tts
 *   TTS_PROXY_TOKEN=<lo stesso valore di PROXY_TOKEN>
 */

const VOICES = {
  en: '21m00Tcm4TlvDq8ikWAM',
  it: 'XB0fDUnXU5powFXDhCwa'
};

const MAX_TEXT_LENGTH = 400;   // le frasi del gioco sono corte: taglia gli abusi

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Usa POST' }, 405);
    }

    // Token condiviso: il worker e' pubblico, ma non deve diventare
    // un servizio TTS gratuito per chiunque lo trovi.
    const auth = request.headers.get('authorization') || '';
    if (!env.PROXY_TOKEN || auth !== `Bearer ${env.PROXY_TOKEN}`) {
      return json({ error: 'Non autorizzato' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON non valido' }, 400);
    }

    const text = String(body.text || '').trim();
    if (!text) return json({ error: 'Testo mancante' }, 400);
    if (text.length > MAX_TEXT_LENGTH) return json({ error: 'Testo troppo lungo' }, 413);

    const lang = body.lang === 'it' ? 'it' : 'en';
    const voiceId = body.voiceId || VOICES[lang];

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'content-type': 'application/json',
          accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 }
        })
      }
    );

    if (!upstream.ok) {
      return json({ error: 'ElevenLabs', status: upstream.status, detail: await upstream.text() }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', ...corsHeaders() }
    });
  }
};

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'POST, OPTIONS'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() }
  });
}
