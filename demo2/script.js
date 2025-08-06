// // This file now only runs once cv is guaranteed to exist.    
    
// document.getElementById('btnCheck').onclick = async () => {    
//   const id   = document.getElementById('pdfId').value.trim();    
//   const file = document.getElementById('fileInput').files[0];    
//   if (!id || !file) {    
//     return alert('Please enter a PDF ID and select an image.');    
//   }    
    
//   // 1) Fetch the PDF via our Netlify Function proxy    
//   const fnUrl = `/.netlify/functions/fetch-pdf?id=${encodeURIComponent(id)}`;    
//   let res;    
//   try {    
//     res = await fetch(fnUrl);    
//     if (!res.ok) throw new Error(res.statusText);    
//   } catch (err) {    
//     return alert('Failed to fetch PDF: ' + err.message);    
//   }    
    
//   // 2) Read raw PDF bytes    
//   const pdfData = await res.arrayBuffer();    
    
//   // 3) Render PDF page #1 into the first canvas    
//   const pdf  = await pdfjsLib.getDocument({ data: pdfData }).promise;    
//   const page = await pdf.getPage(1);    
//   const vp   = page.getViewport({ scale: 2 });    
//   const cPdf = document.getElementById('canvasPdf');    
//   cPdf.width  = vp.width;    
//   cPdf.height = vp.height;    
//   await page.render({    
//     canvasContext: cPdf.getContext('2d'),    
//     viewport: vp    
//   }).promise;    
    
//   // 4) Draw uploaded image into the second canvas    
//   const img = new Image();    
//   img.src = URL.createObjectURL(file);    
//   await new Promise(r => (img.onload = r));    
//   const cUp = document.getElementById('canvasUp');    
//   cUp.width  = img.width;    
//   cUp.height = img.height;    
//   cUp.getContext('2d').drawImage(img, 0, 0);    
    
//   // 5) ORB matching via OpenCV.js    
//   let matA = cv.imread(cPdf), matB = cv.imread(cUp);    
//   cv.cvtColor(matA, matA, cv.COLOR_RGBA2GRAY);    
//   cv.cvtColor(matB, matB, cv.COLOR_RGBA2GRAY);    
    
//   let orb = new cv.ORB(),    
//       kpa = new cv.KeyPointVector(), dsa = new cv.Mat(),    
//       kpb = new cv.KeyPointVector(), dsb = new cv.Mat();    
//   orb.detectAndCompute(matA, new cv.Mat(), kpa, dsa);    
//   orb.detectAndCompute(matB, new cv.Mat(), kpb, dsb);    
    
//   let bf      = new cv.BFMatcher(cv.NORM_HAMMING, false),    
//       matches = new cv.DMatchVectorVector();    
//   bf.knnMatch(dsa, dsb, matches, 2);    
    
//   // Lowe’s ratio test    
//   let good = 0;    
//   for (let i = 0; i < matches.size(); i++) {    
//     let m = matches.get(i).get(0),    
//         n = matches.get(i).get(1);    
//     if (m.distance < 0.75 * n.distance) good++;    
//   }    
    
//   const total = Math.max(kpa.size(), kpb.size()),    
//         score = total ? Math.floor((100 * good) / total) : 0;    
//   const el = document.getElementById('score');    
//   el.textContent      = `Similarity: ${score}%`;    
//   el.style.background = `linear-gradient(to right, green ${score}%, red ${score}%)`;    
    
//   // Cleanup    
//   matA.delete(); matB.delete();    
//   kpa.delete(); kpb.delete();    
//   dsa.delete(); dsb.delete();    
//   bf.delete(); matches.delete();    
// };    

// script.js    
    
// Grab only the elements you actually have    
const btnCheck   = document.getElementById('btnCheck');    
const pdfIdInput = document.getElementById('pdfId');    
const fileInput  = document.getElementById('fileInput');    
const cPdf       = document.getElementById('canvasPdf');    
const cUp        = document.getElementById('canvasUp');    
const scoreEl    = document.getElementById('score');    
    
// Enable the button once this file is loaded (cv is already ready)    
btnCheck.disabled = false;    
    
btnCheck.addEventListener('click', async () => {    
  const id   = pdfIdInput.value.trim();    
  const file = fileInput.files[0];    
  if (!id || !file) {    
    return alert('Please enter a PDF ID and select an image.');    
  }    
    
  // 1) Draw uploaded image into cUp    
  const img = new Image();    
  img.src = URL.createObjectURL(file);    
  await new Promise(r => (img.onload = r));    
  cUp.width  = img.width;    
  cUp.height = img.height;    
  cUp.getContext('2d').drawImage(img, 0, 0);    
    
  // 2) Fetch PDF via Netlify Function    
  const fnUrl = `/.netlify/functions/fetch-pdf?id=${encodeURIComponent(id)}`;    
  const res   = await fetch(fnUrl);    
  if (!res.ok) {    
    return alert('Failed to fetch PDF: ' + res.statusText);    
  }    
  const pdfData = await res.arrayBuffer();    
    
  // 3) Render PDF page #1 into cPdf    
  const pdf  = await pdfjsLib.getDocument({ data: pdfData }).promise;    
  const page = await pdf.getPage(1);    
  const vp   = page.getViewport({ scale: 2 });    
  cPdf.width  = vp.width;    
  cPdf.height = vp.height;    
  await page.render({    
    canvasContext: cPdf.getContext('2d'),    
    viewport: vp    
  }).promise;    
    
  // 4) Template matching with OpenCV.js    
  let srcPdf = cv.imread(cPdf);    
  let srcUp  = cv.imread(cUp);    
  cv.cvtColor(srcPdf, srcPdf, cv.COLOR_RGBA2GRAY);    
  cv.cvtColor(srcUp,  srcUp,  cv.COLOR_RGBA2GRAY);    
    
  let result = new cv.Mat();    
  cv.matchTemplate(srcPdf, srcUp, result, cv.TM_CCOEFF_NORMED);    
  cv.normalize(result, result, 0, 1, cv.NORM_MINMAX, -1);    
    
  const { maxVal } = cv.minMaxLoc(result);    
  const score      = Math.round(maxVal * 100);    
    
  // 5) Display the percentage    
  scoreEl.textContent = `Similarity: ${score}%`;    
  scoreEl.style.background = `    
    linear-gradient(    
      to right,    
      green ${score}%,    
      red   ${score}%    
    )    
  `;    
    
  // Clean up    
  srcPdf.delete();    
  srcUp.delete();    
  result.delete();    
});    