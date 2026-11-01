// Block: QR code. <QR value="https://..." /> draws it as SVG, so it stays sharp on a TV.
// Phones scan it with the normal camera app. For a code that changes, pass a new value.
// Text longer than QR_MAX_BYTES shows a Status error in place of the code.
// The code is black on white in both themes, with a 4-module quiet zone of the same white, which
// the door's reader (jsQR, dark on light only) needs. Inside a .pass or a .stage-card it sits on
// the kit's white plate (.qrcode: radius 12, no ring). Screen readers hear `alt` ("QR code"
// unless you name it), or the caption when `label` is given, which names it on screen.
import { QRCodeSVG } from "qrcode.react";
import { Status } from "./ui";

// The most UTF-8 bytes one QR code holds at error level M (version 40). qrcode.react throws
// "Data too long" while rendering anything longer. Text of only digits fits more, but no page
// here shows a code that long.
export const QR_MAX_BYTES = 2331;

export function QR({ value, size = 320, label, alt = "QR code" }: { value: string; size?: number; label?: string; alt?: string }) {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > QR_MAX_BYTES) {
    return <Status kind="error">{`Too long for a QR code: ${bytes} bytes, and a QR code holds at most ${QR_MAX_BYTES}.`}</Status>;
  }
  return (
    <figure className="qr" style={{ width: size }}>
      <QRCodeSVG
        value={value}
        size={size}
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#000000"
        level="M"
        role="img"
        aria-label={label ? undefined : alt}
        aria-hidden={label ? true : undefined}
      />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
