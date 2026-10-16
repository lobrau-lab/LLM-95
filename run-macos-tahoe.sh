#!/usr/bin/env bash
# ==============================================================================
# LLM-95 macOS Tahoe Hypervisor Launcher (Apple Virtualization / QEMU HVF)
# VirtIO-GPU Metal 3 Graphics + VirtIO-Sound CoreAudio 48kHz Low-Latency Buffer
# ==============================================================================

set -euo pipefail

IMAGE_PATH="${1:-build-output/llama95-vm.qcow2}"
RAM="8G"
CORES="4"

ARCH=$(uname -m)

echo "======================================================================"
echo "  LLM-95 BOOT SEQUENCE: macOS Tahoe Virtualization Bridge"
echo "  Architecture: ${ARCH} | Hypervisor: Apple HVF"
echo "  Graphics: VirtIO-GPU (Metal 3 Accelerated, 120Hz/60Hz HiDPI)"
echo "  Audio: VirtIO-Sound (CoreAudio 48kHz Stereo, 512f Buffer)"
echo "======================================================================"

if [ ! -f "${IMAGE_PATH}" ]; then
    echo "⚠️  Disk image not found at ${IMAGE_PATH}."
    echo "Building appliance disk first via ./build.sh..."
    ./build.sh --format qcow2
fi

if [ "${ARCH}" = "arm64" ]; then
    echo "🚀 Launching Apple Silicon (M-Series) Hypervisor VM..."
    exec qemu-system-aarch64 \
        -M virt,highmem=on,accel=hvf \
        -cpu host \
        -smp "${CORES}" \
        -m "${RAM}" \
        -drive "file=${IMAGE_PATH},format=qcow2,if=virtio" \
        -device virtio-gpu-gl-pci \
        -display default,show-cursor=on \
        -audiodev coreaudio,id=snd0,out.buffer-length=512 \
        -device virtio-snd-pci,audiodev=snd0 \
        -device virtio-net-pci,netdev=net0 \
        -netdev user,id=net0,hostfwd=tcp::3000-:3000,hostfwd=tcp::8080-:8080 \
        -device virtio-keyboard-pci \
        -device virtio-mouse-pci
else
    echo "🚀 Launching x86_64 Hypervisor VM on macOS Tahoe..."
    exec qemu-system-x86_64 \
        -accel hvf \
        -cpu host \
        -smp "${CORES}" \
        -m "${RAM}" \
        -drive "file=${IMAGE_PATH},format=qcow2" \
        -device virtio-gpu-gl-pci \
        -audiodev coreaudio,id=snd0,out.buffer-length=512 \
        -device virtio-snd-pci,audiodev=snd0 \
        -device virtio-net-pci,netdev=net0 \
        -netdev user,id=net0,hostfwd=tcp::3000-:3000,hostfwd=tcp::8080-:8080
fi
