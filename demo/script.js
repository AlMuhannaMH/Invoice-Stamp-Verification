document.getElementById('btnCheck').onclick = async () => {    
  const id   = document.getElementById('pdfId').value.trim();    
  const file = document.getElementById('fileInput').files[0];    
  if (!id || !file) {    
    return alert('Please enter a PDF ID and select an image.');    
  }    
    
  // 1) Fetch PDF via your Netlify Function proxy    
  const fnUrl = `/.netlify/functions/fetch-pdf?id=${encodeURIComponent(id)}`;    
  let res;    
  try {    
    res = await fetch(fnUrl);    
    if (!res.ok) throw new Error(res.statusText);    
  } catch (err) {    
    return alert('Failed to fetch PDF: ' + err.message);    
  }    
    
  // 2) Read raw bytes    
  const pdfData = await res.arrayBuffer();    
    
  // 3) Render page #1    
  const pdf  = await pdfjsLib.getDocument({ data: pdfData }).promise;    
  const page = await pdf.getPage(1);    
  const vp   = page.getViewport({ scale: 2 });    
  const cPdf = document.getElementById('canvasPdf');    
  cPdf.width  = vp.width;    
  cPdf.height = vp.height;    
  await page.render({    
    canvasContext: cPdf.getContext('2d'),    
    viewport: vp    
  }).promise;    
    
  // 4) Draw the user’s uploaded image    
  const img = new Image();    
  img.src = URL.createObjectURL(file);    
  await new Promise(r => (img.onload = r));    
  const cUp = document.getElementById('canvasUp');    
  cUp.width  = img.width;    
  cUp.height = img.height;    
  cUp.getContext('2d').drawImage(img, 0, 0);    
    
  // 5) ORB feature matching via OpenCV.js    
  let matA = cv.imread(cPdf),    
      matB = cv.imread(cUp);    
  cv.cvtColor(matA, matA, cv.COLOR_RGBA2GRAY);    
  cv.cvtColor(matB, matB, cv.COLOR_RGBA2GRAY);    
    
  let orb = new cv.ORB(),    
      kpa = new cv.KeyPointVector(), dsa = new cv.Mat(),    
      kpb = new cv.KeyPointVector(), dsb = new cv.Mat();    
  orb.detectAndCompute(matA, new cv.Mat(), kpa, dsa);    
  orb.detectAndCompute(matB, new cv.Mat(), kpb, dsb);    
    
  let bf      = new cv.BFMatcher(cv.NORM_HAMMING, false),    
      matches = new cv.DMatchVectorVector();    
  bf.knnMatch(dsa, dsb, matches, 2);    
    
  // Lowe’s ratio test    
  let good = 0;    
  for (let i = 0; i < matches.size(); i++) {    
    let m = matches.get(i).get(0),    
        n = matches.get(i).get(1);    
    if (m.distance < 0.75 * n.distance) good++;    
  }    
    
  const total = Math.max(kpa.size(), kpb.size()),    
        score = total ? Math.floor((100 * good) / total) : 0;    
  const el = document.getElementById('score');    
  el.textContent       = `Similarity: ${score}%`;    
  el.style.background  = `linear-gradient(to right, green ${score}%, red ${score}%)`;    
    
  // Clean up    
  matA.delete(); matB.delete();    
  kpa.delete(); kpb.delete();    
  dsa.delete(); dsb.delete();    
  bf.delete(); matches.delete();    
};    