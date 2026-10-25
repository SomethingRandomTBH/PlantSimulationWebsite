
const form = document.getElementById("prediction-form");
const predictButton = document.getElementById("predict-button");
const errorBox = document.getElementById("form-error");

const placeholder = document.getElementById("results-placeholder");
const results = document.getElementById("results");
const loading = document.getElementById("loading");

const API_URL = "/api/predict";

function getNumber(formData, key) {
  return Number(formData.get(key));
}

function validateInputs(data) {
  const ranges = {
    Age_Days: [1, 751],
    Stem_Length_Inches: [0.1, 500],
    Leaf_Count: [0, 500],
    Light_Lux: [300, 10000],
    Watering_Volume_mL: [100, 600],
    Watering_Freq_Days: [4, 14],
    Temperature_F: [62, 85]
  };

  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = data[key];

    if (!Number.isFinite(value) || value < min || value > max) {
      return `${key.replaceAll("_", " ")} must be between ${min} and ${max}.`;
    }
  }

  if (!Number.isInteger(data.Age_Days)) {
    return "Plant age must be a whole number of days.";
  }

  if (!Number.isInteger(data.Leaf_Count)) {
    return "Leaf count must be a whole number.";
  }

  if (![4, 6, 8, 10, 12].includes(data.Pot_Size_Inches)) {
    return "Choose a supported pot size.";
  }

  if (!["Low", "Average", "High"].includes(data.Humidity_Level)) {
    return "Choose a valid humidity level.";
  }

  return null;
}

function displayResults(data) {
  const growth = Number(data.predicted_growth_inches);
  const totalLeaves = Number(data.predicted_total_leaf_count);
  const newLeaves = Number(data.predicted_new_leaves);
  const roundedNewLeaves = Number(data.rounded_predicted_new_leaves);

  document.getElementById("growth-result").textContent =
    growth.toFixed(2);

  // Keep the total-leaf model prediction in its own card.
  document.getElementById("leaf-result").textContent =
    totalLeaves.toFixed(2);

  // IMPORTANT:
  // The Whole-leaf estimate now displays NEW leaves,
  // rather than the rounded total-leaf model prediction.
  document.getElementById("rounded-leaf-result").textContent =
    String(roundedNewLeaves);

  document.getElementById("result-explanation").textContent =
    `The model estimates ${growth.toFixed(2)} inches ` +
    `of additional vine growth over the next seven days. ` +
    `The estimated current total is ${totalLeaves.toFixed(2)} leaves. ` +
    `Based on average spacing of 1.2 inches per leaf, ` +
    `the estimated new leaf production is ${newLeaves.toFixed(2)} leaves, ` +
    `or approximately ${roundedNewLeaves} whole new leaves. ` +
    `The whole-leaf estimate represents new leaves, not total leaves.`;

  placeholder.hidden = true;
  results.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";

  const formData = new FormData(form);

  const data = {
    Age_Days: getNumber(formData, "Age_Days"),
    Stem_Length_Inches: getNumber(formData, "Stem_Length_Inches"),
    Leaf_Count: getNumber(formData, "Leaf_Count"),
    Pot_Size_Inches: getNumber(formData, "Pot_Size_Inches"),
    Light_Lux: getNumber(formData, "Light_Lux"),
    Watering_Volume_mL: getNumber(formData, "Watering_Volume_mL"),
    Watering_Freq_Days: getNumber(formData, "Watering_Freq_Days"),
    Temperature_F: getNumber(formData, "Temperature_F"),
    Humidity_Level: formData.get("Humidity_Level")
  };

  const validationError = validateInputs(data);

  if (validationError) {
    errorBox.textContent = validationError;
    return;
  }

  predictButton.disabled = true;
  loading.hidden = false;
  results.hidden = true;
  placeholder.hidden = true;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "The prediction request failed.");
    }

    displayResults(result);
  } catch (error) {
    placeholder.hidden = false;
    errorBox.textContent =
      error.message || "Unable to reach the prediction service.";
  } finally {
    loading.hidden = true;
    predictButton.disabled = false;
  }
});

document.getElementById("reset-button").addEventListener("click", () => {
  form.reset();
  errorBox.textContent = "";
  results.hidden = true;
  placeholder.hidden = false;
});