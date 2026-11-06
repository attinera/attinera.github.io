// First launch: 1) city  2) first 3 items  3) done. Skip on every step; never shows again once finished/skipped.
import * as db from './db.js';
import { geocode, getCity } from './weather.js';
import { icon, esc, $, loader, logoSvg, replayLogo, haptic } from './ui.js';
import { accountsOn } from './sync.js';
import { takePhoto, pickGallery } from './closet.js';

export async function maybeOnboard(onDone) {
  if (await db.getSetting('onboarded')) return;
  if ((await db.all('items')).length) { await db.setSetting('onboarded', true); return; } // existing users skip it
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'onboard';
    document.body.append(el);
    let step = 0;
    const finish = async () => { await db.setSetting('onboarded', true); el.remove(); removeEventListener('attinera:added', draw); onDone?.(); resolve(); };
    const next = () => { step++; haptic(); draw(); };
    const head = (title, sub) => `<header class="ob-head">${step < 2 ? '<button class="skip" data-skip>Skip</button>' : ''}
      <img class="lockup" src="assets/attinera-logo-v2-lockup.svg" alt="Attinera">
      <h1>${title}</h1><p>${sub}</p><div class="dots" aria-label="Step ${step + 1} of 3">${[0, 1, 2].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div></header>`;

    async function draw() {
      if (step === 0) {
        const city = await getCity();
        el.innerHTML = head('Welcome to Attinera', 'Dress for the day ahead.') + `<div class="ob-body view-in">
          <h2 class="h2">Where are you?</h2><p class="sub">For your daily weather.</p>
          <form id="obCity" class="row" style="margin-top:16px"><label class="search" style="flex:1">${icon('search', 20)}<input name="q" type="search" placeholder="Search a city" aria-label="City"></label><button class="btn primary">Search</button></form>
          <div id="obRes" class="chips" style="margin-top:12px"></div>
          <button class="btn ghost wide" id="obLoc" style="margin-top:12px">${icon('map-pin', 20)} Use my location</button>
          <p class="sub" style="margin-top:16px">Now: <b>${esc(city.name)}</b></p>
          <div class="actions"><button class="btn coral big wide" data-next>Continue</button></div></div>`;
        $('#obCity', el).onsubmit = async e => {
          e.preventDefault();
          const box = $('#obRes', el); box.innerHTML = loader('Searching');
          try {
            const r = await geocode(new FormData(e.target).get('q'));
            box.innerHTML = r.map((c, i) => `<button type="button" class="chip pop" style="--i:${i}" data-c="${i}">${esc(c.name)}</button>`).join('') || '<p class="sub">No matches.</p>';
            box.onclick = async ev => { const b = ev.target.closest('[data-c]'); if (b) { await db.setSetting('city', r[+b.dataset.c]); next(); } };
          } catch { box.innerHTML = '<p class="sub">City search needs a connection.</p>'; }
        };
        $('#obLoc', el).onclick = () => navigator.geolocation?.getCurrentPosition(async p => {
          await db.setSetting('city', { name: 'My location', lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) }); next();
        }, () => {}, { timeout: 10000 });
      } else if (step === 1) {
        const n = (await db.all('items')).length;
        el.innerHTML = head('Add your first 3 pieces', 'Snap a photo. Attinera cuts it out and tags it.') + `<div class="ob-body view-in">
          <p class="h2" style="margin-top:0"><span>${Math.min(n, 3)}</span> of 3 added</p>
          <div class="addopts"><button class="btn" id="obCam">${icon('camera', 28)}<span>Take photo</span></button>
            <button class="btn" id="obGal">${icon('photo', 28)}<span>Choose from gallery</span></button></div>
          <div class="actions"><button class="btn ${n >= 3 ? 'coral' : 'ghost'} big wide" data-next>${n >= 3 ? 'Continue' : n ? 'Continue with ' + n : 'Later'}</button></div></div>`;
        $('#obCam', el).onclick = takePhoto;
        $('#obGal', el).onclick = pickGallery;
        if (n >= 3) setTimeout(next, 600);
      } else {
        el.innerHTML = head('Your closet is ready.', 'Check Today each morning for an outfit that fits the weather.') + `<div class="ob-body view-in" style="text-align:center">
          <div class="loader ob-loader" data-logo>${logoSvg('play')}</div>
          <button class="btn coral big wide" data-done>Start</button>
          ${accountsOn ? `<p class="sub" style="margin-top:24px">Want your closet on your laptop too?</p>
          <div class="actions center-row"><button class="btn ghost" data-account="signin">Sign in</button><button class="btn ghost" data-account="signup">Create account</button></div>` : ''}</div>`;
      }
      replayLogo($('.ob-loader', el));
    }
    el.onclick = e => {
      if (e.target.closest('[data-skip]')) step < 2 ? next() : finish();
      else if (e.target.closest('[data-next]')) next();
      else if (e.target.closest('[data-done]')) finish();
      else if (e.target.closest('[data-account]')) { const m = e.target.closest('[data-account]').dataset.account; finish().then(() => { location.hash = '#me/account?mode=' + m; }); }
    };
    addEventListener('attinera:added', draw);
    draw();
  });
}
