"use client";

import { useEffect, useRef, useState } from "react";
import { PartyPopper, Sparkles, Trophy } from "lucide-react";
import { PLACE_LAND, type Bus } from "../lib/gameEvents";

const CHEERS = ["Mantap!", "Keren!", "Pas banget!", "Klik! Terpasang!", "Hebat!", "Yeay!"];
type Toast = { id: number; kind: "part" | "complete" | "win"; title: string; text: string };

/** Spanduk sorakan di atas meja: muncul saat komponen terpasang, robot selesai, dan misi berhasil. */
export default function Cheer({ bus, nameOf }: { bus: Bus; nameOf: (index: number) => string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const names = useRef(nameOf);
  names.current = nameOf;
  const counter = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const show = (next: Omit<Toast, "id">, after: number, hold: number) => {
      timers.current.push(setTimeout(() => {
        const id = ++counter.current;
        setToast({ ...next, id });
        timers.current.push(setTimeout(() => setToast(current => current?.id === id ? null : current), hold));
      }, after * 1000));
    };
    const off = bus.on(event => {
      if (event.type === "placed" && !event.complete && !event.bulk) {
        show({ kind: "part", title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
          text: names.current(event.index) + " terpasang" }, PLACE_LAND, 1700);
      } else if (event.type === "complete") {
        show({ kind: "complete", title: "Robot selesai dirakit!", text: "Sekarang gerakkan lengannya dan pindahkan kubus." },
          event.bulk ? .2 : PLACE_LAND + .1, 3600);
      } else if (event.type === "win") {
        show({ kind: "win", title: "Misi berhasil!", text: "Kubus kuning sudah masuk ke baki biru." }, .1, 4200);
      }
    });
    const pending = timers.current;
    return () => { off(); pending.forEach(clearTimeout); pending.length = 0; };
  }, [bus]);

  if (!toast) return null;
  const Icon = toast.kind === "win" ? Trophy : toast.kind === "complete" ? PartyPopper : Sparkles;
  return <div className="cheer" data-kind={toast.kind} key={toast.id} aria-hidden="true">
    <span className="cheer-icon"><Icon size={toast.kind === "part" ? 18 : 24}/></span>
    <span className="cheer-text"><strong>{toast.title}</strong><small>{toast.text}</small></span>
  </div>;
}
