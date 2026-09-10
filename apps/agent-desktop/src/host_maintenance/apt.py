import json
import time
from email.utils import parsedate_to_datetime
from pathlib import Path


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


def metadata(sources, lists_directory, stamp, uri_to_filename, now):
    problems = []
    times = []
    security_source = False
    if not sources:
        return None, False, ["No APT repositories are configured"]
    for source in sources:
        indexes = [index for index in source.index_files if index.has_packages]
        if not indexes:
            continue
        if not source.is_trusted or any(not index.exists or not index.is_trusted for index in indexes):
            problems.append("Configured APT package indexes are missing or untrusted; refresh APT metadata")
        if source.is_trusted and source.dist.endswith("-security"):
            security_source = True
        base = source.uri.rstrip("/") + "/"
        base += source.dist if source.dist.endswith("/") else "dists/" + source.dist + "/"
        releases = [lists_directory / uri_to_filename(base + name) for name in ["InRelease", "Release"]]
        present = [path for path in releases if path.is_file()]
        if not present:
            problems.append("Configured APT repository metadata is missing; refresh APT metadata")
            continue
        for path in present:
            with path.open(encoding="utf-8") as release:
                headers = release.read(65536).splitlines()
            for header in headers:
                if header.startswith("Valid-Until:"):
                    try:
                        if parsedate_to_datetime(header.split(":", 1)[1].strip()).timestamp() <= now:
                            problems.append("APT repository metadata has expired; refresh APT metadata")
                    except (TypeError, ValueError, OverflowError):
                        problems.append("APT repository metadata has an invalid expiry date")
        times.append(max(path.stat().st_ctime for path in present))
    if not times:
        problems.append("APT repository metadata is unavailable")
        return None, security_source, sorted(set(problems))
    refreshed = min(times)
    if stamp.is_file():
        refreshed = max(refreshed, stamp.stat().st_mtime)
    age = (now - refreshed) / 3600
    return age if age >= 0 else None, security_source, sorted(set(problems))


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
    age, security_source, unavailable = metadata(sources.list, lists_directory, stamp, apt_pkg.uri_to_filename, time.time())
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
