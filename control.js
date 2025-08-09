// control.js
(async function () {
  const $ = (id) => document.getElementById(id);

  // --- helpers --------------------------------------------------------------
  function toast(msg, ok = true, ms = 900) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
      background:${ok ? '#16341d' : '#3a1414'};
      color:${ok ? '#7bff9b' : '#ff9a9a'};
      border:1px solid ${ok ? '#275a35' : '#5d2727'};
      padding:8px 12px; border-radius:10px; font:12px system-ui; z-index:9999;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function normalizeWsBase(v) {
    if (!v) return '';
    let s = v.trim();
    // Force ws/wss scheme if user pasted https/http
    if (s.startsWith('https://')) s = 'wss://' + s.slice(8);
    if (s.startsWith('http://'))  s = 'ws://'  + s.slice(7);
    // strip trailing quotes/spaces
    s = s.replace(/^'+|'+$/g, '');
    // ensure ?ws=1 exists
    if (!/[?&]ws=1\b/.test(s)) s += (s.includes('?') ? '&' : '?') + 'ws=1';
    return s;
  }

  function clamp(n, lo, hi) {
    n = Number(n);
    if (Number.isNaN(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  // --- init form ------------------------------------------------------------
  const S = await window.electronAPI.getState();

  $('mode').value    = S.mode;
  $('url').value     = S.url || '';
  $('wsBase').value  = S.wsBase || '';
  $('room').value    = S.room || 'demo';
  $('pass').value    = S.pass || 'secret';
  $('opacity').value = String(S.opacity ?? 0.9);
  $('blur').value    = S.blur ? 'true' : 'false';
  $('ct').value      = S.clickThrough ? 'true' : 'false';
  $('wheel').value   = S.wheelToOverlay ? 'true' : 'false';

  // Submit on Enter
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      $('apply').click();
    }
  });

  // --- apply handler --------------------------------------------------------
  $('apply').onclick = async () => {
    const btn = $('apply');
    btn.disabled = true;
    btn.textContent = 'Applying…';

    // Build patch
    let wsBase = $('wsBase').value.trim();
    if (wsBase) wsBase = normalizeWsBase(wsBase);

    const patch = {
      mode: $('mode').value,
      url: $('url').value.trim(),
      wsBase,
      room: $('room').value.trim(),
      pass: $('pass').value.trim(),
      opacity: clamp($('opacity').value, 0.5, 1),
      blur: $('blur').value === 'true',
      clickThrough: $('ct').value === 'true',
      wheelToOverlay: $('wheel').value === 'true',
      visible: true
    };

    // Basic validation (only when in mirror mode)
    if (patch.mode === 'mirror') {
      if (!patch.wsBase) { toast('WS Base required in Mirror mode', false, 1300); btn.disabled = false; btn.textContent = 'Apply'; return; }
      if (!patch.room)   { toast('Room is required',               false, 1300); btn.disabled = false; btn.textContent = 'Apply'; return; }
    }

    try {
      const res = await window.electronAPI.setState(patch);
      toast(res?.ok ? 'Applied ✓' : 'Applied');
      setTimeout(() => window.close(), 650);  // close after success
    } catch (e) {
      console.error(e);
      toast('Failed to apply', false, 1400);
      btn.disabled = false;
      btn.textContent = 'Apply';
    }
  };
})();
