
import numpy as np
import pandas as pd

# ============================================================
# GOLDEN POTHOS SYNTHETIC DATASET
# 5,000 plants x 52 weeks = 260,000 rows
#
# Healthy plants have no leaf loss.
# Leaf production depends on stem growth and node spacing.
# ============================================================

rng = np.random.default_rng(42)

NUM_PLANTS = 2000
NUM_WEEKS = 104
PERIOD_DAYS = 7
OUTPUT_FILE = "synthetic_pothos_growth.csv"

BASE_GROWTH_INCHES_PER_DAY = 0.4
OPTIMAL_LIGHT_LUX = 2500.0
OPTIMAL_TEMP_F = 80.0
TEMP_STD_F = 15.0
OPTIMAL_WATER_ML_PER_DAY_FOR_6_INCH_POT = 43.0

MIN_SIZE_MODIFIER = 0.30
CROWDING_STRENGTH = 0.50
MIN_CROWDING_MODIFIER = 0.35

# Illustrative assumptions; calibrate with observed plants.
AVERAGE_LEAF_SPACING_INCHES = 1.2
LEAF_SPACING_NOISE_INCHES = 0.12
MIN_LEAF_SPACING_INCHES = 0.7

BASE_BRANCH_PROBABILITY = 0.025
MAX_BRANCH_TIPS = 8

HUMIDITY_LEVELS = ["Low", "Average", "High"]
records = []


def calculate_light_modifier(lux):
    if lux <= 0:
        return 0.0
    if lux <= OPTIMAL_LIGHT_LUX:
        return max(0.1, lux / OPTIMAL_LIGHT_LUX)
    return max(0.0, 1.0 - (lux - OPTIMAL_LIGHT_LUX) / 5000.0)


def calculate_temperature_modifier(temp_f):
    if temp_f < 50 or temp_f > 95:
        return 0.0
    return float(
        np.exp(-((temp_f - OPTIMAL_TEMP_F) / TEMP_STD_F) ** 2)
    )


def calculate_water_modifier(volume_ml, frequency_days, pot_inches):
    if volume_ml <= 0 or frequency_days <= 0 or pot_inches <= 0:
        return 0.0

    daily_water = volume_ml / frequency_days
    optimal = (
        pot_inches / 6.0
    ) * OPTIMAL_WATER_ML_PER_DAY_FOR_6_INCH_POT

    ratio = (daily_water - optimal) / optimal
    return float(max(0.0, 1.0 - ratio ** 2))


def calculate_humidity_modifier(humidity):
    return {"Low": 0.95, "Average": 1.0, "High": 1.0}[humidity]


def calculate_pot_modifier(pot_inches, leaf_count):
    capacity = max(8.0, 7.0 * pot_inches ** 1.5)
    ratio = leaf_count / capacity
    return float(max(
        MIN_CROWDING_MODIFIER,
        1.0 - CROWDING_STRENGTH * ratio
    ))


def calculate_size_modifier(stem_inches):
    modifier = 1.0 / (
        1.0 + max(0.0, stem_inches) / 48.0
    )
    return float(max(MIN_SIZE_MODIFIER, modifier))


def sample_leaf_spacing():
    return float(max(
        MIN_LEAF_SPACING_INCHES,
        rng.normal(
            AVERAGE_LEAF_SPACING_INCHES,
            LEAF_SPACING_NOISE_INCHES
        )
    ))


# ============================================================
# SIMULATE PLANTS
# ============================================================

for plant_id in range(1, NUM_PLANTS + 1):

    age_days = int(rng.integers(1, 31))
    stem_inches = float(rng.uniform(3.0, 12.0))

    pot_inches = float(rng.choice([4, 6, 8, 10, 12]))
    light_lux = float(rng.uniform(300, 10000))
    water_volume_ml = float(rng.uniform(100, 600))
    watering_frequency_days = float(rng.uniform(4, 14))
    temperature_f = float(rng.uniform(62, 85))
    humidity = str(rng.choice(HUMIDITY_LEVELS))

    plant_vigor = float(rng.lognormal(mean=0.0, sigma=0.15))

    # Initial leaves approximately follow stem length.
    leaf_count = max(
        2,
        int(round(
            stem_inches / AVERAGE_LEAF_SPACING_INCHES
            + rng.normal(0.0, 0.4)
        ))
    )

    # Carry node position forward across weeks.
    node_progress = float(
        rng.uniform(0.0, AVERAGE_LEAF_SPACING_INCHES)
    )
    distance_to_next_node = sample_leaf_spacing()

    active_tips = 1

    for week in range(NUM_WEEKS):

        starting_age = age_days
        starting_stem = stem_inches
        starting_leaves = leaf_count

        light_mod = calculate_light_modifier(light_lux)
        temp_mod = calculate_temperature_modifier(temperature_f)

        water_mod = calculate_water_modifier(
            water_volume_ml,
            watering_frequency_days,
            pot_inches
        )

        humidity_mod = calculate_humidity_modifier(humidity)
        pot_mod = calculate_pot_modifier(pot_inches, leaf_count)
        size_mod = calculate_size_modifier(stem_inches)

        efficiency = (
            light_mod
            * temp_mod
            * water_mod
            * humidity_mod
            * pot_mod
            * size_mod
        )

        tip_multiplier = np.sqrt(max(1, active_tips))

        expected_growth = (
            BASE_GROWTH_INCHES_PER_DAY
            * PERIOD_DAYS
            * efficiency
            * plant_vigor
            * tip_multiplier
        )

        growth_noise = rng.normal(
            0.0, 0.04 * np.sqrt(PERIOD_DAYS)
        )

        growth_next_period = max(
            0.0,
            expected_growth + growth_noise
        )

        # New leaves come only from stem growth crossing nodes.
        node_progress += growth_next_period
        newly_visible_leaves = 0

        while node_progress >= distance_to_next_node:
            node_progress -= distance_to_next_node
            newly_visible_leaves += 1
            distance_to_next_node = sample_leaf_spacing()

        # Optional branching influences future vine growth.
        branch_probability = min(
            0.15,
            BASE_BRANCH_PROBABILITY
            * plant_vigor
            * (0.5 + 0.5 * efficiency)
        )

        if active_tips < MAX_BRANCH_TIPS:
            if rng.random() < branch_probability:
                active_tips += 1

        # Healthy-plant assumption: zero leaf loss.
        records.append({
            "Plant_ID": plant_id,
            "Age_Days": starting_age,
            "Stem_Length_Inches": round(starting_stem, 2),
            "Leaf_Count": starting_leaves,
            "Pot_Size_Inches": pot_inches,
            "Light_Lux": round(light_lux, 1),
            "Watering_Volume_mL": round(water_volume_ml, 1),
            "Watering_Freq_Days": round(
                watering_frequency_days, 1
            ),
            "Temperature_F": round(temperature_f, 1),
            "Humidity_Level": humidity,
            "Growth_Inches_Next_Period": round(
                growth_next_period, 3
            ),
            "New_Leaves_Next_Period": newly_visible_leaves,
        })

        # No leaf loss: total leaves never decrease.
        stem_inches += growth_next_period
        leaf_count += newly_visible_leaves
        age_days += PERIOD_DAYS


# ============================================================
# SAVE DATASET
# ============================================================

df = pd.DataFrame(records)
df.to_csv(OUTPUT_FILE, index=False)

print(f"Dataset saved: {OUTPUT_FILE}")
print(f"Plants simulated: {NUM_PLANTS}")
print(f"Total rows: {len(df)}")
print(f"Total columns: {len(df.columns)}")

print("\nTotal leaf count summary:")
print(df["Leaf_Count"].describe())

print("\nNew leaves per week:")
print(df["New_Leaves_Next_Period"].value_counts().sort_index())

print("\nLeaf-loss assumption: zero for all plants")

print("\nPreview:")
print(df.head())