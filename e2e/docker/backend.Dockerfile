# Builds and runs the end-to-end server (src-tauri/src/bin/e2e_server.rs).
FROM rust:1-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# tauri::generate_context!() embeds the frontend dist folder at compile time; the server does not serve it.
RUN mkdir dist && echo '<!doctype html>' > dist/index.html
COPY src-tauri src-tauri
WORKDIR /src/src-tauri
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/src-tauri/target \
    cargo build --release --features e2e --bin e2e_server \
    && cp target/release/e2e_server /e2e_server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 librsvg2-2 libssl3 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /e2e_server /usr/local/bin/e2e_server
EXPOSE 1430
CMD ["e2e_server"]
