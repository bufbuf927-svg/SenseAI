// Backend config
const API_URL = "https://senseai-backend1.onrender.com";
const MODEL_PATH = "model/model.json";
const LABELS_PATH = "model/metadata.json";

let model = null;
let labels = [];

// Initialize model
async function init() {
  try {
    const metadata = await (await fetch(LABELS_PATH)).json();
    labels = metadata.labels || [];
  } catch(e) { console.warn("No metadata.json", e); }

  try {
    model = await tf.loadLayersModel(MODEL_PATH);
  } catch(e) { console.warn("No model loaded", e); }
}
init();

// UI refs
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const fileInput = document.getElementById("fileInput");
const langSelect = document.getElementById("langSelect");
const hospitalBtn = document.getElementById("hospitalBtn");

// Helpers
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
  el.textContent = "Bot is typing";
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTyping(){ const t = document.getElementById("__typing"); if(t) t.remove(); }

// Classify uploaded image
async function classifyFile(file){
  if(!model){ addBubble("⚠️ No image model loaded.","bot"); return null; }
  const img = new Image();
  const dataUrl = await new Promise((res, rej)=>{
    const reader=new FileReader();
    reader.onload=e=>res(e.target.result);
    reader.onerror=rej;
    reader.readAsDataURL(file);
  });
  img.src=dataUrl;
  await img.decode();

  const tensor = tf.browser.fromPixels(img).resizeNearestNeighbor([224,224]).expandDims(0).toFloat().div(255.0);
  const preds = await model.predict(tensor).data();
  const topIdx = preds.indexOf(Math.max(...preds));
  return { label: labels[topIdx]||`class_${topIdx}`, confidence: preds[topIdx], dataUrl };
}

// Send text
sendBtn.onclick = async () => {
  const txt = textInput.value.trim();
  const lang = langSelect.value || "en";
  if(!txt) return;
  addBubble(txt,"user");
  textInput.value = "";
  showTyping();
  try{
    const res = await fetch(`${API_URL}/chat`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ message:txt, lang })
    });
    const data = await res.json();
    hideTyping();
    addBubble(data.reply,"bot",true);
  }catch(e){
    hideTyping();
    addBubble("⚠️ Server error.","bot");
  }
};

// Upload image
imgBtn.onclick = () => fileInput.click();
fileInput.onchange = async (ev)=>{
  const file=ev.target.files[0];
  if(!file) return;
  addImageThumb(URL.createObjectURL(file),"user");
  showTyping();
  const result = await classifyFile(file).catch(()=>null);
  hideTyping();
  if(result){
    const html = `🩺 <strong>${result.label}</strong> (${(result.confidence*100).toFixed(1)}%)<br><small>Not a diagnosis. Consult a doctor.</small>`;
    addBubble(html,"bot",true);
  } else {
    addBubble("⚠️ Could not classify image.","bot");
  }
  fileInput.value=null;
};

// Nearby hospitals
hospitalBtn.onclick = ()=>window.open("https://www.google.com/maps/search/hospitals+near+me","_blank");

// Show chat after splash
window.addEventListener("load", ()=>{
  setTimeout(()=>{
    document.getElementById("splash").style.display="none";
    document.getElementById("chatContainer").classList.remove("hidden");
  },3500);
});
