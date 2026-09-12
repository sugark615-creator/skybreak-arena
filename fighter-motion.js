// A small skinned canvas mesh lets the existing illustrations move at their
// shoulders, hips and knees without changing gameplay collision boxes.
const smooth = (a,b,x) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function airPose(f){
  const airborne=f.grounded?0:smooth(0,.10,f.airTime||0);
  const rise=smooth(-70,-Math.max(250,f.jump||700),f.vy||0);
  const fall=smooth(30,500,f.vy||0);
  const apex=1-smooth(50,280,Math.abs(f.vy||0));
  const launch=Math.sin(Math.PI*Math.max(0,Math.min(1,(f.launchTimer||0)/.18)));
  return {airborne,rise,fall,apex,launch};
}
export function poseVertex(u,v,f) {
  const phase=f.motionPhase||0, facing=f.spriteFacing||1;
  const air=airPose(f);
  const run=Math.min(1,Math.abs(f.vx||0)/220)*(f.grounded?1:1-air.airborne);
  const side=u<.5?-1:1, front=side===facing;
  const stride=Math.sin(phase)*side*run;
  const leg=smooth(f.key==='kirby'?.72:.55,.96,v), arm=(1-smooth(.55,.68,v))*smooth(.30,.44,v)*smooth(.15,.38,Math.abs(u-.5));
  const head=1-smooth(.18,.35,v);
  let x=u,y=v;
  x+=leg*stride*.10;
  y-=leg*Math.max(0,stride)*.10;
  x-=arm*stride*.075;
  y+=arm*Math.cos(phase)*side*run*.035;
  x+=head*Math.sin(phase*.7)*.009;
  y+=arm*Math.sin(phase*1.5)*.012;
  if(!f.grounded||f.landTimer>0){
    const settle=f.grounded?(f.landTimer||0)/.2:0;
    const tuck=air.airborne*(.28+.42*air.rise+.55*air.apex)+settle*.2;
    // Bring knees inward, then extend feet as the fighter descends.
    x-=leg*side*.045*tuck;
    y-=leg*(front?.075:.12)*tuck;
    x+=arm*side*.026*air.fall*air.airborne;
    y-=arm*(.045*air.rise+.025*air.apex)*air.airborne;
  }
  if(f.guard){x-=arm*side*.075;y-=arm*.055;y+=leg*.025;}
  if(f.attackTimer>0){
    const p=1-f.attackTimer/f.attackDuration;
    const strike=Math.sin(Math.PI*smooth(0,.85,p));
    const windup=Math.sin(Math.PI*smooth(0,.2,p))*(p<.2?1:0);
    if(f.comboStep===2){
      x+=leg*(front?1:.15)*facing*strike*.17;
      y-=leg*(front?1:.1)*strike*.19;
      x-=arm*facing*strike*.05;
    } else {
      x+=arm*(front?1:.25)*facing*(strike*.19-windup*.055);
      y-=arm*(front?1:.15)*strike*(f.comboStep===3?.24:.035);
    }
    x+=Math.sin(v*Math.PI)*facing*strike*.025;
  }
  if(f.specialTimer>0){const pulse=Math.sin((1-f.specialTimer/f.specialDuration)*Math.PI);x+=arm*facing*pulse*.17;y-=arm*pulse*.045;}
  if(f.stun>0){x-=head*facing*.055;y-=arm*.04;}
  return [x,y];
}

const surfaces=new WeakMap();
const textures=new WeakMap();
export function drawAnimatedSprite(ctx,f){
  if(!f.sprite.naturalWidth)return;
  const h=f.height*1.13,w=h*f.sprite.naturalWidth/f.sprite.naturalHeight;
  let surface=surfaces.get(f);
  const size=Math.ceil(Math.max(w,h)*2);
  if(!surface||surface.size!==size){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=Math.ceil(size*1.5);
    surface={canvas,ctx:canvas.getContext('2d'),size};surfaces.set(f,surface);
  }
  const c=surface.ctx,s=surface.canvas.width/size;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,surface.canvas.width,surface.canvas.height);
  c.setTransform(s,0,0,s,surface.canvas.width/2,surface.canvas.height/2);
  drawMesh(c,f);
  // Flash/glow is composited once, never once for every triangle.
  ctx.drawImage(surface.canvas,-size/2,-size/2,size,size);
}
function drawMesh(ctx,f){
  const img=f.sprite,sw=img.naturalWidth,sh=img.naturalHeight;
  if(!sw)return;
  const h=f.height*1.13,w=h*sw/sh,top=f.height/2-h;
  let texture=textures.get(img);
  if(!texture){texture=document.createElement('canvas');texture.width=320;texture.height=Math.round(320*sh/sw);texture.getContext('2d').drawImage(img,0,0,texture.width,texture.height);textures.set(img,texture);}
  const cols=6,rows=10,points=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const u=i/cols,v=j/rows,[x,y]=poseVertex(u,v,f);
    points.push({sx:u*sw,sy:v*sh,x:x*w-w/2,y:y*h+top});
  }
  const triangle=(a,b,c)=>{
    const den=a.sx*(b.sy-c.sy)+b.sx*(c.sy-a.sy)+c.sx*(a.sy-b.sy);
    const affine=(key)=>[(a[key]*(b.sy-c.sy)+b[key]*(c.sy-a.sy)+c[key]*(a.sy-b.sy))/den,
      (a[key]*(c.sx-b.sx)+b[key]*(a.sx-c.sx)+c[key]*(b.sx-a.sx))/den,
      (a[key]*(b.sx*c.sy-c.sx*b.sy)+b[key]*(c.sx*a.sy-a.sx*c.sy)+c[key]*(a.sx*b.sy-b.sx*a.sy))/den];
    const [aa,cc,ee]=affine('x'),[bb,dd,ff]=affine('y');
    ctx.save();ctx.beginPath();
    const cx=(a.x+b.x+c.x)/3,cy=(a.y+b.y+c.y)/3;
    // Slight overlap hides antialias seams between neighbouring triangles.
    for(const [i,p] of [a,b,c].entries()){const dx=p.x-cx,dy=p.y-cy,l=Math.hypot(dx,dy)||1;ctx[i?'lineTo':'moveTo'](p.x+dx/l*.35,p.y+dy/l*.35);}
    ctx.closePath();ctx.clip();ctx.transform(aa,bb,cc,dd,ee,ff);ctx.drawImage(texture,0,0,sw,sh);ctx.restore();
  };
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const n=j*(cols+1)+i,a=points[n],b=points[n+1],c=points[n+cols+1],d=points[n+cols+2];
    triangle(a,b,c);triangle(b,d,c);
  }
}
