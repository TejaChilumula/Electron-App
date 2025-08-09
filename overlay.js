// overlay.js
const mirror    = document.getElementById('mirror');
const web       = document.getElementById('web');
const closeBtn  = document.getElementById('close');
const chromeBar = document.getElementById('chrome');
const glass     = document.getElementById('glass');
const hintEl    = document.getElementById('hint');

let S = null;
let ws = null;
let msgN = 0;

const log = (...a) => console.log('[OverlayWS]', ...a);

// small status indicator in titlebar
function setStatus(txt, color) {
  if (!hintEl) return;
  const base = '⌥⇧J/K scroll — ⌥⇧T toggle click-through';
  const dot  = `<span style="display:inline-block;width:.6em;height:.6em;border-radius:50%;background:${color};vertical-align:baseline;margin-right:.4em"></span>`;
  hintEl.innerHTML = `${dot}${txt} &nbsp;•&nbsp; ${base}`;
}

// lite markdown renderer (bold/italic/inline + fenced)
// --- smarter markdown renderer: paragraphs, lists, headings, quotes + inline ---
// --- smarter markdown renderer: paragraphs, lists, headings, quotes + inline ---
function renderLiteMD(src) {
  if (!src) return '';

  // Normalize newlines (CRLF → LF)
  src = src.replace(/\r\n?/g, '\n').trim();

  // 1) extract fenced code blocks first
  const fences = [];
  src = src.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = fences.push({ lang: lang || '', code }) - 1;
    return `\uFFF0${i}\uFFF1`; // placeholder token
  });

  const esc = s => s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const inline = s =>
    esc(s)
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 2) line-by-line block parser (handles lists without blank-line guards)
  const lines = src.split('\n');
  const out = [];
  let buf = [];                   // current paragraph buffer

  const flushPara = () => {
    if (!buf.length) return;
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(`<p>${inline(text)}</p>`);
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];

    // code placeholder as a standalone block
    const ph = L.match(/^\uFFF0(\d+)\uFFF1$/);
    if (ph) {
      flushPara();
      const { lang, code } = fences[+ph[1]];
      out.push(`<pre><code data-lang="${esc(lang)}">${esc(code)}</code></pre>`);
      continue;
    }

    // blank line → paragraph break
    if (/^\s*$/.test(L)) { flushPara(); continue; }

    // heading
    const h = L.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      continue;
    }

    // blockquote (consume consecutive > lines)
    if (/^\s*>\s?/.test(L)) {
      flushPara();
      let q = L.replace(/^\s*>\s?/, '');
      while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) {
        q += ' ' + lines[++i].replace(/^\s*>\s?/, '');
      }
      out.push(`<blockquote><p>${inline(q.replace(/\s+/g, ' ').trim())}</p></blockquote>`);
      continue;
    }

    // list (ordered or unordered) — consume contiguous items
    if (/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(L)) {
      flushPara();
      const isOrdered = /^\s*\d+\.\s+/.test(L);
      const re = isOrdered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      const items = [];
      let j = i;
      while (j < lines.length && re.test(lines[j])) {
        const m = re.exec(lines[j]); items.push(m[1]);
        j++;
      }
      i = j - 1; // advance
      out.push(
        (isOrdered ? '<ol>' : '<ul>') +
        items.map(t => `<li>${inline(t.trim())}</li>`).join('') +
        (isOrdered ? '</ol>' : '</ul>')
      );
      continue;
    }

    // default: accumulate paragraph
    buf.push(L.trim());
  }
  flushPara();

  // 3) wrap for styling and return
  return `<div class="md">${out.join('\n')}</div>`;
}



// websocket
function connectWS() {
  if (!S?.wsBase || !S?.room) { log('no wsBase/room'); setStatus('Idle', '#777'); return; }
  let base = S.wsBase.trim();
  if (!/[?&]ws=1\b/.test(base)) base += (base.includes('?') ? '&' : '?') + 'ws=1';
  const url = `${base}&room=${encodeURIComponent(S.room)}&k=${encodeURIComponent(S.pass || '')}`;

  try { ws?.close(); } catch {}
  msgN = 0; log('connecting →', url); setStatus('Connecting…', '#d4b106');

  ws = new WebSocket(url);
  ws.addEventListener('open',  () => { log('open'); setStatus('Connected', '#23d160'); });
  ws.addEventListener('error', (e) => { log('error', e); setStatus('Error', '#ff3860'); });
  ws.addEventListener('close', (e) => { log('close', e.code, e.reason); setStatus('Closed', '#ff3860'); });

  ws.addEventListener('message', (e) => {
    let data = null; try { data = JSON.parse(e.data); } catch { data = { t: e.data }; }
    const txt = data?.t || '', isMD = !!data?.md;
    const nearBottom = mirror.scrollTop + mirror.clientHeight >= mirror.scrollHeight - 8;
    mirror[isMD ? 'innerHTML' : 'textContent'] = isMD ? renderLiteMD(txt) : (txt || '(waiting…)');
    if (nearBottom) mirror.scrollTop = mirror.scrollHeight;
    msgN++; log(`message #${msgN}`, 'len=', txt.length, isMD?'(md)':'(text)', (txt||'').slice(0,120));
  });
}
function teardownWS(){ try { ws?.close(); } catch {} ws=null; setStatus('Idle','#777'); }

// apply state
function applyState(s){
  S = s;

  // look
  if (s.blur) {
    glass.style.backdropFilter='blur(8px)';
    glass.style.webkitBackdropFilter='blur(8px)';
    glass.style.background=`rgba(20,20,20,${1 - (s.opacity ?? 0.9)})`;
    chromeBar.style.background='rgba(0,0,0,0.35)';
    mirror.style.textShadow='none';
  } else {
    glass.style.backdropFilter='none';
    glass.style.webkitBackdropFilter='none';
    glass.style.background='transparent';
    chromeBar.style.background='rgba(0,0,0,0.20)';
    mirror.style.textShadow='0 1px 2px rgba(0,0,0,.9)';
  }

  // mode
  if (s.mode === 'mirror') { mirror.classList.remove('hidden'); web.classList.add('hidden'); connectWS(); }
  else { teardownWS(); web.classList.remove('hidden'); mirror.classList.add('hidden'); if (s.url) web.src = s.url; }
}

window.electronAPI.onState((s)=>{ console.log('[Overlay] applyState', s); applyState(s); });

// keyboard tiny scroll (always available)
window.electronAPI.onScroll((dy)=>{
  const el = (S?.mode === 'mirror') ? mirror : web;
  try{
    if (S?.mode === 'mirror') el.scrollTop = Math.max(0, (el.scrollTop || 0) + dy);
    else web.executeJavaScript(`try{window.scrollBy(0, ${dy})}catch(e){}`).catch(()=>{});
  }catch{}
});

// make titlebar clickable even when click-through is enabled (for ✕ and dragging)
// (if you don't want this, delete these two listeners)
chromeBar.addEventListener('mouseenter', () => window.electronAPI.setClickThrough(false));
chromeBar.addEventListener('mouseleave', () => window.electronAPI.setClickThrough(!!S?.clickThrough));

closeBtn.onclick = () => window.electronAPI.closeOverlay();
window.addEventListener('beforeunload', () => { try { ws?.close(); } catch {} });
