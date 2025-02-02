const data = [];
const totalTrades = data.length;
const wins = data.filter((trade) => trade.status === "win").length;
const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

// Menampilkan data dalam tabel
console.table(data, [
  "id",
  "Price",
  "RSI",
  "MACD",
  "EMA50",
  "ADX",
  "STOP_LOSS",
  "TAKE_PROFIT",
  "Side",
  "status",
]);
console.log(`Win Rate: ${winRate.toFixed(2)}%`);
