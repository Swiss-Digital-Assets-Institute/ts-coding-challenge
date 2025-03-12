import { AccountId, PrivateKey } from "@hashgraph/sdk"
import type { Account } from "./types";

/**
 * Pre-configured Hedera accounts.
 * Note: In production, secure sensitive data properly.
 */
export const accounts: Account[] = [
  { id: AccountId.fromString("0.0.5678185"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420572b2df999e859f213853392a49b0a6b0cc488c7be5fd376422d3ed9af9e6d3c") },
  { id: AccountId.fromString("0.0.5678754"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b65700422042069b21f14b5d1e34db901ea3ef3e6822cddffbd20b4cd69ee3d03a10ac408dadf") },
  { id: AccountId.fromString("0.0.5678756"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420a917b0f3d81fe67462d616111383da69db3f75cf06c44610010754a9a89aaab8") },
  { id: AccountId.fromString("0.0.5678757"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b6570042204203d3d61424b2e8315551c59beab37c1a9bfe816aa1b37537bc2971c9f03ef7b05") },
  { id: AccountId.fromString("0.0.5678758"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420143c0302a673211027cbfab1a177b9a9fae1669cf516fdceac4f4bff30923d4f") },
  { id: AccountId.fromString("0.0.5678687"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b6570042204202e536852acd3d955fdd99ac90fa11c8505fa5205d316ae93c7cd5ce00bcc6a66") },
  { id: AccountId.fromString("0.0.5678688"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b65700422042074e635afe1a9b69ff401664298a674ae3194a1395eeef3d24dc29919dc044666") },
  { id: AccountId.fromString("0.0.5678689"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420d57d046dead1c3cac9fca024eb0cddd8ccdfde6ed9e041d3c8451aeb2aa2650a") },
  { id: AccountId.fromString("0.0.5678690"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420dd38907135f322ef7175f695c0ffe41eaad6ed72836a3c2128f936024b0aac74") },
  { id: AccountId.fromString("0.0.5678692"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420ce2502a7752f80c28503b1363e05e52d32c7c3258e6e5da54a787c4cf3b59fad") },
  // with 0 HBAR
  { id: AccountId.fromString("0.0.5702964"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b657004220420c0e0d295e8d18165c0d3d935968286db3c5e3a4d20e31b59fd7e6553a0267a2b") },
  { id: AccountId.fromString("0.0.5702965"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b65700422042018918a77f31c10db1ed36903b96114e6651b3cf41632adc21fb0a294f2f30609") },
  { id: AccountId.fromString("0.0.5702967"), privateKey: PrivateKey.fromStringED25519("302e020100300506032b6570042204201e1db68355fd148e207999b09fd9dc33a733d31cef57f9c6417e9822449d2120") }
]