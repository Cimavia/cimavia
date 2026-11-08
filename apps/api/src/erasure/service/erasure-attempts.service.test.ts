import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  ERASURE_FAILURE_WINDOW_MS,
  ERASURE_MAX_FAILURES,
  ErasureAttemptsService,
} from "./erasure-attempts.service";

function exhausted(at = 0): ErasureAttemptsService {
  const attempts = new ErasureAttemptsService();
  for (let i = 0; i < ERASURE_MAX_FAILURES; i += 1) attempts.consume("u", at);
  return attempts;
}

const REFUSED = expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS });

describe("ErasureAttemptsService", () => {
  it("laisse passer jusqu'au plafond, puis répond 429", () => {
    const attempts = exhausted();
    expect(() => attempts.consume("u", 1)).toThrow(REFUSED);
  });

  it("ne compte que le compte concerné", () => {
    expect(() => exhausted().consume("autre", 1)).not.toThrow();
  });

  it("rouvre à la fin de la fenêtre, et les essais refusés ne la repoussent pas", () => {
    const attempts = exhausted();
    expect(() => attempts.consume("u", ERASURE_FAILURE_WINDOW_MS - 1)).toThrow(REFUSED);
    expect(() => attempts.consume("u", ERASURE_FAILURE_WINDOW_MS)).not.toThrow();
  });

  it("repart de zéro une fois effacé", () => {
    const attempts = exhausted();
    attempts.clear("u");
    expect(() => attempts.consume("u", 1)).not.toThrow();
  });
});
