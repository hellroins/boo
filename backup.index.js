// Breakout logic - Buy signal
if (
  lastPrice < lowerBand &&
  rsi < 35 &&
  histogram > -0.1 &&
  lastPrice >= ema50 * 0.98 &&
  adx > 20
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
  });
  openPositions[clOrdId] = {
    entryTime: Math.floor(Date.now() / 1000),
    posSide: "long",
  };
}

// Breakout logic - Sell signal
else if (
  lastPrice > upperBand &&
  rsi > 65 &&
  histogram < 0.1 &&
  lastPrice <= ema50 * 1.02 &&
  adx > 20
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
  });
  openPositions[clOrdId] = {
    entryTime: Math.floor(Date.now() / 1000),
    posSide: "short",
  };
}
// BPE logic for breakout
else if (lastPrice > upperBand) {
  console.log("Breakout Detected - Going Long");
  const { clOrdId } = await okxRepository.placeOrder({
    side: "buy",
    entryPrice: lastPrice,
    canTrade: tradingAnalysisRepository.overTradeCheck(
      tradeHistory,
      openPositions
    ),
    tradeHistory,
  });
  openPositions[clOrdId] = {
    entryTime: Math.floor(Date.now() / 1000),
    posSide: "long",
  };
} else if (lastPrice < lowerBand) {
  console.log("Breakout Detected - Going Short");
  const { clOrdId } = await okxRepository.placeOrder({
    side: "sell",
    entryPrice: lastPrice,
    canTrade: tradingAnalysisRepository.overTradeCheck(
      tradeHistory,
      openPositions
    ),
    tradeHistory,
  });
  openPositions[clOrdId] = {
    entryTime: Math.floor(Date.now() / 1000),
    posSide: "short",
  };
} else {
  console.log(moment().format("MMMM Do YYYY, h:mm:ss a") + " Tidak Terpenuhi!");
}
