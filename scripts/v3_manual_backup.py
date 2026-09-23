"""Create and verify an encrypted logical backup of the V3 production database.

Requires PostgreSQL pg_dump (client version >= server version) and cryptography.
The database password and encryption passphrase are prompted, never passed in argv.
"""

from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading
from datetime import datetime, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt


PROJECT_REF = "sxkhgczqvsewtsrcnbbe"
DB_HOST = "aws-0-ap-southeast-2.pooler.supabase.com"
DB_USER = f"postgres.{PROJECT_REF}"
MAGIC = b"CATV3BK1"
SALT_SIZE = 16
NONCE_SIZE = 12
TAG_SIZE = 16
CHUNK_SIZE = 1024 * 1024
REPO_ROOT = Path(__file__).resolve().parents[1]


def _key(passphrase: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(passphrase.encode("utf-8"))


def encrypt_stream(source, destination, passphrase: str) -> int:
    """Encrypt a pg_dump custom archive without writing plaintext to disk."""
    prefix = source.read(5)
    if prefix != b"PGDMP":
        raise ValueError("pg_dump did not produce a custom-format archive")
    salt, nonce = secrets.token_bytes(SALT_SIZE), secrets.token_bytes(NONCE_SIZE)
    encryptor = Cipher(algorithms.AES(_key(passphrase, salt)), modes.GCM(nonce)).encryptor()
    destination.write(MAGIC + salt + nonce)
    destination.write(encryptor.update(prefix))
    size = len(prefix)
    while chunk := source.read(CHUNK_SIZE):
        destination.write(encryptor.update(chunk))
        size += len(chunk)
    destination.write(encryptor.finalize())
    destination.write(encryptor.tag)
    return size


def _decrypt_archive(path: Path, passphrase: str, destination=None) -> int:
    """Authenticate and stream-decrypt; optionally write a restore archive."""
    path = Path(path)
    with path.open("rb") as source:
        header = source.read(len(MAGIC) + SALT_SIZE + NONCE_SIZE)
        if len(header) != len(MAGIC) + SALT_SIZE + NONCE_SIZE or not header.startswith(MAGIC):
            raise ValueError("Not a V3 encrypted backup")
        source.seek(0, os.SEEK_END)
        end = source.tell()
        ciphertext_start = len(header)
        ciphertext_end = end - TAG_SIZE
        if ciphertext_end <= ciphertext_start:
            raise ValueError("Backup file is incomplete")
        source.seek(ciphertext_end)
        tag = source.read(TAG_SIZE)
        salt = header[len(MAGIC) : len(MAGIC) + SALT_SIZE]
        nonce = header[-NONCE_SIZE:]
        decryptor = Cipher(algorithms.AES(_key(passphrase, salt)), modes.GCM(nonce, tag)).decryptor()
        source.seek(ciphertext_start)
        count, prefix = 0, b""
        remaining = ciphertext_end - ciphertext_start
        while remaining:
            chunk = source.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                raise ValueError("Backup file is truncated")
            plaintext = decryptor.update(chunk)
            if len(prefix) < 5:
                prefix += plaintext[: 5 - len(prefix)]
            if destination is not None:
                destination.write(plaintext)
            count += len(plaintext)
            remaining -= len(chunk)
        decryptor.finalize()  # Raises InvalidTag for a wrong passphrase or modified file.
        if prefix != b"PGDMP":
            raise ValueError("Decrypted content is not a pg_dump custom archive")
        return count


def verify_archive(path: Path, passphrase: str) -> int:
    """Check encryption integrity and pg_dump magic; does not prove a restore works."""
    return _decrypt_archive(path, passphrase)


def _output_directory(raw: str) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise ValueError("Output directory must be an absolute path")
    path = path.resolve()
    if path == REPO_ROOT or REPO_ROOT in path.parents:
        raise ValueError("Backups must be stored outside the Git repository")
    path.mkdir(parents=True, exist_ok=True)
    return path


def extract_archive(encrypted: Path, output_file: str, passphrase: str) -> Path:
    """Extract plaintext only when explicitly requested for an isolated restore."""
    target = Path(output_file).expanduser()
    if not target.is_absolute():
        raise ValueError("Extracted archive path must be absolute")
    target = target.resolve()
    if target == REPO_ROOT or REPO_ROOT in target.parents:
        raise ValueError("Extracted archive must be outside the Git repository")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".partial")
    if target.exists() or partial.exists():
        raise FileExistsError("Extracted archive target already exists")
    try:
        with partial.open("xb") as destination:
            _decrypt_archive(encrypted, passphrase, destination)
            destination.flush()
            os.fsync(destination.fileno())
        partial.rename(target)
        return target
    except Exception:
        partial.unlink(missing_ok=True)
        raise


def _pg_dump_path(explicit: str | None = None) -> str:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not path.is_file():
            raise RuntimeError(f"pg_dump does not exist at: {path}")
        return str(path)
    binary = shutil.which("pg_dump")
    if not binary:
        local_roots = [Path.home() / "AppData" / "Local"]
        if os.environ.get("LOCALAPPDATA"):
            local_roots.insert(0, Path(os.environ["LOCALAPPDATA"]))
        for root in local_roots:
            local = root / "CelestialAtelier" / "postgresql-client-18.6" / "bin" / "pg_dump.exe"
            if local.is_file():
                binary = str(local)
                break
    if not binary:
        raise RuntimeError("pg_dump was not found. Install PostgreSQL command-line tools first.")
    return binary


def backup(output_dir: str, pg_dump_path: str | None = None) -> Path:
    pg_dump = _pg_dump_path(pg_dump_path)
    directory = _output_directory(output_dir)
    db_password = getpass.getpass("Supabase database password (not shown): ")
    if not db_password:
        raise ValueError("Database password is required")
    passphrase = getpass.getpass("New backup encryption passphrase (16+ characters): ")
    if len(passphrase) < 16:
        raise ValueError("Encryption passphrase must be at least 16 characters")
    if passphrase != getpass.getpass("Repeat encryption passphrase: "):
        raise ValueError("Encryption passphrases do not match")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    final = directory / f"v3-supabase-{timestamp}-{secrets.token_hex(4)}.catv3"
    partial = final.with_suffix(".catv3.partial")
    if final.exists() or partial.exists():
        raise FileExistsError("A backup with this generated name already exists")

    command = [
        pg_dump,
        "--host", DB_HOST,
        "--port", "5432",
        "--username", DB_USER,
        "--dbname", "postgres",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--no-subscriptions",
    ]
    child_env = os.environ.copy()
    child_env["PGPASSWORD"] = db_password
    child_env["PGSSLMODE"] = "require"
    stderr_parts: list[bytes] = []
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=child_env)
    del child_env, db_password

    def drain_stderr() -> None:
        assert process.stderr is not None
        for line in process.stderr:
            if sum(map(len, stderr_parts)) < 4096:
                stderr_parts.append(line[:1024])

    stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
    stderr_thread.start()
    try:
        assert process.stdout is not None
        with partial.open("xb") as destination:
            archive_bytes = encrypt_stream(process.stdout, destination, passphrase)
            destination.flush()
            os.fsync(destination.fileno())
        if process.wait() != 0:
            stderr_thread.join(timeout=5)
            detail = b"".join(stderr_parts).decode("utf-8", "replace").strip()
            raise RuntimeError(f"pg_dump failed: {detail or 'no diagnostic output'}")
        if verify_archive(partial, passphrase) != archive_bytes:
            raise RuntimeError("Backup byte count did not verify")
        partial.rename(final)
        return final
    except Exception:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        partial.unlink(missing_ok=True)
        raise
    finally:
        stderr_thread.join(timeout=5)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("preflight", help="Check whether pg_dump is installed")
    backup_parser = sub.add_parser("backup", help="Create an encrypted production DB backup")
    backup_parser.add_argument("--output-dir", required=True, help="Absolute path outside this repository")
    backup_parser.add_argument("--pg-dump", help="Explicit pg_dump.exe path, if auto-discovery fails")
    verify_parser = sub.add_parser("verify", help="Verify file integrity without restoring")
    verify_parser.add_argument("file", type=Path)
    extract_parser = sub.add_parser("extract", help="Create plaintext dump for isolated restore only")
    extract_parser.add_argument("file", type=Path)
    extract_parser.add_argument("--output-file", required=True, help="Absolute path outside this repository")
    extract_parser.add_argument("--acknowledge-plaintext", action="store_true", help="Confirm the output contains personal data")
    args = parser.parse_args()
    try:
        if args.command == "preflight":
            binary = _pg_dump_path()
            result = subprocess.run([binary, "--version"], check=True, capture_output=True, text=True)
            print(result.stdout.strip())
        elif args.command == "backup":
            path = backup(args.output_dir, args.pg_dump)
            print(f"Encrypted backup verified: {path}")
            print("Next: copy it to a separate encrypted location and test restore in an isolated project.")
        elif args.command == "verify":
            passphrase = getpass.getpass("Backup encryption passphrase (not shown): ")
            size = verify_archive(args.file, passphrase)
            print(f"Encryption integrity verified ({size} archive bytes). Restore not yet tested.")
        else:
            if not args.acknowledge_plaintext:
                raise ValueError("extract requires --acknowledge-plaintext")
            passphrase = getpass.getpass("Backup encryption passphrase (not shown): ")
            path = extract_archive(args.file, args.output_file, passphrase)
            print(f"Plaintext restore archive created: {path}")
            print("Keep it on an encrypted drive, restore only to an isolated DB, then remove this plaintext copy.")
        return 0
    except (OSError, ValueError, RuntimeError, InvalidTag) as exc:
        print(f"Backup error: {exc if not isinstance(exc, InvalidTag) else 'wrong passphrase or modified file'}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
