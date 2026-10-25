import os
import sys
import subprocess
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import requests

from flask import Flask, jsonify, request, send_from_directory


# --------------------------------------------------
# Project paths
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SRC_DIR = os.path.join(BASE_DIR, "src")
PAGES_DIR = os.path.join(SRC_DIR, "pages")
STYLES_DIR = os.path.join(SRC_DIR, "styles")
SCRIPTS_DIR = os.path.join(SRC_DIR, "scripts")
IMAGES_DIR = os.path.join(SRC_DIR, "images")

MODEL_PATH = os.path.join(BASE_DIR, "pothos_rf_models.joblib")
TRAIN_SCRIPT = os.path.join(BASE_DIR, "train_pothos_models.py")
SYSTEM_PROMPT_PATH = os.path.join(BASE_DIR, "sysprmt.txt")
API_KEY_PATH = os.path.join(BASE_DIR, "gemini_key.txt")

app = Flask(__name__)


# --------------------------------------------------
# Gemini settings
# --------------------------------------------------
# The API key is read from gemini_key.txt (next to this file) on every
# request and is never sent to the browser. Put only the key in that file.
# If the file is missing or empty, the GEMINI_API_KEY environment variable
# is used instead. GEMINI_MODEL can be changed without editing this file.

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)
GEMINI_TIMEOUT_SECONDS = 30

# Thinking level. Leave both as None to use the model's default.
# Set ONE of these, depending on which model family GEMINI_MODEL points to:
#   Gemini 3 models:   GEMINI_THINKING_LEVEL = "low"  (e.g. "low" or "high";
#                      the allowed values vary by model)
#   Gemini 2.5 models: GEMINI_THINKING_BUDGET = 0     (0 = off, higher = more
#                      thinking tokens, -1 = let the model decide)
# An unsupported setting for your model makes Gemini return a 400 error.
GEMINI_THINKING_LEVEL = "High"
GEMINI_THINKING_BUDGET = None

# Max tokens in the response. Lower = shorter, cut off mid-sentence if hit.
GEMINI_MAX_OUTPUT_TOKENS = 1024


# --------------------------------------------------
# Train the models if the saved model is missing
# --------------------------------------------------

def ensure_model_exists():
    if os.path.exists(MODEL_PATH):
        print("Found existing pothos model.")
        return

    if not os.path.isfile(TRAIN_SCRIPT):
        raise FileNotFoundError(
            f"Model file is missing: {MODEL_PATH}\n"
            f"Training script not found: {TRAIN_SCRIPT}"
        )

    print("Model file not found. Training models now...")

    subprocess.run(
        [sys.executable, TRAIN_SCRIPT],
        cwd=BASE_DIR,
        check=True,
    )

    if not os.path.isfile(MODEL_PATH):
        raise FileNotFoundError(
            "Training completed, but the model file was not created. "
            "Check the save path in train_pothos_models.py."
        )

    print("Model training completed successfully.")


ensure_model_exists()


# --------------------------------------------------
# Load the trained models
# --------------------------------------------------

bundle = joblib.load(MODEL_PATH)

growth_model = bundle["growth_model"]
leaf_count_model = bundle["leaf_count_model"]
feature_columns = bundle["feature_columns"]

print("Pothos prediction models loaded successfully.")


# --------------------------------------------------
# Accepted input values
# --------------------------------------------------

ALLOWED_POTS = [4, 6, 8, 10, 12]
ALLOWED_HUMIDITY = ["Low", "Average", "High"]

LIMITS = {
    "Age_Days": (1, 358),
    "Stem_Length_Inches": (0.1, 500),
    "Leaf_Count": (0, 500),
    "Light_Lux": (300, 10000),
    "Watering_Volume_mL": (100, 600),
    "Watering_Freq_Days": (4, 14),
    "Temperature_F": (62, 85),
}

REQUIRED_FIELDS = [
    "Age_Days",
    "Stem_Length_Inches",
    "Leaf_Count",
    "Pot_Size_Inches",
    "Light_Lux",
    "Watering_Volume_mL",
    "Watering_Freq_Days",
    "Temperature_F",
    "Humidity_Level",
]


# --------------------------------------------------
# Input validation and model prediction
# (shared by /api/predict and /api/summarize)
# --------------------------------------------------

class InputError(Exception):
    """The request body failed validation."""


def parse_inputs(payload):
    """Validate a request body and return a clean dict of inputs."""
    if not isinstance(payload, dict):
        raise InputError("Expected a JSON request body.")

    missing = [key for key in REQUIRED_FIELDS if key not in payload]

    if missing:
        raise InputError("Missing inputs: " + ", ".join(missing))

    # Convert and validate numeric values
    numeric = {}

    try:
        for key in REQUIRED_FIELDS:
            if key == "Humidity_Level":
                continue

            value = float(payload[key])

            if not np.isfinite(value):
                raise ValueError(f"{key} must be a finite number.")

            numeric[key] = value

    except (ValueError, TypeError, OverflowError):
        raise InputError(
            "All numeric inputs must be valid finite numbers."
        ) from None

    # Validate configured ranges
    for key, (minimum, maximum) in LIMITS.items():
        if not minimum <= numeric[key] <= maximum:
            raise InputError(
                f"{key} must be between {minimum} and {maximum}."
            )

    # Validate whole-number inputs
    if not numeric["Age_Days"].is_integer():
        raise InputError("Age_Days must be a whole number.")

    if not numeric["Leaf_Count"].is_integer():
        raise InputError("Leaf_Count must be a whole number.")

    # Validate pot size
    if numeric["Pot_Size_Inches"] not in ALLOWED_POTS:
        raise InputError("Unsupported pot size.")

    # Validate humidity
    humidity = payload["Humidity_Level"]

    if not isinstance(humidity, str) or humidity not in ALLOWED_HUMIDITY:
        raise InputError("Unsupported humidity level.")

    return {**numeric, "Humidity_Level": humidity}


def run_models(inputs):
    """Run both Random Forest models on validated inputs."""
    features = pd.DataFrame([inputs])

    # Match the categorical encoding used in training
    features = pd.get_dummies(
        features,
        columns=["Humidity_Level"],
        dtype=int,
    )

    # Preserve training feature names and order
    features = features.reindex(
        columns=feature_columns,
        fill_value=0,
    )

    predicted_growth = max(
        0.0,
        float(growth_model.predict(features)[0]),
    )

    predicted_total_leaves = max(
        0.0,
        float(leaf_count_model.predict(features)[0]),
    )

    return {
        "predicted_growth_inches": round(predicted_growth, 2),
        "predicted_total_leaf_count": round(predicted_total_leaves, 2),
        "rounded_predicted_total_leaf_count": int(
            np.floor(predicted_total_leaves + 0.5)
        ),
    }


# --------------------------------------------------
# Gemini helpers
# --------------------------------------------------

class GeminiError(Exception):
    """Something went wrong producing the summary."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


def load_system_prompt():
    """Read sysprmt.txt fresh on every call so edits apply immediately."""
    try:
        with open(SYSTEM_PROMPT_PATH, encoding="utf-8") as file:
            prompt = file.read().strip()
    except OSError:
        app.logger.error("Could not read %s", SYSTEM_PROMPT_PATH)
        raise GeminiError(
            "The summary service is missing its system prompt file "
            "(sysprmt.txt).",
            500,
        ) from None

    if not prompt:
        raise GeminiError("sysprmt.txt is empty.", 500)

    return prompt


def load_api_key():
    """Read the key from gemini_key.txt, falling back to the environment."""
    try:
        # utf-8-sig ignores the invisible BOM that Windows Notepad can add.
        with open(API_KEY_PATH, encoding="utf-8-sig") as file:
            key = file.read().strip().strip("\"'")
    except OSError:
        key = ""

    return key or os.environ.get("GEMINI_API_KEY", "").strip()


def fmt(value):
    """12.0 -> '12', 2500.0 -> '2,500', 24.5 -> '24.5'."""
    return f"{value:,.3f}".rstrip("0").rstrip(".")


def build_user_prompt(inputs, outputs):
    """Turn validated inputs and model outputs into the data block that
    Gemini summarizes. Every value here is a validated number or one of
    a fixed set of words, so no free text from the browser reaches it."""
    growth = outputs["predicted_growth_inches"]
    projected_length = round(inputs["Stem_Length_Inches"] + growth, 2)

    lines = [
        "Current date and time: "
        f"{datetime.now().astimezone().strftime('%A, %B %d, %Y, %I:%M %p %Z')}",
        "",
        "CONDITIONS ENTERED BY THE USER",
        f"Plant age: {fmt(inputs['Age_Days'])} days",
        f"Total vine length: {fmt(inputs['Stem_Length_Inches'])} inches",
        f"Leaf count entered by the user: {fmt(inputs['Leaf_Count'])}",
        f"Pot diameter: {fmt(inputs['Pot_Size_Inches'])} inches",
        f"Light level: {fmt(inputs['Light_Lux'])} lux",
        f"Water per watering: {fmt(inputs['Watering_Volume_mL'])} mL",
        f"Watering interval: every {fmt(inputs['Watering_Freq_Days'])} days",
        f"Temperature: {fmt(inputs['Temperature_F'])} degrees F",
        f"Humidity level: {inputs['Humidity_Level']}",
        "",
        "MODEL OUTPUTS",
        f"Predicted stem growth over the next 7 days: {fmt(growth)} inches",
        f"Projected vine length after 7 days: {fmt(projected_length)} inches",
        "Estimated total leaf count (current): "
        f"{fmt(outputs['predicted_total_leaf_count'])}",
        "Whole-leaf estimate (current): "
        f"{outputs['rounded_predicted_total_leaf_count']}",
    ]

    return "\n".join(lines)


def extract_text(data):
    """Pull the reply text out of a generateContent response."""
    candidates = data.get("candidates") or []

    if not candidates:
        reason = (data.get("promptFeedback") or {}).get("blockReason")
        app.logger.error("Gemini returned no candidates (%s)", reason)
        raise GeminiError("The summary service returned no summary.")

    parts = (candidates[0].get("content") or {}).get("parts") or []

    text = "".join(
        part.get("text", "")
        for part in parts
        if not part.get("thought")
    ).strip()

    # Gemini sometimes writes HTML entities such as "&nbsp;" as spacing.
    # The page escapes raw HTML, so they would show up as literal text.
    text = text.replace("&nbsp;", " ")

    if not text:
        app.logger.error(
            "Gemini reply was empty (finishReason=%s)",
            candidates[0].get("finishReason"),
        )
        raise GeminiError("The summary service returned an empty summary.")

    return text


def call_gemini(system_prompt, user_prompt):
    """One standalone Gemini request.

    Every call is isolated: it sends a single POST containing the system
    prompt and one user message. No chat session, history, or cached
    context is kept between calls, so one request can never see another.
    """
    api_key = load_api_key()

    if not api_key:
        app.logger.error("No API key found in %s", API_KEY_PATH)
        raise GeminiError(
            "The summary service isn't configured "
            "(gemini_key.txt is missing or empty on the server).",
            503,
        )

    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
    }

    thinking = {}

    if GEMINI_THINKING_LEVEL:
        thinking["thinkingLevel"] = GEMINI_THINKING_LEVEL

    if GEMINI_THINKING_BUDGET is not None:
        thinking["thinkingBudget"] = GEMINI_THINKING_BUDGET

    if thinking:
        body["generationConfig"] = {"thinkingConfig": thinking}

    try:
        response = requests.post(
            GEMINI_URL.format(model=GEMINI_MODEL),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json=body,
            timeout=GEMINI_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        raise GeminiError(
            "The summary service took too long to respond.", 504
        ) from None
    except requests.RequestException:
        app.logger.exception("Could not reach the Gemini API.")
        raise GeminiError("Couldn't reach the summary service.") from None

    if response.status_code != 200:
        app.logger.error(
            "Gemini API error %s: %s",
            response.status_code,
            response.text[:500],
        )

        if response.status_code == 429:
            raise GeminiError(
                "The summary service is busy. Try again in a moment.", 429
            )

        raise GeminiError("The summary service returned an error.")

    try:
        data = response.json()
    except ValueError:
        raise GeminiError(
            "The summary service sent an unreadable response."
        ) from None

    return extract_text(data)


# --------------------------------------------------
# Website routes
# --------------------------------------------------

@app.get("/")
def home():
    return send_from_directory(PAGES_DIR, "prediction.html")


@app.get("/mainPage.html")
def main_page():
    return send_from_directory(SRC_DIR, "mainPage.html")


@app.get("/styles/<path:filename>")
def serve_styles(filename):
    return send_from_directory(STYLES_DIR, filename)


@app.get("/scripts/<path:filename>")
def serve_scripts(filename):
    return send_from_directory(SCRIPTS_DIR, filename)


@app.get("/images/<path:filename>")
def serve_images(filename):
    return send_from_directory(IMAGES_DIR, filename)


@app.get("/pages/<path:filename>")
def serve_pages(filename):
    return send_from_directory(PAGES_DIR, filename)


# --------------------------------------------------
# Prediction API
# --------------------------------------------------

@app.post("/api/predict")
def predict():
    try:
        inputs = parse_inputs(request.get_json(silent=True))
    except InputError as error:
        return jsonify({"error": str(error)}), 400

    return jsonify(run_models(inputs))


# --------------------------------------------------
# Summary API (Gemini)
# --------------------------------------------------
# The browser sends the same inputs it sent to /api/predict. The server
# validates them, re-runs the models itself, and summarizes those outputs,
# so the prompt is always built from real model results.

@app.post("/api/summarize")
def summarize():
    try:
        inputs = parse_inputs(request.get_json(silent=True))
    except InputError as error:
        return jsonify({"error": str(error)}), 400

    outputs = run_models(inputs)

    try:
        summary = call_gemini(
            load_system_prompt(),
            build_user_prompt(inputs, outputs),
        )
    except GeminiError as error:
        return jsonify({"error": error.message}), error.status

    return jsonify({"summary": summary})


# --------------------------------------------------
# Run the development server
# --------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True)