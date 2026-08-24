#!/usr/bin/env bash
# Signs and packages the Apple Wallet pass.
# Every path is overridable so the guards can be tested in isolation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="${PASS_BUNDLE_DIR:-$ROOT/wallet/AliHamed.pass}"
CERT_DIR="${PASS_CERT_DIR:-$ROOT/wallet/certs}"
DIST_DIR="${PASS_DIST_DIR:-$ROOT/dist}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf '\nCannot sign the pass.\n\n%s\n\nFull instructions: wallet/README.md\n\n' "$1" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || fail "openssl was not found on PATH."
command -v zip     >/dev/null 2>&1 || fail "zip was not found on PATH."

[ -d "$BUNDLE_DIR" ] || fail "Pass bundle not found at:
  $BUNDLE_DIR

Build it first:  npm run build"

P12="$(find "$CERT_DIR" -maxdepth 1 -name '*.p12' 2>/dev/null | head -n1 || true)"
[ -n "$P12" ] || fail "No .p12 certificate found in:
  $CERT_DIR

Outstanding steps:
  1. Keychain Access > Certificate Assistant > Request a Certificate
     From a Certificate Authority > save to disk
  2. developer.apple.com > Identifiers > Pass Type IDs > create
     pass.com.alihamed.card
  3. Create Certificate, upload the CSR, download pass.cer
  4. Double-click pass.cer to install it
  5. In Keychain Access select the certificate AND its private key >
     Export 2 items > save as wallet/certs/Certificates.p12"

WWDR="$(find "$CERT_DIR" -maxdepth 1 \( -name '*WWDR*.cer' -o -name '*WWDR*.pem' \) 2>/dev/null | head -n1 || true)"
[ -n "$WWDR" ] || fail "No Apple WWDR intermediate certificate found in:
  $CERT_DIR

Download the WWDR G4 certificate from
https://www.apple.com/certificateauthority/ and save it into wallet/certs/."

if [ -z "${PASS_CERT_PASSWORD:-}" ]; then
  read -r -s -p "Password for $(basename "$P12"): " PASS_CERT_PASSWORD
  echo
fi
export PASS_CERT_PASSWORD

# OpenSSL 3 refuses Keychain-exported .p12 files without -legacy: Keychain
# still encrypts them with RC2, which moved to the legacy provider.
LEGACY=""
if openssl version | grep -q '^OpenSSL 3'; then LEGACY="-legacy"; fi

# shellcheck disable=SC2086
openssl pkcs12 $LEGACY -in "$P12" -clcerts -nokeys \
  -out "$WORK/cert.pem" -passin env:PASS_CERT_PASSWORD 2>/dev/null \
  || fail "Could not read the certificate from $(basename "$P12").
The password may be wrong, or the file may not be a Pass Type ID certificate."

# shellcheck disable=SC2086
openssl pkcs12 $LEGACY -in "$P12" -nocerts -nodes \
  -out "$WORK/key.pem" -passin env:PASS_CERT_PASSWORD 2>/dev/null \
  || fail "Could not read the private key from $(basename "$P12").
Re-export from Keychain Access selecting BOTH the certificate and its
private key (Export 2 items)."

case "$WWDR" in
  *.cer) openssl x509 -inform DER -in "$WWDR" -out "$WORK/wwdr.pem" ;;
  *)     cp "$WWDR" "$WORK/wwdr.pem" ;;
esac

mkdir -p "$WORK/pass"
cp "$BUNDLE_DIR"/* "$WORK/pass/"
rm -f "$WORK/pass/manifest.json" "$WORK/pass/signature"

# manifest.json maps every filename to the SHA-1 of its contents.
cd "$WORK/pass"
{
  printf '{\n'
  first=1
  for f in *; do
    if [ "$f" = "manifest.json" ]; then continue; fi
    h="$(openssl dgst -sha1 -hex "$f" | awk '{print $NF}')"
    if [ "$first" -eq 0 ]; then printf ',\n'; fi
    printf '  "%s" : "%s"' "$f" "$h"
    first=0
  done
  printf '\n}\n'
} > manifest.json

openssl smime -binary -sign \
  -certfile "$WORK/wwdr.pem" \
  -signer "$WORK/cert.pem" \
  -inkey "$WORK/key.pem" \
  -in manifest.json \
  -out signature \
  -outform DER \
  || fail "Signing failed. Check that the certificate has not expired and
matches passTypeIdentifier in config.json."

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/AliHamed.pkpass"
# Files must sit at the archive ROOT. Nesting them inside a folder produces a
# pass that fails to open with no useful error.
zip -q -r "$DIST_DIR/AliHamed.pkpass" . -x '.*'

printf '\nSigned: %s/AliHamed.pkpass\n' "$DIST_DIR"
printf 'Install by AirDrop or email. Do not host it until the MIME type is verified.\n\n'
