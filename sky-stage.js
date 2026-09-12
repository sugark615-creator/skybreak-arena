// Original sky sanctuary artwork. Static scenery is painted only once.
let backdrop,stage,stageKey;
function layer(){const c=document.createElement('canvas');c.width=1600;c.height=900;return c;}
function polygon(c,points,color){c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();c.fill();}
function cloud(c,x,y,size,alpha){
  c.save();c.translate(x,y);c.scale(size,size);c.fillStyle=`rgba(255,255,255,${alpha})`;
  c.beginPath();c.ellipse(0,0,110,18,0,0,Math.PI*2);c.ellipse(-40,-12,45,26,0,0,Math.PI*2);c.ellipse(13,-20,55,38,0,0,Math.PI*2);c.ellipse(60,-8,43,23,0,0,Math.PI*2);c.fill();c.restore();
}
function island(c,x,y,s){
  c.save();c.translate(x,y);c.scale(s,s);
  polygon(c,[[-130,0],[-105,40],[-68,60],[-36,135],[8,91],[37,112],[66,55],[108,40],[133,0]],'#668c96');
  polygon(c,[[-90,12],[-35,129],[9,88],[-10,20]],'#4f7485');
  polygon(c,[[18,14],[36,106],[70,40],[118,12]],'#a8b7a1');
  polygon(c,[[-133,0],[-90,-15],[70,-12],[133,0],[84,16],[-76,17]],'#96bf91');
  c.fillStyle='#d6dcc3';c.fillRect(-35,-78,15,73);c.fillRect(26,-94,15,88);
  polygon(c,[[-49,-80],[54,-96],[53,-83],[-49,-67]],'#e8e5cd');
  c.fillStyle='rgba(214,249,255,.7)';c.fillRect(68,12,7,170);c.fillStyle='rgba(239,255,255,.7)';c.fillRect(70,12,2,150);
  c.restore();
}
function paintBackground(){
  const c=backdrop.getContext('2d'),sky=c.createLinearGradient(0,0,0,900);
  sky.addColorStop(0,'#347fbb');sky.addColorStop(.43,'#94d3e5');sky.addColorStop(.75,'#e7efda');sky.addColorStop(1,'#83bcc5');c.fillStyle=sky;c.fillRect(0,0,1600,900);
  const sun=c.createRadialGradient(1120,160,15,1120,160,410);sun.addColorStop(0,'rgba(255,251,210,.92)');sun.addColorStop(.18,'rgba(255,248,216,.38)');sun.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=sun;c.fillRect(600,0,1000,630);
  for(let k=0;k<4;k++){
    const pts=[[-80,900]];
    for(let i=0;i<19;i++){const x=i*98-60;const y=455+k*68-Math.sin(i*1.7+k)*65-Math.cos(i*.8+k)*45;pts.push([x,y]);}
    pts.push([1700,900]);polygon(c,pts,['#afccd0','#94babe','#7da9ab','#659894'][k]);
  }
  const haze=c.createLinearGradient(0,390,0,860);haze.addColorStop(0,'rgba(236,250,245,0)');haze.addColorStop(1,'rgba(225,245,231,.9)');c.fillStyle=haze;c.fillRect(0,390,1600,510);
  island(c,230,374,.66);island(c,1340,300,.80);island(c,890,454,.35);
  for(let i=0;i<11;i++)cloud(c,(i*263)%1770-80,490+(i%4)*72,1.1+(i%3)*.4,.24);
  // Tiny distant birds make the scale legible without cluttering combat.
  c.strokeStyle='#5f92aa';c.lineWidth=2;
  for(let i=0;i<5;i++){const x=510+i*22,y=245+Math.abs(i-2)*9;c.beginPath();c.moveTo(x-6,y+3);c.quadraticCurveTo(x-3,y-3,x,y);c.quadraticCurveTo(x+3,y-3,x+6,y+3);c.stroke();}
}
export function drawSkyBackground(ctx,time){
  if(!backdrop){backdrop=layer();paintBackground();}ctx.drawImage(backdrop,0,0);
  ctx.save();ctx.beginPath();ctx.rect(0,0,1600,900);ctx.clip();
  for(let i=0;i<5;i++){const x=((i*397+time*.004*(1+i*.12))%1940)-170;cloud(ctx,x,110+(i%3)*91,.6+i*.11,.25);}
  ctx.restore();
}
export function drawSkyPlatforms(ctx,platforms){
  const key=JSON.stringify(platforms);
  if(!stage||stageKey!==key){
    stage=layer();stageKey=key;const c=stage.getContext('2d');
    for(const p of platforms){const {x,y,width:w}=p;
      const rock=c.createLinearGradient(0,y,0,y+250);rock.addColorStop(0,'#647976');rock.addColorStop(.5,'#374d59');rock.addColorStop(1,'#263c4d');
      polygon(c,[[x+8,y+29],[x+w-8,y+29],[x+w-70,y+95],[x+w*.80,y+114],[x+w*.70,y+198],[x+w*.58,y+158],[x+w*.47,y+255],[x+w*.36,y+182],[x+w*.18,y+137],[x+55,y+105]],rock);
      polygon(c,[[x+w*.15,y+52],[x+w*.37,y+74],[x+w*.47,y+250],[x+w*.32,y+143]],'#435c63');
      polygon(c,[[x+w*.52,y+64],[x+w*.73,y+60],[x+w*.70,y+190],[x+w*.59,y+146]],'#6b7e7a');
      polygon(c,[[x+w*.83,y+45],[x+w-30,y+40],[x+w-75,y+96],[x+w*.77,y+115]],'#8a9690');
      c.fillStyle='#c2b796';c.fillRect(x,y,w,33);
      c.fillStyle='#777f72';c.fillRect(x,y+28,w,12);
      c.fillStyle='#ede2bb';c.fillRect(x+5,y+3,w-10,5);
      c.strokeStyle='#928d79';c.lineWidth=2;
      for(let xx=x+40;xx<x+w;xx+=90){c.beginPath();c.moveTo(xx,y+9);c.lineTo(xx-12,y+28);c.stroke();}
      c.fillStyle='#79a45f';c.fillRect(x+4,y-2,w-8,4);
      // Central inlaid crest, with a worn stone rather than neon finish.
      const mid=x+w/2;c.fillStyle='#5e897b';c.fillRect(mid-110,y+9,220,16);c.strokeStyle='#e9d395';c.lineWidth=2;
      c.beginPath();c.moveTo(mid-85,y+17);c.lineTo(mid+85,y+17);c.stroke();
      polygon(c,[[mid,y+7],[mid+18,y+17],[mid,y+27],[mid-18,y+17]],'#efdeb2');
      for(let i=0;i<23;i++){const xx=x+20+i*(w-40)/22;const yy=y+42+(i%3)*7;c.fillStyle=i%2?'#537948':'#759455';c.fillRect(xx,yy,18+(i%4)*7,6);}
      for(const edge of [x+7,x+w-23]){c.fillStyle='#ddcfaa';c.fillRect(edge,y-8,16,46);c.fillStyle='#90b982';c.fillRect(edge-3,y-11,22,5);}
    }
  }
  ctx.drawImage(stage,0,0);
}
