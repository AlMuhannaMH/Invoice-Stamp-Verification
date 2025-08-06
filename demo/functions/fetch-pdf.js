// demo/functions/fetch-pdf.js    
const fetch = require("node-fetch"); // (Netlify supports fetch natively)    
    
exports.handler = async (event) => {    
  const id  = event.queryStringParameters.id;    
  const url = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${id}.pdf`;    
    
  try {    
    const res = await fetch(url);    
    if (!res.ok) throw new Error(`Failed to fetch PDF (status ${res.status})`);    
    
    const buf = await res.arrayBuffer();    
    return {    
      statusCode: 200,    
      headers: {    
        "Content-Type": "application/pdf",    
        "Access-Control-Allow-Origin": "*"    
      },    
      isBase64Encoded: true,    
      body: Buffer.from(buf).toString("base64")    
    };    
  } catch (err) {    
    return { statusCode: 500, body: err.toString() };    
  }    
};    