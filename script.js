// --- State Variables ---
let currentScreen = 'screen-welcome';
let sessionTimerInterval;
let printTimerInterval;
let retakeIndex = null; 
let capturedImages = [];
let selectedTemplate = 3; 
let videoStream = null;
let customFrameImg = null; 
let isBnwMode = false;
let layoutMode = 'strip'; // 'strip' | 'polaroid'
let printCopies = 1;
let detectedTemplatesP = [];
let captureMode = 'auto'; // 'auto' | 'manual'
let recapEnabled = true;
let recapFrames = [], recapEvery = 1, recapTick = 0, recapTimer = null, recapBuildId = 0, recapUrl = null;

// --- Config ---
const CONFIG = {
    sessionTime: 5 * 60, 
    printTime: 3 * 60,   
    countDownTime: 5,    
    printWidth: 57,      // mm
    photoHeight: 30      // mm
};

// Variabel untuk menyimpan hasil scan otomatis
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

// --- AUTO SCANNER (Jalankan saat awal) ---
function initAutoScan() {
    // Scan asset 3_1.png dst
    scanFiles('3', 1, detectedTemplates3);
    // Scan asset 4_1.png dst
    scanFiles('4', 1, detectedTemplates4);
    scanFiles('p', 1, detectedTemplatesP); // p_1.png, p_2.png ... untuk polaroid
}

function scanFiles(type, index, targetArray) {
    const filename = `${type}_${index}.png`; // misal 3_1.png
    const path = `assets/${filename}`;
    const img = new Image();
    
    img.onload = function() {
        targetArray.push(filename); 
        scanFiles(type, index + 1, targetArray); // Lanjut cek nomor berikutnya
    };
    img.onerror = function() {
        // Stop scanning jika file tidak ditemukan
        console.log(`Scan ${type} selesai. Total: ${targetArray.length}`);
    };
    img.src = path;
}

// Jalankan Scanner
initAutoScan();


// --- Navigation ---
function showScreen(screenId) {
    // Pastikan selector mengambil semua screen yang benar
    const allScreens = document.querySelectorAll('.screen');
    allScreens.forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        currentScreen = screenId;
    } else {
        console.error("Screen ID not found:", screenId);
    }
}

// --- Filter Logic ---
function setFilterMode(mode) {
    isBnwMode = (mode === 'bnw');
}

// --- FLOW ALUR BARU ---

// 1. Tombol Mulai (Welcome Screen)
function startSession() {
    startGlobalTimer(CONFIG.sessionTime);
    globalTimerBox.classList.remove('hidden');
    // MASUK KE PILIH JUMLAH STRIP
    showScreen('screen-strip-select');
}

// 2. Pilih Jumlah Strip (3 atau 4)
function selectStripCount(num) {
    layoutMode = 'strip';
    selectedTemplate = num;
    // MASUK KE GALERI TEMPLATE
    renderTemplateGallery(num);
    showScreen('screen-template-choice');
}

// 3. Render Galeri
function renderTemplateGallery(num) {
    const galleryContainer = document.getElementById('assets-gallery');
    galleryContainer.innerHTML = ''; 

    // Ambil data dari hasil scan
    const list = (num === 'p') ? detectedTemplatesP : (num === 3 ? detectedTemplates3 : detectedTemplates4);

    if (list.length === 0) {
        galleryContainer.innerHTML = '<p style="color:#888;">Tidak ada template bawaan (Cek folder assets).</p>';
        return;
    }

    list.forEach(filename => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        // Saat diklik, load frame dan mulai kamera
        div.onclick = () => loadPremadeFrame('assets/' + filename);

        const img = document.createElement('img');
        img.src = 'assets/' + filename;
        img.style.width = '100px'; // Styling inline simple
        img.style.margin = '5px';
        img.style.cursor = 'pointer';
        
        div.appendChild(img);
        galleryContainer.appendChild(div);
    });
}

// 4a. Load Template Bawaan
function loadPremadeFrame(path) {
    const img = new Image();
    img.onload = () => {
        customFrameImg = img;
        startCameraSequence();
    };
    img.onerror = () => alert("Gagal memuat template.");
    img.src = path;
}

// 4b. Upload Template Custom
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

// 5. Masuk ke Kamera
function startCameraSequence() {
    applyCropGuide();
    resetRecap();
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
        startRecap();
        
        // Apply Filter Live
        videoElement.style.filter = isBnwMode ? 'grayscale(100%) contrast(1.1)' : 'none';

        setTimeout(() => runPhotoSequence(), 1000);
    } catch (err) {
        alert("Gagal kamera: " + err);
    }
}

async function runPhotoSequence() {
    if (retakeIndex !== null) {
        // Mode Retake
        document.getElementById('photo-instruction').innerText = `Mengulang Foto ke-${retakeIndex + 1}`;
        await takeTurn();
        
        // Flash
        videoElement.style.opacity = 0;
        setTimeout(() => videoElement.style.opacity = 1, 100);

        const imgData = captureFrame();
        capturedImages[retakeIndex] = imgData; 
        retakeIndex = null; 
    } else {
        // Mode Normal Sequence
        capturedImages = []; 
        for (let i = 1; i <= selectedTemplate; i++) {
            document.getElementById('photo-instruction').innerText = `Foto ke-${i} dari ${selectedTemplate}`;
            await takeTurn();
            
            videoElement.style.opacity = 0;
            setTimeout(() => videoElement.style.opacity = 1, 100);

            const imgData = captureFrame();
            capturedImages.push(imgData);
            
            if(i < selectedTemplate) await new Promise(r => setTimeout(r, 1000));
        }
    }

    stopCamera();
    await generateStrip(); 
    renderRetakeThumbnails();
    buildRecapGif();
    document.getElementById('caption-box').classList.toggle('hidden', !!customFrameImg);
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

// --- Capture Frame (Fix B&W & Ratio) ---
function captureFrame() {
    shutterFx();
    const targetRatio = layoutMode === 'polaroid' ? 1 : CONFIG.printWidth / CONFIG.photoHeight; 
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
    if (isBnwMode) {
        ctx.filter = 'grayscale(100%) contrast(1.1)';
    }

    ctx.drawImage(
        videoElement, 
        cropX, cropY, cropW, cropH,     
        0, 0, canvas.width, canvas.height 
    );

    ctx.restore(); 
    return canvas.toDataURL('image/png');
}

function stopCamera() {
    stopRecap();
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
}

// --- Helper Image Loader ---
const loadImage = (src) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img); 
        img.onerror = reject;
        img.src = src;
    });
};

// --- Generate Strip (Fix B&W Leak) ---
async function generateStrip() {
    if (layoutMode === 'polaroid') return generatePolaroid();
    await loadVintageFont();
    const pxPerMm = 11.8;
    const slotW_mm = CONFIG.printWidth; 
    const slotH_mm = CONFIG.photoHeight; 
    const gap_mm = 8;
    const topMargin_mm = 10;
    const bottomMargin_mm = 20;
    const padding_mm = 1; 

    const stripWidth = Math.round(slotW_mm * pxPerMm);   
    const slotHeight = Math.round(slotH_mm * pxPerMm);  
    const gap = Math.round(gap_mm * pxPerMm);             
    const headerHeight = Math.round(topMargin_mm * pxPerMm); 
    const footerHeight = Math.round(bottomMargin_mm * pxPerMm); 
    const paddingPx = Math.round(padding_mm * pxPerMm);

    const totalHeight = headerHeight + (slotHeight * selectedTemplate) + (gap * (selectedTemplate - 1)) + footerHeight;

    canvas.width = stripWidth;
    canvas.height = totalHeight;

    // Background Putih
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Header (Jika tanpa custom frame)
    if (!customFrameImg) {
        ctx.fillStyle = "#FF85A2"; 
        ctx.font = "bold 30px 'Fredoka One'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"; 
        ctx.fillText("Avotobooth", stripWidth / 2, headerHeight / 2);
    }

    try {
        const loadedImages = await Promise.all(capturedImages.map(src => loadImage(src)));
        
        let currentY = headerHeight; 
        const imgW = stripWidth - (paddingPx * 2); 
        const imgH = slotHeight - (paddingPx * 2);

        loadedImages.forEach((img) => {
            const drawX = paddingPx;
            const drawY = currentY + paddingPx;

            ctx.save(); 
            if (isBnwMode) {
                ctx.filter = 'grayscale(100%) contrast(1.1)';
            }
            ctx.drawImage(img, drawX, drawY, imgW, imgH);
            ctx.restore(); 

            // Border Hijau (Jika tanpa custom frame)
            if (!customFrameImg) {
                ctx.strokeStyle = "#CBF0E0"; 
                ctx.lineWidth = 5;
                ctx.strokeRect(drawX, drawY, imgW, imgH);
            }
            
            currentY += slotHeight + gap;
        });

        // Overlay Custom Frame
        if (customFrameImg) {
            ctx.drawImage(customFrameImg, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.textBaseline = "alphabetic"; 
            ctx.fillStyle = "#aaa";
            // Tulisan editable di footer (kosong = tidak ada tulisan)
            const raw = (document.getElementById('caption-input').value || '').trim();
            if (raw) {
                const maxW = stripWidth - paddingPx * 2 - 20;
                let lines = raw.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2);
                let fs = lines.length > 1 ? 30 : 38;
                ctx.font = fs + "px " + VINTAGE_FONT;

                // 1 baris yang terlalu panjang dipecah jadi 2 baris di spasi terdekat dari tengah
                if (lines.length === 1 && ctx.measureText(lines[0]).width > maxW) {
                    const w = lines[0].split(' ');
                    if (w.length > 1) {
                        let best = 1, diff = Infinity;
                        for (let i = 1; i < w.length; i++) {
                            const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length);
                            if (d < diff) { diff = d; best = i; }
                        }
                        lines = [w.slice(0, best).join(' '), w.slice(best).join(' ')];
                        fs = 30;
                    }
                }

                let used = fs;
                do { used = fs; ctx.font = used + "px " + VINTAGE_FONT; fs -= 2; }
                while (Math.max(...lines.map(l => ctx.measureText(l).width)) > maxW && fs > 14);

                const lineH = used * 1.25;
                const raise = Math.round(5 * pxPerMm); // naik 5 mm dari tengah footer
                const startY = totalHeight - footerHeight / 2 - raise - ((lines.length - 1) * lineH) / 2;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#222';
                lines.forEach((l, i) => ctx.fillText(l, stripWidth / 2, startY + i * lineH, maxW));
            }
        }

        const finalDataUrl = canvas.toDataURL('image/png');
        previewImage.src = finalDataUrl;
        finalImage.src = finalDataUrl;

    } catch (error) {
        console.error("Generate error:", error);
    }
}

// --- Timer & Logic Lain ---
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
                alert("Waktu sesi habis!");
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

// --- Retake & Print ---
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
    // Balik ke pilih template/kamera
    retakeIndex = null;
    showScreen('screen-strip-select'); // atau screen-template-choice
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
    link.download = 'foto-seru-' + Date.now() + '.png';
    link.href = finalImage.src;
    link.click();
}

// =====================================================
// PRINTER THERMAL BLUETOOTH (SC03h, protokol "cat printer")
// =====================================================
const PRINTER = {
    namePrefix: 'SC03',
    service: 0xAE30,
    writeChar: 0xAE01,
    notifyChar: 0xAE02,
    contentWidth: 360,       // lebar foto saat cetak (dot, maks 384). 8 dot = 1 mm, jadi 360 = 45 mm
    offsetX: -12,            // geser horizontal (dot). Negatif = ke kiri, positif = ke kanan. 8 dot = 1 mm
    topMargin: 0,            // ruang putih di atas foto (dot). 8 dot = 1 mm
    dotsWidth: 384,          // 58 mm = 384 dot
    chunkSize: 100,          // byte per kirim. Kalau hasil cetak acak/putus, turunkan ke 20
    chunkDelay: 15,          // ms jeda antar kirim. Kalau putus-putus, naikkan ke 25-30
    energy: 20000,           // kepadatan titik. Default awal 12000, maksimum 65535. Naikkan bertahap (16000, 20000, 25000, 30000)
    speed: 0x10,             // makin kecil = makin lambat = titik makin padat (default awal 0x20)
    quality: 0x35,           // 0x31 - 0x35, makin besar makin gelap
    feedLines: 0x80,         // jarak kertas keluar setelah cetak
    contrast: 1.4,          // kontras sebelum dithering
    brightness: -15            // -40 s/d +40, naikkan kalau hasil terlalu gelap
};

let printerDevice = null;
let printerChar = null;
let isPrinting = false;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function setPrinterStatus(connected, text) {
    const el = document.getElementById('printer-status');
    if (!el) return;
    el.classList.toggle('on', connected);
    el.classList.toggle('off', !connected);
    el.textContent = text || (connected ? '🖨️ Printer: terhubung' : '🖨️ Printer: belum terhubung');
}

// --- Koneksi ---
async function openGatt() {
    const server = await printerDevice.gatt.connect();
    const service = await server.getPrimaryService(PRINTER.service);
    printerChar = await service.getCharacteristic(PRINTER.writeChar);
    try {
        const n = await service.getCharacteristic(PRINTER.notifyChar);
        await n.startNotifications();
        n.addEventListener('characteristicvaluechanged', e => {
            const v = new Uint8Array(e.target.value.buffer);
            console.log('Printer:', [...v].map(b => b.toString(16).padStart(2, '0')).join(' '));
        });
    } catch (e) { console.warn('Notify tidak aktif:', e.message); }
    setPrinterStatus(true);
}

// Return true kalau siap. Harus dipanggil dari klik pengguna kalau belum pernah dipilih.
async function ensurePrinter() {
    if (!navigator.bluetooth) {
        alert('Browser ini tidak mendukung Web Bluetooth. Pakai Chrome/Edge (Brave: aktifkan flag Web Bluetooth).');
        return false;
    }
    if (printerChar && printerDevice && printerDevice.gatt.connected) return true;

    // Coba sambung ulang ke perangkat yang sudah dipilih (tanpa dialog)
    if (printerDevice) {
        try { await openGatt(); return true; }
        catch (e) { console.warn('Sambung ulang gagal:', e.message); printerDevice = null; }
    }

    // Pertama kali: dialog pilih perangkat
    try {
        printerDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: PRINTER.namePrefix }],
            optionalServices: [PRINTER.service]
        });
        printerDevice.addEventListener('gattserverdisconnected', () => {
            printerChar = null;
            setPrinterStatus(false);
        });
        await openGatt();
        return true;
    } catch (e) {
        printerDevice = null;
        setPrinterStatus(false);
        if (e.name !== 'NotFoundError') alert('Gagal menghubungkan printer: ' + e.message);
        return false;
    }
}

async function connectPrinterClick() {
    setPrinterStatus(false, '🖨️ Menyambung...');
    await ensurePrinter();
}

// --- Protokol paket ---
function crc8(data) {
    let crc = 0;
    for (const b of data) {
        crc ^= b;
        for (let i = 0; i < 8; i++) crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xFF : (crc << 1) & 0xFF;
    }
    return crc;
}
function pkt(cmd, data) {
    const d = Array.from(data);
    return [0x51, 0x78, cmd, 0x00, d.length & 0xFF, d.length >> 8, ...d, crc8(d), 0xFF];
}

// --- Gambar -> baris bitmap 1-bit (dithering Floyd-Steinberg) ---
async function imageToPrintLines(src) {
    const img = await loadImage(src);
    const W = PRINTER.dotsWidth;
    const cw = Math.min(W, PRINTER.contentWidth);
    const ch = Math.round(img.height * cw / img.width);
    const x0 = Math.max(0, Math.min(W - cw, Math.round((W - cw) / 2 + PRINTER.offsetX)));
    const y0 = PRINTER.topMargin;
    const H = ch + y0;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, W, H);
    cx.drawImage(img, x0, y0, cw, ch);

    const px = cx.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
        let v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        v = (v - 128) * PRINTER.contrast + 128 + PRINTER.brightness;
        g[i] = Math.max(0, Math.min(255, v));
    }

    const BPL = W / 8;
    const lines = [];
    for (let y = 0; y < H; y++) {
        const line = new Uint8Array(BPL);
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const old = g[i];
            const nw = old < 128 ? 0 : 255;
            const err = old - nw;
            if (x + 1 < W) g[i + 1] += err * 7 / 16;
            if (y + 1 < H) {
                if (x > 0) g[i + W - 1] += err * 3 / 16;
                g[i + W] += err * 5 / 16;
                if (x + 1 < W) g[i + W + 1] += err * 1 / 16;
            }
            if (nw === 0) line[x >> 3] |= 1 << (x & 7); // 1 = titik hitam, LSB dulu
        }
        lines.push(line);
    }
    return lines;
}

async function writeChunk(chunk) {
    for (let t = 0; t < 5; t++) {
        try { await printerChar.writeValueWithoutResponse(chunk); return; }
        catch (e) { await sleep(30); }
    }
    throw new Error('Koneksi ke printer terputus saat mengirim data.');
}

async function sendToPrinter(bytes, onProgress) {
    for (let i = 0; i < bytes.length; i += PRINTER.chunkSize) {
        await writeChunk(bytes.slice(i, i + PRINTER.chunkSize));
        if (onProgress) onProgress(Math.min(100, Math.round((i / bytes.length) * 100)));
        await sleep(PRINTER.chunkDelay);
    }
}

// --- Tombol Cetak ---
async function printImage() {
    if (isPrinting) return;

    // Tanpa Web Bluetooth: pakai dialog print biasa
    if (!navigator.bluetooth) {
        if (confirm('Web Bluetooth tidak tersedia. Cetak lewat dialog print biasa?')) window.print();
        return;
    }

    const btn = document.getElementById('btn-print');
    const originalText = btn.textContent;
    isPrinting = true;
    btn.disabled = true;

    try {
        btn.textContent = 'Menyambung printer...';
        if (!(await ensurePrinter())) return;

        btn.textContent = 'Menyiapkan gambar...';
        const lines = await imageToPrintLines(finalImage.src);

        const out = [];
        out.push(...pkt(0xA3, [0x00]));
        out.push(...pkt(0xA4, [PRINTER.quality]));
        out.push(...pkt(0xA6, [0xAA,0x55,0x17,0x38,0x44,0x5F,0x5F,0x5F,0x44,0x38,0x2C]));
        out.push(...pkt(0xAF, [PRINTER.energy & 0xFF, (PRINTER.energy >> 8) & 0xFF]));
        out.push(...pkt(0xBE, [0x00]));
        out.push(...pkt(0xBD, [PRINTER.speed]));
        for (const line of lines) out.push(...pkt(0xA2, line));
        out.push(...pkt(0xA1, [PRINTER.feedLines, 0x00]));
        out.push(...pkt(0xA6, [0xAA,0x55,0x17,0,0,0,0,0,0,0,0x17]));
        out.push(...pkt(0xA3, [0x00]));

        const data = new Uint8Array(out);
        for (let c = 1; c <= printCopies; c++) {
            await sendToPrinter(data, (p) => {
                btn.textContent = `Mencetak ${c}/${printCopies}... ${p}%`;
            });
            if (c < printCopies) await sleep(3000);
        }

        btn.textContent = 'Selesai dikirim ✅';
        await sleep(1500);
    } catch (e) {
        console.error(e);
        alert('Gagal mencetak: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
        isPrinting = false;
    }
}

function finishSession() {
    if (isPrinting) return; // tunggu pengiriman ke printer selesai
    clearInterval(printTimerInterval);
    showScreen('screen-thankyou');
}

function resetApp() {
    clearInterval(sessionTimerInterval);
    clearInterval(printTimerInterval);
    currentScreen = 'screen-welcome';
    capturedImages = [];
    customFrameImg = null; // Reset frame
    layoutMode = 'strip';
    setCopies(1);
    resetRecap(); stopRecap();
    document.querySelector('input[name=copies][value="1"]').checked = true;
    document.getElementById('caption-input').value = '';
    showScreen('screen-welcome');
}

// =====================================================
// FITUR TAMBAHAN: Polaroid, efek jepret, opsi sesi
// =====================================================
function selectPolaroid() {
    layoutMode = 'polaroid';
    selectedTemplate = 1;
    renderTemplateGallery('p');
    showScreen('screen-template-choice');
}

function noFrame() {
    customFrameImg = null;
    startCameraSequence();
}

function setCountdown(n) { CONFIG.countDownTime = n; }
function setCopies(n) { printCopies = n; }

function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
}

// Panduan crop mengikuti layout (strip lebar / polaroid persegi)
function applyCropGuide() {
    const g = document.querySelector('.crop-guide');
    if (layoutMode === 'polaroid') {
        g.style.width = 'auto'; g.style.height = '100%'; g.style.aspectRatio = '1 / 1';
    } else {
        g.style.width = '100%'; g.style.height = 'auto'; g.style.aspectRatio = '57 / 30';
    }
}

// Kilatan putih + bunyi "bip" saat foto diambil
function shutterFx() {
    const f = document.getElementById('flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    try {
        const a = new (window.AudioContext || window.webkitAudioContext)();
        const o = a.createOscillator(), g = a.createGain();
        o.frequency.value = 880; g.gain.value = 0.08;
        o.connect(g); g.connect(a.destination);
        o.start(); o.stop(a.currentTime + 0.12);
    } catch (e) {}
}

let captionTimer;
function onCaptionInput() {
    clearTimeout(captionTimer);
    captionTimer = setTimeout(generateStrip, 250);
}

// Polaroid: 1 foto persegi + margin bawah tebal untuk tulisan
async function generatePolaroid() {
    await loadVintageFont();
    const pxPerMm = 11.8;
    const W = Math.round(CONFIG.printWidth * pxPerMm);
    const pad = Math.round(4 * pxPerMm);
    const photo = W - pad * 2;
    const bottom = Math.round(20 * pxPerMm);

    canvas.width = W;
    canvas.height = pad + photo + bottom;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
        const img = await loadImage(capturedImages[0]);
        ctx.save();
        if (isBnwMode) ctx.filter = 'grayscale(100%) contrast(1.1)';
        ctx.drawImage(img, pad, pad, photo, photo);
        ctx.restore();

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.strokeRect(pad, pad, photo, photo);

        if (customFrameImg) {
            ctx.drawImage(customFrameImg, 0, 0, canvas.width, canvas.height);
        } else {
            const caption = (document.getElementById('caption-input').value || 'Avotobooth').replace(/\s*\n\s*/g, ' ').trim();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const rowY = pad + photo + bottom * 0.45;
            const stamp = formatStamp();

            // Tanggal: rata kanan
            ctx.fillStyle = '#2b2623';
            ctx.textAlign = 'right';
            ctx.font = "26px " + VINTAGE_FONT;
            if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
            const dateW = ctx.measureText(stamp).width;
            ctx.fillText(stamp, W - pad, rowY);
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

            // Tulisan: rata kiri, ukuran mengecil otomatis agar tidak menabrak tanggal
            const maxW = photo - dateW - 24;
            let fs = 38;
            do { ctx.font = fs + "px " + VINTAGE_FONT; fs -= 2; }
            while (ctx.measureText(caption).width > maxW && fs > 16);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#222';
            ctx.fillText(caption, pad, rowY, maxW);
        }

        const url = canvas.toDataURL('image/png');
        previewImage.src = url;
        finalImage.src = url;
    } catch (e) { console.error('Polaroid error:', e); }
}


// =====================================================
// MODE MANUAL (tombol jepret)
// =====================================================
function setCaptureMode(m) { captureMode = m; }
function setRecap(on) { recapEnabled = on; }

function takeTurn() { return captureMode === 'manual' ? waitShutter() : doCountdown(); }

function waitShutter() {
    return new Promise(resolve => {
        const btn = document.getElementById('shutter-btn');
        const hint = document.getElementById('photo-instruction');
        hint.innerText += ' • tekan tombol Jepret (atau Spasi)';
        btn.classList.remove('hidden');
        const done = () => {
            btn.classList.add('hidden');
            btn.onclick = null;
            document.removeEventListener('keydown', onKey);
            resolve();
        };
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); done(); }
        };
        btn.onclick = done;
        document.addEventListener('keydown', onKey);
    });
}

// =====================================================
// REKAP GIF (merekam selama sesi memotret)
// =====================================================
const GIF_LIB = 'https://unpkg.com/gifenc@1.0.3/dist/gifenc.esm.js';
const RECAP_W = 300;     // lebar GIF (px)
const RECAP_MAX = 150;   // batas frame; kalau lewat, frame dijarangkan otomatis
const recapCanvas = document.createElement('canvas');
const recapCtx = recapCanvas.getContext('2d', { willReadFrequently: true });

function startRecap() {
    if (!recapEnabled) return;
    clearInterval(recapTimer);
    recapTimer = setInterval(grabRecapFrame, 250); // ~4 frame per detik
    document.getElementById('rec-dot').classList.remove('hidden');
}

function stopRecap() {
    clearInterval(recapTimer);
    document.getElementById('rec-dot').classList.add('hidden');
}

function resetRecap() {
    recapFrames = []; recapEvery = 1; recapTick = 0; recapBuildId++;
    if (recapUrl) { URL.revokeObjectURL(recapUrl); recapUrl = null; }
    document.getElementById('recap-box').classList.add('hidden');
}

function grabRecapFrame() {
    if (!videoElement.videoWidth) return;
    if ((recapTick++ % recapEvery) !== 0) return;

    const ratio = layoutMode === 'polaroid' ? 1 : CONFIG.printWidth / CONFIG.photoHeight;
    const vw = videoElement.videoWidth, vh = videoElement.videoHeight;
    let cw, ch;
    if (vw / vh > ratio) { ch = vh; cw = vh * ratio; } else { cw = vw; ch = vw / ratio; }
    const W = RECAP_W, H = Math.round(W / ratio);

    recapCanvas.width = W; recapCanvas.height = H;
    recapCtx.save();
    recapCtx.translate(W, 0); recapCtx.scale(-1, 1);
    if (isBnwMode) recapCtx.filter = 'grayscale(100%) contrast(1.1)';
    recapCtx.drawImage(videoElement, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H);
    recapCtx.restore();
    recapFrames.push(recapCtx.getImageData(0, 0, W, H));

    if (recapFrames.length > RECAP_MAX) {
        recapFrames = recapFrames.filter((_, i) => i % 2 === 0);
        recapEvery *= 2;
    }
}

async function buildRecapGif() {
    const box = document.getElementById('recap-box');
    const st = document.getElementById('recap-status');
    const img = document.getElementById('recap-img');
    const dl = document.getElementById('recap-dl');
    if (!recapEnabled || recapFrames.length < 3) { box.classList.add('hidden'); return; }

    const id = ++recapBuildId;
    box.classList.remove('hidden');
    img.classList.add('hidden'); dl.classList.add('hidden');
    st.textContent = '⏳ Membuat rekap GIF...';

    try {
        const { GIFEncoder, quantize, applyPalette } = await import(GIF_LIB);
        const gif = GIFEncoder();
        const delay = 250 * recapEvery;
        for (const f of recapFrames) {
            if (id !== recapBuildId) return; // dibatalkan (sesi baru / retake)
            const palette = quantize(f.data, 256);
            gif.writeFrame(applyPalette(f.data, palette), f.width, f.height, { palette, delay });
            await sleep(0); // beri napas ke UI
        }
        gif.finish();
        if (recapUrl) URL.revokeObjectURL(recapUrl);
        recapUrl = URL.createObjectURL(new Blob([gif.bytes()], { type: 'image/gif' }));
        img.src = recapUrl;
        img.classList.remove('hidden'); dl.classList.remove('hidden');
        st.textContent = '🎞️ Rekap GIF siap';
    } catch (e) {
        console.error(e);
        st.textContent = 'Gagal membuat GIF (butuh internet untuk memuat pustaka gifenc).';
    }
}

function downloadRecap() {
    if (!recapUrl) return;
    const a = document.createElement('a');
    a.href = recapUrl;
    a.download = 'rekap-avotobooth-' + Date.now() + '.gif';
    a.click();
}


// =====================================================
// TIMESTAMP GAYA POLAROID VINTAGE  ->  "1 5  OCT  2023"
// =====================================================
const VINTAGE_FONT = "'Special Elite', 'Courier New', monospace";
const STAMP_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatStamp(date = new Date()) {
    const d = String(date.getDate()).padStart(2, '0').split('').join(' ');
    return `${d}  ${STAMP_MONTHS[date.getMonth()]}  ${date.getFullYear()}`;
}

async function loadVintageFont() {
    try { await document.fonts.load("34px 'Special Elite'"); } catch (e) {}
}
