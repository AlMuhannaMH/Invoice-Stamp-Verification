const https = require('https');

const PDF_HOST = 'arlasfatest.danyaltd.com';
const PDF_PORT = 14443;
const ID_PATTERN = /^966\d{5}$/;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
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
      timeout: 20000,
      headers: {
        'Accept': 'application/pdf',
        'User-Agent': 'Arla-Invoice-Stamp-Checker/4.0'
      }
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { message: 'Method not allowed' });
  }

  const customerCode = String(event.queryStringParameters?.id || '').trim();
  if (!ID_PATTERN.test(customerCode)) {
    return json(400, { message: 'A valid 8-digit customer code starting with 966 is required.' });
  }

  try {
    const pdf = await downloadPdf(customerCode);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${customerCode}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      },
      body: pdf.toString('base64')
    };
  } catch (error) {
    console.error('fetch-pdf failed', { customerCode, message: error.message });
    return json(502, {
      message: `Unable to retrieve the reference PDF for customer ${customerCode}.`,
      detail: error.message
    });
  }
};
