
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
PREDICTION_INTERVAL_COVERAGE = 0.90


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

required_columns = BASE_FEATURES + [
    TARGET,
    "Plant_ID",
    "Leaf_Count",
    "New_Leaves_Next_Period",
]

missing_columns = [
    column for column in required_columns
    if column not in df.columns
]

if missing_columns:
    raise ValueError(
        "Dataset is missing required columns: "
        + ", ".join(missing_columns)
    )

if df.empty:
    raise ValueError("The training dataset is empty.")

if df[required_columns].isnull().any().any():
    raise ValueError(
        "The dataset contains missing values in required columns. "
        "Clean the dataset before training."
    )

if df["Plant_ID"].nunique() < 3:
    raise ValueError(
        "At least three distinct plants are needed for "
        "training, calibration, and testing."
    )

if not np.isfinite(
    df[TARGET].to_numpy(dtype=float)
).all():
    raise ValueError("Growth targets must be finite numbers.")

if (df[TARGET] < 0).any():
    raise ValueError("Growth targets cannot be negative.")

X = pd.get_dummies(
    df[BASE_FEATURES].copy(),
    columns=["Humidity_Level"],
    dtype=int,
)

y = df[TARGET].astype(float)

feature_columns = list(X.columns)
groups = df["Plant_ID"]


# --------------------------------------------------
# Split by plant:
# 60% training, 20% calibration, 20% test
#
# No Plant_ID can appear in more than one split.
# Percentages are approximate because whole plants
# are assigned to each split.
# --------------------------------------------------

first_splitter = GroupShuffleSplit(
    n_splits=1,
    test_size=0.20,
    random_state=RANDOM_STATE,
)

train_cal_idx, test_idx = next(
    first_splitter.split(X, y, groups=groups)
)

X_train_cal = X.iloc[train_cal_idx]
y_train_cal = y.iloc[train_cal_idx]
groups_train_cal = groups.iloc[train_cal_idx]

second_splitter = GroupShuffleSplit(
    n_splits=1,
    test_size=0.25,
    random_state=RANDOM_STATE + 1,
)

train_local_idx, calibration_local_idx = next(
    second_splitter.split(
        X_train_cal,
        y_train_cal,
        groups=groups_train_cal,
    )
)

train_idx = train_cal_idx[train_local_idx]
calibration_idx = train_cal_idx[calibration_local_idx]

X_train = X.iloc[train_idx]
y_train = y.iloc[train_idx]

X_calibration = X.iloc[calibration_idx]
y_calibration = y.iloc[calibration_idx]

X_test = X.iloc[test_idx]
y_test = y.iloc[test_idx]

# Verify that no plants overlap across the splits.
train_plants = set(groups.iloc[train_idx])
calibration_plants = set(groups.iloc[calibration_idx])
test_plants = set(groups.iloc[test_idx])

assert train_plants.isdisjoint(calibration_plants)
assert train_plants.isdisjoint(test_plants)
assert calibration_plants.isdisjoint(test_plants)

print("\n=== DATA SPLITS ===")
print(f"Training rows: {len(train_idx)}")
print(f"Calibration rows: {len(calibration_idx)}")
print(f"Test rows: {len(test_idx)}")
print(f"Training plants: {len(train_plants)}")
print(f"Calibration plants: {len(calibration_plants)}")
print(f"Test plants: {len(test_plants)}")


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
# Calibrate a 90% split-conformal prediction interval
#
# The calibration plants are separate from training
# plants. The error threshold is the finite-sample
# conformal quantile of absolute residuals.
# --------------------------------------------------

calibration_predictions = np.maximum(
    0.0,
    growth_model.predict(X_calibration),
)

calibration_errors = np.abs(
    y_calibration.to_numpy() - calibration_predictions
)

n_calibration = len(calibration_errors)

if n_calibration == 0:
    raise ValueError("The calibration set is empty.")

# Split-conformal quantile rank, using 1-based indexing.
# The rank is capped at n, as required for finite samples.
quantile_rank = min(
    n_calibration,
    int(np.ceil(
        (n_calibration + 1)
        * PREDICTION_INTERVAL_COVERAGE
    )),
)

growth_margin_of_error_90 = float(
    np.sort(calibration_errors)[quantile_rank - 1]
)

print("\n=== PREDICTION INTERVAL CALIBRATION ===")
print(f"Target coverage: {PREDICTION_INTERVAL_COVERAGE:.0%}")
print(f"Calibration samples: {n_calibration}")
print(f"Conformal quantile rank: {quantile_rank}")
print(
    "90% interval error threshold (inches):",
    round(growth_margin_of_error_90, 4),
)


# --------------------------------------------------
# Evaluate on the independent test plants
# --------------------------------------------------

test_predictions = np.maximum(
    0.0,
    growth_model.predict(X_test),
)

test_lower = np.maximum(
    0.0,
    test_predictions - growth_margin_of_error_90,
)

test_upper = (
    test_predictions + growth_margin_of_error_90
)

test_actual = y_test.to_numpy()

test_covered = (
    (test_actual >= test_lower)
    & (test_actual <= test_upper)
)

print("\n=== STEM GROWTH MODEL ===")
print(
    "MAE (inches):",
    round(mean_absolute_error(y_test, test_predictions), 4),
)
print(
    "R-squared:",
    round(r2_score(y_test, test_predictions), 4),
)
print(
    "Test interval coverage:",
    f"{test_covered.mean():.1%}",
)
print(
    "Average interval width (inches):",
    round(float(np.mean(test_upper - test_lower)), 4),
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
# Save test predictions, including interval bounds
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

predictions_df["Predicted_Growth_Inches"] = test_predictions
predictions_df["Growth_Lower_90_Inches"] = test_lower
predictions_df["Growth_Upper_90_Inches"] = test_upper
predictions_df["Interval_Covered"] = test_covered

predictions_df = predictions_df.round(2)
predictions_df.to_csv(PREDICTIONS_FILE, index=False)


# --------------------------------------------------
# Save model, feature order, and calibration threshold
# --------------------------------------------------

model_bundle = {
    "growth_model": growth_model,
    "feature_columns": feature_columns,
    "growth_margin_of_error_90": growth_margin_of_error_90,
    "prediction_interval_coverage": PREDICTION_INTERVAL_COVERAGE,
    "calibration_sample_count": n_calibration,
    "calibration_quantile_rank": quantile_rank,
    "training_random_state": RANDOM_STATE,
}

joblib.dump(model_bundle, MODEL_FILE)

print("\nSaved:")
print(f"- {IMPORTANCE_FILE}")
print(f"- {PREDICTIONS_FILE}")
print(f"- {MODEL_FILE}")
print("\nStem-growth model and calibration threshold saved successfully.")