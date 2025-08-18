// Enhanced fetch-pdf.js with improved error handling and caching

exports.handler = async (event, context) => {
  // Set CORS headers for all responses
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300" // Cache for 5 minutes
  };

  // Handle preflight OPTIONS requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: "Method not allowed",
        message: "Only GET requests are supported"
      })
    };
  }

  try {
    // Extract and validate the ID parameter
    const id = event.queryStringParameters?.id?.trim();
    
    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: "Missing parameter",
          message: "PDF ID is required"
        })
      };
    }

    // Validate ID format (assuming numeric IDs, adjust pattern as needed)
    const idPattern = /^[a-zA-Z0-9_-]+$/;
    if (!idPattern.test(id) || id.length > 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: "Invalid ID format",
          message: "PDF ID contains invalid characters or is too long"
        })
      };
    }

    // Construct the PDF URL
    const baseUrl = "https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures";
    const pdfUrl = `${baseUrl}/${id}.pdf`;

    console.log(`Fetching PDF for ID: ${id}`); // For debugging

    // Fetch the PDF with timeout and proper error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(pdfUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Netlify-Function-PDF-Fetcher/1.0',
        'Accept': 'application/pdf'
      }
    });

    clearTimeout(timeoutId);

    // Handle different HTTP status codes with specific messages
    if (!response.ok) {
      let errorMessage;
      let errorType;

      switch (response.status) {
        case 404:
          errorType = "PDF not found";
          errorMessage = `No PDF file exists for ID: ${id}`;
          break;
        case 403:
          errorType = "Access forbidden";
          errorMessage = "Access to the PDF file is not allowed";
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          errorType = "Server error";
          errorMessage = "The PDF server is currently unavailable. Please try again later.";
          break;
        default:
          errorType = "Request failed";
          errorMessage = `Failed to fetch PDF: ${response.statusText}`;
      }

      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: errorType,
          message: errorMessage,
          statusCode: response.status
        })
      };
    }

    // Verify content type
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/pdf')) {
      console.warn(`Unexpected content type: ${contentType}`);
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({ 
          error: "Invalid content type",
          message: "The retrieved file is not a valid PDF"
        })
      };
    }

    // Get the PDF data as array buffer
    const pdfBuffer = await response.arrayBuffer();
    
    // Validate that we actually received data
    if (pdfBuffer.byteLength === 0) {
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({ 
          error: "Empty file",
          message: "The PDF file is empty or corrupted"
        })
      };
    }

    // Check file size (optional: set a reasonable limit)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (pdfBuffer.byteLength > maxFileSize) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ 
          error: "File too large",
          message: "The PDF file is too large to process"
        })
      };
    }

    console.log(`Successfully fetched PDF for ID: ${id}, size: ${pdfBuffer.byteLength} bytes`);

    // Return the PDF data as base64
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600" // Cache successful responses for 1 hour
      },
      body: Buffer.from(pdfBuffer).toString("base64")
    };

  } catch (error) {
    // Log the error for debugging (this will appear in Netlify function logs)
    console.error('PDF fetch error:', {
      message: error.message,
      stack: error.stack,
      id: event.queryStringParameters?.id
    });

    // Handle specific error types
    if (error.name === 'AbortError') {
      return {
        statusCode: 408,
        headers,
        body: JSON.stringify({ 
          error: "Request timeout",
          message: "The request to fetch the PDF timed out. Please try again."
        })
      };
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ 
          error: "Service unavailable",
          message: "Unable to connect to the PDF server. Please try again later."
        })
      };
    }

    // Generic error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Internal server error",
        message: "An unexpected error occurred while fetching the PDF. Please try again."
      })
    };
  }
};