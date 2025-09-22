from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, requests
from deep_translator import GoogleTranslator

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")

class ChatRequest(BaseModel):
    message: str
    lang: str = "en"

def call_gemini(text: str):
    if not GEMINI_KEY:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}"
    headers = {"Content-Type": "application/json"}
    data = {
        "contents": [{"parts": [{"text": text}]}]
    }
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=30)
        if resp.status_code == 200:
            out = resp.json()
            return out["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        print("Gemini error:", e)
    return None

def rule_based_reply(text: str):
    t = text.lower()

    # Greetings / general
    if any(word in t for word in ["hello", "hi", "hey", "good morning", "good evening"]):
        return "👋 Hello! I'm SenseAI, your health assistant. How can I help you today?"
    if "how are you" in t:
        return "I'm doing well and ready to help you. How are you feeling today?"

    # Fever / flu
    if "fever" in t:
        return "Fever may signal infections like flu, malaria, or dengue. Rest, hydrate, and see a doctor if severe or persistent."
    if "cold" in t or "flu" in t:
        return "Common cold/flu often improves with rest and fluids. Seek medical advice if high fever, chest pain, or difficulty breathing."
    if "temperature" in t:
        return "A normal body temperature is around 36.5–37.5°C. Anything above 38°C is considered fever."

    # Cough / respiratory
    if "cough" in t:
        return "Cough can be viral, allergic, or bacterial. If it lasts more than 2 weeks or includes blood, consult a doctor."
    if "asthma" in t:
        return "Asthma causes breathing difficulty. Keep inhalers handy and avoid triggers like dust, smoke, or cold air."
    if "breathing" in t or "shortness of breath" in t:
        return "Shortness of breath can be serious. Please seek immediate medical attention if sudden or severe."

    # Stomach / digestion
    if "diarrhea" in t or "loose motion" in t:
        return "Stay hydrated with clean fluids. Oral rehydration solution (ORS) is recommended. See a doctor if severe."
    if "vomiting" in t or "nausea" in t:
        return "Vomiting may be due to infection or food poisoning. Sip fluids slowly and seek care if persistent."
    if "stomach pain" in t or "abdominal pain" in t:
        return "Mild stomach pain may be due to indigestion. Severe or persistent pain requires medical evaluation."

    # Chronic diseases
    if "diabetes" in t:
        return "Diabetes requires regular sugar monitoring, healthy diet, and exercise. Consult a doctor for medication guidance."
    if "blood pressure" in t or "hypertension" in t:
        return "High BP can damage heart and kidneys. Reduce salt, manage stress, and check with a doctor regularly."
    if "cholesterol" in t:
        return "High cholesterol increases heart disease risk. Eat less fried food, exercise, and consider regular checkups."

    # Women's health
    if "period" in t or "menstruation" in t:
        return "Menstrual cramps can be eased with warm compress, hydration, and rest. If very painful, consult a gynecologist."
    if "pregnant" in t or "pregnancy" in t:
        return "During pregnancy: eat nutritious food, take prenatal vitamins, and attend regular checkups."
    if "breastfeeding" in t:
        return "Breastfeeding is healthy for both mother and baby. Drink fluids, eat balanced meals, and rest when possible."

    # Kids health
    if "child vaccine" in t or "vaccination" in t:
        return "Children should get vaccines as per schedule: polio, measles, DPT, hepatitis, etc. Ask your doctor for the full chart."
    if "measles" in t:
        return "Measles symptoms: fever, rash, cough, red eyes. Vaccination prevents it. Seek medical care if suspected."

    # Infections
    if "dengue" in t:
        return "Dengue signs: high fever, rash, joint pain. Avoid self-medication. Seek medical help immediately."
    if "malaria" in t:
        return "Malaria: fever, chills, sweating. Prevent mosquito bites and see a doctor for testing if suspected."
    if "covid" in t or "corona" in t:
        return "COVID-19 symptoms: fever, cough, loss of taste/smell, breathing issues. Get tested if suspected."

    # First aid
    if "headache" in t:
        return "Mild headache: rest, hydrate, avoid screen strain. Severe or sudden headache needs urgent medical care."
    if "burn" in t:
        return "For small burns: cool with running water for 10 minutes. Do not apply ice or toothpaste."
    if "cut" in t or "wound" in t:
        return "Wash gently with clean water, apply antiseptic, and cover. Seek care if deep or bleeding heavily."

    # Lifestyle
    if "exercise" in t:
        return "Regular exercise (30 min daily) helps control weight, BP, and stress."
    if "diet" in t or "food" in t:
        return "Eat a balanced diet: vegetables, fruits, whole grains, lean proteins. Limit junk food and sugar."
    if "water" in t or "drink" in t:
        return "Drink at least 2–3 liters of safe water daily to stay hydrated."
    if "sleep" in t:
        return "Adults need 7–9 hours of quality sleep. Maintain a regular sleep schedule."

    # Mental health
    if "stress" in t or "anxiety" in t:
        return "Try relaxation, meditation, and regular breaks. If severe, seek counseling."
    if "depression" in t:
        return "Depression is treatable. Please talk to a trusted person or mental health professional."

    # Emergency
    if "heart attack" in t or "chest pain" in t:
        return "⚠️ Chest pain or suspected heart attack is a medical emergency. Call emergency services immediately."
    if "stroke" in t:
        return "Stroke signs: sudden weakness, slurred speech, facial droop. Seek emergency care immediately."

    # Default
    return None


@app.post("/chat")
def chat(req: ChatRequest):
    # Translate user input to English
    text_en = req.message
    if req.lang != "en":
        try:
            text_en = GoogleTranslator(source="auto", target="en").translate(req.message)
        except:
            pass

    # Rule-based first
    reply_en = rule_based_reply(text_en)

    # Fallback to Gemini
    if not reply_en:
        ai = call_gemini(text_en)
        reply_en = ai or "I can help with symptoms, vaccines, and image checks."

    # Translate back to user’s language
    reply_out = reply_en
    if req.lang != "en":
        try:
            reply_out = GoogleTranslator(source="en", target=req.lang).translate(reply_en)
        except:
            pass

    return {"reply": reply_out}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}
