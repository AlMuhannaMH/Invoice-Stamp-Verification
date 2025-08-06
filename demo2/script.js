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
// This only runs once cv.onRuntimeInitialized has fired in your index.html    
    
// DOM references    
const cameraBtn     = document.getElementById('camera-btn');    
const uploadBtn     = document.getElementById('upload-btn');    
const cameraCont    = document.getElementById('camera-container');    
const uploadCont    = document.getElementById('upload-container');    
const videoEl       = document.getElementById('video');    
const captureBtn    = document.getElementById('capture-btn');    
const cancelCamera  = document.getElementById('cancel-camera');    
const uploadBox     = document.getElementById('upload-box');    
const fileInput     = document.getElementById('file-input');    
const cancelUpload  = document.getElementById('cancel-upload');    
const loadingEl     = document.getElementById('loading');    
const resultsCont   = document.getElementById('results-container');    
const statusText    = document.getElementById('status-text');    
const customerIdEl  = document.getElementById('customer-id-value');    
const detStampImg   = document.getElementById('detected-stamp');    
const dbStampImg    = document.getElementById('database-stamp');    
const newVerifBtn   = document.getElementById('new-verification');    
const errorBox      = document.getElementById('error-message');    
const errorText     = document.getElementById('error-text');    
const pdfIdInput    = document.getElementById('pdfId');    
    
// Hidden canvases for PDF.js and stamp patch:    
const canvasPdf = document.getElementById('canvasPdf');    
const canvasUp  = document.getElementById('canvasUp');    
    
let cameraStream = null;    
    
// Event wiring    
cameraBtn.addEventListener('click', startCamera);    
uploadBtn.addEventListener('click', showUploadUI);    
captureBtn.addEventListener('click', capturePhoto);    
cancelCamera.addEventListener('click', resetUI);    
uploadBox.addEventListener('click', () => fileInput.click());    
cancelUpload.addEventListener('click', resetUI);    
fileInput.addEventListener('change', () => {    
  if (fileInput.files[0]) handleFile(fileInput.files[0]);    
});    
newVerifBtn.addEventListener('click', resetUI);    
    
function startCamera() {    
  toggleSections({ options: false, camera: true });    
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })    
    .then(s => {    
      cameraStream = s;    
      videoEl.srcObject = s;    
    })    
    .catch(err => showError('Camera access denied.'));    
}    
    
function showUploadUI() {    
  toggleSections({ options: false, upload: true });    
}    
    
function capturePhoto() {    
  // Grab a frame from the video and convert to dataURL    
  const cw = videoEl.videoWidth, ch = videoEl.videoHeight;    
  const tmp = document.createElement('canvas');    
  tmp.width = cw; tmp.height = ch;    
  tmp.getContext('2d').drawImage(videoEl, 0, 0, cw, ch);    
  stopCamera();    
  handleFileData(tmp.toDataURL('image/jpeg', 0.8));    
}    
    
function handleFile(file) {    
  // Read file as DataURL    
  const reader = new FileReader();    
  reader.onload = e => handleFileData(e.target.result);    
  reader.onerror = () => showError('File read error.');    
  reader.readAsDataURL(file);    
}    
    
function handleFileData(imageDataUrl) {    
  // imageDataUrl is a base64 JPG/PNG of the **stamp only**!    
  toggleSections({ camera: false, upload: false });    
  loadingEl.style.display = 'block';    
  errorBox.style.display = 'none';    
    
  // Kick off the PDF fetch + template match flow    
  matchTemplateFlow(imageDataUrl).catch(err => {    
    console.error(err);    
    showError('Processing error: ' + err.message);    
  });    
}    
    
async function matchTemplateFlow(imageDataUrl) {    
  // 1) Draw the uploaded stamp into canvasUp    
  const img = new Image();    
  img.src = imageDataUrl;    
  await new Promise(r => img.onload = r);    
  canvasUp.width = img.width; canvasUp.height = img.height;    
  canvasUp.getContext('2d').drawImage(img, 0, 0);    
    
  // 2) Fetch PDF page via Netlify Function    
  const id = encodeURIComponent(pdfIdInput.value.trim());    
  const fnUrl = `/.netlify/functions/fetch-pdf?id=${id}`;    
  const res = await fetch(fnUrl);    
  if (!res.ok) throw new Error('PDF fetch failed');    
  const pdfData = await res.arrayBuffer();    
    
  // 3) Render PDF page #1 into canvasPdf    
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;    
  const page = await pdf.getPage(1);    
  const vp = page.getViewport({ scale: 2 });    
  canvasPdf.width  = vp.width;  canvasPdf.height = vp.height;    
  await page.render({    
    canvasContext: canvasPdf.getContext('2d'),    
    viewport: vp    
  }).promise;    
    
  // 4) Template matching    
  let srcPdf = cv.imread(canvasPdf);    
  let srcUp  = cv.imread(canvasUp);    
    
  cv.cvtColor(srcPdf, srcPdf, cv.COLOR_RGBA2GRAY);    
  cv.cvtColor(srcUp,  srcUp,  cv.COLOR_RGBA2GRAY);    
    
  // Create result mat of size (W-w+1, H-h+1)    
  let result = new cv.Mat();    
  cv.matchTemplate(srcPdf, srcUp, result, cv.TM_CCOEFF_NORMED);    
  cv.normalize(result, result, 0, 1, cv.NORM_MINMAX, -1);    
    
  // Get best match    
  const { maxVal, maxLoc } = cv.minMaxLoc(result);    
    
  // Similarity score    
  const score = Math.round(maxVal * 100);    
    
  // 5) Extract the matched region from canvasPdf    
  const { x, y } = maxLoc;    
  const w = canvasUp.width, h = canvasUp.height;    
  // Offscreen canvas to crop    
  const crop = document.createElement('canvas');    
  crop.width = w;  crop.height = h;    
  crop.getContext('2d')    
      .drawImage(canvasPdf, x, y, w, h, 0, 0, w, h);    
  const croppedDataUrl = crop.toDataURL();    
    
  // 6) Show results    
  loadingEl.style.display    = 'none';    
  resultsCont.style.display  = 'block';    
    
  // Customer ID    
  customerIdEl.textContent = pdfIdInput.value.trim() || 'N/A';    
  // Status    
  statusText.textContent = score >= 70     
    ? `✅ VALID STAMP (${score}%)`     
    : `❌ INVALID STAMP (${score}%)`;    
  statusText.className = 'status-text ' + (score >= 70 ? 'status-valid' : 'status-invalid');    
    
  // Display user stamp & matched PDF patch    
  detStampImg.src = imageDataUrl;    
  dbStampImg.src  = croppedDataUrl;    
    
  // Clean up    
  srcPdf.delete(); srcUp.delete(); result.delete();    
}    
    
function stopCamera() {    
  if (cameraStream) {    
    cameraStream.getTracks().forEach(t => t.stop());    
    cameraStream = null;    
  }    
}    
    
function resetUI() {    
  stopCamera();    
  toggleSections({ options: true, camera: false, upload: false });    
  loadingEl.style.display   = 'none';    
  resultsCont.style.display = 'none';    
  errorBox.style.display    = 'none';    
  fileInput.value = '';    
  pdfIdInput.value = '';    
}    
    
function showError(msg) {    
  errorText.textContent = msg;    
  errorBox.style.display = 'block';    
  loadingEl.style.display = 'none';    
}    
    
function toggleSections({ options=true, camera=false, upload=false }) {    
  document.querySelector('.option-buttons').style.display = options ? 'flex' : 'none';    
  cameraCont.style.display = camera ? 'block' : 'none';    
  uploadCont.style.display = upload ? 'block' : 'none';    
}    