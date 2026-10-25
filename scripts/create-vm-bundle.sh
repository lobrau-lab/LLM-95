#!/usr/bin/env bash
# ==============================================================================
# LLM-95 OS APPLIANCE BUNDLER
# Packages GRUB 2 bootloader, kernel, initramfs, VM disk, and hypervisor scripts
# ==============================================================================

set -euo pipefail

TARGET_DIR="${1:-./dist-vm}"
mkdir -p "${TARGET_DIR}/boot/grub"
mkdir -p "${TARGET_DIR}/boot/syslinux"

echo "📦 Packaging LLM-95 OS Contained Environment for Virtual Machines..."

# Copy bootloader configurations
cp boot/grub/grub.cfg "${TARGET_DIR}/boot/grub/grub.cfg"
cp boot/syslinux/isolinux.cfg "${TARGET_DIR}/boot/syslinux/isolinux.cfg"
cp init "${TARGET_DIR}/init"
chmod +x "${TARGET_DIR}/init"

# Generate UTM Virtual Machine Configuration (macOS Tahoe Apple Silicon M-Series)
cat <<'EOF' > "${TARGET_DIR}/UTM-Config.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ConfigurationVersion</key>
    <integer>4</integer>
    <key>Information</key>
    <dict>
        <key>Name</key>
        <string>LLM-95 OS (On-Device Neural VM)</string>
        <key>Icon</key>
        <string>retro-computer</string>
        <key>Notes</key>
        <string>Sealed macOS Tahoe VirtIO Virtual Machine with on-device GGUF neural operator.</string>
    </dict>
    <key>System</key>
    <dict>
        <key>Architecture</key>
        <string>aarch64</string>
        <key>CPUCount</key>
        <integer>4</integer>
        <key>MemorySize</key>
        <integer>8192</integer>
        <key>Hypervisor</key>
        <true/>
    </dict>
    <key>Displays</key>
    <array>
        <dict>
            <key>Hardware</key>
            <string>virtio-gpu-gl-pci</string>
            <key>Width</key>
            <integer>1920</integer>
            <key>Height</key>
            <integer>1080</integer>
        </dict>
    </array>
    <key>Sound</key>
    <dict>
        <key>Hardware</key>
        <string>virtio-snd-pci</string>
        <key>SampleRate</key>
        <integer>48000</integer>
    </dict>
</dict>
</plist>
EOF

# Generate QEMU standalone launcher
cat <<'EOF' > "${TARGET_DIR}/launch-qemu.sh"
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
EOF
chmod +x "${TARGET_DIR}/launch-qemu.sh"

echo "✅ VM bundle generation script ready in ${TARGET_DIR}."
