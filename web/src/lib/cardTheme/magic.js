// Частицы над карточкой игрока и поворот портрета: перенос из reference/randomizer-v5.17.html, строки 4930–4934, 4969–4978, 5003–5126.
// Отличия («// ZG:»): холст создаётся при mountMagic и убирается при unmount; звук не переносится (в артефакте выключен);
// «уменьшить движение» — из prefers-reduced-motion (в артефакте ещё переключатель «Эффекты»).
/* eslint-disable */
import {FALLBACK_COLORS,magicFamily} from './engine.js';

const MG={cv:null,ctx:null,dpr:1,w:0,h:0,raf:0,last:0,P:[],B:[],R:[],card:null,theme:"",fam:null,col:null,visible:true,io:null,inited:false,spin:null,taps:0,draws:0};
const mgR=Math.random;                                     // cosmetic only
// ZG: в артефакте state.fx.reduced (системная настройка или выключенные «Эффекты»).
const mgReduced=()=>{try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return false}};
const mgMobile=()=>{try{return Math.min(innerWidth,screen.width||innerWidth)<700}catch(e){return true}};
const sndPlip=()=>{};                                      // ZG: звука нет
function mgFit(){
  if(!MG.cv)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=document.documentElement.clientWidth||innerWidth,h=innerHeight;
  if(w!==MG.w||h!==MG.h||dpr!==MG.dpr){MG.w=w;MG.h=h;MG.dpr=dpr;MG.cv.width=Math.round(w*dpr);MG.cv.height=Math.round(h*dpr);MG.cv.style.width=w+"px";MG.cv.style.height=h+"px"}
}
function mgColors(card){
  const cs=getComputedStyle(card),g=k=>(cs.getPropertyValue(k)||"").trim();
  const fb=FALLBACK_COLORS.light;
  return {a:g("--ct-accent")||fb.accent,b:g("--ct-accent2")||g("--ct-accent")||fb.accent,ink:g("--ct-hink")||g("--ct-ink")||fb.fg,m:g("--ct-muted")||fb.muted};
}
const mgAmbientOn=()=>!mgReduced()&&!!MG.ctx;
function mgKick(){
  if(!MG.ctx||!MG.card||MG.raf||document.hidden||!MG.visible)return;
  if(!mgAmbientOn()&&!MG.R.length&&!MG.B.length)return;
  MG.last=0;MG.raf=requestAnimationFrame(mgFrame);
}
function mgStop(){if(MG.raf){cancelAnimationFrame(MG.raf);MG.raf=0}}

/* particles: kind-specific spawn, motion and look; screen space for the ambience, card space for bursts */
function mgSpawn(k,L,T,W,H,burst){
  const p={k,x:L+mgR()*W,y:T+mgR()*H,vx:0,vy:0,r:1,a:.5,life:0,max:8+mgR()*8,ph:mgR()*6.28,rot:mgR()*6.28,c:"a"};
  switch(k){
    case "dust":p.r=.6+mgR()*1.2;p.vx=(mgR()-.5)*8;p.vy=(mgR()-.5)*6;p.a=.18+mgR()*.2;p.c="ink";break;
    case "mote":p.r=1+mgR()*1.4;p.vx=(mgR()-.5)*6;p.vy=-6-mgR()*10;p.a=.22+mgR()*.22;p.y=burst?p.y:T+H*(.3+mgR()*.7);break;
    case "spore":p.r=1.4+mgR()*2;p.vx=(mgR()-.5)*8;p.vy=-3-mgR()*5;p.a=.28+mgR()*.2;break;
    case "snow":p.r=1+mgR()*1.8;p.vx=(mgR()-.5)*8;p.vy=12+mgR()*14;p.a=.45;p.c="ink";break;
    case "ash":p.r=1.2+mgR()*1.8;p.vx=6+mgR()*10;p.vy=8+mgR()*10;p.a=.3+mgR()*.2;p.c="m";break;
    case "rain":p.r=10+mgR()*10;p.vx=-60;p.vy=320+mgR()*140;p.a=.22+mgR()*.18;p.c="b";p.max=3;break;
    case "spark":p.r=1+mgR()*1.2;p.vx=(mgR()-.5)*30;p.vy=-30-mgR()*40;p.a=.8;p.max=1.2+mgR()*1.4;p.y=burst?p.y:T+H*(.5+mgR()*.5);break;
    case "ember":p.r=1.2+mgR()*1.6;p.vx=(mgR()-.5)*12;p.vy=-14-mgR()*18;p.a=.6;p.c=mgR()<.5?"a":"b";p.max=3+mgR()*4;p.y=burst?p.y:T+H*(.4+mgR()*.6);break;
    case "pixel":p.r=2+Math.floor(mgR()*2)*1.5;p.vx=0;p.vy=-8-mgR()*10;p.a=.35;p.c=mgR()<.5?"a":"b";break;
    case "petal":p.r=3+mgR()*2.5;p.vx=10+mgR()*14;p.vy=14+mgR()*12;p.a=.4;break;
    case "bubble":p.r=2+mgR()*4;p.vx=(mgR()-.5)*4;p.vy=-10-mgR()*14;p.a=.35;p.c="ink";break;
    case "star":p.r=.6+mgR()*1.2;p.vx=(mgR()-.5)*2;p.vy=(mgR()-.5)*2;p.a=.5;p.c="ink";break;
    case "comic":p.r=2.5+mgR()*2;p.vx=(mgR()-.5)*10;p.vy=-4-mgR()*8;p.a=.45;p.c="b";break;
  }
  if(burst){const t=mgR()*6.28,s=60+mgR()*120;p.vx=Math.cos(t)*s;p.vy=Math.sin(t)*s;p.max=.5+mgR()*.5;p.a=Math.min(.85,p.a+.3);if(k==="rain")p.r=6}
  return p;
}
function mgDraw(ctx,p,x,y,al){
  const col=MG.col[p.c]||MG.col.a;
  ctx.globalAlpha=Math.max(0,Math.min(1,al));
  switch(p.k){
    case "rain":ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+p.vx*p.r/p.vy,y-p.r);ctx.stroke();break;
    case "pixel":ctx.fillStyle=col;ctx.fillRect(Math.round(x),Math.round(y),p.r,p.r);break;
    case "ash":ctx.fillStyle=col;ctx.save();ctx.translate(x,y);ctx.rotate(p.rot);ctx.fillRect(-p.r,-p.r*.5,p.r*2,p.r);ctx.restore();break;
    case "petal":ctx.fillStyle=col;ctx.save();ctx.translate(x,y);ctx.rotate(p.rot);ctx.beginPath();ctx.ellipse(0,0,p.r,p.r*.45,0,0,6.283);ctx.fill();ctx.restore();break;
    case "bubble":ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,p.r,0,6.283);ctx.stroke();break;
    case "comic":{ctx.fillStyle=col;ctx.save();ctx.translate(x,y);ctx.rotate(p.rot);ctx.beginPath();for(let i=0;i<8;i++){const rr=i%2?p.r*.4:p.r,t=i*Math.PI/4;ctx.lineTo(Math.cos(t)*rr,Math.sin(t)*rr)}ctx.closePath();ctx.fill();ctx.restore();break}
    case "mote":case "ember":case "spark":case "spore":{
      const gr=ctx.createRadialGradient(x,y,0,x,y,p.r*2.6);gr.addColorStop(0,col);gr.addColorStop(1,"rgba(0,0,0,0)");
      ctx.globalAlpha*=.6;ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,p.r*2.6,0,6.283);ctx.fill();ctx.globalAlpha/=.6;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,p.r*.5,0,6.283);ctx.fill();break}
    default:ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,p.r,0,6.283);ctx.fill();
  }
}
function mgFrame(ts){
  MG.raf=0;
  if(!MG.card||!MG.card.isConnected||!MG.ctx){if(MG.card&&!MG.card.isConnected)MG.card=null;return}
  const dt=Math.min(.05,MG.last?(ts-MG.last)/1000:.016);MG.last=ts;
  mgFit();                                                 // size check per frame (no extra resize listener)
  const ctx=MG.ctx,r=MG.card.getBoundingClientRect();
  ctx.setTransform(MG.dpr,0,0,MG.dpr,0,0);ctx.clearRect(0,0,MG.w,MG.h);
  const L=Math.max(0,r.left),T=Math.max(0,r.top),Rr=Math.min(MG.w,r.right),Bt=Math.min(MG.h,r.bottom),W=Rr-L,H=Bt-T;
  if(W<=0||H<=0){MG.visible=false;return}
  ctx.save();ctx.beginPath();ctx.rect(L,T,W,H);ctx.clip();
  /* ambience (screen space, inside the visible part of the card) */
  if(mgAmbientOn()){
    const want=Math.round((mgMobile()?14:34)*(MG.fam.p==="rain"?1.6:1));
    while(MG.P.length<want)MG.P.push(mgSpawn(MG.fam.p,L,T,W,H,false));
    for(let i=MG.P.length-1;i>=0;i--){
      const p=MG.P[i];p.life+=dt;p.ph+=dt*1.7;p.rot+=dt*.8;
      p.x+=(p.vx+Math.sin(p.ph)*(p.k==="rain"?0:4))*dt;p.y+=p.vy*dt;
      const out=p.x<L-12||p.x>Rr+12||p.y<T-24||p.y>Bt+24;
      if(out||p.life>p.max){MG.P[i]=mgSpawn(MG.fam.p,L,T,W,H,false);const q=MG.P[i];if(q.vy>20)q.y=T-8;else if(q.vy<-5)q.y=Bt+6;continue}
      const fade=Math.min(1,p.life/.6,(p.max-p.life)/.8),tw=p.k==="star"?(.55+.45*Math.sin(p.ph*2)):1;
      mgDraw(ctx,p,p.x,p.y,p.a*fade*tw);
    }
  }else MG.P=[];
  /* tap bursts and ripples (card space, so they stay at the touch point while scrolling) */
  for(let i=MG.B.length-1;i>=0;i--){
    const p=MG.B[i];p.life+=dt;if(p.life>p.max){MG.B.splice(i,1);continue}
    p.vx*=1-dt*2.4;p.vy=p.vy*(1-dt*2.4)+30*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=dt*3;
    mgDraw(ctx,p,r.left+p.x,r.top+p.y,p.a*(1-p.life/p.max));
  }
  const now=performance.now();
  for(let i=MG.R.length-1;i>=0;i--){
    const q=MG.R[i],t=(now-q.t0)/q.dur;if(t>=1){MG.R.splice(i,1);continue}
    const x=r.left+q.x,y=r.top+q.y;
    if(t<.45||q.soft){                                  // short glow at the touch point
      const gt=q.soft?t:t/.45,gr=ctx.createRadialGradient(x,y,0,x,y,q.max*(q.soft?.55:.35));
      gr.addColorStop(0,MG.col.a);gr.addColorStop(1,"rgba(0,0,0,0)");ctx.globalAlpha=(1-gt)*(q.soft?.28:.32);ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,q.max*(q.soft?.55:.35),0,6.283);ctx.fill();
    }
    if(!q.soft)for(let k=0;k<3;k++){                    // three concentric rings, staggered like a drop on water
      const tk=(t-k*.14)/(1-k*.14);if(tk<=0)continue;
      const e=1-Math.pow(1-tk,3);
      ctx.globalAlpha=(1-tk)*(.8-k*.2);ctx.strokeStyle=MG.col.a;ctx.lineWidth=Math.max(.6,2.4*(1-tk));
      ctx.beginPath();ctx.arc(x,y,4+e*q.max*(1-k*.12),0,6.283);ctx.stroke();
    }
    MG.draws++;
  }
  ctx.restore();ctx.globalAlpha=1;
  if(MG.cv)MG.cv.dataset.draws=String(MG.draws);
  if((mgAmbientOn()||MG.R.length||MG.B.length)&&MG.visible&&!document.hidden)MG.raf=requestAnimationFrame(mgFrame);
  else ctx.clearRect(0,0,MG.w,MG.h);
}
/* every pointerdown on the card: a ripple (soft highlight when reduced), a particle burst, the water drop */
function magicTap(e){
  if(!MG.card||!e||!e.target||!MG.card.contains(e.target))return;
  const r=MG.card.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,red=mgReduced();
  MG.R.push({x,y,t0:performance.now(),dur:red?450:950,max:mgMobile()?110:150,soft:red});
  if(MG.R.length>8)MG.R.shift();
  if(!red){const n=mgMobile()?8:14;for(let i=0;i<n;i++)MG.B.push(mgSpawn(MG.fam.p,x,y,0,0,true));if(MG.B.length>80)MG.B.splice(0,MG.B.length-80)}
  MG.taps++;
  if(MG.cv)MG.cv.dataset.taps=String(MG.taps);
  sndPlip();
  mgKick();
}
/* portrait spin: rotateY 360° with overshoot and bounce (~900 ms); a tap during a spin queues exactly one more. Reduced: a pulse. */
function magicSpin(btn){
  const el=btn&&btn.firstElementChild;
  if(!el||!el.animate)return;
  if(MG.spin&&MG.spin.el===el&&MG.spin.busy){MG.spin.queued=true;return}
  const red=mgReduced(),st=MG.spin={el,busy:true,queued:false};
  btn.classList.add(red?"pulsing":"spinning");
  btn.dataset.spins=String((+btn.dataset.spins||0)+1);
  const anim=red
    ?el.animate([{opacity:1,transform:"scale(1)"},{opacity:.6,transform:"scale(1.06)"},{opacity:1,transform:"scale(1)"}],{duration:520,easing:"ease-in-out"})
    :el.animate([{transform:"rotateY(0deg)"},{transform:"rotateY(392deg)",offset:.62},{transform:"rotateY(346deg)",offset:.8},{transform:"rotateY(364deg)",offset:.92},{transform:"rotateY(360deg)"}],{duration:900,easing:"cubic-bezier(.25,.7,.35,1)"});
  anim.onfinish=anim.oncancel=()=>{
    st.busy=false;btn.classList.remove("spinning","pulsing");
    if(st.queued&&el.isConnected){st.queued=false;magicSpin(btn)}
  };
}

const onVisibility=()=>{if(document.hidden)mgStop();else mgKick()};

// ZG: вместо magicInit + magicAfterRender: смонтировать на карточку темы th (жанр genre для частиц), вернуть функцию размонтирования.
export function mountMagic(card,th,genre){
  if(!MG.cv){
    try{const cv=document.createElement("canvas");cv.id="magic";cv.setAttribute("aria-hidden","true");document.body.appendChild(cv);MG.cv=cv;MG.ctx=cv.getContext("2d")}
    catch(e){MG.cv=null;MG.ctx=null}
  }
  const changed=th!==MG.theme;
  MG.card=card;MG.theme=th;MG.fam=magicFamily(th,genre);
  try{MG.col=mgColors(card)}catch(e){MG.col={a:"#1f7a4d",b:"#9a6a12",ink:"#1d241c",m:"#5d6a5a"}}
  if(changed)MG.P=[];
  if(MG.cv)MG.cv.hidden=false;
  try{
    if(!MG.io&&window.IntersectionObserver)MG.io=new IntersectionObserver(es=>{for(const e of es)MG.visible=e.isIntersecting;if(MG.visible)mgKick();else mgStop()});
    if(MG.io){MG.io.disconnect();MG.io.observe(card)}
  }catch(e){}
  card.addEventListener("pointerdown",magicTap,{passive:true});
  document.addEventListener("visibilitychange",onVisibility);
  mgFit();mgKick();
  return ()=>{
    card.removeEventListener("pointerdown",magicTap);
    document.removeEventListener("visibilitychange",onVisibility);
    if(MG.card!==card)return;
    mgStop();MG.card=null;MG.P=[];MG.B=[];MG.R=[];MG.theme="";
    try{if(MG.io)MG.io.disconnect()}catch(e){}
    if(MG.cv){MG.cv.remove();MG.cv=null;MG.ctx=null;MG.w=0;MG.h=0}
  };
}
export {magicSpin};
