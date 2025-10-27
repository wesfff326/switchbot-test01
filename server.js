const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const app = express();
app.use(express.json());

// .envファイル（Renderの環境変数）から秘密情報を読み込む
const SWITCHBOT_TOKEN = process.env.SWITCHBOT_TOKEN;
const SWITCHBOT_SECRET = process.env.SWITCHBOT_SECRET;
const WEBEX_WEBHOOK_URL = process.env.WEBEX_WEBHOOK_URL;
// ★★★ 修正点1: RenderのURLを環境変数から読み込む ★★★
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

// 温度のしきい値（この温度を超えたら通知）
const TEMPERATURE_THRESHOLD = 28;

// SwitchbotからのWebhook通知を受け取るエンドポイント
app.post("/webhook", (req, res) => {
  console.log("Webhook received from Switchbot!");
  
  const event = req.body;
  console.log(JSON.stringify(event, null, 2));

  if (event.eventType === "changeReport" && event.context.temperature > TEMPERATURE_THRESHOLD) {
    const deviceName = event.context.deviceName || "温湿度計";
    const temperature = event.context.temperature;

    const message = `**【温度警告】**\n\n- デバイス: ${deviceName}\n- 現在の温度: **${temperature}℃**\n- 設定値 (${TEMPERATURE_THRESHOLD}℃) を超過しました。`;
    
    axios.post(WEBEX_WEBHOOK_URL, { markdown: message })
      .then(() => {
        console.log("Successfully sent alert to Webex.");
      })
      .catch(error => {
        console.error("Error sending to Webex:", error.message);
      });
  }
  
  res.sendStatus(200);
});

// WebhookをSwitchbotに登録するためのエンドポイント
app.get("/setup", async (req, res) => {
  try {
    const t = Date.now();
    const nonce = "requestID";
    const data = SWITCHBOT_TOKEN + t + nonce;
    const sign = crypto.createHmac("sha256", SWITCHBOT_SECRET)
      .update(Buffer.from(data, "utf-8"))
      .digest("base64");

    // ★★★ 修正点2: RenderのURLを使ってWebhook URLを組み立てる ★★★
    const your_server_url = `${RENDER_EXTERNAL_URL}/webhook`;

    const response = await axios.post(
      "https://api.switch-bot.com/v1.1/webhook/setupWebhook",
      {
        action: "setupWebhook",
        url: your_server_url,
        deviceList: "ALL",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": SWITCHBOT_TOKEN,
          "sign": sign,
          "t": t,
          "nonce": nonce,
        },
      }
    );

    console.log("Webhook setup response:", response.data);
    res.send(`Webhook setup successful! Pointing to: ${your_server_url}`);
  } catch (error) {
    console.error("Error setting up webhook:", error.response ? error.response.data : error.message);
    res.status(500).send("Error setting up webhook. Check logs.");
  }
});

// サーバーを起動
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});

