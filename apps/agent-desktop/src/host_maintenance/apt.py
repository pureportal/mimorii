import json
import re
import time
from email.utils import parsedate_to_datetime
from pathlib import Path

PACKAGES_INDEX = re.compile(r"(?P<component>.+)/binary-(?P<architecture>[^/]+)/Packages")
CHECKSUM_FIELDS = ("MD5Sum", "SHA1", "SHA256", "SHA512")


def is_security_origin(origin):
    return origin.trusted and origin.origin in {
        "Debian", "Ubuntu", "UbuntuESM", "UbuntuESMApps"
    } and origin.archive.endswith("-security")


def package_updates(cache, compare):
    updates = []
    security = []
    for package in cache:
        if not package.is_installed:
            continue
        installed = package.installed.version
        newer = [
            version for version in package.versions
            if compare(version.version, installed) > 0
            and any(origin.trusted for origin in version.origins)
        ]
        if not newer:
            continue
        latest = newer[0]
        for version in newer[1:]:
            if compare(version.version, latest.version) > 0:
                latest = version
        updates.append(f"{package.fullname} {installed} -> {latest.version}")
        if any(is_security_origin(origin) for version in newer for origin in version.origins):
            security.append(f"{package.fullname} {installed} -> {latest.version}")
    return sorted(updates), sorted(security)


def release_fields(text):
    fields = {}
    name = None
    for line in text.splitlines():
        if line.startswith("-----BEGIN PGP SIGNATURE-----"):
            break
        if line[:1].isspace():
            if name is not None:
                fields[name].append(line.strip())
        elif ":" in line:
            name, value = line.split(":", 1)
            fields[name] = [value.strip()]
        else:
            name = None
    return fields


def published_sizes(fields):
    sizes = {}
    for field in CHECKSUM_FIELDS:
        for entry in fields.get(field, []):
            parts = entry.split()
            if len(parts) == 3 and parts[1].isdigit():
                sizes[parts[2]] = int(parts[1])
    return sizes


def supplanted_by_variant(key, available, variants):
    match = PACKAGES_INDEX.fullmatch(key)
    if match is None:
        return False
    architecture = match["architecture"]
    family = variants.get(architecture, architecture)
    return any(
        f"{match['component']}/binary-{variant}/Packages" in available
        for variant, variant_base in variants.items()
        if variant_base == family and variant != architecture
    )


def missing_published_indexes(indexes, base, sizes, uri_to_filename, variants):
    keys = {uri_to_filename(base + key): key for key in sizes}
    available = set()
    absent = []
    for index in indexes:
        name = Path(index.describe.rpartition(" (")[2].rstrip(")")).name
        key = keys.get(name) or keys.get(name.rpartition(".")[0])
        if index.exists:
            available.add(key)
        else:
            absent.append(key)
    if not sizes:
        return bool(absent)
    return any(
        key is not None and sizes[key] > 0 and not supplanted_by_variant(key, available, variants)
        for key in absent
    )


def metadata(sources, lists_directory, stamp, uri_to_filename, variants, now):
    problems = []
    times = []
    security_source = False
    if not sources:
        return None, False, ["No APT repositories are configured"]
    for source in sources:
        indexes = [index for index in source.index_files if index.has_packages]
        if not indexes:
            continue
        if not source.is_trusted or any(not index.is_trusted for index in indexes):
            problems.append("Configured APT package indexes are missing or untrusted; refresh APT metadata")
        if source.is_trusted and source.dist.endswith("-security"):
            security_source = True
        base = source.uri.rstrip("/") + "/"
        base += source.dist if source.dist.endswith("/") else "dists/" + source.dist + "/"
        releases = [lists_directory / uri_to_filename(base + name) for name in ["InRelease", "Release"]]
        release = next((path for path in releases if path.is_file()), None)
        if release is None:
            problems.append("Configured APT repository metadata is missing; refresh APT metadata")
            continue
        fields = release_fields(release.read_text(encoding="utf-8"))
        if "Valid-Until" in fields:
            try:
                if parsedate_to_datetime(fields["Valid-Until"][0]).timestamp() <= now:
                    problems.append("APT repository metadata has expired; refresh APT metadata")
            except (TypeError, ValueError, OverflowError):
                problems.append("APT repository metadata has an invalid expiry date")
        if missing_published_indexes(indexes, base, published_sizes(fields), uri_to_filename, variants):
            problems.append("Configured APT package indexes are missing or untrusted; refresh APT metadata")
        times.append(release.stat().st_ctime)
    if not times:
        problems.append("APT repository metadata is unavailable")
        return None, security_source, sorted(set(problems))
    refreshed = min(times)
    if stamp.is_file():
        refreshed = max(refreshed, stamp.stat().st_mtime)
    age = (now - refreshed) / 3600
    return age if age >= 0 else None, security_source, sorted(set(problems))


def architecture_variants(table):
    if not table.is_file():
        return {}
    variants = {}
    for line in table.read_text(encoding="utf-8").splitlines():
        columns = line.split()
        if len(columns) >= 2 and not columns[0].startswith("#"):
            variants[columns[0]] = columns[1]
    return variants


def collect():
    import apt
    import apt_pkg

    apt_pkg.init_config()
    apt_pkg.config.set("Dir::Cache::pkgcache", "")
    apt_pkg.config.set("Dir::Cache::srcpkgcache", "")
    apt_pkg.init_system()
    cache = apt.Cache(memonly=True)
    sources = apt_pkg.SourceList()
    sources.read_main_list()
    lists_directory = Path(apt_pkg.config.find_dir("Dir::State::lists"))
    stamp = Path(apt_pkg.config.find_dir("Dir::State")) / "periodic/update-success-stamp"
    variants = architecture_variants(Path(apt_pkg.config.find_file("Dir::dpkg::varianttable", "/usr/share/dpkg/varianttable")))
    age, security_source, unavailable = metadata(sources.list, lists_directory, stamp, apt_pkg.uri_to_filename, variants, time.time())
    updates, security = package_updates(cache, apt_pkg.version_compare)
    return {
        "count": len(updates),
        "securityCount": len(security) if security_source or security else None,
        "examples": updates[:5],
        "securityExamples": security[:5],
        "dataAgeHours": age,
        "unavailable": unavailable,
    }


if __name__ == "__main__":
    try:
        result = {"status": "available", "data": collect()}
    except ImportError:
        result = {"status": "unavailable", "reason": "APT assessment requires the python3-apt package"}
    except (OSError, SystemError, ValueError, AttributeError):
        result = {"status": "unavailable", "reason": "APT metadata could not be read; refresh APT metadata and check the agent account permissions"}
    print(json.dumps(result, ensure_ascii=True))
