// Guided exploration and evidence panels use only returned scientific state.
const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const button=(text,action)=>{const node=make('button',text);node.type='button';node.onclick=action;return node;};
const fixed=(value,d=1)=>Number.isFinite(value)?value.toFixed(d):'unknown';

export function addDiscoveryControls(catalog,onChange){
  const box=make('div',undefined,'discovery-settings');
  const field=(id,label,options)=>{const row=make('div',undefined,'field');const title=make('label',label);title.htmlFor=id;let input;
    if(Array.isArray(options)){input=make('select');for(const [value,text] of options){const option=make('option',text);option.value=value;input.append(option);}}
    else{input=make('input');input.type='number';Object.assign(input,options);}
    input.id=id;input.addEventListener('change',onChange);row.append(title,input);box.append(row);return input;
  };
  field('landing-profile','Landing criteria profile',catalog.landingProfiles.map(p=>[p.id,p.name]));
  field('roughness','Maximum 100 m roughness · m',{min:'.01',max:'20',step:'.1',value:'1'});
  const extra=make('details');extra.append(make('summary','Landing footprint & vehicle size'));
  const start=box.children.length;
  field('ellipse-major','Ellipse major diameter · m',{min:'100',max:'10000',step:'100',value:'1000'});
  field('ellipse-minor','Ellipse minor diameter · m',{min:'100',max:'10000',step:'100',value:'500'});
  field('ellipse-heading','Ellipse heading clockwise from north · °',{min:'0',max:'360',step:'1',value:'0'});
  field('lander-diameter','Lander footprint diameter · m',{min:'1',max:'100',step:'1',value:'5'});
  while(box.children.length>start)extra.append(box.children[start]);
  extra.append(make('p','49 samples screen the ellipse. Even 20 m pixels cannot resolve small landing hazards; missing evidence remains unknown.','footnote'));box.append(extra);
  document.querySelector('#max-slope').closest('.field').before(box);
  const profile=document.querySelector('#landing-profile');
  profile.addEventListener('change',()=>{const chosen=catalog.landingProfiles.find(p=>p.id===profile.value);document.querySelector('#max-slope').value=chosen.maxSlopeDeg;document.querySelector('#max-slope').disabled=profile.value==='apollo-early';document.querySelector('#roughness').disabled=profile.value!=='study';});
}

export function discoveryParams(){
  const fields={'landing-profile':'profile',roughness:'maxRoughness','ellipse-major':'ellipseMajorM','ellipse-minor':'ellipseMinorM','ellipse-heading':'ellipseHeadingDeg','lander-diameter':'landerDiameterM'};
  return Object.fromEntries(Object.entries(fields).map(([id,key])=>{const input=document.getElementById(id);if(!input.checkValidity())throw new Error(`Check ${input.previousElementSibling.textContent}`);return [key,input.value];}));
}

export function appendEvidence(parent,site){
  if(!site.evidence)return;
  const evidence=site.evidence;const detail=make('details');detail.append(make('summary','Landing evidence · pass / fail / unknown'));
  detail.append(make('p',`${evidence.ellipseMajorM} × ${evidence.ellipseMinorM} m ellipse · ${evidence.samples} samples · ${evidence.headingDeg}° heading. Lander diameter: ${evidence.landerDiameterM} m.`));
  const names={slope:['Slope','°'],roughness100m:['100 m roughness','m'],elevationError:['Elevation error layer','m'],effectiveResolution:['Effective resolution','m']};
  for(const [key,[label,unit]] of Object.entries(names)){const v=evidence[key];detail.append(make('p',`${label}: maximum ${fixed(v.maximum,2)} ${unit}; ${fixed(v.coverageFraction*100,0)}% of footprint samples covered. Pixel spacing ${v.pixelM} m.`));}
  const list=make('dl',undefined,'constraint-list');for(const [key,value] of Object.entries(site.constraints)){list.append(make('dt',key.replace(/([A-Z])/g,' $1')),make('dd',value,value));}detail.append(list,make('p','Passing available checks does not qualify a landing site. Rocks, small craters, complete footprint coverage, approach and vehicle engineering still need assessment.'));parent.append(detail);
}

export function appendWindow(parent,site,timeline,jump){
  const sum=timeline?.summary[site.id];if(!sum)return;
  const box=make('div',undefined,'window-summary');box.append(make('strong',`${fixed(sum.sunVisible*100,0)}% sunlight · ${fixed(sum.anyStationVisible*100,0)}% DSN`),make('p',`${fixed(sum.energyWh,0)} Wh ideal energy over this window.`));
  const start=Date.parse(timeline.timesUtc[0]),end=Date.parse(timeline.timesUtc.at(-1));
  for(const [key,title] of [['sunVisible','Sunlight'],['anyStationVisible','Earth contact']]){const row=make('div',undefined,'window-row');row.append(make('span',title));const track=make('div',undefined,'window-track');track.setAttribute('role','img');track.setAttribute('aria-label',`${title} windows; ${fixed(sum[key]*100,0)} percent of the exploration window`);
    for(const interval of timeline.windows[site.id][key]){const bar=make('span');bar.style.left=`${100*(Date.parse(interval.startUtc)-start)/(end-start)}%`;bar.style.width=`${100*(Date.parse(interval.endUtc)-Date.parse(interval.startUtc))/(end-start)}%`;track.append(bar);}row.append(track);box.append(row);}
  const detail=make('details');detail.append(make('summary','Sunrise, shadow & antenna contacts'));
  const events=timeline.events[site.id];
  for(const event of events){const label={sunVisible:'Sunlight',earthVisible:'Earth center',anyStationVisible:'Any DSN antenna'}[event.metric]||event.metric;const b=button(`${event.utc.slice(5,19).replace('T',' ')} UTC · ${label} ${event.starts?'begins':'ends'}`,()=>jump(Date.parse(event.utc)));b.className='event-button';b.title=`Numerical bracket: ${event.bracketStartUtc} – ${event.bracketEndUtc}`;detail.append(b);}
  if(!events.length)detail.append(make('p','No transitions detected in this window.'));
  detail.append(make('p',`Search every ${timeline.searchStepSeconds/60} min; detected changes bracketed within ${timeline.numericalBracketSeconds} s. Shorter events may be missed. Physical timing uncertainty from terrain is not quantified.`));box.append(detail);parent.append(box);
}

export function appendHorizonCheck(parent,site,api){
  const detail=make('details');detail.append(make('summary','How sensitive is this terrain horizon?'));
  const result=make('p','Compare 2° rays to 1° rays, extend the horizon from 150 to 200 km, and compare local 20 m tiles with the regional terrain. Differences are sensitivity measures, not accuracy guarantees.');
  const run=button('Compare horizon sampling',async()=>{run.disabled=true;result.textContent='Calculating three terrain horizons…';try{const r=await api('horizon',{latitude:site.latitude,longitude:site.longitude},`horizon-${site.id}`);result.textContent=`Ray spacing / range: maximum ${fixed(r.angularAndRangeDifferenceDeg,3)}° difference. Terrain resolution: maximum ${fixed(r.terrainResolutionDifferenceDeg,3)}° difference. ${r.interpretation}`;}catch(e){result.textContent=e.message;}finally{run.disabled=false;}});detail.append(result,run);parent.append(detail);
}

export function installLessons(actions){
  const launch=button('◎ Guided exploration',()=>start());launch.id='start-lessons';launch.className='lesson-launch wide';document.querySelector('.panel-tabs').after(launch);
  const panel=make('section',undefined,'lesson-panel');panel.hidden=true;panel.setAttribute('aria-label','Guided exploration');launch.after(panel);
  const lessons=[
    {title:'1 / Follow the sunlight',body:'Compare a polar landing with a site nearer the equator. Gold numbers show ideal solar output. Move six hours ahead: does a low Sun always mean zero power?',sites:['im1','blue-ghost'],mode:'moon',action:'Advance 6 hours',run:()=>actions.advance(21600000)},
    {title:'2 / A ridge can change a day',body:'Focus on IM-2. Compare its terrain horizon with a flat horizon under Mission settings. The horizon chart shows the Sun in gold and Earth in teal; the visible fraction includes a partly hidden Sun.',sites:['im2'],mode:'moon',action:'Toggle terrain / flat horizon',run:()=>actions.toggleHorizon()},
    {title:'3 / Find a line home',body:'Earth rotates beneath the Moon. Select a DSN antenna, then advance six hours. Ground elevation and lunar clearance must both pass. A visible antenna is an opportunity, not a scheduled connection.',sites:['im1'],mode:'earth',action:'Advance 6 hours',run:()=>actions.advance(21600000)},
    {title:'4 / Plan a window',body:'Return to the Moon and open the sunrise/contact list in a site card. Click an event to visit it. Compare the sunlight and contact bars: their windows need not match. Numerical timing precision is not terrain accuracy.',sites:['im1','im2'],mode:'moon',action:'Show 3-day comparison',run:()=>actions.window()},
    {title:'5 / Investigate a candidate',body:'Discover screens a grid near IM-2 using terrain and sampled footprint evidence before sunlight and radio. Try a slope threshold of 20°. Read the unknown criteria, even for a passing candidate. Which additional measurements would a real mission need?',sites:['im2'],mode:'moon',discover:true,action:'Screen this area',run:()=>actions.scan()}
  ];let saved,index=0;
  function render(){const lesson=lessons[index];panel.replaceChildren(make('p',`GUIDED EXPLORATION · ${index+1} OF ${lessons.length}`,'eyebrow'),make('h2',lesson.title),make('p',lesson.body));const controls=make('div',undefined,'lesson-controls');const back=button('Back',()=>{index--;apply();});back.disabled=index===0;controls.append(back,button(index===lessons.length-1?'Finish':'Next',()=>{if(index===lessons.length-1)close();else{index++;apply();}}),button('Close',close));panel.append(button(lesson.action,lesson.run),controls);}
  function apply(){actions.lesson(lessons[index]);render();}
  function start(){saved=actions.snapshot();index=0;panel.hidden=false;launch.hidden=true;apply();}
  function close(){panel.hidden=true;launch.hidden=false;actions.restore(saved);launch.focus();}
  return {close};
}
