// Test sign-in for `npm run dev` only: makes a signed token for any name and email, so you
// can test without Google. Convex accepts it only on dev backends (convex/auth.config.ts).
// The key is public on purpose; never add this issuer to prod. The live build never loads
// this file (auth.tsx imports it behind import.meta.env.DEV).
const KEY: JsonWebKey & { kid: string } = {"kty":"RSA","n":"8DhNbyNzptK-pIspbUx58Z0ouSE8hvtMqiqnglhuUCj_QmrdTJ4hN4VWFS_dpw7bnEJ7WDZ-CF8XIilWXHYCTFTFhc71CDuj0VgdSFn62FYzyzuRB7r_0_SHxVnB2oKhhaUQekTMionV3P4JspBrorW7SwcBl9CxLdfjMmydLM_4ktQvBZr7s4De72JokE5U5q4Mj7FfnIUPGYBldXVDxXwUeBUZIW0HdbruKC-ZEx9SLzU5ZNeSkeMypq72FJY0ZI_kIDwHkVSLbH8TTnk7yy8kqE1Dvuopmz218QdwyKlovWOjDC0SEYccXaq8JWIMF_NUtLLzYrmG_MJIW9X9MQ","e":"AQAB","d":"AaP9fMYRElf6iF9cCglDiS6fP1YV8jjP55JwhXcYu22gHM3NwqEpkOnZugjVYKGZwoAhvDYmX06b6bL8pLH6u7Gelp9cLvstJ4QIMnm_zytCB0wyXV8mrabMFpUYJAsAoDpHIHZeuKAvz8wVvN68mQmssuOUzxDl8h7B9GaevUkdJad-7BWpSjtFyrIACufLbWcZa7MGE6geo6vVV9FF8u7vGVsKxKuAjp7OaB9kmIJW_b6WHx8LIzjX26t1AfgX1MSucyM8d0J55a-sEUK8qhGwqzM--_DxcitMpVkPgFTpZlKbRcgHiwjswUN_G6q1sd22CXGNkdmogivQ3BrZwQ","p":"-B4jCUGdJRNnf-GvCZLu0Mya5IUfP8p6_nbFH6BZIUWt2TO8bUA9FB09wE6X_uuYaqzhHQtEwvGe2H362xOfPEL1T6ThazCM-p43QAQPSinCMKxKJMnFw5vo7MEmhwiIfEEdJ0xhZQ_rpAmggTfPUf-PXyJeka3GiuMBrQNMFdU","q":"99nvdPmedlx70D2MaTNtaFuHZ3JLXoEagIsR8heyMy9ONoaSvjBvn5yy8oF3tsTQAZLcbnHqWZJ43gHi-TY3p80iZ01X1vx7zNPaHHDi4vge8S_4j__VgNrF4fufqIAmFkMTebZ9w2TmTLZaAzyHTEQKjYZqPxmAvkTgt6JPK-0","dp":"CSaLYj8CPajOi1_WZcL-fcLd_4mNUnv0N0hIEteGEf0Q4U7QJzNUTVaavWnonyUvNNf1YW3V9l6U3iUfSE8b80wA4hQRoDNlL6UAIqNDsReDKupfvaWXXpR0ba7d7eL5raN1IMrnWKPSq_US71EQm1SShA6vcC35gYvHtwrFFpU","dq":"pj0pzEalD3Rmozy1EdapmmZRwoO5o7BqSy98IOnd31DqX84RXLl2FRNwPxGxbwhBD90mNnn3mo6QvS98wnSoDcecPLd2pD8C9lZeI9dfhqavckwfps4MsPmL4k_4PXd-lE33IRrS7Zyej3N7mlId2XyFq3ktiBcd8ACYzPJzsd0","qi":"FU-f6FoNFZypoD9b0riynp6tVYXVdq3HJ4jnptVISdvyEIKEIavxx_X1ayn6LM7j6K4IsnvJJFgruTjax4WbidlPPOoz75e4LZh2AjsRSxVpO1A_j46q7bOICEFOXn4gnPo0kt9wYMzQGyzNda8B2i99XHixOye4lpDRuz-iBCI","kid":"rcc-test-1","alg":"RS256"};

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

export async function mintTestToken(name: string, email: string) {
  const key = await crypto.subtle.importKey("jwk", KEY, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: "RS256", typ: "JWT", kid: "rcc-test-1" });
  const body = enc({
    iss: "https://test-login.rcc-live-lecture.local",
    aud: "rcc-live-lecture-test",
    sub: email.toLowerCase(),
    name,
    email,
    email_verified: true,
    iat: now,
    exp: now + 3600,
  });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}
