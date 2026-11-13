#!/usr/bin/env bash
# 在 macOS 上本地编译未签名 IPA（需安装 Xcode + xcodegen）
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "==> 1/5 准备网页资源"
rm -rf ios/GoldMiner/www
mkdir -p ios/GoldMiner/www
cp -R www/. ios/GoldMiner/www/

echo "==> 2/5 检查 xcodegen"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "未找到 xcodegen，尝试通过 Homebrew 安装..."
  brew install xcodegen
fi

echo "==> 3/5 生成 Xcode 工程"
cd ios
xcodegen generate

echo "==> 4/5 编译"
xcodebuild \
  -project GoldMiner.xcodeproj \
  -scheme GoldMiner \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  build

echo "==> 5/5 打包 IPA"
APP="build/Build/Products/Release-iphoneos/GoldMiner.app"
rm -rf Payload GoldMiner.ipa
mkdir -p Payload
cp -R "$APP" Payload/
if command -v ldid >/dev/null 2>&1; then
  ldid -S Payload/GoldMiner.app/GoldMiner || true
fi
zip -qry GoldMiner.ipa Payload
rm -rf Payload

echo ""
echo "完成 ✅  IPA 位置：$ROOT/ios/GoldMiner.ipa"
echo "用 TrollStore 打开并选择该文件即可安装。"
