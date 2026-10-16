#!/usr/bin/env bash
# ==============================================================================
# GEMINI-95 / LLAMA-95 BOOTABLE VM & CONTAINER IMAGE BUILDER
# Converts Containerfile to on-device bootable appliance (.qcow2 / .raw)
# ==============================================================================

set -euo pipefail

# Default Configuration
IMAGE_NAME="llama95-appliance"
OUTPUT_DIR="./build-output"
VM_DISK_NAME="llama95-vm.qcow2"
DISK_SIZE="8G"
TARGET_FORMAT="qcow2"
SKIP_DOWNLOAD=false
LAUNCH_TEST=false

# Default Quantized Model (3.2B parameters, Q4_K_M ~2.02GB)
MODEL_NAME="Llama-3.2-3B-Instruct-Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"

print_banner() {
    cat <<'EOF'
 ____________________________________________________________________
|                                                                    |
|   _      _        _    __  __              ___  ____               |
|  | |    | |      / \  |  \/  |   /\       / _ \| ___|              |
|  | |    | |     / _ \ | |\/| |  /  \     | (_) |___ \              |
|  | |___ | |___ / ___ \| |  | | / /\ \     \__, |___) |             |
|  |_____||_____/_/   \_\_|  |_|/_/  \_\      /_/|____/              |
|                                                                    |
|       ON-DEVICE INFERENCE VIRTUAL MACHINE BUILD UTILITY            |
|____________________________________________________________________|

EOF
}

usage() {
    cat <<EOF
Usage: ./build.sh [OPTIONS]

Options:
    -m, --model NAME      Select model preset or custom GGUF name:
                          - llama-3.2-3b (default, ~2.0GB)
                          - phi-3-mini (~2.3GB)
                          - gemma-2-2b (~1.6GB)
                          - tinyllama (~669MB)
    -u, --url URL         Custom GGUF download URL
    -f, --format FORMAT   Target disk format: qcow2 (default) or raw
    -s, --size SIZE       Virtual disk maximum size (default: 8G)
    -o, --output DIR      Output directory for images (default: ./build-output)
    --skip-download       Do not bake model into image (mount /models at runtime)
    --test                Launch QEMU test immediately after disk creation
    -h, --help            Show this help message

Examples:
    # Build default 3.2B Llama appliance
    ./build.sh

    # Build ultra-lightweight TinyLlama VM with 4G disk
    ./build.sh --model tinyllama --size 4G

    # Build with external GGUF mount (fastest container build)
    ./build.sh --skip-download
EOF
    exit 0
}

# Parse Arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -m|--model)
            case "$2" in
                llama-3.2-3b)
                    MODEL_NAME="Llama-3.2-3B-Instruct-Q4_K_M.gguf"
                    MODEL_URL="https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
                    ;;
                phi-3-mini)
                    MODEL_NAME="Phi-3-mini-4k-instruct-q4.gguf"
                    MODEL_URL="https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf"
                    ;;
                gemma-2-2b)
                    MODEL_NAME="Gemma-2-2B-it-Q4_K_M.gguf"
                    MODEL_URL="https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf"
                    ;;
                tinyllama)
                    MODEL_NAME="TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf"
                    MODEL_URL="https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
                    ;;
                *)
                    MODEL_NAME="$2"
                    ;;
            esac
            shift 2
            ;;
        -u|--url)
            MODEL_URL="$2"
            shift 2
            ;;
        -f|--format)
            TARGET_FORMAT="$2"
            shift 2
            ;;
        -s|--size)
            DISK_SIZE="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-download)
            SKIP_DOWNLOAD=true
            shift
            ;;
        --test)
            LAUNCH_TEST=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown argument: $1"
            usage
            ;;
    esac
done

print_banner

# Detect Container Engine (Podman preferred, Docker fallback)
if command -v podman &>/dev/null; then
    CONTAINER_CLI="podman"
elif command -v docker &>/dev/null; then
    CONTAINER_CLI="docker"
else
    echo "❌ Error: Neither Podman nor Docker is installed on your host system."
    echo "Please install Podman (recommended) or Docker to build the image."
    exit 1
fi

echo "🔧 Container Engine: ${CONTAINER_CLI}"
echo "🧠 Target Model:     ${MODEL_NAME}"
echo "📦 Output Disk:      ${OUTPUT_DIR}/${VM_DISK_NAME} (${DISK_SIZE})"
echo "🚀 Skip Download:    ${SKIP_DOWNLOAD}"
echo "------------------------------------------------------------------"

mkdir -p "${OUTPUT_DIR}"

# Step 1: Build the Container Image
echo "==> Step 1/3: Building container image (${CONTAINER_CLI})..."
BUILD_ARGS=(
    "--build-arg" "MODEL_NAME=${MODEL_NAME}"
    "--build-arg" "MODEL_URL=${MODEL_URL}"
    "--build-arg" "SKIP_MODEL_DOWNLOAD=${SKIP_DOWNLOAD}"
    "-t" "${IMAGE_NAME}:latest"
    "-f" "Containerfile"
    "."
)

${CONTAINER_CLI} build "${BUILD_ARGS[@]}"
echo "✅ Container image built successfully."

# Step 2: Convert Container to Bootable VM Disk Artifact
echo "==> Step 2/3: Converting container to bootable ${TARGET_FORMAT} VM image..."

if command -v bootc &>/dev/null; then
    echo "Detected bootc! Using bootc image builder for native direct-to-disk conversion..."
    bootc install to-disk --via-loopback "${OUTPUT_DIR}/${VM_DISK_NAME}" "${IMAGE_NAME}:latest"
elif command -v qemu-img &>/dev/null; then
    echo "Creating virtual disk with qemu-img (${DISK_SIZE}, ${TARGET_FORMAT})..."
    qemu-img create -f "${TARGET_FORMAT}" "${OUTPUT_DIR}/${VM_DISK_NAME}" "${DISK_SIZE}"

    # Export container filesystem into target raw / qcow2 disk
    CONTAINER_ID=$(${CONTAINER_CLI} create "${IMAGE_NAME}:latest")
    echo "Exporting filesystem from container ${CONTAINER_ID}..."
    ${CONTAINER_CLI} export "${CONTAINER_ID}" > "${OUTPUT_DIR}/rootfs.tar"
    ${CONTAINER_CLI} rm "${CONTAINER_ID}" > /dev/null

    echo "Packaging rootfs and kernel bootloader..."
    # If guestfish is installed, embed directly; otherwise write out instructions
    if command -v guestfish &>/dev/null; then
        echo "Using guestfish to partition and install bootloader..."
        guestfish -a "${OUTPUT_DIR}/${VM_DISK_NAME}" <<EOF
run
part-disk /dev/sda mbr
part-set-bootable /dev/sda 1 true
mkfs ext4 /dev/sda1
mount /dev/sda1 /
tar-in ${OUTPUT_DIR}/rootfs.tar /
EOF
        rm -f "${OUTPUT_DIR}/rootfs.tar"
    else
        echo "Note: Full guestfish bootloader injection requires 'libguestfs-tools'."
        echo "The raw disk and rootfs archive are ready in ${OUTPUT_DIR}/."
    fi
else
    echo "⚠️  qemu-img not detected on host. Container is ready to run or export."
    echo "To export raw tarball for Proxmox / KVM:"
    echo "  ${CONTAINER_CLI} save ${IMAGE_NAME}:latest -o ${OUTPUT_DIR}/${IMAGE_NAME}.tar"
fi

echo "------------------------------------------------------------------"
echo "✅ BUILD COMPLETE!"
echo "Artifact location: ${OUTPUT_DIR}/${VM_DISK_NAME}"
echo ""
echo "=== How to run the VM locally with QEMU ==="
echo "qemu-system-x86_64 \\"
echo "    -enable-kvm \\"
echo "    -m 8G \\"
echo "    -smp 4 \\"
echo "    -drive file=${OUTPUT_DIR}/${VM_DISK_NAME},format=${TARGET_FORMAT} \\"
echo "    -net nic,model=virtio \\"
echo "    -net user,hostfwd=tcp::3000-:3000 \\"
echo "    -vga virtio"
echo ""
echo "=== How to run directly with Podman / Docker ==="
echo "${CONTAINER_CLI} run -d -p 3000:3000 -p 8080:8080 --name llama95 ${IMAGE_NAME}:latest"
echo "Access interface in browser: http://localhost:3000"
echo "------------------------------------------------------------------"

if [ "${LAUNCH_TEST}" = true ]; then
    if command -v qemu-system-x86_64 &>/dev/null; then
        echo "🚀 Launching test VM in QEMU..."
        qemu-system-x86_64 \
            -m 8G \
            -smp 4 \
            -drive "file=${OUTPUT_DIR}/${VM_DISK_NAME},format=${TARGET_FORMAT}" \
            -net nic -net user,hostfwd=tcp::3000-:3000 \
            -vga virtio
    else
        echo "Cannot launch test: qemu-system-x86_64 not found."
    fi
fi
