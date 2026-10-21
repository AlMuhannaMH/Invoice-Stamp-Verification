// netlify/functions/fetch-pdf.js
const https = require('https');

const PDF_HOST = 'arlasfatest.danyaltd.com';
const PDF_PORT = 14443;
const ID_PATTERN = /^966\d{5}$/;

// FIX 4 — must finish inside Netlify's default 10 s function limit.
// (Raise this only if you upgrade the Netlify plan to a 26 s timeout.)
const UPSTREAM_TIMEOUT_MS = 8000;

// FIX 2 — CORS allowlist. Replace these placeholders with your real URLs.
// - If you deploy to a custom domain, replace yourdomain.com
// - If your site name is not "your-site-name", replace both places.
// - Localhost entries are for `netlify dev` testing.
const ALLOWED_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
  'https://invoice-stamp-verification.netlify.app',
//  'https://yourdomain.com',
//  'https://www.yourdomain.com',
];

// Netlify auto-generated deploy-preview and branch-deploy URLs.
// The <site-name> segment must match the name you use in Netlify.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/deploy-preview-\d+--invoice-stamp-verification\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--invoice-stamp-verification\.netlify\.app$/,
];

function resolveCorsOrigin(event) {
  const origin =
    (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (!origin) return '';                                  // same-origin: no header needed
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin))) return origin;
  return '';                                               // not allowed: browser blocks the response
}

function corsHeaders(event) {
  const origin = resolveCorsOrigin(event);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
  };
}

function json(event, statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(event),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function downloadPdf(customerCode) {
  return new Promise((resolve, reject) => {
    const path = `/CustomerSignature/signatures/${encodeURIComponent(customerCode)}.pdf`;
    const request = https.get({
      hostname: PDF_HOST,
      port: PDF_PORT,
      path,
      method: 'GET',
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: {
        'Accept': 'application/pdf',
        'User-Agent': 'Arla-Invoice-Stamp-Checker/4.0',
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        const contentType = String(response.headers['content-type'] || '').toLowerCase();

        if (response.statusCode !== 200) {
          return reject(new Error(`Source returned HTTP ${response.statusCode}`));
        }
        if (!body.length) {
          return reject(new Error('Source returned an empty response'));
        }
        const looksLikePdf = body.subarray(0, 5).toString('ascii') === '%PDF-';
        if (!looksLikePdf && !contentType.includes('application/pdf')) {
          return reject(new Error(`Unexpected content type: ${contentType || 'unknown'}`));
        }
        resolve(body);
      });
    });

    request.on('timeout', () => request.destroy(new Error('PDF source request timed out')));
    request.on('error', reject);
  });
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...corsHeaders(event),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return json(event, 405, { message: 'Method not allowed' });
  }

  const customerCode = String(event.queryStringParameters?.id || '').trim();
  if (!ID_PATTERN.test(customerCode)) {
    return json(event, 400, {
      message: 'A valid 8-digit customer code starting with 966 is required.',
    });
  }

  try {
    const pdf = await downloadPdf(customerCode);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${customerCode}.pdf"`,
        // FIX 8 — never let shared caches hold a personal signature PDF.
        'Cache-Control': 'private, max-age=60',
        ...corsHeaders(event),
      },
      body: pdf.toString('base64'),
    };
  } catch (error) {
    console.error('fetch-pdf failed', { customerCode, message: error.message });
    return json(event, 502, {
      message: `Unable to retrieve the reference PDF for customer ${customerCode}.`,
      detail: error.message,
    });
  }
};