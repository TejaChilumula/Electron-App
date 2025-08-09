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
function renderLiteMD(src) {
  if (!src) return '';

  // 1) pull out fenced code blocks first
  const fences = [];
  src = src.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = fences.push({ lang, code }) - 1;
    return `\uFFF0${i}\uFFF1`; // placeholder
  });

  const esc = s => s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

  // inline: backticks, **bold**, *italic*
  const inline = s =>
    esc(s)
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 2) split into blocks by blank lines
  const blocks = src.trim().split(/\n{2,}/);

  const out = [];

  for (let b of blocks) {
    // restore placeholders inside this block later
    // (we only treat as placeholder if the whole block is a placeholder)
    if (/^\uFFF0\d+\uFFF1$/.test(b)) {
      const i = +b.slice(1, -1); // remove markers
      const { lang, code } = fences[i];
      out.push(
        `<pre><code data-lang="${esc(lang||'')}">${esc(code)}</code></pre>`
      );
      continue;
    }

    // Headings: # .. ######
    const h = b.match(/^(#{1,6})\s+(.+)$/s);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      continue;
    }

    // Blockquote: lines starting with >
    if (/^>\s+/.test(b)) {
      const inner = b.replace(/^>\s?/gm, '');             // strip leading >
      const para  = inline(inner.replace(/\n+/g, ' '));   // join lines inside quote
      out.push(`<blockquote><p>${para}</p></blockquote>`);
      continue;
    }

    // Lists: unordered or ordered (simple, non-nested)
    if (/^(?:[-*+]\s+.+|\d+\.\s+.+)(?:\n.+)*$/m.test(b)) {
      const isOrdered = /^\d+\.\s+/.test(b.trim());
      const tag = isOrdered ? 'ol' : 'ul';
      const items = [];
      const re = isOrdered ? /^\s*\d+\.\s+(.+)$/gm : /^\s*[-*+]\s+(.+)$/gm;
      let m;
      while ((m = re.exec(b)) !== null) {
        // keep soft line breaks inside item
        items.push(`<li>${inline(m[1].replace(/\n+/g, '<br>'))}</li>`);
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(b.trim())) { out.push('<hr>'); continue; }

    // Paragraph (default): join single newlines to spaces
    out.push(`<p>${inline(b.replace(/\n+/g, ' '))}</p>`);
  }

  // 3) done
  return out.join('\n');
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
