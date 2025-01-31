const {
  MAX_TRADES_PER_HOUR,
  COOL_DOWN_PERIOD,
  MAX_OPEN_POSITION,
} = require("../config/config");

class TradingAnalysisRepository {
  constructor() {
    this.maxTradesPerHour = MAX_TRADES_PER_HOUR;
    this.coolDownPeriod = COOL_DOWN_PERIOD;
    this.maxOpenPosition = MAX_OPEN_POSITION;
  }

  overTradeCheck(tradeHistory, openPositions) {
    const currentTime = Math.floor(Date.now() / 1000);
    const activePosition = Object.entries(openPositions).length;
    tradeHistory = tradeHistory.filter((t) => currentTime - t < 3600);

    if (tradeHistory.length >= this.maxTradesPerHour) {
      console.log("Trade limit reached, skipping trade.");
      return false;
    }

    if (
      tradeHistory.length > 0 &&
      currentTime - tradeHistory[tradeHistory.length - 1] < this.coolDownPeriod
    ) {
      console.log("Cool-down active, waiting before next trade.");
      return false;
    }

    if (activePosition > this.maxOpenPosition) {
      console.log("Max (" + activePosition + "), Trade Reach");
      return false;
    }

    return true;
  }

  calculateBollingerBands(prices, period = 20) {
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

  calculateRSI(prices, period = 14) {
    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  calculateEMA(prices, period = 50) {
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateMACD(prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
    const shortEMA = this.calculateEMA(prices, shortPeriod);
    const longEMA = this.calculateEMA(prices, longPeriod);
    const macd = shortEMA - longEMA;
    const signal = this.calculateEMA(prices.slice(-signalPeriod), signalPeriod);
    return { macd, signal, histogram: macd - signal };
  }

  calculateADX(prices, highs, lows, period = 14) {
    let tr = 0,
      dmPlus = 0,
      dmMinus = 0;
    for (let i = 1; i < period; i++) {
      tr += Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - prices[i - 1]),
        Math.abs(lows[i] - prices[i - 1])
      );
      dmPlus +=
        highs[i] - highs[i - 1] > lows[i - 1] - lows[i]
          ? highs[i] - highs[i - 1]
          : 0;
      dmMinus +=
        lows[i - 1] - lows[i] > highs[i] - highs[i - 1]
          ? lows[i - 1] - lows[i]
          : 0;
    }
    const diPlus = (dmPlus / tr) * 100;
    const diMinus = (dmMinus / tr) * 100;
    const dx = (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100;
    return dx;
  }
}

module.exports = TradingAnalysisRepository;
