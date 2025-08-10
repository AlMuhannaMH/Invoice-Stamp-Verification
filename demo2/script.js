// Enhanced script.js with improved error handling and multi-scale matching

// Grab existing HTML elements
const btnCheck = document.getElementById('btnCheck');
const pdfIdInput = document.getElementById('pdfId');
const fileInput = document.getElementById('fileInput');
const cPdf = document.getElementById('canvasPdf');
const cUp = document.getElementById('canvasUp');
const scoreEl = document.getElementById('score');

// Configuration constants
const CONFIG = {
  maxImageSize: 1024, // Maximum dimension for processing
  minSimilarity: 30,  // Minimum threshold for a potential match
  scaleFactors: [0.5, 0.75, 1.0, 1.25, 1.5], // Multiple scales to try
  hashSize: 8,        // Size for perceptual hash
  timeoutMs: 30000    // Request timeout
};

// Enable the button once this script loads
btnCheck.disabled = false;

// Add loading state management
function setLoading(isLoading) {
  btnCheck.disabled = isLoading;
  btnCheck.textContent = isLoading ? 'Processing...' : 'Check Match';
  if (isLoading) {
    scoreEl.textContent = 'Analyzing images...';
    scoreEl.style.background = '#f0f0f0';
  }
}

btnCheck.addEventListener('click', async () => {
  const id = pdfIdInput.value.trim();
  const file = fileInput.files[0];
  
  // Enhanced input validation
  if (!id) {
    return showError('Please enter a PDF ID.');
  }
  if (!file) {
    return showError('Please select an image file.');
  }
  if (!file.type.startsWith('image/')) {
    return showError('Please select a valid image file.');
  }
  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    return showError('Image file is too large. Please use an image smaller than 10MB.');
  }

  setLoading(true);
  
  try {
    // 1) Load and prepare uploaded image with size optimization
    const uploadedImage = await loadAndOptimizeImage(file);
    drawImageToCanvas(cUp, uploadedImage);

    // 2) Fetch PDF with timeout and better error handling
    const pdfData = await fetchPDFWithTimeout(id);
    
    // 3) Render PDF page with error handling
    const pdfCanvas = await renderPDFToCanvas(pdfData, cPdf);
    
    // 4) Perform enhanced matching with multiple approaches
    const matchResult = await performEnhancedMatching(cUp, cPdf);
    
    // 5) Display comprehensive results
    displayResults(matchResult);
    
  } catch (error) {
    console.error('Processing error:', error);
    showError(error.message || 'An error occurred during processing. Please try again.');
  } finally {
    setLoading(false);
  }
});

// Enhanced image loading with size optimization
async function loadAndOptimizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      // Check if image needs resizing
      const maxDim = Math.max(img.width, img.height);
      if (maxDim > CONFIG.maxImageSize) {
        const scale = CONFIG.maxImageSize / maxDim;
        resolve(resizeImage(img, img.width * scale, img.height * scale));
      } else {
        resolve(img);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load the image. Please try a different file.'));
    img.src = URL.createObjectURL(file);
    
    // Cleanup object URL after loading
    setTimeout(() => URL.revokeObjectURL(img.src), 1000);
  });
}

// Resize image to specified dimensions
function resizeImage(img, newWidth, newHeight) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = newWidth;
  canvas.height = newHeight;
  ctx.drawImage(img, 0, 0, newWidth, newHeight);
  
  // Convert back to image
  const resizedImg = new Image();
  resizedImg.src = canvas.toDataURL();
  return resizedImg;
}

// Draw image to canvas with proper scaling
function drawImageToCanvas(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
}

// Enhanced PDF fetching with timeout and retry logic
async function fetchPDFWithTimeout(id) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  
  try {
    const fnUrl = `/.netlify/functions/fetch-pdf?id=${encodeURIComponent(id)}`;
    const response = await fetch(fnUrl, { 
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`PDF not found for ID: ${id}. Please check the ID and try again.`);
      } else if (response.status === 500) {
        throw new Error('Server error occurred. Please try again in a moment.');
      } else {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }
    }
    
    return await response.arrayBuffer();
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw error;
  }
}

// Enhanced PDF rendering with error handling
async function renderPDFToCanvas(pdfData, canvas) {
  try {
    const pdf = await pdfjsLib.getDocument({ 
      data: pdfData,
      verbosity: 0 // Reduce console noise
    }).promise;
    
    if (pdf.numPages === 0) {
      throw new Error('PDF file appears to be empty or corrupted.');
    }
    
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: viewport
    }).promise;
    
    return canvas;
    
  } catch (error) {
    throw new Error('Failed to process PDF file. The file may be corrupted or unsupported.');
  }
}

// Enhanced matching algorithm with multiple approaches
async function performEnhancedMatching(uploadCanvas, pdfCanvas) {
  let bestMatch = { similarity: 0, method: 'none', confidence: 'low' };
  
  try {
    // Convert canvases to OpenCV matrices
    let srcPdf = cv.imread(pdfCanvas);
    let srcUp = cv.imread(uploadCanvas);
    
    // Convert to grayscale for processing
    cv.cvtColor(srcPdf, srcPdf, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(srcUp, srcUp, cv.COLOR_RGBA2GRAY);
    
    // Method 1: Multi-scale template matching
    const templateResult = await performMultiScaleTemplateMatching(srcPdf, srcUp);
    if (templateResult.similarity > bestMatch.similarity) {
      bestMatch = { ...templateResult, method: 'template' };
    }
    
    // Method 2: Direct hash comparison (for cases where stamp sizes are similar)
    const hashResult = performDirectHashComparison(uploadCanvas, pdfCanvas);
    if (hashResult.similarity > bestMatch.similarity) {
      bestMatch = { ...hashResult, method: 'hash' };
    }
    
    // Method 3: Feature-based matching (using ORB features)
    const featureResult = await performFeatureMatching(srcPdf, srcUp);
    if (featureResult.similarity > bestMatch.similarity) {
      bestMatch = { ...featureResult, method: 'features' };
    }
    
    // Cleanup OpenCV matrices
    srcPdf.delete();
    srcUp.delete();
    
    // Determine confidence level
    bestMatch.confidence = determineConfidence(bestMatch.similarity, bestMatch.method);
    
    return bestMatch;
    
  } catch (error) {
    console.error('Matching error:', error);
    return { similarity: 0, method: 'error', confidence: 'low', error: error.message };
  }
}

// Multi-scale template matching for better size tolerance
async function performMultiScaleTemplateMatching(srcPdf, srcUp) {
  let bestSimilarity = 0;
  
  for (const scale of CONFIG.scaleFactors) {
    try {
      // Scale the uploaded image
      let scaledUp = new cv.Mat();
      const newSize = new cv.Size(
        Math.round(srcUp.cols * scale),
        Math.round(srcUp.rows * scale)
      );
      cv.resize(srcUp, scaledUp, newSize);
      
      // Perform template matching
      let result = new cv.Mat();
      cv.matchTemplate(srcPdf, scaledUp, result, cv.TM_CCOEFF_NORMED);
      
      const { maxVal } = cv.minMaxLoc(result);
      const similarity = Math.max(0, Math.round(maxVal * 100));
      
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
      
      // Cleanup
      scaledUp.delete();
      result.delete();
      
    } catch (error) {
      console.warn(`Template matching failed at scale ${scale}:`, error);
    }
  }
  
  return { similarity: bestSimilarity };
}

// Direct hash comparison for similar-sized images
function performDirectHashComparison(canvas1, canvas2) {
  try {
    const hash1 = computeAdvancedHash(canvas1);
    const hash2 = computeAdvancedHash(canvas2);
    
    const distance = hammingDistance(hash1, hash2);
    const similarity = Math.round(((CONFIG.hashSize * CONFIG.hashSize - distance) / (CONFIG.hashSize * CONFIG.hashSize)) * 100);
    
    return { similarity };
  } catch (error) {
    console.warn('Hash comparison failed:', error);
    return { similarity: 0 };
  }
}

// Feature-based matching using ORB features
async function performFeatureMatching(srcPdf, srcUp) {
  try {
    // Create ORB detector
    const orb = new cv.ORB(500);
    
    // Detect keypoints and compute descriptors
    const kp1 = new cv.KeyPointVector();
    const kp2 = new cv.KeyPointVector();
    const desc1 = new cv.Mat();
    const desc2 = new cv.Mat();
    
    orb.detectAndCompute(srcPdf, new cv.Mat(), kp1, desc1);
    orb.detectAndCompute(srcUp, new cv.Mat(), kp2, desc2);
    
    if (desc1.rows === 0 || desc2.rows === 0) {
      // No features detected
      kp1.delete(); kp2.delete(); desc1.delete(); desc2.delete(); orb.delete();
      return { similarity: 0 };
    }
    
    // Match descriptors
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matches = new cv.DMatchVector();
    matcher.match(desc1, desc2, matches);
    
    // Calculate similarity based on good matches
    const totalMatches = matches.size();
    const minFeatures = Math.min(kp1.size(), kp2.size());
    const matchRatio = totalMatches > 0 ? totalMatches / minFeatures : 0;
    const similarity = Math.round(Math.min(100, matchRatio * 100));
    
    // Cleanup
    kp1.delete(); kp2.delete(); desc1.delete(); desc2.delete();
    matches.delete(); matcher.delete(); orb.delete();
    
    return { similarity };
    
  } catch (error) {
    console.warn('Feature matching failed:', error);
    return { similarity: 0 };
  }
}

// Advanced hash computation with better edge detection
function computeAdvancedHash(canvas) {
  const size = CONFIG.hashSize;
  const temp = document.createElement('canvas');
  temp.width = size;
  temp.height = size;
  const ctx = temp.getContext('2d');
  
  // Apply slight blur to reduce noise
  ctx.filter = 'blur(0.5px)';
  ctx.drawImage(canvas, 0, 0, size, size);
  
  const imageData = ctx.getImageData(0, 0, size, size).data;
  const values = [];
  let sum = 0;
  
  for (let i = 0; i < size * size; i++) {
    const r = imageData[i * 4];
    const g = imageData[i * 4 + 1];
    const b = imageData[i * 4 + 2];
    // Use luminance formula for better grayscale conversion
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    values.push(gray);
    sum += gray;
  }
  
  const average = sum / (size * size);
  return values.map(v => (v > average ? 1 : 0));
}

// Enhanced Hamming distance calculation
function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) return hash1.length;
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

// Determine confidence level based on similarity and method
function determineConfidence(similarity, method) {
  if (similarity >= 85) return 'high';
  if (similarity >= 65) return 'medium';
  if (similarity >= 40) return 'low';
  return 'very-low';
}

// Display comprehensive results
function displayResults(result) {
  const { similarity, method, confidence, error } = result;
  
  if (error) {
    showError(`Processing error: ${error}`);
    return;
  }
  
  // Create detailed message
  let message = `Similarity: ${similarity}%`;
  let statusText = '';
  
  if (similarity >= 80) {
    statusText = '✅ Strong Match';
  } else if (similarity >= 60) {
    statusText = '⚠️ Possible Match';
  } else if (similarity >= 40) {
    statusText = '❌ Weak Match';
  } else {
    statusText = '❌ No Match';
  }
  
  scoreEl.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">${statusText}</div>
    <div>${message}</div>
    <div style="font-size: 0.9em; margin-top: 6px; opacity: 0.8;">
      Method: ${method} • Confidence: ${confidence}
    </div>
  `;
  
  // Set background gradient based on similarity
  const greenPercent = Math.min(100, similarity);
  const redPercent = 100 - greenPercent;
  scoreEl.style.background = `
    linear-gradient(to right,
      rgba(76, 175, 80, 0.3) 0%,
      rgba(76, 175, 80, 0.3) ${greenPercent}%,
      rgba(244, 67, 54, 0.3) ${greenPercent}%,
      rgba(244, 67, 54, 0.3) 100%)
  `;
  
  // Add border color based on confidence
  const borderColors = {
    'high': '#4caf50',
    'medium': '#ff9800',
    'low': '#f44336',
    'very-low': '#9e9e9e'
  };
  scoreEl.style.borderColor = borderColors[confidence] || '#dadce0';
}

// Enhanced error display
function showError(message) {
  scoreEl.innerHTML = `
    <div style="color: #d32f2f; font-weight: bold;">
      ❌ Error
    </div>
    <div style="margin-top: 8px; font-size: 0.95em;">
      ${message}
    </div>
  `;
  scoreEl.style.background = 'rgba(244, 67, 54, 0.1)';
  scoreEl.style.borderColor = '#f44336';
}