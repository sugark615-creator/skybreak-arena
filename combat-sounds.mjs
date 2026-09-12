// Original layered impact sounds. Generated once, not during collision frames.
export const COMBAT_SOUNDS = {
  swing: {duration:.18, bass:0, crack:0, air:.42, tail:0, frequency:180},
  shot: {duration:.22, bass:.25, crack:.12, air:.24, tail:.08, frequency:260},
  launch: {duration:.55, bass:.62, crack:.27, air:.35, tail:.28, frequency:160},
  hit: {duration:.24, bass:.68, crack:.62, air:.05, tail:.12, frequency:175},
  heavy: {duration:.39, bass:.84, crack:.73, air:.06, tail:.24, frequency:140},
  maximum: {duration:.72, bass:.92, crack:.8, air:.12, tail:.48, frequency:115},
};

export function createCombatBuffers(ctx) {
  const bank = {};
  for (const [kind, p] of Object.entries(COMBAT_SOUNDS)) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate*p.duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed=1827, low=0, rumble=0, phase=0, peak=0;
    for(let i=0;i<samples.length;i++) {
      const t=i/ctx.sampleRate, progress=t/p.duration;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;
      low+=(noise-low)*(1-Math.exp(-2*Math.PI*2300/ctx.sampleRate));
      rumble+=(noise-rumble)*(1-Math.exp(-2*Math.PI*430/ctx.sampleRate));
      const attack=Math.min(1,t/.002);
      const frequency=48+(p.frequency-48)*Math.exp(-t*27);
      phase+=2*Math.PI*frequency/ctx.sampleRate;
      // Mid-bass harmonics keep the body audible on small phone speakers.
      const body=(Math.sin(phase)+.3*Math.sin(phase*2)+.12*Math.sin(phase*3))*p.bass*Math.exp(-t/(p.duration*.22));
      const crack=(noise-low*.6)*p.crack*Math.exp(-t/ .013);
      const air=low*p.air*Math.sin(Math.PI*progress)**2*Math.exp(-progress*1.8);
      const tail=rumble*p.tail*(1-Math.exp(-t*90))*Math.exp(-t/(p.duration*.29));
      const fade=Math.min(1,(p.duration-t)/.025);
      const value=Math.tanh((body+crack+air+tail)*1.4)*attack*fade;
      samples[i]=value;peak=Math.max(peak,Math.abs(value));
    }
    const level=kind==='swing'?.3:kind==='shot'?.48:kind==='hit'?.7:.82;
    for(let i=0;i<samples.length;i++)samples[i]*=level/Math.max(peak,.001);
    bank[kind]=buffer;
  }
  return bank;
}
