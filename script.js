// --- State Variables ---
let currentScreen = 'screen-welcome';
let sessionTimerInterval;
let printTimerInterval;
let retakeIndex = null; 
let capturedImages = [];
let selectedTemplate = 3; // 1 (Polaroid), 3, atau 4
let videoStream = null;
let customFrameImg = null; 
let isBnwMode = false;

// --- Config ---
const CONFIG = {
    sessionTime: 5 * 60, 
    printTime: 3 * 60,   
    countDownTime: 5,    
    
    // Config Strip Biasa
    printWidth: 57,      
    photoHeight: 30,

    // Config Polaroid (Instax Mini Standard)
    polaroidWidth: 54,   // mm
    polaroidHeight: 86,  // mm
    polaroidImgW: 46,    // mm (Lebar foto di dalam polaroid)
    polaroidImgH: 62     // mm (Tinggi foto di dalam polaroid)
};

// Variabel penampung hasil scan
let detectedTemplates1 = []; // Untuk Polaroid
let detectedTemplates3 = [];
let detectedTemplates4 = [];

// --- DOM Elements ---
const screens = document.querySelectorAll('.screen');
const timerDisplay = document.getElementById('time-remaining');
const globalTimerBox = document.getElementById('global-timer');
const videoElement = document.getElementById('video-feed');
const canvas = document.getElementById('photo-canvas');
const ctx = canvas.getContext('2d');
const countdownOverlay = document.getElementById('countdown-overlay');
const previewImage = document.getElementById('preview-image');
const finalImage = document.getElementById('final-image');
const printTimerDisplay = document.getElementById('print-timer');

// --- AUTO SCANNER ---
function initAutoScan() {
    scanFiles('1', 1, detectedTemplates1); // Scan Polaroid (1_1.png)
    scanFiles('3', 1, detectedTemplates3); // Scan 3 Strip
    scanFiles('4', 1, detectedTemplates4); // Scan 4 Strip
}

function scanFiles(type, index, targetArray) {
    const filename = `${type}_${index}.png`; 
    const path = `assets/${filename}`;
    const img = new Image();
    
    img.onload = function() {
        targetArray.push(filename); 
        scanFiles(type, index + 1, targetArray); 
    };
    img.onerror = function() {
        console.log(`Scan tipe ${type} selesai. Total: ${targetArray.length}`);
    };
    img.src = path;
}
initAutoScan();

// --- Navigation ---
function showScreen(screenId) {
    const allScreens = document.querySelectorAll('.screen');
    allScreens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        currentScreen = screenId;
    }
}

// --- Filter Logic ---
function setFilterMode(mode) {
    isBnwMode = (mode === 'bnw');
}

// --- FLOW APLIKASI ---
function startSession() {
    startGlobalTimer(CONFIG.sessionTime);
    globalTimerBox.classList.remove('hidden');
    showScreen('screen-strip-select');
}

function selectStripCount(num) {
    selectedTemplate = num;
    customFrameImg = null;
    renderTemplateGallery(num);
    showScreen('screen-template-choice');
}

// 3. Render Galeri (Update: Ada Tombol Default)
function renderTemplateGallery(num) {
    const galleryContainer = document.getElementById('assets-gallery');
    galleryContainer.innerHTML = ''; 

    // --- 1. BUAT TOMBOL DEFAULT (TANPA FRAME) ---
    const defaultItem = document.createElement('div');
    defaultItem.className = 'gallery-item';
    defaultItem.onclick = () => {
        customFrameImg = null; // Set null agar pakai desain bawaan kode
        startCameraSequence();
    };

    // Styling visual kotak "Default"
    defaultItem.innerHTML = `
        <div style="
            width: 100px; 
            height: ${num === 1 ? '140px' : '100px'}; /* Polaroid lebih tinggi */
            background: #f0f0f0; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            border-radius: 5px; 
            border: 2px dashed #ccc;
            color: #666;
            font-size: 0.8rem;
            font-weight: bold;
            text-align: center;
        ">
            <span style="font-size: 1.5rem; margin-bottom: 5px;">✨</span>
            Default<br>(Polos)
        </div>
    `;
    galleryContainer.appendChild(defaultItem);


    // --- 2. TAMPILKAN ASET DARI FOLDER (JIKA ADA) ---
    // Ambil data dari hasil scan sesuai jumlah strip
    let list;
    if (num === 1) list = detectedTemplates1;
    else if (num === 3) list = detectedTemplates3;
    else list = detectedTemplates4;

    // Jika ada file template di folder assets, tampilkan setelah tombol default
    if (list.length > 0) {
        list.forEach(filename => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.onclick = () => loadPremadeFrame('assets/' + filename);

            const img = document.createElement('img');
            img.src = 'assets/' + filename;
            
            // Styling thumbnail agar rapi
            img.style.width = '100px'; 
            img.style.height = 'auto';
            img.style.borderRadius = '5px';
            img.style.objectFit = 'contain';
            
            div.appendChild(img);
            galleryContainer.appendChild(div);
        });
    }
}
function loadPremadeFrame(path) {
    const img = new Image();
    img.onload = () => {
        customFrameImg = img;
        startCameraSequence();
    };
    img.onerror = () => alert("Gagal memuat template.");
    img.src = path;
}

function handleCustomUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = () => {
                customFrameImg = img;
                startCameraSequence();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function startCameraSequence() {
    capturedImages = [];
    retakeIndex = null;
    showScreen('screen-capture');
    startCamera();
}

// --- Camera Logic ---
async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: false 
        });
        videoElement.srcObject = videoStream;
        videoElement.style.filter = isBnwMode ? 'grayscale(100%) contrast(1.1)' : 'none';
        
        // Update Crop Guide Visual di Layar
        updateCropGuideVisual();

        setTimeout(() => runPhotoSequence(), 1000);
    } catch (err) {
        alert("Gagal kamera: " + err);
    }
}

// Fungsi Baru: Mengubah bentuk guide di layar (Landscape vs Portrait)
function updateCropGuideVisual() {
    const guide = document.querySelector('.crop-guide');
    if (selectedTemplate === 1) {
        // Mode Polaroid (Portrait 46x62 mm)
        guide.style.aspectRatio = `${CONFIG.polaroidImgW} / ${CONFIG.polaroidImgH}`;
    } else {
        // Mode Strip (Landscape 57x30 mm)
        guide.style.aspectRatio = `${CONFIG.printWidth} / ${CONFIG.photoHeight}`;
    }
}

async function runPhotoSequence() {
    const totalPhotos = selectedTemplate; // 1, 3, atau 4

    if (retakeIndex !== null) {
        document.getElementById('photo-instruction').innerText = `Mengulang Foto`;
        await doCountdown();
        triggerShutterEffect();
        capturedImages[retakeIndex] = captureFrame(); 
        retakeIndex = null; 
    } else {
        capturedImages = []; 
        for (let i = 1; i <= totalPhotos; i++) {
            document.getElementById('photo-instruction').innerText = `Foto ke-${i} dari ${totalPhotos}`;
            await doCountdown();
            triggerShutterEffect();
            capturedImages.push(captureFrame());
            
            if(i < totalPhotos) await new Promise(r => setTimeout(r, 1000));
        }
    }

    stopCamera();
    await generateStrip(); 
    renderRetakeThumbnails();
    showScreen('screen-preview');
}

function triggerShutterEffect() {
    playSound('snd-shutter');
    videoElement.style.opacity = 0;
    setTimeout(() => videoElement.style.opacity = 1, 100);
}

function doCountdown() {
    return new Promise(resolve => {
        let count = CONFIG.countDownTime;
        countdownOverlay.classList.remove('hidden');
        countdownOverlay.innerText = count;
        playSound('snd-beep');

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownOverlay.innerText = count;
                playSound('snd-beep');
            } else {
                clearInterval(interval);
                countdownOverlay.classList.add('hidden');
                resolve();
            }
        }, 1000);
    });
}

// --- Capture Frame (Dynamic Ratio) ---
function captureFrame() {
    // Tentukan target rasio berdasarkan mode
    let targetRatio;
    if (selectedTemplate === 1) {
        // Polaroid (Portrait)
        targetRatio = CONFIG.polaroidImgW / CONFIG.polaroidImgH; 
    } else {
        // Strip (Landscape)
        targetRatio = CONFIG.printWidth / CONFIG.photoHeight;
    }

    const videoW = videoElement.videoWidth;
    const videoH = videoElement.videoHeight;
    const videoRatio = videoW / videoH;

    let cropW, cropH, cropX, cropY;

    if (videoRatio > targetRatio) {
        cropH = videoH;
        cropW = videoH * targetRatio;
        cropX = (videoW - cropW) / 2;
        cropY = 0;
    } else {
        cropW = videoW;
        cropH = videoW / targetRatio;
        cropX = 0;
        cropY = (videoH - cropH) / 2;
    }

    canvas.width = 1000;
    canvas.height = 1000 / targetRatio;

    // Mirroring
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.save(); 
    if (isBnwMode) ctx.filter = 'grayscale(100%) contrast(1.1)';
    
    ctx.drawImage(videoElement, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    
    ctx.restore(); 
    return canvas.toDataURL('image/png');
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
}

// --- Modifikasi: generateStrip (Default Template Polaroid Cantik) ---
async function generateStrip() {
    const pxPerMm = 11.8;
    
    // --- 1. SETTING UKURAN KANVAS ---
    let canvasW, canvasH;

    if (selectedTemplate === 1) {
        // Ukuran Polaroid (54x86 mm)
        canvasW = Math.round(CONFIG.polaroidWidth * pxPerMm);
        canvasH = Math.round(CONFIG.polaroidHeight * pxPerMm);
    } else {
        // Ukuran Strip (Lebar 57mm, Tinggi Dinamis)
        const gap = Math.round(8 * pxPerMm);
        const header = Math.round(10 * pxPerMm);
        const footer = Math.round(20 * pxPerMm);
        const photoH = Math.round(CONFIG.photoHeight * pxPerMm);
        
        canvasW = Math.round(CONFIG.printWidth * pxPerMm);
        canvasH = header + (photoH * selectedTemplate) + (gap * (selectedTemplate - 1)) + footer;
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Background Putih (Khas Polaroid)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
        const loadedImages = await Promise.all(capturedImages.map(src => loadImage(src)));

        // --- 2. MENGGAMBAR FOTO ---
        if (selectedTemplate === 1) {
            // === LOGIKA POLAROID ===
            const imgW = CONFIG.polaroidImgW * pxPerMm;
            const imgH = CONFIG.polaroidImgH * pxPerMm;
            
            // Posisi Foto: Centered horizontal, Top margin 4mm (standar instax)
            const marginX = (canvasW - imgW) / 2;
            const marginY = 4 * pxPerMm; 

            if (loadedImages[0]) {
                drawImageWithFilter(loadedImages[0], marginX, marginY, imgW, imgH);
                
                // Efek Bayangan Halus di dalam foto (Biar lebih realistis)
                if (!customFrameImg) {
                    ctx.strokeStyle = "rgba(0,0,0,0.1)"; // Abu-abu sangat tipis
                    ctx.lineWidth = 1;
                    ctx.strokeRect(marginX, marginY, imgW, imgH);
                }
            }

        } else {
            // === LOGIKA STRIP (3 / 4 Foto) ===
            const paddingPx = Math.round(1 * pxPerMm); // Padding 1mm
            const imgW = canvasW - (paddingPx * 2);
            const imgH = Math.round(CONFIG.photoHeight * pxPerMm) - (paddingPx * 2);
            const gap = Math.round(8 * pxPerMm);
            let currentY = Math.round(10 * pxPerMm); // Top Margin

            // Header Teks (jika no frame)
            if (!customFrameImg) {
                ctx.fillStyle = "#FF85A2"; 
                ctx.font = "bold 30px 'Fredoka One'";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle"; 
                ctx.fillText("Avotobooth ✨", canvasW / 2, currentY / 2);
            }

            loadedImages.forEach((img) => {
                const drawX = paddingPx;
                const drawY = currentY + paddingPx;
                
                drawImageWithFilter(img, drawX, drawY, imgW, imgH);

                if (!customFrameImg) {
                    ctx.strokeStyle = "#CBF0E0"; 
                    ctx.lineWidth = 5;
                    ctx.strokeRect(drawX, drawY, imgW, imgH);
                }
                currentY += Math.round(CONFIG.photoHeight * pxPerMm) + gap;
            });
        }

        // --- 3. OVERLAY FRAME / FOOTER TEXT ---
        if (customFrameImg) {
            // Jika ada template custom, timpa semuanya
            ctx.drawImage(customFrameImg, 0, 0, canvas.width, canvas.height);
        } else {
            // === DEFAULT TEMPLATE GENERATOR ===
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic"; 
            
            if (selectedTemplate === 1) {
                // >> TEMPLATE DEFAULT POLAROID <<
                // Area bawah polaroid (Height 86mm - PhotoEnd 66mm = 20mm Space)
                
                // 1. Nama Brand (Lebih Besar)
               // ctx.fillStyle = "#FF85A2"; // Warna Pink Pastel
                //ctx.font = "bold 24px 'Fredoka One'";
                // Posisi: Sekitar 12mm dari bawah
                //ctx.fillText("Avotobooth ✨", canvasW / 2, canvasH - (12 * pxPerMm));
                
                // ... kode sebelumnya ...

// 2. Tanggal (Kecil di bawahnya)
        ctx.fillStyle = "#000000ff"; 
        // Pastikan tetap pakai font typewriter pilihan Anda
        ctx.font = "24px 'Courier New', Courier, monospace";

        // --- LOGIKA FORMAT TANGGAL CUSTOM ---
        const now = new Date();
        const tgl = now.getDate(); // Ambil tanggal (misal: 9)
        const bln = now.toLocaleDateString('id-ID', { month: 'short' }); // Ambil bulan pendek (misal: Des)
        const thn = now.getFullYear().toString().slice(-2); // Ambil 2 digit terakhir tahun (misal: 25)

        // Gabungkan menjadi string: "9 Des '25"
        const tanggalCustom = `${tgl} ${bln} '${thn}`; 
        // ------------------------------------

        // Posisi: Sekitar 5mm dari bawah
        ctx.fillText(tanggalCustom, canvasW / 2, canvasH - (5 * pxPerMm));

    } else {
        // >> TEMPLATE DEFAULT STRIP <<
        
        // 1. Warna Disamakan (Hitam)
        ctx.fillStyle = "#000000ff";
        
        // 2. Font Disamakan (Typewriter 24px)
        ctx.font = "24px 'Courier New', Courier, monospace";
        
        // 3. Logika Format Tanggal Disamakan
        const now = new Date();
        const tgl = now.getDate();
        const bln = now.toLocaleDateString('id-ID', { month: 'short' });
        const thn = now.getFullYear().toString().slice(-2);
        const tanggalCustom = `${tgl} ${bln} '${thn}`;

        // 4. Posisi Disamakan (5mm dari bawah)
        // Sebelumnya 10mm, sekarang disamakan jadi 5mm agar seragam
        ctx.fillText(tanggalCustom, canvasW / 2, canvasH - (5 * pxPerMm));
    }
}

// Update Preview
const finalDataUrl = canvas.toDataURL('image/png');
previewImage.src = finalDataUrl;
finalImage.src = finalDataUrl;

} catch (error) {
    console.error("Generate error:", error);
}
}
// Helper Draw agar Filter Aman
function drawImageWithFilter(img, x, y, w, h) {
    ctx.save();
    if (isBnwMode) ctx.filter = 'grayscale(100%) contrast(1.1)';
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
}

// --- Helpers Lain ---
const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

function playSound(id) {
    const audio = document.getElementById(id);
    if(audio) { audio.currentTime=0; audio.play().catch(e=>{}); }
}

// --- Timer & Output ---
function startGlobalTimer(duration) {
    clearInterval(sessionTimerInterval);
    let timer = duration;
    updateTimerDisplay(timer, timerDisplay);

    sessionTimerInterval = setInterval(() => {
        timer--;
        updateTimerDisplay(timer, timerDisplay);
        if (timer <= 0) {
            clearInterval(sessionTimerInterval);
            if (capturedImages.length > 0) {
                alert("Waktu habis! Mencetak...");
                stopCamera();
                generateStrip();
                finalizeSession();
            } else {
                alert("Waktu habis.");
                resetApp();
            }
        }
    }, 1000);
}

function updateTimerDisplay(seconds, element) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    element.textContent = `${m}:${s}`;
}

function renderRetakeThumbnails() {
    const container = document.getElementById('thumbnails-container');
    container.innerHTML = ''; 
    capturedImages.forEach((imgSrc, index) => {
        const card = document.createElement('div');
        card.className = 'thumb-card';
        card.onclick = () => initRetakeSingle(index); 
        const img = document.createElement('img');
        img.src = imgSrc;
        card.appendChild(img);
        container.appendChild(card);
    });
}

function initRetakeSingle(index) {
    retakeIndex = index; 
    showScreen('screen-capture'); 
    startCamera(); 
}

function retakeAll() {
    retakeIndex = null;
    showScreen('screen-strip-select'); 
}

function finalizeSession() {
    clearInterval(sessionTimerInterval); 
    globalTimerBox.classList.add('hidden');
    showScreen('screen-print');
    startPrintTimer();
}

function startPrintTimer() {
    let timer = CONFIG.printTime;
    updateTimerDisplay(timer, printTimerDisplay);
    printTimerInterval = setInterval(() => {
        timer--;
        updateTimerDisplay(timer, printTimerDisplay);
        if (timer <= 0) finishSession();
    }, 1000);
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = 'polaroid-' + Date.now() + '.png';
    link.href = finalImage.src;
    link.click();
}

function printImage() { window.print(); }

function finishSession() {
    clearInterval(printTimerInterval);
    showScreen('screen-thankyou');
}

function resetApp() {
    clearInterval(sessionTimerInterval);
    clearInterval(printTimerInterval);
    currentScreen = 'screen-welcome';
    capturedImages = [];
    customFrameImg = null; 
    showScreen('screen-welcome');
}