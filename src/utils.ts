/** 如f-12345678 */
export function getLast8Digits() {
  let timestamp = new Date().getTime();
  // 获取时间戳的字符串形式
  const timestampString = timestamp.toString();
  // 获取时间戳字符串的最后6位，如果不足6位则返回整个字符串
  const last8Digits = timestampString.slice(-8);
  return "f-" + last8Digits;
}