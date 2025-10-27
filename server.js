const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const app = express();

// --- 設定項目 ---
// Renderの環境変数から秘密情報を読み込む
const SWITCHBOT_TOKEN = process.env.SWITCHBOT_TOKEN;
const SWITCHBOT_SECRET = process.env.SWITCHBOT_SECRET;
const WEBEX_WEBHOOK_URL = process.env.WEBEX_WEBHOOK_URL;
const DEVICE_ID = process.env.DEVICE_ID;

// 温度のしきい値（この温度を超えたら通知）
const TEMPERATURE_THRESHOLD = 10;
// チェック間隔（ミリ秒単位）。60000 = 1分
const POLLING_INTERVAL = 60000; 

// --- グローバル変数 ---
// 通知の乱発を防ぐための状態管理フラグ (true = 警告中, false = 平常時)
let isAlertState = false; 

// --- メインの関数 ---
async function checkDeviceStatus() {
  // 必要な情報が設定されていなければ処理を中断
  if (!SWITCHBOT_TOKEN || !SWITCHBOT_SECRET || !DEVICE_ID) {
    console.error("Error: Environment variables are not set correctly.");
    return;
  }
  console.log(`Checking device status for ID: ${DEVICE_ID}...`);
  try {
    // Switchbot APIにリクエストするためのヘッダーを生成
    const t = Date.now();
    const nonce = "requestID";
    const data = SWITCHBOT_TOKEN + t + nonce;
    const sign = crypto.createHmac("sha256", SWITCHBOT_SECRET)
      .update(Buffer.from(data, "utf-8"))
      .digest("base64");

    const headers = {
      "Content-Type": "application/json; charset=utf8",
      "Authorization": SWITCHBOT_TOKEN,
      "sign": sign,
      "t": t,
      "nonce": nonce,
    };

    // デバイスの状態を取得するAPIを呼び出す
    const response = await axios.get(
      `https://api.switch-bot.com/v1.1/devices/${DEVICE_ID}/status`,
      { headers: headers }
    );

    const deviceStatus = response.data.body;
    const currentTemperature = deviceStatus.temperature;
    const deviceName = "ハブ2"; // デバイス名を固定

    console.log(`Current temperature is: ${currentTemperature}°C`);

    // --- 通知ロジック ---
    // 1. 温度がしきい値を超え、かつ現在が平常時（警告中でない）場合
    if (currentTemperature > TEMPERATURE_THRESHOLD && !isAlertState) {
      console.log("Threshold exceeded! Sending alert to Webex.");
      const message = `**【温度警告】**\n\n- デバイス: ${deviceName}\n- 現在の温度: **${currentTemperature}℃**\n- 設定値 (${TEMPERATURE_THRESHOLD}℃) を超過しました。`;
      await axios.post(WEBEX_WEBHOOK_URL, { markdown: message });
      isAlertState = true; // 状態を「警告中」に更新
    } 
    // 2. 温度がしきい値を下回り、かつ現在が警告中の場合（復旧通知）
    else if (currentTemperature <= TEMPERATURE_THRESHOLD && isAlertState) {
      console.log("Temperature is back to normal. Sending recovery notice to Webex.");
      const message = `**【温度正常化】**\n\n- デバイス: ${deviceName}\n- 現在の温度: **${currentTemperature}℃**\n- 正常範囲内に復旧しました。`;
      await axios.post(WEBEX_WEBHOOK_URL, { markdown: message });
      isAlertState = false; // 状態を「平常時」に更新
    }

  } catch (error) {
    console.error("Error checking device status:", error.response ? error.response.data : error.message);
  }
}

// --- サーバー起動と定期実行 ---
// サーバーが正常に動いているか確認するためのページ
app.get("/", (req, res) => {
  res.send("Switchbot Polling Server is running.");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started. Initial check in 10 seconds...");
  // サーバー起動後10秒で初回実行し、その後は設定した間隔で定期実行
  setTimeout(checkDeviceStatus, 10000); 
  setInterval(checkDeviceStatus, POLLING_INTERVAL);
});
