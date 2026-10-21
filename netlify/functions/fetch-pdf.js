// netlify/functions/fetch-pdf.js
const https = require('https');

const PDF_HOST = 'arlasfatest.danyaltd.com';
const PDF_PORT = 14443;
const ID_PATTERN = /^966\d{5}$/;
const UPSTREAM_TIMEOUT_MS = 8000;

// FIX 2 — CORS allowlist. Replace these placeholders with your real URLs.
const ALLOWED_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
  'https://invoice-stamp-verification.netlify.app',
//  'https://yourdomain.com',
//  'https://www.yourdomain.com',
];
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/deploy-preview-\d+--invoice-stamp-verification\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--invoice-stamp-verification\.netlify\.app$/,
];

function resolveCorsOrigin(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (!origin) return '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin))) return origin;
  return '';
}

function corsHeaders(event) {
  const origin = resolveCorsOrigin(event);
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
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
        'User-Agent': 'Arla-Invoice-Stamp-Checker/4.1',
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        const contentType = String(response.headers['content-type'] || '').toLowerCase();

        // FIX: distinguish 404 (not found) from other upstream errors.
        if (response.statusCode === 404) {
          const e = new Error('PDF not found');
          e.code = 'NOT_FOUND';
          return reject(e);
        }
        if (response.statusCode !== 200) {
          const e = new Error(`Source returned HTTP ${response.statusCode}`);
          e.code = 'UPSTREAM_ERROR';
          e.upstreamStatus = response.statusCode;
          return reject(e);
        }
        if (!body.length) {
          const e = new Error('Source returned an empty response');
          e.code = 'EMPTY';
          return reject(e);
        }
        const looksLikePdf = body.subarray(0, 5).toString('ascii') === '%PDF-';
        if (!looksLikePdf && !contentType.includes('application/pdf')) {
          const e = new Error(`Unexpected content type: ${contentType || 'unknown'}`);
          e.code = 'BAD_CONTENT';
          return reject(e);
        }
        resolve(body);
      });
    });

    // FIX: distinguish timeout from network errors.
    request.on('timeout', () => {
      const e = new Error('PDF source request timed out');
      e.code = 'TIMEOUT';
      request.destroy(e);
    });
    request.on('error', (e) => {
      if (!e.code) e.code = 'NETWORK';
      reject(e);
    });
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
        'Cache-Control': 'private, max-age=60',
        ...corsHeaders(event),
      },
      body: pdf.toString('base64'),
    };
  } catch (error) {
    console.error('fetch-pdf failed', { customerCode, code: error.code, message: error.message });

    // FIX: map each error type to a specific HTTP status so the frontend
    // can show the right message ("PDF Not Found" vs "Server Unavailable").
    if (error.code === 'NOT_FOUND') {
      return json(event, 404, {
        status: 'not_found',
        message: `No PDF exists for customer ${customerCode}.`,
      });
    }
    if (error.code === 'TIMEOUT') {
      return json(event, 504, {
        status: 'timeout',
        message: 'PDF server did not respond in time.',
      });
    }
    return json(event, 502, {
      status: 'error',
      message: 'PDF server unavailable. Please try again.',
      detail: error.message,
    });
  }
};