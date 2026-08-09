import {
  SITE_URL,
  SOCIAL_DESCRIPTION,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_URL,
  SOCIAL_TITLE,
} from "./social";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function gateResponse(siteKey: string): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const safeSiteKey = escapeHtml(siteKey);
  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="description" content="${escapeHtml(SOCIAL_DESCRIPTION)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="id_ID">
  <meta property="og:site_name" content="Juara Merdeka">
  <meta property="og:url" content="${SITE_URL}">
  <meta property="og:title" content="${escapeHtml(SOCIAL_TITLE)}">
  <meta property="og:description" content="${escapeHtml(SOCIAL_DESCRIPTION)}">
  <meta property="og:image" content="${SOCIAL_IMAGE_URL}">
  <meta property="og:image:secure_url" content="${SOCIAL_IMAGE_URL}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(SOCIAL_IMAGE_ALT)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(SOCIAL_TITLE)}">
  <meta name="twitter:description" content="${escapeHtml(SOCIAL_DESCRIPTION)}">
  <meta name="twitter:image" content="${SOCIAL_IMAGE_URL}">
  <meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_IMAGE_ALT)}">
  <link rel="canonical" href="${SITE_URL}">
  <title>${escapeHtml(SOCIAL_TITLE)}</title>
  <style nonce="${nonce}">
    :root { color-scheme: light; --paper:#e8e7df; --ink:#11110f; --fade:#696862; }
    * { box-sizing:border-box; }
    html { min-height:100%; background:#2b2b29; }
    body { min-height:100vh; margin:0; display:grid; place-items:center; padding:20px; color:var(--ink); background:radial-gradient(circle at 20% 20%,#454541 0 1px,transparent 1.5px) 0 0/8px 8px,#2b2b29; font-family:Georgia,"Times New Roman",serif; }
    main { position:relative; width:min(620px,100%); padding:clamp(26px,7vw,58px); background:var(--paper); border:1px solid #050505; box-shadow:11px 13px 0 #111; text-align:center; overflow:hidden; }
    main::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:.22; background:repeating-linear-gradient(92deg,transparent 0 13px,rgba(0,0,0,.12) 13.5px 14px); mix-blend-mode:multiply; }
    .kicker { position:relative; z-index:1; margin:0 0 7px; font:700 13px/1.1 Arial,sans-serif; letter-spacing:.2em; }
    h1 { position:relative; z-index:1; margin:0; padding:12px 0 9px; border-block:5px double var(--ink); font:900 clamp(43px,12vw,83px)/.82 Impact,"Arial Narrow",sans-serif; letter-spacing:-.045em; text-transform:uppercase; }
    h2 { position:relative; z-index:1; margin:24px 0 8px; font:700 clamp(21px,5vw,31px)/1 Georgia,serif; text-transform:uppercase; }
    p { position:relative; z-index:1; max-width:42ch; margin:0 auto 22px; color:#33332f; font-size:16px; line-height:1.48; }
    #turnstile-host { position:relative; z-index:2; min-height:65px; display:flex; justify-content:center; }
    #status { min-height:1.5em; margin:14px auto 0; color:var(--fade); font:700 12px/1.4 Arial,sans-serif; letter-spacing:.08em; text-transform:uppercase; }
    .rule { position:relative; z-index:1; margin-top:25px; padding-top:10px; border-top:1px solid var(--ink); font:700 11px/1.4 Arial,sans-serif; letter-spacing:.12em; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">SURAT KABAR PAGI • JAWA TENGAH</p>
    <h1>Juara<br>Merdeka</h1>
    <h2>Pemeriksaan Pembaca</h2>
    <p>Sebelum lembar berita dibuka, harap selesaikan pemeriksaan singkat berikut. Langkah ini melindungi penerbitan dari pembacaan otomatis yang berlebihan.</p>
    <div id="turnstile-host" data-action="turnstile-spin-v1"></div>
    <p id="status" role="status" aria-live="polite">Menyiapkan pemeriksaan…</p>
    <div class="rule">DIHIMPUN MESIN REDAKSI • TERBIT PUKUL 07.00 WITA</div>
  </main>
  <script nonce="${nonce}">
    const status = document.querySelector('#status');
    async function submitToken(token) {
      status.textContent = 'Memeriksa tanda pembaca…';
      try {
        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error('Pemeriksaan tidak diterima.');
        status.textContent = 'Pemeriksaan selesai. Membuka halaman…';
        window.location.reload();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Pemeriksaan gagal.';
        if (typeof window.turnstile?.reset === 'function') window.turnstile.reset();
      }
    }
    window.juaraTurnstileReady = () => {
      status.textContent = 'Menunggu pemeriksaan pembaca.';
      window.turnstile.render('#turnstile-host', {
        sitekey: '${safeSiteKey}',
        theme: 'light',
        size: 'flexible',
        action: 'turnstile-spin-v1',
        callback: submitToken,
        'error-callback': () => { status.textContent = 'Pemeriksaan gagal dimuat. Muat ulang halaman.'; return true; },
        'expired-callback': () => { status.textContent = 'Tanda pemeriksaan kedaluwarsa. Silakan ulangi.'; },
      });
    };
  </script>
  <script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=juaraTurnstileReady" async defer></script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": [
        "default-src 'none'",
        `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
        `style-src 'nonce-${nonce}'`,
        "frame-src https://challenges.cloudflare.com",
        "connect-src 'self' https://challenges.cloudflare.com",
        "img-src data:",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'none'",
      ].join("; "),
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}
