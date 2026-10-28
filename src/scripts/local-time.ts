// Puts every built-in US Eastern time (components/LocalTime.astro) in the reader's own time zone.
import { localTime, type Moment } from "../lib/format.ts";

for (const el of document.querySelectorAll<HTMLTimeElement>("time[data-local]")) {
  el.textContent = localTime(new Date(el.dateTime), el.dataset.local as Moment);
}
