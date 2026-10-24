
import numpy as np
import pandas as pd
import joblib
import os

from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_absolute_error, r2_score

DATA_FILE = "synthetic_pothos_growth.csv"
RANDOM_STATE = 42

df = pd.read_csv(DATA_FILE)

# Leaf count is deliberately excluded from the predictors
# of the leaf-count model.
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

X = pd.get_dummies(
    df[BASE_FEATURES].copy(),
    columns=["Humidity_Level"],
    dtype=int
)

growth_target = df["Growth_Inches_Next_Period"]
leaf_count_target = df["Leaf_Count"]

# Hold out entire plants to prevent observations from the
# same plant leaking into both training and testing.
splitter = GroupShuffleSplit(
    n_splits=1,
    test_size=0.20,
    random_state=RANDOM_STATE,
)

train_idx, test_idx = next(
    splitter.split(X, groups=df["Plant_ID"])
)

X_train = X.iloc[train_idx]
X_test = X.iloc[test_idx]

y_growth_train = growth_target.iloc[train_idx]
y_growth_test = growth_target.iloc[test_idx]

y_leaves_train = leaf_count_target.iloc[train_idx]
y_leaves_test = leaf_count_target.iloc[test_idx]


# ============================================================
# MODEL 1: NEXT-WEEK STEM GROWTH
# ============================================================

growth_model = RandomForestRegressor(
    n_estimators=100,
    max_depth=15,
    min_samples_leaf=5,
    random_state=RANDOM_STATE,
    n_jobs=-1,
)

growth_model.fit(X_train, y_growth_train)

growth_predictions = np.maximum(
    0.0,
    growth_model.predict(X_test)
)

print("\n=== STEM GROWTH MODEL ===")
print(
    "MAE (inches):",
    round(mean_absolute_error(
        y_growth_test, growth_predictions
    ), 4),
)
print(
    "R-squared:",
    round(r2_score(
        y_growth_test, growth_predictions
    ), 4),
)


# ============================================================
# MODEL 2: TOTAL LEAF COUNT
# ============================================================
# This predicts the current total leaf count, not the number
# of leaves appearing during a single week.
# Stem length is a key predictor.
# ============================================================

leaf_count_model = RandomForestRegressor(
    n_estimators=300,
    min_samples_leaf=3,
    random_state=RANDOM_STATE,
    n_jobs=-1,
)

leaf_count_model.fit(X_train, y_leaves_train)

leaf_count_predictions = np.maximum(
    0.0,
    leaf_count_model.predict(X_test)
)

rounded_leaf_count_predictions = np.maximum(
    0,
    np.rint(leaf_count_predictions)
).astype(int)

print("\n=== TOTAL LEAF COUNT MODEL ===")
print(
    "MAE (leaves):",
    round(mean_absolute_error(
        y_leaves_test, leaf_count_predictions
    ), 4),
)
print(
    "R-squared:",
    round(r2_score(
        y_leaves_test, leaf_count_predictions
    ), 4),
)
print(
    "Rounded prediction MAE:",
    round(mean_absolute_error(
        y_leaves_test, rounded_leaf_count_predictions
    ), 4),
)

# ============================================================
# FEATURE IMPORTANCE
# ============================================================

importance = pd.DataFrame({
    "Feature": X.columns,
    "Growth_Importance": growth_model.feature_importances_,
    "Leaf_Count_Importance": leaf_count_model.feature_importances_,
}).sort_values(
    "Leaf_Count_Importance",
    ascending=False,
)

print("\n=== FEATURE IMPORTANCE ===")
print(importance.to_string(index=False))



importance.to_csv(
    "pothos_rf_feature_importance.csv",
    index=False,
)


# ============================================================
# SAVE TEST PREDICTIONS
# ============================================================

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

predictions_df["Predicted_Total_Leaf_Count"] = np.round(
    leaf_count_predictions, 2
)

predictions_df["Rounded_Predicted_Total_Leaf_Count"] = np.round(
    rounded_leaf_count_predictions, 2
)

predictions_df = predictions_df.round(2)

predictions_df.to_csv(
    "pothos_rf_test_predictions.csv",
    index=False,
)

print("\nSaved:")
print("- pothos_rf_feature_importance.csv")
print("- pothos_rf_test_predictions.csv")

# Save the models and the exact feature order used during training.
model_bundle = {
    "growth_model": growth_model,
    "leaf_count_model": leaf_count_model,
    "feature_columns": list(X.columns),
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

joblib.dump(
    {
        "growth_model": growth_model,
        "leaf_count_model": leaf_count_model,
        "feature_columns": list(X.columns),
    },
    os.path.join(BASE_DIR, "pothos_rf_models.joblib")
)

print("Models saved successfully.")