// Datas no fuso do negócio. O banco guarda tudo em UTC; o negócio pensa em hora local.

function offsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "2026-10-08" + "15:30" no fuso do negócio -> instante UTC. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const first = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
  // Recalcula com o offset do instante encontrado (cobre trocas de horário de verão).
  return new Date(guess.getTime() - offsetMinutes(first, timeZone) * 60_000);
}

/** Data local "YYYY-MM-DD" de um instante. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Hora local "HH:MM" de um instante. */
export function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

/** Dia da semana (0 = domingo) de uma data "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export const WEEKDAYS =["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Ex.: "quinta-feira, 08/10/2026 às 15:30" */
export function formatLong(at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(at);
  return `${day} às ${localTime(at, timeZone)}`;
}

export function formatPrice(cents: number | null, note = ""): string {
  if (cents === null) return note || "sob consulta";
  if (cents === 0) return "gratuito";
  const value = (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return note ? `${note} ${value}` : value;
}

/** "08:00:00" -> minutos desde 00:00 */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
