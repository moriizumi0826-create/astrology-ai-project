"""Offline checks for the V3 manual backup's encryption and safety guards."""

from io import BytesIO
from pathlib import Path
import zipfile

import pytest
from cryptography.exceptions import InvalidTag

import scripts.v3_manual_backup as backup_module
from scripts.v3_manual_backup import _output_directory, _pg_dump_path, encrypt_stream, extract_archive, verify_archive


def test_encrypted_archive_verifies_without_plaintext_file(tmp_path: Path):
    plaintext = b"PGDMP" + b"test archive contents" * 1000
    target = tmp_path / "sample.catv3"
    with target.open("wb") as output:
        assert encrypt_stream(BytesIO(plaintext), output, "long backup passphrase") == len(plaintext)

    assert plaintext not in target.read_bytes()
    assert verify_archive(target, "long backup passphrase") == len(plaintext)
    restored = extract_archive(target, str(tmp_path / "restore.dump"), "long backup passphrase")
    assert restored.read_bytes() == plaintext


def test_wrong_password_or_modified_archive_is_rejected(tmp_path: Path):
    target = tmp_path / "sample.catv3"
    with target.open("wb") as output:
        encrypt_stream(BytesIO(b"PGDMPpayload"), output, "long backup passphrase")

    with pytest.raises(InvalidTag):
        verify_archive(target, "wrong backup passphrase")

    damaged = bytearray(target.read_bytes())
    damaged[-17] ^= 1
    target.write_bytes(damaged)
    with pytest.raises(InvalidTag):
        verify_archive(target, "long backup passphrase")


def test_backup_refuses_repository_output():
    with pytest.raises(ValueError, match="outside the Git repository"):
        _output_directory(str(Path(__file__).resolve().parents[1] / "output"))


def test_extract_refuses_repository_and_existing_file(tmp_path: Path):
    encrypted = tmp_path / "sample.catv3"
    with encrypted.open("wb") as output:
        encrypt_stream(BytesIO(b"PGDMPpayload"), output, "long backup passphrase")
    with pytest.raises(ValueError, match="outside the Git repository"):
        extract_archive(encrypted, str(Path(__file__).resolve().parents[1] / "restore.dump"), "long backup passphrase")
    existing = tmp_path / "restore.dump"
    existing.write_bytes(b"existing")
    with pytest.raises(FileExistsError):
        extract_archive(encrypted, str(existing), "long backup passphrase")
    assert existing.read_bytes() == b"existing"


def test_explicit_pg_dump_path(tmp_path: Path):
    binary = tmp_path / "pg_dump.exe"
    binary.write_bytes(b"test")
    assert _pg_dump_path(str(binary)) == str(binary)
    with pytest.raises(RuntimeError, match="does not exist"):
        _pg_dump_path(str(tmp_path / "missing.exe"))


def test_setup_extracts_only_client_bin(tmp_path: Path, monkeypatch):
    archive = BytesIO()
    with zipfile.ZipFile(archive, "w") as output:
        output.writestr("pgsql/bin/pg_dump.exe", b"dump")
        output.writestr("pgsql/bin/pg_restore.exe", b"restore")
        output.writestr("pgsql/share/unused.txt", b"unused")
    payload = archive.getvalue()

    def missing_client():
        raise RuntimeError("missing")

    monkeypatch.setattr(backup_module, "_pg_dump_path", missing_client)
    monkeypatch.setattr(backup_module, "CLIENT_ZIP_BYTES", len(payload))
    monkeypatch.setattr(backup_module.urllib.request, "urlopen", lambda *_args, **_kwargs: BytesIO(payload))
    monkeypatch.setattr(
        backup_module.subprocess,
        "run",
        lambda *_args, **_kwargs: type("Result", (), {"returncode": 0, "stdout": "pg_dump (PostgreSQL) 18.6"})(),
    )
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    binary = Path(backup_module._setup_pg_dump())
    assert binary.read_bytes() == b"dump"
    assert (binary.parent / "pg_restore.exe").read_bytes() == b"restore"
    assert not (binary.parent.parent / "share").exists()
