const API_URL = "https://senseai-1.onrender.com";

// Elements
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const fileInput = document.getElementById("fileInput");
const hospitalBtn = document.getElementById("hospitalBtn");

// Helpers
function addBubble(text, who="bot"){
  const d = document.createElement("div");
  d.className = `bubble ${who}`;
  d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Send message
async function sendMessage(){
  const txt = textInput.value.trim();
  if(!txt) return;
  addBubble(txt, "user");
  textInput.value = "";

  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ message: txt, lang: "en" })
    });
    const data = await res.json();
    addBubble(data.reply, "bot");
  } catch(e){
    addBubble("⚠️ Server error.", "bot");
  }
}

// Send with button click
sendBtn.onclick = sendMessage;

// Send with Enter key
textInput.addEventListener("keydown", (e)=>{
  if(e.key === "Enter") sendMessage();
});

// Image upload
imgBtn.onclick = ()=>fileInput.click();
fileInput.onchange = (ev)=>{
  const file = ev.target.files[0];
  if(!file) return;
  addBubble(`📷 Image uploaded: ${file.name}`, "user");
  // you can extend this to actually classify
};

// Nearby hospitals
hospitalBtn.onclick = ()=>{
  window.open("https://www.google.com/maps/search/hospitals+near+me","_blank");
};
