import { Prisma } from "@/generated/prisma/client";

export type DecimalLike = Prisma.Decimal | number | string;

/**
 * Converts a number, string, or Prisma.Decimal into a Prisma.Decimal.
 * Always use Prisma.Decimal for authoritative financial and stock calculations.
 */
export function toDecimal(value: DecimalLike): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  return new Prisma.Decimal(value);
}

export function addDecimals(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

export function subDecimals(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function mulDecimals(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).times(toDecimal(b));
}

export function sumDecimals(values: DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (acc, val) => acc.plus(toDecimal(val)),
    new Prisma.Decimal(0)
  );
}

export function roundMoney(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function roundStock(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function decimalToNumber(value: DecimalLike): number {
  return Number(toDecimal(value).toString());
}
