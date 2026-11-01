// @vitest-environment node
// The QR block (qr.tsx) with the real qrcode.react. At error level M a QR code holds at most 2331
// bytes of text, and QRCodeSVG throws "Data too long" while rendering anything longer, which took
// down the whole page around it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QR, QR_MAX_BYTES } from "./qr";

const render = (value: string) => renderToStaticMarkup(createElement(QR, { value, size: 240 })).replace(/&#x27;/g, "'");

describe("QR", () => {
  it("sweep1-blocks-1 draws a code for text up to 2331 bytes", () => {
    expect(QR_MAX_BYTES).toBe(2331);
    expect(render("a".repeat(2331))).toContain("<svg");
  });

  it("sweep1-blocks-1 longer text shows a Status error with the byte count instead of throwing, counting UTF-8 bytes, not letters", () => {
    const long = render("a".repeat(2332));
    expect(long).not.toContain("<svg");
    expect(long).toContain('<p class="status status--error" role="alert">Too long for a QR code: 2332 bytes, and a QR code holds at most 2331.</p>');
    // 600 emoji are 600 letters but 2400 bytes.
    expect(render("😀".repeat(600))).toContain("Too long for a QR code: 2400 bytes");
  });
});
