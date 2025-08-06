// demo/functions/fetch-pdf.js    
// If you test locally with `netlify dev`, install node-fetch:    
//    npm install node-fetch@2    
const fetch = require("node-fetch");    
    
exports.handler = async (event) => {    
  const id  = event.queryStringParameters.id || "";    
  const url = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${id}.pdf`;    
    
  try {    
    const res = await fetch(url);    
    if (!res.ok) {    
      return {    
        statusCode: res.status,    
        body: `Failed to fetch PDF (status ${res.status})`    
      };    
    }    
    
    const arrayBuffer = await res.arrayBuffer();    
    const base64PDF   = Buffer.from(arrayBuffer).toString("base64");    
    
    return {    
      statusCode: 200,    
      isBase64Encoded: true,    
      headers: {    
        "Content-Type": "application/pdf",    
        "Access-Control-Allow-Origin": "*"     // <– this allows your browser to receive it    
      },    
      body: base64PDF    
    };    
  }    
  catch (err) {    
    return {    
      statusCode: 500,    
      body: err.toString()    
    };    
  }    
};    