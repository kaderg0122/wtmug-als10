export function addMessage(chatEl, { who, text, time }) {
  const div = document.createElement('div');
  div.className = 'msg ' + (who === 'me' ? 'me' : 'them');
  div.textContent = text;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = new Date(time || Date.now()).toLocaleTimeString();
  div.appendChild(meta);
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

export function addFileCard(chatEl, { who, name, type, size, url }) {
  const div = document.createElement('div');
  div.className = 'msg ' + (who === 'me' ? 'me' : 'them');
  const title = document.createElement('div');
  title.innerHTML = `<b>${escapeHtml(name)}</b> <span class="small">(${fmtBytes(size)})</span>`;
  div.appendChild(title);

  if (type && type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = url; img.alt = name;
    div.appendChild(img);
  } else if (type && type.startsWith('video/')) {
    const v = document.createElement('video');
    v.src = url; v.controls = true; v.preload = 'metadata';
    div.appendChild(v);
  } else if (type && type.startsWith('audio/')) {
    const a = document.createElement('audio');
    a.src = url; a.controls = true;
    div.appendChild(a);
  }

  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.textContent = 'İndir';
  a.className = 'small';
  a.style.display = 'inline-block';
  a.style.marginTop = '6px';
  a.style.color = '#7dd3fc';
  div.appendChild(a);

  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

export function makeProgress(chatEl) {
  const wrap = document.createElement('div');
  wrap.className = 'msg them';
  const label = document.createElement('div');
  label.className = 'small';
  const bar = document.createElement('div');
  bar.className = 'progress';
  const fill = document.createElement('i');
  bar.appendChild(fill);
  wrap.appendChild(label);
  wrap.appendChild(bar);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;

  return {
    update(loaded, total, dir) {
      const pct = total ? Math.round((loaded / total) * 100) : 0;
      fill.style.width = pct + '%';
      label.textContent = `${dir === 'send' ? 'Gönderiliyor' : 'Alınıyor'}: ${pct}% (${fmtBytes(loaded)} / ${fmtBytes(total)})`;
    },
    remove() { wrap.remove(); }
  };
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}