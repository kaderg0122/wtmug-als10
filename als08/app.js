// ============================================================
//  ALŞ08 — PeerJS tabanlı hoca/öğrenci dosya paylaşımı
// ============================================================
const CHUNK_SIZE = 16 * 1024;
const RECEIVED_DB = 'wtmug_received';

let peer = null;
let currentRole = null;
let selectedFile = null;
let activeConnections = [];
let myId = null;
let peerOpenBound = false;

function $(id) { return document.getElementById(id); }

function goHome() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-role').classList.add('active');
  if (peer) { peer.destroy(); peer = null; peerOpenBound = false; }
  activeConnections = [];
  stopScanner();
  currentRole = null;
  selectedFile = null;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
}

$('btn-teacher').onclick = () => { currentRole = 'teacher'; startTeacher(); };
$('btn-student').onclick = () => { currentRole = 'student'; startStudent(); };

// ---------- IndexedDB ----------
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(RECEIVED_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('files'))
        req.result.createObjectStore('files');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbPut(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ============================================================
//  HOCA MODU
// ============================================================
function startTeacher() {
  showScreen('screen-teacher');

  $('teacher-file').onchange = (e) => {
    selectedFile = e.target.files[0];
    if (!selectedFile) return;
    $('file-info').textContent = `✅ ${selectedFile.name} (${formatSize(selectedFile.size)})`;
    $('log-section').style.display = 'block';
    if (peer && myId) showQr();
  };

  if (typeof Peer === 'undefined') {
    log('❌ PeerJS yüklenemedi — internet bağlantısını kontrol edin');
    return;
  }

  peer = new Peer(undefined, { debug: 0 });

  peer.on('open', (id) => {
    myId = id;
    $('peer-id').textContent = id;
    $('qr-section').style.display = 'block';
    showQr();
    log('✅ Hoca hazır. ID: ' + id);
  });

  peer.on('error', (err) => {
    log('❌ Peer hatası: ' + err.type);
  });

  peer.on('connection', (conn) => {
    log(`🔗 Öğrenci bağlandı: ${conn.peer}`);
    const entry = { conn, studentId: conn.peer, sent: 0, total: selectedFile ? selectedFile.size : 0 };
    activeConnections.push(entry);
    updateStudentCount();
    addLogForStudent(entry);

    conn.on('open', () => { if (selectedFile) sendFile(conn, entry); });
    conn.on('data', (msg) => { if (msg && msg.type === 'received') log(`✅ ${conn.peer} dosyayı tamamen aldı`); });
    conn.on('close', () => log(`🔌 ${conn.peer} ayrıldı`));
  });
}

function showQr() {
  if (typeof qrcode === 'undefined') { setTimeout(showQr, 200); return; }
  try {
    const qr = qrcode(0, 'M');
    qr.addData(myId);
    qr.make();
    $('qr-box').innerHTML = qr.createImgTag(6, 8);
  } catch (e) {
    $('qr-box').textContent = '❌ QR hatası: ' + e.message;
    console.error(e);
  }
}

function copyId() {
  navigator.clipboard.writeText(myId);
  log('📋 ID kopyalandı');
}

function updateStudentCount() {
  $('student-count').textContent = activeConnections.length;
}

function log(text) {
  const div = document.createElement('div');
  div.className = 'log-item';
  div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  $('log-list').prepend(div);
}

function addLogForStudent(entry) {
  const div = document.createElement('div');
  div.className = 'log-item';
  div.id = 'log-' + entry.studentId;
  div.textContent = `📥 ${entry.studentId}: 0%`;
  $('log-list').prepend(div);
}

function updateStudentProgress(entry, pct) {
  const div = document.getElementById('log-' + entry.studentId);
  if (div) div.textContent = `📥 ${entry.studentId}: ${pct}%`;
}

async function sendFile(conn, entry) {
  const file = selectedFile;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  conn.send({ type: 'meta', name: file.name, size: file.size, totalChunks });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const buffer = await file.slice(start, end).arrayBuffer();
    while (conn.dataChannel && conn.dataChannel.bufferedAmount > 1024 * 1024) {
      await new Promise(r => setTimeout(r, 20));
    }
    conn.send({ type: 'chunk', index: i, data: buffer });
    entry.sent = end;
    updateStudentProgress(entry, Math.round((entry.sent / file.size) * 100));
  }

  conn.send({ type: 'end' });
  log(`✅ ${conn.peer} → gönderim tamamlandı (100%)`);
}

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

// ============================================================
//  ÖĞRENCİ MODU
// ============================================================
function startStudent() {
  showScreen('screen-student');
  if (isMobile()) $('btn-scan-qr').style.display = 'block';
  $('btn-connect').onclick = connectToTeacher;
  $('btn-scan-qr').onclick = startScanner;
}

function connectToTeacher() {
  const teacherId = $('teacher-id-input').value.trim();
  if (!teacherId) { alert("Hocanın ID'sini girin"); return; }

  if (!peer) {
    peer = new Peer(undefined, { debug: 0 });
    peer.on('error', (err) => alert('Bağlantı hatası: ' + err.type));
  }

  const doConnect = () => {
    const conn = peer.connect(teacherId);
    $('receive-section').style.display = 'block';
    $('receive-status').textContent = 'Bağlanıyor...';

    let receivedChunks = [];
    let meta = null;

    conn.on('open', () => $('receive-status').textContent = 'Bağlandı, dosya bekleniyor...');

    conn.on('data', async (msg) => {
      if (!msg) return;

      if (msg.type === 'meta') {
        meta = msg;
        receivedChunks = new Array(msg.totalChunks);
        $('receive-name').textContent = `${msg.name} (${formatSize(msg.size)})`;
        $('receive-status').textContent = 'Alınıyor...';
      }

      if (msg.type === 'chunk') {
        receivedChunks[msg.index] = msg.data;
        const pct = Math.round((receivedChunks.filter(Boolean).length / meta.totalChunks) * 100);
        $('receive-progress').value = pct;
        $('receive-status').textContent = `Alınıyor... %${pct}`;
      }

      if (msg.type === 'end') {
        const blob = new Blob(receivedChunks, { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = $('download-btn');
        a.href = url;
        a.download = meta.name;
        a.style.display = 'block';
        $('receive-progress').value = 100;
        $('receive-status').textContent = '✅ Tamamlandı!';
        conn.send({ type: 'received' });

        try {
          await idbPut('lastFile', { name: meta.name, type: blob.type, blob, ts: Date.now() });
          $('receive-status').textContent = '✅ Tamamlandı! (ALŞ09 için hazır)';
        } catch (e) { console.error('IDB kayıt hatası:', e); }
      }
    });

    conn.on('error', (err) => $('receive-status').textContent = '❌ Hata: ' + err);
  };

  if (peer.open) doConnect();
  else if (!peerOpenBound) {
    peerOpenBound = true;
    peer.on('open', doConnect);
  }
}

// ---------- QR TARAMA ----------
let scanStream = null;
let scanning = false;

async function startScanner() {
  $('scan-section').style.display = 'block';
  const video = $('scan-video');

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = scanStream;
    await video.play();
    scanning = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick() {
      if (!scanning) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code && code.data) {
          $('teacher-id-input').value = code.data;
          stopScanner();
          connectToTeacher();
          return;
        }
      }
      requestAnimationFrame(tick);
    }
    tick();
  } catch (e) {
    alert('Kamera açılamadı: ' + e.message);
    $('scan-section').style.display = 'none';
  }
}

function stopScanner() {
  scanning = false;
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  const sec = $('scan-section');
  if (sec) sec.style.display = 'none';
}