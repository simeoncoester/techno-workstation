'use strict';
/* ============================================================
   TECHNO WORKSTATION – Audio-Engine
   Voices · Kanalzüge · FX-Busse · Mastering · gemeinsame Clock
   ============================================================ */
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const E = {ch:{}, bus:{}, M:{}, dv:{}, playing:false, g:0, nextT:0, q:[], cur:null, roll:null, duckT:[], live:{wash:false}};
const RT = {};
const mtof = m => 440*Math.pow(2,(m-69)/12);
const WAVES = ['sawtooth','square','triangle'];

/* ---------- Helfer ---------- */
function bq(type,f,Q){ const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if(Q!=null) b.Q.value = Q; return b; }
function gn(v=1){ const g = ctx.createGain(); g.gain.value = v; return g; }
function shaper(curve){ const s = ctx.createWaveShaper(); if(curve) s.curve = curve; s.oversample = '4x'; return s; }
function tanhCurve(k){ const n=2048, c=new Float32Array(n), nk=Math.tanh(k); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(k*x)/nk; } return c; }
function driveComp(k){ return Math.pow(Math.tanh(k)/k, 0.6); }
function crushCurve(bits){ const n=4096, c=new Float32Array(n), st=Math.pow(2,bits)/2; for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.round(x*st)/st; } return c; }
function clipCurve(){ const n=4096, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1, a=Math.abs(x); c[i]=Math.sign(x)*(a<0.8 ? a : 0.8+0.2*Math.tanh((a-0.8)/0.2)); } return c; }
function setP(p, v, tc=0.015){ if(!isFinite(v)) return; p.setTargetAtTime(v, ctx.currentTime, tc); }
function osc(type,f,t){ const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f,t); o.start(t); return o; }
function noise(t,dur){ const s = ctx.createBufferSource(); s.buffer = E.noise; s.loop = true; s.start(t, Math.random()*1.5); s.stop(t+dur); return s; }
function envGain(out,t,peak,tc,att=0.0015){ const g = ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+att); g.gain.setTargetAtTime(0,t+att,tc); g.connect(out); return g; }
function envHold(out,t,peak,hold,tc){ const g = ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+0.0015); g.gain.setValueAtTime(peak,t+hold); g.gain.setTargetAtTime(0,t+hold,tc); g.connect(out); return g; }
function djSet(lp,hp,v){
  if(v < -0.01){ setP(lp.frequency, 20000*Math.pow(2, v*9.2)); setP(hp.frequency, 10); }
  else if(v > 0.01){ setP(hp.frequency, 20*Math.pow(2, v*9)); setP(lp.frequency, 20000); }
  else { setP(lp.frequency, 20000); setP(hp.frequency, 10); }
}
function anySolo(){ return DEV_IDS.some(id => S.mix.ch[id].solo); }
function chAudible(id){ const m = S.mix.ch[id]; return !(m.mute || (anySolo() && !m.solo)); }

function makeIR(dur, damp, early){
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr*dur)), b = ctx.createBuffer(2, len, sr);
  for(let c=0;c<2;c++){
    const d = b.getChannelData(c); let lp = 0;
    for(let i=0;i<len;i++){
      const t = i/len, a = Math.min(0.96, damp*t*1.2 + 0.02);
      lp = lp*a + (Math.random()*2-1)*(1-a);
      d[i] = lp * Math.pow(1-t, 2) * (1 + a*2) * Math.min(1, i/(sr*0.002));
    }
    if(early) for(let k=0;k<10;k++){ const p = Math.floor(sr*(0.004+Math.random()*0.035)); if(p<len) d[p] += (Math.random()*2-1)*0.6*(1-k/10); }
  }
  return b;
}

/* ---------- Master-Kette (Mastering) ---------- */
function buildMaster(){
  const M = E.M;
  M.in = gn(1);
  M.djLP = bq('lowpass',20000,1); M.djHP = bq('highpass',10,1);
  M.fxHP = bq('highpass',10,0.8); M.killHP = bq('highpass',10,0.7);
  M.punch = bq('lowshelf',65); M.mud = bq('peaking',320,0.9); M.mud.gain.value = -2; M.air = bq('highshelf',11000);
  M.glue = ctx.createDynamicsCompressor(); M.glue.knee.value = 6; M.glue.attack.value = 0.012; M.glue.release.value = 0.22;
  M.tape = shaper(null); M.tapeOut = gn(1);
  M.limIn = gn(1);
  M.lim = ctx.createDynamicsCompressor(); M.lim.threshold.value = -3; M.lim.knee.value = 0; M.lim.ratio.value = 20; M.lim.attack.value = 0.001; M.lim.release.value = 0.07;
  M.out = gn(0.8); M.clip = shaper(clipCurve()); M.clip.oversample = '2x';
  M.an = ctx.createAnalyser(); M.an.fftSize = 512;
  M.in.connect(M.djLP).connect(M.djHP).connect(M.fxHP).connect(M.killHP).connect(M.punch).connect(M.mud).connect(M.air)
      .connect(M.glue).connect(M.tape).connect(M.tapeOut).connect(M.limIn).connect(M.lim).connect(M.out).connect(M.clip);
  M.clip.connect(M.an); M.clip.connect(ctx.destination);
}

/* ---------- FX-Busse: Room, Hall, Ping-Pong-Delay ---------- */
function buildBuses(){
  const B = E.bus;
  const rm = B.rm = {in:gn(1), hp:bq('highpass',220,0.7), conv:ctx.createConvolver(), lp:bq('lowpass',9000,0.5), duck:gn(1), ret:gn(0.6)};
  rm.in.connect(rm.hp).connect(rm.conv).connect(rm.lp).connect(rm.duck).connect(rm.ret).connect(E.M.in);
  const hl = B.hall = {in:gn(1), pre:ctx.createDelay(0.5), hp:bq('highpass',280,0.7), conv:ctx.createConvolver(), lp:bq('lowpass',6000,0.5), duck:gn(1), ret:gn(0.6)};
  hl.in.connect(hl.pre).connect(hl.hp).connect(hl.conv).connect(hl.lp).connect(hl.duck).connect(hl.ret).connect(E.M.in);
  const d = B.dly = {in:gn(1), hp:bq('highpass',200,0.7), L:ctx.createDelay(3), R:ctx.createDelay(3), fb:gn(0.4), lp:bq('lowpass',4000,0.6), fhp:bq('highpass',250,0.6),
                     pL:ctx.createStereoPanner(), pR:ctx.createStereoPanner(), duck:gn(1), ret:gn(0.55)};
  d.pL.pan.value = -0.85; d.pR.pan.value = 0.85;
  d.in.connect(d.hp).connect(d.L);
  d.L.connect(d.pL).connect(d.duck); d.L.connect(d.R);
  d.R.connect(d.pR).connect(d.duck); d.R.connect(d.lp).connect(d.fhp).connect(d.fb).connect(d.L);
  d.duck.connect(d.ret).connect(E.M.in);
  d.duck.connect(gn(0.15)).connect(hl.in);
}
const irT = {};
function regenIR(w, now){
  clearTimeout(irT[w]);
  const run = () => { const B = S.bus;
    if(w==='rm') E.bus.rm.conv.buffer = makeIR(0.35 + B.rmSize*1.5, 0.35, true);
    else E.bus.hall.conv.buffer = makeIR(1.6 + B.hallSize*6, 0.6, false); };
  if(now) run(); else irT[w] = setTimeout(run, 150);
}

/* ---------- Kanalzug ---------- */
class Channel {
  constructor(id){
    this.id = id;
    this.input = gn(1);
    this.crDry = gn(1); this.crWet = gn(0); this.crush = shaper(crushCurve(3)); this.crush.oversample = 'none';
    this.pre = gn(1);
    this.input.connect(this.crDry).connect(this.pre);
    this.input.connect(this.crush).connect(this.crWet).connect(this.pre);
    this.sLP = bq('lowpass',20000,2); this.sHP = bq('highpass',10,1.5);         // Step-FX Filter
    this.drive = shaper(null); this.driveOut = gn(1);
    this.lo = bq('lowshelf',140); this.hi = bq('highshelf',5500);
    this.comp = ctx.createDynamicsCompressor(); this.comp.knee.value = 8; this.comp.attack.value = 0.006; this.comp.release.value = 0.14;
    this.fLP = bq('lowpass',20000,1.1); this.fHP = bq('highpass',10,1.1);       // DJ-Filter
    this.duck = gn(1); this.fader = gn(0.7); this.pan = ctx.createStereoPanner(); this.mute = gn(1);
    this.pre.connect(this.sLP).connect(this.sHP).connect(this.drive).connect(this.driveOut).connect(this.lo).connect(this.hi)
        .connect(this.comp).connect(this.fLP).connect(this.fHP).connect(this.duck).connect(this.fader).connect(this.pan).connect(this.mute).connect(E.M.in);
    this.sRm = gn(0); this.sHall = gn(0); this.sDly = gn(0);
    this.mute.connect(this.sRm).connect(E.bus.rm.in);
    this.mute.connect(this.sHall).connect(E.bus.hall.in);
    this.mute.connect(this.sDly).connect(E.bus.dly.in);
    this.tRev = gn(0); this.tDly = gn(0);                                       // Throws (Step-FX / Live)
    this.duck.connect(this.tRev).connect(E.bus.hall.in);
    this.duck.connect(this.tDly).connect(E.bus.dly.in);
    this.an = ctx.createAnalyser(); this.an.fftSize = 512; this.mute.connect(this.an);
  }
}

/* ---------- Geräte-Grundaufbau ---------- */
function buildDevices(){
  // RC-08
  const d8 = E.dv.d808 = {oh:null};
  d8.bdSh = shaper(tanhCurve(1.6)); d8.bdOut = gn(0.8); d8.bdSh.connect(d8.bdOut).connect(E.ch.d808.input);
  // RC-07 (mit "Grit": 6-Bit-Sample-Charakter)
  const d7 = E.dv.d707 = {oh:null};
  d7.mix = gn(1); d7.dry = gn(1); d7.wet = gn(0); d7.cr = shaper(crushCurve(5)); d7.cr.oversample = 'none'; d7.lp = bq('lowpass',15000,0.5);
  d7.mix.connect(d7.dry).connect(d7.lp); d7.mix.connect(d7.cr).connect(d7.wet).connect(d7.lp); d7.lp.connect(E.ch.d707.input);
  d7.bdSh = shaper(tanhCurve(2.2)); d7.bdOut = gn(0.7); d7.bdSh.connect(d7.bdOut).connect(d7.mix);
  // SK-01 Kick + Rumble + Sub
  const k = E.dv.ks = {};
  const out = E.ch.ks.input;
  k.kickSh = shaper(tanhCurve(3)); k.kickOut = gn(0.8); k.kickSh.connect(k.kickOut).connect(out);
  k.rSend = gn(0.4); k.rConv = ctx.createConvolver(); k.rConv.buffer = makeIR(2.4, 0.75, false);
  k.rHP = bq('highpass',38,0.7); k.rLP = bq('lowpass',150,1.2); k.rSh = shaper(tanhCurve(2.5)); k.rDuck = gn(1); k.rOut = gn(1.6);
  k.kickOut.connect(k.rSend).connect(k.rConv).connect(k.rHP).connect(k.rLP).connect(k.rSh).connect(k.rDuck).connect(k.rOut).connect(out);
  k.sub = ctx.createOscillator(); k.sub.type = 'sine'; k.sub.frequency.value = 55;
  k.subSh = shaper(tanhCurve(2)); k.subVca = gn(0); k.subDuck = gn(1); k.subOut = gn(0.7);
  k.sub.connect(k.subSh).connect(k.subVca).connect(k.subDuck).connect(k.subOut).connect(out); k.sub.start();
  // AB-03 Acid (persistente monophone Stimme)
  const a = E.dv.acid = {open:false};
  a.saw = ctx.createOscillator(); a.saw.type = 'sawtooth'; a.sq = ctx.createOscillator(); a.sq.type = 'square';
  a.gSaw = gn(1); a.gSq = gn(0); a.f1 = bq('lowpass',800,0.7); a.f2 = bq('lowpass',800,8);
  a.vca = gn(0); a.dist = shaper(null); a.post = gn(0.8);
  a.saw.connect(a.gSaw).connect(a.f1); a.sq.connect(a.gSq).connect(a.f1);
  a.f1.connect(a.f2).connect(a.vca).connect(a.dist).connect(a.post).connect(E.ch.acid.input);
  a.saw.start(); a.sq.start();
}

function initAudio(){
  ctx = new AC({latencyHint:'interactive'});
  const len = ctx.sampleRate*2; E.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const nd = E.noise.getChannelData(0); for(let i=0;i<len;i++) nd[i] = Math.random()*2-1;
  buildMaster(); buildBuses();
  DEV_IDS.forEach(id => E.ch[id] = new Channel(id));
  buildDevices();
  E.duckT = [[E.ch.acid.duck,.5],[E.ch.lead.duck,.6],[E.ch.chords.duck,.85],[E.ch.d707.duck,.12],[E.bus.hall.duck,.7],[E.bus.dly.duck,.4],[E.bus.rm.duck,.3]];
  regenIR('rm', true); regenIR('hall', true);
  applyAll();
}

/* ---------- Parameter anwenden ---------- */
function applyCh(id){
  if(!ctx) return; const c = E.ch[id], m = S.mix.ch[id];
  setP(c.fader.gain, m.vol*m.vol*1.6);
  if(m.drv < 0.01){ c.drive.curve = null; setP(c.driveOut.gain, 1); }
  else { const k = 1 + m.drv*8; c.drive.curve = tanhCurve(k); setP(c.driveOut.gain, driveComp(k)); }
  setP(c.lo.gain, m.lo*12); setP(c.hi.gain, m.hi*12);
  setP(c.comp.threshold, -m.comp*32); setP(c.comp.ratio, 1 + m.comp*7);
  djSet(c.fLP, c.fHP, m.flt);
  setP(c.pan.pan, m.pan);
  setP(c.crWet.gain, m.crush); setP(c.crDry.gain, 1 - m.crush);
  setP(c.sRm.gain, m.rm); setP(c.sHall.gain, E.live.wash ? 0.85 : m.hall); setP(c.sDly.gain, m.dly);
  applySolo();
}
function applySolo(){ if(!ctx) return; const any = anySolo(); DEV_IDS.forEach(id => { const m = S.mix.ch[id]; setP(E.ch[id].mute.gain, (m.mute || (any && !m.solo)) ? 0 : 1, 0.01); }); }
function applyMaster(){
  if(!ctx) return; const m = S.mix.master, M = E.M, mood = MOODS[S.mood];
  djSet(M.djLP, M.djHP, m.flt);
  setP(M.punch.gain, m.punch*7); setP(M.air.gain, m.air*6 - mood.dark*2);
  setP(M.glue.threshold, -m.glue*24); setP(M.glue.ratio, 1.2 + m.glue*3);
  const tk = 0.6 + (m.tape + mood.tape)*4; M.tape.curve = tanhCurve(tk); setP(M.tapeOut.gain, driveComp(tk));
  setP(M.limIn.gain, 1 + m.loud*2.2); setP(M.out.gain, m.vol);
}
function dlySec(){ return 60/S.bpm * ({'1/16':.25,'1/8':.5,'3/16':.75,'1/4':1,'3/8':1.5}[S.bus.dlyTime] || .75); }
function applyBus(){
  if(!ctx) return; const B = S.bus, b = E.bus, r = S.mix.ret;
  setP(b.rm.lp.frequency, expMap(B.rmTone,1500,14000)); setP(b.hall.lp.frequency, expMap(B.hallTone,1200,12000));
  setP(b.hall.pre.delayTime, B.hallPre*0.12);
  const dt = dlySec(); setP(b.dly.L.delayTime, dt, 0.05); setP(b.dly.R.delayTime, dt, 0.05);
  setP(b.dly.fb.gain, B.dlyFb*0.92); setP(b.dly.lp.frequency, expMap(B.dlyTone,800,12000));
  setP(b.rm.ret.gain, r.rm*1.3); setP(b.hall.ret.gain, r.hall*1.3); setP(b.dly.ret.gain, r.dly*1.2);
}
function applyDev(id){
  if(!ctx) return; const D = S.dev[id], P = D.params;
  if(id==='acid'){ const a = E.dv.acid;
    setP(a.gSaw.gain, P.wave ? 0 : 1); setP(a.gSq.gain, P.wave ? 0.7 : 0);
    setP(a.f1.Q, 0.5 + P.res*1.5); setP(a.f2.Q, 0.7 + P.res*19);
    if(P.drv < 0.02){ a.dist.curve = null; setP(a.post.gain, 0.9); } else { const k = 1 + P.drv*9; a.dist.curve = tanhCurve(k); setP(a.post.gain, 0.9*driveComp(k)); } }
  if(id==='ks'){ const k = E.dv.ks;
    const kk = 1 + P.kdrv*6; k.kickSh.curve = tanhCurve(kk); setP(k.kickOut.gain, P.klvl*1.6*driveComp(kk));
    setP(k.rSend.gain, P.rumble*0.9); setP(k.rLP.frequency, expMap(P.rtone,60,420));
    const sk = 1 + P.sharm*5; k.subSh.curve = tanhCurve(sk); setP(k.subOut.gain, P.slvl*1.1*driveComp(sk)); }
  if(id==='d707'){ const d = E.dv.d707; setP(d.wet.gain, D.grit*0.8); setP(d.dry.gain, 1 - D.grit*0.5); }
}
function applyAll(){ if(!ctx) return; DEV_IDS.forEach(id => { applyCh(id); applyDev(id); }); applyMaster(); applyBus(); }

/* ---------- Sidechain ---------- */
function duck(t){
  const sg = E.dv.ks.subDuck.gain; sg.cancelScheduledValues(t); sg.setTargetAtTime(0.15,t,0.002); sg.setTargetAtTime(1,t+0.045,0.04);
  const amt = S.mix.master.pump; if(amt < 0.01) return;
  for(const [node,depth] of E.duckT){ const g = node.gain; g.cancelScheduledValues(t); g.setTargetAtTime(1-depth*amt*0.9, t, 0.004); g.setTargetAtTime(1, t+0.03, 0.06+amt*0.08); }
}

/* ============================================================
   RC-08 Voices (analog-artig)
   ============================================================ */
const METAL = [205.3,304.4,369.6,522.7,540,800];
function metal(t,k,dur,lvl=0.22){ const sum = gn(lvl); for(const f of METAL){ const o = osc('square', f*k, t); o.connect(sum); o.stop(t+dur); } return sum; }
function choke(K,t){ if(!K.oh) return; for(const g of [].concat(K.oh)){ g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0,t,0.006); } K.oh = null; }
function tom808(base){ return (t,p,v,pm,out) => {
  const L=v*p.lvl, f=base*(0.75+p.tune*0.5)*pm, dec=0.15+p.dec*0.6;
  const o = osc('sine',f*1.3,t); o.frequency.exponentialRampToValueAtTime(f,t+0.03); o.frequency.exponentialRampToValueAtTime(f*0.82,t+dec);
  o.connect(envGain(out,t,L*0.85,dec/4)); o.stop(t+dec*1.6+0.05);
  if(p.tone > 0.05){ const n = noise(t,0.08), b = bq('bandpass',f*5,1); n.connect(b).connect(envGain(out,t,L*p.tone*0.25,0.015)); }
}; }
const V808 = {
  BD(t,p,v,pm){ const K=E.dv.d808, out=K.bdSh, f=(38+p.tune*30)*pm, dec=0.15+p.dec*1.4, L=v*p.lvl;
    const o = osc('sine',f*3.2,t); o.frequency.exponentialRampToValueAtTime(f*1.25,t+0.025); o.frequency.exponentialRampToValueAtTime(f,t+0.12);
    o.connect(envHold(out,t,L,0.012,dec/5)); o.stop(t+dec*1.4+0.1);
    if(p.tone > 0.03){ const n = noise(t,0.03), lp = bq('lowpass',1500+p.tone*5000,0.7); n.connect(lp).connect(envGain(out,t,L*p.tone*0.4,0.004)); }
    if(chAudible('d808')) duck(t); },
  SD(t,p,v,pm,out){ const f=(150+p.tune*100)*pm, dec=0.08+p.dec*0.25, L=v*p.lvl;
    [[f,0.6],[f*1.62,0.35]].forEach(([ff,a]) => { const o = osc('triangle',ff*1.15,t); o.frequency.exponentialRampToValueAtTime(ff,t+0.02); o.connect(envGain(out,t,L*a,dec*0.25)); o.stop(t+dec*2+0.05); });
    const n = noise(t,dec*3+0.05), hp = bq('highpass',1200+p.tune*800,0.7), lp = bq('lowpass',10000,0.5);
    n.connect(hp).connect(lp).connect(envGain(out,t,L*(0.2+p.tone*0.7),dec*0.4)); },
  LT: tom808(80), MT: tom808(120), HT: tom808(170),
  RS(t,p,v,pm,out){ const L=v*p.lvl, f=(1400+p.tune*900)*pm, dec=0.006+p.dec*0.02;
    const hp = bq('highpass',350,0.7); hp.connect(envGain(out,t,L*0.55,dec));
    const o = osc('triangle',f,t), o2 = osc('square',f*0.31,t), g2 = gn(0.4); o.connect(hp); o2.connect(g2).connect(hp);
    o.stop(t+dec*8+0.02); o2.stop(t+dec*8+0.02);
    if(p.tone > 0.1){ const n = noise(t,0.04), b = bq('bandpass',2500,2); n.connect(b).connect(envGain(out,t,L*p.tone*0.3,0.005)); } },
  CP(t,p,v,pm,out){ const L=v*p.lvl, tail=0.05+p.dec*0.2;
    const n = noise(t,0.05+tail*7), b = bq('bandpass',(800+p.tone*1000)*(0.8+p.tune*0.4)*pm,1.4), hp = bq('highpass',450,0.7), g = gn(0);
    g.gain.setValueAtTime(0,t);
    [0,0.010,0.021].forEach(o => { g.gain.setValueAtTime(L,t+o); g.gain.setTargetAtTime(0,t+o+0.001,0.003); });
    g.gain.setValueAtTime(L*0.9,t+0.031); g.gain.setTargetAtTime(0,t+0.032,tail/3);
    n.connect(b).connect(hp).connect(g).connect(out); },
  CB(t,p,v,pm,out){ const L=v*p.lvl, k=(0.85+p.tune*0.3)*pm, dec=0.05+p.dec*0.3;
    const b = bq('bandpass',(700+p.tone*900)*k,1.2), g = gn(0);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(L*0.7,t+0.001); g.gain.setTargetAtTime(L*0.2,t+0.001,0.01); g.gain.setTargetAtTime(0,t+0.03,dec/3);
    [540,800].forEach(f => { const o = osc('square',f*k,t); o.connect(b); o.stop(t+0.03+dec*2.5); }); b.connect(g).connect(out); },
  CY(t,p,v,pm,out){ const L=v*p.lvl, dec=0.4+p.dec*2, k=(0.85+p.tune*0.3)*pm;
    const m = metal(t,k,dec*2.5), b = bq('bandpass',7000+p.tone*3000,0.6), hp = bq('highpass',4500,0.7);
    m.connect(b).connect(hp).connect(envGain(out,t,L*0.8,dec/3.5));
    const n = noise(t,dec*2), nh = bq('highpass',7000,0.7); n.connect(nh).connect(envGain(out,t,L*0.25,dec/4)); },
  OH(t,p,v,pm,out){ const L=v*p.lvl, dec=0.12+p.dec*0.7, k=(0.9+p.tune*0.25)*pm;
    const m = metal(t,k,dec*2.5), b = bq('bandpass',10000,0.8), hp = bq('highpass',6500+p.tone*2500,0.7);
    const g = envGain(out,t,L*0.9,dec/3.5); m.connect(b).connect(hp).connect(g); E.dv.d808.oh = g; },
  CH(t,p,v,pm,out){ const L=v*p.lvl, dec=0.02+p.dec*0.08, k=(0.9+p.tune*0.25)*pm;
    choke(E.dv.d808,t);
    const m = metal(t,k,dec*8+0.05), b = bq('bandpass',10000,0.8), hp = bq('highpass',6500+p.tone*2500,0.7);
    m.connect(b).connect(hp).connect(envGain(out,t,L*0.9,dec/3)); },
};

/* ============================================================
   RC-07 Voices (digital, knackiger)
   ============================================================ */
function tom707(base){ return (t,p,v,pm,out) => {
  const L=v*p.lvl, f=base*(0.75+p.tune*0.5)*pm, dec=0.12+p.dec*0.5;
  const o = osc('triangle',f*1.7,t); o.frequency.exponentialRampToValueAtTime(f,t+0.012); o.frequency.exponentialRampToValueAtTime(f*0.88,t+dec);
  o.connect(envGain(out,t,L*0.9,dec/3.5)); o.stop(t+dec*1.6+0.05);
  const n = noise(t,0.05), b = bq('bandpass',f*6,0.8); n.connect(b).connect(envGain(out,t,L*(0.1+p.tone*0.3),0.008));
}; }
function hat707(t,p,v,pm,out,dec){
  const L=v*p.lvl, n = noise(t,dec*8+0.03), hp = bq('highpass',7500+p.tone*2500,0.7), g1 = envGain(out,t,L*0.7,dec/3);
  n.connect(hp).connect(g1);
  const m = metal(t,1.3*(0.9+p.tune*0.2)*pm,dec*8+0.03,0.12), mh = bq('highpass',8500,0.7), g2 = envGain(out,t,L*0.5,dec/3);
  m.connect(mh).connect(g2); return [g1,g2];
}
const V707 = {
  BD1(t,p,v,pm){ const K=E.dv.d707, out=K.bdSh, L=v*p.lvl, f=(45+p.tune*25)*pm, dec=0.18+p.dec*0.6;
    const o = osc('sine',f*4.5,t); o.frequency.exponentialRampToValueAtTime(f*1.1,t+0.03); o.frequency.exponentialRampToValueAtTime(f,t+0.08);
    o.connect(envHold(out,t,L,0.025,dec/4.5)); o.stop(t+dec*1.5+0.1);
    const c = osc('square',1000+p.tone*1500,t); c.connect(envGain(out,t,L*(0.1+p.tone*0.3),0.0012)); c.stop(t+0.02);
    if(chAudible('d707')) duck(t); },
  BD2(t,p,v,pm){ const K=E.dv.d707, out=K.bdSh, L=v*p.lvl, f=(50+p.tune*30)*pm, dec=0.12+p.dec*0.5;
    const o = osc('triangle',f*6,t); o.frequency.exponentialRampToValueAtTime(f,t+0.045);
    o.connect(envHold(out,t,L*1.1,0.04,dec/4)); o.stop(t+dec*1.5+0.1);
    const n = noise(t,0.02), hp = bq('highpass',3000,0.7); n.connect(hp).connect(envGain(out,t,L*(0.15+p.tone*0.35),0.002));
    if(chAudible('d707')) duck(t); },
  SD1(t,p,v,pm,out){ const L=v*p.lvl, f=(180+p.tune*90)*pm, dec=0.1+p.dec*0.25;
    const o = osc('triangle',f*1.3,t); o.frequency.exponentialRampToValueAtTime(f,t+0.03); o.connect(envGain(out,t,L*0.55,dec/4)); o.stop(t+dec*2);
    const n = noise(t,dec*2.5), b = bq('bandpass',2000+p.tone*2500,0.6); n.connect(b).connect(envGain(out,t,L*0.85,dec/3)); },
  SD2(t,p,v,pm,out){ const L=v*p.lvl, f=(230+p.tune*110)*pm, dec=0.06+p.dec*0.18;
    const o = osc('sine',f*1.2,t); o.frequency.exponentialRampToValueAtTime(f,t+0.015); o.connect(envGain(out,t,L*0.45,dec/4)); o.stop(t+dec*2);
    const n = noise(t,dec*2.5), hp = bq('highpass',3500+p.tone*2000,0.7); n.connect(hp).connect(envGain(out,t,L*0.8,dec/3)); },
  LT: tom707(95), MT: tom707(135), HT: tom707(190),
  RIM(t,p,v,pm,out){ const L=v*p.lvl, f=(1600+p.tune*800)*pm, b = bq('bandpass',f*1.3,3);
    const o = osc('square',f,t), o2 = osc('triangle',f*0.47,t); o.connect(b); o2.connect(b);
    b.connect(envGain(out,t,L*0.7,0.006+p.dec*0.012)); o.stop(t+0.1); o2.stop(t+0.1); },
  CP(t,p,v,pm,out){ const L=v*p.lvl, tail=0.04+p.dec*0.15;
    const n = noise(t,0.05+tail*7), b = bq('bandpass',(1200+p.tone*900)*(0.85+p.tune*0.3)*pm,2.2), hp = bq('highpass',700,0.7), g = gn(0);
    g.gain.setValueAtTime(0,t);
    [0,0.008,0.016,0.024].forEach(o => { g.gain.setValueAtTime(L,t+o); g.gain.setTargetAtTime(0,t+o+0.001,0.0025); });
    g.gain.setValueAtTime(L*0.85,t+0.032); g.gain.setTargetAtTime(0,t+0.033,tail/3);
    n.connect(b).connect(hp).connect(g).connect(out); },
  TB(t,p,v,pm,out){ const L=v*p.lvl, dec=0.04+p.dec*0.12;
    const n = noise(t,0.3+dec*6), hp = bq('highpass',6500,0.7), b = bq('bandpass',(9000+p.tone*3000)*(0.9+p.tune*0.2),1.2), g = gn(0);
    g.gain.setValueAtTime(0,t);
    [0,0.017,0.034].forEach((o,j) => { g.gain.setValueAtTime(L*(1-j*0.2),t+o); g.gain.setTargetAtTime(0,t+o+0.001, j===2 ? dec/3 : 0.006); });
    n.connect(hp).connect(b).connect(g).connect(out); },
  CH(t,p,v,pm,out){ choke(E.dv.d707,t); hat707(t,p,v,pm,out,0.015+p.dec*0.05); },
  OH(t,p,v,pm,out){ E.dv.d707.oh = hat707(t,p,v,pm,out,0.1+p.dec*0.5); },
  CR(t,p,v,pm,out){ const L=v*p.lvl, dec=0.6+p.dec*1.8, k=(0.9+p.tune*0.2)*pm;
    const n = noise(t,dec*2.5), hp = bq('highpass',4000,0.7); n.connect(hp).connect(envGain(out,t,L*0.55,dec/3.5));
    const m = metal(t,1.05*k,dec*2.5), b = bq('bandpass',5500+p.tone*2000,0.7); m.connect(b).connect(envGain(out,t,L*0.45,dec/4)); },
  RD(t,p,v,pm,out){ const L=v*p.lvl, dec=0.4+p.dec*1.4, k=(0.9+p.tune*0.2)*pm;
    const m = metal(t,k*1.9,dec*2.5), b = bq('bandpass',7000+p.tone*2000,1); m.connect(b).connect(envGain(out,t,L*0.55,dec/4));
    const o = osc('sine',3200*k,t); o.connect(envGain(out,t,L*0.12,dec/5)); o.stop(t+dec*1.2);
    const n = noise(t,0.2), hp = bq('highpass',9000,0.7); n.connect(hp).connect(envGain(out,t,L*0.15,0.03)); },
};

/* ============================================================
   Synth-Stimmen
   ============================================================ */
function polyVoice(out,t,f,dur,vel,P,o={}){
  const n = o.n || 2, det = P.det*35, att = expMap(P.att,0.001,2.5), dec = expMap(P.dec,0.03,3), rel = expMap(P.rel,0.02,4), sus = P.sus;
  const base = expMap(P.cut,90,14000), peak = Math.min(18000, base*Math.pow(2,P.env*6)*(o.acc?1.4:1));
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.4 + P.res*14;
  const ta = t + att, relAt = Math.max(t + dur, ta), fa = t + Math.min(att,0.5) + 0.003;
  fl.frequency.setValueAtTime(base,t); fl.frequency.linearRampToValueAtTime(peak,fa); fl.frequency.setTargetAtTime(base+(peak-base)*sus*0.4, fa, dec/3);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0,t); amp.gain.linearRampToValueAtTime(vel,ta); amp.gain.setTargetAtTime(vel*sus,ta,dec/3); amp.gain.setTargetAtTime(0,relAt,rel/4);
  const mix = gn(1/Math.sqrt(n)); mix.connect(fl); fl.connect(amp);
  if(o.pan != null){ const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan,-1,1); amp.connect(p).connect(out); } else amp.connect(out);
  const stopAt = relAt + rel*1.8 + 0.05;
  for(let i=0;i<n;i++){
    const os = ctx.createOscillator(); os.type = WAVES[P.wave] || 'sawtooth'; os.frequency.setValueAtTime(f,t);
    os.detune.value = n > 1 ? (i/(n-1)*2-1)*det : 0;
    if(o.glides) o.glides.forEach(gl => os.frequency.setTargetAtTime(gl.f, gl.at, 0.025));
    if(o.spread && n > 1){ const sp = ctx.createStereoPanner(); sp.pan.value = (i/(n-1)*2-1)*o.spread; os.connect(sp).connect(mix); } else os.connect(mix);
    os.start(t); os.stop(stopAt);
  }
}

function acidNote(t,midi,acc,slideIn,gateEnd){
  const P = S.dev.acid.params, a = E.dv.acid, f = mtof(midi);
  for(const o of [a.saw,a.sq]){ if(slideIn) o.frequency.setTargetAtTime(f,t,0.025); else o.frequency.setValueAtTime(f,t); }
  const base = expMap(P.cut,70,7000), envAmt = P.env*(acc ? 1+P.acc*0.8 : 1);
  const peak = Math.min(16000, base*Math.pow(2, 0.5+envAmt*4.5)), tc = expMap(P.dec,0.03,0.6)*(acc?0.55:1)/3;
  const lvl = acc ? 0.55 + P.acc*0.35 : 0.5;
  for(const fl of [a.f1,a.f2]){ const fp = fl.frequency;
    if(!slideIn){ fp.cancelScheduledValues(t); fp.setTargetAtTime(peak,t,0.0015); fp.setTargetAtTime(base,t+0.005,tc); }
    else if(acc){ fp.setTargetAtTime(peak*0.8,t,0.004); fp.setTargetAtTime(base,t+0.01,tc); } }
  const g = a.vca.gain;
  if(!slideIn){ g.cancelScheduledValues(t); g.setTargetAtTime(lvl,t,0.0015); } else g.setTargetAtTime(lvl,t,0.01);
  if(gateEnd) g.setTargetAtTime(0,gateEnd,0.008);
}
function acidClose(t){ const a = E.dv.acid; if(!a) return; if(a.open){ a.vca.gain.cancelScheduledValues(t); a.vca.gain.setTargetAtTime(0,t,0.01); } a.open = false; }

function ksKick(t,v,pm){
  const P = S.dev.ks.params, K = E.dv.ks, f = (36+P.ktune*28)*pm, punch = 2+P.punch*8, pt = 0.025+P.punch*0.05, dec = 0.15+P.kdec*1.1;
  const o = osc('sine',f*punch,t); o.frequency.exponentialRampToValueAtTime(f*1.15,t+pt); o.frequency.exponentialRampToValueAtTime(f,t+pt+0.1);
  o.connect(envHold(K.kickSh,t,v,0.02+dec*0.12,dec/4.5)); o.stop(t+dec*1.8+0.2);
  if(P.click > 0.02){
    const n = noise(t,0.03), hp = bq('highpass',1800,0.7); n.connect(hp).connect(envGain(K.kickSh,t,v*P.click*0.5,0.003));
    const c = osc('sine',Math.min(8000,f*punch*2.2),t); c.connect(envGain(K.kickSh,t,v*P.click*0.4,0.004)); c.stop(t+0.05);
  }
  const rd = K.rDuck.gain; rd.cancelScheduledValues(t); rd.setTargetAtTime(0.08,t,0.003); rd.setTargetAtTime(1,t+0.07,0.09);
  if(chAudible('ks')) duck(t);
}
function ksSub(t,midi,sd,glide){
  const P = S.dev.ks.params, K = E.dv.ks, f = mtof(midi), fr = K.sub.frequency;
  if(glide && P.glide > 0.02) fr.setTargetAtTime(f,t,0.004+P.glide*0.07); else fr.setValueAtTime(f,t);
  const g = K.subVca.gain; g.cancelScheduledValues(t); g.setTargetAtTime(1,t,0.003); g.setTargetAtTime(0,t+sd*(0.35+P.sdec*3.5),0.02);
}

/* ============================================================
   Step-Wiedergabe pro Gerät
   ============================================================ */
function ratchetN(fx){ return fx==='x2' ? 2 : fx==='x3' ? 3 : fx==='x4' ? 4 : 1; }
function playDrums(id,kit,V,P,i,t,sd,fx,out){
  const D = S.dev[id], n = ratchetN(fx), pm = fx==='OCT' ? 1.5 : 1, acc = P.ac[i];
  for(const [k] of kit){ if(!P.st[k][i]) continue; const v = acc ? 1 : 0.7;
    for(let r=0;r<n;r++) V[k](t+r*sd/n, D.params[k], v*Math.pow(0.82,r), pm, out); }
}
function playKS(P,i,t,sd,fx,H){
  const Pa = S.dev.ks.params, n = ratchetN(fx), pm = fx==='OCT' ? 1.5 : 1;
  if(P.k[i]) for(let r=0;r<n;r++) ksKick(t+r*sd/n, r ? 0.8 : 1, pm);
  const s = P.s[i];
  if(s.g){ const prev = P.s[(i-1+P.len)%P.len];
    const midi = degToMidi(s.d + (Pa.follow ? H.deg : 0), Pa.soct) + (fx==='OCT' ? 12 : 0);
    if(n > 1) for(let r=0;r<n;r++) ksSub(t+r*sd/n, midi, sd/n, false); else ksSub(t, midi, sd, prev.g); }
}
function playAcid(P,i,t,sd,fx,H){
  const D = S.dev.acid, Pa = D.params, s = P.n[i], len = P.len, a = E.dv.acid;
  if(!s.g){ if(a.open) acidClose(t); return; }
  const next = P.n[(i+1)%len], n = ratchetN(fx);
  const midi = degToMidi(s.d + (Pa.follow ? H.deg : 0), 2 + s.o) + Pa.tune + (fx==='OCT' ? 12 : 0);
  if(n > 1){ for(let r=0;r<n;r++){ const tt = t+r*sd/n; acidNote(tt, midi, s.a && r===0, false, tt+sd/n*0.5); } a.open = false; return; }
  const slideIn = a.open, slideOut = !!(s.s && next.g);
  acidNote(t, midi, s.a, slideIn, slideOut ? null : t + sd*(s.s ? 0.95 : 0.55));
  a.open = slideOut;
}
function playLead(P,i,t,sd,fx,H){
  const Pa = S.dev.lead.params, len = P.len, s = P.n[i];
  for(let j=1;j<len;j++){ const pj = P.n[(i-j+len)%len]; if(!pj.t) break; if(pj.g) return; }
  if(!s.g) return;
  const fol = Pa.follow ? H.deg : 0, midiOf = st => degToMidi(st.d+fol, Pa.oct+st.o) + (fx==='OCT' ? 12 : 0);
  const vel = s.a ? 0.36 : 0.26, n = ratchetN(fx), out = E.ch.lead.input;
  if(n > 1){ for(let r=0;r<n;r++) polyVoice(out, t+r*sd/n, mtof(midiOf(s)), sd/n*0.6, vel, Pa, {n:3, spread:0.4, acc:s.a}); return; }
  let k = 1; const gl = [];
  while(k < len && P.n[(i+k-1)%len].t){ const nx = P.n[(i+k)%len]; if(nx.g) gl.push({at:t+k*sd, f:mtof(midiOf(nx))}); k++; }
  polyVoice(out, t, mtof(midiOf(s)), (k-1)*sd + sd*0.7, vel, Pa, {n:3, spread:0.4, glides:gl, acc:s.a});
}
function playChords(P,i,t,sd,fx,H){
  const Pa = S.dev.chords.params, s = P.st[i];
  if(!s.g || !P.prog.length) return;
  const ci = Math.min(H.ci, P.prog.length-1);
  const vo = voiceProg(P.prog)[ci].map(m => m + 12*Pa.oct + (fx==='OCT' ? 12 : 0));
  if(Pa.bass) vo.unshift(degToMidi(P.prog[ci].d, 2));
  const n = ratchetN(fx), vel = (s.a ? 0.38 : 0.28) * 1.6 / Math.sqrt(vo.length), out = E.ch.chords.input;
  for(let r=0;r<n;r++) vo.forEach((m,j) => polyVoice(out, t+r*sd/n, mtof(m), n>1 ? sd/n*0.6 : Math.max(1,s.l)*sd*0.92, vel, Pa,
    {n:2, acc:s.a, pan: vo.length>1 ? (j/(vo.length-1)*2-1)*Pa.spread : 0}));
}
const DEVPLAY = {
  d808: (P,i,t,sd,fx) => playDrums('d808',KIT808,V808,P,i,t,sd,fx,E.ch.d808.input),
  d707: (P,i,t,sd,fx) => playDrums('d707',KIT707,V707,P,i,t,sd,fx,E.dv.d707.mix),
  ks: playKS, acid: playAcid, lead: playLead, chords: playChords,
};

function applyStepFx(id,fx,t,sd){
  if(!fx) return; const c = E.ch[id], end = t + sd*0.92;
  switch(fx){
    case 'REV': c.tRev.gain.setTargetAtTime(1,t,0.004); c.tRev.gain.setTargetAtTime(0,end,0.01); break;
    case 'DLY': c.tDly.gain.setTargetAtTime(1,t,0.004); c.tDly.gain.setTargetAtTime(0,end,0.01); break;
    case 'CRSH': { const b = S.mix.ch[id].crush; c.crWet.gain.setTargetAtTime(1,t,0.002); c.crDry.gain.setTargetAtTime(0,t,0.002);
      c.crWet.gain.setTargetAtTime(b,end,0.005); c.crDry.gain.setTargetAtTime(1-b,end,0.005); break; }
    case 'LPF': c.sLP.frequency.setTargetAtTime(450,t,0.008); c.sLP.frequency.setTargetAtTime(20000,end,0.03); break;
    case 'HPF': c.sHP.frequency.setTargetAtTime(1800,t,0.008); c.sHP.frequency.setTargetAtTime(10,end,0.03); break;
  }
}

/* ============================================================
   Clock / Sequencer
   ============================================================ */
function songBarsBefore(k){ let b = 0; for(let j=0;j<k && j<S.arr.song.length;j++){ const s = S.arr.sec[S.arr.song[j]]; if(s) b += s.bars; } return b; }
function songPos(bar){
  const sg = S.arr.song; if(!sg.length) return null;
  const total = sg.reduce((a,si) => a + (S.arr.sec[si] ? S.arr.sec[si].bars : 0), 0); if(!total) return null;
  let b = bar % total;
  for(let k=0;k<sg.length;k++){ const sec = S.arr.sec[sg[k]]; if(!sec) continue; if(b < sec.bars) return {k, si:sg[k], sec, bar:b, bars:sec.bars}; b -= sec.bars; }
  return null;
}
function advance(D,R){
  if(D.chainOn && D.chain.length){ R.ci = (R.ci+1) % D.chain.length; R.part = D.chain[R.ci]; }
  else if(R.queued !== null){ R.part = R.queued; R.queued = null; }
}
function scheduleStep(g,t,sd){
  const sib = g % 16, songInfo = S.songMode ? songPos(Math.floor(g/16)) : null, pos = {};
  for(const id of DEV_IDS){
    const D = S.dev[id], R = RT[id];
    if(songInfo){ const part = songInfo.sec.p[id] ?? -1; pos[id] = {part, i: part>=0 ? (songInfo.bar*16 + sib) % D.parts[part].len : 0}; }
    else {
      if(R.pos >= (R.part>=0 ? D.parts[R.part].len : 16)){ R.pos = 0; advance(D,R); }
      pos[id] = {part:R.part, i:R.pos}; R.pos++;
    }
  }
  // Harmonie (vom CH-5)
  const cd = S.dev.chords, cpi = pos.chords.part >= 0 ? pos.chords.part : cd.edit, cp = cd.parts[cpi];
  const el = songInfo ? songInfo.bar*16 + sib : g;
  const ci = cp.prog.length ? Math.floor(el / (16*(cp.bpc||1))) % cp.prog.length : 0;
  const H = {deg: cp.prog.length ? cp.prog[ci].d : 0, ci, cpi};
  // Live-Roll (Beat-Repeat)
  let play = pos;
  if(E.roll){
    if(!E.roll.anchor){ E.roll.anchor = JSON.parse(JSON.stringify(pos)); E.roll.g0 = g; }
    const k = (g - E.roll.g0) % E.roll.len; play = {};
    for(const id of DEV_IDS){ const a = E.roll.anchor[id];
      play[id] = a.part < 0 ? a : {part:a.part, i:(a.i + k) % S.dev[id].parts[a.part].len}; }
  }
  for(const id of DEV_IDS){
    const {part,i} = play[id];
    if(part < 0){ if(id==='acid') acidClose(t); continue; }
    const P = S.dev[id].parts[part];
    let fx = P.fx[i]; if(E.roll && E.roll.r32) fx = 'x2';
    try { applyStepFx(id,fx,t,sd); DEVPLAY[id](P,i,t,sd,fx,H); } catch(e){ console.error(id, e); }
  }
  E.q.push({t, g, pos, song:songInfo, H});
  if(E.q.length > 96) E.q.shift();
}

let worker = null;
function tick(){
  if(!E.playing) return;
  const now = ctx.currentTime;
  if(E.nextT < now - 0.25) E.nextT = now + 0.02;
  while(E.nextT < now + 0.12){
    const sd = 60/S.bpm/4, sw = (E.g % 2) ? S.swing*0.45*sd : 0;
    scheduleStep(E.g, E.nextT + sw, sd); E.nextT += sd; E.g++;
  }
}
try {
  worker = new Worker(URL.createObjectURL(new Blob(['let i=null;onmessage=e=>{clearInterval(i);if(e.data)i=setInterval(()=>postMessage(0),20)}'],{type:'text/javascript'})));
  worker.onmessage = tick;
} catch(e){ worker = null; }
function timerOn(){ if(worker) worker.postMessage(1); else E.timer = setInterval(tick,20); }
function timerOff(){ if(worker) worker.postMessage(0); else clearInterval(E.timer); }

function startPlay(){
  if(!ctx || E.playing) return;
  ctx.resume();
  E.playing = true;
  E.g = S.songMode ? songBarsBefore(S.songStart)*16 : 0;
  E.nextT = ctx.currentTime + 0.08; E.q = []; E.cur = null; E.dv.acid.open = false;
  DEV_IDS.forEach(id => { const D = S.dev[id]; RT[id] = {pos:0, ci:0, part:(D.chainOn && D.chain.length) ? D.chain[0] : D.play, queued:null}; });
  timerOn();
}
function stopPlay(){
  if(!ctx) return;
  E.playing = false; timerOff();
  const now = ctx.currentTime; acidClose(now);
  const g = E.dv.ks.subVca.gain; g.cancelScheduledValues(now); g.setTargetAtTime(0,now,0.02);
  E.q = []; E.cur = null; E.roll = null;
}

/* ---------- Live-Performance ---------- */
function liveWash(on){ E.live.wash = on; const now = ctx.currentTime;
  DEV_IDS.forEach(id => E.ch[id].sHall.gain.setTargetAtTime(on ? 0.85 : S.mix.ch[id].hall, now, on ? 0.15 : 0.3));
  E.M.fxHP.frequency.setTargetAtTime(on ? 700 : 10, now, on ? 0.6 : 0.25); }
function liveEcho(on){ const now = ctx.currentTime; DEV_IDS.forEach(id => E.ch[id].tDly.gain.setTargetAtTime(on ? 0.9 : 0, now, 0.01)); }
function liveRoll(len,on,r32){ E.roll = on ? {len, r32, anchor:null} : null; }
function liveKill(on){ E.M.killHP.frequency.setTargetAtTime(on ? 320 : 10, ctx.currentTime, 0.02); }
function liveRiser(on){
  const now = ctx.currentTime;
  if(on){ if(E.riser) return;
    const n = ctx.createBufferSource(); n.buffer = E.noise; n.loop = true;
    const b = bq('bandpass',300,3), g = gn(0);
    g.gain.setValueAtTime(0,now); g.gain.setTargetAtTime(0.35,now,1.5);
    b.frequency.setValueAtTime(300,now); b.frequency.exponentialRampToValueAtTime(9000,now+8);
    n.connect(b).connect(g); g.connect(E.M.in); g.connect(E.bus.hall.in); n.start(now);
    E.riser = {n,g};
  } else if(E.riser){ const {n,g} = E.riser; g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0,now,0.3); n.stop(now+2); E.riser = null; }
}
