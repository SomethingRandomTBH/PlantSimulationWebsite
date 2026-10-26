import io
import json
import unittest
from unittest.mock import patch, MagicMock
from PIL import Image

import app as backend


GOLDEN_CASES = [
    (
        {
            "Age_Days": 90,
            "Stem_Length_Inches": 24,
            "Leaf_Count": 20,
            "Pot_Size_Inches": 6,
            "Light_Lux": 2500,
            "Watering_Volume_mL": 300,
            "Watering_Freq_Days": 7,
            "Temperature_F": 75,
            "Humidity_Level": "Average",
        },
        {
            "growth_margin_of_error_inches": 0.19,
            "predicted_growth_inches": 1.19,
            "predicted_growth_lower_inches": 1.0,
            "predicted_growth_upper_inches": 1.39,
            "predicted_new_leaves": 1.0,
            "predicted_total_leaf_count": 21.0,
            "rounded_predicted_new_leaves": 1,
            "rounded_predicted_total_leaf_count": 21,
            "week_1": {
                "cumulative_estimated_new_leaves": 0.99,
                "cumulative_growth_inches": 1.19,
                "estimated_new_leaves_this_week": 0.99,
                "projected_stem_length_inches": 25.19,
                "projected_total_leaf_count": 20.99,
                "rounded_projected_total_leaf_count": 21,
                "week": 1,
                "weekly_growth_inches": 1.19,
            },
            "week_2": {
                "cumulative_estimated_new_leaves": 1.95,
                "cumulative_growth_inches": 2.34,
                "estimated_new_leaves_this_week": 0.96,
                "projected_stem_length_inches": 26.34,
                "projected_total_leaf_count": 21.95,
                "rounded_projected_total_leaf_count": 22,
                "week": 2,
                "weekly_growth_inches": 1.15,
            },
            "week_4": {
                "cumulative_estimated_new_leaves": 3.78,
                "cumulative_growth_inches": 4.54,
                "estimated_new_leaves_this_week": 0.92,
                "projected_stem_length_inches": 28.54,
                "projected_total_leaf_count": 23.78,
                "rounded_projected_total_leaf_count": 24,
                "week": 4,
                "weekly_growth_inches": 1.1,
            },
        },
    ),
    (
        {
            "Age_Days": 1,
            "Stem_Length_Inches": 0.1,
            "Leaf_Count": 0,
            "Pot_Size_Inches": 4,
            "Light_Lux": 300,
            "Watering_Volume_mL": 100,
            "Watering_Freq_Days": 4,
            "Temperature_F": 62,
            "Humidity_Level": "Low",
        },
        {
            "growth_margin_of_error_inches": 0.19,
            "predicted_growth_inches": 0.07,
            "predicted_growth_lower_inches": 0.0,
            "predicted_growth_upper_inches": 0.26,
            "predicted_new_leaves": 0.05,
            "predicted_total_leaf_count": 0.05,
            "rounded_predicted_new_leaves": 0,
            "rounded_predicted_total_leaf_count": 0,
            "week_1": {
                "cumulative_estimated_new_leaves": 0.06,
                "cumulative_growth_inches": 0.07,
                "estimated_new_leaves_this_week": 0.06,
                "projected_stem_length_inches": 0.17,
                "projected_total_leaf_count": 0.06,
                "rounded_projected_total_leaf_count": 0,
                "week": 1,
                "weekly_growth_inches": 0.07,
            },
            "week_2": {
                "cumulative_estimated_new_leaves": 0.11,
                "cumulative_growth_inches": 0.13,
                "estimated_new_leaves_this_week": 0.05,
                "projected_stem_length_inches": 0.23,
                "projected_total_leaf_count": 0.11,
                "rounded_projected_total_leaf_count": 0,
                "week": 2,
                "weekly_growth_inches": 0.06,
            },
            "week_4": {
                "cumulative_estimated_new_leaves": 0.22,
                "cumulative_growth_inches": 0.26,
                "estimated_new_leaves_this_week": 0.05,
                "projected_stem_length_inches": 0.36,
                "projected_total_leaf_count": 0.22,
                "rounded_projected_total_leaf_count": 0,
                "week": 4,
                "weekly_growth_inches": 0.06,
            },
        },
    ),
    (
        {
            "Age_Days": 750,
            "Stem_Length_Inches": 500,
            "Leaf_Count": 500,
            "Pot_Size_Inches": 12,
            "Light_Lux": 10000,
            "Watering_Volume_mL": 600,
            "Watering_Freq_Days": 14,
            "Temperature_F": 85,
            "Humidity_Level": "High",
        },
        {
            "growth_margin_of_error_inches": 0.19,
            "predicted_growth_inches": 0.1,
            "predicted_growth_lower_inches": 0.0,
            "predicted_growth_upper_inches": 0.29,
            "predicted_new_leaves": 0.08,
            "predicted_total_leaf_count": 500.08,
            "rounded_predicted_new_leaves": 0,
            "rounded_predicted_total_leaf_count": 500,
            "week_1": {
                "cumulative_estimated_new_leaves": 0.08,
                "cumulative_growth_inches": 0.1,
                "estimated_new_leaves_this_week": 0.08,
                "projected_stem_length_inches": 500.1,
                "projected_total_leaf_count": 500.08,
                "rounded_projected_total_leaf_count": 500,
                "week": 1,
                "weekly_growth_inches": 0.1,
            },
            "week_2": {
                "cumulative_estimated_new_leaves": 0.17,
                "cumulative_growth_inches": 0.2,
                "estimated_new_leaves_this_week": 0.08,
                "projected_stem_length_inches": 500.2,
                "projected_total_leaf_count": 500.17,
                "rounded_projected_total_leaf_count": 500,
                "week": 2,
                "weekly_growth_inches": 0.1,
            },
            "week_4": {
                "cumulative_estimated_new_leaves": 0.33,
                "cumulative_growth_inches": 0.4,
                "estimated_new_leaves_this_week": 0.08,
                "projected_stem_length_inches": 500.4,
                "projected_total_leaf_count": 500.33,
                "rounded_projected_total_leaf_count": 500,
                "week": 4,
                "weekly_growth_inches": 0.1,
            },
        },
    ),
    (
        {
            "Age_Days": 180,
            "Stem_Length_Inches": 36.5,
            "Leaf_Count": 32,
            "Pot_Size_Inches": 8,
            "Light_Lux": 1800,
            "Watering_Volume_mL": 420,
            "Watering_Freq_Days": 5.5,
            "Temperature_F": 78.5,
            "Humidity_Level": "High",
        },
        {
            "growth_margin_of_error_inches": 0.19,
            "predicted_growth_inches": 1.05,
            "predicted_growth_lower_inches": 0.86,
            "predicted_growth_upper_inches": 1.24,
            "predicted_new_leaves": 0.87,
            "predicted_total_leaf_count": 32.87,
            "rounded_predicted_new_leaves": 1,
            "rounded_predicted_total_leaf_count": 33,
            "week_1": {
                "cumulative_estimated_new_leaves": 0.88,
                "cumulative_growth_inches": 1.05,
                "estimated_new_leaves_this_week": 0.88,
                "projected_stem_length_inches": 37.55,
                "projected_total_leaf_count": 32.88,
                "rounded_projected_total_leaf_count": 33,
                "week": 1,
                "weekly_growth_inches": 1.05,
            },
            "week_2": {
                "cumulative_estimated_new_leaves": 1.73,
                "cumulative_growth_inches": 2.08,
                "estimated_new_leaves_this_week": 0.86,
                "projected_stem_length_inches": 38.58,
                "projected_total_leaf_count": 33.73,
                "rounded_projected_total_leaf_count": 34,
                "week": 2,
                "weekly_growth_inches": 1.03,
            },
            "week_4": {
                "cumulative_estimated_new_leaves": 3.44,
                "cumulative_growth_inches": 4.13,
                "estimated_new_leaves_this_week": 0.86,
                "projected_stem_length_inches": 40.63,
                "projected_total_leaf_count": 35.44,
                "rounded_projected_total_leaf_count": 35,
                "week": 4,
                "weekly_growth_inches": 1.03,
            },
        },
    ),
    (
        {
            "Age_Days": 45,
            "Stem_Length_Inches": 10.25,
            "Leaf_Count": 9,
            "Pot_Size_Inches": 10,
            "Light_Lux": 4200,
            "Watering_Volume_mL": 250,
            "Watering_Freq_Days": 10,
            "Temperature_F": 68,
            "Humidity_Level": "Low",
        },
        {
            "growth_margin_of_error_inches": 0.19,
            "predicted_growth_inches": 0.12,
            "predicted_growth_lower_inches": 0.0,
            "predicted_growth_upper_inches": 0.31,
            "predicted_new_leaves": 0.1,
            "predicted_total_leaf_count": 9.1,
            "rounded_predicted_new_leaves": 0,
            "rounded_predicted_total_leaf_count": 9,
            "week_1": {
                "cumulative_estimated_new_leaves": 0.1,
                "cumulative_growth_inches": 0.12,
                "estimated_new_leaves_this_week": 0.1,
                "projected_stem_length_inches": 10.37,
                "projected_total_leaf_count": 9.1,
                "rounded_projected_total_leaf_count": 9,
                "week": 1,
                "weekly_growth_inches": 0.12,
            },
            "week_2": {
                "cumulative_estimated_new_leaves": 0.2,
                "cumulative_growth_inches": 0.24,
                "estimated_new_leaves_this_week": 0.1,
                "projected_stem_length_inches": 10.49,
                "projected_total_leaf_count": 9.2,
                "rounded_projected_total_leaf_count": 9,
                "week": 2,
                "weekly_growth_inches": 0.12,
            },
            "week_4": {
                "cumulative_estimated_new_leaves": 0.55,
                "cumulative_growth_inches": 0.66,
                "estimated_new_leaves_this_week": 0.17,
                "projected_stem_length_inches": 10.91,
                "projected_total_leaf_count": 9.55,
                "rounded_projected_total_leaf_count": 10,
                "week": 4,
                "weekly_growth_inches": 0.21,
            },
        },
    ),
]


def make_image_bytes(fmt="JPEG", size=(120, 90), color=(34, 96, 48)):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf.getvalue()


class TestRandomForestRegressionAndAPI(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        self.default_inputs = dict(GOLDEN_CASES[0][0])

    def test_rf_feature_order_and_calibration_constant(self):
        self.assertEqual(
            backend.feature_columns,
            [
                "Age_Days",
                "Stem_Length_Inches",
                "Pot_Size_Inches",
                "Light_Lux",
                "Watering_Volume_mL",
                "Watering_Freq_Days",
                "Temperature_F",
                "Humidity_Level_Average",
                "Humidity_Level_High",
                "Humidity_Level_Low",
            ],
        )
        self.assertAlmostEqual(
            backend.growth_margin_of_error_90, 0.1921429958330295, places=12
        )

    def test_golden_rf_predictions_identical(self):
        for payload, expected in GOLDEN_CASES:
            res = self.client.post("/api/predict", json=payload)
            self.assertEqual(res.status_code, 200)
            actual = res.get_json()
            for key, expected_val in expected.items():
                self.assertEqual(
                    actual[key],
                    expected_val,
                    f"Mismatch in {key} for payload {payload}",
                )
            self.assertEqual(len(actual["weekly_forecasts"]), 4)
            self.assertEqual(actual["weekly_forecasts"][0], actual["week_1"])
            self.assertEqual(actual["weekly_forecasts"][1], actual["week_2"])
            self.assertEqual(actual["weekly_forecasts"][3], actual["week_4"])

    def test_input_validation_ranges_preserved(self):
        # Age_Days out of bounds (0 and 751)
        for bad_age in (0, 751, 45.5):
            payload = {**self.default_inputs, "Age_Days": bad_age}
            res = self.client.post("/api/predict", json=payload)
            self.assertEqual(res.status_code, 400)

        # Unsupported pot size
        res = self.client.post(
            "/api/predict", json={**self.default_inputs, "Pot_Size_Inches": 5}
        )
        self.assertEqual(res.status_code, 400)

        # Unsupported humidity
        res = self.client.post(
            "/api/predict",
            json={**self.default_inputs, "Humidity_Level": "Extreme"},
        )
        self.assertEqual(res.status_code, 400)

    @patch("app.load_api_key", return_value="fake-test-key")
    @patch("app.requests.post")
    def test_summarize_json_without_photo(self, mock_post, _mock_key):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "## **1. No Issues Found**\n\n**No issues found with the current plan.**"}]
                    },
                    "finishReason": "STOP",
                }
            ]
        }
        mock_post.return_value = mock_resp

        res = self.client.post("/api/summarize", json=self.default_inputs)
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("summary", body)
        self.assertNotIn("used_photo", body)

        # Verify request sent to Gemini has only text part (no inline_data)
        sent_json = mock_post.call_args.kwargs["json"]
        parts = sent_json["contents"][0]["parts"]
        self.assertEqual(len(parts), 1)
        self.assertIn("Current_Date:", parts[0]["text"])
        self.assertIn("Stem_Length_Baseline_Leaf_Count", parts[0]["text"])

    @patch("app.load_api_key", return_value="fake-test-key")
    @patch("app.requests.post")
    def test_summarize_multipart_with_valid_photos(self, mock_post, _mock_key):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "## **Plant Profile**\nPhoto inspected."}]
                    },
                    "finishReason": "STOP",
                }
            ]
        }
        mock_post.return_value = mock_resp

        for fmt, expected_mime, ext in [
            ("JPEG", "image/jpeg", "jpg"),
            ("PNG", "image/png", "png"),
            ("WEBP", "image/webp", "webp"),
        ]:
            img_bytes = make_image_bytes(fmt=fmt, size=(200, 150))
            data = {
                **{k: str(v) for k, v in self.default_inputs.items()},
                "photo": (io.BytesIO(img_bytes), f"pothos.{ext}"),
            }
            res = self.client.post(
                "/api/summarize",
                data=data,
                content_type="multipart/form-data",
            )
            self.assertEqual(res.status_code, 200)
            payload = res.get_json()
            self.assertEqual(payload.get("used_photo"), True)

            sent_json = mock_post.call_args.kwargs["json"]
            parts = sent_json["contents"][0]["parts"]
            self.assertEqual(len(parts), 2)
            self.assertEqual(
                parts[1]["inline_data"]["mime_type"], expected_mime
            )

    def test_summarize_rejects_invalid_magic_bytes_and_dimensions(self):
        # 1. Spoofed extension: text file named plant.jpg
        spoofed_data = {
            **{k: str(v) for k, v in self.default_inputs.items()},
            "photo": (io.BytesIO(b"not an image at all"), "plant.jpg"),
        }
        res = self.client.post(
            "/api/summarize",
            data=spoofed_data,
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported image", res.get_json()["error"])

        # 2. GIF image (disallowed format)
        gif_buf = io.BytesIO()
        Image.new("RGB", (50, 50), color=(0, 128, 0)).save(gif_buf, format="GIF")
        gif_buf.seek(0)
        gif_data = {
            **{k: str(v) for k, v in self.default_inputs.items()},
            "photo": (gif_buf, "plant.gif"),
        }
        res = self.client.post(
            "/api/summarize",
            data=gif_data,
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 400)

        # 3. Oversize dimensions (> 4096 px)
        huge_bytes = make_image_bytes(fmt="PNG", size=(4200, 100))
        huge_data = {
            **{k: str(v) for k, v in self.default_inputs.items()},
            "photo": (io.BytesIO(huge_bytes), "huge.png"),
        }
        res = self.client.post(
            "/api/summarize",
            data=huge_data,
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceed the maximum allowed dimension", res.get_json()["error"])

        # 4. Empty file
        empty_data = {
            **{k: str(v) for k, v in self.default_inputs.items()},
            "photo": (io.BytesIO(b""), "empty.jpg"),
        }
        res = self.client.post(
            "/api/summarize",
            data=empty_data,
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 400)

    def test_static_routes_and_dom_hook_inventory(self):
        routes = [
            "/",
            "/mainPage.html",
            "/pages/about.html",
            "/pages/planning.html",
            "/pages/team.html",
            "/pages/research.html",
            "/pages/prediction.html",
            "/pages/prediction-output.html",
            "/styles/style.css",
            "/styles/tokens.css",
            "/styles/base.css",
            "/styles/layout.css",
            "/styles/background.css",
            "/styles/components/topbar.css",
            "/styles/components/upload.css",
            "/styles/components/gemini-box.css",
            "/scripts/main.js",
            "/scripts/config/pages.js",
            "/scripts/core/init.js",
            "/scripts/features/predict/form.js",
            "/scripts/features/predict/upload.js",
            "/scripts/features/summary/gemini.js",
        ]
        for route in routes:
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Route failed: {route}")
            res.close()

        home_res = self.client.get("/mainPage.html")
        home_html = home_res.get_data(as_text=True)
        home_res.close()
        required_home_ids = [
            "predict",
            "prediction-form",
            "predict-button",
            "reset-button",
            "form-error",
            "results-placeholder",
            "results",
            "loading",
            "growth-result",
            "growth-lower-result",
            "growth-upper-result",
            "leaf-result",
            "rounded-leaf-result",
            "result-explanation",
            "multiweek-section",
            "week-2-length",
            "week-2-growth",
            "week-2-leaves",
            "week-2-range-note",
            "week-4-length",
            "week-4-growth",
            "week-4-leaves",
            "week-4-range-note",
            "multiweek-explanation",
            "summary-section",
            "summary-title",
            "reprompt-button",
            "copy-button",
            "copy-label",
            "summary-loading",
            "summary-text",
            "summary-error",
            "summary-error-message",
            "retry-button",
            "input-summary",
            "theme-toggle",
            "plant-photo-input",
            "photo-dropzone",
            "photo-preview",
        ]
        for elem_id in required_home_ids:
            self.assertIn(
                f'id="{elem_id}"',
                home_html,
                f"Missing required element ID #{elem_id} in mainPage.html",
            )

        for field_name in backend.REQUIRED_FIELDS:
            self.assertIn(
                f'name="{field_name}"',
                home_html,
                f"Missing required form field name={field_name} in mainPage.html",
            )


if __name__ == "__main__":
    unittest.main()
