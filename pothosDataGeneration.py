import numpy as np
import pandas as pd

# Set random seed for reproducibility
np.random.seed(42)

# Number of plants to generate in the dataset
num_samples = 1000

# 1. Generate Independent Features (Inputs)
age = np.random.randint(1, 365, size=num_samples)             # Age in days (1 to 365)
light_lux = np.random.randint(250, 15001, size=num_samples)   # Light in Lux (250 to 15,000)
watering_freq = np.random.randint(5, 22, size=num_samples)     # Days between waterings (5 to 21)
temperature = np.random.uniform(18, 29, size=num_samples)      # Home temp in °C (18 to 29)
pot_size = np.random.choice([4, 6, 8, 10], size=num_samples)   # Pot diameter in inches

# 2. Apply Biological Growth Logic & Penalties
base_growth = age * 0.25  # Baseline growth expectation over time

# Light Rules (Lux): Fatal bounds below 500 and above 10,000. Optimal between 1,500 and 4,000.
light_mult = np.select(
    [
        (light_lux < 500) | (light_lux > 10000),      # Fatal zones
        (light_lux >= 500) & (light_lux < 1500),      # Low light (survivable but slow)
        (light_lux >= 1500) & (light_lux <= 4000),    # Optimal bright indirect light
        (light_lux > 4000) & (light_lux <= 10000)     # High light (tolerable but pushing it)
    ],
    [0.05, 0.4, 1.3, 0.9]
)

# Watering Rules: < 7 days causes root rot. > 17 days dries it out.
water_mult = np.where(watering_freq < 7, 0.2, np.where(watering_freq > 17, 0.5, 1.1))

# Temperature Rules: Prefers 21°C to 27°C
temp_mult = np.where((temperature >= 21) & (temperature <= 27), 1.1, 0.8)

# 3. Calculate Target 1: Stem Length
noise_stem = np.random.normal(0, 2, size=num_samples)
stem_length = (base_growth * light_mult * water_mult * temp_mult) + noise_stem

# Clip bottom range so dead/stunted plants don't have negative lengths
stem_length = np.clip(stem_length, 2, 140)

# 4. Calculate Target 2: Leaf Count with Spacing Adjustments
# Spacing logic: Low light makes nodes "leggy" (wider spacing / fewer leaves per cm).
# Healthy plants get compact, beautiful leaf spacing.
node_spacing = np.where(light_lux < 1500, 8.5, 5.5) 
noise_leaves = np.random.normal(0, 1.5, size=num_samples)
leaf_count = (stem_length / node_spacing) + noise_leaves

# If the plant is in a fatal light zone, force leaves to drop/die (0 or 1 leaf remaining)
leaf_count = np.where((light_lux < 500) | (light_lux > 10000), np.random.choice([0, 1], size=num_samples), leaf_count)
leaf_count = np.clip(leaf_count, 0, np.floor(stem_length / 4)).astype(int)

# Create a clean text label for easier visualization of the results
health_status = np.select(
    [
        (light_lux < 500),
        (light_lux > 10000),
        (watering_freq < 7),
        (light_lux >= 1500) & (light_lux <= 4000) & (watering_freq >= 7) & (watering_freq <= 17)
    ],
    ['Dying (Too Dark)', 'Dying (Sunburned)', 'Stunted (Root Rot)', 'Thriving'],
    default='Healthy (Slow Growth)'
)

# 5. Compile into a DataFrame
df = pd.DataFrame({
    'Age_Days': age,
    'Light_Lux': light_lux,
    'Watering_Freq_Days': watering_freq,
    'Temperature_C': np.round(temperature, 1),
    'Pot_Size_Inches': pot_size,
    'Stem_Length_CM': np.round(stem_length, 1),
    'Leaf_Count': leaf_count,
    'Condition': health_status
})

# Save to CSV
df.to_csv('synthetic_pothos_growth_spaced.csv', index=False)
