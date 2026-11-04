'use strict';
/* ============================================================
   TECHNO WORKSTATION – Musiktheorie, Zustand, Demo-Patterns
   ============================================================ */
const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

// Moods: Skala, Gewichte für Akkordstufen (I..VII), Farbe des Tischlichts, Klangfärbung
const MOODS = [
  {id:'happy', name:'Fröhlich',     icon:'☀️', mode:'Ionisch · Dur',      scale:[0,2,4,5,7,9,11], w:[1.3,0.9,0.6,1.3,1.2,1.2,0.15], color:'255,196,90',  tape:0.00, dark:0.0},
  {id:'euph',  name:'Euphorisch',   icon:'✨', mode:'Lydisch',            scale:[0,2,4,6,7,9,11], w:[1.3,1.2,0.6,0.8,1.1,1.0,0.5],  color:'110,225,255', tape:0.00, dark:0.0},
  {id:'dream', name:'Verträumt',    icon:'☁️', mode:'Mixolydisch',        scale:[0,2,4,5,7,9,10], w:[1.3,0.7,0.5,1.1,0.9,0.9,1.2],  color:'190,150,255', tape:0.05, dark:0.1},
  {id:'melan', name:'Melancholisch',icon:'🌧️', mode:'Dorisch',            scale:[0,2,3,5,7,9,10], w:[1.3,0.9,1.0,1.2,0.8,0.5,1.1],  color:'110,150,220', tape:0.05, dark:0.2},
  {id:'night', name:'Nachtfahrt',   icon:'🌙', mode:'Äolisch · Moll',     scale:[0,2,3,5,7,8,10], w:[1.3,0.3,1.0,1.0,0.8,1.3,1.2],  color:'80,110,210',  tape:0.10, dark:0.3},
  {id:'dark',  name:'Düster',       icon:'🖤', mode:'Harmonisch Moll',    scale:[0,2,3,5,7,8,11], w:[1.4,0.4,0.6,1.0,1.2,1.3,0.5],  color:'130,80,170',  tape:0.15, dark:0.45},
  {id:'threat',name:'Bedrohlich',   icon:'⚠️', mode:'Phrygisch',          scale:[0,1,3,5,7,8,10], w:[1.4,1.4,0.6,0.9,0.3,1.0,1.1],  color:'180,45,55',   tape:0.25, dark:0.6},
  {id:'hell',  name:'Hölle',        icon:'🔥', mode:'Lokrisch',           scale:[0,1,3,5,6,8,10], w:[1.2,1.5,0.7,0.8,1.2,1.0,0.9],  color:'255,55,15',   tape:0.45, dark:0.8},
];

const DEV_IDS = ['d808','d707','ks','acid','lead','chords'];
const DEV_INFO = {
  d808:  {name:'RC-08', short:'808',    color:'#f08a24'},
  d707:  {name:'RC-07', short:'707',    color:'#e9e3c9'},
  ks:    {name:'SK-01', short:'KICK·SUB',color:'#ff3b3b'},
  acid:  {name:'AB-03', short:'ACID',   color:'#c6ff3d'},
  lead:  {name:'LX-1',  short:'LEAD',   color:'#36d6ff'},
  chords:{name:'CH-5',  short:'CHORDS', color:'#ff5fd2'},
};
const MAXS = 64;
const KIT808 = [['BD','Bass Drum'],['SD','Snare'],['LT','Lo Tom'],['MT','Mid Tom'],['HT','Hi Tom'],['RS','Rim Shot'],['CP','Clap'],['CB','Cowbell'],['CY','Cymbal'],['OH','Open Hat'],['CH','Closed Hat']];
const KIT707 = [['BD1','Bass 1'],['BD2','Bass 2'],['SD1','Snare 1'],['SD2','Snare 2'],['LT','Lo Tom'],['MT','Mid Tom'],['HT','Hi Tom'],['RIM','Rim'],['CP','Clap'],['TB','Tamb'],['CH','Cl. Hat'],['OH','Op. Hat'],['CR','Crash'],['RD','Ride']];
const CHORD_TYPES = [['triad','Dreiklänge'],['sus','Sus 2/4'],['7','7er'],['9','9er'],['11','11er'],['add9','add9'],['mix','Gemischt']];
const CHORD_CYCLE = ['triad','sus2','sus4','7','9','11','add9'];

const LEAD_PRESETS = {
  'Pluck':    {wave:0,det:.25,cut:.35,res:.30,env:.65,att:0,  dec:.30,sus:.05,rel:.35},
  'Supersaw': {wave:0,det:.65,cut:.50,res:.15,env:.30,att:.15,dec:.50,sus:.70,rel:.45},
  'Square':   {wave:1,det:.12,cut:.42,res:.45,env:.50,att:0,  dec:.35,sus:.35,rel:.30},
  'Glass':    {wave:2,det:.08,cut:.75,res:.20,env:.20,att:.05,dec:.55,sus:.30,rel:.60},
  'Acid Lead':{wave:0,det:.05,cut:.25,res:.75,env:.70,att:0,  dec:.25,sus:.20,rel:.20},
};
const CH_PRESETS = {
  'Dub Stab': {wave:0,det:.30,cut:.28,res:.40,env:.50,att:0,  dec:.28,sus:0,  rel:.35},
  'Pad':      {wave:0,det:.55,cut:.38,res:.15,env:.20,att:.70,dec:.60,sus:.80,rel:.70},
  'Pluck':    {wave:1,det:.15,cut:.30,res:.30,env:.60,att:0,  dec:.25,sus:0,  rel:.40},
  'Organ':    {wave:1,det:.05,cut:.55,res:.10,env:.05,att:.05,dec:.50,sus:.90,rel:.25},
  'Strings':  {wave:0,det:.70,cut:.45,res:.10,env:.15,att:.55,dec:.70,sus:.75,rel:.60},
};

const A = (n,f) => Array.from({length:n}, (_,i) => typeof f === 'function' ? f(i) : f);
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const expMap = (v,a,b) => a*Math.pow(b/a, v);
let S = null;

/* ---------- Theorie ---------- */
function scaleSemi(deg){ const sc = MOODS[S.mood].scale, n = sc.length, o = Math.floor(deg/n); return sc[deg - o*n] + 12*o; }
function degToMidi(deg, oct){ return 12*(oct+1) + S.key + scaleSemi(deg); }
function midiName(m){ return NOTE_NAMES[((m%12)+12)%12] + (Math.floor(m/12)-1); }
function chordDegs(t){ return ({triad:[0,2,4],sus2:[0,1,4],sus4:[0,3,4],add9:[0,2,4,8],'7':[0,2,4,6],'9':[0,2,4,6,8],'11':[0,2,6,8,10]})[t] || [0,2,4]; }

function chordInfo(c){
  const r = c.d, s = k => scaleSemi(r+k) - scaleSemi(r);
  const rootPc = (((S.key + scaleSemi(r)) % 12) + 12) % 12;
  const i3=s(2), i5=s(4), i7=s(6), i9=s(8)-12, i11=s(10)-12;
  const tri = i3===4&&i5===7 ? '' : i3===3&&i5===7 ? 'm' : i3===3&&i5===6 ? 'dim' : i3===4&&i5===8 ? 'aug' : '(♭5)';
  const minorish = tri==='m' || tri==='dim';
  const sev = () => {
    if(tri==='')    return i7===11 ? 'maj7' : '7';
    if(tri==='m')   return i7===11 ? 'm(maj7)' : 'm7';
    if(tri==='dim') return i7===9 ? 'dim7' : 'm7♭5';
    if(tri==='aug') return i7===11 ? 'maj7♯5' : '7♯5';
    return '7♭5';
  };
  const e9 = i9===2 ? '9' : i9===1 ? '♭9' : '♯9', e11 = i11===5 ? '11' : i11===6 ? '♯11' : '♭11';
  let q;
  switch(c.t){
    case 'triad': q = tri; break;
    case 'sus2': q = s(1)===2 ? 'sus2' : 'sus♭2'; break;
    case 'sus4': q = s(3)===5 ? 'sus4' : 'sus♯4'; break;
    case 'add9': q = (tri==='(♭5)'?'(♭5)':tri) + 'add' + e9; break;
    case '7': q = sev(); break;
    case '9': { const b = sev(); q = e9==='9' ? (b==='maj7'?'maj9':b==='7'?'9':b==='m7'?'m9':b+'(9)') : b+'('+e9+')'; break; }
    case '11': { const b = sev();
      if(e9==='9' && e11==='11' && (b==='m7'||b==='7')) q = b==='m7' ? 'm11' : '11';
      else if(b==='maj7' && e9==='9' && e11==='♯11') q = 'maj9♯11';
      else q = b + '(' + e9 + ',' + e11 + ')'; break; }
    default: q = tri;
  }
  const ROM = ['I','II','III','IV','V','VI','VII'];
  let rn = ROM[((r%7)+7)%7]; if(minorish) rn = rn.toLowerCase(); if(tri==='dim') rn += '°';
  return {name: NOTE_NAMES[rootPc] + q, roman: rn};
}

const MOTION = {0:0.05, 1:0.9, 2:0.7, 3:1.5, 4:1.3, 5:1.2, 6:1.1};
function rndW(ws){ let s = ws.reduce((a,b)=>a+b,0), r = Math.random()*s; for(let i=0;i<ws.length;i++){ r -= ws[i]; if(r<=0) return i; } return ws.length-1; }
function genProg(len, type, mood){
  const m = MOODS[mood], p = [];
  let cur = Math.random() < 0.75 ? 0 : rndW(m.w.map((w,i)=> i===0 ? 0 : w));
  p.push(cur);
  for(let i=1;i<len;i++){
    const ws = m.w.map((w,d) => {
      let x = w * MOTION[(d-cur+7)%7];
      if(i===len-1){ const back = (p[0]-d+7)%7; x *= (back===3||back===4||back===1||back===6) ? 1.5 : 0.8; if(d===p[0]) x *= 0.1; }
      if(p.includes(d)) x *= 0.6;
      return x;
    });
    cur = rndW(ws); p.push(cur);
  }
  return p.map(d => ({d, t: type==='mix' ? pick(['triad','7','9','7','add9','sus4','9']) : type==='sus' ? pick(['sus2','sus4']) : type}));
}

const VCACHE = new Map();
function voiceProg(prog){
  const key = JSON.stringify(prog) + '|' + S.key + '|' + S.mood;
  if(VCACHE.has(key)) return VCACHE.get(key);
  let prev = null; const out = [];
  for(const c of prog){
    const base = chordDegs(c.t).map(x => degToMidi(c.d + x, 3));
    let best = null, bs = 1e9;
    for(let inv=0; inv<base.length; inv++){
      const v = base.map((m,j) => j<inv ? m+12 : m).sort((a,b)=>a-b);
      for(const sh of [-24,-12,0,12]){
        const w = v.map(m => m+sh);
        if(w[0] < 45 || w[w.length-1] > 86) continue;
        const mean = w.reduce((a,b)=>a+b,0)/w.length;
        let sc = Math.abs(mean-62)*0.6;
        if(prev) sc += w.reduce((a,m) => a + Math.min(...prev.map(pp => Math.abs(pp-m))), 0);
        if(sc < bs){ bs = sc; best = w; }
      }
    }
    const res = best || base; out.push(res); prev = res;
  }
  if(VCACHE.size > 300) VCACHE.clear();
  VCACHE.set(key, out);
  return out;
}

/* ---------- Ketten-Parser: "3x1 3 2x1 4" ---------- */
function parseChain(txt){
  const out = [];
  for(const tok of String(txt).toLowerCase().split(/[\s,;]+/)){
    if(!tok) continue;
    let rep = 1, p;
    const m = tok.match(/^(\d+)\s*[x*×]\s*([1-4a-d])$/);
    if(m){ rep = +m[1]; p = m[2]; } else if(/^[1-4a-d]$/.test(tok)) p = tok; else continue;
    const idx = 'abcd'.includes(p) ? 'abcd'.indexOf(p) : (+p - 1);
    for(let r=0; r<Math.min(rep,64); r++) out.push(idx);
  }
  return out.slice(0,128);
}
function chainToText(ch){
  const out = []; let i = 0;
  while(i < ch.length){ let j = i; while(j < ch.length && ch[j]===ch[i]) j++; const n = j-i; out.push(n>1 ? `${n}x${ch[i]+1}` : `${ch[i]+1}`); i = j; }
  return out.join(' ');
}

/* ---------- Parts ---------- */
function newDrumPart(kit){ return {len:16, st:Object.fromEntries(kit.map(k=>[k[0],A(MAXS,0)])), ac:A(MAXS,0), fx:A(MAXS,'')}; }
function newMelPart(){ return {len:16, n:A(MAXS,()=>({g:0,d:0,o:0,a:0,s:0,t:0})), fx:A(MAXS,'')}; }
function newKsPart(){ return {len:16, k:A(MAXS,0), s:A(MAXS,()=>({g:0,d:0})), fx:A(MAXS,'')}; }
function newChPart(){ return {len:16, st:A(MAXS,()=>({g:0,a:0,l:1})), prog:[{d:0,t:'7'},{d:5,t:'7'},{d:2,t:'7'},{d:6,t:'7'}], bpc:1, fx:A(MAXS,'')}; }
const NEWPART = { d808:()=>newDrumPart(KIT808), d707:()=>newDrumPart(KIT707), ks:newKsPart, acid:newMelPart, lead:newMelPart, chords:newChPart };
function devBase(parts, params, extra){ return Object.assign({edit:0, play:0, chain:[], chainOn:false, page:0, params, parts}, extra||{}); }

/* ---------- Zufallsgeneratoren ---------- */
function tmpl(mode, b){
  return mode==='four' ? b%4===0 : mode==='back' ? (b===4||b===12) : mode==='off' ? b%4===2 : mode==='one' ? b===0 : mode==='eighth' ? b%2===0 : false;
}
function randDrums(P, kit, cfg){
  for(const [k] of kit){
    const a = P.st[k]; const [p, mode, mc] = cfg[k] || [0.06];
    const useT = mode && Math.random() < (mc ?? 1);
    for(let i=0;i<MAXS;i++){ const b = i%16; a[i] = (useT && tmpl(mode,b)) || Math.random() < p ? 1 : 0; }
  }
  for(let i=0;i<MAXS;i++) P.ac[i] = (i%4===2 && Math.random()<0.5) || Math.random()<0.1 ? 1 : 0;
}
function randAcid(P){
  const pool = [0,0,0,0,7,7,3,4,5,2,6,-3,1,-1];
  for(let i=0;i<MAXS;i++){ const n = P.n[i];
    n.g = Math.random()<0.72 ? 1 : 0; n.d = pick(pool); n.o = Math.random()<0.2 ? 1 : (Math.random()<0.1 ? -1 : 0);
    n.a = Math.random()<0.3 ? 1 : 0; n.s = Math.random()<0.22 ? 1 : 0; n.t = 0; }
}
function randLead(P){
  P.n.forEach(n => Object.assign(n,{g:0,d:0,o:0,a:0,s:0,t:0}));
  const rhythms = [[0,3,6,10,12],[0,2,4,7,10,14],[0,6,8,14],[0,3,8,11],[0,4,6,10,12,14]];
  for(let bar=0; bar<4; bar++){
    const r = bar%2===0 ? pick(rhythms) : rhythms[Math.floor(Math.random()*rhythms.length)];
    let d = pick([0,2,4,7]);
    r.forEach((pos,j) => { const n = P.n[bar*16+pos]; d = clamp(d + pick([-2,-1,1,2,0,3,-3]), -3, 11); n.g=1; n.d=d; n.a = j===0 ? 1 : 0;
      if(Math.random()<0.3 && pos<15 && !r.includes(pos+1)) n.t = 1; });
  }
}
function randKs(P){
  const subs = [[2,6,10,14],[2,3,6,7,10,11,14,15],[1,2,5,6,9,10,13,14],[3,7,11,15],[2,5,10,13],[2,3,7,10,11,15]];
  const sp = pick(subs);
  for(let i=0;i<MAXS;i++){ const b=i%16; P.k[i] = b%4===0 ? 1 : (b===14 && i%64>47 && Math.random()<0.5 ? 1 : 0);
    P.s[i] = {g: sp.includes(b) ? 1 : 0, d: Math.random()<0.8 ? 0 : pick([3,4,-1,7,2])}; }
}
function randChords(P){
  const rh = [[2,7,10],[3,6,11,14],[0,3,6,10,13],[2,10],[6,14],[3,10,13],[0,7,10]];
  const r = pick(rh);
  for(let i=0;i<MAXS;i++){ const b=i%16; P.st[i] = {g: r.includes(b)?1:0, a: b===r[0]?1:0, l: 1}; }
}
const RAND = {
  d808: P => randDrums(P, KIT808, {BD:[0.05,'four',0.4],SD:[0.06],LT:[0.05],MT:[0.05],HT:[0.05],RS:[0.14],CP:[0.03,'back',0.8],CB:[0.06],CY:[0,'one',0.3],OH:[0.03,'off',0.8],CH:[0.6]}),
  d707: P => randDrums(P, KIT707, {BD1:[0.03,'four',0.3],BD2:[0.03],SD1:[0.05],SD2:[0.08],LT:[0.04],MT:[0.04],HT:[0.04],RIM:[0.12],CP:[0.04,'back',0.5],TB:[0.3],CH:[0.4],OH:[0.03,'off',0.4],CR:[0,'one',0.3],RD:[0.1,'eighth',0.6]}),
  ks: randKs, acid: randAcid, lead: randLead,
  chords: P => { randChords(P); P.prog = genProg(S.dev.chords.gen.len, S.dev.chords.gen.type, S.mood); },
};

/* ---------- Default-Zustand & Demo ---------- */
function defaultState(){
  const s = {
    v:1, bpm:128, key:9, mood:4, swing:0.1, songMode:false, songStart:0, zoom:'auto',
    dev:{
      d808: devBase(A(4,()=>newDrumPart(KIT808)), Object.fromEntries(KIT808.map(([k])=>[k,{lvl:.8,tune:.5,dec:.5,tone:.5}])), {sel:'CH'}),
      d707: devBase(A(4,()=>newDrumPart(KIT707)), Object.fromEntries(KIT707.map(([k])=>[k,{lvl:.75,tune:.5,dec:.5,tone:.5}])), {sel:'RD', grit:.3}),
      ks:   devBase(A(4,newKsPart), {ktune:.45,punch:.5,kdec:.45,click:.35,kdrv:.35,klvl:.85,rumble:.4,rtone:.35,soct:1,sdec:.3,glide:.15,slvl:.75,sharm:.3,follow:true}),
      acid: devBase(A(4,newMelPart), {wave:0,tune:0,cut:.28,res:.72,env:.55,dec:.35,acc:.6,drv:.35,follow:false}),
      lead: devBase(A(4,newMelPart), Object.assign({preset:'Pluck'}, LEAD_PRESETS['Pluck'], {oct:3, follow:false})),
      chords: devBase(A(4,newChPart), Object.assign({preset:'Dub Stab'}, CH_PRESETS['Dub Stab'], {spread:.6, oct:0, bass:false}), {gen:{type:'7',len:4,bpc:1}, cands:[]}),
    },
    mix:{
      ch: Object.fromEntries(DEV_IDS.map(id=>[id,{vol:.75,drv:0,comp:.25,lo:0,hi:0,crush:0,flt:0,rm:0,hall:0,dly:0,pan:0,mute:false,solo:false}])),
      ret:{rm:.6, hall:.6, dly:.55},
      master:{vol:.8, punch:.5, air:.4, glue:.45, tape:.3, loud:.4, pump:.45, flt:0},
    },
    bus:{rmSize:.35, rmTone:.6, hallSize:.65, hallPre:.3, hallTone:.45, dlyTime:'3/16', dlyFb:.42, dlyTone:.45},
    arr:{sec:[], song:[]},
  };
  const mc = s.mix.ch;
  Object.assign(mc.d808,  {rm:.12, comp:.3});
  Object.assign(mc.d707,  {rm:.18, hall:.05, vol:.68, pan:.1});
  Object.assign(mc.ks,    {vol:.82, comp:.2});
  Object.assign(mc.acid,  {dly:.15, hall:.05, drv:.1, vol:.7});
  Object.assign(mc.lead,  {hall:.25, dly:.25, vol:.62});
  Object.assign(mc.chords,{hall:.3, dly:.38, vol:.62});
  demo(s);
  return s;
}

function demo(s){
  const on = (arr, idx, v=1) => idx.forEach(i => arr[i] = v);
  const all16 = A(16, i=>i);
  // RC-08
  const p8 = s.dev.d808.parts;
  on(p8[0].st.CP,[4,12]); on(p8[0].st.OH,[2,6,10,14]); on(p8[0].st.CH,[0,1,3,4,5,7,8,9,11,12,13,15]); on(p8[0].ac,[2,6,10,14]);
  on(p8[1].st.CP,[4,12]); on(p8[1].st.OH,[2,6,10,14]); on(p8[1].st.CH,[0,1,3,5,7,8,9,11,13,15]); on(p8[1].st.RS,[3,11,14]); on(p8[1].st.CB,[7]); on(p8[1].ac,[2,6,10,14]);
  on(p8[2].st.CH,[2,6,10,14]); on(p8[2].st.CP,[12]);
  on(p8[3].st.CP,[4]); on(p8[3].st.OH,[2,6,10]); on(p8[3].st.CH,[0,1,3,4,5,7,8,9,11]); on(p8[3].st.SD,[12,13,14,15]); on(p8[3].st.MT,[14]); on(p8[3].st.LT,[15]); on(p8[3].ac,[12,15]); p8[3].fx[15]='x2';
  // RC-07
  const p7 = s.dev.d707.parts;
  on(p7[0].st.RD,[0,2,4,6,8,10,12,14]); on(p7[0].st.TB,[4,12]); on(p7[0].st.SD2,[7,15]);
  on(p7[1].st.RD,[0,2,4,6,8,10,12,14]); on(p7[1].st.TB,[4,12]); on(p7[1].st.CR,[0]); on(p7[1].st.CH,[1,3,5,9,11,13]); on(p7[1].st.SD2,[7,15]); on(p7[1].ac,[0]);
  on(p7[2].st.TB, all16); on(p7[2].st.RD,[2,6,10,14]); on(p7[2].ac,[0,4,8,12]);
  on(p7[3].st.SD1,[0,2,4,6,8,10,12,13,14,15]); on(p7[3].st.CR,[0]); on(p7[3].ac,[12,13,14,15]); p7[3].fx[14]='x3'; p7[3].fx[15]='x4';
  // SK-01 Kick/Sub
  const pk = s.dev.ks.parts, sub = (P,idx,d=[]) => idx.forEach((i,j)=>P.s[i]={g:1,d:d[j]||0});
  on(pk[0].k,[0,4,8,12]); sub(pk[0],[2,6,10,14]);
  on(pk[1].k,[0,4,8,12]); sub(pk[1],[2,3,6,7,10,11,14,15],[0,0,0,0,0,0,3,4]);
  sub(pk[2],[0,8]);
  on(pk[3].k,[0,4,8,10,12,14,15]); sub(pk[3],[2,6,11]); pk[3].fx[15]='REV';
  // AB-03 Acid
  const pa = s.dev.acid.parts;
  const line = [[1,0,0,1,0],[1,0,0,0,1],[1,7,0,0,0],[0,0,0,0,0],[1,0,0,0,0],[1,3,0,1,1],[1,4,0,0,0],[1,0,1,0,0],
                [1,0,0,1,0],[0,0,0,0,0],[1,-1,0,0,0],[1,0,0,0,1],[1,2,0,0,0],[1,0,1,1,0],[0,0,0,0,0],[1,4,0,0,1]];
  line.forEach((l,i)=>Object.assign(pa[0].n[i],{g:l[0],d:l[1],o:l[2],a:l[3],s:l[4]}));
  line.forEach((l,i)=>Object.assign(pa[1].n[i],{g:l[0]||(i%4===3?1:0),d:i%8===7?5:l[1],o:i===2||i===10?1:l[2],a:i%3===0?1:l[3],s:i%5===1?1:l[4]}));
  [[0,0,0,1,1],[1,0,0,0,1],[8,3,0,1,1],[9,2,0,0,0]].forEach(([i,d,o,a,sl])=>Object.assign(pa[2].n[i],{g:1,d,o,a,s:sl}));
  pa[3] = JSON.parse(JSON.stringify(pa[0])); pa[3].fx[6]='DLY'; pa[3].fx[13]='x2';
  // LX-1 Lead
  const pl = s.dev.lead.parts;
  [[0,4,1,1],[1,0,0,1],[6,3,0,0],[8,2,1,1],[9,0,0,1],[12,0,0,0],[14,1,0,0]].forEach(([i,d,a,t])=>Object.assign(pl[0].n[i],{g:i===1||i===9?0:1,d,a,t}));
  [0,2,4,7,4,2,0,-1].forEach((d,j)=>Object.assign(pl[1].n[j*2],{g:1,d,a:j%4===0?1:0})); pl[1].fx[14]='DLY';
  pl[3] = JSON.parse(JSON.stringify(pl[0])); pl[3].n.forEach(n=>{ if(n.g) n.d += 2; });
  // CH-5 Chords
  const pc = s.dev.chords.parts, gates = (P,idx,l=1) => idx.forEach((i,j)=>P.st[i]={g:1,a:j===0?1:0,l});
  pc[0].prog = [{d:0,t:'9'},{d:5,t:'7'},{d:2,t:'7'},{d:6,t:'9'}]; gates(pc[0],[2,7,10]);
  pc[1].prog = [{d:0,t:'9'},{d:5,t:'7'},{d:2,t:'7'},{d:6,t:'9'}]; gates(pc[1],[0,3,6,10,13]); pc[1].fx[13]='DLY';
  pc[2].prog = [{d:5,t:'7'},{d:6,t:'add9'},{d:0,t:'9'},{d:3,t:'7'}]; gates(pc[2],[0],16);
  pc[3].prog = [{d:0,t:'9'},{d:3,t:'9'},{d:5,t:'9'},{d:4,t:'9'}]; gates(pc[3],[2,7,10,14]);
  // Arranger
  s.arr.sec = [
    {name:'Intro', bars:8,  p:{d808:2, d707:-1, ks:0, acid:-1, lead:-1, chords:-1}},
    {name:'Verse', bars:16, p:{d808:0, d707:0,  ks:0, acid:0,  lead:-1, chords:0}},
    {name:'Build', bars:8,  p:{d808:3, d707:2,  ks:2, acid:1,  lead:0,  chords:1}},
    {name:'Drop',  bars:16, p:{d808:1, d707:1,  ks:1, acid:1,  lead:0,  chords:0}},
    {name:'Break', bars:8,  p:{d808:-1,d707:2,  ks:2, acid:-1, lead:1,  chords:2}},
    {name:'Outro', bars:8,  p:{d808:0, d707:-1, ks:0, acid:-1, lead:-1, chords:-1}},
  ];
  s.arr.song = [0,1,2,3,4,2,3,5];
}

function deepMerge(def, src){
  if(Array.isArray(def)) return Array.isArray(src) ? src : def;
  if(def && typeof def === 'object'){
    const out = Object.assign({}, def);
    if(src && typeof src === 'object') for(const k in src){
      out[k] = (def[k] && typeof def[k]==='object' && !Array.isArray(def[k])) ? deepMerge(def[k], src[k]) : src[k];
    }
    return out;
  }
  return src === undefined ? def : src;
}
