let lastDetectionFile = null;
let detectionSerial = 0;

function ensureAutoDetectButton(){
  const actions=document.querySelector('.toolbar-actions');
  if(!actions||document.getElementById('autoDetectBtn'))return;
  const btn=document.createElement('button');
  btn.id='autoDetectBtn';
  btn.type='button';
  btn.className='replace-image-btn';
  btn.textContent='重新自動辨識';
  btn.style.display='none';
  btn.addEventListener('click',()=>{if(lastDetectionFile)runAutoDetection(lastDetectionFile,true)});
  actions.insertBefore(btn,actions.firstChild);
}

function setDetectionStatus(text){
  const status=document.getElementById('status');
  if(status)status.textContent=text;
}

function chooseTemplateFromDetectedHoles(list){
  const grid=list.filter(h=>h.y>.14&&h.y<.84&&h.w<.32);
  if(!grid.length)return null;
  const widths=grid.map(h=>h.w).sort((a,b)=>a-b);
  const heights=grid.map(h=>h.h).sort((a,b)=>a-b);
  return {w:widths[Math.floor(widths.length/2)],h:heights[Math.floor(heights.length/2)]};
}

async function runAutoDetection(file,manual=false){
  if(!file)return;
  const serial=++detectionSerial;
  setDetectionStatus('自動辨識中…');
  const btn=document.getElementById('autoDetectBtn');
  if(btn){btn.disabled=true;btn.textContent='辨識中…'}
  try{
    const form=new FormData();form.append('file',file);
    const response=await fetch('/api/detect',{method:'POST',body:form});
    if(!response.ok)throw new Error(await response.text());
    const result=await response.json();
    if(serial!==detectionSerial)return;
    if(!Array.isArray(result.holes)||!result.holes.length){
      setDetectionStatus('未找到格線，可手動框孔');
      return;
    }
    // 圖片本身仍在載入時稍等一下，避免辨識結果被原本的上傳初始化清掉。
    for(let i=0;i<20&&!image;i++)await new Promise(r=>setTimeout(r,50));
    if(!image)return;
    history=[];
    holes=result.holes;
    templateHole=chooseTemplateFromDetectedHoles(holes);
    selectedIndex=-1;
    lastAddedIndex=-1;
    updateTemplateLabel();
    updateSelectedEditor();
    setMode('select');
    draw();
    const dashed=result.info&&result.info.dashed_placeholders_included;
    setDetectionStatus(`自動辨識 ${holes.length} 孔${dashed?'・含虛線格':''}`);
    if(btn)btn.style.display='inline-flex';
  }catch(error){
    console.error(error);
    setDetectionStatus('自動辨識失敗，可手動修正');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='重新自動辨識'}
  }
}

ensureAutoDetectButton();

// capture 階段先把 File 留下來，因為原本的 change handler 之後會清空 input.value。
imageInput.addEventListener('change',event=>{
  const file=event.target.files&&event.target.files[0];
  if(!file)return;
  lastDetectionFile=file;
  setTimeout(()=>runAutoDetection(file),80);
},true);

canvasWrap.addEventListener('drop',event=>{
  const file=event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0];
  if(!file)return;
  lastDetectionFile=file;
  setTimeout(()=>runAutoDetection(file),80);
},true);
