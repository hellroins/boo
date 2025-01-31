const moment = require("moment");
const OkxRepository = require("./repository/OkxRepository");
const TradingAnalysisRepository = require("./repository/TradingAnalysisRepository");
const MAX_POSITION_TIME = 7200;
const okxRepository = new OkxRepository();
const tradingAnalysisRepository = new TradingAnalysisRepository();

let tradeHistory = [];

let openPositions = {};

async function autoClosePositions() {
  const currentTime = Math.floor(Date.now() / 1000);
  for (const [clOrdId, { entryTime, posSide }] of Object.entries(
    openPositions
  )) {
    if (currentTime - entryTime > MAX_POSITION_TIME) {
      console.log(`Closing order ${clOrdId} due to timeout.`);
      await okxRepository.closePosition(clOrdId, posSide);
      delete openPositions[clOrdId];
    }
  }
}

async function runBot() {
  console.log("Bot is running...");
  while (true) {
    try {
      await autoClosePositions();
      const df = await okxRepository.getCandles();
      const prices = df.map((candle) => candle.close);
      const lastPrice = prices[prices.length - 1];
      const highs = df.map((candle) => candle.high);
      const lows = df.map((candle) => candle.low);

      const { upperBand, lowerBand } =
        tradingAnalysisRepository.calculateBollingerBands(prices);
      const rsi = tradingAnalysisRepository.calculateRSI(prices);
      const ema50 = tradingAnalysisRepository.calculateEMA(prices, 50);
      const { histogram } = tradingAnalysisRepository.calculateMACD(prices);
      const adx = tradingAnalysisRepository.calculateADX(prices, highs, lows);

      console.log(`
        Price: ${lastPrice}, 
        LB: ${lowerBand}, 
        UB: ${upperBand}, 
        RSI: ${rsi}, 
        MACD: ${histogram}, 
        EMA50: ${ema50}, 
        ADX: ${adx}
     `);

      if (
        lastPrice < lowerBand &&
        rsi < 35 &&
        histogram > -0.1 &&
        lastPrice >= ema50 * 0.98 &&
        adx > 20
      ) {
        const { clOrdId } = await okxRepository.placeOrder({
          side: "buy",
          entryPrice: lastPrice,
          canTrade: tradingAnalysisRepository.overTradeCheck(tradeHistory),
          tradeHistory,
        });
        openPositions[clOrdId] = { entryTime: Math.floor(Date.now() / 1000), posSide: "long" };
      } else if (
        lastPrice > upperBand &&
        rsi > 65 &&
        histogram < 0.1 &&
        lastPrice <= ema50 * 1.02 &&
        adx > 20
      ) {
        const { clOrdId } = await okxRepository.placeOrder({
          side: "sell",
          entryPrice: lastPrice,
          canTrade: tradingAnalysisRepository.overTradeCheck(tradeHistory),
          tradeHistory,
        });
        openPositions[clOrdId] = { entryTime: Math.floor(Date.now() / 1000), posSide: "short" };
      } else {
        console.log(
          moment().format("MMMM Do YYYY, h:mm:ss a") + " Tidak Terpenuhi!"
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 60000));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

runBot();
