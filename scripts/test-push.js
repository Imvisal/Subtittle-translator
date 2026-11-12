// Round trip of the web push encryption: encrypt like the server, decrypt like a browser (RFC 8291), check the VAPID header
const crypto = require("crypto");
process.env.VAPID_PUBLIC_KEY = "BLoU2pvHS0yILBSE37pDd1FMXZ2XpKbmtxhgqjfII1m12MWFQiGrUyq2z0HLsRsbJKbe7b8EWakI4kZjs0Oc9dU";
process.env.VAPID_PRIVATE_KEY = "oa3SDr6li5LhJIMbOMyPH-FJ_XcgL3xQ2plTYcIe5nY";
const { _test } = require("../api/_push.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fail++; } };

const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { e: "https://push.example/abc", k: _test.b64u(ua.getPublicKey()), a: _test.b64u(auth) };
const msg = JSON.stringify({ t: "New Sinhala subtitle ready", b: "The Mentalist (2008)", u: "/tv/the-mentalist" });
const body = _test.encrypt(sub, msg);
const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), data = body.subarray(21 + idlen);
const secret = ua.computeSecret(asPub);
const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub]), 32));
const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(data.subarray(data.length - 16));
const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
ok(plain[plain.length - 1] === 2 && plain.subarray(0, plain.length - 1).toString() === msg, "payload decrypts to the original message");
ok(body.readUInt32BE(16) === 4096 && idlen === 65, "header: record size 4096, key id length 65");

const h = _test.vapidHeader("https://fcm.googleapis.com/fcm/send/xyz");
const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
ok(!!m, "VAPID header has the right shape");
if (m) {
    const pub = _test.unb64u(process.env.VAPID_PUBLIC_KEY);
    const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: _test.b64u(pub.subarray(1, 33)), y: _test.b64u(pub.subarray(33, 65)) }, format: "jwk" });
    ok(crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), { key: key, dsaEncoding: "ieee-p1363" }, _test.unb64u(m[3])), "VAPID signature verifies with the public key");
    ok(JSON.parse(_test.unb64u(m[2]).toString()).aud === "https://fcm.googleapis.com", "VAPID audience is the push service origin");
}
console.log(fail ? fail + " failed" : "all push tests passed");
process.exit(fail ? 1 : 0);
