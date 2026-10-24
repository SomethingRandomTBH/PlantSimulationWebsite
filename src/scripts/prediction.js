
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
    Age_Days: [1, 721],
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
  document.getElementById("growth-result").textContent =
    Number(data.predicted_growth_inches).toFixed(2);

  document.getElementById("leaf-result").textContent =
    Number(data.predicted_total_leaf_count).toFixed(2);

  document.getElementById("rounded-leaf-result").textContent =
    String(data.rounded_predicted_total_leaf_count);

  document.getElementById("result-explanation").textContent =
    `The model estimates ${Number(data.predicted_growth_inches).toFixed(2)} inches ` +
    `of additional vine growth over the next seven days. ` +
    `Its estimated current total is ${Number(data.predicted_total_leaf_count).toFixed(2)} leaves, ` +
    `or approximately ${data.rounded_predicted_total_leaf_count} whole leaves. ` +
    `The leaf estimate is a prediction of total leaves, not the number of new leaves next week.`;

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

    sessionStorage.setItem("pothosPrediction", JSON.stringify({ inputs: data, result }));
    window.location.href = "/pages/prediction-output.html";
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