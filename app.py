import base64
import io
import json
import os
import sys
import subprocess
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import requests
from PIL import Image, UnidentifiedImageError

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
    "GEMINI_MODEL", "gemini-2.5-flash-lite"
)
GEMINI_FALLBACK_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
)
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)
GEMINI_TIMEOUT_SECONDS = 30
GEMINI_MAX_OUTPUT_TOKENS = 4096
GEMINI_THINKING_LEVEL = os.environ.get("GEMINI_THINKING_LEVEL")
GEMINI_THINKING_BUDGET = os.environ.get("GEMINI_THINKING_BUDGET")

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB maximum upload size
MAX_IMAGE_DIMENSION = 4096         # Maximum width or height in pixels
ALLOWED_IMAGE_MIMES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
})


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


if "growth_margin_of_error_90" not in bundle:
    raise ValueError(
        "The saved model has no calibrated prediction interval. "
        "Run train_pothos_models.py to retrain and save the model."
    )

growth_margin_of_error_90 = float(
    bundle["growth_margin_of_error_90"]
)

if (
    not np.isfinite(growth_margin_of_error_90)
    or growth_margin_of_error_90 < 0
):
    raise ValueError(
        "The saved growth prediction interval threshold is invalid."
    )

print(
    "90% growth prediction interval loaded:",
    round(growth_margin_of_error_90, 4),
    "inches",
)


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


def detect_image_mime_from_magic(raw_bytes):
    """Inspect magic bytes at the start of the file buffer."""
    if not isinstance(raw_bytes, (bytes, bytearray)) or len(raw_bytes) < 12:
        return None

    if raw_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"

    if raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"

    if raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        return "image/webp"

    return None


def validate_uploaded_image(file_storage):
    """Validate an optional uploaded image in memory without writing to disk."""
    if file_storage is None:
        return None

    filename = getattr(file_storage, "filename", None)
    if filename is not None and str(filename).strip() == "":
        return None

    stream = getattr(file_storage, "stream", file_storage)
    try:
        stream.seek(0)
    except (AttributeError, OSError):
        pass

    raw_bytes = stream.read(MAX_IMAGE_BYTES + 1)

    if not raw_bytes:
        raise InputError("The uploaded photo file is empty.")

    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise InputError(
            "The uploaded photo exceeds the maximum file size of 5 MB."
        )

    mime_type = detect_image_mime_from_magic(raw_bytes)
    if mime_type not in ALLOWED_IMAGE_MIMES:
        raise InputError(
            "Unsupported image file type. Please upload a JPEG, PNG, or WebP photo."
        )

    try:
        with Image.open(io.BytesIO(raw_bytes)) as img_verify:
            img_verify.verify()
        with Image.open(io.BytesIO(raw_bytes)) as img:
            width, height = img.size
            detected_format = (img.format or "").upper()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise InputError(
            "The uploaded photo is corrupted or could not be decoded."
        ) from None

    expected_formats = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }
    if detected_format != expected_formats.get(mime_type):
        raise InputError(
            "Image header does not match its internal image structure."
        )

    if width < 1 or height < 1:
        raise InputError("The uploaded photo has invalid dimensions.")

    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        raise InputError(
            f"Image dimensions ({width}x{height}px) exceed the "
            f"maximum allowed dimension of {MAX_IMAGE_DIMENSION}px."
        )

    return {
        "mime_type": mime_type,
        "data": base64.b64encode(raw_bytes).decode("ascii"),
        "width": int(width),
        "height": int(height),
    }


def parse_request_inputs_and_image():
    """Extract plant inputs and optional image from JSON or multipart/form-data."""
    content_type = (request.content_type or "").lower()

    if content_type.startswith("multipart/form-data"):
        payload = {}
        raw_inputs_json = request.form.get("inputs")
        if raw_inputs_json:
            try:
                parsed_json = json.loads(raw_inputs_json)
                if isinstance(parsed_json, dict):
                    payload.update(parsed_json)
            except ValueError:
                raise InputError("Invalid JSON in 'inputs' form field.") from None

        for key in REQUIRED_FIELDS:
            if key in request.form:
                payload[key] = request.form.get(key)

        inputs = parse_inputs(payload)

        file_storage = (
            request.files.get("photo")
            or request.files.get("image")
            or request.files.get("plant_photo")
        )
        if file_storage is None and request.files:
            file_storage = next(iter(request.files.values()), None)

        image_part = validate_uploaded_image(file_storage)
        return inputs, image_part

    payload = request.get_json(silent=True)
    inputs = parse_inputs(payload)
    return inputs, None


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
    
    growth_lower = max(
        0.0,
        predicted_growth - growth_margin_of_error_90,
    )

    growth_upper = (
        predicted_growth + growth_margin_of_error_90
    )


    return {
        "predicted_growth_inches": round(predicted_growth, 2),
        "predicted_new_leaves": round(predicted_new_leaves, 2),
        "rounded_predicted_new_leaves": rounded_new_leaves,
        "predicted_total_leaf_count": round(
            predicted_total_leaves, 2
        ),
        "rounded_predicted_total_leaf_count": rounded_total_leaves, "growth_margin_of_error_inches": round(
            growth_margin_of_error_90, 2
        ),
        "predicted_growth_lower_inches": round(
            growth_lower, 2
        ),
        "predicted_growth_upper_inches": round(
            growth_upper, 2
        ),
    }


def run_multiweek_forecast(inputs):
    """Predict four consecutive weekly growth periods."""

    current = dict(inputs)
    forecasts = []

    starting_length = inputs["Stem_Length_Inches"]
    starting_leaves = inputs["Leaf_Count"]
    cumulative_growth = 0.0
    cumulative_new_leaves = 0.0

    for week in range(1, 5):
        # Predict the next 7 days using the current simulated plant state.
        weekly_result = run_model(current)

        weekly_growth = weekly_result["predicted_growth_inches"]
        weekly_new_leaves = (
            weekly_growth / AVERAGE_LEAF_SPACING_INCHES
        )

        cumulative_growth += weekly_growth
        cumulative_new_leaves += weekly_new_leaves

        projected_length = starting_length + cumulative_growth
        projected_leaves = starting_leaves + cumulative_new_leaves

        forecasts.append({
            "week": week,
            "weekly_growth_inches": round(weekly_growth, 2),
            "cumulative_growth_inches": round(cumulative_growth, 2),
            "projected_stem_length_inches": round(projected_length, 2),
            "estimated_new_leaves_this_week": round(
                weekly_new_leaves, 2
            ),
            "cumulative_estimated_new_leaves": round(
                cumulative_new_leaves, 2
            ),
            "projected_total_leaf_count": round(projected_leaves, 2),
            "rounded_projected_total_leaf_count": int(
                np.floor(projected_leaves + 0.5)
            ),
        })

        # Carry the predicted state into the next week's prediction.
        current["Age_Days"] += 7
        current["Stem_Length_Inches"] = projected_length
        current["Leaf_Count"] = projected_leaves

    return {
        "week_1": forecasts[0],
        "week_2": forecasts[1],
        "week_4": forecasts[3],
        "weekly_forecasts": forecasts,
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


def build_user_prompt(inputs, outputs, multiweek=None, has_image=False):
    now = datetime.now().astimezone()
    current_date_iso = now.strftime("%Y-%m-%d")
    projected_length = round(
        inputs["Stem_Length_Inches"]
        + outputs["predicted_growth_inches"], 2
    )
    baseline_leaves = round(
        inputs["Stem_Length_Inches"] / AVERAGE_LEAF_SPACING_INCHES, 2
    )

    lines = [
        f"Current_Date: {current_date_iso}",
        "Current date and time: "
        f"{now.strftime('%A, %B %d, %Y, %I:%M %p %Z')}",
        "",
        "CONDITIONS ENTERED BY THE USER",
        f"Plant age (Age_Days): {fmt(inputs['Age_Days'])} days",
        f"Current vine length (Stem_Length_Inches): {fmt(inputs['Stem_Length_Inches'])} inches",
        f"Current leaf count (Leaf_Count): {fmt(inputs['Leaf_Count'])}",
        f"Baseline leaf count from stem length (Stem_Length_Baseline_Leaf_Count): {fmt(baseline_leaves)}",
        f"Pot diameter (Pot_Size_Inches): {fmt(inputs['Pot_Size_Inches'])} inches",
        f"Light level (Light_Lux): {fmt(inputs['Light_Lux'])} lux",
        f"Water per watering (Watering_Volume_mL): {fmt(inputs['Watering_Volume_mL'])} mL",
        f"Watering interval (Watering_Freq_Days): every {fmt(inputs['Watering_Freq_Days'])} days",
        f"Temperature (Temperature_F): {fmt(inputs['Temperature_F'])} degrees F",
        f"Humidity level (Humidity_Level): {inputs['Humidity_Level']}",
        "",
        "MODEL OUTPUTS (7-DAY FORECAST)",
        f"Predicted stem growth over the next 7 days (Predicted_Growth_Inches): {fmt(outputs['predicted_growth_inches'])} inches",
        f"90% prediction interval for 7-day growth: {fmt(outputs['predicted_growth_lower_inches'])} to {fmt(outputs['predicted_growth_upper_inches'])} inches (margin ±{fmt(outputs['growth_margin_of_error_inches'])} inches)",
        f"Projected vine length after 7 days: {fmt(projected_length)} inches",
        f"Estimated new leaves: {fmt(outputs['predicted_new_leaves'])}",
        f"Rounded estimated new leaves: {outputs['rounded_predicted_new_leaves']}",
        f"Projected total leaf count (Predicted_Total_Leaf_Count): {fmt(outputs['predicted_total_leaf_count'])}",
        f"Rounded projected total leaf count (Rounded_Predicted_Total_Leaf_Count): {outputs['rounded_predicted_total_leaf_count']}",
    ]

    if isinstance(multiweek, dict):
        week2 = multiweek.get("week_2")
        week4 = multiweek.get("week_4")
        if week2 and week4:
            lines.extend([
                "",
                "SEQUENTIAL MULTIWEEK FORECASTS",
                f"Week 2 (14 days): projected vine length {fmt(week2['projected_stem_length_inches'])} inches "
                f"(cumulative growth {fmt(week2['cumulative_growth_inches'])} inches, "
                f"projected total leaves {week2['rounded_projected_total_leaf_count']})",
                f"Week 4 (28 days): projected vine length {fmt(week4['projected_stem_length_inches'])} inches "
                f"(cumulative growth {fmt(week4['cumulative_growth_inches'])} inches, "
                f"projected total leaves {week4['rounded_projected_total_leaf_count']})",
            ])

    lines.extend([
        "",
        "The only machine-learning model used is the stem-growth model. "
        "New leaves are estimated by dividing growth by 1.2 inches per "
        "leaf. This is an approximation, not a separate model prediction.",
    ])

    if has_image:
        lines.extend([
            "",
            "ATTACHED PLANT PHOTO",
            "The user also provided a photo of their plant as an inline image. "
            "Inspect the visual appearance of the plant (leaf color, variegation, "
            "foliage density, node spacing, turgor, and visible container/substrate cues) "
            "and incorporate relevant visual observations into your assessment alongside "
            "the numerical measurements above.",
        ])

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

    # Gemini sometimes writes HTML entities such as "&nbsp;" as spacing.
    # The page escapes raw HTML, so they would show up as literal text.
    text = (
        text.replace("&nbsp;", " ")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&deg;", "°")
    )

    if not text:
        finish_reason = candidate.get("finishReason")
        app.logger.error(
            "Empty Gemini response; finish reason: %s",
            finish_reason,
        )
        if finish_reason == "SAFETY":
            raise GeminiError(
                "The summary could not be generated due to content safety filters."
            )
        raise GeminiError("The summary service returned an empty summary.")

    return text


def call_gemini(system_prompt, user_prompt, image_part=None):
    api_key = load_api_key()
    if not api_key:
        raise GeminiError(
            "Gemini is not configured. Add a key to gemini_key.txt "
            "or set GEMINI_API_KEY.", 503
        )

    user_parts = [{"text": user_prompt}]
    if image_part is not None:
        user_parts.append({
            "inline_data": {
                "mime_type": image_part["mime_type"],
                "data": image_part["data"],
            }
        })

    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [
            {"role": "user", "parts": user_parts}
        ],
        "generationConfig": {
            "maxOutputTokens": GEMINI_MAX_OUTPUT_TOKENS
        },
    }

    thinking = {}
    if GEMINI_THINKING_LEVEL and str(GEMINI_THINKING_LEVEL).strip():
        thinking["thinkingLevel"] = str(GEMINI_THINKING_LEVEL).strip()
    elif (
        GEMINI_THINKING_BUDGET is not None
        and str(GEMINI_THINKING_BUDGET).strip() != ""
    ):
        try:
            thinking["thinkingBudget"] = int(str(GEMINI_THINKING_BUDGET).strip())
        except ValueError:
            raise GeminiError(
                "GEMINI_THINKING_BUDGET must be an integer.", 500
            ) from None

    if thinking:
        body["generationConfig"]["thinkingConfig"] = thinking

    models_to_try = [GEMINI_MODEL]
    for fallback_model in GEMINI_FALLBACK_MODELS:
        if fallback_model not in models_to_try:
            models_to_try.append(fallback_model)

    response = None
    for idx, model_name in enumerate(models_to_try):
        try:
            response = requests.post(
                GEMINI_URL.format(model=model_name),
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

        # If the primary model ID returns 404 (e.g. a deprecated/invalid model string),
        # fall back to the next known valid Gemini model.
        if response.status_code == 404 and idx + 1 < len(models_to_try):
            app.logger.warning(
                "Gemini model '%s' returned 404; retrying with fallback model.",
                model_name,
            )
            continue
        break

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
    return send_from_directory(SRC_DIR, "mainPage.html")


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
        inputs, _ = parse_request_inputs_and_image()
    except InputError as error:
        return jsonify({"error": str(error)}), 400

    # Preserve the original one-week response fields.
    result = run_model(inputs)

    # Add the sequential multiweek forecasts.
    result.update(run_multiweek_forecast(inputs))

    return jsonify(result)


@app.post("/api/summarize")
def summarize():
    try:
        inputs, image_part = parse_request_inputs_and_image()
    except InputError as error:
        return jsonify({"error": str(error)}), 400

    outputs = run_model(inputs)
    multiweek = run_multiweek_forecast(inputs)

    try:
        summary = call_gemini(
            load_system_prompt(),
            build_user_prompt(
                inputs,
                outputs,
                multiweek=multiweek,
                has_image=image_part is not None,
            ),
            image_part=image_part,
        )
    except GeminiError as error:
        return jsonify({"error": error.message}), error.status

    response_payload = {"summary": summary}
    if image_part is not None:
        response_payload["used_photo"] = True

    return jsonify(response_payload)


if __name__ == "__main__":
    app.run(debug=True)
