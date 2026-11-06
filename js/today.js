// Today tab: slate header (greeting, temp, rain, streak), outfit card first (swipe to swap, Wear this, shuffle, share),
// bring/missing chips, stops, live week strip. Pull down to refresh.
import * as db from './db.js';
import { planOutfit, wearItem, STOP_TYPES, GAPS, hourLabel, nextChoice, streak } from './model.js';
import { getForecast, describe, wxIcon, todayStr } from './weather.js';
import { icon, esc, $, $$, opts, toast, blobUrl, temp, tempVal, getUnits, cap, countSpan, countUp, stagger, swipe, haptic, sheet, loader, locIcon, replayLogo, reduced } from './ui.js';
import { getLimits, getLocations, itemName } from './closet.js';

let selected = null, seed = 0, choose = {}, showAllMissing = false, forceWx = false;
const SLOT_LABEL = { top: 'Top', bottom: 'Bottom', mid: 'Layer', blazer: 'Blazer', outer: 'Outer layer', shoes: 'Shoes', hat: 'Hat', gloves: 'Gloves', scarf: 'Scarf' };
const TILE_ORDER = ['outer', 'blazer', 'mid', 'top', 'bottom', 'shoes', 'hat', 'gloves', 'scarf'];
const fmtDate = (d, o) => new Date(d + 'T12:00').toLocaleDateString('en-CA', o);

export async function renderToday(main) {
  const today = todayStr();
  selected ??= today;
  const [wx, items, limits, rec, outfits, locs, firstName] = await Promise.all([
    getForecast(forceWx), db.all('items'), getLimits(), db.get('outfits', selected), db.all('outfits'), getLocations(), db.getSetting('name', '')]);
  forceWx = false;
  if (wx && !wx.days.some(d => d.date === selected)) selected = wx.days[0].date;
  const isToday = selected === today;
  const hours = wx?.hours[selected] || [];
  const day = wx?.days.find(d => d.date === selected);
  const stops = rec?.stops || [];
  const h = new Date().getHours();
  const greet = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (firstName ? `, ${firstName}` : '');
  const cur = isToday && wx?.current ? wx.current : day && { temp: day.max, code: day.code };
  const nowH = hours.filter(x => +x.time.slice(11, 13) >= (isToday ? h : 7));
  const days = streak(outfits, today);
  const locOf = new Map(locs.map(l => [l.id, l]));

  let plan = null, wornNow = [];
  if (rec?.accepted) {
    const byId = new Map(items.map(i => [i.id, i]));
    wornNow = rec.itemIds.map(id => byId.get(id)).filter(Boolean);
  } else {
    plan = planOutfit({ items, hours, stops, seed, choose, limits });
    if (isToday) await db.setSetting('gaps', plan.missing);
  }

  main.innerHTML = `<div class="ptr" aria-hidden="true">${loader('Refreshing')}</div>
    <header class="band"><div class="band-row">
      <div><h1>${esc(isToday ? greet : 'Preview')}</h1>
        <p>${esc(fmtDate(selected, { weekday: 'long', month: 'long', day: 'numeric' }))}${cur ? ` · ${describe(cur.code)}` : ''}${wx?.offline ? ' · offline' : ''}</p></div>
      <div class="bigtemp">${cur ? countSpan(tempVal(cur.temp), '°' + getUnits()) : '--°'}<small>${icon('droplet', 12, 'inl')} Rain ${day ? countSpan(day.rain, '%') : '--'}</small></div>
    </div>
    <div class="between" style="margin-top:12px">
      <button class="streak" id="streak" aria-label="${days} day streak">${icon('flame', 18)}${days}</button>
      <span class="sub" style="color:var(--ice)">${esc(wx?.city?.name || 'Toronto, ON')}</span></div>
    ${nowH.length ? `<div class="chips scroll" style="margin-top:12px" aria-label="Hourly forecast">${nowH.map(x => `<span class="hourc">${hourLabel(x.time)}<b>${temp(x.temp)}</b></span>`).join('')}</div>` : ''}
    </header>
    <div class="content today-grid">
      <div>${rec?.accepted ? wornHtml(wornNow) : planHtml(plan, items, isToday, locOf)}</div>
      <div>
        <h2 class="h2">Your day</h2>
        <div class="card"><ul class="stops">${stops.map((s, i) => `<li><time>${esc(s.time)}</time><span>${esc(s.type)}</span>
          <button class="icon-btn bare" data-rmstop="${i}" aria-label="Remove ${esc(s.type)} at ${esc(s.time)}">${icon('x', 18)}</button></li>`).join('') || '<li class="sub">No plans yet.</li>'}</ul>
          ${rec?.accepted ? '' : `<form class="addstop" id="addStop"><input type="time" name="time" value="${String(Math.min(22, isToday ? h + 1 : 9)).padStart(2, '0')}:00" required aria-label="Time">
          <select name="type" aria-label="Where">${opts(Object.keys(STOP_TYPES).map(t => [t, t]))}</select>
          <button class="btn primary sm">Add</button></form>`}</div>
        ${wx ? `<h2 class="h2">This week</h2><div class="week">${wx.days.map(d => `<button class="wday" data-day="${d.date}" aria-pressed="${d.date === selected}">
          <span>${d.date === today ? 'Today' : esc(fmtDate(d.date, { weekday: 'short' }))}</span>${icon(wxIcon(d.code), 20)}
          <b>${temp(d.max)}</b><span>${temp(d.min)}</span></button>`).join('')}</div>` : '<p class="sub">Forecast unavailable. Outfits assume a mild 12°C day.</p>'}
      </div>
    </div>`;

  // Swipe a tile to swap it for the next best clean option.
  for (const t of $$('.tile[data-slot]', main)) {
    const slot = t.dataset.slot, n = +t.dataset.options;
    if (n > 1) swipe(t, dir => { choose = nextChoice(choose, slot, -dir, n); haptic(); renderToday(main).then(() => { stagger(main); countUp(main); }); });
  }
  pullToRefresh(main);

  main.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const list = [...stops, { time: f.get('time'), type: f.get('type') }].sort((a, b) => a.time.localeCompare(b.time));
    await db.put('outfits', { ...(rec || { id: selected, date: selected, itemIds: [], accepted: false }), stops: list });
    choose = {}; haptic(); renderToday(main);
  };
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (b.id === 'streak') return sheet(`<h2 class="h2">${icon('flame', 22)} ${days}-day streak</h2>
      <p>Days in a row you wore a planned outfit. Tap <b>Wear this</b> each day to keep it going.</p>
      <div class="actions"><button class="btn primary wide" data-close>Got it</button></div>`);
    if (d.day) { selected = d.day; seed = 0; choose = {}; return renderToday(main).then(() => stagger(main)); }
    if (d.rmstop) { stops.splice(+d.rmstop, 1); await db.put('outfits', { ...rec, stops }); return renderToday(main); }
    if ('shuffle' in d) { seed++; choose = {}; haptic(); return renderToday(main).then(() => stagger(main)); }
    if (d.swap) { choose = nextChoice(choose, d.swap, 1, +d.options); return renderToday(main); }
    if ('more' in d) { showAllMissing = true; return renderToday(main); }
    if ('share' in d) return shareOutfit(plan ? plan.picks.map(p => p.item) : wornNow, cur, day);
    if ('wear' in d) {
      const before = await Promise.all(plan.picks.map(p => db.get('items', p.item.id)));
      $('.tiles', main)?.classList.add('done');
      $('.outfit', main)?.insertAdjacentHTML('beforeend', `<div class="worn-check"><span>${icon('check', 48)}</span></div>`);
      haptic();
      await db.putMany('items', before.filter(Boolean).map(i => wearItem(i, limits)));
      await db.put('outfits', { id: selected, date: selected, stops, itemIds: plan.picks.map(p => p.item.id), accepted: true, wornAt: Date.now() });
      toast('Outfit worn. Have a good day!', { undo: async () => {
        await db.putMany('items', before.filter(Boolean));
        await db.put('outfits', { id: selected, date: selected, stops, itemIds: [], accepted: false });
        renderToday(main);
      } });
      return setTimeout(() => renderToday(main), reduced() ? 0 : 750);
    }
    if (d.back || d.ham) {
      const it = await db.get('items', d.back || d.ham);
      await db.put('items', { ...it, status: d.back ? 'clean' : 'hamper', updatedAt: Date.now() });
      haptic();
      toast(d.back ? 'Put back' : 'Moved to hamper', { undo: async () => { await db.put('items', it); renderToday(main); } });
      return renderToday(main);
    }
    if ('allback' in d || 'allham' in d) {
      const list = wornNow.filter(i => i.status === 'worn');
      await db.putMany('items', list.map(i => ({ ...i, status: 'allback' in d ? 'clean' : 'hamper', updatedAt: Date.now() })));
      haptic();
      toast('allback' in d ? 'All put back' : 'Moved to hamper', { undo: async () => { await db.putMany('items', list); renderToday(main); } });
      return renderToday(main);
    }
    if ('replan' in d) { await db.put('outfits', { ...rec, accepted: false, itemIds: [] }); return renderToday(main); }
  };
}

function tileHtml(slot, item, i, loc, options = 0) {
  return `<div class="tile emerge" style="--i:${i}" data-slot="${esc(slot)}" data-options="${options}">
    <a class="photo" href="#item/${esc(item.id)}" draggable="false"><img src="${blobUrl(item)}" alt="${esc(itemName(item))}" draggable="false"><span class="loc-pop">${locIcon(loc?.type)}</span></a>
    ${options > 1 ? `<button class="swapbtn" data-swap="${esc(slot)}" data-options="${options}" aria-label="Swap ${esc(SLOT_LABEL[slot] || slot)}">${icon('swap', 16)}</button>` : ''}
    <span class="lbl">${esc(cap(itemName(item)))}</span></div>`;
}

function planHtml(plan, items, isToday, locOf) {
  if (!items.length) return `<div class="outfit empty">${loader('Empty')}<p>Add a few pieces and your outfit shows up here.</p><button class="btn coral big" data-add>${icon('plus')} Add clothes</button></div>`;
  const core = plan.picks.filter(p => TILE_ORDER.includes(p.slot)).sort((a, b) => TILE_ORDER.indexOf(a.slot) - TILE_ORDER.indexOf(b.slot));
  const tiles = core.slice(0, 6), rest = core.slice(6);
  const miss = plan.missing, shownMiss = showAllMissing ? miss : miss.slice(0, 1);
  return `<div class="outfit">
      ${tiles.length ? `<div class="tiles n${tiles.length}">${tiles.map((p, i) => tileHtml(p.slot, p.item, i, locOf.get(p.item.homeLocationId), p.options)).join('')}</div>`
        : '<p class="sub">No clean pieces fit today. Time for laundry?</p>'}
      ${rest.length ? `<p class="sub small" style="margin-top:8px">Plus ${rest.map(p => esc(itemName(p.item))).join(', ')}</p>` : ''}
      ${plan.tips.concat(plan.notes).map(t => `<p class="note" style="margin-top:8px">${esc(t)}</p>`).join('')}
      ${tiles.length ? `<div class="outfit-actions">${isToday ? `<button class="btn coral big" data-wear>${icon('check', 22)} Wear this</button>` : ''}
        <button class="icon-btn big" data-shuffle aria-label="Shuffle">${icon('shuffle', 22)}</button>
        <button class="icon-btn big" data-share aria-label="Share outfit">${icon('share', 22)}</button></div>` : ''}
    </div>
    ${plan.bring.length || miss.length ? `<div class="chips" style="margin-top:12px">
      ${plan.bring.map(b => `<span class="chip ice">${icon(/umbrella/i.test(b) ? 'umbrella' : /sun/i.test(b) ? 'sunglasses' : /gym/i.test(b) ? 'backpack' : 'tag', 18)}${esc(/umbrella/i.test(b) ? 'Bring umbrella' : b)}</span>`).join('')}
      ${shownMiss.map(g => `<a class="chip miss" href="#shop?gap=${esc(g)}">Missing: ${esc(GAPS[g]?.[0]?.toLowerCase() || g)} ${icon('chevron-right', 16)}</a>`).join('')}
      ${miss.length > shownMiss.length ? `<button class="chip" data-more>+${miss.length - shownMiss.length} more</button>` : ''}</div>` : ''}`;
}

function wornHtml(list) {
  const out = list.filter(i => i.status === 'worn');
  return `<div class="outfit"><div class="tiles n${Math.min(list.length, 6)}">${list.filter(i => !['underwear', 'socks'].includes(i.category)).slice(0, 6).map((i, n) => `<div class="tile" style="--i:${n}">
      <a class="photo" href="#item/${esc(i.id)}"><img src="${blobUrl(i)}" alt=""></a><span class="lbl">${esc(cap(itemName(i)))}</span></div>`).join('')}</div>
      <div class="outfit-actions"><button class="icon-btn big" data-share aria-label="Share outfit">${icon('share', 22)}</button><button class="btn ghost" data-replan>Plan a new outfit</button></div></div>
    ${out.length ? `<h2 class="h2">End of day</h2><div class="card eod"><p class="sub">Put it back, or in the hamper?</p>
      ${out.map(i => `<div class="between"><span class="row"><img class="mini" src="${blobUrl(i)}" alt="">${esc(cap(itemName(i)))}</span><span class="row">
        <button class="btn ghost sm" data-back="${esc(i.id)}">Put back</button><button class="btn ghost sm" data-ham="${esc(i.id)}">Hamper</button></span></div>`).join('')}
      <div class="actions"><button class="btn ghost sm" data-allback>All back</button><button class="btn ghost sm" data-allham>All in hamper</button></div></div>` : ''}`;
}

// Pull down at the top of Today: hanger swings while weather + outfit refresh.
function pullToRefresh(main) {
  let y0 = null, pulled = false;
  const ptr = $('.ptr', main);
  main.ontouchstart = e => { y0 = scrollY <= 0 ? e.touches[0].clientY : null; pulled = false; };
  main.ontouchmove = e => { if (y0 == null) return; pulled = e.touches[0].clientY - y0 > 70; ptr.classList.toggle('on', pulled); };
  main.ontouchend = async () => {
    if (!pulled) { ptr.classList.remove('on'); y0 = null; return; }
    y0 = null; ptr.querySelector('.logo-svg')?.classList.add('swinging'); replayLogo(document.querySelector('#brand'));
    forceWx = true; haptic();
    await renderToday(main); stagger(main); countUp(main);
  };
}

// 1080x1350 share image: outfit photos on paper, date + weather, logo, (c) 2026 ATTINERA.
async function shareOutfit(list, cur, day) {
  const pics = list.filter(i => i.photo && !['underwear', 'socks'].includes(i.category)).slice(0, 6);
  const c = Object.assign(document.createElement('canvas'), { width: 1080, height: 1350 }), g = c.getContext('2d');
  g.fillStyle = '#F7F7FF'; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#495867'; g.fillRect(0, 0, 1080, 200);
  try { const logo = new Image(); logo.src = 'assets/attinera-logo-a.svg'; await logo.decode(); g.drawImage(logo, 64, 52, 96, 96); } catch {}
  g.fillStyle = '#FFFFFF'; g.font = '600 52px Inter, Segoe UI, sans-serif'; g.fillText('ATTINERA', 184, 118);
  g.fillStyle = '#FE5F55'; g.fillText('.', 184 + g.measureText('ATTINERA').width, 118);
  g.fillStyle = '#BDD5EA'; g.font = '400 30px Inter, Segoe UI, sans-serif';
  g.fillText(`${fmtDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}${cur ? ` · ${temp(cur.temp)} · ${describe(cur.code)}` : ''}${day ? ` · rain ${day.rain}%` : ''}`, 184, 160);
  const cols = pics.length > 4 ? 3 : 2, size = (1080 - 64 * 2 - 24 * (cols - 1)) / cols;
  for (const [i, it] of pics.entries()) {
    const x = 64 + (i % cols) * (size + 24), y = 248 + Math.floor(i / cols) * (size + 24);
    const bmp = await createImageBitmap(it.photo);
    g.save(); g.beginPath(); g.roundRect(x, y, size, size, 28); g.clip(); g.drawImage(bmp, x, y, size, size); g.restore();
  }
  g.fillStyle = '#577399'; g.font = '400 28px Inter, Segoe UI, sans-serif'; g.textAlign = 'center';
  g.fillText('© 2026 ATTINERA', 540, 1300);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], `attinera-outfit-${selected}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'My ATTINERA outfit' });
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Outfit image saved');
}
