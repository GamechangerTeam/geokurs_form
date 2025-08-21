import express from "express";
import cors from "cors";
import CONFIG from "./config/config.js";
import api from "./routes/api.js";
import { logMessage } from "./utils/logger.js";
import {
  generateCryptoKeyAndIV,
  encryptText,
  decryptText,
} from "./utils/crypto.js";
import path from "path";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const BASE_URL = "/form_geokurs";

app.use(BASE_URL, api);

app.post(BASE_URL + "/init/", async (req, res) => {
  try {
    const bxLink = req.body.bx_link;
    if (!bxLink) {
      res.status(400).json({
        status: false,
        status_msg: "error",
        message: "Необходимо предоставить ссылку входящего вебхука!",
      });
      return;
    }

    const keyIv = generateCryptoKeyAndIV();
    const bxLinkEncrypted = await encryptText(
      bxLink,
      keyIv.CRYPTO_KEY,
      keyIv.CRYPTO_IV
    );

    const bxLinkEncryptedBase64 = Buffer.from(bxLinkEncrypted, "hex").toString(
      "base64"
    );

    const envPath = path.resolve(process.cwd(), ".env");
    const envContent = `CRYPTO_KEY=${keyIv.CRYPTO_KEY}\nCRYPTO_IV=${keyIv.CRYPTO_IV}\nBX_LINK=${bxLinkEncryptedBase64}\n`;

    fs.writeFileSync(envPath, envContent, "utf8");

    res.status(200).json({
      status: true,
      status_msg: "success",
      message: "Система готова работать с вашим битриксом!",
    });
  } catch (error) {
    console.error("error", BASE_URL + "/init", error);
    res.status(500).json({
      status: false,
      status_msg: "error",
      message: "Server error",
    });
  }
});

// not found
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

app.listen(CONFIG.PORT, () => {
  console.log(`B24 mini backend running on http://localhost:${CONFIG.PORT}`);
});

export default app;
