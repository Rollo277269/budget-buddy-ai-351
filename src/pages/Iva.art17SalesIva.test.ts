// @vitest-environment node
import { describe, it, expect } from "vitest";
import { art17SalesIva } from "./Iva";

const make = (overrides: any = {}): any => ({
  imposta: 0,
  imponibile: 1000,
  righe: [],
  ...overrides,
});

describe("art17SalesIva", () => {
  it("torna 0 se imposta a livello fattura non è 0 (non è reverse charge)", () => {
    expect(art17SalesIva(make({ imposta: 220, righe: [{ imposta: 220 }] }))).toBe(0);
  });

  it("torna 0 se imponibile è 0", () => {
    expect(art17SalesIva(make({ imponibile: 0, righe: [{ imposta: 220 }] }))).toBe(0);
  });

  it("torna 0 se imponibile è negativo (es. nota di credito)", () => {
    expect(art17SalesIva(make({ imponibile: -500, righe: [{ imposta: 110 }] }))).toBe(0);
  });

  it("torna 0 se imponibile è mancante / undefined", () => {
    expect(art17SalesIva(make({ imponibile: undefined }))).toBe(0);
  });

  it("torna 0 se righe è assente / undefined", () => {
    expect(art17SalesIva(make({ righe: undefined }))).toBe(0);
  });

  it("torna 0 se righe è vuoto", () => {
    expect(art17SalesIva(make({ righe: [] }))).toBe(0);
  });

  it("torna 0 se righe non è un array", () => {
    expect(art17SalesIva(make({ righe: "not-an-array" as any }))).toBe(0);
  });

  it("tratta imposta mancante a livello fattura come 0 e somma le righe", () => {
    expect(
      art17SalesIva(make({ imposta: undefined, righe: [{ imposta: 110 }, { imposta: 50 }] }))
    ).toBe(160);
  });

  it("somma in valore assoluto: righe con imposta negativa contribuiscono al positivo", () => {
    expect(
      art17SalesIva(make({ righe: [{ imposta: -110 }, { imposta: 50 }] }))
    ).toBe(160);
  });

  it("ignora righe senza campo imposta o con imposta non numerica", () => {
    expect(
      art17SalesIva(
        make({ righe: [{ imposta: 100 }, {}, { imposta: null }, { imposta: "abc" }, { imposta: 50 }] })
      )
    ).toBe(150);
  });

  it("ignora elementi nulli/undefined dentro righe senza errori", () => {
    expect(
      art17SalesIva(make({ righe: [null, undefined, { imposta: 22 }] as any }))
    ).toBe(22);
  });

  it("caso tipico Art.17: imposta=0, imponibile>0, somma righe restituita", () => {
    expect(
      art17SalesIva(
        make({ imposta: 0, imponibile: 5000, righe: [{ imposta: 800 }, { imposta: 300 }] })
      )
    ).toBe(1100);
  });
});
