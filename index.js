const moment = require("moment");
const fs = require("fs");

const OkxRepository = require("./repository/OkxRepository");
const TradingAnalysisRepository = require("./repository/TradingAnalysisRepository");

function logToFile(message) {
  const logMessage = `${message}\n`;
  fs.appendFile("app.log", logMessage, (err) => {
    if (err) {
      console.log("Gagal menulis ke file log:", err);
    }
  });
}

console.log = (message) => {
  process.stdout.write(message + "\n");
  logToFile(message);
};

const okxRepository = new OkxRepository();
const tradingAnalysisRepository = new TradingAnalysisRepository();

let tradeHistory = [];

let openPositions = {};

// const MAX_POSITION_TIME = 7200;

// async function autoClosePositions() {
//   const currentTime = Math.floor(Date.now() / 1000);
//   for (const [clOrdId, { entryTime, posSide }] of Object.entries(
//     openPositions
//   )) {
//     if (currentTime - entryTime > MAX_POSITION_TIME) {
//       console.log(`Closing order ${clOrdId} due to timeout.`);
//       const close = await okxRepository.closePosition(clOrdId, posSide);
//       if (close) {
//         delete openPositions[clOrdId];
//       }
//     }
//   }
// }

async function runBot() {
  console.log("Bot is running...");
  while (true) {
    try {
      //await autoClosePositions();
      const df = await okxRepository.getCandles("5m", "200");
      const prices = df.map((candle) => candle.close);
      const lastPrice = prices[prices.length - 1];
      const highs = df.map((candle) => candle.high);
      const lows = df.map((candle) => candle.low);

      //const { upperBand, lowerBand } =
      //  tradingAnalysisRepository.calculateBollingerBands(prices);
      const rsi = tradingAnalysisRepository.calculateRSI(prices);
      const ema50 = tradingAnalysisRepository.calculateEMA(prices, 50);
      const { histogram } = tradingAnalysisRepository.calculateMACD(prices);
      const adx = tradingAnalysisRepository.calculateADX(prices, highs, lows);
      const atr = tradingAnalysisRepository.calculateATR(
        prices,
        highs,
        lows,
        10
      );

      const df_1h = await okxRepository.getCandles("15m", "200");
      const prices_1h = df_1h.map((candle) => candle.close);
      const ema50_1h = tradingAnalysisRepository.calculateEMA(prices_1h, 50);

      let reason = [];

      if (rsi >= 35 && rsi <= 65) {
        reason.push("RSI tidak valid");
      }
      if (adx <= 30) {
        reason.push("ADX kurang");
      }
      if (histogram >= 0 && rsi < 30) {
        reason.push("MACD tidak valid untuk Buy");
      }
      if (histogram <= 0 && rsi > 70) {
        reason.push("MACD tidak valid untuk Sell");
      }
      if (lastPrice < ema50) {
        reason.push("Harga di bawah EMA50");
      }
      if (lastPrice < ema50_1h) {
        reason.push("Harga di bawah EMA50 15M");
      }

      if (
        rsi < 35 &&
        histogram < 0 &&
        adx > 30 &&
        (lastPrice > ema50 || lastPrice > ema50_1h)
      ) {
        console.log("Potential Buy Signal Detected");
        const { clOrdId } = await okxRepository.placeOrder({
          side: "buy",
          entryPrice: lastPrice,
          canTrade: tradingAnalysisRepository.overTradeCheck(
            tradeHistory,
            openPositions
          ),
          tradeHistory,
          atr,
        });
        openPositions[clOrdId] = {
          entryTime: Math.floor(Date.now() / 1000),
          posSide: "long",
        };
      } else if (
        rsi > 65 &&
        histogram > 0 &&
        adx > 30 &&
        (lastPrice < ema50 || lastPrice < ema50_1h)
      ) {
        console.log("Potential Sell Signal Detected");
        const { clOrdId } = await okxRepository.placeOrder({
          side: "sell",
          entryPrice: lastPrice,
          canTrade: tradingAnalysisRepository.overTradeCheck(
            tradeHistory,
            openPositions
          ),
          tradeHistory,
          atr,
        });
        openPositions[clOrdId] = {
          entryTime: Math.floor(Date.now() / 1000),
          posSide: "short",
        };
      } else {
        console.log(
          `${moment().format(
            "MMMM Do YYYY, h:mm:ss a"
          )} Tidak Terpenuhi! Alasan: ${reason.join(", ")}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5 * 60000));
    } catch (error) {
      console.log(`Error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

runBot();
