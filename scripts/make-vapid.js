// Makes the VAPID key pair for web push notifications. Run once:  node scripts/make-vapid.js
// Put the two values in Vercel -> Settings -> Environment Variables (and keep the private one secret).
const crypto = require("crypto");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const j = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]);
console.log("VAPID_PUBLIC_KEY=" + pub.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + j.d);
console.log("VAPID_SUBJECT=mailto:sinsubz.support@gmail.com");
