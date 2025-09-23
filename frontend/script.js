// Backend config
const API_URL = "https://senseai-backend.onrender.com"; // replace with your Render backend URL

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
  d.innerHTML = `<img class="thumb" src="${dataUrl}" style="max-width:150px;border-radius:10px;" />`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Send text
async function sendMessage(){
  const txt = textInput.value.trim();
  const lang = langSelect.value || "en";
  if(!txt) return;
  addBubble(txt,"user");
  textInput.value = "";
  try{
    const res = await fetch(`${API_URL}/chat`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ message:txt, lang })
    });
    const data = await res.json();
    addBubble(data.reply,"bot",true);
  }catch(e){
    addBubble("⚠️ Server error.","bot");
  }
}

sendBtn.onclick = sendMessage;
textInput.addEventListener("keypress", (e)=>{
  if(e.key==="Enter") sendMessage();
});

// Upload image
imgBtn.onclick = () => fileInput.click();
fileInput.onchange = async (ev)=>{
  const file=ev.target.files[0];
  if(!file) return;
  addImageThumb(URL.createObjectURL(file),"user");
  // you can connect backend / ML model here if needed
  addBubble("📷 Image uploaded. (Processing feature coming soon)","bot");
  fileInput.value=null;
};

// Nearby hospitals
hospitalBtn.onclick = ()=>window.open("https://www.google.com/maps/search/hospitals+near+me","_blank");
