const imageInput=document.getElementById('imageInput');
const presetSelect=document.getElementById('presetSelect');
const earsToggle=document.getElementById('earsToggle');
const bodyThicknessInput=document.getElementById('bodyThicknessInput');
const earThicknessInput=document.getElementById('earThicknessInput');
const earThicknessRow=document.getElementById('earThicknessRow');
const cornerRadiusInput=document.getElementById('cornerRadiusInput');
const canvas=document.getElementById('editorCanvas');
const ctx=canvas.getContext('2d');
const emptyState=document.getElementById('emptyState');
const canvasWrap=document.getElementById('canvasWrap');
const replaceImageBtn=document.getElementById('replaceImageBtn');
const autoDetectBtn=document.getElementById('autoDetectBtn');
const holeWidthInput=document.getElementById('holeWidthInput');
const holeHeightInput=document.getElementById('holeHeightInput');

const EAR_EXTENSION_MM=16;
const EAR_HEIGHT_MM=18;
const EAR_RADIUS_MM=4;
const EAR_OVERLAP_MM=0.8;

let presets={};
let image=null;
let currentFile=null;
let holes=[];
let history=[];
let mode='select';
let view='source';
let selectedIndex=-1;
let lastAddedIndex=-1;
let dragStart=null;
let moveState=null;
let draftRect=null;
let snapGuides=[];

async function init(){
  presets=await fetch('/api/presets').then(r=>r.json());
  Object.entries(presets).forEach(([key,p])=>{
    const option=document.createElement('option');
    option.value=key;
    option.textContent=p.label;
    presetSelect.appendChild(option);
  });
  presetSelect.value='ipad-9';
  updateSpecs();
  setMode('select');
  draw();
}

function setStatus(text){
  const status=document.getElementById('status');
  if(status)status.textContent=text;
}

function bodyThicknessValue(){
  return Math.max(1,Math.min(10,parseFloat(bodyThicknessInput.value)||3));
}

function earThicknessValue(){
  return Math.max(.2,Math.min(bodyThicknessValue(),parseFloat(earThicknessInput.value)||.8));
}

function earCentersMm(height){
  const edgeCenter=Math.max(26,Math.min(30,height*.20));
  return [edgeCenter,height-edgeCenter];
}

function updateSpecs(){
  const p=presets[presetSelect.value];
  if(!p)return;
  document.getElementById('screenSize').textContent=`${p.width_mm} × ${p.height_mm} mm`;
  const ears=earsToggle.checked;
  const body=bodyThicknessValue();
  const ear=earThicknessValue();
  earThicknessRow.hidden=!ears;
  document.getElementById('thicknessHint').textContent=ears
    ?`主體 ${body.toFixed(1)} mm；四個圓角耳朵 ${ear.toFixed(1)} mm`
    :`主體厚度 ${body.toFixed(1)} mm`;
  document.getElementById('bodyThickness').textContent=`${body.toFixed(1)} mm`;
  document.getElementById('earThickness').textContent=ears?`${ear.toFixed(1)} mm`:'—';
  document.getElementById('flowText').textContent=ears?'先鏡像 → 再加四耳':'正常生成';
  document.getElementById('mirrorNote').textContent=ears?'有耳朵：匯出時先鏡像孔位':'無耳朵：不鏡像';
  updateSelectedEditor();
  draw();
}

function handleEarsToggle(){
  const current=bodyThicknessValue();
  if(earsToggle.checked&&Math.abs(current-3)<.01)bodyThicknessInput.value='5';
  if(!earsToggle.checked&&Math.abs(current-5)<.01)bodyThicknessInput.value='3';
  updateSpecs();
}

function setCanvasSize(){
  if(!image)return;
  canvas.width=image.naturalWidth;
  canvas.height=image.naturalHeight;
}

function roundedRectPath(c,x,y,w,h,r){
  r=Math.max(0,Math.min(r,w/2,h/2));
  c.beginPath();
  c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r);
  c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);
  c.arcTo(x,y,x+w,y,r);
  c.closePath();
}

function fillRoundedRect(x,y,w,h,r,fill='black'){
  ctx.save();
  roundedRectPath(ctx,x,y,w,h,r);
  ctx.fillStyle=fill;
  ctx.fill();
  ctx.restore();
}

function drawPreview(){
  const p=presets[presetSelect.value];
  if(!p)return;
  const ears=earsToggle.checked;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if(!ears){
    const radiusPx=(parseFloat(cornerRadiusInput.value)||0)/p.width_mm*canvas.width;
    fillRoundedRect(0,0,canvas.width,canvas.height,radiusPx,'black');
    ctx.fillStyle='white';
    holes.forEach(h=>ctx.fillRect(h.x*canvas.width,h.y*canvas.height,h.w*canvas.width,h.h*canvas.height));
    return;
  }

  ctx.fillStyle='#dfe5ec';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const totalWidthMm=p.width_mm+EAR_EXTENSION_MM*2;
  const scale=Math.min(canvas.width/totalWidthMm,canvas.height/p.height_mm)*.94;
  const plateW=p.width_mm*scale;
  const plateH=p.height_mm*scale;
  const plateX=(canvas.width-plateW)/2;
  const plateY=(canvas.height-plateH)/2;
  const outerRadius=(parseFloat(cornerRadiusInput.value)||0)*scale;
  fillRoundedRect(plateX,plateY,plateW,plateH,outerRadius,'black');

  const earW=(EAR_EXTENSION_MM+EAR_OVERLAP_MM)*scale;
  const earH=EAR_HEIGHT_MM*scale;
  const earR=EAR_RADIUS_MM*scale;
  for(const cyMm of earCentersMm(p.height_mm)){
    const y=plateY+(cyMm-EAR_HEIGHT_MM/2)*scale;
    fillRoundedRect(plateX-EAR_EXTENSION_MM*scale,y,earW,earH,earR,'black');
    fillRoundedRect(plateX+(p.width_mm-EAR_OVERLAP_MM)*scale,y,earW,earH,earR,'black');
  }

  ctx.fillStyle='white';
  holes.forEach(h=>{
    const xMm=(1-h.x-h.w)*p.width_mm;
    const yMm=h.y*p.height_mm;
    const wMm=h.w*p.width_mm;
    const hMm=h.h*p.height_mm;
    ctx.fillRect(plateX+xMm*scale,plateY+yMm*scale,wMm*scale,hMm*scale);
  });
}

function draw(){
  if(!image){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(view==='source'){
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    holes.forEach((h,i)=>drawHoleOverlay(h,i));
    if(draftRect)drawDraft(draftRect);
    drawSnapGuides();
  }else{
    drawPreview();
  }
  document.getElementById('holeCount').textContent=`${holes.length} 個孔`;
}

function drawHoleOverlay(h,i){
  const x=h.x*canvas.width;
  const y=h.y*canvas.height;
  const w=h.w*canvas.width;
  const hh=h.h*canvas.height;
  const active=i===selectedIndex||i===lastAddedIndex;
  ctx.save();
  ctx.fillStyle=active?'rgba(255,235,59,.25)':'rgba(0,0,0,.18)';
  ctx.fillRect(x,y,w,hh);
  ctx.lineWidth=Math.max(5,canvas.width/430);
  ctx.strokeStyle='rgba(0,0,0,.88)';
  ctx.strokeRect(x,y,w,hh);
  ctx.lineWidth=Math.max(2.5,canvas.width/850);
  ctx.strokeStyle=active?'#ffeb3b':'#ffffff';
  ctx.strokeRect(x,y,w,hh);
  const label=`${i+1}`;
  const fs=Math.max(15,canvas.width/92);
  ctx.font=`700 ${fs}px sans-serif`;
  const tw=ctx.measureText(label).width;
  const pad=6;
  const bx=x+5,by=y+5,bh=fs+pad*1.2,bw=tw+pad*2;
  ctx.fillStyle='rgba(0,0,0,.82)';
  ctx.fillRect(bx,by,bw,bh);
  ctx.fillStyle='#fff';
  ctx.fillText(label,bx+pad,by+fs+pad*.15);
  ctx.restore();
}

function drawDraft(h){
  const x=h.x*canvas.width,y=h.y*canvas.height,w=h.w*canvas.width,hh=h.h*canvas.height;
  ctx.save();
  ctx.setLineDash([14,9]);
  ctx.lineWidth=Math.max(4,canvas.width/480);
  ctx.strokeStyle='#ffeb3b';
  ctx.strokeRect(x,y,w,hh);
  ctx.restore();
}

function drawSnapGuides(){
  if(!snapGuides.length)return;
  ctx.save();
  ctx.setLineDash([10,8]);
  ctx.lineWidth=Math.max(2,canvas.width/1000);
  ctx.strokeStyle='#00a3ff';
  snapGuides.forEach(g=>{
    ctx.beginPath();
    if(g.type==='v'){
      const x=g.pos*canvas.width;
      ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);
    }else{
      const y=g.pos*canvas.height;
      ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);
    }
    ctx.stroke();
  });
  ctx.restore();
}

function point(evt){
  const r=canvas.getBoundingClientRect();
  return {
    x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),
    y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))
  };
}

function pushHistory(){
  history.push({holes:structuredClone(holes),selectedIndex,lastAddedIndex});
  if(history.length>80)history.shift();
}

function restoreState(state){
  holes=state.holes;
  selectedIndex=state.selectedIndex;
  lastAddedIndex=state.lastAddedIndex;
  updateSelectedEditor();
  draw();
}

function hitIndex(p){
  for(let i=holes.length-1;i>=0;i--){
    const h=holes[i];
    if(p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h)return i;
  }
  return -1;
}

function clampHole(h){
  h.w=Math.max(.001,Math.min(h.w,1));
  h.h=Math.max(.001,Math.min(h.h,1));
  h.x=Math.max(0,Math.min(1-h.w,h.x));
  h.y=Math.max(0,Math.min(1-h.h,h.y));
  return h;
}

function snapThreshold(){
  const r=canvas.getBoundingClientRect();
  return {x:9/Math.max(r.width,1),y:9/Math.max(r.height,1)};
}

function buildSnapTargets(skipIndex=-1){
  const xs=[0,1],ys=[0,1];
  holes.forEach((h,i)=>{
    if(i===skipIndex)return;
    xs.push(h.x,h.x+h.w,h.x+h.w/2);
    ys.push(h.y,h.y+h.h,h.y+h.h/2);
  });
  return {xs,ys};
}

function nearest(value,targets,threshold){
  let matched=null;
  let distance=threshold;
  for(const target of targets){
    const d=Math.abs(value-target);
    if(d<=distance){matched=target;distance=d;}
  }
  return matched;
}

function snapDrawRect(rect){
  const targets=buildSnapTargets();
  const t=snapThreshold();
  let left=rect.x,right=rect.x+rect.w,top=rect.y,bottom=rect.y+rect.h;
  const l=nearest(left,targets.xs,t.x);
  const r=nearest(right,targets.xs,t.x);
  const tt=nearest(top,targets.ys,t.y);
  const b=nearest(bottom,targets.ys,t.y);
  snapGuides=[];
  if(l!==null){left=l;snapGuides.push({type:'v',pos:l});}
  if(r!==null&&r>left+.002){right=r;snapGuides.push({type:'v',pos:r});}
  if(tt!==null){top=tt;snapGuides.push({type:'h',pos:tt});}
  if(b!==null&&b>top+.002){bottom=b;snapGuides.push({type:'h',pos:b});}
  return clampHole({x:left,y:top,w:right-left,h:bottom-top});
}

function snapMoveRect(rect,skipIndex){
  const targets=buildSnapTargets(skipIndex);
  const t=snapThreshold();
  const xEdges=[
    {value:rect.x,offset:0},
    {value:rect.x+rect.w/2,offset:rect.w/2},
    {value:rect.x+rect.w,offset:rect.w}
  ];
  const yEdges=[
    {value:rect.y,offset:0},
    {value:rect.y+rect.h/2,offset:rect.h/2},
    {value:rect.y+rect.h,offset:rect.h}
  ];
  let bestX=null,bestXDist=t.x;
  let bestY=null,bestYDist=t.y;
  xEdges.forEach(edge=>targets.xs.forEach(target=>{
    const d=Math.abs(edge.value-target);
    if(d<=bestXDist){bestXDist=d;bestX={target,offset:edge.offset};}
  }));
  yEdges.forEach(edge=>targets.ys.forEach(target=>{
    const d=Math.abs(edge.value-target);
    if(d<=bestYDist){bestYDist=d;bestY={target,offset:edge.offset};}
  }));
  snapGuides=[];
  let x=rect.x,y=rect.y;
  if(bestX){x=bestX.target-bestX.offset;snapGuides.push({type:'v',pos:bestX.target});}
  if(bestY){y=bestY.target-bestY.offset;snapGuides.push({type:'h',pos:bestY.target});}
  return clampHole({x,y,w:rect.w,h:rect.h});
}

function setMode(next){
  mode=next;
  ['draw','select','delete'].forEach(m=>{
    const id=m==='draw'?'drawModeBtn':m==='select'?'selectModeBtn':'deleteModeBtn';
    document.getElementById(id).classList.toggle('active',m===next);
  });
  const hints={
    draw:'拖曳新增孔位。接近既有孔位的邊緣或中心時會出現藍色對齊線並自動吸附。',
    select:'點孔位可調整大小；拖曳孔位時也會自動對齊。',
    delete:'直接點選不要的孔位即可刪除。'
  };
  document.getElementById('toolHint').textContent=hints[next];
  canvas.style.cursor=next==='delete'?'not-allowed':next==='select'?'move':'crosshair';
  snapGuides=[];
  draw();
}

function setView(next){
  view=next;
  document.getElementById('sourceViewBtn').classList.toggle('active',next==='source');
  document.getElementById('previewViewBtn').classList.toggle('active',next==='preview');
  snapGuides=[];
  draw();
}

function updateSelectedEditor(){
  const p=presets[presetSelect.value];
  const valid=selectedIndex>=0&&selectedIndex<holes.length;
  document.getElementById('selectedLabel').textContent=valid?`#${selectedIndex+1}`:'—';
  [holeWidthInput,holeHeightInput,document.getElementById('smallerBtn'),document.getElementById('largerBtn')].forEach(el=>el.disabled=!valid);
  if(valid&&p){
    holeWidthInput.value=(holes[selectedIndex].w*p.width_mm).toFixed(1);
    holeHeightInput.value=(holes[selectedIndex].h*p.height_mm).toFixed(1);
  }else{
    holeWidthInput.value='';
    holeHeightInput.value='';
  }
}

function resizeSelected(widthMm,heightMm){
  if(selectedIndex<0)return;
  const p=presets[presetSelect.value];
  const h=holes[selectedIndex];
  const nw=Math.max(1,widthMm)/p.width_mm;
  const nh=Math.max(1,heightMm)/p.height_mm;
  const cx=h.x+h.w/2,cy=h.y+h.h/2;
  holes[selectedIndex]=clampHole({x:cx-nw/2,y:cy-nh/2,w:nw,h:nh});
  lastAddedIndex=selectedIndex;
  updateSelectedEditor();
  draw();
}

function openImagePicker(){imageInput.click();}

async function runAutoDetection(file,manual=false){
  if(!file)return;
  setStatus('自動辨識中…');
  autoDetectBtn.disabled=true;
  autoDetectBtn.textContent='辨識中…';
  try{
    const form=new FormData();
    form.append('file',file);
    const response=await fetch('/api/detect',{method:'POST',body:form});
    if(!response.ok)throw new Error(await response.text());
    const result=await response.json();
    if(!Array.isArray(result.holes)||!result.holes.length){
      setStatus('未找到格線，可手動新增孔位');
      setMode('draw');
      return;
    }
    if(manual&&holes.length)pushHistory();
    holes=result.holes;
    selectedIndex=holes.length?0:-1;
    lastAddedIndex=-1;
    updateSelectedEditor();
    setMode('select');
    draw();
    const dashed=result.info&&result.info.dashed_placeholders_included;
    setStatus(`自動辨識 ${holes.length} 孔${dashed?'・含虛線格':''}`);
  }catch(error){
    console.error(error);
    setStatus('自動辨識失敗，可手動新增孔位');
    setMode('draw');
  }finally{
    autoDetectBtn.disabled=false;
    autoDetectBtn.textContent='重新自動辨識';
  }
}

function loadImageFile(file){
  if(!file||!file.type.startsWith('image/'))return;
  currentFile=file;
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=async()=>{
    image=img;
    holes=[];
    history=[];
    selectedIndex=-1;
    lastAddedIndex=-1;
    emptyState.style.display='none';
    canvasWrap.classList.remove('empty');
    canvasWrap.classList.add('has-image');
    replaceImageBtn.style.display='inline-flex';
    autoDetectBtn.style.display='inline-flex';
    setCanvasSize();
    setView('source');
    setMode('select');
    updateSelectedEditor();
    draw();
    URL.revokeObjectURL(url);
    await runAutoDetection(file,false);
  };
  img.src=url;
}

canvas.addEventListener('pointerdown',e=>{
  if(!image||view!=='source')return;
  const p=point(e);
  if(mode==='draw'){
    dragStart=p;
    draftRect={x:p.x,y:p.y,w:0,h:0};
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  const idx=hitIndex(p);
  if(mode==='delete'){
    if(idx<0)return;
    pushHistory();
    holes.splice(idx,1);
    selectedIndex=-1;
    lastAddedIndex=-1;
    updateSelectedEditor();
    draw();
    return;
  }
  if(mode==='select'){
    selectedIndex=idx;
    lastAddedIndex=idx;
    updateSelectedEditor();
    draw();
    if(idx>=0){
      pushHistory();
      moveState={start:p,original:structuredClone(holes[idx]),index:idx};
      canvas.setPointerCapture(e.pointerId);
    }
  }
});

canvas.addEventListener('pointermove',e=>{
  if(!image||view!=='source')return;
  const p=point(e);
  if(mode==='draw'&&dragStart){
    const raw={
      x:Math.min(dragStart.x,p.x),
      y:Math.min(dragStart.y,p.y),
      w:Math.abs(p.x-dragStart.x),
      h:Math.abs(p.y-dragStart.y)
    };
    draftRect=snapDrawRect(raw);
    draw();
  }
  if(mode==='select'&&moveState){
    const dx=p.x-moveState.start.x,dy=p.y-moveState.start.y;
    const o=moveState.original;
    holes[moveState.index]=snapMoveRect({x:o.x+dx,y:o.y+dy,w:o.w,h:o.h},moveState.index);
    draw();
  }
});

canvas.addEventListener('pointerup',e=>{
  if(mode==='draw'&&dragStart){
    const p=point(e);
    const raw={
      x:Math.min(dragStart.x,p.x),
      y:Math.min(dragStart.y,p.y),
      w:Math.abs(p.x-dragStart.x),
      h:Math.abs(p.y-dragStart.y)
    };
    const h=snapDrawRect(raw);
    dragStart=null;
    draftRect=null;
    snapGuides=[];
    if(h.w>.004&&h.h>.004){
      pushHistory();
      holes.push(h);
      selectedIndex=holes.length-1;
      lastAddedIndex=selectedIndex;
      updateSelectedEditor();
      setMode('select');
    }
    draw();
  }
  if(moveState){
    moveState=null;
    snapGuides=[];
    updateSelectedEditor();
    draw();
  }
});

canvas.addEventListener('pointercancel',()=>{
  dragStart=null;
  moveState=null;
  draftRect=null;
  snapGuides=[];
  draw();
});

emptyState.addEventListener('click',e=>{e.stopPropagation();openImagePicker();});
canvasWrap.addEventListener('click',()=>{if(!image)openImagePicker();});
replaceImageBtn.addEventListener('click',openImagePicker);
autoDetectBtn.addEventListener('click',()=>{if(currentFile)runAutoDetection(currentFile,true);});
canvasWrap.addEventListener('dragover',e=>{e.preventDefault();if(!image)canvasWrap.classList.add('dragging');});
canvasWrap.addEventListener('dragleave',()=>canvasWrap.classList.remove('dragging'));
canvasWrap.addEventListener('drop',e=>{
  e.preventDefault();
  canvasWrap.classList.remove('dragging');
  const file=e.dataTransfer.files&&e.dataTransfer.files[0];
  if(file)loadImageFile(file);
});
imageInput.addEventListener('change',()=>{
  const file=imageInput.files[0];
  if(file)loadImageFile(file);
  imageInput.value='';
});

presetSelect.addEventListener('change',updateSpecs);
earsToggle.addEventListener('change',handleEarsToggle);
bodyThicknessInput.addEventListener('input',updateSpecs);
earThicknessInput.addEventListener('input',updateSpecs);
cornerRadiusInput.addEventListener('input',draw);
document.getElementById('drawModeBtn').onclick=()=>setMode('draw');
document.getElementById('selectModeBtn').onclick=()=>setMode('select');
document.getElementById('deleteModeBtn').onclick=()=>setMode('delete');
document.getElementById('sourceViewBtn').onclick=()=>setView('source');
document.getElementById('previewViewBtn').onclick=()=>setView('preview');
document.getElementById('clearBtn').onclick=()=>{
  if(!holes.length)return;
  pushHistory();
  holes=[];
  selectedIndex=-1;
  lastAddedIndex=-1;
  updateSelectedEditor();
  draw();
};
document.getElementById('undoBtn').onclick=()=>{if(history.length)restoreState(history.pop());};

holeWidthInput.addEventListener('change',()=>{
  if(selectedIndex<0)return;
  pushHistory();
  resizeSelected(parseFloat(holeWidthInput.value)||1,parseFloat(holeHeightInput.value)||1);
});
holeHeightInput.addEventListener('change',()=>{
  if(selectedIndex<0)return;
  pushHistory();
  resizeSelected(parseFloat(holeWidthInput.value)||1,parseFloat(holeHeightInput.value)||1);
});
document.getElementById('smallerBtn').onclick=()=>{
  if(selectedIndex<0)return;
  const p=presets[presetSelect.value],h=holes[selectedIndex];
  pushHistory();
  resizeSelected(h.w*p.width_mm-.5,h.h*p.height_mm-.5);
};
document.getElementById('largerBtn').onclick=()=>{
  if(selectedIndex<0)return;
  const p=presets[presetSelect.value],h=holes[selectedIndex];
  pushHistory();
  resizeSelected(h.w*p.width_mm+.5,h.h*p.height_mm+.5);
};

function svgText(){
  const p=presets[presetSelect.value];
  const r=Math.max(0,parseFloat(cornerRadiusInput.value)||0);
  const ears=earsToggle.checked;
  const offset=ears?EAR_EXTENSION_MM:0;
  const outputWidth=p.width_mm+offset*2;
  const list=ears?holes.map(h=>({...h,x:1-h.x-h.w})):holes;
  const body=`<rect x="${offset}" y="0" width="${p.width_mm}" height="${p.height_mm}" rx="${r}" ry="${r}" fill="black"/>`;
  let earRects='';
  if(ears){
    const earW=EAR_EXTENSION_MM+EAR_OVERLAP_MM;
    for(const cy of earCentersMm(p.height_mm)){
      const y=cy-EAR_HEIGHT_MM/2;
      earRects+=`<rect x="0" y="${y.toFixed(3)}" width="${earW.toFixed(3)}" height="${EAR_HEIGHT_MM}" rx="${EAR_RADIUS_MM}" ry="${EAR_RADIUS_MM}" fill="black"/>`;
      earRects+=`<rect x="${(offset+p.width_mm-EAR_OVERLAP_MM).toFixed(3)}" y="${y.toFixed(3)}" width="${earW.toFixed(3)}" height="${EAR_HEIGHT_MM}" rx="${EAR_RADIUS_MM}" ry="${EAR_RADIUS_MM}" fill="black"/>`;
    }
  }
  const holeRects=list.map(h=>`<rect x="${(offset+h.x*p.width_mm).toFixed(3)}" y="${(h.y*p.height_mm).toFixed(3)}" width="${(h.w*p.width_mm).toFixed(3)}" height="${(h.h*p.height_mm).toFixed(3)}" fill="white"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}mm" height="${p.height_mm}mm" viewBox="0 0 ${outputWidth} ${p.height_mm}">${body}${earRects}${holeRects}</svg>`;
}

function downloadBlob(data,type,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type}));
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

document.getElementById('svgBtn').onclick=()=>{
  if(!image)return alert('請先上傳 AAC 截圖');
  downloadBlob(svgText(),'image/svg+xml','aac-keyguard.svg');
};

document.getElementById('stlBtn').onclick=async()=>{
  if(!image)return alert('請先上傳 AAC 截圖');
  const btn=document.getElementById('stlBtn');
  btn.disabled=true;
  btn.textContent='產生中…';
  try{
    const response=await fetch('/api/export/stl',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        preset:presetSelect.value,
        holes,
        ears:earsToggle.checked,
        body_thickness_mm:bodyThicknessValue(),
        ear_thickness_mm:earThicknessValue(),
        ear_extension_mm:EAR_EXTENSION_MM,
        ear_height_mm:EAR_HEIGHT_MM,
        corner_radius_mm:parseFloat(cornerRadiusInput.value)||0
      })
    });
    if(!response.ok){
      let message=await response.text();
      try{const parsed=JSON.parse(message);message=parsed.detail||message;}catch(_){ }
      throw new Error(message);
    }
    const blob=await response.blob();
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='aac-keyguard.stl';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }catch(error){
    alert('STL 產生失敗：'+error.message);
  }finally{
    btn.disabled=false;
    btn.textContent='下載 STL';
  }
};

init();
