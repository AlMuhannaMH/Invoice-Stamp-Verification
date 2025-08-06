// demo/functions/fetch-pdf.js    
    
exports.handler = async (event) => {    
  const id  = event.queryStringParameters.id || "";    
  const url = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${id}.pdf`;    
    
  try {    
    // Use the built-in fetch—no need to import anything    
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
        "Access-Control-Allow-Origin": "*"    // allow browser to read it    
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