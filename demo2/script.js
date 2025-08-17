// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables
let uploadedImageFile = null;
let extractedCodes = [];
let hasResults = false;

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
const downloadBtn = document.getElementById('downloadBtn');

// Drag and drop functionality
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFile(files[0]);
});

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
            throw new Error(`Unsupported file type: ${file.type}`);
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
                            updateProgress(progress, 'Reading text from image...');
                        }
                    }
                });
                resolve(result.data.text);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read image file'));
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
                    updateProgress(progress, `Reading PDF page ${i}/${pdf.numPages}...`);
                }

                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read PDF file'));
        reader.readAsArrayBuffer(file);
    });
}

function extractCustomerCodes(text) {
    const cleanText = text.replace(/\s+/g, '').replace(/[^\d]/g, '');
    const regex1 = /966\d{5}/g;
    let matches = text.match(regex1) || [];
    
    const regex2 = /966\d{5}/g;
    const cleanMatches = cleanText.match(regex2) || [];
    
    const allMatches = [...matches, ...cleanMatches];
    return allMatches.length ? [...new Set(allMatches)] : [];
}

function displayExtractedCodes(codes) {
    if (codes.length === 0) {
        showError('No customer codes found. Please ensure the file contains codes starting with 966 followed by 5 digits.');
        return;
    }

    codesList.innerHTML = '';
    codes.forEach(code => {
        const item = document.createElement('div');
        item.className = 'code-item';
        item.innerHTML = `
            <div class="customer-code">${code}</div>
            <button class="use-code-btn" onclick="useCode('${code}')">Use This Code</button>
        `;
        codesList.appendChild(item);
    });

    extractedCodesDiv.style.display = 'block';
}

function useCode(code) {
    pdfIdInput.value = code;
    btnCheck.disabled = false;
    updateStatus(`Selected code: ${code} - Ready to check match!`, 'success');
    
    // Highlight the selected code
    document.querySelectorAll('.use-code-btn').forEach(btn => {
        btn.style.background = '#4CAF50';
        btn.textContent = 'Use This Code';
    });
    event.target.style.background = '#FF9800';
    event.target.textContent = 'Selected ✓';
}

// Check match functionality
btnCheck.addEventListener('click', async () => {
    const pdfId = pdfIdInput.value.trim();
    
    if (!pdfId) {
        showError('Please select a PDF ID from the extracted codes.');
        return;
    }
    
    if (!uploadedImageFile) {
        showError('Please upload an image first.');
        return;
    }

    setLoading(true);
    
    try {
        updateStatus('Loading and comparing images...', 'info');
        
        // Load uploaded image
        const uploadedImage = await loadImage(uploadedImageFile);
        drawImageToCanvas(document.getElementById('canvasUp'), uploadedImage);

        // Fetch and compare with actual PDF
        const similarity = await fetchAndComparePDF(pdfId);
        
        // Show results
        document.getElementById('result').classList.add('show');
        document.getElementById('score').classList.add('show');
        
        // Display comparison results
        displayComparisonResults(pdfId, similarity);
        
        hasResults = true;
        updateShareButtons();
        updateStatus('Verification completed! You can now share the results.', 'success');
        
    } catch (error) {
        console.error('Processing error:', error);
        showError(error.message || 'An error occurred during processing. Please try again.');
    } finally {
        setLoading(false);
    }
});

function displayComparisonResults(pdfId, similarity) {
    let statusText = '';
    let statusColor = '';
    
    if (similarity >= 80) {
        statusText = '✅ AUTHENTIC MATCH';
        statusColor = '#4CAF50';
    } else if (similarity >= 65) {
        statusText = '⚠️ REQUIRES REVIEW';
        statusColor = '#FF9800';
    } else {
        statusText = '❌ NO MATCH';
        statusColor = '#F44336';
    }
    
    document.getElementById('score').innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: ${statusColor};">${statusText}</div>
        <div>Similarity: ${similarity}% for ID: ${pdfId}</div>
        <div style="font-size: 0.9em; margin-top: 6px; opacity: 0.8;">
            Threshold: 65% minimum, 80% authentic
        </div>
    `;
    
    document.getElementById('score').style.background = similarity >= 80 ? 
        'rgba(76, 175, 80, 0.15)' : 
        similarity >= 65 ? 
        'rgba(255, 152, 0, 0.15)' : 
        'rgba(244, 67, 54, 0.15)';
}

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

async function fetchAndComparePDF(pdfId) {
    try {
        // Fetch PDF from actual API
        const apiUrl = `https://arlasfatest.danyaltd.com:14443/CustomerSignature/signatures/${pdfId}`;
        updateStatus(`Fetching PDF for ID: ${pdfId}...`, 'info');
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`PDF not found for ID: ${pdfId}. Please verify the customer code.`);
            } else if (response.status === 500) {
                throw new Error('Server error occurred. Please try again later.');
            } else {
                throw new Error(`Failed to fetch PDF: ${response.statusText}`);
            }
        }
        
        const pdfData = await response.arrayBuffer();
        updateStatus('Processing PDF...', 'info');
        
        // Render PDF to canvas
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        
        const pdfCanvas = document.getElementById('canvasPdf');
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        
        await page.render({
            canvasContext: pdfCanvas.getContext('2d'),
            viewport: viewport
        }).promise;
        
        // Perform actual comparison
        updateStatus('Comparing images...', 'info');
        const similarity = await performImageComparison();
        
        return similarity;
        
    } catch (error) {
        throw error;
    }
}

async function performImageComparison() {
    try {
        const uploadCanvas = document.getElementById('canvasUp');
        const pdfCanvas = document.getElementById('canvasPdf');
        
        // Convert canvases to OpenCV matrices
        let srcPdf = cv.imread(pdfCanvas);
        let srcUp = cv.imread(uploadCanvas);
        
        // Convert to grayscale
        cv.cvtColor(srcPdf, srcPdf, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(srcUp, srcUp, cv.COLOR_RGBA2GRAY);
        
        // Template matching
        let result = new cv.Mat();
        cv.matchTemplate(srcPdf, srcUp, result, cv.TM_CCOEFF_NORMED);
        
        const { maxVal } = cv.minMaxLoc(result);
        const similarity = Math.round(maxVal * 100);
        
        // Cleanup
        srcPdf.delete();
        srcUp.delete();
        result.delete();
        
        return Math.max(0, similarity);
        
    } catch (error) {
        console.error('Comparison error:', error);
        return 0;
    }
}

function setLoading(isLoading) {
    btnCheck.disabled = isLoading;
    btnCheck.textContent = isLoading ? '⏳ Processing...' : '🔍 Verify Stamp Match';
}

function updateShareButtons() {
    const canShare = hasResults && uploadedImageFile;
    shareBtn.disabled = !canShare;
    downloadBtn.disabled = !canShare;
}

// Sharing functionality
async function captureAndShare() {
    try {
        updateStatus('Capturing screenshot...', 'info');
        shareBtn.disabled = true;
        
        const canvas = await html2canvas(document.querySelector('.container'), {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false
        });
        
        const screenshotBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png', 1.0);
        });
        
        const filesToShare = [];
        const screenshotFile = new File([screenshotBlob], 'stamp-verification-results.png', { type: 'image/png' });
        filesToShare.push(screenshotFile);
        
        if (uploadedImageFile) {
            filesToShare.push(uploadedImageFile);
        }
        
        if (navigator.share && navigator.canShare && navigator.canShare({ files: filesToShare })) {
            await navigator.share({
                title: 'Stamp Verification Results',
                text: `Stamp verification results for customer code: ${pdfIdInput.value}`,
                files: filesToShare
            });
            updateStatus(`Successfully shared ${filesToShare.length} file(s)!`, 'success');
        } else {
            fallbackDownload(canvas, uploadedImageFile);
        }
        
    } catch (error) {
        console.error('Error sharing:', error);
        updateStatus('Error sharing results: ' + error.message, 'error');
    } finally {
        shareBtn.disabled = false;
        updateShareButtons();
    }
}

async function captureAndDownload() {
    try {
        updateStatus('Preparing download...', 'info');
        downloadBtn.disabled = true;
        
        const canvas = await html2canvas(document.querySelector('.container'), {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false
        });
        
        fallbackDownload(canvas, uploadedImageFile);
        
    } catch (error) {
        console.error('Error downloading:', error);
        updateStatus('Error downloading results: ' + error.message, 'error');
    } finally {
        downloadBtn.disabled = false;
        updateShareButtons();
    }
}

function fallbackDownload(canvas, originalFile) {
    const timestamp = new Date().getTime();
    
    // Download screenshot
    const screenshotLink = document.createElement('a');
    screenshotLink.download = `stamp-verification-${timestamp}.png`;
    screenshotLink.href = canvas.toDataURL('image/png');
    screenshotLink.click();
    
    // Download original image
    if (originalFile) {
        setTimeout(() => {
            const originalLink = document.createElement('a');
            const url = URL.createObjectURL(originalFile);
            originalLink.download = `original-${originalFile.name}`;
            originalLink.href = url;
            originalLink.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 500);
    }
    
    const fileCount = originalFile ? 2 : 1;
    updateStatus(`Downloaded ${fileCount} file(s) successfully!`, 'success');
}

// Utility functions
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
    updateShareButtons();
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
    
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}

// Initialize
cv['onRuntimeInitialized'] = () => {
    console.log('OpenCV.js is ready');
};