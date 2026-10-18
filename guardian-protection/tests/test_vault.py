import tempfile
import unittest
from pathlib import Path

from vault import (
    VaultError,
    add_case,
    decrypt_envelope,
    export_case,
    init_vault,
    list_cases,
    verify_cases,
)


class GuardianVaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.vault = self.root / "vault"
        self.key = self.root / "keys" / "vault.key"
        self.source = self.root / "sensitive-source.txt"
        self.payload = b"synthetic test evidence - not a real case\n"
        self.source.write_bytes(self.payload)
        init_vault(self.vault, self.key)

    def tearDown(self):
        self.temp.cleanup()

    def case_id(self):
        add_case(self.vault, self.key, str(self.source))
        ids = [p.stem for p in self.vault.glob("*.hfc")]
        self.assertEqual(len(ids), 1)
        return ids[0]

    def test_init_creates_key_outside_vault_and_refuses_overwrite(self):
        self.assertTrue(self.key.is_file())
        self.assertFalse(self.vault / self.key.name in self.vault.iterdir())
        with self.assertRaises(VaultError):
            init_vault(self.vault, self.key)

    def test_add_encrypts_and_verifies_round_trip(self):
        original_before = self.source.read_bytes()
        case_id = self.case_id()
        encrypted = (self.vault / f"{case_id}.hfc").read_bytes()
        self.assertNotIn(self.payload, encrypted)
        envelope, recovered = decrypt_envelope(self.vault, self.key, case_id)
        self.assertEqual(recovered, self.payload)
        self.assertEqual(envelope["original_name"], self.source.name)
        self.assertEqual(self.source.read_bytes(), original_before)
        verify_cases(self.vault, self.key)

    def test_export_refuses_to_overwrite(self):
        case_id = self.case_id()
        output = self.root / "restored.bin"
        export_case(self.vault, self.key, case_id, str(output))
        self.assertEqual(output.read_bytes(), self.payload)
        with self.assertRaises(FileExistsError):
            export_case(self.vault, self.key, case_id, str(output))

    def test_modified_ciphertext_fails_authentication(self):
        case_id = self.case_id()
        path = self.vault / f"{case_id}.hfc"
        data = bytearray(path.read_bytes())
        data[-1] = data[-1] ^ 1
        path.write_bytes(data)
        with self.assertRaises(VaultError):
            decrypt_envelope(self.vault, self.key, case_id)

    def test_wrong_key_fails(self):
        case_id = self.case_id()
        wrong_key = self.root / "wrong.key"
        from cryptography.fernet import Fernet
        wrong_key.write_bytes(Fernet.generate_key())
        with self.assertRaises(VaultError):
            decrypt_envelope(self.vault, wrong_key, case_id)

    def test_rejects_key_inside_vault(self):
        with self.assertRaises(VaultError):
            from vault import resolve_paths
            resolve_paths(str(self.vault), str(self.vault / "vault.key"))

    def test_list_shows_random_id_not_source_filename(self):
        case_id = self.case_id()
        import io
        from contextlib import redirect_stdout
        output = io.StringIO()
        with redirect_stdout(output):
            list_cases(self.vault)
        text = output.getvalue()
        self.assertIn(case_id, text)
        self.assertNotIn(self.source.name, text)

    def test_invalid_case_id_rejected(self):
        with self.assertRaises(VaultError):
            decrypt_envelope(self.vault, self.key, "../sensitive-source.txt")


if __name__ == "__main__":
    unittest.main()
