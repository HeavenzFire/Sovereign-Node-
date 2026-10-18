#!/usr/bin/env python3
"""Local-only encrypted evidence vault prototype. No network listeners or uploads."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

MAX_FILE_BYTES = 64 * 1024 * 1024
EXTENSION = ".hfc"


class VaultError(Exception):
    """Expected operator-facing error."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def resolve_paths(vault_arg: str, key_arg: str | None = None) -> tuple[Path, Path | None]:
    vault = Path(vault_arg).expanduser().resolve()
    key = Path(key_arg).expanduser().resolve() if key_arg else None
    if key is not None and (key == vault or vault in key.parents):
        raise VaultError("Keep the encryption key outside the vault directory.")
    return vault, key


def load_fernet(key_path: Path) -> Fernet:
    try:
        key = key_path.read_bytes()
        return Fernet(key)
    except FileNotFoundError as exc:
        raise VaultError(f"Key file not found: {key_path}") from exc
    except (OSError, ValueError) as exc:
        raise VaultError("Key file is unreadable or invalid.") from exc


def write_exclusive(path: Path, data: bytes, mode: int = 0o600) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(str(path), flags, mode)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        try:
            path.unlink(missing_ok=True)
        finally:
            raise


def init_vault(vault: Path, key_path: Path) -> None:
    if key_path.exists():
        raise VaultError("Key already exists; refusing to overwrite it.")
    if vault.exists() and any(vault.iterdir()):
        raise VaultError("Vault directory is not empty; refusing to initialize over existing files.")
    vault.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    write_exclusive(key_path, key)
    try:
        load_fernet(key_path)
    except Exception:
        key_path.unlink(missing_ok=True)
        raise
    print(f"Vault initialized: {vault}")
    print(f"Key created: {key_path}")
    print("Protect and back up the key separately. Loss of the key means loss of access.")


def add_case(vault: Path, key_path: Path, source_arg: str) -> None:
    if not vault.is_dir():
        raise VaultError("Vault does not exist; run init first.")
    source = Path(source_arg).expanduser().resolve()
    if not source.is_file():
        raise VaultError("Input must be an existing regular file.")
    size = source.stat().st_size
    if size > MAX_FILE_BYTES:
        raise VaultError(f"File exceeds prototype limit of {MAX_FILE_BYTES // (1024 * 1024)} MiB.")
    if size == 0:
        raise VaultError("Empty files are not accepted.")
    original = source.read_bytes()
    if len(original) != size:
        raise VaultError("File changed while being read; retry with a stable working copy.")
    envelope = {
        "schema": "heavenzfire.guardian.case.v1",
        "case_id": uuid.uuid4().hex,
        "created_utc": utc_now(),
        "original_name": source.name,
        "original_size": len(original),
        "sha256": hashlib.sha256(original).hexdigest(),
        "content_hex": original.hex(),
    }
    fernet = load_fernet(key_path)
    ciphertext = fernet.encrypt(json.dumps(envelope, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    case_path = vault / f"{envelope['case_id']}{EXTENSION}"
    write_exclusive(case_path, ciphertext)
    print(f"Encrypted case created: {envelope['case_id']}")
    print(f"Ciphertext: {case_path}")
    print(f"Original SHA-256 (stored inside encrypted case): {envelope['sha256']}")
    print("Source file was not changed or deleted.")


def decrypt_envelope(vault: Path, key_path: Path, case_id: str) -> tuple[dict, bytes]:
    if not case_id or any(c not in "0123456789abcdef" for c in case_id) or len(case_id) != 32:
        raise VaultError("Case ID must be the 32-character lowercase ID shown by the vault.")
    case_path = vault / f"{case_id}{EXTENSION}"
    try:
        ciphertext = case_path.read_bytes()
    except FileNotFoundError as exc:
        raise VaultError("Case ID was not found in this vault.") from exc
    try:
        plaintext = load_fernet(key_path).decrypt(ciphertext)
        envelope = json.loads(plaintext.decode("utf-8"))
        if envelope.get("schema") != "heavenzfire.guardian.case.v1" or envelope.get("case_id") != case_id:
            raise VaultError("Case envelope identity or schema is invalid.")
        original = bytes.fromhex(envelope["content_hex"])
        digest = hashlib.sha256(original).hexdigest()
        if len(original) != envelope["original_size"] or digest != envelope["sha256"]:
            raise VaultError("Integrity check failed: decrypted content does not match its recorded hash.")
        return envelope, original
    except InvalidToken as exc:
        raise VaultError("Decryption failed: wrong key or ciphertext has been modified.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise VaultError("Case envelope is malformed or failed integrity checks.") from exc


def list_cases(vault: Path) -> None:
    if not vault.is_dir():
        raise VaultError("Vault does not exist.")
    case_ids = sorted(p.stem for p in vault.glob(f"*{EXTENSION}") if p.is_file())
    if not case_ids:
        print("No encrypted cases.")
        return
    print("Encrypted cases (metadata hidden until decrypted):")
    for case_id in case_ids:
        print(case_id)


def verify_cases(vault: Path, key_path: Path) -> None:
    case_ids = sorted(p.stem for p in vault.glob(f"*{EXTENSION}") if p.is_file())
    if not case_ids:
        print("No encrypted cases to verify.")
        return
    failures = []
    for case_id in case_ids:
        try:
            envelope, _ = decrypt_envelope(vault, key_path, case_id)
            print(f"PASS {case_id} sha256={envelope['sha256']}")
        except VaultError as exc:
            failures.append(case_id)
            print(f"FAIL {case_id}: {exc}")
    print(f"Verified {len(case_ids) - len(failures)}/{len(case_ids)} case(s).")
    if failures:
        raise VaultError("One or more cases failed verification.")


def export_case(vault: Path, key_path: Path, case_id: str, output_arg: str) -> None:
    envelope, original = decrypt_envelope(vault, key_path, case_id)
    output = Path(output_arg).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    write_exclusive(output, original)
    print(f"Exported verified case {case_id} to {output}")
    print(f"Original name recorded in encrypted envelope: {envelope['original_name']}")
    print(f"SHA-256: {envelope['sha256']}")
    print("Export refuses to overwrite an existing path.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HeavenzFire Guardian local encrypted evidence vault")
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="create an empty vault and encryption key")
    init.add_argument("--vault", required=True)
    init.add_argument("--key", required=True)
    add = commands.add_parser("add", help="encrypt a copy of a file into the vault")
    add.add_argument("--vault", required=True)
    add.add_argument("--key", required=True)
    add.add_argument("--file", required=True)
    listing = commands.add_parser("list", help="list random case IDs without exposing metadata")
    listing.add_argument("--vault", required=True)
    verify = commands.add_parser("verify", help="decrypt and verify all encrypted cases")
    verify.add_argument("--vault", required=True)
    verify.add_argument("--key", required=True)
    export = commands.add_parser("export", help="export one verified case without overwriting")
    export.add_argument("--vault", required=True)
    export.add_argument("--key", required=True)
    export.add_argument("--case-id", required=True)
    export.add_argument("--out", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "init":
            vault, key = resolve_paths(args.vault, args.key)
            assert key is not None
            init_vault(vault, key)
        elif args.command == "add":
            vault, key = resolve_paths(args.vault, args.key)
            assert key is not None
            add_case(vault, key, args.file)
        elif args.command == "list":
            vault, _ = resolve_paths(args.vault)
            list_cases(vault)
        elif args.command == "verify":
            vault, key = resolve_paths(args.vault, args.key)
            assert key is not None
            verify_cases(vault, key)
        elif args.command == "export":
            vault, key = resolve_paths(args.vault, args.key)
            assert key is not None
            export_case(vault, key, args.case_id, args.out)
        return 0
    except (VaultError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
