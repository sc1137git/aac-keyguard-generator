const imageInput=document.getElementById('imageInput');
const presetSelect=document.getElementById('presetSelect');
const earsToggle=document.getElementById('earsToggle');
const canvas=document.getElementById('editorCanvas');
const ctx=canvas.getContext('2d');
const preview=document.getElementById('previewCanvas');
const pctx=preview.getContext('2d');
const emptyState=document.getElementById('emptyState');
let presets={};let image=null;let holes=[];let history=[];let dragStart=null;

async function init(){
  presets=await fetch('/api/presets').then(r=>r.json());
  Object.entries(presets).forEach(([key,p])=>{const o=document.createElement('option');o.value=key;o.textContent=p.label;presetSelect.appendChild(o)});
  presetSelect.value='ipad-9';updateSpecs();draw();
}
function updateSpecs(){
  const p=presets[presetSelect.value];if(!p)return;
  document.getElementById('screenSize').textContent=`${p.width_mm} × ${p.height_mm} mm`;
  const ears=earsToggle.checked;
  document.getElementById('thicknessHint').textContent=ears?'主體厚度：5 mm；耳朵：0.8 mm':'主體厚度：3 mm';
  document.getElementById('bodyThickness').textContent=ears?'5 mm':'3 mm';
  document.getElementById('earThickness').textContent=ears?'0.8 mm':'—';
  document.getElementById('flowText').textContent=ears?'先鏡像 → 再加耳朵':'正常生成';
  document.getElementById('mirrorNote').textContent=ears?'有耳朵：STL 孔位會先鏡像':'無耳朵：不鏡像';
}
function setCanvasSize(){if(!image)return;canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;preview.width=image.naturalWidth;preview.height=image.naturalHeight}
function draw(){
  if(!image){ctx.clearRect(0,0,canvas.width,canvas.height);return}
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  ctx.save();ctx.fillStyle='rgba(255,255,255,.52)';ctx.strokeStyle='#111827';ctx.lineWidth=Math.max(2,canvas.width/700);holes.forEach(h=>{ctx.fillRect(h.x*canvas.width,h.y*canvas.height,h.w*canvas.width,h.h*canvas.height);ctx.strokeRect(h.x*canvas.width,h.y*canvas.height,h.w*canvas.width,h.h*canvas.height)});ctx.restore();
  pctx.fillStyle='black';pctx.fillRect(0,0,preview.width,preview.height);pctx.fillStyle='white';holes.forEach(h=>pctx.fillRect(h.x*preview.width,h.y*preview.height,h.w*preview.width,h.h*preview.height));
  document.getElementById('holeCount').textContent=`${holes.length} 個孔`;
}
function point(evt){const r=canvas.getBoundingClientRect();return{x:(evt.clientX-r.left)/r.width,y:(evt.clientY-r.top)/r.height}}
canvas.addEventListener('pointerdown',e=>{if(!image)return;dragStart=point(e);canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointerup',e=>{if(!image||!dragStart)return;const end=point(e);const x=Math.max(0,Math.min(dragStart.x,end.x));const y=Math.max(0,Math.min(dragStart.y,end.y));const w=Math.abs(end.x-dragStart.x);const h=Math.abs(end.y-dragStart.y);dragStart=null;if(w<.008||h<.008)return;history.push(structuredClone(holes));holes.push({x,y,w,h});draw()});
imageInput.addEventListener('change',()=>{const f=imageInput.files[0];if(!f)return;const url=URL.createObjectURL(f);const img=new Image();img.onload=()=>{image=img;holes=[];history=[];emptyState.style.display='none';setCanvasSize();draw();URL.revokeObjectURL(url)};img.src=url});
presetSelect.addEventListener('change',updateSpecs);earsToggle.addEventListener('change',updateSpecs);
document.getElementById('clearBtn').onclick=()=>{history.push(structuredClone(holes));holes=[];draw()};
document.getElementById('undoBtn').onclick=()=>{if(history.length){holes=history.pop();draw()}};
function svgText(){const p=presets[presetSelect.value];const list=earsToggle.checked?holes.map(h=>({...h,x:1-h.x-h.w})):holes;const holeRects=list.map(h=>`<rect x="${(h.x*p.width_mm).toFixed(3)}" y="${(h.y*p.height_mm).toFixed(3)}" width="${(h.w*p.width_mm).toFixed(3)}" height="${(h.h*p.height_mm).toFixed(3)}" fill="white"/>`).join('');return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width_mm}mm" height="${p.height_mm}mm" viewBox="0 0 ${p.width_mm} ${p.height_mm}"><rect width="100%" height="100%" fill="black"/>${holeRects}</svg>`}
function downloadBlob(data,type,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
document.getElementById('svgBtn').onclick=()=>{if(!image)return alert('請先上傳 AAC 截圖');downloadBlob(svgText(),'image/svg+xml','aac-keyguard.svg')};
document.getElementById('stlBtn').onclick=async()=>{if(!image)return alert('請先上傳 AAC 截圖');const btn=document.getElementById('stlBtn');btn.disabled=true;btn.textContent='產生中…';try{const r=await fetch('/api/export/stl',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:presetSelect.value,holes,ears:earsToggle.checked})});if(!r.ok)throw new Error(await r.text());const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='aac-keyguard.stl';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(e){alert('STL 產生失敗：'+e.message)}finally{btn.disabled=false;btn.textContent='下載 STL'}};
init();
