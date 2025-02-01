const WebSocket = require("ws");
const OkxRepository = require("../repository/OkxRepository");

const okxRepository = new OkxRepository();
const symbol = "XRP-USDT-SWAP"; // Ganti dengan pair yang diinginkan
const pipSize = 0.0001; // 1 pip untuk XRP/USDT
const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");

let lastSignal = "";
let entryPrice = null;
let takeProfit = null;
let stopLoss = null;

let lastSignalTime = 0; // Timestamp sinyal terakhir
const SIGNAL_INTERVAL = 60 * 1000; // Minimal 10 detik antar sinyal

ws.on("open", () => {
  console.log("Connected to OKX WebSocket");
  ws.send(
    JSON.stringify({
      op: "subscribe",
      args: [{ channel: "books", instId: symbol }],
    })
  );
});

ws.on("message", (data) => {
  const response = JSON.parse(data.toString());
  if (response.arg && response.arg.channel === "books" && response.data) {
    analyzeOrderBook(response.data[0]);
  }
});

async function analyzeOrderBook(orderBook) {
  const bids = orderBook.bids.map((b) => ({
    price: parseFloat(b[0]),
    size: parseFloat(b[1]),
  }));
  const asks = orderBook.asks.map((a) => ({
    price: parseFloat(a[0]),
    size: parseFloat(a[1]),
  }));

  const totalBidSize = bids.reduce((sum, b) => sum + b.size, 0);
  const totalAskSize = asks.reduce((sum, a) => sum + a.size, 0);
  const delta = totalBidSize - totalAskSize;

  const currentTime = Date.now();

  // Filter agar sinyal tidak muncul terlalu sering
  if (currentTime - lastSignalTime < SIGNAL_INTERVAL) {
    return;
  }

  if (Math.abs(delta) < 100) return; // Skip sinyal kecil

  const strongBid = bids[0]; // Support terkuat
  const strongAsk = asks[0]; // Resistance terkuat

  if (delta > 150 && lastSignal !== "BUY") {
    if (strongAsk) {
      entryPrice = strongAsk.price;
      takeProfit = entryPrice - pipSize * 60; // 10 pips TP
      stopLoss = entryPrice + pipSize * 40; // 5 pips SL
      console.log(
        `\n🔵 BUY Signal - Entry: ${entryPrice}, TP: ${takeProfit}, SL: ${stopLoss}`
      );
      lastSignal = "BUY";
      lastSignalTime = currentTime;
      await okxRepository.placeOrderFast({
        side: "buy",
        stopLoss,
        takeProfit,
      });
    }
  } else if (delta < -150 && lastSignal !== "SELL") {
    if (strongBid) {
      entryPrice = strongBid.price;
      takeProfit = entryPrice + pipSize * 60;
      stopLoss = entryPrice - pipSize * 40;
      console.log(
        `\n🔴 SELL Signal - Entry: ${entryPrice}, TP: ${takeProfit}, SL: ${stopLoss}`
      );
      lastSignal = "SELL";
      lastSignalTime = currentTime;
      await okxRepository.placeOrderFast({
        side: "sell",
        stopLoss,
        takeProfit,
      });
    }
  }
}
