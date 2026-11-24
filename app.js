/* 오늘의 운세 카드 — 백엔드 없이 브라우저에서만 동작한다.
   저장: localStorage (오늘 뽑은 카드, 최근 7일 기록) */
(() => {
  'use strict';

  const CARDS = window.FORTUNE_CARDS;
  const STORE_KEY = 'fortune-card:v1';
  const SITE_NAME = '오늘의 운세 카드';
  // 아티팩트로 올린 버전(EMBED)은 공유 창·파일 다운로드가 막혀 있어 다르게 동작한다
  const EMBED = Boolean(window.FORTUNE_EMBED);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel) => document.querySelector(sel);
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const cardSrc = (card) => `cards/${card.id}.webp`;

  // ── 날짜 (한국 시간 기준, 자정에 초기화) ─────────────
  function kstDate(daysAgo = 0) {
    return new Date(Date.now() + 9 * 3600e3 - daysAgo * 864e5).toISOString().slice(0, 10);
  }

  // ── 저장소 ───────────────────────────────────────────
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 사생활 보호 모드 등: 저장 없이 동작 */ }
  }

  // 테스트용: 주소 뒤에 ?reset 을 붙이면 오늘 기록을 지운다
  if (new URLSearchParams(location.search).has('reset')) {
    try { localStorage.removeItem(STORE_KEY); } catch { /* 무시 */ }
  }

  const state = loadState();
  if (!Array.isArray(state.history)) state.history = [];

  // ── 도우미 ───────────────────────────────────────────
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function showScreen(name) {
    for (const id of ['start', 'pick', 'result']) {
      $(`#screen-${id}`).hidden = id !== name;
    }
    $('#share-bar').hidden = name !== 'result';
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function makeSky() {
    let html = '';
    for (let i = 0; i < 70; i++) {
      const big = i % 9 === 0 ? ' class="big"' : '';
      html += `<i${big} style="left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 100).toFixed(2)}%;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(3 + Math.random() * 4).toFixed(2)}s"></i>`;
    }
    $('#sky').innerHTML = html;
  }

  // ── F2: 섞기 → 16장 펼치기 ───────────────────────────
  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let chosen = false;

  async function deal() {
    chosen = false;
    showScreen('pick');
    const title = $('#pick-title');
    const deck = $('#deck');
    title.textContent = '카드를 섞는 중…';
    deck.innerHTML = '';

    const picks = shuffled(CARDS);
    const els = picks.map((card, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.disabled = true;
      b.setAttribute('aria-label', `${i + 1}번째 카드`);
      b.innerHTML = '<span class="card-inner"><span class="card-face card-back"></span><span class="card-face card-front"></span></span>';
      b.addEventListener('click', () => choose(b, card, els));
      deck.append(b);
      return b;
    });

    if (!reduceMotion) {
      // 모든 카드를 가운데 한 더미로 모은 뒤, 좌우로 갈랐다 합치며 섞는다 (약 1.5초)
      const dr = deck.getBoundingClientRect();
      const cx = dr.left + dr.width / 2;
      const cy = dr.top + dr.height / 2;
      const home = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
      });
      const pile = (spread) => els.forEach((el, i) => {
        const j = Math.random() * 2 - 1;
        el.style.zIndex = String(Math.floor(Math.random() * els.length));
        el.style.transform = `translate(${home[i].x + j * spread}px, ${home[i].y + (Math.random() - 0.5) * 14}px) rotate(${j * 9}deg)`;
      });

      els.forEach((el) => { el.style.transition = 'none'; });
      pile(0);
      void deck.offsetWidth;
      els.forEach((el) => { el.style.transition = 'transform 0.32s ease'; });
      for (let round = 0; round < 4; round++) {
        pile(round % 2 === 0 ? 90 : 8);
        await wait(360);
      }
      els.forEach((el, i) => {
        el.style.transition = `transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 25}ms`;
        el.style.transform = '';
      });
      await wait(500 + els.length * 25);
      els.forEach((el) => { el.style.transition = ''; el.style.zIndex = ''; });
    }

    els.forEach((el) => { el.disabled = false; });
    title.textContent = '마음이 가는 카드 한 장을 골라 주세요';
  }

  // ── F3·F4: 선택 → 가운데로 이동 → 뒤집기 ─────────────
  async function choose(el, card, els) {
    if (chosen) return;
    chosen = true;

    els.forEach((o) => {
      o.disabled = true;
      if (o !== el) o.classList.add('is-dimmed');
    });
    $('#pick-title').textContent = '오늘의 카드는…';

    // 앞면 그림은 고른 뒤에 불러온다 (미리 불러오면 16장 전부 받아야 한다)
    const ready = loadImage(cardSrc(card)).catch(() => null);

    const r = el.getBoundingClientRect();
    const scale = Math.min(3.2, (Math.min(window.innerWidth, 520) * 0.72) / r.width, (window.innerHeight * 0.78) / r.height);
    const dx = window.innerWidth / 2 - (r.left + r.width / 2);
    const dy = window.innerHeight / 2 - (r.top + r.height / 2);
    el.classList.add('is-chosen');
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    await Promise.all([wait(550), ready]);
    el.querySelector('.card-front').style.backgroundImage = `url("${cardSrc(card)}")`;
    el.classList.add('is-flipped');
    await wait(800 + 1400);

    // F6: 오늘 뽑은 카드 저장 + F9: 최근 7일 기록
    const date = kstDate();
    state.today = { date, cardId: card.id };
    state.history = [{ date, cardId: card.id }, ...state.history.filter((h) => h.date !== date)].slice(0, 7);
    saveState(state);

    showResult(card, date, false);
  }

  // ── F5: 결과 화면 ────────────────────────────────────
  let current = null;

  function historyHtml() {
    const byDate = new Map(state.history.map((h) => [h.date, h.cardId]));
    let html = '';
    for (let d = 6; d >= 0; d--) {
      const date = kstDate(d);
      const card = CARDS.find((c) => c.id === byDate.get(date));
      const label = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
      html += `<div class="${card ? 'has' : ''}${d === 0 ? ' today' : ''}" title="${card ? `${card.series} · ${card.color}` : '기록 없음'}">`
        + (card ? `<i class="swatch" style="background:${card.hex}"></i>` : '<span class="empty">·</span>')
        + `${label}</div>`;
    }
    return html;
  }

  function showResult(card, date, revisit) {
    current = { card, date };
    const alt = `${card.series} 카드. 학업운: ${card.study} 연애운: ${card.love} 우정운: ${card.friend} 오늘의 색: ${card.color}`;
    $('#result').innerHTML = `
      ${revisit ? '<p class="revisit">오늘은 이미 카드를 뽑았어요</p>' : ''}
      <img id="result-card" class="result-card" src="${cardSrc(card)}" width="1024" height="1536" alt="${alt}">
      <h2 class="result-title">${card.series}</h2>
      <p class="result-color"><i class="swatch" style="background:${card.hex}"></i>오늘의 색 · ${card.color}</p>
      <div class="panel"><ul class="areas">
        <li><b>학업운</b><span>${card.study}</span></li>
        <li><b>연애운</b><span>${card.love}</span></li>
        <li><b>우정운</b><span>${card.friend}</span></li>
      </ul></div>
      <p class="history-title">최근 7일 동안 뽑은 카드의 색</p>
      <div class="history">${historyHtml()}</div>
      <p class="disclaimer">재미로 보는 운세입니다.<br>내일(한국 시간 자정 이후) 다시 오면 새 카드를 뽑을 수 있어요.</p>
    `;
    showScreen('result');
  }

  // ── F7: 공유 ─────────────────────────────────────────
  const siteUrl = () => window.FORTUNE_SHARE_URL || location.href.split(/[?#]/)[0];
  const shareText = () => `오늘 내 운세 카드는 '${current.card.series}' · 오늘의 색 ${current.card.color}`;

  async function copyLink() {
    const text = siteUrl();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) { toast('복사하지 못했어요. 주소창의 주소를 복사해 주세요'); return; }
    }
    toast('링크를 복사했어요');
  }

  async function shareNative() {
    try {
      await navigator.share({ title: SITE_NAME, text: shareText(), url: siteUrl() });
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('공유하지 못했어요. 링크 복사를 이용해 주세요');
    }
  }

  function showImageOverlay(src) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = '<p>이미지를 길게 누르거나 오른쪽 클릭해서 저장하세요</p><img alt="오늘의 운세 결과 이미지"><button type="button" id="btn-overlay-close">닫기</button>';
    wrap.querySelector('img').src = src;
    wrap.querySelector('button').addEventListener('click', () => wrap.remove());
    document.body.append(wrap);
    wrap.querySelector('button').focus();
  }

  function download(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
  }

  function hash(str) {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 결과 이미지 (1080×1920, 스토리용): 밤하늘 배경 위에 뽑은 카드를 올린다
  async function saveImage() {
    const { card, date } = current;
    const filename = `오늘의운세-${date}-${card.color}`;
    const W = 1080, H = 1920;
    const SERIF = '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", serif';
    const SANS = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const img = await loadImage(cardSrc(card));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
    bg.addColorStop(0, '#070b24'); bg.addColorStop(0.55, '#1a1650'); bg.addColorStop(1, '#3a1d63');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 140; i++) {
      const h = hash(`${card.id}|${date}|${i}`);
      const big = i % 9 === 0;
      ctx.globalAlpha = 0.25 + ((h >>> 5) % 60) / 100;
      ctx.fillStyle = big ? '#e8c877' : '#ffffff';
      ctx.beginPath();
      ctx.arc(h % W, (h >>> 11) % H, big ? 3.2 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#e8c877';
    ctx.font = `600 40px ${SANS}`;
    ctx.fillText(`${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 · ${SITE_NAME}`, W / 2, 150);

    const cw = 880, ch = 1320, cx = (W - cw) / 2, cy = 220;
    ctx.save();
    ctx.shadowColor = card.hex;
    ctx.shadowBlur = 90;
    ctx.fillStyle = '#0b1030';
    roundRect(ctx, cx, cy, cw, ch, 52);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, 52);
    ctx.clip();
    ctx.drawImage(img, cx, cy, cw, ch);
    ctx.restore();

    ctx.fillStyle = '#f4efe4';
    ctx.font = `700 64px ${SERIF}`;
    ctx.fillText(card.series, W / 2, 1680);
    ctx.fillStyle = '#e8c877';
    ctx.font = `600 44px ${SANS}`;
    ctx.fillText(`오늘의 색 · ${card.color}`, W / 2, 1760);

    const host = !EMBED && location.host ? location.host + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') : '';
    ctx.fillStyle = '#b9b5d3';
    ctx.font = `34px ${SANS}`;
    ctx.fillText(host || '카드 한 장으로 보는 오늘의 운세', W / 2, H - 70);

    // 파일을 직접 열었을 때(file://)는 브라우저가 캔버스 내보내기를 막는다 → 카드 그림만 저장
    let dataUrl;
    try { dataUrl = canvas.toDataURL('image/png'); } catch { dataUrl = null; }

    if (EMBED) { showImageOverlay(dataUrl || cardSrc(card)); return; }
    if (dataUrl) download(dataUrl, `${filename}.png`);
    else download(cardSrc(card), `${filename}.webp`);
    toast('이미지를 저장했어요');
  }

  // ── 시작 ─────────────────────────────────────────────
  function init() {
    makeSky();
    loadImage(window.FORTUNE_BACK).catch(() => {}); // 뒷면 그림을 미리 받아 둔다
    $('#btn-start').addEventListener('click', deal);
    $('#btn-copy').addEventListener('click', copyLink);
    $('#btn-image').addEventListener('click', () => saveImage().catch(() => toast('이미지를 만들지 못했어요')));
    if (navigator.share && !EMBED) $('#btn-share').addEventListener('click', shareNative);
    else $('#btn-share').remove(); // 공유 창이 없는 브라우저(일부 PC)에서는 링크 복사·이미지 저장만

    // F6: 오늘 이미 뽑았으면 연출 없이 저장된 결과를 보여 준다
    const today = state.today;
    const card = today && today.date === kstDate() && CARDS.find((c) => c.id === today.cardId);
    if (card) showResult(card, today.date, true);
    else showScreen('start');
  }

  init();
})();
