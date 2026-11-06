// Today tab (layout C): header with weather chip, one steel hero card (the outfit), two quick-status tiles,
// "Your day" stops (added in a sheet), "This week" day chips (tap = preview that day). Pull down to refresh.
import * as db from './db.js';
import { planOutfit, wearItem, STOP_TYPES, GAPS, hourLabel, nextChoice, streak } from './model.js';
import { getForecast, describe, wxIcon, todayStr } from './weather.js';
import { icon, esc, $, $$, toast, blobUrl, photoOf, temp, cap, stagger, countUp, swipe, swipeRow, swRow, haptic, sheet, closeSheet, loader, logoSvg, replayLogo, reduced } from './ui.js';
import { getLimits, itemName } from './closet.js';
import { lowSupply } from './laundry.js';

let selected = null, seed = 0, choose = {}, forceWx = false;
const SLOT_LABEL = { top: 'Top', bottom: 'Bottom', mid: 'Layer', blazer: 'Blazer', outer: 'Outer layer', shoes: 'Shoes', hat: 'Hat', gloves: 'Gloves', scarf: 'Scarf' };
const TILE_ORDER = ['outer', 'blazer', 'mid', 'top', 'bottom', 'shoes', 'hat', 'gloves', 'scarf'];
const fmtDate = (d, o) => new Date(d + 'T12:00').toLocaleDateString('en-CA', o);
const timeLabel = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; };

export async function renderToday(main) {
  const today = todayStr();
  selected ??= today;
  const [wx, items, limits, rec, outfits] = await Promise.all([
    getForecast(forceWx), db.all('items'), getLimits(), db.get('outfits', selected), db.all('outfits')]);
  forceWx = false;
  if (wx && !wx.days.some(d => d.date === selected)) selected = wx.days[0].date;
  const isToday = selected === today;
  const hours = wx?.hours[selected] || [];
  const day = wx?.days.find(d => d.date === selected);
  const stops = rec?.stops || [];
  const cur = isToday && wx?.current ? wx.current : day && { temp: day.max, code: day.code };
  const days = streak(outfits, today);
  const hamper = items.filter(i => i.status === 'hamper').length;

  let plan = null, wornNow = [];
  if (rec?.accepted) {
    const byId = new Map(items.map(i => [i.id, i]));
    wornNow = rec.itemIds.map(id => byId.get(id)).filter(Boolean);
  } else {
    plan = planOutfit({ items, hours, stops, seed, choose, limits });
    if (isToday) await db.setSetting('gaps', plan.missing);
  }
  const warn = isToday ? await lowSupply(items) : [];

  // Ice line: "Friday · class at 6 pm"
  const nowHM = new Date().toTimeString().slice(0, 5);
  const nextStop = stops.find(s => !isToday || s.time >= nowHM) || stops[0];
  const line = [isToday ? fmtDate(selected, { weekday: 'long' }) : fmtDate(selected, { weekday: 'long', month: 'short', day: 'numeric' }),
    nextStop ? `${nextStop.type.toLowerCase()} at ${timeLabel(nextStop.time)}` : cur ? `${temp(cur.temp)} · ${describe(cur.code).toLowerCase()}` : ''].filter(Boolean).join(' · ');

  main.innerHTML = `<div class="ptr" aria-hidden="true">${loader('Refreshing')}</div>
    <header class="hdr today-hdr">
      <button class="hdr-logo" data-logo type="button" aria-label="Attinera. Tap to replay the logo">${logoSvg()}</button>
      <div class="hdr-title"><h1>Attinera</h1></div>
      ${cur ? `<button class="wx-chip" id="wxChip" type="button" aria-label="${esc(temp(cur.temp))}, ${esc(describe(cur.code))}. Open forecast">${icon(wxIcon(cur.code), 20)}<b>${temp(cur.temp)}</b></button>`
        : `<button class="wx-chip" id="wxChip" type="button" aria-label="Forecast">${icon('cloud', 20)}<b>--°</b></button>`}
    </header>
    <div class="content today-grid">
      <section class="t-hero" aria-label="Outfit">${heroHtml({ plan, rec, items, wornNow, isToday, line, days })}</section>
      <section class="t-status" aria-label="Status">${statusHtml(hamper, plan, warn, wx, day)}</section>
      ${rec?.accepted ? `<section class="t-eod">${eodHtml(wornNow)}</section>` : ''}
      <section class="t-day">
        <div class="sec-head"><h2 class="h2">Your day</h2>${rec?.accepted ? '' : `<button class="btn ghost sm" id="addStopBtn">${icon('plus', 18)} Add a stop</button>`}</div>
        <div class="list-rows" id="stops">${stops.map((s, i) => swRow(`<div class="stop"><time>${esc(timeLabel(s.time))}</time><span>${esc(s.type)}</span></div>`, `Delete ${s.type} at ${s.time}`)
          .replace('class="sw-row ', `data-stop="${i}" class="sw-row `)).join('') || '<p class="sub pad">No plans yet. Add class, work or the gym and the outfit adapts.</p>'}</div>
      </section>
      <section class="t-week">
        <h2 class="h2">This week</h2>
        ${wx ? `<div class="week">${wx.days.map(d => `<button class="wday" data-day="${d.date}" aria-pressed="${d.date === selected}" aria-label="${esc(fmtDate(d.date, { weekday: 'long' }))}, high ${temp(d.max)}, low ${temp(d.min)}">
          <span>${d.date === today ? 'Today' : esc(fmtDate(d.date, { weekday: 'short' }))}</span>${icon(wxIcon(d.code), 20)}
          <b>${temp(d.max)}</b><span class="lo">${temp(d.min)}</span></button>`).join('')}</div>` : '<p class="sub">Forecast unavailable. Outfits assume a mild 12° day.</p>'}
      </section>
    </div>`;

  // Swipe a tile to swap it for the next best clean option.
  for (const t of $$('.tile[data-slot]', main)) {
    const slot = t.dataset.slot, n = +t.dataset.options;
    if (n > 1) swipe(t, dir => { choose = nextChoice(choose, slot, -dir, n); haptic(); renderToday(main).then(() => { stagger(main); countUp(main); }); });
  }
  // Swipe a stop left to delete it.
  for (const row of $$('[data-stop]', main)) {
    const i = +row.dataset.stop;
    swipeRow(row, { onDelete: () => removeStop(i) });
  }
  pullToRefresh(main);

  async function saveStops(list) {
    await db.put('outfits', { ...(rec || { id: selected, date: selected, itemIds: [], accepted: false }), stops: list });
  }
  async function removeStop(i) {
    const before = [...stops], gone = stops[i];
    await saveStops(stops.filter((_, n) => n !== i)); choose = {};
    toast(`Removed ${gone.type.toLowerCase()} at ${timeLabel(gone.time)}`, { undo: async () => { await saveStops(before); renderToday(main); } });
    renderToday(main);
  }

  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (b.id === 'wxChip') return forecastSheet(wx, day, hours, isToday);
    if (b.id === 'addStopBtn') return addStopSheet(stops, isToday, async list => { await saveStops(list); choose = {}; haptic(); renderToday(main); });
    if (b.id === 'statusBring') return detailsSheet(plan, warn, day);
    if (b.id === 'streak') return sheet(`<h2 class="h2">${icon('flame', 22, 'inl coral-ic')} ${days}-day streak</h2>
      <p class="sub">Days in a row you wore a planned outfit. Tap <b>Wear this</b> each day to keep it going.</p>
      <div class="actions"><button class="btn primary wide" data-close>Got it</button></div>`);
    if (d.day) { selected = d.day; seed = 0; choose = {}; return renderToday(main).then(() => stagger(main)); }
    if ('shuffle' in d) { seed++; choose = {}; haptic(); return renderToday(main).then(() => stagger(main)); }
    if (d.swap) { choose = nextChoice(choose, d.swap, 1, +d.options); return renderToday(main); }
    if ('share' in d) return shareOutfit(plan ? plan.picks.map(p => p.item) : wornNow, cur, day);
    if ('wear' in d) {
      const before = await Promise.all(plan.picks.map(p => db.get('items', p.item.id)));
      $('.tiles', main)?.classList.add('done');
      $('.hero', main)?.insertAdjacentHTML('beforeend', `<div class="worn-check"><span>${icon('check', 48)}</span></div>`);
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
      await db.put('items', { ...it, status: d.back ? 'clean' : 'hamper' });
      haptic();
      toast(d.back ? 'Put back' : 'Moved to hamper', { undo: async () => { await db.put('items', it); renderToday(main); } });
      return renderToday(main);
    }
    if ('allback' in d || 'allham' in d) {
      const list = wornNow.filter(i => i.status === 'worn');
      await db.putMany('items', list.map(i => ({ ...i, status: 'allback' in d ? 'clean' : 'hamper' })));
      haptic();
      toast('allback' in d ? 'All put back' : 'Moved to hamper', { undo: async () => { await db.putMany('items', list); renderToday(main); } });
      return renderToday(main);
    }
    if ('replan' in d) { await db.put('outfits', { ...rec, accepted: false, itemIds: [] }); return renderToday(main); }
  };
}

function tileHtml(slot, item, i, options = 0) {
  return `<div class="tile emerge" style="--i:${i}" data-slot="${esc(slot)}" data-options="${options}">
    <a class="photo" href="#item/${esc(item.id)}" draggable="false"><img src="${blobUrl(item)}" alt="${esc(cap(itemName(item)))}" draggable="false"></a>
    ${options > 1 ? `<button class="swapbtn" data-swap="${esc(slot)}" data-options="${options}" aria-label="Swap ${esc(SLOT_LABEL[slot] || slot)}">${icon('swap', 16)}</button>` : ''}
    <span class="lbl">${esc(cap(itemName(item)))}</span></div>`;
}

function heroHtml({ plan, rec, items, wornNow, isToday, line, days }) {
  const top = `<div class="hero-top"><p class="hero-line">${esc(cap(line))}</p>
    ${days ? `<button class="streak" id="streak" aria-label="${days} day streak">${icon('flame', 16)}${days}</button>` : ''}</div>`;
  if (!items.length && !rec?.accepted) {
    return `<div class="hero empty">${top}<h2 class="hero-title">Add 3 pieces to get your first outfit</h2>
      <p class="hero-sub">Snap a photo of a top, a bottom and shoes.</p>
      <button class="btn coral big wide" data-add>${icon('plus', 22)} Add clothes</button></div>`;
  }
  if (rec?.accepted) {
    const shown = wornNow.filter(i => !['underwear', 'socks'].includes(i.category)).slice(0, 5);
    return `<div class="hero">${top}<div class="hero-head"><h2 class="hero-title">Outfit worn</h2>
      <button class="icon-btn on-steel" data-share aria-label="Share outfit">${icon('share', 20)}</button></div>
      <div class="tiles n${shown.length}">${shown.map((i, n) => `<div class="tile" style="--i:${n}"><a class="photo" href="#item/${esc(i.id)}"><img src="${blobUrl(i)}" alt=""></a><span class="lbl">${esc(cap(itemName(i)))}</span></div>`).join('')}</div>
      <button class="btn on-steel wide" data-replan>Plan a new outfit</button></div>`;
  }
  const core = plan.picks.filter(p => TILE_ORDER.includes(p.slot)).sort((a, b) => TILE_ORDER.indexOf(a.slot) - TILE_ORDER.indexOf(b.slot));
  const tiles = core.slice(0, 5), rest = core.slice(5);
  return `<div class="hero">${top}
    <div class="hero-head"><h2 class="hero-title">${isToday ? 'Your outfit is ready' : 'Outfit preview'}</h2>
      <span class="row nowrap"><button class="icon-btn on-steel" data-shuffle aria-label="Shuffle">${icon('shuffle', 20)}</button>
      <button class="icon-btn on-steel" data-share aria-label="Share outfit">${icon('share', 20)}</button></span></div>
    ${tiles.length ? `<div class="tiles n${tiles.length}">${tiles.map((p, i) => tileHtml(p.slot, p.item, i, p.options)).join('')}</div>`
      : '<p class="hero-sub">No clean pieces fit this day. Time for laundry?</p>'}
    ${rest.length ? `<p class="hero-sub">Plus ${rest.map(p => esc(itemName(p.item))).join(', ')}</p>` : ''}
    ${plan.tips.concat(plan.notes).map(t => `<p class="hero-sub">${esc(t)}</p>`).join('')}
    ${tiles.length && isToday ? `<button class="btn coral big wide" data-wear>${icon('check', 22)} Wear this</button>` : ''}
  </div>`;
}

function statusHtml(hamper, plan, warn, wx, day) {
  const bring = plan?.bring || [], miss = plan?.missing || [];
  let label = 'Nothing to bring', ic = 'check';
  if (bring.some(b => /umbrella/i.test(b))) { label = 'Bring umbrella'; ic = 'umbrella'; }
  else if (miss.includes('gloves') || bring.some(b => /gloves/i.test(b))) { label = 'Need gloves'; ic = 'temperature'; }
  else if (bring.length) { label = bring[0]; ic = /sun/i.test(bring[0]) ? 'sunglasses' : /gym/i.test(bring[0]) ? 'backpack' : 'tag'; }
  else if (miss.length) { label = `Missing ${GAPS[miss[0]]?.[0]?.toLowerCase() || miss[0]}`; ic = 'info-circle'; }
  else if (warn.length) { label = warn[0]; ic = 'info-circle'; }
  const extra = bring.length + miss.length + warn.length;
  return `<div class="stat-tiles">
    <a class="stat" href="#laundry">${icon('basket', 24)}<span><b>${hamper} in hamper</b><small>${hamper ? 'Open Laundry' : 'All clean'}</small></span></a>
    <button class="stat${miss.length || warn.length ? ' alert' : ''}" id="statusBring" type="button">${icon(ic, 24)}<span><b>${esc(label)}</b><small>${extra > 1 ? `${extra} things to check` : day ? `Rain ${day.rain}%` : 'Details'}</small></span></button>
  </div>`;
}

function eodHtml(list) {
  const out = list.filter(i => i.status === 'worn');
  if (!out.length) return '';
  return `<h2 class="h2">End of day</h2><div class="card eod"><p class="sub">Put it back, or in the hamper?</p>
    ${out.map(i => `<div class="between"><span class="row nowrap"><img class="mini" src="${blobUrl(i)}" alt="">${esc(cap(itemName(i)))}</span><span class="row nowrap">
      <button class="btn ghost sm" data-back="${esc(i.id)}">Put back</button><button class="btn ghost sm" data-ham="${esc(i.id)}">Hamper</button></span></div>`).join('')}
    <div class="actions"><button class="btn ghost sm" data-allback>All back</button><button class="btn ghost sm" data-allham>All in hamper</button></div></div>`;
}

function detailsSheet(plan, warn, day) {
  const bring = plan?.bring || [], miss = plan?.missing || [];
  sheet(`<h2 class="h2">Before you go</h2>
    ${day ? `<p class="sub">High ${temp(day.max)} · low ${temp(day.min)} · rain ${day.rain}%</p>` : ''}
    ${bring.length ? `<h3 class="h3 gap-top">Bring</h3><ul class="plain">${bring.map(b => `<li>${icon(/umbrella/i.test(b) ? 'umbrella' : /sun/i.test(b) ? 'sunglasses' : /gym/i.test(b) ? 'backpack' : 'tag', 20)}${esc(b)}</li>`).join('')}</ul>` : ''}
    ${miss.length ? `<h3 class="h3 gap-top">Missing from your closet</h3><div class="list-rows">${miss.map(g => `<a class="row-link" href="#shop?gap=${esc(g)}" data-close>${icon('shopping-bag')}<span>${esc(GAPS[g]?.[0] || g)}<small>See options in Shop</small></span>${icon('chevron-right', 20)}</a>`).join('')}</div>` : ''}
    ${warn.length ? `<h3 class="h3 gap-top">Laundry</h3><ul class="plain">${warn.map(w => `<li>${icon('info-circle', 20)}${esc(w)}</li>`).join('')}</ul>` : ''}
    ${(plan?.tips || []).length ? `<h3 class="h3 gap-top">Layers</h3><ul class="plain">${plan.tips.map(t => `<li>${icon('temperature', 20)}${esc(t)}</li>`).join('')}</ul>` : ''}
    ${!bring.length && !miss.length && !warn.length ? '<p class="sub gap-top">You’re all set. Nothing extra needed today.</p>' : ''}
    <div class="actions"><button class="btn primary wide" data-close>Done</button></div>`);
}

function forecastSheet(wx, day, hours, isToday) {
  if (!wx) return sheet('<h2 class="h2">Forecast</h2><p class="sub">Forecast unavailable right now. Pull down on Today to try again.</p>');
  const h = new Date().getHours();
  const list = hours.filter(x => +x.time.slice(11, 13) >= (isToday ? h : 6)).slice(0, 16);
  sheet(`<h2 class="h2">${esc(wx.city?.name || 'Forecast')}</h2>
    <p class="sub">${isToday && wx.current ? `Now ${temp(wx.current.temp)}, feels like ${temp(wx.current.feels)} · ` : ''}${day ? `${describe(day.code)} · high ${temp(day.max)} · low ${temp(day.min)} · rain ${day.rain}%` : ''}${wx.offline ? ' · offline' : ''}</p>
    <div class="hours">${list.map(x => `<div class="hour"><span>${hourLabel(x.time)}</span>${icon(wxIcon(x.code), 20)}<b>${temp(x.temp)}</b><small>${icon('droplet', 12, 'inl')}${Math.round(x.rain)}%</small></div>`).join('')}</div>
    <div class="actions"><a class="btn ghost" href="#me/city" data-close>${icon('map-pin', 18)} Change city</a><button class="btn primary" data-close>Done</button></div>`);
}

function addStopSheet(stops, isToday, save) {
  const h = new Date().getHours();
  const p = sheet(`<h2 class="h2">Add a stop</h2><form id="stopForm">
    <label class="field">Time<input type="time" name="time" value="${String(Math.min(22, isToday ? h + 1 : 9)).padStart(2, '0')}:00" required></label>
    <fieldset><legend>Where</legend><div class="chips">${Object.keys(STOP_TYPES).map((t, i) => `<label class="chip"><input type="radio" name="type" value="${t}"${i ? '' : ' checked'}>${t}</label>`).join('')}</div></fieldset>
    <button class="btn primary big wide">Add stop</button></form>`);
  $('#stopForm', p).onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    closeSheet();
    save([...stops, { time: f.get('time'), type: f.get('type') }].sort((a, b) => a.time.localeCompare(b.time)));
  };
}

// Pull down at the top of Today: hanger swings while weather + outfit refresh.
function pullToRefresh(main) {
  let y0 = null, pulled = false;
  const ptr = $('.ptr', main);
  main.ontouchstart = e => { y0 = scrollY <= 0 && !e.target.closest('.sw-row, .tile') ? e.touches[0].clientY : null; pulled = false; };
  main.ontouchmove = e => { if (y0 == null) return; pulled = e.touches[0].clientY - y0 > 70; ptr.classList.toggle('on', pulled); };
  main.ontouchend = async () => {
    if (!pulled) { ptr.classList.remove('on'); y0 = null; return; }
    y0 = null; replayLogo($('.hdr-logo', main)); replayLogo($('#brand'));
    forceWx = true; haptic();
    await renderToday(main); stagger(main); countUp(main);
  };
}

// 1080x1350 share image: outfit photos on white, date + weather, logo, (c) 2026 Attinera.
async function shareOutfit(list, cur, day) {
  const pics = list.filter(i => photoOf(i) && !['underwear', 'socks'].includes(i.category)).slice(0, 6);
  const c = Object.assign(document.createElement('canvas'), { width: 1080, height: 1350 }), g = c.getContext('2d');
  g.fillStyle = '#F7F7FF'; g.fillRect(0, 0, 1080, 1350);
  try { const logo = new Image(); logo.src = 'assets/attinera-logo-v2.svg'; await logo.decode(); g.drawImage(logo, 64, 56, 96, 96); } catch {}
  g.fillStyle = '#495867'; g.font = '600 52px Inter, Segoe UI, sans-serif'; g.fillText('Attinera', 180, 118);
  g.fillStyle = '#577399'; g.font = '400 30px Inter, Segoe UI, sans-serif';
  g.fillText(`${fmtDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}${cur ? ` · ${temp(cur.temp)} · ${describe(cur.code)}` : ''}${day ? ` · rain ${day.rain}%` : ''}`, 180, 160);
  const cols = pics.length > 4 ? 3 : 2, size = (1080 - 64 * 2 - 24 * (cols - 1)) / cols;
  for (const [i, it] of pics.entries()) {
    const x = 64 + (i % cols) * (size + 24), y = 228 + Math.floor(i / cols) * (size + 24);
    const bmp = await createImageBitmap(photoOf(it));
    g.save(); g.beginPath(); g.roundRect(x, y, size, size, 28); g.fillStyle = '#FFFFFF'; g.fill(); g.clip(); g.drawImage(bmp, x, y, size, size); g.restore();
    g.strokeStyle = '#E4EBF3'; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, size, size, 28); g.stroke();
  }
  g.fillStyle = '#7A8BA0'; g.font = '400 28px Inter, Segoe UI, sans-serif'; g.textAlign = 'center';
  g.fillText('© 2026 Attinera', 540, 1300);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], `attinera-outfit-${selected}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'My Attinera outfit' });
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Outfit image saved');
}
