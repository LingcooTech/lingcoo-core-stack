function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function createOrderNo(date = new Date()): string {
  const timestamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');

  return `FD${timestamp}${random}`;
}
