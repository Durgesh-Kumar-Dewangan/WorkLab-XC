import unittest

from wlxc.store import get_store

from .helpers import Base, delete, get, post, put, setup


class TestBackdrops(Base):
    def _admin(self):
        self.w = setup()
        cookie, _ = self.sign_up("owner@example.com")
        get_store().update("users", self.user_doc("owner@example.com")["id"], lambda c: {**c, "role": "admin", "emailVerified": True})
        return cookie

    def test_library_starts_with_painted_scenes_and_the_owner_manages_the_queue(self):
        admin = self._admin()
        r = get("/api/backdrops", cookie=admin).json()["items"]
        self.assertEqual([i["kind"] for i in r], ["painted"] * 3)
        added = post("/api/admin/backdrops", {"title": "Lake", "kind": "image", "src": "https://cdn.example.com/lake.jpg", "seconds": 60}, cookie=admin)
        self.assertEqual(added.status, 200)
        item = added.json()["item"]
        self.assertEqual(len(get("/api/backdrops", cookie=admin).json()["items"]), 4)
        put(f"/api/admin/backdrops/{item['id']}", {"active": False}, cookie=admin)
        self.assertEqual(len(get("/api/backdrops", cookie=admin).json()["items"]), 3)
        self.assertEqual(len(get("/api/admin/backdrops", cookie=admin).json()["items"]), 4)
        self.assertEqual(delete(f"/api/admin/backdrops/{item['id']}", cookie=admin).status, 200)
        self.assertEqual(len(get("/api/admin/backdrops", cookie=admin).json()["items"]), 3)

    def test_unsafe_links_and_non_owners_are_refused(self):
        admin = self._admin()
        bad = post("/api/admin/backdrops", {"title": "x", "kind": "video", "src": "javascript:alert(1)", "seconds": 60}, cookie=admin)
        self.assertEqual(bad.status, 400)
        plain, _ = self.sign_up("learner@example.com")
        self.assertEqual(post("/api/admin/backdrops", {"title": "x", "kind": "image", "src": "https://a.example/x.jpg", "seconds": 60}, cookie=plain).status, 403)
        self.assertEqual(get("/api/backdrops", cookie=plain).status, 200)


if __name__ == "__main__":
    unittest.main()
