/* 오늘의 운세 카드 — 백엔드 없이 브라우저에서만 동작한다.
   저장: localStorage (오늘 뽑은 카드, 최근 7일 기록, 기기 ID) */
(() => {
  'use strict';

  const CARDS = window.FORTUNE_CARDS;
  const ICONS = window.FORTUNE_ICONS;
  const STORE_KEY = 'fortune-card:v1';
  const DECK_SIZE = 16;
  const SITE_NAME = '오늘의 운세 카드';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel) => document.querySelector(sel);
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

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
  if (!state.deviceId) {
    state.deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    saveState(state);
  }
  if (!Array.isArray(state.history)) state.history = [];

  // ── 시드 기반 선택: 같은 날 같은 기기는 같은 문구 ────
  function hash(str) {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const seeded = (arr, seed) => arr[hash(seed) % arr.length];

  function buildReading(card, date) {
    const seed = `${date}|${state.deviceId}|${card.id}`;
    const base = { good: 4, neutral: 3, caution: 2 }[card.tone];
    return {
      card,
      date,
      stars: base + (hash(seed + '|stars') % 2),
      overall: seeded(card.overall, seed + '|overall'),
      areas: [
        ['연애', seeded(card.love, seed + '|love')],
        ['금전', seeded(card.money, seed + '|money')],
        ['일·학업', seeded(card.work, seed + '|work')],
        ['건강', seeded(card.health, seed + '|health')]
      ],
      lucky: [
        ['행운의 색', seeded(card.lucky.colors, seed + '|color')],
        ['행운의 숫자', String(seeded(card.lucky.numbers, seed + '|number'))],
        ['행운의 아이템', seeded(card.lucky.items, seed + '|item')]
      ]
    };
  }

  // ── 그리기 도우미 ────────────────────────────────────
  const iconSvg = (id) => `<svg class="icon" viewBox="0 0 48 48" aria-hidden="true">${ICONS[id]}</svg>`;
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

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
    const sky = $('#sky');
    let html = '';
    for (let i = 0; i < 70; i++) {
      const big = i % 9 === 0 ? ' class="big"' : '';
      html += `<i${big} style="left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 100).toFixed(2)}%;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(3 + Math.random() * 4).toFixed(2)}s"></i>`;
    }
    sky.innerHTML = html;
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

    const picks = shuffled(CARDS).slice(0, DECK_SIZE);
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
        el.style.zIndex = String(Math.floor(Math.random() * DECK_SIZE));
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
      await wait(500 + DECK_SIZE * 25);
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
    el.querySelector('.card-front').innerHTML = `${iconSvg(card.id)}<span class="card-name">${card.name}</span>`;

    const r = el.getBoundingClientRect();
    const scale = Math.min(2.4, (Math.min(window.innerWidth, 480) * 0.56) / r.width);
    const dx = window.innerWidth / 2 - (r.left + r.width / 2);
    const dy = window.innerHeight / 2 - (r.top + r.height / 2);
    el.classList.add('is-chosen');
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    await wait(550);
    el.classList.add('is-flipped');
    await wait(800 + 1000);

    // F6: 오늘 뽑은 카드 저장 + F9: 최근 7일 기록
    const date = kstDate();
    state.today = { date, cardId: card.id };
    state.history = [{ date, cardId: card.id }, ...state.history.filter((h) => h.date !== date)].slice(0, 7);
    saveState(state);

    showResult(buildReading(card, date), false);
  }

  // ── F5: 결과 화면 ────────────────────────────────────
  let current = null;

  function historyHtml() {
    const byDate = new Map(state.history.map((h) => [h.date, h.cardId]));
    let html = '';
    for (let d = 6; d >= 0; d--) {
      const date = kstDate(d);
      const id = byDate.get(date);
      const card = id && CARDS.find((c) => c.id === id);
      const label = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
      html += `<div class="${card ? 'has' : ''}${d === 0 ? ' today' : ''}" title="${card ? card.name : '기록 없음'}">`
        + (card ? iconSvg(card.id) : '<span class="empty">·</span>')
        + `${label}</div>`;
    }
    return html;
  }

  function showResult(reading, revisit) {
    current = reading;
    const { card } = reading;
    $('#result').innerHTML = `
      ${revisit ? '<p class="revisit">오늘은 이미 카드를 뽑았어요</p>' : ''}
      <div class="bigcard">${iconSvg(card.id)}<span class="card-name">${card.name}</span></div>
      <h2 class="result-title">${card.name} <span>— ${card.keyword}</span></h2>
      <p class="stars" role="img" aria-label="총운 별점 5점 만점에 ${reading.stars}점">${starText(reading.stars)}</p>
      <p class="overall">${reading.overall}</p>
      <div class="panel"><ul class="areas">
        ${reading.areas.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}
      </ul></div>
      <div class="lucky">
        ${reading.lucky.map(([k, v]) => `<div><small>${k}</small><strong>${v}</strong></div>`).join('')}
      </div>
      <p class="quote">“${card.quote}”</p>
      <p class="history-title">최근 7일 동안 뽑은 카드</p>
      <div class="history">${historyHtml()}</div>
      <p class="disclaimer">재미로 보는 운세입니다.<br>내일(한국 시간 자정 이후) 다시 오면 새 카드를 뽑을 수 있어요.</p>
    `;
    showScreen('result');
  }

  // ── F7: 공유 ─────────────────────────────────────────
  // 아티팩트로 올린 버전(EMBED)은 공유 창·파일 다운로드가 막혀 있어 다르게 동작한다
  const EMBED = Boolean(window.FORTUNE_EMBED);
  const siteUrl = () => window.FORTUNE_SHARE_URL || location.href.split(/[?#]/)[0];

  function showImageOverlay(dataUrl) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = '<p>이미지를 길게 누르거나 오른쪽 클릭해서 저장하세요</p><img alt="오늘의 운세 결과 이미지"><button type="button" id="btn-overlay-close">닫기</button>';
    wrap.querySelector('img').src = dataUrl;
    wrap.querySelector('button').addEventListener('click', () => wrap.remove());
    document.body.append(wrap);
    wrap.querySelector('button').focus();
  }
  const shareText = () => `오늘 내 운세 카드는 '${current.card.name} — ${current.card.keyword}' ${starText(current.stars)}\n“${current.card.quote}”`;

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

  // 결과 이미지 (1080×1920, 스토리용)를 Canvas로 직접 그린다
  function loadIcon(id, color, size) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[id].replaceAll('currentColor', color)}</svg>`;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
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

  async function saveImage() {
    const { card, stars, date } = current;
    const W = 1080, H = 1920;
    const SERIF = '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", serif';
    const SANS = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
    bg.addColorStop(0, '#070b24'); bg.addColorStop(0.55, '#141a4a'); bg.addColorStop(1, '#2a1a55');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 별: 카드와 날짜로 위치를 고정해 같은 결과는 같은 그림이 나온다
    for (let i = 0; i < 140; i++) {
      const h = hash(`${card.id}|${date}|${i}`);
      const x = h % W, y = (h >>> 11) % H, big = i % 9 === 0;
      ctx.globalAlpha = 0.25 + ((h >>> 5) % 60) / 100;
      ctx.fillStyle = big ? '#e8c877' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, big ? 3.2 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#e8c877';
    ctx.font = `600 40px ${SANS}`;
    ctx.fillText(`${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 · ${SITE_NAME}`, W / 2, 200);

    // 카드
    const cw = 540, ch = 810, cx = (W - cw) / 2, cy = 300;
    ctx.save();
    ctx.shadowColor = 'rgba(232, 200, 119, 0.45)';
    ctx.shadowBlur = 90;
    const paper = ctx.createLinearGradient(0, cy, 0, cy + ch);
    paper.addColorStop(0, '#fbf4de'); paper.addColorStop(1, '#eedfb3');
    ctx.fillStyle = paper;
    roundRect(ctx, cx, cy, cw, ch, 40);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(42, 35, 86, 0.4)';
    ctx.lineWidth = 3;
    roundRect(ctx, cx + 26, cy + 26, cw - 52, ch - 52, 26);
    ctx.stroke();

    const icon = await loadIcon(card.id, '#2a2356', 640);
    ctx.drawImage(icon, W / 2 - 160, cy + 190, 320, 320);
    ctx.fillStyle = '#2a2356';
    ctx.font = `700 68px ${SERIF}`;
    ctx.fillText(card.name, W / 2, cy + 630);

    // 카드 아래 글
    ctx.fillStyle = '#f4efe4';
    ctx.font = `700 76px ${SERIF}`;
    ctx.fillText(`${card.name} — ${card.keyword}`, W / 2, 1270);

    ctx.fillStyle = '#e8c877';
    ctx.font = `64px ${SANS}`;
    ctx.fillText(starText(stars).split('').join(' '), W / 2, 1380);

    ctx.font = `600 54px ${SERIF}`;
    const lines = wrapLines(ctx, `“${card.quote}”`, W - 240);
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 1530 + i * 80));

    ctx.fillStyle = '#b9b5d3';
    ctx.font = `36px ${SANS}`;
    const host = !EMBED && location.host ?location.host + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') : '';
    ctx.fillText(host || '카드 한 장으로 보는 오늘의 운세', W / 2, H - 110);

    if (EMBED) { showImageOverlay(canvas.toDataURL('image/png')); return; }

    canvas.toBlob((blob) => {
      if (!blob) { toast('이미지를 만들지 못했어요'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `오늘의운세-${date}-${card.name}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('이미지를 저장했어요');
    }, 'image/png');
  }

  // ── 시작 ─────────────────────────────────────────────
  function init() {
    makeSky();
    $('#btn-start').addEventListener('click', deal);
    $('#btn-copy').addEventListener('click', copyLink);
    $('#btn-image').addEventListener('click', () => saveImage().catch(() => toast('이미지를 만들지 못했어요')));
    if (navigator.share && !EMBED) $('#btn-share').addEventListener('click', shareNative);
    else $('#btn-share').remove(); // 공유 창이 없는 브라우저(일부 PC)에서는 링크 복사·이미지 저장만

    // F6: 오늘 이미 뽑았으면 연출 없이 저장된 결과를 보여 준다
    const today = state.today;
    const card = today && today.date === kstDate() && CARDS.find((c) => c.id === today.cardId);
    if (card) showResult(buildReading(card, today.date), true);
    else showScreen('start');
  }

  init();
})();
