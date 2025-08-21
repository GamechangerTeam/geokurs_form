import { decryptText } from "../utils/crypto.js"; // ваш файл
import CONFIG from "../config/config.js";

export async function getWebhookUrl() {
  if (CONFIG.B24_WEBHOOK) {
    const key = process.env.CRYPTO_KEY;
    const iv = process.env.CRYPTO_IV;
    if (!key || !iv) {
      throw new Error(
        "CRYPTO_KEY/CRYPTO_IV are required to decrypt B24_WEBHOOK"
      );
    }

    const decrypted = await decryptText(CONFIG.B24_WEBHOOK, key, iv);
    return decrypted;
  }

  throw new Error("Either B24_WEBHOOK or B24_WEBHOOK must be set");
}
