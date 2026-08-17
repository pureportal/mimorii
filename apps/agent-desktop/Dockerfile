# syntax=docker/dockerfile:1.7
FROM rust:1.97-bookworm AS build

ARG TARGETARCH
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN --mount=type=cache,id=mimorii-agent-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=mimorii-agent-target-${TARGETARCH},target=/build/target,sharing=locked \
    cargo build --locked --release \
    && cp target/release/mimorii-agent-desktop /tmp/mimorii-agent-desktop

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 mimorii \
    && useradd --uid 10001 --gid mimorii --no-create-home --shell /usr/sbin/nologin mimorii

COPY --from=build --chown=0:0 --chmod=0555 /tmp/mimorii-agent-desktop /usr/local/bin/mimorii-agent-desktop

USER 10001:10001
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/mimorii-agent-desktop"]
CMD ["check-runner"]
