import { BadRequestException } from "@nestjs/common";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const HEX_PATTERN = /^0x([a-fA-F0-9]{2})*$/;

export function parseAddress(value: unknown, field: string): string {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be a valid address`);
  }
  return value;
}

export function parseBytes32(value: unknown, field: string): string {
  if (typeof value !== "string" || !BYTES32_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be a valid bytes32 hash`);
  }
  return value;
}

export function parseOptionalHex(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !HEX_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be hex data`);
  }
  return value;
}

export function parseOptionalAddress(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parseAddress(value, field);
}

export function parseChainId(value: unknown): number {
  return parsePositiveInteger(value, "chainId");
}

export function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return parsed;
}

export function parseOptionalString(value: unknown, field: string, maxLength = 256): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new BadRequestException(`${field} must be a string up to ${maxLength} characters`);
  }
  return value;
}

export function parseOptionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new BadRequestException(`${field} must be an ISO date string`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be an ISO date string`);
  return date;
}
