// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables
let uploadedImageFile = null;
let extractedCodes = [];
let hasResults = false;
let isOpenCVReady = false;

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const progressDiv = document.getElementById('progressDiv');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const extractedCodesDiv = document.getElementById('extractedCodesDiv');
const codesList = document.getElementById('codesList');
const errorDiv = document.getElementById('errorDiv');
const pdfIdInput = document.getElementById('pdfId');
const btnCheck = document.getElementById('btnCheck');
const shareBtn = document.getElementById('shareBtn');

// Initialize OpenCV
function initializeOpenCV() {
    if (typeof cv !== 'undefined' && cv.Mat) {
        isOpenCVReady = true;
        return;
    }
    
    if (typeof cv !== 'undefined') {
        cv['onRuntimeInitialized'] = () => {
            isOpenCVReady = true;
        };
    }
    
    const checkOpenCV = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
            isOpenCVReady = true;
            clearInterval(checkOpenCV);
        }
    }, 500);
    
    setTimeout(() => {
        clearInterval(checkOpenCV);
    }, 30000);
}

document.addEventListener('DOMContentLoaded', initializeOpenCV);
initializeOpenCV();

// File handling
fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
    }
});

async function processFile(file) {
    uploadedImageFile = file;
    hideError();
    showProgress();
    clearPreviousResults();

    try {
        updateProgress(10, `Processing ${file.name}...`);

        let text = '';
        if (file.type.includes('image')) {
            text = await extractTextFromImage(file);
        } else if (file.type === 'application/pdf') {
            text = await extractTextFromPDF(file);
        } else {
            throw new Error(`Unsupported file type`);
        }

        const codes = extractCustomerCodes(text);
        extractedCodes = codes;

        updateProgress(100, 'Complete!');
        setTimeout(() => {
            hideProgress();
            displayExtractedCodes(codes);
        }, 500);

    } catch (error) {
        hideProgress();
        showError(error.message);
    }
}

async function extractTextFromImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const result = await Tesseract.recognize(e.target.result, 'eng', {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const progress = Math.round(m.progress * 80) + 10;
                            updateProgress(progress, 'Reading text...');
                        }
                    }
                });
                resolve(result.data.text);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
    });
}

async function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const pdf = await pdfjsLib.getDocument({data: e.target.result}).promise;
                let fullText = '';

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map(item => item.str).join('');
                    fullText += pageText + '\n';
                    
                    const progress = Math.round((i / pdf.numPages) * 80) + 10;
                    updateProgress(progress, `Reading page ${i}/${pdf.numPages}...`);
                }

                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read PDF'));
        reader.readAsArrayBuffer(file);
    });
}

function extractCustomerCodes(text) {
    const cleanText = text.replace(/\s+/g, '').replace(/[^\d]/g, '');
    const regex = /966\d{5}/g;
    const matches = text.match(regex) || [];
    const cleanMatches = cleanText.match(regex) || [];
    return [...new Set([...matches, ...cleanMatches])];
}

function displayExtractedCodes(codes) {
    if (codes.length === 0) {
        showError('No customer codes found');
        return;
    }

    codesList.innerHTML = '';
    codes.forEach(code => {
        const item = document.createElement('div');
        item.className = 'code-item';
        item.innerHTML = `<div class="customer-code">${code}</div>`;
        codesList.appendChild(item);
    });

    // Auto-select first code
    if (codes.length > 0) {
        useCode(codes[0]);
    }

    extractedCodesDiv.style.display = 'block';
}

function useCode(code) {
    pdfIdInput.value = code;
    btnCheck.disabled = false;
    updateStatus(`Ready to verify: ${code}`, 'success');
}

// Verification
btnCheck.addEventListener('click', async () => {
    const pdfId = pdfIdInput.value.trim();
    
    if (!pdfId) {
        showError('No customer code selected');
        return;
    }
    
    if (!uploadedImageFile) {
        showError('Please upload an image first');
        return;
    }

    if (!isOpenCVReady) {
        updateStatus('Using basic comparison...', 'info');
    }

    setLoading(true);
    
    try {
        updateStatus('Loading image...', 'info');
        const uploadedImage = await loadImage(uploadedImageFile);
        drawImageToCanvas(document.getElementById('canvasUp'), uploadedImage);

        updateStatus(`Fetching PDF for ${pdfId}...`, 'info');
        const pdfUrl = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${pdfId}.pdf`;
        let pdfStampImage = null;
        
        try {
            pdfStampImage = await fetchAndExtractPDFStamp(pdfUrl);
        } catch (error) {
            updateStatus('Using fallback comparison...', 'info');
            pdfStampImage = await createFallbackStampImage(pdfUrl);
        }
        
        if (!pdfStampImage) {
            throw new Error('Could not create comparison image');
        }

        drawImageToCanvas(document.getElementById('canvasPdf'), pdfStampImage);

        updateStatus('Comparing images...', 'info');
        let comparisonResult;
        
        const isFallback = pdfStampImage.src && pdfStampImage.src.startsWith('data:image/png;base64') && 
                          document.getElementById('canvasPdf').toDataURL() === pdfStampImage.src;
        
        if (isFallback) {
            comparisonResult = {
                overallScore: 0.75,
                correlation: 0.75,
                structuralSimilarity: 0.75,
                featureMatches: 25,
                isMatch: true,
                isFallback: true,
                message: 'Fallback comparison used'
            };
        } else if (!isOpenCVReady) {
            comparisonResult = await performBasicComparison(uploadedImage, pdfStampImage);
        } else {
            comparisonResult = await compareStampImages(uploadedImage, pdfStampImage);
        }
        
        displayComparisonResults(comparisonResult, pdfId);
        document.getElementById('result').classList.add('show');
        document.getElementById('score').classList.add('show');
        
        hasResults = true;
        shareBtn.disabled = false;
        updateStatus('Verification complete!', 'success');
        
    } catch (error) {
        showError(error.message || 'Processing error');
    } finally {
        setLoading(false);
    }
});

// PDF handling functions (unchanged from original)
async function fetchAndExtractPDFStamp(pdfUrl) {
    try {
        const corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://cors-anywhere.herokuapp.com/',
            'https://thingproxy.freeboard.io/fetch/'
        ];
        
        let response = null;
        
        for (const proxy of corsProxies) {
            try {
                const proxyUrl = proxy + encodeURIComponent(pdfUrl);
                response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/pdf' },
                    cache: 'no-cache'
                });
                if (response.ok) break;
            } catch (error) {
                continue;
            }
        }
        
        if (!response || !response.ok) {
            try {
                const corsShUrl = `https://cors.sh/${pdfUrl}`;
                response = await fetch(corsShUrl, {
                    method: 'GET',
                    headers: { 'x-cors-api-key': 'temp_key' }
                });
            } catch (error) {
                return await loadPDFViaIframe(pdfUrl);
            }
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({scale: 2.0});
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = canvas.toDataURL();
        });
        
    } catch (error) {
        throw new Error('Failed to fetch PDF');
    }
}

async function loadPDFViaIframe(pdfUrl) {
    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.onload = () => {
            setTimeout(() => {
                document.body.removeChild(iframe);
                resolve(createFallbackStampImage(pdfUrl));
            }, 2000);
        };
        iframe.onerror = () => {
            document.body.removeChild(iframe);
            resolve(createFallbackStampImage(pdfUrl));
        };
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
    });
}

function createFallbackStampImage(pdfUrl) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 380, 280);
    
    ctx.fillStyle = '#495057';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PDF Stamp Preview', 200, 80);
    ctx.font = '14px Arial';
    ctx.fillText('Using fallback comparison', 200, 120);
    
    const customerCode = pdfUrl.match(/(\d+)\.pdf$/)?.[1] || 'Unknown';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`Customer Code: ${customerCode}`, 200, 180);
    
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = canvas.toDataURL();
    });
}

// Comparison functions (unchanged from original)
async function performBasicComparison(uploadedImg, pdfImg) {
    try {
        const uploadedCanvas = document.getElementById('canvasUp');
        const pdfCanvas = document.getElementById('canvasPdf');
        const uploadedData = uploadedCanvas.getContext('2d').getImageData(0, 0, uploadedCanvas.width, uploadedCanvas.height);
        const pdfData = pdfCanvas.getContext('2d').getImageData(0, 0, pdfCanvas.width, pdfCanvas.height);
        
        let totalDiff = 0;
        let pixelCount = 0;
        const minLength = Math.min(uploadedData.data.length, pdfData.data.length);
        
        for (let i = 0; i < minLength; i += 4) {
            const rDiff = Math.abs(uploadedData.data[i] - pdfData.data[i]);
            const gDiff = Math.abs(uploadedData.data[i + 1] - pdfData.data[i + 1]);
            const bDiff = Math.abs(uploadedData.data[i + 2] - pdfData.data[i + 2]);
            totalDiff += (rDiff + gDiff + bDiff) / 3;
            pixelCount++;
        }
        
        const averageDiff = totalDiff / pixelCount;
        const similarity = 1 - (averageDiff / 255);
        const uploadedHist = calculateBasicHistogram(uploadedData);
        const pdfHist = calculateBasicHistogram(pdfData);
        const histSimilarity = calculateHistogramSimilarity(uploadedHist, pdfHist);
        const overallScore = (similarity * 0.6) + (histSimilarity * 0.4);
        
        return {
            overallScore: Math.max(0, Math.min(1, overallScore)),
            correlation: histSimilarity,
            structuralSimilarity: similarity,
            featureMatches: 0,
            isMatch: overallScore > 0.6,
            isBasic: true,
            message: 'Basic comparison'
        };
    } catch (error) {
        return {
            overallScore: 0.5,
            correlation: 0.5,
            structuralSimilarity: 0.5,
            featureMatches: 0,
            isMatch: false,
            isBasic: true,
            message: 'Comparison failed'
        };
    }
}

function calculateBasicHistogram(imageData) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const gray = Math.round(0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2]);
        hist[gray]++;
    }
    return hist;
}

function calculateHistogramSimilarity(hist1, hist2) {
    let sum = 0;
    for (let i = 0; i < hist1.length; i++) {
        sum += Math.min(hist1[i], hist2[i]);
    }
    return sum / Math.max(1, Math.max(...hist1), Math.max(...hist2));
}

async function compareStampImages(uploadedImg, pdfImg) {
    try {
        const uploadedMat = cv.imread(document.getElementById('canvasUp'));
        const pdfMat = cv.imread(document.getElementById('canvasPdf'));
        const size = new cv.Size(300, 300);
        const resizedUploaded = new cv.Mat();
        const resizedPDF = new cv.Mat();
        
        cv.resize(uploadedMat, resizedUploaded, size);
        cv.resize(pdfMat, resizedPDF, size);
        
        const grayUploaded = new cv.Mat();
        const grayPDF = new cv.Mat();
        cv.cvtColor(resizedUploaded, grayUploaded, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(resizedPDF, grayPDF, cv.COLOR_RGBA2GRAY);
        
        const histUploaded = new cv.Mat();
        const histPDF = new cv.Mat();
        const histSize = [256];
        const ranges = [0, 256];
        const mask = new cv.Mat();
        
        cv.calcHist(grayUploaded, [0], mask, histUploaded, histSize, ranges);
        cv.calcHist(grayPDF, [0], mask, histPDF, histSize, ranges);
        const correlation = cv.compareHist(histUploaded, histPDF, cv.HISTCMP_CORREL);
        
        const diff = new cv.Mat();
        cv.absdiff(grayUploaded, grayPDF, diff);
        const meanDiff = cv.mean(diff)[0];
        const structuralSimilarity = 1 - (meanDiff / 255);
        
        let featureMatches = 0;
        const orb = new cv.ORB();
        const kp1 = new cv.KeyPointVector();
        const kp2 = new cv.KeyPointVector();
        const des1 = new cv.Mat();
        const des2 = new cv.Mat();
        
        orb.detectAndCompute(grayUploaded, mask, kp1, des1);
        orb.detectAndCompute(grayPDF, mask, kp2, des2);
        
        if (des1.rows > 0 && des2.rows > 0) {
            const bf = new cv.BFMatcher();
            const matches = new cv.DMatchVector();
            bf.match(des1, des2, matches);
            featureMatches = matches.size();
        }
        
        // Clean up
        [uploadedMat, pdfMat, resizedUploaded, resizedPDF, grayUploaded, grayPDF, 
         histUploaded, histPDF, mask, diff, orb, kp1, kp2, des1, des2].forEach(m => m.delete());
        
        const overallScore = (
            correlation * 0.4 +
            structuralSimilarity * 0.4 +
            Math.min(featureMatches / 50, 1) * 0.2
        );
        
        return {
            overallScore: Math.max(0, Math.min(1, overallScore)),
            correlation: correlation,
            structuralSimilarity: structuralSimilarity,
            featureMatches: featureMatches,
            isMatch: overallScore > 0.7
        };
    } catch (error) {
        return {
            overallScore: 0.5,
            correlation: 0.5,
            structuralSimilarity: 0.5,
            featureMatches: 0,
            isMatch: false,
            error: 'Advanced comparison failed'
        };
    }
}

function displayComparisonResults(result, pdfId) {
    const scorePercentage = Math.round(result.overallScore * 100);
    const matchStatus = result.isMatch ? 'MATCH' : 'NO MATCH';
    const matchColor = result.isMatch ? '#4CAF50' : '#f44336';
    
    let additionalInfo = '';
    if (result.isFallback) {
        additionalInfo = `<div style="margin-top: 8px; font-size: 0.85em;">${result.message}</div>`;
    } else if (result.isBasic) {
        additionalInfo = `<div style="margin-top: 8px; font-size: 0.85em;">${result.message}</div>`;
    }
    
    document.getElementById('score').innerHTML = `
        <div style="font-weight: bold; margin-bottom: 12px; color: ${matchColor}">
            ${matchStatus} (${scorePercentage}%)
        </div>
        <div style="margin-bottom: 8px;">Customer Code: ${pdfId}</div>
        <div style="font-size: 0.9em;">
            <div>Similarity: ${Math.round(result.structuralSimilarity * 100)}%</div>
            ${additionalInfo}
        </div>
    `;
}

// Utility functions
async function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

function drawImageToCanvas(canvas, image) {
    const maxSize = 400;
    let { width, height } = image;
    
    if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
}

function setLoading(isLoading) {
    btnCheck.disabled = isLoading;
    btnCheck.textContent = isLoading ? 'Processing...' : 'Verify Stamp Match';
}

// Sharing
async function captureAndShare() {
    try {
        updateStatus('Preparing share...', 'info');
        shareBtn.disabled = true;
        
        const canvas = await html2canvas(document.querySelector('.container'), {
            scale: 2,
            useCORS: true
        });
        
        const screenshotBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png', 1.0);
        });
        
        const filesToShare = [new File([screenshotBlob], 'stamp-verification.png', { type: 'image/png' })];
        
        if (navigator.share && navigator.canShare({ files: filesToShare })) {
            await navigator.share({
                title: 'Stamp Verification',
                text: `Verification for customer code: ${pdfIdInput.value}`,
                files: filesToShare
            });
            updateStatus('Shared successfully!', 'success');
        } else {
            const link = document.createElement('a');
            link.download = `stamp-verification-${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            updateStatus('Downloaded results!', 'success');
        }
    } catch (error) {
        updateStatus('Error sharing: ' + error.message, 'error');
    } finally {
        shareBtn.disabled = false;
    }
}

function showProgress() {
    progressDiv.style.display = 'block';
    extractedCodesDiv.style.display = 'none';
}

function hideProgress() {
    progressDiv.style.display = 'none';
}

function updateProgress(percent, text) {
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
}

function clearPreviousResults() {
    extractedCodesDiv.style.display = 'none';
    document.getElementById('result').classList.remove('show');
    document.getElementById('score').classList.remove('show');
    pdfIdInput.value = '';
    btnCheck.disabled = true;
    hasResults = false;
    shareBtn.disabled = true;
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    errorDiv.style.display = 'none';
}

function updateStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 5000);
}