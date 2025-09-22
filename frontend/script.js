// =======================
// CONFIG - update API_URL
// =======================
const API_URL = "https://REPLACE_WITH_RENDER_BACKEND_URL"; // <-- set to your Render backend URL
const MODEL_PATH = "model/model.json";
const META_PATH  = "model/metadata.json";

// UI refs
const splash = document.getElementById("splash");
const appEl = document.getElementById("app");
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const fileInput = document.getElementById("fileInput");
const langSelect = document.getElementById("langSelect");
const hospitalQuickBtn = document.getElementById("hospitalQuickBtn");
const hospitalFloat = document.getElementById("hospitalFloat");

let model = null;
let labels = [];

// -----------------------
// splash -> reveal app
// -----------------------
function revealApp(){
  setTimeout(()=> {
    splash.style.transition = "opacity .6s ease";
    splash.style.opacity = 0;
    appEl.classList.add("revealed");
    appEl.setAttribute("aria-hidden","false");
    setTimeout(()=> splash.style.display = "none", 700);
  }, 2500);
}
revealApp();

// -----------------------
// load metadata & TFJS model
// -----------------------
async function initModel(){
  try{
    const res = await fetch(META_PATH);
    const meta = await res.json();
    labels = meta.labels || [];
    console.log("Loaded labels:", labels);
  }catch(e){
    console.warn("Could not load metadata.json", e);
  }
  try{
    model = await tf.loadLayersModel(MODEL_PATH);
    console.log("TFJS model loaded");
  }catch(e){
    console.warn("TFJS model not loaded (fallback to chat):", e);
    model = null;
  }
}
initModel();

// -----------------------
// UI helpers
// -----------------------
function addBubble(text, who="bot", asHtml=false){
  const d = document.createElement("div");
  d.className = `bubble ${who}`;
  if(asHtml) d.innerHTML = text; else d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function addImageThumb(src, who="user"){
  const d = document.createElement("div");
  d.className = `bubble ${who}`;
  d.innerHTML = `<img class="thumb" src="${src}" />`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function showTypingDots(){
  const d = document.createElement("div");
  d.className = "bubble bot typing-dots-wrapper";
  d.id = "__typing";
  d.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTypingDots(){ const t = document.getElementById("__typing"); if(t) t.remove(); }

// -----------------------
// classify image in browser
// -----------------------
async function classifyFile(file){
  if(!model){
    addBubble("⚠️ No image model loaded in browser.", "bot");
    return null;
  }
  const dataUrl = await new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const tensor = tf.browser.fromPixels(img).resizeNearestNeighbor([224,224]).expandDims(0).toFloat().div(255.0);
  const preds = await model.predict(tensor).data();
  const topIdx = preds.indexOf(Math.max(...preds));
  const confidence = preds[topIdx];
  const label = labels[topIdx] || `class_${topIdx}`;
  return { label, confidence, dataUrl };
}

// -----------------------
// send text -> backend
// -----------------------
sendBtn.addEventListener("click", async ()=>{
  const txt = textInput.value.trim(); const lang = langSelect.value || "en";
  if(!txt) return;
  addBubble(txt, "user"); textInput.value = "";
  showTypingDots();
  try{
    const res = await fetch(`${API_URL}/chat`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ message: txt, lang })
    });
    const data = await res.json();
    hideTypingDots();
    addBubble(data.reply, "bot", true);
  }catch(err){
    hideTypingDots();
    addBubble("⚠️ Server unreachable. Chat works offline for images only.", "bot");
    console.error(err);
  }
});

// send on Enter
textInput.addEventListener("keydown", (e)=>{ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); sendBtn.click(); } });

// -----------------------
// image upload
// -----------------------
imgBtn.addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", async (ev)=>{
  const file = ev.target.files[0]; if(!file) return;
  addImageThumb(URL.createObjectURL(file), "user");
  showTypingDots();
  const result = await classifyFile(file).catch(e=>{ console.error(e); return null; });
  hideTypingDots();
  if(result){
    const html = `🩺 <strong>${result.label}</strong> (${(result.confidence*100).toFixed(1)}%)<br><small>Not a diagnosis. Consult a clinician.</small>`;
    addBubble(html, "bot", true);
    // log to backend (best-effort)
    fetch(`${API_URL}/image-log`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(result) }).catch(()=>{});
  } else {
    addBubble("⚠️ Could not classify the image locally.", "bot");
  }
  fileInput.value = null;
});

// -----------------------
// hospital quick: geolocation -> open Google Maps search
// -----------------------
function openGoogleMapsSearch(lat, lon){
  // prefer direct directions if lat/lon provided, else generic search
  if(lat && lon){
    // use search for nearby hospitals centered on coordinates
    const q = `https://www.google.com/maps/search/hospitals+near+me/@${lat},${lon},13z`;
    window.open(q, "_blank");
  } else {
    window.open("https://www.google.com/maps/search/hospitals+near+me", "_blank");
  }
}

async function locateAndOpenMaps(){
  addBubble("🔎 Locating nearest hospitals...", "bot");
  if(!navigator.geolocation){
    addBubble("⚠️ Geolocation not available. Opening general search.", "bot");
    openGoogleMapsSearch();
    return;
  }
  showTypingDots();
  navigator.geolocation.getCurrentPosition((pos)=>{
    hideTypingDots();
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    addBubble("Opening Google Maps for nearest hospitals...", "bot");
    openGoogleMapsSearch(lat, lon);
  }, (err)=>{
    hideTypingDots();
    addBubble("⚠️ Location permission denied — opening general search.", "bot");
    openGoogleMapsSearch();
  }, { enableHighAccuracy:true, timeout:10000 });
}

hospitalQuickBtn.addEventListener("click", locateAndOpenMaps);
hospitalFloat.addEventListener("click", locateAndOpenMaps);

// -----------------------
// responsive tweaks
// -----------------------
function adjustLayout(){
  if(window.innerWidth < 720){
    document.querySelector(".app").style.maxWidth = "100%";
  } else {
    document.querySelector(".app").style.maxWidth = "900px";
  }
}
window.addEventListener("resize", adjustLayout);
adjustLayout();

