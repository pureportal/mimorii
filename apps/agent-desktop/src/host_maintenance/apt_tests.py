import importlib.util
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace as Item

spec = importlib.util.spec_from_file_location("host_apt", Path(__file__).with_name("apt.py"))
host_apt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host_apt)


def version(number, archive="stable", trusted=True, origin="Debian"):
    return Item(version=number, origins=[Item(origin=origin, archive=archive, trusted=trusted)])


def compare(left, right):
    return int(left) - int(right)


def lists_name(uri):
    return uri.split("://", 1)[-1].replace("/", "_")


def signed_release(published, *fields):
    lines = ["-----BEGIN PGP SIGNED MESSAGE-----", "Hash: SHA512", "", "Origin: Example", *fields, "SHA256:"]
    lines += [f" {'0' * 64} {size} {key}" for key, size in published]
    lines += ["-----BEGIN PGP SIGNATURE-----", "", "iQIzBAEBCgAdFiEE", "-----END PGP SIGNATURE-----"]
    return "\n".join(lines) + "\n"


def repository(root, release, indexes, dist="stable-security"):
    base = f"https://example.org/dists/{dist}/"
    (root / lists_name(base + "InRelease")).write_text(release)
    files = []
    for key, exists in indexes:
        path = root / lists_name(base + key)
        if exists:
            path.write_text("Package: example\n")
        files.append(Item(has_packages=True, exists=exists, is_trusted=True, describe=f"https://example.org {dist} Packages ({path})"))
    return Item(uri="https://example.org/", dist=dist, is_trusted=True, index_files=files)


class AptAssessmentTests(unittest.TestCase):
    def test_security_updates_include_held_packages_and_intermediate_security_versions(self):
        package = Item(fullname="openssl:amd64", is_installed=True, installed=version("1"), versions=[version("3"), version("2", "stable-security"), version("1")])
        updates, security = host_apt.package_updates([package], compare)
        self.assertEqual(updates, ["openssl:amd64 1 -> 3"])
        self.assertEqual(security, updates)

    def test_ignores_uninstalled_current_and_untrusted_versions(self):
        packages = [
            Item(is_installed=False),
            Item(fullname="safe", is_installed=True, installed=version("2"), versions=[version("2"), version("1")]),
            Item(fullname="untrusted", is_installed=True, installed=version("1"), versions=[version("2", "stable-security", False)]),
        ]
        self.assertEqual(host_apt.package_updates(packages, compare), ([], []))

    def test_does_not_classify_third_party_repositories_by_security_name_alone(self):
        package = Item(fullname="tool", is_installed=True, installed=version("1"), versions=[version("2", "stable-security", origin="Unrelated")])
        updates, security = host_apt.package_updates([package], compare)
        self.assertEqual(len(updates), 1)
        self.assertEqual(security, [])

    def test_published_indexes_missing_locally_remain_incomplete_even_with_a_fresh_success_stamp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stamp = root / "stamp"
            stamp.write_text("")
            source = repository(root, signed_release([("main/binary-amd64/Packages", 120)]), [("main/binary-amd64/Packages", False)])
            age, security, unavailable = host_apt.metadata([source], root, stamp, lists_name, {}, stamp.stat().st_mtime + 3600)
            self.assertAlmostEqual(age, 1, places=3)
            self.assertTrue(security)
            self.assertTrue(unavailable)

    def test_indexes_apt_does_not_download_are_not_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            published = [("main/binary-amd64/Packages", 120), ("restricted/binary-amd64/Packages", 0)]
            source = repository(root, signed_release(published), [
                ("main/binary-amd64/Packages", True),
                ("restricted/binary-amd64/Packages", False),
                ("main/binary-all/Packages", False),
            ])
            _, _, unavailable = host_apt.metadata([source], root, root / "stamp", lists_name, {}, time.time())
            self.assertEqual(unavailable, [])

    def test_variant_indexes_supplant_base_indexes_but_not_foreign_architectures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            variants = {"amd64v3": "amd64", "amd64v2": "amd64"}
            published = [("main/binary-amd64/Packages", 120), ("main/binary-amd64v3/Packages", 125), ("main/binary-i386/Packages", 90)]
            indexes = [("main/binary-amd64/Packages", False), ("main/binary-amd64v3/Packages", True)]
            native = repository(root, signed_release(published), indexes, "native")
            multiarch = repository(root, signed_release(published), indexes + [("main/binary-i386/Packages", False)], "multiarch")
            self.assertEqual(host_apt.metadata([native], root, root / "stamp", lists_name, variants, time.time())[2], [])
            self.assertTrue(host_apt.metadata([multiarch], root, root / "stamp", lists_name, variants, time.time())[2])

    def test_empty_repositories_and_unknown_age_are_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            age, security, unavailable = host_apt.metadata([], Path(directory), Path(directory) / "stamp", str, {}, 100)
            self.assertIsNone(age)
            self.assertFalse(security)
            self.assertTrue(unavailable)

    def test_expired_repository_metadata_stays_unavailable_after_a_partial_refresh(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stamp = root / "stamp"
            stamp.write_text("")
            release = signed_release([("main/binary-amd64/Packages", 120)], "Valid-Until: Mon, 01 Jan 2024 00:00:00 UTC")
            source = repository(root, release, [("main/binary-amd64/Packages", True)])
            _, _, unavailable = host_apt.metadata([source], root, stamp, lists_name, {}, stamp.stat().st_mtime)
            self.assertEqual(unavailable, ["APT repository metadata has expired; refresh APT metadata"])


if __name__ == "__main__":
    unittest.main()
