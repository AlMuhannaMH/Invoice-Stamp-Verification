exports.handler = async (event) => {    
  const id  = event.queryStringParameters.id || "";    
  if (!id) {
    return {
      statusCode: 400,
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type" 
      },
      body: "Missing PDF ID"
    };
  }
  
  const url = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${id}.pdf`;    
  try {    
    const res = await fetch(url);    
    if (!res.ok) {
      return { 
        statusCode: res.status, 
        headers: { 
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "Content-Type" 
        },
        body: `Error ${res.status}: Failed to fetch PDF` 
      };    
    }
    
    const buf = await res.arrayBuffer();    
    // Validate PDF content
    if (buf.byteLength < 100) {
      return {
        statusCode: 404,
        headers: { 
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*" 
        },
        body: "PDF not found or invalid"
      };
    }
    
    return {    
      statusCode: 200,    
      isBase64Encoded: true,    
      headers: { 
        "Content-Type": "application/pdf",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type" 
      },    
      body: Buffer.from(buf).toString("base64")    
    };    
  } catch(e) {    
    return {
      statusCode: 500, 
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*" 
      },
      body: "Server error: " + e.toString()
    };    
  }    
};