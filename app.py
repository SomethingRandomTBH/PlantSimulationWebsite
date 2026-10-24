
import os

import joblib
import numpy as np
import pandas as pd

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PAGES_DIR = os.path.join(BASE_DIR, "src", "pages")

@app.get("/styles/<path:filename>")
def serve_styles(filename):
    return send_from_directory(
        os.path.join(BASE_DIR, "src", "styles"),
        filename
    )


@app.get("/scripts/<path:filename>")
def serve_scripts(filename):
    return send_from_directory(
        os.path.join(BASE_DIR, "src", "scripts"),
        filename
    )

MODEL_PATH = "pothos_rf_models.joblib"

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        "Missing pothos_rf_models.joblib. "
        "Run train_pothos_models.py first."
    )

bundle = joblib.load(MODEL_PATH)

growth_model = bundle["growth_model"]
leaf_count_model = bundle["leaf_count_model"]
feature_columns = bundle["feature_columns"]

ALLOWED_POTS = [4, 6, 8, 10, 12]
ALLOWED_HUMIDITY = ["Low", "Average", "High"]

# Basic website input limits. Numeric limits should be checked
# against the actual training dataset before deployment.
LIMITS = {
    "Age_Days": (1, 358),
    "Stem_Length_Inches": (0.1, 500),
    "Leaf_Count": (0, 500),
    "Light_Lux": (300, 10000),
    "Watering_Volume_mL": (100, 600),
    "Watering_Freq_Days": (4, 14),
    "Temperature_F": (62, 85),
}


@app.get("/")
def home():
    return send_from_directory(PAGES_DIR, "prediction.html")


@app.post("/api/predict")
def predict():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON request body."}), 400

    required = [
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

    missing = [key for key in required if key not in payload]

    if missing:
        return jsonify({
            "error": "Missing inputs: " + ", ".join(missing)
        }), 400

    try:
        numeric = {}

        for key in required:
            if key == "Humidity_Level":
                continue

            value = float(payload[key])

            if not np.isfinite(value):
                raise ValueError(f"{key} must be a finite number.")

            numeric[key] = value

    except (ValueError, TypeError):
        return jsonify({
            "error": "All numeric inputs must be valid finite numbers."
        }), 400

    for key, (minimum, maximum) in LIMITS.items():
        if not minimum <= numeric[key] <= maximum:
            return jsonify({
                "error": f"{key} must be between {minimum} and {maximum}."
            }), 400

    if not numeric["Age_Days"].is_integer():
        return jsonify({"error": "Age_Days must be a whole number."}), 400

    if not numeric["Leaf_Count"].is_integer():
        return jsonify({"error": "Leaf_Count must be a whole number."}), 400

    if numeric["Pot_Size_Inches"] not in ALLOWED_POTS:
        return jsonify({"error": "Unsupported pot size."}), 400

    humidity = payload["Humidity_Level"]

    if humidity not in ALLOWED_HUMIDITY:
        return jsonify({"error": "Unsupported humidity level."}), 400

    row = {
        "Age_Days": numeric["Age_Days"],
        "Stem_Length_Inches": numeric["Stem_Length_Inches"],
        "Leaf_Count": numeric["Leaf_Count"],
        "Pot_Size_Inches": numeric["Pot_Size_Inches"],
        "Light_Lux": numeric["Light_Lux"],
        "Watering_Volume_mL": numeric["Watering_Volume_mL"],
        "Watering_Freq_Days": numeric["Watering_Freq_Days"],
        "Temperature_F": numeric["Temperature_F"],
        "Humidity_Level": humidity,
    }

    features = pd.DataFrame([row])

    features = pd.get_dummies(
        features,
        columns=["Humidity_Level"],
        dtype=int
    )

    # Reproduce the exact feature order used during training.
    features = features.reindex(
        columns=feature_columns,
        fill_value=0
    )

    predicted_growth = max(
        0.0,
        float(growth_model.predict(features)[0])
    )

    predicted_total_leaves = max(
        0.0,
        float(leaf_count_model.predict(features)[0])
    )

    return jsonify({
        "predicted_growth_inches": round(predicted_growth, 2),
        "predicted_total_leaf_count": round(predicted_total_leaves, 2),
        "rounded_predicted_total_leaf_count": int(
            np.floor(predicted_total_leaves + 0.5)
        ),
    })


if __name__ == "__main__":
    app.run(debug=True)