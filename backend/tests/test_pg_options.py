import unittest

from wlxc.store import _PG_SCHEMA, pg_connect_options


class TestPostgresOptions(unittest.TestCase):
    def test_supabase_direct_and_pooled_addresses(self):
        direct = pg_connect_options("postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres", {})
        self.assertEqual(direct, {"sslmode": "require"})
        pooled = pg_connect_options("postgresql://postgres.abcdefgh:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres", {})
        self.assertEqual(pooled, {"sslmode": "require", "prepare_threshold": None})  # a pooler cannot keep prepared statements

    def test_a_ca_certificate_turns_on_full_verification(self):
        kw = pg_connect_options("postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres", {"PG_CA_CERT": "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----"})
        self.assertEqual(kw["sslmode"], "verify-full")
        self.assertTrue(kw["sslrootcert"].endswith(".pem"))

    def test_other_hosts_are_verified_and_local_ones_are_left_alone(self):
        self.assertEqual(pg_connect_options("postgresql://u:p@db.example.com:5432/app", {})["sslmode"], "verify-full")
        self.assertEqual(pg_connect_options("postgresql://u:p@localhost:5432/app", {}), {})
        self.assertEqual(pg_connect_options("postgresql://u:p@db:5432/app", {}), {})
        self.assertEqual(pg_connect_options("postgresql://u:p@db.example.com:5432/app", {"PG_SSL_INSECURE": "1"})["sslmode"], "require")
        self.assertEqual(pg_connect_options("postgresql://u:p@db.example.com:5432/app", {"PG_POOLER": "1"})["prepare_threshold"], None)

    def test_the_tables_are_closed_to_supabase_public_rest_api(self):
        sql = " ".join(_PG_SCHEMA)
        self.assertIn("ALTER TABLE docs ENABLE ROW LEVEL SECURITY", sql)
        self.assertIn("ALTER TABLE blobs ENABLE ROW LEVEL SECURITY", sql)
