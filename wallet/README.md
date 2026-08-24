# Apple Wallet pass

## What this is, and what it is not

The pass displays your name, role, and technologies, and carries a QR code
pointing at `CARD_URL`. Wallet renders that QR itself from
`barcodes[0].message`, so the pass and the website can never disagree about
the destination.

**The pass cannot act as an NFC business card.** The `nfc` dictionary in
PassKit is Value Added Services: it requires a separate NFC certificate from
Apple, works only with certified merchant terminals, and transmits an
encrypted payload rather than a URL. No Wallet pass can tap-to-open a website
on someone else's phone. That is what the physical NFC tag is for — see
`nfc/README.md`.

## Current state

`npm run build` always builds the pass images (`wallet/AliHamed.pass/*.png`)
because those don't depend on Apple credentials. It only writes `pass.json`
once `apple.teamIdentifier` in `config.json` is a real 10-character Team ID.
Today that field is empty, which is correct at this stage — the build
succeeds, skips `pass.json`, and prints exactly what's outstanding under
"Outstanding:" at the end of the build log. The website and everything else
are never blocked by this.

The bundle that does exist is **unsigned, and an unsigned pass will not open
on any device.** No placeholder certificate or signature is ever written.
Signing needs a paid Apple Developer account and the steps below.

## Signing

**1. Create a signing request**

Keychain Access > Certificate Assistant > *Request a Certificate From a
Certificate Authority*. Enter your email, leave CA Email blank, choose *Saved
to disk*, and save the `.certSigningRequest` file.

**2. Create the Pass Type ID**

developer.apple.com > Certificates, Identifiers & Profiles > Identifiers >
**+** > **Pass Type IDs**. Description: `Ali Hamed Digital Card`. Identifier:
`pass.com.alihamed.card` — it must match `apple.passTypeIdentifier` in
`config.json`.

**3. Create the certificate**

Select the new identifier > *Create Certificate* > upload the CSR from step 1 >
download `pass.cer`.

**4. Install it**

Double-click `pass.cer`. It lands in your login keychain.

**5. Export it with its private key**

In Keychain Access, find the certificate and expand it to reveal the private
key. Select **both** rows, right-click > *Export 2 items* > save as
`wallet/certs/Certificates.p12` with a password you will remember.

Exporting the certificate alone produces a `.p12` that cannot sign anything.

**6. Copy your Team ID**

developer.apple.com > Membership. It is 10 characters. Paste it into
`apple.teamIdentifier` in `config.json`, then run `npm run build` again —
`pass.json` is only written once the Team ID is present.

**7. Download the Apple intermediate certificate**

From https://www.apple.com/certificateauthority/ take **Worldwide Developer
Relations - G4** (the WWDR certificate) and save it into `wallet/certs/`.

**8. Sign**

    npm run pass:sign

This writes `dist/AliHamed.pkpass`.

### If signing fails

The script names the missing piece. Two specific traps:

- *Could not read the private key* — you exported the certificate without its
  key. Redo step 5 with both rows selected.
- **OpenSSL 3 cannot open Keychain `.p12` files without `-legacy`**, because
  Keychain still encrypts them with RC2, which OpenSSL 3 moved into a legacy
  provider it no longer loads by default. `npm run pass:sign` detects an
  OpenSSL 3.x install and adds `-legacy` to every `openssl pkcs12` call for
  you. If you ever run `openssl` by hand against the `.p12`, add `-legacy`
  yourself or the command will fail with an opaque MAC-verification error.
  (This machine's `openssl version` reports OpenSSL 3, so `-legacy` is in
  effect here.)

## Installing

**AirDrop the `.pkpass` to your iPhone**, or email it to yourself and open the
attachment. Wallet opens it directly.

## Delivery, and why there is no button on the website

Hosting the pass for download requires the server to send
`Content-Type: application/vnd.apple.pkpass`. **GitHub Pages does not
reliably do this** — the file downloads as an inert blob instead of opening
Wallet.

An "Add to Apple Wallet" anchor is written into `src/index.html` but left
commented out. Enable it only after you have confirmed on a real device that
the hosted file opens in Wallet. Until then, AirDrop and email both work
perfectly.
