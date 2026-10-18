from pathlib import Path
import unittest


class PublicPagePrivacyTests(unittest.TestCase):
    def test_public_page_does_not_accept_or_transmit_case_data(self):
        page = (Path(__file__).parents[1] / "index.html").read_text(encoding="utf-8").lower()
        self.assertNotIn("<form", page)
        self.assertNotIn("<script", page)
        self.assertNotIn("fetch(", page)
        self.assertNotIn("google-analytics", page)
        self.assertNotIn("googletagmanager", page)
        self.assertIn("connect-src 'none'", page)
        self.assertIn("no-referrer", page)
        self.assertIn("no submission mechanism exists", page)

    def test_emergency_and_childhelp_resources_are_visible(self):
        page = (Path(__file__).parents[1] / "index.html").read_text(encoding="utf-8")
        self.assertIn("911", page)
        self.assertIn("1-800-422-4453", page)
        self.assertIn("https://www.childhelphotline.org/", page)


if __name__ == "__main__":
    unittest.main()
