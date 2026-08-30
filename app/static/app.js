const imageInput=document.getElementById('imageInput');
const presetSelect=document.getElementById('presetSelect');
const earsToggle=document.getElementById('earsToggle');
const cornerRadiusInput=document.getElementById('cornerRadiusInput');
const canvas=document.getElementById('editorCanvas');
const ctx=canvas.getContext('2d');
const emptyState=document.getElementById('emptyState');
const canvasWrap=document.getElementById('canvasWrap');
const replaceImageBtn=document.getElementById('replaceImageBtn');
const holeWidthInput=document.getElementById('holeWidthInput');
const holeHeightInput=document.getElementById('holeHeightInput');
let presets={};let image=null;let holes=[];let history=[];let mode='draw';let view='source';let templateHole=null;let selectedIndex=-1;let lastAddedIndex=-1;let dragStart=null;let moveState=null;let draftRect=null;

async function init(){
  presets=await fetch('/api/presets').then(r=>r.json());
  Object.entries(presets).forEach(([key,p])=>{const o=document.createElement('option');o.value=key;o.textContent=p.label;presetSelect.appendChild(o)});
  presetSelect.value='ipad-9';updateSpecs();setMode('draw');draw();
}
function updateSpecs(){
  const p=presets[presetSelect.value];if(!p)return;
  document.getElementById('screenSize').textContent=`${p.width_mm} × ${p.height_mm} mm`;
  const ears=earsToggle.checked;
  document.getElementById('thicknessHint').textContent=ears?'主體厚度：5 mm；耳朵：0.8 mm':'主體厚度：3 mm';
  document.getElementById('bodyThickness').textContent=ears?'5 mm':'3 mm';
  document.getElementById('earThickness').textContent=ears?'0.8 mm':'—';
  document.getElementById('flowText').textContent=ears?'先鏡像 → 再加耳朵':'正常生成';
  document.getElementById('mirrorNote').textContent=ears?'有耳朵：匯出 STL 時會先鏡像':'無耳朵：不鏡像';
  updateTemplateLabel();updateSelectedEditor();draw();
}
function setCanvasSize(){if(!image)return;canvas.width=image.naturalWidth;canvas.height=image.naturalHeight}
function roundedRectPath(c,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function draw(){
  if(!image){ctx.clearRect(0,0,canvas.width,canvas.height);return}
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(view==='source'){
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    holes.forEach((h,i)=>drawHoleOverlay(h,i));
    if(draftRect)drawDraft(draftRect);
  }else{
    const p=presets[presetSelect.value];const radiusPx=(parseFloat(cornerRadiusInput.value)||0)/p.width_mm*canvas.width;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();roundedRectPath(ctx,0,0,canvas.width,canvas.height,radiusPx);ctx.fillStyle='black';ctx.fill();ctx.restore();
    ctx.fillStyle='white';holes.forEach(h=>ctx.fillRect(h.x*canvas.width,h.y*canvas.height,h.w*canvas.width,h.h*canvas.height));
  }
  document.getElementById('holeCount').textContent=`${holes.length} 個孔`;
}
function drawHoleOverlay(h,i){
  const x=h.x*canvas.width,y=h.y*canvas.height,w=h.w*canvas.width,hh=h.h*canvas.height;
  const active=i===selectedIndex||i===lastAddedIndex;
  ctx.save();
  ctx.fillStyle=active?'rgba(255,235,59,.28)':'rgba(0,0,0,.24)';ctx.fillRect(x,y,w,hh);
  ctx.lineWidth=Math.max(6,canvas.width/360);ctx.strokeStyle='rgba(0,0,0,.9)';ctx.strokeRect(x,y,w,hh);
  ctx.lineWidth=Math.max(3,canvas.width/720);ctx.strokeStyle=active?'#ffeb3b':'#ffffff';ctx.strokeRect(x,y,w,hh);
  const label=`${i+1}`;const fs=Math.max(18,canvas.width/75);ctx.font=`700 ${fs}px sans-serif`;const tw=ctx.measureText(label).width;const pad=8;const bx=x+6,by=y+6,bh=fs+pad*1.2,bw=tw+pad*2;
  ctx.fillStyle='rgba(0,0,0,.88)';ctx.fillRect(bx,by,bw,bh);ctx.fillStyle='#fff';ctx.fillText(label,bx+pad,by+fs+pad*.2);
  ctx.restore();
}
function drawDraft(h){const x=h.x*canvas.width,y=h.y*canvas.height,w=h.w*canvas.width,hh=h.h*canvas.height;ctx.save();ctx.setLineDash([16,10]);ctx.lineWidth=Math.max(5,canvas.width/400);ctx.strokeStyle='#ffeb3b';ctx.strokeRect(x,y,w,hh);ctx.restore()}
function point(evt){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))}}
function pushHistory(){history.push({holes:structuredClone(holes),templateHole:templateHole?structuredClone(templateHole):null,selectedIndex,lastAddedIndex});if(history.length>80)history.shift()}
function restoreState(s){holes=s.holes;templateHole=s.templateHole;selectedIndex=s.selectedIndex;lastAddedIndex=s.lastAddedIndex;updateTemplateLabel();updateSelectedEditor();draw()}
function hitIndex(p){for(let i=holes.length-1;i>=0;i--){const h=holes[i];if(p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h)return i}return-1}
function clampHole(h){h.w=Math.min(h.w,1);h.h=Math.min(h.h,1);h.x=Math.max(0,Math.min(1-h.w,h.x));h.y=Math.max(0,Math.min(1-h.h,h.y));return h}
function centeredHole(p,t){return clampHole({x:p.x-t.w/2,y:p.y-t.h/2,w:t.w,h:t.h})}
function setMode(next){mode=next;['draw','stamp','select','delete'].forEach(m=>document.getElementById(m==='draw'?'drawModeBtn':m==='stamp'?'stampModeBtn':m==='select'?'selectModeBtn':'deleteModeBtn').classList.toggle('active',m===next));const hints={draw:'拖曳框出一個孔。完成後這個大小會成為樣板。',stamp:templateHole?'直接點每個 AAC 按鈕的中央，就會放入相同大小的孔。':'請先用「框一格」建立樣板孔。',select:'點一個孔來調整大小；按住孔拖曳可移動位置。',delete:'直接點不要的孔即可刪除。'};document.getElementById('toolHint').textContent=hints[next];canvas.style.cursor=next==='delete'?'not-allowed':next==='select'?'move':'crosshair'}
function setView(next){view=next;document.getElementById('sourceViewBtn').classList.toggle('active',next==='source');document.getElementById('previewViewBtn').classList.toggle('active',next==='preview');draw()}
function updateTemplateLabel(){const el=document.getElementById('templateSize');if(!templateHole||!presets[presetSelect.value]){el.textContent='尚未設定';return}const p=presets[presetSelect.value];el.textContent=`${(templateHole.w*p.width_mm).toFixed(1)} × ${(templateHole.h*p.height_mm).toFixed(1)} mm`}
function updateSelectedEditor(){const p=presets[presetSelect.value];const valid=selectedIndex>=0&&selectedIndex<holes.length;document.getElementById('selectedLabel').textContent=valid?`#${selectedIndex+1}`:'—';[holeWidthInput,holeHeightInput,document.getElementById('smallerBtn'),document.getElementById('largerBtn')].forEach(el=>el.disabled=!valid);if(valid&&p){holeWidthInput.value=(holes[selectedIndex].w*p.width_mm).toFixed(1);holeHeightInput.value=(holes[selectedIndex].h*p.height_mm).toFixed(1)}else{holeWidthInput.value='';holeHeightInput.value=''}}
function resizeSelected(widthMm,heightMm){if(selectedIndex<0)return;const p=presets[presetSelect.value],h=holes[selectedIndex];const nw=Math.max(1,widthMm)/p.width_mm,nh=Math.max(1,heightMm)/p.height_mm;const cx=h.x+h.w/2,cy=h.y+h.h/2;holes[selectedIndex]=clampHole({x:cx-nw/2,y:cy-nh/2,w:nw,h:nh});templateHole={w:holes[selectedIndex].w,h:holes[selectedIndex].h};lastAddedIndex=selectedIndex;updateTemplateLabel();updateSelectedEditor();draw()}

function openImagePicker(){imageInput.click()}
function loadImageFile(file){
  if(!file||!file.type.startsWith('image/'))return;
  const url=URL.createObjectURL(file);const img=new Image();
  img.onload=()=>{image=img;holes=[];history=[];templateHole=null;selectedIndex=-1;lastAddedIndex=-1;emptyState.style.display='none';canvasWrap.classList.remove('empty');canvasWrap.classList.add('has-image');replaceImageBtn.style.display='inline-flex';setCanvasSize();setView('source');setMode('draw');updateTemplateLabel();updateSelectedEditor();draw();URL.revokeObjectURL(url)};
  img.src=url;
}

canvas.addEventListener('pointerdown',e=>{
  if(!image||view!=='source')return;const p=point(e);
  if(mode==='draw'){dragStart=p;draftRect={x:p.x,y:p.y,w:0,h:0};canvas.setPointerCapture(e.pointerId);return}
  if(mode==='stamp'){if(!templateHole){setMode('draw');return}if(hitIndex(p)>=0)return;pushHistory();const h=centeredHole(p,templateHole);holes.push(h);selectedIndex=holes.length-1;lastAddedIndex=selectedIndex;updateSelectedEditor();draw();return}
  const idx=hitIndex(p);
  if(mode==='delete'){if(idx<0)return;pushHistory();holes.splice(idx,1);selectedIndex=-1;lastAddedIndex=-1;updateSelectedEditor();draw();return}
  if(mode==='select'){selectedIndex=idx;lastAddedIndex=idx;updateSelectedEditor();draw();if(idx>=0){pushHistory();moveState={start:p,original:structuredClone(holes[idx]),index:idx};canvas.setPointerCapture(e.pointerId)}}
});
canvas.addEventListener('pointermove',e=>{
  if(!image||view!=='source')return;const p=point(e);
  if(mode==='draw'&&dragStart){draftRect={x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};draw()}
  if(mode==='select'&&moveState){const dx=p.x-moveState.start.x,dy=p.y-moveState.start.y;const o=moveState.original;holes[moveState.index]=clampHole({x:o.x+dx,y:o.y+dy,w:o.w,h:o.h});draw()}
});
canvas.addEventListener('pointerup',e=>{
  if(mode==='draw'&&dragStart){const p=point(e);const h={x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};dragStart=null;draftRect=null;if(h.w>.004&&h.h>.004){pushHistory();holes.push(h);selectedIndex=holes.length-1;lastAddedIndex=selectedIndex;templateHole={w:h.w,h:h.h};updateTemplateLabel();updateSelectedEditor();setMode('stamp')}draw()}
  moveState=null;
});

emptyState.addEventListener('click',e=>{e.stopPropagation();openImagePicker()});
canvasWrap.addEventListener('click',()=>{if(!image)openImagePicker()});
replaceImageBtn.addEventListener('click',openImagePicker);
canvasWrap.addEventListener('dragover',e=>{e.preventDefault();if(!image)canvasWrap.classList.add('dragging')});
canvasWrap.addEventListener('dragleave',()=>canvasWrap.classList.remove('dragging'));
canvasWrap.addEventListener('drop',e=>{e.preventDefault();canvasWrap.classList.remove('dragging');const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)loadImageFile(f)});
imageInput.addEventListener('change',()=>{const f=imageInput.files[0];if(f)loadImageFile(f);imageInput.value=''});

presetSelect.addEventListener('change',updateSpecs);earsToggle.addEventListener('change',updateSpecs);cornerRadiusInput.addEventListener('input',draw);
document.getElementById('drawModeBtn').onclick=()=>setMode('draw');document.getElementById('stampModeBtn').onclick=()=>setMode('stamp');document.getElementById('selectModeBtn').onclick=()=>setMode('select');document.getElementById('deleteModeBtn').onclick=()=>setMode('delete');
document.getElementById('sourceViewBtn').onclick=()=>setView('source');document.getElementById('previewViewBtn').onclick=()=>setView('preview');
document.getElementById('clearBtn').onclick=()=>{if(!holes.length)return;pushHistory();holes=[];templateHole=null;selectedIndex=-1;lastAddedIndex=-1;updateTemplateLabel();updateSelectedEditor();draw()};
document.getElementById('undoBtn').onclick=()=>{if(history.length)restoreState(history.pop())};
holeWidthInput.addEventListener('change',()=>{if(selectedIndex<0)return;pushHistory();resizeSelected(parseFloat(holeWidthInput.value)||1,parseFloat(holeHeightInput.value)||1)});holeHeightInput.addEventListener('change',()=>{if(selectedIndex<0)return;pushHistory();resizeSelected(parseFloat(holeWidthInput.value)||1,parseFloat(holeHeightInput.value)||1)});
document.getElementById('smallerBtn').onclick=()=>{if(selectedIndex<0)return;const p=presets[presetSelect.value],h=holes[selectedIndex];pushHistory();resizeSelected(h.w*p.width_mm-.5,h.h*p.height_mm-.5)};document.getElementById('largerBtn').onclick=()=>{if(selectedIndex<0)return;const p=presets[presetSelect.value],h=holes[selectedIndex];pushHistory();resizeSelected(h.w*p.width_mm+.5,h.h*p.height_mm+.5)};
function svgText(){const p=presets[presetSelect.value];const r=Math.max(0,parseFloat(cornerRadiusInput.value)||0);const list=earsToggle.checked?holes.map(h=>({...h,x:1-h.x-h.w})):holes;const holeRects=list.map(h=>`<rect x="${(h.x*p.width_mm).toFixed(3)}" y="${(h.y*p.height_mm).toFixed(3)}" width="${(h.w*p.width_mm).toFixed(3)}" height="${(h.h*p.height_mm).toFixed(3)}" fill="white"/>`).join('');return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width_mm}mm" height="${p.height_mm}mm" viewBox="0 0 ${p.width_mm} ${p.height_mm}"><rect width="${p.width_mm}" height="${p.height_mm}" rx="${r}" ry="${r}" fill="black"/>${holeRects}</svg>`}
function downloadBlob(data,type,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
document.getElementById('svgBtn').onclick=()=>{if(!image)return alert('請先上傳 AAC 截圖');downloadBlob(svgText(),'image/svg+xml','aac-keyguard.svg')};
document.getElementById('stlBtn').onclick=async()=>{if(!image)return alert('請先上傳 AAC 截圖');const btn=document.getElementById('stlBtn');btn.disabled=true;btn.textContent='產生中…';try{const r=await fetch('/api/export/stl',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:presetSelect.value,holes,ears:earsToggle.checked,corner_radius_mm:parseFloat(cornerRadiusInput.value)||0})});if(!r.ok)throw new Error(await r.text());const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='aac-keyguard.stl';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(e){alert('STL 產生失敗：'+e.message)}finally{btn.disabled=false;btn.textContent='下載 STL'}};
init();
