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

    const df = await okxRepository.getCandles("5m", "10");
    const prices = df.map((candle) => candle.close);
    const highs = df.map((candle) => candle.high);
    const lows = df.map((candle) => candle.low);
    const atrValue = tradingAnalysisRepository.calculateATR(
      prices,
      highs,
      lows,
      10
    );

    const slippage = atrValue * 0.1; // Gunakan 10% dari ATR sebagai toleransi harga

    for (const [clOrdId, position] of Object.entries(activePositions)) {
      const {
        entryPrice,
        posSide,
        stopLoss,
        takeProfit,
        maxProfit,
        lastUpdateTime,
        posId,
      } = position;
      const currentTime = Math.floor(Date.now() / 1000);

      const profit =
        posSide === "long" ? lastPrice - entryPrice : entryPrice - lastPrice;

      console.log(
        `📌 Checking Position: ${clOrdId}, Last Price: ${lastPrice}, TP: ${takeProfit}, SL: ${stopLoss}`
      );

      if (profit > maxProfit) {
        activePositions[clOrdId].maxProfit = profit;
      }

      if (posSide === "long" && lastPrice > entryPrice + maxProfit * 0.5) {
        let newStopLoss = lastPrice - atrValue * 1.0; // SL dinaikkan ke 1x ATR di bawah harga saat ini
        if (newStopLoss > stopLoss) {
          // Pastikan SL hanya naik
          activePositions[clOrdId].stopLoss = newStopLoss;
          console.log(`🔼 Trailing SL dinaikkan menjadi ${newStopLoss}`);
        }
      }

      if (posSide === "short" && lastPrice < entryPrice - maxProfit * 0.5) {
        let newStopLoss = lastPrice + atrValue * 1.0; // SL diturunkan ke 1x ATR di atas harga saat ini
        if (newStopLoss < stopLoss) {
          // Pastikan SL hanya turun
          activePositions[clOrdId].stopLoss = newStopLoss;
          console.log(`🔽 Trailing SL diturunkan menjadi ${newStopLoss}`);
        }
      }

      if (
        (posSide === "long" && lastPrice >= takeProfit - slippage) ||
        (posSide === "short" && lastPrice <= takeProfit + slippage)
      ) {
        console.log(`✅ Take Profit Tercapai. Menutup posisi ${clOrdId}.`);
        const close = await okxRepository.closePosition(clOrdId, posSide);
        if (close) {
          delete activePositions[clOrdId];
          console.log(`✅ Posisi ${clOrdId} berhasil ditutup.`);
        }
        continue;
      }

      if (
        (posSide === "long" && lastPrice <= stopLoss + slippage) ||
        (posSide === "short" && lastPrice >= stopLoss - slippage)
      ) {
        console.log(`⛔ Stop Loss Tercapai. Menutup posisi ${clOrdId}.`);
        const close = await okxRepository.closePosition(clOrdId, posSide);
        if (close) {
          delete activePositions[clOrdId];
          console.log(`✅ Posisi ${clOrdId} berhasil ditutup.`);
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
      const lastPrice = prices[prices.length - 1];
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

      if (lastPrice > lowerBand) {
        reason.push("LP lebih besar dari LB");
      }

      if (lastPrice < upperBand) {
        reason.push("LP kurang dari UB");
      }

      if (lastPrice > upperBand) {
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
          lastUpdateTime: Math.floor(Date.now() / 1000),
          stopLoss: lastPrice - atr * 1.5,
          takeProfit: lastPrice + atr * 3,
          maxProfit: 0,
        };
      } else if (lastPrice < lowerBand) {
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
          lastUpdateTime: Math.floor(Date.now() / 1000),
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
