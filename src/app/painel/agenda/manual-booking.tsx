"use client";

import { useActionState } from "react";
import { createManualAppointment, type ManualBookingState } from "../actions";

type Option = { id: string; name: string };

export function ManualBooking({ day, services, staff }: { day: string; services: Option[]; staff: Option[] }) {
  const [state, action, pending] = useActionState<ManualBookingState, FormData>(createManualAppointment, {});

  return (
    <form action={action} className="card grid content-start gap-3">
      <h2 className="font-semibold">Agendar manualmente</h2>
      <label className="label">
        Nome do cliente
        <input id="mb-name" name="name" required className="input" />
      </label>
      <label className="label">
        Telefone (WhatsApp)
        <input id="mb-phone" name="phone" required inputMode="tel" className="input" placeholder="(21) 99999-9999" />
      </label>
      <label className="label">
        Serviço
        <select id="mb-service" name="service_id" required className="input">
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {staff.length > 0 && (
        <label className="label">
          Profissional
          <select id="mb-staff" name="staff_id" className="input">
            <option value="">Qualquer um</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Dia
          <input id="mb-date" name="date" type="date" required defaultValue={day} className="input" />
        </label>
        <label className="label">
          Hora
          <input id="mb-time" name="time" type="time" required step={1800} className="input" />
        </label>
      </div>
      {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">Agendamento criado.</p>}
      <button className="btn" disabled={pending || services.length === 0}>
        {pending ? "Salvando…" : "Agendar"}
      </button>
    </form>
  );
}
