const axios = require("axios");
const crypto = require("crypto");
const moment = require("moment");

const API_KEY = "API_KEY";
const SECRET_KEY = "SECRET";
const PASSPHRASE = "PASSPHRASE";
const BASE_URL = "https://www.okx.com";
const SYMBOL = "XRP-USDT-SWAP";
const LEVERAGE = 50;
const STOP_LOSS_PERCENT = 0.01; // 1% stop loss
const TAKE_PROFIT_PERCENT = 0.02; // 2% take profit
const TRAILING_STOP_PERCENT = 0.005; // 0.5% trailing stop
const MAX_TRADES_PER_HOUR = 3; // Maximum number of trades per hour
const COOL_DOWN_PERIOD = 300; // Cool-down time (5 minutes in seconds)

let tradeHistory = []; // Store timestamps of previous orders

// Generate OKX headers for authentication (Matching Python's HMAC signature generation)
function getHeaders(method, path, body = "") {
  const timestamp = moment.utc().format("YYYY-MM-DDTHH:mm:ss.SSS[Z]");
  const message = timestamp + method + path + body;
  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(message)
    .digest("base64");

  return {
    "OK-ACCESS-KEY": API_KEY,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": PASSPHRASE,
    "Content-Type": "application/json",
  };
}

// Get market data (candles)
async function getCandles() {
  const path = `/api/v5/market/candles?instId=${SYMBOL}&bar=1m&limit=100`;
  const url = BASE_URL + path;
  try {
    const response = await axios.get(url, { headers: getHeaders("GET", path) });
    const candles = response.data.data;
    const df = candles.map((candle) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
    return df.reverse(); // Reverse to chronological order
  } catch (error) {
    console.error(`Error fetching candles: ${error.message}`);
    throw error;
  }
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices, period = 20) {
  const sma =
    prices.slice(-period).reduce((acc, price) => acc + price, 0) / period;
  const stdDev = Math.sqrt(
    prices
      .slice(-period)
      .reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period
  );
  const upperBand = sma + stdDev * 2;
  const lowerBand = sma - stdDev * 2;
  return { upperBand, lowerBand };
}

// Check if bot is overtrading (Matching Python logic)
function canTrade() {
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  tradeHistory = tradeHistory.filter((t) => currentTime - t < 3600); // Keep trades from the last hour

  if (tradeHistory.length >= MAX_TRADES_PER_HOUR) {
    console.log("Trade limit reached, skipping trade.");
    return false;
  }

  if (
    tradeHistory.length > 0 &&
    currentTime - tradeHistory[tradeHistory.length - 1] < COOL_DOWN_PERIOD
  ) {
    console.log("Cool-down active, waiting before next trade.");
    return false;
  }

  return true;
}

// Place an order with Stop-Loss, Take-Profit, and Trailing Stop (Similar to Python version)
async function placeOrder(side, size, entryPrice) {
  if (!canTrade()) {
    return;
  }

  const stopLoss =
    side === "buy"
      ? entryPrice * (1 - STOP_LOSS_PERCENT)
      : entryPrice * (1 + STOP_LOSS_PERCENT);
  const takeProfit =
    side === "buy"
      ? entryPrice * (1 + TAKE_PROFIT_PERCENT)
      : entryPrice * (1 - TAKE_PROFIT_PERCENT);
  const trailingStop =
    side === "buy"
      ? entryPrice * (1 + TRAILING_STOP_PERCENT)
      : entryPrice * (1 - TRAILING_STOP_PERCENT);

  const path = "/api/v5/trade/order";
  const url = BASE_URL + path;
  const orderData = {
    instId: SYMBOL,
    tdMode: "cross",
    side,
    posSide: side === "buy" ? "long" : "short",
    ordType: "market",
    sz: size.toString(),
    slTriggerPx: stopLoss.toString(),
    slOrdPx: stopLoss.toString(),
    tpTriggerPx: takeProfit.toString(),
    tpOrdPx: takeProfit.toString(),
    trailTriggerPx: trailingStop.toString(),
  };

  try {
    await axios.post(url, orderData, {
      headers: getHeaders("POST", path, JSON.stringify(orderData)),
    });
    tradeHistory.push(Math.floor(Date.now() / 1000));
    console.log(
      `Order placed: ${side} ${size} ${SYMBOL} with SL: ${stopLoss}, TP: ${takeProfit}, TS: ${trailingStop}`
    );
  } catch (error) {
    console.error(`Error placing order: ${error.message}`);
  }
}

// Main bot logic (Same as Python's run loop)
async function runBot() {
  console.log("Bot is running...");
  while (true) {
    try {
      const df = await getCandles();
      const prices = df.map((candle) => candle.close);
      const lastPrice = prices[prices.length - 1];

      const { upperBand, lowerBand } = calculateBollingerBands(prices);

      console.log(
        "last price : " +
          lastPrice +
          ", lower band : " +
          lowerBand +
          ", upper band : " +
          upperBand
      );

      if (lastPrice < lowerBand) {
        await placeOrder("buy", 0.1, lastPrice);
      } else if (lastPrice > upperBand) {
        await placeOrder("sell", 0.1, lastPrice);
      } else {
        console.log(
          moment().format("MMMM Do YYYY, h:mm:ss a") + " Tidak Terpenuhi!"
        );
      }

      // Wait 60 seconds before the next iteration
      await new Promise((resolve) => setTimeout(resolve, 60000));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
    }
  }
}

runBot();
