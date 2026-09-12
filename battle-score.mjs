/** SKYBREAK / IGNITION — original 164 BPM electro-rock, 32 bars.
 * Render once before playback; combat never schedules the instrument voices. */
export const SCORE={title:'IGNITION',bpm:164,bars:32,sampleRate:32000};
export async function renderBattleScore(OfflineContext){
  const beat=60/SCORE.bpm,barLength=beat*4,duration=barLength*SCORE.bars,tail=1.5;
  const ctx=new OfflineContext(2,Math.ceil((duration+tail)*SCORE.sampleRate),SCORE.sampleRate);
  const hz=n=>440*2**((n-69)/12);
  const mix=ctx.createGain(),compressor=ctx.createDynamicsCompressor();
  compressor.threshold.value=-14;compressor.knee.value=12;compressor.ratio.value=3.5;
  compressor.attack.value=.005;compressor.release.value=.14;
  mix.gain.value=.8;mix.connect(compressor).connect(ctx.destination);
  const guitar=ctx.createGain(),drive=ctx.createWaveShaper(),cabinet=ctx.createBiquadFilter();
  const curve=new Float32Array(2048);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(x*3);}
  drive.curve=curve;drive.oversample='2x';cabinet.type='lowpass';cabinet.frequency.value=2900;
  guitar.gain.value=.42;guitar.connect(drive).connect(cabinet).connect(mix);
  const lead=ctx.createGain(),delay=ctx.createDelay(1),echo=ctx.createGain(),echoFilter=ctx.createBiquadFilter(),panEcho=ctx.createStereoPanner();
  lead.connect(mix);delay.delayTime.value=beat*.75;echo.gain.value=.27;echoFilter.type='lowpass';echoFilter.frequency.value=2400;panEcho.pan.value=.42;
  lead.connect(delay).connect(echoFilter).connect(echo);echo.connect(panEcho).connect(mix);echo.connect(delay);
  const noise=ctx.createBuffer(1,SCORE.sampleRate*2,SCORE.sampleRate);let seed=80917;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<noise.length;i++)noise.getChannelData(0)[i]=random()*2-1;
  function tone(note,at,length,type,level,bus=mix,pan=0,cutoff=5000,detune=0){
    const source=ctx.createOscillator(),filter=ctx.createBiquadFilter(),env=ctx.createGain(),panner=ctx.createStereoPanner();
    source.type=type;source.frequency.value=hz(note);source.detune.value=detune;
    filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,at);filter.frequency.exponentialRampToValueAtTime(Math.max(200,cutoff*.52),at+length);
    panner.pan.value=pan;env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(level,at+.006);
    env.gain.exponentialRampToValueAtTime(Math.max(.0001,level*.55),at+length*.7);env.gain.exponentialRampToValueAtTime(.0001,at+length+.025);
    source.connect(filter).connect(env).connect(panner).connect(bus);source.start(at);source.stop(at+length+.035);
  }
  function hiss(at,length,level,freq,type='highpass',pan=0){
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain(),panner=ctx.createStereoPanner();
    source.buffer=noise;filter.type=type;filter.frequency.value=freq;filter.Q.value=.6;panner.pan.value=pan;
    env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(level,at+.002);env.gain.exponentialRampToValueAtTime(.0001,at+length);
    source.connect(filter).connect(env).connect(panner).connect(mix);source.start(at,random());source.stop(at+length+.01);
  }
  function kick(at,level=1){
    const source=ctx.createOscillator(),env=ctx.createGain();source.frequency.setValueAtTime(160,at);source.frequency.exponentialRampToValueAtTime(46,at+.11);
    env.gain.setValueAtTime(.001,at);env.gain.linearRampToValueAtTime(.55*level,at+.003);env.gain.exponentialRampToValueAtTime(.0001,at+.25);
    source.connect(env).connect(mix);source.start(at);source.stop(at+.27);hiss(at,.02,.045*level,2500);
  }
  function snare(at,level=1){hiss(at,.14,.19*level,1400,'highpass',-.08);tone(53,at,.085,'triangle',.13*level);hiss(at+.012,.08,.075*level,3600,'bandpass',.1);}
  const progression=[40,40,36,36,43,43,38,35];
  const motifs=[
    [7,null,7,10,12,null,null,7,3,null,5,null,7,null,2,null],
    [0,null,null,3,7,null,5,null,3,null,2,null,0,null,null,null],
    [12,null,null,10,7,null,12,null,15,null,14,12,7,null,10,null],
    [7,null,5,null,3,null,2,null,0,null,null,7,2,null,null,null],
  ];
  for(let bar=0;bar<32;bar++){
    const breakdown=bar>=16&&bar<20,build=bar>=20&&bar<24,chorus=(bar>=8&&bar<16)||bar>=24;
    const root=bar>=16&&bar<24?[36,36,38,38,40,40,35,35][bar-16]:progression[bar%8];
    const third=root===40?3:4,start=bar*barLength;
    // Wide sustained harmony underneath the riff, with room for the lead.
    for(const [j,n]of [0,third,7,12].entries())tone(root+24+n,start,barLength*.93,'triangle',breakdown?.019:.008,mix,j%2?.65:-.65,1600);
    if(bar%8===0||bar===24)hiss(start,.85,.10,4800,'highpass',.35);
    for(let s=0;s<16;s++){
      const t=start+s*beat/4;
      const fill=bar%8===7&&s>=12;
      if((breakdown?[0,10]:[0,6,8,11]).includes(s)||(!breakdown&&bar%4===3&&s===14))kick(t,breakdown?.75:1);
      if(!breakdown&&(s===4||s===12))snare(t);
      if(breakdown&&s===8)snare(t,.6);
      if(fill&&s%2===0)snare(t,.42+(s-12)*.08);
      if(build&&bar===23&&s>=8)snare(t,.25+(s-8)*.065);
      if(s%2===0||chorus&&s===15)hiss(t,s===14?.10:.035,(s%4?.019:.033)*(breakdown?.5:1),6500,'highpass',s%4?.42:-.25);
      const bassPattern=breakdown?[0,8]:[0,3,6,8,10,14];
      if(bassPattern.includes(s)){
        const n=root+(s===14?7:s===10?12:0),len=beat*(breakdown?.9:.38);
        tone(n,t,len,'sawtooth',.09,mix,0,650);tone(n-12,t,len,'sine',.09,mix,0,350);
      }
      if(!breakdown&&[0,2,3,6,8,10,11,14].includes(s)){
        const open=s===0||s===8,len=beat*(open?.42:.19),level=open?.078:.059;
        for(const n of [root+12,root+19,root+24]){
          tone(n,t,len,'sawtooth',level,guitar,-.68,open?2700:1700,-5);
          tone(n,t+.009,len,'sawtooth',level*.85,guitar,.68,open?2700:1700,5);
        }
      }
      if(breakdown||build){
        if(s%2===0){const n=root+24+[0,7,12,third+12][Math.floor(s/2)%4];tone(n,t,beat*.4,'triangle',.037,lead,s%4?.3:-.3,3200);}
      }else{
        let n=motifs[(bar+(chorus?2:0))%4][s];
        if(n!==null){if(n===3)n=third;if(n===15)n=12+third;
          const length=beat*(s%4===0?.65:.38),pitch=root+24+n;
          tone(pitch,t,length,'sawtooth',chorus?.042:.031,lead,-.12,chorus?4300:3100,-6);
          tone(pitch,t,length,'triangle',.045,lead,.12,4400,5);
          if(bar>=24&&s%4===0)tone(pitch-12,t,length,'square',.014,lead,.35,2400);
        }
      }
    }
  }
  const rendered=await ctx.startRendering(),length=Math.round(duration*SCORE.sampleRate);
  // Fold the reverb/delay tail into the loop start, then leave headroom for SFX.
  const channels=[new Float32Array(length),new Float32Array(length)];let peak=0;
  for(let ch=0;ch<2;ch++){
    const source=rendered.getChannelData(ch),out=channels[ch];out.set(source.subarray(0,length));
    for(let i=length;i<source.length;i++)out[i-length]+=source[i];
    for(const sample of out)peak=Math.max(peak,Math.abs(sample));
  }
  const level=.78/Math.max(.78,peak);
  for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=level;
  return {channels,sampleRate:SCORE.sampleRate,duration:length/SCORE.sampleRate};
}
