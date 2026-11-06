// Today tab: weather for the day, stops, outfit engine output, wear/shuffle/swap, end-of-day, live week.
import * as db from './db.js';
import { planOutfit, wearItem, STOP_TYPES, GAPS, hourLabel } from './model.js';
import { getForecast, describe, emoji, todayStr } from './weather.js';
import { icon, esc, $, opts, toast, blobUrl, temp, cap } from './ui.js';
import { getLimits, itemName } from './closet.js';

let selected = null, seed = 0, choose = {};
const SLOT_LABEL = { underwear: 'Underwear', socks: 'Socks', top: 'Top', bottom: 'Bottom', mid: 'Layer', blazer: 'Blazer', outer: 'Outer layer', shoes: 'Shoes', hat: 'Hat', gloves: 'Gloves', scarf: 'Scarf' };
const fmtDate = (d, o) => new Date(d + 'T12:00').toLocaleDateString('en-CA', o);

export async function renderToday(main) {
  const today = todayStr();
  selected ??= today;
  const [wx, items, limits, rec] = await Promise.all([getForecast(), db.all('items'), getLimits(), db.get('outfits', selected)]);
  if (wx && !wx.days.some(d => d.date === selected)) selected = wx.days[0].date;
  const isToday = selected === today;
  const hours = wx?.hours[selected] || [];
  const day = wx?.days.find(d => d.date === selected);
  const stops = rec?.stops || [];
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const nowH = isToday ? hours.filter(x => +x.time.slice(11, 13) >= h) : hours.filter(x => +x.time.slice(11, 13) >= 6);
  const cur = isToday && wx?.current ? wx.current : day && { temp: day.max, feels: day.feelsMax, code: day.code, wind: Math.max(0, ...hours.map(x => x.wind)) };

  let plan = null, wornNow = [];
  if (rec?.accepted) {
    const byId = new Map(items.map(i => [i.id, i]));
    wornNow = rec.itemIds.map(id => byId.get(id)).filter(Boolean);
  } else {
    plan = planOutfit({ items, hours, stops, seed, choose, limits });
    if (isToday) await db.setSetting('gaps', plan.missing);
  }

  main.innerHTML = `
    <section class="hello">
      <p class="muted">${isToday ? greet : 'Preview'} · ${esc(fmtDate(selected, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
      <div class="now">
        <div><div class="big">${cur ? temp(cur.temp) : '--°'}</div>
          <p>${cur ? `${emoji(cur.code)} ${describe(cur.code)}` : 'Weather unavailable'} ${wx?.offline ? '<span class="badge">offline</span>' : ''}</p>
          <p class="muted small">${esc(wx?.city?.name || 'Toronto, ON')}</p></div>
        <ul class="facts">
          <li>Feels like <b>${cur ? temp(cur.feels) : '--'}</b></li>
          <li>${icon('drop', 16)} Rain <b>${day ? day.rain : '--'}%</b></li>
          <li>${icon('wind', 16)} Wind <b>${cur ? Math.round(cur.wind) : '--'} km/h</b></li>
        </ul>
      </div>
      ${nowH.length ? `<div class="hours" aria-label="Hourly forecast">${nowH.map(x => `<div class="hr"><span>${hourLabel(x.time)}</span><span aria-hidden="true">${emoji(x.code)}</span><b>${temp(x.temp)}</b><span class="muted">${x.rain}%</span></div>`).join('')}</div>`
        : `<p class="muted small">${wx ? '' : 'Could not load the forecast. Outfits assume a mild 12°C day.'}</p>`}
    </section>

    <section><h2 class="h2">My day</h2>
      <ul class="stops">${stops.map((s, i) => `<li><b>${esc(s.time)}</b> ${esc(s.type)} <span class="muted small">${STOP_TYPES[s.type] === 'activewear' ? 'activewear' : esc(STOP_TYPES[s.type])}</span>
        <button class="icon-btn" data-rmstop="${i}" aria-label="Remove ${esc(s.type)} at ${esc(s.time)}">${icon('x', 18)}</button></li>`).join('') || '<li class="muted">No plans yet. Add where you are going so the outfit fits.</li>'}</ul>
      ${rec?.accepted ? '' : `<form class="addstop" id="addStop"><input type="time" name="time" value="${String(Math.min(22, isToday ? h + 1 : 9)).padStart(2, '0')}:00" required aria-label="Time">
        <select name="type" aria-label="Type">${opts(Object.keys(STOP_TYPES).map(t => [t, t]))}</select>
        <button class="btn primary sm">Add stop</button></form>`}
    </section>

    <section><h2 class="h2">${rec?.accepted ? "Today's outfit" : 'Your outfit'}</h2>
      ${rec?.accepted ? wornHtml(wornNow) : planHtml(plan, items, isToday)}
    </section>

    ${wx ? `<section><h2 class="h2">This week</h2><div class="week">${wx.days.map(d => `<button class="wday" data-day="${d.date}" aria-pressed="${d.date === selected}">
      <span>${d.date === today ? 'Today' : esc(fmtDate(d.date, { weekday: 'short' }))}</span><span class="e" aria-hidden="true">${emoji(d.code)}</span>
      <b>${temp(d.max)}</b><span class="muted">${temp(d.min)}</span>${d.rain >= 50 ? `<span class="small">${icon('umbrella', 14)}${d.rain}%</span>` : ''}</button>`).join('')}</div></section>` : ''}`;

  main.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const list = [...stops, { time: f.get('time'), type: f.get('type') }].sort((a, b) => a.time.localeCompare(b.time));
    await db.put('outfits', { ...(rec || { id: selected, date: selected, itemIds: [], accepted: false }), stops: list });
    choose = {}; renderToday(main);
  };
  main.onclick = async e => {
    const b = e.target.closest('button,a[data-gap]'); if (!b) return;
    const d = b.dataset;
    if (d.day) { selected = d.day; seed = 0; choose = {}; return renderToday(main); }
    if (d.rmstop) { stops.splice(+d.rmstop, 1); await db.put('outfits', { ...rec, stops }); return renderToday(main); }
    if ('shuffle' in d) { seed++; choose = {}; return renderToday(main); }
    if (d.swap) { choose[d.swap] = (choose[d.swap] || 0) + 1; return renderToday(main); }
    if ('wear' in d) {
      const fresh = await Promise.all(plan.picks.map(p => db.get('items', p.item.id)));
      await db.putMany('items', fresh.filter(Boolean).map(i => wearItem(i, limits)));
      await db.put('outfits', { id: selected, date: selected, stops, itemIds: plan.picks.map(p => p.item.id), accepted: true, wornAt: Date.now() });
      toast('Enjoy your day! Wear counts updated.');
      return renderToday(main);
    }
    if (d.back || d.ham) {
      const it = await db.get('items', d.back || d.ham);
      await db.put('items', { ...it, status: d.back ? 'clean' : 'hamper', updatedAt: Date.now() });
      return renderToday(main);
    }
    if ('allback' in d || 'allham' in d) {
      await db.putMany('items', wornNow.filter(i => i.status === 'worn').map(i => ({ ...i, status: 'allback' in d ? 'clean' : 'hamper', updatedAt: Date.now() })));
      return renderToday(main);
    }
    if ('replan' in d) { await db.put('outfits', { ...rec, accepted: false, itemIds: [] }); return renderToday(main); }
  };
}

function planHtml(plan, items, isToday) {
  if (!items.length) return `<div class="empty small-empty"><p>Add a few pieces to your closet and ATTINERA will plan outfits around the weather.</p><button class="btn primary" data-add>${icon('plus')} Add clothes</button></div>`;
  const core = plan.picks.filter(p => !['underwear', 'socks'].includes(p.slot));
  const basics = plan.picks.filter(p => ['underwear', 'socks'].includes(p.slot));
  return `
    ${plan.activeOnly ? '<p class="muted">Gym day: activewear first.</p>' : ''}
    <div class="stack">${core.map(p => `<div class="pick"><a href="#item/${esc(p.item.id)}"><img src="${blobUrl(p.item)}" alt="${esc(itemName(p.item))}"></a>
      <div><span class="muted small">${SLOT_LABEL[p.slot] || cap(p.slot)}${p.optional ? ' · optional' : ''}</span><b>${esc(cap(itemName(p.item)))}</b></div>
      ${p.options > 1 ? `<button class="icon-btn" data-swap="${p.slot}" aria-label="Swap ${esc(SLOT_LABEL[p.slot] || p.slot)}">${icon('swap', 20)}</button>` : ''}</div>`).join('')}</div>
    ${basics.length ? `<p class="muted small">Plus clean ${basics.map(p => esc(itemName(p.item))).join(' and ')}.</p>` : ''}
    ${plan.tips.map(t => `<p class="tip">${esc(t)}</p>`).join('')}
    ${plan.notes.map(t => `<p class="tip">${esc(t)}</p>`).join('')}
    ${plan.bring.length ? `<p class="bring"><b>Bring:</b> ${plan.bring.map(esc).join(' · ')}</p>` : ''}
    ${plan.missing.length ? `<div class="chips">${plan.missing.map(g => `<a class="chip coral" data-gap href="#shop?gap=${esc(g)}">Missing: ${esc(GAPS[g]?.[0]?.toLowerCase() || g)} →</a>`).join('')}</div>` : ''}
    <div class="actions">${isToday && core.length ? `<button class="btn primary" data-wear>${icon('check', 20)} Wear this</button>` : ''}
      ${core.length ? `<button class="btn ghost" data-shuffle>${icon('shuffle', 20)} Shuffle</button>` : ''}</div>`;
}

function wornHtml(list) {
  const out = list.filter(i => i.status === 'worn');
  return `<div class="stack">${list.map(i => `<div class="pick"><img src="${blobUrl(i)}" alt=""><div><b>${esc(cap(itemName(i)))}</b>
      <span class="muted small">${i.status === 'worn' ? 'wearing' : i.status === 'hamper' ? 'in the hamper' : i.status}</span></div></div>`).join('')}</div>
    ${out.length ? `<div class="card eod"><h3 class="h3">End of day: put today's outfit back or in the hamper?</h3>
      ${out.map(i => `<div class="row-between line"><span>${esc(cap(itemName(i)))}</span><span class="row">
        <button class="btn ghost sm" data-back="${esc(i.id)}">Put back</button><button class="btn ghost sm" data-ham="${esc(i.id)}">Hamper</button></span></div>`).join('')}
      <div class="actions"><button class="btn ghost sm" data-allback>All back</button><button class="btn ghost sm" data-allham>All in hamper</button></div></div>`
      : '<p class="muted">All sorted for today.</p>'}
    <button class="btn ghost sm" data-replan>Plan a new outfit</button>`;
}
