// ============================================================
//  Ortak QR yardımcısı — üret (qrcode-generator) + oku (jsQR)
//  Kütüphaneler index.html/als08.html/als09.html'de <script> ile yüklenir.
// ============================================================

// Kütüphanelerin hazır olmasını bekle
function waitForLib(checkFn, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (checkFn()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Kütüphane zaman aşımına uğradı (CDN engellenmiş olabilir)'));
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

// ------------------------------------------------------------
//  QR ÜRET (canvas döner)
// ------------------------------------------------------------
window.makeQR = async function (text, size = 320) {
  await waitForLib(() => typeof qrcode !== 'undefined');
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cells = qr.getModuleCount();
    const cell = Math.floor(size / cells);
    const offset = Math.floor((size - cells * cell) / 2);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
        }
      }
    }
    return canvas;
  } catch (e) {
    throw new Error('QR üretim hatası: ' + e.message);
  }
};

// ------------------------------------------------------------
//  QR OKU (video elementi + callback)
// ------------------------------------------------------------
window.scanQR = async function (videoEl, onResult) {
  await waitForLib(() => typeof jsQR !== 'undefined');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;

  const loop = () => {
    if (stopped) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        stopped = true;
        onResult(code.data);
        return;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return { stop: () => { stopped = true; } };
};