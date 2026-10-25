#!/usr/bin/env bash
IMAGE_PATH="${1:-llama95-vm.qcow2}"
ARCH=$(uname -m)

if [ "${ARCH}" = "arm64" ]; then
    exec qemu-system-aarch64 \
        -M virt,highmem=on,accel=hvf \
        -cpu host \
        -smp 4 \
        -m 8G \
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
    exec qemu-system-x86_64 \
        -accel kvm -accel hvf \
        -cpu host \
        -smp 4 \
        -m 8G \
        -drive "file=${IMAGE_PATH},format=qcow2,if=virtio" \
        -device virtio-gpu-gl-pci \
        -audiodev coreaudio,id=snd0,out.buffer-length=512 \
        -device virtio-snd-pci,audiodev=snd0 \
        -device virtio-net-pci,netdev=net0 \
        -netdev user,id=net0,hostfwd=tcp::3000-:3000,hostfwd=tcp::8080-:8080
fi
