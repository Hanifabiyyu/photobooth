// --- State Variables ---
let currentScreen = 'screen-welcome';
let sessionTimerInterval;
let printTimerInterval;
let retakeIndex = null; // Menyimpan index foto mana yang sedang diulang
let capturedImages = [];
let selectedTemplate = 3; // 3 or 4
let videoStream = null;
let customFrameImg = null; // Variabel untuk menyimpan frame
let isBnwMode = false;
// --- Config ---
const CONFIG = {
    sessionTime: 5 * 60, // 5 menit
    printTime: 3 * 60,   // 3 menit
    countDownTime: 5,    // 5 detik per foto
    printWidth: 57,      // mm
    photoHeight: 30      // mm per foto
};

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

// --- Navigation ---
function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
}

//Upload
function loadCustomFrame(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = () => {
                customFrameImg = img;
                document.getElementById('frame-status').innerText = "✅ Frame berhasil dimuat!";
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}
// Fungsi untuk mengubah mode filter berdasarkan pilihan radio button
function setFilterMode(mode) {
    isBnwMode = (mode === 'bnw');
    // Opsional: Kita bisa langsung mengubah style video feed di sini jika kamera sudah nyala,
    // tapi karena ini di halaman depan, efeknya baru terasa nanti saat startCamera().
    if (videoElement.srcObject) {
         videoElement.style.filter = isBnwMode ? 'grayscale(100%) contrast(1.1)' : 'none';
    }
}
// --- Session Logic ---
function startSession() {
    startGlobalTimer(CONFIG.sessionTime);
    globalTimerBox.classList.remove('hidden');
    showScreen('screen-template');
}

function startGlobalTimer(duration) {
    clearInterval(sessionTimerInterval);
    let timer = duration;
    updateTimerDisplay(timer, timerDisplay);

    sessionTimerInterval = setInterval(() => {
        timer--;
        updateTimerDisplay(timer, timerDisplay);
        if (timer <= 0) {
            clearInterval(sessionTimerInterval);
            alert("Waktu sesi habis!");
            resetApp();
        }
    }, 1000);
}

function updateTimerDisplay(seconds, element) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    element.textContent = `${m}:${s}`;
}

// --- Template & Camera ---
function selectTemplate(num) {
    selectedTemplate = num;
    capturedImages = []; // Reset foto
    showScreen('screen-capture');
    startCamera();
}

// --- Camera & Capture Logic (UPDATE FILTER) ---
async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: false 
        });
        videoElement.srcObject = videoStream;

        // TERAPKAN FILTER KE LIVE VIDEO FEED
        // Tambahkan contrast sedikit agar B&W lebih tajam
        videoElement.style.filter = isBnwMode ? 'grayscale(100%) contrast(1.1)' : 'none';

        setTimeout(() => runPhotoSequence(), 1000);
    } catch (err) {
        alert("Gagal mengakses kamera: " + err);
    }
}

async function runPhotoSequence() {
    // Cek apakah ini mode retake (hanya 1 foto) atau sesi baru (looping)
    if (retakeIndex !== null) {
        // --- MODE RETAKE SATU FOTO ---
        document.getElementById('photo-instruction').innerText = `Mengulang Foto ke-${retakeIndex + 1}`;
        
        await doCountdown();
        
        // Flash effect
        videoElement.style.opacity = 0;
        setTimeout(() => videoElement.style.opacity = 1, 100);

        // Capture & Replace
        const imgData = captureFrame();
        capturedImages[retakeIndex] = imgData; // Timpa foto lama di posisi index tersebut
        
        // Reset index retake
        retakeIndex = null; 

    } else {
        // --- MODE SESI BARU (Looping 3/4 foto) ---
        capturedImages = []; // Kosongkan array
        for (let i = 1; i <= selectedTemplate; i++) {
            document.getElementById('photo-instruction').innerText = `Foto ke-${i} dari ${selectedTemplate}`;
            
            await doCountdown();
            
            videoElement.style.opacity = 0;
            setTimeout(() => videoElement.style.opacity = 1, 100);

            const imgData = captureFrame();
            capturedImages.push(imgData);
            
            if(i < selectedTemplate) await new Promise(r => setTimeout(r, 1000));
        }
    }

    // --- SELESAI FOTO ---
    stopCamera();
    
    // Generate ulang strip foto
    await generateStrip(); 
    
    // Render tombol-tombol thumbnail untuk edit
    renderRetakeThumbnails();
    
    showScreen('screen-preview');
}
function doCountdown() {
    return new Promise(resolve => {
        let count = CONFIG.countDownTime;
        countdownOverlay.classList.remove('hidden');
        countdownOverlay.innerText = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownOverlay.innerText = count;
            } else {
                clearInterval(interval);
                countdownOverlay.classList.add('hidden');
                resolve();
            }
        }, 1000);
    });
}

// --- Modifikasi: captureFrame (Smart Crop) ---
function captureFrame() {
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    // Mirroring
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    
    // === TERAPKAN FILTER SEBELUM MENGGAMBAR ===
    if (isBnwMode) {
        // Filter grayscale + sedikit kontras biar bagus
        ctx.filter = 'grayscale(100%) contrast(1.1)';
    } else {
        ctx.filter = 'none';
    }

    // Gambar video ke canvas (filter akan diterapkan di sini)
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // PENTING: Reset filter agar tidak mempengaruhi penggambaran lain nanti
    ctx.filter = 'none'; 

    return canvas.toDataURL('image/png');
}
function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
}

// --- Image Generation (The Logic) ---
// --- Helper: Fungsi untuk memastikan gambar loading dulu ---
const loadImage = (src) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img); // Lanjut kalau gambar siap
        img.onerror = reject;
        img.src = src;
    });
};

// --- Image Generation (YANG SUDAH DIPERBAIKI) ---
// --- Modifikasi: generateStrip (Ukuran Presisi) ---
// --- Modifikasi: generateStrip (Support Custom Frame PNG) ---
async function generateStrip() {
    // 1. Konversi Satuan (mm ke px)
    const pxPerMm = 11.8;
    
    // Dimensi Slot/Area
    const slotW_mm = 57; 
    const slotH_mm = 40; 
    
    // Dimensi Jarak
    const gap_mm = 8;
    const topMargin_mm = 10;
    const bottomMargin_mm = 20;
    const padding_mm = 1; 

    // Hitung Pixel Dasar
    const stripWidth = Math.round(slotW_mm * pxPerMm);   
    const slotHeight = Math.round(slotH_mm * pxPerMm);  
    const gap = Math.round(gap_mm * pxPerMm);             
    const headerHeight = Math.round(topMargin_mm * pxPerMm); 
    const footerHeight = Math.round(bottomMargin_mm * pxPerMm); 
    const paddingPx = Math.round(padding_mm * pxPerMm);

    // Hitung Tinggi Total Kanvas
    const totalHeight = headerHeight + (slotHeight * selectedTemplate) + (gap * (selectedTemplate - 1)) + footerHeight;

    canvas.width = stripWidth;
    canvas.height = totalHeight;

    // 2. Background Putih
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 3. Draw Header Text (Hanya jika TIDAK ada frame custom)
    if (!customFrameImg) {
        ctx.fillStyle = "#FF85A2"; 
        ctx.font = "bold 30px 'Fredoka One'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"; 
        ctx.fillText("FotoSeru ✨", stripWidth / 2, headerHeight / 2);
    }

    // 4. Draw Photos
    try {
        const loadedImages = await Promise.all(capturedImages.map(src => loadImage(src)));
        
        let currentY = headerHeight; 
        
        // Ukuran Foto Sebenarnya (Slot dikurangi padding)
        const imgW = stripWidth - (paddingPx * 2); 
        const imgH = slotHeight - (paddingPx * 2);

        loadedImages.forEach((img) => {
            const drawX = paddingPx;
            const drawY = currentY + paddingPx;

            // === TERAPKAN FILTER (LAGI) SAAT MENYUSUN STRIP ===
            // Ini memastikan foto di strip akhir sesuai mode yang dipilih
            if (isBnwMode) {
                ctx.filter = 'grayscale(100%) contrast(1.1)';
            } else {
                ctx.filter = 'none';
            }

            // Draw Image (Filter diterapkan di sini)
            ctx.drawImage(img, drawX, drawY, imgW, imgH);

            // PENTING: RESET FILTER SEGERA!
            // Agar border hijau dan teks tidak ikut jadi hitam putih
            ctx.filter = 'none'; 
            
            // Draw Border Hijau (Hanya jika TIDAK ada frame custom)
            if (!customFrameImg) {
                ctx.strokeStyle = "#CBF0E0"; 
                ctx.lineWidth = 5;
                ctx.strokeRect(drawX, drawY, imgW, imgH);
            }
            
            currentY += slotHeight + gap;
        });
        // 5. Draw Custom Frame OR Footer Text
        if (customFrameImg) {
            // --- LOGIKA FRAME ---
            // Frame digambar menimpa seluruh kanvas
            // Pastikan desain PNG kamu transparan di bagian foto!
            ctx.drawImage(customFrameImg, 0, 0, canvas.width, canvas.height);
        } else {
            // --- LOGIKA DEFAULT ---
            ctx.textBaseline = "alphabetic"; 
            ctx.fillStyle = "#aaa";
            ctx.font = "15px 'Quicksand'";
            ctx.fillText(new Date().toLocaleDateString('id-ID'), stripWidth / 2, totalHeight - (footerHeight / 2));
        }

        // Update Preview
        const finalDataUrl = canvas.toDataURL('image/png');
        previewImage.src = finalDataUrl;
        finalImage.src = finalDataUrl;

    } catch (error) {
        console.error("Gagal memproses gambar:", error);
    }
}
// --- Fungsi Baru: Menampilkan Thumbnail untuk Edit ---
function renderRetakeThumbnails() {
    const container = document.getElementById('thumbnails-container');
    container.innerHTML = ''; // Bersihkan isi lama

    capturedImages.forEach((imgSrc, index) => {
        // Buat elemen card
        const card = document.createElement('div');
        card.className = 'thumb-card';
        card.onclick = () => initRetakeSingle(index); // Fungsi saat diklik

        // Masukkan gambar
        const img = document.createElement('img');
        img.src = imgSrc;
        
        // Masukkan overlay icon
        const overlay = document.createElement('div');
        overlay.className = 'thumb-overlay';
        overlay.innerHTML = '<span>🔄</span>'; // Icon refresh

        card.appendChild(img);
        card.appendChild(overlay);
        container.appendChild(card);
    });
}

// --- Fungsi Baru: Memulai Ulang 1 Foto Spesifik ---
function initRetakeSingle(index) {
    retakeIndex = index; // Set target index
    showScreen('screen-capture'); // Pindah ke layar kamera
    startCamera(); // Nyalakan kamera
}

// --- Fungsi Update: Ulangi Semua (Menggantikan retakePhotos lama) ---
function retakeAll() {
    // Reset total
    retakeIndex = null;
    showScreen('screen-template'); // Kembali pilih template
}
// --- Finalization ---
function retakePhotos() {
    // Cek waktu, kalau mepet jangan izinkan (opsional)
    showScreen('screen-template');
}

function finalizeSession() {
    clearInterval(sessionTimerInterval); // Stop timer sesi
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
        if (timer <= 0) {
            finishSession();
        }
    }, 1000);
}

// --- Output Actions ---
function downloadImage() {
    const link = document.createElement('a');
    link.download = 'foto-seru-' + Date.now() + '.png';
    link.href = finalImage.src;
    link.click();
}

function printImage() {
    window.print();
}

function finishSession() {
    clearInterval(printTimerInterval);
    showScreen('screen-thankyou');
}

function resetApp() {
    clearInterval(sessionTimerInterval);
    clearInterval(printTimerInterval);
    currentScreen = 'screen-welcome';
    capturedImages = [];
    showScreen('screen-welcome');

}
