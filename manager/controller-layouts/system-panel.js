// One full-grid expansion, with each system's live editor retained across switches.
export function initializeSystemPanel(document) {
  const grid=document.querySelector('.systems > ul');
  if(!grid || grid.dataset.mapperPanelReady)return;
  grid.dataset.mapperPanelReady='true';
  const items=[...grid.children].filter(item=>item.dataset.systemId);
  const entries=items.map(item=>({item,button:item.querySelector('.system-open'),details:item.querySelector('.system-details')}));
  const panel=document.createElement('li');panel.className='system-mapping-panel';panel.hidden=true;
  const header=document.createElement('div');header.className='system-mapping-header';
  const heading=document.createElement('h3');heading.id='system-mapping-heading';
  const close=document.createElement('button');close.type='button';close.textContent='Close mapping';close.className='secondary';
  header.append(heading,close);panel.append(header);panel.setAttribute('aria-labelledby',heading.id);
  let active=null;
  const remember=()=>{if(document.querySelector('#remember-systems')?.checked)try{localStorage.setItem('retrosignal-manager-open-systems',JSON.stringify(active?[active.item.dataset.systemId]:[]));}catch{}};
  function dismiss(focus=true){
    if(!active)return;
    const old=active;old.details.hidden=true;old.item.append(old.details);old.button.setAttribute('aria-expanded','false');
    old.details.dispatchEvent(new Event('controller-panel-close',{bubbles:true}));
    active=null;panel.hidden=true;if(focus)old.button.focus();remember();
  }
  function position(){
    if(!active)return;
    // Determine the actual row from live geometry, including one/two-column breakpoints.
    const rowTop=active.item.getBoundingClientRect().top;
    const last=items.filter(item=>Math.abs(item.getBoundingClientRect().top-rowTop)<2).at(-1) || active.item;
    last.after(panel);
  }
  function open(entry,{focus=true}={}){
    if(active===entry){dismiss();return;}
    dismiss(false);active=entry;heading.textContent=entry.button.querySelector('span').textContent+' · Controller mapping';
    entry.details.hidden=false;panel.append(entry.details);entry.button.setAttribute('aria-expanded','true');panel.hidden=false;position();remember();
    if(focus){close.focus({preventScroll:true});panel.scrollIntoView({block:'nearest',behavior:'instant'});}
  }
  for(const entry of entries){
    const mapper=entry.details.querySelector('[data-controller-mapper]');if(mapper)entry.details.prepend(mapper);
    entry.button.onclick=null;entry.details.id='system-mapping-'+entry.item.dataset.systemId;
    entry.button.setAttribute('aria-controls',entry.details.id);entry.button.setAttribute('aria-expanded','false');entry.details.hidden=true;
    entry.button.addEventListener('click',()=>open(entry));
  }
  close.addEventListener('click',()=>dismiss());
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();dismiss();}});
  document.defaultView?.addEventListener('resize',position);
  if(document.querySelector('#remember-systems')?.checked)try{
    const saved=JSON.parse(localStorage.getItem('retrosignal-manager-open-systems')||'[]');
    const entry=entries.find(entry=>saved.includes(entry.item.dataset.systemId));if(entry)open(entry,{focus:false});
  }catch{}
}
