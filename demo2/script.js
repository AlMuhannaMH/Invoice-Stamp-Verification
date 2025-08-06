// script.js    
    
// these IDs come from your HTML    
const btnCheck   = document.getElementById('btnCheck');    
const pdfIdInput = document.getElementById('pdfId');    
const fileInput  = document.getElementById('fileInput');    
const cPdf       = document.getElementById('canvasPdf');    
const cUp        = document.getElementById('canvasUp');    
const scoreEl    = document.getElementById('score');    
    
// enable the button (cv is already ready)    
btnCheck.disabled = false;    
    
btnCheck.addEventListener('click', async () => {    
  const id   = pdfIdInput.value.trim();    
  const file = fileInput.files[0];    
  if (!id || !file) {    
    return alert('Please enter a PDF ID and select an image.');    
  }    
    
  //    
  // 1) draw uploaded stamp into cUp    
  //    
  const img = new Image();    
  img.src = URL.createObjectURL(file);    
  await new Promise(r => img.onload = r);    
  cUp.width  = img.width;    
  cUp.height = img.height;    
  cUp.getContext('2d').drawImage(img, 0, 0);    
    
  //    
  // 2) fetch PDF via Netlify Function    
  //    
  const fnUrl = `/.netlify/functions/fetch-pdf?id=${encodeURIComponent(id)}`;    
  let res = await fetch(fnUrl);    
  if (!res.ok) {    
    return alert('Failed to fetch PDF: ' + res.statusText);    
  }    
  const pdfData = await res.arrayBuffer();    
    
  //    
  // 3) render PDF page #1 into cPdf    
  //    
  const pdf  = await pdfjsLib.getDocument({ data: pdfData }).promise;    
  const page = await pdf.getPage(1);    
  const vp   = page.getViewport({ scale: 2 });    
  cPdf.width  = vp.width;    
  cPdf.height = vp.height;    
  await page.render({    
    canvasContext: cPdf.getContext('2d'),    
    viewport: vp    
  }).promise;    
    
  //    
  // 4) template match to locate the stamp patch in the PDF    
  //    
  let srcPdf = cv.imread(cPdf);    
  let srcUp  = cv.imread(cUp);    
  cv.cvtColor(srcPdf, srcPdf, cv.COLOR_RGBA2GRAY);    
  cv.cvtColor(srcUp,  srcUp,  cv.COLOR_RGBA2GRAY);    
    
  let result = new cv.Mat();    
  cv.matchTemplate(srcPdf, srcUp, result, cv.TM_CCOEFF_NORMED);    
  // get the best match location    
  const { maxLoc } = cv.minMaxLoc(result);    
    
  //    
  // 5) crop that region from the PDF grayscale mat    
  //    
  const w = srcUp.cols, h = srcUp.rows;    
  const rect = new cv.Rect(maxLoc.x, maxLoc.y, w, h);    
  let patchPdf = srcPdf.roi(rect);    
    
  //    
  // 6) compute absolute difference    
  //    
  let diff = new cv.Mat();    
  cv.absdiff(patchPdf, srcUp, diff);    
    
  //    
  // 7) sum differences & normalize    
  //    
  const sumScalar = cv.sum(diff);      // returns [sum, 0,0,0]    
  const sumDiff   = sumScalar[0];    
  const pixelCount = diff.rows * diff.cols;    
  const normalizedDiff = sumDiff / (255 * pixelCount);    
  let similarity = Math.round((1 - normalizedDiff) * 100);    
  similarity = Math.max(0, Math.min(100, similarity)); // clamp    
    
  //    
  // 8) display result    
  //    
  scoreEl.textContent = `Similarity: ${similarity}%`;    
  scoreEl.style.background = `    
    linear-gradient(to right,    
      green ${similarity}%,    
      red   ${similarity}%)    
  `;    
    
  //    
  // cleanup    
  //    
  srcPdf.delete(); srcUp.delete();    
  result.delete(); patchPdf.delete(); diff.delete();    
});    