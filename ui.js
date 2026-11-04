'use strict';
/* ============================================================
   TECHNO WORKSTATION – Oberfläche
   ============================================================ */
const $ = s => document.querySelector(s);
const LSKEY = 'techno-workstation-v1';
function h(tag, a, ...kids){
  const e = document.createElement(tag);
  if(a) for(const k in a){ const v = a[k]; if(v==null || v===false) continue;
    if(k==='class') e.className = v; else if(k==='style') e.style.cssText = v;
    else if(k.startsWith('on') && typeof v==='function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v===true ? '' : v); }
  for(const c of kids.flat(9)){ if(c==null || c===false) continue; e.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return e;
}
const UI = {dev:{}, meters:{}};
let BRUSH = 'x2', CLIP = null;
const PAINT = {on:false, val:0, g:''};
window.addEventListener('pointerup', () => { PAINT.on = false; });
const FX_LIST = [['','—','Kein Effekt (Radierer)'],['x2','×2','Ratchet: Step 2× wiederholen'],['x3','×3','Ratchet 3×'],['x4','×4','Ratchet 4×'],
  ['REV','REV','Hall-Throw: Step in den Hall schicken'],['DLY','DLY','Delay-Throw: Step ins Ping-Pong-Delay'],['CRSH','CRS','Bitcrusher auf diesem Step'],
  ['LPF','LPF','Lowpass-Dip auf diesem Step'],['HPF','HPF','Highpass auf diesem Step'],['OCT','OCT','Oktave hoch (Drums: Pitch hoch)']];
const FXLAB = Object.fromEntries(FX_LIST.map(f => [f[0], f[1]]));

let saveT = null;
function save(){ clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch(e){} }, 400); }
function loadState(){ try { const s = JSON.parse(localStorage.getItem(LSKEY)); if(s && s.v===1) return deepMerge(defaultState(), s); } catch(e){} return null; }
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1600); }
const curPart = id => { const D = S.dev[id]; return D.parts[D.edit]; };
const pIdx = (id,k) => S.dev[id].page*16 + k;
const newU = () => ({cols:A(16,()=>[]), ph:-1, knobs:[]});
const logo = (name, sub) => h('div',{class:'logo'}, h('b',{},name), h('small',{},sub));
const lbl = t => h('span',{class:'lbl'},t);

/* ---------- Bedienelemente ---------- */
function knob(label, get, set, o={}){
  const min = o.min ?? 0, max = o.max ?? 1, def = o.def !== undefined ? o.def : get(), s = o.size || 28;
  const el = h('div',{class:'knob'+(o.cls?' '+o.cls:'')});
  const dial = h('div',{class:'dial', style:`--s:${s}px`}), ind = h('i'); dial.append(ind);
  const val = h('span',{class:'kval'});
  el.append(dial, h('label',{},label), val);
  el.title = label + ' — ziehen · Shift = fein · Doppelklick = Reset';
  const upd = () => { const v = get(), n = (v-min)/(max-min); ind.style.transform = `rotate(${-135+n*270}deg)`;
    val.textContent = o.fmt ? o.fmt(v) : (o.cls && o.cls.includes('bip') ? Math.round(v*100) : Math.round(n*100)); };
  let drag = false, sy = 0, sv = 0;
  dial.addEventListener('pointerdown', e => { e.preventDefault(); dial.setPointerCapture(e.pointerId); drag = true; sy = e.clientY; sv = get(); el.classList.add('active'); });
  dial.addEventListener('pointermove', e => { if(!drag) return; const sens = e.shiftKey ? 700 : 180;
    let v = clamp(sv + (sy - e.clientY)/sens*(max-min), min, max); if(o.step) v = Math.round(v/o.step)*o.step;
    if(v !== get()){ set(v); upd(); } });
  const end = () => { if(!drag) return; drag = false; el.classList.remove('active'); save(); };
  dial.addEventListener('pointerup', end); dial.addEventListener('lostpointercapture', end);
  dial.addEventListener('dblclick', () => { set(def); upd(); save(); });
  dial.addEventListener('wheel', e => { e.preventDefault(); const st = o.step || (max-min)/60; set(clamp(get() + (e.deltaY<0 ? st : -st), min, max)); upd(); save(); }, {passive:false});
  upd(); el.upd = upd; return el;
}
function fader(get, set, o={}){
  const H = o.h || 150, ch = o.mini ? 12 : 26;
  const el = h('div',{class:'fader'+(o.mini?' mini':''), style:`height:${H}px`}), cap = h('div',{class:'cap'});
  el.append(h('div',{class:'track'}), cap);
  const upd = () => { cap.style.bottom = (get()*(H-ch)) + 'px'; };
  let drag = false, sy = 0, sv = 0, sc = 1;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); drag = true; sy = e.clientY; sv = get(); sc = el.getBoundingClientRect().height/H || 1; });
  el.addEventListener('pointermove', e => { if(!drag) return; set(clamp(sv + (sy-e.clientY)/((H-ch)*sc), 0, 1)); upd(); });
  el.addEventListener('pointerup', () => { drag = false; save(); });
  el.addEventListener('dblclick', () => { if(o.def != null){ set(o.def); upd(); save(); } });
  el.addEventListener('wheel', e => { e.preventDefault(); set(clamp(get() + (e.deltaY<0 ? .02 : -.02), 0, 1)); upd(); save(); }, {passive:false});
  upd(); el.upd = upd; return el;
}
function bindToggle(el, group, get, set, after){
  el.addEventListener('pointerdown', e => { if(e.button !== 0) return; e.preventDefault();
    if(el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const v = get() ? 0 : 1; set(v); PAINT.on = true; PAINT.val = v; PAINT.g = group; after(); });
  el.addEventListener('pointerenter', () => { if(PAINT.on && PAINT.g === group){ set(PAINT.val); after(); } });
}
function dragCell(cls, {get, set, min, max, px=7, onClick, after}){
  const c = h('div',{class:cls}); let drag = false, moved = false, sy = 0, sv = 0;
  c.addEventListener('pointerdown', e => { if(e.button !== 0) return; e.preventDefault(); c.setPointerCapture(e.pointerId); drag = true; moved = false; sy = e.clientY; sv = get(); });
  c.addEventListener('pointermove', e => { if(!drag) return; const d = Math.round((sy-e.clientY)/px); if(d !== 0) moved = true;
    if(moved){ const v = clamp(sv+d, min, max); if(v !== get()){ set(v); after(); } } });
  c.addEventListener('pointerup', () => { if(drag && !moved && onClick){ onClick(); after(); } drag = false; save(); });
  c.addEventListener('wheel', e => { e.preventDefault(); set(clamp(get() + (e.deltaY<0 ? 1 : -1), min, max)); after(); save(); }, {passive:false});
  return c;
}
function sel(opts, val, on, cls){
  const s = h('select',{class:cls||''}, ...opts.map(([v,l]) => h('option',{value:v}, l)));
  s.value = String(val); s.addEventListener('change', () => { on(s.value); save(); });
  s.addEventListener('keydown', e => e.stopPropagation()); return s;
}
function togBtn(label, get, set, title, after){
  const b = h('button',{class:'tog'+(get()?' on':''), title:title||''}, label);
  b.onclick = () => { set(!get()); b.classList.toggle('on', !!get()); save(); after && after(); }; return b;
}

/* ---------- Part-Leiste (4 Parts, Kette, Länge, Seiten) ---------- */
function selectPart(id, p, play){
  const D = S.dev[id]; D.edit = p;
  if(play && !S.songMode){ D.play = p; if(E.playing && !D.chainOn && RT[id]) RT[id].queued = p; }
  UI.dev[id].render(); save();
}
function partBar(id){
  const D = S.dev[id], u = UI.dev[id];
  const btns = [0,1,2,3].map(p => h('button',{class:'pbtn', title:`Part ${p+1} — Klick: bearbeiten & (am Pattern-Ende) spielen · Shift-Klick: nur bearbeiten`, onclick:e => selectPart(id,p,!e.shiftKey)}, String(p+1)));
  const mute = h('button',{class:'pbtn pm', title:'Gerät pausieren (ab Pattern-Ende)', onclick:() => { D.play = -1; if(E.playing && RT[id]) RT[id].queued = -1; renderPB(id); save(); }}, '–');
  const chainIn = h('input',{class:'chain', type:'text', placeholder:'z.B. 3x1 3 2x1 4', title:'Part-Kette: Zahlen = Parts, "3x1" = 3× Part 1. Enter zum Übernehmen.'});
  chainIn.value = chainToText(D.chain);
  chainIn.addEventListener('change', () => { D.chain = parseChain(chainIn.value); chainIn.value = chainToText(D.chain); if(RT[id]) RT[id].ci = -1; save(); renderPB(id); });
  chainIn.addEventListener('keydown', e => { e.stopPropagation(); if(e.key==='Enter') chainIn.blur(); });
  const chainBtn = h('button',{class:'tog sm', title:'Kette abspielen statt einzelnem Part', onclick:() => { D.chainOn = !D.chainOn; if(RT[id]) RT[id].ci = -1; save(); renderPB(id); }}, 'KETTE');
  const info = h('span',{class:'cinfo'});
  const lenSel = sel([[16,'16'],[32,'32'],[48,'48'],[64,'64']], curPart(id).len, v => { curPart(id).len = +v; if(D.page*16 >= +v) D.page = 0; u.render(); }, 'lensel');
  lenSel.title = 'Steps im Part (16 = 1 Takt … 64 = 4 Takte)';
  const pages = [0,1,2,3].map(pg => h('button',{class:'pg', title:`Steps ${pg*16+1}–${pg*16+16} anzeigen`, onclick:() => { D.page = pg; u.render(); }}, String(pg+1)));
  const tool = (ic, tip, fn) => h('button',{class:'tool', title:tip, onclick:fn}, ic);
  const tools = [
    tool('⧉','Part kopieren', () => { CLIP = {id, data:JSON.stringify(curPart(id))}; toast('Part kopiert'); }),
    tool('⎘','Einfügen', () => { if(!CLIP || CLIP.id !== id){ toast('Nichts zum Einfügen'); return; } D.parts[D.edit] = JSON.parse(CLIP.data); save(); u.render(); toast('Eingefügt'); }),
    tool('✕','Part löschen', () => { const np = NEWPART[id](); if(id==='chords'){ np.prog = curPart(id).prog; np.bpc = curPart(id).bpc; } np.len = curPart(id).len; D.parts[D.edit] = np; save(); u.render(); }),
    tool('🎲','Zufalls-Pattern (in Tonart & Mood)', () => { RAND[id](curPart(id)); save(); u.render(); }),
  ];
  u.pb = {btns, mute, chainIn, chainBtn, lenSel, pages, info};
  return h('div',{class:'pbar'},
    h('div',{class:'pgrp'}, lbl('PART'), ...btns, mute),
    h('div',{class:'pgrp'}, chainBtn, chainIn, info),
    h('div',{class:'pgrp'}, lbl('STEPS'), lenSel, lbl('SEITE'), ...pages),
    h('div',{class:'pgrp tools'}, ...tools));
}
function renderPB(id){
  const u = UI.dev[id], D = S.dev[id], pb = u && u.pb; if(!pb) return;
  const pp = E.playing ? (E.cur ? E.cur.pos[id].part : RT[id] && RT[id].part) : D.play, q = E.playing && RT[id] ? RT[id].queued : null;
  pb.btns.forEach((b,p) => { b.classList.toggle('edit', p===D.edit); b.classList.toggle('playing', p===pp); b.classList.toggle('queued', q===p && p!==pp); b.classList.toggle('inchain', D.chainOn && D.chain.includes(p)); });
  pb.mute.classList.toggle('playing', pp===-1); pb.mute.classList.toggle('queued', q===-1 && pp!==-1);
  pb.chainBtn.classList.toggle('on', D.chainOn);
  const P = curPart(id); pb.lenSel.value = String(P.len);
  pb.pages.forEach((b,pg) => { b.style.display = pg*16 < P.len ? '' : 'none'; b.classList.toggle('on', pg===D.page); });
  pb.info.textContent = D.chainOn && D.chain.length ? (E.playing && RT[id] && RT[id].ci >= 0 ? `${RT[id].ci+1}/${D.chain.length}` : `${D.chain.length}×`) : '';
  if(document.activeElement !== pb.chainIn) pb.chainIn.value = chainToText(D.chain);
}
function fxLane(id){
  const u = UI.dev[id];
  const cells = A(16, k => { const c = h('div',{class:'fxc'});
    c.addEventListener('pointerdown', e => { e.preventDefault(); const P = curPart(id), i = pIdx(id,k);
      const nv = (e.altKey || P.fx[i]===BRUSH) ? '' : BRUSH; P.fx[i] = nv; PAINT.on = true; PAINT.g = 'fx'+id; PAINT.val = nv; save(); renderFx(); });
    c.addEventListener('pointerenter', () => { if(PAINT.on && PAINT.g === 'fx'+id){ curPart(id).fx[pIdx(id,k)] = PAINT.val; renderFx(); save(); } });
    u.cols[k].push(c); return c; });
  function renderFx(){ const P = curPart(id); cells.forEach((c,k) => { const v = P.fx[pIdx(id,k)] || ''; c.textContent = FXLAB[v] || ''; c.classList.toggle('on', !!v); c.dataset.fx = v; }); }
  u.renderFx = renderFx;
  return h('div',{class:'row fxrow'}, h('span',{class:'rl', title:'Step-FX: in der FX-Sektion einen Effekt wählen, hier klicken/malen. Alt-Klick löscht.'},'FX'), h('div',{class:'cells'}, ...cells));
}
function stepRow(id, label, cls, group, getArr, extra){
  const u = UI.dev[id];
  const cells = A(16, k => { const b = h('div',{class:cls+' q'+Math.floor(k/4)}, extra ? extra(k) : null);
    bindToggle(b, id+group, () => getArr()[pIdx(id,k)], v => { getArr()[pIdx(id,k)] = v; }, () => { save(); u.render(); });
    u.cols[k].push(b); return b; });
  return {el: h('div',{class:'row'}, h('span',{class:'rl'}, label), h('div',{class:'cells'}, ...cells)), cells};
}

/* ============================================================
   RC-08
   ============================================================ */
function build808(){
  const id = 'd808', D = S.dev[id], u = UI.dev[id] = newU();
  const el = h('div',{class:'device dev808'});
  el.append(h('div',{class:'dhead'}, logo('RC-08','Rhythm Composer'), h('div',{class:'hint'},'Instrument wählen ▸ Steps tippen · AC = Accent')));
  el.append(partBar(id));
  const kg = h('div',{class:'kgrid'}), selBtns = {};
  KIT808.forEach(([k,name]) => {
    const col = h('div',{class:'icol'}, h('div',{class:'iname'}, name));
    [['lvl','LEVEL'],['tune','TUNE'],['dec','DECAY'],['tone','TONE']].forEach(([pk,lab]) => col.append(knob(lab, () => D.params[k][pk], v => D.params[k][pk] = v, {size:24, def:pk==='lvl'?.8:.5})));
    const b = h('button',{class:'isel', onclick:() => { D.sel = k; u.render(); }}, h('i',{class:'led'}), k);
    selBtns[k] = b; col.append(b); kg.append(col);
  });
  const acB = h('button',{class:'isel ac', onclick:() => { D.sel = 'AC'; u.render(); }}, h('i',{class:'led'}), 'AC');
  selBtns.AC = acB; kg.append(h('div',{class:'icol acc'}, h('div',{class:'iname'},'Accent'), h('div',{class:'acspace'}), acB));
  el.append(kg);
  const arr = () => { const P = curPart(id); return D.sel==='AC' ? P.ac : P.st[D.sel]; };
  const steps = stepRow(id, 'STEP', 's808', 'st', arr, k => [h('i',{class:'led'}), h('span',{}, k+1)]);
  el.append(steps.el, fxLane(id));
  u.render = () => { const P = curPart(id), a = arr();
    steps.cells.forEach((b,k) => b.classList.toggle('on', !!a[pIdx(id,k)]));
    for(const k in selBtns){ selBtns[k].classList.toggle('on', D.sel===k); const aa = k==='AC' ? P.ac : P.st[k]; selBtns[k].classList.toggle('has', aa.slice(0,P.len).some(x => x)); }
    u.renderFx(); renderPB(id); };
  u.render(); return el;
}

/* ============================================================
   RC-07
   ============================================================ */
function build707(){
  const id = 'd707', D = S.dev[id], u = UI.dev[id] = newU();
  const el = h('div',{class:'device dev707'});
  el.append(h('div',{class:'dhead'}, logo('RC-07','Digital Rhythm Composer'), h('div',{class:'hint'},'LCD-Raster direkt bemalen · Slider = Level')));
  el.append(partBar(id));
  const arrOf = k => { const P = curPart(id); return k==='AC' ? P.ac : P.st[k]; };
  const lcd = h('div',{class:'lcd'}), lrows = {};
  [...KIT707.map(k => k[0]), 'AC'].forEach(k => {
    const cells = A(16, c => { const d = h('div',{class:'lc q'+Math.floor(c/4)});
      bindToggle(d, 'lcd'+k, () => arrOf(k)[pIdx(id,c)], v => { arrOf(k)[pIdx(id,c)] = v; }, () => { save(); u.render(); });
      u.cols[c].push(d); return d; });
    const lab = h('span',{class:'ll', onclick:() => { D.sel = k; u.render(); }}, k);
    const row = h('div',{class:'lrow'}, lab, h('div',{class:'lcells'}, ...cells)); lrows[k] = {row, cells}; lcd.append(row);
  });
  const selName = h('div',{class:'selname'});
  const kn = [['tune','TUNE'],['dec','DECAY'],['tone','TONE']].map(([pk,lab]) => knob(lab, () => D.sel==='AC' ? 0.5 : D.params[D.sel][pk], v => { if(D.sel !== 'AC') D.params[D.sel][pk] = v; }, {size:30, def:.5}));
  const grit = knob('GRIT', () => D.grit, v => { D.grit = v; applyDev(id); }, {size:30, def:.3});
  el.append(h('div',{class:'b707'}, h('div',{class:'lcdwrap'}, lcd), h('div',{class:'side707'}, selName, ...kn, h('div',{class:'sep707'}), grit)));
  const sl = h('div',{class:'sl707'});
  KIT707.forEach(([k]) => sl.append(h('div',{class:'slw'}, fader(() => D.params[k].lvl, v => D.params[k].lvl = v, {h:62, def:.75, mini:true}), h('span',{}, k))));
  el.append(sl);
  const selBtns = {}, isr = h('div',{class:'isel707'});
  [...KIT707, ['AC','Accent']].forEach(([k]) => { const b = h('button',{onclick:() => { D.sel = k; u.render(); }}, k); selBtns[k] = b; isr.append(b); });
  el.append(isr);
  const steps = stepRow(id, 'STEP', 's707', 'st', () => arrOf(D.sel), k => h('span',{}, k+1));
  el.append(steps.el, fxLane(id));
  u.render = () => {
    for(const k in lrows){ const a = arrOf(k); lrows[k].cells.forEach((c,j) => c.classList.toggle('on', !!a[pIdx(id,j)])); lrows[k].row.classList.toggle('sel', D.sel===k); }
    for(const k in selBtns) selBtns[k].classList.toggle('on', D.sel===k);
    const a = arrOf(D.sel); steps.cells.forEach((b,k) => b.classList.toggle('on', !!a[pIdx(id,k)]));
    selName.textContent = D.sel==='AC' ? 'ACCENT' : (KIT707.find(x => x[0]===D.sel) || ['',''])[1].toUpperCase();
    kn.forEach(k => k.upd()); u.renderFx(); renderPB(id); };
  u.render(); return el;
}

/* ============================================================
   Melodische Step-Zeilen (Note / Okt / Acc / Slide|Tie)
   ============================================================ */
function mkMelRows(id, tk, tlab, octFn){
  const u = UI.dev[id], st = k => curPart(id).n[pIdx(id,k)], after = () => UI.dev[id].render();
  const notes = [], octs = [];
  const nrow = h('div',{class:'cells'}), orow = h('div',{class:'cells'});
  for(let k=0;k<16;k++){
    const nc = dragCell('nc q'+Math.floor(k/4), {get:() => st(k).d, set:v => { const s = st(k); s.d = v; s.g = 1; }, min:-7, max:14,
      onClick:() => { const s = st(k); s.g = s.g ? 0 : 1; }, after});
    nc.append(h('b'), h('small')); notes.push(nc); nrow.append(nc); u.cols[k].push(nc);
    const oc = h('div',{class:'oc q'+Math.floor(k/4), title:'Oktave: · / ▲ / ▼', onclick:() => { const s = st(k); s.o = s.o===0 ? 1 : s.o===1 ? -1 : 0; save(); after(); }});
    octs.push(oc); orow.append(oc); u.cols[k].push(oc);
  }
  const acc = stepRow(id, 'ACC', 'tg acc', 'acc', () => curPart(id).n.map(n => n.a), null);
  const tie = stepRow(id, tlab, 'tg tie', tk, () => curPart(id).n.map(n => n[tk]), null);
  // stepRow arbeitet auf Arrays – hier auf Objekte umbiegen
  [[acc,'a'],[tie,tk]].forEach(([row,key]) => row.cells.forEach((c,k) => {
    const nc = c.cloneNode(true); c.replaceWith(nc); row.cells[k] = nc;
    u.cols[k] = u.cols[k].filter(x => x !== c); u.cols[k].push(nc);
    bindToggle(nc, id+key, () => st(k)[key], v => { st(k)[key] = v; }, () => { save(); after(); });
  }));
  const el = h('div',{class:'mgrid'},
    h('div',{class:'row'}, h('span',{class:'rl', title:'Klick: Note an/aus · Ziehen/Scrollen: Tonhöhe (in Tonart)'},'NOTE'), nrow),
    h('div',{class:'row'}, h('span',{class:'rl'},'OKT'), orow), acc.el, tie.el);
  const render = () => {
    for(let k=0;k<16;k++){ const s = st(k), m = degToMidi(s.d, octFn() + s.o);
      notes[k].classList.toggle('on', !!s.g); notes[k].firstChild.textContent = NOTE_NAMES[m%12]; notes[k].lastChild.textContent = Math.floor(m/12)-1;
      notes[k].style.setProperty('--d', ((s.d+7)/21).toFixed(3));
      octs[k].textContent = s.o > 0 ? '▲' : s.o < 0 ? '▼' : '·'; octs[k].classList.toggle('on', s.o !== 0);
      acc.cells[k].classList.toggle('on', !!s.a); tie.cells[k].classList.toggle('on', !!s[tk]); }
  };
  return {el, render};
}

/* ============================================================
   AB-03 Acid
   ============================================================ */
function buildAcid(){
  const id = 'acid', D = S.dev[id], P = D.params, u = UI.dev[id] = newU();
  const el = h('div',{class:'device acid'});
  const wave = h('button',{class:'tog wave', onclick:() => { P.wave = P.wave ? 0 : 1; applyDev(id); wave.textContent = P.wave ? '⊓ SQR' : '⩘ SAW'; save(); }}, P.wave ? '⊓ SQR' : '⩘ SAW');
  const fol = togBtn('HARMONIE', () => P.follow, v => P.follow = v, 'Transponiert mit den Akkorden des CH-5');
  el.append(h('div',{class:'dhead'}, logo('AB-03','Acid Bassline'), h('div',{class:'hint'},'NOTE: Klick = an/aus · Ziehen = Tonhöhe · SLIDE gleitet zur nächsten Note')));
  el.append(partBar(id));
  const K = (lab,key,o={}) => knob(lab, () => P[key], v => { P[key] = v; if(o.apply) applyDev(id); }, Object.assign({size:36}, o));
  el.append(h('div',{class:'krow'}, h('div',{class:'kcol'}, wave, fol),
    K('TUNE','tune',{min:-12,max:12,step:1,def:0,fmt:v => (v>0?'+':'')+v}), K('CUTOFF','cut',{def:.28}), K('RESO','res',{apply:1,def:.72}),
    K('ENV MOD','env',{def:.55}), K('DECAY','dec',{def:.35}), K('ACCENT','acc',{def:.6}), K('DRIVE','drv',{apply:1,def:.35})));
  const rows = mkMelRows(id, 's', 'SLIDE', () => 2);
  el.append(rows.el, fxLane(id));
  u.render = () => { rows.render(); u.renderFx(); renderPB(id); };
  u.render(); return el;
}

/* ============================================================
   SK-01 Kick / Sub / Rumble
   ============================================================ */
function buildKS(){
  const id = 'ks', D = S.dev[id], P = D.params, u = UI.dev[id] = newU();
  const el = h('div',{class:'device ks'});
  el.append(h('div',{class:'dhead'}, logo('SK-01','Kick · Rumble · Sub'), h('div',{class:'hint'},'Kick mit Rumble-Hall + Sub, Sidechain eingebaut')));
  el.append(partBar(id));
  const K = (lab,key,o={}) => knob(lab, () => P[key], v => { P[key] = v; if(o.apply) applyDev(id); }, Object.assign({size:32}, o));
  const fol = togBtn('HARMONIE', () => P.follow, v => P.follow = v, 'Sub folgt den Akkord-Grundtönen des CH-5');
  el.append(h('div',{class:'krow ksk'},
    h('div',{class:'kgrp'}, h('div',{class:'kt'},'KICK'), K('TUNE','ktune',{def:.45}), K('PUNCH','punch',{def:.5}), K('DECAY','kdec',{def:.45}), K('CLICK','click',{def:.35}), K('DRIVE','kdrv',{apply:1,def:.35}), K('LEVEL','klvl',{apply:1,def:.85})),
    h('div',{class:'kgrp'}, h('div',{class:'kt'},'RUMBLE'), K('AMOUNT','rumble',{apply:1,def:.4}), K('TONE','rtone',{apply:1,def:.35})),
    h('div',{class:'kgrp'}, h('div',{class:'kt'},'SUB'), K('OKT','soct',{min:0,max:2,step:1,def:1,fmt:v => v}), K('DECAY','sdec',{def:.3}), K('GLIDE','glide',{def:.15}), K('HARM','sharm',{apply:1,def:.3}), K('LEVEL','slvl',{apply:1,def:.75}), fol)));
  const kick = stepRow(id, 'KICK', 'tg kick', 'k', () => curPart(id).k, null);
  const st = k => curPart(id).s[pIdx(id,k)], subs = [], srow = h('div',{class:'cells'});
  for(let k=0;k<16;k++){
    const nc = dragCell('nc sub q'+Math.floor(k/4), {get:() => st(k).d, set:v => { const s = st(k); s.d = v; s.g = 1; }, min:-7, max:14,
      onClick:() => { const s = st(k); s.g = s.g ? 0 : 1; }, after:() => u.render()});
    nc.append(h('b'), h('small')); subs.push(nc); srow.append(nc); u.cols[k].push(nc);
  }
  el.append(kick.el, h('div',{class:'row'}, h('span',{class:'rl', title:'Klick: Sub an/aus · Ziehen: Tonhöhe'},'SUB'), srow), fxLane(id));
  u.render = () => { const Pt = curPart(id);
    kick.cells.forEach((c,k) => c.classList.toggle('on', !!Pt.k[pIdx(id,k)]));
    subs.forEach((c,k) => { const s = st(k), m = degToMidi(s.d, P.soct); c.classList.toggle('on', !!s.g); c.firstChild.textContent = NOTE_NAMES[m%12]; c.lastChild.textContent = Math.floor(m/12)-1; c.style.setProperty('--d', ((s.d+7)/21).toFixed(3)); });
    u.renderFx(); renderPB(id); };
  u.render(); return el;
}

/* ============================================================
   LX-1 Lead
   ============================================================ */
function buildLead(){
  const id = 'lead', D = S.dev[id], P = D.params, u = UI.dev[id] = newU();
  const el = h('div',{class:'device lead'});
  el.append(h('div',{class:'dhead'}, logo('LX-1','Lead Synthesizer'), h('div',{class:'hint'},'TIE bindet Noten zusammen (Legato-Glide)')));
  el.append(partBar(id));
  const K = (lab,key,o={}) => { const k = knob(lab, () => P[key], v => { P[key] = v; if(key!=='oct') { P.preset = 'Custom'; presetSel.value = 'Custom'; } }, Object.assign({size:32}, o)); u.knobs.push(k); return k; };
  const presetSel = sel([...Object.keys(LEAD_PRESETS).map(k => [k,k]), ['Custom','Custom']], P.preset, v => { if(LEAD_PRESETS[v]) Object.assign(P, LEAD_PRESETS[v]); P.preset = v; u.knobs.forEach(k => k.upd()); waveB.textContent = WNAME[P.wave]; });
  const WNAME = ['⩘ SAW','⊓ SQR','△ TRI'];
  const waveB = h('button',{class:'tog wave', onclick:() => { P.wave = (P.wave+1)%3; waveB.textContent = WNAME[P.wave]; save(); }}, WNAME[P.wave]);
  const fol = togBtn('HARMONIE', () => P.follow, v => P.follow = v, 'Transponiert mit den Akkorden des CH-5');
  el.append(h('div',{class:'krow'}, h('div',{class:'kcol'}, presetSel, waveB, fol),
    K('DETUNE','det'), K('CUTOFF','cut'), K('RESO','res'), K('ENV','env'), K('ATTACK','att'), K('DECAY','dec'), K('SUSTAIN','sus'), K('RELEASE','rel'),
    K('OKT','oct',{min:2,max:5,step:1,def:3,fmt:v => v})));
  const rows = mkMelRows(id, 't', 'TIE', () => P.oct);
  el.append(rows.el, fxLane(id));
  u.render = () => { rows.render(); u.renderFx(); renderPB(id); };
  u.render(); return el;
}

/* ============================================================
   CH-5 Chord Machine
   ============================================================ */
function buildChords(){
  const id = 'chords', D = S.dev[id], P = D.params, G = D.gen, u = UI.dev[id] = newU();
  const el = h('div',{class:'device chords'});
  el.append(h('div',{class:'dhead'}, logo('CH-5','Chord Machine'), h('div',{class:'hint'},'Würfeln ▸ Progression wählen · Klick auf Akkord = Stufe ±, Rechtsklick = Typ')));
  el.append(partBar(id));
  const progEl = h('div',{class:'prog'}), candEl = h('div',{class:'cands'});
  let slots = [];
  const renderProg = () => { const Pt = curPart(id); progEl.innerHTML = ''; slots = Pt.prog.map((c,j) => {
      const ci = chordInfo(c);
      const s = h('div',{class:'slot', title:'Klick: Stufe +1 · Shift-Klick: Stufe −1 · Rechtsklick: Akkordtyp wechseln'}, h('b',{}, ci.name), h('small',{}, ci.roman));
      s.onclick = e => { c.d = (c.d + (e.shiftKey ? 6 : 1)) % 7; save(); renderProg(); };
      s.oncontextmenu = e => { e.preventDefault(); const ix = CHORD_CYCLE.indexOf(c.t); c.t = CHORD_CYCLE[(ix+1) % CHORD_CYCLE.length]; save(); renderProg(); };
      progEl.append(s); return s; });
    progEl.append(h('div',{class:'slot add', title:'Akkord anhängen', onclick:() => { if(Pt.prog.length < 8){ Pt.prog.push({d:0, t:Pt.prog.length ? Pt.prog[Pt.prog.length-1].t : '7'}); save(); renderProg(); } }}, '+'),
                  h('div',{class:'slot add', title:'Letzten Akkord entfernen', onclick:() => { if(Pt.prog.length > 1){ Pt.prog.pop(); save(); renderProg(); } }}, '−'));
    bpcSel.value = String(Pt.bpc || 1); };
  const renderCands = () => { candEl.innerHTML = '';
    if(!D.cands.length){ candEl.append(h('div',{class:'cempty'},'🎲 drücken, um Progressionen in ' + NOTE_NAMES[S.key] + ' · ' + MOODS[S.mood].name + ' zu erzeugen')); return; }
    D.cands.forEach(pr => candEl.append(h('button',{class:'cand', onclick:() => { const Pt = curPart(id); Pt.prog = JSON.parse(JSON.stringify(pr)); Pt.bpc = G.bpc; save(); renderProg(); }},
      pr.map(c => { const ci = chordInfo(c); return h('span',{}, h('b',{}, ci.name), h('small',{}, ci.roman)); })))); };
  const typeSel = sel(CHORD_TYPES, G.type, v => G.type = v);
  const lenSel = sel([[2,'2'],[3,'3'],[4,'4'],[6,'6'],[8,'8']], G.len, v => G.len = +v);
  const bpcSel = sel([[0.5,'½ Takt'],[1,'1 Takt'],[2,'2 Takte'],[4,'4 Takte']], curPart(id).bpc || 1, v => { G.bpc = +v; curPart(id).bpc = +v; });
  const roll = h('button',{class:'roll', onclick:() => { D.cands = A(6, () => genProg(G.len, G.type, S.mood)); save(); renderCands(); }}, '🎲 WÜRFELN');
  el.append(h('div',{class:'genrow'}, lbl('TYP'), typeSel, lbl('AKKORDE'), lenSel, lbl('DAUER/AKKORD'), bpcSel, roll));
  el.append(h('div',{class:'progwrap'}, h('div',{class:'ttl'},'PROGRESSION (aktiver Part)'), progEl), candEl);
  const K = (lab,key,o={}) => { const k = knob(lab, () => P[key], v => { P[key] = v; if(!o.keep){ P.preset = 'Custom'; presetSel.value = 'Custom'; } }, Object.assign({size:30}, o)); u.knobs.push(k); return k; };
  const WNAME = ['⩘ SAW','⊓ SQR','△ TRI'];
  const waveB = h('button',{class:'tog wave', onclick:() => { P.wave = (P.wave+1)%3; waveB.textContent = WNAME[P.wave]; save(); }}, WNAME[P.wave]);
  const presetSel = sel([...Object.keys(CH_PRESETS).map(k => [k,k]), ['Custom','Custom']], P.preset, v => { if(CH_PRESETS[v]) Object.assign(P, CH_PRESETS[v]); P.preset = v; u.knobs.forEach(k => k.upd()); waveB.textContent = WNAME[P.wave]; });
  const bass = togBtn('+BASS', () => P.bass, v => P.bass = v, 'Grundton eine Oktave tiefer dazu');
  el.append(h('div',{class:'krow'}, h('div',{class:'kcol'}, presetSel, waveB, bass),
    K('DETUNE','det'), K('CUTOFF','cut'), K('RESO','res'), K('ENV','env'), K('ATTACK','att'), K('DECAY','dec'), K('SUSTAIN','sus'), K('RELEASE','rel'),
    K('SPREAD','spread',{keep:1}), K('OKT','oct',{min:-1,max:1,step:1,def:0,keep:1,fmt:v => (v>0?'+':'')+v})));
  const sst = k => curPart(id).st[pIdx(id,k)];
  const mkRow = (label, key) => { const cells = A(16, k => { const c = h('div',{class:'tg '+key+' q'+Math.floor(k/4)});
      bindToggle(c, id+key, () => sst(k)[key], v => { sst(k)[key] = v; }, () => { save(); u.render(); }); u.cols[k].push(c); return c; });
    return {el: h('div',{class:'row'}, h('span',{class:'rl'}, label), h('div',{class:'cells'}, ...cells)), cells}; };
  const gate = mkRow('GATE','g'), acc = mkRow('ACC','a');
  const lens = [], lrow = h('div',{class:'cells'});
  for(let k=0;k<16;k++){ const c = dragCell('lenc q'+Math.floor(k/4), {get:() => sst(k).l || 1, set:v => { sst(k).l = v; }, min:1, max:16, px:6, after:() => u.render()});
    c.title = 'Notenlänge in Steps (ziehen/scrollen)'; lens.push(c); lrow.append(c); u.cols[k].push(c); }
  el.append(gate.el, acc.el, h('div',{class:'row'}, h('span',{class:'rl'},'LÄNGE'), lrow), fxLane(id));
  u.render = () => { gate.cells.forEach((c,k) => c.classList.toggle('on', !!sst(k).g)); acc.cells.forEach((c,k) => c.classList.toggle('on', !!sst(k).a));
    lens.forEach((c,k) => { const s = sst(k); c.textContent = s.g ? (s.l||1) : ''; c.classList.toggle('on', !!s.g); c.style.setProperty('--l', ((s.l||1)/16).toFixed(3)); });
    renderProg(); u.renderFx(); renderPB(id); };
  u.renderCands = renderCands;
  u.curChord = (ci, cpi) => slots.forEach((s,j) => s.classList.toggle('cur', cpi===D.edit && j===ci));
  renderCands(); u.render(); return el;
}

/* ============================================================
   MX-24 Mixer
   ============================================================ */
function meterEl(key){ const m = h('div',{class:'meter'}, h('i')); UI.meters[key] = {el:m.firstChild, v:0}; return m; }
function chStrip(id){
  const m = S.mix.ch[id], info = DEV_INFO[id];
  const K = (lab,key,o={}) => knob(lab, () => m[key], v => { m[key] = v; applyCh(id); }, Object.assign({size:22, def:0}, o));
  const B = {min:-1, max:1, def:0, cls:'bip'};
  const mute = h('button',{class:'ms mb'+(m.mute?' on':''), title:'Mute'}, 'M'); mute.onclick = () => { m.mute = !m.mute; mute.classList.toggle('on', m.mute); applySolo(); save(); };
  const solo = h('button',{class:'ms sb'+(m.solo?' on':''), title:'Solo'}, 'S'); solo.onclick = () => { m.solo = !m.solo; solo.classList.toggle('on', m.solo); applySolo(); save(); };
  return h('div',{class:'strip', style:`--cc:${info.color}`},
    h('div',{class:'cname'}, info.short),
    h('div',{class:'k2'}, K('DRIVE','drv'), K('COMP','comp',{def:.25})),
    h('div',{class:'k2'}, K('LOW','lo',B), K('HIGH','hi',B)),
    h('div',{class:'k2'}, K('CRUSH','crush'), K('PAN','pan',B)),
    h('div',{class:'k1'}, K('FILTER','flt',Object.assign({}, B, {size:38, cls:'bip fltk'}))),
    h('div',{class:'k2'}, K('ROOM','rm'), K('HALL','hall')),
    h('div',{class:'k2'}, K('DELAY','dly'), h('div',{class:'knob ph0'})),
    h('div',{class:'fz'}, fader(() => m.vol, v => { m.vol = v; applyCh(id); }, {h:150, def:.75}), meterEl(id)),
    h('div',{class:'msr'}, mute, solo));
}
function retStrip(k, name){
  return h('div',{class:'strip ret'}, h('div',{class:'cname'}, name), h('div',{class:'retsp'}),
    h('div',{class:'fz'}, fader(() => S.mix.ret[k], v => { S.mix.ret[k] = v; applyBus(); }, {h:150, def:.6})), h('div',{class:'rlab'},'RETURN'));
}
function masterStrip(){
  const m = S.mix.master;
  const K = (lab,key,o={}) => knob(lab, () => m[key], v => { m[key] = v; applyMaster(); }, Object.assign({size:24}, o));
  const gr = h('div',{class:'gr'}, h('i')); UI.gr = gr.firstChild;
  return h('div',{class:'strip master'}, h('div',{class:'cname'}, 'MASTER'),
    h('div',{class:'k2'}, K('PUNCH','punch',{def:.5}), K('AIR','air',{def:.4})),
    h('div',{class:'k2'}, K('GLUE','glue',{def:.45}), K('TAPE','tape',{def:.3})),
    h('div',{class:'k2'}, K('LOUD','loud',{def:.4}), K('PUMP','pump',{def:.45})),
    h('div',{class:'k1'}, K('DJ FILTER','flt',{min:-1,max:1,def:0,size:44,cls:'bip fltk'})),
    h('div',{class:'grw'}, h('span',{},'LIMIT'), gr),
    h('div',{class:'fz'}, fader(() => m.vol, v => { m.vol = v; applyMaster(); }, {h:150, def:.8}), meterEl('master')),
    h('div',{class:'rlab'},'MASTER OUT'));
}
function buildMixer(){
  const el = h('div',{class:'device mixer'});
  el.append(h('div',{class:'dhead'}, logo('MX-24','Live Performance Mixer'), h('div',{class:'hint'},'FILTER: links Lowpass · rechts Highpass · PUMP = Sidechain zur Kick')));
  el.append(h('div',{class:'strips'}, ...DEV_IDS.map(chStrip), h('div',{class:'sep'}), retStrip('rm','ROOM'), retStrip('hall','HALL'), retStrip('dly','DELAY'), masterStrip()));
  return el;
}

/* ============================================================
   FX-9 Effekte / Busse / Live-Pads
   ============================================================ */
const PADS = [];
function buildFX(){
  const el = h('div',{class:'device fxdev'});
  el.append(h('div',{class:'dhead'}, logo('FX-9','Effekte · Busse · Performance')));
  const brushBtns = FX_LIST.map(([k,lab,desc]) => { const b = h('button',{class:'brush'+(BRUSH===k?' on':''), title:desc}, lab); b.dataset.fx = k;
    b.onclick = () => { BRUSH = k; brushBtns.forEach(x => x.classList.toggle('on', x===b)); }; return b; });
  el.append(h('div',{class:'fxsec'}, h('div',{class:'ttl'},'STEP-FX PINSEL'), h('div',{class:'brushes'}, ...brushBtns),
    h('div',{class:'hint'},'Effekt wählen, dann in die FX-Zeile eines Sequenzers klicken oder malen. Gleicher Effekt nochmal = löschen. Effekte aufs ganze Instrument: am Mixer (Drive, Comp, EQ, Crush, Filter, Sends).')));
  const B = S.bus;
  const K = (lab,key,o={}) => knob(lab, () => B[key], v => { B[key] = v; if(o.ir) regenIR(o.ir); else applyBus(); }, Object.assign({size:32}, o));
  const dsel = sel(['1/16','1/8','3/16','1/4','3/8'].map(x => [x,x]), B.dlyTime, v => { B.dlyTime = v; applyBus(); });
  const box = (name, ...k) => h('div',{class:'bus'}, h('div',{class:'ttl'}, name), h('div',{class:'bk'}, ...k));
  el.append(h('div',{class:'fxsec buses'},
    box('ROOM', K('GRÖSSE','rmSize',{ir:'rm'}), K('TON','rmTone')),
    box('HALL', K('LÄNGE','hallSize',{ir:'hall'}), K('PRE-DLY','hallPre'), K('TON','hallTone')),
    box('PING-PONG DELAY', h('div',{class:'dsel'}, h('label',{},'ZEIT'), dsel), K('FEEDBACK','dlyFb'), K('TON','dlyTone'))));
  const pad = (lab, sub, key, on, off, cls) => { const b = h('button',{class:'pad '+(cls||''), title:'Halten · Taste '+key}, h('b',{}, lab), h('small',{}, sub), h('kbd',{}, key));
    const down = e => { if(e) e.preventDefault(); if(!ctx || b.classList.contains('on')) return; b.classList.add('on'); on(); };
    const up = () => { if(!b.classList.contains('on')) return; b.classList.remove('on'); off(); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
    PADS.push({key, down, up}); return b; };
  el.append(h('div',{class:'fxsec'}, h('div',{class:'ttl'},'LIVE-PADS (halten)'), h('div',{class:'pads'},
    pad('WASH','Hall + HP-Sweep','1', () => liveWash(true), () => liveWash(false), 'p1'),
    pad('ECHO','Delay-Throw alle','2', () => liveEcho(true), () => liveEcho(false), 'p2'),
    pad('ROLL ¼','Beat-Repeat','3', () => liveRoll(4,true), () => liveRoll(4,false), 'p3'),
    pad('ROLL ⅛','Beat-Repeat','4', () => liveRoll(2,true), () => liveRoll(2,false), 'p3'),
    pad('ROLL 1/16','Beat-Repeat','5', () => liveRoll(1,true), () => liveRoll(1,false), 'p3'),
    pad('ROLL 1/32','Stotter','6', () => liveRoll(1,true,true), () => liveRoll(1,false), 'p3'),
    pad('RISER','Noise-Sweep','7', () => liveRiser(true), () => liveRiser(false), 'p4'),
    pad('KILL LOW','Bass weg','8', () => liveKill(true), () => liveKill(false), 'p5'))));
  return el;
}

/* ============================================================
   SQ-16 Song-Arranger
   ============================================================ */
function launchScene(j){
  const sec = S.arr.sec[j]; if(!sec) return;
  if(S.songMode){ const k = S.arr.song.indexOf(j); if(k < 0){ toast('Sektion ist nicht in der Song-Kette'); return; } S.songStart = k; renderArr(); if(E.playing){ stopPlay(); startPlay(); } save(); return; }
  DEV_IDS.forEach(id => { const D = S.dev[id], p = sec.p[id] ?? -1; D.chainOn = false; D.play = p; if(p >= 0) D.edit = p;
    if(E.playing && RT[id]) RT[id].queued = p; UI.dev[id].render(); });
  toast(`Szene „${sec.name}“ ${E.playing ? 'startet am Pattern-Ende' : 'geladen'}`); save();
}
function buildArranger(){
  const el = h('div',{class:'device arranger'});
  UI.arr = {tbl:h('div',{class:'sectbl'}), lane:h('div',{class:'songlane'}), pal:h('div',{class:'addpal'}), info:h('div',{class:'songinfo'}), rows:[], chips:[]};
  el.append(h('div',{class:'dhead'}, logo('SQ-16','Song Arranger · Szenen'),
    h('div',{class:'hint'},'Sektionen = Szenen. Im PATTERN-Modus startet ▶ die Szene live (am Pattern-Ende). Im SONG-Modus spielt die Song-Kette; Klick auf einen Baustein = Startpunkt.')));
  el.append(h('div',{class:'arrbody'}, h('div',{class:'arrleft'}, UI.arr.tbl),
    h('div',{class:'arrright'}, h('div',{class:'ttl'},'SONG-KETTE'), UI.arr.lane, h('div',{class:'ttl'},'SEKTION ANHÄNGEN'), UI.arr.pal, UI.arr.info)));
  renderArr(); return el;
}
function renderArr(){
  const A_ = UI.arr; if(!A_) return; const {tbl, lane, pal, info} = A_;
  tbl.innerHTML = ''; A_.rows = [];
  tbl.append(h('div',{class:'srow head'}, h('span'), h('span',{},'SEKTION'), h('span',{},'TAKTE'), ...DEV_IDS.map(id => h('span',{style:`color:${DEV_INFO[id].color}`}, DEV_INFO[id].short)), h('span')));
  S.arr.sec.forEach((sec,j) => {
    const name = h('input',{class:'sname', value:sec.name}); name.value = sec.name;
    name.onchange = () => { sec.name = name.value || 'Sektion'; save(); renderArr(); }; name.onkeydown = e => e.stopPropagation();
    const bars = sel([1,2,4,8,12,16,24,32].map(b => [b,b]), sec.bars, v => { sec.bars = +v; renderArr(); }, 'sbars');
    const segs = DEV_IDS.map(id => h('div',{class:'seg'}, ...[0,1,2,3,-1].map(p => h('button',{class:((sec.p[id] ?? -1)===p ? 'on' : '') + (p<0 ? ' off' : ''), title:p<0 ? 'stumm' : 'Part '+(p+1),
      onclick:() => { sec.p[id] = p; save(); renderArr(); }}, p<0 ? '–' : String(p+1)))));
    const row = h('div',{class:'srow'}, h('button',{class:'launch', title:'Szene starten', onclick:() => launchScene(j)}, '▶'), name, bars, ...segs,
      h('button',{class:'del', title:'Sektion löschen', onclick:() => { if(!confirm(`Sektion „${sec.name}“ löschen?`)) return;
        S.arr.sec.splice(j,1); S.arr.song = S.arr.song.filter(x => x !== j).map(x => x > j ? x-1 : x); S.songStart = 0; save(); renderArr(); }}, '🗑'));
    A_.rows.push(row); tbl.append(row);
  });
  tbl.append(h('div',{class:'srow addrow'}, h('button',{class:'addsec', onclick:() => {
    const cur = {}; DEV_IDS.forEach(id => cur[id] = S.dev[id].play); S.arr.sec.push({name:'Neu '+(S.arr.sec.length+1), bars:8, p:cur}); save(); renderArr(); }}, '+ Neue Sektion (aus aktuellen Parts)')));
  lane.innerHTML = ''; A_.chips = [];
  if(!S.arr.song.length) lane.append(h('div',{class:'cempty'},'Leer – unten Sektionen anhängen'));
  S.arr.song.forEach((si,k) => { const sec = S.arr.sec[si]; if(!sec) return;
    const chip = h('div',{class:'chip'+(k===S.songStart?' start':''), title:'Klick: Song startet hier'},
      h('b',{}, sec.name), h('small',{}, sec.bars+' T'),
      h('button',{class:'x', title:'Entfernen', onclick:e => { e.stopPropagation(); S.arr.song.splice(k,1); if(S.songStart >= S.arr.song.length) S.songStart = 0; save(); renderArr(); }}, '×'),
      h('i',{class:'prog'}));
    chip.onclick = () => { S.songStart = k; save(); renderArr(); };
    A_.chips.push(chip); lane.append(chip); });
  pal.innerHTML = '';
  S.arr.sec.forEach((sec,j) => pal.append(h('button',{onclick:() => { S.arr.song.push(j); save(); renderArr(); }}, '+ '+sec.name)));
  pal.append(h('button',{class:'clr', onclick:() => { if(confirm('Song-Kette leeren?')){ S.arr.song = []; S.songStart = 0; save(); renderArr(); } }}, 'Leeren'));
  const bars = songBarsBefore(S.arr.song.length), sec = bars*4*60/S.bpm;
  info.textContent = `${S.arr.song.length} Bausteine · ${bars} Takte · ${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')} min bei ${S.bpm} BPM`;
}

/* ============================================================
   Kopfzeile
   ============================================================ */
function togglePlay(){
  if(!ctx) return;
  if(ctx.state !== 'running') ctx.resume();
  if(E.playing){ stopPlay(); clearPH(); } else startPlay();
  UI.playBtn.classList.toggle('on', E.playing); UI.playBtn.textContent = E.playing ? '■' : '▶';
  DEV_IDS.forEach(renderPB);
}
function clearPH(){ DEV_IDS.forEach(id => { const u = UI.dev[id]; if(u && u.ph >= 0){ u.cols[u.ph].forEach(e => e.classList.remove('ph')); u.ph = -1; } });
  if(UI.arr) { UI.arr.rows.forEach(r => r.classList.remove('cur')); UI.arr.chips.forEach(c => c.classList.remove('cur')); }
  if(UI.dev.chords && UI.dev.chords.curChord) UI.dev.chords.curChord(-1,-1); }
function rerenderMusic(){ ['acid','lead','ks','chords'].forEach(id => UI.dev[id].render()); UI.dev.chords.renderCands(); }
function setKey(k){ S.key = k; UI.piano.querySelectorAll('.pk').forEach(e => e.classList.toggle('on', +e.dataset.k === k)); UI.keyName.textContent = NOTE_NAMES[k]; rerenderMusic(); save(); }
function setMood(i){ S.mood = i; UI.moods.forEach((b,j) => b.classList.toggle('on', j===i)); applyMaster(); applyMoodLook(); rerenderMusic(); save(); }
function applyMoodLook(){ document.documentElement.style.setProperty('--mood', MOODS[S.mood].color); document.body.dataset.mood = MOODS[S.mood].id;
  if(UI.moodInfo) UI.moodInfo.textContent = `${NOTE_NAMES[S.key]} ${MOODS[S.mood].mode}`; }
function setMode(song){ S.songMode = song; UI.modeBtns.forEach((b,j) => b.classList.toggle('on', (j===1)===song)); if(E.playing){ stopPlay(); clearPH(); startPlay(); } UI.posSec.textContent = song ? 'SONG' : 'PATTERN'; save(); }
let taps = [];
function buildHeader(){
  const top = $('#top'); top.innerHTML = '';
  UI.playBtn = h('button',{class:'play', title:'Play / Stop (Leertaste)', onclick:togglePlay}, '▶');
  UI.posBar = h('div',{class:'pbn'}, '001.1.1'); UI.posSec = h('div',{class:'psn'}, S.songMode ? 'SONG' : 'PATTERN'); UI.beat = h('i',{class:'beat'});
  const bpmIn = h('input',{type:'number', min:60, max:200, step:1, class:'bpmin'}); bpmIn.value = S.bpm;
  const setBpm = v => { S.bpm = clamp(Math.round(v*10)/10, 60, 200); bpmIn.value = S.bpm; applyBus(); renderArr(); save(); };
  bpmIn.onchange = () => setBpm(+bpmIn.value || 128); bpmIn.onkeydown = e => e.stopPropagation();
  bpmIn.addEventListener('wheel', e => { e.preventDefault(); setBpm(S.bpm + (e.deltaY<0 ? 1 : -1)); }, {passive:false});
  const tap = h('button',{class:'tap', title:'Tap Tempo', onclick:() => { const n = performance.now(); taps = taps.filter(x => n-x < 2500); taps.push(n);
    if(taps.length >= 3){ const d = (taps[taps.length-1]-taps[0])/(taps.length-1); setBpm(60000/d); } }}, 'TAP');
  const piano = UI.piano = h('div',{class:'piano'});
  [0,2,4,5,7,9,11].forEach((k,j) => piano.append(h('div',{class:'pk w'+(k===S.key?' on':''), 'data-k':k, style:`left:${j*20}px`, onclick:() => setKey(k), title:NOTE_NAMES[k]}, h('span',{}, NOTE_NAMES[k]))));
  [[1,0],[3,1],[6,3],[8,4],[10,5]].forEach(([k,j]) => piano.append(h('div',{class:'pk b'+(k===S.key?' on':''), 'data-k':k, style:`left:${j*20+13}px`, onclick:() => setKey(k), title:NOTE_NAMES[k]})));
  UI.keyName = h('div',{class:'keyname'}, NOTE_NAMES[S.key]);
  UI.moods = MOODS.map((m,i) => h('button',{class:'mood'+(i===S.mood?' on':''), style:`--mc:${m.color}`, title:m.mode, onclick:() => setMood(i)}, h('span',{class:'mi'}, m.icon), h('b',{}, m.name), h('small',{}, m.mode)));
  UI.moodInfo = h('div',{class:'moodinfo'});
  const swing = knob('SWING', () => S.swing, v => S.swing = v, {size:30, def:.1});
  UI.modeBtns = [h('button',{onclick:() => setMode(false)}, 'PATTERN'), h('button',{onclick:() => setMode(true)}, 'SONG')];
  UI.modeBtns.forEach((b,j) => b.classList.toggle('on', (j===1)===S.songMode));
  const fileIn = h('input',{type:'file', accept:'.json,application/json', style:'display:none'});
  fileIn.onchange = async () => { const f = fileIn.files[0]; if(!f) return; try { const o = JSON.parse(await f.text()); if(E.playing) togglePlay(); S = deepMerge(defaultState(), o); applyAll(); regenIR('rm',true); regenIR('hall',true); buildAll(); save(); toast('Session geladen'); } catch(e){ toast('Datei ungültig'); } fileIn.value = ''; };
  const zoomSel = sel([['auto','Auto'],['0.5','50%'],['0.6','60%'],['0.7','70%'],['0.8','80%'],['0.9','90%'],['1','100%']], S.zoom, v => { S.zoom = v; fitZoom(); }, 'zoomsel');
  top.append(
    h('div',{class:'brand'}, 'TECHNO', h('span',{}, '//'), 'WORKSTATION'),
    h('div',{class:'grp transport'}, UI.playBtn, h('div',{class:'poslcd'}, UI.posBar, UI.posSec, UI.beat)),
    h('div',{class:'grp'}, h('label',{}, 'BPM'), h('button',{class:'nud', onclick:() => setBpm(S.bpm-1)}, '−'), bpmIn, h('button',{class:'nud', onclick:() => setBpm(S.bpm+1)}, '+'), tap),
    h('div',{class:'grp'}, h('label',{}, 'KEY'), piano, UI.keyName),
    h('div',{class:'grp moodgrp'}, h('label',{}, 'MOOD'), h('div',{class:'moods'}, ...UI.moods)),
    h('div',{class:'grp'}, swing),
    h('div',{class:'grp'}, h('label',{}, 'MODUS'), h('div',{class:'modesw'}, ...UI.modeBtns)),
    h('div',{class:'grp files'},
      h('button',{title:'Session als Datei sichern', onclick:() => { const a = h('a',{href:URL.createObjectURL(new Blob([JSON.stringify(S)],{type:'application/json'})), download:'techno-session.json'}); document.body.append(a); a.click(); a.remove(); }}, '⤓ Export'),
      h('button',{title:'Session-Datei laden', onclick:() => fileIn.click()}, '⤒ Import'), fileIn,
      h('button',{title:'Alles auf Demo zurücksetzen', onclick:() => { if(!confirm('Alles zurücksetzen? Deine Patterns gehen verloren (vorher exportieren!).')) return; if(E.playing) togglePlay(); S = defaultState(); applyAll(); regenIR('rm',true); regenIR('hall',true); buildAll(); save(); }}, '↺ Reset'),
      h('span',{class:'zl'}, 'Zoom'), zoomSel));
}

/* ============================================================
   Aufbau, Playhead, Meter
   ============================================================ */
function fitZoom(){ const tb = $('#table'), W = 2124; const z = S.zoom==='auto' ? Math.min(1, (window.innerWidth-12)/W) : +S.zoom; tb.style.zoom = z; }
function buildAll(){
  UI.meters = {}; PADS.length = 0;
  buildHeader();
  const L = $('#col-left'), M = $('#col-mid'), R = $('#col-right'), B = $('#row-bottom');
  [L,M,R,B].forEach(e => e.innerHTML = '');
  L.append(build808(), build707(), buildKS());
  M.append(buildMixer(), buildFX());
  R.append(buildAcid(), buildLead(), buildChords());
  B.append(buildArranger());
  applyMoodLook(); fitZoom();
}
function onStep(cur){
  for(const id of DEV_IDS){ const u = UI.dev[id]; if(!u) continue; const D = S.dev[id], p = cur.pos[id];
    const k = (p.part===D.edit && Math.floor(p.i/16)===D.page) ? p.i%16 : -1;
    if(k !== u.ph){ if(u.ph >= 0) u.cols[u.ph].forEach(e => e.classList.remove('ph')); if(k >= 0) u.cols[k].forEach(e => e.classList.add('ph')); u.ph = k; }
    renderPB(id); }
  UI.dev.chords.curChord(cur.H.ci, cur.H.cpi);
  const sib = cur.g % 16, bar = cur.song ? cur.song.bar : Math.floor(cur.g/16);
  UI.posBar.textContent = `${String(bar+1).padStart(3,'0')}.${Math.floor(sib/4)+1}.${sib%4+1}`;
  UI.posSec.textContent = cur.song ? `${cur.song.sec.name} · ${cur.song.bar+1}/${cur.song.bars}` : 'PATTERN';
  UI.beat.classList.toggle('on', sib%4===0); UI.beat.classList.toggle('one', sib===0);
  if(UI.arr){ UI.arr.rows.forEach((r,j) => r.classList.toggle('cur', !!cur.song && cur.song.si===j));
    UI.arr.chips.forEach((c,k) => { const on = !!cur.song && cur.song.k===k; c.classList.toggle('cur', on); if(on) c.style.setProperty('--p', ((cur.song.bar*16+sib+1)/(cur.song.bars*16)).toFixed(3)); }); }
}
const mbuf = new Float32Array(512);
function frame(){
  if(ctx){
    if(E.playing){ let c = null; while(E.q.length && E.q[0].t <= ctx.currentTime) c = E.q.shift(); if(c){ E.cur = c; onStep(c); } }
    if(ctx.state === 'running'){
      for(const k in UI.meters){ const m = UI.meters[k], an = k==='master' ? E.M.an : E.ch[k].an; an.getFloatTimeDomainData(mbuf);
        let pk = 0; for(let i=0;i<mbuf.length;i++){ const a = Math.abs(mbuf[i]); if(a > pk) pk = a; }
        const v = clamp((20*Math.log10(pk+1e-6)+48)/48, 0, 1); m.v = Math.max(v, m.v-0.02); m.el.style.transform = `scaleY(${m.v.toFixed(3)})`; m.el.classList.toggle('hot', pk > 0.97); }
      if(UI.gr){ const r = typeof E.M.lim.reduction === 'number' ? E.M.lim.reduction : 0; UI.gr.style.width = (clamp(-r/12,0,1)*100).toFixed(1)+'%'; }
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- Start ---------- */
window.addEventListener('DOMContentLoaded', () => {
  S = loadState() || defaultState();
  initAudio();
  buildAll();
  requestAnimationFrame(frame);
  window.addEventListener('resize', fitZoom);
  const ov = $('#startOverlay');
  ov.addEventListener('click', () => { ctx.resume(); ov.classList.add('hide'); });
  document.addEventListener('pointerdown', () => { if(ctx && ctx.state !== 'running') ctx.resume(); }, {capture:true});
  document.addEventListener('keydown', e => {
    if(e.target.matches('input,select,textarea')) return;
    if(e.code === 'Space'){ e.preventDefault(); if(!ov.classList.contains('hide')){ ctx.resume(); ov.classList.add('hide'); } togglePlay(); return; }
    const p = PADS.find(x => x.key === e.key); if(p && !e.repeat) p.down();
  });
  document.addEventListener('keyup', e => { const p = PADS.find(x => x.key === e.key); if(p) p.up(); });
});
