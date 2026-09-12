// Authored poses, not a deformed mesh. Texture preparation runs once at load.
const sheets={};
export async function loadPoseSheets(urls){
  await Promise.all(Object.entries(urls).map(async([key,url])=>{
    const grid=typeof url==='object'&&url.grid;
    const image=new Image();image.src=typeof url==='object'?url.src:url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data;
    // Native transparent sheets retain their color and alpha; only legacy
    // magenta-backed sheets need chroma-key removal.
    const alphaThreshold=grid?10:50;
    // Chroma-key import: preserve the art and remove the magenta backing.
    if(!grid)for(let i=0;i<d.length;i+=4){
      const distance=Math.max(255-d[i],d[i+1],255-d[i+2]);
      if(distance<115){
        const alpha=Math.max(0,Math.min(1,(distance-30)/85));
        if(alpha>0){d[i]=Math.max(0,(d[i]-255*(1-alpha))/alpha);d[i+2]=Math.max(0,(d[i+2]-255*(1-alpha))/alpha);}
        d[i+3]=Math.round(d[i+3]*alpha);
      }
    }
    ctx.putImageData(pixels,0,0);
    const cw=canvas.width/4,ch=canvas.height/3,frames=Array(12).fill(null);
    const total=canvas.width*canvas.height,seen=new Uint8Array(total),queue=new Int32Array(total),labels=new Int32Array(total),width=canvas.width;
    let component=0;
    // Find whole figures, so a raised fist crossing a nominal cell boundary
    // remains attached to its own pose instead of leaking into another frame.
    for(let start=0;start<total;start++){
      if(seen[start]||d[start*4+3]<alphaThreshold)continue;
      let head=0,tail=1,left=width,right=0,top=canvas.height,bottom=0,sumX=0,sumY=0;
      queue[0]=start;seen[start]=1;labels[start]=++component;
      while(head<tail){const n=queue[head++],x=n%width,y=Math.floor(n/width);
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);sumX+=x;sumY+=y;
        for(const next of [x>0?n-1:-1,x<width-1?n+1:-1,n-width,n+width]){
          if(next>=0&&next<total&&!seen[next]&&d[next*4+3]>=alphaThreshold){seen[next]=1;labels[next]=component;queue[tail++]=next;}
        }
      }
      if(tail<1200)continue;
      const col=Math.min(3,Math.floor(sumX/tail/cw)),row=Math.min(2,Math.floor(sumY/tail/ch)),index=row*4+col;
      if(frames[index]&&frames[index].count>tail)continue;
      left=Math.max(0,left-2);right=Math.min(width-1,right+2);top=Math.max(0,top-2);bottom=Math.min(canvas.height-1,bottom+2);
      frames[index]={x:left,y:top,w:right-left+1,h:bottom-top+1,left:left-col*cw,cellWidth:cw,count:tail,id:component};
    }
    if(frames.some(f=>!f))throw new Error('Missing animation pose: '+key);
    for(const frame of frames){
      const texture=document.createElement('canvas');texture.width=frame.w;texture.height=frame.h;
      const context=texture.getContext('2d'),out=context.createImageData(frame.w,frame.h);
      for(let y=0;y<frame.h;y++)for(let x=0;x<frame.w;x++){
        const n=(frame.y+y)*width+frame.x+x,j=(y*frame.w+x)*4;
        const own=labels[n]===frame.id;
        const fringe=d[n*4+3]<alphaThreshold&&[n-1,n+1,n-width,n+width].some(i=>i>=0&&i<total&&labels[i]===frame.id);
        if(own||fringe)for(let k=0;k<4;k++)out.data[j+k]=d[n*4+k];
      }
      context.putImageData(out,0,0);frame.texture=texture;
    }
    sheets[key]={frames,referenceHeight:frames[0].h,width:canvas.width,height:canvas.height};
  }));
}
export function frameFor(f){
  if(f.poseOverride!==undefined)return f.poseOverride;
  if(f.stun>0)return 7;
  if(f.guard)return 0;
  if(f.attackTimer>0){
    const p=1-f.attackTimer/f.attackDuration;
    // Readable wind-up, distinct impact drawing, then recover.
    return p<.14?0:p<.80?7+f.comboStep:0;
  }
  if(f.specialTimer>0)return 11;
  if(!f.grounded){
    if(f.launchTimer>.09||f.vy< -150)return 5;
    if(f.vy<150)return 6;
    return 7;
  }
  if(Math.abs(f.vx)>45)return [1,2,3,4][Math.floor((f.motionPhase||0)*2/Math.PI)%4];
  return 0;
}
export function drawPose(ctx,f){
  const sheet=sheets[f.key];if(!sheet)return;
  const frame=sheet.frames[frameFor(f)],scale=f.height/sheet.referenceHeight;
  const airborne=!f.grounded&&f.stun<=0;
  // Grounded poses share a foot baseline; airborne poses share a head height.
  const y=airborne?-f.height/2:f.height/2-frame.h*scale;
  ctx.drawImage(frame.texture,(frame.left-frame.cellWidth/2)*scale,y,frame.w*scale,frame.h*scale);
}
export function poseSheetInfo(){return Object.fromEntries(Object.entries(sheets).map(([key,s])=>[key,{frames:s.frames.length,width:s.width,height:s.height}]))}
export function posePortrait(key){return sheets[key]?.frames[0].texture.toDataURL('image/png');}
