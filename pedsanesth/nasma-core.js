// Nasma AI shared core: verified drug data, conditions and pure calculation helpers.
// Used by both the current app (index.html) and the redesign beta (beta.html).
'use strict';

// ───────────────────────── Drug database ─────────────────────────
// dose: per-kg value used for the calculation. max: absolute ceiling in the same unit.
// conc: concentration in unit/mL. kind 'max' = maximum allowable dose (local anesthetics).
const DRUG_DB = [
  // Induction / sedation
  { name: 'Propofol', wt: 'IBW', cat: 'induction', astm: 'astm-induction', label: 'Induction', dose: 3, range: '2.5–3.5', unit: 'mg', conc: 10, concText: '10 mg/mL', note: 'Infants need doses at the top of the range' },
  { name: 'Ketamine IV', wt: 'IBW', cat: 'induction', astm: 'astm-induction', label: 'Induction', dose: 2, range: '1–2', unit: 'mg', conc: 10, concText: '10 mg/mL (diluted)' },
  { name: 'Ketamine IM', wt: 'IBW', cat: 'induction', astm: 'astm-induction', label: 'Induction', dose: 4, range: '4–5', unit: 'mg', conc: 50, concText: '50 mg/mL', note: 'Without IV access' },
  { name: 'Etomidate', wt: 'IBW', cat: 'induction', astm: 'astm-induction', label: 'Induction', dose: 0.3, range: '0.2–0.6', unit: 'mg', conc: 2, concText: '2 mg/mL', note: 'Labeled for >10 y; younger children off-label (0.2–0.3)' },
  { name: 'Midazolam IV', wt: 'IBW', cat: 'induction', astm: 'astm-benzo', label: 'Benzo', dose: 0.05, range: '0.05–0.1', unit: 'mg', max: 2, conc: 1, concText: '1 mg/mL', note: 'Titrate; label total max 6 mg (6 mo–5 y), 10 mg (6–12 y)' },
  { name: 'Midazolam PO', wt: 'IBW', cat: 'induction', astm: 'astm-benzo', label: 'Benzo', dose: 0.5, range: '0.25–1', unit: 'mg', max: 20, conc: 2, concText: '2 mg/mL syrup', note: 'Premed 15–30 min before' },
  { name: 'Dexmedetomidine IN', wt: 'IBW', cat: 'induction', astm: 'astm-other', label: 'Sedative', dose: 2, range: '1–2', unit: 'mcg', max: 100, conc: 100, concText: '100 mcg/mL (undiluted)', note: 'Intranasal premed, onset 30–45 min' },

  // Relaxants & reversal
  { name: 'Rocuronium', wt: 'IBW', cat: 'paralytics', astm: 'astm-paralytic', label: 'Relaxant', dose: 0.6, range: '0.6 (RSI 1.2)', unit: 'mg', conc: 10, concText: '10 mg/mL' },
  { name: 'Rocuronium RSI', wt: 'IBW', cat: 'paralytics', astm: 'astm-paralytic', label: 'Relaxant', dose: 1.2, range: '0.6–1.2', unit: 'mg', conc: 10, concText: '10 mg/mL', note: 'RSI not recommended in children per FDA label; off-label use common' },
  { name: 'Succinylcholine IV', wt: 'TBW', cat: 'paralytics', astm: 'astm-paralytic', label: 'Relaxant', doseFn: (w, a) => (a == null || a < 5 ? 2 : 1), range: 'infants/small children 2; older 1', unit: 'mg', max: 150, conc: 20, concText: '20 mg/mL', note: 'Give atropine first in children; risk of hyperkalemic arrest in undiagnosed myopathy' },
  { name: 'Succinylcholine IM', wt: 'TBW', cat: 'paralytics', astm: 'astm-paralytic', label: 'Relaxant', dose: 4, range: '3–4', unit: 'mg', max: 150, conc: 20, concText: '20 mg/mL' },
  { name: 'Vecuronium', wt: 'IBW', cat: 'paralytics', astm: 'astm-paralytic', label: 'Relaxant', dose: 0.1, range: '0.1', unit: 'mg', conc: 1, concText: '1 mg/mL' },
  { name: 'Cisatracurium', wt: 'IBW', cat: 'paralytics', astm: 'astm-paralytic', label: 'Relaxant', dose: 0.15, range: '0.1–0.2', unit: 'mg', conc: 2, concText: '2 mg/mL' },
  { name: 'Sugammadex (moderate)', wt: 'TBW', cat: 'paralytics', astm: 'astm-reversal', label: 'Reversal', dose: 2, range: '2 (TOF ≥2)', unit: 'mg', conc: 100, concText: '100 mg/mL' },
  { name: 'Sugammadex (deep)', wt: 'TBW', cat: 'paralytics', astm: 'astm-reversal', label: 'Reversal', dose: 4, range: '4 (PTC 1–2)', unit: 'mg', conc: 100, concText: '100 mg/mL', note: 'Labeled ≥2 y. 16 mg/kg immediate reversal not studied in children' },
  { name: 'Neostigmine', wt: 'TBW', cat: 'paralytics', astm: 'astm-reversal', label: 'Reversal', dose: 0.05, range: '0.03–0.07', unit: 'mg', max: 5, conc: 1, concText: '1 mg/mL', note: 'Always with glycopyrrolate or atropine' },
  { name: 'Naloxone (titrate)', wt: 'TBW', cat: 'paralytics', astm: 'astm-opioid-antag', label: 'Opioid antag', dose: 1, range: '1–2, repeat', unit: 'mcg', conc: 40, concText: '40 mcg/mL (0.4 mg in 10 mL)', note: 'Full reversal/arrest: 0.1 mg/kg (max 2 mg)' },
  { name: 'Flumazenil', wt: 'TBW', cat: 'paralytics', astm: 'astm-other', label: 'Benzo antag', dose: 0.01, range: '0.01', unit: 'mg', max: 0.2, conc: 0.1, concText: '0.1 mg/mL' },

  // Opioids & analgesia
  { name: 'Fentanyl', wt: 'IBW', cat: 'analgesics', astm: 'astm-opioid', label: 'Opioid', dose: 1, range: '0.5–2', unit: 'mcg', conc: 10, concText: '10 mcg/mL (diluted)', note: 'Undiluted 50 mcg/mL = ¹⁄₅ of the volume shown' },
  { name: 'Morphine IV', wt: 'IBW', cat: 'analgesics', astm: 'astm-opioid', label: 'Opioid', dose: 0.05, range: '0.05–0.1', unit: 'mg', conc: 1, concText: '1 mg/mL' },
  { name: 'Hydromorphone IV', wt: 'IBW', cat: 'analgesics', astm: 'astm-opioid', label: 'Opioid', dose: 0.01, range: '0.005–0.015', unit: 'mg', conc: 0.2, concText: '0.2 mg/mL (diluted)' },
  { name: 'Acetaminophen IV', wt: 'IBW', cat: 'analgesics', astm: 'astm-other', label: 'Analgesic', doseFn: (w, a) => (a != null && a < 29 / 365.25 ? 12.5 : 15), range: '15 (neonate 12.5)', unit: 'mg', max: 1000, conc: 10, concText: '10 mg/mL', note: 'q6h. Daily max: neonate 50, <2 y 60, ≥2 y 75 mg/kg (≤4 g)' },
  { name: 'Ketorolac IV', wt: 'IBW', cat: 'analgesics', astm: 'astm-other', label: 'NSAID', dose: 0.5, range: '0.5', unit: 'mg', max: 15, conc: 15, concText: '15 mg/mL', note: 'IV single dose labeled 2–16 y (younger off-label); avoid with bleeding risk or renal impairment' },

  // Adjuncts
  { name: 'Atropine', wt: 'TBW', cat: 'adjuncts', astm: 'astm-anticholinergic', label: 'Antichol', dose: 0.02, range: '0.01–0.02', unit: 'mg', max: 0.5, conc: 0.4, concText: '0.4 mg/mL' },
  { name: 'Glycopyrrolate', wt: 'TBW', cat: 'adjuncts', astm: 'astm-anticholinergic', label: 'Antichol', dose: 0.004, range: '0.004 (infants up to 0.009)', unit: 'mg', max: 0.1, conc: 0.2, concText: '0.2 mg/mL', note: 'Antisialagogue / intraop bradycardia' },
  { name: 'Glycopyrrolate (with neostigmine)', wt: 'TBW', cat: 'adjuncts', astm: 'astm-anticholinergic', label: 'Antichol', dose: 0.01, range: '0.2 mg per 1 mg neostigmine', unit: 'mg', max: 1, conc: 0.2, concText: '0.2 mg/mL', note: 'Matches neostigmine 0.05 mg/kg; may mix in the same syringe' },
  { name: 'Ondansetron', wt: 'TBW', cat: 'adjuncts', astm: 'astm-antiemetic', label: 'Antiemetic', dose: 0.1, range: '0.1', unit: 'mg', max: 4, conc: 2, concText: '2 mg/mL' },
  { name: 'Dexamethasone', wt: 'IBW', cat: 'adjuncts', astm: 'astm-other', label: 'Steroid', dose: 0.15, range: '0.15 PONV (airway 0.5)', unit: 'mg', max: 5, conc: 4, concText: '4 mg/mL' },
  { name: 'Diphenhydramine', wt: 'TBW', cat: 'adjuncts', astm: 'astm-other', label: 'Antihist', dose: 1, range: '0.5–1', unit: 'mg', max: 50, conc: 50, concText: '50 mg/mL' },

  // Vasoactive
  { name: 'Ephedrine', wt: 'TBW', cat: 'pressors', astm: 'astm-pressor', label: 'Pressor', dose: 0.1, range: '0.1–0.2', unit: 'mg', max: 10, conc: 5, concText: '5 mg/mL (diluted)' },
  { name: 'Phenylephrine', wt: 'TBW', cat: 'pressors', astm: 'astm-pressor', label: 'Pressor', dose: 1, range: '0.5–2', unit: 'mcg', max: 100, conc: 100, concText: '100 mcg/mL (diluted)' },
  { name: 'Epinephrine (push-dose)', wt: 'TBW', cat: 'pressors', astm: 'astm-pressor', label: 'Pressor', dose: 1, range: '0.5–1', unit: 'mcg', conc: 10, concText: '10 mcg/mL (1:100,000)', note: 'Hypotension or anaphylaxis — titrate. NOT the arrest dose' },
  { name: 'Calcium chloride 10%', wt: 'TBW', cat: 'pressors', astm: 'astm-other', label: 'Electrolyte', dose: 20, range: '20', unit: 'mg', max: 1000, conc: 100, concText: '100 mg/mL', note: 'Hypocalcemia / transfusion / inotropy; central line preferred, slow push' },
  { name: 'Esmolol', wt: 'IBW', cat: 'pressors', astm: 'astm-hypotensive', label: 'Hypotensive', dose: 0.5, range: '0.1–0.5', unit: 'mg', conc: 10, concText: '10 mg/mL', note: 'Bolus over 1 min; infusion in Infusions tab' },
  { name: 'Labetalol', wt: 'IBW', cat: 'pressors', astm: 'astm-hypotensive', label: 'Hypotensive', dose: 0.2, range: '0.2–1', unit: 'mg', max: 40, conc: 5, concText: '5 mg/mL', note: 'Repeat q10 min as needed' },
  { name: 'Hydralazine', wt: 'IBW', cat: 'pressors', astm: 'astm-hypotensive', label: 'Hypotensive', dose: 0.1, range: '0.1–0.2', unit: 'mg', max: 20, conc: 20, concText: '20 mg/mL' },

  // Local anesthetics — maximum doses
  { name: 'Bupivacaine 0.25%', wt: 'IBW', cat: 'local', astm: 'astm-local', label: 'Local', kind: 'max', doseFn: (w, a) => (a != null && a < 0.5 ? 2 : 2.5), range: '2.5 (<6 mo: 2)', unit: 'mg', max: 175, conc: 2.5, concText: '2.5 mg/mL' },
  { name: 'Ropivacaine 0.2%', wt: 'IBW', cat: 'local', astm: 'astm-local', label: 'Local', kind: 'max', doseFn: (w, a) => (a != null && a < 0.5 ? 2.5 : 3), range: '3 (<6 mo: 2.5)', unit: 'mg', max: 225, conc: 2, concText: '2 mg/mL' },
  { name: 'Lidocaine 1% plain', wt: 'IBW', cat: 'local', astm: 'astm-local', label: 'Local', kind: 'max', dose: 4.5, range: '4.5', unit: 'mg', max: 300, conc: 10, concText: '10 mg/mL' },
  { name: 'Lidocaine 1% + epi', wt: 'IBW', cat: 'local', astm: 'astm-local', label: 'Local', kind: 'max', dose: 7, range: '7', unit: 'mg', max: 500, conc: 10, concText: '10 mg/mL' }
];

// Where each dose comes from (shown on every row; full list in Info).
const SRC_BOLUS = {"Propofol": "FDA label (Diprivan)", "Ketamine IV": "Common practice (ACEP sedation)", "Ketamine IM": "Common practice (ACEP sedation)", "Etomidate": "FDA label (Amidate)", "Midazolam IV": "FDA label", "Midazolam PO": "FDA label (oral syrup)", "Dexmedetomidine IN": "Off-label; common practice", "Rocuronium": "FDA label", "Rocuronium RSI": "FDA label (adult RSI); off-label in children", "Succinylcholine IV": "FDA label (Anectine)", "Succinylcholine IM": "FDA label (Anectine)", "Vecuronium": "FDA label", "Cisatracurium": "FDA label", "Sugammadex (moderate)": "FDA label (Bridion, ≥2 y)", "Sugammadex (deep)": "FDA label (Bridion, ≥2 y)", "Neostigmine": "FDA label (Bloxiverz)", "Naloxone (titrate)": "AAP", "Flumazenil": "FDA label", "Fentanyl": "Common practice", "Morphine IV": "Common practice", "Hydromorphone IV": "Common practice", "Acetaminophen IV": "FDA label (Ofirmev)", "Ketorolac IV": "FDA label", "Atropine": "AHA PALS 2020", "Glycopyrrolate": "FDA label", "Glycopyrrolate (with neostigmine)": "FDA label", "Ondansetron": "FDA label (Zofran)", "Dexamethasone": "4th PONV Consensus (Gan 2020)", "Diphenhydramine": "Common practice", "Ephedrine": "Common practice", "Phenylephrine": "Common practice", "Epinephrine (push-dose)": "Common practice", "Calcium chloride 10%": "AHA PALS 2020", "Esmolol": "Common practice", "Labetalol": "Pediatric HTN emergency table (AAP 2017)", "Hydralazine": "Pediatric HTN emergency table (AAP 2017)", "Bupivacaine 0.25%": "Commonly cited maximum", "Ropivacaine 0.2%": "Commonly cited maximum", "Lidocaine 1% plain": "Commonly cited maximum", "Lidocaine 1% + epi": "Commonly cited maximum"};
DRUG_DB.forEach((d) => (d.src = SRC_BOLUS[d.name] || 'Common practice'));

const CAT_TITLES = { induction: 'Induction & Sedation', paralytics: 'Relaxants & Reversal', analgesics: 'Opioids & Analgesia', adjuncts: 'Adjuncts', pressors: 'Vasoactive (bolus)', local: 'Local Anesthetics — MAXIMUM total dose' };

// ───────────────────────── Continuous infusions ─────────────────────────
// def: default dose; lo/hi: usual range; dU/dT: dose unit (mcg|mg|U|mU) per kg per (min|hr);
// conc/cU: default syringe concentration; wt: weight scalar when obesity scalars are on.
const INFUSIONS = [
  { name: 'Propofol', group: 'sedation', astm: 'astm-induction', label: 'Induction', def: 200, lo: 125, hi: 300, dU: 'mcg', dT: 'min', conc: 10, cU: 'mg', wt: 'TBW', note: 'Maintenance ≥2 months: start 200–300, then 125–300. Pediatric sedation (lower rates) is off-label' },
  { name: 'Remifentanil', group: 'sedation', astm: 'astm-opioid', label: 'Opioid', def: 0.25, lo: 0.05, hi: 1.3, dU: 'mcg', dT: 'min', conc: 20, cU: 'mcg', wt: 'IBW', note: '1–12 y with volatile: 0.25; birth–2 mo with N₂O: 0.4. No bolus needed; chest-wall rigidity with rapid boluses. Plan longer-acting analgesia before stopping' },
  { name: 'Fentanyl', group: 'sedation', astm: 'astm-opioid', label: 'Opioid', def: 2, lo: 1, hi: 5, dU: 'mcg', dT: 'hr', conc: 10, cU: 'mcg', wt: 'IBW', note: 'Intraop 1–3; ICU sedation 1–4 mcg/kg/hr' },
  { name: 'Dexmedetomidine (Precedex)', group: 'sedation', astm: 'astm-other', label: 'Sedative', def: 0.5, lo: 0.2, hi: 1.5, dU: 'mcg', dT: 'hr', conc: 4, cU: 'mcg', wt: 'IBW', note: 'Procedural sedation (1 mo–<18 y): 0.5–1.5. Intraop adjunct often 0.2–0.7. Not for >24 h. Bradycardia/hypotension', load: { lo: 0.5, hi: 2, u: 'mcg', over: 'over 10 min. Labeled load: 1.5 (<2 y) or 2 mcg/kg (≥2 y); intraop often 0.5–1' } },
  { name: 'Ketamine', group: 'sedation', astm: 'astm-induction', label: 'Induction', def: 5, lo: 2, hi: 8, dU: 'mcg', dT: 'min', conc: 1, cU: 'mg', wt: 'IBW', note: 'Analgesic 2–8 mcg/kg/min; sedation 10–30 mcg/kg/min' },
  { name: 'Midazolam', group: 'sedation', astm: 'astm-benzo', label: 'Benzo', def: 1.5, lo: 0.8, hi: 3.3, dU: 'mcg', dT: 'min', conc: 1, cU: 'mg', wt: 'IBW', note: 'Accumulates in prolonged infusions and with renal impairment' },
  { name: 'Morphine', group: 'sedation', astm: 'astm-opioid', label: 'Opioid', def: 20, lo: 10, hi: 40, dU: 'mcg', dT: 'hr', conc: 1, cU: 'mg', wt: 'IBW', note: 'Neonates 5–10 mcg/kg/hr' },
  { name: 'Hydromorphone', group: 'sedation', astm: 'astm-opioid', label: 'Opioid', def: 4, lo: 3, hi: 5, dU: 'mcg', dT: 'hr', conc: 0.2, cU: 'mg', wt: 'IBW' },
  { name: 'Lidocaine (analgesic)', group: 'sedation', astm: 'astm-local', label: 'Local', def: 25, lo: 15, hi: 33, dU: 'mcg', dT: 'min', conc: 10, cU: 'mg', wt: 'IBW', note: 'Counts toward the local anesthetic maximum; stop if signs of LAST', load: { lo: 1, hi: 1.5, u: 'mg', over: 'over 10 min' } },

  { name: 'Rocuronium', group: 'nmb', astm: 'astm-paralytic', label: 'Relaxant', def: 10, lo: 7, hi: 12, dU: 'mcg', dT: 'min', conc: 10, cU: 'mg', wt: 'IBW', note: 'Start after early recovery from intubating dose: 7–10 (sevoflurane/isoflurane), 12 (halothane). Titrate to train-of-four' },
  { name: 'Cisatracurium', group: 'nmb', astm: 'astm-paralytic', label: 'Relaxant', def: 2, lo: 1, hi: 4, dU: 'mcg', dT: 'min', conc: 2, cU: 'mg', wt: 'IBW', note: 'Organ-independent (Hofmann) elimination; titrate to train-of-four' },
  { name: 'Vecuronium', group: 'nmb', astm: 'astm-paralytic', label: 'Relaxant', def: 1, lo: 0.8, hi: 1.2, dU: 'mcg', dT: 'min', conc: 1, cU: 'mg', wt: 'IBW', note: 'Accumulates in renal/hepatic impairment' },

  { name: 'Epinephrine', group: 'vaso', astm: 'astm-pressor', label: 'Pressor', def: 0.05, lo: 0.01, hi: 1, dU: 'mcg', dT: 'min', conc: 16, cU: 'mcg', wt: 'ABW', note: 'Usual 0.02–0.3. Inotropy at low doses, vasoconstriction at higher doses' },
  { name: 'Norepinephrine', group: 'vaso', astm: 'astm-pressor', label: 'Pressor', def: 0.05, lo: 0.05, hi: 2, dU: 'mcg', dT: 'min', conc: 16, cU: 'mcg', wt: 'ABW', note: 'Usual 0.05–0.5. Warm/vasodilatory shock; central line preferred' },
  { name: 'Dopamine', group: 'vaso', astm: 'astm-pressor', label: 'Pressor', def: 5, lo: 2, hi: 20, dU: 'mcg', dT: 'min', conc: 1600, cU: 'mcg', wt: 'ABW', note: '5–10 inotropic; >10 vasoconstrictive. Extravasation: phentolamine' },
  { name: 'Dobutamine', group: 'vaso', astm: 'astm-pressor', label: 'Inotrope', def: 5, lo: 2, hi: 20, dU: 'mcg', dT: 'min', conc: 2000, cU: 'mcg', wt: 'ABW', note: 'Inotrope/vasodilator; may cause tachycardia, hypotension' },
  { name: 'Milrinone', group: 'vaso', astm: 'astm-pressor', label: 'Inodilator', def: 0.5, lo: 0.25, hi: 0.75, dU: 'mcg', dT: 'min', conc: 200, cU: 'mcg', wt: 'ABW', note: 'Reduce dose in renal impairment. Load often omitted or given slowly to avoid hypotension', load: { lo: 50, hi: 50, u: 'mcg', over: 'over 10–60 min (optional)' } },
  { name: 'Vasopressin', group: 'vaso', astm: 'astm-pressor', label: 'Pressor', def: 0.5, lo: 0.3, hi: 2, dU: 'mU', dT: 'min', conc: 0.2, cU: 'U', wt: 'ABW', note: 'milliunits/kg/min (0.0003–0.002 U/kg/min). Off-label in children (not FDA-established); catecholamine-refractory vasodilatory shock. Adult max 0.04 U/min' },
  { name: 'Phenylephrine', group: 'vaso', astm: 'astm-pressor', label: 'Pressor', def: 0.2, lo: 0.1, hi: 0.5, dU: 'mcg', dT: 'min', conc: 40, cU: 'mcg', wt: 'ABW', note: 'Pure α-agonist; reflex bradycardia. Useful in tetralogy spells' },
  { name: 'Isoproterenol', group: 'vaso', astm: 'astm-pressor', label: 'Chronotrope', def: 0.05, lo: 0.05, hi: 2, dU: 'mcg', dT: 'min', conc: 16, cU: 'mcg', wt: 'ABW', note: 'Bradycardia/heart block, pulmonary vasodilation; causes tachyarrhythmias' },
  { name: 'Nitroglycerin', group: 'vaso', astm: 'astm-hypotensive', label: 'Vasodilator', def: 0.5, lo: 0.25, hi: 5, dU: 'mcg', dT: 'min', conc: 200, cU: 'mcg', wt: 'ABW', note: 'Max 10 mcg/kg/min. Use non-PVC tubing' },
  { name: 'Nitroprusside', group: 'vaso', astm: 'astm-hypotensive', label: 'Vasodilator', def: 0.5, lo: 0.3, hi: 4, dU: 'mcg', dT: 'min', conc: 200, cU: 'mcg', wt: 'ABW', note: 'Start 0.3, typical ~1. Protect from light. Cyanide/thiocyanate toxicity with high doses or prolonged use' },
  { name: 'Esmolol', group: 'vaso', astm: 'astm-hypotensive', label: 'β-blocker', def: 100, lo: 50, hi: 300, dU: 'mcg', dT: 'min', conc: 10, cU: 'mg', wt: 'IBW', note: 'Short-acting β1 blocker; titrate q5 min (some protocols up to 500)', load: { lo: 100, hi: 500, u: 'mcg', over: 'over 1 min' } },
  { name: 'Alprostadil (PGE₁)', group: 'vaso', astm: 'astm-other', label: 'Prostaglandin', def: 0.05, lo: 0.01, hi: 0.1, dU: 'mcg', dT: 'min', conc: 10, cU: 'mcg', wt: 'TBW', note: 'Start 0.05–0.1, then reduce to the lowest effective dose. Apnea in 10–12% (most in <2 kg, first hour): be ready to ventilate' },

  { name: 'Insulin (regular)', group: 'other', astm: 'astm-other', label: 'Insulin', def: 0.05, lo: 0.02, hi: 0.1, dU: 'U', dT: 'hr', conc: 1, cU: 'U', wt: 'TBW', note: 'Check glucose and K⁺ hourly; add dextrose as glucose falls' },
  { name: 'Dextrose 10% (GIR)', fixedUnit: true, group: 'other', astm: 'astm-other', label: 'Glucose', def: 4, lo: 2, hi: 8, dU: 'mg', dT: 'min', conc: 100, cU: 'mg', wt: 'TBW', note: 'Glucose infusion rate (mg/kg/min). Neonates usually need 4–8' }
];
const SRC_INF = {"Propofol": "FDA label (Diprivan)", "Remifentanil": "FDA label (Ultiva)", "Fentanyl": "PICU practice", "Dexmedetomidine (Precedex)": "FDA label (pediatric procedural sedation)", "Ketamine": "CHOP CICU pathway", "Midazolam": "PICU practice", "Morphine": "Common practice", "Hydromorphone": "CHOP CICU pathway", "Lidocaine (analgesic)": "Common practice", "Rocuronium": "FDA label", "Cisatracurium": "FDA label", "Vecuronium": "FDA label", "Epinephrine": "AHA PALS / Johns Hopkins All Children’s", "Norepinephrine": "AHA PALS / Johns Hopkins All Children’s", "Dopamine": "AHA PALS", "Dobutamine": "AHA PALS", "Milrinone": "AHA PALS", "Vasopressin": "Published case series (off-label)", "Phenylephrine": "Common practice", "Isoproterenol": "Pediatric ICU infusion guideline", "Nitroglycerin": "Pediatric ICU infusion guideline", "Nitroprusside": "Pediatric dose-response study", "Esmolol": "Pediatric titration protocols", "Alprostadil (PGE₁)": "FDA label (Prostin VR)", "Insulin (regular)": "Pediatric DKA practice", "Dextrose 10% (GIR)": "Neonatal practice"};
INFUSIONS.forEach((f) => (f.src = SRC_INF[f.name] || 'Common practice'));

const INF_GROUPS = { sedation: 'Anesthesia & Sedation', nmb: 'Neuromuscular Blockers', vaso: 'Vasoactive', other: 'Other' };

// CDC 2000 BMI-for-age, ages 2–20 y (monthly): 50th and 95th percentiles by sex.
const BMI_CDC = {"ages":[2,2.042,2.125,2.208,2.292,2.375,2.458,2.542,2.625,2.708,2.792,2.875,2.958,3.042,3.125,3.208,3.292,3.375,3.458,3.542,3.625,3.708,3.792,3.875,3.958,4.042,4.125,4.208,4.292,4.375,4.458,4.542,4.625,4.708,4.792,4.875,4.958,5.042,5.125,5.208,5.292,5.375,5.458,5.542,5.625,5.708,5.792,5.875,5.958,6.042,6.125,6.208,6.292,6.375,6.458,6.542,6.625,6.708,6.792,6.875,6.958,7.042,7.125,7.208,7.292,7.375,7.458,7.542,7.625,7.708,7.792,7.875,7.958,8.042,8.125,8.208,8.292,8.375,8.458,8.542,8.625,8.708,8.792,8.875,8.958,9.042,9.125,9.208,9.292,9.375,9.458,9.542,9.625,9.708,9.792,9.875,9.958,10.042,10.125,10.208,10.292,10.375,10.458,10.542,10.625,10.708,10.792,10.875,10.958,11.042,11.125,11.208,11.292,11.375,11.458,11.542,11.625,11.708,11.792,11.875,11.958,12.042,12.125,12.208,12.292,12.375,12.458,12.542,12.625,12.708,12.792,12.875,12.958,13.042,13.125,13.208,13.292,13.375,13.458,13.542,13.625,13.708,13.792,13.875,13.958,14.042,14.125,14.208,14.292,14.375,14.458,14.542,14.625,14.708,14.792,14.875,14.958,15.042,15.125,15.208,15.292,15.375,15.458,15.542,15.625,15.708,15.792,15.875,15.958,16.042,16.125,16.208,16.292,16.375,16.458,16.542,16.625,16.708,16.792,16.875,16.958,17.042,17.125,17.208,17.292,17.375,17.458,17.542,17.625,17.708,17.792,17.875,17.958,18.042,18.125,18.208,18.292,18.375,18.458,18.542,18.625,18.708,18.792,18.875,18.958,19.042,19.125,19.208,19.292,19.375,19.458,19.542,19.625,19.708,19.792,19.875,19.958,20,20.042],"m50":[16.58,16.55,16.49,16.44,16.39,16.34,16.3,16.25,16.2,16.16,16.12,16.08,16.04,16.0,15.96,15.93,15.89,15.86,15.83,15.79,15.76,15.73,15.71,15.68,15.65,15.63,15.6,15.58,15.56,15.54,15.52,15.5,15.49,15.47,15.46,15.44,15.43,15.42,15.41,15.4,15.39,15.39,15.38,15.38,15.38,15.38,15.38,15.38,15.38,15.38,15.39,15.39,15.4,15.41,15.42,15.43,15.44,15.45,15.47,15.48,15.5,15.51,15.53,15.55,15.57,15.59,15.61,15.63,15.65,15.68,15.7,15.73,15.76,15.78,15.81,15.84,15.87,15.9,15.93,15.96,15.99,16.03,16.06,16.1,16.13,16.17,16.2,16.24,16.28,16.32,16.36,16.4,16.44,16.48,16.52,16.56,16.6,16.65,16.69,16.73,16.78,16.82,16.87,16.92,16.96,17.01,17.06,17.1,17.15,17.2,17.25,17.3,17.35,17.4,17.45,17.5,17.55,17.6,17.66,17.71,17.76,17.81,17.87,17.92,17.98,18.03,18.08,18.14,18.19,18.25,18.3,18.36,18.42,18.47,18.53,18.58,18.64,18.7,18.75,18.81,18.87,18.93,18.98,19.04,19.1,19.16,19.22,19.27,19.33,19.39,19.45,19.51,19.57,19.62,19.68,19.74,19.8,19.86,19.92,19.97,20.03,20.09,20.15,20.21,20.27,20.33,20.38,20.44,20.5,20.56,20.62,20.67,20.73,20.79,20.85,20.9,20.96,21.02,21.07,21.13,21.19,21.24,21.3,21.35,21.41,21.46,21.52,21.57,21.63,21.68,21.74,21.79,21.84,21.9,21.95,22.0,22.05,22.1,22.15,22.21,22.26,22.31,22.35,22.4,22.45,22.5,22.55,22.6,22.64,22.69,22.73,22.78,22.82,22.87,22.91,22.96,23.0,23.02,23.04],"m95":[19.34,19.28,19.16,19.06,18.95,18.85,18.76,18.67,18.59,18.51,18.43,18.36,18.3,18.24,18.18,18.13,18.08,18.04,18.0,17.97,17.93,17.91,17.88,17.86,17.85,17.84,17.83,17.82,17.82,17.82,17.83,17.83,17.84,17.86,17.87,17.89,17.91,17.94,17.97,18.0,18.03,18.06,18.1,18.14,18.18,18.22,18.27,18.31,18.36,18.41,18.47,18.52,18.58,18.64,18.7,18.76,18.82,18.88,18.95,19.01,19.08,19.15,19.22,19.29,19.37,19.44,19.52,19.59,19.67,19.75,19.83,19.91,19.99,20.07,20.15,20.23,20.32,20.4,20.48,20.57,20.65,20.74,20.83,20.91,21.0,21.09,21.18,21.26,21.35,21.44,21.53,21.62,21.71,21.8,21.89,21.98,22.06,22.15,22.24,22.33,22.42,22.51,22.6,22.69,22.78,22.86,22.95,23.04,23.13,23.21,23.3,23.39,23.47,23.56,23.64,23.73,23.81,23.9,23.98,24.06,24.15,24.23,24.31,24.39,24.47,24.55,24.63,24.71,24.79,24.87,24.95,25.03,25.1,25.18,25.25,25.33,25.4,25.48,25.55,25.62,25.69,25.77,25.84,25.91,25.98,26.05,26.12,26.18,26.25,26.32,26.38,26.45,26.52,26.58,26.65,26.71,26.77,26.84,26.9,26.96,27.02,27.09,27.15,27.21,27.27,27.33,27.39,27.45,27.51,27.56,27.62,27.68,27.74,27.8,27.85,27.91,27.97,28.03,28.08,28.14,28.2,28.26,28.31,28.37,28.43,28.49,28.55,28.6,28.66,28.72,28.78,28.84,28.9,28.96,29.02,29.08,29.14,29.2,29.27,29.33,29.39,29.46,29.52,29.59,29.66,29.73,29.8,29.87,29.94,30.01,30.08,30.16,30.23,30.31,30.39,30.47,30.55,30.59,30.63],"f50":[16.42,16.39,16.32,16.25,16.19,16.12,16.06,16.01,15.95,15.9,15.84,15.79,15.75,15.7,15.66,15.61,15.57,15.54,15.5,15.46,15.43,15.4,15.37,15.35,15.32,15.3,15.28,15.26,15.24,15.22,15.21,15.2,15.18,15.18,15.17,15.16,15.16,15.15,15.15,15.15,15.15,15.15,15.16,15.16,15.17,15.17,15.18,15.19,15.2,15.22,15.23,15.25,15.26,15.28,15.3,15.32,15.34,15.36,15.38,15.4,15.43,15.45,15.48,15.51,15.54,15.56,15.59,15.63,15.66,15.69,15.72,15.76,15.79,15.83,15.86,15.9,15.94,15.98,16.02,16.06,16.1,16.14,16.18,16.22,16.26,16.31,16.35,16.39,16.44,16.48,16.53,16.58,16.62,16.67,16.72,16.77,16.81,16.86,16.91,16.96,17.01,17.06,17.11,17.16,17.21,17.26,17.31,17.37,17.42,17.47,17.52,17.57,17.63,17.68,17.73,17.78,17.84,17.89,17.94,18.0,18.05,18.1,18.15,18.21,18.26,18.31,18.37,18.42,18.47,18.53,18.58,18.63,18.68,18.74,18.79,18.84,18.89,18.94,19.0,19.05,19.1,19.15,19.2,19.25,19.3,19.35,19.4,19.45,19.5,19.55,19.6,19.65,19.7,19.74,19.79,19.84,19.88,19.93,19.98,20.02,20.07,20.11,20.16,20.2,20.24,20.29,20.33,20.37,20.41,20.45,20.49,20.53,20.57,20.61,20.65,20.69,20.73,20.76,20.8,20.84,20.87,20.91,20.94,20.97,21.01,21.04,21.07,21.1,21.13,21.16,21.19,21.22,21.25,21.28,21.3,21.33,21.35,21.38,21.4,21.43,21.45,21.47,21.49,21.51,21.53,21.55,21.57,21.59,21.6,21.62,21.64,21.65,21.66,21.68,21.69,21.7,21.71,21.72,21.72],"f95":[19.11,19.06,18.97,18.88,18.8,18.72,18.64,18.58,18.51,18.45,18.4,18.35,18.3,18.25,18.22,18.18,18.15,18.12,18.1,18.08,18.06,18.05,18.04,18.03,18.03,18.03,18.03,18.04,18.05,18.06,18.07,18.09,18.11,18.14,18.16,18.19,18.22,18.26,18.29,18.33,18.37,18.42,18.46,18.51,18.56,18.61,18.66,18.72,18.78,18.84,18.9,18.96,19.03,19.09,19.16,19.23,19.3,19.37,19.45,19.52,19.6,19.68,19.76,19.84,19.92,20.0,20.08,20.17,20.25,20.34,20.43,20.52,20.61,20.7,20.79,20.88,20.97,21.06,21.15,21.25,21.34,21.44,21.53,21.63,21.72,21.82,21.91,22.01,22.11,22.2,22.3,22.4,22.5,22.59,22.69,22.79,22.89,22.98,23.08,23.18,23.27,23.37,23.47,23.57,23.66,23.76,23.85,23.95,24.05,24.14,24.24,24.33,24.43,24.52,24.61,24.71,24.8,24.89,24.98,25.07,25.17,25.26,25.35,25.43,25.52,25.61,25.7,25.79,25.87,25.96,26.05,26.13,26.22,26.3,26.38,26.46,26.55,26.63,26.71,26.79,26.87,26.95,27.03,27.1,27.18,27.26,27.33,27.41,27.48,27.55,27.63,27.7,27.77,27.84,27.91,27.99,28.05,28.12,28.19,28.26,28.33,28.39,28.46,28.53,28.59,28.66,28.72,28.78,28.85,28.91,28.97,29.03,29.1,29.16,29.22,29.28,29.34,29.4,29.46,29.52,29.57,29.63,29.69,29.75,29.81,29.87,29.92,29.98,30.04,30.1,30.15,30.21,30.27,30.33,30.38,30.44,30.5,30.56,30.61,30.67,30.73,30.79,30.85,30.91,30.97,31.03,31.09,31.15,31.21,31.27,31.34,31.4,31.47,31.53,31.6,31.66,31.73,31.76,31.8]};

// ───────────────────────── Patient conditions (beta, draft content) ─────────────────────────
// rules: drug name (bolus or infusion, exactly as listed) → [level, reason]; level: avoid | caution | prefer
const CONDITIONS = [
  { id: 'fontan', name: 'Fontan / single ventricle', kw: /fontan|glenn|single[- ]ventricle|hlhs|hypoplastic left/i,
    notes: ['Pulmonary blood flow is passive: keep preload up (limit fasting, early IV fluids) and pulmonary vascular resistance low.',
      'Avoid hypoxia, hypercarbia, acidosis and high PEEP or mean airway pressure; favor spontaneous ventilation or low pressures and early extubation.',
      'Often on aspirin or warfarin: check before neuraxial or deep blocks. Arrhythmias are common.',
      'Check AHA criteria for endocarditis prophylaxis; involve cardiac anesthesia for major cases.'],
    rules: { 'Ketamine IV': ['prefer', 'Maintains SVR and contractility'], 'Etomidate': ['prefer', 'Minimal myocardial depression'],
      'Propofol': ['caution', 'Vasodilation and myocardial depression: titrate slowly'],
      'Milrinone': ['prefer', 'Inodilator: ventricular dysfunction, lowers PVR'], 'Ketorolac IV': ['caution', 'Check antiplatelet/anticoagulant use and renal function'] } },
  { id: 'ph', name: 'Pulmonary hypertension', kw: /pulmonary hypertension|\bpah\b|\bph crisis|\bpphn\b/i,
    notes: ['Risk of pulmonary hypertensive crisis: avoid hypoxia, hypercarbia, acidosis, hypothermia, pain and light anesthesia.',
      'Keep SVR above PVR: have a vasopressor ready before induction. Have inhaled nitric oxide available (see Infusions tab).',
      'High-risk patients: plan with cardiology/cardiac anesthesia; ICU bed.'],
    rules: { 'Propofol': ['caution', 'Bolus can drop SVR and trigger a crisis: titrate'], 'Etomidate': ['prefer', 'Hemodynamically stable induction'],
      'Vasopressin': ['prefer', 'Raises SVR without raising PVR'], 'Norepinephrine': ['prefer', 'Supports SVR and RV perfusion'],
      'Milrinone': ['prefer', 'Lowers PVR, supports RV (watch hypotension)'], 'Phenylephrine': ['caution', 'Raises SVR but may raise PVR'] } },
  { id: 'cyanotic', name: 'Cyanotic heart disease (R→L shunt)', kw: /tetralogy|tet spell|cyanotic|eisenmenger|right[- ]to[- ]left shunt|r ?(→|->|to) ?l shunt/i,
    notes: ['De-air all IV lines: risk of paradoxical (systemic) air embolism.',
      'Avoid drops in SVR, which increase right-to-left shunting; keep the child calm and well hydrated.',
      'Tet spell: 100% O₂, deepen anesthesia, knee-chest position, fluid bolus, phenylephrine; consider esmolol.'],
    rules: { 'Phenylephrine': ['prefer', 'Raises SVR: first-line for tet spells'], 'Ketamine IV': ['prefer', 'Maintains SVR'],
      'Propofol': ['caution', 'Lowers SVR: worsens shunting'], 'Esmolol': ['prefer', 'Relieves infundibular spasm in tet spells'] } },
  { id: 'myopathy', name: 'Duchenne / myopathy', kw: /duchenne|becker|muscular dystrophy|myopath|\bdmd\b/i,
    notes: ['Succinylcholine can cause hyperkalemic rhabdomyolysis and cardiac arrest: do not use.',
      'Avoid volatile agents if possible (rhabdomyolysis risk): plan TIVA.',
      'Check for cardiomyopathy (recent echo) and respiratory weakness; plan postoperative respiratory support.'],
    rules: { 'Succinylcholine IV': ['avoid', 'Hyperkalemic rhabdomyolysis / cardiac arrest risk'], 'Succinylcholine IM': ['avoid', 'Hyperkalemic rhabdomyolysis / cardiac arrest risk'],
      'Rocuronium': ['caution', 'Prolonged effect: reduce dose, monitor train-of-four'], 'Sugammadex (moderate)': ['prefer', 'Reliable full reversal'],
      'Propofol': ['prefer', 'TIVA instead of volatile agents'] } },
  { id: 'mh', name: 'MH-susceptible', kw: /malignant hyperthermia|mh[- ]susceptible|\bmhs\b|ryr1/i,
    notes: ['No succinylcholine and no volatile agents: use TIVA.',
      'Prepare the machine (flush or activated-charcoal filters per manufacturer), dantrolene immediately available.',
      'Monitor temperature and EtCO₂ closely; MH hotline 1-800-644-9737.'],
    rules: { 'Succinylcholine IV': ['avoid', 'MH trigger'], 'Succinylcholine IM': ['avoid', 'MH trigger'], 'Propofol': ['prefer', 'Non-triggering TIVA'] } },
  { id: 't21', name: 'Trisomy 21', kw: /trisomy 21|down'?s? syndrome|\bt21\b/i,
    notes: ['Airway: large tongue, possible subglottic stenosis: have ETT 0.5–1 mm smaller ready.',
      'Possible atlantoaxial instability: keep the neck neutral during laryngoscopy.',
      'Check for congenital heart disease (e.g. AV canal), OSA and hypothyroidism.',
      'Bradycardia is common during sevoflurane induction: have atropine ready.'],
    rules: { 'Atropine': ['prefer', 'Bradycardia during inhalational induction is common'] } },
  { id: 'osa', name: 'OSA / sleep apnea', kw: /\bosa\b|sleep apn|snor/i,
    notes: ['Increased opioid sensitivity, especially with nocturnal hypoxemia: consider about half the usual opioid dose and titrate.',
      'Use multimodal analgesia. Codeine and tramadol are contraindicated under 12 y and after tonsillectomy under 18 y (FDA).',
      'Extended postoperative monitoring; consider overnight stay for severe OSA.'],
    rules: { 'Fentanyl': ['caution', 'Opioid-sensitive: consider ~50% dose'], 'Morphine IV': ['caution', 'Opioid-sensitive: consider ~50% dose'],
      'Hydromorphone IV': ['caution', 'Opioid-sensitive: consider ~50% dose'], 'Acetaminophen IV': ['prefer', 'Opioid-sparing'],
      'Dexamethasone': ['prefer', 'Opioid-sparing, reduces swelling and PONV'], 'Dexmedetomidine IN': ['prefer', 'Opioid-sparing sedation without respiratory depression'] } },
  { id: 'exprem', name: 'Ex-premature infant', kw: /ex[- ]?prem|premature|preterm|born at \d+ ?(weeks|wk)/i,
    notes: ['Postoperative apnea risk, highest under ~60 weeks postmenstrual age: plan overnight apnea monitoring.',
      'Consider regional or spinal anesthesia; avoid long-acting opioids and sedatives where possible.',
      'Watch for hypoglycemia and hypothermia; check for anemia and BPD.'],
    rules: { 'Morphine IV': ['caution', 'Apnea risk'], 'Hydromorphone IV': ['caution', 'Apnea risk'], 'Midazolam IV': ['caution', 'Apnea risk'], 'Midazolam PO': ['caution', 'Apnea risk'],
      'Acetaminophen IV': ['prefer', 'Opioid-sparing (neonatal dosing applies)'] } },
  { id: 'asthma', name: 'Asthma / reactive airway', kw: /asthma|wheez|reactive airway|bronchospas/i,
    notes: ['Give a bronchodilator before induction; ensure deep anesthesia before airway instrumentation.',
      'Consider LMA instead of ETT when appropriate; recent URI raises the risk of laryngospasm and bronchospasm.',
      'Have salbutamol (albuterol) and epinephrine ready for bronchospasm.'],
    rules: { 'Ketamine IV': ['prefer', 'Bronchodilating'], 'Propofol': ['prefer', 'Blunts airway reflexes'],
      'Morphine IV': ['caution', 'Histamine release'], 'Neostigmine': ['caution', 'Can provoke bronchospasm: sugammadex preferred'],
      'Sugammadex (moderate)': ['prefer', 'Avoids neostigmine-induced bronchospasm'] } },
  { id: 'renal', name: 'Renal impairment', kw: /renal|kidney|\bckd\b|dialysis|\baki\b/i,
    notes: ['Avoid nephrotoxins and drugs with active renal metabolites; check potassium before succinylcholine.',
      'Expect prolonged effect of renally cleared drugs; reduce infusion doses.'],
    rules: { 'Ketorolac IV': ['avoid', 'Nephrotoxic'], 'Morphine IV': ['avoid', 'Active metabolites accumulate'], 'Morphine': ['avoid', 'Active metabolites accumulate'],
      'Succinylcholine IV': ['caution', 'Check K⁺ first'], 'Sugammadex (moderate)': ['caution', 'Not recommended in severe renal impairment (label)'],
      'Sugammadex (deep)': ['caution', 'Not recommended in severe renal impairment (label)'], 'Vecuronium': ['caution', 'Prolonged effect'],
      'Milrinone': ['caution', 'Renally cleared: reduce dose'], 'Cisatracurium': ['prefer', 'Organ-independent elimination'] } },
  { id: 'anticoag', name: 'On anticoagulant / antiplatelet', kw: /aspirin|warfarin|heparin|enoxaparin|clopidogrel|anticoag|antiplatelet|rivaroxaban|apixaban/i,
    notes: ['Check timing against ASRA guidelines before neuraxial or deep blocks.',
      'Avoid NSAIDs; anticipate bleeding.'],
    rules: { 'Ketorolac IV': ['avoid', 'Adds bleeding risk'] } },
  { id: 'mito', name: 'Mitochondrial disease', kw: /mitochondri/i,
    notes: ['Minimize fasting and give glucose-containing fluids; avoid hypoglycemia, hypothermia and acidosis.',
      'Prolonged propofol infusion may risk propofol-infusion-like syndrome: single doses usually tolerated.',
      'Many avoid lactate-containing fluids; follow your metabolic team.'],
    rules: { 'Propofol': ['caution', 'Long infusions: theoretical PRIS risk'], 'Dextrose 10% (GIR)': ['prefer', 'Prevent catabolism and hypoglycemia'] } },
  { id: 'uri', name: 'Recent upper respiratory infection', kw: /\buri\b|\burti\b|common cold|runny nose|recent (cold|cough|flu)|upper respiratory/i,
    notes: ['Higher risk of laryngospasm, bronchospasm and desaturation, highest within about 2 weeks; consider postponing with fever, purulent secretions or chest signs.',
      'Prefer a supraglottic airway or face mask over an ETT when appropriate; ensure deep anesthesia before airway manipulation.',
      'Have succinylcholine and atropine ready for laryngospasm.'],
    rules: { 'Propofol': ['prefer', 'Reduces airway reactivity'], 'Sugammadex (moderate)': ['prefer', 'Avoids neostigmine-related secretions and bronchospasm'] } },
  { id: 'williams', name: 'Williams syndrome', kw: /williams/i,
    notes: ['Supravalvular aortic stenosis and coronary ostial narrowing: high risk of cardiac arrest at induction.',
      'Keep heart rate, preload and SVR stable; treat hypotension early. Recent echo and ECG, cardiology input; consider a cardiac anesthesia team.',
      'Check calcium (hypercalcemia); IV access can be difficult.'],
    rules: { 'Etomidate': ['prefer', 'Hemodynamically stable induction'], 'Propofol': ['caution', 'Hypotension can precipitate coronary ischemia'],
      'Ketamine IV': ['caution', 'Tachycardia raises myocardial O₂ demand'], 'Phenylephrine': ['prefer', 'Maintains SVR and coronary perfusion'] } },
  { id: 'hcm', name: 'Hypertrophic cardiomyopathy', kw: /hypertrophic cardiomyopathy|\bhocm\b|\bhcm\b|lvot obstruct/i,
    notes: ['Dynamic LV outflow obstruction worsens with tachycardia, hypovolemia, low SVR and increased contractility.',
      'Keep well hydrated, avoid tachycardia; treat hypotension with fluid and phenylephrine, not inotropes. Continue beta-blockers.'],
    rules: { 'Phenylephrine': ['prefer', 'Raises SVR without inotropy'], 'Esmolol': ['prefer', 'Slows heart rate, reduces obstruction'],
      'Ketamine IV': ['caution', 'Tachycardia worsens obstruction'], 'Propofol': ['caution', 'Lowers SVR'],
      'Epinephrine': ['caution', 'Inotropy worsens obstruction'], 'Epinephrine (push-dose)': ['caution', 'Inotropy worsens obstruction'],
      'Dobutamine': ['avoid', 'Worsens LVOT obstruction'], 'Isoproterenol': ['avoid', 'Worsens LVOT obstruction'], 'Milrinone': ['avoid', 'Inotropy and vasodilation worsen obstruction'],
      'Dopamine': ['caution', 'Inotropy and tachycardia'], 'Ephedrine': ['caution', 'Inotropy and tachycardia'] } },
  { id: 'dcm', name: 'Poor ventricular function / cardiomyopathy', kw: /dilated cardiomyopathy|\bdcm\b|myocarditis|poor (ventricular|lv|rv) function|heart failure|low ejection|reduced ejection/i,
    notes: ['High risk of cardiac arrest with induction: titrate slowly, avoid myocardial depressants and vasodilation.',
      'Have inotropes drawn up (or running) before induction; arterial line; ICU bed. Consider cardiac anesthesia and ECMO backup.'],
    rules: { 'Etomidate': ['prefer', 'Minimal myocardial depression'], 'Ketamine IV': ['prefer', 'Maintains contractility (use a reduced dose)'],
      'Propofol': ['caution', 'Myocardial depression and vasodilation'], 'Milrinone': ['prefer', 'Inodilator'], 'Epinephrine': ['prefer', 'Inotropic support'],
      'Dobutamine': ['prefer', 'Inotropic support'] } },
  { id: 'longqt', name: 'Long QT syndrome', kw: /long qt|\blqts\b|qt prolong/i,
    notes: ['Avoid QT-prolonging drugs and sympathetic surges (anxiety, light anesthesia, pain). Continue beta-blockers.',
      'Correct K⁺, Mg²⁺ and Ca²⁺; defibrillator pads on; magnesium ready for torsades.'],
    rules: { 'Ondansetron': ['caution', 'Prolongs QT'], 'Esmolol': ['prefer', 'Blunts sympathetic surges'], 'Ketamine IV': ['caution', 'Sympathetic stimulation'] } },
  { id: 'marfan', name: 'Marfan / aortic root dilation', kw: /marfan|loeys|aortic root/i,
    notes: ['Avoid hypertension and tachycardia (aortic dissection risk); continue beta-blocker or ARB.',
      'Possible cervical instability, high-arched palate and pneumothorax risk.'],
    rules: { 'Esmolol': ['prefer', 'Controls heart rate and BP'], 'Ketamine IV': ['caution', 'Tachycardia and hypertension'], 'Ephedrine': ['caution', 'Tachycardia and hypertension'] } },
  { id: 'pacer', name: 'Pacemaker / ICD', kw: /pacemaker|\bicd\b|implanted defibrillator|cardiac device/i,
    notes: ['Get device type, settings and pacing dependence; reprogram or use a magnet per cardiology. Prefer bipolar cautery.',
      'External pads on; have isoproterenol or epinephrine available if pacing fails.'],
    rules: { 'Isoproterenol': ['prefer', 'Backup chronotrope if pacing fails'] } },
  { id: 'sickle', name: 'Sickle cell disease', kw: /sickle|\bhbss\b|\bscd\b/i,
    notes: ['Avoid hypoxia, dehydration, hypothermia, acidosis and pain (crisis triggers); IV fluids during fasting.',
      'Plan preoperative hemoglobin and transfusion with hematology for moderate or major surgery.',
      'Postoperative incentive spirometry and good analgesia: watch for acute chest syndrome.'],
    rules: { 'Acetaminophen IV': ['prefer', 'Opioid-sparing'], 'Ketorolac IV': ['caution', 'Check renal function'] } },
  { id: 'bleeding', name: 'Bleeding disorder', kw: /hemophil|haemophil|von willebrand|bleeding disorder|thrombocytop|\bitp\b|coagulopath/i,
    notes: ['Factor or platelet replacement plan with hematology before surgery; avoid IM injections and NSAIDs.',
      'Neuraxial and deep blocks generally contraindicated until corrected.'],
    rules: { 'Ketorolac IV': ['avoid', 'Platelet dysfunction'], 'Ketamine IM': ['caution', 'IM injection: hematoma risk'], 'Succinylcholine IM': ['caution', 'IM injection: hematoma risk'] } },
  { id: 'liver', name: 'Liver disease', kw: /liver (disease|failure|transplant)|hepatic|hepatitis|cirrho|biliary atresia/i,
    notes: ['Check coagulation, glucose and albumin; reduced clearance of many drugs; possible portal hypertension and varices.'],
    rules: { 'Acetaminophen IV': ['caution', 'Reduce dose or frequency'], 'Midazolam IV': ['caution', 'Prolonged effect'], 'Morphine IV': ['caution', 'Prolonged effect'],
      'Cisatracurium': ['prefer', 'Organ-independent elimination'], 'Ketorolac IV': ['caution', 'Bleeding and renal risk'] } },
  { id: 't1dm', name: 'Type 1 diabetes', kw: /diabet|\bt1dm\b|\bdm1\b|insulin pump/i,
    notes: ['First on the list; insulin plan with endocrinology (usually reduced basal insulin).',
      'Check glucose before induction and hourly; glucose–insulin infusion for long cases. Watch for DKA.'],
    rules: { 'Dexamethasone': ['caution', 'Raises blood glucose'], 'Insulin (regular)': ['prefer', 'Glucose control'], 'Dextrose 10% (GIR)': ['prefer', 'With insulin to prevent hypoglycemia'],
      'Ondansetron': ['prefer', 'PONV prophylaxis without hyperglycemia'] } },
  { id: 'steroid', name: 'Adrenal insufficiency / steroid-dependent', kw: /adrenal insuff|addison|congenital adrenal|\bcah\b|steroid[- ]dependent|chronic steroid|on (prednis|hydrocort)/i,
    notes: ['Give stress-dose hydrocortisone per protocol (commonly 2 mg/kg IV, max 100 mg, at induction).',
      'Refractory hypotension or hypoglycemia: think adrenal crisis.'],
    rules: { 'Etomidate': ['caution', 'Suppresses adrenal steroid synthesis'] } },
  { id: 'epilepsy', name: 'Epilepsy / ketogenic diet', kw: /epilep|seizure|ketogenic|infantile spasm/i,
    notes: ['Continue antiseizure medicines on the day of surgery.',
      'Enzyme-inducing drugs (carbamazepine, phenytoin) shorten neuromuscular block and raise opioid needs.',
      'Ketogenic diet: avoid glucose-containing fluids unless hypoglycemic; check glucose and ketones.'],
    rules: { 'Dextrose 10% (GIR)': ['caution', 'Breaks ketosis if on ketogenic diet'], 'Rocuronium': ['caution', 'Shorter duration with enzyme inducers: monitor TOF'],
      'Midazolam IV': ['prefer', 'Seizure rescue'] } },
  { id: 'cp', name: 'Cerebral palsy', kw: /cerebral palsy|spastic quadripleg/i,
    notes: ['Reflux and aspiration risk; drooling; hypothermia; careful positioning with contractures.',
      'Continue antiseizure medicines and baclofen (abrupt baclofen withdrawal is dangerous).',
      'Succinylcholine is not contraindicated in cerebral palsy.'],
    rules: { 'Glycopyrrolate': ['prefer', 'Reduces secretions'] } },
  { id: 'myasthenia', name: 'Myasthenia gravis', kw: /myasthen/i,
    notes: ['Very sensitive to non-depolarizing relaxants (use small doses or avoid), resistant to succinylcholine.',
      'Continue pyridostigmine; plan for postoperative weakness and respiratory support.'],
    rules: { 'Rocuronium': ['caution', 'Marked sensitivity: use a fraction of the dose'], 'Vecuronium': ['caution', 'Marked sensitivity'], 'Cisatracurium': ['caution', 'Marked sensitivity'],
      'Succinylcholine IV': ['caution', 'Resistance: may need a higher dose'], 'Sugammadex (moderate)': ['prefer', 'Predictable reversal'], 'Sugammadex (deep)': ['prefer', 'Predictable reversal'],
      'Neostigmine': ['caution', 'Unpredictable response, cholinergic crisis risk'] } },
  { id: 'denervation', name: 'Burns / immobility / denervation', kw: /\bburns?\b|spinal cord injur|parapleg|quadripleg|tetrapleg|immobili[sz]|guillain|denervation|prolonged (icu|bed ?rest)/i,
    notes: ['Succinylcholine can cause lethal hyperkalemia from about 24–72 h after the injury until recovery.',
      'Burns: resistance to non-depolarizing relaxants, large fluid and opioid requirements, hypothermia.'],
    rules: { 'Succinylcholine IV': ['avoid', 'Hyperkalemia risk (upregulated receptors)'], 'Succinylcholine IM': ['avoid', 'Hyperkalemia risk (upregulated receptors)'],
      'Rocuronium': ['caution', 'Burns: may need a higher dose'] } },
  { id: 'fullstomach', name: 'Full stomach / aspiration risk', kw: /full stomach|\brsi\b|bowel obstruct|pyloric|intussus|not fasted|recent(ly)? (meal|ate|feed)|vomiting|trauma/i,
    notes: ['Rapid sequence (or modified RSI with gentle ventilation) induction; working suction; aspirate an NG tube if present.',
      'Pyloric stenosis is a medical emergency, not a surgical one: correct fluids and electrolytes first; postoperative apnea risk.'],
    rules: { 'Rocuronium RSI': ['prefer', 'Rapid onset'], 'Succinylcholine IV': ['prefer', 'Fastest onset (if no contraindication)'], 'Sugammadex (deep)': ['prefer', 'Have ready after RSI rocuronium'] } },
  { id: 'tonsilbleed', name: 'Bleeding tonsil', kw: /tonsil(lar)? (bleed|hemorrh|haemorrh)|post[- ]?tonsillectomy bleed|bleeding tonsil/i,
    notes: ['Hypovolemia is often underestimated: resuscitate and cross-match before induction.',
      'Full stomach of swallowed blood: RSI, two suctions, smaller ETT ready; experienced help and ENT present.'],
    rules: { 'Ketamine IV': ['prefer', 'Maintains BP in hypovolemia'], 'Etomidate': ['prefer', 'Hemodynamically stable'], 'Propofol': ['caution', 'Hypotension in hypovolemia'],
      'Rocuronium RSI': ['prefer', 'Rapid onset'] } },
  { id: 'icp', name: 'Raised intracranial pressure', kw: /intracranial|\bicp\b|head injur|\btbi\b|hydroceph|brain tumou?r|shunt (block|malfunction|failure)/i,
    notes: ['Avoid hypoxia, hypercarbia and hypotension (protect cerebral perfusion); head up 30°, neutral neck.',
      'Smooth induction and laryngoscopy; avoid coughing and straining.'],
    rules: { 'Propofol': ['prefer', 'Lowers ICP and cerebral metabolism (watch BP)'], 'Etomidate': ['prefer', 'Stable BP'], 'Ketamine IV': ['caution', 'Acceptable with controlled ventilation'] } },
  { id: 'airway', name: 'Difficult airway syndrome', kw: /pierre robin|treacher|goldenhar|micrognath|difficult airway|mucopolysacch|\bmps\b|hurler|hunter syndrome|klippel|limited mouth opening/i,
    notes: ['Plan A–D before induction; keep spontaneous ventilation until the airway is secured.',
      'Video laryngoscope and fiberoptic ready; supraglottic airway as rescue; ENT and front-of-neck plan available.',
      'Mucopolysaccharidoses: the airway worsens with age; possible cervical instability and heart disease.'],
    rules: { 'Ketamine IV': ['prefer', 'Preserves spontaneous breathing'], 'Rocuronium': ['caution', 'Give only once ventilation is assured or a rescue plan is ready'],
      'Succinylcholine IV': ['caution', 'Only within a planned airway strategy'], 'Midazolam IV': ['caution', 'Can worsen airway obstruction'],
      'Glycopyrrolate': ['prefer', 'Dries secretions for fiberoptic intubation'], 'Sugammadex (deep)': ['prefer', 'Have ready if rocuronium is used'] } },
  { id: 'mediastinal', name: 'Anterior mediastinal mass', kw: /mediastinal mass|anterior mediastin|lymphoma|t[- ]cell leuk/i,
    notes: ['Risk of complete airway and cardiovascular collapse at induction or with muscle relaxation.',
      'Review CT and echo; keep spontaneous ventilation and avoid relaxants; have position changes (lateral/prone) and rigid bronchoscopy ready. Consider ECMO standby or diagnosis under local anesthesia.'],
    rules: { 'Rocuronium': ['avoid', 'Loss of muscle tone can cause airway collapse'], 'Succinylcholine IV': ['avoid', 'Loss of muscle tone can cause airway collapse'],
      'Ketamine IV': ['prefer', 'Preserves spontaneous breathing'], 'Propofol': ['caution', 'Apnea and loss of airway tone'] } },
  { id: 'croup', name: 'Upper airway obstruction (croup, epiglottitis)', kw: /croup|epiglottitis|stridor|upper airway obstruct|retropharyngeal|bacterial tracheitis/i,
    notes: ['Keep the child calm with a parent; inhalational induction sitting up; ENT and surgical airway ready.',
      'Use an ETT 0.5–1 mm smaller than usual.'],
    rules: { 'Dexamethasone': ['prefer', 'Reduces airway edema (airway dose 0.5 mg/kg)'] } },
  { id: 'fb', name: 'Inhaled foreign body', kw: /foreign body|aspirated (a|an)|inhaled (a|an)|peanut in/i,
    notes: ['Shared airway with ENT for rigid bronchoscopy; agree on spontaneous vs controlled ventilation beforehand.',
      'Risk of moving the object into complete obstruction; consider dexamethasone for airway edema.'],
    rules: { 'Propofol': ['prefer', 'TIVA for a shared, open airway'], 'Dexamethasone': ['prefer', 'Reduces airway edema'] } },
  { id: 'cf', name: 'Cystic fibrosis', kw: /cystic fibrosis|\bcf\b/i,
    notes: ['Physiotherapy and bronchodilator before surgery; humidify gases; suction secretions.',
      'Check for liver disease and diabetes; prefer regional analgesia, limit opioids.'],
    rules: { 'Glycopyrrolate': ['caution', 'Thickens secretions'] } },
  { id: 'latex', name: 'Latex allergy / spina bifida', kw: /latex|spina bifida|myelomening/i,
    notes: ['Latex-free room and equipment; schedule as the first case.', 'Spina bifida carries a high risk of latex sensitization; check for VP shunt and Chiari malformation.'],
    rules: {} },
  { id: 'eggallergy', name: 'Egg / soy / peanut allergy', kw: /egg allerg|soy allerg|peanut allerg|allergic to (eggs?|soy|peanuts?)/i,
    notes: ['US allergy societies consider propofol safe in egg-, soy- and peanut-allergic children.'],
    rules: {} },
  { id: 'g6pd', name: 'G6PD deficiency', kw: /g6pd/i,
    notes: ['Avoid oxidant drugs: methylene blue (do not use it for methemoglobinemia), prilocaine, rasburicase, sulfonamides.',
      'Avoid infection, acidosis and hypothermia that trigger hemolysis.'],
    rules: {} },
  { id: 'porphyria', name: 'Acute porphyria', kw: /porphyri/i,
    notes: ['Avoid porphyrinogenic drugs (barbiturates; etomidate on many lists); keep well hydrated with glucose.'],
    rules: { 'Etomidate': ['caution', 'Possibly porphyrinogenic'], 'Propofol': ['prefer', 'Considered safe'] } },
  { id: 'eb', name: 'Epidermolysis bullosa', kw: /epidermolysis/i,
    notes: ['No adhesive tape or friction: pad and lubricate everything; secure lines and tubes with ties or non-adhesive dressings.',
      'Gentle mask; smaller ETT; avoid oral airways and nasal tubes where possible.'],
    rules: {} },
  { id: 'sepsis', name: 'Sepsis / shock', kw: /sepsis|septic|\bshock\b/i,
    notes: ['Resuscitate before induction; early vasoactive support (epinephrine or norepinephrine) via a secure line.',
      'Reduce induction doses; arterial line; check glucose and calcium.'],
    rules: { 'Ketamine IV': ['prefer', 'Maintains BP (reduced dose)'], 'Propofol': ['caution', 'Hypotension'], 'Etomidate': ['caution', 'Adrenal suppression in sepsis'],
      'Epinephrine': ['prefer', 'First-line vasoactive (cold shock)'], 'Norepinephrine': ['prefer', 'First-line vasoactive (warm shock)'] } },
  { id: 'anxiety', name: 'Anxiety / autism / uncooperative', kw: /autis|anxious|anxiety|uncooperative|behaviou?ral|developmental delay/i,
    notes: ['Quiet room, familiar routine and comfort items, parental presence; ask parents what works.',
      'Plan premedication; consider IM ketamine for a combative child.'],
    rules: { 'Dexmedetomidine IN': ['prefer', 'Needle-free premed'], 'Midazolam PO': ['prefer', 'Oral premed'], 'Ketamine IM': ['prefer', 'Uncooperative or combative child'] } }
];

// ───────────────────────── Pure helpers ─────────────────────────
// Sensible precision: big numbers whole, small numbers keep significant digits.
function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  let s;
  if (a >= 100) s = n.toFixed(0);
  else if (a >= 10) s = n.toFixed(1);
  else if (a >= 1) s = n.toFixed(2);
  else s = n.toFixed(3);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
const fmtVol = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

function dose(perKg, w, max) {
  const raw = perKg * w;
  const capped = max != null && raw > max;
  return { value: capped ? max : raw, capped };
}

function estimateWeight(ageYears) {
  if (ageYears == null) return null;
  const months = ageYears * 12;
  if (months < 12) return 0.5 * months + 4;
  if (ageYears <= 5) return 2 * ageYears + 8;
  if (ageYears <= 12) return 3 * ageYears + 7;
  return null; // APLS formula not valid above 12 y
}

const floorHalf = (x) => Math.floor(x * 2) / 2;

// Linear interpolation in the CDC table; null outside 2–20 y.
function bmiRef(sex, ageY) {
  const ages = BMI_CDC.ages;
  if (!sex || ageY == null || ageY < 2 || ageY > ages[ages.length - 1]) return null;
  const p50 = BMI_CDC[sex === 'male' ? 'm50' : 'f50'], p95 = BMI_CDC[sex === 'male' ? 'm95' : 'f95'];
  let i = 0;
  while (i < ages.length - 2 && ages[i + 1] < ageY) i++;
  const t = Math.min(Math.max((ageY - ages[i]) / (ages[i + 1] - ages[i]), 0), 1);
  return { p50: p50[i] + t * (p50[i + 1] - p50[i]), p95: p95[i] + t * (p95[i + 1] - p95[i]) };
}

