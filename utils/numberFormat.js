module.exports = function numberFormat(num) {
  if (num >= 1.0e15) {
    return (num / 1.0e15).toFixed(3) + "Q";
  } else if (num >= 1.0e12) {
    return (num / 1.0e12).toFixed(3) + "T";
  } else if (num >= 1.0e9) {
    return (num / 1.0e9).toFixed(3) + "B";
  } else if (num >= 1.0e6) {
    return (num / 1.0e6).toFixed(3) + "M";
  } else if (num >= 1.0e3) {
    return (num / 1.0e3).toFixed(3) + "K";
  } else {
    return num.toFixed(3);
  }
};
