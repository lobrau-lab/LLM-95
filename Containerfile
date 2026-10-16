# ==============================================================================
# GEMINI-95 / LLAMA-95 BOOTABLE ON-DEVICE CONTAINER & VM IMAGE
# Tuned for macOS Tahoe Virtualization (Metal 3 VirtIO-GPU & CoreAudio VirtIO-Sound)
# Equipped with interactive terminal, web access, and .deb/.apk/.arch package tools
# ==============================================================================

# Stage 1: Build llama.cpp (llama-server) optimized for CPU (AVX2/NEON)
FROM alpine:3.20 AS llama-builder
RUN apk add --no-cache \
    git \
    build-base \
    cmake \
    linux-headers \
    musl-dev \
    cflags \
    libstdc++

WORKDIR /build
RUN git clone --depth 1 https://github.com/ggerganov/llama.cpp.git . && \
    cmake -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DGGML_AVX=ON \
        -DGGML_AVX2=ON \
        -DGGML_FMA=ON \
        -DGGML_F16C=ON \
        -DGGML_NATIVE=OFF \
        -DGGML_BUILD_TESTS=OFF \
        -DGGML_BUILD_EXAMPLES=OFF && \
    cmake --build build --config Release --target llama-server -j$(nproc)

# Stage 2: Build the retro web frontend
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 3: Minimal Appliance OS Image tuned for macOS Tahoe
FROM alpine:3.20

LABEL maintainer="lordlobrau@gmail.com"
LABEL description="Bootable on-device LLM OS with macOS Tahoe tuned VirtIO drivers and full AI operator"

ARG MODEL_URL="https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
ARG MODEL_NAME="Llama-3.2-3B-Instruct-Q4_K_M.gguf"
ARG SKIP_MODEL_DOWNLOAD=false

ENV NODE_ENV=production
ENV PORT=3000
ENV MODEL_PATH=/models/${MODEL_NAME}
ENV LLAMA_SERVER_URL=http://127.0.0.1:8080
ENV THREADS=4
ENV CTX_SIZE=2048

# Virtual graphics & audio driver tuning environment variables for macOS Tahoe
ENV WLR_RENDERER=gles2
ENV MESA_LOADER_DRIVER_OVERRIDE=virtio_gpu
ENV LIBGL_ALWAYS_SOFTWARE=0
ENV VIRGL_SERVER_VERSION=1.0.1
ENV ALSA_CARD=0
ENV AUDIODEV=hw:0,0

# Install runtime dependencies including:
# - Graphics: cage (Wayland kiosk), chromium, mesa-dri-gallium (VirtIO GPU Metal acceleration), virglrenderer
# - Audio: alsa-lib, alsa-utils, pipewire (VirtIO Sound CoreAudio 48kHz low-latency bridge)
# - Package tools: apk-tools, dpkg (for .deb packages), binutils, tar, xz, zstd (for Arch packages), curl (web access)
RUN apk add --no-cache \
    nodejs \
    npm \
    libstdc++ \
    libgomp \
    cage \
    chromium \
    mesa-dri-gallium \
    virglrenderer \
    mesa-va-gallium \
    seatd \
    udev \
    dbus \
    alsa-lib \
    alsa-utils \
    pipewire \
    dpkg \
    binutils \
    tar \
    xz \
    zstd \
    supervisor \
    curl \
    bash \
    tini \
    font-noto \
    font-noto-emoji \
    shadow

# Create service users & directories
RUN useradd -u 1000 -U -d /home/gemini -m -s /bin/bash gemini && \
    mkdir -p /models /app /var/log/gemini95 /etc/supervisor/conf.d /etc/alsa/conf.d

# Configure ALSA sound card for CoreAudio 48kHz, 512 buffer frames (~10.6ms)
RUN cat <<'EOF' > /etc/asound.conf
pcm.!default {
    type plug
    slave {
        pcm "hw:0,0"
        rate 48000
        channels 2
        format S24_LE
        period_size 512
        buffer_size 2048
    }
}
ctl.!default {
    type hw
    card 0
}
EOF

# Copy llama.cpp compiled binaries from Stage 1
COPY --from=llama-builder /build/build/bin/llama-server /usr/local/bin/llama-server
RUN chmod +x /usr/local/bin/llama-server

# Copy built frontend and Node backend server from Stage 2
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=web-builder /app/dist /app/dist
COPY server.js /app/server.js
COPY server.ts /app/server.ts

# Bundle systemd unit service files
COPY systemd/ /etc/systemd/system/

# Optional build-time model download
RUN if [ "$SKIP_MODEL_DOWNLOAD" != "true" ]; then \
        echo "=== Downloading quantized GGUF model: ${MODEL_NAME} ===" && \
        curl -L -C - --retry 3 --retry-delay 5 -o "/models/${MODEL_NAME}" "${MODEL_URL}" && \
        ls -lh "/models/${MODEL_NAME}"; \
    else \
        echo "=== Skipping model download at build time ==="; \
    fi

# Configure Supervisor
RUN cat <<'EOF' > /etc/supervisor/conf.d/gemini95.conf
[supervisord]
nodaemon=true
user=root
logfile=/var/log/gemini95/supervisord.log
pidfile=/var/run/supervisord.pid

[program:llama-server]
command=/usr/local/bin/llama-server -m %(ENV_MODEL_PATH)s --host 127.0.0.1 --port 8080 --threads %(ENV_THREADS)s --ctx-size %(ENV_CTX_SIZE)s --batch-size 512
autostart=true
autorestart=true
user=gemini
priority=10
stdout_logfile=/var/log/gemini95/llama.log
stderr_logfile=/var/log/gemini95/llama_err.log

[program:gemini95-web]
command=/usr/bin/node /app/server.js
directory=/app
autostart=true
autorestart=true
user=gemini
priority=20
stdout_logfile=/var/log/gemini95/web.log
stderr_logfile=/var/log/gemini95/web_err.log

[program:kiosk]
command=/usr/bin/cage -s -- /usr/bin/chromium-browser --kiosk --noerrdialogs --disable-infobars --no-first-run --disk-cache-dir=/tmp/chromium-cache http://127.0.0.1:3000
environment=XDG_RUNTIME_DIR="/run/user/1000",WLR_LIBINPUT_NO_DEVICES="1",MESA_LOADER_DRIVER_OVERRIDE="virtio_gpu"
autostart=false
autorestart=true
user=gemini
priority=30
EOF

# Setup entrypoint
RUN cat <<'EOF' > /entrypoint.sh
#!/bin/bash
set -e
echo "=========================================================="
echo "   LLM-95: ON-DEVICE INFERENCE ENGINE & RETRO OS          "
echo "   Tuned for macOS Tahoe Virtualization (Metal 3 & CoreAudio)"
echo "=========================================================="
echo "Target Model: ${MODEL_PATH}"
echo "Hardware: $(nproc) CPU Cores detected"

if [ ! -f "${MODEL_PATH}" ]; then
    echo "⚠️  WARNING: Bundled GGUF model not found at ${MODEL_PATH}!"
    echo "Starting web server in standby emulation mode."
fi

mkdir -p /run/user/1000 && chown -R gemini:gemini /run/user/1000 /models /var/log/gemini95
chmod 0700 /run/user/1000

if [ "$1" = "--kiosk" ] || [ "${ENABLE_KIOSK}" = "true" ]; then
    sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/gemini95.conf
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/gemini95.conf
EOF

RUN chmod +x /entrypoint.sh && chown -R gemini:gemini /models /app /home/gemini
EXPOSE 3000 8080
VOLUME ["/models"]
ENTRYPOINT ["/entrypoint.sh"]
