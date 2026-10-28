// Block: QR code. <QR value="https://..." /> draws it as SVG, so it stays sharp on a TV.
// Phones scan it with the normal camera app. For a code that changes, pass a new value.
import { QRCodeSVG } from "qrcode.react";

export function QR({ value, size = 320, label }: { value: string; size?: number; label?: string }) {
  return (
    <figure className="qr" style={{ width: size }}>
      <QRCodeSVG value={value} size={size} marginSize={2} bgColor="#ffffff" fgColor="#000000" level="M" />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
