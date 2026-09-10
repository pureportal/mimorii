import importlib.util
import tempfile
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

    def test_missing_indexes_remain_incomplete_even_with_a_fresh_success_stamp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release = root / "InRelease"
            release.write_text("metadata")
            stamp = root / "stamp"
            stamp.write_text("")
            source = Item(uri="https://example.org/", dist="stable-security", is_trusted=True, index_files=[Item(has_packages=True, exists=False, is_trusted=True)])
            age, security, unavailable = host_apt.metadata([source], root, stamp, lambda uri: uri.rsplit("/", 1)[-1], stamp.stat().st_mtime + 3600)
            self.assertAlmostEqual(age, 1, places=3)
            self.assertTrue(security)
            self.assertTrue(unavailable)

    def test_empty_repositories_and_unknown_age_are_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            age, security, unavailable = host_apt.metadata([], Path(directory), Path(directory) / "stamp", str, 100)
            self.assertIsNone(age)
            self.assertFalse(security)
            self.assertTrue(unavailable)

    def test_expired_repository_metadata_stays_unavailable_after_a_partial_refresh(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "InRelease").write_text("Valid-Until: Mon, 01 Jan 2024 00:00:00 UTC\n")
            stamp = root / "stamp"
            stamp.write_text("")
            source = Item(uri="https://example.org/", dist="stable-security", is_trusted=True, index_files=[Item(has_packages=True, exists=True, is_trusted=True)])
            _, _, unavailable = host_apt.metadata([source], root, stamp, lambda uri: uri.rsplit("/", 1)[-1], stamp.stat().st_mtime)
            self.assertTrue(any("expired" in problem for problem in unavailable))


if __name__ == "__main__":
    unittest.main()
