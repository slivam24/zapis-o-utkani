// Prostředník pro načítání stránek z chess-results.com v prohlížeči.
// chess-results neposílá hlavičku Access-Control-Allow-Origin, takže aplikace běžící na jiné adrese
// si jeho stránku stáhnout nesmí. Tenhle worker ji stáhne za ni a hlavičku doplní.
//
// Nasazení je popsané v worker/README.md. Adresu pak zadáš v aplikaci v Nastavení načítání jako:
//     https://tvuj-worker.workers.dev/?url={url}

const ALLOWED_HOST = /(^|\.)chess-results\.com$/i;

// Odkud smí aplikace worker volat. Doplň si vlastní adresy.
const ALLOWED_ORIGINS = [
  'https://slivam24.github.io',
  'http://localhost:8080',
];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') ?? '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'GET') return new Response('Jen GET', { status: 405, headers: cors(origin) });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Chybí parametr url', { status: 400, headers: cors(origin) });

    let dest;
    try {
      dest = new URL(target);
    } catch {
      return new Response('Neplatná adresa', { status: 400, headers: cors(origin) });
    }
    // povolí se jen chess-results, aby worker nešel zneužít jako obecná proxy
    if (dest.protocol !== 'https:' || !ALLOWED_HOST.test(dest.hostname)) {
      return new Response('Povolené je jen https://chess-results.com', { status: 403, headers: cors(origin) });
    }

    const res = await fetch(dest.toString(), {
      headers: {
        'User-Agent': 'zapis-o-utkani/1.0 (+https://github.com/slivam24/zapis-o-utkani)',
        'Accept-Language': 'cs,en;q=0.7',
      },
      redirect: 'follow',
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        ...cors(origin),
        'Content-Type': res.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=900',
      },
    });
  },
};
