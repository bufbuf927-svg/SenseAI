# backend/app.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests
import re
import logging
from typing import Optional

# --- logging --------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("senseai-backend")

# --- app init ------------------------------------------------------------
app = FastAPI(title="SenseAI Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HF_TOKEN = os.getenv("HF_API_TOKEN", "")  # put your Hugging Face token here (optional but recommended)
HF_MODEL = os.getenv("HF_MODEL", "google/flan-t5-base")  # model to call (you can change)

# --- request model -------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    lang: str = "en"

# --- helper: call HF inference API --------------------------------------
def call_hf_inference(text: str, max_new_tokens: int = 200) -> Optional[str]:
    """
    Call Hugging Face Inference API for a text generation model.
    Returns generated text or None on failure / no token.
    """
    if not HF_TOKEN:
        logger.debug("HF_TOKEN not set — skipping HF inference.")
        return None
    url = f"https://api-inference.huggingface.co/models/{HF_MODEL}"
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    payload = {
        "inputs": text,
        "parameters": {"max_new_tokens": max_new_tokens, "temperature": 0.3, "do_sample": False},
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        if resp.status_code != 200:
            logger.warning("HF inference returned status %s: %s", resp.status_code, resp.text)
            return None
        data = resp.json()
        # HF sometimes returns a list of dicts with generated_text
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            if "generated_text" in data[0]:
                return data[0]["generated_text"]
            # some endpoints return {'generated_text': '...'} inside list
        if isinstance(data, dict) and "generated_text" in data:
            return data["generated_text"]
        # Sometimes HF returns plain string or other shape
        if isinstance(data, str):
            return data
        # try fallback parsing
        if isinstance(data, list) and isinstance(data[0], str):
            return data[0]
        logger.warning("Unexpected HF response shape: %s", type(data))
    except Exception as e:
        logger.exception("Error calling HF Inference: %s", e)
    return None

# --- helper: rule based replies -----------------------------------------
def rule_based_reply(text: str) -> Optional[str]:
    """
    Specific, conservative rule-based replies.
    Return None when we want to allow the NLP model to handle the query.
    Use lower-cased text for matching.
    """
    t = text.lower()

    # Emergency / red flags (high priority)
    emergency_phrases = [
        "chest pain", "difficulty breathing", "shortness of breath",
        "severe bleeding", "unconscious", "loss of consciousness",
        "sudden weakness", "sudden numbness", "slurred speech",
        "severe abdominal pain", "severe headache", "seizure", "fainting",
        "not breathing", "no pulse"
    ]
    for p in emergency_phrases:
        if p in t:
            return (
                "⚠️ If someone has sudden chest pain, severe difficulty breathing, "
                "loss of consciousness, seizure or heavy bleeding — call emergency services immediately (e.g., 112). "
                "This is not a diagnosis. Seek urgent medical attention."
            )

    # Suicidal or self-harm — high priority (non-judgmental, encourage help)
    if re.search(r"\b(suicid|kill myself|end my life|self harm|hurting myself)\b", t):
        return (
            "If you are thinking about harming yourself, please seek help immediately. "
            "Contact local emergency services or a crisis hotline right now and tell someone you trust. "
            "You are not alone. If you are in India, dial 112, or contact a local crisis helpline."
        )

    # Clear greetings
    if re.search(r"\b(hi|hello|hey|good morning|good afternoon|good evening)\b", t):
        return "👋 Hello! I can help with symptoms, vaccine info, and image checks. How can I assist you?"

    # Symptom-specific (conservative)
    if re.search(r"\b(feve?r|temperature|febrile)\b", t):
        return "Fever often indicates infection. Rest, keep hydrated, and measure temperature. If temperature is very high (>39°C), persistent, or the person is very unwell, seek medical care."

    if re.search(r"\b(cough|sore throat|hoarseness|shortness of breath|wheez)\b", t):
        return "Coughs have many causes (viral, bacterial, allergies). If cough lasts >2 weeks, is getting worse, or there's blood or severe breathlessness, see a clinician."

    if re.search(r"\b(diarrh|vomit|nausea|stomach pain)\b", t):
        return "For vomiting/diarrhoea: stay hydrated (oral rehydration), rest, and seek care if symptoms are severe, include high fever, blood, or signs of dehydration."

    if re.search(r"\b(rash|skin rash|hives|itch)\b", t):
        return "Rashes can be due to infections, allergies or other causes. Keep the area clean, avoid irritants, and seek medical advice if it spreads rapidly or is accompanied by fever."

    if re.search(r"\b(vaccine|vaccination|immunization|immunise|schedule)\b", t):
        return (
            "Vaccination protects against many diseases. For children, follow your national immunization schedule "
            "— commonly including vaccines like BCG, DTP, Polio, Measles. For specific schedules in your country, "
            "check local health authority guidance or ask for details."
        )

    if re.search(r"\b(pregnan|pregnancy|deliver|labor|contraction)\b", t):
        return "Pregnancy-related questions are important — please consult an obstetrician/midwife or your local health clinic for personalized care."

    if re.search(r"\b(poison|ingest|poisoning|swallowed)\b", t):
        return "If someone swallowed a poisonous substance, call your local poison control number or emergency services immediately."

    # Medication / side-effects
    if re.search(r"\b(side effect|allergic|reaction|rash after|medication)\b", t):
        return "If you suspect a medication side-effect, stop the medication if severe and contact a healthcare professional or poison control for advice."

    # If question is short and not recognized, prefer rules only for short phrases
    # otherwise let the NLP handle it (return None)
    # e.g., "What is malaria?" -> None (let model generate an informative answer)
    short_query = len(t.split()) <= 3
    if short_query and re.search(r"\b(what|who|where|when|why|how)\b", t):
        return None

    # default: no rule matched -> return None so HF can answer
    return None

# --- routes --------------------------------------------------------------
@app.post("/chat")
def chat(req: ChatRequest):
    # translate to English if needed (best-effort)
    text_en = req.message
    if req.lang and req.lang != "en":
        try:
            from deep_translator import GoogleTranslator
            text_en = GoogleTranslator(source="auto", target="en").translate(req.message)
        except Exception as e:
            logger.warning("Translation to English failed: %s", e)
            text_en = req.message

    # 1) Try rule-based (conservative, high-priority)
    reply_en = rule_based_reply(text_en)
    source = "rule" if reply_en else None

    # 2) If rules did not match, call HF (if token available)
    if not reply_en:
        ai = call_hf_inference(text_en)
        if ai:
            reply_en = ai
            source = "hf"

    # 3) Final fallback
    if not reply_en:
        reply_en = (
            "I can help with symptoms, vaccines, and interpreting uploaded images. "
            "Could you give more detail or upload an image? This is not medical advice."
        )
        source = "fallback"

    # translate back to user's language if needed
    reply_out = reply_en
    if req.lang and req.lang != "en":
        try:
            from deep_translator import GoogleTranslator
            reply_out = GoogleTranslator(source="en", target=req.lang).translate(reply_en)
        except Exception as e:
            logger.warning("Translation to user language failed: %s", e)
            reply_out = reply_en

    # include short disclaimer always
    disclaimer = "\n\n⚠️ This is not a medical diagnosis. For personal medical advice, consult a licensed clinician."
    # some HF answers already may contain disclaimers; keep ours short
    if disclaimer.strip() not in reply_out:
        reply_out = reply_out.strip() + disclaimer

    logger.info("CHAT: source=%s input=%s reply=%s", source, text_en, (reply_en or "")[:200])
    return {"reply": reply_out, "source": source}

@app.post("/image-log")
def image_log(payload: dict):
    # simple logging; extend to persistent storage if needed
    logger.info("Image log: %s", payload)
    return {"ok": True}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

