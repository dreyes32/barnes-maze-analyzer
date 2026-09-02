export type NumericAggregate = {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};

export function describeNumbers(values: Array<number | null | undefined>): NumericAggregate {
  const valid = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  if (valid.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null };
  }
  const sorted = [...valid].sort((left, right) => left - right);
  const sum = valid.reduce((total, value) => total + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return {
    count: valid.length,
    mean: sum / valid.length,
    median,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}
