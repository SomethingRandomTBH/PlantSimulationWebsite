
import os

import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_absolute_error, r2_score


# --------------------------------------------------
# Configuration
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_FILE = os.path.join(BASE_DIR, "synthetic_pothos_growth.csv")
MODEL_FILE = os.path.join(BASE_DIR, "pothos_rf_models.joblib")
IMPORTANCE_FILE = os.path.join(
    BASE_DIR, "pothos_rf_feature_importance.csv"
)
PREDICTIONS_FILE = os.path.join(
    BASE_DIR, "pothos_rf_test_predictions.csv"
)

RANDOM_STATE = 42


# --------------------------------------------------
# Load dataset
# --------------------------------------------------

df = pd.read_csv(DATA_FILE)

BASE_FEATURES = [
    "Age_Days",
    "Stem_Length_Inches",
    "Pot_Size_Inches",
    "Light_Lux",
    "Watering_Volume_mL",
    "Watering_Freq_Days",
    "Temperature_F",
    "Humidity_Level",
]

TARGET = "Growth_Inches_Next_Period"

X = pd.get_dummies(
    df[BASE_FEATURES].copy(),
    columns=["Humidity_Level"],
    dtype=int,
)

y = df[TARGET]

feature_columns = list(X.columns)


# --------------------------------------------------
# Split by plant to prevent data leakage
# --------------------------------------------------

splitter = GroupShuffleSplit(
    n_splits=1,
    test_size=0.20,
    random_state=RANDOM_STATE,
)

train_idx, test_idx = next(
    splitter.split(X, y, groups=df["Plant_ID"])
)

X_train = X.iloc[train_idx]
X_test = X.iloc[test_idx]

y_train = y.iloc[train_idx]
y_test = y.iloc[test_idx]


# --------------------------------------------------
# Train stem-growth Random Forest
# --------------------------------------------------

growth_model = RandomForestRegressor(
    n_estimators=100,
    max_depth=15,
    min_samples_leaf=5,
    random_state=RANDOM_STATE,
    n_jobs=-1,
)

growth_model.fit(X_train, y_train)


# --------------------------------------------------
# Evaluate model
# --------------------------------------------------

growth_predictions = np.maximum(
    0.0,
    growth_model.predict(X_test),
)

print("\n=== STEM GROWTH MODEL ===")

print(
    "MAE (inches):",
    round(mean_absolute_error(y_test, growth_predictions), 4),
)

print(
    "R-squared:",
    round(r2_score(y_test, growth_predictions), 4),
)


# --------------------------------------------------
# Feature importance
# --------------------------------------------------

importance = pd.DataFrame({
    "Feature": feature_columns,
    "Growth_Importance": growth_model.feature_importances_,
}).sort_values(
    "Growth_Importance",
    ascending=False,
)

print("\n=== FEATURE IMPORTANCE ===")
print(importance.to_string(index=False))

importance.to_csv(IMPORTANCE_FILE, index=False)


# --------------------------------------------------
# Save test predictions
# --------------------------------------------------

predictions_df = df.iloc[test_idx][
    [
        "Plant_ID",
        "Age_Days",
        "Stem_Length_Inches",
        "Leaf_Count",
        "Growth_Inches_Next_Period",
        "New_Leaves_Next_Period",
    ]
].copy()

predictions_df["Predicted_Growth_Inches"] = np.round(
    growth_predictions, 2
)

predictions_df = predictions_df.round(2)

predictions_df.to_csv(PREDICTIONS_FILE, index=False)


# --------------------------------------------------
# Save model and exact feature order
# --------------------------------------------------

model_bundle = {
    "growth_model": growth_model,
    "feature_columns": feature_columns,
}

joblib.dump(model_bundle, MODEL_FILE)

print("\nSaved:")
print(f"- {IMPORTANCE_FILE}")
print(f"- {PREDICTIONS_FILE}")
print(f"- {MODEL_FILE}")
print("\nStem-growth model trained and saved successfully.")