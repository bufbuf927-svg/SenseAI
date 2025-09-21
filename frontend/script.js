// config
const API_URL = "https://REPLACE_WITH_RENDER_BACKEND_URL"; // update after backend deploy
const MODEL_PATH = "model/model.json";
const META_PATH = "model/metadata.json";

// UI elements
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const fileInput = document.getElementById("fileInput");
const langSelect = document.getElementById("langSelect");

let model = null;
let labels = [];

// init: load metadata and model
async function init() {
  try {
    const meta = await (await fetch(META_PATH)).json();
    labels = meta.labels;
    console.log("Labels:", labels);
  } catch(e) {
    console.error("metadata.json load failed:", e);
  }
  try {
    model = await tf.loadLayersModel(MODEL_PATH);
    console.log("Model loaded");
  } catch(e){
    console.error("Model load failed:", e);
  }
}
init();

// helpers
function addBubble(text, who="bot", html=false){
  const d = document.createElement("div");
  d.className = `bubble ${who}`;
  if(html) d.innerHTML = text; else d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function addImageThumb(dataUrl, who="user"){
  const d = document.createElement("div");
  d.className = `bubble ${who}`;
  d.innerHTML = `<img class="thumb" src="${dataUrl}" />`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function showTyping(){
  const el = document.createElement("div");
  el.className = "bubble bot typing"; el.id = "__typing";
  el.textContent = "Bot is typing...";
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTyping(){ const t = document.getElementById("__typing"); if(t) t.remove(); }

async function classifyFile(file){
  if(!model){ addBubble("⚠️ No image model loaded.", "bot"); return null; }
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e=>res(e.target.result);
    r.onerror = rej; r.readAsDataURL(file);
  });
  const img = new Image(); img.src = dataUrl; await img.decode();
  const tensor = tf.browser.fromPixels(img)
    .resizeNearestNeighbor([224,224]).expandDims(0).toFloat().div(255.0);
  const preds = await model.predict(tensor).data();
  const topIdx = preds.indexOf(Math.max(...preds));
  return { label: labels[topIdx]||`class_${topIdx}`, confidence: preds[topIdx], dataUrl };
}

// text send
sendBtn.onclick = async () => {
  const txt = textInput.value.trim(), lang = langSelect.value||"en";
  if(!txt) return;
  addBubble(txt, "user"); textInput.value = "";
  showTyping();
  try{
    const res = await fetch(`${API_URL}/chat`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ message: txt, lang })
    });
    const data = await res.json();
    hideTyping(); addBubble(data.reply, "bot", true);
  }catch(e){ hideTyping(); addBubble("⚠️ Server error.", "bot"); }
};

// image upload
imgBtn.onclick = () => fileInput.click();
fileInput.onchange = async ev => {
  const file = ev.target.files[0]; if(!file) return;
  addImageThumb(URL.createObjectURL(file), "user"); showTyping();
  const r = await classifyFile(file).catch(()=>null);
  hideTyping();
  if(r){
    const html = `🩺 <strong>${r.label}</strong> (${(r.confidence*100).toFixed(1)}%)<br><small>Not a diagnosis. Consult clinician.</small>`;
    addBubble(html, "bot", true);
    fetch(`${API_URL}/image-log`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r)}).catch(()=>{});
  } else addBubble("⚠️ Could not classify.", "bot");
  fileInput.value=null;
};
