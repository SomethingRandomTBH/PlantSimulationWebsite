
import os
import sys
import subprocess

import joblib
import numpy as np
import pandas as pd
import requests

from flask import Flask, jsonify, request, send_from_directory


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

ALLOWED_POTS = [4, 6, 8, 10, 12]
ALLOWED_HUMIDITY = ["Low", "Average", "High"]
AVERAGE_LEAF_SPACING_INCHES = 1.2

LIMITS = {
    "Age_Days": (1, 750),
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

GEMINI_MODEL = os.environ.get(
    "GEMINI_MODEL", "gemini-3.5-flash-lite"
)
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)
GEMINI_TIMEOUT_SECONDS = 30
GEMINI_MAX_OUTPUT_TOKENS = 1024
GEMINI_THINKING_LEVEL = os.environ.get("GEMINI_THINKING_LEVEL")
GEMINI_THINKING_BUDGET = os.environ.get("GEMINI_THINKING_BUDGET")


def ensure_model_exists():
    if os.path.isfile(MODEL_PATH):
        print("Found existing pothos model.")
        return

    if not os.path.isfile(TRAIN_SCRIPT):
        raise FileNotFoundError(
            f"Model file missing: {MODEL_PATH}\n"
            f"Training script missing: {TRAIN_SCRIPT}"
        )

    print("Model missing. Training now...")
    subprocess.run(
        [sys.executable, TRAIN_SCRIPT],
        cwd=BASE_DIR,
        check=True,
    )

    if not os.path.isfile(MODEL_PATH):
        raise FileNotFoundError(
            "Training finished but did not create pothos_rf_models.joblib."
        )

    print("Model training completed.")


ensure_model_exists()

bundle = joblib.load(MODEL_PATH)

if not isinstance(bundle, dict):
    raise ValueError("The model bundle must be a dictionary.")

if "growth_model" not in bundle or "feature_columns" not in bundle:
    raise ValueError(
        "Model bundle must contain growth_model and feature_columns. "
        "Check train_pothos_models.py."
    )

growth_model = bundle["growth_model"]
feature_columns = list(bundle["feature_columns"])

if not feature_columns:
    raise ValueError("The model bundle has no feature columns.")

print("Pothos stem-growth model loaded.")


class InputError(Exception):
    pass


def parse_inputs(payload):
    if not isinstance(payload, dict):
        raise InputError("Expected a JSON request body.")

    missing = [key for key in REQUIRED_FIELDS if key not in payload]
    if missing:
        raise InputError("Missing inputs: " + ", ".join(missing))

    numeric = {}
    try:
        for key in REQUIRED_FIELDS:
            if key != "Humidity_Level":
                value = float(payload[key])
                if not np.isfinite(value):
                    raise ValueError
                numeric[key] = value
    except (ValueError, TypeError, OverflowError):
        raise InputError(
            "All numeric inputs must be valid finite numbers."
        ) from None

    for key, (minimum, maximum) in LIMITS.items():
        if not minimum <= numeric[key] <= maximum:
            raise InputError(
                f"{key} must be between {minimum} and {maximum}."
            )

    if not numeric["Age_Days"].is_integer():
        raise InputError("Age_Days must be a whole number.")

    if not numeric["Leaf_Count"].is_integer():
        raise InputError("Leaf_Count must be a whole number.")

    if numeric["Pot_Size_Inches"] not in ALLOWED_POTS:
        raise InputError("Unsupported pot size.")

    humidity = payload["Humidity_Level"]
    if not isinstance(humidity, str) or humidity not in ALLOWED_HUMIDITY:
        raise InputError("Unsupported humidity level.")

    return {**numeric, "Humidity_Level": humidity}


def run_model(inputs):
    row = {
        "Age_Days": inputs["Age_Days"],
        "Stem_Length_Inches": inputs["Stem_Length_Inches"],
        "Pot_Size_Inches": inputs["Pot_Size_Inches"],
        "Light_Lux": inputs["Light_Lux"],
        "Watering_Volume_mL": inputs["Watering_Volume_mL"],
        "Watering_Freq_Days": inputs["Watering_Freq_Days"],
        "Temperature_F": inputs["Temperature_F"],
        "Humidity_Level": inputs["Humidity_Level"],
    }

    features = pd.DataFrame([row])
    features = pd.get_dummies(
        features, columns=["Humidity_Level"], dtype=int
    )
    features = features.reindex(
        columns=feature_columns, fill_value=0
    )

    predicted_growth = max(
        0.0, float(growth_model.predict(features)[0])
    )
    predicted_new_leaves = (
        predicted_growth / AVERAGE_LEAF_SPACING_INCHES
    )
    rounded_new_leaves = int(np.floor(predicted_new_leaves + 0.5))

    predicted_total_leaves = (
        int(inputs["Leaf_Count"]) + predicted_new_leaves
    )
    rounded_total_leaves = int(
        np.floor(predicted_total_leaves + 0.5)
    )

    return {
        "predicted_growth_inches": round(predicted_growth, 2),
        "predicted_new_leaves": round(predicted_new_leaves, 2),
        "rounded_predicted_new_leaves": rounded_new_leaves,
        "predicted_total_leaf_count": round(
            predicted_total_leaves, 2
        ),
        "rounded_predicted_total_leaf_count": rounded_total_leaves,
    }


class GeminiError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


def load_system_prompt():
    try:
        with open(SYSTEM_PROMPT_PATH, encoding="utf-8") as file:
            prompt = file.read().strip()
    except OSError:
        app.logger.exception("Could not read sysprmt.txt.")
        raise GeminiError(
            "The summary service is missing sysprmt.txt.", 500
        ) from None

    if not prompt:
        raise GeminiError("sysprmt.txt is empty.", 500)

    return prompt


def load_api_key():
    try:
        with open(API_KEY_PATH, encoding="utf-8-sig") as file:
            key = file.read().strip().strip("\"'")
    except OSError:
        key = ""

    return key or os.environ.get("GEMINI_API_KEY", "").strip()


def fmt(value):
    return f"{value:,.3f}".rstrip("0").rstrip(".")


def build_user_prompt(inputs, outputs):
    projected_length = round(
        inputs["Stem_Length_Inches"]
        + outputs["predicted_growth_inches"], 2
    )

    lines = [
        "CONDITIONS ENTERED BY THE USER",
        f"Plant age: {fmt(inputs['Age_Days'])} days",
        f"Current vine length: {fmt(inputs['Stem_Length_Inches'])} inches",
        f"Current leaf count: {fmt(inputs['Leaf_Count'])}",
        f"Pot diameter: {fmt(inputs['Pot_Size_Inches'])} inches",
        f"Light level: {fmt(inputs['Light_Lux'])} lux",
        f"Water per watering: {fmt(inputs['Watering_Volume_mL'])} mL",
        f"Watering interval: every {fmt(inputs['Watering_Freq_Days'])} days",
        f"Temperature: {fmt(inputs['Temperature_F'])} degrees F",
        f"Humidity level: {inputs['Humidity_Level']}",
        "",
        "MODEL OUTPUTS",
        f"Predicted stem growth over the next 7 days: {fmt(outputs['predicted_growth_inches'])} inches",
        f"Projected vine length after 7 days: {fmt(projected_length)} inches",
        f"Estimated new leaves: {fmt(outputs['predicted_new_leaves'])}",
        f"Rounded estimated new leaves: {outputs['rounded_predicted_new_leaves']}",
        f"Projected total leaf count: {fmt(outputs['predicted_total_leaf_count'])}",
        f"Rounded projected total leaf count: {outputs['rounded_predicted_total_leaf_count']}",
        "",
        "The only machine-learning model used is the stem-growth model. "
        "New leaves are estimated by dividing growth by 1.2 inches per "
        "leaf. This is an approximation, not a separate model prediction.",
    ]
    return "\n".join(lines)


def extract_text(data):
    candidates = data.get("candidates") or []
    if not candidates:
        reason = (data.get("promptFeedback") or {}).get("blockReason")
        app.logger.error("Gemini returned no candidates: %s", reason)
        raise GeminiError("The summary service returned no summary.")

    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(
        part.get("text", "")
        for part in parts
        if not part.get("thought")
    ).strip()

    if not text:
        app.logger.error(
            "Empty Gemini response; finish reason: %s",
            candidate.get("finishReason"),
        )
        raise GeminiError("The summary service returned an empty summary.")

    return text


def call_gemini(system_prompt, user_prompt):
    api_key = load_api_key()
    if not api_key:
        raise GeminiError(
            "Gemini is not configured. Add a key to gemini_key.txt "
            "or set GEMINI_API_KEY.", 503
        )

    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [
            {"role": "user", "parts": [{"text": user_prompt}]}
        ],
        "generationConfig": {
            "maxOutputTokens": GEMINI_MAX_OUTPUT_TOKENS
        },
    }

    thinking = {}
    if GEMINI_THINKING_LEVEL:
        thinking["thinkingLevel"] = GEMINI_THINKING_LEVEL

    if GEMINI_THINKING_BUDGET is not None:
        try:
            thinking["thinkingBudget"] = int(GEMINI_THINKING_BUDGET)
        except ValueError:
            raise GeminiError(
                "GEMINI_THINKING_BUDGET must be an integer.", 500
            ) from None

    if thinking:
        body["generationConfig"]["thinkingConfig"] = thinking

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
            response.status_code, response.text[:500]
        )
        if response.status_code == 429:
            raise GeminiError(
                "The summary service is busy. Try again shortly.", 429
            )
        raise GeminiError("The summary service returned an error.")

    try:
        data = response.json()
    except ValueError:
        raise GeminiError(
            "The summary service sent an unreadable response."
        ) from None

    return extract_text(data)


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


@app.post("/api/predict")
def predict():
    try:
        inputs = parse_inputs(request.get_json(silent=True))
    except InputError as error:
        return jsonify({"error": str(error)}), 400

    return jsonify(run_model(inputs))


@app.post("/api/summarize")
def summarize():
    try:
        inputs = parse_inputs(request.get_json(silent=True))
    except InputError as error:
        return jsonify({"error": str(error)}), 400

    outputs = run_model(inputs)

    try:
        summary = call_gemini(
            load_system_prompt(),
            build_user_prompt(inputs, outputs),
        )
    except GeminiError as error:
        return jsonify({"error": error.message}), error.status

    return jsonify({"summary": summary})


if __name__ == "__main__":
    app.run(debug=True)
