#!/bin/sh
set -eu

repository_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_dir=${1:-"$repository_dir/build"}

arduino-cli compile \
  --fqbn 'esp32:esp32:esp32s3:FlashSize=8M,PartitionScheme=default_8MB,PSRAM=opi' \
  --build-path "$build_dir/work" \
  --output-dir "$build_dir" \
  "$repository_dir/firmware/codex_usage_display"
