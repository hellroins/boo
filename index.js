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
let activePositions = {}; // Menyimpan posisi aktif untuk adaptive exit

async function checkAdaptiveExit() {
  try {
    const lastPrice = await okxRepository.getLatestPrice(); // Harga real-time

    // ✅ Ambil data candle 10 terakhir untuk ATR (lebih akurat)
    const df = await okxRepository.getCandles("5m", "10");
    const prices = df.map((candle) => candle.close);
    const highs = df.map((candle) => candle.high);
    const lows = df.map((candle) => candle.low);

    const atrValue = tradingAnalysisRepository.calculateATR(
      prices,
      highs,
      lows,
      10
    ); // ✅ ATR dari candle historis

    for (const [clOrdId, position] of Object.entries(activePositions)) {
      const { entryPrice, posSide, openTime, stopLoss, takeProfit, maxProfit } =
        position;
      const currentTime = Math.floor(Date.now() / 1000);
      const timeElapsed = currentTime - openTime;

      const profit =
        posSide === "long" ? lastPrice - entryPrice : entryPrice - lastPrice;

      // Update Max Profit
      if (profit > maxProfit) {
        activePositions[clOrdId].maxProfit = profit;
      }

      // **Jika harga masih naik, TP tetap**
      if (profit > maxProfit * 0.8) {
        console.log(`🚀 Harga masih naik, TP tetap di ${takeProfit}`);
      }

      // **Jika harga stagnan, TP diturunkan berdasarkan ATR**
      else if (timeElapsed > 5 * 60) {
        activePositions[clOrdId].takeProfit -= atrValue * 0.5; // Kurangi TP jika harga sulit naik
        console.log(
          `⚠️ Harga susah naik, TP diturunkan menjadi ${activePositions[clOrdId].takeProfit}`
        );
      }

      // **Trailing Stop: Naikkan SL jika harga sudah cukup profit**
      if (profit > atrValue * 1.5) {
        activePositions[clOrdId].stopLoss += atrValue * 0.5; // Geser SL naik untuk kunci profit
        console.log(
          `🔄 Trailing Stop aktif, SL naik menjadi ${activePositions[clOrdId].stopLoss}`
        );
      }

      // **Cek apakah harga menyentuh TP atau SL**
      if (
        (posSide === "long" &&
          lastPrice >= activePositions[clOrdId].takeProfit) ||
        (posSide === "short" &&
          lastPrice <= activePositions[clOrdId].takeProfit)
      ) {
        console.log(`✅ Take Profit Tercapai. Menutup posisi ${clOrdId}.`);
        const close = await okxRepository.closePosition(clOrdId, posSide);
        if (close) {
          delete activePositions[clOrdId];
        }
        continue;
      }

      if (
        (posSide === "long" &&
          lastPrice <= activePositions[clOrdId].stopLoss) ||
        (posSide === "short" && lastPrice >= activePositions[clOrdId].stopLoss)
      ) {
        console.log(`⛔ Stop Loss Tercapai. Menutup posisi ${clOrdId}.`);
        const close = await okxRepository.closePosition(clOrdId, posSide);
        if (close) {
          delete activePositions[clOrdId];
        }
        continue;
      }
    }
  } catch (error) {
    console.log(`Error in adaptive exit: ${error.message}`);
  }
}

async function runBot() {
  console.log("Bot is running...");
  while (true) {
    try {
      const df = await okxRepository.getCandles("5m", "200");
      const prices = df.map((candle) => candle.close);
      const lastPrice = await okxRepository.getLatestPrice(); // Harga real-time
      const highs = df.map((candle) => candle.high);
      const lows = df.map((candle) => candle.low);

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

      const { upperBand, lowerBand } =
        tradingAnalysisRepository.calculateBollingerBands(prices);

      const df_1h = await okxRepository.getCandles("15m", "200");
      const prices_1h = df_1h.map((candle) => candle.close);
      const ema50_1h = tradingAnalysisRepository.calculateEMA(prices_1h, 50);

      let reason = [];

      // if (rsi >= 35 && rsi <= 65) {
      //   reason.push("RSI tidak valid");
      // }
      // if (adx <= 40) {
      //   reason.push("ADX kurang");
      // }
      // if (histogram >= 0 && rsi < 30) {
      //   reason.push("MACD tidak valid untuk Buy");
      // }
      // if (histogram <= 0 && rsi > 70) {
      //   reason.push("MACD tidak valid untuk Sell");
      // }
      // if (lastPrice < ema50) {
      //   reason.push("Harga di bawah EMA50");
      // }
      // if (lastPrice < ema50_1h) {
      //   reason.push("Harga di bawah EMA50 15M");
      // }

      if (lastPrice > lowerBand) {
        reason.push("LP lebih besar dari LB");
      }

      if (lastPrice < upperBand) {
        reason.push("LP kurang dari UB");
      }

      if (lastPrice < lowerBand) {
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

        activePositions[clOrdId] = {
          entryPrice: lastPrice,
          posSide: "long",
          openTime: Math.floor(Date.now() / 1000),
          stopLoss: lastPrice - atr * 1.5,
          takeProfit: lastPrice + atr * 3,
          maxProfit: 0,
        };
      } else if (lastPrice > upperBand) {
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
        activePositions[clOrdId] = {
          entryPrice: lastPrice,
          posSide: "short",
          openTime: Math.floor(Date.now() / 1000),
          stopLoss: lastPrice + atr * 1.5,
          takeProfit: lastPrice - atr * 3,
          maxProfit: 0,
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

setInterval(checkAdaptiveExit, 30000); // Cek setiap 30 detik untuk menutup posisi jika stagnan
runBot();
