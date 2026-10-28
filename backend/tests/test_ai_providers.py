import json
import unittest

from wlxc import llm
from wlxc.config import env

from .helpers import Base, get, post, setup


class TestProviders(Base):
    def test_bedrock_ollama_and_free_fallback_order(self):
        w = setup(LLM_ORDER="bedrock,ollama,cloudflare", AWS_ACCESS_KEY_ID="AKIDEXAMPLE", AWS_SECRET_ACCESS_KEY="secret", AWS_REGION="us-east-1",
                  BEDROCK_MODEL="amazon.nova-lite-v1:0", OLLAMA_MODEL="llama3.2", OLLAMA_BASE_URL="http://localhost:11434/v1")
        ids = [r.id for r in llm.routes()]
        self.assertEqual(ids[0], "bedrock/amazon.nova-lite-v1:0")
        self.assertEqual(ids[1], "ollama/llama3.2")
        self.assertTrue(any(i.startswith("cloudflare/") for i in ids))
        self.assertGreaterEqual(len([i for i in ids if i.startswith("cloudflare/")]), 2)

    def test_sigv4_is_deterministic_and_signs_the_body(self):
        h1 = llm._sigv4_headers("POST", "https://bedrock-runtime.us-east-1.amazonaws.com/model/m%3A0/converse", b"{}", "us-east-1", "bedrock", "AKID", "secret", now=1700000000)
        h2 = llm._sigv4_headers("POST", "https://bedrock-runtime.us-east-1.amazonaws.com/model/m%3A0/converse", b"{}", "us-east-1", "bedrock", "AKID", "secret", now=1700000000)
        h3 = llm._sigv4_headers("POST", "https://bedrock-runtime.us-east-1.amazonaws.com/model/m%3A0/converse", b"{ }", "us-east-1", "bedrock", "AKID", "secret", now=1700000000)
        self.assertEqual(h1, h2)
        self.assertNotEqual(h1["authorization"], h3["authorization"])
        self.assertIn("Credential=AKID/20231114/us-east-1/bedrock/aws4_request", h1["authorization"])
        self.assertEqual(h1["x-amz-date"], "20231114T221320Z")

    def test_modes_choose_the_default_order(self):
        import os
        for mode, first in (("free", "cloudflare"), ("paid", "azure"), ("hybrid", "azure")):
            setup(LLM_MODE=mode)
            os.environ.pop("LLM_ORDER", None)
            self.assertEqual(env().llm_order[0], first)

    def test_owner_sees_the_chain_and_cannot_be_impersonated(self):
        setup(LLM_ORDER="azure,cloudflare")
        from wlxc.store import get_store
        admin, _ = self.sign_up("owner@example.com")
        get_store().update("users", self.user_doc("owner@example.com")["id"], lambda c: {**c, "role": "admin", "emailVerified": True})
        r = get("/api/admin/ai", cookie=admin).json()
        self.assertEqual(r["routes"][0]["provider"], "azure")
        self.assertNotIn("key", json.dumps(r).lower().replace("monkey", ""))
        plain, _ = self.sign_up("learner@example.com")
        self.assertEqual(get("/api/admin/ai", cookie=plain).status, 403)


if __name__ == "__main__":
    unittest.main()
