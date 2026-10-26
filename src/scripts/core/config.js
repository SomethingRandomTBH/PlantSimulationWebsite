/**
 * Core Application Configuration & Validation Constants
 */

import { PAGE_REGISTRY, SITE_META } from "../config/pages.js";

export { PAGE_REGISTRY, SITE_META };

export const STORAGE_KEYS = {
  THEME: "botanists-theme",
  PREDICTION: "pothosPrediction"
};

export const API_ENDPOINTS = {
  PREDICT: "/api/predict",
  SUMMARIZE: "/api/summarize"
};

export const VALIDATION_RANGES = {
  Age_Days: [1, 750],
  Stem_Length_Inches: [0.1, 500],
  Leaf_Count: [0, 500],
  Light_Lux: [300, 10000],
  Watering_Volume_mL: [100, 600],
  Watering_Freq_Days: [4, 14],
  Temperature_F: [62, 85]
};

export const ALLOWED_POTS = [4, 6, 8, 10, 12];
export const ALLOWED_HUMIDITY = ["Low", "Average", "High"];

export const IMAGE_UPLOAD_CONFIG = {
  ALLOWED_MIMES: ["image/jpeg", "image/png", "image/webp"],
  MAX_LONG_EDGE_PX: 1600,
  JPEG_QUALITY: 0.86,
  MAX_RAW_FILE_BYTES: 15 * 1024 * 1024
};

export const INPUT_LABELS = [
  ["Age_Days", "Plant age", (v) => `${v} days`],
  ["Stem_Length_Inches", "Total vine length", (v) => `${v} in`],
  ["Leaf_Count", "Current leaf count", (v) => `${v} leaves`],
  ["Pot_Size_Inches", "Pot diameter", (v) => `${v} in`],
  ["Light_Lux", "Light level", (v) => `${Number(v).toLocaleString()} lux`],
  ["Watering_Volume_mL", "Water per watering", (v) => `${v} mL`],
  ["Watering_Freq_Days", "Watering interval", (v) => `every ${v} days`],
  ["Temperature_F", "Temperature", (v) => `${v} °F`],
  ["Humidity_Level", "Humidity", (v) => String(v)]
];
