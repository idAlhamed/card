# Programming the NFC card

The NFC tag and the QR code point at the same destination:

    https://idalhamed.github.io/card

## What to buy

An **NTAG213**, NTAG215, or NTAG216 tag — as a blank PVC card, or as a sticker
to place inside a printed card. NTAG213 holds 144 bytes; this URL is
32 characters, so capacity is not a constraint. Buy the cheapest of
the three.

## Programming it

1. Install **NFC Tools** (free, iOS and Android).
2. Open the app and choose **Write**.
3. Tap **Add a record** > **URL/URI**.
4. Enter exactly:

       https://idalhamed.github.io/card

5. Tap **Write**, then hold the tag against the top of your phone.
6. Test it: lock your phone, then tap the tag against another iPhone.

## Locking

NFC Tools offers to lock the tag so it can never be rewritten. This is
**permanent and irreversible**. Only lock a tag after you have confirmed the
URL opens correctly, and keep at least one unlocked spare.

## Why the Wallet pass does not do this

An Apple Wallet pass cannot broadcast an arbitrary URL over NFC. The `nfc`
dictionary in PassKit is Value Added Services: it requires an NFC certificate
from Apple, works only with certified merchant terminals, and transmits an
encrypted payload rather than a link. There is no supported way to make a pass
tap-to-open a website on someone else's phone.

So the pass carries the QR code, and this tag carries the URL. Both resolve to
the same place.

## iPhone background reading

iPhone XS and later read NDEF tags with no app open and the screen simply
awake. A tap surfaces a notification that opens the page. Nothing to install
on the other person's phone.
