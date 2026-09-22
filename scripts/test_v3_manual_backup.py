"""Offline checks for the V3 manual backup's encryption and safety guards."""

from io import BytesIO
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag

from scripts.v3_manual_backup import _output_directory, encrypt_stream, verify_archive


def test_encrypted_archive_verifies_without_plaintext_file(tmp_path: Path):
    plaintext = b"PGDMP" + b"test archive contents" * 1000
    target = tmp_path / "sample.catv3"
    with target.open("wb") as output:
        assert encrypt_stream(BytesIO(plaintext), output, "long backup passphrase") == len(plaintext)

    assert plaintext not in target.read_bytes()
    assert verify_archive(target, "long backup passphrase") == len(plaintext)


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
