# backend/app.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, requests
from deep_translator import GoogleTranslator

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HF_TOKEN = os.getenv("HF_API_TOKEN", "")  # optional: set in Render dashboard for better AI replies

class ChatRequest(BaseModel):
    message: str
    lang: str = "en"

def call_hf_inference(text):
    if not HF_TOKEN:
        return None
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    payload = {"inputs": text}
    resp = requests.post("https://api-inference.huggingface.co/models/google/flan-t5-small", headers=headers, json=payload, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list) and "generated_text" in data[0]:
            return data[0]["generated_text"]
    return None

def rule_based_reply(text):
    t = text.lower()
    if "fever" in t:
        return "Fever can be caused by infections like dengue, malaria, or flu. Stay hydrated and seek care if high or persistent."
    if "cough" in t:
        return "A cough may be viral or bacterial. If it lasts > 2 weeks or has blood, see a doctor."
    if "vaccine" in t:
        return "Vaccination protects against many diseases. For children: polio, measles, DPT as per national schedule."
    if "dengue" in t:
        return "Dengue symptoms: high fever, joint pain, rash. Use mosquito control and consult local clinic if suspected."
    return "I can help with symptoms, vaccines, and image checks. Could you provide more detail or upload an image?"

@app.post("/chat")
def chat(req: ChatRequest):
    translator = GoogleTranslator(source="auto", target="en")
    # translate to English if needed
    if req.lang != "en":
        try:
            text_en = translator.translate(req.message)
        except Exception:
            text_en = req.message
    else:
        text_en = req.message

    # first try HF if token present
    ai = call_hf_inference(text_en)
    if ai:
        reply_en = ai
    else:
        reply_en = rule_based_reply(text_en)

    # translate back if needed
    if req.lang != "en":
        try:
            reply_local = GoogleTranslator(source="en", target=req.lang).translate(reply_en)
        except Exception:
            reply_local = reply_en
    else:
        reply_local = reply_en

    return {"reply": reply_local}

# optional endpoint to receive image logs from frontend
@app.post("/image-log")
def image_log(payload: dict):
    # simple logging endpoint (no-op) — useful for storing usage => extend later
    print("Image log:", payload)
    return {"ok": True}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}
