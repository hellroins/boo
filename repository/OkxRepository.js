const axios = require("axios");
const crypto = require("crypto");
const moment = require("moment");
const {
  API_KEY,
  SECRET_KEY,
  PASSPHRASE,
  BASE_URL,
  SYMBOL,
  SIZE_ORDER_PLACE,
  STOP_LOSS_PERCENT,
  TAKE_PROFIT_PERCENT,
  TRAILING_STOP_PERCENT,
} = require("../config/config.js");

class OkxRepository {
  constructor() {
    this.apiKey = API_KEY;
    this.secretKey = SECRET_KEY;
    this.passphrase = PASSPHRASE;
    this.baseUrl = BASE_URL;
    this.symbol = SYMBOL;
    this.sizeOrderPlace = SIZE_ORDER_PLACE;
    this.stopLossPercent = STOP_LOSS_PERCENT;
    this.takeProfitPercent = TAKE_PROFIT_PERCENT;
    this.trailingStopPercent = TRAILING_STOP_PERCENT;
  }

  getHeaders(method, path, body = "") {
    const timestamp = moment.utc().format("YYYY-MM-DDTHH:mm:ss.SSS[Z]");
    const message = timestamp + method + path + body;
    const signature = crypto
      .createHmac("sha256", this.secretKey)
      .update(message)
      .digest("base64");

    return {
      "OK-ACCESS-KEY": this.apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.passphrase,
      "Content-Type": "application/json",
      // "x-simulated-trading": 1,
    };
  }

  async getCandles(timeFrame = "1m", limit = "100") {
    const path = `/api/v5/market/candles?instId=${this.symbol}&bar=${timeFrame}&limit=${limit}`;
    const url = this.baseUrl + path;

    try {
      const response = await axios.get(url, {
        headers: this.getHeaders("GET", path),
      });

      const candles = response.data.data;
      const df = candles.map((candle) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));

      return df.reverse();
    } catch (error) {
      console.log(`Error fetching candles: ${error.message}`);
      throw error;
    }
  }

  async placeOrder({ side, entryPrice, canTrade, tradeHistory, atr }) {
    if (!canTrade) {
      return;
    }
    const clOrdId = crypto.randomBytes(5).toString("hex");
    const stopLoss =
      side === "buy" ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5;
    const takeProfit =
      side === "buy" ? entryPrice + atr * 3 : entryPrice - atr * 3;
    const trailingStop =
      side === "buy" ? entryPrice + atr * 1 : entryPrice - atr * 1;

    const path = "/api/v5/trade/order";
    const url = this.baseUrl + path;
    const orderData = {
      instId: this.symbol,
      tdMode: "cross",
      side,
      clOrdId,
      posSide: side === "buy" ? "long" : "short",
      ordType: "market",
      sz: this.sizeOrderPlace.toString(),
      slTriggerPx: stopLoss.toString(),
      slOrdPx: stopLoss.toString(),
      tpTriggerPx: takeProfit.toString(),
      tpOrdPx: takeProfit.toString(),
      trailTriggerPx: trailingStop.toString(),
    };

    try {
      await axios.post(url, orderData, {
        headers: this.getHeaders("POST", path, JSON.stringify(orderData)),
      });
      tradeHistory.push(Math.floor(Date.now() / 1000));
      console.log(
        `Order placed: ${side} ${this.sizeOrderPlace} ${SYMBOL} with SL: ${stopLoss}, TP: ${takeProfit}, TS: ${trailingStop}`
      );
      return { clOrdId: response.data.data[0].clOrdId };
    } catch (error) {
      console.log(`Error placing order: ${error.message}`);
    }
  }

  async placeOrderFast({ side, stopLoss, takeProfit }) {
    const path = "/api/v5/trade/order";
    const url = this.baseUrl + path;
    const size = 0.05;
    const orderData = {
      instId: this.symbol,
      tdMode: "cross",
      side,
      posSide: side === "buy" ? "long" : "short",
      ordType: "market",
      sz: size.toString(),
      slTriggerPx: stopLoss.toString(),
      slOrdPx: stopLoss.toString(),
      tpTriggerPx: takeProfit.toString(),
      tpOrdPx: takeProfit.toString(),
    };

    try {
      const response = await axios.post(url, orderData, {
        headers: this.getHeaders("POST", path, JSON.stringify(orderData)),
      });
      console.log(
        `Order placed: ${side} ${0.05} ${SYMBOL} with SL: ${stopLoss}, TP: ${takeProfit}`
      );
      console.log(response.data);
    } catch (error) {
      console.log(`Error placing order: ${error.message}`);
    }
  }

  async closePosition(clOrdId, posSide) {
    const path = "/api/v5/trade/close-position";
    const url = BASE_URL + path;
    const body = {
      instId: this.symbol,
      clOrdId,
      posSide,
      mgnMode: "cross",
    };

    try {
      await axios.post(url, body, {
        headers: this.getHeaders("POST", path, JSON.stringify(body)),
      });
      console.log(`Position ${clOrdId} closed successfully.`);
      return true;
    } catch (error) {
      console.log(`Error closing position ${clOrdId}: ${error.message}`);
      return false;
    }
  }
}

module.exports = OkxRepository;
