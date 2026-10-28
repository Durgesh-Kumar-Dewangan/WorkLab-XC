"""The Next.js front end must keep the public pages the website checklist asks for."""
import os
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "app")


class TestSite(unittest.TestCase):
    @unittest.skipUnless(os.path.isdir(ROOT), "front end not present")
    def test_pages_exist(self):
        for p in ("terms", "privacy", "refunds", "cookies", "copyright", "ai-use", "about", "features", "contact", "pricing"):
            self.assertTrue(os.path.exists(os.path.join(ROOT, "(site)", p, "page.tsx")), p)
        for f in ("not-found.tsx", "error.tsx", "global-error.tsx", "robots.ts", "sitemap.ts"):
            self.assertTrue(os.path.exists(os.path.join(ROOT, f)), f)

    @unittest.skipUnless(os.path.isdir(ROOT), "front end not present")
    def test_robots_hides_private_areas(self):
        t = open(os.path.join(ROOT, "robots.ts")).read()
        for p in ("/app/", "/api/", "/classroom/", "/login"):
            self.assertIn(p, t)
        self.assertIn("sitemap.xml", t)

    @unittest.skipUnless(os.path.isdir(ROOT), "front end not present")
    def test_sitemap_lists_only_existing_public_pages(self):
        import re
        t = open(os.path.join(ROOT, "sitemap.ts")).read()
        for path in re.findall(r"'(/[a-z\-]*)'", t):
            self.assertFalse(path.startswith(("/app", "/classroom")) or path == "/login", path)
            d = os.path.join(ROOT, "(site)") if path == "/" else os.path.join(ROOT, "(site)", path.strip("/"))
            self.assertTrue(os.path.exists(os.path.join(d, "page.tsx")), path)


if __name__ == "__main__":
    unittest.main()
