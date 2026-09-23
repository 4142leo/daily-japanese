/* なろうBOOK 閱讀輔助小工具（書籤小工具 / bookmarklet）
   用法：在小説家になろう的任一頁點一下書籤 → 選取日文 → 浮出「🔊 唸／🈁 翻譯」
   行為刻意做得跟 daily-japanese 網站上的「選取翻譯」一致。
   UI 放在 Shadow DOM 裡，不會被なろう的 CSS 影響、也不會影響它。 */
(function () {
  'use strict';
  var FLAG = '__djNarouTool__';
  if (window[FLAG]) { window[FLAG].toast('工具已經在執行中'); return; }

  var host = document.createElement('div');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.bar,.out,.toast{position:absolute;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;display:none}' +
    '.bar.on,.out.on,.toast.on{display:flex}' +
    '.bar{gap:4px;background:#263042;padding:5px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.28)}' +
    '.bar button{background:transparent;border:none;color:#fff;font-size:14px;font-weight:700;cursor:pointer;padding:5px 9px;border-radius:7px;white-space:nowrap}' +
    '.bar button:active{background:rgba(255,255,255,.2)}' +
    '.out{flex-direction:column;gap:6px;max-width:min(88vw,420px);background:#fff;color:#1b2430;border:1px solid #d7dde6;border-radius:12px;padding:10px 12px;box-shadow:0 10px 28px rgba(0,0,0,.22);font-size:15px;line-height:1.7}' +
    '.out .lbl{color:#6b7684;font-size:13px;line-height:1.6;border-bottom:1px solid #eef1f5;padding-bottom:6px}' +
    '.out .x{position:absolute;top:4px;right:6px;background:transparent;border:none;color:#9aa4b1;font-size:15px;cursor:pointer;padding:4px 6px}' +
    '.toast{background:#263042;color:#fff;border-radius:10px;padding:8px 14px;font-size:14px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.28)}' +
    '</style>' +
    '<div class="bar" id="bar">' +
      '<button type="button" data-a="say">🔊 唸</button>' +
      '<button type="button" data-a="tr">🈁 翻譯</button>' +
      '<button type="button" data-a="close" aria-label="關閉">✕</button>' +
    '</div>' +
    '<div class="out" id="out"></div>' +
    '<div class="toast" id="toast"></div>';

  var bar = root.getElementById('bar'), out = root.getElementById('out'), toastEl = root.getElementById('toast');
  var show = function (el, on) { el.classList[on ? 'add' : 'remove']('on'); };

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.style.left = (window.scrollX + 12) + 'px';
    toastEl.style.top = (window.scrollY + 12) + 'px';
    show(toastEl, true);
    setTimeout(function () { show(toastEl, false); }, 2200);
  }

  /* 取選取文字：去掉 <rt>（作者標的假名），只留本體 */
  function cleanText() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return '';
    var frag = sel.getRangeAt(0).cloneContents();
    Array.prototype.forEach.call(frag.querySelectorAll('rt'), function (rt) { rt.remove(); });
    return (frag.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function clampLeft(px, el) {
    return Math.max(8, Math.min(px, window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 8));
  }

  var curText = '';
  function update() {
    var sel = window.getSelection();
    var text = cleanText();
    if (!text) { show(bar, false); show(out, false); return; }
    curText = text; show(out, false);
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    show(bar, true);
    bar.style.left = clampLeft(window.scrollX + rect.left + rect.width / 2 - bar.offsetWidth / 2, bar) + 'px';
    var top = window.scrollY + rect.top - bar.offsetHeight - 8;
    bar.style.top = (top < window.scrollY + 4 ? window.scrollY + rect.bottom + 8 : top) + 'px';
  }
  function showOut(html) {
    out.innerHTML = '<button type="button" class="x" aria-label="關閉">✕</button>' + html;
    show(out, true);
    out.style.top = ((parseFloat(bar.style.top) || 0) + 6) + 'px';
    out.style.left = clampLeft(parseFloat(bar.style.left) || 8, out) + 'px';
  }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  /* 翻譯：Google（免金鑰）→ MyMemory 備援，跟網站上同一套 */
  function translate(text) {
    var g = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-TW&dt=t&q=' + encodeURIComponent(text);
    return fetch(g).then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    }).then(function (d) {
      var tt = (d[0] || []).map(function (x) { return x[0]; }).join('');
      if (!tt) throw 0;
      return tt;
    }).catch(function () {
      var m = 'https://api.mymemory.translated.net/get?langpair=ja|zh-TW&q=' + encodeURIComponent(text);
      return fetch(m).then(function (r) { return r.json(); }).then(function (d) {
        return (d && d.responseData && d.responseData.translatedText) || '（翻譯失敗，可能是網路或今日免費額度用完）';
      }).catch(function () { return '（翻譯失敗，可能是網路或今日免費額度用完）'; });
    });
  }

  /* 朗讀：一定要明確挑日語語音，否則會用中文腔唸 */
  function jaVoice() {
    var vs = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : [];
    for (var i = 0; i < vs.length; i++) { if (/^ja/i.test(vs[i].lang)) return vs[i]; }
    return null;
  }
  try { if (window.speechSynthesis) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () { speechSynthesis.getVoices(); }; } } catch (e) {}
  function speak(text) {
    if (!window.speechSynthesis) { showOut('（這個瀏覽器不支援朗讀）'); return; }
    var v = jaVoice();
    if (!v) { showOut('（此裝置沒有日語語音，無法朗讀——桌機請用 Edge 或安裝日語語音）'); return; }
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  var t;
  document.addEventListener('selectionchange', function () { clearTimeout(t); t = setTimeout(update, 200); });

  /* 注意：不要在 bar 上 mousedown preventDefault——觸控螢幕會連按鈕的 click 一起吃掉 */
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var a = b.getAttribute('data-a');
    if (a === 'close') {
      show(bar, false); show(out, false);
      try { window.getSelection().removeAllRanges(); } catch (_) {}
      return;
    }
    if (!curText) return;
    var text = curText;
    if (a === 'say') { speak(text); show(out, false); return; }
    show(bar, false);
    showOut('翻譯中…');
    translate(text).then(function (zh) {
      showOut('<div class="lbl">' + esc(text) + '</div><div>' + esc(zh) + '</div>');
    });
  });
  out.addEventListener('click', function (e) { if (e.target.closest('.x')) show(out, false); });

  document.addEventListener('scroll', function () { show(bar, false); show(out, false); }, { passive: true });
  document.addEventListener('pointerdown', function (e) {
    var p = e.composedPath ? e.composedPath() : [];
    if (p.indexOf(bar) === -1 && p.indexOf(out) === -1) { show(bar, false); show(out, false); }
  }, true);

  window[FLAG] = { toast: toast };
  toast('なろうBOOK 已啟動：選取日文即可翻譯');
})();
