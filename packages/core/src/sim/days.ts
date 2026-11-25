import { normDate, weekday } from "../util.js";

/**
 * A day as a call is given it in text: the day with its day of the week, which is the calendar's to say and never a
 * model's to count ("2026-11-27 (Friday)"). Anything that is not a day (a month, "next spring", what it waits on) is
 * given as it is. Days are kept as YYYY-MM-DD wherever they are stored; only the text given to a call carries this.
 */
export const dated = (d: string | null | undefined): string => (d && normDate(d) === d ? `${d} (${weekday(d)})` : (d ?? ""));
