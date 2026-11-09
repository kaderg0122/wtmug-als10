// ============================================================
//  ALŞ09 — WebRTC P2P Sınıfı (Blob/File destekli)
// ============================================================
export const CHUNK_SIZE = 16 * 1024;
export const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export class P2P {
  constructor({ onState, onMessage, onFileProgress, onFileDone, onFileStart } = {}) {
    this.onState = onState || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onFileProgress = onFileProgress || (() => {});
    this.onFileDone = onFileDone || (() => {});
    this.onFileStart = onFileStart || (() => {});

    this.pc = new RTCPeerConnection(ICE);
    this.dc = null;
    this._incoming = null;

    this.pc.onconnectionstatechange = () => this.onState(this.pc.connectionState);
    this.pc.ondatachannel = (ev) => this._bindChannel(ev.channel);
  }

  _bindChannel(ch) {
    this.dc = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => this.onState('connected');
    ch.onclose = () => this.onState('disconnected');
    ch.onerror = (e) => this.onState('error:' + (e.message || 'unknown'));
    ch.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        this._handleControl(msg);
      } else {
        this._handleBinary(new Uint8Array(ev.data));
      }
    };
  }

  _handleControl(msg) {
    if (msg.t === 'text') {
      this.onMessage({ kind: 'text', text: msg.v });
    } else if (msg.t === 'file-start') {
      this._incoming = { name: msg.name, type: msg.type, size: msg.size, received: [], bytes: 0 };
      this.onFileStart(this._incoming);
    } else if (msg.t === 'file-end') {
      const inc = this._incoming;
      if (!inc) return;
      const blob = new Blob(inc.received, { type: inc.type || 'application/octet-stream' });
      this.onFileDone({ name: inc.name, type: inc.type, size: inc.size, blob });
      this._incoming = null;
    }
  }

  _handleBinary(chunk) {
    if (!this._incoming) return;
    this._incoming.received.push(chunk);
    this._incoming.bytes += chunk.byteLength;
    this.onFileProgress({
      direction: 'recv', name: this._incoming.name,
      loaded: this._incoming.bytes, total: this._incoming.size
    });
  }

  async createOffer() {
    this.dc = this.pc.createDataChannel('data');
    this._bindChannel(this.dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._waitIce();
    return JSON.stringify(this.pc.localDescription);
  }

  async acceptOfferAndAnswer(offerJson) {
    const desc = JSON.parse(offerJson);
    await this.pc.setRemoteDescription(desc);
    const ans = await this.pc.createAnswer();
    await this.pc.setLocalDescription(ans);
    await this._waitIce();
    return JSON.stringify(this.pc.localDescription);
  }

  async acceptAnswer(answerJson) {
    const desc = JSON.parse(answerJson);
    await this.pc.setRemoteDescription(desc);
  }

  _waitIce() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') return resolve();
      const check = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 3000);
    });
  }

  sendText(text) {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    this.dc.send(JSON.stringify({ t: 'text', v: text }));
    return true;
  }

  async sendFile(fileOrBlob, name) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    const ch = this.dc;
    const fname = name || fileOrBlob.name || 'dosya.bin';
    const ftype = fileOrBlob.type || 'application/octet-stream';

    ch.bufferedAmountLowThreshold = 256 * 1024;
    ch.send(JSON.stringify({ t: 'file-start', name: fname, type: ftype, size: fileOrBlob.size }));

    let offset = 0;
    const reader = new FileReader();
    const readSlice = (start, end) => new Promise((res, rej) => {
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(reader.error);
      reader.readAsArrayBuffer(fileOrBlob.slice(start, end));
    });

    while (offset < fileOrBlob.size) {
      const end = Math.min(offset + CHUNK_SIZE, fileOrBlob.size);
      const buf = await readSlice(offset, end);
      if (ch.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise(r => { ch.onbufferedamountlow = r; });
      }
      ch.send(buf);
      offset = end;
      this.onFileProgress({ direction: 'send', name: fname, loaded: offset, total: fileOrBlob.size });
    }
    ch.send(JSON.stringify({ t: 'file-end' }));
  }

  close() {
    try { this.dc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    this.onState('closed');
  }
}