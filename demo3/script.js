// script.js    
    
// Elements
const btnCheck   = document.getElementById('btnCheck');    
const pdfIdInput = document.getElementById('pdfId');    
const fileInput  = document.getElementById('fileInput');    
const cPdf       = document.getElementById('canvasPdf');    
const cUp        = document.getElementById('canvasUp');    
const scoreEl    = document.getElementById('score');    
const loading    = document.getElementById('loading');    
    
// Enable button once OpenCV is ready
btnCheck.disabled = false;    
    
btnCheck.addEventListener('click', async () => {    
  const id   = pdfIdInput.value.trim();    
  const file = fileInput.files[0];    
  if (!id || !file) {    
    return alert('Please enter a PDF ID and select an image.');    
  }    
    
  try {
    // Show loading indicator
    loading.style.display = 'flex';
    btnCheck.disabled = true;
    
    // 1) Draw uploaded stamp into cUp
    const img = new Image();    
    img.src = URL.createObjectURL(file);    
    await new Promise(r => img.onload = r);    
    cUp.width  = img.width;    
    cUp.height = img.height;    
    cUp.getContext('2d').drawImage(img, 0, 0);    
    
    // 2) Fetch PDF via Netlify Function    
    const fnUrl = `/.netlify/functions/fetch-pdf?id=${encodeURIComponent(id)}`;    
    const res   = await fetch(fnUrl);    
    if (!res.ok) {    
      throw new Error('Failed to fetch PDF: ' + res.statusText);    
    }    
    const pdfData = await res.arrayBuffer();    
    
    // 3) Render PDF page #1 into cPdf    
    const pdf  = await pdfjsLib.getDocument({ data: pdfData }).promise;    
    const page = await pdf.getPage(1);    
    const vp   = page.getViewport({ scale: 1 });  // Changed from 2 to 1 for better scaling
    
    cPdf.width  = vp.width;    
    cPdf.height = vp.height;    
    await page.render({    
      canvasContext: cPdf.getContext('2d'),    
      viewport: vp    
    }).promise;    
    
    // 4) Template matching to locate the stamp region    
    let srcPdf = cv.imread(cPdf);    
    let srcUp  = cv.imread(cUp);    
    
    try {
      cv.cvtColor(srcPdf, srcPdf, cv.COLOR_RGBA2GRAY);    
      cv.cvtColor(srcUp,  srcUp,  cv.COLOR_RGBA2GRAY);    
      
      let result = new cv.Mat();    
      cv.matchTemplate(srcPdf, srcUp, result, cv.TM_CCOEFF_NORMED);    
      cv.normalize(result, result, 0, 1, cv.NORM_MINMAX, -1);    
      
      const { maxVal, maxLoc } = cv.minMaxLoc(result);    
      
      // Validate match quality
      if (maxVal < 0.4) {    
        throw new Error('Stamp not found in PDF. Match confidence too low.');    
      }    
      
      // 5) Crop the matched rectangle from srcPdf    
      const w = srcUp.cols, h = srcUp.rows;    
      const rect = new cv.Rect(maxLoc.x, maxLoc.y, w, h);    
      let patchPdf = srcPdf.roi(rect);    
    
      // 6) Compute average‐hash on both canvases    
      const hashUp  = averageHash(cUp);    
      const hashPdf = averageHash(matToCanvas(patchPdf));    
    
      // 7) Compute Hamming distance & similarity    
      const dist       = hammingDistance(hashUp, hashPdf);    
      const similarity = Math.round(((64 - dist) / 64) * 100);    
    
      // 8) Display result    
      scoreEl.textContent  = `Similarity: ${similarity}%`;    
      scoreEl.style.background = `    
        linear-gradient(to right,    
          green ${similarity}%,    
          red   ${similarity}%)    
      `;    
      scoreEl.style.display = 'block';
      
      patchPdf.delete();
      result.delete();
    } finally {
      // Cleanup OpenCV resources
      srcPdf.delete();    
      srcUp.delete();    
    }
  } catch(e) {    
    console.error(e);    
    alert(`Error: ${e.message}`);    
    scoreEl.style.display = 'none';
  } finally {    
    // Hide loading indicator
    loading.style.display = 'none';
    btnCheck.disabled = false;
  }    
});    
    
// Convert an OpenCV Mat ROI into a temporary Canvas element    
function matToCanvas(mat) {    
  const temp = document.createElement('canvas');    
  temp.width  = mat.cols;    
  temp.height = mat.rows;    
  cv.imshow(temp, mat);    
  return temp;    
}    
    
// Compute an 8×8 average‐hash from a Canvas    
function averageHash(canvas) {    
  const size = 8;    
  const tmp  = document.createElement('canvas');    
  tmp.width  = size;    
  tmp.height = size;    
  const ctx = tmp.getContext('2d');    
  ctx.drawImage(canvas, 0, 0, size, size);    
  
  const imgData = ctx.getImageData(0, 0, size, size).data;    
  const vals = [];    
  let sum = 0;    
  
  for (let i = 0; i < 64; i++) {    
    const r = imgData[i*4], g = imgData[i*4+1], b = imgData[i*4+2];    
    const gray = 0.299*r + 0.587*g + 0.114*b;    
    vals.push(gray);    
    sum += gray;    
  }    
  
  const avg = sum / 64;    
  return vals.map(v => (v > avg ? 1 : 0));    
}    
    
// Hamming distance between two 64‐bit hash arrays    
function hammingDistance(a, b) {    
  let d = 0;    
  for (let i = 0; i < 64; i++) {    
    if (a[i] !== b[i]) d++;    
  }    
  return d;    
}