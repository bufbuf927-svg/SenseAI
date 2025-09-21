// config
const API_URL = "https://senseai-backend.onrender.com"; // <-- you will replace this after backend is up
const MODEL_PATH = "model/model.json"; // ensure model files are in frontend/model/
const LABELS_PATH = "models/metadata.json";     // create frontend/labels.json (array of labels)

// UI elements
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const fileInput = document.getElementById("fileInput");
const langSelect = document.getElementById("langSelect");

let model = null;
let labels = [];

// init: load model and labels
async function init() {
  try {
    labels = await (await fetch(LABELS_PATH)).json();
  } catch(e) {
    console.warn("Could not load labels.json — ensure it exists in frontend/");
  }
  try {
    model = await tf.loadLayersModel(MODEL_PATH);
    console.log("TFJS model loaded");
  } catch(e){
    console.warn("TFJS model not found or failed to load: ", e);
    // model optional — app still works for chat
  }
}
init();

// helpers
function addBubble(text, who="bot", html=false){
  const d = document.createElement("div");
  d.className = `bubble ${who}`;
  if(html) d.innerHTML = text;
  else d.textContent = text;
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
  el.className = "bubble bot typing";
  el.id = "__typing";
  el.textContent = "Bot is typing...";
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTyping(){ const t = document.getElementById("__typing"); if(t) t.remove(); }

async function classifyFile(file){
  if(!model){
    addBubble("⚠️ No image model loaded in browser.", "bot");
    return null;
  }
  // load image to HTML image element
  const img = new Image();
  const dataUrl = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  img.src = dataUrl;
  await img.decode();
  // convert to tensor
  const tensor = tf.browser.fromPixels(img).resizeNearestNeighbor([224,224]).expandDims(0).toFloat().div(255.0);
  const preds = await model.predict(tensor).data();
  const topIdx = preds.indexOf(Math.max(...preds));
  const confidence = preds[topIdx];
  const label = labels[topIdx] || `class_${topIdx}`;
  return { label, confidence, dataUrl };
}

// send text
sendBtn.onclick = async () => {
  const txt = textInput.value.trim();
  const lang = langSelect.value || "en";
  if(!txt) return;
  addBubble(txt, "user");
  textInput.value = "";
  showTyping();
  try{
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ message: txt, lang })
    });
    const data = await res.json();
    hideTyping();
    addBubble(data.reply, "bot", true);
  }catch(e){
    hideTyping();
    addBubble("⚠️ Server error — cannot reach backend.", "bot");
    console.error(e);
  }
};

// image upload
imgBtn.onclick = () => fileInput.click();
fileInput.onchange = async (ev) => {
  const file = ev.target.files[0];
  if(!file) return;
  addImageThumb(URL.createObjectURL(file), "user");
  showTyping();
  // classify locally
  const result = await classifyFile(file).catch(e => { console.error(e); return null; });
  if(result){
    hideTyping();
    const html = `🩺 <strong>${result.label}</strong> (${(result.confidence*100).toFixed(1)}%)<br><small>Not a diagnosis. Consult clinician.</small>`;
    addBubble(html, "bot", true);
    // optionally send image metadata to backend (e.g., for logging)
    try{
      await fetch(`${API_URL}/image-log`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ label: result.label, confidence: result.confidence })
      });
    }catch(e){ /* ignore logging failure */ }
  } else {
    hideTyping();
    addBubble("⚠️ Could not classify image in browser.", "bot");
  }
  fileInput.value = null;
};

