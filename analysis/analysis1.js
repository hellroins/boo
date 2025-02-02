const fs = require("fs");
const OkxRepository = require("../repository/OkxRepository");
const TradingAnalysisRepository = require("../repository/TradingAnalysisRepository");

const okxRepository = new OkxRepository();
const tradingAnalysisRepository = new TradingAnalysisRepository();

const ORDER_FILE = "analysis1.json";

function loadOrders() {
  if (fs.existsSync(ORDER_FILE)) {
    return JSON.parse(fs.readFileSync(ORDER_FILE));
  }
  return [];
}

function saveOrders(orders) {
  fs.writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 2));
}

function placeOrder({ side, entryPrice, lb, ub, rsi, macd, ema50, adx, atr }) {
  const stopLoss =
    side === "buy" ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5;
  const takeProfit =
    side === "buy" ? entryPrice + atr * 3 : entryPrice - atr * 3;

  const order = {
    id: Date.now(),
    Price: entryPrice,
    LB: lb,
    UB: ub,
    RSI: rsi,
    MACD: macd,
    EMA50: ema50,
    ADX: adx,
    STOP_LOSS: stopLoss,
    TAKE_PROFIT: takeProfit,
    Side: side,
    status: "open",
    close: "",
  };

  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  return { takeProfit, stopLoss };
}

function updateOrders(lastPrice) {
  const orders = loadOrders();
  for (let order of orders) {
    if (order.status === "open") {
      if (order.Side === "buy" && lastPrice >= order.TAKE_PROFIT) {
        order.status = "win";
        order.close = Date.now();
      } else if (order.Side === "buy" && lastPrice <= order.STOP_LOSS) {
        order.status = "loss";
        order.close = Date.now();
      } else if (order.Side === "sell" && lastPrice <= order.TAKE_PROFIT) {
        order.status = "win";
        order.close = Date.now();
      } else if (order.Side === "sell" && lastPrice >= order.STOP_LOSS) {
        order.status = "loss";
        order.close = Date.now();
      }
    }
  }
  saveOrders(orders);
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

      const { upperBand, lowerBand } =
        tradingAnalysisRepository.calculateBollingerBands(prices);
      const rsi = tradingAnalysisRepository.calculateRSI(prices);
      const ema50 = tradingAnalysisRepository.calculateEMA(prices, 50);
      const { macd } = tradingAnalysisRepository.calculateMACD(prices);
      const adx = tradingAnalysisRepository.calculateADX(prices, highs, lows);
      const atr = tradingAnalysisRepository.calculateATR(prices, highs, lows);

      updateOrders(lastPrice);

      if (lastPrice < lowerBand) {
        placeOrder({
          side: "buy",
          entryPrice: lastPrice,
          lb: lowerBand,
          ub: upperBand,
          rsi,
          macd,
          ema50,
          adx,
          atr,
        });
      } else if (lastPrice > upperBand) {
        placeOrder({
          side: "sell",
          entryPrice: lastPrice,
          lb: lowerBand,
          ub: upperBand,
          rsi,
          macd,
          ema50,
          adx,
          atr,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 5 * 60000));
    } catch (error) {
      console.log(`Error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

runBot();
