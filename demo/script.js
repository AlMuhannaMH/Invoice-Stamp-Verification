// Called when OpenCV.js finishes loading    
function onOpenCvReady() {    
  console.log("OpenCV.js is ready");    
}    
    
document.getElementById("btnCheck").onclick = async () => {    
  const id   = document.getElementById("pdfId").value.trim();    
  const file = document.getElementById("fileInput").files[0];    
  if (!id || !file) {    
    return alert("Please enter a PDF ID and select an image.");    
  }    
    
  // 1) Fetch the PDF directly from your public endpoint    
  const pdfUrl = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${id}.pdf`;    
  let resp;    
  try {    
    resp = await fetch(pdfUrl);    
    if (!resp.ok) throw new Error(`Status ${resp.status}`);    
  } catch (err) {    
    return alert("Failed to fetch PDF: " + err.message);    
  }    
  const pdfBuf = await resp.arrayBuffer();    
    
  // 2) Render PDF page #1 into canvasPdf    
  const pdf    = await pdfjsLib.getDocument({ data: pdfBuf }).promise;    
  const page   = await pdf.getPage(1);    
  const vp     = page.getViewport({ scale: 2 });    
  const cPdf   = document.getElementById("canvasPdf");    
  cPdf.width   = vp.width;    
  cPdf.height  = vp.height;    
  await page.render({    
    canvasContext: cPdf.getContext("2d"),    
    viewport: vp    
  }).promise;    
    
  // 3) Draw uploaded image into canvasUp    
  const img = new Image();    
  img.src = URL.createObjectURL(file);    
  await new Promise(res => (img.onload = res));    
  const cUp = document.getElementById("canvasUp");    
  cUp.width  = img.width;    
  cUp.height = img.height;    
  cUp.getContext("2d").drawImage(img, 0, 0);    
    
  // 4) ORB feature matching with OpenCV.js    
  let matPdf = cv.imread(cPdf);    
  let matUp  = cv.imread(cUp);    
  cv.cvtColor(matPdf, matPdf, cv.COLOR_RGBA2GRAY);    
  cv.cvtColor(matUp,  matUp,  cv.COLOR_RGBA2GRAY);    
    
  let orb    = new cv.ORB();    
  let kp1    = new cv.KeyPointVector(), des1 = new cv.Mat();    
  let kp2    = new cv.KeyPointVector(), des2 = new cv.Mat();    
  orb.detectAndCompute(matPdf, new cv.Mat(), kp1, des1);    
  orb.detectAndCompute(matUp,  new cv.Mat(), kp2, des2);    
    
  let bf      = new cv.BFMatcher(cv.NORM_HAMMING, false);    
  let matches = new cv.DMatchVectorVector();    
  bf.knnMatch(des1, des2, matches, 2);    
    
  // Lowe’s ratio test    
  let good = 0;    
  for (let i = 0; i < matches.size(); i++) {    
    let m = matches.get(i).get(0),    
        n = matches.get(i).get(1);    
    if (m.distance < 0.75 * n.distance) good++;    
  }    
    
  // Compute similarity %    
  const totalKp = Math.max(kp1.size(), kp2.size());    
  const score   = totalKp ? Math.floor((100 * good) / totalKp) : 0;    
  const scoreEl = document.getElementById("score");    
  scoreEl.textContent = `Similarity: ${score}%`;    
  scoreEl.style.background = `    
    linear-gradient(to right,    
      green   ${score}%,    
      red     ${score}%)    
  `;    
    
  // Cleanup    
  matPdf.delete(); matUp.delete();    
  kp1.delete(); kp2.delete();    
  des1.delete(); des2.delete();    
  bf.delete(); matches.delete();    
};    