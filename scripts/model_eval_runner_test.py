from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import requests


RUNNER_PATH = Path(__file__).with_name("model-eval-runner.py")
SPEC = importlib.util.spec_from_file_location("folio_model_eval_runner", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import guard
    raise RuntimeError("Could not load model-eval runner")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class FakeResponse:
    def __init__(self, content: str, *, status_code: int = 200) -> None:
        self.status_code = status_code
        self.text = content

    def json(self) -> dict[str, object]:
        return json.loads(self.text)


VALIDATOR = SimpleNamespace(
    LM_STUDIO_BASE_URL="http://127.0.0.1:1234",
    ACTIONABILITY_KEYS=("actionable", "archive", "archive-silent"),
    _domain_keys=lambda: ("immo", "job", "werbung"),
    format_actionability_block=lambda _regelwerk: "actionable | archive | archive-silent",
    format_user_context_block=lambda _context, _regelwerk: "aktive Jobsuche",
    strip_llm_response=lambda value, _mode: value,
)
ROW = {
    "sender": "alerts@example.test",
    "subject": "Ein konkreter Jobtreffer",
    "body_excerpt": "Eine konkrete Stelle wurde gefunden.",
}


def completion(content: str, *, field: str = "content") -> FakeResponse:
    return FakeResponse(json.dumps({"choices": [{"message": {field: content}}]}))


class LensDiagnosticTest(unittest.TestCase):
    def call(self):
        return RUNNER.call_lens_diagnostic(
            ROW,
            {},
            {},
            model_id="test-model",
            response_strip="none",
            validator=VALIDATOR,
            domain_section="job | werbung",
            immo_rules="",
        )

    @patch.object(RUNNER.requests, "post")
    def test_accepts_contract_compliant_json(self, post) -> None:
        post.return_value = completion(json.dumps({
            "domain": "job",
            "actionability": "actionable",
            "confidence": 0.95,
            "reasoning": "Konkreter Treffer.",
        }))

        opinion, diagnostic = self.call()

        self.assertEqual(opinion["domain"], "job")
        self.assertIsNone(diagnostic)
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["max_tokens"], RUNNER.MAX_COMPLETION_TOKENS)
        self.assertEqual(payload["temperature"], 0.1)
        self.assertEqual(payload["top_p"], 1.0)
        self.assertEqual(payload["top_k"], 20)
        self.assertEqual(payload["reasoning_effort"], "none")
        self.assertEqual(payload["response_format"]["type"], "json_schema")

    @patch.object(RUNNER.requests, "post")
    def test_reports_model_json_without_crashing(self, post) -> None:
        post.return_value = completion(
            '{"domain":"job","actionability":"actionable","confidence":0.9,"reasoning":"ok"}}'
        )

        opinion, diagnostic = self.call()

        self.assertIsNone(opinion)
        self.assertEqual(diagnostic["kind"], "model_json")
        self.assertIn("raw_excerpt", diagnostic)

    @patch.object(RUNNER.requests, "post", side_effect=requests.Timeout("slow model"))
    def test_reports_timeout_without_aborting_suite(self, _post) -> None:
        opinion, diagnostic = self.call()

        self.assertIsNone(opinion)
        self.assertEqual(diagnostic["kind"], "timeout")

    def test_classification_profile_uses_family_specific_thinking_controls(self) -> None:
        glm = RUNNER.classification_api_fields("zai-org/glm-4.7-flash", max_tokens=220)
        gemma = RUNNER.classification_api_fields("google/gemma-4-31b-qat", max_tokens=220)

        self.assertEqual(glm["chat_template_kwargs"], {"enable_thinking": False})
        self.assertNotIn("chat_template_kwargs", gemma)

    def test_real_mail_prompt_prioritizes_message_function(self) -> None:
        prompt = RUNNER.build_real_mail_prompt(
            {
                "account_id": "local", "sender": "person@example.test",
                "subject": "Persoenliche Maklerantwort", "received_at": None,
                "body": "Hier ist das Expose.",
            },
            list(RUNNER.REAL_MAIL_DOMAINS), domain_section="Zulaessige Domaenen",
        )

        self.assertIn("Funktion der Nachricht", prompt)
        self.assertIn("Persoenliche Maklerantwort", prompt)
        self.assertIn("Versandstatus oder Haendler-Zahlungsbeleg", prompt)
        self.assertIn("optionale Marketing-Aufforderung", prompt)
        self.assertIn("angeforderte Expose", prompt)
        self.assertIn("Projektanfrage", prompt)


class LensLabelsTest(unittest.TestCase):
    def test_labels_are_complete_and_match_lens_contract(self) -> None:
        labels = RUNNER.load_lens_golden(RUNNER.LENS_LABELS, "mail-triage-lens-v2")

        self.assertEqual(len(labels), 40)
        self.assertEqual(labels[90008]["domain"], "werbung")
        self.assertEqual(labels[90015]["action"], "actionable")
        self.assertEqual(labels[90026], {
            "domain": "shopping",
            "action": "archive",
            "note": "Zustellung ist bereits abgeschlossen.",
        })


class RealMailDiagnosticTest(unittest.TestCase):
    @patch.object(RUNNER.requests, "post")
    def test_accepts_strict_real_mail_contract(self, post) -> None:
        post.return_value = completion(json.dumps({
            "primary_domain": "job",
            "secondary_domains": ["werbung"],
            "action_required": True,
            "deadline_present": False,
            "needs_review": False,
            "confidence": 0.88,
        }))
        opinion, diagnostic = RUNNER.call_real_mail_diagnostic(
            {**ROW, "account_id": "test", "received_at": None, "body": ROW["body_excerpt"]},
            model_id="test-model", response_strip="none", validator=VALIDATOR,
        )
        self.assertIsNone(diagnostic)
        self.assertEqual(opinion["secondary_domains"], ["werbung"])
        schema = post.call_args.kwargs["json"]["response_format"]["json_schema"]["schema"]
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["max_tokens"], RUNNER.REAL_MAIL_COMPLETION_TOKENS)
        self.assertEqual(payload["temperature"], 0.1)
        self.assertEqual(payload["reasoning_effort"], "none")
        self.assertNotIn("uniqueItems", schema["properties"]["secondary_domains"])
        self.assertNotIn("job-lead", schema["properties"]["primary_domain"]["enum"])

    @patch.object(RUNNER.requests, "post")
    def test_accepts_structured_json_from_reasoning_content(self, post) -> None:
        post.return_value = completion(json.dumps({
            "primary_domain": "job",
            "secondary_domains": [],
            "action_required": True,
            "deadline_present": False,
            "needs_review": False,
            "confidence": 0.91,
        }), field="reasoning_content")

        opinion, diagnostic = RUNNER.call_real_mail_diagnostic(
            {**ROW, "account_id": "test", "received_at": None, "body": ROW["body_excerpt"]},
            model_id="test-model", response_strip="none", validator=VALIDATOR,
        )

        self.assertIsNone(diagnostic)
        self.assertEqual(opinion["primary_domain"], "job")

    @patch.object(RUNNER.requests, "post")
    def test_nemotron_uses_prompt_contract_without_lm_studio_grammar(self, post) -> None:
        post.return_value = completion(json.dumps({
            "primary_domain": "job",
            "secondary_domains": [],
            "action_required": True,
            "deadline_present": False,
            "needs_review": False,
            "confidence": 0.8,
        }))

        opinion, diagnostic = RUNNER.call_real_mail_diagnostic(
            {**ROW, "account_id": "test", "received_at": None, "body": ROW["body_excerpt"]},
            model_id="nvidia-nemotron-3-nano-30b-a3b",
            response_strip="think",
            validator=VALIDATOR,
        )

        self.assertIsNone(diagnostic)
        self.assertEqual(opinion["primary_domain"], "job")
        self.assertNotIn("response_format", post.call_args.kwargs["json"])

    def test_scores_only_axes_with_human_gold(self) -> None:
        predictions = [{
            "uid": 1,
            "valid": True,
            "expected_real": {
                "primary_domain": "job", "secondary_domains": ["werbung"],
                "secondary_labeled": True, "action_required": True, "deadline_present": None,
            },
            "predicted_real": {
                "primary_domain": "job", "secondary_domains": [],
                "action_required": False, "deadline_present": True,
                "needs_review": True, "confidence": 0.5,
            },
        }]
        score = RUNNER.score_real_predictions(predictions, ["job", "werbung"])
        self.assertEqual(score["domain_accuracy"], 1.0)
        self.assertEqual(score["secondary_labeled_cases"], 1)
        self.assertEqual(score["secondary_micro_f1"], 0.0)
        self.assertEqual(score["action_labeled_cases"], 1)
        self.assertEqual(score["action_f1"], 0.0)
        self.assertEqual(score["deadline_labeled_cases"], 0)
        self.assertEqual(score["abstention_rate"], 1.0)


if __name__ == "__main__":
    unittest.main()
