// Ponto de partida por segmento: o negócio já começa com algo para testar e depois edita.

export const SEGMENTS: { value: string; label: string }[] = [
  { value: "estetica", label: "Clínica de estética" },
  { value: "odontologia", label: "Consultório odontológico" },
  { value: "pet", label: "Pet shop" },
  { value: "barbearia", label: "Barbearia" },
  { value: "salao", label: "Salão de beleza" },
  { value: "saude", label: "Clínica ou consultório de saúde" },
  { value: "fitness", label: "Estúdio de pilates, yoga ou academia" },
  { value: "outro", label: "Outro" },
];

type ServiceSeed = { name: string; durationMin: number; priceCents: number | null; priceNote?: string; description?: string };

export const SERVICE_TEMPLATES: Record<string, ServiceSeed[]> = {
  estetica: [
    { name: "Avaliação", durationMin: 30, priceCents: 0, description: "Avaliação gratuita para indicar o melhor procedimento." },
    { name: "Toxina botulínica (botox)", durationMin: 45, priceCents: 89000, priceNote: "a partir de", description: "Valor por região. O valor final é definido na avaliação." },
    { name: "Limpeza de pele", durationMin: 60, priceCents: 18000 },
  ],
  odontologia: [
    { name: "Avaliação", durationMin: 30, priceCents: 0 },
    { name: "Limpeza", durationMin: 45, priceCents: 20000 },
    { name: "Clareamento", durationMin: 60, priceCents: null, priceNote: "valor na avaliação" },
  ],
  pet: [
    { name: "Banho (porte pequeno)", durationMin: 60, priceCents: 6000 },
    { name: "Banho e tosa (porte pequeno)", durationMin: 90, priceCents: 8500 },
    { name: "Banho (porte médio)", durationMin: 60, priceCents: 8000 },
  ],
  barbearia: [
    { name: "Corte", durationMin: 30, priceCents: 4500 },
    { name: "Barba", durationMin: 30, priceCents: 3500 },
    { name: "Corte + barba", durationMin: 60, priceCents: 7000 },
  ],
  salao: [
    { name: "Corte feminino", durationMin: 60, priceCents: 9000 },
    { name: "Escova", durationMin: 45, priceCents: 6000 },
    { name: "Manicure", durationMin: 45, priceCents: 4000 },
  ],
  saude: [
    { name: "Consulta", durationMin: 30, priceCents: 25000 },
    { name: "Retorno", durationMin: 30, priceCents: 0 },
  ],
  fitness: [
    { name: "Aula experimental", durationMin: 60, priceCents: 0 },
    { name: "Aula avulsa", durationMin: 60, priceCents: 6000 },
  ],
  outro: [{ name: "Atendimento", durationMin: 60, priceCents: null, priceNote: "sob consulta" }],
};

// Segunda a sexta 9h–18h, sábado 9h–13h.
export const DEFAULT_HOURS = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: "09:00", closes: "18:00" })),
  { weekday: 6, opens: "09:00", closes: "13:00" },
];
