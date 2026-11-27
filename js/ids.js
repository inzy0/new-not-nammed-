// Member IDs: <DOMAIN>-<5 random chars><1 check char>, e.g. CARD-7K3QX4.
// Crockford base32 (no I, L, O, U) so IDs read aloud and type without confusion.
// The check char catches one-character typos and swapped neighbours.
// Final uniqueness is enforced by the server when accounts go live; in the browser it is a preview.

export const DOMAINS = [
  // code, label, Europe PMC query terms (used for the domain feed)
  ['ANES', 'Anaesthesiology', 'anesthesia OR anaesthesia OR anesthesiology'],
  ['CARD', 'Cardiology', 'cardiology OR cardiovascular OR "heart failure" OR arrhythmia'],
  ['CRIT', 'Critical care', '"critical care" OR "intensive care" OR sepsis'],
  ['DENT', 'Dentistry', 'dentistry OR dental OR periodontal OR oral health'],
  ['DERM', 'Dermatology', 'dermatology OR psoriasis OR eczema OR melanoma'],
  ['EMER', 'Emergency medicine', '"emergency medicine" OR "emergency department" OR trauma'],
  ['ENDO', 'Endocrinology', 'endocrinology OR diabetes OR thyroid OR obesity'],
  ['ENTO', 'ENT / Otorhinolaryngology', 'otolaryngology OR otorhinolaryngology OR hearing loss OR sinusitis'],
  ['FMED', 'Family medicine / General practice', '"primary care" OR "general practice" OR "family medicine"'],
  ['GAST', 'Gastroenterology & Hepatology', 'gastroenterology OR hepatology OR "inflammatory bowel" OR cirrhosis'],
  ['GENE', 'Medical genetics', '"medical genetics" OR "genetic testing" OR "rare disease" OR genomic medicine'],
  ['GERI', 'Geriatrics', 'geriatric OR "older adults" OR frailty OR dementia care'],
  ['HAEM', 'Haematology', 'hematology OR haematology OR anemia OR leukemia OR lymphoma'],
  ['IDIS', 'Infectious diseases', '"infectious disease" OR tuberculosis OR HIV OR malaria OR antimicrobial resistance'],
  ['IMED', 'Internal medicine', '"internal medicine" OR multimorbidity OR hospital medicine'],
  ['NEPH', 'Nephrology', 'nephrology OR "chronic kidney disease" OR dialysis'],
  ['NEUR', 'Neurology', 'neurology OR stroke OR epilepsy OR "multiple sclerosis" OR parkinson'],
  ['NURS', 'Nursing', 'nursing OR nurse-led OR "nursing care"'],
  ['NUTR', 'Nutrition & Dietetics', 'nutrition OR dietetics OR "dietary intervention"'],
  ['OBGY', 'Obstetrics & Gynaecology', 'obstetrics OR gynecology OR pregnancy OR maternal health'],
  ['OCCU', 'Occupational therapy', '"occupational therapy"'],
  ['ONCO', 'Oncology', 'oncology OR cancer OR tumour OR chemotherapy OR immunotherapy'],
  ['OPHT', 'Ophthalmology', 'ophthalmology OR glaucoma OR retina OR cataract'],
  ['ORTH', 'Orthopaedics', 'orthopedic OR orthopaedic OR fracture OR arthroplasty'],
  ['PAED', 'Paediatrics & Neonatology', 'pediatric OR paediatric OR neonatal OR child health'],
  ['PALL', 'Palliative care', '"palliative care" OR "end of life" OR hospice'],
  ['PATH', 'Pathology & Lab medicine', 'pathology OR histopathology OR "laboratory medicine"'],
  ['PHAR', 'Pharmacy & Pharmacology', 'pharmacology OR pharmacy OR "adverse drug" OR pharmacovigilance'],
  ['PHYS', 'Physiotherapy & Rehabilitation', 'physiotherapy OR "physical therapy" OR rehabilitation'],
  ['PSYC', 'Psychiatry & Mental health', 'psychiatry OR depression OR schizophrenia OR "mental health"'],
  ['PUBH', 'Public health & Epidemiology', '"public health" OR epidemiology OR "health policy"'],
  ['PULM', 'Pulmonology', 'pulmonology OR asthma OR COPD OR "respiratory disease"'],
  ['RADI', 'Radiology & Imaging', 'radiology OR imaging OR MRI OR "computed tomography"'],
  ['RHEU', 'Rheumatology', 'rheumatology OR "rheumatoid arthritis" OR lupus OR gout'],
  ['RSCH', 'Biomedical research', '"translational research" OR "clinical trial methodology" OR biomedical'],
  ['SPRT', 'Sports & Exercise medicine', '"sports medicine" OR "exercise training" OR athletes'],
  ['SURG', 'Surgery', 'surgery OR surgical OR laparoscopic OR perioperative'],
  ['UROL', 'Urology', 'urology OR prostate OR "urinary tract" OR kidney stones'],
  ['STUD', 'Student (medical / allied)', '"medical education" OR "medical students" OR curriculum'],
  ['ALLD', 'Allied health (other)', '"allied health" OR paramedic OR "speech therapy"'],
];

export const domainByCode = code => DOMAINS.find(d => d[0] === code);

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const CHECK = ALPHA + '*~$=U';                  // Crockford check symbols (mod 37)

function checkChar(body) {
  let n = 0n;
  for (const c of body) n = n * 32n + BigInt(ALPHA.indexOf(c));
  return CHECK[Number(n % 37n)];
}

export function newId(code) {
  if (!domainByCode(code)) throw new Error('Unknown domain ' + code);
  const b = new Uint8Array(5); crypto.getRandomValues(b);
  const body = Array.from(b, x => ALPHA[x & 31]).join('');
  return `${code}-${body}${checkChar(body)}`;
}

export function parseId(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  const m = s.match(/^([A-Z]{4})-([0-9A-HJKMNP-TV-Z]{5})([0-9A-HJKMNP-TV-Z*~$=U])$/);
  if (!m) return { ok: false, reason: 'Format is DOMAIN-XXXXXC, e.g. CARD-7K3QX4' };
  const d = domainByCode(m[1]);
  if (!d) return { ok: false, reason: `Unknown domain code ${m[1]}` };
  if (checkChar(m[2]) !== m[3]) return { ok: false, reason: 'Check character does not match: probably a typo' };
  return { ok: true, id: `${m[1]}-${m[2]}${m[3]}`, code: m[1], domain: d[1] };
}
