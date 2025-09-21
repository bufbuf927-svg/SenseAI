from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, requests
from deep_translator import GoogleTranslator

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HF_TOKEN = os.getenv("HF_API_TOKEN", "")  # optional

class ChatRequest(BaseModel):
    message: str
    lang: str = "en"

def call_hf_inference(text: str):
    if not HF_TOKEN: return None
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    resp = requests.post(
        "https://api-inference.huggingface.co/models/google/flan-t5-small",
        headers=headers, json={"inputs": text}, timeout=30
    )
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list) and "generated_text" in data[0]:
            return data[0]["generated_text"]
    return None

def rule_based_reply(text: str):
    t = text.lower()
    if "hello" in t or "hi" in t: return "👋 Hello! How can I help you today?"
    if "fever" in t: return "Fever may signal infections like dengue or flu. Rest, hydrate, and see a doctor if severe."
    if "cough" in t: return "Cough can be viral or bacterial. If >2 weeks or blood present, consult a doctor."
    if "vaccine" in t: return "Vaccines prevent many diseases. Children: polio, measles, DPT as per schedule."
    if "dengue" in t: return "Dengue signs: fever, rash, joint pain. Seek medical help if suspected."
    return None

@app.post("/chat")
def chat(req: ChatRequest):
    # translate to English
    text_en = req.message
    if req.lang != "en":
        try: text_en = GoogleTranslator(source="auto", target="en").translate(req.message)
        except: pass

    # rule-based first
    reply_en = rule_based_reply(text_en)

    # fallback to HF
    if not reply_en:
        ai = call_hf_inference(text_en)
        reply_en = ai or "I can help with symptoms, vaccines, and image checks."

    # translate back
    reply_out = reply_en
    if req.lang != "en":
        try: reply_out = GoogleTranslator(source="en", target=req.lang).translate(reply_en)
        except: pass

    return {"reply": reply_out}

@app.post("/image-log")
def image_log(payload: dict):
    print("Image log:", payload)
    return {"ok": True}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}
