exports.handler = async (event) => {    
  const id  = event.queryStringParameters.id || ""    
  const url = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${id}.pdf`    
  try {    
    const res = await fetch(url)    
    if (!res.ok) return { statusCode: res.status, body: `Error ${res.status}` }    
    const buf = await res.arrayBuffer()    
    return {    
      statusCode: 200,    
      isBase64Encoded: true,    
      headers: { "Content-Type": "application/pdf","Access-Control-Allow-Origin":"*" },    
      body: Buffer.from(buf).toString("base64")    
    }    
  } catch(e) {    
    return { statusCode:500, body: e.toString() }    
  }    
}    